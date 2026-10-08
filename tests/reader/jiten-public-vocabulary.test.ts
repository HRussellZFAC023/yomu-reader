import recordedParagraphBatch from './fixtures/public-jiten-paragraph-batch-20261007.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureManagedWebStorageCurrent } from '../../src/reader/app/storage';
import {
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    JitenPublicVocabularyClient,
    parsedCardHydrationKey,
    resetJitenPublicVocabularyBackoffForTests,
} from '../../src/reader/dictionaries/jiten-public-vocabulary';
import type { JPDBCard } from '../../src/reader/app/types';
import type { ReaderHttpOptions } from '../../src/reader/network/http';

function parsedJitenCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    // Shape produced by the public /parse pass: the SURFACE is the spelling,
    // the reading is empty — hydration is what fills reading/pitch/meanings.
    return {
        vid: 1381470, sid: 0, rid: 0,
        spelling: '青空', reading: '',
        frequencyRank: null, partOfSpeech: [], meanings: [],
        cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null,
        source: 'jiten', jitenWordId: 1381470, jitenReadingIndex: 0,
        ...overrides,
    } as unknown as JPDBCard;
}

describe('JitenPublicVocabularyClient', () => {
    beforeEach(async () => {
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.removeItem('yomu:jiten-public-cache:v2');
        await ensureManagedWebStorageCurrent();
    });

    afterEach(() => {
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.removeItem('yomu:jiten-public-cache:v2');
    });

    it('keeps recorded Wikipedia compounds whole across independent paragraph boundaries', async () => {
        const requests: string[] = [];
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: async url => {
            const text = new URL(url).searchParams.get('text')!;
            requests.push(text);
            const recorded = recordedParagraphBatch.responses.find(response => response.text === text);
            if (!recorded) throw new Error('Request absent from recorded browser/API evidence.');
            return recorded.body;
        } });
        const paragraphs = [...recordedParagraphBatch.paragraphs];
        const original = [...paragraphs];
        const parsed = await client.parse(paragraphs, { detailLimit: 0 });
        expect(requests).toHaveLength(2);
        expect(paragraphs).toEqual(original);
        // The bad HTTP200 body had zero tokens for this heading occurrence,
        // not just a missing reading; its source paragraph and offset matter.
        const heading = paragraphs.indexOf('日本語（にほんご、にっぽんご');
        expect(parsed[heading][0]).toMatchObject({ start: 0, end: 3, card: { spelling: '日本語', jitenWordId: 1464530 } });
        for (const [surface, id] of [['日本人', 1464700], ['言語', 1264420], ['国語', 1286370]] as const) {
            const paragraphIndex = paragraphs.findIndex(text => text.includes('そして国外') && text.includes(surface)
                || text.includes('唯一の公用語') && text.includes(surface));
            const start = paragraphs[paragraphIndex].indexOf(surface);
            expect(parsed[paragraphIndex].find(token => token.start === start))
                .toMatchObject({ start, end: start + surface.length, card: { spelling: surface, jitenWordId: id } });
        }
        parsed.forEach((tokens, index) => tokens.forEach(token => {
            expect(token.sentence).toBe(original[index]);
            expect(original[index].slice(token.start, token.end)).toBe(token.card.spelling);
            expect(token.card.spelling).not.toBe('。');
        }));
    });

    it('keeps authored intra-paragraph line breaks and excludes transport punctuation from tokens', async () => {
        const paragraphs = ['日本語\n日本人', '言語'];
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: async url => {
            expect(new URL(url).searchParams.get('text')).toBe('日本語\n日本人。言語');
            return [
                { wordId: 1464530, readingIndex: 0, originalText: '日本語' },
                { wordId: 0, readingIndex: 0, originalText: '\n' },
                { wordId: 1464700, readingIndex: 0, originalText: '日本人' },
                // Even a provider erroneously assigning an id to our separator
                // cannot project it into either original paragraph's range.
                { wordId: 1, readingIndex: 0, originalText: '。' },
                { wordId: 1264420, readingIndex: 0, originalText: '言語' },
            ];
        } });
        const tokens = await client.parse(paragraphs, { detailLimit: 0 });
        expect(tokens.map(group => group.map(token => [token.start, token.end, token.card.spelling])))
            .toEqual([[[0, 3, '日本語'], [4, 7, '日本人']], [[0, 2, '言語']]]);
        expect(tokens[0].every(token => token.sentence === paragraphs[0])).toBe(true);
    });

    it('does not invent a lexical form when detail metadata is missing', async () => {
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: async url => url.includes('/parse?')
            ? [{ wordId: 1006730, readingIndex: 2, originalText: 'そして' }]
            : { wordId: 1006730, mainReading: {}, partsOfSpeech: ['conj'] } });
        await expect(client.lookup('そして')).resolves.toBeNull();
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

    it('preserves Jiten compound decomposition for honest component pitch rendering', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [{ wordId: 2856524, readingIndex: 0, originalText: '登録者数' }];
            }
            if (url.includes('/vocabulary/2856524/0/info')) {
                return {
                    wordId: 2856524,
                    mainReading: { text: '登[とう]録[ろく]者[しゃ]数[すう]' },
                    definitions: [{ meanings: ['subscriber count'], partsOfSpeech: ['noun'] }],
                    pitchAccents: [],
                    composedOf: [
                        { wordId: 1355900, readingIndex: 0, reading: 'とうろく', readingFurigana: '登[とう]録[ろく]', matchSurface: '登録' },
                        { wordId: 1580930, readingIndex: 0, reading: 'しゃ', readingFurigana: '者[しゃ]', matchSurface: '者' },
                        { wordId: 1348900, readingIndex: 0, reading: 'すう', readingFurigana: '数[すう]', matchSurface: '数' },
                    ],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const card = await client.lookup('登録者数');

        expect(card).toMatchObject({
            spelling: '登録者数',
            reading: 'とうろくしゃすう',
            pitchAccent: [],
            pitchComponents: [
                { spelling: '登録', reading: 'とうろく', pitchAccent: [], wordWithReading: '登[とう]録[ろく]' },
                { spelling: '者', reading: 'しゃ', pitchAccent: [], wordWithReading: '者[しゃ]' },
                { spelling: '数', reading: 'すう', pitchAccent: [], wordWithReading: '数[すう]' },
            ],
        });
    });

    it('maps kana-only component furigana through matchSurface', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [{ wordId: 900100, readingIndex: 0, originalText: '高評価' }];
            }
            if (url.includes('/vocabulary/900100/0/info')) {
                return {
                    wordId: 900100,
                    mainReading: { text: '高[こう]評[ひょう]価[か]' },
                    pitchAccents: [],
                    composedOf: [
                        { wordId: 900101, readingIndex: 0, reading: 'こう', readingFurigana: 'こう', matchSurface: '高', pitchAccents: [1] },
                        { wordId: 900102, readingIndex: 0, reading: 'ひょうか', readingFurigana: 'ひょうか', matchSurface: '評価', pitchAccents: [0] },
                    ],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const card = await client.lookup('高評価');

        expect(card?.pitchComponents).toEqual([
            { spelling: '高', reading: 'こう', pitchAccent: ['HLL'], wordWithReading: null },
            { spelling: '評価', reading: 'ひょうか', pitchAccent: ['LHHH'], wordWithReading: null },
        ]);
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

    it('bounds encoded public parse requests and preserves candidate groups across chunks', async () => {
        const terms = Array.from({ length: 250 }, (_, index) => `日本語${index}`);
        const requestedGroups: string[][] = [];
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                const text = new URL(url).searchParams.get('text')!;
                expect(encodeURIComponent(text).length).toBeLessThanOrEqual(6000);
                const group = text.split('。');
                requestedGroups.push(group);
                return group.flatMap(term => [
                    { wordId: terms.indexOf(term) + 1, readingIndex: 0, originalText: term },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                ]);
            }
            const id = Number(url.match(/vocabulary\/(\d+)\//)?.[1]);
            return { wordId: id, mainReading: { text: terms[id - 1] }, definitions: [] };
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        const cards = await client.lookupMany(terms, { detailLimit: terms.length });
        expect(requestedGroups.length).toBeGreaterThan(1);
        expect(requestedGroups.flat()).toEqual(terms);
        expect([...cards].map(([term, card]) => [term, card.jitenWordId])).toEqual(terms.map((term, index) => [term, index + 1]));
    });

    it('bounds even one oversized lookup term without dropping source text', async () => {
        const term = 'あ'.repeat(1900);
        const chunks: string[] = [];
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: async url => {
            const text = new URL(url).searchParams.get('text')!;
            expect(encodeURIComponent(text).length).toBeLessThanOrEqual(6000);
            chunks.push(text);
            return [{ wordId: 0, readingIndex: 0, originalText: text }];
        } });
        await expect(client.lookup(term)).resolves.toBeNull();
        expect(chunks.join('')).toBe(term);
        expect(chunks.length).toBeGreaterThan(1);
    });

    it('bounds encoded paragraph chunks while retaining source offsets', async () => {
        const paragraph = '日本語'.repeat(634);
        const requests: string[] = [];
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: async url => {
            const text = new URL(url).searchParams.get('text')!;
            expect(encodeURIComponent(text).length).toBeLessThanOrEqual(6000);
            requests.push(text);
            return [...text].map(originalText => ({ wordId: 1, readingIndex: 0, originalText }));
        } });
        const [tokens] = await client.parse([paragraph], { detailLimit: 0 });
        expect(requests.join('')).toBe(paragraph);
        expect(tokens.map(token => paragraph.slice(token.start, token.end)).join('')).toBe(paragraph);
        expect(tokens.map(token => token.start)).toEqual(Array.from({ length: paragraph.length }, (_, index) => index));
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
        expect(localStorage.getItem('yomu:jiten-public-cache:v2')).toContain('card');
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
                expect(new URL(url).searchParams.get('text')).toBe('本を読む。。猫を見る。');
                // Keyless allowlisted GETs must keep the built-in public proxy
                // available: on hosted pages with no GM bridge and no configured
                // proxy it is the only transport to api.jiten.moe (no CORS there).
                expect(options).toMatchObject({ anonymous: true, allowPublicProxies: true, proxyUrl: '' });
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

    it('keeps a compact annotation target inside the hard detail cap', async () => {
        const prefixTerms = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '仮'];
        const targetTerms = ['並べ替え', '基準'];
        const allTerms = [...prefixTerms, ...targetTerms];
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                expect(new URL(url).searchParams.get('text')).toBe(`${prefixTerms.join('。')}。並べ替え基準`);
                return allTerms.map((term, index) => ({
                    wordId: index + 1,
                    readingIndex: 0,
                    originalText: term,
                }));
            }
            const match = url.match(/\/vocabulary\/(\d+)\/0\/info/u);
            if (match) {
                const index = Number(match[1]) - 1;
                const annotatedReadings = [
                    '甲[こう]', '乙[おつ]', '丙[へい]', '丁[てい]', '戊[ぼ]', '己[き]',
                    '庚[こう]', '辛[しん]', '壬[じん]', '癸[き]', '仮[かり]',
                    '並[なら]べ替[か]え', '基[き]準[じゅん]',
                ];
                return {
                    wordId: index + 1,
                    mainReading: { text: annotatedReadings[index] },
                    definitions: [{ meanings: [`definition ${index}`] }],
                    pitchAccents: [0],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const parsed = await client.parse([...prefixTerms, '並べ替え基準'], { detailLimit: 12 });

        expect(parsed.at(-1)?.map(token => token.card)).toMatchObject([
            { spelling: '並べ替え', reading: 'ならべかえ', pitchAccent: ['LHHHHH'] },
            { spelling: '基準', reading: '', pitchAccent: [] },
        ]);
        expect(requestJson.mock.calls.filter(([url]) => /\/vocabulary\/\d+\/0\/info/u.test(String(url)))).toHaveLength(12);
    });

    it('does not overrun a caller detail budget smaller than the atomic title cap', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [
                    { wordId: 1, readingIndex: 0, originalText: '並べ替え' },
                    { wordId: 2, readingIndex: 0, originalText: '基準' },
                ];
            }
            if (url.includes('/vocabulary/1/0/info')) {
                return {
                    wordId: 1,
                    mainReading: { text: '並[なら]べ替[か]え' },
                    definitions: [{ meanings: ['sorting'] }],
                    pitchAccents: [0],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const [tokens] = await client.parse(['並べ替え基準'], { detailLimit: 1 });

        expect(tokens?.map(token => token.card.reading)).toEqual(['ならべかえ', '']);
        expect(requestJson.mock.calls.filter(([url]) => /\/vocabulary\/\d+\/0\/info/u.test(String(url)))).toHaveLength(1);
    });

    it('leaves a normal title tail sparse instead of overrunning the batch detail cap', async () => {
        const prefixWords = [
            { wordId: 11, readingIndex: 0, originalText: '音楽' },
            { wordId: 12, readingIndex: 0, originalText: 'ゲーム' },
            { wordId: 13, readingIndex: 0, originalText: 'ライブ' },
            { wordId: 14, readingIndex: 0, originalText: '観光' },
        ];
        const title = '【ひとり旅】猛暑にハプニングありながらも、さいこうすぎたひとり旅in香川';
        const titleWords = [
            { wordId: 1602030, readingIndex: 1, originalText: 'ひとり旅' },
            { wordId: 1534050, readingIndex: 0, originalText: '猛暑' },
            { wordId: 2028990, readingIndex: 0, originalText: 'に' },
            { wordId: 1096140, readingIndex: 0, originalText: 'ハプニング' },
            { wordId: 1296400, readingIndex: 2, originalText: 'ありながら' },
            { wordId: 2028940, readingIndex: 0, originalText: 'も' },
            { wordId: 1293850, readingIndex: 1, originalText: 'さいこう' },
            { wordId: 1195970, readingIndex: 1, originalText: 'すぎた' },
            { wordId: 1602030, readingIndex: 1, originalText: 'ひとり旅' },
            { wordId: 2845095, readingIndex: 0, originalText: '香川' },
        ];
        const nextTitle = '[Day319] 初心者エンジニア、自作した天気予報アプリの処理を責務の分離したい！';
        const nextTitleWords = [
            { wordId: 1342860, readingIndex: 0, originalText: '初心者' },
            { wordId: 1030910, readingIndex: 0, originalText: 'エンジニア' },
            { wordId: 1317760, readingIndex: 0, originalText: '自作した' },
            { wordId: 1438770, readingIndex: 0, originalText: '天気予報' },
            { wordId: 1018190, readingIndex: 0, originalText: 'アプリ' },
            { wordId: 1469800, readingIndex: 2, originalText: 'の' },
            { wordId: 1342510, readingIndex: 0, originalText: '処理' },
            { wordId: 2029010, readingIndex: 0, originalText: 'を' },
            { wordId: 1383230, readingIndex: 0, originalText: '責務' },
            { wordId: 1469800, readingIndex: 2, originalText: 'の' },
            { wordId: 1504370, readingIndex: 0, originalText: '分離したい' },
        ];
        const parsedWords = [...prefixWords, ...titleWords, ...nextTitleWords];
        const surfaceById = new Map(parsedWords.map(word => [word.wordId, word.originalText]));
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                expect(new URL(url).searchParams.get('text')).toBe(`${prefixWords.map(word => word.originalText).join('。')}。${title}。${nextTitle}`);
                return parsedWords;
            }
            const match = url.match(/\/vocabulary\/(\d+)\/(\d+)\/info/u);
            if (match) {
                const wordId = Number(match[1]);
                const surface = surfaceById.get(wordId);
                if (!surface) throw new Error(`Unexpected word id: ${wordId}`);
                return {
                    wordId,
                    mainReading: { text: wordId === 2845095 ? '香[か]川[がわ]' : surface },
                    definitions: [{ meanings: ['definition'] }],
                    pitchAccents: [0],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const parsed = await client.parse([
            ...prefixWords.map(word => word.originalText),
            title,
            nextTitle,
        ], { detailLimit: 12 });

        expect(parsed.at(-2)?.at(-1)).toMatchObject({
            card: { spelling: '香川', reading: '', source: 'jiten' },
        });
        expect(parsed.at(-1)?.every(token => token.card.reading === '')).toBe(true);
        expect(requestJson.mock.calls.filter(([url]) => /\/vocabulary\/\d+\/\d+\/info/u.test(String(url)))).toHaveLength(12);
    });

    it('never turns a 12-card detail limit into 23 requests at a target boundary', async () => {
        const prefix = Array.from({ length: 11 }, (_, index) => ({
            wordId: index + 1,
            readingIndex: 0,
            originalText: `前${index}`,
        }));
        const title = Array.from({ length: 12 }, (_, index) => ({
            wordId: 100 + index,
            readingIndex: 0,
            originalText: `語${index}`,
        }));
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) return [...prefix, ...title];
            const match = url.match(/\/vocabulary\/(\d+)\/0\/info/u);
            if (!match) throw new Error(`Unexpected URL: ${url}`);
            const wordId = Number(match[1]);
            const word = [...prefix, ...title].find(candidate => candidate.wordId === wordId);
            if (!word) throw new Error(`Unexpected word id: ${wordId}`);
            return {
                wordId,
                mainReading: { text: word.originalText },
                definitions: [{ meanings: ['definition'] }],
                pitchAccents: [0],
            };
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const parsed = await client.parse([
            ...prefix.map(word => word.originalText),
            title.map(word => word.originalText).join(''),
        ], { detailLimit: 12 });

        const details = requestJson.mock.calls.filter(([url]) => /\/vocabulary\/\d+\/0\/info/u.test(String(url)));
        expect(details).toHaveLength(12);
        expect(parsed.at(-1)?.filter(token => token.card.reading).length).toBe(1);
        expect(parsed.at(-1)?.filter(token => !token.card.reading).length).toBe(11);
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

    // Leia, 2026-10-05: "the jiten frequency badges one times out". When
    // api.jiten.moe throttles a burst it stops answering, and every request
    // ends on its transport's deadline. Those endings ("Jiten timeout.", a
    // RetryableTimeoutError) matched nothing the backoff knew, so each queued
    // lookup still waited its 1.5 s turn behind the one parse gate: on the
    // real extension a hovered word waited 13 s for its popup and the Jiten
    // badge never came. One timeout now backs off like a 429.
    it.each([
        ['a userscript manager', () => {
            const manager = vi.fn(() => ({ abort: () => undefined }));
            vi.stubGlobal('GM_xmlhttpRequest', manager);
            return manager;
        }],
        ['the page fetch', () => {
            const page = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
            }));
            vi.stubGlobal('fetch', page);
            return page;
        }],
    ])('stops queueing behind a Jiten that no longer answers %s', async (_transport, stall) => {
        vi.useFakeTimers();
        try {
            const transport = stall();
            const client = new JitenPublicVocabularyClient();

            const first = client.lookupMany(['公用語']);
            await vi.advanceTimersByTimeAsync(5_000);
            await expect(first).resolves.toEqual(new Map());
            const calls = transport.mock.calls.length;

            const next = client.lookupMany(['言語']);
            await vi.advanceTimersByTimeAsync(5_000);
            await expect(next).resolves.toEqual(new Map());
            expect(transport).toHaveBeenCalledTimes(calls);
        } finally {
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    // Backoff skips the network, not what is already known. A page's own
    // annotation spends api.jiten.moe's anonymous budget (300 a minute per
    // address); once it ran out, a hovered word the page had already looked
    // up came back empty, fell to a segmented card without its Jiten identity
    // and rank, and the popup's Jiten badge then needed requests that could
    // not get through.
    it('answers words it already looked up while Jiten is backed off', async () => {
        let throttled = false;
        const requestJson = vi.fn(async (url: string) => {
            if (throttled) throw new Error('Jiten fail (429).');
            if (url.includes('/vocabulary/parse?')) return [{ wordId: 1206820, readingIndex: 0, originalText: '学習' }];
            if (url.includes('/vocabulary/1206820/0/info')) {
                return { wordId: 1206820, mainReading: { text: '学[がく]習[しゅう]', frequencyRank: 6898 }, definitions: [{ meanings: ['study'] }] };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        await client.lookupMany(['学習']);
        throttled = true;
        await client.lookupMany(['公用語']);
        const sent = requestJson.mock.calls.length;

        const during = await client.lookupMany(['学習', '習']);

        expect(during.get('学習')).toMatchObject({ spelling: '学習', reading: 'がくしゅう', frequencyRank: 6898, jitenWordId: 1206820 });
        await expect(client.lookup('学習')).resolves.toMatchObject({ frequencyRank: 6898 });
        await expect(new JitenPublicVocabularyClient({ requestJsonImpl: requestJson }).lookupMany(['学習']))
            .resolves.toEqual(new Map([['学習', expect.objectContaining({ frequencyRank: 6898 })]]));
        expect(requestJson).toHaveBeenCalledTimes(sent);
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

    it('keys hydrateCards results by the exported hydration key so callers can re-key against cardKey', async () => {
        const requestJson = vi.fn(async (url: string) => {
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
        const parsed = parsedJitenCard();

        const cards = await client.hydrateCards([parsed]);

        // The map key is vid:sid — deliberately NOT cardKey (which embeds the
        // surface spelling and the empty parse-time reading). The reader's
        // grouped hydration used to look results up by cardKey and silently
        // dropped EVERY hydrated card, leaving budget-deferred page words
        // without readings (the homepage furigana starvation).
        expect(parsedCardHydrationKey(parsed)).toBe('1381470:0');
        expect(cards.get(parsedCardHydrationKey(parsed))).toMatchObject({ spelling: '青空', reading: 'あおぞら' });
        expect(cards.size).toBe(1);
    });

    it('hydrates background details with the relaxed background timeout', async () => {
        const timeouts: Array<number | undefined> = [];
        const requestJson = vi.fn(async (url: string, options?: ReaderHttpOptions) => {
            if (url.includes('/info')) timeouts.push(options?.timeoutMs);
            return {
                wordId: 1381470,
                mainReading: { text: '青[あお]空[ぞら]' },
                definitions: [{ meanings: ['blue sky'] }],
            };
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        await client.hydrateCards([parsedJitenCard()]);

        // Background reading/pitch hydration is not popover-latency-bound; over
        // slow userscript-manager bridges a healthy /info takes >1.5s and the
        // old interactive timeout turned most of a page's readings into nulls.
        expect(timeouts).toEqual([JITEN_BACKGROUND_DETAIL_TIMEOUT_MS]);
    });

    it('retries a detail lookup that failed transiently instead of caching the null for the full TTL', async () => {
        vi.useFakeTimers();
        try {
            let failFirst = true;
            const requestJson = vi.fn(async (url: string) => {
                if (!url.includes('/vocabulary/1381470/0/info')) throw new Error(`Unexpected URL: ${url}`);
                if (failFirst) {
                    failFirst = false;
                    throw new Error('Jiten timeout.');
                }
                return {
                    wordId: 1381470,
                    mainReading: { text: '青[あお]空[ぞら]' },
                    definitions: [{ meanings: ['blue sky'] }],
                };
            });
            const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
            const parsed = parsedJitenCard();

            const first = await client.hydrateCards([parsed]);
            expect(first.size).toBe(0);

            // Within the transient window the null is served from cache …
            await vi.advanceTimersByTimeAsync(1_000);
            const cachedNull = await client.hydrateCards([parsed]);
            expect(cachedNull.size).toBe(0);
            expect(requestJson).toHaveBeenCalledTimes(1);

            // … but once it expires the retry goes back to the network and heals.
            await vi.advanceTimersByTimeAsync(6_000);
            const healed = await client.hydrateCards([parsed]);
            expect(healed.get(parsedCardHydrationKey(parsed))).toMatchObject({ reading: 'あおぞら' });
            expect(requestJson).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
