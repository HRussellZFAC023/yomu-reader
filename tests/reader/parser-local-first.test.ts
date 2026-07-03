import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReaderParser } from '../../src/reader/lookup/parser';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { YomitanTermMatch } from '../../src/reader/dictionaries/yomitan';

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

interface HarnessOverrides {
    settings?: Partial<ReaderSettings>;
    hasTermDictionaries?: boolean;
}

function parserHarness({ settings = {}, hasTermDictionaries = true }: HarnessOverrides = {}) {
    const jpdbParse = vi.fn(async (paragraphs: string[]) => paragraphs.map(() => []));
    const jitenParse = vi.fn(async (paragraphs: string[]) => paragraphs.map(() => []));
    const findTermMatches = vi.fn(async (text: string) => (text.includes('日本語') ? [termMatch('日本語', 'にほんご', text.indexOf('日本語'))] : []));
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
        dictionaries: {
            hasTermDictionaries: vi.fn(async () => hasTermDictionaries),
            findTermMatches,
            lookupTermMeta: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
        } as never,
    });
    return { parser, jpdbParse, jitenParse, findTermMatches };
}

describe('local-first parsing', () => {
    it('parses with local dictionaries and never calls Jiten/JPDB when term dictionaries are installed', async () => {
        const { parser, jpdbParse, jitenParse, findTermMatches } = parserHarness();

        const [tokens] = await parser.parse(['日本語を学ぶ']);

        expect(jitenParse).not.toHaveBeenCalled();
        expect(jpdbParse).not.toHaveBeenCalled();
        expect(findTermMatches).toHaveBeenCalled();
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

        expect(jitenParse).toHaveBeenCalledTimes(1);
    });

    it('keeps the API-first order for parserProvider auto', async () => {
        const { parser, jitenParse, findTermMatches } = parserHarness({ settings: { parserProvider: 'auto' } });

        await parser.parse(['日本語を学ぶ']);

        expect(jitenParse).toHaveBeenCalledTimes(1);
        expect(findTermMatches).not.toHaveBeenCalled();
    });
});

describe('keyless offline first paint', () => {
    function keylessParser({ onLine }: { onLine: boolean }) {
        const publicParse = vi.fn(async (paragraphs: readonly string[]) => paragraphs.map(() => []));
        const parser = new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', parserProvider: 'local' }),
            jpdb: { parse: vi.fn(async () => []) } as never,
            jiten: { parse: vi.fn(async () => []) } as never,
            jitenPublicVocabulary: { parse: publicParse },
            dictionaries: {
                hasTermDictionaries: vi.fn(async () => false),
                findTermMatches: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
        });
        vi.stubGlobal('navigator', { onLine });
        return { parser, publicParse };
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
        const { parser, publicParse } = keylessParser({ onLine: true });

        await parser.parse(['日本語を学ぶ'], { allowSegmentedFallback: true });

        expect(publicParse).toHaveBeenCalledTimes(1);
    });
});

describe('parserProvider defaults', () => {
    it('defaults new installs to local parsing', () => {
        expect(DEFAULT_SETTINGS.parserProvider).toBe('local');
        expect(normalizeReaderSettings(null).parserProvider).toBe('local');
    });

    it('keeps API-first parsing for saved payloads that predate the setting', () => {
        expect(normalizeReaderSettings({ apiKey: 'jpdb-api-key' } as Partial<ReaderSettings>).parserProvider).toBe('auto');
    });

    it('round-trips an explicit choice', () => {
        expect(normalizeReaderSettings({ parserProvider: 'local' } as Partial<ReaderSettings>).parserProvider).toBe('local');
        expect(normalizeReaderSettings({ parserProvider: 'auto' } as Partial<ReaderSettings>).parserProvider).toBe('auto');
    });
});
