import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/cards/render-data';
import { ImmersionPopoverController, type ImmersionPopoverControllerOptions } from '../../src/reader/immersion/popover-controller';
import type { ImmersionKitClient, ImmersionKitExample } from '../../src/reader/immersion/kit';
import { loadMiningContext } from '../../src/reader/study/mining-context';
import { requestText as requestReaderText } from '../../src/reader/network/http';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { StudySourceController } from '../../src/reader/study/sources';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { YomitanDictionaryStore } from '../../src/reader/dictionaries/yomitan';
import type { AnkiConnectClient } from '../../src/reader/anki/index';
import type { JpdbClient } from '../../src/reader/jpdb/jpdb';
import type { JpdbPublicPitchClient } from '../../src/reader/jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient } from '../../src/reader/jpdb/jpdb-vocabulary';
import { renderPronunciation } from '../../src/reader/popup/pronunciation';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/active';

type CardRenderDataLoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];
type CardRenderDataLoaderFixture = {
    settings?: Partial<ReaderSettings>;
    lookup?: YomitanDictionaryStore['lookup'];
    lookupKanji?: YomitanDictionaryStore['lookupKanji'];
    lookupTermMeta?: YomitanDictionaryStore['lookupTermMeta'];
    publicPitch?: JpdbPublicPitchClient['lookup'];
};

function createCardRenderDataLoader({
    settings,
    lookup = vi.fn(async () => []),
    lookupKanji = vi.fn(async () => []),
    lookupTermMeta = vi.fn(async () => []),
    publicPitch = vi.fn(async () => []),
}: CardRenderDataLoaderFixture = {}): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            localDictionaryShowKanji: false,
            showPitchAccent: false,
            ankiEnabled: false,
            jpdbDefinitionsEnabled: false,
            jpdbMiningEnabled: false,
            ...settings,
        }),
        dictionaries: {
            lookup,
            lookupKanji,
            lookupTermMeta,
        } as unknown as YomitanDictionaryStore,
        jpdbPublicPitch: { lookup: publicPitch } as unknown as JpdbPublicPitchClient,
        jpdbVocabulary: { lookup: vi.fn(async () => null) } as unknown as JpdbVocabularyClient,
        anki: {
            findExistingCards: vi.fn(),
            deckNames: vi.fn(),
        } as unknown as AnkiConnectClient,
        jpdb: { listDecks: vi.fn() } as unknown as JpdbClient,
        isJpdbBackedCard: () => false,
    } satisfies CardRenderDataLoaderDependencies);
}

