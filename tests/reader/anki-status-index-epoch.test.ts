import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { AnkiStatusIndex } from '../../src/reader/anki/types';
import { installFreshManagedStateEpochSessionForTests } from '../../src/reader/app/managed-state-epoch';

const DB_NAME = 'yomu-anki-status-index';
const EPOCH_KEY = 'yomu:state-epoch';

function installGmStore(values: Map<string, unknown>): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
}

afterEach(async () => {
    await deleteDatabase(DB_NAME);
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

describe('Anki status index managed-state epoch', () => {
    it('upgrades the legacy database so a pre-epoch writer cannot reopen version one', async () => {
        const legacyDb = await openLegacyAnkiStatusIndexDb();
        legacyDb.close();
        const values = new Map<string, unknown>([[EPOCH_KEY, {
            version: 1, generation: 1, resetId: 'factory-reset', committedAt: 1_000,
        }]]);
        installGmStore(values);
        const current = await import('../../src/reader/anki/status-index');

        const currentDb = await current.openAnkiStatusIndexDb();
        currentDb.close();

        await expect(openDatabaseAtVersion(DB_NAME, 1)).rejects.toMatchObject({ name: 'VersionError' });
    });

    it('clears a retained generation-zero index before generation-one reads', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const legacy = await import('../../src/reader/anki/status-index');
        const index: AnkiStatusIndex = {
            version: 1,
            settingsKey: 'test-settings',
            syncedAt: 100,
            checkedAt: 100,
            cardCount: 1,
            entries: {
                '読む': {
                    state: 'known',
                    noteId: 1,
                    primaryCardId: 10,
                    deckNames: ['Japanese'],
                    reps: 3,
                    lapses: 0,
                    modelName: 'Japanese',
                },
            },
        };
        await legacy.saveAnkiStatusIndex(index);
        await expect(legacy.loadAnkiStatusIndexFromIndexedDb()).resolves.toMatchObject({ entryCount: 1 });

        values.set(EPOCH_KEY, {
            version: 1, generation: 1, resetId: 'factory-reset', committedAt: 1_000,
        });
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebooted = await import('../../src/reader/anki/status-index');

        await expect(rebooted.loadAnkiStatusIndexFromIndexedDb()).resolves.toBeNull();
        await expect(rebooted.loadAnkiStatusIndexEntriesFromIndexedDb(['読む'])).resolves.toEqual(new Map());
    });

    it('does not let a delayed generation-zero reconciliation erase generation-one data or roll back its marker', async () => {
        const values = new Map<string, unknown>();
        installGmStore(values);
        const legacy = await import('../../src/reader/anki/status-index');
        const delayedOpen = delayNextDatabaseOpenSuccess();
        const staleOpen = legacy.openAnkiStatusIndexDb();
        await delayedOpen.ready;

        values.set(EPOCH_KEY, {
            version: 1, generation: 1, resetId: 'factory-reset', committedAt: 1_000,
        });
        installFreshManagedStateEpochSessionForTests();
        vi.resetModules();
        const rebooted = await import('../../src/reader/anki/status-index');
        const current: AnkiStatusIndex = {
            version: 1,
            settingsKey: 'current-settings',
            syncedAt: 200,
            checkedAt: 200,
            cardCount: 1,
            entries: {
                '守る': {
                    state: 'known',
                    noteId: 2,
                    primaryCardId: 20,
                    deckNames: ['Japanese'],
                    reps: 4,
                    lapses: 0,
                    modelName: 'Japanese',
                },
            },
        };
        await rebooted.saveAnkiStatusIndex(current);
        await expect(rebooted.loadAnkiStatusIndexFromIndexedDb()).resolves.toMatchObject({
            settingsKey: 'current-settings', entryCount: 1,
        });

        delayedOpen.release();
        await expect(staleOpen).rejects.toThrow('newer managed-state epoch');

        await expect(rebooted.loadAnkiStatusIndexFromIndexedDb()).resolves.toMatchObject({
            settingsKey: 'current-settings', entryCount: 1,
        });
        await expect(rebooted.loadAnkiStatusIndexEntriesFromIndexedDb(['守る'])).resolves.toEqual(new Map([
            ['守る', expect.objectContaining({ noteId: 2 })],
        ]));
        await expect(readDatabaseStoreValue('meta', '__yomu-managed-state-epoch__')).resolves.toMatchObject({
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

function readDatabaseStoreValue(storeName: string, key: IDBValidKey): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);
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

function openLegacyAnkiStatusIndexDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('meta', { keyPath: 'id' });
            request.result.createObjectStore('entries', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
    });
}

function openDatabaseAtVersion(name: string, version: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
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
