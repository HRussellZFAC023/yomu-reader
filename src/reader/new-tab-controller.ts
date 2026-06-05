import { primaryCardState } from './card-state';
import { copyText } from './browser-ui';
import type { CardRenderData } from './card-render-data';
import { isCardHighlightWord, normalizedJapaneseCardReading } from './card-highlight';
import { pruneOldestCacheEntries } from './cache-utils';
import { ANKI_SOURCE_ID, APP_NAME, DOCS_BASE_URL, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from './constants';
import { escapeHtml, htmlToFirstElement, setInnerHtml } from './dom';
import { el, fragment, replaceChildrenWith } from './dom-builder';
import { isImmersionKitRateLimitError, type ImmersionKitClient, type ImmersionKitExample, type ImmersionKitSearchOptions } from './immersion-kit';
import { localizedImmersionSourceTitle } from './immersion-labels';
import { waitForIdle as waitForBrowserIdle } from './idle';
import type { AnkiExistingNote, AnkiLookupResult } from './anki';
import {
    IMMERSION_FALLBACK_QUERY_LIMIT,
    immersionFallbackFragments,
    isUsefulImmersionFallbackQuery,
    uniqueImmersionQueries,
} from './immersion-query';
import { runLimited } from './async-utils';
import type { JpdbClient } from './jpdb';
import { jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { getPitchClass } from './jpdb-parser';
import type { JpdbPublicPitchClient } from './jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from './jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph } from './kanji-origin';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT, type DoodleStroke } from './kanji-doodle';
import { renderAnkiExistingSection, renderAnkiRenderedCardStudyBody } from './anki-render';
import { assessKanjiStrokes, rankKanjiStrokeCandidates, type KanjiShapeCandidate, type KanjiStrokeAssessment } from './kanji-stroke-grader';
import type { KanjiVGClient, KanjiVGInfo } from './kanjivg';
import { formatLookupUrl } from './local-dictionary-display';
import type { JpdbReviewBridgeCard, JpdbReviewBridgeClient, JpdbReviewBridgeStatus } from './jpdb-review-bridge';
import { Logger } from './logger';
import { groupTermEntriesByDictionary } from './local-dictionary-groups';
import { canAttemptAudiblePlayback } from './media-activation';
import { speakerIcon } from './icons';
import { installOriginGraphInteractions } from './origin-graph-interactions';
import { localPitchPatternFromMeta } from './pitch-meta';
import {
    buildRtkComponentSummaries,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderPitch,
    renderRtkInfo,
} from './popup-render';
import { kanjiSourceStateKey, renderJpdbDefinitionSource, renderKanjiDefinitions, renderLocalDefinitionSourcesSection, renderSimilarKanjiWordsContent } from './definition-source-render';
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
} from './new-tab';
import {
    decodeNewTabImmersionImage,
    newTabImmersionAudioUrls,
    newTabImmersionImageUrl,
    newTabImmersionProviderLabel,
    renderNewTabFrontSentence,
    renderNewTabImmersionImage,
    renderNewTabImmersionSentence,
    renderNewTabImmersionTranslation,
    renderNewTabSentenceHtml,
    setNewTabImmersionTranslationBlurred,
    syncNewTabImmersionFrameSubtitleSize,
} from './new-tab-card-view';
import { renderNewTabKanjiInfoSection } from './new-tab-kanji-render';
import {
    appendNewTabLoadResult,
    autoReviewSourceResults,
    emptyNewTabLoadAccumulator,
    emptyNewTabLoadResult,
    interleavedNewTabLoadAccumulator,
    mergeDedupeCardMetadata,
    mergeEmptyNewTabLoadResults,
    newTabLoadAccumulatorFromResult,
    newTabLoadResult,
    type NewTabLoadAccumulator,
    type NewTabLoadResult,
} from './new-tab-source-orchestrator';
import {
    newTabCardHighlightTargets,
    newTabCardOptionalReading,
    newTabCardReading,
    normalizeNewTabCard,
    promoteCardByKey,
    selectNewTabStudyPool,
    sentenceForCard,
} from './new-tab-study-queue';
import {
    ankiCardKindLabel,
    ankiReviewSourceLabel,
    isLockedJpdbReviewCard,
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
} from './new-tab-review-targets';
import { uniqueTrimmedStrings as uniqueStrings } from './string-utils';
import {
    applyJpdbReviewImport,
    averageReviewSpeed,
    combineStatsSources,
    dailyActivityStreakAt,
    emptyStatsDashboardSnapshot,
    emptyStatsSource,
    estimatedDueMinutes,
    formatCompactNumber,
    formatPercent,
    loadAnkiConnectStats,
    monthlyActivityHeatmaps,
    parseJpdbReviewExportText,
    recentDailyPoints,
    statsActivityMetricTotal,
    statsActivityMetricValue,
    statsCardSegments,
    statsSourceForId,
    statsFromJpdbCards,
    type JpdbReviewImport,
    type StatsActivityMetric,
    type StatsDailyPoint,
    type StatsDashboardSnapshot,
    type StatsSourceId,
    type StatsSourceSnapshot,
} from './stats';
import { jpdbFirstParseOptions, type ReaderParser } from './reader-parser';
import type { CardState, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import type { RtkClient, RtkInfo } from './rtk';
import { gmStorageDelete, gmStorageGet, gmStorageSet } from './storage';
import { nextExplicitUiLanguage, resolveUiLanguage, uiText, type UiCopyKey } from './i18n';
import { isNewTabCopyKey, newTabText, type NewTabCopyKey } from './newtab-i18n';
import { NEW_TAB_CACHE_KEY } from './new-tab-cache';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_SIMILAR_WORDS_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    KANJI_UCHISEN_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    kanjiSourceLabel,
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
} from './source-sections';
import type { CardNavigationMode, PopupNavigationEntry } from './popup-navigation';
import { DEFAULT_OVERLAY_BACKGROUND_COLOR, JISHO_LOOKUP_LINK, JPDB_LOOKUP_LINK } from './settings';
import { installUchisenCarousel, loadUchisenData, type UchisenData } from './uchisen';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from './yomitan';

export { selectNewTabStudyPool } from './new-tab-study-queue';

const NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS = 1_200;
const NEW_TAB_IMMERSION_EXAMPLE_LIMIT = 6;
const NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT = 48;
const NEW_TAB_IMMERSION_LOAD_TIMEOUT_GRACE_MS = 1_000;
const NEW_TAB_IMMERSION_PREFETCH_LOOKAHEAD = 1;
const NEW_TAB_WORD_PITCH_LOCAL_GRACE_MS = 120;
const NEW_TAB_WORD_PITCH_LOCAL_TIMEOUT_MS = 2_500;
const NEW_TAB_PARSED_SENTENCE_CACHE_LIMIT = 160;
type NewTabTextKey = UiCopyKey | NewTabCopyKey;
const SEARCH_CARD_STATE_LABEL_KEYS: Record<string, UiCopyKey> = {
    new: 'stateNew',
    learning: 'stateLearning',
    known: 'stateKnown',
    due: 'stateDue',
    failed: 'stateFailed',
    locked: 'stateLocked',
    'never-forget': 'stateNeverForget',
    blacklisted: 'stateBlacklisted',
    suspended: 'stateSuspended',
    'in-deck': 'stateInDeck',
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
};

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

interface ParsedNewTabSentenceCacheEntry {
    promise: Promise<JPDBToken[]>;
    tokens?: JPDBToken[];
}

function newTabShortParseOptions(): NewTabParseContentOptions {
    return { jpdbTimeoutMs: NEW_TAB_IMMERSION_PARSE_TIMEOUT_MS };
}

function shouldCacheParsedNewTabSentenceTokens(tokens: JPDBToken[]): boolean {
    return !tokens.length || tokens.some(token => token.card.source !== 'fallback');
}

function searchCardStateLabel(state: string, language: ReaderSettings['interfaceLanguage']): string {
    const key = SEARCH_CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : state.replace(/-/g, ' ');
}

export interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    anki: {
        listNewTabCards: (limit?: number) => Promise<JPDBCard[]>;
        answerCard: (cardId: number, grade: JPDBGrade) => Promise<void>;
        findExistingCards?: (card: JPDBCard) => Promise<AnkiLookupResult>;
        invoke: <T>(action: string, params?: Record<string, unknown>) => Promise<T>;
        requestPermission: () => Promise<unknown>;
    };
    jpdb: JpdbClient;
    jpdbKanji: JpdbKanjiClient;
    kanjiVG: KanjiVGClient;
    rtk: RtkClient;
    immersionKit: ImmersionKitClient;
    jpdbVocabulary?: Pick<JpdbVocabularyClient, 'lookup'> & Partial<Pick<JpdbVocabularyClient, 'search'>>;
    jpdbPublicPitch?: Pick<JpdbPublicPitchClient, 'lookup'>;
    jpdbReviewBridge: JpdbReviewBridgeClient;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    lookupText?: (text: string, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    lookupDictionaryReference?: (query: string, reading: string, sourceDictionary: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    showLookupCard?: (card: JPDBCard, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    showKanjiCard?: (card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement, options?: NewTabLookupDependencyOptions) => Promise<void> | void;
    loadCardRenderData?: (card: JPDBCard) => Promise<CardRenderData>;
    renderSearchDefinitionSources?: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null) => string;
    renderSearchWordPills?: (card: JPDBCard, metaEntries: YomitanMetaEntry[]) => string;
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
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

function renderSearchHandwritingPanel(language: ReaderSettings['interfaceLanguage']): HTMLElement {
    return el('details', { id: 'jpdb-reader-newtab-handwriting', class: 'jpdb-reader-newtab-handwriting', dataset: { newtabHandwriting: true } },
        el('summary', {}, newTabText(language, 'drawKanji')),
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
        class: 'jpdb-reader-newtab-handwriting-manual-action',
        type: 'button',
        dataset: { newtabAction: 'search-focus' },
    }, newTabText(language, 'typeOrPasteKanji'));
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

const NEW_TAB_WORD_STATE_CLASSES: CardState[] = [
    'new',
    'learning',
    'known',
    'due',
    'failed',
    'locked',
    'never-forget',
    'blacklisted',
    'suspended',
    'in-deck',
    'not-in-deck',
    'redundant',
];

function newTabKanjiKeyword(card: JPDBCard, fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null, localMeanings: string[]): string {
    return fullInfo?.keyword || rtk?.keyword || card.kanjiKeyword || localMeanings[0] || '';
}

function fallbackSearchKanjiCard(kanji: string): JPDBCard {
    return {
        vid: stableNegativeNewTabId(`kanji:${kanji}`),
        sid: 0,
        rid: 0,
        spelling: kanji,
        reading: kanji,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
        sentence: kanji,
    };
}

function dictionaryKanjiStudyCard(kanji: string): JPDBCard {
    return {
        vid: stableNegativeNewTabId(`dictionary-kanji:${kanji}`),
        sid: 0,
        rid: 0,
        spelling: kanji,
        reading: kanji,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
        reviewSource: 'dictionary',
        sentence: kanji,
    };
}

function oldFormsFact(fullInfo: JpdbKanjiInfo | null): string {
    return fullInfo?.oldForms.length ? fullInfo.oldForms.join(', ') : '';
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

type ConcreteNewTabWordSource = Exclude<ReaderSettings['newTabSource'], 'auto'>;
type NavigationExpansionSource = 'dictionary' | 'jpdb' | 'public-jpdb' | 'anki';

interface KanjiDetailBundle {
    jpdb: JpdbKanjiInfo | null;
    rtk: RtkInfo | null;
    vg: KanjiVGInfo | null;
    local: YomitanKanjiEntry[];
    similar: YomitanTermEntry[];
}

interface KanjiDetailCacheEntry {
    details?: Promise<KanjiDetailBundle>;
    detailsSignature?: string;
    jpdb?: Promise<JpdbKanjiInfo | null>;
    rtk?: Promise<RtkInfo | null>;
    vg?: Promise<KanjiVGInfo | null>;
    local?: Promise<YomitanKanjiEntry[]>;
    similar?: Promise<YomitanTermEntry[]>;
}

interface KanjiPromptKeyword {
    source: string;
    text: string;
}

interface NewTabStudySlots {
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

export interface NewTabLookupReviewTarget {
    id: string;
    kind: 'jpdb' | 'anki';
    label: string;
    shortLabel: string;
    ankiCardId?: number;
}

export interface NewTabLookupReviewTargetSelection {
    kind: 'jpdb' | 'anki';
    ankiCardId?: number;
}

interface NewTabMainGradeTargetOption {
    id: string;
    kind: 'both' | 'jpdb' | 'anki';
    label: string;
    shortLabel: string;
    ankiCardId?: number;
}

interface NewTabReviewSourceSummary {
    targets: NewTabReviewTarget[];
    hasJpdb: boolean;
    hasAnki: boolean;
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

interface NewTabSearchKanjiResult {
    character: string;
    keyword: string;
    readings: string[];
    meanings: string[];
    words: JPDBCard[];
}

interface NewTabSearchSuggestion {
    query: string;
    reading: string;
    meaning: string;
}

interface NewTabSearchWordDetail {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup?: CardRenderData['ankiLookup'];
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
    wordKanjiDetails?: NewTabSearchWordKanjiDetail[];
    wordKanjiLoading?: boolean;
    loading?: boolean;
}

interface NewTabSearchWordKanjiDetail {
    kanji: string;
    details: KanjiDetailBundle;
    similarEntriesLoaded: boolean;
}

const log = Logger.scope('NewTab');
const SESSION_WORD_KEY = 'jpdb-reader-newtab-current-word';
const JPDB_ALL_DECKS = 'all';
const JPDB_DECK_SAMPLE_LIMIT = 6;
const NEW_TAB_WORD_LIMIT = 180;
const NEW_TAB_FALLBACK_SUPPLEMENT_MIN = 12;
const NEW_TAB_DICTIONARY_FALLBACK_RANKS = [2000, 6000] as const;
const NEW_TAB_NAVIGATION_DEDUPE_MS = 550;
const NEW_TAB_SEARCH_DEBOUNCE_MS = 220;
const NEW_TAB_SEARCH_WORD_LIMIT = 10;
const NEW_TAB_SEARCH_KANJI_LIMIT = 6;
const NEW_TAB_SEARCH_SUGGESTION_LIMIT = 6;
const NEW_TAB_LOCAL_SEARCH_CANDIDATE_LIMIT = 96;
const NEW_TAB_LOCAL_SEARCH_INDEX_MAX_ROWS = 2500;
const NEW_TAB_LOCAL_SEARCH_INDEX_MAX_MS = 90;
const NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_ROWS = 4000;
const NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_MS = 80;
const NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS = 450;
const NEW_TAB_PUBLIC_SEARCH_TIMEOUT_MS = 2500;
const NEW_TAB_PUBLIC_JPDB_LOCAL_SEED_LIMIT = 24;
const NEW_TAB_PUBLIC_JPDB_KANJI_SEED_LIMIT = 8;
const NEW_TAB_PUBLIC_JPDB_KANJI_FALLBACK_LIMIT = 5;
const NEW_TAB_PUBLIC_JPDB_WORD_SEED_LIMIT = 12;
const NEW_TAB_PUBLIC_JPDB_WORD_FALLBACK_LIMIT = 2;
const NEW_TAB_PUBLIC_JPDB_MIN_WORD_LENGTH = 2;
const NEW_TAB_PUBLIC_JPDB_CONCURRENCY = 4;
const NEW_TAB_DICTIONARY_RANDOM_MAX_ROWS = 16000;
const NEW_TAB_DICTIONARY_RANDOM_MAX_MS = 180;
const NEW_TAB_DICTIONARY_TOP_MAX_ROWS = 22000;
const NEW_TAB_DICTIONARY_TOP_MAX_MS = 240;
const NEW_TAB_DICTIONARY_PRESENCE_TIMEOUT_MS = 500;
const NEW_TAB_KANJI_FRONT_KEYWORD_LIMIT = 3;
const NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS = 8_000;
const NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS = 3_000;
const NEW_TAB_PUBLIC_FALLBACK_GRACE_MS = 900;
const NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS = 2_500;
const NEW_TAB_LIVE_REVIEW_STALE_MS = 1_500;
const NEW_TAB_HANDWRITING_DEBOUNCE_MS = 360;
const NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT = 240;
const NEW_TAB_HANDWRITING_GOOGLE_URL = 'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';
const NEW_TAB_HANDWRITING_COMMON_KANJI =
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄光入全公六共内円写冬出分切前力加動北十千午半南原反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        + '以衣医右雨運英映泳園遠王央横屋温化荷界開階寒感漢館岸起期客急級宮球究去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始姉指歯詩次事持式実写者主守酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対代第題炭短談着注柱丁帳調追定庭笛鉄転都度登島湯等豆動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和';
// Curated everyday vocabulary used to seed public-JPDB study words when there is
// no API key and no local dictionary, so the fallback starts with real words.
const NEW_TAB_PUBLIC_JPDB_COMMON_WORDS = [
    '時間', '世界', '日本語', '今日', '明日', '言葉', '友達', '家族', '勉強', '学校',
    '先生', '学生', '会社', '仕事', '電車', '料理', '食事', '音楽', '映画', '天気',
    '元気', '簡単', '大丈夫', '一緒', '大切', '自分', '問題', '生活', '場所', '理由',
    '練習', '説明', '質問', '意味', '経験', '準備', '約束', '連絡', '部屋', '旅行',
    '写真', '名前', '電話', '病院', '買い物', '食べ物', '飲み物',
];
const NEW_TAB_HEADER_LABEL = 'yomu';
const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
const NEW_TAB_GRADE_QUEUE_LIMIT = 200;
const NEW_TAB_STATS_JPDB_HISTORY_KEY = 'jpdb-reader-newtab-jpdb-stats-history';
const NEW_TAB_STATS_DISABLED_ANKI_DECKS_KEY = 'jpdb-reader-newtab-disabled-anki-decks';
const NEW_TAB_STATS_JPDB_CARD_LIMIT = 2_000;
const NEW_TAB_STUDY_INTERACTIVE_SELECTOR = [
    '.jpdb-reader-word',
    '.jpdb-reader-doodle-stage',
    '.jpdb-reader-newtab-answer',
    '.jpdb-reader-newtab-meaning',
    '[data-action]',
    '[data-immersion-action]',
    'a',
    'audio',
    'button',
    'canvas',
    'details',
    'form',
    'input',
    'select',
    'summary',
    'textarea',
    'video',
    '[contenteditable="true"]',
].join(',');

function newTabRouteMode(): NewTabMode | null {
    try {
        const url = new URL(location.href);
        const mode = url.searchParams.get('mode') || url.searchParams.get('view') || url.hash.replace(/^#/u, '');
        return mode === 'stats' || mode === 'search' || mode === 'kanji' || mode === 'word' ? mode : null;
    } catch {
        return null;
    }
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
    private parsedSentenceCache = new Map<string, ParsedNewTabSentenceCacheEntry>();
    private wordPitchCache = new Map<string, Promise<string[]>>();
    private doodlePreviewCache = new Map<string, string>();
    private immersionPrefetchGeneration = 0;
    private immersionAudio?: HTMLAudioElement;
    private immersionAudioKey = '';
    private immersionAudioRequestId = 0;
    private reviewCountMode = false;
    private emptyLoadMessageKey: NewTabTextKey | null = null;
    private loadGeneration = 0;
    private sourceSwitchGeneration = 0;
    private searchGeneration = 0;
    private searchDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchQuery = '';
    private searchActiveSuggestionIndex = -1;
    private searchWordCardCache = new Map<string, JPDBCard>();
    private searchHandwritingStrokes: DoodleStroke[] = [];
    private searchHandwritingGeneration = 0;
    private searchHandwritingDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchHandwritingShapeCandidateCache = new Map<string, Promise<KanjiShapeCandidate | null>>();
    private rootEventController: AbortController | undefined;
    private lastPointerNavigation: { action: 'next' | 'previous'; time: number } | null = null;
    private navigationGeneration = 0;
    private navigationSupplementPromise: Promise<void> | null = null;
    private statsSnapshot: StatsDashboardSnapshot = emptyStatsDashboardSnapshot();
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
        this.state = {
            ...saved,
            ...(routeMode ? { mode: routeMode } : {}),
            source: this.effectiveNewTabSourceFromSettings(dependencies.getSettings()),
        };
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
        if (root.dataset.newtabBound !== 'true') {
            this.bindRootEvents(root);
            root.dataset.newtabBound = 'true';
        }

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

    lookupGradeTargetLabel(card: JPDBCard): string {
        return this.isCurrentLookupGradeCard(card) ? this.gradeTargetLabel(card) : '';
    }

    async gradeFromLookup(grade: JPDBGrade, target?: NewTabLookupReviewTargetSelection): Promise<{ preserveLookup: boolean }> {
        await this.gradeCurrentCard(grade, target);
        return { preserveLookup: Boolean(target) };
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
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'word' } }, uiText(language, 'word')),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' } }, uiText(language, 'kanji')),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'search' } }, uiText(language, 'search')),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'stats' } }, newTabText(language, 'stats')),
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
                                el('button', { type: 'button', role: 'menuitem', dataset: { newtabAction: 'settings' } }, uiText(language, 'settings')),
                            ),
                        ),
                    ),
                ),
                el('section', { class: 'jpdb-reader-newtab-study', dataset: { newtabStudy: true }, 'aria-live': 'polite' },
                    el('div', { class: 'jpdb-reader-newtab-count', dataset: { newtabCount: true } }, '0 / 0'),
                    el('h1', { class: 'jpdb-reader-newtab-prompt', dataset: { newtabPrompt: true }, lang: 'ja' }, APP_NAME),
                    el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                        el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                        el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                    ),
                    el('button', { class: 'jpdb-reader-newtab-status', type: 'button', dataset: { newtabStatus: true }, disabled: true }, uiText(language, 'loading')),
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
                            el('button', { type: 'submit', dataset: { newtabAction: 'search-submit' } }, uiText(language, 'search')),
                            el('button', {
                                type: 'button',
                                dataset: { newtabAction: 'search-handwriting-toggle' },
                                'aria-controls': 'jpdb-reader-newtab-handwriting',
                                'aria-expanded': 'false',
                            }, newTabText(language, 'draw')),
                            el('button', { type: 'button', dataset: { newtabAction: 'search-clear' }, 'aria-label': newTabText(language, 'clearSearch') }, uiText(language, 'clear')),
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
            const dropzone = eventTargetElement(event.target)?.closest<HTMLElement>('[data-stats-dropzone]');
            if (!dropzone || !root.contains(dropzone)) return;
            event.preventDefault();
            dropzone.dataset.dragging = 'true';
        }, { signal: controller.signal });

        root.addEventListener('dragleave', event => {
            const dropzone = eventTargetElement(event.target)?.closest<HTMLElement>('[data-stats-dropzone]');
            if (!dropzone || !root.contains(dropzone)) return;
            dropzone.dataset.dragging = 'false';
        }, { signal: controller.signal });

        root.addEventListener('drop', event => {
            const dropzone = eventTargetElement(event.target)?.closest<HTMLElement>('[data-stats-dropzone]');
            if (!dropzone || !root.contains(dropzone)) return;
            event.preventDefault();
            dropzone.dataset.dragging = 'false';
            const file = event.dataTransfer?.files?.[0];
            if (file) void this.importJpdbStatsFile(root, file);
        }, { signal: controller.signal });

        root.addEventListener('keydown', event => {
            if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
            const target = event.target as HTMLElement | null;
            if (target && (event.key === ' ' || event.key === 'Enter')) {
                const translation = target.closest<HTMLElement>('.jpdb-reader-example-translation');
                if (translation && root.contains(translation)) {
                    event.preventDefault();
                    this.toggleNewTabImmersionTranslations(root);
                    return;
                }
            }
            if (this.state.mode === 'search') {
                if (this.handleSearchKeydown(root, event, target)) return;
                return;
            }
            if (target && isNewTabStudyInteractiveTarget(target)) return;
            if (event.key === 'ArrowRight' || event.key === 'n') {
                event.preventDefault();
                this.showNextWord();
                return;
            }
            if (event.key === 'ArrowLeft' || event.key === 'p') {
                event.preventDefault();
                this.showPreviousWord();
                return;
            }
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                this.toggleReveal(root);
            }
        }, { signal: controller.signal });

        const syncQueuedGrades = () => { void this.flushQueuedGrades(); };
        window.addEventListener('online', syncQueuedGrades, { signal: controller.signal });
        window.addEventListener('focus', syncQueuedGrades, { signal: controller.signal });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) syncQueuedGrades();
        }, { signal: controller.signal });
        this.rootEventController = controller;
    }

    private handleRootClick(root: HTMLElement, event: MouseEvent): void {
        const target = eventTargetElement(event.target);
        if (!target) return;
        if (this.handleNestedLookupClick(root, target, event)) return;
        const action = target.closest<HTMLElement>('[data-newtab-action]')?.dataset.newtabAction;
        if (this.handleRootImmersionClick(root, target, event)) return;
        if (action) target.closest<HTMLDetailsElement>('.jpdb-reader-newtab-more')?.removeAttribute('open');
        if (this.handleRootUtilityClick(root, event, action)) return;
        if (this.handleStatsClick(root, target, event, action)) return;
        if (this.handleSearchClick(root, target, event, action)) return;
        if (this.handleRootModeClick(root, target, event, action)) return;
        if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
        if (this.handleRootStudyActionClick(root, target, event, action)) return;
        this.handleStudyCardClick(root, target, event);
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
            this.performNewTabImmersionAction(root, immersionAction);
            return true;
        }
        return false;
    }

    private handleRootUtilityClick(root: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        if (action === 'settings') {
            event.preventDefault();
            this.dependencies.showSettings('jpdb');
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
            const source = target.closest<HTMLElement>('[data-source-toggle-target]')?.dataset.sourceToggleTarget;
            if (source === 'jpdb' || source === 'anki' || source === 'dictionary') void this.switchReviewSource(root, source);
            return true;
        }
        return false;
    }

    private handleRootStudyActionClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        if (action === 'next') {
            event.preventDefault();
            if (!this.acceptPointerNavigation('next', event)) return true;
            this.showNextWord();
            return true;
        }
        if (action === 'skip') {
            event.preventDefault();
            if (!this.acceptPointerNavigation('next', event)) return true;
            this.showNextWord();
            return true;
        }
        if (action === 'previous') {
            event.preventDefault();
            if (!this.acceptPointerNavigation('previous', event)) return true;
            this.showPreviousWord();
            return true;
        }
        if (action === 'reveal') {
            event.preventDefault();
            this.toggleReveal(root);
            return true;
        }
        if (action === 'grade') {
            event.preventDefault();
            const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
            if (grade) void this.gradeCurrentCard(grade, this.selectedMainGradeTarget(root));
            return true;
        }
        if (action === 'jpdb-kanji-action') {
            event.preventDefault();
            const actionId = target.closest<HTMLElement>('[data-kanji-action-id]')?.dataset.kanjiActionId ?? '';
            void this.performJpdbKanjiAction(root, actionId);
            return true;
        }
        return false;
    }

    private handleStudyCardClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): void {
        if (this.state.mode === 'search') return;
        const study = target.closest<HTMLElement>('[data-newtab-study]');
        if (study && !isNewTabStudyInteractiveTarget(target)) {
            event.preventDefault();
            this.toggleReveal(root);
        }
    }

    private handleStatsClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        const chartDayTarget = action ? null : this.nearestStatsChartDayTarget(root, target, event);
        const resolvedAction = action ?? chartDayTarget?.dataset.newtabAction;
        if (!resolvedAction?.startsWith('stats-')) return false;
        event.preventDefault();
        if (resolvedAction === 'stats-source') {
            const source = target.closest<HTMLElement>('[data-stats-source]')?.dataset.statsSource;
            this.statsSelectedSource = source === 'jpdb' || source === 'anki' || source === 'combined' ? source : 'combined';
            this.renderStats(root);
            return true;
        }
        if (resolvedAction === 'stats-activity-metric') {
            const metric = target.closest<HTMLElement>('[data-stats-activity-metric]')?.dataset.statsActivityMetric;
            this.statsActivityMetric = this.normalizeStatsActivityMetric(metric);
            this.renderStats(root);
            return true;
        }
        if (resolvedAction === 'stats-select-day') {
            const date = target.closest<HTMLElement>('[data-stats-day]')?.dataset.statsDay ?? chartDayTarget?.dataset.statsDay;
            if (this.isStatsDateKey(date)) {
                this.statsSelectedDate = date;
                this.renderStats(root);
            }
            return true;
        }
        if (resolvedAction === 'stats-study-trouble') {
            this.studyStatsTroubleCards(root);
            return true;
        }
        if (resolvedAction === 'stats-refresh') {
            void this.loadStatsInto(root, true);
            return true;
        }
        if (resolvedAction === 'stats-toggle-anki-deck') {
            this.toggleStatsAnkiDeck(root, target);
            return true;
        }
        if (resolvedAction === 'stats-connect-anki') {
            void this.connectAnkiStats(root);
            return true;
        }
        if (resolvedAction === 'stats-open-jpdb-settings') {
            this.dependencies.showSettings('jpdb');
            return true;
        }
        if (resolvedAction === 'stats-open-anki-settings') {
            this.dependencies.showSettings('mining');
            return true;
        }
        if (resolvedAction === 'stats-import-jpdb') {
            root.querySelector<HTMLInputElement>('[data-stats-jpdb-file]')?.click();
            return true;
        }
        return false;
    }

    private nearestStatsChartDayTarget(root: HTMLElement, target: HTMLElement, event: MouseEvent): HTMLElement | null {
        if (!this.hasCoarsePointer()) return null;
        const chart = target.closest<HTMLElement>('.jpdb-reader-stats-bars, .jpdb-reader-stats-heatmap-grid');
        if (!chart || !root.contains(chart)) return null;
        const days = Array.from(chart.querySelectorAll<HTMLElement>('[data-newtab-action="stats-select-day"][data-stats-day]'));
        if (!days.length) return null;
        const x = event.clientX;
        const y = event.clientY;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        let nearest: HTMLElement | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const day of days) {
            const rect = day.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
            const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
            const distance = dx * dx + dy * dy;
            if (distance < nearestDistance) {
                nearest = day;
                nearestDistance = distance;
            }
        }
        return nearest;
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
        const word = this.parsedWordLookupTarget(root, target, event);
        if (!word) return false;
        const expression = cleanNestedLookupValue(word.dataset.expression) || cleanNestedLookupValue(readerWordSurfaceText(word));
        if (!expression) return false;
        const reading = cleanNestedLookupValue(word.dataset.reading) || expression;
        const sentence = word.dataset.sentence || expression;
        const card = this.cachedCardForRenderedWord(word);
        consumeNestedLookupEvent(event);
        if (this.state.mode === 'search') {
            this.selectSearchSuggestion(root, expression);
            return true;
        }
        if (card && this.dependencies.showLookupCard) {
            void this.dependencies.showLookupCard(card, sentence, word, this.nestedLookupOptions());
            return true;
        }
        void this.dependencies.lookupText?.(expression, reading, word, this.nestedLookupOptions());
        return true;
    }

    private parsedWordLookupTarget(root: HTMLElement, target: HTMLElement, event: MouseEvent): HTMLElement | null {
        const direct = target.closest<HTMLElement>('.jpdb-reader-parseable .jpdb-reader-word');
        if (direct && root.contains(direct)) return direct;
        if (event.clientX === 0 && event.clientY === 0) return null;
        for (const word of root.querySelectorAll<HTMLElement>('.jpdb-reader-parseable .jpdb-reader-word')) {
            if (pointInElementClientRects(event.clientX, event.clientY, word)) return word;
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
        if (this.state.mode !== 'word') return false;
        const prompt = target.closest<HTMLElement>('[data-newtab-prompt]');
        if (!prompt || !root.contains(prompt)) return false;
        const card = this.visibleWords[this.index];
        if (!card) return false;
        consumeNestedLookupEvent(event);
        if (this.dependencies.showLookupCard && this.cardReviewSource(card) === 'anki') {
            const lookupCard = this.sourceCardForVisibleCard(card) ?? card;
            void this.dependencies.showLookupCard(lookupCard, lookupCard.sentence || lookupCard.spelling, prompt, this.nestedLookupOptions());
            return true;
        }
        void this.dependencies.lookupText?.(card.spelling, newTabCardReading(card), prompt, this.nestedLookupOptions());
        return true;
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
        if (action === 'jpdb-example-audio') {
            return this.handleNestedJpdbExampleAudioAction(actionTarget, event);
        }
        if (action === 'search-word-audio') {
            return this.handleSearchWordAudioAction(actionTarget, event);
        }
        if (action === 'anki-media-audio') {
            return this.handleNestedAnkiMediaAudioAction(actionTarget, event);
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
        void this.dependencies.lookupText?.(term, reading || term, actionTarget, this.nestedLookupOptions());
        return true;
    }

    private handleNestedJpdbExampleAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const button = actionTarget instanceof HTMLButtonElement ? actionTarget : actionTarget.closest<HTMLButtonElement>('button');
        if (!button) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.playJpdbExampleAudio?.(button.dataset.jpdbAudio ?? '', button.dataset.jpdbExampleSentence ?? '');
        return true;
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
        const card = this.visibleWords[this.index];
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
        const excludedCardKeys = new Set(options.excludeCardKeys ?? []);
        const loadedWords = this.filterStatsStudyCards(
            dedupeWords(result.cards.map(normalizeNewTabCard)),
        ).filter(card => !excludedCardKeys.has(cardKey(card)) && !excludedCardKeys.has(this.cardSelectionKey(card)));
        if (options.quiet && !loadedWords.length && this.visibleWords.length) return;
        this.allWords = this.mergeLoadedWordsWithNavigatedCachedCard(
            loadedWords,
            preferredCard,
            usedCachedWords,
            navigationGeneration,
            result,
        );
        this.reviewCountMode = result.reviewCountMode === true;
        this.emptyLoadMessageKey = result.emptyMessageKey ?? null;
        this.sourceLabel = statsStudyFilter === 'trouble'
            ? `${result.sourceLabel} · ${this.text('statsStudyTroubleCards')}`
            : result.sourceLabel;
        this.statsStudyFilter = null;
        if (this.allWords.length) void this.writeOfflineCache(this.allWords, this.sourceLabel);
        if (!this.allWords.length && useOfflineCache) await this.applyOfflineCacheIfAvailable(root, loadGeneration);
        if (!this.isCurrentLoad(loadGeneration)) return;
        this.dependencies.parser.cacheCards?.(this.allWords);
        void this.flushQueuedGrades();
        if (!this.allWords.length) {
            await this.renderEmptyWordLoad(root);
            return;
        }
        delete root.dataset.standaloneNewtab;
        this.applyWords(root, preferStoredWord, preferredCardKey, { preserveOrder: options.preserveVisibleOrder === true });
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

    private isDictionaryCard(card: JPDBCard): boolean {
        return card.source === 'local' || card.source === 'fallback' || card.reviewSource === 'dictionary';
    }

    private async applyOfflineCacheWhileLoading(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number): Promise<boolean> {
        if (this.allWords.length || this.state.mode === 'search') return false;
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length || !this.canPrimeWithOfflineCache(cached.cards)) return false;
        this.allWords = cached.cards;
        this.reviewCountMode = false;
        this.emptyLoadMessageKey = null;
        this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
        this.dependencies.parser.cacheCards?.(this.allWords);
        this.applyWords(root, preferStoredWord);
        return true;
    }

    private canPrimeWithOfflineCache(cards: JPDBCard[]): boolean {
        if (this.state.source === 'dictionary') return cards.every(card => this.isDictionaryCard(card));
        if (this.state.source === 'jpdb') return cards.every(card => this.isJpdbSourceCard(card));
        if (this.state.source === 'anki') return cards.every(card => this.isAnkiSourceCard(card));
        return cards.every(card => this.isJpdbSourceCard(card) || this.isAnkiSourceCard(card));
    }

    private isJpdbSourceCard(card: JPDBCard): boolean {
        return card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live';
    }

    private isAnkiSourceCard(card: JPDBCard): boolean {
        return card.source === 'anki' || card.reviewSource === 'anki';
    }

    private async applyOfflineCacheIfAvailable(root: HTMLElement, loadGeneration: number): Promise<void> {
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length) return;
        this.allWords = cached.cards;
        this.reviewCountMode = false;
        this.emptyLoadMessageKey = null;
        this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
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
        study.replaceChildren(this.renderStatsContent());
        this.renderInstallCta(root);
    }

    private renderStatsContent(): HTMLElement {
        const source = statsSourceForId(this.statsSnapshot, this.statsSelectedSource);
        return el('div', { class: 'jpdb-reader-stats', dataset: { statsStatus: source.status } },
            el('div', { class: 'jpdb-reader-stats-header' },
                el('div', { class: 'jpdb-reader-stats-title' },
                    el('h1', {}, this.text('stats')),
                    el('p', {}, source.message || this.text('statsNoData')),
                ),
                el('button', {
                    type: 'button',
                    class: 'jpdb-reader-stats-refresh',
                    dataset: { newtabAction: 'stats-refresh' },
                    'aria-label': this.text('statsRefresh'),
                    title: this.text('statsRefresh'),
                }, '↻'),
            ),
            this.renderStatsSourceTabs(),
            this.renderStatsMetrics(source),
            this.renderStatsActivity(source),
            this.renderStatsDistribution(source),
            this.renderStatsConnections(),
        );
    }

    private renderStatsSourceTabs(): HTMLElement {
        const tabs: Array<[StatsSourceId, string]> = [
            ['combined', this.text('statsCombined')],
            ['jpdb', 'JPDB'],
            ['anki', 'Anki'],
        ];
        return el('div', { class: 'jpdb-reader-stats-tabs', role: 'group', 'aria-label': this.text('stats') },
            tabs.map(([source, label]) => el('button', {
                type: 'button',
                dataset: {
                    newtabAction: 'stats-source',
                    statsSource: source,
                    active: source === this.statsSelectedSource,
                },
            }, label)),
        );
    }

    private renderStatsMetrics(source: StatsSourceSnapshot | ReturnType<typeof statsSourceForId>): HTMLElement {
        const speed = averageReviewSpeed(source);
        const dueEstimate = estimatedDueMinutes(source);
        return el('div', { class: 'jpdb-reader-stats-metrics' },
            this.renderStatsMetric(this.text('statsReviewsToday'), formatCompactNumber(source.reviewsToday), this.text('statsDailyActivity')),
            this.renderStatsMetric(this.text('statsCurrentStreak'), formatCompactNumber(source.currentStreak), `${this.text('statsLongestStreak')}: ${formatCompactNumber(source.longestStreak)} ${this.text('statsDays')}`),
            this.renderStatsMetric(this.text('statsRetention'), formatPercent(source.retention), this.text('statsTotalReviews')),
            this.renderStatsMetric(this.text('statsAverageSpeed'), this.formatStatsSpeed(speed), this.statsDueTimeDetail(dueEstimate)),
            this.renderStatsMetric(this.text('statsCards'), formatCompactNumber(source.cards.total), this.cardSummaryText(source.cards)),
        );
    }

    private renderStatsMetric(label: string, value: string, detail: string): HTMLElement {
        return el('section', { class: 'jpdb-reader-stats-metric' },
            el('span', { class: 'jpdb-reader-stats-metric-label' }, label),
            el('strong', {}, value),
            el('span', { class: 'jpdb-reader-stats-metric-detail' }, detail),
        );
    }

    private renderStatsActivity(source: StatsSourceSnapshot | ReturnType<typeof statsSourceForId>): HTMLElement {
        const points = recentDailyPoints(source.daily, 30);
        const metric = this.statsActivityMetric;
        const maxValue = Math.max(1, ...points.map(point => statsActivityMetricValue(point, metric)));
        const selected = this.selectedStatsDayPoint(source.daily, points);
        return el('section', { class: 'jpdb-reader-stats-panel jpdb-reader-stats-activity' },
            el('div', { class: 'jpdb-reader-stats-panel-heading' },
                el('h2', {}, this.text('statsDailyActivity')),
                el('div', { class: 'jpdb-reader-stats-panel-actions' },
                    this.renderStatsActivityMetricTabs(),
                    el('span', {}, this.statsActivityTotalLabel(points, metric)),
                ),
            ),
            el('p', { class: 'jpdb-reader-stats-activity-summary' }, this.statsDayLabel(selected, source.daily)),
            el('div', { class: 'jpdb-reader-stats-bars', role: 'group', 'aria-label': this.text('statsDailyActivity') },
                points.map(point => this.renderStatsActivityBar(point, maxValue, metric, selected.date, source.daily)),
            ),
            this.renderStatsMonthStrip(source, metric),
        );
    }

    private renderStatsActivityMetricTabs(): HTMLElement {
        const metrics: Array<[StatsActivityMetric, string]> = [
            ['reviews', this.text('statsActivityReviews')],
            ['minutes', this.text('statsActivityMinutes')],
            ['newCards', this.text('statsActivityNewCards')],
        ];
        return el('div', { class: 'jpdb-reader-stats-activity-tabs', role: 'group', 'aria-label': this.text('statsDailyActivity') },
            metrics.map(([metric, label]) => el('button', {
                type: 'button',
                dataset: {
                    newtabAction: 'stats-activity-metric',
                    statsActivityMetric: metric,
                    active: metric === this.statsActivityMetric,
                },
                'aria-pressed': String(metric === this.statsActivityMetric),
            }, label)),
        );
    }

    private renderStatsActivityBar(point: StatsDailyPoint, maxValue: number, metric: StatsActivityMetric, selectedDate: string, sourcePoints: StatsDailyPoint[]): HTMLElement {
        const value = statsActivityMetricValue(point, metric);
        const height = Math.max(value > 0 ? 7 : 1, Math.round((value / maxValue) * 100));
        const label = this.statsDayLabel(point, sourcePoints);
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-stats-bar',
            title: label,
            'aria-label': label,
            style: `--stats-bar-height:${height}%`,
            dataset: {
                newtabAction: 'stats-select-day',
                statsDay: point.date,
                tooltip: label,
                active: value > 0,
                selected: point.date === selectedDate,
            },
        },
            el('span', { class: 'jpdb-reader-stats-bar-fill' }),
        );
    }

    private renderStatsMonthStrip(source: StatsSourceSnapshot | ReturnType<typeof statsSourceForId>, metric: StatsActivityMetric): HTMLElement {
        const months = monthlyActivityHeatmaps(source.daily, 6);
        const days = months.flatMap(month => month.days);
        const maxValue = Math.max(1, ...days.map(day => statsActivityMetricValue(day, metric)));
        return el('div', { class: 'jpdb-reader-stats-month-strip', 'aria-label': `${this.text('statsMonthlyHeatmap')}: ${this.statsActivityTotalLabel(days, metric)}` },
            months.map(month => this.renderStatsHeatmapMonth(month, maxValue, metric, source.daily)),
        );
    }

    private renderStatsHeatmapMonth(month: ReturnType<typeof monthlyActivityHeatmaps>[number], maxValue: number, metric: StatsActivityMetric, sourcePoints: StatsDailyPoint[]): HTMLElement {
        const label = this.formatStatsMonthLabel(month.year, month.month);
        const metricSummary = `${this.formatStatsActivityValue(statsActivityMetricTotal(month.days, metric), metric)} ${this.statsActivityMetricLabel(metric).toLowerCase()}`;
        const cells: Array<HTMLElement | null> = [
            ...Array.from({ length: month.startWeekday }, () => el('span', { class: 'jpdb-reader-stats-heatmap-spacer', 'aria-hidden': 'true' })),
            ...month.days.map(day => this.renderStatsHeatmapDay(day, maxValue, metric, sourcePoints)),
        ];
        return el('article', { class: 'jpdb-reader-stats-month', title: `${label}: ${metricSummary}` },
            el('div', { class: 'jpdb-reader-stats-month-heading' },
                el('strong', {}, label),
                el('span', {}, metricSummary),
            ),
            el('div', { class: 'jpdb-reader-stats-heatmap-grid', role: 'grid', 'aria-label': `${label}: ${metricSummary}` }, cells),
        );
    }

    private renderStatsHeatmapDay(point: StatsDailyPoint, maxValue: number, metric: StatsActivityMetric, sourcePoints: StatsDailyPoint[]): HTMLElement {
        const value = statsActivityMetricValue(point, metric);
        const selectedDate = this.selectedStatsDate(this.todayStatsDate());
        const label = this.statsDayLabel(point, sourcePoints);
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-stats-heatmap-cell',
            title: label,
            'aria-label': label,
            dataset: {
                newtabAction: 'stats-select-day',
                statsDay: point.date,
                day: String(Number(point.date.slice(-2))),
                tooltip: label,
                active: value > 0,
                level: this.statsHeatmapLevel(value, maxValue),
                selected: point.date === selectedDate,
                today: point.date === this.todayStatsDate(),
            },
        });
    }

    private renderStatsDistribution(source: StatsSourceSnapshot | ReturnType<typeof statsSourceForId>): HTMLElement {
        const segments = statsCardSegments(source.cards);
        const visibleTotal = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
        const troubleCount = source.cards.due;
        return el('section', { class: 'jpdb-reader-stats-panel jpdb-reader-stats-distribution' },
            el('div', { class: 'jpdb-reader-stats-panel-heading' },
                el('h2', {}, this.text('statsCardDistribution')),
                el('div', { class: 'jpdb-reader-stats-panel-actions' },
                    el('span', {}, `${formatCompactNumber(source.cards.total)} ${this.text('statsCards').toLowerCase()}`),
                    el('button', {
                        type: 'button',
                        class: 'jpdb-reader-stats-panel-button',
                        dataset: { newtabAction: 'stats-study-trouble' },
                        disabled: troubleCount <= 0,
                        title: this.text('statsStudyTroubleHint'),
                    }, this.text('statsStudyTroubleCards')),
                ),
            ),
            el('div', { class: 'jpdb-reader-stats-stackbar', role: 'img', 'aria-label': this.text('statsCardDistribution') },
                segments.length
                    ? segments.map(segment => el('span', {
                        class: `jpdb-reader-stats-stack-segment is-${String(segment.key)}`,
                        style: `width:${Math.max(4, (segment.value / visibleTotal) * 100)}%`,
                        title: `${segment.label}: ${segment.value}`,
                    }))
                    : el('span', { class: 'jpdb-reader-stats-stack-empty' }),
            ),
            el('div', { class: 'jpdb-reader-stats-legend' },
                segments.length
                    ? segments.map(segment => el('span', { class: `is-${String(segment.key)}` }, `${this.localizedStatsSegmentLabel(segment.label)} ${formatCompactNumber(segment.value)}`))
                    : el('span', {}, this.text('statsNoData')),
            ),
        );
    }

    private renderStatsConnections(): HTMLElement {
        return el('section', { class: 'jpdb-reader-stats-connections', 'aria-label': this.text('statsConnections') },
            this.renderStatsConnectionCard(this.statsSnapshot.jpdb),
            this.renderStatsConnectionCard(this.statsSnapshot.anki),
        );
    }

    private renderStatsConnectionCard(source: StatsSourceSnapshot): HTMLElement {
        const isJpdb = source.id === 'jpdb';
        const isConnected = source.status === 'ready' || source.status === 'partial' || (!isJpdb && Boolean(source.deckNames?.length));
        const actions = isJpdb
            ? [
                el('button', { type: 'button', dataset: { newtabAction: 'stats-open-jpdb-settings' } }, this.text('statsOpenJpdbSettings')),
                el('button', { type: 'button', dataset: { newtabAction: 'stats-import-jpdb' } }, this.text('statsChooseJpdbFile')),
            ]
            : [
                isConnected ? null : el('button', { type: 'button', dataset: { newtabAction: 'stats-connect-anki' } }, this.text('statsConnectAnki')),
                el('button', { type: 'button', dataset: { newtabAction: 'stats-open-anki-settings' } }, this.text('statsOpenAnkiSettings')),
            ];
        return el('article', { class: `jpdb-reader-stats-connection is-${source.id}`, dataset: { statsStatus: source.status } },
            el('div', { class: 'jpdb-reader-stats-connection-main' },
                el('strong', {}, source.label),
                el('span', {}, source.message),
                !isJpdb && source.deckNames?.length
                    ? this.renderStatsAnkiDeckToggles(source)
                    : null,
            ),
            el('div', { class: 'jpdb-reader-stats-connection-actions' }, actions),
            isJpdb
                ? el('label', { class: 'jpdb-reader-stats-dropzone', dataset: { statsDropzone: true, dragging: false } },
                    el('input', { type: 'file', accept: '.json,application/json', dataset: { statsJpdbFile: true } }),
                    el('span', {}, this.text('statsDropJpdbFile')),
                )
                : null,
        );
    }

    private renderStatsAnkiDeckToggles(source: StatsSourceSnapshot): HTMLElement | null {
        if (!source.deckNames?.length) return null;
        const activeDecks = new Set(source.activeDeckNames ?? source.deckNames);
        return el('div', { class: 'jpdb-reader-stats-decks', role: 'group', 'aria-label': this.text('statsAnkiDecks') },
            source.deckNames.map(deck => {
                const active = activeDecks.has(deck);
                return el('label', { class: 'jpdb-reader-stats-deck-toggle', dataset: { active } },
                    el('input', {
                        type: 'checkbox',
                        checked: active,
                        dataset: { newtabAction: 'stats-toggle-anki-deck', statsAnkiDeck: deck },
                    }),
                    el('span', {}, deck),
                );
            }),
        );
    }

    private cardSummaryText(cards: StatsSourceSnapshot['cards']): string {
        const parts = [
            cards.failed ? `${this.text('stateFailed')} ${formatCompactNumber(cards.failed)}` : '',
            cards.due ? `${this.text('statsDue')} ${formatCompactNumber(cards.due)}` : '',
            cards.known ? `${this.text('statsKnown')} ${formatCompactNumber(cards.known)}` : '',
        ].filter(Boolean);
        return parts.join(' · ') || this.text('statsCardDistribution');
    }

    private localizedStatsSegmentLabel(label: string): string {
        if (label === 'New') return this.text('stateNew');
        if (label === 'Learning') return this.text('stateLearning');
        if (label === 'Failed') return this.text('stateFailed');
        if (label === 'Due') return this.text('statsDue');
        if (label === 'Review') return this.text('stateDue');
        if (label === 'Known') return this.text('statsKnown');
        if (label === 'Suspended') return this.text('stateSuspended');
        if (label === 'Ignored') return this.text('wordColorIgnored');
        return label;
    }

    private normalizeStatsActivityMetric(value: string | undefined): StatsActivityMetric {
        return value === 'minutes' || value === 'newCards' || value === 'reviews' ? value : 'reviews';
    }

    private selectedStatsDayPoint(points: StatsDailyPoint[], fallbackPoints: StatsDailyPoint[]): StatsDailyPoint {
        const fallback = fallbackPoints[fallbackPoints.length - 1] ?? this.emptyStatsDailyPoint(this.todayStatsDate());
        const selectedDate = this.selectedStatsDate(fallback.date);
        const byDate = new Map([...points, ...fallbackPoints].map(point => [point.date, point]));
        return byDate.get(selectedDate) ?? this.emptyStatsDailyPoint(selectedDate);
    }

    private selectedStatsDate(fallback: string): string {
        return this.isStatsDateKey(this.statsSelectedDate) ? this.statsSelectedDate : fallback;
    }

    private isStatsDateKey(value: string | undefined): value is string {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
    }

    private emptyStatsDailyPoint(date: string): StatsDailyPoint {
        return { date, reviews: 0, correct: 0, failed: 0, newCards: 0, minutes: 0 };
    }

    private todayStatsDate(): string {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatStatsDateLabel(dateKey: string): string {
        const date = new Date(`${dateKey}T00:00:00`);
        if (!Number.isFinite(date.getTime())) return dateKey;
        const locale = this.resolvedLanguage() === 'ja' ? 'ja-JP' : 'en-US';
        return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' }).format(date);
    }

    private formatStatsMonthLabel(year: number, month: number): string {
        const date = new Date(year, month - 1, 1);
        const locale = this.resolvedLanguage() === 'ja' ? 'ja-JP' : 'en-US';
        return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date);
    }

    private statsDayLabel(point: StatsDailyPoint, sourcePoints: StatsDailyPoint[]): string {
        const attempts = point.correct + point.failed;
        const accuracy = attempts > 0 ? formatPercent(point.correct / attempts) : 'n/a';
        const streak = dailyActivityStreakAt(sourcePoints, point.date);
        return [
            this.formatStatsDateLabel(point.date),
            `${this.text('statsActivityReviews')}: ${formatCompactNumber(point.reviews)}`,
            `${this.text('statsActivityMinutes')}: ${this.formatStatsDuration(point.minutes)}`,
            `${this.text('statsActivityNewCards')}: ${formatCompactNumber(point.newCards)}`,
            `${this.text('statsStreak')}: ${this.formatStatsDayCount(streak)}`,
            `${this.text('statsAccuracy')}: ${accuracy}`,
        ].join(' · ');
    }

    private formatStatsDayCount(value: number): string {
        const days = formatCompactNumber(value);
        return this.resolvedLanguage() === 'ja' ? `${days}${this.text('statsDays')}` : `${days} ${this.text('statsDays')}`;
    }

    private statsHeatmapLevel(value: number, maxValue: number): string {
        if (value <= 0 || maxValue <= 0) return '0';
        return String(Math.max(1, Math.min(4, Math.ceil((value / maxValue) * 4))));
    }

    private statsActivityMetricLabel(metric: StatsActivityMetric): string {
        if (metric === 'minutes') return this.text('statsActivityMinutes');
        if (metric === 'newCards') return this.text('statsActivityNewCards');
        return this.text('statsActivityReviews');
    }

    private statsActivityTotalLabel(points: StatsDailyPoint[], metric: StatsActivityMetric): string {
        const total = statsActivityMetricTotal(points, metric);
        return `${this.formatStatsActivityValue(total, metric)} ${this.statsActivityMetricLabel(metric).toLowerCase()}`;
    }

    private formatStatsActivityValue(value: number, metric: StatsActivityMetric): string {
        if (metric === 'minutes') return this.formatStatsDuration(value);
        return formatCompactNumber(value);
    }

    private formatStatsSpeed(speed: number | null): string {
        return speed === null ? 'n/a' : `${speed.toFixed(speed >= 10 ? 0 : 1)}`;
    }

    private statsDueTimeDetail(minutes: number | null): string {
        if (minutes === null) return this.text('statsCardsPerMinute');
        return `${this.text('statsCardsPerMinute')} · ${this.text('statsEstimatedDueTime')}: ${this.formatStatsDuration(minutes)}`;
    }

    private formatStatsDuration(minutes: number): string {
        if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
        if (minutes < 60) return `${Math.round(minutes)}m`;
        return `${(minutes / 60).toFixed(minutes >= 600 ? 0 : 1).replace(/\.0$/u, '')}h`;
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
        const jpdbWithHistory = applyJpdbReviewImport(jpdb, history);
        this.statsSnapshot = {
            jpdb: jpdbWithHistory,
            anki,
            combined: combineStatsSources(jpdbWithHistory, anki),
        };
        this.statsLoaded = true;
        this.renderStats(root);
    }

    private async loadJpdbStatsSource(): Promise<StatsSourceSnapshot> {
        if (!this.dependencies.getSettings().apiKey.trim()) {
            return emptyStatsSource('jpdb', 'JPDB', this.text('statsApiKeyMissing'), 'setup');
        }
        try {
            const cards = await this.loadJpdbStatsCards();
            return statsFromJpdbCards(cards, cards.length ? this.text('statsJpdbLoaded') : this.text('statsNoData'));
        } catch (error) {
            log.warn('JPDB stats failed', error);
            return emptyStatsSource('jpdb', 'JPDB', error instanceof Error ? error.message : this.text('couldNotLoadWords'), 'error');
        }
    }

    private async loadJpdbStatsCards(): Promise<JPDBCard[]> {
        try {
            return await this.dependencies.jpdb.listDeckCards(JPDB_ALL_DECKS, NEW_TAB_STATS_JPDB_CARD_LIMIT);
        } catch (error) {
            log.warn('JPDB all-decks stats failed; sampling user decks', error);
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
            this.allWords = cached.cards;
            this.reviewCountMode = false;
            this.emptyLoadMessageKey = null;
            this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
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
        const accumulator = await this.loadConfiguredWordSources(onProgress);
        await this.loadFallbackStudyWordsIfNeeded(accumulator, onProgress);
        return newTabLoadResult(accumulator, this.language());
    }

    private async loadConfiguredWordSources(onProgress?: (message: string) => void): Promise<NewTabLoadAccumulator> {
        if (this.state.source === 'auto') return this.loadAutoReviewWordSources(onProgress);
        const accumulator = emptyNewTabLoadAccumulator();
        for (const source of this.wordSourceOrder()) {
            await this.appendLoadedWordsFromSource(accumulator, source, onProgress);
        }
        return accumulator;
    }

    private async loadAutoReviewWordSources(_onProgress?: (message: string) => void): Promise<NewTabLoadAccumulator> {
        const jpdbCacheContext = this.sourceCacheContext('jpdb');
        const ankiCacheContext = this.sourceCacheContext('anki');
        const jpdbPromise = this.loadJpdbWords({ allowPublicFallback: false, timeoutMs: NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS });
        const ankiPromise = this.loadAnkiWords(NEW_TAB_REVIEW_SOURCE_TIMEOUT_MS);
        const [jpdbResult, ankiResult] = await Promise.all([jpdbPromise, ankiPromise]);
        this.rememberSourceResult('jpdb', jpdbResult, jpdbCacheContext);
        this.rememberSourceResult('anki', ankiResult, ankiCacheContext);
        const results = autoReviewSourceResults(jpdbResult, ankiResult);
        const accumulator = emptyNewTabLoadAccumulator();
        const emptyReviewLabels: string[] = [];
        let lastResult = emptyNewTabLoadResult();
        for (const result of results) {
            if (result.cards.length) {
                appendNewTabLoadResult(accumulator, result);
            } else {
                accumulator.reviewCountMode ||= result.reviewCountMode === true;
                if (result.reviewCountMode === true && result.sourceLabel && !emptyReviewLabels.includes(result.sourceLabel)) {
                    emptyReviewLabels.push(result.sourceLabel);
                }
            }
            lastResult = mergeEmptyNewTabLoadResults(lastResult, result);
        }
        if (accumulator.cards.length) return accumulator;
        accumulator.labels.push(...emptyReviewLabels);
        return accumulator.reviewCountMode ? accumulator : newTabLoadAccumulatorFromResult(lastResult);
    }

    private async appendLoadedWordsFromSource(accumulator: NewTabLoadAccumulator, source: ConcreteNewTabWordSource, onProgress?: (message: string) => void): Promise<void> {
        appendNewTabLoadResult(accumulator, await this.loadWordsFromSource(source, onProgress));
    }

    private async loadFallbackStudyWordsIfNeeded(accumulator: NewTabLoadAccumulator, onProgress?: (message: string) => void): Promise<void> {
        if (!this.shouldLoadFallbackStudyWords(accumulator)) return;
        appendNewTabLoadResult(accumulator, await this.loadFreshStudyWords(onProgress));
    }

    private shouldLoadFallbackStudyWords(accumulator: NewTabLoadAccumulator): boolean {
        if (this.state.source === 'anki') return false;
        if (accumulator.reviewCountMode) return false;
        const studyCount = this.state.mode === 'kanji'
            ? this.kanjiStudyCardsFromSourceCards(accumulator.cards).length
            : accumulator.cards.length;
        return this.state.source !== 'dictionary'
            && studyCount < NEW_TAB_FALLBACK_SUPPLEMENT_MIN
            && !accumulator.cards.some(card => this.isDictionaryCard(card));
    }

    private async hasLocalDictionaries(): Promise<boolean> {
        const presence = typeof this.dependencies.dictionaries.hasDictionaries === 'function'
            ? this.dependencies.dictionaries.hasDictionaries()
            : this.dependencies.dictionaries.summary?.().then(summary => Boolean(summary.dictionaries.length)) ?? Promise.resolve(false);
        return await promiseWithTimeout(presence, NEW_TAB_DICTIONARY_PRESENCE_TIMEOUT_MS, 'Dictionary presence check timed out.')
            .catch(() => false);
    }

    private wordSourceOrder(): readonly ConcreteNewTabWordSource[] {
        return [this.state.source as ConcreteNewTabWordSource];
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
        return this.loadFreshStudyWords(onProgress, { requireDictionaryBeforePublicFallback: true });
    }

    private cachedSourceResult(source: ConcreteNewTabWordSource): NewTabLoadResult | null {
        const cached = this.sourceResultCache.get(source);
        if (!cached || cached.signature !== this.sourceCacheSignature(source)) return null;
        return {
            ...cached.result,
            cards: [...cached.result.cards],
        };
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
            apiKey: Boolean(settings.apiKey.trim()),
            jpdbMiningEnabled: settings.jpdbMiningEnabled,
            jpdbReviewMode: settings.newTabJpdbReviewMode,
            jpdbDeck: settings.newTabJpdbDeck,
            ankiNewTabEnabled: settings.newTabAnkiEnabled,
            ankiDeck: settings.ankiDeck,
            ankiModel: settings.ankiModel,
            ankiDisabledDecks: settings.newTabAnkiDisabledDecks,
            dictionaries: settings.localDictionariesEnabled,
            dictionaryPreferences: settings.dictionaryPreferences,
        });
    }

    private async loadAnkiWords(timeoutMs = NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, limit = NEW_TAB_WORD_LIMIT): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabAnkiEnabled || typeof this.dependencies.anki.listNewTabCards !== 'function') {
            return { cards: [], sourceLabel: 'Anki', reviewCountMode: true, emptyMessageKey: 'ankiUnreachable' };
        }
        const cardLimit = Math.max(1, Math.floor(limit));
        let unavailable = false;
        const cards = await promiseWithTimeout(
            this.dependencies.anki.listNewTabCards(cardLimit),
            timeoutMs,
            'Anki timed out.',
        ).catch(error => {
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
        options: { requireDictionaryBeforePublicFallback?: boolean } = {},
    ): Promise<NewTabLoadResult> {
        if (options.requireDictionaryBeforePublicFallback) {
            const dictionaryResult = await this.loadDictionaryWords(onProgress);
            if (dictionaryResult.cards.length) return dictionaryResult;
            return this.loadPublicFreshStudyWords(dictionaryResult);
        }
        const publicJpdbPromise = this.loadPublicJpdbWords();
        const dictionaryResult = await this.loadDictionaryWords(onProgress);
        return this.loadPublicFreshStudyWords(dictionaryResult, publicJpdbPromise);
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
        return newTabLoadResult(interleavedNewTabLoadAccumulator(results), this.language());
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
        const live = settings.jpdbMiningEnabled ? this.loadLiveJpdbReviewWords(settings) : null;
        if (live) return live;
        if (!settings.apiKey.trim()) {
            if (options.allowPublicFallback === false) return { cards: [], sourceLabel: 'JPDB', reviewCountMode: true };
            return this.loadFreshStudyWords();
        }

        const selectedDeck = settings.newTabJpdbDeck.trim() || JPDB_ALL_DECKS;
        const selectedDeckCards = await this.loadSelectedJpdbDeckWords(selectedDeck, options.timeoutMs, options.limit);
        if (selectedDeckCards) return selectedDeckCards;
        if (options.allowPublicFallback === false) return { cards: [], sourceLabel: 'JPDB', reviewCountMode: true };
        return this.loadFreshStudyWords();
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
            const cards = jpdbReviewCardsForNewTab(await this.remoteSourceWithFallback(
                'JPDB selected deck',
                this.dependencies.jpdb.listDeckCards(selectedDeck, cardLimit, { scheduledOnly: true }),
                [] as JPDBCard[],
                timeoutMs,
            ), cardLimit);
            return { cards, sourceLabel: 'JPDB', reviewCountMode: true };
        } catch {
            return null;
        }
    }

    private async remoteSourceWithFallback<T>(label: string, promise: Promise<T>, fallback: T, timeoutMs = NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS): Promise<T> {
        try {
            return await promiseWithTimeout(promise, timeoutMs, `${label} timed out.`);
        } catch (error) {
            log.warn('New tab remote source failed', { label, error });
            return fallback;
        }
    }

    private async publicFallbackStage<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
        try {
            return await promiseWithTimeout(promise, NEW_TAB_PUBLIC_STAGE_TIMEOUT_MS, `${label} timed out.`);
        } catch (error) {
            log.warn('New tab public fallback stage failed', { label, error });
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
                log.warn('New tab source setting update failed', { source }, error);
            });
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean }): void {
        const preferredCardKey = options.preserveWord ? this.currentVisibleWordKey() : '';
        this.state = { ...this.state, ...patch };
        this.persistState();
        this.syncMode(root);
        this.applyWords(root, options.preserveWord, preferredCardKey);
    }

    private async switchReviewSource(root: HTMLElement, source: ConcreteNewTabWordSource): Promise<void> {
        if (source === this.state.source) return;
        const sourceSwitchGeneration = ++this.sourceSwitchGeneration;
        const loadGeneration = ++this.loadGeneration;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        const settings = this.dependencies.getSettings();
        settings.newTabSource = source;
        this.state = { ...this.state, source, revealAnswer: false };
        this.persistState();
        this.syncMode(root);
        this.navigationSupplementPromise = null;
        const cached = this.cachedSourceResult(source);
        if (cached) {
            void this.persistSourceSettingChange(source);
            if (!this.isCurrentSourceSwitch(sourceSwitchGeneration)) return;
            await this.applyLoadedWords(root, false, loadGeneration, cached, false, false, this.navigationGeneration);
            return;
        }
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.index = 0;
        this.setStatus(root, this.text('loading'));
        await this.persistSourceSettingChange(source);
        if (!this.isCurrentSourceSwitch(sourceSwitchGeneration)) return;
        await this.loadWordsInto(root, false, { useOfflineCache: false });
    }

    private syncSourceFromSettings(settings = this.dependencies.getSettings()): void {
        const source = this.effectiveNewTabSourceFromSettings(settings);
        if (this.state.source === source) return;
        this.state = { ...this.state, source, revealAnswer: false };
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        this.navigationSupplementPromise = null;
        this.index = 0;
        this.sourceLabel = '';
        this.reviewCountMode = false;
        this.emptyLoadMessageKey = null;
        this.persistState();
    }

    private effectiveNewTabSourceFromSettings(settings: ReaderSettings): ReaderSettings['newTabSource'] {
        if (settings.newTabSource !== 'auto') return settings.newTabSource;
        return this.shouldDefaultToAnkiSource(settings) ? 'anki' : 'auto';
    }

    private shouldDefaultToAnkiSource(settings: ReaderSettings): boolean {
        return settings.ankiEnabled
            && this.canUseAnkiSource(settings)
            && !this.hasConfiguredJpdbReviewSource(settings);
    }

    private hasConfiguredJpdbReviewSource(settings: ReaderSettings): boolean {
        if (settings.apiKey.trim()) return true;
        if (settings.newTabJpdbReviewMode === 'api-vocabulary') return false;
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus?.();
        return settings.jpdbMiningEnabled && Boolean(status?.card);
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
            this.allWords = [];
            this.visibleWords = [];
            this.visiblePoolSignature = '';
            this.navigationSupplementPromise = null;
            this.index = 0;
            this.sourceLabel = '';
            this.reviewCountMode = false;
            this.emptyLoadMessageKey = null;
            this.setStatus(root, this.text('loading'));
            await this.loadWordsInto(root, false, { useOfflineCache: false });
            return;
        }
        this.applyWords(root, true, preferredCardKey);
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
        return selectNewTabStudyPool(this.cardsForCurrentMode(this.allWords));
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
        const firstKanji = kanjiCharacters(card.spelling)[0] ?? '';
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
            kanjiKeyword: firstKanji === kanji ? card.kanjiKeyword : undefined,
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
        return this.state.mode === 'kanji' ? 'noKanjiCardsYet' : 'noWordsYet';
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

    private preferredStoredWordKey(preferStoredWord: boolean): string {
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
            log.warn('New tab navigation supplement failed', { source }, error);
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
        if (!this.visibleWords.length || this.state.mode === 'search' || this.state.mode === 'stats') return null;
        if (this.state.source === 'dictionary' || this.allWords.some(card => this.isDictionaryCard(card))) return 'dictionary';
        if (!this.reviewCountMode && this.sourceLabel.startsWith('JPDB')) return 'public-jpdb';
        if (this.reviewCountMode && !this.isOfflineSourceLabel(this.sourceLabel) && !this.sourceLabel.includes(this.text('liveReview'))) {
            if (this.state.source === 'jpdb' || this.sourceLabel.startsWith('JPDB')) return 'jpdb';
            if (this.state.source === 'anki' || this.sourceLabel.startsWith('Anki')) return 'anki';
        }
        return this.reviewCountMode ? null : 'dictionary';
    }

    private renderWord(root: HTMLElement, card: JPDBCard): void {
        this.writeStoredWordKey(card);
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

        this.renderCount(slots.count, '');
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
        return this.state.mode === 'kanji' || this.isLiveJpdbKanjiReviewCard(card);
    }

    private isLiveJpdbKanjiReviewCard(card: JPDBCard): boolean {
        return card.reviewSource === 'jpdb-live' && (card.jpdbReviewId?.startsWith('kb,') ?? false);
    }

    private revealButtonLabel(): string {
        return this.text(this.state.revealAnswer ? 'hide' : 'reveal');
    }

    private newTabCountLabel(card: JPDBCard): string {
        if (!this.visibleWords.length) return '';
        if (!this.reviewCountMode && !this.isReviewCard(card)) return '';
        return `${this.index + 1} / ${this.visibleWords.length}`;
    }

    private newTabStatusLabel(card: JPDBCard): string {
        return [this.newTabCountLabel(card), this.newTabStatusSourceLabel(card)].filter(Boolean).join(' · ');
    }

    private newTabStatusSourceLabel(card: JPDBCard): string {
        const labels = this.reviewTargetSourceLabels(card);
        return labels.length ? labels.join(' + ') : newTabCardSourceLabel(card, this.language());
    }

    private reviewTargetSourceLabels(card: JPDBCard): string[] {
        const summary = this.reviewSourceSummary(card);
        const labels: string[] = [];
        const add = (label: string): void => {
            if (!labels.includes(label)) labels.push(label);
        };
        if (summary.hasJpdb) add('JPDB');
        if (summary.hasAnki) add(summary.hasJpdb ? 'Anki' : ankiReviewSourceLabel(card, this.language()));
        return labels;
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
            const source = this.cardReviewSource(card);
            if (source === 'jpdb' || source === 'anki') sources.push(source);
        }
        return sources.map(source => el('span', {
            class: 'jpdb-reader-newtab-status-light',
            dataset: { source },
            'aria-hidden': 'true',
        }));
    }

    private reviewTargetSources(card: JPDBCard): Array<'jpdb' | 'anki'> {
        const summary = this.reviewSourceSummary(card);
        const sources: Array<'jpdb' | 'anki'> = [];
        const add = (source: 'jpdb' | 'anki'): void => {
            if (!sources.includes(source)) sources.push(source);
        };
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

    private sourceToggleTarget(card: JPDBCard): ConcreteNewTabWordSource | null {
        const sources = this.sourceToggleSources(card);
        if (sources.length < 2) return null;
        const current = this.sourceToggleCurrentSource(card, sources);
        const currentIndex = sources.indexOf(current);
        return sources[(currentIndex + 1) % sources.length] ?? sources[0] ?? null;
    }

    private sourceToggleSources(card: JPDBCard): ConcreteNewTabWordSource[] {
        const current = this.cardReviewSource(card);
        const sources: ConcreteNewTabWordSource[] = [];
        const add = (source: ConcreteNewTabWordSource): void => {
            if (!sources.includes(source)) sources.push(source);
        };
        if (this.canUseJpdbSource() || current === 'jpdb' || this.state.source === 'jpdb') add('jpdb');
        if (
            this.canUseAnkiSource()
            || current === 'anki'
            || this.state.source === 'anki'
            || (this.canOfferAnkiSource() && (current === 'jpdb' || this.state.source === 'jpdb'))
        ) add('anki');
        if (sources.length < 2 || current === 'dictionary' || this.state.source === 'dictionary') add('dictionary');
        return sources;
    }

    private sourceToggleCurrentSource(card: JPDBCard, sources: ConcreteNewTabWordSource[]): ConcreteNewTabWordSource {
        if (this.state.source !== 'auto' && sources.includes(this.state.source)) return this.state.source;
        const current = this.cardReviewSource(card);
        return sources.includes(current) ? current : sources[0] ?? 'dictionary';
    }

    private canUseJpdbSource(): boolean {
        const settings = this.dependencies.getSettings();
        if (settings.apiKey.trim()) return true;
        if (settings.newTabJpdbReviewMode === 'api-vocabulary') return false;
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus?.();
        return settings.jpdbMiningEnabled && Boolean(status?.card);
    }

    private canUseAnkiSource(settings = this.dependencies.getSettings()): boolean {
        return settings.newTabAnkiEnabled
            && typeof this.dependencies.anki.listNewTabCards === 'function';
    }

    private canOfferAnkiSource(settings = this.dependencies.getSettings()): boolean {
        return settings.newTabAnkiEnabled;
    }

    private cardReviewSource(card: JPDBCard): 'jpdb' | 'anki' | 'dictionary' {
        if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
        if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live') return 'jpdb';
        return 'dictionary';
    }

    private sourceToggleLabel(source: ConcreteNewTabWordSource): string {
        if (source === 'jpdb') return 'JPDB';
        if (source === 'anki') return 'Anki';
        return this.text('dictionary');
    }

    private renderCount(countSlot: HTMLElement | null, label: string): void {
        if (!countSlot) return;
        countSlot.textContent = label;
        countSlot.hidden = !label;
    }

    private studySlots(root: HTMLElement): NewTabStudySlots {
        return {
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
        if (this.state.revealAnswer) replaceChildrenWith(meaning, el('div', {}, firstCardMeaning(card)));
        else meaning.replaceChildren();
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
        delete slots.prompt.dataset.newtabExpression;
        delete slots.prompt.dataset.newtabSentenceRequest;
        delete slots.prompt.dataset.newtabPromptParseRequest;
        setInnerHtml(slots.prompt, html);
        slots.answer?.replaceChildren();
        slots.meaning?.replaceChildren();
        return true;
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
        if (!settings.jpdbDefinitionsEnabled || !this.dependencies.jpdbVocabulary) return '';
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
        const cached = this.parsedSentenceCache.get(key);
        if (cached) return cached.tokens ? Promise.resolve(cached.tokens) : cached.promise;

        const entry: ParsedNewTabSentenceCacheEntry = { promise: Promise.resolve([]) };
        entry.promise = this.dependencies.parser.parse([key], jpdbFirstParseOptions({ allowSegmentedFallback: true })).then(([tokens]) => {
            const parsed = tokens ?? [];
            if (shouldCacheParsedNewTabSentenceTokens(parsed)) entry.tokens = parsed;
            else if (this.parsedSentenceCache.get(key) === entry) this.parsedSentenceCache.delete(key);
            return parsed;
        }).catch(error => {
            if (this.parsedSentenceCache.get(key) === entry) this.parsedSentenceCache.delete(key);
            throw error;
        });
        this.parsedSentenceCache.set(key, entry);
        pruneOldestCacheEntries(this.parsedSentenceCache, NEW_TAB_PARSED_SENTENCE_CACHE_LIMIT);
        return entry.promise;
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

    private renderNewTabImmersionToolbar(example: ImmersionKitExample, index: number, total: number, hasAudio: boolean): HTMLElement {
        const language = this.language();
        return el('div', { class: 'jpdb-reader-example-toolbar' },
            el('div', { class: 'jpdb-reader-example-meta' },
                el('span', { class: 'jpdb-reader-example-source' }, newTabImmersionProviderLabel(example, language)),
                el('span', { class: 'jpdb-reader-example-title' }, localizedImmersionSourceTitle(example.sourceTitle, language)),
                el('span', { class: 'jpdb-reader-example-count' }, `${index + 1}/${total}`),
            ),
            this.renderNewTabImmersionActions(hasAudio),
        );
    }

    private renderNewTabImmersionActions(hasAudio: boolean): HTMLElement {
        return el('div', { class: 'jpdb-reader-example-actions', role: 'group', 'aria-label': this.text('immersionExampleControls') },
            this.renderNewTabImmersionActionButton('previous', this.text('previousExample'), '‹'),
            hasAudio ? this.renderNewTabImmersionAudioButton() : null,
            this.renderNewTabImmersionActionButton('next', this.text('nextExample'), '›'),
        );
    }

    private renderNewTabImmersionAudioButton(): HTMLButtonElement {
        const button = this.renderNewTabImmersionActionButton('audio', this.text('playExampleAudio'));
        setInnerHtml(button, speakerIcon());
        return button;
    }

    private renderNewTabImmersionActionButton(action: string, label: string, text = ''): HTMLButtonElement {
        return el('button', {
            class: 'jpdb-reader-icon-mini',
            type: 'button',
            dataset: { immersionAction: action },
            title: label,
            'aria-label': label,
        }, text);
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

    private performNewTabImmersionAction(root: HTMLElement, action: string): void {
        const current = this.visibleWords[this.index];
        if (!current) return;
        if (action === 'audio') {
            void this.playCurrentImmersionAudio(current);
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        const key = cardKey(current);
        const cached = this.immersionCache.get(this.immersionCacheKey(current));
        void cached?.then(async examples => {
            if (!examples.length || cardKey(this.visibleWords[this.index]) !== key) return;
            const currentIndex = this.normalizedImmersionExampleIndex(key, examples);
            const delta = action === 'next' ? 1 : -1;
            const nextIndex = (currentIndex + delta + examples.length) % examples.length;
            this.immersionExampleIndex.set(key, nextIndex);
            const replaced = await this.replaceNewTabImmersionExample(root, current, examples, nextIndex);
            if (replaced && this.shouldAutoPlayNewTabImmersionNavigationAudio()) void this.playCurrentImmersionAudio(current);
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
        const imagePrepared = await this.prepareNewTabImmersionImage(immersion, examples[index]);
        if (meaning.dataset.newtabImmersionRequest !== requestId) return false;
        if (!this.canAppendImmersionExample(meaning, key, examples)) return false;
        const existing = meaning.querySelector<HTMLElement>(':scope > .jpdb-reader-newtab-immersion');
        if (existing) existing.replaceWith(immersion);
        else meaning.append(immersion);
        if (imagePrepared) syncNewTabImmersionFrameSubtitleSize(immersion);
        else this.loadNewTabImmersionImage(immersion, examples[index]);
        await this.parseNewTabImmersionExample(immersion, card, key);
        return true;
    }

    private normalizedImmersionExampleIndex(key: string, examples: ImmersionKitExample[]): number {
        const index = this.immersionExampleIndex.get(key) ?? 0;
        if (index >= 0 && index < examples.length) return index;
        this.immersionExampleIndex.set(key, 0);
        return 0;
    }

    private async prepareNewTabImmersionImage(root: HTMLElement, example: ImmersionKitExample): Promise<boolean> {
        const image = root.querySelector<HTMLImageElement>('[data-yomu-immersion-image-src]');
        if (!image) return true;
        const urls = this.dependencies.immersionKit.mediaUrls(example, 'image');
        if (!urls.length) {
            this.hideNewTabImmersionImage(root, image);
            return true;
        }
        const settings = this.dependencies.getSettings();
        const src = await this.dependencies.immersionKit.fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl, settings.interfaceLanguage)
            .catch(() => '');
        if (!src) return false;
        await decodeNewTabImmersionImage(src);
        image.src = src;
        image.dataset.yomuImmersionImageSrc = src;
        return true;
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
        if (!this.dependencies.getSettings().audioEnabled) return;
        const key = cardKey(card);
        const examples = await this.loadImmersionExamples(card);
        if (!this.isCurrentRevealedWordCard(key)) return;
        const example = examples[this.normalizedImmersionExampleIndex(key, examples)];
        if (!example) return;
        const source = this.newTabImmersionAudioSource(example);
        if (!source || this.isCurrentImmersionAudioPlaying(source.key)) return;
        const requestId = this.beginNewTabImmersionAudio(source.key);
        const src = await this.fetchNewTabImmersionAudio(source.urls);
        if (!this.isCurrentImmersionAudioRequest(requestId, source.key, src) || !this.isCurrentRevealedWordCard(key)) return;
        const audio = this.attachNewTabImmersionAudio(src);
        const cleanup = () => this.clearNewTabImmersionAudio(audio);
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
        await audio.play().catch(cleanup);
    }

    private isCurrentRevealedWordCard(key: string): boolean {
        return this.state.mode === 'word'
            && this.state.revealAnswer
            && cardKey(this.visibleWords[this.index]) === key;
    }

    private newTabImmersionAudioSource(example: ImmersionKitExample): { urls: string[]; key: string } | null {
        const urls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        const key = urls[0] ?? '';
        return key ? { urls, key } : null;
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

    private isCurrentImmersionAudioRequest(requestId: number, key: string, src: string): boolean {
        return Boolean(src && requestId === this.immersionAudioRequestId && this.immersionAudioKey === key);
    }

    private attachNewTabImmersionAudio(src: string): HTMLAudioElement {
        const audio = new Audio(src);
        audio.playbackRate = this.dependencies.getSettings().immersionKitPlaybackRate;
        this.immersionAudio = audio;
        return audio;
    }

    private clearNewTabImmersionAudio(audio: HTMLAudioElement): void {
        if (this.immersionAudio !== audio) return;
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
        return this.dependencies.immersionKit.search(query, settings, this.newTabImmersionSearchOptions(settings)).catch(error => {
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
        for (let offset = 1; offset <= NEW_TAB_IMMERSION_PREFETCH_LOOKAHEAD; offset++) {
            const nearby = this.visibleWords[(this.index + offset) % this.visibleWords.length];
            if (!nearby || cardKey(nearby) === cardKey(card)) continue;
            void this.waitForIdle().then(() => {
                if (!this.isCurrentImmersionPrefetchGeneration(generation)) return;
                this.prefetchNewTabImmersionCard(nearby, { generation, current: false });
            });
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
        const jpdbInfo = settings.jpdbDefinitionsEnabled && this.dependencies.jpdbVocabulary
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
        const keyword = this.keywordFromDetails(card, details.jpdb, details.rtk);
        if (keyword) this.keywordCache.set(kanji, keyword);
        if (slots.prompt && !this.state.revealAnswer) {
            replaceChildrenWith(slots.prompt, this.renderKanjiPromptKeywords(
                this.kanjiPromptKeywordsFromDetails(card, details),
                this.text('noKanjiKeyword'),
            ));
        }
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
        const similarLoaded = !this.shouldLoadSimilarKanjiWords(this.dependencies.getSettings());
        replaceChildrenWith(slots.meaning, this.renderKanjiDetails(card, kanji, details.jpdb, details.rtk, details.vg, details.local, details.similar, similarLoaded));
        this.renderSimilarKanjiWordsProgressively(slots, card, kanji, details);
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
            el('summary', { class: 'jpdb-reader-local-title' }, uiText(settings.interfaceLanguage, 'immersionKit')),
            el('div', { class: 'jpdb-reader-help', dataset: { newtabKanjiImmersionBody: true } }, uiText(settings.interfaceLanguage, 'loadingExamples'))),
        );
    }

    private renderNewTabKanjiImmersion(root: HTMLElement, kanji: string): void {
        const settings = this.dependencies.getSettings();
        const mount = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-mount]');
        const details = mount?.querySelector<HTMLDetailsElement>('[data-newtab-kanji-immersion-details]');
        const body = mount?.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
        if (!mount || !details || !body || !settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return;

        const card = this.dependencies.parser.fallbackCardFromText?.(kanji) ?? fallbackSearchKanjiCard(kanji);
        let started = false;
        const load = () => {
            if (!details.open || started || !mount.isConnected || !body.isConnected) return;
            started = true;
            void this.loadImmersionExamples(card).then(async examples => {
                if (!mount.isConnected || !body.isConnected) return;
                const example = examples[0];
                if (!example) {
                    replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'noImmersionExamplesCompact')));
                    details.dataset.immersionEmpty = 'true';
                    return;
                }
                const immersion = this.renderNewTabKanjiImmersionCard(card, example, 0, examples.length);
                replaceChildrenWith(body, immersion);
                this.loadNewTabImmersionImage(immersion, example);
                await this.dependencies.parseContent?.(immersion, newTabShortParseOptions());
                this.highlightNewTabParsedTarget(immersion, '[data-immersion-sentence-render]', card);
            }).catch(() => {
                if (body.isConnected) replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'noImmersionExamplesCompact')));
            });
        };
        details.addEventListener('toggle', load);
        load();
    }

    private renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement {
        const settings = this.dependencies.getSettings();
        const language = this.language();
        const audioUrls = newTabImmersionAudioUrls(example, this.dependencies.immersionKit);
        return el('div', { class: 'jpdb-reader-newtab-immersion' },
            el('div', { class: 'jpdb-reader-example-toolbar' },
                el('div', { class: 'jpdb-reader-example-meta' },
                    el('span', { class: 'jpdb-reader-example-source' }, newTabImmersionProviderLabel(example, language)),
                    el('span', { class: 'jpdb-reader-example-title' }, localizedImmersionSourceTitle(example.sourceTitle, language)),
                    el('span', { class: 'jpdb-reader-example-count' }, `${index + 1}/${total}`),
                ),
            ),
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
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        similarEntries: YomitanTermEntry[],
        similarEntriesLoaded = true,
    ): HTMLElement {
        const settings = this.dependencies.getSettings();
        const fullInfo = info ? normalizeJpdbKanjiInfo(info) : null;
        const localMeanings = uniqueStrings(localEntries.flatMap(entry => entry.meanings)).slice(0, 6);
        const localReadings = uniqueStrings(localEntries.flatMap(entry => [...entry.onyomi, ...entry.kunyomi])).slice(0, 8);
        const readings = newTabKanjiReadings(fullInfo, localReadings);
        const facts = this.newTabKanjiFacts(card, fullInfo, rtk, localMeanings);
        const wrap = el('div', { class: 'jpdb-reader-newtab-kanji-details' },
            el('div', { class: 'jpdb-reader-newtab-kanji-keywords' }),
            ...this.renderNewTabKanjiSourceSections(card, kanji, facts, readings, localMeanings, fullInfo, rtk, vg, localEntries, similarEntries, settings, similarEntriesLoaded),
            this.renderKanjiMiningControls(fullInfo),
        );
        const keywordMount = wrap.querySelector<HTMLElement>('.jpdb-reader-newtab-kanji-keywords');
        if (keywordMount) setInnerHtml(keywordMount, renderKanjiKeywordLine(fullInfo, rtk, localEntries));
        this.dependencies.installDictionarySourceTracking?.(wrap);
        return wrap;
    }

    private renderNewTabKanjiSourceSections(
        card: JPDBCard,
        kanji: string,
        facts: [string, string][],
        readings: string[],
        localMeanings: string[],
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        similarEntries: YomitanTermEntry[],
        settings: ReaderSettings,
        similarEntriesLoaded: boolean,
    ): HTMLElement[] {
        const kanjiFactLabels = new Set(facts.map(([label]) => label));
        return orderedKanjiSourceIds(settings).flatMap(sourceId => {
            if (sourceId === KANJI_STROKE_SOURCE_ID) return [];
            const section = this.renderNewTabKanjiSourceSection(
                sourceId,
                card,
                kanji,
                facts,
                readings,
                localMeanings,
                fullInfo,
                rtk,
                vg,
                localEntries,
                similarEntries,
                settings,
                kanjiFactLabels,
                similarEntriesLoaded,
            );
            return section ? [section] : [];
        });
    }

    private renderNewTabKanjiSourceSection(
        sourceId: string,
        card: JPDBCard,
        kanji: string,
        facts: [string, string][],
        readings: string[],
        localMeanings: string[],
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        similarEntries: YomitanTermEntry[],
        settings: ReaderSettings,
        excludeFactLabels: Set<string>,
        similarEntriesLoaded: boolean,
    ): HTMLElement | null {
        if (sourceId === KANJI_JPDB_SOURCE_ID) return fullInfo ? renderNewTabKanjiInfoSection(card, facts, readings, localMeanings, fullInfo, key => this.sourceAttributes(key), this.kanjiSourceTitle(sourceId), settings.interfaceLanguage) : null;
        if (sourceId === KANJI_RTK_SOURCE_ID) return this.renderNewTabRtkSection(rtk, fullInfo, localEntries, settings);
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return this.renderNewTabKanjiOriginGraph(kanji, fullInfo, rtk, vg, localEntries, settings, excludeFactLabels);
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return this.renderNewTabUchisenPlaceholder(settings);
        if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderNewTabKanjiImmersionPlaceholder(settings);
        if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) return htmlToFirstElement(this.renderNewTabSimilarKanjiWords(card, kanji, fullInfo?.vocabulary ?? [], similarEntries, similarEntriesLoaded));
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return this.renderNewTabKanjiDictionarySection(localEntries, sourceId, this.kanjiSourceTitle(sourceId));
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

    private renderNewTabSimilarKanjiWords(
        card: JPDBCard,
        kanji: string,
        jpdbVocabulary: JpdbKanjiInfo['vocabulary'],
        localEntries: YomitanTermEntry[],
        localEntriesLoaded = true,
    ): string {
        if (!this.dependencies.getSettings().similarKanjiWords) return '';
        const settings = this.dependencies.getSettings();
        const content = renderSimilarKanjiWordsContent(
            localEntries,
            jpdbVocabulary,
            card,
            settings,
            name => this.dictionaryLabel(name),
        );
        if (!content && localEntriesLoaded) return '';
        const sourceStateKey = kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID);
        const helpKey = this.isSourceOpen(sourceStateKey) ? 'loadingSimilarWords' : 'openToLoadSimilarWords';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-similar" data-kanji-similar-words data-kanji="${escapeHtml(kanji)}" ${this.sourceAttributes(sourceStateKey)}>
                <summary class="jpdb-reader-local-title">${escapeHtml(this.kanjiSourceTitle(KANJI_SIMILAR_WORDS_SOURCE_ID))}</summary>
                <div data-kanji-similar-mount>
                    ${content || `<div class="jpdb-reader-help">${escapeHtml(uiText(settings.interfaceLanguage, helpKey))}</div>`}
                </div>
            </details>
        `;
    }

    private renderSimilarKanjiWordsProgressively(
        slots: NewTabStudySlots,
        card: JPDBCard,
        kanji: string,
        details: KanjiDetailBundle,
    ): void {
        const meaning = slots.meaning;
        const section = meaning?.querySelector<HTMLDetailsElement>('[data-kanji-similar-words]');
        const mount = section?.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!meaning || !section?.isConnected || !mount?.isConnected) return;

        let started = false;
        let localLoaded = !this.shouldLoadSimilarKanjiWords(this.dependencies.getSettings());
        let localEntries = details.similar;
        const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
        const render = () => {
            if (!this.canApplyKanjiEnrichment(slots, card) || !section.isConnected || !mount.isConnected) return;
            const settings = this.dependencies.getSettings();
            const content = renderSimilarKanjiWordsContent(localEntries, fullInfo?.vocabulary ?? [], card, settings, name => this.dictionaryLabel(name));
            const help = uiText(settings.interfaceLanguage, localLoaded ? 'noSimilarWords' : 'loadingSimilarWords');
            setInnerHtml(mount, content || `<div class="jpdb-reader-help">${escapeHtml(help)}</div>`);
        };
        const load = () => {
            if (!section.open || started || !this.canApplyKanjiEnrichment(slots, card)) return;
            if (!this.shouldLoadSimilarKanjiWords(this.dependencies.getSettings())) return;
            started = true;
            render();
            void this.loadSimilarKanjiWords(kanji).then(entries => {
                localEntries = entries;
                localLoaded = true;
                render();
            }).catch(() => {
                localLoaded = true;
                render();
            });
        };

        section.addEventListener('toggle', load);
        load();
    }

    private renderInlineSimilarKanjiWordsProgressively(root: HTMLElement, card: JPDBCard, kanji: string, details: KanjiDetailBundle): void {
        const section = Array.from(root.querySelectorAll<HTMLDetailsElement>('[data-kanji-similar-words]'))
            .find(candidate => candidate.dataset.kanji === kanji);
        const mount = section?.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!section?.isConnected || !mount?.isConnected) return;

        let started = false;
        let localLoaded = !this.shouldLoadSimilarKanjiWords(this.dependencies.getSettings());
        let localEntries = details.similar;
        const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
        const render = () => {
            if (!section.isConnected || !mount.isConnected) return;
            const settings = this.dependencies.getSettings();
            const content = renderSimilarKanjiWordsContent(localEntries, fullInfo?.vocabulary ?? [], card, settings, name => this.dictionaryLabel(name));
            const help = uiText(settings.interfaceLanguage, localLoaded ? 'noSimilarWords' : 'loadingSimilarWords');
            setInnerHtml(mount, content || `<div class="jpdb-reader-help">${escapeHtml(help)}</div>`);
            void this.dependencies.parseContent?.(mount);
        };
        const load = () => {
            if (!section.open || started || !this.shouldLoadSimilarKanjiWords(this.dependencies.getSettings())) return;
            started = true;
            render();
            void this.loadSimilarKanjiWords(kanji).then(entries => {
                localEntries = entries;
                localLoaded = true;
                render();
            }).catch(() => {
                localLoaded = true;
                render();
            });
        };

        section.addEventListener('toggle', load);
        load();
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
        this.primeRtkKanjiDetail(cache, kanji, settings);
        this.primeKanjiVGDetail(cache, kanji, settings);
        this.primeLocalKanjiDetail(cache, kanji, settings);
    }

    private primeJpdbKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupJpdbKanji = this.dependencies.jpdbKanji.lookup;
        if (!settings.jpdbKanjiEnabled || typeof lookupJpdbKanji !== 'function' || cache.jpdb) return;
        cache.jpdb = promiseWithTimeout(lookupJpdbKanji.call(this.dependencies.jpdbKanji, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'JPDB kanji lookup timed out.')
            .catch(() => null);
    }

    private primeRtkKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupRtk = this.dependencies.rtk.lookup;
        if (!settings.rtkEnabled || typeof lookupRtk !== 'function' || cache.rtk) return;
        cache.rtk = promiseWithTimeout(lookupRtk.call(this.dependencies.rtk, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'RTK lookup timed out.')
            .catch(() => null);
    }

    private primeKanjiVGDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        const lookupKanjiVG = this.dependencies.kanjiVG.lookup;
        if (!this.shouldLoadKanjiVG(settings) || typeof lookupKanjiVG !== 'function' || cache.vg) return;
        cache.vg = promiseWithTimeout(lookupKanjiVG.call(this.dependencies.kanjiVG, kanji), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'KanjiVG lookup timed out.')
            .catch(() => null);
    }

    private primeLocalKanjiDetail(cache: KanjiDetailCacheEntry, kanji: string, settings: ReaderSettings): void {
        if (!this.shouldLoadLocalKanjiDetails(settings) || cache.local) return;
        cache.local = this.localSearchWithTimeout(
            this.dependencies.dictionaries.lookupKanji?.(kanji, 6, settings.dictionaryPreferences) ?? Promise.resolve([]),
            [] as YomitanKanjiEntry[],
        );
    }

    private resolveKanjiDetailBundle(cache: KanjiDetailCacheEntry, settings: ReaderSettings): Promise<KanjiDetailBundle> {
        return Promise.all([
            settings.jpdbKanjiEnabled ? cache.jpdb ?? Promise.resolve(null) : Promise.resolve(null),
            settings.rtkEnabled ? cache.rtk ?? Promise.resolve(null) : Promise.resolve(null),
            this.shouldLoadKanjiVG(settings) ? cache.vg ?? Promise.resolve(null) : Promise.resolve(null),
            this.shouldLoadLocalKanjiDetails(settings) ? cache.local ?? Promise.resolve([]) : Promise.resolve([]),
        ]).then(([jpdb, rtk, vg, local]) => ({ jpdb, rtk, vg, local, similar: [] }));
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
            settings.rtkEnabled,
            this.shouldLoadKanjiVG(settings),
            this.shouldLoadLocalKanjiDetails(settings),
        ].map(Boolean).join(':');
    }

    private shouldLoadLocalKanjiDetails(settings: ReaderSettings): boolean {
        return settings.localDictionariesEnabled && settings.localDictionaryShowKanji;
    }

    private shouldLoadSimilarKanjiWords(settings: ReaderSettings): boolean {
        return settings.localDictionariesEnabled && settings.similarKanjiWords;
    }

    private async loadSimilarKanjiWords(kanji: string): Promise<YomitanTermEntry[]> {
        const cache = this.kanjiDetailCacheEntry(kanji);
        if (cache.similar) return cache.similar;
        cache.similar = this.lookupSimilarKanjiWordsWhenIdle(kanji).catch(() => []);
        return cache.similar;
    }

    private async lookupSimilarKanjiWordsWhenIdle(kanji: string): Promise<YomitanTermEntry[]> {
        await this.waitForIdle();
        const settings = this.dependencies.getSettings();
        if (!this.shouldLoadSimilarKanjiWords(settings)) return [];
        return this.localSearchWithTimeout(
            this.dependencies.dictionaries.lookupSimilarTermsByKanji?.(kanji, settings.similarKanjiWordLimit, settings.dictionaryPreferences) ?? Promise.resolve([]),
            [] as YomitanTermEntry[],
        );
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return waitForBrowserIdle(timeoutMs);
    }

    private keywordFromDetails(card: JPDBCard, jpdb: JpdbKanjiInfo | null, rtk: RtkInfo | null): string {
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
        this.renderPlainStatus(slots.status, '');
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
            el('button', { type: 'button', dataset: { newtabAction: 'previous' } }, this.text('previousWord')),
            el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, this.text('reveal')),
            el('button', { type: 'button', dataset: { newtabAction: 'next' } }, this.text('nextWord')),
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
            case 'search-copy':
                event.preventDefault();
                this.copySearchActionQuery(target);
                return true;
            case 'search-result-word':
                return this.handleSearchResultWordClick(root, target, event);
            case 'search-result-kanji':
                return this.handleSearchResultKanjiClick(target, event);
            default:
                return false;
        }
    }

    private searchActionQuery(target: HTMLElement): string {
        return target.closest<HTMLElement>('[data-query]')?.dataset.query ?? '';
    }

    private copySearchActionQuery(target: HTMLElement): void {
        const query = cleanNestedLookupValue(target.closest<HTMLElement>('[data-query]')?.dataset.query);
        if (query) void copyText(query);
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
        if (event.key === 'Escape') {
            if (!this.searchQuery) return false;
            event.preventDefault();
            this.clearSearch(root);
            return true;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (this.moveSearchSuggestion(root, 1)) return true;
            return this.focusFirstSearchResult(root);
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            return this.moveSearchSuggestion(root, -1);
        }
        if (event.key === 'Enter' && target.closest('[data-newtab-search-input]') && this.selectActiveSearchSuggestion(root)) {
            event.preventDefault();
            return true;
        }
        return false;
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
        } else if (results?.dataset.searchQuery !== query) {
            this.performSearch(root, query);
        }
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
            log.warn('Search handwriting recognition failed', error);
            return [];
        });
        const geometryCandidates = recognizedCandidates.length >= 8 ? [] : await this.recognizeSearchHandwritingByGeometry(strokes).catch(error => {
            log.warn('Search handwriting geometry recognition failed', error);
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
                type: 'button',
                dataset: { newtabAction: 'handwriting-candidate', query: candidate },
                lang: 'ja',
            }, candidate)),
            message ? el('span', { class: 'jpdb-reader-newtab-handwriting-message' }, message) : null,
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
        const hasLocalDictionaries = this.dependencies.getSettings().localDictionariesEnabled;
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
        const wordsByCharacter = new Map<string, JPDBCard[]>();
        wordCards.forEach(card => {
            kanjiCharacters(card.spelling).forEach(character => {
                wordsByCharacter.set(character, [...(wordsByCharacter.get(character) ?? []), card]);
            });
        });
        const results = await Promise.all(characters.map(character => this.searchKanjiResult(character, wordsByCharacter.get(character) ?? [])));
        return results.filter((result): result is NewTabSearchKanjiResult => Boolean(result));
    }

    private async searchKanjiResult(character: string, words: JPDBCard[] = []): Promise<NewTabSearchKanjiResult | null> {
        const settings = this.dependencies.getSettings();
        const local = settings.localDictionariesEnabled && settings.localDictionaryShowKanji
            ? await this.localSearchWithTimeout(
                this.dependencies.dictionaries.lookupKanji?.(character, 6, settings.dictionaryPreferences) ?? Promise.resolve([]),
                [] as YomitanKanjiEntry[],
            )
            : [];
        const meanings = uniqueStrings(local.flatMap(entry => entry.meanings)).slice(0, 6);
        const readings = newTabKanjiReadings(null, uniqueStrings(local.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))).slice(0, 8);
        const card = this.dependencies.parser.fallbackCardFromText?.(character) ?? fallbackSearchKanjiCard(character);
        return {
            character,
            keyword: newTabKanjiKeyword(card, null, null, meanings),
            readings,
            meanings,
            words,
        };
    }

    private localSearchWithTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
        return promiseWithTimeout(promise, NEW_TAB_LOCAL_SEARCH_TIMEOUT_MS, 'Local dictionary search timed out.')
            .catch(error => {
                log.debug('New tab local dictionary search skipped', { error });
                return fallback;
            });
    }

    private toggleSearchWordResult(root: HTMLElement, button: HTMLElement, card: JPDBCard): void {
        const host = button.closest<HTMLElement>('[data-newtab-search-card-shell]');
        const existing = host?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        if (!host || !existing) return;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        existing.hidden = expanded;
        if (expanded) {
            delete host.dataset.newtabSearchExpanded;
            return;
        }
        host.dataset.newtabSearchExpanded = 'true';
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
            log.warn('New tab search word kanji detail failed', { term: card.spelling }, error);
            renderedDetail = {
                ...renderedDetail,
                wordKanjiDetails: [],
                wordKanjiLoading: false,
            };
            renderCurrentDetail();
        });
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
        const renderedData = await this.dependencies.loadCardRenderData?.(card).catch(error => {
            log.warn('Runtime card render data unavailable for search detail', { term: card.spelling }, error);
            return null;
        });
        if (renderedData) {
            return {
                localEntries: renderedData.localEntries,
                kanjiEntries: renderedData.kanjiEntries,
                metaEntries: renderedData.metaEntries,
                ankiLookup: renderedData.ankiLookup,
                jpdbVocabularyInfo: renderedData.jpdbVocabularyInfo,
            };
        }

        const settings = this.dependencies.getSettings();
        const limit = settings.localDictionaryMaxResults;
        const lookupTerms = this.dependencies.dictionaries.lookup;
        const localEntriesPromise = settings.localDictionariesEnabled && typeof lookupTerms === 'function'
            ? this.localSearchWithTimeout(lookupTerms.call(this.dependencies.dictionaries, card.spelling, card.reading, limit, settings.dictionaryPreferences), [] as YomitanTermEntry[])
            : Promise.resolve([]);
        const kanjiEntriesPromise = settings.localDictionariesEnabled && settings.localDictionaryShowKanji
            ? this.localSearchWithTimeout(this.dependencies.dictionaries.lookupKanji?.(card.spelling, limit, settings.dictionaryPreferences) ?? Promise.resolve([]), [] as YomitanKanjiEntry[])
            : Promise.resolve([]);
        const lookupTermMeta = this.dependencies.dictionaries.lookupTermMeta;
        const metaEntriesPromise = settings.localDictionariesEnabled && typeof lookupTermMeta === 'function'
            ? this.localSearchWithTimeout(lookupTermMeta.call(this.dependencies.dictionaries, card.spelling, 12, settings.dictionaryPreferences), [] as YomitanMetaEntry[])
            : Promise.resolve([]);
        const jpdbVocabularyInfoPromise = this.dependencies.jpdbVocabulary?.lookup && card.vid > 0
            ? promiseWithTimeout(this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading), NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, 'JPDB vocabulary lookup timed out.').catch(() => null)
            : Promise.resolve(null);
        const [localEntries, kanjiEntries, metaEntries, jpdbVocabularyInfo] = await Promise.all([localEntriesPromise, kanjiEntriesPromise, metaEntriesPromise, jpdbVocabularyInfoPromise]);
        return { localEntries, kanjiEntries, metaEntries, jpdbVocabularyInfo };
    }

    private shouldLoadSearchWordKanjiDetails(card: JPDBCard): boolean {
        if (!this.searchWordKanjiCharacters(card).length) return false;
        return orderedKanjiSourceIds(this.dependencies.getSettings()).some(sourceId => sourceId !== KANJI_STROKE_SOURCE_ID);
    }

    private searchWordKanjiCharacters(card: JPDBCard): string[] {
        return kanjiCharacters(card.spelling);
    }

    private async loadSearchWordKanjiDetails(card: JPDBCard): Promise<NewTabSearchWordKanjiDetail[]> {
        const settings = this.dependencies.getSettings();
        const loadSimilar = this.shouldLoadSimilarKanjiWords(settings);
        return await Promise.all(this.searchWordKanjiCharacters(card).map(async kanji => {
            const details = await this.loadKanjiDetails(kanji);
            return {
                kanji,
                details,
                similarEntriesLoaded: !loadSimilar,
            };
        }));
    }

    private renderSearchWordDetail(mount: HTMLElement, card: JPDBCard, detail: NewTabSearchWordDetail): void {
        const settings = this.dependencies.getSettings();
        const renderedDefinitions = detail.loading
            ? ''
            : this.dependencies.renderSearchDefinitionSources?.(card, detail.localEntries, card.sentence || card.spelling, detail.jpdbVocabularyInfo)
                ?? this.renderSearchFallbackDefinitionSources(card, detail);
        const loading = detail.loading ? `<div class="jpdb-reader-help" data-card-details-loading>${escapeHtml(uiText(settings.interfaceLanguage, 'loadingDictionaryDetails'))}</div>` : '';
        const html = [this.renderSearchWordHeader(card, detail), renderedDefinitions, loading].filter(Boolean).join('');
        setInnerHtml(mount, html || `<div class="jpdb-reader-newtab-search-message">${escapeHtml(this.text('noLocalResults'))}</div>`);
        const kanjiSection = this.renderSearchWordKanjiSection(card, detail);
        if (kanjiSection) this.insertSearchWordKanjiSection(mount, kanjiSection);
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
            return this.renderSearchLocalKanjiDefinitions(detail);
        }
        const characters = this.searchWordKanjiCharacters(card);
        if (!characters.length) return null;
        const section = this.renderSearchWordKanjiSourceShell(card);
        if (!section) return null;
        if (detail.wordKanjiLoading) {
            section.append(el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('loadingKanjiDetails')));
            return section;
        }
        const details = detail.wordKanjiDetails ?? [];
        if (!details.length) return this.renderSearchLocalKanjiDefinitions(detail);
        details.forEach(item => {
            const fullInfo = item.details.jpdb ? normalizeJpdbKanjiInfo(item.details.jpdb) : null;
            const kanjiCard = this.dependencies.parser.fallbackCardFromText?.(item.kanji) ?? fallbackSearchKanjiCard(item.kanji);
            kanjiCard.kanjiKeyword = newTabKanjiKeyword(
                kanjiCard,
                fullInfo,
                item.details.rtk,
                uniqueStrings(item.details.local.flatMap(entry => entry.meanings)).slice(0, 6),
            );
            const kanjiDetail = this.renderKanjiDetails(
                kanjiCard,
                item.kanji,
                item.details.jpdb,
                item.details.rtk,
                item.details.vg,
                item.details.local,
                item.details.similar,
                item.similarEntriesLoaded,
            );
            section.append(kanjiDetail);
            this.renderInlineSimilarKanjiWordsProgressively(section, kanjiCard, item.kanji, item.details);
            this.renderNewTabUchisen(kanjiDetail, item.kanji);
        });
        return section;
    }

    private renderSearchWordKanjiSourceShell(card: JPDBCard): HTMLElement | null {
        return htmlToFirstElement(`
            <details
                class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-newtab-search-inline-kanji"
                data-source="search-kanji"
                data-newtab-search-inline-kanji="true"
                ${this.sourceAttributes(kanjiSourceStateKey(`search-word:${cardKey(card)}:kanji`))}
            >
                <summary class="jpdb-reader-local-title">${escapeHtml(this.text('kanji'))}</summary>
            </details>
        `);
    }

    private renderSearchLocalKanjiDefinitions(detail: NewTabSearchWordDetail): HTMLElement | null {
        return htmlToFirstElement(renderKanjiDefinitions(
            detail.kanjiEntries,
            (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded),
            name => this.dictionaryLabel(name),
            KANJI_DICTIONARIES_SOURCE_ID,
            this.kanjiSourceTitle(KANJI_DICTIONARIES_SOURCE_ID),
            this.dependencies.getSettings().interfaceLanguage,
        ));
    }

    private renderSearchWordHeader(card: JPDBCard, detail: NewTabSearchWordDetail): string {
        const settings = this.dependencies.getSettings();
        const state = primaryCardState(card.cardState);
        const metaItems = this.searchWordMetaItems(card, state, detail);
        const pitch = settings.showPitchAccent ? renderPitch(card, detail.metaEntries) : '';
        const pills = this.dependencies.renderSearchWordPills?.(card, detail.metaEntries) ?? '';
        const audioTitle = uiText(settings.interfaceLanguage, settings.audioEnabled ? 'playAudio' : 'audioPlaybackDisabled');
        return `<div class="jpdb-reader-header jpdb-reader-newtab-search-detail-header">
            <div class="jpdb-reader-heading">
                <div class="jpdb-reader-title-row">
                    <div class="jpdb-reader-spelling jpdb-${state} jpdb-reader-parseable" data-jpdb-reader-kanji-nav data-jpdb-reader-kanji-nav-label="${escapeHtml(uiText(settings.interfaceLanguage, 'showKanji'))}">${escapeHtml(card.spelling)}</div>
                    ${card.reading && card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(card.reading)}</div>` : ''}
                    ${metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : ''}
                </div>
                ${pills}
            </div>
            <div class="jpdb-reader-card-tools">
                ${pitch}
                <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="search-word-audio" data-newtab-card="${escapeHtml(cardKey(card))}" type="button" aria-label="${escapeHtml(audioTitle)}" title="${escapeHtml(audioTitle)}"${settings.audioEnabled ? '' : ' disabled'}>${speakerIcon()}</button>
            </div>
        </div>`;
    }

    private searchWordMetaItems(card: JPDBCard, state: CardState, detail: NewTabSearchWordDetail): string[] {
        const settings = this.dependencies.getSettings();
        const language = settings.interfaceLanguage;
        const reading = normalizedJapaneseCardReading(card.spelling, card.reading).trim();
        const canShowJpdbState = Boolean(settings.apiKey.trim());
        const jpdbState = canShowJpdbState ? `<span><span class="jpdb-reader-state-dot jpdb-${state}"></span>JPDB ${escapeHtml(searchCardStateLabel(state, language))}</span>` : '';
        const cardAnkiState = card.source === 'anki' || card.reviewSource === 'anki'
            ? `<span><span class="jpdb-reader-state-dot anki-${state}"></span>Anki ${escapeHtml(searchCardStateLabel(state, language))}</span>`
            : '';
        return [
            reading ? `<span class="jpdb-reader-meta-reading">${escapeHtml(reading)}</span>` : '',
            card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '',
            cardAnkiState || jpdbState,
            !cardAnkiState && detail.ankiLookup?.primary ? `<span><span class="jpdb-reader-state-dot anki-${detail.ankiLookup.state}"></span>Anki ${escapeHtml(searchCardStateLabel(detail.ankiLookup.state, language))}</span>` : '',
        ].filter(Boolean);
    }

    private renderSearchFallbackDefinitionSources(card: JPDBCard, detail: NewTabSearchWordDetail): string {
        const settings = this.dependencies.getSettings();
        const grouped = groupTermEntriesByDictionary(detail.localEntries);
        const sourceIds = orderedDefinitionSourceIds(settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        let renderedDictionaries = false;
        const definitionSections = sourceIds.map(sourceId => {
            if (sourceId === JPDB_DEFINITION_SOURCE_ID) {
                return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded), detail.jpdbVocabularyInfo, settings.interfaceLanguage);
            }
            if (sourceId === ANKI_SOURCE_ID) {
                return detail.ankiLookup ? renderAnkiExistingSection(detail.ankiLookup, null, settings) : '';
            }
            if (grouped.has(sourceId)) {
                if (renderedDictionaries) return '';
                renderedDictionaries = true;
                return renderLocalDefinitionSourcesSection(
                    dictionarySourceIds,
                    grouped,
                    settings,
                    (key, initiallyExpanded) => this.sourceAttributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    card,
                );
            }
            return '';
        });
        return definitionSections.filter(Boolean).join('');
    }

    private toggleSearchKanjiResult(button: HTMLElement, kanji: string): void {
        const host = button.closest<HTMLElement>('[data-newtab-search-card-shell]');
        const existing = host?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        if (!host || !existing) return;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        existing.hidden = expanded;
        if (expanded) {
            delete host.dataset.newtabSearchExpanded;
            return;
        }
        host.dataset.newtabSearchExpanded = 'true';
        replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('loadingKanjiDetails')));
        void this.loadKanjiDetails(kanji).then(details => {
            if (!existing.isConnected || button.getAttribute('aria-expanded') !== 'true') return;
            const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
            const card = this.dependencies.parser.fallbackCardFromText(kanji);
            card.kanjiKeyword = newTabKanjiKeyword(card, fullInfo, details.rtk, uniqueStrings(details.local.flatMap(entry => entry.meanings)).slice(0, 6));
            replaceChildrenWith(existing, this.renderKanjiDetails(card, kanji, details.jpdb, details.rtk, details.vg, details.local, details.similar, !this.shouldLoadSimilarKanjiWords(this.dependencies.getSettings())));
            this.renderInlineSimilarKanjiWordsProgressively(existing, card, kanji, details);
            this.renderNewTabUchisen(existing, kanji);
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
        replaceChildrenWith(results, el('div', { class: 'jpdb-reader-newtab-search-empty' }));
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
        el('span', { class: 'jpdb-reader-newtab-search-suggestion-term' }, suggestion.query),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-suggestion-detail' }, detail) : null);
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
            this.renderExternalSearchLinks(query, true),
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
            this.renderExternalSearchLinks(results.query, !results.hasLocalDictionaries || resultCount === 0),
            results.kanji.length ? this.renderSearchKanjiResults(results.kanji) : null,
            results.words.length ? this.renderSearchWordResults(results.words) : null,
            resultCount ? null : this.renderSearchNoResults(results),
        );
        void this.enrichSearchWordStatusRows(root, results, this.searchGeneration);
    }

    private async enrichSearchWordStatusRows(root: HTMLElement, results: NewTabSearchResults, generation: number): Promise<void> {
        if (!this.dependencies.loadCardRenderData || !results.words.length) return;
        await Promise.all(results.words.map(async card => {
            const data = await this.dependencies.loadCardRenderData?.(card).catch(error => {
                log.debug('New tab search Anki status lookup skipped', { term: card.spelling, error });
                return null;
            });
            if (!data || !this.isCurrentSearch(root, generation, results.query)) return;
            this.updateSearchWordStatusRow(root, card, data.ankiLookup);
        }));
    }

    private updateSearchWordStatusRow(root: HTMLElement, card: JPDBCard, ankiLookup: CardRenderData['ankiLookup']): void {
        const key = cardKey(card);
        const meta = this.searchWordSummaryMeta(card, ankiLookup).join(' · ');
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
            this.renderExternalSearchLinks(query, true),
            el('div', { class: 'jpdb-reader-newtab-search-message' }, this.text('searchLocalDictionariesFailed')),
        );
    }

    private renderExternalSearchLinks(query: string, includeBuiltInFallback = false): HTMLElement | null {
        const context = searchLookupLinkContext(query);
        const configuredLinks = this.dependencies.getSettings().dictionaryLookupLinks
            .filter(link => link.enabled);
        const lookupLinks = includeBuiltInFallback
            ? withBuiltInSearchLookupLinks(configuredLinks)
            : configuredLinks;
        const links = lookupLinks
            .map(link => {
                if (link.action === 'copy' || link.id === 'copy') {
                    return el('button', { type: 'button', dataset: { newtabAction: 'search-copy', query } }, link.label || this.text('copyWord'));
                }
                const url = formatLookupUrl(link.urlTemplate, context);
                return url ? el('a', { href: url, target: '_blank', rel: 'noopener' }, link.label) : null;
            })
            .filter((link): link is HTMLButtonElement | HTMLAnchorElement => Boolean(link));
        return links.length
            ? el('div', { class: 'jpdb-reader-newtab-search-links', role: 'group', 'aria-label': this.text('externalDictionarySearch') }, links)
            : null;
    }

    private renderSearchWordResults(cards: JPDBCard[]): HTMLElement {
        return el('section', { class: 'jpdb-reader-newtab-search-section' },
            el('h2', {}, this.text('words')),
            el('div', { class: 'jpdb-reader-newtab-search-list' },
                cards.map(card => this.renderSearchWordResult(card)),
            ),
        );
    }

    private renderSearchWordResult(card: JPDBCard): HTMLElement {
        const meaning = firstCardMeaning(card);
        const meta = this.searchWordSummaryMeta(card).join(' · ');
        return el('div', { class: 'jpdb-reader-newtab-search-card-shell', dataset: { newtabSearchCardShell: true } },
            el('button', {
                type: 'button',
                class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-word',
                dataset: { newtabAction: 'search-result-word', newtabCard: cardKey(card), expression: card.spelling, reading: newTabCardReading(card) },
                'aria-expanded': 'false',
            },
            el('span', { class: 'jpdb-reader-newtab-search-term', lang: 'ja' }, card.spelling),
            el('span', { class: 'jpdb-reader-newtab-search-meta', dataset: { searchWordMeta: cardKey(card) }, hidden: !meta }, meta),
            meaning ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, meaning) : null),
            el('div', { class: 'jpdb-reader-newtab-search-detail', dataset: { newtabSearchDetail: true }, hidden: true }),
        );
    }

    private searchWordSummaryMeta(card: JPDBCard, ankiLookup?: CardRenderData['ankiLookup']): string[] {
        return [
            newTabCardOptionalReading(card),
            this.searchWordPooledStatusLabel(card, ankiLookup),
            card.frequencyRank ? `#${card.frequencyRank}` : '',
        ].filter(Boolean);
    }

    private searchWordPooledStatusLabel(card: JPDBCard, ankiLookup?: CardRenderData['ankiLookup']): string {
        const language = this.language();
        if (card.source === 'local') return uiText(language, 'dictionary');
        if (card.source === 'anki' || card.reviewSource === 'anki') {
            const state = primaryCardState(card.cardState);
            const label = ankiReviewSourceLabel(card, language);
            return state === 'known' ? label : `${label} ${searchCardStateLabel(state, language)}`;
        }
        if (ankiLookup?.primary) return `Anki ${searchCardStateLabel(ankiLookup.state, language)}`;
        const state = primaryCardState(card.cardState);
        return state === 'not-in-deck' ? '' : searchCardStateLabel(state, language);
    }

    private renderSearchKanjiResults(results: NewTabSearchKanjiResult[]): HTMLElement {
        return el('section', { class: 'jpdb-reader-newtab-search-section' },
            el('h2', {}, this.text('kanji')),
            el('div', { class: 'jpdb-reader-newtab-search-kanji-grid' },
                results.map(result => this.renderSearchKanjiResult(result)),
            ),
        );
    }

    private renderSearchKanjiResult(result: NewTabSearchKanjiResult): HTMLElement {
        const detail = [
            result.keyword,
            result.meanings.filter(meaning => meaning !== result.keyword).slice(0, 2).join(', '),
            result.readings.slice(0, 3).join(' · '),
        ].filter(Boolean).join(' · ');
        const words = searchKanjiInlineWordMeta(result.words);
        return el('div', { class: 'jpdb-reader-newtab-search-card-shell', dataset: { newtabSearchCardShell: true } },
            el('button', {
                type: 'button',
                class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-kanji-card',
                dataset: { newtabAction: 'search-result-kanji', kanji: result.character },
                'aria-expanded': 'false',
            },
            el('span', { class: 'jpdb-reader-newtab-search-kanji-char', lang: 'ja' }, result.character),
            detail ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, detail) : null,
            words ? el('span', { class: 'jpdb-reader-newtab-search-meta', lang: 'ja' }, words) : null),
            el('div', { class: 'jpdb-reader-newtab-search-detail', dataset: { newtabSearchDetail: true }, hidden: true }),
        );
    }

    private renderSearchNoResults(results: NewTabSearchResults): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-search-message' },
            results.hasLocalDictionaries ? this.text('noLocalResults') : this.text('addDictionaryForLocalResults'),
        );
    }

    private renderControls(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.controls) return;
        slots.controls.hidden = false;
        replaceChildrenWith(slots.controls, this.controlButtonsForCard(card));
    }

    private controlButtonsForCard(card: JPDBCard): HTMLElement[] {
        if (!this.canReviewCard(card)) return this.navigationControlButtons(this.text(this.state.revealAnswer ? 'hide' : 'reveal'));
        if (!this.state.revealAnswer) return this.navigationControlButtons(this.text('reveal'));
        return this.gradeControlButtons(card);
    }

    private canReviewCard(card: JPDBCard): boolean {
        if (this.isOfflineSourceLabel(this.sourceLabel) && !this.offlineGradeTargets(card).length) return false;
        return this.reviewSourceSummary(card).targets.length > 0;
    }

    private reviewTargetsForCard(card: JPDBCard): NewTabReviewTarget[] {
        return reviewTargetsForNewTabCard(card, this.dependencies.getSettings(), this.ankiCardIdForReview(card));
    }

    private reviewSourceSummary(card: JPDBCard): NewTabReviewSourceSummary {
        const targets = this.reviewTargetsForCard(card);
        return {
            targets,
            hasJpdb: targets.some(target => this.isJpdbReviewTarget(target)),
            hasAnki: targets.includes('anki'),
        };
    }

    private isJpdbReviewTarget(target: NewTabReviewTarget): boolean {
        return target === 'jpdb-api' || target === 'jpdb-live';
    }

    private offlineGradeTargets(card: JPDBCard): QueuedNewTabGradeTarget[] {
        return queueableNewTabReviewTargets(this.reviewTargetsForCard(card));
    }

    private navigationControlButtons(revealLabel: string): HTMLElement[] {
        return [
            el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': this.text('previousWord') }, this.text('previousWord')),
            el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, revealLabel),
            el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': this.text('nextWord') }, this.text('nextWord')),
        ];
    }

    private gradeControlButtons(card: JPDBCard): HTMLElement[] {
        const targetOptions = this.mainGradeTargetOptions(card);
        const targetLabel = targetOptions[0]?.label ?? this.gradeTargetLabel(card);
        return [
            this.renderGradeTargetLabel(card, targetLabel, targetOptions[0]),
            ...(targetOptions.length > 1 ? [this.renderMainGradeTargetSelector(targetOptions)] : []),
            ...newTabGradeOptions(this.dependencies.getSettings())
                .map(([grade, label]) => el('button', {
                    type: 'button',
                    dataset: { newtabAction: 'grade', grade },
                    title: targetLabel,
                    'aria-label': `${label}: ${targetLabel}`,
                }, label)),
        ];
    }

    private renderGradeTargetLabel(card: JPDBCard, label: string, selectedOption?: NewTabMainGradeTargetOption): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-grade-target', dataset: { newtabGradeTarget: true } },
            this.gradeTargetChip(card, selectedOption),
            el('span', { dataset: { newtabGradeTargetText: true } }, label),
        );
    }

    private mainGradeTargetOptions(card: JPDBCard): NewTabMainGradeTargetOption[] {
        const targets = this.lookupReviewTargetsForCard(card);
        const hasJpdb = targets.some(target => target.kind === 'jpdb');
        const ankiTargets = targets.filter(target => target.kind === 'anki' && target.ankiCardId);
        const options = targets.map(target => this.mainGradeTargetOptionFromLookupTarget(target));
        if (hasJpdb && ankiTargets.length) return [
            {
                id: 'both',
                kind: 'both',
                label: this.gradeTargetLabel(card),
                shortLabel: this.text('gradeTargetBoth'),
            },
            ...options,
        ];
        return ankiTargets.length > 1 ? options.filter(option => option.kind === 'anki') : [];
    }

    private mainGradeTargetOptionFromLookupTarget(target: NewTabLookupReviewTarget): NewTabMainGradeTargetOption {
        return {
            id: target.id,
            kind: target.kind,
            label: target.label,
            shortLabel: target.shortLabel,
            ankiCardId: target.ankiCardId,
        };
    }

    private renderMainGradeTargetSelector(options: NewTabMainGradeTargetOption[]): HTMLElement {
        return el('label', {
            class: 'jpdb-reader-newtab-grade-target-selector',
            dataset: { newtabGradeTargetSelector: true },
        },
            el('span', { class: 'jpdb-reader-newtab-grade-target-selector-label' }, this.text('gradeTargetSelector')),
            el('select', {
                class: 'jpdb-reader-newtab-grade-target-select',
                dataset: { newtabGradeTargetSelect: true },
                'aria-label': this.text('gradeTargetSelector'),
            }, ...options.map((option, index) => el('option', {
                value: option.id,
                selected: index === 0,
                dataset: {
                    newtabReviewTarget: option.kind,
                    newtabGradeTargetLabel: option.label,
                    newtabGradeTargetShortLabel: option.shortLabel,
                    ...(option.ankiCardId ? { ankiCardId: String(option.ankiCardId) } : {}),
                },
            }, option.shortLabel))),
        );
    }

    private selectedMainGradeTarget(root: HTMLElement): NewTabLookupReviewTargetSelection | undefined {
        const option = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')?.selectedOptions[0] ?? null;
        if (!option) return undefined;
        if (option.dataset.newtabReviewTarget === 'jpdb') return { kind: 'jpdb' };
        if (option.dataset.newtabReviewTarget !== 'anki') return undefined;
        const ankiCardId = Number(option.dataset.ankiCardId);
        return Number.isFinite(ankiCardId) && ankiCardId > 0
            ? { kind: 'anki', ankiCardId }
            : undefined;
    }

    private updateMainGradeTargetLabel(root: HTMLElement, option: HTMLOptionElement | null): void {
        if (!option) return;
        const label = option.dataset.newtabGradeTargetLabel ?? '';
        const kind = option.dataset.newtabReviewTarget === 'jpdb' || option.dataset.newtabReviewTarget === 'anki'
            ? option.dataset.newtabReviewTarget
            : 'both';
        const target = root.querySelector<HTMLElement>('[data-newtab-grade-target]');
        const chip = target?.querySelector<HTMLElement>('[data-newtab-grade-target-chip]');
        const text = target?.querySelector<HTMLElement>('[data-newtab-grade-target-text]');
        if (chip) {
            chip.dataset.newtabGradeTargetChip = kind;
            chip.textContent = option.dataset.newtabGradeTargetShortLabel || option.textContent?.trim() || this.text('gradeTargetBoth');
        }
        if (text) text.textContent = label;
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"][data-grade]').forEach(gradeButton => {
            const gradeLabel = gradeButton.textContent?.trim() || '';
            gradeButton.title = label;
            gradeButton.setAttribute('aria-label', gradeLabel ? `${gradeLabel}: ${label}` : label);
        });
    }

    private gradeTargetChip(card: JPDBCard, selectedOption?: NewTabMainGradeTargetOption): HTMLElement {
        if (selectedOption) {
            return el('span', {
                class: 'jpdb-reader-newtab-grade-target-chip',
                dataset: { newtabGradeTargetChip: selectedOption.kind },
            }, selectedOption.shortLabel);
        }
        const { hasJpdb, hasAnki } = this.reviewSourceSummary(card);
        const label = hasJpdb && hasAnki
            ? this.text('gradeTargetBoth')
            : hasAnki ? 'Anki' : 'JPDB';
        const source = hasJpdb && hasAnki ? 'both' : hasAnki ? 'anki' : 'jpdb';
        return el('span', { class: 'jpdb-reader-newtab-grade-target-chip', dataset: { newtabGradeTargetChip: source } }, label);
    }

    private gradeTargetLabel(card: JPDBCard): string {
        const { hasJpdb, hasAnki } = this.reviewSourceSummary(card);
        const ankiTarget = hasAnki ? this.ankiReviewTargetLabel(card) : '';
        if (hasJpdb && hasAnki) return this.formatNewTabText('gradeTargetJpdbAndAnki', { target: ankiTarget });
        if (hasAnki) return this.formatNewTabText('gradeTargetAnki', { target: ankiTarget });
        return this.text('gradeTargetJpdb');
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
        if (targets.some(target => target === 'jpdb-api' || target === 'jpdb-live')) {
            result.push({ id: 'jpdb', kind: 'jpdb', label: this.text('gradeTargetJpdb'), shortLabel: 'JPDB' });
        }
        const ankiTargets = this.dependencies.getSettings().newTabAnkiEnabled ? this.lookupAnkiReviewTargets(card, data) : [];
        if (targets.includes('anki') || ankiTargets.length) result.push(...ankiTargets);
        return result;
    }

    private lookupAnkiReviewTargets(card: JPDBCard, data?: CardRenderData | null): NewTabLookupReviewTarget[] {
        const candidates = new Map<number, string>();
        const add = (cardId: number | null | undefined, label: string): void => {
            const id = Number(cardId);
            if (!Number.isFinite(id) || id <= 0 || candidates.has(id)) return;
            candidates.set(id, [label.trim() || 'Anki', `#${id}`].filter(Boolean).join(' '));
        };
        add(this.ankiCardIdForReview(card), card.ankiDeckNames?.join(', ') || card.ankiModelName || 'Anki');
        card.ankiRenderedCards?.forEach(rendered => add(rendered.cardId, rendered.deckName || card.ankiDeckNames?.join(', ') || card.ankiModelName || 'Anki'));
        const notes = data?.ankiLookup.notes ?? [];
        notes.forEach(note => {
            const noteLabel = note.deckNames.join(', ') || note.modelName || 'Anki';
            add(note.primaryCardId, noteLabel);
            note.renderedCards?.forEach(rendered => add(rendered.cardId, rendered.deckName || noteLabel));
            note.cardIds.forEach(cardId => add(cardId, noteLabel));
        });
        return Array.from(candidates, ([cardId, label]) => ({
            id: `anki:${cardId}`,
            kind: 'anki',
            ankiCardId: cardId,
            label: this.formatNewTabText('gradeTargetAnki', { target: label }),
            shortLabel: this.compactAnkiGradeTargetLabel(label, cardId),
        }));
    }

    private compactAnkiGradeTargetLabel(label: string, cardId: number): string {
        const suffix = `#${cardId}`;
        const clean = label.replace(/\s+/g, ' ').trim();
        if (!clean) return `Anki ${suffix}`;
        return clean.endsWith(suffix) ? clean : `${clean} ${suffix}`;
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

    private async gradeCurrentCard(grade: JPDBGrade, selectedTarget?: NewTabLookupReviewTargetSelection): Promise<void> {
        const target = this.currentGradeTarget();
        if (!target) return;
        if (!this.canReviewCard(target.card)) return;
        if (this.isOfflineSourceLabel(this.sourceLabel)) {
            if (await this.queueOfflineGrade(target.card, grade)) {
                this.setStatus(target.root, this.text('offlineGradeReconnect'));
                this.advanceAfterGrade(target.root, target.card);
            } else {
                this.setStatus(target.root, this.text('couldNotSubmitGrade'));
            }
            return;
        }
        try {
            this.setStatus(target.root, this.text('grading'));
            const submittedTarget = await this.submitGrade(target.card, grade, selectedTarget);
            this.invalidateReviewSourceCache(target.card);
            this.setStatus(target.root, this.gradeSuccessStatus(grade, submittedTarget));
            if (!selectedTarget) this.advanceAfterGrade(target.root, target.card);
        } catch (error) {
            log.warn('New tab grade failed', { term: target.card.spelling, source: target.card.source, grade }, error);
            if (!selectedTarget && await this.queueOfflineGrade(target.card, grade, this.queueableFailedGradeTargets(error))) {
                this.setStatus(target.root, this.text('offlineGradeReconnect'));
                this.advanceAfterGrade(target.root, target.card);
                return;
            }
            this.setStatus(target.root, this.text('couldNotSubmitGrade'));
        }
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
        const jpdbTarget = this.reviewTargetsForCard(card).find(candidate => candidate === 'jpdb-api' || candidate === 'jpdb-live');
        if (!jpdbTarget) throw new Error(this.text('couldNotSubmitGrade'));
        await this.submitReviewTarget(card, jpdbTarget, grade);
        return target;
    }

    private lookupReviewTargetForSelection(card: JPDBCard, selectedTarget: NewTabLookupReviewTargetSelection): NewTabLookupReviewTarget | null {
        const targets = this.lookupReviewTargetsForCard(card);
        if (selectedTarget.kind === 'jpdb') return targets.find(target => target.kind === 'jpdb') ?? null;
        const selectedCardId = Number(selectedTarget.ankiCardId);
        if (!Number.isFinite(selectedCardId) || selectedCardId <= 0) return null;
        return targets.find(target => target.kind === 'anki' && target.ankiCardId === selectedCardId) ?? null;
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
        await this.submitJpdbApiGrade(card, grade);
    }

    private submitLiveJpdbGrade(card: JPDBCard, grade: JPDBGrade): void {
        if (card.reviewSource !== 'jpdb-live') throw new Error(this.text('couldNotSubmitGrade'));
        this.rememberPendingLiveJpdbGrade(card);
        this.dependencies.jpdbReviewBridge.grade(grade);
        this.dependencies.jpdbReviewBridge.requestCurrent();
    }

    private async submitJpdbApiGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (isLockedJpdbReviewCard(card)) return;
        if (card.source !== 'jpdb' && card.reviewSource !== 'jpdb-api') throw new Error(this.text('couldNotSubmitGrade'));
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) throw new Error(this.text('jpdbActionsDisabled'));
        if (!settings.apiKey.trim()) throw new Error(this.text('addJpdbApiKeyReview'));
        await this.dependencies.jpdb.reviewCard(card, grade);
    }

    private async submitAnkiGrade(card: JPDBCard, grade: JPDBGrade, explicitCardId?: number): Promise<AnkiLookupResult | null> {
        const cardId = explicitCardId ?? this.ankiCardIdForReview(card);
        if (!cardId) throw new Error(this.text('missingAnkiCardId'));
        await this.dependencies.anki.answerCard(cardId, grade);
        return await this.refreshAnkiReviewCardState(card, cardId);
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
            question: rendered.question,
            answer: rendered.answer,
            ...(rendered.mediaDataUrls ? { mediaDataUrls: rendered.mediaDataUrls } : {}),
        }));
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
        if (targets.some(target => target === 'jpdb-api' || target === 'jpdb-live')) this.invalidateSourceResultCache('jpdb');
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
        if (isLockedJpdbReviewCard(item.card)) return false;
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

    private advanceAfterGrade(root: HTMLElement, card: JPDBCard): void {
        const key = cardKey(card);
        this.allWords = this.allWords.filter(item => cardKey(item) !== key);
        this.visibleWords = this.visibleWords.filter(item => cardKey(item) !== key);
        this.state.revealAnswer = false;
        this.persistState();
        if (!this.visibleWords.length) {
            void this.loadWordsInto(root, false, { useOfflineCache: false });
            return;
        }
        this.index %= this.visibleWords.length;
        this.renderWord(root, this.visibleWords[this.index]);
        if (this.shouldRefreshQueueAfterGrade(card)) void this.loadWordsInto(root, true, {
            useOfflineCache: false,
            quiet: true,
            excludeCardKeys: [key],
            preserveVisibleOrder: true,
        });
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
        for (let offset = 1; offset <= NEW_TAB_IMMERSION_PREFETCH_LOOKAHEAD; offset++) {
            const nearby = this.visibleWords[(this.index + offset) % this.visibleWords.length];
            if (!nearby || cardKey(nearby) === cardKey(card)) continue;
            void this.waitForIdle().then(() => this.prefetchWordPitch(nearby));
        }
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

function cleanNestedLookupValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

function eventTargetElement(target: EventTarget | null): HTMLElement | null {
    if (target instanceof HTMLElement) return target;
    if (target instanceof Text) return target.parentElement;
    return null;
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

function dedupeWords(cards: JPDBCard[]): JPDBCard[] {
    const seen = new Map<string, JPDBCard>();
    for (const card of cards) {
        const key = dedupeWordKey(card);
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, card);
            continue;
        }
        const primary = shouldReplaceDedupeWord(card, existing) ? card : existing;
        const secondary = primary === card ? existing : card;
        seen.set(key, mergeDedupeCardMetadata(primary, secondary));
    }
    return [...seen.values()];
}

