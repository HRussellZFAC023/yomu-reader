import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { sha256Hex } from '../../src/reader/dictionaries/catalog';
import { yomitanZipBlob } from './zip-fixture';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const DB_VERSION = 5;
const activeStores: YomitanDictionaryStore[] = [];

describe('Yomitan ZIP import performance path', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        for (const store of activeStores.splice(0).reverse()) {
            await store.deleteDatabase({ timeoutMs: 2000 }).catch(() => undefined);
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

    it('rejects a catalogue archive with mismatched integrity before changing dictionary rows', async () => {
        const store = createStore();
        await store.clear();
        const file = new File([yomitanZipBlob({
            'index.json': { title: 'Integrity Fixture', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, '']],
        })], 'integrity-fixture.zip', { type: 'application/zip' });

        await expect(store.importFile(file, undefined, 'https://dictionaries.yomureader.com/fixture.zip', {
            integrity: { sha256: '0'.repeat(64), bytes: file.size + 1 },
        })).rejects.toThrow(/size mismatch/);
        await expect(store.summary()).resolves.toMatchObject({ dictionaries: [], terms: 0 });

        await expect(store.importFile(file, undefined, 'https://dictionaries.yomureader.com/fixture.zip', {
            integrity: { sha256: '0'.repeat(64), bytes: file.size },
        })).rejects.toThrow(/SHA-256 mismatch/);
        await expect(store.summary()).resolves.toMatchObject({ dictionaries: [], terms: 0 });

        const sha256 = await sha256Hex(file);
        await expect(store.importFile(file, undefined, 'https://dictionaries.yomureader.com/fixture.zip', {
            integrity: { sha256, bytes: file.size },
        })).resolves.toMatchObject({ dictionaries: ['Integrity Fixture'], terms: 1 });
    });

    it('replaces the previous revision when re-importing a revisioned dictionary', async () => {
        // Title-keyed replace missed the old copy on update: "Jitendex.org
        // [2026-05-05]" and "[2026-06-06]" coexisted, doubling term rows and
        // every lookup's index scans while the settings list showed the
        // dictionary installed twice.
        const store = createStore();
        await store.clear();
        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Jitendex.org [2026-05-05]', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read (old)'], 1, '']],
        })], 'jitendex-old.zip', { type: 'application/zip' }));
        const importSummary = await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Jitendex.org [2026-06-06]', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read (new)'], 1, '']],
        })], 'jitendex-new.zip', { type: 'application/zip' }));

        // Settings needs the replaced titles to retire their preference rows;
        // without this the old revision stays listed as an enabled source that
        // can never produce definitions again.
        expect(importSummary.replacedDictionaries).toEqual(['Jitendex.org [2026-05-05]']);

        const summary = await store.summary();
        const titles = summary.dictionaries.map(info => info.title);
        expect(titles).toContain('Jitendex.org [2026-06-06]');
        expect(titles).not.toContain('Jitendex.org [2026-05-05]');
        const entries = await store.lookup('読む', 'よむ', 5);
        expect(entries).toMatchObject([{ dictionary: 'Jitendex.org [2026-06-06]', glossary: ['to read (new)'] }]);
    });

    it('keeps distinct dictionaries with similar names apart on import', async () => {
        const store = createStore();
        await store.clear();
        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'JMdict [2026-01-01]', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', 'v5m', 10, ['to read'], 1, '']],
        })], 'jmdict.zip', { type: 'application/zip' }));
        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'JMnedict [2026-01-01]', format: 3 },
            'term_bank_1.json': [['紫音', 'しおん', '', '', 10, ['Shion'], 1, '']],
        })], 'jmnedict.zip', { type: 'application/zip' }));

        const summary = await store.summary();
        const titles = summary.dictionaries.map(info => info.title);
        expect(titles).toContain('JMdict [2026-01-01]');
        expect(titles).toContain('JMnedict [2026-01-01]');
    });

    it('imports structured-content image assets from Yomitan ZIPs', async () => {
        const store = createStore();
        await store.clear();

        const summary = await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Jitendex Images', format: 3 },
            'term_bank_1.json': [
                ['図書', 'としょ', '', '', 10, [[
                    'book',
                    { type: 'image', path: 'media/book.png', description: '本の絵', width: 20, height: 10 },
                ]], 1, ''],
            ],
            'media/book.png': 'png-bytes',
        })], 'jitendex-images.zip', { type: 'application/zip' }));

        expect(summary).toMatchObject({ dictionaries: ['Jitendex Images'], terms: 1 });
        const [entry] = await store.lookup('図書', 'としょ', 5);
        expect(JSON.stringify(entry?.glossary)).toContain('data:image/png;base64,cG5nLWJ5dGVz');
    });

    it('imports monolingual structured Japanese glossary content for local lookup parsing', async () => {
        const store = createStore();
        await store.clear();

        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: '日日 Wiktionary', format: 3 },
            'term_bank_1.json': [
                ['読む', 'よむ', '', '', 10, [[
                    { tag: 'span', content: '文字や文章を見て、その意味を理解する。' },
                    { tag: 'ul', content: [{ tag: 'li', content: '本を読む。' }] },
                ]], 1, ''],
            ],
        })], 'wty-ja-ja.zip', { type: 'application/zip' }));

        const [entry] = await store.lookup('読む', 'よむ', 5);
        expect(entry?.dictionary).toBe('日日 Wiktionary');
        expect(JSON.stringify(entry?.glossary)).toContain('文字や文章を見て、その意味を理解する。');
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

    it('falls back to cursors for bounded IndexedDB index reads when getAll is unavailable', async () => {
        const store = createStore();
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 12, dictionary: 'Cursor Terms' }] },
                            { $: [2, { expression: '読書', reading: 'どくしょ', glossary: ['reading books'], score: 10, dictionary: 'Cursor Terms' }] },
                        ],
                    },
                    {
                        tableName: 'kanji',
                        rows: [
                            { $: [1, { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], meanings: ['read'], dictionary: 'Cursor Kanji' }] },
                            { $: [2, { character: '書', onyomi: ['ショ'], kunyomi: ['か.く'], meanings: ['write'], dictionary: 'Cursor Kanji' }] },
                        ],
                    },
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'Cursor Frequency' }] },
                        ],
                    },
                ],
            },
        })], 'cursor-fallback-dictionaries.json', { type: 'application/json' }));

        const originalGetAllDescriptor = Object.getOwnPropertyDescriptor(IDBIndex.prototype, 'getAll');
        Object.defineProperty(IDBIndex.prototype, 'getAll', {
            configurable: true,
            value: undefined,
        });

        try {
            expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Cursor Terms', glossary: ['to read'] }]);
            expect((await store.lookupKanji('読書', 5)).map(entry => entry.character)).toEqual(['読', '書']);
            expect(await store.lookupTermMeta('読む', 5)).toMatchObject([{ dictionary: 'Cursor Frequency', mode: 'freq' }]);
            expect((await store.listRandomTopTerms(5, 500, [], { fallbackToRandom: false })).map(entry => entry.expression)).toEqual(['読む']);
        } finally {
            if (originalGetAllDescriptor) {
                Object.defineProperty(IDBIndex.prototype, 'getAll', originalGetAllDescriptor);
            } else {
                delete (IDBIndex.prototype as { getAll?: unknown }).getAll;
            }
        }
    }, 15000);

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
