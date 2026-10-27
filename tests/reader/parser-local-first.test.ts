import { describe, expect, it, vi } from 'vitest';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import type { LearningTargetModule } from '../../src/reader/languages/types';
import type { ReaderSettings } from '../../src/reader/app/types';
import type {
    YomitanExactTermCandidateRequest,
    YomitanTermEntry,
    YomitanTermMatch,
} from '../../src/reader/dictionaries/yomitan';
import type { JPDBCard, JPDBToken } from "../../src/reader/app/types";
import type { YomuSrsAdapter, YomuSrsLookupItem, YomuSrsReviewable } from "../../src/reader/srs/types";
import { afterEach } from "vitest";

/**
 * Local-first parsing (parserProvider: 'local'): with term dictionaries
 * installed, parsing never calls the Jiten/JPDB APIs — including flows that
 * pass requireApi/requireJpdb, which describe remote error handling rather
 * than a data dependency. Without installed term dictionaries the API-first
 * order is preserved so a fresh install keeps working before the onboarding
 * dictionary download lands.
 */

function termMatch(surface: string, reading: string, start: number): YomitanTermMatch {
    return {
        entry: {
            expression: surface,
            reading,
            glossary: ['a gloss'],
            dictionary: 'Jitendex',
        },
        start,
        end: start + surface.length,
        surface,
    };
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

interface HarnessOverrides {
    settings?: Partial<ReaderSettings>;
    hasTermDictionaries?: boolean;
}

function parserHarness({ settings = {}, hasTermDictionaries = true }: HarnessOverrides = {}) {
    const jpdbParse = vi.fn(async (paragraphs: string[]) => paragraphs.map(() => []));
    const jitenParse = vi.fn(async (paragraphs: string[]) => paragraphs.map(() => []));
    const publicJitenParse = vi.fn(async (paragraphs: readonly string[]) => paragraphs.map(() => []));
    const localEntry: YomitanTermEntry = {
        expression: '日本語',
        reading: 'にほんご',
        glossary: ['Japanese language'],
        dictionary: 'Jitendex',
    };
    const findTermMatches = vi.fn(async (text: string) => (
        text.includes(localEntry.expression)
            ? [termMatch(localEntry.expression, localEntry.reading, text.indexOf(localEntry.expression))]
            : []
    ));
    const lookupExactTermCandidates = exactCandidateLookup([localEntry]);
    const parser = new ReaderParser({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-api-key',
            jitenApiKey: 'ak_jiten-key',
            parserProvider: 'local',
            ...settings,
        }),
        jpdb: { parse: jpdbParse } as never,
        jiten: { parse: jitenParse } as never,
        jitenPublicVocabulary: { parse: publicJitenParse },
        dictionaries: {
            hasTermDictionaries: vi.fn(async () => hasTermDictionaries),
            findTermMatches,
            lookupExactTermCandidates,
            lookupTermMeta: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
        } as never,
    });
    return {
        parser,
        jpdbParse,
        jitenParse,
        publicJitenParse,
        findTermMatches,
        lookupExactTermCandidates,
    };
}

describe('local-first parsing', () => {
    it('parses with local dictionaries and never calls Jiten/JPDB when term dictionaries are installed', async () => {
        const { parser, jpdbParse, jitenParse, findTermMatches, lookupExactTermCandidates } = parserHarness();

        const [tokens] = await parser.parse(['日本語を学ぶ']);

        expect(jitenParse).not.toHaveBeenCalled();
        expect(jpdbParse).not.toHaveBeenCalled();
        expect(findTermMatches).toHaveBeenCalled();
        expect(lookupExactTermCandidates).toHaveBeenCalledTimes(1);
        expect(tokens?.[0]?.card).toMatchObject({ spelling: '日本語', source: 'local' });
    });

    it('stays local for requireApi/requireJpdb flows', async () => {
        const { parser, jpdbParse, jitenParse } = parserHarness();

        await parser.parse(['日本語を学ぶ'], { requireApi: true, requireJpdb: true });

        expect(jitenParse).not.toHaveBeenCalled();
        expect(jpdbParse).not.toHaveBeenCalled();
    });

    it('keeps the API-first order while no term dictionaries are installed', async () => {
        const { parser, jitenParse } = parserHarness({ hasTermDictionaries: false });

        await parser.parse(['日本語を学ぶ']);

        expect(jitenParse).toHaveBeenCalledTimes(2);
        expect(jitenParse.mock.calls[0]?.[0]).toEqual(['日本語を学ぶ']);
    });

    it('keeps the API-first order for parserProvider auto', async () => {
        const { parser, jitenParse, findTermMatches } = parserHarness({ settings: { parserProvider: 'auto' } });

        await parser.parse(['日本語を学ぶ']);

        expect(jitenParse).toHaveBeenCalledTimes(2);
        expect(jitenParse.mock.calls[0]?.[0]).toEqual(['日本語を学ぶ']);
        expect(findTermMatches).not.toHaveBeenCalled();
    });
});

