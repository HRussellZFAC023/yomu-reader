import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from '../../../src/reader/app/pages';
import { ensureManagedWebStorageCurrent } from '../../../src/reader/app/storage';
import { JITEN_BACKGROUND_DETAIL_TIMEOUT_MS } from '../../../src/reader/dictionaries/jiten-public-vocabulary';
import { AnkiConnectClient, AnkiDuplicateNoteError, buildYomuAnkiFields, YOMU_MODEL_FIELDS, type AnkiExistingNote, type AnkiLookupResult } from '../../../src/reader/anki/index';
import { resolveAnkiWordAudio } from '../../../src/reader/anki/audio';
import { AudioPlayer, decodeJpdbAudioBlob, findAudioUrl, findAudioUrls, formatAudioUrl, getAudioCandidates, isUnavailableJapanesePod101Audio, jpdbAudioRequest, normalizeJpdbAudioIds, ShuffledAudioDeck } from '../../../src/reader/audio/player';
import { positionPopover } from '../../../src/reader/ui/browser';
import { CardActionController } from '../../../src/reader/cards/action-controller';
import { CardPopoverRenderer, updatePopoverReviewTargetSelection, type CardPopoverRendererDependencies } from '../../../src/reader/cards/popover-renderer';
import { CardRenderDataLoader, type CardRenderData } from '../../../src/reader/cards/render-data';
import { createAudioPreviewCard } from '../../../src/reader/cards/utils';
import { primaryCardState } from '../../../src/reader/cards/state';
import { IMMERSION_KIT_SOURCE_ID, NEW_TAB_PAGE_URL, SETTINGS_CHANGE_EVENT, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from '../../../src/reader/app/constants';
import { deinflectJapaneseTerm, termRulesMatch } from '../../../src/reader/lookup/deinflect';
import { definitionSourceStateKey, renderJpdbDefinitionSource, renderLocalDefinitionSourcesSection } from '../../../src/reader/sources/definition-render';
import { renderDefinitionSourcesStack } from '../../../src/reader/sources/definition-stack';
import { DictionarySourceStateController } from '../../../src/reader/sources/state';
import { NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, applyTokensToScanTarget, applyTokensToTextNode, collectFragmentTextTargetsIn, collectTextTargetsIn, mutationLooksLikeReaderRenderRejection, nearestReadableSentenceForElement, readerRenderRejectionRescanDelay, readerWordAtPointInScope, readerWordSurfaceText, renderTokensToHtml, setInnerHtml, unwrapReaderWords, type ScanTextTarget } from '../../../src/reader/dom/index';
import { FloatingButtonController, type FloatingButtonActions } from '../../../src/reader/ui/floating-button';
import { ImmersionKitClient, type ImmersionKitExample } from '../../../src/reader/immersion/kit';
import type { JitenApiClient, JitenKanjiInfo } from '../../../src/reader/dictionaries/jiten';
import type { MiningContext } from '../../../src/reader/study/mining-context';
import { ImmersionPopoverController } from '../../../src/reader/immersion/popover-controller';
import { JpdbClient, splitJapaneseSentences } from '../../../src/reader/jpdb/jpdb';
import { jpdbParseResultToTokens, jpdbVocabularyToCards } from '../../../src/reader/jpdb/jpdb-parser';
import { currentLocalDictionaryTargets, isKanjiReviewBack, isKanjiReviewFront, localDictionaryLookupVariants, parseJpdbReviewCardValue, type LocalDictionaryTarget } from '../../../src/reader/jpdb/jpdb-page-targets';
import { JpdbKanjiClient, parseJpdbKanjiHtml, visibleJpdbKanjiActions } from '../../../src/reader/jpdb/jpdb-kanji';
import { JpdbVocabularyClient, parseJpdbAudioData, parseJpdbSearchHtml, parseJpdbVocabularyHtml } from '../../../src/reader/jpdb/jpdb-vocabulary';
import { JpdbPublicPitchClient, parseJpdbPublicPitchHtml } from '../../../src/reader/jpdb/jpdb-public-pitch';
import { buildKanjiFacts, buildKanjiOriginGraph, parseKanjiMapInfo } from '../../../src/reader/kanji/origin';
import { parseKanjiVGSvg } from '../../../src/reader/kanji/vg';
import { formatMetaFrequency, groupTermEntriesByHeadword, mergeSimilarKanjiWords, summarizeLearnerGlossary } from '../../../src/reader/dictionaries/groups';
import { Logger } from '../../../src/reader/app/logger';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationMayAffectJpdbPageEnhancements, mutationMayContainJapaneseText } from '../../../src/reader/app/mutation-scan';
import { currentPageTermTarget, isCurrentKanjiSurface } from '../../../src/reader/app/page-enhancement-targets';
import { buildNewTabPalette, isYomuNewTabUrl, resolveNewTabBrandAssets } from '../../../src/reader/newtab/index';
import { ObjectUrlCache } from '../../../src/reader/core/object-url-cache';
import { createPageMediaUrl } from '../../../src/reader/app/page-media-url';
import { ImageOcrController, normalizeOcrResult, parseGoogleLensUploadHtml, readFallbackOcrResult } from '../../../src/reader/ocr/controller';
import { normalizeOcrRenderedText } from '../../../src/reader/ocr/rendered-text';
import { createReaderBackdrop, createReaderPopover, installMiningDrawerHandle, installSettingsDrawerHandle, installSheetCloseButton, installSheetHandle, shouldUseSheet } from '../../../src/reader/popup/shell';
import { pointerTextLookupFromTextNode } from '../../../src/reader/lookup/pointer-text-lookup';
import { formatPartOfSpeech } from '../../../src/reader/lookup/pos';
import { fetchWithCorsFallbacks, proxyUrlCandidates } from '../../../src/reader/network/proxy-fetch';
import { renderJpdbKanjiInfo, renderJpdbKanjiMiningControls, renderKanjiOrigins, renderKanjiPractice, renderPitch, renderRtkInfo, tokensOverlappingSelection } from '../../../src/reader/popup/render';
import { RECOMMENDED_JAPANESE_DICTIONARIES, findRecommendedDictionary } from '../../../src/reader/dictionaries/recommended';
import { ReaderApp } from '../../../src/reader/app/main';
import {
    BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
    PITCH_ENRICHMENT_LIMIT,
    PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
    allowsFrequentVisibleAutoScan,
    allowsGenericVisibleAutoScan,
    visibleAutoScanInitialDelay,
    visibleAutoScanMutationDelay,
} from '../../../src/reader/app/main-helpers';
import { NewTabController } from '../../../src/reader/newtab/controller';
import { searchWordDetailHtml, type NewTabSearchDetailViewContext } from '../../../src/reader/newtab/search-view';
import { NewTabRuntime } from '../../../src/reader/newtab/runtime';
import { ReaderAudioActions } from '../../../src/reader/audio/actions';
import { ReaderParser, fallbackDictionaryLookupTermsForText, fallbackLookupTermAtOffset, jpdbFirstParseOptions, pickAuthoritativeTokenAt } from '../../../src/reader/lookup/parser';
import { parseRtkSearchIndex } from '../../../src/reader/kanji/rtk';
import { DEFAULT_AUDIO_SOURCES, SETTINGS_STORAGE_KEY, applyUrlBootstrapSettings, defaultDictionaryLookupLinks, effectiveFuriganaMode, effectiveReaderColorSource, effectiveSubtitleColorSource, loadSettings, matchesShortcut, normalizeAudioSources, normalizeDictionaryLookupLinks, normalizeOcrProvider, normalizeReaderSettings, NO_EXPLICIT_USER_CHOICE, sanitizeAccentColor, saveSettings } from '../../../src/reader/settings/index';
import { testEnSettings } from '../helpers/settings-fixture';

// These tests assert English UI copy; pin the interface language for
// deterministic string assertions regardless of the runtime default.
export const DEFAULT_SETTINGS = testEnSettings();

export function japaneseLearningTargetMatcher() {
    return expect.objectContaining({
        language: 'ja',
        interfaceVersion: 10,
        lookupSweepMode: 'global-ranked',
    });
}

export function currentJapaneseLookupScopeMatcher() {
    return expect.objectContaining({
        target: japaneseLearningTargetMatcher(),
        isCurrent: expect.any(Function),
    });
}
import { installSourceRowDrag, localizeSettingsForm, readDictionaryLookupLinks, readFormSettings, renderAudioSourceEditor, renderDictionaryLookupLinkEditor, renderDictionarySourceRows, renderKanjiSourceRows, renderRecommendedDictionaries, renderSettingsForm, syncStickyBottomSheetAvailability, updateDictionaryLookupLinkEditor } from '../../../src/reader/settings/form';
import { SITE_PARSER_PROFILES, collectScanTargets, collectSiteScanTargets, getMatchingSiteParsers } from '../../../src/reader/app/site-parsers';
import { KANJI_STROKE_SOURCE_ID, definitionSourceRows, kanjiSourceRows, orderedDefinitionSourceIds, orderedKanjiSourceIds } from '../../../src/reader/sources/sections';
import { renderKanjiSourceMounts } from '../../../src/reader/runtime/kanji-source-mounts';
import { StudySourceController } from '../../../src/reader/study/sources';
import { detectGrammarHints, renderGrammarHints, translateJapaneseSentence } from '../../../src/reader/study/tools';
import { READER_CSS, readerCssNeedsFallback } from '../../../src/reader/styles/index';
import { findActiveSubtitleCue, normalizeSubtitleCues, parseSubtitleText } from '../../../src/reader/subtitles/subtitle-cues';
import { computeSubtitleDrawerLayout } from '../../../src/reader/subtitles/subtitle-layout';
import { collectPageSubtitleSources } from '../../../src/reader/subtitles/subtitle-sources';
import { createSubtitleVideoInsetAdapter } from '../../../src/reader/subtitles/subtitle-video-inset';
import { discoverYouTubeCaptionTracks, getYouTubeCaptionTracks, getYouTubeVideoId, loadYouTubeTrackCues } from '../../../src/reader/subtitles/subtitle-youtube';
import { applySubtitleNativeTrackModes } from '../../../src/reader/subtitles/subtitle-native-track-modes';
import { compareSubtitleTrackOptions, isEnglishSubtitleTrack, isTargetLanguageSubtitleTrack, shouldReplaceWaitingNativeTrack } from '../../../src/reader/subtitles/subtitle-track-metadata';
import { loadSubtitleTrackCues, type SubtitleTrackLoadable } from '../../../src/reader/subtitles/subtitle-track-loader';
import { renderSubtitlePrimary } from '../../../src/reader/subtitles/subtitle-rendering';
import { renderControllerPrimarySubtitle } from '../../../src/reader/subtitles/subtitle-primary-render';
import { planTranscriptHydrationIndexes } from '../../../src/reader/subtitles/subtitle-transcript-hydration';
import { getUserscriptHttpRequest, installUserscriptHttpBridge, installUserscriptHttpBridgeWhenReady, uninstallUserscriptHttpBridge } from '../../../src/reader/userscript/index';
import { renderWordPills } from '../../../src/reader/sources/word-pills';
import { YomitanDictionaryStore, glossaryToHtml, glossaryToText, parseYomitanSettingsExport, renderDictionaryScopedStyles, type YomitanTermEntry } from '../../../src/reader/dictionaries/yomitan';
import { glossaryValueToSearchText } from '../../../src/reader/dictionaries/yomitan/glossary-text';
import type { AudioSourceSetting, JPDBCard, JPDBRawToken, JPDBToken, ReaderSettings } from '../../../src/reader/app/types';
import { createPointerEvent, createVisualViewportFixture, dispatchPointerEvent as dispatchBrowserPointerEvent, restoreWindowDescriptor, withViewport as withBrowserViewport } from '../helpers/browser-fixtures';
import { mockElementBoundingClientRect, stubInstantIntersectionObserver, testDomRect } from '../helpers/dom-fixtures';
import { stackedSettingsFixtureDom } from '../helpers/settings-fixture';
import { expectSettingsDialogStillMounted, expectStackedLookupOverSettings } from '../helpers/stacked-lookup-assertions';
import { waitForExpect } from '../test-utils';
import {
    readerTextMirrorForSource,
    readerWordsForSource,
} from '../helpers/text-mirror';
import { yomitanZipBlob } from '../zip-fixture';
import PublicProxyWorker, { isAllowedPublicProxyTarget } from '../../../workers/jpdb-public-proxy/src/index';
import { registerYomuCompanion } from '../../../src/reader/companions/registry';
import {
    registerRenderedWordPrivateState,
    renderedWordPrivateStateForCard,
    renderedWordPrivateValue,
    updateRenderedWordPrivateState,
} from '../../../src/reader/dom/rendered-word-private-state';
import {
    bindPrivateCommandCapability,
    readCardCommandCapability,
    readTokenChoiceCommandCapability,
} from '../../../src/reader/dom/private-command-capabilities';

registerYomuCompanion('ocr', { ImageOcrController, normalizeOcrRenderedText });

export const card: JPDBCard = {
    vid: 1,
    sid: 2,
    rid: 3,
    spelling: '食べる',
    reading: 'たべる',
    frequencyRank: 100,
    partOfSpeech: ['v1'],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: ['LHH'],
    wordWithReading: null,
};

export function createMiningDrawerTestSurface(innerHtml: string): {
    app: ReaderApp;
    popover: HTMLElement;
    actions: HTMLElement;
    handle: HTMLButtonElement;
} {
    const app = new ReaderApp();
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.innerHTML = innerHtml;
    document.body.append(popover);
    return {
        app,
        popover,
        actions: popover.querySelector<HTMLElement>('.jpdb-reader-actions')!,
        handle: popover.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]')!,
    };
}

export function dispatchPenControlTap(target: HTMLElement, pointerId = 91): PointerEvent {
    target.dispatchEvent(createPointerEvent('pointerdown', {
        button: 0,
        clientX: 24,
        clientY: 18,
        pointerId,
        pointerType: 'pen',
    }));
    const up = createPointerEvent('pointerup', {
        button: 0,
        clientX: 25,
        clientY: 18,
        pointerId,
        pointerType: 'pen',
    });
    target.dispatchEvent(up);
    return up;
}

export function hostedDocsCardToken(sentence: string, spelling: string, reading: string): JPDBToken {
    const start = sentence.indexOf(spelling);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = start + spelling.length;
    return {
        card: {
            ...card,
            spelling,
            reading,
            cardState: ['not-in-deck'],
            pitchAccent: [],
            source: 'fallback',
        },
        start,
        end,
        length: end - start,
        rubies: [{ text: reading, start, end, length: end - start }],
        pitchClass: '',
        sentence,
    };
}

export function jitenTestCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        ...card,
        source: 'jiten',
        vid: 42,
        sid: 2,
        jitenWordId: 42,
        jitenReadingIndex: 2,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 500,
        cardState: ['new'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        ...overrides,
    };
}

export function expectScheduledDeckCards(cards: JPDBCard[], spellings: string[]): void {
    expect(cards.map(card => card.spelling)).toEqual(spellings);
    expect(cards.map(card => card.cardState)).toEqual([['locked'], ['due']]);
}

export function createJpdbParseFetchMock(
    parseBodies: string[][],
    renderVocabularyText: (paragraph: string, index: number) => string,
    renderMeaning: (paragraph: string, index: number) => string,
    tokenLength: (paragraph: string) => number,
) {
    return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
        const text = body.text ?? [];
        parseBodies.push(text);
        return {
            status: 200,
            ok: true,
            text: async () => JSON.stringify({
                vocabulary: text.map((paragraph, index) => {
                    const vocabularyText = renderVocabularyText(paragraph, index);
                    return [
                        index + 1,
                        index + 2,
                        index + 3,
                        vocabularyText,
                        vocabularyText,
                        100 + index,
                        [],
                        [[renderMeaning(paragraph, index)]],
                        [[]],
                        ['new'],
                        [],
                    ];
                }),
                tokens: text.map((paragraph, index) => [[index, 0, tokenLength(paragraph), null]]),
            }),
        };
    });
}

