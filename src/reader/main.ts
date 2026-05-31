import { AudioPlayer } from './audio';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from './app-pages';
import { AnkiConnectClient, captureActiveVideoFrame, type AnkiLookupResult } from './anki';
import { renderReviewButtons } from './anki-render';
import { runLimited } from './async-utils';
import { copyText, hasVisiblePageVideo, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { CardPopoverRenderer } from './card-popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData, type CardRenderData, type CardRenderDataLoad } from './card-render-data';
import { highlightCardTargetScopes } from './card-highlight';
import { cardKey } from './card-utils';
import { normalizeCardStates } from './card-state';
import { APP_NAME, HOSTED_DEMO_LOOKUP_SCAN_EVENT, IMMERSION_KIT_SOURCE_ID, INTERFACE_LANGUAGE_CHANGE_EVENT, JPDB_DEFINITION_SOURCE_ID, NEW_TAB_PAGE_URL, OPEN_SETTINGS_EVENT, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, VIDEO_PLAYER_PAGE_URL } from './constants';
import { DictionarySourceStateController } from './dictionary-source-state';
import { DictionaryStyleController } from './dictionary-styles';
import { FactoryResetCoordinator, FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS } from './factory-reset-coordinator';
import { canAttemptAudiblePlayback } from './media-activation';
import {
    HAS_JAPANESE,
    appendToDocumentHead,
    appendTrustedHtml,
    documentHasJapaneseText,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    htmlToFirstElement,
    isPassiveInteractionElement,
    nearestReadableSentenceForElement,
    readerWordSurfaceText,
    sentenceAroundRange,
    setInnerHtml,
    unwrapReaderWords,
} from './dom';
import {
    definitionSourceStateKey,
    kanjiSourceStateKey,
    renderJpdbDefinitionSource,
    renderKanjiDefinitions,
    renderLocalDefinitionSourcesSection,
    renderSimilarKanjiWordsContent,
    renderSimilarKanjiWordsShell,
} from './definition-source-render';
import { ImmersionKitClient } from './immersion-kit';
import { isUsefulImmersionPreloadQuery } from './immersion-query';
import { ImmersionPopoverController, type ImmersionSearchOptions } from './immersion-popover-controller';
import { waitForIdle as waitForBrowserIdle } from './idle';
import { FloatingButtonController } from './floating-button';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { getPitchClass } from './jpdb-parser';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import {
    currentJpdbTermTarget,
    currentLocalDictionaryTargets,
    dictionaryPreferencePriority as jpdbPageDictionaryPreferencePriority,
    extractCurrentKanji,
    isJpdbHost,
    isKanjiPage,
    isKanjiReviewBack,
    jpdbAudioCard,
    localDictionaryLookupVariants,
    uniqueLocalDictionaryEntries,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from './jpdb-page-targets';
import { initJpdbReviewPageBridge } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient, type KanjiSourceInfo } from './kanji-origin';
import { installKanjiPracticeDoodle } from './kanji-practice-grader';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { groupTermEntriesByDictionary } from './local-dictionary-groups';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    inferMiningSourceKind,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationInsideReaderRoot, mutationMayAffectJpdbPageEnhancements, mutationMayContainJapaneseText, mutationTouchesAsbPlayer } from './mutation-scan';
import { NativeTitleGuard } from './native-title-guard';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsTextParsePlan, nestedTextParsePlan, type NestedParsePlan } from './nested-text-parse';
import { resolveUiLanguage, uiText, type UiCopyKey } from './i18n';
import { OnboardingController } from './onboarding';
import { installOriginGraphInteractions } from './origin-graph-interactions';
import { localPitchPatternFromMeta } from './pitch-meta';
import { ImageOcrController } from './ocr';
import {
    caretTextPositionFromPoint,
    isLowValuePointerText,
    japaneseRunAt,
    pointerTextCharacterOffset,
    type ActivePointerTextLookup,
    type PointerTextLookup,
} from './pointer-text-lookup';
import { createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, popoverMaxHeightSetting, refreshForcedReaderPopoverSurface, shouldUseSheet } from './popover-shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from './popup-navigation';
import {
    buildRtkComponentSummaries,
    isKanjiCharacter,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderPitch,
    renderRtkInfo,
    tokensOverlappingSelection,
    uniqueKanji,
} from './popup-render';
import { RtkClient, type RtkInfo } from './rtk';
import { ReaderAudioActions } from './reader-audio-actions';
import { ReaderParser, fallbackLookupRangeAtOffset, fallbackLookupTermAtOffset, jpdbFirstParseOptions, type ReaderParserParseOptions } from './reader-parser';
import {
    DEFAULT_SETTINGS,
    applyUrlBootstrapSettings,
    loadSettings,
    matchesShortcut,
    saveSettings,
    shortcutIsPressed,
    shouldLookupAnkiStatus,
} from './settings';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from './reader-theme';
import { SettingsDialogController } from './settings-dialog-controller';
import { collectSiteScanTargets } from './site-parsers';
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
import { loadReaderCssFallback, READER_CSS, readerCssNeedsFallback } from './styles';
import { StudySourceController } from './study-sources';
import { SubtitlePlayerController } from './subtitles';
import { installUchisenCarousel, loadUchisenData } from './uchisen';
import type { InterfaceLanguage, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { VisiblePageScanner } from './visible-page-scanner';
import { renderWordPills } from './word-pills';
import { addWindowEventListener } from './window-events';
import { YoutubeImmersionFilter } from './youtube';
import {
    YomitanDictionaryStore,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const log = Logger.scope('ReaderApp');
const TERM_AUDIO_PRELOAD_LIMIT = 4;
const NEARBY_TERM_AUDIO_PRELOAD_LIMIT = 3;
const NEARBY_TERM_AUDIO_PRELOAD_DELAY_MS = 350;
const PRELOADED_TERM_AUDIO_KEY_LIMIT = 500;
const FALLBACK_LOOKUP_INITIAL_WAIT_MS = 180;
const ANKI_ENRICHMENT_LIMIT = 16;
const PITCH_ENRICHMENT_LIMIT = 12;
const PITCH_ENRICHMENT_QUEUE_LIMIT = 240;
const BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT = 8;
const NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT = 3;
const NESTED_PARSE_CONTENT_CACHE_TTL_MS = 30_000;
const NESTED_PARSE_CONTENT_CACHE_LIMIT = 160;
const PITCH_LOCAL_META_LIMIT = 12;
const PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT = 800;
const BACKGROUND_ENRICHMENT_CONCURRENCY = 4;
const BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY = 2;
const SINGLE_HIRAGANA_MORA_RE = /^[\u3040-\u309fー]$/u;
type ReviewShortcutKey = keyof ReaderSettings['shortcuts'];
type InterfaceLanguageChangeDetail = Partial<{ language: unknown; interfaceLanguage: unknown }>;
type OpenSettingsEventDetail = Partial<{ panel: unknown; tab: unknown }>;

const TWO_BUTTON_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeFail', 'fail'],
    ['gradePass', 'pass'],
];

const FIVE_BUTTON_REVIEW_SHORTCUTS: Array<[ReviewShortcutKey, JPDBGrade]> = [
    ['gradeNothing', 'nothing'],
    ['gradeSomething', 'something'],
    ['gradeHard', 'hard'],
    ['gradeOkay', 'okay'],
    ['gradeEasy', 'easy'],
];

function matchedReviewShortcutGrade(
    event: KeyboardEvent,
    shortcuts: ReaderSettings['shortcuts'],
    candidates: Array<[ReviewShortcutKey, JPDBGrade]>,
): JPDBGrade | null {
    return candidates.find(([key]) => matchesShortcut(event, shortcuts[key]))?.[1] ?? null;
}

function interfaceLanguageChangeDetail(detail: InterfaceLanguageChangeDetail | undefined): InterfaceLanguage | null {
    const value = detail?.language ?? detail?.interfaceLanguage;
    return value === 'auto' || value === 'en' || value === 'ja' ? value : null;
}

function openSettingsPanelDetail(detail: OpenSettingsEventDetail | undefined): string | undefined {
    const value = detail?.panel ?? detail?.tab;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedLookupText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function isLookupableJapaneseText(text: string): boolean {
    return Boolean(text && HAS_JAPANESE.test(text));
}

function dictionaryLookupLink(target: EventTarget | null): HTMLAnchorElement | null {
    return (target as HTMLElement | null)?.closest?.<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]') ?? null;
}

function dictionaryLookupQuery(link: HTMLAnchorElement): string {
    return normalizedLookupText(link.dataset.dictionaryLookup ?? '');
}

function lookupCandidateSentence(text: string, start = 0, end = text.length): string {
    const sentence = sentenceAroundRange(text, start, end) || normalizedLookupText(text);
    return isLookupableJapaneseText(sentence) ? sentence : '';
}

function connectedElement<T extends HTMLElement>(element: T | undefined): T | undefined {
    return element?.isConnected ? element : undefined;
}

function hasVisibleAutoScanTargets(): boolean {
    return (collectSiteScanTargets(1)?.length ?? 0) > 0 || collectVisibleTextTargets(1).length > 0;
}

function hasPressLookupEnabled(settings: ReaderSettings): boolean {
    return settings.lookupOnClick || settings.lookupOnHover;
}

function isMousePointerEvent(event: MouseEvent | PointerEvent): boolean {
    return !('pointerType' in event) || event.pointerType === 'mouse';
}

function eventElement(event: Event): Element | null {
    return event.target instanceof Element ? event.target : null;
}

const NATIVE_PAGE_LOOKUP_BLOCK_SELECTOR = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[contenteditable="true"]',
    '[data-audio]',
    '[onclick]',
    '.subsection-immersion-kit',
    '[class*="immersion" i]',
    '[class*="audio" i]',
    '[class*="sound" i]',
    '[class*="speaker" i]',
    '[class~="play" i]',
    '[class*="-play" i]',
    '[class*="play-" i]',
    '[class~="control" i]',
    '[class*="-control" i]',
    '[class*="control-" i]',
    '[class~="button" i]',
    '[class*="-button" i]',
    '[class*="button-" i]',
    '[class~="icon" i]',
    '[class*="-icon" i]',
    '[class*="icon-" i]',
].join(',');

interface ReaderAudioPreloadOptions {
    sourceLimit?: number;
    candidateLimit?: number;
    prepareAudio?: boolean;
}

function audioPreloadLimits(options: ReaderAudioPreloadOptions): ReaderAudioPreloadOptions {
    return {
        sourceLimit: options.sourceLimit ?? 1,
        candidateLimit: options.candidateLimit ?? 1,
        prepareAudio: options.prepareAudio,
    };
}

function shouldPauseVideoForSubtitleHover(word: HTMLElement, settings: ReaderSettings): boolean {
    return settings.subtitleMiningPause && Boolean(word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list'));
}

function cardDisplayTrigger(options: CardDisplayOptions): 'modal' | 'hover' {
    return options.trigger === 'hover' ? 'hover' : 'modal';
}

function cardSourceLabel(card: JPDBCard): string {
    return card.source ?? 'jpdb';
}

function renderedWordNavigationMode(insideReaderPopup: boolean, trigger: 'modal' | 'hover'): CardNavigationMode {
    return insideReaderPopup && trigger === 'modal' ? 'push-current' : 'reset';
}

function renderedWordAnchor(
    word: HTMLElement,
    insideReaderPopup: boolean,
    activePopoverAnchor: HTMLElement | undefined,
): HTMLElement | undefined {
    return insideReaderPopup ? activePopoverAnchor ?? undefined : word;
}

function popoverAnchorRect(anchor: HTMLElement | undefined, fallback: DOMRect | undefined): DOMRect | undefined {
    const rect = anchor?.getBoundingClientRect();
    return rect && (rect.width > 0 || rect.height > 0) ? rect : fallback;
}

function shouldLockMountedPopoverPosition(popover: HTMLElement, state: PopoverMountState): boolean {
    return state.mode !== 'hover'
        && !popover.classList.contains('jpdb-reader-sheet')
        && Boolean(state.previousPopoverRect);
}

function mountedHoverPointerPosition(
    state: PopoverMountState,
    lastPointerPosition: { x: number; y: number } | undefined,
): { x: number; y: number } | undefined {
    const hoverPointerPosition = state.previousHoverPointerPosition ?? lastPointerPosition;
    return state.mode === 'hover' && hoverPointerPosition ? { ...hoverPointerPosition } : undefined;
}

interface KanjiDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
    kanjiVGInfo: Promise<KanjiVGInfo | null>;
}

interface CardDisplayOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    hoverLookupKey?: string;
    hoverLookupGeneration?: number;
    pointerTextLookup?: ActivePointerTextLookup;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    stackOverSettings?: boolean;
}

type PointerTextDisplayOptions = Pick<CardDisplayOptions, 'navigation' | 'preservePosition' | 'hoverLookupGeneration' | 'userGesture'>;
type PointerTextLookupOptions = { allowPassiveInteractionText?: boolean };
type LocalPointerTextEntryMatch = { entry: YomitanTermEntry; start: number; end: number };
const HOVER_POINTER_TEXT_LOOKUP_OPTIONS: PointerTextLookupOptions = { allowPassiveInteractionText: true };

function canSchedulePointerTextHoverLookup(hoverEnabled: boolean, candidate: PointerTextLookup | null): candidate is PointerTextLookup {
    return hoverEnabled && Boolean(candidate);
}

function samePointerTextLookupTarget(active: ActivePointerTextLookup, candidate: PointerTextLookup): boolean {
    return active.anchor === candidate.anchor && active.text === candidate.text;
}

function pointerOffsetInsideLiveLookup(active: ActivePointerTextLookup, offset: number): boolean {
    return active.start <= offset && offset < active.end;
}

interface RenderedWordDisplayContext {
    sentence?: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    hoverLookupKey?: string;
    previousNavigationEntry?: PopupNavigationEntry;
    insideReaderPopup: boolean;
}

interface TextLookupOptions {
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    anchor?: HTMLElement;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    trigger?: 'modal' | 'hover';
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
}

interface TextLookupDisplayContext {
    selected: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    preservePosition: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
    insideReaderPopup?: boolean;
    userGesture?: boolean;
    hoverLookupGeneration?: number;
    stackOverSettings?: boolean;
}

interface RenderDefinitionSourcesOptions {
    includeJpdbSource?: boolean;
    includeStudySources?: boolean;
    includeImmersionSource?: boolean;
}

interface PressLookupState {
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    source: 'primary' | 'middle';
    captureTarget?: Element;
    lastWord?: HTMLElement;
}

interface MountedCardShell {
    instantLocalEntries: YomitanTermEntry[] | null;
    requestId: number;
}

interface MountPopoverOptions {
    mode?: 'modal' | 'hover';
    preservePosition?: boolean;
    hoverLookupKey?: string;
    pointerTextLookup?: ActivePointerTextLookup;
    stackOverSettings?: boolean;
}

interface SettingsDialogStack {
    form: HTMLElement;
    backdrop?: HTMLElement;
}

interface DismissOptions {
    suppressHoverTarget?: boolean;
    preserveNavigation?: boolean;
    preserveHoverGeneration?: boolean;
    forceAll?: boolean;
}

interface PopoverMountState {
    mode: 'modal' | 'hover';
    backdrop?: HTMLElement;
    resolvedAnchor?: HTMLElement;
    anchorRect?: DOMRect;
    previousPopoverRect?: DOMRect;
    previousHoverPointerPosition?: { x: number; y: number };
}

interface ReaderAppInitOptions {
    isDemo?: boolean;
    showWelcome?: boolean;
}

interface ReaderAppDestroyOptions {
    preservePageWords?: boolean;
}

interface PitchEnrichmentOptions {
    urgent?: boolean;
    publicLookup?: boolean;
    publicLookupLimit?: number;
}

interface NestedParseContentCacheEntry {
    expiresAt: number;
    promise: Promise<JPDBToken[][]>;
}

