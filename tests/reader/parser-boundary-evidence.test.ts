import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import type { YomitanTermMatch } from '../../src/reader/dictionaries/yomitan';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const SENTENCE = '2時間前';
// Token boundaries are the subject here, so render without readings. The
// shipped furigana default now annotates every parsed word, which would put
// ruby text into the textContent assertion below.
const BARE_RENDER_SETTINGS: ReaderSettings = { ...DEFAULT_SETTINGS, furiganaMode: 'off' };

function card(spelling: string, reading: string, source: JPDBCard['source']): JPDBCard {
    return {
        vid: source === 'local' ? -spelling.codePointAt(0)! : spelling.codePointAt(0)!,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source,
    };
}

function token(spelling: string, reading: string, start: number, end: number, source: JPDBCard['source']): JPDBToken {
    return {
        card: card(spelling, reading, source),
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: '',
        sentence: SENTENCE,
    };
}

function fragmentedRemote(source: 'jpdb' | 'jiten' | 'fallback'): JPDBToken[] {
    return [
        token('２時', 'にじ', 0, 2, source),
        token('間', 'かん', 2, 3, source),
        token('前', 'まえ', 3, 4, source),
    ];
}

function exactTimeMatch(): YomitanTermMatch {
    return {
        entry: {
            expression: '時間',
            reading: 'じかん',
            glossary: ['time; hour'],
            dictionary: 'Jitendex',
        },
        start: 1,
        end: 3,
        surface: '時間',
    };
}

function parserHarness(options: {
    provider: 'jpdb' | 'jiten' | 'local';
    localMatches?: YomitanTermMatch[];
    remoteTokens?: JPDBToken[];
    findTermMatches?: (text: string) => Promise<YomitanTermMatch[]>;
}) {
    const findTermMatches = vi.fn(options.findTermMatches ?? (async () => options.localMatches ?? []));
    const settings: ReaderSettings = {
        ...DEFAULT_SETTINGS,
        apiKey: options.provider === 'jpdb' ? 'jpdb-key' : '',
        jitenApiKey: options.provider === 'jiten' ? 'jiten-key' : '',
        parserProvider: options.provider === 'local' ? 'local' : 'auto',
        localDictionariesEnabled: true,
        showPitchAccent: false,
    };
    const jpdbParse = vi.fn(async () => [options.remoteTokens ?? fragmentedRemote('jpdb')]);
    const jitenParse = vi.fn(async () => [options.remoteTokens ?? fragmentedRemote('jiten')]);
    const parser = new ReaderParser({
        getSettings: () => settings,
        jpdb: { parse: jpdbParse } as never,
        jiten: { parse: jitenParse } as never,
        dictionaries: {
            hasTermDictionaries: vi.fn(async () => true),
            findTermMatches,
            lookupTermMeta: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
        } as never,
    });
    return { parser, findTermMatches, jpdbParse, jitenParse };
}

function tokenSnapshot(tokens: JPDBToken[]) {
    return tokens.map(item => ({
        surface: SENTENCE.slice(item.start, item.end),
        expression: item.card.spelling,
        reading: item.card.reading,
        source: item.card.source,
        range: [item.start, item.end],
    }));
}

function expectExactTimeBoundary(tokens: JPDBToken[], trailingSource: JPDBCard['source']) {
    expect(tokenSnapshot(tokens)).toEqual([
        { surface: '時間', expression: '時間', reading: 'じかん', source: 'local', range: [1, 3] },
        { surface: '前', expression: '前', reading: 'まえ', source: trailingSource, range: [3, 4] },
    ]);
}

function expectFragmentedTimeBoundary(tokens: JPDBToken[]) {
    expect(tokens.map(item => item.card.spelling)).toEqual(['２時', '間', '前']);
}

