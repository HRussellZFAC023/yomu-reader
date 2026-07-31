import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { yomitanZipBlob } from './zip-fixture';
import type { YomitanTermEntry } from '../../src/reader/dictionaries/yomitan/types';
import { installFreshManagedStateEpochSessionForTests } from '../../src/reader/app/managed-state-epoch';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const EPOCH_KEY = 'yomu:state-epoch';
const activeStores: Array<{ invalidateForFactoryReset(): Promise<void> }> = [];

function installGmStore(values: Map<string, unknown>): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
}

function epoch(): Record<string, unknown> {
    return { version: 1, generation: 1, resetId: 'factory-reset', committedAt: 1_000 };
}

afterEach(async () => {
    for (const store of activeStores.splice(0)) await store.invalidateForFactoryReset().catch(() => undefined);
    await deleteDatabase(DB_NAME);
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('Yomitan managed-state epoch', () => {
    it('clears a retained generation-zero dictionary before the first generation-one read', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const legacyModule = await import('../../src/reader/dictionaries/yomitan');
        const legacyStore = new legacyModule.YomitanDictionaryStore();
        activeStores.push(legacyStore);
        await legacyStore.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Retained Dictionary', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, '']],
        })], 'retained.zip', { type: 'application/zip' }));
        await expect(legacyStore.summary()).resolves.toMatchObject({ terms: 1 });
        await legacyStore.invalidateForFactoryReset();

        values.set(EPOCH_KEY, epoch());
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebootedModule = await import('../../src/reader/dictionaries/yomitan');
        const rebootedStore = new rebootedModule.YomitanDictionaryStore();
        activeStores.push(rebootedStore);

        await expect(rebootedStore.summary()).resolves.toEqual({
            dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0,
        });
    });

    it('rejects an import that crossed the reset epoch while file validation was delayed', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const { sha256Hex } = await import('../../src/reader/dictionaries/catalog');
        const module = await import('../../src/reader/dictionaries/yomitan');
        const store = new module.YomitanDictionaryStore();
        activeStores.push(store);
        const file = new File([yomitanZipBlob({
            'index.json': { title: 'Delayed Dictionary', format: 3 },
            'term_bank_1.json': [['書く', 'かく', '', 'v5k', 10, ['to write'], 1, '']],
        })], 'delayed.zip', { type: 'application/zip' });
        const fileBytes = await readBlobArrayBuffer(file);
        const digest = await sha256Hex(fileBytes);
        let releaseValidation!: () => void;
        const validationGate = new Promise<void>(resolve => { releaseValidation = resolve; });
        let markValidationStarted!: () => void;
        const validationStarted = new Promise<void>(resolve => { markValidationStarted = resolve; });
        Object.defineProperty(file, 'arrayBuffer', {
            configurable: true,
            value: vi.fn(async () => {
                markValidationStarted();
                await validationGate;
                return fileBytes.slice(0);
            }),
        });

        const importing = store.importFile(file, undefined, 'https://example.com/delayed.zip', {
            integrity: { sha256: digest, bytes: file.size },
        });
        await validationStarted;
        values.set(EPOCH_KEY, epoch());
        releaseValidation();

        await expect(importing).rejects.toMatchObject({ name: 'StaleManagedStateEpochError' });
    });

    it.each(['termSearch', 'termKanji'] as const)(
        'does not let a stale captured chunk repopulate %s after epoch reconciliation',
        async indexStore => {
            const values = new Map<string, unknown>();
            installGmStore(values);
            const legacyModule = await import('../../src/reader/dictionaries/yomitan');
            const legacyStore = new legacyModule.YomitanDictionaryStore();
            activeStores.push(legacyStore);
            await legacyStore.importFile(new File([yomitanZipBlob({
                'index.json': { title: 'Retained Dictionary', format: 3 },
                'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, '']],
            })], 'retained.zip', { type: 'application/zip' }), undefined, '', { persistArchive: false });

            type DerivedIndexWriter = (
                db: IDBDatabase,
                storeName: 'termSearch' | 'termKanji',
                terms: YomitanTermEntry[],
                rowsForTerm: (term: YomitanTermEntry) => unknown[],
            ) => Promise<void>;
            const internals = legacyStore as unknown as { addDerivedTermIndexChunk: DerivedIndexWriter };
            const originalWriter = internals.addDerivedTermIndexChunk.bind(legacyStore);
            let releaseCapturedChunk!: () => void;
            const capturedChunkGate = new Promise<void>(resolve => { releaseCapturedChunk = resolve; });
            let markChunkCaptured!: () => void;
            const chunkCaptured = new Promise<void>(resolve => { markChunkCaptured = resolve; });
            let staleWriteError: unknown;
            internals.addDerivedTermIndexChunk = async (db, storeName, terms, rowsForTerm) => {
                if (storeName === indexStore) {
                    markChunkCaptured();
                    await capturedChunkGate;
                }
                try {
                    await originalWriter(db, storeName, terms, rowsForTerm);
                } catch (error) {
                    staleWriteError = error;
                    throw error;
                }
            };

            const rebuilding = indexStore === 'termSearch'
                ? legacyStore.prepareTermSearchIndex()
                : legacyStore.lookupSimilarTermsByKanji('読', 5).then(() => undefined);
            await chunkCaptured;

            values.set(EPOCH_KEY, epoch());
            installFreshManagedStateEpochSessionForTests();
            vi.resetModules();
            const rebootedModule = await import('../../src/reader/dictionaries/yomitan');
            const rebootedStore = new rebootedModule.YomitanDictionaryStore();
            activeStores.push(rebootedStore);
            await expect(rebootedStore.summary()).resolves.toMatchObject({ dictionaries: [], terms: 0 });
            await expect(countDatabaseStore(indexStore)).resolves.toBe(0);

            releaseCapturedChunk();
            await rebuilding.catch(() => undefined);

            expect(staleWriteError).toMatchObject({ name: 'StaleManagedStateEpochError' });
            await expect(countDatabaseStore(indexStore)).resolves.toBe(0);
        },
    );

    it('does not let a delayed generation-zero reconciliation erase generation-one data or roll back its marker', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const legacyModule = await import('../../src/reader/dictionaries/yomitan');
        const legacyStore = new legacyModule.YomitanDictionaryStore();
        activeStores.push(legacyStore);
        const delayedOpen = delayNextDatabaseOpenSuccess();
        const staleOpen = legacyStore.summary();
        await delayedOpen.ready;

        values.set(EPOCH_KEY, epoch());
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebootedModule = await import('../../src/reader/dictionaries/yomitan');
        const rebootedStore = new rebootedModule.YomitanDictionaryStore();
        activeStores.push(rebootedStore);
        await rebootedStore.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Current Dictionary', format: 3 },
            'term_bank_1.json': [['守る', 'まもる', '', 'v5r', 10, ['to protect'], 1, '']],
        })], 'current.zip', { type: 'application/zip' }), undefined, '', { persistArchive: false });
        await expect(rebootedStore.summary()).resolves.toMatchObject({ terms: 1 });

        delayedOpen.release();
        await expect(staleOpen).rejects.toThrow('newer managed-state epoch');

        rebootedStore.invalidateCaches();
        await expect(rebootedStore.summary()).resolves.toMatchObject({
            dictionaries: [expect.objectContaining({ title: 'Current Dictionary' })],
            terms: 1,
        });
        await expect(readDatabaseStoreValue('managedState', 'epoch')).resolves.toMatchObject({
            token: '1:factory-reset',
        });
    });
});

