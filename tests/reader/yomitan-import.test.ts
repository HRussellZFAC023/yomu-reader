import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { YomitanDictionaryStore } from '../../src/reader/yomitan';
import { yomitanZipBlob } from './zip-fixture';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const DB_VERSION = 4;
const activeStores: YomitanDictionaryStore[] = [];

describe('Yomitan ZIP import performance path', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        for (const store of activeStores.splice(0).reverse()) {
            await store.deleteDatabase({ timeoutMs: 50 }).catch(() => undefined);
        }
    });

    it('imports ZIP term banks through small Yomitan-style IndexedDB writes', async () => {
        const store = createStore();
        await store.clear();
        const originalTransaction = IDBDatabase.prototype.transaction;
        const transactionSpy = vi
            .spyOn(IDBDatabase.prototype, 'transaction')
            .mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
                return originalTransaction.apply(this, args);
            });
        const progress: string[] = [];

        const summary = await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Multi Bank JMdict', format: 3 },
            'term_bank_1.json': [
                ['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, ''],
                ['書く', 'かく', '', 'v5k', 9, ['to write'], 2, ''],
            ],
            'term_bank_2.json': [
                ['見る', 'みる', '', 'v1', 8, ['to see'], 3, ''],
                ['行く', 'いく', '', 'v5k', 7, ['to go'], 4, ''],
            ],
            'term_bank_3.json': [
                ['猫', 'ねこ', '', '', 6, ['cat'], 5, ''],
                ['犬', 'いぬ', '', '', 5, ['dog'], 6, ''],
            ],
        })], 'multi-bank-jmdict.zip', { type: 'application/zip' }), message => progress.push(message));

        expect(summary).toMatchObject({ dictionaries: ['Multi Bank JMdict'], terms: 6, entries: 6 });
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Multi Bank JMdict', glossary: ['to read'] }]);
        expect(termReadwriteTransactions(transactionSpy.mock.calls)).toHaveLength(3);
        expect(progress.some(message => message.startsWith('Importing Multi Bank JMdict: Reading term_bank_3.json (3/3,'))).toBe(true);
        expect(progress).toContain('Importing Multi Bank JMdict: Parsing term_bank_3.json (3/3)...');
        expect(progress).toContain('Importing Multi Bank JMdict: Saving terms 6 / 6 entries...');
        expect(progress).toContain('Importing Multi Bank JMdict: terms 6 entries saved...');
    });

    it('keeps ZIP term derived indexes deferred after import', async () => {
        const store = createStore();
        await store.clear();

        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Deferred Index Dict', format: 3 },
            'term_bank_1.json': [
                ['山猫', 'やまねこ', '', '', 10, ['wildcat'], 1, ''],
                ['猫舌', 'ねこじた', '', '', 9, ['sensitive to hot food'], 2, ''],
            ],
        })], 'deferred-index-dict.zip', { type: 'application/zip' }));

        await expect(storeCounts(['terms', 'termSearch', 'termKanji'])).resolves.toEqual({
            terms: 2,
            termSearch: 0,
            termKanji: 0,
        });

        await store.prepareTermSearchIndex();
        expect((await storeCounts(['termSearch'])).termSearch).toBeGreaterThan(0);
        expect((await store.lookupSimilarTermsByKanji('猫', 5)).map(entry => entry.expression)).toEqual(['山猫', '猫舌']);
        expect((await storeCounts(['termKanji'])).termKanji).toBeGreaterThan(0);
    });

    it('recovers dictionary availability from simple reader exports without dictionary metadata', async () => {
        const store = createStore();
        await store.clear();

        const summary = await store.importFile(new File([JSON.stringify({
            formatName: 'yomu-yomitan-dictionaries',
            kanji: [
                { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: [], meanings: ['read'], dictionary: 'Simple Kanji' },
            ],
            termMeta: [
                { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'Simple Frequency' },
            ],
        })], 'simple-reader-dictionaries.json', { type: 'application/json' }));

        expect(summary).toMatchObject({
            dictionaries: ['Simple Kanji', 'Simple Frequency'],
            dictionaryTypes: {
                'Simple Kanji': 'kanji',
                'Simple Frequency': 'frequency',
            },
            kanji: 1,
            termMeta: 1,
            entries: 2,
        });
        expect((await store.summary()).dictionaries.map(item => item.title)).toEqual(['Simple Kanji', 'Simple Frequency']);
        expect(await store.lookupKanji('読', 5, [
            { name: 'Simple Kanji', alias: 'Simple Kanji', enabled: true, priority: 0, type: 'kanji' },
        ])).toMatchObject([{ dictionary: 'Simple Kanji', meanings: ['read'] }]);
    });

    it('imports metadata-only legacy reader dictionary exports', async () => {
        const store = createStore();
        await store.clear();

        const summary = await store.importFile(new File([JSON.stringify({
            formatName: 'jpdb-reader-yomitan-dictionaries',
            termMeta: [
                { expression: '行く', mode: 'freq', data: { frequency: 500 }, dictionary: 'Legacy Frequency' },
            ],
        })], 'legacy-reader-dictionaries.json', { type: 'application/json' }));

        expect(summary).toMatchObject({
            dictionaries: ['Legacy Frequency'],
            dictionaryTypes: { 'Legacy Frequency': 'frequency' },
            termMeta: 1,
            entries: 1,
        });
        expect(await store.lookupTermMeta('行く', 5, [
            { name: 'Legacy Frequency', alias: 'Legacy Frequency', enabled: true, priority: 0, type: 'frequency' },
        ])).toMatchObject([{ dictionary: 'Legacy Frequency', mode: 'freq' }]);
    });
});

function createStore(): YomitanDictionaryStore {
    const store = new YomitanDictionaryStore();
    activeStores.push(store);
    return store;
}

function termReadwriteTransactions(calls: Array<Parameters<IDBDatabase['transaction']>>): Array<Parameters<IDBDatabase['transaction']>> {
    return calls.filter(([storeNames, mode]) => mode === 'readwrite' && transactionStoreNames(storeNames).includes('terms'));
}

function transactionStoreNames(storeNames: string | Iterable<string>): string[] {
    return typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
}

function storeCounts(stores: string[]): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(stores, 'readonly');
            const counts: Record<string, number> = {};
            let pending = stores.length;
            for (const store of stores) {
                const count = tx.objectStore(store).count();
                count.onsuccess = () => {
                    counts[store] = count.result;
                    if (--pending === 0) {
                        db.close();
                        resolve(counts);
                    }
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            }
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        };
        request.onerror = () => reject(request.error);
    });
}
