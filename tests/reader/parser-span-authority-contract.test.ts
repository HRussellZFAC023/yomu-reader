import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { YomitanTermEntry, YomitanTermMatch } from '../../src/reader/dictionaries/yomitan';
import {
    ReaderParser,
    type ReaderParserDependencies,
    type ReaderParserParseOptions,
} from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { withFakeSegmenter } from './jpdb/fixtures';
import type { YomitanExactTermCandidateRequest } from "../../src/reader/dictionaries/yomitan";
import type { LearningTargetModule } from "../../src/reader/languages/types";

type Provider = 'jpdb' | 'jiten' | 'local' | 'public';

interface Lexeme {
    spelling: string;
    reading?: string;
    rules?: string;
}

interface DecorationSpec {
    lexeme: Lexeme;
    start: number;
    end: number;
}

interface LocalMatchSpec {
    query: string;
    start: number;
    end?: number;
    surface?: string;
}

interface HarnessOptions {
    provider: Provider;
    text: string;
    lexicon: Readonly<Record<string, Lexeme | readonly Lexeme[]>>;
    decorations?: readonly DecorationSpec[];
    localMatches?: readonly LocalMatchSpec[];
    subtokenQueries?: Readonly<Record<string, string>>;
}

const SPAN_OPTIONS: ReaderParserParseOptions = {
    allowSegmentedFallback: true,
    includeLocalPitch: false,
};

function sourceForProvider(provider: Provider): JPDBCard['source'] {
    if (provider === 'local') return 'local';
    if (provider === 'jpdb') return 'jpdb';
    return 'jiten';
}

function cardPartOfSpeech(lexeme: Lexeme): string[] {
    return (lexeme.rules ?? '').split(/\s+/u).filter(Boolean);
}

function entryForLexeme(lexeme: Lexeme): YomitanTermEntry {
    return {
        expression: lexeme.spelling,
        reading: lexeme.reading ?? lexeme.spelling,
        rules: lexeme.rules,
        glossary: [`definition of ${lexeme.spelling}`],
        dictionary: 'Span authority fixture',
    };
}

function tokenFor(
    sentence: string,
    card: JPDBCard,
    start: number,
    end: number,
): JPDBToken {
    return {
        card,
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence,
    };
}

function parserSettings(provider: Provider): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        apiKey: provider === 'jpdb' ? 'jpdb-test-key' : '',
        jitenApiKey: provider === 'jiten' ? 'ak_jiten-test-key' : '',
        parserProvider: provider === 'public' ? 'local' : provider,
        localDictionariesEnabled: provider === 'local',
        showPitchAccent: false,
    };
}