describe('jiten short-batch length gate', () => {
    it('routes a short explicit-Jiten batch to the local parser instead of jiten.moe', async () => {
        const { parser, jitenParse, findTermMatches } = parserHarness({ settings: { parserProvider: 'jiten' } });

        await parser.parse(['日本語']); // 3 Japanese chars < 24

        expect(jitenParse).not.toHaveBeenCalled();
        expect(findTermMatches).toHaveBeenCalled();
    });

    it('uses Jiten for a long enough explicit-Jiten batch', async () => {
        const { parser, jitenParse } = parserHarness({ settings: { parserProvider: 'jiten' } });

        await parser.parse(['日本語日本語日本語日本語日本語日本語日本語日本語']); // 24 chars >= 24

        expect(jitenParse).toHaveBeenCalledTimes(2);
        expect(jitenParse.mock.calls[0]?.[0]).toEqual(['日本語日本語日本語日本語日本語日本語日本語日本語']);
    });

    it('still uses Jiten for short text when no local dictionaries are installed', async () => {
        const { parser, jitenParse } = parserHarness({ settings: { parserProvider: 'jiten' }, hasTermDictionaries: false });

        await parser.parse(['日本語']);

        expect(jitenParse).toHaveBeenCalledTimes(2);
        expect(jitenParse.mock.calls[0]?.[0]).toEqual(['日本語']);
    });

    it('does not gate the auto provider (API-first order preserved)', async () => {
        const { parser, jitenParse } = parserHarness({ settings: { parserProvider: 'auto' } });

        await parser.parse(['日本語']); // short, but auto is never gated

        expect(jitenParse).toHaveBeenCalledTimes(2);
        expect(jitenParse.mock.calls[0]?.[0]).toEqual(['日本語']);
    });
});

describe('keyless offline first paint', () => {
    function keylessParser({ onLine }: { onLine: boolean }) {
        const publicParse = vi.fn(async (paragraphs: readonly string[]) => paragraphs.map(() => []));
        const publicLookupMany = vi.fn(async () => new Map());
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', parserProvider: 'local' }),
            jpdb: { parse: vi.fn(async () => []) } as never,
            jiten: { parse: vi.fn(async () => []) } as never,
            jitenPublicVocabulary: { parse: publicParse, lookupMany: publicLookupMany },
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => false),
                findTermMatches: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
        });
        vi.stubGlobal('navigator', { onLine });
        return { parser, publicParse, publicLookupMany };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('skips the doomed public-jiten fetch offline and still paints segmented tokens', async () => {
        const { parser, publicParse } = keylessParser({ onLine: false });

        const [tokens] = await parser.parse(['日本語を学ぶ'], { allowSegmentedFallback: true });

        expect(publicParse).not.toHaveBeenCalled();
        expect(tokens?.length).toBeGreaterThan(0);
    });

    it('still attempts public jiten online so dictionary-correct boundaries win', async () => {
        const { parser, publicParse, publicLookupMany } = keylessParser({ onLine: true });

        await parser.parse(['日本語を学ぶ'], { allowSegmentedFallback: true });

        expect(publicParse).toHaveBeenCalledTimes(1);
        expect(publicLookupMany).toHaveBeenCalledTimes(1);
    });
});

describe('parserProvider defaults', () => {
    it('defaults new installs to local parsing', () => {
        expect(DEFAULT_SETTINGS.parserProvider).toBe('local');
        expect(normalizeReaderSettings(null).parserProvider).toBe('local');
    });

    it('uses the current default when parserProvider is absent', () => {
        expect(normalizeReaderSettings({ apiKey: 'jpdb-api-key' } as Partial<ReaderSettings>).parserProvider).toBe('local');
    });

    it('round-trips an explicit choice', () => {
        expect(normalizeReaderSettings({ parserProvider: 'local' } as Partial<ReaderSettings>).parserProvider).toBe('local');
        expect(normalizeReaderSettings({ parserProvider: 'auto' } as Partial<ReaderSettings>).parserProvider).toBe('auto');
    });
});