export class ReaderApp {
    private abortController = new AbortController();
    public isDemo = false;
    private isDestroyed = false;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private setImmersionTranslationBlurred = (blurred: boolean): void => {
        if (this.settings.immersionKitRevealTranslationOnClick === blurred) return;
        this.settings = {
            ...this.settings,
            immersionKitRevealTranslationOnClick: blurred,
        };
        document.querySelectorAll<HTMLInputElement>('input[name="immersionKitRevealTranslationOnClick"]').forEach(input => {
            input.checked = blurred;
        });
        void saveSettings(this.settings);
    };
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim(), () => this.settings.corsProxyUrl);
    private jpdbKanji = new JpdbKanjiClient(() => this.settings.corsProxyUrl);
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private dictionaries = new YomitanDictionaryStore(() => this.settings.corsProxyUrl, () => this.settings.interfaceLanguage);
    private cardRenderData = new CardRenderDataLoader({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        jpdbPublicPitch: this.jpdbPublicPitch,
        jpdbVocabulary: this.jpdbVocabulary,
        anki: this.anki,
        jpdb: this.jpdb,
        isJpdbBackedCard: card => this.isJpdbBackedCard(card),
    });
    private navigation = new PopupNavigationController(() => Boolean(
        this.activePopover?.isConnected && this.activePopover.querySelector('.jpdb-reader-kanji-display'),
    ));
    private dictionarySourceState = new DictionarySourceStateController({
        getSettings: () => this.settings,
        onStateChange: () => this.repositionActivePopover(),
    });
    private cardPopoverRenderer = new CardPopoverRenderer({
        getSettings: () => this.settings,
        isJpdbBackedCard: card => this.isJpdbBackedCard(card),
        renderWordHistory: (language, trigger) => this.navigation.renderWordHistory(language, trigger),
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            isJpdbBackedCard: value => this.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        }),
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo),
        dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
    });
    private dictionaryStyles = new DictionaryStyleController({
        loadCss: () => this.settings.localDictionariesEnabled
            ? this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences)
            : Promise.resolve(''),
        onUnavailable: error => log.warn('Dictionary styles unavailable', error),
    });
    private studySources = new StudySourceController({
        getSettings: () => this.settings,
        dictionarySourceAttributes: key => this.dictionarySourceState.attributes(key),
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT }),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        isCurrentPopoverRoot: root => this.isCurrentPopoverRoot(root),
    });
    private cardActions = new CardActionController({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        anki: this.anki,
        dictionaries: this.dictionaries,
        isJpdbBackedCard: card => this.isJpdbBackedCard(card),
        resolveMiningContext: (card, sentence) => this.resolveMiningContext(card, sentence),
        showCard: (card, sentence, anchor, options) => this.showCard(card, sentence, anchor, options),
        getActivePopoverAnchor: () => this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
        getActivePopoverMode: () => this.activePopoverMode,
        showSettings: panel => this.showSettings(panel),
        playAudio: (card, options) => this.audioActions.playTermAudio(card, options),
        playMediaUrl: audioUrl => this.audioActions.playMediaUrl(audioUrl),
        playSentenceAudio: sentence => this.audioActions.playSentenceAudio(sentence),
        playJpdbExampleAudio: (audioIds, fallbackSentence) => this.audioActions.playJpdbExampleAudio(audioIds, fallbackSentence),
        detectGrammarHints: sentence => this.studySources.detectGrammarHints(sentence),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        toast: message => this.toast(message),
        invalidateCardData: () => this.cardRenderData.clear(),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        canParseJapanese: () => this.canParseJapanese(),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT }),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        repositionPopover: () => this.repositionActivePopover(),
        setImmersionTranslationBlurred: this.setImmersionTranslationBlurred,
        toast: message => this.toast(message),
    });
    private audioActions = new ReaderAudioActions({
        audio: this.audio,
        getSettings: () => this.settings,
        getActivePopover: () => this.activePopover,
        getHoverLookupGeneration: () => this.hoverLookupGeneration,
        stopImmersionAudio: () => this.immersionPopover.stopAudio(),
        toast: message => this.toast(message),
    });
    private floatingButton = new FloatingButtonController();
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });
    private onboarding = new OnboardingController({
        getSettings: () => this.settings,
        setSettings: settings => {
            this.settings = settings;
            this.applyTheme();
        },
        showSettings: panel => this.showSettings(panel),
    });
    private subtitles = new SubtitlePlayerController({
        getSettings: () => this.settings,
        parseJapanese: async (text, options) => (await this.parseJapanese([text], options))[0] ?? [],
        parseJapaneseBatch: (texts, options) => this.parseJapanese(texts, options),
        onSettingsChange: () => void saveSettings(this.settings),
    });
    private ocr = new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onToast: message => this.toast(message),
        shouldAutoScan: () => this.pageHasJapaneseText || documentLooksLikeStandaloneImagePage(),
        enrichPitchTokens: tokens => void this.enrichPitchWords(tokens),
    });
    private youtube = new YoutubeImmersionFilter({
        getSettings: () => this.settings,
        setShowFilterNotice: visible => void this.setYoutubeFilterNoticeVisible(visible),
    });
    private pageScanner = new VisiblePageScanner({
        getSettings: () => this.settings,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        pauseMutationObserver: callback => this.pauseAutoScanObserver(callback),
        preloadParsedTokens: tokens => this.preloadTermAudioForTokens(tokens),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT }),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        toast: message => this.toast(message),
    });
    private factoryReset = new FactoryResetCoordinator({
        isDestroyed: () => this.isDestroyed,
        getLanguage: () => this.settings.interfaceLanguage,
        invalidateRuntimeStores: () => this.invalidateRuntimeStoresForFactoryReset(),
        resetDictionaryDatabase: () => this.dictionaries.deleteDatabase({ timeoutMs: FACTORY_RESET_DICTIONARY_DELETE_TIMEOUT_MS })
            .then(() => ({ deleted: true })),
        toast: message => this.toast(message),
        reload: () => location.reload(),
    });
    private settingsDialog?: SettingsDialogController;
    private stackedSettingsDialog?: SettingsDialogStack;
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private lastCard?: JPDBCard;
    private lastCardSentence?: string;
    private lastAnkiLookup?: AnkiLookupResult;
    private selectionTimer?: number;
    private autoScanTimer?: number;
    private autoScanDeadline = 0;
    private autoScanObserver?: MutationObserver;
    private asbScanTimer?: number;
    private hoverLookupTimer?: number;
    private hoverCloseTimer?: number;
    private hoverWatchTimer?: number;
    private hoverPendingWord?: HTMLElement;
    private hoverPendingLookupKey = '';
    private hoverLookupInFlightKey = '';
    private hoverLookupGeneration = 0;
    private activeHoverWord?: HTMLElement;
    private activeHoverLookupKey = '';
    private activePointerTextLookup?: ActivePointerTextLookup;
    private suppressedHoverWord?: HTMLElement;
    private suppressedHoverLookupKey = '';
    private activePopoverMode?: 'modal' | 'hover';
    private activePopoverAnchor?: HTMLElement;
    private activePopoverAnchorRect?: DOMRect;
    private activePopoverPositionLocked = false;
    private activePopoverLockedPosition?: { left: number; top: number };
    private activePopoverResizeObserver?: ResizeObserver;
    private readonly nativeTitleGuard = new NativeTitleGuard();
    private lastPointerPosition?: { x: number; y: number };
    private hoverPopoverPointerPosition?: { x: number; y: number };
    private popoverRepositionFrame?: number;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private cardRenderRequest = 0;
    private dictionaryRescanPending = false;
    private visiblePageReparseTimer?: number;
    private jpdbPageEnhanceTimer?: number;
    private jpdbPageEnhancementGeneration = 0;
    private nearbyReaderAudioPreloadTimer?: number;
    private preloadedTermAudioKeys = new Set<string>();
    private nestedParseContentCache = new Map<string, NestedParseContentCacheEntry>();
    private pitchEnrichmentLocalCache = new Map<string, Promise<string>>();
    private pitchEnrichmentQueue: JPDBToken[] = [];
    private pitchEnrichmentQueuedKeys = new Set<string>();
    private pitchEnrichmentUrgentKeys = new Set<string>();
    private pitchEnrichmentDrain?: Promise<void>;
    private pressedKeys = new Set<string>();
    private hoverAnchorIds = new WeakMap<HTMLElement, number>();
    private nextHoverAnchorId = 1;
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
    private suppressPenHoverUntil = 0;
    private pageHasJapaneseText = false;
    private pressLookup?: PressLookupState;
    private suppressMiddleAuxClickUntil = 0;

    constructor() {
        configureLogger({ settingsProvider: () => this.settings });
    }

    async init(options?: ReaderAppInitOptions): Promise<void> {
        const done = log.time('init', { href: location.href, devMode: Logger.isDevMode() });
        const shouldShowWelcome = await this.loadInitialSettings(options);
        await this.installCoreSurfaces();
        if (this.initHostedPassivePage()) return done();
        await this.initReaderPage(shouldShowWelcome);
        done();
    }

    private async loadInitialSettings(options?: ReaderAppInitOptions): Promise<boolean> {
        this.factoryReset.bind();
        this.settings = await loadSettings();
        if (options?.isDemo) this.enableDemoMode();
        const shouldShowWelcome = options?.showWelcome ?? !this.isDemo;
        this.settings = applyUrlBootstrapSettings(this.settings);
        configureLogger({ forceEnabled: this.settings.enableLogging });
        this.pageHasJapaneseText = documentHasJapaneseText();
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        return shouldShowWelcome;
    }

    private enableDemoMode(): void {
        this.settings = {
            ...this.settings,
            onboardingSeen: true,
            audioEnabled: true,
            autoPlayAudio: false,
            audioFallbackChimeEnabled: false,
            immersionKitAutoPlayAudio: false,
            immersionKitPlayOnHover: false,
            immersionKitPlayOnImageClick: false,
            ocrAutoScanImages: false,
            autoScanJapanese: false,
            scanVisiblePage: false,
            showFloatingButton: false,
            pitchColorHeiban: '#74c0ff',
            pitchColorAtamadaka: '#ff8fab',
            pitchColorNakadaka: '#ffd166',
            pitchColorOdaka: '#7ee7d1',
            pitchColorKifuku: '#c4a3ff',
            pitchColorUnknown: '#cbd5e1',
        };
        this.isDemo = true;
    }

    private async installCoreSurfaces(): Promise<void> {
        this.installStyles();
        this.applyTheme();
        await this.refreshDictionaryStyles();
        this.registerMenuCommands();
        this.bindEvents();
        initJpdbReviewPageBridge();
    }

    private initHostedPassivePage(): boolean {
        if (!isYomuHostedPassivePage(location.href)) return false;
        this.ocr.init();
        if (this.shouldScanHostedDemoLookup()) {
            this.scanHostedDemoLookup();
            log.info('Passive hosted Try Me scan initialized', { href: location.href, demo: this.isDemo });
            return true;
        }
        log.info('Passive hosted OCR initialized', { href: location.href, demo: this.isDemo });
        return true;
    }

    private async initReaderPage(shouldShowWelcome: boolean): Promise<void> {
        this.installFab();
        this.subtitles.init();
        this.ocr.init();
        this.youtube.init();
        this.setupAutoScan();
        this.initJpdbPageEnhancements();
        this.scanHostedDemoLookup();
        if (shouldShowWelcome && !isYomuHostedAppUrl(location.href)) await this.onboarding.showIfNeeded();
        if (this.shouldScanInitialPage()) void this.pageScanner.scanVisiblePage({ silent: true });
    }

    private scanHostedDemoLookup(): void {
        if (this.isDestroyed || !this.shouldScanHostedDemoLookup()) return;
        this.pageHasJapaneseText = true;
        void this.pageScanner.scanVisiblePage({ silent: true });
    }

    private shouldScanHostedDemoLookup(): boolean {
        return isYomuHostedPassivePage(location.href)
            && Boolean(document.querySelector('[data-yomu-demo-lookup]'))
            && !document.querySelector('[data-yomu-demo-lookup] .jpdb-reader-word');
    }

    private shouldScanInitialPage(): boolean {
        return this.canParseJapanese()
            && (this.settings.scanVisiblePage || this.settings.autoScanJapanese)
            && this.pageHasJapaneseText;
    }

    private registerMenuCommands(): void {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
            GM_registerMenuCommand(`${APP_NAME} open new tab`, () => this.openNewTabPage());
            GM_registerMenuCommand(`${APP_NAME} open video player`, () => this.openVideoPlayer());
            GM_registerMenuCommand(`${APP_NAME} toggle YouTube filter`, () => void this.toggleYoutubeImmersion());
            GM_registerMenuCommand(`${APP_NAME} toggle puck`, () => {
                this.settings.showFloatingButton = !this.settings.showFloatingButton;
                void saveSettings(this.settings).then(() => this.installFab());
            });
            GM_registerMenuCommand(`${APP_NAME} Factory Reset`, () => void this.factoryReset.resetAllData());
        }
    }

    private openNewTabPage(): void {
        const opened = window.open(NEW_TAB_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        if (!opened) location.href = NEW_TAB_PAGE_URL;
        log.info('New tab page opened', { url: NEW_TAB_PAGE_URL });
    }

    private openVideoPlayer(): void {
        const opened = window.open(VIDEO_PLAYER_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        if (!opened) location.href = VIDEO_PLAYER_PAGE_URL;
        log.info('Video player page opened', { url: VIDEO_PLAYER_PAGE_URL });
    }

    private async toggleYoutubeImmersion(): Promise<void> {
        await this.setYoutubeImmersionEnabled(!this.settings.youtubeImmersionEnabled);
    }

    private async setYoutubeImmersionEnabled(enabled: boolean): Promise<void> {
        this.settings.youtubeImmersionEnabled = enabled;
        await saveSettings(this.settings);
        this.youtube.refresh();
        log.info('YouTube immersion filter toggled', { enabled });
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'youtubeToggleToastOn' : 'youtubeToggleToastOff'));
    }

    private async setYoutubeFilterNoticeVisible(visible: boolean): Promise<void> {
        this.settings.youtubeShowFilterNotice = visible;
        await saveSettings(this.settings);
        this.youtube.refresh();
        log.info('YouTube filter notice visibility changed', { visible });
    }

    private async setInterfaceLanguage(language: InterfaceLanguage): Promise<void> {
        if (this.settings.interfaceLanguage === language) return;
        this.settings.interfaceLanguage = language;
        await saveSettings(this.settings);
        this.installFab();
        this.subtitles.refresh();
        this.ocr.refresh();
        this.youtube.refresh();
        log.info('Interface language changed', { language });
    }

    private async invalidateRuntimeStoresForFactoryReset(): Promise<void> {
        this.dismiss({ suppressHoverTarget: false });
        this.jpdb.clear();
        this.parser.clearLocalCache();
        this.dictionarySourceState.clear();
        this.cardRenderData.clear();
        this.preloadedTermAudioKeys.clear();
        this.nestedParseContentCache.clear();
        this.pitchEnrichmentLocalCache.clear();
        this.clearPitchEnrichmentQueue();
        this.pitchEnrichmentUrgentKeys.clear();
        this.pressedKeys.clear();
        window.clearTimeout(this.nearbyReaderAudioPreloadTimer);
        this.nearbyReaderAudioPreloadTimer = undefined;
        this.cardRenderRequest++;
        await this.dictionaries.invalidateForFactoryReset();
    }

    private installStyles(): void {
        const hasLinkedReaderCss = Boolean(document.querySelector('link[href$="/yomu.css"], link[href*="/yomu.css?"]'));
        const style = document.createElement('style');
        style.textContent = hasLinkedReaderCss ? '' : READER_CSS;
        appendToDocumentHead(style);
        if (!readerCssNeedsFallback(READER_CSS)) return;
        void loadReaderCssFallback().then(css => {
            if (!css || this.isDestroyed) return;
            style.textContent = css;
        }).catch(error => {
            log.warn('Reader CSS fallback load failed', error);
        });
    }

    private applyTheme(settings = this.settings): void {
        applyReaderTheme(settings);
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private scheduleDictionaryRescan(): void {
        if (this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.dictionaryRescanPending = true;
            return;
        }
        this.pitchEnrichmentLocalCache.clear();
        this.nestedParseContentCache.clear();
        this.clearPitchEnrichmentQueue();
        this.scheduleJpdbPageEnhancements(80);
        this.scheduleVisiblePageReparse(120);
    }

    private scheduleVisiblePageReparse(delay = 0): void {
        if (this.isDestroyed) return;
        if (this.visiblePageReparseTimer !== undefined) return;
        this.visiblePageReparseTimer = window.setTimeout(() => {
            this.visiblePageReparseTimer = undefined;
            void this.reparseVisiblePage();
        }, Math.max(0, delay));
    }

    private async reparseVisiblePage(): Promise<void> {
        this.jpdb.clear();
        this.parser.clearLocalCache();
        this.nestedParseContentCache.clear();
        this.pauseAutoScanObserver(() => {
            this.removeJpdbPageEnhancements();
        });
        if (!this.canParseJapanese()) {
            this.scheduleJpdbPageEnhancements(0);
            return;
        }
        await this.pageScanner.scanVisiblePage({ silent: true });
        this.scheduleJpdbPageEnhancements(0);
    }

    private initJpdbPageEnhancements(): void {
        if (!isJpdbHost()) return;
        this.scheduleJpdbPageEnhancements(0);
        addWindowEventListener('popstate', () => this.scheduleJpdbPageEnhancements(120), { signal: this.abortController.signal });
        addWindowEventListener('hashchange', () => this.scheduleJpdbPageEnhancements(120), { signal: this.abortController.signal });
    }

    private scheduleJpdbPageEnhancements(delay = 0): void {
        if (this.isDestroyed || !isJpdbHost()) return;
        window.clearTimeout(this.jpdbPageEnhanceTimer);
        this.jpdbPageEnhanceTimer = window.setTimeout(() => {
            this.jpdbPageEnhanceTimer = undefined;
            void this.refreshJpdbPageEnhancements();
        }, Math.max(0, delay));
    }

    private async refreshJpdbPageEnhancements(): Promise<void> {
        const generation = ++this.jpdbPageEnhancementGeneration;
        this.pauseAutoScanObserver(() => this.removeJpdbPageEnhancements());
        if (!this.settings.jpdbPageEnhancementsEnabled) return;
        if (this.isCurrentJpdbKanjiSurface()) {
            if (this.settings.jpdbPageKanjiEnhancementsEnabled) this.installJpdbKanjiPageEnhancement(generation);
            return;
        }
        if (this.settings.jpdbPageWordEnhancementsEnabled) await this.installJpdbWordPageEnhancements(generation);
    }

    private removeJpdbPageEnhancements(): void {
        document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]').forEach(element => element.remove());
    }

    private isCurrentJpdbKanjiSurface(): boolean {
        return isKanjiPage() || isKanjiReviewBack();
    }

    private async installJpdbWordPageEnhancements(generation: number): Promise<void> {
        const targets = currentLocalDictionaryTargets();
        await Promise.all(targets.map(target => this.installJpdbWordPageEnhancement(target, generation)));
    }

    private async installJpdbWordPageEnhancement(target: LocalDictionaryTarget, generation: number): Promise<void> {
        const card = jpdbAudioCard(target.term, target.reading);
        const entries = await this.lookupJpdbPageLocalEntries(target);
        if (!this.isCurrentJpdbPageEnhancement(generation)) return;
        if (!entries.length && !this.settings.immersionKitEnabled) return;

        const root = this.createJpdbPageAddonRoot('word', target.anchor);
        if (!root) return;
        setInnerHtml(root, this.renderDefinitionSources(card, entries, target.examples[0]?.sentence, null, {
            includeJpdbSource: false,
            includeStudySources: false,
        }));
        this.installJpdbPageAddonHandlers(root, card);
        this.dictionarySourceState.installTracking(root);
        this.installJpdbPageImmersionExamples(root, card, [
            ...target.alternates,
            ...target.compounds.flatMap(compound => [compound.term, compound.reading]),
            ...target.examples.map(example => example.sentence),
        ]);
        void this.parseJpdbPageAddonJapanese(root);
    }

    private async lookupJpdbPageLocalEntries(target: LocalDictionaryTarget): Promise<YomitanTermEntry[]> {
        if (!this.settings.localDictionariesEnabled) return [];
        const variants = localDictionaryLookupVariants(target).slice(0, 12);
        const batches = await Promise.all(variants.map(variant =>
            this.dictionaries.lookup(
                variant.term,
                variant.reading || variant.term,
                this.settings.localDictionaryMaxResults,
                this.settings.dictionaryPreferences,
            ).catch(() => [] as YomitanTermEntry[]),
        ));
        return uniqueLocalDictionaryEntries(batches.flat())
            .sort((first, second) =>
                jpdbPageDictionaryPreferencePriority(first.dictionary, this.settings)
                    - jpdbPageDictionaryPreferencePriority(second.dictionary, this.settings),
            )
            .slice(0, this.settings.localDictionaryMaxResults);
    }

    private installJpdbKanjiPageEnhancement(generation: number): void {
        const kanji = extractCurrentKanji();
        if (!isKanjiCharacter(kanji) || !this.isCurrentJpdbPageEnhancement(generation)) return;
        const target = currentJpdbTermTarget();
        const root = this.createJpdbPageAddonRoot('kanji', target?.anchor ?? document.body);
        if (!root) return;
        const language = this.settings.interfaceLanguage;
        const mounts = this.renderKanjiSourceMounts(kanji, language);
        if (!mounts) {
            root.remove();
            return;
        }

        const card = jpdbAudioCard(kanji, kanji);
        setInnerHtml(root, `<div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">${mounts}</div>`);
        this.installJpdbPageAddonHandlers(root, card);
        this.dictionarySourceState.installTracking(root);
        this.startKanjiProgressiveRender(root, this.kanjiDetailPromises(kanji), card, kanji, language, target ?? undefined);
        void this.parseJpdbPageAddonJapanese(root);
    }

    private createJpdbPageAddonRoot(kind: 'word' | 'kanji', anchor: HTMLElement): HTMLElement | null {
        if (!anchor.isConnected) return null;
        const root = document.createElement('div');
        root.dataset.jpdbReaderRoot = 'true';
        root.dataset.yomuJpdbAddon = kind;
        root.className = `yomu-jpdb-page-addon yomu-jpdb-${kind}-addon`;
        this.pauseAutoScanObserver(() => {
            if (anchor === document.body) document.body.prepend(root);
            else anchor.insertAdjacentElement('afterend', root);
        });
        return root;
    }

    private installJpdbPageAddonHandlers(root: HTMLElement, fallbackCard: JPDBCard): void {
        root.addEventListener('click', event => {
            if (!(event instanceof MouseEvent)) return;
            if (this.handleDictionaryLookupLink(event, root, 'modal')) return;
            const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!actionButton || !root.contains(actionButton)) return;
            const action = actionButton.dataset.action;
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === 'kanji') {
                const kanji = actionButton.dataset.kanji ?? '';
                void this.showKanjiCard(fallbackCard, kanji, fallbackCard.spelling, actionButton, { navigation: 'push-current', preservePosition: true });
                return;
            }
            if (action === 'similar-word' || action === 'lookup') {
                const expression = actionButton.dataset.expression ?? actionButton.dataset.lookup ?? actionButton.dataset.term ?? '';
                const reading = actionButton.dataset.reading ?? expression;
                void this.lookupText(expression, reading, { anchor: actionButton, navigation: 'push-current', preservePosition: true, userGesture: true });
                return;
            }
            if (action === 'jpdb-example-audio') {
                void this.audioActions.playJpdbExampleAudio(actionButton.dataset.jpdbAudio ?? '', actionButton.dataset.jpdbExampleSentence ?? '');
            }
        });
    }

    private isCurrentJpdbPageEnhancement(generation: number): boolean {
        return !this.isDestroyed
            && isJpdbHost()
            && this.settings.jpdbPageEnhancementsEnabled
            && generation === this.jpdbPageEnhancementGeneration;
    }

    private applyAccentColor(color: string): void {
        applyReaderAccentColor(color);
    }

    private applyWordColors(settings = this.settings): void {
        applyReaderWordColors(settings);
    }

    private installFab(): void {
        this.floatingButton.install(
            this.settings,
            () => void saveSettings(this.settings),
            () => this.showSettings(),
        );
    }

    destroy(options: ReaderAppDestroyOptions = {}): void {
        this.isDestroyed = true;
        this.pageScanner.destroy?.();
        this.factoryReset.destroy();
        this.abortController.abort();
        this.autoScanObserver?.disconnect();
        this.ocr.destroy();
        this.subtitles.destroy();
        this.youtube.destroy();
        window.clearTimeout(this.autoScanTimer);
        window.clearTimeout(this.asbScanTimer);
        window.clearTimeout(this.selectionTimer);
        window.clearTimeout(this.visiblePageReparseTimer);
        window.clearTimeout(this.jpdbPageEnhanceTimer);
        window.clearTimeout(this.nearbyReaderAudioPreloadTimer);
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        this.nestedParseContentCache.clear();
        this.pitchEnrichmentLocalCache.clear();
        this.clearPitchEnrichmentQueue();
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.activePopoverResizeObserver?.disconnect();
        this.nativeTitleGuard.restore();
        
        this.floatingButton.destroy();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.removeJpdbPageEnhancements();
        if (!options.preservePageWords) {
            document.querySelectorAll('.jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby').forEach(el => {
                if (el.classList.contains('jpdb-reader-word') || el.classList.contains('jpdb-reader-ruby')) {
                    const text = document.createTextNode(el.classList.contains('jpdb-reader-word')
                        ? readerWordSurfaceText(el)
                        : el.textContent || '');
                    el.replaceWith(text);
                } else {
                    el.remove();
                }
            });
        }
        
        this.dictionaryStyles.remove();
        document.querySelectorAll('[data-jpdb-reader-root]').forEach(el => el.remove());
    }

    private setupAutoScan(): void {
        this.autoScanObserver?.disconnect();
        this.autoScanObserver = new MutationObserver(mutations => {
            if (mutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (mutations.every(mutationInsideReaderRoot)) return;
            else if (mutations.some(mutationMayContainJapaneseText)) {
                this.pageHasJapaneseText = true;
                this.scheduleAutoScan(450);
            }
            if (isJpdbHost() && mutations.some(mutationMayAffectJpdbPageEnhancements)) this.scheduleJpdbPageEnhancements(500);
        });
        this.observeAutoScanMutations();
        window.addEventListener('scroll', () => this.scheduleAutoScan(500), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(700), { passive: true });
        window.addEventListener('resize', () => this.scheduleJpdbPageEnhancements(700), { passive: true });
        if (this.pageHasJapaneseText) this.scheduleAutoScan(600);
    }

    private observeAutoScanMutations(): void {
        this.autoScanObserver?.observe(document.body, AUTO_SCAN_OBSERVER_OPTIONS);
    }

    private pauseAutoScanObserver<T>(callback: () => T): T {
        const observer = this.autoScanObserver;
        if (!observer) return callback();

        observer.disconnect();
        try {
            return callback();
        } finally {
            if (!this.isDestroyed && this.autoScanObserver === observer) this.observeAutoScanMutations();
        }
    }

    private scheduleAutoScan(delay: number): void {
        if (!this.canScheduleAutoScan()) return;
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) return;

        window.clearTimeout(this.autoScanTimer);
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.runScheduledAutoScan();
        }, delay);
    }

    private canScheduleAutoScan(): boolean {
        return !this.isDestroyed
            && this.settings.autoScanJapanese
            && this.canParseJapanese()
            && this.pageHasJapaneseText;
    }

    private runScheduledAutoScan(): void {
        this.autoScanTimer = undefined;
        this.autoScanDeadline = 0;
        void this.pageScanner.scanAsbPlayerSubtitles();
        if (hasVisibleAutoScanTargets()) void this.pageScanner.scanVisiblePage({ silent: true });
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (this.isDestroyed) return;
        if (!this.settings.autoScanJapanese || !this.canParseJapanese()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.pageScanner.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        addWindowEventListener(OPEN_SETTINGS_EVENT, event => {
            if (this.isDestroyed) return;
            this.showSettings(openSettingsPanelDetail((event as CustomEvent<OpenSettingsEventDetail>).detail));
        }, { signal: this.abortController.signal });

        addWindowEventListener(INTERFACE_LANGUAGE_CHANGE_EVENT, event => {
            if (this.isDestroyed) return;
            const language = interfaceLanguageChangeDetail((event as CustomEvent<InterfaceLanguageChangeDetail>).detail);
            if (language) void this.setInterfaceLanguage(language);
        }, { signal: this.abortController.signal });

        addWindowEventListener(HOSTED_DEMO_LOOKUP_SCAN_EVENT, () => {
            this.scanHostedDemoLookup();
        }, { signal: this.abortController.signal });

        document.addEventListener('click', event => {
            if (this.isDestroyed) return;
            const target = event.target as HTMLElement;
            if (target.closest?.('[data-jpdb-reader-root] [data-action="kanji"][data-kanji]')) return;
            if (target.closest?.('[data-yomu-jpdb-addon] [data-action]')) return;
            if (target.closest?.('[data-settings-preview-lookup]')) return;
            if (target.closest?.('.jpdb-reader-settings .jpdb-reader-word')) return;
            if (this.isNativePageLookupBlocked(target)) return;
            const word = target.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word && target.closest?.('[data-jpdb-reader-root] a.gloss-link[data-dictionary-lookup]')) return;
            if (!word) {
                if (!this.settings.lookupOnClick) return;
                const candidate = this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target);
                if (!candidate) return;
                event.preventDefault();
                event.stopPropagation();
                this.prepareModalLookupFromPointer(event);
                this.suppressSelectionLookupUntil = Date.now() + 350;
                const insideActivePopover = this.activePopoverMode === 'modal' && this.isInsideActivePopover(event.target as Node | null);
                void this.showLookupCandidate(candidate, 'modal', {
                    navigation: insideActivePopover ? 'push-current' : 'reset',
                    preservePosition: insideActivePopover,
                    userGesture: true,
                });
                return;
            }
            if (!this.canLookupReaderWord(word)) return;
            if (word.dataset.jpdbReaderPassive === 'true') return;
            if (Date.now() < this.suppressWordClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (this.shouldIgnoreCurrentImmersionExampleTargetClick(word)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
            const insideSubtitlePlayer = Boolean(word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list'));
            if (!this.settings.lookupOnClick && !insideReaderPopup && !insideSubtitlePlayer) return;

            event.preventDefault();
            event.stopPropagation();
            this.prepareModalLookupFromPointer(event);
            this.suppressSelectionLookupUntil = Date.now() + 350;
            if (insideSubtitlePlayer && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word, { trigger: 'click', userGesture: true });
        }, { capture: true });

        document.addEventListener('mousedown', event => {
            if (this.isDestroyed) return;
            if (!this.shouldCaptureMiddleMouseLookup(event)) return;
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true, passive: false });

        document.addEventListener('auxclick', event => {
            if (this.isDestroyed) return;
            if (event.button !== 1 || Date.now() > this.suppressMiddleAuxClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
        }, { capture: true });

        document.addEventListener('pointerdown', event => {
            this.suppressHoverAfterPenContact(event);
            this.dismissModalPopoverForOutsidePointer(event);
            this.dismissHoverPopoverForOutsidePointer(event);
            this.beginPressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointermove', event => {
            this.updatePressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointerup', event => {
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointercancel', event => {
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointerover', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointermove', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointerout', event => {
            this.handleHoverPointerOut(event);
        }, { capture: true });

        if (!window.PointerEvent) {
            document.addEventListener('mouseover', event => {
                this.handleHoverPointer(event as PointerEvent);
            }, { capture: true });

            document.addEventListener('mousemove', event => {
                this.handleHoverPointer(event as PointerEvent);
            }, { capture: true });

            document.addEventListener('mouseout', event => {
                this.handleHoverPointerOut(event as PointerEvent);
            }, { capture: true });
        }

        document.addEventListener('keyup', () => {
            if (this.isDestroyed) return;
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 120);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDestroyed) return;
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 140);
        });

        document.addEventListener('touchend', () => {
            if (this.isDestroyed) return;
            if (!this.settings.parseSelection) return;
            window.clearTimeout(this.selectionTimer);
            this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), 180);
        }, { passive: true });

        document.addEventListener('keydown', event => {
            if (this.isDestroyed) return;
            this.pressedKeys.add(normalizePressedKey(event.key));
            if (isEditableTarget(event.target)) return;
            const escapeClose = this.settings.shortcuts.closePopup.trim().toLowerCase() === 'escape' && event.key === 'Escape';
            if ((escapeClose || matchesShortcut(event, this.settings.shortcuts.closePopup)) && this.hasOpenReaderDialog()) {
                event.preventDefault();
                this.dismiss({ suppressHoverTarget: true });
                return;
            }
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
            if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
                event.preventDefault();
                log.info('Shortcut triggered visible page scan');
                void this.pageScanner.scanVisiblePage({ silent: true });
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
                event.preventDefault();
                log.info('Shortcut opened settings');
                this.showSettings();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
                event.preventDefault();
                this.settings.ocrEnabled = !this.settings.ocrEnabled;
                void saveSettings(this.settings);
                this.ocr.refresh();
                log.info('Shortcut toggled OCR', { enabled: this.settings.ocrEnabled });
                this.toast(uiText(this.settings.interfaceLanguage, this.settings.ocrEnabled ? 'imageReadingEnabled' : 'imageReadingHidden'));
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
                event.preventDefault();
                void this.toggleYoutubeImmersion();
                return;
            }
            if (matchesShortcut(event, this.settings.shortcuts.scanImages)) {
                event.preventDefault();
                log.info('Shortcut triggered image scan');
                void this.ocr.scanVisible();
                return;
            }
            if (this.lastCard && this.activePopover && matchesShortcut(event, this.settings.shortcuts.playAudio)) {
                event.preventDefault();
                void this.audioActions.playTermAudio(this.lastCard, { userGesture: true });
                return;
            }
            const grade = this.shortcutGrade(event);
            if (this.lastCard && grade && this.activePopover?.classList.contains('jpdb-reader-popover')) {
                event.preventDefault();
                const ankiCardId = this.lastAnkiLookup?.primary?.primaryCardId ?? null;
                if (!ankiCardId && !this.settings.jpdbMiningEnabled) return;
                const card = this.lastCard;
                const sentence = this.lastCardSentence;
                const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
                const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
                void this.cardActions.reviewGrade(grade, card, sentence, {
                    ankiCardId: Number.isFinite(ankiCardId) && ankiCardId ? ankiCardId : undefined,
                }).then(() => this.showCard(card, sentence, anchor, {
                    autoPlay: false,
                    trigger,
                    navigation: 'preserve',
                    preservePosition: true,
                })).catch(error => {
                    log.warn('Shortcut review failed', { grade, ankiCardId: Number.isFinite(ankiCardId) ? ankiCardId : undefined }, error);
                    this.toast(error instanceof Error ? error.message : uiText(this.settings.interfaceLanguage, 'reviewFailed'));
                });
            }
        });
        document.addEventListener('keyup', event => {
            this.pressedKeys.delete(normalizePressedKey(event.key));
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && !this.shouldLookupOnHover(event)) {
                this.cancelPendingHoverLookup();
                if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
            }
        });
        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
            this.cancelPendingHoverLookup();
            if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
        });
    }

    private shortcutGrade(event: KeyboardEvent): JPDBGrade | null {
        if (!this.settings.enableReviews) return null;
        const shortcuts = this.settings.twoButtonReviews
            ? TWO_BUTTON_REVIEW_SHORTCUTS
            : FIVE_BUTTON_REVIEW_SHORTCUTS;
        return matchedReviewShortcutGrade(event, this.settings.shortcuts, shortcuts);
    }

    private shouldLookupOnHover(event: MouseEvent | KeyboardEvent): boolean {
        return !this.hasStickyModalPopover()
            && this.settings.lookupOnHover
            && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private hasHoverLookupShortcut(): boolean {
        return Boolean((this.settings.shortcuts.hoverLookup ?? '').trim());
    }

    private beginPressLookup(event: PointerEvent): void {
        const request = this.pressLookupRequest(event);
        if (!request) return;
        if (request.isMiddleScan) this.captureMiddleMouseLookup(event);
        this.pressLookup = this.createPressLookup(event, request.isMiddleScan);
        if (request.isMiddleScan) this.updatePressLookup(event);
    }

    private pressLookupRequest(event: PointerEvent): { isMiddleScan: boolean } | null {
        const isMiddleScan = this.shouldCaptureMiddleMouseLookup(event);
        if (!this.canBeginPressLookup(event, isMiddleScan)) return null;
        if (!isMiddleScan && !this.wordFromEventTarget(event.target)) return null;
        return { isMiddleScan };
    }

    private canBeginPressLookup(event: PointerEvent, isMiddleScan: boolean): boolean {
        if (this.isDestroyed) return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        if (isMiddleScan) return true;
        return this.canBeginPrimaryPressLookup(event);
    }

    private canBeginPrimaryPressLookup(event: PointerEvent): boolean {
        return hasPressLookupEnabled(this.settings)
            && event.pointerType !== 'touch'
            && event.pointerType !== 'pen'
            && (event.pointerType !== 'mouse' || event.button === 0);
    }

    private prepareModalLookupFromPointer(event: MouseEvent): void {
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        this.cancelPendingHoverLookup();
        this.cancelHoverClose();
    }

    private createPressLookup(event: PointerEvent, isMiddleScan: boolean): PressLookupState {
        return {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: isMiddleScan,
            source: isMiddleScan ? 'middle' : 'primary',
            captureTarget: isMiddleScan && event.target instanceof Element ? event.target : undefined,
        };
    }

    private updatePressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };

        if (!this.activatePressLookupIfNeeded(pressLookup, event)) return;

        event.preventDefault();
        event.stopPropagation();
        this.updateActivePressLookupTarget(pressLookup, event);
    }

    private updateActivePressLookupTarget(pressLookup: PressLookupState, event: PointerEvent): void {
        const targetAtPointer = document.elementFromPoint(event.clientX, event.clientY);
        if (this.isInsideActivePopover(targetAtPointer)) {
            this.cancelHoverClose();
            return;
        }

        const word = this.wordFromPoint(event.clientX, event.clientY);
        if (!word) {
            if (pressLookup.source === 'middle') this.scheduleHoverClose();
            return;
        }
        this.showPressLookupWord(pressLookup, word, event);
    }

    private showPressLookupWord(pressLookup: PressLookupState, word: HTMLElement, event: PointerEvent): void {
        this.rememberHoverPopoverPointer(event);
        if (this.refreshPressLookupWord(pressLookup, word)) return;
        pressLookup.lastWord = word;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        if (word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list') && this.settings.subtitleMiningPause) pauseActiveVideo();
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        void this.showWord(word, { trigger: 'hover', hoverLookupGeneration });
    }

    private activatePressLookupIfNeeded(pressLookup: PressLookupState, event: PointerEvent): boolean {
        if (pressLookup.active) return true;
        const distance = Math.hypot(event.clientX - pressLookup.startX, event.clientY - pressLookup.startY);
        if (distance < 8) return false;
        pressLookup.active = true;
        this.suppressWordClickUntil = Date.now() + 700;
        this.suppressedHoverWord = undefined;
        return true;
    }

    private refreshPressLookupWord(pressLookup: PressLookupState, word: HTMLElement): boolean {
        if (word !== pressLookup.lastWord) return false;
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) this.scheduleActivePopoverReposition();
        return true;
    }

    private endPressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.matchingPressLookup(event);
        if (!pressLookup) return;
        this.finishPressLookupRelease(event, pressLookup);
        this.pressLookup = undefined;
    }

    private matchingPressLookup(event: PointerEvent): PressLookupState | null {
        const pressLookup = this.pressLookup;
        return pressLookup?.pointerId === event.pointerId ? pressLookup : null;
    }

    private finishPressLookupRelease(event: PointerEvent, pressLookup: PressLookupState): void {
        if (pressLookup.active) this.suppressPressLookupAfterRelease();
        if (pressLookup.source === 'middle') this.finishMiddlePressLookup(event, pressLookup);
    }

    private suppressPressLookupAfterRelease(): void {
        this.suppressWordClickUntil = Date.now() + 700;
        this.suppressSelectionLookupUntil = Date.now() + 350;
    }

    private finishMiddlePressLookup(event: PointerEvent, pressLookup: PressLookupState): void {
        event.preventDefault();
        event.stopPropagation();
        this.finishMiddleMouseLookup(pressLookup);
        if (this.activePopoverMode === 'hover' && !this.isHoverContextActive()) this.scheduleHoverClose();
    }

    private shouldCaptureMiddleMouseLookup(event: MouseEvent | PointerEvent): boolean {
        if (!this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        return isMousePointerEvent(event) && !this.isNativeMiddleClickTarget(eventElement(event));
    }

    private captureMiddleMouseLookup(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.suppressMiddleAuxClickUntil = Date.now() + 1200;
        this.suppressSelectionLookupUntil = Date.now() + 350;
        document.documentElement.classList.add('jpdb-reader-middle-scan-active');
        try {
            if (event.target instanceof Element) event.target.setPointerCapture?.(event.pointerId);
        } catch {
            // Some pages detach nodes during pointerdown; capture is only an enhancement.
        }
    }

    private finishMiddleMouseLookup(pressLookup: { pointerId: number; captureTarget?: Element }): void {
        this.suppressMiddleAuxClickUntil = Date.now() + 700;
        document.documentElement.classList.remove('jpdb-reader-middle-scan-active');
        try {
            pressLookup.captureTarget?.releasePointerCapture?.(pressLookup.pointerId);
        } catch {
            // Already released or unsupported.
        }
    }

    private isNativeMiddleClickTarget(target: Element | null): boolean {
        return Boolean(target?.closest([
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            'summary',
            '[role="button"]',
            '[contenteditable="true"]',
            '[data-jpdb-reader-root]',
        ].join(',')));
    }

    private wordFromEventTarget(target: EventTarget | null): HTMLElement | null {
        const element = target instanceof Element ? target : null;
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canLookupReaderWord(word) ? word : null;
    }

    private wordFromPoint(x: number, y: number): HTMLElement | null {
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word && this.canLookupReaderWord(word)) return word;
        }
        return null;
    }

    private preloadHoverWordAudio(word: HTMLElement): void {
        this.preloadReaderWordAudio(word, { sourceLimit: 1, candidateLimit: 1, prepareAudio: false });
        if (this.canPreloadBackgroundReaderAudio()) this.scheduleNearbyReaderWordAudioPreloads(word);
    }

    private preloadReaderWordAudio(word: HTMLElement, options: ReaderAudioPreloadOptions = {}): boolean {
        if (!this.canPreloadReaderAudio()) return false;
        const card = this.preloadableReaderWordCard(word);
        if (!card) return false;
        if (!this.reservePreloadedTermAudio(card)) return false;
        this.audio.preload(card, audioPreloadLimits(options));
        return true;
    }

    private canPreloadReaderAudio(): boolean {
        return this.settings.audioEnabled;
    }

    private canPreloadBackgroundReaderAudio(): boolean {
        return this.settings.audioEnabled && this.settings.autoPlayAudio;
    }

    private reservePreloadedTermAudio(card: JPDBCard): boolean {
        const key = cardKey(card);
        if (this.preloadedTermAudioKeys.has(key)) return false;
        this.rememberPreloadedTermAudioKey(key);
        return true;
    }

    private preloadableReaderWordCard(word: HTMLElement): JPDBCard | null {
        const card = this.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
        return card && isUsefulImmersionPreloadQuery(card.spelling) ? card : null;
    }

    private scheduleNearbyReaderWordAudioPreloads(word: HTMLElement): void {
        window.clearTimeout(this.nearbyReaderAudioPreloadTimer);
        this.nearbyReaderAudioPreloadTimer = window.setTimeout(() => {
            this.nearbyReaderAudioPreloadTimer = undefined;
            if (!word.isConnected || !this.canPreloadBackgroundReaderAudio()) return;
            this.queueNearbyReaderWordAudioPreloads(word);
        }, NEARBY_TERM_AUDIO_PRELOAD_DELAY_MS);
    }

    private queueNearbyReaderWordAudioPreloads(word: HTMLElement): number {
        const words = this.lookupableReaderWords();
        const index = words.indexOf(word);
        return index < 0 ? 0 : this.queueReaderWordAudioPreloads(words.slice(index + 1), { prepareAudio: false });
    }

    private lookupableReaderWords(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(candidate => candidate.isConnected && this.canLookupReaderWord(candidate));
    }

    private queueReaderWordAudioPreloads(words: HTMLElement[], options: ReaderAudioPreloadOptions = {}): number {
        let queued = 0;
        for (const candidate of words) {
            if (this.preloadReaderWordAudio(candidate, options)) queued++;
            if (queued >= NEARBY_TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        return queued;
    }

    private canLookupReaderWord(word: HTMLElement): boolean {
        if (isOcrLineFrameWord(word)) return false;
        if (word.dataset.jpdbReaderPassive === 'true') return false;
        if (this.isNativePageLookupBlocked(word)) return false;
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer, .jpdb-reader-popover, .yomu-jpdb-page-addon'));
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        if (isOcrLineFrameWord(word)) return false;
        if (this.isNativePageLookupBlocked(word)) return false;
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        if (word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer, .jpdb-reader-newtab-immersion, .yomu-jpdb-page-addon')) return true;
        return this.hasHoverLookupShortcut()
            && Boolean(word.closest('.jpdb-reader-newtab, .jpdb-reader-popover, .jpdb-reader-settings'));
    }

    private handleHoverPointer(event: PointerEvent): void {
        if (this.shouldIgnoreHoverPointer(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        const insideActivePopover = this.handleActivePopoverHover(event);
        if (insideActivePopover) return;
        const word = this.hoverReaderWordForEvent(event);
        if (!word) {
            if (insideActivePopover) return;
            this.handlePointerTextHover(event);
            return;
        }
        this.handleReaderWordHover(word, event);
    }

    private shouldIgnoreHoverPointer(event: PointerEvent): boolean {
        if (this.isDestroyed || this.pressLookup?.source === 'middle' || event.pointerType === 'touch' || this.shouldSuppressPenHover(event)) return true;
        if (!this.hasStickyModalPopover()) return false;
        this.cancelPendingHoverLookup();
        this.cancelHoverClose();
        return true;
    }

    private hasStickyModalPopover(): boolean {
        return this.activePopoverMode === 'modal' && Boolean(this.activePopover);
    }

    private suppressHoverAfterPenContact(event: PointerEvent): void {
        if (event.pointerType !== 'pen') return;
        this.suppressPenHoverUntil = Date.now() + Math.max(700, this.settings.hoverCloseDelayMs + 450);
        this.cancelPendingHoverLookup();
    }

    private shouldSuppressPenHover(event: PointerEvent): boolean {
        return event.pointerType === 'pen' && Date.now() < this.suppressPenHoverUntil;
    }

    private handleActivePopoverHover(event: PointerEvent): boolean {
        if (!this.isInsideActivePopover(event.target as Node | null)) return false;
        this.cancelPendingHoverLookup();
        this.cancelHoverClose();
        return !this.canHoverLookupActivePopoverWord(event);
    }

    private canHoverLookupActivePopoverWord(event: PointerEvent): boolean {
        if (!this.hasHoverLookupShortcut() || !this.shouldLookupOnHover(event)) return false;
        const word = this.hoverReaderWordForEvent(event);
        return Boolean(word && this.isInsideActivePopover(word));
    }

    private hoverReaderWordForEvent(event: PointerEvent): HTMLElement | null {
        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private handlePointerTextHover(event: PointerEvent): void {
        const hoverEnabled = this.shouldLookupOnHover(event);
        const candidate = hoverEnabled ? this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS) : null;
        if (candidate && this.refreshActivePointerTextHover(candidate, event)) return;
        this.cancelMissingPointerTextCandidate(candidate);
        this.scheduleInactiveHoverClose();
        if (!canSchedulePointerTextHoverLookup(hoverEnabled, candidate)) return;
        this.rememberHoverPopoverPointer(event);
        this.schedulePointerTextLookup(candidate, event);
    }

    private refreshActivePointerTextHover(candidate: PointerTextLookup, event: PointerEvent): boolean {
        if (!this.isActivePointerTextLookup(candidate)) return false;
        void event;
        this.cancelHoverClose();
        this.refreshActiveHoverAnchor(candidate.anchor);
        return true;
    }

    private cancelMissingPointerTextCandidate(candidate: PointerTextLookup | null): void {
        if (!candidate) this.cancelPendingHoverLookup();
    }

    private scheduleInactiveHoverClose(): void {
        if (this.activePopoverMode === 'hover' && !this.isHoverContextActive({ ignoreCssHover: true })) {
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        }
    }

    private handleReaderWordHover(word: HTMLElement, event: PointerEvent): void {
        this.rememberHoverPopoverPointer(event);
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.cancelHoverClose();
            this.refreshActiveHoverAnchor(word);
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        this.preloadHoverWordAudio(word);
        this.scheduleHoverLookup(word, event);
    }

    private handleHoverPointerOut(event: PointerEvent): void {
        if (this.isDestroyed || this.hasStickyModalPopover() || event.pointerType === 'touch' || this.shouldSuppressPenHover(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        const related = event.relatedTarget as Node | null;
        if (this.handleActivePopoverPointerOut(event, related)) return;
        this.handleReaderWordPointerOut(event, related);
    }

    private handleActivePopoverPointerOut(event: PointerEvent, related: Node | null): boolean {
        if (this.isInsideActivePopover(event.target as Node | null)) {
            if (this.isInsideActivePopover(related) || (this.activeHoverWord && this.isInsideNode(related, this.activeHoverWord))) return true;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
            return true;
        }
        return false;
    }

    private handleReaderWordPointerOut(event: PointerEvent, related: Node | null): void {
        const word = this.pointerOutReaderWord(event, related);
        if (!word) return;
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        this.cancelPendingHoverLookupForWord(word, hoverLookupKey);
        this.clearSuppressedHoverForWord(word, hoverLookupKey);
        this.handleActiveHoverWordPointerOut(word, related);
    }

    private pointerOutReaderWord(event: PointerEvent, related: Node | null): HTMLElement | null {
        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && !(related && word.contains(related)) ? word : null;
    }

    private cancelPendingHoverLookupForWord(word: HTMLElement, hoverLookupKey: string): void {
        if (this.hoverPendingWord === word || this.hoverPendingLookupKey === hoverLookupKey || this.hoverLookupInFlightKey === hoverLookupKey) {
            this.cancelPendingHoverLookup();
        }
    }

    private clearSuppressedHoverForWord(word: HTMLElement, hoverLookupKey: string): void {
        if (this.suppressedHoverWord === word) this.suppressedHoverWord = undefined;
        if (this.suppressedHoverLookupKey === hoverLookupKey) this.suppressedHoverLookupKey = '';
    }

    private handleActiveHoverWordPointerOut(word: HTMLElement, related: Node | null): void {
        if (this.activePopoverMode !== 'hover' || this.activeHoverWord !== word) return;
        if (this.isInsideActivePopover(related)) {
            this.cancelHoverClose();
            return;
        }
        this.scheduleHoverClose(undefined, { ignoreCssHover: true });
    }

    private scheduleHoverLookupAtPointer(event: KeyboardEvent): void {
        const pointer = this.activeHoverPointerPosition();
        if (!pointer) return;
        this.hoverPopoverPointerPosition = { ...pointer };
        this.scheduleHoverLookupForPointer(pointer, event);
    }

    private activeHoverPointerPosition(): { x: number; y: number } | null {
        return !this.isDestroyed && this.lastPointerPosition ? this.lastPointerPosition : null;
    }

    private scheduleHoverLookupForPointer(pointer: { x: number; y: number }, event: KeyboardEvent): void {
        const target = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null;
        const word = this.hoverReaderWordFromElement(target);
        if (word) {
            this.scheduleHoverLookup(word, event);
            return;
        }
        this.schedulePointerTextLookupForPointer(pointer, target, event);
    }

    private hoverReaderWordFromElement(element: HTMLElement | null): HTMLElement | null {
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private schedulePointerTextLookupForPointer(pointer: { x: number; y: number }, target: EventTarget | null, event: KeyboardEvent): void {
        const candidate = this.lookupCandidateFromPoint(pointer.x, pointer.y, target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS);
        if (candidate) this.schedulePointerTextLookup(candidate, event);
    }

    private dismissModalPopoverForOutsidePointer(event: PointerEvent): void {
        if (this.isDestroyed || this.activePopoverMode !== 'modal' || !this.activePopover) return;
        if (this.isInsideActivePopover(event.target as Node | null)) return;
        this.dismiss({ suppressHoverTarget: true });
    }

    private dismissHoverPopoverForOutsidePointer(event: PointerEvent): void {
        if (this.isDestroyed || this.activePopoverMode !== 'hover') return;
        const target = event.target as Node | null;
        if (!this.shouldDismissHoverForPointerTarget(target)) return;
        this.dismiss({ suppressHoverTarget: false });
    }

    private shouldDismissHoverForPointerTarget(target: Node | null): boolean {
        if (this.isInsideActivePopover(target)) return false;
        return !(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private rememberHoverPopoverPointer(event: MouseEvent): void {
        this.hoverPopoverPointerPosition = { x: event.clientX, y: event.clientY };
    }

    private nextHoverLookupGeneration(): number {
        this.hoverLookupGeneration++;
        return this.hoverLookupGeneration;
    }

    private cancelPendingHoverLookup(): void {
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        this.hoverLookupInFlightKey = '';
        this.nextHoverLookupGeneration();
    }

    private scheduleActivePopoverReposition(): void {
        if (this.activePopoverMode !== 'hover' || !this.activePopover || this.activePopover.classList.contains('jpdb-reader-sheet')) return;
        if (this.popoverRepositionFrame !== undefined) return;
        this.popoverRepositionFrame = window.requestAnimationFrame(() => {
            this.popoverRepositionFrame = undefined;
            this.repositionActivePopover();
        });
    }

    private scheduleHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent): void {
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.shouldSkipHoverLookupSchedule(word, hoverLookupKey)) return;

        this.preloadHoverWordAudio(word);
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = word;
        this.hoverPendingLookupKey = hoverLookupKey;
        this.installHoverLookupTimer(() => this.runScheduledHoverLookup(word, event, hoverLookupGeneration));
    }

    private shouldSkipHoverLookupSchedule(word: HTMLElement, hoverLookupKey: string): boolean {
        if (this.isSuppressedHoverLookup(word, hoverLookupKey)) return true;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return true;
        }
        return this.isSameActiveHoverWord(word)
            || this.isPendingHoverLookup(word, hoverLookupKey)
            || this.isInFlightHoverLookup(hoverLookupKey);
    }

    private isSuppressedHoverLookup(word: HTMLElement, hoverLookupKey: string): boolean {
        return this.suppressedHoverWord === word || Boolean(hoverLookupKey && this.suppressedHoverLookupKey === hoverLookupKey);
    }

    private isSameActiveHoverWord(word: HTMLElement): boolean {
        return this.activePopoverMode === 'hover' && this.activeHoverWord === word;
    }

    private isPendingHoverLookup(word: HTMLElement, hoverLookupKey: string): boolean {
        return Boolean((this.hoverPendingWord === word || (hoverLookupKey && this.hoverPendingLookupKey === hoverLookupKey)) && this.hoverLookupTimer);
    }

    private isInFlightHoverLookup(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && this.hoverLookupInFlightKey === hoverLookupKey);
    }

    private installHoverLookupTimer(runLookup: () => void): void {
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) runLookup();
        else this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private runScheduledHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent, hoverLookupGeneration: number): void {
        if (this.hoverLookupGeneration !== hoverLookupGeneration) return;
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        const activeWord = this.resolveScheduledHoverWord(word);
        if (!activeWord || !this.canRunScheduledHoverLookup(activeWord, event)) return;
        const activeHoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        if (activeHoverLookupKey) this.hoverLookupInFlightKey = activeHoverLookupKey;
        void this.showWord(activeWord, { trigger: 'hover', hoverLookupGeneration }).finally(() => {
            if (this.hoverLookupInFlightKey === activeHoverLookupKey) this.hoverLookupInFlightKey = '';
        });
    }

    private resolveScheduledHoverWord(word: HTMLElement): HTMLElement | null {
        if (word.isConnected) return word;
        return this.lastPointerPosition
            ? this.hoverWordFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) ?? null
            : null;
    }

    private hoverWordFromPoint(x: number, y: number): HTMLElement | null {
        for (const element of document.elementsFromPoint(x, y)) {
            const word = this.hoverReaderWordFromElement(element as HTMLElement);
            if (word) return word;
        }
        return null;
    }

    private canRunScheduledHoverLookup(activeWord: HTMLElement, event: MouseEvent | KeyboardEvent): boolean {
        const hoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        if (!this.isRunnableScheduledHoverWord(activeWord, hoverLookupKey)) return false;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(activeWord);
            return false;
        }
        if (!this.canOpenHoverLookupForWord(activeWord, event)) return false;
        if (shouldPauseVideoForSubtitleHover(activeWord, this.settings)) pauseActiveVideo();
        return true;
    }

    private isRunnableScheduledHoverWord(activeWord: HTMLElement, hoverLookupKey: string): boolean {
        return activeWord.isConnected && !this.isSuppressedHoverLookup(activeWord, hoverLookupKey);
    }

    private canOpenHoverLookupForWord(activeWord: HTMLElement, event: MouseEvent | KeyboardEvent): boolean {
        return this.isWordHoverActive(activeWord)
            && this.settings.lookupOnHover
            && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private schedulePointerTextLookup(candidate: PointerTextLookup, event: MouseEvent | KeyboardEvent): void {
        if (this.isActivePointerTextLookup(candidate)) {
            this.refreshActiveHoverAnchor(candidate.anchor);
            return;
        }
        const hoverLookupKey = this.pendingPointerTextLookupKey(candidate);
        if (this.isPointerTextLookupAlreadyQueued(hoverLookupKey)) return;
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = hoverLookupKey;
        const runLookup = () => {
            if (this.hoverLookupGeneration !== hoverLookupGeneration) return;
            this.hoverLookupTimer = undefined;
            this.hoverPendingLookupKey = '';
            if (!candidate.anchor.isConnected || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys)) return;
            if (!this.isCurrentPointerTextHoverCandidate(candidate)) return;
            if (hoverLookupKey) this.hoverLookupInFlightKey = hoverLookupKey;
            void this.showLookupCandidate(candidate, 'hover', { hoverLookupGeneration }).finally(() => {
                if (this.hoverLookupInFlightKey === hoverLookupKey) this.hoverLookupInFlightKey = '';
            });
        };
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) {
            runLookup();
            return;
        }
        this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private isPointerTextLookupAlreadyQueued(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && (
            (this.hoverPendingLookupKey === hoverLookupKey && this.hoverLookupTimer)
            || this.hoverLookupInFlightKey === hoverLookupKey
        ));
    }

    private cancelHoverClose(): void {
        window.clearTimeout(this.hoverCloseTimer);
        this.hoverCloseTimer = undefined;
    }

    private scheduleHoverClose(delay = this.settings.hoverCloseDelayMs, options: { ignoreCssHover?: boolean } = {}): void {
        if (this.activePopoverMode !== 'hover') return;
        this.cancelHoverClose();
        this.hoverCloseTimer = window.setTimeout(() => {
            this.hoverCloseTimer = undefined;
            if (this.isHoverContextActive(options)) return;
            this.dismiss({ suppressHoverTarget: false });
        }, Math.max(0, delay));
    }

    private isHoverContextActive(options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        if (this.activePointerTextLookup) return this.isPointerTextHoverContextActive(options);
        if (this.activeHoverWord && this.isWordHoverActive(this.activeHoverWord, options)) return true;
        if (this.isPopoverCssHoverActive(options)) return true;
        const target = this.currentHoverPointerTarget(options);
        return target ? this.isInsideActiveHoverContext(target) : false;
    }

    private isPointerTextHoverContextActive(options: { ignoreCssHover?: boolean }): boolean {
        if (this.isPopoverCssHoverActive(options)) return true;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        const current = this.lookupCandidateFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y, target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS);
        const active = this.activePointerTextLookup;
        return Boolean(active
            && current
            && samePointerTextLookupTarget(active, current)
            && pointerOffsetInsideLiveLookup(active, current.offset));
    }

    private isPopoverCssHoverActive(options: { ignoreCssHover?: boolean }): boolean {
        return !options.ignoreCssHover && Boolean(this.activePopover?.matches(':hover'));
    }

    private currentHoverPointerTarget(options: { ignorePointerPosition?: boolean }): Element | null {
        if (options.ignorePointerPosition || !this.lastPointerPosition) return null;
        return document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
    }

    private isInsideActiveHoverContext(target: Element): boolean {
        return this.isInsideActivePopover(target)
            || Boolean(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private isWordHoverActive(word: HTMLElement, options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        if (!options.ignoreCssHover && word.matches(':hover')) return true;
        if (options.ignorePointerPosition) return false;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideNode(target, word);
    }

    private hoverLookupKeyForWord(word: HTMLElement): string {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        if (!Number.isFinite(vid) || !Number.isFinite(sid)) return '';
        return `word:${vid}:${sid}:${word.dataset.sentence ?? ''}`;
    }

    private pendingPointerTextLookupKey(candidate: PointerTextLookup): string {
        return `text-pending:${this.hoverAnchorId(candidate.anchor)}:${candidate.start}:${candidate.end}:${candidate.text.length}`;
    }

    private activePointerTextLookupKey(candidate: PointerTextLookup, start: number, end: number, card: JPDBCard): string {
        return `text:${this.hoverAnchorId(candidate.anchor)}:${start}:${end}:${cardKey(card)}`;
    }

    private hoverAnchorId(anchor: HTMLElement): number {
        const existing = this.hoverAnchorIds.get(anchor);
        if (existing) return existing;
        const next = this.nextHoverAnchorId++;
        this.hoverAnchorIds.set(anchor, next);
        return next;
    }

    private isActiveHoverLookup(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && this.activePopover && this.activePopoverMode === 'hover' && this.activeHoverLookupKey === hoverLookupKey);
    }

    private isActivePointerTextLookup(candidate: PointerTextLookup): boolean {
        const active = this.activePointerTextLookup;
        if (!active || !this.hasActiveHoverPopover()) return false;
        if (!samePointerTextLookupTarget(active, candidate)) return false;
        return pointerOffsetInsideLiveLookup(active, candidate.offset);
    }

    private isCurrentPointerTextHoverCandidate(candidate: PointerTextLookup): boolean {
        if (!this.lastPointerPosition) return false;
        const current = this.lookupCandidateFromPoint(
            this.lastPointerPosition.x,
            this.lastPointerPosition.y,
            document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y),
            HOVER_POINTER_TEXT_LOOKUP_OPTIONS,
        );
        return Boolean(current
            && samePointerTextLookupTarget({ anchor: candidate.anchor, text: candidate.text, start: candidate.start, end: candidate.end }, current)
            && pointerOffsetInsideLiveLookup({ anchor: candidate.anchor, text: candidate.text, start: candidate.start, end: candidate.end }, current.offset));
    }

    private hasActiveHoverPopover(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.activePopover);
    }

    private refreshActiveHoverAnchor(anchor: HTMLElement): void {
        if (!this.canRefreshActiveHoverAnchor(anchor)) return;
        if (this.activePopoverAnchor === anchor && (this.activePointerTextLookup || this.activeHoverWord === anchor)) return;
        this.activePopoverAnchor = anchor;
        if (!this.activePointerTextLookup) this.activeHoverWord = anchor;
        this.captureActiveHoverAnchorRect(anchor);
        this.repositionActivePopover();
    }

    private canRefreshActiveHoverAnchor(anchor: HTMLElement): boolean {
        return Boolean(this.activePopover && this.activePopoverMode === 'hover' && anchor.isConnected);
    }

    private captureActiveHoverAnchorRect(anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
    }

    private isInsideActivePopover(node: Node | null): boolean {
        return Boolean(this.activePopover && this.isInsideNode(node, this.activePopover));
    }

    private isInsideNode(node: Node | null, root: Node): boolean {
        return Boolean(node && (node === root || root.contains(node)));
    }

    private hasOpenReaderDialog(): boolean {
        return Boolean(this.activePopover || this.activeBackdrop || document.querySelector('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop'));
    }

    private async parseJapanese(paragraphs: string[], options?: ReaderParserParseOptions): Promise<JPDBToken[][]> {
        return this.parser.parse(paragraphs, options);
    }

    private canParseJapanese(): boolean {
        return this.parser.canParse();
    }

    private getCachedCard(vid: number, sid: number): JPDBCard | undefined {
        return this.parser.getCachedCard(vid, sid);
    }

    private isJpdbBackedCard(card: JPDBCard): boolean {
        return this.parser.isJpdbBackedCard(card);
    }

    private async lookupSelection(): Promise<void> {
        if (this.isDestroyed) return;
        if (Date.now() < this.suppressSelectionLookupUntil) return;
        const selected = this.selectionLookupText();
        if (!selected) return;
        await this.lookupText(selected, getSelectionSentence());
    }

    private selectionLookupText(): string {
        const selected = getSelectionText();
        if (selected.length < 1) return '';
        if (selected.length > 120) return '';
        if (!HAS_JAPANESE.test(selected)) return '';
        if ((document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) return '';
        return selected;
    }

    private async lookupText(text: string, sentence = text, options: TextLookupOptions = {}): Promise<void> {
        const context = this.textLookupDisplayContext(text, options);
        if (!context) return;
        const done = log.time('lookupText', { length: context.selected.length, trigger: context.trigger });
        try {
            const [tokens] = await this.parseJapanese([sentence], jpdbFirstParseOptions());
            await this.showTextLookupResult(context, tokens, sentence);
        } catch (error) {
            log.warn('Lookup failed; trying local fallback', { selected: context.selected }, error);
            await this.showLocalOrFallbackLookupCard(context, sentence, error);
        } finally {
            done();
        }
    }

    private textLookupDisplayContext(text: string, options: TextLookupOptions): TextLookupDisplayContext | null {
        const selected = normalizedLookupText(text);
        if (!isLookupableJapaneseText(selected)) return null;
        const trigger = options.trigger ?? this.activeTextLookupTrigger();
        const navigation = options.navigation ?? 'reset';
        return this.createTextLookupDisplayContext(selected, trigger, navigation, options);
    }

    private createTextLookupDisplayContext(
        selected: string,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
        options: TextLookupOptions,
    ): TextLookupDisplayContext {
        return {
            selected,
            anchor: options.anchor ?? connectedElement(this.activePopoverAnchor),
            trigger,
            navigation,
            preservePosition: this.textLookupPreservePosition(navigation, options),
            previousNavigationEntry: this.textLookupPreviousNavigationEntryForOptions(trigger, navigation, options),
            insideReaderPopup: options.insideReaderPopup,
            userGesture: options.userGesture,
            hoverLookupGeneration: options.hoverLookupGeneration,
            stackOverSettings: options.stackOverSettings,
        };
    }

    private textLookupPreservePosition(navigation: CardNavigationMode, options: TextLookupOptions): boolean {
        return options.preservePosition ?? this.shouldPreserveLookupPosition(navigation);
    }

    private textLookupPreviousNavigationEntryForOptions(
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
        options: TextLookupOptions,
    ): PopupNavigationEntry | undefined {
        return options.previousNavigationEntry ?? this.textLookupPreviousNavigationEntry(trigger, navigation);
    }

    private activeTextLookupTrigger(): 'modal' | 'hover' {
        return this.activePopoverMode === 'hover' ? 'hover' : 'modal';
    }

    private shouldPreserveLookupPosition(navigation: CardNavigationMode): boolean {
        return navigation !== 'reset' && Boolean(this.activePopover);
    }

    private textLookupPreviousNavigationEntry(trigger: 'modal' | 'hover', navigation: CardNavigationMode): PopupNavigationEntry | undefined {
        return trigger === 'modal' && navigation === 'push-current'
            ? this.activePopoverNavigationEntry()
            : undefined;
    }

    private async showTextLookupResult(context: TextLookupDisplayContext, tokens: JPDBToken[], sentence: string): Promise<void> {
        const parsedTokens = this.jpdbBackedTokens(tokens);
        const relevantTokens = tokensOverlappingSelection(parsedTokens, context.selected, sentence);
        const selectedToken = pickTokenForSelection(relevantTokens, context.selected);
        if (selectedToken) {
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        if (relevantTokens.length) {
            this.showTokenList(relevantTokens, context.selected, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        if (sentence !== context.selected && await this.showSelectedTextParsedLookupResult(context)) return;
        await this.showLocalOrFallbackLookupCard(context, sentence);
    }

    private async showSelectedTextParsedLookupResult(context: TextLookupDisplayContext): Promise<boolean> {
        const [tokens] = await this.parseJapanese([context.selected], jpdbFirstParseOptions());
        const parsedTokens = this.jpdbBackedTokens(tokens);
        const selectedToken = pickTokenForSelection(parsedTokens, context.selected);
        if (selectedToken) {
            void this.showCard(selectedToken.card, selectedToken.sentence ?? context.selected, context.anchor, this.textLookupCardOptions(context));
            return true;
        }
        if (parsedTokens.length) {
            this.showTokenList(parsedTokens, context.selected, context.anchor, this.textLookupCardOptions(context));
            return true;
        }
        return false;
    }

    private jpdbBackedTokens(tokens: JPDBToken[] = []): JPDBToken[] {
        return tokens.filter(token => this.isJpdbBackedCard(token.card));
    }

    private async resolveLookupCard(card: JPDBCard): Promise<JPDBCard> {
        if (card.source !== 'fallback') return card;
        const publicCard = await this.publicLookupCard(card.spelling, true);
        if (!publicCard) return card;
        this.parser.cacheCards([publicCard]);
        return publicCard;
    }

    private async resolveLookupCardForInitialRender(card: JPDBCard): Promise<JPDBCard> {
        if (card.source !== 'fallback') return card;

        const resolved = this.resolveLookupCard(card);
        void resolved.catch(() => undefined);
        return Promise.race([
            resolved,
            wait(FALLBACK_LOOKUP_INITIAL_WAIT_MS).then(() => card),
        ]);
    }

    private async publicLookupCard(term: string, exact = false): Promise<JPDBCard | undefined> {
        if (!this.settings.jpdbDefinitionsEnabled && !this.settings.showPitchAccent) return undefined;
        const cards = await this.jpdbVocabulary.search(term, 1).catch(error => {
            log.warn('Public JPDB search failed while resolving lookup card', { term }, error);
            return [];
        });
        return cards.find(card => card.spelling === term || card.reading === term) ?? (exact ? undefined : cards[0]);
    }

    private async showLocalLookupCard(context: TextLookupDisplayContext, sentence: string): Promise<boolean> {
        const localEntries = await this.localLookupEntries(context.selected);
        if (!localEntries.length) return false;
        void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, context.anchor, this.textLookupCardOptions(context));
        return true;
    }

    private async showLocalOrFallbackLookupCard(context: TextLookupDisplayContext, sentence: string, error?: unknown): Promise<void> {
        if (await this.showLocalLookupCard(context, sentence)) return;
        if (error) this.toast(error instanceof Error ? error.message : uiText(this.settings.interfaceLanguage, 'jpdbLookupFailed'));
        void this.showCard(this.parser.fallbackCardFromText(context.selected), sentence, context.anchor, this.textLookupCardOptions(context));
    }

    private async localLookupEntries(selected: string): Promise<YomitanTermEntry[]> {
        return this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
    }

    private textLookupCardOptions(context: TextLookupDisplayContext): Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry' | 'insideReaderPopup' | 'userGesture' | 'hoverLookupGeneration' | 'stackOverSettings'> {
        return {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: context.preservePosition,
            previousNavigationEntry: context.previousNavigationEntry,
            insideReaderPopup: context.insideReaderPopup,
            userGesture: context.userGesture,
            hoverLookupGeneration: context.hoverLookupGeneration,
            stackOverSettings: context.stackOverSettings,
        };
    }

    private handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        const link = dictionaryLookupLink(event.target);
        if (!link) return false;
        const query = dictionaryLookupQuery(link);
        if (!query) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.lookupDictionaryReference(query, link.dataset.dictionaryReading ?? '', link.dataset.dictionary ?? '', anchor, trigger, this.isInsideActivePopover(event.target as Node | null));
        return true;
    }

    private async lookupDictionaryReference(
        query: string,
        reading: string,
        sourceDictionary: string,
        anchor: HTMLElement | undefined,
        trigger: 'modal' | 'hover',
        preservePosition = false,
    ): Promise<void> {
        if (!HAS_JAPANESE.test(query)) return;
        const normalizedReading = reading.replace(/\s+/g, ' ').trim();
        const navigation: CardNavigationMode = trigger === 'modal' ? 'push-current' : 'reset';
        const done = log.time('dictionaryReferenceLookup', { query, hasReading: Boolean(normalizedReading), sourceDictionary, trigger });
        try {
            const localEntries = await this.dictionaryReferenceLocalEntries(query, normalizedReading, sourceDictionary);
            const preferredEntry = localEntries.find(entry => entry.dictionary === sourceDictionary) ?? localEntries[0];
            const previousNavigationEntry = this.textLookupPreviousNavigationEntry(trigger, navigation);
            if (preferredEntry) {
                await this.showCard(this.parser.localCardFromEntry(preferredEntry), query, anchor, { autoPlay: false, trigger, navigation, preservePosition, previousNavigationEntry });
                return;
            }
            await this.lookupText(query, query, { navigation, preservePosition, previousNavigationEntry });
        } finally {
            done();
        }
    }

    private async dictionaryReferenceLocalEntries(query: string, reading: string, sourceDictionary: string): Promise<YomitanTermEntry[]> {
        if (!this.settings.localDictionariesEnabled) return [];
        return await this.dictionaries.lookup(query, reading || query, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
            log.warn('Dictionary reference local lookup failed', { query, reading, sourceDictionary }, error);
            return [];
        });
    }

    private lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null, options: PointerTextLookupOptions = {}): PointerTextLookup | null {
        const element = this.pointerLookupElement(x, y, eventTarget, options);
        if (!element) return null;
        const position = this.usablePointerTextPosition(element, x, y);
        if (!position) return null;
        const characterOffset = pointerTextCharacterOffset(position.node, position.offset, x, y);
        if (characterOffset === null) return null;
        return this.lookupCandidateFromTextPosition(position.node, characterOffset);
    }

    private pointerLookupElement(x: number, y: number, eventTarget: EventTarget | null, options: PointerTextLookupOptions = {}): Element | null {
        const element = eventTarget instanceof Element ? eventTarget : document.elementFromPoint(x, y);
        return element && !this.isNativeTextLookupTarget(element, options) && !this.isNativePageLookupBlocked(element) ? element : null;
    }

    private usablePointerTextPosition(element: Element, x: number, y: number): NonNullable<ReturnType<typeof caretTextPositionFromPoint>> | null {
        const position = caretTextPositionFromPoint(x, y);
        return this.isUsablePointerTextPosition(element, position) ? position : null;
    }

    private lookupCandidateFromTextPosition(node: Text, characterOffset: number): PointerTextLookup | null {
        const run = japaneseRunAt(node.data, characterOffset);
        if (!run || isLowValuePointerText(node.data, node.parentElement)) return null;
        return this.pointerTextLookupFromRun(node, run);
    }

    private isUsablePointerTextPosition(element: Element, position: ReturnType<typeof caretTextPositionFromPoint>): position is NonNullable<ReturnType<typeof caretTextPositionFromPoint>> {
        return Boolean(position
            && position.node.parentElement
            && (element.contains(position.node) || position.node.parentElement.contains(element))
            && !position.node.parentElement.closest('.jpdb-reader-word'));
    }

    private pointerTextLookupFromRun(node: Text, run: NonNullable<ReturnType<typeof japaneseRunAt>>): PointerTextLookup {
        return {
            text: node.data,
            offset: run.offset,
            start: run.start,
            end: run.end,
            anchor: node.parentElement as HTMLElement,
        };
    }

    private isNativeTextLookupTarget(target: Element, options: PointerTextLookupOptions = {}): boolean {
        return (!options.allowPassiveInteractionText && isPassiveInteractionElement(target))
            || this.isReaderImmersionExampleSentenceText(target)
            || Boolean(target.closest('input,textarea,select,[contenteditable="true"],.jpdb-reader-word'));
    }

    private isReaderImmersionExampleSentenceText(target: Element): boolean {
        return Boolean(target.closest('[data-jpdb-reader-root] [data-immersion-kit] .jpdb-reader-example-sentence'));
    }

    private isNativePageLookupBlocked(target: Element | null): boolean {
        return Boolean(isJpdbHost()
            && target
            && !target.closest('[data-jpdb-reader-root]')
            && target.closest(NATIVE_PAGE_LOOKUP_BLOCK_SELECTOR));
    }

    private async showLookupCandidate(candidate: PointerTextLookup, trigger: 'modal' | 'hover', options: { navigation?: CardNavigationMode; preservePosition?: boolean; hoverLookupGeneration?: number; userGesture?: boolean } = {}): Promise<void> {
        const sentence = lookupCandidateSentence(candidate.text, candidate.start, candidate.end);
        if (!sentence) return;
        const done = log.time('lookupTextAtPointer', { length: sentence.length, offset: candidate.offset, trigger });
        try {
            await this.showFirstPointerTextCandidate(candidate, sentence, trigger, options);
        } catch {
        } finally {
            done();
        }
    }

    private async showFirstPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<void> {
        if (await this.showParsedPointerTextCandidate(candidate, sentence, trigger, options)) return;
        if (await this.showLocalPointerTextCandidate(candidate, sentence, trigger, options)) return;
        if (await this.showFallbackPointerTextCandidate(candidate, sentence, trigger, options)) return;
    }

    private async showParsedPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        try {
            const [tokens] = await this.parseJapanese([candidate.text], jpdbFirstParseOptions());
            const token = pointerTokenAtOffset(tokens ?? [], candidate.offset);
            if (!token || this.shouldSkipPointerTextToken(candidate, token)) return false;
            if (!this.isJpdbBackedCard(token.card)) return false;
            await this.showPointerTextCard(token.card, sentence, candidate, { start: token.start, end: token.end }, trigger, options);
            return true;
        } catch (error) {
            log.warn('Pointer text parse failed; trying local fallback', { offset: candidate.offset }, error);
            return false;
        }
    }

    private shouldSkipPointerTextToken(candidate: PointerTextLookup, token: JPDBToken): boolean {
        return isLowValuePointerTextToken(token)
            && candidate.end - candidate.start > token.end - token.start;
    }

    private async showLocalPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const localMatch = await this.lookupLocalEntryAtOffset(candidate.text, candidate.offset);
        if (!localMatch || this.isWeakPointerLocalMatch(candidate, localMatch)) return false;
        const card = this.parser.localCardFromEntry(localMatch.entry);
        await this.showPointerTextCard(card, sentence, candidate, localMatch, trigger, options);
        return true;
    }

    private async showFallbackPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const fallbackRange = fallbackLookupRangeAtOffset(candidate.text, candidate.offset) ?? candidate;
        const fallbackTerm = fallbackLookupTermAtOffset(candidate.text, candidate.offset);
        if (!fallbackTerm || this.isWeakPointerFallbackTerm(candidate, fallbackTerm)) return false;
        const card = this.parser.fallbackCardFromText(fallbackTerm);
        await this.showPointerTextCard(card, sentence, candidate, fallbackRange, trigger, options);
        return true;
    }

    private async showPointerTextCard(
        card: JPDBCard,
        sentence: string,
        candidate: PointerTextLookup,
        range: { start: number; end: number },
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<void> {
        if (trigger === 'hover' && !this.isCurrentPointerTextHoverResult(candidate, range, options.hoverLookupGeneration)) return;
        const navigation = options.navigation ?? 'reset';
        const pointerTextLookup = { anchor: candidate.anchor, text: candidate.text, start: range.start, end: range.end };
        const cardSentence = lookupCandidateSentence(candidate.text, range.start, range.end) || sentence;
        await this.showCard(card, cardSentence, candidate.anchor, {
            trigger,
            navigation,
            preservePosition: options.preservePosition,
            previousNavigationEntry: this.textLookupPreviousNavigationEntry(trigger, navigation),
            hoverLookupKey: trigger === 'hover' ? this.activePointerTextLookupKey(candidate, range.start, range.end, card) : undefined,
            hoverLookupGeneration: options.hoverLookupGeneration,
            pointerTextLookup: trigger === 'hover' ? pointerTextLookup : undefined,
            userGesture: options.userGesture,
        });
    }

    private async lookupLocalEntryAtOffset(text: string, offset: number): Promise<LocalPointerTextEntryMatch | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const run = japaneseRunAt(text, offset);
        if (!run) return undefined;
        const pointerRange = fallbackLookupRangeAtOffset(text, run.offset) ?? { start: run.start, end: run.end };

        return await this.lookupLocalEntryInRun(text, run, pointerRange);
    }

    private isCurrentRenderedWordHover(word: HTMLElement, hoverLookupKey: string, hoverLookupGeneration?: number): boolean {
        if (!this.isCurrentHoverGeneration(hoverLookupGeneration, hoverLookupKey)) return false;
        return this.isRunnableScheduledHoverWord(word, hoverLookupKey)
            && this.isWordHoverActive(word)
            && this.settings.lookupOnHover;
    }

    private isCurrentPointerTextHoverResult(
        candidate: PointerTextLookup,
        range: { start: number; end: number },
        hoverLookupGeneration?: number,
    ): boolean {
        const hoverLookupKey = `text-result:${this.hoverAnchorId(candidate.anchor)}:${range.start}:${range.end}`;
        if (!this.isCurrentHoverGeneration(hoverLookupGeneration, hoverLookupKey)) return false;
        return this.isCurrentPointerTextHoverCandidate({ ...candidate, start: range.start, end: range.end });
    }

    private isCurrentHoverGeneration(hoverLookupGeneration: number | undefined, hoverLookupKey: string): boolean {
        if (hoverLookupGeneration === undefined) return true;
        if (this.hoverLookupGeneration === hoverLookupGeneration) return true;
        return this.isActiveHoverLookup(hoverLookupKey)
            && !this.hasPendingDifferentHoverLookup(hoverLookupKey)
            && this.isHoverContextActive();
    }

    private hasPendingDifferentHoverLookup(hoverLookupKey: string): boolean {
        return Boolean((this.hoverPendingLookupKey && this.hoverPendingLookupKey !== hoverLookupKey)
            || (this.hoverLookupInFlightKey && this.hoverLookupInFlightKey !== hoverLookupKey));
    }

    private async lookupLocalEntryInRun(
        text: string,
        run: NonNullable<ReturnType<typeof japaneseRunAt>>,
        pointerRange: { start: number; end: number },
    ): Promise<LocalPointerTextEntryMatch | undefined> {
        const exactSurface = text.slice(pointerRange.start, pointerRange.end);
        const exactEntry = await this.lookupSingleLocalSurface(exactSurface);
        if (exactEntry) return { entry: exactEntry, start: pointerRange.start, end: pointerRange.end };

        return await this.lookupForwardLocalEntryInRun(text, run, pointerRange.end);
    }

    private async lookupForwardLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>, targetEnd: number): Promise<LocalPointerTextEntryMatch | undefined> {
        const maxEnd = Math.min(run.end, targetEnd, run.offset + 18);
        for (let end = maxEnd; end > run.offset; end--) {
            const surface = text.slice(run.offset, end);
            const entry = await this.lookupSingleLocalSurface(surface);
            if (entry) return { entry, start: run.offset, end };
        }
        return undefined;
    }

    private async lookupSingleLocalSurface(surface: string): Promise<YomitanTermEntry | undefined> {
        return (await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []))[0];
    }

    private isWeakPointerLocalMatch(candidate: PointerTextLookup, match: LocalPointerTextEntryMatch): boolean {
        return this.isWeakPointerTextRange(candidate, match.start, match.end);
    }

    private isWeakPointerFallbackTerm(candidate: PointerTextLookup, term: string): boolean {
        return term.length <= 1 && candidate.end - candidate.start > 1;
    }

    private isWeakPointerTextRange(candidate: PointerTextLookup, start: number, end: number): boolean {
        return end - start <= 1 && candidate.end - candidate.start > 1;
    }

    private async showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; hoverLookupGeneration?: number; previousNavigationEntry?: PopupNavigationEntry; userGesture?: boolean; stackOverSettings?: boolean } = {}): Promise<void> {
        if (options.trigger === 'click' && this.shouldIgnoreCurrentImmersionExampleTargetClick(word)) return;
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        const stackOverSettings = options.stackOverSettings || Boolean(word.closest('.jpdb-reader-settings'));
        const card = this.cardForRenderedWord(word);
        if (!card) {
            await this.handleMissingRenderedWordCard(word, { ...options, stackOverSettings }, insideReaderPopup);
            return;
        }
        this.rememberRenderedWordMiningContext(word, card, insideReaderPopup);
        const context = this.renderedWordDisplayContext(word, options, insideReaderPopup);
        if (context.hoverLookupKey && this.isActiveHoverLookup(context.hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return;
        }
        if (context.trigger === 'hover' && !this.isCurrentRenderedWordHover(word, context.hoverLookupKey ?? '', options.hoverLookupGeneration)) return;
        this.preloadHoverWordAudio(word);
        await this.showCard(card, context.sentence, context.anchor, {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: context.insideReaderPopup && context.trigger === 'modal',
            previousNavigationEntry: context.previousNavigationEntry,
            hoverLookupKey: context.hoverLookupKey,
            hoverLookupGeneration: options.hoverLookupGeneration,
            insideReaderPopup: context.insideReaderPopup,
            userGesture: options.userGesture,
            stackOverSettings,
        });
    }

    private cardForRenderedWord(word: HTMLElement): JPDBCard | undefined {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.getCachedCard(vid, sid);
        return card && this.renderedWordCacheMatches(word, card) ? card : undefined;
    }

    private renderedWordLookupText(word: HTMLElement): string {
        return normalizedLookupText(word.dataset.expression || readerWordSurfaceText(word));
    }

    private renderedWordCacheMatches(word: HTMLElement, card: JPDBCard): boolean {
        const expression = normalizedLookupText(word.dataset.expression ?? '');
        const reading = normalizedLookupText(word.dataset.reading ?? '');
        if (expression && !this.cardMatchesRenderedLookupValue(card, expression)) return false;
        if (reading && !this.cardMatchesRenderedLookupValue(card, reading)) return false;
        return true;
    }

    private cardMatchesRenderedLookupValue(card: JPDBCard, value: string): boolean {
        return normalizedLookupText(card.spelling) === value || normalizedLookupText(card.reading) === value;
    }

    private async handleMissingRenderedWordCard(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry; userGesture?: boolean; hoverLookupGeneration?: number; stackOverSettings?: boolean },
        insideReaderPopup: boolean,
    ): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        if (insideReaderPopup && await this.lookupUncachedPopupWord(word, options)) return;
        if (!insideReaderPopup && await this.lookupUncachedPageWord(word, options)) return;
        if (options.stackOverSettings) return;
        log.warn('Clicked word missing from cache; scheduling page reparse', { vid, sid });
        this.scheduleVisiblePageReparse();
    }

    private async lookupUncachedPageWord(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry; userGesture?: boolean; hoverLookupGeneration?: number; stackOverSettings?: boolean },
    ): Promise<boolean> {
        const expression = this.renderedWordLookupText(word);
        if (!isLookupableJapaneseText(expression)) return false;
        const trigger = this.renderedWordTrigger(options.trigger, false);
        const navigation = options.navigation ?? renderedWordNavigationMode(false, trigger);
        await this.lookupText(expression, this.renderedWordSentence(word) ?? expression, {
            anchor: renderedWordAnchor(word, false, this.activePopoverAnchor),
            navigation,
            preservePosition: trigger === 'hover',
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, false, trigger, navigation),
            userGesture: options.userGesture,
            trigger,
            hoverLookupGeneration: options.hoverLookupGeneration,
            stackOverSettings: options.stackOverSettings,
        });
        return true;
    }

    private async lookupUncachedPopupWord(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry; userGesture?: boolean; hoverLookupGeneration?: number; stackOverSettings?: boolean },
    ): Promise<boolean> {
        const expression = this.renderedWordLookupText(word);
        if (!isLookupableJapaneseText(expression)) return false;
        const trigger = this.renderedWordTrigger(options.trigger, true);
        const navigation = options.navigation ?? renderedWordNavigationMode(true, trigger);
        const sentence = this.renderedWordSentence(word) ?? expression;
        if (word.closest('.jpdb-reader-example-card')) this.immersionPopover.rememberTermMiningContext(expression, sentence, word);
        await this.lookupText(expression, sentence, {
            anchor: renderedWordAnchor(word, true, this.activePopoverAnchor),
            navigation,
            preservePosition: true,
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, true, trigger, navigation),
            insideReaderPopup: true,
            userGesture: options.userGesture,
            trigger,
            hoverLookupGeneration: options.hoverLookupGeneration,
        });
        return true;
    }

    private rememberRenderedWordMiningContext(word: HTMLElement, card: JPDBCard, insideReaderPopup: boolean): void {
        if (!insideReaderPopup || !word.closest('.jpdb-reader-example-card')) return;
        this.immersionPopover.rememberPageMiningContext(card, this.renderedWordSentence(word), word);
    }

    private renderedWordDisplayContext(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
        insideReaderPopup: boolean,
    ): RenderedWordDisplayContext {
        const trigger = this.renderedWordTrigger(options.trigger, insideReaderPopup);
        const navigation = options.navigation ?? renderedWordNavigationMode(insideReaderPopup, trigger);
        return {
            sentence: this.renderedWordSentence(word),
            anchor: renderedWordAnchor(word, insideReaderPopup, this.activePopoverAnchor),
            trigger,
            navigation,
            hoverLookupKey: this.renderedWordHoverLookupKey(word, trigger),
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, insideReaderPopup, trigger, navigation),
            insideReaderPopup,
        };
    }

    private renderedWordSentence(word: HTMLElement): string | undefined {
        const immersionSentence = this.renderedImmersionExampleSentence(word);
        if (immersionSentence) return immersionSentence;
        const tokenSentence = word.dataset.sentence || '';
        if (tokenSentence && word.closest('.jpdb-reader-example-sentence')) return normalizedLookupText(tokenSentence);
        return preferredRenderedWordSentence(
            nearestReadableSentenceForElement(word, tokenSentence),
            tokenSentence,
        );
    }

    private renderedImmersionExampleSentence(word: HTMLElement): string {
        if (!word.closest('.jpdb-reader-example-sentence')) return '';
        const sentence = word.closest<HTMLElement>('[data-immersion-sentence]')?.dataset.immersionSentence ?? '';
        return normalizedLookupText(sentence);
    }

    private shouldIgnoreCurrentImmersionExampleTargetClick(word: HTMLElement): boolean {
        if (!this.lastCard || !this.isInsideActivePopover(word)) return false;
        if (!word.closest('[data-immersion-kit] .jpdb-reader-example-sentence')) return false;
        if (!word.closest('.jpdb-reader-example-target')) return false;
        return this.cardMatchesRenderedLookupValue(this.lastCard, this.renderedWordLookupText(word));
    }

    private renderedWordHoverLookupKey(word: HTMLElement, trigger: 'modal' | 'hover'): string | undefined {
        return trigger === 'hover' ? this.hoverLookupKeyForWord(word) : undefined;
    }

    private renderedWordPreviousNavigationEntryForOptions(
        options: { previousNavigationEntry?: PopupNavigationEntry },
        insideReaderPopup: boolean,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): PopupNavigationEntry | undefined {
        return options.previousNavigationEntry ?? this.renderedWordPreviousNavigationEntry(insideReaderPopup, trigger, navigation);
    }

    private renderedWordTrigger(trigger: 'click' | 'hover' | undefined, insideReaderPopup: boolean): 'modal' | 'hover' {
        if (insideReaderPopup && trigger === 'click') return 'modal';
        if (insideReaderPopup && this.activePopoverMode) return this.activePopoverMode;
        return trigger === 'hover' ? 'hover' : 'modal';
    }

    private renderedWordPreviousNavigationEntry(
        insideReaderPopup: boolean,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): PopupNavigationEntry | undefined {
        return insideReaderPopup && trigger === 'modal' && navigation === 'push-current'
            ? this.activePopoverNavigationEntry()
            : undefined;
    }

    private activePopoverNavigationEntry(): PopupNavigationEntry | undefined {
        const activeKanji = this.navigation.activeKanjiEntry();
        if (activeKanji) return activeKanji;
        if (!this.activePopover?.isConnected || !this.lastCard) return undefined;
        return { kind: 'word', card: this.lastCard, sentence: this.lastCardSentence };
    }

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options: Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry' | 'stackOverSettings'> = {}): void {
        if (!tokens.length) return;
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        this.prepareTokenListNavigation(trigger, navigation);
        const popover = this.createPopover();
        setInnerHtml(popover, this.renderTokenListHtml(tokens, selected));
        this.installTokenListHandlers(popover, tokens, anchor, { trigger, navigation, previousNavigationEntry: options.previousNavigationEntry, stackOverSettings: options.stackOverSettings });
        this.mountPopover(popover, anchor, { mode: trigger, preservePosition: options.preservePosition, stackOverSettings: options.stackOverSettings });
        void this.parsePopoverJapanese(popover);
    }

    private prepareTokenListNavigation(trigger: 'modal' | 'hover', navigation: CardNavigationMode): void {
        if (trigger === 'modal' && navigation === 'reset') this.navigation.clearWord();
    }

    private renderTokenListHtml(tokens: JPDBToken[], selected: string): string {
        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                <div class="jpdb-reader-pos">${escapeHtml(uiText(this.settings.interfaceLanguage, 'selection'))}</div>
                <div class="jpdb-reader-meanings">
                    ${tokens.map(token => this.renderTokenListButton(token)).join('')}
                </div>
                <div class="jpdb-reader-help">${escapeHtml(uiText(this.settings.interfaceLanguage, 'parsedFrom'))}: ${escapeHtml(selected)}</div>
            </div>
        `;
    }

    private renderTokenListButton(token: JPDBToken): string {
        return `
            <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                ${escapeHtml(token.card.spelling)} ${this.renderTokenListReading(token)}
            </button>
        `;
    }

    private renderTokenListReading(token: JPDBToken): string {
        return token.card.reading !== token.card.spelling
            ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>`
            : '';
    }

    private installTokenListHandlers(
        popover: HTMLElement,
        tokens: JPDBToken[],
        anchor: HTMLElement | undefined,
        context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry; stackOverSettings?: boolean },
    ): void {
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
            if (!button) return;
            this.showTokenListCard(button, tokens, anchor, context);
        });
    }

    private showTokenListCard(
        button: HTMLButtonElement,
        tokens: JPDBToken[],
        anchor: HTMLElement | undefined,
        context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry; stackOverSettings?: boolean },
    ): void {
        const card = this.getCachedCard(Number(button.dataset.vid), Number(button.dataset.sid));
        if (!card) return;
        void this.showCard(card, tokens.find(token => token.card === card)?.sentence, anchor, {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: true,
            previousNavigationEntry: context.previousNavigationEntry,
            stackOverSettings: context.stackOverSettings,
        });
    }

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: CardDisplayOptions = {}): Promise<void> {
        const requestedCard = card;
        const trigger = cardDisplayTrigger(options);
        const immediatePitch = trigger === 'modal';
        this.prioritizeQueuedPitchEnrichment(requestedCard, { immediate: immediatePitch });
        card = await this.resolveLookupCardForInitialRender(card);
        sentence = this.preferredCardSentence(sentence, anchor);
        if (card !== requestedCard) this.prioritizeQueuedPitchEnrichment(card, { immediate: immediatePitch });
        this.lastCard = card;
        this.lastCardSentence = sentence;
        const popover = this.createPopover();
        const navigation = options.navigation ?? 'reset';
        const hoverLookupGeneration = trigger === 'hover' ? options.hoverLookupGeneration : undefined;
        const hoverLookupKey = trigger === 'hover' ? options.hoverLookupKey ?? '' : '';
        const isCurrentHoverCard = () => trigger !== 'hover'
            || this.isCurrentHoverGeneration(hoverLookupGeneration, hoverLookupKey);
        this.navigation.updateWord(card, sentence, trigger, navigation, options.previousNavigationEntry);
        this.navigation.clearKanji();
        const done = log.time('showCard', { term: card.spelling, source: cardSourceLabel(card), trigger });
        this.rememberCardMiningContext(card, sentence, anchor, options);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        this.lastAnkiLookup = fallbackAnkiLookup;
        this.maybePreloadLookupCardAudio(card, options);
        const renderData = this.cardRenderData.load(card);
        const requestId = ++this.cardRenderRequest;

        const mounted = await this.mountInitialCardShell(popover, card, sentence, anchor, {
            trigger,
            navigation,
            options,
            renderData,
            fallbackAnkiLookup,
            anchor,
            requestId,
            isCurrentHoverCard,
            hoverLookupGeneration,
        });
        if (!mounted) {
            done();
            return;
        }

        try {
            const renderState = { fullRenderCompleted: false };
            this.renderDeferredCardLocalEntries(popover, card, sentence, trigger, renderData, fallbackAnkiLookup, mounted, renderState, isCurrentHoverCard);

            const fullData = await this.cardRenderDataOrFallback(card, renderData.all, fallbackAnkiLookup);
            renderState.fullRenderCompleted = true;
            if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
            this.renderCompletedCardPopover(popover, card, sentence, trigger, fullData);
        } finally {
            done();
        }
    }

    private async cardRenderDataOrFallback(
        card: JPDBCard,
        renderData: Promise<CardRenderData>,
        fallbackAnkiLookup: AnkiLookupResult,
    ): Promise<CardRenderData> {
        try {
            return await renderData;
        } catch (error) {
            log.warn('Card details failed while rendering popup', { term: card.spelling }, error);
            return {
                localEntries: [],
                kanjiEntries: [],
                metaEntries: [],
                ankiLookup: this.lastAnkiLookup ?? fallbackAnkiLookup,
                jpdbDecks: [],
                ankiDecks: [],
                jpdbVocabularyInfo: null,
            };
        }
    }

    private preferredCardSentence(sentence: string | undefined, anchor: HTMLElement | undefined): string | undefined {
        const cleanSentence = normalizedLookupText(sentence ?? '');
        const anchorSentence = this.renderedAnchorSentence(anchor);
        if (!anchorSentence) return cleanSentence || undefined;
        if (!cleanSentence) return anchorSentence;
        if (anchorSentence.length > cleanSentence.length + 2) return anchorSentence;
        return cleanSentence;
    }

    private renderedAnchorSentence(anchor: HTMLElement | undefined): string {
        const word = anchor?.closest<HTMLElement>('.jpdb-reader-word');
        const sentence = normalizedLookupText(word?.dataset.sentence ?? anchor?.dataset.sentence ?? '');
        return HAS_JAPANESE.test(sentence) ? sentence : '';
    }

    private rememberCardMiningContext(card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: CardDisplayOptions): void {
        const hasNestedImmersionContext = options.insideReaderPopup && Boolean(this.immersionPopover.activeContextFor(card));
        if (hasNestedImmersionContext || this.immersionPopover.hasActiveContext(card, sentence)) return;
        this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
    }

    private async mountInitialCardShell(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        anchor: HTMLElement | undefined,
        context: {
            trigger: 'modal' | 'hover';
            navigation: CardNavigationMode;
            options: CardDisplayOptions;
            renderData: CardRenderDataLoad;
            fallbackAnkiLookup: AnkiLookupResult;
            anchor?: HTMLElement;
            requestId: number;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): Promise<MountedCardShell | null> {
        if (!context.isCurrentHoverCard()) {
            return null;
        }
        setInnerHtml(popover, this.cardPopoverRenderer.render(
            card,
            sentence,
            context.trigger,
            loadingCardRenderData([], context.fallbackAnkiLookup),
        ));
        this.installCardPopoverHandlers(popover, card, sentence, anchor, context.trigger);
        this.mountPopover(popover, anchor, {
            mode: context.trigger,
            preservePosition: this.initialCardPreservePosition(context),
            hoverLookupKey: context.options.hoverLookupKey,
            pointerTextLookup: context.options.pointerTextLookup,
            stackOverSettings: context.options.stackOverSettings,
        });
        this.installInitialCardBehaviors(popover, card, sentence, context, null);
        return { instantLocalEntries: null, requestId: context.requestId };
    }

    private initialCardPreservePosition(context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; options: CardDisplayOptions }): boolean {
        return context.options.preservePosition ?? (context.trigger === 'modal' && context.navigation !== 'reset');
    }

    private installInitialCardBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        context: {
            trigger: 'modal' | 'hover';
            options: CardDisplayOptions;
            anchor?: HTMLElement;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
        instantLocalEntries: YomitanTermEntry[] | null,
    ): void {
        this.maybeAutoPlayInitialCard(card, context);
        this.maybeParseInstantLocalEntries(popover, instantLocalEntries);
        this.studySources.installLoaders(popover, sentence);
        this.installLazyImmersionExamples(popover, card);
    }

    private prioritizeQueuedPitchEnrichment(card: JPDBCard, options: { immediate?: boolean } = {}): void {
        if (!this.settings.showPitchAccent || card.pitchAccent.length) return;
        const key = cardKey(card);
        const queuedToken = this.takeQueuedPitchEnrichmentToken(key);
        if (!queuedToken && !options.immediate) return;
        const token = queuedToken ?? pitchEnrichmentTokenForCard(card);
        void this.enrichPitchWords([token], { urgent: true });
    }

    private maybeAutoPlayInitialCard(
        card: JPDBCard,
        context: {
            trigger: 'modal' | 'hover';
            options: CardDisplayOptions;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): void {
        if (!this.shouldAutoPlayInitialCard(card, context)) return;
        void this.audioActions.playTermAudio(card, {
            hoverLookupGeneration: context.hoverLookupGeneration,
            userGesture: context.options.userGesture,
            isCurrent: context.trigger === 'hover' ? context.isCurrentHoverCard : undefined,
        });
    }

    private maybePreloadLookupCardAudio(card: JPDBCard, options: CardDisplayOptions): void {
        if (!this.canPreloadReaderAudio()) return;
        this.audio.preload(card, {
            sourceLimit: 1,
            candidateLimit: 1,
            prepareAudio: options.trigger !== 'hover',
        });
    }

    private shouldAutoPlayInitialCard(
        card: JPDBCard,
        context: { trigger: 'modal' | 'hover'; options: CardDisplayOptions; anchor?: HTMLElement; isCurrentHoverCard: () => boolean },
    ): boolean {
        return context.options.autoPlay !== false
            && this.isCurrentCardForAutoPlay(context)
            && this.shouldAutoPlay(card, context.trigger, Boolean(context.options.userGesture), context.anchor);
    }

    private isCurrentCardForAutoPlay(context: { trigger: 'modal' | 'hover'; isCurrentHoverCard: () => boolean }): boolean {
        return context.trigger === 'modal' || context.isCurrentHoverCard();
    }

    private maybeParseInstantLocalEntries(popover: HTMLElement, instantLocalEntries: YomitanTermEntry[] | null): void {
        if (instantLocalEntries?.length) void this.parsePopoverJapanese(popover);
    }

    private installLazyImmersionExamples(popover: HTMLElement, card: JPDBCard, options: ImmersionSearchOptions = {}): void {
        if (this.settings.immersionKitEnabled) this.immersionPopover.installLazyLoad(popover, card, options);
    }

    private renderDeferredCardLocalEntries(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        renderData: CardRenderDataLoad,
        fallbackAnkiLookup: AnkiLookupResult,
        mounted: MountedCardShell,
        renderState: { fullRenderCompleted: boolean },
        isCurrentHoverCard: () => boolean,
    ): void {
        if (mounted.instantLocalEntries !== null) return;
        let localEntriesValue: YomitanTermEntry[] | null = null;
        let metaEntriesValue: YomitanMetaEntry[] = [];
        let jpdbVocabularyInfoValue: JpdbVocabularyInfo | null = null;
        let renderedPitchKey = card.pitchAccent.join('|');
        const isCurrentRender = () => this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard);
        const canRenderLoading = () => !renderState.fullRenderCompleted && isCurrentRender();
        const renderLoading = () => {
            if (!canRenderLoading()) return;
            renderedPitchKey = card.pitchAccent.join('|');
            const preservedImmersion = this.preserveImmersionMountForRerender(popover);
            clearNestedParseState(popover);
            setInnerHtml(popover, this.cardPopoverRenderer.render(
                card,
                sentence,
                trigger,
                loadingCardRenderData(
                    localEntriesValue ?? [],
                    this.lastAnkiLookup ?? fallbackAnkiLookup,
                    metaEntriesValue,
                    jpdbVocabularyInfoValue,
                ),
            ));
            this.restorePreservedImmersionMount(popover, preservedImmersion);
            refreshForcedReaderPopoverSurface(popover, this.settings);
            this.repositionActivePopover();
            void this.parsePopoverJapanese(popover);
            this.studySources.installLoaders(popover, sentence);
            this.installLazyImmersionExamples(popover, card);
        };
        void renderData.localEntries.then(localEntries => {
            localEntriesValue = localEntries;
            renderLoading();
        });
        if (renderData.localMetaEntries) {
            void renderData.localMetaEntries.then(metaEntries => {
                metaEntriesValue = metaEntries;
                if (!canRenderLoading()) return;
                this.updateDeferredCardHeader(popover, card, metaEntriesValue);
            });
        }
        if (renderData.jpdbVocabularyInfo) {
            void renderData.jpdbVocabularyInfo.then(jpdbVocabularyInfo => {
                jpdbVocabularyInfoValue = jpdbVocabularyInfo;
                renderLoading();
            });
        }
        if (renderData.ankiLookup) {
            void renderData.ankiLookup.then(ankiLookup => {
                this.lastAnkiLookup = ankiLookup;
                this.applyAnkiLookupToRenderedWords(card, ankiLookup);
                renderLoading();
            });
        }
        if (!renderData.pitchAccent) return;
        void renderData.pitchAccent.then(pitchAccent => {
            if (!pitchAccent.length || !isCurrentRender()) return;
            if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
            if (renderedPitchKey === card.pitchAccent.join('|')) return;
            renderedPitchKey = card.pitchAccent.join('|');
            this.updateDeferredCardHeader(popover, card, metaEntriesValue);
        });
    }

    private updateDeferredCardHeader(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        this.applyPitchAccentToRenderedWords(card);
        this.updatePopoverWordPills(popover, card, metaEntries);
        this.updatePopoverPitch(popover, card, metaEntries);
        this.repositionActivePopover();
    }

    private updatePopoverWordPills(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        const heading = popover.querySelector<HTMLElement>('.jpdb-reader-heading');
        if (!heading) return;
        const html = renderWordPills({
            card,
            jpdbUrl: `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`,
            settings: this.settings,
            metaEntries,
            isJpdbBackedCard: value => this.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        });
        replaceOptionalElement(heading, '.jpdb-reader-word-pills', html);
    }

    private updatePopoverPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        const tools = popover.querySelector<HTMLElement>('.jpdb-reader-card-tools');
        if (!tools || !this.settings.showPitchAccent) return;
        replaceOptionalElement(tools, '.jpdb-reader-pitch', renderPitch(card, metaEntries), tools.firstElementChild);
    }

    private renderCompletedCardPopover(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
    ): void {
        this.lastAnkiLookup = data.ankiLookup;
        this.applyAnkiLookupToRenderedWords(card, data.ankiLookup);
        this.applyPitchAccentToRenderedWords(card);
        const preservedImmersion = this.preserveImmersionMountForRerender(popover);
        clearNestedParseState(popover);
        setInnerHtml(popover, this.cardPopoverRenderer.render(card, sentence, trigger, { ...data, loading: false }));
        this.restorePreservedImmersionMount(popover, preservedImmersion);
        refreshForcedReaderPopoverSurface(popover, this.settings);

        this.repositionActivePopover();
        void this.parsePopoverJapanese(popover);
        if (this.settings.immersionKitEnabled) {
            this.installLazyImmersionExamples(popover, card, {
                relatedQueries: this.immersionRelatedQueries(data.jpdbVocabularyInfo),
            });
        }
        this.studySources.installLoaders(popover, sentence);
    }

    private preserveImmersionMountForRerender(popover: HTMLElement): HTMLElement | null {
        const mount = popover.querySelector<HTMLElement>('[data-immersion-kit]');
        return mount && this.shouldPreserveImmersionMount(mount) ? mount : null;
    }

    private shouldPreserveImmersionMount(mount: HTMLElement): boolean {
        return Boolean(
            mount.dataset.immersionLoadState
            || mount.dataset.immersionEmpty === 'true'
            || mount.querySelector('.jpdb-reader-example-card')
            || (mount instanceof HTMLDetailsElement && mount.open)
        );
    }

    private restorePreservedImmersionMount(popover: HTMLElement, preserved: HTMLElement | null): void {
        if (!preserved) return;
        const next = popover.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!next || next === preserved) return;
        next.replaceWith(preserved);
    }

    private isCurrentCardRender(popover: HTMLElement, _requestId: number, isCurrentHoverCard: () => boolean): boolean {
        return isCurrentHoverCard()
            && popover.isConnected
            && this.activePopover === popover;
    }

    private immersionRelatedQueries(info: JpdbVocabularyInfo | null): string[] {
        if (!info) return [];
        return info.compounds.flatMap(compound => [compound.term, compound.reading]).filter(Boolean);
    }

    private installCardPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
        popover.addEventListener('click', event => {
            if (this.handleDictionaryLookupLink(event, anchor, trigger)) return;
            const kanjiButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action="kanji"]');
            if (kanjiButton) {
                event.preventDefault();
                event.stopPropagation();
                void this.showKanjiCard(card, kanjiButton.dataset.kanji ?? '', sentence, anchor, { preservePosition: true });
                return;
            }
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            if (button.dataset.action === 'word-history-back') {
                void this.showPreviousWord(anchor, trigger);
                return;
            }
            if (button.dataset.action === 'mining-collapse') {
                this.toggleMiningControls(button);
                return;
            }
            if (button.dataset.action === 'deck-picker') {
                if (this.openDeckPickerForAdd(button, card, sentence)) return;
            }
            if (button.dataset.action === 'add' && this.openDeckPickerForAdd(button, card, sentence)) return;
            void this.handleCardAction(button, card, sentence);
        });
    }

    private toggleMiningControls(button: HTMLButtonElement): void {
        const actions = button.closest<HTMLElement>('.jpdb-reader-actions');
        if (!actions) return;
        this.setMiningControlsExpanded(button, actions.classList.contains('jpdb-reader-actions-mining-collapsed'));
    }

    private setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean): void {
        const actions = button.closest<HTMLElement>('.jpdb-reader-actions');
        if (!actions) return;
        actions.classList.toggle('jpdb-reader-actions-mining-collapsed', !expanded);
        button.setAttribute('aria-expanded', String(expanded));
        const label = uiText(this.settings.interfaceLanguage, expanded ? 'hideMiningActions' : 'showMiningActions');
        button.setAttribute('aria-label', label);
        button.title = label;
    }

    private openDeckPickerForAdd(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        const picker = button
            .closest<HTMLElement>('.jpdb-reader-mining-details')
            ?.querySelector<HTMLSelectElement>('[data-add-deck-select]');
        if (!picker) return false;
        const wrapper = picker.closest<HTMLElement>('.jpdb-reader-mining-details');
        const toggle = wrapper?.querySelector<HTMLButtonElement>('.jpdb-reader-mining-title');
        if (picker.classList.contains('jpdb-reader-add-deck-select-open')) {
            picker.focus();
            return true;
        }

        const controller = new AbortController();
        const cleanup = (): void => {
            controller.abort();
            picker.classList.remove('jpdb-reader-add-deck-select-open');
            wrapper?.classList.remove('jpdb-reader-deck-picker-open');
            toggle?.setAttribute('aria-expanded', 'false');
            picker.selectedIndex = 0;
        };
        picker.addEventListener('change', () => {
            const option = picker.selectedOptions[0];
            const deckId = option?.dataset.deckId?.trim();
            if (!deckId) {
                cleanup();
                return;
            }
            button.dataset.deckSource = option.dataset.deckSource === 'anki' ? 'anki' : 'jpdb';
            button.dataset.deckId = deckId;
            const originalAction = button.dataset.action;
            button.dataset.action = 'add';
            cleanup();
            void this.handleCardAction(button, card, sentence).finally(() => {
                if (originalAction) button.dataset.action = originalAction;
                delete button.dataset.deckSource;
                delete button.dataset.deckId;
            });
        }, { signal: controller.signal });
        picker.addEventListener('blur', () => {
            window.setTimeout(() => {
                if (document.activeElement !== picker) cleanup();
            }, 180);
        }, { once: true, signal: controller.signal });

        picker.classList.add('jpdb-reader-add-deck-select-open');
        wrapper?.classList.add('jpdb-reader-deck-picker-open');
        toggle?.setAttribute('aria-expanded', 'true');
        picker.focus();
        const showPicker = (picker as HTMLSelectElement & { showPicker?: () => void }).showPicker;
        if (showPicker) {
            try {
                showPicker.call(picker);
            } catch {
                // The temporary visible select is the fallback on browsers without a native picker.
            }
        }
        return true;
    }

    private async showPreviousWord(anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): Promise<void> {
        const previous = this.navigation.popPreviousWord();
        if (!previous) return;
        if (previous.kind === 'kanji') {
            await this.showKanjiCard(previous.card, previous.kanji, previous.sentence, anchor, {
                navigation: 'preserve',
                preservePosition: true,
            });
            return;
        }
        await this.showCard(previous.card, previous.sentence, anchor, {
            autoPlay: false,
            trigger,
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private async showPreviousKanji(anchor?: HTMLElement): Promise<void> {
        const previous = this.navigation.popPreviousKanji();
        if (!previous) return;
        await this.showKanjiCard(previous.card, previous.kanji, previous.sentence, anchor, {
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture = false, anchor?: HTMLElement): boolean {
        if (!this.settings.audioEnabled || !this.settings.autoPlayAudio) return false;
        if (this.shouldSuppressAutoAudioForVideo(anchor)) return false;
        if (!this.shouldAutoPlayForTrigger(trigger)) return false;
        if (!canAttemptAudiblePlayback(userGesture)) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (!userGesture) {
            if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
            this.lastAutoAudioKey = key;
            this.lastAutoAudioAt = now;
        }
        return true;
    }

    private shouldSuppressAutoAudioForVideo(anchor?: HTMLElement): boolean {
        return this.settings.suppressAutoAudioOnVideo
            && (Boolean(anchor?.closest('.jpdb-subtitle-player, .jpdb-subtitle-list')) || hasVisiblePageVideo());
    }

    private shouldAutoPlayForTrigger(trigger: 'modal' | 'hover'): boolean {
        const mode = this.settings.audioAutoPlayMode;
        if (mode === 'all') return true;
        return mode === 'hover' ? trigger === 'hover' : trigger === 'modal';
    }

    private async showKanjiCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: { navigation?: CardNavigationMode; preservePosition?: boolean } = {}): Promise<void> {
        if (!isKanjiCharacter(kanji)) return;
        const navigation = options.navigation ?? 'reset';
        this.navigation.updateKanji(card, kanji, sentence, navigation);
        const popover = this.createPopover();
        const language = this.settings.interfaceLanguage;
        const kanjiCharacters = uniqueKanji(card.spelling);
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const detailsPromises = this.kanjiDetailPromises(kanji);
        this.renderKanjiCardShell(popover, card, kanji, kanjiCharacters, jpdbUrl, language);
        this.installKanjiCardActions(popover, card, kanji, sentence, anchor);
        this.mountPopover(popover, anchor, { preservePosition: options.preservePosition });
        this.startKanjiProgressiveRender(popover, detailsPromises, card, kanji, language);
    }

    private kanjiDetailPromises(kanji: string): KanjiDetailPromises {
        const needsKanjiVG = this.settings.kanjivgEnabled || (this.settings.kanjiOriginsEnabled && this.settings.kanjiOriginGraphEnabled);
        return {
            jpdbInfo: this.jpdbKanjiDetailPromise(kanji),
            kanjiEntries: this.localKanjiEntriesPromise(kanji),
            rtkInfo: this.rtkDetailPromise(kanji),
            kanjiVGInfo: needsKanjiVG ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
    }

    private jpdbKanjiDetailPromise(kanji: string): Promise<JpdbKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private localKanjiEntriesPromise(kanji: string): Promise<YomitanKanjiEntry[]> {
        return this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private rtkDetailPromise(kanji: string): Promise<RtkInfo | null> {
        return this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private renderKanjiCardShell(popover: HTMLElement, card: JPDBCard, kanji: string, kanjiCharacters: string[], jpdbUrl: string, language: InterfaceLanguage): void {
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-popover-body">
                ${renderModalNavigation({
                    ...this.navigation.kanjiModalBack(card, language),
                    controlsHtml: this.renderKanjiNavigationControls(kanjiCharacters, kanji, language),
                })}
                <div class="jpdb-reader-header">
                    <div class="jpdb-reader-heading">
                        <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                            <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                            <div data-kanji-keyword-mount><div class="jpdb-reader-help">${escapeHtml(uiText(language, 'loadingKanjiDetails'))}</div></div>
                            ${renderWordPills({
                                card,
                                jpdbUrl,
                                settings: this.settings,
                                metaEntries: [],
                                overrideQuery: kanji,
                                isJpdbBackedCard: value => this.isJpdbBackedCard(value),
                                dictionaryLabel: name => this.dictionaryLabel(name),
                            })}
                        </div>
                    </div>
                </div>
                <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                    ${this.renderKanjiSourceMounts(kanji, language)}
                </div>
            </div>
            ${this.renderKanjiActionBar(card)}
        `);
    }

    private renderKanjiNavigationControls(kanjiCharacters: string[], kanji: string, language: InterfaceLanguage): string {
        if (kanjiCharacters.length <= 1) return '';
        const index = Math.max(0, kanjiCharacters.indexOf(kanji));
        const previous = kanjiCharacters[(index - 1 + kanjiCharacters.length) % kanjiCharacters.length];
        const next = kanjiCharacters[(index + 1) % kanjiCharacters.length];
        return `
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}" title="${escapeHtml(uiText(language, 'previousKanji'))}">‹</button>
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}" title="${escapeHtml(uiText(language, 'nextKanji'))}">›</button>
        `;
    }

    private installKanjiCardActions(popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        popover.addEventListener('click', event => {
            if (this.handleDictionaryLookupLink(event, anchor, 'modal')) return;
            const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
            const action = actionButton?.dataset.action;
            if (!action) return;
            event.preventDefault();
            event.stopPropagation();
            if (action === 'copy-word') {
                void copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord')));
                return;
            }
            if (action === 'jpdb-kanji-action') {
                const actionId = actionButton.dataset.kanjiActionId ?? '';
                void this.performJpdbKanjiAction(actionId, card, kanji, sentence, anchor);
                return;
            }
            if (action === 'mining-collapse') {
                this.toggleMiningControls(actionButton);
                return;
            }
            if (action === 'grade') {
                void this.handleCardAction(actionButton, card, sentence);
                return;
            }
            if (action === 'word-back') void this.showCard(card, sentence, anchor, { autoPlay: false, navigation: 'preserve', preservePosition: true });
            if (action === 'kanji-history-back') void this.showPreviousKanji(anchor);
            if (action === 'kanji-prev' || action === 'kanji-next') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true });
            if (action === 'kanji') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true });
            if (action === 'similar-word') void this.lookupText(actionButton.dataset.expression ?? '', actionButton.dataset.expression ?? '', { navigation: 'push-current', preservePosition: true });
        });
    }

    private startKanjiProgressiveRender(popover: HTMLElement, detailsPromises: KanjiDetailPromises, card: JPDBCard, kanji: string, language: InterfaceLanguage, pageTarget?: JpdbTermTarget): void {
        if (this.settings.similarKanjiWords) {
            void this.renderSimilarKanjiWordsProgressively(popover, detailsPromises.jpdbInfo, kanji, card);
        }
        if (this.settings.uchisenEnabled) {
            void this.renderUchisenInto(popover, kanji);
        }
        this.installKanjiImmersionExamples(popover, card, pageTarget?.queries ?? []);
        void this.renderKanjiDetailsInto(popover, detailsPromises, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, detailsPromises.kanjiVGInfo, kanji, language);
        }
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (!actionId) return;
        try {
            await this.jpdbKanji.performAction(actionId);
            this.toast(uiText(this.settings.interfaceLanguage, 'jpdbKanjiUpdated'));
            await this.showKanjiCard(card, kanji, sentence, anchor, { preservePosition: true });
        } catch (error) {
            log.warn('JPDB kanji action failed', { kanji }, error);
            this.toast(uiText(this.settings.interfaceLanguage, 'jpdbKanjiUpdateFailedRuntime'));
        }
    }

    private renderKanjiSourceMounts(kanji: string, language: InterfaceLanguage): string {
        const mounts: string[] = [];
        for (const sourceId of orderedKanjiSourceIds(this.settings)) {
            const mount = this.renderKanjiSourceMount(sourceId, kanji, language);
            if (mount) mounts.push(mount);
        }
        return mounts.join('');
    }

    private renderKanjiSourceMount(sourceId: string, kanji: string, language: InterfaceLanguage): string {
        if (sourceId === KANJI_STROKE_SOURCE_ID) {
            const sourceStateKey = kanjiSourceStateKey(KANJI_STROKE_SOURCE_ID);
            return renderKanjiPractice(null, kanji, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(sourceId));
        }
        if (sourceId === KANJI_JPDB_SOURCE_ID) return '<div data-kanji-jpdb-mount></div>';
        if (sourceId === KANJI_RTK_SOURCE_ID) return '<div data-kanji-rtk-mount></div>';
        if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderKanjiImmersionKitMount();
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return '<div data-kanji-uchisen-mount></div>';
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return '<div data-kanji-definitions-mount></div>';
        const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
        if (dictionaryName) return `<div data-kanji-definitions-mount data-kanji-dictionary="${escapeHtml(dictionaryName)}" data-kanji-source-id="${escapeHtml(sourceId)}"></div>`;
        if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) {
            const sourceStateKey = kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID);
            return renderSimilarKanjiWordsShell(
                kanji,
                language,
                sourceStateKey,
                this.dictionarySourceState.isOpen(sourceStateKey),
                (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                this.kanjiSourceTitle(sourceId),
            );
        }
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return '<div data-kanji-origin-mount></div>';
        return '';
    }

    private renderKanjiImmersionKitMount(): string {
        if (!this.shouldRenderKanjiImmersionKit()) return '';
        const sourceStateKey = kanjiSourceStateKey(IMMERSION_KIT_SOURCE_ID);
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceState.attributes(sourceStateKey, false)}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private renderKanjiActionBar(card: JPDBCard): string {
        const reviewButtons = this.renderKanjiReviewButtons(card);
        return `
            <div class="jpdb-reader-actions" data-kanji-actions data-kanji-has-review="${reviewButtons ? 'true' : 'false'}"${reviewButtons ? '' : ' hidden'}>
                <div class="jpdb-reader-actions-gutter" hidden>
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse" aria-expanded="false" title="${escapeHtml(uiText(this.settings.interfaceLanguage, 'showMiningActions'))}" aria-label="${escapeHtml(uiText(this.settings.interfaceLanguage, 'showMiningActions'))}"></button>
                </div>
                <div data-kanji-mining-mount hidden></div>
                ${reviewButtons}
            </div>
        `;
    }

    private renderKanjiReviewButtons(card: JPDBCard): string {
        if (!this.settings.enableReviews) return '';
        const states = normalizeCardStates(card.cardState);
        if (states.includes('blacklisted') || states.includes('never-forget')) return '';
        const ankiLookup = this.lastCard && cardKey(this.lastCard) === cardKey(card) ? this.lastAnkiLookup : undefined;
        const ankiNote = ankiLookup?.primary ?? null;
        const canReviewWithAnki = Boolean(ankiNote?.primaryCardId);
        const canReviewWithJpdb = this.isJpdbBackedCard(card) && Boolean(this.settings.apiKey.trim()) && this.settings.jpdbMiningEnabled;
        if (!canReviewWithAnki && !canReviewWithJpdb) return '';
        return renderReviewButtons(this.settings, ankiNote);
    }

    private updateKanjiMiningControls(popover: HTMLElement, controls: string): void {
        const actions = popover.querySelector<HTMLElement>('[data-kanji-actions]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        if (!actions || !miningMount) return;
        const hasControls = Boolean(controls);
        const hasReview = actions.dataset.kanjiHasReview === 'true';
        actions.hidden = !hasControls && !hasReview;
        actions.classList.toggle('jpdb-reader-actions-has-mining', hasControls);
        actions.classList.toggle('jpdb-reader-actions-mining-collapsed', hasControls);
        const gutter = actions.querySelector<HTMLElement>('.jpdb-reader-actions-gutter');
        if (gutter) gutter.hidden = !hasControls;
        const collapseButton = actions.querySelector<HTMLButtonElement>('[data-action="mining-collapse"]');
        if (collapseButton && hasControls) this.setMiningControlsExpanded(collapseButton, false);
        miningMount.hidden = !hasControls;
        setInnerHtml(miningMount, controls);
    }

    private async renderKanjiDetailsInto(
        popover: HTMLElement,
        detailsPromises: KanjiDetailPromises,
        kanji: string,
        language: InterfaceLanguage,
    ): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        const practiceDoodle = installKanjiPracticeDoodle(popover, () => this.settings.interfaceLanguage, () => kanjiVGInfo);
        const keywordMount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
        const rtkMount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
        const definitionsMounts = Array.from(popover.querySelectorAll<HTMLElement>('[data-kanji-definitions-mount]'));

        const renderKeyword = () => {
            if (!popover.isConnected || !keywordMount?.isConnected) return;
            setInnerHtml(keywordMount, renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries, language));
            this.repositionActivePopover();
        };
        const renderRtk = () => {
            if (!popover.isConnected || !rtkMount?.isConnected) return;
            const componentSummaries = buildRtkComponentSummaries(rtkInfo, jpdbInfo, kanjiEntries);
            const sourceStateKey = kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
            setInnerHtml(rtkMount, renderRtkInfo(rtkInfo, componentSummaries, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey));
            this.repositionActivePopover();
        };

        const jpdbInfoPromise = detailsPromises.jpdbInfo.then(info => {
            jpdbInfo = info;
            if (!popover.isConnected) return;
            renderKeyword();
            if (miningMount?.isConnected) this.updateKanjiMiningControls(popover, renderJpdbKanjiMiningControls(jpdbInfo, language));
            if (jpdbMount?.isConnected) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(KANJI_JPDB_SOURCE_ID)));
            }
            renderRtk();
        });
        const kanjiEntriesPromise = detailsPromises.kanjiEntries.then(entries => {
            kanjiEntries = entries;
            if (!popover.isConnected) return;
            renderKeyword();
            for (const definitionsMount of definitionsMounts.filter(mount => mount.isConnected)) {
                const dictionaryName = definitionsMount.dataset.kanjiDictionary;
                const sourceId = definitionsMount.dataset.kanjiSourceId ?? KANJI_DICTIONARIES_SOURCE_ID;
                const visibleEntries = dictionaryName
                    ? kanjiEntries.filter(entry => entry.dictionary === dictionaryName)
                    : kanjiEntries;
                setInnerHtml(definitionsMount, renderKanjiDefinitions(
                    visibleEntries,
                    (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    sourceId,
                    dictionaryName ? this.dictionaryLabel(dictionaryName) : this.kanjiSourceTitle(KANJI_DICTIONARIES_SOURCE_ID),
                    language,
                ));
            }
            renderRtk();
        });
        const rtkInfoPromise = detailsPromises.rtkInfo.then(info => {
            rtkInfo = info;
            if (!popover.isConnected) return;
            renderKeyword();
            renderRtk();
        });
        const kanjiVGInfoPromise = detailsPromises.kanjiVGInfo.then(info => {
            kanjiVGInfo = info;
            if (!popover.isConnected) return;
            practiceDoodle.reassess();
        });

        await Promise.all([jpdbInfoPromise, kanjiEntriesPromise, rtkInfoPromise, kanjiVGInfoPromise]);
        if (!popover.isConnected) return;
        const resolvedJpdbInfo = jpdbInfo as JpdbKanjiInfo | null;
        const resolvedRtkInfo = rtkInfo as RtkInfo | null;
        const resolvedKanjiVGInfo = kanjiVGInfo as KanjiVGInfo | null;

        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, resolvedJpdbInfo, resolvedRtkInfo, resolvedKanjiVGInfo, kanjiEntries);
        }
        void (this.isJpdbPageAddonRoot(popover) ? this.parseJpdbPageAddonJapanese(popover) : this.parsePopoverJapanese(popover));
        this.repositionActivePopover();
    }

    private async renderUchisenInto(popover: HTMLElement, kanji: string): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        if (!mount) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const sourceAttributes = () => this.dictionarySourceState.attributes(sourceStateKey, this.dictionarySourceState.isOpen(sourceStateKey));
        setInnerHtml(mount, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source" ${sourceAttributes()}>
                <summary class="jpdb-reader-local-title">Uchisen</summary>
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">${escapeHtml(uiText(this.settings.interfaceLanguage, 'loadingMnemonicImages'))}</div></div>
            </details>
        `);
        const data = await loadUchisenData(kanji, this.settings.corsProxyUrl).catch(() => {
            return { images: [], componentGroups: [], kanjiKeyword: null, kanjiId: '', canGenerateImages: false };
        });
        if (!popover.isConnected || !mount.isConnected) return;
        if (!data.images.length && !data.canGenerateImages) {
            mount.remove();
            return;
        }
        await installUchisenCarousel(mount, kanji, data.images, {
            sourceAttributes: sourceAttributes(),
            detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
            summaryClass: 'jpdb-reader-local-title',
            bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
            componentGroups: data.componentGroups,
            kanjiKeyword: data.kanjiKeyword,
            kanjiId: data.kanjiId,
            canGenerateImages: data.canGenerateImages,
            refreshData: () => loadUchisenData(kanji, this.settings.corsProxyUrl),
            interfaceLanguage: this.settings.interfaceLanguage,
        });
        this.repositionActivePopover();
    }

    private async lookupSimilarKanjiWordsWhenIdle(kanji: string): Promise<YomitanTermEntry[]> {
        await this.waitForIdle();
        return this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences);
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return waitForBrowserIdle(timeoutMs);
    }

    private renderSimilarKanjiWordsProgressively(popover: HTMLElement, jpdbInfoPromise: Promise<JpdbKanjiInfo | null>, kanji: string, card: JPDBCard): void {
        const section = this.ensureSimilarKanjiWordsSection(popover, kanji);
        const mount = section?.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!section || !mount) return;

        let started = false;
        let jpdbLoaded = false;
        let localLoaded = !this.settings.localDictionariesEnabled;
        let jpdbVocabulary: JpdbKanjiVocabulary[] = [];
        let localEntries: YomitanTermEntry[] = [];
        const render = () => {
            if (!popover.isConnected || !section.isConnected || !mount.isConnected) return;
            const content = renderSimilarKanjiWordsContent(localEntries, jpdbVocabulary, card, this.settings, name => this.dictionaryLabel(name));
            setInnerHtml(mount, content || `<div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, jpdbLoaded && localLoaded ? 'noSimilarWords' : 'loadingSimilarWords')}</div>`);
            this.repositionActivePopover();
        };

        const load = () => {
            if (!section.open || started) return;
            started = true;
            render();

            const jpdbVocabularyPromise = jpdbInfoPromise.then(info => {
                jpdbVocabulary = info?.vocabulary ?? [];
                jpdbLoaded = true;
                render();
            }).catch(() => {
                jpdbLoaded = true;
                render();
            });

            const localEntriesPromise = this.settings.localDictionariesEnabled
                ? this.lookupSimilarKanjiWordsWhenIdle(kanji).then(entries => {
                    localEntries = entries;
                    localLoaded = true;
                    render();
                }).catch(() => {
                    localLoaded = true;
                    render();
                })
                : Promise.resolve();

            void Promise.all([jpdbVocabularyPromise, localEntriesPromise]).then(() => {
            });
        };

        section.addEventListener('toggle', load);
        load();
    }

    private ensureSimilarKanjiWordsSection(popover: HTMLElement, kanji: string): HTMLDetailsElement | null {
        const existing = popover.querySelector<HTMLDetailsElement>('[data-kanji-similar-words]');
        if (existing) return existing;

        const stack = popover.querySelector<HTMLElement>('.jpdb-reader-kanji-section-stack');
        if (!stack) return null;
        const sourceStateKey = kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID);
        appendTrustedHtml(stack, renderSimilarKanjiWordsShell(
            kanji,
            this.settings.interfaceLanguage,
            sourceStateKey,
            this.dictionarySourceState.isOpen(sourceStateKey),
            (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            this.kanjiSourceTitle(KANJI_SIMILAR_WORDS_SOURCE_ID),
        ));
        this.dictionarySourceState.installTracking(popover);
        return stack.querySelector<HTMLDetailsElement>('[data-kanji-similar-words]');
    }

    private async renderKanjiVGInto(popover: HTMLElement, kanjiVGPromise: Promise<KanjiVGInfo | null>, kanji: string, language: InterfaceLanguage): Promise<void> {
        const info = await kanjiVGPromise;
        if (!info || !popover.isConnected) return;
        const elements = this.kanjiVGStageElements(popover, kanji);
        if (!elements) return;
        const { stage, ghost, help } = elements;
        setInnerHtml(ghost, info.svg);
        help.textContent = `${info.strokeCount} ${uiText(language, 'strokes')}`;
        stage.classList.remove('trace-hidden');
        const trace = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        if (trace) trace.textContent = uiText(language, 'hideTrace');
    }

    private kanjiVGStageElements(popover: HTMLElement, kanji: string): { stage: HTMLElement; ghost: HTMLElement; help: HTMLElement } | null {
        const stage = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-doodle-stage'))
            .find(candidate => candidate.dataset.kanji === kanji);
        if (!stage) return null;
        const ghost = stage.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        if (!ghost) return null;
        const help = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
        if (!help) return null;
        return { stage, ghost, help };
    }

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.lookupKanjiOriginSourceInfo(kanji);
        if (!this.canRenderKanjiOriginMount(popover, mount)) return;
        this.renderKanjiOriginMount(mount, kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        this.installKanjiOriginImageFallbacks(mount);
    }

    private async lookupKanjiOriginSourceInfo(kanji: string): Promise<KanjiSourceInfo | null> {
        return await this.kanjiOrigin.lookup(kanji, this.settings).catch(error => {
            log.warn('Kanji origin lookup failed', { kanji }, error);
            return null;
        });
    }

    private canRenderKanjiOriginMount(popover: HTMLElement, mount: HTMLElement): boolean {
        return popover.isConnected && mount.isConnected;
    }

    private renderKanjiOriginMount(
        mount: HTMLElement,
        kanji: string,
        jpdbInfo: JpdbKanjiInfo | null,
        rtkInfo: RtkInfo | null,
        kanjiVGInfo: KanjiVGInfo | null,
        kanjiEntries: YomitanKanjiEntry[],
        sourceInfo: KanjiSourceInfo | null,
    ): void {
        const facts = buildKanjiFacts(kanji, jpdbInfo, rtkInfo, this.settings.kanjivgEnabled ? kanjiVGInfo : null, kanjiEntries, sourceInfo);
        const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, renderKanjiOrigins(
            facts,
            this.kanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo),
            sourceInfo,
            this.settings,
            this.settings.interfaceLanguage,
            this.dictionarySourceState.isOpen(sourceStateKey),
            sourceStateKey,
            jpdbInfo ? new Set([
                jpdbInfo.type ? 'Type' : null,
                jpdbInfo.frequency ? 'Frequency' : null,
            ].filter(Boolean) as string[]) : undefined,
            this.kanjiSourceTitle(KANJI_ORIGINS_SOURCE_ID),
        ));
        installOriginGraphInteractions(mount);
    }

    private kanjiOriginGraph(
        kanji: string,
        jpdbInfo: JpdbKanjiInfo | null,
        rtkInfo: RtkInfo | null,
        kanjiVGInfo: KanjiVGInfo | null,
        kanjiEntries: YomitanKanjiEntry[],
        sourceInfo: KanjiSourceInfo | null,
    ): ReturnType<typeof buildKanjiOriginGraph> | null {
        return this.settings.kanjiOriginGraphEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo, kanjiVGInfo)
            : null;
    }

    private installKanjiOriginImageFallbacks(mount: HTMLElement): void {
        mount.querySelectorAll<HTMLImageElement>('[data-radical-frame]').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
        });
    }

    private renderDefinitionSources(
        card: JPDBCard,
        entries: YomitanTermEntry[],
        sentence?: string,
        jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
        options: RenderDefinitionSourcesOptions = {},
    ): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const setup = this.renderFallbackSetupSource(card);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        const includeJpdbSource = options.includeJpdbSource ?? true;
        const includeStudySources = options.includeStudySources ?? true;
        const includeImmersionSource = options.includeImmersionSource ?? true;
        let renderedDictionaries = false;
        const sections = [
            setup,
            ...sourceIds
            .map(sourceId => {
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return includeJpdbSource ? renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded), jpdbVocabularyInfo, this.settings.interfaceLanguage) : '';
                if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return includeStudySources ? this.studySources.renderTranslationSource(sentence) : '';
                if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return includeStudySources ? this.studySources.renderGrammarSource(sentence) : '';
                if (sourceId === IMMERSION_KIT_SOURCE_ID) return includeImmersionSource ? this.renderImmersionKitMount() : '';
                if (grouped.has(sourceId)) {
                    if (renderedDictionaries) return '';
                    renderedDictionaries = true;
                    return renderLocalDefinitionSourcesSection(
                        dictionarySourceIds,
                        grouped,
                        this.settings,
                        (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                        name => this.dictionaryLabel(name),
                        card,
                    );
                }
                return '';
            }),
        ]
            .filter(Boolean);
        return sections.length
            ? `<div class="jpdb-reader-definition-stack">${sections.join('')}</div>`
            : `<div class="jpdb-reader-help jpdb-reader-no-definitions">${uiText(this.settings.interfaceLanguage, 'noDefinitions')}</div>`;
    }

    private renderFallbackSetupSource(card: JPDBCard): string {
        void card;
        return '';
    }

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceState.attributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID), false)}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private shouldRenderKanjiImmersionKit(): boolean {
        return this.settings.immersionKitEnabled && this.settings.kanjiImmersionKitEnabled;
    }

    private installKanjiImmersionExamples(root: HTMLElement, card: JPDBCard, relatedQueries: string[] = []): void {
        if (!this.shouldRenderKanjiImmersionKit()) return;
        this.immersionPopover.installLazyLoad(root, card, relatedQueries.length ? { relatedQueries } : undefined);
    }

    private installJpdbPageImmersionExamples(root: HTMLElement, card: JPDBCard, relatedQueries: string[] = []): void {
        if (!this.settings.immersionKitEnabled) return;
        this.immersionPopover.installLazyLoad(root, card, relatedQueries.length ? { relatedQueries } : undefined);
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        if (!this.isCurrentPopoverRoot(popover)) return;
        const plan = nestedTextParsePlan(popover, 120);
        if (!plan || nestedParseAlreadyScheduled(popover, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(popover, plan, () => this.isCurrentPopoverRoot(popover));
    }

    private async parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void> {
        if (!this.isJpdbPageAddonRoot(root)) return;
        clearNestedParseState(root);
        const plan = nestedTextParsePlan(root, 120);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(root, plan, () => this.isJpdbPageAddonRoot(root));
    }

    private isJpdbPageAddonRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && root.matches('[data-yomu-jpdb-addon]'));
    }

    private async parseSettingsJapanese(form: HTMLFormElement): Promise<void> {
        if (!this.isCurrentSettingsRoot(form)) return;
        unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup]' });
        clearNestedParseState(form);
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.canParseJapanese()) return;
        const plan = nestedSettingsTextParsePlan(form, 640);
        if (!plan) return;
        await this.parseNestedJapaneseContent(form, plan, () => this.isCurrentSettingsRoot(form), {
            includeLocalPitch: false,
            skipJpdb: true,
        });
    }

    private async parseNestedJapaneseContent(
        root: HTMLElement,
        plan: NestedParsePlan,
        isCurrent: () => boolean,
        options: ReaderParserParseOptions = {},
    ): Promise<void> {
        const parseLoadingId = `${Date.now()}:${Math.random()}`;
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        root.dataset.jpdbReaderParseLoadingId = parseLoadingId;
        try {
            const parsed = await this.loadParsedNestedJapaneseContent(plan.targets.map(target => target.text), {
                includeLocalPitch: false,
                jpdbTimeoutMs: 1_200,
                ...options,
            });
            if (!isCurrent()
                || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey
                || root.dataset.jpdbReaderParseLoadingId !== parseLoadingId) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            highlightCardTargetScopes(root);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
            this.afterNestedJapaneseParsed(parsed, options.skipJpdb ? { publicLookup: false } : undefined);
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey, parseLoadingId);
        }
    }

    private loadParsedNestedJapaneseContent(texts: string[], options: ReaderParserParseOptions = {}): Promise<JPDBToken[][]> {
        const parseOptions = {
            jpdbTimeoutMs: options.jpdbTimeoutMs ?? 1_200,
            allowJpdbTimeoutFallback: options.allowJpdbTimeoutFallback ?? false,
            includeLocalPitch: options.includeLocalPitch ?? false,
            skipJpdb: options.skipJpdb ?? false,
            requireJpdb: options.requireJpdb ?? !options.skipJpdb,
            allowSegmentedFallback: options.allowSegmentedFallback ?? false,
        };
        const key = this.nestedParseContentCacheKey(texts, parseOptions);
        const now = Date.now();
        const cached = this.nestedParseContentCache.get(key);
        if (cached && cached.expiresAt > now) {
            this.nestedParseContentCache.delete(key);
            this.nestedParseContentCache.set(key, cached);
            return cached.promise;
        }
        if (cached) this.nestedParseContentCache.delete(key);

        const promise = this.parseJapanese(texts, parseOptions).catch(error => {
            if (this.nestedParseContentCache.get(key)?.promise === promise) this.nestedParseContentCache.delete(key);
            throw error;
        });
        this.nestedParseContentCache.set(key, { expiresAt: now + NESTED_PARSE_CONTENT_CACHE_TTL_MS, promise });
        this.pruneNestedParseContentCache(now);
        return promise;
    }

    private nestedParseContentCacheKey(
        texts: string[],
        options: Required<ReaderParserParseOptions>,
    ): string {
        return JSON.stringify({
            texts,
            options,
            settings: {
                apiKey: Boolean(this.settings.apiKey.trim()),
                localDictionariesEnabled: this.settings.localDictionariesEnabled,
                dictionaries: this.settings.dictionaryPreferences.map(preference => ({
                    name: preference.name,
                    enabled: preference.enabled,
                    priority: preference.priority,
                })),
            },
        });
    }

    private pruneNestedParseContentCache(now: number): void {
        for (const [key, entry] of this.nestedParseContentCache) {
            if (entry.expiresAt <= now) this.nestedParseContentCache.delete(key);
        }
        while (this.nestedParseContentCache.size > NESTED_PARSE_CONTENT_CACHE_LIMIT) {
            const oldest = this.nestedParseContentCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.nestedParseContentCache.delete(oldest);
        }
    }

    private afterNestedJapaneseParsed(parsed: JPDBToken[][], pitchOptions?: PitchEnrichmentOptions): void {
        const tokens = parsed.flat();
        this.preloadTermAudioForTokens(tokens);
        void this.enrichPitchWords(tokens, pitchOptions ?? { publicLookupLimit: NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT });
        void this.enrichAnkiWords(tokens);
    }

    private isCurrentPopoverRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activePopover && (root === this.activePopover || this.activePopover.contains(root)));
    }

    private isCurrentSettingsRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activePopover === root && root.classList.contains('jpdb-reader-settings'));
    }

    private async enrichAnkiWords(tokens: JPDBToken[]): Promise<void> {
        if (!shouldLookupAnkiStatus(this.settings)) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, ANKI_ENRICHMENT_LIMIT);
        const lookups = typeof this.anki.findExistingCardsBatch === 'function'
            ? await this.anki.findExistingCardsBatch(uniqueTokens.map(token => token.card))
            : await this.findAnkiCardsIndividually(uniqueTokens);
        uniqueTokens.forEach((token, index) => {
            this.applyAnkiLookupToRenderedWords(token.card, lookups[index] ?? { state: 'not-in-deck', notes: [], primary: null });
        });
    }

    private async findAnkiCardsIndividually(tokens: JPDBToken[]): Promise<AnkiLookupResult[]> {
        const lookups: AnkiLookupResult[] = Array(tokens.length).fill(null).map(() => ({ state: 'not-in-deck', notes: [], primary: null }));
        await runLimited(tokens, BACKGROUND_ENRICHMENT_CONCURRENCY, async (token, index) => {
            lookups[index] = await this.anki.findExistingCards(token.card);
        });
        return lookups;
    }

    private async enrichPitchWords(tokens: JPDBToken[], options: PitchEnrichmentOptions = {}): Promise<void> {
        if (this.isDestroyed || !this.settings.showPitchAccent) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            if (token.card.pitchAccent.length) return false;
            if (isLowValuePitchEnrichmentToken(token)) return false;
            if (!token.card.spelling.trim()) return false;
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((first, second) => pitchEnrichmentPriority(first) - pitchEnrichmentPriority(second));

        if (options.publicLookup === false) {
            await runLimited(uniqueTokens.slice(0, PITCH_ENRICHMENT_LIMIT), BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, options));
            return;
        }

        if (options.urgent) {
            const urgentTokens = uniqueTokens.map(token => this.takeQueuedPitchEnrichmentToken(cardKey(token.card)) ?? token);
            await runLimited(urgentTokens, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, options));
            return;
        }

        if (typeof options.publicLookupLimit === 'number') {
            const publicLookupLimit = Math.max(0, Math.floor(options.publicLookupLimit));
            const publicTokens = uniqueTokens.slice(0, publicLookupLimit);
            const localOnlyTokens = uniqueTokens.slice(publicLookupLimit);
            const localOnly = runLimited(
                localOnlyTokens,
                BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
                token => this.enrichPitchToken(token, { publicLookup: false }),
            );
            if (!publicTokens.length) {
                await localOnly;
                return;
            }
            this.queuePitchEnrichmentTokens(publicTokens, options);
            await Promise.all([localOnly, this.drainPitchEnrichmentQueue()]);
            return;
        }

        this.queuePitchEnrichmentTokens(uniqueTokens, options);
        await this.drainPitchEnrichmentQueue();
    }

    private queuePitchEnrichmentTokens(tokens: JPDBToken[], options: { urgent?: boolean } = {}): void {
        for (const token of tokens) {
            const key = cardKey(token.card);
            if (this.pitchEnrichmentQueuedKeys.has(key)) {
                if (options.urgent) this.promoteQueuedPitchEnrichmentToken(key);
                continue;
            }
            this.pitchEnrichmentQueuedKeys.add(key);
            if (options.urgent) this.pitchEnrichmentUrgentKeys.add(key);
            this.pitchEnrichmentQueue.push(token);
        }
        this.sortPitchEnrichmentQueue();
        while (this.pitchEnrichmentQueue.length > PITCH_ENRICHMENT_QUEUE_LIMIT) {
            const dropped = this.pitchEnrichmentQueue.pop();
            if (dropped) this.forgetQueuedPitchEnrichmentToken(cardKey(dropped.card));
        }
    }

    private promoteQueuedPitchEnrichmentToken(key: string): void {
        const index = this.pitchEnrichmentQueue.findIndex(token => cardKey(token.card) === key);
        if (index < 0) return;
        this.pitchEnrichmentUrgentKeys.add(key);
        this.sortPitchEnrichmentQueue();
    }

    private takeQueuedPitchEnrichmentToken(key: string): JPDBToken | undefined {
        const index = this.pitchEnrichmentQueue.findIndex(token => cardKey(token.card) === key);
        if (index < 0) return undefined;
        const [token] = this.pitchEnrichmentQueue.splice(index, 1);
        this.forgetQueuedPitchEnrichmentToken(key);
        return token;
    }

    private sortPitchEnrichmentQueue(): void {
        this.pitchEnrichmentQueue.sort((first, second) => this.pitchQueuePriority(first) - this.pitchQueuePriority(second));
    }

    private pitchQueuePriority(token: JPDBToken): number {
        return this.pitchEnrichmentUrgentKeys.has(cardKey(token.card))
            ? -1
            : pitchEnrichmentPriority(token);
    }

    private forgetQueuedPitchEnrichmentToken(key: string): void {
        this.pitchEnrichmentQueuedKeys.delete(key);
        this.pitchEnrichmentUrgentKeys.delete(key);
    }

    private async drainPitchEnrichmentQueue(): Promise<void> {
        if (this.pitchEnrichmentDrain) return this.pitchEnrichmentDrain;
        this.pitchEnrichmentDrain = this.runPitchEnrichmentQueue().finally(() => {
            this.pitchEnrichmentDrain = undefined;
            if (!this.isDestroyed && this.settings.showPitchAccent && this.pitchEnrichmentQueue.length) void this.drainPitchEnrichmentQueue();
        });
        return this.pitchEnrichmentDrain;
    }

    private async runPitchEnrichmentQueue(): Promise<void> {
        while (!this.isDestroyed && this.settings.showPitchAccent && this.pitchEnrichmentQueue.length) {
            const batch = this.pitchEnrichmentQueue.splice(0, PITCH_ENRICHMENT_LIMIT);
            batch.forEach(token => this.forgetQueuedPitchEnrichmentToken(cardKey(token.card)));
            await runLimited(batch, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token));
            if (this.pitchEnrichmentQueue.length) await this.waitForIdle();
        }
    }

    private async enrichPitchToken(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookup'> = {}): Promise<void> {
        const fallback = token.card;
        let card = fallback;
        if (!card.pitchAccent.length) {
            const localPitch = await this.localPitchAccentForCard(card);
            if (localPitch.length) card.pitchAccent = localPitch;
        }
        if (!card.pitchAccent.length && options.publicLookup !== false) card = await this.resolveRenderedFallbackVocabulary(fallback) ?? fallback;
        if (!card.pitchAccent.length && card !== fallback) {
            const localPitch = await this.localPitchAccentForCard(card);
            if (localPitch.length) card.pitchAccent = localPitch;
        }
        const pitchAccent = card.pitchAccent.length
            ? card.pitchAccent
            : options.publicLookup === false
                ? []
                : await this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(() => []);
        if (pitchAccent.length && !card.pitchAccent.length) card.pitchAccent = pitchAccent;
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (card !== fallback) {
            this.applyPublicVocabularyToRenderedWords(fallback, card, pitchClass || 'unknown');
            token.card = card;
            token.pitchClass = pitchClass;
            return;
        }
        if (pitchClass) {
            token.pitchClass = pitchClass;
            this.applyPitchAccentToRenderedWords(card, pitchClass);
        }
    }

    private clearPitchEnrichmentQueue(): void {
        this.pitchEnrichmentQueue = [];
        this.pitchEnrichmentQueuedKeys.clear();
        this.pitchEnrichmentUrgentKeys.clear();
    }

    private async localPitchAccentForCard(card: JPDBCard): Promise<string[]> {
        const pattern = await this.localPitchPatternForCard(card);
        return pattern ? [pattern] : [];
    }

    private async localPitchPatternForCard(card: JPDBCard): Promise<string> {
        if (!this.settings.localDictionariesEnabled || !card.spelling.trim()) return '';
        const key = this.localPitchEnrichmentCacheKey(card);
        const cached = this.pitchEnrichmentLocalCache.get(key);
        if (cached) return cached;
        const promise = this.dictionaries.lookupTermMeta(card.spelling, PITCH_LOCAL_META_LIMIT, this.settings.dictionaryPreferences)
            .then(metaEntries => localPitchPatternFromMeta(card.reading, metaEntries))
            .catch(error => {
                log.warn('Local pitch enrichment failed', { term: card.spelling }, error);
                return '';
            });
        this.rememberLocalPitchEnrichment(key, promise);
        return promise;
    }

    private localPitchEnrichmentCacheKey(card: JPDBCard): string {
        return JSON.stringify({
            spelling: card.spelling,
            reading: card.reading,
            dictionaries: this.settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        });
    }

    private rememberLocalPitchEnrichment(key: string, promise: Promise<string>): void {
        this.pitchEnrichmentLocalCache.set(key, promise);
        while (this.pitchEnrichmentLocalCache.size > PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT) {
            const oldest = this.pitchEnrichmentLocalCache.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.pitchEnrichmentLocalCache.delete(oldest);
        }
    }

    private async resolveRenderedFallbackVocabulary(card: JPDBCard): Promise<JPDBCard | undefined> {
        if (card.source !== 'fallback') return undefined;
        const publicCard = await this.publicLookupCard(card.spelling, true);
        if (!publicCard) return undefined;
        if (!publicCard.pitchAccent.length) {
            publicCard.pitchAccent = await this.jpdbPublicPitch.lookup(publicCard.spelling, publicCard.reading).catch(() => []);
        }
        this.parser.cacheCards([publicCard]);
        return publicCard;
    }

    private preloadTermAudioForTokens(tokens: JPDBToken[]): void {
        if (!this.canPreloadBackgroundReaderAudio()) return;
        this.queueTermAudioPreloads(tokens);
    }

    private queueTermAudioPreloads(tokens: JPDBToken[]): number {
        let queued = 0;
        for (const token of tokens) {
            if (this.preloadTermAudioForToken(token)) queued++;
            if (queued >= TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        return queued;
    }

    private preloadTermAudioForToken(token: JPDBToken): boolean {
        if (!isUsefulImmersionPreloadQuery(token.card.spelling)) return false;
        const key = cardKey(token.card);
        if (this.preloadedTermAudioKeys.has(key)) return false;
        this.rememberPreloadedTermAudioKey(key);
        this.audio.preload(token.card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: false });
        return true;
    }

    private rememberPreloadedTermAudioKey(key: string): void {
        this.preloadedTermAudioKeys.add(key);
        while (this.preloadedTermAudioKeys.size > PRELOADED_TERM_AUDIO_KEY_LIMIT) {
            const oldest = this.preloadedTermAudioKeys.values().next().value;
            if (typeof oldest !== 'string') break;
            this.preloadedTermAudioKeys.delete(oldest);
        }
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private kanjiSourceTitle(sourceId: string): string {
        if (sourceId === KANJI_STROKE_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'strokePractice');
        if (sourceId === KANJI_JPDB_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'readingsComponents');
        if (sourceId === KANJI_RTK_SOURCE_ID) return 'RTK';
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'kanjiDictionaries');
        if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'sourceNameWordsUsingKanji');
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'originStructure');
        return kanjiSourceLabel(this.settings, sourceId);
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void {
        if (!ankiLookup.primary) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.pauseAutoScanObserver(() => {
            document.querySelectorAll<HTMLElement>(selector).forEach(word => {
                word.classList.add(`anki-${ankiLookup.state}`);
                word.dataset.ankiState = ankiLookup.state;
                word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
                word.title = `Anki: ${cardStateLabel(ankiLookup.state, this.settings.interfaceLanguage)}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
            });
        });
    }

    private applyPitchAccentToRenderedWords(card: JPDBCard, pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling)): void {
        if (!pitchClass) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.pauseAutoScanObserver(() => {
            document.querySelectorAll<HTMLElement>(selector).forEach(word => {
                Array.from(word.classList)
                    .filter(className => className.startsWith('jpdb-pitch-'))
                    .forEach(className => word.classList.remove(className));
                word.classList.add(`jpdb-pitch-${pitchClass}`);
                word.dataset.pitchClass = pitchClass;
            });
        });
    }

    private applyPublicVocabularyToRenderedWords(fallback: JPDBCard, card: JPDBCard, pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown'): void {
        const selector = `.jpdb-reader-word[data-vid="${fallback.vid}"][data-sid="${fallback.sid}"]`;
        this.pauseAutoScanObserver(() => {
            document.querySelectorAll<HTMLElement>(selector).forEach(word => {
                Array.from(word.classList)
                    .filter(className => className.startsWith('jpdb-pitch-'))
                    .forEach(className => word.classList.remove(className));
                word.classList.add(`jpdb-pitch-${pitchClass}`);
                word.dataset.vid = String(card.vid);
                word.dataset.sid = String(card.sid);
                word.dataset.expression = card.spelling;
                word.dataset.reading = card.reading;
                word.dataset.pitchClass = pitchClass;
            });
        });
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const anchor = this.connectedActivePopoverAnchor();
        const trigger = this.activeTextLookupTrigger();
        const done = log.time('cardAction', { action, term: card.spelling, trigger });
        try {
            const shouldRefresh = await this.cardActions.perform(action, button, card, sentence);
            if (shouldRefresh) await this.showCard(card, sentence, anchor, { autoPlay: false, trigger, navigation: 'preserve', preservePosition: true });
            log.info('Card action completed', { action, term: card.spelling });
        } catch (error) {
            log.warn('Card action failed', { action, term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : uiText(this.settings.interfaceLanguage, 'actionFailed'));
        } finally {
            done();
            button.disabled = false;
        }
    }

    private connectedActivePopoverAnchor(): HTMLElement | undefined {
        return this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
    }

    private async resolveMiningContext(card: JPDBCard, sentence?: string): Promise<MiningContext> {
        const activeContext = this.immersionPopover.activeContextFor(card);
        const storedImmersionContext = this.immersionPopover.storedContextFor(card);
        const anchor = this.activePopoverAnchor;
        const context = await resolveStoredMiningContext({
            term: card.spelling,
            sentence,
            settings: this.settings,
            activeContext,
            storedContext: storedImmersionContext,
            sourceKind: inferMiningSourceKind({
                hostname: location.hostname,
                hasVideo: Boolean(anchor?.closest('.jpdb-subtitle-player, .jpdb-subtitle-list')) || Boolean(document.querySelector('video')),
            }),
            imageDataUrl: this.settings.ankiCaptureScreenshot ? this.ocr.captureSourceImageForElement(anchor ?? null) : undefined,
            videoImageDataUrl: this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : undefined,
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit.fetchDataUrl(imageUrl, timeoutMs, this.settings.corsProxyUrl),
            fetchAudioDataUrl: (audioUrls, timeoutMs) => this.immersionKit.fetchDataUrl(audioUrls, timeoutMs, this.settings.corsProxyUrl),
        });
        return context;
    }

    private showSettings(panel?: string): void {
        this.getSettingsDialog().open(panel);
    }

    private getSettingsDialog(): SettingsDialogController {
        this.settingsDialog ??= new SettingsDialogController({
            getSettings: () => this.settings,
            setSettings: settings => { this.settings = settings; },
            jpdb: this.jpdb,
            dictionaries: this.dictionaries,
            anki: this.anki,
            audio: this.audio,
            subtitles: this.subtitles,
            ocr: this.ocr,
            youtube: this.youtube,
            createBackdrop: () => createReaderBackdrop(() => this.dismiss()),
            mountDialog: (backdrop, form) => this.mountSettingsDialog(backdrop, form),
            dismiss: () => this.dismiss(),
            toast: message => this.toast(message),
            applyTheme: settings => this.applyTheme(settings),
            applyAccentColor: color => this.applyAccentColor(color),
            applyWordColors: settings => this.applyWordColors(settings),
            lookupText: (text, sentence, anchor) => this.lookupText(text, sentence || text, { anchor, stackOverSettings: true }),
            parseSettingsJapanese: form => this.parseSettingsJapanese(form),
            installFab: () => this.installFab(),
            refreshDictionaryStyles: () => this.refreshDictionaryStyles(),
            scheduleDictionaryRescan: () => this.scheduleDictionaryRescan(),
            refreshNewTabIfCurrent: () => undefined,
            clearDictionarySourceOpenOverrides: () => this.dictionarySourceState.clear(),
            resetAllData: () => this.factoryReset.resetAllData(),
            beginSettingsPreview: (accent, language, theme) => {
                this.settingsPreviewOriginalAccent = accent;
                this.settingsPreviewOriginalLanguage = language;
                this.settingsPreviewOriginalTheme = theme;
            },
            clearSettingsPreview: () => {
                this.settingsPreviewOriginalAccent = undefined;
                this.settingsPreviewOriginalLanguage = undefined;
                this.settingsPreviewOriginalTheme = undefined;
            },
        });
        return this.settingsDialog;
    }

    private mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void {
        this.dismiss({ forceAll: true });
        document.body.append(backdrop, form);
        this.activeBackdrop = backdrop;
        this.activePopover = form;
        form.focus();
    }

    private createPopover(): HTMLElement {
        return createReaderPopover(APP_NAME, this.settings);
    }

    private mountPopover(
        popover: HTMLElement,
        anchor?: HTMLElement,
        options: MountPopoverOptions = {},
    ): void {
        const settingsStack = this.settingsStackForMountedPopover(options);
        if (settingsStack) forceReaderPopoverSurface(popover, this.settings);
        const state = this.popoverMountState(anchor, { ...options, stackOverSettings: Boolean(settingsStack) });
        if (settingsStack) {
            this.prepareSettingsStackedPopover(settingsStack);
        } else {
            this.dismiss({ suppressHoverTarget: false, preserveNavigation: true, preserveHoverGeneration: state.mode === 'hover' });
        }
        this.appendMountedPopover(popover, state);
        this.activateMountedPopover(popover, state, options);
        this.dictionarySourceState.installTracking(popover);
        this.installMountedPopoverSurface(popover, state);
        this.finishMountedPopoverLifecycle(popover, state.mode);
    }

    private popoverMountState(anchor: HTMLElement | undefined, options: MountPopoverOptions): PopoverMountState {
        const mode = options.mode ?? 'modal';
        const backdrop = options.stackOverSettings || mode === 'hover' || shouldUseSheet(this.settings) || !this.settings.popoverBackdropEnabled
            ? undefined
            : createReaderBackdrop(() => this.dismiss());
        const resolvedAnchor = connectedElement(anchor) ?? connectedElement(this.activePopoverAnchor);
        const anchorRect = popoverAnchorRect(resolvedAnchor, this.activePopoverAnchorRect);
        const previousPopoverRect = options.preservePosition ? this.activePopover?.getBoundingClientRect() : undefined;
        const previousHoverPointerPosition = this.hoverPopoverPointerPosition;
        return { mode, backdrop, resolvedAnchor, anchorRect, previousPopoverRect, previousHoverPointerPosition };
    }

    private settingsStackForMountedPopover(options: MountPopoverOptions): SettingsDialogStack | undefined {
        return this.activeSettingsLookupStack() ?? (options.stackOverSettings ? this.currentSettingsDialogStack() : undefined);
    }

    private activeSettingsLookupStack(): SettingsDialogStack | undefined {
        if (!this.stackedSettingsDialog) return undefined;
        return this.activePopover !== this.stackedSettingsDialog.form ? this.stackedSettingsDialog : undefined;
    }

    private currentSettingsDialogStack(): SettingsDialogStack | undefined {
        const form = this.activePopover?.classList.contains('jpdb-reader-settings') ? this.activePopover : undefined;
        if (!form?.isConnected) return undefined;
        const backdrop = this.activeBackdrop?.classList.contains('jpdb-reader-backdrop') ? this.activeBackdrop : undefined;
        return { form, backdrop };
    }

    private prepareSettingsStackedPopover(stack: SettingsDialogStack): void {
        this.stackedSettingsDialog = stack;
        if (this.activePopover && this.activePopover !== stack.form) {
            this.immersionPopover.abortPendingRequests(this.activePopover);
            this.activePopover.remove();
        }
        if (this.activeBackdrop && this.activeBackdrop !== stack.backdrop) this.activeBackdrop.remove();
        this.activePopoverResizeObserver?.disconnect();
        this.activePopoverResizeObserver = undefined;
        this.activeBackdrop = undefined;
    }

    private appendMountedPopover(popover: HTMLElement, state: PopoverMountState): void {
        const useBackdrop = Boolean(state.backdrop);
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (state.backdrop) document.body.append(state.backdrop, popover);
        else document.body.append(popover);
    }

    private activateMountedPopover(popover: HTMLElement, state: PopoverMountState, options: MountPopoverOptions): void {
        this.activeBackdrop = state.backdrop;
        this.activePopover = popover;
        this.activePopoverMode = state.mode;
        this.activePopoverAnchor = state.resolvedAnchor;
        this.activePopoverAnchorRect = state.anchorRect;
        this.activePopoverPositionLocked = shouldLockMountedPopoverPosition(popover, state);
        this.activeHoverWord = state.mode === 'hover' && !options.pointerTextLookup ? state.resolvedAnchor : undefined;
        this.activeHoverLookupKey = state.mode === 'hover' ? options.hoverLookupKey ?? '' : '';
        this.activePointerTextLookup = state.mode === 'hover' ? options.pointerTextLookup : undefined;
        this.hoverPopoverPointerPosition = mountedHoverPointerPosition(state, this.lastPointerPosition);
        popover.classList.toggle('jpdb-reader-sheet-sticky', this.isStickyMountedSheet(popover, state));
        this.nativeTitleGuard.suppressForPopover(popover, state.resolvedAnchor);
    }

    private installMountedPopoverSurface(popover: HTMLElement, state: PopoverMountState): void {
        if (!popover.classList.contains('jpdb-reader-sheet')) {
            this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
            this.activePopoverResizeObserver.observe(popover);
            this.installPopoverBodyStabilizers(popover);
            if (state.mode !== 'hover' && state.previousPopoverRect) {
                this.lockActivePopoverPosition(state.previousPopoverRect);
                this.placeActivePopoverWithoutMoving(popover, state.previousPopoverRect);
                this.syncActivePopoverFixedHeight();
            }
            else {
                this.activePopoverPositionLocked = false;
                this.activePopoverLockedPosition = undefined;
                this.repositionActivePopover();
                if (state.mode !== 'hover') this.lockActivePopoverPosition(popover.getBoundingClientRect());
            }
            requestAnimationFrame(() => this.repositionActivePopover());
        } else {
            installSheetHandle(popover, () => this.dismiss(), uiText(this.settings.interfaceLanguage, 'resizeLookupSheet'));
            if (this.isStickyMountedSheet(popover, state)) {
                installSheetCloseButton(popover, () => this.dismiss(), uiText(this.settings.interfaceLanguage, 'closeDrawer'));
            }
        }
    }

    private isStickyMountedSheet(popover: HTMLElement, state: PopoverMountState): boolean {
        return state.mode === 'modal'
            && this.settings.stickyBottomSheet
            && popover.classList.contains('jpdb-reader-sheet');
    }

    private finishMountedPopoverLifecycle(popover: HTMLElement, mode: 'modal' | 'hover'): void {
        if (mode === 'hover') {
            this.installHoverPopoverLifecycle(popover);
            this.startHoverWatch();
            return;
        }
        popover.focus();
    }

    private repositionActivePopover(): void {
        const popover = this.repositionableActivePopover();
        if (!popover) return;
        this.nativeTitleGuard.refresh(popover, this.activePopoverAnchor);
        const scrollBody = this.popoverScrollBody(popover);
        const scrollTop = scrollBody.scrollTop;
        this.prepareActivePopoverForPositioning(popover);
        if (this.repositionLockedActivePopoverIfNeeded(popover)) {
            this.restorePopoverScrollTop(scrollBody, scrollTop);
            return;
        }
        this.repositionUnlockedActivePopover(popover);
        this.restorePopoverScrollTop(scrollBody, scrollTop);
    }

    private prepareActivePopoverForPositioning(popover: HTMLElement): void {
        if (this.shouldUseFixedModalHeight(popover)) popover.style.height = '';
    }

    private repositionLockedActivePopoverIfNeeded(popover: HTMLElement): boolean {
        if (!this.activePopoverPositionLocked) return false;
        this.repositionLockedActivePopover(popover);
        return true;
    }

    private repositionUnlockedActivePopover(popover: HTMLElement): void {
        this.refreshActivePopoverAnchorRect();
        positionPopover(
            popover,
            this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
            this.activePopoverAnchorRect,
            {
                followPoint: this.shouldFollowActiveHoverPointer() ? this.hoverPopoverPointerPosition : undefined,
                maxHeight: popoverMaxHeightSetting(this.settings),
                preferBefore: this.shouldPreferActiveHoverPopoverBefore(),
            },
        );
        this.syncActivePopoverFixedHeight();
    }

    private repositionableActivePopover(): HTMLElement | null {
        if (!this.activePopover) return null;
        if (this.activePopover.classList.contains('jpdb-reader-sheet')) return null;
        return this.activePopover;
    }

    private repositionLockedActivePopover(popover: HTMLElement): void {
        if (!this.activePopoverLockedPosition) this.lockActivePopoverPosition(popover.getBoundingClientRect());
        this.placeActivePopoverWithoutMoving(popover, this.activePopoverLockedPosition ?? popover.getBoundingClientRect());
        this.syncActivePopoverFixedHeight();
    }

    private lockActivePopoverPosition(rect: Pick<DOMRect, 'left' | 'top'>): void {
        this.activePopoverPositionLocked = true;
        this.activePopoverLockedPosition = { left: rect.left, top: rect.top };
    }

    private placeActivePopoverWithoutMoving(popover: HTMLElement, rect: Pick<DOMRect, 'left' | 'top'>): void {
        const maxHeight = this.activePopoverMaxHeightAtTop(rect.top);
        popover.style.left = `${rect.left}px`;
        popover.style.top = `${rect.top}px`;
        popover.style.maxHeight = `${maxHeight}px`;
    }

    private activePopoverMaxHeightAtTop(top: number): number {
        const margin = 8;
        const availableHeight = Math.max(0, window.innerHeight - top - margin);
        const configuredMaxHeight = popoverMaxHeightSetting(this.settings);
        return configuredMaxHeight ? Math.min(availableHeight, configuredMaxHeight) : availableHeight;
    }

    private refreshActivePopoverAnchorRect(): void {
        if (!this.activePopoverAnchor?.isConnected) return;
        const rect = this.activePopoverAnchor.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
    }

    private shouldFollowActiveHoverPointer(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.hoverPopoverPointerPosition);
    }

    private shouldPreferActiveHoverPopoverBefore(): boolean {
        return this.shouldFollowActiveHoverPointer();
    }

    private shouldUseFixedModalHeight(popover: HTMLElement): boolean {
        return this.activePopoverMode !== 'hover'
            && this.settings.popoverHeightMode === 'fixed'
            && !popover.classList.contains('jpdb-reader-sheet')
            && Boolean(popover.querySelector('.jpdb-reader-popover-body'));
    }

    private syncActivePopoverFixedHeight(): void {
        const popover = this.activePopover;
        if (!popover) return;
        if (!this.shouldUseFixedModalHeight(popover)) {
            popover.style.height = '';
            return;
        }
        const maxHeight = Number.parseFloat(popover.style.maxHeight);
        if (Number.isFinite(maxHeight) && maxHeight > 0) popover.style.height = `${maxHeight}px`;
    }

    private installPopoverBodyStabilizers(popover: HTMLElement): void {
        if (popover.dataset.jpdbReaderBodyStabilizers === 'true') return;
        popover.dataset.jpdbReaderBodyStabilizers = 'true';
        popover.addEventListener('click', event => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            const summary = target?.closest<HTMLElement>('summary');
            if (!summary || !popover.contains(summary)) return;
            this.stabilizePopoverBodyAround(popover, summary);
        }, true);
    }

    private stabilizePopoverBodyAround(popover: HTMLElement, anchor: HTMLElement): void {
        const scrollBody = this.popoverScrollBody(popover);
        const scrollTop = scrollBody.scrollTop;
        const anchorTop = anchor.getBoundingClientRect().top;
        requestAnimationFrame(() => {
            if (!popover.isConnected || !anchor.isConnected) return;
            const delta = anchor.getBoundingClientRect().top - anchorTop;
            if (Math.abs(delta) > 0.5) scrollBody.scrollTop = scrollTop + delta;
        });
    }

    private popoverScrollBody(popover: HTMLElement): HTMLElement {
        return popover.querySelector<HTMLElement>('.jpdb-reader-popover-body') ?? popover;
    }

    private restorePopoverScrollTop(scrollBody: HTMLElement, scrollTop: number): void {
        if (scrollBody.scrollTop !== scrollTop) scrollBody.scrollTop = scrollTop;
    }

    private installHoverPopoverLifecycle(popover: HTMLElement): void {
        popover.addEventListener('pointerenter', event => {
            this.lastPointerPosition = { x: event.clientX, y: event.clientY };
            this.cancelHoverClose();
        });
        popover.addEventListener('pointerleave', event => {
            this.lastPointerPosition = { x: event.clientX, y: event.clientY };
            if (this.activeHoverWord && this.isInsideNode(event.relatedTarget as Node | null, this.activeHoverWord)) return;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        });
    }

    private startHoverWatch(): void {
        window.clearTimeout(this.hoverWatchTimer);
        const tick = () => {
            this.hoverWatchTimer = undefined;
            if (this.activePopoverMode !== 'hover') return;
            if (!this.isHoverContextActive({ ignorePointerPosition: true })) {
                this.dismiss({ suppressHoverTarget: false });
                return;
            }
            this.hoverWatchTimer = window.setTimeout(tick, Math.max(90, this.settings.hoverCloseDelayMs));
        };
        this.hoverWatchTimer = window.setTimeout(tick, Math.max(90, this.settings.hoverCloseDelayMs));
    }

    private dismiss(options: DismissOptions = { suppressHoverTarget: true }): void {
        if (!options.forceAll && this.shouldDismissStackedLookupOnly()) {
            this.dismissStackedLookupOverSettings(options);
            return;
        }
        const hadSettingsDialog = Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
        if (this.activePopover) this.immersionPopover.abortPendingRequests(this.activePopover);
        this.clearHoverDismissState(options);
        this.audio.stop();
        this.immersionPopover.stopAudio();
        this.updateSuppressedHoverTarget(options);
        this.cardRenderRequest++;
        this.restoreSettingsPreviewState();
        this.removeReaderDialogNodes();
        this.stackedSettingsDialog = undefined;
        this.clearActivePopoverState();
        if (!options.preserveNavigation) {
            this.navigation.clearWord();
            this.navigation.clearKanji();
        }
        if (hadSettingsDialog) this.schedulePendingDictionaryRescan();
    }

    private shouldDismissStackedLookupOnly(): boolean {
        return Boolean(this.stackedSettingsDialog && this.activePopover && this.activePopover !== this.stackedSettingsDialog.form);
    }

    private dismissStackedLookupOverSettings(options: DismissOptions): void {
        if (this.activePopover) this.immersionPopover.abortPendingRequests(this.activePopover);
        this.clearHoverDismissState(options);
        this.audio.stop();
        this.immersionPopover.stopAudio();
        this.updateSuppressedHoverTarget(options);
        this.cardRenderRequest++;
        this.nativeTitleGuard.restore();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        const stack = this.stackedSettingsDialog;
        this.clearActivePopoverState();
        if (stack?.form.isConnected) {
            this.activePopover = stack.form;
            this.activeBackdrop = stack.backdrop;
            stack.form.focus();
        }
        this.stackedSettingsDialog = undefined;
        if (!options.preserveNavigation) {
            this.navigation.clearWord();
            this.navigation.clearKanji();
        }
    }

    private clearHoverDismissState(options: { preserveHoverGeneration?: boolean }): void {
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.hoverLookupTimer = undefined;
        this.hoverCloseTimer = undefined;
        this.hoverWatchTimer = undefined;
        this.hoverPopoverPointerPosition = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        this.hoverLookupInFlightKey = '';
        if (!options.preserveHoverGeneration) this.nextHoverLookupGeneration();
    }

    private updateSuppressedHoverTarget(options: { suppressHoverTarget?: boolean }): void {
        const suppressTarget = this.activePopoverMode === 'hover' ? this.activeHoverWord : this.activePopoverAnchor;
        if (options.suppressHoverTarget && suppressTarget?.isConnected && suppressTarget.classList.contains('jpdb-reader-word')) {
            this.suppressedHoverWord = suppressTarget;
            this.suppressedHoverLookupKey = this.hoverLookupKeyForWord(suppressTarget);
        } else {
            this.suppressedHoverLookupKey = '';
        }
    }

    private restoreSettingsPreviewState(): void {
        if (!this.hasActiveSettingsPreviewPopover()) {
            this.clearSettingsPreviewOriginals();
            return;
        }
        if (this.settingsPreviewOriginalAccent !== undefined) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalLanguage !== undefined) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        if (this.settingsPreviewOriginalTheme !== undefined) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
        }
        this.applyTheme();
        this.clearSettingsPreviewOriginals();
    }

    private clearSettingsPreviewOriginals(): void {
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalLanguage = undefined;
        this.settingsPreviewOriginalTheme = undefined;
    }

    private hasActiveSettingsPreviewPopover(): boolean {
        return Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
    }

    private removeReaderDialogNodes(): void {
        this.nativeTitleGuard.restore();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
    }

    private clearActivePopoverState(): void {
        this.activePopover = undefined;
        this.activeBackdrop = undefined;
        this.activePopoverResizeObserver = undefined;
        this.activePopoverPositionLocked = false;
        this.activePopoverLockedPosition = undefined;
        this.activePopoverAnchorRect = undefined;
        this.activePopoverMode = undefined;
        this.activePopoverAnchor = undefined;
        this.activeHoverWord = undefined;
        this.activeHoverLookupKey = '';
        this.activePointerTextLookup = undefined;
    }

    private schedulePendingDictionaryRescan(): void {
        if (!this.dictionaryRescanPending) return;
        this.dictionaryRescanPending = false;
        window.setTimeout(() => this.scheduleDictionaryRescan(), 80);
    }

    private toast(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'jpdb-reader-toast';
        toast.dataset.jpdbReaderRoot = 'true';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = message;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }
}

function pointerTokenAtOffset(tokens: JPDBToken[], offset: number): JPDBToken | undefined {
    return tokens.find(token => tokenContainsPointerOffset(token, offset));
}

function tokenContainsPointerOffset(token: JPDBToken, offset: number): boolean {
    return token.start <= offset && offset < token.end;
}

function isLowValuePitchEnrichmentToken(token: JPDBToken): boolean {
    return isLowValuePointerTextToken(token);
}

function isLowValuePointerTextToken(token: JPDBToken): boolean {
    const spelling = token.card.spelling.trim();
    return SINGLE_HIRAGANA_MORA_RE.test(spelling);
}

function isOcrLineFrameWord(word: HTMLElement): boolean {
    return word.classList.contains('jpdb-ocr-line') && !word.dataset.vid && !word.dataset.sid;
}

function preferredRenderedWordSentence(nearest: string, tokenSentence: string): string | undefined {
    const cleanNearest = normalizedLookupText(nearest);
    const cleanTokenSentence = normalizedLookupText(tokenSentence);
    if (cleanTokenSentence && shouldPreferTokenSentence(cleanNearest, cleanTokenSentence)) return cleanTokenSentence;
    if (cleanTokenSentence && cleanTokenSentence.length > cleanNearest.length + 2) return cleanTokenSentence;
    return cleanNearest || cleanTokenSentence || undefined;
}

function shouldPreferTokenSentence(nearest: string, tokenSentence: string): boolean {
    if (!nearest) return true;
    if (!compactLookupText(nearest).includes(compactLookupText(tokenSentence))) return true;
    return looksLikeNoisyRenderedContext(nearest);
}

function compactLookupText(text: string): string {
    return normalizedLookupText(text).replace(/\s+/g, '');
}

function looksLikeNoisyRenderedContext(text: string): boolean {
    const timecodes = text.match(/\d{1,2}:\d{2}/g)?.length ?? 0;
    if (timecodes >= 2) return true;
    const digitish = text.match(/[0-9０-９:：]/g)?.length ?? 0;
    if (digitish >= 12 && digitish / Math.max(1, Array.from(text).length) > 0.12) return true;
    return /動画全編を視聴|watch full video|view full video/i.test(text);
}

function pitchEnrichmentPriority(token: JPDBToken): number {
    return token.card.source === 'fallback' ? 0 : 1;
}

function pitchEnrichmentTokenForCard(card: JPDBCard): JPDBToken {
    return {
        card,
        start: 0,
        end: card.spelling.length,
        length: card.spelling.length,
        rubies: [],
        pitchClass: '',
    };
}

function documentLooksLikeStandaloneImagePage(): boolean {
    const images = Array.from(document.images).filter(image => !image.closest('[data-jpdb-reader-root]'));
    if (images.length !== 1) return false;
    const bodyText = document.body?.textContent?.replace(/\s+/g, '').trim() ?? '';
    if (bodyText) return false;
    return Boolean(images[0]?.currentSrc || images[0]?.src);
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function replaceOptionalElement(parent: Element, selector: string, html: string, before: Element | null = null): void {
    const existing = parent.querySelector<HTMLElement>(selector);
    const next = htmlToFirstElement(html);
    if (existing && next) {
        existing.replaceWith(next);
        return;
    }
    if (existing) {
        existing.remove();
        return;
    }
    if (next) parent.insertBefore(next, before);
}

function cardStateLabel(state: string, language: InterfaceLanguage): string {
    const key = CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : state;
}

const CARD_STATE_LABEL_KEYS: Record<string, UiCopyKey> = {
    new: 'stateNew',
    learning: 'stateLearning',
    known: 'stateKnown',
    due: 'stateDue',
    failed: 'stateFailed',
    locked: 'stateLocked',
    'never-forget': 'stateNeverForget',
    blacklisted: 'stateBlacklisted',
    suspended: 'stateSuspended',
    'not-in-deck': 'stateNotInDeck',
    redundant: 'stateRedundant',
};
