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