function providerHarness(options: HarnessOptions) {
    const source = sourceForProvider(options.provider);
    const cards = new Map<string, JPDBCard>();
    let nextCardId = 10_000;
    const cardFor = (lexeme: Lexeme): JPDBCard => {
        const key = JSON.stringify([lexeme.spelling, lexeme.reading ?? '', lexeme.rules ?? '', source]);
        const cached = cards.get(key);
        if (cached) return cached;
        const partOfSpeech = cardPartOfSpeech(lexeme);
        const card: JPDBCard = {
            vid: source === 'local' ? -nextCardId : nextCardId,
            sid: 0,
            rid: 0,
            spelling: lexeme.spelling,
            reading: lexeme.reading ?? lexeme.spelling,
            frequencyRank: null,
            partOfSpeech,
            meanings: [{ glosses: [`definition of ${lexeme.spelling}`], partOfSpeech }],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source,
        };
        nextCardId += 1;
        cards.set(key, card);
        return card;
    };
    const lexemesFor = (query: string): readonly Lexeme[] => {
        const value = options.lexicon[query];
        if (!value) return [];
        return Array.isArray(value) ? value : [value as Lexeme];
    };
    const paragraphDecorations = (options.decorations ?? []).map(decoration => tokenFor(
        options.text,
        cardFor(decoration.lexeme),
        decoration.start,
        decoration.end,
    ));
    const exactTokens = (query: string): JPDBToken[] => {
        const matchedQuery = options.subtokenQueries?.[query] ?? query;
        return lexemesFor(matchedQuery).map((lexeme, index) => {
            // Deliberately impossible offsets: exact-query adapters may identify
            // a card, but only the resolver owns offsets in the source sentence.
            const start = 40 + index * 10;
            return tokenFor(query, cardFor(lexeme), start, start + Math.max(1, query.length));
        });
    };
    const isParagraphParse = (paragraphs: readonly string[]) => (
        paragraphs.length === 1 && paragraphs[0] === options.text
    );
    const remoteParse = async (paragraphs: readonly string[]): Promise<JPDBToken[][]> => (
        isParagraphParse(paragraphs)
            ? [paragraphDecorations]
            : paragraphs.map(exactTokens)
    );
    const jpdbParse = vi.fn(async (paragraphs: string[]) => remoteParse(paragraphs));
    const jitenParse = vi.fn(async (paragraphs: string[]) => remoteParse(paragraphs));
    const publicParse = vi.fn(async (paragraphs: readonly string[]) => remoteParse(paragraphs));
    const publicLookupMany = vi.fn(async (terms: readonly string[], _options?: { detailLimit?: number }) => {
        const result = new Map<string, JPDBCard>();
        for (const term of terms) {
            const matchedQuery = options.subtokenQueries?.[term] ?? term;
            const lexeme = lexemesFor(matchedQuery)[0];
            if (lexeme) result.set(term, cardFor(lexeme));
        }
        return result;
    });
    const localLookup = vi.fn(async (expression: string) => (
        lexemesFor(options.subtokenQueries?.[expression] ?? expression).map(entryForLexeme)
    ));
    const localMatches = (options.localMatches ?? []).flatMap(spec => {
        const lexeme = lexemesFor(spec.query)[0];
        if (!lexeme) return [];
        const surface = spec.surface ?? options.text.slice(spec.start, spec.end ?? spec.start + spec.query.length);
        return [{
            entry: entryForLexeme(lexeme),
            start: spec.start,
            end: spec.end ?? spec.start + surface.length,
            surface,
        } satisfies YomitanTermMatch];
    });
    const findTermMatches = vi.fn(async (text: string) => text === options.text ? localMatches : []);
    const hasTermDictionaries = vi.fn(async () => options.provider === 'local');
    const dependencies: ReaderParserDependencies = {
        getSettings: () => parserSettings(options.provider),
        jpdb: { parse: jpdbParse } as never,
        jiten: { parse: jitenParse } as never,
        dictionaries: {
            hasTermDictionaries,
            findTermMatches,
            lookup: localLookup,
            lookupTermMeta: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
        } as never,
        ...(options.provider === 'public' ? {
            jitenPublicVocabulary: {
                parse: publicParse,
                lookupMany: publicLookupMany,
            },
        } : {}),
    };
    return {
        parser: new ReaderParser(dependencies),
        dependencies,
        jpdbParse,
        jitenParse,
        publicParse,
        publicLookupMany,
        localLookup,
        findTermMatches,
    };
}

function tokenSummary(text: string, tokens: readonly JPDBToken[]) {
    return tokens.map(token => ({
        surface: text.slice(token.start, token.end),
        spelling: token.card.spelling,
        source: token.card.source,
        start: token.start,
        end: token.end,
    }));
}

