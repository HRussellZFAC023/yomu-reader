import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AnkiConnectClient,
    AudioPlayer,
    CardPopoverRenderer,
    CardRenderDataLoader,
    DEFAULT_SETTINGS,
    ImmersionKitClient,
    JpdbClient,
    JpdbPublicPitchClient,
    JpdbVocabularyClient,
    YomitanDictionaryStore,
    card,
    cardDetailLoaderSettings,
    encodedJpdbOggHeader,
    jitenTestCard,
    mockAudioBlobUserscriptRequest,
    mockAudioPlaybackEnvironment,
    mockHtmlAudioPlayback,
    mockJpdbVocabularyAudioFetch,
    mockObjectUrls,
    mockSpeechSynthesis,
    resolveUserscriptBlobResponse,
    resolveUserscriptTextResponse,
    stubAudioConstructorPlayback,
    testAudioBlob,
    testCardRenderDataLoader,
    testCardPopoverRenderer,
    testImmersionKitExample,
    testImmersionPopoverController,
    unproxiedFetchTarget,
} from './fixtures';
import type {
    AnkiLookupResult,
    JPDBCard,
    JitenApiClient,
} from './fixtures';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('uses public JPDB search identity for Jiten-backed cards when a JPDB key is present', async () => {
        const lookup = vi.fn(async () => ({
            meanings: ['JPDB public meaning'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        }));
        const enabledLoader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: 'jpdb-key',
                jitenApiKey: 'jiten-key',
                jpdbDefinitionsEnabled: true,
                jitenDefinitionsEnabled: true,
                jpdbMiningEnabled: false,
            }),
            jpdbVocabulary: { lookup },
            isJpdbBackedCard: () => false,
        });
        const jitenCard = jitenTestCard({ spelling: '復習', reading: 'ふくしゅう' });

        await expect(enabledLoader.load(jitenCard).jpdbVocabularyInfo).resolves.toMatchObject({
            meanings: ['JPDB public meaning'],
        });
        expect(lookup).toHaveBeenCalledWith(0, '復習', 'ふくしゅう');

        const disabledLookup = vi.fn(async () => ({
            meanings: ['hidden'],
            compounds: [],
            usedInVocabulary: [],
            examples: [],
        }));
        const disabledLoader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: '',
                jitenApiKey: 'jiten-key',
                jpdbDefinitionsEnabled: false,
                jitenDefinitionsEnabled: true,
                jpdbMiningEnabled: false,
            }),
            jpdbVocabulary: { lookup: disabledLookup },
            isJpdbBackedCard: () => false,
        });

        await expect(disabledLoader.load(jitenCard).jpdbVocabularyInfo).resolves.toBeNull();
        expect(disabledLookup).not.toHaveBeenCalled();
    });

    it('loads keyless public JPDB pitch for Jiten/no-key users', async () => {
        // The public pitch source needs no JPDB key, so Jiten-only and no-key users
        // still get a pitch graph during study/lookup.
        const publicPitch = vi.fn(async () => ['HLL']);
        const loader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({
                apiKey: '',
                jitenApiKey: 'jiten-key',
                showPitchAccent: true,
            }),
            dictionaries: { lookupTermMeta: vi.fn(async () => []) },
            jpdbPublicPitch: { lookup: publicPitch },
        });

        await expect(loader.load({ ...card, pitchAccent: [] }).pitchAccent).resolves.toEqual(['HLL']);
        expect(publicPitch).toHaveBeenCalled();
    });

    it('promotes JPDB not-in-deck cards when pooled deck membership finds them', async () => {
        const isInUserDeckPool = vi.fn(async () => true);
        const loader = testCardRenderDataLoader({
            settings: cardDetailLoaderSettings({ ankiEnabled: false }),
            jpdb: {
                isInUserDeckPool,
            },
        });
        const pooledCard = { ...card, vid: 1464530, sid: 0, spelling: '日本語', reading: 'にほんご', cardState: ['not-in-deck'] as JPDBCard['cardState'] };

        await expect(loader.load(pooledCard).all).resolves.toMatchObject({
            jpdbDecks: [],
            ankiDecks: [],
        });
        expect(pooledCard.cardState).toEqual(['in-deck']);
        expect(isInUserDeckPool).toHaveBeenCalledWith(pooledCard);
    });

    it('does not load Anki status when only the dictionary Anki section is enabled', async () => {
        const cachedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 55,
                primaryCardId: 77,
                cardIds: [77],
                state: 'known',
                deckNames: ['Other Deck'],
                modelName: 'Imported',
                fields: { Word: '動画' },
                tags: [],
                reps: 9,
                lapses: 1,
            },
        };
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [cachedLookup]);
        const deckNames = vi.fn(async () => ['Other Deck']);
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            ankiSectionEnabled: true,
            wordUnderlineColorSource: 'anki' as const,
            localDictionariesEnabled: false,
            showPitchAccent: false,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
        };
        const loader = testCardRenderDataLoader({
            settings,
            anki: { findCachedStatusBatch, deckNames },
        });

        await expect(loader.load({ ...card, spelling: '動画', reading: 'どうが' }).all).resolves.toMatchObject({
            ankiLookup: {
                state: 'not-in-deck',
                primary: null,
            },
            ankiDecks: [],
        });
        expect(findCachedStatusBatch).not.toHaveBeenCalled();
        expect(deckNames).not.toHaveBeenCalled();
    });

    it('does not surface source Anki lookup data when Anki mining is disabled', async () => {
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [{
            state: 'due',
            notes: [],
            primary: null,
        }]);
        const settings = cardDetailLoaderSettings({
            ankiEnabled: false,
            ankiSectionEnabled: true,
            localDictionariesEnabled: false,
            showPitchAccent: false,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
        });
        const loader = testCardRenderDataLoader({
            settings,
            anki: { findCachedStatusBatch },
        });
        const sourceAnkiCard: JPDBCard = {
            ...card,
            spelling: '動画',
            reading: 'どうが',
            source: 'anki',
            reviewSource: 'anki',
            rid: 7701,
            ankiCardId: 7701,
            ankiNoteId: 55,
            ankiDeckNames: ['Anime::Mining'],
            ankiModelName: 'Imported Core',
            cardState: ['due'],
        };

        const load = loader.load(sourceAnkiCard);

        await expect(load.ankiLookup).resolves.toMatchObject({
            state: 'not-in-deck',
            primary: null,
        });
        await expect(load.all).resolves.toMatchObject({
            ankiLookup: {
                state: 'not-in-deck',
                primary: null,
            },
            ankiDecks: [],
        });
        expect(findCachedStatusBatch).not.toHaveBeenCalled();
    });

    it('exposes JPDB vocabulary details without waiting for Anki hydration', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const lookup = vi.fn(async () => ({ meanings: ['video'], compounds: [], examples: [] }));
            const findExistingCards = vi.fn(() => never);
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                localDictionariesEnabled: false,
                showPitchAccent: false,
                jpdbDefinitionsEnabled: true,
                jpdbMiningEnabled: false,
            };
            const loader = new CardRenderDataLoader({
                getSettings: () => settings,
                dictionaries: {
                    lookup: vi.fn(async () => []),
                    lookupKanji: vi.fn(async () => []),
                    lookupTermMeta: vi.fn(async () => []),
                } as unknown as YomitanDictionaryStore,
                jpdbPublicPitch: { lookup: vi.fn(async () => []) } as unknown as JpdbPublicPitchClient,
                jpdbVocabulary: { lookup } as unknown as JpdbVocabularyClient,
                anki: {
                    findExistingCards,
                    deckNames: vi.fn(async () => []),
                } as unknown as AnkiConnectClient,
                jpdb: { listDecks: vi.fn(async () => []) } as unknown as JpdbClient,
                jiten: { listReaderStudyDecks: vi.fn(async () => []) } as unknown as JitenApiClient,
                isJpdbBackedCard: () => true,
            });
            const load = loader.load({ ...card, spelling: '動画', reading: 'どうが' });
            let allResolved = false;
            void load.all.then(() => { allResolved = true; });

            await expect(load.jpdbVocabularyInfo).resolves.toMatchObject({ meanings: ['video'] });
            expect(lookup).toHaveBeenCalledWith(card.vid, '動画', 'どうが');

            await expect(load.all).resolves.toMatchObject({
                jpdbVocabularyInfo: { meanings: ['video'] },
                ankiLookup: { state: 'not-in-deck' },
            });
            expect(allResolved).toBe(true);
            expect(findExistingCards).not.toHaveBeenCalled();

            const hydrated = load.hydrateAnkiLookup?.() ?? Promise.resolve({ state: 'not-in-deck', notes: [], primary: null } as AnkiLookupResult);
            await Promise.resolve();
            expect(findExistingCards).toHaveBeenCalledWith({ ...card, spelling: '動画', reading: 'どうが' });
            await vi.advanceTimersByTimeAsync(4_000);
            await expect(hydrated).resolves.toMatchObject({ state: 'not-in-deck' });
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses cached Anki status in popover data while full Anki card details are slow', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const cachedStatus: AnkiLookupResult = {
                state: 'due',
                notes: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    deckNames: ['Anime::Mining'],
                    cardIds: [7701],
                    primaryCardId: 7701,
                    state: 'due',
                    fields: {},
                    tags: [],
                    reps: 9,
                    lapses: 1,
                }],
                primary: {
                    noteId: 55,
                    modelName: 'Imported Core',
                    deckNames: ['Anime::Mining'],
                    cardIds: [7701],
                    primaryCardId: 7701,
                    state: 'due',
                    fields: {},
                    tags: [],
                    reps: 9,
                    lapses: 1,
                },
            };
            const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [cachedStatus]);
            const findExistingCards = vi.fn(() => never);
            const deckNames = vi.fn(async () => []);
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: false,
                localDictionariesEnabled: false,
                showPitchAccent: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
            };
            const loader = testCardRenderDataLoader({
                settings,
                anki: {
                    findCachedStatusBatch,
                    findExistingCards,
                    deckNames,
                },
            });
            const load = loader.load({ ...card, spelling: '動画', reading: 'どうが' });
            let allResolved = false;
            void load.all.then(() => { allResolved = true; });

            await expect(load.ankiLookup).resolves.toMatchObject({
                state: 'due',
                primary: { noteId: 55, primaryCardId: 7701 },
            });
            expect(findCachedStatusBatch).toHaveBeenCalledWith([{ ...card, spelling: '動画', reading: 'どうが' }]);
            await expect(load.all).resolves.toMatchObject({
                ankiLookup: {
                    state: 'due',
                    primary: { noteId: 55, primaryCardId: 7701 },
                },
                ankiDecks: [],
            });
            expect(allResolved).toBe(true);
            expect(findExistingCards).not.toHaveBeenCalled();
            expect(deckNames).not.toHaveBeenCalled();

            const hydrated = load.hydrateAnkiLookup?.() ?? Promise.resolve(cachedStatus);
            await Promise.resolve();
            expect(findExistingCards).toHaveBeenCalledWith({ ...card, spelling: '動画', reading: 'どうが' });
            await vi.advanceTimersByTimeAsync(4_000);
            await expect(hydrated).resolves.toMatchObject({
                state: 'due',
                primary: { noteId: 55, primaryCardId: 7701, detailsUnavailable: true },
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not hydrate full Anki card details when only the dictionary Anki source is enabled', async () => {
        const cachedStatus: AnkiLookupResult = {
            state: 'due',
            notes: [{
                noteId: 55,
                modelName: 'Imported Core',
                deckNames: ['Anime::Mining'],
                cardIds: [7701],
                primaryCardId: 7701,
                state: 'due',
                fields: {},
                tags: [],
                reps: 9,
                lapses: 1,
            }],
            primary: null,
        };
        cachedStatus.primary = cachedStatus.notes[0] ?? null;
        const detailedLookup: AnkiLookupResult = {
            state: 'due',
            notes: [{
                ...cachedStatus.notes[0]!,
                fields: {
                    Word: '動画',
                    Reading: 'どうが',
                    Meaning: 'video',
                },
                renderedCards: [{
                    cardId: 7701,
                    deckName: 'Anime::Mining',
                    question: '<div>動画</div>',
                    answer: '<div>video</div>',
                }],
            }],
            primary: null,
        };
        detailedLookup.primary = detailedLookup.notes[0] ?? null;
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [cachedStatus]);
        const findExistingCards = vi.fn(async (): Promise<AnkiLookupResult> => detailedLookup);
        const deckNames = vi.fn(async () => []);
        const settings = cardDetailLoaderSettings({
            apiKey: DEFAULT_SETTINGS.apiKey,
            ankiEnabled: false,
            ankiSectionEnabled: true,
            jpdbMiningEnabled: false,
        });
        const lookupCard = { ...card, spelling: '動画', reading: 'どうが' };
        const loader = testCardRenderDataLoader({
            settings,
            anki: {
                findCachedStatusBatch,
                findExistingCards,
                deckNames,
            },
        });

        const load = loader.load(lookupCard);

        await expect(load.ankiLookup).resolves.toMatchObject({
            state: 'not-in-deck',
            primary: null,
        });
        await expect(load.all).resolves.toMatchObject({
            ankiLookup: {
                state: 'not-in-deck',
                primary: null,
            },
            ankiDecks: [],
        });
        expect(findCachedStatusBatch).not.toHaveBeenCalled();
        expect(findExistingCards).not.toHaveBeenCalled();
        expect(deckNames).not.toHaveBeenCalled();

        await expect(load.hydrateAnkiLookup?.()).resolves.toMatchObject({
            state: 'not-in-deck',
            primary: null,
        });
        expect(findExistingCards).not.toHaveBeenCalled();
    });

    it('keeps untrusted cached Anki misses in fast popover data', async () => {
        const fastMiss: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null, trusted: false };
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [fastMiss]);
        const findExistingCards = vi.fn(async (): Promise<AnkiLookupResult> => ({
            state: 'not-in-deck',
            notes: [],
            primary: null,
        }));
        const loader = new CardRenderDataLoader({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                localDictionariesEnabled: false,
                showPitchAccent: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
            }),
            dictionaries: {
                lookup: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as unknown as YomitanDictionaryStore,
            jpdbPublicPitch: { lookup: vi.fn(async () => []) } as unknown as JpdbPublicPitchClient,
            jpdbVocabulary: { lookup: vi.fn(async () => null) } as unknown as JpdbVocabularyClient,
            anki: {
                findCachedStatusBatch,
                findExistingCards,
                deckNames: vi.fn(async () => []),
            } as unknown as AnkiConnectClient,
            jpdb: { listDecks: vi.fn(async () => []) } as unknown as JpdbClient,
            jiten: { listReaderStudyDecks: vi.fn(async () => []) } as unknown as JitenApiClient,
            isJpdbBackedCard: () => true,
        });

        const load = loader.load({ ...card, spelling: '動画', reading: 'どうが' });

        await expect(load.ankiLookup).resolves.toEqual(fastMiss);
        await expect(load.all).resolves.toMatchObject({
            ankiLookup: { state: 'not-in-deck', primary: null, trusted: false },
        });
        expect(findExistingCards).not.toHaveBeenCalled();
    });

    it('renders cache-only Anki status in the popover header without showing Add to Anki', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: true,
            ankiSectionEnabled: true,
            jpdbMiningEnabled: true,
            apiKey: 'test-key',
        });
        const cachedStatus: AnkiLookupResult = {
            state: 'due',
            notes: [],
            primary: {
                noteId: 55,
                modelName: 'Imported Core',
                deckNames: ['Anime::Mining'],
                cardIds: [7701],
                primaryCardId: 7701,
                state: 'due',
                fields: {},
                tags: [],
                reps: 9,
                lapses: 1,
            },
        };

        document.body.innerHTML = renderer.render({ ...card, cardState: ['not-in-deck'] }, '動画を見る。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: cachedStatus,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        expect(document.querySelector('.jpdb-reader-meta')?.textContent).toContain('Anki Due');
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.anki-due')).not.toBeNull();
        expect(document.querySelector('.jpdb-reader-anki-existing summary small')?.textContent).toBe('Due · Anime::Mining · 9 reviews, 1 lapse');
        expect(document.querySelector('.jpdb-reader-anki-details-pending')?.textContent).toContain('Loading details');
        expect(document.querySelector('[data-action="anki"]')).toBeNull();
    });

    it('hides cached Anki popover status, details, and grade targets when Anki mining is disabled', () => {
        const renderer = testCardPopoverRenderer({
            ankiEnabled: false,
            ankiSectionEnabled: true,
            enableReviews: true,
            jpdbMiningEnabled: true,
            apiKey: 'test-key',
        });
        const cachedStatus: AnkiLookupResult = {
            state: 'due',
            notes: [{
                noteId: 55,
                modelName: 'Imported Core',
                deckNames: ['Anime::Mining'],
                cardIds: [7701],
                primaryCardId: 7701,
                state: 'due',
                fields: {},
                tags: [],
                reps: 9,
                lapses: 1,
            }],
            primary: null,
        };
        cachedStatus.primary = cachedStatus.notes[0] ?? null;

        document.body.innerHTML = renderer.render({ ...card, cardState: ['due'] }, '動画を見る。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: cachedStatus,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        expect(document.querySelector('.jpdb-reader-meta')?.textContent ?? '').not.toContain('Anki');
        expect(document.querySelector('.jpdb-reader-anki-existing')).toBeNull();
        expect(document.querySelector('[data-review-target="anki"]')).toBeNull();
        expect(document.querySelector('[data-anki-card-id]')).toBeNull();
    });

    it('renders trusted status-only Anki cache hits without offering Add to Anki', () => {
        const renderer = new CardPopoverRenderer({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                jpdbMiningEnabled: true,
                apiKey: 'test-key',
            }),
            isJpdbBackedCard: () => true,
            renderWordHistory: () => '',
            renderWordPills: () => '',
            renderDefinitionSources: () => '',
            dictionarySourceAttributes: () => '',
            dictionaryLabel: name => name,
            accountDataSurfaceTrusted: () => true,
        });

        document.body.innerHTML = renderer.render({ ...card, cardState: ['not-in-deck'] }, '動画を見る。', 'modal', {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'due', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            loading: false,
        });

        expect(document.querySelector('.jpdb-reader-meta')?.textContent).toContain('Anki Due');
        expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.anki-due')).not.toBeNull();
        expect(document.querySelector('[data-action="anki"]')).toBeNull();
        expect(document.querySelector('.jpdb-reader-anki-existing')).toBeNull();
    });

    it('does not let slow public JPDB pitch block card details', async () => {
        vi.useFakeTimers();
        try {
            const publicPitch = vi.fn(() => new Promise<string[]>(resolve => {
                window.setTimeout(() => resolve(['HLL']), 5_500);
            }));
            const settings = {
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                localDictionariesEnabled: false,
                showPitchAccent: true,
                ankiEnabled: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
            };
            const loader = testCardRenderDataLoader({
                settings,
                jpdbPublicPitch: { lookup: publicPitch },
                isJpdbBackedCard: () => false,
            });
            const lookupCard = { ...card, spelling: '読む', reading: 'よむ', pitchAccent: [] };
            const load = loader.load(lookupCard);

            await expect(load.all).resolves.toMatchObject({
                localEntries: [],
                jpdbVocabularyInfo: null,
            });
            await Promise.resolve();
            expect(lookupCard.pitchAccent).toEqual([]);
            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');

            await vi.advanceTimersByTimeAsync(5_500);

            await expect(load.pitchAccent).resolves.toEqual(['HLL']);
            expect(lookupCard.pitchAccent).toEqual(['HLL']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('exposes public pitch before slower card details finish', async () => {
        vi.useFakeTimers();
        try {
            const never = new Promise<never>(() => undefined);
            const publicPitch = vi.fn(() => new Promise<string[]>(resolve => {
                window.setTimeout(() => resolve(['HLL']), 250);
            }));
            const settings = cardDetailLoaderSettings({
                apiKey: 'jpdb-key',
                localDictionariesEnabled: false,
                showPitchAccent: true,
                ankiEnabled: false,
                jpdbDefinitionsEnabled: true,
                jpdbMiningEnabled: false,
            });
            const loader = testCardRenderDataLoader({
                settings,
                jpdbPublicPitch: { lookup: publicPitch },
                jpdbVocabulary: { lookup: vi.fn(() => never) },
                isJpdbBackedCard: () => false,
            });
            const lookupCard = { ...card, spelling: '読む', reading: 'よむ', pitchAccent: [] };
            const load = loader.load(lookupCard);
            let allResolved = false;
            void load.all.then(() => { allResolved = true; });

            await vi.advanceTimersByTimeAsync(250);

            await expect(load.pitchAccent).resolves.toEqual(['HLL']);
            expect(lookupCard.pitchAccent).toEqual(['HLL']);
            expect(allResolved).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses AnkiConnect card details on mobile handoff devices when a bridge is reachable', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const lookup: AnkiLookupResult = {
            state: 'known',
            notes: [{
                noteId: 42,
                modelName: 'Yomu Japanese',
                deckNames: ['Desktop Deck'],
                cardIds: [420],
                primaryCardId: 420,
                state: 'known',
                fields: { Expression: '読む', Meaning: 'to read' },
                tags: [],
                reps: 12,
                lapses: 0,
            }],
            primary: null,
        };
        lookup.primary = lookup.notes[0] ?? null;
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [lookup]);
        const findExistingCards = vi.fn(async (): Promise<AnkiLookupResult> => lookup);
        const deckNames = vi.fn(async () => ['Desktop Deck']);
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiMobileHandoff: true,
            localDictionariesEnabled: false,
            showPitchAccent: false,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
        };
        const loader = testCardRenderDataLoader({
            settings,
            anki: { findCachedStatusBatch, findExistingCards, deckNames },
        });

        try {
            const load = loader.load(card);
            await expect(load.all).resolves.toMatchObject({
                ankiLookup: { state: 'known', primary: { noteId: 42, primaryCardId: 420 } },
                ankiDecks: [],
            });
            expect(findCachedStatusBatch).toHaveBeenCalledWith([card]);
            expect(findExistingCards).not.toHaveBeenCalled();
            expect(deckNames).not.toHaveBeenCalled();

            await expect(load.hydrateAnkiLookup?.()).resolves.toMatchObject({
                state: 'known',
                primary: { noteId: 42, primaryCardId: 420 },
            });
            expect(findExistingCards).toHaveBeenCalledWith(card);
            expect(deckNames).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
        }
    });

    it('loads public JPDB vocabulary details for local cards without a JPDB key', async () => {
        const lookup = vi.fn(async () => ({ meanings: ['to read'], compounds: [], examples: [] }));
        const settings = cardDetailLoaderSettings({
            apiKey: '',
            showPitchAccent: false,
            jpdbDefinitionsEnabled: true,
            localDictionariesEnabled: false,
            ankiEnabled: false,
            jpdbMiningEnabled: false,
        });
        const loader = testCardRenderDataLoader({
            settings,
            jpdbVocabulary: { lookup },
            isJpdbBackedCard: () => false,
        });

        const localCard: JPDBCard = {
            ...card,
            vid: -1,
            sid: -1,
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['local-only meaning'], partOfSpeech: [] }],
            pitchAccent: [],
            source: 'local',
        };
        const load = loader.load(localCard);

        await expect(load.all).resolves.toMatchObject({
            jpdbVocabularyInfo: { meanings: ['to read'] },
        });
        expect(lookup).toHaveBeenCalledWith(0, '読む', 'よむ');
    });

    it('loads both Jiten and public JPDB details when only a Jiten key is configured', async () => {
        const lookup = vi.fn(async () => ({ meanings: ['JPDB page definition'], compounds: [], examples: [] }));
        const lookupVocabularyInfoForCard = vi.fn(async () => ({
            wordId: 42,
            mainReading: { text: '読む', readingIndex: 2, frequencyRank: 500, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: ['verb'],
            definitions: [],
            pitchAccents: [],
            knownStates: ['new'] as JPDBCard['cardState'],
            composedOf: [],
            usedIn: [],
            usedInTotal: 0,
            examples: [],
        }));
        const settings = cardDetailLoaderSettings({
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbDefinitionsEnabled: true,
            jitenDefinitionsEnabled: true,
            localDictionariesEnabled: false,
            ankiEnabled: false,
            jpdbMiningEnabled: false,
        });
        const loader = testCardRenderDataLoader({
            settings,
            jpdbVocabulary: { lookup },
            jiten: { lookupVocabularyInfoForCard },
            isJpdbBackedCard: () => false,
        });
        const lookupCard = jitenTestCard();
        const load = loader.load(lookupCard);

        await expect(load.all).resolves.toMatchObject({
            jpdbVocabularyInfo: { meanings: ['JPDB page definition'] },
            jitenVocabularyInfo: { wordId: 42 },
        });
        expect(lookup).toHaveBeenCalledWith(0, lookupCard.spelling, lookupCard.reading);
        expect(lookupVocabularyInfoForCard).toHaveBeenCalledWith(lookupCard);
    });

    it('renders media controls for compound fallback clips instead of current-sentence pseudo examples', async () => {
        localStorage.clear();
        const popover = document.createElement('div');
        const container = document.createElement('details');
        container.dataset.immersionKit = '';
        popover.append(container);
        document.body.append(popover);
        const controller = testImmersionPopoverController({
            settings: {
                immersionKitEnabled: true,
                immersionKitShowImages: true,
            },
            client: {
                search: vi.fn(async (query: string) => query === '国家'
                    ? [testImmersionKitExample({
                        id: 'ik-1',
                        sentence: '国家のために働く。',
                        translation: 'Work for the country.',
                        sourceTitle: 'Show',
                        titleSlug: 'show',
                        soundFile: 'audio.mp3',
                    })]
                    : []),
                mediaUrls: vi.fn((_: unknown, kind: 'image' | 'sound') => kind === 'sound' ? ['https://example.test/audio.mp3'] : []),
                fetchBlobUrl: vi.fn(),
            } as unknown as ImmersionKitClient,
        });
        const compoundCard = {
            ...card,
            spelling: '国家主席',
            reading: 'こっかしゅせき',
            sentence: '14日に中国の習近平国家主席と話をする予定です。',
        };

        await controller.loadExamples(popover, compoundCard, { relatedQueries: ['国家', '主席'] });

        expect(container.querySelector('.jpdb-reader-example-title')?.textContent).toBe('国家 · Show');
        expect(container.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/1');
        expect(container.querySelector('.jpdb-reader-example-inline-source')).toBeNull();
        expect(container.textContent).toContain('国家のために働く。');
        expect(container.textContent).not.toContain('Current sentence');
        expect(container.querySelector('[data-immersion-action="audio"]')).not.toBeNull();
        expect(container.querySelector('.jpdb-reader-example-media')).toBeNull();
    });

    it('skips the JapanesePod101 unavailable clip and plays the next source', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        stubAudioConstructorPlayback(played);
        const restoreObjectUrls = mockObjectUrls(() => 'blob:http://localhost/audio.mp3');
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                if (details.url === 'http://x.test/audio.mp3') {
                    details.onload?.({
                        status: 200,
                        response: testAudioBlob(),
                    });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([new Uint8Array(52288)], { type: 'audio/mpeg' }),
                });
            },
        });
        vi.stubGlobal('crypto', {
            subtle: {
                digest: () => Promise.reject(new Error('digest unavailable')),
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jpod101', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/audio.mp3', voice: '', enabled: true },
                ],
            }));

            await player.play(card);

            expect(played).toEqual(['blob:http://localhost/audio.mp3']);
        } finally {
            restoreObjectUrls();
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('plays recorded sources before text-to-speech, in list order, even in shuffle mode', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: 'blob:http://localhost/random-source-audio.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.url === 'http://x.test/missing.mp3') {
                    resolveUserscriptBlobResponse(details, ['missing'], 'text/html');
                    return;
                }
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/available.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/missing.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            // "Shuffle audio" only varies the clips within a source. The first
            // configured recorded source still wins, so the later sources and the
            // text-to-speech fallback are never reached.
            expect(requested).toEqual(['http://x.test/available.mp3']);
            expect(played).toEqual(['blob:http://localhost/random-source-audio.mp3']);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('keeps fallback text-to-speech out of random replay while recorded audio remains playable', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/recorded-source-audio.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/available.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/available.mp3']);
            expect(played).toEqual([
                'blob:http://localhost/recorded-source-audio.mp3',
                'blob:http://localhost/recorded-source-audio.mp3',
            ]);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('does not use lower-priority text-to-speech just to avoid an immediate recorded repeat', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0,
            objectUrl: 'blob:http://localhost/interleaved-recorded-source.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/interleaved.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/interleaved.mp3']);
            expect(played).toEqual([
                'blob:http://localhost/interleaved-recorded-source.mp3',
                'blob:http://localhost/interleaved-recorded-source.mp3',
            ]);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('retries a recorded URL instead of falling through to TTS when duplicate sources resolve the same media', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/shared-recorded-source.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.responseType === 'text') {
                    resolveUserscriptTextResponse(details, JSON.stringify({
                        audioSources: [{ url: 'http://x.test/shared.mp3' }],
                    }));
                    return;
                }
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/shared.mp3', voice: '', enabled: true },
                    { type: 'custom-json', url: 'http://x.test/source?term={term}', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toContain('http://x.test/shared.mp3');
            expect(requested).toContain('http://x.test/source?term=%E9%A3%9F%E3%81%B9%E3%82%8B');
            expect(played).toEqual([
                'blob:http://localhost/shared-recorded-source.mp3',
                'blob:http://localhost/shared-recorded-source.mp3',
            ]);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('avoids replaying the same browser text-to-speech voice before another source', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/after-tts-fallback.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioTtsMode: 'source-order',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/after-tts.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);
            await expect(player.play(card)).resolves.toBe(true);

            expect(spoken).toEqual([card.spelling]);
            expect(requested).toEqual(['http://x.test/after-tts.mp3']);
            expect(played).toEqual(['blob:http://localhost/after-tts-fallback.mp3']);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('plays the next recorded source after a prioritized browser TTS source on gesture replay', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            randomValue: 0.99,
            objectUrl: 'blob:http://localhost/source-order-after-tts.mp3',
        });
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.responseType === 'text') {
                    resolveUserscriptTextResponse(details, JSON.stringify({
                        result: {
                            audioSources: [{ source: { url: 'http://x.test/source-order-after-tts.mp3' } }],
                        },
                    }));
                    return;
                }
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioTtsMode: 'source-order',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom-json', url: 'http://x.test/source-order?term={term}', voice: '', enabled: true },
                ],
            }));

            await expect(player.play({ ...card, reading: '' }, { reservedGesture: true })).resolves.toBe(true);
            await expect(player.play(card, { userGesture: true })).resolves.toBe(true);

            expect(spoken).toEqual([card.spelling]);
            expect(requested).toEqual([
                'http://x.test/source-order?term=%E9%A3%9F%E3%81%B9%E3%82%8B',
                'http://x.test/source-order-after-tts.mp3',
            ]);
            expect(played.filter(url => url.startsWith('blob:'))).toEqual(['blob:http://localhost/source-order-after-tts.mp3']);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('keeps Jiten text-to-speech behind recorded audio in fallback mode', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreAudio = mockAudioPlaybackEnvironment(played, {
            objectUrl: 'blob:http://localhost/recorded-audio.mp3',
        });
        mockSpeechSynthesis(spoken);
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(() => {
            throw new Error('Jiten lookup should not run while recorded audio is playable');
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                resolveUserscriptBlobResponse(details);
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jiten-tts', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/available.mp3', voice: '', enabled: true },
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(jitenTestCard({
                spelling: 'よむ',
                reading: 'よむ',
                jitenWordId: 1456360,
                jitenReadingIndex: 0,
            }))).resolves.toBe(true);

            expect(requested).toEqual(['http://x.test/available.mp3']);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(played).toEqual(['blob:http://localhost/recorded-audio.mp3']);
            expect(spoken).toEqual([]);
        } finally {
            restoreAudio();
            vi.unstubAllGlobals();
        }
    });

    it('plays Jiten text-to-speech directly instead of blob-fetching through the hosted proxy', async () => {
        const played: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const fetchMock = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(() => {
            throw new Error('Jiten TTS media should be played directly');
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('GM', undefined);
        vi.stubGlobal('GM_xmlhttpRequest', undefined);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jiten-tts', url: '', voice: 'asmr', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(jitenTestCard({
                spelling: 'よむ',
                reading: 'よむ',
                jitenWordId: 1456360,
                jitenReadingIndex: 0,
            }))).resolves.toBe(true);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(played).toEqual(['https://api.jiten.moe/api/tts/word/1456360/0?voice=asmr']);
        } finally {
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('plays the configured first source even when a later source would be faster', async () => {
        vi.useFakeTimers();
        const played: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/preferred-audio.mp3'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                if (details.url === 'http://x.test/preferred-slow.mp3') {
                    // Slow but comfortably inside the request budget (6s by
                    // default). Answering AT the budget is a tie the transport
                    // may legitimately lose now that it enforces its own
                    // deadline — real managers honouring the timeout field
                    // always could — and a tie is not the contract under test.
                    window.setTimeout(() => {
                        details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
                    }, 3000);
                    return;
                }
                details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/preferred-slow.mp3', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/faster.mp3', voice: '', enabled: true },
                ],
            }));

            const play = player.play(card);
            await vi.advanceTimersByTimeAsync(120);
            // The configured source list is the priority: a later source is never
            // started just because the first one is slow (no fastest-source race).
            expect(requested).toEqual(['http://x.test/preferred-slow.mp3']);

            await vi.advanceTimersByTimeAsync(6000);
            await expect(play).resolves.toBe(true);

            // The first configured source wins; the faster later source is never requested.
            expect(requested).toEqual(['http://x.test/preferred-slow.mp3']);
            expect(played).toEqual(['blob:http://localhost/preferred-audio.mp3']);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            restoreMedia();
            vi.useRealTimers();
            vi.unstubAllGlobals();
        }
    });

    it('uses text-to-speech only after configured real audio sources all miss', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
            },
        });

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'random',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/first-missing.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/second-missing.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            // "Shuffle audio" varies the clips a single source offers, but never the
            // configured source priority list itself: the two custom sources are tried
            // in their authored order, then text-to-speech runs only as a fallback.
            expect(requested).toEqual(['http://x.test/first-missing.mp3', 'http://x.test/second-missing.mp3']);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            randomSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    });

    it('can let text-to-speech follow the configured source order', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        mockSpeechSynthesis(spoken);
        mockAudioBlobUserscriptRequest(details => requested.push(details.url));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioTtsMode: 'source-order',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'custom', url: 'http://x.test/available.mp3', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(spoken).toEqual([card.spelling]);
            expect(requested).toEqual([]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('can let JPDB word audio follow real audio before browser text-to-speech', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: Array<{ url: string; responseType?: string; headers?: Record<string, string> }> = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        mockSpeechSynthesis(spoken);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/jpdb-word-audio'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        const jpdbCard = { ...card, vid: 2805500, spelling: '大切な人', reading: 'たいせつなひと' };
        const encodedOggHeader = encodedJpdbOggHeader();
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push({
                    url: details.url,
                    responseType: details.responseType,
                    headers: details.headers,
                });
                if (details.url === 'http://x.test/missing.mp3') {
                    details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
                    return;
                }
                if (details.responseType === 'text') {
                    details.onload?.({
                        status: 200,
                        response: `
                            <link rel="canonical" href="https://jpdb.io/vocabulary/2805500/大切な人/たいせつなひと">
                            <a href="/vocabulary/2805500/大切な人/たいせつなひと#a"><ruby>大切な人<rt>たいせつなひと</rt></ruby></a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/b3b1e4e100d9"></a>
                        `,
                        responseText: `
                            <link rel="canonical" href="https://jpdb.io/vocabulary/2805500/大切な人/たいせつなひと">
                            <a href="/vocabulary/2805500/大切な人/たいせつなひと#a"><ruby>大切な人<rt>たいせつなひと</rt></ruby></a>
                            <a class="icon-link vocabulary-audio" href="#" data-audio="m1/b3b1e4e100d9"></a>
                        `,
                    });
                    return;
                }
                details.onload?.({
                    status: 200,
                    response: new Blob([encodedOggHeader], { type: 'application/octet-stream' }),
                });
            },
        });
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const target = unproxiedFetchTarget(input);
            requested.push({
                url: target,
                headers: Object.fromEntries(new Headers(init?.headers).entries()),
            });
            if (target.includes('/static/v/')) {
                return Promise.resolve(new Response(encodedOggHeader, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }));
            }
            return Promise.resolve(new Response(`
                <link rel="canonical" href="https://jpdb.io/vocabulary/2805500/大切な人/たいせつなひと">
                <a href="/vocabulary/2805500/大切な人/たいせつなひと#a"><ruby>大切な人<rt>たいせつなひと</rt></ruby></a>
                <a class="icon-link vocabulary-audio" href="#" data-audio="m1/b3b1e4e100d9"></a>
            `, { status: 200 }));
        }));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioTtsMode: 'source-order',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/missing.mp3', voice: '', enabled: true },
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(jpdbCard)).resolves.toBe(true);

            expect(requested.map(request => request.url)).toEqual([
                'http://x.test/missing.mp3',
                'https://jpdb.io/vocabulary/2805500/%E5%A4%A7%E5%88%87%E3%81%AA%E4%BA%BA/%E3%81%9F%E3%81%84%E3%81%9B%E3%81%A4%E3%81%AA%E3%81%B2%E3%81%A8',
                'https://jpdb.io/static/v/m1/b3b1e4e100d9',
            ]);
            expect(requested[2]?.headers).not.toHaveProperty('x-access');
            expect(played).toEqual(['blob:http://localhost/jpdb-word-audio']);
            expect(spoken).toEqual([]);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('uses JPDB word audio before browser text-to-speech for single-result alias lookups', async () => {
        const played: string[] = [];
        const spoken: string[] = [];
        const requested: string[] = [];
        const restoreMedia = mockHtmlAudioPlayback(played);
        mockSpeechSynthesis(spoken);
        const originalCreateObjectUrl = URL.createObjectURL;
        const originalRevokeObjectUrl = URL.revokeObjectURL;
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn(() => 'blob:http://localhost/onakagasuku-jpdb-audio'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: vi.fn(),
        });
        const jpdbHtml = `
            <link rel="canonical" href="https://jpdb.io/vocabulary/2021520/お腹が空く/おなかがすく">
            <div class="results details">
                <div class="result vocabulary">
                    <a href="/vocabulary/2021520/お腹が空く/おなかがすく#a">お腹が空く</a>
                    <a class="icon-link vocabulary-audio" href="#" data-audio="m1/770dc398fb85"></a>
                </div>
            </div>
        `;
        mockJpdbVocabularyAudioFetch(requested, jpdbHtml);

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play({ ...card, vid: 0, spelling: 'Onakagasuku', reading: '' })).resolves.toBe(true);

            expect(requested).toEqual([
                'https://jpdb.io/search?q=Onakagasuku',
                'https://jpdb.io/static/v/m1/770dc398fb85',
            ]);
            expect(played).toEqual(['blob:http://localhost/onakagasuku-jpdb-audio']);
            expect(spoken).toEqual([]);
        } finally {
            Object.defineProperty(URL, 'createObjectURL', {
                configurable: true,
                value: originalCreateObjectUrl,
            });
            Object.defineProperty(URL, 'revokeObjectURL', {
                configurable: true,
                value: originalRevokeObjectUrl,
            });
            restoreMedia();
            vi.unstubAllGlobals();
        }
    });

    it('tries JPDB word audio before browser text-to-speech in fallback mode', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({ status: 200, response: new Blob(['missing'], { type: 'text/html' }) });
            },
        });
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const target = unproxiedFetchTarget(input);
            requested.push(target);
            return Promise.resolve(new Response(
                '<link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる"><main>No word audio</main>',
                { status: 200 },
            ));
        }));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioViaBlob: true,
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'custom', url: 'http://x.test/missing.mp3', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([
                'http://x.test/missing.mp3',
                'https://jpdb.io/vocabulary/1/%E9%A3%9F%E3%81%B9%E3%82%8B/%E3%81%9F%E3%81%B9%E3%82%8B',
                'https://jpdb.io/search?q=%E9%A3%9F%E3%81%B9%E3%82%8B',
                'https://jpdb.io/search?q=%E3%81%9F%E3%81%B9%E3%82%8B',
            ]);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses browser text-to-speech after JPDB word audio misses in fallback mode', async () => {
        const spoken: string[] = [];
        const requested: string[] = [];
        mockSpeechSynthesis(spoken);
        vi.stubGlobal('GM', {
            xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
                requested.push(details.url);
                details.onload?.({
                    status: 200,
                    response: '<link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる"><main>No word audio</main>',
                    responseText: '<link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる"><main>No word audio</main>',
                });
            },
        });
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const target = unproxiedFetchTarget(input);
            requested.push(target);
            return Promise.resolve(new Response(
                '<link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる"><main>No word audio</main>',
                { status: 200 },
            ));
        }));

        try {
            const player = new AudioPlayer(() => ({
                ...DEFAULT_SETTINGS,
                audioEnableDefaultSources: false,
                audioSelectionMode: 'first',
                audioFallbackChimeEnabled: false,
                audioSources: [
                    { type: 'jpdb-tts', url: '', voice: '', enabled: true },
                    { type: 'text-to-speech', url: '', voice: '', enabled: true },
                ],
            }));

            await expect(player.play(card)).resolves.toBe(true);

            expect(requested).toEqual([
                'https://jpdb.io/vocabulary/1/%E9%A3%9F%E3%81%B9%E3%82%8B/%E3%81%9F%E3%81%B9%E3%82%8B',
                'https://jpdb.io/search?q=%E9%A3%9F%E3%81%B9%E3%82%8B',
                'https://jpdb.io/search?q=%E3%81%9F%E3%81%B9%E3%82%8B',
            ]);
            expect(spoken).toEqual([card.spelling]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

});
