import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import { sha256Hex } from '../../src/reader/dictionaries/catalog';
import { yomitanZipBlob } from './zip-fixture';
import * as replicaPurge from '../../src/reader/dictionaries/replica-purge';
import { validateDexieJson } from '../../src/reader/dictionaries/yomitan/import-lifecycle';

const DB_NAME = 'jpdb-popup-reader-yomitan';
const DB_VERSION = 7;
const activeStores: YomitanDictionaryStore[] = [];

describe('Yomitan ZIP import performance path', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        for (const store of activeStores.splice(0).reverse()) {
            await store.deleteDatabase({ timeoutMs: 2000 }).catch(() => undefined);
        }
    });

    it.each(['importZip', 'importJson', 'importDexieJson'] as const)(
        '%s rejects invalid input before claiming freshness or replacing dictionary content', async method => {
            const store = createStore();
            await store.clear();
            const fresh = vi.spyOn(replicaPurge, 'markDictionaryReplicaFresh');
            const put = vi.spyOn(IDBObjectStore.prototype, 'put');
            const clear = vi.spyOn(IDBObjectStore.prototype, 'clear');
            await expect(store[method](new File(['not a dictionary'], 'candidate.json')))
                .rejects.toThrow();
            expect(fresh).not.toHaveBeenCalled();
            expect(put).not.toHaveBeenCalled();
            expect(clear).not.toHaveBeenCalled();
        },
    );

    it.each(['zip', 'dexie', 'reader'] as const)('retains existing records and freshness when later %s validation fails', async format => {
        const store = createStore();
        await store.importZip(new File([yomitanZipBlob({
            'index.json': { title: 'Retained', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', '', 1, ['read'], 1, '']],
        })], 'retained.zip'));
        const fresh = vi.spyOn(replicaPurge, 'markDictionaryReplicaFresh');
        const clear = vi.spyOn(IDBObjectStore.prototype, 'clear');
        const file = format === 'zip' ? new File([yomitanZipBlob({
            'index.json': { title: 'Retained', format: 3 },
            'term_bank_1.json': [['猫', 'ねこ', '', '', 1, ['cat'], 2, '']],
            'term_bank_2.json': '[{"broken":',
        })], 'broken.zip') : new File([format === 'dexie'
            ? '{"formatName":"dexie","data":{"data":[{"tableName":"terms","rows":[]}]}'
            : '{"formatName":"yomu-yomitan-dictionaries","terms":['], 'broken.json');
        await expect(format === 'zip' ? store.importZip(file) : format === 'dexie' ? store.importDexieJson(file) : store.importJson(file)).rejects.toThrow();
        expect(fresh).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Retained', glossary: ['read'] }]);
    });

    it.each([
        {},
        { 'term_bank_1.json': [] },
        { 'term_bank_1.json': [null, {}, []] },
    ])('rejects same-title ZIPs without a normalizable entry before mutation (%#)', async banks => {
        const store = createStore();
        const index = { title: 'Retained', format: 3 };
        await store.importZip(new File([yomitanZipBlob({
            'index.json': index,
            'term_bank_1.json': [['読む', 'よむ', '', '', 1, ['read'], 1, '']],
        })], 'retained.zip'));
        const before = await dictionaryFreshness();
        expect(before).toMatchObject({ kind: 'import' });
        const fresh = vi.spyOn(replicaPurge, 'markDictionaryReplicaFresh');
        const clear = vi.spyOn(IDBObjectStore.prototype, 'clear');
        await expect(store.importZip(new File([yomitanZipBlob({ 'index.json': index, ...banks })], 'empty.zip'))).rejects.toThrow();
        expect(fresh).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
        expect(await dictionaryFreshness()).toEqual(before);
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Retained', glossary: ['read'] }]);
    });

    it('validates Dexie syntax across chunk boundaries and escaped format names', async () => {
        const json = `{"padding":"${'x'.repeat(262130)}","formatName":"de\\u0078ie","data":{"tables":[{"name":"terms","rowCount":0}],"data":[]}}`;
        await expect(validateDexieJson(new File([json], 'valid.json'))).resolves.toEqual({ terms: 0 });
    });

    it.each([false, true])('checks scalar/depth safety boundaries across chunks=%s', async crossing => {
        for (const [value, accepted] of [
            ['1'.repeat(128), true], ['1'.repeat(129), false],
            ['['.repeat(127) + '0' + ']'.repeat(127), true],
            ['['.repeat(128) + '0' + ']'.repeat(128), false],
        ] as const) {
            const json = dexieEnvelope(value, crossing);
            expect(() => JSON.parse(json)).not.toThrow(); // Limits are not JSON grammar.
            const pending = validateDexieJson(new File([json], 'limits.json'));
            if (accepted) await expect(pending).resolves.toEqual({ terms: 0 });
            else await expect(pending).rejects.toThrow(RangeError);
        }
    });

    it('matches JSON.parse syntax acceptance for deterministic small Dexie exports', async () => {
        const values: unknown[] = [null, true, false, 0, -0, 0.125, 1e100, '', '読む', '"\\\n\t', '\u0000', '\ud800'];
        const serialized = values.flatMap(value => [value, [value], { nested: [value, { value }] }]).map(value => JSON.stringify(value));
        const tokens = [...serialized, '1e400', '-1E-400', '"\\u0061"', '{"a":1,"a":2}',
            '01', '+1', '1.', '1e', 'NaN', 'undefined', '[1,]', '{"a":}', '{"a" 1}',
            '"\\x41"', '"\\u00xz"', '"unclosed', 'true false', '[}', '"raw\nnewline"'];
        const valid = dexieEnvelope('null');
        const documents = [...tokens.map(token => dexieEnvelope(token)), valid.slice(0, -1), valid + ' trailing', valid.replace(',"probe"', ',,"probe"')];
        for (const json of documents) {
            let accepted = true;
            try { JSON.parse(json); } catch { accepted = false; }
            const actual = await validateDexieJson(new File([json], 'differential.json')).then(() => true, () => false);
            expect(actual, json).toBe(accepted);
        }
    });

    it.each(['1'.repeat(129), '['.repeat(128) + '0' + ']'.repeat(128)])('retains records and freshness on over-limit Dexie input (%#)', async value => {
        const store = createStore();
        await store.importZip(new File([yomitanZipBlob({
            'index.json': { title: 'Retained', format: 3 },
            'term_bank_1.json': [['読む', 'よむ', '', '', 1, ['read'], 1, '']],
        })], 'retained.zip'));
        const before = await dictionaryFreshness();
        expect(before).toMatchObject({ kind: 'import' });
        const fresh = vi.spyOn(replicaPurge, 'markDictionaryReplicaFresh');
        const clear = vi.spyOn(IDBObjectStore.prototype, 'clear');
        await expect(store.importDexieJson(new File([dexieEnvelope(value, true)], 'unsafe.json'))).rejects.toThrow(RangeError);
        expect(fresh).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
        expect(await dictionaryFreshness()).toEqual(before);
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Retained', glossary: ['read'] }]);
    });

    it.each([
        '{"formatName":"dexie","data":{"tables":[{"name":"terms","rowCount":0}]},"formatName":1}',
        '{"formatName":"dexie","data":{"tables":[{"name":"terms","rowCount":0}]},}',
        '{"formatName":"dexie","data":{"tables":[{"name":"terms","rowCount":0}]}} trailing',
        '{"formatName":"dexie","data":{}}',
    ])('rejects malformed or unsupported Dexie documents before mutation (%#)', async json => {
        await expect(validateDexieJson(new File([json], 'invalid.json'))).rejects.toThrow();
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

    it('uses the reading index when a kana-only card repeats its spelling as its reading', async () => {
        const store = createStore();
        await store.clear();
        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Kana Card JMdict', format: 3 },
            'term_bank_1.json': [
                ['易しい', 'やさしい', '', 'adj-i', 10, ['easy; plain; simple'], 1, ''],
            ],
        })], 'kana-card-jmdict.zip', { type: 'application/zip' }));

        await expect(store.lookup('やさしい', 'やさしい', 5)).resolves.toMatchObject([{
            dictionary: 'Kana Card JMdict',
            expression: '易しい',
            reading: 'やさしい',
            glossary: ['easy; plain; simple'],
        }]);
    });

    it('deduplicates overlapping index hits and keeps an exact spelling ahead of reading aliases', async () => {
        const store = createStore();
        await store.clear();
        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Overlapping Index JMdict', format: 3 },
            'term_bank_1.json': [
                ['やさしい', 'やさしい', '', 'adj-i', 1, ['easy in kana'], 1, ''],
                ['易しい', 'やさしい', '', 'adj-i', 10, ['easy with kanji'], 2, ''],
            ],
        })], 'overlapping-index-jmdict.zip', { type: 'application/zip' }));

        const entries = await store.lookup('やさしい', 'やさしい', 5);
        expect(entries.map(entry => entry.expression)).toEqual(['やさしい', '易しい']);
        expect(new Set(entries.map(entry => `${entry.dictionary}\n${entry.sequence}`)).size).toBe(entries.length);
        await expect(store.lookup('やさしい', 'やさしい', 1)).resolves.toMatchObject([{
            expression: 'やさしい',
            reading: 'やさしい',
        }]);
    });

    it('imports and retrieves supplementary-plane kanji without splitting the character', async () => {
        const store = createStore();
        await store.clear();
        await store.importFile(new File([yomitanZipBlob({
            'index.json': { title: 'Supplementary Han Fixture', format: 3 },
            'kanji_bank_1.json': [
                ['𡃁', '', 'ngam4', '', ['correct; suitable'], {}, {}],
            ],
        })], 'supplementary-han.zip', { type: 'application/zip' }));

        expect(await store.lookupKanji('𡃁', 5)).toMatchObject([{
            character: '𡃁',
            kunyomi: ['ngam4'],
            meanings: ['correct; suitable'],
            dictionary: 'Supplementary Han Fixture',
        }]);
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

        // The derived rows are id postings, never copies of the term. Earlier
        // schemas cloned the whole row (glossary, inlined images and all) into
        // every posting — up to 40 copies per imported term, the dominant
        // driver of multi-gigabyte dictionary databases.
        const derivedRows = await new Promise<{ termSearch: Record<string, unknown>[]; termKanji: Record<string, unknown>[] }>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(['termSearch', 'termKanji'], 'readonly');
                const search = tx.objectStore('termSearch').getAll();
                const kanji = tx.objectStore('termKanji').getAll();
                tx.oncomplete = () => {
                    db.close();
                    resolve({ termSearch: search.result, termKanji: kanji.result });
                };
                tx.onerror = () => { db.close(); reject(tx.error); };
            };
        });
        for (const row of [...derivedRows.termSearch, ...derivedRows.termKanji]) {
            expect(row).not.toHaveProperty('glossary');
            expect(row).not.toHaveProperty('expression');
            expect(typeof row.termId).toBe('number');
            expect(typeof row.dictionary).toBe('string');
        }
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

function dexieEnvelope(value: string, crossing = false): string {
    const prefix = '{"formatName":"dexie","data":{"tables":[{"name":"terms","rowCount":0}]},"probe":';
    return prefix + (crossing ? ' '.repeat(262144 - prefix.length - 64) : '') + value + '}';
}

async function dictionaryFreshness(): Promise<unknown> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('managedState');
            const request = tx.objectStore('managedState').get('dictionary-replica-purge');
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error);
        });
    } finally { db.close(); }
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
