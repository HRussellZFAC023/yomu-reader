import { describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import type { YomitanTermMatch } from '../../src/reader/dictionaries/yomitan';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const SENTENCE = '2時間前';

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
}) {
    const findTermMatches = vi.fn(async () => options.localMatches ?? []);
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

describe('exact local boundary evidence for remote parse fragments', () => {
    it.each(['jpdb', 'jiten'] as const)('reconciles a %s split only when an exact longer local expression crosses the boundary', async provider => {
        const { parser } = parserHarness({ provider, localMatches: [exactTimeMatch()] });

        const [tokens] = await parser.parse([SENTENCE]);

        expect(tokenSnapshot(tokens)).toEqual([
            { surface: '時間', expression: '時間', reading: 'じかん', source: 'local', range: [1, 3] },
            { surface: '前', expression: '前', reading: 'まえ', source: provider, range: [3, 4] },
        ]);
        const root = document.createElement('div');
        root.innerHTML = renderTokensToHtml(SENTENCE, tokens, DEFAULT_SETTINGS);
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

        expect(tokenSnapshot(tokens)).toEqual([
            { surface: '時間', expression: '時間', reading: 'じかん', source: 'local', range: [1, 3] },
            { surface: '前', expression: '前', reading: 'まえ', source: 'fallback', range: [3, 4] },
        ]);
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

    it('does not replace fragments with deinflected, reading-only, or partial dictionary candidates', async () => {
        const inexact = [
            { ...exactTimeMatch(), deinflected: { term: '時間', rules: ['n'], reasons: ['synthetic'], depth: 1 } },
            { ...exactTimeMatch(), entry: { ...exactTimeMatch().entry, expression: '時' } },
            { ...exactTimeMatch(), start: 1, end: 2, surface: '時' },
        ];
        const { parser } = parserHarness({ provider: 'jpdb', localMatches: inexact });

        const [tokens] = await parser.parse([SENTENCE]);

        expect(tokens.map(item => item.card.spelling)).toEqual(['２時', '間', '前']);
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
