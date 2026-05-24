import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/card-render-data';
import { ImmersionPopoverController } from '../../src/reader/immersion-popover-controller';
import type { ImmersionKitClient, ImmersionKitExample } from '../../src/reader/immersion-kit';
import { requestText as requestReaderText } from '../../src/reader/reader-http';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { StudySourceController } from '../../src/reader/study-sources';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/types';
import type { YomitanDictionaryStore } from '../../src/reader/yomitan';
import type { AnkiConnectClient } from '../../src/reader/anki';
import type { JpdbClient } from '../../src/reader/jpdb';
import type { JpdbPublicPitchClient } from '../../src/reader/jpdb-public-pitch';
import type { JpdbVocabularyClient } from '../../src/reader/jpdb-vocabulary';

describe('performance cache bounds', () => {
    it('bounds per-card render data cache entries', async () => {
        const lookup = vi.fn(async (_term: string) => []);
        const loader = new CardRenderDataLoader({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                localDictionariesEnabled: true,
                localDictionaryShowKanji: false,
                showPitchAccent: false,
                ankiEnabled: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
            }),
            dictionaries: {
                lookup,
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as unknown as YomitanDictionaryStore,
            jpdbPublicPitch: { lookup: vi.fn(async () => []) } as unknown as JpdbPublicPitchClient,
            jpdbVocabulary: { lookup: vi.fn(async () => null) } as unknown as JpdbVocabularyClient,
            anki: {
                findExistingCards: vi.fn(),
                deckNames: vi.fn(),
            } as unknown as AnkiConnectClient,
            jpdb: { listDecks: vi.fn() } as unknown as JpdbClient,
            isJpdbBackedCard: () => false,
        });

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
        const loader = new CardRenderDataLoader({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                localDictionariesEnabled: true,
                localDictionaryShowKanji: false,
                showPitchAccent: true,
                ankiEnabled: false,
                jpdbDefinitionsEnabled: false,
                jpdbMiningEnabled: false,
            }),
            dictionaries: {
                lookup: vi.fn(async () => []),
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
            const loader = new CardRenderDataLoader({
                getSettings: () => ({
                    ...DEFAULT_SETTINGS,
                    localDictionariesEnabled: true,
                    localDictionaryShowKanji: false,
                    showPitchAccent: true,
                    ankiEnabled: false,
                    jpdbDefinitionsEnabled: false,
                    jpdbMiningEnabled: false,
                }),
                dictionaries: {
                    lookup: vi.fn(async () => []),
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

    it('bounds Immersion Kit search cache without eager token preloads', async () => {
        const search = vi.fn(async (query: string) => [immersionExample(query)]);
        const preload = vi.fn();
        const controller = createImmersionController({ search, preload } as unknown as ImmersionKitClient);

        for (let index = 0; index < 121; index++) {
            await controller.searchExamples(cardFor(index));
        }
        await controller.searchExamples(cardFor(0));

        expect(search).toHaveBeenCalledTimes(122);
        expect(search.mock.calls.at(-1)?.[0]).toBe('単語0');

        for (let index = 0; index < 241; index++) {
            controller.preloadForTokens([tokenFor(index)]);
        }
        controller.preloadForTokens([tokenFor(0)]);

        expect(preload).not.toHaveBeenCalled();
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

    it('aborts the active Immersion Kit load request when a popover is dismissed', async () => {
        const searchStarted = deferred<void>();
        const search = vi.fn((_query: string, _settings: ReaderSettings, options?: { signal?: AbortSignal }) => new Promise<ImmersionKitExample[]>((_resolve, reject) => {
            searchStarted.resolve();
            options?.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
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

            expect(signal?.aborted).toBe(true);
            await expect(load).resolves.toBeUndefined();
        } finally {
            popover.remove();
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

function createImmersionController(client: ImmersionKitClient): ImmersionPopoverController {
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

function tokenFor(index: number): JPDBToken {
    const card = cardFor(index);
    return {
        card,
        start: 0,
        end: card.spelling.length,
        length: card.spelling.length,
        rubies: [],
        pitchClass: '',
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

function abortError(): Error {
    if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}
