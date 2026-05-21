import { primaryCardState } from './card-state';
import { copyText } from './browser-ui';
import { APP_NAME, DOCS_BASE_URL } from './constants';
import { escapeHtml, renderHighlightedTextHtml, setInnerHtml } from './dom';
import { el, fragment, replaceChildrenWith, type DomAttrs } from './dom-builder';
import type { ImmersionKitClient, ImmersionKitExample } from './immersion-kit';
import {
    IMMERSION_FALLBACK_QUERY_LIMIT,
    immersionFallbackFragments,
    isUsefulImmersionFallbackQuery,
    uniqueImmersionQueries,
} from './immersion-query';
import type { JpdbClient } from './jpdb';
import { jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiClient, type JpdbKanjiInfo } from './jpdb-kanji';
import { getPitchClass } from './jpdb-parser';
import type { JpdbPublicPitchClient } from './jpdb-public-pitch';
import type { JpdbVocabularyClient, JpdbVocabularyInfo } from './jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph } from './kanji-origin';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT, type DoodleStroke } from './kanji-doodle';
import { assessKanjiStrokes, rankKanjiStrokeCandidates, type KanjiShapeCandidate, type KanjiStrokeAssessment } from './kanji-stroke-grader';
import type { KanjiVGClient, KanjiVGInfo } from './kanjivg';
import { formatLookupUrl } from './local-dictionary-display';
import type { JpdbReviewBridgeCard, JpdbReviewBridgeClient, JpdbReviewBridgeStatus } from './jpdb-review-bridge';
import { Logger } from './logger';
import { installOriginGraphInteractions } from './origin-graph-interactions';
import {
    buildRtkComponentSummaries,
    localPitchPatternFromMeta,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderRtkInfo,
    speakerIcon,
} from './popup-render';
import { kanjiSourceStateKey, renderKanjiDefinitions, renderSimilarKanjiWordsContent } from './definition-source-render';
import {
    cardKey,
    cardStateLabel,
    createNewTabStateChannel,
    firstCardMeaning,
    hasSavedNewTabUiState,
    isYomuNewTabUrl,
    kanjiCharacters,
    loadNewTabUiState,
    resolveNewTabBrandAssets,
    saveNewTabUiState,
    uniqueStrings,
    type NewTabUiState,
} from './new-tab';
import type { ReaderParser } from './reader-parser';
import type { CardState, JPDBCard, JPDBGrade, ReaderSettings } from './types';
import type { RtkClient, RtkInfo } from './rtk';
import { gmStorageDelete, gmStorageGet, gmStorageSet } from './storage';
import { resolveUiLanguage, uiText, type UiCopyKey } from './i18n';
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
    orderedKanjiSourceIds,
} from './source-sections';
import { JISHO_LOOKUP_LINK, JPDB_LOOKUP_LINK } from './settings';
import { installUchisenCarousel, loadUchisenData, type UchisenData } from './uchisen';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanTermEntry } from './yomitan';

export interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    anki: {
        listNewTabCards: (limit?: number) => Promise<JPDBCard[]>;
        answerCard: (cardId: number, grade: JPDBGrade) => Promise<void>;
    };
    jpdb: JpdbClient;
    jpdbKanji: JpdbKanjiClient;
    kanjiVG: KanjiVGClient;
    rtk: RtkClient;
    immersionKit: ImmersionKitClient;
    jpdbVocabulary?: Pick<JpdbVocabularyClient, 'lookup'>;
    jpdbPublicPitch?: Pick<JpdbPublicPitchClient, 'lookup'>;
    jpdbReviewBridge: JpdbReviewBridgeClient;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    lookupText?: (text: string, sentence: string, anchor?: HTMLElement) => Promise<void> | void;
    lookupDictionaryReference?: (query: string, reading: string, sourceDictionary: string, anchor?: HTMLElement) => Promise<void> | void;
    showLookupCard?: (card: JPDBCard, sentence: string, anchor?: HTMLElement) => Promise<void> | void;
    showKanjiCard?: (card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement) => Promise<void> | void;
    parseContent?: (root: HTMLElement) => Promise<void> | void;
    setImmersionTranslationBlurred?: (blurred: boolean) => void;
    dictionarySourceAttributes?: (sourceStateKey: string, initiallyExpanded?: boolean) => string;
    isDictionarySourceOpen?: (sourceStateKey: string, initiallyExpanded?: boolean) => boolean;
    installDictionarySourceTracking?: (root: HTMLElement) => void;
    onSettingsChange: () => Promise<void> | void;
    applyTheme: () => void;
    showSettings: (tab?: string) => void;
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

function renderNewTabImmersionSentence(card: JPDBCard, example: ImmersionKitExample): HTMLElement {
    const sentence = document.createElement('div');
    sentence.className = 'jpdb-reader-example-sentence jpdb-reader-parseable';
    sentence.lang = 'ja';
    sentence.dataset.immersionSentenceRender = '';
    setInnerHtml(sentence, renderHighlightedTextHtml(example.sentence, [card.spelling, card.reading], 'jpdb-reader-example-target'));
    return sentence;
}

function renderNewTabFrontSentence(card: JPDBCard, sentence: string): HTMLElement {
    const sentenceWrap = el('span', {
        class: 'jpdb-reader-newtab-sentence jpdb-reader-parseable',
        lang: 'ja',
        dataset: { newtabSentenceRender: true },
    });
    setInnerHtml(sentenceWrap, renderHighlightedTextHtml(sentence, [card.spelling, card.reading], 'jpdb-reader-example-target'));
    return sentenceWrap;
}

function renderNewTabImmersionTranslation(example: ImmersionKitExample, settings: ReaderSettings): HTMLElement | null {
    if (!shouldRenderNewTabImmersionTranslation(example, settings)) return null;
    return el('div', newTabImmersionTranslationAttributes(settings), example.translation);
}

function shouldRenderNewTabImmersionTranslation(example: ImmersionKitExample, settings: ReaderSettings): boolean {
    return settings.immersionKitShowTranslation && Boolean(example.translation);
}

function newTabImmersionTranslationAttributes(settings: ReaderSettings): DomAttrs {
    return {
        class: 'jpdb-reader-example-translation',
        dataset: newTabImmersionTranslationDataset(settings),
        ...newTabImmersionTranslationRevealAttributes(settings),
    };
}

function newTabImmersionTranslationRevealAttributes(settings: ReaderSettings): DomAttrs {
    return settings.immersionKitRevealTranslationOnClick
        ? { role: 'button', tabindex: '0', 'aria-label': uiText(settings.interfaceLanguage, 'revealTranslation') }
        : {};
}

function newTabImmersionTranslationDataset(settings: ReaderSettings): Record<string, boolean> | undefined {
    return settings.immersionKitRevealTranslationOnClick ? { yomuImmersionTranslationBlurred: true } : undefined;
}

function setNewTabImmersionTranslationBlurred(element: HTMLElement, blurred: boolean, language: ReaderSettings['interfaceLanguage']): void {
    if (blurred) {
        element.dataset.yomuImmersionTranslationBlurred = 'true';
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', uiText(language, 'revealTranslation'));
        return;
    }
    delete element.dataset.yomuImmersionTranslationBlurred;
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
}

function newTabImmersionImageUrl(
    example: ImmersionKitExample,
    settings: ReaderSettings,
    client: ImmersionKitClient,
): string {
    const urls = settings.immersionKitShowImages || settings.immersionKitEnabled ? client.mediaUrls(example, 'image') : [];
    return urls[0] ?? '';
}

function newTabImmersionAudioUrls(example: ImmersionKitExample, client: ImmersionKitClient): string[] {
    return client.mediaUrls(example, 'sound');
}

function newTabImmersionProviderLabel(example: ImmersionKitExample): string {
    return example.provider === 'nadeshiko' ? 'Nadeshiko' : 'Immersion Kit';
}

function renderNewTabImmersionImage(imageUrl: string, overlay: HTMLElement | null = null): HTMLElement | null {
    if (!imageUrl) return null;
    return el('div', { class: 'jpdb-reader-example-media' },
        el('img', { class: 'jpdb-reader-example-image', src: imageUrl, alt: '', loading: 'eager', decoding: 'async', referrerPolicy: 'no-referrer', dataset: { yomuImmersionImageSrc: imageUrl } }),
        overlay,
    );
}

function syncNewTabImmersionFrameSubtitleSize(root: HTMLElement): void {
    const media = root.querySelector<HTMLElement>('.jpdb-reader-example-card.has-image .jpdb-reader-example-media');
    if (!media) return;
    const rect = media.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.sqrt(Math.min(rect.width / 1280, rect.height / 720));
    const size = Math.max(13, Math.min(24, Math.round(28 * Math.max(0.5, scale))));
    media.style.setProperty('--subtitle-font-size', `${size}px`);
}

async function decodeNewTabImmersionImage(src: string): Promise<void> {
    if (!src || typeof Image === 'undefined') return;
    const image = new Image();
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.src = src;
    if (typeof image.decode === 'function') await image.decode().catch(() => undefined);
}

function renderSearchHandwritingPanel(language: ReaderSettings['interfaceLanguage']): HTMLElement {
    return el('details', { id: 'jpdb-reader-newtab-handwriting', class: 'jpdb-reader-newtab-handwriting', dataset: { newtabHandwriting: true } },
        el('summary', {}, uiText(language, 'drawKanji')),
        el('div', { class: 'jpdb-reader-newtab-handwriting-body' },
            el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle jpdb-reader-newtab-search-doodle trace-hidden', dataset: { kanji: '' } },
                el('div', { class: 'jpdb-reader-doodle-ghost', hidden: true }),
                el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': uiText(language, 'drawKanji'), tabIndex: 0 }),
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
    }, uiText(language, 'typeOrPasteKanji'));
}

function readerWordSurfaceText(word: HTMLElement): string {
    const clone = word.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
    return clone.textContent ?? '';
}

function shouldResolveInitialWordIndex(poolChanged: boolean, preferStoredWord: boolean): boolean {
    return poolChanged || preferStoredWord;
}

function isReviewSource(source: JPDBCard['reviewSource']): boolean {
    return source === 'anki' || source === 'jpdb-api' || source === 'jpdb-live';
}

function isPositiveJpdbCard(card: JPDBCard): boolean {
    return card.source === 'jpdb' && card.vid > 0 && card.sid > 0;
}

function newTabCardSourceLabel(card: JPDBCard, language: ReaderSettings['interfaceLanguage']): string {
    if (card.source === 'anki' || card.reviewSource === 'anki') return 'Anki';
    if (card.source === 'local' || card.source === 'fallback' || card.reviewSource === 'dictionary') return uiText(language, 'dictionary');
    if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api' || card.reviewSource === 'jpdb-live') return 'JPDB';
    return card.vid > 0 && card.sid > 0 ? 'JPDB' : uiText(language, 'dictionary');
}

function newTabPitchClass(card: JPDBCard): string {
    return getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
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
    'not-in-deck',
    'redundant',
];

function newTabKanjiKeyword(card: JPDBCard, fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null, localMeanings: string[]): string {
    return fullInfo?.keyword || rtk?.keyword || card.kanjiKeyword || localMeanings[0] || '';
}

