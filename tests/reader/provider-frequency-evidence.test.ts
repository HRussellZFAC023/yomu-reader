import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { renderWordPills } from '../../src/reader/sources/word-pills';
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

    it('rejects ambiguous exact JPDB candidates instead of choosing a rank', async () => {
        const data = await loader({}, async () => [
            jpdbSearchCard('にほん', 2456),
            { ...jpdbSearchCard('にほん', 3000), vid: 303 },
        ]).load(jitenCard()).all;
        const frequencyRanks = (data as typeof data & { frequencyRanks: { jpdb?: unknown } }).frequencyRanks;

        expect(frequencyRanks.jpdb).toBeUndefined();
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
