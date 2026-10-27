import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    YomitanDictionaryStore,
    glossaryToHtml,
    glossaryToText,
    normalizeOcrResult,
    readFallbackOcrResult,
    yomitanZipBlob,
} from './fixtures';
import "../../../src/reader/companions/register-build-companions";
import { afterEach } from "vitest";
import { DEFAULT_SETTINGS, applyTokensToScanTarget, card, collectFragmentTextTargetsIn, mutationLooksLikeReaderRenderRejection, readerRenderRejectionRescanDelay } from "./fixtures";

import { collectScanTargets, mockElementBoundingClientRect, readerWordSurfaceText } from "./fixtures";

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
            const request = indexedDB.open('jpdb-popup-reader-yomitan');
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
            const request = indexedDB.open('jpdb-popup-reader-yomitan');
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
            // One shared lookup reads both the expression and reading indexes;
            // the second concurrent call reuses that same in-flight result.
            expect(getAllSpy).toHaveBeenCalledTimes(2);

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
            const request = indexedDB.open('jpdb-popup-reader-yomitan');
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
            const request = indexedDB.open('jpdb-popup-reader-yomitan');
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

    it('sorts local frequency metadata by the declared shelf order', async () => {
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
        // A shelf order the learner arranged outranks Yomu's own preference
        // for a JPDB frequency list (issue #43): BCCWJ at priority 0 beats
        // JPDBv2 at priority 5. The JPDB default only breaks ties between
        // dictionaries the learner never ordered, and frequency rows still
        // sort ahead of pitch rows.
        expect(entries.map(entry => entry.dictionary)).toEqual(['BCCWJ', 'JPDBv2㋕', 'Pitch']);
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
        const blob = yomitanZipBlob({
            'index.json': { title: 'Tiny GM Dictionary', format: 3, revision: 'test' },
            'term_bank_1.json': [
            ['書く', 'かく', '', '', 1, ['to write'], 1, ''],
            ],
        });
        // A userscript's GM object exists before any of its code runs, so the
        // store belongs to the userscript owner from its first storage use.
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({ status: 200, response: blob }),
        });
        const store = new YomitanDictionaryStore();

        try {
            await store.clear();
            const summary = await store.importFromUrl('https://example.test/tiny-gm.zip', 'tiny-gm.zip');
            const dictionaries = (await store.summary()).dictionaries;

            expect(summary).toMatchObject({ dictionaries: ['Tiny GM Dictionary'], terms: 1 });
            expect(dictionaries[0]).toMatchObject({ title: 'Tiny GM Dictionary', revision: 'test', downloadUrl: 'https://example.test/tiny-gm.zip' });
        } finally {
            await store.deleteDatabase();
            vi.unstubAllGlobals();
        }
    });
});