describe('ReaderParser Academy SRS state integration', () => {
    function parsedCard(): JPDBCard {
        return {
            vid: 101,
            sid: 202,
            rid: 0,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            provisionalState: true,
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
    }

    function parsedToken(): JPDBToken {
        return { card: parsedCard(), start: 0, end: 2, length: 2, rubies: [], pitchClass: '', sentence: '読む' };
    }

    function academyDueCard(): YomuSrsReviewable {
        return {
            providerId: 'yomu-local',
            providerCardId: '読む\u0000よむ',
            kind: 'vocabulary',
            expression: '読む',
            reading: 'よむ',
            meanings: [],
            state: ['due'],
            dueAt: 2_000_000,
            lastReviewAt: 1_000_000,
        };
    }

    function parser(yomuLocalSrsEnabled: boolean, lookupCards: NonNullable<YomuSrsAdapter['lookupCards']>) {
        return new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                localDictionariesEnabled: false,
                yomuLocalSrsEnabled,
            }),
            jpdb: { parse: vi.fn(async () => [[parsedToken()]]) } as never,
            dictionaries: {} as never,
            yomuLocalSrs: { lookupCards },
        });
    }


    it('hydrates the final provider parse before rendering when Academy is enabled', async () => {
        const lookupCards = vi.fn(async (_items: readonly YomuSrsLookupItem[]) => [academyDueCard()]);

        const [tokens] = await parser(true, lookupCards).parse(['読む']);

        expect(lookupCards).toHaveBeenCalledOnce();
        expect(tokens[0]?.card).toMatchObject({
            source: 'jpdb',
            reviewSource: 'yomu-local',
            cardState: ['due'],
            dueAt: 2_000_000,
        });
    });

    it('does not read or paint the local deck while Academy is disabled', async () => {
        const lookupCards = vi.fn(async (_items: readonly YomuSrsLookupItem[]) => [academyDueCard()]);

        const [tokens] = await parser(false, lookupCards).parse(['読む']);

        expect(lookupCards).not.toHaveBeenCalled();
        expect(tokens[0]?.card).toMatchObject({ cardState: ['not-in-deck'], provisionalState: true });
    });
});

describe('keyless local-dictionary enrichment concurrency', () => {
    // Keyless (no API key) local-dictionary parsing enriches each match with pitch
    // (lookupTermMeta) and per-kanji readings (lookupKanji) from IndexedDB. The
    // subtitle warmup parses several cues at once, each fanning out over many
    // matches; without a shared gate that was thousands of concurrent IndexedDB
    // requests at cold start, starving the main thread. This pins that the
    // enrichment fan-out is bounded across concurrent parses.

    function makeMatches(prefix: string, count: number) {
        return Array.from({ length: count }, (_, i) => ({
            entry: {
                expression: `${prefix}語${i}`,
                reading: `ご${i}`,
                glossary: ['word'],
                dictionary: 'JMdict',
            },
            start: i,
            end: i + 1,
            surface: `${prefix}語${i}`,
            deinflected: false,
        }));
    }

    it('caps concurrent IndexedDB enrichment lookups across many parallel cue parses', async () => {
        let active = 0;
        let maxActive = 0;
        // Release one synchronous launch wave per microtask. This is independent
        // of inherited fake clocks, while an unbounded fan-out still reaches 60.
        let releaseScheduled = false;
        const pending: Array<() => void> = [];
        const lookupTermMeta = vi.fn(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>(resolve => {
                pending.push(resolve);
                if (releaseScheduled) return;
                releaseScheduled = true;
                queueMicrotask(() => {
                    releaseScheduled = false;
                    pending.splice(0).forEach(release => release());
                });
            });
            active--;
            return [] as never[];
        });
        const findTermMatches = vi.fn(async (text: string) => makeMatches(text.slice(0, 2), 10));

        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                showPitchAccent: true,
            }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        });

        // 6 distinct cues parsed concurrently, each 10 matches → 60 enrichment
        // tasks launched at once. The shared gate must keep in-flight IndexedDB
        // lookups bounded well below that.
        const cues = ['あい', 'うえ', 'おか', 'きく', 'けこ', 'さし'];
        await Promise.all(cues.map(text => parser.parse([`${text}文章`], {
            includeLocalPitch: true,
            allowSegmentedFallback: true,
        })));

        expect(lookupTermMeta).toHaveBeenCalled();
        expect(maxActive).toBeGreaterThan(0);
        // The ConcurrencyGate limit is 12; allow headroom but it must be far
        // below the unbounded 60 the old Promise.all fan-out produced.
        expect(maxActive).toBeLessThanOrEqual(12);
    });

    // The extension store client sends each macrotask's reads as one round
    // trip and bounds IndexedDB fan-out in its host. Gating it here would cut
    // one page into a round trip per twelve words.
    it('hands every enrichment lookup to a store that coalesces reads at once', async () => {
        let release!: () => void;
        const released = new Promise<void>(resolve => { release = resolve; });
        const lookupTermMeta = vi.fn(async () => {
            await released;
            return [] as never[];
        });
        const findTermMatches = vi.fn(async (text: string) => makeMatches(text.slice(0, 2), 10));
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                localDictionariesEnabled: true,
                showPitchAccent: true,
            }),
            jpdb: {} as never,
            dictionaries: { coalescesReads: true, findTermMatches, lookupTermMeta } as never,
        });

        const cues = ['あい', 'うえ', 'おか', 'きく', 'けこ', 'さし'];
        const parsing = Promise.all(cues.map(text => parser.parse([`${text}文章`], {
            includeLocalPitch: true,
            allowSegmentedFallback: true,
        })));

        // All 60 lookups are in flight before any of them has answered.
        await vi.waitFor(() => expect(lookupTermMeta).toHaveBeenCalledTimes(60));
        release();
        await parsing;
    });
});

