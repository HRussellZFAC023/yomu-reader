import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { ensureManagedWebStorageCurrent } from '../../src/reader/app/storage';
import { resetManagedWebStorageForTests } from '../../src/reader/app/managed-web-storage';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { enrichCardFromJitenVocabularyInfo, JitenApiClient } from '../../src/reader/dictionaries/jiten';
import {
    JitenPublicVocabularyClient,
    publicJitenBackoffRemainingMs,
    resetJitenPublicVocabularyBackoffForTests,
} from '../../src/reader/dictionaries/jiten-public-vocabulary';
import type { ReaderHttpOptions } from '../../src/reader/network/http';
import type { ReaderSettings } from "../../src/reader/app/types";
import { ReaderParser, jpdbFirstParseOptions } from "../../src/reader/lookup/parser";
import { textLookupParseOptions } from "../../src/reader/main/text-lookup";
import { DEFAULT_SETTINGS } from "../../src/reader/settings";

// The popup's word detail against the page's own api.jiten.moe traffic. The
// popup (JitenApiClient) and the page's lanes (JitenPublicVocabularyClient)
// reach one fake api.jiten.moe with Jiten's published limiter: 120 requests a
// minute per address in six sliding 10 s segments, the rest refused with 429.
// 2.1.6 sent the popup's requests outside the page's budget and gave up on
// the first refusal, so 先生 opened with "Exact pitch unavailable", no rank
// and "In context ×1" (owner report, 2026-10-19).

// GET /api/vocabulary/1387990/0/info on 2026-10-19, trimmed to the fields Yomu reads.
const SENSEI_INFO = {
    wordId: 1387990,
    mainReading: { text: '先[せん]生[せい]', readingType: 0, readingIndex: 0, frequencyRank: 330, usedInMediaAmount: 13434 },
    alternativeReadings: [{ text: 'せんせい', readingType: 1, readingIndex: 1, frequencyRank: 9896, usedInMediaAmount: 2240 }],
    partsOfSpeech: ['n', 'n-suf'],
    definitions: [{ meanings: ['teacher', 'instructor', 'master'], partsOfSpeech: ['n'] }],
    pitchAccents: [3],
    composedOf: [],
    usedIn: [],
};

