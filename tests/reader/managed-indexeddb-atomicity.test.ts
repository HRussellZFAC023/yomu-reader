import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { ManagedStateEpoch } from '../../src/reader/app/managed-state-epoch';
import type { StoredAnkiStatusIndexEntry, StoredAnkiStatusIndexMeta } from '../../src/reader/anki/types';

const epochHarness = vi.hoisted(() => {
    type Epoch = { version: 1; generation: number; resetId: string; committedAt: number };
    const legacy: Epoch = { version: 1, generation: 0, resetId: 'legacy', committedAt: 0 };
    let current = legacy;
    let nextInterleaving: (() => Promise<void>) | undefined;
    const assertAllowed = vi.fn(async () => {
        const captured = current;
        const interleaving = nextInterleaving;
        nextInterleaving = undefined;
        if (interleaving) await interleaving();
        return captured;
    });
    return {
        assertAllowed,
        interleaveNext(task: () => Promise<void>) { nextInterleaving = task; },
        reset() {
            current = legacy;
            nextInterleaving = undefined;
            assertAllowed.mockClear();
        },
        setCurrent(epoch: Epoch) { current = epoch; },
    };
});

const YOMITAN_TEST_DB = 'yomu-managed-indexeddb-atomicity';
const ANKI_DB = 'yomu-anki-status-index';
const EPOCH_ONE: ManagedStateEpoch = {
    version: 1,
    generation: 1,
    resetId: 'factory-reset',
    committedAt: 1_000,
};
const activeConnections = new Set<IDBDatabase>();
let yomitanManagedState!: typeof import('../../src/reader/dictionaries/yomitan/managed-state');
let ankiStatusIndex!: typeof import('../../src/reader/anki/status-index');

beforeAll(async () => {
    vi.resetModules();
    vi.doMock('../../src/reader/app/storage', async importOriginal => ({
        ...await importOriginal<typeof import('../../src/reader/app/storage')>(),
        assertManagedStateMutationAllowed: epochHarness.assertAllowed,
    }));
    yomitanManagedState = await import('../../src/reader/dictionaries/yomitan/managed-state');
    ankiStatusIndex = await import('../../src/reader/anki/status-index');
});

afterAll(() => vi.doUnmock('../../src/reader/app/storage'));

beforeEach(() => epochHarness.reset());

afterEach(async () => {
    for (const db of activeConnections) db.close();
    activeConnections.clear();
    await Promise.all([deleteDatabase(YOMITAN_TEST_DB), deleteDatabase(ANKI_DB)]);
    localStorage.clear();
    sessionStorage.clear();
});

