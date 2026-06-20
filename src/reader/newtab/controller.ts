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
    renderSearchKanjiResults,
    renderSearchWordResults,
    searchCardStateLabel,
    searchLocalKanjiDefinitions,
    searchWordDetailHtml,
    searchWordKanjiSourceShell,
    searchWordSummaryMeta,
    type NewTabSearchDetailViewContext,
    type NewTabSearchKanjiResult,
    type NewTabSearchViewContext,
    type NewTabSearchWordDetailData,
} from './search-view';
import { normalizeCardStates, primaryCardState } from '../cards/state';
import { renderApiMiningPanel, togglePopoverReviewTargetSelection } from '../cards/popover-renderer';
import { apiSrsProviderViewForCard, isJitenBackedCard } from '../cards/srs-providers';
import type { CardRenderData } from '../cards/render-data';
import { isCardHighlightWord, normalizedJapaneseCardReading } from '../cards/highlight';
import { loadCachedParsedTokens, type ParsedTokenCacheEntry } from '../core/parsed-token-cache';
import { APP_NAME, DOCS_BASE_URL, IMMERSION_KIT_SOURCE_ID } from '../app/constants';
import { htmlToFirstElement, setInnerHtml } from '../dom';
import { el, fragment, replaceChildrenWith } from '../dom/builder';
import { isKanjiCharacter } from '../popup/pitch';
import { eventTargetElement } from '../dom/target';
import { isImmersionKitRateLimitError, type ImmersionKitClient, type ImmersionKitExample, type ImmersionKitSearchOptions } from '../immersion/kit';
import { nextImmersionExampleIndex, renderImmersionExampleToolbar } from '../immersion/player-view';
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
import { runLimited } from '../core/async-utils';
import type { JitenApiClient, JitenKanjiInfo, JitenVocabularyInfo } from '../dictionaries/jiten';
import {
    jitenKanjiFactRows,
    jitenKanjiReadingRows,
    renderJitenKanjiInfoWithAttributes,
    renderJitenKanjiKeywordLine,
} from '../jiten/jiten-kanji-info-render';
import {
    filterJitenKanjiWords as filterSharedJitenKanjiWords,
    loadMoreJitenKanjiWords as loadMoreSharedJitenKanjiWords,
    type JitenKanjiWordsActionContext,
} from '../jiten/jiten-kanji-words-actions';
import type { JpdbClient } from '../jpdb/jpdb';
import { jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiClient, type JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import { getPitchClass } from '../jpdb/jpdb-parser';
import type { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph } from '../kanji/origin';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT, type DoodleStroke } from '../kanji/doodle';
import { renderAnkiRenderedCardStudyBody } from '../anki/render';
import { assessKanjiStrokes, rankKanjiStrokeCandidates, type KanjiShapeCandidate, type KanjiStrokeAssessment } from '../kanji/stroke-grader';
import type { KanjiVGClient, KanjiVGInfo } from '../kanji/vg';
import type { JpdbReviewBridgeCard, JpdbReviewBridgeClient, JpdbReviewBridgeStatus } from '../jpdb/jpdb-review-bridge';
import { publishCardStateSignal } from '../app/card-state-signal';
import { Logger } from '../app/logger';
import { FIVE_BUTTON_REVIEW_SHORTCUTS, TWO_BUTTON_REVIEW_SHORTCUTS, handleReaderActionPillLink, matchedReviewShortcutGrade } from '../app/main-helpers';
import { canAttemptAudiblePlayback } from '../audio/media-activation';
import { installOriginGraphInteractions } from '../popup/origin-graph-interactions';
import { matchesShortcut } from '../settings';
import { openDeckPickerForCardAdd } from '../study/mining-controls';
import { localPitchPatternFromMeta } from '../lookup/pitch-meta';
import {
    buildRtkComponentSummaries,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderRtkInfo,
} from '../popup/render';
import { kanjiFactProviderTitle, kanjiSourceStateKey, renderKanjiDefinitions } from '../sources/definition-render';
import {
    cardKey,
    createNewTabStateChannel,
    firstCardMeaning,
    isYomuNewTabUrl,
    kanjiCharacters,
    loadNewTabUiState,
    resolveNewTabBrandAssets,
    saveNewTabUiState,
    type NewTabMode,
    type NewTabUiState,
} from './index';
import { NEW_TAB_FILTERS, normalizeNewTabUiState } from './state';
import {
    newTabImmersionAudioUrls,
    newTabImmersionImageUrl,
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
import { isNewTabStatsDateKey, normalizeNewTabStatsActivityMetric, renderNewTabStatsContent } from './stats-view';
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
import { installNewTabSwipeGesture, newTabSwipeGrade, type NewTabSwipeAction } from './swipe-gesture';
import {
    newTabCardHighlightTargets,
    newTabCardOptionalReading,
    newTabCardReading,
    normalizeNewTabCard,
    promoteCardByKey,
    selectNewTabStudyPool,
    sentenceForCard,
} from './study-queue';
import {
    NEW_TAB_HANDWRITING_COMMON_KANJI,
    compactFacts,
    dictionaryKanjiStudyCard,
    doodlePreviewDataUrl,
    fact,
    fallbackSearchKanjiCard,
    firstTruthy,
    heisigFact,
    isKanjiUnlockStudyCard,
    isStandaloneKanjiCard,
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
    recognizeGoogleJapaneseHandwriting,
    shouldWaitForMoreDoodleStrokes,
    stableNegativeNewTabId,
    visibleCardKanji,
} from './kanji-helpers';
import {
    appendSearchHandwritingCandidate,
    cardMatchesSearchResult,
    cardMatchesSearchSuggestion,
    dedupeSearchWords,
    dedupeWords,
    jpdbReviewCardsForNewTab,
    liveJpdbCardIdentity,
    normalizeSearchQuery,
    preferMultiCharacterVocabulary,
    queryHasJapanese,
    searchSuggestionFromCard,
    searchWordResultOrder,
    newTabDueSummary,
    shouldReplaceKanjiStudyCard,
    type NewTabSearchSuggestion,
} from './card-selection';
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
    type NewTabGradeFailure,
    type NewTabReviewTarget,
    type QueuedNewTabGradeTarget,
    isFailedNewTabGrade,
} from './review-targets';
import {
    addNewTabDailyStudyTimeMs,
    formatNewTabDailyGoalLabel,
    formatNewTabSessionElapsed,
    formatNewTabSessionProgressLabel,
    newTabDailyStudyTimeMs,
    newTabLocalDateKey,
    newTabSessionProgressRatio,
    NewTabSessionProgressTracker,
    type NewTabSessionProgressSnapshot,
} from './session-progress';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import {
    applyJitenDailyStats,
    applyJpdbReviewImport,
    combineStatsSources,
    emptyStatsDashboardSnapshot,
    emptyStatsSource,
    loadAnkiConnectStats,
    parseJpdbReviewExportText,
    statsFromApiCards,
    type JpdbReviewImport,
    type StatsActivityMetric,
    type StatsDashboardSnapshot,
    type StatsSourceId,
    type StatsSourceSnapshot,
} from '../app/stats';
import { loadJitenDailyStats } from '../dictionaries/jiten-stats-cache';
import { jpdbFirstParseOptions, type ReaderParser } from '../lookup/parser';
import type { CardState, JPDBCard, JPDBDeck, JPDBGrade, JPDBToken, ReaderSettings } from '../app/types';
import type { RtkClient, RtkInfo } from '../kanji/rtk';
import { gmStorageDelete, gmStorageGet, gmStorageSet } from '../app/storage';
import { nextExplicitUiLanguage, resolveUiLanguage, uiText, type UiCopyKey } from '../app/i18n';
import { isNewTabCopyKey, newTabText, type NewTabCopyKey } from './i18n';
import { NEW_TAB_CACHE_KEY } from './cache';
import {
    JPDB_ALL_DECKS,
    JPDB_DECK_SAMPLE_LIMIT,
    NEW_TAB_DICTIONARY_FALLBACK_RANKS,
    NEW_TAB_DICTIONARY_PRESENCE_TIMEOUT_MS,
    NEW_TAB_DICTIONARY_RANDOM_MAX_MS,
    NEW_TAB_DICTIONARY_RANDOM_MAX_ROWS,
    NEW_TAB_DICTIONARY_TOP_MAX_MS,
    NEW_TAB_DICTIONARY_TOP_MAX_ROWS,
    NEW_TAB_FALLBACK_SUPPLEMENT_MIN,
    NEW_TAB_GRADE_QUEUE_KEY,
    NEW_TAB_GRADE_QUEUE_LIMIT,
    NEW_TAB_HANDWRITING_DEBOUNCE_MS,
    NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT,
    NEW_TAB_HEADER_LABEL,
    NEW_TAB_KANJI_FRONT_KEYWORD_LIMIT,
    NEW_TAB_LIVE_REVIEW_STALE_MS,
    NEW_TAB_LOCAL_SEARCH_CANDIDATE_LIMIT,
    NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_MS,
    NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_ROWS,
    NEW_TAB_LOCAL_SEARCH_INDEX_MAX_MS,
    NEW_TAB_LOCAL_SEARCH_INDEX_MAX_ROWS,
    NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS,
    NEW_TAB_NAVIGATION_DEDUPE_MS,
    NEW_TAB_PUBLIC_FALLBACK_GRACE_MS,
    NEW_TAB_PUBLIC_JPDB_CONCURRENCY,
    NEW_TAB_PUBLIC_JPDB_KANJI_FALLBACK_LIMIT,
    NEW_TAB_PUBLIC_JPDB_LOCAL_SEED_LIMIT,
    NEW_TAB_PUBLIC_JPDB_WORD_FALLBACK_LIMIT,
    NEW_TAB_PUBLIC_SEARCH_TIMEOUT_MS,
    NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS,
    NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
    NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS,
    NEW_TAB_SEARCH_DEBOUNCE_MS,
    NEW_TAB_SEARCH_KANJI_LIMIT,
    NEW_TAB_SEARCH_SUGGESTION_LIMIT,
    NEW_TAB_SEARCH_WORD_LIMIT,
    NEW_TAB_SOURCE_LABELS,
    NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY,
    NEW_TAB_BROWSE_DECK_LIMIT,
    NEW_TAB_UNDO_REVIEW_WINDOW_MS,
    NEW_TAB_STATS_JPDB_CARD_LIMIT,
    NEW_TAB_STATS_JPDB_HISTORY_KEY,
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
    KANJI_UCHISEN_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    orderedKanjiSourceIds,
} from '../sources/sections';
import type { CardNavigationMode, PopupNavigationEntry } from '../popup/navigation';
import { combinedApiCredentialLabel, effectiveJpdbApiKey, hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { installUchisenCarousel, loadUchisenData, type UchisenData } from '../dictionaries/uchisen';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';

export { selectNewTabStudyPool } from './study-queue';
export { newTabKanjiSourceTitle } from './kanji-helpers';

const NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS = 1_200;
const NEW_TAB_IMMERSION_EXAMPLE_LIMIT = 6;
const NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT = 48;
const NEW_TAB_IMMERSION_LOAD_TIMEOUT_GRACE_MS = 1_000;
const NEW_TAB_IMMERSION_PREFETCH_LOOKAHEAD = 1;
const NEW_TAB_WORD_PITCH_LOCAL_GRACE_MS = 120;
const NEW_TAB_WORD_PITCH_LOCAL_TIMEOUT_MS = 2_500;
const NEW_TAB_SEARCH_PITCH_CONCURRENCY = 4;
const NEW_TAB_LIVE_GRADE_REFRESH_DELAY_MS = 900;
const NEW_TAB_PARSED_SENTENCE_CACHE_LIMIT = 160;
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

interface NewTabStatsApiProvider {
    label: string;
    load: () => Promise<JPDBCard[]>;
}

interface NewTabStatsApiProviderResult {
    provider: NewTabStatsApiProvider;
    cards: JPDBCard[];
    error: unknown | null;
}

function orderedNewTabStatsProviderLabel(results: NewTabStatsApiProviderResult[]): string {
    return results
        .map(result => result.provider.label)
        .sort((a, b) => newTabStatsProviderLabelRank(a) - newTabStatsProviderLabelRank(b))
        .join(' + ');
}

function newTabStatsProviderLabelRank(label: string): number {
    if (label.startsWith('Jiten')) return 0;
    if (label.startsWith('JPDB')) return 1;
    if (label.startsWith('Anki')) return 2;
    return 3;
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
        listNewTabCards: (limit?: number, deckScope?: string) => Promise<JPDBCard[]>;
        answerCard: (cardId: number, grade: JPDBGrade) => Promise<void>;
        findExistingCards?: (card: JPDBCard) => Promise<AnkiLookupResult>;
        invoke: <T>(action: string, params?: Record<string, unknown>) => Promise<T>;
        requestPermission: () => Promise<unknown>;
    };
    jpdb: JpdbClient;
    jiten?: Pick<JitenApiClient, 'listStudyBatchCards' | 'reviewCard' | 'lookupKanji' | 'lookupKanjiWords'> & Partial<Pick<JitenApiClient, 'parse' | 'lookupVocabularyInfoForCard' | 'refreshCardState' | 'undoReview' | 'listStudyDecks' | 'studyDeckWordKeys'>>;
    jpdbKanji: JpdbKanjiClient;
    kanjiVG: KanjiVGClient;
    rtk: RtkClient;
    immersionKit: ImmersionKitClient;
    jpdbVocabulary?: Pick<JpdbVocabularyClient, 'lookup'> & Partial<Pick<JpdbVocabularyClient, 'search'>>;
    jpdbPublicPitch?: Pick<JpdbPublicPitchClient, 'lookup'>;
    jpdbReviewBridge: JpdbReviewBridgeClient;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    onAnkiStatusChanged?: (card: JPDBCard) => void;
    lookupText?: (text: string, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    lookupDictionaryReference?: (query: string, reading: string, sourceDictionary: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    showLookupCard?: (card: JPDBCard, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    showKanjiCard?: (card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    loadCardRenderData?: (card: JPDBCard) => Promise<CardRenderData>;
    renderSearchDefinitionSources?: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null, jitenVocabularyInfo: JitenVocabularyInfo | null) => string;
    renderStudyDefinitionSources?: (card: JPDBCard, data: CardRenderData, sentence: string | undefined) => string;
    renderSearchWordPills?: (card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: CardRenderData['ankiLookup']) => string;
    installSearchDetailSources?: (root: HTMLElement, card: JPDBCard, sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null) => void;
    preloadWordAudio?: (card: JPDBCard) => void;
    playWordAudio?: (card: JPDBCard) => Promise<void> | void;
    playJpdbExampleAudio?: (audioIds: string, fallbackSentence: string) => Promise<void> | void;
    performCardAction?: (button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement) => Promise<void> | void;
    parseContent?: (root: HTMLElement, options?: NewTabParseContentOptions) => Promise<void> | void;
    setImmersionTranslationBlurred?: (blurred: boolean) => void;
    dictionarySourceAttributes?: (sourceStateKey: string, initiallyExpanded?: boolean) => string;
    isDictionarySourceOpen?: (sourceStateKey: string, initiallyExpanded?: boolean) => boolean;
    installDictionarySourceTracking?: (root: HTMLElement) => void;
    onSettingsChange: () => Promise<void> | void;
    applyTheme: () => void;
    showSettings: (tab?: string) => void;
    dismissLookup?: () => void;
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

function renderSearchHandwritingPanel(language: ReaderSettings['interfaceLanguage']): HTMLElement {
    return el('details', { id: 'jpdb-reader-newtab-handwriting', class: 'jpdb-reader-newtab-handwriting', dataset: { newtabHandwriting: true } },
        el('summary', { class: 'jpdb-reader-parseable', lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, newTabText(language, 'drawKanji')),
        el('div', { class: 'jpdb-reader-newtab-handwriting-body' },
            el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle jpdb-reader-newtab-search-doodle trace-hidden', dataset: { kanji: '' } },
                el('div', { class: 'jpdb-reader-doodle-ghost', hidden: true }),
                el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': newTabText(language, 'drawKanji'), tabIndex: 0 }),
            ),
            el('div', {
                class: 'jpdb-reader-newtab-handwriting-candidates',
                dataset: { newtabHandwritingCandidates: true },
                'aria-live': 'polite',
                hidden: true,
            }),
        ),
    );
}

function renderSearchHandwritingManualAction(language: ReaderSettings['interfaceLanguage']): HTMLButtonElement {
    return el('button', {
        class: 'jpdb-reader-newtab-handwriting-manual-action jpdb-reader-parseable',
        type: 'button',
        dataset: { newtabAction: 'search-focus' },
        lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en',
    }, newTabText(language, 'typeOrPasteKanji'));
}

function readerWordSurfaceText(word: HTMLElement): string {
    const clone = word.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
    return clone.textContent ?? '';
}

function normalizedSearchWordIdentity(value: string): string {
    return normalizeSearchQuery(value).replace(/\s+/g, '').toLocaleLowerCase();
}

function normalizedKeywordText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sourceResult<T>(value: T, state: KanjiDetailSourceState): KanjiDetailSourceResult<T> {
    return { value, state };
}

function searchParentMeaningKeys(cards: JPDBCard[], kanji: string): Set<string> {
    return new Set(cards
        .filter(card => card.spelling !== kanji && kanjiCharacters(card.spelling).includes(kanji))
        .flatMap(card => firstCardMeaning(card).split(/;\s*/u))
        .map(normalizedKeywordText)
        .filter(Boolean));
}

function isSearchLocalKanjiDictionaryCard(card: JPDBCard): boolean {
    const characters = Array.from(card.spelling.trim());
    return characters.length === 1 && isKanjiCharacter(characters[0] ?? '') && (card.reading === card.spelling || Boolean(card.kanjiKeyword));
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
type NavigationExpansionSource = 'dictionary' | 'jpdb' | 'public-jpdb' | 'anki';
type PointerNavigationDirection = 'next' | 'previous';

interface RootClickRequest {
    target: HTMLElement;
    action: string | undefined;
}

type RootClickHandler = (root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined) => boolean;

interface StatsClickRequest {
    action: string;
    chartDayTarget: HTMLElement | null;
    target: HTMLElement;
}

type StatsClickHandler = (root: HTMLElement, target: HTMLElement, request: StatsClickRequest) => void;
type StudyClickHandler = (root: HTMLElement, target: HTMLElement, event: MouseEvent) => void;

interface PointerPoint {
    x: number;
    y: number;
}

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
    hasAnki: boolean;
    canUseJpdb: boolean;
    canUseAnki: boolean;
    canOfferAnki: boolean;
    ankiUnavailable: boolean;
}
interface KanjiDetailBundle {
    jpdb: JpdbKanjiInfo | null;
    jiten: JitenKanjiInfo | null;
    rtk: RtkInfo | null;
    vg: KanjiVGInfo | null;
    local: YomitanKanjiEntry[];
    sourceStates: KanjiDetailSourceStates;
}

type KanjiDetailSourceState = 'disabled' | 'ok' | 'not-found' | 'unavailable';

interface KanjiDetailSourceStates {
    jpdb: KanjiDetailSourceState;
    jiten: KanjiDetailSourceState;
    rtk: KanjiDetailSourceState;
    vg: KanjiDetailSourceState;
    local: KanjiDetailSourceState;
}

interface KanjiDetailSourceResult<T> {
    value: T;
    state: KanjiDetailSourceState;
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
    localEntries: YomitanKanjiEntry[];
    settings: ReaderSettings;
    excludeFactLabels: Set<string>;
}

interface KanjiDetailCacheEntry {
    details?: Promise<KanjiDetailBundle>;
    detailsSignature?: string;
    jpdb?: Promise<KanjiDetailSourceResult<JpdbKanjiInfo | null>>;
    jiten?: Promise<KanjiDetailSourceResult<JitenKanjiInfo | null>>;
    rtk?: Promise<KanjiDetailSourceResult<RtkInfo | null>>;
    vg?: Promise<KanjiDetailSourceResult<KanjiVGInfo | null>>;
    local?: Promise<KanjiDetailSourceResult<YomitanKanjiEntry[]>>;
}

interface KanjiPromptKeyword {
    source: string;
    text: string;
}

interface NewTabStudySlots {
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


interface QueuedNewTabGrade {
    id: string;
    at: number;
    target: QueuedNewTabGradeTarget;
    card: JPDBCard;
    grade: JPDBGrade;
    attempts: number;
    lastError?: string;
}

interface NewTabSearchResults {
    query: string;
    words: JPDBCard[];
    kanji: NewTabSearchKanjiResult[];
    suggestions: NewTabSearchSuggestion[];
    hasLocalDictionaries: boolean;
}

interface NewTabSearchWordDetail extends NewTabSearchWordDetailData {
    wordKanjiDetails?: NewTabSearchWordKanjiDetail[];
    wordKanjiLoading?: boolean;
}

interface NewTabSearchWordKanjiDetail {
    kanji: string;
    details: KanjiDetailBundle;
}

const log = Logger.scope('NewTab');

function newTabRouteMode(): NewTabMode | null {
    try {
        const url = new URL(location.href);
        const mode = url.searchParams.get('mode') || url.searchParams.get('view') || url.hash.replace(/^#/u, '');
        if (mode === 'stats' || mode === 'search' || mode === 'kanji' || mode === 'word') return mode;
        return newTabRouteSearchQuery(url) ? 'search' : null;
    } catch {
        return null;
    }
}

function newTabRouteSearchQueryFromLocation(): string {
    try {
        return newTabRouteSearchQuery(new URL(location.href));
    } catch {
        return '';
    }
}

function newTabRouteSearchQuery(url: URL): string {
    for (const key of ['q', 'query', 'search']) {
        const value = normalizeSearchQuery(url.searchParams.get(key) ?? '');
        if (value) return value;
    }
    return '';
}

export class NewTabController {
    private allWords: JPDBCard[] = [];
    private visibleWords: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private visiblePoolSignature = '';
    private sourceResultCache = new Map<ConcreteNewTabWordSource, NewTabSourceCacheEntry>();
    private sourceCacheVersions = new Map<ConcreteNewTabWordSource, number>();
    private state: NewTabUiState;
    private readonly stateChannel: ReturnType<typeof createNewTabStateChannel>;
    private readonly unsubscribeJpdbBridge: () => void;
    private liveJpdbStatus: JpdbReviewBridgeStatus | null = null;
    private liveCards = new Map<string, JpdbReviewBridgeCard>();
    private pendingLiveJpdbGrade: { id: string; until: number } | null = null;
    private keywordCache = new Map<string, string>();
    private kanjiInfoCache = new Map<string, KanjiDetailCacheEntry>();
    private uchisenDataCache = new Map<string, Promise<UchisenData | null>>();
    private immersionCache = new Map<string, Promise<ImmersionKitExample[]>>();
    private immersionExampleIndex = new Map<string, number>();
    private frontSentenceCache = new Map<string, Promise<string>>();
    private parsedSentenceCache = new Map<string, ParsedTokenCacheEntry>();
    private wordPitchCache = new Map<string, Promise<string[]>>();
    private doodlePreviewCache = new Map<string, string>();
    private immersionPrefetchGeneration = 0;
    private immersionAudio?: HTMLAudioElement;
    private immersionAudioKey = '';
    private immersionAudioRequestId = 0;
    private reviewCountMode = false;
    private reviewHistoryCards: JPDBCard[] = [];
    private readonly sessionProgress = new NewTabSessionProgressTracker();
    private sessionClockTimer?: number;
    private sessionClockRoot: HTMLElement | null = null;
    private emptyLoadMessageKey: NewTabTextKey | null = null;
    private fallbackStudyNotice = false;
    private deckSelectorDecks?: { key: string; promise: Promise<JPDBDeck[]> };
    private loadGeneration = 0;
    private sourceSwitchGeneration = 0;
    private searchGeneration = 0;
    private searchDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchQuery = '';
    private handlingSearchPopstate = false;
    private searchActiveSuggestionIndex = -1;
    private searchWordCardCache = new Map<string, JPDBCard>();
    private searchHandwritingStrokes: DoodleStroke[] = [];
    private searchHandwritingGeneration = 0;
    private searchHandwritingDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchHandwritingShapeCandidateCache = new Map<string, Promise<KanjiShapeCandidate | null>>();
    private rootEventController: AbortController | undefined;
    private readonly rootClickHandlers: RootClickHandler[] = [
        (root, _target, event, action) => this.handleRootUtilityClick(root, event, action),
        (root, target, event, action) => this.handleStatsClick(root, target, event, action),
        (root, target, event, action) => this.handleSearchClick(root, target, event, action),
        (root, target, event, action) => this.handleRootModeClick(root, target, event, action),
    ];
    private readonly studyClickHandlers: Record<string, StudyClickHandler> = {
        next: (_root, _target, event) => this.navigateFromPointer('next', event),
        skip: (_root, _target, event) => this.navigateFromPointer('next', event),
        previous: (_root, _target, event) => this.navigateFromPointer('previous', event),
        reveal: root => this.toggleReveal(root),
        'empty-fallback': root => { void this.startStarterWordStudy(root); },
        'undo-review': root => { void this.undoLastReview(root); },
        'continue-batch': root => { void this.continueAfterBatch(root); },
        grade: (root, target) => this.gradeFromStudyClick(root, target),
        'jpdb-kanji-action': (root, target) => {
            void this.performJpdbKanjiAction(root, this.kanjiActionIdFromTarget(target));
        },
    };
    private readonly statsClickHandlers: Record<string, StatsClickHandler> = {
        'stats-source': (root, target) => this.selectStatsSource(root, target),
        'stats-activity-metric': (root, target) => this.selectStatsActivityMetric(root, target),
        'stats-select-day': (root, target, request) => this.selectStatsDay(root, target, request.chartDayTarget),
        'stats-study-trouble': root => this.studyStatsTroubleCards(root),
        'stats-refresh': root => { void this.loadStatsInto(root, true); },
        'stats-toggle-anki-deck': (root, target) => this.toggleStatsAnkiDeck(root, target),
        'stats-connect-anki': root => { void this.connectAnkiStats(root); },
        'stats-open-jpdb-settings': () => this.dependencies.showSettings('api'),
        'stats-open-anki-settings': () => this.dependencies.showSettings('mining'),
        'stats-import-jpdb': root => {
            root.querySelector<HTMLInputElement>('[data-stats-jpdb-file]')?.click();
        },
    };
    private lastPointerNavigation: { action: 'next' | 'previous'; time: number } | null = null;
    private navigationGeneration = 0;
    private navigationSupplementPromise: Promise<void> | null = null;
    private statsSnapshot: StatsDashboardSnapshot = emptyStatsDashboardSnapshot();
    private browsePool?: JPDBCard[];
    private browsePoolKey = '';
    private browseFilters = new Set<CardState>();
    private browseSourceFilters = new Set<BrowseSourceFilter>();
    private browseSort: BrowseSortKey = 'queue';
    private browseSortDescending = false;
    private browseSelectMode = false;
    private browsePage = 0;
    private statsSelectedSource: StatsSourceId = 'combined';
    private statsActivityMetric: StatsActivityMetric = 'reviews';
    private statsSelectedDate = '';
    private statsStudyFilter: 'trouble' | null = null;
    private statsGeneration = 0;
    private statsLoaded = false;
    private statsDeckPrefsLoaded = false;
    private statsDisabledAnkiDecks = new Set<string>();

    constructor(private readonly dependencies: NewTabControllerDependencies) {
        const saved = loadNewTabUiState();
        const routeMode = newTabRouteMode();
        const routeSearchQuery = routeMode === 'search' ? newTabRouteSearchQueryFromLocation() : '';
        this.state = {
            ...saved,
            ...(routeMode ? { mode: routeMode } : {}),
            source: this.effectiveNewTabSourceFromSettings(dependencies.getSettings()),
        };
        if (routeSearchQuery) this.searchQuery = routeSearchQuery;
        this.stateChannel = createNewTabStateChannel(state => { void this.applyExternalState(state); });
        this.unsubscribeJpdbBridge = dependencies.jpdbReviewBridge.onUpdate(status => this.applyJpdbBridgeStatus(status));
    }

    isCurrentPage(): boolean {
        return isYomuNewTabUrl(location.href);
    }

    async renderPage(): Promise<void> {
        document.title = `${APP_NAME} ${this.text('newTabPage')}`;
        document.documentElement.lang = this.resolvedLanguage();
        document.documentElement.classList.add('jpdb-reader-newtab-document');
        const settings = this.dependencies.getSettings();
        this.syncSourceFromSettings(settings);
        await this.ensureNewTabEnabled(settings);
        this.applyPalette();

        const { root, isNew } = this.ensureNewTabRoot();
        this.bindRootEvents(root);
        root.dataset.newtabBound = 'true';

        const shouldRenderContent = this.shouldRenderEnabledContent(root, isNew);
        if (shouldRenderContent) {
            delete root.dataset.standaloneNewtab;
            root.dataset.newtabLanguage = this.resolvedLanguage();
            root.replaceChildren(this.renderEnabledContent());
            this.syncMode(root);
        }
        this.syncThemeToggle(root);

        if (this.state.mode === 'search') {
            this.renderSearch(root);
            return;
        }
        if (this.state.mode === 'stats') {
            this.renderStats(root);
            void this.loadStatsInto(root);
            return;
        }

        if (shouldRenderContent || this.allWords.length === 0) await this.loadWordsInto(root, true);
        else this.applyWords(root, true);
    }

    private async ensureNewTabEnabled(settings: ReaderSettings): Promise<void> {
        if (settings.newTabEnabled) return;
        settings.newTabEnabled = true;
        await this.dependencies.onSettingsChange();
    }

    private ensureNewTabRoot(): { root: HTMLElement; isNew: boolean } {
        const root = document.querySelector<HTMLElement>('.jpdb-reader-newtab[data-jpdb-reader-root]');
        if (root) return { root, isNew: false };

        const created = document.createElement('main');
        created.className = 'jpdb-reader-newtab';
        created.dataset.jpdbReaderRoot = 'true';
        document.body.replaceChildren(created);
        return { root: created, isNew: true };
    }

    private shouldRenderEnabledContent(root: HTMLElement, isNew: boolean): boolean {
        return isNew
            || !root.querySelector('[data-newtab-study]')
            || root.dataset.newtabLanguage !== this.resolvedLanguage()
            || root.dataset.standaloneNewtab === 'true';
    }

    destroy(): void {
        this.stopSessionClock();
        this.stateChannel.close();
        this.unsubscribeJpdbBridge();
        this.rootEventController?.abort();
        this.clearSearchDebounce();
        this.clearSearchHandwritingDebounce();
        this.frontSentenceCache.clear();
        this.parsedSentenceCache.clear();
        this.rootEventController = undefined;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (root) delete root.dataset.newtabBound;
    }

    async refreshExternalData(): Promise<void> {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
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

    lookupGradeOptions(card: JPDBCard): Array<[JPDBGrade, string]> {
        return this.isCurrentLookupGradeCard(card) ? newTabGradeOptions(this.dependencies.getSettings()) : [];
    }

    lookupReviewTargets(card: JPDBCard, data?: CardRenderData | null): NewTabLookupReviewTarget[] {
        if (!this.isCurrentLookupGradeCard(card)) return [];
        const current = this.visibleWords[this.index] ?? card;
        return this.lookupReviewTargetsForCard(current, data);
    }

    async gradeFromLookup(grade: JPDBGrade, target?: NewTabLookupReviewTargetSelection): Promise<{ preserveLookup: boolean }> {
        const submitted = await this.gradeCurrentCard(grade, target);
        return { preserveLookup: !submitted };
    }

    private isCurrentLookupGradeCard(card: JPDBCard): boolean {
        const current = this.visibleWords[this.index];
        return Boolean(
            current
            && this.state.revealAnswer
            && cardKey(current) === cardKey(card)
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
        this.searchGeneration++;
        this.clearSearchDebounce();
        this.searchQuery = '';
        this.searchHandwritingGeneration++;
        this.clearSearchHandwritingDebounce();
        this.searchHandwritingStrokes = [];
        this.liveCards.clear();
        this.clearSourceResultCache();
        this.keywordCache.clear();
        this.kanjiInfoCache.clear();
        this.uchisenDataCache.clear();
        this.searchHandwritingShapeCandidateCache.clear();
        this.immersionCache.clear();
        this.immersionExampleIndex.clear();
        this.frontSentenceCache.clear();
        this.parsedSentenceCache.clear();
        this.doodlePreviewCache.clear();
        this.immersionAudio?.pause();
        this.immersionAudio = undefined;
        this.immersionAudioKey = '';
        this.immersionAudioRequestId++;
        this.statsSnapshot = emptyStatsDashboardSnapshot();
        this.statsLoaded = false;
        this.statsSelectedDate = '';
        this.statsGeneration++;
    }

    private renderEnabledContent(): DocumentFragment {
        const brand = resolveNewTabBrandAssets(location.href);
        const language = this.language();
        const nextLanguage = nextExplicitUiLanguage(language);
        const languageToggleLabel = uiText(language, nextLanguage === 'ja' ? 'japanese' : 'english');
        return fragment(
            el('div', { class: 'jpdb-reader-newtab-shell' },
                el('header', { class: 'jpdb-reader-newtab-topbar' },
                    el('div', { class: 'VPNavBarTitle jpdb-reader-newtab-brand', 'data-v-6aa21345': '', 'data-v-1168a8e4': '' },
                        el('a', {
                            class: 'title',
                            href: brand.homeHref,
                            'aria-label': APP_NAME,
                            'data-v-1168a8e4': '',
                        },
                            el('img', { class: 'VPImage logo', src: brand.iconSrc, alt: '', width: 24, height: 24, 'data-v-8426fc1a': '' }),
                            el('span', { 'data-v-1168a8e4': '' }, NEW_TAB_HEADER_LABEL),
                        ),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-mode', role: 'group', 'aria-label': newTabText(language, 'newTabMode') },
                        el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: 'mode', mode: 'word' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, uiText(language, 'word')),
                        el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, uiText(language, 'kanji')),
                        el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: 'mode', mode: 'search' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, uiText(language, 'search')),
                        el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: 'mode', mode: 'stats' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, newTabText(language, 'stats')),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-theme-controls' },
                        el('div', { class: 'VPNavBarAppearance appearance jpdb-reader-theme-appearance' },
                            el('button', {
                                class: 'VPSwitch VPSwitchAppearance jpdb-reader-theme-switch',
                                type: 'button',
                                role: 'switch',
                                dataset: { newtabAction: 'theme' },
                                'aria-label': uiText(language, 'switchToLightTheme'),
                                'aria-checked': 'true',
                                title: uiText(language, 'switchToLightTheme'),
                            },
                            el('span', { class: 'check' },
                                el('span', { class: 'icon' },
                                    el('span', { class: 'vpi-sun sun', 'aria-hidden': 'true' }),
                                    el('span', { class: 'vpi-moon moon', 'aria-hidden': 'true' }),
                                ),
                            )),
                        ),
                        el('button', {
                            class: 'jpdb-reader-language-toggle',
                            type: 'button',
                            dataset: { newtabAction: 'language' },
                            lang: nextLanguage === 'ja' ? 'ja' : 'en',
                            'aria-label': languageToggleLabel,
                        }, nextLanguage === 'ja' ? 'あ' : 'A'),
                        el('details', { class: 'jpdb-reader-newtab-more' },
                            el('summary', {
                                class: 'jpdb-reader-newtab-overflow',
                                'aria-label': uiText(language, 'more'),
                            }, '...'),
                            el('div', { class: 'jpdb-reader-newtab-more-menu', role: 'menu' },
                                el('button', { class: 'jpdb-reader-parseable', type: 'button', role: 'menuitem', dataset: { newtabAction: 'settings' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, uiText(language, 'settings')),
                            ),
                        ),
                    ),
                ),
                el('section', { class: 'jpdb-reader-newtab-study', dataset: { newtabStudy: true }, 'aria-live': 'polite' },
                    el('div', { class: 'jpdb-reader-newtab-count', dataset: { newtabCount: true }, hidden: true }),
                    el('h1', { class: 'jpdb-reader-newtab-prompt jpdb-reader-parseable', dataset: { newtabPrompt: true }, lang: 'ja' }, APP_NAME),
                    el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                        el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                        el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                    ),
                    el('button', { class: 'jpdb-reader-newtab-status', type: 'button', dataset: { newtabStatus: true }, disabled: true }, uiText(language, 'loading')),
                    el('select', {
                        class: 'jpdb-reader-newtab-deck',
                        dataset: { newtabDeckSelect: true },
                        hidden: true,
                        'aria-label': newTabText(language, 'studyDeckSelector'),
                    }),
                    el('select', {
                        class: 'jpdb-reader-newtab-deck jpdb-reader-newtab-state-filter',
                        dataset: { newtabFilterSelect: true },
                        hidden: true,
                        'aria-label': newTabText(language, 'showOnlyFilter'),
                    }),
                    el('form', { class: 'jpdb-reader-newtab-search', dataset: { newtabSearch: true }, role: 'search', hidden: true },
                        el('div', { class: 'jpdb-reader-newtab-searchbox' },
                            el('input', {
                                type: 'search',
                                dataset: { newtabSearchInput: true },
                                placeholder: newTabText(language, 'searchWordsOrKanji'),
                                autocomplete: 'on',
                                autocapitalize: 'none',
                                autocorrect: 'off',
                                inputmode: 'text',
                                spellcheck: false,
                                enterkeyhint: 'search',
                                lang: 'ja',
                                'aria-label': newTabText(language, 'searchWordsOrKanji'),
                                'aria-autocomplete': 'list',
                                'aria-controls': 'jpdb-reader-newtab-autocomplete',
                                'aria-expanded': 'false',
                            }),
                            el('button', { class: 'jpdb-reader-parseable', type: 'submit', dataset: { newtabAction: 'search-submit' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, uiText(language, 'search')),
                            el('button', {
                                class: 'jpdb-reader-parseable',
                                type: 'button',
                                dataset: { newtabAction: 'search-handwriting-toggle' },
                                lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en',
                                'aria-controls': 'jpdb-reader-newtab-handwriting',
                                'aria-expanded': 'false',
                            }, newTabText(language, 'draw')),
                            el('button', { class: 'jpdb-reader-parseable', type: 'button', dataset: { newtabAction: 'search-clear' }, lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en', 'aria-label': newTabText(language, 'clearSearch') }, uiText(language, 'clear')),
                        ),
                        el('div', {
                            id: 'jpdb-reader-newtab-autocomplete',
                            class: 'jpdb-reader-newtab-search-suggestions',
                            dataset: { newtabSearchAutocomplete: true },
                            role: 'listbox',
                            'aria-label': newTabText(language, 'searchSuggestions'),
                        }),
                        el('div', { class: 'jpdb-reader-newtab-search-results', dataset: { newtabSearchResults: true }, 'aria-live': 'polite' }),
                    ),
                ),
                el('nav', { class: 'jpdb-reader-newtab-controls', dataset: { newtabControls: true }, 'aria-label': newTabText(language, 'studyNavigation') },
                    el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': newTabText(language, 'previousWord') }, newTabText(language, 'previousWord')),
                    el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, uiText(language, 'reveal')),
                    el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': newTabText(language, 'nextWord') }, newTabText(language, 'nextWord')),
                ),
                el('a', {
                    class: 'jpdb-reader-newtab-install',
                    href: DOCS_BASE_URL,
                    target: '_blank',
                    rel: 'noopener',
                    hidden: true,
                    dataset: { newtabInstall: true },
                }, newTabText(language, 'getYomu')),
            ),
        );
    }

    private bindRootEvents(root: HTMLElement): void {
        this.rootEventController?.abort();
        const controller = new AbortController();

        root.addEventListener('click', event => this.handleRootClick(root, event), { signal: controller.signal });

        root.addEventListener('submit', event => {
            const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>('[data-newtab-search]');
            if (!form || !root.contains(form)) return;
            event.preventDefault();
            this.performSearchFromInput(root);
        }, { signal: controller.signal });

        root.addEventListener('input', event => {
            const input = event.target instanceof HTMLInputElement
                ? event.target.closest<HTMLInputElement>('[data-newtab-search-input]')
                : null;
            if (!input || !root.contains(input)) return;
            this.searchQuery = input.value;
            this.searchActiveSuggestionIndex = -1;
            this.renderSearchAutocomplete(root, normalizeSearchQuery(this.searchQuery), this.localSearchSuggestions(this.searchQuery));
            this.scheduleSearch(root);
        }, { signal: controller.signal });

        root.addEventListener('change', event => {
            const target = eventTargetElement(event.target);
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
            const browseSort = target?.closest<HTMLSelectElement>('[data-newtab-action="browse-sort"]');
            if (browseSort && root.contains(browseSort)) {
                const value = browseSort.value;
                this.browseSort = value === 'alpha' || value === 'frequency' ? value : 'queue';
                this.browsePage = 0;
                const mount = this.searchResultsMount(root);
                if (mount && this.state.mode === 'search') this.renderBrowseResults(mount);
                return;
            }
            const filterSelect = target?.closest<HTMLSelectElement>('[data-newtab-filter-select]');
            if (filterSelect && root.contains(filterSelect)) {
                const filter = normalizeNewTabUiState({ ...this.state, filter: filterSelect.value as NewTabUiState['filter'] }).filter;
                if (filter === 'study') {
                    this.setState({ filter, revealAnswer: false }, root, { preserveWord: false });
                    return;
                }
                // Non-study filters browse the FULL pool (the scheduled-queue
                // loader drops known/blacklisted cards), so merge the browse
                // pool in before applying — same data the My Cards browser uses.
                void this.loadBrowsePool().then(cards => {
                    this.allWords = dedupeWords([...this.allWords, ...cards.map(normalizeNewTabCard)]);
                    this.setState({ filter, revealAnswer: false }, root, { preserveWord: false });
                });
                return;
            }
            const deckSelect = target?.closest<HTMLSelectElement>('[data-newtab-deck-select]');
            if (deckSelect && root.contains(deckSelect) && this.state.mode === 'search') {
                this.state = { ...this.state, jpdbDeck: deckSelect.value };
                this.persistState();
                this.invalidateBrowsePool();
                this.browsePage = 0;
                void this.renderBrowseInto(root);
                return;
            }
            if (deckSelect && root.contains(deckSelect)) {
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
                return;
            }
            const input = event.target instanceof HTMLInputElement
                ? event.target.closest<HTMLInputElement>('[data-stats-jpdb-file]')
                : null;
            if (!input || !root.contains(input)) return;
            const file = input.files?.[0];
            if (file) void this.importJpdbStatsFile(root, file);
            input.value = '';
        }, { signal: controller.signal });

        root.addEventListener('dragover', event => {
            const dropzone = this.statsDropzoneTarget(root, event);
            if (!dropzone) return;
            event.preventDefault();
            dropzone.dataset.dragging = 'true';
        }, { signal: controller.signal });

        root.addEventListener('dragleave', event => {
            const dropzone = this.statsDropzoneTarget(root, event);
            if (!dropzone) return;
            dropzone.dataset.dragging = 'false';
        }, { signal: controller.signal });

        root.addEventListener('drop', event => {
            const dropzone = this.statsDropzoneTarget(root, event);
            if (!dropzone) return;
            event.preventDefault();
            dropzone.dataset.dragging = 'false';
            const file = event.dataTransfer?.files?.[0];
            if (file) void this.importJpdbStatsFile(root, file);
        }, { signal: controller.signal });

        // Study shortcuts listen at document level: focus sits on body after
        // load and falls back there after every re-render (button clicks
        // replace the controls), so a root-scoped listener left keyboard
        // reviewing dead most of the time. This page is always Yomu's own
        // (renderPage gates on isYomuNewTabUrl), and input/search/settings
        // targets are filtered in handleRootKeydown.
        document.addEventListener('keydown', event => this.handleRootKeydown(root, event), { signal: controller.signal });

        installNewTabSwipeGesture({
            root,
            target: () => root.querySelector<HTMLElement>('[data-newtab-study]'),
            signal: controller.signal,
            shouldStart: () => this.canSwipeCurrentStudyCard(),
            onSwipe: action => this.handleNewTabSwipe(root, action),
        });

        window.addEventListener('popstate', () => this.handleLocationPopstate(root), { signal: controller.signal });

        const syncQueuedGrades = () => { void this.flushQueuedGrades(); };
        window.addEventListener('online', syncQueuedGrades, { signal: controller.signal });
        window.addEventListener('focus', syncQueuedGrades, { signal: controller.signal });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) syncQueuedGrades();
        }, { signal: controller.signal });
        this.rootEventController = controller;
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
        const action = target.closest<HTMLElement>('[data-newtab-action]')?.dataset.newtabAction;
        return { target, action };
    }

    private handleRootClickActions(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
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
        if (this.state.mode !== 'search') return false;
        this.handleSearchKeydown(root, event, target);
        return true;
    }

    private handleStudyKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): void {
        if (!isNewTabStudyKeyboardMode(this.state.mode)) return;
        const settings = this.dependencies.getSettings();
        const direction = this.studyNavigationDirection(event, settings);
        if (direction) {
            event.preventDefault();
            this.showWordInDirection(direction);
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
        const candidates = settings.twoButtonReviews
            ? TWO_BUTTON_REVIEW_SHORTCUTS
            : FIVE_BUTTON_REVIEW_SHORTCUTS;
        const grade = matchedReviewShortcutGrade(event, settings.shortcuts, candidates);
        if (!grade) return;
        const button = root.querySelector<HTMLButtonElement>(`[data-newtab-study] [data-newtab-action="grade"][data-grade="${grade}"]:not([disabled])`);
        if (!button) return;
        event.preventDefault();
        this.dismissKeyHints(root);
        button.click();
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

    private handleRootUtilityClick(root: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
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
        return false;
    }

    private handleRootModeClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        if (action === 'mode') {
            event.preventDefault();
            const requestedMode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode;
            const mode = requestedMode === 'kanji' || requestedMode === 'search' || requestedMode === 'stats' ? requestedMode : 'word';
            this.setState({ mode, revealAnswer: false }, root, { preserveWord: true });
            return true;
        }
        if (action === 'source-toggle') {
            event.preventDefault();
            const source = this.sourceToggleClickTarget(target);
            if (source === 'jpdb' || source === 'anki' || source === 'dictionary') void this.switchReviewSource(root, source);
            return true;
        }
        return false;
    }

    private handleRootStudyActionClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        const handler = action ? this.studyClickHandlers[action] : undefined;
        if (!handler) return false;
        event.preventDefault();
        handler(root, target, event);
        return true;
    }

    private navigateFromPointer(direction: PointerNavigationDirection, event: MouseEvent): void {
        if (this.acceptPointerNavigation(direction, event)) this.showWordInDirection(direction);
    }

    private showWordInDirection(direction: PointerNavigationDirection): void {
        if (direction === 'next') this.showNextWord();
        else this.showPreviousWord();
    }

    private gradeFromStudyClick(root: HTMLElement, target: HTMLElement): void {
        const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
        if (grade) void this.gradeCurrentCard(grade, this.selectedMainGradeTarget(root));
    }

    private handleNewTabSwipe(root: HTMLElement, action: NewTabSwipeAction): void {
        if (!this.canSwipeCurrentStudyCard()) return;
        const settings = this.dependencies.getSettings();
        const grade = newTabSwipeGrade(action, { twoButtonReviews: settings.twoButtonReviews });
        void this.gradeCurrentCard(grade, this.selectedMainGradeTarget(root));
    }

    private canSwipeCurrentStudyCard(): boolean {
        if (!this.dependencies.getSettings().newTabSwipeReviews) return false;
        const card = this.visibleWords[this.index];
        return Boolean(
            card
            && this.state.mode !== 'search'
            && this.state.mode !== 'stats'
            && this.canReviewCard(card),
        );
    }

    private kanjiActionIdFromTarget(target: HTMLElement): string {
        return target.closest<HTMLElement>('[data-kanji-action-id]')?.dataset.kanjiActionId ?? '';
    }

    private handleStudyCardClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): void {
        if (this.state.mode === 'search') return;
        const study = target.closest<HTMLElement>('[data-newtab-study]');
        if (study && !isNewTabStudyInteractiveTarget(target)) {
            event.preventDefault();
            this.toggleReveal(root);
        }
    }

    private handleStatsClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action?: string): boolean {
        const request = this.statsClickRequest(root, target, action, event);
        if (!request) return false;
        event.preventDefault();
        return this.performStatsClick(root, request);
    }

    private statsClickRequest(root: HTMLElement, target: HTMLElement, action: string | undefined, event: MouseEvent): StatsClickRequest | null {
        const chartDayTarget = action ? null : this.nearestStatsChartDayTarget(root, target, event);
        const resolvedAction = action ?? chartDayTarget?.dataset.newtabAction;
        return resolvedAction?.startsWith('stats-')
            ? { action: resolvedAction, chartDayTarget, target: chartDayTarget ?? target }
            : null;
    }

    private performStatsClick(root: HTMLElement, request: StatsClickRequest): boolean {
        const handler = this.statsClickHandlers[request.action];
        if (!handler) return false;
        handler(root, request.target, request);
        return true;
    }

    private selectStatsSource(root: HTMLElement, target: HTMLElement): void {
        const source = target.closest<HTMLElement>('[data-stats-source]')?.dataset.statsSource;
        this.statsSelectedSource = statsSourceIdFromValue(source);
        this.renderStats(root);
    }

    private selectStatsActivityMetric(root: HTMLElement, target: HTMLElement): void {
        const metric = target.closest<HTMLElement>('[data-stats-activity-metric]')?.dataset.statsActivityMetric;
        this.statsActivityMetric = normalizeNewTabStatsActivityMetric(metric);
        this.renderStats(root);
    }

    private selectStatsDay(root: HTMLElement, target: HTMLElement, chartDayTarget: HTMLElement | null): void {
        const date = target.closest<HTMLElement>('[data-stats-day]')?.dataset.statsDay ?? chartDayTarget?.dataset.statsDay;
        if (!isNewTabStatsDateKey(date)) return;
        this.statsSelectedDate = date;
        this.renderStats(root);
    }

    private nearestStatsChartDayTarget(root: HTMLElement, target: HTMLElement, event: MouseEvent): HTMLElement | null {
        if (!this.hasCoarsePointer()) return null;
        const point = pointerPointFromEvent(event);
        if (!point) return null;
        return nearestElementByPoint(this.nearbyStatsChartDayTargets(root, target), point);
    }

    private nearbyStatsChartDayTargets(root: HTMLElement, target: HTMLElement): HTMLElement[] {
        const chart = target.closest<HTMLElement>('.jpdb-reader-stats-bars, .jpdb-reader-stats-heatmap-grid');
        if (!chart || !root.contains(chart)) return [];
        return Array.from(chart.querySelectorAll<HTMLElement>('[data-newtab-action="stats-select-day"][data-stats-day]'));
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

        const actionTarget = target.closest<HTMLElement>('[data-action]');
        if (actionTarget && root.contains(actionTarget) && !actionTarget.classList.contains('jpdb-reader-word')) {
            return this.handleNestedLookupAction(root, actionTarget, event);
        }
        if (this.handleParsedWordLookup(root, target, event)) return true;
        if (actionTarget && root.contains(actionTarget)) return this.handleNestedLookupAction(root, actionTarget, event);
        return this.handlePromptLookupClick(root, target, event);
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
        if (this.state.mode === 'search') {
            this.selectSearchSuggestion(root, request.expression);
            return;
        }
        const sourceReviewCard = this.sourceReviewLookupCardForTarget(request.word);
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
        return typeof getCachedCard === 'function'
            ? getCachedCard.call(this.dependencies.parser, Number(word.dataset.vid), Number(word.dataset.sid))
            : undefined;
    }

    private handlePromptLookupClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const request = this.promptLookupRequest(root, target);
        if (!request) return false;
        consumeNestedLookupEvent(event);
        this.performPromptLookup(request);
        return true;
    }

    private promptLookupRequest(root: HTMLElement, target: HTMLElement): PromptLookupRequest | null {
        if (this.state.mode !== 'word') return null;
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
        if (this.state.mode === 'search') {
            this.selectSearchSuggestion(root, query);
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
        if (this.state.mode === 'search') return undefined;
        const card = this.visibleWords[this.index];
        return card ? { kind: 'word', card, sentence: sentenceForCard(card) } : undefined;
    }

    private handleNestedLookupAction(root: HTMLElement, actionTarget: HTMLElement, event: MouseEvent): boolean {
        const action = actionTarget.dataset.action;
        if (action === 'kanji') {
            return this.handleNestedKanjiAction(root, actionTarget, event);
        }
        if (action === 'similar-word' || action === 'lookup') {
            return this.handleNestedTermLookupAction(root, actionTarget, event);
        }
        if (action === 'jiten-kanji-more') {
            return this.handleNestedJitenKanjiMoreAction(actionTarget, event);
        }
        if (action === 'jiten-kanji-reading') {
            return this.handleNestedJitenKanjiReadingAction(actionTarget, event);
        }
        if (action === 'jpdb-example-audio') {
            return this.handleNestedJpdbExampleAudioAction(actionTarget, event);
        }
        if (action === 'jiten-audio') {
            return this.handleNestedJitenAudioAction(actionTarget, event);
        }
        if (action === 'search-word-audio') {
            return this.handleSearchWordAudioAction(actionTarget, event);
        }
        if (action === 'anki-media-audio') {
            return this.handleNestedAnkiMediaAudioAction(actionTarget, event);
        }
        if (action === 'deck-picker' || action === 'add') {
            return this.handleNestedDeckPickerAction(actionTarget, event);
        }
        if (action === 'review-target-toggle' && actionTarget instanceof HTMLButtonElement) {
            consumeNestedLookupEvent(event);
            togglePopoverReviewTargetSelection(actionTarget);
            return true;
        }
        if (action === 'copy-word'
            || action === 'anki'
            || action === 'anki-edit'
            || action === 'neverforget'
            || action === 'blacklist'
            || action === 'jiten-mining'
            || action === 'jiten-suspend'
            || action === 'jiten-forget') {
            return this.handleNestedCardAction(actionTarget, event);
        }
        return false;
    }

    private handleNestedKanjiAction(root: HTMLElement, actionTarget: HTMLElement, event: MouseEvent): boolean {
        const card = this.visibleWords[this.index];
        const kanji = actionTarget.dataset.kanji ?? '';
        if (!kanji) return false;
        consumeNestedLookupEvent(event);
        if (this.state.mode === 'search') {
            this.selectSearchSuggestion(root, kanji);
            return true;
        }
        if (!card) return true;
        if (this.dependencies.showKanjiCard) {
            void this.dependencies.showKanjiCard(card, kanji, sentenceForCard(card), actionTarget, this.nestedLookupOptions());
        } else {
            void this.dependencies.lookupText?.(kanji, kanji, actionTarget, this.nestedLookupOptions());
        }
        return true;
    }

    private handleNestedTermLookupAction(root: HTMLElement, actionTarget: HTMLElement, event: MouseEvent): boolean {
        const term = cleanNestedLookupValue(actionTarget.dataset.expression ?? actionTarget.dataset.term);
        if (!term) return false;
        const reading = cleanNestedLookupValue(actionTarget.dataset.reading);
        consumeNestedLookupEvent(event);
        if (this.state.mode === 'search') {
            this.selectSearchSuggestion(root, term);
            return true;
        }
        const sourceReviewCard = this.sourceReviewLookupCardForTarget(actionTarget);
        if (sourceReviewCard && this.dependencies.showLookupCard) {
            void this.dependencies.showLookupCard(sourceReviewCard, actionTarget.dataset.sentence || sentenceForCard(sourceReviewCard), actionTarget, this.nestedLookupOptions());
            return true;
        }
        void this.dependencies.lookupText?.(term, reading || term, actionTarget, this.nestedLookupOptions());
        return true;
    }

    private handleNestedJitenKanjiMoreAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget.closest<HTMLButtonElement>('button[data-action="jiten-kanji-more"]');
        if (!button) return false;
        consumeNestedLookupEvent(event);
        void this.loadMoreJitenKanjiWords(button);
        return true;
    }

    private jitenKanjiWordsActionContext(): JitenKanjiWordsActionContext | null {
        const jiten = this.dependencies.jiten;
        const lookupKanjiWords = jiten?.lookupKanjiWords;
        if (typeof lookupKanjiWords !== 'function') return null;
        return {
            lookupKanjiWords: (character, options) => lookupKanjiWords.call(jiten, character, options),
            language: () => this.dependencies.getSettings().interfaceLanguage,
        };
    }

    private async loadMoreJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        const context = this.jitenKanjiWordsActionContext();
        if (context) await loadMoreSharedJitenKanjiWords(button, context);
    }

    private handleNestedJitenKanjiReadingAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget.closest<HTMLButtonElement>('button[data-action="jiten-kanji-reading"]');
        if (!button) return false;
        consumeNestedLookupEvent(event);
        void this.filterJitenKanjiWords(button);
        return true;
    }

    private async filterJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        const context = this.jitenKanjiWordsActionContext();
        if (context) await filterSharedJitenKanjiWords(button, context);
    }

    private handleNestedJpdbExampleAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        if (!button) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.playJpdbExampleAudio?.(button.dataset.jpdbAudio ?? '', button.dataset.jpdbExampleSentence ?? '');
        return true;
    }

    private handleNestedJitenAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const card = this.nestedCardActionCard(actionTarget);
        if (!button || !card || !this.dependencies.performCardAction) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.performCardAction(button, card, button.dataset.studySentence || sentenceForCard(card), button);
        return true;
    }

    private handleNestedCardAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const card = this.nestedCardActionCard(actionTarget);
        if (!button || !card || !this.dependencies.performCardAction) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.performCardAction(button, card, button.dataset.studySentence || sentenceForCard(card), button);
        return true;
    }

    private handleNestedDeckPickerAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const card = this.nestedCardActionCard(actionTarget);
        const performCardAction = this.dependencies.performCardAction;
        if (!button || !card || !performCardAction) return false;
        consumeNestedLookupEvent(event);
        const sentence = button.dataset.studySentence || sentenceForCard(card);
        openDeckPickerForCardAdd(button, card, sentence, (actionButton, actionCard, actionSentence) => (
            performCardAction(actionButton, actionCard, actionSentence, actionButton)
        ));
        return true;
    }

    private nestedCardActionCard(target: HTMLElement): JPDBCard | undefined {
        const key = cleanNestedLookupValue(target.closest<HTMLElement>('[data-newtab-card]')?.dataset.newtabCard);
        if (key) {
            return this.searchWordCardCache.get(key)
                ?? this.visibleWords.find(card => this.cardMatchesSelectionKey(card, key))
                ?? this.allWords.find(card => this.cardMatchesSelectionKey(card, key));
        }
        return this.visibleWords[this.index];
    }

    private handleSearchWordAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const key = button?.dataset.newtabCard ?? '';
        const card = key ? this.searchWordCardCache.get(key) : undefined;
        if (!button || !card) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.playWordAudio?.(card);
        return true;
    }

    private handleNestedAnkiMediaAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        const card = this.nestedCardActionCard(actionTarget);
        if (!button || !card || !this.dependencies.performCardAction) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.performCardAction(button, card, sentenceForCard(card), button);
        return true;
    }

    private toggleNewTabImmersionTranslations(root: HTMLElement): void {
        const settings = this.dependencies.getSettings();
        const shouldBlur = !settings.immersionKitRevealTranslationOnClick;
        if (this.dependencies.setImmersionTranslationBlurred) {
            this.dependencies.setImmersionTranslationBlurred(shouldBlur);
        } else {
            settings.immersionKitRevealTranslationOnClick = shouldBlur;
            void this.dependencies.onSettingsChange();
        }
        root.querySelectorAll<HTMLElement>('.jpdb-reader-example-translation').forEach(translation => {
            setNewTabImmersionTranslationBlurred(translation, shouldBlur, settings.interfaceLanguage);
        });
    }

    private toggleReveal(root: HTMLElement): void {
        const current = this.visibleWords[this.index];
        const willReveal = !this.state.revealAnswer;
        if (current?.reviewSource === 'jpdb-live' && willReveal) this.dependencies.jpdbReviewBridge.reveal();
        this.setState({ revealAnswer: willReveal }, root, { preserveWord: true });
        this.maybeAutoPlayRevealedImmersionAudio(current, willReveal);
    }

    private maybeAutoPlayRevealedImmersionAudio(card: JPDBCard | undefined, revealed: boolean): void {
        const settings = this.dependencies.getSettings();
        if (!revealed || !card || this.state.mode !== 'word') return;
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
            && this.state.mode !== 'search'
            && this.state.mode !== 'stats';
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
            && this.state.mode !== 'search'
            && this.state.mode !== 'stats';
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
        const loadedWords = this.loadedWordsForResult(result, options.excludeCardKeys);
        if (this.shouldKeepCurrentQuietWords(options, loadedWords)) return;
        this.allWords = this.mergeLoadedWordsWithNavigatedCachedCard(
            loadedWords,
            preferredCard,
            usedCachedWords,
            navigationGeneration,
            result,
        );
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
            dedupeWords(result.cards.map(normalizeNewTabCard)),
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

    private shouldKeepCurrentCardForBackgroundLoad(
        loadedWords: JPDBCard[],
        preferredCard: JPDBCard | undefined,
        usedCachedWords: boolean,
        navigationGeneration: number,
        result: NewTabLoadResult,
    ): preferredCard is JPDBCard {
        return Boolean(
            preferredCard
            && usedCachedWords
            && this.navigationGeneration !== navigationGeneration
            && result.reviewCountMode !== true
            && !loadedWords.some(card => cardKey(card) === cardKey(preferredCard)),
        );
    }

    private sourceCardForVisibleCard(card: JPDBCard | undefined): JPDBCard | undefined {
        if (!card?.sourceCardKey) return card;
        return this.allWords.find(item => cardKey(item) === card.sourceCardKey) ?? card;
    }

    private sourceReviewLookupCard(card: JPDBCard | undefined): JPDBCard | undefined {
        const sourceCard = this.sourceCardForVisibleCard(card);
        return sourceCard && this.shouldPreserveSourceReviewLookupCard(sourceCard) ? sourceCard : undefined;
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
        const vid = Number(target.dataset.vid);
        const sid = Number(target.dataset.sid);
        if (Number.isFinite(vid) && Number.isFinite(sid) && vid === card.vid && sid === card.sid) return true;
        const term = cleanNestedLookupValue(target.dataset.expression ?? target.dataset.term) || cleanNestedLookupValue(readerWordSurfaceText(target));
        const reading = cleanNestedLookupValue(target.dataset.reading);
        return term === card.spelling && (!reading || reading === newTabCardReading(card));
    }

    private isDictionaryCard(card: JPDBCard): boolean {
        return card.source === 'local' || card.source === 'fallback' || card.reviewSource === 'dictionary';
    }

    private async applyOfflineCacheWhileLoading(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number): Promise<boolean> {
        if (this.allWords.length || this.state.mode === 'search') return false;
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

    private renderStats(root: HTMLElement): void {
        this.syncMode(root);
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-empty-mode', 'jpdb-reader-newtab-revealed', 'jpdb-reader-newtab-review-mode');
        this.syncThemeToggle(root);
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (!study) return;
        study.removeAttribute('data-newtab-card');
        study.replaceChildren(renderNewTabStatsContent({
            activityMetric: this.statsActivityMetric,
            language: this.resolvedLanguage(),
            selectedDate: this.statsSelectedDate,
            selectedSource: this.statsSelectedSource,
            snapshot: this.statsSnapshot,
            text: key => this.text(key),
        }));
        this.renderInstallCta(root);
    }

    private studyStatsTroubleCards(root: HTMLElement): void {
        const source: NewTabUiState['source'] = this.statsSelectedSource === 'jpdb'
            ? 'jpdb'
            : this.statsSelectedSource === 'anki'
                ? 'anki'
                : 'auto';
        this.statsStudyFilter = 'trouble';
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.index = 0;
        this.state = { ...this.state, source, mode: 'word', revealAnswer: false };
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

    private async loadStatsInto(root: HTMLElement, force = false): Promise<void> {
        if (this.statsLoaded && !force) return;
        await this.loadStatsDeckPrefs();
        const generation = ++this.statsGeneration;
        this.statsSnapshot = {
            jpdb: { ...this.statsSnapshot.jpdb, status: 'loading', message: this.text('statsLoading') },
            anki: { ...this.statsSnapshot.anki, status: 'loading', message: this.text('statsLoading') },
            combined: { ...this.statsSnapshot.combined, status: 'loading', message: this.text('statsLoading') },
        };
        this.renderStats(root);
        const [history, jpdb, anki] = await Promise.all([
            this.readJpdbStatsHistory(),
            this.loadJpdbStatsSource(),
            this.loadAnkiStatsSource(),
        ]);
        if (generation !== this.statsGeneration || !root.isConnected) return;
        const jpdbWithHistory = applyJitenDailyStats(applyJpdbReviewImport(jpdb, history), loadJitenDailyStats());
        this.statsSnapshot = {
            jpdb: jpdbWithHistory,
            anki,
            combined: combineStatsSources(jpdbWithHistory, anki),
        };
        this.statsLoaded = true;
        this.renderStats(root);
    }

    private async loadJpdbStatsSource(): Promise<StatsSourceSnapshot> {
        const providers = this.jpdbStatsApiProviders(this.dependencies.getSettings());
        if (!providers.length) return emptyStatsSource('jpdb', this.apiReviewSourceLabel(), this.text('statsApiKeyMissing'), 'setup');
        const results = await Promise.all(providers.map(provider => this.loadJpdbStatsApiProvider(provider)));
        return this.jpdbStatsSourceFromApiResults(results);
    }

    private jpdbStatsApiProviders(settings: ReaderSettings): NewTabStatsApiProvider[] {
        const providers: NewTabStatsApiProvider[] = [];
        const jiten = this.dependencies.jiten;
        if (hasJitenApiCredential(settings) && typeof jiten?.listStudyBatchCards === 'function') {
            const listJitenStudyBatchCards = jiten.listStudyBatchCards.bind(jiten);
            providers.push({
                label: 'Jiten',
                load: () => listJitenStudyBatchCards(NEW_TAB_STATS_JPDB_CARD_LIMIT),
            });
        }
        if (hasJpdbApiCredential(settings)) providers.push({
            label: 'JPDB',
            load: () => this.loadJpdbStatsCards(),
        });
        return providers;
    }

    // SH-3 v2: the My-Cards browser spans all three providers. Anki joins
    // only here — NOT in jpdbStatsApiProviders — because the stats page has
    // its own dedicated Anki source and must not double-count cards.
    private browsePoolProviders(settings: ReaderSettings): NewTabStatsApiProvider[] {
        const providers = this.jpdbStatsApiProviders(settings);
        if (settings.ankiEnabled && settings.newTabAnkiEnabled && typeof this.dependencies.anki.listNewTabCards === 'function') {
            providers.push({
                label: 'Anki',
                load: () => this.dependencies.anki.listNewTabCards(NEW_TAB_STATS_JPDB_CARD_LIMIT),
            });
        }
        return providers;
    }

    private async loadJpdbStatsApiProvider(provider: NewTabStatsApiProvider): Promise<NewTabStatsApiProviderResult> {
        try {
            return { provider, cards: await provider.load(), error: null };
        } catch (error) {
            log.warn(`${provider.label} stats failed`, error);
            return { provider, cards: [], error };
        }
    }

    private jpdbStatsSourceFromApiResults(results: NewTabStatsApiProviderResult[]): StatsSourceSnapshot {
        const loaded = results.filter(result => result.error === null);
        const label = orderedNewTabStatsProviderLabel(loaded.length ? loaded : results);
        if (!loaded.length) {
            const error = results.find(result => result.error)?.error;
            return emptyStatsSource('jpdb', label, error instanceof Error ? error.message : this.text('couldNotLoadWords'), 'error');
        }
        const cards = dedupeWords(loaded.flatMap(result => result.cards)).slice(0, NEW_TAB_STATS_JPDB_CARD_LIMIT);
        const message = this.apiStatsLoadedMessage(label, cards.length);
        return statsFromApiCards(cards, label, message);
    }

    private apiStatsLoadedMessage(label: string, cardCount: number): string {
        if (!cardCount) return this.text('statsNoData');
        if (label === 'JPDB') return this.text('statsJpdbLoaded');
        if (label === 'Jiten') return this.text('statsJitenLoaded');
        return this.formatNewTabText('statsApiLoaded', { providers: label });
    }

    private async loadJpdbStatsCards(): Promise<JPDBCard[]> {
        try {
            return await this.dependencies.jpdb.listDeckCards(JPDB_ALL_DECKS, NEW_TAB_STATS_JPDB_CARD_LIMIT);
        } catch (error) {
            log.warn('JPDB deck stats fallback', error);
        }
        const decks = await this.dependencies.jpdb.listDecks();
        const groups = await Promise.all(decks.slice(0, JPDB_DECK_SAMPLE_LIMIT).map(deck =>
            this.dependencies.jpdb.listDeckCards(deck.id, Math.ceil(NEW_TAB_STATS_JPDB_CARD_LIMIT / JPDB_DECK_SAMPLE_LIMIT)).catch((): JPDBCard[] => []),
        ));
        return dedupeWords(groups.flat()).slice(0, NEW_TAB_STATS_JPDB_CARD_LIMIT);
    }

    private async loadAnkiStatsSource(): Promise<StatsSourceSnapshot> {
        try {
            return await loadAnkiConnectStats({
                invoke: (action, params) => this.dependencies.anki.invoke(action, params),
            }, {
                disabledDeckNames: [...this.statsDisabledAnkiDecks],
            });
        } catch (error) {
            log.warn('Anki stats failed', error);
            return emptyStatsSource('anki', 'Anki', this.text('statsAnkiUnavailable'), 'setup');
        }
    }

    private async connectAnkiStats(root: HTMLElement): Promise<void> {
        try {
            await this.dependencies.anki.requestPermission();
        } catch (error) {
            log.warn('Anki permission request failed', error);
            this.statsSnapshot = {
                ...this.statsSnapshot,
                anki: emptyStatsSource('anki', 'Anki', this.text('statsAnkiUnavailable'), 'error'),
            };
            this.statsSnapshot.combined = combineStatsSources(this.statsSnapshot.jpdb, this.statsSnapshot.anki);
            this.renderStats(root);
            return;
        }
        this.statsLoaded = false;
        await this.loadStatsInto(root, true);
    }

    private toggleStatsAnkiDeck(root: HTMLElement, target: HTMLElement): void {
        const deck = target.closest<HTMLElement>('[data-stats-anki-deck]')?.dataset.statsAnkiDeck;
        if (!deck) return;
        if (!this.statsDeckPrefsLoaded) {
            void this.loadStatsDeckPrefs().then(() => this.toggleStatsAnkiDeck(root, target));
            return;
        }
        if (this.statsDisabledAnkiDecks.has(deck)) this.statsDisabledAnkiDecks.delete(deck);
        else this.statsDisabledAnkiDecks.add(deck);
        this.applyStatsAnkiDeckToggles(root);
        void gmStorageSet(NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY, [...this.statsDisabledAnkiDecks]).catch(error => {
            log.warn('Anki stats deck preference save failed', error);
        });
        this.statsLoaded = false;
        void this.loadStatsInto(root, true);
    }

    private applyStatsAnkiDeckToggles(root: HTMLElement): void {
        const anki = this.statsSnapshot.anki;
        if (!anki.deckNames?.length) return;
        const activeDeckNames = anki.deckNames.filter(deck => !this.statsDisabledAnkiDecks.has(deck));
        const nextAnki: StatsSourceSnapshot = {
            ...anki,
            status: 'ready',
            message: this.statsAnkiDeckSelectionMessage(activeDeckNames.length, anki.deckNames.length),
            activeDeckNames,
        };
        this.statsSnapshot = {
            ...this.statsSnapshot,
            anki: nextAnki,
            combined: combineStatsSources(this.statsSnapshot.jpdb, nextAnki),
        };
        this.renderStats(root);
    }

    private statsAnkiDeckSelectionMessage(activeDeckCount: number, totalDeckCount: number): string {
        if (!totalDeckCount) return this.text('statsAnkiConnected');
        if (!activeDeckCount) return this.formatNewTabText('statsAnkiNoDecksSelected', { total: String(totalDeckCount) });
        if (activeDeckCount === totalDeckCount) {
            return this.formatNewTabText('statsAnkiDecksSelected', {
                count: String(totalDeckCount),
                plural: totalDeckCount === 1 ? '' : 's',
            });
        }
        return this.formatNewTabText('statsAnkiPartialDecksSelected', {
            count: String(activeDeckCount),
            total: String(totalDeckCount),
        });
    }

    private async importJpdbStatsFile(root: HTMLElement, file: File): Promise<void> {
        try {
            const imported = parseJpdbReviewExportText(await file.text());
            await gmStorageSet(NEW_TAB_STATS_JPDB_HISTORY_KEY, imported);
            const jpdb = applyJpdbReviewImport({
                ...this.statsSnapshot.jpdb,
                message: this.text('statsImportReady'),
                status: this.statsSnapshot.jpdb.status === 'ready' ? 'ready' : 'partial',
            }, imported);
            this.statsSnapshot = {
                jpdb,
                anki: this.statsSnapshot.anki,
                combined: combineStatsSources(jpdb, this.statsSnapshot.anki),
            };
            this.statsSelectedSource = this.statsSelectedSource === 'anki' ? 'combined' : this.statsSelectedSource;
            this.statsLoaded = true;
        } catch (error) {
            log.warn('JPDB stats import failed', error);
            this.statsSnapshot = {
                ...this.statsSnapshot,
                jpdb: {
                    ...this.statsSnapshot.jpdb,
                    status: 'error',
                    message: this.text('statsImportFailed'),
                },
            };
            this.statsSnapshot.combined = combineStatsSources(this.statsSnapshot.jpdb, this.statsSnapshot.anki);
        }
        this.renderStats(root);
    }

    private async readJpdbStatsHistory(): Promise<JpdbReviewImport | null> {
        try {
            const value = await gmStorageGet<JpdbReviewImport | null>(NEW_TAB_STATS_JPDB_HISTORY_KEY, null);
            return value && Array.isArray(value.daily) ? value : null;
        } catch {
            return null;
        }
    }

    private async loadStatsDeckPrefs(): Promise<void> {
        if (this.statsDeckPrefsLoaded) return;
        try {
            const disabled = await gmStorageGet<string[]>(NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY, []);
            this.statsDisabledAnkiDecks = new Set(Array.isArray(disabled) ? disabled.filter(deck => typeof deck === 'string') : []);
        } catch {
            this.statsDisabledAnkiDecks = new Set();
        }
        this.statsDeckPrefsLoaded = true;
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
        if (plan.kind === 'auto-review') return this.loadAutoReviewWordSources(onProgress);
        const accumulator = emptyNewTabLoadAccumulator();
        for (const source of plan.primarySources) {
            await this.appendLoadedWordsFromSource(accumulator, source, onProgress);
        }
        return accumulator;
    }

    private async loadAutoReviewWordSources(_onProgress?: (message: string) => void): Promise<NewTabLoadAccumulator> {
        const results = await this.loadAutoReviewSourceResults();
        return this.accumulateAutoReviewSourceResults(results);
    }

    private async loadAutoReviewSourceResults(): Promise<NewTabLoadResult[]> {
        const jpdbCacheContext = this.sourceCacheContext('jpdb');
        const ankiCacheContext = this.sourceCacheContext('anki');
        const jpdbPromise = this.loadJpdbWords({ allowPublicFallback: false, timeoutMs: NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS });
        const ankiPromise = this.loadAnkiWords(NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS);
        const [jpdbResult, ankiResult] = await Promise.all([jpdbPromise, ankiPromise]);
        this.rememberSourceResult('jpdb', jpdbResult, jpdbCacheContext);
        this.rememberSourceResult('anki', ankiResult, ankiCacheContext);
        return autoReviewSourceResults(jpdbResult, ankiResult);
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
            : await this.loadFreshStudyWords(onProgress, { allowPublicJpdbFallback: this.shouldAllowPublicJpdbStudyFallback() });
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
            || Boolean(settings.ankiEnabled && settings.newTabAnkiEnabled);
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
        const studyCount = this.state.mode === 'kanji'
            ? this.kanjiStudyCardsFromSourceCards(accumulator.cards).length
            : accumulator.cards.length;
        return studyCount < plan.studyFallback.minCards
            && !accumulator.cards.some(card => this.isDictionaryCard(card));
    }

    private shouldLoadEmptyApiStudyFallback(accumulator: NewTabLoadAccumulator): boolean {
        return !this.currentModeStudyCardCount(accumulator.cards)
            && accumulator.reviewCountMode
            && !this.shouldKeepEmptyReviewLoad(accumulator);
    }

    private shouldLoadQueryStudyFallback(accumulator: NewTabLoadAccumulator): boolean {
        return Boolean(normalizeSearchQuery(this.searchQuery))
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
        return this.state.mode === 'kanji'
            ? this.kanjiStudyCardsFromSourceCards(cards).length
            : cards.length;
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
        if (context && (context.version !== this.sourceCacheVersion(source) || context.signature !== this.sourceCacheSignature(source))) {
            return result;
        }
        if (result.cards.length || source === 'anki' || source === 'dictionary') {
            this.sourceResultCache.set(source, {
                signature: context?.signature ?? this.sourceCacheSignature(source),
                result: {
                    ...result,
                    cards: [...result.cards],
                },
            });
        }
        return result;
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
        for (const source of ['jpdb', 'anki', 'dictionary'] as ConcreteNewTabWordSource[]) {
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
        return JSON.stringify({
            source,
            language: this.language(),
            apiKey: hasJpdbApiCredential(settings),
            jitenApiKey: hasJitenApiCredential(settings),
            jpdbMiningEnabled: settings.jpdbMiningEnabled,
            jpdbReviewMode: settings.newTabJpdbReviewMode,
            jpdbDeck: settings.newTabJpdbDeck,
            activeJpdbDeck: this.state.jpdbDeck,
            ankiEnabled: settings.ankiEnabled,
            ankiNewTabEnabled: settings.newTabAnkiEnabled,
            ankiDeck: settings.ankiDeck,
            activeAnkiDeck: this.normalizedAnkiDeckScope(),
            ankiModel: settings.ankiModel,
            ankiDisabledDecks: settings.newTabAnkiDisabledDecks,
            dictionaries: settings.localDictionariesEnabled,
            dictionaryPreferences: settings.dictionaryPreferences,
        });
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
        const settings = this.dependencies.getSettings();
        const cardLimit = Math.max(1, Math.floor(limit));
        if (!settings.localDictionariesEnabled) {
            return {
                cards: [],
                sourceLabel: this.text('dictionary'),
                reviewCountMode: false,
            };
        }
        try {
            if (!await this.hasLocalDictionaries()) {
                return {
                    cards: [],
                    sourceLabel: this.text('dictionary'),
                    reviewCountMode: false,
                };
            }

            const entries = await this.loadDictionaryFallbackEntries(settings, cardLimit);
            const cards = entries.map(entry => this.dependencies.parser.localCardFromEntry(entry));
            if (this.state.mode === 'kanji') {
                cards.push(...await this.loadDictionaryKanjiCards(settings, cards, cardLimit));
            }
            return {
                cards,
                sourceLabel: this.text('dictionary'),
                reviewCountMode: false,
            };
        } catch {
            return { cards: [], sourceLabel: this.text('dictionary'), reviewCountMode: false };
        }
    }

    private async loadFreshStudyWords(
        onProgress?: (message: string) => void,
        options: { requireDictionaryBeforePublicFallback?: boolean; allowPublicJpdbFallback?: boolean } = {},
    ): Promise<NewTabLoadResult> {
        if (options.requireDictionaryBeforePublicFallback) {
            const dictionaryResult = await this.loadDictionaryWords(onProgress);
            if (dictionaryResult.cards.length) return dictionaryResult;
            return options.allowPublicJpdbFallback ? this.loadPublicFreshStudyWords(dictionaryResult) : this.loadBuiltInFreshStudyWords();
        }
        const publicJpdbPromise = options.allowPublicJpdbFallback ? this.loadPublicJpdbWords() : Promise.resolve(emptyNewTabLoadResult('JPDB'));
        const dictionaryResult = await this.loadDictionaryWords(onProgress);
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

    private async loadDictionaryKanjiCards(settings: ReaderSettings, seedCards: JPDBCard[], limit = NEW_TAB_WORD_LIMIT): Promise<JPDBCard[]> {
        const cardLimit = Math.max(1, Math.floor(limit));
        const seeded = new Set(this.kanjiStudyCardsFromSourceCards(seedCards).map(card => card.spelling));
        const listedKanji = await this.dependencies.dictionaries.listKanjiCharacters?.(cardLimit, settings.dictionaryPreferences)
            .catch(() => [] as string[]) ?? [];
        return uniqueStrings(listedKanji)
            .filter(kanji => !seeded.has(kanji))
            .slice(0, cardLimit)
            .map(kanji => dictionaryKanjiStudyCard(kanji));
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
    private jitenDeckOptionsCache?: { key: string; at: number; promise: Promise<Array<{ id: string; name: string }>> };

    private jitenDeckSelectorOptions(settings: ReaderSettings): Promise<Array<{ id: string; name: string }>> {
        const jiten = this.dependencies.jiten;
        if (!hasJitenApiCredential(settings) || typeof jiten?.listStudyDecks !== 'function') return Promise.resolve([]);
        const key = settings.jitenApiKey.trim();
        const now = Date.now();
        if (this.jitenDeckOptionsCache && this.jitenDeckOptionsCache.key === key && now - this.jitenDeckOptionsCache.at < 60_000) {
            return this.jitenDeckOptionsCache.promise;
        }
        const promise = jiten.listStudyDecks()
            .then(decks => decks.map(deck => ({ id: `jiten:${deck.id}`, name: `Jiten · ${deck.name}` })))
            .catch((): Array<{ id: string; name: string }> => []);
        this.jitenDeckOptionsCache = { key, at: now, promise };
        return promise;
    }

    private async loadPublicJpdbWords(): Promise<NewTabLoadResult> {
        const cards = await this.remoteSourceWithFallback(
            'JPDB public dictionary',
            this.loadPublicJpdbDictionaryCards(),
            [] as JPDBCard[],
        );
        return { cards, sourceLabel: 'JPDB', reviewCountMode: false };
    }

    private async loadPublicJpdbDictionaryCards(): Promise<JPDBCard[]> {
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
        if (!this.dependencies.jpdbVocabulary?.search || !await this.hasLocalDictionaries()) return [];
        const entries = await this.loadDictionaryFallbackEntries(this.dependencies.getSettings());
        return this.loadPublicJpdbSearchCards(
            entries.map(entry => entry.expression).filter(Boolean).slice(0, Math.min(NEW_TAB_PUBLIC_JPDB_LOCAL_SEED_LIMIT, NEW_TAB_PUBLIC_JPDB_CONCURRENCY)),
            1,
        );
    }

    private async loadPublicJpdbCardsFromKanjiVocabulary(): Promise<JPDBCard[]> {
        const lookup = this.dependencies.jpdbKanji.lookup;
        if (typeof lookup !== 'function') return [];
        const seeds = randomPublicJpdbSeedKanji(NEW_TAB_PUBLIC_JPDB_CONCURRENCY);
        const groups: JPDBCard[][] = [];
        await runLimited(seeds, NEW_TAB_PUBLIC_JPDB_CONCURRENCY, async (kanji, index) => {
            const info = await promiseWithTimeout(
                lookup.call(this.dependencies.jpdbKanji, kanji),
                NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS,
                'Public JPDB kanji seed timed out.',
            ).catch(() => null);
            groups[index] = (info?.vocabulary ?? []).map(jpdbKanjiVocabularyToNewTabCard);
        });
        return preferMultiCharacterVocabulary(dedupeWords(groups.flat())).slice(0, NEW_TAB_WORD_LIMIT);
    }

    private async loadPublicJpdbSearchCards(queries: string[], limitPerQuery: number): Promise<JPDBCard[]> {
        const search = this.dependencies.jpdbVocabulary?.search;
        if (!search || !queries.length) return [];
        const groups: JPDBCard[][] = [];
        await runLimited(uniqueStrings(queries), NEW_TAB_PUBLIC_JPDB_CONCURRENCY, async (query, index) => {
            groups[index] = await this.searchPublicJpdbCards(query, limitPerQuery);
        });
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
        const normalized = deckId.trim();
        if (!normalized || normalized === 'all' || normalized === JPDB_ALL_DECKS) return '';
        const settings = this.dependencies.getSettings();
        const key = effectiveJpdbApiKey(settings);
        if (this.deckSelectorDecks?.key !== key) {
            const listDecks = typeof this.dependencies.jpdb.listDecks === 'function'
                ? this.dependencies.jpdb.listDecks()
                : Promise.resolve([] as JPDBDeck[]);
            this.deckSelectorDecks = { key, promise: listDecks.catch((): JPDBDeck[] => []) };
        }
        const decks = await this.deckSelectorDecks.promise;
        return decks.find(deck => deck.id === normalized)?.name ?? '';
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

    private isCurrentSourceSwitch(sourceSwitchGeneration: number): boolean {
        return this.sourceSwitchGeneration === sourceSwitchGeneration;
    }

    private persistSourceSettingChange(source: ConcreteNewTabWordSource): Promise<void> {
        return Promise.resolve()
            .then(() => this.dependencies.onSettingsChange())
            .catch(error => {
                log.warn('New-tab source update failed', { source }, error);
            });
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean }): void {
        const preferredCardKey = options.preserveWord ? this.currentVisibleWordKey() : '';
        const shouldClearReviewHistory = (patch.mode !== undefined && patch.mode !== this.state.mode)
            || (patch.source !== undefined && patch.source !== this.state.source);
        this.state = { ...this.state, ...patch };
        if (shouldClearReviewHistory) this.clearReviewHistory();
        this.persistState();
        this.syncMode(root);
        if ((this.state.mode === 'word' || this.state.mode === 'kanji') && !this.allWords.length) {
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
        const sourceSwitchGeneration = ++this.sourceSwitchGeneration;
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
            if (!this.isCurrentSourceSwitch(sourceSwitchGeneration)) return;
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
        if (!this.isCurrentSourceSwitch(sourceSwitchGeneration)) return;
        await this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private canUseCachedResultForSourceSwitch(result: NewTabLoadResult, source: ConcreteNewTabWordSource): boolean {
        if (!result.cards.length) return this.emptyCachedResultMatchesSource(result, source);
        return result.cards.every(card => this.cardPrimaryNewTabSource(card) === source);
    }

    private emptyCachedResultMatchesSource(result: NewTabLoadResult, source: ConcreteNewTabWordSource): boolean {
        if (source === 'anki') return false;
        if (source === 'jpdb') return result.sourceLabel.startsWith('JPDB') || result.sourceLabel.startsWith('Jiten');
        return result.sourceLabel === this.text('dictionary');
    }

    private cardPrimaryNewTabSource(card: JPDBCard): ConcreteNewTabWordSource {
        if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
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
        if (settings.newTabSource !== 'auto') return settings.newTabSource;
        return this.shouldDefaultToAnkiSource(settings) ? 'anki' : 'auto';
    }

    private shouldDefaultToAnkiSource(settings: ReaderSettings): boolean {
        return settings.ankiEnabled
            && this.canUseAnkiSource(settings)
            && !this.hasConfiguredApiReviewSource(settings);
    }

    private hasConfiguredApiReviewSource(settings: ReaderSettings): boolean {
        return this.hasAvailableJpdbReviewSource(settings);
    }

    private async applyExternalState(state: NewTabUiState): Promise<void> {
        if (JSON.stringify(this.state) === JSON.stringify(state)) return;
        const preferredCardKey = this.currentVisibleWordKey();
        const sourceChanged = this.state.source !== state.source;
        this.state = state;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
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
        saveNewTabUiState(this.state);
        this.stateChannel.publish(this.state);
    }

    private applyWords(root: HTMLElement, preferStoredWord: boolean, preferredCardKey = '', options: { preserveOrder?: boolean } = {}): void {
        this.syncMode(root);
        if (this.state.mode === 'search') {
            this.ensureStudySurface(root);
            this.renderSearch(root);
            return;
        }
        if (this.state.mode === 'stats') {
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
        const cards = this.cardsForCurrentMode(this.allWords);
        const filter = this.state.filter;
        // JPDB deck-browse "Show only" parity: a state filter narrows the
        // pool by card state; 'all' bypasses the study-queue selection so
        // known/blacklisted cards become browsable; 'study' is the default
        // scheduled queue.
        if (filter === 'all') return cards;
        if (filter === 'local') return cards.filter(card => card.source === 'local' || card.source === 'fallback');
        if (filter !== 'study') return cards.filter(card => card.cardState.includes(filter));
        return this.applyKanjiUnlockQueue(selectNewTabStudyPool(cards));
    }

    // jpdb Learn parity: locked words sit behind their kanji, so the combined
    // queue serves the KANJI card first; the word unlocks once the provider
    // marks the kanji learned. "Study kanji before unlocking words" (default
    // on) can be turned off for learners who skip kanji — locked words then
    // study directly as words. Progression is unaffected either way: card
    // states live at the provider, the toggle only changes queue composition.
    private applyKanjiUnlockQueue(pool: JPDBCard[]): JPDBCard[] {
        if (this.state.mode !== 'word' || !this.dependencies.getSettings().newTabKanjiUnlockEnabled) return pool;
        const out: JPDBCard[] = [];
        const seenKanji = new Set<string>();
        for (const card of pool) {
            if (!card.cardState.includes('locked') || this.shouldRenderCardAsKanji(card)) {
                out.push(card);
                continue;
            }
            const kanjiCards = kanjiCharacters(card.spelling)
                .filter(kanji => !seenKanji.has(kanji))
                .map(kanji => {
                    seenKanji.add(kanji);
                    return this.kanjiStudyCardFromSourceCard(card, kanji);
                });
            // Kana-only locked cards (no kanji to unlock) study as words.
            if (kanjiCards.length) out.push(...kanjiCards);
            else out.push(card);
        }
        return out;
    }

    private cardsForCurrentMode(cards: JPDBCard[]): JPDBCard[] {
        return this.state.mode === 'kanji'
            ? this.kanjiStudyCardsFromSourceCards(cards)
            : cards;
    }

    private kanjiStudyCardsFromSourceCards(cards: JPDBCard[]): JPDBCard[] {
        const selected: JPDBCard[] = [];
        const indexes = new Map<string, number>();
        for (const card of cards) {
            for (const kanji of kanjiCharacters(card.spelling)) {
                const candidate = this.kanjiStudyCardFromSourceCard(card, kanji);
                const existingIndex = indexes.get(kanji);
                if (existingIndex === undefined) {
                    indexes.set(kanji, selected.length);
                    selected.push(candidate);
                    continue;
                }
                const existing = selected[existingIndex];
                if (existing && shouldReplaceKanjiStudyCard(candidate, existing)) selected[existingIndex] = candidate;
            }
        }
        return selected;
    }

    private kanjiStudyCardFromSourceCard(card: JPDBCard, kanji: string): JPDBCard {
        if (isStandaloneKanjiCard(card, kanji)) return normalizeNewTabCard({ ...card, spelling: kanji, reading: card.reading || kanji });
        const sourceKanji = kanjiCharacters(card.spelling);
        const sourceKeyword = sourceKanji.length === 1 && sourceKanji[0] === kanji ? card.kanjiKeyword : undefined;
        return normalizeNewTabCard({
            ...card,
            vid: stableNegativeNewTabId(`kanji-study:${this.cardReviewSource(card)}:${kanji}`),
            sid: 0,
            rid: 0,
            spelling: kanji,
            reading: kanji,
            frequencyRank: null,
            meanings: [],
            pitchAccent: [],
            wordWithReading: null,
            sentence: card.sentence || card.spelling,
            reviewSource: undefined,
            ankiCardId: card.ankiCardId,
            jpdbReviewId: undefined,
            kanjiKeyword: sourceKeyword,
            sourceCardKey: card.sourceCardKey ?? cardKey(card),
            fallbackLookupTerms: [card.spelling, card.reading, ...(card.fallbackLookupTerms ?? [])].filter(Boolean),
        });
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
        if (this.reviewCountMode) return this.state.mode === 'kanji' ? 'noReviewKanjiReady' : 'noReviewWordsReady';
        return 'noCards';
    }

    private newTabPoolSignature(cards: JPDBCard[]): string {
        return [
            this.state.source,
            this.state.mode,
            this.sourceLabel,
            ...cards.map(card => cardKey(card)),
        ].join('|');
    }

    private resolveInitialIndex(preferStoredWord: boolean, preferredCardKey = ''): number {
        const preferredKey = preferredCardKey || this.preferredStoredWordKey(preferStoredWord);
        if (preferredKey) {
            const index = this.visibleWords.findIndex(card => this.cardMatchesSelectionKey(card, preferredKey));
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

    private cardSelectionKey(card: JPDBCard): string {
        return card.sourceCardKey || cardKey(card);
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
            const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
            if (root) {
                void this.undoLastReview(root);
                return;
            }
        }
        this.navigateStudyWord(-1);
    }

    private navigateStudyWord(direction: 1 | -1): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
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
        this.setStatus(root, this.text(this.state.mode === 'kanji' ? 'noKanjiCardsYet' : 'noWordsYet'));
        const promise = this.appendNavigationSupplement(root, direction, currentKey, source);
        this.navigationSupplementPromise = promise;
        try {
            await promise;
        } catch (error) {
            log.warn('New-tab supplement failed', { source }, error);
            if (root.isConnected && this.visibleWords.length) this.moveVisibleWord(root, direction);
            else if (root.isConnected) this.setStatus(root, this.text('couldNotLoadWords'));
        } finally {
            if (this.navigationSupplementPromise === promise) this.navigationSupplementPromise = null;
        }
    }

    private async appendNavigationSupplement(root: HTMLElement, direction: 1 | -1, currentKey: string, source: NavigationExpansionSource): Promise<void> {
        const beforeSignature = this.newTabPoolSignature(this.studyPoolForCurrentMode());
        const cards = await this.loadNavigationSupplementCards(source);
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
        return this.state.mode === 'search' || this.state.mode === 'stats';
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
        this.writeStoredWordKey(card);
        this.syncCardUrl(card);
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (study) study.dataset.newtabCard = this.cardSelectionKey(card);
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-empty-mode');
        root.classList.toggle('jpdb-reader-newtab-revealed', this.state.revealAnswer);
        const renderAsKanji = this.shouldRenderCardAsKanji(card);
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', renderAsKanji);
        root.classList.toggle('jpdb-reader-newtab-review-mode', this.canReviewCard(card));
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        const state = primaryCardState(card.cardState);

        this.renderPromptForMode(slots, card, state, renderAsKanji);

        this.renderSessionProgress(slots, card, root);
        if (slots.reveal) slots.reveal.textContent = this.revealButtonLabel();
        this.renderControls(slots, card);
        this.renderInstallCta(root);
        this.renderStatus(slots.status, card);
        const prefetchGeneration = ++this.immersionPrefetchGeneration;
        if (!renderAsKanji) this.dependencies.preloadWordAudio?.(card);
        this.prefetchNearbyWordPitch(card);
        this.prefetchNearbyImmersionExamples(card, prefetchGeneration);
    }

    private renderPromptForMode(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>, renderAsKanji = this.shouldRenderCardAsKanji(card)): void {
        if (renderAsKanji) this.renderKanjiPrompt(slots, card);
        else this.renderWordPrompt(slots, card, state);
    }

    private shouldRenderCardAsKanji(card: JPDBCard): boolean {
        return this.state.mode === 'kanji'
            || this.isLiveJpdbKanjiReviewCard(card)
            || isKanjiUnlockStudyCard(card);
    }

    private isLiveJpdbKanjiReviewCard(card: JPDBCard): boolean {
        return card.reviewSource === 'jpdb-live' && (card.jpdbReviewId?.startsWith('kb,') ?? false);
    }

    private revealButtonLabel(): string {
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
        const snapshot = this.reviewCountMode ? this.sessionProgress.snapshot(this.sessionProgressCards()) : null;
        const labels = [
            this.fallbackStudyNotice ? this.text('reviewFallbackNotice') : '',
            this.dueSummaryLabel(),
            baseLabel,
            snapshot ? formatNewTabSessionProgressLabel(snapshot, {
                completed: this.text('sessionDone'),
                left: this.text('sessionLeft'),
                due: this.text('statsDue'),
            }) : this.sessionElapsedLabel(),
            this.dailyGoalLabel(),
        ].filter(Boolean);
        this.ensureSessionClock(root);
        if (!labels.length) {
            this.renderCount(slots.count, '', null);
            return;
        }
        this.renderCount(slots.count, labels.join(' · '), snapshot);
    }

    // The session stopwatch was previously only stamped at render time, so it
    // looked frozen (user-reported "session timer missing"); a 1s clock keeps
    // it ticking and accumulates visible-tab time into the daily goal.
    private sessionElapsedLabel(): string {
        return formatNewTabSessionElapsed(this.sessionProgress.snapshot([]).elapsedMs);
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
        this.sessionClockRoot = root;
        if (this.sessionClockTimer !== undefined || typeof window === 'undefined') return;
        this.sessionClockTimer = window.setInterval(() => this.tickSessionClock(), 1000);
    }

    private stopSessionClock(): void {
        if (this.sessionClockTimer === undefined) return;
        if (typeof window !== 'undefined') window.clearInterval(this.sessionClockTimer);
        this.sessionClockTimer = undefined;
        this.sessionClockRoot = null;
    }

    private tickSessionClock(): void {
        // Snow Leopard: no idle timers — the clock only runs while the Word
        // tab is actually studying (renderSessionProgress restarts it), and
        // goal time only accrues for visible word-study seconds.
        // The document guard stops the clock when the environment is being
        // torn down (jsdom test teardown) instead of throwing from the timer.
        if (typeof document === 'undefined' || this.state.mode !== 'word') {
            this.stopSessionClock();
            return;
        }
        if (document.hidden) return;
        addNewTabDailyStudyTimeMs(1000, newTabLocalDateKey());
        const root = this.sessionClockRoot;
        const card = this.visibleWords[this.index];
        if (!root?.isConnected || !card) {
            this.stopSessionClock();
            return;
        }
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

    private newTabStatusLabel(card: JPDBCard): string {
        return [this.newTabCountLabel(card), this.newTabStatusSourceLabel(card)].filter(Boolean).join(' · ');
    }

    private newTabStatusSourceLabel(card: JPDBCard): string {
        if (this.shouldShowJitenOnlyApiFallbackSource(card)) return 'Jiten';
        const labels = this.reviewTargetSourceLabels(card);
        return labels.length
            ? labels.join(' + ')
            : newTabCardSourceLabel(card, this.language());
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
        if (summary.hasAnki) add(summary.hasJpdb || summary.hasJiten ? 'Anki' : this.ankiReviewSourceLabel(card));
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
        const label = this.newTabStatusLabel(card);
        const toggleTarget = this.sourceToggleTarget(card);
        replaceChildrenWith(statusSlot, ...[
            ...this.renderNewTabStatusLights(card),
            document.createTextNode(toggleTarget ? `${label} ⇄` : label),
        ].filter((node): node is HTMLElement | Text => Boolean(node)));
        if (toggleTarget) {
            statusSlot.dataset.newtabAction = 'source-toggle';
            statusSlot.dataset.sourceToggleTarget = toggleTarget;
            statusSlot.title = `${this.text('switchReviewSource')}: ${this.sourceToggleLabel(toggleTarget)}`;
            statusSlot.setAttribute('aria-label', statusSlot.title);
            if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = false;
            return;
        }
        delete statusSlot.dataset.newtabAction;
        delete statusSlot.dataset.sourceToggleTarget;
        statusSlot.removeAttribute('title');
        statusSlot.removeAttribute('aria-label');
        if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = true;
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

    private statusLightSourceForCard(card: JPDBCard): 'jpdb' | 'jiten' | 'anki' | null {
        if ((this.cardReviewSource(card) === 'dictionary' && this.sourceLabel.startsWith('Jiten') && !this.sourceLabel.includes(' + '))
            || this.shouldShowJitenOnlyApiFallbackSource(card)
            || isJitenSrsCard(card)) {
            return 'jiten';
        }
        const source = this.cardReviewSource(card);
        return source === 'jpdb' || source === 'anki' ? source : null;
    }

    private reviewTargetSources(card: JPDBCard): Array<'jpdb' | 'jiten' | 'anki'> {
        const summary = this.reviewSourceSummary(card);
        const sources: Array<'jpdb' | 'jiten' | 'anki'> = [];
        const add = (source: 'jpdb' | 'jiten' | 'anki'): void => {
            if (!sources.includes(source)) sources.push(source);
        };
        if (summary.hasJiten) add('jiten');
        if (summary.hasJpdb) add('jpdb');
        if (summary.hasAnki) add('anki');
        return sources;
    }

    private renderPlainStatus(statusSlot: HTMLElement | null, message: string): void {
        if (!statusSlot) return;
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
        const source = this.state.source === 'jpdb' || this.state.source === 'anki' ? this.state.source : null;
        if (!source) {
            this.renderPlainStatus(statusSlot, '');
            return;
        }
        const target = this.emptySourceToggleTarget(source);
        const lightSource = source === 'jpdb' && this.sourceLabel.startsWith('Jiten') && !this.sourceLabel.includes(' + ')
            ? 'jiten'
            : source;
        replaceChildrenWith(statusSlot, ...[
            el('span', {
                class: 'jpdb-reader-newtab-status-light',
                dataset: { source: lightSource },
                'aria-hidden': 'true',
            }),
            document.createTextNode(target ? `${this.sourceToggleLabel(source)} ⇄` : this.sourceToggleLabel(source)),
        ].filter((node): node is HTMLElement | Text => Boolean(node)));
        if (target) {
            statusSlot.dataset.newtabAction = 'source-toggle';
            statusSlot.dataset.sourceToggleTarget = target;
            statusSlot.title = `${this.text('switchReviewSource')}: ${this.sourceToggleLabel(target)}`;
            statusSlot.setAttribute('aria-label', statusSlot.title);
            if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = false;
            return;
        }
        delete statusSlot.dataset.newtabAction;
        delete statusSlot.dataset.sourceToggleTarget;
        statusSlot.removeAttribute('title');
        statusSlot.removeAttribute('aria-label');
        if (statusSlot instanceof HTMLButtonElement) statusSlot.disabled = true;
    }

    private emptySourceToggleTarget(source: 'jpdb' | 'anki'): ConcreteNewTabWordSource | null {
        if (source === 'jpdb') return this.canOfferAnkiSource() ? 'anki' : null;
        return this.canUseJpdbSource() ? 'jpdb' : null;
    }

    private sourceToggleTarget(card: JPDBCard): ConcreteNewTabWordSource | null {
        const sources = this.sourceToggleSources(card);
        if (sources.length < 2) return null;
        const current = this.sourceToggleCurrentSource(card, sources);
        const currentIndex = sources.indexOf(current);
        return sources[(currentIndex + 1) % sources.length] ?? sources[0] ?? null;
    }

    private sourceToggleClickTarget(target: HTMLElement): ConcreteNewTabWordSource | null {
        const renderedTarget = target.closest<HTMLElement>('[data-source-toggle-target]')?.dataset.sourceToggleTarget;
        if (renderedTarget === 'jpdb' || renderedTarget === 'anki' || renderedTarget === 'dictionary') return renderedTarget;
        const card = this.visibleWords[this.index];
        return card ? this.sourceToggleTarget(card) : null;
    }

    private sourceToggleSources(card: JPDBCard): ConcreteNewTabWordSource[] {
        const context = this.sourceToggleContext(card);
        const sources = uniqueConcreteSources([
            this.jpdbToggleSource(context),
            this.shouldSuppressJitenOnlyJpdbCardToggle(card) ? null : this.ankiToggleSource(context),
        ]);
        if (this.shouldIncludeDictionaryToggleSource(context, sources)) sources.push('dictionary');
        return sources;
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
            hasAnki: summary.hasAnki,
            canUseJpdb: this.canUseJpdbSource(),
            canUseAnki: this.canUseAnkiSource(),
            canOfferAnki: this.canOfferAnkiSource(),
            ankiUnavailable: this.cachedSourceUnavailable('anki'),
        };
    }

    private jpdbToggleSource(context: SourceToggleContext): ConcreteNewTabWordSource | null {
        return this.shouldIncludeJpdbToggleSource(context) ? 'jpdb' : null;
    }

    private shouldIncludeJpdbToggleSource(context: SourceToggleContext): boolean {
        return context.hasJpdb || context.hasJiten || context.canUseJpdb || context.current === 'jpdb' || context.selected === 'jpdb';
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

    private shouldIncludeDictionaryToggleSource(context: SourceToggleContext, sources: ConcreteNewTabWordSource[]): boolean {
        if (this.isJitenOnlySourceLabel() && this.hasJitenOnlyApiCredentials()) return false;
        return context.current === 'dictionary'
            && sources.length === 1;
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

    private cardReviewSource(card: JPDBCard): 'jpdb' | 'anki' | 'dictionary' {
        if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
        if (card.source === 'jiten' || card.reviewSource === 'jiten-api') return 'jpdb';
        if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live') return 'jpdb';
        return 'dictionary';
    }

    private sourceToggleLabel(source: ConcreteNewTabWordSource): string {
        if (source === 'jpdb') return this.jpdbSourceToggleLabel();
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
        if (this.reviewCountMode || this.state.mode !== 'word') return;
        const settings = this.dependencies.getSettings();
        if (hasJpdbApiCredential(settings) || hasJitenApiCredential(settings) || settings.ankiEnabled || settings.newTabAnkiEnabled) return;
        countSlot.append(el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-connect-cta',
            dataset: { newtabAction: 'settings' },
        }, this.text('connectSrsCta')));
    }

    private syncSessionProgressDataset(countSlot: HTMLElement, progress: NewTabSessionProgressSnapshot | null): void {
        clearSessionProgressDataset(countSlot.dataset);
        if (!progress) return;
        countSlot.dataset.sessionCompletedReviews = String(progress.completedReviews);
        countSlot.dataset.sessionElapsed = progress.elapsedLabel;
        countSlot.dataset.sessionElapsedMs = String(progress.elapsedMs);
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
            progress: null,
            timer: null,
            prompt: root.querySelector<HTMLElement>('[data-newtab-prompt]'),
            answer: root.querySelector<HTMLElement>('[data-newtab-reading]'),
            meaning: root.querySelector<HTMLElement>('[data-newtab-meaning]'),
            count: root.querySelector<HTMLElement>('[data-newtab-count]'),
            status: root.querySelector<HTMLElement>('[data-newtab-status]'),
            reveal: root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]'),
            controls: root.querySelector<HTMLElement>('[data-newtab-controls]'),
        };
    }

    private renderKanjiPrompt(slots: NewTabStudySlots, card: JPDBCard): void {
        const kanji = kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '字';
        const keywords = this.kanjiPromptKeywords(card, kanji);
        this.renderKanjiPromptQuestion(slots.prompt, kanji, keywords);
        this.renderKanjiPromptAnswer(slots, card, kanji);
        if (slots.meaning && !this.state.revealAnswer) slots.meaning.replaceChildren();
        void this.enrichKanjiCard(slots, card, kanji);
    }

    private renderKanjiPromptQuestion(prompt: HTMLElement | null, kanji: string, keywords: KanjiPromptKeyword[]): void {
        if (!prompt) return;
        prompt.lang = this.state.revealAnswer ? 'ja' : 'en';
        prompt.dataset.newtabExpression = 'true';
        prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.remove('jpdb-reader-newtab-study-anki-card');
        prompt.classList.remove('jpdb-reader-newtab-prompt-anki-card');
        if (this.state.revealAnswer) replaceChildrenWith(prompt, this.kanjiPopoverButton(kanji));
        else replaceChildrenWith(prompt, this.renderKanjiPromptKeywords(keywords));
    }

    private kanjiPopoverButton(kanji: string): HTMLElement {
        return el('button', {
            class: 'jpdb-reader-newtab-kanji-popover-word',
            type: 'button',
            dataset: { action: 'kanji', kanji },
            title: `${this.text('showKanji')}: ${kanji}`,
        }, kanji);
    }

    private renderKanjiPromptKeywords(keywords: KanjiPromptKeyword[], emptyText = this.text('loadingKanjiDetails')): HTMLElement | string {
        if (!keywords.length) return emptyText;
        return el('div', { class: 'jpdb-reader-newtab-kanji-front-keywords' },
            keywords.map(keyword => el('div', { class: 'jpdb-reader-newtab-kanji-front-keyword' },
                el('small', {}, keyword.source),
                el('span', {}, keyword.text),
            )),
        );
    }

    private renderKanjiPromptAnswer(slots: NewTabStudySlots, card: JPDBCard, kanji: string): void {
        if (!slots.answer) return;
        if (this.state.revealAnswer) {
            replaceChildrenWith(slots.answer, this.revealedKanjiAnswer(card, kanji));
            return;
        }
        replaceChildrenWith(slots.answer, this.kanjiDoodleFront(kanji));
        this.installNewTabKanjiDoodle(slots, card, kanji);
    }

    private revealedKanjiAnswer(card: JPDBCard, kanji: string): HTMLElement {
        const preview = this.doodlePreviewCache.get(cardKey(card));
        return el('div', { class: 'jpdb-reader-newtab-kanji-answer' },
            el('div', { class: 'jpdb-reader-newtab-kanji-svg', dataset: { newtabKanjiSvg: kanji } }, kanji),
            el('div', { class: 'jpdb-reader-newtab-doodle-preview' },
                preview ? el('img', { src: preview, alt: `${this.text('yourDrawing')}: ${kanji}` }) : null,
            ),
        );
    }

    private kanjiDoodleFront(kanji: string): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-kanji-front' },
            el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle trace-hidden', dataset: { kanji } },
                el('div', { class: 'jpdb-reader-doodle-ghost', dataset: { newtabDoodleGhost: true }, hidden: true }),
                el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': `${this.text('drawKanji')}: ${kanji}` }),
            ),
            el('div', { class: 'jpdb-reader-doodle-tools jpdb-reader-newtab-doodle-actions' },
                el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleTrace: true } }, this.text('showTrace')),
                el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleClear: true } }, this.text('clear')),
            ),
            el('div', { class: 'jpdb-reader-newtab-doodle-result', dataset: { newtabDoodleResult: true } }),
        );
    }

    private installNewTabKanjiDoodle(slots: NewTabStudySlots, card: JPDBCard, kanji: string): void {
        if (!slots.answer) return;
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
            void this.enrichWordPitch(slots.prompt, card);
            void this.enrichWordPromptSentence(slots.prompt, card, state, sentence);
        }
        this.renderWordAnswer(slots.answer, card);
        this.renderWordMeaning(slots.meaning, card);
        void this.renderImmersionExample(slots, card);
    }

    private renderWordAnswer(answer: HTMLElement | null, card: JPDBCard): void {
        const reading = newTabCardOptionalReading(card);
        if (answer) answer.textContent = this.state.revealAnswer ? reading : '';
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
        void this.renderWordStudyDetails(meaning, card);
    }

    private providerDeckMembershipLine(card: JPDBCard): string {
        const deck = card.sourceDeckName || (card.ankiDeckNames ?? []).join(', ');
        return deck ? this.formatNewTabText('partOfDeck', { deck }) : '';
    }

    // SH-4 fidelity: jpdb.io's review back lists the word's component kanji
    // with their keywords ("Composed of"). Chips reuse the existing kanji
    // popover action for drilldown; keywords hydrate from RTK/JPDB lazily.
    private async composedOfKeywordLookup(client: { lookup?: (kanji: string) => Promise<{ keyword?: string } | null> } | undefined, character: string): Promise<string> {
        if (typeof client?.lookup !== 'function') return '';
        const result = await client.lookup(character).catch(() => null);
        return result?.keyword ?? '';
    }

    private appendComposedOfLine(meaning: HTMLElement, card: JPDBCard): void {
        const kanjiCharacters = [...new Set(Array.from(card.spelling).filter(isKanjiCharacter))];
        if (kanjiCharacters.length === 0) return;
        const row = el('div', { class: 'jpdb-reader-newtab-composed-of', dataset: { newtabComposedOf: true } },
            el('span', { class: 'jpdb-reader-newtab-composed-of-label' }, this.text('composedOf')),
            ...kanjiCharacters.map(character => el('button', {
                type: 'button',
                class: 'jpdb-reader-newtab-composed-of-kanji',
                dataset: { action: 'kanji', kanji: character },
                title: `${this.text('showKanji')}: ${character}`,
            },
            el('span', { lang: 'ja' }, character),
            el('small', {}, this.keywordCache.get(character) ?? ''))),
        );
        meaning.append(row);
        void this.hydrateComposedOfKeywords(row, kanjiCharacters);
    }

    private async hydrateComposedOfKeywords(row: HTMLElement, kanjiCharacters: string[]): Promise<void> {
        await Promise.all(kanjiCharacters.map(async character => {
            if (this.keywordCache.has(character)) return;
            const keyword = (await this.composedOfKeywordLookup(this.dependencies.rtk, character))
                || (await this.composedOfKeywordLookup(this.dependencies.jpdbKanji, character));
            if (keyword) this.keywordCache.set(character, keyword);
        }));
        if (!row.isConnected) return;
        row.querySelectorAll<HTMLElement>('[data-kanji]').forEach(chip => {
            const small = chip.querySelector('small');
            const keyword = this.keywordCache.get(chip.dataset.kanji ?? '');
            if (small && keyword) small.textContent = keyword;
        });
    }

    private async renderWordStudyDetails(meaning: HTMLElement, card: JPDBCard): Promise<void> {
        const loadDetails = this.dependencies.loadCardRenderData;
        if (!loadDetails || !this.dependencies.renderStudyDefinitionSources) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        meaning.dataset.newtabStudyDetailsRequest = requestId;
        const data = await loadDetails(card).catch(() => null);
        if (!data || !this.canApplyWordStudyDetails(meaning, key, requestId)) return;
        const html = this.renderWordStudyDetailsHtml(card, data);
        if (!html.trim()) return;
        const details = htmlToFirstElement(`<div class="jpdb-reader-newtab-study-details" data-newtab-study-details>${html}</div>`);
        if (!details || !this.canApplyWordStudyDetails(meaning, key, requestId)) return;
        meaning.querySelectorAll(':scope > [data-newtab-study-details]').forEach(element => element.remove());
        meaning.append(details);
        this.dependencies.installDictionarySourceTracking?.(details);
        void this.dependencies.parseContent?.(details, newTabShortParseOptions())?.catch(() => undefined);
    }

    private renderWordStudyDetailsHtml(card: JPDBCard, data: CardRenderData): string {
        const sentence = sentenceForCard(card);
        return [
            this.dependencies.renderStudyDefinitionSources?.(card, data, sentence) ?? '',
            this.renderWordStudyMiningPanel(card, data),
        ].filter(Boolean).join('');
    }

    private renderWordStudyMiningPanel(card: JPDBCard, data: CardRenderData): string {
        const settings = this.dependencies.getSettings();
        const provider = apiSrsProviderViewForCard(card, settings, value => this.dependencies.parser.isJpdbBackedCard(value));
        return renderApiMiningPanel(settings, normalizeCardStates(card.cardState), { ...data, loading: false }, provider);
    }

    private canApplyWordStudyDetails(meaning: HTMLElement, key: string, requestId: string): boolean {
        return meaning.isConnected
            && meaning.dataset.newtabStudyDetailsRequest === requestId
            && this.state.mode === 'word'
            && this.state.revealAnswer
            && cardKey(this.visibleWords[this.index]) === key;
    }

    private renderAnkiRenderedWordPrompt(slots: NewTabStudySlots, card: JPDBCard): boolean {
        if (card.source !== 'anki' && card.reviewSource !== 'anki') return false;
        const renderedCard = this.ankiRenderedStudyCard(card);
        if (!renderedCard || !slots.prompt) return false;
        const html = renderAnkiRenderedCardStudyBody(renderedCard, this.state.revealAnswer, this.language(), card.ankiAudioFilenames ?? []);
        if (!html) return false;
        slots.prompt.lang = '';
        slots.prompt.classList.remove('jpdb-reader-newtab-prompt-has-sentence');
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
        prompt.lang = 'ja';
        prompt.dataset.newtabExpression = 'true';
        prompt.classList.remove('jpdb-reader-newtab-prompt-anki-card');
        prompt.closest<HTMLElement>('.jpdb-reader-newtab-study')?.classList.remove('jpdb-reader-newtab-study-anki-card');
        prompt.classList.toggle('jpdb-reader-newtab-prompt-has-sentence', Boolean(sentence));
        delete prompt.dataset.newtabSentenceRequest;
        delete prompt.dataset.newtabPromptParseRequest;
        replaceChildrenWith(prompt, this.renderSentencePrompt(card, state, sentence));
        void this.parseNewTabPromptSentence(prompt, card);
    }

    private renderSentencePrompt(card: JPDBCard, state: ReturnType<typeof primaryCardState>, sentence = ''): HTMLElement {
        const wrap = el('span', { class: 'jpdb-reader-newtab-front' },
            el('span', { class: 'jpdb-reader-newtab-term' }, this.renderReaderWord(card, state, card.spelling, sentence || card.spelling)),
        );
        if (!sentence) return wrap;
        wrap.append(this.renderWordPromptSentenceNode(card, state, sentence));
        return wrap;
    }

    private renderWordPromptSentenceNode(card: JPDBCard, state: ReturnType<typeof primaryCardState>, sentence: string): HTMLElement {
        const sentenceWrap = el('span', { class: 'jpdb-reader-newtab-sentence' });
        if (this.shouldRenderPlainSentencePrompt(card, sentence)) {
            sentenceWrap.append(document.createTextNode(sentence));
            return sentenceWrap;
        }

        if (this.shouldParseSentencePrompt()) {
            return renderNewTabFrontSentence(card, sentence, this.dependencies.getSettings(), this.cachedParsedNewTabSentenceTokens(sentence));
        }

        const target = sentencePromptTarget(card, sentence);
        if (!target) {
            sentenceWrap.textContent = sentence;
            return sentenceWrap;
        }
        const start = sentence.indexOf(target);
        sentenceWrap.append(document.createTextNode(sentence.slice(0, start)));
        sentenceWrap.append(this.renderReaderWord(card, state, target, sentence));
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

    private async parseNewTabPromptSentence(prompt: HTMLElement, card: JPDBCard): Promise<void> {
        if (!this.shouldParseSentencePrompt()) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        prompt.dataset.newtabPromptParseRequest = requestId;
        const sentence = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
        const sentenceText = this.newTabSentenceText(sentence);
        if (sentence && await this.parseNewTabSentenceElement(sentence, sentenceText, card, () => this.canApplyNewTabPromptParse(prompt, key, requestId))) return;
        await this.dependencies.parseContent?.(prompt, newTabShortParseOptions())?.catch(() => undefined);
        if (!this.canApplyNewTabPromptParse(prompt, key, requestId)) return;
        this.highlightNewTabParsedTarget(prompt, '[data-newtab-sentence-render]', card);
    }

    private canApplyNewTabPromptParse(prompt: HTMLElement, key: string, requestId: string): boolean {
        return prompt.isConnected
            && prompt.dataset.newtabPromptParseRequest === requestId
            && cardKey(this.visibleWords[this.index]) === key
            && this.state.mode === 'word';
    }

    private async enrichWordPromptSentence(
        prompt: HTMLElement,
        card: JPDBCard,
        state: ReturnType<typeof primaryCardState>,
        currentSentence: string,
    ): Promise<void> {
        if (currentSentence || !this.shouldShowFrontSentence()) return;
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
        wrap.querySelectorAll<HTMLElement>(':scope > .jpdb-reader-newtab-term .jpdb-reader-word')
            .forEach(word => { word.dataset.sentence = sentence; });
    }

    private canApplyFrontSentence(prompt: HTMLElement, key: string, requestId: string): boolean {
        return prompt.isConnected
            && prompt.dataset.newtabSentenceRequest === requestId
            && cardKey(this.visibleWords[this.index]) === key
            && this.state.mode === 'word';
    }

    private shouldShowFrontSentence(): boolean {
        return this.dependencies.getSettings().newTabFrontSentenceEnabled;
    }

    private frontSentenceFromCard(card: JPDBCard): string {
        return this.shouldShowFrontSentence() ? normalizePromptContextSentence(card.sentence, card) : '';
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
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbDefinitionsEnabled || !hasJpdbApiCredential(settings) || !this.dependencies.jpdbVocabulary) return '';
        const info = await this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, newTabCardReading(card)).catch(() => null);
        return jpdbExampleSentenceForPrompt(info, card);
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
        meaning.append(immersion);
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
            && this.state.mode === 'word'
            && this.state.revealAnswer;
    }

    private renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement {
        const settings = this.dependencies.getSettings();
        const example = examples[index];
        const audioUrls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        const hasAudio = audioUrls.length > 0;
        const node = el('div', { class: 'jpdb-reader-newtab-immersion' },
            this.renderNewTabImmersionToolbar(example, index, examples.length, hasAudio),
            this.renderNewTabImmersionExampleBody(card, example, settings, index, examples.length, audioUrls),
        );
        this.highlightNewTabImmersionTarget(node, card);
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
            && this.state.mode === 'word'
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
        setInnerHtml(sentence, renderNewTabSentenceHtml(sentenceText, card, this.dependencies.getSettings(), tokens));
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
        const sourceClass = card.source === 'anki' || card.reviewSource === 'anki' ? 'anki' : 'jpdb';
        const pitchClass = newTabPitchClass(card);
        for (const cls of Array.from(word.classList)) {
            if (cls.startsWith('jpdb-pitch-')) {
                word.classList.remove(cls);
                continue;
            }
            if (NEW_TAB_WORD_STATE_CLASSES.some(candidate => cls === `jpdb-${candidate}` || cls === `anki-${candidate}`)) {
                word.classList.remove(cls);
            }
        }
        word.classList.add(`${sourceClass}-${state}`, `jpdb-pitch-${pitchClass}`);
        word.dataset.vid = String(card.vid);
        word.dataset.sid = String(card.sid);
        word.dataset.expression = card.spelling;
        word.dataset.reading = newTabCardReading(card);
        word.dataset.pitchClass = pitchClass;
        word.dataset.sentence ||= card.sentence || surface;
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
        const kanji = surface.dataset.newtabKanji;
        if (!kanji) return;
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
            await this.playNewTabImmersionAudioSource(source, isCurrent);
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
        if (!source || this.isCurrentImmersionAudioPlaying(source.key)) return;
        await this.playNewTabImmersionAudioSource(source, isCurrent);
    }

    private async playNewTabImmersionAudioSource(source: { urls: string[]; key: string }, isCurrent: () => boolean): Promise<void> {
        if (this.isCurrentImmersionAudioPlaying(source.key)) return;
        const requestId = this.beginNewTabImmersionAudio(source.key);
        if (await this.playNewTabImmersionAudioCandidates(source.urls, requestId, source.key, isCurrent)) return;
        const blobSrc = await this.fetchNewTabImmersionAudio(source.urls);
        if (blobSrc) await this.playNewTabImmersionAudioCandidates([blobSrc], requestId, source.key, isCurrent);
        if (this.isCurrentImmersionAudioRequest(requestId, source.key)) this.clearNewTabImmersionAudioRequest();
    }

    private async playNewTabImmersionAudioCandidates(
        urls: string[],
        requestId: number,
        key: string,
        isCurrent: () => boolean,
    ): Promise<boolean> {
        for (const src of uniqueNewTabImmersionAudioCandidates(urls)) {
            if (!this.isCurrentImmersionAudioRequest(requestId, key) || !isCurrent()) return false;
            const audio = this.attachNewTabImmersionAudio(src);
            const cleanup = () => this.clearNewTabImmersionAudio(audio);
            audio.addEventListener('ended', cleanup, { once: true });
            audio.addEventListener('error', cleanup, { once: true });
            try {
                await audio.play();
                return true;
            } catch {
                this.detachFailedNewTabImmersionAudio(audio);
            }
        }
        return false;
    }

    private isCurrentRevealedWordCard(key: string): boolean {
        return this.state.mode === 'word'
            && this.state.revealAnswer
            && cardKey(this.visibleWords[this.index]) === key;
    }

    private newTabImmersionAudioSource(example: ImmersionKitExample): { urls: string[]; key: string } | null {
        const urls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        return this.newTabImmersionAudioSourceFromUrls(urls);
    }

    private newTabImmersionAudioSourceFromUrls(urls: string[]): { urls: string[]; key: string } | null {
        const candidates = uniqueNewTabImmersionAudioCandidates(urls);
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

    private isCurrentImmersionAudioPlaying(key: string): boolean {
        return Boolean(this.immersionAudioKey === key && this.immersionAudio && !this.immersionAudio.ended);
    }

    private beginNewTabImmersionAudio(key: string): number {
        const requestId = ++this.immersionAudioRequestId;
        this.immersionAudio?.pause();
        this.immersionAudio = undefined;
        this.immersionAudioKey = key;
        return requestId;
    }

    private fetchNewTabImmersionAudio(urls: string[]): Promise<string> {
        const settings = this.dependencies.getSettings();
        return this.dependencies.immersionKit
            .fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage)
            .catch(() => '');
    }

    private isCurrentImmersionAudioRequest(requestId: number, key: string): boolean {
        return requestId === this.immersionAudioRequestId && this.immersionAudioKey === key;
    }

    private attachNewTabImmersionAudio(src: string): HTMLAudioElement {
        const audio = new Audio(src);
        audio.playbackRate = this.dependencies.getSettings().immersionKitPlaybackRate;
        this.immersionAudio = audio;
        return audio;
    }

    private clearNewTabImmersionAudio(audio: HTMLAudioElement): void {
        if (this.immersionAudio !== audio) return;
        this.clearNewTabImmersionAudioRequest();
    }

    private detachFailedNewTabImmersionAudio(audio: HTMLAudioElement): void {
        if (this.immersionAudio === audio) this.immersionAudio = undefined;
    }

    private clearNewTabImmersionAudioRequest(): void {
        this.immersionAudio = undefined;
        this.immersionAudioKey = '';
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
            requestLimit: Math.max(NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT, resultLimit),
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
        return this.state.mode === 'word'
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
            && this.state.mode === 'word';
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
        const settings = this.dependencies.getSettings();
        const jpdbInfo = settings.jpdbDefinitionsEnabled && hasJpdbApiCredential(settings) && this.dependencies.jpdbVocabulary
            ? await this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, newTabCardReading(card)).catch(() => null)
            : null;
        this.addNewTabImmersionFallbackQueries(
            candidates,
            (jpdbInfo?.compounds ?? []).flatMap(compound => [compound.term, compound.reading]),
            exactQuery,
        );
    }

    private async addNewTabParsedImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        if (typeof this.dependencies.parser.canParse !== 'function' || !this.dependencies.parser.canParse()) return;
        const [tokens] = await this.dependencies.parser.parse([card.spelling], { jpdbTimeoutMs: NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS, allowJpdbTimeoutFallback: true }).catch(() => [[]]);
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
            source: settings.immersionKitExampleSource,
            nadeshikoKey: Boolean(settings.nadeshikoApiKey.trim()),
            requestLimit: Math.max(NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT, this.newTabImmersionResultLimit(settings)),
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
        uchisenData: UchisenData | null = null,
    ): KanjiPromptKeyword[] {
        return this.dedupeKanjiPromptKeywords([
            { source: 'Jiten', text: details.jiten?.meanings[0] ?? '' },
            { source: 'JPDB', text: details.jpdb?.keyword ?? '' },
            { source: 'RTK', text: details.rtk?.keyword ?? '' },
            { source: 'Uchisen', text: uchisenData?.kanjiKeyword?.keyword ?? '' },
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
        const details = await this.loadKanjiDetails(kanji);
        if (!this.canApplyKanjiEnrichment(slots, card)) return;

        this.applyEnrichedKanjiKeyword(slots, card, kanji, details);
        this.applyEnrichedKanjiSvg(slots.answer, details.vg?.svg);
        this.applyEnrichedKanjiMeaning(slots, card, kanji, details);
        void this.applyEnrichedUchisenKeyword(slots, card, kanji, details);
    }

    private canApplyKanjiEnrichment(slots: NewTabStudySlots, card: JPDBCard): boolean {
        const current = this.visibleWords[this.index];
        if (!current || cardKey(current) !== cardKey(card)) return false;
        if (!this.shouldRenderCardAsKanji(current)) return false;
        const study = slots.prompt?.closest<HTMLElement>('[data-newtab-study]')
            ?? slots.answer?.closest<HTMLElement>('[data-newtab-study]');
        if (!study) return true;
        const renderedKey = study.dataset.newtabCard;
        return renderedKey === cardKey(card) || renderedKey === this.cardSelectionKey(card);
    }

    private applyEnrichedKanjiKeyword(slots: NewTabStudySlots, card: JPDBCard, kanji: string, details: KanjiDetailBundle): void {
        const keyword = this.keywordFromDetails(card, details.jpdb, details.jiten, details.rtk);
        if (keyword) this.keywordCache.set(kanji, keyword);
        if (slots.prompt && !this.state.revealAnswer) {
            replaceChildrenWith(slots.prompt, this.renderKanjiPromptKeywords(
                this.kanjiPromptKeywordsFromDetails(card, details),
                this.kanjiKeywordEmptyText(details),
            ));
        }
    }

    private kanjiKeywordEmptyText(details: KanjiDetailBundle): string {
        return this.kanjiSourcesUnavailable(details) ? this.text('kanjiSourcesUnavailable') : this.text('noKanjiKeyword');
    }

    private kanjiSourcesUnavailable(details: KanjiDetailBundle): boolean {
        const states = Object.values(details.sourceStates);
        return states.some(state => state === 'unavailable')
            && states.every(state => state === 'disabled' || state === 'unavailable');
    }

    private async applyEnrichedUchisenKeyword(
        slots: NewTabStudySlots,
        card: JPDBCard,
        kanji: string,
        details: KanjiDetailBundle,
    ): Promise<void> {
        if (!slots.prompt || this.state.revealAnswer) return;
        const uchisenData = await this.loadUchisenDetails(kanji);
        if (!uchisenData?.kanjiKeyword?.keyword) return;
        if (!this.canApplyKanjiEnrichment(slots, card)) return;
        if (!slots.prompt || this.state.revealAnswer) return;
        replaceChildrenWith(slots.prompt, this.renderKanjiPromptKeywords(this.kanjiPromptKeywordsFromDetails(card, details, uchisenData)));
    }

    private applyEnrichedKanjiSvg(answer: HTMLElement | null, svgMarkup: string | undefined): void {
        if (!answer || !svgMarkup) return;
        const mounts = this.enrichedKanjiSvgMounts(answer);
        this.applyRevealedKanjiSvg(mounts.svg, svgMarkup);
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
        replaceChildrenWith(slots.meaning, this.renderKanjiDetails(card, kanji, details.jpdb, details.jiten, details.rtk, details.vg, details.local));
        this.renderNewTabUchisen(slots.meaning, kanji);
        this.renderNewTabKanjiImmersion(slots.meaning, kanji);
        void this.dependencies.parseContent?.(slots.meaning);
    }

    private renderNewTabUchisen(root: HTMLElement, kanji: string): void {
        const settings = this.dependencies.getSettings();
        const mount = root.querySelector<HTMLElement>('[data-newtab-uchisen-mount]');
        if (!mount || !settings.uchisenEnabled) return;
        const sourceAttributes = this.sourceAttributes(kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID));
        void this.loadUchisenDetails(kanji).then(data => {
            if (!mount.isConnected) return;
            if (!data || (!data.images.length && !data.canGenerateImages)) {
                mount.remove();
                return;
            }
            void installUchisenCarousel(mount, kanji, data.images, {
                sourceAttributes,
                detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
                summaryClass: 'jpdb-reader-local-title',
                bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
                proxyUrl: settings.corsProxyUrl,
                componentGroups: data.componentGroups,
                kanjiKeyword: data.kanjiKeyword,
                kanjiId: data.kanjiId,
                canGenerateImages: data.canGenerateImages,
                refreshData: () => {
                    this.uchisenDataCache.delete(kanji);
                    return loadUchisenData(kanji, this.dependencies.getSettings().corsProxyUrl);
                },
                interfaceLanguage: settings.interfaceLanguage,
            });
        }).catch(() => {
            if (mount.isConnected) mount.remove();
        });
    }

    private renderNewTabKanjiImmersionPlaceholder(settings: ReaderSettings): HTMLElement | null {
        if (!settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return null;
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
        const settings = this.dependencies.getSettings();
        const mount = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-mount]');
        const details = mount?.querySelector<HTMLDetailsElement>('[data-newtab-kanji-immersion-details]');
        const body = mount?.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
        if (!mount || !details || !body || !settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return;

        const card = this.newTabKanjiImmersionCard(kanji);
        const key = this.newTabKanjiImmersionKey(kanji);
        let started = false;
        const load = () => {
            if (!details.open || started || !mount.isConnected || !body.isConnected) return;
            started = true;
            void this.loadImmersionExamples(card).then(async examples => {
                if (!mount.isConnected || !body.isConnected) return;
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
                if (body.isConnected) replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'noImmersionExamplesCompact')));
            });
        };
        details.addEventListener('toggle', load);
        load();
    }

    private newTabKanjiImmersionCard(kanji: string): JPDBCard {
        return this.dependencies.parser.fallbackCardFromText?.(kanji) ?? fallbackSearchKanjiCard(kanji);
    }

    private newTabKanjiImmersionKey(kanji: string): string {
        return `kanji:${kanji}`;
    }

    private isCurrentRevealedKanji(kanji: string): boolean {
        const current = this.visibleWords[this.index];
        if (!current) return false;
        const currentKanji = kanjiCharacters(current.spelling)[0] ?? current.spelling[0] ?? '';
        return this.state.mode === 'kanji'
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
        const settings = this.dependencies.getSettings();
        const audioUrls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        return el('div', {
            class: 'jpdb-reader-newtab-immersion jpdb-reader-newtab-kanji-immersion',
            dataset: { newtabKanjiImmersion: true, newtabKanji: card.spelling },
        },
            this.renderNewTabImmersionToolbar(example, index, total, audioUrls.length > 0, { showSource: true }),
            this.renderNewTabImmersionExampleBody(card, example, settings, index, total, audioUrls),
        );
    }

    private loadUchisenDetails(kanji: string): Promise<UchisenData | null> {
        const settings = this.dependencies.getSettings();
        if (!settings.uchisenEnabled) return Promise.resolve(null);
        const existing = this.uchisenDataCache.get(kanji);
        if (existing) return existing;
        const promise = loadUchisenData(kanji, settings.corsProxyUrl).catch(() => {
            this.uchisenDataCache.delete(kanji);
            return null;
        });
        this.uchisenDataCache.set(kanji, promise);
        return promise;
    }

    private renderKanjiDetails(
        card: JPDBCard,
        kanji: string,
        info: JpdbKanjiInfo | null,
        jitenInfo: JitenKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
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
            const keywordLine = jitenInfo
                ? this.suppressDuplicateKanjiKeywordLine(
                    renderJitenKanjiKeywordLine(jitenInfo, rtk, localEntries, settings.interfaceLanguage),
                    jitenInfo.meanings[0] ?? '',
                )
                : this.renderNewTabKanjiKeywordLine(fullInfo, rtk, localEntries, facts, settings.interfaceLanguage);
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
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return this.renderNewTabKanjiOriginGraph(context.kanji, context.fullInfo, context.rtk, context.vg, context.localEntries, context.settings, context.excludeFactLabels);
        return undefined;
    }

    private renderSupplementalNewTabKanjiSourceSection(
        sourceId: string,
        context: NewTabKanjiSourceRenderContext,
    ): HTMLElement | null | undefined {
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return this.renderNewTabUchisenPlaceholder(context.settings);
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

    private renderNewTabUchisenPlaceholder(settings: ReaderSettings): HTMLElement | null {
        if (!settings.uchisenEnabled) return null;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const isOpen = this.isSourceOpen(sourceStateKey);
        return el('div', { dataset: { newtabUchisenMount: true } },
            el('details', {
                class: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
                open: isOpen,
                dataset: {
                    sourceStateKey,
                    sourceInitialOpen: String(isOpen),
                },
            },
            el('summary', { class: 'jpdb-reader-local-title' }, 'Uchisen'),
            el('div', { class: 'jpdb-reader-local-entry' }, el('div', { class: 'jpdb-reader-help' }, uiText(settings.interfaceLanguage, 'loadingMnemonicImages')))),
        );
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
        settings: ReaderSettings,
        excludeFactLabels: Set<string> = new Set(),
    ): HTMLElement | null {
        if (!settings.kanjiOriginsEnabled || !settings.kanjiOriginGraphEnabled) return null;
        const factsForOrigins = buildKanjiFacts(kanji, fullInfo, rtk, settings.kanjivgEnabled ? vg : null, localEntries);
        const graph = buildKanjiOriginGraph(kanji, fullInfo, rtk, localEntries, null, vg);
        if (!graph) return null;
        const section = htmlToFirstElement(renderKanjiOrigins(
            factsForOrigins,
            graph,
            null,
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
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        localEntries: YomitanKanjiEntry[],
        facts: [string, string][],
        language: ReaderSettings['interfaceLanguage'],
    ): string {
        const line = renderKanjiKeywordLine(fullInfo, rtk, localEntries, language);
        const displayedKeyword = this.newTabKanjiDisplayedKeyword(facts, language);
        return this.suppressDuplicateKanjiKeywordLine(line, displayedKeyword);
    }

    private suppressDuplicateKanjiKeywordLine(line: string, displayedKeyword: string): string {
        if (!displayedKeyword) return line;
        const root = htmlToFirstElement(line);
        if (!root || root.classList.contains('jpdb-reader-help')) return line;
        const duplicateKey = normalizedKeywordText(displayedKeyword);
        root.querySelectorAll<HTMLElement>('.jpdb-reader-kanji-keyword').forEach(chip => {
            const text = Array.from(chip.children)
                .find(child => child.tagName.toLowerCase() === 'span')
                ?.textContent ?? '';
            if (normalizedKeywordText(text) === duplicateKey) chip.remove();
        });
        return root.querySelector('.jpdb-reader-kanji-keyword') ? root.outerHTML : '';
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
        return kanjiFactProviderTitle(source);
    }

    private renderKanjiMiningControls(info: JpdbKanjiInfo | null): HTMLElement | null {
        const actions = visibleJpdbKanjiActions(info);
        if (!actions.length) return null;
        return el('div', { class: 'jpdb-reader-newtab-kanji-mining', role: 'group', 'aria-label': this.text('miningActions') },
            actions.map(action => el('button', {
                type: 'button',
                class: `jpdb-reader-newtab-mini-action ${jpdbKanjiActionClass(action)}`,
                dataset: { newtabAction: 'jpdb-kanji-action', kanjiActionId: action.id },
                title: action.label,
            }, action.label)),
        );
    }

    private loadKanjiDetails(kanji: string): Promise<KanjiDetailBundle> {
        const settings = this.dependencies.getSettings();
        const cache = this.kanjiDetailCacheEntry(kanji);
        const signature = this.kanjiDetailSettingsSignature(settings);
        if (cache.details && cache.detailsSignature === signature) return cache.details;

        this.primeKanjiDetailSources(cache, kanji, settings);
        cache.details = this.resolveKanjiDetailBundle(cache, settings);
        cache.detailsSignature = signature;
        return cache.details;
    }

    private primeKanjiDetailSources(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        this.primeJpdbKanjiDetail(cache, kanji, settings);
        this.primeJitenKanjiDetail(cache, kanji, settings);
        this.primeRtkKanjiDetail(cache, kanji, settings);
        this.primeKanjiVGDetail(cache, kanji, settings);
        this.primeLocalKanjiDetail(cache, kanji, settings);
    }

    private primeJpdbKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupJpdbKanji = this.dependencies.jpdbKanji.lookup;
        if (!settings.jpdbKanjiEnabled || typeof lookupJpdbKanji !== 'function' || cache.jpdb) return;
        cache.jpdb = this.remoteKanjiSourceResult(
            promiseWithTimeout(lookupJpdbKanji.call(this.dependencies.jpdbKanji, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'JPDB kanji lookup timed out.'),
            null,
        );
    }

    private primeJitenKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupJitenKanji = this.dependencies.jiten?.lookupKanji;
        if (!settings.jpdbKanjiEnabled || !this.isJitenApiActive(settings) || typeof lookupJitenKanji !== 'function' || cache.jiten) return;
        cache.jiten = this.remoteKanjiSourceResult(
            promiseWithTimeout(lookupJitenKanji.call(this.dependencies.jiten, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'Jiten kanji lookup timed out.'),
            null,
        );
    }

    private primeRtkKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupRtk = this.dependencies.rtk.lookup;
        if (!settings.rtkEnabled || typeof lookupRtk !== 'function' || cache.rtk) return;
        cache.rtk = this.remoteKanjiSourceResult(
            promiseWithTimeout(lookupRtk.call(this.dependencies.rtk, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'RTK lookup timed out.'),
            null,
        );
    }

    private primeKanjiVGDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupKanjiVG = this.dependencies.kanjiVG.lookup;
        if (!this.shouldLoadKanjiVG(settings) || typeof lookupKanjiVG !== 'function' || cache.vg) return;
        cache.vg = this.remoteKanjiSourceResult(
            promiseWithTimeout(lookupKanjiVG.call(this.dependencies.kanjiVG, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'KanjiVG lookup timed out.'),
            null,
        );
    }

    private primeLocalKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        if (!this.shouldLoadLocalKanjiDetails(settings) || cache.local) return;
        cache.local = this.localKanjiSourceResult(this.localSearchWithTimeout(
            this.dependencies.dictionaries.lookupKanji?.(kanji, 6, settings.dictionaryPreferences) ?? Promise.resolve([]),
            [] as YomitanKanjiEntry[],
        ));
    }

    private resolveKanjiDetailBundle(cache: KanjiDetailCacheEntry, settings: ReaderSettings): Promise<KanjiDetailBundle> {
        return Promise.all([
            settings.jpdbKanjiEnabled ? cache.jpdb ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            settings.jpdbKanjiEnabled && this.isJitenApiActive(settings) ? cache.jiten ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            settings.rtkEnabled ? cache.rtk ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            this.shouldLoadKanjiVG(settings) ? cache.vg ?? Promise.resolve(sourceResult(null, 'unavailable')) : Promise.resolve(sourceResult(null, 'disabled')),
            this.shouldLoadLocalKanjiDetails(settings) ? cache.local ?? Promise.resolve(sourceResult([] as YomitanKanjiEntry[], 'unavailable')) : Promise.resolve(sourceResult([] as YomitanKanjiEntry[], 'disabled')),
        ]).then(([jpdb, jiten, rtk, vg, local]) => ({
            jpdb: jpdb.value,
            jiten: jiten.value,
            rtk: rtk.value,
            vg: vg.value,
            local: local.value,
            sourceStates: {
                jpdb: jpdb.state,
                jiten: jiten.state,
                rtk: rtk.state,
                vg: vg.state,
                local: local.state,
            },
        }));
    }

    private async remoteKanjiSourceResult<T>(promise: Promise<T | null>, emptyValue: T | null): Promise<KanjiDetailSourceResult<T | null>> {
        try {
            const value = await promise;
            return sourceResult(value, value ? 'ok' : 'not-found');
        } catch {
            return sourceResult(emptyValue, 'unavailable');
        }
    }

    private async localKanjiSourceResult(promise: Promise<YomitanKanjiEntry[]>): Promise<KanjiDetailSourceResult<YomitanKanjiEntry[]>> {
        const value = await promise;
        return sourceResult(value, value.length ? 'ok' : 'not-found');
    }

    private kanjiDetailCacheEntry(kanji: string): KanjiDetailCacheEntry {
        const existing = this.kanjiInfoCache.get(kanji);
        if (existing) return existing;
        const created: KanjiDetailCacheEntry = {};
        this.kanjiInfoCache.set(kanji, created);
        return created;
    }

    private shouldLoadKanjiVG(settings: ReaderSettings): boolean {
        return settings.kanjivgEnabled || (settings.kanjiOriginsEnabled && settings.kanjiOriginGraphEnabled);
    }

    private kanjiDetailSettingsSignature(settings: ReaderSettings): string {
        return [
            settings.jpdbKanjiEnabled,
            this.isJitenApiActive(settings),
            settings.rtkEnabled,
            this.shouldLoadKanjiVG(settings),
            this.shouldLoadLocalKanjiDetails(settings),
        ].map(Boolean).join(':');
    }

    private isJitenApiActive(settings: ReaderSettings): boolean {
        // UT-61: Jiten features are active whenever a Jiten key exists,
        // regardless of a coexisting JPDB key.
        return hasJitenApiCredential(settings);
    }

    private shouldLoadLocalKanjiDetails(settings: ReaderSettings): boolean {
        return settings.localDictionariesEnabled && settings.localDictionaryShowKanji;
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
        const settings = this.dependencies.getSettings();
        this.captureDoodlePreview(slots, card);
        if (!settings.newTabKanjiAutogradeEnabled) return;
        const details = await this.loadKanjiDetails(kanji);
        const expectedStrokes = details.vg?.strokeCount ?? 0;
        if (shouldWaitForMoreDoodleStrokes(strokes, expectedStrokes)) {
            this.clearDoodleAssessment(slots);
            return;
        }
        const assessment = assessKanjiStrokes(strokes, expectedStrokes || strokes.length, details.vg?.strokeShapes);
        this.renderDoodleAssessment(slots, assessment);
        this.autoSubmitDoodleAssessment(settings, assessment.passed);
    }

    private autoSubmitDoodleAssessment(settings: ReaderSettings, passed: boolean): void {
        if (settings.enableReviews && settings.newTabKanjiAutoSubmit && this.state.revealAnswer) {
            void this.gradeCurrentCard(passed ? 'pass' : 'fail');
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
        if (assessment.shapeScore != null && assessment.shapeScore < 0.56) return `${this.text('checkStrokeShapeOrder')}: ${count}`;
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
        promptSlot.textContent = prompt;
    }

    private renderEmptyControls(controls: HTMLElement | null): void {
        if (!controls) return;
        controls.hidden = false;
        replaceChildrenWith(controls,
            el('button', { type: 'button', dataset: { newtabAction: 'empty-fallback' } }, this.text('starterWords')),
            el('button', { type: 'button', dataset: { newtabAction: 'settings' } }, uiText(this.language(), 'settings')),
            el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'search' } }, this.text('search')),
        );
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

    private handleSearchClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        switch (action) {
            case 'search-clear':
                event.preventDefault();
                this.clearSearch(root);
                return true;
            case 'search-focus':
                event.preventDefault();
                this.searchInput(root)?.focus();
                return true;
            case 'search-suggestion':
                event.preventDefault();
                this.selectSearchSuggestion(root, this.searchActionQuery(target));
                return true;
            case 'search-handwriting-toggle':
                event.preventDefault();
                this.toggleSearchHandwriting(root);
                return true;
            case 'handwriting-candidate':
                event.preventDefault();
                this.acceptSearchHandwritingCandidate(root, this.searchActionQuery(target));
                return true;
            case 'browse-filter': {
                event.preventDefault();
                const filter = (target.closest<HTMLElement>('[data-browse-filter]')?.dataset.browseFilter ?? 'all') as BrowseFilter;
                // Multi-select chips (user-tested): each state toggles
                // independently; All clears the whole selection.
                if (filter === 'all') this.browseFilters.clear();
                else if (this.browseFilters.has(filter)) this.browseFilters.delete(filter);
                else this.browseFilters.add(filter);
                this.browsePage = 0;
                const query = normalizeSearchQuery(this.searchQuery);
                if (!this.browseScopeActive() && query) {
                    this.performSearch(root, query);
                    return true;
                }
                const mount = this.searchResultsMount(root);
                if (mount) this.renderBrowseResults(mount);
                return true;
            }
            case 'browse-source-filter': {
                event.preventDefault();
                const filter = (target.closest<HTMLElement>('[data-browse-source-filter]')?.dataset.browseSourceFilter ?? 'all') as BrowseSourceChip;
                if (filter === 'all') this.browseSourceFilters.clear();
                else if (this.browseSourceFilters.has(filter)) this.browseSourceFilters.delete(filter);
                else this.browseSourceFilters.add(filter);
                this.browsePage = 0;
                const query = normalizeSearchQuery(this.searchQuery);
                if (!this.browseScopeActive() && query) {
                    this.performSearch(root, query);
                    return true;
                }
                const mount = this.searchResultsMount(root);
                if (mount) this.renderBrowseResults(mount);
                return true;
            }
            case 'browse-sort-direction': {
                event.preventDefault();
                this.browseSortDescending = !this.browseSortDescending;
                this.browsePage = 0;
                const mount = this.searchResultsMount(root);
                if (mount) this.renderBrowseResults(mount);
                return true;
            }
            case 'browse-select-mode': {
                event.preventDefault();
                this.browseSelectMode = !this.browseSelectMode;
                const mount = this.searchResultsMount(root);
                if (mount) this.renderBrowseResults(mount);
                return true;
            }
            case 'browse-page': {
                event.preventDefault();
                const page = Number(target.closest<HTMLElement>('[data-browse-page]')?.dataset.browsePage);
                if (Number.isFinite(page) && page >= 0) this.browsePage = page;
                const mount = this.searchResultsMount(root);
                if (mount) this.renderBrowseResults(mount);
                return true;
            }
            case 'browse-bulk': {
                event.preventDefault();
                const bulkAction = target.closest<HTMLElement>('[data-bulk-action]')?.dataset.bulkAction ?? '';
                if (bulkAction) void this.performBrowseBulkAction(root, bulkAction);
                return true;
            }
            case 'browse-card': {
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
            case 'search-result-word':
                return this.handleSearchResultWordClick(root, target, event);
            case 'search-result-kanji':
                return this.handleSearchResultKanjiClick(target, event);
            default:
                return false;
        }
    }

    private browseCardForRow(row: HTMLElement | null): JPDBCard | undefined {
        const key = cleanNestedLookupValue(row?.dataset.browseCardKey);
        if (!key) return undefined;
        return (this.browsePool ?? []).find(card => this.cardMatchesSelectionKey(card, key))
            ?? this.allWords.find(card => this.cardMatchesSelectionKey(card, key))
            ?? this.visibleWords.find(card => this.cardMatchesSelectionKey(card, key))
            ?? this.searchWordCardCache.get(key);
    }

    private searchActionQuery(target: HTMLElement): string {
        return target.closest<HTMLElement>('[data-query]')?.dataset.query ?? '';
    }

    private handleSearchResultWordClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const button = target.closest<HTMLElement>('[data-expression]');
        const key = cleanNestedLookupValue(button?.dataset.newtabCard);
        const card = key ? this.searchWordCardCache.get(key) : undefined;
        if (card && button) {
            this.toggleSearchWordResult(root, button, card);
            return true;
        }
        const expression = cleanNestedLookupValue(button?.dataset.expression);
        if (expression) void this.dependencies.lookupText?.(expression, cleanNestedLookupValue(button?.dataset.reading) || expression, button ?? target);
        return true;
    }

    private handleSearchResultKanjiClick(target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const button = target.closest<HTMLElement>('[data-kanji]');
        const kanji = cleanNestedLookupValue(button?.dataset.kanji);
        if (kanji && button) this.toggleSearchKanjiResult(button, kanji);
        return true;
    }

    private handleSearchKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): boolean {
        if (!target?.closest('[data-newtab-search]')) return false;
        switch (event.key) {
            case 'Escape':
                return this.handleSearchEscapeKeydown(root, event);
            case 'ArrowDown':
                return this.handleSearchArrowDownKeydown(root, event);
            case 'ArrowUp':
                return this.handleSearchArrowUpKeydown(root, event);
            case 'Enter':
                return this.handleSearchEnterKeydown(root, event, target);
            default:
                return false;
        }
    }

    private handleSearchEscapeKeydown(root: HTMLElement, event: KeyboardEvent): boolean {
        if (!this.searchQuery) return false;
        event.preventDefault();
        this.clearSearch(root);
        return true;
    }

    private handleSearchArrowDownKeydown(root: HTMLElement, event: KeyboardEvent): boolean {
        event.preventDefault();
        return this.moveSearchSuggestion(root, 1) || this.focusFirstSearchResult(root);
    }

    private handleSearchArrowUpKeydown(root: HTMLElement, event: KeyboardEvent): boolean {
        event.preventDefault();
        return this.moveSearchSuggestion(root, -1);
    }

    private handleSearchEnterKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement): boolean {
        if (!target.closest('[data-newtab-search-input]')) return false;
        if (!this.selectActiveSearchSuggestion(root)) return false;
        event.preventDefault();
        return true;
    }

    private renderSearch(root: HTMLElement): void {
        this.syncMode(root);
        root.classList.add('jpdb-reader-newtab-revealed', 'jpdb-reader-newtab-search-mode');
        root.classList.remove(
            'jpdb-reader-newtab-setup-mode',
            'jpdb-reader-newtab-empty-mode',
            'jpdb-reader-newtab-review-mode',
            'jpdb-reader-newtab-kanji-mode',
            'jpdb-reader-newtab-doodle-pass',
            'jpdb-reader-newtab-doodle-fail',
        );
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
        this.syncThemeToggle(root);

        const slots = this.studySlots(root);
        this.renderPromptSlot(slots.prompt, this.text('search'), resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en');
        setOptionalText(slots.answer, '');
        setOptionalText(slots.meaning, '');
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        if (slots.controls) {
            slots.controls.hidden = true;
            slots.controls.replaceChildren();
        }

        this.setSearchQuery(root, this.searchQuery);
        this.installSearchHandwriting(root);
        const query = normalizeSearchQuery(this.searchQuery);
        this.renderSearchAutocomplete(root, query, this.localSearchSuggestions(query));
        const results = this.searchResultsMount(root);
        if (!query) {
            this.renderSearchIdle(root);
        } else if (this.browseScopeActive() && this.browsePool && results) {
            // SH-3 v2: with a state chip or deck scope active, typing
            // searches MY cards (Jiten Cards parity / 2D reviews); with no
            // scope the default stays dictionary search.
            delete results.dataset.searchQuery;
            this.renderBrowseResults(results);
        } else if (results?.dataset.searchQuery !== query) {
            this.performSearch(root, query);
        }
        void this.parseSearchSurfaces(root, this.searchGeneration, query);
        this.focusSearchInput(root);
        this.renderInstallCta(root);
    }

    private setSearchQuery(root: HTMLElement, query: string): void {
        this.searchQuery = query;
        const input = this.searchInput(root);
        if (input && input.value !== query) input.value = query;
        this.renderSearchAutocomplete(root, normalizeSearchQuery(query), this.localSearchSuggestions(query));
    }

    private selectSearchSuggestion(root: HTMLElement, query: string): void {
        if (!query) return;
        this.searchActiveSuggestionIndex = -1;
        this.setSearchQuery(root, query);
        this.performSearch(root, query);
    }

    private searchInput(root: HTMLElement): HTMLInputElement | null {
        return root.querySelector<HTMLInputElement>('[data-newtab-search-input]');
    }

    private searchResultsMount(root: HTMLElement): HTMLElement | null {
        return root.querySelector<HTMLElement>('[data-newtab-search-results]');
    }

    private searchSuggestionButtons(root: HTMLElement): HTMLButtonElement[] {
        return Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-search-autocomplete] [data-newtab-action="search-suggestion"]'));
    }

    private setSearchActiveSuggestion(root: HTMLElement, index: number): boolean {
        const suggestions = this.searchSuggestionButtons(root);
        if (!suggestions.length) {
            this.searchActiveSuggestionIndex = -1;
            this.searchInput(root)?.removeAttribute('aria-activedescendant');
            return false;
        }
        this.searchActiveSuggestionIndex = Math.max(0, Math.min(index, suggestions.length - 1));
        suggestions.forEach((suggestion, suggestionIndex) => {
            const active = suggestionIndex === this.searchActiveSuggestionIndex;
            suggestion.dataset.active = String(active);
            suggestion.setAttribute('aria-selected', String(active));
            suggestion.tabIndex = -1;
        });
        const activeSuggestion = suggestions[this.searchActiveSuggestionIndex];
        if (activeSuggestion.id) this.searchInput(root)?.setAttribute('aria-activedescendant', activeSuggestion.id);
        return true;
    }

    private moveSearchSuggestion(root: HTMLElement, direction: 1 | -1): boolean {
        const suggestions = this.searchSuggestionButtons(root);
        if (!suggestions.length) return false;
        const current = this.searchActiveSuggestionIndex >= 0 ? this.searchActiveSuggestionIndex : (direction > 0 ? -1 : suggestions.length);
        const next = (current + direction + suggestions.length) % suggestions.length;
        return this.setSearchActiveSuggestion(root, next);
    }

    private selectActiveSearchSuggestion(root: HTMLElement): boolean {
        const suggestions = this.searchSuggestionButtons(root);
        const suggestion = suggestions[this.searchActiveSuggestionIndex];
        const query = suggestion?.dataset.query ?? '';
        if (!query) return false;
        this.selectSearchSuggestion(root, query);
        return true;
    }

    private focusFirstSearchResult(root: HTMLElement): boolean {
        const target = root.querySelector<HTMLElement>(
            '[data-newtab-search-results] [data-newtab-action="search-result-kanji"], '
            + '[data-newtab-search-results] [data-newtab-action="search-result-word"], '
            + '[data-newtab-search-results] a, '
            + '[data-newtab-search-results] button',
        );
        if (!target) return false;
        target.focus();
        return true;
    }

    private focusSearchInput(root: HTMLElement): void {
        const input = this.searchInput(root);
        if (!input || input === document.activeElement) return;
        window.setTimeout(() => {
            const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const canFocus = !active || active === document.body || Boolean(active.closest('[data-newtab-action="mode"]'));
            if (this.state.mode === 'search' && input.isConnected && canFocus) input.focus();
        }, 0);
    }

    private clearSearch(root: HTMLElement): void {
        this.searchGeneration++;
        this.clearSearchDebounce();
        this.searchActiveSuggestionIndex = -1;
        this.setSearchQuery(root, '');
        this.syncSearchUrl('');
        this.clearSearchHandwriting(root);
        this.renderSearchIdle(root);
        this.searchInput(root)?.focus();
    }

    private scheduleSearch(root: HTMLElement): void {
        this.clearSearchDebounce();
        const query = normalizeSearchQuery(this.searchQuery);
        if (!query) {
            this.searchGeneration++;
            this.renderSearchIdle(root);
            return;
        }
        this.searchDebounce = setTimeout(() => this.performSearch(root, query), NEW_TAB_SEARCH_DEBOUNCE_MS);
    }

    private clearSearchDebounce(): void {
        if (this.searchDebounce === undefined) return;
        clearTimeout(this.searchDebounce);
        this.searchDebounce = undefined;
    }

    private clearSearchHandwritingDebounce(): void {
        if (this.searchHandwritingDebounce === undefined) return;
        clearTimeout(this.searchHandwritingDebounce);
        this.searchHandwritingDebounce = undefined;
    }

    private clearSearchHandwriting(root: HTMLElement): void {
        this.searchHandwritingGeneration++;
        this.searchHandwritingStrokes = [];
        this.clearSearchHandwritingDebounce();
        root.querySelector<HTMLElement>('[data-newtab-handwriting]')?.dispatchEvent(new Event(KANJI_DOODLE_CLEAR_EVENT));
        this.renderSearchHandwritingCandidates(root, [], '');
    }

    private acceptSearchHandwritingCandidate(root: HTMLElement, query: string): void {
        const candidate = normalizeSearchQuery(query);
        if (!candidate) return;
        const currentQuery = this.searchInput(root)?.value ?? this.searchQuery;
        const nextQuery = appendSearchHandwritingCandidate(currentQuery, candidate);
        this.searchActiveSuggestionIndex = -1;
        this.clearSearchHandwriting(root);
        this.performSearch(root, nextQuery);
        this.toggleSearchHandwriting(root, true);
    }

    private installSearchHandwriting(root: HTMLElement): void {
        const panel = this.ensureSearchHandwritingPanel(root);
        this.syncSearchHandwritingToggle(root);
        if (panel && panel.dataset.newtabHandwritingToggleBound !== 'true') {
            panel.dataset.newtabHandwritingToggleBound = 'true';
            panel.addEventListener('toggle', () => this.syncSearchHandwritingToggle(root));
        }
        if (typeof ResizeObserver !== 'function') return;
        if (!panel || panel.dataset.newtabHandwritingBound === 'true') return;
        panel.dataset.newtabHandwritingBound = 'true';
        installKanjiDoodle(panel, () => this.dependencies.getSettings().interfaceLanguage, {
            onChange: strokes => {
                this.searchHandwritingStrokes = strokes;
                this.scheduleSearchHandwritingRecognition(root);
            },
            onClear: () => {
                this.searchHandwritingGeneration++;
                this.searchHandwritingStrokes = [];
                this.clearSearchHandwritingDebounce();
                this.renderSearchHandwritingCandidates(root, [], '');
            },
        });
    }

    private ensureSearchHandwritingPanel(root: HTMLElement): HTMLElement | null {
        const existing = root.querySelector<HTMLElement>('[data-newtab-handwriting]');
        if (existing) return existing;
        const results = this.searchResultsMount(root);
        if (!results?.parentElement) return null;
        const panel = renderSearchHandwritingPanel(this.language());
        results.parentElement.insertBefore(panel, results);
        return panel;
    }

    private toggleSearchHandwriting(root: HTMLElement, open?: boolean): void {
        const panel = this.ensureSearchHandwritingPanel(root) as HTMLDetailsElement | null;
        if (!panel) return;
        panel.open = open ?? !panel.open;
        this.syncSearchHandwritingToggle(root);
        if (!panel.open) return;
        this.focusSearchHandwritingCanvas(panel);
    }

    private focusSearchHandwritingCanvas(panel: HTMLElement): void {
        const focusCanvas = () => {
            panel.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')?.focus();
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focusCanvas);
        else window.setTimeout(focusCanvas, 0);
    }

    private syncSearchHandwritingToggle(root: HTMLElement): void {
        const panel = root.querySelector<HTMLDetailsElement>('[data-newtab-handwriting]');
        const toggle = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-handwriting-toggle"]');
        if (!toggle) return;
        toggle.setAttribute('aria-expanded', String(Boolean(panel?.open)));
    }

    private scheduleSearchHandwritingRecognition(root: HTMLElement): void {
        this.searchHandwritingGeneration++;
        this.clearSearchHandwritingDebounce();
        const strokes = this.searchHandwritingStrokes.map(stroke => [...stroke]);
        if (!strokes.length) {
            this.renderSearchHandwritingCandidates(root, [], '');
            return;
        }
        this.renderSearchHandwritingCandidates(root, [], this.text('searchRecognizing'));
        const generation = this.searchHandwritingGeneration;
        this.searchHandwritingDebounce = setTimeout(() => {
            void this.recognizeSearchHandwriting(root, strokes, generation);
        }, NEW_TAB_HANDWRITING_DEBOUNCE_MS);
    }

    private async recognizeSearchHandwriting(root: HTMLElement, strokes: DoodleStroke[], generation: number): Promise<void> {
        const recognizedCandidates = await recognizeGoogleJapaneseHandwriting(strokes).catch(error => {
            log.warn('Search handwriting failed', error);
            return [];
        });
        const geometryCandidates = recognizedCandidates.length >= 8 ? [] : await this.recognizeSearchHandwritingByGeometry(strokes).catch(error => {
            log.warn('Search handwriting geometry failed', error);
            return [];
        });
        if (!root.isConnected || this.state.mode !== 'search' || generation !== this.searchHandwritingGeneration) return;
        const candidates = uniqueStrings([...recognizedCandidates, ...geometryCandidates]).slice(0, 8);
        const message = candidates.length ? '' : this.text('searchNoHandwritingMatch');
        this.renderSearchHandwritingCandidates(root, candidates, message);
    }

    private async recognizeSearchHandwritingByGeometry(strokes: DoodleStroke[]): Promise<string[]> {
        const characters = await this.searchHandwritingGeometryCharacters();
        if (!characters.length) return [];
        const candidates = (await Promise.all(characters.map(character => this.searchHandwritingShapeCandidate(character))))
            .filter((candidate): candidate is KanjiShapeCandidate => Boolean(candidate));
        return rankKanjiStrokeCandidates(strokes, candidates, 8).map(match => match.kanji);
    }

    private async searchHandwritingGeometryCharacters(): Promise<string[]> {
        const settings = this.dependencies.getSettings();
        const commonCharacters = uniqueStrings(Array.from(NEW_TAB_HANDWRITING_COMMON_KANJI)).slice(0, 200);
        const deckCharacters = uniqueStrings([
            ...this.visibleWords.flatMap(card => kanjiCharacters(card.spelling)),
            ...this.allWords.flatMap(card => kanjiCharacters(card.spelling)),
        ]);
        const dictionaryLimit = Math.max(0, NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT - commonCharacters.length - deckCharacters.length);
        const dictionaryCharacters = settings.localDictionariesEnabled
            ? await this.dependencies.dictionaries.listKanjiCharacters?.(dictionaryLimit, settings.dictionaryPreferences).catch(() => []) ?? []
            : [];
        return uniqueStrings([
            ...commonCharacters,
            ...deckCharacters,
            ...dictionaryCharacters,
        ]).slice(0, NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT);
    }

    private searchHandwritingShapeCandidate(character: string): Promise<KanjiShapeCandidate | null> {
        let promise = this.searchHandwritingShapeCandidateCache.get(character);
        if (!promise) {
            promise = this.dependencies.kanjiVG.lookup(character)
                .then(info => info?.strokeShapes?.length ? { kanji: info.kanji, strokeShapes: info.strokeShapes } : null)
                .catch(() => null);
            this.searchHandwritingShapeCandidateCache.set(character, promise);
        }
        return promise;
    }

    private renderSearchHandwritingCandidates(root: HTMLElement, candidates: string[], message: string): void {
        const mount = root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]');
        if (!mount) return;
        mount.hidden = !candidates.length && !message;
        replaceChildrenWith(mount,
            candidates.map(candidate => el('button', {
                class: 'jpdb-reader-parseable',
                type: 'button',
                dataset: { newtabAction: 'handwriting-candidate', query: candidate },
                lang: 'ja',
            }, candidate)),
            message ? el('span', { class: 'jpdb-reader-newtab-handwriting-message jpdb-reader-parseable', lang: resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en' }, message) : null,
            message && !candidates.length ? renderSearchHandwritingManualAction(this.language()) : null,
        );
    }

    private performSearchFromInput(root: HTMLElement): void {
        const query = this.searchInput(root)?.value ?? '';
        this.setSearchQuery(root, query);
        this.performSearch(root, query);
    }

    private performSearch(root: HTMLElement, rawQuery: string): void {
        this.clearSearchDebounce();
        const query = normalizeSearchQuery(rawQuery);
        this.setSearchQuery(root, query);
        this.syncSearchUrl(query);
        if (!query) {
            this.searchGeneration++;
            this.renderSearchIdle(root);
            return;
        }

        const generation = ++this.searchGeneration;
        this.renderSearchLoading(root, query);
        void this.loadSearchResults(query).then(results => {
            if (!this.isCurrentSearch(root, generation, query)) return;
            this.renderSearchResults(root, results);
        }).catch(error => {
            log.warn('New tab search failed', { query }, error);
            if (this.isCurrentSearch(root, generation, query)) this.renderSearchError(root, query);
        });
    }

    private isCurrentSearch(root: HTMLElement, generation: number, query: string): boolean {
        return root.isConnected
            && this.state.mode === 'search'
            && this.searchGeneration === generation
            && normalizeSearchQuery(this.searchQuery) === query;
    }

    private async loadSearchResults(query: string): Promise<NewTabSearchResults> {
        const settings = this.dependencies.getSettings();
        const hasLocalDictionaries = settings.localDictionariesEnabled && await this.hasLocalDictionaries();
        const words = await this.searchWordCards(query, hasLocalDictionaries);
        const kanji = await this.searchKanjiCards(query, words);
        return {
            query,
            words,
            kanji,
            suggestions: this.searchSuggestions(query, words),
            hasLocalDictionaries,
        };
    }

    private async searchWordCards(query: string, hasLocalDictionaries: boolean): Promise<JPDBCard[]> {
        const settings = this.dependencies.getSettings();
        const parsedPromise = queryHasJapanese(query)
            ? this.dependencies.parser.parse([query]).catch(() => [[]])
            : Promise.resolve([[]] as Awaited<ReturnType<ReaderParser['parse']>>);
        const localEntriesPromise = settings.localDictionariesEnabled && hasLocalDictionaries
            ? this.localSearchWithTimeout(this.searchLocalDictionaryEntries(query, settings), [] as YomitanTermEntry[])
            : Promise.resolve([]);
        const publicJpdbPromise = this.searchPublicJpdbCards(query);

        const loadedCards = this.searchLoadedWordCards(query);
        const [parsed, localEntries, publicJpdbCards] = await Promise.all([parsedPromise, localEntriesPromise, publicJpdbPromise]);
        const parsedCards = (parsed[0] ?? []).map(token => ({ ...token.card, sentence: token.sentence ?? query }));
        const localCards = localEntries
            .map(entry => ({ ...this.dependencies.parser.localCardFromEntry(entry), sentence: query }));
        return dedupeSearchWords(searchWordResultOrder(query, { parsedCards, publicJpdbCards, loadedCards, localCards }))
            .slice(0, NEW_TAB_SEARCH_WORD_LIMIT);
    }

    private async searchPublicJpdbCards(query: string, limit = NEW_TAB_SEARCH_WORD_LIMIT): Promise<JPDBCard[]> {
        if (!this.dependencies.jpdbVocabulary?.search) return [];
        return promiseWithTimeout(
            this.dependencies.jpdbVocabulary.search(query, limit),
            NEW_TAB_PUBLIC_SEARCH_TIMEOUT_MS,
            'Public JPDB search timed out.',
        )
            .catch(error => {
                log.warn('New tab public JPDB search failed', { query, error });
                return [];
            });
    }

    private searchLoadedWordCards(query: string): JPDBCard[] {
        const normalized = normalizeSearchQuery(query).toLocaleLowerCase();
        if (!normalized) return [];
        return this.allWords.filter(card => cardMatchesSearchResult(card, normalized));
    }

    private async searchLocalDictionaryEntries(query: string, settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        const searchTerms = this.dependencies.dictionaries.searchTerms;
        if (typeof searchTerms === 'function') {
            return searchTerms.call(
                this.dependencies.dictionaries,
                query,
                NEW_TAB_SEARCH_WORD_LIMIT,
                settings.dictionaryPreferences,
                {
                    candidateLimit: NEW_TAB_LOCAL_SEARCH_CANDIDATE_LIMIT,
                    glossaryIndexMaxRows: NEW_TAB_LOCAL_SEARCH_INDEX_MAX_ROWS,
                    glossaryIndexMaxMs: NEW_TAB_LOCAL_SEARCH_INDEX_MAX_MS,
                    glossaryFallbackMaxRows: NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_ROWS,
                    glossaryFallbackMaxMs: NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_MS,
                    fallbackWhileIndexing: false,
                    prepareIndex: false,
                },
            ).catch(() => []);
        }

        const [directEntries, matchedEntries] = await Promise.all([
            this.dependencies.dictionaries.lookup(query, query, NEW_TAB_SEARCH_WORD_LIMIT, settings.dictionaryPreferences).catch(() => []),
            this.dependencies.dictionaries.findTermMatches(query, NEW_TAB_SEARCH_WORD_LIMIT, settings.dictionaryPreferences).catch(() => []),
        ]);
        return [...directEntries, ...matchedEntries.map(match => match.entry)];
    }

    private searchSuggestions(query: string, resultCards: JPDBCard[]): NewTabSearchSuggestion[] {
        return this.cardSearchSuggestions(query, [
            ...resultCards,
            ...this.allWords,
        ]);
    }

    private localSearchSuggestions(rawQuery: string): NewTabSearchSuggestion[] {
        const query = normalizeSearchQuery(rawQuery);
        return query ? this.cardSearchSuggestions(query, this.allWords) : [];
    }

    private cardSearchSuggestions(query: string, cards: JPDBCard[]): NewTabSearchSuggestion[] {
        const normalized = normalizeSearchQuery(query).toLocaleLowerCase();
        if (!normalized) return [];
        const suggestions: NewTabSearchSuggestion[] = [];
        const seen = new Set<string>();
        for (const card of cards) {
            if (!cardMatchesSearchSuggestion(card, normalized)) continue;
            const suggestion = searchSuggestionFromCard(card);
            if (!suggestion.query || seen.has(suggestion.query)) continue;
            suggestions.push(suggestion);
            seen.add(suggestion.query);
            if (suggestions.length >= NEW_TAB_SEARCH_SUGGESTION_LIMIT) break;
        }
        return suggestions;
    }

    private async searchKanjiCards(query: string, wordCards: JPDBCard[] = []): Promise<NewTabSearchKanjiResult[]> {
        const characters = uniqueStrings([
            ...kanjiCharacters(query),
            ...wordCards.flatMap(card => kanjiCharacters(card.spelling)),
        ]).slice(0, NEW_TAB_SEARCH_KANJI_LIMIT);
        const summaryWordCards = wordCards.filter(card => !this.searchWordMatchesQueryExactly(card, query));
        const wordsByCharacter = new Map<string, JPDBCard[]>();
        summaryWordCards.forEach(card => {
            kanjiCharacters(card.spelling).forEach(character => {
                wordsByCharacter.set(character, [...(wordsByCharacter.get(character) ?? []), card]);
            });
        });
        const results = await Promise.all(characters.map(character => this.searchKanjiResult(character, wordsByCharacter.get(character) ?? [], wordCards)));
        return results.filter((result): result is NewTabSearchKanjiResult => Boolean(result));
    }

    private searchWordMatchesQueryExactly(card: JPDBCard, query: string): boolean {
        const normalizedQuery = normalizedSearchWordIdentity(query);
        return Boolean(normalizedQuery)
            && (normalizedSearchWordIdentity(card.spelling) === normalizedQuery
                || normalizedSearchWordIdentity(newTabCardReading(card)) === normalizedQuery);
    }

    private async searchKanjiResult(character: string, words: JPDBCard[] = [], parentCards: JPDBCard[] = []): Promise<NewTabSearchKanjiResult | null> {
        const details = await this.loadKanjiDetails(character).catch(error => {
            log.debug('Search kanji summary details unavailable', { kanji: character, error });
            return {
                jpdb: null,
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
                sourceStates: {
                    jpdb: 'unavailable',
                    jiten: 'unavailable',
                    rtk: 'unavailable',
                    vg: 'unavailable',
                    local: 'unavailable',
                },
            } satisfies KanjiDetailBundle;
        });
        const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
        const parentMeanings = searchParentMeaningKeys(parentCards, character);
        const meanings = uniqueStrings([
            ...(details.jiten?.meanings ?? []),
            ...details.local.flatMap(entry => entry.meanings),
        ])
            .filter(meaning => !parentMeanings.has(normalizedKeywordText(meaning)))
            .slice(0, 6);
        const readings = details.jiten
            ? jitenKanjiReadingRows(details.jiten).slice(0, 8)
            : newTabKanjiReadings(fullInfo, uniqueStrings(details.local.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))).slice(0, 8);
        const card = this.dependencies.parser.fallbackCardFromText?.(character) ?? fallbackSearchKanjiCard(character);
        const sourceKeyword = this.keywordFromDetails(card, fullInfo, details.jiten, details.rtk);
        return {
            character,
            keyword: sourceKeyword || meanings[0] || '',
            readings,
            meanings,
            words,
        };
    }

    private localSearchWithTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
        return promiseWithTimeout(promise, NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS, 'Local dictionary search timed out.')
            .catch(error => {
                log.debug('Local dictionary search skipped', { error });
                return fallback;
            });
    }

    private toggleSearchWordResult(root: HTMLElement, button: HTMLElement, card: JPDBCard): void {
        const existing = this.expandSearchResultDetail(button);
        if (!existing) return;
        const kanjiDetailsPromise = this.shouldLoadSearchWordKanjiDetails(card)
            ? this.loadSearchWordKanjiDetails(card)
            : null;
        let renderedDetail: NewTabSearchWordDetail = {
            ...this.instantSearchWordDetail(),
            wordKanjiLoading: Boolean(kanjiDetailsPromise),
        };
        const canRender = () => root.isConnected && existing.isConnected && button.getAttribute('aria-expanded') === 'true';
        const renderCurrentDetail = () => {
            if (!canRender()) return;
            this.renderSearchWordDetail(existing, card, renderedDetail);
        };
        renderCurrentDetail();
        void this.loadSearchWordDetail(card).then(detail => {
            renderedDetail = {
                ...detail,
                wordKanjiDetails: renderedDetail.wordKanjiDetails,
                wordKanjiLoading: Boolean(kanjiDetailsPromise && !renderedDetail.wordKanjiDetails),
            };
            renderCurrentDetail();
        }).catch(error => {
            log.warn('New tab search detail failed', { term: card.spelling }, error);
            if (existing.isConnected) replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('searchLocalDictionariesFailed')));
        });
        void kanjiDetailsPromise?.then(details => {
            renderedDetail = {
                ...renderedDetail,
                wordKanjiDetails: details,
                wordKanjiLoading: false,
            };
            renderCurrentDetail();
        }).catch(error => {
            log.warn('Search word kanji failed', { term: card.spelling }, error);
            renderedDetail = {
                ...renderedDetail,
                wordKanjiDetails: [],
                wordKanjiLoading: false,
            };
            renderCurrentDetail();
        });
    }

    private expandSearchResultDetail(button: HTMLElement): HTMLElement | null {
        const host = button.closest<HTMLElement>('[data-newtab-search-card-shell]');
        const existing = host?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        if (!host || !existing) return null;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        existing.hidden = expanded;
        if (expanded) {
            delete host.dataset.newtabSearchExpanded;
            return null;
        }
        host.dataset.newtabSearchExpanded = 'true';
        return existing;
    }

    private instantSearchWordDetail(): NewTabSearchWordDetail {
        return {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
            loading: true,
        };
    }

    private async loadSearchWordDetail(card: JPDBCard): Promise<NewTabSearchWordDetail> {
        const renderedData = await this.loadRenderedSearchWordDetail(card);
        if (renderedData) return searchWordDetailFromRenderedData(renderedData);

        const settings = this.dependencies.getSettings();
        const [localEntries, kanjiEntries, metaEntries, jpdbVocabularyInfo, jitenVocabularyInfo] = await Promise.all([
            this.loadSearchLocalEntries(card, settings),
            this.loadSearchKanjiEntries(card, settings),
            this.loadSearchMetaEntries(card, settings),
            this.loadSearchJpdbVocabularyInfo(card),
            this.loadSearchJitenVocabularyInfo(card, settings),
        ]);
        return { localEntries, kanjiEntries, metaEntries, jpdbVocabularyInfo, jitenVocabularyInfo };
    }

    private async loadRenderedSearchWordDetail(card: JPDBCard): Promise<CardRenderData | null> {
        return await this.dependencies.loadCardRenderData?.(card).catch(error => {
            log.warn('Search render data unavailable', { term: card.spelling }, error);
            return null;
        }) ?? null;
    }

    private loadSearchLocalEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        const lookupTerms = this.dependencies.dictionaries.lookup;
        if (!settings.localDictionariesEnabled || typeof lookupTerms !== 'function') return Promise.resolve([]);
        return this.localSearchWithTimeout(
            lookupTerms.call(this.dependencies.dictionaries, card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences),
            [] as YomitanTermEntry[],
        );
    }

    private loadSearchKanjiEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanKanjiEntry[]> {
        if (!settings.localDictionariesEnabled || !settings.localDictionaryShowKanji || !isSearchLocalKanjiDictionaryCard(card)) return Promise.resolve([]);
        return this.localSearchWithTimeout(
            this.dependencies.dictionaries.lookupKanji?.(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences) ?? Promise.resolve([]),
            [] as YomitanKanjiEntry[],
        );
    }

    private loadSearchMetaEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanMetaEntry[]> {
        const lookupTermMeta = this.dependencies.dictionaries.lookupTermMeta;
        if (!settings.localDictionariesEnabled || typeof lookupTermMeta !== 'function') return Promise.resolve([]);
        return this.localSearchWithTimeout(
            lookupTermMeta.call(this.dependencies.dictionaries, card.spelling, 12, settings.dictionaryPreferences),
            [] as YomitanMetaEntry[],
        );
    }

    private loadSearchJpdbVocabularyInfo(card: JPDBCard): Promise<JpdbVocabularyInfo | null> {
        if (!hasJpdbApiCredential(this.dependencies.getSettings()) || !this.dependencies.jpdbVocabulary?.lookup || card.vid <= 0) return Promise.resolve(null);
        return promiseWithTimeout(
            this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading),
            NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
            'JPDB vocabulary lookup timed out.',
        ).catch(() => null);
    }

    private loadSearchJitenVocabularyInfo(card: JPDBCard, settings: ReaderSettings): Promise<JitenVocabularyInfo | null> {
        if (!settings.jitenDefinitionsEnabled || typeof this.dependencies.jiten?.lookupVocabularyInfoForCard !== 'function') return Promise.resolve(null);
        return promiseWithTimeout(
            this.dependencies.jiten.lookupVocabularyInfoForCard(card),
            NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
            'Jiten vocabulary lookup timed out.',
        ).catch(() => null);
    }

    private shouldLoadSearchWordKanjiDetails(card: JPDBCard): boolean {
        if (!this.searchWordKanjiCharacters(card).length) return false;
        return orderedKanjiSourceIds(this.dependencies.getSettings()).some(sourceId => sourceId !== KANJI_STROKE_SOURCE_ID);
    }

    private searchWordKanjiCharacters(card: JPDBCard): string[] {
        return kanjiCharacters(card.spelling);
    }

    private async loadSearchWordKanjiDetails(card: JPDBCard): Promise<NewTabSearchWordKanjiDetail[]> {
        return await Promise.all(this.searchWordKanjiCharacters(card).map(async kanji => {
            const details = await this.loadKanjiDetails(kanji);
            return {
                kanji,
                details,
            };
        }));
    }

    private renderSearchWordDetail(mount: HTMLElement, card: JPDBCard, detail: NewTabSearchWordDetail): void {
        this.searchWordCardCache.set(cardKey(card), card);
        mount.dataset.newtabCard = cardKey(card);
        setInnerHtml(mount, searchWordDetailHtml(card, detail, this.searchDetailViewContext()));
        this.insertSearchWordKanjiSectionIfPresent(mount, card, detail);
        this.installSearchWordDetailEnhancements(mount, card, detail);
    }

    private searchDetailViewContext(): NewTabSearchDetailViewContext {
        return {
            getSettings: () => this.dependencies.getSettings(),
            text: key => this.text(key),
            sourceAttributes: (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded),
            dictionaryLabel: name => this.dictionaryLabel(name),
            kanjiSourceTitle: sourceId => this.kanjiSourceTitle(sourceId),
            renderSearchDefinitionSources: this.dependencies.renderSearchDefinitionSources,
            renderSearchWordPills: this.dependencies.renderSearchWordPills,
        };
    }

    private insertSearchWordKanjiSectionIfPresent(mount: HTMLElement, card: JPDBCard, detail: NewTabSearchWordDetail): void {
        const kanjiSection = this.renderSearchWordKanjiSection(card, detail);
        if (kanjiSection) this.insertSearchWordKanjiSection(mount, kanjiSection);
    }

    private installSearchWordDetailEnhancements(mount: HTMLElement, card: JPDBCard, detail: NewTabSearchWordDetail): void {
        this.dependencies.installDictionarySourceTracking?.(mount);
        this.dependencies.installSearchDetailSources?.(mount, card, card.sentence || card.spelling, detail.jpdbVocabularyInfo);
        void this.dependencies.parseContent?.(mount);
    }

    private insertSearchWordKanjiSection(mount: HTMLElement, kanjiSection: HTMLElement): void {
        const sourceStack = mount.querySelector<HTMLElement>('.jpdb-reader-definition-stack');
        if (sourceStack) {
            sourceStack.append(kanjiSection);
            return;
        }
        mount.append(kanjiSection);
    }

    private renderSearchWordKanjiSection(card: JPDBCard, detail: NewTabSearchWordDetail): HTMLElement | null {
        if (!this.shouldLoadSearchWordKanjiDetails(card)) {
            return searchLocalKanjiDefinitions(detail, this.searchDetailViewContext());
        }
        const characters = this.searchWordKanjiCharacters(card);
        if (!characters.length) return null;
        const section = searchWordKanjiSourceShell(card, this.searchDetailViewContext());
        if (!section) return null;
        if (detail.wordKanjiLoading) {
            section.append(el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('loadingKanjiDetails')));
            return section;
        }
        const details = detail.wordKanjiDetails ?? [];
        if (!details.length) return searchLocalKanjiDefinitions(detail, this.searchDetailViewContext());
        details.forEach(item => {
            section.append(this.renderSearchWordKanjiItem(card, item));
        });
        return section;
    }

    private renderSearchWordKanjiItem(card: JPDBCard, item: NewTabSearchWordKanjiDetail): HTMLElement {
        const fullInfo = item.details.jpdb ? normalizeJpdbKanjiInfo(item.details.jpdb) : null;
        const kanjiCard = this.dependencies.parser.fallbackCardFromText?.(item.kanji) ?? fallbackSearchKanjiCard(item.kanji);
        const localMeanings = uniqueStrings(item.details.local.flatMap(entry => entry.meanings)).slice(0, 6);
        kanjiCard.kanjiKeyword = this.keywordFromDetails(kanjiCard, fullInfo, item.details.jiten, item.details.rtk) || localMeanings[0] || '';
        const kanjiDetail = this.renderKanjiDetails(
            kanjiCard,
            item.kanji,
            item.details.jpdb,
            item.details.jiten,
            item.details.rtk,
            item.details.vg,
            item.details.local,
        );
        const itemRoot = el('section', {
            class: 'jpdb-reader-newtab-search-kanji-item',
            dataset: { searchWordKanji: item.kanji, newtabCard: cardKey(card) },
        },
        el('div', { class: 'jpdb-reader-newtab-search-kanji-item-title' },
            el('span', { class: 'jpdb-reader-newtab-search-kanji-item-char', lang: 'ja' }, item.kanji),
            kanjiCard.kanjiKeyword ? el('span', { class: 'jpdb-reader-newtab-search-kanji-item-keyword' }, kanjiCard.kanjiKeyword) : null,
        ),
        kanjiDetail);
        this.renderNewTabUchisen(kanjiDetail, item.kanji);
        this.renderNewTabKanjiImmersion(kanjiDetail, item.kanji);
        return itemRoot;
    }

    private toggleSearchKanjiResult(button: HTMLElement, kanji: string): void {
        const existing = this.expandSearchResultDetail(button);
        if (!existing) return;
        replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('loadingKanjiDetails')));
        void this.loadKanjiDetails(kanji).then(details => {
            if (!existing.isConnected || button.getAttribute('aria-expanded') !== 'true') return;
            const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
            const card = this.dependencies.parser.fallbackCardFromText(kanji);
            const localMeanings = uniqueStrings(details.local.flatMap(entry => entry.meanings)).slice(0, 6);
            card.kanjiKeyword = this.keywordFromDetails(card, fullInfo, details.jiten, details.rtk) || localMeanings[0] || '';
            replaceChildrenWith(existing, this.renderKanjiDetails(card, kanji, details.jpdb, details.jiten, details.rtk, details.vg, details.local));
            this.renderNewTabUchisen(existing, kanji);
            this.renderNewTabKanjiImmersion(existing, kanji);
            void this.dependencies.parseContent?.(existing);
        }).catch(error => {
            log.warn('New tab search kanji detail failed', { kanji }, error);
            if (existing.isConnected) replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('searchLocalDictionariesFailed')));
        });
    }

    private renderSearchIdle(root: HTMLElement): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        delete results.dataset.searchQuery;
        this.searchWordCardCache.clear();
        this.renderSearchAutocomplete(root, '', []);
        // Study-hub parity SH-3: the idle Search tab is the "My Cards"
        // browser (JPDB deck-browse filters / Jiten Cards list) when an SRS
        // provider is connected.
        if (this.browsePoolProviders(this.dependencies.getSettings()).length) {
            void this.renderBrowseInto(root);
            return;
        }
        replaceChildrenWith(results, el('div', { class: 'jpdb-reader-newtab-search-empty' }));
    }

    private async renderBrowseInto(root: HTMLElement): Promise<void> {
        const results = this.searchResultsMount(root);
        if (!results) return;
        if (!this.browsePool) replaceChildrenWith(results, el('div', { class: 'jpdb-reader-newtab-search-empty' }, this.text('loading')));
        await this.loadBrowsePool(() => {
            const mount = this.searchResultsMount(root);
            const query = normalizeSearchQuery(this.searchQuery);
            if (mount?.isConnected && this.state.mode === 'search' && (!query || this.browseScopeActive())) this.renderBrowseResults(mount);
        });
        const mount = this.searchResultsMount(root);
        const query = normalizeSearchQuery(this.searchQuery);
        if (!mount || !mount.isConnected || this.state.mode !== 'search' || (query && !this.browseScopeActive())) return;
        this.renderBrowseResults(mount);
    }

    refreshBrowseAfterCardMutation(_card?: JPDBCard): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || this.state.mode !== 'search') return;
        this.invalidateBrowsePool();
        void this.renderBrowseInto(root);
    }

    private invalidateBrowsePool(): void {
        this.browsePool = undefined;
        this.browsePoolKey = '';
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
        return this.browseFilters.size > 0
            || this.browseSourceFilters.size > 0
            || Boolean(this.state.jpdbDeck && this.state.jpdbDeck !== 'all');
    }

    private renderBrowseResults(mount: HTMLElement): void {
        const cards = this.browsePool ?? [];
        const language = this.language();
        const query = this.browseScopeActive() ? normalizeSearchQuery(this.searchQuery) : '';
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
                anki: 'Anki',
            }),
            renderBrowseChips(cards, this.browseFilters, language, this.text('browseAllChip')),
            renderBrowseControls(this.browseSort, this.browseSortDescending, this.browseSelectMode, {
                sortLabel: this.text('browseSortLabel'),
                sortQueue: this.text('browseSortQueue'),
                sortAlpha: this.text('browseSortAlpha'),
                sortFrequency: this.text('browseSortFrequency'),
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
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="browse-bulk"]').forEach(button => { button.disabled = selected === 0; });
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
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="browse-bulk"]').forEach(button => { button.disabled = true; });
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
        // 2D reviews: a selected JPDB deck scopes the browser to that deck's
        // full word list (queue order via due_at; sort/filter on top).
        const deck = (this.state.jpdbDeck || '').trim();
        if (this.state.mode === 'search' && deck && deck !== 'all' && hasJpdbApiCredential(settings) && typeof this.dependencies.jpdb.listDeckCards === 'function') {
            const deckKey = `jpdb-deck:${deck}`;
            if (this.browsePool && this.browsePoolKey === deckKey) return this.browsePool;
            const cards = await this.dependencies.jpdb.listDeckCards(deck, NEW_TAB_BROWSE_DECK_LIMIT).catch((): JPDBCard[] => []);
            this.browsePool = dedupeWords(cards.map(normalizeNewTabCard));
            this.browsePoolKey = deckKey;
            return this.browsePool;
        }
        const providers = this.browsePoolProviders(settings);
        const key = providers.map(provider => provider.label).join('+');
        if (this.browsePool && this.browsePoolKey === key) return this.browsePool;
        this.browsePool = [];
        this.browsePoolKey = key;
        this.browseAnkiDueBuckets = undefined;
        this.browseDueBucketsKey = '';
        const collected: JPDBCard[] = [];
        const results = await Promise.all(providers.map(async provider => {
            const result = await this.loadJpdbStatsApiProvider(provider);
            if (this.browsePoolKey === key && result.error === null) {
                collected.push(...result.cards);
                this.browsePool = dedupeWords(collected);
                onPartial?.(this.browsePool);
            }
            return result;
        }));
        const cards = dedupeWords(results.filter(result => result.error === null).flatMap(result => result.cards));
        if (this.browsePoolKey !== key) return this.browsePool ?? cards;
        this.browsePool = cards;
        this.browsePoolKey = key;
        onPartial?.(cards);
        return cards;
    }

    private renderSearchSuggestion(suggestion: NewTabSearchSuggestion, index: number): HTMLButtonElement {
        const detail = [suggestion.reading && suggestion.reading !== suggestion.query ? suggestion.reading : '', suggestion.meaning].filter(Boolean).join(' · ');
        return el('button', {
            id: `jpdb-reader-newtab-suggestion-${index}`,
            type: 'button',
            role: 'option',
            dataset: { newtabAction: 'search-suggestion', query: suggestion.query, newtabSearchSuggestionIndex: index },
            lang: 'ja',
            'aria-label': detail ? `${suggestion.query}, ${detail}` : suggestion.query,
            'aria-selected': 'false',
        },
        el('span', { class: 'jpdb-reader-newtab-search-suggestion-term jpdb-reader-parseable', lang: 'ja' }, suggestion.query),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-suggestion-detail jpdb-reader-parseable', lang: 'ja' }, detail) : null);
    }

    private renderSearchAutocomplete(root: HTMLElement, query: string, suggestions: NewTabSearchSuggestion[]): void {
        const mount = root.querySelector<HTMLElement>('[data-newtab-search-autocomplete]');
        if (!mount) return;
        const input = this.searchInput(root);
        input?.setAttribute('aria-expanded', String(Boolean(query && suggestions.length)));
        if (!query || !suggestions.length) {
            this.searchActiveSuggestionIndex = -1;
            input?.removeAttribute('aria-activedescendant');
            mount.hidden = true;
            mount.replaceChildren();
            return;
        }
        if (this.searchActiveSuggestionIndex >= suggestions.length) this.searchActiveSuggestionIndex = suggestions.length - 1;
        mount.hidden = false;
        replaceChildrenWith(mount, suggestions.map((suggestion, index) => this.renderSearchSuggestion(suggestion, index)));
        if (this.searchActiveSuggestionIndex >= 0) {
            this.setSearchActiveSuggestion(root, this.searchActiveSuggestionIndex);
        } else {
            input?.removeAttribute('aria-activedescendant');
        }
    }

    private renderSearchLoading(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
        replaceChildrenWith(results,
            el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('searching')),
        );
    }

    private renderSearchResults(root: HTMLElement, results: NewTabSearchResults): void {
        const mount = this.searchResultsMount(root);
        if (!mount) return;
        mount.dataset.searchQuery = results.query;
        this.searchWordCardCache = new Map(results.words.map(card => [cardKey(card), card]));
        const resultCount = results.words.length + results.kanji.length;
        this.renderSearchAutocomplete(root, results.query, results.suggestions);
        replaceChildrenWith(mount,
            results.kanji.length ? renderSearchKanjiResults(results.kanji, this.searchViewContext()) : null,
            results.words.length ? renderSearchWordResults(results.words, this.searchViewContext()) : null,
            resultCount ? null : this.renderSearchNoResults(results),
        );
        void this.parseSearchSurfaces(root, this.searchGeneration, results.query);
        void this.enrichSearchResultPitch(root, results, this.searchGeneration);
        void this.enrichSearchWordStatusRows(root, results, this.searchGeneration);
    }

    private async parseSearchSurfaces(root: HTMLElement, generation: number, query: string): Promise<void> {
        if (!this.isCurrentSearch(root, generation, query)) return;
        await this.dependencies.parseContent?.(root, newTabShortParseOptions())?.catch(() => undefined);
    }

    private async enrichSearchResultPitch(root: HTMLElement, results: NewTabSearchResults, generation: number): Promise<void> {
        const cards = results.words.filter(card => this.shouldEnrichWordPitch(card));
        if (!cards.length) return;
        await runLimited(cards, NEW_TAB_SEARCH_PITCH_CONCURRENCY, async card => {
            const pitchAccent = await this.loadWordPitch(card);
            if (!pitchAccent.length || !this.isCurrentSearch(root, generation, results.query)) return;
            if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
            this.updateRenderedWordPitch(root, card);
        });
    }

    private async enrichSearchWordStatusRows(root: HTMLElement, results: NewTabSearchResults, generation: number): Promise<void> {
        if (!this.dependencies.loadCardRenderData || !results.words.length) return;
        await Promise.all(results.words.map(async card => {
            const data = await this.dependencies.loadCardRenderData?.(card).catch(error => {
                log.debug('Search Anki status skipped', { term: card.spelling, error });
                return null;
            });
            if (!data || !this.isCurrentSearch(root, generation, results.query)) return;
            this.updateSearchWordStatusRow(root, card, data.ankiLookup);
        }));
    }

    private updateSearchWordStatusRow(root: HTMLElement, card: JPDBCard, ankiLookup: CardRenderData['ankiLookup']): void {
        const key = cardKey(card);
        const meta = searchWordSummaryMeta(card, this.searchViewContext(), ankiLookup).join(' · ');
        root.querySelectorAll<HTMLElement>('[data-search-word-meta]').forEach(element => {
            if (element.dataset.searchWordMeta !== key) return;
            element.hidden = !meta;
            element.textContent = meta;
        });
    }

    private renderSearchError(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
        this.searchWordCardCache.clear();
        replaceChildrenWith(results,
            el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('searchLocalDictionariesFailed')),
        );
    }

    private searchViewContext(): NewTabSearchViewContext {
        return {
            language: this.language(),
            settings: this.dependencies.getSettings(),
            text: key => this.text(key),
        };
    }

    private renderSearchNoResults(results: NewTabSearchResults): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-search-message' },
            results.hasLocalDictionaries ? this.text('noLocalResults') : this.text('addDictionaryForLocalResults'),
        );
    }

    private renderControls(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.controls) return;
        slots.controls.hidden = false;
        const buttons = this.controlButtonsForCard(card);
        const hasGrades = buttons.some(button => button instanceof HTMLButtonElement && Boolean(button.dataset.grade));
        slots.controls.classList.toggle('jpdb-reader-newtab-grade-controls', hasGrades);
        slots.controls.dataset.newtabGradeControls = String(hasGrades);
        replaceChildrenWith(slots.controls, buttons);
    }

    private controlButtonsForCard(card: JPDBCard): HTMLElement[] {
        const undo = this.canUndoLastReview()
            ? [el('button', { type: 'button', class: 'jpdb-reader-newtab-undo-review', dataset: { newtabAction: 'undo-review' } }, this.text('undoReview'))]
            : [];
        if (!this.canReviewCard(card)) return [...undo, ...this.navigationControlButtons(this.text(this.state.revealAnswer ? 'hide' : 'reveal'))];
        if (!this.state.revealAnswer) return [...undo, ...this.navigationControlButtons(this.text('reveal'))];
        return [...undo, ...this.gradeControlButtons(card)];
    }

    private canReviewCard(card: JPDBCard): boolean {
        if (this.isOfflineSourceLabel(this.sourceLabel) && !this.offlineGradeTargets(card).length) return false;
        return this.reviewSourceSummary(card).targets.length > 0;
    }

    private reviewTargetsForCard(card: JPDBCard): NewTabReviewTarget[] {
        return reviewTargetsForNewTabCard(card, this.dependencies.getSettings(), this.ankiCardIdForReview(card));
    }

    private reviewSourceSummary(card: JPDBCard): NewTabReviewSourceSummary {
        return summarizeNewTabReviewSources(this.reviewTargetsForCard(card));
    }

    private offlineGradeTargets(card: JPDBCard): QueuedNewTabGradeTarget[] {
        return queueableNewTabReviewTargets(this.reviewTargetsForCard(card));
    }

    private navigationControlButtons(revealLabel: string): HTMLElement[] {
        const revealShortcut = this.studyShortcutHint(['studyReveal', 'studyRevealAlternate']);
        return [
            el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': this.text('previousWord') }, this.text('previousWord')),
            el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, revealLabel,
                revealShortcut && newTabKeyHintsRenderable() ? el('kbd', { class: 'jpdb-reader-newtab-key-hint', 'aria-hidden': 'true' }, revealShortcut) : null),
            el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': this.text('nextWord') }, this.text('nextWord')),
        ];
    }

    private gradeControlButtons(card: JPDBCard): HTMLElement[] {
        const targetOptions = this.mainGradeTargetOptions(card);
        const targetLabel = targetOptions[0]?.label ?? this.gradeTargetLabel(card);
        return renderNewTabGradeControlButtons({
            apiShortLabel: this.apiGradeTargetShortLabel(card),
            bothLabel: this.text('gradeTargetBoth'),
            grades: newTabGradeOptions(this.dependencies.getSettings()),
            intervals: card.reviewGradeIntervals,
            keyHints: this.studyGradeShortcutHints(),
            selectorLabel: this.text('gradeTargetSelector'),
            selectedOption: targetOptions[0],
            summary: this.reviewSourceSummary(card),
            targetLabel,
            targetOptions,
        });
    }

    private studyGradeShortcutHints(): Partial<Record<JPDBGrade, string>> {
        const settings = this.dependencies.getSettings();
        const candidates = settings.twoButtonReviews
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
            jiten: this.text('gradeTargetJiten'),
            jitenAndAnki: this.formatNewTabText('gradeTargetJitenAndAnki', { target: ankiTarget }),
            jpdb: this.text('gradeTargetJpdb'),
            jpdbAndAnki: this.formatNewTabText('gradeTargetJpdbAndAnki', { target: ankiTarget }),
            jpdbAndJiten: this.text('gradeTargetJpdbAndJiten'),
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

    private lookupReviewTargetsForCard(card: JPDBCard, data?: CardRenderData | null): NewTabLookupReviewTarget[] {
        const targets = this.reviewTargetsForCard(card);
        const result: NewTabLookupReviewTarget[] = [];
        if (targets.includes('jiten-api')) {
            result.push({ id: 'jiten', kind: 'jiten', label: this.text('gradeTargetJiten'), shortLabel: 'Jiten' });
        }
        if (targets.some(target => target === 'jpdb-api' || target === 'jpdb-live')) {
            result.push({ id: 'jpdb', kind: 'jpdb', label: this.text('gradeTargetJpdb'), shortLabel: 'JPDB' });
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

    private renderInstallCta(root: HTMLElement): void {
        const install = root.querySelector<HTMLAnchorElement>('[data-newtab-install]');
        if (!install) return;
        install.hidden = hasYomuRuntime() || root.dataset.standaloneNewtab !== 'true';
    }

    private isReviewCard(card: JPDBCard): boolean {
        return isReviewSource(card.reviewSource)
            || card.source === 'anki'
            || isJitenSrsCard(card)
            || isPositiveJpdbCard(card);
    }

    private async performJpdbKanjiAction(root: HTMLElement, actionId: string): Promise<void> {
        if (!actionId) return;
        const card = this.visibleWords[this.index];
        const kanji = visibleCardKanji(card);
        try {
            this.setStatus(root, this.text('updatingJpdbKanji'));
            await this.dependencies.jpdbKanji.performAction(actionId);
            this.finishJpdbKanjiAction(root, card, kanji);
        } catch (error) {
            log.warn('New tab JPDB kanji action failed', { kanji }, error);
            this.setStatus(root, this.text('jpdbKanjiUpdateFailed'));
        }
    }

    private finishJpdbKanjiAction(root: HTMLElement, card: JPDBCard | undefined, kanji: string): void {
        if (kanji) this.kanjiInfoCache.delete(kanji);
        if (card && this.visibleWords[this.index] === card) this.renderWord(root, card);
        this.setStatus(root, this.text('jpdbKanjiUpdated'));
    }

    private async gradeCurrentCard(grade: JPDBGrade, selectedTarget?: NewTabLookupReviewTargetSelection): Promise<boolean> {
        const target = this.currentGradeTarget();
        if (!target) return false;
        if (!this.canReviewCard(target.card)) return false;
        const isCorrection = this.isReviewHistoryCard(target.card);
        if (this.isOfflineSourceLabel(this.sourceLabel)) {
            if (await this.queueOfflineGrade(target.card, grade)) {
                this.setStatus(target.root, this.text('offlineGradeReconnect'));
                if (!isCorrection) this.sessionProgress.recordReviewCompleted();
                this.advanceAfterGrade(target.root, target.card, grade);
                return true;
            } else {
                this.setStatus(target.root, this.text('couldNotSubmitGrade'));
            }
            return false;
        }
        try {
            this.setStatus(target.root, this.text('grading'));
            const submittedTarget = await this.submitGrade(target.card, grade, selectedTarget);
            this.invalidateReviewSourceCache(target.card);
            this.setStatus(target.root, this.gradeSuccessStatus(grade, submittedTarget));
            if (!isCorrection) this.sessionProgress.recordReviewCompleted();
            // UT-57: every provider gets an undo affordance — Jiten reverses
            // server-side, the rest re-queue locally.
            this.lastUndoableReview = {
                card: target.card,
                at: Date.now(),
                serverUndo: isJitenSrsCard(target.card) && typeof this.dependencies.jiten?.undoReview === 'function',
                counted: !isCorrection,
            };
            this.advanceAfterGrade(target.root, target.card, grade);
            return true;
        } catch (error) {
            log.warn('New tab grade failed', { term: target.card.spelling, source: target.card.source, grade }, error);
            if (!selectedTarget && await this.queueOfflineGrade(target.card, grade, this.queueableFailedGradeTargets(error))) {
                this.setStatus(target.root, this.text('offlineGradeReconnect'));
                if (!isCorrection) this.sessionProgress.recordReviewCompleted();
                this.advanceAfterGrade(target.root, target.card, grade);
                return true;
            }
            this.setStatus(target.root, this.text('couldNotSubmitGrade'));
        }
        return false;
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
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
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

    private lookupReviewTargetForSelection(card: JPDBCard, selectedTarget: NewTabLookupReviewTargetSelection): NewTabLookupReviewTarget | null {
        const targets = this.lookupReviewTargetsForCard(card);
        if (selectedTarget.kind === 'jpdb') return targets.find(target => target.kind === 'jpdb') ?? null;
        if (selectedTarget.kind === 'jiten') return targets.find(target => target.kind === 'jiten') ?? null;
        const selectedCardId = Number(selectedTarget.ankiCardId);
        if (!Number.isFinite(selectedCardId) || selectedCardId <= 0) return null;
        return targets.find(target => target.kind === 'anki' && target.ankiCardId === selectedCardId) ?? null;
    }

    private reviewTargetForLookupKind(card: JPDBCard, kind: NewTabLookupReviewTarget['kind']): NewTabReviewTarget | null {
        if (kind === 'jpdb') return this.reviewTargetsForCard(card).find(candidate => candidate === 'jpdb-api' || candidate === 'jpdb-live') ?? null;
        if (kind === 'jiten') return this.reviewTargetsForCard(card).find(candidate => candidate === 'jiten-api') ?? null;
        return null;
    }

    private async submitReviewTarget(card: JPDBCard, target: NewTabReviewTarget, grade: JPDBGrade): Promise<void> {
        if (target === 'jpdb-live') {
            this.submitLiveJpdbGrade(card, grade);
            return;
        }
        if (target === 'anki') {
            await this.submitAnkiGrade(card, grade);
            return;
        }
        if (target === 'jiten-api') {
            await this.submitJitenApiGrade(card, grade);
            return;
        }
        await this.submitJpdbApiGrade(card, grade);
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

    private async submitJpdbApiGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (card.source !== 'jpdb' && card.reviewSource !== 'jpdb-api') throw new Error(this.text('couldNotSubmitGrade'));
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) throw new Error(this.text('apiSrsActionsDisabled'));
        if (!hasJpdbApiCredential(settings)) throw new Error(this.text('addJpdbApiKeyReview'));
        await this.dependencies.jpdb.reviewCard(card, grade);
        this.publishGradedCardState(card);
    }

    private async submitJitenApiGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (!isJitenSrsCard(card)) throw new Error(this.text('couldNotSubmitGrade'));
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) throw new Error(this.text('apiSrsActionsDisabled'));
        if (!hasJitenApiCredential(settings)) throw new Error(this.text('addJitenApiKeyReview'));
        if (typeof this.dependencies.jiten?.reviewCard !== 'function') throw new Error(this.text('couldNotSubmitGrade'));
        await this.dependencies.jiten.reviewCard(card, grade);
        // Jiten reviews are server-reversible — record the undo here too so
        // every submit path (not only gradeCurrentCard) arms the affordance.
        this.lastUndoableReview = {
            card,
            at: Date.now(),
            serverUndo: typeof this.dependencies.jiten.undoReview === 'function',
            counted: true,
        };
        // Parity with the JPDB path (jpdb.reviewCard refreshes internally):
        // pull the post-review state so the review summary reflects reality.
        if (typeof this.dependencies.jiten.refreshCardState === 'function') {
            await this.dependencies.jiten.refreshCardState(card).catch(() => undefined);
        }
        this.publishGradedCardState(card);
    }

    private renderBatchComplete(root: HTMLElement): void {
        const slots = this.studySlots(root);
        root.classList.remove('jpdb-reader-newtab-revealed');
        this.renderPromptSlot(slots.prompt, this.text('batchComplete'), resolveUiLanguage(this.language()) === 'ja' ? 'ja' : 'en');
        setOptionalText(slots.answer, '');
        const snapshot = this.sessionProgress.snapshot([]);
        setOptionalText(slots.meaning, `${this.text('sessionDone')} ${snapshot.completedReviews} · ${snapshot.elapsedLabel}`);
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        if (slots.controls) {
            slots.controls.hidden = false;
            replaceChildrenWith(slots.controls,
                el('button', { type: 'button', dataset: { newtabAction: 'continue-batch' } }, this.text('continueStudying')),
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
        const last = this.lastUndoableReview;
        if (!last || !this.canUndoLastReview()) return;
        this.lastUndoableReview = undefined;
        if (!last.serverUndo) {
            this.restoreLocallyUndoneCard(root, last);
            return;
        }
        const jiten = this.dependencies.jiten;
        try {
            await jiten?.undoReview?.(last.card);
            if (typeof jiten?.refreshCardState === 'function') {
                await jiten.refreshCardState(last.card).catch(() => undefined);
            }
            this.publishGradedCardState(last.card);
            this.dependencies.toast?.(this.text('reviewUndone'));
            this.restoreUndoneCardToFront(root, last.card);
        } catch (error) {
            log.warn('Undo review failed', error);
            this.dependencies.toast?.(this.text('undoReviewFailed'));
        }
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
        const cardId = explicitCardId ?? this.ankiCardIdForReview(card);
        if (!cardId) throw new Error(this.text('missingAnkiCardId'));
        await this.dependencies.anki.answerCard(cardId, grade);
        try {
            return await this.refreshAnkiReviewCardState(card, cardId);
        } finally {
            this.dependencies.onAnkiStatusChanged?.(card);
            this.publishGradedCardState(card);
        }
    }

    private async refreshAnkiReviewCardState(card: JPDBCard, preferredCardId?: number): Promise<AnkiLookupResult | null> {
        if (!this.dependencies.anki.findExistingCards) return null;
        const lookup = await this.dependencies.anki.findExistingCards(card);
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
    }

    private ankiCardIdForReview(card: JPDBCard): number | null {
        const cardId = card.ankiCardId ?? (card.source === 'anki' || card.reviewSource === 'anki' ? card.rid : undefined);
        return Number.isFinite(Number(cardId)) && Number(cardId) > 0 ? Number(cardId) : null;
    }

    private async queueOfflineGrade(card: JPDBCard, grade: JPDBGrade, targets = this.offlineGradeTargets(card)): Promise<boolean> {
        const queueTargets = queueableNewTabReviewTargets(targets);
        if (!queueTargets.length || !this.dependencies.getSettings().newTabOfflineEnabled) return false;
        const queue = await this.readQueuedGrades();
        const entries = queueTargets.map((target): QueuedNewTabGrade => ({
            id: `${target}:${cardKey(card)}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            at: Date.now(),
            target,
            card,
            grade,
            attempts: 0,
        }));
        const entryKeys = new Set(entries.map(entry => this.queuedGradeKey(entry)));
        const deduped = queue.filter(item => !entryKeys.has(this.queuedGradeKey(item)));
        deduped.push(...entries);
        await this.writeQueuedGrades(deduped.slice(-NEW_TAB_GRADE_QUEUE_LIMIT));
        return true;
    }

    private offlineGradeTarget(card: JPDBCard): QueuedNewTabGrade['target'] | null {
        return this.offlineGradeTargets(card)[0] ?? null;
    }

    private async flushQueuedGrades(): Promise<void> {
        const queue = await this.readQueuedGrades();
        if (!queue.length) return;
        const pending: QueuedNewTabGrade[] = [];
        for (const item of queue) {
            if (!item) continue;
            try {
                const submitted = await this.submitQueuedGrade(item);
                if (submitted) this.invalidateReviewSourceCache(item.card);
            } catch (error) {
                pending.push({
                    ...item,
                    attempts: item.attempts + 1,
                    lastError: error instanceof Error ? error.message : String(error),
                });
            }
        }
        await this.writeQueuedGrades(pending);
    }

    private async submitQueuedGrade(item: QueuedNewTabGrade): Promise<boolean> {
        if (item.target === 'anki') {
            await this.submitAnkiGrade(item.card, item.grade);
            return true;
        }
        if (item.target === 'jiten-api') {
            await this.submitJitenApiGrade(item.card, item.grade);
            return true;
        }
        await this.submitJpdbApiGrade(item.card, item.grade);
        return true;
    }

    private queuedGradeKey(item: Pick<QueuedNewTabGrade, 'target' | 'card'>): string {
        return `${item.target}:${cardKey(item.card)}`;
    }

    private async readQueuedGrades(): Promise<QueuedNewTabGrade[]> {
        const queue = await gmStorageGet<QueuedNewTabGrade[] | null>(NEW_TAB_GRADE_QUEUE_KEY, null)
            .catch(() => null);
        return Array.isArray(queue) ? queue.filter(isQueuedNewTabGrade).slice(-NEW_TAB_GRADE_QUEUE_LIMIT) : [];
    }

    private writeQueuedGrades(queue: QueuedNewTabGrade[]): Promise<void> {
        return queue.length
            ? gmStorageSet(NEW_TAB_GRADE_QUEUE_KEY, queue.slice(-NEW_TAB_GRADE_QUEUE_LIMIT))
            : gmStorageDelete(NEW_TAB_GRADE_QUEUE_KEY);
    }

    private advanceAfterGrade(root: HTMLElement, card: JPDBCard, grade?: JPDBGrade): void {
        const key = cardKey(card);
        const previousIndex = this.index;
        const nextKey = this.nextVisibleReviewCardKeyAfterGrade(key, previousIndex);
        this.rememberReviewHistoryCard(card);
        // jpdb-style failed-card loop (community ask): a failed grade keeps
        // the card in this session's pool so it comes back around until
        // passed, instead of disappearing until the next batch fetch.
        if (grade && isFailedNewTabGrade(grade) && this.reviewCountMode) {
            this.requeueFailedCard(root, key, previousIndex);
            return;
        }
        this.allWords = this.allWords.filter(item => cardKey(item) !== key);
        this.visibleWords = this.studyPoolForCurrentMode();
        this.visiblePoolSignature = this.newTabPoolSignature(this.visibleWords);
        this.state.revealAnswer = false;
        this.persistState();
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
            void this.loadWordsInto(root, false, { useOfflineCache: false });
            return;
        }
        this.index = nextIndex;
        this.renderWord(root, this.visibleWords[this.index]);
        this.playCardEnterTransition(root);
        if (this.shouldRefreshQueueAfterGrade(card)) void this.loadWordsInto(root, true, {
            useOfflineCache: false,
            quiet: true,
            excludeCardKeys: [key],
            preserveVisibleOrder: true,
        });
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
        return document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
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
        const id = card.jpdbReviewId || cardKey(card);
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
        const settings = this.dependencies.getSettings();
        if (!settings.newTabOfflineEnabled) return;
        const limit = Math.max(0, settings.newTabOfflineLimit || 0);
        if (!limit) return;
        await gmStorageSet(NEW_TAB_CACHE_KEY, {
            at: Date.now(),
            sourceLabel,
            cards: cards.slice(0, limit),
        }).catch(() => undefined);
    }

    private async readOfflineCache(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabOfflineEnabled) return { cards: [], sourceLabel: '' };
        const cached = await gmStorageGet<{ cards?: JPDBCard[]; sourceLabel?: string } | null>(NEW_TAB_CACHE_KEY, null)
            .catch(() => null);
        return {
            cards: Array.isArray(cached?.cards) ? cached.cards.map(normalizeNewTabCard).slice(0, Math.max(0, settings.newTabOfflineLimit || 0)) : [],
            sourceLabel: this.localizedSourceLabel(cached?.sourceLabel || this.text('cachedReviews')),
        };
    }

    private renderReaderWord(card: JPDBCard, state: string, text = card.spelling, sentence = card.sentence || card.spelling): HTMLSpanElement {
        const sourceClass = card.source === 'anki' ? 'anki' : 'jpdb';
        const pitchClass = newTabPitchClass(card);
        const reading = newTabCardReading(card);
        return el('span', {
            class: `jpdb-reader-word ${sourceClass}-${state} jpdb-pitch-${pitchClass}`,
            dataset: {
                action: 'lookup',
                term: text,
                expression: card.spelling,
                reading,
                vid: card.vid,
                sid: card.sid,
                pitchClass,
                sentence,
            },
            tabIndex: -1,
        }, text);
    }

    private async enrichWordPitch(root: HTMLElement, card: JPDBCard): Promise<void> {
        if (!this.shouldEnrichWordPitch(card)) return;
        const key = this.wordPitchCacheKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        root.dataset.newtabPitchRequest = requestId;
        const pitchAccent = await this.loadWordPitch(card);
        if (root.dataset.newtabPitchRequest !== requestId || !pitchAccent.length) return;
        if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
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
        return this.state.mode === 'word'
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
        return this.dependencies.getSettings().showPitchAccent
            && !card.pitchAccent.length
            && Boolean(card.spelling.trim());
    }

    private loadWordPitch(card: JPDBCard): Promise<string[]> {
        const key = this.wordPitchCacheKey(card);
        const cached = this.wordPitchCache.get(key);
        if (cached) return cached;
        const promise = this.fetchWordPitch(card).catch(() => []);
        this.wordPitchCache.set(key, promise);
        return promise;
    }

    private async fetchWordPitch(card: JPDBCard): Promise<string[]> {
        const localPitch = this.fetchLocalWordPitch(card);
        const quickLocalPitch = await Promise.race([
            localPitch,
            delayWithValue('', NEW_TAB_WORD_PITCH_LOCAL_GRACE_MS),
        ]);
        if (quickLocalPitch) return [quickLocalPitch];

        return firstNonEmptyPitch([
            this.fetchPublicWordPitch(card),
            Promise.race([
                localPitch,
                delayWithValue('', NEW_TAB_WORD_PITCH_LOCAL_TIMEOUT_MS),
            ]).then(pitch => pitch ? [pitch] : []),
        ]);
    }

    private fetchPublicWordPitch(card: JPDBCard): Promise<string[]> {
        if (!hasJpdbApiCredential(this.dependencies.getSettings())) return Promise.resolve([]);
        return this.dependencies.jpdbPublicPitch?.lookup(card.spelling, newTabCardReading(card)).catch(() => []) ?? Promise.resolve([]);
    }

    private async fetchLocalWordPitch(card: JPDBCard): Promise<string> {
        const settings = this.dependencies.getSettings();
        if (!settings.localDictionariesEnabled) return '';
        if (typeof this.dependencies.dictionaries.lookupTermMeta !== 'function') return '';
        const metaEntries = await this.dependencies.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(() => []);
        return localPitchPatternFromMeta(newTabCardReading(card), metaEntries);
    }

    private wordPitchCacheKey(card: JPDBCard): string {
        const settings = this.dependencies.getSettings();
        return JSON.stringify({
            spelling: card.spelling,
            reading: newTabCardReading(card),
            local: settings.localDictionariesEnabled,
            dictionaries: settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        });
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
        const reading = newTabCardReading(card);
        return (word.dataset.vid === String(card.vid) && word.dataset.sid === String(card.sid))
            || (word.dataset.expression === card.spelling && (!word.dataset.reading || word.dataset.reading === reading));
    }

    private syncMode(root: HTMLElement): void {
        this.syncKeyHintVisibility(root);
        root.classList.toggle('jpdb-reader-newtab-search-mode', this.state.mode === 'search');
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        root.classList.toggle('jpdb-reader-newtab-stats-mode', this.state.mode === 'stats');
        const search = root.querySelector<HTMLElement>('[data-newtab-search]');
        if (search) search.hidden = this.state.mode !== 'search';
        const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
        if (controls) controls.hidden = this.state.mode === 'stats';
        if (this.state.mode !== 'search') root.querySelector<HTMLElement>('[data-newtab-handwriting]')?.remove();
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="mode"]').forEach(button => {
            const active = button.dataset.mode === this.state.mode;
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
        const show = this.state.mode === 'word' && hasProvider;
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
        const settings = this.dependencies.getSettings();
        // The Search tab shares the JPDB deck scope (2D reviews: pick a deck,
        // browse all of its words in queue order, type to narrow).
        if (this.state.mode === 'search') {
            const show = hasJpdbApiCredential(settings);
            select.hidden = !show;
            if (show) void this.populateDeckSelector(select, settings);
            return;
        }
        if (this.state.mode !== 'word') {
            select.hidden = true;
            return;
        }
        // Anki source gets its own deck scope (SH-6 parity for all providers).
        if (this.state.source === 'anki') {
            const show = settings.ankiEnabled && settings.newTabAnkiEnabled;
            select.hidden = !show;
            if (show) void this.populateAnkiDeckSelector(select);
            return;
        }
        const sourceAllowsJpdb = this.state.source === 'auto' || this.state.source === 'jpdb';
        // UT-44: the picker also lists Jiten study decks, so Jiten-only
        // credentials show it too.
        const show = sourceAllowsJpdb && (hasJpdbApiCredential(settings) || hasJitenApiCredential(settings));
        select.hidden = !show;
        if (!show) return;
        void this.populateDeckSelector(select, settings);
    }

    private async populateAnkiDeckSelector(select: HTMLSelectElement): Promise<void> {
        const invoke = this.dependencies.anki.invoke;
        const selected = this.state.ankiDeck || 'all';
        this.primeDeckSelector(select, selected, selected === 'all' ? this.text('allVocabularyDeck') : selected);
        const names = typeof invoke === 'function'
            ? await invoke<string[]>('deckNames').catch((): string[] => [])
            : [];
        if (!select.isConnected) return;
        // UT-46: per-deck due counts straight from Anki's own scheduler
        // search — pick a deck knowing what's waiting in it.
        const dueByDeck = await this.ankiDeckDueCounts(names.filter(Boolean));
        if (!select.isConnected) return;
        const withDue = (name: string, label: string): string => {
            const due = dueByDeck.get(name);
            return typeof due === 'number' && due > 0 ? `${label} · ${due}` : label;
        };
        const options = [
            { id: 'all', name: this.text('allVocabularyDeck') },
            ...names.filter(Boolean).map(name => ({ id: name, name: withDue(name, name) })),
        ];
        if (!options.some(option => option.id === selected)) options.push({ id: selected, name: selected });
        replaceChildrenWith(select, options.map(option => el('option', { value: option.id, selected: option.id === selected }, option.name)));
        select.value = selected;
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

    private async populateDeckSelector(select: HTMLSelectElement, settings: ReaderSettings): Promise<void> {
        const selected = (this.state.jpdbDeck || settings.newTabJpdbDeck).trim() || 'all';
        this.primeDeckSelector(select, selected, this.deckSelectorFallbackLabel(selected));
        const key = effectiveJpdbApiKey(settings);
        if (this.deckSelectorDecks?.key !== key) {
            const listDecks = typeof this.dependencies.jpdb.listDecks === 'function'
                ? this.dependencies.jpdb.listDecks()
                : Promise.resolve([] as JPDBDeck[]);
            this.deckSelectorDecks = { key, promise: listDecks.catch((): JPDBDeck[] => []) };
        }
        const decks = await (this.deckSelectorDecks?.promise ?? Promise.resolve([] as JPDBDeck[]));
        const jitenDecks = await this.jitenDeckSelectorOptions(settings);
        if (!select.isConnected) return;
        const bothProviders = hasJpdbApiCredential(settings) && hasJitenApiCredential(settings);
        const options = [
            { id: 'all', name: this.text('allVocabularyDeck') },
            // UT-62: one-tap provider scoping when both queues exist.
            ...(bothProviders ? [
                { id: 'provider:jiten', name: 'Jiten' },
                { id: 'provider:jpdb', name: 'JPDB' },
            ] : []),
            ...decks.filter(deck => deck.id !== 'all'),
            ...jitenDecks,
        ];
        if (!options.some(option => option.id === selected)) options.push({ id: selected, name: selected });
        replaceChildrenWith(select, options.map(option => el('option', {
            value: option.id,
            selected: option.id === selected,
        }, deckOptionLabel(option))));
        select.value = selected;
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
        await this.dependencies.onSettingsChange();
        this.dependencies.applyTheme();
        this.syncThemeToggle(root);
    }

    private async toggleInterfaceLanguage(_root: HTMLElement): Promise<void> {
        const settings = this.dependencies.getSettings();
        settings.interfaceLanguage = nextExplicitUiLanguage(settings.interfaceLanguage);
        await this.dependencies.onSettingsChange();
        await this.renderPage();
    }

    private syncThemeToggle(root: HTMLElement): void {
        const theme = this.effectiveTheme(this.dependencies.getSettings().theme);
        root.dataset.newtabTheme = theme;
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="theme"]');
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
        return [this.state.source, this.state.mode, this.sourceLabel].join('|');
    }

    private readStoredWordKey(): { signature: string; key: string } | null {
        try {
            const raw = sessionStorage.getItem(SESSION_WORD_KEY);
            if (!raw) return null;
            const value = JSON.parse(raw) as Partial<{ signature: string; key: string }>;
            return typeof value.signature === 'string' && typeof value.key === 'string' ? { signature: value.signature, key: value.key } : null;
        } catch {
            return null;
        }
    }

    // UT-59: every study entry has a stable, shareable URL (#card=key).
    // Advancing pushes history so browser back/forward walks the session;
    // a reload restores the same card.
    private lastSyncedCardUrlKey = '';
    private handlingCardPopstate = false;

    private syncCardUrl(card: JPDBCard): void {
        if (this.state.mode !== 'word' || typeof history === 'undefined') return;
        // Only the standalone study page owns its URL.
        if (!isYomuNewTabUrl(location.href)) return;
        const key = this.cardSelectionKey(card);
        if (key === this.lastSyncedCardUrlKey) return;
        const url = `#card=${encodeURIComponent(key)}`;
        try {
            if (!this.lastSyncedCardUrlKey || this.handlingCardPopstate) history.replaceState(null, '', url);
            else history.pushState(null, '', url);
        } catch {
            // History can be unavailable (sandboxed frames) — non-fatal.
        }
        this.lastSyncedCardUrlKey = key;
    }

    private cardKeyFromLocation(): string {
        try {
            const match = /[#&]card=([^&]+)/.exec(location.hash);
            return match ? decodeURIComponent(match[1]) : '';
        } catch {
            return '';
        }
    }

    private handleCardPopstate(root: HTMLElement): void {
        if (this.state.mode !== 'word') return;
        const key = this.cardKeyFromLocation();
        if (!key || key === this.lastSyncedCardUrlKey) return;
        // UT-58: navigating back across a grade boundary undoes the grade.
        if (this.canUndoLastReview() && this.lastUndoableReview && this.cardMatchesSelectionKey(this.lastUndoableReview.card, key)) {
            this.handlingCardPopstate = true;
            void this.undoLastReview(root).finally(() => { this.handlingCardPopstate = false; });
            return;
        }
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
        if (this.handleSearchPopstate(root)) return;
        this.handleCardPopstate(root);
    }

    private handleSearchPopstate(root: HTMLElement): boolean {
        const mode = newTabRouteMode();
        const query = newTabRouteSearchQueryFromLocation();
        if (mode !== 'search' && this.state.mode !== 'search') return false;
        this.handlingSearchPopstate = true;
        try {
            if (this.state.mode !== 'search') {
                this.state = { ...this.state, mode: 'search', revealAnswer: false };
                this.persistState();
                this.setSearchQuery(root, query);
                this.renderSearch(root);
                return true;
            }
            this.setSearchQuery(root, query);
            if (query) this.performSearch(root, query);
            else {
                this.searchGeneration++;
                this.clearSearchDebounce();
                this.renderSearchIdle(root);
            }
            return true;
        } finally {
            this.handlingSearchPopstate = false;
        }
    }

    private syncSearchUrl(query: string): void {
        if (this.handlingSearchPopstate || typeof history === 'undefined') return;
        if (!isYomuNewTabUrl(location.href)) return;
        const url = newSearchUrl(query);
        if (!url) return;
        const next = `${url.pathname}${url.search}${url.hash}`;
        const current = `${location.pathname}${location.search}${location.hash}`;
        if (next === current) return;
        try {
            history.pushState(null, '', next);
        } catch {
            // History can be unavailable in sandboxed frames.
        }
    }

    private writeStoredWordKey(card: JPDBCard): void {
        try {
            sessionStorage.setItem(SESSION_WORD_KEY, JSON.stringify({
                signature: this.currentSessionSignature(),
                key: this.cardSelectionKey(card),
            }));
        } catch {
            // Refresh stability is a convenience; the page still works without storage.
        }
    }
}

function isPassiveParsedWord(word: HTMLElement): boolean {
    return word.dataset.jpdbReaderPassive === 'true';
}

function cleanNestedLookupValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

function searchWordDetailFromRenderedData(data: CardRenderData): NewTabSearchWordDetail {
    return {
        localEntries: data.localEntries,
        kanjiEntries: data.kanjiEntries,
        metaEntries: data.metaEntries,
        ankiLookup: data.ankiLookup,
        jpdbVocabularyInfo: data.jpdbVocabularyInfo,
        jitenVocabularyInfo: data.jitenVocabularyInfo ?? null,
    };
}

function ankiAudioFilenamesFromFields(fields: Record<string, string>): string[] | undefined {
    const filenames = uniqueStrings(Object.values(fields)
        .flatMap(value => Array.from(value.matchAll(/\[sound:([^\]]+)]/gi), match => match[1]?.trim() ?? '')));
    return filenames.length ? filenames : undefined;
}

// UT-44: deck-picker values of the form jiten:<id> scope to a Jiten study deck.
function jitenScopedDeckId(pickedDeck: string): number | null {
    if (!pickedDeck.startsWith('jiten:')) return null;
    const id = Number(pickedDeck.slice('jiten:'.length));
    return Number.isFinite(id) && id > 0 ? Math.floor(id) : null;
}

function uniqueConcreteSources(sources: Array<ConcreteNewTabWordSource | null>): ConcreteNewTabWordSource[] {
    return sources.filter((source, index): source is ConcreteNewTabWordSource => Boolean(source) && sources.indexOf(source) === index);
}

function statsSourceIdFromValue(value: string | undefined): StatsSourceId {
    if (value === 'jpdb' || value === 'anki' || value === 'combined') return value;
    return 'combined';
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

function pointerPointFromEvent(event: MouseEvent): PointerPoint | null {
    const point = { x: event.clientX, y: event.clientY };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

function nearestElementByPoint(elements: HTMLElement[], point: PointerPoint): HTMLElement | null {
    let nearest: HTMLElement | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const element of elements) {
        const distance = squaredDistanceToVisibleElement(element, point);
        if (distance === null || distance >= nearestDistance) continue;
        nearest = element;
        nearestDistance = distance;
    }
    return nearest;
}

function squaredDistanceToVisibleElement(element: HTMLElement, point: PointerPoint): number | null {
    const rect = element.getBoundingClientRect();
    if (!hasVisibleArea(rect)) return null;
    const dx = distanceOutsideRange(point.x, rect.left, rect.right);
    const dy = distanceOutsideRange(point.y, rect.top, rect.bottom);
    return dx * dx + dy * dy;
}

function hasVisibleArea(rect: Pick<DOMRect, 'width' | 'height'>): boolean {
    return rect.width > 0 && rect.height > 0;
}

function distanceOutsideRange(value: number, min: number, max: number): number {
    if (value < min) return min - value;
    if (value > max) return value - max;
    return 0;
}

function pointInElementClientRects(clientX: number, clientY: number, element: HTMLElement): boolean {
    return Array.from(element.getClientRects()).some(rect => (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
    ));
}

function consumeNestedLookupEvent(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
}

function setOptionalText(element: HTMLElement | null, text: string): void {
    if (element) element.textContent = text;
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeoutId = 0;
    const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([
        promise,
        timeout,
    ]).finally(() => window.clearTimeout(timeoutId));
}

function isQueuedNewTabGrade(value: unknown): value is QueuedNewTabGrade {
    if (!isObjectRecord(value)) return false;
    const record = value as Partial<QueuedNewTabGrade>;
    return hasQueuedGradeIdentity(record)
        && hasQueuedGradeTarget(record)
        && isJpdbGrade(record.grade)
        && hasQueuedGradePayload(record);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function hasQueuedGradeIdentity(record: Partial<QueuedNewTabGrade>): boolean {
    return typeof record.id === 'string'
        && typeof record.at === 'number';
}

function hasQueuedGradeTarget(record: Partial<QueuedNewTabGrade>): boolean {
    return record.target === 'anki' || record.target === 'jpdb-api' || record.target === 'jiten-api';
}

function hasQueuedGradePayload(record: Partial<QueuedNewTabGrade>): boolean {
    return isObjectRecord(record.card) && typeof record.attempts === 'number';
}

function isJpdbGrade(value: unknown): value is JPDBGrade {
    return value === 'nothing'
        || value === 'something'
        || value === 'hard'
        || value === 'okay'
        || value === 'easy'
        || value === 'fail'
        || value === 'pass';
}

function isNewTabStudyInteractiveTarget(target: HTMLElement): boolean {
    return Boolean(target.closest(NEW_TAB_STUDY_INTERACTIVE_SELECTOR));
}

function isNewTabStudyKeyboardMode(mode: string): boolean {
    return mode === 'word' || mode === 'kanji';
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

function hasYomuRuntime(): boolean {
    const runtime = globalThis as { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown; __yomuReaderAppInitialized?: unknown };
    return hasDirectYomuRuntime(runtime) || hasPageYomuRuntime(runtime, yomuRuntimeOwnerMarker());
}

function hasDirectYomuRuntime(runtime: { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown }): boolean {
    return Boolean(runtime.GM_info || runtime.__YOMU_READER_RUNTIME__);
}

function hasPageYomuRuntime(runtime: { __yomuReaderAppInitialized?: unknown }, marker: HTMLElement | null): boolean {
    return Boolean(runtime.__yomuReaderAppInitialized && marker?.dataset.yomuRuntimeKind);
}

function yomuRuntimeOwnerMarker(): HTMLElement | null {
    return typeof document !== 'undefined'
        ? document.getElementById('jpdb-reader-runtime-owner') as HTMLElement | null
        : null;
}

function normalizePromptContextSentence(value: string | undefined, card: JPDBCard): string {
    const sentence = value?.replace(/\s+/g, ' ').trim() ?? '';
    return isPromptContextSentence(sentence, card) ? sentence : '';
}

function isPromptContextSentence(sentence: string, card: JPDBCard): boolean {
    if (!queryHasJapanese(sentence)) return false;
    const normalized = normalizedPromptSentenceText(sentence);
    const identities = newTabCardHighlightTargets(card)
        .map(normalizedPromptSentenceText)
        .filter(Boolean);
    return Boolean(normalized) && !identities.includes(normalized);
}

function normalizedPromptSentenceText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

// jpdb.io Learn parity: deck entries show progress ("961 / 2302 · 40%" known
// coverage) when the API provides it.
function deckOptionLabel(deck: { name: string; vocabularyCount?: number; knownCoverage?: number }): string {
    const parts: string[] = [];
    if (typeof deck.vocabularyCount === 'number') parts.push(`${deck.vocabularyCount}`);
    if (typeof deck.knownCoverage === 'number') parts.push(`${Math.round(deck.knownCoverage)}%`);
    return parts.length ? `${deck.name} · ${parts.join(' · ')}` : deck.name;
}

function jpdbExampleSentenceForPrompt(info: JpdbVocabularyInfo | null, card: JPDBCard): string {
    const examples = info?.examples ?? [];
    return examples
        .map(example => normalizePromptContextSentence(example.sentence, card))
        .find(Boolean) ?? '';
}

function newSearchUrl(query: string): URL | null {
    try {
        const url = new URL(location.href);
        url.searchParams.delete('query');
        url.searchParams.delete('search');
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        if (/[#&]card=/u.test(url.hash)) url.hash = '';
        return url;
    } catch {
        return null;
    }
}

function sentencePromptTarget(card: JPDBCard, sentence: string): string {
    const reading = newTabCardOptionalReading(card);
    if (sentence.includes(card.spelling)) return card.spelling;
    return reading && sentence.includes(reading) ? reading : '';
}

// The review URL's c= parameter ('vf,<vid>,<sid>') rides on the bridge card
// id; real ids let the API read the card's post-grade state back.
function liveJpdbCardIds(card: JpdbReviewBridgeCard): { vid: number; sid: number } {
    const match = /^v[a-z]?,(\d+),(\d+)$/.exec(card.id ?? '');
    if (!match) return { vid: 0, sid: 0 };
    return { vid: Number(match[1]), sid: Number(match[2]) };
}

function liveJpdbCardFromBridgeCard(card: JpdbReviewBridgeCard, spelling: string): JPDBCard {
    const ids = liveJpdbCardIds(card);
    return {
        vid: ids.vid,
        sid: ids.sid,
        rid: 0,
        spelling,
        reading: liveJpdbCardReading(card, spelling),
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{
            glosses: liveJpdbCardGlosses(card),
            partOfSpeech: [],
        }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: liveJpdbCardSentence(card),
        reviewSource: 'jpdb-live',
        jpdbReviewId: card.id,
        kanjiKeyword: liveJpdbCardKeyword(card),
        jpdbDeckMembership: card.deckMembership,
    };
}

function liveJpdbCardReading(card: JpdbReviewBridgeCard, spelling: string): string {
    return normalizedJapaneseCardReading(spelling, card.reading || spelling);
}

function liveJpdbCardGlosses(card: JpdbReviewBridgeCard): string[] {
    return card.kind === 'kanji' ? [liveJpdbCardKeyword(card)].filter(Boolean) : [];
}

function liveJpdbCardSentence(card: JpdbReviewBridgeCard): string {
    return card.sentence || card.prompt;
}

function liveJpdbCardKeyword(card: JpdbReviewBridgeCard): string {
    return card.keyword || card.prompt;
}

function firstNonEmptyPitch(promises: Promise<string[]>[]): Promise<string[]> {
    if (!promises.length) return Promise.resolve([]);
    return new Promise(resolve => {
        let pending = promises.length;
        let settled = false;
        const finishEmpty = (): void => {
            pending -= 1;
            if (!settled && pending <= 0) {
                settled = true;
                resolve([]);
            }
        };
        promises.forEach(promise => {
            promise.then(pitch => {
                if (settled) return;
                if (pitch.length) {
                    settled = true;
                    resolve(pitch);
                    return;
                }
                finishEmpty();
            }).catch(() => finishEmpty());
        });
    });
}

function delayWithValue<T>(value: T, ms: number): Promise<T> {
    return new Promise(resolve => window.setTimeout(() => resolve(value), ms));
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

function uniqueNewTabImmersionAudioCandidates(values: string[]): string[] {
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const value of values) {
        const url = value.trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        candidates.push(url);
    }
    return candidates;
}
