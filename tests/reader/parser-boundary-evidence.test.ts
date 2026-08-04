import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../src/reader/app/types';
import type {
    YomitanExactTermCandidateRequest,
    YomitanTermEntry,
    YomitanTermMatch,
} from '../../src/reader/dictionaries/yomitan';
import { resetActiveLearningTargetLanguage } from '../../src/reader/languages/active';
import type { LearningTargetModule } from '../../src/reader/languages/types';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

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

beforeEach(() => {
    resetActiveLearningTargetLanguage();
});

afterEach(() => {
    resetActiveLearningTargetLanguage();
});

describe('exact local candidate integration', () => {
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