function dedupeSearchWords(cards: JPDBCard[]): JPDBCard[] {
    const results: JPDBCard[] = [];
    for (const card of dedupeWords(cards)) {
        const duplicateIndex = results.findIndex(existing => searchWordsAreSameSurfacePlaceholder(card, existing));
        if (duplicateIndex < 0) {
            results.push(card);
            continue;
        }
        const existing = results[duplicateIndex];
        if (existing && shouldReplaceSearchWord(card, existing)) results[duplicateIndex] = card;
    }
    return results;
}

function searchWordResultOrder(
    query: string,
    groups: {
        parsedCards: JPDBCard[];
        publicJpdbCards: JPDBCard[];
        loadedCards: JPDBCard[];
        localCards: JPDBCard[];
    },
): JPDBCard[] {
    const exactGroups = [groups.loadedCards, groups.publicJpdbCards, groups.parsedCards, groups.localCards];
    const remainingGroups = [groups.parsedCards, groups.publicJpdbCards, groups.loadedCards, groups.localCards];
    return [
        ...exactGroups.flatMap(group => group.filter(card => searchWordMatchesQueryExactly(card, query))),
        ...remainingGroups.flatMap(group => group.filter(card => !searchWordMatchesQueryExactly(card, query))),
    ];
}

function searchKanjiInlineWordMeta(cards: JPDBCard[]): string {
    return uniqueStrings(cards.map(searchKanjiInlineWordLabel))
        .slice(0, 4)
        .join('、');
}