function oldFormsFact(fullInfo: JpdbKanjiInfo | null): string {
    return fullInfo?.oldForms.length ? fullInfo.oldForms.join(', ') : '';
}

interface NewTabLoadResult {
    cards: JPDBCard[];
    sourceLabel: string;
    needsDictionarySetup: boolean;
    reviewCountMode?: boolean;
}

interface NewTabLoadAccumulator {
    cards: JPDBCard[];
    labels: string[];
    dictionarySetupRequired: boolean;
    reviewCountMode: boolean;
}

interface NewTabLoadOptions {
    useOfflineCache?: boolean;
}

type NewTabWordSource = Exclude<ReaderSettings['newTabSource'], 'auto'>;

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

interface QueuedNewTabGrade {
    id: string;
    at: number;
    target: 'anki' | 'jpdb-api';
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

const log = Logger.scope('NewTab');
const SESSION_WORD_KEY = 'jpdb-reader-newtab-current-word';
const JPDB_ALL_DECKS = 'all';
const JPDB_DECK_SAMPLE_LIMIT = 6;
const JPDB_WORDS_PER_DECK = 36;
const NEW_TAB_WORD_LIMIT = 180;
const NEW_TAB_DICTIONARY_FALLBACK_RANKS = [2000, 6000] as const;
const NEW_TAB_NAVIGATION_DEDUPE_MS = 550;
const NEW_TAB_SEARCH_DEBOUNCE_MS = 220;
const NEW_TAB_SEARCH_WORD_LIMIT = 10;
const NEW_TAB_SEARCH_KANJI_LIMIT = 6;
const NEW_TAB_SEARCH_SUGGESTION_LIMIT = 6;
const NEW_TAB_KANJI_FRONT_KEYWORD_LIMIT = 3;
const NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS = 8_000;
const NEW_TAB_HANDWRITING_DEBOUNCE_MS = 360;
const NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT = 240;
const NEW_TAB_HANDWRITING_GOOGLE_URL = 'https://www.google.com/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';
const NEW_TAB_HANDWRITING_COMMON_KANJI =
    '一丁七万三上下不世中主久乗九予事二五井交京人今介仏仕他付代令以休会伝住何作使例供係信借元兄光入全公六共内円写冬出分切前力加動北十千午半南原反取口古台同名向君告周味呼命和品員問四回国土在地坂堂場声売夏夕外多夜大天太夫央女好妹姉始子字学安家宿寒寺小少山川工左市帰年広店度庭建引弟強待後心思急息悪手持教文方旅日早明春昼時曜書有朝木本村来東林校森業楽歌止正歩母毎気水池海父物犬王生田町男白百的目知石社私秋空立竹笑答米糸紙終聞肉自花英茶草行西見言話語読買赤走足車近通週道遠里野金長門間雨青音食飲駅高魚鳥黒'
        + '以衣医右雨運英映泳園遠王央横屋温化荷界開階寒感漢館岸起期客急級宮球究去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始姉指歯詩次事持式実写者主守酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対代第題炭短談着注柱丁帳調追定庭笛鉄転都度登島湯等豆動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和';
const NEW_TAB_HEADER_LABEL = 'yomu';
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
const NEW_TAB_GRADE_QUEUE_LIMIT = 200;
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

export function clearNewTabOfflineCache(): Promise<void> {
    return gmStorageDelete(NEW_TAB_CACHE_KEY);
}

export class NewTabController {
    private allWords: JPDBCard[] = [];
    private visibleWords: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private visiblePoolSignature = '';
    private state: NewTabUiState;
    private readonly stateChannel: ReturnType<typeof createNewTabStateChannel>;
    private readonly unsubscribeJpdbBridge: () => void;
    private liveJpdbStatus: JpdbReviewBridgeStatus | null = null;
    private liveCards = new Map<string, JpdbReviewBridgeCard>();
    private keywordCache = new Map<string, string>();
    private kanjiInfoCache = new Map<string, KanjiDetailCacheEntry>();
    private uchisenDataCache = new Map<string, Promise<UchisenData | null>>();
    private immersionCache = new Map<string, Promise<ImmersionKitExample[]>>();
    private immersionExampleIndex = new Map<string, number>();
    private frontSentenceCache = new Map<string, Promise<string>>();
    private wordPitchCache = new Map<string, Promise<string[]>>();
    private doodlePreviewCache = new Map<string, string>();
    private immersionAudio?: HTMLAudioElement;
    private immersionAudioKey = '';
    private immersionAudioRequestId = 0;
    private dictionarySetupRequired = false;
    private dictionarySetupSignature = '';
    private reviewCountMode = false;
    private loadGeneration = 0;
    private searchGeneration = 0;
    private searchDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchQuery = '';
    private searchActiveSuggestionIndex = -1;
    private searchHandwritingStrokes: DoodleStroke[] = [];
    private searchHandwritingGeneration = 0;
    private searchHandwritingDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchHandwritingShapeCandidateCache = new Map<string, Promise<KanjiShapeCandidate | null>>();
    private rootEventController: AbortController | undefined;
    private lastPointerNavigation: { action: 'next' | 'previous'; time: number } | null = null;

    constructor(private readonly dependencies: NewTabControllerDependencies) {
        const saved = loadNewTabUiState();
        this.state = {
            ...saved,
            source: hasSavedNewTabUiState() ? saved.source : dependencies.getSettings().newTabSource,
        };
        this.stateChannel = createNewTabStateChannel(state => this.applyExternalState(state));
        this.unsubscribeJpdbBridge = dependencies.jpdbReviewBridge.onUpdate(status => this.applyJpdbBridgeStatus(status));
    }

    isCurrentPage(): boolean {
        return isYomuNewTabUrl(location.href);
    }

    async renderPage(): Promise<void> {
        document.title = `${APP_NAME} ${this.text('newTabPage')}`;
        document.documentElement.classList.add('jpdb-reader-newtab-document');
        const settings = this.dependencies.getSettings();
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
            root.replaceChildren(this.renderEnabledContent());
            this.syncMode(root);
        }
        this.syncThemeToggle(root);

        if (this.state.mode === 'search') {
            this.renderSearch(root);
            return;
        }

        if (this.shouldUseCachedDictionarySetup(settings)) {
            this.renderDictionarySetup(root);
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
            || root.dataset.standaloneNewtab === 'true';
    }

    destroy(): void {
        this.stateChannel.close();
        this.unsubscribeJpdbBridge();
        this.rootEventController?.abort();
        this.clearSearchDebounce();
        this.clearSearchHandwritingDebounce();
        this.frontSentenceCache.clear();
        this.rootEventController = undefined;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (root) delete root.dataset.newtabBound;
    }

    async refreshExternalData(): Promise<void> {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root) return;
        this.dependencies.dictionaries.invalidateCaches?.();
        this.dictionarySetupRequired = false;
        this.dictionarySetupSignature = '';
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        await this.loadWordsInto(root, true);
    }

    lookupGradeOptions(card: JPDBCard): Array<[JPDBGrade, string]> {
        return this.isCurrentLookupGradeCard(card) ? newTabGradeOptions(this.dependencies.getSettings()) : [];
    }

