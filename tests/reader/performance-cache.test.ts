import { describe, expect, it, vi } from 'vitest';
import { CardRenderDataLoader } from '../../src/reader/card-render-data';
import { ImmersionPopoverController } from '../../src/reader/immersion-popover-controller';
import type { ImmersionKitClient, ImmersionKitExample } from '../../src/reader/immersion-kit';
import { requestText as requestReaderText } from '../../src/reader/reader-http';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { StudySourceController } from '../../src/reader/study-sources';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';
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

    it('bounds Immersion Kit search and preload tracking caches', async () => {
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

        expect(preload).toHaveBeenCalledTimes(242);
        expect(preload.mock.calls.at(-1)?.[0]).toBe('単語0');
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
