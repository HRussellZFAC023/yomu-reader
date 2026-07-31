import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    YomitanDictionaryStore,
    glossaryToHtml,
    glossaryToText,
    normalizeOcrResult,
    parseGoogleLensUploadHtml,
    readFallbackOcrResult,
    yomitanZipBlob,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('normalizes YomiNinja scalable OCR regions from native engines', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 1000, height: 1200 },
            ocr_regions: [{
                id: '0',
                position: { left: 0, top: 0 },
                size: { width: 100, height: 100 },
                results: [{
                    id: 'line',
                    box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    text: [{
                        content: '花が咲く',
                        box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    }],
                }],
            }],
        }, 1000, 1200);

        expect(result?.lines[0]).toMatchObject({
            text: '花が咲く',
            box: { left: 200, top: 120, width: 300, height: 96 },
        });
    });

    it('normalizes Cloud Vision OCR responses for image overlays', () => {
        const result = normalizeOcrResult({
            responses: [{
                fullTextAnnotation: {
                    pages: [{
                        width: 640,
                        height: 480,
                        blocks: [{
                            paragraphs: [{
                                words: [{
                                    symbols: [
                                        { text: '学', boundingBox: { vertices: [{ x: 10, y: 20 }, { x: 38, y: 20 }, { x: 38, y: 58 }, { x: 10, y: 58 }] } },
                                        { text: '校', boundingBox: { vertices: [{ x: 40, y: 20 }, { x: 70, y: 20 }, { x: 70, y: 58 }, { x: 40, y: 58 }] }, property: { detectedBreak: { type: 'LINE_BREAK' } } },
                                    ],
                                }],
                            }],
                        }],
                    }],
                },
            }],
        }, 640, 480);

        expect(result?.lines[0]).toMatchObject({
            text: '学校',
            box: { left: 10, top: 20, width: 60, height: 38 },
        });
    });

    it('parses Google Lens upload HTML without evaluating remote code', () => {
        const lineItems = [[[[['学', null, null, '校']], [0.1, 0.2, 0.3, 0.4]]]];
        const block = [null, null, [[null, null, null, null, null, [null, null, null, lineItems]]]];
        const callback = {
            key: 'ds:1',
            data: [null, null, [null, null, null, [[block]]]],
            sideChannel: {},
        };
        const literal = JSON.stringify(callback)
            .replace('"key"', 'key')
            .replace('"ds:1"', "'ds:1'");
        const html = `<script>AF_initDataCallback({key:'unused',data:[]});AF_initDataCallback(${literal});</script>`;
        const result = parseGoogleLensUploadHtml(html, 1000, 800);

        expect(result?.lines[0]).toMatchObject({
            text: '学校',
            box: { top: 80, left: 200, width: 300, height: 320 },
        });
    });

    it('positions YomiNinja OCR template regions relative to the source image', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 1000, height: 1200 },
            ocr_regions: [{
                id: 'manga-panel',
                position: { left: 0.25, top: 0.1 },
                size: { width: 0.5, height: 0.5 },
                results: [{
                    id: 'line',
                    box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    text: [{
                        content: '花が咲く',
                        box: { position: { left: 20, top: 10 }, dimensions: { width: 30, height: 8 }, isVertical: false },
                    }],
                }],
            }],
        }, 1000, 1200);

        expect(result?.lines[0]).toMatchObject({
            text: '花が咲く',
            box: { left: 350, top: 180, width: 150, height: 48 },
        });
    });

    it('uses image OCR metadata as an instant no-endpoint fallback for fixtures', () => {
        const image = document.createElement('img');
        Object.defineProperty(image, 'naturalWidth', { value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { value: 1400 });
        image.dataset.ocrLines = JSON.stringify([
            { text: '今日は学校です', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 }, vertical: true },
        ]);

        expect(readFallbackOcrResult(image)?.lines[0]).toMatchObject({
            text: '今日は学校です',
            vertical: true,
            box: { left: 100, top: 280, width: 300, height: 560 },
        });
    });

    it('does not treat image alt text as OCR output', () => {
        const image = document.createElement('img');
        image.alt = '箱を開ける、お花の定期便';
        Object.defineProperty(image, 'naturalWidth', { value: 1200 });
        Object.defineProperty(image, 'naturalHeight', { value: 800 });

        expect(readFallbackOcrResult(image, false)).toBeNull();
        expect(readFallbackOcrResult(image, true)).toBeNull();
    });

    it('imports Yomitan Dexie exports with term, kanji, and metadata tables', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const progress: string[] = [];
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                tables: [
                    { name: 'dictionaries', rowCount: 2 },
                    { name: 'terms', rowCount: 1 },
                    { name: 'kanji', rowCount: 1 },
                    { name: 'termMeta', rowCount: 1 },
                ],
                data: [
                    {
                        tableName: 'dictionaries',
                        rows: [
                            { $: [1, { title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, styles: 'span[data-sc-content="part-of-speech-info"] { font-weight: bold; }' }] },
                            { $: [2, { title: 'KANJIDIC', alias: 'KANJIDIC', enabled: true, priority: 1 }] },
                        ],
                    },
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 8, dictionary: 'Jitendex' }] },
                        ],
                    },
                    {
                        tableName: 'kanji',
                        rows: [
                            { $: [1, { character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], meanings: ['read'], dictionary: 'KANJIDIC' }] },
                        ],
                    },
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'JPDBv2' }] },
                        ],
                    },
                ],
            },
        })], 'yomitan-dictionaries.json', { type: 'application/json' });

        const summary = await store.importFile(file, message => progress.push(message));
        expect(summary).toMatchObject({ terms: 1, kanji: 1, termMeta: 1 });
        expect(progress).toContain('Preparing import 3 dictionary records...');
        expect(progress).toContain('Importing terms: 0 / 1 entries (0 / 3 total)...');
        expect(progress).toContain('Importing terms: 1 / 1 entries (3 / 3 total)...');
        expect(progress).toContain('Imported 3 / 3 dictionary records...');
        expect(await store.lookup('読む', 'よむ', 5)).toMatchObject([{ dictionary: 'Jitendex', glossary: ['to read'] }]);
        expect(await store.lookupKanji('読む', 5)).toMatchObject([{ dictionary: 'KANJIDIC', meanings: ['read'] }]);
        expect(await store.lookupTermMeta('読む', 5)).toMatchObject([{ dictionary: 'JPDBv2', mode: 'freq' }]);
        expect(await store.dictionaryStyleCss()).toContain('part-of-speech-info');
    });

    it('imports direct Dexie rows from current Yomitan dictionary exports', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'dictionaries',
                        inbound: true,
                        rows: [
                            { title: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0 },
                        ],
                    },
                    {
                        tableName: 'terms',
                        inbound: true,
                        rows: [
                            { expression: '青空', reading: 'あおぞら', glossary: [{ tag: 'ul', content: [{ tag: 'li', content: 'blue sky' }] }], score: 10, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '山猫', reading: 'やまねこ', glossary: ['wildcat (European wildcat)'], score: 16, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '面白い', reading: 'おもしろい', glossary: ['interesting; amusing'], score: 18, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '女', reading: 'おんな', glossary: ['woman'], score: 22, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '別語', reading: 'べつご', glossary: ['女'], score: 30, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '検索用内容', reading: 'けんさくようないよう', glossary: [{ tag: 'span', content: ['visible nested meaning'] }], score: 12, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '検索用説明', reading: 'けんさくようせつめい', glossary: [{ path: 'scan.png', description: 'diagram metadata' }], score: 11, dictionary: 'Jitendex.org [2025-12-02]' },
                            { expression: '属性だけ', reading: 'ぞくせいだけ', glossary: [{ tag: 'span', 'data-content': 'xref-only hidden attribute' }], score: 10, dictionary: 'Jitendex.org [2025-12-02]' },
                        ],
                    },
                ],
            },
        })], 'yomitan-direct-dictionaries.json', { type: 'application/json' });

        await store.importFile(file);
        const importTermSearchCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termSearch', 'readonly').objectStore('termSearch').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(importTermSearchCount).toBe(0);
        const entries = await store.lookup('青空', 'あおぞら', 5);
        expect(entries).toMatchObject([{ dictionary: 'Jitendex.org [2025-12-02]', expression: '青空' }]);
        expect(glossaryToHtml(entries[0].glossary[0])).toContain('blue sky');
        expect((await store.searchTerms('cat', 5)).map(entry => entry.expression)).toEqual(expect.arrayContaining(['猫', '山猫']));
        expect((await store.searchTerms('おもし', 5)).map(entry => entry.expression)).toContain('面白い');
        const kanjiSearchExpressions = (await store.searchTerms('女', 5)).map(entry => entry.expression);
        expect(kanjiSearchExpressions).toContain('女');
        expect(kanjiSearchExpressions).not.toContain('別語');
        expect(glossaryToText({ tag: 'span', 'data-content': 'visible fallback' })).toBe('visible fallback');
        expect((await store.searchTerms('visible', 5)).map(entry => entry.expression)).toContain('検索用内容');
        expect((await store.searchTerms('diagram', 5)).map(entry => entry.expression)).toContain('検索用説明');
        expect((await store.searchTerms('xref-only', 5)).map(entry => entry.expression)).not.toContain('属性だけ');
        await store.prepareTermSearchIndex();
        expect((await store.searchTerms('visible', 5)).map(entry => entry.expression)).toContain('検索用内容');
        expect((await store.searchTerms('diagram', 5)).map(entry => entry.expression)).toContain('検索用説明');
        expect((await store.searchTerms('xref-only', 5)).map(entry => entry.expression)).not.toContain('属性だけ');
        const termSearchCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termSearch', 'readonly').objectStore('termSearch').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(termSearchCount).toBeGreaterThan(0);
    });

    it('populates a kanji-to-term index and uses it for similar term lookups', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '山猫', reading: 'やまねこ', glossary: ['wildcat'], score: 10, dictionary: 'Jitendex' }] },
                        { $: [2, { expression: '猫舌', reading: 'ねこじた', glossary: ['sensitive to hot food'], score: 12, dictionary: 'Jitendex' }] },
                        { $: [3, { expression: '犬', reading: 'いぬ', glossary: ['dog'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'similar-kanji-index.json', { type: 'application/json' });

        await store.importFile(file);
        const termKanjiCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termKanji', 'readonly').objectStore('termKanji').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(termKanjiCount).toBe(0);
        expect((await store.lookupSimilarTermsByKanji('猫', 5)).map(entry => entry.expression)).toEqual(['猫舌', '山猫']);

        const indexedTermKanjiCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termKanji', 'readonly').objectStore('termKanji').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(indexedTermKanjiCount).toBe(5);
    });

    it('coalesces concurrent hot local dictionary lookups and keys them by normalized preferences', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 10, dictionary: 'Primary' }] },
                        { $: [2, { expression: '猫', reading: 'ねこ', glossary: ['cat alt'], score: 20, dictionary: 'Secondary' }] },
                    ],
                }],
            },
        })], 'hot-lookup-cache.json', { type: 'application/json' });

        await store.importFile(file);
        store.invalidateCaches();

        const originalGetAll = IDBIndex.prototype.getAll;
        const getAllSpy = vi
            .spyOn(IDBIndex.prototype, 'getAll')
            .mockImplementation(function (this: IDBIndex, ...args: Parameters<IDBIndex['getAll']>) {
                return originalGetAll.apply(this, args);
            });

        try {
            const [first, second] = await Promise.all([
                store.lookup('猫', '猫', 5),
                store.lookup('猫', '猫', 5),
            ]);
            expect(first).toEqual(second);
            expect(getAllSpy).toHaveBeenCalledTimes(1);

            const primaryOnly = await store.lookup('猫', '猫', 5, [
                { name: 'Primary', alias: 'Primary', enabled: true, priority: 0 },
                { name: 'Secondary', alias: 'Secondary', enabled: false, priority: 1 },
            ]);
            const secondaryOnly = await store.lookup('猫', '猫', 5, [
                { name: 'Secondary', alias: 'Secondary', enabled: true, priority: 0 },
                { name: 'Primary', alias: 'Primary', enabled: false, priority: 1 },
            ]);

            expect(primaryOnly.map(entry => entry.dictionary)).toEqual(['Primary']);
            expect(secondaryOnly.map(entry => entry.dictionary)).toEqual(['Secondary']);
        } finally {
            getAllSpy.mockRestore();
        }
    });

    it('uses a bounded legacy glossary fallback while the token index is being prepared', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('terms', 'readwrite');
                tx.objectStore('terms').add({
                    expression: '猫',
                    reading: 'ねこ',
                    glossary: ['cat'],
                    score: 20,
                    dictionary: 'Jitendex',
                });
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            };
            request.onerror = () => reject(request.error);
        });

        expect((await store.searchTerms('cat', 5)).map(entry => entry.expression)).toContain('猫');
        await store.prepareTermSearchIndex();
        expect((await store.searchTerms('cat', 5)).map(entry => entry.expression)).toContain('猫');
    });

    it('can run interactive glossary search without starting the full token index rebuild', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        await store.importFile(new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'interactive-search-dictionaries.json', { type: 'application/json' }));

        expect((await store.searchTerms('cat', 5, [], {
            candidateLimit: 12,
            glossaryFallbackMaxRows: 20,
            glossaryFallbackMaxMs: 20,
            prepareIndex: false,
        })).map(entry => entry.expression)).toContain('猫');

        const termSearchCount = await new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('jpdb-popup-reader-yomitan', 5);
            request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('termSearch', 'readonly').objectStore('termSearch').count();
                count.onsuccess = () => {
                    db.close();
                    resolve(count.result);
                };
                count.onerror = () => {
                    db.close();
                    reject(count.error);
                };
            };
            request.onerror = () => reject(request.error);
        });
        expect(termSearchCount).toBe(0);
    });

    it('deletes the local dictionary database while another Yomu tab has it open', async () => {
        const resetStore = new YomitanDictionaryStore();
        await resetStore.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '読む', reading: 'よむ', glossary: ['to read'], score: 10, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'reset-blocked-dictionaries.json', { type: 'application/json' });

        await resetStore.importFile(file);
        const newTabStore = new YomitanDictionaryStore();
        expect((await newTabStore.summary()).terms).toBe(1);

        await resetStore.deleteDatabase();

        expect((await newTabStore.summary()).terms).toBe(0);
        expect((await resetStore.summary()).terms).toBe(0);
    });

    it('deduplicates alternate readings for the same Yomitan sequence and glossary', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const formsGlossary = [{
            type: 'structured-content',
            content: [
                { tag: 'ul', content: [{ tag: 'li', content: 'fifth sign of the Chinese calendar' }] },
                {
                    tag: 'table',
                    data: { content: 'forms' },
                    content: [
                        { tag: 'tr', data: { content: 'forms-header-row' }, content: [{ tag: 'th', content: '' }, { tag: 'th', content: '戊' }] },
                        { tag: 'tr', content: [{ tag: 'th', content: 'つちのえ' }, { tag: 'td', data: { class: 'form-valid' }, content: { tag: 'span', title: 'valid form/reading combination', content: '' } }] },
                        { tag: 'tr', content: [{ tag: 'th', content: 'ぼ' }, { tag: 'td', data: { class: 'form-valid' }, content: { tag: 'span', title: 'valid form/reading combination', content: '' } }] },
                    ],
                },
            ],
        }];
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [{
                    tableName: 'terms',
                    rows: [
                        { $: [1, { expression: '戊', reading: 'つちのえ', glossary: formsGlossary, sequence: 1584050, score: 10, dictionary: 'Jitendex' }] },
                        { $: [2, { expression: '戊', reading: 'ぼ', glossary: formsGlossary, sequence: 1584050, score: 8, dictionary: 'Jitendex' }] },
                        { $: [3, { expression: '簿', reading: 'ぼ', glossary: ['register, record, book'], sequence: 1358910, score: 12, dictionary: 'Jitendex' }] },
                    ],
                }],
            },
        })], 'jitendex-forms.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookup('戊', 'ぼ', 5);

        expect(entries.map(entry => `${entry.expression}/${entry.reading}`)).toEqual(['戊/ぼ', '簿/ぼ']);
    });

    it('sorts local frequency metadata with JPDB dictionaries first', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'termMeta',
                        rows: [
                            { $: [1, { expression: '読む', mode: 'freq', data: { frequency: 10 }, dictionary: 'BCCWJ' }] },
                            { $: [2, { expression: '読む', mode: 'freq', data: { frequency: 400 }, dictionary: 'JPDBv2㋕' }] },
                            { $: [3, { expression: '読む', mode: 'pitch', data: { pitches: [1] }, dictionary: 'Pitch' }] },
                        ],
                    },
                ],
            },
        })], 'freq.json', { type: 'application/json' });

        await store.importFile(file);
        const entries = await store.lookupTermMeta('読む', 5, [
            { name: 'BCCWJ', alias: 'BCCWJ', enabled: true, priority: 0 },
            { name: 'JPDBv2㋕', alias: 'JPDBv2㋕', enabled: true, priority: 5 },
            { name: 'Pitch', alias: 'Pitch', enabled: true, priority: 1 },
        ]);
        expect(entries.map(entry => entry.dictionary)).toEqual(['JPDBv2㋕', 'BCCWJ', 'Pitch']);
    });

    it('loads new-tab dictionary words from top frequency data or common JMdict-style tags', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const zip = yomitanZipBlob({
            'index.json': { title: 'Tiny JMdict', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', 'common', '', 10, ['to read'], 1, 'ichi1'],
            ['珍語', 'ちんご', '', '', 0, ['rare word'], 2, ''],
            ['行く', 'いく', '', '', 8, ['to go'], 3, 'news1'],
            ],
        });
        await store.importFile(new File([zip], 'tiny-jmdict.zip', { type: 'application/zip' }));

        const common = await store.listRandomTopTerms(10, 2000);
        expect(common.map(entry => entry.expression).sort()).toEqual(['行く', '読む']);

        const freq = yomitanZipBlob({
            'index.json': { title: 'Tiny Frequency', format: 3 },
            'term_meta_bank_1.json': [
            ['読む', 'freq', { frequency: 400 }],
            ['珍語', 'freq', { frequency: 3000 }],
            ],
        });
        const frequencySummary = await store.importFile(new File([freq], 'tiny-frequency.zip', { type: 'application/zip' }));
        expect(frequencySummary.dictionaryTypes).toMatchObject({ 'Tiny Frequency': 'frequency' });

        const top = await store.listRandomTopTerms(10, 2000);
        expect(top).toHaveLength(1);
        expect(top[0]).toMatchObject({ expression: '読む', jpdbFrequency: 400 });
    });

    it('downloads and imports a recommended dictionary ZIP via userscript requests', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const blob = yomitanZipBlob({
            'index.json': { title: 'Tiny Dictionary', format: 3, revision: 'test' },
            'styles.css': 'ul[data-sc-content="glossary"] { padding-left: 1em; }',
            'term_bank_1.json': [
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
            ],
        });
        vi.stubGlobal('GM_xmlhttpRequest', (details: {
            onload?: (response: { status: number; response: Blob }) => void;
        }) => details.onload?.({ status: 200, response: blob }));

        try {
            const summary = await store.importFromUrl('https://example.test/tiny.zip', 'tiny.zip');
            const dictionaries = (await store.summary()).dictionaries;

            expect(summary).toMatchObject({ dictionaries: ['Tiny Dictionary'], terms: 1 });
            expect(dictionaries[0]).toMatchObject({ title: 'Tiny Dictionary', revision: 'test', downloadUrl: 'https://example.test/tiny.zip' });
            expect(await store.dictionaryStyleCss()).toContain('data-sc-content');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('removes one imported dictionary without clearing the others', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();

        const firstZip = yomitanZipBlob({
            'index.json': { title: 'Tiny Terms', format: 3 },
            'term_bank_1.json': [
            ['読む', 'よむ', '', '', 1, ['to read'], 1, ''],
            ],
        });
        const secondZip = yomitanZipBlob({
            'index.json': { title: 'Tiny Kanji', format: 3 },
            'kanji_bank_1.json': [
            ['読', 'ドク', 'よ.む', '', ['read'], {}, {}],
            ],
        });

        await store.importFile(new File([firstZip], 'tiny-terms.zip', { type: 'application/zip' }));
        await store.importFile(new File([secondZip], 'tiny-kanji.zip', { type: 'application/zip' }));
        await store.deleteDictionary('Tiny Terms');

        const summary = await store.summary();
        expect(summary.dictionaries.map(item => item.title)).toEqual(['Tiny Kanji']);
        expect(summary.terms).toBe(0);
        expect(summary.kanji).toBe(1);
        expect(await store.lookup('読む', 'よむ', 5)).toEqual([]);
        expect(await store.lookupKanji('読', 5)).toMatchObject([{ dictionary: 'Tiny Kanji' }]);
    });

    it('downloads recommended dictionary ZIPs via the GM object userscript request API', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const blob = yomitanZipBlob({
            'index.json': { title: 'Tiny GM Dictionary', format: 3, revision: 'test' },
            'term_bank_1.json': [
            ['書く', 'かく', '', '', 1, ['to write'], 1, ''],
            ],
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({ status: 200, response: blob }),
        });

        try {
            const summary = await store.importFromUrl('https://example.test/tiny-gm.zip', 'tiny-gm.zip');
            const dictionaries = (await store.summary()).dictionaries;

            expect(summary).toMatchObject({ dictionaries: ['Tiny GM Dictionary'], terms: 1 });
            expect(dictionaries[0]).toMatchObject({ title: 'Tiny GM Dictionary', revision: 'test', downloadUrl: 'https://example.test/tiny-gm.zip' });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