describe('performance cache bounds', () => {
    it('preserves Yue local definitions, IPA metadata, and Anki while silencing Japanese providers', async () => {
        setActiveLearningTargetLanguage('yue');
        const localEntry = { expression: '學', reading: 'hok6', glossary: ['to learn'], dictionary: 'Cantonese' };
        const ipaEntry = {
            expression: '學',
            mode: 'ipa' as const,
            data: { reading: 'hok6', transcriptions: [{ ipa: '/hɔːk̚⁶/' }] },
            dictionary: 'Cantonese IPA',
        };
        const lookup = vi.fn(async () => [localEntry]);
        const lookupTermMeta = vi.fn(async () => [ipaEntry]);
        const publicPitch = vi.fn(async () => ['HLL']);
        const jpdbLookup = vi.fn(async () => ({ meanings: ['Japanese result'] }));
        const jpdbSearch = vi.fn(async () => []);
        const jitenLookup = vi.fn(async () => ({ meanings: ['Japanese result'] }));
        const jitenSearch = vi.fn(async () => []);
        const bunproSearch = vi.fn(async () => ({}));
        const cachedAnki = { state: 'known' as const, notes: [], primary: null };
        const findCachedStatusBatch = vi.fn(async () => [cachedAnki]);
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            showPitchAccent: true,
            ankiEnabled: true,
            ankiSectionEnabled: true,
            jpdbDefinitionsEnabled: true,
            jitenDefinitionsEnabled: true,
            bunproDefinitionsEnabled: true,
            jpdbMiningEnabled: true,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
        };
        const loader = new CardRenderDataLoader({
            getSettings: () => settings,
            dictionaries: {
                lookup,
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta,
            },
            jpdbPublicPitch: { lookup: publicPitch },
            jpdbVocabulary: { lookup: jpdbLookup, search: jpdbSearch },
            anki: {
                findCachedStatusBatch,
                findExistingCards: vi.fn(async () => cachedAnki),
                deckNames: vi.fn(async () => []),
            },
            jpdb: { listDecks: vi.fn(async () => []), isInUserDeckPool: vi.fn(async () => false) },
            jiten: {
                lookupVocabularyInfoForCard: jitenLookup,
                searchVocabulary: jitenSearch,
                listReaderStudyDecks: vi.fn(async () => []),
            },
            bunpro: {
                search: bunproSearch,
                getVocab: vi.fn(async () => ({})),
                getGrammarPoint: vi.fn(async () => ({})),
            },
            isJpdbBackedCard: () => false,
        } as unknown as CardRenderDataLoaderDependencies);
        const lookupCard: JPDBCard = {
            ...cardFor(1),
            spelling: '學',
            reading: 'hok6',
            language: 'yue',
            source: 'fallback',
            fallbackLookupTerms: ['學'],
            pitchAccent: [],
        };

        try {
            const load = loader.load(lookupCard);
            const data = await load.all;

            expect(data.localEntries).toEqual([localEntry]);
            expect(data.metaEntries).toEqual([ipaEntry]);
            expect(data.ankiLookup).toEqual(cachedAnki);
            expect(renderPronunciation({
                card: lookupCard,
                settings,
                metaEntries: data.metaEntries,
                dictionaryLabel: name => name,
            })).toContain('/hɔːk̚⁶/');
            expect(data).toMatchObject({
                jpdbVocabularyInfo: null,
                jitenVocabularyInfo: null,
                bunproDefinitionInfo: null,
                frequencyRanks: {},
            });
            expect(publicPitch).not.toHaveBeenCalled();
            expect(jpdbLookup).not.toHaveBeenCalled();
            expect(jpdbSearch).not.toHaveBeenCalled();
            expect(jitenLookup).not.toHaveBeenCalled();
            expect(jitenSearch).not.toHaveBeenCalled();
            expect(bunproSearch).not.toHaveBeenCalled();
            expect(findCachedStatusBatch).toHaveBeenCalledWith([lookupCard]);
        } finally {
            resetActiveLearningTargetLanguage();
        }
    });

    it('loads installed definitions for an authored fallback lemma instead of rendering an empty definition state', async () => {
        const lookup = vi.fn(async (term: string) => term === '行く'
            ? [{ expression: '行く', reading: 'いく', glossary: ['to go'], dictionary: 'Jitendex' }]
            : []);
        const loader = createCardRenderDataLoader({ lookup });
        const card = { ...cardFor(1), spelling: '行って', reading: 'いって', source: 'fallback' as const, fallbackLookupTerms: ['行く'] };

        await expect(loader.load(card).localEntries).resolves.toEqual([
            { expression: '行く', reading: 'いく', glossary: ['to go'], dictionary: 'Jitendex' },
        ]);
        expect(lookup.mock.calls[0]?.[0]).toBe('行く');
    });

    it('bounds per-card render data cache entries', async () => {
        const lookup = vi.fn(async (_term: string) => []);
        const loader = createCardRenderDataLoader({ lookup });

        for (let index = 0; index < 121; index++) {
            await loader.load(cardFor(index)).localEntries;
        }
        await loader.load(cardFor(0)).localEntries;

        expect(lookup).toHaveBeenCalledTimes(122);
        expect(lookup.mock.calls.at(-1)?.[0]).toBe('単語0');
    });

    it('loads page definition sources without starting unrelated card-render work', async () => {
        const lookup = vi.fn(async () => []);
        const lookupKanji = vi.fn(async () => []);
        const lookupTermMeta = vi.fn(async () => []);
        const publicPitch = vi.fn(async () => []);
        const loader = createCardRenderDataLoader({
            lookup,
            lookupKanji,
            lookupTermMeta,
            publicPitch,
        });

        const load = loader.loadDefinitionSources(cardFor(1), {
            includeJpdbDefinition: false,
            includeJitenDefinition: false,
            includeBunproDefinition: false,
        });
        await load.settled;

        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookupKanji).not.toHaveBeenCalled();
        expect(lookupTermMeta).not.toHaveBeenCalled();
        expect(publicPitch).not.toHaveBeenCalled();
    });

    it('cancels fallback timers when card data resolves before its deadline', async () => {
        vi.useFakeTimers();
        try {
            const loader = createCardRenderDataLoader();
            const load = loader.loadDefinitionSources(cardFor(1), {
                includeJpdbDefinition: false,
                includeJitenDefinition: false,
                includeBunproDefinition: false,
            });

            await load.settled;

            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancels the public-pitch grace timer when local metadata settles first', async () => {
        vi.useFakeTimers();
        try {
            const publicPitch = vi.fn(async () => ['HLL']);
            const loader = createCardRenderDataLoader({
                settings: { showPitchAccent: true },
                lookupTermMeta: vi.fn(async () => []),
                publicPitch,
            });

            const load = loader.load({ ...cardFor(1), spelling: '読む', reading: 'よむ', pitchAccent: [] });

            await load.pitchAccent;
            await load.all;

            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses local pitch metadata without waiting for public JPDB pitch', async () => {
        const lookupTermMeta = vi.fn(async () => [{
            expression: '計量',
            mode: 'pitch' as const,
            data: { reading: 'けいりょう', pitches: [{ position: 0 }] },
            dictionary: 'Pitch',
        }]);
        const publicPitch = vi.fn(async () => ['HLL']);
        const loader = createCardRenderDataLoader({
            settings: { showPitchAccent: true },
            lookupTermMeta,
            publicPitch,
        });
        const lookupCard = { ...cardFor(1), spelling: '計量', reading: 'けいりょう', pitchAccent: [] };
        const load = loader.load(lookupCard);

        await expect(load.localMetaEntries ?? Promise.resolve([])).resolves.toHaveLength(1);
        await expect(load.all).resolves.toMatchObject({ metaEntries: expect.any(Array) });

        expect(lookupCard.pitchAccent).toEqual(['LHHHH']);
        expect(publicPitch).not.toHaveBeenCalled();
    });

    it('keeps kanji dictionaries out of ordinary word definition cards', async () => {
        const lookupKanji = vi.fn(async () => [{
            character: '読',
            onyomi: ['ドク'],
            kunyomi: ['よ.む'],
            tags: [],
            meanings: ['read'],
            dictionary: 'KANJIDIC',
        }]);
        const loader = createCardRenderDataLoader({
            settings: { localDictionaryShowKanji: true },
            lookupKanji,
        });

        await expect(loader.load({ ...cardFor(1), spelling: '読む', reading: 'よむ' }).all)
            .resolves.toMatchObject({ kanjiEntries: [] });
        expect(lookupKanji).not.toHaveBeenCalled();
    });

    it('shows kanji dictionaries for single-kanji study/detail cards', async () => {
        const lookupKanji = vi.fn(async () => [{
            character: '読',
            onyomi: ['ドク'],
            kunyomi: ['よ.む'],
            tags: [],
            meanings: ['read'],
            dictionary: 'KANJIDIC',
        }]);
        const loader = createCardRenderDataLoader({
            settings: { localDictionaryShowKanji: true },
            lookupKanji,
        });

        await expect(loader.load({ ...cardFor(1), spelling: '読', reading: '読', kanjiKeyword: 'read' }).all)
            .resolves.toMatchObject({ kanjiEntries: [{ dictionary: 'KANJIDIC' }] });
        expect(lookupKanji).toHaveBeenCalledWith('読', expect.any(Number), expect.any(Array));
    });

    it('does not let slow local pitch metadata delay public pitch fallback', async () => {
        vi.useFakeTimers();
        try {
            const lookupTermMeta = vi.fn(() => new Promise<never>(() => undefined));
            const publicPitch = vi.fn(async () => ['HLL']);
            const loader = createCardRenderDataLoader({
                settings: { showPitchAccent: true, apiKey: 'jpdb-key' },
                lookupTermMeta,
                publicPitch,
            });
            const lookupCard = { ...cardFor(1), spelling: '読む', reading: 'よむ', pitchAccent: [] };
            const load = loader.load(lookupCard);

            await vi.advanceTimersByTimeAsync(119);
            expect(publicPitch).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
            await vi.advanceTimersByTimeAsync(2_500);
            await expect(load.all).resolves.toMatchObject({ metaEntries: [] });
            expect(lookupCard.pitchAccent).toEqual(['HLL']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses keyless public JPDB pitch fallback without a JPDB key', async () => {
        // The public pitch source is keyless, so no-key / Jiten-only users still
        // get a pitch graph (the source has its own backoff + cache).
        vi.useFakeTimers();
        try {
            const lookupTermMeta = vi.fn(() => new Promise<never>(() => undefined));
            const publicPitch = vi.fn(async () => ['HLL']);
            const loader = createCardRenderDataLoader({
                settings: { showPitchAccent: true, apiKey: '' },
                lookupTermMeta,
                publicPitch,
            });
            const lookupCard = { ...cardFor(1), spelling: '読む', reading: 'よむ', pitchAccent: [] };
            const load = loader.load(lookupCard);

            await vi.advanceTimersByTimeAsync(120);
            expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
            await vi.advanceTimersByTimeAsync(2_500);
            await expect(load.all).resolves.toMatchObject({ metaEntries: [] });
            expect(lookupCard.pitchAccent).toEqual(['HLL']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('bounds Immersion Kit search cache', async () => {
        const search = vi.fn(async (query: string) => [immersionExample(query)]);
        const preload = vi.fn();
        const controller = createImmersionController({ search, preload } as unknown as ImmersionKitClient);

        for (let index = 0; index < 121; index++) {
            await controller.searchExamples(cardFor(index));
        }
        await controller.searchExamples(cardFor(0));

        expect(search).toHaveBeenCalledTimes(122);
        expect(search.mock.calls.at(-1)?.[0]).toBe('単語0');
    });

    it('caps popup Immersion Kit searches to a lightweight request size', async () => {
        const search = vi.fn(async (query: string) => [immersionExample(query)]);
        const controller = createImmersionController({ search, preload: vi.fn() } as unknown as ImmersionKitClient);

        await controller.searchExamples(cardFor(1));

        expect(search).toHaveBeenCalledWith(
            '単語1',
            expect.objectContaining({ immersionKitEnabled: true }),
            expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
        );
    });

    it('runs Immersion Kit fallback searches concurrently after an exact miss', async () => {
        const slowFallback = deferred<ImmersionKitExample[]>();
        const search = vi.fn((query: string) => {
            if (query === '正確') return Promise.resolve([]);
            if (query === '遅い候補') return slowFallback.promise;
            if (query === '速い候補') return Promise.resolve([immersionExample(query)]);
            return Promise.resolve([]);
        });
        const controller = createImmersionController({ search, preload: vi.fn() } as unknown as ImmersionKitClient);

        const resultPromise = controller.searchExamples({ ...cardFor(1), spelling: '正確' }, {
            relatedQueries: ['遅い候補', '速い候補'],
        });
        await expect(resultPromise).resolves.toMatchObject({ query: '速い候補' });
        expect(search.mock.calls.map(([query]) => query)).toEqual(['正確', '遅い候補', '速い候補']);
        slowFallback.resolve([]);
    });

    it('waits to search Immersion Kit until the source is opened', async () => {
        const search = vi.fn(async (query: string) => [immersionExample(query)]);
        const controller = createImmersionController({ search, preload: vi.fn() } as unknown as ImmersionKitClient);
        const popover = document.createElement('div');
        popover.innerHTML = '<details data-immersion-kit><summary>Immersion Kit</summary><div>Loading examples...</div></details>';
        document.body.append(popover);
        const details = popover.querySelector<HTMLDetailsElement>('[data-immersion-kit]');

        try {
            controller.installLazyLoad(popover, cardFor(1));
            expect(search).not.toHaveBeenCalled();

            if (details) {
                details.open = true;
                details.dispatchEvent(new Event('toggle', { bubbles: true }));
            }

            await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
            expect(search.mock.calls[0]?.[0]).toBe('単語1');
        } finally {
            popover.remove();
        }
    });

    it('stops Immersion Kit fallback searches after rate limiting', async () => {
        const search = vi.fn(async (_query: string) => {
            throw new Error('Immersion Kit request failed (429).');
        });
        const controller = createImmersionController({ search, preload: vi.fn() } as unknown as ImmersionKitClient);
        const popover = document.createElement('div');
        popover.innerHTML = '<details open data-immersion-kit><summary>Immersion Kit</summary><div>Loading examples...</div></details>';
        document.body.append(popover);
        const rateLimitedCard = { ...cardFor(1), spelling: '日本語', reading: 'にほんご' };

        try {
            await controller.loadExamples(popover, rateLimitedCard);

            expect(search).toHaveBeenCalledTimes(1);
            expect(search.mock.calls[0]?.[0]).toBe('日本語');
            expect(popover.querySelector<HTMLElement>('[data-immersion-kit]')?.dataset.immersionEmpty).toBe('true');
        } finally {
            popover.remove();
        }
    });

    it('abandons and aborts the active Immersion Kit load when a popover is dismissed', async () => {
        const searchStarted = deferred<void>();
        const search = vi.fn((_query: string, _settings: ReaderSettings, _options?: { signal?: AbortSignal }) => new Promise<ImmersionKitExample[]>(() => {
            searchStarted.resolve();
        }));
        const controller = createImmersionController({ search, preload: vi.fn() } as unknown as ImmersionKitClient);
        const popover = document.createElement('div');
        popover.innerHTML = '<div data-immersion-kit></div>';
        document.body.append(popover);

        try {
            const load = controller.loadExamples(popover, cardFor(1));
            await searchStarted.promise;
            const signal = search.mock.calls[0]?.[2]?.signal;

            controller.abortPendingRequests(popover);

            expect(signal).toBeDefined();
            expect(signal?.aborted).toBe(true);
            await expect(load).resolves.toBeUndefined();
        } finally {
            popover.remove();
        }
    });

    it('starts a fresh Immersion Kit search after an abandoned popover load', async () => {
        const searchResult = deferred<ImmersionKitExample[]>();
        const search = vi.fn((_query: string) => searchResult.promise);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn(() => []),
        } as unknown as ImmersionKitClient);
        const firstPopover = document.createElement('div');
        const secondPopover = document.createElement('div');
        firstPopover.innerHTML = '<div data-immersion-kit></div>';
        secondPopover.innerHTML = '<div data-immersion-kit></div>';
        document.body.append(firstPopover, secondPopover);

        try {
            const firstLoad = controller.loadExamples(firstPopover, cardFor(1));
            await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));

            controller.abortPendingRequests(firstPopover);
            await expect(firstLoad).resolves.toBeUndefined();

            const secondLoad = controller.loadExamples(secondPopover, cardFor(1));
            expect(search).toHaveBeenCalledTimes(2);

            searchResult.resolve([immersionExample('単語1')]);
            await secondLoad;

            expect(secondPopover.querySelector('.jpdb-reader-example-card')).not.toBeNull();
        } finally {
            firstPopover.remove();
            secondPopover.remove();
        }
    });

    it('waits for the blob cache before assigning popup Immersion images', async () => {
        const blobUrl = deferred<string>();
        const mediaUrl = 'https://media.test/frame.jpg';
        const search = vi.fn(async () => [{ ...immersionExample('単語1'), imageUrl: mediaUrl }]);
        const fetchBlobUrl = vi.fn(() => blobUrl.promise);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn(() => [mediaUrl]),
            fetchBlobUrl,
        } as unknown as ImmersionKitClient);
        const popover = document.createElement('div');
        popover.innerHTML = '<div data-immersion-kit></div>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            await vi.waitFor(() => expect(fetchBlobUrl).toHaveBeenCalledWith(mediaUrl, DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage));
            const image = popover.querySelector<HTMLImageElement>('[data-immersion-image]');

            expect(image?.getAttribute('src')).toBeNull();

            blobUrl.resolve('blob:http://localhost/frame');
            await vi.waitFor(() => expect(image?.getAttribute('src')).toBe('blob:http://localhost/frame'));
        } finally {
            popover.remove();
        }
    });

    it('warms exactly the next Immersion image without preloading carousel audio', async () => {
        const examples = [
            { ...immersionExample('単語1'), id: 'example-1', imageUrl: 'https://media.test/first.jpg', soundUrl: 'https://media.test/first.mp3' },
            { ...immersionExample('単語1'), id: 'example-2', imageUrl: 'https://media.test/second.jpg', soundUrl: 'https://media.test/second.mp3' },
            { ...immersionExample('単語1'), id: 'example-3', imageUrl: 'https://media.test/third.jpg', soundUrl: 'https://media.test/third.mp3' },
        ];
        const fetchBlobUrl = vi.fn(async (urls: string | string[]) => `blob:http://localhost/${Array.isArray(urls) ? urls[0] : urls}`);
        const controller = createImmersionController({
            search: vi.fn(async () => examples),
            preload: vi.fn(),
            mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'image'
                ? [example.imageUrl, `https://media-fallback.test/${example.id}.jpg`]
                : [example.soundUrl]),
            fetchBlobUrl,
        } as unknown as ImmersionKitClient, {
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: true,
                immersionKitAutoPlayAudio: false,
            }),
        });
        const popover = document.createElement('div');
        popover.dataset.yomuJpdbAddon = 'word';
        popover.dataset.yomuPageContext = 'review';
        popover.innerHTML = '<details data-immersion-kit open></details>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            const currentImage = popover.querySelector<HTMLImageElement>('[data-immersion-image]');
            expect(currentImage).not.toBeNull();
            currentImage?.dispatchEvent(new Event('load'));
            await vi.waitFor(() => {
                const requested = fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]);
                expect(requested).toContain('https://media.test/first.jpg');
                expect(requested).toContain('https://media.test/second.jpg');
            });
            const requested = fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]);
            expect(requested).not.toContain('https://media.test/third.jpg');
            expect(requested).not.toContain('https://media-fallback.test/example-2.jpg');
            expect(requested.some(url => url.endsWith('.mp3'))).toBe(false);
        } finally {
            popover.remove();
        }
    });

    it('does not warm adjacent Immersion media when the review card detaches before image load', async () => {
        const examples = [
            { ...immersionExample('単語1'), id: 'example-1', imageUrl: 'https://media.test/first.jpg' },
            { ...immersionExample('単語1'), id: 'example-2', imageUrl: 'https://media.test/second.jpg' },
        ];
        const fetchBlobUrl = vi.fn(async (urls: string | string[]) => `blob:http://localhost/${Array.isArray(urls) ? urls[0] : urls}`);
        const controller = createImmersionController({
            search: vi.fn(async () => examples),
            preload: vi.fn(),
            mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'image' ? [example.imageUrl] : []),
            fetchBlobUrl,
        } as unknown as ImmersionKitClient, {
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: true,
            }),
        });
        const popover = document.createElement('div');
        popover.dataset.yomuJpdbAddon = 'word';
        popover.dataset.yomuPageContext = 'review';
        popover.innerHTML = '<details data-immersion-kit open></details>';
        document.body.append(popover);

        await controller.loadExamples(popover, cardFor(1));
        const currentImage = popover.querySelector<HTMLImageElement>('[data-immersion-image]');
        expect(currentImage).not.toBeNull();
        await vi.waitFor(() => expect(fetchBlobUrl).toHaveBeenCalledWith(
            'https://media.test/first.jpg',
            DEFAULT_SETTINGS.audioTimeoutMs,
            DEFAULT_SETTINGS.corsProxyUrl,
            DEFAULT_SETTINGS.interfaceLanguage,
        ));

        popover.remove();
        currentImage?.dispatchEvent(new Event('load'));
        await Promise.resolve();

        const requested = fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]);
        expect(requested).not.toContain('https://media.test/second.jpg');
    });

    it('does not speculatively warm adjacent Immersion media in an ordinary lookup popover', async () => {
        const examples = [
            { ...immersionExample('単語1'), id: 'example-1', imageUrl: 'https://media.test/first.jpg' },
            { ...immersionExample('単語1'), id: 'example-2', imageUrl: 'https://media.test/second.jpg' },
        ];
        const fetchBlobUrl = vi.fn(async (urls: string | string[]) => `blob:http://localhost/${Array.isArray(urls) ? urls[0] : urls}`);
        const controller = createImmersionController({
            search: vi.fn(async () => examples),
            preload: vi.fn(),
            mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'image' ? [example.imageUrl] : []),
            fetchBlobUrl,
        } as unknown as ImmersionKitClient, {
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: true,
                immersionKitShowImages: true,
            }),
        });
        const popover = document.createElement('div');
        popover.innerHTML = '<details data-immersion-kit open></details>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            const currentImage = popover.querySelector<HTMLImageElement>('[data-immersion-image]');
            expect(currentImage).not.toBeNull();
            currentImage?.dispatchEvent(new Event('load'));
            await Promise.resolve();

            const requested = fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]);
            expect(requested).toEqual(['https://media.test/first.jpg']);
        } finally {
            popover.remove();
        }
    });

    it('stores a fetchable Immersion Kit media candidate for nested mining', async () => {
        localStorage.removeItem('yomu-mining-context:単語1');
        localStorage.removeItem('yomu-mining-context:映画');
        const objectStoreUrl = 'https://us-southeast-1.linodeobjects.com/immersionkit/media/drama/example/media/frame.jpg';
        const apiUrl = 'https://apiv2express.immersionkit.com/download_media?path=media%2Fdrama%2Fexample%2Fmedia%2Fframe.jpg';
        const search = vi.fn(async () => [{ ...immersionExample('単語1'), imageFile: 'frame.jpg' }]);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn(() => [objectStoreUrl, apiUrl]),
            fetchBlobUrl: vi.fn(async () => 'blob:http://localhost/frame'),
        } as unknown as ImmersionKitClient);
        const popover = document.createElement('div');
        popover.innerHTML = '<div data-immersion-kit></div>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            const example = popover.querySelector<HTMLElement>('.jpdb-reader-example-card');
            expect(example?.dataset.immersionImageUrl).toBe(apiUrl);
            expect(loadMiningContext('単語1')?.imageUrl).toBe(apiUrl);

            (controller as unknown as { rememberTermMiningContext(term: string, sentence?: string, anchor?: HTMLElement): void })
                .rememberTermMiningContext('映画', '単語1を見た。', example ?? undefined);

            expect(loadMiningContext('映画')).toMatchObject({
                sentence: '単語1を見た。',
                imageUrl: apiUrl,
                sourceKind: 'immersion-kit',
            });
        } finally {
            popover.remove();
        }
    });

    it('caches parsed Immersion example sentences across carousel renders', async () => {
        const parsedToken: JPDBToken = {
            card: cardFor(1),
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: 'heiban',
            sentence: '単語1を見た。',
        };
        const parseJapanese = vi.fn(async (): Promise<JPDBToken[][]> => [[parsedToken]]);
        const parsePopoverJapanese = vi.fn();
        const search = vi.fn(async () => [immersionExample('単語1')]);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn(() => []),
        } as unknown as ImmersionKitClient, { parseJapanese, parsePopoverJapanese });
        const popover = document.createElement('div');
        popover.innerHTML = '<div data-immersion-kit></div>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            await vi.waitFor(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
            await vi.waitFor(() => expect(popover.querySelector('.jpdb-reader-word')?.textContent).toBe('単語1'));

            popover.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();

            expect(parseJapanese).toHaveBeenCalledTimes(1);
            expect(parsePopoverJapanese).not.toHaveBeenCalled();
            expect(popover.querySelector('.jpdb-reader-word')?.textContent).toBe('単語1');
        } finally {
            popover.remove();
        }
    });

    it('keeps popover body scroll stable across Immersion carousel renders', async () => {
        const search = vi.fn(async () => [
            { ...immersionExample('単語1'), id: 'example-1', translation: 'I saw word one.', soundFile: 'first.mp3' },
            { ...immersionExample('単語1'), id: 'example-2', sentence: 'また単語1を聞いた。', translation: 'I heard word one again.', sourceTitle: 'Second Source', soundFile: 'second.mp3' },
        ]);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                kind === 'image' ? [] : [`https://media.test/${example.soundFile}`]
            )),
            fetchBlobUrl: vi.fn(async () => ''),
        } as unknown as ImmersionKitClient, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitAutoPlayAudio: false }),
        });
        const popover = document.createElement('div');
        popover.innerHTML = '<div class="jpdb-reader-popover-body"><details data-immersion-kit open></details></div>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            const body = popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')!;
            const container = popover.querySelector<HTMLElement>('[data-immersion-kit]')!;
            const nativeInnerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
                ?? Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerHTML');
            Object.defineProperty(container, 'innerHTML', {
                configurable: true,
                get(this: HTMLElement) {
                    return nativeInnerHtml?.get?.call(this) ?? '';
                },
                set(this: HTMLElement, value: string) {
                    nativeInnerHtml?.set?.call(this, value);
                    body.scrollTop = 0;
                },
            });
            body.scrollTop = 260;

            popover.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
            await new Promise(resolve => requestAnimationFrame(resolve));

            expect(body.scrollTop).toBe(260);
            expect(popover.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
            expect(popover.querySelector('.jpdb-reader-example-title')?.textContent).toBe('Second Source');
            expect(popover.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionSentence).toBe('また単語1を聞いた。');
            expect(popover.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionAudioUrls).toBe(JSON.stringify(['https://media.test/second.mp3']));
            expect(popover.querySelector('.jpdb-reader-example-translation')?.textContent).toBe('I heard word one again.');
        } finally {
            popover.remove();
        }
    });

    it('reuses popup Immersion controls for dictionary-page next, previous, and audio clicks', async () => {
        localStorage.removeItem('yomu-mining-context:単語1');
        const examples = [
            { ...immersionExample('単語1'), id: 'example-1', sentence: '単語1を見た。', sourceTitle: 'First Source', soundFile: 'first.mp3' },
            { ...immersionExample('単語1'), id: 'example-2', sentence: 'また単語1を聞いた。', sourceTitle: 'Second Source', soundFile: 'second.mp3' },
        ];
        const search = vi.fn(async () => examples);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                kind === 'image' ? [] : [`https://media.test/${example.soundFile}`]
            )),
        } as unknown as ImmersionKitClient, {
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: true, immersionKitAutoPlayAudio: false }),
        });
        const popover = document.createElement('div');
        popover.className = 'yomu-jpdb-page-addon';
        popover.innerHTML = '<details class="jpdb-reader-immersion" data-immersion-kit open></details>';
        document.body.append(popover);

        try {
            await controller.loadExamples(popover, cardFor(1));
            const firstCard = () => popover.querySelector<HTMLElement>('.jpdb-reader-example-card');

            expect(firstCard()?.dataset.immersionSentence).toBe('単語1を見た。');
            expect(firstCard()?.dataset.immersionAudioUrls).toBe(JSON.stringify(['https://media.test/first.mp3']));
            const audioButton = popover.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]');
            expect(audioButton).not.toBeNull();

            popover.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
            expect(firstCard()?.dataset.immersionSentence).toBe('また単語1を聞いた。');
            expect(popover.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');

            popover.querySelector<HTMLButtonElement>('[data-immersion-action="previous"]')?.click();
            expect(firstCard()?.dataset.immersionSentence).toBe('単語1を見た。');
            expect(popover.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/2');
        } finally {
            popover.remove();
        }
    });

    it('scopes Immersion example Anki enrichment to the rendered example container', () => {
        const token: JPDBToken = {
            card: cardFor(1),
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '単語1を見た。',
        };
        const enrichAnkiWords = vi.fn();
        const controller = createImmersionController({
            search: vi.fn(),
            preload: vi.fn(),
            mediaUrls: vi.fn(() => []),
        } as unknown as ImmersionKitClient, { enrichAnkiWords });
        const container = document.createElement('div');
        container.innerHTML = '<div data-immersion-sentence-render></div>';
        document.body.append(container);
        const testable = controller as unknown as {
            applyParsedExampleSentence(container: HTMLElement, card: JPDBCard, example: ImmersionKitExample, tokens: JPDBToken[]): void;
        };

        try {
            testable.applyParsedExampleSentence(container, cardFor(1), immersionExample('単語1'), [token]);

            expect(enrichAnkiWords).toHaveBeenCalledWith(expect.any(Array), [container]);
        } finally {
            container.remove();
        }
    });

    it('bounds study source sentence caches', async () => {
        const controller = new StudySourceController({
            getSettings: () => DEFAULT_SETTINGS,
            dictionarySourceAttributes: () => '',
            parseJapanese: vi.fn(async () => [[]]),
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords: vi.fn(),
            isCurrentPopoverRoot: () => true,
        });
        const testable = controller as unknown as {
            grammarHintCache: Map<string, Promise<unknown[]>>;
            translationContentCache: Map<string, Promise<unknown>>;
            cachedGrammarHints(sentence: string): Promise<unknown[]>;
            cachedTranslationContent(sentence: string): Promise<unknown>;
            loadTranslationContent(sentence: string): Promise<unknown>;
        };
        testable.loadTranslationContent = vi.fn(async sentence => ({ tokens: [], translated: sentence }));

        for (let index = 0; index < 161; index++) {
            await testable.cachedGrammarHints(`これは${index}です。`);
        }
        for (let index = 0; index < 81; index++) {
            await testable.cachedTranslationContent(`翻訳${index}`);
        }
        await testable.cachedTranslationContent('翻訳0');

        expect(testable.grammarHintCache.size).toBe(160);
        expect(testable.translationContentCache.size).toBe(80);
        expect(testable.loadTranslationContent).toHaveBeenCalledTimes(82);
    });

    it('scopes study translation Anki enrichment to the study container', async () => {
        const token: JPDBToken = {
            card: cardFor(2),
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '単語2です。',
        };
        const enrichAnkiWords = vi.fn();
        const controller = new StudySourceController({
            getSettings: () => DEFAULT_SETTINGS,
            dictionarySourceAttributes: () => '',
            parseJapanese: vi.fn(async () => [[]]),
            parsePopoverJapanese: vi.fn(),
            enrichPitchWords: vi.fn(),
            enrichAnkiWords,
            isCurrentPopoverRoot: () => true,
        });
        const popover = document.createElement('div');
        const container = document.createElement('div');
        container.innerHTML = `
            <div data-study-original-render></div>
            <div data-study-translation-result></div>
        `;
        popover.append(container);
        document.body.append(popover);
        const testable = controller as unknown as {
            applyTranslation(popover: HTMLElement, sentence: string, container: HTMLElement, translation: { tokens: Promise<JPDBToken[]>; translated: string }): void;
        };

        try {
            // tokens now arrive as a promise (parsing never gates the MEANING),
            // so the container-scoped Anki enrichment runs once tokens resolve.
            testable.applyTranslation(popover, '単語2です。', container, { tokens: Promise.resolve([token]), translated: 'word two' });
            await Promise.resolve();
            await Promise.resolve();

            expect(enrichAnkiWords).toHaveBeenCalledWith([token], [container]);
        } finally {
            popover.remove();
        }
    });
});