function searchKanjiInlineWordLabel(card: JPDBCard): string {
    const detail = [
        newTabCardOptionalReading(card),
        firstCardMeaning(card),
    ].filter(Boolean).join(' · ');
    return detail ? `${card.spelling} ${detail}` : card.spelling;
}

function searchWordMatchesQueryExactly(card: JPDBCard, query: string): boolean {
    const normalizedQuery = normalizedSearchWordIdentity(query);
    return Boolean(normalizedQuery)
        && (normalizedSearchWordIdentity(card.spelling) === normalizedQuery
            || normalizedSearchWordIdentity(newTabCardReading(card)) === normalizedQuery);
}

function normalizedSearchWordIdentity(value: string): string {
    return normalizeSearchQuery(value).replace(/\s+/g, '').toLocaleLowerCase();
}

function searchWordsAreSameSurfacePlaceholder(card: JPDBCard, existing: JPDBCard): boolean {
    return card.spelling.trim() === existing.spelling.trim()
        && (isSearchPlaceholderWord(card) || isSearchPlaceholderWord(existing));
}

function isSearchPlaceholderWord(card: JPDBCard): boolean {
    return card.source === 'fallback'
        || (!newTabCardOptionalReading(card) && !firstCardMeaning(card) && !card.frequencyRank);
}