    async gradeFromLookup(grade: JPDBGrade): Promise<void> {
        await this.gradeCurrentCard(grade);
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

    private text(key: UiCopyKey): string {
        return uiText(this.language(), key);
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
        this.dictionarySetupRequired = false;
        this.dictionarySetupSignature = '';
        this.reviewCountMode = false;
        this.searchGeneration++;
        this.clearSearchDebounce();
        this.searchQuery = '';
        this.searchHandwritingGeneration++;
        this.clearSearchHandwritingDebounce();
        this.searchHandwritingStrokes = [];
        this.liveCards.clear();
        this.keywordCache.clear();
        this.kanjiInfoCache.clear();
        this.uchisenDataCache.clear();
        this.searchHandwritingShapeCandidateCache.clear();
        this.immersionCache.clear();
        this.immersionExampleIndex.clear();
        this.frontSentenceCache.clear();
        this.doodlePreviewCache.clear();
        this.immersionAudio?.pause();
        this.immersionAudio = undefined;
        this.immersionAudioKey = '';
        this.immersionAudioRequestId++;
    }

    private renderEnabledContent(): DocumentFragment {
        const brand = resolveNewTabBrandAssets(location.href);
        const language = this.language();
        return fragment(
            el('div', { class: 'jpdb-reader-newtab-shell' },
                el('header', { class: 'jpdb-reader-newtab-topbar' },
                    el('div', { class: 'VPNavBarTitle jpdb-reader-newtab-brand', 'data-v-6aa21345': '', 'data-v-1168a8e4': '' },
                        el('a', { class: 'title', href: brand.homeHref, 'data-v-1168a8e4': '' },
                            el('img', { class: 'VPImage logo', src: brand.iconSrc, alt: '', width: 24, height: 24, 'data-v-8426fc1a': '' }),
                            el('span', { 'data-v-1168a8e4': '' }, NEW_TAB_HEADER_LABEL),
                        ),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-mode', role: 'group', 'aria-label': uiText(language, 'newTabMode') },
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'word' } }, uiText(language, 'word')),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' } }, uiText(language, 'kanji')),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'search' } }, uiText(language, 'search')),
                    ),
                    el('div', { class: 'VPNavBarAppearance appearance jpdb-reader-theme-appearance' },
                        el('button', {
                            class: 'VPSwitch VPSwitchAppearance jpdb-reader-theme-switch',
                            type: 'button',
                            role: 'switch',
                            dataset: { newtabAction: 'theme' },
                            'aria-label': uiText(language, 'switchToLightTheme'),
                            'aria-checked': 'false',
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
                        class: 'jpdb-reader-newtab-overflow',
                        type: 'button',
                        dataset: { newtabAction: 'settings' },
                        'aria-label': uiText(language, 'openYomuSettings'),
                    }, '...'),
                ),
                el('section', { class: 'jpdb-reader-newtab-study', dataset: { newtabStudy: true }, 'aria-live': 'polite' },
                    el('div', { class: 'jpdb-reader-newtab-count', dataset: { newtabCount: true } }, '0 / 0'),
                    el('h1', { class: 'jpdb-reader-newtab-prompt', dataset: { newtabPrompt: true }, lang: 'ja' }, APP_NAME),
                    el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                        el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                        el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-status', dataset: { newtabStatus: true } }, uiText(language, 'loading')),
                    el('form', { class: 'jpdb-reader-newtab-search', dataset: { newtabSearch: true }, role: 'search', hidden: true },
                        el('div', { class: 'jpdb-reader-newtab-searchbox' },
                            el('input', {
                                type: 'search',
                                dataset: { newtabSearchInput: true },
                                placeholder: uiText(language, 'searchWordsOrKanji'),
                                autocomplete: 'on',
                                autocapitalize: 'none',
                                autocorrect: 'off',
                                inputmode: 'text',
                                spellcheck: false,
                                enterkeyhint: 'search',
                                lang: 'ja',
                                'aria-label': uiText(language, 'searchWordsOrKanji'),
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
                            }, uiText(language, 'draw')),
                            el('button', { type: 'button', dataset: { newtabAction: 'search-clear' }, 'aria-label': uiText(language, 'clearSearch') }, uiText(language, 'clear')),
                        ),
                        el('div', {
                            id: 'jpdb-reader-newtab-autocomplete',
                            class: 'jpdb-reader-newtab-search-suggestions',
                            dataset: { newtabSearchAutocomplete: true },
                            role: 'listbox',
                            'aria-label': uiText(language, 'searchSuggestions'),
                        }),
                        el('div', { class: 'jpdb-reader-newtab-search-results', dataset: { newtabSearchResults: true }, 'aria-live': 'polite' }),
                    ),
                ),
                el('nav', { class: 'jpdb-reader-newtab-controls', dataset: { newtabControls: true }, 'aria-label': uiText(language, 'studyNavigation') },
                    el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': uiText(language, 'previousWord') }, uiText(language, 'previousWord')),
                    el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, uiText(language, 'reveal')),
                    el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': uiText(language, 'nextWord') }, uiText(language, 'nextWord')),
                ),
                el('a', {
                    class: 'jpdb-reader-newtab-install',
                    href: DOCS_BASE_URL,
                    target: '_blank',
                    rel: 'noopener',
                    hidden: true,
                    dataset: { newtabInstall: true },
                }, uiText(language, 'getYomu')),
            ),
        );
    }

    private bindRootEvents(root: HTMLElement): void {
        this.rootEventController?.abort();
        const controller = new AbortController();

        root.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (this.handleNestedLookupClick(root, target, event)) return;
            const action = target.closest<HTMLElement>('[data-newtab-action]')?.dataset.newtabAction;
            const immersionAction = target.closest<HTMLElement>('[data-immersion-action]')?.dataset.immersionAction;
            const translation = target.closest<HTMLElement>('.jpdb-reader-example-translation');
            if (translation && root.contains(translation)) {
                event.preventDefault();
                this.toggleNewTabImmersionTranslations(root);
                return;
            }
            if (immersionAction) {
                event.preventDefault();
                this.performNewTabImmersionAction(root, immersionAction);
                return;
            }
            if (action === 'settings') {
                event.preventDefault();
                this.dependencies.showSettings('basics');
                return;
            }
            if (action === 'theme') {
                event.preventDefault();
                void this.toggleTheme(root);
                return;
            }
            if (action === 'load-dictionary') {
                event.preventDefault();
                this.dependencies.showSettings('dictionaries');
                return;
            }
            if (this.handleSearchClick(root, target, event, action)) return;
            if (action === 'mode') {
                event.preventDefault();
                const requestedMode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode;
                const mode = requestedMode === 'kanji' || requestedMode === 'search' ? requestedMode : 'word';
                this.setState({ mode, revealAnswer: false }, root, { preserveWord: true });
                return;
            }
            if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
            if (action === 'next') {
                event.preventDefault();
                if (!this.acceptPointerNavigation('next', event)) return;
                this.showNextWord();
                return;
            }
            if (action === 'skip') {
                event.preventDefault();
                if (!this.acceptPointerNavigation('next', event)) return;
                this.showNextWord();
                return;
            }
            if (action === 'previous') {
                event.preventDefault();
                if (!this.acceptPointerNavigation('previous', event)) return;
                this.showPreviousWord();
                return;
            }
            if (action === 'reveal') {
                event.preventDefault();
                this.toggleReveal(root);
                return;
            }
            if (action === 'grade') {
                event.preventDefault();
                const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
                if (grade) void this.gradeCurrentCard(grade);
                return;
            }
            if (action === 'jpdb-kanji-action') {
                event.preventDefault();
                const actionId = target.closest<HTMLElement>('[data-kanji-action-id]')?.dataset.kanjiActionId ?? '';
                void this.performJpdbKanjiAction(root, actionId);
                return;
            }
            if (this.state.mode === 'search') return;
            const study = target.closest<HTMLElement>('[data-newtab-study]');
            if (study && !isNewTabStudyInteractiveTarget(target)) {
                event.preventDefault();
                this.toggleReveal(root);
            }
        }, { signal: controller.signal });

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
        if (dictionaryLink && root.contains(dictionaryLink)) return this.handleNestedDictionaryLink(dictionaryLink, event);

        const actionTarget = target.closest<HTMLElement>('[data-action]');
        if (!actionTarget || !root.contains(actionTarget)) {
            return this.handleNewTabImmersionWordLookup(root, target, event)
                || this.handlePromptLookupClick(root, target, event);
        }
        return this.handleNestedLookupAction(actionTarget, event);
    }

    private handleNewTabImmersionWordLookup(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const word = target.closest<HTMLElement>('.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence .jpdb-reader-word');
        if (!word || !root.contains(word)) return false;
        const getCachedCard = (this.dependencies.parser as ReaderParser & { getCachedCard?: (vid: number, sid: number) => JPDBCard | undefined }).getCachedCard;
        const card = typeof getCachedCard === 'function'
            ? getCachedCard.call(this.dependencies.parser, Number(word.dataset.vid), Number(word.dataset.sid))
            : undefined;
        if (card && this.dependencies.showLookupCard) {
            consumeNestedLookupEvent(event);
            void this.dependencies.showLookupCard(card, word.dataset.sentence || cleanNestedLookupValue(readerWordSurfaceText(word)) || card.spelling, word);
            return true;
        }
        const expression = cleanNestedLookupValue(readerWordSurfaceText(word));
        if (!expression) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupText?.(expression, word.dataset.sentence || expression, word);
        return true;
    }

    private handlePromptLookupClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        if (this.state.mode !== 'word') return false;
        const prompt = target.closest<HTMLElement>('[data-newtab-prompt]');
        if (!prompt || !root.contains(prompt)) return false;
        const card = this.visibleWords[this.index];
        if (!card) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupText?.(card.spelling, card.reading || card.spelling, prompt);
        return true;
    }

    private handleNestedDictionaryLink(link: HTMLAnchorElement, event: MouseEvent): boolean {
        const query = cleanNestedLookupValue(link.dataset.dictionaryLookup);
        if (!query) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupDictionaryReference?.(
            query,
            link.dataset.dictionaryReading ?? '',
            link.dataset.dictionary ?? '',
            link,
        );
        return true;
    }

    private handleNestedLookupAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const action = actionTarget.dataset.action;
        if (action === 'kanji') {
            return this.handleNestedKanjiAction(actionTarget, event);
        }
        if (action === 'similar-word' || action === 'lookup') {
            return this.handleNestedTermLookupAction(actionTarget, event);
        }
        return false;
    }

    private handleNestedKanjiAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const card = this.visibleWords[this.index];
        const kanji = actionTarget.dataset.kanji ?? '';
        if (!card || !kanji) return false;
        consumeNestedLookupEvent(event);
        if (this.dependencies.showKanjiCard) {
            void this.dependencies.showKanjiCard(card, kanji, sentenceForCard(card), actionTarget);
        } else {
            void this.dependencies.lookupText?.(kanji, kanji, actionTarget);
        }
        return true;
    }

    private handleNestedTermLookupAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const term = cleanNestedLookupValue(actionTarget.dataset.expression ?? actionTarget.dataset.term);
        if (!term) return false;
        const reading = cleanNestedLookupValue(actionTarget.dataset.reading);
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupText?.(term, reading || term, actionTarget);
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
        const useOfflineCache = options.useOfflineCache !== false;
        try {
            const usedCachedWords = useOfflineCache
                ? await this.applyOfflineCacheWhileLoading(root, preferStoredWord, loadGeneration)
                : false;
            const result = await this.loadWordsWithProgress(root, loadGeneration, usedCachedWords);
            if (!this.isCurrentLoad(loadGeneration)) return;
            await this.applyLoadedWords(root, preferStoredWord, loadGeneration, result, useOfflineCache);
        } catch (error) {
            await this.handleLoadWordsError(root, preferStoredWord, loadGeneration, error, useOfflineCache);
        }
    }

    private async loadWordsWithProgress(root: HTMLElement, loadGeneration: number, usedCachedWords = false): Promise<NewTabLoadResult> {
        const onProgress = (message: string): void => {
            if (this.isCurrentLoad(loadGeneration)) this.setStatus(root, message);
        };
        if (!usedCachedWords) onProgress(this.text('loading'));
        return this.loadWords(onProgress);
    }

    private async applyLoadedWords(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number, result: NewTabLoadResult, useOfflineCache: boolean): Promise<void> {
        const preferredCardKey = this.currentVisibleWordKey();
        this.dictionarySetupRequired = result.needsDictionarySetup;
        this.allWords = dedupeWords(result.cards).slice(0, NEW_TAB_WORD_LIMIT);
        this.reviewCountMode = result.reviewCountMode === true;
        this.sourceLabel = result.sourceLabel;
        if (this.allWords.length) void this.writeOfflineCache(this.allWords, this.sourceLabel);
        if (!this.allWords.length && useOfflineCache) await this.applyOfflineCacheIfAvailable(root, loadGeneration);
        if (!this.isCurrentLoad(loadGeneration)) return;
        this.dependencies.parser.cacheCards(this.allWords);
        void this.flushQueuedGrades();
        if (!this.allWords.length) {
            await this.renderEmptyWordLoad(root);
            return;
        }
        delete root.dataset.standaloneNewtab;
        this.applyWords(root, preferStoredWord, preferredCardKey);
    }

    private async applyOfflineCacheWhileLoading(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number): Promise<boolean> {
        if (this.allWords.length || this.state.mode === 'search') return false;
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length) return false;
        this.allWords = cached.cards;
        this.reviewCountMode = false;
        this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
        this.dependencies.parser.cacheCards?.(this.allWords);
        this.applyWords(root, preferStoredWord);
        return true;
    }

    private async applyOfflineCacheIfAvailable(root: HTMLElement, loadGeneration: number): Promise<void> {
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length) return;
        this.allWords = cached.cards;
        this.reviewCountMode = false;
        this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
        this.setStatus(root, this.text('offlineCache'));
    }

    private async renderEmptyWordLoad(root: HTMLElement): Promise<void> {
        if (!this.dictionarySetupRequired) {
            this.renderEmpty(root, APP_NAME, this.text('noWordsYet'));
            return;
        }
        this.renderDictionarySetup(root);
    }

    private async handleLoadWordsError(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number, error: unknown, useOfflineCache: boolean): Promise<void> {
        log.warn('Failed to load words', error);
        const cached = useOfflineCache ? await this.readOfflineCache() : { cards: [], sourceLabel: '' };
        if (!this.isCurrentLoad(loadGeneration)) return;
        if (cached.cards.length) {
            this.allWords = cached.cards;
            this.reviewCountMode = false;
            this.sourceLabel = this.offlineSourceLabel(cached.sourceLabel);
            this.dependencies.parser.cacheCards(this.allWords);
            this.applyWords(root, preferStoredWord);
            this.setStatus(root, this.text(this.offlineCacheStatusKey(cached.cards)));
            return;
        }
        this.renderEmpty(root, APP_NAME, this.text('couldNotLoadWords'));
    }

    private offlineCacheStatusKey(cards: JPDBCard[]): UiCopyKey {
        return cards.some(card => this.canReviewCard(card) && this.offlineGradeTarget(card)) ? 'offlineGradesDisabled' : 'offlineCache';
    }

    private async loadWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const accumulator = await this.loadConfiguredWordSources(onProgress);
        await this.loadAutoDictionaryWordsIfNeeded(accumulator, onProgress);
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
        const results = await Promise.all([
            this.loadJpdbWords(),
            this.loadAnkiWords(),
        ]);
        return interleavedNewTabLoadAccumulator(results);
    }

    private async appendLoadedWordsFromSource(accumulator: NewTabLoadAccumulator, source: NewTabWordSource, onProgress?: (message: string) => void): Promise<void> {
        appendNewTabLoadResult(accumulator, await this.loadWordsFromSource(source, onProgress));
    }

    private async loadAutoDictionaryWordsIfNeeded(accumulator: NewTabLoadAccumulator, onProgress?: (message: string) => void): Promise<void> {
        if (!this.shouldLoadAutoDictionaryWords(accumulator)) return;
        appendNewTabLoadResult(accumulator, await this.loadDictionaryWords(onProgress));
    }

    private shouldLoadAutoDictionaryWords(accumulator: NewTabLoadAccumulator): boolean {
        return this.state.source === 'auto' && accumulator.cards.length === 0;
    }

    private wordSourceOrder(): readonly NewTabWordSource[] {
        return [this.state.source as NewTabWordSource];
    }

    private loadWordsFromSource(source: NewTabWordSource, onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        if (source === 'anki') return this.loadAnkiWords();
        if (source === 'jpdb') return this.loadJpdbWords();
        return this.loadDictionaryWords(onProgress);
    }

    private async loadAnkiWords(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.ankiEnabled) return { cards: [], sourceLabel: 'Anki', needsDictionarySetup: false, reviewCountMode: true };
        const cards = await this.remoteSourceWithFallback(
            'Anki',
            this.dependencies.anki.listNewTabCards(80),
            [] as JPDBCard[],
        );
        return { cards, sourceLabel: cards.length ? 'Anki' : 'Anki', needsDictionarySetup: false, reviewCountMode: true };
    }

    private async loadDictionaryWords(_onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        try {
            const summary = await this.dependencies.dictionaries.summary().catch(() => null);
            if (!summary?.dictionaries.length) {
                return { cards: [], sourceLabel: this.text('dictionary'), needsDictionarySetup: true, reviewCountMode: false };
            }

            const entries = await this.loadDictionaryFallbackEntries(settings);
            return {
                cards: entries.map(entry => this.dependencies.parser.localCardFromEntry(entry)),
                sourceLabel: this.text('dictionary'),
                needsDictionarySetup: false,
                reviewCountMode: false,
            };
        } catch {
            return { cards: [], sourceLabel: this.text('dictionary'), needsDictionarySetup: false, reviewCountMode: false };
        }
    }

    private async loadDictionaryFallbackEntries(settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        for (const maxRank of NEW_TAB_DICTIONARY_FALLBACK_RANKS) {
            const entries = await this.dependencies.dictionaries.listRandomTopTerms(
                NEW_TAB_WORD_LIMIT,
                maxRank,
                settings.dictionaryPreferences,
                { fallbackToRandom: false },
            );
            if (entries.length) return entries;
        }
        return await this.dependencies.dictionaries.listRandomTerms(NEW_TAB_WORD_LIMIT, settings.dictionaryPreferences);
    }

    private async loadJpdbWords(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) return { cards: [], sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: true };
        const live = this.loadLiveJpdbReviewWords(settings);
        if (live) return live;
        if (!settings.apiKey.trim()) return { cards: [], sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: true };

        const selectedDeck = settings.newTabJpdbDeck.trim() || JPDB_ALL_DECKS;
        const selectedDeckCards = await this.loadSelectedJpdbDeckWords(selectedDeck);
        if (selectedDeckCards) return selectedDeckCards;

        return this.loadSampledJpdbDeckWords();
    }

    private loadLiveJpdbReviewWords(settings: ReaderSettings): NewTabLoadResult | null {
        if (settings.newTabJpdbReviewMode === 'api-vocabulary') return null;
        const live = this.liveCardFromBridge();
        if (live) return { cards: [live], sourceLabel: `JPDB ${this.text('liveReview')}`, needsDictionarySetup: false, reviewCountMode: true };
        this.dependencies.jpdbReviewBridge.requestCurrent();
        return settings.newTabJpdbReviewMode === 'live-review'
            ? { cards: [], sourceLabel: `JPDB ${this.text('liveReview')}`, needsDictionarySetup: false, reviewCountMode: true }
            : null;
    }

    private async loadSelectedJpdbDeckWords(selectedDeck: string): Promise<NewTabLoadResult | null> {
        if (selectedDeck === JPDB_ALL_DECKS) return null;
        try {
            const cards = markJpdbApiReviewCards(await this.remoteSourceWithFallback(
                'JPDB selected deck',
                this.dependencies.jpdb.listDeckCards(selectedDeck, NEW_TAB_WORD_LIMIT),
                [] as JPDBCard[],
            ));
            return { cards, sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: true };
        } catch {
            return null;
        }
    }

    private async loadSampledJpdbDeckWords(): Promise<NewTabLoadResult> {
        const decks = await this.remoteSourceWithFallback(
            'JPDB deck list',
            this.dependencies.jpdb.listDecks(),
            [],
        );
        const eligibleDecks = decks
            .filter(deck => !/(never\s*-?\s*forget|blacklist|suspend)/i.test(`${deck.id} ${deck.name}`))
            .slice(0, JPDB_DECK_SAMPLE_LIMIT);
        const cards = (await Promise.all(eligibleDecks.map(deck =>
            this.remoteSourceWithFallback(
                `JPDB deck ${deck.id}`,
                this.dependencies.jpdb.listDeckCards(deck.id, JPDB_WORDS_PER_DECK),
                [] as JPDBCard[],
            )
                .then(markJpdbApiReviewCards)
        ))).flat();

        return { cards, sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: cards.length > 0 };
    }

    private async remoteSourceWithFallback<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
        try {
            return await promiseWithTimeout(promise, NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS, `${label} timed out.`);
        } catch (error) {
            log.warn('New tab remote source failed', { label, error });
            return fallback;
        }
    }

    private isCurrentLoad(loadGeneration: number): boolean {
        return this.loadGeneration === loadGeneration;
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean }): void {
        const preferredCardKey = options.preserveWord ? this.currentVisibleWordKey() : '';
        this.state = { ...this.state, ...patch };
        this.persistState();
        this.syncMode(root);
        this.applyWords(root, options.preserveWord, preferredCardKey);
    }

    private applyExternalState(state: NewTabUiState): void {
        if (JSON.stringify(this.state) === JSON.stringify(state)) return;
        const preferredCardKey = this.currentVisibleWordKey();
        this.state = state;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root) return;
        this.syncMode(root);
        this.applyWords(root, true, preferredCardKey);
    }

    private persistState(): void {
        saveNewTabUiState(this.state);
        this.stateChannel.publish(this.state);
    }

    private applyWords(root: HTMLElement, preferStoredWord: boolean, preferredCardKey = ''): void {
        this.syncMode(root);
        if (this.state.mode === 'search') {
            this.renderSearch(root);
            return;
        }
        if (this.shouldUseCachedDictionarySetup(this.dependencies.getSettings())) {
            this.renderDictionarySetup(root);
            return;
        }
        const baseWords = this.studyPoolForCurrentMode();
        const poolSignature = this.newTabPoolSignature(baseWords);
        const poolChanged = poolSignature !== this.visiblePoolSignature;
        const preferredKey = preferredCardKey || this.preferredStoredWordKey(preferStoredWord);
        if (poolChanged) this.replaceVisibleWordPool(baseWords, poolSignature, preferredKey);
        if (!this.ensureVisibleWords(root)) return;
        if (preferredKey || shouldResolveInitialWordIndex(poolChanged, preferStoredWord)) this.index = this.resolveInitialIndex(preferStoredWord, preferredKey);
        this.index = Math.max(0, Math.min(this.index, this.visibleWords.length - 1));
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private shouldRenderDictionarySetup(): boolean {
        return !this.allWords.length && this.dictionarySetupRequired;
    }

    private shouldUseCachedDictionarySetup(settings: ReaderSettings): boolean {
        return this.shouldRenderDictionarySetup()
            && this.dictionarySetupSignature === this.dictionarySetupStateSignature(settings);
    }

    private dictionarySetupStateSignature(settings: ReaderSettings = this.dependencies.getSettings()): string {
        const preferences = settings.dictionaryPreferences
            .map(preference => [
                preference.name,
                preference.alias,
                preference.enabled ? '1' : '0',
                preference.priority,
                preference.type ?? 'terms',
            ].join('\x1f'))
            .join('\x1e');
        return [
            this.state.source,
            settings.newTabSource,
            settings.localDictionariesEnabled ? 'local' : 'no-local',
            settings.apiKey.trim() ? 'jpdb-key' : 'no-jpdb-key',
            settings.jpdbMiningEnabled ? 'jpdb-actions' : 'no-jpdb-actions',
            settings.ankiEnabled ? 'anki' : 'no-anki',
            settings.newTabJpdbDeck,
            settings.newTabJpdbReviewMode,
            preferences,
        ].join('\x1d');
    }

    private studyPoolForCurrentMode(): JPDBCard[] {
        return selectNewTabStudyPool(this.cardsForCurrentMode(this.allWords));
    }

    private cardsForCurrentMode(cards: JPDBCard[]): JPDBCard[] {
        return this.state.mode === 'kanji'
            ? cards.filter(card => kanjiCharacters(card.spelling).length > 0 || Boolean(card.kanjiKeyword))
            : cards;
    }

    private replaceVisibleWordPool(baseWords: JPDBCard[], poolSignature: string, preferredKey = ''): void {
        this.visibleWords = promoteCardByKey(baseWords, preferredKey);
        this.visiblePoolSignature = poolSignature;
    }

    private ensureVisibleWords(root: HTMLElement): boolean {
        if (this.visibleWords.length) return true;
        this.index = 0;
        this.renderEmpty(root, APP_NAME, this.text(this.state.mode === 'kanji' ? 'noKanjiCardsYet' : 'noWordsYet'));
        return false;
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
            const index = this.visibleWords.findIndex(card => cardKey(card) === preferredKey);
            if (index >= 0) return index;
        }
        return 0;
    }

    private currentVisibleWordKey(): string {
        const current = this.visibleWords[this.index];
        return current ? cardKey(current) : '';
    }

    private preferredStoredWordKey(preferStoredWord: boolean): string {
        if (!preferStoredWord) return '';
        const stored = this.readStoredWordKey();
        return stored?.signature === this.currentSessionSignature() ? stored.key : '';
    }

    private showNextWord(): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !this.visibleWords.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.index = (this.index + 1) % this.visibleWords.length;
        this.state.revealAnswer = false;
        this.persistState();
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private showPreviousWord(): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !this.visibleWords.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.index = (this.index - 1 + this.visibleWords.length) % this.visibleWords.length;
        this.state.revealAnswer = false;
        this.persistState();
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private renderWord(root: HTMLElement, card: JPDBCard): void {
        this.writeStoredWordKey(card);
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (study) study.dataset.newtabCard = cardKey(card);
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-empty-mode');
        root.classList.toggle('jpdb-reader-newtab-revealed', this.state.revealAnswer);
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        root.classList.toggle('jpdb-reader-newtab-review-mode', this.canReviewCard(card));
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        const state = primaryCardState(card.cardState);

        this.renderPromptForMode(slots, card, state);

        this.renderCount(slots.count, '');
        if (slots.reveal) slots.reveal.textContent = this.revealButtonLabel();
        this.renderControls(slots, card);
        this.renderInstallCta(root);
        if (slots.status) slots.status.textContent = this.newTabStatusLabel(card);
    }

    private renderPromptForMode(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (this.state.mode === 'kanji') this.renderKanjiPrompt(slots, card);
        else this.renderWordPrompt(slots, card, state);
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
        return [this.newTabCountLabel(card), newTabCardSourceLabel(card, this.language())].filter(Boolean).join(' · ');
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

    private renderKanjiPromptKeywords(keywords: KanjiPromptKeyword[]): HTMLElement | string {
        if (!keywords.length) return this.text('loading');
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
        if (answer) answer.textContent = this.state.revealAnswer && card.reading && card.reading !== card.spelling ? card.reading : '';
    }

    private renderWordMeaning(meaning: HTMLElement | null, card: JPDBCard): void {
        if (!meaning) return;
        if (this.state.revealAnswer) replaceChildrenWith(meaning, el('div', {}, firstCardMeaning(card)));
        else meaning.replaceChildren();
    }

    private renderWordPromptContent(
        prompt: HTMLElement,
        card: JPDBCard,
        state: ReturnType<typeof primaryCardState>,
        sentence: string,
    ): void {
        prompt.lang = 'ja';
        prompt.dataset.newtabExpression = 'true';
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

        const sentenceWrap = el('span', { class: 'jpdb-reader-newtab-sentence' });
        if (this.shouldRenderPlainSentencePrompt(card, sentence)) {
            sentenceWrap.append(document.createTextNode(sentence));
            wrap.append(sentenceWrap);
            return wrap;
        }

        if (this.shouldParseSentencePrompt()) {
            wrap.append(renderNewTabFrontSentence(card, sentence));
            return wrap;
        }

        const target = sentencePromptTarget(card, sentence);
        if (!target) {
            sentenceWrap.textContent = sentence;
            wrap.append(sentenceWrap);
            return wrap;
        }
        const start = sentence.indexOf(target);
        sentenceWrap.append(document.createTextNode(sentence.slice(0, start)));
        sentenceWrap.append(this.renderReaderWord(card, state, target, sentence));
        sentenceWrap.append(document.createTextNode(sentence.slice(start + target.length)));
        wrap.append(sentenceWrap);
        return wrap;
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
        await this.dependencies.parseContent?.(prompt)?.catch(() => undefined);
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
        this.renderWordPromptContent(prompt, card, state, sentence);
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
        const info = await this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(() => null);
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
        return el('div', { class: 'jpdb-reader-newtab-immersion' },
            this.renderNewTabImmersionToolbar(example, index, examples.length, hasAudio),
            this.renderNewTabImmersionExampleBody(card, example, settings, index, examples.length, audioUrls),
        );
    }

    private async parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void> {
        await this.dependencies.parseContent?.(root)?.catch(() => undefined);
        if (!this.canApplyNewTabImmersionParse(root, key)) return;
        this.highlightNewTabImmersionTarget(root, card);
    }

    private canApplyNewTabImmersionParse(root: HTMLElement, key: string): boolean {
        return root.isConnected
            && cardKey(this.visibleWords[this.index]) === key
            && this.state.mode === 'word'
            && this.state.revealAnswer;
    }

    private highlightNewTabImmersionTarget(root: HTMLElement, card: JPDBCard): void {
        this.highlightNewTabParsedTarget(root, '[data-immersion-sentence-render]', card);
    }

    private highlightNewTabParsedTarget(root: HTMLElement, selector: string, card: JPDBCard): void {
        const cardVid = String(card.vid);
        const cardSid = String(card.sid);
        const targets = [card.spelling, card.reading]
            .map(value => value.trim())
            .filter(Boolean);
        root.querySelectorAll<HTMLElement>(`${selector} .jpdb-reader-word`).forEach(word => {
            const surface = word.textContent?.replace(/\s+/g, '') ?? '';
            if ((word.dataset.vid === cardVid && word.dataset.sid === cardSid)
                || targets.some(target => surface.includes(target))) {
                word.classList.add('jpdb-reader-example-target');
                this.applyNewTabParsedTargetCardIdentity(word, card, surface);
            }
        });
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
        word.dataset.reading = card.reading;
        word.dataset.pitchClass = pitchClass;
        word.dataset.sentence ||= card.sentence || surface;
    }

    private renderNewTabImmersionToolbar(example: ImmersionKitExample, index: number, total: number, hasAudio: boolean): HTMLElement {
        return el('div', { class: 'jpdb-reader-example-toolbar' },
            el('div', { class: 'jpdb-reader-example-meta' },
                el('span', { class: 'jpdb-reader-example-source' }, newTabImmersionProviderLabel(example)),
                el('span', { class: 'jpdb-reader-example-title' }, example.sourceTitle),
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
        const sentence = renderNewTabImmersionSentence(card, example);
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
        return settings.immersionKitEnabled && settings.immersionKitAutoPlayAudio;
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
        const src = await this.dependencies.immersionKit.fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl)
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
        void this.dependencies.immersionKit.fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl)
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
        return this.dependencies.immersionKit
            .fetchBlobUrl(urls, this.dependencies.getSettings().audioTimeoutMs, this.dependencies.getSettings().corsProxyUrl)
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
        const promise = this.fetchNewTabImmersionExamples(card).catch(() => []);
        this.immersionCache.set(key, promise);
        return promise;
    }

    private async fetchNewTabImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> {
        const exactQuery = card.spelling.trim();
        const exactExamples = await this.searchNewTabImmersionQuery(exactQuery);
        if (exactExamples.length) return exactExamples;

        const fallbackQueries = await this.newTabImmersionFallbackQueries(card, exactQuery);
        for (const query of fallbackQueries) {
            const examples = await this.searchNewTabImmersionQuery(query);
            if (examples.length) return examples;
        }
        return [];
    }

    private searchNewTabImmersionQuery(query: string): Promise<ImmersionKitExample[]> {
        if (!query) return Promise.resolve([]);
        return this.dependencies.immersionKit.search(query, this.dependencies.getSettings()).catch(() => []);
    }

    private async newTabImmersionFallbackQueries(card: JPDBCard, exactQuery: string): Promise<string[]> {
        const candidates: string[] = [];
        this.addNewTabImmersionFallbackQuery(candidates, card.reading !== card.spelling ? card.reading : '', exactQuery);
        await this.addNewTabParsedImmersionFallbackQueries(candidates, card, exactQuery);
        this.addNewTabImmersionFallbackQueries(candidates, immersionFallbackFragments(card.spelling), exactQuery);
        await this.addNewTabJpdbImmersionFallbackQueries(candidates, card, exactQuery);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private async addNewTabJpdbImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        const settings = this.dependencies.getSettings();
        const jpdbInfo = settings.jpdbDefinitionsEnabled && this.dependencies.jpdbVocabulary
            ? await this.dependencies.jpdbVocabulary.lookup(card.vid, card.spelling, card.reading).catch(() => null)
            : null;
        this.addNewTabImmersionFallbackQueries(
            candidates,
            (jpdbInfo?.compounds ?? []).flatMap(compound => [compound.term, compound.reading]),
            exactQuery,
        );
    }

    private async addNewTabParsedImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        if (typeof this.dependencies.parser.canParse !== 'function' || !this.dependencies.parser.canParse()) return;
        const [tokens] = await this.dependencies.parser.parse([card.spelling]).catch(() => [[]]);
        for (const token of tokens ?? []) {
            this.addNewTabImmersionFallbackQuery(candidates, token.card.spelling, exactQuery);
            this.addNewTabImmersionFallbackQuery(candidates, card.spelling.slice(token.start, token.end), exactQuery);
            this.addNewTabImmersionFallbackQuery(candidates, token.card.reading !== token.card.spelling ? token.card.reading : '', exactQuery);
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

    private kanjiKeyword(card: JPDBCard, kanji: string): string {
        return this.keywordCache.get(kanji)
            || card.kanjiKeyword
            || '';
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
        const key = cardKey(card);
        const details = await this.loadKanjiDetails(kanji);
        if (!this.canApplyKanjiEnrichment(slots, key)) return;

        this.applyEnrichedKanjiKeyword(slots, card, kanji, details);
        this.applyEnrichedKanjiSvg(slots.answer, details.vg?.svg);
        this.applyEnrichedKanjiMeaning(slots, card, kanji, details);
        void this.applyEnrichedUchisenKeyword(slots, card, kanji, details);
    }

    private canApplyKanjiEnrichment(slots: NewTabStudySlots, key: string): boolean {
        if (this.state.mode !== 'kanji') return false;
        if (cardKey(this.visibleWords[this.index]) !== key) return false;
        const study = slots.prompt?.closest<HTMLElement>('[data-newtab-study]')
            ?? slots.answer?.closest<HTMLElement>('[data-newtab-study]');
        return !study || study.dataset.newtabCard === key;
    }

    private applyEnrichedKanjiKeyword(slots: NewTabStudySlots, card: JPDBCard, kanji: string, details: KanjiDetailBundle): void {
        const keyword = this.keywordFromDetails(card, details.jpdb, details.rtk);
        if (!keyword) return;
        this.keywordCache.set(kanji, keyword);
        if (slots.prompt && !this.state.revealAnswer) {
            replaceChildrenWith(slots.prompt, this.renderKanjiPromptKeywords(this.kanjiPromptKeywordsFromDetails(card, details)));
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
        if (!this.canApplyKanjiEnrichment(slots, cardKey(card))) return;
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
        void this.dependencies.parseContent?.(slots.meaning);
    }

    private renderNewTabUchisen(root: HTMLElement, kanji: string): void {
        const settings = this.dependencies.getSettings();
        const mount = root.querySelector<HTMLElement>('[data-newtab-uchisen-mount]');
        if (!mount || !settings.uchisenEnabled) return;
        const sourceAttributes = this.sourceAttributes(kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID));
        void this.loadUchisenDetails(kanji).then(data => {
            if (!mount.isConnected) return;
            if (!data?.images.length) {
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
            });
        }).catch(() => {
            if (mount.isConnected) mount.remove();
        });
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
            fact(uiText(language, 'factReadings'), newTabKanjiReadingsFact(fullInfo, language)),
            fact(uiText(language, 'factJpdbWords'), newTabKanjiVocabularyFact(fullInfo, language)),
            fact(uiText(language, 'factWordFrequency'), card.frequencyRank ? `#${card.frequencyRank}` : ''),
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
            if (!this.canApplyKanjiEnrichment(slots, cardKey(card)) || !section.isConnected || !mount.isConnected) return;
            const settings = this.dependencies.getSettings();
            const content = renderSimilarKanjiWordsContent(localEntries, fullInfo?.vocabulary ?? [], card, settings, name => this.dictionaryLabel(name));
            const help = uiText(settings.interfaceLanguage, localLoaded ? 'noSimilarWords' : 'loadingSimilarWords');
            setInnerHtml(mount, content || `<div class="jpdb-reader-help">${escapeHtml(help)}</div>`);
        };
        const load = () => {
            if (!section.open || started || !this.canApplyKanjiEnrichment(slots, cardKey(card))) return;
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

        if (settings.jpdbKanjiEnabled && !cache.jpdb) {
            cache.jpdb = this.dependencies.jpdbKanji.lookup(kanji).catch(() => null);
        }
        if (settings.rtkEnabled && !cache.rtk) {
            cache.rtk = this.dependencies.rtk.lookup(kanji).catch(() => null);
        }
        if (this.shouldLoadKanjiVG(settings) && !cache.vg) {
            cache.vg = this.dependencies.kanjiVG.lookup(kanji).catch(() => null);
        }
        if (this.shouldLoadLocalKanjiDetails(settings) && !cache.local) {
            cache.local = this.dependencies.dictionaries.lookupKanji?.(kanji, 6, settings.dictionaryPreferences).catch(() => []) ?? Promise.resolve([]);
        }

        cache.details = Promise.all([
            settings.jpdbKanjiEnabled ? cache.jpdb ?? Promise.resolve(null) : Promise.resolve(null),
            settings.rtkEnabled ? cache.rtk ?? Promise.resolve(null) : Promise.resolve(null),
            this.shouldLoadKanjiVG(settings) ? cache.vg ?? Promise.resolve(null) : Promise.resolve(null),
            this.shouldLoadLocalKanjiDetails(settings) ? cache.local ?? Promise.resolve([]) : Promise.resolve([]),
        ]).then(([jpdb, rtk, vg, local]) => ({ jpdb, rtk, vg, local, similar: [] }));
        cache.detailsSignature = signature;
        return cache.details;
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
        return this.dependencies.dictionaries.lookupSimilarTermsByKanji?.(kanji, settings.similarKanjiWordLimit, settings.dictionaryPreferences).catch(() => []) ?? [];
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return new Promise(resolve => {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
                return;
            }
            setTimeout(resolve, 0);
        });
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
        setOptionalText(slots.status, '');
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

    private renderDictionarySetup(root: HTMLElement): void {
        this.dictionarySetupSignature = this.dictionarySetupStateSignature();
        this.enterDictionarySetupMode(root);
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        this.renderPromptSlot(slots.prompt, this.text('startWithDictionary'));
        setOptionalText(slots.answer, this.text('addDictionaryStudyCards'));
        setOptionalText(slots.meaning, this.text('dictionaryReadyNewTabs'));
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, this.text('dictionaryInstallNewTabHelp'));
        this.renderDictionarySetupControls(slots.controls);
    }

    private enterDictionarySetupMode(root: HTMLElement): void {
        root.classList.add('jpdb-reader-newtab-revealed');
        root.classList.add('jpdb-reader-newtab-setup-mode');
        root.classList.remove('jpdb-reader-newtab-empty-mode', 'jpdb-reader-newtab-review-mode', 'jpdb-reader-newtab-kanji-mode');
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
    }

    private renderDictionarySetupControls(controls: HTMLElement | null): void {
        if (!controls) return;
        controls.hidden = false;
        replaceChildrenWith(controls,
            el('button', { type: 'button', dataset: { newtabAction: 'load-dictionary' } }, this.text('addDictionary')),
        );
    }

    private handleSearchClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        if (action === 'search-clear') {
            event.preventDefault();
            this.clearSearch(root);
            return true;
        }
        if (action === 'search-focus') {
            event.preventDefault();
            this.searchInput(root)?.focus();
            return true;
        }
        if (action === 'search-suggestion') {
            event.preventDefault();
            const query = target.closest<HTMLElement>('[data-query]')?.dataset.query ?? '';
            this.selectSearchSuggestion(root, query);
            return true;
        }
        if (action === 'search-handwriting-toggle') {
            event.preventDefault();
            this.toggleSearchHandwriting(root);
            return true;
        }
        if (action === 'handwriting-candidate') {
            event.preventDefault();
            const query = target.closest<HTMLElement>('[data-query]')?.dataset.query ?? '';
            this.acceptSearchHandwritingCandidate(root, query);
            return true;
        }
        if (action === 'search-copy') {
            event.preventDefault();
            const query = cleanNestedLookupValue(target.closest<HTMLElement>('[data-query]')?.dataset.query);
            if (query) void copyText(query);
            return true;
        }
        if (action === 'search-result-word') {
            event.preventDefault();
            const button = target.closest<HTMLElement>('[data-expression]');
            const expression = cleanNestedLookupValue(button?.dataset.expression);
            if (expression) void this.dependencies.lookupText?.(expression, cleanNestedLookupValue(button?.dataset.reading) || expression, button ?? target);
            return true;
        }
        if (action === 'search-result-kanji') {
            event.preventDefault();
            const button = target.closest<HTMLElement>('[data-kanji]');
            const kanji = cleanNestedLookupValue(button?.dataset.kanji);
            if (kanji) this.openSearchKanjiResult(kanji, button ?? target);
            return true;
        }
        return false;
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
            '[data-newtab-search-results] [data-newtab-action="search-result-word"], '
            + '[data-newtab-search-results] [data-newtab-action="search-result-kanji"], '
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
        const summary = await (this.dependencies.dictionaries.summary?.().catch(() => null) ?? Promise.resolve(null));
        const hasLocalDictionaries = Boolean(summary?.dictionaries.length);
        const [words, kanji] = await Promise.all([
            this.searchWordCards(query, hasLocalDictionaries),
            this.searchKanjiCards(query),
        ]);
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
            ? this.searchLocalDictionaryEntries(query, settings)
            : Promise.resolve([]);

        const loadedCards = this.searchLoadedWordCards(query);
        const [parsed, localEntries] = await Promise.all([parsedPromise, localEntriesPromise]);
        const parsedCards = (parsed[0] ?? []).map(token => ({ ...token.card, sentence: token.sentence ?? query }));
        const localCards = localEntries
            .map(entry => ({ ...this.dependencies.parser.localCardFromEntry(entry), sentence: query }));
        return dedupeWords([...parsedCards, ...loadedCards, ...localCards]).slice(0, NEW_TAB_SEARCH_WORD_LIMIT);
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

    private async searchKanjiCards(query: string): Promise<NewTabSearchKanjiResult[]> {
        const characters = kanjiCharacters(query).slice(0, NEW_TAB_SEARCH_KANJI_LIMIT);
        const results = await Promise.all(characters.map(character => this.searchKanjiResult(character)));
        return results.filter((result): result is NewTabSearchKanjiResult => Boolean(result));
    }

    private async searchKanjiResult(character: string): Promise<NewTabSearchKanjiResult | null> {
        const settings = this.dependencies.getSettings();
        const local = settings.localDictionariesEnabled && settings.localDictionaryShowKanji
            ? await this.dependencies.dictionaries.lookupKanji?.(character, 6, settings.dictionaryPreferences).catch(() => []) ?? []
            : [];
        const meanings = uniqueStrings(local.flatMap(entry => entry.meanings)).slice(0, 6);
        const readings = newTabKanjiReadings(null, uniqueStrings(local.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))).slice(0, 8);
        const card = this.dependencies.parser.fallbackCardFromText(character);
        return {
            character,
            keyword: newTabKanjiKeyword(card, null, null, meanings),
            readings,
            meanings,
            words: [],
        };
    }

    private renderSearchIdle(root: HTMLElement): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        delete results.dataset.searchQuery;
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
        if (this.searchActiveSuggestionIndex < 0 || this.searchActiveSuggestionIndex >= suggestions.length) {
            this.searchActiveSuggestionIndex = 0;
        }
        mount.hidden = false;
        replaceChildrenWith(mount, suggestions.map((suggestion, index) => this.renderSearchSuggestion(suggestion, index)));
        this.setSearchActiveSuggestion(root, this.searchActiveSuggestionIndex);
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
        const resultCount = results.words.length + results.kanji.length;
        this.renderSearchAutocomplete(root, results.query, results.suggestions);
        replaceChildrenWith(mount,
            this.renderExternalSearchLinks(results.query, !results.hasLocalDictionaries || resultCount === 0),
            results.words.length ? this.renderSearchWordResults(results.words) : null,
            results.kanji.length ? this.renderSearchKanjiResults(results.kanji) : null,
            resultCount ? null : this.renderSearchNoResults(results),
        );
    }

    private renderSearchError(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
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

    private renderSearchWordResult(card: JPDBCard): HTMLButtonElement {
        const meaning = firstCardMeaning(card);
        const meta = [card.reading && card.reading !== card.spelling ? card.reading : '', cardStateLabel(card, this.language()), card.frequencyRank ? `#${card.frequencyRank}` : ''].filter(Boolean).join(' · ');
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-word',
            dataset: { newtabAction: 'search-result-word', expression: card.spelling, reading: card.reading },
        },
        el('span', { class: 'jpdb-reader-newtab-search-term', lang: 'ja' }, card.spelling),
        meta ? el('span', { class: 'jpdb-reader-newtab-search-meta' }, meta) : null,
        meaning ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, meaning) : null);
    }

    private renderSearchKanjiResults(results: NewTabSearchKanjiResult[]): HTMLElement {
        return el('section', { class: 'jpdb-reader-newtab-search-section' },
            el('h2', {}, this.text('kanji')),
            el('div', { class: 'jpdb-reader-newtab-search-kanji-grid' },
                results.map(result => this.renderSearchKanjiResult(result)),
            ),
        );
    }

    private renderSearchKanjiResult(result: NewTabSearchKanjiResult): HTMLButtonElement {
        const detail = [
            result.keyword,
            result.meanings.filter(meaning => meaning !== result.keyword).slice(0, 2).join(', '),
            result.readings.slice(0, 3).join(' · '),
        ].filter(Boolean).join(' · ');
        const words = result.words.map(card => card.spelling).slice(0, 4).join('、');
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-kanji-card',
            dataset: { newtabAction: 'search-result-kanji', kanji: result.character },
        },
        el('span', { class: 'jpdb-reader-newtab-search-kanji-char', lang: 'ja' }, result.character),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, detail) : null,
        words ? el('span', { class: 'jpdb-reader-newtab-search-meta', lang: 'ja' }, words) : null);
    }

    private renderSearchNoResults(results: NewTabSearchResults): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-search-message' },
            results.hasLocalDictionaries ? this.text('noLocalResults') : this.text('addDictionaryForLocalResults'),
        );
    }

    private openSearchKanjiResult(kanji: string, anchor: HTMLElement): void {
        const cached = this.kanjiInfoCache.has(kanji);
        const detailsPromise = this.loadKanjiDetails(kanji);
        const showFallback = () => {
            const card = this.dependencies.parser.fallbackCardFromText(kanji);
            void this.dependencies.showKanjiCard?.(card, kanji, kanji, anchor);
        };
        void detailsPromise.then(details => {
            const meanings = uniqueStrings(details.local.flatMap(entry => entry.meanings)).slice(0, 6);
            const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
            const card = this.dependencies.parser.fallbackCardFromText(kanji);
            card.kanjiKeyword = newTabKanjiKeyword(card, fullInfo, details.rtk, meanings);
            void this.dependencies.showKanjiCard?.(card, kanji, kanji, anchor);
        }).catch(showFallback);
        if (!cached) showFallback();
    }

    private renderControls(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.controls) return;
        slots.controls.hidden = false;
        replaceChildrenWith(slots.controls, this.controlButtonsForCard(card));
    }

    private controlButtonsForCard(card: JPDBCard): HTMLElement[] {
        if (!this.canReviewCard(card)) return this.navigationControlButtons(this.text(this.state.revealAnswer ? 'hide' : 'reveal'));
        if (!this.state.revealAnswer) return this.navigationControlButtons(this.text('reveal'));
        return this.gradeControlButtons();
    }

    private canReviewCard(card: JPDBCard): boolean {
        const settings = this.dependencies.getSettings();
        if (!settings.enableReviews) return false;
        if (this.isOfflineSourceLabel(this.sourceLabel) && !this.offlineGradeTarget(card)) return false;
        if (card.source === 'anki' || card.reviewSource === 'anki') return settings.ankiEnabled;
        if (card.reviewSource === 'jpdb-live') return settings.jpdbMiningEnabled;
        if (card.reviewSource === 'jpdb-api' || isPositiveJpdbCard(card)) {
            return settings.jpdbMiningEnabled && Boolean(settings.apiKey.trim());
        }
        return false;
    }

    private navigationControlButtons(revealLabel: string): HTMLElement[] {
        return [
            el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': this.text('previousWord') }, this.text('previousWord')),
            el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, revealLabel),
            el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': this.text('nextWord') }, this.text('nextWord')),
        ];
    }

    private gradeControlButtons(): HTMLElement[] {
        return newTabGradeOptions(this.dependencies.getSettings())
            .map(([grade, label]) => el('button', { type: 'button', dataset: { newtabAction: 'grade', grade } }, label));
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

    private async gradeCurrentCard(grade: JPDBGrade): Promise<void> {
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
            await this.submitGrade(target.card, grade);
            this.setStatus(target.root, passingNewTabGrade(grade) ? '✓' : '✕');
            this.advanceAfterGrade(target.root, target.card);
        } catch (error) {
            log.warn('New tab grade failed', { term: target.card.spelling, source: target.card.source, grade }, error);
            if (await this.queueOfflineGrade(target.card, grade)) {
                this.setStatus(target.root, this.text('offlineGradeReconnect'));
                this.advanceAfterGrade(target.root, target.card);
                return;
            }
            this.setStatus(target.root, this.text('couldNotSubmitGrade'));
        }
    }

    private currentGradeTarget(): NewTabGradeTarget | null {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        const card = this.visibleWords[this.index];
        return root && card ? { root, card } : null;
    }

    private async submitGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (this.submitLiveJpdbGrade(card, grade)) return;
        if (await this.submitAnkiGradeIfNeeded(card, grade)) return;
        await this.submitJpdbApiGradeIfNeeded(card, grade);
    }

    private submitLiveJpdbGrade(card: JPDBCard, grade: JPDBGrade): boolean {
        if (card.reviewSource !== 'jpdb-live') return false;
        this.dependencies.jpdbReviewBridge.grade(grade);
        this.dependencies.jpdbReviewBridge.requestCurrent();
        return true;
    }

    private async submitAnkiGradeIfNeeded(card: JPDBCard, grade: JPDBGrade): Promise<boolean> {
        if (card.source !== 'anki' && card.reviewSource !== 'anki') return false;
        await this.submitAnkiGrade(card, grade);
        return true;
    }

    private async submitJpdbApiGradeIfNeeded(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (card.source !== 'jpdb' && card.reviewSource !== 'jpdb-api') return;
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) throw new Error(this.text('jpdbActionsDisabled'));
        if (!settings.apiKey.trim()) throw new Error(this.text('addJpdbApiKeyReview'));
        await this.dependencies.jpdb.reviewCard(card, grade);
    }

    private async submitAnkiGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        const cardId = card.ankiCardId ?? card.rid;
        if (!cardId) throw new Error(this.text('missingAnkiCardId'));
        await this.dependencies.anki.answerCard(cardId, grade);
    }

    private async queueOfflineGrade(card: JPDBCard, grade: JPDBGrade): Promise<boolean> {
        const target = this.offlineGradeTarget(card);
        if (!target || !this.dependencies.getSettings().newTabOfflineEnabled) return false;
        const queue = await this.readQueuedGrades();
        const entry: QueuedNewTabGrade = {
            id: `${target}:${cardKey(card)}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            at: Date.now(),
            target,
            card,
            grade,
            attempts: 0,
        };
        const deduped = queue.filter(item => this.queuedGradeKey(item) !== this.queuedGradeKey(entry));
        deduped.push(entry);
        await this.writeQueuedGrades(deduped.slice(-NEW_TAB_GRADE_QUEUE_LIMIT));
        return true;
    }

    private offlineGradeTarget(card: JPDBCard): QueuedNewTabGrade['target'] | null {
        if (card.source === 'anki' || card.reviewSource === 'anki') return (card.ankiCardId ?? card.rid) ? 'anki' : null;
        if (card.reviewSource === 'jpdb-api' || isPositiveJpdbCard(card)) return 'jpdb-api';
        return null;
    }

    private async flushQueuedGrades(): Promise<void> {
        const queue = await this.readQueuedGrades();
        if (!queue.length) return;
        const pending: QueuedNewTabGrade[] = [];
        for (const item of queue) {
            if (!item) continue;
            try {
                await this.submitQueuedGrade(item);
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

    private async submitQueuedGrade(item: QueuedNewTabGrade): Promise<void> {
        if (item.target === 'anki') {
            await this.submitAnkiGrade(item.card, item.grade);
            return;
        }
        await this.submitJpdbApiGradeIfNeeded(item.card, item.grade);
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
    }

    private applyJpdbBridgeStatus(status: JpdbReviewBridgeStatus): void {
        this.liveJpdbStatus = status;
        const root = this.jpdbBridgeRoot();
        if (!root) return;
        if (!status.card) return;
        const card = this.cardFromLiveJpdb(status.card);
        if (!card) return;
        this.upsertLiveJpdbCard(card);
        this.applyWords(root, false);
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

    private liveCardFromBridge(): JPDBCard | null {
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus();
        return status.card ? this.cardFromLiveJpdb(status.card) : null;
    }

    private cardFromLiveJpdb(card: JpdbReviewBridgeCard): JPDBCard | null {
        const spelling = card.kind === 'kanji' ? card.kanji : card.spelling;
        if (!spelling) return null;
        const jpdbCard = liveJpdbCardFromBridgeCard(card, spelling);
        this.liveCards.set(cardKey(jpdbCard), card);
        return jpdbCard;
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
            cards: Array.isArray(cached?.cards) ? cached.cards.slice(0, Math.max(0, settings.newTabOfflineLimit || 0)) : [],
            sourceLabel: this.localizedSourceLabel(cached?.sourceLabel || this.text('cachedReviews')),
        };
    }

    private renderReaderWord(card: JPDBCard, state: string, text = card.spelling, sentence = card.sentence || card.spelling): HTMLSpanElement {
        const sourceClass = card.source === 'anki' ? 'anki' : 'jpdb';
        const pitchClass = newTabPitchClass(card);
        return el('span', {
            class: `jpdb-reader-word ${sourceClass}-${state} jpdb-pitch-${pitchClass}`,
            dataset: {
                action: 'lookup',
                term: text,
                expression: card.spelling,
                reading: card.reading,
                vid: card.vid,
                sid: card.sid,
                pitchClass,
                sentence,
            },
            tabIndex: 0,
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
        const localPitch = await this.fetchLocalWordPitch(card);
        if (localPitch) return [localPitch];
        return await this.dependencies.jpdbPublicPitch?.lookup(card.spelling, card.reading).catch(() => []) ?? [];
    }

    private async fetchLocalWordPitch(card: JPDBCard): Promise<string> {
        const settings = this.dependencies.getSettings();
        if (!settings.localDictionariesEnabled) return '';
        if (typeof this.dependencies.dictionaries.lookupTermMeta !== 'function') return '';
        const metaEntries = await this.dependencies.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(() => []);
        return localPitchPatternFromMeta(card.reading, metaEntries);
    }

    private wordPitchCacheKey(card: JPDBCard): string {
        const settings = this.dependencies.getSettings();
        return JSON.stringify({
            spelling: card.spelling,
            reading: card.reading,
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
        return (word.dataset.vid === String(card.vid) && word.dataset.sid === String(card.sid))
            || (word.dataset.expression === card.spelling && (!word.dataset.reading || word.dataset.reading === card.reading));
    }

    private syncMode(root: HTMLElement): void {
        root.classList.toggle('jpdb-reader-newtab-search-mode', this.state.mode === 'search');
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        const search = root.querySelector<HTMLElement>('[data-newtab-search]');
        if (search) search.hidden = this.state.mode !== 'search';
        if (this.state.mode !== 'search') root.querySelector<HTMLElement>('[data-newtab-handwriting]')?.remove();
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="mode"]').forEach(button => {
            button.dataset.active = String(button.dataset.mode === this.state.mode);
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

    private syncThemeToggle(root: HTMLElement): void {
        const theme = this.effectiveTheme(this.dependencies.getSettings().theme);
        root.dataset.newtabTheme = theme;
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="theme"]');
        if (!button) return;
        const label = this.text(theme === 'dark' ? 'switchToLightTheme' : 'switchToDarkTheme');
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-checked', String(theme === 'light'));
        button.title = label;
    }

    private effectiveTheme(theme: ReaderSettings['theme']): 'dark' | 'light' {
        if (theme === 'dark' || theme === 'light') return theme;
        return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    private setStatus(root: HTMLElement, message: string): void {
        const status = root.querySelector<HTMLElement>('[data-newtab-status]');
        if (status) status.textContent = message;
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
                key: cardKey(card),
            }));
        } catch {
            // Refresh stability is a convenience; the page still works without storage.
        }
    }
}

function cleanNestedLookupValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

function consumeNestedLookupEvent(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
}

function appendLoadedWords(result: NewTabLoadResult, cards: JPDBCard[], labels: string[]): void {
    if (!result.cards.length) return;
    cards.push(...result.cards);
    labels.push(result.sourceLabel);
}

function emptyNewTabLoadAccumulator(): NewTabLoadAccumulator {
    return { cards: [], labels: [], dictionarySetupRequired: false, reviewCountMode: false };
}

function appendNewTabLoadResult(accumulator: NewTabLoadAccumulator, result: NewTabLoadResult): void {
    accumulator.dictionarySetupRequired ||= result.needsDictionarySetup;
    if (result.cards.length) accumulator.reviewCountMode ||= result.reviewCountMode === true;
    appendLoadedWords(result, accumulator.cards, accumulator.labels);
}

function interleavedNewTabLoadAccumulator(results: NewTabLoadResult[]): NewTabLoadAccumulator {
    const accumulator = emptyNewTabLoadAccumulator();
    accumulator.dictionarySetupRequired = results.some(result => result.needsDictionarySetup);
    accumulator.reviewCountMode = results.some(result => result.cards.length > 0 && result.reviewCountMode === true);
    const activeResults = results.filter(result => result.cards.length > 0);
    accumulator.cards.push(...interleaveNewTabCards(activeResults.map(result => result.cards)));
    accumulator.labels.push(...activeResults.map(result => result.sourceLabel));
    return accumulator;
}

function interleaveNewTabCards(groups: JPDBCard[][]): JPDBCard[] {
    const maxLength = Math.max(0, ...groups.map(group => group.length));
    const cards: JPDBCard[] = [];
    for (let index = 0; index < maxLength; index++) {
        for (const group of groups) {
            const card = group[index];
            if (card) cards.push(card);
        }
    }
    return cards;
}

function newTabLoadResult(accumulator: NewTabLoadAccumulator, language: ReaderSettings['interfaceLanguage']): NewTabLoadResult {
    return {
        cards: accumulator.cards,
        sourceLabel: accumulator.labels.length ? accumulator.labels.join(' + ') : uiText(language, 'noSource'),
        needsDictionarySetup: accumulator.cards.length === 0 && accumulator.dictionarySetupRequired,
        reviewCountMode: accumulator.reviewCountMode,
    };
}

function setOptionalText(element: HTMLElement | null, text: string): void {
    if (element) element.textContent = text;
}

function dedupeWords(cards: JPDBCard[]): JPDBCard[] {
    const seen = new Map<string, JPDBCard>();
    for (const card of cards) {
        const key = dedupeWordKey(card);
        const existing = seen.get(key);
        if (shouldReplaceDedupeWord(card, existing)) seen.set(key, card);
    }
    return [...seen.values()];
}

function dedupeWordKey(card: JPDBCard): string {
    return card.reviewSource === 'jpdb-live'
        ? `jpdb-live\n${card.jpdbReviewId ?? card.spelling}`
        : `${card.spelling}\n${card.reading}`;
}

function shouldReplaceDedupeWord(card: JPDBCard, existing: JPDBCard | undefined): boolean {
    return !existing || sourcePriority(card) < sourcePriority(existing);
}

function sourcePriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return -1;
    if (!card.source || card.source === 'jpdb') return 0;
    if (card.source === 'anki') return 1;
    return 2;
}

function promoteCardByKey(cards: JPDBCard[], key: string): JPDBCard[] {
    if (!key) return cards;
    const index = cards.findIndex(card => cardKey(card) === key);
    if (index <= 0) return cards;
    const promoted = [...cards];
    const [card] = promoted.splice(index, 1);
    if (card) promoted.unshift(card);
    return promoted;
}

function markJpdbApiReviewCards(cards: JPDBCard[]): JPDBCard[] {
    return cards.map(card => ({
        ...card,
        reviewSource: card.reviewSource ?? 'jpdb-api',
    }));
}

function fact(label: string, value: string | undefined): [string, string] | null {
    return value ? [label, value] : null;
}

function compactFacts(facts: Array<[string, string] | null>): [string, string][] {
    return facts.filter((item): item is [string, string] => Boolean(item));
}

function newTabKanjiReadingsFact(fullInfo: JpdbKanjiInfo | null, language: ReaderSettings['interfaceLanguage']): string {
    const total = fullInfo?.readings.length ?? 0;
    if (!total) return '';
    const common = fullInfo?.readings.filter(reading => reading.common).length ?? 0;
    return common
        ? `${common} ${uiText(language, 'common')} / ${total} ${uiText(language, 'total')}`
        : `${total} ${uiText(language, 'total')}`;
}

function newTabKanjiVocabularyFact(fullInfo: JpdbKanjiInfo | null, language: ReaderSettings['interfaceLanguage']): string {
    const count = fullInfo?.vocabulary.length ?? 0;
    return count
        ? `${count} ${uiText(language, count === 1 ? 'wordCountSingular' : 'wordCountPlural')} ${uiText(language, 'shown')}`
        : '';
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

function renderNewTabKanjiInfoSection(
    card: JPDBCard,
    facts: [string, string][],
    readings: string[],
    localMeanings: string[],
    fullInfo: JpdbKanjiInfo | null,
    sourceAttributes: (sourceStateKey: string, initiallyExpanded?: boolean) => string,
    title: string,
    language: ReaderSettings['interfaceLanguage'],
): HTMLElement {
    const section = htmlToFirstElement(`
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-newtab-kanji-info-source" ${sourceAttributes(kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID))}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
        </details>
    `) as HTMLDetailsElement | null;
    if (!section) return el('div');
    section.append(el('div', { class: 'jpdb-reader-local-entry jpdb-reader-newtab-kanji-info-body' },
        renderNewTabKanjiFactSection(card, facts),
        renderNewTabKanjiReadingSection(readings),
        renderNewTabKanjiLocalMeanings(localMeanings),
        renderNewTabKanjiComponents(fullInfo, language),
        renderNewTabKanjiVocabulary(fullInfo, language),
        renderNewTabKanjiMnemonic(fullInfo)));
    return section;
}

function renderNewTabKanjiFactSection(card: JPDBCard, facts: [string, string][]): HTMLElement {
    return facts.length
        ? el('div', { class: 'jpdb-reader-kanji-facts' }, facts.map(([label, value]) => el('span', {}, el('strong', {}, label), value)))
        : el('div', { class: 'jpdb-reader-help' }, firstCardMeaning(card));
}

function renderNewTabKanjiReadingSection(readings: string[]): HTMLElement | null {
    return readings.length ? el('div', { class: 'jpdb-reader-kanji-readings' }, readings.map(reading => el('span', {}, reading))) : null;
}

function renderNewTabKanjiLocalMeanings(localMeanings: string[]): HTMLElement | null {
    return localMeanings.length ? el('div', { class: 'jpdb-reader-newtab-kanji-vocab' }, localMeanings.map(meaning => el('span', {}, meaning))) : null;
}

function renderNewTabKanjiComponents(fullInfo: JpdbKanjiInfo | null, language: ReaderSettings['interfaceLanguage']): HTMLElement | null {
    return fullInfo?.components.length
        ? el('div', { class: 'jpdb-reader-component-grid' }, fullInfo.components.slice(0, 8).map(component => el('button', {
            class: 'jpdb-reader-component-card jpdb-reader-component-button',
            type: 'button',
            dataset: { action: 'kanji', kanji: component.kanji },
            title: `${uiText(language, 'showKanji')}: ${component.kanji}`,
        }, el('strong', {}, component.kanji), el('span', {}, component.keyword))))
        : null;
}

function renderNewTabKanjiVocabulary(fullInfo: JpdbKanjiInfo | null, language: ReaderSettings['interfaceLanguage']): HTMLElement | null {
    return fullInfo?.vocabulary.length
        ? el('div', { class: 'jpdb-reader-newtab-kanji-vocab' }, fullInfo.vocabulary.slice(0, 5).map(item => el('button', {
            class: 'jpdb-reader-newtab-kanji-popover-word',
            type: 'button',
            dataset: { action: 'similar-word', expression: item.expression, reading: item.reading },
            title: `${uiText(language, 'lookUp')}: ${item.expression}`,
        },
        el('strong', {}, item.expression),
        el('span', { class: 'jpdb-reader-newtab-kanji-vocab-detail' }, [item.reading, item.meaning].filter(Boolean).join(' · ')))))
        : null;
}

function renderNewTabKanjiMnemonic(fullInfo: JpdbKanjiInfo | null): HTMLElement | null {
    return fullInfo?.mnemonic ? el('p', { class: 'jpdb-reader-newtab-kanji-mnemonic' }, fullInfo.mnemonic) : null;
}

function htmlToFirstElement(html: string): HTMLElement | null {
    const first = new DOMParser().parseFromString(html.trim(), 'text/html').body.firstElementChild;
    return first ? document.importNode(first, true) as HTMLElement : null;
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
    const runtime = globalThis as { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown; __yomuDemoApp?: unknown; __yomuReaderAppInitialized?: unknown };
    return hasDirectYomuRuntime(runtime) || hasDemoYomuRuntime(runtime, yomuRuntimeOwnerMarker());
}

function hasDirectYomuRuntime(runtime: { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown; __yomuDemoApp?: unknown }): boolean {
    return Boolean(runtime.GM_info || runtime.__YOMU_READER_RUNTIME__ || runtime.__yomuDemoApp);
}

function hasDemoYomuRuntime(runtime: { __yomuReaderAppInitialized?: unknown }, marker: HTMLElement | null): boolean {
    return Boolean(runtime.__yomuReaderAppInitialized && marker?.dataset.yomuRuntimeKind === 'demo');
}

function yomuRuntimeOwnerMarker(): HTMLElement | null {
    return typeof document !== 'undefined'
        ? document.getElementById('jpdb-reader-runtime-owner') as HTMLElement | null
        : null;
}

function shouldShowInStudyQueue(card: JPDBCard): boolean {
    if (card.source === 'local' || card.source === 'fallback') return true;
    if (card.reviewSource === 'jpdb-live') return true;
    const states = card.cardState ?? [];
    return states.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'not-in-deck');
}

export function selectNewTabStudyPool(cards: JPDBCard[]): JPDBCard[] {
    const studyCards = cards.filter(shouldShowInStudyQueue);
    return studyCards.length ? studyCards : cards;
}

function sentenceForCard(card: JPDBCard): string {
    const sentence = card.sentence?.replace(/\s+/g, ' ').trim();
    if (sentence) return sentence;
    const withReading = card.wordWithReading?.replace(/\s+/g, ' ').trim();
    if (withReading && withReading.includes(card.spelling)) return withReading;
    return card.spelling;
}

function normalizePromptContextSentence(value: string | undefined, card: JPDBCard): string {
    const sentence = value?.replace(/\s+/g, ' ').trim() ?? '';
    return isPromptContextSentence(sentence, card) ? sentence : '';
}

function isPromptContextSentence(sentence: string, card: JPDBCard): boolean {
    if (!queryHasJapanese(sentence)) return false;
    const normalized = normalizedPromptSentenceText(sentence);
    const identities = [card.spelling, card.reading]
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
        card.reading,
        firstCardMeaning(card),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

function cardMatchesSearchResult(card: JPDBCard, normalizedQuery: string): boolean {
    return [
        card.spelling,
        card.reading,
        firstCardMeaning(card),
        ...card.meanings.flatMap(meaning => meaning.glosses),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

function searchSuggestionFromCard(card: JPDBCard): NewTabSearchSuggestion {
    return {
        query: card.spelling.trim(),
        reading: card.reading.trim(),
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
    if (sentence.includes(card.spelling)) return card.spelling;
    return card.reading && sentence.includes(card.reading) ? card.reading : '';
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
    return getComputedStyle(stage ?? canvas).backgroundColor || '#181b20';
}

function passingNewTabGrade(grade: JPDBGrade): boolean {
    return grade === 'pass' || grade === 'easy' || grade === 'okay';
}

function newTabGradeOptions(settings: ReaderSettings): Array<[JPDBGrade, string]> {
    return settings.twoButtonReviews
        ? [['fail', uiText(settings.interfaceLanguage, 'gradeFailLabel')], ['pass', uiText(settings.interfaceLanguage, 'gradePassLabel')]]
        : [
            ['nothing', uiText(settings.interfaceLanguage, 'gradeNothingLabel')],
            ['something', uiText(settings.interfaceLanguage, 'gradeSomethingLabel')],
            ['hard', uiText(settings.interfaceLanguage, 'gradeHardLabel')],
            ['okay', uiText(settings.interfaceLanguage, 'gradeOkayLabel')],
            ['easy', uiText(settings.interfaceLanguage, 'gradeEasyLabel')],
        ];
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
    return card.reading || spelling;
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