describe('managed IndexedDB atomic epoch fence', () => {
    const yomitanCases: Array<{
        name: string;
        storeName: 'terms' | 'dictionaryInfo' | 'termSearch';
        staleMutation: (tx: IDBTransaction) => void;
        freshMutation: (tx: IDBTransaction) => void;
        expected: unknown[];
    }> = [
        {
            name: 'Yomitan base add',
            storeName: 'terms',
            staleMutation: tx => { tx.objectStore('terms').put({ id: 2, value: 'stale-add' }); },
            freshMutation: tx => { tx.objectStore('terms').put({ id: 1, value: 'current-add' }); },
            expected: [{ id: 1, value: 'current-add' }],
        },
        {
            name: 'Yomitan base clear',
            storeName: 'terms',
            staleMutation: tx => { tx.objectStore('terms').clear(); },
            freshMutation: tx => { tx.objectStore('terms').put({ id: 1, value: 'current-clear' }); },
            expected: [{ id: 1, value: 'current-clear' }],
        },
        {
            name: 'Yomitan dictionaryInfo delete',
            storeName: 'dictionaryInfo',
            staleMutation: tx => { tx.objectStore('dictionaryInfo').delete('Current Dictionary'); },
            freshMutation: tx => { tx.objectStore('dictionaryInfo').put({ title: 'Current Dictionary', value: 'current-delete' }); },
            expected: [{ title: 'Current Dictionary', value: 'current-delete' }],
        },
        {
            name: 'Yomitan derived chunk',
            storeName: 'termSearch',
            staleMutation: tx => { tx.objectStore('termSearch').put({ id: 2, value: 'stale-derived' }); },
            freshMutation: tx => { tx.objectStore('termSearch').put({ id: 1, value: 'current-derived' }); },
            expected: [{ id: 1, value: 'current-derived' }],
        },
    ];

    it.each(yomitanCases)('$name aborts after a fresh reconciliation wins the preflight/transaction gap', async testCase => {
        const db = await openYomitanTestDb();
        await yomitanManagedState.reconcileYomitanManagedStateEpoch(db, legacyEpoch());
        epochHarness.interleaveNext(async () => {
            epochHarness.setCurrent(EPOCH_ONE);
            await yomitanManagedState.reconcileYomitanManagedStateEpoch(db, EPOCH_ONE);
            await yomitanManagedState.runYomitanManagedStateWrite(db, testCase.storeName, testCase.freshMutation);
        });

        const staleError = await yomitanManagedState.runYomitanManagedStateWrite(
            db,
            testCase.storeName,
            testCase.staleMutation,
        ).then(() => null, error => error as Error);
        expect({
            error: staleError?.message ?? null,
            marker: await readValue(db, 'managedState', 'epoch'),
            assertions: epochHarness.assertAllowed.mock.calls.length,
        }).toMatchObject({ error: expect.stringContaining('marker is stale') });

        await expect(readAll(db, testCase.storeName)).resolves.toEqual(testCase.expected);
        await expect(readValue(db, 'managedState', 'epoch')).resolves.toMatchObject({
            token: '1:factory-reset',
        });
    });

    it('fails closed before mutation when a present Yomitan marker record is malformed', async () => {
        const db = await openYomitanTestDb();
        await yomitanManagedState.reconcileYomitanManagedStateEpoch(db, legacyEpoch());
        await rawWrite(db, ['managedState', 'terms'], tx => {
            tx.objectStore('managedState').put({ key: 'epoch', token: 7 });
            tx.objectStore('terms').put({ id: 1, value: 'untouched' });
        });

        await expect(yomitanManagedState.runYomitanManagedStateWrite(db, 'terms', tx => {
            tx.objectStore('terms').clear();
        })).rejects.toThrow('missing or malformed');

        await expect(readAll(db, 'terms')).resolves.toEqual([{ id: 1, value: 'untouched' }]);
        await expect(readValue(db, 'managedState', 'epoch')).resolves.toMatchObject({ token: 7 });
    });

    it('does not let generation-zero reconciliation overwrite a present malformed marker', async () => {
        const db = await openYomitanTestDb();
        await rawWrite(db, ['managedState', 'terms'], tx => {
            tx.objectStore('managedState').put({ key: 'epoch', token: 7 });
            tx.objectStore('terms').put({ id: 1, value: 'untouched' });
        });

        await expect(yomitanManagedState.reconcileYomitanManagedStateEpoch(
            db,
            legacyEpoch(),
        )).rejects.toThrow('malformed managed-state epoch');

        await expect(readAll(db, 'terms')).resolves.toEqual([{ id: 1, value: 'untouched' }]);
        await expect(readValue(db, 'managedState', 'epoch')).resolves.toMatchObject({ token: 7 });
    });

    it('atomically rejects a stale Anki meta write after generation-one data wins', async () => {
        const staleDb = await trackedAnkiDb();
        const currentMeta = ankiMeta('current-settings');
        await interleaveAnkiWrite(
            staleDb,
            freshDb => ankiStatusIndex.putAnkiStatusIndexMeta(freshDb, currentMeta),
            () => ankiStatusIndex.putAnkiStatusIndexMeta(staleDb, ankiMeta('stale-settings')),
        );

        await expect(readValue(staleDb, 'meta', 'current')).resolves.toEqual(currentMeta);
        await expectAnkiEpochOne(staleDb);
    });

    it('atomically rejects a stale Anki entry write after generation-one data wins', async () => {
        const staleDb = await trackedAnkiDb();
        const currentEntry = ankiEntry('守る', 2);
        await interleaveAnkiWrite(
            staleDb,
            freshDb => ankiStatusIndex.putBestAnkiStatusIndexEntries(freshDb, [currentEntry]),
            () => ankiStatusIndex.putBestAnkiStatusIndexEntries(staleDb, [ankiEntry('守る', 99, 'failed')]),
        );

        await expect(readValue(staleDb, 'entries', '守る')).resolves.toEqual(currentEntry);
        await expectAnkiEpochOne(staleDb);
    });

    it('atomically rejects a stale Anki clear after generation-one meta and entries win', async () => {
        const staleDb = await trackedAnkiDb();
        const currentMeta = ankiMeta('current-settings');
        const currentEntry = ankiEntry('守る', 2);
        await interleaveAnkiWrite(
            staleDb,
            async freshDb => {
                await ankiStatusIndex.putAnkiStatusIndexMeta(freshDb, currentMeta);
                await ankiStatusIndex.putBestAnkiStatusIndexEntries(freshDb, [currentEntry]);
            },
            () => ankiStatusIndex.clearAnkiStatusIndexStores(staleDb),
        );

        await expect(readValue(staleDb, 'meta', 'current')).resolves.toEqual(currentMeta);
        await expect(readValue(staleDb, 'entries', '守る')).resolves.toEqual(currentEntry);
        await expectAnkiEpochOne(staleDb);
    });
});