describe('exact local boundary evidence for remote parse fragments', () => {
    it.each(['jpdb', 'jiten'] as const)('reconciles a %s split only when an exact longer local expression crosses the boundary', async provider => {
        const { parser } = parserHarness({ provider, localMatches: [exactTimeMatch()] });

        const [tokens] = await parser.parse([SENTENCE]);

        expectExactTimeBoundary(tokens, provider);
        const root = document.createElement('div');
        root.innerHTML = renderTokensToHtml(SENTENCE, tokens, BARE_RENDER_SETTINGS);
        const word = root.querySelector<HTMLElement>('[data-expression="時間"]');
        expect(word?.dataset.surface).toBe('時間');
        expect(word?.dataset.tokenStart).toBe('1');
        expect(word?.dataset.tokenEnd).toBe('3');
        expect(root.textContent).toBe(SENTENCE);
    });

    it('applies the same evidence gate to segmented fallback fragments', async () => {
        const { parser } = parserHarness({
            provider: 'jpdb',
            localMatches: [exactTimeMatch()],
            remoteTokens: fragmentedRemote('fallback'),
        });

        const [tokens] = await parser.parse([SENTENCE]);

        expectExactTimeBoundary(tokens, 'fallback');
    });

    it('keeps remote fragments when the local dictionary has no exact whole-expression evidence', async () => {
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: [] });

        const [tokens] = await parser.parse([SENTENCE]);

        expect(tokenSnapshot(tokens)).toEqual([
            { surface: '2時', expression: '２時', reading: 'にじ', source: 'jpdb', range: [0, 2] },
            { surface: '間', expression: '間', reading: 'かん', source: 'jpdb', range: [2, 3] },
            { surface: '前', expression: '前', reading: 'まえ', source: 'jpdb', range: [3, 4] },
        ]);
    });

    it('rejects ambiguous exact identities instead of choosing the first dictionary reading', async () => {
        const ambiguous = [
            exactTimeMatch(),
            {
                ...exactTimeMatch(),
                entry: { ...exactTimeMatch().entry, reading: 'ときま', dictionary: 'Ambiguous dictionary' },
            },
        ];
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: ambiguous });

        const [tokens] = await parser.parse([SENTENCE]);

        expectFragmentedTimeBoundary(tokens);
    });

    it('accepts duplicate exact matches only when their normalized expression and reading identity agree', async () => {
        const duplicate = {
            ...exactTimeMatch(),
            entry: { ...exactTimeMatch().entry, reading: ' じかん ', dictionary: 'Duplicate dictionary' },
        };
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: [exactTimeMatch(), duplicate] });

        const [tokens] = await parser.parse([SENTENCE]);

        expectExactTimeBoundary(tokens, 'jpdb');
    });

    it('does not replace fragments with deinflected, reading-only, or partial dictionary candidates', async () => {
        const inexact = [
            { ...exactTimeMatch(), deinflected: { term: '時間', rules: ['n'], reasons: ['synthetic'], depth: 1 } },
            { ...exactTimeMatch(), entry: { ...exactTimeMatch().entry, expression: '時' } },
            { ...exactTimeMatch(), start: 1, end: 2, surface: '時' },
        ];
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: inexact });

        const [tokens] = await parser.parse([SENTENCE]);

        expectFragmentedTimeBoundary(tokens);
    });

    it('reconciles arbitrary exact compounds without a lexical exception', async () => {
        const sentence = '学習中';
        const remoteTokens = [
            token('学', 'がく', 0, 1, 'jpdb'),
            token('習', 'しゅう', 1, 2, 'jpdb'),
            token('中', 'ちゅう', 2, 3, 'jpdb'),
        ];
        const exact: YomitanTermMatch = {
            entry: { expression: '学習', reading: 'がくしゅう', glossary: ['study'], dictionary: 'Jitendex' },
            start: 0,
            end: 2,
            surface: '学習',
        };
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: [exact], remoteTokens });

        const [tokens] = await parser.parse([sentence]);

        expect(tokens.map(item => ({
            surface: sentence.slice(item.start, item.end),
            expression: item.card.spelling,
            source: item.card.source,
        }))).toEqual([
            { surface: '学習', expression: '学習', source: 'local' },
            { surface: '中', expression: '中', source: 'jpdb' },
        ]);
    });

    it('reconciles a boundary after a supplementary kanji without splitting its surrogate pair', async () => {
        const sentence = '𠮟咤';
        const remoteTokens = [
            token('𠮟', 'し', 0, 2, 'jpdb'),
            token('咤', 'か', 2, 3, 'jpdb'),
        ];
        const exact: YomitanTermMatch = {
            entry: { expression: sentence, reading: 'しか', glossary: ['fixture'], dictionary: 'Jitendex' },
            start: 0,
            end: 3,
            surface: sentence,
        };
        const { parser, findTermMatches } = parserHarness({
            provider: 'jpdb',
            localMatches: [exact],
            remoteTokens,
        });

        const [tokens] = await parser.parse([sentence]);

        expect(findTermMatches).toHaveBeenCalledWith(sentence, 8, [], expect.objectContaining({ language: 'ja' }));
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toMatchObject({
            start: 0,
            end: 3,
            length: 3,
            card: { spelling: sentence, reading: 'しか', source: 'local' },
        });
        expect(sentence.slice(tokens[0].start, tokens[0].end)).toBe(sentence);
    });

    it('rejects an exact substring when replacing it would discard a Japanese token remainder', async () => {
        const sentence = '日時間';
        const remoteTokens = [
            token('日時', 'にちじ', 0, 2, 'jpdb'),
            token('間', 'かん', 2, 3, 'jpdb'),
        ];
        const exact: YomitanTermMatch = {
            entry: { expression: '時間', reading: 'じかん', glossary: ['time'], dictionary: 'Jitendex' },
            start: 1,
            end: 3,
            surface: '時間',
        };
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: [exact], remoteTokens });

        const [tokens] = await parser.parse([sentence]);

        expect(tokens.map(item => item.card.spelling)).toEqual(['日時', '間']);
    });

    it('caches the narrow boundary evidence across cold rerender/reactive rescans', async () => {
        const { parser, findTermMatches } = parserHarness({ provider: 'jpdb', localMatches: [exactTimeMatch()] });

        const first = await parser.parse([SENTENCE]);
        const coldLookupCount = findTermMatches.mock.calls.length;
        const second = await parser.parse([SENTENCE]);

        expect(tokenSnapshot(second[0])).toEqual(tokenSnapshot(first[0]));
        expect(coldLookupCount).toBeGreaterThan(0);
        expect(findTermMatches).toHaveBeenCalledTimes(coldLookupCount);
    });

    it('evicts a failed boundary lookup so a later reactive rescan can retry', async () => {
        let attempts = 0;
        const { parser, findTermMatches } = parserHarness({
            provider: 'jpdb',
            findTermMatches: async surface => {
                if (surface !== '2時間') return [];
                attempts += 1;
                if (attempts === 1) throw new Error('transient IndexedDB failure');
                return [exactTimeMatch()];
            },
        });

        const first = await parser.parse([SENTENCE]);
        const second = await parser.parse([SENTENCE]);

        expectFragmentedTimeBoundary(first[0]);
        expectExactTimeBoundary(second[0], 'jpdb');
        expect(findTermMatches.mock.calls.filter(([surface]) => surface === '2時間')).toHaveLength(2);
    });

    it('bounds boundary evidence candidates per paragraph in deterministic text order', async () => {
        const sentence = '日本語学習時間天気予報情報処理能力開発';
        const remoteTokens = Array.from(sentence, (surface, index) => token(surface, surface, index, index + 1, 'jpdb'));
        const { parser, findTermMatches } = parserHarness({ provider: 'jpdb', remoteTokens, localMatches: [] });

        await parser.parse([sentence]);

        expect(findTermMatches.mock.calls.map(([surface]) => surface)).toEqual([
            '日本', '本語', '語学', '学習', '習時', '時間', '間天', '天気',
        ]);
    });

    it('shares one boundary lookup concurrency ceiling across paragraphs and concurrent parses', async () => {
        let active = 0;
        let peak = 0;
        const findTermMatches = vi.fn(async () => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise(resolve => window.setTimeout(resolve, 2));
            active -= 1;
            return [];
        });
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            parserProvider: 'auto',
            localDictionariesEnabled: true,
            showPitchAccent: false,
        };
        const makeParser = () => new ReaderParser({
            getSettings: () => settings,
            jpdb: {
                parse: vi.fn(async (paragraphs: string[]) => paragraphs.map(sentence =>
                    Array.from(sentence, (surface, index) => token(surface, surface, index, index + 1, 'jpdb')))),
            } as never,
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => true),
                findTermMatches,
                lookupTermMeta: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
        });
        const firstParser = makeParser();
        const secondParser = makeParser();

        await Promise.all([
            firstParser.parse(['日本語学習時間', '天気予報情報処理']),
            secondParser.parse(['能力開発試験勉強', '文章解析辞書検索']),
        ]);

        expect(findTermMatches.mock.calls.length).toBeGreaterThan(4);
        expect(peak).toBe(4);
    });

    it('keeps local-first longest-span results without a remote round-trip', async () => {
        const { parser, jpdbParse, jitenParse } = parserHarness({ provider: 'local', localMatches: [exactTimeMatch()] });

        const [tokens] = await parser.parse([SENTENCE], { allowSegmentedFallback: true });

        expect(tokenSnapshot(tokens)[0]).toEqual({
            surface: '時間', expression: '時間', reading: 'じかん', source: 'local', range: [1, 3],
        });
        expect(jpdbParse).not.toHaveBeenCalled();
        expect(jitenParse).not.toHaveBeenCalled();
    });
});