function fakeJiten() {
    const permits: number[] = [];
    const paths: string[] = [];
    let refused = 0;
    const answer = vi.fn(async (url: string, _options?: ReaderHttpOptions): Promise<unknown> => {
        const target = new URL(url);
        paths.push(target.pathname);
        const now = Date.now();
        while (permits.length && (Math.floor(permits[0] / 10_000) + 6) * 10_000 <= now) permits.shift();
        if (permits.length >= 120) {
            refused++;
            throw new Error('Jiten fail (429).');
        }
        permits.push(now);
        if (target.pathname.endsWith('/random-example-sentences')) return [];
        if (target.pathname === '/api/vocabulary/search') {
            return target.searchParams.get('query') === '先生'
                ? { results: [{ wordId: 1387990, readingIndex: 0, text: '先生', rubyText: '先[せん]生[せい]', frequencyRank: 330 }] }
                : { results: [] };
        }
        const text = target.searchParams.get('text');
        if (text !== null) return [...text].map((character, index) => ({ wordId: 900_000 + index, readingIndex: 0, originalText: character }));
        const wordId = Number(/vocabulary\/(\d+)\//u.exec(target.pathname)?.[1]);
        return wordId === SENSEI_INFO.wordId ? SENSEI_INFO : { wordId, mainReading: { text: `語${wordId}`, readingIndex: 0, frequencyRank: wordId % 1000 } };
    });
    return {
        answer,
        detailRequests: (wordId: number) => paths.filter(path => path === `/api/vocabulary/${wordId}/0/info`).length,
        refused: () => refused,
        // Requests another tab on this address already sent this minute.
        spend: (count: number) => permits.push(...Array.from({ length: count }, () => Date.now())),
    };
}

function readers(answer: ReturnType<typeof fakeJiten>['answer']) {
    const page = new JitenPublicVocabularyClient({ requestJsonImpl: answer });
    const popup = new JitenApiClient(() => '', { requestImpl: answer, anonymous: page });
    return { page, popup };
}

// 先生 as the page's parse reads it: Jiten's identity, no reading, pitch or rank yet.
function parsedSensei(): JPDBCard {
    return {
        vid: 1387990, sid: 0, rid: 0, spelling: '先生', reading: '', frequencyRank: null, partOfSpeech: [], meanings: [],
        cardState: ['not-in-deck'], provisionalState: true, pitchAccent: [], wordWithReading: null,
        source: 'jiten', jitenWordId: 1387990, jitenReadingIndex: 0,
    };
}

function sparseCard(wordId: number): JPDBCard {
    return { ...parsedSensei(), vid: wordId, spelling: `語${wordId}`, jitenWordId: wordId };
}

describe("the popup's Jiten word detail", () => {
    beforeEach(async () => {
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.clear();
        sessionStorage.clear();
        resetManagedWebStorageForTests();
        resetManagedStateEpochSessionsForTests();
        await ensureManagedWebStorageCurrent();
    });

    afterEach(() => {
        vi.useRealTimers();
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.removeItem('yomu:jiten-public-cache:v2');
    });

    it("draws 先生's pitch and rank after Jiten refused the page's enrichment", async () => {
        vi.useFakeTimers();
        const jiten = fakeJiten();
        const { page, popup } = readers(jiten.answer);
        jiten.spend(120);
        await page.hydrateCards([sparseCard(500_001), sparseCard(500_002)]);
        expect(publicJitenBackoffRemainingMs()).toBeGreaterThan(0);

        const card = parsedSensei();
        const detail = popup.lookupVocabularyInfoForCard(card);
        void detail.catch(() => undefined);
        await vi.advanceTimersByTimeAsync(70_000);
        const info = await detail;
        enrichCardFromJitenVocabularyInfo(card, info);

        expect(info?.pitchAccents).toEqual([3]);
        expect(info?.mainReading?.frequencyRank).toBe(330);
        expect(card).toMatchObject({ reading: 'せんせい', frequencyRank: 330, pitchAccent: ['LHHLL'] });
    });

    it('finds the word first when the hover had no Jiten identity for it', async () => {
        vi.useFakeTimers();
        const jiten = fakeJiten();
        const { page, popup } = readers(jiten.answer);
        jiten.spend(120);
        await page.hydrateCards([sparseCard(500_003)]);
        // The segmenter's card while the hover could not ask Jiten.
        const card: JPDBCard = { ...parsedSensei(), vid: 0, sid: 0, reading: 'せんせい', source: 'fallback', jitenWordId: undefined, jitenReadingIndex: undefined };

        const detail = popup.lookupVocabularyInfoForCard(card);
        void detail.catch(() => undefined);
        await vi.advanceTimersByTimeAsync(140_000);

        await expect(detail).resolves.toMatchObject({ pitchAccents: [3], mainReading: { frequencyRank: 330 } });
        expect(card).toMatchObject({ jitenWordId: 1387990, jitenReadingIndex: 0 });
    });

    it('does not cache a failed identity search as a missing word', async () => {
        const jiten = fakeJiten();
        let offline = true;
        const { popup } = readers(vi.fn(async (url: string, options?: ReaderHttpOptions) => {
            if (offline) throw new Error('Offline');
            return jiten.answer(url, options);
        }));
        const card: JPDBCard = { ...parsedSensei(), vid: 0, source: 'fallback', jitenWordId: undefined, jitenReadingIndex: undefined };
        await expect(popup.lookupVocabularyInfoForCard(card)).rejects.toThrow('Offline');
        offline = false;
        await expect(popup.lookupVocabularyInfoForCard(card)).resolves.toMatchObject({ pitchAccents: [3], mainReading: { frequencyRank: 330 } });
    });

    it('reads the detail a page lane already fetched', async () => {
        const jiten = fakeJiten();
        const { page, popup } = readers(jiten.answer);
        await page.hydrateCards([parsedSensei()]);
        expect(jiten.detailRequests(1387990)).toBe(1);

        await expect(popup.lookupVocabularyInfoForCard(parsedSensei())).resolves.toMatchObject({ pitchAccents: [3] });
        expect(jiten.detailRequests(1387990)).toBe(1);
    });

    it('promotes a failed in-flight background read to one shared popup request', async () => {
        let rejectBackground!: (reason: Error) => void;
        const answer = vi.fn((): Promise<unknown> => answer.mock.calls.length === 1
            ? new Promise((_resolve, reject) => { rejectBackground = reject; })
            : Promise.resolve(SENSEI_INFO));
        const page = new JitenPublicVocabularyClient({ requestJsonImpl: answer });
        const background = page.hydrateCards([parsedSensei()]);
        const first = page.wordDetail(1387990, 0);
        const second = page.wordDetail(1387990, 0);
        rejectBackground(new Error('Jiten timeout.'));

        await background;
        expect(await first).toBe(SENSEI_INFO);
        expect(await second).toBe(SENSEI_INFO);
        expect(answer).toHaveBeenCalledTimes(2);
    });

    it('keeps detail cache entries separate for each reading index', async () => {
        const answer = vi.fn(async (url: string) => url.includes('/1/info')
            ? { ...SENSEI_INFO, mainReading: { text: 'せんせい', readingIndex: 1, frequencyRank: 9896 } }
            : SENSEI_INFO);
        const page = new JitenPublicVocabularyClient({ requestJsonImpl: answer });
        await page.hydrateCards([parsedSensei()]);
        const kana = { ...parsedSensei(), sid: 1, spelling: 'せんせい', jitenReadingIndex: 1 };
        const result = await page.hydrateCards([kana]);
        expect([...result.values()][0]).toMatchObject({ spelling: 'せんせい', reading: 'せんせい', frequencyRank: 9896, pitchAccent: ['LHHLL'], jitenReadingIndex: 1 });
        expect(answer).toHaveBeenCalledTimes(2);
    });

    it('keeps dictionary-form pitch on the dictionary-form card for an inflected surface', async () => {
        const wordId = 1358280;
        const page = new JitenPublicVocabularyClient({ requestJsonImpl: async url => url.includes('/parse?')
            ? [{ wordId, readingIndex: 0, originalText: '食べた' }]
            : { ...SENSEI_INFO, wordId, mainReading: { text: '食[た]べる', readingIndex: 0, frequencyRank: 219 }, pitchAccents: [2] },
        });
        const [[token]] = await page.parse(['食べた']);
        expect(token).toMatchObject({ start: 0, end: 3, card: { spelling: '食べる', reading: 'たべる', pitchAccent: ['LHLL'] } });

        const popup = new JitenApiClient(() => '', { anonymous: page });
        enrichCardFromJitenVocabularyInfo(token.card, await popup.lookupVocabularyInfoForCard(token.card));
        expect(token.card).toMatchObject({ spelling: '食べる', reading: 'たべる', pitchAccent: ['LHLL'] });
    });

    it('rechecks the shared budget when concurrent popup requests wake', async () => {
        vi.useFakeTimers();
        const jiten = fakeJiten();
        const { page } = readers(jiten.answer);
        const pending = Promise.all(Array.from({ length: 245 }, (_, index) => page.request(`kanji/${index}`)));
        await vi.advanceTimersByTimeAsync(120_001);
        await pending;
        expect(jiten.answer).toHaveBeenCalledTimes(245);
        expect(jiten.refused()).toBe(0);
    });

    it.each([
        { spelling: 'ありがとう', readingIndex: 3, mainIndex: 3, text: 'ありがとう', rank: 181, accents: [2], reading: 'ありがとう', patterns: ['LHLLLL'] },
        // A parse index need not be the response's canonical main index.
        { spelling: '先生', readingIndex: 1, mainIndex: 0, text: '先[せん]生[せい]', rank: 330, accents: [3], reading: 'せんせい', patterns: ['LHHLL'] },
        // Recorded multi-accent evidence; current live Jiten may list only [0].
        { spelling: '双子', readingIndex: 0, mainIndex: 0, text: '双[ふた]子[ご]', rank: 6029, accents: [0, 3], reading: 'ふたご', patterns: ['LHHH', 'LHHL'] },
    ])('hydrates $spelling without losing reading or accent variants', async example => {
        const page = new JitenPublicVocabularyClient({ requestJsonImpl: async () => ({
            ...SENSEI_INFO,
            mainReading: { text: example.text, readingIndex: example.mainIndex, frequencyRank: example.rank },
            pitchAccents: example.accents,
        }) });
        const card = { ...parsedSensei(), spelling: example.spelling, sid: example.readingIndex, jitenReadingIndex: example.readingIndex };
        const hydrated = [...(await page.hydrateCards([card])).values()][0];
        expect(hydrated).toMatchObject({ reading: example.reading, frequencyRank: example.rank, pitchAccent: example.patterns, jitenReadingIndex: example.readingIndex });
        const popup = new JitenApiClient(() => '', { anonymous: page });
        enrichCardFromJitenVocabularyInfo(card, await popup.lookupVocabularyInfoForCard(card));
        expect(card).toMatchObject({ reading: example.reading, frequencyRank: example.rank, pitchAccent: example.patterns });
    });

    // A popup every five seconds for two minutes over a page that keeps
    // enriching: the popup's own requests are counted with the page's, so
    // the page's lanes leave them room and Jiten never refuses.
    it("answers every popup without Jiten refusing a request", async () => {
        vi.useFakeTimers();
        const jiten = fakeJiten();
        const { page, popup } = readers(jiten.answer);
        const ranks: Array<number | null | undefined> = [];

        for (let round = 0; round < 24; round++) {
            void page.hydrateCards(Array.from({ length: 40 }, (_, index) => sparseCard(600_000 + round * 40 + index)), { detailLimit: 40, priority: 'enrichment' });
            // A hover's sentence: its words' details go ahead of the page's.
            void page.hydrateCards(Array.from({ length: 13 }, (_, index) => sparseCard(800_000 + round * 13 + index)), { detailLimit: 13, priority: 'lookup' });
            const pending = popup.lookupVocabularyInfoForCard(sparseCard(700_000 + round));
            await vi.advanceTimersByTimeAsync(0);
            const info = await pending;
            ranks.push(info?.mainReading?.frequencyRank);
            await vi.advanceTimersByTimeAsync(5_000);
        }

        expect(jiten.refused()).toBe(0);
        expect(ranks).toEqual(Array.from({ length: 24 }, (_, round) => (700_000 + round) % 1000));
    });

    it('keeps a keyed client on its own authenticated requests', async () => {
        const jiten = fakeJiten();
        const page = new JitenPublicVocabularyClient({ requestJsonImpl: jiten.answer });
        const keyed = new JitenApiClient(() => 'jiten-key', { requestImpl: jiten.answer, anonymous: page });

        await keyed.lookupVocabularyInfoForCard(parsedSensei());

        const detail = jiten.answer.mock.calls.find(([url]) => url.includes('/1387990/0/info'));
        expect(detail?.[1]?.headers).toMatchObject({ Authorization: 'ApiKey jiten-key' });
    });
});

describe('the hovered word within api.jiten.moe anonymous budget', () => {
    // The hovered word against the page's own Jiten traffic, through the real
    // parser and public client. Jiten here reads text by the longest word it
    // knows, as api.jiten.moe reads 移住者 in 「国外移民や移住者を含む」, while the
    // segmenter alone splits it 移住|者.
    const HOVERED_WORDS = ['移住者', '定住者', '居住者', '在住者', '永住者', '入植者', '開拓者', '参加者', '利用者', '被災者', '消費者', '労働者'];
    const WORD_IDS = new Map<string, number>([
        ['そして', 1008490], ['国外', 1281690], ['移民', 1158400], ['や', 2028960], ['を', 2029010], ['含む', 1218770],
        ...HOVERED_WORDS.flatMap((word, index): Array<[string, number]> => [[word, 1_700_000 + index], [word.slice(0, 2), 1_100_000 + index]]),
    ]);
    const SPELLINGS = new Map([...WORD_IDS].map(([spelling, wordId]) => [wordId, spelling]));
    const LOOKUP = jpdbFirstParseOptions({ publicJitenPriority: 'lookup' });

    function sentence(word = '移住者', suffix = ''): string {
        return `そして国外移民や${word}を含む${suffix}`;
    }

    function jitenRecords(text: string): Array<{ wordId: number; readingIndex: number; originalText: string }> {
        const records = [];
        for (let index = 0; index < text.length;) {
            const word = [...WORD_IDS.keys()].filter(known => text.startsWith(known, index)).sort((a, b) => b.length - a.length)[0];
            const originalText = word ?? text[index];
            records.push({ wordId: word ? WORD_IDS.get(word)! : 0, readingIndex: 0, originalText });
            index += originalText.length;
        }
        return records;
    }

    function jitenAnswer(url: string): unknown {
        const text = new URL(url).searchParams.get('text');
        if (text !== null) return jitenRecords(text);
        const wordId = Number(/vocabulary\/(\d+)\//u.exec(url)?.[1]);
        return { wordId, mainReading: { text: SPELLINGS.get(wordId) ?? '語', frequencyRank: wordId % 90_000 }, definitions: [{ meanings: ['gloss'] }] };
    }

    function settings(): ReaderSettings {
        return { ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', localDictionariesEnabled: false };
    }

    function readerParser(client: JitenPublicVocabularyClient): ReaderParser {
        return new ReaderParser({ getSettings: settings, jpdb: {} as never, jitenPublicVocabulary: client, dictionaries: {} as never });
    }

    async function hoveredSurface(parser: ReaderParser, word = '移住者', suffix = ''): Promise<string | undefined> {
        const text = sentence(word, suffix);
        const token = await parser.lookupTokenAt(text, text.indexOf(word) + 1, { start: 0, end: text.length }, LOOKUP);
        return token && text.slice(token.start, token.end);
    }

    function sparseCard(wordId: number): JPDBCard {
        return {
            vid: wordId, sid: 0, rid: 0, spelling: `語${wordId}`, reading: '', frequencyRank: null, partOfSpeech: [], meanings: [],
            cardState: ['not-in-deck'], provisionalState: true, pitchAccent: [], wordWithReading: null, source: 'jiten', jitenWordId: wordId, jitenReadingIndex: 0,
        };
    }


    beforeEach(() => {
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.removeItem('yomu:jiten-public-cache:v2');
    });

    afterEach(() => {
        vi.useRealTimers();
        resetJitenPublicVocabularyBackoffForTests();
        localStorage.removeItem('yomu:jiten-public-cache:v2');
    });

    it('asks for text and pointer lookups as lookups', () => {
        expect(textLookupParseOptions('')).toMatchObject({ publicJitenPriority: 'lookup' });
        expect(textLookupParseOptions('jpdb-key')).toMatchObject({ publicJitenPriority: 'lookup' });
    });

    // 0fcb43727 held every request back once its minute's budget was spent,
    // the hovered sentence's own parse included. Each popup's example
    // sentences spent most of it, so after three to five hovers 移住者 opened
    // as 移住 and 事実上 as 事実.
    it("opens the hovered word after the page's enrichment has spent its share", async () => {
        const requestJson = vi.fn(async (url: string) => jitenAnswer(url));
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        for (let index = 0; index < 240; index++) await client.lookupMany([`例文${'ア'.repeat(index)}`], { detailLimit: 0 });
        const background = requestJson.mock.calls.length;

        await expect(hoveredSurface(readerParser(client))).resolves.toBe('移住者');
        expect(background).toBe(40);
    });

    // While Jiten refuses, the hover cannot ask. The page's own parse read
    // 移住者 as one word, so the hover keeps the word the page underlines
    // instead of the segmenter's 移住: with its card when the readings lane
    // already fetched it, and by its Jiten identity alone when not.
    it("keeps the words the page's parse read whole while Jiten refuses", async () => {
        let refusing = false;
        const requestJson = vi.fn(async (url: string) => {
            if (refusing) throw new Error('Jiten fail (429).');
            return jitenAnswer(url);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        const [scanned] = await client.parse([`だった国、${sentence()}。${sentence('定住者')}。`], { detailLimit: 0, priority: 'annotation' });
        await client.hydrateCards(scanned.filter(token => token.card.spelling === '移住者').map(token => token.card));
        refusing = true;
        await client.lookupMany(['公用語']);
        expect(publicJitenBackoffRemainingMs()).toBeGreaterThan(0);
        const sent = requestJson.mock.calls.length;
        const parser = readerParser(client);
        const hover = async (word: string) => {
            const text = sentence(word);
            const token = await parser.lookupTokenAt(text, text.indexOf(word) + 1, { start: 0, end: text.length }, LOOKUP);
            return token && { surface: text.slice(token.start, token.end), card: token.card };
        };

        await expect(hover('移住者')).resolves.toMatchObject({
            surface: '移住者',
            card: { jitenWordId: 1_700_000, reading: '移住者', frequencyRank: 1_700_000 % 90_000 },
        });
        await expect(hover('定住者')).resolves.toMatchObject({
            surface: '定住者',
            card: { jitenWordId: 1_700_001, reading: '', frequencyRank: null },
        });
        expect(requestJson).toHaveBeenCalledTimes(sent);
    });

    it('serves an already parsed passage while the endpoint is backed off', async () => {
        let refusing = false;
        const requestJson = vi.fn(async (url: string) => {
            if (refusing) throw new Error('Jiten fail (429).');
            return jitenAnswer(url);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        const text = sentence();
        const first = await client.parse([text], { priority: 'lookup', detailLimit: 0 });
        refusing = true;
        await client.lookupMany(['公用語']);
        const sent = requestJson.mock.calls.length;
        expect(publicJitenBackoffRemainingMs()).toBeGreaterThan(0);
        const cached = await client.parse([text], { priority: 'lookup', detailLimit: 0 });
        expect(cached).toEqual(first);
        expect(cached[0].some(token => text.slice(token.start, token.end) === '移住者')).toBe(true);
        expect(requestJson).toHaveBeenCalledTimes(sent);
    });

    it('does not spend a second chunk after enrichment reaches its ceiling', async () => {
        const requestJson = vi.fn(async (url: string) => {
            const text = new URL(url).searchParams.get('text');
            return text === null ? jitenAnswer(url) : [{ wordId: 0, readingIndex: 0, originalText: text }];
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        await client.hydrateCards(Array.from({ length: 39 }, (_, index) => sparseCard(600_000 + index)), { detailLimit: 39 });
        expect(requestJson).toHaveBeenCalledTimes(39);
        await client.lookupMany(['あ'.repeat(1900)], { detailLimit: 0 });
        expect(requestJson).toHaveBeenCalledTimes(40);
        // Readings of the words on screen have their own share ahead of it.
        await client.hydrateCards([sparseCard(700_000)], { detailLimit: 1, priority: 'reading' });
        expect(requestJson).toHaveBeenCalledTimes(41);
    });

    // Two minutes of a page that keeps enriching (forty readings and a
    // lattice every five seconds) and a hover every five seconds, against
    // Jiten's published limiter: 120 a minute in six sliding 10 s segments,
    // the rest refused.
    it("answers every hover without Jiten refusing a request", async () => {
        vi.useFakeTimers();
        const permits: number[] = [];
        let refused = 0;
        const requestJson = vi.fn(async (url: string) => {
            const now = Date.now();
            while (permits.length && (Math.floor(permits[0] / 10_000) + 6) * 10_000 <= now) permits.shift();
            if (permits.length >= 120) {
                refused++;
                throw new Error('Jiten fail (429).');
            }
            permits.push(now);
            return jitenAnswer(url);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });
        const parser = readerParser(client);
        const hovered: Array<string | undefined> = [];

        for (let round = 0; round < 24; round++) {
            void client.hydrateCards(Array.from({ length: 40 }, (_, index) => sparseCard(500_000 + round * 40 + index)), { detailLimit: 40 });
            void client.lookupMany(Array.from({ length: 40 }, (_, index) => `頁${round}の${index}`), { detailLimit: 0 });
            hovered.push(await hoveredSurface(parser, HOVERED_WORDS[round % HOVERED_WORDS.length], `（${round}）`));
            await vi.advanceTimersByTimeAsync(5_000);
        }

        expect(refused).toBe(0);
        expect(hovered).toEqual(Array.from({ length: 24 }, (_, round) => HOVERED_WORDS[round % HOVERED_WORDS.length]));
    });
});
