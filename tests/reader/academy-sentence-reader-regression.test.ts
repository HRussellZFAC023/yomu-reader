import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { cardKey } from '../../src/reader/cards/utils';
import { JitenPublicVocabularyClient } from '../../src/reader/dictionaries/jiten-public-vocabulary';
import { renderTokensToHtml } from '../../src/reader/dom';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { publicLookupFallbackCards } from '../../src/reader/lookup/public-fallback-cards';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const SENTENCE = '聞き取れませんでしたか。もう一度言いますね。';

function readerSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jitenApiKey: '',
        localDictionariesEnabled: false,
        showFurigana: true,
        furiganaMode: 'all',
        showPitchAccent: true,
        ...overrides,
    };
}

function fallbackParser(): ReaderParser {
    return new ReaderParser({
        getSettings: () => readerSettings(),
        jpdb: {} as never,
        jitenPublicVocabulary: { parse: vi.fn(async () => [[]]) },
        dictionaries: {} as never,
    });
}

function jitenCard(
    vid: number,
    spelling: string,
    reading: string,
    pitchAccent: string[],
): JPDBCard {
    return {
        vid,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: ['v5'],
        meanings: [{ glosses: [`${spelling} definition`], partOfSpeech: ['verb'] }],
        cardState: ['not-in-deck'],
        pitchAccent,
        wordWithReading: null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: vid,
        jitenReadingIndex: 0,
    };
}

function publicJitenSentenceClient(): JitenPublicVocabularyClient {
    const parseWords = [
        { wordId: 1505800, readingIndex: 0, originalText: '聞き取れませんでした' },
        { wordId: 2028970, readingIndex: 0, originalText: 'か' },
        { wordId: 2005860, readingIndex: 0, originalText: 'もう一度' },
        { wordId: 1587040, readingIndex: 0, originalText: '言います' },
        { wordId: 2029080, readingIndex: 0, originalText: 'ね' },
    ];
    const details = new Map<number, unknown>([
        [1505800, {
            wordId: 1505800,
            mainReading: { text: '聞[き]き取[と]る' },
            partsOfSpeech: ['v5r'],
            definitions: [{ meanings: ['to catch (a word); to make out'] }],
            pitchAccents: [3],
        }],
        [2028970, { wordId: 2028970, mainReading: { text: 'か' }, partsOfSpeech: ['prt'], pitchAccents: [0] }],
        [2005860, { wordId: 2005860, mainReading: { text: 'もう一度[いちど]' }, pitchAccents: [] }],
        [1587040, {
            wordId: 1587040,
            mainReading: { text: '言[い]う' },
            partsOfSpeech: ['v5u'],
            definitions: [{ meanings: ['to say'] }],
            pitchAccents: [0],
        }],
        [2029080, { wordId: 2029080, mainReading: { text: 'ね' }, partsOfSpeech: ['prt'], pitchAccents: [1] }],
    ]);
    return new JitenPublicVocabularyClient({
        requestJsonImpl: vi.fn(async url => {
            if (url.includes('/vocabulary/parse?')) return parseWords;
            const wordId = Number(/\/vocabulary\/(\d+)\/0\/info/u.exec(url)?.[1]);
            const detail = details.get(wordId);
            if (!detail) throw new Error(`Unexpected Jiten URL: ${url}`);
            return detail;
        }),
    });
}

async function fallbackSentenceTokens(): Promise<JPDBToken[]> {
    const [tokens] = await fallbackParser().parse([SENTENCE], { allowSegmentedFallback: true });
    return tokens ?? [];
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.removeItem('yomu:jiten-public-cache:v2');
});

afterEach(() => {
    vi.useRealTimers();
});