describe('ReaderParser span authority contract', () => {
    it('ignores provider offsets and prevents conflicting paragraph decorations from choosing or resizing spans', async () => {
        const text = '優しい言葉';
        const harness = providerHarness({
            provider: 'jpdb',
            text,
            lexicon: {
                優しい: { spelling: '優しい', reading: 'やさしい', rules: 'adj-i' },
                言葉: { spelling: '言葉', reading: 'ことば', rules: 'n' },
            },
            decorations: [{
                lexeme: { spelling: text, reading: 'やさしいことば', rules: 'n' },
                start: 0,
                end: text.length,
            }],
        });

        const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);

        expect(tokenSummary(text, tokens)).toEqual([
            { surface: '優しい', spelling: '優しい', source: 'jpdb', start: 0, end: 3 },
            { surface: '言葉', spelling: '言葉', source: 'jpdb', start: 3, end: 5 },
        ]);
        expect(tokens.some(token => token.card.spelling === text)).toBe(false);
    });

    it('rejects a parser subtoken as confirmation of an exact broader query', async () => {
        const text = '台風被害';
        const harness = providerHarness({
            provider: 'jpdb',
            text,
            lexicon: {
                台風: { spelling: '台風', reading: 'たいふう', rules: 'n' },
                被害: { spelling: '被害', reading: 'ひがい', rules: 'n' },
            },
            subtokenQueries: { 台風被害: '台風' },
        });

        const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);

        expect(tokenSummary(text, tokens)).toEqual([
            { surface: '台風', spelling: '台風', source: 'jpdb', start: 0, end: 2 },
            { surface: '被害', spelling: '被害', source: 'jpdb', start: 2, end: 4 },
        ]);
        expect(tokens.some(token => token.start === 0 && token.end === text.length)).toBe(false);
    });

    it('rejects a POS-incompatible entry for a deinflected candidate', async () => {
        const text = '食べた';
        const harness = providerHarness({
            provider: 'jiten',
            text,
            lexicon: {
                食べる: { spelling: '食べる', reading: 'たべる', rules: 'n' },
            },
        });

        const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);
        const candidateTerms = harness.jitenParse.mock.calls[1]?.[0] ?? [];

        expect(candidateTerms).toContain('食べる');
        expect(tokens.some(token => token.card.spelling === '食べる')).toBe(false);
        expect(tokens.every(token => token.card.source === 'fallback')).toBe(true);
    });

    it('uses a later deinflected public candidate when the surface form misses', async () => {
        const text = '読みました';
        const harness = providerHarness({
            provider: 'public',
            text,
            lexicon: {
                読む: { spelling: '読む', reading: 'よむ', rules: 'v5m' },
            },
        });

        const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);
        const candidates = [...(harness.publicLookupMany.mock.calls[0]?.[0] ?? [])];

        expect(candidates).toContain(text);
        expect(candidates).toContain('読む');
        expect(candidates.indexOf(text)).toBeLessThan(candidates.indexOf('読む'));
        expect(tokenSummary(text, tokens)).toContainEqual({
            surface: text,
            spelling: '読む',
            source: 'jiten',
            start: 0,
            end: text.length,
        });
    });

    // Every public confirmation is a detail request from api.jiten.moe's
    // anonymous budget (300 a minute), and a sentence's candidates hold about a
    // hundred words. The span lookup used to ask details for all of them,
    // overriding the page scan's own budget of none.
    it("spends only the caller's detail budget on public confirmations", async () => {
        const text = '読みました';
        const harness = providerHarness({
            provider: 'public',
            text,
            lexicon: { 読む: { spelling: '読む', reading: 'よむ', rules: 'v5m' } },
        });

        await harness.parser.parse([text], { ...SPAN_OPTIONS, publicJitenDetailLimit: 0 });
        await harness.parser.parse(['本を読む'], SPAN_OPTIONS);

        expect(harness.publicLookupMany.mock.calls.map(([, options]) => options)).toEqual([
            { detailLimit: 0 },
            { detailLimit: undefined },
        ]);
    });

    it('keeps repeated dictionary-confirmed occurrences distinct while querying each term once', async () => {
        const text = '猫と猫';
        const harness = providerHarness({
            provider: 'jpdb',
            text,
            lexicon: {
                猫: { spelling: '猫', reading: 'ねこ', rules: 'n' },
                と: { spelling: 'と', reading: 'と', rules: 'prt' },
            },
        });

        const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);
        const candidateTerms = harness.jpdbParse.mock.calls[1]?.[0] ?? [];

        expect(tokenSummary(text, tokens).filter(token => token.spelling === '猫')).toEqual([
            { surface: '猫', spelling: '猫', source: 'jpdb', start: 0, end: 1 },
            { surface: '猫', spelling: '猫', source: 'jpdb', start: 2, end: 3 },
        ]);
        expect(candidateTerms.filter(term => term === '猫')).toHaveLength(1);
    });

    it('returns the same authoritative token from passive parse and pointer lookup', async () => {
        const text = '書いたニュース';
        const harness = providerHarness({
            provider: 'jpdb',
            text,
            lexicon: {
                書く: { spelling: '書く', reading: 'かく', rules: 'v5k' },
                ニュース: { spelling: 'ニュース', reading: 'ニュース', rules: 'n' },
            },
        });

        const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);
        const passive = tokens.find(token => token.start <= 1 && 1 < token.end);
        const pointer = await harness.parser.lookupTokenAt(text, 1, { start: 0, end: text.length }, SPAN_OPTIONS);

        expect(passive).toBeDefined();
        expect(pointer).toMatchObject({
            start: passive?.start,
            end: passive?.end,
            card: {
                spelling: passive?.card.spelling,
                reading: passive?.card.reading,
                source: passive?.card.source,
            },
        });
    });

    it('bounds a broad segmented fallback to the gap before a confirmed span', async () => {
        const text = '優しい言葉';
        const harness = providerHarness({
            provider: 'public',
            text,
            lexicon: {
                言葉: { spelling: '言葉', reading: 'ことば', rules: 'n' },
            },
        });

        await withFakeSegmenter(
            value => [{ segment: value, index: 0, isWordLike: true }],
            async parser => {
                const [tokens] = await parser.parse([text], SPAN_OPTIONS);

                expect(tokenSummary(text, tokens)).toEqual([
                    { surface: '優しい', spelling: '優しい', source: 'fallback', start: 0, end: 3 },
                    { surface: '言葉', spelling: '言葉', source: 'jiten', start: 3, end: 5 },
                ]);
            },
            harness.dependencies,
        );
    });

    it.each(['jpdb', 'jiten', 'public', 'local'] as const)(
        'batches and deduplicates exact candidate queries for the %s provider',
        async provider => {
            const text = '台風被害';
            const harness = providerHarness({
                provider,
                text,
                lexicon: {
                    台風: { spelling: '台風', reading: 'たいふう', rules: 'n' },
                    被害: { spelling: '被害', reading: 'ひがい', rules: 'n' },
                },
                localMatches: [
                    { query: '台風', start: 0, end: 2 },
                    { query: '被害', start: 2, end: 4 },
                ],
            });

            const [tokens] = await harness.parser.parse([text], SPAN_OPTIONS);
            let candidateTerms: string[];
            if (provider === 'jpdb') {
                expect(harness.jpdbParse).toHaveBeenCalledTimes(2);
                candidateTerms = harness.jpdbParse.mock.calls[1]?.[0] ?? [];
            } else if (provider === 'jiten') {
                expect(harness.jitenParse).toHaveBeenCalledTimes(2);
                candidateTerms = harness.jitenParse.mock.calls[1]?.[0] ?? [];
            } else if (provider === 'public') {
                expect(harness.publicParse).toHaveBeenCalledTimes(1);
                expect(harness.publicLookupMany).toHaveBeenCalledTimes(1);
                candidateTerms = [...(harness.publicLookupMany.mock.calls[0]?.[0] ?? [])];
            } else {
                expect(harness.findTermMatches).toHaveBeenCalledTimes(1);
                candidateTerms = harness.localLookup.mock.calls.map(([term]) => term);
            }

            expect(tokenSummary(text, tokens).map(token => [token.surface, token.spelling])).toEqual([
                ['台風', '台風'],
                ['被害', '被害'],
            ]);
            if (provider === 'local') {
                // The local sweep already analysed this paragraph; its aligned
                // matches confirm 台風 and 被害 directly, so the per-term
                // queries carry only the remaining unconfirmed candidates.
                expect(candidateTerms).not.toContain('台風');
                expect(candidateTerms).not.toContain('被害');
            } else {
                expect(candidateTerms).toContain('台風');
                expect(candidateTerms).toContain('被害');
            }
            expect(new Set(candidateTerms).size).toBe(candidateTerms.length);
            // Four code points have only ten non-empty forward substrings. The
            // provider may batch those ten, but must not issue duplicate work.
            expect(candidateTerms.length).toBeLessThanOrEqual(10);
        },
    );
});