function deleteDatabase(name: string): Promise<void> {
    return new Promise(resolve => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

function countDatabaseStore(storeName: 'termSearch' | 'termKanji'): Promise<number> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 6);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const count = db.transaction(storeName, 'readonly').objectStore(storeName).count();
            count.onsuccess = () => {
                db.close();
                resolve(count.result);
            };
            count.onerror = () => {
                db.close();
                reject(count.error);
            };
        };
    });
}

function readDatabaseStoreValue(storeName: string, key: IDBValidKey): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 6);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result;
            const value = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            value.onsuccess = () => {
                db.close();
                resolve(value.result);
            };
            value.onerror = () => {
                db.close();
                reject(value.error);
            };
        };
    });
}

function delayNextDatabaseOpenSuccess(): { ready: Promise<void>; release: () => void } {
    const factory = indexedDB;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let markReady!: () => void;
    const ready = new Promise<void>(resolve => { markReady = resolve; });
    let shouldDelay = true;
    const delayedFactory = new Proxy(factory, {
        get(target, property) {
            if (property === 'open') {
                return (name: string, version?: number) => {
                    const request = version === undefined ? target.open(name) : target.open(name, version);
                    if (!shouldDelay) return request;
                    shouldDelay = false;
                    let onSuccess: ((this: IDBOpenDBRequest, event: Event) => unknown) | null = null;
                    const delayedRequest = new Proxy(request, {
                        get(requestTarget, requestProperty) {
                            return Reflect.get(requestTarget, requestProperty, requestTarget);
                        },
                        set(requestTarget, requestProperty, value) {
                            if (requestProperty === 'onsuccess') {
                                onSuccess = value as typeof onSuccess;
                                requestTarget.onsuccess = event => {
                                    markReady();
                                    void gate.then(() => onSuccess?.call(delayedRequest, event));
                                };
                                return true;
                            }
                            return Reflect.set(requestTarget, requestProperty, value, requestTarget);
                        },
                    });
                    return delayedRequest;
                };
            }
            const value = Reflect.get(target, property, target) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
    vi.stubGlobal('indexedDB', delayedFactory);
    return { ready, release };
}
