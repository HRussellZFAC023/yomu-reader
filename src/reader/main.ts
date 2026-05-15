import { AudioPlayer } from './audio';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from './app-pages';
import { AnkiConnectClient, captureActiveVideoFrame, type AnkiLookupResult } from './anki';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { CardPopoverRenderer } from './card-popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData, type CardRenderData, type CardRenderDataLoad } from './card-render-data';
import { cardKey, waitForInstantData } from './card-utils';
import { APP_NAME, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, NEW_TAB_PAGE_URL, STUDY_GRAMMAR_SOURCE_ID, STUDY_TOOLS_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, VIDEO_PLAYER_PAGE_URL } from './constants';
import { DictionarySourceStateController } from './dictionary-source-state';
import { DictionaryStyleController } from './dictionary-styles';
import { FactoryResetCoordinator } from './factory-reset-coordinator';
import {
    HAS_JAPANESE,
    appendToDocumentHead,
    documentHasJapaneseText,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    nearestReadableSentenceForElement,
    renderTokensToHtml,
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
import { ImmersionPopoverController } from './immersion-popover-controller';
import { FloatingButtonController } from './floating-button';
import { JpdbClient } from './jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { initJpdbReviewPageBridge } from './jpdb-review-bridge';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from './jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient, type KanjiSourceInfo } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    inferMiningSourceKind,
    loadMiningContext,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationInsideReaderRoot, mutationMayContainJapaneseText, mutationTouchesAsbPlayer } from './mutation-scan';
