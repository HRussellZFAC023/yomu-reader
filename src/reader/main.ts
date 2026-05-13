import { AudioPlayer } from './audio';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from './app-pages';
import { renderAnkiActionRow, renderAnkiExistingSection, renderReviewButtons } from './anki-render';
import { AnkiConnectClient, captureActiveVideoFrame, type AnkiLookupResult } from './anki';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from './browser-ui';
import { CardActionController } from './card-action-controller';
import { normalizeCardStates, primaryCardState } from './card-state';
import { cardKey, waitForInstantData } from './card-utils';
import { APP_NAME, FALLBACK_SETUP_SOURCE_ID, IMMERSION_KIT_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, STUDY_GRAMMAR_SOURCE_ID, STUDY_TRANSLATION_SOURCE_ID, VIDEO_PLAYER_PAGE_URL } from './constants';
import {
    HAS_JAPANESE,
    appendToDocumentHead,
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    documentHasJapaneseText,
    collectTextTargetsIn,
    collectVisibleTextTargets,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    renderTokensToHtml,
    setInnerHtml,
    unwrapReaderWords,
} from './dom';
import {
    definitionSourceStateKey,
    kanjiSourceStateKey,
    localDictionaryStateKey,
    renderFrequencyPills,
    renderJpdbDefinitionSource,
    renderKanjiDefinitions,
    renderLocalDefinitionSourcesSection,
    renderSimilarKanjiWordsContent,
    renderSimilarKanjiWordsShell,
} from './definition-source-render';
import { ImmersionKitClient } from './immersion-kit';
import { ImmersionPopoverController } from './immersion-popover-controller';
import { FloatingButtonController } from './floating-button';
import { JpdbClient } from './jpdb';
import { JpdbExtensionsController, installUchisenCarousel, loadUchisenImages } from './jpdb-extensions';
import { JpdbKanjiClient, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { JpdbPublicPitchClient } from './jpdb-public-pitch';
import { createJpdbReviewBridgeClient, initJpdbReviewPageBridge } from './jpdb-review-bridge';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { installKanjiGraphDrag } from './kanji-graph-drag';
import { KanjiVGClient, type KanjiVGInfo } from './kanjivg';
import { configureLogger, Logger, loggingSettingsSummary } from './logger';
import {
    formatLookupUrl,
    pillStyle,
} from './local-dictionary-display';
import {
    inferMiningSourceKind,
    loadMiningContext,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from './mining-context';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationInsideReaderRoot, mutationMayContainJapaneseText, mutationTouchesAsbPlayer } from './mutation-scan';
import { NewTabController } from './new-tab-controller';
import { resolveUiLanguage, uiText } from './i18n';
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
import { formatPartOfSpeech, formatPartOfSpeechDetails } from './pos';
import {
    buildRtkComponentSummaries,
    copyIcon,
    externalLinkIcon,
    groupTermEntriesByDictionary,
    isKanjiCharacter,
    pickTokenForSelection,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderKanjiPractice,
    renderPitch,
    renderRtkInfo,
    renderSpellingForKanjiNavigation,
    speakerIcon,
    uniqueKanji,
} from './popup-render';
import { RtkClient, type RtkInfo } from './rtk';
import { ReaderParser, fallbackLookupTermAtOffset } from './reader-parser';
import {
    DEFAULT_SETTINGS,
    accentToRgba,
    applyUrlBootstrapSettings,
    effectiveFuriganaMode,
    effectiveReaderColorSource,
    effectiveSubtitleColorSource,
    effectiveWordHighlightMode,
    loadSettings,
    matchesShortcut,
    sanitizeAccentColor,
    saveSettings,
    shortcutIsPressed,
} from './settings';
import { SettingsDialogController } from './settings-dialog-controller';
import { collectScanTargets, collectSiteScanTargets } from './site-parsers';
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
import { detectGrammarHints, renderGrammarHints, translateJapaneseSentence } from './study-tools';
import { SubtitlePlayerController } from './subtitles';
import type { InterfaceLanguage, JPDBCard, JPDBDeck, JPDBGrade, JPDBToken, ReaderColorSource, ReaderSettings } from './types';
import { YoutubeImmersionFilter } from './youtube';
import {
    YomitanDictionaryStore,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from './yomitan';

const log = Logger.scope('ReaderApp');
const LOCAL_DICTIONARIES_SOURCE_ID = '__local_dictionaries__';
const CARD_RENDER_DATA_CACHE_TTL_MS = 30_000;
const INSTANT_DICTIONARY_RENDER_WAIT_MS = 120;
const TERM_AUDIO_PRELOAD_LIMIT = 8;
const NEARBY_TERM_AUDIO_PRELOAD_LIMIT = 6;
const COLOR_SOURCE_CLASSES: Exclude<ReaderColorSource, 'auto' | 'off'>[] = ['status', 'jpdb', 'anki', 'pitch'];
const COLOR_CHANNELS = ['highlight', 'underline', 'text'] as const;
type ColorChannel = typeof COLOR_CHANNELS[number];

interface KanjiDetailPromises {
    jpdbInfo: Promise<JpdbKanjiInfo | null>;
    kanjiEntries: Promise<YomitanKanjiEntry[]>;
    rtkInfo: Promise<RtkInfo | null>;
}

interface CardNavigationEntry {
    card: JPDBCard;
    sentence?: string;
}

type CardNavigationMode = 'reset' | 'preserve' | 'push-current';

interface CardDisplayOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: CardNavigationMode;
    preservePosition?: boolean;
    hoverLookupKey?: string;
    hoverLookupGeneration?: number;
    pointerTextLookup?: ActivePointerTextLookup;
}

interface CardRenderData {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup: AnkiLookupResult;
    jpdbDecks: JPDBDeck[];
    ankiDecks: string[];
}

interface CardRenderDataLoad {
    localEntries: Promise<YomitanTermEntry[]>;
    all: Promise<CardRenderData>;
}

interface ModalNavigationOptions {
    backAction: string;
    backTitle: string;
    label: string;
    controlsHtml?: string;
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
        log.debug('Immersion Kit translation blur preference updated', { blurred });
    };
    private jpdb = new JpdbClient(() => this.settings.apiKey.trim());
    private jpdbKanji = new JpdbKanjiClient();
    private jpdbPublicPitch = new JpdbPublicPitchClient();
    private kanjiVG = new KanjiVGClient();
    private kanjiOrigin = new KanjiOriginClient();
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private rtk = new RtkClient();
    private jpdbReviewBridge = createJpdbReviewBridgeClient();
    private dictionaries = new YomitanDictionaryStore();
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
        playAudio: card => this.playAudio(card),
        playSentenceAudio: sentence => this.playSentenceAudio(sentence),
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
    private floatingButton = new FloatingButtonController();
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        dictionaries: this.dictionaries,
    });
    private newTab = new NewTabController({
        getSettings: () => this.settings,
        anki: this.anki,
        jpdb: this.jpdb,
        jpdbKanji: this.jpdbKanji,
        kanjiVG: this.kanjiVG,
        rtk: this.rtk,
        immersionKit: this.immersionKit,
        jpdbReviewBridge: this.jpdbReviewBridge,
        parser: this.parser,
        dictionaries: this.dictionaries,
        ensureStarterDictionary: onProgress => this.settingsDialog.ensureStarterDictionaryInstalled(onProgress),
        onSettingsChange: () => saveSettings(this.settings),
        applyTheme: () => this.applyTheme(),
        showSettings: panel => this.showSettings(panel),
        dismiss: options => this.dismiss(options),
    });
    private jpdbExtensions = new JpdbExtensionsController({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        immersionKit: this.immersionKit,
        jpdbKanji: this.jpdbKanji,
        rtk: this.rtk,
        audio: this.audio,
        parseJapanese: paragraphs => this.parseJapanese(paragraphs),
        setImmersionTranslationBlurred: this.setImmersionTranslationBlurred,
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
    private youtube = new YoutubeImmersionFilter({
        getSettings: () => this.settings,
        setEnabled: enabled => void this.setYoutubeImmersionEnabled(enabled),
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
        youtube: this.youtube,
        jpdbExtensions: this.jpdbExtensions,
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
        refreshNewTabIfCurrent: () => {
            if (this.newTab.isCurrentPage()) void this.newTab.renderPage();
        },
        clearDictionarySourceOpenOverrides: () => this.dictionarySourceOpenOverrides.clear(),
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
    private visiblePageScanInFlight = false;
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
    private dictionaryStyleElement?: HTMLStyleElement;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private audioLoadingRequest = 0;
    private cardRenderRequest = 0;
    private dictionaryRescanPending = false;
    private preloadedTermAudioKeys = new Set<string>();
    private wordNavigationStack: CardNavigationEntry[] = [];
    private currentWordNavigation?: CardNavigationEntry;
    private dictionarySourceOpenOverrides = new Map<string, boolean>();
    private cardRenderDataCache = new Map<string, { expiresAt: number; load: CardRenderDataLoad }>();
    private pressedKeys = new Set<string>();
    private hoverAnchorIds = new WeakMap<HTMLElement, number>();
    private nextHoverAnchorId = 1;
    private suppressSelectionLookupUntil = 0;
    private suppressWordClickUntil = 0;
    private pageHasJapaneseText = false;
    private pressLookup?: {
        pointerId: number;
        startX: number;
        startY: number;
        active: boolean;
        source: 'primary' | 'middle';
        captureTarget?: Element;
        lastWord?: HTMLElement;
    };
    private suppressMiddleAuxClickUntil = 0;

    constructor() {
        configureLogger({ settingsProvider: () => this.settings });
    }

    async init(options?: ReaderAppInitOptions): Promise<void> {
        const done = log.time('init', { href: location.href, devMode: Logger.isDevMode() });
        this.settings = await loadSettings();
        if (options?.isDemo) {
            this.settings.onboardingSeen = true;
            this.isDemo = true;
        }
        const shouldShowWelcome = options?.showWelcome ?? !this.isDemo;
        this.settings = applyUrlBootstrapSettings(this.settings);
        this.pageHasJapaneseText = documentHasJapaneseText();
        log.info('Settings loaded', loggingSettingsSummary(this.settings));
        const shouldWarmDictionaries = this.settings.localDictionariesEnabled && this.newTab.isCurrentPage();
        const dictionaryWarmup = shouldWarmDictionaries
            ? this.dictionaries.warm(this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local dictionary warmup failed', error);
            })
            : Promise.resolve();
        this.installStyles();
        this.applyTheme();
        await this.refreshDictionaryStyles();
        this.registerMenuCommands();
        this.bindEvents();
        initJpdbReviewPageBridge();
        if (this.newTab.isCurrentPage()) {
            await dictionaryWarmup;
            await this.newTab.renderPage();
            done();
            return;
        }

        if (isYomuHostedPassivePage(location.href)) {
            log.info('Hosted Yomu content page left passive', { href: location.href, demo: this.isDemo });
            done();
            return;
        }

        this.installFab();
        this.subtitles.init();
        this.ocr.init();
        this.youtube.init();
        this.jpdbExtensions.init();
        this.setupAutoScan();
        if (shouldShowWelcome && !isYomuHostedAppUrl(location.href)) {
            await this.onboarding.showIfNeeded();
        }
        if (this.canParseJapanese() && (this.settings.scanVisiblePage || this.settings.autoScanJapanese) && this.pageHasJapaneseText) {
            void this.scanVisiblePage({ silent: true });
        }
        done();
    }

    private registerMenuCommands(): void {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand(`${APP_NAME} settings`, () => this.showSettings());
            GM_registerMenuCommand(`${APP_NAME} scan visible page`, () => this.scanVisiblePage());
            GM_registerMenuCommand(`${APP_NAME} scan nearby images`, () => this.ocr.scanVisible());
            GM_registerMenuCommand(`${APP_NAME} open video player`, () => this.openVideoPlayer());
            GM_registerMenuCommand(`${APP_NAME} toggle YouTube filter`, () => void this.toggleYoutubeImmersion());
            GM_registerMenuCommand(`${APP_NAME} toggle puck`, () => {
                this.settings.showFloatingButton = !this.settings.showFloatingButton;
                void saveSettings(this.settings).then(() => this.installFab());
            });
        }
    }

    private openVideoPlayer(): void {
        const opened = window.open(VIDEO_PLAYER_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        if (!opened) location.href = VIDEO_PLAYER_PAGE_URL;
        log.info('Video player page opened', { url: VIDEO_PLAYER_PAGE_URL });
    }

    private installStyles(): void {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(READER_CSS);
            log.debug('Styles installed via GM_addStyle');
        } else {
            const style = document.createElement('style');
            style.textContent = READER_CSS;
            appendToDocumentHead(style);
            log.debug('Styles installed via document head');
        }
    }

    private applyTheme(): void {
        this.applyAccentColor(this.settings.accentColor);
        this.applyWordColors();
        document.documentElement.classList.toggle('jpdb-reader-theme-dark', this.settings.theme === 'dark');
        document.documentElement.classList.toggle('jpdb-reader-theme-light', this.settings.theme === 'light');
        const furiganaMode = effectiveFuriganaMode(this.settings);
        const wordHighlightMode = effectiveWordHighlightMode(this.settings);
        const wordColorSources = {
            highlight: effectiveReaderColorSource(this.settings, this.settings.wordHighlightColorSource),
            underline: effectiveReaderColorSource(this.settings, this.settings.wordUnderlineColorSource),
            text: effectiveReaderColorSource(this.settings, this.settings.wordTextColorSource),
        } satisfies Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>;
        const subtitleColorSources = {
            highlight: effectiveSubtitleColorSource(this.settings, this.settings.subtitleHighlightColorSource),
            underline: effectiveSubtitleColorSource(this.settings, this.settings.subtitleUnderlineColorSource),
            text: effectiveSubtitleColorSource(this.settings, this.settings.subtitleTextColorSource),
        } satisfies Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>;
        document.documentElement.classList.toggle('jpdb-reader-hide-known', furiganaMode === 'known-status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-status', wordHighlightMode === 'status');
        document.documentElement.classList.toggle('jpdb-reader-highlight-pitch', wordHighlightMode === 'pitch');
        document.documentElement.classList.toggle('jpdb-reader-highlight-off', wordHighlightMode === 'off');
        this.applyColorSourceClasses('word', wordColorSources);
        this.applyColorSourceClasses('subtitle', subtitleColorSources);
        log.debug('Theme applied', {
            theme: this.settings.theme,
            popupMode: this.settings.popupMode,
            furiganaMode,
            wordHighlightMode,
            wordColorSources,
            subtitleColorSources,
        });
    }

    private applyColorSourceClasses(scope: 'word' | 'subtitle', sources: Record<ColorChannel, Exclude<ReaderColorSource, 'auto'>>): void {
        COLOR_CHANNELS.forEach(channel => {
            COLOR_SOURCE_CLASSES.forEach(source => {
                document.documentElement.classList.toggle(`jpdb-reader-${scope}-${channel}-${source}`, sources[channel] === source);
            });
        });
    }

    private async refreshDictionaryStyles(): Promise<void> {
        const css = this.settings.localDictionariesEnabled
            ? await this.dictionaries.dictionaryStyleCss(this.settings.dictionaryPreferences).catch(error => {
                log.warn('Dictionary styles unavailable', error);
                return '';
            })
            : '';
        const existing = this.dictionaryStyleElement ?? document.getElementById('jpdb-reader-yomitan-dictionary-styles') as HTMLStyleElement | null;
        if (!css.trim()) {
            existing?.remove();
            this.dictionaryStyleElement = undefined;
            log.debug('Dictionary styles cleared');
            return;
        }
        const style = existing ?? document.createElement('style');
        style.id = 'jpdb-reader-yomitan-dictionary-styles';
        style.textContent = css;
        if (!style.isConnected) appendToDocumentHead(style);
        this.dictionaryStyleElement = style;
        log.debug('Dictionary styles refreshed', { bytes: css.length });
    }

    private scheduleDictionaryRescan(): void {
        if (this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.dictionaryRescanPending = true;
            log.debug('Dictionary rescan deferred until settings closes');
            return;
        }
        window.setTimeout(() => void this.reparseVisiblePage(), 120);
    }

    private async reparseVisiblePage(): Promise<void> {
        this.jpdb.clear();
        this.parser.clearLocalCache();
        const unwrapped = this.pauseAutoScanObserver(() => unwrapReaderWords(document));
        if (!this.canParseJapanese()) {
            log.debug('Reader words unwrapped without reparse because parsing is disabled', { unwrapped });
            return;
        }
        log.debug('Reparsing visible page', { unwrapped });
        await this.scanVisiblePage({ silent: true });
    }

    private applyAccentColor(color: string): void {
        const accentColor = sanitizeAccentColor(color);
        document.documentElement.style.setProperty('--jpdb-reader-accent', accentColor);
        document.documentElement.style.setProperty('--jpdb-reader-accent-soft', accentToRgba(accentColor, 0.18));
    }

    private applyWordColors(settings = this.settings): void {
        const colorMap = {
            new: sanitizeAccentColor(settings.wordColorNew),
            learning: sanitizeAccentColor(settings.wordColorLearning),
            known: sanitizeAccentColor(settings.wordColorKnown),
            due: sanitizeAccentColor(settings.wordColorDue),
            failed: sanitizeAccentColor(settings.wordColorFailed),
            ignored: sanitizeAccentColor(settings.wordColorIgnored),
        };
        Object.entries(colorMap).forEach(([state, color]) => {
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}`, color);
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}-soft`, accentToRgba(color, 0.16));
            document.documentElement.style.setProperty(`--jpdb-reader-state-${state}-strong`, accentToRgba(color, 0.28));
        });
        const pitchColorMap = {
            heiban: { color: sanitizeAccentColor(settings.pitchColorHeiban), alpha: 0.14 },
            atamadaka: { color: sanitizeAccentColor(settings.pitchColorAtamadaka), alpha: 0.14 },
            nakadaka: { color: sanitizeAccentColor(settings.pitchColorNakadaka), alpha: 0.16 },
            odaka: { color: sanitizeAccentColor(settings.pitchColorOdaka), alpha: 0.14 },
            kifuku: { color: sanitizeAccentColor(settings.pitchColorKifuku), alpha: 0.14 },
            unknown: { color: sanitizeAccentColor(settings.pitchColorUnknown), alpha: 0 },
        };
        Object.entries(pitchColorMap).forEach(([pattern, { color, alpha }]) => {
            document.documentElement.style.setProperty(`--jpdb-reader-pitch-${pattern}`, color);
            document.documentElement.style.setProperty(`--jpdb-reader-pitch-${pattern}-soft`, alpha > 0 ? accentToRgba(color, alpha) : 'transparent');
        });
    }

    private installFab(): void {
        this.floatingButton.install(
            this.settings,
            () => void saveSettings(this.settings),
            () => this.showSettings(),
        );
        log.debug('Floating puck refreshed', { enabled: this.settings.showFloatingButton });
    }

    destroy(): void {
        this.isDestroyed = true;
        this.abortController.abort();
        this.autoScanObserver?.disconnect();
        window.clearTimeout(this.autoScanTimer);
        window.clearTimeout(this.asbScanTimer);
        window.clearTimeout(this.selectionTimer);
        window.clearTimeout(this.hoverLookupTimer);
        window.clearTimeout(this.hoverCloseTimer);
        window.clearTimeout(this.hoverWatchTimer);
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.activePopoverResizeObserver?.disconnect();
        
        this.newTab.destroy();
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
        
        this.dictionaryStyleElement?.remove();
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
        log.debug('Auto-scan observer installed');
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
        if (this.isDestroyed) return;
        if (!this.settings.autoScanJapanese || !this.canParseJapanese()) return;
        if (!this.pageHasJapaneseText) return;
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) return;

        window.clearTimeout(this.autoScanTimer);
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.autoScanTimer = undefined;
            this.autoScanDeadline = 0;
            void this.scanAsbPlayerSubtitles();
            if ((collectSiteScanTargets(1)?.length ?? 0) > 0 || collectVisibleTextTargets(1).length > 0) {
                void this.scanVisiblePage({ silent: true });
            }
        }, delay);
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (this.isDestroyed) return;
        if (!this.settings.autoScanJapanese || !this.canParseJapanese()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        log.debug('Binding reader event handlers');
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
                log.debug('Shortcut closing active reader dialog');
                this.dismiss({ suppressHoverTarget: true });
                return;
            }
            if ((this.settings.shortcuts.hoverLookup ?? '').trim() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
            if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
                event.preventDefault();
                log.info('Shortcut triggered visible page scan');
                void this.scanVisiblePage({ silent: true });
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
            if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
                event.preventDefault();
                log.info('Shortcut toggled YouTube filter');
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
                log.debug('Shortcut triggered audio playback', { term: this.lastCard.spelling });
                void this.playAudio(this.lastCard);
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
        if (this.settings.twoButtonReviews) {
            if (matchesShortcut(event, this.settings.shortcuts.gradeFail)) return 'fail';
            if (matchesShortcut(event, this.settings.shortcuts.gradePass)) return 'pass';
            return null;
        }
        if (matchesShortcut(event, this.settings.shortcuts.gradeNothing)) return 'nothing';
        if (matchesShortcut(event, this.settings.shortcuts.gradeSomething)) return 'something';
        if (matchesShortcut(event, this.settings.shortcuts.gradeHard)) return 'hard';
        if (matchesShortcut(event, this.settings.shortcuts.gradeOkay)) return 'okay';
        if (matchesShortcut(event, this.settings.shortcuts.gradeEasy)) return 'easy';
        return null;
    }

    private shouldLookupOnHover(event: MouseEvent | KeyboardEvent): boolean {
        return this.settings.lookupOnHover && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private beginPressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        if (this.isInsideActivePopover(event.target as Node | null)) return;
        const isMiddleScan = this.shouldCaptureMiddleMouseLookup(event);
        if (!isMiddleScan) {
            if (!this.settings.lookupOnClick && !this.settings.lookupOnHover) return;
            if (event.pointerType === 'mouse' && event.button !== 0) return;
        }

        const word = this.wordFromEventTarget(event.target);
        if (!isMiddleScan && !word) return;
        if (isMiddleScan) this.captureMiddleMouseLookup(event);

        this.pressLookup = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            active: isMiddleScan,
            source: isMiddleScan ? 'middle' : 'primary',
            captureTarget: isMiddleScan && event.target instanceof Element ? event.target : undefined,
        };

        if (isMiddleScan) this.updatePressLookup(event);
    }

    private updatePressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };

        if (!pressLookup.active) {
            const distance = Math.hypot(event.clientX - pressLookup.startX, event.clientY - pressLookup.startY);
            if (distance < 8) return;
            pressLookup.active = true;
            this.suppressWordClickUntil = Date.now() + 700;
            this.suppressedHoverWord = undefined;
        }

        event.preventDefault();
        event.stopPropagation();

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
        this.rememberHoverPopoverPointer(event);
        if (word === pressLookup.lastWord) {
            if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) this.scheduleActivePopoverReposition();
            return;
        }
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

    private endPressLookup(event: PointerEvent): void {
        if (this.isDestroyed) return;
        const pressLookup = this.pressLookup;
        if (!pressLookup || pressLookup.pointerId !== event.pointerId) return;
        if (pressLookup.active) {
            this.suppressWordClickUntil = Date.now() + 700;
            this.suppressSelectionLookupUntil = Date.now() + 350;
        }
        if (pressLookup.source === 'middle') {
            event.preventDefault();
            event.stopPropagation();
            this.finishMiddleMouseLookup(pressLookup);
            if (this.activePopoverMode === 'hover' && !this.isHoverContextActive()) this.scheduleHoverClose();
        }
        this.pressLookup = undefined;
    }

    private shouldCaptureMiddleMouseLookup(event: MouseEvent | PointerEvent): boolean {
        if (!this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
        if ('pointerType' in event && event.pointerType !== 'mouse') return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        const target = event.target instanceof Element ? event.target : null;
        return !this.isNativeMiddleClickTarget(target);
    }

    private captureMiddleMouseLookup(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.suppressMiddleAuxClickUntil = Date.now() + 1200;
        this.suppressSelectionLookupUntil = Date.now() + 350;
        document.documentElement.classList.add('jpdb-reader-middle-scan-active');
        log.debug('Middle-mouse scan started');
        try {
            if (event.target instanceof Element) event.target.setPointerCapture?.(event.pointerId);
        } catch {
            // Some pages detach nodes during pointerdown; capture is only an enhancement.
        }
    }

    private finishMiddleMouseLookup(pressLookup: { pointerId: number; captureTarget?: Element }): void {
        this.suppressMiddleAuxClickUntil = Date.now() + 700;
        document.documentElement.classList.remove('jpdb-reader-middle-scan-active');
        log.debug('Middle-mouse scan finished');
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
        if (!this.settings.audioEnabled || !this.settings.autoPlayAudio) return false;
        const card = this.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
        if (!card) return false;
        const key = cardKey(card);
        if (this.preloadedTermAudioKeys.has(key)) return false;
        this.preloadedTermAudioKeys.add(key);
        this.audio.preload(card, {
            sourceLimit: options.sourceLimit ?? 1,
            candidateLimit: options.candidateLimit ?? 1,
        });
        return true;
    }

    private preloadNearbyReaderWordAudio(word: HTMLElement): void {
        const words = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(candidate => candidate.isConnected && this.canLookupReaderWord(candidate));
        const index = words.indexOf(word);
        if (index < 0) return;

        let queued = 0;
        for (const candidate of words.slice(index + 1)) {
            if (this.preloadReaderWordAudio(candidate)) queued++;
            if (queued >= NEARBY_TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        if (queued) log.debugThrottled('nearby-audio-preload', 2500, 'Nearby term audio preloads queued', { queued });
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
        if (this.isDestroyed) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (this.pressLookup?.source === 'middle') return;
        if (event.pointerType === 'touch') return;
        if (this.isInsideActivePopover(event.target as Node | null)) {
            this.cancelHoverClose();
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || !this.canHoverLookupReaderWord(word)) {
            const candidate = this.shouldLookupOnHover(event)
                ? this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target)
                : null;
            if (candidate && this.isActivePointerTextLookup(candidate)) {
                this.rememberHoverPopoverPointer(event);
                this.cancelHoverClose();
                this.refreshActiveHoverAnchor(candidate.anchor);
                this.scheduleActivePopoverReposition();
                return;
            }
            if (!candidate) this.cancelPendingHoverLookup();
            if (this.activePopoverMode === 'hover' && !this.isHoverContextActive({ ignoreCssHover: true })) {
                this.scheduleHoverClose(undefined, { ignoreCssHover: true });
            }
            if (!this.shouldLookupOnHover(event)) return;
            if (candidate) {
                this.rememberHoverPopoverPointer(event);
                this.schedulePointerTextLookup(candidate, event);
            }
            return;
        }
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
        if (this.isInsideActivePopover(event.target as Node | null)) {
            if (this.isInsideActivePopover(related) || (this.activeHoverWord && this.isInsideNode(related, this.activeHoverWord))) return;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
            return;
        }

        const word = (event.target as HTMLElement).closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || (related && word.contains(related))) return;
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.hoverPendingWord === word || this.hoverPendingLookupKey === hoverLookupKey || this.hoverLookupInFlightKey === hoverLookupKey) {
            this.cancelPendingHoverLookup();
        }
        if (this.suppressedHoverWord === word) this.suppressedHoverWord = undefined;
        if (this.suppressedHoverLookupKey === hoverLookupKey) this.suppressedHoverLookupKey = '';

        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            if (this.isInsideActivePopover(related)) {
                this.cancelHoverClose();
                return;
            }
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        }
    }

    private scheduleHoverLookupAtPointer(event: KeyboardEvent): void {
        if (this.isDestroyed) return;
        if (!this.lastPointerPosition) return;
        this.hoverPopoverPointerPosition = { ...this.lastPointerPosition };
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) as HTMLElement | null;
        const word = target?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (!word || !this.canHoverLookupReaderWord(word)) {
            const candidate = this.lookupCandidateFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y, target);
            if (candidate) this.schedulePointerTextLookup(candidate, event);
            return;
        }
        this.scheduleHoverLookup(word, event);
    }

    private dismissHoverPopoverForOutsidePointer(event: PointerEvent): void {
        if (this.isDestroyed || this.activePopoverMode !== 'hover') return;
        const target = event.target as Node | null;
        if (this.isInsideActivePopover(target)) return;
        if (this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord)) return;
        this.dismiss({ suppressHoverTarget: false });
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
        if (this.suppressedHoverWord === word || (hoverLookupKey && this.suppressedHoverLookupKey === hoverLookupKey)) return;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) return;
        if ((this.hoverPendingWord === word || (hoverLookupKey && this.hoverPendingLookupKey === hoverLookupKey)) && this.hoverLookupTimer) return;
        if (hoverLookupKey && this.hoverLookupInFlightKey === hoverLookupKey) return;

        this.preloadHoverWordAudio(word);
        this.cancelHoverClose();
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = word;
        this.hoverPendingLookupKey = hoverLookupKey;
        const runLookup = () => {
            if (this.hoverLookupGeneration !== hoverLookupGeneration) return;
            this.hoverLookupTimer = undefined;
            this.hoverPendingWord = undefined;
            this.hoverPendingLookupKey = '';
            let activeWord = word;
            if (!activeWord.isConnected && this.lastPointerPosition) {
                activeWord = this.wordFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y) ?? activeWord;
            }
            if (!activeWord.isConnected || this.suppressedHoverWord === activeWord) return;
            const activeHoverLookupKey = this.hoverLookupKeyForWord(activeWord);
            if (activeHoverLookupKey && this.suppressedHoverLookupKey === activeHoverLookupKey) return;
            if (this.isActiveHoverLookup(activeHoverLookupKey)) {
                this.refreshActiveHoverAnchor(activeWord);
                return;
            }
            if (!this.isWordHoverActive(activeWord) || !this.settings.lookupOnHover) return;
            if (!shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys)) return;
            if (activeWord.closest('.jpdb-subtitle-player') && this.settings.subtitleMiningPause) pauseActiveVideo();
            if (activeHoverLookupKey) this.hoverLookupInFlightKey = activeHoverLookupKey;
            void this.showWord(activeWord, { trigger: 'hover', hoverLookupGeneration }).finally(() => {
                if (this.hoverLookupInFlightKey === activeHoverLookupKey) this.hoverLookupInFlightKey = '';
            });
        };
        const delay = Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) {
            runLookup();
            return;
        }
        this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private schedulePointerTextLookup(candidate: PointerTextLookup, event: MouseEvent | KeyboardEvent): void {
        if (this.isActivePointerTextLookup(candidate)) {
            this.refreshActiveHoverAnchor(candidate.anchor);
            return;
        }
        const hoverLookupKey = this.pendingPointerTextLookupKey(candidate);
        if (hoverLookupKey && (this.hoverPendingLookupKey === hoverLookupKey && this.hoverLookupTimer)) return;
        if (hoverLookupKey && this.hoverLookupInFlightKey === hoverLookupKey) return;
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
        if (!options.ignoreCssHover && this.activePopover?.matches(':hover')) return true;
        if (options.ignorePointerPosition) return false;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        return this.isInsideActivePopover(target) || Boolean(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
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
        if (!active || this.activePopoverMode !== 'hover' || !this.activePopover) return false;
        if (active.anchor !== candidate.anchor || active.text !== candidate.text) return false;
        return (active.start <= candidate.offset && candidate.offset < active.end)
            || (active.start < candidate.offset && candidate.offset <= active.end);
    }

    private refreshActiveHoverAnchor(anchor: HTMLElement): void {
        if (!this.activePopover || this.activePopoverMode !== 'hover' || !anchor.isConnected) return;
        if (this.activePopoverAnchor === anchor && this.activeHoverWord === anchor) return;
        this.activePopoverAnchor = anchor;
        this.activeHoverWord = anchor;
        const rect = anchor.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
        this.repositionActivePopover();
    }

    private isInsideActivePopover(node: Node | null): boolean {
        return Boolean(this.activePopover && this.isInsideNode(node, this.activePopover));
    }

    private isInsideNode(node: Node | null, root: Node): boolean {
        return Boolean(node && (node === root || root.contains(node)));
    }

    private async toggleYoutubeImmersion(): Promise<void> {
        await this.setYoutubeImmersionEnabled(!this.settings.youtubeImmersionEnabled);
    }

    private async setYoutubeImmersionEnabled(enabled: boolean): Promise<void> {
        this.settings.youtubeImmersionEnabled = enabled;
        await saveSettings(this.settings);
        this.youtube.refresh();
        log.info('YouTube immersion setting changed', { enabled });
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'youtubeToggleToastOn' : 'youtubeToggleToastOff'));
    }

    private hasOpenReaderDialog(): boolean {
        return Boolean(this.activePopover || this.activeBackdrop || document.querySelector('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop'));
    }

    private async parseJapanese(paragraphs: string[]): Promise<JPDBToken[][]> {
        log.debugThrottled('parse-japanese', 1500, 'Parsing Japanese text', { paragraphs: paragraphs.length });
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
        const selected = getSelectionText();
        if (selected.length < 1 || selected.length > 120 || !HAS_JAPANESE.test(selected)) return;
        if ((document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) return;
        log.debug('Looking up selected text', { length: selected.length });
        await this.lookupText(selected, getSelectionSentence());
    }

    private async lookupText(text: string, sentence = text, options: { navigation?: CardNavigationMode; preservePosition?: boolean } = {}): Promise<void> {
        const selected = text.replace(/\s+/g, ' ').trim();
        if (!selected || !HAS_JAPANESE.test(selected)) return;
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        const preservePosition = options.preservePosition ?? (navigation !== 'reset' && Boolean(this.activePopover));
        const done = log.time('lookupText', { length: selected.length, trigger });
        try {
            const [tokens] = await this.parseJapanese([sentence]);
            const selectedToken = pickTokenForSelection(tokens, selected);
            if (!selectedToken) {
                if (tokens.length) {
                    log.debug('Lookup produced token list', { selected, tokenCount: tokens.length });
                    this.showTokenList(tokens, selected, anchor, { trigger, navigation, preservePosition });
                    return;
                }
                const localEntries = this.settings.localDictionariesEnabled
                    ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                    : [];
                if (localEntries.length) {
                    log.debug('Lookup fell back to local dictionary entry', { selected, entries: localEntries.length });
                    void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, anchor, { trigger, navigation, preservePosition });
                    return;
                }
                log.debug('Lookup found no entries; showing fallback card', { selected });
                void this.showCard(this.parser.fallbackCardFromText(selected), sentence, anchor, { trigger, navigation, preservePosition });
                return;
            }
            log.debug('Lookup selected token', { selected, term: selectedToken.card.spelling, source: selectedToken.card.source ?? 'jpdb' });
            void this.showCard(selectedToken.card, selectedToken.sentence ?? sentence, anchor, { trigger, navigation, preservePosition });
        } catch (error) {
            log.warn('Lookup failed; trying local fallback', { selected }, error);
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : [];
            if (localEntries.length) void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, anchor, { trigger, navigation, preservePosition });
            else {
                this.toast(error instanceof Error ? error.message : 'JPDB lookup failed.');
                void this.showCard(this.parser.fallbackCardFromText(selected), sentence, anchor, { trigger, navigation, preservePosition });
            }
        } finally {
            done();
        }
    }

    private handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        const link = (event.target as HTMLElement).closest?.<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]');
        if (!link) return false;
        const query = link.dataset.dictionaryLookup?.replace(/\s+/g, ' ').trim() ?? '';
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
            const localEntries = this.settings.localDictionariesEnabled
                ? await this.dictionaries.lookup(query, normalizedReading || query, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
                    log.warn('Dictionary reference local lookup failed', { query, reading: normalizedReading, sourceDictionary }, error);
                    return [];
                })
                : [];
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

    private lookupCandidateFromPoint(x: number, y: number, eventTarget: EventTarget | null): PointerTextLookup | null {
        const element = eventTarget instanceof Element ? eventTarget : document.elementFromPoint(x, y);
        if (!element || this.isNativeTextLookupTarget(element)) return null;

        const position = caretTextPositionFromPoint(x, y);
        if (!position || !position.node.parentElement) return null;
        if (!element.contains(position.node) && !position.node.parentElement.contains(element)) return null;
        if (position.node.parentElement.closest('.jpdb-reader-word')) return null;

        const characterOffset = pointerTextCharacterOffset(position.node, position.offset, x, y);
        if (characterOffset === null) return null;
        const run = japaneseRunAt(position.node.data, characterOffset);
        if (!run) return null;
        if (isLowValuePointerText(position.node.data, position.node.parentElement)) return null;
        return {
            text: position.node.data,
            offset: run.offset,
            start: run.start,
            end: run.end,
            anchor: position.node.parentElement,
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
        const sentence = candidate.text.replace(/\s+/g, ' ').trim();
        if (!sentence || !HAS_JAPANESE.test(sentence)) return;
        const done = log.time('lookupTextAtPointer', { length: sentence.length, offset: candidate.offset, trigger });
        try {
            const [tokens] = await this.parseJapanese([candidate.text]);
            const token = (tokens ?? []).find(item =>
                (item.start <= candidate.offset && candidate.offset < item.end)
                || (item.start < candidate.offset && candidate.offset <= item.end),
            );
            if (token) {
                const pointerTextLookup = { anchor: candidate.anchor, text: candidate.text, start: token.start, end: token.end };
                await this.showCard(token.card, token.sentence ?? sentence, candidate.anchor, {
                    trigger,
                    navigation: options.navigation ?? 'reset',
                    preservePosition: options.preservePosition,
                    hoverLookupKey: trigger === 'hover' ? this.activePointerTextLookupKey(candidate, token.start, token.end, token.card) : undefined,
                    hoverLookupGeneration: options.hoverLookupGeneration,
                    pointerTextLookup: trigger === 'hover' ? pointerTextLookup : undefined,
                });
                return;
            }

            const localMatch = await this.lookupLocalEntryAtOffset(candidate.text, candidate.offset);
            if (localMatch) {
                const card = this.parser.localCardFromEntry(localMatch.entry);
                const pointerTextLookup = { anchor: candidate.anchor, text: candidate.text, start: localMatch.start, end: localMatch.end };
                await this.showCard(card, sentence, candidate.anchor, {
                    trigger,
                    navigation: options.navigation ?? 'reset',
                    preservePosition: options.preservePosition,
                    hoverLookupKey: trigger === 'hover' ? this.activePointerTextLookupKey(candidate, localMatch.start, localMatch.end, card) : undefined,
                    hoverLookupGeneration: options.hoverLookupGeneration,
                    pointerTextLookup: trigger === 'hover' ? pointerTextLookup : undefined,
                });
                return;
            }
            const fallbackTerm = fallbackLookupTermAtOffset(candidate.text, candidate.offset);
            if (fallbackTerm) {
                log.debug('Pointer text lookup found no entries; showing fallback card', { fallbackTerm, offset: candidate.offset });
                const card = this.parser.fallbackCardFromText(fallbackTerm);
                const pointerTextLookup = { anchor: candidate.anchor, text: candidate.text, start: candidate.start, end: candidate.end };
                await this.showCard(card, sentence, candidate.anchor, {
                    trigger,
                    navigation: options.navigation ?? 'reset',
                    preservePosition: options.preservePosition,
                    hoverLookupKey: trigger === 'hover' ? this.activePointerTextLookupKey(candidate, candidate.start, candidate.end, card) : undefined,
                    hoverLookupGeneration: options.hoverLookupGeneration,
                    pointerTextLookup: trigger === 'hover' ? pointerTextLookup : undefined,
                });
                return;
            }
            log.debug('Pointer text lookup found no local entry', { offset: candidate.offset });
        } catch (error) {
            log.debug('Pointer text lookup failed quietly', { offset: candidate.offset }, error);
        } finally {
            done();
        }
    }

    private async lookupLocalEntryAtOffset(text: string, offset: number): Promise<{ entry: YomitanTermEntry; start: number; end: number } | undefined> {
        if (!this.settings.localDictionariesEnabled) return undefined;
        const run = japaneseRunAt(text, offset);
        if (!run) return undefined;

        const maxEnd = Math.min(run.end, run.offset + 18);
        for (let end = maxEnd; end > run.offset; end--) {
            const surface = text.slice(run.offset, end);
            const entries = await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []);
            if (entries[0]) return { entry: entries[0], start: run.offset, end };
        }
        if (run.offset > run.start) {
            for (let start = run.offset - 1; start >= run.start; start--) {
                const surface = text.slice(start, run.offset + 1);
                const entries = await this.dictionaries.lookup(surface, surface, 1, this.settings.dictionaryPreferences).catch(() => []);
                if (entries[0]) return { entry: entries[0], start, end: run.offset + 1 };
            }
        }
        return undefined;
    }

    private async scanVisiblePage(options: { silent?: boolean } = {}): Promise<void> {
        if (this.visiblePageScanInFlight) {
            log.debugThrottled('visible-page-scan-skipped', 1000, 'Visible page scan skipped because one is already running');
            return;
        }
        this.visiblePageScanInFlight = true;
        const done = log.time('scanVisiblePage', { silent: Boolean(options.silent) });
        try {
            const targets = collectScanTargets();
            if (!targets.length) {
                log.debug('Visible page scan found no targets', { silent: Boolean(options.silent) });
                if (!options.silent) this.toast('No unscanned Japanese text found.');
                return;
            }

            const parsed = await this.parseJapanese(targets.map(target => target.text));
            this.pauseAutoScanObserver(() => {
                targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
            });
            this.preloadTermAudioForTokens(parsed.flat());
            this.immersionPopover.preloadForTokens(parsed.flat());
            void this.enrichAnkiWords(parsed.flat());
            log.debugThrottled('visible-page-scan-applied', 2500, 'Visible page scan applied tokens', {
                targets: targets.length,
                tokens: parsed.reduce((sum, tokens) => sum + tokens.length, 0),
            });
        } catch (error) {
            log.warn('Visible page scan failed', error);
            if (!options.silent) this.toast(error instanceof Error ? error.message : 'JPDB scan failed.');
        } finally {
            this.visiblePageScanInFlight = false;
            done();
        }
    }

    private async scanAsbPlayerSubtitles(): Promise<void> {
        const roots = Array.from(document.querySelectorAll<HTMLElement>('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
        if (!roots.length) return;

        const targets = roots.flatMap(root => collectTextTargetsIn(root, 12, false)).slice(0, 12);
        if (!targets.length) return;

        try {
            const parsed = await this.parseJapanese(targets.map(target => target.text));
            this.pauseAutoScanObserver(() => {
                targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
            });
            this.preloadTermAudioForTokens(parsed.flat());
            this.immersionPopover.preloadForTokens(parsed.flat());
            void this.enrichAnkiWords(parsed.flat());
            log.debugThrottled('asb-scan', 2500, 'ASB subtitles scanned', {
                targets: targets.length,
                tokens: parsed.reduce((sum, tokens) => sum + tokens.length, 0),
            });
        } catch (error) {
            log.debugThrottled('asb-scan-failed', 5000, 'ASB subtitle scan failed quietly', error);
            // External subtitle overlays update frequently; the regular popup path still reports API errors.
        }
    }

    private async showWord(word: HTMLElement, options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; hoverLookupGeneration?: number } = {}): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.getCachedCard(vid, sid);
        if (!card) {
            log.warn('Clicked word missing from cache', { vid, sid });
            this.toast('That word is no longer in the local JPDB cache. Scan it again.');
            return;
        }
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        if (insideReaderPopup && word.closest('.jpdb-reader-example-card')) {
            this.immersionPopover.rememberPageMiningContext(card, word.dataset.sentence || undefined, word);
        }
        const anchor = insideReaderPopup
            ? this.activePopoverAnchor ?? undefined
            : word;
        const trigger = insideReaderPopup && this.activePopoverMode === 'hover'
            ? 'hover'
            : options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? (insideReaderPopup && trigger === 'modal' ? 'push-current' : 'reset');
        const hoverLookupKey = trigger === 'hover' ? this.hoverLookupKeyForWord(word) : undefined;
        if (hoverLookupKey && this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return;
        }
        log.debug('Showing word card from rendered token', { term: card.spelling, trigger, source: card.source ?? 'jpdb' });
        this.preloadHoverWordAudio(word);
        await this.showCard(card, word.dataset.sentence || undefined, anchor, {
            trigger,
            navigation,
            preservePosition: insideReaderPopup,
            hoverLookupKey,
            hoverLookupGeneration: options.hoverLookupGeneration,
        });
    }

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options: Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition'> = {}): void {
        if (!tokens.length) return;
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        if (trigger === 'modal' && (options.navigation ?? 'reset') === 'reset') this.clearWordNavigation();
        log.debug('Rendering token disambiguation popup', { selected, tokens: tokens.length, trigger });
        const popover = this.createPopover();
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-pos">Selection</div>
            <div class="jpdb-reader-meanings">
                ${tokens.map(token => `
                    <button class="jpdb-reader-btn" data-vid="${token.card.vid}" data-sid="${token.card.sid}">
                        ${escapeHtml(token.card.spelling)} ${token.card.reading !== token.card.spelling ? `<span class="jpdb-reader-reading">${escapeHtml(token.card.reading)}</span>` : ''}
                    </button>
                `).join('')}
            </div>
            <div class="jpdb-reader-help">Parsed from: ${escapeHtml(selected)}</div>
        `);
        popover.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest('button[data-vid]') as HTMLButtonElement | null;
            if (!button) return;
            const card = this.getCachedCard(Number(button.dataset.vid), Number(button.dataset.sid));
            if (card) void this.showCard(card, tokens.find(t => t.card === card)?.sentence, anchor, { trigger, navigation: options.navigation ?? 'reset', preservePosition: true });
        });
        this.mountPopover(popover, anchor, { mode: trigger, preservePosition: options.preservePosition });
        void this.parsePopoverJapanese(popover);
    }

    private showLocalDictionaryPopup(term: string, entries: YomitanTermEntry[], anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): void {
        log.debug('Rendering local dictionary popup', { term, entries: entries.length, trigger });
        const popover = this.createPopover();
        const grouped = groupTermEntriesByDictionary(entries);
        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            <div class="jpdb-reader-header">
                <div>
                    <div class="jpdb-reader-spelling">${escapeHtml(term)}</div>
                    <div class="jpdb-reader-reading">Yomitan dictionaries</div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack">
                ${renderLocalDefinitionSourcesSection(
                    Array.from(grouped.keys()),
                    grouped,
                    this.settings,
                    (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
                    name => this.dictionaryLabel(name),
                    { spelling: term, reading: '' },
                )}
            </div>
        `);
        popover.addEventListener('click', event => {
            this.handleDictionaryLookupLink(event, anchor, trigger);
        });
        this.mountPopover(popover, anchor, { mode: trigger });
        void this.parsePopoverJapanese(popover);
    }

    private async showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options: CardDisplayOptions = {}): Promise<void> {
        this.lastCard = card;
        this.lastCardSentence = sentence;
        const cardStates = normalizeCardStates(card.cardState);
        const state = primaryCardState(cardStates);
        const popover = this.createPopover();
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        const hoverLookupGeneration = trigger === 'hover' ? options.hoverLookupGeneration : undefined;
        const isCurrentHoverCard = () => hoverLookupGeneration === undefined || this.hoverLookupGeneration === hoverLookupGeneration;
        this.updateWordNavigation(card, sentence, trigger, navigation);
        const done = log.time('showCard', { term: card.spelling, source: card.source ?? 'jpdb', trigger });
        if (!this.immersionPopover.hasActiveContext(card, sentence)) {
            this.immersionPopover.rememberPageMiningContext(card, sentence, anchor);
        }
        const fallbackAnkiLookup: AnkiLookupResult = { state: 'not-in-deck', notes: [], primary: null };
        this.lastAnkiLookup = fallbackAnkiLookup;
        const renderData = this.loadCardRenderData(card);
        const immersionExamples = this.settings.immersionKitEnabled
            ? this.immersionPopover.searchExamples(card)
            : undefined;
        const instantLocalEntries = await waitForInstantData(renderData.localEntries, INSTANT_DICTIONARY_RENDER_WAIT_MS);
        if (!isCurrentHoverCard()) {
            log.debug('Discarding stale hover card before mount', { term: card.spelling, hoverLookupGeneration });
            done();
            return;
        }
        const initialData: CardRenderData & { loading: boolean } = {
            localEntries: instantLocalEntries ?? [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: fallbackAnkiLookup,
            jpdbDecks: [],
            ankiDecks: [],
            loading: true,
        };
        setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, initialData));
        this.installCardPopoverHandlers(popover, card, sentence, anchor, trigger);
        this.mountPopover(popover, anchor, {
            mode: trigger,
            preservePosition: options.preservePosition ?? (trigger === 'modal' && navigation !== 'reset'),
            hoverLookupKey: options.hoverLookupKey,
            pointerTextLookup: options.pointerTextLookup,
        });
        const requestId = ++this.cardRenderRequest;
        log.debug('Card shell mounted', { term: card.spelling, trigger, instantLocalEntries: instantLocalEntries?.length ?? 0 });
        if (options.autoPlay !== false && isCurrentHoverCard() && this.shouldAutoPlay(card)) {
            void this.playAudio(card, { hoverLookupGeneration });
        }
        if (instantLocalEntries?.length) void this.parsePopoverJapanese(popover);
        this.installStudyTranslationLoader(popover, sentence);

        let fullRenderCompleted = false;
        if (!instantLocalEntries) {
            void renderData.localEntries.then(localEntries => {
                if (!isCurrentHoverCard() || fullRenderCompleted || requestId !== this.cardRenderRequest || !popover.isConnected || this.activePopover !== popover) return;
                setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, {
                    localEntries,
                    kanjiEntries: [],
                    metaEntries: [],
                    ankiLookup: this.lastAnkiLookup ?? fallbackAnkiLookup,
                    jpdbDecks: [],
                    ankiDecks: [],
                    loading: true,
                }));
                log.debug('Card local dictionaries rendered', { term: card.spelling, localEntries: localEntries.length });
                this.repositionActivePopover();
                void this.parsePopoverJapanese(popover);
            });
        }

        const { localEntries, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, ankiDecks } = await renderData.all;
        fullRenderCompleted = true;
        if (!isCurrentHoverCard() || requestId !== this.cardRenderRequest || !popover.isConnected || this.activePopover !== popover) {
            log.debug('Discarding stale card render', { term: card.spelling, requestId });
            done();
            return;
        }
        this.lastAnkiLookup = ankiLookup;
        this.applyAnkiLookupToRenderedWords(card, ankiLookup);
        setInnerHtml(popover, this.renderCardPopoverContent(card, sentence, trigger, {
            localEntries,
            kanjiEntries,
            metaEntries,
            ankiLookup,
            jpdbDecks,
            ankiDecks,
            loading: false,
        }));

        log.debug('Card rendered', {
            term: card.spelling,
            localEntries: localEntries.length,
            kanjiEntries: kanjiEntries.length,
            metaEntries: metaEntries.length,
            ankiState: ankiLookup.state,
            hasJpdb: this.isJpdbBackedCard(card),
        });
        this.repositionActivePopover();
        void this.parsePopoverJapanese(popover);
        void this.immersionPopover.loadExamples(popover, card, immersionExamples);
        this.installStudyTranslationLoader(popover, sentence);
        done();
    }

    private renderCardPopoverContent(
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData & { loading: boolean },
    ): string {
        const cardStates = normalizeCardStates(card.cardState);
        const state = primaryCardState(cardStates);
        const storedContext = data.loading ? null : loadMiningContext(card.spelling);
        const jpdbUrl = `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
        const cardPos = formatPartOfSpeech(card.partOfSpeech);
        const cardPosDetails = formatPartOfSpeechDetails(card.partOfSpeech);
        const language = this.settings.interfaceLanguage;
        const hasJpdb = this.isJpdbBackedCard(card);
        const miningDeckLabel = this.settings.miningDeck.trim() || 'forq';
        const selectedDeckLabel = this.jpdbDeckLabel(miningDeckLabel, data.jpdbDecks);
        const reviewBlockReason = !data.ankiLookup.primary?.primaryCardId ? this.reviewBlockReason(cardStates, language) : '';
        const miningActions = this.renderJpdbMiningActions(cardStates, language, data, hasJpdb);
        const ankiActions = data.loading ? '' : renderAnkiActionRow(data.ankiLookup, this.settings);
        const reviewButtons = this.renderCardReviewButtons(cardStates, data, hasJpdb, selectedDeckLabel, reviewBlockReason, language);
        const metaItems = this.renderCardMetaItems(card, hasJpdb, state, data);
        const loadingDetails = this.renderCardLoadingDetails(data.loading);

        return `
            <div class="jpdb-reader-popover-body">
                <div class="jpdb-reader-sheet-handle"></div>
                ${this.renderWordHistoryNavigation(language, trigger)}
                <div class="jpdb-reader-header">
                    <div class="jpdb-reader-heading">
                        <div class="jpdb-reader-title-row">
                            <div class="jpdb-reader-spelling jpdb-${state}">${renderSpellingForKanjiNavigation(card.spelling, language)}</div>
                            ${card.reading !== card.spelling ? `<div class="jpdb-reader-reading">${escapeHtml(card.reading)}</div>` : ''}
                            ${metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : ''}
                        </div>
                        ${this.renderWordPills(card, jpdbUrl, data.metaEntries)}
                    </div>
                    <div class="jpdb-reader-card-tools">
                        ${this.settings.showPitchAccent ? renderPitch(card, data.metaEntries) : ''}
                        <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="audio" type="button" aria-label="${uiText(language, 'playAudio')}" title="${uiText(language, 'playAudio')}">${speakerIcon()}</button>
                    </div>
                </div>
                ${cardPos ? `<div class="jpdb-reader-pos" title="${escapeHtml(cardPosDetails)}">${escapeHtml(cardPos)}</div>` : ''}
                ${this.renderDefinitionSources(card, data.localEntries, sentence)}
                ${loadingDetails}
                ${data.loading ? '' : renderAnkiExistingSection(data.ankiLookup, storedContext)}
                ${renderKanjiDefinitions(data.kanjiEntries, (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded), name => this.dictionaryLabel(name))}
            </div>
            <div class="jpdb-reader-actions${miningActions ? ' jpdb-reader-actions-has-mining' : ''}">
                ${miningActions ? '<div class="jpdb-reader-actions-gutter"><button class="jpdb-reader-mining-collapse" type="button" data-action="mining-collapse" aria-expanded="true" title="Hide mining actions" aria-label="Hide mining actions">-</button></div>' : ''}
                ${miningActions}
                ${ankiActions}
                ${reviewButtons}
            </div>
        `;
    }

    private renderJpdbMiningActions(
        cardStates: ReturnType<typeof normalizeCardStates>,
        language: InterfaceLanguage,
        data: CardRenderData & { loading: boolean },
        hasJpdb: boolean,
    ): string {
        if (!hasJpdb || !this.settings.jpdbMiningEnabled) return '';
        const deckOptions = this.renderDeckChoiceOptions(data.jpdbDecks, data.ankiDecks, true);
        const addDeckSelect = deckOptions
            ? `<select class="jpdb-reader-add-deck-select" data-add-deck-select aria-label="${escapeHtml(uiText(language, 'deck'))}">${deckOptions}</select>`
            : '';
        const isNeverForget = cardStates.includes('never-forget');
        const isBlacklisted = cardStates.includes('blacklisted');
        const neverForgetTitle = isNeverForget ? uiText(language, 'forgetHint') : uiText(language, 'neverHint');
        const blacklistTitle = isBlacklisted ? uiText(language, 'unlistHint') : uiText(language, 'blacklistHint');
        const addToDeckLabel = `${uiText(language, 'addToDeck')} +`;
        return `
                <div class="jpdb-reader-mining-details" role="group" aria-label="${escapeHtml(uiText(language, 'deckActions'))}">
                    <div class="jpdb-reader-row jpdb-reader-mining-action-row" style="--cols: 3">
                        <button class="jpdb-reader-btn add jpdb-reader-mining-title" data-action="deck-picker" title="${escapeHtml(uiText(language, 'addToDeckHint'))}" aria-expanded="false">${escapeHtml(addToDeckLabel)}</button>
                        <button class="jpdb-reader-btn nf${isNeverForget ? ' danger' : ''}" data-action="neverforget" title="${escapeHtml(neverForgetTitle)}" aria-pressed="${isNeverForget}">${isNeverForget ? uiText(language, 'forget') : uiText(language, 'never')}</button>
                        <button class="jpdb-reader-btn blacklist" data-action="blacklist" title="${escapeHtml(blacklistTitle)}" aria-pressed="${isBlacklisted}">${isBlacklisted ? uiText(language, 'unlist') : uiText(language, 'blacklist')}</button>
                    </div>
                    ${addDeckSelect}
                </div>
            `;
    }

    private renderCardReviewButtons(
        cardStates: ReturnType<typeof normalizeCardStates>,
        data: CardRenderData & { loading: boolean },
        hasJpdb: boolean,
        selectedDeckLabel: string,
        reviewBlockReason: string,
        language: InterfaceLanguage,
    ): string {
        if (reviewBlockReason || data.loading || !this.settings.enableReviews) return '';
        if (!((hasJpdb && this.settings.jpdbMiningEnabled) || data.ankiLookup.primary?.primaryCardId)) return '';
        return renderReviewButtons(this.settings, data.ankiLookup.primary, {
            title: cardStates.includes('not-in-deck') ? `${uiText(language, 'reviewAddsToDeck')} ${selectedDeckLabel}` : '',
        });
    }

    private renderCardMetaItems(card: JPDBCard, hasJpdb: boolean, state: string, data: CardRenderData & { loading: boolean }): string[] {
        return [
            card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '',
            hasJpdb ? `<span><span class="jpdb-reader-state-dot jpdb-${state}"></span>${escapeHtml(state)}</span>` : '',
            data.ankiLookup.primary ? `<span><span class="jpdb-reader-state-dot jpdb-${data.ankiLookup.state}"></span>Anki ${escapeHtml(data.ankiLookup.state)}</span>` : '',
        ].filter(Boolean);
    }

    private renderCardLoadingDetails(loading: boolean): string {
        return loading ? '<div class="jpdb-reader-help" data-card-details-loading>Loading dictionary details...</div>' : '';
    }

    private renderDeckChoiceOptions(jpdbDecks: JPDBDeck[], ankiDecks: string[], includeJpdb: boolean): string {
        const options: Array<[string, string]> = [];
        const add = (source: 'jpdb' | 'anki', value: string, label: string): void => {
            const normalizedValue = value.trim();
            const key = `${source}:${normalizedValue}`;
            if (!normalizedValue || options.some(([existing]) => existing === key)) return;
            options.push([key, label]);
        };
        if (includeJpdb) {
            const selected = this.settings.miningDeck.trim() || 'forq';
            add('jpdb', 'forq', 'JPDB: FORQ');
            add('jpdb', selected, `JPDB: ${this.jpdbDeckLabel(selected, jpdbDecks)}`);
            for (const deck of jpdbDecks) {
                if (this.isSpecialJpdbDeck(deck)) continue;
                add('jpdb', deck.id, `JPDB: ${deck.name}`);
            }
        }
        if (this.settings.ankiEnabled) {
            add('anki', this.settings.ankiDeck || 'よむ', `Anki: ${this.settings.ankiDeck || 'よむ'}`);
            for (const deck of ankiDecks) add('anki', deck, `Anki: ${deck}`);
        }
        if (!options.length) return '';
        const placeholder = `<option value="" disabled selected>${escapeHtml(uiText(this.settings.interfaceLanguage, 'deck'))}</option>`;
        return placeholder + options
            .map(([value, label]) => {
                const [source, ...idParts] = value.split(':');
                const deckId = idParts.join(':');
                return `<option value="${escapeHtml(value)}" data-deck-source="${escapeHtml(source)}" data-deck-id="${escapeHtml(deckId)}">${escapeHtml(label)}</option>`;
            })
            .join('');
    }

    private jpdbDeckLabel(deckId: string, decks: JPDBDeck[]): string {
        if (deckId === 'forq') return 'FORQ';
        const deck = decks.find(candidate => candidate.id === deckId);
        return deck?.name || deckId;
    }

    private isSpecialJpdbDeck(deck: JPDBDeck): boolean {
        const neverForgetDeck = this.settings.neverForgetDeck.trim();
        const blacklistDeck = this.settings.blacklistDeck.trim();
        if (deck.id === neverForgetDeck || deck.id === blacklistDeck) return true;
        return /never\s*-?\s*forget|blacklist|suspend/i.test(`${deck.id} ${deck.name}`);
    }

    private reviewBlockReason(cardStates: ReturnType<typeof normalizeCardStates>, language: InterfaceLanguage): string {
        if (cardStates.includes('blacklisted')) return uiText(language, 'reviewBlockedBlacklisted');
        if (cardStates.includes('never-forget')) return uiText(language, 'reviewBlockedNeverForget');
        return '';
    }

    private loadCardRenderData(card: JPDBCard): CardRenderDataLoad {
        const key = this.cardRenderDataCacheKey(card);
        const now = Date.now();
        const cached = this.cardRenderDataCache.get(key);
        if (cached && cached.expiresAt > now) {
            log.debug('Card render data cache hit', { term: card.spelling });
            return cached.load;
        }

        const load = this.fetchCardRenderData(card);
        void load.all.catch(() => {
            if (this.cardRenderDataCache.get(key)?.load === load) this.cardRenderDataCache.delete(key);
        });
        this.cardRenderDataCache.set(key, { expiresAt: now + CARD_RENDER_DATA_CACHE_TTL_MS, load });
        return load;
    }

    private fetchCardRenderData(card: JPDBCard): CardRenderDataLoad {
        const localEntriesPromise = this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(card.spelling, card.reading, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local term lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const kanjiEntriesPromise = this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.dictionaries.lookupKanji(card.spelling, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local kanji lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const metaEntriesPromise = this.settings.localDictionariesEnabled
            ? this.dictionaries.lookupTermMeta(card.spelling, 12, this.settings.dictionaryPreferences).catch(error => {
                log.warn('Local metadata lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const jpdbPublicPitchPromise = this.settings.showPitchAccent && !card.pitchAccent.length
            ? this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(error => {
                log.warn('Public JPDB pitch lookup failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const ankiLookupPromise = this.settings.ankiEnabled
            ? this.anki.findExistingCards(card).catch(error => {
                log.warn('Anki lookup failed while rendering card', { term: card.spelling }, error);
                return { state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult;
            })
            : Promise.resolve({ state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult);
        const jpdbDecksPromise = this.settings.jpdbMiningEnabled && this.settings.apiKey.trim() && this.isJpdbBackedCard(card)
            ? this.jpdb.listDecks().catch(error => {
                log.warn('JPDB deck list failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const ankiDecksPromise = this.settings.ankiEnabled
            ? this.anki.deckNames().catch(error => {
                log.warn('Anki deck list failed while rendering card', { term: card.spelling }, error);
                return [];
            })
            : Promise.resolve([]);
        const all = Promise.all([
            localEntriesPromise,
            kanjiEntriesPromise,
            metaEntriesPromise,
            jpdbPublicPitchPromise,
            ankiLookupPromise,
            jpdbDecksPromise,
            ankiDecksPromise,
        ]).then(([localEntries, kanjiEntries, metaEntries, jpdbPublicPitch, ankiLookup, jpdbDecks, ankiDecks]) => {
            if (!card.pitchAccent.length && jpdbPublicPitch.length) card.pitchAccent = jpdbPublicPitch;
            return { localEntries, kanjiEntries, metaEntries, ankiLookup, jpdbDecks, ankiDecks };
        });
        return { localEntries: localEntriesPromise, all };
    }

    private cardRenderDataCacheKey(card: JPDBCard): string {
        return JSON.stringify({
            card: cardKey(card),
            local: this.settings.localDictionariesEnabled,
            kanji: this.settings.localDictionaryShowKanji,
            max: this.settings.localDictionaryMaxResults,
            pitch: this.settings.showPitchAccent,
            anki: this.settings.ankiEnabled,
            dictionaries: this.settings.dictionaryPreferences.map(preference => ({
                name: preference.name,
                enabled: preference.enabled,
                priority: preference.priority,
            })),
        });
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
        const willCollapse = !actions.classList.contains('jpdb-reader-actions-mining-collapsed');
        actions.classList.toggle('jpdb-reader-actions-mining-collapsed', willCollapse);
        const expanded = String(!willCollapse);
        button.setAttribute('aria-expanded', expanded);
        button.setAttribute('aria-label', willCollapse ? 'Show mining actions' : 'Hide mining actions');
        button.title = willCollapse ? 'Show mining actions' : 'Hide mining actions';
        button.textContent = willCollapse ? '+' : '-';
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

    private updateWordNavigation(card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', mode: CardNavigationMode): void {
        if (trigger !== 'modal') {
            this.clearWordNavigation();
            return;
        }

        const next: CardNavigationEntry = { card, sentence };
        if (mode === 'reset') {
            this.wordNavigationStack = [];
            this.currentWordNavigation = next;
            return;
        }

        if (mode === 'push-current' && this.currentWordNavigation && !this.isSameNavigationCard(this.currentWordNavigation, next)) {
            const lastStackEntry = this.wordNavigationStack[this.wordNavigationStack.length - 1];
            if (!lastStackEntry || !this.isSameNavigationCard(lastStackEntry, this.currentWordNavigation)) {
                this.wordNavigationStack.push(this.currentWordNavigation);
            }
        }
        this.currentWordNavigation = next;
    }

    private clearWordNavigation(): void {
        this.wordNavigationStack = [];
        this.currentWordNavigation = undefined;
    }

    private isSameNavigationCard(first: CardNavigationEntry, second: CardNavigationEntry): boolean {
        return cardKey(first.card) === cardKey(second.card);
    }

    private renderWordHistoryNavigation(language: InterfaceLanguage, trigger: 'modal' | 'hover'): string {
        if (trigger !== 'modal') return '';
        const previous = this.wordNavigationStack[this.wordNavigationStack.length - 1];
        if (!previous) return '';
        return this.renderModalNavigation({
            backAction: 'word-history-back',
            backTitle: `${uiText(language, 'backToWord')}: ${previous.card.spelling}`,
            label: previous.card.spelling,
        });
    }

    private renderModalNavigation(options: ModalNavigationOptions): string {
        return `
            <div class="jpdb-reader-modal-nav">
                <button class="jpdb-reader-icon-mini" type="button" data-action="${escapeHtml(options.backAction)}" title="${escapeHtml(options.backTitle)}" aria-label="${escapeHtml(options.backTitle)}">←</button>
                <span title="${escapeHtml(options.label)}">${escapeHtml(options.label)}</span>
                ${options.controlsHtml ?? ''}
            </div>
        `;
    }

    private async showPreviousWord(anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): Promise<void> {
        const previous = this.wordNavigationStack.pop();
        if (!previous) return;
        await this.showCard(previous.card, previous.sentence, anchor, {
            autoPlay: false,
            trigger,
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

    private renderWordPills(card: JPDBCard, jpdbUrl: string, metaEntries: YomitanMetaEntry[] = [], overrideQuery?: string): string {
        const query = overrideQuery || card.spelling || card.reading;
        const language = this.settings.interfaceLanguage;
        const context = {
            query,
            word: overrideQuery || card.spelling,
            reading: overrideQuery || card.reading || card.spelling,
            vid: String(Math.max(0, card.vid)),
            sid: String(Math.max(0, card.sid)),
        };
        const linkPills = this.settings.dictionaryLookupLinks
            .filter(link => link.enabled)
            .map(link => {
                const style = pillStyle(`lookup:${link.id || link.label}`);
                if (link.action === 'copy' || link.id === 'copy') {
                    const copyTitle = uiText(language, 'copyWordTitle');
                    return `<button class="jpdb-reader-pill jpdb-reader-action-pill jpdb-reader-copy-pill" data-action="copy-word" type="button" style="${style}" title="${escapeHtml(copyTitle)}" aria-label="${escapeHtml(`${copyTitle}: ${query}`)}">${escapeHtml(link.label || uiText(language, 'copyWord'))} ${copyIcon()}</button>`;
                }
                const url = link.id === 'jpdb' && (Boolean(overrideQuery) || this.isJpdbBackedCard(card))
                    ? jpdbUrl
                    : formatLookupUrl(link.urlTemplate, context);
                if (!url) return '';
                const title = link.id === 'jpdb'
                    ? (overrideQuery ? uiText(language, 'openKanjiOnJpdb') : uiText(language, 'openOnJpdb'))
                    : `Open on ${link.label}`;
                const classes = `jpdb-reader-pill jpdb-reader-action-pill${link.id === 'jpdb' ? ' jpdb-reader-jpdb-pill' : ''}`;
                return `<a class="${classes}" href="${escapeHtml(url)}" target="_blank" rel="noopener" style="${style}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`${title}: ${query}`)}">${escapeHtml(link.label)} ${externalLinkIcon()}</a>`;
            })
            .filter(Boolean);
        const frequencyPills = renderFrequencyPills(metaEntries, this.settings, name => this.dictionaryLabel(name));
        const pills = [...linkPills, ...frequencyPills];
        return pills.length ? `<div class="jpdb-reader-word-pills">${pills.join('')}</div>` : '';
    }

    private async showKanjiCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: { preservePosition?: boolean } = {}): Promise<void> {
        if (!isKanjiCharacter(kanji)) return;
        log.debug('Rendering kanji card', { term: card.spelling, kanji });
        const popover = this.createPopover();
        const kanjiCharacters = uniqueKanji(card.spelling);
        const index = Math.max(0, kanjiCharacters.indexOf(kanji));
        const previous = kanjiCharacters[(index - 1 + kanjiCharacters.length) % kanjiCharacters.length];
        const next = kanjiCharacters[(index + 1) % kanjiCharacters.length];
        const jpdbUrl = `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`;
        const language = this.settings.interfaceLanguage;
        const hasJpdbKanji = this.settings.jpdbKanjiEnabled;
        const kanjiVGPromise = this.settings.kanjivgEnabled
            ? this.kanjiVG.lookup(kanji).catch(() => null)
            : Promise.resolve(null);
        const detailsPromises: KanjiDetailPromises = {
            jpdbInfo: hasJpdbKanji ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null),
            kanjiEntries: this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
                ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
                : Promise.resolve([]),
            rtkInfo: this.settings.rtkEnabled ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
        const kanjiNavigationControls = kanjiCharacters.length > 1 ? `
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}" title="${escapeHtml(uiText(language, 'previousKanji'))}">‹</button>
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}" title="${escapeHtml(uiText(language, 'nextKanji'))}">›</button>
        ` : '';

        setInnerHtml(popover, `
            <div class="jpdb-reader-sheet-handle"></div>
            ${this.renderModalNavigation({
                backAction: 'word-back',
                backTitle: `${uiText(language, 'backToWord')}: ${card.spelling}`,
                label: card.spelling,
                controlsHtml: kanjiNavigationControls,
            })}
            <div class="jpdb-reader-header">
                <div class="jpdb-reader-heading">
                    <div class="jpdb-reader-title-row jpdb-reader-kanji-title-row">
                        <div class="jpdb-reader-kanji-display">${escapeHtml(kanji)}</div>
                        <div data-kanji-keyword-mount><div class="jpdb-reader-help">Loading kanji details...</div></div>
                        ${this.renderWordPills(card, jpdbUrl, [], kanji)}
                    </div>
                    <div data-kanji-mining-mount hidden></div>
                </div>
            </div>
            <div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">
                ${this.renderKanjiSourceMounts(kanji, language)}
            </div>
        `);

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
            if (action === 'kanji-prev' || action === 'kanji-next') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { preservePosition: true });
            if (action === 'kanji') void this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { preservePosition: true });
            if (action === 'similar-word') void this.lookupText(actionButton.dataset.expression ?? '', actionButton.dataset.expression ?? '', { navigation: 'push-current', preservePosition: true });
        });
        this.mountPopover(popover, anchor, { preservePosition: options.preservePosition });
        installKanjiDoodle(popover, () => this.settings.interfaceLanguage);
        if (this.settings.similarKanjiWords) {
            void this.renderSimilarKanjiWordsProgressively(popover, detailsPromises.jpdbInfo, kanji, card);
        }
        if (this.settings.uchisenEnabled) {
            void this.renderUchisenInto(popover, kanji);
        }
        void this.renderKanjiDetailsInto(popover, detailsPromises, card, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, kanjiVGPromise, kanji, language);
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
                return renderKanjiPractice(null, kanji, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey);
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
                    this.isDictionarySourceOpen(sourceStateKey),
                    (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
                );
            }
            if (sourceId === KANJI_ORIGINS_SOURCE_ID) return '<div data-kanji-origin-mount></div>';
            return '';
        }).join('');
    }

    private async renderKanjiDetailsInto(
        popover: HTMLElement,
        detailsPromises: KanjiDetailPromises,
        card: JPDBCard,
        kanji: string,
        language: InterfaceLanguage,
    ): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        let rtkInfo: RtkInfo | null = null;
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
            setInnerHtml(rtkMount, renderRtkInfo(rtkInfo, componentSummaries, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
            this.repositionActivePopover();
        };

        const jpdbInfoPromise = detailsPromises.jpdbInfo.then(info => {
            jpdbInfo = info;
            if (!popover.isConnected) return;
            log.debug('JPDB kanji details loaded', { kanji, hasJpdbInfo: Boolean(jpdbInfo) });
            renderKeyword();
            if (miningMount?.isConnected) {
                const controls = renderJpdbKanjiMiningControls(jpdbInfo, language);
                miningMount.hidden = !controls;
                setInnerHtml(miningMount, controls);
            }
            if (jpdbMount?.isConnected) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                setInnerHtml(jpdbMount, renderJpdbKanjiInfo(jpdbInfo, language, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
            }
            renderRtk();
        });
        const kanjiEntriesPromise = detailsPromises.kanjiEntries.then(entries => {
            kanjiEntries = entries;
            if (!popover.isConnected) return;
            log.debug('Local kanji details loaded', { kanji, entries: kanjiEntries.length });
            renderKeyword();
            for (const definitionsMount of definitionsMounts.filter(mount => mount.isConnected)) {
                const dictionaryName = definitionsMount.dataset.kanjiDictionary;
                const sourceId = definitionsMount.dataset.kanjiSourceId ?? KANJI_DICTIONARIES_SOURCE_ID;
                const visibleEntries = dictionaryName
                    ? kanjiEntries.filter(entry => entry.dictionary === dictionaryName)
                    : kanjiEntries;
                setInnerHtml(definitionsMount, renderKanjiDefinitions(
                    visibleEntries,
                    (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
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
            log.debug('RTK kanji details loaded', { kanji, hasRtkInfo: Boolean(rtkInfo) });
            renderKeyword();
            renderRtk();
        });

        await Promise.all([jpdbInfoPromise, kanjiEntriesPromise, rtkInfoPromise]);
        if (!popover.isConnected) return;
        log.debug('Kanji details loaded', {
            kanji,
            hasJpdbInfo: Boolean(jpdbInfo),
            localKanjiEntries: kanjiEntries.length,
            hasRtkInfo: Boolean(rtkInfo),
        });
        const resolvedJpdbInfo = jpdbInfo as JpdbKanjiInfo | null;
        const resolvedRtkInfo = rtkInfo as RtkInfo | null;

        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, resolvedJpdbInfo, resolvedRtkInfo, null, kanjiEntries);
        }
        void this.parsePopoverJapanese(popover);
        this.repositionActivePopover();
    }

    private async renderUchisenInto(popover: HTMLElement, kanji: string): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        if (!mount) return;
        const sourceStateKey = kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID);
        const sourceAttributes = () => this.dictionarySourceAttributes(sourceStateKey, this.isDictionarySourceOpen(sourceStateKey));
        setInnerHtml(mount, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source" ${sourceAttributes()}>
                <summary class="jpdb-reader-local-title">Uchisen</summary>
                <div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">Loading mnemonic images...</div></div>
            </details>
        `);
        const images = await loadUchisenImages(kanji).catch(error => {
            log.debug('Uchisen kanji details failed quietly', { kanji }, error);
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
                log.debug('Similar kanji words loaded', { kanji, entries: localEntries.length, jpdbVocabulary: jpdbVocabulary.length });
            });
        };

        section.addEventListener('toggle', load);
        load();
    }

    private async renderSimilarKanjiWordsInto(popover: HTMLElement, promise: Promise<YomitanTermEntry[]>, jpdbVocabulary: JpdbKanjiVocabulary[], kanji: string, card: JPDBCard): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-similar-mount]');
        if (!mount) return;
        const entries = await promise;
        if (!popover.isConnected || !mount.isConnected) return;
        log.debug('Similar kanji words loaded', { kanji, entries: entries.length, jpdbVocabulary: jpdbVocabulary.length });
        setInnerHtml(mount, renderSimilarKanjiWordsContent(entries, jpdbVocabulary, card, this.settings, name => this.dictionaryLabel(name)));
    }

    private async renderKanjiVGInto(popover: HTMLElement, kanjiVGPromise: Promise<KanjiVGInfo | null>, kanji: string, language: InterfaceLanguage): Promise<void> {
        const info = await kanjiVGPromise;
        if (!info || !popover.isConnected) return;
        log.debug('KanjiVG loaded', { kanji, strokes: info.strokeCount });
        const stage = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-doodle-stage'))
            .find(candidate => candidate.dataset.kanji === kanji);
        const ghost = stage?.querySelector<HTMLElement>('.jpdb-reader-doodle-ghost');
        const help = stage?.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLElement>('.jpdb-reader-help');
        if (!stage || !ghost || !help) return;
        setInnerHtml(ghost, info.svg);
        help.textContent = `${info.strokeCount} ${uiText(language, 'strokes')}`;
        stage.classList.remove('trace-hidden');
        const trace = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        if (trace) trace.textContent = uiText(language, 'hideTrace');
    }

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.kanjiOrigin.lookup(kanji, { ...this.settings, kanjiOriginWiktionaryEnabled: false }).catch(error => {
            log.warn('Kanji origin lookup failed', { kanji }, error);
            return null;
        });
        if (!popover.isConnected || !mount.isConnected) return;
        log.debug('Kanji origin rendered', { kanji, hasSourceInfo: Boolean(sourceInfo) });
        const facts = buildKanjiFacts(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        const graph = this.settings.kanjiOriginGraphEnabled
            ? buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo)
            : null;
        const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, renderKanjiOrigins(facts, graph, sourceInfo, this.settings, this.settings.interfaceLanguage, this.isDictionarySourceOpen(sourceStateKey), sourceStateKey));
        mount.querySelectorAll<HTMLImageElement>('[data-radical-frame]').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
        });
        installKanjiGraphDrag(mount);
    }

    private renderDefinitionSources(card: JPDBCard, entries: YomitanTermEntry[], sentence?: string): string {
        const grouped = groupTermEntriesByDictionary(entries);
        const setup = this.renderFallbackSetupSource(card);
        const sourceIds = orderedDefinitionSourceIds(this.settings, [...grouped.keys()]);
        const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
        let renderedDictionaries = false;
        const sections = [
            setup,
            ...sourceIds
            .map(sourceId => {
                if ((card.source === 'local' || card.source === 'anki' || card.source === 'fallback') && sourceId === JPDB_DEFINITION_SOURCE_ID) return '';
                if (sourceId === JPDB_DEFINITION_SOURCE_ID) return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded));
                if (sourceId === STUDY_TRANSLATION_SOURCE_ID) return this.renderStudyTranslationSource(sentence);
                if (sourceId === STUDY_GRAMMAR_SOURCE_ID) return this.renderStudyGrammarSource(sentence);
                if (sourceId === IMMERSION_KIT_SOURCE_ID) return this.renderImmersionKitMount();
                if (grouped.has(sourceId)) {
                    if (renderedDictionaries) return '';
                    renderedDictionaries = true;
                    return renderLocalDefinitionSourcesSection(
                        dictionarySourceIds,
                        grouped,
                        this.settings,
                        (key, initiallyExpanded) => this.dictionarySourceAttributes(key, initiallyExpanded),
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
        if (card.source !== 'fallback') return '';
        if (this.settings.apiKey.trim() || this.settings.dictionaryPreferences.length) return '';
        const language = this.settings.interfaceLanguage;
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-fallback-setup" ${this.dictionarySourceAttributes(definitionSourceStateKey(FALLBACK_SETUP_SOURCE_ID), true)}>
                <summary class="jpdb-reader-local-title">${uiText(language, 'fallbackSetupTitle')}</summary>
                <div class="jpdb-reader-local-entry">
                    <div class="jpdb-reader-help">${uiText(language, 'fallbackSetupCopy')}</div>
                    <div class="jpdb-reader-row" style="--cols: 2">
                        <button class="jpdb-reader-btn add" type="button" data-action="setup-dictionaries">${uiText(language, 'fallbackSetupDictionaries')}</button>
                        <button class="jpdb-reader-btn" type="button" data-action="setup-jpdb">${uiText(language, 'fallbackSetupJpdb')}</button>
                    </div>
                </div>
            </details>
        `;
    }

    private renderImmersionKitMount(): string {
        if (!this.settings.immersionKitEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-immersion" data-immersion-kit ${this.dictionarySourceAttributes(definitionSourceStateKey(IMMERSION_KIT_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">${uiText(this.settings.interfaceLanguage, 'immersionKit')}</summary>
                <div class="jpdb-reader-help">${uiText(this.settings.interfaceLanguage, 'loadingExamples')}</div>
            </details>
        `;
    }

    private renderStudyTranslationSource(sentence?: string): string {
        if (!sentence || !this.settings.studyTranslationEnabled) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" data-study-translation ${this.dictionarySourceAttributes(definitionSourceStateKey(STUDY_TRANSLATION_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">Translation</summary>
                <div class="jpdb-reader-study-panel jpdb-reader-study-translation-panel">
                    <div class="jpdb-reader-study-block jpdb-reader-study-sentence-block">
                        <div class="jpdb-reader-study-label-row">
                            <div class="jpdb-reader-study-label">Japanese</div>
                            <button class="jpdb-reader-icon-mini" data-action="study-read-sentence" type="button" title="Read sentence aloud" aria-label="Read sentence aloud">${speakerIcon()}</button>
                        </div>
                        <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>${escapeHtml(sentence)}</div>
                    </div>
                    <div class="jpdb-reader-study-block jpdb-reader-study-meaning-block">
                        <div class="jpdb-reader-study-label">Meaning</div>
                        <div class="jpdb-reader-study-translation" data-study-translation-result>Open this section to translate.</div>
                    </div>
                </div>
            </details>
        `;
    }

    private renderStudyGrammarSource(sentence?: string): string {
        if (!sentence || !this.settings.studyGrammarEnabled) return '';
        const hints = detectGrammarHints(sentence);
        if (!hints.length) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-study-source" ${this.dictionarySourceAttributes(definitionSourceStateKey(STUDY_GRAMMAR_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">Grammar</summary>
                <div class="jpdb-reader-study-panel">
                    ${renderGrammarHints(hints, sentence)}
                </div>
            </details>
        `;
    }

    private installStudyTranslationLoader(popover: HTMLElement, sentence?: string): void {
        const container = popover.querySelector<HTMLDetailsElement>('[data-study-translation]');
        if (!container || !sentence) return;
        const load = () => {
            if (!container.open || container.dataset.loaded === 'true' || container.dataset.loading === 'true') return;
            container.dataset.loading = 'true';
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = 'Translating...';
            void this.loadStudyTranslation(popover, sentence).finally(() => {
                if (!container.isConnected) return;
                delete container.dataset.loading;
                container.dataset.loaded = 'true';
            });
        };
        container.addEventListener('toggle', load);
        load();
    }

    private async loadStudyTranslation(popover: HTMLElement, sentence?: string): Promise<void> {
        const container = popover.querySelector<HTMLElement>('[data-study-translation]');
        if (!container || !sentence) return;
        try {
            const [tokens, translated] = await Promise.all([
                this.parseJapanese([sentence]).then(([parsed]) => parsed ?? []),
                translateJapaneseSentence(sentence),
            ]);
            if (!this.isCurrentPopoverRoot(popover) || !container.isConnected) return;
            const original = container.querySelector<HTMLElement>('[data-study-original-render]');
            if (original) setInnerHtml(original, renderTokensToHtml(sentence, tokens, this.settings));
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = translated;
            void this.parsePopoverJapanese(container);
            void this.enrichAnkiWords(tokens);
        } catch (error) {
            log.warn('Automatic sentence translation failed', { sentenceLength: sentence.length }, error);
            if (!container.isConnected) return;
            const result = container.querySelector<HTMLElement>('[data-study-translation-result]');
            if (result) result.textContent = 'Translation unavailable.';
        }
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        if (!this.isCurrentPopoverRoot(popover)) return;
        const targets = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-parseable'))
            .flatMap(root => collectFragmentTextTargetsIn(root, 24, false, '', { includeReaderRoot: true, allowUiText: true, minLength: 1 }))
            .slice(0, 24);
        if (!targets.length) return;
        const parseKey = targets.map(target => target.text).join('\n\n');
        if (popover.dataset.jpdbReaderParseKey === parseKey || popover.dataset.jpdbReaderParseLoadingKey === parseKey) return;
        popover.dataset.jpdbReaderParseLoadingKey = parseKey;

        try {
            const parsed = await this.parseJapanese(targets.map(target => target.text));
            if (!this.isCurrentPopoverRoot(popover) || popover.dataset.jpdbReaderParseLoadingKey !== parseKey) return;
            targets.forEach((target, index) => applyTokensToScanTarget(target, parsed[index] ?? [], this.settings));
            popover.dataset.jpdbReaderParseKey = parseKey;
            const tokens = parsed.flat();
            this.preloadTermAudioForTokens(tokens);
            void this.enrichAnkiWords(tokens);
            log.debug('Popover nested text parsed', { targets: targets.length, tokens: tokens.length });
        } catch (error) {
            log.debug('Popover nested text parsing failed quietly', error);
            // The primary popup already succeeded; nested text parsing is a quiet enhancement.
        } finally {
            if (popover.dataset.jpdbReaderParseLoadingKey === parseKey) delete popover.dataset.jpdbReaderParseLoadingKey;
        }
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
        if (uniqueTokens.length) log.debug('Enriching rendered words with Anki state', { tokens: uniqueTokens.length });
        for (const token of uniqueTokens) {
            const lookup = await this.anki.findExistingCards(token.card);
            this.applyAnkiLookupToRenderedWords(token.card, lookup);
        }
    }

    private preloadTermAudioForTokens(tokens: JPDBToken[]): void {
        if (!this.settings.audioEnabled || !this.settings.autoPlayAudio) return;

        let queued = 0;
        for (const token of tokens) {
            const key = cardKey(token.card);
            if (this.preloadedTermAudioKeys.has(key)) continue;
            this.preloadedTermAudioKeys.add(key);
            this.audio.preload(token.card, { sourceLimit: 1, candidateLimit: 1 });
            queued++;
            if (queued >= TERM_AUDIO_PRELOAD_LIMIT) break;
        }
        if (queued) log.debugThrottled('term-audio-preload', 2500, 'Term audio preloads queued', { queued });
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private isDictionarySourceOpen(sourceStateKey: string, initiallyExpanded = this.settings.dictionarySourcesInitiallyExpanded): boolean {
        return this.dictionarySourceOpenOverrides.get(sourceStateKey) ?? initiallyExpanded;
    }

    private dictionarySourceAttributes(sourceStateKey: string, initiallyExpanded = this.settings.dictionarySourcesInitiallyExpanded): string {
        const isOpen = this.isDictionarySourceOpen(sourceStateKey, initiallyExpanded);
        return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(isOpen)}"${isOpen ? ' open' : ''}`;
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
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
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
        log.debug('Mining context resolved', {
            term: card.spelling,
            sourceKind: context.sourceKind,
            hasImage: Boolean(context.imageDataUrl),
            hasStoredContext: Boolean(storedImmersionContext),
            hasActiveContext: Boolean(activeContext),
        });
        return context;
    }

    private async playAudio(card: JPDBCard, options: { hoverLookupGeneration?: number } = {}): Promise<void> {
        const isCurrent = options.hoverLookupGeneration === undefined
            ? undefined
            : () => this.hoverLookupGeneration === options.hoverLookupGeneration;
        const loadingPopover = this.activePopover;
        const loadingRequest = ++this.audioLoadingRequest;
        this.setAudioLoading(loadingPopover, loadingRequest);
        try {
            this.immersionPopover.stopAudio();
            const played = await this.audio.play(card, { isCurrent });
            if (!played) return;
            log.debug('Term audio playback started', { term: card.spelling });
        } catch (error) {
            log.warn('Term audio playback failed', { term: card.spelling }, error);
            this.toast(error instanceof Error ? error.message : 'Audio playback failed.');
        } finally {
            this.clearAudioLoading(loadingPopover, loadingRequest);
        }
    }

    private setAudioLoading(popover: HTMLElement | undefined, requestId: number): void {
        if (!popover?.isConnected) return;
        popover.dataset.audioLoading = 'true';
        popover.dataset.audioLoadingRequest = String(requestId);
    }

    private clearAudioLoading(popover: HTMLElement | undefined, requestId: number): void {
        if (!popover?.isConnected || popover.dataset.audioLoadingRequest !== String(requestId)) return;
        delete popover.dataset.audioLoading;
        delete popover.dataset.audioLoadingRequest;
    }

    private async playSentenceAudio(sentence?: string): Promise<void> {
        const text = sentence?.trim();
        if (!text) throw new Error('No sentence to read aloud.');
        const voice = this.settings.audioSources.find(source =>
            source.enabled && (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') && source.voice.trim()
        )?.voice.trim() ?? '';
        this.immersionPopover.stopAudio();
        await this.audio.playJapaneseText(text, voice);
        log.debug('Sentence text-to-speech playback started', { sentenceLength: text.length, voice: voice || 'auto' });
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
        options: { mode?: 'modal' | 'hover'; preservePosition?: boolean; hoverLookupKey?: string; pointerTextLookup?: ActivePointerTextLookup } = {},
    ): void {
        const mode = options.mode ?? 'modal';
        const useBackdrop = mode !== 'hover';
        const backdrop = useBackdrop ? createReaderBackdrop(() => this.dismiss()) : undefined;
        const previousRect = this.activePopoverAnchorRect;
        const previousPopoverRect = options.preservePosition ? this.activePopover?.getBoundingClientRect() : undefined;
        const previousHoverPointerPosition = this.hoverPopoverPointerPosition;
        const resolvedAnchor = anchor?.isConnected
            ? anchor
            : this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
        const resolvedRect = resolvedAnchor ? resolvedAnchor.getBoundingClientRect() : undefined;
        const anchorRect = resolvedRect && (resolvedRect.width > 0 || resolvedRect.height > 0)
            ? resolvedRect
            : previousRect;
        this.dismiss({ suppressHoverTarget: false, preserveNavigation: true, preserveHoverGeneration: mode === 'hover' });
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (backdrop) document.body.append(backdrop, popover);
        else document.body.append(popover);
        this.activeBackdrop = backdrop;
        this.activePopover = popover;
        this.activePopoverMode = mode;
        this.activePopoverAnchor = resolvedAnchor;
        this.activePopoverAnchorRect = anchorRect;
        const shouldLockPopoverPosition = mode !== 'hover' && !popover.classList.contains('jpdb-reader-sheet');
        this.activePopoverPositionLocked = shouldLockPopoverPosition && Boolean(previousPopoverRect);
        this.activeHoverWord = mode === 'hover' ? resolvedAnchor : undefined;
        this.activeHoverLookupKey = mode === 'hover' ? options.hoverLookupKey ?? '' : '';
        this.activePointerTextLookup = mode === 'hover' ? options.pointerTextLookup : undefined;
        const hoverPointerPosition = previousHoverPointerPosition ?? this.lastPointerPosition;
        this.hoverPopoverPointerPosition = mode === 'hover' && hoverPointerPosition ? { ...hoverPointerPosition } : undefined;
        this.installDictionarySourceStateTracking(popover);

        if (!popover.classList.contains('jpdb-reader-sheet')) {
            this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
            this.activePopoverResizeObserver.observe(popover);
            if (previousPopoverRect) {
                placePopoverAtViewportPosition(popover, previousPopoverRect, popoverMaxHeightSetting(this.settings));
                this.syncActivePopoverFixedHeight();
            }
            else this.repositionActivePopover();
            this.activePopoverPositionLocked = shouldLockPopoverPosition;
            requestAnimationFrame(() => this.repositionActivePopover());
        } else {
            installSheetHandle(popover, () => this.dismiss());
        }
        if (mode === 'hover') {
            this.installHoverPopoverLifecycle(popover);
            this.startHoverWatch();
        }
        else popover.focus();
        log.debug('Popover mounted', {
            mode,
            sheet: popover.classList.contains('jpdb-reader-sheet'),
            hasAnchor: Boolean(resolvedAnchor),
            hasBackdrop: Boolean(backdrop),
        });
    }

    private repositionActivePopover(): void {
        if (!this.activePopover || this.activePopover.classList.contains('jpdb-reader-sheet')) return;
        if (this.shouldUseFixedModalHeight(this.activePopover)) this.activePopover.style.height = '';
        if (this.activePopoverPositionLocked) {
            placePopoverAtViewportPosition(this.activePopover, this.activePopover.getBoundingClientRect(), popoverMaxHeightSetting(this.settings));
            this.syncActivePopoverFixedHeight();
            return;
        }
        if (this.activePopoverAnchor?.isConnected) {
            const rect = this.activePopoverAnchor.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0) this.activePopoverAnchorRect = rect;
        }
        const shouldFollowPointer = this.activePopoverMode === 'hover' && Boolean(this.activePointerTextLookup);
        positionPopover(
            this.activePopover,
            this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
            this.activePopoverAnchorRect,
            {
                followPoint: shouldFollowPointer ? this.hoverPopoverPointerPosition : undefined,
                maxHeight: popoverMaxHeightSetting(this.settings),
            },
        );
        this.syncActivePopoverFixedHeight();
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

    private installDictionarySourceStateTracking(popover: HTMLElement): void {
        popover.addEventListener('click', event => {
            const summary = (event.target as HTMLElement).closest?.<HTMLElement>('summary.jpdb-reader-local-title');
            const details = summary?.parentElement instanceof HTMLDetailsElement ? summary.parentElement : null;
            if (!summary || !details || !popover.contains(summary) || !details.dataset.sourceStateKey) return;
            event.preventDefault();
            event.stopPropagation();
            if (details.dataset.immersionEmpty === 'true') return;
            details.open = !details.open;
            this.rememberDictionarySourceOpenState(details);
        });
        popover.addEventListener('toggle', event => {
            if (!event.isTrusted) return;
            const details = event.target instanceof HTMLDetailsElement ? event.target : null;
            if (!details?.dataset.sourceStateKey) return;
            this.rememberDictionarySourceOpenState(details);
        }, true);
    }

    private rememberDictionarySourceOpenState(details: HTMLDetailsElement): void {
        const sourceStateKey = details.dataset.sourceStateKey;
        if (!sourceStateKey) return;
        const rememberedOpen = this.dictionarySourceOpenOverrides.get(sourceStateKey);
        if (rememberedOpen === details.open) return;
        const initialOpen = details.dataset.sourceInitialOpen === 'true';
        if (rememberedOpen === undefined && details.open === initialOpen) return;
        this.dictionarySourceOpenOverrides.set(sourceStateKey, details.open);
        log.debug('Dictionary source open state remembered', { sourceStateKey, open: details.open });
        this.repositionActivePopover();
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
        const hadDialog = Boolean(this.activePopover || this.activeBackdrop);
        const hadSettingsDialog = Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
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
        this.audio.stop();
        this.immersionPopover.stopAudio();
        const suppressTarget = this.activePopoverMode === 'hover' ? this.activeHoverWord : this.activePopoverAnchor;
        if (options.suppressHoverTarget && suppressTarget?.isConnected && suppressTarget.classList.contains('jpdb-reader-word')) {
            this.suppressedHoverWord = suppressTarget;
            this.suppressedHoverLookupKey = this.hoverLookupKeyForWord(suppressTarget);
        } else {
            this.suppressedHoverLookupKey = '';
        }
        this.cardRenderRequest++;
        if (this.settingsPreviewOriginalAccent !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
        }
        if (this.settingsPreviewOriginalLanguage !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        if (this.settingsPreviewOriginalTheme !== undefined && this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
            this.applyTheme();
        }
        this.settingsPreviewOriginalAccent = undefined;
        this.settingsPreviewOriginalLanguage = undefined;
        this.settingsPreviewOriginalTheme = undefined;
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-popover, [data-jpdb-reader-root].jpdb-reader-settings, [data-jpdb-reader-root].jpdb-reader-backdrop')
            .forEach(element => element.remove());
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
        if (!options.preserveNavigation) this.clearWordNavigation();
        if (hadDialog) log.debug('Reader dialog dismissed', { suppressHoverTarget: Boolean(options.suppressHoverTarget) });
        if (hadSettingsDialog && this.dictionaryRescanPending) {
            this.dictionaryRescanPending = false;
            window.setTimeout(() => this.scheduleDictionaryRescan(), 80);
        }
    }

    private toast(message: string): void {
        log.debug('Toast shown', { message });
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