export function readingTestCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        ...card,
        spelling: '読む',
        reading: 'よむ',
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
        ...overrides,
    };
}

export const READER_WORD_CSS = readerCssNeedsFallback(READER_CSS) ? readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8') : READER_CSS;
export const IMMERSION_STUDY_CSS = readFileSync('src/reader/styles/immersion-study.css', 'utf8');
export const KANJI_CSS = readFileSync('src/reader/styles/kanji.css', 'utf8');
export const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');
export const STATS_CSS = readFileSync('src/reader/styles/stats.css', 'utf8');
export const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');
export const SETTINGS_CSS = readFileSync('src/reader/styles/settings.css', 'utf8');
export const SUBTITLES_YOUTUBE_CSS = readFileSync('src/reader/styles/subtitles-youtube.css', 'utf8');
export const DOCS_THEME_CSS = readFileSync('docs/.vitepress/theme/custom.css', 'utf8');
export const DOCS_THEME_TS = readFileSync('docs/.vitepress/theme/index.ts', 'utf8');
export const SHEET_HEIGHT_STORAGE_KEY = 'jpdb-reader-sheet-height-ratio';
export const SETTINGS_DRAWER_HEIGHT_STORAGE_KEY = 'jpdb-reader-settings-drawer-height-ratio';

export type FakeSegmenterSegment = { segment: string; index: number; isWordLike: boolean };
export type FakeSegmenterSegments = FakeSegmenterSegment[] | ((value: string) => FakeSegmenterSegment[]);
export type TestAnkiConnectRequest = { action: string; params: Record<string, unknown> };
export type TestAnkiConnectResponse = { status: number; response: { result: unknown; error: null } };
export type TestAnkiConnectResult = unknown | Promise<unknown>;
export type TestAnkiConnectMultiAction = { action: string; params: { query: string } };
export type TestAnkiQueryRoute = { matches: string[]; result: unknown };
export type LargeAnkiStatusIndexFixture = {
    allIds: number[];
    cardInfoBatchSizes: number[];
    noteInfoBatchSizes: number[];
    targetCardId: number;
};
export type TestLocationStub = { href: string; origin: string; hostname: string };
export type TestPointerTextCandidate = { text: string; offset: number; start: number; end: number; anchor: HTMLElement };
export type TestPointerTextTrigger = 'modal' | 'hover';
export type TestPointerTextOptions = { userGesture?: boolean };
export type TestJitenLookupManyMock = ((terms: readonly string[]) => Promise<Map<string, JPDBCard>>) & {
    mock: { calls: Array<[readonly string[]]> };
};
export type TestPointerParserStub = {
    parse?: (texts: string[], options?: unknown) => Promise<JPDBToken[][]>;
    lookupTokenAt?: (
        text: string,
        offset: number,
        range?: { start: number; end: number },
        parseOptions?: Record<string, unknown>,
    ) => Promise<JPDBToken | undefined>;
    fallbackCardFromText?: (text: string) => JPDBCard;
    isJpdbBackedCard?: (card: JPDBCard) => boolean;
};
export type TestPointerTextInternals = {
    settings: ReaderSettings;
    parser: TestPointerParserStub;
    parseJapanese?: (paragraphs: string[], options?: unknown) => Promise<JPDBToken[][]>;
    publicLookupCard?: (term: string, exact?: boolean, options?: unknown) => Promise<JPDBCard | undefined>;
    jitenPublicVocabulary?: { lookupMany: (terms: readonly string[]) => Promise<Map<string, JPDBCard>> };
    dictionaries?: { lookup: (text: string, reading: string, limit: number, preferences?: unknown) => Promise<YomitanTermEntry[]> };
    showLocalPointerTextCandidate?: (
        candidate: TestPointerTextCandidate,
        sentence: string,
        trigger: TestPointerTextTrigger,
        options: TestPointerTextOptions,
        scope: unknown,
    ) => Promise<boolean>;
    showPointerTextCard: (
        lookupCard: JPDBCard,
        sentence: string,
        candidate: TestPointerTextCandidate,
        range: { start: number; end: number },
        trigger: TestPointerTextTrigger,
        options: TestPointerTextOptions,
    ) => Promise<void>;
    showFirstPointerTextCandidate(
        candidate: TestPointerTextCandidate,
        sentence: string,
        trigger: TestPointerTextTrigger,
        options: TestPointerTextOptions,
    ): Promise<void>;
};
export type TestRenderedWordOptions = { trigger?: 'click'; userGesture?: boolean; fastInitialRender?: boolean };
export type TestRenderedWordInternals = {
    settings: ReaderSettings;
    parser: { cacheCards(cards: JPDBCard[]): void };
    parseJapanese?: (texts: string[], options?: unknown) => Promise<JPDBToken[][]>;
    publicLookupCard: (term: string, exact?: boolean, options?: unknown) => Promise<JPDBCard | undefined>;
    cardLookup: {
        publicLookupCard: (term: string, exact?: boolean, options?: unknown) => Promise<JPDBCard | undefined>;
    };
    jitenPublicVocabulary?: { lookupMany: (terms: readonly string[]) => Promise<Map<string, JPDBCard>> };
    dictionaries?: { lookup: (text: string, reading: string, limit: number, preferences?: unknown) => Promise<YomitanTermEntry[]> };
    showRenderedWordCard: (
        lookupCard: JPDBCard,
        context?: unknown,
        options?: unknown,
        keepOpen?: boolean,
        scope?: unknown,
    ) => Promise<void>;
    showWord(word: HTMLElement, options?: TestRenderedWordOptions): Promise<void>;
};
export type TestJitenRenderedWordInternals = {
    settings: ReaderSettings;
    parseJapanese: (texts: string[], options?: unknown) => Promise<JPDBToken[][]>;
    publicLookupCard: (term: string, exact?: boolean, options?: unknown) => Promise<JPDBCard | undefined>;
    lookupText: (term: string) => Promise<JPDBCard | undefined>;
    showCard: (
        lookupCard: JPDBCard,
        sentence: string,
        anchor: HTMLElement,
        options: unknown,
    ) => Promise<void>;
    showWord(word: HTMLElement, options: TestRenderedWordOptions): Promise<void>;
};
export type TestHydratedPopupAnkiInternals = {
    activePopover: HTMLElement;
    settings: typeof DEFAULT_SETTINGS;
    renderCompletedCardPopover: ReturnType<typeof vi.fn>;
    renderHydratedCardAnkiLookup(
        context: TestCardPopoverHydrationContext,
        renderData: { hydrateAnkiLookup?: () => Promise<AnkiLookupResult> },
    ): void;
};
export type TestCardPopoverHydrationContext = {
    popover: HTMLElement;
    card: JPDBCard;
    sentence: string | undefined;
    trigger: 'modal' | 'hover';
    state: { data: CardRenderData };
    requestId: number;
    isCurrentHoverCard: () => boolean;
};
export type KanjiGraphPoint = { x: number; y: number };
export type KanjiGraphGeometry = KanjiGraphPoint & { rx: number; ry: number };
export type JpdbVocabularyPair = [number, number];
export type JpdbDeckRequestBody = { id?: unknown; list?: JpdbVocabularyPair[] };
export type TestCardRenderDataLoaderOptions = {
    settings: ReaderSettings;
    dictionaries?: Partial<YomitanDictionaryStore>;
    jpdbPublicPitch?: Partial<JpdbPublicPitchClient>;
    jpdbVocabulary?: Partial<JpdbVocabularyClient>;
    anki?: Partial<AnkiConnectClient>;
    jpdb?: Partial<JpdbClient>;
    jiten?: Partial<JitenApiClient>;
    isJpdbBackedCard?: (lookupCard: JPDBCard) => boolean;
};
export type TestImmersionPopoverInternals = {
    settings: typeof DEFAULT_SETTINGS;
    parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
    immersionPopover: {
        loadExamples(popover: HTMLElement, card: JPDBCard): Promise<void>;
        searchExamples(card: JPDBCard): Promise<unknown>;
        playExampleAudio(example: unknown, quiet?: boolean, isCurrent?: () => boolean): Promise<void>;
        mediaUrls(example: unknown, kind: 'image' | 'sound'): string[];
    };
};

const JPDB_DECK_LIST_VOCABULARY_API = 'https://jpdb.io/api/v1/deck/list-vocabulary';
const JPDB_LOOKUP_VOCABULARY_API = 'https://jpdb.io/api/v1/lookup-vocabulary';
const JPDB_LIST_USER_DECKS_API = 'https://jpdb.io/api/v1/list-user-decks';
export const TEST_IOS_SAFARI_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
export const TEST_IPAD_SAFARI_USER_AGENT = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
export const TEST_IPADOS_DESKTOP_SAFARI_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
export const TEST_ANDROID_CHROME_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
export const TEST_PROXY_URL = 'https://yomu-proxy.example/fetch';

export function createStackedReaderSettingsFixture(app: ReaderApp) {
    const { settings, settingsForm, settingsBackdrop, anchor } = stackedSettingsFixtureDom();
    const internals = app as unknown as {
        settings: typeof settings;
        activePopover?: HTMLElement;
        activeBackdrop?: HTMLElement;
        mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover'; stackOverSettings?: boolean }): void;
        dismiss(): void;
    };
    internals.settings = settings;
    internals.activePopover = settingsForm;
    internals.activeBackdrop = settingsBackdrop;
    return { settings, settingsForm, settingsBackdrop, anchor, internals };
}

export function jpdbJsonResponse(payload: unknown, status = 200): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(payload),
    } as Response;
}

function jpdbDeckRequest(url: RequestInfo | URL, init?: RequestInit): { href: string; body: JpdbDeckRequestBody } {
    return {
        href: String(url),
        body: JSON.parse(String(init?.body ?? '{}')) as JpdbDeckRequestBody,
    };
}

function jpdbLookupVocabularyResponse(
    href: string,
    body: JpdbDeckRequestBody,
    lookupVocabulary?: (body: JpdbDeckRequestBody) => unknown[],
): Response | null {
    return href === JPDB_LOOKUP_VOCABULARY_API && lookupVocabulary
        ? jpdbJsonResponse({ vocabulary_info: lookupVocabulary(body) })
        : null;
}

export function createJpdbDeckVocabularyFetchMock(options: {
    vocabulary: JpdbVocabularyPair[] | ((body: JpdbDeckRequestBody) => JpdbVocabularyPair[]);
    lookupVocabulary?: (body: JpdbDeckRequestBody) => unknown[];
}) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const { href, body } = jpdbDeckRequest(url, init);
        if (href === JPDB_DECK_LIST_VOCABULARY_API) {
            const vocabulary = typeof options.vocabulary === 'function'
                ? options.vocabulary(body)
                : options.vocabulary;
            return jpdbJsonResponse({ vocabulary });
        }
        const lookupResponse = jpdbLookupVocabularyResponse(href, body, options.lookupVocabulary);
        if (lookupResponse) return lookupResponse;
        throw new Error(`Unexpected URL: ${href}`);
    });
}

export function createFallbackJpdbDeckFetchMock(options: {
    requestedDecks: unknown[];
    vocabularyForDeck: (deckId: unknown) => JpdbVocabularyPair[];
    lookupVocabulary?: (body: JpdbDeckRequestBody) => unknown[];
}) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const { href, body } = jpdbDeckRequest(url, init);
        if (href === JPDB_DECK_LIST_VOCABULARY_API) {
            options.requestedDecks.push(body.id);
            if (body.id === 'all') return jpdbJsonResponse({ error_message: 'unsupported deck' }, 400);
            return jpdbJsonResponse({ vocabulary: options.vocabularyForDeck(body.id) });
        }
        if (href === JPDB_LIST_USER_DECKS_API) {
            return jpdbJsonResponse({ decks: [['deck-a', 'Deck A'], ['deck-b', 'Deck B']] });
        }
        const lookupResponse = jpdbLookupVocabularyResponse(href, body, options.lookupVocabulary);
        if (lookupResponse) return lookupResponse;
        throw new Error(`Unexpected URL: ${href}`);
    });
}

export function jpdbDeckVocabularyInfoRow(
    [vid, sid]: JpdbVocabularyPair,
    options: {
        spellingPrefix?: string;
        readingPrefix?: string;
        meaningPrefix?: string;
        idOffset?: number;
        state?: string[];
        reviewState?: string[];
        dueAt?: number | null;
    } = {},
): unknown[] {
    const spellingPrefix = options.spellingPrefix ?? '語';
    const readingPrefix = options.readingPrefix ?? 'ご';
    const meaningPrefix = options.meaningPrefix ?? 'word';
    return [
        vid,
        sid,
        vid + (options.idOffset ?? 100),
        `${spellingPrefix}${vid}`,
        `${readingPrefix}${vid}`,
        vid,
        ['n'],
        [[`${meaningPrefix} ${vid}`]],
        [['n']],
        options.state ?? ['known'],
        options.reviewState ?? [],
        options.dueAt ?? null,
    ];
}

export function testCardPopoverRenderer(settings: Partial<ReaderSettings> = {}, overrides: Partial<CardPopoverRendererDependencies> = {}): CardPopoverRenderer {
    return new CardPopoverRenderer({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ...(settings.ankiEnabled && settings.ankiSectionEnabled === undefined ? { ankiSectionEnabled: true } : {}),
            ...settings,
        }),
        isJpdbBackedCard: () => true,
        renderWordHistory: () => '',
        renderWordPills: () => '',
        renderDefinitionSources: () => '',
        dictionarySourceAttributes: (_key, initiallyExpanded = true) => initiallyExpanded ? 'open' : '',
        dictionaryLabel: name => name,
        accountDataSurfaceTrusted: () => true,
        ...overrides,
    });
}

export function testCardPopoverRendererWithWordPills(settings: ReaderSettings): CardPopoverRenderer {
    return testCardPopoverRenderer(settings, {
        renderWordPills: (lookupCard, jpdbUrl, metaEntries, overrideQuery, _trigger, ankiLookup, frequencyRanks) => renderWordPills({
            card: lookupCard,
            jpdbUrl,
            metaEntries,
            overrideQuery,
            ankiLookup,
            frequencyRanks,
            settings,
            isJpdbBackedCard: () => true,
            dictionaryLabel: name => name,
        }),
    });
}

export function renderModalCard(
    renderer: CardPopoverRenderer,
    lookupCard: JPDBCard,
    sentence: string,
    data: Partial<CardRenderData & { loading: boolean }> = {},
): string {
    return renderer.render(lookupCard, sentence, 'modal', emptyCardRenderData(data));
}

export function readerMetaText(): string {
    return document.querySelector('.jpdb-reader-meta')?.textContent ?? '';
}

export function popoverGradeButtons(): HTMLButtonElement[] {
    return [...document.querySelectorAll<HTMLButtonElement>('.jpdb-reader-actions [data-action="grade"]')];
}

export function popoverGradeTargetText(): string {
    return document.querySelector<HTMLElement>('.jpdb-reader-sr-only[data-review-target-label]')?.textContent?.trim() ?? '';
}

export function popoverGradeTargetCurrentText(): string {
    return document.querySelector<HTMLElement>('[data-review-target-current]')?.textContent?.trim() ?? '';
}

export function popoverGradeTargetOptions(): Array<{ text: string; target: string; cardId: string; selected: boolean }> {
    return [...document.querySelectorAll<HTMLOptionElement>('[data-review-target-select] option')]
        .map(option => ({
            text: option.textContent?.trim() ?? '',
            target: option.dataset.reviewTarget ?? '',
            cardId: option.dataset.ankiCardId ?? '',
            selected: option.selected,
        }));
}

