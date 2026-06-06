import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/card-render-data';
import { ImmersionPopoverController } from '../../src/reader/immersion-popover-controller';
import type { ImmersionKitClient, ImmersionKitExample } from '../../src/reader/immersion-kit';
import { loadMiningContext } from '../../src/reader/mining-context';
import { requestText as requestReaderText } from '../../src/reader/reader-http';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { StudySourceController } from '../../src/reader/study-sources';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/types';
import type { YomitanDictionaryStore } from '../../src/reader/yomitan';
import type { AnkiConnectClient } from '../../src/reader/anki';
import type { JpdbClient } from '../../src/reader/jpdb';
import type { JpdbPublicPitchClient } from '../../src/reader/jpdb-public-pitch';
import type { JpdbVocabularyClient } from '../../src/reader/jpdb-vocabulary';

type CardRenderDataLoaderDependencies = ConstructorParameters<typeof CardRenderDataLoader>[0];
type CardRenderDataLoaderFixture = {
    settings?: Partial<ReaderSettings>;
    lookup?: YomitanDictionaryStore['lookup'];
    lookupTermMeta?: YomitanDictionaryStore['lookupTermMeta'];
    publicPitch?: JpdbPublicPitchClient['lookup'];
};

function createCardRenderDataLoader({
    settings,
    lookup = vi.fn(async () => []),
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
            lookupKanji: vi.fn(async () => []),
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

    it('does not let slow local pitch metadata delay public pitch fallback', async () => {
        vi.useFakeTimers();
        try {
            const lookupTermMeta = vi.fn(() => new Promise<never>(() => undefined));
            const publicPitch = vi.fn(async () => ['HLL']);
            const loader = createCardRenderDataLoader({
                settings: { showPitchAccent: true },
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
            expect.objectContaining({ requestLimit: 48, resultLimit: 6 }),
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
            { ...immersionExample('単語1'), id: 'example-1' },
            { ...immersionExample('単語1'), id: 'example-2', sentence: 'また単語1を聞いた。' },
        ]);
        const controller = createImmersionController({
            search,
            preload: vi.fn(),
            mediaUrls: vi.fn(() => []),
        } as unknown as ImmersionKitClient);
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

    it('scopes study translation Anki enrichment to the study container', () => {
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
            applyTranslation(popover: HTMLElement, sentence: string, container: HTMLElement, translation: { tokens: JPDBToken[]; translated: string }): void;
        };

        try {
            testable.applyTranslation(popover, '単語2です。', container, { tokens: [token], translated: 'word two' });

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
    overrides: Partial<{
        getSettings: () => ReaderSettings;
        parseJapanese: (paragraphs: string[], options?: { jpdbTimeoutMs?: number; allowJpdbTimeoutFallback?: boolean }) => Promise<JPDBToken[][]>;
        canParseJapanese: () => boolean;
        parsePopoverJapanese: (popover: HTMLElement) => void | Promise<void>;
        enrichPitchWords: (tokens: JPDBToken[]) => void | Promise<void>;
        enrichAnkiWords: (tokens: JPDBToken[], roots?: ParentNode[]) => void | Promise<void>;
        repositionPopover: () => void;
        setImmersionTranslationBlurred: (blurred: boolean) => void;
        toast: (message: string) => void;
    }> = {},
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