function shouldReplaceSearchWord(card: JPDBCard, existing: JPDBCard): boolean {
    const cardScore = searchWordDetailScore(card);
    const existingScore = searchWordDetailScore(existing);
    if (cardScore !== existingScore) return cardScore > existingScore;
    return shouldReplaceDedupeWord(card, existing);
}

function searchWordDetailScore(card: JPDBCard): number {
    return sourceDetailScore(card)
        + (card.vid > 0 ? 2 : 0)
        + (newTabCardOptionalReading(card) ? 2 : 0)
        + (firstCardMeaning(card) ? 2 : 0)
        + (card.frequencyRank ? 1 : 0)
        + (card.pitchAccent?.length ? 1 : 0);
}

function sourceDetailScore(card: JPDBCard): number {
    if (!card.source || card.source === 'jpdb') return 8;
    if (card.source === 'anki') return 6;
    if (card.source === 'local') return 4;
    return 0;
}

function dedupeWordKey(card: JPDBCard): string {
    return card.reviewSource === 'jpdb-live'
        ? `jpdb-live\n${card.jpdbReviewId ?? card.spelling}`
        : `${card.spelling}\n${newTabCardReading(card)}`;
}

function liveJpdbCardIdentity(card: JPDBCard): string {
    return card.jpdbReviewId || cardKey(card);
}