export function createLocalPitchParserFixture() {
    const findTermMatches = vi.fn().mockResolvedValue([{
        entry: {
            expression: '計量',
            reading: 'けいりょう',
            glossary: ['measurement'],
            dictionary: 'JMdict',
        },
        start: 0,
        end: 2,
        surface: '計量',
    }]);
    const lookupTermMeta = vi.fn().mockResolvedValue([{
        expression: '計量',
        mode: 'pitch',
        data: { reading: 'けいりょう', pitches: [{ position: 0 }] },
        dictionary: 'Pitch',
    }]);
    return {
        findTermMatches,
        lookupTermMeta,
        parser: new ReaderParser({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, showPitchAccent: true }),
            jpdb: {} as never,
            dictionaries: { findTermMatches, lookupTermMeta } as never,
        }),
    };
}

function kanjiLocalDictionaryMatch() {
    return {
        entry: {
            expression: '漢字',
            reading: 'かんじ',
            glossary: ['Chinese characters'],
            dictionary: 'JMdict',
        },
        start: 0,
        end: 2,
        surface: '漢字',
    };
}

export function createKanjiLocalParserFixture(options: {
    settings?: Partial<ReaderSettings>;
    jpdb?: unknown;
    jiten?: unknown;
} = {}) {
    const findTermMatches = vi.fn().mockResolvedValue([kanjiLocalDictionaryMatch()]);
    return {
        findTermMatches,
        parser: new ReaderParser({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: true,
                ...options.settings,
            }),
            jpdb: (options.jpdb ?? {}) as never,
            jiten: options.jiten as never,
            dictionaries: { findTermMatches } as never,
        }),
    };
}

export async function expectKanjiLocalFallbackAfterTimeout(
    parser: ReaderParser,
    findTermMatches: ReturnType<typeof vi.fn>,
    options: Parameters<ReaderParser['parse']>[1],
    timeoutMs: number,
): Promise<void> {
    const parsed = parser.parse(['漢字を書く'], options);
    await vi.advanceTimersByTimeAsync(timeoutMs);
    const [tokens] = await parsed;

    expect(findTermMatches).toHaveBeenCalledWith(
        '漢字を書く',
        expect.any(Number),
        DEFAULT_SETTINGS.dictionaryPreferences,
        japaneseLearningTargetMatcher(),
    );
    expect(tokens[0].card.spelling).toBe('漢字');
}

export function emptyCardRenderData(overrides: Partial<CardRenderData & { loading: boolean }> = {}): CardRenderData & { loading: boolean } {
    return {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo: null,
        loading: false,
        ...overrides,
    };
}

export function testAnkiExistingNote(overrides: Partial<AnkiExistingNote> = {}): AnkiExistingNote {
    const cardId = overrides.primaryCardId ?? overrides.cardIds?.[0] ?? 777;
    return {
        noteId: 55,
        primaryCardId: cardId,
        cardIds: [cardId],
        state: 'known',
        deckNames: ['Anime::Mining'],
        modelName: 'Imported Core',
        fields: { Word: '動画' },
        tags: [],
        reps: 8,
        lapses: 1,
        ...overrides,
    };
}

export function testAnkiLookup(overrides: Partial<AnkiLookupResult> = {}): AnkiLookupResult {
    const primary = overrides.primary === undefined
        ? (overrides.state === 'not-in-deck'
            ? null
            : testAnkiExistingNote(overrides.state === undefined ? {} : { state: overrides.state }))
        : overrides.primary;
    return {
        state: primary?.state ?? 'not-in-deck',
        notes: primary ? [primary] : [],
        primary,
        ...overrides,
    };
}

export function testCardActionController(
    overrides: Partial<ConstructorParameters<typeof CardActionController>[0]> = {},
): CardActionController {
    return new CardActionController({
        getSettings: () => DEFAULT_SETTINGS,
        jpdb: {} as unknown as JpdbClient,
        jiten: {} as unknown as JitenApiClient,
        anki: {} as unknown as AnkiConnectClient,
        dictionaries: {} as unknown as YomitanDictionaryStore,
        isJpdbBackedCard: () => true,
        resolveMiningContext: vi.fn(),
        showCard: vi.fn(),
        getActivePopoverAnchor: () => undefined,
        getActivePopoverMode: () => undefined,
        showSettings: vi.fn(),
        playAudio: vi.fn(),
        playSentenceAudio: vi.fn(),
        detectGrammarHints: vi.fn(),
        parsePopoverJapanese: vi.fn(),
        toast: vi.fn(),
        ...overrides,
    });
}

export function testJitenAudioActionController(options: {
    playMediaUrl?: (audioUrl: string) => Promise<boolean | void>;
    settings?: Partial<ReaderSettings>;
} = {}) {
    const playMediaUrl = options.playMediaUrl ?? vi.fn(async (): Promise<boolean | void> => true);
    const playSentenceAudio = vi.fn(async () => undefined);
    const controller = testCardActionController({
        getSettings: () => ({ ...DEFAULT_SETTINGS, ...options.settings }),
        playMediaUrl,
        playSentenceAudio,
    });
    return { controller, playMediaUrl, playSentenceAudio };
}

export const TEST_JITEN_AUDIO_URLS = [
    'https://audio.example.test/primary.mp3',
    'https://audio.example.test/backup.mp3',
] as const;

export async function performTestJitenAudioAction(controller: CardActionController): Promise<void> {
    await expect(controller.perform({
        kind: 'card-action',
        action: 'jiten-audio',
        audioUrls: [...TEST_JITEN_AUDIO_URLS],
        sentence: '訓むこともある。',
    }, document.createElement('button'), card)).resolves.toBe(false);
}

export function testReviewGradeController(options: {
    settings?: Partial<ReaderSettings>;
    jpdb?: Partial<JpdbClient>;
    anki?: Partial<AnkiConnectClient>;
} = {}) {
    const addToDeck = vi.fn(async () => undefined);
    const reviewCard = vi.fn(async () => undefined);
    const answerCard = vi.fn(async () => undefined);
    const invalidateCardData = vi.fn();
    const onAnkiStatusChanged = vi.fn();
    const controller = testCardActionController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'test-key',
            ...options.settings,
        }),
        jpdb: { addToDeck, reviewCard, ...options.jpdb } as unknown as JpdbClient,
        anki: { answerCard, ...options.anki } as unknown as AnkiConnectClient,
        invalidateCardData,
        onAnkiStatusChanged,
    });
    return { controller, addToDeck, reviewCard, answerCard, invalidateCardData, onAnkiStatusChanged };
}

export function expectRenderedPitchWord(word: HTMLElement, pitchClass: string): void {
    expect([...word.classList]).toContain(`jpdb-pitch-${pitchClass}`);
    expect([...word.classList]).not.toContain('jpdb-pitch-unknown');
}

export function expectReaderWordFurigana(word: HTMLElement, reading: string): void {
    expect(word.dataset.reading).toBe(reading);
    expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
    expect(word.querySelector('rt')?.textContent).toBe(reading);
}

export function expectHydratedOcrPitchWord(
    word: HTMLElement,
    line: HTMLElement,
    expected: { vid: string; reading: string; pitchClass: string; surface: string; visualText: string[] },
): void {
    expect(renderedWordPrivateValue(word, 'vid')).toBe(expected.vid);
    expect(word.dataset.vid).toBeUndefined();
    expect(word.dataset.reading).toBe(expected.reading);
    expectRenderedPitchWord(word, expected.pitchClass);
    expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
    expect(line.dataset.hasFuri).toBe('true');
    expect([...word.querySelectorAll<HTMLElement>('.jpdb-ocr-visual-text')]
        .map(element => element.dataset.yomuOcrVisualText)).toEqual(expected.visualText);
    expect(document.createTreeWalker(word, NodeFilter.SHOW_TEXT).nextNode()).toBeNull();
    expect(word.textContent).toBe('');
    expect(readerWordSurfaceText(word)).toBe(expected.surface);
}

export function cardDetailLoaderSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        apiKey: 'api-key',
        localDictionariesEnabled: false,
        showPitchAccent: false,
        jpdbDefinitionsEnabled: false,
        jpdbMiningEnabled: true,
        ...overrides,
    };
}

export function testCardRenderDataLoader(options: TestCardRenderDataLoaderOptions): CardRenderDataLoader {
    return new CardRenderDataLoader({
        getSettings: () => options.settings,
        dictionaries: {
            lookup: vi.fn(async () => []),
            lookupKanji: vi.fn(async () => []),
            lookupTermMeta: vi.fn(async () => []),
            ...options.dictionaries,
        } as unknown as YomitanDictionaryStore,
        jpdbPublicPitch: {
            lookup: vi.fn(async () => []),
            ...options.jpdbPublicPitch,
        } as unknown as JpdbPublicPitchClient,
        jpdbVocabulary: {
            lookup: vi.fn(async () => null),
            ...options.jpdbVocabulary,
        } as unknown as JpdbVocabularyClient,
        anki: {
            findExistingCards: vi.fn(async (): Promise<AnkiLookupResult> => ({ state: 'not-in-deck', notes: [], primary: null })),
            findCachedStatusBatch: vi.fn(async (): Promise<AnkiLookupResult[]> => []),
            deckNames: vi.fn(async () => []),
            ...options.anki,
        } as unknown as AnkiConnectClient,
        jpdb: {
            listDecks: vi.fn(async () => []),
            isInUserDeckPool: vi.fn(async () => false),
            ...options.jpdb,
        } as unknown as JpdbClient,
        jiten: {
            listReaderStudyDecks: vi.fn(async () => []),
            ...options.jiten,
        } as unknown as JitenApiClient,
        isJpdbBackedCard: options.isJpdbBackedCard ?? (() => true),
    });
}

export function immersionExample(sentence: string): ImmersionKitExample {
    return {
        id: `ik-${sentence}`,
        sentence,
        sentenceWithFurigana: '',
        translation: 'Example translation.',
        sourceTitle: 'Test Source',
        titleSlug: 'test_source',
        category: 'anime',
        soundFile: '',
        imageFile: '',
        soundUrl: '',
        imageUrl: '',
    };
}

export function testImmersionKitExample(overrides: Partial<ImmersionKitExample> = {}): ImmersionKitExample {
    return {
        id: 'anime_test_000001',
        sentence: 'これは発音です',
        sentenceWithFurigana: '',
        translation: '',
        sourceTitle: 'Test Source',
        titleSlug: 'test_source',
        category: 'anime',
        soundFile: 'line.mp3',
        imageFile: '',
        soundUrl: '',
        imageUrl: '',
        ...overrides,
    };
}

export function testImmersionPopoverSurface(): { app: ReaderApp; container: HTMLDetailsElement; popover: HTMLDivElement } {
    const app = new ReaderApp();
    const container = document.createElement('details');
    container.setAttribute('data-immersion-kit', '');
    const popover = document.createElement('div');
    popover.append(container);
    document.body.append(popover);
    return { app, container, popover };
}

export function testSynchronousReaderApp(): { app: ReaderApp; restoreAnimationFrame: () => void } {
    const app = new ReaderApp();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    vi.stubGlobal('ResizeObserver', class {
        observe(): void {}
        disconnect(): void {}
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })));
    Object.defineProperty(window, 'requestAnimationFrame', {
        configurable: true,
        value: (frame: FrameRequestCallback) => {
            frame(0);
            return 1;
        },
    });
    return {
        app,
        restoreAnimationFrame: () => {
            Object.defineProperty(window, 'requestAnimationFrame', {
                configurable: true,
                value: originalRequestAnimationFrame,
            });
        },
    };
}

export async function withKanjiStudyCompanionMissing<T>(callback: () => Promise<T>): Promise<T> {
    const targets = [
        globalThis,
        typeof window === 'undefined' ? null : window,
    ].filter((target, index, all): target is typeof globalThis & { __yomuCompanions?: Record<string, unknown> } => Boolean(target && all.indexOf(target) === index));
    const previous = targets.map(target => ({
        target,
        hadRegistry: Object.prototype.hasOwnProperty.call(target, '__yomuCompanions'),
        registry: target.__yomuCompanions,
    }));
    for (const target of targets) {
        const registry = { ...(target.__yomuCompanions ?? {}) };
        delete registry.kanjiStudy;
        Object.defineProperty(target, '__yomuCompanions', {
            configurable: true,
            enumerable: false,
            writable: true,
            value: registry,
        });
    }
    try {
        return await callback();
    } finally {
        for (const entry of previous) {
            if (entry.hadRegistry) {
                entry.target.__yomuCompanions = entry.registry;
            } else {
                delete entry.target.__yomuCompanions;
            }
        }
    }
}

export function testReaderAppWithPageScanner(html: string) {
    const app = new ReaderApp();
    const scanVisiblePage = vi.fn(async (_options?: { silent?: boolean }) => undefined);
    Object.assign(app as unknown as {
        pageScanner: { scanVisiblePage(options: { silent?: boolean }): Promise<void>; destroy(): void };
    }, {
        pageScanner: { scanVisiblePage, destroy: vi.fn() },
    });
    document.body.innerHTML = html;
    return { app, scanVisiblePage };
}

export function settingsJapaneseParserFixture(options: {
    spelling: string;
    reading: string;
    vid: number;
    settings?: Partial<ReaderSettings>;
}) {
    const app = new ReaderApp();
    const settings = {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'ja' as const,
        showFurigana: true,
        furiganaMode: 'all' as const,
        ...options.settings,
    };
    const form = document.createElement('form');
    form.className = 'jpdb-reader-settings';
    form.dataset.jpdbReaderRoot = 'true';
    form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
    localizeSettingsForm(form, 'ja');
    document.body.append(form);
    const parseJapanese = vi.fn(async (texts: string[], parseOptions?: unknown): Promise<JPDBToken[][]> => {
        void parseOptions;
        return texts.map(text => settingsJapaneseTokenForText(text, options));
    });
    const internals = app as unknown as {
        settings: typeof settings;
        activePopover?: HTMLElement;
        parseJapanese: typeof parseJapanese;
        parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
        enrichPitchWords(tokens: JPDBToken[], options?: unknown): Promise<void>;
        enrichAnkiWords(tokens: JPDBToken[], roots?: ParentNode[]): Promise<void>;
    };
    internals.settings = settings;
    internals.activePopover = form;
    internals.parseJapanese = parseJapanese;
    internals.enrichPitchWords = vi.fn(async () => undefined);
    internals.enrichAnkiWords = vi.fn(async () => undefined);
    return { app, form, parseJapanese, internals };
}

export function newTabSettingsJapaneseParserFixture(options: {
    spelling: string;
    reading: string;
    vid: number;
    settings?: Partial<ReaderSettings>;
}) {
    const runtime = new NewTabRuntime();
    const settings = {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'ja' as const,
        showFurigana: true,
        showPitchAccent: true,
        furiganaMode: 'all' as const,
        ...options.settings,
    };
    const form = document.createElement('form');
    form.className = 'jpdb-reader-settings';
    form.dataset.jpdbReaderRoot = 'true';
    form.innerHTML = renderSettingsForm(settings, 'https://jpdb.io/settings');
    localizeSettingsForm(form, 'ja');
    document.body.append(form);
    const parse = vi.fn(async (texts: string[], parseOptions?: unknown): Promise<JPDBToken[][]> => {
        void parseOptions;
        return texts.map(text => settingsJapaneseTokenForText(text, options));
    });
    const internals = runtime as unknown as {
        settings: typeof settings;
        activeDialog?: HTMLElement;
        parser: { canParse(): boolean; parse: typeof parse };
        parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
        hydrateSettingsFallbackTokens(parsed: JPDBToken[][]): Promise<void>;
        enrichPitchWords(tokens: JPDBToken[], limit?: number): Promise<void>;
    };
    internals.settings = settings;
    internals.activeDialog = form;
    internals.parser = { canParse: () => true, parse };
    internals.hydrateSettingsFallbackTokens = vi.fn(async () => undefined);
    internals.enrichPitchWords = vi.fn(async () => undefined);
    return { form, parse, internals };
}

