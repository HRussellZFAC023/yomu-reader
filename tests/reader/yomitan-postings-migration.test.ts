import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

// v7 replaced the derived termSearch/termKanji rows with id postings. The
// upgrade must reclaim the old full-row clones WITHOUT touching the imported
// dictionaries themselves: a learner who spent an hour importing Jitendex must
// not find an empty shelf after an update. The derived stores rebuild lazily
// from `terms`, so clearing them is free; clearing `terms` would not be.
const DB_NAME = 'jpdb-popup-reader-yomitan';
const DICTIONARY = 'Legacy Clone Dictionary';
const activeStores: Array<{ invalidateForFactoryReset(): Promise<void> }> = [];

function installGmStore(values: Map<string, unknown>): void {
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
    vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, value); }));
    vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
    vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));
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

describe('Yomitan v6 to v7 derived-index migration', () => {
    it('keeps imported dictionaries and drops the full-row derived clones', async () => {
        installGmStore(new Map<string, unknown>());
        await createVersionSixDatabase();
        await expect(countStore('termSearch')).resolves.toBe(2);
        await expect(countStore('termKanji')).resolves.toBe(1);

        const module = await import('../../src/reader/dictionaries/yomitan');
        const store = new module.YomitanDictionaryStore();
        activeStores.push(store);

        // The dictionary survives the upgrade: same title, same term, and the
        // glossary still answers a lookup.
        await expect(store.summary()).resolves.toMatchObject({
            dictionaries: [expect.objectContaining({ title: DICTIONARY })],
            terms: 1,
        });
        await expect(store.lookup('山猫', 'やまねこ', 5)).resolves.toMatchObject([
            { dictionary: DICTIONARY, glossary: ['wildcat'] },
        ]);

        // The v6 clones are gone rather than left to be read as postings --
        // a full-row clone has no termId, so keeping them would return nothing
        // while still occupying their bytes.
        await expect(countStore('termSearch')).resolves.toBe(0);
        await expect(countStore('termKanji')).resolves.toBe(0);
    });

    it('rebuilds the derived indexes as postings after the upgrade', async () => {
        installGmStore(new Map<string, unknown>());
        await createVersionSixDatabase();

        const module = await import('../../src/reader/dictionaries/yomitan');
        const store = new module.YomitanDictionaryStore();
        activeStores.push(store);
        await store.prepareTermSearchIndex();

        // Glossary search and the kanji index both work again, which is only
        // possible if the rebuild ran against the surviving `terms` rows.
        await expect(store.searchTerms('wildcat', 5)).resolves.toMatchObject([{ expression: '山猫' }]);
        await expect(store.lookupSimilarTermsByKanji('猫', 5)).resolves.toMatchObject([{ expression: '山猫' }]);

        for (const row of [...await readStore('termSearch'), ...await readStore('termKanji')]) {
            expect(row).not.toHaveProperty('glossary');
            expect(row).not.toHaveProperty('expression');
            expect(typeof row.termId).toBe('number');
        }
    });
});

/**
 * A version-6 database: the same stores and indexes v7 uses, but every derived
 * row is a full copy of its term the way v6 wrote them (glossary and all, no
 * termId). The managedState store exists and carries no epoch marker, which is
 * what a pre-reset install looks like.
 */
function createVersionSixDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 6);
        request.onupgradeneeded = () => {
            const db = request.result;
            const terms = db.createObjectStore('terms', { keyPath: 'id', autoIncrement: true });
            terms.createIndex('expression', 'expression');
            terms.createIndex('reading', 'reading');
            terms.createIndex('dictionary', 'dictionary');
            for (const name of ['kanji', 'termMeta', 'kanjiMeta']) {
                db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
            }
            db.createObjectStore('dictionaryInfo', { keyPath: 'title' });
            db.createObjectStore('managedState', { keyPath: 'key' });
            const termSearch = db.createObjectStore('termSearch', { keyPath: 'id', autoIncrement: true });
            termSearch.createIndex('token', 'token');
            termSearch.createIndex('dictionary', 'dictionary');
            const termKanji = db.createObjectStore('termKanji', { keyPath: 'id', autoIncrement: true });
            termKanji.createIndex('character', 'character');
            termKanji.createIndex('dictionary', 'dictionary');
        };
        request.onsuccess = () => {
            const db = request.result;
            const term = {
                expression: '山猫',
                reading: 'やまねこ',
                dictionary: DICTIONARY,
                glossary: ['wildcat'],
                rules: '',
                score: 10,
                sequence: 1,
                termTags: '',
                definitionTags: '',
            };
            const tx = db.transaction(['terms', 'dictionaryInfo', 'termSearch', 'termKanji'], 'readwrite');
            tx.objectStore('terms').add(term);
            tx.objectStore('dictionaryInfo').put({ title: DICTIONARY, counts: { terms: 1 } });
            // v6 wrote one whole-term clone per glossary token and per kanji.
            tx.objectStore('termSearch').add({ ...term, token: 'wildcat' });
            tx.objectStore('termSearch').add({ ...term, token: 'wild' });
            tx.objectStore('termKanji').add({ ...term, character: '猫' });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not seed version-6 database.')); };
        };
        request.onerror = () => reject(request.error ?? new Error('Could not create version-6 database.'));
    });
}

// Deliberately versionless: opening with an explicit 7 would perform the
// upgrade itself, with no handler to clear anything, and the store would then
// find nothing left to migrate -- the assertions would pass for the wrong
// reason.
function openCurrentDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Could not open dictionary database.'));
    });
}

async function countStore(storeName: 'termSearch' | 'termKanji'): Promise<number> {
    const db = await openCurrentDatabase();
    try {
        return await new Promise<number>((resolve, reject) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

async function readStore(storeName: 'termSearch' | 'termKanji'): Promise<Record<string, unknown>[]> {
    const db = await openCurrentDatabase();
    try {
        return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
            const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

function deleteDatabase(name: string): Promise<void> {
    return new Promise(resolve => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}