describe('reader helpers', () => {
    registerReaderHelpersCleanup();
    afterEach(() => document.documentElement.removeAttribute('data-yomu-annotation-scope'));



    it('repairs damaged reader ruby when the host leaves only furigana behind', () => {
        document.body.innerHTML = '<yt-attributed-string id="content-text">質や正確性にはばらつきがあります。</yt-attributed-string>';
        const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true });
        applyTokensToScanTarget(target, [{
            card: { ...card, cardState: ['known'], spelling: '質', reading: 'しつ' },
            start: 0,
            end: 1,
            length: 1,
            rubies: [{ text: 'しつ', start: 0, end: 1, length: 1 }],
            pitchClass: '',
            sentence: '質や正確性にはばらつきがあります。',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const host = document.querySelector<HTMLElement>('#content-text')!;
        const word = host.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const rubyBase = word.querySelector<HTMLElement>('.jpdb-reader-ruby-base')!;
        const removedNodes = [rubyBase.firstChild!];
        rubyBase.textContent = '';
        const mutation = {
            type: 'childList',
            target: rubyBase,
            addedNodes: [],
            removedNodes,
        } as unknown as MutationRecord;

        expect(mutationLooksLikeReaderRenderRejection(mutation)).toBe(true);
        expect(readerRenderRejectionRescanDelay(mutation)).toBeGreaterThan(0);
        expect(host.textContent).toBe('質や正確性にはばらつきがあります。');
    });
});

describe('reader helpers', () => {
    registerReaderHelpersCleanup();



    it('uses Jisho-specific fragment parsing for result text split across furigana spans', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 900,
            top: 0,
            bottom: 220,
            width: 900,
            height: 220,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div id="main_results">
                <div class="concept_light clearfix">
                    <div class="concept_light-readings japanese japanese_gothic" lang="ja">
                        <div class="concept_light-representation">
                            <span class="furigana"><span>きのう</span></span>
                            <span class="text">昨日</span>
                        </div>
                    </div>
                </div>
                <div class="sentence_content">
                    <ul class="japanese_sentence japanese japanese_gothic" lang="ja">
                        <li style="display:inline"><span class="furigana">きのう</span><span class="unlinked">昨日</span></li>すき焼きを食べました。
                    </ul>
                    <div class="english">I ate sukiyaki yesterday.</div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jisho.org/search/%E6%98%A8%E6%97%A5');
        rectSpy.mockRestore();

        const normalizedTargets = targets.map(target => target.text.replace(/\s+/g, ''));
        expect(normalizedTargets).toContain('昨日');
        expect(normalizedTargets).toContain('昨日すき焼きを食べました。');
        expect(normalizedTargets.some(text => text.includes('きのう昨日'))).toBe(false);
    });

    it('renders Jiten highlighted sentence words even when a token crosses inline spans', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <main id="app">
                <blockquote>
                    <div lang="ja" class="md:text-lg text-sm transition-filter duration-200 flex-1">
                        <span class="text-primary-500 font-bold">席</span>へと<span class="text-primary-500 font-bold">受け</span>取る。
                    </div>
                </blockquote>
            </main>
        `;

        const targets = collectScanTargets(10, 'https://jiten.moe/parse?text=%E5%B8%AD');
        rectSpy.mockRestore();
        expect(targets.map(target => target.text)).toContain('席へと受け取る。');

        const target = targets.find(item => item.text === '席へと受け取る。')!;
        applyTokensToScanTarget(target, [
            {
                card: { ...card, cardState: ['known'], spelling: '席', reading: 'せき' },
                start: 0,
                end: 1,
                length: 1,
                rubies: [{ text: 'せき', start: 0, end: 1, length: 1 }],
                pitchClass: '',
                sentence: target.text,
            },
            {
                card: { ...card, cardState: ['known'], spelling: '受け取る', reading: 'うけとる' },
                start: 3,
                end: 7,
                length: 4,
                rubies: [
                    { text: 'う', start: 3, end: 4, length: 1 },
                    { text: 'と', start: 5, end: 6, length: 1 },
                ],
                pitchClass: '',
                sentence: target.text,
            },
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['席', '受け取る']);
        expect(Array.from(document.querySelectorAll('rt.jpdb-reader-furi')).map(rt => rt.textContent)).toEqual(['せき', 'う', 'と']);
    });

    it('scans JPDB native-ruby primary spellings as one word and skips alternate spellings', () => {
        const rectSpy = mockElementBoundingClientRect({ width: 900, height: 260 });
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-spelling with-furigana">
                    <div class="primary-spelling"><ruby class="v">母<rt>はは</rt></ruby></div>
                    <div>ハハ</div>
                </div>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="description">かか was used by children</div>
                </div>
            </div>
        `;

        const targets = collectScanTargets(10, 'https://jpdb.io/search?q=HAHA&lang=english#a');
        rectSpy.mockRestore();

        const texts = targets.map(target => target.text);
        expect(texts).toContain('かか was used by children');
        expect(texts).toContain('母');
        expect(texts).not.toContain('ハハ');
    });

    it('normalizes structured OCR responses for image overlays', () => {
        const result = normalizeOcrResult({
            context_resolution: { width: 800, height: 1200 },
            results: [{
                text_lines: [{ content: '学校へ行く' }],
                is_vertical: true,
                box: {
                    top_left: { x: 650, y: 120 },
                    top_right: { x: 720, y: 120 },
                    bottom_right: { x: 720, y: 760 },
                    bottom_left: { x: 650, y: 760 },
                },
            }],
        });

        expect(result?.lines[0]).toMatchObject({
            text: '学校へ行く',
            vertical: true,
            box: { left: 650, top: 120, width: 70, height: 640 },
        });
    });

    it('drops separate OCR furigana rows when a larger kanji title row is present', () => {
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'かがみ', box: { left: 180, top: 110, width: 150, height: 34 } },
                { text: 'むら', box: { left: 670, top: 104, width: 120, height: 34 } },
                { text: '鏡のない村', box: { left: 170, top: 145, width: 620, height: 120 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['鏡のない村']);
    });

    it('drops vertical OCR furigana columns next to larger kanji title columns', () => {
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'かがみ', vertical: true, box: { left: 300, top: 120, width: 28, height: 150 } },
                { text: '鏡のない村', vertical: true, box: { left: 335, top: 110, width: 90, height: 520 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['鏡のない村']);
    });

    it('keeps a short full-size kana column beside a kanji column (not furigana)', () => {
        // Reported manga panel: それにしても is a real dialogue column, just shorter
        // (fewer glyphs) than its neighbour. It must survive — the old height/glyph
        // -count clause wrongly deleted it as a furigana strip for こんなに若くて可愛い.
        // Both columns share the same glyph width (~70px), so neither is a thin
        // half-size reading strip.
        const result = normalizeOcrResult({
            width: 1000,
            height: 1200,
            lines: [
                { text: 'それにしても', vertical: true, box: { left: 720, top: 120, width: 70, height: 360 } },
                { text: 'こんなに若くて可愛い', vertical: true, box: { left: 640, top: 110, width: 70, height: 600 } },
            ],
        }, 1000, 1200);

        expect(result?.lines.map(line => line.text)).toEqual(['それにしても', 'こんなに若くて可愛い']);
    });
});