function settingsJapaneseTokenForText(
    text: string,
    options: { spelling: string; reading: string; vid: number },
): JPDBToken[] {
    const start = text.indexOf(options.spelling);
    if (start < 0) return [];
    return [{
        card: {
            ...card,
            vid: options.vid,
            sid: 0,
            spelling: options.spelling,
            reading: options.reading,
            partOfSpeech: ['n'],
        },
        start,
        end: start + options.spelling.length,
        length: options.spelling.length,
        rubies: [{ text: options.reading, start, end: start + options.spelling.length, length: options.spelling.length }],
        pitchClass: 'heiban',
    }];
}

export function stubLocalHostedReaderLocation(path = '/yomu-reader/'): void {
    vi.stubGlobal('location', {
        href: `http://127.0.0.1:5177${path}`,
        origin: 'http://127.0.0.1:5177',
        pathname: path,
        hostname: '127.0.0.1',
    });
}

export async function expectSilentPageScan(scanVisiblePage: unknown): Promise<void> {
    await waitForExpect(() => {
        expect(scanVisiblePage).toHaveBeenCalledWith({ silent: true });
    });
}

export function testImmersionPopoverInternals(app: ReaderApp): TestImmersionPopoverInternals {
    return app as unknown as TestImmersionPopoverInternals;
}


export function immersionPopoverTestController(
    search: (query: string, settings: typeof DEFAULT_SETTINGS, options: { signal?: AbortSignal }) => Promise<ImmersionKitExample[]>,
): ImmersionPopoverController {
    return testImmersionPopoverController({
        settings: { immersionKitShowImages: false },
        search,
    });
}

export function testImmersionPopoverController(options: {
    settings?: Partial<ReaderSettings>;
    client?: Partial<ImmersionKitClient>;
    search?: (query: string, settings: ReaderSettings, options: { signal?: AbortSignal }) => Promise<ImmersionKitExample[]>;
    parseJapanese?: (paragraphs: string[], options?: unknown) => Promise<JPDBToken[][]>;
    canParseJapanese?: () => boolean;
} = {}): ImmersionPopoverController {
    return new ImmersionPopoverController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: true,
            ...options.settings,
        }),
        client: {
            search: options.search ?? vi.fn(async () => []),
            mediaUrls: vi.fn(() => []),
            fetchBlobUrl: vi.fn(async () => ''),
            ...options.client,
        } as unknown as ImmersionKitClient,
        audio: { play: vi.fn(async () => undefined) } as never,
        parseJapanese: options.parseJapanese ?? vi.fn(async () => []),
        canParseJapanese: options.canParseJapanese ?? (() => false),
        parsePopoverJapanese: vi.fn(),
        enrichPitchWords: vi.fn(),
        enrichAnkiWords: vi.fn(),
        repositionPopover: vi.fn(),
        setImmersionTranslationBlurred: vi.fn(),
        toast: vi.fn(),
    });
}

export function parsedExampleSentenceInternals(controller: ImmersionPopoverController): {
    parsedExampleSentenceTokens(sentence: string): Promise<JPDBToken[]>;
} {
    return controller as unknown as { parsedExampleSentenceTokens(sentence: string): Promise<JPDBToken[]> };
}

export function immersionLazyLoadSurface(open: boolean): { popover: HTMLElement; container: HTMLDetailsElement } {
    const popover = document.createElement('div');
    const container = document.createElement('details');
    container.dataset.immersionKit = 'true';
    container.open = open;
    container.innerHTML = `
        <summary class="jpdb-reader-local-title">Immersion Kit</summary>
        <div class="jpdb-reader-help">Loading examples...</div>
    `;
    popover.append(container);
    document.body.append(popover);
    return { popover, container };
}

export function lazyImmersionSearchFixture(open: boolean) {
    const search = vi.fn(async () => [immersionExample('食べる。')]);
    const controller = immersionPopoverTestController(search);
    const { popover, container } = immersionLazyLoadSurface(open);
    return { search, controller, popover, container };
}

export function kanjiRelatedWordNavigationFixture(lookupCard: JPDBCard) {
    const { app, restoreAnimationFrame } = testSynchronousReaderApp();
    const originalWord = { ...card, spelling: '漢字', reading: 'かんじ' };
    const internals = app as unknown as {
        settings: typeof DEFAULT_SETTINGS;
        showKanjiCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
        parseJapanese(texts: string[]): Promise<JPDBToken[][]>;
        parsePopoverJapanese(popover: HTMLElement): Promise<void>;
    };
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jpdbMiningEnabled: false,
        ankiEnabled: false,
        localDictionariesEnabled: false,
        localDictionaryShowKanji: false,
        jpdbDefinitionsEnabled: false,
        jpdbKanjiEnabled: false,
        uchisenEnabled: false,
        rtkEnabled: false,
        kanjivgEnabled: false,
        kanjiOriginsEnabled: false,
        similarKanjiWords: false,
        showPitchAccent: false,
        immersionKitEnabled: false,
    };
    internals.parsePopoverJapanese = vi.fn(async () => undefined);
    internals.parseJapanese = vi.fn(async () => [[{
        card: lookupCard,
        start: 0,
        end: 2,
        length: 2,
        rubies: [],
        pitchClass: '',
        sentence: '漢語',
    }]]);
    return { app, restoreAnimationFrame, internals, originalWord };
}

export async function expectKanjiRelatedWordBackNavigation(): Promise<void> {
    await waitForExpect(() => {
        const spelling = document.querySelector<HTMLElement>('.jpdb-reader-spelling');
        expect(spelling ? readerWordSurfaceText(spelling) : '').toBe('漢語');
        expect(document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')?.title).toBe('Back to kanji: 漢');
    });

    document.querySelector<HTMLButtonElement>('[data-action="word-history-back"]')?.click();

    await waitForExpect(() => {
        expect(document.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('漢');
        expect(document.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');
    });
}

export async function openLazyImmersionSource(container: HTMLDetailsElement): Promise<void> {
    container.open = true;
    container.dispatchEvent(new Event('toggle'));
    await vi.advanceTimersByTimeAsync(200);
    await Promise.resolve();
    await Promise.resolve();
}

export function dispatchPointerEvent(target: EventTarget, type: string, clientY: number, pointerType = 'mouse', clientX = 0): void {
    dispatchBrowserPointerEvent(target, type, { clientX, clientY, pointerType });
}

export function pointerEventLike(pointerType = 'mouse', button = 0): PointerEvent {
    return createPointerEvent('pointermove', { button, pointerType });
}

export function dispatchTouchEvent(target: EventTarget, type: string, clientY: number, identifier = 1): void {
    const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
    const touch = { clientY, identifier } as Touch;
    const touchList = [touch] as unknown as TouchList & Touch[];
    Object.defineProperty(touchList, 'item', {
        value: (index: number) => touchList[index] ?? null,
    });
    Object.defineProperties(event, {
        changedTouches: { value: touchList },
        targetTouches: { value: type === 'touchend' || type === 'touchcancel' ? [] : touchList },
        touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : touchList },
    });
    target.dispatchEvent(event);
}

export function createSheetPopoverFixture(options: { expanded?: boolean; pointerCapture?: boolean } = {}): { popover: HTMLElement; handle: HTMLElement } {
    const popover = document.createElement('div');
    popover.className = options.expanded
        ? 'jpdb-reader-popover jpdb-reader-sheet jpdb-reader-sheet-expanded'
        : 'jpdb-reader-popover jpdb-reader-sheet';
    popover.innerHTML = '<div class="jpdb-reader-sheet-handle"></div>';
    document.body.append(popover);
    const handle = popover.querySelector<HTMLElement>('.jpdb-reader-sheet-handle')!;
    if (options.pointerCapture) {
        handle.setPointerCapture = vi.fn();
        handle.releasePointerCapture = vi.fn();
    }
    return { popover, handle };
}

function mockSourceRowRects(rows: HTMLElement[], rowHeight = 40, rowGap = 8): void {
    rows.forEach((row, index) => {
        const top = index * (rowHeight + rowGap);
        row.getBoundingClientRect = () => ({
            x: 0,
            y: top,
            top,
            left: 0,
            right: 300,
            bottom: top + rowHeight,
            width: 300,
            height: rowHeight,
            toJSON: () => ({}),
        });
    });
}

export function createSourceRowDragFixture(html: string, rowSelector: string): { form: HTMLFormElement; rows: HTMLElement[] } {
    document.body.innerHTML = `<form>${html}</form>`;
    const form = document.querySelector('form')!;
    installSourceRowDrag(form);
    const rows = Array.from(form.querySelectorAll<HTMLElement>(rowSelector));
    mockSourceRowRects(rows);
    return { form, rows };
}

export function dragSourceRow(
    form: HTMLFormElement,
    rows: HTMLElement[],
    clientY: number,
    pointerType = 'mouse',
    moveTarget: EventTarget = form,
): void {
    const handle = rows[0].querySelector<HTMLElement>('[data-source-drag-handle]')!;
    dispatchPointerEvent(handle, 'pointerdown', 4, pointerType);
    dispatchPointerEvent(moveTarget, 'pointermove', clientY, pointerType);
    dispatchPointerEvent(moveTarget, 'pointerup', clientY, pointerType);
}

export function withPointerTextLookupMock<T>(
    node: Text,
    offset: number,
    rects: Array<{ left: number; top: number; width: number; height: number }>
        | ((start: number, end: number) => Array<{ left: number; top: number; width: number; height: number }>),
    callback: () => T,
): T {
    const caretDescriptor = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
    const rangeDescriptor = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
    const originalCreateRange = document.createRange.bind(document);
    const createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => {
        const range = originalCreateRange();
        let rangeStart = 0;
        let rangeEnd = 0;
        const originalSetStart = range.setStart.bind(range);
        const originalSetEnd = range.setEnd.bind(range);
        range.setStart = (startNode, startOffset) => {
            rangeStart = startOffset;
            originalSetStart(startNode, startOffset);
        };
        range.setEnd = (endNode, endOffset) => {
            rangeEnd = endOffset;
            originalSetEnd(endNode, endOffset);
        };
        range.getClientRects = () => domRectList(typeof rects === 'function' ? rects(rangeStart, rangeEnd) : rects);
        return range;
    });

    Object.defineProperty(document, 'caretPositionFromPoint', {
        configurable: true,
        value: vi.fn(() => ({ offsetNode: node, offset })),
    });
    Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: undefined,
    });

    try {
        return callback();
    } finally {
        createRangeSpy.mockRestore();
        if (caretDescriptor) Object.defineProperty(document, 'caretPositionFromPoint', caretDescriptor);
        else delete (document as unknown as Record<string, unknown>).caretPositionFromPoint;
        if (rangeDescriptor) Object.defineProperty(document, 'caretRangeFromPoint', rangeDescriptor);
        else delete (document as unknown as Record<string, unknown>).caretRangeFromPoint;
    }
}

export function withElementsFromPointMock<T>(elements: Element[], callback: () => T): T {
    const originalElementsFromPoint = document.elementsFromPoint;
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => elements),
    });

    try {
        return callback();
    } finally {
        if (originalElementsFromPoint) {
            Object.defineProperty(document, 'elementsFromPoint', {
                configurable: true,
                value: originalElementsFromPoint,
            });
        } else {
            delete (document as unknown as { elementsFromPoint?: typeof document.elementsFromPoint }).elementsFromPoint;
        }
    }
}

export function mockReaderWordRect(word: HTMLElement, rect: DOMRect): void {
    Object.defineProperties(word, {
        getClientRects: {
            configurable: true,
            value: () => domRectList([{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }]),
        },
        getBoundingClientRect: {
            configurable: true,
            value: () => rect,
        },
    });
}

export function domRectList(rects: Array<{ left: number; top: number; width: number; height: number }>): DOMRectList {
    const items = rects.map(rect => ({
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
        toJSON: () => ({}),
    })) as DOMRect[];
    return Object.assign(items, { item: (index: number) => items[index] ?? null }) as unknown as DOMRectList;
}

export const YOUTUBE_WATCH_TEST_URL = 'https://www.youtube.com/watch?v=TAorfFcb8_g';
export type TestYouTubeCaptionTrack = {
    baseUrl: string;
    languageCode: string;
    kind?: string;
    vssId?: string;
    name: { simpleText: string };
};