import { applyNestedParsePlan, clearNestedParseLoadingKey, nestedParseAlreadyScheduled, nestedTextParsePlan, type NestedParsePlan } from './nested-text-parse';
import { uiText } from './i18n';
import { OnboardingController } from './onboarding';
import { ImageOcrController } from './ocr';
import {
    caretTextPositionFromPoint,
    isLowValuePointerText,
    japaneseRunAt,
    pointerTextCharacterOffset,
    type ActivePointerTextLookup,
    type PointerTextLookup,
} from './pointer-text-lookup';
import { createReaderBackdrop, createReaderPopover, installSheetHandle, placePopoverAtViewportPosition, popoverMaxHeightSetting } from './popover-shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from './popup-navigation';
import {
    buildRtkComponentSummaries,
    groupTermEntriesByDictionary,
    isKanjiCharacter,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderRtkInfo,
    speakerIcon,
    uniqueKanji,
} from './popup-render';
import { RtkClient, type RtkInfo } from './rtk';
import { ReaderAudioActions } from './reader-audio-actions';
import { ReaderParser, fallbackLookupTermAtOffset } from './reader-parser';
import {
    DEFAULT_SETTINGS,
    applyUrlBootstrapSettings,
    loadSettings,
    matchesShortcut,
    saveSettings,
    shortcutIsPressed,
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
    orderedDefinitionSourceIds,
    orderedKanjiSourceIds,
} from './source-sections';
import { READER_CSS } from './styles';
import { StudySourceController } from './study-sources';
import { SubtitlePlayerController } from './subtitles';
import { installUchisenCarousel, loadUchisenImages } from './uchisen';
import type { InterfaceLanguage, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { VisiblePageScanner } from './visible-page-scanner';
import { renderWordPills } from './word-pills';
import {
    YomitanDictionaryStore,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const log = Logger.scope('ReaderApp');
const INSTANT_DICTIONARY_RENDER_WAIT_MS = 120;
const TERM_AUDIO_PRELOAD_LIMIT = 8;
const NEARBY_TERM_AUDIO_PRELOAD_LIMIT = 6;
type ReviewShortcutKey = keyof ReaderSettings['shortcuts'];

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

function lookupCandidateSentence(text: string): string {
    const sentence = normalizedLookupText(text);
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

function audioPreloadLimits(options: { sourceLimit?: number; candidateLimit?: number }): { sourceLimit: number; candidateLimit: number } {
    return {
        sourceLimit: options.sourceLimit ?? 1,
        candidateLimit: options.candidateLimit ?? 1,
    };
}

function shouldPauseVideoForSubtitleHover(word: HTMLElement, settings: ReaderSettings): boolean {
    return settings.subtitleMiningPause && Boolean(word.closest('.jpdb-subtitle-player'));
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
}

type PointerTextDisplayOptions = Pick<CardDisplayOptions, 'navigation' | 'preservePosition' | 'hoverLookupGeneration'>;
type LocalPointerTextEntryMatch = { entry: YomitanTermEntry; start: number; end: number };

function canSchedulePointerTextHoverLookup(hoverEnabled: boolean, candidate: PointerTextLookup | null): candidate is PointerTextLookup {
    return hoverEnabled && Boolean(candidate);
}

function samePointerTextLookupTarget(active: ActivePointerTextLookup, candidate: PointerTextLookup): boolean {
    return active.anchor === candidate.anchor && active.text === candidate.text;
}

function pointerOffsetInsideLookup(active: ActivePointerTextLookup, offset: number): boolean {
    return (active.start <= offset && offset < active.end)
        || (active.start < offset && offset <= active.end);
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
}

interface TextLookupDisplayContext {
    selected: string;
    anchor?: HTMLElement;
    trigger: 'modal' | 'hover';
    navigation: CardNavigationMode;
    preservePosition: boolean;
    previousNavigationEntry?: PopupNavigationEntry;
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
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient();
    private jpdbPublicPitch = new JpdbPublicPitchClient();
    private jpdbVocabulary = new JpdbVocabularyClient();
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private dictionaries = new YomitanDictionaryStore();
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
        parseJapanese: paragraphs => this.parseJapanese(paragraphs),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
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
        playAudio: card => this.audioActions.playTermAudio(card),
        playSentenceAudio: sentence => this.audioActions.playSentenceAudio(sentence),
        detectGrammarHints: sentence => this.studySources.detectGrammarHints(sentence),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        toast: message => this.toast(message),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: paragraphs => this.parseJapanese(paragraphs),
        canParseJapanese: () => this.canParseJapanese(),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
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
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onSettingsChange: () => void saveSettings(this.settings),
    });
    private ocr = new ImageOcrController({
        getSettings: () => this.settings,
        parseJapanese: async text => (await this.parseJapanese([text]))[0] ?? [],
        onLookup: (text, sentence) => this.lookupText(text, sentence),
        onToast: message => this.toast(message),
        shouldAutoScan: () => this.pageHasJapaneseText,
    });
    private pageScanner = new VisiblePageScanner({
        getSettings: () => this.settings,
        parseJapanese: paragraphs => this.parseJapanese(paragraphs),
        pauseMutationObserver: callback => this.pauseAutoScanObserver(callback),
        preloadParsedTokens: tokens => this.preloadTermAudioForTokens(tokens),
        preloadImmersionTokens: tokens => this.immersionPopover.preloadForTokens(tokens),
        enrichAnkiWords: tokens => this.enrichAnkiWords(tokens),
        toast: message => this.toast(message),
    });
    private factoryReset = new FactoryResetCoordinator({
        isDestroyed: () => this.isDestroyed,
        invalidateRuntimeStores: () => this.invalidateRuntimeStoresForFactoryReset(),
        resetDictionaryDatabase: () => this.dictionaries.resetDatabase(),
        toast: message => this.toast(message),
        reload: () => location.reload(),
    });
    private settingsDialog = new SettingsDialogController({
        getSettings: () => this.settings,
        setSettings: settings => { this.settings = settings; },
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
        anki: this.anki,
        audio: this.audio,
        subtitles: this.subtitles,
        ocr: this.ocr,
        createBackdrop: () => createReaderBackdrop(() => this.dismiss()),
        mountDialog: (backdrop, form) => this.mountSettingsDialog(backdrop, form),
        dismiss: () => this.dismiss(),
        toast: message => this.toast(message),
        applyTheme: () => this.applyTheme(),
        applyAccentColor: color => this.applyAccentColor(color),
        applyWordColors: settings => this.applyWordColors(settings),
        installFab: () => this.installFab(),
        refreshDictionaryStyles: () => this.refreshDictionaryStyles(),
        scheduleDictionaryRescan: () => this.scheduleDictionaryRescan(),
        refreshNewTabIfCurrent: () => undefined,
        clearDictionarySourceOpenOverrides: () => this.dictionarySourceState.clear(),
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
    private activePopoverResizeObserver?: ResizeObserver;
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
    private preloadedTermAudioKeys = new Set<string>();
    private pressedKeys = new Set<string>();
    private hoverAnchorIds = new WeakMap<HTMLElement, number>();
    private nextHoverAnchorId = 1;
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
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
        if (this.leaveHostedPassivePage()) return done();
        await this.initReaderPage(shouldShowWelcome);
        done();
    }

    private async loadInitialSettings(options?: ReaderAppInitOptions): Promise<boolean> {
        this.factoryReset.bind();
        this.settings = await loadSettings();
        if (options?.isDemo) this.enableDemoMode();
        const shouldShowWelcome = options?.showWelcome ?? !this.isDemo;
        this.settings = applyUrlBootstrapSettings(this.settings);
        this.pageHasJapaneseText = documentHasJapaneseText();
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        return shouldShowWelcome;
    }

    private enableDemoMode(): void {
        this.settings.onboardingSeen = true;
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

    private leaveHostedPassivePage(): boolean {
        if (!isYomuHostedPassivePage(location.href)) return false;
        log.info('Hosted Yomu content page left passive', { href: location.href, demo: this.isDemo });
        return true;
    }

    private async initReaderPage(shouldShowWelcome: boolean): Promise<void> {
        this.installFab();
        this.subtitles.init();
        this.ocr.init();
        this.setupAutoScan();
        if (shouldShowWelcome && !isYomuHostedAppUrl(location.href)) await this.onboarding.showIfNeeded();
        if (this.shouldScanInitialPage()) void this.pageScanner.scanVisiblePage({ silent: true });
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
            GM_registerMenuCommand(`${APP_NAME} toggle puck`, () => {
                this.settings.showFloatingButton = !this.settings.showFloatingButton;
                void saveSettings(this.settings).then(() => this.installFab());
            });
            GM_registerMenuCommand(`${APP_NAME} reset all`, () => void this.factoryReset.resetAllData());
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

    private async invalidateRuntimeStoresForFactoryReset(): Promise<void> {
        this.dismiss({ suppressHoverTarget: false });
        this.jpdb.clear();
        this.parser.clearLocalCache();
        this.dictionarySourceState.clear();
        this.cardRenderData.clear();
        this.preloadedTermAudioKeys.clear();
        this.pressedKeys.clear();
        this.cardRenderRequest++;
        await this.dictionaries.invalidateForFactoryReset();
    }

    private installStyles(): void {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(READER_CSS);
        } else {
            const style = document.createElement('style');
            style.textContent = READER_CSS;
            appendToDocumentHead(style);
        }
    }

    private applyTheme(): void {
        applyReaderTheme(this.settings);
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private scheduleDictionaryRescan(): void {
        if (this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.dictionaryRescanPending = true;
            return;
        }
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
        this.pauseAutoScanObserver(() => unwrapReaderWords(document));
        if (!this.canParseJapanese()) {
            return;
        }
        await this.pageScanner.scanVisiblePage({ silent: true });
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

    destroy(): void {
        this.isDestroyed = true;
        this.factoryReset.destroy();
        this.abortController.abort();
        this.autoScanObserver?.disconnect();
        window.clearTimeout(this.autoScanTimer);
        window.clearTimeout(this.asbScanTimer);
        window.clearTimeout(this.selectionTimer);
        window.clearTimeout(this.visiblePageReparseTimer);
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.activePopoverResizeObserver?.disconnect();
        
        this.floatingButton.destroy();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        document.querySelectorAll('.jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby').forEach(el => {
            if (el.classList.contains('jpdb-reader-word') || el.classList.contains('jpdb-reader-ruby')) {
                const text = document.createTextNode(el.textContent || '');
                el.replaceWith(text);
            } else {
                el.remove();
            }
        });
        
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
        });
        this.observeAutoScanMutations();
        window.addEventListener('scroll', () => this.scheduleAutoScan(500), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(700), { passive: true });
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
            if (this.autoScanObserver === observer) this.observeAutoScanMutations();
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
        document.addEventListener('click', event => {
            if (this.isDestroyed) return;
            if ((event.target as HTMLElement).closest?.('[data-jpdb-reader-root] a.gloss-link[data-dictionary-lookup]')) return;
            const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (!word) {
                if (!this.settings.lookupOnClick) return;
                const candidate = this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target);
                if (!candidate) return;
                event.preventDefault();
                event.stopPropagation();
                this.suppressSelectionLookupUntil = Date.now() + 350;
                const insideActivePopover = this.activePopoverMode === 'modal' && this.isInsideActivePopover(event.target as Node | null);
                void this.showLookupCandidate(candidate, 'modal', {
                    navigation: insideActivePopover ? 'push-current' : 'reset',
                    preservePosition: insideActivePopover,
                });
                return;
            }
            if (Date.now() < this.suppressWordClickUntil) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (!this.settings.lookupOnClick) return;

            event.preventDefault();
            event.stopPropagation();
            this.suppressSelectionLookupUntil = Date.now() + 350;
            if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            void this.showWord(word, { trigger: 'click' });
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

        document.addEventListener('mouseover', event => {
            this.handleHoverPointer(event as PointerEvent);
        }, { capture: true });

        document.addEventListener('mousemove', event => {
            this.handleHoverPointer(event as PointerEvent);
        }, { capture: true });

        document.addEventListener('mouseout', event => {
            this.handleHoverPointerOut(event as PointerEvent);
        }, { capture: true });

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
                this.toast(this.settings.ocrEnabled ? 'Image reading enabled.' : 'Image reading hidden.');
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
                void this.audioActions.playTermAudio(this.lastCard);
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
                    this.toast(error instanceof Error ? error.message : 'Review failed.');
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
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
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
            && (event.pointerType !== 'mouse' || event.button === 0);
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
        if (word.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
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
        this.preloadReaderWordAudio(word, { sourceLimit: 2, candidateLimit: 1 });
        this.preloadNearbyReaderWordAudio(word);
    }

    private preloadReaderWordAudio(word: HTMLElement, options: { sourceLimit?: number; candidateLimit?: number } = {}): boolean {
        if (!this.canPreloadReaderAudio()) return false;
        const card = this.preloadableReaderWordCard(word);
        if (!card) return false;
        if (!this.reservePreloadedTermAudio(card)) return false;
        this.audio.preload(card, audioPreloadLimits(options));
        return true;
    }

    private canPreloadReaderAudio(): boolean {
        return this.settings.audioEnabled && this.settings.autoPlayAudio;
    }

    private reservePreloadedTermAudio(card: JPDBCard): boolean {
        const key = cardKey(card);
        if (this.preloadedTermAudioKeys.has(key)) return false;
        this.preloadedTermAudioKeys.add(key);
        return true;
    }

    private preloadableReaderWordCard(word: HTMLElement): JPDBCard | null {
        const card = this.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
        return card && isUsefulImmersionPreloadQuery(card.spelling) ? card : null;
    }

    private preloadNearbyReaderWordAudio(word: HTMLElement): void {
        this.queueNearbyReaderWordAudioPreloads(word);
    }

    private queueNearbyReaderWordAudioPreloads(word: HTMLElement): number {
        const words = this.lookupableReaderWords();
        const index = words.indexOf(word);
        return index < 0 ? 0 : this.queueReaderWordAudioPreloads(words.slice(index + 1));
    }

    private lookupableReaderWords(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(candidate => candidate.isConnected && this.canLookupReaderWord(candidate));
    }

    private queueReaderWordAudioPreloads(words: HTMLElement[]): number {
        let queued = 0;
        for (const candidate of words) {
            if (this.preloadReaderWordAudio(candidate)) queued++;
            if (queued >= NEARBY_TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        return queued;
    }

    private canLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer, .jpdb-reader-popover'));
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        if (!word.closest('[data-jpdb-reader-root]')) return true;
        return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-ocr-layer'));
    }

    private handleHoverPointer(event: PointerEvent): void {
        if (this.shouldIgnoreHoverPointer(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (this.handleActivePopoverHover(event)) return;

        const word = this.hoverReaderWordForEvent(event);
        if (!word) {
            this.handlePointerTextHover(event);
            return;
        }
        this.handleReaderWordHover(word, event);
    }

    private shouldIgnoreHoverPointer(event: PointerEvent): boolean {
        return this.isDestroyed
            || this.pressLookup?.source === 'middle'
            || event.pointerType === 'touch';
    }

    private handleActivePopoverHover(event: PointerEvent): boolean {
        if (!this.isInsideActivePopover(event.target as Node | null)) return false;
        this.cancelHoverClose();
        return true;
    }

    private hoverReaderWordForEvent(event: PointerEvent): HTMLElement | null {
        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private handlePointerTextHover(event: PointerEvent): void {
        const hoverEnabled = this.shouldLookupOnHover(event);
        const candidate = hoverEnabled ? this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target) : null;
        if (candidate && this.refreshActivePointerTextHover(candidate, event)) return;
        this.cancelMissingPointerTextCandidate(candidate);
        this.scheduleInactiveHoverClose();
        if (!canSchedulePointerTextHoverLookup(hoverEnabled, candidate)) return;
        this.rememberHoverPopoverPointer(event);
        this.schedulePointerTextLookup(candidate, event);
    }

    private refreshActivePointerTextHover(candidate: PointerTextLookup, event: PointerEvent): boolean {
        if (!this.isActivePointerTextLookup(candidate)) return false;
        this.rememberHoverPopoverPointer(event);
        this.cancelHoverClose();
        this.refreshActiveHoverAnchor(candidate.anchor);
        this.scheduleActivePopoverReposition();
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
            this.scheduleActivePopoverReposition();
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            this.scheduleActivePopoverReposition();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        this.preloadHoverWordAudio(word);
        this.scheduleHoverLookup(word, event);
    }

    private handleHoverPointerOut(event: PointerEvent): void {
        if (this.isDestroyed) return;
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
        const candidate = this.lookupCandidateFromPoint(pointer.x, pointer.y, target);
        if (candidate) this.schedulePointerTextLookup(candidate, event);
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
            ? this.wordFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) ?? null
            : null;
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
        if (this.activeHoverWord && this.isWordHoverActive(this.activeHoverWord, options)) return true;
        if (this.isPopoverCssHoverActive(options)) return true;
        const target = this.currentHoverPointerTarget(options);
        return target ? this.isInsideActiveHoverContext(target) : false;
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
        return pointerOffsetInsideLookup(active, candidate.offset);
    }

    private hasActiveHoverPopover(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.activePopover);
    }

    private refreshActiveHoverAnchor(anchor: HTMLElement): void {
        if (!this.canRefreshActiveHoverAnchor(anchor)) return;
        if (this.activePopoverAnchor === anchor && this.activeHoverWord === anchor) return;
        this.activePopoverAnchor = anchor;
        this.activeHoverWord = anchor;
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

    private async parseJapanese(paragraphs: string[]): Promise<JPDBToken[][]> {
        return this.parser.parse(paragraphs);
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
            const [tokens] = await this.parseJapanese([sentence]);
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
        const trigger = this.activeTextLookupTrigger();
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
            ? this.navigation.activeKanjiEntry()
            : undefined;
    }

    private async showTextLookupResult(context: TextLookupDisplayContext, tokens: JPDBToken[], sentence: string): Promise<void> {
        const selectedToken = pickTokenForSelection(tokens, context.selected);
        if (selectedToken) {
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        if (tokens.length) {
            this.showTokenList(tokens, context.selected, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        await this.showLocalOrFallbackLookupCard(context, sentence);
    }

    private async showLocalOrFallbackLookupCard(context: TextLookupDisplayContext, sentence: string, error?: unknown): Promise<void> {
        const localEntries = await this.localLookupEntries(context.selected);
        if (localEntries.length) {
            void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, context.anchor, this.textLookupCardOptions(context));
            return;
        }
        if (error) this.toast(error instanceof Error ? error.message : 'JPDB lookup failed.');
        void this.showCard(this.parser.fallbackCardFromText(context.selected), sentence, context.anchor, this.textLookupCardOptions(context));
    }

    private async localLookupEntries(selected: string): Promise<YomitanTermEntry[]> {
        return this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
    }

    private textLookupCardOptions(context: TextLookupDisplayContext): Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry'> {
        return {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: context.preservePosition,
            previousNavigationEntry: context.previousNavigationEntry,
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
            if (preferredEntry) {
                await this.showCard(this.parser.localCardFromEntry(preferredEntry), query, anchor, { autoPlay: false, trigger, navigation, preservePosition });
                return;
            }
            await this.lookupText(query, query, { navigation, preservePosition });
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

    private lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null): PointerTextLookup | null {
        const element = this.pointerLookupElement(x, y, eventTarget);
        if (!element) return null;
        const position = this.usablePointerTextPosition(element, x, y);
        if (!position) return null;
        const characterOffset = pointerTextCharacterOffset(position.node, position.offset, x, y);
        if (characterOffset === null) return null;
        return this.lookupCandidateFromTextPosition(position.node, characterOffset);
    }

    private pointerLookupElement(x: number, y: number, eventTarget: EventTarget | null): Element | null {
        const element = eventTarget instanceof Element ? eventTarget : document.elementFromPoint(x, y);
        return element && !this.isNativeTextLookupTarget(element) ? element : null;
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

    private isNativeTextLookupTarget(target: Element): boolean {
        return Boolean(target.closest([
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            'summary',
            '[role="button"]',
            '[contenteditable="true"]',
            '.jpdb-reader-word',
        ].join(',')));
    }

    private async showLookupCandidate(candidate: PointerTextLookup, trigger: 'modal' | 'hover', options: { navigation?: CardNavigationMode; preservePosition?: boolean; hoverLookupGeneration?: number } = {}): Promise<void> {
        const sentence = lookupCandidateSentence(candidate.text);
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
        const [tokens] = await this.parseJapanese([candidate.text]);
        const token = pointerTokenAtOffset(tokens ?? [], candidate.offset);
        if (!token) return false;
        await this.showPointerTextCard(token.card, token.sentence ?? sentence, candidate, { start: token.start, end: token.end }, trigger, options);
        return true;
    }

    private async showLocalPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const localMatch = await this.lookupLocalEntryAtOffset(candidate.text, candidate.offset);
        if (!localMatch) return false;
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
        const fallbackTerm = fallbackLookupTermAtOffset(candidate.text, candidate.offset);
        if (!fallbackTerm) return false;
        const card = this.parser.fallbackCardFromText(fallbackTerm);
        await this.showPointerTextCard(card, sentence, candidate, candidate, trigger, options);
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
        const pointerTextLookup = { anchor: candidate.anchor, text: candidate.text, start: range.start, end: range.end };
        await this.showCard(card, sentence, candidate.anchor, {
            trigger,
            navigation: options.navigation ?? 'reset',
            preservePosition: options.preservePosition,
            hoverLookupKey: trigger === 'hover' ? this.activePointerTextLookupKey(candidate, range.start, range.end, card) : undefined,
            hoverLookupGeneration: options.hoverLookupGeneration,
            pointerTextLookup: trigger === 'hover' ? pointerTextLookup : undefined,
        });
    }

    private async lookupLocalEntryAtOffset(text: string, offset: number): Promise<LocalPointerTextEntryMatch | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const run = japaneseRunAt(text, offset);
        if (!run) return undefined;

        return await this.lookupLocalEntryInRun(text, run);
    }

    private async lookupLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): Promise<LocalPointerTextEntryMatch | undefined> {
        return await this.lookupForwardLocalEntryInRun(text, run)
            ?? await this.lookupBackwardLocalEntryInRun(text, run);
    }

    private async lookupForwardLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): Promise<LocalPointerTextEntryMatch | undefined> {
        const maxEnd = Math.min(run.end, run.offset + 18);
        for (let end = maxEnd; end > run.offset; end--) {
            const surface = text.slice(run.offset, end);
            const entry = await this.lookupSingleLocalSurface(surface);
            if (entry) return { entry, start: run.offset, end };
        }
        return undefined;
    }

    private async lookupBackwardLocalEntryInRun(text: string, run: NonNullable<ReturnType<typeof japaneseRunAt>>): Promise<LocalPointerTextEntryMatch | undefined> {
        if (run.offset <= run.start) return undefined;
        for (let start = run.offset - 1; start >= run.start; start--) {
            const surface = text.slice(start, run.offset + 1);
            const entry = await this.lookupSingleLocalSurface(surface);
            if (entry) return { entry, start, end: run.offset + 1 };
        }
        return undefined;
    }

    private async lookupSingleLocalSurface(surface: string): Promise<YomitanTermEntry | undefined> {
        return (await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []))[0];
    }

    private async showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; hoverLookupGeneration?: number; previousNavigationEntry?: PopupNavigationEntry } = {}): Promise<void> {
        const card = this.cardForRenderedWord(word);
        if (!card) {
            return;
        }
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        this.rememberRenderedWordMiningContext(word, card, insideReaderPopup);
        const context = this.renderedWordDisplayContext(word, options, insideReaderPopup);
        if (context.hoverLookupKey && this.isActiveHoverLookup(context.hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return;
        }
        this.preloadHoverWordAudio(word);
        await this.showCard(card, context.sentence, context.anchor, {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: context.insideReaderPopup,
            previousNavigationEntry: context.previousNavigationEntry,
            hoverLookupKey: context.hoverLookupKey,
            hoverLookupGeneration: options.hoverLookupGeneration,
            insideReaderPopup: context.insideReaderPopup,
        });
    }

    private cardForRenderedWord(word: HTMLElement): JPDBCard | undefined {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.getCachedCard(vid, sid);
        if (card) return card;
        log.warn('Clicked word missing from cache; scheduling page reparse', { vid, sid });
        this.scheduleVisiblePageReparse();
        return undefined;
    }

    private rememberRenderedWordMiningContext(word: HTMLElement, card: JPDBCard, insideReaderPopup: boolean): void {
        if (!insideReaderPopup || !word.closest('.jpdb-reader-example-card')) return;
        this.immersionPopover.rememberPageMiningContext(card, word.dataset.sentence || undefined, word);
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
        return nearestReadableSentenceForElement(word, word.dataset.sentence || '') || undefined;
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
        if (insideReaderPopup && this.activePopoverMode === 'hover') return 'hover';
        return trigger === 'hover' ? 'hover' : 'modal';
    }

    private renderedWordPreviousNavigationEntry(
        insideReaderPopup: boolean,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): PopupNavigationEntry | undefined {
        return insideReaderPopup && trigger === 'modal' && navigation === 'push-current'
            ? this.navigation.activeKanjiEntry()
            : undefined;
    }

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options: Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'previousNavigationEntry'> = {}): void {
        if (!tokens.length) return;
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        this.prepareTokenListNavigation(trigger, navigation);
        const popover = this.createPopover();
        setInnerHtml(popover, this.renderTokenListHtml(tokens, selected));
        this.installTokenListHandlers(popover, tokens, anchor, { trigger, navigation, previousNavigationEntry: options.previousNavigationEntry });
        this.mountPopover(popover, anchor, { mode: trigger, preservePosition: options.preservePosition });
        void this.parsePopoverJapanese(popover);
    }

    private prepareTokenListNavigation(trigger: 'modal' | 'hover', navigation: CardNavigationMode): void {
        if (trigger === 'modal' && navigation === 'reset') this.navigation.clearWord();
    }

    private renderTokenListHtml(tokens: JPDBToken[], selected: string): string {
        return `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map(token => this.renderTokenListButton(token)).join('')}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml(selected)}</div>
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
        context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
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
        context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
    ): void {
        const card = this.getCachedCard(Number(button.dataset.vid), Number(button.dataset.sid));
        if (!card) return;
        void this.showCard(card, tokens.find(token => token.card === card)?.sentence, anchor, {
            trigger: context.trigger,
            navigation: context.navigation,
            preservePosition: true,
            previousNavigationEntry: context.previousNavigationEntry,
        });
    }

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: CardDisplayOptions = {}): Promise<void> {
        this.lastCard = card;
        this.lastCardSentence = sentence;
        const popover = this.createPopover();
        const trigger = cardDisplayTrigger(options);
        const navigation = options.navigation ?? 'reset';
        const hoverLookupGeneration = trigger === 'hover' ? options.hoverLookupGeneration : undefined;
        const isCurrentHoverCard = () => hoverLookupGeneration === undefined || this.hoverLookupGeneration === hoverLookupGeneration;
        this.navigation.updateWord(card, sentence, trigger, navigation, options.previousNavigationEntry);
        this.navigation.clearKanji();
        const done = log.time('showCard', { term: card.spelling, source: cardSourceLabel(card), trigger });
        this.rememberCardMiningContext(card, sentence, anchor, options);
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        this.lastAnkiLookup = fallbackAnkiLookup;
        const renderData = this.cardRenderData.load(card);

        const mounted = await this.mountInitialCardShell(popover, card, sentence, anchor, {
            trigger,
            navigation,
            options,
            renderData,
            fallbackAnkiLookup,
            isCurrentHoverCard,
            hoverLookupGeneration,
        });
        if (!mounted) {
            done();
            return;
        }

        const renderState = { fullRenderCompleted: false };
        this.renderDeferredCardLocalEntries(popover, card, sentence, trigger, renderData, fallbackAnkiLookup, mounted, renderState, isCurrentHoverCard);

        const fullData = await renderData.all;
        renderState.fullRenderCompleted = true;
        if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) {
            done();
            return;
        }
        this.renderCompletedCardPopover(popover, card, sentence, trigger, fullData);
        done();
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
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): Promise<MountedCardShell | null> {
        const instantLocalEntries = await waitForInstantData(context.renderData.localEntries, INSTANT_DICTIONARY_RENDER_WAIT_MS);
        if (!context.isCurrentHoverCard()) {
            return null;
        }
        setInnerHtml(popover, this.cardPopoverRenderer.render(
            card,
            sentence,
            context.trigger,
            loadingCardRenderData(instantLocalEntries ?? [], context.fallbackAnkiLookup),
        ));
        this.installCardPopoverHandlers(popover, card, sentence, anchor, context.trigger);
        this.mountPopover(popover, anchor, {
            mode: context.trigger,
            preservePosition: this.initialCardPreservePosition(context),
            hoverLookupKey: context.options.hoverLookupKey,
            pointerTextLookup: context.options.pointerTextLookup,
        });
        const requestId = ++this.cardRenderRequest;
        this.installInitialCardBehaviors(popover, card, sentence, context, instantLocalEntries);
        return { instantLocalEntries: instantLocalEntries ?? null, requestId };
    }

    private initialCardPreservePosition(context: { trigger: 'modal' | 'hover'; navigation: CardNavigationMode; options: CardDisplayOptions }): boolean {
        return context.options.preservePosition ?? (context.trigger === 'modal' && context.navigation !== 'reset');
    }

    private installInitialCardBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        context: {
            options: CardDisplayOptions;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
        instantLocalEntries: YomitanTermEntry[] | null,
    ): void {
        this.maybeAutoPlayInitialCard(card, context);
        this.maybeParseInstantLocalEntries(popover, instantLocalEntries);
        this.studySources.installLoaders(popover, sentence);
        this.maybeLoadImmersionExamples(popover, card);
    }

    private maybeAutoPlayInitialCard(
        card: JPDBCard,
        context: {
            options: CardDisplayOptions;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): void {
        if (!this.shouldAutoPlayInitialCard(card, context)) return;
        void this.audioActions.playTermAudio(card, { hoverLookupGeneration: context.hoverLookupGeneration });
    }

    private shouldAutoPlayInitialCard(
        card: JPDBCard,
        context: { options: CardDisplayOptions; isCurrentHoverCard: () => boolean },
    ): boolean {
        return context.options.autoPlay !== false && context.isCurrentHoverCard() && this.shouldAutoPlay(card);
    }

    private maybeParseInstantLocalEntries(popover: HTMLElement, instantLocalEntries: YomitanTermEntry[] | null): void {
        if (instantLocalEntries?.length) void this.parsePopoverJapanese(popover);
    }

    private maybeLoadImmersionExamples(popover: HTMLElement, card: JPDBCard): void {
        if (this.settings.immersionKitEnabled) void this.immersionPopover.loadExamples(popover, card);
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
        void renderData.localEntries.then(localEntries => {
            if (renderState.fullRenderCompleted || !this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
            setInnerHtml(popover, this.cardPopoverRenderer.render(card, sentence, trigger, loadingCardRenderData(localEntries, this.lastAnkiLookup ?? fallbackAnkiLookup)));
            this.repositionActivePopover();
            void this.parsePopoverJapanese(popover);
        });
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
        setInnerHtml(popover, this.cardPopoverRenderer.render(card, sentence, trigger, { ...data, loading: false }));

        this.repositionActivePopover();
        void this.parsePopoverJapanese(popover);
        if (this.settings.immersionKitEnabled) {
            const immersionExamples = this.immersionPopover.searchExamples(card, {
                relatedQueries: this.immersionRelatedQueries(data.jpdbVocabularyInfo),
            });
            void this.immersionPopover.loadExamples(popover, card, immersionExamples);
        }
        this.studySources.installLoaders(popover, sentence);
    }

    private isCurrentCardRender(popover: HTMLElement, requestId: number, isCurrentHoverCard: () => boolean): boolean {
        return isCurrentHoverCard()
            && requestId === this.cardRenderRequest
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
        const label = expanded ? 'Hide mining actions' : 'Show mining actions';
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

    private shouldAutoPlay(card: JPDBCard): boolean {
        if (!this.settings.autoPlayAudio) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
        this.lastAutoAudioKey = key;
        this.lastAutoAudioAt = now;
        return true;
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
            ${renderModalNavigation({
                ...this.navigation.kanjiModalBack(card, language),
                controlsHtml: this.renderKanjiNavigationControls(kanjiCharacters, kanji, language),
            })}
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                        <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                        <div data-kanji-keyword-mount><div class="jpdb-reader-help">Loading kanji details...</div></div>
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
                    <div data-kanji-mining-mount hidden></div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                ${this.renderKanjiSourceMounts(kanji, language)}
            </div>
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
        popover.addEventListener('click', event => {
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
            if (action === 'word-back') void this.showCard(card, sentence, anchor, { autoPlay: false, navigation: 'preserve', preservePosition: true });
            if (action === 'kanji-history-back') void this.showPreviousKanji(anchor);
            if (action === 'kanji-prev' || action === 'kanji-next') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true });
            if (action === 'kanji') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true });
            if (action === 'similar-word') void this.lookupText(actionButton.dataset.expression ?? '', actionButton.dataset.expression ?? '', { navigation: 'push-current', preservePosition: true });
        });
    }

    private startKanjiProgressiveRender(popover: HTMLElement, detailsPromises: KanjiDetailPromises, card: JPDBCard, kanji: string, language: InterfaceLanguage): void {
        installKanjiDoodle(popover, () => this.settings.interfaceLanguage);
        if (this.settings.similarKanjiWords) {
            void this.renderSimilarKanjiWordsProgressively(popover, detailsPromises.jpdbInfo, kanji, card);
        }
        if (this.settings.uchisenEnabled) {
            void this.renderUchisenInto(popover, kanji);
        }
        void this.renderKanjiDetailsInto(popover, detailsPromises, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, detailsPromises.kanjiVGInfo, kanji, language);
        }
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (!actionId) return;
        try {
            await this.jpdbKanji.performAction(actionId);
            this.toast('JPDB kanji updated.');
            await this.showKanjiCard(card, kanji, sentence, anchor, { preservePosition: true });
        } catch (error) {
            log.warn('JPDB kanji action failed', { kanji }, error);
            this.toast('Could not update JPDB kanji. Check JPDB kanji reviews are enabled.');
        }
    }

    private renderKanjiSourceMounts(kanji: string, language: InterfaceLanguage): string {
        return orderedKanjiSourceIds(this.settings).map(sourceId => {
            if (sourceId === KANJI_STROKE_SOURCE_ID) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_STROKE_SOURCE_ID);
                return renderKanjiPractice(null, kanji, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey);
            }
            if (sourceId === KANJI_JPDB_SOURCE_ID) return '<div data-kanji-jpdb-mount></div>';
            if (sourceId === KANJI_RTK_SOURCE_ID) return '<div data-kanji-rtk-mount></div>';
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
                );
            }
            if (sourceId === KANJI_ORIGINS_SOURCE_ID) return '<div data-kanji-origin-mount></div>';
            return '';
        }).join('');
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
        const keywordMount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
        const rtkMount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
        const definitionsMounts = Array.from(popover.querySelectorAll<HTMLElement>('[data-kanji-definitions-mount]'));

        const renderKeyword = () => {
            if (!popover.isConnected || !keywordMount?.isConnected) return;
            setInnerHtml(keywordMount, renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries));
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
            if (miningMount?.isConnected) {
                const controls = renderJpdbKanjiMiningControls(jpdbInfo, language);
                miningMount.hidden = !controls;
                setInnerHtml(miningMount, controls);
            }
            if (jpdbMount?.isConnected) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey));
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
                    dictionaryName ? this.dictionaryLabel(dictionaryName) : 'Kanji dictionaries',
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
        });

        await Promise.all([jpdbInfoPromise, kanjiEntriesPromise, rtkInfoPromise, kanjiVGInfoPromise]);
        if (!popover.isConnected) return;
        const resolvedJpdbInfo = jpdbInfo as JpdbKanjiInfo | null;
        const resolvedRtkInfo = rtkInfo as RtkInfo | null;
        const resolvedKanjiVGInfo = kanjiVGInfo as KanjiVGInfo | null;

        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, resolvedJpdbInfo, resolvedRtkInfo, resolvedKanjiVGInfo, kanjiEntries);
        }
        void this.parsePopoverJapanese(popover);
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
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">Loading mnemonic images...</div></div>
            </details>
        `);
        const images = await loadUchisenImages(kanji).catch(() => {
            return [];
        });
        if (!popover.isConnected || !mount.isConnected) return;
        if (!images.length) {
            mount.remove();
            return;
        }
        await installUchisenCarousel(mount, kanji, images, {
            sourceAttributes: sourceAttributes(),
            detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
            summaryClass: 'jpdb-reader-local-title',
            bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
        });
        this.repositionActivePopover();
    }

    private async lookupSimilarKanjiWordsWhenIdle(kanji: string): Promise<YomitanTermEntry[]> {
        await this.waitForIdle();
        return this.dictionaries.lookupSimilarTermsByKanji(kanji, this.settings.similarKanjiWordLimit, this.settings.dictionaryPreferences);
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

    private renderSimilarKanjiWordsProgressively(popover: HTMLElement, jpdbInfoPromise: Promise<JpdbKanjiInfo | null>, kanji: string, card: JPDBCard): void {
        const section = popover.querySelector<HTMLDetailsElement>('[data-kanji-similar-words]');
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
        ));
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

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[], sentence?: string, jpdbVocabularyInfo: JpdbVocabularyInfo | null = null): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const setup = this.renderFallbackSetupSource(card);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        let renderedDictionaries = false;
        const sections = [
            setup,
            ...sourceIds
            .map(sourceId => {
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded), jpdbVocabularyInfo);
                if (sourceId === STUDY_TOOLS_SOURCE_ID) return this.studySources.renderToolsSource(sentence);
                if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return this.studySources.renderTranslationSource(sentence);
                if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return this.studySources.renderGrammarSource(sentence);
                if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderImmersionKitMount();
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
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceState.attributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        if (!this.isCurrentPopoverRoot(popover)) return;
        const plan = nestedTextParsePlan(popover, 24);
        if (!plan || nestedParseAlreadyScheduled(popover, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(popover, plan, () => this.isCurrentPopoverRoot(popover));
    }

    private async parseNestedJapaneseContent(
        root: HTMLElement,
        plan: NestedParsePlan,
        isCurrent: () => boolean,
    ): Promise<void> {
        root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        try {
            const parsed = await this.parseJapanese(plan.targets.map(target => target.text));
            if (!isCurrent() || root.dataset.jpdbReaderParseLoadingKey !== plan.parseKey) return;
            applyNestedParsePlan(plan, parsed, this.settings);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
            this.afterNestedJapaneseParsed(parsed);
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey);
        }
    }

    private afterNestedJapaneseParsed(parsed: JPDBToken[][]): void {
        const tokens = parsed.flat();
        this.preloadTermAudioForTokens(tokens);
        void this.enrichAnkiWords(tokens);
    }

    private isCurrentPopoverRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activePopover && (root === this.activePopover || this.activePopover.contains(root)));
    }

    private async enrichAnkiWords(tokens: JPDBToken[]): Promise<void> {
        if (!this.settings.ankiEnabled) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 16);
        for (const token of uniqueTokens) {
            const lookup = await this.anki.findExistingCards(token.card);
            this.applyAnkiLookupToRenderedWords(token.card, lookup);
        }
    }

    private preloadTermAudioForTokens(tokens: JPDBToken[]): void {
        if (!this.canPreloadReaderAudio()) return;
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
        this.preloadedTermAudioKeys.add(key);
        this.audio.preload(token.card, { sourceLimit: 1, candidateLimit: 1 });
        return true;
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private applyAnkiLookupToRenderedWords(card: JPDBCard, ankiLookup: AnkiLookupResult): void {
        if (!ankiLookup.primary) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        document.querySelectorAll<HTMLElement>(selector).forEach(word => {
            word.classList.add(`anki-${ankiLookup.state}`);
            word.dataset.ankiState = ankiLookup.state;
            word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
            word.title = `Anki: ${ankiLookup.state}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
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
            this.toast(error instanceof Error ? error.message : 'Action failed.');
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
                hasVideo: Boolean(anchor?.closest('.jpdb-subtitle-player')) || Boolean(document.querySelector('video')),
            }),
            imageDataUrl: this.settings.ankiCaptureScreenshot ? this.ocr.captureSourceImageForElement(anchor ?? null) : undefined,
            videoImageDataUrl: this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : undefined,
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit.fetchDataUrl(imageUrl, timeoutMs),
        });
        return context;
    }

    private showSettings(panel?: string): void {
        this.settingsDialog.open(panel);
    }

    private mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void {
        this.dismiss();
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
        const state = this.popoverMountState(anchor, options);
        this.dismiss({ suppressHoverTarget: false, preserveNavigation: true, preserveHoverGeneration: state.mode === 'hover' });
        this.appendMountedPopover(popover, state);
        this.activateMountedPopover(popover, state, options);
        this.dictionarySourceState.installTracking(popover);
        this.installMountedPopoverSurface(popover, state);
        this.finishMountedPopoverLifecycle(popover, state.mode);
    }

    private popoverMountState(anchor: HTMLElement | undefined, options: MountPopoverOptions): PopoverMountState {
        const mode = options.mode ?? 'modal';
        const backdrop = mode === 'hover' ? undefined : createReaderBackdrop(() => this.dismiss());
        const resolvedAnchor = connectedElement(anchor) ?? connectedElement(this.activePopoverAnchor);
        const anchorRect = popoverAnchorRect(resolvedAnchor, this.activePopoverAnchorRect);
        const previousPopoverRect = options.preservePosition ? this.activePopover?.getBoundingClientRect() : undefined;
        const previousHoverPointerPosition = this.hoverPopoverPointerPosition;
        return { mode, backdrop, resolvedAnchor, anchorRect, previousPopoverRect, previousHoverPointerPosition };
    }

    private appendMountedPopover(popover: HTMLElement, state: PopoverMountState): void {
        const useBackdrop = state.mode !== 'hover';
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
        this.activeHoverWord = state.mode === 'hover' ? state.resolvedAnchor : undefined;
        this.activeHoverLookupKey = state.mode === 'hover' ? options.hoverLookupKey ?? '' : '';
        this.activePointerTextLookup = state.mode === 'hover' ? options.pointerTextLookup : undefined;
        this.hoverPopoverPointerPosition = mountedHoverPointerPosition(state, this.lastPointerPosition);
    }

    private installMountedPopoverSurface(popover: HTMLElement, state: PopoverMountState): void {
        if (!popover.classList.contains('jpdb-reader-sheet')) {
            this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
            this.activePopoverResizeObserver.observe(popover);
            if (state.previousPopoverRect) {
                placePopoverAtViewportPosition(popover, state.previousPopoverRect, popoverMaxHeightSetting(this.settings));
                this.syncActivePopoverFixedHeight();
            }
            else this.repositionActivePopover();
            this.activePopoverPositionLocked = state.mode !== 'hover';
            requestAnimationFrame(() => this.repositionActivePopover());
        } else {
            installSheetHandle(popover, () => this.dismiss());
        }
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
        this.prepareActivePopoverForPositioning(popover);
        if (this.repositionLockedActivePopoverIfNeeded(popover)) return;
        this.repositionUnlockedActivePopover(popover);
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
                followPoint: this.shouldFollowActivePointerText() ? this.hoverPopoverPointerPosition : undefined,
                maxHeight: popoverMaxHeightSetting(this.settings),
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
        placePopoverAtViewportPosition(popover, popover.getBoundingClientRect(), popoverMaxHeightSetting(this.settings));
        this.syncActivePopoverFixedHeight();
    }

    private refreshActivePopoverAnchorRect(): void {
        if (!this.activePopoverAnchor?.isConnected) return;
        const rect = this.activePopoverAnchor.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
    }

    private shouldFollowActivePointerText(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.activePointerTextLookup);
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

    private dismiss(options: { suppressHoverTarget?: boolean; preserveNavigation?: boolean; preserveHoverGeneration?: boolean } = { suppressHoverTarget: true }): void {
        const hadSettingsDialog = Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
        this.clearHoverDismissState(options);
        this.audio.stop();
        this.immersionPopover.stopAudio();
        this.updateSuppressedHoverTarget(options);
        this.cardRenderRequest++;
        this.restoreSettingsPreviewState();
        this.removeReaderDialogNodes();
        this.clearActivePopoverState();
        if (!options.preserveNavigation) {
            this.navigation.clearWord();
            this.navigation.clearKanji();
        }
        if (hadSettingsDialog) this.schedulePendingDictionaryRescan();
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
            this.applyTheme();
        }
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
    return (token.start <= offset && offset < token.end)
        || (token.start < offset && offset <= token.end);
}