function shouldReplaceDedupeWord(card: JPDBCard, existing: JPDBCard | undefined): boolean {
    return !existing || sourcePriority(card) < sourcePriority(existing);
}

function shouldReplaceKanjiStudyCard(card: JPDBCard, existing: JPDBCard): boolean {
    return kanjiStudyCardPriority(card) < kanjiStudyCardPriority(existing);
}

function kanjiStudyCardPriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return 0;
    if (isReviewSource(card.reviewSource)) return 1;
    if (isPositiveJpdbCard(card)) return 2;
    if (card.source === 'jpdb') return 3;
    if (card.source === 'anki') return 4;
    if (card.source === 'local') return 5;
    return 6;
}

function isStandaloneKanjiCard(card: JPDBCard, kanji: string): boolean {
    return card.spelling === kanji && kanjiCharacters(card.spelling).length === 1 && Array.from(card.spelling).length === 1;
}

function sourcePriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return -1;
    if (!card.source || card.source === 'jpdb') return 0;
    if (card.source === 'anki') return 1;
    return 2;
}

function markJpdbApiReviewCards(cards: JPDBCard[]): JPDBCard[] {
    return cards.map(card => normalizeNewTabCard({
        ...card,
        reviewSource: card.reviewSource ?? 'jpdb-api',
    }));
}