export function testYouTubeCaptionTrack(options: {
    videoId?: string;
    languageCode: string;
    label: string;
    query?: string;
    kind?: string;
    vssId?: string;
}): TestYouTubeCaptionTrack {
    const videoId = options.videoId ?? 'abc123';
    const suffix = options.query ? `&${options.query}` : '';
    return {
        baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${options.languageCode}${suffix}`,
        languageCode: options.languageCode,
        ...(options.kind === undefined ? {} : { kind: options.kind }),
        ...(options.vssId === undefined ? {} : { vssId: options.vssId }),
        name: { simpleText: options.label },
    };
}

export function testYouTubePlayerResponse(options: {
    videoId?: string;
    captionTracks: TestYouTubeCaptionTrack[];
    includeVideoDetails?: boolean;
    translationLanguages?: Array<{ languageCode: string; languageName: string }>;
}) {
    return {
        ...(options.includeVideoDetails === false ? {} : { videoDetails: { videoId: options.videoId ?? 'abc123' } }),
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: options.captionTracks,
                ...(options.translationLanguages === undefined ? {} : { translationLanguages: options.translationLanguages }),
            },
        },
    };
}

export function stubYouTubePlayerResponse(options: { url?: string; response: unknown }): () => void {
    const originalLocation = window.location;
    const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL(options.url ?? 'https://www.youtube.com/watch?v=abc123') as unknown as Location,
    });
    (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = options.response;
    return () => {
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
    };
}

export function stubYouTubeAndroidFallbackEnvironment(options: {
    hl: string;
    captionTrack: TestYouTubeCaptionTrack;
}): { requestedUrls: string[]; restore: () => void } {
    const originalLocation = window.location;
    const originalFetch = globalThis.fetch;
    const originalYtcfg = (window as Window & { ytcfg?: unknown }).ytcfg;
    const requestedUrls: string[] = [];
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
    });
    (window as Window & { ytcfg?: { get: (key: string) => string } }).ytcfg = {
        get: key => ({
            INNERTUBE_API_KEY: 'test-key',
            INNERTUBE_CLIENT_NAME: 'WEB',
            HL: options.hl,
        })[key] ?? '',
    };
    Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: vi.fn(async () => new Response(JSON.stringify(testYouTubePlayerResponse({
            captionTracks: [options.captionTrack],
        })), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    });
    return {
        requestedUrls,
        restore: () => {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
            (window as Window & { ytcfg?: unknown }).ytcfg = originalYtcfg;
        },
    };
}

export function expectActiveYouTubeNativeCaptionSuppression(options: {
    hasPrimaryCues: boolean;
    currentCueText: string;
    youtubeDomCaptionFallbackTrackId?: string;
}): void {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
    });

    try {
        const active = applySubtitleNativeTrackModes({
            tracks: [{ id: 'youtube-0', label: 'Japanese', kind: 'youtube' }],
            selectedTrackId: 'youtube-0',
            secondaryTrackId: '',
            overlayVisible: true,
            hasPrimaryCues: options.hasPrimaryCues,
            currentCueText: options.currentCueText,
            youtubeDomCaptionFallbackTrackId: options.youtubeDomCaptionFallbackTrackId ?? '',
            lastYomuCaptionsActive: false,
        });

        expect(active).toBe(true);
        expect(document.documentElement.classList.contains('jpdb-subtitle-yomu-captions-active')).toBe(true);
    } finally {
        document.documentElement.classList.remove('jpdb-subtitle-yomu-captions-active');
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
    }
}

export function collectYouTubeTargets(html: string, url: string, limit: number | undefined) {
    const rectSpy = mockElementBoundingClientRect({ width: 1000, height: 240 });
    try {
        document.body.innerHTML = html;
        return collectScanTargets(limit, url);
    } finally {
        rectSpy.mockRestore();
    }
}

export function collectYouTubeWatchTargets(html: string, limit = 10) {
    return collectYouTubeTargets(html, YOUTUBE_WATCH_TEST_URL, limit);
}

export function expectBodyTextTargets(html: string, expected: string[]): void {
    document.body.innerHTML = html;
    expect(collectTextTargetsIn(document.body, 10, false).map(target => target.text)).toEqual(expected);
}

// Fragile UI text and short centered headings are collected on the PASSIVE
// channel (lookupable, no ruby geometry) instead of being rejected outright.
export function expectBodyPassiveTextTargets(html: string, expectedPassive: string[]): void {
    document.body.innerHTML = html;
    const targets = collectTextTargetsIn(document.body, 10, false);
    for (const text of expectedPassive) {
        const target = targets.find(candidate => candidate.text === text);
        expect(target, text).toBeTruthy();
        expect(target?.decoration, text).toBe('interactive-passive');
        expect(target?.suppressRuby, text).toBe(true);
    }
}

export function parseTestAnkiConnectRequest(data: string): TestAnkiConnectRequest {
    return JSON.parse(data) as TestAnkiConnectRequest;
}

export async function testAnkiConnectResponse(result: TestAnkiConnectResult): Promise<TestAnkiConnectResponse> {
    return { status: 200, response: { result: await result, error: null } };
}

export function testAnkiConnectRawResponse(result: unknown): TestAnkiConnectResponse {
    return { status: 200, response: { result, error: null } };
}

export function testAnkiConnectMultiResponse(
    request: TestAnkiConnectRequest,
    resultForAction: (action: TestAnkiConnectMultiAction) => unknown,
): TestAnkiConnectResponse {
    const actions = request.params.actions as TestAnkiConnectMultiAction[];
    return testAnkiConnectRawResponse(actions.map(action => ({
        result: resultForAction(action),
        error: null,
    })));
}

export function stubTestAnkiConnectResults(
    resultForRequest: (request: TestAnkiConnectRequest) => TestAnkiConnectResult,
    requests: TestAnkiConnectRequest[] = [],
): TestAnkiConnectRequest[] {
    vi.stubGlobal('GM', {
        xmlHttpRequest: ({ data }: { data: string }) => {
            const request = parseTestAnkiConnectRequest(data);
            requests.push(request);
            return testAnkiConnectResponse(resultForRequest(request));
        },
    });
    return requests;
}

export function stubTestAnkiConnectResponses(
    responseForRequest: (request: TestAnkiConnectRequest) => TestAnkiConnectResponse | Promise<TestAnkiConnectResponse>,
    requests: TestAnkiConnectRequest[] = [],
): TestAnkiConnectRequest[] {
    vi.stubGlobal('GM', {
        xmlHttpRequest: ({ data }: { data: string }) => {
            const request = parseTestAnkiConnectRequest(data);
            requests.push(request);
            return Promise.resolve(responseForRequest(request));
        },
    });
    return requests;
}

export function stubTestAnkiConnectResultMap(options: {
    resultByAction: Record<string, unknown>;
    multi?: (request: TestAnkiConnectRequest) => unknown;
    requests?: TestAnkiConnectRequest[];
}): TestAnkiConnectRequest[] {
    const requests = options.requests ?? [];
    vi.stubGlobal('GM', {
        xmlHttpRequest: ({ data }: { data: string }) => {
            const request = parseTestAnkiConnectRequest(data);
            requests.push(request);
            if (request.action === 'multi' && options.multi) {
                return Promise.resolve(testAnkiConnectRawResponse(options.multi(request)));
            }
            return Promise.resolve(testAnkiConnectRawResponse(options.resultByAction[request.action] ?? null));
        },
    });
    return requests;
}

export function testAnkiQueryRouteResult(request: TestAnkiConnectRequest, routes: Map<string, TestAnkiQueryRoute>): unknown | undefined {
    const route = routes.get(request.action);
    if (!route) return undefined;
    const query = String(request.params.query ?? '');
    return route.matches.some(match => query === match || query.includes(match)) ? route.result : [];
}

export function largeAnkiStatusIndexResult(fixture: LargeAnkiStatusIndexFixture): (request: TestAnkiConnectRequest) => unknown {
    const handlers: Record<string, (request: TestAnkiConnectRequest) => unknown> = {
        findCards: request => largeAnkiStatusIndexFindCards(request, fixture),
        findNotes: () => fixture.allIds,
        cardsInfo: request => largeAnkiStatusIndexCardsInfo(request, fixture),
        notesInfo: request => largeAnkiStatusIndexNotesInfo(request, fixture),
    };
    return request => handlers[request.action]?.(request) ?? [];
}

function largeAnkiStatusIndexFindCards(request: TestAnkiConnectRequest, fixture: LargeAnkiStatusIndexFixture): number[] {
    const query = String(request.params.query ?? '');
    if (query === 'deck:*') return fixture.allIds;
    return query.includes('is:due') ? [fixture.targetCardId] : [];
}

function largeAnkiStatusIndexCardsInfo(request: TestAnkiConnectRequest, fixture: LargeAnkiStatusIndexFixture): unknown[] {
    const cards = requestNumberArray(request.params.cards);
    fixture.cardInfoBatchSizes.push(cards.length);
    return cards.map(cardId => ({
        cardId,
        note: cardId,
        deckName: 'Imported Core',
        queue: cardId === fixture.targetCardId ? 2 : 0,
        type: cardId === fixture.targetCardId ? 2 : 0,
        reps: 0,
        lapses: 0,
    }));
}

function largeAnkiStatusIndexNotesInfo(request: TestAnkiConnectRequest, fixture: LargeAnkiStatusIndexFixture): unknown[] {
    const notes = requestNumberArray(request.params.notes);
    fixture.noteInfoBatchSizes.push(notes.length);
    return notes.map(noteId => ({
        noteId,
        modelName: 'Imported Core',
        tags: [],
        fields: {
            Word: { value: `語${noteId}` },
        },
        cards: [noteId],
    }));
}

function requestNumberArray(value: unknown): number[] {
    return Array.isArray(value) ? value.map(Number) : [];
}

function testLocationStub(href: string): TestLocationStub {
    const url = new URL(href);
    return { href, origin: url.origin, hostname: url.hostname };
}

export function stubTestLocation(href: string): TestLocationStub {
    const locationStub = testLocationStub(href);
    vi.stubGlobal('location', locationStub);
    return locationStub;
}

function hostedNewTabLocationStub(): TestLocationStub {
    return testLocationStub('https://hrussellzfac023.github.io/yomu-reader/newtab.html');
}

export function stubHostedNewTabLocation(): TestLocationStub {
    return stubTestLocation('https://hrussellzfac023.github.io/yomu-reader/newtab/');
}

export function stubLocalAppLocation(): TestLocationStub {
    return stubTestLocation('http://127.0.0.1:5173/yomu-reader/');
}

export function stubNhkArticleLocation(): TestLocationStub {
    return stubTestLocation('https://www.nhk.or.jp/news/easy/');
}

export function publicProxyUrlFor(target: string): string {
    return `${TEST_PROXY_URL}?url=${encodeURIComponent(target)}`;
}

export function builtInEdgeProxyUrlFor(target: string): string {
    return `https://edge.yomureader.com/?url=${encodeURIComponent(target)}`;
}

export function builtInWorkersDevProxyUrlFor(target: string): string {
    return `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(target)}`;
}

export function expectFetchUrls(fetchMock: { mock: { calls: Array<[RequestInfo | URL, ...unknown[]]> } }, urls: string[]): void {
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(urls);
}

export function pointerTextCandidate(sentence: string, anchor: HTMLElement, offset: number): TestPointerTextCandidate {
    return {
        text: sentence,
        offset,
        start: 0,
        end: sentence.length,
        anchor,
    };
}

function pointerTextInternals(app: ReaderApp): TestPointerTextInternals {
    return app as unknown as TestPointerTextInternals;
}

export function testIsJpdbBackedCard(lookupCard: JPDBCard): boolean {
    return lookupCard.source === 'jpdb' && lookupCard.vid > 0;
}

export function expectDefaultPointerParse(parse: unknown, sentence: string): void {
    expect(parse).toHaveBeenCalledWith([sentence], expect.objectContaining({
        allowJpdbTimeoutFallback: true,
        includeLocalPitch: false,
        jpdbTimeoutMs: 450,
        requireJpdb: false,
    }));
}

export function expectRenderedWordParse(parse: unknown, sentence: string): void {
    expect(parse).toHaveBeenCalledWith([sentence], expect.objectContaining({
        requireJpdb: false,
        jpdbTimeoutMs: 450,
    }));
}

export function stubLocalPointerTextInternals(
    app: ReaderApp,
    lookup: (text: string, reading: string, limit: number, preferences?: unknown) => Promise<YomitanTermEntry[]>,
    settings: Partial<ReaderSettings> = {},
) {
    const showPointerTextCard = vi.fn(async () => undefined);
    const internals = pointerTextInternals(app);
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jpdbDefinitionsEnabled: false,
        showPitchAccent: false,
        localDictionariesEnabled: true,
        ...settings,
    };
    // parseJapanese deliberately stays real: the pointer path now resolves
    // through the app's parse wrapper, and these tests assert what the
    // injected store's answers turn into at the pointer.
    internals.publicLookupCard = vi.fn(async () => undefined);
    internals.dictionaries = { lookup };
    internals.showPointerTextCard = showPointerTextCard;
    return { internals, showPointerTextCard };
}

export function stubMobileAnkiHandoffEnvironment(options: {
    userAgent: string;
    platform?: string;
    maxTouchPoints?: number;
    href?: string;
    stubFetch?: boolean;
}) {
    const originalUserAgent = navigator.userAgent;
    const originalPlatform = navigator.platform;
    const originalMaxTouchPoints = navigator.maxTouchPoints;
    const locationStub = testLocationStub(options.href ?? 'https://reader.test/article');
    const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    Object.defineProperty(window.navigator, 'userAgent', { value: options.userAgent, configurable: true });
    if (options.platform !== undefined) {
        Object.defineProperty(window.navigator, 'platform', { value: options.platform, configurable: true });
    }
    if (options.maxTouchPoints !== undefined) {
        Object.defineProperty(window.navigator, 'maxTouchPoints', { value: options.maxTouchPoints, configurable: true });
    }
    vi.stubGlobal('location', locationStub);
    if (options.stubFetch !== false) vi.stubGlobal('fetch', fetchMock);

    return {
        locationStub,
        fetchMock,
        confirmSpy,
        restore: () => {
            confirmSpy.mockRestore();
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            Object.defineProperty(window.navigator, 'platform', { value: originalPlatform, configurable: true });
            Object.defineProperty(window.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
            vi.unstubAllGlobals();
        },
    };
}

export function stubHostedProxyFetch(target: string, html: string, proxyUrl = 'https://yomu-proxy.example/fetch') {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
        expect(String(input)).toBe(`${proxyUrl}?url=${encodeURIComponent(target)}`);
        return Promise.resolve(new Response(html, { status: 200 }));
    });
    vi.stubGlobal('location', hostedNewTabLocationStub());
    vi.stubGlobal('fetch', fetchMock);
    return { proxyUrl, fetchMock };
}

