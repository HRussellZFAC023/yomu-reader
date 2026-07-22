import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderWordPills } from '../../src/reader/sources/word-pills';
import { kanjiFrequencyRanks } from '../../src/reader/cards/frequency-ranks';
import type { JPDBCard, ReaderSettings } from '../../src/reader/app/types';

type LoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    return { promise: new Promise<T>(done => { resolve = done; }), resolve };
}

function jitenCard(): JPDBCard {
    return {
        vid: 101,
        sid: 2,
        rid: 0,
        spelling: '日本',
        reading: 'にほん',
        frequencyRank: 891,
        partOfSpeech: ['noun'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: 101,
        jitenReadingIndex: 2,
    };
}

function jpdbSearchCard(reading: string, frequencyRank: number): JPDBCard {
    return {
        ...jitenCard(),
        vid: 202,
        sid: 0,
        spelling: '日本',
        reading,
        frequencyRank,
        source: 'jpdb',
        reviewSource: undefined,
    };
}

function loader(
    settings: Partial<ReaderSettings>,
    jpdbSearch: (query: string) => Promise<JPDBCard[]>,
    jiten?: Partial<LoaderDependencies['jiten']>,
): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: false,
            showPitchAccent: false,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: false,
            bunproDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
            ...settings,
        }),
        dictionaries: {
            lookup: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
            lookupTermMeta: vi.fn(async () => []),
        },
        jpdbPublicPitch: { lookup: vi.fn(async () => []) },
        jpdbVocabulary: { lookup: vi.fn(async () => null), search: jpdbSearch },
        anki: { findExistingCards: vi.fn(), deckNames: vi.fn() },
        jpdb: { listDecks: vi.fn() },
        jiten,
        isJpdbBackedCard: () => false,
    } as unknown as LoaderDependencies);
}