describe('ReaderParser local parse never hangs', () => {
    // The remote JPDB/Jiten parse paths were time-bounded, but the local
    // (IndexedDB-backed) path was not. On iPad WebKit an IndexedDB request can
    // silently never fire onsuccess/onerror, which left parse() pending forever and
    // stranded every caller (study translation, hover lookups, body decoration) on
    // a loading placeholder. parse() must always settle.

    afterEach(() => {
        vi.useRealTimers();
    });

    it('degrades to the segmented parse when a local dictionary lookup never settles', async () => {
        vi.useFakeTimers();
        const findTermMatches = vi.fn(() => new Promise(() => undefined)); // never settles
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                parserProvider: 'local',
                localDictionariesEnabled: true,
                yomuLocalSrsEnabled: false,
            }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, hasTermDictionaries: async () => true } as never,
        });

        const parsePromise = parser.parse(['r/mildlyinfuriating 5 時間前'], { allowSegmentedFallback: true });
        let settled = false;
        void parsePromise.then(() => { settled = true; }, () => { settled = true; });

        // Without a local timeout this stays pending forever — prove it is still
        // pending before the ceiling, then that it settles once the ceiling and
        // the reconciliation ceiling elapse.
        await vi.advanceTimersByTimeAsync(2_000);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(settled).toBe(true);

        const result = await parsePromise;
        expect(result).toHaveLength(1);
        expect(Array.isArray(result[0])).toBe(true);
    });

    it('settles even when the local SRS card-state lookup never returns', async () => {
        vi.useFakeTimers();
        const findTermMatches = vi.fn(async () => [{
            entry: { expression: '日本語', reading: 'にほんご', glossary: ['Japanese'], dictionary: 'JMdict' },
            start: 0,
            end: 3,
            surface: '日本語',
            deinflected: true,
        }]);
        const parser = new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                jitenApiKey: '',
                parserProvider: 'local',
                localDictionariesEnabled: true,
                yomuLocalSrsEnabled: true,
                includeLocalPitch: false,
            }),
            jpdb: {} as never,
            dictionaries: {
                findTermMatches,
                hasTermDictionaries: async () => true,
                lookupTermMeta: async () => [],
                lookupKanji: async () => [],
            } as never,
            // The SRS card-state read is the LAST IndexedDB touch in parse();
            // a stalled lookupCards must not re-hang the whole pipeline.
            yomuLocalSrs: { lookupCards: () => new Promise(() => undefined) } as never,
        });

        const parsePromise = parser.parse(['日本語'], { includeLocalPitch: false, allowSegmentedFallback: true });
        let settled = false;
        void parsePromise.then(() => { settled = true; }, () => { settled = true; });

        await vi.advanceTimersByTimeAsync(2_000);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(settled).toBe(true);

        const result = await parsePromise;
        expect(result).toHaveLength(1);
    });
});