export function stubJpdbFetchRoutes(routes: Record<string, string>) {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
        const url = unproxiedFetchTarget(input);
        const html = routes[url];
        if (html === undefined) return Promise.reject(new Error(`unexpected fetch: ${url}`));
        return Promise.resolve(new Response(html, { status: 200 }));
    });
    vi.stubGlobal('location', {
        href: 'https://jpdb.io/',
        origin: 'https://jpdb.io',
        hostname: 'jpdb.io',
        pathname: '/',
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

export function graphNodeDataPosition(html: string, id: string): KanjiGraphPoint {
    return {
        x: graphNodeNumberAttribute(html, id, 'x'),
        y: graphNodeNumberAttribute(html, id, 'y'),
    };
}

export function graphNodeDataGeometry(html: string, id: string): KanjiGraphGeometry {
    return {
        ...graphNodeDataPosition(html, id),
        rx: graphNodeNumberAttribute(html, id, 'rx'),
        ry: graphNodeNumberAttribute(html, id, 'ry'),
    };
}

function graphNodeNumberAttribute(html: string, id: string, attribute: string): number {
    const match = new RegExp(`data-graph-node="${id}"[^>]+data-${attribute}="([^"]+)"`, 'u').exec(html);
    expect(match).not.toBeNull();
    return Number(match?.[1]);
}

export function graphNodeStylePosition(html: string, id: string): KanjiGraphPoint {
    const match = new RegExp(`data-graph-node="${id}"[^>]+style="left:([\\d.]+)%;top:([\\d.]+)%`, 'u').exec(html);
    expect(match).not.toBeNull();
    return { x: Number(match?.[1]), y: Number(match?.[2]) };
}

export function testAnkiClient(settings: Partial<typeof DEFAULT_SETTINGS> = {}): AnkiConnectClient {
    return new AnkiConnectClient(() => ({
        ...DEFAULT_SETTINGS,
        ankiEnabled: true,
        ankiMobileHandoff: false,
        ...settings,
    }));
}

export function testImportedCoreStatusIndexResult(request: TestAnkiConnectRequest, options: {
    word?: string;
    reading?: string;
    meaning?: string;
    noteId?: number;
    cardIds?: number[];
    dueCardIds?: number[];
    deckName?: string;
    modelName?: string;
    reps?: number;
    lapses?: number;
} = {}): unknown {
    const {
        word = '読む',
        reading = 'よむ',
        meaning = 'to read',
        noteId = 55,
        cardIds = [7701],
        dueCardIds = cardIds,
        deckName = 'Imported Core',
        modelName = 'Imported Core',
        reps = 12,
        lapses = 0,
    } = options;
    const query = String(request.params?.query ?? '');
    const resultByAction: Record<string, unknown> = {
        version: 6,
        deckNames: [deckName],
        getDeckStats: { 1: { name: deckName, total_in_deck: cardIds.length } },
        findCards: query === 'deck:*' ? cardIds : query.includes('is:due') ? dueCardIds : [],
        findNotes: [noteId],
        cardsInfo: cardIds.map(cardId => ({
            cardId,
            note: noteId,
            deckName,
            queue: dueCardIds.includes(cardId) ? 2 : 0,
            type: dueCardIds.includes(cardId) ? 2 : 0,
            due: 0,
            reps,
            lapses,
        })),
        notesInfo: [{
            noteId,
            modelName,
            tags: [],
            fields: {
                Word: { value: word },
                Reading: { value: reading },
                ...(meaning ? { Meaning: { value: meaning } } : {}),
            },
            cards: cardIds,
        }],
    };
    return resultByAction[request.action] ?? null;
}

export function stubRenderedAnkiMediaLookup(question: string): TestAnkiConnectRequest[] {
    return stubTestAnkiConnectResponses(request => {
        if (request.action === 'multi') {
            return testAnkiConnectMultiResponse(request, action => (
                action.params.query.includes('写真') || action.params.query.includes('しゃしん') ? [55] : []
            ));
        }
        const resultByAction: Record<string, unknown> = {
            notesInfo: [{
                noteId: 55,
                modelName: 'Imported Core',
                tags: [],
                fields: {
                    Word: { value: '写真' },
                    Reading: { value: 'しゃしん' },
                    Meaning: { value: 'photograph' },
                },
                cards: [7701],
            }],
            cardsInfo: [{
                cardId: 7701,
                note: 55,
                deckName: 'Mining',
                queue: 0,
                type: 0,
                reps: 0,
                lapses: 0,
                question,
                answer: '<div>photograph</div>',
            }],
            retrieveMediaFile: 'image-data',
        };
        return testAnkiConnectRawResponse(resultByAction[request.action] ?? null);
    });
}

export function stubDueReadAnkiLookup(matchTerm: string): TestAnkiConnectRequest[] {
    return stubTestAnkiConnectResults(request => {
        if (request.action === 'multi') {
            const actions = request.params.actions as TestAnkiConnectMultiAction[];
            return actions.map(action => ({
                result: action.params.query.includes(matchTerm) ? [55] : [],
                error: null,
            }));
        }
        return request.action === 'areDue'
            ? [true]
            : testImportedCoreStatusIndexResult(request, { deckName: 'Anime::Mining' });
    });
}

export function installFirefoxXrayUserscriptBridge(request: UserscriptHttpRequest): {
    bridgeRequest: UserscriptHttpRequest | undefined;
    cloneInto: ReturnType<typeof vi.fn>;
} {
    const cloneInto = vi.fn((value: unknown) => (
        value && typeof value === 'object'
            ? structuredClone(value)
            : value
    ));
    vi.stubGlobal('location', { href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html' });
    vi.stubGlobal('GM_xmlhttpRequest', request);
    vi.stubGlobal('GM', undefined);
    vi.stubGlobal('cloneInto', cloneInto);
    delete document.documentElement.dataset.yomuUserscriptHttpBridge;

    installUserscriptHttpBridge();
    vi.stubGlobal('GM_xmlhttpRequest', undefined);

    return { bridgeRequest: getUserscriptHttpRequest(), cloneInto };
}

export function testReadCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        ...card,
        spelling: '読む',
        reading: 'よむ',
        meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
        ...overrides,
    };
}

export function testFallbackCard(overrides: Partial<JPDBCard> & Pick<JPDBCard, 'vid' | 'sid' | 'spelling'>): JPDBCard {
    return {
        ...card,
        rid: 0,
        reading: '',
        source: 'fallback',
        pitchAccent: [],
        ...overrides,
    };
}

export function testPublicCard(overrides: Partial<JPDBCard> & Pick<JPDBCard, 'vid' | 'spelling' | 'reading'>): JPDBCard {
    return {
        ...card,
        sid: 0,
        rid: 0,
        source: 'jpdb',
        ...overrides,
    };
}

export function testAozoraCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return testPublicCard({
        vid: 1381470,
        spelling: '青空',
        reading: 'あおぞら',
        pitchAccent: [],
        ...overrides,
    });
}

export function createFallbackShowCardBoundaryFixture(
    app: ReaderApp,
    resolveLookupCard: (lookupCard: JPDBCard) => PromiseLike<JPDBCard>,
) {
    const fallbackCard = testFallbackCard({
        vid: -1,
        sid: -1,
        spelling: '青空',
        reading: '青空',
    });
    const updateWord = vi.fn();
    const clearKanji = vi.fn();
    const load = vi.fn(() => ({
        localEntries: Promise.resolve([]),
        all: Promise.resolve({
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
        }),
    }));
    const mountInitialCardShell = vi.fn(async () => null);
    const internals = app as unknown as {
        cardLookup: { resolveLookupCard: typeof resolveLookupCard };
        createPopover(): HTMLElement;
        navigation: { updateWord: typeof updateWord; clearKanji: typeof clearKanji };
        rememberCardMiningContext(): void;
        maybePreloadLookupCardAudio(): void;
        cardRenderData: { load: typeof load };
        mountInitialCardShell: typeof mountInitialCardShell;
        showCard(card: JPDBCard, sentence?: string): Promise<void>;
    };
    internals.cardLookup.resolveLookupCard = resolveLookupCard;
    internals.createPopover = () => document.createElement('div');
    internals.navigation = { updateWord, clearKanji };
    internals.rememberCardMiningContext = vi.fn();
    internals.maybePreloadLookupCardAudio = vi.fn();
    internals.cardRenderData = { load };
    internals.mountInitialCardShell = mountInitialCardShell;

    return { fallbackCard, internals, load, mountInitialCardShell, updateWord };
}

export function appendRenderedReaderWord(
    lookupCard: JPDBCard,
    options: { className?: string; parent?: HTMLElement; text?: string; tokenStart?: number; tokenEnd?: number } = {},
): HTMLSpanElement {
    const {
        className = 'jpdb-reader-word jpdb-pitch-unknown',
        parent = document.body,
        text = lookupCard.spelling,
        tokenStart = 0,
    } = options;
    const { tokenEnd = tokenStart + text.length } = options;
    const word = document.createElement('span');
    word.className = className;
    registerRenderedWordPrivateState(
        word,
        renderedWordPrivateStateForCard(lookupCard, primaryCardState(lookupCard.cardState)),
    );
    // A few trusted-surface assertions inspect the projection directly.
    // The private binding above is the authoritative production identity.
    word.dataset.vid = String(lookupCard.vid);
    word.dataset.sid = String(lookupCard.sid);
    word.textContent = text;
    // Production words carry their token span (renderToken stamps it), and
    // span-keyed repaints filter on it. Default to the span testTokenForCard
    // derives for the same card so fixtures stay aligned with real markup.
    word.dataset.tokenStart = String(tokenStart);
    word.dataset.tokenEnd = String(tokenEnd);
    parent.append(word);
    return word;
}

export function appendKnownAnkiRenderedWord(
    lookupCard: JPDBCard,
    options: { parent?: HTMLElement; contrastVars?: string[] } = {},
): HTMLSpanElement {
    const word = appendRenderedReaderWord(lookupCard, {
        className: 'jpdb-reader-word jpdb-not-in-deck anki-known',
        parent: options.parent,
    });
    updateRenderedWordPrivateState(word, { ankiState: 'known', ankiDecks: 'Mining' });
    word.dataset.vid = String(lookupCard.vid);
    word.dataset.sid = String(lookupCard.sid);
    word.dataset.ankiState = 'known';
    word.dataset.ankiDecks = 'Mining';
    options.contrastVars?.forEach(name => word.style.setProperty(name, '#58a6ff'));
    return word;
}

export function createRepeatedAnkiWordCacheFixture(options: {
    uniqueCount: number;
    repeatCount: number;
    vidStart: number;
    spellingPrefix: string;
    reading: string;
    noteIdStart: number;
}) {
    const container = document.createElement('div');
    const cards: JPDBCard[] = Array.from({ length: options.uniqueCount }, (_, index): JPDBCard => ({
        ...card,
        vid: options.vidStart - index,
        sid: -index - 1,
        rid: 0,
        spelling: `${options.spellingPrefix}${index}`,
        reading: options.reading,
        source: 'local',
    }));
    for (let repeat = 0; repeat < options.repeatCount; repeat += 1) {
        for (const lookupCard of cards) {
            appendRenderedReaderWord(lookupCard, {
                className: 'jpdb-reader-word jpdb-not-in-deck',
                parent: container,
            });
        }
    }
    document.body.append(container);
    const findCachedStatusBatch = vi.fn(async (lookupCards: JPDBCard[]): Promise<AnkiLookupResult[]> => lookupCards.map((lookupCard, index) => ({
        state: 'known',
        notes: [],
        primary: {
            noteId: options.noteIdStart + index,
            primaryCardId: 9900 + index,
            cardIds: [9900 + index],
            state: 'known',
            deckNames: ['Cache'],
            modelName: 'Imported Core',
            fields: { Word: lookupCard.spelling },
            tags: [],
            reps: 1,
            lapses: 0,
        },
    })));
    return { container, cards, findCachedStatusBatch };
}

export function appendDeferredPitchPopover(lookupCard: JPDBCard): { popover: HTMLDivElement; originalWord: HTMLElement } {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.innerHTML = `
        <div class="jpdb-reader-popover-body">
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row">
                        <div class="jpdb-reader-spelling jpdb-known jpdb-reader-parseable">
                            <span class="jpdb-reader-word jpdb-pitch-unknown" data-vid="${lookupCard.vid}" data-sid="${lookupCard.sid}" tabindex="-1">${lookupCard.spelling}</span>
                        </div>
                    </div>
                </div>
                <div class="jpdb-reader-card-tools">
                    <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button">Audio</button>
                </div>
            </div>
        </div>
    `;
    document.body.append(popover);
    const originalWord = popover.querySelector<HTMLElement>('.jpdb-reader-spelling .jpdb-reader-word')!;
    registerRenderedWordPrivateState(
        originalWord,
        renderedWordPrivateStateForCard(lookupCard, primaryCardState(lookupCard.cardState)),
    );
    return {
        popover,
        originalWord,
    };
}

export function expectDeferredPitchPopoverUpdated(popover: HTMLElement, originalWord: HTMLElement): void {
    expect(popover.querySelector('.jpdb-reader-spelling .jpdb-reader-word')).toBe(originalWord);
    expect([...originalWord.classList]).toContain('jpdb-pitch-nakadaka');
    expect(popover.querySelector('.jpdb-reader-pitch')).not.toBeNull();
}

export function testTokenForCard(
    lookupCard: JPDBCard,
    sentence?: string,
    overrides: Partial<Omit<JPDBToken, 'card'>> = {},
): JPDBToken {
    const start = overrides.start ?? 0;
    const end = overrides.end ?? lookupCard.spelling.length;
    return {
        card: lookupCard,
        start,
        end,
        length: overrides.length ?? end - start,
        rubies: [],
        pitchClass: '',
        ...(sentence === undefined ? {} : { sentence }),
        ...overrides,
    };
}

export function configurePointerParseTest(app: ReaderApp, options: {
    parse: (texts: string[], options?: unknown) => Promise<JPDBToken[][]>;
    settings?: Partial<ReaderSettings>;
    showLocalPointerTextCandidate?: TestPointerTextInternals['showLocalPointerTextCandidate'];
    showPointerTextCard?: TestPointerTextInternals['showPointerTextCard'];
}): {
    internals: TestPointerTextInternals;
    showLocalPointerTextCandidate: NonNullable<TestPointerTextInternals['showLocalPointerTextCandidate']>;
    showPointerTextCard: TestPointerTextInternals['showPointerTextCard'];
} {
    const showLocalPointerTextCandidate = options.showLocalPointerTextCandidate ?? vi.fn(async () => true);
    const showPointerTextCard = options.showPointerTextCard ?? vi.fn(async () => undefined);
    const internals = pointerTextInternals(app);
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'api-key',
        localDictionariesEnabled: true,
        showPitchAccent: true,
        ...options.settings,
    };
    internals.parser = {
        parse: options.parse,
        // Mirrors ReaderParser.lookupTokenAt so pointer tests keep asserting
        // the parse call while the app goes through the public seam.
        lookupTokenAt: async (
            text: string,
            offset: number,
            range: { start: number; end: number } = { start: 0, end: text.length },
            parseOptions: Record<string, unknown> = {},
        ) => {
            const [tokens] = await options.parse([text], { ...parseOptions, allowSegmentedFallback: true });
            return pickAuthoritativeTokenAt(tokens ?? [], text, offset, range);
        },
        isJpdbBackedCard: testIsJpdbBackedCard,
    };
    internals.showLocalPointerTextCandidate = showLocalPointerTextCandidate;
    internals.showPointerTextCard = showPointerTextCard;
    return { internals, showLocalPointerTextCandidate, showPointerTextCard };
}

export function configureRenderedWordTest(app: ReaderApp, options: {
    cachedCards: JPDBCard[];
    settings?: Partial<ReaderSettings>;
    parseJapanese?: (texts: string[], options?: unknown) => Promise<JPDBToken[][]>;
    publicLookupCard?: TestRenderedWordInternals['publicLookupCard'];
    jitenLookupMany?: TestJitenLookupManyMock;
    showRenderedWordCard?: TestRenderedWordInternals['showRenderedWordCard'];
}): {
    internals: TestRenderedWordInternals;
    publicLookupCard: TestRenderedWordInternals['publicLookupCard'];
    jitenLookupMany: TestJitenLookupManyMock;
    showRenderedWordCard: TestRenderedWordInternals['showRenderedWordCard'];
} {
    const publicLookupCard = options.publicLookupCard ?? vi.fn(async () => undefined);
    const jitenLookupMany = options.jitenLookupMany ?? vi.fn(async (_terms: readonly string[]) => new Map<string, JPDBCard>()) as TestJitenLookupManyMock;
    const showRenderedWordCard = options.showRenderedWordCard ?? vi.fn(async () => undefined);
    const internals = app as unknown as TestRenderedWordInternals;
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jpdbDefinitionsEnabled: true,
        showPitchAccent: true,
        ...options.settings,
    };
    internals.parser.cacheCards(options.cachedCards);
    if (options.parseJapanese) {
        internals.parseJapanese = options.parseJapanese;
        const parse = options.parseJapanese;
        // The rendered-word span path goes through the parser's public seam;
        // mirror ReaderParser.lookupTokenAt over the stubbed parse.
        (internals.parser as unknown as {
            lookupTokenAt: (
                text: string,
                offset: number,
                range?: { start: number; end: number },
                parseOptions?: Record<string, unknown>,
            ) => Promise<JPDBToken | undefined>;
        }).lookupTokenAt = async (text, offset, range = { start: 0, end: text.length }, parseOptions = {}) => {
            const [tokens] = await parse([text], { ...parseOptions, allowSegmentedFallback: true });
            return pickAuthoritativeTokenAt(tokens ?? [], text, offset, range);
        };
    }
    internals.publicLookupCard = publicLookupCard;
    internals.cardLookup.publicLookupCard = publicLookupCard;
    internals.jitenPublicVocabulary = { lookupMany: jitenLookupMany };
    internals.showRenderedWordCard = showRenderedWordCard;
    return { internals, publicLookupCard, jitenLookupMany, showRenderedWordCard };
}


export function expectRenderedKanaModalCard(options: {
    showCard: unknown;
    card: JPDBCard;
    word: HTMLElement;
}): void {
    expect(options.showCard).toHaveBeenCalledWith(
        options.card,
        'にほんごのじかん',
        options.word,
        expect.objectContaining({
            trigger: 'modal',
            navigation: 'reset',
            userGesture: true,
        }),
    );
}

export function configureJitenRenderedWordTest(app: ReaderApp, options: {
    parseJapanese: (texts: string[], options?: unknown) => Promise<JPDBToken[][]>;
    settings?: Partial<ReaderSettings>;
    publicLookupCard?: TestJitenRenderedWordInternals['publicLookupCard'];
    lookupText?: TestJitenRenderedWordInternals['lookupText'];
    showCard?: TestJitenRenderedWordInternals['showCard'];
}): {
    internals: TestJitenRenderedWordInternals;
    publicLookupCard: TestJitenRenderedWordInternals['publicLookupCard'];
    lookupText: TestJitenRenderedWordInternals['lookupText'];
    showCard: TestJitenRenderedWordInternals['showCard'];
} {
    const publicLookupCard = options.publicLookupCard ?? vi.fn(async () => undefined);
    const lookupText = options.lookupText ?? vi.fn(async () => undefined);
    const showCard = options.showCard ?? vi.fn(async () => undefined);
    const internals = app as unknown as TestJitenRenderedWordInternals;
    internals.settings = {
        ...DEFAULT_SETTINGS,
        apiKey: '',
        jitenApiKey: 'jiten-key',
        jpdbDefinitionsEnabled: true,
        showPitchAccent: true,
        ...options.settings,
    };
    internals.parseJapanese = options.parseJapanese;
    const parse = options.parseJapanese;
    // Rendered-word spans resolve through the parser's public seam; mirror
    // ReaderParser.lookupTokenAt over the stubbed parse.
    (internals as unknown as { parser: Record<string, unknown> }).parser.lookupTokenAt = async (
        text: string,
        offset: number,
        range: { start: number; end: number } = { start: 0, end: text.length },
        parseOptions: Record<string, unknown> = {},
    ) => {
        const [tokens] = await parse([text], { ...parseOptions, allowSegmentedFallback: true });
        return pickAuthoritativeTokenAt(tokens ?? [], text, offset, range);
    };
    internals.publicLookupCard = publicLookupCard;
    internals.lookupText = lookupText;
    internals.showCard = showCard;
    return { internals, publicLookupCard, lookupText, showCard };
}