describe('reader HTTP latency', () => {
    it('does not retry userscript timeouts through fetch', async () => {
        const userscriptRequest = vi.fn((options: { ontimeout?: () => void }) => {
            options.ontimeout?.();
            return { abort: vi.fn() };
        });
        const fetch = vi.fn(async () => new Response('late fallback'));
        vi.stubGlobal('GM_xmlhttpRequest', userscriptRequest);
        vi.stubGlobal('fetch', fetch);

        try {
            await expect(requestReaderText('https://example.test/slow', {
                timeoutMs: 1,
                timeoutLabel: 'Slow request timed out.',
                allowDirectCrossOrigin: true,
            })).rejects.toThrow('Slow request timed out.');
            expect(userscriptRequest).toHaveBeenCalledTimes(1);
            expect(fetch).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

function createImmersionController(
    client: ImmersionKitClient,
    overrides: Partial<ImmersionPopoverControllerOptions> = {},
): ImmersionPopoverController {
    return new ImmersionPopoverController({
        getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: true }),
        client,
        audio: { play: vi.fn(async () => undefined) } as never,
        parseJapanese: vi.fn(async () => []),
        canParseJapanese: () => false,
        parsePopoverJapanese: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        repositionPopover: vi.fn(),
        setImmersionTranslationBlurred: vi.fn(),
        toast: vi.fn(),
        ...overrides,
    });
}

function cardFor(index: number): JPDBCard {
    return {
        vid: index,
        sid: index,
        rid: index,
        spelling: `単語${index}`,
        reading: `たんご${index}`,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{ glosses: ['word'], partOfSpeech: [] }],
        cardState: [],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
    };
}

function immersionExample(query: string): ImmersionKitExample {
    return {
        id: `example-${query}`,
        sentence: `${query}を見た。`,
        sentenceWithFurigana: '',
        translation: 'I saw it.',
        sourceTitle: 'Example',
        titleSlug: 'example',
        category: 'drama',
        soundFile: '',
        imageFile: '',
        soundUrl: '',
        imageUrl: '',
    };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