describe('Academy 聞き取れません sentence Reader regression', () => {
    it('keeps compound and polite inflections as lookupable fallback tokens', async () => {
        const tokens = await fallbackSentenceTokens();

        expect(tokens.map(token => SENTENCE.slice(token.start, token.end))).toEqual([
            '聞き取れませんでした',
            'か',
            'もう一度',
            '言います',
            'ね',
        ]);
        expect(tokens[0]?.card.fallbackLookupTerms).toContain('聞き取る');
        expect(tokens[3]?.card.fallbackLookupTerms).toContain('言う');
    });

    it('normalizes provider vocabulary into lexical tokens with furigana and pitch', async () => {
        const client = publicJitenSentenceClient();
        const parser = new ReaderParser({
            getSettings: () => readerSettings(),
            jpdb: {} as never,
            jitenPublicVocabulary: client,
            dictionaries: {} as never,
        });

        const [tokens] = await parser.parse([SENTENCE], { allowSegmentedFallback: true });
        const listening = tokens?.find(token => token.card.spelling === '聞き取る');
        const saying = tokens?.find(token => token.card.spelling === '言う');

        expect(tokens?.map(token => SENTENCE.slice(token.start, token.end))).toEqual([
            '聞き取れませんでした',
            'か',
            'もう一度',
            '言います',
            'ね',
        ]);
        expect(listening).toMatchObject({ start: 0, end: 10, pitchClass: 'nakadaka' });
        expect(listening?.card).toMatchObject({ reading: 'ききとる', pitchAccent: ['LHHLL'] });
        expect(saying).toMatchObject({ start: 16, end: 20, pitchClass: 'heiban' });
        expect(saying?.card).toMatchObject({ reading: 'いう', pitchAccent: ['LHH'] });

        document.body.innerHTML = renderTokensToHtml(SENTENCE, tokens ?? [], readerSettings());
        expect([...document.querySelectorAll<HTMLElement>('[data-expression="聞き取る"] rt')].map(node => node.textContent)).toEqual(['き', 'と']);
        expect([...document.querySelectorAll<HTMLElement>('[data-expression="言う"] rt')].map(node => node.textContent)).toEqual(['い']);
    });

    it('selects dictionary forms when hydrating the exact fallback sentence', async () => {
        const tokens = await fallbackSentenceTokens();
        const listening = tokens[0]!;
        const saying = tokens[3]!;
        const resolvedListening = jitenCard(1505800, '聞き取る', 'ききとる', ['LHHLL']);
        const resolvedSaying = jitenCard(1587040, '言う', 'いう', ['LHH']);
        const lookupMany = vi.fn(async (terms: string[]) => new Map<string, JPDBCard>([
            ...(terms.includes('聞き取る') ? [['聞き取る', resolvedListening] as const] : []),
            ...(terms.includes('言う') ? [['言う', resolvedSaying] as const] : []),
        ]));

        const resolved = await publicLookupFallbackCards([listening.card, saying.card], {
            jitenApiActive: () => false,
            parse: vi.fn(),
            lookupMany,
            publicSpellingCard: vi.fn(),
        }, { concurrency: 2, jpdbPublicLookup: false, detailLimit: count => count * 4 });

        expect(lookupMany).toHaveBeenCalledWith(expect.arrayContaining(['聞き取る', '言う']), { detailLimit: 8 });
        expect(resolved.get(cardKey(listening.card))).toBe(resolvedListening);
        expect(resolved.get(cardKey(saying.card))).toBe(resolvedSaying);
    });

    it('attaches resolved pitch to the same compound fallback spans', async () => {
        vi.useFakeTimers();
        const tokens = await fallbackSentenceTokens();
        const listening = tokens[0]!;
        const saying = tokens[3]!;
        const resolvedListening = jitenCard(1505800, '聞き取る', 'ききとる', ['LHHLL']);
        const resolvedSaying = jitenCard(1587040, '言う', 'いう', ['LHH']);
        const app = new ReaderApp() as unknown as {
            settings: ReaderSettings;
            publicLookupFallbackCards(cards: readonly JPDBCard[]): Promise<Map<string, JPDBCard>>;
            resolvePublicFallbackPitchTokens(tokens: JPDBToken[], options?: { urgent?: boolean; jpdbPublicLookup?: boolean }): Promise<JPDBToken[]>;
            queueSubtitleParsedHtmlRefresh(sentence?: string): void;
            parser: { cacheCards(cards: JPDBCard[]): void };
            isDestroyed: boolean;
        };
        app.settings = readerSettings();
        app.publicLookupFallbackCards = vi.fn(async cards => new Map([
            [cardKey(cards[0]!), resolvedListening],
            [cardKey(cards[1]!), resolvedSaying],
        ]));
        app.queueSubtitleParsedHtmlRefresh = vi.fn();
        app.parser = { cacheCards: vi.fn() };

        const queued = await app.resolvePublicFallbackPitchTokens([listening, saying], {
            urgent: true,
            jpdbPublicLookup: false,
        });

        expect(queued).toEqual([]);
        expect(listening.card).toBe(resolvedListening);
        expect(listening.pitchClass).toBe('nakadaka');
        expect(saying.card).toBe(resolvedSaying);
        expect(saying.pitchClass).toBe('heiban');
        app.isDestroyed = true;
        await vi.runOnlyPendingTimersAsync();
        vi.useRealTimers();
    });
});