export function configurePublicVocabularyEnrichment(app: ReaderApp, options: {
    search: (term: string, limit?: number) => Promise<JPDBCard[]>;
    settings?: Partial<ReaderSettings>;
    pitch?: (term: string, reading?: string) => Promise<unknown>;
    jitenLookup?: (term: string) => Promise<JPDBCard | null>;
    jitenLookupMany?: (terms: readonly string[]) => Promise<Map<string, JPDBCard>>;
}) {
    const cacheCards = vi.fn();
    const internals = app as unknown as {
        settings: ReaderSettings;
        jpdbVocabulary: { search: typeof options.search };
        jpdbPublicPitch?: { lookup: NonNullable<typeof options.pitch> };
        jitenPublicVocabulary?: {
            lookup: NonNullable<typeof options.jitenLookup>;
            lookupMany?: NonNullable<typeof options.jitenLookupMany>;
        };
        parser: { cacheCards: typeof cacheCards };
        enrichPitchWords(tokens: JPDBToken[], options?: { publicLookupLimit?: number; jpdbPublicLookup?: boolean }): Promise<void>;
        enrichJpdbRelatedWords(root: ParentNode): void;
        cardLookup: {
            publicLookupFallbackCard(card: JPDBCard, options?: { publicLookupTermLimit?: number; jpdbPublicLookup?: boolean }): Promise<JPDBCard | undefined>;
        };
    };
    internals.settings = {
        ...DEFAULT_SETTINGS,
        jpdbDefinitionsEnabled: false,
        showPitchAccent: true,
        ...options.settings,
    };
    internals.jpdbVocabulary = { search: options.search };
    if (options.pitch) internals.jpdbPublicPitch = { lookup: options.pitch };
    internals.jitenPublicVocabulary = {
        lookup: options.jitenLookup ?? vi.fn(async () => null),
        lookupMany: options.jitenLookupMany ?? vi.fn(async () => new Map<string, JPDBCard>()),
    };
    internals.parser = { cacheCards };
    return { cacheCards, internals };
}

export async function expectPublicVocabularyFurigana(settings: Partial<ReaderSettings>): Promise<void> {
    const app = new ReaderApp();
    const fallbackCard = testFallbackCard({
        vid: -1381470,
        sid: -1381470,
        spelling: '青空',
    });
    const publicCard = testPublicCard({
        vid: 1381470,
        spelling: '青空',
        reading: 'あおぞら',
        pitchAccent: ['LHHL'],
    });
    const word = appendRenderedReaderWord(fallbackCard);
    const search = vi.fn(async () => [publicCard]);
    const { internals } = configurePublicVocabularyEnrichment(app, { search, settings });
    const token = testTokenForCard(fallbackCard, '青空を見る。');

    try {
        await internals.enrichPitchWords([token]);

        expectReaderWordFurigana(word, 'あおぞら');
    } finally {
        word.remove();
        app.destroy();
    }
}

export function setupHydratedPopupAnkiLookup(app: ReaderApp, options: {
    lookup: AnkiLookupResult;
    ankiDecks: string[];
    hydrateAnkiLookup: () => Promise<AnkiLookupResult>;
}): {
    popover: HTMLDivElement;
    renderCompletedCardPopover: ReturnType<typeof vi.fn>;
    data: CardRenderData;
    renderData: { hydrateAnkiLookup: () => Promise<AnkiLookupResult> };
    internals: TestHydratedPopupAnkiInternals;
} {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    document.body.append(popover);
    const renderCompletedCardPopover = vi.fn();
    const data: CardRenderData = {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: options.lookup,
        jpdbDecks: [],
        ankiDecks: options.ankiDecks,
        jpdbVocabularyInfo: null,
    };
    const internals = app as unknown as TestHydratedPopupAnkiInternals;
    internals.activePopover = popover;
    internals.settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiSectionEnabled: true };
    internals.renderCompletedCardPopover = renderCompletedCardPopover;
    return { popover, renderCompletedCardPopover, data, renderData: { hydrateAnkiLookup: options.hydrateAnkiLookup }, internals };
}

export async function expectHydratedPopupAnkiRender(options: {
    popover: HTMLElement;
    lookupCard: JPDBCard;
    sentence: string;
    data: CardRenderData;
    renderData: { hydrateAnkiLookup: () => Promise<AnkiLookupResult> };
    internals: TestHydratedPopupAnkiInternals;
    renderCompletedCardPopover: ReturnType<typeof vi.fn>;
    ankiLookup: unknown;
}): Promise<void> {
    options.internals.renderHydratedCardAnkiLookup(
        {
            popover: options.popover,
            card: options.lookupCard,
            sentence: options.sentence,
            trigger: 'modal',
            state: { data: options.data },
            requestId: 1,
            isCurrentHoverCard: () => true,
        },
        options.renderData,
    );

    await vi.waitFor(() => expect(options.renderCompletedCardPopover).toHaveBeenCalled());
    expect(options.renderData.hydrateAnkiLookup).toHaveBeenCalledTimes(1);
    const renderCall = options.renderCompletedCardPopover.mock.calls.at(-1);
    expect(renderCall?.[0]).toBe(options.popover);
    expect(renderCall?.[1]).toBe(options.lookupCard);
    expect(renderCall?.[2]).toBe(options.sentence);
    expect(renderCall?.[3]).toBe('modal');
    expect(renderCall?.[4]).toEqual(expect.objectContaining({ ankiLookup: options.ankiLookup }));
}

export function kanjiGraphPositions(html: string): Map<string, KanjiGraphPoint> {
    return new Map(
        Array.from(html.matchAll(/data-graph-node="([^"]+)".*?data-x="([^"]+)".*?data-y="([^"]+)"/gs))
            .map(match => [match[1], { x: Number(match[2]), y: Number(match[3]) }]),
    );
}

export function kanjiGraphPoint(positions: Map<string, KanjiGraphPoint>, id: string): KanjiGraphPoint {
    const point = positions.get(id);
    expect(point).toBeDefined();
    return point!;
}

export function kanjiGraphDistance(positions: Map<string, KanjiGraphPoint>, firstId: string, secondId: string): number {
    const first = kanjiGraphPoint(positions, firstId);
    const second = kanjiGraphPoint(positions, secondId);
    return Math.hypot(second.x - first.x, second.y - first.y);
}

export function createFallbackOcrImage(text: string): HTMLImageElement {
    const image = document.createElement('img');
    image.src = '/yomu-reader/screenshots/real-popup-lookup.png';
    image.dataset.ocrLines = JSON.stringify([
        { text, box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
    ]);
    Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 1000 },
        naturalHeight: { configurable: true, value: 600 },
    });
    image.getBoundingClientRect = () => testDomRect({ left: 20, top: 80, width: 500, height: 300 });
    return image;
}

function segmentedFallbackParser(dependencies: Partial<ConstructorParameters<typeof ReaderParser>[0]> = {}): ReaderParser {
    return new ReaderParser({
        getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false }),
        jpdb: {} as never,
        dictionaries: {} as never,
        ...dependencies,
    });
}

export async function withFakeSegmenter<T>(
    segments: FakeSegmenterSegments,
    callback: (parser: ReaderParser) => Promise<T> | T,
    dependencies?: Partial<ConstructorParameters<typeof ReaderParser>[0]>,
): Promise<T> {
    const originalSegmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    class FakeSegmenter {
        segment(value: string): FakeSegmenterSegment[] {
            return typeof segments === 'function' ? segments(value) : segments;
        }
    }
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: FakeSegmenter });
    try {
        return await callback(segmentedFallbackParser(dependencies));
    } finally {
        if (originalSegmenter) Object.defineProperty(Intl, 'Segmenter', originalSegmenter);
        else delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    }
}

export async function parseSegmentedFallbackTokens(
    segments: FakeSegmenterSegments,
    text: string,
    dependencies?: Partial<ConstructorParameters<typeof ReaderParser>[0]>,
): Promise<JPDBToken[]> {
    return withFakeSegmenter(segments, async parser => {
        const [tokens] = await parser.parse([text], { allowSegmentedFallback: true });
        return tokens;
    }, dependencies);
}

export function tokenSpellings(tokens: JPDBToken[]): string[] {
    return tokens.map(token => token.card.spelling);
}

export function parsedProviderToken(
    sentence: string,
    surface: string,
    start: number,
    source: JPDBCard['source'],
    spelling = surface,
): JPDBToken {
    return {
        card: {
            ...card,
            vid: source === 'fallback' ? -stableTestId(spelling) : stableTestId(spelling),
            sid: source === 'fallback' ? -stableTestId(`${spelling}:sid`) : stableTestId(`${spelling}:sid`),
            spelling,
            reading: spelling,
            source,
        },
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [],
        pitchClass: '',
        sentence,
    };
}

function stableTestId(value: string): number {
    return Array.from(value).reduce((sum, character) => sum + character.codePointAt(0)!, 1);
}

export function lookupCandidateFromPoint(
    app: ReaderApp,
    x: number,
    y: number,
    target: Element,
    options: { allowPassiveInteractionText?: boolean } = {},
): unknown {
    return (app as unknown as {
        lookupCandidateFromPoint: (
            x: number,
            y: number,
            eventTarget: EventTarget | null,
            options?: { allowPassiveInteractionText?: boolean },
        ) => unknown;
    }).lookupCandidateFromPoint(x, y, target, options);
}

export function withViewport<T>(width: number, height: number, callback: () => T): T {
    return withBrowserViewport(width, height, callback, { visualViewport: true });
}

export function installVisualViewportFixture(init: { height: number; width: number }): {
    restore: () => void;
    viewport: VisualViewport;
} {
    const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const viewport = createVisualViewportFixture(init);
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    return {
        restore: () => restoreWindowDescriptor('visualViewport', viewportDescriptor),
        viewport,
    };
}

export function sourceSummaryClickFixture(detailsHtml: string, installCount = 1): {
    click: MouseEvent;
    controller: DictionarySourceStateController;
    popover: HTMLElement;
} {
    const popover = document.createElement('div');
    popover.innerHTML = detailsHtml;
    const controller = new DictionarySourceStateController({
        getSettings: () => DEFAULT_SETTINGS,
        onStateChange: vi.fn(),
    });
    for (let index = 0; index < installCount; index += 1) {
        controller.installTracking(popover);
    }
    const summary = popover.querySelector<HTMLElement>('summary')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    summary.dispatchEvent(click);
    return { click, controller, popover };
}

export function withImmediateAnimationFrame<T>(callback: () => T): T {
    const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(frame => {
        frame(0);
        return 1;
    });
    try {
        return callback();
    } finally {
        spy.mockRestore();
    }
}

export function mockFloatingButtonRects(left = 700, top = 500, width = 52, height = 52): () => void {
    const spy = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: HTMLButtonElement) {
        const styleLeft = Number.parseFloat(this.style.left);
        const styleTop = Number.parseFloat(this.style.top);
        const x = Number.isFinite(styleLeft) ? styleLeft : left;
        const y = Number.isFinite(styleTop) ? styleTop : top;
        return new DOMRect(x, y, width, height);
    });
    return () => {
        spy.mockRestore();
        // getBoundingClientRect is inherited, so spying it on HTMLButtonElement.prototype
        // leaves a lingering own property after mockRestore. That would shadow the
        // HTMLElement.prototype rect spies later tests rely on (making every <button>
        // report a 0x0 rect), so remove it to fully restore the inherited lookup.
        restoreInheritedButtonRectLookup();
    };
}

export function stubFloatingButtonActions(overrides: Partial<FloatingButtonActions> = {}): FloatingButtonActions {
    return {
        openSettings: vi.fn(),
        openStudyPage: vi.fn(),
        cyclePowerState: vi.fn(async () => undefined),
        powerState: () => 'on',
        isPaused: () => false,
        toggleOcrMode: vi.fn(),
        ocrMode: () => 'auto',
        toggleAutoPlayAudio: vi.fn(),
        isAutoPlayAudioEnabled: () => true,
        toggleJapaneseSiteLanguage: vi.fn(),
        isYouTube: () => false,
        toggleYoutubeFilter: vi.fn(),
        isYoutubeFilterEnabled: () => false,
        toggleAutoSubtitles: vi.fn(),
        isAutoSubtitlesEnabled: () => true,
        hasSubtitleVideo: () => false,
        ...overrides,
    };
}

export function restoreInheritedButtonRectLookup(): void {
    if (Object.prototype.hasOwnProperty.call(HTMLButtonElement.prototype, 'getBoundingClientRect')) {
        delete (HTMLButtonElement.prototype as unknown as Record<string, unknown>).getBoundingClientRect;
    }
}

export function sizedPopover(width: number, height: number): HTMLElement {
    const popover = document.createElement('div');
    Object.defineProperty(popover, 'offsetWidth', { configurable: true, value: width });
    Object.defineProperty(popover, 'offsetHeight', { configurable: true, value: height });
    document.body.append(popover);
    return popover;
}

export function mockHtmlAudioPlayback(played: string[], loopStates?: boolean[]): () => void {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(this: HTMLMediaElement) {
        played.push(this.src);
        loopStates?.push(this.loop);
        return Promise.resolve();
    });
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    return () => {
        playSpy.mockRestore();
        pauseSpy.mockRestore();
        loadSpy.mockRestore();
    };
}

export type MockAudioPlaybackEnvironmentOptions = {
    randomValue?: number;
    objectUrl?: string | ((blob: Blob) => string);
    loopStates?: boolean[];
};

export function mockObjectUrls(createObjectUrl: (blob: Blob) => string): () => void {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: vi.fn(createObjectUrl),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
    });
    return () => {
        if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor);
        else delete (URL as unknown as Record<string, unknown>).createObjectURL;
        if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
        else delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
    };
}

export function stubAudioConstructorPlayback(played: string[]): void {
    class FakeAudio {
        preload = '';
        constructor(public src: string) {}
        play(): Promise<void> {
            played.push(this.src);
            return Promise.resolve();
        }
        pause(): void {}
    }
    vi.stubGlobal('Audio', FakeAudio);
}

export function testAudioBlob(): Blob {
    return new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' });
}

export function stubCustomJsonAudioRequests(options: {
    audioUrl?: string;
    onSourceRequest?: () => void;
    onBlobRequest?: () => void;
} = {}): void {
    vi.stubGlobal('GM', {
        xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
            if (details.responseType === 'text') {
                options.onSourceRequest?.();
                const response = JSON.stringify({
                    audioSources: [{ url: options.audioUrl ?? 'http://x.test/audio.mp3' }],
                });
                details.onload?.({ status: 200, response, responseText: response });
                return;
            }
            options.onBlobRequest?.();
            details.onload?.({ status: 200, response: testAudioBlob() });
        },
    });
}

export function stubCustomJsonBlobPlayback() {
    const played: string[] = [];
    const requests = { source: 0, blob: 0 };
    const restoreMedia = mockHtmlAudioPlayback(played);
    const restoreObjectUrls = mockObjectUrls(() => 'blob:http://localhost/audio.mp3');
    stubCustomJsonAudioRequests({
        onSourceRequest: () => { requests.source += 1; },
        onBlobRequest: () => { requests.blob += 1; },
    });
    return {
        played,
        requests,
        restore: () => {
            restoreObjectUrls();
            restoreMedia();
            vi.unstubAllGlobals();
        },
    };
}

export function mockAudioPlaybackEnvironment(
    played: string[],
    options: MockAudioPlaybackEnvironmentOptions = {},
): () => void {
    const restoreMedia = mockHtmlAudioPlayback(played, options.loopStates);
    const randomSpy = options.randomValue === undefined
        ? undefined
        : vi.spyOn(Math, 'random').mockReturnValue(options.randomValue);
    const objectUrl = options.objectUrl;
    const restoreObjectUrls = objectUrl === undefined
        ? undefined
        : mockObjectUrls(typeof objectUrl === 'function' ? objectUrl : () => objectUrl);
    return () => {
        restoreObjectUrls?.();
        randomSpy?.mockRestore();
        restoreMedia();
    };
}