async function interleaveAnkiWrite(
    staleDb: IDBDatabase,
    freshWrite: (db: IDBDatabase) => Promise<void>,
    staleWrite: () => Promise<void>,
): Promise<void> {
    epochHarness.interleaveNext(async () => {
        epochHarness.setCurrent(EPOCH_ONE);
        const freshDb = await trackedAnkiDb();
        try {
            await freshWrite(freshDb);
        } finally {
            freshDb.close();
            activeConnections.delete(freshDb);
        }
    });
    await expect(staleWrite()).rejects.toThrow('marker is stale');
    expect(staleDb.objectStoreNames).toContain('meta');
}

async function expectAnkiEpochOne(db: IDBDatabase): Promise<void> {
    await expect(readValue(db, 'meta', '__yomu-managed-state-epoch__')).resolves.toMatchObject({
        token: '1:factory-reset',
    });
}

async function trackedAnkiDb(): Promise<IDBDatabase> {
    const db = await ankiStatusIndex.openAnkiStatusIndexDb();
    activeConnections.add(db);
    return db;
}

function ankiMeta(settingsKey: string): StoredAnkiStatusIndexMeta {
    return {
        id: 'current',
        version: 1,
        settingsKey,
        syncedAt: 100,
        checkedAt: 100,
        cardCount: 1,
        entryCount: 1,
        entryStore: 'indexeddb',
        entries: {},
    };
}

function ankiEntry(
    key: string,
    noteId: number,
    state: StoredAnkiStatusIndexEntry['entry']['state'] = 'known',
): StoredAnkiStatusIndexEntry {
    return {
        key,
        entry: {
            state,
            noteId,
            primaryCardId: noteId * 10,
            deckNames: ['Japanese'],
            reps: 3,
            lapses: 0,
            modelName: 'Japanese',
        },
    };
}

function legacyEpoch(): ManagedStateEpoch {
    return { version: 1, generation: 0, resetId: 'legacy', committedAt: 0 };
}

function openYomitanTestDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(YOMITAN_TEST_DB, 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            const db = request.result;
            yomitanManagedState.ensureYomitanManagedStateStore(db);
            db.createObjectStore('terms', { keyPath: 'id' });
            db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            db.createObjectStore('termSearch', { keyPath: 'id' });
        };
        request.onsuccess = () => {
            activeConnections.add(request.result);
            resolve(request.result);
        };
    });
}

function readAll(db: IDBDatabase, storeName: string): Promise<unknown[]> {
    return idbRequest(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

function readValue(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<unknown> {
    return idbRequest(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function rawWrite(db: IDBDatabase, stores: string[], mutate: (tx: IDBTransaction) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        mutate(tx);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

function deleteDatabase(name: string): Promise<void> {
    return new Promise(resolve => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}