function jpdbReviewCardsForNewTab(cards: JPDBCard[], limit = NEW_TAB_WORD_LIMIT): JPDBCard[] {
    return markJpdbApiReviewCards(cards)
        .filter(isScheduledStudyCard)
        .slice(0, Math.max(1, limit));
}

function isScheduledStudyCard(card: JPDBCard): boolean {
    return card.cardState.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'locked');
}

function randomPublicJpdbSeedKanji(limit = NEW_TAB_PUBLIC_JPDB_KANJI_SEED_LIMIT): string[] {
    return shuffleStrings(uniqueStrings(Array.from(NEW_TAB_HANDWRITING_COMMON_KANJI))).slice(0, Math.max(0, limit));
}

function randomPublicJpdbSeedWords(limit = NEW_TAB_PUBLIC_JPDB_WORD_SEED_LIMIT): string[] {
    return shuffleStrings(uniqueStrings([...NEW_TAB_PUBLIC_JPDB_COMMON_WORDS])).slice(0, Math.max(0, limit));
}

function preferMultiCharacterVocabulary(cards: JPDBCard[]): JPDBCard[] {
    const multi = cards.filter(card => Array.from(card.spelling).length >= NEW_TAB_PUBLIC_JPDB_MIN_WORD_LENGTH);
    return multi.length ? multi : cards;
}