describe('provider-specific frequency evidence', () => {
    it('keeps Jiten and JPDB ranks independent on a Jiten-owned card', async () => {
        const search = vi.fn(async () => [
            jpdbSearchCard('にっぽん', 77),
            jpdbSearchCard('にほん', 2456),
        ]);
        const data = await loader({}, search).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & {
            frequencyRanks: {
                jiten?: { rank: number };
                jpdb?: { rank: number };
            };
        }).frequencyRanks;

        expect(search).toHaveBeenCalledTimes(1);
        expect(frequencyRanks).toMatchObject({
            jiten: { rank: 891 },
            jpdb: { rank: 2456 },
        });

        const html = renderWordPills({
            card: jitenCard(),
            jpdbUrl: 'https://jpdb.io/search?q=%E6%97%A5%E6%9C%AC',
            settings: DEFAULT_SETTINGS,
            frequencyRanks,
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        } as Parameters<typeof renderWordPills>[0] & { frequencyRanks: typeof frequencyRanks });

        expect(html).toContain('Jiten #891');
        expect(html).toContain('JPDB #2456');
        expect(html.match(/Jiten #891/g)).toHaveLength(1);
        expect(html.match(/JPDB #2456/g)).toHaveLength(1);
    });

    it('does not borrow a rank from a differently-read JPDB homograph', async () => {
        const data = await loader({}, async () => [jpdbSearchCard('にっぽん', 77)]).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & { frequencyRanks: { jpdb?: unknown } }).frequencyRanks;

        expect(frequencyRanks.jpdb).toBeUndefined();
    });

    it('uses late Jiten identity to recover pitch and the exact JPDB rank for a provisional card', async () => {
        const provisional = {
            ...jitenCard(),
            spelling: '人気',
            reading: '人気',
            frequencyRank: null,
            pitchAccent: [],
            wordWithReading: null,
            source: 'local' as const,
            reviewSource: undefined,
            jitenWordId: undefined,
            jitenReadingIndex: undefined,
        };
        const jpdb = {
            ...jpdbSearchCard('にんき', 1900),
            spelling: '人気',
            reading: 'にんき',
        };
        const lookupVocabularyInfoForCard = vi.fn(async () => ({
            wordId: 777,
            mainReading: { text: '人気[にんき]', readingIndex: 0, frequencyRank: 1465, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: ['noun'],
            definitions: [],
            pitchAccents: [0],
            knownStates: [],
            composedOf: [],
            usedIn: [],
            usedInTotal: 0,
            examples: [],
        }));
        const search = vi.fn(async () => [
            { ...jpdb, reading: 'ひとけ', frequencyRank: 90 },
            jpdb,
        ]);

        const data = await loader({
            jitenDefinitionsEnabled: true,
            showPitchAccent: true,
        }, search, { lookupVocabularyInfoForCard }).load(provisional).all;

        expect(provisional.reading).toBe('にんき');
        expect(provisional.wordWithReading).toBe('人気[にんき]');
        expect(provisional.pitchAccent).toEqual(['LHHH']);
        expect(data.frequencyRanks).toMatchObject({
            jiten: { rank: 1465, reading: 'にんき' },
            jpdb: { rank: 1900, reading: 'にんき' },
        });
    });

    it('does not let mismatched Jiten detail rewrite a populated homograph reading', async () => {
        const original = jitenCard();
        const lookupVocabularyInfoForCard = vi.fn(async () => ({
            wordId: 777,
            mainReading: { text: '日本[にっぽん]', readingIndex: 1, frequencyRank: 10, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: [],
            definitions: [],
            pitchAccents: [0],
            knownStates: [],
            composedOf: [],
            usedIn: [],
            usedInTotal: 0,
            examples: [],
        }));

        await loader({ jitenDefinitionsEnabled: true }, async () => [], { lookupVocabularyInfoForCard }).load(original).all;

        expect(original.reading).toBe('にほん');
        expect(original.wordWithReading).toBeNull();
        expect(original.pitchAccent).toEqual([]);
    });

    it('uses lightweight Jiten search for rank-only evidence when Jiten definitions are disabled', async () => {
        const searchVocabulary = vi.fn(async () => [jitenCard()]);
        const lookupVocabularyInfoForCard = vi.fn(async () => null);
        const localCard = {
            ...jitenCard(),
            source: 'local' as const,
            reviewSource: undefined,
            frequencyRank: null,
            jitenWordId: undefined,
            jitenReadingIndex: undefined,
        };
        const data = await loader({}, async () => [], {
            searchVocabulary,
            lookupVocabularyInfoForCard,
        }).load(localCard).all;

        expect(data.frequencyRanks).toMatchObject({ jiten: { rank: 891, source: 'live-search' } });
        expect(searchVocabulary).toHaveBeenCalledWith('日本', 10);
        expect(lookupVocabularyInfoForCard).not.toHaveBeenCalled();
    });

    it('keeps local metadata scoped to its provider without suppressing the other live provider', () => {
        const html = renderWordPills({
            card: jitenCard(),
            jpdbUrl: 'https://jpdb.io/search?q=%E6%97%A5%E6%9C%AC',
            settings: DEFAULT_SETTINGS,
            metaEntries: [{ expression: '日本', mode: 'freq', data: { frequency: 5000 }, dictionary: 'JPDBv2' }],
            frequencyRanks: {
                jiten: { provider: 'jiten', rank: 891, spelling: '日本', reading: 'にほん', source: 'card' },
                jpdb: { provider: 'jpdb', rank: 2456, spelling: '日本', reading: 'にほん', source: 'live-search' },
            },
            isJpdbBackedCard: () => false,
            dictionaryLabel: name => name,
        });

        expect(html).toContain('Jiten #891');
        expect(html).toContain('JPDB #5000');
        expect(html).not.toContain('JPDB #2456');
    });

    it('takes the provider-ordered first rank when the same identity is listed more than once', async () => {
        // jpdb duplicates identities (e.g. two 今日/きょう entries, only one ranked);
        // requiring a UNIQUE match silently dropped the rank for every such word.
        const data = await loader({}, async () => [
            jpdbSearchCard('にほん', 2456),
            { ...jpdbSearchCard('にほん', 3000), vid: 303 },
        ]).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & { frequencyRanks: { jpdb?: { rank: number } } }).frequencyRanks;

        expect(frequencyRanks.jpdb).toMatchObject({ rank: 2456 });
    });

    it('skips rank-less duplicates of the same identity', async () => {
        const data = await loader({}, async () => [
            { ...jpdbSearchCard('にほん', 0), vid: 303, frequencyRank: null },
            jpdbSearchCard('にほん', 2456),
        ]).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & { frequencyRanks: { jpdb?: { rank: number } } }).frequencyRanks;

        expect(frequencyRanks.jpdb).toMatchObject({ rank: 2456 });
    });

    it('does not request an independently disabled provider', async () => {
        const search = vi.fn(async () => [jpdbSearchCard('にほん', 2456)]);
        const settings = {
            dictionaryLookupLinks: DEFAULT_SETTINGS.dictionaryLookupLinks.map(link =>
                link.id === 'jpdb-frequency' ? { ...link, enabled: false } : link,
            ),
        };
        const data = await loader(settings, search).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & { frequencyRanks: { jiten?: { rank: number }; jpdb?: unknown } }).frequencyRanks;

        expect(search).not.toHaveBeenCalled();
        expect(frequencyRanks).toMatchObject({ jiten: { rank: 891 } });
        expect(frequencyRanks.jpdb).toBeUndefined();
    });

    it('does not request a rank when the provider lookup pill is disabled', async () => {
        const search = vi.fn(async () => [jpdbSearchCard('にほん', 2456)]);
        const settings = {
            dictionaryLookupLinks: DEFAULT_SETTINGS.dictionaryLookupLinks.map(link =>
                link.id === 'jpdb' ? { ...link, enabled: false } : link,
            ),
        };
        const data = await loader(settings, search).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & { frequencyRanks: { jpdb?: unknown } }).frequencyRanks;

        expect(search).not.toHaveBeenCalled();
        expect(frequencyRanks.jpdb).toBeUndefined();
    });

    it('keeps a timed-out JPDB search for one late current-card hydration without a duplicate request', async () => {
        vi.useFakeTimers();
        try {
            const result = deferred<JPDBCard[]>();
            const search = vi.fn(() => result.promise);
            const load = loader({}, search).load(jitenCard());

            await vi.advanceTimersByTimeAsync(4_000);
            await expect(load.all).resolves.toMatchObject({
                frequencyRanks: { jiten: { rank: 891 } },
            });

            result.resolve([jpdbSearchCard('にほん', 2456)]);
            await expect(load.hydrateFrequencyRanks?.()).resolves.toMatchObject({
                jiten: { rank: 891 },
                jpdb: { rank: 2456 },
            });
            expect(search).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('kanji frequency pill evidence', () => {
    const pills = (overrideQuery: string | undefined, frequencyRanks: unknown) => renderWordPills({
        card: jitenCard(),
        jpdbUrl: 'https://jpdb.io/kanji/%E8%82%89',
        settings: DEFAULT_SETTINGS,
        overrideQuery,
        frequencyRanks,
        isJpdbBackedCard: () => false,
        dictionaryLabel: name => name,
    } as Parameters<typeof renderWordPills>[0]);

    it('extracts both providers from kanji details', () => {
        const ranks = kanjiFrequencyRanks('肉', 516, 'Top 300-400');
        expect(ranks.jiten).toMatchObject({ rank: 516, source: 'kanji', spelling: '肉' });
        expect(ranks.jpdb).toMatchObject({ rank: 300, source: 'kanji', display: 'Top 300-400' });
        expect(kanjiFrequencyRanks('肉', null, 'unranked')).toEqual({});
    });

    it('shows each provider kanji rank on the kanji popover pills', () => {
        const html = pills('肉', kanjiFrequencyRanks('肉', 516, 'Top 300-400'));
        expect(html).toContain('Jiten #516');
        expect(html).toContain('JPDB Top 300-400');
    });

    it('does not merge word-rank evidence onto a kanji popover', () => {
        const html = pills('肉', {
            jiten: { provider: 'jiten', rank: 891, spelling: '日本', reading: 'にほん', source: 'card' },
            jpdb: { provider: 'jpdb', rank: 2456, spelling: '日本', reading: 'にほん', source: 'live-search' },
        });
        expect(html).not.toContain('#891');
        expect(html).not.toContain('#2456');
    });

    it('does not merge kanji-rank evidence onto a word popover', () => {
        const html = pills(undefined, kanjiFrequencyRanks('肉', 516, 'Top 300-400'));
        expect(html).not.toContain('#516');
        expect(html).not.toContain('Top 300-400');
    });
});
