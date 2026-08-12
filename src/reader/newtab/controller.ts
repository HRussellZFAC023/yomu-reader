import {
    browseSourceForCard,
    filterBrowseCards,
    renderBrowseChips,
    renderBrowseControls,
    renderBrowseList,
    renderBrowseSourceChips,
    sortBrowseCards,
    type BrowseFilter,
    type BrowseSortKey,
    type BrowseSourceFilter,
    type BrowseSourceChip,
} from './browse-view';
import {
    searchCardStateLabel,
} from './search-view';
import { normalizeCardStates, primaryCardState } from '../cards/state';
import { isPlainReadingRedundantForHeadword, renderCardSpellingWithFurigana } from '../cards/reading-display';
import { isJitenBackedCard } from '../cards/srs-providers';
import type { CardRenderData, CardRenderDataLoadOptions } from '../cards/render-data';
import { isCardHighlightWord } from '../cards/highlight';
import { loadCachedParsedTokens, type ParsedTokenCacheEntry } from '../core/parsed-token-cache';
import { ACADEMY_SRS_LABEL, APP_NAME, DISCORD_INVITE_URL, DOCS_BASE_URL, GITHUB_REPOSITORY_URL, IMMERSION_KIT_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, SUPPORT_STATUS_URL } from '../app/constants';
import { studyShellNavRoutes, type HostedShellNavLink } from '../app/site-nav';
import { escapeHtml, htmlToFirstElement, renderedWordPrivateValue, setInnerHtml } from '../dom';
import { el, replaceChildrenWith } from '../dom/builder';
import { appendComposedOfLine as renderComposedOfLine } from './composed-of';
import { renderJitenKanjiBackingWord as renderJitenKanjiBackingWordView } from './jiten-kanji-backing-word';
import { NestedCommandRouter } from './nested-command-router';
import { pointInElementClientRects } from '../dom/pointer-geometry';
import { bindRenderedWordCardIdentity, preserveRenderedWordSentence, renderedWordHasCardIdentity, renderedWordSourceVisualClass, renderedWordTextIdentityMatches, replaceRenderedWordStateAndPitchClasses } from '../dom/rendered-word-policy';
import { renderedWordCardForLookup } from '../main/rendered-word-lookup';
import { cardPronunciationReading, isKanjiCharacter, renderPitch } from '../popup/pitch';
import { eventTargetElement } from '../dom/target';
import { isImmersionKitRateLimitError, type ImmersionKitClient, type ImmersionKitExample, type ImmersionKitSearchOptions } from '../immersion/kit';
import { nextImmersionExampleIndex, renderImmersionExampleToolbar } from '../immersion/player-view';
import { renderImmersionSearchLinks } from '../immersion/search-links';
import { waitForIdle as waitForBrowserIdle } from '../platform/idle';
import type { AnkiExistingNote, AnkiLookupResult } from '../anki';
import { collectAnkiReviewTargetLabels, compactAnkiReviewTargetLabel } from '../anki/review-targets';
import {
    IMMERSION_FALLBACK_QUERY_LIMIT,
    immersionFallbackFragments,
    immersionSentenceContainsQuery,
    isUsefulImmersionFallbackQuery,
    shouldFilterImmersionExamplesBySurface,
    uniqueImmersionQueries,
} from '../immersion/query';
import { promiseWithTimeout, runLimited } from '../core/async-utils';
import { OperationTracker } from '../core/operation-token';
import { BoundedMap } from '../core/bounded-map';
import type { JitenApiClient, JitenKanjiInfo, JitenRecentReview, JitenVocabularyInfo } from '../dictionaries/jiten';
import { jitenHistoryCardKey, jitenLatestReviewTimes } from './jiten-review-history';
import {
    jitenKanjiFactRows,
    jitenKanjiReadingRows,
    renderJitenKanjiInfoWithAttributes,
} from '../jiten/jiten-kanji-info-render';
import {
    runJitenKanjiWordsAction,
    type JitenKanjiWordsActionContext,
} from '../jiten/jiten-kanji-words-actions';
import type { JpdbClient } from '../jpdb/jpdb';
import { clearJpdbKanjiClient, jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiClient, type JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import { getPitchClass } from '../jpdb/jpdb-parser';
import type { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph, type KanjiOriginClient, type KanjiSourceInfo } from '../kanji/origin';
import { installKanjiDoodle } from '../kanji/doodle';
import { renderAnkiRenderedCardStudyBody } from '../anki/render';
import { assessKanjiStrokes, SHAPE_PASS_SCORE, type KanjiStrokeAssessment } from '../kanji/stroke-grader';
import type { KanjiVGClient, KanjiVGInfo } from '../kanji/vg';
import type { JpdbReviewBridgeCard, JpdbReviewBridgeClient, JpdbReviewBridgeStatus } from '../jpdb/jpdb-review-bridge';
import { publishCardStateSignal } from '../app/card-state-signal';
import { Logger } from '../app/logger';
import { BUNPRO_FSRS_REVIEW_SHORTCUTS, FIVE_BUTTON_REVIEW_SHORTCUTS, TWO_BUTTON_REVIEW_SHORTCUTS, handleReaderActionPillLink, matchedReviewShortcutGrade } from '../app/main-helpers';
import { canAttemptAudiblePlayback } from '../audio/media-activation';
import { installOriginGraphInteractions } from '../popup/origin-graph-interactions';
import { installLocalTapActivation } from '../ui/pointer-activation';
import { matchesShortcut } from '../settings/index';
import {
    activeLearningTarget,
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
} from '../languages/target-runtime';
import { languageDisplayName } from '../languages/locale';
import {
    targetCanLookupCharacter,
    targetSupportsHandwriting,
    usesJapaneseCharacterStudy,
    usesJapaneseProviders,
} from '../languages/character-lookup';
import {
    bindPrivateCommandCapability,
    readCardCommandCapability,
    readJpdbKanjiCommandCapability,
    type CardCommandCapability,
} from '../dom/private-command-capabilities';
import { localPitchPatternFromMeta } from '../lookup/pitch-meta';
import {
    buildRtkComponentSummaries,
    renderKanjiOrigins,
    renderRtkInfo,
} from '../popup/render';
import { renderKanjiKeywordChips, type KanjiKeywordSource } from '../popup/kanji-keyword-line';
import { kanjiFactProviderTitle, kanjiSourceStateKey, renderKanjiDefinitions } from '../sources/definition-render';
import { speakerIcon } from '../ui/icons';
import {
    cardKey,
    firstCardMeaning,
    isYomuNewTabUrl,
    kanjiCharacters,
    saveNewTabUiState,
    type LegacyNewTabStudyIntent,
    type NewTabRoute,
    type NewTabUiState,
} from './index';
import { NEW_TAB_FILTERS, normalizeNewTabUiState } from './state';
import {
    planStudyCardHistoryUpdate,
    readStudyCardRoute,
    studyCardRouteSignature,
    type PortableStudyCardRoute,
    type StudyCardRoute,
} from './study-card-route';
import {
    newTabImmersionAudioUrls,
    newTabImmersionImageUrl,
    hiddenNewTabStudySentenceSettings,
    renderNewTabFrontSentence,
    renderNewTabImmersionImage,
    renderNewTabImmersionSentence,
    renderNewTabImmersionTranslation,
    renderNewTabSentenceHtml,
    setNewTabImmersionTranslationBlurred,
    syncNewTabImmersionFrameSubtitleSize,
} from './card-view';
import { renderNewTabKanjiInfoSection } from './kanji-render';
import {
    appendNewTabLoadResult,
    autoReviewSourceResults,
    emptyNewTabLoadAccumulator,
    emptyNewTabLoadResult,
    interleavedNewTabLoadAccumulator,
    mergeEmptyNewTabLoadResults,
    newTabLoadAccumulatorFromResult,
    newTabLoadResult,
    type NewTabLoadAccumulator,
    type NewTabLoadResult,
} from './source-orchestrator';
import { newTabSourceLoadPlan, type NewTabConcreteSource, type NewTabSourceLoadPlan } from './source';
import { NewTabStudyPool } from './study-pool';
import { NewTabStatsController, loadNewTabStatsApiProvider, type NewTabStatsApiProvider } from './stats-controller';
import { NewTabSearchController } from './search-controller';
import {
    newTabApiGradeTargetShortLabel,
    newTabGradeTargetLabel,
    newTabKeyHintsRenderable,
    newTabMainGradeTargetOptions,
    renderNewTabGradeControlButtons,
    selectedNewTabMainGradeTarget,
    summarizeNewTabReviewSources,
    updateNewTabMainGradeTargetLabel,
    type NewTabLookupReviewTarget,
    type NewTabLookupReviewTargetSelection,
    type NewTabReviewSourceSummary,
} from './review-controls';
import { buildNewTabRecallCloze, evaluateNewTabRecallAnswer, type NewTabRecallCloze, type NewTabRecallOutcome } from './recall-practice';
import {
    applyTypeWordSelfCheckAction,
    installSelfCheckDoodle,
    mountTypeWordAnswer,
    nextTypeWordHandwritingIndex,
    renderSelfCheckHandwriting,
    renderStrokeFeedbackHandwriting,
    targetSupportsTypeWordHandwriting,
    type TypeWordSelfCheckAction,
    type TypeWordSelfCheckState,
} from './type-word-rendering';
import { normalizeLearningTargetInput } from './typing-input';
import { PitchSrsStore, pitchSeedFromCard, type PitchSrsItem } from './pitch-srs';
import { renderListenCard, type ListenCardView, type ListenOutcome } from './listen-render';
import { scoreSpeakingBlob, type SpeakingPitchScore } from './speaking-score';
import { createNewTabStudySession, type NewTabStudySession, type NewTabStudyStep, type NewTabStudyStepId, type NewTabStudyStepKind } from './study-session';
import { suggestedStudyGrade, type StudyStepOutcome, type StudyStepOutcomes } from './study-outcomes';
import { kanjiDrawHints, recallHints, type StudyHint, type StudyHintStep } from './study-hints';
import { collectPitchVariants, contextPitchPattern, pitchNumberForReading, splitMorae, validPitchPositions } from '../lookup/pitch-accent';
import { installNewTabSwipeGesture, newTabSwipeGrade, type NewTabSwipeAction, type NewTabSwipeDirection, type NewTabSwipeProgress } from './swipe-gesture';
import {
    newTabCardHighlightTargets,
    newTabCardMatchesActiveTarget,
    newTabCardOptionalReading,
    newTabCardReading,
    newTabCardTarget,
    normalizeNewTabCard,
    promoteCardByKey,
    sentenceForCard,
} from './study-queue';
import { firstStudySentenceTier, isCompleteStudySentence, studySentenceTiers } from './study-sentence-source';
import {
    compactFacts,
    doodlePreviewDataUrl,
    fact,
    fallbackSearchKanjiCard,
    firstTruthy,
    heisigFact,
    isKanjiUnlockStudyCard,
    jpdbKanjiVocabularyToNewTabCard,
    keywordCandidates,
    newTabKanjiKeyword,
    newTabKanjiReadings,
    newTabKanjiSourceAttrs,
    newTabKanjiSourceTitle,
    normalizeJpdbKanjiInfo,
    oldFormsFact,
    randomPublicJpdbSeedKanji,
    randomPublicJpdbSeedWords,
    shouldWaitForMoreDoodleStrokes,
    visibleCardKanji,
} from './kanji-helpers';
import {
    dedupeWords,
    jpdbReviewCardsForNewTab,
    normalizeSearchQuery,
    preferMultiCharacterVocabulary,
    newTabDueSummary,
} from './card-selection';
import { liveJpdbCardFromBridgeCard, liveJpdbCardIdentity } from './jpdb-live-card';
import { KanjiDetailSource, type KanjiDetailBundle } from './kanji-detail-source';
import { NewTabGradeQueue, type QueuedNewTabGrade } from './grade-queue';
import { NewTabReviewSubmitter } from './review-submitter';
import { isSessionBunproCard, newTabUndoableReview } from './review-flow-policy';
import { renderNewTabShell } from './shell-view';
import {
    jpdbDeckMembershipName,
    newTabAnkiDeckSelection,
    newTabAnkiDeckSelectorOptions,
    newTabDeckSelectorMode,
    newTabJpdbDeckSelectorModel,
} from './deck-selector-policy';
import {
    jitenScopedDeckId,
    newTabAnkiProviderContext,
    newTabReviewProviderContext,
    newTabReviewProvidersAreCurrent,
    newTabProviderContext,
    newTabProviderContexts,
    newTabSourceCacheSignature,
    type NewTabProviderContexts,
} from './provider-context-policy';
import {
    canBrowseNewTabSrsSource,
    newTabCardsFromSrsQueue,
    newTabCardFromSrsReviewable,
    newTabSrsLoadErrorMessage,
    newTabSrsSourceHasCredential,
    newTabSrsSourceLabel,
    unavailableNewTabSrsLoad,
    type NewTabSrsAdapterSource,
} from './srs-card-adapter';
import {
    cachedBrowsePool,
    isCurrentBrowsePool,
    loadSelectedBrowsePool,
    matchingBrowsePoolLoad,
    providerContextDeckResets,
    reportBrowsePool,
    selectedScopedBrowsePool,
} from './browse-pool-policy';
import { isLocalYomuSrsStorageError } from '../srs/local-yomu';
import { cancelConnectionLostDialog, showConnectionLostDialog, type ConnectionLostChoice } from './connection-lost-dialog';

import { NewTabImmersionAudioPlayer } from './immersion-audio';
import {
    ankiCardKindLabel,
    isJitenSrsCard,
    isPositiveJpdbCard,
    isReviewSource,
    newTabCardSourceLabel,
    NewTabGradeSubmissionError,
    newTabGradeOptions,
    passingNewTabGrade,
    queueableNewTabReviewTargets,
    reviewTargetsForNewTabCard,
    usesBunproFsrsGradeScale,
    usesTwoButtonNewTabGradeScale,
    type NewTabGradeFailure,
    type NewTabReviewTarget,
    type QueuedNewTabGradeTarget,
    isFailedNewTabGrade,
} from './review-targets';
import {
    addNewTabDailyStudyTimeMs,
    formatNewTabDailyGoalLabel,
    formatNewTabSessionProgressLabel,
    newTabDailyStudyTimeMs,
    newTabLocalDateKey,
    newTabSessionProgressRatio,
    NewTabSessionProgressTracker,
    type NewTabSessionProgressSnapshot,
} from './session-progress';
import {
    mountStudySessionClockControl,
    type StudySessionClock,
    type StudySessionClockSnapshot,
} from './session-clock';
import {
    currentNewTabRoute,
    currentNewTabSearchQuery,
    newTabControllerStartup,
    newTabControllerStateChannel,
    type NewTabControllerStateChannel,
} from './controller-lifecycle';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import type {
    YomuSrsAdapter,
    YomuSrsQueueSnapshot,
} from '../srs/types';
import { jpdbFirstParseOptions, type ReaderParser } from '../lookup/parser';
import type { CardState, JPDBCard, JPDBDeck, JPDBGrade, JPDBToken, NewTabTypeWordInputMode, ReaderSettings } from '../app/types';
import type { RtkClient, RtkInfo } from '../kanji/rtk';
import { managedSessionStorage } from '../app/storage';
import { nextExplicitUiLanguage, resolveUiLanguage, uiText, type UiCopyKey } from '../app/i18n';
import { isNewTabCopyKey, newTabText, type NewTabCopyKey } from './i18n';
import {
    newTabReadySupportProviders,
    newTabSupportDismissVersion,
    newTabSupportGoalAvailable,
    newTabSupportMeta,
    rememberNewTabSupportBannerDismissal,
    shouldShowNewTabSupportBannerImpression,
    type NewTabSupportStatus,
} from './support-banner';
import {
    JPDB_ALL_DECKS,
    NEW_TAB_DICTIONARY_FALLBACK_RANKS,
    NEW_TAB_DICTIONARY_PRESENCE_TIMEOUT_MS,
    NEW_TAB_DICTIONARY_RANDOM_MAX_MS,
    NEW_TAB_DICTIONARY_RANDOM_MAX_ROWS,
    NEW_TAB_DICTIONARY_TOP_MAX_MS,
    NEW_TAB_DICTIONARY_TOP_MAX_ROWS,
    NEW_TAB_FALLBACK_SUPPLEMENT_MIN,
    NEW_TAB_KANJI_FRONT_KEYWORD_LIMIT,
    NEW_TAB_LIVE_REVIEW_STALE_MS,
    NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS,
    NEW_TAB_NAVIGATION_DEDUPE_MS,
    NEW_TAB_PUBLIC_FALLBACK_GRACE_MS,
    NEW_TAB_PUBLIC_JPDB_CONCURRENCY,
    NEW_TAB_PUBLIC_JPDB_KANJI_FALLBACK_LIMIT,
    NEW_TAB_PUBLIC_JPDB_LOCAL_SEED_LIMIT,
    NEW_TAB_PUBLIC_JPDB_WORD_FALLBACK_LIMIT,
    NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS,
    NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
    NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS,
    NEW_TAB_SOURCE_LABELS,
    NEW_TAB_BROWSE_DECK_LIMIT,
    NEW_TAB_UNDO_REVIEW_WINDOW_MS,
    NEW_TAB_STATS_JPDB_CARD_LIMIT,
    NEW_TAB_OFFLINE_WARM_LIMIT,
    NEW_TAB_OFFLINE_WARM_CARD_TIMEOUT_MS,
    NEW_TAB_OFFLINE_WARM_CONCURRENCY,
    NEW_TAB_OFFLINE_WARM_RETRY_MS,
    NEW_TAB_STUDY_INTERACTIVE_SELECTOR,
    NEW_TAB_WORD_LIMIT,
    NEW_TAB_WORD_STATE_CLASSES,
    SESSION_WORD_KEY,
} from './controller-config';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    definitionSourceLabel,
    orderedKanjiSourceIds,
} from '../sources/sections';
import type { CardNavigationMode, PopupNavigationEntry } from '../popup/navigation';
import { combinedApiCredentialLabel, effectiveJitenApiKey, hasJitenApiCredential, hasJpdbApiCredential, hasWanikaniApiCredential, isBunproFrontendCredentialExpired } from '../settings/api-credential';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import { NewTabTargetResources } from './target-resources';
import { captureActiveTarget, isCurrentActiveTarget, type ActiveTargetSnapshot } from './target-scope';
import { nearestNewTabAction, newTabAction, newTabActionSelector, type NewTabAction } from './actions';

export { selectNewTabStudyPool } from './study-queue';
export { newTabKanjiSourceTitle } from './kanji-helpers';

const NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS = 1_200;
const NEW_TAB_IMMERSION_EXAMPLE_LIMIT = 12;
// Immersion Kit applies `limit` per deck (100+ decks), so 48 balloons the
// response to 1-2 MB and times out; 10 keeps it ~400 KB with hundreds of
// post-filter candidates. See IMMERSION_POPUP_SEARCH_REQUEST_LIMIT.
const NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT = 10;
const NEW_TAB_IMMERSION_LOAD_TIMEOUT_GRACE_MS = 1_000;
const NEW_TAB_IMMERSION_PREFETCH_LOOKAHEAD = 1;
const NEW_TAB_LIVE_GRADE_REFRESH_DELAY_MS = 900;
const QUEUE_REFRESH_LOW_WATER = 20;
const QUEUE_REFRESH_GRADE_INTERVAL = 10;
const QUEUE_REFRESH_MAX_AGE_MS = 60_000;
const NEW_TAB_PARSED_SENTENCE_CACHE_LIMIT = 160;
// Bounded per-card/per-kanji session caches (NB-54). Sized well above any
// realistic single session's working set; they only stop unbounded growth over
// very long sessions (previously freed only by a factory reset).
const NEW_TAB_STUDY_SENTENCE_CACHE_LIMIT = 320;
const NEW_TAB_IMMERSION_CACHE_LIMIT = 160;
const NEW_TAB_DOODLE_PREVIEW_CACHE_LIMIT = 160;
const NEW_TAB_REVIEW_HISTORY_LIMIT = 12;
type NewTabTextKey = UiCopyKey | NewTabCopyKey;
export type { NewTabLookupReviewTarget, NewTabLookupReviewTargetSelection } from './review-controls';

interface NewTabParseContentOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
}

interface NewTabLookupDependencyOptions {
    navigation?: CardNavigationMode;
    previousNavigationEntry?: PopupNavigationEntry;
    reuseActivePopover?: boolean;
    userGesture?: boolean;
}

// Run low-priority work (offline cache warming) when the browser is idle, falling
// back to a short timer where requestIdleCallback is unavailable (Safari/jsdom).
function scheduleIdle(task: () => void): void {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') idle(task, { timeout: 1200 });
    else setTimeout(task, 60);
}

function newTabShortParseOptions(): NewTabParseContentOptions {
    return { jpdbTimeoutMs: NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS };
}

function shouldCacheParsedNewTabSentenceTokens(tokens: JPDBToken[]): boolean {
    return !tokens.length || tokens.some(token => token.card.source !== 'fallback');
}

function accurateNewTabImmersionExamples(query: string, examples: ImmersionKitExample[]): ImmersionKitExample[] {
    return shouldFilterImmersionExamplesBySurface(query)
        ? examples.filter(example => immersionSentenceContainsQuery(example.sentence, query))
        : examples;
}

export interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    toast?: (message: string) => void;
    anki: {
        clearAccountContext?: () => void;
        listNewTabCards: (limit?: number, deckScope?: string) => Promise<JPDBCard[]>;
        answerCard: (cardId: number, grade: JPDBGrade) => Promise<void>;
        findExistingCards?: (card: JPDBCard) => Promise<AnkiLookupResult>;
        invoke: <T>(action: string, params?: Record<string, unknown>) => Promise<T>;
        requestPermission: () => Promise<unknown>;
    };
    jpdb: JpdbClient;
    jiten?: Pick<JitenApiClient, 'listStudyBatchCards' | 'reviewCard' | 'lookupKanji' | 'lookupKanjiWords'> & Partial<Pick<JitenApiClient, 'clear' | 'parse' | 'lookupVocabularyInfoForCard' | 'refreshCardState' | 'undoReview' | 'listStudyDecks' | 'studyDeckWordKeys' | 'listStudyDeckVocabularyCards' | 'listRecentReviews'>>;
    jpdbKanji: JpdbKanjiClient;
    kanjiVG: KanjiVGClient;
    rtk: RtkClient;
    kanjiOrigin?: Pick<KanjiOriginClient, 'lookup'>;
    immersionKit: ImmersionKitClient;
    jpdbVocabulary?: Pick<JpdbVocabularyClient, 'lookup'> & Partial<Pick<JpdbVocabularyClient, 'search'>>;
    jpdbPublicPitch?: Pick<JpdbPublicPitchClient, 'lookup'>;
    jpdbReviewBridge: JpdbReviewBridgeClient;
    srsAdapters?: Partial<Record<NewTabSrsAdapterSource, NewTabSrsQueueAdapter>>;
    clearWanikaniAccountContext?: () => void;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    onAnkiStatusChanged?: (card: JPDBCard) => void;
    lookupText?: (text: string, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    lookupDictionaryReference?: (query: string, reading: string, sourceDictionary: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    showLookupCard?: (card: JPDBCard, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    showKanjiCard?: (card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    loadCardRenderData?: (card: JPDBCard, options?: CardRenderDataLoadOptions) => Promise<CardRenderData>;
    hydratePitchAccent?: (card: JPDBCard) => Promise<string[]>;
    hydrateFrequencyRanks?: (card: JPDBCard) => Promise<NonNullable<CardRenderData['frequencyRanks']>>;
    hydrateBunproDefinitionInfo?: (card: JPDBCard) => Promise<import('../bunpro/definition').BunproDefinitionInfo | null>;
    hydrateBunproDefinitionResult?: (card: JPDBCard) => Promise<{
        info: import('../bunpro/definition').BunproDefinitionInfo | null;
        status: NonNullable<CardRenderData['bunproDefinitionStatus']>;
    }>;
    renderSearchDefinitionSources?: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null, jitenVocabularyInfo: JitenVocabularyInfo | null, bunproDefinitionInfo: import('../bunpro/definition').BunproDefinitionInfo | null) => string;
    renderStudyDefinitionSources?: (card: JPDBCard, data: CardRenderData, sentence: string | undefined) => string;
    renderSearchWordPills?: (card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: CardRenderData['ankiLookup'], frequencyRanks?: CardRenderData['frequencyRanks']) => string;
    renderStudyWordPills?: (card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: CardRenderData['ankiLookup'], frequencyRanks?: CardRenderData['frequencyRanks']) => string;
    installSearchDetailSources?: (root: HTMLElement, card: JPDBCard, sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null) => void;
    installWanikaniSources?: (root: HTMLElement, card: JPDBCard) => void;
    lookupStudyCard?: (term: string, reading?: string) => Promise<JPDBCard | null | undefined>;
    preloadWordAudio?: (card: JPDBCard) => void;
    playWordAudio?: (card: JPDBCard) => Promise<void> | void;
    playJpdbExampleAudio?: (audioIds: string, fallbackSentence: string) => Promise<void> | void;
    performCardAction?: (button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement, command?: CardCommandCapability) => Promise<void> | void;
    parseContent?: (root: HTMLElement, options?: NewTabParseContentOptions) => Promise<void> | void;
    setImmersionTranslationBlurred?: (blurred: boolean) => void;
    dictionarySourceAttributes?: (sourceStateKey: string, initiallyExpanded?: boolean) => string;
    isDictionarySourceOpen?: (sourceStateKey: string, initiallyExpanded?: boolean) => boolean;
    installDictionarySourceTracking?: (root: HTMLElement) => void;
    onSettingsChange: (
        explicitUserChoiceKeys: readonly (keyof ReaderSettings)[],
    ) => Promise<void> | void;
    applyTheme: () => void;
    showSettings: (tab?: string) => void;
    dismissLookup?: () => void;
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

export interface NewTabControllerOptions {
    /** Existing host for an embedded Study surface; standalone Study owns body. */
    readonly host?: HTMLElement;
    readonly surface?: 'standalone' | 'academy';
    readonly sessionClock?: StudySessionClock;
    /** Academy mounts the shared clock control in its location chrome. */
    readonly showSessionClockControl?: boolean;
    /** One-shot step selected for the first card shown on a fresh surface. */
    readonly initialStudyStepId?: NewTabStudyStepId;
}

function readerWordSurfaceText(word: HTMLElement): string {
    const clone = word.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
    return clone.textContent ?? '';
}

function shouldResolveInitialWordIndex(poolChanged: boolean, preferStoredWord: boolean): boolean {
    return poolChanged || preferStoredWord;
}

function newTabPitchClass(card: JPDBCard): string {
    return getPitchClass(card.pitchAccent, newTabCardReading(card)) || 'unknown';
}

interface NewTabSourceCacheEntry {
    signature: string;
    result: NewTabLoadResult;
}

interface NewTabSourceCacheContext {
    signature: string;
    version: number;
}

interface NewTabLoadOptions {
    useOfflineCache?: boolean;
    quiet?: boolean;
    excludeCardKeys?: string[];
    preserveVisibleOrder?: boolean;
}

type ConcreteNewTabWordSource = NewTabConcreteSource;
type NewTabSrsQueueAdapter = Pick<YomuSrsAdapter, 'label' | 'hasCredential' | 'stats' | 'queue' | 'review'>;
type NavigationExpansionSource = 'dictionary' | 'jpdb' | 'public-jpdb' | 'anki';
type PointerNavigationDirection = 'next' | 'previous';

interface RootClickRequest {
    target: HTMLElement;
    action: NewTabAction | undefined;
}

interface BeforeInstallPromptChoice {
    outcome?: 'accepted' | 'dismissed' | string;
}

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice?: Promise<BeforeInstallPromptChoice>;
};

type RootClickHandler = (root: HTMLElement, target: HTMLElement, event: MouseEvent, action: NewTabAction | undefined) => boolean;

type StudyClickHandler = (root: HTMLElement, target: HTMLElement, event: MouseEvent) => void;

interface ParsedWordLookupRequest {
    word: HTMLElement;
    expression: string;
    reading: string;
    sentence: string;
    card: JPDBCard | undefined;
}

interface PromptLookupRequest {
    prompt: HTMLElement;
    card: JPDBCard;
}

interface SourceToggleContext {
    current: ConcreteNewTabWordSource;
    selected: ReaderSettings['newTabSource'];
    configured: ReaderSettings['newTabSource'];
    hasJpdb: boolean;
    hasJiten: boolean;
    hasBunpro: boolean;
    hasWanikani: boolean;
    hasYomuLocal: boolean;
    hasAnki: boolean;
    canUseJpdb: boolean;
    canUseBunpro: boolean;
    canUseWanikani: boolean;
    canUseYomuLocal: boolean;
    canUseAnki: boolean;
    canOfferAnki: boolean;
    ankiUnavailable: boolean;
}
interface NewTabKanjiSourceRenderContext {
    card: JPDBCard;
    kanji: string;
    facts: [string, string][];
    readings: string[];
    localMeanings: string[];
    fullInfo: JpdbKanjiInfo | null;
    jitenInfo: JitenKanjiInfo | null;
    rtk: RtkInfo | null;
    vg: KanjiVGInfo | null;
    sourceInfo: KanjiSourceInfo | null;
    localEntries: YomitanKanjiEntry[];
    settings: ReaderSettings;
    excludeFactLabels: Set<string>;
}

interface KanjiPromptKeyword {
    source: string;
    text: string;
}

interface NewTabStudySlots {
    steps: HTMLElement | null;
    tour: HTMLElement | null;
    progress: HTMLElement | null;
    timer: HTMLElement | null;
    prompt: HTMLElement | null;
    answer: HTMLElement | null;
    meaning: HTMLElement | null;
    count: HTMLElement | null;
    status: HTMLElement | null;
    reveal: HTMLButtonElement | null;
    controls: HTMLElement | null;
}

interface NewTabGradeTarget {
    root: HTMLElement;
    card: JPDBCard;
}



type PortableStudyCardIdentity = Omit<PortableStudyCardRoute, 'kind'>;

const log = Logger.scope('NewTab');
type ListenInteractionMode = 'perceive' | 'recall' | 'shadow';
interface LegacyStudyTransition {
    stepId: NewTabStudyStepId | null;
    listenMode?: Exclude<ListenInteractionMode, 'shadow'>;
}
const LEGACY_STUDY_STEP_IDS: Readonly<Record<string, NewTabStudyStepId>> = {
    recall: 'recall-cloze',
    kanji: 'kanji-doodle:0',
};
// Consolidated per-card study-step state (NB-41a). One entry per card key holds
// every study step's in-progress answer and first-attempt outcome, replacing the
// former parallel per-mode Maps (recallAnswers/recallOutcomes/pitchOutcomes/
// typeAnswers/typeOutcomes/doodleOutcomes/doodleFirstAttempt/speakingOutcomes).
// Cleared wholesale when the card pool rebuilds.
interface StudyStepState {
    // Recall cloze: the in-progress typed answer plus its graded outcome.
    recall?: { answer?: string; outcome?: NewTabRecallOutcome };
    // Type-word production: the in-progress typed answer plus the FIRST-attempt
    // outcome (recall grades reused; 'skipped' when the learner skips). First
    // attempt counts — a later retry never rewrites the recorded outcome.
    type?: TypeWordSelfCheckState & {
        /** First attempt only; this is the value folded into the reveal summary. */
        outcome?: NewTabRecallOutcome | 'skipped';
    };
    // Pitch-selection pick per card (the chosen downstep position + graded
    // outcome), persisted so it survives step navigation and folds into reveal.
    pitch?: { position: number; outcome: ListenOutcome };
    // Speaking step first-attempt pass/fail, mirrored into the reveal summary.
    speak?: 'correct' | 'wrong';
    // Doodle: the card-level aggregate ("roughest draw wins" — any failed kanji
    // marks the whole card wrong) plus a per-kanji first-attempt latch (a word
    // can hold several kanji-doodle steps; each kanji latches on its FIRST draw
    // so a redraw of the same character never launders its result).
    doodle?: { outcome?: 'correct' | 'wrong'; firstAttempt?: Map<string, 'correct' | 'wrong'> };
}

export class NewTabController {
    private allWords: JPDBCard[] = [];
    private visibleWords: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private visiblePoolSignature = '';
    // Post-grade refresh coalescing: the graded card is removed locally, so
    // queue accuracy does not need a provider round-trip per grade — a 500-due
    // session must not become ~500 full-queue fetches (the per-word request
    // storm class that once DOSed jiten.moe).
    private gradesSinceQueueRefresh = 0;
    private lastQueueRefreshAt = 0;
    private recentlyGradedCardKeys: string[] = [];
    private sourceResultCache = new Map<ConcreteNewTabWordSource, NewTabSourceCacheEntry>();
    private sourceCacheVersions = new Map<ConcreteNewTabWordSource, number>();
    private state: NewTabUiState;
    private readonly stateChannel: NewTabControllerStateChannel;
    private readonly unsubscribeJpdbBridge: () => void;
    private liveJpdbStatus: JpdbReviewBridgeStatus | null = null;
    private liveCards = new Map<string, JpdbReviewBridgeCard>();
    private pendingLiveJpdbGrade: { id: string; until: number } | null = null;
    private keywordCache = new Map<string, string>();
    private readonly kanjiDetailSource: KanjiDetailSource;
    private readonly gradeQueue: NewTabGradeQueue;
    // Offline-first session state surfaced next to the timer: how many review cards
    // are warmed for offline study, plus the write-behind sync status.
    private readonly offlineReadyKeys = new Set<string>();
    private offlineWarmSignature = '';
    private offlineWarmTotal = 0;
    private offlineWarmRetryTimer: number | undefined;
    private syncPendingCount = 0;
    private lastSyncedAt: number | null = null;
    // n+1 sentence selection: once per card the example sentences from every
    // source are scored against the learner's known words and the best one
    // (all known + at most one new word) replaces the card's own sentence.
    private studySentenceOverrides = new BoundedMap<string, string>(NEW_TAB_STUDY_SENTENCE_CACHE_LIMIT);
    private nPlusOneSentenceRequests = new Set<string>();
    // Set once the user chooses "Continue offline" in the connection-lost
    // dialog; later drops in the same outage queue silently. Cleared when the
    // browser reports it is back online so the next outage asks again.
    private offlineReviewingAccepted = false;
    private immersionCache = new BoundedMap<string, Promise<ImmersionKitExample[]>>(NEW_TAB_IMMERSION_CACHE_LIMIT);
    // Rotation cursor into immersionCache's examples; bounded with the same limit
    // so the two stay aligned (a dropped example set simply restarts at index 0).
    private immersionExampleIndex = new BoundedMap<string, number>(NEW_TAB_IMMERSION_CACHE_LIMIT);
    private frontSentenceCache = new BoundedMap<string, Promise<string>>(NEW_TAB_STUDY_SENTENCE_CACHE_LIMIT);
    private parsedSentenceCache = new Map<string, ParsedTokenCacheEntry>();
    private doodlePreviewCache = new BoundedMap<string, string>(NEW_TAB_DOODLE_PREVIEW_CACHE_LIMIT);
    private immersionPrefetchGeneration = 0;
    private installPrompt: BeforeInstallPromptEvent | null = null;
    private readonly immersionAudioPlayer: NewTabImmersionAudioPlayer;
    private reviewCountMode = false;
    private reviewHistoryCards: JPDBCard[] = [];
    private readonly sessionClock: StudySessionClock;
    private readonly ownsSessionClock: boolean;
    private readonly sessionProgress: NewTabSessionProgressTracker;
    private sessionClockSubscription?: { dispose(): void };
    private sessionClockControl?: { dispose(): void };
    private sessionClockRoot: HTMLElement | null = null;
    private destroyed = false;
    private lastDailyGoalElapsedMs = 0;
    private emptyLoadMessageKey: NewTabTextKey | null = null;
    private fallbackStudyNotice = false;
    private deckSelectorDecks?: { key: string; promise: Promise<JPDBDeck[]> };
    // Latest-wins operation tracker (NB-41b). Migrated scopes: 'stats',
    // 'sourceSwitch'. The remaining hand-maintained *Generation counters await
    // the controller decomposition.
    private readonly operations = new OperationTracker();
    private loadGeneration = 0;
    private providerContexts: NewTabProviderContexts;
    // The study DOM needs a card identity for nested actions and stale async
    // guards, but the canonical card key contains the spelling and reading.
    // Before reveal, expose only this controller-local opaque token and resolve
    // it back to the card in memory. Revealed cards may use their canonical key.
    private studyCardDomTokenSequence = 0;
    private readonly studyCardDomTokens = new Map<string, string>();
    private readonly studyCardsByDomToken = new Map<string, JPDBCard>();
    private readonly studyStepStates = new Map<string, StudyStepState>();
    // Listen-mode pitch SRS + the in-card interaction state for the active card.
    private readonly pitchSrs = new PitchSrsStore();
    // Pool selection (which cards the study surface renders for the current mode/
    // filter) lives in its own module; the controller delegates via thin wrappers.
    private readonly studyPool = new NewTabStudyPool({
        getState: () => this.state,
        getSourceLabel: () => this.sourceLabel,
        getAllWords: () => this.allWords,
        getSettings: () => this.dependencies.getSettings(),
        shouldRenderCardAsKanji: card => this.shouldRenderCardAsKanji(card),
        cardReviewSource: card => this.cardReviewSource(card),
    });
    // The Search surface (dictionary search + handwriting) lives in its own
    // collaborator; the controller keeps thin delegations and hands the browse
    // seam back to itself. Every controller-side input flows through the deps.
    private readonly searchController = new NewTabSearchController({
        getDependencies: () => this.dependencies,
        getState: () => this.state,
        getAllWords: () => this.allWords,
        getVisibleWords: () => this.visibleWords,
        text: key => this.text(key),
        language: () => this.language(),
        hasLocalDictionaries: () => this.hasLocalDictionaries(),
        loadKanjiDetails: character => this.loadKanjiDetails(character),
        renderKanjiDetails: (card, kanji, details) => this.renderKanjiDetails(card, kanji, details.jpdb, details.jiten, details.rtk, details.vg, details.local, details.sourceInfo ?? null),
        keywordFromDetails: (card, jpdb, jiten, rtk) => this.keywordFromDetails(card, jpdb, jiten, rtk),
        renderNewTabKanjiImmersion: (root, kanji) => this.renderNewTabKanjiImmersion(root, kanji),
        sourceAttributes: (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
        kanjiSourceTitle: sourceId => this.kanjiSourceTitle(sourceId),
        shouldEnrichWordPitch: card => this.shouldEnrichWordPitch(card),
        loadWordPitch: card => this.loadWordPitch(card),
        updateRenderedWordPitch: (root, card) => this.updateRenderedWordPitch(root, card),
        localSearchWithTimeout: <T>(promise: Promise<T>, fallback: T) => this.localSearchWithTimeout(promise, fallback),
        studySlots: root => this.studySlots(root),
        renderPromptSlot: (slot, prompt, lang) => this.renderPromptSlot(slot, prompt, lang),
        renderCount: (slot, label) => this.renderCount(slot, label),
        syncMode: root => this.syncMode(root),
        syncThemeToggle: root => this.syncThemeToggle(root),
        shortParseOptions: () => newTabShortParseOptions(),
        providerContext: () => this.providerContexts.key,
        browseScopeActive: () => this.browseScopeActive(),
        getBrowsePool: () => this.browsePool,
        renderBrowseResults: mount => this.renderBrowseResults(mount),
        renderBrowseInto: root => this.renderBrowseInto(root),
        browseHasProviders: () => this.browsePoolProviders(this.dependencies.getSettings()).length > 0,
        enterSearchMode: () => {
            this.state = { ...this.state, route: 'search', revealAnswer: false };
            this.persistState();
        },
    });
    private readonly nestedCommandRouter: NestedCommandRouter;
    private listenItem: PitchSrsItem | null = null;
    private listenInteractionMode: Exclude<ListenInteractionMode, 'shadow'> = 'perceive';
    private listenRenderedMode: ListenInteractionMode | null = null;
    private listenSelectedPosition: number | null = null;
    private listenRevealed = false;
    private listenOutcome: ListenOutcome | null = null;
    private listenContrastCard: JPDBCard | null = null;
    // Bumped whenever the active card changes; in-flight audio re-checks it and
    // bails so a previous card's clip never plays over the next card's prompt.
    private listenAudioGeneration = 0;
    private listenRecorder: MediaRecorder | undefined;
    private listenRecordingUrl: string | undefined;
    private listenRecordingAudio: HTMLAudioElement | undefined;
    private listenRecordingUnavailable = false;
    private listenRecordingStopTimer: ReturnType<typeof setTimeout> | undefined;
    private listenSpeakingScore: SpeakingPitchScore | null = null;
    private listenSpeakingScoring = false;
    private listenSpeakingScoreGeneration = 0;
    // Handwriting sub-mode progress: how many leading characters of the target
    // the learner has cleared (kana scaffolding auto-advances).
    private typeHandwritingProgress = new Map<string, number>();
    // Per-card fallback when a promised stroke reference is absent. The learner
    // self-checks explicitly; absence of data must never be scored as correct.
    private typeHandwritingSelfCheck = new Set<string>();
    // Progressive-hint reveal depth per card+step ("card|kanji-doodle:0:飲" -> 2).
    // A hint never prints the full answer; the count folds into the reveal summary.
    private studyHintDepth = new Map<string, number>();
    private studyStepOverride: { cardKey: string; id: NewTabStudyStepId } | null = null;
    // A freshly opened standalone Study page starts at the recognition-first
    // Word step. The preference is consumed once: moving to another card uses
    // the learner's normal configured step order, while rerenders of this first
    // card keep the selected Word step stable.
    private initialStudyStepIdPending: NewTabStudyStepId | null;
    private pinnedStudyPlan: { cardKey: string; inputs: { hasRecallCloze: boolean; pitchAvailable: boolean } } | null = null;
    private rootEventController: AbortController | undefined;
    private readonly rootClickHandlers: RootClickHandler[] = [
        (root, _target, event, action) => this.handleRootUtilityClick(root, event, action),
        (root, target, event, action) => this.handleStatsClick(root, target, event, action),
        (root, target, event, action) => this.handleSearchClick(root, target, event, action),
        (root, target, event, action) => this.handleRootModeClick(root, target, event, action),
    ];
    // Keyed by the closed action vocabulary, so an entry for a name no render
    // site emits fails typecheck. That is how five permanently-unreachable
    // entries (skip / undo-review / listen-play-both / listen-grade /
    // listen-next) were found and removed — nothing in src rendered them.
    private readonly studyClickHandlers: Partial<Record<NewTabAction, StudyClickHandler>> = {
        next: (_root, _target, event) => this.navigateFromPointer('next', event),
        previous: (_root, _target, event) => this.navigateFromPointer('previous', event),
        reveal: root => this.toggleReveal(root),
        'empty-fallback': root => { void this.startStarterWordStudy(root); },
        'continue-batch': root => { void this.continueAfterBatch(root); },
        'study-step': (root, target) => this.activateStudyStepFromClick(root, target),
        'study-hint': (root, target) => this.revealStudyHint(root, target),
        'dismiss-study-tour': root => { void this.dismissStudyTour(root); },
        'recall-submit': root => this.submitRecallAnswer(root),
        'type-word-submit': root => this.submitTypeWordAnswer(root),
        'type-word-handwriting-check': root => this.handleTypeWordHandwritingSelfCheck(root, 'reveal'),
        'type-word-handwriting-match': root => this.handleTypeWordHandwritingSelfCheck(root, 'match'),
        'type-word-handwriting-retry': root => this.handleTypeWordHandwritingSelfCheck(root, 'retry'),
        'type-word-skip': root => this.skipTypeWord(root),
        'type-word-mode': (root, target) => this.handleTypeWordModeClick(root, target),
        'listen-pick': (root, target) => this.handleListenPick(root, target),
        'listen-play': () => { void this.playListenModelAudio(); },
        'listen-record': () => { void this.toggleListenRecording(); },
        'listen-play-recording': () => this.playListenRecording(),
        grade: (root, target) => this.gradeFromStudyClick(root, target),
        'jpdb-kanji-action': (root, target) => {
            const command = readJpdbKanjiCommandCapability(target.closest('[data-kanji-action-id]'));
            if (command) void this.performJpdbKanjiAction(root, command.actionId);
        },
    };
    private lastPointerNavigation: { action: 'next' | 'previous'; time: number } | null = null;
    private navigationGeneration = 0;
    private navigationSupplementPromise: Promise<void> | null = null;
    private browsePool?: JPDBCard[];
    private browsePoolKey = '';
    private browsePoolGeneration = 0;
    private browsePoolLoad?: { generation: number; key: string; promise: Promise<JPDBCard[]> };
    private browseFilterGeneration = 0;
    private browseFilters = new Set<CardState>();
    private browseSourceFilters = new Set<BrowseSourceFilter>();
    private browseSort: BrowseSortKey = 'queue';
    private browseSortDescending = false;
    private browseSelectMode = false;
    private browsePage = 0;
    private deckSelectorGeneration = 0;
    // Trouble-card study bridge: the stats "Study these" button sets this and
    // hands off to the word-load pipeline (consumed in filterStatsStudyCards /
    // applyLoadedWordState). Stays on the controller because it steers word load.
    private statsStudyFilter: 'trouble' | null = null;
    // The stats-page surface (dashboard snapshot, per-source loading, chart
    // clicks) lives in its own module; the controller forwards renders/clicks
    // and reads back the selected source when starting a trouble-card session.
    // Assigned in the constructor body: the review-source clients are read off
    // `this.dependencies`, which is a parameter property not yet set during
    // field initialization.
    private readonly statsController: NewTabStatsController;
    // Cycle-9 provider unification: the two grade ladders (submitReviewTarget /
    // submitQueuedGrade) dispatch through one adapter table here. Assigned in the
    // constructor body — the review-source clients are read off `this.dependencies`,
    // a parameter property not yet set during field initialization.
    private readonly reviewSubmitter: NewTabReviewSubmitter;
    private readonly targetResources: NewTabTargetResources;

    constructor(
        private readonly dependencies: NewTabControllerDependencies,
        private readonly options: NewTabControllerOptions = {},
    ) {
        this.nestedCommandRouter = new NestedCommandRouter({
            route: () => this.state.route,
            currentCard: () => this.visibleWords[this.index],
            selectSearch: (root, query) => this.searchController.selectSearchSuggestion(root, query),
            showKanji: (card, kanji, anchor) => this.showNestedKanjiCard(card, kanji, anchor),
            showTerm: (anchor, expression, reading) => {
                if (!this.showNestedSourceReviewCard(anchor)) this.lookupNestedTerm(expression, reading, anchor);
            },
            loadJitenWords: (button, action) => {
                void runJitenKanjiWordsAction(button, action, this.jitenKanjiWordsActionContext());
            },
            playJpdbExampleAudio: dependencies.playJpdbExampleAudio,
            cardForTarget: target => this.nestedCardActionCard(target),
            performCardAction: dependencies.performCardAction,
        });
        this.providerContexts = newTabProviderContexts(dependencies.getSettings());
        const startup = newTabControllerStartup({
            source: this.effectiveNewTabSourceFromSettings(dependencies.getSettings()),
            sessionClock: options.sessionClock,
            initialStudyStepId: options.initialStudyStepId,
        });
        this.initialStudyStepIdPending = startup.initialStudyStepId;
        this.targetResources = new NewTabTargetResources({
            getSettings: () => this.dependencies.getSettings(),
            providerContexts: () => this.providerContexts,
            parser: this.dependencies.parser,
            dictionaries: this.dependencies.dictionaries,
            jpdbPublicPitch: this.dependencies.jpdbPublicPitch,
            localSearchWithTimeout: <T>(promise: Promise<T>, fallback: T) => this.localSearchWithTimeout(promise, fallback),
        });
        this.statsController = new NewTabStatsController({
            getSettings: () => this.dependencies.getSettings(),
            ankiProviderContext: () => newTabAnkiProviderContext(this.dependencies.getSettings()),
            jpdb: this.dependencies.jpdb,
            jiten: this.dependencies.jiten,
            anki: this.dependencies.anki,
            srsAdapters: this.dependencies.srsAdapters,
            srsReviewableToNewTabCard: newTabCardFromSrsReviewable,
            canUseBunproSource: () => this.canUseBunproSource(),
            canUseWanikaniSource: () => this.canUseWanikaniSource(),
            canUseYomuLocalSource: () => this.canUseYomuLocalSource(),
            text: (key: 'composedOf' | 'showKanji') => this.text(key),
            formatText: (key, values) => this.formatNewTabText(key, values),
            resolvedLanguage: () => this.resolvedLanguage(),
            syncMode: root => this.syncMode(root),
            syncThemeToggle: root => this.syncThemeToggle(root),
            showSettings: tab => this.dependencies.showSettings(tab),
            hasCoarsePointer: () => this.hasCoarsePointer(),
            studyTroubleCards: root => this.studyStatsTroubleCards(root),
        });
        this.ownsSessionClock = startup.ownsSessionClock;
        this.sessionClock = startup.sessionClock;
        this.sessionProgress = new NewTabSessionProgressTracker({ clock: this.sessionClock });
        this.lastDailyGoalElapsedMs = this.sessionClock.snapshot().elapsedMs;
        this.state = startup.state;
        if (!options.initialStudyStepId) this.applyLoadedLegacyStudyIntent(startup.legacyStudyIntent);
        if (startup.routeSearchQuery) this.searchController.setInitialQuery(startup.routeSearchQuery);
        this.stateChannel = newTabControllerStateChannel(options.surface, state => { void this.applyExternalState(state); });
        this.unsubscribeJpdbBridge = dependencies.jpdbReviewBridge.onUpdate(status => this.applyJpdbBridgeStatus(status));
        this.kanjiDetailSource = new KanjiDetailSource({
            getSettings: () => this.dependencies.getSettings(),
            jpdbKanji: this.dependencies.jpdbKanji,
            jiten: this.dependencies.jiten,
            rtk: this.dependencies.rtk,
            kanjiVG: this.dependencies.kanjiVG,
            kanjiOrigin: this.dependencies.kanjiOrigin,
            dictionaries: this.dependencies.dictionaries,
            localSearchWithTimeout: <T>(promise: Promise<T>, fallback: T) => this.localSearchWithTimeout(promise, fallback),
        });
        this.reviewSubmitter = new NewTabReviewSubmitter({
            getSettings: () => this.dependencies.getSettings(),
            providerContextForTarget: target => newTabReviewProviderContext(this.providerContexts, target),
            text: key => this.text(key),
            jpdb: this.dependencies.jpdb,
            jiten: this.dependencies.jiten,
            srsAdapters: this.dependencies.srsAdapters,
            publishGradedCardState: card => this.publishGradedCardState(card),
            armJitenUndo: card => this.armJitenUndo(card),
            reviewLiveJpdb: (card, grade) => this.submitLiveJpdbGrade(card, grade),
            reviewAnki: (card, grade) => this.submitAnkiGrade(card, grade),
        });
        this.gradeQueue = new NewTabGradeQueue({
            offlineEnabled: () => this.dependencies.getSettings().newTabOfflineEnabled,
            providerContextForTarget: target => newTabReviewProviderContext(this.providerContexts, target),
            submit: item => this.submitQueuedGrade(item),
            onSubmitted: card => this.invalidateReviewSourceCache(card),
        });
        this.immersionAudioPlayer = new NewTabImmersionAudioPlayer({
            getSettings: () => this.dependencies.getSettings(),
            immersionKit: this.dependencies.immersionKit,
        });
        void this.pitchSrs.load();
    }

    isCurrentPage(): boolean {
        return Boolean(this.options.host) || isYomuNewTabUrl(location.href);
    }

    async renderPage(): Promise<void> {
        this.configureStandaloneDocument();
        const settings = this.dependencies.getSettings();
        const providerContextChanged = this.syncProviderContext(settings);
        this.syncSourceFromSettings(settings);
        this.applyPalette();

        const { root, isNew } = this.ensureNewTabRoot();
        this.bindRootEvents(root);
        root.dataset.newtabBound = 'true';

        const shouldRenderContent = this.renderContentShell(root, isNew);
        this.ensureSessionClock(root);
        this.syncThemeToggle(root);
        this.syncInstallAppButton(root);
        void this.syncSupportBanner(root);

        this.refreshChangedProviderStudy(root, providerContextChanged, shouldRenderContent);
        if (this.renderNonStudyRoute(root)) return;
        await this.renderStudyRoute(root, shouldRenderContent);
    }

    private configureStandaloneDocument(): void {
        if (this.options.host) return;
        document.title = `${APP_NAME} ${this.text('newTabPage')}`;
        document.documentElement.lang = this.resolvedLanguage();
        document.documentElement.classList.add('jpdb-reader-newtab-document');
    }

    private renderContentShell(root: HTMLElement, isNew: boolean): boolean {
        const shouldRenderContent = this.shouldRenderEnabledContent(root, isNew);
        if (!shouldRenderContent) return false;
        this.sessionClockControl?.dispose();
        this.sessionClockControl = undefined;
        delete root.dataset.standaloneNewtab;
        root.dataset.newtabLanguage = this.resolvedLanguage();
        root.dataset.studySurface = this.options.surface ?? 'standalone';
        root.replaceChildren(this.renderEnabledContent());
        this.syncMode(root);
        return true;
    }

    private refreshChangedProviderStudy(root: HTMLElement, providerContextChanged: boolean, contentRebuilt: boolean): void {
        if (providerContextChanged && !contentRebuilt && this.state.route === 'study') this.applyWords(root, false);
    }

    private renderNonStudyRoute(root: HTMLElement): boolean {
        if (this.state.route === 'search') {
            this.searchController.renderSearch(root);
            return true;
        }
        if (this.state.route === 'stats') {
            this.renderStats(root);
            void this.loadStatsInto(root);
            return true;
        }
        return false;
    }

    private async renderStudyRoute(root: HTMLElement, contentRebuilt: boolean): Promise<void> {
        if (contentRebuilt || this.allWords.length === 0) await this.loadWordsInto(root, true);
        else this.applyWords(root, true);
    }

    private ensureNewTabRoot(): { root: HTMLElement; isNew: boolean } {
        const root = this.currentRoot();
        if (root) return { root, isNew: false };

        const created = document.createElement('main');
        created.className = 'jpdb-reader-newtab';
        created.dataset.jpdbReaderRoot = 'true';
        if (this.options.host) this.options.host.replaceChildren(created);
        else document.body.replaceChildren(created);
        return { root: created, isNew: true };
    }

    private currentRoot(): HTMLElement | null {
        return this.options.host
            ? this.options.host.querySelector<HTMLElement>('.jpdb-reader-newtab[data-jpdb-reader-root]')
            : document.querySelector<HTMLElement>('.jpdb-reader-newtab[data-jpdb-reader-root]');
    }

    private shouldRenderEnabledContent(root: HTMLElement, isNew: boolean): boolean {
        return isNew
            || !root.querySelector('[data-newtab-study]')
            || root.dataset.newtabLanguage !== this.resolvedLanguage()
            || root.dataset.standaloneNewtab === 'true';
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        cancelConnectionLostDialog();
        this.stopSessionClock();
        if (this.ownsSessionClock) this.sessionClock.dispose();
        this.clearListenRecording();
        this.pitchSrs.flushSync();
        this.stateChannel.close();
        this.unsubscribeJpdbBridge();
        this.rootEventController?.abort();
        this.searchController.destroy();
        this.frontSentenceCache.clear();
        this.parsedSentenceCache.clear();
        this.studySentenceOverrides.clear();
        this.nPlusOneSentenceRequests.clear();
        this.rootEventController = undefined;
        const root = this.currentRoot();
        if (root) delete root.dataset.newtabBound;
    }

    async refreshExternalData(): Promise<void> {
        const root = this.currentRoot();
        if (!root) return;
        this.dependencies.dictionaries.invalidateCaches?.();
        this.clearSourceResultCache();
        this.clearReviewHistory();
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.navigationSupplementPromise = null;
        await this.loadWordsInto(root, true);
    }

    async refreshBunproQueueAfterExternalGrade(): Promise<void> {
        if (this.gradeSubmissionInFlight) return;
        const isBunproReview = (card: JPDBCard): boolean => card.source === 'bunpro' || card.reviewSource === 'bunpro-api';
        const configuredSourceCanLoadBunpro = this.state.source === 'bunpro'
            || this.state.source === 'auto' && this.canUseBunproSource();
        if (!configuredSourceCanLoadBunpro && !this.allWords.some(isBunproReview)) return;
        const root = this.currentRoot();
        if (!root) return;
        this.gradeSubmissionInFlight = true;
        // Another Study tab may have consumed any session id in this queue.
        // Make every local Bunpro control inert synchronously, remove all stale
        // obligations, then trust only a fresh live queue response.
        root.querySelectorAll<HTMLButtonElement>(`${newTabActionSelector('grade')}, button[data-action="grade"][data-grade]`)
            .forEach(button => { button.disabled = true; });
        this.lastUndoableReview = undefined;
        this.invalidateSourceResultCache('bunpro');
        this.allWords = this.allWords.filter(card => !isBunproReview(card));
        this.visibleWords = this.visibleWords.filter(card => !isBunproReview(card));
        this.visiblePoolSignature = this.newTabPoolSignature(this.visibleWords);
        this.state.revealAnswer = false;
        this.persistState();
        this.markQueueRefreshed();
        try {
            await this.loadWordsInto(root, true, { useOfflineCache: false });
        } finally {
            this.gradeSubmissionInFlight = false;
        }
    }

    lookupGradeOptions(card: JPDBCard): Array<[JPDBGrade, string]> {
        return this.isCurrentLookupGradeCard(card) ? newTabGradeOptions(this.dependencies.getSettings(), card) : [];
    }

    lookupReviewTargets(card: JPDBCard, data?: CardRenderData | null): NewTabLookupReviewTarget[] {
        if (!this.isCurrentLookupGradeCard(card)) return [];
        const current = this.visibleWords[this.index] ?? card;
        return this.lookupReviewTargetsForCard(current, data);
    }

    async gradeFromLookup(grade: JPDBGrade, target?: NewTabLookupReviewTargetSelection, expectedCard?: JPDBCard): Promise<{ preserveLookup: boolean }> {
        if (expectedCard && !this.isCurrentLookupGradeCard(expectedCard)) return { preserveLookup: false };
        const submitted = await this.gradeCurrentCard(grade, target, expectedCard);
        return { preserveLookup: !submitted };
    }

    private isCurrentLookupGradeCard(card: JPDBCard): boolean {
        const current = this.visibleWords[this.index];
        return Boolean(
            current
            && this.state.revealAnswer
            && this.sameGradeCardIdentity(current, card)
            && this.canReviewCard(current),
        );
    }

    private language(): ReaderSettings['interfaceLanguage'] {
        return this.dependencies.getSettings().interfaceLanguage;
    }

    private text(key: NewTabTextKey): string {
        return isNewTabCopyKey(key) ? newTabText(this.language(), key) : uiText(this.language(), key);
    }

    private resolvedLanguage(): ReturnType<typeof resolveUiLanguage> {
        return resolveUiLanguage(this.language());
    }

    private offlineSourceLabel(label: string): string {
        const source = this.localizedSourceLabel(label);
        const suffix = this.text('offlineSourceSuffix');
        return resolveUiLanguage(this.language()) === 'ja' ? `${source}（${suffix}）` : `${source} (${suffix})`;
    }

    private isOfflineSourceLabel(label: string): boolean {
        return label.includes('(offline)') || label.includes(`（${this.text('offlineSourceSuffix')}）`);
    }

    private localizedSourceLabel(label: string): string {
        if (label === 'Dictionary' || label === 'Dictionaries') return this.text('dictionary');
        if (label === 'Cached reviews') return this.text('cachedReviews');
        if (label === 'No source') return this.text('noSource');
        if (label === 'JPDB live review') return `JPDB ${this.text('liveReview')}`;
        return label;
    }

    private syncProviderContext(settings: ReaderSettings): boolean {
        const previous = this.providerContexts;
        const next = newTabProviderContexts(settings);
        if (previous.key === next.key) return false;
        this.providerContexts = next;
        this.loadGeneration++;
        this.navigationGeneration++;
        this.browseFilterGeneration++;
        this.deckSelectorGeneration++;
        this.operations.begin('sourceSwitch');
        this.resetLoadedSourceState();
        this.searchController.invalidateProviderContext();
        this.clearSourceResultCache();
        this.invalidateBrowsePool();
        this.statsController.resetProviderContext();
        this.clearProviderClientCaches();
        this.clearCardBoundState();
        this.studyCardDomTokens.clear();
        this.studyCardsByDomToken.clear();
        this.deckSelectorDecks = undefined;
        this.ankiDeckDueCountsCache = undefined;
        this.lastUndoableReview = undefined;
        this.pendingLiveJpdbGrade = null;
        this.studyStepOverride = null;
        this.pinnedStudyPlan = null;
        this.statsStudyFilter = null;
        this.fallbackStudyNotice = false;
        this.offlineReviewingAccepted = false;
        this.listenItem = null;
        this.listenContrastCard = null;
        this.listenAudioGeneration++;
        this.clearListenSpeakingScore();
        this.clearListenRecording();
        this.state = {
            ...this.state,
            revealAnswer: false,
            ...providerContextDeckResets(previous, next),
        };
        this.persistState();
        return true;
    }

    private clearProviderClientCaches(): void {
        [
            () => this.dependencies.anki.clearAccountContext?.(),
            () => this.dependencies.jpdb.clear?.(),
            () => this.dependencies.jiten?.clear?.(),
            () => this.dependencies.clearWanikaniAccountContext?.(),
            () => clearJpdbKanjiClient(this.dependencies.jpdbKanji),
        ].forEach(clear => clear());
    }

    private clearTargetBoundState(): void {
        this.searchController.reset();
        this.clearSourceResultCache();
        this.clearCardBoundState();
        this.statsController.reset();
    }

    private clearCardBoundState(): void {
        this.liveCards.clear();
        this.keywordCache.clear();
        this.kanjiDetailSource.clear();
        this.immersionCache.clear();
        this.immersionExampleIndex.clear();
        this.frontSentenceCache.clear();
        this.parsedSentenceCache.clear();
        this.targetResources.clear();
        this.studySentenceOverrides.clear();
        this.nPlusOneSentenceRequests.clear();
        this.doodlePreviewCache.clear();
        this.studyStepStates.clear();
        this.typeHandwritingProgress.clear();
        this.typeHandwritingSelfCheck.clear();
        this.studyHintDepth.clear();
        this.immersionAudioPlayer.reset();
    }

    invalidateForFactoryReset(): void {
        this.loadGeneration++;
        this.allWords = [];
        this.visibleWords = [];
        this.index = 0;
        this.sourceLabel = '';
        this.visiblePoolSignature = '';
        this.navigationSupplementPromise = null;
        this.reviewCountMode = false;
        this.emptyLoadMessageKey = null;
        this.clearTargetBoundState();
    }

    invalidateForTargetChange(): void {
        this.loadGeneration++;
        this.navigationGeneration++;
        this.immersionPrefetchGeneration++;
        this.resetLoadedSourceState();
        this.state.revealAnswer = false;
        this.clearTargetBoundState();
        this.pendingLiveJpdbGrade = null;
        this.studyStepOverride = null;
        this.pinnedStudyPlan = null;
        this.invalidateBrowsePool();
        this.browseSourceFilters.clear();
        this.browsePage = 0;
        this.deckSelectorDecks = undefined;
        this.studyCardDomTokens.clear();
        this.studyCardsByDomToken.clear();
        this.offlineReadyKeys.clear();
        this.offlineWarmSignature = '';
        this.offlineWarmTotal = 0;
        this.clearOfflineWarmRetry();
        this.fallbackStudyNotice = false;
        this.statsStudyFilter = null;
        this.listenItem = null;
        this.listenContrastCard = null;
        this.listenAudioGeneration++;
        this.clearListenSpeakingScore();
        this.clearListenRecording();
        this.renderAfterTargetInvalidation();
    }

    private clearOfflineWarmRetry(): void {
        if (this.offlineWarmRetryTimer === undefined) return;
        clearTimeout(this.offlineWarmRetryTimer);
        this.offlineWarmRetryTimer = undefined;
    }

    private renderAfterTargetInvalidation(): void {
        const root = this.currentRoot();
        if (!root) return;
        if (this.state.route === 'search') {
            this.searchController.renderSearch(root);
            return;
        }
        if (this.state.route === 'stats') return this.renderStats(root);
        this.applyWords(root, false);
    }

    private renderEnabledContent(): DocumentFragment {
        const language = this.language();
        const showChrome = this.options.surface !== 'academy';
        return renderNewTabShell({
            language,
            overflowMenu: showChrome ? this.renderOverflowMenu(language) : null,
            appNavigation: showChrome ? this.renderAppNavigation(language) : null,
            showSessionClockControl: this.options.showSessionClockControl !== false,
        });
    }

    private renderOverflowMenu(language: ReaderSettings['interfaceLanguage']): HTMLElement {
        const nextLanguage = nextExplicitUiLanguage(language);
        return el('div', { class: 'jpdb-reader-newtab-more-menu', role: 'menu' },
            this.renderOverflowMenuButton(newTabText(language, 'connectionsAndSettings'), newTabAction('settings'), language, {
                description: newTabText(language, 'connectionsDescription'),
            }),
            // One route list, shared with the docs nav and the PDF Reader and
            // Video Player shells. Study renders each route's English or
            // Japanese label here; the two static shells localize stamped
            // data-nav-ja attributes in their applyInterfaceLanguage loops.
            ...studyShellNavRoutes(DOCS_BASE_URL, location.href).map(link => this.renderSiteNavLink(link, language)),
            this.renderOverflowMenuButton(newTabText(language, 'installStudyApp'), newTabAction('install-app'), language, {
                className: 'jpdb-reader-newtab-install-app',
                dataset: { newtabInstallApp: true, installPromptAvailable: false },
                description: newTabText(language, 'installStudyAppManual'),
            }),
            el('hr', { class: 'jpdb-reader-newtab-more-divider' }),
            this.renderOverflowMenuButton(uiText(language, 'theme'), newTabAction('theme'), language, {
                className: 'jpdb-reader-newtab-menu-appearance',
            }),
            this.renderOverflowMenuButton(uiText(language, nextLanguage === 'ja' ? 'japanese' : 'english'), newTabAction('language'), language, {
                className: 'jpdb-reader-newtab-menu-appearance',
                dataset: { nextLanguage },
            }),
            el('hr', { class: 'jpdb-reader-newtab-more-divider' }),
            this.renderOverflowMenuLink(uiText(language, 'github'), GITHUB_REPOSITORY_URL, language),
            this.renderOverflowMenuLink(uiText(language, 'discord'), DISCORD_INVITE_URL, language),
        );
    }

    /**
     * A site-nav entry. Same tab, like the other two hosted shells, and the
     * entry's own `target` when it carries one — Membership's `_self` is what
     * keeps the docs membership popover from being hijacked by the VitePress
     * router, and the markup is the same everywhere so it travels with it.
     */
    private renderSiteNavLink(
        link: HostedShellNavLink,
        language: ReaderSettings['interfaceLanguage'],
    ): HTMLAnchorElement {
        const japanese = resolveUiLanguage(language) === 'ja';
        return el('a', {
            class: 'jpdb-reader-newtab-menu-item jpdb-reader-parseable',
            href: link.href,
            ...(link.target ? { target: link.target } : {}),
            dataset: { newtabAction: newTabAction('site-nav') },
            role: 'menuitem',
            lang: japanese ? 'ja' : 'en',
        }, japanese ? link.ja : link.text);
    }

    private renderAppNavigation(language: ReaderSettings['interfaceLanguage']): HTMLElement {
        const item = (label: string, mark: string, action: NewTabAction, mode?: string) => el('button', {
            class: 'jpdb-reader-newtab-app-nav-item jpdb-reader-parseable',
            type: 'button',
            dataset: { newtabAction: action, ...(mode ? { mode } : {}) },
            lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en',
        },
        el('span', { class: 'jpdb-reader-newtab-app-nav-mark', 'aria-hidden': 'true' }, mark),
        el('span', { class: 'jpdb-reader-newtab-app-nav-label' }, label));
        return el('nav', {
            class: 'jpdb-reader-newtab-app-nav',
            dataset: { newtabAppNavigation: true },
            'aria-label': newTabText(language, 'appNavigation'),
        },
        item(newTabText(language, 'study'), '学', newTabAction('mode'), 'word'),
        item(newTabText(language, 'library'), '辞', newTabAction('mode'), 'search'),
        item(newTabText(language, 'stats'), '統', newTabAction('mode'), 'stats'),
        item(newTabText(language, 'connections'), '連', newTabAction('settings')));
    }

    private renderOverflowMenuButton(
        label: string,
        action: NewTabAction,
        language: ReaderSettings['interfaceLanguage'],
        options: { className?: string; dataset?: Record<string, string | boolean | number>; description?: string } = {},
    ): HTMLButtonElement {
        return el('button', {
            class: `jpdb-reader-newtab-menu-item jpdb-reader-parseable${options.className ? ` ${options.className}` : ''}`,
            type: 'button',
            dataset: { newtabAction: action, ...(options.dataset ?? {}) },
            role: 'menuitem',
            lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en',
        },
        el('span', { class: 'jpdb-reader-newtab-menu-label' }, label),
        options.description ? el('span', { class: 'jpdb-reader-newtab-menu-description' }, options.description) : null);
    }

    private renderOverflowMenuLink(
        label: string,
        href: string,
        language: ReaderSettings['interfaceLanguage'],
    ): HTMLAnchorElement {
        return el('a', {
            class: 'jpdb-reader-newtab-menu-item jpdb-reader-parseable',
            href,
            target: '_blank',
            rel: 'noopener',
            dataset: { newtabAction: newTabAction('external-link') },
            role: 'menuitem',
            lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en',
        }, label);
    }

    /**
     * Root event wiring, as two declarative tables: delegated listeners on the
     * study root, then the page-level listeners (document/window) the surface
     * needs. Each body lives in its own named method, so this reads as the
     * surface's event contract instead of 200 lines of inline closures.
     */
    private bindRootEvents(root: HTMLElement): void {
        this.migrateLegacyState(this.visibleWords[this.index]);
        this.rootEventController?.abort();
        const controller = new AbortController();
        const options = { signal: controller.signal };

        installLocalTapActivation(root);
        for (const [type, handle] of this.rootEventBindings(root)) {
            root.addEventListener(type, handle, options);
        }
        for (const [target, type, handle] of this.pageEventBindings(root)) {
            target.addEventListener(type, handle, options);
        }

        installNewTabSwipeGesture({
            root,
            target: () => root.querySelector<HTMLElement>('[data-newtab-study]'),
            signal: controller.signal,
            shouldStart: target => this.canSwipeCurrentStudyCard() || this.swipeStartAllowedForStepNavigation(target),
            onProgress: progress => this.syncSwipeAffordance(root, progress),
            onSwipe: (action, direction) => this.handleNewTabSwipe(root, action, direction),
        });

        this.syncConnectivityIndicator(root);
        this.rootEventController = controller;
    }

    private rootEventBindings(root: HTMLElement): Array<[string, (event: Event) => void]> {
        return [
            ['click', event => this.handleRootClick(root, event as MouseEvent)],
            ['submit', event => this.handleRootSubmit(root, event)],
            ['input', event => this.handleRootInput(root, event)],
            ['change', event => this.handleRootChange(root, event)],
            ['keydown', event => this.handleRootEnterKeydown(root, event as KeyboardEvent)],
            ['dragover', event => this.handleStatsDragOver(root, event)],
            ['dragleave', event => this.handleStatsDragLeave(root, event)],
            ['drop', event => this.handleStatsDrop(root, event as DragEvent)],
        ];
    }

    private pageEventBindings(root: HTMLElement): Array<[EventTarget, string, (event: Event) => void]> {
        const syncQueuedGrades = () => { void this.flushQueuedGrades(); };
        return [
            // Study shortcuts listen at document level: focus sits on body after
            // load and falls back there after every re-render (button clicks
            // replace the controls), so a root-scoped listener left keyboard
            // reviewing dead most of the time. This page is always Yomu's own
            // (renderPage gates on isYomuNewTabUrl), and input/search/settings
            // targets are filtered in handleRootKeydown.
            [document, 'keydown', event => this.handleRootKeydown(root, event as KeyboardEvent)],
            [window, 'popstate', () => this.handleLocationPopstate(root)],
            [window, 'online', () => {
                this.offlineReviewingAccepted = false;
                this.syncConnectivityIndicator(root);
                syncQueuedGrades();
            }],
            [window, 'offline', () => this.syncConnectivityIndicator(root)],
            [window, 'focus', syncQueuedGrades],
            [document, 'visibilitychange', () => {
                if (!document.hidden) syncQueuedGrades();
            }],
            [window, 'beforeinstallprompt', event => {
                event.preventDefault();
                this.installPrompt = event as BeforeInstallPromptEvent;
                this.syncInstallAppButton(root);
            }],
            [window, 'appinstalled', () => {
                this.installPrompt = null;
                this.syncInstallAppButton(root);
                this.dependencies.toast?.(this.text('installStudyAppInstalled'));
            }],
        ];
    }

    private handleRootSubmit(root: HTMLElement, event: Event): void {
        const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>('form');
        if (!form || !root.contains(form)) return;
        if (form.matches('[data-newtab-type-form]')) {
            event.preventDefault();
            this.submitTypeWordAnswer(root);
            return;
        }
        if (form.matches('[data-newtab-recall-form]')) {
            event.preventDefault();
            this.submitRecallAnswer(root);
            return;
        }
        if (!form.matches('[data-newtab-search]')) return;
        event.preventDefault();
        this.searchController.performSearchFromInput(root);
    }

    private handleRootInput(root: HTMLElement, event: Event): void {
        const typeInput = event.target instanceof HTMLInputElement
            ? event.target.closest<HTMLInputElement>('[data-newtab-type-input]')
            : null;
        if (typeInput && root.contains(typeInput)) {
            const card = this.visibleWords[this.index];
            if (card) {
                const state = this.ensureStepState(cardKey(card));
                state.type = { ...state.type, answer: typeInput.value, feedback: undefined };
                const answer = typeInput.closest<HTMLElement>('[data-newtab-answer]');
                if (answer) answer.dataset.typeWordOutcome = 'pending';
                answer?.querySelector<HTMLElement>('[data-newtab-type-result]')?.remove();
            }
            return;
        }
        const recallInput = event.target instanceof HTMLInputElement
            ? event.target.closest<HTMLInputElement>('[data-newtab-recall-input]')
            : null;
        if (recallInput && root.contains(recallInput)) {
            this.updateRecallAnswer(root, recallInput.value, false);
            return;
        }
        const input = event.target instanceof HTMLInputElement
            ? event.target.closest<HTMLInputElement>('[data-newtab-search-input]')
            : null;
        if (!input || !root.contains(input)) return;
        this.searchController.onSearchInput(root, input.value);
    }

    private handleRootChange(root: HTMLElement, event: Event): void {
        const target = eventTargetElement(event.target);
        const sourceSelect = target?.closest<HTMLSelectElement>('[data-newtab-source-select]');
        if (sourceSelect && root.contains(sourceSelect)) {
            const source = concreteNewTabSourceFromValue(sourceSelect.value);
            if (source) void this.switchReviewSource(root, source);
            return;
        }
        const targetSelect = target?.closest<HTMLSelectElement>('[data-newtab-grade-target-select]');
        if (targetSelect && root.contains(targetSelect)) {
            this.updateMainGradeTargetLabel(root, targetSelect.selectedOptions[0] ?? null);
            targetSelect.closest<HTMLDetailsElement>('[data-newtab-grade-target]')?.removeAttribute('open');
            return;
        }
        const selectPage = target?.closest<HTMLInputElement>('[data-browse-select-page]');
        if (selectPage && root.contains(selectPage)) {
            root.querySelectorAll<HTMLInputElement>('[data-browse-select]').forEach(box => { box.checked = selectPage.checked; });
            this.syncBrowseBulkControls(root);
            return;
        }
        if (target?.closest('[data-browse-select]')) {
            this.syncBrowseBulkControls(root);
            return;
        }
        const browseSort = target?.closest<HTMLSelectElement>(newTabActionSelector('browse-sort'));
        if (browseSort && root.contains(browseSort)) {
            this.applyBrowseSortChange(root, browseSort.value);
            return;
        }
        const filterSelect = target?.closest<HTMLSelectElement>('[data-newtab-filter-select]');
        if (filterSelect && root.contains(filterSelect)) {
            this.applyBrowseFilterChange(root, filterSelect.value);
            return;
        }
        const deckSelect = target?.closest<HTMLSelectElement>('[data-newtab-deck-select]');
        if (deckSelect && root.contains(deckSelect)) {
            this.applyDeckSelectChange(root, deckSelect);
            return;
        }
        const input = event.target instanceof HTMLInputElement
            ? event.target.closest<HTMLInputElement>('[data-stats-jpdb-file]')
            : null;
        if (!input || !root.contains(input)) return;
        const file = input.files?.[0];
        if (file) void this.statsController.importJpdbFile(root, file);
        input.value = '';
    }

    private applyBrowseSortChange(root: HTMLElement, value: string): void {
        const previousSort = this.browseSort;
        this.browseSort = value === 'alpha' || value === 'frequency' || value === 'history' ? value : 'queue';
        if (this.browseSort === 'history' && previousSort !== 'history') this.browseSortDescending = true;
        this.browsePage = 0;
        const mount = this.searchResultsMount(root);
        if (mount && this.state.route === 'search') this.renderBrowseResults(mount);
    }

    private applyBrowseFilterChange(root: HTMLElement, value: string): void {
        const filterGeneration = ++this.browseFilterGeneration;
        const filter = normalizeNewTabUiState({ ...this.state, filter: value as NewTabUiState['filter'] }).filter;
        if (filter === 'study') {
            this.setState({ filter, revealAnswer: false }, root, { preserveWord: false });
            return;
        }
        // Non-study filters browse the FULL pool (the scheduled-queue
        // loader drops known/blacklisted cards), so merge the browse
        // pool in before applying — same data the My Cards browser uses.
        const browseGeneration = this.browsePoolGeneration;
        void this.loadBrowsePool().then(cards => this.applyLoadedBrowseFilter(
            cards,
            filter,
            filterGeneration,
            browseGeneration,
            root,
        ));
    }

    private applyLoadedBrowseFilter(
        cards: JPDBCard[],
        filter: NewTabUiState['filter'],
        filterGeneration: number,
        browseGeneration: number,
        root: HTMLElement,
    ): void {
        if (!this.canApplyLoadedBrowseFilter(filterGeneration, browseGeneration, root)) return;
        this.allWords = dedupeWords([...this.allWords, ...cards.map(normalizeNewTabCard)]);
        this.setState({ filter, revealAnswer: false }, root, { preserveWord: false });
    }

    private canApplyLoadedBrowseFilter(
        filterGeneration: number,
        browseGeneration: number,
        root: HTMLElement,
    ): boolean {
        return [
            filterGeneration === this.browseFilterGeneration,
            browseGeneration === this.browsePoolGeneration,
            this.currentRoot() === root,
            this.state.route === 'study',
        ].every(Boolean);
    }

    private applyDeckSelectChange(root: HTMLElement, deckSelect: HTMLSelectElement): void {
        if (this.state.route === 'search') {
            this.state = { ...this.state, jpdbDeck: deckSelect.value };
            this.persistState();
            this.invalidateBrowsePool();
            this.browsePage = 0;
            void this.renderBrowseInto(root);
            return;
        }
        const pickedDeck = deckSelect.value === 'all' && this.state.source === 'anki' ? '' : deckSelect.value;
        this.state = this.state.source === 'anki'
            ? { ...this.state, ankiDeck: pickedDeck, revealAnswer: false }
            : { ...this.state, jpdbDeck: deckSelect.value, revealAnswer: false };
        this.persistState();
        this.invalidateSourceResultCache(this.state.source === 'anki' ? 'anki' : 'jpdb');
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.index = 0;
        this.setStatus(root, this.text('loading'));
        void this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private handleRootEnterKeydown(root: HTMLElement, event: KeyboardEvent): void {
        if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        if (!input || !root.contains(input)) return;
        const typeInput = input.closest<HTMLInputElement>('[data-newtab-type-input]');
        if (typeInput) {
            event.preventDefault();
            this.submitTypeWordAnswer(root);
            return;
        }
        const recallInput = input.closest<HTMLInputElement>('[data-newtab-recall-input]');
        if (!recallInput) return;
        event.preventDefault();
        this.submitRecallAnswer(root);
    }

    private handleStatsDragOver(root: HTMLElement, event: Event): void {
        const dropzone = this.statsDropzoneTarget(root, event);
        if (!dropzone) return;
        event.preventDefault();
        dropzone.dataset.dragging = 'true';
    }

    private handleStatsDragLeave(root: HTMLElement, event: Event): void {
        const dropzone = this.statsDropzoneTarget(root, event);
        if (!dropzone) return;
        dropzone.dataset.dragging = 'false';
    }

    private handleStatsDrop(root: HTMLElement, event: DragEvent): void {
        const dropzone = this.statsDropzoneTarget(root, event);
        if (!dropzone) return;
        event.preventDefault();
        dropzone.dataset.dragging = 'false';
        const file = event.dataTransfer?.files?.[0];
        if (file) void this.statsController.importJpdbFile(root, file);
    }

    private syncConnectivityIndicator(root: HTMLElement): void {
        const indicator = root.querySelector<HTMLElement>('[data-newtab-connectivity]');
        if (!indicator) return;
        const offline = navigator.onLine === false;
        indicator.hidden = !offline;
        indicator.dataset.connectivity = offline ? 'offline' : 'online';
        indicator.textContent = this.text('offlineReady');
    }

    private statsDropzoneTarget(root: HTMLElement, event: Event): HTMLElement | null {
        const dropzone = eventTargetElement(event.target)?.closest<HTMLElement>('[data-stats-dropzone]');
        return dropzone && root.contains(dropzone) ? dropzone : null;
    }

    private handleRootClick(root: HTMLElement, event: MouseEvent): void {
        if (handleReaderActionPillLink(event)) return;
        const request = this.rootClickRequest(event);
        if (!request) return;
        if (request.action) {
            this.dependencies.dismissLookup?.();
            if (this.handleRootImmersionClick(root, request.target, event)) return;
            request.target.closest<HTMLDetailsElement>('.jpdb-reader-newtab-more')?.removeAttribute('open');
            if (this.handleRootClickActions(root, request.target, event, request.action)) return;
        }
        if (!request.action && this.handleStatsClick(root, request.target, event, request.action)) return;
        if (this.handleNestedLookupClick(root, request.target, event)) return;
        if (!request.action) {
            this.dependencies.dismissLookup?.();
            if (this.handleStatsClick(root, request.target, event, request.action)) return;
            if (this.handleRootImmersionClick(root, request.target, event)) return;
            if (this.handleRootClickActions(root, request.target, event, request.action)) return;
        }
        if (this.shouldIgnoreRootStudyClick(root)) return;
        if (this.handleRootStudyActionClick(root, request.target, event, request.action)) return;
        this.handleStudyCardClick(root, request.target, event);
    }

    private rootClickRequest(event: MouseEvent): RootClickRequest | null {
        const target = eventTargetElement(event.target);
        if (!target) return null;
        return { target, action: nearestNewTabAction(target) };
    }

    private handleRootClickActions(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: NewTabAction | undefined): boolean {
        return this.rootClickHandlers.some(handler => handler(root, target, event, action));
    }

    private shouldIgnoreRootStudyClick(root: HTMLElement): boolean {
        return root.dataset.standaloneNewtab === 'true' && !this.allWords.length;
    }

    private handleRootKeydown(root: HTMLElement, event: KeyboardEvent): void {
        if (!root.isConnected) return;
        const target = eventTargetElement(event.target);
        if (this.shouldIgnoreRootKeydown(root)) return;
        if (this.handleImmersionTranslationKeydown(root, event, target)) return;
        if (this.handleSearchModeKeydown(root, event, target)) return;
        if (target && isNewTabKeyboardCaptureBlockedTarget(target)) return;
        if (target && isNewTabStudyInteractiveTarget(target)) return;
        this.handleStudyKeydown(root, event, target);
    }

    private shouldIgnoreRootKeydown(root: HTMLElement): boolean {
        return root.dataset.standaloneNewtab === 'true' && !this.allWords.length;
    }

    private handleImmersionTranslationKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): boolean {
        if (!target || !isNewTabRevealKey(event.key)) return false;
        const translation = target.closest<HTMLElement>('.jpdb-reader-example-translation');
        if (!translation || !root.contains(translation)) return false;
        event.preventDefault();
        this.toggleNewTabImmersionTranslations(root);
        return true;
    }

    private handleSearchModeKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): boolean {
        if (this.state.route !== 'search') return false;
        this.searchController.handleSearchKeydown(root, event, target);
        return true;
    }

    private handleStudyKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): void {
        if (this.state.route !== 'study') return;
        if (this.activeStudyStepIsListen()) {
            this.handleListenKeydown(root, event, target);
            return;
        }
        const settings = this.dependencies.getSettings();
        const direction = this.studyNavigationDirection(event, settings);
        if (direction) {
            event.preventDefault();
            if (!this.navigateStudyStep(direction)) this.showWordInDirection(direction);
            return;
        }
        if (this.matchesStudyRevealShortcut(root, event, target, settings)) {
            event.preventDefault();
            this.dismissKeyHints(root);
            this.toggleReveal(root);
            return;
        }
        // UT-40: U undoes the last review where an undo affordance exists
        // (jpdb.io parity for keyboard-only reviewing).
        if (matchesShortcut(event, settings.shortcuts.studyUndo) && this.canUndoLastReview()) {
            event.preventDefault();
            this.dismissKeyHints(root);
            void this.undoLastReview(root);
            return;
        }
        this.handleGradeShortcutKeydown(root, event, settings);
    }

    private studyNavigationDirection(event: KeyboardEvent, settings: ReaderSettings): PointerNavigationDirection | null {
        if (this.matchesAnyStudyShortcut(event, settings, ['studyNext', 'studyNextAlternate'])) return 'next';
        if (this.matchesAnyStudyShortcut(event, settings, ['studyPrevious', 'studyPreviousAlternate'])) return 'previous';
        return null;
    }

    private matchesStudyRevealShortcut(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null, settings: ReaderSettings): boolean {
        if (!this.matchesAnyStudyShortcut(event, settings, ['studyReveal', 'studyRevealAlternate'])) return false;
        return !isNewTabEnterRevealKey(event.key) || this.canRevealFromEnterTarget(root, target);
    }

    private matchesAnyStudyShortcut(
        event: KeyboardEvent,
        settings: ReaderSettings,
        names: Array<keyof ReaderSettings['shortcuts']>,
    ): boolean {
        return names.some(name => matchesShortcut(event, settings.shortcuts[name]));
    }

    // UT-34: inline kbd hints exist only until the user proves they know the
    // shortcuts — the first keyboard reveal/grade hides them permanently
    // (shortcuts stay listed in settings).
    private dismissKeyHints(root: HTMLElement): void {
        if (this.state.keyHintsDismissed) return;
        this.state = { ...this.state, keyHintsDismissed: true };
        this.persistState();
        this.syncKeyHintVisibility(root);
    }

    private syncKeyHintVisibility(root: HTMLElement): void {
        root.classList.toggle('jpdb-reader-newtab-key-hints-dismissed', this.state.keyHintsDismissed);
    }

    private handleGradeShortcutKeydown(root: HTMLElement, event: KeyboardEvent, settings: ReaderSettings): void {
        if (!this.state.revealAnswer) return;
        const card = this.visibleWords[this.index];
        const candidates = usesBunproFsrsGradeScale(card)
            ? BUNPRO_FSRS_REVIEW_SHORTCUTS
            : this.currentStudyUsesTwoButtonGradeScale(root, settings)
                ? TWO_BUTTON_REVIEW_SHORTCUTS
                : FIVE_BUTTON_REVIEW_SHORTCUTS;
        const grade = matchedReviewShortcutGrade(event, settings.shortcuts, candidates);
        if (!grade) return;
        const button = root.querySelector<HTMLButtonElement>(newTabActionSelector('grade', `[data-grade="${grade}"]:not([disabled])`));
        if (!button) return;
        event.preventDefault();
        this.dismissKeyHints(root);
        button.click();
    }

    private currentStudyUsesTwoButtonGradeScale(root: HTMLElement, settings: ReaderSettings): boolean {
        if (usesTwoButtonNewTabGradeScale(settings, this.visibleWords[this.index])) return true;
        // The rendered controls are the authoritative interaction surface. A
        // live queue refresh can replace the backing array while the revealed
        // card is still on screen; keep keyboard/swipe input aligned with the
        // visible Hard/Good row until that render is replaced.
        return Boolean(root.querySelector(`[data-newtab-study] ${newTabActionSelector('grade', '[data-grade="pass"]')}`));
    }

    private canRevealFromEnterTarget(root: HTMLElement, target: HTMLElement | null): boolean {
        if (!target) return true;
        return target === root || Boolean(target.closest('[data-newtab-study]'));
    }

    private handleRootImmersionClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const immersionAction = target.closest<HTMLElement>('[data-immersion-action]')?.dataset.immersionAction;
        const translation = target.closest<HTMLElement>('.jpdb-reader-example-translation');
        if (translation && root.contains(translation)) {
            event.preventDefault();
            this.toggleNewTabImmersionTranslations(root);
            return true;
        }
        if (immersionAction) {
            event.preventDefault();
            const kanjiImmersion = target.closest<HTMLElement>('[data-newtab-kanji-immersion]');
            if (kanjiImmersion && root.contains(kanjiImmersion)) {
                this.performNewTabKanjiImmersionAction(root, kanjiImmersion, immersionAction);
            } else {
                const immersion = target.closest<HTMLElement>('.jpdb-reader-newtab-immersion') ?? root;
                this.performNewTabImmersionAction(root, immersion, immersionAction);
            }
            return true;
        }
        return false;
    }

    private handleRootUtilityClick(root: HTMLElement, event: MouseEvent, action: NewTabAction | undefined): boolean {
        if (action === 'settings') {
            event.preventDefault();
            this.dependencies.showSettings('api');
            return true;
        }
        if (action === 'theme') {
            event.preventDefault();
            void this.toggleTheme(root);
            return true;
        }
        if (action === 'language') {
            event.preventDefault();
            void this.toggleInterfaceLanguage(root);
            return true;
        }
        if (action === 'install-app') {
            event.preventDefault();
            void this.installStudyApp(root);
            return true;
        }
        if (action === 'dismiss-support-banner') {
            event.preventDefault();
            this.dismissSupportBanner(root);
            return true;
        }
        return false;
    }

    private async installStudyApp(root: HTMLElement): Promise<void> {
        if (this.isStandalonePwa()) {
            this.syncInstallAppButton(root);
            this.dependencies.toast?.(this.text('installStudyAppInstalled'));
            return;
        }
        const prompt = this.installPrompt;
        if (!prompt) {
            this.dependencies.toast?.(this.text('installStudyAppManual'));
            return;
        }
        this.installPrompt = null;
        this.syncInstallAppButton(root);
        try {
            await prompt.prompt();
            const choice = await prompt.userChoice?.catch(() => null);
            if (choice?.outcome === 'accepted') this.dependencies.toast?.(this.text('installStudyAppInstalled'));
        } catch {
            this.dependencies.toast?.(this.text('installStudyAppManual'));
        }
    }

    private syncInstallAppButton(root: HTMLElement): void {
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-install-app]');
        if (!button) return;
        const standalone = this.isStandalonePwa();
        const promptAvailable = Boolean(this.installPrompt);
        button.disabled = standalone;
        button.dataset.installPromptAvailable = String(promptAvailable);
        const status = standalone
            ? this.text('installStudyAppInstalled')
            : this.text(promptAvailable ? 'installStudyAppReady' : 'installStudyAppManual');
        button.title = status;
        button.setAttribute('aria-label', this.text('installStudyApp'));
        const description = button.querySelector<HTMLElement>('.jpdb-reader-newtab-menu-description');
        if (description) description.textContent = status;
    }

    private async syncSupportBanner(root: HTMLElement): Promise<void> {
        const banner = root.querySelector<HTMLElement>('[data-newtab-support-banner]');
        if (!banner) return;
        if (!this.shouldRequestSupportBanner()) {
            this.hideSupportBanner(banner);
            return;
        }
        try {
            const status = await this.fetchSupportStatus();
            if (!root.contains(banner)) return;
            if (!this.shouldShowSupportBanner(status)) {
                this.hideSupportBanner(banner);
                return;
            }
            this.renderSupportBanner(banner, status);
        } catch {
            this.hideSupportBanner(banner);
        }
    }

    private shouldRequestSupportBanner(): boolean {
        if (this.options.surface === 'academy') return false;
        try {
            return location.origin === new URL(DOCS_BASE_URL).origin;
        } catch {
            return false;
        }
    }

    private async fetchSupportStatus(): Promise<NewTabSupportStatus> {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2400);
        try {
            const response = await fetch(SUPPORT_STATUS_URL, {
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: controller.signal,
            });
            if (!response.ok) throw new Error('Support status unavailable');
            return await response.json() as NewTabSupportStatus;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    private shouldShowSupportBanner(status: NewTabSupportStatus): boolean {
        if (status.banner?.enabled === false) return false;
        if (newTabReadySupportProviders(status).length === 0) return false;
        if (!newTabSupportGoalAvailable(status)) return false;
        return shouldShowNewTabSupportBannerImpression(newTabSupportDismissVersion(status));
    }

    private renderSupportBanner(banner: HTMLElement, status: NewTabSupportStatus): void {
        const version = newTabSupportDismissVersion(status);
        const providers = newTabReadySupportProviders(status);
        banner.dataset.supportDismissVersion = version;
        banner.replaceChildren(
            el('div', { class: 'jpdb-reader-newtab-support-copy' },
                el('strong', {}, this.text(status.goalMet ? 'supportBannerFunded' : 'supportBannerMessage')),
                el('span', {}, newTabSupportMeta(status, this.language())),
                el('a', {
                    class: 'jpdb-reader-newtab-support-breakdown',
                    href: new URL('/support#monthly-running-costs', DOCS_BASE_URL).href,
                }, this.text('supportBannerBreakdown')),
            ),
            el('div', { class: 'jpdb-reader-newtab-support-actions' },
                ...providers.map(provider => el('a', {
                    class: 'jpdb-reader-newtab-support-donate',
                    dataset: { supportProvider: provider.id ?? '' },
                    href: provider.url,
                    target: '_blank',
                    rel: 'noopener',
                }, provider.id === 'stripe'
                    ? this.text('donate')
                    : (provider.label || provider.id || this.text('donate')))),
                el('button', {
                    class: 'jpdb-reader-newtab-support-close',
                    type: 'button',
                    dataset: { newtabAction: newTabAction('dismiss-support-banner') },
                    'aria-label': this.text('supportBannerDismiss'),
                }, '×'),
            ),
        );
        banner.hidden = false;
    }

    private hideSupportBanner(banner: HTMLElement): void {
        banner.hidden = true;
        banner.replaceChildren();
        delete banner.dataset.supportDismissVersion;
    }

    private dismissSupportBanner(root: HTMLElement): void {
        const banner = root.querySelector<HTMLElement>('[data-newtab-support-banner]');
        if (!banner) return;
        rememberNewTabSupportBannerDismissal(banner.dataset.supportDismissVersion || 'ultimate-audio-monthly-v1');
        this.hideSupportBanner(banner);
    }

    private isStandalonePwa(): boolean {
        if (typeof navigator === 'undefined') return false;
        const nav = navigator as Navigator & { standalone?: boolean };
        return Boolean(nav.standalone)
            || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
    }

    private handleRootModeClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: NewTabAction | undefined): boolean {
        return action === 'mode' ? this.activateRouteFromClick(root, target, event) : false;
    }

    private activateRouteFromClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): true {
        event.preventDefault();
        const requested = target.closest<HTMLElement>('[data-mode]')?.dataset.mode;
        const route: NewTabRoute = requested === 'search' || requested === 'stats' ? requested : 'study';
        if (route === 'study') {
            const step = requested === 'kanji' ? this.studyStepForKind('kanji-doodle') : null;
            this.setStudyStepOverrideForCurrentCard(step?.id ?? null);
        }
        this.setState({ route, revealAnswer: false }, root, { preserveWord: true });
        return true;
    }

    private handleRootStudyActionClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: NewTabAction | undefined): boolean {
        const handler = action ? this.studyClickHandlers[action] : undefined;
        if (!handler) return false;
        event.preventDefault();
        handler(root, target, event);
        return true;
    }

    private activateStudyStepFromClick(root: HTMLElement, target: HTMLElement): void {
        const button = target.closest<HTMLElement>('[data-study-step-id]');
        const id = button?.dataset.studyStepId;
        const step = id ? this.studyStepForId(id) : null;
        if (step) this.activateStudyStep(root, step);
    }

    private activateStudyStep(root: HTMLElement, step: NewTabStudyStep): void {
        if (step.kind === 'final-reveal') {
            const card = this.visibleWords[this.index];
            this.studyStepOverride = null;
            if (card?.reviewSource === 'jpdb-live' && !this.state.revealAnswer) this.dependencies.jpdbReviewBridge.reveal();
            this.setState({ route: 'study', revealAnswer: true }, root, { preserveWord: true });
            this.maybeAutoPlayRevealedImmersionAudio(card, true);
            return;
        }
        this.setStudyStepOverrideForCurrentCard(step.id);
        // A kanji-doodle step on a WORD card renders in-session via the step
        // override — switching the old queue mode to 'kanji' here jumped to the kanji
        // QUEUE, re-resolving the visible card to a synthetic per-kanji card
        // (owner: pressing Kanji 2 "takes back to old view"). Only real kanji
        // cards study in kanji mode. Listen/Speak steps likewise render
        // in-session for EVERY card: switching to mode 'listen' re-pooled the
        // queue through the pitch-gated listen tab and dropped cards whose
        // pitch had not enriched yet (the whole flow shape then depended on
        // the review provider).
        this.setState({ route: 'study', revealAnswer: false }, root, { preserveWord: true });
    }

    private async dismissStudyTour(root: HTMLElement): Promise<void> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabStudyTourSeen) {
            settings.newTabStudyTourSeen = true;
            await this.dependencies.onSettingsChange(['newTabStudyTourSeen']);
        }
        const card = this.visibleWords[this.index];
        if (card) this.renderWord(root, card);
    }

    private navigateFromPointer(direction: PointerNavigationDirection, event: MouseEvent): void {
        if (this.navigateStudyStep(direction)) return;
        if (!this.acceptPointerNavigation(direction, event)) return;
        this.showWordInDirection(direction);
    }

    private showWordInDirection(direction: PointerNavigationDirection): void {
        if (direction === 'next') this.showNextWord();
        else this.showPreviousWord();
    }

    private navigateStudyStep(direction: PointerNavigationDirection): boolean {
        const root = this.currentRoot();
        const card = this.visibleWords[this.index];
        if (!root || !card || this.state.route === 'search' || this.state.route === 'stats') return false;
        const session = this.studySessionForCard(card, this.shouldRenderCardAsKanji(card));
        const activeIndex = session.steps.findIndex(step => step.id === session.activeStep.id);
        if (activeIndex < 0) return false;
        const nextIndex = direction === 'next' ? activeIndex + 1 : activeIndex - 1;
        const next = session.steps[nextIndex];
        if (!next) return false;
        this.activateStudyStep(root, next);
        return true;
    }

    private gradeFromStudyClick(root: HTMLElement, target: HTMLElement): void {
        const command = readCardCommandCapability(target.closest('[data-grade]'));
        if (command?.grade) void this.gradeCurrentCard(command.grade, this.selectedMainGradeTarget(root));
    }

    private handleNewTabSwipe(root: HTMLElement, action: NewTabSwipeAction, direction: NewTabSwipeDirection): void {
        // The final-reveal grade swipe wins whenever it is armed: a horizontal
        // drag there submits again/good exactly as before. Everywhere else the
        // same drag walks the study steps instead of grading.
        if (this.canSwipeCurrentStudyCard()) {
            const settings = this.dependencies.getSettings();
            const grade = newTabSwipeGrade(action, { twoButtonReviews: this.currentStudyUsesTwoButtonGradeScale(root, settings) });
            void this.gradeCurrentCard(grade, this.selectedMainGradeTarget(root));
            return;
        }
        if (!this.swipeStartAllowedForStepNavigation(null)) return;
        // Carousel physics, matching the drag: swipe LEFT pulls the next step in
        // (forward), swipe RIGHT brings the previous one back.
        this.navigateStudyStep(direction === 'left' ? 'next' : 'previous');
    }

    // Distinguishes the grade swipe (red/green fail/pass edge glow) from a
    // step-nav swipe (neutral edge hint) so navigating never flashes a
    // misleading "fail" colour. The attribute is cleared at rest; the card
    // slide/rotate the engine applies is direction-neutral and reads for both.
    private syncSwipeAffordance(root: HTMLElement, progress: NewTabSwipeProgress): void {
        if (!progress.direction || progress.progress <= 0) {
            delete root.dataset.newtabSwipeMode;
            return;
        }
        root.dataset.newtabSwipeMode = this.canSwipeCurrentStudyCard() ? 'grade' : 'nav';
    }

    private canSwipeCurrentStudyCard(): boolean {
        if (!this.dependencies.getSettings().newTabSwipeReviews) return false;
        const card = this.visibleWords[this.index];
        // Swipes submit real provider grades, so they obey the same gate as
        // the grade shortcuts and buttons: answer revealed, final-reveal step.
        // A horizontal drag mid Kanji/Recall/Listen step must never grade a
        // card whose answer was never shown.
        return Boolean(
            card
            && this.state.route !== 'search'
            && this.state.route !== 'stats'
            && this.state.revealAnswer
            && this.isFinalRevealStep(card)
            && this.canReviewCard(card),
        );
    }

    // Horizontal step-nav swipes ride the same enablement flag as grade swipes
    // (newTabSwipeReviews) — one "swipe cards" toggle, no extra settings UI. A
    // nav swipe never submits a grade, so it is allowed on every non-final step
    // (and on the final reveal only while grading is NOT armed, e.g. answer
    // hidden or unreviewable). It is refused when the drag starts on a surface
    // that owns the pointer: the doodle/handwriting canvas, text inputs, the
    // pitch/pos picker buttons, or any [data-action] control. That start-target
    // test mirrors isNewTabStudyInteractiveTarget; the engine already drops the
    // gesture on vertical intent, so scrolling stays intact.
    private swipeStartAllowedForStepNavigation(target: HTMLElement | null): boolean {
        if (!this.dependencies.getSettings().newTabSwipeReviews) return false;
        const card = this.visibleWords[this.index];
        if (!card || this.state.route === 'search' || this.state.route === 'stats') return false;
        if (target && isNewTabStudyInteractiveTarget(target)) return false;
        const session = this.studySessionForCard(card, this.shouldRenderCardAsKanji(card));
        return session.steps.length > 1;
    }

    private handleStudyCardClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): void {
        if (this.state.route === 'search') return;
        const card = this.visibleWords[this.index];
        if (!card || !this.isFinalRevealStep(card)) return;
        const study = target.closest<HTMLElement>('[data-newtab-study]');
        if (study && !isNewTabStudyInteractiveTarget(target)) {
            event.preventDefault();
            this.toggleReveal(root);
        }
    }

    // Thin forwarder to the stats surface (rootClickHandlers + handleRootClick
    // dispatch stats-* actions and chart-day taps through here).
    private handleStatsClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action?: NewTabAction): boolean {
        return this.statsController.handleClick(root, target, event, action);
    }

    private hasCoarsePointer(): boolean {
        return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    }

    private acceptPointerNavigation(action: 'next' | 'previous', event: MouseEvent): boolean {
        const time = event.timeStamp || Date.now();
        if (
            this.lastPointerNavigation?.action === action
            && time - this.lastPointerNavigation.time < NEW_TAB_NAVIGATION_DEDUPE_MS
        ) return false;
        this.lastPointerNavigation = { action, time };
        return true;
    }

    private handleNestedLookupClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const dictionaryLink = target.closest<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]');
        if (dictionaryLink && root.contains(dictionaryLink)) return this.handleNestedDictionaryLink(root, dictionaryLink, event);

        const actionTarget = this.resolveNestedActionTarget(target.closest<HTMLElement>('[data-action]'));
        if (actionTarget && root.contains(actionTarget) && !actionTarget.classList.contains('jpdb-reader-word')) {
            return this.handleNestedLookupAction(root, actionTarget, event);
        }
        if (this.handleParsedWordLookup(root, target, event)) return true;
        if (actionTarget && root.contains(actionTarget)) return this.handleNestedLookupAction(root, actionTarget, event);
        return this.handlePromptLookupClick(root, target, event);
    }

    // A per-kanji drilldown button is only legitimate where the renderer opted
    // the surrounding word into kanji navigation — every such surface marks its
    // headword host with [data-jpdb-reader-kanji-nav] (revealed study headword,
    // search/popover spelling). A kanji affordance nested in a .jpdb-reader-word
    // WITHOUT that host is stale/leaked (e.g. an unrevealed study prompt where a
    // click must open the word itself, not a kanji popup): promote the target to
    // the enclosing word so its own "lookup" action wins. Kanji chips outside a
    // word (composed-of, component cards) carry no word ancestor and pass through
    // unchanged.
    private resolveNestedActionTarget(actionTarget: HTMLElement | null): HTMLElement | null {
        if (!actionTarget || actionTarget.dataset.action !== 'kanji') return actionTarget;
        const word = actionTarget.closest<HTMLElement>('.jpdb-reader-word');
        if (!word || actionTarget.closest('[data-jpdb-reader-kanji-nav]')) return actionTarget;
        return word;
    }

    private handleParsedWordLookup(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const request = this.parsedWordLookupRequest(root, target, event);
        if (!request) return false;
        consumeNestedLookupEvent(event);
        this.performParsedWordLookup(root, request);
        return true;
    }

    private parsedWordLookupRequest(root: HTMLElement, target: HTMLElement, event: MouseEvent): ParsedWordLookupRequest | null {
        const word = this.parsedWordLookupTarget(root, target, event);
        if (!word) return null;
        const expression = cleanNestedLookupValue(word.dataset.expression) || cleanNestedLookupValue(readerWordSurfaceText(word));
        if (!expression) return null;
        return {
            word,
            expression,
            reading: cleanNestedLookupValue(word.dataset.reading) || expression,
            sentence: word.dataset.sentence || expression,
            card: this.cachedCardForRenderedWord(word),
        };
    }

    private performParsedWordLookup(root: HTMLElement, request: ParsedWordLookupRequest): void {
        if (this.state.route === 'search') {
            this.searchController.selectSearchSuggestion(root, request.expression);
            return;
        }
        // A rendered Study word is the last authoritative boundary before the
        // popover. Its card wrapper and the provider source can temporarily be
        // different objects while pitch enrichment settles, so restore the
        // exact rendered contour onto whichever source card wins this lookup.
        const sourceReviewCard = renderedWordCardForLookup(
            request.word,
            this.sourceReviewLookupCardForTarget(request.word),
        );
        if (sourceReviewCard && this.dependencies.showLookupCard) {
            void this.dependencies.showLookupCard(sourceReviewCard, request.sentence, request.word, this.nestedLookupOptions());
            return;
        }
        if (request.card && this.dependencies.showLookupCard) {
            void this.dependencies.showLookupCard(request.card, request.sentence, request.word, this.nestedLookupOptions());
            return;
        }
        void this.dependencies.lookupText?.(request.expression, request.reading, request.word, this.nestedLookupOptions());
    }

    private parsedWordLookupTarget(root: HTMLElement, target: HTMLElement, event: MouseEvent): HTMLElement | null {
        const direct = target.closest<HTMLElement>('.jpdb-reader-parseable .jpdb-reader-word');
        if (direct && root.contains(direct)) return isPassiveParsedWord(direct) ? null : direct;
        if (event.clientX === 0 && event.clientY === 0) return null;
        for (const word of root.querySelectorAll<HTMLElement>('.jpdb-reader-parseable .jpdb-reader-word')) {
            if (!isPassiveParsedWord(word) && pointInElementClientRects(event.clientX, event.clientY, word)) return word;
        }
        return null;
    }

    private cachedCardForRenderedWord(word: HTMLElement): JPDBCard | undefined {
        const getCachedCard = (this.dependencies.parser as ReaderParser & { getCachedCard?: (vid: number, sid: number) => JPDBCard | undefined }).getCachedCard;
        const cachedCard = typeof getCachedCard === 'function'
            ? getCachedCard.call(this.dependencies.parser, Number(renderedWordPrivateValue(word, 'vid')), Number(renderedWordPrivateValue(word, 'sid')))
            : undefined;
        return renderedWordCardForLookup(word, cachedCard)
            ?? renderedWordCardForLookup(word, this.visibleWords[this.index]);
    }

    private handlePromptLookupClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const request = this.promptLookupRequest(root, target);
        if (!request) return false;
        consumeNestedLookupEvent(event);
        this.performPromptLookup(request);
        return true;
    }

    private promptLookupRequest(root: HTMLElement, target: HTMLElement): PromptLookupRequest | null {
        if (this.state.route !== 'study') return null;
        if (target.closest(NEW_TAB_STUDY_INTERACTIVE_SELECTOR)) return null;
        const prompt = target.closest<HTMLElement>('[data-newtab-prompt]');
        const card = this.visibleWords[this.index];
        return prompt && root.contains(prompt) && card ? { prompt, card } : null;
    }

    private performPromptLookup(request: PromptLookupRequest): void {
        const lookupCard = this.sourceReviewLookupCard(request.card);
        if (this.dependencies.showLookupCard && lookupCard) {
            void this.dependencies.showLookupCard(lookupCard, lookupCard.sentence || lookupCard.spelling, request.prompt, this.nestedLookupOptions());
            return;
        }
        void this.dependencies.lookupText?.(request.card.spelling, newTabCardReading(request.card), request.prompt, this.nestedLookupOptions());
    }

    private handleNestedDictionaryLink(root: HTMLElement, link: HTMLAnchorElement, event: MouseEvent): boolean {
        const query = cleanNestedLookupValue(link.dataset.dictionaryLookup);
        if (!query) return false;
        consumeNestedLookupEvent(event);
        if (this.state.route === 'search') {
            this.searchController.selectSearchSuggestion(root, query);
            return true;
        }
        void this.dependencies.lookupDictionaryReference?.(
            query,
            link.dataset.dictionaryReading ?? '',
            link.dataset.dictionary ?? '',
            link,
            this.nestedLookupOptions(),
        );
        return true;
    }

    private nestedLookupOptions(): NewTabLookupDependencyOptions {
        return {
            navigation: 'push-current',
            previousNavigationEntry: this.nestedPreviousNavigationEntry(),
            reuseActivePopover: true,
            userGesture: true,
        };
    }

    private nestedPreviousNavigationEntry(): PopupNavigationEntry | undefined {
        if (this.state.route === 'search') return undefined;
        const card = this.visibleWords[this.index];
        return card ? { kind: 'word', card, sentence: sentenceForCard(card) } : undefined;
    }

    private handleNestedLookupAction(root: HTMLElement, actionTarget: HTMLElement, event: MouseEvent): boolean {
        if (this.nestedCommandRouter.handle(root, actionTarget, event)) return true;
        const action = actionTarget.dataset.action;
        if (action === 'search-word-audio') {
            return this.handleSearchWordAudioAction(actionTarget, event);
        }
        if (action === 'study-word-audio') {
            return this.handleStudyWordAudioAction(actionTarget, event);
        }
        return false;
    }

    private showNestedKanjiCard(card: JPDBCard, kanji: string, actionTarget: HTMLElement): void {
        const showKanjiCard = this.dependencies.showKanjiCard;
        if (showKanjiCard) {
            void showKanjiCard(card, kanji, sentenceForCard(card), actionTarget, this.nestedLookupOptions());
            return;
        }
        void this.dependencies.lookupText?.(kanji, kanji, actionTarget, this.nestedLookupOptions());
    }

    private lookupNestedTerm(expression: string, reading: string, actionTarget: HTMLElement): void {
        void this.dependencies.lookupText?.(expression, reading || expression, actionTarget, this.nestedLookupOptions());
    }

    private showNestedSourceReviewCard(actionTarget: HTMLElement): boolean {
        const sourceReviewCard = this.sourceReviewLookupCardForTarget(actionTarget);
        const showLookupCard = this.dependencies.showLookupCard;
        if (!sourceReviewCard || !showLookupCard) return false;
        void showLookupCard(sourceReviewCard, sentenceForCard(sourceReviewCard), actionTarget, this.nestedLookupOptions());
        return true;
    }

    private jitenKanjiWordsActionContext(): JitenKanjiWordsActionContext | null {
        if (!usesJapaneseCharacterStudy()) return null;
        const jiten = this.dependencies.jiten;
        const lookupKanjiWords = jiten?.lookupKanjiWords;
        if (typeof lookupKanjiWords !== 'function') return null;
        return {
            lookupKanjiWords: (character, options) => lookupKanjiWords.call(jiten, character, options),
            language: () => this.dependencies.getSettings().interfaceLanguage,
        };
    }

    private nestedCardActionCard(target: HTMLElement): JPDBCard | undefined {
        const key = cleanNestedLookupValue(target.closest<HTMLElement>('[data-newtab-card]')?.dataset.newtabCard);
        if (key) {
            return this.studyCardsByDomToken.get(key)
                ?? this.searchController.wordCard(key)
                ?? this.visibleWords.find(card => this.cardMatchesSelectionKey(card, key))
                ?? this.allWords.find(card => this.cardMatchesSelectionKey(card, key));
        }
        return this.visibleWords[this.index];
    }

    private handleSearchWordAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const key = button?.dataset.newtabCard ?? '';
        const card = key ? this.searchController.wordCard(key) : undefined;
        if (!button || !card) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.playWordAudio?.(card);
        return true;
    }

    private handleStudyWordAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const card = this.studyWordAudioCard(actionTarget);
        if (!button || !card) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.playWordAudio?.(card);
        return true;
    }

    private studyWordAudioCard(target: HTMLElement): JPDBCard | undefined {
        const key = cleanNestedLookupValue(target.closest<HTMLElement>('[data-newtab-card]')?.dataset.newtabCard);
        if (key) {
            return this.studyCardsByDomToken.get(key)
                ?? this.allWords.find(card => this.cardMatchesSelectionKey(card, key))
                ?? this.searchController.wordCard(key)
                ?? this.visibleWords.find(card => this.cardMatchesSelectionKey(card, key));
        }
        return this.sourceCardForVisibleCard(this.visibleWords[this.index]);
    }

    private toggleNewTabImmersionTranslations(root: HTMLElement): void {
        const settings = this.dependencies.getSettings();
        const shouldBlur = !settings.immersionKitRevealTranslationOnClick;
        if (this.dependencies.setImmersionTranslationBlurred) {
            this.dependencies.setImmersionTranslationBlurred(shouldBlur);
        } else {
            settings.immersionKitRevealTranslationOnClick = shouldBlur;
            void this.dependencies.onSettingsChange(['immersionKitRevealTranslationOnClick']);
        }
        root.querySelectorAll<HTMLElement>('.jpdb-reader-example-translation').forEach(translation => {
            setNewTabImmersionTranslationBlurred(translation, shouldBlur, settings.interfaceLanguage);
        });
    }

    private toggleReveal(root: HTMLElement): void {
        const current = this.visibleWords[this.index];
        if (current && !this.isFinalRevealStep(current)) {
            if (this.navigateStudyStep('next')) return;
        }
        const willReveal = !this.state.revealAnswer;
        if (current?.reviewSource === 'jpdb-live' && willReveal) this.dependencies.jpdbReviewBridge.reveal();
        this.setState({ revealAnswer: willReveal }, root, { preserveWord: true });
        this.maybeAutoPlayRevealedImmersionAudio(current, willReveal);
    }

    private maybeAutoPlayRevealedImmersionAudio(card: JPDBCard | undefined, revealed: boolean): void {
        const settings = this.dependencies.getSettings();
        if (!revealed || !card || !this.isVocabularyStudyRoute()) return;
        if (!settings.immersionKitEnabled || !settings.immersionKitAutoPlayAudio) return;
        if (!settings.audioEnabled) return;
        if (!canAttemptAudiblePlayback(true)) return;
        void this.playCurrentImmersionAudio(card);
    }

    private applyPalette(): void {
        const settings = this.dependencies.getSettings();
        document.documentElement.style.setProperty('--jpdb-reader-state-new', settings.wordColorNew);
        document.documentElement.style.setProperty('--jpdb-reader-state-learning', settings.wordColorLearning);
        document.documentElement.style.setProperty('--jpdb-reader-state-known', settings.wordColorKnown);
        document.documentElement.style.setProperty('--jpdb-reader-state-due', settings.wordColorDue);
        document.documentElement.style.setProperty('--jpdb-reader-state-failed', settings.wordColorFailed);
        document.documentElement.style.setProperty('--jpdb-reader-state-ignored', settings.wordColorIgnored);
    }

    private async loadWordsInto(root: HTMLElement, preferStoredWord: boolean, options: NewTabLoadOptions = {}): Promise<void> {
        const loadGeneration = ++this.loadGeneration;
        const navigationGeneration = this.navigationGeneration;
        const useOfflineCache = options.useOfflineCache !== false;
        const quiet = options.quiet === true;
        try {
            const usedCachedWords = useOfflineCache
                ? await this.applyOfflineCacheWhileLoading(root, preferStoredWord, loadGeneration)
                : false;
            this.scheduleAutoStudyFallbackPreview(root, preferStoredWord, loadGeneration, usedCachedWords, quiet);
            const result = await this.loadWordsWithProgress(root, loadGeneration, usedCachedWords, quiet);
            if (!this.isCurrentLoad(loadGeneration)) return;
            await this.applyLoadedWords(root, preferStoredWord, loadGeneration, result, useOfflineCache, usedCachedWords, navigationGeneration, {
                excludeCardKeys: options.excludeCardKeys,
                preserveVisibleOrder: options.preserveVisibleOrder,
                quiet,
            });
        } catch (error) {
            await this.handleLoadWordsError(root, preferStoredWord, loadGeneration, error, useOfflineCache, quiet);
        }
    }

    private async loadWordsWithProgress(root: HTMLElement, loadGeneration: number, usedCachedWords = false, quiet = false): Promise<NewTabLoadResult> {
        const onProgress = (message: string): void => {
            if (!quiet && this.isCurrentLoad(loadGeneration)) this.setStatus(root, message);
        };
        if (!usedCachedWords && !quiet) onProgress(this.text('loading'));
        return this.loadWords(onProgress);
    }

    private scheduleAutoStudyFallbackPreview(
        root: HTMLElement,
        preferStoredWord: boolean,
        loadGeneration: number,
        usedCachedWords: boolean,
        quiet: boolean,
    ): void {
        if (!this.shouldScheduleAutoStudyFallbackPreview(usedCachedWords, quiet)) return;
        window.setTimeout(() => {
            void this.applyAutoStudyFallbackPreview(root, preferStoredWord, loadGeneration);
        }, NEW_TAB_PUBLIC_FALLBACK_GRACE_MS);
    }

    private shouldScheduleAutoStudyFallbackPreview(usedCachedWords: boolean, quiet: boolean): boolean {
        return !quiet
            && !usedCachedWords
            && !this.allWords.length
            && this.state.source === 'auto'
            && this.state.route !== 'search'
            && this.state.route !== 'stats';
    }

    private async applyAutoStudyFallbackPreview(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number): Promise<void> {
        if (!this.shouldApplyAutoStudyFallbackPreview(loadGeneration)) return;
        const result = await this.loadLocalOrBuiltInFreshStudyWords();
        if (!this.shouldApplyAutoStudyFallbackPreview(loadGeneration) || !this.currentModeStudyCardCount(result.cards)) return;
        await this.applyLoadedWords(
            root,
            preferStoredWord,
            loadGeneration,
            {
                ...result,
                fallbackNotice: this.hasConfiguredReviewSources(),
            },
            false,
            false,
            this.navigationGeneration,
            { preserveVisibleOrder: true },
        );
    }

    private shouldApplyAutoStudyFallbackPreview(loadGeneration: number): boolean {
        return this.isCurrentLoad(loadGeneration)
            && !this.allWords.length
            && this.state.source === 'auto'
            && this.state.route !== 'search'
            && this.state.route !== 'stats';
    }

    private async applyLoadedWords(
        root: HTMLElement,
        preferStoredWord: boolean,
        loadGeneration: number,
        result: NewTabLoadResult,
        useOfflineCache: boolean,
        usedCachedWords: boolean,
        navigationGeneration: number,
        options: Pick<NewTabLoadOptions, 'excludeCardKeys' | 'preserveVisibleOrder' | 'quiet'> = {},
    ): Promise<void> {
        const preferredCardKey = this.currentVisibleWordKey();
        const preferredCard = this.sourceCardForVisibleCard(this.visibleWords[this.index]);
        const statsStudyFilter = this.statsStudyFilter;
        const loadedWords = this.mergeLoadedWordsWithCachedStudyContext(
            this.loadedWordsForResult(result, options.excludeCardKeys),
            usedCachedWords,
        );
        if (this.shouldKeepCurrentQuietWords(options, loadedWords)) return;
        const nextWords = await this.withPortableUrlCard(this.mergeLoadedWordsWithNavigatedCachedCard(
            loadedWords,
            preferredCard,
            usedCachedWords,
            navigationGeneration,
            result,
        ));
        if (!this.isCurrentLoad(loadGeneration)) return;
        this.allWords = nextWords;
        this.applyLoadedWordState(result, statsStudyFilter);
        this.writeOfflineCacheAfterLoad();
        await this.applyOfflineCacheAfterEmptyLoad(root, loadGeneration, useOfflineCache);
        if (!this.isCurrentLoad(loadGeneration)) return;
        this.dependencies.parser.cacheCards?.(this.allWords);
        void this.flushQueuedGrades();
        await this.renderLoadedWords(root, preferStoredWord, preferredCardKey, options);
    }

    private loadedWordsForResult(result: NewTabLoadResult, excludeCardKeys: string[] | undefined): JPDBCard[] {
        const excludedCardKeys = new Set(excludeCardKeys ?? []);
        return this.filterStatsStudyCards(
            dedupeWords(result.cards.filter(newTabCardMatchesActiveTarget).map(normalizeNewTabCard)),
        ).filter(card => this.shouldIncludeLoadedWord(card, excludedCardKeys));
    }

    private shouldIncludeLoadedWord(card: JPDBCard, excludedCardKeys: Set<string>): boolean {
        return !excludedCardKeys.has(cardKey(card)) && !excludedCardKeys.has(this.cardSelectionKey(card));
    }

    private shouldKeepCurrentQuietWords(options: Pick<NewTabLoadOptions, 'quiet'>, loadedWords: JPDBCard[]): boolean {
        return options.quiet === true && !loadedWords.length && Boolean(this.visibleWords.length);
    }

    private applyLoadedWordState(result: NewTabLoadResult, statsStudyFilter: 'trouble' | null): void {
        this.reviewCountMode = result.reviewCountMode === true;
        this.emptyLoadMessageKey = result.emptyMessageKey ?? null;
        this.fallbackStudyNotice = result.fallbackNotice === true;
        this.sourceLabel = this.loadedWordSourceLabel(result.sourceLabel, statsStudyFilter);
        this.statsStudyFilter = null;
    }

    private loadedWordSourceLabel(sourceLabel: string, statsStudyFilter: 'trouble' | null): string {
        return statsStudyFilter === 'trouble'
            ? `${sourceLabel} · ${this.text('statsStudyTroubleCards')}`
            : sourceLabel;
    }

    private writeOfflineCacheAfterLoad(): void {
        if (this.allWords.length) void this.writeOfflineCache(this.allWords, this.sourceLabel);
    }

    private async applyOfflineCacheAfterEmptyLoad(root: HTMLElement, loadGeneration: number, useOfflineCache: boolean): Promise<void> {
        if (!this.allWords.length && useOfflineCache) await this.applyOfflineCacheIfAvailable(root, loadGeneration);
    }

    private async renderLoadedWords(
        root: HTMLElement,
        preferStoredWord: boolean,
        preferredCardKey: string | null,
        options: Pick<NewTabLoadOptions, 'preserveVisibleOrder'>,
    ): Promise<void> {
        if (!this.allWords.length) {
            await this.renderEmptyWordLoad(root);
            return;
        }
        delete root.dataset.standaloneNewtab;
        this.applyWords(root, preferStoredWord, preferredCardKey ?? '', { preserveOrder: options.preserveVisibleOrder === true });
    }

    private mergeLoadedWordsWithNavigatedCachedCard(
        loadedWords: JPDBCard[],
        preferredCard: JPDBCard | undefined,
        usedCachedWords: boolean,
        navigationGeneration: number,
        result: NewTabLoadResult,
    ): JPDBCard[] {
        if (!this.shouldKeepCurrentCardForBackgroundLoad(loadedWords, preferredCard, usedCachedWords, navigationGeneration, result)) {
            return loadedWords;
        }
        return [normalizeNewTabCard(preferredCard), ...loadedWords];
    }

    private mergeLoadedWordsWithCachedStudyContext(loadedWords: JPDBCard[], usedCachedWords: boolean): JPDBCard[] {
        if (!usedCachedWords || !this.allWords.length || !loadedWords.length) return loadedWords;
        const cachedByKey = new Map(this.allWords.map(card => [cardKey(card), card]));
        const cachedByTerm = new Map(this.allWords.map(card => [`${card.spelling}\u0000${newTabCardReading(card)}`, card]));
        return loadedWords.map(card => this.mergeCachedStudyContextIntoCard(
            card,
            cachedByKey.get(cardKey(card)) ?? cachedByTerm.get(`${card.spelling}\u0000${newTabCardReading(card)}`),
        ));
    }

    private mergeCachedStudyContextIntoCard(card: JPDBCard, cached: JPDBCard | undefined): JPDBCard {
        if (!cached) return card;
        const sentence = card.sentence || cached.sentence;
        const wordWithReading = card.wordWithReading || cached.wordWithReading;
        const fallbackLookupTerms = card.fallbackLookupTerms?.length ? card.fallbackLookupTerms : cached.fallbackLookupTerms;
        if (sentence === card.sentence && wordWithReading === card.wordWithReading && fallbackLookupTerms === card.fallbackLookupTerms) return card;
        return { ...card, sentence, wordWithReading, fallbackLookupTerms };
    }

    private shouldKeepCurrentCardForBackgroundLoad(
        loadedWords: JPDBCard[],
        preferredCard: JPDBCard | undefined,
        usedCachedWords: boolean,
        navigationGeneration: number,
        result: NewTabLoadResult,
    ): preferredCard is JPDBCard {
        return Boolean(
            preferredCard
            && newTabCardMatchesActiveTarget(preferredCard)
            && usedCachedWords
            && this.navigationGeneration !== navigationGeneration
            && result.reviewCountMode !== true
            && !loadedWords.some(card => cardKey(card) === cardKey(preferredCard)),
        );
    }

    private async withPortableUrlCard(cards: JPDBCard[]): Promise<JPDBCard[]> {
        const identity = this.portableCardIdentityFromLocation();
        if (!identity?.spelling || !this.isVocabularyStudyRoute()) return cards;
        if (cards.some(card => this.cardMatchesPortableIdentity(card, identity))) return cards;
        const card = await this.targetResources.lookupPortableCard(
            identity,
            this.dependencies.lookupStudyCard,
            error => log.warn('Portable study URL lookup failed', { identity, error }),
        ).catch(error => {
            log.warn('Could not resolve portable study URL card', { identity, error });
            return null;
        });
        return card ? [this.portableUrlStudyCard(card, identity), ...cards] : cards;
    }

    private portableUrlStudyCard(card: JPDBCard, identity: PortableStudyCardIdentity): JPDBCard {
        const normalized = normalizeNewTabCard(card);
        const reading = identity.reading || newTabCardReading(normalized) || identity.spelling;
        return {
            ...normalized,
            vid: 0,
            sid: 0,
            spelling: identity.spelling,
            reading,
            source: normalized.source === 'fallback' ? 'fallback' : 'local',
            reviewSource: this.dependencies.getSettings().yomuLocalSrsEnabled ? 'yomu-local' : 'dictionary',
            sourceCardKey: normalized.sourceCardKey || cardKey(normalized),
            cardState: normalized.cardState.length ? normalized.cardState : ['new'],
        };
    }

    private sourceCardForVisibleCard(card: JPDBCard | undefined): JPDBCard | undefined {
        if (!card?.sourceCardKey) return card;
        const sourceCard = this.allWords.find(item => cardKey(item) === card.sourceCardKey);
        // Portable/shared cards can be wrapped as a local Study item while
        // pitch resolves asynchronously on that visible wrapper. Popover and
        // grading paths deliberately recover the provider source card, so keep
        // the monotonic pitch enrichment when crossing that seam; otherwise
        // Study can offer Listen/Speak while the same word's popover falsely
        // says that exact pitch is unavailable.
        if (sourceCard && !sourceCard.pitchAccent.length && card.pitchAccent.length) {
            sourceCard.pitchAccent = [...card.pitchAccent];
        }
        return sourceCard ?? card;
    }

    private sourceReviewLookupCard(card: JPDBCard | undefined): JPDBCard | undefined {
        const sourceCard = this.sourceCardForVisibleCard(card);
        const sharedCardWithExactPitch = Boolean(card?.sourceCardKey && sourceCard?.pitchAccent.length);
        return sourceCard && (this.shouldPreserveSourceReviewLookupCard(sourceCard) || sharedCardWithExactPitch)
            ? sourceCard
            : undefined;
    }

    private sourceReviewLookupCardForTarget(target: HTMLElement): JPDBCard | undefined {
        const sourceCard = this.sourceReviewLookupCard(this.visibleWords[this.index]);
        if (!sourceCard || !this.isReviewLookupTarget(target) || !this.lookupTargetMatchesSourceReviewCard(target, sourceCard)) return undefined;
        return sourceCard;
    }

    private shouldPreserveSourceReviewLookupCard(card: JPDBCard): boolean {
        return this.cardReviewSource(card) === 'anki' || isReviewSource(card.reviewSource);
    }

    private isReviewLookupTarget(target: HTMLElement): boolean {
        return Boolean(target.closest('[data-newtab-prompt], .jpdb-reader-newtab-immersion'));
    }

    private lookupTargetMatchesSourceReviewCard(target: HTMLElement, card: JPDBCard): boolean {
        if (renderedWordHasCardIdentity(target, card)) return true;
        return renderedWordTextIdentityMatches(
            card.spelling,
            newTabCardReading(card),
            [target.dataset.expression, target.dataset.term, readerWordSurfaceText(target)],
            target.dataset.reading,
        );
    }

    private isDictionaryCard(card: JPDBCard): boolean {
        return card.source === 'local' || card.source === 'fallback' || card.reviewSource === 'dictionary';
    }

    private async applyOfflineCacheWhileLoading(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number): Promise<boolean> {
        if (this.allWords.length || this.state.route === 'search') return false;
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length || !this.canPrimeWithOfflineCache(cached.cards)) return false;
        this.applyOfflineWordCacheState(cached);
        this.dependencies.parser.cacheCards?.(this.allWords);
        this.applyWords(root, preferStoredWord);
        return true;
    }

    private applyOfflineWordCacheState(cached: { cards: JPDBCard[]; sourceLabel: string }): void {
        this.allWords = cached.cards;
        this.reviewCountMode = false;
        this.emptyLoadMessageKey = null;
        this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
    }

    private canPrimeWithOfflineCache(cards: JPDBCard[]): boolean {
        if (this.state.source === 'dictionary') return cards.every(card => this.isDictionaryCard(card));
        if (this.state.source === 'jpdb') return cards.every(card => this.isApiSourceCard(card));
        if (this.state.source === 'anki') return cards.every(card => this.isAnkiSourceCard(card));
        return cards.every(card => this.isApiSourceCard(card) || this.isAnkiSourceCard(card));
    }

    private isApiSourceCard(card: JPDBCard): boolean {
        return card.source === 'jpdb'
            || card.reviewSource === 'jpdb-api'
            || card.reviewSource === 'jpdb-live'
            || isJitenSrsCard(card);
    }

    private isAnkiSourceCard(card: JPDBCard): boolean {
        return card.source === 'anki' || card.reviewSource === 'anki';
    }

    private async applyOfflineCacheIfAvailable(root: HTMLElement, loadGeneration: number): Promise<void> {
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length) return;
        this.applyOfflineWordCacheState(cached);
        this.setStatus(root, this.text('offlineCache'));
    }

    private async renderEmptyWordLoad(root: HTMLElement): Promise<void> {
        this.renderEmpty(root, APP_NAME, this.text(this.emptyLoadMessageKey ?? this.emptyStudyMessageKey()));
    }

    // Thin forwarder: the mode-switch / render paths call this to paint the
    // stats dashboard.
    private renderStats(root: HTMLElement): void {
        this.statsController.render(root);
    }

    // Thin forwarder: the mode-switch / render paths kick off the stats load.
    private loadStatsInto(root: HTMLElement, force = false): Promise<void> {
        return this.statsController.loadInto(root, force);
    }

    // Bridge from the stats "Study these" button into the word-load pipeline:
    // switch the study surface to the selected stats source's trouble cards.
    private studyStatsTroubleCards(root: HTMLElement): void {
        const source = this.statsController.selectedStudySource();
        this.statsStudyFilter = 'trouble';
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.index = 0;
        this.state = { ...this.state, source, route: 'study', revealAnswer: false };
        this.persistState();
        this.syncMode(root);
        this.ensureStudySurface(root);
        void this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private filterStatsStudyCards(cards: JPDBCard[]): JPDBCard[] {
        if (this.statsStudyFilter !== 'trouble') return cards;
        const trouble = cards.filter(card => {
            const state = primaryCardState(card.cardState);
            return state === 'failed' || state === 'due';
        });
        return trouble.length ? trouble : cards;
    }

    // SH-3 v2: the My-Cards browser spans all three providers. Anki joins
    // only here — NOT in the stats page's own jpdbStatsApiProviders — because
    // the stats page has a dedicated Anki source and must not double-count
    // cards. The JPDB card fetch itself is shared with the stats surface, so it
    // lives on the stats controller (this is the browse↔stats seam).
    private browsePoolProviders(settings: ReaderSettings): NewTabStatsApiProvider[] {
        const japanese = usesJapaneseProviders();
        const japaneseProviders = japanese ? [
            this.jitenBrowsePoolProvider(settings),
            this.jpdbBrowsePoolProvider(settings),
            this.srsAdapterBrowsePoolProvider('bunpro'),
            this.srsAdapterBrowsePoolProvider('wanikani'),
        ] : [];
        const yomuLocal = this.srsAdapterBrowsePoolProvider('yomu-local');
        const anki = japanese ? this.ankiBrowsePoolProvider(settings) : null;
        return [...japaneseProviders, yomuLocal, anki]
            .filter((provider): provider is NewTabStatsApiProvider => provider !== null);
    }

    private jpdbBrowsePoolProvider(settings: ReaderSettings): NewTabStatsApiProvider | null {
        if (!hasJpdbApiCredential(settings)) return null;
        return {
            label: 'JPDB',
            load: () => this.statsController.loadJpdbCards(),
        };
    }

    private ankiBrowsePoolProvider(settings: ReaderSettings): NewTabStatsApiProvider | null {
        if (!settings.ankiEnabled
            || !settings.newTabAnkiEnabled
            || typeof this.dependencies.anki.listNewTabCards !== 'function') return null;
        return {
            label: 'Anki',
            load: () => this.dependencies.anki.listNewTabCards(NEW_TAB_STATS_JPDB_CARD_LIMIT),
        };
    }

    private jitenBrowsePoolProvider(settings: ReaderSettings): NewTabStatsApiProvider | null {
        const jiten = this.dependencies.jiten;
        if (!hasJitenApiCredential(settings) || typeof jiten?.listStudyBatchCards !== 'function') return null;
        if (typeof jiten.listStudyDeckVocabularyCards === 'function') {
            return {
                label: 'Jiten',
                load: async () => this.withJitenReviewHistory(await this.loadAllJitenDeckBrowseCards(settings)),
            };
        }
        const listJitenStudyBatchCards = jiten.listStudyBatchCards.bind(jiten);
        return {
            label: 'Jiten',
            load: () => listJitenStudyBatchCards(NEW_TAB_STATS_JPDB_CARD_LIMIT),
        };
    }

    private srsAdapterBrowsePoolProvider(source: NewTabSrsAdapterSource): NewTabStatsApiProvider | null {
        if (!canBrowseNewTabSrsSource(source, this.canUseYomuLocalSource())) return null;
        const adapter = this.dependencies.srsAdapters?.[source];
        if (!adapter?.hasCredential()) return null;
        const label = newTabSrsSourceLabel(source, adapter);
        return {
            label,
            load: async () => {
                const snapshot = await adapter.queue(NEW_TAB_STATS_JPDB_CARD_LIMIT, {
                    language: activeLearningTarget().language,
                });
                return snapshot.cards
                    .filter(newTabCardMatchesActiveTarget)
                    .map(newTabCardFromSrsReviewable)
                    .filter((card): card is JPDBCard => card !== null);
            },
        };
    }

    private async handleLoadWordsError(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number, error: unknown, useOfflineCache: boolean, quiet = false): Promise<void> {
        log.warn('Failed to load words', error);
        this.statsStudyFilter = null;
        if (quiet && this.visibleWords.length) return;
        const cached = useOfflineCache ? await this.readOfflineCache() : { cards: [], sourceLabel: '' };
        if (!this.isCurrentLoad(loadGeneration)) return;
        if (cached.cards.length) {
            this.applyOfflineWordCacheState(cached);
            this.dependencies.parser.cacheCards(this.allWords);
            this.applyWords(root, preferStoredWord);
            this.setStatus(root, this.text(this.offlineCacheStatusKey(cached.cards)));
            return;
        }
        this.renderEmpty(root, APP_NAME, this.text('couldNotLoadWords'));
    }

    private offlineCacheStatusKey(cards: JPDBCard[]): NewTabTextKey {
        return cards.some(card => this.canReviewCard(card) && this.offlineGradeTarget(card)) ? 'offlineGradesDisabled' : 'offlineCache';
    }

    private async loadWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const plan = this.wordSourceLoadPlan();
        const accumulator = await this.loadConfiguredWordSources(plan, onProgress);
        await this.loadFallbackStudyWordsIfNeeded(plan, accumulator, onProgress);
        return newTabLoadResult(accumulator, this.language());
    }

    private wordSourceLoadPlan(): NewTabSourceLoadPlan {
        return newTabSourceLoadPlan(this.state.source, NEW_TAB_FALLBACK_SUPPLEMENT_MIN);
    }

    private async loadConfiguredWordSources(plan: NewTabSourceLoadPlan, onProgress?: (message: string) => void): Promise<NewTabLoadAccumulator> {
        if (plan.kind === 'auto-review') return this.loadAutoReviewWordSources(plan.primarySources, onProgress);
        const accumulator = emptyNewTabLoadAccumulator();
        for (const source of plan.primarySources) {
            await this.appendLoadedWordsFromSource(accumulator, source, onProgress);
        }
        return accumulator;
    }

    private async loadAutoReviewWordSources(sources: readonly NewTabConcreteSource[], onProgress?: (message: string) => void): Promise<NewTabLoadAccumulator> {
        const results = await this.loadAutoReviewSourceResults(sources, onProgress);
        return this.accumulateAutoReviewSourceResults(results);
    }

    private async loadAutoReviewSourceResults(sources: readonly NewTabConcreteSource[], onProgress?: (message: string) => void): Promise<NewTabLoadResult[]> {
        const results = await Promise.all(sources.map(source => this.loadAutoReviewSourceResult(source, onProgress)));
        return autoReviewSourceResults(...results);
    }

    private async loadAutoReviewSourceResult(source: NewTabConcreteSource, onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const cached = this.cachedSourceResult(source);
        if (cached) return cached;
        const cacheContext = this.sourceCacheContext(source);
        const result = source === 'jpdb'
            ? await this.loadJpdbWords({ allowPublicFallback: false, timeoutMs: NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS })
            : source === 'anki'
                ? await this.loadAnkiWords(NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS)
                : await this.loadWordsFromSourceUncached(source, onProgress);
        return this.rememberSourceResult(source, result, cacheContext);
    }

    private accumulateAutoReviewSourceResults(results: NewTabLoadResult[]): NewTabLoadAccumulator {
        const accumulator = emptyNewTabLoadAccumulator();
        const emptyReviewLabels: string[] = [];
        let lastResult = emptyNewTabLoadResult();
        for (const result of results) {
            this.accumulateAutoReviewSourceResult(accumulator, emptyReviewLabels, result);
            lastResult = mergeEmptyNewTabLoadResults(lastResult, result);
        }
        if (accumulator.cards.length) return accumulator;
        if (!accumulator.reviewCountMode) return emptyNewTabLoadAccumulator();
        accumulator.labels.push(...emptyReviewLabels);
        return accumulator.reviewCountMode ? accumulator : newTabLoadAccumulatorFromResult(lastResult);
    }

    private accumulateAutoReviewSourceResult(accumulator: NewTabLoadAccumulator, emptyReviewLabels: string[], result: NewTabLoadResult): void {
        if (result.cards.length) {
            appendNewTabLoadResult(accumulator, result);
            return;
        }
        const isActiveReviewSource = this.emptyAutoReviewResultShouldBlockFallback(result);
        accumulator.reviewCountMode ||= isActiveReviewSource;
        if (isActiveReviewSource) this.appendUniqueReviewLabel(emptyReviewLabels, result.sourceLabel);
    }

    private appendUniqueReviewLabel(labels: string[], label: string): void {
        if (label && !labels.includes(label)) labels.push(label);
    }

    private emptyAutoReviewResultShouldBlockFallback(result: NewTabLoadResult): boolean {
        if (result.reviewCountMode !== true) return false;
        return result.sourceLabel.includes(this.text('liveReview'))
            || result.sourceLabel.includes('Jiten');
    }

    private async appendLoadedWordsFromSource(accumulator: NewTabLoadAccumulator, source: ConcreteNewTabWordSource, onProgress?: (message: string) => void): Promise<void> {
        appendNewTabLoadResult(accumulator, await this.loadWordsFromSource(source, onProgress));
    }

    private async loadFallbackStudyWordsIfNeeded(plan: NewTabSourceLoadPlan, accumulator: NewTabLoadAccumulator, onProgress?: (message: string) => void): Promise<void> {
        if (!this.shouldLoadFallbackStudyWords(plan, accumulator)) return;
        // Substituting practice words for an expected (but empty/unreachable)
        // review queue must be announced, not silent.
        if (!accumulator.cards.length && this.hasConfiguredReviewSources()) accumulator.fallbackNotice = true;
        const jitenOnlyApiFallback = this.shouldUseJitenOnlyApiStudyFallback(plan, accumulator);
        const fallback = jitenOnlyApiFallback
            ? await this.loadJitenApiFreshStudyWords(onProgress)
            : await this.loadFreshStudyWords(onProgress, {
                allowPublicJpdbFallback: this.shouldAllowPublicJpdbStudyFallbackForPlan(plan),
                skipDictionaryLoad: plan.kind === 'explicit-source' && plan.primarySources.includes('dictionary'),
            });
        if (fallback.cards.length && !this.currentModeStudyCardCount(accumulator.cards)) {
            accumulator.labels = jitenOnlyApiFallback ? ['Jiten'] : [];
            accumulator.reviewCountMode = false;
            delete accumulator.emptyMessageKey;
            if (jitenOnlyApiFallback) {
                accumulator.cards.push(...fallback.cards);
                return;
            }
        }
        appendNewTabLoadResult(accumulator, fallback);
    }

    private hasConfiguredReviewSources(): boolean {
        const settings = this.dependencies.getSettings();
        return hasJpdbApiCredential(settings)
            || hasJitenApiCredential(settings)
            || Boolean(settings.ankiEnabled && settings.newTabAnkiEnabled)
            || this.canUseBunproSource();
    }

    private shouldUseJitenOnlyApiStudyFallback(plan: NewTabSourceLoadPlan, accumulator: NewTabLoadAccumulator): boolean {
        if (this.currentModeStudyCardCount(accumulator.cards) || this.shouldKeepEmptyReviewLoad(accumulator)) return false;
        if (plan.kind !== 'auto-review' && !plan.primarySources.includes('jpdb')) return false;
        return this.hasJitenOnlyApiCredentials();
    }

    private shouldLoadFallbackStudyWords(plan: NewTabSourceLoadPlan, accumulator: NewTabLoadAccumulator): boolean {
        if (this.shouldLoadAutoSettingStudyFallback(accumulator)) return true;
        if (this.shouldLoadUnconfiguredAutoStudyFallback(plan, accumulator)) return true;
        if (this.shouldLoadUnavailableExplicitAnkiFallback(plan, accumulator)) return true;
        if (this.shouldLoadQueryStudyFallback(accumulator)) return true;
        if (plan.studyFallback.kind !== 'study-supplement') return false;
        if (this.shouldLoadEmptyApiStudyFallback(accumulator)) return true;
        if (accumulator.reviewCountMode) return false;
        const studyCount = this.currentModeStudyCardCount(accumulator.cards);
        return studyCount < plan.studyFallback.minCards
            && !accumulator.cards.some(card => this.isDictionaryCard(card));
    }

    private shouldLoadEmptyApiStudyFallback(accumulator: NewTabLoadAccumulator): boolean {
        return !this.currentModeStudyCardCount(accumulator.cards)
            && accumulator.reviewCountMode
            && !this.shouldKeepEmptyReviewLoad(accumulator);
    }

    private shouldLoadQueryStudyFallback(accumulator: NewTabLoadAccumulator): boolean {
        return Boolean(normalizeSearchQuery(this.searchController.query))
            && !this.currentModeStudyCardCount(accumulator.cards)
            && !this.shouldKeepEmptyReviewLoad(accumulator);
    }

    private shouldKeepEmptyReviewLoad(accumulator: NewTabLoadAccumulator): boolean {
        return accumulator.labels.some(label => label.includes(this.text('liveReview')));
    }

    private shouldLoadUnavailableExplicitAnkiFallback(plan: NewTabSourceLoadPlan, accumulator: NewTabLoadAccumulator): boolean {
        return plan.kind === 'explicit-source'
            && plan.primarySources[0] === 'anki'
            && !this.currentModeStudyCardCount(accumulator.cards);
    }

    private shouldLoadUnconfiguredAutoStudyFallback(plan: NewTabSourceLoadPlan, accumulator: NewTabLoadAccumulator): boolean {
        return plan.studyFallback.kind === 'unconfigured-auto-study'
            && !this.currentModeStudyCardCount(accumulator.cards)
            && !accumulator.reviewCountMode;
    }

    private shouldLoadAutoSettingStudyFallback(accumulator: NewTabLoadAccumulator): boolean {
        return this.dependencies.getSettings().newTabSource === 'auto'
            && !this.currentModeStudyCardCount(accumulator.cards)
            && !this.shouldKeepEmptyReviewLoad(accumulator);
    }

    private currentModeStudyCardCount(cards: JPDBCard[]): number {
        return cards.length;
    }

    private async loadLocalOrBuiltInFreshStudyWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const dictionaryResult = await this.loadDictionaryWords(onProgress);
        return dictionaryResult.cards.length ? dictionaryResult : this.loadBuiltInFreshStudyWords();
    }

    private async loadJitenApiFreshStudyWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const fallback = await this.loadLocalOrBuiltInFreshStudyWords(onProgress);
        const cards = await this.loadJitenPracticeCards(fallback.cards);
        return cards.length ? { cards, sourceLabel: 'Jiten', reviewCountMode: false } : fallback;
    }

    private async loadJitenPracticeCards(seedCards: readonly JPDBCard[]): Promise<JPDBCard[]> {
        const jiten = this.dependencies.jiten;
        const parse = jiten?.parse;
        if (typeof parse !== 'function' || !seedCards.length) return [];
        const entries = seedCards.map(card => ({ card, terms: this.jitenPracticeLookupTerms(card) }));
        const terms = uniqueStrings(entries.flatMap(entry => entry.terms));
        if (!terms.length) return [];
        const parsed = await parse.call(jiten, terms).catch(error => {
            log.warn('Jiten practice fallback parse failed', { terms: terms.length }, error);
            return [] as JPDBToken[][];
        });
        const byTerm = new Map<string, JPDBCard>();
        terms.forEach((term, index) => {
            const card = this.pickJitenPracticeCard(term, parsed[index] ?? []);
            if (card) byTerm.set(term, card);
        });
        return dedupeWords(entries.flatMap(entry => entry.terms.map(term => byTerm.get(term)).filter((card): card is JPDBCard => Boolean(card))));
    }

    private jitenPracticeLookupTerms(card: JPDBCard): string[] {
        return uniqueStrings([card.spelling, newTabCardReading(card), ...(card.fallbackLookupTerms ?? [])].filter(Boolean));
    }

    private pickJitenPracticeCard(term: string, tokens: readonly JPDBToken[]): JPDBCard | null {
        return tokens
            .map(token => token.card)
            .find(card => card.source === 'jiten' && this.isTrackedJitenPracticeCard(card) && this.jitenPracticeCardMatchesTerm(card, term))
            ?? tokens
                .map(token => token.card)
                .find(card => card.source === 'jiten' && this.isTrackedJitenPracticeCard(card))
            ?? null;
    }

    private isTrackedJitenPracticeCard(card: JPDBCard): boolean {
        const states = normalizeCardStates(card.cardState);
        return states.some(state => state !== 'not-in-deck');
    }

    private jitenPracticeCardMatchesTerm(card: JPDBCard, term: string): boolean {
        const normalized = term.trim();
        return card.spelling.trim() === normalized || newTabCardReading(card).trim() === normalized;
    }

    private async hasLocalDictionaries(): Promise<boolean> {
        const presence = typeof this.dependencies.dictionaries.hasDictionaries === 'function'
            ? this.dependencies.dictionaries.hasDictionaries()
            : this.dependencies.dictionaries.summary?.().then(summary => Boolean(summary.dictionaries.length)) ?? Promise.resolve(false);
        return await promiseWithTimeout(presence, NEW_TAB_DICTIONARY_PRESENCE_TIMEOUT_MS, 'Dictionary presence check timed out.')
            .catch(() => false);
    }

    private loadWordsFromSource(source: ConcreteNewTabWordSource, onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const cached = this.cachedSourceResult(source);
        if (cached) return Promise.resolve(cached);
        const cacheContext = this.sourceCacheContext(source);
        return this.loadWordsFromSourceUncached(source, onProgress)
            .then(result => this.rememberSourceResult(source, result, cacheContext));
    }

    private loadWordsFromSourceUncached(source: ConcreteNewTabWordSource, onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        if (source === 'anki') return this.loadAnkiWords();
        if (source === 'jpdb') return this.loadJpdbWords();
        if (source === 'bunpro' || source === 'wanikani' || source === 'yomu-local') return this.loadSrsAdapterWords(source);
        return this.loadDictionaryWords(onProgress);
    }

    private cachedSourceResult(source: ConcreteNewTabWordSource): NewTabLoadResult | null {
        const cached = this.sourceResultCache.get(source);
        if (!cached || cached.signature !== this.sourceCacheSignature(source)) return null;
        return {
            ...cached.result,
            cards: [...cached.result.cards],
        };
    }

    private cachedSourceUnavailable(source: ConcreteNewTabWordSource): boolean {
        const cached = this.cachedSourceResult(source);
        return Boolean(cached && !cached.cards.length && cached.emptyMessageKey);
    }

    private rememberSourceResult(source: ConcreteNewTabWordSource, result: NewTabLoadResult, context?: NewTabSourceCacheContext): NewTabLoadResult {
        const scopedResult = {
            ...result,
            cards: result.cards.filter(newTabCardMatchesActiveTarget),
        };
        if (context && (context.version !== this.sourceCacheVersion(source) || context.signature !== this.sourceCacheSignature(source))) {
            return scopedResult;
        }
        if (scopedResult.cards.length || source === 'anki' || source === 'dictionary' || source === 'bunpro' || source === 'wanikani' || source === 'yomu-local') {
            this.sourceResultCache.set(source, {
                signature: context?.signature ?? this.sourceCacheSignature(source),
                result: {
                    ...scopedResult,
                    cards: [...scopedResult.cards],
                },
            });
        }
        return scopedResult;
    }

    private sourceCacheContext(source: ConcreteNewTabWordSource): NewTabSourceCacheContext {
        return {
            signature: this.sourceCacheSignature(source),
            version: this.sourceCacheVersion(source),
        };
    }

    private sourceCacheVersion(source: ConcreteNewTabWordSource): number {
        return this.sourceCacheVersions.get(source) ?? 0;
    }

    private clearSourceResultCache(): void {
        this.sourceResultCache.clear();
        for (const source of ['jpdb', 'bunpro', 'wanikani', 'yomu-local', 'anki', 'dictionary'] as ConcreteNewTabWordSource[]) {
            this.bumpSourceCacheVersion(source);
        }
    }

    private invalidateSourceResultCache(source: ConcreteNewTabWordSource): void {
        this.sourceResultCache.delete(source);
        this.bumpSourceCacheVersion(source);
    }

    private bumpSourceCacheVersion(source: ConcreteNewTabWordSource): void {
        this.sourceCacheVersions.set(source, this.sourceCacheVersion(source) + 1);
    }

    private sourceCacheSignature(source: ConcreteNewTabWordSource): string {
        const settings = this.dependencies.getSettings();
        return newTabSourceCacheSignature({
            source,
            settings,
            interfaceLanguage: this.language(),
            targetLanguage: activeLearningTarget().language,
            targetGeneration: activeLearningTargetGeneration(),
            activeJpdbDeck: this.state.jpdbDeck,
            activeAnkiDeck: this.normalizedAnkiDeckScope(),
        });
    }

    private async loadSrsAdapterWords(source: NewTabSrsAdapterSource, limit = NEW_TAB_WORD_LIMIT): Promise<NewTabLoadResult> {
        const adapter = this.dependencies.srsAdapters?.[source];
        const sourceLabel = newTabSrsSourceLabel(source, adapter);
        const settings = this.dependencies.getSettings();
        const unavailable = unavailableNewTabSrsLoad({
            source,
            sourceLabel,
            selected: this.state.source === source,
            localSourceAvailable: this.canUseYomuLocalSource(),
            hasCredential: newTabSrsSourceHasCredential(adapter),
            bunproCredentialExpired: isBunproFrontendCredentialExpired(settings),
        });
        if (unavailable) return unavailable;
        const availableAdapter = adapter!;
        const cardLimit = Math.max(1, Math.floor(limit));
        const loaded = await this.remoteSourceResult<YomuSrsQueueSnapshot | null>(
            `${sourceLabel} queue`,
            availableAdapter.queue(cardLimit, { language: activeLearningTarget().language }),
            null,
            NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
        );
        const cards = newTabCardsFromSrsQueue(loaded.value, cardLimit);
        return {
            cards,
            sourceLabel,
            reviewCountMode: true,
            emptyMessageKey: newTabSrsLoadErrorMessage(loaded.failed),
        };
    }

    private async loadAnkiWords(timeoutMs = NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, limit = NEW_TAB_WORD_LIMIT): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.ankiEnabled || !settings.newTabAnkiEnabled || typeof this.dependencies.anki.listNewTabCards !== 'function') {
            const explicitAnki = this.state.source === 'anki';
            return {
                cards: [],
                sourceLabel: 'Anki',
                reviewCountMode: explicitAnki,
                emptyMessageKey: explicitAnki ? 'ankiUnreachable' : undefined,
            };
        }
        const cardLimit = Math.max(1, Math.floor(limit));
        let unavailable = false;
        const loadCards = this.dependencies.anki.listNewTabCards(cardLimit, this.normalizedAnkiDeckScope() || undefined);
        const cards = await (this.state.source === 'anki'
            ? loadCards
            : promiseWithTimeout(loadCards, timeoutMs, 'Anki timed out.')).catch(error => {
            unavailable = true;
            log.warn('New tab Anki source failed', { error });
            return [] as JPDBCard[];
        });
        return {
            cards,
            sourceLabel: 'Anki',
            reviewCountMode: true,
            emptyMessageKey: unavailable ? 'ankiUnreachable' : undefined,
        };
    }

    private normalizedAnkiDeckScope(): string {
        const scope = (this.state.ankiDeck ?? '').trim();
        return scope === 'all' ? '' : scope;
    }

    private async loadDictionaryWords(_onProgress?: (message: string) => void, limit = NEW_TAB_WORD_LIMIT): Promise<NewTabLoadResult> {
        const cards = await this.targetResources.loadDictionaryCards(
            limit,
            () => this.hasLocalDictionaries(),
            (settings, cardLimit) => this.loadDictionaryFallbackEntries(settings, cardLimit),
        ).catch(() => []);
        return { cards, sourceLabel: this.text('dictionary'), reviewCountMode: false };
    }

    private async loadFreshStudyWords(
        onProgress?: (message: string) => void,
        options: { requireDictionaryBeforePublicFallback?: boolean; allowPublicJpdbFallback?: boolean; skipDictionaryLoad?: boolean } = {},
    ): Promise<NewTabLoadResult> {
        if (options.requireDictionaryBeforePublicFallback) {
            const dictionaryResult = await this.loadDictionaryWords(onProgress);
            if (dictionaryResult.cards.length) return dictionaryResult;
            return options.allowPublicJpdbFallback ? this.loadPublicFreshStudyWords(dictionaryResult) : this.loadBuiltInFreshStudyWords();
        }
        const publicJpdbPromise = options.allowPublicJpdbFallback ? this.loadPublicJpdbWords() : Promise.resolve(emptyNewTabLoadResult('JPDB'));
        const dictionaryResult = options.skipDictionaryLoad
            ? emptyNewTabLoadResult(this.text('dictionary'))
            : await this.loadDictionaryWords(onProgress);
        return options.allowPublicJpdbFallback
            ? this.loadPublicFreshStudyWords(dictionaryResult, publicJpdbPromise)
            : dictionaryResult.cards.length ? dictionaryResult : this.loadBuiltInFreshStudyWords();
    }

    private async loadPublicFreshStudyWords(
        dictionaryResult: NewTabLoadResult,
        publicJpdbPromise = this.loadPublicJpdbWords(),
    ): Promise<NewTabLoadResult> {
        if (dictionaryResult.cards.length) {
            const publicResult = await promiseWithTimeout(publicJpdbPromise, NEW_TAB_PUBLIC_FALLBACK_GRACE_MS, 'Public JPDB fallback deferred.')
                .catch(() => emptyNewTabLoadResult('JPDB'));
            return newTabLoadResult(interleavedNewTabLoadAccumulator([publicResult, dictionaryResult]), this.language());
        }
        const results = [
            await publicJpdbPromise,
            dictionaryResult,
        ];
        const result = newTabLoadResult(interleavedNewTabLoadAccumulator(results), this.language());
        return result.cards.length ? result : this.loadBuiltInFreshStudyWords();
    }

    private loadBuiltInFreshStudyWords(limit = NEW_TAB_FALLBACK_SUPPLEMENT_MIN): NewTabLoadResult {
        if (activeLearningTarget().language !== 'ja') return emptyNewTabLoadResult(this.text('starterWords'));
        const fallbackCardFromText = this.dependencies.parser.fallbackCardFromText;
        // Built-in seed words are not the user's dictionary — labeling them
        // "Dictionary" confused keyless users who never imported one.
        if (typeof fallbackCardFromText !== 'function') return emptyNewTabLoadResult(this.text('starterWords'));
        const cards = randomPublicJpdbSeedWords(limit)
            .map(term => fallbackCardFromText.call(this.dependencies.parser, term));
        return {
            cards,
            sourceLabel: this.text('starterWords'),
            reviewCountMode: false,
        };
    }

    private async loadDictionaryFallbackEntries(settings: ReaderSettings, limit = NEW_TAB_WORD_LIMIT): Promise<YomitanTermEntry[]> {
        const cardLimit = Math.max(1, Math.floor(limit));
        for (const maxRank of NEW_TAB_DICTIONARY_FALLBACK_RANKS) {
            const entries = await this.dependencies.dictionaries.listRandomTopTerms(
                cardLimit,
                maxRank,
                settings.dictionaryPreferences,
                {
                    fallbackToRandom: false,
                    maxRows: NEW_TAB_DICTIONARY_TOP_MAX_ROWS,
                    maxMs: NEW_TAB_DICTIONARY_TOP_MAX_MS,
                    fallbackMaxRows: NEW_TAB_DICTIONARY_RANDOM_MAX_ROWS,
                    fallbackMaxMs: NEW_TAB_DICTIONARY_RANDOM_MAX_MS,
                },
            );
            if (entries.length) return entries;
        }
        return await this.dependencies.dictionaries.listRandomTerms(cardLimit, settings.dictionaryPreferences, {
            maxRows: NEW_TAB_DICTIONARY_RANDOM_MAX_ROWS,
            maxMs: NEW_TAB_DICTIONARY_RANDOM_MAX_MS,
        });
    }

    private async loadJpdbWords(options: { allowPublicFallback?: boolean; timeoutMs?: number; limit?: number } = {}): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        const hasJpdbKey = hasJpdbApiCredential(settings);
        const jitenOnlyApi = this.hasJitenOnlyApiCredentials(settings);
        // UT-61: no silent either/or — the EXPLICIT live-review mode always
        // wins (even alongside a Jiten key), while 'auto' with dual
        // credentials prefers the merged API queues over preempting with the
        // live jpdb.io bridge.
        const liveModePreempts = settings.newTabJpdbReviewMode === 'live-review'
            || (settings.newTabJpdbReviewMode === 'auto' && !hasJitenApiCredential(settings));
        const hasActiveJpdbKey = hasJpdbKey && liveModePreempts;
        const live = hasActiveJpdbKey && settings.jpdbMiningEnabled ? this.loadLiveJpdbReviewWords(settings) : null;
        if (live) return live;
        const apiResults = await this.loadApiReviewSourceResults(settings, options);
        if (apiResults.length) return this.mergeApiReviewSourceResults(apiResults);
        return this.loadJpdbWordsFallback(hasJpdbKey, jitenOnlyApi ? false : options.allowPublicFallback);
    }

    private async loadApiReviewSourceResults(settings: ReaderSettings, options: { timeoutMs?: number; limit?: number }): Promise<NewTabLoadResult[]> {
        const hasJpdbKey = hasJpdbApiCredential(settings);
        const apiResults: NewTabLoadResult[] = [];
        // UT-44: picking a specific deck scopes the session to that deck's
        // provider — a Jiten study deck filters the Jiten batch and skips
        // JPDB; a JPDB deck skips the Jiten batch; 'all' merges both.
        const pickedDeck = (this.state.jpdbDeck || settings.newTabJpdbDeck).trim() || JPDB_ALL_DECKS;
        const jitenDeckId = jitenScopedDeckId(pickedDeck);
        if (jitenDeckId !== null) {
            const jiten = await this.loadJitenStudyBatchWords({ ...options, deckId: jitenDeckId });
            return jiten ? [jiten] : [];
        }
        // UT-62: provider umbrellas — study only one provider's queue.
        if (pickedDeck === 'provider:jiten') {
            const jiten = await this.loadJitenStudyBatchWords(options);
            return jiten ? [jiten] : [];
        }
        if (pickedDeck === JPDB_ALL_DECKS || pickedDeck === 'all') {
            const jiten = await this.loadJitenStudyBatchWords(options);
            if (jiten) apiResults.push(jiten);
        }
        if (hasJpdbKey) {
            // The in-page deck selector (study-hub parity SH-6) overrides the
            // settings default; '' follows settings.
            const selectedDeck = NewTabController.normalizeProviderScopedDeck((this.state.jpdbDeck || settings.newTabJpdbDeck).trim() || JPDB_ALL_DECKS);
            // The all-decks union lists every user deck before one bulk
            // lookup; large accounts need more than the default 8s (the old
            // timeout surfaced as "No reviews ready" with due cards waiting).
            const timeoutMs = selectedDeck === JPDB_ALL_DECKS
                ? Math.max(options.timeoutMs ?? 0, NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS * 3)
                : options.timeoutMs;
            const selectedDeckCards = await this.loadSelectedJpdbDeckWords(selectedDeck, timeoutMs, options.limit);
            if (selectedDeckCards) apiResults.push(selectedDeckCards);
        }
        return apiResults;
    }

    // UT-62: provider:jpdb behaves like the all-decks union scoped to JPDB.
    private static normalizeProviderScopedDeck(pickedDeck: string): string {
        return pickedDeck === 'provider:jpdb' ? 'all' : pickedDeck;
    }

    private loadJpdbWordsFallback(hasJpdbKey: boolean, allowPublicFallback: boolean | undefined): Promise<NewTabLoadResult> | NewTabLoadResult {
        if (allowPublicFallback !== false) return this.loadFreshStudyWords(undefined, { allowPublicJpdbFallback: hasJpdbKey });
        return {
            cards: [],
            sourceLabel: this.apiReviewSourceLabel(),
            reviewCountMode: true,
            ...(hasJpdbKey ? { emptyMessageKey: 'couldNotLoadWords' as const } : {}),
        };
    }

    private shouldAllowPublicJpdbStudyFallback(settings = this.dependencies.getSettings()): boolean {
        return hasJpdbApiCredential(settings);
    }

    private shouldAllowPublicJpdbStudyFallbackForPlan(plan: NewTabSourceLoadPlan): boolean {
        return plan.kind === 'explicit-source' && plan.primarySources.includes('dictionary')
            ? true
            : this.shouldAllowPublicJpdbStudyFallback();
    }

    private mergeApiReviewSourceResults(results: NewTabLoadResult[]): NewTabLoadResult {
        if (results.length === 1) return results[0]!;
        if (results.some(result => result.cards.length)) {
            return newTabLoadResult(interleavedNewTabLoadAccumulator(results), this.language());
        }
        const accumulator = emptyNewTabLoadAccumulator();
        for (const result of results) appendNewTabLoadResult(accumulator, result);
        return newTabLoadResult(accumulator, this.language());
    }

    private async loadJitenStudyBatchWords(options: { timeoutMs?: number; limit?: number; deckId?: number } = {}): Promise<NewTabLoadResult | null> {
        const settings = this.dependencies.getSettings();
        const jiten = this.dependencies.jiten;
        if (!hasJitenApiCredential(settings) || typeof jiten?.listStudyBatchCards !== 'function') return null;
        const cardLimit = Math.max(1, Math.floor(options.limit ?? NEW_TAB_WORD_LIMIT));
        const loaded = await this.remoteSourceResult(
            'Jiten study batch',
            jiten.listStudyBatchCards(cardLimit),
            [] as JPDBCard[],
            options.timeoutMs,
        );
        let cards = loaded.value;
        // UT-44: srs/study-batch has no deck parameter — scope by
        // intersecting with the deck's word keys.
        if (typeof options.deckId === 'number' && typeof jiten.studyDeckWordKeys === 'function') {
            const keys = await jiten.studyDeckWordKeys(options.deckId).catch((): Set<string> => new Set());
            if (keys.size) cards = cards.filter(card => keys.has(`${card.jitenWordId}:${card.jitenReadingIndex ?? 0}`));
        }
        return {
            cards,
            sourceLabel: 'Jiten',
            reviewCountMode: true,
            emptyMessageKey: loaded.failed ? 'couldNotLoadWords' : undefined,
        };
    }

    // UT-44: Jiten study decks in the deck picker (labelled to distinguish
    // them from JPDB decks; ids carry the jiten: prefix).
    private jitenStudyDecksCache?: { key: string; at: number; promise: Promise<Array<{ id: number; name: string }>> };

    private jitenDeckSelectorOptions(settings: ReaderSettings): Promise<Array<{ id: string; name: string }>> {
        return this.jitenStudyDecks(settings)
            .then(decks => decks.map(deck => ({ id: `jiten:${deck.id}`, name: `Jiten · ${deck.name}` })));
    }

    private jitenStudyDecks(settings: ReaderSettings = this.dependencies.getSettings()): Promise<Array<{ id: number; name: string }>> {
        const jiten = this.dependencies.jiten;
        if (!hasJitenApiCredential(settings) || typeof jiten?.listStudyDecks !== 'function') return Promise.resolve([]);
        const key = effectiveJitenApiKey(settings);
        const now = Date.now();
        if (this.jitenStudyDecksCache && this.jitenStudyDecksCache.key === key && now - this.jitenStudyDecksCache.at < 60_000) {
            return this.jitenStudyDecksCache.promise;
        }
        const promise = jiten.listStudyDecks()
            .then(decks => decks.map(deck => ({ id: deck.id, name: deck.name })))
            .catch((): Array<{ id: number; name: string }> => []);
        this.jitenStudyDecksCache = { key, at: now, promise };
        return promise;
    }

    private async loadAllJitenDeckBrowseCards(settings: ReaderSettings = this.dependencies.getSettings()): Promise<JPDBCard[]> {
        const jiten = this.dependencies.jiten;
        if (typeof jiten?.listStudyDeckVocabularyCards !== 'function') {
            return typeof jiten?.listStudyBatchCards === 'function'
                ? jiten.listStudyBatchCards(NEW_TAB_STATS_JPDB_CARD_LIMIT)
                : [];
        }
        const decks = await this.jitenStudyDecks(settings);
        if (!decks.length) return jiten.listStudyBatchCards(NEW_TAB_STATS_JPDB_CARD_LIMIT);
        const cards = await Promise.all(decks.map(deck => this.loadJitenDeckBrowseCards(deck.id, NEW_TAB_BROWSE_DECK_LIMIT, deck.name)));
        return dedupeWords(cards.flat()).slice(0, NEW_TAB_BROWSE_DECK_LIMIT);
    }

    private async loadJitenDeckBrowseCards(deckId: number, limit = NEW_TAB_BROWSE_DECK_LIMIT, deckName?: string): Promise<JPDBCard[]> {
        const jiten = this.dependencies.jiten;
        if (typeof jiten?.listStudyDeckVocabularyCards !== 'function') {
            const result = await this.loadJitenStudyBatchWords({ limit, deckId });
            return result?.cards ?? [];
        }
        const cards = await jiten.listStudyDeckVocabularyCards(deckId, limit);
        const resolvedDeckName = deckName ?? (await this.jitenStudyDecks().catch(() => [])).find(deck => deck.id === deckId)?.name ?? '';
        return cards.map(card => this.withJitenDeckMetadata(card, resolvedDeckName));
    }

    private withJitenDeckMetadata(card: JPDBCard, deckName: string): JPDBCard {
        if (!deckName.trim()) return normalizeNewTabCard(card);
        const normalized = normalizeNewTabCard(card);
        const deckNames = [...new Set([...(normalized.deckNames ?? []), deckName.trim()].filter(Boolean))];
        return {
            ...normalized,
            deckNames,
            sourceDeckName: normalized.sourceDeckName || deckName.trim(),
        };
    }

    private async withJitenReviewHistory(cards: JPDBCard[], limit = NEW_TAB_BROWSE_DECK_LIMIT): Promise<JPDBCard[]> {
        const jiten = this.dependencies.jiten;
        if (!cards.length || typeof jiten?.listRecentReviews !== 'function') return cards;
        const latestByKey = jitenLatestReviewTimes(await jiten.listRecentReviews(limit).catch((): JitenRecentReview[] => []));
        if (!latestByKey.size) return cards;
        return cards.map(card => {
            const time = latestByKey.get(jitenHistoryCardKey(card));
            return time === undefined ? card : { ...card, lastReviewAt: time };
        });
    }

    private async loadPublicJpdbWords(): Promise<NewTabLoadResult> {
        if (!usesJapaneseProviders()) return emptyNewTabLoadResult('JPDB');
        const cards = await this.remoteSourceWithFallback(
            'JPDB public dictionary',
            this.loadPublicJpdbDictionaryCards(),
            [] as JPDBCard[],
        );
        return { cards, sourceLabel: 'JPDB', reviewCountMode: false };
    }

    private async loadPublicJpdbDictionaryCards(): Promise<JPDBCard[]> {
        if (!usesJapaneseProviders()) return [];
        const localSeedCards = await this.publicFallbackStage(
            'JPDB public local seed',
            this.loadPublicJpdbCardsFromLocalDictionary(),
            [] as JPDBCard[],
        );
        if (localSeedCards.length) return localSeedCards;

        const commonWordCards = await this.publicFallbackStage(
            'JPDB public common words',
            this.loadPublicJpdbSearchCards(randomPublicJpdbSeedWords(), NEW_TAB_PUBLIC_JPDB_WORD_FALLBACK_LIMIT).then(preferMultiCharacterVocabulary),
            [] as JPDBCard[],
        );
        if (commonWordCards.length) return commonWordCards;

        const kanjiSeedCards = await this.publicFallbackStage(
            'JPDB public kanji seed',
            this.loadPublicJpdbCardsFromKanjiVocabulary(),
            [] as JPDBCard[],
        );
        if (kanjiSeedCards.length) return kanjiSeedCards;

        return preferMultiCharacterVocabulary(
            await this.loadPublicJpdbSearchCards(randomPublicJpdbSeedKanji(NEW_TAB_PUBLIC_JPDB_CONCURRENCY), NEW_TAB_PUBLIC_JPDB_KANJI_FALLBACK_LIMIT),
        );
    }

    private async loadPublicJpdbCardsFromLocalDictionary(): Promise<JPDBCard[]> {
        if (!usesJapaneseProviders() || !this.dependencies.jpdbVocabulary?.search || !await this.hasLocalDictionaries()) return [];
        const entries = await this.loadDictionaryFallbackEntries(this.dependencies.getSettings());
        return this.loadPublicJpdbSearchCards(
            entries.map(entry => entry.expression).filter(Boolean).slice(0, Math.min(NEW_TAB_PUBLIC_JPDB_LOCAL_SEED_LIMIT, NEW_TAB_PUBLIC_JPDB_CONCURRENCY)),
            1,
        );
    }

    private async loadPublicJpdbCardsFromKanjiVocabulary(): Promise<JPDBCard[]> {
        if (!usesJapaneseProviders()) return [];
        const lookup = this.dependencies.jpdbKanji.lookup;
        if (typeof lookup !== 'function') return [];
        const seeds = randomPublicJpdbSeedKanji(NEW_TAB_PUBLIC_JPDB_CONCURRENCY);
        const groups: JPDBCard[][] = [];
        await runLimited(seeds, NEW_TAB_PUBLIC_JPDB_CONCURRENCY, async (kanji, index) => {
            if (!usesJapaneseProviders() || !targetCanLookupCharacter(kanji)) return;
            const info = await promiseWithTimeout(
                lookup.call(this.dependencies.jpdbKanji, kanji),
                NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS,
                'Public JPDB kanji seed timed out.',
            ).catch(() => null);
            if (usesJapaneseProviders() && targetCanLookupCharacter(kanji)) {
                groups[index] = (info?.vocabulary ?? []).map(jpdbKanjiVocabularyToNewTabCard);
            }
        });
        if (!usesJapaneseProviders()) return [];
        return preferMultiCharacterVocabulary(dedupeWords(groups.flat())).slice(0, NEW_TAB_WORD_LIMIT);
    }

    private async loadPublicJpdbSearchCards(queries: string[], limitPerQuery: number): Promise<JPDBCard[]> {
        if (!usesJapaneseProviders()) return [];
        const search = this.dependencies.jpdbVocabulary?.search;
        if (!search || !queries.length) return [];
        const groups: JPDBCard[][] = [];
        await runLimited(uniqueStrings(queries), NEW_TAB_PUBLIC_JPDB_CONCURRENCY, async (query, index) => {
            groups[index] = await this.searchController.searchPublicJpdbCards(query, limitPerQuery);
        });
        if (!usesJapaneseProviders()) return [];
        const cards = groups.flat();
        return dedupeWords(cards).slice(0, NEW_TAB_WORD_LIMIT);
    }

    private loadLiveJpdbReviewWords(settings: ReaderSettings): NewTabLoadResult | null {
        if (settings.newTabJpdbReviewMode === 'api-vocabulary') return null;
        const live = this.liveCardFromBridge();
        if (live) return { cards: [live], sourceLabel: `JPDB ${this.text('liveReview')}`, reviewCountMode: true };
        this.dependencies.jpdbReviewBridge.requestCurrent();
        return settings.newTabJpdbReviewMode === 'live-review'
            ? { cards: [], sourceLabel: `JPDB ${this.text('liveReview')}`, reviewCountMode: true }
            : null;
    }

    private async loadSelectedJpdbDeckWords(selectedDeck: string, timeoutMs = NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, limit = NEW_TAB_WORD_LIMIT): Promise<NewTabLoadResult | null> {
        const cardLimit = Math.max(1, Math.floor(limit));
        try {
            const loaded = await this.remoteSourceResult(
                'JPDB selected deck',
                this.dependencies.jpdb.listDeckCards(selectedDeck, cardLimit, { scheduledOnly: true }),
                [] as JPDBCard[],
                timeoutMs,
            );
            const cards = jpdbReviewCardsForNewTab(loaded.value, cardLimit);
            // SH-4 fidelity: when the queue is scoped to a named deck, every
            // card's back can honestly carry jpdb.io's "Part of the X deck"
            // line (the live bridge's scraped line still wins when present).
            const deckName = await this.jpdbDeckNameForMembership(selectedDeck);
            if (deckName) {
                for (const card of cards) {
                    if (!card.jpdbDeckMembership) card.jpdbDeckMembership = this.formatNewTabText('partOfDeck', { deck: deckName });
                }
            }
            return {
                cards,
                sourceLabel: 'JPDB',
                reviewCountMode: true,
                emptyMessageKey: loaded.failed ? 'couldNotLoadWords' : undefined,
            };
        } catch {
            return null;
        }
    }

    private async jpdbDeckNameForMembership(deckId: string): Promise<string> {
        return jpdbDeckMembershipName(deckId, () => this.cachedJpdbDecks(this.dependencies.getSettings()));
    }

    private cachedJpdbDecks(settings: ReaderSettings): Promise<JPDBDeck[]> {
        const key = newTabProviderContext(settings);
        if (this.deckSelectorDecks?.key === key) return this.deckSelectorDecks.promise;
        const request = typeof this.dependencies.jpdb.listDecks === 'function'
            ? this.dependencies.jpdb.listDecks()
            : Promise.resolve([] as JPDBDeck[]);
        const promise = request.catch((): JPDBDeck[] => []);
        this.deckSelectorDecks = { key, promise };
        return promise;
    }

    private async remoteSourceWithFallback<T>(label: string, promise: Promise<T>, fallback: T, timeoutMs = NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS): Promise<T> {
        return (await this.remoteSourceResult(label, promise, fallback, timeoutMs)).value;
    }

    private async remoteSourceResult<T>(label: string, promise: Promise<T>, fallback: T, timeoutMs = NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS): Promise<{ value: T; failed: boolean }> {
        try {
            return {
                value: await promiseWithTimeout(promise, timeoutMs, `${label} timed out.`),
                failed: false,
            };
        } catch (error) {
            log.warn('New tab remote source failed', { label, error });
            return { value: fallback, failed: true };
        }
    }

    private async publicFallbackStage<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
        try {
            return await promiseWithTimeout(promise, NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS, `${label} timed out.`);
        } catch (error) {
            log.warn('New-tab public fallback failed', { label, error });
            return fallback;
        }
    }

    private isCurrentLoad(loadGeneration: number): boolean {
        return this.loadGeneration === loadGeneration;
    }

    private persistSourceSettingChange(source: ConcreteNewTabWordSource): Promise<void> {
        return Promise.resolve()
            .then(() => this.dependencies.onSettingsChange(['newTabSource']))
            .catch(error => {
                log.warn('New-tab source update failed', { source }, error);
            });
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean; preferredCardKey?: string }): void {
        const preferredCardKey = options.preferredCardKey ?? (options.preserveWord ? this.currentVisibleWordKey() : '');
        const shouldClearReviewHistory = (patch.route !== undefined && patch.route !== this.state.route)
            || (patch.source !== undefined && patch.source !== this.state.source);
        this.state = { ...this.state, ...patch };
        if (shouldClearReviewHistory) this.clearReviewHistory();
        this.persistState();
        this.syncMode(root);
        if (this.state.route === 'study' && !this.allWords.length) {
            this.ensureStudySurface(root);
            void this.loadWordsInto(root, options.preserveWord, { useOfflineCache: true });
            return;
        }
        this.applyWords(root, options.preserveWord, preferredCardKey);
    }

    private isRenderedReviewSource(source: ConcreteNewTabWordSource): boolean {
        if (this.sourceLabelReviewSource() === source) return true;
        const words = this.allWords.length ? this.allWords : this.visibleWords;
        return words.length > 0 && words.every(card => this.cardPrimaryNewTabSource(card) === source);
    }

    private async switchReviewSource(root: HTMLElement, source: ConcreteNewTabWordSource): Promise<void> {
        if (source === this.state.source && this.isRenderedReviewSource(source)) return;
        const sourceSwitchOp = this.operations.begin('sourceSwitch');
        const loadGeneration = ++this.loadGeneration;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        const settings = this.dependencies.getSettings();
        settings.newTabSource = source;
        this.state = { ...this.state, source, revealAnswer: false };
        this.clearReviewHistory();
        this.persistState();
        this.syncMode(root);
        this.navigationSupplementPromise = null;
        const cached = this.cachedSourceResult(source);
        if (cached && this.canUseCachedResultForSourceSwitch(cached, source)) {
            void this.persistSourceSettingChange(source);
            if (sourceSwitchOp.superseded) return;
            await this.applyLoadedWords(root, false, loadGeneration, cached, false, false, this.navigationGeneration);
            return;
        }
        if (cached) this.invalidateSourceResultCache(source);
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.index = 0;
        this.setStatus(root, this.text('loading'));
        await this.persistSourceSettingChange(source);
        if (sourceSwitchOp.superseded) return;
        await this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private canUseCachedResultForSourceSwitch(result: NewTabLoadResult, source: ConcreteNewTabWordSource): boolean {
        if (!result.cards.length) return this.emptyCachedResultMatchesSource(result, source);
        return result.cards.every(card => this.cardPrimaryNewTabSource(card) === source);
    }

    private emptyCachedResultMatchesSource(result: NewTabLoadResult, source: ConcreteNewTabWordSource): boolean {
        if (source === 'anki') return false;
        if (source === 'jpdb') return result.sourceLabel.startsWith('JPDB') || result.sourceLabel.startsWith('Jiten');
        if (source === 'bunpro') return result.sourceLabel.startsWith('Bunpro');
        if (source === 'wanikani') return result.sourceLabel.startsWith('WaniKani');
        if (source === 'yomu-local') return result.sourceLabel.startsWith(ACADEMY_SRS_LABEL);
        return result.sourceLabel === this.text('dictionary');
    }

    // fallow-ignore-next-line complexity, code-duplication
    private cardPrimaryNewTabSource(card: JPDBCard): ConcreteNewTabWordSource {
        if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
        if (card.source === 'bunpro' || card.reviewSource === 'bunpro-api') return 'bunpro';
        if (card.source === 'wanikani' || card.reviewSource === 'wanikani-api') return 'wanikani';
        if (card.source === 'yomu-local' || card.reviewSource === 'yomu-local') return 'yomu-local';
        if (card.source === 'jpdb'
            || card.source === 'jiten'
            || card.reviewSource === 'jpdb-api'
            || card.reviewSource === 'jpdb-live'
            || card.reviewSource === 'jiten-api') {
            return 'jpdb';
        }
        return 'dictionary';
    }

    private syncSourceFromSettings(settings = this.dependencies.getSettings()): void {
        const source = this.effectiveNewTabSourceFromSettings(settings);
        if (this.state.source === source) return;
        this.state = { ...this.state, source, revealAnswer: false };
        this.resetLoadedSourceState();
        this.persistState();
    }

    private effectiveNewTabSourceFromSettings(settings: ReaderSettings): ReaderSettings['newTabSource'] {
        if (this.options.surface === 'academy') return 'yomu-local';
        if (settings.newTabSource !== 'auto') return settings.newTabSource;
        return this.shouldDefaultToAnkiSource(settings) ? 'anki' : 'auto';
    }

    private shouldDefaultToAnkiSource(settings: ReaderSettings): boolean {
        return settings.ankiEnabled
            && this.canUseAnkiSource(settings)
            && !this.hasConfiguredApiReviewSource(settings);
    }

    private hasConfiguredApiReviewSource(settings: ReaderSettings): boolean {
        // Bunpro counts as a configured API review source too — a Bunpro-only
        // setup must not be forced onto the Anki source in auto mode.
        return this.hasAvailableJpdbReviewSource(settings)
            || (this.canUseBunproSource() && !isBunproFrontendCredentialExpired(settings));
    }

    private async applyExternalState(state: NewTabUiState): Promise<void> {
        if (JSON.stringify(this.state) === JSON.stringify(state)) return;
        const preferredCardKey = this.currentVisibleWordKey();
        const sourceChanged = this.state.source !== state.source;
        this.state = state;
        const root = this.currentRoot();
        if (!root) return;
        this.syncMode(root);
        if (sourceChanged) {
            this.resetLoadedSourceState();
            this.setStatus(root, this.text('loading'));
            await this.loadWordsInto(root, false, { useOfflineCache: false });
            return;
        }
        this.applyWords(root, true, preferredCardKey);
    }

    private resetLoadedSourceState(): void {
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.navigationSupplementPromise = null;
        this.index = 0;
        this.sourceLabel = '';
        this.reviewCountMode = false;
        this.clearReviewHistory();
        this.emptyLoadMessageKey = null;
    }

    private persistState(): void {
        if (this.options.surface === 'academy') return;
        saveNewTabUiState(this.state);
        this.stateChannel.publish(this.state);
    }

    private applyWords(root: HTMLElement, preferStoredWord: boolean, preferredCardKey = '', options: { preserveOrder?: boolean } = {}): void {
        this.syncMode(root);
        if (this.state.route === 'search') {
            this.ensureStudySurface(root);
            this.searchController.renderSearch(root);
            return;
        }
        if (this.state.route === 'stats') {
            this.renderStats(root);
            void this.loadStatsInto(root);
            return;
        }
        this.ensureStudySurface(root);
        const baseWords = this.studyPoolForCurrentMode();
        const poolSignature = this.newTabPoolSignature(baseWords);
        const poolChanged = poolSignature !== this.visiblePoolSignature;
        const preferredKey = preferredCardKey || this.preferredStoredWordKey(preferStoredWord);
        if (poolChanged) this.replaceVisibleWordPool(baseWords, poolSignature, preferredKey, options.preserveOrder === true);
        if (!this.ensureVisibleWords(root)) return;
        if (preferredKey || shouldResolveInitialWordIndex(poolChanged, preferStoredWord)) this.index = this.resolveInitialIndex(preferStoredWord, preferredKey);
        this.index = Math.max(0, Math.min(this.index, this.visibleWords.length - 1));
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private ensureStudySurface(root: HTMLElement): void {
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (!study || study.querySelector('[data-newtab-prompt]')) return;
        const fresh = this.renderEnabledContent();
        const freshStudy = fresh.querySelector<HTMLElement>('[data-newtab-study]');
        if (!freshStudy) return;
        study.replaceChildren(...Array.from(freshStudy.childNodes));
        this.syncMode(root);
    }

    private studyPoolForCurrentMode(): JPDBCard[] {
        return this.studyPool.studyPoolForCurrentMode();
    }

    private isVocabularyStudyRoute(): boolean {
        return this.state.route === 'study' && !this.currentCardRendersAsKanji();
    }

    private replaceVisibleWordPool(baseWords: JPDBCard[], poolSignature: string, preferredKey = '', preserveOrder = false): void {
        this.visibleWords = preserveOrder ? baseWords : promoteCardByKey(baseWords, preferredKey);
        this.visiblePoolSignature = poolSignature;
    }

    private ensureVisibleWords(root: HTMLElement): boolean {
        if (this.visibleWords.length) return true;
        this.index = 0;
        this.renderEmpty(root, APP_NAME, this.text(this.emptyStudyMessageKey()));
        return false;
    }

    private emptyStudyMessageKey(): NewTabCopyKey {
        if (this.reviewCountMode) return this.currentCardRendersAsKanji() ? 'noReviewKanjiReady' : 'noReviewWordsReady';
        return 'noCards';
    }

    private newTabPoolSignature(cards: JPDBCard[]): string {
        return this.studyPool.poolSignature(cards);
    }

    private resolveInitialIndex(preferStoredWord: boolean, preferredCardKey = ''): number {
        const preferredKey = preferredCardKey || this.preferredStoredWordKey(preferStoredWord);
        if (preferredKey) {
            const index = this.visibleWords.findIndex(card => this.cardMatchesSelectionKey(card, preferredKey));
            if (index >= 0) return index;
        }
        const identity = this.portableCardIdentityFromLocation();
        if (identity?.spelling) {
            const index = this.visibleWords.findIndex(card => this.cardMatchesPortableIdentity(card, identity));
            if (index >= 0) return index;
        }
        return 0;
    }

    private currentVisibleWordKey(): string {
        const current = this.visibleWords[this.index];
        return current ? this.cardSelectionKey(current) : '';
    }

    private cardMatchesSelectionKey(card: JPDBCard, key: string): boolean {
        return cardKey(card) === key || this.cardSelectionKey(card) === key;
    }

    private cardMatchesPortableIdentity(card: JPDBCard, identity: PortableStudyCardIdentity): boolean {
        const spelling = card.spelling.trim();
        if (!spelling || spelling !== identity.spelling) return false;
        const reading = newTabCardReading(card).trim() || card.reading.trim();
        return !identity.reading || !reading || reading === identity.reading;
    }

    private cardSelectionKey(card: JPDBCard): string {
        return card.sourceCardKey || cardKey(card);
    }

    private studyCardDomToken(card: JPDBCard): string {
        const identity = this.cardSelectionKey(card);
        const existing = this.studyCardDomTokens.get(identity);
        const token = existing ?? `study-card-${++this.studyCardDomTokenSequence}`;
        if (!existing) this.studyCardDomTokens.set(identity, token);
        // Refresh the token's target when a logical card is rehydrated into a
        // new object, so nested actions always use the current source record.
        this.studyCardsByDomToken.set(token, this.sourceCardForVisibleCard(card) ?? card);
        return token;
    }

    private renderedStudyCardIdentity(card: JPDBCard): string {
        return this.state.revealAnswer ? this.cardSelectionKey(card) : this.studyCardDomToken(card);
    }

    private isReviewHistoryCard(card: JPDBCard | undefined): boolean {
        if (!card) return false;
        const key = cardKey(card);
        return this.reviewHistoryCards.some(historyCard => cardKey(historyCard) === key);
    }

    private rememberReviewHistoryCard(card: JPDBCard): void {
        if (!this.reviewCountMode || !this.isReviewCard(card)) return;
        const key = cardKey(card);
        this.reviewHistoryCards = [
            normalizeNewTabCard(card),
            ...this.reviewHistoryCards.filter(historyCard => cardKey(historyCard) !== key),
        ].slice(0, NEW_TAB_REVIEW_HISTORY_LIMIT);
    }

    private clearReviewHistory(): void {
        this.reviewHistoryCards = [];
    }

    private preferredStoredWordKey(preferStoredWord: boolean): string {
        // UT-59: a #card= deep link wins over the stored session position.
        const fromUrl = isYomuNewTabUrl(location.href) ? this.cardKeyFromLocation() : '';
        if (fromUrl) return fromUrl;
        if (!preferStoredWord || this.shouldSkipStoredWordRestoreForJpdbApiQueue()) return '';
        const stored = this.readStoredWordKey();
        return stored?.signature === this.currentSessionSignature() ? stored.key : '';
    }

    private shouldSkipStoredWordRestoreForJpdbApiQueue(): boolean {
        return this.reviewCountMode && this.allWords.some(card => card.reviewSource === 'jpdb-api');
    }

    private showNextWord(): void {
        this.navigateStudyWord(1);
    }

    private showPreviousWord(): void {
        // UT-58: stepping back right after grading IS the undo gesture.
        if (this.canUndoLastReview()) {
            const root = this.currentRoot();
            if (root) {
                void this.undoLastReview(root);
                return;
            }
        }
        if (this.index <= 0) return;
        this.navigateStudyWord(-1);
    }

    private navigateStudyWord(direction: 1 | -1): void {
        const root = this.currentRoot();
        if (!root || !this.visibleWords.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.navigationGeneration++;
        const expansionSource = this.navigationExpansionSource();
        if (this.shouldLoadMoreForNavigation(direction, expansionSource)) {
            void this.loadMoreForNavigation(root, direction, expansionSource);
            return;
        }
        this.moveVisibleWord(root, direction);
    }

    private moveVisibleWord(root: HTMLElement, direction: 1 | -1): void {
        this.index = (this.index + direction + this.visibleWords.length) % this.visibleWords.length;
        this.state.revealAnswer = false;
        this.persistState();
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private shouldLoadMoreForNavigation(direction: 1 | -1, source: NavigationExpansionSource | null): source is NavigationExpansionSource {
        if (this.navigationSupplementPromise) return false;
        const atBoundary = direction > 0
            ? this.index >= this.visibleWords.length - 1
            : this.index <= 0;
        return atBoundary && source !== null;
    }

    private async loadMoreForNavigation(root: HTMLElement, direction: 1 | -1, source: NavigationExpansionSource): Promise<void> {
        const currentKey = this.currentVisibleWordKey();
        const target = captureActiveTarget();
        this.setStatus(root, this.text(this.currentCardRendersAsKanji() ? 'noKanjiCardsYet' : 'noWordsYet'));
        const promise = this.appendNavigationSupplement(root, direction, currentKey, source);
        this.navigationSupplementPromise = promise;
        try {
            await promise;
        } catch (error) {
            if (!isCurrentActiveTarget(target)) return;
            log.warn('New-tab supplement failed', { source }, error);
            if (root.isConnected && this.visibleWords.length) this.moveVisibleWord(root, direction);
            else if (root.isConnected) this.setStatus(root, this.text('couldNotLoadWords'));
        } finally {
            if (this.navigationSupplementPromise === promise) this.navigationSupplementPromise = null;
        }
    }

    private async appendNavigationSupplement(root: HTMLElement, direction: 1 | -1, currentKey: string, source: NavigationExpansionSource): Promise<void> {
        const target = captureActiveTarget();
        const beforeSignature = this.newTabPoolSignature(this.studyPoolForCurrentMode());
        const cards = await this.loadNavigationSupplementCards(source);
        if (!isCurrentActiveTarget(target)) return;
        if (!cards.length) {
            this.moveVisibleWord(root, direction);
            return;
        }

        this.allWords = dedupeWords([...this.allWords, ...cards.map(normalizeNewTabCard)]);
        this.dependencies.parser.cacheCards?.(this.allWords);
        const baseWords = this.studyPoolForCurrentMode();
        const poolSignature = this.newTabPoolSignature(baseWords);
        if (poolSignature === beforeSignature) {
            this.moveVisibleWord(root, direction);
            return;
        }

        this.visibleWords = baseWords;
        this.visiblePoolSignature = poolSignature;
        const currentIndex = this.visibleWords.findIndex(card => this.cardMatchesSelectionKey(card, currentKey));
        if (direction > 0) {
            this.index = currentIndex >= 0 ? (currentIndex + 1) % this.visibleWords.length : 0;
        } else {
            this.index = currentIndex > 0 ? currentIndex - 1 : this.visibleWords.length - 1;
        }
        this.state.revealAnswer = false;
        this.persistState();
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private async loadNavigationSupplementCards(source: NavigationExpansionSource): Promise<JPDBCard[]> {
        const expandedLimit = this.allWords.length + NEW_TAB_WORD_LIMIT;
        if (source === 'dictionary') return (await this.loadDictionaryWords(undefined, expandedLimit)).cards;
        if (source === 'anki') return (await this.loadAnkiWords(NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, expandedLimit)).cards;
        if (source === 'public-jpdb') return (await this.loadPublicJpdbWords()).cards;
        return (await this.loadJpdbWords({
            allowPublicFallback: false,
            timeoutMs: NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
            limit: expandedLimit,
        })).cards;
    }

    private navigationExpansionSource(): NavigationExpansionSource | null {
        if (!this.canExpandNavigation()) return null;
        return this.dictionaryNavigationExpansionSource()
            ?? this.publicJpdbNavigationExpansionSource()
            ?? this.liveReviewNavigationExpansionSource()
            ?? this.defaultNavigationExpansionSource();
    }

    private canExpandNavigation(): boolean {
        return Boolean(this.visibleWords.length) && !this.isNavigationExpansionBlockedMode();
    }

    private isNavigationExpansionBlockedMode(): boolean {
        return this.state.route === 'search' || this.state.route === 'stats';
    }

    private dictionaryNavigationExpansionSource(): NavigationExpansionSource | null {
        return this.shouldExpandDictionaryNavigation() ? 'dictionary' : null;
    }

    private shouldExpandDictionaryNavigation(): boolean {
        return this.state.source === 'dictionary' || this.allWords.some(card => this.isDictionaryCard(card));
    }

    private publicJpdbNavigationExpansionSource(): NavigationExpansionSource | null {
        return !this.reviewCountMode && this.sourceLabel.startsWith('JPDB') ? 'public-jpdb' : null;
    }

    private liveReviewNavigationExpansionSource(): NavigationExpansionSource | null {
        if (!this.shouldExpandLiveReviewNavigation()) return null;
        return this.explicitNavigationExpansionSource('jpdb') ?? this.explicitNavigationExpansionSource('anki');
    }

    private shouldExpandLiveReviewNavigation(): boolean {
        return this.reviewCountMode
            && !this.isOfflineSourceLabel(this.sourceLabel)
            && !this.sourceLabel.includes(this.text('liveReview'));
    }

    private explicitNavigationExpansionSource(source: 'jpdb' | 'anki'): NavigationExpansionSource | null {
        if (this.state.source === source) return source;
        return this.sourceLabel.startsWith(NEW_TAB_SOURCE_LABELS[source]) ? source : null;
    }

    private defaultNavigationExpansionSource(): NavigationExpansionSource | null {
        return this.reviewCountMode ? null : 'dictionary';
    }

    private renderWord(root: HTMLElement, card: JPDBCard): void {
        // Embedded callers and older persisted fixtures can still inject the
        // pre-NB-40 mode shape. Translate it before any route-owned side
        // effects (stored position or URL history), not midway through render.
        this.migrateLegacyState(card);
        if (this.initialStudyStepIdPending) {
            this.setStudyStepOverrideForCard(card, this.initialStudyStepIdPending);
            this.initialStudyStepIdPending = null;
        }
        this.writeStoredWordKey(card);
        this.syncCardUrl(card);
        this.ensureNPlusOneStudySentence(card);
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (study) study.dataset.newtabCard = this.renderedStudyCardIdentity(card);
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-empty-mode');
        root.classList.toggle('jpdb-reader-newtab-revealed', this.state.revealAnswer);
        const hasKanjiStudyStep = this.shouldRenderCardAsKanji(card);
        const session = this.studySessionForCard(card, hasKanjiStudyStep);
        const renderAsKanji = this.studyStepRendersKanji(session);
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', renderAsKanji);
        root.classList.toggle('jpdb-reader-newtab-final-reveal-mode', session.activeStep.kind === 'final-reveal');
        root.classList.toggle('jpdb-reader-newtab-review-mode', this.canReviewCard(card));
        if (study) {
            study.dataset.newtabStudyStep = session.activeStep.kind;
            study.dataset.newtabStudyFlow = session.steps.map(step => step.kind).join(' ');
            study.dataset.newtabGradeStep = session.gradeStep.kind;
        }
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        const state = primaryCardState(card.cardState);

        this.renderStudySteps(slots.steps, session);
        this.renderStudyTour(slots.tour, session, card);
        this.renderPromptForMode(slots, card, state, renderAsKanji);
        this.renderStudyRevealHintSummary(slots, card);

        this.renderSessionProgress(slots, card, root);
        if (slots.reveal) slots.reveal.textContent = this.revealButtonLabel();
        this.renderControls(slots, card);
        this.renderStatus(slots.status, card);
        const prefetchGeneration = ++this.immersionPrefetchGeneration;
        if (!renderAsKanji) this.dependencies.preloadWordAudio?.(card);
        this.prefetchNearbyWordPitch(card);
        this.prefetchNearbyImmersionExamples(card, prefetchGeneration);
    }

    private studySessionForCard(card: JPDBCard, renderAsKanji = this.shouldRenderCardAsKanji(card)): NewTabStudySession {
        this.migrateLegacyState(card);
        const settings = this.dependencies.getSettings();
        return createNewTabStudySession(card, {
            revealAnswer: this.state.revealAnswer,
            renderAsKanji,
            ...this.pinnedStudyPlanInputs(card),
            stepOrder: settings.newTabStudyStepOrder,
            disabledSteps: settings.newTabStudyDisabledSteps,
            activeStepId: this.studyStepOverrideForCard(card),
        });
    }

    // One compatibility seam replaces the former mode/step reconciliation
    // sites. Persisted pre-NB-40 state and older embedded callers may still
    // provide `mode`/`listenSubMode`; consume those fields once, translate them
    // to the route plus active step, and keep the live state route-only.
    private migrateLegacyState(card?: JPDBCard): void {
        const legacy = this.state as NewTabUiState & { mode?: unknown; listenSubMode?: unknown };
        if (legacy.mode === undefined) return;
        const mode = legacy.mode;
        const listenMode = legacy.listenSubMode;
        const { mode: _mode, listenSubMode: _listenSubMode, ...current } = legacy;
        void _mode;
        void _listenSubMode;
        this.state = {
            ...normalizeNewTabUiState(current),
            route: legacyNewTabRoute(mode),
        };
        this.applyLegacyStudyTransition(card, legacyStudyTransition(mode, listenMode));
    }

    private applyLegacyStudyTransition(card: JPDBCard | undefined, transition: LegacyStudyTransition): void {
        if (transition.listenMode) this.listenInteractionMode = transition.listenMode;
        if (!transition.stepId) return;
        if (card) this.setStudyStepOverrideForCard(card, transition.stepId);
        else this.initialStudyStepIdPending = transition.stepId;
    }

    private applyLoadedLegacyStudyIntent(intent: LegacyNewTabStudyIntent | null): void {
        if (!intent) return;
        if (intent.kind === 'recall') {
            this.initialStudyStepIdPending = 'recall-cloze';
            return;
        }
        if (intent.kind === 'kanji') {
            if (usesJapaneseCharacterStudy()) this.initialStudyStepIdPending = 'kanji-doodle:0';
            return;
        }
        this.listenInteractionMode = intent.interaction === 'recall' ? 'recall' : 'perceive';
        this.initialStudyStepIdPending = intent.interaction === 'shadow' ? 'speaking' : 'listen-pitch';
    }

    // The step plan is PINNED per card at first presentation: async sentence or
    // kanji enrichment must not reshape an on-screen session. Pitch is the sole
    // monotonic exception below because an unresolved card cannot offer usable
    // Listen/Speak steps, while an exact late result can safely add them once.
    private pinnedStudyPlanInputs(card: JPDBCard): { hasRecallCloze: boolean; pitchAvailable: boolean } {
        const key = cardKey(card);
        if (this.pinnedStudyPlan?.cardKey === key) return this.pinnedStudyPlan.inputs;
        const inputs = {
            hasRecallCloze: buildNewTabRecallCloze(card, this.recallSentenceFromCard(card), newTabCardReading(card)).hasCloze,
            pitchAvailable: pitchSeedFromCard(card, Date.now()) !== null,
        };
        this.pinnedStudyPlan = { cardKey: key, inputs };
        return inputs;
    }

    // Pitch availability is pinned like the rest of the plan, but it may resolve
    // AFTER the pin — public/local/Jiten enrichment lands asynchronously. This is
    // the one allowed exception: false -> true only (never remove a step already
    // shown), and only for the pin that matches this card, so a stale enrichment
    // from a card the learner has since navigated away from can't relabel a
    // different card's pin or trigger a rerender of what's now on screen.
    private upgradeStudyPlanPitchAvailability(card: JPDBCard): boolean {
        const key = cardKey(card);
        if (this.pinnedStudyPlan?.cardKey !== key || this.pinnedStudyPlan.inputs.pitchAvailable) return false;
        const current = this.visibleWords[this.index];
        if (!current || cardKey(current) !== key) return false;
        if (!current.pitchAccent.length && card.pitchAccent.length) current.pitchAccent = [...card.pitchAccent];
        if (!pitchSeedFromCard(current, Date.now())) return false;
        this.pinnedStudyPlan = { cardKey: key, inputs: { ...this.pinnedStudyPlan.inputs, pitchAvailable: true } };
        const root = this.currentRoot();
        if (!root) return false;
        this.renderWord(root, current);
        return true;
    }

    private studyStepOverrideForCard(card: JPDBCard): NewTabStudyStepId | null {
        return this.studyStepOverride?.cardKey === cardKey(card) ? this.studyStepOverride.id : null;
    }

    private setStudyStepOverrideForCurrentCard(id: NewTabStudyStepId | null): void {
        const card = this.visibleWords[this.index];
        this.setStudyStepOverrideForCard(card ?? null, id);
    }

    private setStudyStepOverrideForCard(card: JPDBCard | null, id: NewTabStudyStepId | null): void {
        this.studyStepOverride = card && id ? { cardKey: cardKey(card), id } : null;
    }

    private studyStepForId(id: NewTabStudyStepId): NewTabStudyStep | null {
        return this.findStudyStep(step => step.id === id);
    }

    private studyStepForKind(kind: NewTabStudyStepKind): NewTabStudyStep | null {
        return this.findStudyStep(step => step.kind === kind);
    }

    private findStudyStep(matches: (step: NewTabStudyStep) => boolean): NewTabStudyStep | null {
        const card = this.visibleWords[this.index];
        if (!card) return null;
        const session = this.studySessionForCard(card, this.shouldRenderCardAsKanji(card));
        return session.steps.find(matches) ?? null;
    }

    private studyStepRendersKanji(session: NewTabStudySession): boolean {
        return session.activeStep.kind === 'kanji-doodle'
            || (session.activeStep.kind === 'final-reveal' && this.currentCardRendersAsKanji());
    }

    private wordSessionRendersKanji(): boolean {
        if (this.state.route !== 'study') return false;
        const card = this.visibleWords[this.index];
        if (!card) return false;
        return this.studyStepRendersKanji(this.studySessionForCard(card, this.shouldRenderCardAsKanji(card)));
    }

    private renderStudySteps(slot: HTMLElement | null, session: NewTabStudySession): void {
        if (!slot) return;
        if (session.steps.length <= 1 || this.state.route === 'search' || this.state.route === 'stats') {
            slot.replaceChildren();
            slot.hidden = true;
            return;
        }
        slot.hidden = false;
        replaceChildrenWith(slot, session.steps.map((step, index) => this.studyStepButton(step, index, session)));
    }

    private studyStepButton(step: NewTabStudyStep, index: number, session: NewTabStudySession): HTMLButtonElement {
        const active = step.id === session.activeStep.id;
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-study-step',
            dataset: {
                newtabAction: newTabAction('study-step'),
                studyStepId: step.id,
                studyStepKind: step.kind,
                active: String(active),
                gradeable: String(step.gradeable),
            },
            role: 'listitem',
            'aria-current': active ? 'step' : undefined,
            'aria-label': `${index + 1}. ${this.studyStepLabel(step, session)}`,
            title: step.label,
        },
            el('span', { class: 'jpdb-reader-newtab-study-step-index' }, String(index + 1)),
            el('span', { class: 'jpdb-reader-newtab-study-step-label' }, this.studyStepLabel(step, session)),
        );
    }

    // The doodle step tests recall of the kanji, so its chip must not print the
    // answer character before the reveal — number the kanji steps instead
    // (Kanji 1 / Kanji 2), unveiling the glyph only once answers are shown.
    private studyStepLabel(step: NewTabStudyStep, session: NewTabStudySession): string {
        if (!step.kanji) return step.label;
        if (this.state.revealAnswer) return `${step.label} ${step.kanji}`;
        const kanjiSteps = session.steps.filter(candidate => candidate.kind === 'kanji-doodle');
        return kanjiSteps.length > 1 ? `${step.label} ${kanjiSteps.indexOf(step) + 1}` : step.label;
    }

    private renderStudyTour(slot: HTMLElement | null, session: NewTabStudySession, card: JPDBCard): void {
        if (!slot) return;
        const settings = this.dependencies.getSettings();
        const audioAvailability = this.studyAudioAvailability(card);
        const showTour = !settings.newTabStudyTourSeen && this.state.route === 'study' && session.steps.length > 1;
        if (showTour) {
            slot.hidden = false;
            slot.dataset.studyTourMode = 'guide';
            replaceChildrenWith(slot,
                el('div', { class: 'jpdb-reader-newtab-study-tour-body' },
                    el('p', { class: 'jpdb-reader-newtab-study-tour-intro' }, this.text('studyTourIntro')),
                    el('ol', { class: 'jpdb-reader-newtab-study-tour-list' },
                        session.steps.map((step, index) => this.studyTourStep(step, index))),
                    audioAvailability,
                ),
                el('button', { type: 'button', dataset: { newtabAction: newTabAction('dismiss-study-tour') } }, this.text('studyTourStart')),
            );
            return;
        }
        if (audioAvailability && this.state.route === 'study') {
            slot.hidden = false;
            slot.dataset.studyTourMode = 'availability';
            replaceChildrenWith(slot, audioAvailability);
            return;
        }
        slot.hidden = true;
        delete slot.dataset.studyTourMode;
        slot.replaceChildren();
    }

    private studyAudioAvailability(card: JPDBCard): HTMLParagraphElement | null {
        const target = newTabCardTarget(card);
        if (target.capabilities.audio) return null;
        const disabled = new Set(this.dependencies.getSettings().newTabStudyDisabledSteps);
        const modes = [
            disabled.has('listen-pitch') ? null : { kind: 'listen-pitch', label: this.text('studySummaryListen') },
            disabled.has('speaking') ? null : { kind: 'speaking', label: this.text('studySummarySpeaking') },
        ].filter((mode): mode is { kind: 'listen-pitch' | 'speaking'; label: string } => mode !== null);
        if (!modes.length) return null;
        return el('p', {
            class: 'jpdb-reader-newtab-study-availability',
            role: 'note',
            dataset: {
                studyUnavailableModes: modes.map(mode => mode.kind).join(' '),
                studyUnavailableReason: 'target-audio',
            },
        }, this.formatNewTabText('studyAudioAvailability', {
            language: languageDisplayName(target.language, this.resolvedLanguage()),
            modes: modes.map(mode => mode.label).join(' + '),
        }));
    }

    private studyTourStep(step: NewTabStudyStep, index: number): HTMLLIElement {
        return el('li', { class: 'jpdb-reader-newtab-study-tour-step', dataset: { gradeable: String(step.gradeable) } },
            el('span', { class: 'jpdb-reader-newtab-study-tour-index' }, String(index + 1)),
            el('span', { class: 'jpdb-reader-newtab-study-tour-copy' },
                el('span', { class: 'jpdb-reader-newtab-study-tour-label' }, step.label),
                el('span', { class: 'jpdb-reader-newtab-study-tour-note' }, this.text(studyTourCopyKey(step.kind))),
            ),
        );
    }

    private renderPromptForMode(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>, renderAsKanji = this.shouldRenderCardAsKanji(card)): void {
        const step = this.studySessionForCard(card, renderAsKanji).activeStep;
        if (renderAsKanji) this.renderKanjiPrompt(slots, card, step.kanji);
        // A word card's kanji-doodle steps render in-session (the kanji QUEUE
        // is only for real kanji cards) — without this branch the Kanji 2 chip
        // showed the plain word prompt.
        else if (step.kind === 'kanji-doodle') this.renderKanjiPrompt(slots, card, step.kanji);
        else if (step.kind === 'listen-pitch' || step.kind === 'speaking') this.renderListenPrompt(slots, card);
        else if (step.kind === 'recall-cloze') this.renderRecallPrompt(slots, card, state);
        else if (step.kind === 'type-word') this.renderTypeWordPrompt(slots, card);
        else this.renderWordPrompt(slots, card, state);
    }

    // ----- Listen mode: audio-first pitch-accent drills over a local pitch SRS -----

    private listenRootEl(): HTMLElement | null {
        return this.currentRoot();
    }

    private renderListenPrompt(slots: NewTabStudySlots, card: JPDBCard): void {
        const prompt = slots.prompt;
        if (!prompt) return;
        prompt.classList.remove('jpdb-reader-newtab-kanji-prompt');
        if (slots.answer) replaceChildrenWith(slots.answer);
        if (slots.meaning) replaceChildrenWith(slots.meaning);
        const item = this.pitchSrs.ensureFromCard(card, Date.now());
        if (!item) {
            this.listenItem = null;
            // Listen/Speak steps exist for every provider, but SRS-adapter cards
            // (Yomu local / Bunpro) arrive without pitch — enrich from the local
            // pitch dictionary and re-render this card once pitch lands.
            void this.loadWordPitch(card).then(pitchAccent => {
                if (!pitchAccent.length) return;
                if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
                // Re-render ONLY if the enriched pitch actually seeds an SRS item.
                // Fetched contours that never match the reading (mora mismatch,
                // empty reading) would otherwise re-enter this branch, resolve the
                // cached pitch promise on a microtask, and re-render forever —
                // an infinite loop that froze the tab on the Speak step.
                if (!pitchSeedFromCard(card, Date.now())) return;
                const root = this.listenRootEl();
                if (root && this.visibleWords[this.index] === card) this.renderWord(root, card);
            }).catch(() => undefined);
            setInnerHtml(prompt, `<div class="jpdb-reader-newtab-listen-card"><span class="jpdb-reader-newtab-listen-note">${escapeHtml(this.text('listenNoAudio'))}</span></div>`);
            return;
        }
        // Reset the in-card interaction state on a new card OR a sub-mode switch, so
        // a Perceive pick/reveal never leaks into the Recall/Shadow view of the same word.
        const isNewCard = !this.listenItem || this.listenItem.key !== item.key;
        const isSubModeChange = this.listenRenderedMode !== this.activeListenInteractionMode();
        if (isNewCard || isSubModeChange) {
            this.listenItem = item;
            this.listenRenderedMode = this.activeListenInteractionMode();
            // Restore a prior perceive pick so the pitch selection sticks when the
            // learner steps away and back within the same card (the pick is
            // persisted per card, feeding the single reveal like recall does).
            const prior = this.activeListenInteractionMode() === 'perceive' ? this.stepState(cardKey(card))?.pitch ?? null : null;
            this.listenSelectedPosition = prior ? prior.position : null;
            this.listenRevealed = this.activeListenInteractionMode() === 'shadow' || Boolean(prior);
            this.listenOutcome = prior ? prior.outcome : null;
            this.listenContrastCard = null;
            this.clearListenSpeakingScore();
            this.clearListenRecording();
            this.listenRecordingUnavailable = false;
        }
        setInnerHtml(prompt, renderListenCard(this.listenCardView(card, item), key => this.text(key)));
        if ((isNewCard || isSubModeChange) && this.activeListenInteractionMode() === 'perceive' && this.dependencies.playWordAudio) {
            void this.playListenModelAudio();
        }
    }

    private listenCardView(card: JPDBCard, item: PitchSrsItem): ListenCardView {
        return {
            item,
            meaning: firstCardMeaning(card),
            subMode: this.activeListenInteractionMode(),
            revealed: this.listenRevealed,
            selectedPosition: this.listenSelectedPosition,
            outcome: this.listenOutcome,
            validPositions: [...this.listenValidPositions(card, item)],
            variants: collectPitchVariants(item.reading, this.listenAccentPatterns(card, item)),
            hasAudio: Boolean(this.dependencies.playWordAudio),
            recording: Boolean(this.listenRecorder && this.listenRecorder.state !== 'inactive'),
            hasRecording: Boolean(this.listenRecordingUrl),
            speakingScore: this.listenSpeakingScore,
            speakingScoring: this.listenSpeakingScoring,
            micEnabled: this.activeListenInteractionMode() === 'shadow',
            micUnavailable: this.listenRecordingUnavailable,
            contrast: this.listenContrastView(),
        };
    }

    // The full accepted-accent candidate set for the current listen word: the
    // card's variants in source (prevalence) order, with the SRS item's own
    // contour appended so the keyed answer is always represented.
    private listenAccentPatterns(card: JPDBCard | undefined, item: PitchSrsItem): string[] {
        return [...(card?.pitchAccent ?? []), item.pattern];
    }

    private listenValidPositions(card: JPDBCard | undefined, item: PitchSrsItem): Set<number> {
        const positions = validPitchPositions(item.reading, this.listenAccentPatterns(card, item));
        positions.add(item.pitchNumber);
        return positions;
    }

    private listenContrastView(): ListenCardView['contrast'] {
        const card = this.listenContrastCard;
        if (!card) return null;
        const reading = cardPronunciationReading(card);
        const pitchNumber = pitchNumberForReading(card.pitchAccent, reading);
        if (pitchNumber == null) return null;
        return { reading, pattern: contextPitchPattern(card.pitchAccent, reading), displaySpelling: card.spelling || reading };
    }

    private rerenderActiveListen(): void {
        const root = this.listenRootEl();
        const card = this.visibleWords[this.index];
        if (root && card && (this.activeStudyStepIsListen())) this.renderWord(root, card);
    }

    // In-session Listen/Speak steps keep the study route and active session
    // (the listen TAB re-pools pitch-eligible cards only); listen interactions
    // and shortcuts key off the active step instead.
    private activeStudyStepIsListen(): boolean {
        const kind = this.activeStudyStepKind();
        return kind === 'listen-pitch' || kind === 'speaking';
    }

    private activeStudyStepKind(): NewTabStudyStepKind | null {
        if (this.state.route !== 'study') return null;
        const card = this.visibleWords[this.index];
        if (!card) return null;
        return this.studySessionForCard(card, this.shouldRenderCardAsKanji(card)).activeStep.kind;
    }

    private activeListenInteractionMode(): ListenInteractionMode {
        const kind = this.activeStudyStepKind();
        return kind === 'speaking' ? 'shadow' : this.listenInteractionMode;
    }

    private handleListenPick(_root: HTMLElement, target: HTMLElement): void {
        const raw = target.closest<HTMLElement>('[data-listen-pos]')?.dataset.listenPos;
        const position = raw == null ? NaN : Number(raw);
        if (Number.isInteger(position)) this.pickListenPosition(position);
    }

    private pickListenPosition(position: number): void {
        if (!this.listenItem || this.activeListenInteractionMode() === 'shadow') return;
        if (position < 0 || position > splitMorae(this.listenItem.reading).length) return;
        this.listenSelectedPosition = position;
        if (this.listenRevealed) {
            // Post-feedback picks are exploration only: move the visual selection,
            // never rewrite the recorded first-attempt outcome.
            this.rerenderActiveListen();
            return;
        }
        const card = this.visibleWords[this.index];
        // Multi-accent honesty: any accepted variant's downstep counts as correct.
        const correct = this.listenValidPositions(card, this.listenItem).has(position);
        this.listenRevealed = true;
        this.listenOutcome = correct ? 'correct' : 'wrong';
        // Persist the FIRST pick per card so it survives step navigation and feeds
        // the single reveal — the pitch step's outcome tracks exactly like recall.
        if (card) this.ensureStepState(cardKey(card)).pitch = { position, outcome: this.listenOutcome };
        this.rerenderActiveListen();
        void this.playListenModelAudio();
    }

    private advanceListen(_root: HTMLElement): void {
        this.listenItem = null;
        this.listenSelectedPosition = null;
        this.listenRevealed = false;
        this.listenOutcome = null;
        this.listenContrastCard = null;
        this.listenAudioGeneration += 1; // invalidate any in-flight model/contrast clip
        this.clearListenSpeakingScore();
        this.clearListenRecording();
        if (this.navigateStudyStep('next')) return;
        // Legacy standalone listen fallback: if there is no next merged study
        // step, keep the old pitch-card cycling behavior.
        this.visibleWords = this.studyPoolForCurrentMode();
        this.showNextWord();
    }

    // Keyboard for Listen: digits 0-N pick the downstep, configured Study keys
    // advance within the merged session, and configured audio keys replay the model.
    // The contrast-pair shortcut stays local to the error state.
    private handleListenKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): void {
        const settings = this.dependencies.getSettings();
        if (this.handleListenNavigationKey(event, settings)) return;
        if (this.handleListenAdvanceKey(root, event, target, settings)) return;
        if (this.handleListenReplayKey(event, settings)) return;
        if (this.handleListenPositionKey(event)) return;
        this.handleListenContrastKey(event);
    }

    private handleListenNavigationKey(event: KeyboardEvent, settings: ReaderSettings): boolean {
        const direction = this.studyNavigationDirection(event, settings);
        if (!direction) return false;
        event.preventDefault();
        if (!this.navigateStudyStep(direction)) this.showWordInDirection(direction);
        return true;
    }

    private handleListenAdvanceKey(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null, settings: ReaderSettings): boolean {
        if (!this.matchesStudyRevealShortcut(root, event, target, settings)) return false;
        event.preventDefault();
        this.dismissKeyHints(root);
        this.advanceListen(root);
        return true;
    }

    private handleListenReplayKey(event: KeyboardEvent, settings: ReaderSettings): boolean {
        if (!matchesShortcut(event, settings.shortcuts.playAudio)) return false;
        event.preventDefault();
        void this.playListenModelAudio();
        return true;
    }

    private handleListenPositionKey(event: KeyboardEvent): boolean {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
        if (!/^[0-9]$/u.test(event.key) || this.activeListenInteractionMode() === 'shadow') return false;
        event.preventDefault();
        this.pickListenPosition(Number(event.key));
        return true;
    }

    private handleListenContrastKey(event: KeyboardEvent): void {
        if (event.key.toLowerCase() !== 'b' || !this.listenContrastCard) return;
        event.preventDefault();
        void this.playListenContrast();
    }

    private async playListenModelAudio(): Promise<void> {
        const generation = this.listenAudioGeneration;
        const card = this.visibleWords[this.index];
        if (card && generation === this.listenAudioGeneration) await this.dependencies.playWordAudio?.(card);
    }

    private async playListenContrast(): Promise<void> {
        const generation = this.listenAudioGeneration;
        await this.playListenModelAudio();
        const contrast = this.listenContrastCard;
        if (!contrast) return;
        await new Promise(resolve => setTimeout(resolve, 700));
        // The user may have advanced during the gap — don't play the previous card's
        // contrast over the new card's model clip.
        if (generation !== this.listenAudioGeneration) return;
        await this.dependencies.playWordAudio?.(contrast);
    }

    private async toggleListenRecording(): Promise<void> {
        if (this.listenRecorder && this.listenRecorder.state !== 'inactive') {
            this.stopListenRecorder();
            return;
        }
        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            this.listenRecordingUnavailable = true;
            this.rerenderActiveListen();
            return;
        }
        try {
            const recordingItemKey = this.listenItem?.key ?? '';
            const stream = await mediaDevices.getUserMedia({ audio: true });
            if (!recordingItemKey || this.listenItem?.key !== recordingItemKey || this.activeListenInteractionMode() !== 'shadow') {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            this.clearListenSpeakingScore();
            this.clearListenRecording();
            const recorder = new MediaRecorder(stream);
            const chunks: Blob[] = [];
            recorder.addEventListener('dataavailable', event => { if (event.data && event.data.size) chunks.push(event.data); });
            recorder.addEventListener('stop', () => {
                if (this.listenRecordingStopTimer) {
                    clearTimeout(this.listenRecordingStopTimer);
                    this.listenRecordingStopTimer = undefined;
                }
                stream.getTracks().forEach(track => track.stop());
                this.clearListenRecording(); // also nulls listenRecorder + revokes any prior url
                const blob = chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null;
                if (blob && this.listenItem?.key === recordingItemKey && this.activeListenInteractionMode() === 'shadow') {
                    this.listenRecordingUrl = URL.createObjectURL(blob);
                    this.listenSpeakingScoring = true;
                    const scoreGeneration = ++this.listenSpeakingScoreGeneration;
                    void this.scoreListenRecording(blob, recordingItemKey, scoreGeneration);
                }
                this.rerenderActiveListen();
            });
            this.listenRecordingUnavailable = false;
            this.listenRecorder = recorder;
            recorder.start();
            this.listenRecordingStopTimer = setTimeout(() => {
                if (this.listenRecorder === recorder && recorder.state !== 'inactive') this.stopListenRecorder();
            }, 3200);
            this.rerenderActiveListen();
        } catch (error) {
            log.warn('Listen self-recording unavailable', error);
            this.listenRecorder = undefined;
            this.listenRecordingUnavailable = true;
            this.rerenderActiveListen();
        }
    }

    private stopListenRecorder(): void {
        if (this.listenRecordingStopTimer) {
            clearTimeout(this.listenRecordingStopTimer);
            this.listenRecordingStopTimer = undefined;
        }
        if (this.listenRecorder && this.listenRecorder.state !== 'inactive') {
            try { this.listenRecorder.stop(); } catch { /* already stopping */ }
        }
    }

    private async scoreListenRecording(blob: Blob, itemKey: string, generation: number): Promise<void> {
        try {
            const item = this.listenItem?.key === itemKey ? this.listenItem : null;
            const score = item ? await scoreSpeakingBlob(blob, item) : null;
            if (generation !== this.listenSpeakingScoreGeneration || this.listenItem?.key !== itemKey || this.activeListenInteractionMode() !== 'shadow') return;
            this.listenSpeakingScore = score;
            this.listenSpeakingScoring = false;
            // Fold the shadowing verdict into the reveal summary (first attempt
            // counts) — a 'retry' verdict reads as wrong, 'good'/'close' as pass.
            const speakingCard = this.visibleWords[this.index];
            if (score && speakingCard) this.recordSpeakingOutcome(speakingCard, score.verdict !== 'retry');
            this.rerenderActiveListen();
        } catch (error) {
            log.warn('Listen pitch scoring failed', error);
            if (generation !== this.listenSpeakingScoreGeneration || this.listenItem?.key !== itemKey) return;
            this.listenSpeakingScore = null;
            this.listenSpeakingScoring = false;
            this.rerenderActiveListen();
        }
    }

    private playListenRecording(): void {
        if (!this.listenRecordingUrl) return;
        try {
            this.listenRecordingAudio?.pause();
            const audio = new Audio(this.listenRecordingUrl);
            this.listenRecordingAudio = audio;
            void audio.play().catch(() => undefined);
        } catch {
            // Playback can throw in hardened contexts; ignore so the card stays usable.
        }
    }

    private clearListenRecording(): void {
        if (this.listenRecordingStopTimer) {
            clearTimeout(this.listenRecordingStopTimer);
            this.listenRecordingStopTimer = undefined;
        }
        if (this.listenRecordingAudio) {
            try { this.listenRecordingAudio.pause(); } catch { /* already stopped */ }
            this.listenRecordingAudio = undefined;
        }
        if (this.listenRecordingUrl) {
            URL.revokeObjectURL(this.listenRecordingUrl);
            this.listenRecordingUrl = undefined;
        }
        if (this.listenRecorder && this.listenRecorder.state !== 'inactive') {
            try { this.listenRecorder.stop(); } catch { /* already stopping */ }
        }
        this.listenRecorder = undefined;
    }

    private recordSpeakingOutcome(card: JPDBCard, passed: boolean): void {
        const state = this.ensureStepState(cardKey(card));
        if (state.speak) return;
        state.speak = passed ? 'correct' : 'wrong';
    }

    private clearListenSpeakingScore(): void {
        this.listenSpeakingScoreGeneration += 1;
        this.listenSpeakingScore = null;
        this.listenSpeakingScoring = false;
    }

    private shouldRenderCardAsKanji(card: JPDBCard): boolean {
        return usesJapaneseCharacterStudy()
            && (this.isLiveJpdbKanjiReviewCard(card)
                || isKanjiUnlockStudyCard(card));
    }

    private currentCardRendersAsKanji(): boolean {
        const card = this.visibleWords[this.index];
        return Boolean(card && this.shouldRenderCardAsKanji(card));
    }

    private isLiveJpdbKanjiReviewCard(card: JPDBCard): boolean {
        return card.reviewSource === 'jpdb-live' && (card.jpdbReviewId?.startsWith('kb,') ?? false);
    }

    private revealButtonLabel(): string {
        const current = this.visibleWords[this.index];
        if (current && !this.isFinalRevealStep(current)) return this.text('continueStudying');
        return this.text(this.state.revealAnswer ? 'hide' : 'reveal');
    }

    private newTabCountLabel(card: JPDBCard): string {
        if (!this.visibleWords.length) return '';
        if (this.reviewCountMode) return '';
        if (!this.reviewCountMode && !this.isReviewCard(card)) return '';
        return `${this.index + 1} / ${this.visibleWords.length}`;
    }

    private renderSessionProgress(slots: NewTabStudySlots, card: JPDBCard, root: HTMLElement): void {
        const baseLabel = this.newTabCountLabel(card);
        const reviewCards = this.reviewCountMode ? this.sessionProgressCards() : [];
        const snapshot = this.reviewCountMode ? this.sessionProgress.snapshot(reviewCards) : null;
        if (this.reviewCountMode) this.warmOfflineCache(reviewCards);
        const labels = [
            this.fallbackStudyNotice ? this.text('reviewFallbackNotice') : '',
            this.dueSummaryLabel(),
            baseLabel,
            snapshot ? formatNewTabSessionProgressLabel(snapshot, {
                completed: this.text('sessionDone'),
                left: this.text('sessionLeft'),
                due: this.text('statsDue'),
            }) : this.sessionProgress.snapshot([]).remainingSessionLabel,
            snapshot ? this.offlineCacheSegment() : '',
            snapshot ? this.syncStatusSegment() : '',
            this.dailyGoalLabel(),
        ].filter(Boolean);
        this.ensureSessionClock(root);
        if (!labels.length) {
            this.renderCount(slots.count, '', null);
            return;
        }
        this.renderCount(slots.count, labels.join(' · '), snapshot);
    }

    // "cached N/M" — how many of the session's review cards are warmed for offline
    // study (definition + meta + pitch) out of the warm target. Collapses to a
    // plain "cached N" once the whole target is warm. Shown next to the timer.
    private offlineCacheSegment(): string {
        const count = this.offlineReadyKeys.size;
        const total = this.offlineWarmTotal;
        if (count >= total) return count > 0 ? `${this.text('sessionCached')} ${count}` : '';
        return `${this.text('sessionCached')} ${count}/${total}`;
    }

    // Eventually-consistent sync status: how many grades are still queued to sync
    // back to the providers, or a synced confirmation once the queue drains.
    private syncStatusSegment(): string {
        if (this.syncPendingCount > 0) return `${this.text('syncPending')} ${this.syncPendingCount}`;
        return this.lastSyncedAt != null ? this.text('syncSynced') : '';
    }

    private markCardOfflineReady(card: JPDBCard): void {
        const before = this.offlineReadyKeys.size;
        this.offlineReadyKeys.add(this.offlineReadyKey(card));
        if (this.offlineReadyKeys.size !== before) this.refreshSessionProgressSoon();
    }

    private offlineReadyKey(card: JPDBCard): string {
        return card.sourceCardKey || cardKey(card);
    }

    private refreshSessionProgressSoon(): void {
        // The 1s session clock already re-renders the progress line, so we only
        // nudge a render when a clock is not active (e.g. just after enqueue).
        const root = this.sessionClockRoot;
        const card = this.visibleWords[this.index];
        if (root?.isConnected && card && this.isVocabularyStudyRoute()) {
            this.renderSessionProgress(this.studySlots(root), card, root);
        }
    }

    // Warm every due card's render data into the caches once per session card-set,
    // so an offline study run never has to reach the network. Runs a small
    // concurrent pool of idle-scheduled loads, races each card against a hard
    // timeout (one hung lookup previously stalled the whole chain at "cached 1"),
    // retries failures after a backoff, and re-persists the enriched cards (pitch
    // accents land on the card objects during warming) into the offline cache.
    private warmOfflineCache(cards: readonly JPDBCard[]): void {
        const load = this.dependencies.loadCardRenderData;
        if (!load || typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const signature = `${cards.length}:${cards.slice(0, 3).map(card => this.offlineReadyKey(card)).join(',')}`;
        if (signature === this.offlineWarmSignature) return;
        this.offlineWarmSignature = signature;
        const settings = this.dependencies.getSettings();
        const limit = Math.max(NEW_TAB_OFFLINE_WARM_LIMIT, settings.newTabOfflineEnabled ? settings.newTabOfflineLimit : 0);
        const queue = cards.slice(0, limit);
        this.offlineWarmTotal = queue.length;
        let nextIndex = 0;
        let settled = 0;
        let failures = 0;
        const finishCard = (): void => {
            settled += 1;
            if (settled < queue.length) return;
            this.writeOfflineCacheAfterLoad();
            if (failures > 0) this.scheduleOfflineWarmRetry(signature);
        };
        const warmNext = async (): Promise<void> => {
            const index = nextIndex++;
            if (index >= queue.length) return;
            const card = queue[index];
            if (this.offlineReadyKeys.has(this.offlineReadyKey(card))) {
                this.markCardOfflineReady(card);
            } else if (typeof navigator === 'undefined' || navigator.onLine !== false) {
                const warmed = await Promise.race([
                    load(card, { includeBunproDefinition: false }).then(() => true, () => false),
                    new Promise<boolean>(resolve => setTimeout(() => resolve(false), NEW_TAB_OFFLINE_WARM_CARD_TIMEOUT_MS)),
                ]);
                if (warmed) this.markCardOfflineReady(card);
                else failures += 1;
            } else {
                failures += 1;
            }
            finishCard();
            scheduleIdle(() => void warmNext());
        };
        const pool = Math.min(NEW_TAB_OFFLINE_WARM_CONCURRENCY, queue.length);
        for (let worker = 0; worker < pool; worker += 1) scheduleIdle(() => void warmNext());
    }

    // Failed warms (flaky network, provider hiccup) retry on a later render tick
    // instead of being lost for the rest of the session.
    private scheduleOfflineWarmRetry(signature: string): void {
        if (this.offlineWarmRetryTimer !== undefined || typeof window === 'undefined') return;
        this.offlineWarmRetryTimer = window.setTimeout(() => {
            this.offlineWarmRetryTimer = undefined;
            if (this.offlineWarmSignature === signature) this.offlineWarmSignature = '';
        }, NEW_TAB_OFFLINE_WARM_RETRY_MS);
    }

    private dailyGoalLabel(): string {
        const goal = this.dependencies.getSettings().newTabDailyGoalMinutes;
        if (!(goal > 0)) return '';
        return formatNewTabDailyGoalLabel(newTabDailyStudyTimeMs(newTabLocalDateKey()), goal, {
            unit: this.text('dailyGoalUnit'),
            reached: this.text('dailyGoalReached'),
        });
    }

    private ensureSessionClock(root: HTMLElement): void {
        // Async provider work may settle after its Study surface has unmounted.
        // A destroyed controller must never subscribe to its disposed owned clock.
        if (this.destroyed) return;
        if (this.sessionClockRoot !== root) {
            this.stopSessionClock();
            this.sessionClockRoot = root;
            this.lastDailyGoalElapsedMs = this.sessionClock.snapshot().elapsedMs;
            this.sessionClockSubscription = this.sessionClock.subscribe(snapshot => this.tickSessionClock(snapshot));
        }
        if (this.options.showSessionClockControl === false || this.sessionClockControl) return;
        const host = root.querySelector<HTMLElement>('[data-newtab-session-clock-host]');
        if (!host) return;
        this.sessionClockControl = mountStudySessionClockControl(host, this.sessionClock, {
            labels: {
                pause: this.text('sessionPause'),
                resume: this.text('sessionResume'),
            },
            className: 'jpdb-reader-newtab-session-clock',
        });
    }

    private stopSessionClock(): void {
        this.sessionClockSubscription?.dispose();
        this.sessionClockSubscription = undefined;
        this.sessionClockControl?.dispose();
        this.sessionClockControl = undefined;
        this.sessionClockRoot = null;
    }

    private tickSessionClock(snapshot: StudySessionClockSnapshot): void {
        const studiedMs = Math.max(0, snapshot.elapsedMs - this.lastDailyGoalElapsedMs);
        this.lastDailyGoalElapsedMs = snapshot.elapsedMs;
        if (studiedMs > 0) addNewTabDailyStudyTimeMs(studiedMs, newTabLocalDateKey());
        const root = this.sessionClockRoot;
        const card = this.visibleWords[this.index];
        if (!root?.isConnected) {
            this.stopSessionClock();
            return;
        }
        if (!card || !this.isVocabularyStudyRoute()) return;
        this.renderSessionProgress(this.studySlots(root), card, root);
    }

    // JPDB Learn parity: the vocabulary/kanji split of the due pile plus the
    // count of unseen items — only shown when it adds information beyond the
    // session snapshot's plain "Due N".
    private dueSummaryLabel(): string {
        if (!this.reviewCountMode) return '';
        const summary = newTabDueSummary(this.allWords);
        const fresh = summary.newWords + summary.newKanji;
        const parts: string[] = [];
        if (summary.dueKanji && summary.dueWords) {
            parts.push(`${summary.dueWords} ${this.text('statsWordsRow').toLowerCase()} · ${summary.dueKanji} ${this.text('kanji').toLowerCase()}`);
        }
        if (fresh) parts.push(`${fresh} ${this.text('stateNew').toLowerCase()}`);
        // UT-23: kanji reviews only exist on jpdb.io itself (no API access).
        // When a jpdb.io learn/review tab is bridged, surface their count so
        // the page never silently under-reports against jpdb Learn.
        const bridgedKanjiDue = this.liveJpdbStatus?.learnSummary?.dueKanji ?? 0;
        if (bridgedKanjiDue > 0) {
            parts.push(this.formatNewTabText('jpdbKanjiDueChip', { count: String(bridgedKanjiDue) }));
        }
        return parts.join(' · ');
    }

    private sessionProgressCards(): JPDBCard[] {
        return this.visibleWords.filter(card => !this.isReviewHistoryCard(card));
    }

    private newTabStatusSourceLabel(card: JPDBCard): string {
        if (this.shouldShowJitenOnlyApiFallbackSource(card)) return 'Jiten';
        const labels = this.reviewTargetSourceLabels(card);
        return labels.length
            ? labels.join(' + ')
            : newTabCardSourceLabel(card, this.language());
    }

    private newTabSyncStatusLabel(card: JPDBCard): string {
        if (!this.shouldShowOfflineSyncStatus(card)) return '';
        return this.text('offlineCache');
    }

    private shouldShowOfflineSyncStatus(card: JPDBCard): boolean {
        if (this.isOfflineSourceLabel(this.sourceLabel)) return true;
        const settings = this.dependencies.getSettings();
        return settings.newTabOfflineEnabled
            && this.canReviewCard(card)
            && this.offlineGradeTargets(card).length > 0
            && typeof navigator !== 'undefined'
            && navigator.onLine === false;
    }

    private isExplicitReviewSourceFallbackCard(card: JPDBCard): boolean {
        if (this.dependencies.getSettings().newTabSource === 'auto') return false;
        if (this.state.source !== 'jpdb' && this.state.source !== 'anki') return false;
        return this.cardReviewSource(card) === 'dictionary'
            && !this.cardHasToggleSource(card, this.state.source);
    }

    private reviewTargetSourceLabels(card: JPDBCard): string[] {
        const summary = this.reviewSourceSummary(card);
        const labels: string[] = [];
        const add = (label: string): void => {
            if (!labels.includes(label)) labels.push(label);
        };
        if (summary.hasJiten) add('Jiten');
        if (summary.hasJpdb) add('JPDB');
        if (summary.hasBunpro) add('Bunpro');
        if (summary.hasYomuLocal) add(ACADEMY_SRS_LABEL);
        if (summary.hasAnki) add(summary.hasJpdb || summary.hasJiten || summary.hasBunpro || summary.hasYomuLocal ? 'Anki' : this.ankiReviewSourceLabel(card));
        return labels;
    }

    private ankiReviewSourceLabel(card: JPDBCard): string {
        const kind = ankiCardKindLabel(card, this.language());
        const deck = this.ankiReviewSourceDeckLabel(card);
        return ['Anki', deck, kind].filter(Boolean).join(' · ');
    }

    private ankiReviewSourceDeckLabel(card: JPDBCard): string {
        const primaryCardId = Number(card.ankiCardId ?? card.rid);
        const renderedDeck = (card.ankiRenderedCards ?? [])
            .find(rendered => rendered.cardId === primaryCardId)?.deckName
            || card.ankiRenderedCards?.[0]?.deckName
            || '';
        return renderedDeck || card.ankiDeckNames?.join(', ') || '';
    }

    private shouldShowJitenOnlyApiFallbackSource(card: JPDBCard): boolean {
        const source = this.cardReviewSource(card);
        return (source === 'dictionary' || (source === 'jpdb' && !isJitenSrsCard(card)))
            && this.sourceLabel.startsWith('Jiten')
            && !this.sourceLabel.includes(' + ')
            && this.hasJitenOnlyApiCredentials();
    }

    private renderStatus(statusSlot: HTMLElement | null, card: JPDBCard): void {
        if (!statusSlot) return;
        // The select is the ONE switcher — a real dropdown listing every
        // source. The pill is pure status; it reflects the card actually
        // shown, while the select reflects the CHOSEN source, so an empty
        // queue falling back to another provider's cards no longer reads as
        // two identical modes.
        const sources = this.sourceToggleSources(card);
        const selectorShown = this.renderSourceSelectorOptions(statusSlot, sources, this.selectedSelectorSource(card, sources));
        const label = this.statusPillLabel(card, selectorShown);
        replaceChildrenWith(statusSlot, ...(label ? [
            ...this.renderNewTabStatusLights(card),
            document.createTextNode(label),
        ] : []));
        delete statusSlot.dataset.newtabAction;
        delete statusSlot.dataset.sourceToggleTarget;
        statusSlot.removeAttribute('title');
        statusSlot.removeAttribute('aria-label');
        if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = true;
    }

    // With the dropdown visible, repeating the single source name in the
    // pill would read as two identical controls — keep only count/sync
    // there. A multi-target label ("Jiten + JPDB") carries grading info the
    // dropdown cannot show, so it stays.
    private statusPillLabel(card: JPDBCard, selectorShown: boolean): string {
        const sourceText = this.newTabStatusSourceLabel(card);
        const showSource = !selectorShown || sourceText.includes(' + ');
        return [this.newTabCountLabel(card), showSource ? sourceText : '', this.newTabSyncStatusLabel(card)]
            .filter(Boolean)
            .join(' · ');
    }

    private selectedSelectorSource(card: JPDBCard, sources: ConcreteNewTabWordSource[]): ConcreteNewTabWordSource {
        const selected = this.state.source;
        if (selected !== 'auto' && sources.includes(selected)) return selected;
        return this.sourceToggleCurrentSource(card, sources);
    }

    private renderSourceSelectorOptions(statusSlot: HTMLElement | null, sources: ConcreteNewTabWordSource[], current: ConcreteNewTabWordSource): boolean {
        const select = this.sourceSelectForStatus(statusSlot);
        if (!select) return false;
        if (sources.length < 2) {
            this.hideSourceSelector(select);
            return false;
        }
        replaceChildrenWith(select, ...sources.map(source => {
            const option = el('option', { value: source }, this.sourceToggleLabel(source));
            if (source === current) option.selected = true;
            return option;
        }));
        select.value = current;
        select.dataset.source = current;
        select.hidden = false;
        select.disabled = false;
        select.title = this.text('switchReviewSource');
        select.setAttribute('aria-label', this.text('switchReviewSource'));
        return true;
    }

    private sourceSelectForStatus(statusSlot: HTMLElement | null): HTMLSelectElement | null {
        return statusSlot?.parentElement?.querySelector<HTMLSelectElement>('[data-newtab-source-select]')
            ?? this.currentRoot()?.querySelector<HTMLSelectElement>('[data-newtab-source-select]')
            ?? null;
    }

    private clearSourceSelector(statusSlot: HTMLElement | null): void {
        const select = this.sourceSelectForStatus(statusSlot);
        if (select) this.hideSourceSelector(select);
    }

    private hideSourceSelector(select: HTMLSelectElement): void {
        select.hidden = true;
        select.disabled = true;
        delete select.dataset.source;
        select.replaceChildren();
        select.removeAttribute('title');
        select.removeAttribute('aria-label');
    }

    private renderNewTabStatusLights(card: JPDBCard): HTMLElement[] {
        const sources = this.reviewTargetSources(card);
        if (!sources.length) {
            const source = this.statusLightSourceForCard(card);
            if (source) sources.push(source);
        }
        return sources.map(source => el('span', {
            class: 'jpdb-reader-newtab-status-light',
            dataset: { source },
            'aria-hidden': 'true',
        }));
    }

    // fallow-ignore-next-line complexity
    private statusLightSourceForCard(card: JPDBCard): 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki' | null {
        if ((this.cardReviewSource(card) === 'dictionary' && this.sourceLabel.startsWith('Jiten') && !this.sourceLabel.includes(' + '))
            || this.shouldShowJitenOnlyApiFallbackSource(card)
            || isJitenSrsCard(card)) {
            return 'jiten';
        }
        const source = this.cardReviewSource(card);
        return source === 'jpdb' || source === 'anki' || source === 'bunpro' || source === 'wanikani' || source === 'yomu-local' ? source : null;
    }

    private reviewTargetSources(card: JPDBCard): Array<'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki'> {
        const summary = this.reviewSourceSummary(card);
        const sources: Array<'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki'> = [];
        const add = (source: 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local' | 'anki'): void => {
            if (!sources.includes(source)) sources.push(source);
        };
        if (summary.hasJiten) add('jiten');
        if (summary.hasJpdb) add('jpdb');
        if (summary.hasBunpro) add('bunpro');
        if (summary.hasWanikani) add('wanikani');
        if (summary.hasYomuLocal) add('yomu-local');
        if (summary.hasAnki) add('anki');
        return sources;
    }

    private renderPlainStatus(statusSlot: HTMLElement | null, message: string): void {
        if (!statusSlot) return;
        this.clearSourceSelector(statusSlot);
        statusSlot.textContent = message;
        delete statusSlot.dataset.newtabAction;
        delete statusSlot.dataset.sourceToggleTarget;
        statusSlot.removeAttribute('title');
        statusSlot.removeAttribute('aria-label');
        if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = true;
    }

    private renderEmptySourceStatus(statusSlot: HTMLElement | null): void {
        if (!statusSlot) return;
        if (this.dependencies.getSettings().newTabSource === 'auto') {
            this.renderPlainStatus(statusSlot, '');
            return;
        }
        const source = this.state.source === 'jpdb'
            || this.state.source === 'bunpro'
            || this.state.source === 'wanikani'
            || this.state.source === 'yomu-local'
            || this.state.source === 'anki'
            ? this.state.source
            : null;
        if (!source) {
            this.renderPlainStatus(statusSlot, '');
            return;
        }
        // An empty queue must not hide provider switching: finishing your
        // Bunpro reviews still leaves the dropdown to jump to JPDB/Jiten,
        // Yomu or Anki (renderPlainStatus above clears it for other states).
        this.renderSourceSelectorOptions(statusSlot, this.emptyStateSelectorSources(source), source);
        const lightSource = source === 'jpdb' && this.sourceLabel.startsWith('Jiten') && !this.sourceLabel.includes(' + ')
            ? 'jiten'
            : source;
        replaceChildrenWith(statusSlot, ...[
            el('span', {
                class: 'jpdb-reader-newtab-status-light',
                dataset: { source: lightSource },
                'aria-hidden': 'true',
            }),
            document.createTextNode(this.sourceToggleLabel(source)),
        ].filter((node): node is HTMLElement | Text => Boolean(node)));
        delete statusSlot.dataset.newtabAction;
        delete statusSlot.dataset.sourceToggleTarget;
        statusSlot.removeAttribute('title');
        statusSlot.removeAttribute('aria-label');
        if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = true;
    }

    private emptyStateSelectorSources(current: ConcreteNewTabWordSource): ConcreteNewTabWordSource[] {
        const sources: ConcreteNewTabWordSource[] = [];
        if (this.canUseYomuLocalSource()) sources.push('yomu-local');
        if (this.hasApiReviewSourceCredential()) sources.push('jpdb');
        if (this.canUseBunproSource()) sources.push('bunpro');
        if (this.canUseWanikaniSource()) sources.push('wanikani');
        if (this.canOfferAnkiSource()) sources.push('anki');
        if (!sources.includes(current)) sources.push(current);
        return this.visibleSourceSelectorSources(sources);
    }

    private sourceToggleSources(card: JPDBCard): ConcreteNewTabWordSource[] {
        const context = this.sourceToggleContext(card);
        const sources = uniqueConcreteSources([
            this.yomuLocalToggleSource(context),
            this.jpdbToggleSource(context),
            this.bunproToggleSource(context),
            this.wanikaniToggleSource(context),
            this.shouldSuppressJitenOnlyJpdbCardToggle(card) ? null : this.ankiToggleSource(context),
        ]);
        if (this.shouldIncludeAcademyFallbackSource(context, sources)) sources.unshift('yomu-local');
        return this.visibleSourceSelectorSources(sources);
    }

    private visibleSourceSelectorSources(sources: ConcreteNewTabWordSource[]): ConcreteNewTabWordSource[] {
        return uniqueConcreteSources(sources
            .map(source => source === 'dictionary' ? 'yomu-local' : source)
            .filter(source => source !== 'jpdb' || this.hasApiReviewSourceCredential()));
    }

    private shouldSuppressJitenOnlyJpdbCardToggle(card: JPDBCard): boolean {
        return this.hasJitenOnlyApiCredentials()
            && !this.isJitenOnlySourceLabel()
            && this.cardReviewSource(card) === 'jpdb'
            && !isJitenSrsCard(card)
            && !this.reviewTargetsForCard(card).includes('anki');
    }

    private sourceToggleContext(card: JPDBCard): SourceToggleContext {
        const current = this.cardReviewSource(card);
        const summary = this.reviewSourceSummary(card);
        return {
            current,
            selected: this.state.source,
            configured: this.dependencies.getSettings().newTabSource,
            hasJpdb: summary.hasJpdb,
            hasJiten: summary.hasJiten,
            hasBunpro: summary.hasBunpro,
            hasWanikani: summary.hasWanikani,
            hasYomuLocal: summary.hasYomuLocal,
            hasAnki: summary.hasAnki,
            canUseJpdb: this.canUseJpdbSource(),
            canUseBunpro: this.canUseBunproSource(),
            canUseWanikani: this.canUseWanikaniSource(),
            canUseYomuLocal: this.canUseYomuLocalSource(),
            canUseAnki: this.canUseAnkiSource(),
            canOfferAnki: this.canOfferAnkiSource(),
            ankiUnavailable: this.cachedSourceUnavailable('anki'),
        };
    }

    private yomuLocalToggleSource(context: SourceToggleContext): ConcreteNewTabWordSource | null {
        return this.shouldIncludeYomuLocalToggleSource(context) ? 'yomu-local' : null;
    }

    private shouldIncludeYomuLocalToggleSource(context: SourceToggleContext): boolean {
        return context.hasYomuLocal || context.canUseYomuLocal || context.current === 'yomu-local' || context.selected === 'yomu-local';
    }

    private jpdbToggleSource(context: SourceToggleContext): ConcreteNewTabWordSource | null {
        return this.shouldIncludeJpdbToggleSource(context) ? 'jpdb' : null;
    }

    private shouldIncludeJpdbToggleSource(context: SourceToggleContext): boolean {
        return this.hasApiReviewSourceCredential()
            && (context.hasJpdb || context.hasJiten || context.canUseJpdb || context.current === 'jpdb' || context.selected === 'jpdb');
    }

    private bunproToggleSource(context: SourceToggleContext): ConcreteNewTabWordSource | null {
        return this.shouldIncludeBunproToggleSource(context) ? 'bunpro' : null;
    }

    private shouldIncludeBunproToggleSource(context: SourceToggleContext): boolean {
        return context.hasBunpro || context.canUseBunpro || context.current === 'bunpro' || context.selected === 'bunpro';
    }

    private wanikaniToggleSource(context: SourceToggleContext): ConcreteNewTabWordSource | null {
        return context.hasWanikani || context.canUseWanikani || context.current === 'wanikani' || context.selected === 'wanikani'
            ? 'wanikani'
            : null;
    }

    private ankiToggleSource(context: SourceToggleContext): ConcreteNewTabWordSource | null {
        return this.shouldIncludeAnkiToggleSource(context) ? 'anki' : null;
    }

    private shouldIncludeAnkiToggleSource(context: SourceToggleContext): boolean {
        return !this.shouldHideUnavailableAutoAnkiToggleSource(context)
            && (this.hasAvailableAnkiToggleSource(context)
                || (context.canOfferAnki && this.canToggleFromJpdbSource(context)));
    }

    private shouldHideUnavailableAutoAnkiToggleSource(context: SourceToggleContext): boolean {
        return context.current === 'dictionary'
            && !context.hasAnki
            && (context.configured === 'auto' || context.ankiUnavailable);
    }

    private hasAvailableAnkiToggleSource(context: SourceToggleContext): boolean {
        return context.hasAnki
            || context.current === 'anki'
            || (context.selected === 'anki' && context.canOfferAnki)
            || context.canUseAnki;
    }

    private canToggleFromJpdbSource(context: SourceToggleContext): boolean {
        return context.current === 'jpdb' || context.selected === 'jpdb';
    }

    private shouldIncludeAcademyFallbackSource(context: SourceToggleContext, sources: ConcreteNewTabWordSource[]): boolean {
        return !sources.includes('yomu-local')
            && (context.current === 'dictionary'
                || context.selected === 'dictionary'
                || context.configured === 'dictionary'
                || sources.length > 0);
    }

    private sourceToggleCurrentSource(card: JPDBCard, sources: ConcreteNewTabWordSource[]): ConcreteNewTabWordSource {
        return this.sourceToggleCandidate(card, sources, this.sourceLabelReviewSource())
            ?? this.configuredSourceToggleCandidate(card, sources)
            ?? this.reviewSourceToggleCandidate(card, sources)
            ?? sources[0]
            ?? 'dictionary';
    }

    private sourceToggleCandidate(card: JPDBCard, sources: ConcreteNewTabWordSource[], source: ConcreteNewTabWordSource | null): ConcreteNewTabWordSource | null {
        return source && sources.includes(source) && this.cardHasToggleSource(card, source) ? source : null;
    }

    private configuredSourceToggleCandidate(card: JPDBCard, sources: ConcreteNewTabWordSource[]): ConcreteNewTabWordSource | null {
        const source = this.state.source;
        if (source === 'auto') return null;
        if (this.isExplicitReviewSourceFallbackCard(card) && sources.includes(source)) return source;
        return this.sourceLabel.includes(' + ')
            ? this.sourceToggleCandidate(card, sources, source)
            : null;
    }

    private reviewSourceToggleCandidate(card: JPDBCard, sources: ConcreteNewTabWordSource[]): ConcreteNewTabWordSource | null {
        const current = this.cardReviewSource(card);
        return sources.includes(current) ? current : null;
    }

    private sourceLabelReviewSource(): ConcreteNewTabWordSource | null {
        if (this.sourceLabel.includes(' + ')) return null;
        if (this.sourceLabel.startsWith(NEW_TAB_SOURCE_LABELS.jpdb)) return 'jpdb';
        if (this.sourceLabel.startsWith('Jiten')) return 'jpdb';
        if (this.sourceLabel.startsWith(NEW_TAB_SOURCE_LABELS.bunpro)) return 'bunpro';
        if (this.sourceLabel.startsWith(NEW_TAB_SOURCE_LABELS.wanikani)) return 'wanikani';
        if (this.sourceLabel.startsWith(NEW_TAB_SOURCE_LABELS['yomu-local'])) return 'yomu-local';
        if (this.sourceLabel.startsWith(NEW_TAB_SOURCE_LABELS.anki)) return 'anki';
        return this.sourceLabel === this.text('dictionary') ? 'dictionary' : null;
    }

    private isJitenOnlySourceLabel(): boolean {
        return this.sourceLabel.startsWith('Jiten') && !this.sourceLabel.includes(' + ');
    }

    private cardHasToggleSource(card: JPDBCard, source: ConcreteNewTabWordSource): boolean {
        if (source === 'dictionary') return this.cardReviewSource(card) === 'dictionary';
        return this.reviewTargetSources(card).includes(source) || this.cardReviewSource(card) === source;
    }

    private canUseJpdbSource(): boolean {
        return this.hasAvailableJpdbReviewSource(this.dependencies.getSettings());
    }

    private hasApiReviewSourceCredential(settings = this.dependencies.getSettings()): boolean {
        return hasJpdbApiCredential(settings) || hasJitenApiCredential(settings);
    }

    private canUseBunproSource(): boolean {
        const adapter = this.dependencies.srsAdapters?.bunpro;
        return Boolean(adapter?.hasCredential());
    }

    private canUseWanikaniSource(): boolean {
        const settings = this.dependencies.getSettings();
        return settings.wanikaniReviewEnabled
            && hasWanikaniApiCredential(settings)
            && Boolean(this.dependencies.srsAdapters?.wanikani?.hasCredential());
    }

    private canUseYomuLocalSource(): boolean {
        return (this.options.surface === 'academy' || this.dependencies.getSettings().yomuLocalSrsEnabled)
            && Boolean(this.dependencies.srsAdapters?.['yomu-local']);
    }

    private hasAvailableJpdbReviewSource(settings: ReaderSettings): boolean {
        if (hasJpdbApiCredential(settings)) return true;
        if (hasJitenApiCredential(settings)) return true;
        if (settings.newTabJpdbReviewMode === 'api-vocabulary') return false;
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus?.();
        return settings.jpdbMiningEnabled && Boolean(status?.card);
    }

    private hasJitenOnlyApiCredentials(settings = this.dependencies.getSettings()): boolean {
        // UT-61: "Jiten only" means exactly that — a coexisting JPDB key
        // counts as a JPDB setup.
        return Boolean(hasJitenApiCredential(settings) && !hasJpdbApiCredential(settings));
    }

    private canUseAnkiSource(settings = this.dependencies.getSettings()): boolean {
        return settings.ankiEnabled
            && settings.newTabAnkiEnabled
            && typeof this.dependencies.anki.listNewTabCards === 'function';
    }

    private canOfferAnkiSource(settings = this.dependencies.getSettings()): boolean {
        return settings.ankiEnabled && settings.newTabAnkiEnabled;
    }

    // fallow-ignore-next-line complexity
    private cardReviewSource(card: JPDBCard): ConcreteNewTabWordSource {
        // fallow-ignore-next-line code-duplication
        if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
        if (card.source === 'bunpro' || card.reviewSource === 'bunpro-api') return 'bunpro';
        if (card.source === 'wanikani' || card.reviewSource === 'wanikani-api') return 'wanikani';
        if (card.source === 'yomu-local' || card.reviewSource === 'yomu-local') return 'yomu-local';
        if (card.source === 'jiten' || card.reviewSource === 'jiten-api') return 'jpdb';
        if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live') return 'jpdb';
        return 'dictionary';
    }

    private sourceToggleLabel(source: ConcreteNewTabWordSource): string {
        if (source === 'jpdb') return this.jpdbSourceToggleLabel();
        if (source === 'bunpro') return 'Bunpro';
        if (source === 'wanikani') return 'WaniKani';
        if (source === 'yomu-local') return ACADEMY_SRS_LABEL;
        if (source === 'anki') return 'Anki';
        return this.text('dictionary');
    }

    private jpdbSourceToggleLabel(): string {
        if (this.sourceLabel.includes('Jiten + JPDB')) return 'Jiten + JPDB';
        if (this.sourceLabel.startsWith('Jiten')) return 'Jiten';
        return this.apiReviewSourceLabel();
    }

    private apiReviewSourceLabel(settings = this.dependencies.getSettings()): string {
        return hasJpdbApiCredential(settings) || hasJitenApiCredential(settings)
            ? combinedApiCredentialLabel(settings)
            : 'JPDB';
    }

    private renderCount(countSlot: HTMLElement | null, label: string, progress: NewTabSessionProgressSnapshot | null = null): void {
        if (!countSlot) return;
        countSlot.textContent = label;
        this.appendConnectSrsCta(countSlot);
        countSlot.hidden = !countSlot.textContent && !countSlot.firstElementChild;
        countSlot.style.setProperty('--jpdb-reader-newtab-session-progress', progress ? String(newTabSessionProgressRatio(progress)) : '0');
        this.syncSessionProgressDataset(countSlot, progress);
    }

    // UT-41: a first-run user lands on practice words with no explanation —
    // when no SRS source is configured, the fallback notice carries a
    // "Connect" button that opens settings.
    private appendConnectSrsCta(countSlot: HTMLElement): void {
        // Practice pool with nothing configured = the first-run state; the
        // fallback notice itself only renders for users who DO have sources.
        if (this.reviewCountMode || !this.isVocabularyStudyRoute()) return;
        const settings = this.dependencies.getSettings();
        if (settings.yomuLocalSrsEnabled) return;
        if (hasJpdbApiCredential(settings) || hasJitenApiCredential(settings) || settings.ankiEnabled || settings.newTabAnkiEnabled) return;
        countSlot.append(el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-connect-cta',
            dataset: { newtabAction: newTabAction('settings') },
        }, this.text('connectSrsCta')));
    }

    private syncSessionProgressDataset(countSlot: HTMLElement, progress: NewTabSessionProgressSnapshot | null): void {
        clearSessionProgressDataset(countSlot.dataset);
        if (!progress) return;
        countSlot.dataset.sessionCompletedReviews = String(progress.completedReviews);
        countSlot.dataset.sessionElapsedMs = String(progress.elapsedMs);
        countSlot.dataset.sessionRemaining = progress.remainingSessionLabel;
        countSlot.dataset.sessionRemainingMs = String(progress.remainingSessionMs);
        countSlot.dataset.sessionClockState = progress.sessionState;
        countSlot.dataset.sessionComplete = String(progress.sessionComplete);
        countSlot.dataset.sessionRemainingCards = String(progress.remainingCards);
        countSlot.dataset.sessionRemainingDueCards = String(progress.remainingDueCards);
        for (const source of progress.sources) {
            const name = capitalizedSessionSource(source.source);
            countSlot.dataset[`session${name}Available`] = String(source.available);
            countSlot.dataset[`session${name}RemainingCards`] = String(source.remainingCards);
            countSlot.dataset[`session${name}RemainingDueCards`] = String(source.remainingDueCards);
        }
    }

    private studySlots(root: HTMLElement): NewTabStudySlots {
        return {
            steps: root.querySelector<HTMLElement>('[data-newtab-study-steps]'),
            tour: root.querySelector<HTMLElement>('[data-newtab-study-tour]'),
            progress: null,
            timer: null,
            prompt: root.querySelector<HTMLElement>('[data-newtab-prompt]'),
            answer: root.querySelector<HTMLElement>('[data-newtab-reading]'),
            meaning: root.querySelector<HTMLElement>('[data-newtab-meaning]'),
            count: root.querySelector<HTMLElement>('[data-newtab-count]'),
            status: root.querySelector<HTMLElement>('[data-newtab-status]'),
            reveal: root.querySelector<HTMLButtonElement>(newTabActionSelector('reveal')),
            controls: root.querySelector<HTMLElement>('[data-newtab-controls]'),
        };
    }

    private renderKanjiPrompt(slots: NewTabStudySlots, card: JPDBCard, activeKanji?: string): void {
        const kanji = activeKanji ?? this.activeStudyKanji(card) ?? kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '字';
        const keywords = this.kanjiPromptKeywords(card, kanji);
        this.renderKanjiPromptQuestion(slots.prompt, kanji, keywords, card);
        this.renderKanjiPromptAnswer(slots, card, kanji);
        if (slots.meaning && !this.state.revealAnswer) slots.meaning.replaceChildren();
        void this.enrichKanjiCard(slots, card, kanji);
    }

    private activeStudyKanji(card: JPDBCard): string | null {
        const session = this.studySessionForCard(card, this.shouldRenderCardAsKanji(card));
        return session.activeStep.kind === 'kanji-doodle' ? session.activeStep.kanji ?? null : null;
    }

    private renderKanjiPromptQuestion(prompt: HTMLElement | null, kanji: string, keywords: KanjiPromptKeyword[], card?: JPDBCard): void {
        if (!prompt) return;
        prompt.lang = this.state.revealAnswer ? 'ja' : 'en';
        prompt.dataset.newtabExpression = 'true';
        prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.remove('jpdb-reader-newtab-study-anki-card');
        prompt.classList.remove('jpdb-reader-newtab-prompt-anki-card', 'jpdb-reader-newtab-recall-prompt');
        prompt.classList.add('jpdb-reader-newtab-kanji-prompt');
        if (this.state.revealAnswer) replaceChildrenWith(prompt, this.kanjiPopoverButton(kanji));
        // Initial render: a detail lookup is about to run (enrichKanjiCard), so
        // show the loading state rather than a fallback that could leak the word
        // meaning before the real keyword resolves. The graceful word-blank
        // fallback is applied once enrichment completes empty.
        else replaceChildrenWith(prompt, this.renderKanjiPromptKeywords(keywords, card, kanji, true));
    }

    private kanjiWordBlank(spelling: string, kanji: string): string {
        if (!spelling.includes(kanji) || Array.from(spelling).length < 2) return '';
        // Blank EVERY kanji, not just the active one: 図鑑 on the 図 step must
        // read "＿＿", not "＿鑑" — the visible 鑑 is the answer to the next
        // draw step (owner: "gives answer to next question").
        return Array.from(spelling).map(character => isKanjiCharacter(character) ? '＿' : character).join('');
    }

    private kanjiPopoverButton(kanji: string): HTMLElement {
        return el('button', {
            class: 'jpdb-reader-newtab-kanji-popover-word',
            type: 'button',
            dataset: { action: 'kanji', kanji },
            title: `${this.text('showKanji')}: ${kanji}`,
        }, kanji);
    }

    private renderKanjiPromptKeywords(keywords: KanjiPromptKeyword[], card?: JPDBCard, kanji?: string, pending = false): HTMLElement | string {
        // The draw prompt fronts the blanked-kanji cloze ("＿み物") plus per-kanji
        // keywords — NOT the word meaning: a later step of the same session quizzes
        // the meaning, so printing it here answered that step in advance (owner:
        // "showing 'time ＿＿' gives away the answer for the next part"). The
        // meaning is still reachable as the first Hint tier.
        const context = card ? this.kanjiDrawWordContext(card, kanji ?? '') : null;
        const rows: Array<HTMLElement | null> = [];
        if (context) rows.push(context);
        const supplementary = keywords;
        if (supplementary.length) {
            rows.push(...supplementary.map(keyword => el('div', { class: 'jpdb-reader-newtab-kanji-front-keyword' },
                el('small', {}, keyword.source),
                el('span', {}, keyword.text),
            )));
        } else if (!context) {
            // No word context (kana-standalone kanji card) and no keyword: while a
            // detail lookup is in flight show the loading state, else the bare draw
            // instruction so the step never fronts an error.
            return pending
                ? el('span', { class: 'jpdb-reader-newtab-kanji-front-empty' }, this.text('loadingKanjiDetails'))
                : el('span', { class: 'jpdb-reader-newtab-kanji-front-empty' }, this.text('drawKanji'));
        }
        return el('div', { class: 'jpdb-reader-newtab-kanji-front-keywords' },
            ...rows,
            this.renderStudyHintPanel(card, 'kanji-doodle', kanji ?? '', keywords),
        );
    }

    // The word-context lead line for a kanji-draw step: the word with every kanji
    // blanked ("＿み物"). Only rendered for MULTI-kanji / multi-character words
    // where the blank shape adds signal — a single-kanji card has no blank to
    // fill. The word MEANING is deliberately absent (it is the answer to the
    // session's word/recall step); learners who need it tap the Hint.
    private kanjiDrawWordContext(card: JPDBCard, kanji: string): HTMLElement | null {
        const cloze = this.kanjiWordBlank(card.spelling, kanji);
        if (!cloze) return null;
        return el('div', { class: 'jpdb-reader-newtab-kanji-front-keyword jpdb-reader-newtab-kanji-front-context' },
            el('span', { class: 'jpdb-reader-newtab-kanji-front-cloze', lang: 'ja' }, cloze),
        );
    }

    // ----- Progressive hints (kanji-draw + recall): a small "Hint" affordance on
    // the steps that can be genuinely ambiguous. Each tap reveals one more tier;
    // no tier prints the full answer before the reveal. Usage folds into the
    // reveal summary ("used N hints").

    private studyHintStateKey(card: JPDBCard, step: StudyHintStep, kanji: string): string {
        return `${cardKey(card)}|${step}${kanji ? `:${kanji}` : ''}`;
    }

    private studyHintsForStep(card: JPDBCard, step: StudyHintStep, kanji: string, keywords: KanjiPromptKeyword[]): StudyHint[] {
        if (step === 'recall-cloze') {
            return recallHints(newTabCardReading(card) || card.reading || card.spelling);
        }
        const keyword = this.keywordCache.get(kanji) ?? card.kanjiKeyword ?? keywords.find(entry => entry.text)?.text ?? '';
        return kanjiDrawHints(card, {
            // The draw prompt no longer fronts the word meaning (it would answer
            // the session's word/recall step), so the meaning is the first hint
            // tier, then the per-kanji keyword, then the reading's first kana as
            // the gentlest sound cue — still short of the full reading.
            meaningAlreadyShown: false,
            kanjiKeyword: keyword,
            firstKanaHint: this.kanjiFirstKanaHint(card),
        });
    }

    // The gentlest sound cue for a kanji-draw step: the first kana of the whole
    // word (e.g. "の" for 飲み物). One kana is far short of the reading and only
    // offered as the last hint tier after the keyword.
    private kanjiFirstKanaHint(card: JPDBCard): string {
        if (Array.from(card.spelling).length < 2) return '';
        const reading = (newTabCardReading(card) || card.reading || '').trim();
        const first = Array.from(reading)[0];
        return first ?? '';
    }

    private renderStudyHintPanel(card: JPDBCard | undefined, step: StudyHintStep, kanji: string, keywords: KanjiPromptKeyword[]): HTMLElement | null {
        if (!card || this.state.revealAnswer) return null;
        const hints = this.studyHintsForStep(card, step, kanji, keywords);
        if (!hints.length) return null;
        const depth = Math.min(this.studyHintDepth.get(this.studyHintStateKey(card, step, kanji)) ?? 0, hints.length);
        const revealed = hints.slice(0, depth);
        const more = depth < hints.length;
        return el('div', { class: 'jpdb-reader-newtab-study-hint', dataset: { studyHintStep: step } },
            ...revealed.map(hint => el('span', { class: 'jpdb-reader-newtab-study-hint-item' },
                el('small', {}, this.text(hint.labelKey)),
                el('span', hint.kind === 'count' ? {} : { lang: step === 'recall-cloze' ? 'ja' : undefined },
                    hint.kind === 'count' ? this.formatHintCount(Number(hint.text)) : hint.text),
            )),
            more ? el('button', {
                type: 'button',
                class: 'jpdb-reader-newtab-study-hint-btn',
                dataset: { newtabAction: newTabAction('study-hint') },
            }, depth === 0 ? this.text('studyHintReveal') : this.text('studyHintMore')) : null,
        );
    }

    private formatHintCount(count: number): string {
        return resolveUiLanguage(this.language()) === 'ja' ? `${count}拍` : `${count} kana`;
    }

    private revealStudyHint(root: HTMLElement, target: HTMLElement): void {
        const panel = target.closest<HTMLElement>('[data-study-hint-step]');
        const step = panel?.dataset.studyHintStep as StudyHintStep | undefined;
        if (!step) return;
        const card = this.visibleWords[this.index];
        if (!card) return;
        const kanji = step === 'kanji-doodle' ? this.activeStudyKanji(card) ?? '' : '';
        const key = this.studyHintStateKey(card, step, kanji);
        this.studyHintDepth.set(key, (this.studyHintDepth.get(key) ?? 0) + 1);
        this.renderWord(root, card);
    }

    // Total hint taps across every step of the active card, for the reveal summary.
    private studyHintsUsedForCard(card: JPDBCard): number {
        const prefix = `${cardKey(card)}|`;
        let total = 0;
        for (const [key, depth] of this.studyHintDepth) {
            if (key.startsWith(prefix)) total += depth;
        }
        return total;
    }

    // Minimal reveal footnote: "Used N hints", shown only when the learner leaned
    // on hints this card. Purely informational — grading stays a single choice at
    // the reveal and is unaffected.
    private renderStudyRevealHintSummary(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.meaning) return;
        const existing = slots.meaning.querySelector('.jpdb-reader-newtab-study-hint-summary');
        existing?.remove();
        if (!this.state.revealAnswer) return;
        const used = this.studyHintsUsedForCard(card);
        if (used <= 0) return;
        slots.meaning.appendChild(el('p', { class: 'jpdb-reader-newtab-study-hint-summary' },
            used === 1 ? this.text('studyHintUsedOne') : this.text('studyHintUsedMany').replace('{count}', String(used))));
    }

    private renderKanjiPromptAnswer(slots: NewTabStudySlots, card: JPDBCard, kanji: string): void {
        if (!slots.answer) return;
        if (this.state.revealAnswer) {
            replaceChildrenWith(slots.answer, this.revealedKanjiAnswer(card, kanji));
            return;
        }
        replaceChildrenWith(slots.answer, this.kanjiDoodleFront(this.studyStepIdForKanji(card, kanji)));
        this.installNewTabKanjiDoodle(slots, card, kanji);
    }

    private studyStepIdForKanji(card: JPDBCard, kanji: string): NewTabStudyStepId {
        return this.studySessionForCard(card, this.shouldRenderCardAsKanji(card)).steps
            .find(step => step.kind === 'kanji-doodle' && step.kanji === kanji)?.id ?? 'kanji-doodle';
    }

    private revealedKanjiAnswer(card: JPDBCard, kanji: string): HTMLElement {
        const preview = this.doodlePreviewCache.get(cardKey(card));
        return el('div', { class: 'jpdb-reader-newtab-kanji-answer' },
            el('div', { class: 'jpdb-reader-newtab-kanji-answer-main' },
                el('div', { class: 'jpdb-reader-newtab-kanji-svg', dataset: { newtabKanjiSvg: kanji } }, kanji),
                this.renderJitenKanjiBackingWord(card, kanji),
            ),
            el('div', { class: 'jpdb-reader-newtab-doodle-preview' },
                preview ? el('img', { src: preview, alt: `${this.text('yourDrawing')}: ${kanji}` }) : null,
            ),
        );
    }

    private renderJitenKanjiBackingWord(card: JPDBCard, kanji: string): HTMLElement | null {
        return renderJitenKanjiBackingWordView(card, kanji, {
            sourceCardFor: value => this.sourceCardForVisibleCard(value),
            settings: this.dependencies.getSettings(),
            meaningFor: firstCardMeaning,
            stateFor: primaryCardState,
            lookupButton: (value, state) => this.kanjiBackingLookupButton(value, state),
            audioButton: value => this.renderStudyWordAudioButton(value),
        });
    }

    private kanjiBackingLookupButton(card: JPDBCard, state: CardState): HTMLButtonElement {
        const button = el('button', { class: 'jpdb-reader-newtab-kanji-popover-word jpdb-reader-newtab-kanji-backing-term', type: 'button', lang: 'ja', dataset: { action: 'similar-word', expression: card.spelling, reading: card.reading }, title: `${this.text('lookUp')}: ${card.spelling}` }, this.renderPromptReaderWord(card, state, card.spelling)) as HTMLButtonElement;
        bindPrivateCommandCapability(button, { kind: 'kanji-word', expression: card.spelling, reading: card.reading });
        return button;
    }

    private kanjiDoodleFront(studyStepId = ''): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-kanji-front' },
            el('div', {
                class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle trace-hidden',
                dataset: studyStepId ? { studyDoodleStep: studyStepId } : undefined,
            },
                el('div', { class: 'jpdb-reader-doodle-ghost', dataset: { newtabDoodleGhost: true }, hidden: true }),
                el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': this.text('drawKanji') }),
            ),
            el('div', { class: 'jpdb-reader-doodle-tools jpdb-reader-newtab-doodle-actions' },
                el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleTrace: true } }, this.text('showTrace')),
                el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleClear: true } }, this.text('clear')),
            ),
            el('div', { class: 'jpdb-reader-newtab-doodle-result', dataset: { newtabDoodleResult: true } }),
        );
    }

    private installNewTabKanjiDoodle(slots: NewTabStudySlots, card: JPDBCard, kanji: string): void {
        if (!slots.answer || !targetCanLookupCharacter(kanji)) return;
        installKanjiDoodle(slots.answer, () => this.dependencies.getSettings().interfaceLanguage, {
            onChange: strokes => this.assessDoodle(slots, card, kanji, strokes),
            onClear: () => {
                this.doodlePreviewCache.delete(cardKey(card));
                this.clearDoodleAssessment(slots);
            },
        });
    }

    private renderWordPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (this.renderAnkiRenderedWordPrompt(slots, card)) return;
        if (slots.prompt) {
            const sentence = this.frontSentenceFromCard(card);
            this.renderWordPromptContent(slots.prompt, card, state, sentence);
            void this.enrichWordPromptDetails(slots.prompt, card, state, sentence);
            void this.enrichWordPitch(slots.prompt, card);
            void this.enrichWordPromptSentence(slots.prompt, card, state, sentence);
        }
        this.renderWordAnswer(slots.answer, card);
        this.renderWordMeaning(slots.meaning, card);
        void this.renderImmersionExample(slots, card);
    }

    private renderRecallPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (slots.prompt) this.renderRecallQuestion(slots.prompt, card);
        this.renderRecallAnswer(slots.answer, card, state);
        this.renderRecallMeaning(slots.meaning, card);
        if (this.state.revealAnswer) void this.renderImmersionExample(slots, card);
    }

    private renderRecallQuestion(prompt: HTMLElement, card: JPDBCard): void {
        this.ensureNPlusOneStudySentence(card);
        const cloze = buildNewTabRecallCloze(card, this.recallSentenceFromCard(card), newTabCardReading(card));
        const meaning = firstCardMeaning(card) || this.text('recallPromptFallback');
        prompt.lang = cloze.hasCloze ? newTabCardTarget(card).typography.contentLocale : 'en';
        delete prompt.dataset.newtabExpression;
        delete prompt.dataset.newtabSentenceRequest;
        delete prompt.dataset.newtabPromptParseRequest;
        prompt.classList.remove('jpdb-reader-newtab-prompt-anki-card', 'jpdb-reader-newtab-prompt-has-sentence');
        prompt.classList.remove('jpdb-reader-newtab-kanji-prompt');
        prompt.classList.add('jpdb-reader-newtab-recall-prompt');
        prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.remove('jpdb-reader-newtab-study-anki-card');
        replaceChildrenWith(prompt, cloze.hasCloze
            ? el('span', { class: 'jpdb-reader-newtab-recall-question jpdb-reader-newtab-recall-cloze' },
                el('span', { class: 'jpdb-reader-newtab-recall-cloze-sentence' },
                    cloze.before,
                    el('span', { class: 'jpdb-reader-newtab-recall-gap', role: 'img', 'aria-label': this.text('recallAnswer') }),
                    cloze.after,
                ),
                el('span', { class: 'jpdb-reader-newtab-recall-hint', lang: resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en' }, meaning),
            )
            : el('span', { class: 'jpdb-reader-newtab-recall-question' }, meaning));
    }

    private renderRecallAnswer(answer: HTMLElement | null, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (!answer) return;
        const target = newTabCardTarget(card);
        delete answer.dataset.newtabAnswerDetailsRequest;
        const key = cardKey(card);
        const recall = this.stepState(key)?.recall;
        const value = recall?.answer ?? '';
        const outcome = recall?.outcome;
        const evaluation = evaluateNewTabRecallAnswer(card, value, newTabCardReading(card));
        answer.dataset.recallOutcome = outcome ?? 'pending';
        replaceChildrenWith(answer,
            el('form', { class: 'jpdb-reader-newtab-recall-form', dataset: { newtabRecallForm: true } },
                el('input', {
                    class: 'jpdb-reader-newtab-recall-input',
                    dataset: { newtabRecallInput: true },
                    value,
                    placeholder: this.text('recallAnswer'),
                    autocomplete: 'off',
                    autocapitalize: 'none',
                    autocorrect: 'off',
                    spellcheck: false,
                    inputmode: 'text',
                    enterkeyhint: 'done',
                    lang: target.typography.contentLocale,
                    dir: target.direction,
                    'aria-label': this.text('recallAnswer'),
                    disabled: this.state.revealAnswer,
                }),
                el('button', {
                    class: 'jpdb-reader-newtab-recall-check',
                    type: 'button',
                    dataset: { newtabAction: newTabAction('recall-submit') },
                }, this.text('recallCheck')),
            ),
            outcome ? el('div', {
                class: 'jpdb-reader-newtab-recall-result',
                dataset: { newtabRecallResult: outcome },
            }, this.recallOutcomeLabel(outcome, evaluation.canonicalAnswer)) : null,
            this.renderStudyHintPanel(card, 'recall-cloze', '', []),
            this.state.revealAnswer ? this.renderRecallSolution(card, state) : null,
        );
        if (!this.state.revealAnswer) this.focusRecallInputSoon(answer);
    }

    private renderRecallSolution(card: JPDBCard, state: ReturnType<typeof primaryCardState>): HTMLElement {
        const cloze = buildNewTabRecallCloze(card, this.recallSentenceFromCard(card), newTabCardReading(card));
        const solution = el('div', { class: 'jpdb-reader-newtab-recall-solution', lang: newTabCardTarget(card).typography.contentLocale },
            el('span', { class: 'jpdb-reader-newtab-term-row' },
                cloze.hasCloze
                    ? this.renderWordPromptSentenceNode(card, state, cloze.sentence)
                    : el('span', { class: 'jpdb-reader-newtab-term' }, this.renderPromptReaderWord(card, state, card.sentence || card.spelling)),
                this.renderStudyWordAudioButton(card),
            ),
        );
        this.ensureRecallAnswerReading(solution, card);
        return solution;
    }

    // The recall solution is the answer: its reading must be visible no matter
    // which sentence renderer produced it. The parsed-sentence path renders
    // with the user's own furigana settings, so with furigana off (or a
    // selective mode) the target word can come back with no ruby — force the
    // headword treatment onto the target, or fall back to a reading chip.
    private ensureRecallAnswerReading(solution: HTMLElement, card: JPDBCard): void {
        if (solution.querySelector('[data-yomu-headword] rt.jpdb-reader-furi')) return;
        const target = [...solution.querySelectorAll<HTMLElement>('.jpdb-reader-word')]
            .find(word => readerWordSurfaceText(word) === card.spelling);
        if (target) {
            setInnerHtml(target, renderCardSpellingWithFurigana(card, {
                ...this.dependencies.getSettings(),
                furiganaMode: 'all',
                showFurigana: true,
            }, { enabled: false, label: this.text('showKanji') }));
            target.dataset.yomuHeadword = 'true';
            if (target.querySelector('rt.jpdb-reader-furi')) return;
        }
        const reading = newTabCardOptionalReading(card);
        if (reading && reading !== card.spelling.trim()) {
            solution.append(el('span', { class: 'jpdb-reader-reading', dataset: { newtabRecallAnswerReading: true } }, reading));
        }
    }

    private renderRecallMeaning(meaning: HTMLElement | null, card: JPDBCard): void {
        if (!meaning) return;
        if (!this.state.revealAnswer) {
            meaning.replaceChildren();
            return;
        }
        this.renderWordMeaning(meaning, card);
    }

    private focusRecallInputSoon(answer: HTMLElement): void {
        this.focusStudyInputSoon(answer, '[data-newtab-recall-input]');
    }

    private focusStudyInputSoon(answer: HTMLElement, selector: string): void {
        if (typeof window === 'undefined') return;
        const focusInput = () => {
            const input = answer.querySelector<HTMLInputElement>(selector);
            if (!input?.isConnected || input.disabled) return;
            const active = document.activeElement;
            if (active && active !== document.body && active !== answer.closest('[data-newtab-study]')) return;
            input.focus({ preventScroll: true });
        };
        // iOS only opens the software keyboard while the navigation tap still
        // owns user activation; a zero-delay timer is already too late.
        if (this.hasCoarsePointer()) {
            focusInput();
            return;
        }
        window.setTimeout(focusInput, 0);
    }

    private updateRecallAnswer(root: HTMLElement, value: string, submitted: boolean): void {
        const card = this.visibleWords[this.index];
        if (!card) return;
        const key = cardKey(card);
        const state = this.ensureStepState(key);
        if (submitted) {
            state.recall = { answer: value, outcome: evaluateNewTabRecallAnswer(card, value, newTabCardReading(card)).outcome };
        } else {
            state.recall = { answer: value };
            root.querySelector<HTMLElement>('[data-newtab-recall-result]')?.remove();
            const answer = root.querySelector<HTMLElement>('[data-newtab-answer]');
            if (answer) answer.dataset.recallOutcome = 'pending';
        }
    }

    private submitRecallAnswer(root: HTMLElement): void {
        const card = this.visibleWords[this.index];
        const input = root.querySelector<HTMLInputElement>('[data-newtab-recall-input]');
        if (!card || !input) return;
        input.value = normalizeLearningTargetInput(newTabCardTarget(card), input.value);
        const evaluation = evaluateNewTabRecallAnswer(card, input.value, newTabCardReading(card));
        this.ensureStepState(cardKey(card)).recall = { answer: input.value, outcome: evaluation.outcome };
        if (evaluation.outcome === 'empty') {
            this.renderWord(root, card);
            return;
        }
        if (!this.navigateStudyStep('next')) this.renderWord(root, card);
    }

    private recallOutcomeLabel(outcome: NewTabRecallOutcome, _answer: string): string {
        if (outcome === 'correct') return this.text('recallCorrect');
        if (outcome === 'accepted') return this.text('recallAccepted');
        if (outcome === 'incorrect') return this.text('recallIncorrect');
        return this.text('recallEmpty');
    }

    // ----- Type-word: reproduce the recall word (typed or handwritten) -----

    private renderTypeWordPrompt(slots: NewTabStudySlots, card: JPDBCard): void {
        // The sentence stays visible with only the target blanked. Keyboard mode
        // asks for that missing word; handwriting keeps its character drill.
        if (slots.prompt) this.renderTypeWordQuestion(slots.prompt, card);
        this.renderTypeWordAnswer(slots.answer, card);
        this.renderRecallMeaning(slots.meaning, card);
        if (this.state.revealAnswer) void this.renderImmersionExample(slots, card);
    }

    private typeWordInputMode(): NewTabTypeWordInputMode {
        return this.dependencies.getSettings().newTabTypeWordInputMode === 'handwriting' ? 'handwriting' : 'keyboard';
    }

    private renderTypeWordQuestion(prompt: HTMLElement, card: JPDBCard): void {
        this.ensureNPlusOneStudySentence(card);
        const cloze = buildNewTabRecallCloze(card, this.recallSentenceFromCard(card), newTabCardReading(card));
        // Handwriting reproduces the word character by character, and a card
        // without a sentence has nothing to copy — both keep the recall prompt.
        if (!cloze.hasCloze || this.typeWordInputMode() === 'handwriting') {
            this.renderRecallQuestion(prompt, card);
            return;
        }
        const meaning = firstCardMeaning(card) || this.text('recallPromptFallback');
        prompt.lang = newTabCardTarget(card).typography.contentLocale;
        delete prompt.dataset.newtabExpression;
        delete prompt.dataset.newtabSentenceRequest;
        delete prompt.dataset.newtabPromptParseRequest;
        prompt.classList.remove('jpdb-reader-newtab-prompt-anki-card', 'jpdb-reader-newtab-prompt-has-sentence', 'jpdb-reader-newtab-kanji-prompt');
        prompt.classList.add('jpdb-reader-newtab-recall-prompt', 'jpdb-reader-newtab-copy-prompt');
        prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.remove('jpdb-reader-newtab-study-anki-card');
        const sentenceNode = renderNewTabFrontSentence(card, cloze.sentence, this.studySentenceRenderSettings(), this.cachedParsedNewTabSentenceTokens(cloze.sentence));
        this.blankTypeWordSentenceTargets(sentenceNode, cloze);
        replaceChildrenWith(prompt,
            el('span', { class: 'jpdb-reader-newtab-recall-question jpdb-reader-newtab-recall-cloze' },
                el('span', { class: 'jpdb-reader-newtab-recall-cloze-sentence' }, sentenceNode),
                el('span', { class: 'jpdb-reader-newtab-recall-hint', lang: resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en' }, meaning),
            ));
        void this.parseNewTabPromptSentence(prompt, card).then(() => {
            // The prompt node is reused across cards: a slow parse for card A
            // finishing after navigation must never blank card B's prompt.
            if (!prompt.isConnected) return;
            const current = this.visibleWords[this.index];
            if (!current || cardKey(current) !== cardKey(card)) return;
            if (this.studySessionForCard(current).activeStep.kind !== 'type-word') return;
            this.blankTypeWordSentenceTargets(prompt, cloze);
        });
    }

    // The copy prompt must never show the answer: every rendered occurrence of
    // the target word becomes a gap. If highlighting failed to mark it (parse
    // fallback), rebuild the line from the cloze's before/after halves.
    private blankTypeWordSentenceTargets(root: ParentNode, cloze: NewTabRecallCloze): void {
        const gapNode = () => el('span', { class: 'jpdb-reader-newtab-recall-gap', role: 'img', 'aria-label': this.text('recallAnswer') });
        const targets = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-example-target')];
        if (targets.length) {
            targets.forEach(word => word.replaceWith(gapNode()));
            return;
        }
        if (root.querySelector('.jpdb-reader-newtab-recall-gap')) return;
        const sentence = root instanceof HTMLElement && root.matches('[data-newtab-sentence-render]')
            ? root
            : root.querySelector<HTMLElement>('[data-newtab-sentence-render]');
        if (!sentence || !cloze.answer) return;
        // Highlighting missed the target (segmented tokens, ruby interleaving
        // the surface text): rebuild the plain cloze line. Losing furigana
        // here is fine; showing the answer is not.
        replaceChildrenWith(sentence,
            document.createTextNode(cloze.before),
            gapNode(),
            document.createTextNode(cloze.after));
    }

    private renderTypeWordAnswer(answer: HTMLElement | null, card: JPDBCard): void {
        const cardTarget = newTabCardTarget(card);
        mountTypeWordAnswer({
            root: answer,
            configuredMode: this.typeWordInputMode(),
            supportsHandwriting: this.typeWordSupportsHandwriting(card),
            state: this.stepState(cardKey(card))?.type,
            targetText: this.typeWordTarget(card),
            keyboard: {
                language: cardTarget.typography.contentLocale,
                direction: cardTarget.direction,
                revealAnswer: this.state.revealAnswer,
                audioButton: () => this.renderStudyWordAudioButton(card),
                focus: root => this.focusStudyInputSoon(root, '[data-newtab-type-input]'),
            },
            handwriting: {
                render: () => this.renderTypeWordHandwriting(card),
                install: root => this.installTypeWordDoodle(root, card),
            },
            text: key => this.text(key),
        });
    }

    // Grade only kanji; kana scaffolding stays visible (飲み物 -> ＿み＿) and never asks for token strokes.
    // to scribble a token stroke merely to advance past み.
    private renderTypeWordHandwriting(card: JPDBCard): HTMLElement {
        if (this.typeWordUsesSelfCheck(card)) {
            return this.renderTypeWordSelfCheckHandwriting(card);
        }
        const target = this.typeWordTarget(card);
        const chars = Array.from(target);
        const progress = this.typeWordHandwritingProgress(card, chars);
        return renderStrokeFeedbackHandwriting({
            chars, progress, doodleFront: this.kanjiDoodleFront(),
            isFixed: character => !isKanjiCharacter(character), text: key => this.text(key),
        });
    }

    private installTypeWordDoodle(answer: HTMLElement, card: JPDBCard): void {
        if (this.typeWordUsesSelfCheck(card)) {
            this.installTypeWordSelfCheckDoodle(answer);
            return;
        }
        if (!usesJapaneseCharacterStudy()) return;
        const chars = Array.from(this.typeWordTarget(card));
        const character = chars[this.typeWordHandwritingProgress(card, chars)];
        if (!character) return;
        installKanjiDoodle(answer, () => this.dependencies.getSettings().interfaceLanguage, {
            onChange: strokes => { void this.assessTypeWordDoodle(answer, card, character, strokes); },
            onClear: () => this.clearDoodleAssessment({ ...this.studySlots(answer.closest<HTMLElement>('.jpdb-reader-newtab') ?? answer), answer }),
        });
    }

    private async assessTypeWordDoodle(answer: HTMLElement, card: JPDBCard, character: string, strokes: Parameters<typeof assessKanjiStrokes>[0]): Promise<void> {
        const slots = { ...this.studySlots(answer.closest<HTMLElement>('.jpdb-reader-newtab') ?? answer), answer };
        if (!targetCanLookupCharacter(character)) return;
        // The normalized progress path skips kana before the canvas is mounted.
        // Keep this guard as a defensive fallback for a stale in-flight render.
        const details = await this.loadKanjiDetails(character);
        if (!targetCanLookupCharacter(character) || !answer.isConnected || this.visibleWords[this.index] !== card) return;
        const expectedStrokes = details.vg?.strokeCount ?? 0;
        if (!expectedStrokes || !details.vg?.strokeShapes?.length) {
            // Missing data is not a correct stroke assessment. Switch this card
            // to the explicit self-check Adapter and let the learner decide.
            this.typeHandwritingSelfCheck.add(cardKey(card));
            const root = answer.closest<HTMLElement>('.jpdb-reader-newtab');
            if (root) this.renderWord(root, card);
            return;
        }
        if (shouldWaitForMoreDoodleStrokes(strokes, expectedStrokes)) {
            this.clearDoodleAssessment(slots);
            return;
        }
        const assessment = assessKanjiStrokes(strokes, expectedStrokes, details.vg.strokeShapes);
        this.renderDoodleAssessment(slots, assessment);
        if (assessment.passed) this.advanceTypeWordHandwriting(answer, card, 'correct');
    }

    private advanceTypeWordHandwriting(answer: HTMLElement, card: JPDBCard, charOutcome: 'correct' | 'wrong'): void {
        const key = cardKey(card);
        const chars = Array.from(this.typeWordTarget(card));
        const progress = this.typeWordHandwritingProgress(card, chars);
        const next = nextTypeWordHandwritingIndex(chars, progress + 1);
        this.typeHandwritingProgress.set(key, next);
        if (next >= chars.length) {
            // All characters cleared -> the whole word passes. A wrong char along
            // the way never reaches here (grading only advances on a pass).
            this.recordTypeOutcome(card, charOutcome === 'wrong' ? 'incorrect' : 'correct');
            const root = answer.closest<HTMLElement>('.jpdb-reader-newtab');
            if (root && this.visibleWords[this.index] === card && !this.navigateStudyStep('next')) this.renderWord(root, card);
            return;
        }
        const root = answer.closest<HTMLElement>('.jpdb-reader-newtab');
        if (root && this.visibleWords[this.index] === card) this.renderWord(root, card);
    }

    private typeWordSupportsHandwriting(card: JPDBCard): boolean {
        const target = newTabCardTarget(card);
        return targetSupportsTypeWordHandwriting(target, this.typeWordTarget(card));
    }

    private typeWordUsesSelfCheck(card: JPDBCard | undefined): card is JPDBCard {
        return Boolean(card && (
            newTabCardTarget(card).experiences.handwriting === 'self-check'
            || this.typeHandwritingSelfCheck.has(cardKey(card))
        ));
    }

    private renderTypeWordSelfCheckHandwriting(card: JPDBCard): HTMLElement {
        const target = newTabCardTarget(card);
        return renderSelfCheckHandwriting({
            targetText: this.typeWordTarget(card), language: target.typography.contentLocale,
            direction: target.direction, state: this.stepState(cardKey(card))?.type,
            text: key => this.text(key),
        });
    }

    private installTypeWordSelfCheckDoodle(answer: HTMLElement): void {
        installSelfCheckDoodle(answer, () => this.dependencies.getSettings().interfaceLanguage);
    }

    private handleTypeWordHandwritingSelfCheck(root: HTMLElement, action: TypeWordSelfCheckAction): void {
        const card = this.visibleWords[this.index];
        if (!this.typeWordUsesSelfCheck(card)) return;
        const state = this.ensureStepState(cardKey(card));
        const transition = applyTypeWordSelfCheckAction(state.type, action);
        if (transition.kind === 'update') {
            state.type = { ...state.type, ...transition.state };
            this.recordTypeOutcome(card, transition.outcome);
            this.renderWord(root, card);
        }
        if (transition.kind === 'navigate') this.continueTypeWord(root, card);
    }

    private typeWordHandwritingProgress(card: JPDBCard, chars = Array.from(this.typeWordTarget(card))): number {
        const key = cardKey(card);
        const stored = Math.min(this.typeHandwritingProgress.get(key) ?? 0, chars.length);
        const normalized = nextTypeWordHandwritingIndex(chars, stored);
        if (normalized !== stored) this.typeHandwritingProgress.set(key, normalized);
        return normalized;
    }

    private typeWordTarget(card: JPDBCard): string {
        const cloze = buildNewTabRecallCloze(card, this.recallSentenceFromCard(card), newTabCardReading(card));
        return (cloze.hasCloze ? cloze.answer : '').trim() || card.spelling.trim();
    }

    private setTypeWordInputMode(root: HTMLElement, mode: NewTabTypeWordInputMode): void {
        const settings = this.dependencies.getSettings();
        if (settings.newTabTypeWordInputMode === mode) return;
        settings.newTabTypeWordInputMode = mode;
        void this.dependencies.onSettingsChange(['newTabTypeWordInputMode']);
        const card = this.visibleWords[this.index];
        if (card) this.renderWord(root, card);
    }

    private handleTypeWordModeClick(root: HTMLElement, target: HTMLElement): void {
        const mode = target.closest<HTMLElement>('[data-type-word-mode]')?.dataset.typeWordMode;
        if (mode === 'keyboard' || mode === 'handwriting' && targetSupportsHandwriting()) {
            this.setTypeWordInputMode(root, mode);
        }
    }

    private submitTypeWordAnswer(root: HTMLElement): void {
        const card = this.visibleWords[this.index];
        const input = root.querySelector<HTMLInputElement>('[data-newtab-type-input]');
        if (!card || !input) return;
        const state = this.ensureStepState(cardKey(card));
        if (state.type?.feedback === 'correct' || state.type?.feedback === 'accepted') {
            if (!this.navigateStudyStep('next')) this.renderWord(root, card);
            return;
        }
        input.value = normalizeLearningTargetInput(newTabCardTarget(card), input.value);
        const evaluation = evaluateNewTabRecallAnswer(card, input.value, newTabCardReading(card));
        state.type = { ...state.type, answer: input.value, feedback: evaluation.outcome };
        if (evaluation.outcome === 'empty') {
            this.renderWord(root, card);
            return;
        }
        this.recordTypeOutcome(card, evaluation.outcome);
        // Stay on the step and show immediate feedback. Incorrect attempts keep
        // the answer concealed for retrieval practice; a pass turns the attached
        // action into Continue so the result is not lost to auto-navigation.
        this.renderWord(root, card);
    }

    private skipTypeWord(root: HTMLElement): void {
        const card = this.visibleWords[this.index];
        if (!card) return;
        this.recordTypeOutcome(card, 'skipped');
        this.continueTypeWord(root, card);
    }

    private continueTypeWord(root: HTMLElement, card: JPDBCard): void {
        if (!this.navigateStudyStep('next')) this.renderWord(root, card);
    }

    // First attempt counts: once an outcome is recorded for this card it is never
    // overwritten (a retype/redraw does not launder a first miss into a pass).
    private recordTypeOutcome(card: JPDBCard, outcome: NewTabRecallOutcome | 'skipped' | undefined): void {
        if (!outcome) return;
        const state = this.ensureStepState(cardKey(card));
        if (state.type?.outcome !== undefined) return;
        state.type = { ...state.type, outcome };
    }

    private renderWordAnswer(answer: HTMLElement | null, _card: JPDBCard): void {
        if (!answer) return;
        delete answer.dataset.newtabAnswerDetailsRequest;
        answer.replaceChildren();
    }

    private renderWordMeaning(meaning: HTMLElement | null, card: JPDBCard): void {
        if (!meaning) return;
        if (!this.state.revealAnswer) {
            meaning.replaceChildren();
            return;
        }
        // SH-4 fidelity: every provider's cards carry the "Part of the X
        // deck" line — live JPDB keeps jpdb.io's own scraped wording, Jiten
        // uses the study-batch sourceDeckName, Anki its owning deck(s).
        const membership = card.jpdbDeckMembership || this.providerDeckMembershipLine(card);
        replaceChildrenWith(meaning,
            el('div', {}, firstCardMeaning(card)),
            membership
                ? el('p', { class: 'jpdb-reader-newtab-deck-membership' }, membership)
                : null,
        );
        this.appendComposedOfLine(meaning, card);
        void this.renderStudyRevealDefinitionSources(meaning, card);
    }

    // fallow-ignore-next-line complexity
    private async renderStudyRevealDefinitionSources(meaning: HTMLElement, card: JPDBCard): Promise<void> {
        const loadDetails = this.dependencies.loadCardRenderData;
        const renderSources = this.dependencies.renderStudyDefinitionSources;
        if (!loadDetails || !renderSources) return;
        const key = cardKey(card);
        const target = captureActiveTarget();
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        meaning.dataset.newtabStudyRevealDetailsRequest = requestId;
        let data = await loadDetails(card).catch(() => null);
        if (!data || !this.isCurrentStudyRevealDefinitionRequest(meaning, key, requestId, target)) return;
        if (usesJapaneseProviders() && !data.bunproDefinitionInfo && this.dependencies.hydrateBunproDefinitionInfo) {
            const info = await this.dependencies.hydrateBunproDefinitionInfo(card).catch(() => null);
            if (info) data = { ...data, bunproDefinitionInfo: info };
            if (!this.isCurrentStudyRevealDefinitionRequest(meaning, key, requestId, target)) return;
        }
        let html = renderSources(card, data, card.sentence || card.spelling);
        if (usesJapaneseProviders() && this.studyDefinitionSourcesMissing(html)) {
            const fallback = await this.lookupStudyRevealDefinitionCard(card);
            if (!fallback || !this.isCurrentStudyRevealDefinitionRequest(meaning, key, requestId, target)) return;
            const fallbackData = await loadDetails(fallback).catch(() => null);
            if (!fallbackData || !this.isCurrentStudyRevealDefinitionRequest(meaning, key, requestId, target)) return;
            html = renderSources(fallback, fallbackData, card.sentence || fallback.sentence || fallback.spelling);
        }
        if (this.studyDefinitionSourcesMissing(html)) return;
        meaning.querySelectorAll(':scope > .jpdb-reader-newtab-reveal-dictionaries').forEach(element => element.remove());
        const section = el('div', { class: 'jpdb-reader-newtab-reveal-dictionaries', dataset: { newtabRevealDictionaries: true } });
        setInnerHtml(section, html);
        meaning.append(section);
        this.dependencies.installDictionarySourceTracking?.(section);
        if (usesJapaneseProviders()) this.dependencies.installWanikaniSources?.(section, card);
        void this.dependencies.parseContent?.(section);
    }

    private isCurrentStudyRevealDefinitionRequest(
        meaning: HTMLElement,
        cardKeyValue: string,
        requestId: string,
        target: ActiveTargetSnapshot,
    ): boolean {
        return isCurrentActiveTarget(target)
            && meaning.isConnected
            && meaning.dataset.newtabStudyRevealDetailsRequest === requestId
            && this.state.revealAnswer
            && this.isVocabularyStudyRoute()
            && cardKey(this.visibleWords[this.index]) === cardKeyValue;
    }

    private studyDefinitionSourcesMissing(html: string): boolean {
        return !html.trim() || html.includes('jpdb-reader-no-definitions');
    }

    private async lookupStudyRevealDefinitionCard(card: JPDBCard): Promise<JPDBCard | null> {
        if (!this.dependencies.lookupStudyCard) return null;
        const fallback = await this.dependencies.lookupStudyCard(card.spelling, card.reading).catch(error => {
            log.warn('Study reveal dictionary fallback lookup failed', { term: card.spelling }, error);
            return null;
        });
        if (!fallback) return null;
        return normalizeNewTabCard(fallback);
    }

    private providerDeckMembershipLine(card: JPDBCard): string {
        const deck = card.sourceDeckName || (card.ankiDeckNames ?? []).join(', ');
        return deck ? this.formatNewTabText('partOfDeck', { deck }) : '';
    }

    private appendComposedOfLine(meaning: HTMLElement, card: JPDBCard): void {
        renderComposedOfLine(meaning, card, {
            keywordCache: this.keywordCache,
            rtk: this.dependencies.rtk,
            jpdbKanji: this.dependencies.jpdbKanji,
            text: key => this.text(key),
        });
    }

    private renderWordPromptTools(card: JPDBCard, metaEntries: YomitanMetaEntry[] = []): HTMLElement {
        const settings = this.dependencies.getSettings();
        if (!this.state.revealAnswer) {
            return el('span', { class: 'jpdb-reader-newtab-study-tools', dataset: { newtabStudyTools: true } });
        }
        const rawReading = newTabCardOptionalReading(card);
        // Forced settings mirror the revealed headword renderer, which always
        // draws answer ruby — the chip only covers readings ruby can't show.
        const reading = rawReading && !isPlainReadingRedundantForHeadword(card, { ...settings, furiganaMode: 'all', showFurigana: true }, rawReading)
            ? rawReading
            : '';
        const pitch = settings.showPitchAccent
            ? htmlToFirstElement(renderPitch(card, metaEntries))
            : null;
        return el('span', { class: 'jpdb-reader-newtab-study-tools', dataset: { newtabStudyTools: true } },
            el('span', { class: 'jpdb-reader-newtab-study-tool-main' },
                reading ? el('span', { class: 'jpdb-reader-reading' }, reading) : null,
                pitch,
            ),
        );
    }

    // The study-word audio control now lives inline next to the headword (see
    // renderSentencePrompt) instead of off to the side of the meta row.
    private renderStudyWordAudioButton(card?: JPDBCard): HTMLElement {
        const settings = this.dependencies.getSettings();
        const audioTitle = uiText(settings.interfaceLanguage, settings.audioEnabled ? 'playAudio' : 'audioPlaybackDisabled');
        const audioButton = el('button', {
            class: 'jpdb-reader-icon-btn jpdb-reader-audio-control jpdb-reader-newtab-term-audio',
            type: 'button',
            dataset: { action: 'study-word-audio', ...(card ? { newtabCard: this.renderedStudyCardIdentity(card) } : {}) },
            'aria-label': audioTitle,
            title: audioTitle,
            disabled: !settings.audioEnabled,
        });
        setInnerHtml(audioButton, speakerIcon());
        return audioButton;
    }

    private async enrichWordPromptDetails(
        prompt: HTMLElement,
        card: JPDBCard,
        state: ReturnType<typeof primaryCardState>,
        currentSentence: string,
    ): Promise<void> {
        const loadDetails = this.dependencies.loadCardRenderData;
        if (!loadDetails) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        prompt.dataset.newtabStudyToolsRequest = requestId;
        const data = await loadDetails(card).catch(() => null);
        if (!data || !this.isCurrentWordPromptDetailsRequest(prompt, key, requestId)) return;
        this.markCardOfflineReady(card);
        this.applyLocalStudyReading(card, data);
        if (this.upgradeStudyPlanPitchAvailability(card)) return;
        const term = prompt.querySelector<HTMLElement>(':scope > .jpdb-reader-newtab-front .jpdb-reader-newtab-term');
        if (term) replaceChildrenWith(term, this.renderPromptReaderWord(card, state, currentSentence || card.spelling));
        prompt.querySelector<HTMLElement>(':scope > .jpdb-reader-newtab-front > [data-newtab-study-tools]')
            ?.replaceWith(this.renderWordPromptTools(card, data.metaEntries));
        this.dependencies.installDictionarySourceTracking?.(prompt);
    }

    private isCurrentWordPromptDetailsRequest(prompt: HTMLElement, key: string, requestId: string): boolean {
        return prompt.isConnected
            && prompt.dataset.newtabStudyToolsRequest === requestId
            && this.state.route === 'study'
            && cardKey(this.visibleWords[this.index]) === key;
    }

    private applyLocalStudyReading(card: JPDBCard, data: CardRenderData): void {
        const spelling = card.spelling.trim();
        const exact = spelling
            ? data.localEntries.find(entry => entry.expression === spelling && entry.reading && entry.reading !== spelling)
            : null;
        const reading = newTabCardOptionalReading(card)
            || exact?.reading
            || data.localEntries.find(entry => entry.reading && entry.reading !== spelling)?.reading
            || '';
        if (reading) card.reading = reading;
        if (!card.pitchAccent.length && reading) {
            const pitch = localPitchPatternFromMeta(spelling, reading, data.metaEntries);
            if (pitch) card.pitchAccent = [pitch];
        }
    }

    private renderAnkiRenderedWordPrompt(slots: NewTabStudySlots, card: JPDBCard): boolean {
        if (card.source !== 'anki' && card.reviewSource !== 'anki') return false;
        const renderedCard = this.ankiRenderedStudyCard(card);
        if (!renderedCard || !slots.prompt) return false;
        const html = renderAnkiRenderedCardStudyBody(renderedCard, this.state.revealAnswer, this.language(), card.ankiAudioFilenames ?? []);
        if (!html) return false;
        slots.prompt.lang = '';
        slots.prompt.classList.remove('jpdb-reader-newtab-prompt-has-sentence', 'jpdb-reader-newtab-recall-prompt', 'jpdb-reader-newtab-kanji-prompt');
        slots.prompt.classList.add('jpdb-reader-newtab-prompt-anki-card');
        slots.prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.add('jpdb-reader-newtab-study-anki-card');
        delete slots.prompt.dataset.newtabExpression;
        delete slots.prompt.dataset.newtabSentenceRequest;
        delete slots.prompt.dataset.newtabPromptParseRequest;
        setInnerHtml(slots.prompt, html);
        this.decorateAnkiRenderedStudyAudio(slots.prompt);
        slots.answer?.replaceChildren();
        slots.meaning?.replaceChildren();
        return true;
    }

    private decorateAnkiRenderedStudyAudio(prompt: HTMLElement): void {
        const firstSound = prompt.querySelector<HTMLButtonElement>('.jpdb-reader-anki-sound');
        if (!firstSound) return;
        firstSound.classList.add('jpdb-reader-anki-primary-sound', 'jpdb-reader-icon-btn');
        firstSound.classList.remove('jpdb-reader-icon-mini');
        if (firstSound.parentElement !== prompt) prompt.prepend(firstSound);
    }

    private ankiRenderedStudyCard(card: JPDBCard): NonNullable<JPDBCard['ankiRenderedCards']>[number] | null {
        const cards = card.ankiRenderedCards ?? [];
        if (!cards.length) return null;
        const primaryCardId = Number(card.ankiCardId ?? card.rid);
        return cards.find(rendered => rendered.cardId === primaryCardId) ?? cards[0] ?? null;
    }

    private renderWordPromptContent(
        prompt: HTMLElement,
        card: JPDBCard,
        state: ReturnType<typeof primaryCardState>,
        sentence: string,
    ): void {
        const promptSentence = this.wordPromptSentence(sentence);
        prompt.lang = 'ja';
        prompt.dataset.newtabExpression = 'true';
        prompt.classList.remove('jpdb-reader-newtab-prompt-anki-card', 'jpdb-reader-newtab-recall-prompt');
        prompt.classList.remove('jpdb-reader-newtab-kanji-prompt');
        prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.remove('jpdb-reader-newtab-study-anki-card');
        prompt.classList.toggle('jpdb-reader-newtab-prompt-has-sentence', Boolean(promptSentence));
        delete prompt.dataset.newtabSentenceRequest;
        delete prompt.dataset.newtabPromptParseRequest;
        replaceChildrenWith(prompt, this.renderSentencePrompt(card, state, promptSentence));
        void this.parseNewTabPromptSentence(prompt, card);
    }

    private wordPromptSentence(sentence: string): string {
        if (!sentence) return '';
        const settings = this.dependencies.getSettings();
        return this.state.revealAnswer && settings.immersionKitEnabled ? '' : sentence;
    }

    private renderSentencePrompt(card: JPDBCard, state: ReturnType<typeof primaryCardState>, sentence = ''): HTMLElement {
        const wrap = el('span', { class: 'jpdb-reader-newtab-front' },
            el('span', { class: 'jpdb-reader-newtab-term-row' },
                el('span', { class: 'jpdb-reader-newtab-term' }, this.renderPromptReaderWord(card, state, sentence || card.spelling)),
                this.renderStudyWordAudioButton(card),
            ),
            this.renderWordPromptTools(card),
        );
        if (!sentence) return wrap;
        wrap.append(this.renderWordPromptSentenceNode(card, state, sentence));
        return wrap;
    }

    private renderPromptReaderWord(card: JPDBCard, state: ReturnType<typeof primaryCardState>, sentence: string): HTMLSpanElement {
        const word = this.renderReaderWord(card, state, card.spelling, sentence);
        word.classList.add('jpdb-reader-parseable');
        const revealAnswer = this.state.revealAnswer;
        // The headword always opens the WORD popover, revealed or not: per-kanji
        // buttons used to cover the entire revealed surface, so the word itself
        // became unreachable. Kanji drilldown lives in the popover's
        // composed-of chips instead.
        const settings = this.dependencies.getSettings();
        // Reveal surfaces are answer surfaces: the reading IS the answer, so
        // ruby is forced even for furigana-off users (codified in the card-front
        // suite). Pre-reveal stays bare for recall.
        setInnerHtml(word, renderCardSpellingWithFurigana(card, {
            ...settings,
            furiganaMode: revealAnswer ? 'all' : 'off',
            showFurigana: revealAnswer,
        }, { enabled: false, label: this.text('showKanji') }));
        word.dataset.yomuHeadword = 'true';
        if (!revealAnswer) this.hidePromptPronunciation(word);
        return word;
    }

    private renderWordPromptSentenceNode(card: JPDBCard, state: ReturnType<typeof primaryCardState>, sentence: string): HTMLElement {
        const sentenceWrap = el('span', { class: 'jpdb-reader-newtab-sentence' });
        if (this.shouldRenderPlainSentencePrompt(card, sentence)) {
            sentenceWrap.append(document.createTextNode(sentence));
            return sentenceWrap;
        }

        if (this.shouldParseSentencePrompt()) {
            return renderNewTabFrontSentence(card, sentence, this.studySentenceRenderSettings(), this.cachedParsedNewTabSentenceTokens(sentence));
        }

        const target = sentencePromptTarget(card, sentence);
        if (!target) {
            sentenceWrap.textContent = sentence;
            return sentenceWrap;
        }
        const start = sentence.indexOf(target);
        sentenceWrap.append(document.createTextNode(sentence.slice(0, start)));
        const word = this.renderReaderWord(card, state, target, sentence);
        if (!this.state.revealAnswer) this.hidePromptPronunciation(word);
        sentenceWrap.append(word);
        sentenceWrap.append(document.createTextNode(sentence.slice(start + target.length)));
        return sentenceWrap;
    }

    private shouldRenderPlainSentencePrompt(card: JPDBCard, sentence: string): boolean {
        return !this.dependencies.getSettings().newTabParsingEnabled
            || !sentence
            || sentence === card.spelling;
    }

    private shouldParseSentencePrompt(): boolean {
        return this.dependencies.getSettings().newTabParsingEnabled
            && Boolean(this.dependencies.parseContent);
    }

    private studySentenceRenderSettings(): ReaderSettings {
        const settings = this.dependencies.getSettings();
        if (this.state.revealAnswer) return settings;
        // The writing step keeps furigana scaffolding on the sentence (the
        // target itself is blanked, so nothing leaks); every other pre-reveal
        // prompt hides pronunciation so it cannot feed the answer.
        if (this.activeStudyStepKindForCurrentCard() === 'type-word') return settings;
        return hiddenNewTabStudySentenceSettings(settings);
    }

    private activeStudyStepKindForCurrentCard(): string | null {
        const card = this.visibleWords[this.index];
        if (!card) return null;
        return this.studySessionForCard(card).activeStep.kind;
    }

    private async parseNewTabPromptSentence(prompt: HTMLElement, card: JPDBCard): Promise<void> {
        if (!this.shouldParseSentencePrompt()) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        prompt.dataset.newtabPromptParseRequest = requestId;
        const sentence = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
        if (!sentence) return;
        const sentenceText = this.newTabSentenceText(sentence);
        if (sentence && await this.parseNewTabSentenceElement(sentence, sentenceText, card, () => this.canApplyNewTabPromptParse(prompt, key, requestId))) return;
        await this.dependencies.parseContent?.(sentence, newTabShortParseOptions())?.catch(() => undefined);
        if (!this.canApplyNewTabPromptParse(prompt, key, requestId)) return;
        this.highlightNewTabParsedWords(sentence, card);
    }

    private canApplyNewTabPromptParse(prompt: HTMLElement, key: string, requestId: string): boolean {
        return prompt.isConnected
            && prompt.dataset.newtabPromptParseRequest === requestId
            && cardKey(this.visibleWords[this.index]) === key
            && this.state.route === 'study';
    }

    private async enrichWordPromptSentence(
        prompt: HTMLElement,
        card: JPDBCard,
        state: ReturnType<typeof primaryCardState>,
        currentSentence: string,
    ): Promise<void> {
        const settings = this.dependencies.getSettings();
        if (currentSentence || !settings.newTabFrontSentenceEnabled || settings.immersionKitEnabled) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        prompt.dataset.newtabSentenceRequest = requestId;
        const sentence = await this.loadFrontSentence(card);
        if (!sentence || !this.canApplyFrontSentence(prompt, key, requestId)) return;
        this.applyFrontSentence(prompt, card, state, sentence);
    }

    private applyFrontSentence(
        prompt: HTMLElement,
        card: JPDBCard,
        state: ReturnType<typeof primaryCardState>,
        sentence: string,
    ): void {
        const wrap = prompt.querySelector<HTMLElement>(':scope > .jpdb-reader-newtab-front');
        if (!wrap) {
            this.renderWordPromptContent(prompt, card, state, sentence);
            return;
        }
        prompt.classList.toggle('jpdb-reader-newtab-prompt-has-sentence', Boolean(sentence));
        this.updatePromptTermSentence(wrap, sentence || card.spelling);
        wrap.querySelectorAll<HTMLElement>(':scope > .jpdb-reader-newtab-sentence').forEach(node => node.remove());
        if (sentence) wrap.append(this.renderWordPromptSentenceNode(card, state, sentence));
        void this.parseNewTabPromptSentence(prompt, card);
    }

    private updatePromptTermSentence(wrap: HTMLElement, sentence: string): void {
        wrap.querySelectorAll<HTMLElement>(':scope .jpdb-reader-newtab-term .jpdb-reader-word')
            .forEach(word => { word.dataset.sentence = sentence; });
    }

    private canApplyFrontSentence(prompt: HTMLElement, key: string, requestId: string): boolean {
        return prompt.isConnected
            && prompt.dataset.newtabSentenceRequest === requestId
            && cardKey(this.visibleWords[this.index]) === key
            && this.state.route === 'study';
    }

    private shouldShowFrontSentence(): boolean {
        return this.dependencies.getSettings().newTabFrontSentenceEnabled;
    }

    private frontSentenceFromCard(card: JPDBCard): string {
        return this.shouldShowFrontSentence() ? normalizePromptContextSentence(card.sentence, card) : '';
    }

    // Recall availability keys off whether a real example sentence exists, NOT
    // the newTabFrontSentenceEnabled display toggle (that toggle only governs
    // the Word step's context sentence). Gating recall behind it silently
    // dropped the step for every card that carries a sentence.
    private recallSentenceFromCard(card: JPDBCard): string {
        return this.studySentenceOverrides.get(cardKey(card))
            ?? normalizePromptContextSentence(card.sentence, card);
    }

    private ensureNPlusOneStudySentence(card: JPDBCard): void {
        const key = cardKey(card);
        if (this.nPlusOneSentenceRequests.has(key)) return;
        this.nPlusOneSentenceRequests.add(key);
        const targetLanguage = activeLearningTargetLanguage();
        void this.selectNPlusOneStudySentence(card).then(sentence => {
            if (activeLearningTargetLanguage() !== targetLanguage) {
                this.nPlusOneSentenceRequests.delete(key);
                return;
            }
            if (!sentence || sentence === this.recallSentenceFromCard(card)) return;
            const root = this.currentRoot();
            const active = this.visibleWords[this.index];
            const isCurrent = Boolean(root && active && cardKey(active) === key);
            if (isCurrent) {
                // Never swap the sentence under the learner: a submitted
                // answer, un-submitted typed text, or an open reveal all pin
                // the displayed sentence — the override would otherwise be
                // graded against a sentence the learner never saw.
                const stepState = this.stepState(key);
                if (stepState?.recall?.answer || stepState?.type?.answer || this.state.revealAnswer) return;
                const typed = root!.querySelector<HTMLInputElement>('[data-newtab-type-input], [data-newtab-recall-input]');
                if (typed?.value) return;
            }
            this.studySentenceOverrides.set(key, sentence);
            if (isCurrent) this.renderWord(root!, active!);
        });
    }

    // Sentence provenance is strict: installed dictionaries first, then
    // Immersion Kit, then the card's trusted local sentence. N+1 scoring only
    // ranks candidates within the first source tier that can actually cloze the
    // review word, so a lower-priority source can never displace a dictionary
    // example merely because its token score is a little higher.
    private async selectNPlusOneStudySentence(card: JPDBCard): Promise<string> {
        const reading = newTabCardReading(card);
        const [localEntries, examples] = await Promise.all([
            usesJapaneseProviders()
                ? this.dependencies.loadCardRenderData?.(card).then(data => data.localEntries).catch(() => [] as YomitanTermEntry[])
                    ?? Promise.resolve([] as YomitanTermEntry[])
                : this.targetResources.loadLocalEntries(card),
            this.dependencies.getSettings().immersionKitEnabled
                ? this.loadImmersionExamples(card).catch(() => [] as ImmersionKitExample[])
                : Promise.resolve([] as ImmersionKitExample[]),
        ]);
        const tiers = studySentenceTiers(card, localEntries, examples.slice(0, 8));
        const tier = firstStudySentenceTier(tiers, sentence => buildNewTabRecallCloze(card, sentence, reading).hasCloze);
        const clozeable = tier?.sentences ?? [];
        if (clozeable.length <= 1) return clozeable[0] ?? '';
        const scored = await Promise.all(clozeable.map(async sentence => ({
            sentence,
            score: await this.nPlusOneSentenceScore(card, sentence),
        })));
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.sentence ?? '';
    }

    private async nPlusOneSentenceScore(card: JPDBCard, sentence: string): Promise<number> {
        const tokens = await this.parsedNewTabSentenceTokens(sentence).catch(() => [] as JPDBToken[]);
        const targetKey = cardKey(card);
        let known = 0;
        let fresh = 0;
        let total = 0;
        for (const token of tokens) {
            const tokenCard = token.card;
            if (!tokenCard?.spelling) continue;
            if (cardKey(tokenCard) === targetKey || tokenCard.spelling === card.spelling) continue;
            const state = primaryCardState(tokenCard.cardState);
            total += 1;
            if (state === 'new' || state === 'not-in-deck' || state === 'in-deck' || state === 'unparsed') fresh += 1;
            else known += 1;
        }
        if (!total) return sentence === normalizePromptContextSentence(card.sentence, card) ? 0.5 : 0;
        // Exactly one new word is the jpdb n+1 sweet spot; fully known is next
        // best; each further unknown drops the sentence hard.
        const noveltyScore = fresh === 1 ? 4 : fresh === 0 ? 3 : fresh === 2 ? 1 : 0;
        const knownRatio = known / total;
        const length = sentence.length;
        const lengthScore = length >= 8 && length <= 42 ? 1 : length < 8 ? 0.25 : 0.5;
        return noveltyScore * 10 + knownRatio * 5 + lengthScore;
    }

    private loadFrontSentence(card: JPDBCard): Promise<string> {
        const key = this.frontSentenceCacheKey(card);
        const existing = this.frontSentenceCache.get(key);
        if (existing) return existing;
        const promise = this.fetchFrontSentence(card).catch(() => '');
        this.frontSentenceCache.set(key, promise);
        return promise;
    }

    private async fetchFrontSentence(card: JPDBCard): Promise<string> {
        // Provider fidelity (study-hub parity SH-5): a JPDB-backed card fronts
        // JPDB's own example sentence — exactly what jpdb.io shows on its
        // review front. Immersion Kit is the superset fallback for cards the
        // provider gives no sentence, never a replacement.
        if (card.source === 'jpdb' && !isJitenSrsCard(card)) {
            const jpdbSentence = await this.loadJpdbFrontSentence(card);
            if (jpdbSentence) return jpdbSentence;
            return this.loadImmersionFrontSentence(card);
        }
        const immersionSentence = await this.loadImmersionFrontSentence(card);
        if (immersionSentence) return immersionSentence;
        return this.loadJpdbFrontSentence(card);
    }

    private async loadImmersionFrontSentence(card: JPDBCard): Promise<string> {
        if (!this.canLoadImmersionFrontSentence()) return '';
        const examples = await this.loadImmersionExamples(card);
        const example = examples[this.normalizedImmersionExampleIndex(cardKey(card), examples)] ?? examples[0];
        return normalizePromptContextSentence(example?.sentence, card);
    }

    private canLoadImmersionFrontSentence(): boolean {
        return this.dependencies.getSettings().immersionKitEnabled
            && typeof this.dependencies.immersionKit?.search === 'function';
    }

    private async loadJpdbFrontSentence(card: JPDBCard): Promise<string> {
        if (!usesJapaneseProviders()) return '';
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbDefinitionsEnabled || !hasJpdbApiCredential(settings) || !this.dependencies.jpdbVocabulary) return '';
        const info = await this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, newTabCardReading(card)).catch(() => null);
        return usesJapaneseProviders() ? jpdbExampleSentenceForPrompt(info, card) : '';
    }

    private frontSentenceCacheKey(card: JPDBCard): string {
        const settings = this.dependencies.getSettings();
        return JSON.stringify({
            card: cardKey(card),
            enabled: settings.newTabFrontSentenceEnabled,
            immersion: settings.immersionKitEnabled ? this.immersionCacheKey(card) : '',
            jpdbDefinitionsEnabled: settings.jpdbDefinitionsEnabled,
        });
    }

    private async renderImmersionExample(slots: NewTabStudySlots, card: JPDBCard): Promise<void> {
        const meaning = slots.meaning;
        if (!this.canRenderImmersionExample(meaning)) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        meaning.dataset.newtabImmersionRequest = requestId;
        const examples = await this.loadImmersionExamples(card);
        if (meaning.dataset.newtabImmersionRequest !== requestId) return;
        if (!this.canAppendImmersionExample(meaning, key, examples)) return;
        const index = this.normalizedImmersionExampleIndex(key, examples);
        const immersion = this.renderNewTabImmersionCard(card, examples, index);
        meaning.querySelectorAll(':scope > .jpdb-reader-newtab-immersion').forEach(element => element.remove());
        // Immersion Kit sits above the dictionaries regardless of which async
        // loader finishes first: the reveal reads example → sources.
        const dictionaries = meaning.querySelector(':scope > .jpdb-reader-newtab-reveal-dictionaries');
        if (dictionaries) dictionaries.before(immersion);
        else meaning.append(immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        await this.parseNewTabImmersionExample(immersion, card, key);
    }

    private canRenderImmersionExample(meaning: HTMLElement | null): meaning is HTMLElement {
        return this.state.revealAnswer
            && Boolean(meaning)
            && this.dependencies.getSettings().immersionKitEnabled;
    }

    private canAppendImmersionExample(meaning: HTMLElement, key: string, examples: ImmersionKitExample[]): boolean {
        return Boolean(examples.length)
            && cardKey(this.visibleWords[this.index]) === key
            && meaning.isConnected
            && this.isVocabularyStudyRoute()
            && this.state.revealAnswer;
    }

    private renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement {
        return this.renderNewTabImmersionCardVariant(card, examples[index], index, examples.length, 'word');
    }

    private renderNewTabImmersionCardVariant(
        card: JPDBCard,
        example: ImmersionKitExample,
        index: number,
        total: number,
        variant: 'word' | 'kanji',
    ): HTMLElement {
        const settings = this.dependencies.getSettings();
        const audioUrls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        const isKanji = variant === 'kanji';
        const node = el('div', isKanji
            ? {
                class: 'jpdb-reader-newtab-immersion jpdb-reader-newtab-kanji-immersion',
                dataset: { newtabKanjiImmersion: true, newtabKanji: card.spelling },
            }
            : { class: 'jpdb-reader-newtab-immersion' },
            this.renderNewTabImmersionToolbar(example, index, total, audioUrls.length > 0, isKanji ? { showSource: true } : {}),
            renderImmersionSearchLinks(card.spelling, settings.interfaceLanguage),
            this.renderNewTabImmersionExampleBody(card, example, settings, index, total, audioUrls),
        );
        if (!isKanji) this.highlightNewTabImmersionTarget(node, card);
        return node;
    }

    private async parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void> {
        const sentence = root.querySelector<HTMLElement>('[data-immersion-sentence-render]');
        const sentenceText = this.newTabSentenceText(sentence);
        if (sentence && await this.parseNewTabSentenceElement(sentence, sentenceText, card, () => this.canApplyNewTabImmersionParse(root, key))) return;
        await this.dependencies.parseContent?.(root, newTabShortParseOptions())?.catch(() => undefined);
        if (!this.canApplyNewTabImmersionParse(root, key)) return;
        this.highlightNewTabImmersionTarget(root, card);
    }

    private canApplyNewTabImmersionParse(root: HTMLElement, key: string): boolean {
        return root.isConnected
            && cardKey(this.visibleWords[this.index]) === key
            && this.isVocabularyStudyRoute()
            && this.state.revealAnswer;
    }

    private async parseNewTabSentenceElement(sentence: HTMLElement, sentenceText: string, card: JPDBCard, isCurrent: () => boolean): Promise<boolean> {
        const cached = this.cachedParsedNewTabSentenceTokens(sentenceText);
        if (cached) {
            if (isCurrent()) this.applyParsedNewTabSentenceElement(sentence, sentenceText, card, cached);
            return true;
        }
        if (!this.canParseNewTabSentence(sentenceText)) return false;
        const tokens = await this.parsedNewTabSentenceTokens(sentenceText).catch(() => []);
        if (isCurrent()) this.applyParsedNewTabSentenceElement(sentence, sentenceText, card, tokens);
        return true;
    }

    private applyParsedNewTabSentenceElement(sentence: HTMLElement, sentenceText: string, card: JPDBCard, tokens: JPDBToken[]): void {
        sentence.dataset.newtabSentenceText = sentenceText;
        setInnerHtml(sentence, renderNewTabSentenceHtml(sentenceText, card, this.studySentenceRenderSettings(), tokens));
        this.highlightNewTabParsedWords(sentence, card);
    }

    private newTabSentenceText(sentence: HTMLElement | null): string {
        return (sentence?.dataset.newtabSentenceText
            || sentence?.closest<HTMLElement>('[data-immersion-sentence]')?.dataset.immersionSentence
            || sentence?.textContent
            || '').trim();
    }

    private parsedNewTabSentenceTokens(sentence: string): Promise<JPDBToken[]> {
        const key = sentence.trim();
        if (!key || !this.canParseNewTabSentence(key)) return Promise.resolve([]);
        return loadCachedParsedTokens(
            this.parsedSentenceCache,
            key,
            NEW_TAB_PARSED_SENTENCE_CACHE_LIMIT,
            // includeLocalPitch is fallback-only in the parser; without it, keyed
            // parses left sentence words bare when the API had no pitch.
            () => this.dependencies.parser.parse([key], jpdbFirstParseOptions({ allowSegmentedFallback: true, includeLocalPitch: true })).then(([tokens]) => tokens ?? []),
            shouldCacheParsedNewTabSentenceTokens,
        );
    }

    private cachedParsedNewTabSentenceTokens(sentence: string): JPDBToken[] | undefined {
        return this.parsedSentenceCache.get(sentence.trim())?.tokens;
    }

    private canParseNewTabSentence(sentence: string): boolean {
        return Boolean(sentence.trim())
            && typeof this.dependencies.parser.canParse === 'function'
            && this.dependencies.parser.canParse()
            && typeof this.dependencies.parser.parse === 'function';
    }

    private highlightNewTabImmersionTarget(root: HTMLElement, card: JPDBCard): void {
        this.highlightNewTabParsedTarget(root, '[data-immersion-sentence-render]', card);
    }

    private highlightNewTabParsedTarget(root: HTMLElement, selector: string, card: JPDBCard): void {
        root.querySelectorAll<HTMLElement>(`${selector} .jpdb-reader-word`).forEach(word => {
            this.highlightNewTabParsedWord(word, card);
        });
    }

    private highlightNewTabParsedWords(root: HTMLElement, card: JPDBCard): void {
        root.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
            this.highlightNewTabParsedWord(word, card);
        });
    }

    private highlightNewTabParsedWord(word: HTMLElement, card: JPDBCard): void {
        const surface = word.textContent?.replace(/\s+/g, '') ?? '';
        if (isCardHighlightWord(word, card)) {
            word.classList.add('jpdb-reader-example-target');
            this.applyNewTabParsedTargetCardIdentity(word, card, surface);
        }
    }

    private applyNewTabParsedTargetCardIdentity(word: HTMLElement, card: JPDBCard, surface: string): void {
        const state = primaryCardState(card.cardState);
        const sourceClass = renderedWordSourceVisualClass(card);
        const pitchClass = newTabPitchClass(card);
        replaceRenderedWordStateAndPitchClasses(word, NEW_TAB_WORD_STATE_CLASSES, [
            `${sourceClass}-${state}`,
            `jpdb-pitch-${pitchClass}`,
        ]);
        bindRenderedWordCardIdentity(word, card, state);
        word.dataset.expression = card.spelling;
        word.dataset.reading = newTabCardReading(card);
        word.dataset.pitchClass = pitchClass;
        preserveRenderedWordSentence(word, [card.sentence, surface]);
        if (!this.state.revealAnswer) this.hidePromptPronunciation(word);
    }

    private renderNewTabImmersionToolbar(
        example: ImmersionKitExample,
        index: number,
        total: number,
        hasAudio: boolean,
        options: { showSource?: boolean } = {},
    ): HTMLElement {
        return renderImmersionExampleToolbar({
            example,
            index,
            total,
            hasAudio,
            language: this.language(),
            showSource: options.showSource,
        });
    }

    private renderNewTabImmersionExampleBody(
        card: JPDBCard,
        example: ImmersionKitExample,
        settings: ReaderSettings,
        index: number,
        total: number,
        audioUrls: string[],
    ): HTMLElement {
        const imageUrl = newTabImmersionImageUrl(example, settings, this.dependencies.immersionKit);
        const sentence = renderNewTabImmersionSentence(card, example, settings, this.cachedParsedNewTabSentenceTokens(example.sentence));
        if (imageUrl) sentence.classList.add('jpdb-subtitle-primary');
        return el('div', {
            class: `jpdb-reader-example-card ${imageUrl ? 'has-image' : ''}`,
            dataset: {
                immersionIndex: String(index),
                immersionTotal: String(total),
                immersionSentence: example.sentence,
                immersionSourceTitle: example.sourceTitle,
                immersionImageUrl: imageUrl,
                immersionAudioUrls: JSON.stringify(audioUrls),
            },
        },
            el('div', { class: 'jpdb-reader-example-body' },
                renderNewTabImmersionImage(imageUrl, sentence),
                imageUrl ? null : sentence,
                renderNewTabImmersionTranslation(example, settings),
            ),
        );
    }

    private performNewTabImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void {
        const current = this.visibleWords[this.index];
        if (!current) return;
        if (action === 'audio') {
            void this.playRenderedOrCurrentImmersionAudio(surface, current);
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        const key = cardKey(current);
        const cached = this.immersionCache.get(this.immersionCacheKey(current));
        void cached?.then(async examples => {
            if (!examples.length || cardKey(this.visibleWords[this.index]) !== key) return;
            const currentIndex = this.normalizedImmersionExampleIndex(key, examples);
            const nextIndex = nextImmersionExampleIndex(currentIndex, examples.length, action);
            this.immersionExampleIndex.set(key, nextIndex);
            const replaced = await this.replaceNewTabImmersionExample(root, current, examples, nextIndex);
            if (replaced && this.shouldAutoPlayNewTabImmersionNavigationAudio()) void this.playCurrentImmersionAudio(current);
        });
    }

    private performNewTabKanjiImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void {
        const kanji = surface.dataset.newtabKanji ?? '';
        if (!targetCanLookupCharacter(kanji)) return;
        const card = this.newTabKanjiImmersionCard(kanji);
        if (action === 'audio') {
            void this.playRenderedOrCurrentKanjiImmersionAudio(surface, kanji, card);
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        const key = this.newTabKanjiImmersionKey(kanji);
        void this.loadImmersionExamples(card).then(async examples => {
            if (!examples.length || !this.isCurrentRevealedKanji(kanji)) return;
            const currentIndex = this.normalizedImmersionExampleIndex(key, examples);
            const nextIndex = nextImmersionExampleIndex(currentIndex, examples.length, action);
            this.immersionExampleIndex.set(key, nextIndex);
            const replaced = await this.replaceNewTabKanjiImmersionExample(root, kanji, card, examples, nextIndex);
            if (replaced && this.shouldAutoPlayNewTabImmersionNavigationAudio()) void this.playCurrentKanjiImmersionAudio(kanji, card);
        });
    }

    private shouldAutoPlayNewTabImmersionNavigationAudio(): boolean {
        const settings = this.dependencies.getSettings();
        return settings.immersionKitEnabled
            && settings.immersionKitAutoPlayAudio
            && settings.audioEnabled
            && canAttemptAudiblePlayback(true);
    }

    private async replaceNewTabImmersionExample(root: HTMLElement, card: JPDBCard, examples: ImmersionKitExample[], index: number): Promise<boolean> {
        const slots = this.studySlots(root);
        const meaning = slots.meaning;
        const key = cardKey(card);
        if (!meaning || !this.canAppendImmersionExample(meaning, key, examples)) return false;
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        meaning.dataset.newtabImmersionRequest = requestId;
        const immersion = this.renderNewTabImmersionCard(card, examples, index);
        if (meaning.dataset.newtabImmersionRequest !== requestId) return false;
        if (!this.canAppendImmersionExample(meaning, key, examples)) return false;
        const existing = meaning.querySelector<HTMLElement>(':scope > .jpdb-reader-newtab-immersion');
        if (existing) existing.replaceWith(immersion);
        else meaning.append(immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        void this.parseNewTabImmersionExample(immersion, card, key);
        return true;
    }

    private async replaceNewTabKanjiImmersionExample(
        root: HTMLElement,
        kanji: string,
        card: JPDBCard,
        examples: ImmersionKitExample[],
        index: number,
    ): Promise<boolean> {
        const body = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
        if (!body || !this.canApplyNewTabKanjiImmersion(body, kanji)) return false;
        const requestId = `${kanji}:${performance.now()}:${Math.random()}`;
        body.dataset.newtabKanjiImmersionRequest = requestId;
        const immersion = this.renderNewTabKanjiImmersionCard(card, examples[index], index, examples.length);
        if (body.dataset.newtabKanjiImmersionRequest !== requestId || !this.canApplyNewTabKanjiImmersion(body, kanji)) return false;
        const existing = body.querySelector<HTMLElement>(':scope > [data-newtab-kanji-immersion]');
        if (existing) existing.replaceWith(immersion);
        else replaceChildrenWith(body, immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        void this.parseNewTabKanjiImmersionExample(immersion, card);
        return true;
    }

    private normalizedImmersionExampleIndex(key: string, examples: ImmersionKitExample[]): number {
        const index = this.immersionExampleIndex.get(key) ?? 0;
        if (index >= 0 && index < examples.length) return index;
        this.immersionExampleIndex.set(key, 0);
        return 0;
    }

    private loadNewTabImmersionImage(root: HTMLElement, example: ImmersionKitExample): void {
        const image = root.querySelector<HTMLImageElement>('.jpdb-reader-newtab-immersion [data-yomu-immersion-image-src]');
        if (!image) return;
        const urls = this.dependencies.immersionKit.mediaUrls(example, 'image');
        if (!urls.length) {
            this.hideNewTabImmersionImage(root, image);
            return;
        }
        let directIndex = Math.max(0, urls.indexOf(image.getAttribute('src') || image.dataset.yomuImmersionImageSrc || ''));
        const showNextDirectImage = () => {
            directIndex += 1;
            const nextUrl = urls[directIndex];
            if (!nextUrl) {
                this.hideNewTabImmersionImage(root, image);
                return;
            }
            if (image.isConnected) image.src = nextUrl;
        };
        image.addEventListener('error', showNextDirectImage);
        image.addEventListener('load', () => syncNewTabImmersionFrameSubtitleSize(root));
        const settings = this.dependencies.getSettings();
        void this.dependencies.immersionKit.fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage)
            .then(src => {
                if (!image.isConnected) return;
                image.removeEventListener('error', showNextDirectImage);
                image.src = src;
                syncNewTabImmersionFrameSubtitleSize(root);
            })
            .catch(() => undefined);
    }

    private hideNewTabImmersionImage(root: HTMLElement, image: HTMLImageElement): void {
        const media = image.closest('.jpdb-reader-example-media');
        const sentence = media?.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        if (sentence) {
            sentence.classList.remove('jpdb-subtitle-primary');
            media?.after(sentence);
        }
        media?.remove();
        root.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
        syncNewTabImmersionFrameSubtitleSize(root);
    }

    private async playCurrentImmersionAudio(card: JPDBCard): Promise<void> {
        const key = cardKey(card);
        await this.playNewTabImmersionAudio(card, key, () => this.isCurrentRevealedWordCard(key));
    }

    private async playCurrentKanjiImmersionAudio(kanji: string, card: JPDBCard): Promise<void> {
        await this.playNewTabImmersionAudio(card, this.newTabKanjiImmersionKey(kanji), () => this.isCurrentRevealedKanji(kanji));
    }

    private async playRenderedOrCurrentImmersionAudio(surface: HTMLElement, card: JPDBCard): Promise<void> {
        const key = cardKey(card);
        await this.playRenderedOrNewTabImmersionAudio(surface, card, key, () => this.isCurrentRevealedWordCard(key));
    }

    private async playRenderedOrCurrentKanjiImmersionAudio(surface: HTMLElement, kanji: string, card: JPDBCard): Promise<void> {
        await this.playRenderedOrNewTabImmersionAudio(surface, card, this.newTabKanjiImmersionKey(kanji), () => this.isCurrentRevealedKanji(kanji));
    }

    private async playRenderedOrNewTabImmersionAudio(surface: HTMLElement, card: JPDBCard, key: string, isCurrent: () => boolean): Promise<void> {
        if (!this.dependencies.getSettings().audioEnabled) return;
        const source = this.renderedNewTabImmersionAudioSource(surface);
        if (source) {
            await this.immersionAudioPlayer.playSource(source, isCurrent);
            return;
        }
        await this.playNewTabImmersionAudio(card, key, isCurrent);
    }

    private async playNewTabImmersionAudio(card: JPDBCard, key: string, isCurrent: () => boolean): Promise<void> {
        if (!this.dependencies.getSettings().audioEnabled) return;
        const examples = await this.loadImmersionExamples(card);
        if (!isCurrent()) return;
        const example = examples[this.normalizedImmersionExampleIndex(key, examples)];
        if (!example) return;
        const source = this.newTabImmersionAudioSource(example);
        if (!source) return;
        await this.immersionAudioPlayer.playSource(source, isCurrent);
    }

    private isCurrentRevealedWordCard(key: string): boolean {
        return this.isVocabularyStudyRoute()
            && this.state.revealAnswer
            && cardKey(this.visibleWords[this.index]) === key;
    }

    private newTabImmersionAudioSource(example: ImmersionKitExample): { urls: string[]; key: string } | null {
        const urls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        return this.newTabImmersionAudioSourceFromUrls(urls);
    }

    private newTabImmersionAudioSourceFromUrls(urls: string[]): { urls: string[]; key: string } | null {
        const candidates = uniqueStrings(urls);
        const key = candidates[0] ?? '';
        return key ? { urls: candidates, key } : null;
    }

    private renderedNewTabImmersionAudioSource(surface: HTMLElement): { urls: string[]; key: string } | null {
        const card = surface.classList.contains('jpdb-reader-example-card')
            ? surface
            : surface.querySelector<HTMLElement>('.jpdb-reader-example-card');
        const raw = card?.dataset.immersionAudioUrls;
        if (!raw) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            return this.newTabImmersionAudioSourceFromUrls(parsed.filter((value): value is string => typeof value === 'string'));
        } catch {
            return null;
        }
    }

    private loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> {
        const key = this.immersionCacheKey(card);
        const existing = this.immersionCache.get(key);
        if (existing) return existing;
        const settings = this.dependencies.getSettings();
        const promise = promiseWithTimeout(
            this.fetchNewTabImmersionExamples(card),
            settings.audioTimeoutMs + NEW_TAB_IMMERSION_LOAD_TIMEOUT_GRACE_MS,
            'Immersion Kit examples timed out.',
        ).catch(() => []);
        this.immersionCache.set(key, promise);
        return promise;
    }

    private async fetchNewTabImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> {
        const exactQuery = card.spelling.trim();
        const exactExamples = await this.searchNewTabImmersionQuery(exactQuery);
        if (exactExamples.length) return exactExamples;

        const cheapFallback = await this.searchFirstNewTabImmersionQuery(this.cheapNewTabImmersionFallbackQueries(card, exactQuery));
        if (cheapFallback.length) return cheapFallback;

        return this.searchFirstNewTabImmersionQuery(await this.expensiveNewTabImmersionFallbackQueries(card, exactQuery));
    }

    private async searchFirstNewTabImmersionQuery(queries: string[]): Promise<ImmersionKitExample[]> {
        for (const query of queries) {
            const examples = await this.searchNewTabImmersionQuery(query);
            if (examples.length) return examples;
        }
        return [];
    }

    private searchNewTabImmersionQuery(query: string): Promise<ImmersionKitExample[]> {
        if (!query) return Promise.resolve([]);
        const settings = this.dependencies.getSettings();
        return this.dependencies.immersionKit.search(query, settings, this.newTabImmersionSearchOptions(settings))
            .then(examples => accurateNewTabImmersionExamples(query, examples))
            .catch(error => {
                if (isImmersionKitRateLimitError(error)) throw error;
                return [];
            });
    }

    private newTabImmersionSearchOptions(settings: ReaderSettings): ImmersionKitSearchOptions {
        const resultLimit = this.newTabImmersionResultLimit(settings);
        return {
            requestLimit: NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT,
            resultLimit,
            fastFirst: true,
        };
    }

    private newTabImmersionResultLimit(settings: ReaderSettings): number {
        return settings.immersionKitLimitEnabled
            ? settings.immersionKitLimit
            : NEW_TAB_IMMERSION_EXAMPLE_LIMIT;
    }

    private cheapNewTabImmersionFallbackQueries(card: JPDBCard, exactQuery: string): string[] {
        const candidates: string[] = [];
        this.addNewTabImmersionFallbackQuery(candidates, newTabCardOptionalReading(card), exactQuery);
        this.addNewTabImmersionFallbackQueries(candidates, card.fallbackLookupTerms ?? [], exactQuery);
        this.addNewTabImmersionFallbackQueries(candidates, immersionFallbackFragments(card.spelling), exactQuery);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private async expensiveNewTabImmersionFallbackQueries(card: JPDBCard, exactQuery: string): Promise<string[]> {
        const candidates: string[] = [];
        await this.addNewTabParsedImmersionFallbackQueries(candidates, card, exactQuery);
        await this.addNewTabJpdbImmersionFallbackQueries(candidates, card, exactQuery);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private prefetchNearbyImmersionExamples(card: JPDBCard, generation: number): void {
        if (!this.shouldPrefetchNewTabImmersion()) return;
        this.prefetchNewTabImmersionCard(card, { generation, current: true });
        this.prefetchNearbyCards(card, nearby => {
            void this.waitForIdle().then(() => {
                if (!this.isCurrentImmersionPrefetchGeneration(generation)) return;
                this.prefetchNewTabImmersionCard(nearby, { generation, current: false });
            });
        });
    }

    private prefetchNearbyCards(card: JPDBCard, prefetch: (nearby: JPDBCard) => void): void {
        for (let offset = 1; offset <= NEW_TAB_IMMERSION_PREFETCH_LOOKAHEAD; offset++) {
            const nearby = this.visibleWords[(this.index + offset) % this.visibleWords.length];
            if (!nearby || cardKey(nearby) === cardKey(card)) continue;
            prefetch(nearby);
        }
    }

    private shouldPrefetchNewTabImmersion(): boolean {
        return this.isVocabularyStudyRoute()
            && this.visibleWords.length > 0
            && this.dependencies.getSettings().immersionKitEnabled
            && typeof this.dependencies.immersionKit?.search === 'function';
    }

    private prefetchNewTabImmersionCard(card: JPDBCard, context: { generation: number; current: boolean }): void {
        void this.loadImmersionExamples(card)
            .then(examples => {
                if (!this.isCurrentImmersionPrefetchGeneration(context.generation)) return;
                this.prefetchNewTabImmersionSentences(card, examples, context.current);
                const example = examples[this.normalizedImmersionExampleIndex(cardKey(card), examples)] ?? examples[0];
                if (!example) return;
                if (context.current) this.prefetchNewTabImmersionMedia(example);
            })
            .catch(() => undefined);
    }

    private isCurrentImmersionPrefetchGeneration(generation: number): boolean {
        return generation === this.immersionPrefetchGeneration
            && this.isVocabularyStudyRoute();
    }

    private prefetchNewTabParsedSentence(sentence: string): void {
        const text = sentence.trim();
        if (!text) return;
        void this.parsedNewTabSentenceTokens(text).catch(() => undefined);
    }

    private prefetchNewTabImmersionSentences(card: JPDBCard, examples: ImmersionKitExample[], includeAdjacent: boolean): void {
        if (!examples.length) return;
        const key = cardKey(card);
        const index = this.normalizedImmersionExampleIndex(key, examples);
        const indexes = includeAdjacent && examples.length > 1
            ? [index, (index + 1) % examples.length]
            : [index];
        uniqueNumbers(indexes).forEach(exampleIndex => {
            const sentence = normalizePromptContextSentence(examples[exampleIndex]?.sentence, card);
            if (sentence) this.prefetchNewTabParsedSentence(sentence);
        });
    }

    private prefetchNewTabImmersionMedia(example: ImmersionKitExample): void {
        const settings = this.dependencies.getSettings();
        const imageUrls = settings.immersionKitShowImages ? this.dependencies.immersionKit.mediaUrls(example, 'image') : [];
        if (imageUrls.length) {
            void this.dependencies.immersionKit.fetchBlobUrl(imageUrls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage)
                .catch(() => undefined);
        }
        const audioUrls = this.dependencies.immersionKit.mediaUrls(example, 'sound');
        if (audioUrls.length) {
            void this.dependencies.immersionKit.fetchBlobUrl(audioUrls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage)
                .catch(() => undefined);
        }
    }

    private async addNewTabJpdbImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        if (!usesJapaneseProviders()) return;
        const settings = this.dependencies.getSettings();
        const jpdbInfo = settings.jpdbDefinitionsEnabled && hasJpdbApiCredential(settings) && this.dependencies.jpdbVocabulary
            ? await this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, newTabCardReading(card)).catch(() => null)
            : null;
        if (!usesJapaneseProviders()) return;
        this.addNewTabImmersionFallbackQueries(
            candidates,
            (jpdbInfo?.compounds ?? []).flatMap(compound => [compound.term, compound.reading]),
            exactQuery,
        );
    }

    private async addNewTabParsedImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        if (typeof this.dependencies.parser.canParse !== 'function' || !this.dependencies.parser.canParse()) return;
        const targetLanguage = activeLearningTargetLanguage();
        const [tokens] = await this.dependencies.parser.parse([card.spelling], {
            jpdbTimeoutMs: NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS,
            allowJpdbTimeoutFallback: true,
            allowSegmentedFallback: true,
            skipApi: !usesJapaneseProviders(),
        }).catch(() => [[]]);
        if (activeLearningTargetLanguage() !== targetLanguage) return;
        for (const token of tokens ?? []) {
            this.addNewTabImmersionFallbackQuery(candidates, token.card.spelling, exactQuery);
            this.addNewTabImmersionFallbackQuery(candidates, card.spelling.slice(token.start, token.end), exactQuery);
            this.addNewTabImmersionFallbackQuery(candidates, newTabCardOptionalReading(token.card), exactQuery);
        }
    }

    private addNewTabImmersionFallbackQueries(candidates: string[], values: Iterable<string>, exactQuery: string): void {
        for (const value of values) this.addNewTabImmersionFallbackQuery(candidates, value, exactQuery);
    }

    private addNewTabImmersionFallbackQuery(candidates: string[], value: string, exactQuery: string): void {
        const query = value.trim();
        if (isUsefulImmersionFallbackQuery(query, exactQuery)) candidates.push(query);
    }

    private immersionCacheKey(card: JPDBCard): string {
        const settings = this.dependencies.getSettings();
        return JSON.stringify({
            query: card.spelling.trim(),
            fallback: card.fallbackLookupTerms ?? [],
            source: settings.immersionKitExampleSource,
            nadeshikoKey: Boolean(settings.nadeshikoApiKey.trim()),
            requestLimit: NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT,
            resultLimit: this.newTabImmersionResultLimit(settings),
            limitEnabled: settings.immersionKitLimitEnabled,
            limit: settings.immersionKitLimit,
            min: settings.immersionKitMinLength,
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            sort: settings.immersionKitSort,
            exact: settings.immersionKitExactMatch,
            jpdbDefinitionsEnabled: settings.jpdbDefinitionsEnabled,
        });
    }

    private kanjiPromptKeywords(card: JPDBCard, kanji: string): KanjiPromptKeyword[] {
        const cachedKeyword = this.keywordCache.get(kanji);
        if (cachedKeyword) return [{ source: this.kanjiPromptCardKeywordSource(card), text: cachedKeyword }];
        return this.dedupeKanjiPromptKeywords([
            { source: this.kanjiPromptCardKeywordSource(card), text: card.kanjiKeyword ?? '' },
        ]);
    }

    private kanjiPromptKeywordsFromDetails(
        card: JPDBCard,
        details: KanjiDetailBundle,
    ): KanjiPromptKeyword[] {
        return this.dedupeKanjiPromptKeywords([
            { source: 'Jiten', text: details.jiten?.meanings[0] ?? '' },
            { source: 'JPDB', text: details.jpdb?.keyword ?? '' },
            { source: 'RTK', text: details.rtk?.keyword ?? '' },
            { source: this.kanjiPromptCardKeywordSource(card), text: card.kanjiKeyword ?? '' },
            ...details.local.flatMap(entry => entry.meanings.slice(0, 3).map(text => ({ source: uiText(this.language(), 'dict'), text }))),
        ]);
    }

    private kanjiPromptCardKeywordSource(card: JPDBCard): string {
        return card.source === 'jpdb' || card.reviewSource === 'jpdb-live' || card.reviewSource === 'jpdb-api'
            ? 'JPDB'
            : this.text('local');
    }

    private dedupeKanjiPromptKeywords(keywords: KanjiPromptKeyword[]): KanjiPromptKeyword[] {
        const seen = new Set<string>();
        const unique: KanjiPromptKeyword[] = [];
        for (const keyword of keywords) {
            const text = keyword.text.trim();
            if (!text) continue;
            const key = text.toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({ ...keyword, text });
            if (unique.length >= NEW_TAB_KANJI_FRONT_KEYWORD_LIMIT) break;
        }
        return unique;
    }

    private async enrichKanjiCard(slots: NewTabStudySlots, card: JPDBCard, kanji: string): Promise<void> {
        if (!targetCanLookupCharacter(kanji)) return;
        const details = await this.loadKanjiDetails(kanji);
        if (!this.canApplyKanjiEnrichment(slots, card, kanji)) return;

        this.applyEnrichedKanjiKeyword(slots, card, kanji, details);
        this.applyEnrichedKanjiSvg(slots.answer, this.studyStepIdForKanji(card, kanji), details.vg?.svg);
        this.applyEnrichedKanjiMeaning(slots, card, kanji, details);
    }

    private canApplyKanjiEnrichment(slots: NewTabStudySlots, card: JPDBCard, kanji?: string): boolean {
        if (kanji && !targetCanLookupCharacter(kanji)) return false;
        if (!usesJapaneseCharacterStudy()) return false;
        const current = this.visibleWords[this.index];
        if (!current || cardKey(current) !== cardKey(card)) return false;
        const session = this.studySessionForCard(current, this.shouldRenderCardAsKanji(current));
        if (!this.studyStepRendersKanji(session)) return false;
        // A late-resolving enrichment for a PREVIOUS kanji step must not
        // overwrite the trace/prompt after advancing to the next kanji.
        if (this.isStaleKanjiStepEnrichment(session, kanji)) return false;
        const study = slots.prompt?.closest<HTMLElement>('[data-newtab-study]')
            ?? slots.answer?.closest<HTMLElement>('[data-newtab-study]');
        if (!study) return true;
        return study.dataset.newtabCard === this.renderedStudyCardIdentity(card);
    }

    private isStaleKanjiStepEnrichment(session: NewTabStudySession, kanji?: string): boolean {
        return Boolean(kanji
            && session.activeStep.kind === 'kanji-doodle'
            && session.activeStep.kanji
            && session.activeStep.kanji !== kanji);
    }

    private applyEnrichedKanjiKeyword(slots: NewTabStudySlots, card: JPDBCard, kanji: string, details: KanjiDetailBundle): void {
        const keyword = this.keywordFromDetails(card, details.jpdb, details.jiten, details.rtk);
        if (keyword) this.keywordCache.set(kanji, keyword);
        if (slots.prompt && !this.state.revealAnswer) {
            replaceChildrenWith(slots.prompt, this.renderKanjiPromptKeywords(
                this.kanjiPromptKeywordsFromDetails(card, details),
                card,
                kanji,
            ));
        }
    }

    private applyEnrichedKanjiSvg(answer: HTMLElement | null, studyStepId: NewTabStudyStepId, svgMarkup: string | undefined): void {
        if (!answer || !svgMarkup) return;
        const mounts = this.enrichedKanjiSvgMounts(answer);
        this.applyRevealedKanjiSvg(mounts.svg, svgMarkup);
        const renderedStepId = mounts.ghost?.closest<HTMLElement>('.jpdb-reader-doodle-stage')?.dataset.studyDoodleStep;
        if (renderedStepId && renderedStepId !== studyStepId) return;
        this.applyDoodleGhostSvg(mounts.ghost, svgMarkup);
    }

    private enrichedKanjiSvgMounts(answer: HTMLElement): { svg: HTMLElement | null; ghost: HTMLElement | null } {
        return {
            svg: answer.querySelector<HTMLElement>('[data-newtab-kanji-svg]'),
            ghost: answer.querySelector<HTMLElement>('[data-newtab-doodle-ghost]'),
        };
    }

    private applyRevealedKanjiSvg(svg: HTMLElement | null, svgMarkup: string): void {
        if (this.state.revealAnswer && svg) setInnerHtml(svg, svgMarkup);
    }

    private applyDoodleGhostSvg(ghost: HTMLElement | null, svgMarkup: string): void {
        if (ghost) setInnerHtml(ghost, svgMarkup);
    }

    private applyEnrichedKanjiMeaning(
        slots: NewTabStudySlots,
        card: JPDBCard,
        kanji: string,
        details: KanjiDetailBundle,
    ): void {
        if (!this.state.revealAnswer || !slots.meaning) return;
        replaceChildrenWith(slots.meaning, this.renderKanjiDetails(card, kanji, details.jpdb, details.jiten, details.rtk, details.vg, details.local, details.sourceInfo ?? null));
        this.renderNewTabKanjiImmersion(slots.meaning, kanji);
        void this.dependencies.parseContent?.(slots.meaning);
    }

    private renderNewTabKanjiImmersionPlaceholder(settings: ReaderSettings): HTMLElement | null {
        if (!usesJapaneseCharacterStudy() || !settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return null;
        const sourceStateKey = kanjiSourceStateKey(IMMERSION_KIT_SOURCE_ID);
        const isOpen = this.isSourceOpen(sourceStateKey, false);
        return el('div', { dataset: { newtabKanjiImmersionMount: true } },
            el('details', {
                class: 'jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion',
                open: isOpen,
                dataset: {
                    sourceStateKey,
                    sourceInitialOpen: String(isOpen),
                    newtabKanjiImmersionDetails: true,
                },
            },
            el('summary', { class: 'jpdb-reader-local-title', dataset: { jpdbReaderSurfaceIgnore: true } }, uiText(settings.interfaceLanguage, 'immersionKit')),
            el('div', { class: 'jpdb-reader-help', dataset: { newtabKanjiImmersionBody: true } }, uiText(settings.interfaceLanguage, 'loadingExamples'))),
        );
    }

    private renderNewTabKanjiImmersion(root: HTMLElement, kanji: string): void {
        if (!targetCanLookupCharacter(kanji)) return;
        const target = captureActiveTarget();
        const isCurrentTarget = () => isCurrentActiveTarget(target);
        const settings = this.dependencies.getSettings();
        const mount = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-mount]');
        const details = mount?.querySelector<HTMLDetailsElement>('[data-newtab-kanji-immersion-details]');
        const body = mount?.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
        if (!mount || !details || !body || !settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return;

        const card = this.newTabKanjiImmersionCard(kanji, target.target);
        const key = this.newTabKanjiImmersionKey(kanji);
        let started = false;
        const load = () => {
            if (!isCurrentTarget() || !targetCanLookupCharacter(kanji) || !details.open || started || !mount.isConnected || !body.isConnected) return;
            started = true;
            void this.loadImmersionExamples(card).then(async examples => {
                if (!isCurrentTarget() || !targetCanLookupCharacter(kanji) || !mount.isConnected || !body.isConnected) return;
                const index = this.normalizedImmersionExampleIndex(key, examples);
                const example = examples[index];
                if (!example) {
                    replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'noImmersionExamplesCompact')));
                    details.dataset.immersionEmpty = 'true';
                    return;
                }
                const immersion = this.renderNewTabKanjiImmersionCard(card, example, index, examples.length);
                replaceChildrenWith(body, immersion);
                this.loadNewTabImmersionImage(immersion, example);
                await this.parseNewTabKanjiImmersionExample(immersion, card);
            }).catch(() => {
                if (isCurrentTarget() && body.isConnected) replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'noImmersionExamplesCompact')));
            });
        };
        details.addEventListener('toggle', load);
        load();
    }

    private newTabKanjiImmersionCard(kanji: string, target = activeLearningTarget()): JPDBCard {
        return this.dependencies.parser.fallbackCardFromText?.(kanji, target) ?? fallbackSearchKanjiCard(kanji);
    }

    private newTabKanjiImmersionKey(kanji: string): string {
        return `kanji:${kanji}`;
    }

    private isCurrentRevealedKanji(kanji: string): boolean {
        if (!targetCanLookupCharacter(kanji)) return false;
        const current = this.visibleWords[this.index];
        if (!current) return false;
        const currentKanji = kanjiCharacters(current.spelling)[0] ?? current.spelling[0] ?? '';
        return this.wordSessionRendersKanji()
            && this.state.revealAnswer
            && currentKanji === kanji;
    }

    private canApplyNewTabKanjiImmersion(body: HTMLElement, kanji: string): boolean {
        return body.isConnected && this.isCurrentRevealedKanji(kanji);
    }

    private async parseNewTabKanjiImmersionExample(immersion: HTMLElement, card: JPDBCard): Promise<void> {
        await this.dependencies.parseContent?.(immersion, newTabShortParseOptions());
        this.highlightNewTabParsedTarget(immersion, '[data-immersion-sentence-render]', card);
    }

    private renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement {
        return this.renderNewTabImmersionCardVariant(card, example, index, total, 'kanji');
    }

    private renderKanjiDetails(
        card: JPDBCard,
        kanji: string,
        info: JpdbKanjiInfo | null,
        jitenInfo: JitenKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        sourceInfo: KanjiSourceInfo | null,
    ): HTMLElement {
        const settings = this.dependencies.getSettings();
        const fullInfo = info ? normalizeJpdbKanjiInfo(info) : null;
        const localMeanings = uniqueStrings(localEntries.flatMap(entry => entry.meanings)).slice(0, 6);
        const localReadings = uniqueStrings(localEntries.flatMap(entry => [...entry.onyomi, ...entry.kunyomi])).slice(0, 8);
        const readings = jitenInfo ? jitenKanjiReadingRows(jitenInfo) : newTabKanjiReadings(fullInfo, localReadings);
        const facts = jitenInfo ? jitenKanjiFactRows(jitenInfo, settings.interfaceLanguage) : this.newTabKanjiFacts(card, fullInfo, rtk, localMeanings);
        const context: NewTabKanjiSourceRenderContext = {
            card,
            kanji,
            facts,
            readings,
            localMeanings,
            fullInfo,
            jitenInfo,
            rtk,
            vg,
            sourceInfo,
            localEntries,
            settings,
            excludeFactLabels: new Set(facts.map(([label]) => label)),
        };
        const wrap = el('div', { class: 'jpdb-reader-newtab-kanji-details' },
            el('div', { class: 'jpdb-reader-newtab-kanji-keywords' }),
            ...this.renderNewTabKanjiSourceSections(context),
            this.renderKanjiMiningControls(fullInfo),
        );
        const keywordMount = wrap.querySelector<HTMLElement>('.jpdb-reader-newtab-kanji-keywords');
        if (keywordMount) {
            const displayedKeyword = jitenInfo?.meanings[0] ?? this.newTabKanjiDisplayedKeyword(facts, settings.interfaceLanguage);
            const keywordLine = this.renderNewTabKanjiKeywordLine(
                { text: jitenInfo?.meanings[0] ?? fullInfo?.keyword, label: jitenInfo ? 'Jiten' : 'JPDB', canonical: true },
                rtk,
                localEntries,
                displayedKeyword,
                settings.interfaceLanguage,
                sourceInfo,
            );
            if (keywordLine) setInnerHtml(keywordMount, keywordLine);
            else keywordMount.remove();
        }
        this.dependencies.installDictionarySourceTracking?.(wrap);
        return wrap;
    }

    private renderNewTabKanjiSourceSections(context: NewTabKanjiSourceRenderContext): HTMLElement[] {
        return orderedKanjiSourceIds(context.settings).flatMap(sourceId => {
            if (sourceId === KANJI_STROKE_SOURCE_ID) return [];
            const section = this.renderNewTabKanjiSourceSection(sourceId, context);
            return section ? [section] : [];
        });
    }

    private renderNewTabKanjiSourceSection(
        sourceId: string,
        context: NewTabKanjiSourceRenderContext,
    ): HTMLElement | null {
        const knownSection = this.renderKnownNewTabKanjiSourceSection(sourceId, context);
        if (knownSection !== undefined) return knownSection;
        return this.renderNewTabKanjiDictionarySource(sourceId, context.localEntries);
    }

    private renderKnownNewTabKanjiSourceSection(
        sourceId: string,
        context: NewTabKanjiSourceRenderContext,
    ): HTMLElement | null | undefined {
        const primarySection = this.renderPrimaryNewTabKanjiSourceSection(sourceId, context);
        if (primarySection !== undefined) return primarySection;
        return this.renderSupplementalNewTabKanjiSourceSection(sourceId, context);
    }

    private renderPrimaryNewTabKanjiSourceSection(
        sourceId: string,
        context: NewTabKanjiSourceRenderContext,
    ): HTMLElement | null | undefined {
        if (sourceId === KANJI_JPDB_SOURCE_ID) {
            if (context.jitenInfo) {
                return htmlToFirstElement(renderJitenKanjiInfoWithAttributes(
                    context.jitenInfo,
                    context.settings.interfaceLanguage,
                    (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded),
                    this.kanjiFactSourceTitle('jiten'),
                ));
            }
            return context.fullInfo ? renderNewTabKanjiInfoSection(context.card, context.facts, context.readings, context.localMeanings, context.fullInfo, key => this.sourceAttributes(key), this.kanjiFactSourceTitle('jpdb'), context.settings.interfaceLanguage) : null;
        }
        if (sourceId === KANJI_RTK_SOURCE_ID) return this.renderNewTabRtkSection(context.rtk, context.fullInfo, context.localEntries, context.settings);
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return this.renderNewTabKanjiOriginGraph(context.kanji, context.fullInfo, context.rtk, context.vg, context.localEntries, context.sourceInfo, context.settings, context.excludeFactLabels);
        return undefined;
    }

    private renderSupplementalNewTabKanjiSourceSection(
        sourceId: string,
        context: NewTabKanjiSourceRenderContext,
    ): HTMLElement | null | undefined {
        if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderNewTabKanjiImmersionPlaceholder(context.settings);
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return this.renderNewTabKanjiDictionarySection(context.localEntries, sourceId, this.kanjiSourceTitle(sourceId));
        return undefined;
    }

    private renderNewTabKanjiDictionarySource(sourceId: string, localEntries: YomitanKanjiEntry[]): HTMLElement | null {
        const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
        if (!dictionaryName) return null;
        return this.renderNewTabKanjiDictionarySection(
            localEntries.filter(entry => entry.dictionary === dictionaryName),
            sourceId,
            this.dictionaryLabel(dictionaryName),
        );
    }

    private renderNewTabRtkSection(
        rtk: RtkInfo | null,
        fullInfo: JpdbKanjiInfo | null,
        localEntries: YomitanKanjiEntry[],
        settings: ReaderSettings,
    ): HTMLElement | null {
        if (!settings.rtkEnabled || !rtk) return null;
        const componentSummaries = buildRtkComponentSummaries(rtk, fullInfo, localEntries);
        const sourceStateKey = kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
        const section = htmlToFirstElement(renderRtkInfo(rtk, componentSummaries, settings.interfaceLanguage, this.isSourceOpen(sourceStateKey), sourceStateKey));
        section?.classList.add('jpdb-reader-newtab-rtk-source');
        return section;
    }

    private renderNewTabKanjiDictionarySection(entries: YomitanKanjiEntry[], sourceId: string, title: string): HTMLElement | null {
        return htmlToFirstElement(renderKanjiDefinitions(
            entries,
            (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded),
            name => this.dictionaryLabel(name),
            sourceId,
            title,
        ));
    }

    private renderNewTabKanjiOriginGraph(
        kanji: string,
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        sourceInfo: KanjiSourceInfo | null,
        settings: ReaderSettings,
        excludeFactLabels: Set<string> = new Set(),
    ): HTMLElement | null {
        if (!settings.kanjiOriginsEnabled || !settings.kanjiOriginGraphEnabled) return null;
        const factsForOrigins = buildKanjiFacts(kanji, fullInfo, rtk, settings.kanjivgEnabled ? vg : null, localEntries, sourceInfo);
        const graph = buildKanjiOriginGraph(kanji, fullInfo, rtk, localEntries, sourceInfo, vg);
        if (!graph) return null;
        const section = htmlToFirstElement(renderKanjiOrigins(
            factsForOrigins,
            graph,
            sourceInfo,
            settings,
            settings.interfaceLanguage,
            this.isSourceOpen(kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID)),
            kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID),
            excludeFactLabels,
            this.kanjiSourceTitle(KANJI_ORIGINS_SOURCE_ID),
        ));
        if (!section) return null;
        section.classList.add('jpdb-reader-newtab-origin-graph');
        installOriginGraphInteractions(section);
        return section;
    }

    private newTabKanjiFacts(card: JPDBCard, fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null, localMeanings: string[]): [string, string][] {
        const language = this.language();
        return compactFacts([
            fact(uiText(language, 'factKeyword'), newTabKanjiKeyword(card, fullInfo, rtk, localMeanings)),
            fact(uiText(language, 'factType'), fullInfo?.type),
            fact(uiText(language, 'factFrequency'), fullInfo?.frequency),
            fact(newTabText(language, 'factWordFrequency'), card.frequencyRank ? `#${card.frequencyRank}` : ''),
            fact('Kanken', fullInfo?.kanken),
            fact('Heisig', heisigFact(fullInfo, rtk)),
            fact(uiText(language, 'factOldForms'), oldFormsFact(fullInfo)),
        ]);
    }

    private newTabKanjiDisplayedKeyword(facts: [string, string][], language: ReaderSettings['interfaceLanguage']): string {
        const keywordLabel = uiText(language, 'factKeyword');
        return facts.find(([label]) => label === keywordLabel)?.[1] ?? '';
    }

    private renderNewTabKanjiKeywordLine(
        primary: KanjiKeywordSource,
        rtk: RtkInfo | null,
        localEntries: YomitanKanjiEntry[],
        displayedKeyword: string,
        language: ReaderSettings['interfaceLanguage'],
        sourceInfo: KanjiSourceInfo | null,
    ): string {
        const keywordKey = (text: string | undefined) => text?.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en') ?? '';
        const displayedKey = keywordKey(displayedKeyword);
        const sources = [
            primary,
            { text: rtk?.keyword, label: 'RTK' },
            { text: sourceInfo?.kanjiAliveKeyword, label: 'Kanji Alive' },
            ...localEntries.flatMap(entry => entry.meanings).filter(Boolean).slice(0, 3).map(text => ({ text, label: uiText(language, 'dict') })),
        ].filter(source => keywordKey(source.text) !== displayedKey);
        return sources.some(source => source.text?.trim()) ? renderKanjiKeywordChips(sources, language) : '';
    }

    private sourceAttributes(sourceStateKey: string, initiallyExpanded = true): string {
        return this.dependencies.dictionarySourceAttributes?.(sourceStateKey, initiallyExpanded)
            ?? newTabKanjiSourceAttrs(sourceStateKey, initiallyExpanded);
    }

    private isSourceOpen(sourceStateKey: string, initiallyExpanded = true): boolean {
        return this.dependencies.isDictionarySourceOpen?.(sourceStateKey, initiallyExpanded) ?? initiallyExpanded;
    }

    private dictionaryLabel(name: string): string {
        return this.dependencies.getSettings().dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private kanjiSourceTitle(sourceId: string): string {
        return newTabKanjiSourceTitle(this.dependencies.getSettings(), sourceId);
    }

    private kanjiFactSourceTitle(source: 'jpdb' | 'jiten'): string {
        const sourceId = source === 'jpdb' ? JPDB_DEFINITION_SOURCE_ID : JITEN_DEFINITION_SOURCE_ID;
        return definitionSourceLabel(this.dependencies.getSettings(), sourceId, kanjiFactProviderTitle(source));
    }

    private renderKanjiMiningControls(info: JpdbKanjiInfo | null): HTMLElement | null {
        const actions = visibleJpdbKanjiActions(info);
        if (!actions.length) return null;
        return el('div', { class: 'jpdb-reader-newtab-kanji-mining', role: 'group', 'aria-label': this.text('miningActions') },
            actions.map(action => this.renderKanjiMiningAction(action)),
        );
    }

    private renderKanjiMiningAction(action: ReturnType<typeof visibleJpdbKanjiActions>[number]): HTMLButtonElement {
        const button = el('button', {
            type: 'button',
            class: `jpdb-reader-newtab-mini-action ${jpdbKanjiActionClass(action)}`,
            dataset: { newtabAction: newTabAction('jpdb-kanji-action'), kanjiActionId: action.id },
            title: action.label,
        }, action.label) as HTMLButtonElement;
        bindPrivateCommandCapability(button, { kind: 'jpdb-kanji-action', actionId: action.id });
        return button;
    }

    private loadKanjiDetails(kanji: string): Promise<KanjiDetailBundle> {
        return this.kanjiDetailSource.load(kanji);
    }

    private isJitenApiActive(settings: ReaderSettings): boolean {
        // UT-61: Jiten features are active whenever a Jiten key exists,
        // regardless of a coexisting JPDB key.
        return hasJitenApiCredential(settings);
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return waitForBrowserIdle(timeoutMs);
    }

    private keywordFromDetails(card: JPDBCard, jpdb: JpdbKanjiInfo | null, jiten: JitenKanjiInfo | null, rtk: RtkInfo | null): string {
        if (this.isJitenApiActive(this.dependencies.getSettings()) && jiten?.meanings[0]) return jiten.meanings[0];
        const source = this.dependencies.getSettings().newTabKanjiKeywordSource;
        return firstTruthy(keywordCandidates(card, jpdb, rtk, source));
    }

    private async assessDoodle(slots: NewTabStudySlots, card: JPDBCard, kanji: string, strokes: Parameters<typeof assessKanjiStrokes>[0]): Promise<void> {
        if (!targetCanLookupCharacter(kanji)) return;
        const settings = this.dependencies.getSettings();
        this.captureDoodlePreview(slots, card);
        if (!settings.newTabKanjiAutogradeEnabled) return;
        const details = await this.loadKanjiDetails(kanji);
        if (!targetCanLookupCharacter(kanji) || !this.canApplyKanjiEnrichment(slots, card, kanji)) return;
        const expectedStrokes = details.vg?.strokeCount ?? 0;
        if (shouldWaitForMoreDoodleStrokes(strokes, expectedStrokes)) {
            this.clearDoodleAssessment(slots);
            return;
        }
        const assessment = assessKanjiStrokes(strokes, expectedStrokes || strokes.length, details.vg?.strokeShapes);
        this.renderDoodleAssessment(slots, assessment);
        // First-attempt pass/fail feeds the reveal summary.
        this.recordDoodleOutcome(card, kanji, assessment.passed);
        this.autoSubmitDoodleAssessment(settings, assessment.passed, card);
    }

    private recordDoodleOutcome(card: JPDBCard, kanji: string, passed: boolean): void {
        const doodle = (this.ensureStepState(cardKey(card)).doodle ??= {});
        // Latch each kanji on its FIRST draw so clearing and redrawing the same
        // character can't relaunder its result (a first pass stays a pass).
        const firstAttempt = (doodle.firstAttempt ??= new Map<string, 'correct' | 'wrong'>());
        if (firstAttempt.has(kanji)) return;
        firstAttempt.set(kanji, passed ? 'correct' : 'wrong');
        // Aggregate across the word's kanji into one card-level outcome: the
        // roughest draw wins, so any failed kanji marks the whole card wrong.
        if (doodle.outcome === 'wrong') return;
        doodle.outcome = passed ? 'correct' : 'wrong';
    }

    private autoSubmitDoodleAssessment(settings: ReaderSettings, passed: boolean, expectedCard: JPDBCard): void {
        if (settings.enableReviews && settings.newTabKanjiAutoSubmit && this.state.revealAnswer) {
            const grade: JPDBGrade = usesBunproFsrsGradeScale(expectedCard)
                ? passed ? 'okay' : 'nothing'
                : passed ? 'pass' : 'fail';
            void this.gradeCurrentCard(grade, undefined, expectedCard);
        }
    }

    private captureDoodlePreview(slots: NewTabStudySlots, card: JPDBCard): void {
        const canvas = slots.answer?.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
        if (!canvas) return;
        try {
            this.doodlePreviewCache.set(cardKey(card), doodlePreviewDataUrl(canvas));
        } catch {
            // Canvas export can be blocked by privacy settings.
        }
    }

    private renderDoodleAssessment(slots: NewTabStudySlots, assessment: KanjiStrokeAssessment): void {
        const result = slots.answer?.querySelector<HTMLElement>('[data-newtab-doodle-result]');
        const root = slots.answer?.closest<HTMLElement>('.jpdb-reader-newtab');
        root?.classList.toggle('jpdb-reader-newtab-doodle-pass', assessment.passed);
        root?.classList.toggle('jpdb-reader-newtab-doodle-fail', !assessment.passed);
        if (result) result.textContent = `${assessment.passed ? '✓' : '✕'} ${this.doodleAssessmentMessage(assessment)}`;
    }

    private doodleAssessmentMessage(assessment: KanjiStrokeAssessment): string {
        const count = `${assessment.actualStrokes}/${assessment.expectedStrokes} ${this.text('strokes')}`;
        if (assessment.passed) return `${this.text('looksRight')}: ${count}`;
        if (assessment.actualStrokes !== assessment.expectedStrokes) return `${this.text('checkStrokeCount')}: ${count}`;
        if (assessment.shapeScore != null && assessment.shapeScore < SHAPE_PASS_SCORE) return `${this.text('checkStrokeShapeOrder')}: ${count}`;
        return `${this.text('checkStrokeCountOrder')}: ${count}`;
    }

    private clearDoodleAssessment(slots: NewTabStudySlots): void {
        const result = slots.answer?.querySelector<HTMLElement>('[data-newtab-doodle-result]');
        const root = slots.answer?.closest<HTMLElement>('.jpdb-reader-newtab');
        root?.classList.remove('jpdb-reader-newtab-doodle-pass', 'jpdb-reader-newtab-doodle-fail');
        if (result) result.textContent = '';
    }

    private renderEmpty(root: HTMLElement, prompt: string, message: string): void {
        this.enterEmptyMode(root);
        const slots = this.studySlots(root);
        this.renderPromptSlot(slots.prompt, prompt, prompt === APP_NAME || resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en');
        setOptionalText(slots.answer, message);
        setOptionalText(slots.meaning, '');
        this.renderCount(slots.count, '');
        if (this.options.surface === 'academy') {
            this.renderPlainStatus(slots.status, '');
            this.clearEmptyControls(slots.controls);
            return;
        }
        this.renderEmptySourceStatus(slots.status);
        this.renderEmptyControls(slots.controls);
    }

    private enterEmptyMode(root: HTMLElement): void {
        root.classList.add('jpdb-reader-newtab-revealed');
        root.classList.add('jpdb-reader-newtab-empty-mode');
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-review-mode');
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
    }

    private renderPromptSlot(promptSlot: HTMLElement | null, prompt: string, lang = 'en'): void {
        if (!promptSlot) return;
        promptSlot.lang = lang;
        delete promptSlot.dataset.newtabExpression;
        promptSlot.classList.remove('jpdb-reader-newtab-prompt-anki-card', 'jpdb-reader-newtab-prompt-has-sentence', 'jpdb-reader-newtab-recall-prompt');
        promptSlot.textContent = prompt;
    }

    private renderEmptyControls(controls: HTMLElement | null): void {
        if (!controls) return;
        controls.hidden = false;
        replaceChildrenWith(controls,
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('empty-fallback') } }, this.text('starterWords')),
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('settings') } }, uiText(this.language(), 'settings')),
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('mode'), mode: 'search' } }, this.text('search')),
        );
    }

    private clearEmptyControls(controls: HTMLElement | null): void {
        if (!controls) return;
        controls.hidden = true;
        replaceChildrenWith(controls);
    }

    private async startStarterWordStudy(root: HTMLElement): Promise<void> {
        const loadGeneration = ++this.loadGeneration;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.index = 0;
        this.reviewCountMode = false;
        this.emptyLoadMessageKey = null;
        this.fallbackStudyNotice = false;
        this.setStatus(root, this.text('loading'));
        await this.applyLoadedWords(
            root,
            false,
            loadGeneration,
            this.loadBuiltInFreshStudyWords(),
            false,
            false,
            this.navigationGeneration,
        );
    }

    // fallow-ignore-next-line complexity
    private handleSearchClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: NewTabAction | undefined): boolean {
        const handled = this.searchController.handleSearchClick(root, target, event, action);
        if (handled !== undefined) return handled;
        switch (action) {
            case 'browse-filter':
                return this.handleBrowseFilterClick(root, target, event);
            case 'browse-source-filter':
                return this.handleBrowseSourceFilterClick(root, target, event);
            case 'browse-sort-direction':
                return this.handleBrowseSortDirectionClick(root, event);
            case 'browse-select-mode':
                return this.handleBrowseSelectModeClick(root, event);
            case 'browse-page':
                return this.handleBrowsePageClick(root, target, event);
            case 'browse-bulk':
                return this.handleBrowseBulkClick(root, target, event);
            case 'browse-card':
                return this.handleBrowseCardClick(target, event);
            default:
                return false;
        }
    }

    private handleBrowseFilterClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const filter = (target.closest<HTMLElement>('[data-browse-filter]')?.dataset.browseFilter ?? 'all') as BrowseFilter;
        if (filter === 'all') this.browseFilters.clear();
        else if (this.browseFilters.has(filter)) this.browseFilters.delete(filter);
        else this.browseFilters.add(filter);
        return this.refreshBrowseAfterChipChange(root);
    }

    private handleBrowseSourceFilterClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const filter = (target.closest<HTMLElement>('[data-browse-source-filter]')?.dataset.browseSourceFilter ?? 'all') as BrowseSourceChip;
        if (filter === 'all') this.browseSourceFilters.clear();
        else if (this.browseSourceFilters.has(filter)) this.browseSourceFilters.delete(filter);
        else this.browseSourceFilters.add(filter);
        return this.refreshBrowseAfterChipChange(root);
    }

    private handleBrowseSortDirectionClick(root: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        this.browseSortDescending = !this.browseSortDescending;
        this.browsePage = 0;
        this.rerenderBrowseResults(root);
        return true;
    }

    private handleBrowseSelectModeClick(root: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        this.browseSelectMode = !this.browseSelectMode;
        this.rerenderBrowseResults(root);
        return true;
    }

    private handleBrowsePageClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const page = Number(target.closest<HTMLElement>('[data-browse-page]')?.dataset.browsePage);
        if (Number.isFinite(page) && page >= 0) this.browsePage = page;
        this.rerenderBrowseResults(root);
        return true;
    }

    private handleBrowseBulkClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const bulkAction = target.closest<HTMLElement>('[data-bulk-action]')?.dataset.bulkAction ?? '';
        if (bulkAction) void this.performBrowseBulkAction(root, bulkAction);
        return true;
    }

    private handleBrowseCardClick(target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const row = target.closest<HTMLElement>('[data-expression]');
        const card = this.browseCardForRow(row);
        if (card && row && this.dependencies.showLookupCard) {
            void this.dependencies.showLookupCard(card, sentenceForCard(card), row, this.nestedLookupOptions());
            return true;
        }
        const expression = cleanNestedLookupValue(row?.dataset.expression);
        if (expression) void this.dependencies.lookupText?.(expression, cleanNestedLookupValue(row?.dataset.reading) || expression, row ?? target);
        return true;
    }

    private refreshBrowseAfterChipChange(root: HTMLElement): boolean {
        this.browsePage = 0;
        const query = normalizeSearchQuery(this.searchController.query);
        if (!this.browseScopeActive() && query) {
            this.searchController.performSearch(root, query);
            return true;
        }
        this.rerenderBrowseResults(root);
        return true;
    }

    private rerenderBrowseResults(root: HTMLElement): void {
        const mount = this.searchResultsMount(root);
        if (mount) this.renderBrowseResults(mount);
    }

    private browseCardForRow(row: HTMLElement | null): JPDBCard | undefined {
        const key = cleanNestedLookupValue(row?.dataset.browseCardKey);
        if (!key) return undefined;
        return (this.browsePool ?? []).find(card => this.cardMatchesSelectionKey(card, key))
            ?? this.allWords.find(card => this.cardMatchesSelectionKey(card, key))
            ?? this.visibleWords.find(card => this.cardMatchesSelectionKey(card, key))
            ?? this.searchController.wordCard(key);
    }

    private searchResultsMount(root: HTMLElement): HTMLElement | null {
        return root.querySelector<HTMLElement>('[data-newtab-search-results]');
    }

    private localSearchWithTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
        return promiseWithTimeout(promise, NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS, 'Local dictionary search timed out.')
            .catch(error => {
                log.debug('Local dictionary search skipped', { error });
                return fallback;
            });
    }

    private async renderBrowseInto(root: HTMLElement): Promise<void> {
        const results = this.searchResultsMount(root);
        if (!results) return;
        if (!this.browsePool) replaceChildrenWith(results, el('div', { class: 'jpdb-reader-newtab-search-empty' }, this.text('loading')));
        await this.loadBrowsePool(() => {
            const mount = this.searchResultsMount(root);
            const query = normalizeSearchQuery(this.searchController.query);
            if (mount?.isConnected && this.state.route === 'search' && (!query || this.browseScopeActive())) this.renderBrowseResults(mount);
        });
        const mount = this.searchResultsMount(root);
        const query = normalizeSearchQuery(this.searchController.query);
        if (!mount || !mount.isConnected || this.state.route !== 'search' || (query && !this.browseScopeActive())) return;
        this.renderBrowseResults(mount);
    }

    refreshBrowseAfterCardMutation(_card?: JPDBCard): void {
        const root = this.currentRoot();
        if (!root || this.state.route !== 'search') return;
        this.invalidateBrowsePool();
        void this.renderBrowseInto(root);
    }

    private invalidateBrowsePool(): void {
        this.browsePoolGeneration += 1;
        this.browsePool = undefined;
        this.browsePoolKey = '';
        this.browsePoolLoad = undefined;
        this.browseAnkiDueBuckets = undefined;
        this.browseDueBucketsKey = '';
    }

    // SH-3 due-in column: bucket the pool's Anki cards through Anki's own
    // scheduler search (is:due, prop:due<=1/7/30) — exact answers, no due
    // decoding. Jiten/JPDB cards stay blank (their APIs expose no per-card
    // due timestamps).
    private async loadBrowseAnkiDueBuckets(cards: JPDBCard[]): Promise<Map<number, string>> {
        const ankiCardIds = new Set(cards.map(card => card.ankiCardId).filter((id): id is number => Number.isFinite(id) && (id as number) > 0));
        const invoke = this.dependencies.anki.invoke;
        const buckets = new Map<number, string>();
        if (!ankiCardIds.size || typeof invoke !== 'function') return buckets;
        const queries: Array<[string, string]> = [
            ['is:due', this.text('statsDue')],
            ['-is:suspended prop:due>0 prop:due<=1', '≤1d'],
            ['-is:suspended prop:due>0 prop:due<=7', '≤7d'],
            ['-is:suspended prop:due>0 prop:due<=30', '≤30d'],
        ];
        for (const [query, label] of queries) {
            const ids = await invoke<number[]>('findCards', { query }).catch((): number[] => []);
            for (const id of ids) {
                if (ankiCardIds.has(id) && !buckets.has(id)) buckets.set(id, label);
            }
        }
        return buckets;
    }

    // Dictionary lookup stays the Search default; deck/state scope flips the
    // tab into the My Cards browser (2D reviews).
    private browseScopeActive(): boolean {
        const japaneseDeckScope = usesJapaneseProviders() && this.state.jpdbDeck !== 'all'
            ? this.state.jpdbDeck
            : '';
        return [this.browseFilters.size, this.browseSourceFilters.size, japaneseDeckScope].some(Boolean);
    }

    private renderBrowseResults(mount: HTMLElement): void {
        const cards = this.browsePool ?? [];
        const language = this.language();
        const query = this.browseScopeActive() ? normalizeSearchQuery(this.searchController.query) : '';
        const filtered = sortBrowseCards(
            filterBrowseCards(cards, this.browseFilters, query, this.browseSourceFilters),
            this.browseSort,
            this.browseSortDescending,
        );
        const hasJitenCards = filtered.some(card => isJitenBackedCard(card) || browseSourceForCard(card) === 'jiten');
        replaceChildrenWith(mount,
            renderBrowseSourceChips(cards, this.browseSourceFilters, {
                all: this.text('browseAllSources'),
                jpdb: 'JPDB',
                jiten: 'Jiten',
                bunpro: 'Bunpro',
                wanikani: 'WaniKani',
                yomuLocal: ACADEMY_SRS_LABEL,
                anki: 'Anki',
            }),
            renderBrowseChips(cards, this.browseFilters, language, this.text('browseAllChip')),
            renderBrowseControls(this.browseSort, this.browseSortDescending, this.browseSelectMode, {
                sortLabel: this.text('browseSortLabel'),
                sortQueue: this.text('browseSortQueue'),
                sortAlpha: this.text('browseSortAlpha'),
                sortFrequency: this.text('browseSortFrequency'),
                sortHistory: this.text('browseSortHistory'),
                directionAscending: this.text('browseSortAscending'),
                directionDescending: this.text('browseSortDescending'),
                select: this.text('browseSelectMode'),
            }),
            renderBrowseList(filtered, this.browsePage, language, {
                empty: this.text('browseNoCards'),
                previous: this.text('browsePreviousPage'),
                next: this.text('browseNextPage'),
                showing: (from, to, total) => `${from}–${to} / ${total}`,
                // Rows only grow checkboxes in select mode (user-tested: the
                // browser should not always look like a bulk editor).
                ...(this.dependencies.performCardAction && this.browseSelectMode ? {
                    bulk: {
                        selectPage: this.text('browseSelectPage'),
                        mining: hasJitenCards ? this.text('mining') : undefined,
                        blacklist: this.text('blacklist'),
                        neverForget: this.text('stateNeverForget'),
                        suspend: hasJitenCards ? this.text('stateSuspended') : undefined,
                        forget: hasJitenCards ? this.text('forget') : undefined,
                    },
                } : {}),
                ...(this.browseAnkiDueBuckets ? {
                    dueIn: (card: JPDBCard) => (Number.isFinite(card.ankiCardId) ? this.browseAnkiDueBuckets?.get(card.ankiCardId as number) ?? '' : ''),
                } : {}),
            }),
        );
        void this.hydrateBrowseDueBuckets(mount, cards);
    }

    private browseAnkiDueBuckets?: Map<number, string>;
    private browseDueBucketsKey = '';

    private async hydrateBrowseDueBuckets(mount: HTMLElement, cards: JPDBCard[]): Promise<void> {
        const key = this.browsePoolKey;
        if (this.browseDueBucketsKey === key) return;
        this.browseDueBucketsKey = key;
        const buckets = await this.loadBrowseAnkiDueBuckets(cards);
        if (this.browsePoolKey !== key) return;
        this.browseAnkiDueBuckets = buckets;
        if (buckets.size && mount.isConnected) this.renderBrowseResults(mount);
    }

    private syncBrowseBulkControls(root: HTMLElement): void {
        const selected = root.querySelectorAll('[data-browse-select]:checked').length;
        root.querySelectorAll<HTMLButtonElement>(newTabActionSelector('browse-bulk')).forEach(button => { button.disabled = selected === 0; });
        const count = root.querySelector<HTMLElement>('[data-browse-bulk-count]');
        if (count) count.textContent = selected ? String(selected) : '';
    }

    // Jiten Cards parity (SH-3 v2): fan the selected rows through the shared
    // card-action path so blacklist/never-forget keep their provider mapping
    // (JPDB deck, Jiten local workaround, Anki suspend/tag), then reload the
    // pool so the rows recolor with their post-action states.
    private async performBrowseBulkAction(root: HTMLElement, action: string): Promise<void> {
        const performCardAction = this.dependencies.performCardAction;
        if (!performCardAction) return;
        const pool = this.browsePool ?? [];
        const cardsByKey = new Map(pool.map(card => [cardKey(card), card]));
        const selected = [...root.querySelectorAll<HTMLInputElement>('[data-browse-select]:checked')]
            .map(box => cardsByKey.get(box.dataset.browseCardKey ?? ''))
            .filter((card): card is JPDBCard => Boolean(card));
        if (!selected.length) return;
        root.querySelectorAll<HTMLButtonElement>(newTabActionSelector('browse-bulk')).forEach(button => { button.disabled = true; });
        for (const card of selected) {
            if (isJitenBulkAction(action) && !(isJitenBackedCard(card) || browseSourceForCard(card) === 'jiten')) continue;
            const button = el('button', { type: 'button', dataset: { action } }) as HTMLButtonElement;
            try {
                await performCardAction(button, card, sentenceForCard(card), button);
            } catch {
                // Provider errors surface through the action path's own toasts.
            }
        }
        this.invalidateBrowsePool();
        await this.renderBrowseInto(root);
    }

    private async loadBrowsePool(onPartial?: (cards: JPDBCard[]) => void): Promise<JPDBCard[]> {
        const settings = this.dependencies.getSettings();
        const providerContext = newTabProviderContext(settings);
        const deck = usesJapaneseProviders() ? (this.state.jpdbDeck || '').trim() : '';
        const selection = selectedScopedBrowsePool(this.state.route, deck, this.canBrowseJpdbDeck(settings));
        if (selection) {
            return this.loadScopedBrowsePool(providerContext, selection.key, () => loadSelectedBrowsePool(selection, {
                jitenDeck: async deckId => this.withJitenReviewHistory(await this.loadJitenDeckBrowseCards(deckId, NEW_TAB_BROWSE_DECK_LIMIT)),
                jitenProvider: async () => this.withJitenReviewHistory(await this.loadAllJitenDeckBrowseCards(settings)),
                jpdb: deckId => this.dependencies.jpdb.listDeckCards(deckId, NEW_TAB_BROWSE_DECK_LIMIT).catch((): JPDBCard[] => []),
            }));
        }
        return this.loadUnscopedBrowsePool(settings, providerContext, onPartial);
    }

    private canBrowseJpdbDeck(settings: ReaderSettings): boolean {
        return hasJpdbApiCredential(settings) && typeof this.dependencies.jpdb.listDeckCards === 'function';
    }

    private loadUnscopedBrowsePool(settings: ReaderSettings, providerContext: string, onPartial?: (cards: JPDBCard[]) => void): Promise<JPDBCard[]> {
        const providers = this.browsePoolProviders(settings);
        const key = JSON.stringify({
            target: activeLearningTarget().language,
            providers: providers.map(provider => provider.label),
            providerContext,
        });
        const browseGeneration = this.browsePoolGeneration;
        const pending = matchingBrowsePoolLoad(this.browsePoolLoad, key, browseGeneration);
        if (pending) return pending.promise.then(cards => reportBrowsePool(cards, onPartial));
        const cached = cachedBrowsePool(this.browsePool, this.browsePoolKey, key);
        if (cached) return Promise.resolve(cached);
        this.browsePool = [];
        this.browsePoolKey = key;
        this.browseAnkiDueBuckets = undefined;
        this.browseDueBucketsKey = '';
        const promise = this.loadBrowsePoolProviders(providers, browseGeneration, key, onPartial);
        const request = { generation: browseGeneration, key, promise };
        this.browsePoolLoad = request;
        return promise.finally(() => {
            if (this.browsePoolLoad === request) this.browsePoolLoad = undefined;
        });
    }

    private async loadBrowsePoolProviders(
        providers: NewTabStatsApiProvider[],
        browseGeneration: number,
        key: string,
        onPartial?: (cards: JPDBCard[]) => void,
    ): Promise<JPDBCard[]> {
        const collected: JPDBCard[] = [];
        const results = await Promise.all(providers.map(async provider => {
            const result = await loadNewTabStatsApiProvider(provider);
            const currentResult = [
                browseGeneration === this.browsePoolGeneration,
                this.browsePoolKey === key,
                result.error === null,
            ].every(Boolean);
            if (currentResult) {
                collected.push(...result.cards.filter(newTabCardMatchesActiveTarget));
                this.browsePool = dedupeWords(collected);
                onPartial?.(this.browsePool);
            }
            return result;
        }));
        const cards = dedupeWords(results
            .filter(result => result.error === null)
            .flatMap(result => result.cards)
            .filter(newTabCardMatchesActiveTarget));
        if (browseGeneration !== this.browsePoolGeneration || this.browsePoolKey !== key) return [];
        this.browsePool = cards;
        onPartial?.(cards);
        return cards;
    }

    private async loadScopedBrowsePool(providerContext: string, key: string, load: () => Promise<JPDBCard[]>): Promise<JPDBCard[]> {
        const scopedKey = `${activeLearningTarget().language}:${providerContext}:${key}`;
        if (this.browsePool && this.browsePoolKey === scopedKey) return this.browsePool;
        const browseGeneration = this.browsePoolGeneration;
        this.browsePool = undefined;
        this.browsePoolKey = scopedKey;
        const cards = await load().catch((): JPDBCard[] => []);
        if (!isCurrentBrowsePool(browseGeneration, this.browsePoolGeneration, scopedKey, this.browsePoolKey)) return [];
        this.browsePool = dedupeWords(cards.filter(newTabCardMatchesActiveTarget).map(normalizeNewTabCard));
        return this.browsePool;
    }

    private renderControls(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.controls) return;
        slots.controls.hidden = false;
        const buttons = this.controlButtonsForCard(card);
        const gradeCount = buttons.filter(button => button instanceof HTMLButtonElement && Boolean(button.dataset.grade)).length;
        const hasGrades = gradeCount > 0;
        slots.controls.classList.toggle('jpdb-reader-newtab-grade-controls', hasGrades);
        slots.controls.dataset.newtabControlCount = String(buttons.length);
        slots.controls.dataset.newtabGradeControls = String(hasGrades);
        if (hasGrades) {
            slots.controls.dataset.newtabGradeCount = String(gradeCount);
            slots.controls.dataset.newtabGradeScale = gradeCount === 2 ? 'pass-fail' : 'standard';
        } else {
            delete slots.controls.dataset.newtabGradeCount;
            delete slots.controls.dataset.newtabGradeScale;
        }
        replaceChildrenWith(slots.controls, buttons);
    }

    private controlButtonsForCard(card: JPDBCard): HTMLElement[] {
        if (!this.isFinalRevealStep(card)) return this.studyStepControlButtons();
        if (!this.canReviewCard(card)) return this.navigationControlButtons(this.text(this.state.revealAnswer ? 'hide' : 'reveal'));
        if (!this.state.revealAnswer) return this.navigationControlButtons(this.text('reveal'));
        return this.gradeControlButtons(card);
    }

    private isFinalRevealStep(card: JPDBCard): boolean {
        return this.studySessionForCard(card, this.shouldRenderCardAsKanji(card)).activeStep.kind === 'final-reveal';
    }

    private canReviewCard(card: JPDBCard): boolean {
        if ((this.isOfflineSourceLabel(this.sourceLabel) || typeof navigator !== 'undefined' && navigator.onLine === false)
            && !this.offlineGradeTargets(card).length) return false;
        return this.reviewSourceSummary(card).targets.length > 0;
    }

    private reviewTargetsForCard(card: JPDBCard): NewTabReviewTarget[] {
        const settings = this.dependencies.getSettings();
        const reviewSettings = this.options.surface === 'academy' && !settings.yomuLocalSrsEnabled
            ? { ...settings, yomuLocalSrsEnabled: true }
            : settings;
        return reviewTargetsForNewTabCard(card, reviewSettings, this.ankiCardIdForReview(card));
    }

    private reviewSourceSummary(card: JPDBCard): NewTabReviewSourceSummary {
        return summarizeNewTabReviewSources(this.reviewTargetsForCard(card));
    }

    private offlineGradeTargets(card: JPDBCard): QueuedNewTabGradeTarget[] {
        return queueableNewTabReviewTargets(this.reviewTargetsForCard(card));
    }

    // fallow-ignore-next-line complexity
    private offlineGradeTargetsForSelection(card: JPDBCard, selection?: NewTabLookupReviewTargetSelection): QueuedNewTabGradeTarget[] {
        if (!selection) return this.offlineGradeTargets(card);
        if (selection.kind === 'anki') {
            const selectedCardId = Number(selection.ankiCardId);
            return Number.isFinite(selectedCardId)
                && selectedCardId > 0
                && selectedCardId === this.ankiCardIdForReview(card)
                && this.reviewTargetsForCard(card).includes('anki') ? ['anki'] : [];
        }
        const target = this.reviewTargetForLookupKind(card, selection.kind);
        return target && target !== 'jpdb-live' && target !== 'bunpro-api' && target !== 'wanikani-api' ? [target] : [];
    }

    private navigationControlButtons(revealLabel: string): HTMLElement[] {
        const revealShortcut = this.studyShortcutHint(['studyReveal', 'studyRevealAlternate']);
        const showShortcutHints = this.dependencies.getSettings().newTabShortcutHintsEnabled;
        return [
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('previous') }, 'aria-label': this.text('previousWord') }, this.text('previousWord')),
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('reveal') } }, revealLabel,
                revealShortcut && newTabKeyHintsRenderable(showShortcutHints) ? el('kbd', { class: 'jpdb-reader-newtab-key-hint', 'aria-hidden': 'true' }, revealShortcut) : null),
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('next') }, 'aria-label': this.text('nextWord') }, this.text('nextWord')),
        ];
    }

    private studyStepControlButtons(): HTMLElement[] {
        const continueShortcut = this.studyShortcutHint(['studyReveal', 'studyRevealAlternate']);
        const showShortcutHints = this.dependencies.getSettings().newTabShortcutHintsEnabled;
        return [
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('previous') }, 'aria-label': this.text('previousWord') }, this.text('previousWord')),
            el('button', { type: 'button', dataset: { newtabAction: newTabAction('next') } }, this.text('continueStudying'),
                continueShortcut && newTabKeyHintsRenderable(showShortcutHints) ? el('kbd', { class: 'jpdb-reader-newtab-key-hint', 'aria-hidden': 'true' }, continueShortcut) : null),
        ];
    }

    private gradeControlButtons(card: JPDBCard): HTMLElement[] {
        const targetOptions = this.mainGradeTargetOptions(card);
        const targetLabel = targetOptions[0]?.label ?? this.gradeTargetLabel(card);
        const grades = newTabGradeOptions(this.dependencies.getSettings(), card);
        const sourceSummary = this.reviewSourceSummary(card);
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: this.apiGradeTargetShortLabel(card),
            bothLabel: this.text('gradeTargetBoth'),
            grades,
            intervals: card.reviewGradeIntervals,
            keyHints: this.studyGradeShortcutHints(card),
            showShortcutHints: this.dependencies.getSettings().newTabShortcutHintsEnabled,
            selectorLabel: this.text('gradeTargetSelector'),
            selectedOption: targetOptions[0],
            summary: sourceSummary,
            targetLabel,
            targetOptions,
        });
        // Suggestion is advisory only — highlight one button, never grade. The
        // learner's manual choice always wins (nothing is submitted here).
        const outcomes = this.studyStepOutcomesForCard(card);
        this.markSuggestedGradeButton(buttons, suggestedStudyGrade(outcomes, grades.map(([grade]) => grade)));
        if (!sourceSummary.hasWanikani) return buttons;
        return [
            el('p', {
                class: 'jpdb-reader-newtab-grade-help',
                dataset: { wanikaniGradeMappingHelp: true },
            }, uiText(this.language(), 'wanikaniGradeMappingHelp')),
            ...buttons,
        ];
    }

    private markSuggestedGradeButton(buttons: HTMLElement[], suggested: JPDBGrade | null): void {
        if (!suggested) return;
        for (const button of buttons) {
            const match = button instanceof HTMLElement && button.dataset.grade === suggested
                ? button
                : button.querySelector<HTMLElement>(`[data-grade="${suggested}"]`);
            if (!match) continue;
            match.dataset.suggested = 'true';
            match.setAttribute('aria-label', `${match.getAttribute('aria-label') ?? ''} (${this.text('gradeSuggested')})`.trim());
            return;
        }
    }

    // Read the consolidated per-card study-step state (NB-41a), or undefined when
    // the card has no recorded step interaction yet.
    private stepState(key: string): StudyStepState | undefined {
        return this.studyStepStates.get(key);
    }

    // Read-or-create the consolidated per-card study-step state for mutation.
    private ensureStepState(key: string): StudyStepState {
        let state = this.studyStepStates.get(key);
        if (!state) {
            state = {};
            this.studyStepStates.set(key, state);
        }
        return state;
    }

    // Gather each study step's first-attempt mini-outcome for THIS card, drawing
    // from the same per-step maps the individual steps write. Steps with no
    // recorded result are omitted (undefined), so the summary + suggestion only
    // reflect what the learner actually did.
    private studyStepOutcomesForCard(card: JPDBCard): StudyStepOutcomes {
        const state = this.stepState(cardKey(card));
        const outcomes: StudyStepOutcomes = {};
        const doodle = state?.doodle?.outcome;
        if (doodle) outcomes['kanji-doodle'] = doodle;
        const recall = state?.recall?.outcome;
        if (recall) outcomes['recall-cloze'] = recallOutcomeToStepOutcome(recall);
        const pitch = state?.pitch;
        if (pitch) outcomes['listen-pitch'] = pitch.outcome === 'correct' ? 'correct' : 'wrong';
        const speaking = state?.speak;
        if (speaking) outcomes.speaking = speaking;
        const type = state?.type?.outcome;
        if (type) outcomes['type-word'] = type === 'skipped' ? 'skipped' : recallOutcomeToStepOutcome(type);
        return outcomes;
    }

    private studyGradeShortcutHints(card: JPDBCard): Partial<Record<JPDBGrade, string>> {
        const settings = this.dependencies.getSettings();
        const candidates = usesBunproFsrsGradeScale(card)
            ? BUNPRO_FSRS_REVIEW_SHORTCUTS
            : usesTwoButtonNewTabGradeScale(settings, card)
                ? TWO_BUTTON_REVIEW_SHORTCUTS
                : FIVE_BUTTON_REVIEW_SHORTCUTS;
        return Object.fromEntries(candidates.map(([key, grade]) => [grade, settings.shortcuts[key]]));
    }

    private studyShortcutHint(names: Array<keyof ReaderSettings['shortcuts']>): string {
        const shortcuts = this.dependencies.getSettings().shortcuts;
        return names.map(name => shortcuts[name].trim()).find(Boolean) ?? '';
    }

    private mainGradeTargetOptions(card: JPDBCard) {
        const targets = this.lookupReviewTargetsForCard(card);
        return newTabMainGradeTargetOptions(targets, this.gradeTargetLabel(card), this.text('gradeTargetBoth'));
    }

    private selectedMainGradeTarget(root: HTMLElement): NewTabLookupReviewTargetSelection | undefined {
        return selectedNewTabMainGradeTarget(root);
    }

    private updateMainGradeTargetLabel(root: HTMLElement, option: HTMLOptionElement | null): void {
        updateNewTabMainGradeTargetLabel(root, option, this.text('gradeTargetBoth'));
    }

    private gradeTargetLabel(card: JPDBCard): string {
        const summary = this.reviewSourceSummary(card);
        const ankiTarget = summary.hasAnki ? this.ankiReviewTargetLabel(card) : '';
        return newTabGradeTargetLabel(summary, {
            all: this.formatNewTabText('gradeTargetAllProviders', { target: ankiTarget }),
            anki: this.formatNewTabText('gradeTargetAnki', { target: ankiTarget }),
            bunpro: this.text('gradeTargetBunpro'),
            jiten: this.text('gradeTargetJiten'),
            jitenAndAnki: this.formatNewTabText('gradeTargetJitenAndAnki', { target: ankiTarget }),
            jpdb: this.text('gradeTargetJpdb'),
            jpdbAndAnki: this.formatNewTabText('gradeTargetJpdbAndAnki', { target: ankiTarget }),
            jpdbAndJiten: this.text('gradeTargetJpdbAndJiten'),
            wanikani: this.text('gradeTargetWanikani'),
            yomuLocal: this.text('gradeTargetYomuLocal'),
        });
    }

    private apiGradeTargetShortLabel(card: JPDBCard): string {
        return newTabApiGradeTargetShortLabel(this.reviewSourceSummary(card));
    }

    private ankiReviewTargetLabel(card: JPDBCard): string {
        const base = card.ankiDeckNames?.join(', ') || card.ankiModelName || 'Anki';
        const kind = ankiCardKindLabel(card, this.language());
        const cardId = this.ankiCardIdForReview(card);
        return [
            [base, kind].filter(Boolean).join(' · '),
            cardId ? `#${cardId}` : '',
        ].filter(Boolean).join(' ');
    }

    // fallow-ignore-next-line complexity
    private lookupReviewTargetsForCard(card: JPDBCard, data?: CardRenderData | null): NewTabLookupReviewTarget[] {
        const targets = this.reviewTargetsForCard(card);
        const result: NewTabLookupReviewTarget[] = [];
        if (targets.includes('jiten-api')) {
            result.push({ id: 'jiten', kind: 'jiten', label: this.text('gradeTargetJiten'), shortLabel: 'Jiten' });
        }
        if (targets.some(target => target === 'jpdb-api' || target === 'jpdb-live')) {
            result.push({ id: 'jpdb', kind: 'jpdb', label: this.text('gradeTargetJpdb'), shortLabel: 'JPDB' });
        }
        if (targets.includes('bunpro-api')) {
            result.push({ id: 'bunpro', kind: 'bunpro', label: this.text('gradeTargetBunpro'), shortLabel: 'Bunpro' });
        }
        if (targets.includes('wanikani-api')) {
            result.push({ id: 'wanikani', kind: 'wanikani', label: this.text('gradeTargetWanikani'), shortLabel: 'WaniKani' });
        }
        if (targets.includes('yomu-local')) {
            result.push({ id: 'yomu-local', kind: 'yomu-local', label: this.text('gradeTargetYomuLocal'), shortLabel: 'Yomu' });
        }
        const settings = this.dependencies.getSettings();
        const ankiTargets = settings.ankiEnabled && settings.newTabAnkiEnabled ? this.lookupAnkiReviewTargets(card, data) : [];
        if (targets.includes('anki') || ankiTargets.length) result.push(...ankiTargets);
        return result;
    }

    private lookupAnkiReviewTargets(card: JPDBCard, data?: CardRenderData | null): NewTabLookupReviewTarget[] {
        const cardLabel = card.ankiDeckNames?.join(', ') || card.ankiModelName || 'Anki';
        const seeds = [
            ...(card.ankiRenderedCards ?? []).map(rendered => ({
                cardId: rendered.cardId,
                label: rendered.deckName || cardLabel,
                cardName: rendered.cardName,
            })),
            { cardId: this.ankiCardIdForReview(card), label: cardLabel },
        ];
        return collectAnkiReviewTargetLabels(seeds, data?.ankiLookup.notes ?? []).map(({ cardId, label }) => ({
            id: `anki:${cardId}`,
            kind: 'anki',
            ankiCardId: cardId,
            label: this.formatNewTabText('gradeTargetAnki', { target: label }),
            shortLabel: compactAnkiReviewTargetLabel(label, cardId),
        }));
    }

    private formatNewTabText(key: NewTabCopyKey, values: Record<string, string>): string {
        return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), this.text(key));
    }

    private isReviewCard(card: JPDBCard): boolean {
        return isReviewSource(card.reviewSource)
            || card.source === 'anki'
            || isJitenSrsCard(card)
            || isPositiveJpdbCard(card);
    }

    private async performJpdbKanjiAction(root: HTMLElement, actionId: string): Promise<void> {
        const card = this.visibleWords[this.index];
        const kanji = visibleCardKanji(card);
        const providerContext = this.providerContexts.jpdb;
        if (!jpdbKanjiActionAvailable(actionId, kanji)) return;
        try {
            this.setStatus(root, this.text('updatingJpdbKanji'));
            await this.dependencies.jpdbKanji.performAction(actionId);
            if (!jpdbKanjiActionIsCurrent(providerContext, this.providerContexts.jpdb, kanji)) return;
            this.finishJpdbKanjiAction(root, card, kanji);
        } catch (error) {
            log.warn('New tab JPDB kanji action failed', { kanji }, error);
            this.setStatus(root, this.text('jpdbKanjiUpdateFailed'));
        }
    }

    private finishJpdbKanjiAction(root: HTMLElement, card: JPDBCard | undefined, kanji: string): void {
        if (kanji) this.kanjiDetailSource.invalidate(kanji);
        if (card && this.visibleWords[this.index] === card) this.renderWord(root, card);
        this.setStatus(root, this.text('jpdbKanjiUpdated'));
    }

    private gradeSubmissionInFlight = false;

    private async gradeCurrentCard(grade: JPDBGrade, selectedTarget?: NewTabLookupReviewTargetSelection, expectedCard?: JPDBCard): Promise<boolean> {
        const submittedCard = this.visibleWords[this.index];
        if (!submittedCard || expectedCard && !this.sameGradeCardIdentity(submittedCard, expectedCard) || !this.canReviewCard(submittedCard)) return false;
        const sessionScopedBunpro = submittedCard.source === 'bunpro' || submittedCard.reviewSource === 'bunpro-api';
        if (!sessionScopedBunpro) return await this.gradeCurrentCardUnlocked(grade, selectedTarget);
        if (this.gradeSubmissionInFlight) return false;
        this.gradeSubmissionInFlight = true;
        const gradeButtons = [
            ...Array.from(this.currentRoot()?.querySelectorAll<HTMLButtonElement>(newTabActionSelector('grade')) ?? []),
            ...Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-action="grade"][data-grade]')),
        ];
        gradeButtons.forEach(button => { button.disabled = true; });
        try {
            return await this.gradeCurrentCardUnlocked(grade, selectedTarget);
        } finally {
            this.gradeSubmissionInFlight = false;
            if (submittedCard && this.visibleWords[this.index] === submittedCard) {
                gradeButtons.filter(button => button.isConnected).forEach(button => { button.disabled = false; });
            }
        }
    }

    private sameGradeCardIdentity(current: JPDBCard, expected: JPDBCard): boolean {
        if (cardKey(current) !== cardKey(expected)) return false;
        const bunpro = current.source === 'bunpro'
            || current.reviewSource === 'bunpro-api'
            || expected.source === 'bunpro'
            || expected.reviewSource === 'bunpro-api';
        if (!bunpro) return true;
        return current.bunproReviewId === expected.bunproReviewId
            && current.bunproReviewSessionId === expected.bunproReviewSessionId
            && current.bunproReviewInputMode === expected.bunproReviewInputMode
            && current.bunproReviewEndpoint === expected.bunproReviewEndpoint;
    }

    private async gradeCurrentCardUnlocked(grade: JPDBGrade, selectedTarget?: NewTabLookupReviewTargetSelection): Promise<boolean> {
        const reviewOp = this.operations.begin('review');
        const providerContexts = this.providerContexts;
        const target = this.currentReviewableGradeTarget();
        if (!target) return false;
        const isCorrection = this.isReviewHistoryCard(target.card);
        // Offline-first: when the browser is definitely offline, queue the grade
        // straight away instead of attempting a doomed submit. The queue syncs on
        // reconnect (eventually consistent), so no review is ever lost.
        if (this.shouldQueueCurrentGradeOffline()) {
            return this.gradeOfflineCard(target, grade, selectedTarget, isCorrection, reviewOp, providerContexts);
        }
        return this.submitOnlineCurrentGrade(target, grade, selectedTarget, isCorrection, reviewOp, providerContexts);
    }

    private currentReviewableGradeTarget(): NewTabGradeTarget | null {
        const target = this.currentGradeTarget();
        if (!target || !this.canReviewCard(target.card)) return null;
        return target;
    }

    private shouldQueueCurrentGradeOffline(): boolean {
        return this.isOfflineSourceLabel(this.sourceLabel) || navigator.onLine === false;
    }

    private gradeProvidersAreCurrent(
        expected: NewTabProviderContexts,
        card: JPDBCard,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
    ): boolean {
        return newTabReviewProvidersAreCurrent(expected, this.providerContexts, this.gradeReviewTargets(card, selectedTarget));
    }

    private gradeReviewTargets(card: JPDBCard, selectedTarget: NewTabLookupReviewTargetSelection | undefined): NewTabReviewTarget[] {
        if (!selectedTarget) return this.reviewTargetsForCard(card);
        if (selectedTarget.kind === 'anki') return ['anki'];
        const target = this.reviewTargetForLookupKind(card, selectedTarget.kind);
        return target ? [target] : [];
    }

    private async submitOnlineCurrentGrade(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        isCorrection: boolean,
        reviewOp: ReturnType<OperationTracker['begin']>,
        providerContexts: NewTabProviderContexts,
    ): Promise<boolean> {
        try {
            return await this.submitCurrentGrade(target, grade, selectedTarget, isCorrection, reviewOp, providerContexts);
        } catch (error) {
            if (reviewOp.superseded) return false;
            return this.handleFailedGrade(target, grade, selectedTarget, isCorrection, error, reviewOp, providerContexts);
        }
    }

    private async gradeOfflineCard(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        isCorrection: boolean,
        reviewOp: ReturnType<OperationTracker['begin']>,
        providerContexts: NewTabProviderContexts,
    ): Promise<boolean> {
        const queueTargets = this.offlineGradeTargetsForSelection(target.card, selectedTarget);
        // A deliberately opened offline source never prompts, and neither
        // does a local-only grade (Academy/dictionary needs no network); a
        // live provider session that lost the connection asks once per
        // outage (WaniKani-style).
        if (this.shouldConfirmOfflineGrade(queueTargets)) {
            return this.confirmOrQueueOfflineGrade(target, grade, selectedTarget, isCorrection, reviewOp, providerContexts, queueTargets);
        }
        return this.queueGradeForLater(target, grade, queueTargets, isCorrection, providerContexts);
    }

    private shouldConfirmOfflineGrade(queueTargets: QueuedNewTabGradeTarget[]): boolean {
        return !this.isOfflineSourceLabel(this.sourceLabel) && this.networkGradeTargets(queueTargets);
    }

    private async confirmOrQueueOfflineGrade(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        isCorrection: boolean,
        reviewOp: ReturnType<OperationTracker['begin']>,
        providerContexts: NewTabProviderContexts,
        queueTargets: QueuedNewTabGradeTarget[],
    ): Promise<boolean> {
        const choice = await this.confirmOfflineReviewing(target.root);
        if (reviewOp.superseded) return false;
        if (choice === 'stop') return false;
        if (choice === 'retry') return this.gradeCurrentCardUnlocked(grade, selectedTarget);
        return this.queueGradeForLater(target, grade, queueTargets, isCorrection, providerContexts);
    }

    private async submitCurrentGrade(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        isCorrection: boolean,
        reviewOp: ReturnType<OperationTracker['begin']>,
        providerContexts: NewTabProviderContexts,
    ): Promise<boolean> {
        this.setStatus(target.root, this.text('grading'));
        const submittedTarget = await this.submitGrade(target.card, grade, selectedTarget);
        if (reviewOp.superseded || !this.gradeProvidersAreCurrent(providerContexts, target.card, selectedTarget)) return false;
        // A landed submit proves the connection is back even if no
        // 'online' event fired; the next outage must ask again.
        this.offlineReviewingAccepted = false;
        this.invalidateReviewSourceCache(target.card);
        this.setStatus(target.root, this.gradeSuccessStatus(grade, submittedTarget));
        this.recordCompletedReview(isCorrection);
        // Bunpro review ids and WaniKani due assignments are consumed server
        // obligations. Neither API supports reversing that review, so a local
        // undo would only resurrect a stale card and allow a duplicate submit.
        this.lastUndoableReview = newTabUndoableReview(target.card, isCorrection, this.canUndoJitenReview());
        await this.advanceAfterGrade(target.root, target.card, grade);
        return true;
    }

    private recordCompletedReview(isCorrection: boolean): void {
        if (!isCorrection) this.sessionProgress.recordReviewCompleted();
    }

    private canUndoJitenReview(): boolean {
        return typeof this.dependencies.jiten?.undoReview === 'function';
    }

    private async handleFailedGrade(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        isCorrection: boolean,
        error: unknown,
        reviewOp: ReturnType<OperationTracker['begin']>,
        providerContexts: NewTabProviderContexts,
    ): Promise<boolean> {
        log.warn('New tab grade failed', { term: target.card.spelling, source: target.card.source, grade }, error);
        if (this.localYomuStorageFailure(error)) {
            this.reportLocalYomuGradeFailure(target.root);
            return false;
        }
        if (isSessionBunproCard(target.card)) {
            // A lost response is ambiguous: Bunpro may have accepted the
            // grade and consumed this session review id. Retire the local
            // card and wait for a fresh live queue before accepting input,
            // rather than ever retrying the old id.
            await this.reloadAfterAmbiguousBunproGrade(target.root, target.card);
            return true;
        }
        const queueTargets = this.failedGradeQueueTargets(target.card, selectedTarget, error);
        return this.resolveOrQueueFailedGrade(target, grade, selectedTarget, isCorrection, error, reviewOp, providerContexts, queueTargets);
    }

    private reportLocalYomuGradeFailure(root: HTMLElement): void {
        const message = this.text('yomuLocalSrsStorageFailed');
        this.setStatus(root, message);
        this.dependencies.toast?.(message);
    }

    private failedGradeQueueTargets(
        card: JPDBCard,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        error: unknown,
    ): QueuedNewTabGradeTarget[] {
        if (selectedTarget) return this.offlineGradeTargetsForSelection(card, selectedTarget);
        return this.queueableFailedGradeTargets(error) ?? this.offlineGradeTargets(card);
    }

    private async resolveOrQueueFailedGrade(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        isCorrection: boolean,
        error: unknown,
        reviewOp: ReturnType<OperationTracker['begin']>,
        providerContexts: NewTabProviderContexts,
        queueTargets: QueuedNewTabGradeTarget[],
    ): Promise<boolean> {
        const promptResult = await this.resolveFailedGradePrompt(target, grade, selectedTarget, queueTargets, error);
        if (reviewOp.superseded) return false;
        if (promptResult !== null) return promptResult;
        return this.queueGradeForLater(target, grade, queueTargets, isCorrection, providerContexts);
    }

    private localYomuStorageFailure(error: unknown): boolean {
        if (isLocalYomuSrsStorageError(error)) return true;
        return error instanceof NewTabGradeSubmissionError
            && error.failures.some(failure => isLocalYomuSrsStorageError(failure.error));
    }

    private async resolveFailedGradePrompt(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        queueTargets: QueuedNewTabGradeTarget[],
        error: unknown,
    ): Promise<boolean | null> {
        // Only a genuine connection loss raises the dialog, and only when
        // NOTHING landed: a partial dual-target failure (one provider
        // already recorded the grade) must not offer Stop (it would strand
        // the recorded half) or Retry (it would double-grade it) — it
        // keeps the silent queue + status line, as does a provider failing
        // while the browser is online (Anki closed). Fresh onLine read via
        // window: the submit awaited, so the earlier check is stale.
        if (!this.shouldConfirmOfflineReviewAfterFailure(queueTargets, target.card, selectedTarget, error)) return null;
        const choice = await this.confirmOfflineReviewing(target.root);
        if (choice === 'stop') return false;
        if (choice !== 'retry') return null;
        // The visible card can change while the dialog is open
        // (cross-tab updates); never replay the grade onto it.
        const current = this.currentGradeTarget();
        if (!current || !this.sameGradeCardIdentity(current.card, target.card)) return false;
        return this.gradeCurrentCardUnlocked(grade, selectedTarget);
    }

    private async queueGradeForLater(
        target: NewTabGradeTarget,
        grade: JPDBGrade,
        queueTargets: QueuedNewTabGradeTarget[],
        isCorrection: boolean,
        providerContexts: NewTabProviderContexts,
    ): Promise<boolean> {
        if (!await this.tryQueueGrade(target.card, grade, queueTargets, providerContexts)) {
            this.setStatus(target.root, this.text('couldNotSubmitGrade'));
            return false;
        }
        if (!newTabReviewProvidersAreCurrent(providerContexts, this.providerContexts, queueTargets)) return true;
        this.syncPendingCount = await this.gradeQueue.pendingCount().catch(() => this.syncPendingCount + 1);
        this.setStatus(target.root, this.text('offlineGradeReconnect'));
        if (!isCorrection) this.sessionProgress.recordReviewCompleted();
        this.advanceAfterGrade(target.root, target.card, grade);
        return true;
    }

    private tryQueueGrade(
        card: JPDBCard,
        grade: JPDBGrade,
        targets: QueuedNewTabGradeTarget[],
        providerContexts: NewTabProviderContexts,
    ): Promise<boolean> {
        if (!targets.length) return Promise.resolve(false);
        return this.gradeQueue.enqueue(card, grade, targets, target => newTabReviewProviderContext(providerContexts, target));
    }

    // Local grading (Academy SRS) needs no connection, so it never raises the
    // connection-lost dialog; only queued grades bound for a network provider do.
    private networkGradeTargets(targets: QueuedNewTabGradeTarget[]): boolean {
        return targets.some(target => target !== 'yomu-local');
    }

    private shouldConfirmOfflineReviewAfterFailure(
        targets: QueuedNewTabGradeTarget[],
        card: JPDBCard,
        selectedTarget: NewTabLookupReviewTargetSelection | undefined,
        error: unknown,
    ): boolean {
        return this.networkGradeTargets(targets)
            && window.navigator.onLine === false
            && !this.partialGradeSubmission(card, selectedTarget, error);
    }

    // True when a multi-target submit failed for only SOME of its providers:
    // at least one provider already recorded this grade.
    private partialGradeSubmission(card: JPDBCard, selectedTarget: NewTabLookupReviewTargetSelection | undefined, error: unknown): boolean {
        if (!(error instanceof NewTabGradeSubmissionError)) return false;
        const attempted = selectedTarget
            ? this.offlineGradeTargetsForSelection(card, selectedTarget).length
            : this.reviewSourceSummary(card).targets.length;
        return attempted > error.failures.length;
    }

    // Asks once per outage whether to keep reviewing offline. "Continue" is
    // remembered until the browser comes back online; "stop" leaves the card
    // ungraded so nothing is queued or lost behind the user's back.
    private async confirmOfflineReviewing(root: HTMLElement): Promise<ConnectionLostChoice> {
        if (this.offlineReviewingAccepted) return 'continue';
        const choice = await showConnectionLostDialog(root.ownerDocument, {
            title: this.text('connectionLostTitle'),
            body: this.text('connectionLostBody'),
            stop: this.text('connectionLostStop'),
            continueOffline: this.text('connectionLostContinue'),
            retry: this.text('connectionLostRetry'),
        });
        if (choice === 'continue') this.offlineReviewingAccepted = true;
        if (choice === 'stop') this.setStatus(root, this.text('reviewsPausedOffline'));
        return choice;
    }

    private async reloadAfterAmbiguousBunproGrade(root: HTMLElement, card: JPDBCard): Promise<void> {
        const key = cardKey(card);
        this.lastUndoableReview = undefined;
        this.invalidateReviewSourceCache(card);
        this.allWords = this.allWords.filter(item => cardKey(item) !== key);
        this.visibleWords = this.visibleWords.filter(item => cardKey(item) !== key);
        this.visiblePoolSignature = this.newTabPoolSignature(this.visibleWords);
        this.state.revealAnswer = false;
        this.persistState();
        root.querySelectorAll<HTMLButtonElement>(newTabActionSelector('grade')).forEach(button => { button.disabled = true; });
        this.setStatus(root, this.text('couldNotSubmitGrade'));
        // The provider outcome is unknown, so other Study tabs must retire
        // their copies just as they would after a confirmed grade.
        this.publishGradedCardState(card);
        this.markQueueRefreshed();
        await this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private gradeSuccessStatus(grade: JPDBGrade, selectedTarget: NewTabLookupReviewTarget | null): string {
        const mark = passingNewTabGrade(grade) ? '✓' : '✕';
        return selectedTarget ? `${mark} ${selectedTarget.shortLabel}` : mark;
    }

    private queueableFailedGradeTargets(error: unknown): QueuedNewTabGradeTarget[] | undefined {
        if (!(error instanceof NewTabGradeSubmissionError)) return undefined;
        return queueableNewTabReviewTargets(error.failures.map(failure => failure.target));
    }

    private currentGradeTarget(): NewTabGradeTarget | null {
        const root = this.currentRoot();
        const card = this.visibleWords[this.index];
        return root && card ? { root, card } : null;
    }

    private async submitGrade(card: JPDBCard, grade: JPDBGrade, selectedTarget?: NewTabLookupReviewTargetSelection): Promise<NewTabLookupReviewTarget | null> {
        if (selectedTarget) {
            return await this.submitSelectedLookupTarget(card, selectedTarget, grade);
        }
        const targets = this.reviewTargetsForCard(card);
        if (!targets.length) throw new Error(this.text('couldNotSubmitGrade'));
        const failures: NewTabGradeFailure[] = [];
        for (const target of targets) {
            try {
                await this.submitReviewTarget(card, target, grade);
            } catch (error) {
                failures.push({ target, error });
            }
        }
        if (failures.length) throw new NewTabGradeSubmissionError(failures);
        return null;
    }

    private async submitSelectedLookupTarget(card: JPDBCard, selectedTarget: NewTabLookupReviewTargetSelection, grade: JPDBGrade): Promise<NewTabLookupReviewTarget> {
        const target = this.lookupReviewTargetForSelection(card, selectedTarget);
        if (!target) throw new Error(this.text('couldNotSubmitGrade'));
        if (target.kind === 'anki') {
            const refreshed = await this.submitAnkiGrade(card, grade, target.ankiCardId);
            const state = refreshed ? this.ankiLookupStateForCardId(refreshed, target.ankiCardId) ?? refreshed.state : null;
            return state ? this.lookupReviewTargetWithAnkiState(target, state) : target;
        }
        const apiTarget = this.reviewTargetForLookupKind(card, target.kind);
        if (!apiTarget) throw new Error(this.text('couldNotSubmitGrade'));
        await this.submitReviewTarget(card, apiTarget, grade);
        return target;
    }

    // fallow-ignore-next-line complexity
    private lookupReviewTargetForSelection(card: JPDBCard, selectedTarget: NewTabLookupReviewTargetSelection): NewTabLookupReviewTarget | null {
        const targets = this.lookupReviewTargetsForCard(card);
        if (selectedTarget.kind === 'jpdb') return targets.find(target => target.kind === 'jpdb') ?? null;
        if (selectedTarget.kind === 'jiten') return targets.find(target => target.kind === 'jiten') ?? null;
        if (selectedTarget.kind === 'bunpro') return targets.find(target => target.kind === 'bunpro') ?? null;
        if (selectedTarget.kind === 'wanikani') return targets.find(target => target.kind === 'wanikani') ?? null;
        if (selectedTarget.kind === 'yomu-local') return targets.find(target => target.kind === 'yomu-local') ?? null;
        const selectedCardId = Number(selectedTarget.ankiCardId);
        if (!Number.isFinite(selectedCardId) || selectedCardId <= 0) return null;
        return targets.find(target => target.kind === 'anki' && target.ankiCardId === selectedCardId) ?? null;
    }

    // fallow-ignore-next-line complexity
    private reviewTargetForLookupKind(card: JPDBCard, kind: NewTabLookupReviewTarget['kind']): NewTabReviewTarget | null {
        if (kind === 'jpdb') return this.reviewTargetsForCard(card).find(candidate => candidate === 'jpdb-api' || candidate === 'jpdb-live') ?? null;
        if (kind === 'jiten') return this.reviewTargetsForCard(card).find(candidate => candidate === 'jiten-api') ?? null;
        if (kind === 'bunpro') return this.reviewTargetsForCard(card).find(candidate => candidate === 'bunpro-api') ?? null;
        if (kind === 'wanikani') return this.reviewTargetsForCard(card).find(candidate => candidate === 'wanikani-api') ?? null;
        if (kind === 'yomu-local') return this.reviewTargetsForCard(card).find(candidate => candidate === 'yomu-local') ?? null;
        return null;
    }

    // Thin delegation: the per-provider grade routing now lives in one
    // table-driven adapter dispatch (NewTabReviewSubmitter). submitGrade and
    // submitSelectedLookupTarget still call this to grade a single target.
    private submitReviewTarget(card: JPDBCard, target: NewTabReviewTarget, grade: JPDBGrade): Promise<void> {
        return this.reviewSubmitter.submitTarget(card, target, grade);
    }

    // Arm the one-shot Jiten undo affordance from the submitter's review path
    // (server-reversible). gradeCurrentCard re-arms this for its own path; this
    // covers the queue-flush path, which has no gradeCurrentCard wrapper.
    private armJitenUndo(card: JPDBCard): void {
        this.lastUndoableReview = {
            card,
            at: Date.now(),
            serverUndo: typeof this.dependencies.jiten?.undoReview === 'function',
            counted: true,
        };
    }

    // New-tab side of the cross-tab card-state mutation bus: after a grade
    // lands (and the provider refresh updated this card object), pages with
    // the same word recolor immediately instead of waiting for a rescan.
    private publishGradedCardState(card: JPDBCard): void {
        try {
            publishCardStateSignal(card);
        } catch {
            // The signal is best-effort; grading already succeeded.
        }
    }

    private submitLiveJpdbGrade(card: JPDBCard, grade: JPDBGrade): void {
        if (card.reviewSource !== 'jpdb-live') throw new Error(this.text('couldNotSubmitGrade'));
        this.rememberPendingLiveJpdbGrade(card);
        this.dependencies.jpdbReviewBridge.grade(grade);
        this.dependencies.jpdbReviewBridge.requestCurrent();
        void this.publishLiveGradedCardState(card);
    }

    // P0 mutation-bus remainder: the graded card's new state lives on
    // jpdb.io. With an API key and real ids we read the truth back and
    // broadcast it so other tabs recolor; keyless live grading stays
    // signal-less rather than guessing jpdb's state machine.
    private async publishLiveGradedCardState(card: JPDBCard): Promise<void> {
        if (!(card.vid > 0) || !hasJpdbApiCredential(this.dependencies.getSettings())) return;
        const jpdb = this.dependencies.jpdb as { refreshCardState?: (card: JPDBCard) => Promise<void> };
        if (typeof jpdb.refreshCardState !== 'function') return;
        await new Promise(resolve => window.setTimeout(resolve, NEW_TAB_LIVE_GRADE_REFRESH_DELAY_MS));
        try {
            await jpdb.refreshCardState(card);
            this.publishGradedCardState(card);
        } catch {
            // Best-effort: the live grade itself already landed on jpdb.io.
        }
    }

    private renderBatchComplete(root: HTMLElement): void {
        const slots = this.studySlots(root);
        root.classList.remove('jpdb-reader-newtab-revealed');
        this.renderPromptSlot(slots.prompt, this.text('batchComplete'), resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en');
        setOptionalText(slots.answer, '');
        const snapshot = this.sessionProgress.snapshot([]);
        setOptionalText(slots.meaning, `${this.text('sessionDone')} ${snapshot.completedReviews}`);
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        if (slots.controls) {
            slots.controls.hidden = false;
            slots.controls.classList.remove('jpdb-reader-newtab-grade-controls');
            slots.controls.dataset.newtabControlCount = '1';
            slots.controls.dataset.newtabGradeControls = 'false';
            delete slots.controls.dataset.newtabGradeCount;
            delete slots.controls.dataset.newtabGradeScale;
            replaceChildrenWith(slots.controls,
                el('button', { type: 'button', dataset: { newtabAction: newTabAction('continue-batch') } }, this.text('continueStudying')),
            );
        }
    }

    private async continueAfterBatch(root: HTMLElement): Promise<void> {
        this.setStatus(root, this.text('loading'));
        await this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private lastUndoableReview?: { card: JPDBCard; at: number; serverUndo: boolean; counted: boolean };

    private canUndoLastReview(): boolean {
        return Boolean(this.lastUndoableReview
            && Date.now() - this.lastUndoableReview.at < NEW_TAB_UNDO_REVIEW_WINDOW_MS);
    }

    private async undoLastReview(root: HTMLElement): Promise<void> {
        const last = this.takeLastUndoableReview();
        if (!last) return;
        if (!last.serverUndo) {
            this.restoreLocallyUndoneCard(root, last);
            return;
        }
        await this.undoServerReview(root, last);
    }

    private takeLastUndoableReview(): typeof this.lastUndoableReview {
        if (!this.canUndoLastReview()) return undefined;
        const last = this.lastUndoableReview;
        this.lastUndoableReview = undefined;
        return last;
    }

    private async undoServerReview(root: HTMLElement, last: NonNullable<typeof this.lastUndoableReview>): Promise<void> {
        const providerContext = this.providerContexts.jiten;
        try {
            // The provider-side reversal (undoReview + state refresh + broadcast)
            // is the Jiten adapter's undo; the controller keeps the local
            // card-restoration and toast around it.
            await this.reviewSubmitter.undoServerReview(last.card);
            if (providerContext !== this.providerContexts.jiten) return;
            this.showToast('reviewUndone');
            this.restoreUndoneCardToFront(root, last.card);
        } catch (error) {
            log.warn('Undo review failed', error);
            this.showToast('undoReviewFailed');
        }
    }

    private showToast(key: NewTabTextKey): void {
        this.dependencies.toast?.(this.text(key));
    }

    // UT-57: JPDB's API and AnkiConnect cannot reverse a submitted review, so
    // undo re-queues the card locally — the upstream review stands, but the
    // card comes straight back for regrading (which counts as a correction).
    private restoreLocallyUndoneCard(root: HTMLElement, last: NonNullable<typeof this.lastUndoableReview>): void {
        if (last.counted) this.sessionProgress.recordReviewUndone();
        if (!this.allWords.some(card => cardKey(card) === cardKey(last.card))) {
            this.allWords = [normalizeNewTabCard(last.card), ...this.allWords];
        }
        this.dependencies.toast?.(this.text('reviewRequeuedLocally'));
        this.restoreUndoneCardToFront(root, last.card);
    }

    private restoreUndoneCardToFront(root: HTMLElement, card: JPDBCard): void {
        if (!this.visibleWords.some(item => cardKey(item) === cardKey(card))) {
            this.visibleWords = [normalizeNewTabCard(card), ...this.visibleWords];
        }
        this.visibleWords = promoteCardByKey(this.visibleWords, cardKey(card));
        this.index = 0;
        this.state = { ...this.state, revealAnswer: false };
        this.renderWord(root, this.visibleWords[this.index] ?? card);
        this.playCardEnterTransition(root);
    }

    private async submitAnkiGrade(card: JPDBCard, grade: JPDBGrade, explicitCardId?: number): Promise<AnkiLookupResult | null> {
        const cardId = this.requiredAnkiCardId(card, explicitCardId);
        const providerContext = this.providerContexts.anki;
        await this.dependencies.anki.answerCard(cardId, grade);
        if (providerContext !== this.providerContexts.anki) return null;
        try {
            return await this.refreshAnkiReviewCardState(card, cardId, providerContext);
        } finally {
            this.publishAnkiGradeIfCurrent(card, providerContext);
        }
    }

    private requiredAnkiCardId(card: JPDBCard, explicitCardId?: number): number {
        const cardId = explicitCardId ?? this.ankiCardIdForReview(card);
        if (!cardId) throw new Error(this.text('missingAnkiCardId'));
        return cardId;
    }

    private publishAnkiGradeIfCurrent(card: JPDBCard, providerContext: string): void {
        if (providerContext !== this.providerContexts.anki) return;
        this.dependencies.onAnkiStatusChanged?.(card);
        this.publishGradedCardState(card);
    }

    private async refreshAnkiReviewCardState(card: JPDBCard, preferredCardId?: number, providerContext = this.providerContexts.anki): Promise<AnkiLookupResult | null> {
        if (!this.dependencies.anki.findExistingCards) return null;
        const lookup = await this.dependencies.anki.findExistingCards(card);
        if (providerContext !== this.providerContexts.anki) return null;
        this.applyAnkiLookupToReviewCard(card, lookup, preferredCardId);
        return lookup;
    }

    private applyAnkiLookupToReviewCard(card: JPDBCard, lookup: AnkiLookupResult, preferredCardId?: number): void {
        const primary = this.ankiLookupNoteForCardId(lookup, preferredCardId) ?? lookup.primary;
        card.cardState = [primary?.state ?? lookup.state];
        if (!primary) {
            card.ankiCardId = undefined;
            card.ankiNoteId = undefined;
            card.ankiDeckNames = undefined;
            card.ankiModelName = undefined;
            card.ankiReps = undefined;
            card.ankiLapses = undefined;
            card.ankiRenderedCards = undefined;
            card.ankiAudioFilenames = undefined;
            return;
        }
        const preferredCard = Number(preferredCardId);
        card.ankiCardId = this.ankiNoteHasCardId(primary, preferredCard) ? preferredCard : primary.primaryCardId ?? card.ankiCardId;
        card.ankiNoteId = primary.noteId;
        card.ankiDeckNames = primary.deckNames;
        card.ankiModelName = primary.modelName;
        card.ankiReps = primary.reps;
        card.ankiLapses = primary.lapses;
        card.ankiRenderedCards = primary.renderedCards?.map(rendered => ({
            cardId: rendered.cardId,
            deckName: rendered.deckName,
            ...(rendered.cardName ? { cardName: rendered.cardName } : {}),
            question: rendered.question,
            answer: rendered.answer,
            ...(rendered.mediaDataUrls ? { mediaDataUrls: rendered.mediaDataUrls } : {}),
        }));
        card.ankiAudioFilenames = ankiAudioFilenamesFromFields(primary.fields);
    }

    private ankiLookupStateForCardId(lookup: AnkiLookupResult, cardId: number | undefined): CardState | null {
        return this.ankiLookupNoteForCardId(lookup, cardId)?.state ?? null;
    }

    private ankiLookupNoteForCardId(lookup: AnkiLookupResult, cardId: number | undefined): AnkiExistingNote | null {
        const target = Number(cardId);
        if (!Number.isFinite(target) || target <= 0) return null;
        return lookup.notes.find(note => this.ankiNoteHasCardId(note, target)) ?? null;
    }

    private ankiNoteHasCardId(note: AnkiExistingNote, cardId: number): boolean {
        return Number.isFinite(cardId)
            && cardId > 0
            && (
                note.primaryCardId === cardId
                || note.cardIds.includes(cardId)
                || Boolean(note.renderedCards?.some(rendered => rendered.cardId === cardId))
            );
    }

    private lookupReviewTargetWithAnkiState(target: NewTabLookupReviewTarget, state: CardState): NewTabLookupReviewTarget {
        return {
            ...target,
            shortLabel: `${target.shortLabel} · ${searchCardStateLabel(state, this.language())}`,
        };
    }

    private invalidateReviewSourceCache(card: JPDBCard): void {
        const targets = this.reviewTargetsForCard(card);
        if (targets.includes('anki')) this.invalidateSourceResultCache('anki');
        if (targets.some(target => target === 'jpdb-api' || target === 'jpdb-live' || target === 'jiten-api')) this.invalidateSourceResultCache('jpdb');
        if (targets.includes('bunpro-api')) this.invalidateSourceResultCache('bunpro');
        if (targets.includes('wanikani-api') || card.source === 'wanikani' || card.reviewSource === 'wanikani-api') this.invalidateSourceResultCache('wanikani');
        if (targets.includes('yomu-local')) this.invalidateSourceResultCache('yomu-local');
    }

    private ankiCardIdForReview(card: JPDBCard): number | null {
        const cardId = card.ankiCardId ?? (card.source === 'anki' || card.reviewSource === 'anki' ? card.rid : undefined);
        return Number.isFinite(Number(cardId)) && Number(cardId) > 0 ? Number(cardId) : null;
    }

    private offlineGradeTarget(card: JPDBCard): QueuedNewTabGradeTarget | null {
        return this.offlineGradeTargets(card)[0] ?? null;
    }

    private async flushQueuedGrades(): Promise<void> {
        const remaining = await this.gradeQueue.flush();
        this.syncPendingCount = remaining;
        if (remaining === 0) this.lastSyncedAt = Date.now();
        this.refreshSessionProgressSoon();
    }

    // Thin delegation to the same table-driven adapter dispatch the live grade
    // path uses; the Bunpro migration guard is handled inside the submitter.
    private submitQueuedGrade(item: QueuedNewTabGrade): Promise<boolean> {
        return this.reviewSubmitter.submitQueued(item);
    }

    private advanceAfterGrade(root: HTMLElement, card: JPDBCard, grade?: JPDBGrade): void | Promise<void> {
        const key = cardKey(card);
        const previousIndex = this.index;
        const nextKey = this.nextVisibleReviewCardKeyAfterGrade(key, previousIndex);
        this.rememberReviewHistoryCard(card);
        // Auto-seed the pitch deck from normal study: a passing vocab review adds the
        // word's pitch contour as a Listen SRS item (idempotent — never resets an
        // existing schedule), so the Listen deck grows as a byproduct of studying,
        // mirroring how kanji items relate to the vocab you review.
        if (this.isVocabularyStudyRoute() && grade && !isFailedNewTabGrade(grade)) {
            this.pitchSrs.ensureFromCard(card, Date.now());
        }
        // jpdb-style failed-card loop (community ask): a failed grade keeps
        // the card in this session's pool so it comes back around until
        // passed, instead of disappearing until the next batch fetch.
        if (grade && isFailedNewTabGrade(grade) && this.reviewCountMode && card.reviewSource !== 'bunpro-api') {
            this.requeueFailedCard(root, key, previousIndex);
            return;
        }
        this.allWords = this.allWords.filter(item => cardKey(item) !== key);
        this.visibleWords = this.studyPoolForCurrentMode();
        this.visiblePoolSignature = this.newTabPoolSignature(this.visibleWords);
        this.state.revealAnswer = false;
        this.persistState();
        if (card.reviewSource === 'bunpro-api') {
            // Bunpro can immediately create a wrap-up/ghost retry (sometimes
            // under the same id). The live queue must decide what comes next,
            // even when this was the last visible card or stop-at-batch is on.
            this.markQueueRefreshed();
            return this.loadWordsInto(root, false, { useOfflineCache: false });
        }
        const nextIndex = this.resolvePostGradeIndex(nextKey, previousIndex);
        if (nextIndex < 0) {
            this.clearReviewHistory();
            this.visibleWords = [];
            this.visiblePoolSignature = '';
            // Community ask (Jiten #jiten-suggestions 2026-06-09): an opt-in
            // breather at the end of each batch instead of silently fetching
            // the next one.
            if (this.reviewCountMode && this.dependencies.getSettings().newTabStopAtBatchEnd) {
                this.renderBatchComplete(root);
                return;
            }
            this.markQueueRefreshed();
            void this.loadWordsInto(root, false, { useOfflineCache: false });
            return;
        }
        this.index = nextIndex;
        this.renderWord(root, this.visibleWords[this.index]);
        this.playCardEnterTransition(root);
        this.gradesSinceQueueRefresh += 1;
        this.recentlyGradedCardKeys.push(key);
        if (this.shouldRefreshQueueAfterGrade(card) && this.queueRefreshDueAfterGrade()) {
            const excludeCardKeys = this.recentlyGradedCardKeys.slice(-40);
            this.markQueueRefreshed();
            void this.loadWordsInto(root, true, {
                useOfflineCache: false,
                quiet: true,
                excludeCardKeys,
                preserveVisibleOrder: true,
            });
        }
    }

    // Refresh when the local pool is running dry, every N grades, or when the
    // queue view is stale — never on every single grade.
    private queueRefreshDueAfterGrade(): boolean {
        return this.visibleWords.length < QUEUE_REFRESH_LOW_WATER
            || this.gradesSinceQueueRefresh >= QUEUE_REFRESH_GRADE_INTERVAL
            || Date.now() - this.lastQueueRefreshAt > QUEUE_REFRESH_MAX_AGE_MS;
    }

    private markQueueRefreshed(): void {
        this.gradesSinceQueueRefresh = 0;
        this.lastQueueRefreshAt = Date.now();
        this.recentlyGradedCardKeys = this.recentlyGradedCardKeys.slice(-40);
    }

    // UT-45: button grades advance with the same brief card-enter motion the
    // swipe commit produces, so the two grading paths feel identical.
    // (prefers-reduced-motion disables it in CSS.)
    private playCardEnterTransition(root: HTMLElement): void {
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (!study) return;
        study.classList.remove('jpdb-reader-newtab-card-fresh');
        void study.offsetWidth;
        study.classList.add('jpdb-reader-newtab-card-fresh');
        study.addEventListener('animationend', () => study.classList.remove('jpdb-reader-newtab-card-fresh'), { once: true });
    }

    private requeueFailedCard(root: HTMLElement, gradedKey: string, previousIndex: number): void {
        const pool = this.visibleWords.filter(item => cardKey(item) !== gradedKey);
        const failed = this.visibleWords.find(item => cardKey(item) === gradedKey);
        this.visibleWords = failed ? [...pool, failed] : pool;
        this.state.revealAnswer = false;
        this.persistState();
        if (!pool.length) {
            // The failed card is the only one left: show it again directly.
            this.index = 0;
            this.renderWord(root, this.visibleWords[0] ?? this.allWords[0]!);
            this.playCardEnterTransition(root);
            return;
        }
        this.index = Math.min(previousIndex, this.visibleWords.length - 1);
        this.renderWord(root, this.visibleWords[this.index]!);
        this.playCardEnterTransition(root);
    }

    private nextVisibleReviewCardKeyAfterGrade(gradedKey: string, startIndex: number): string {
        for (let offset = 1; offset < this.visibleWords.length; offset += 1) {
            const index = (startIndex + offset + this.visibleWords.length) % this.visibleWords.length;
            const candidate = this.visibleWords[index];
            if (candidate && cardKey(candidate) !== gradedKey && !this.isReviewHistoryCard(candidate)) return cardKey(candidate);
        }
        return '';
    }

    private resolvePostGradeIndex(nextKey: string, previousIndex: number): number {
        if (nextKey) {
            const index = this.visibleWords.findIndex(card => cardKey(card) === nextKey && !this.isReviewHistoryCard(card));
            if (index >= 0) return index;
        }
        return this.nextActiveReviewIndex(Math.min(previousIndex, Math.max(0, this.visibleWords.length - 1)));
    }

    private nextActiveReviewIndex(startIndex: number): number {
        if (!this.visibleWords.length) return -1;
        for (let offset = 0; offset < this.visibleWords.length; offset += 1) {
            const index = (startIndex + offset + this.visibleWords.length) % this.visibleWords.length;
            if (!this.isReviewHistoryCard(this.visibleWords[index])) return index;
        }
        return -1;
    }

    private shouldRefreshQueueAfterGrade(card: JPDBCard): boolean {
        return this.state.source !== 'dictionary'
            && card.reviewSource !== 'jpdb-live'
            && this.isReviewCard(card)
            && !this.isOfflineSourceLabel(this.sourceLabel);
    }

    private applyJpdbBridgeStatus(status: JpdbReviewBridgeStatus): void {
        this.liveJpdbStatus = status;
        const root = this.jpdbBridgeRoot();
        if (!root) return;
        if (!status.card) {
            this.clearLiveJpdbReviewCard(root);
            return;
        }
        if (this.isPendingLiveJpdbCard(status.card)) return;
        const card = this.cardFromLiveJpdb(status.card);
        if (!card) return;
        const previousVisibleCard = this.sourceCardForVisibleCard(this.visibleWords[this.index]);
        const preservePreviousVisibleCard = this.shouldPreserveVisibleCardAfterLiveJpdbUpdate(previousVisibleCard, card);
        const preferredCardKey = preservePreviousVisibleCard
            ? this.currentVisibleWordKey()
            : this.cardSelectionKey(card);
        this.upsertLiveJpdbCard(card);
        if (preservePreviousVisibleCard) this.keepVisibleCardInQueue(previousVisibleCard);
        this.applyWords(root, true, preferredCardKey);
    }

    private clearLiveJpdbReviewCard(root: HTMLElement): void {
        if (!this.allWords.some(card => card.reviewSource === 'jpdb-live')) return;
        const previousKey = this.currentVisibleWordKey();
        this.allWords = this.allWords.filter(card => card.reviewSource !== 'jpdb-live');
        this.visibleWords = this.visibleWords.filter(card => card.reviewSource !== 'jpdb-live');
        this.liveCards.clear();
        this.visiblePoolSignature = '';
        this.applyWords(root, true, previousKey);
    }

    private shouldPreserveVisibleCardAfterLiveJpdbUpdate(previous: JPDBCard | undefined, nextLiveCard: JPDBCard): boolean {
        if (!previous) return false;
        if (previous.reviewSource !== 'jpdb-live') return true;
        return liveJpdbCardIdentity(previous) === liveJpdbCardIdentity(nextLiveCard);
    }

    private jpdbBridgeRoot(): HTMLElement | null {
        if (this.state.source !== 'jpdb' && this.state.source !== 'auto') return null;
        return this.currentRoot();
    }

    private upsertLiveJpdbCard(card: JPDBCard): void {
        const existingIndex = this.allWords.findIndex(item => item.reviewSource === 'jpdb-live');
        if (existingIndex >= 0) this.allWords.splice(existingIndex, 1, card);
        else this.allWords.unshift(card);
    }

    private keepVisibleCardInQueue(card: JPDBCard | undefined): void {
        if (!card) return;
        if (this.allWords.some(item => cardKey(item) === cardKey(card))) return;
        this.allWords.unshift(normalizeNewTabCard(card));
    }

    private liveCardFromBridge(): JPDBCard | null {
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus();
        return status.card && !this.isPendingLiveJpdbCard(status.card) ? this.cardFromLiveJpdb(status.card) : null;
    }

    private cardFromLiveJpdb(card: JpdbReviewBridgeCard): JPDBCard | null {
        const spelling = card.kind === 'kanji' ? card.kanji : card.spelling;
        if (!spelling) return null;
        const jpdbCard = liveJpdbCardFromBridgeCard(card, spelling);
        this.liveCards.set(cardKey(jpdbCard), card);
        return jpdbCard;
    }

    private rememberPendingLiveJpdbGrade(card: JPDBCard): void {
        const id = liveJpdbCardIdentity(card);
        this.pendingLiveJpdbGrade = id
            ? { id, until: Date.now() + NEW_TAB_LIVE_REVIEW_STALE_MS }
            : null;
    }

    private isPendingLiveJpdbCard(card: JpdbReviewBridgeCard): boolean {
        const pending = this.pendingLiveJpdbGrade;
        if (!pending) return false;
        if (Date.now() > pending.until || card.id !== pending.id) {
            this.pendingLiveJpdbGrade = null;
            return false;
        }
        return true;
    }

    private async writeOfflineCache(cards: JPDBCard[], sourceLabel: string): Promise<void> {
        await this.targetResources.writeOffline(cards, sourceLabel);
    }

    private async readOfflineCache(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> {
        const cached = await this.targetResources.readOffline();
        return {
            cards: cached.cards,
            sourceLabel: this.localizedSourceLabel(cached.sourceLabel || this.text('cachedReviews')),
        };
    }

    private renderReaderWord(card: JPDBCard, state: string, text = card.spelling, sentence = card.sentence || card.spelling): HTMLSpanElement {
        const sourceClass = renderedWordSourceVisualClass(card);
        const pitchClass = newTabPitchClass(card);
        const reading = newTabCardReading(card);
        const word = el('span', {
            class: `jpdb-reader-word ${sourceClass}-${state} jpdb-pitch-${pitchClass}`,
            dataset: {
                action: 'lookup',
                term: text,
                expression: card.spelling,
                reading,
                pitchClass,
                pitchAccent: card.pitchAccent.join('|'),
                sentence,
            },
            tabIndex: -1,
        }, text);
        bindRenderedWordCardIdentity(word, card, state);
        if ([this.state.revealAnswer, text === card.spelling].every(Boolean)) {
            setInnerHtml(word, renderCardSpellingWithFurigana(card, {
                ...this.dependencies.getSettings(),
                furiganaMode: 'all',
                showFurigana: true,
            }, { enabled: true, label: this.text('showKanji') }));
            word.dataset.yomuHeadword = 'true';
        }
        bindPrivateCommandCapability(word, { kind: 'kanji-word', expression: card.spelling, reading });
        return word;
    }

    private hidePromptPronunciation(word: HTMLElement): void {
        for (const cls of Array.from(word.classList)) {
            if (cls.startsWith('jpdb-pitch-')) word.classList.remove(cls);
        }
        word.classList.add('jpdb-pitch-unknown');
        delete word.dataset.pitchClass;
    }

    private async enrichWordPitch(root: HTMLElement, card: JPDBCard): Promise<void> {
        if (!this.shouldEnrichWordPitch(card)) return;
        const key = this.targetResources.wordPitchKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        root.dataset.newtabPitchRequest = requestId;
        const pitchAccent = await this.loadWordPitch(card);
        if (root.dataset.newtabPitchRequest !== requestId || !pitchAccent.length) return;
        if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
        if (this.upgradeStudyPlanPitchAvailability(card)) return;
        if (!this.state.revealAnswer) return;
        this.updateRenderedWordPitch(root, card);
    }

    private prefetchNearbyWordPitch(card: JPDBCard): void {
        if (!this.shouldPrefetchWordPitch()) return;
        this.prefetchWordPitch(card);
        this.prefetchNearbyCards(card, nearby => {
            void this.waitForIdle().then(() => this.prefetchWordPitch(nearby));
        });
    }

    private shouldPrefetchWordPitch(): boolean {
        return this.isVocabularyStudyRoute()
            && this.visibleWords.length > 0
            && this.dependencies.getSettings().showPitchAccent;
    }

    private prefetchWordPitch(card: JPDBCard): void {
        if (!this.shouldEnrichWordPitch(card)) return;
        void this.loadWordPitch(card).then(pitchAccent => {
            if (!card.pitchAccent.length && pitchAccent.length) card.pitchAccent = pitchAccent;
        }).catch(() => undefined);
    }

    private shouldEnrichWordPitch(card: JPDBCard): boolean {
        return usesJapaneseProviders()
            && !card.pitchAccent.length
            && Boolean(card.spelling.trim());
    }

    private loadWordPitch(card: JPDBCard): Promise<string[]> {
        return this.targetResources.loadWordPitch(card);
    }

    private updateRenderedWordPitch(root: HTMLElement, card: JPDBCard): void {
        const pitchClass = newTabPitchClass(card);
        root.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
            if (!this.isRenderedWordForCard(word, card)) return;
            for (const cls of Array.from(word.classList)) {
                if (cls.startsWith('jpdb-pitch-')) word.classList.remove(cls);
            }
            word.classList.add(`jpdb-pitch-${pitchClass}`);
            word.dataset.pitchClass = pitchClass;
        });
    }

    private isRenderedWordForCard(word: HTMLElement, card: JPDBCard): boolean {
        return [
            renderedWordHasCardIdentity(word, card),
            renderedWordTextIdentityMatches(
                card.spelling,
                newTabCardReading(card),
                [word.dataset.expression],
                word.dataset.reading,
            ),
        ].some(Boolean);
    }

    private syncMode(root: HTMLElement): void {
        this.migrateLegacyState(this.visibleWords[this.index]);
        this.syncKeyHintVisibility(root);
        root.classList.toggle('jpdb-reader-newtab-search-mode', this.state.route === 'search');
        root.classList.toggle('jpdb-reader-newtab-recall-mode', this.activeStudyStepKind() === 'recall-cloze');
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.wordSessionRendersKanji());
        root.classList.toggle('jpdb-reader-newtab-stats-mode', this.state.route === 'stats');
        root.classList.toggle('jpdb-reader-newtab-listen-mode', this.activeStudyStepIsListen());
        const search = root.querySelector<HTMLElement>('[data-newtab-search]');
        if (search) search.hidden = this.state.route !== 'search';
        const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
        if (controls) controls.hidden = this.state.route === 'stats';
        if (this.state.route !== 'search') root.querySelector<HTMLElement>('[data-newtab-handwriting]')?.remove();
        root.querySelectorAll<HTMLButtonElement>(newTabActionSelector('mode')).forEach(button => {
            const active = button.dataset.mode === this.state.route
                || (button.dataset.mode === 'word' && this.state.route === 'study');
            button.dataset.active = String(active);
            button.setAttribute('aria-pressed', String(active));
        });
        this.syncDeckSelector(root);
        this.syncStateFilterSelector(root);
    }

    // JPDB deck-browse "Show only" parity: the persisted state filter for the
    // Word tab pool, rendered as a compact select beside the deck scope.
    private syncStateFilterSelector(root: HTMLElement): void {
        const select = root.querySelector<HTMLSelectElement>('[data-newtab-filter-select]');
        if (!select) return;
        // Without any provider credential every card is plain dictionary
        // study — state filters have nothing to filter and only confuse
        // (user-reported), so keyless setups never see the dropdown.
        const settings = this.dependencies.getSettings();
        const hasProvider = hasJpdbApiCredential(settings)
            || hasJitenApiCredential(settings)
            || Boolean(settings.ankiEnabled && settings.newTabAnkiEnabled);
        const show = this.isVocabularyStudyRoute() && hasProvider;
        select.hidden = !show;
        if (!show) return;
        replaceChildrenWith(select, NEW_TAB_FILTERS.map(filter => el('option', {
            value: filter.value,
            selected: filter.value === this.state.filter,
        }, uiText(this.language(), filter.labelKey))));
        select.value = this.state.filter;
    }

    // Study-hub parity SH-6: an in-page JPDB deck scope for the study queue,
    // mirroring jpdb.io's per-deck Learn entry. Visible only when a JPDB API
    // key is configured and the Word tab can include jpdb-api cards.
    private syncDeckSelector(root: HTMLElement): void {
        const select = root.querySelector<HTMLSelectElement>('[data-newtab-deck-select]');
        if (!select) return;
        const requestGeneration = ++this.deckSelectorGeneration;
        const settings = this.dependencies.getSettings();
        const mode = newTabDeckSelectorMode({
            state: this.state,
            vocabularyStudy: this.isVocabularyStudyRoute(),
            settings,
        });
        select.hidden = mode === 'hidden';
        if (mode === 'anki') void this.populateAnkiDeckSelector(select, requestGeneration);
        if (mode === 'jpdb') void this.populateDeckSelector(select, settings, requestGeneration);
    }

    private async populateAnkiDeckSelector(select: HTMLSelectElement, requestGeneration: number): Promise<void> {
        const allVocabularyLabel = this.text('allVocabularyDeck');
        const selection = newTabAnkiDeckSelection(this.state.ankiDeck, allVocabularyLabel);
        this.primeDeckSelector(select, selection.id, selection.label);
        const names = await this.loadAnkiDeckNames();
        if (!this.canApplyDeckSelector(select, requestGeneration)) return;
        // UT-46: per-deck due counts straight from Anki's own scheduler
        // search — pick a deck knowing what's waiting in it.
        const dueByDeck = await this.ankiDeckDueCounts(names.filter(Boolean));
        if (!this.canApplyDeckSelector(select, requestGeneration)) return;
        renderDeckSelectorOptions(select, newTabAnkiDeckSelectorOptions(names, dueByDeck, selection, allVocabularyLabel), selection.id);
    }

    private loadAnkiDeckNames(): Promise<string[]> {
        const invoke = this.dependencies.anki.invoke;
        if (typeof invoke !== 'function') return Promise.resolve([]);
        return invoke<string[]>('deckNames').catch((): string[] => []);
    }

    private ankiDeckDueCountsCache?: { at: number; promise: Promise<Map<string, number>> };

    private ankiDeckDueCounts(deckNames: string[]): Promise<Map<string, number>> {
        const invoke = this.dependencies.anki.invoke;
        if (typeof invoke !== 'function' || !deckNames.length) return Promise.resolve(new Map());
        const now = Date.now();
        if (this.ankiDeckDueCountsCache && now - this.ankiDeckDueCountsCache.at < 60_000) return this.ankiDeckDueCountsCache.promise;
        const promise = (async () => {
            const counts = new Map<string, number>();
            // getDeckStats answers every deck in one call where available.
            const stats = await invoke<Record<string, { name?: string; review_count?: number; learn_count?: number; new_count?: number }>>('getDeckStats', { decks: deckNames }).catch(() => null);
            if (stats && typeof stats === 'object' && !Array.isArray(stats) && Object.keys(stats).length) {
                for (const value of Object.values(stats)) {
                    if (!value || typeof value !== 'object' || typeof value.name !== 'string') continue;
                    counts.set(value.name, Number(value.review_count ?? 0) + Number(value.learn_count ?? 0));
                }
                return counts;
            }
            await Promise.all(deckNames.slice(0, 24).map(async name => {
                const cards = await invoke<number[]>('findCards', { query: `deck:"${name.replace(/"/g, '')}" is:due` }).catch((): number[] => []);
                counts.set(name, Array.isArray(cards) ? cards.length : 0);
            }));
            return counts;
        })().catch(() => new Map<string, number>());
        this.ankiDeckDueCountsCache = { at: now, promise };
        return promise;
    }

    private async populateDeckSelector(
        select: HTMLSelectElement,
        settings: ReaderSettings,
        requestGeneration = ++this.deckSelectorGeneration,
    ): Promise<void> {
        const initial = newTabJpdbDeckSelectorModel({
            state: this.state,
            settings,
            allVocabularyLabel: this.text('allVocabularyDeck'),
        });
        this.primeDeckSelector(select, initial.selected, this.deckSelectorFallbackLabel(initial.selected));
        if (!initial.supportsProviderDecks) {
            renderDeckSelectorOptions(select, initial.options, initial.selected);
            return;
        }
        const decks = await this.cachedJpdbDecks(settings);
        const jitenDecks = await this.jitenDeckSelectorOptions(settings);
        if (!this.canApplyDeckSelector(select, requestGeneration)) return;
        const model = newTabJpdbDeckSelectorModel({
            // A newer request owns state changes after the async provider loads.
            state: { jpdbDeck: initial.selected },
            settings,
            jpdbDecks: decks,
            jitenDecks,
            allVocabularyLabel: this.text('allVocabularyDeck'),
        });
        renderDeckSelectorOptions(select, model.options, model.selected);
    }

    private canApplyDeckSelector(select: HTMLSelectElement, requestGeneration: number): boolean {
        return requestGeneration === this.deckSelectorGeneration
            && select.isConnected
            && usesJapaneseProviders();
    }

    private primeDeckSelector(select: HTMLSelectElement, selected: string, label: string): void {
        const existing = Array.from(select.options).find(option => option.value === selected);
        if (existing && existing.textContent?.trim()) {
            select.value = selected;
            return;
        }
        const optionLabel = label.trim() || selected || this.text('allVocabularyDeck');
        replaceChildrenWith(select, el('option', { value: selected, selected: true }, optionLabel));
        select.value = selected;
    }

    private deckSelectorFallbackLabel(selected: string): string {
        if (selected === 'all' || selected === JPDB_ALL_DECKS) return this.text('allVocabularyDeck');
        if (selected === 'provider:jpdb') return 'JPDB';
        if (selected === 'provider:jiten') return 'Jiten';
        return selected;
    }

    private async toggleTheme(root: HTMLElement): Promise<void> {
        const settings = this.dependencies.getSettings();
        const current = this.effectiveTheme(settings.theme);
        settings.theme = current === 'dark' ? 'light' : 'dark';
        await this.dependencies.onSettingsChange(['theme']);
        this.dependencies.applyTheme();
        this.syncThemeToggle(root);
    }

    private async toggleInterfaceLanguage(_root: HTMLElement): Promise<void> {
        const settings = this.dependencies.getSettings();
        settings.interfaceLanguage = nextExplicitUiLanguage(settings.interfaceLanguage);
        await this.dependencies.onSettingsChange(['interfaceLanguage']);
        await this.renderPage();
    }

    private syncThemeToggle(root: HTMLElement): void {
        const theme = this.effectiveTheme(this.dependencies.getSettings().theme);
        root.dataset.newtabTheme = theme;
        const button = root.querySelector<HTMLButtonElement>(newTabActionSelector('theme'));
        if (!button) return;
        const label = this.text(theme === 'dark' ? 'switchToLightTheme' : 'switchToDarkTheme');
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-checked', String(theme === 'dark'));
        button.title = label;
    }

    private effectiveTheme(theme: ReaderSettings['theme']): 'dark' | 'light' {
        if (theme === 'dark' || theme === 'light') return theme;
        return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    private setStatus(root: HTMLElement, message: string): void {
        const status = root.querySelector<HTMLElement>('[data-newtab-status]');
        this.renderPlainStatus(status, message);
    }

    private currentSessionSignature(): string {
        return [this.state.source, this.state.route, this.sourceLabel].join('|');
    }

    private readStoredWordKey(): { signature: string; key: string } | null {
        try {
            const raw = managedSessionStorage.getItem(SESSION_WORD_KEY);
            if (!raw) return null;
            const value = JSON.parse(raw) as Partial<{ signature: string; key: string }>;
            return typeof value.signature === 'string' && typeof value.key === 'string' ? { signature: value.signature, key: value.key } : null;
        } catch {
            return null;
        }
    }

    // Unrevealed history entries use the same controller-local opaque identity
    // as the DOM. Reveal replaces that entry with the deliberate portable URL;
    // only moving to another card pushes a new history entry.
    private lastSyncedCardSelectionKey = '';
    private lastSyncedCardRouteSignature = '';
    private handlingCardPopstate = false;

    private syncCardUrl(card: JPDBCard): void {
        if (!this.isVocabularyStudyRoute() || typeof history === 'undefined') return;
        // Only standalone Study owns its URL. An Academy host remains clean even
        // if a test or future shell happens to mount it on a Study-shaped path.
        if (this.options.host || this.options.surface === 'academy' || !isYomuNewTabUrl(location.href)) return;
        const key = this.cardSelectionKey(card);
        const route = this.studyCardRoute(card, key);
        const update = planStudyCardHistoryUpdate({
            href: location.href,
            route,
            selectionKey: key,
            previousSelectionKey: this.lastSyncedCardSelectionKey,
            previousRouteSignature: this.lastSyncedCardRouteSignature,
            handlingPopstate: this.handlingCardPopstate,
        });
        if (!update) return;
        try {
            const mutate = update.action === 'push' ? history.pushState : history.replaceState;
            mutate.call(history, null, '', update.url);
        } catch {
            // History can be unavailable (sandboxed frames) — non-fatal.
        }
        this.lastSyncedCardSelectionKey = update.selectionKey;
        this.lastSyncedCardRouteSignature = update.routeSignature;
    }

    private cardKeyFromLocation(): string {
        const route = readStudyCardRoute(location.href);
        if (!route) return '';
        if (route.kind === 'portable') return route.key;
        const card = this.studyCardsByDomToken.get(route.token);
        return card ? this.cardSelectionKey(card) : '';
    }

    private portableCardIdentityFromLocation(): PortableStudyCardIdentity | null {
        const route = readStudyCardRoute(location.href);
        return route?.kind === 'portable'
            ? { key: route.key, spelling: route.spelling, reading: route.reading }
            : null;
    }

    private studyCardRoute(card: JPDBCard, key: string): StudyCardRoute {
        if (!this.state.revealAnswer) return { kind: 'concealed', token: this.studyCardDomToken(card) };
        const spelling = card.spelling.trim();
        const reading = newTabCardReading(card).trim() || card.reading.trim();
        return { kind: 'portable', key, spelling, reading };
    }

    private handleCardPopstate(root: HTMLElement): void {
        if (!this.isVocabularyStudyRoute()) return;
        const key = this.cardKeyFromLocation();
        if (!key) return this.restoreCurrentCardAfterUnknownRoute(root);
        const routeSignature = studyCardRouteSignature(readStudyCardRoute(location.href));
        if (routeSignature && routeSignature === this.lastSyncedCardRouteSignature) return;
        if (this.undoReviewForPopstate(root, key)) return;
        this.renderCardForPopstate(root, key);
    }

    private restoreCurrentCardAfterUnknownRoute(root: HTMLElement): void {
        // A reloaded/foreign opaque token has no answer-bearing fallback.
        // Any non-card hash in word mode is likewise replaced by the current
        // safe route; search hashes are consumed before this handler runs.
        this.lastSyncedCardRouteSignature = '';
        this.state.revealAnswer = false;
        const current = this.visibleWords[this.index];
        if (current) this.renderWord(root, current);
    }

    private undoReviewForPopstate(root: HTMLElement, key: string): boolean {
        // UT-58: navigating back across a grade boundary undoes the grade.
        if (!this.canUndoLastReview() || !this.lastUndoableReview
            || !this.cardMatchesSelectionKey(this.lastUndoableReview.card, key)) return false;
        this.handlingCardPopstate = true;
        void this.undoLastReview(root).finally(() => { this.handlingCardPopstate = false; });
        return true;
    }

    private renderCardForPopstate(root: HTMLElement, key: string): void {
        const index = this.visibleWords.findIndex(card => this.cardMatchesSelectionKey(card, key));
        if (index < 0) return;
        this.handlingCardPopstate = true;
        try {
            this.index = index;
            this.state.revealAnswer = false;
            this.persistState();
            this.renderWord(root, this.visibleWords[this.index]);
        } finally {
            this.handlingCardPopstate = false;
        }
    }

    private handleLocationPopstate(root: HTMLElement): void {
        if (this.searchController.handleSearchPopstate(root, currentNewTabRoute(), currentNewTabSearchQuery())) return;
        this.handleCardPopstate(root);
    }

    private writeStoredWordKey(card: JPDBCard): void {
        try {
            managedSessionStorage.setItem(SESSION_WORD_KEY, JSON.stringify({
                signature: this.currentSessionSignature(),
                key: this.cardSelectionKey(card),
            }));
        } catch {
            // Refresh stability is a convenience; the page still works without storage.
        }
    }
}

function legacyNewTabRoute(mode: unknown): NewTabRoute {
    return mode === 'search' || mode === 'stats' ? mode : 'study';
}

function legacyStudyTransition(mode: unknown, listenMode: unknown): LegacyStudyTransition {
    if (mode !== 'listen') return { stepId: typeof mode === 'string' ? LEGACY_STUDY_STEP_IDS[mode] ?? null : null };
    return {
        stepId: listenMode === 'shadow' ? 'speaking' : 'listen-pitch',
        listenMode: listenMode === 'recall' ? 'recall' : 'perceive',
    };
}

function isPassiveParsedWord(word: HTMLElement): boolean {
    return word.dataset.jpdbReaderPassive === 'true';
}

function cleanNestedLookupValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

function ankiAudioFilenamesFromFields(fields: Record<string, string>): string[] | undefined {
    const filenames = uniqueStrings(Object.values(fields)
        .flatMap(value => Array.from(value.matchAll(/\[sound:([^\]]+)]/gi), match => match[1]?.trim() ?? '')));
    return filenames.length ? filenames : undefined;
}

function uniqueConcreteSources(sources: Array<ConcreteNewTabWordSource | null>): ConcreteNewTabWordSource[] {
    return sources.filter((source, index): source is ConcreteNewTabWordSource => Boolean(source) && sources.indexOf(source) === index);
}

function concreteNewTabSourceFromValue(value: string | undefined): ConcreteNewTabWordSource | null {
    return value === 'jpdb'
        || value === 'bunpro'
        || value === 'wanikani'
        || value === 'yomu-local'
        || value === 'anki'
        || value === 'dictionary'
        ? value
        : null;
}

function isNewTabRevealKey(key: string): boolean {
    return isNewTabSpaceRevealKey(key) || isNewTabEnterRevealKey(key);
}

function isNewTabSpaceRevealKey(key: string): boolean {
    return key === ' ';
}

function isNewTabEnterRevealKey(key: string): boolean {
    return key === 'Enter';
}

function consumeNestedLookupEvent(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
}

function setOptionalText(element: HTMLElement | null, text: string): void {
    if (element) element.textContent = text;
}

function isNewTabStudyInteractiveTarget(target: HTMLElement): boolean {
    return Boolean(target.closest(NEW_TAB_STUDY_INTERACTIVE_SELECTOR));
}

function studyTourCopyKey(kind: NewTabStudyStepKind): NewTabCopyKey {
    if (kind === 'kanji-doodle') return 'studyTourKanji';
    if (kind === 'recall-cloze') return 'studyTourRecall';
    if (kind === 'listen-pitch') return 'studyTourListen';
    if (kind === 'speaking') return 'studyTourSpeaking';
    if (kind === 'type-word') return 'studyTourType';
    if (kind === 'final-reveal') return 'studyTourReveal';
    return 'studyTourWord';
}

function recallOutcomeToStepOutcome(outcome: NewTabRecallOutcome): StudyStepOutcome {
    // 'accepted' (right reading, not the target spelling) still counts as knowing
    // the word for the reveal summary — only a real miss reads as wrong.
    return outcome === 'correct' || outcome === 'accepted' ? 'correct' : 'wrong';
}

function isNewTabKeyboardCaptureBlockedTarget(target: HTMLElement): boolean {
    return Boolean(target.closest([
        'input',
        'select',
        'textarea',
        '[contenteditable]:not([contenteditable="false"])',
        '[data-newtab-search]',
        '[role="search"]',
        '[data-settings-panel]',
        '.jpdb-reader-settings',
    ].join(',')));
}

function normalizePromptContextSentence(value: string | undefined, card: JPDBCard): string {
    const sentence = value?.replace(/\s+/g, ' ').trim() ?? '';
    return isPromptContextSentence(sentence, card) && isCompleteStudySentence(sentence) ? sentence : '';
}

function isPromptContextSentence(sentence: string, card: JPDBCard): boolean {
    if (!newTabCardTarget(card).isLookupableText(sentence)) return false;
    const normalized = normalizedPromptSentenceText(sentence);
    const identities = newTabCardHighlightTargets(card)
        .map(normalizedPromptSentenceText)
        .filter(Boolean);
    return Boolean(normalized) && !identities.includes(normalized);
}

function normalizedPromptSentenceText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function renderDeckSelectorOptions(
    select: HTMLSelectElement,
    options: readonly { id: string; label: string }[],
    selected: string,
): void {
    replaceChildrenWith(select, options.map(option => el('option', {
        value: option.id,
        selected: option.id === selected,
    }, option.label)));
    select.value = selected;
}

function jpdbKanjiActionAvailable(actionId: string, kanji: string): boolean {
    return Boolean(actionId) && targetCanLookupCharacter(kanji) && usesJapaneseProviders();
}

function jpdbKanjiActionIsCurrent(previousContext: string, currentContext: string, kanji: string): boolean {
    return previousContext === currentContext && targetCanLookupCharacter(kanji) && usesJapaneseProviders();
}

function jpdbExampleSentenceForPrompt(info: JpdbVocabularyInfo | null, card: JPDBCard): string {
    const examples = info?.examples ?? [];
    return examples
        .map(example => normalizePromptContextSentence(example.sentence, card))
        .find(Boolean) ?? '';
}

function sentencePromptTarget(card: JPDBCard, sentence: string): string {
    const reading = newTabCardOptionalReading(card);
    if (sentence.includes(card.spelling)) return card.spelling;
    return reading && sentence.includes(reading) ? reading : '';
}

function clearSessionProgressDataset(dataset: DOMStringMap): void {
    for (const key of Object.keys(dataset)) {
        if (key.startsWith('session')) delete dataset[key];
    }
}

function capitalizedSessionSource(source: string): string {
    return source ? `${source[0]?.toUpperCase() ?? ''}${source.slice(1)}` : '';
}

function uniqueNumbers(values: number[]): number[] {
    return [...new Set(values)];
}

function isJitenBulkAction(action: string): boolean {
    return action === 'jiten-mining' || action === 'jiten-suspend' || action === 'jiten-forget';
}