function shuffleStrings(values: string[]): string[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function jpdbKanjiVocabularyToNewTabCard(entry: JpdbKanjiVocabulary): JPDBCard {
    const identity = jpdbVocabularyIdentityFromUrl(entry.url);
    const spelling = cleanNestedLookupValue(identity?.spelling) || cleanNestedLookupValue(entry.expression);
    const reading = cleanNestedLookupValue(identity?.reading) || cleanNestedLookupValue(entry.reading) || spelling;
    const meaning = cleanNestedLookupValue(entry.meaning);
    return {
        vid: identity?.vid || stableNegativeNewTabId(`${spelling}\n${reading}\n${entry.url}`),
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: meaning ? [{ glosses: [meaning], partOfSpeech: [] }] : [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: spelling,
    };
}

function jpdbVocabularyIdentityFromUrl(value: string): { vid: number; spelling: string; reading: string } | null {
    if (!value) return null;
    try {
        const url = new URL(value, 'https://jpdb.io');
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        const vid = Number.parseInt(parts[1] ?? '', 10);
        return {
            vid: Number.isFinite(vid) ? vid : 0,
            spelling: decodeUrlPathPart(parts[2] ?? ''),
            reading: decodeUrlPathPart(parts[3] ?? ''),
        };
    } catch {
        return null;
    }
}

function decodeUrlPathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function stableNegativeNewTabId(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return -((hash >>> 0) || 1);
}

function fact(label: string, value: string | undefined): [string, string] | null {
    return value ? [label, value] : null;
}

function compactFacts(facts: Array<[string, string] | null>): [string, string][] {
    return facts.filter((item): item is [string, string] => Boolean(item));
}

function heisigFact(fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null): string {
    const jpdbFrame = heisigFrameValue(fullInfo?.heisig);
    const rtkFrames = rtkFrameEntries(rtk?.frameNumber).filter(frame => frame.value !== jpdbFrame);
    return [
        jpdbFrame ? `JPDB #${jpdbFrame}` : '',
        ...rtkFrames.map(frame => `${frame.label} #${frame.value}`),
    ].filter(Boolean).join(' · ');
}

function heisigFrameValue(value: string | undefined): string {
    const frames = rtkFrameValues(value);
    return frames[frames.length - 1] ?? '';
}

function rtkFrameValues(value: string | undefined): string[] {
    return rtkFrameEntries(value).map(frame => frame.value);
}

function rtkFrameEntries(value: string | undefined): Array<{ label: string; value: string }> {
    if (!value) return [];
    const versioned = [...value.matchAll(/(V\d+)\s*:\s*#?(\d+)/giu)]
        .map(match => ({ label: match[1]?.toUpperCase() ?? '', value: match[2] ?? '' }))
        .filter(frame => frame.label && frame.value);
    return versioned.length
        ? versioned
        : [...value.matchAll(/#?(\d+)/gu)].map(match => ({ label: 'RTK', value: match[1] ?? '' })).filter(frame => frame.value);
}

function newTabKanjiReadings(fullInfo: JpdbKanjiInfo | null, localReadings: string[]): string[] {
    return fullInfo?.readings.length
        ? fullInfo.readings.slice(0, 8).map(reading => `${reading.reading}${reading.share ? ` ${reading.share}` : ''}`)
        : localReadings;
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
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<QueuedNewTabGrade>;
    return typeof record.id === 'string'
        && typeof record.at === 'number'
        && (record.target === 'anki' || record.target === 'jpdb-api')
        && Boolean(record.card && typeof record.card === 'object')
        && isJpdbGrade(record.grade)
        && typeof record.attempts === 'number';
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

function newTabKanjiSourceAttrs(sourceStateKey: string, initiallyExpanded = true): string {
    return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}" ${initiallyExpanded ? 'open' : ''}`;
}

export function newTabKanjiSourceTitle(settings: ReaderSettings, sourceId: string): string {
    const language = settings.interfaceLanguage;
    if (sourceId === KANJI_STROKE_SOURCE_ID) return uiText(language, 'strokePractice');
    if (sourceId === KANJI_JPDB_SOURCE_ID) return uiText(language, 'readingsComponents');
    if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return uiText(language, 'kanjiDictionaries');
    if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) return uiText(language, 'sourceNameWordsUsingKanji');
    if (sourceId === KANJI_ORIGINS_SOURCE_ID) return uiText(language, 'originStructure');
    return kanjiSourceLabel(settings, sourceId);
}

function normalizeJpdbKanjiInfo(info: JpdbKanjiInfo): JpdbKanjiInfo {
    return {
        kanji: textOrEmpty(info.kanji),
        keyword: textOrEmpty(info.keyword),
        frequency: textOrEmpty(info.frequency),
        type: textOrEmpty(info.type),
        kanken: textOrEmpty(info.kanken),
        heisig: textOrEmpty(info.heisig),
        oldForms: arrayOrEmpty(info.oldForms),
        readings: arrayOrEmpty(info.readings),
        components: arrayOrEmpty(info.components),
        usedInKanji: arrayOrEmpty(info.usedInKanji),
        mnemonic: textOrEmpty(info.mnemonic),
        vocabulary: arrayOrEmpty(info.vocabulary),
        actions: arrayOrEmpty(info.actions),
        loggedIn: Boolean(info.loggedIn),
        kanjiReviewsEnabled: Boolean(info.kanjiReviewsEnabled),
    };
}

function textOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

function keywordCandidates(
    card: JPDBCard,
    jpdb: JpdbKanjiInfo | null,
    rtk: RtkInfo | null,
    source: ReaderSettings['newTabKanjiKeywordSource'],
): Array<string | undefined> {
    if (source === 'rtk') return [rtk?.keyword, card.kanjiKeyword];
    if (source === 'jpdb') return [jpdb?.keyword, card.kanjiKeyword];
    if (source === 'local') return [card.kanjiKeyword, jpdb?.keyword, rtk?.keyword];
    return [rtk?.keyword, jpdb?.keyword, card.kanjiKeyword];
}

function firstTruthy(values: Array<string | undefined>): string {
    return values.find(Boolean) ?? '';
}

function isNewTabStudyInteractiveTarget(target: HTMLElement): boolean {
    return Boolean(target.closest(NEW_TAB_STUDY_INTERACTIVE_SELECTOR));
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

function jpdbExampleSentenceForPrompt(info: JpdbVocabularyInfo | null, card: JPDBCard): string {
    const examples = info?.examples ?? [];
    return examples
        .map(example => normalizePromptContextSentence(example.sentence, card))
        .find(Boolean) ?? '';
}

function normalizeSearchQuery(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function appendSearchHandwritingCandidate(currentQuery: string, candidate: string): string {
    return normalizeSearchQuery(`${currentQuery}${candidate}`);
}

function cardMatchesSearchSuggestion(card: JPDBCard, normalizedQuery: string): boolean {
    return [
        card.spelling,
        newTabCardReading(card),
        firstCardMeaning(card),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

function cardMatchesSearchResult(card: JPDBCard, normalizedQuery: string): boolean {
    return [
        card.spelling,
        newTabCardReading(card),
        firstCardMeaning(card),
        ...card.meanings.flatMap(meaning => meaning.glosses),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

function searchSuggestionFromCard(card: JPDBCard): NewTabSearchSuggestion {
    return {
        query: card.spelling.trim(),
        reading: newTabCardReading(card).trim(),
        meaning: firstCardMeaning(card),
    };
}

function queryHasJapanese(value: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff々〆]/u.test(value);
}

function searchLookupLinkContext(query: string): { query: string; word: string; reading: string; vid: string; sid: string } {
    return {
        query,
        word: query,
        reading: query,
        vid: '0',
        sid: '0',
    };
}

function withBuiltInSearchLookupLinks(links: ReaderSettings['dictionaryLookupLinks']): ReaderSettings['dictionaryLookupLinks'] {
    const lookupLinks = [...links];
    for (const link of [JPDB_LOOKUP_LINK, JISHO_LOOKUP_LINK]) {
        if (lookupLinks.some(existing => existing.id === link.id || existing.urlTemplate === link.urlTemplate)) continue;
        lookupLinks.push(link);
    }
    return lookupLinks;
}

async function recognizeGoogleJapaneseHandwriting(strokes: DoodleStroke[]): Promise<string[]> {
    if (typeof fetch !== 'function' || !strokes.length) return [];
    const response = await fetch(NEW_TAB_HANDWRITING_GOOGLE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            options: 'enable_pre_space',
            requests: [{
                writing_guide: {
                    writing_area_width: 240,
                    writing_area_height: 240,
                },
                ink: googleHandwritingInk(strokes),
                language: 'ja',
            }],
        }),
    });
    if (!response.ok) return [];
    return googleHandwritingPredictionQueries(await response.json().catch(() => null));
}

function googleHandwritingInk(strokes: DoodleStroke[]): number[][][] {
    return strokes
        .map(stroke => [
            stroke.map(point => Math.round(point.x * 240)),
            stroke.map(point => Math.round(point.y * 240)),
            [],
        ])
        .filter(stroke => stroke[0].length > 1 && stroke[1].length > 1);
}

function googleHandwritingPredictionQueries(response: unknown): string[] {
    const results = Array.isArray(response)
        && response.length > 1
        && Array.isArray(response[1])
        && Array.isArray(response[1][0])
        && Array.isArray(response[1][0][1])
        ? response[1][0][1] as unknown[]
        : [];
    return uniqueStrings(results.flatMap(result => {
        const text = typeof result === 'string' ? result.trim() : '';
        if (!text) return [];
        const kanji = kanjiCharacters(text);
        return kanji.length === 1 && Array.from(text).length === 1 ? kanji : [];
    })).slice(0, 8);
}

function sentencePromptTarget(card: JPDBCard, sentence: string): string {
    const reading = newTabCardOptionalReading(card);
    if (sentence.includes(card.spelling)) return card.spelling;
    return reading && sentence.includes(reading) ? reading : '';
}

function shouldWaitForMoreDoodleStrokes(strokes: Parameters<typeof assessKanjiStrokes>[0], expectedStrokes: number): boolean {
    return expectedStrokes > 0 && strokes.length < expectedStrokes;
}

function visibleCardKanji(card: JPDBCard | undefined): string {
    return card ? kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '' : '';
}

function doodlePreviewDataUrl(canvas: HTMLCanvasElement): string {
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const context = snapshot.getContext('2d');
    if (!canPaintDoodlePreview(context)) return canvas.toDataURL('image/png');
    paintDoodlePreview(context, snapshot, canvas);
    return snapshot.toDataURL('image/png');
}

function canPaintDoodlePreview(context: CanvasRenderingContext2D | null): context is CanvasRenderingContext2D {
    return Boolean(context && typeof context.fillRect === 'function' && typeof context.drawImage === 'function');
}

function paintDoodlePreview(context: CanvasRenderingContext2D, snapshot: HTMLCanvasElement, canvas: HTMLCanvasElement): void {
    context.fillStyle = doodlePreviewBackground(canvas);
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(canvas, 0, 0);
}

function doodlePreviewBackground(canvas: HTMLCanvasElement): string {
    const stage = canvas.closest<HTMLElement>('.jpdb-reader-doodle-stage');
    return getComputedStyle(stage ?? canvas).backgroundColor || DEFAULT_OVERLAY_BACKGROUND_COLOR;
}

function liveJpdbCardFromBridgeCard(card: JpdbReviewBridgeCard, spelling: string): JPDBCard {
    return {
        vid: 0,
        sid: 0,
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

function uniqueNumbers(values: number[]): number[] {
    return [...new Set(values)];
}