describe('exact local candidate integration', () => {
    const TIME_ENTRY: YomitanTermEntry = {
        expression: '時間',
        reading: 'じかん',
        rules: 'n',
        glossary: ['time; hour'],
        dictionary: 'Jitendex',
    };

    function localMatch(
        entry: YomitanTermEntry,
        start: number,
        end: number,
        surface: string,
    ): YomitanTermMatch {
        return { entry, start, end, surface };
    }

    function exactCandidateLookup(entries: readonly YomitanTermEntry[]) {
        return vi.fn(async (
            requests: readonly YomitanExactTermCandidateRequest[],
            _preferences: unknown,
            target: LearningTargetModule,
        ) => requests.flatMap((request, requestIndex) => {
            const term = target.normalizeText(request.lookupCandidate.term);
            const entry = entries.find(candidate => (
                [candidate.expression, candidate.reading]
                    .some(value => target.normalizeText(value) === term)
                && (!request.lookupCandidate.rules.length
                    || target.matchesLookupCandidateRules(candidate.rules ?? '', request.lookupCandidate.rules))
            ));
            return entry ? [{ request, requestIndex, entry }] : [];
        }));
    }

    function parserHarness(options: {
        text: string;
        decorations: readonly YomitanTermMatch[];
        exactEntries?: readonly YomitanTermEntry[];
    }) {
        const findTermMatches = vi.fn(async (text: string) => (
            text === options.text ? [...options.decorations] : []
        ));
        const lookupExactTermCandidates = exactCandidateLookup(options.exactEntries ?? []);
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key-that-must-not-be-used',
            jitenApiKey: 'ak_jiten-key-that-must-not-be-used',
            parserProvider: 'local',
            localDictionariesEnabled: true,
            showPitchAccent: false,
        };
        const jpdbParse = vi.fn(async () => []);
        const jitenParse = vi.fn(async () => []);
        const parser = new ReaderParser({
            getSettings: () => settings,
            jpdb: { parse: jpdbParse } as never,
            jiten: { parse: jitenParse } as never,
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => true),
                findTermMatches,
                lookupExactTermCandidates,
                lookupTermMeta: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
        });
        return { parser, findTermMatches, lookupExactTermCandidates, jpdbParse, jitenParse };
    }

    function tokenSnapshot(text: string, tokens: Awaited<ReturnType<ReaderParser['parse']>>[number]) {
        return tokens.map(token => ({
            surface: text.slice(token.start, token.end),
            spelling: token.card.spelling,
            reading: token.card.reading,
            source: token.card.source,
            range: [token.start, token.end],
        }));
    }


    it('lets an exact candidate confirmation own the span even when parse decoration offsets are wrong', async () => {
        const text = '2時間前';
        const harness = parserHarness({
            text,
            decorations: [localMatch(TIME_ENTRY, 0, 1, '2')],
            exactEntries: [TIME_ENTRY],
        });

        const [tokens] = await harness.parser.parse([text], {
            allowSegmentedFallback: true,
            includeLocalPitch: false,
        });

        expect(tokenSnapshot(text, tokens)).toEqual([
            { surface: '時間', spelling: '時間', reading: 'じかん', source: 'local', range: [1, 3] },
            { surface: '前', spelling: '前', reading: '', source: 'fallback', range: [3, 4] },
        ]);
        expect(harness.lookupExactTermCandidates).toHaveBeenCalledTimes(1);
        const requests = harness.lookupExactTermCandidates.mock.calls[0]?.[0] ?? [];
        expect(requests).toContainEqual(expect.objectContaining({
            surface: '時間',
            lookupCandidate: expect.objectContaining({ term: '時間' }),
        }));
        expect(harness.jpdbParse).not.toHaveBeenCalled();
        expect(harness.jitenParse).not.toHaveBeenCalled();
    });

    it('does not promote a broad parser match when the exact candidate lookup misses', async () => {
        const text = '2時間前';
        const harness = parserHarness({
            text,
            decorations: [localMatch(TIME_ENTRY, 1, 3, '時間')],
        });

        const [tokens] = await harness.parser.parse([text], {
            allowSegmentedFallback: true,
            includeLocalPitch: false,
        });

        expect(tokenSnapshot(text, tokens)).toEqual([
            { surface: '時間', spelling: '時間', reading: '', source: 'fallback', range: [1, 3] },
            { surface: '前', spelling: '前', reading: '', source: 'fallback', range: [3, 4] },
        ]);
        expect(harness.findTermMatches).toHaveBeenCalledTimes(1);
        expect(harness.lookupExactTermCandidates).toHaveBeenCalledTimes(1);
    });

    it('batches repeated occurrence requests through one exact candidate call', async () => {
        const text = '時間と時間';
        const harness = parserHarness({
            text,
            decorations: [
                localMatch(TIME_ENTRY, 0, 2, '時間'),
                localMatch(TIME_ENTRY, 3, 5, '時間'),
            ],
            exactEntries: [TIME_ENTRY],
        });

        const [tokens] = await harness.parser.parse([text], {
            allowSegmentedFallback: true,
            includeLocalPitch: false,
        });

        expect(tokenSnapshot(text, tokens).filter(token => token.spelling === '時間')).toEqual([
            { surface: '時間', spelling: '時間', reading: 'じかん', source: 'local', range: [0, 2] },
            { surface: '時間', spelling: '時間', reading: 'じかん', source: 'local', range: [3, 5] },
        ]);
        expect(harness.lookupExactTermCandidates).toHaveBeenCalledTimes(1);
        const requests = harness.lookupExactTermCandidates.mock.calls[0]?.[0] ?? [];
        expect(requests.filter(request => (
            request.surface === '時間' && request.lookupCandidate.term === '時間'
        ))).toHaveLength(2);
    });
});