export function mockSpeechSynthesis(spoken: string[], voices: SpeechSynthesisVoice[] = []): void {
    class FakeSpeechSynthesisUtterance {
        lang = '';
        voice: SpeechSynthesisVoice | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;

        constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeSpeechSynthesisUtterance);
    vi.stubGlobal('speechSynthesis', {
        cancel: vi.fn(),
        getVoices: vi.fn(() => voices),
        speak: vi.fn((utterance: FakeSpeechSynthesisUtterance) => {
            spoken.push(utterance.text);
            utterance.onend?.();
        }),
    });
}

export function unproxiedFetchTarget(input: RequestInfo | URL): string {
    const value = String(input);
    try {
        const url = new URL(value);
        const proxy = new URL(TEST_PROXY_URL);
        const isTestProxy = url.origin === proxy.origin && url.pathname === proxy.pathname;
        const isBuiltInProxy = url.hostname === 'edge.yomureader.com'
            || url.hostname === 'yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';
        return isTestProxy || isBuiltInProxy
            ? url.searchParams.get('url') ?? value
            : value;
    } catch {
        return value;
    }
}

export function encodedJpdbOggHeader(): ArrayBuffer {
    const encoded = new Uint8Array([0x4f, 0x67, 0x67, 0x53].map((byte, index) => byte ^ [0x06, 0x23, 0x54, 0x0f][index]));
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

export function mockJpdbVocabularyAudioFetch(requested: string[], jpdbHtml: string, encodedOggHeader: BodyInit = encodedJpdbOggHeader()): void {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
        const target = unproxiedFetchTarget(input);
        requested.push(target);
        return Promise.resolve(target.includes('/static/v/')
            ? new Response(encodedOggHeader, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
            : new Response(jpdbHtml, { status: 200 }));
    }));
}

export function setupJpdbWordVoicePlayback(options: {
    dataAudio: string;
    objectUrl: string;
    randomValue: number;
}) {
    const played: string[] = [];
    const requested: string[] = [];
    const restoreAudio = mockAudioPlaybackEnvironment(played, {
        randomValue: options.randomValue,
        objectUrl: options.objectUrl,
    });
    mockJpdbVocabularyAudioFetch(requested, `
        <link rel="canonical" href="https://jpdb.io/vocabulary/1/食べる/たべる">
        <a class="icon-link vocabulary-audio" href="#" data-audio="${options.dataAudio}"></a>
    `);
    const player = new AudioPlayer(() => ({
        ...DEFAULT_SETTINGS,
        audioEnableDefaultSources: false,
        audioSelectionMode: 'first',
        audioFallbackChimeEnabled: false,
        audioSources: [{ type: 'jpdb-tts', url: '', voice: '', enabled: true }],
    }));
    return { played, requested, restoreAudio, player };
}

export function mockJpdbOggAudioFetch(requested: string[]): void {
    const encodedOggHeader = encodedJpdbOggHeader();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
        const target = unproxiedFetchTarget(input);
        requested.push(target);
        return Promise.resolve(new Response(encodedOggHeader, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }));
    }));
}

export function mockProxyAudioBlobFetch(errorPrefix = 'unexpected fetch') {
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith(TEST_PROXY_URL)) {
            return Promise.resolve({
                ok: true,
                status: 200,
                blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
            } as Response);
        }
        return Promise.reject(new Error(`${errorPrefix}: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

export function resolveUserscriptTextResponse(details: Parameters<UserscriptHttpRequest>[0], responseText: string): void {
    details.onload?.({ status: 200, response: responseText, responseText });
}

export function resolveUserscriptBlobResponse(
    details: Parameters<UserscriptHttpRequest>[0],
    body: BlobPart[] = ['audio'],
    type = 'audio/mpeg',
): void {
    details.onload?.({ status: 200, response: new Blob(body, { type }) });
}

export function stubJishoAudioPlayback(objectUrl: string, responseText: string) {
    const played: string[] = [];
    const requested: string[] = [];
    const restoreMedia = mockHtmlAudioPlayback(played);
    const restoreObjectUrls = mockObjectUrls(() => objectUrl);
    vi.stubGlobal('GM', {
        xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
            requested.push(details.url);
            if (details.responseType === 'text') {
                resolveUserscriptTextResponse(details, responseText);
                return;
            }
            resolveUserscriptBlobResponse(details);
        },
    });
    return {
        played,
        requested,
        restore: () => {
            restoreObjectUrls();
            restoreMedia();
            vi.unstubAllGlobals();
        },
    };
}

export function testBlobAudioPlayerForSources(audioSources: AudioSourceSetting | AudioSourceSetting[]): AudioPlayer {
    return new AudioPlayer(() => ({
        ...DEFAULT_SETTINGS,
        audioEnableDefaultSources: false,
        audioViaBlob: true,
        audioFallbackChimeEnabled: false,
        audioSources: Array.isArray(audioSources) ? audioSources : [audioSources],
    }));
}

export function testJpdbSentenceAudioPlayer(): AudioPlayer {
    return new AudioPlayer(() => ({
        ...DEFAULT_SETTINGS,
        audioEnableDefaultSources: false,
        audioSelectionMode: 'first',
        audioFallbackChimeEnabled: false,
    }));
}

export function mockAudioBlobUserscriptRequest(recordRequest?: (details: Parameters<UserscriptHttpRequest>[0]) => void): void {
    vi.stubGlobal('GM', {
        xmlHttpRequest: (details: Parameters<UserscriptHttpRequest>[0]) => {
            recordRequest?.(details);
            details.onload?.({ status: 200, response: new Blob(['audio'], { type: 'audio/mpeg' }) });
        },
    });
}

export function mockAppleMobileBrowser(): () => void {
    const ownUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    const ownPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
    Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    });
    Object.defineProperty(navigator, 'platform', {
        configurable: true,
        value: 'iPad',
    });
    return () => {
        if (ownUserAgent) Object.defineProperty(navigator, 'userAgent', ownUserAgent);
        else delete (navigator as unknown as Record<string, unknown>).userAgent;
        if (ownPlatform) Object.defineProperty(navigator, 'platform', ownPlatform);
        else delete (navigator as unknown as Record<string, unknown>).platform;
    };
}


export function withWindowProperty<T>(key: keyof Window, value: unknown, callback: () => T): T {
    const descriptor = Object.getOwnPropertyDescriptor(window, key);
    Object.defineProperty(window, key, {
        configurable: true,
        value,
    });
    try {
        return callback();
    } finally {
        if (descriptor) Object.defineProperty(window, key, descriptor);
        else delete (window as unknown as Record<string, unknown>)[key as string];
    }
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

export function deleteAnkiStatusIndexDatabase(): Promise<void> {
    return new Promise(resolve => {
        const request = indexedDB.deleteDatabase('yomu-anki-status-index');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

export function registerReaderHelpersCleanup(): void {
    beforeEach(async () => {
        localStorage.clear();
        sessionStorage.clear();
        // Topic files exercise ReaderApp internals directly, bypassing the
        // normal boot barrier that certifies reset-epoch-scoped web storage.
        await ensureManagedWebStorageCurrent();
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        restoreInheritedButtonRectLookup();
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    afterEach(() => {
        uninstallUserscriptHttpBridge();
        vi.restoreAllMocks();
        restoreInheritedButtonRectLookup();
        vi.unstubAllGlobals();
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });
}

export function stubSharedReaderSettings(overrides: Record<string, unknown>): void {
    const stored = { ...DEFAULT_SETTINGS, ...overrides };
    vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) =>
        key === SETTINGS_STORAGE_KEY ? structuredClone(stored) : fallback));
}

// Re-exported source symbols so topic files import everything from ./fixtures.
export {
    AUTO_SCAN_OBSERVER_OPTIONS,
    AnkiConnectClient,
    AnkiDuplicateNoteError,
    AudioPlayer,
    BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
    CardActionController,
    CardPopoverRenderer,
    CardRenderDataLoader,
    DEFAULT_AUDIO_SOURCES,
    DictionarySourceStateController,
    FloatingButtonController,
    IMMERSION_KIT_SOURCE_ID,
    ImageOcrController,
    ImmersionKitClient,
    ImmersionPopoverController,
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    JpdbClient,
    JpdbKanjiClient,
    JpdbPublicPitchClient,
    JpdbVocabularyClient,
    KANJI_STROKE_SOURCE_ID,
    Logger,
    NEW_TAB_PAGE_URL,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    NewTabController,
    NewTabRuntime,
    ObjectUrlCache,
    PITCH_ENRICHMENT_LIMIT,
    PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT,
    PublicProxyWorker,
    RECOMMENDED_JAPANESE_DICTIONARIES,
    ReaderApp,
    ReaderAudioActions,
    ReaderParser,
    SETTINGS_CHANGE_EVENT,
    SETTINGS_STORAGE_KEY,
    SITE_PARSER_PROFILES,
    STUDY_GRAMMAR_SOURCE_ID,
    STUDY_TRANSLATION_SOURCE_ID,
    ShuffledAudioDeck,
    StudySourceController,
    USERSCRIPT_HTTP_BRIDGE_READY_EVENT,
    YOMU_MODEL_FIELDS,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_PAGE_BUDGET,
    YOUTUBE_PUBLIC_PITCH_ENRICHMENT_TOTAL_LIMIT,
    YomitanDictionaryStore,
    allowsFrequentVisibleAutoScan,
    allowsGenericVisibleAutoScan,
    applySubtitleNativeTrackModes,
    applyTokensToScanTarget,
    applyTokensToTextNode,
    applyUrlBootstrapSettings,
    buildKanjiFacts,
    buildKanjiOriginGraph,
    buildNewTabPalette,
    buildYomuAnkiFields,
    bindPrivateCommandCapability,
    collectFragmentTextTargetsIn,
    collectPageSubtitleSources,
    collectScanTargets,
    collectSiteScanTargets,
    collectTextTargetsIn,
    compareSubtitleTrackOptions,
    computeSubtitleDrawerLayout,
    createAudioPreviewCard,
    createPageMediaUrl,
    createPointerEvent,
    createReaderBackdrop,
    createReaderPopover,
    createSubtitleVideoInsetAdapter,
    currentLocalDictionaryTargets,
    currentPageTermTarget,
    decodeJpdbAudioBlob,
    defaultDictionaryLookupLinks,
    definitionSourceRows,
    definitionSourceStateKey,
    deinflectJapaneseTerm,
    detectGrammarHints,
    discoverYouTubeCaptionTracks,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    expectSettingsDialogStillMounted,
    expectStackedLookupOverSettings,
    fallbackDictionaryLookupTermsForText,
    fallbackLookupTermAtOffset,
    fetchWithCorsFallbacks,
    findActiveSubtitleCue,
    findAudioUrl,
    findAudioUrls,
    findRecommendedDictionary,
    formatAudioUrl,
    formatMetaFrequency,
    formatPartOfSpeech,
    getAudioCandidates,
    getMatchingSiteParsers,
    getUserscriptHttpRequest,
    getYouTubeCaptionTracks,
    getYouTubeVideoId,
    glossaryToHtml,
    glossaryToText,
    glossaryValueToSearchText,
    groupTermEntriesByHeadword,
    installMiningDrawerHandle,
    installSettingsDrawerHandle,
    installSheetCloseButton,
    installSheetHandle,
    installUserscriptHttpBridge,
    installUserscriptHttpBridgeWhenReady,
    isAllowedPublicProxyTarget,
    isCurrentKanjiSurface,
    isEnglishSubtitleTrack,
    isTargetLanguageSubtitleTrack,
    isKanjiReviewBack,
    isKanjiReviewFront,
    isUnavailableJapanesePod101Audio,
    isYomuHostedAppUrl,
    isYomuHostedPassivePage,
    isYomuNewTabUrl,
    jpdbAudioRequest,
    jpdbFirstParseOptions,
    jpdbParseResultToTokens,
    jpdbVocabularyToCards,
    kanjiSourceRows,
    loadSettings,
    loadSubtitleTrackCues,
    loadYouTubeTrackCues,
    localDictionaryLookupVariants,
    localizeSettingsForm,
    matchesShortcut,
    mergeSimilarKanjiWords,
    mockElementBoundingClientRect,
    mutationLooksLikeReaderRenderRejection,
    mutationMayAffectJpdbPageEnhancements,
    mutationMayContainJapaneseText,
    nearestReadableSentenceForElement,
    normalizeAudioSources,
    normalizeDictionaryLookupLinks,
    normalizeJpdbAudioIds,
    normalizeOcrProvider,
    normalizeOcrResult,
    normalizeReaderSettings,
    normalizeSubtitleCues,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
    parseGoogleLensUploadHtml,
    parseJpdbAudioData,
    parseJpdbKanjiHtml,
    parseJpdbPublicPitchHtml,
    parseJpdbReviewCardValue,
    parseJpdbSearchHtml,
    parseJpdbVocabularyHtml,
    parseKanjiMapInfo,
    parseKanjiVGSvg,
    parseRtkSearchIndex,
    parseSubtitleText,
    parseYomitanSettingsExport,
    planTranscriptHydrationIndexes,
    pointerTextLookupFromTextNode,
    positionPopover,
    proxyUrlCandidates,
    readDictionaryLookupLinks,
    readFallbackOcrResult,
    readCardCommandCapability,
    readFileSync,
    readFormSettings,
    registerRenderedWordPrivateState,
    readerRenderRejectionRescanDelay,
    readerTextMirrorForSource,
    readerWordAtPointInScope,
    readerWordsForSource,
    readerWordSurfaceText,
    readTokenChoiceCommandCapability,
    renderAudioSourceEditor,
    renderDefinitionSourcesStack,
    renderDictionaryLookupLinkEditor,
    renderDictionaryScopedStyles,
    renderDictionarySourceRows,
    renderGrammarHints,
    renderJpdbDefinitionSource,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderKanjiSourceMounts,
    renderKanjiSourceRows,
    renderLocalDefinitionSourcesSection,
    renderPitch,
    renderRecommendedDictionaries,
    renderRtkInfo,
    renderSettingsForm,
    renderControllerPrimarySubtitle,
    renderSubtitlePrimary,
    renderTokensToHtml,
    renderedWordPrivateStateForCard,
    renderedWordPrivateValue,
    renderWordPills,
    resolveAnkiWordAudio,
    resolveNewTabBrandAssets,
    restoreWindowDescriptor,
    sanitizeAccentColor,
    NO_EXPLICIT_USER_CHOICE,
    saveSettings,
    searchWordDetailHtml,
    shouldReplaceWaitingNativeTrack,
    shouldUseSheet,
    setInnerHtml,
    splitJapaneseSentences,
    stubInstantIntersectionObserver,
    summarizeLearnerGlossary,
    syncStickyBottomSheetAvailability,
    termRulesMatch,
    testDomRect,
    tokensOverlappingSelection,
    translateJapaneseSentence,
    unwrapReaderWords,
    updateDictionaryLookupLinkEditor,
    updatePopoverReviewTargetSelection,
    visibleAutoScanInitialDelay,
    visibleAutoScanMutationDelay,
    visibleJpdbKanjiActions,
    waitForExpect,
    withBrowserViewport,
    yomitanZipBlob,
};
export type {
    AnkiExistingNote,
    AnkiLookupResult,
    AudioSourceSetting,
    CardPopoverRendererDependencies,
    CardRenderData,
    FloatingButtonActions,
    ImmersionKitExample,
    JPDBCard,
    JPDBRawToken,
    JPDBToken,
    JitenApiClient,
    JitenKanjiInfo,
    LocalDictionaryTarget,
    MiningContext,
    NewTabSearchDetailViewContext,
    ReaderSettings,
    ScanTextTarget,
    SubtitleTrackLoadable,
    YomitanTermEntry,
};
