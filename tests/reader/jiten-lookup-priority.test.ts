import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';
import {
    JitenPublicVocabularyClient,
    publicJitenBackoffRemainingMs,
    resetJitenPublicVocabularyBackoffForTests,
} from '../../src/reader/dictionaries/jiten-public-vocabulary';
import { ReaderParser, jpdbFirstParseOptions } from '../../src/reader/lookup/parser';
import { textLookupParseOptions } from '../../src/reader/main/text-lookup';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

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

describe('the hovered word within api.jiten.moe anonymous budget', () => {
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
        expect(background).toBe(50);
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
        await client.hydrateCards(Array.from({ length: 49 }, (_, index) => sparseCard(600_000 + index)), { detailLimit: 49 });
        expect(requestJson).toHaveBeenCalledTimes(49);
        await client.lookupMany(['あ'.repeat(1900)], { detailLimit: 0 });
        expect(requestJson).toHaveBeenCalledTimes(50);
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
