import { afterEach, describe, expect, it, vi } from 'vitest';
import { JitenPublicVocabularyClient, resetJitenPublicVocabularyBackoffForTests } from '../../src/reader/dictionaries/jiten-public-vocabulary';
import type { ReaderHttpOptions } from '../../src/reader/network/http';

describe('JitenPublicVocabularyClient', () => {
    afterEach(() => {
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.removeItem('yomu:jiten-public-cache:v1');
    });

    it('hydrates keyless vocabulary details with reading and pitch accents', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [
                    { wordId: 1381470, readingIndex: 0, originalText: '青空' },
                    { wordId: 2029010, readingIndex: 0, originalText: 'を' },
                    { wordId: 1456360, readingIndex: 0, originalText: '読む' },
                ];
            }
            if (url.includes('/vocabulary/1381470/0/info')) {
                return {
                    wordId: 1381470,
                    mainReading: { text: '青[あお]空[ぞら]', frequencyRank: 6924 },
                    partsOfSpeech: ['n'],
                    definitions: [{ meanings: ['blue sky'], partsOfSpeech: ['noun'] }],
                    pitchAccents: [3],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const card = await client.lookup('青空');

        expect(card).toMatchObject({
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jiten',
            jitenWordId: 1381470,
            jitenReadingIndex: 0,
            frequencyRank: 6924,
            pitchAccent: ['LHHLL'],
        });
        expect(requestJson).toHaveBeenCalledTimes(2);

        await expect(client.lookup('青空')).resolves.toBe(card);
        expect(requestJson).toHaveBeenCalledTimes(2);
    });

    it('dedupes batched public detail requests', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [
                    { wordId: 1381470, readingIndex: 0, originalText: '青空' },
                    { wordId: 1381470, readingIndex: 0, originalText: '青空' },
                ];
            }
            if (url.includes('/vocabulary/1381470/0/info')) {
                return {
                    wordId: 1381470,
                    mainReading: { text: '青[あお]空[ぞら]', frequencyRank: 6924 },
                    definitions: [{ meanings: ['blue sky'] }],
                    pitchAccents: [3],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const cards = await client.lookupMany(['青空', '青空']);

        expect(cards.get('青空')).toMatchObject({ spelling: '青空', pitchAccent: ['LHHLL'] });
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/parse?'))).toHaveLength(1);
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/1381470/0/info'))).toHaveLength(1);
    });

    it('keeps decomposed words inside their own batched term boundary', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [
                    { wordId: 1355900, readingIndex: 0, originalText: '登録' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 1008910, readingIndex: 2, originalText: 'どう' },
                    { wordId: 1157170, readingIndex: 1, originalText: 'する' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 0, readingIndex: 0, originalText: '未登録語' },
                ];
            }
            if (url.includes('/vocabulary/1355900/0/info')) {
                return {
                    wordId: 1355900,
                    mainReading: { text: '登[とう]録[ろく]' },
                    definitions: [{ meanings: ['registration'] }],
                };
            }
            if (url.includes('/vocabulary/1008910/2/info')) {
                return {
                    wordId: 1008910,
                    mainReading: { text: 'どう' },
                    definitions: [{ meanings: ['how', 'in what way'] }],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const cards = await client.lookupMany(['登録', 'どうする', '未登録語'], { detailLimit: 2 });

        expect(cards.get('登録')).toMatchObject({ spelling: '登録', meanings: [{ glosses: ['registration'] }] });
        expect(cards.get('どうする')).toMatchObject({ spelling: 'どう', meanings: [{ glosses: ['how', 'in what way'] }] });
        expect(cards.has('未登録語')).toBe(false);
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/parse?'))).toHaveLength(1);
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/info'))).toHaveLength(2);
        expect(requestJson.mock.calls.some(([url]) => String(url).includes('/vocabulary/1157170/1/info'))).toBe(false);
    });

    it('caches keyless public Jiten cards across client instances', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [{ wordId: 1381470, readingIndex: 0, originalText: '青空' }];
            }
            if (url.includes('/vocabulary/1381470/0/info')) {
                return {
                    wordId: 1381470,
                    mainReading: { text: '青[あお]空[ぞら]', frequencyRank: 6924 },
                    definitions: [{ meanings: ['blue sky'] }],
                    pitchAccents: [3],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });

        const first = await new JitenPublicVocabularyClient({ requestJsonImpl: requestJson }).lookup('青空');
        const second = await new JitenPublicVocabularyClient({ requestJsonImpl: requestJson }).lookup('青空');

        expect(first).toMatchObject({ spelling: '青空', reading: 'あおぞら', source: 'jiten' });
        expect(second).toMatchObject({ spelling: '青空', reading: 'あおぞら', source: 'jiten' });
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/parse?'))).toHaveLength(1);
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/1381470/0/info'))).toHaveLength(1);
        expect(localStorage.getItem('yomu:jiten-public-cache:v1')).toContain('card');
    });

    it('caps keyless public detail fan-out for large batches', async () => {
        const terms = Array.from({ length: 16 }, (_, index) => `語${index}`);
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return terms.map((term, index) => ({
                    wordId: index + 1,
                    readingIndex: 0,
                    originalText: term,
                }));
            }
            const match = url.match(/\/vocabulary\/(\d+)\/0\/info/u);
            if (match) {
                const index = Number(match[1]) - 1;
                return {
                    wordId: index + 1,
                    mainReading: { text: terms[index] },
                    definitions: [{ meanings: [`definition ${index}`] }],
                    pitchAccents: [],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const cards = await client.lookupMany(terms);

        expect(cards.size).toBe(12);
        expect(cards.has('語0')).toBe(true);
        expect(cards.has('語12')).toBe(false);
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/parse?'))).toHaveLength(1);
        expect(requestJson.mock.calls.filter(([url]) => /\/vocabulary\/\d+\/0\/info/u.test(String(url)))).toHaveLength(12);
    });

    it('hydrates bounded details for public parsed paragraphs', async () => {
        const requestJson = vi.fn(async (url: string, options?: ReaderHttpOptions) => {
            if (url.includes('/vocabulary/parse?')) {
                expect(new URL(url).searchParams.get('text')).toBe('本を読む。\n猫を見る。');
                expect(options).toMatchObject({ anonymous: true, allowPublicProxies: false, proxyUrl: '' });
                return [
                    { wordId: 112, readingIndex: 0, originalText: '本' },
                    { wordId: 2029010, readingIndex: 0, originalText: 'を' },
                    { wordId: 1456360, readingIndex: 0, originalText: '読む' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 113, readingIndex: 0, originalText: '猫' },
                    { wordId: 2029010, readingIndex: 0, originalText: 'を' },
                    { wordId: 1259290, readingIndex: 0, originalText: '見る' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                ];
            }
            const match = url.match(/\/vocabulary\/(\d+)\/0\/info/u);
            if (match) {
                const details = new Map([
                    [112, { text: '本[ほん]', pitchAccents: [1] }],
                    [2029010, { text: 'を', pitchAccents: [] }],
                    [1456360, { text: '読[よ]む', pitchAccents: [1] }],
                    [113, { text: '猫[ねこ]', pitchAccents: [1] }],
                    [1259290, { text: '見[み]る', pitchAccents: [1] }],
                ]);
                const detail = details.get(Number(match[1]));
                if (detail) {
                    return {
                        wordId: Number(match[1]),
                        mainReading: { text: detail.text },
                        definitions: [{ meanings: ['definition'] }],
                        pitchAccents: detail.pitchAccents,
                    };
                }
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const parsed = await client.parse(['本を読む。', '猫を見る。']);

        expect(parsed.map(tokens => tokens.map(token => token.card.spelling))).toEqual([
            ['本', 'を', '読む'],
            ['猫', 'を', '見る'],
        ]);
        expect(parsed[1]?.[0]).toMatchObject({
            start: 0,
            end: 1,
            card: { source: 'jiten', jitenWordId: 113, jitenReadingIndex: 0, reading: 'ねこ', pitchAccent: ['HLL'] },
            pitchClass: 'atamadaka',
        });
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/parse?'))).toHaveLength(1);
        expect(requestJson.mock.calls.filter(([url]) => /\/vocabulary\/\d+\/\d+\/info/u.test(String(url)))).toHaveLength(5);
    });

    it('backs off after transient upstream failures so cold enrichment can skip Jiten quickly', async () => {
        const requestJson = vi.fn(async () => {
            throw new Error('Public Jiten request failed (503).');
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        await expect(client.lookupMany(['青空'])).resolves.toEqual(new Map());
        await expect(client.lookupMany(['読む'])).resolves.toEqual(new Map());

        expect(requestJson).toHaveBeenCalledTimes(1);
    });

    it('drains queued parse chunks after the first transient upstream failure', async () => {
        const requestJson = vi.fn(async () => {
            throw new Error('Public Jiten request failed (503).');
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        const terms = Array.from({ length: 5 }, (_, index) => `長い単語${index}${'あ'.repeat(1900)}`);

        await expect(client.lookupMany(terms)).resolves.toEqual(new Map());

        expect(requestJson).toHaveBeenCalledTimes(1);
    });

    it('shares transient backoff across client instances', async () => {
        const requestJson = vi.fn(async () => {
            throw new Error('Public Jiten request failed (503).');
        });
        const first = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        const second = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        await expect(first.lookupMany(['青空'])).resolves.toEqual(new Map());
        await expect(second.lookupMany(['読む'])).resolves.toEqual(new Map());

        expect(requestJson).toHaveBeenCalledTimes(1);
    });

    it('backs off after abort-shaped fetch timeouts', async () => {
        const requestJson = vi.fn(async () => {
            throw new DOMException('Aborted', 'AbortError');
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        await expect(client.lookupMany(['青空'])).resolves.toEqual(new Map());
        await expect(client.lookupMany(['読む'])).resolves.toEqual(new Map());

        expect(requestJson).toHaveBeenCalledTimes(1);
    });

    it('separates ambiguous short batch terms for Jiten parsing', async () => {
        const details = new Map([
            [1444810, { text: '登録[とうろく]', pitchAccents: [0] }],
            [1322990, { text: '者[もの]', pitchAccents: [2] }],
            [1580825, { text: '数[かず]', pitchAccents: [1] }],
            [1584500, { text: '万[まん]人[にん]', pitchAccents: [0] }],
            [1451290, { text: '動画[どうが]', pitchAccents: [0] }],
            [1315840, { text: '時[とき]', pitchAccents: [2] }],
            [1259290, { text: '見[み]る', pitchAccents: [1] }],
        ]);
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                expect(new URL(url).searchParams.get('text')).toBe('登録。者。数。万人。動画。時。見る。未登録語');
                return [
                    { wordId: 1444810, readingIndex: 0, originalText: '登録' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 1322990, readingIndex: 0, originalText: '者' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 1580825, readingIndex: 0, originalText: '数' },
                    { wordId: 1584500, readingIndex: 0, originalText: '万人' },
                    { wordId: 1451290, readingIndex: 0, originalText: '動画' },
                    { wordId: 1315840, readingIndex: 0, originalText: '時' },
                    { wordId: 1259290, readingIndex: 0, originalText: '見る' },
                ];
            }
            const match = url.match(/\/vocabulary\/(\d+)\/0\/info/u);
            const detail = match ? details.get(Number(match[1])) : undefined;
            if (detail) {
                return {
                    wordId: Number(match?.[1]),
                    mainReading: { text: detail.text },
                    definitions: [{ meanings: ['definition'] }],
                    pitchAccents: detail.pitchAccents,
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const cards = await client.lookupMany(['登録', '者', '数', '万人', '動画', '時', '見る', '未登録語']);

        expect(cards.get('登録')).toMatchObject({ spelling: '登録', reading: 'とうろく', source: 'jiten' });
        expect(cards.get('万人')).toMatchObject({ spelling: '万人', reading: 'まんにん', source: 'jiten' });
        expect(cards.get('見る')).toMatchObject({ spelling: '見る', reading: 'みる', source: 'jiten' });
        expect(cards.has('未登録語')).toBe(false);
        expect(requestJson.mock.calls.some(([url]) => String(url).includes('/vocabulary/0/0/info'))).toBe(false);
    });
});
