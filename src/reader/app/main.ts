import { AudioPlayer } from '../audio/player';
import { isYomuHostedAppUrl } from './pages';
import { AnkiConnectClient, ankiLookupWithUnavailableDetails, captureActiveVideoFrame, untrustedAnkiLookupResult, type AnkiLookupResult } from '../anki/index';
import { renderReviewButtons } from '../anki/render';
import { runLimited } from '../core/async-utils';
import { copyText, isEditableTarget, normalizePressedKey, pauseActiveVideo, positionPopover } from '../ui/browser';
import { CardActionController } from '../cards/action-controller';
import { CardPopoverRenderer, updatePopoverReviewTargetSelection } from '../cards/popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData, type CardRenderData, type CardRenderDataLoad } from '../cards/render-data';
import { highlightCardTargetScopes } from '../cards/highlight';
import { cardKey } from '../cards/utils';
import { normalizeCardStates } from '../cards/state';
import {
    yomuImageOcrController,
    yomuSettingsDialogController,
    yomuSubtitlePlayerController,
    yomuYoutubeImmersionFilter,
    type SettingsDialogControllerInstance,
    type SubtitlePlayerControllerInstance,
    type YoutubeImmersionFilterInstance,
} from '../companions/registry';
import { APP_NAME, SETTINGS_CHANGE_EVENT } from './constants';
import { DictionarySourceStateController } from '../sources/state';
import { DictionaryStyleController } from '../sources/styles';
import { createFactoryResetCoordinator, type FactoryResetCoordinator } from './factory-reset-coordinator';
import {
    HAS_JAPANESE,
    appendToDocumentHead,
    documentHasJapaneseText,
    escapeHtml,
    getSelectionSentence,
    getSelectionText,
    isPassiveInteractionElement,
    nearestReadableSentenceForElement,
    readerWordAtPointInScope,
    readerWordSurfaceText,
    setInnerHtml,
    unwrapReaderWords,
} from '../dom/index';
import {
    kanjiSourceStateKey,
    renderKanjiDefinitions,
} from '../sources/definition-render';
import { renderDefinitionSourceImmersionMount, renderDefinitionSourcesStack, type DefinitionSourceStackOptions } from '../sources/definition-stack';
import { ImmersionKitClient } from '../immersion/kit';
import { isUsefulImmersionPreloadQuery } from '../immersion/query';
import { ImmersionPopoverController, type ImmersionSearchOptions } from '../immersion/popover-controller';
import { waitForIdle as waitForBrowserIdle } from '../platform/idle';
import { FloatingButtonController } from '../ui/floating-button';
import { JitenApiClient, type JitenKanjiInfo, type JitenVocabularyInfo } from '../dictionaries/jiten';
import { jitenKanjiOriginFactLabels, jitenKanjiWordsPageSize, renderJitenKanjiInfo, renderJitenKanjiKeywordLine, renderJitenKanjiWordsMoreButton, renderJitenKanjiWordsPage } from '../jiten/jiten-kanji-info-render';
import { JpdbClient } from '../jpdb/jpdb';
import { JpdbKanjiClient, type JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { jpdbVocabularyUrl } from '../jpdb/jpdb-vocabulary-url';
import {
    dictionaryPreferencePriority as jpdbPageDictionaryPreferencePriority,
    jpdbAudioCard,
    localDictionaryLookupVariants,
    uniqueLocalDictionaryEntries,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from '../jpdb/jpdb-page-targets';
import {
    currentPageKanji,
    currentPageLocalDictionaryTargets,
    currentPageTermTarget,
    isCurrentKanjiSurface,
    isJitenHost,
    isPageEnhancementHost,
    isPageEnhancementReady,
} from './page-enhancement-targets';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import { buildKanjiFacts, buildKanjiOriginGraph, KanjiOriginClient, type KanjiSourceInfo } from '../kanji/origin';
import { installKanjiPracticeDoodle } from '../kanji/practice-grader';
import { updateKanjiMiningControlsMount } from '../kanji/mining-controls';
import { KanjiVGClient, type KanjiVGInfo } from '../kanji/vg';
import {
    canExpandLocalPointerRange,
    isLookupableJapaneseText,
    isLowValuePitchEnrichmentToken,
    isLowValuePointerTextToken,
    isOverbroadLocalPointerRange,
    lookupCandidateSentence,
    normalizedLookupText,
    pitchEnrichmentPriority,
    pitchEnrichmentTokenForCard,
    pointerTokenAtOffset,
    preferredRenderedWordSentence,
} from '../lookup/text-helpers';
import { configureLogger, Logger } from './logger';
import {
    cardMatchesRenderedLookupValue,
    publicJpdbRenderedWordLookup,
    renderedKanaFragmentExpansionLookup,
    renderedWordCacheMatches,
    renderedWordExpansionLookup,
    renderedWordLookupText,
    type RenderedWordExpansionLookup,
    type RenderedWordKanaFragmentExpansionLookup,
} from '../main/rendered-word-lookup';
import {
    installTokenListHandlers as installTokenListClickHandlers,
    renderTokenListHtml as renderTokenListMarkup,
    type TokenListContext,
} from '../main/token-list';
import {
    createTextLookupDisplayContext,
    lookupRenderedSelection as lookupRenderedSelectionFromPage,
    showTextLookupResult as showTextLookupResultForContext,
    textLookupCardOptions,
    textLookupParseOptions as createTextLookupParseOptions,
    type TextLookupDisplayState,
    type TextLookupResultCallbacks,
} from '../main/text-lookup';
import {
    configuredPopoverMaxHeight,
    installPopoverBodyStabilizers as installRuntimePopoverBodyStabilizers,
    popoverMaxHeightAtTop as runtimePopoverMaxHeightAtTop,
    shouldUseFixedPopoverHeight,
    syncFixedPopoverHeight,
} from '../runtime/popover-body-stabilizer';
import {
    ANKI_RECOLOR_SCAN_CHUNK_SIZE,
    ANKI_TARGETED_RENDERED_WORD_SELECTOR_THRESHOLD,
    BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
    BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    FALLBACK_LOOKUP_INITIAL_WAIT_MS,
    FIVE_BUTTON_REVIEW_SHORTCUTS,
    HOVER_ANKI_HYDRATION_DELAY_MS,
    HOVER_POINTER_TEXT_LOOKUP_OPTIONS,
    KANA_ONLY_LOOKUP_RUN_RE,
    NEARBY_TERM_AUDIO_PRELOAD_LIMIT,
    NEARBY_TERM_AUDIO_PRELOAD_DELAY_MS,
    NESTED_PARSE_CONTENT_CACHE_LIMIT,
    NESTED_PARSE_CONTENT_CACHE_TTL_MS,
    NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT,
    PITCH_ENRICHMENT_LIMIT,
    PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT,
    PITCH_ENRICHMENT_QUEUE_LIMIT,
    PITCH_LOCAL_META_LIMIT,
    POINTER_TEXT_JPDB_TIMEOUT_MS,
    PRELOADED_TERM_AUDIO_KEY_LIMIT,
    RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT,
    SUBTITLE_SURFACE_SELECTOR,
    TERM_AUDIO_PRELOAD_LIMIT,
    TWO_BUTTON_REVIEW_SHORTCUTS,
    allowsGenericVisibleAutoScan,
    ankiLookupHasDisplayableNotes,
    audioPreloadLimits,
    canSchedulePointerTextHoverLookup,
    cardDisplayTrigger,
    cardSourceLabel,
    connectedElement,
    dictionaryLookupLink,
    dictionaryLookupNestedWord,
    dictionaryLookupQuery,
    dictionaryLookupWordMatchesLink,
    eventElement,
    evictOldestStringKeysWhileOverLimit,
    hasBlockedJpdbReviewState,
    hasPressLookupEnabled,
    hasVisibleAutoScanTargets,
    hasVisibleSiteScanTargets,
    isMousePointerEvent,
    matchedReviewShortcutGrade,
    mountedHoverPointerPosition,
    pointerOffsetInsideLiveLookup,
    popoverAnchorRect,
    renderedWordAnchor,
    renderedWordNavigationMode,
    samePointerTextLookupTarget,
    selectionIntersectsElement,
    shouldLockMountedPopoverPosition,
    shouldPauseVideoForSubtitleHover,
    type CardDisplayOptions,
    type DismissOptions,
    type KanjiDetailPromises,
    type LocalPointerTextEntryMatch,
    type MountPopoverOptions,
    type MountedCardShell,
    type NestedParseContentCacheEntry,
    type PitchEnrichmentOptions,
    type PointerTextDisplayOptions,
    type PointerTextLookupOptions,
    type PopoverMountState,
    type PressLookupState,
    type ReaderAppDestroyOptions,
    type ReaderAudioPreloadOptions,
    type RenderedWordDisplayContext,
    type RenderedWordLookupOptions,
    type ReviewShortcutContext,
    type ReviewShortcutTarget,
    type SettingsDialogStack,
    type TextLookupDisplayContext,
    type TextLookupOptions,
    type TokenListOptions,
    type TokenListSource,
} from './main-helpers';
import {
    inferMiningSourceKind,
    resolveMiningContext as resolveStoredMiningContext,
    type MiningContext,
} from '../study/mining-context';
import {
    openDeckPickerForCardAdd,
    setMiningControlsExpanded as setMiningControlsExpandedState,
    toggleMiningControls as toggleMiningControlsState,
} from '../study/mining-controls';
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationInsideReaderRoot, mutationMayAffectJpdbPageEnhancements, mutationMayContainJapaneseText, mutationTouchesAsbPlayer } from './mutation-scan';
import { NativeTitleGuard } from './native-title-guard';
import { isNativePageLookupBlocked, nativeClickableAncestor, shouldIgnoreDocumentClickTarget } from './native-page-lookup-targets';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsTextParsePlan, nestedTextParsePlan, type NestedParsePlan } from '../lookup/nested-text-parse';
import { resolveUiLanguage, uiText } from './i18n';
import { OnboardingController } from './onboarding';
import { installOriginGraphInteractions } from '../popup/origin-graph-interactions';
import { applyPreferredJapaneseSiteLanguage as applyJapaneseSiteLanguagePreference } from './preferred-site-language';
import { localPitchPatternFromMeta } from '../lookup/pitch-meta';
import type { ImageOcrController } from '../ocr/controller';
import { isApiMiningEnabled } from '../cards/srs-providers';
import {
    caretTextPositionFromPoint,
    japaneseRunAt,
    jpdbPointerLookupCandidates,
    pointerTextCharacterOffset,
    pointerTextLookupFromTextNode,
    type ActivePointerTextLookup,
    type PointerTextSpanCandidate,
    type PointerTextLookup,
} from '../lookup/pointer-text-lookup';
import { createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, refreshForcedReaderPopoverSurface, shouldUseSheet } from '../popup/shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import {
    buildRtkComponentSummaries,
    isKanjiCharacter,
    renderJpdbKanjiInfo,
    renderJpdbKanjiMiningControls,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderRtkInfo,
    uniqueKanji,
} from '../popup/render';
import { RtkClient, type RtkInfo } from '../kanji/rtk';
import { ReaderAudioActions } from '../audio/actions';
import { canAttemptReaderAutoAudio } from '../audio/activation';
import { registerReaderMenuCommands } from './menu-commands';
import { bindReaderRuntimeEvents } from './runtime-events';
import { detectReaderStartupJapaneseText, installReaderStartupBridge, loadReaderStartupSettings, shouldShowReaderOnboarding, type ReaderAppInitOptions } from './startup';
import { scheduleReaderAnkiStatusRefresh, scheduleReaderAnkiStatusWarmup } from './status-warmup';
import { refreshReaderWordContrast } from '../dom/word-contrast';
import { applyAnkiLookupToRenderedWord, applyPublicVocabularyFurigana, canHoverLookupReaderWordElement, canLookupReaderWordElement, currentLookupNavigationWord, documentLooksLikeStandaloneImagePage, isOcrLineFrameWord, ocrLineWordAtPoint, singleKanjiOcrLookupCharacter, updateRenderedPitch, wait } from './dom-helpers';
import { ReaderParser, fallbackLookupRangeAtOffset, fallbackLookupTermAtOffset, fallbackLookupTermsForCard, jpdbFirstParseOptions, type ReaderParserParseOptions } from '../lookup/parser';
import {
    clearRenderedWordAnkiState,
    isValidRenderedWordKey,
    renderedFallbackVocabularyCacheKey,
    renderedWordCardKey,
    renderedWordElementKey,
    renderedWordsInRoot,
    renderedWordsInRootChunked,
    renderedWordSelectorForKey,
    rootContainsRenderedWord,
    setRenderedWordCardIdentity,
    setRenderedWordPitchClass,
    uniqueParentNodes,
} from '../dom/rendered-word-state';
import {
    DEFAULT_SETTINGS,
    matchesShortcut,
    saveSettings,
    shortcutIsPressed,
    shouldLookupAnkiStatus,
} from '../settings/index';
import { effectiveJitenApiKey, effectiveJpdbApiKey, hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from '../theme/reader-theme';
import { applyHostTheme, detectHostTheme, isThemeSyncHost, jitenThemeCookieMatches, observeHostTheme, type HostTheme } from '../theme/host-theme';
import { showReaderToast } from '../ui/toast';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    kanjiSourceLabel,
} from '../sources/sections';
import { parseContentCacheKey } from '../lookup/parse-content-cache-key';
import { renderKanjiImmersionKitMount, renderKanjiSourceMounts as renderRuntimeKanjiSourceMounts } from '../runtime/kanji-source-mounts';
import { loadReaderCssFallback, READER_CSS, readerCssNeedsFallback } from '../styles/index';
import { StudySourceController } from '../study/sources';
import type { InterfaceLanguage, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { VisiblePageScanner } from './visible-page-scanner';
import { renderWordPills, updateHeadingWordPills } from '../sources/word-pills';
import { addWindowEventListener } from '../platform/window-events';
import {
    YomitanDictionaryStore,
    type YomitanKanjiEntry,
    type YomitanMetaEntry,
    type YomitanTermEntry,
} from '../dictionaries/yomitan';

const log = Logger.scope('ReaderApp');
type ReaderLifecycleSurface = {
    init: () => void;
    refresh: () => void;
    destroy: () => void;
};
const POINTER_TEXT_KANA_SURFACE_RE = /^[\u3040-\u30ffー]+$/u;
const HOST_THEME_ENFORCE_STEPS = 12;
const HOST_THEME_ENFORCE_STEP_MS = 200;

function createNoopImageOcrController(): ImageOcrController {
    const noop = (): void => undefined;
    return {
        init: noop,
        refresh: noop,
        destroy: noop,
        scanVisible: noop,
        pinLineForElement: noop,
        captureSourceImageForElement: () => undefined,
    } as unknown as ImageOcrController;
}
const OWNED_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR = [
    '[data-jpdb-reader-root]:not(.jpdb-reader-backdrop)',
    '.jpdb-ocr-layer',
    '.jpdb-subtitle-player',
    '.jpdb-subtitle-list',
    '.jpdb-reader-toast',
].join(',');
const REVIEW_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR = [
    '.review-reveal',
    '.answer-box',
    '.review-hidden',
    'form[action*="/review"]',
    'button[name="r"]',
    'input[name="r"]',
].join(',');

export class ReaderApp {
    private abortController = new AbortController();
    private isDestroyed = false;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private disposeHostThemeObserver?: () => void;
    private hostThemeEnforceTimer?: number;
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
    private jpdb = new JpdbClient(() => effectiveJpdbApiKey(this.settings), () => this.settings.corsProxyUrl);
    private jiten = new JitenApiClient(() => effectiveJitenApiKey(this.settings), { proxyUrl: () => this.settings.corsProxyUrl });
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
        jiten: this.jiten,
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
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, extraSections) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, extraSections),
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
        enrichAnkiWords: (tokens, roots) => this.enrichAnkiWords(tokens, roots),
        isCurrentPopoverRoot: root => this.isCurrentPopoverRoot(root),
    });
    private cardActions = new CardActionController({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        jiten: this.jiten,
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
        onAnkiStatusChanged: card => this.handleAnkiStatusChanged(card),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        canParseJapanese: () => this.canParseJapanese(),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT }),
        enrichAnkiWords: (tokens, roots) => this.enrichAnkiWords(tokens, roots),
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
        jiten: this.jiten,
        dictionaries: this.dictionaries,
    });
    private onboarding = new OnboardingController({
        getSettings: () => this.settings,
        setSettings: settings => {
            this.settings = settings;
            this.applyTheme();
            this.applyPreferredJapaneseSiteLanguage();
        },
        showSettings: panel => this.showSettings(panel),
    });
    private subtitles = this.createSubtitlePlayer();
    private ocr: ImageOcrController = this.createImageOcrController();
    private youtube = this.createYoutubeFilter();
    private pageScanner = new VisiblePageScanner({
        getSettings: () => this.settings,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        pauseMutationObserver: callback => this.pauseAutoScanObserver(callback),
        preloadParsedTokens: tokens => this.preloadTermAudioForTokens(tokens),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT }),
        enrichAnkiWords: (tokens, roots) => this.enrichAnkiWords(tokens, roots),
        prepareSubtitleTokensBeforeRender: tokens => this.enrichSubtitleTokensBeforeRender(tokens),
        refreshWordContrast: root => refreshReaderWordContrast(root),
        toast: message => this.toast(message),
    });
    private factoryReset: FactoryResetCoordinator = createFactoryResetCoordinator({
        dictionaries: this.dictionaries,
        isDestroyed: () => this.isDestroyed,
        getLanguage: () => this.settings.interfaceLanguage,
        invalidateRuntimeStores: () => this.invalidateRuntimeStoresForFactoryReset(),
        toast: message => this.toast(message),
        reload: () => location.reload(),
    });
    private settingsDialog?: SettingsDialogControllerInstance;
    private stackedSettingsDialog?: SettingsDialogStack;
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private lastCard?: JPDBCard;
    private lastCardSentence?: string;
    private lastAnkiLookup?: AnkiLookupResult;
    private selectionTimer?: number;
    private autoScanTimer?: number;
    private autoScanDeadline = 0;
    private autoScanForced = false;
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
    private keyboardActiveWord?: HTMLElement;
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
    private lastEnhancedHref = '';
    private nearbyReaderAudioPreloadTimer?: number;
    private preloadedTermAudioKeys = new Set<string>();
    private nestedParseContentCache = new Map<string, NestedParseContentCacheEntry>();
    private pitchEnrichmentLocalCache = new Map<string, Promise<string>>();
    private resolvedFallbackVocabularyCache = new Map<string, JPDBCard>();
    private renderedWordIndex = new Map<string, Set<HTMLElement>>();
    private renderedWordIndexFullyScanned = false;
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
    private embeddedFrame = false;
    private pressLookup?: PressLookupState;
    private suppressMiddleAuxClickUntil = 0;

    constructor() {
        configureLogger({ settingsProvider: () => this.settings });
    }

    private createSubtitlePlayer(): SubtitlePlayerControllerInstance | ReaderLifecycleSurface {
        const Controller = yomuSubtitlePlayerController();
        if (!Controller) return this.missingCompanionSurface('Video companion', 'subtitles');
        return new Controller({
            getSettings: () => this.settings,
            parseJapanese: async (text, options) => (await this.parseJapanese([text], options))[0] ?? [],
            parseJapaneseBatch: (texts, options) => this.parseJapanese(texts, options),
            afterParseTokens: (tokens, roots) => this.afterSubtitleJapaneseParsed(tokens, roots),
            onSettingsChange: () => void saveSettings(this.settings),
        });
    }

    private createYoutubeFilter(): YoutubeImmersionFilterInstance | ReaderLifecycleSurface {
        const Controller = yomuYoutubeImmersionFilter();
        if (!Controller) return this.missingCompanionSurface('Video companion', 'youtube');
        return new Controller({
            getSettings: () => this.settings,
            setShowFilterNotice: visible => void this.setYoutubeFilterNoticeVisible(visible),
            setShowChannelRecommendations: visible => void this.setYoutubeChannelRecommendationsVisible(visible),
        });
    }

    private createImageOcrController(): ImageOcrController {
        const Controller = yomuImageOcrController();
        if (!Controller) {
            log.warnOnce('ocr-companion-missing', 'OCR companion is missing; image reading is disabled.');
            return createNoopImageOcrController();
        }
        return new Controller({
            getSettings: () => this.settings,
            parseJapanese: async (text, options) => (await this.parseJapanese([text], options))[0] ?? [],
            onToast: message => this.toast(message),
            shouldAutoScan: () => this.pageHasJapaneseText || documentLooksLikeStandaloneImagePage(),
            enrichTokensBeforeRender: tokens => this.enrichOcrTokensBeforeRender(tokens),
            enrichRenderedTokens: (tokens, root) => this.enrichOcrRenderedTokens(tokens, root),
            fallbackCardFromText: text => this.parser.fallbackCardFromText(text),
        });
    }

    private missingCompanionSurface(label: string, key: string): ReaderLifecycleSurface {
        return {
            init: () => log.warnOnce(`${key}-companion-missing`, `${label} is missing; related features are disabled.`),
            refresh: () => undefined,
            destroy: () => undefined,
        };
    }

    async init(options?: ReaderAppInitOptions): Promise<void> {
        const done = log.time('init', { href: location.href, devMode: Logger.isDevMode() });
        this.embeddedFrame = options?.embeddedFrame === true;
        const shouldShowWelcome = await this.loadInitialSettings(options);
        await this.installCoreSurfaces();
        await this.initReaderPage(shouldShowWelcome);
        done();
    }

    private async loadInitialSettings(options?: ReaderAppInitOptions): Promise<boolean> {
        this.factoryReset.bind();
        const startup = await loadReaderStartupSettings(options);
        this.settings = startup.settings;
        this.applyPreferredJapaneseSiteLanguage();
        configureLogger({ forceEnabled: this.settings.enableLogging });
        this.pageHasJapaneseText = detectReaderStartupJapaneseText();
        log.info('Settings loaded', startup.settingsSummary);
        return startup.shouldShowWelcome;
    }

    private async installCoreSurfaces(): Promise<void> {
        this.installStyles();
        this.applyTheme();
        await this.refreshDictionaryStyles();
        if (this.embeddedFrame) return;
        this.registerMenuCommands();
        this.bindEvents();
        installReaderStartupBridge();
    }

    private async initReaderPage(shouldShowWelcome: boolean): Promise<void> {
        if (this.embeddedFrame) {
            this.subtitles.init();
            return;
        }
        this.installFab();
        this.subtitles.init();
        this.ocr.init();
        this.youtube.init();
        this.setupAutoScan();
        this.initJpdbPageEnhancements();
        if (shouldShowReaderOnboarding(shouldShowWelcome)) await this.onboarding.showIfNeeded();
        if (this.shouldScanInitialPage()) {
            void this.pageScanner.scanVisiblePage({ silent: true })
                .finally(() => this.scheduleAnkiStatusWarmup());
        } else {
            this.scheduleAnkiStatusWarmup();
        }
    }

    private scheduleAnkiStatusWarmup(): void {
        if (!this.shouldRunAnkiBackgroundWork()) return;
        scheduleReaderAnkiStatusWarmup({
            getSettings: () => this.settings,
            isDestroyed: () => this.isDestroyed,
            warmStatusIndex: () => this.anki.warmStatusIndex(),
            recolorRenderedAnkiWordsFromCache: () => this.recolorRenderedAnkiWordsFromCache(),
            onRecolorError: error => {
                log.warnOnce('anki-cache-recolor-failed', 'Anki cache recolor failed', error);
            },
        });
    }

    private scheduleRenderedAnkiStatusRefresh(card: JPDBCard): void {
        if (!this.shouldRunAnkiBackgroundWork()) return;
        scheduleReaderAnkiStatusRefresh(this.settings, () => this.refreshRenderedAnkiStatusAfterMutation(card));
    }

    private shouldRunAnkiBackgroundWork(): boolean {
        return !this.isDestroyed && shouldLookupAnkiStatus(this.settings);
    }

    private handleAnkiStatusChanged(card: JPDBCard): void {
        this.cardRenderData.clear();
        this.scheduleRenderedAnkiStatusRefresh(card);
    }

    private async refreshRenderedAnkiStatusAfterMutation(card: JPDBCard): Promise<void> {
        if (!this.shouldRunAnkiBackgroundWork()) return;
        try {
            const lookup = await this.anki.findExistingCards(card);
            if (!this.shouldRunAnkiBackgroundWork()) return;
            this.applyAnkiLookupToRenderedWords(card, lookup);
        } catch (error) {
            if (!this.shouldRunAnkiBackgroundWork()) return;
            log.warnOnce('anki-mutation-recolor-failed', 'Anki status recolor after mutation failed', error);
            await this.recolorRenderedAnkiWordsFromCache().catch(cacheError => {
                log.warnOnce('anki-mutation-cache-recolor-failed', 'Cached Anki recolor after mutation failed', cacheError);
            });
        }
    }

    private shouldScanInitialPage(): boolean {
        return this.canParseJapanese()
            && (this.pageHasJapaneseText || hasVisibleSiteScanTargets());
    }

    private registerMenuCommands(): void {
        registerReaderMenuCommands({
            getSettings: () => this.settings,
            saveSettings: settings => saveSettings(settings),
            installFloatingButton: () => this.installFab(),
            showSettings: () => this.showSettings(),
            toggleYoutubeImmersion: () => this.toggleYoutubeImmersion(),
            factoryReset: () => void this.factoryReset.resetAllData(),
            logInfo: (message, details) => {
                log.info(message, details);
            },
        });
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
        log.info('YouTube filter notice changed', { visible });
    }

    private async setYoutubeChannelRecommendationsVisible(visible: boolean): Promise<void> {
        this.settings.youtubeShowChannelRecommendations = visible;
        await saveSettings(this.settings);
        this.youtube.refresh();
        log.info('YouTube channel recommendations changed', { visible });
    }

    private async setInterfaceLanguage(language: InterfaceLanguage): Promise<void> {
        if (this.settings.interfaceLanguage === language) return;
        this.settings.interfaceLanguage = language;
        await saveSettings(this.settings);
        this.settingsDialog?.refreshLanguage(language);
        this.clearHostedPageReaderWords();
        this.installFab();
        this.subtitles.refresh();
        this.ocr.refresh();
        this.youtube.refresh();
        this.scheduleLanguageChangeScan();
        log.info('Interface language changed', { language });
    }

    private clearHostedPageReaderWords(): void {
        if (!isYomuHostedAppUrl(location.href)) return;
        const count = unwrapReaderWords(document);
        if (count > 0) refreshReaderWordContrast(document);
    }

    private scheduleLanguageChangeScan(): void {
        window.setTimeout(() => {
            if (this.isDestroyed) return;
            this.pageHasJapaneseText = documentHasJapaneseText();
            if (this.shouldScanInitialPage()) this.scheduleVisiblePageReparse(0);
        }, 160);
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
        this.resolvedFallbackVocabularyCache.clear();
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
        this.syncHostTheme(settings);
        refreshReaderWordContrast(document);
    }

    private initHostThemeSync(): void {
        if (this.disposeHostThemeObserver || !isThemeSyncHost()) return;
        this.disposeHostThemeObserver = observeHostTheme(theme => this.handleHostThemeChange(theme));
    }

    private syncHostTheme(settings = this.settings): void {
        if (!isThemeSyncHost()) return;
        this.initHostThemeSync();
        window.clearTimeout(this.hostThemeEnforceTimer);
        if (settings.theme === 'auto') this.applyReaderThemeClasses(detectHostTheme());
        else this.enforceHostTheme(settings.theme, HOST_THEME_ENFORCE_STEPS);
    }

    private enforceHostTheme(theme: HostTheme, remaining: number): void {
        applyHostTheme(theme);
        if (remaining <= 0 || this.isDestroyed) return;
        this.hostThemeEnforceTimer = window.setTimeout(() => this.enforceHostTheme(theme, remaining - 1), HOST_THEME_ENFORCE_STEP_MS);
    }

    private applyReaderThemeClasses(theme: HostTheme): void {
        const root = document.documentElement;
        root.classList.toggle('jpdb-reader-theme-dark', theme === 'dark');
        root.classList.toggle('jpdb-reader-theme-light', theme === 'light');
    }

    private handleHostThemeChange(hostTheme: HostTheme): void {
        if (this.isDestroyed) return;
        const setting = this.settings.theme;
        if (setting === hostTheme) return;
        if ((setting === 'light' || setting === 'dark') && jitenThemeCookieMatches(setting)) {
            applyHostTheme(setting);
            return;
        }
        if (setting === 'auto') {
            this.applyReaderThemeClasses(hostTheme);
            refreshReaderWordContrast(document);
            return;
        }
        this.settings = { ...this.settings, theme: hostTheme };
        void saveSettings(this.settings);
        applyReaderTheme(this.settings);
        refreshReaderWordContrast(document);
        this.publishThemeSettingsChange();
    }

    private applyPreferredJapaneseSiteLanguage(settings = this.settings): void {
        applyJapaneseSiteLanguagePreference(settings.preferJapaneseSiteLanguage);
    }

    private publishThemeSettingsChange(): void {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings: { theme: this.settings.theme } } }));
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private clearBridgeBackedCaches(): void {
        this.audio.clearCaches();
        this.jpdbVocabulary.clear();
        this.cardRenderData.clear();
    }

    private scheduleDictionaryRescan(): void {
        if (this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.dictionaryRescanPending = true;
            return;
        }
        this.pitchEnrichmentLocalCache.clear();
        this.nestedParseContentCache.clear();
        this.resolvedFallbackVocabularyCache.clear();
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
        if (!isPageEnhancementHost()) return;
        this.scheduleJpdbPageEnhancements(0);
        addWindowEventListener('popstate', () => this.scheduleJpdbPageEnhancements(120), { signal: this.abortController.signal });
        addWindowEventListener('hashchange', () => this.scheduleJpdbPageEnhancements(120), { signal: this.abortController.signal });
    }

    private scheduleJpdbPageEnhancements(delay = 0): void {
        if (this.isDestroyed || !isPageEnhancementHost()) return;
        window.clearTimeout(this.jpdbPageEnhanceTimer);
        this.jpdbPageEnhanceTimer = window.setTimeout(() => {
            this.jpdbPageEnhanceTimer = undefined;
            void this.refreshJpdbPageEnhancements();
        }, Math.max(0, delay));
    }

    private async refreshJpdbPageEnhancements(): Promise<void> {
        const generation = ++this.jpdbPageEnhancementGeneration;
        this.lastEnhancedHref = location.href;
        this.pauseAutoScanObserver(() => this.removeJpdbPageEnhancements());
        if (!this.settings.jpdbPageEnhancementsEnabled || !isPageEnhancementReady()) return;
        if (isCurrentKanjiSurface()) {
            if (this.settings.jpdbPageKanjiEnhancementsEnabled) this.installJpdbKanjiPageEnhancement(generation);
            return;
        }
        if (this.settings.jpdbPageWordEnhancementsEnabled) await this.installJpdbWordPageEnhancements(generation);
    }

    private removeJpdbPageEnhancements(): void {
        document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]').forEach(element => element.remove());
    }

    private jitenEnhancementsNeedRefresh(): boolean {
        if (location.href !== this.lastEnhancedHref) return true;
        return isPageEnhancementReady() && this.settings.jpdbPageEnhancementsEnabled && !document.querySelector('[data-yomu-jpdb-addon]');
    }

    private async installJpdbWordPageEnhancements(generation: number): Promise<void> {
        const targets = currentPageLocalDictionaryTargets();
        await Promise.all(targets.map(target => this.installJpdbWordPageEnhancement(target, generation)));
    }

    private async installJpdbWordPageEnhancement(target: LocalDictionaryTarget, generation: number): Promise<void> {
        const card = jpdbAudioCard(target.term, target.reading);
        const entries = await this.lookupJpdbPageLocalEntries(target);
        if (!this.isCurrentJpdbPageEnhancement(generation)) return;
        if (!entries.length && !this.settings.immersionKitEnabled) return;

        const root = this.createJpdbPageAddonRoot('word', target.anchor);
        if (!root) return;
        setInnerHtml(root, this.renderDefinitionSources(card, entries, target.examples[0]?.sentence, null, null, {
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
        const kanji = currentPageKanji();
        if (!isKanjiCharacter(kanji) || !this.isCurrentJpdbPageEnhancement(generation)) return;
        const target = currentPageTermTarget();
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
        root.addEventListener('click', event => this.handleJpdbPageAddonClick(event, root, fallbackCard));
    }

    private handleJpdbPageAddonClick(event: MouseEvent, root: HTMLElement, fallbackCard: JPDBCard): void {
        if (!(event instanceof MouseEvent)) return;
        if (this.handleDictionaryLookupLink(event, root, 'modal')) return;
        const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
        if (!actionButton?.dataset.action || !root.contains(actionButton)) return;
        event.preventDefault();
        event.stopPropagation();
        this.dispatchJpdbPageAddonAction(actionButton, fallbackCard);
    }

    private dispatchJpdbPageAddonAction(actionButton: HTMLButtonElement, fallbackCard: JPDBCard): void {
        const handlers: Record<string, () => void> = {
            kanji: () => this.showJpdbPageAddonKanji(actionButton, fallbackCard),
            'similar-word': () => this.lookupTextFromAddonAction(actionButton),
            lookup: () => this.lookupTextFromAddonAction(actionButton),
            'jpdb-example-audio': () => this.playJpdbPageAddonExampleAudio(actionButton),
        };
        handlers[actionButton.dataset.action ?? '']?.();
    }

    private showJpdbPageAddonKanji(actionButton: HTMLButtonElement, fallbackCard: JPDBCard): void {
        void this.showKanjiCard(fallbackCard, actionButton.dataset.kanji ?? '', fallbackCard.spelling, actionButton, {
            navigation: 'push-current',
            preservePosition: true,
        });
    }

    private lookupTextFromAddonAction(actionButton: HTMLButtonElement): void {
        const expression = actionButton.dataset.expression ?? actionButton.dataset.lookup ?? actionButton.dataset.term ?? '';
        const reading = actionButton.dataset.reading ?? expression;
        void this.lookupText(expression, reading, { anchor: actionButton, navigation: 'push-current', preservePosition: true, userGesture: true });
    }

    private playJpdbPageAddonExampleAudio(actionButton: HTMLButtonElement): void {
        void this.audioActions.playJpdbExampleAudio(actionButton.dataset.jpdbAudio ?? '', actionButton.dataset.jpdbExampleSentence ?? '');
    }

    private isCurrentJpdbPageEnhancement(generation: number): boolean {
        return !this.isDestroyed
            && isPageEnhancementHost()
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
        this.disposeHostThemeObserver?.();
        window.clearTimeout(this.hostThemeEnforceTimer);
        this.autoScanObserver?.disconnect();
        this.ocr.destroy();
        this.subtitles.destroy();
        this.youtube.destroy();
        this.anki.destroy?.();
        window.clearTimeout(this.autoScanTimer);
        this.autoScanForced = false;
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
        this.resolvedFallbackVocabularyCache.clear();
        this.clearPitchEnrichmentQueue();
        this.clearRenderedWordIndex();
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.activePopoverResizeObserver?.disconnect();
        this.nativeTitleGuard.restore();
        
        this.floatingButton.destroy();
        // If we tear down (e.g. a re-boot) while settings is open, release the
        // aria-hidden/inert it placed on the page so the next instance isn't inert.
        this.settingsDialog?.releaseModalBackground();
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
            const canScanText = this.canParseJapanese();
            if (canScanText && mutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (mutations.every(mutationInsideReaderRoot)) return;
            else if (canScanText && mutations.some(mutationMayContainJapaneseText)) {
                this.pageHasJapaneseText = true;
                this.scheduleAutoScan(450);
            }
            if (isJitenHost()) {
                if (this.jitenEnhancementsNeedRefresh()) this.scheduleJpdbPageEnhancements(500);
            } else if (isPageEnhancementHost() && mutations.some(mutationMayAffectJpdbPageEnhancements)) {
                this.scheduleJpdbPageEnhancements(500);
            }
        });
        this.observeAutoScanMutations();
        window.addEventListener('scroll', () => this.scheduleAutoScan(160, { force: true }), { passive: true });
        window.addEventListener('resize', () => this.scheduleAutoScan(250, { force: true }), { passive: true });
        window.addEventListener('resize', () => this.scheduleJpdbPageEnhancements(700), { passive: true });
        if (this.hasVisibleAutoScanWork()) this.scheduleAutoScan(600);
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

    private scheduleAutoScan(delay: number, options: { force?: boolean } = {}): void {
        const forced = Boolean(options.force);
        if (!this.canScheduleAutoScan(forced)) return;
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) {
            this.autoScanForced = this.autoScanForced || forced;
            return;
        }

        window.clearTimeout(this.autoScanTimer);
        this.autoScanForced = forced;
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.runScheduledAutoScan();
        }, delay);
    }

    private canScheduleAutoScan(force = false): boolean {
        return !this.isDestroyed
            && this.canParseJapanese()
            && (force || this.hasVisibleAutoScanWork());
    }

    private runScheduledAutoScan(): void {
        const forced = this.autoScanForced;
        this.autoScanTimer = undefined;
        this.autoScanDeadline = 0;
        this.autoScanForced = false;
        if (typeof this.pageScanner.scanAsbPlayerSubtitles === 'function') void this.pageScanner.scanAsbPlayerSubtitles();
        if (forced || hasVisibleAutoScanTargets()) void this.pageScanner.scanVisiblePage({ silent: true });
    }

    private hasVisibleAutoScanWork(): boolean {
        return hasVisibleSiteScanTargets() || (allowsGenericVisibleAutoScan() && this.pageHasJapaneseText);
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (this.isDestroyed) return;
        if (!this.canParseJapanese()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.pageScanner.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        bindReaderRuntimeEvents({
            getSettings: () => this.settings,
            setSettings: settings => {
                this.settings = settings;
            },
            isDestroyed: () => this.isDestroyed,
            showSettings: panel => this.showSettings(panel),
            setInterfaceLanguage: language => this.setInterfaceLanguage(language),
            applyTheme: () => this.applyTheme(),
            saveSettings: settings => saveSettings(settings),
            clearBridgeCaches: () => this.clearBridgeBackedCaches(),
        }, this.abortController.signal);

        document.addEventListener('click', event => this.handleDocumentClick(event), { capture: true });

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

        document.addEventListener('keyup', () => this.scheduleSelectionLookup(120));

        document.addEventListener('mouseup', () => this.scheduleSelectionLookup(140));

        document.addEventListener('touchend', () => this.scheduleSelectionLookup(180), { passive: true });

        document.addEventListener('keydown', event => this.handleDocumentKeydown(event));
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

    private scheduleSelectionLookup(delayMs: number): void {
        if (this.isDestroyed || !this.settings.parseSelection) return;
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), delayMs);
    }

    private handleDocumentClick(event: MouseEvent): void {
        if (this.isDestroyed) return;
        const target = event.target as HTMLElement;
        if (shouldIgnoreDocumentClickTarget(target)) return;

        const word = this.readerWordForPointerEvent(event);
        if (!word && target.closest?.('[data-jpdb-reader-root] a.gloss-link[data-dictionary-lookup]')) return;

        const insideActivePopover = this.activePopoverMode === 'modal' && this.isInsideActivePopover(event.target as Node | null);
        if (!word) {
            this.handleDocumentLookupCandidateClick(event, insideActivePopover);
            return;
        }
        this.handleReaderWordClick(event, word);
    }

    private handleDocumentLookupCandidateClick(event: MouseEvent, insideActivePopover: boolean): void {
        if (!this.settings.lookupOnClick && !insideActivePopover) return;
        const candidate = this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target);
        if (!candidate) return;
        event.preventDefault();
        event.stopPropagation();
        this.prepareModalLookupFromPointer(event);
        this.suppressSelectionLookupUntil = Date.now() + 350;
        void this.showLookupCandidate(candidate, 'modal', {
            navigation: insideActivePopover ? 'push-current' : 'reset',
            preservePosition: insideActivePopover,
            userGesture: true,
        });
    }

    private handleReaderWordClick(event: MouseEvent, word: HTMLElement): void {
        if (!this.canLookupReaderWord(word)) return;
        if (word.dataset.jpdbReaderPassive === 'true') return;
        if (this.consumeSuppressedReaderWordClick(event, word)) return;

        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        const insideSubtitlePlayer = Boolean(word.closest(SUBTITLE_SURFACE_SELECTOR));
        if (!insideReaderPopup && !insideSubtitlePlayer
            && nativeClickableAncestor(word)
            && !this.clickForcesReaderWordLookup(event)) {
            return;
        }
        if (!this.settings.lookupOnClick && !insideReaderPopup && !insideSubtitlePlayer) return;

        event.preventDefault();
        event.stopPropagation();
        this.prepareModalLookupFromPointer(event);
        this.suppressSelectionLookupUntil = Date.now() + 350;
        if (insideSubtitlePlayer && this.settings.subtitleMiningPause) pauseActiveVideo();
        this.ocr.pinLineForElement(word);
        void this.showWord(word, insideReaderPopup
            ? { trigger: 'click', userGesture: true, navigation: 'push-current' }
            : { trigger: 'click', userGesture: true });
    }

    private consumeSuppressedReaderWordClick(event: MouseEvent, word: HTMLElement): boolean {
        if (Date.now() >= this.suppressWordClickUntil && !this.shouldIgnoreCurrentImmersionExampleTargetClick(word)) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    private handleDocumentKeydown(event: KeyboardEvent): void {
        if (this.isDestroyed) return;
        this.pressedKeys.add(normalizePressedKey(event.key));
        if (isEditableTarget(event.target)) return;
        if (this.handleClosePopupShortcut(event)) return;
        if (this.hasHoverLookupShortcut() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
        if (this.handleLookupNavigationShortcut(event)) return;
        if (this.handleReaderUtilityShortcut(event)) return;
        this.handleReviewShortcut(event);
    }

    private handleClosePopupShortcut(event: KeyboardEvent): boolean {
        const escapeClose = this.settings.shortcuts.closePopup.trim().toLowerCase() === 'escape' && event.key === 'Escape';
        if (!this.hasOpenReaderDialog()) return false;
        if (!escapeClose && !matchesShortcut(event, this.settings.shortcuts.closePopup)) return false;
        event.preventDefault();
        this.dismiss({ suppressHoverTarget: true });
        return true;
    }

    private handleLookupNavigationShortcut(event: KeyboardEvent): boolean {
        if (matchesShortcut(event, this.settings.shortcuts.previousLookupWord)) {
            event.preventDefault();
            void this.navigateLookupWord(-1);
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.nextLookupWord)) {
            event.preventDefault();
            void this.navigateLookupWord(1);
            return true;
        }
        return false;
    }

    private handleReaderUtilityShortcut(event: KeyboardEvent): boolean {
        if (matchesShortcut(event, this.settings.shortcuts.scanPage)) {
            event.preventDefault();
            log.info('Shortcut scan');
            void this.pageScanner.scanVisiblePage({ silent: false });
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
            event.preventDefault();
            log.info('Shortcut opened settings');
            this.showSettings();
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
            this.toggleOcrFromShortcut(event);
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
            event.preventDefault();
            void this.toggleYoutubeImmersion();
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.scanImages)) {
            event.preventDefault();
            log.info('Shortcut triggered image scan');
            void this.ocr.scanVisible();
            return true;
        }
        return this.handleAudioShortcut(event);
    }

    private toggleOcrFromShortcut(event: KeyboardEvent): void {
        event.preventDefault();
        this.settings.ocrEnabled = !this.settings.ocrEnabled;
        void saveSettings(this.settings);
        this.ocr.refresh();
        log.info('Shortcut toggled OCR', { enabled: this.settings.ocrEnabled });
        this.toast(uiText(this.settings.interfaceLanguage, this.settings.ocrEnabled ? 'imageReadingEnabled' : 'imageReadingHidden'));
    }

    private handleAudioShortcut(event: KeyboardEvent): boolean {
        if (!this.lastCard || !this.activePopover) return false;
        if (!matchesShortcut(event, this.settings.shortcuts.playAudio)) return false;
        event.preventDefault();
        void this.audioActions.playTermAudio(this.lastCard, { userGesture: true });
        return true;
    }

    private handleReviewShortcut(event: KeyboardEvent): void {
        const context = this.reviewShortcutContext(event);
        if (!context) return;
        event.preventDefault();
        void this.submitReviewShortcut(context);
    }

    private reviewShortcutContext(event: KeyboardEvent): ReviewShortcutContext | null {
        const target = this.reviewShortcutTarget(event);
        if (!target) return null;
        const ankiCardId = this.lastAnkiLookup?.primary?.primaryCardId ?? null;
        if (!this.canReviewFromShortcut(ankiCardId)) return null;
        return this.createReviewShortcutContext(target, ankiCardId);
    }

    private reviewShortcutTarget(event: KeyboardEvent): ReviewShortcutTarget | null {
        const grade = this.shortcutGrade(event);
        const card = this.lastCard;
        if (!grade || !card) return null;
        return this.isReviewShortcutPopoverOpen() ? { grade, card } : null;
    }

    private createReviewShortcutContext(target: ReviewShortcutTarget, ankiCardId: number | null): ReviewShortcutContext {
        return {
            grade: target.grade,
            card: target.card,
            ankiCardId,
            sentence: this.lastCardSentence,
            anchor: this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
            trigger: this.activePopoverMode === 'hover' ? 'hover' : 'modal',
        };
    }

    private isReviewShortcutPopoverOpen(): boolean {
        return Boolean(this.activePopover?.classList.contains('jpdb-reader-popover'));
    }

    private canReviewFromShortcut(ankiCardId: number | null): boolean {
        return Boolean(ankiCardId) || isApiMiningEnabled(this.settings);
    }

    private submitReviewShortcut(context: ReviewShortcutContext): Promise<void> {
        return this.cardActions.reviewGrade(context.grade, context.card, context.sentence, {
            ankiCardId: this.reviewShortcutAnkiCardId(context.ankiCardId),
        }).then(() => this.dismissAfterReview()).catch(error => {
            log.warn('Shortcut review failed', { grade: context.grade, ankiCardId: this.reviewShortcutAnkiCardId(context.ankiCardId, true) }, error);
            this.toast(error instanceof Error ? error.message : uiText(this.settings.interfaceLanguage, 'reviewFailed'));
        });
    }

    private reviewShortcutAnkiCardId(ankiCardId: number | null, includeZero = false): number | undefined {
        if (typeof ankiCardId !== 'number' || !Number.isFinite(ankiCardId)) return undefined;
        if (!includeZero && !ankiCardId) return undefined;
        return ankiCardId;
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

    private clickForcesReaderWordLookup(event: MouseEvent): boolean {
        const hasModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
        return hasModifier && this.shouldLookupOnHover(event);
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
        if (word.closest(SUBTITLE_SURFACE_SELECTOR) && this.settings.subtitleMiningPause) pauseActiveVideo();
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

    private async navigateLookupWord(direction: -1 | 1): Promise<void> {
        const words = this.lookupWordNavigationCandidates();
        if (!words.length) return;
        const current = currentLookupNavigationWord(words, this.activePopoverAnchor, this.keyboardActiveWord);
        const currentIndex = current ? words.indexOf(current) : -1;
        const nextIndex = currentIndex >= 0
            ? Math.max(0, Math.min(words.length - 1, currentIndex + direction))
            : direction > 0 ? 0 : words.length - 1;
        const word = words[nextIndex];
        if (!word) return;
        this.setKeyboardActiveWord(word);
        word.focus({ preventScroll: true });
        word.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        await this.showWord(word, { trigger: 'click', navigation: 'reset', userGesture: true });
        if (word.isConnected) this.setKeyboardActiveWord(word);
    }

    private lookupWordNavigationCandidates(): HTMLElement[] {
        const selected = this.selectedLookupNavigationWords();
        if (selected.length) return selected;
        const scoped = this.scopedLookupNavigationWords();
        return scoped.length ? scoped : this.lookupableReaderWords().filter(word => this.isKeyboardNavigableWord(word));
    }

    private selectedLookupNavigationWords(): HTMLElement[] {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return [];
        return this.lookupableReaderWords()
            .filter(word => this.isKeyboardNavigableWord(word) && selectionIntersectsElement(selection, word));
    }

    private scopedLookupNavigationWords(): HTMLElement[] {
        const anchor = this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : this.keyboardActiveWord?.isConnected ? this.keyboardActiveWord : undefined;
        const scope = anchor?.closest<HTMLElement>('.jpdb-subtitle-primary, .jpdb-subtitle-list-row, p, li, blockquote, article, main');
        if (!scope) return [];
        return Array.from(scope.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
            .filter(word => this.isKeyboardNavigableWord(word));
    }

    private isKeyboardNavigableWord(word: HTMLElement): boolean {
        if (!word.isConnected || word.closest('.jpdb-reader-settings')) return false;
        if (!this.canLookupReaderWord(word)) return false;
        return Array.from(word.getClientRects()).some(rect => rect.width > 0 && rect.height > 0);
    }

    private setKeyboardActiveWord(word: HTMLElement): void {
        if (this.keyboardActiveWord && this.keyboardActiveWord !== word) {
            this.keyboardActiveWord.classList.remove('jpdb-reader-keyboard-active');
        }
        this.keyboardActiveWord = word;
        word.classList.add('jpdb-reader-keyboard-active');
    }

    private clearKeyboardActiveWord(): void {
        this.keyboardActiveWord?.classList.remove('jpdb-reader-keyboard-active');
        this.keyboardActiveWord = undefined;
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
        return canLookupReaderWordElement(word);
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        return canHoverLookupReaderWordElement(word, this.hasHoverLookupShortcut());
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
        const word = this.readerWordForPointerEvent(event);
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private readerWordForPointerEvent(event: MouseEvent): HTMLElement | null {
        const target = event.target instanceof Element ? event.target : null;
        const direct = target?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        if (direct) return direct;
        return this.ocrLineWordForPointer(target, event.clientX, event.clientY)
            ?? this.readerWordFromRenderedGeometry(target, event.clientX, event.clientY);
    }

    private ocrLineWordForPointer(target: Element | null, x: number, y: number): HTMLElement | null {
        const line = target?.closest?.('.jpdb-ocr-line') as HTMLElement | null;
        return line ? ocrLineWordAtPoint(line, x, y) : null;
    }

    private readerWordFromRenderedGeometry(target: Element | null, x: number, y: number): HTMLElement | null {
        const scope = this.readerWordGeometryScope(target);
        return scope ? readerWordAtPointInScope(scope, x, y, word => this.canLookupReaderWord(word)) : null;
    }

    private readerWordGeometryScope(target: Element | null): ParentNode | null {
        if (!target) return null;
        const scope = target.closest<HTMLElement>('.textBox,.ocr-line,p,li,blockquote,td,th,article,main,[data-jpdb-reader-root]');
        return scope && scope.querySelector('.jpdb-reader-word') ? scope : null;
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
        if (this.hoverReaderWordFromElement(related instanceof HTMLElement ? related : related?.parentElement ?? null)) {
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
        if (this.shouldKeepModalPopoverForOutsidePointer(event.target as Node | null)) return;
        this.dismiss({ suppressHoverTarget: true });
    }

    private shouldKeepModalPopoverForOutsidePointer(target: Node | null): boolean {
        const element = target instanceof Element ? target : target?.parentElement;
        // A lookup stacked over the settings dialog should collapse back to settings
        // when the user taps the settings panel behind it. The settings form carries
        // data-jpdb-reader-root, so it would otherwise match the owned-surface
        // keep-open selector and trap the stacked lookup open (notably on touch).
        if (this.isPointerOnStackedSettingsDialog(element)) return false;
        return Boolean(element?.closest(OWNED_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR)
            || element?.closest(REVIEW_MODAL_OUTSIDE_POINTER_TARGET_SELECTOR));
    }

    private isPointerOnStackedSettingsDialog(element: Element | null | undefined): boolean {
        if (!this.shouldDismissStackedLookupOnly()) return false;
        const form = this.stackedSettingsDialog?.form;
        return Boolean(form && element && form.contains(element));
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
        this.installHoverLookupTimer(word, () => this.runScheduledHoverLookup(word, event, hoverLookupGeneration));
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

    private installHoverLookupTimer(word: HTMLElement, runLookup: () => void): void {
        const delay = this.hoverLookupDelayMs(word);
        if (delay === 0) runLookup();
        else this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private hoverLookupDelayMs(word: HTMLElement): number {
        if (this.activePopoverMode === 'hover' && this.activeHoverWord && this.activeHoverWord !== word) return 0;
        return Math.max(0, this.settings.hoverOpenDelayMs);
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
        if (this.isMiddlePressHoverContextActive()) return true;
        if (this.activePointerTextLookup) return this.isPointerTextHoverContextActive(options);
        if (this.activeHoverWord && this.isWordHoverActive(this.activeHoverWord, options)) return true;
        if (this.isPopoverCssHoverActive(options)) return true;
        const target = this.currentHoverPointerTarget(options);
        return target ? this.isInsideActiveHoverContext(target) : false;
    }

    private isMiddlePressHoverContextActive(): boolean {
        const pressLookup = this.pressLookup;
        const word = pressLookup?.lastWord;
        return Boolean(
            pressLookup?.source === 'middle'
                && pressLookup.active
                && word?.isConnected
                && this.activeHoverWord === word,
        );
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
        if (target instanceof Element && this.ocrLineWordForPointer(target, this.lastPointerPosition.x, this.lastPointerPosition.y) === word) return true;
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

    private isParserBackedLookupCard(card: JPDBCard): boolean {
        return this.isJpdbBackedCard(card) || card.source === 'jiten';
    }

    private async lookupSelection(): Promise<void> {
        if (this.isDestroyed) return;
        if (Date.now() < this.suppressSelectionLookupUntil) return;
        const selected = this.selectionLookupText();
        if (!selected) return;
        if (await this.lookupRenderedSelection(selected)) return;
        await this.lookupText(selected, getSelectionSentence(), { source: 'selection' });
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
            const [tokens] = await this.parseJapanese([sentence], this.textLookupParseOptions());
            await showTextLookupResultForContext(context, tokens, sentence, this.textLookupResultCallbacks());
        } catch (error) {
            log.warn('Lookup fallback', { selected: context.selected }, error);
            await this.showLocalOrFallbackLookupCard(context, sentence, error);
        } finally {
            done();
        }
    }

    private textLookupDisplayContext(text: string, options: TextLookupOptions): TextLookupDisplayContext | null {
        return createTextLookupDisplayContext(text, options, this.textLookupDisplayState());
    }

    private activeTextLookupTrigger(): 'modal' | 'hover' {
        return this.activePopoverMode === 'hover' ? 'hover' : 'modal';
    }

    private textLookupPreviousNavigationEntry(trigger: 'modal' | 'hover', navigation: CardNavigationMode): PopupNavigationEntry | undefined {
        return trigger === 'modal' && navigation === 'push-current'
            ? this.activePopoverNavigationEntry()
            : undefined;
    }

    private textLookupDisplayState(): TextLookupDisplayState {
        return {
            activePopoverAnchor: this.activePopoverAnchor,
            defaultTrigger: this.activeTextLookupTrigger(),
            hasActivePopover: Boolean(this.activePopover),
            previousNavigationEntry: (trigger, navigation) => this.textLookupPreviousNavigationEntry(trigger, navigation),
        };
    }

    private textLookupParseOptions(): ReaderParserParseOptions {
        return createTextLookupParseOptions(effectiveJpdbApiKey(this.settings));
    }

    private async lookupRenderedSelection(selected: string): Promise<boolean> {
        return lookupRenderedSelectionFromPage(selected, {
            cardForRenderedWord: word => this.cardForRenderedWord(word),
            displayState: this.textLookupDisplayState(),
            fallbackCardFromText: textValue => this.parser.fallbackCardFromText(textValue),
            lookupableReaderWords: () => this.lookupableReaderWords(),
            renderedWordSentence: word => this.renderedWordSentence(word),
            showCard: (card, cardSentence, anchor, cardOptions) => {
                void this.showCard(card, cardSentence, anchor, cardOptions);
            },
            showTokenList: (tokens, selectedText, anchor, tokenOptions) => {
                this.showTokenList(tokens, selectedText, anchor, tokenOptions);
            },
        });
    }

    private textLookupResultCallbacks(): TextLookupResultCallbacks {
        return {
            isJpdbBackedCard: card => this.isJpdbBackedCard(card),
            parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
            showCard: (card, cardSentence, anchor, cardOptions) => {
                void this.showCard(card, cardSentence, anchor, cardOptions);
            },
            showLocalOrFallbackLookupCard: (context, fallbackSentence, error) => this.showLocalOrFallbackLookupCard(context, fallbackSentence, error),
            showTokenList: (tokens, selectedText, anchor, tokenOptions) => {
                this.showTokenList(tokens, selectedText, anchor, tokenOptions);
            },
            textLookupParseOptions: () => this.textLookupParseOptions(),
        };
    }

    private async resolveLookupCard(card: JPDBCard): Promise<JPDBCard> {
        const contextual = card.source === 'jpdb' && Boolean(card.sourceCardKey);
        if (card.source !== 'fallback' && !contextual) return card;
        const publicCard = card.source === 'fallback'
            ? await this.lookupFallbackApiCard(card)
            : await this.publicLookupCard(card.spelling, true, contextual ? card.reading : '');
        if (!publicCard) return card;
        this.parser.cacheCards?.([publicCard]);
        return publicCard;
    }

    private async resolveLookupCardForInitialRender(card: JPDBCard): Promise<JPDBCard> {
        if (card.source !== 'fallback' && !(card.source === 'jpdb' && card.sourceCardKey)) return card;

        const resolved = this.resolveLookupCard(card);
        void resolved.catch(() => undefined);
        return Promise.race([
            resolved,
            wait(FALLBACK_LOOKUP_INITIAL_WAIT_MS).then(() => card),
        ]);
    }

    private async publicLookupCard(
        term: string,
        exact = false,
        readingOrOptions: string | { allowCandidateLookup?: boolean } = '',
        maybeOptions: { allowCandidateLookup?: boolean } = {},
    ): Promise<JPDBCard | undefined> {
        const request = publicLookupCardRequest(readingOrOptions, maybeOptions);
        if (!canSearchPublicLookupCard(this.settings, request.options)) return undefined;
        const cards = await this.jpdbVocabulary.search(term, publicLookupSearchLimit(request.reading)).catch(error => {
            log.warn('Public JPDB lookup failed', { term }, error);
            return [];
        });
        return publicLookupCardFromResults(cards, term, exact, request.reading);
    }

    private async publicLookupSpellingCard(term: string): Promise<JPDBCard | undefined> {
        if (!this.settings.jpdbDefinitionsEnabled && !this.settings.showPitchAccent) return undefined;
        const cards = await this.jpdbVocabulary.search(term, 1).catch(error => {
            log.warn('Public JPDB fallback search failed', { term }, error);
            return [];
        });
        return cards.find(card => card.spelling === term);
    }

    private async publicLookupFallbackCard(card: JPDBCard): Promise<JPDBCard | undefined> {
        for (const term of fallbackLookupTermsForCard(card)) {
            const publicCard = await this.publicLookupSpellingCard(term);
            if (publicCard) return publicCard;
        }
        return undefined;
    }

    private async lookupFallbackApiCard(card: JPDBCard): Promise<JPDBCard | undefined> {
        return this.isJitenApiActive()
            ? this.jitenLookupFallbackCard(card)
            : this.publicLookupFallbackCard(card);
    }

    private async jitenLookupFallbackCard(card: JPDBCard): Promise<JPDBCard | undefined> {
        for (const term of fallbackLookupTermsForCard(card)) {
            const parsed = await this.jiten.parse([term]).catch(error => {
                log.warn('Jiten fallback lookup failed', { term }, error);
                return [];
            });
            const candidate = parsed[0]?.find(token => jitenFallbackTokenMatches(term, token))?.card
                ?? parsed[0]?.find(token => token.card.source === 'jiten')?.card;
            if (candidate?.source === 'jiten') return candidate;
        }
        return undefined;
    }

    private async showLocalLookupCard(context: TextLookupDisplayContext, sentence: string): Promise<boolean> {
        const localEntries = await this.localLookupEntries(context.selected);
        if (!localEntries.length) return false;
        void this.showCard(this.parser.localCardFromEntry(localEntries[0]), sentence, context.anchor, textLookupCardOptions(context));
        return true;
    }

    private async showLocalOrFallbackLookupCard(context: TextLookupDisplayContext, sentence: string, error?: unknown): Promise<void> {
        if (await this.showLocalLookupCard(context, sentence)) return;
        if (error) this.toast(error instanceof Error ? error.message : uiText(this.settings.interfaceLanguage, 'jpdbLookupFailed'));
        void this.showCard(this.parser.fallbackCardFromText(context.selected), sentence, context.anchor, textLookupCardOptions(context));
    }

    private async localLookupEntries(selected: string): Promise<YomitanTermEntry[]> {
        return this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : [];
    }

    private handleDictionaryLookupLink(event: MouseEvent, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        const link = dictionaryLookupLink(event.target);
        if (!link) return false;
        const query = dictionaryLookupQuery(link);
        const nestedWord = dictionaryLookupNestedWord(event.target, link);
        if (this.handleNestedDictionaryLookupWord(event, nestedWord, query, trigger)) return true;
        if (!query) return false;
        return this.handleDictionaryReferenceLookup(event, link, query, anchor, trigger);
    }

    private handleNestedDictionaryLookupWord(
        event: MouseEvent,
        nestedWord: HTMLElement | null,
        query: string,
        trigger: 'modal' | 'hover',
    ): boolean {
        if (!nestedWord || !this.shouldLookupNestedDictionaryWord(nestedWord, query)) return false;
        event.preventDefault();
        event.stopPropagation();
        void this.showWord(nestedWord, {
            trigger: 'click',
            navigation: trigger === 'modal' ? 'push-current' : 'reset',
            userGesture: true,
        });
        return true;
    }

    private shouldLookupNestedDictionaryWord(nestedWord: HTMLElement, query: string): boolean {
        return !dictionaryLookupWordMatchesLink(nestedWord, query)
            && !isOcrLineFrameWord(nestedWord)
            && !isNativePageLookupBlocked(nestedWord);
    }

    private handleDictionaryReferenceLookup(
        event: MouseEvent,
        link: HTMLElement,
        query: string,
        anchor: HTMLElement | undefined,
        trigger: 'modal' | 'hover',
    ): boolean {
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
            const previousNavigationEntry = this.textLookupPreviousNavigationEntry(trigger, navigation);
            const jpdbCard = sourceDictionary === 'JPDB'
                ? await this.publicLookupCard(query, true, normalizedReading)
                : undefined;
            if (jpdbCard) {
                this.parser.cacheCards?.([jpdbCard]);
                await this.showCard(jpdbCard, query, anchor, { autoPlay: false, trigger, navigation, preservePosition, previousNavigationEntry });
                return;
            }
            const localEntries = await this.dictionaryReferenceLocalEntries(query, normalizedReading, sourceDictionary);
            const preferredEntry = localEntries.find(entry => entry.dictionary === sourceDictionary) ?? localEntries[0];
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
            log.warn('Dictionary reference failed', { query, reading, sourceDictionary }, error);
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
        return element && !this.isNativeTextLookupTarget(element, options) && !isNativePageLookupBlocked(element) ? element : null;
    }

    private usablePointerTextPosition(element: Element, x: number, y: number): NonNullable<ReturnType<typeof caretTextPositionFromPoint>> | null {
        const position = caretTextPositionFromPoint(x, y);
        return this.isUsablePointerTextPosition(element, position) ? position : null;
    }

    private lookupCandidateFromTextPosition(node: Text, characterOffset: number): PointerTextLookup | null {
        return pointerTextLookupFromTextNode(node, characterOffset);
    }

    private isUsablePointerTextPosition(element: Element, position: ReturnType<typeof caretTextPositionFromPoint>): position is NonNullable<ReturnType<typeof caretTextPositionFromPoint>> {
        return Boolean(position
            && position.node.parentElement
            && (element.contains(position.node) || position.node.parentElement.contains(element))
            && !position.node.parentElement.closest('.jpdb-reader-word'));
    }

    private isNativeTextLookupTarget(target: Element, options: PointerTextLookupOptions = {}): boolean {
        return (!options.allowPassiveInteractionText && isPassiveInteractionElement(target))
            || this.isReaderImmersionExampleSentenceText(target)
            || Boolean(target.closest('input,textarea,select,[contenteditable="true"],.jpdb-reader-word'));
    }

    private isReaderImmersionExampleSentenceText(target: Element): boolean {
        return Boolean(target.closest('[data-jpdb-reader-root] [data-immersion-kit] .jpdb-reader-example-sentence'));
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
        if (await this.showPublicJpdbPointerTextCandidate(candidate, sentence, trigger, options)) return;
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
            const [tokens] = await this.parseJapanese([candidate.text], this.pointerTextJpdbParseOptions());
            const token = pointerTokenAtOffset(tokens ?? [], candidate.offset);
            if (!token || this.shouldSkipPointerTextToken(candidate, token)) return false;
            if (!this.isParserBackedLookupCard(token.card)) return false;
            await this.showPointerTextCard(token.card, sentence, candidate, { start: token.start, end: token.end }, trigger, options);
            return true;
        } catch (error) {
            log.warn('Pointer parse failed', { offset: candidate.offset }, error);
            return false;
        }
    }

    private pointerTextJpdbParseOptions(): ReaderParserParseOptions {
        if (!hasJpdbApiCredential(this.settings)) return jpdbFirstParseOptions();
        return jpdbFirstParseOptions({
            requireJpdb: false,
            jpdbTimeoutMs: POINTER_TEXT_JPDB_TIMEOUT_MS,
            allowJpdbTimeoutFallback: true,
        });
    }

    private shouldSkipPointerTextToken(candidate: PointerTextLookup, token: JPDBToken): boolean {
        const tokenLength = token.end - token.start;
        const run = japaneseRunAt(candidate.text, candidate.offset);
        const surroundingLength = run ? run.end - run.start : candidate.end - candidate.start;
        if (surroundingLength <= tokenLength) return false;
        if (isLowValuePointerTextToken(token)) return true;
        if (!KANA_ONLY_LOOKUP_RUN_RE.test(token.card.spelling.trim())) return false;
        return !this.isCoveredParsedKanaPointerToken(candidate, token);
    }

    private isCoveredParsedKanaPointerToken(candidate: PointerTextLookup, token: JPDBToken): boolean {
        if (token.end - token.start <= 1) return false;
        const surface = normalizedLookupText(candidate.text.slice(token.start, token.end));
        if (!KANA_ONLY_LOOKUP_RUN_RE.test(surface)) return false;
        const spelling = normalizedLookupText(token.card.spelling);
        const reading = normalizedLookupText(token.card.reading);
        return surface === spelling || surface === reading;
    }

    private async showPublicJpdbPointerTextCandidate(
        candidate: PointerTextLookup,
        sentence: string,
        trigger: 'modal' | 'hover',
        options: PointerTextDisplayOptions,
    ): Promise<boolean> {
        const spans = jpdbPointerLookupCandidates(candidate.text, candidate.offset);
        if (!this.canUsePublicJpdbPointerLookup() || !this.canUsePublicJpdbPointerTextLookup(candidate, spans)) return false;
        for (const span of spans) {
            const card = await this.publicLookupCard(span.term, true, { allowCandidateLookup: true });
            if (!card) continue;
            this.parser.cacheCards?.([card]);
            await this.showPointerTextCard(card, sentence, candidate, span, trigger, options);
            return true;
        }
        return false;
    }

    private canUsePublicJpdbPointerLookup(): boolean {
        return !hasJpdbApiCredential(this.settings);
    }

    private canUsePublicJpdbPointerTextLookup(candidate: PointerTextLookup, spans: PointerTextSpanCandidate[]): boolean {
        return this.settings.jpdbDefinitionsEnabled
            || this.settings.showPitchAccent
            || this.hasKanaRunIdentityPublicLookupCandidate(candidate, spans);
    }

    private hasKanaRunIdentityPublicLookupCandidate(candidate: PointerTextLookup, spans: PointerTextSpanCandidate[]): boolean {
        if (spans.length <= 1) return false;
        const fallbackTerm = normalizedLookupText(fallbackLookupTermAtOffset(candidate.text, candidate.offset));
        const candidateLength = candidate.end - candidate.start;
        return spans.some(span => {
            const term = normalizedLookupText(span.term);
            if (term.length <= 1 || !KANA_ONLY_LOOKUP_RUN_RE.test(term)) return false;
            if (candidateLength > term.length) return true;
            return Boolean(fallbackTerm && fallbackTerm !== term && term.includes(fallbackTerm));
        });
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
        const fallbackTerm = this.pointerFallbackDisplayTerm(candidate, fallbackRange);
        if (!fallbackTerm
            || this.isWeakPointerFallbackTerm(candidate, fallbackTerm)
            || this.isOverbroadPointerFallback(candidate, fallbackRange)) return false;
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
        const activeMiddlePressLookup = this.pressLookup?.source === 'middle' && this.pressLookup.lastWord === word;
        return this.isRunnableScheduledHoverWord(word, hoverLookupKey)
            && (
                activeMiddlePressLookup
                || (this.isWordHoverActive(word) && this.settings.lookupOnHover)
            );
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
        if (isOverbroadLocalPointerRange(run, pointerRange)) {
            return await this.lookupContainingLocalEntryInRun(text, run, pointerRange, { preferShorter: true });
        }
        const exactSurface = text.slice(pointerRange.start, pointerRange.end);
        const exactEntry = await this.lookupSingleLocalSurface(exactSurface);
        if (exactEntry) return { entry: exactEntry, start: pointerRange.start, end: pointerRange.end };
        if (!canExpandLocalPointerRange(exactSurface)) return undefined;

        return await this.lookupContainingLocalEntryInRun(text, run, pointerRange);
    }

    private async lookupContainingLocalEntryInRun(
        text: string,
        run: NonNullable<ReturnType<typeof japaneseRunAt>>,
        pointerRange: { start: number; end: number },
        options: { preferShorter?: boolean } = {},
    ): Promise<LocalPointerTextEntryMatch | undefined> {
        const minStart = Math.max(run.start, run.offset - 8);
        const maxEnd = Math.min(run.end, Math.max(pointerRange.end, run.offset + 18));
        if (options.preferShorter) return await this.lookupContainingLocalEntryShortestFirst(text, run, minStart, maxEnd);
        for (let start = Math.min(pointerRange.start, run.offset); start >= minStart; start--) {
            const longestEnd = Math.min(maxEnd, start + 18);
            for (let end = longestEnd; end > run.offset; end--) {
                const surface = text.slice(start, end);
                const entry = await this.lookupSingleLocalSurface(surface);
                if (entry) return { entry, start, end };
            }
        }
        return undefined;
    }

    private async lookupContainingLocalEntryShortestFirst(
        text: string,
        run: NonNullable<ReturnType<typeof japaneseRunAt>>,
        minStart: number,
        maxEnd: number,
    ): Promise<LocalPointerTextEntryMatch | undefined> {
        const maxLength = Math.min(18, maxEnd - minStart);
        for (let length = 2; length <= maxLength; length++) {
            const firstStart = Math.max(minStart, run.offset - length + 1);
            const lastStart = Math.min(run.offset, maxEnd - length);
            for (let start = lastStart; start >= firstStart; start--) {
                const end = start + length;
                const surface = text.slice(start, end);
                const entry = await this.lookupSingleLocalSurface(surface);
                if (entry) return { entry, start, end };
            }
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

    private pointerFallbackDisplayTerm(candidate: PointerTextLookup, range: { start: number; end: number }): string {
        const surface = candidate.text.slice(range.start, range.end).replace(/\s+/g, ' ').trim().slice(0, 80);
        if (this.shouldPreferPointerFallbackSurface(candidate, range, surface)) return surface;
        return fallbackLookupTermAtOffset(candidate.text, candidate.offset);
    }

    private shouldPreferPointerFallbackSurface(candidate: PointerTextLookup, range: { start: number; end: number }, surface: string): boolean {
        return surface.length > 1
            && range.start === candidate.start
            && range.end === candidate.end
            && POINTER_TEXT_KANA_SURFACE_RE.test(surface);
    }

    private isOverbroadPointerFallback(candidate: PointerTextLookup, range: { start: number; end: number }): boolean {
        const fallbackLength = range.end - range.start;
        const candidateLength = candidate.end - candidate.start;
        return fallbackLength >= candidateLength
            && candidateLength > 6
            && fallbackLength > 4;
    }

    private isWeakPointerTextRange(candidate: PointerTextLookup, start: number, end: number): boolean {
        return end - start <= 1 && candidate.end - candidate.start > 1;
    }

    private async showWord(word: HTMLElement, options: RenderedWordLookupOptions = {}): Promise<void> {
        if (this.shouldIgnoreRenderedWordLookup(word, options)) return;
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        const stackOverSettings = options.stackOverSettings || Boolean(word.closest('.jpdb-reader-settings'));
        const card = this.cardForRenderedWord(word);
        if (!card) {
            await this.handleMissingRenderedWordCard(word, { ...options, stackOverSettings }, insideReaderPopup);
            return;
        }
        this.rememberRenderedWordMiningContext(word, card, insideReaderPopup);
        const context = this.renderedWordDisplayContext(word, options, insideReaderPopup);
        if (this.refreshActiveRenderedWordHover(word, context)) return;
        if (this.isStaleRenderedWordHover(word, context, options.hoverLookupGeneration)) return;
        if (await this.showAlternativeRenderedWordCandidate(word, card, context, options, stackOverSettings)) return;
        this.preloadHoverWordAudio(word);
        await this.showRenderedWordCard(card, context, options, stackOverSettings);
    }

    private async showAlternativeRenderedWordCandidate(
        word: HTMLElement,
        card: JPDBCard,
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
        stackOverSettings: boolean,
    ): Promise<boolean> {
        if (await this.showParsedRenderedWordCandidate(word, card, context, options, stackOverSettings)) return true;
        if (await this.showPublicJpdbRenderedWordCandidate(word, card, context, options, stackOverSettings)) return true;
        if (this.shouldSuppressRenderedKanaFragmentFallback(word, card, context)) return true;
        return this.showOcrKanjiRenderedWord(word, card, context);
    }

    private shouldIgnoreRenderedWordLookup(word: HTMLElement, options: RenderedWordLookupOptions): boolean {
        return options.trigger === 'click' && this.shouldIgnoreCurrentImmersionExampleTargetClick(word);
    }

    private refreshActiveRenderedWordHover(word: HTMLElement, context: RenderedWordDisplayContext): boolean {
        if (!context.hoverLookupKey || !this.isActiveHoverLookup(context.hoverLookupKey)) return false;
        this.refreshActiveHoverAnchor(word);
        return true;
    }

    private isStaleRenderedWordHover(word: HTMLElement, context: RenderedWordDisplayContext, hoverLookupGeneration?: number): boolean {
        return context.trigger === 'hover' && !this.isCurrentRenderedWordHover(word, context.hoverLookupKey ?? '', hoverLookupGeneration);
    }

    private async showOcrKanjiRenderedWord(word: HTMLElement, card: JPDBCard, context: RenderedWordDisplayContext): Promise<boolean> {
        const ocrKanji = singleKanjiOcrLookupCharacter(word);
        if (!ocrKanji || context.trigger !== 'modal') return false;
        await this.showKanjiCard(card, ocrKanji, ocrKanji, context.anchor, {
            navigation: context.navigation,
            preservePosition: context.insideReaderPopup,
        });
        return true;
    }

    private showRenderedWordCard(
        card: JPDBCard,
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
        stackOverSettings: boolean,
    ): Promise<void> {
        return this.showCard(card, context.sentence, context.anchor, {
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
        return card && renderedWordCacheMatches(word, card) ? card : undefined;
    }

    private async showPublicJpdbRenderedWordCandidate(
        word: HTMLElement,
        card: JPDBCard,
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
        stackOverSettings: boolean,
    ): Promise<boolean> {
        const lookup = publicJpdbRenderedWordLookup(word, card, context, this.canUsePublicJpdbPointerLookup());
        if (!lookup) return false;
        const resolved = await this.resolvePublicJpdbRenderedWordCandidate(lookup.terms);
        if (!resolved) return false;
        this.parser.cacheCards?.([resolved]);
        await this.showRenderedWordCard(resolved, { ...context, sentence: lookup.sentence }, options, stackOverSettings);
        return true;
    }

    private async showParsedRenderedWordCandidate(
        word: HTMLElement,
        card: JPDBCard,
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
        stackOverSettings: boolean,
    ): Promise<boolean> {
        if (!this.canUseParserBackedRenderedWordLookup()) return false;
        const lookup = renderedKanaFragmentExpansionLookup(word, card, context);
        if (!lookup) return false;
        try {
            const [tokens] = await this.parseJapanese([lookup.sentence], this.pointerTextJpdbParseOptions());
            const token = this.parsedRenderedWordCandidateToken(tokens ?? [], lookup, word);
            if (!token) return false;
            this.parser.cacheCards?.([token.card]);
            await this.showRenderedWordCard(token.card, { ...context, sentence: lookup.sentence }, options, stackOverSettings);
            return true;
        } catch (error) {
            log.warn('Rendered JPDB parse failed', { expression: card.spelling }, error);
            return false;
        }
    }

    private parsedRenderedWordCandidateToken(
        tokens: JPDBToken[],
        lookup: RenderedWordKanaFragmentExpansionLookup,
        word: HTMLElement,
    ): JPDBToken | undefined {
        const token = pointerTokenAtOffset(tokens, lookup.offset);
        const candidate = { text: lookup.sentence, offset: lookup.offset, start: 0, end: lookup.sentence.length, anchor: word };
        return this.canUseParsedRenderedWordToken(token, lookup, candidate) ? token : undefined;
    }

    private canUseParsedRenderedWordToken(
        token: JPDBToken | undefined,
        lookup: RenderedWordKanaFragmentExpansionLookup,
        candidate: PointerTextLookup,
    ): token is JPDBToken {
        if (!token) return false;
        if (token.end - token.start <= lookup.surfaceLength) return false;
        if (this.shouldSkipPointerTextToken(candidate, token)) return false;
        return this.isParserBackedLookupCard(token.card);
    }

    private canUseParserBackedRenderedWordLookup(): boolean {
        return Boolean(hasJpdbApiCredential(this.settings) || hasJitenApiCredential(this.settings));
    }

    private shouldSuppressRenderedKanaFragmentFallback(
        word: HTMLElement,
        card: JPDBCard,
        context: RenderedWordDisplayContext,
    ): boolean {
        const lookup = publicJpdbRenderedWordLookup(word, card, context, this.canUsePublicJpdbPointerLookup());
        if (!lookup?.terms.length) return false;
        const surface = renderedWordLookupText(word);
        const spelling = normalizedLookupText(card.spelling);
        const reading = normalizedLookupText(card.reading);
        const isRenderedKanaFragment = KANA_ONLY_LOOKUP_RUN_RE.test(surface)
            && surface.length < Math.max(spelling.length, reading.length, lookup.terms[0]?.length ?? 0);
        return isRenderedKanaFragment;
    }

    private async resolvePublicJpdbRenderedWordCandidate(terms: string[]): Promise<JPDBCard | undefined> {
        for (const term of terms) {
            const resolved = await this.publicLookupCard(term, true, { allowCandidateLookup: true });
            if (resolved) return resolved;
        }
        return undefined;
    }

    private async handleMissingRenderedWordCard(
        word: HTMLElement,
        options: RenderedWordLookupOptions,
        insideReaderPopup: boolean,
    ): Promise<void> {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        if (insideReaderPopup && await this.lookupUncachedPopupWord(word, options)) return;
        if (!insideReaderPopup && await this.lookupUncachedPageWord(word, options)) return;
        if (options.stackOverSettings) return;
        log.warn('Clicked word cache miss; reparsing', { vid, sid });
        this.scheduleVisiblePageReparse();
    }

    private async lookupUncachedPageWord(
        word: HTMLElement,
        options: RenderedWordLookupOptions,
    ): Promise<boolean> {
        const expression = renderedWordLookupText(word);
        if (!isLookupableJapaneseText(expression)) return false;
        const trigger = this.renderedWordTrigger(options.trigger, false);
        const navigation = options.navigation ?? renderedWordNavigationMode(false, trigger);
        const expansionLookup = renderedWordExpansionLookup(word, expression, this.renderedWordSentence(word));
        if (expansionLookup && await this.lookupUncachedPageWordViaParsedJpdb(word, expansionLookup, expression, options, trigger, navigation)) return true;
        if (expansionLookup && await this.lookupUncachedPageWordViaPublicJpdb(word, expansionLookup, options, trigger, navigation)) return true;
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

    private async lookupUncachedPageWordViaParsedJpdb(
        word: HTMLElement,
        lookup: RenderedWordExpansionLookup,
        expression: string,
        options: RenderedWordLookupOptions,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): Promise<boolean> {
        try {
            const [tokens] = await this.parseJapanese([lookup.sentence], this.pointerTextJpdbParseOptions());
            const token = pointerTokenAtOffset(tokens ?? [], lookup.offset);
            const candidate = { text: lookup.sentence, offset: lookup.offset, start: 0, end: lookup.sentence.length, anchor: word };
            if (!token
                || token.end - token.start <= lookup.surfaceLength
                || this.shouldSkipPointerTextToken(candidate, token)
                || !this.isParserBackedLookupCard(token.card)) return false;
            await this.showRenderedWordExpansionCard(token.card, lookup.sentence, word, options, trigger, navigation);
            return true;
        } catch (error) {
            log.warn('Uncached JPDB parse failed', { expression }, error);
            return false;
        }
    }

    private async lookupUncachedPageWordViaPublicJpdb(
        word: HTMLElement,
        lookup: RenderedWordExpansionLookup,
        options: RenderedWordLookupOptions,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): Promise<boolean> {
        const terms = jpdbPointerLookupCandidates(lookup.sentence, lookup.offset)
            .filter(span => span.end - span.start > lookup.surfaceLength)
            .map(span => span.term);
        if (!terms.length || !this.canUsePublicJpdbPointerLookup()) return false;
        const resolved = await this.resolvePublicJpdbRenderedWordCandidate(terms);
        if (!resolved) return false;
        await this.showRenderedWordExpansionCard(resolved, lookup.sentence, word, options, trigger, navigation);
        return true;
    }

    private async showRenderedWordExpansionCard(
        card: JPDBCard,
        sentence: string,
        word: HTMLElement,
        options: RenderedWordLookupOptions,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): Promise<void> {
        this.parser.cacheCards?.([card]);
        await this.showCard(card, sentence, word, {
            trigger,
            navigation,
            preservePosition: trigger === 'hover',
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, false, trigger, navigation),
            userGesture: options.userGesture,
            hoverLookupGeneration: options.hoverLookupGeneration,
            stackOverSettings: options.stackOverSettings,
        });
    }

    private async lookupUncachedPopupWord(
        word: HTMLElement,
        options: RenderedWordLookupOptions,
    ): Promise<boolean> {
        const expression = renderedWordLookupText(word);
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
        return cardMatchesRenderedLookupValue(this.lastCard, renderedWordLookupText(word));
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

    private showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options: TokenListOptions = {}): void {
        if (!tokens.length) return;
        const trigger = options.trigger === 'hover' ? 'hover' : 'modal';
        const navigation = options.navigation ?? 'reset';
        const source = options.source ?? 'lookup';
        const previousNavigationEntry = trigger === 'modal' ? options.previousNavigationEntry : undefined;
        this.prepareTokenListNavigation(trigger, navigation);
        const popover = this.createPopover();
        setInnerHtml(popover, this.renderTokenListHtml(tokens, selected, source, previousNavigationEntry));
        this.installTokenListHandlers(popover, tokens, anchor, { trigger, navigation, previousNavigationEntry, stackOverSettings: options.stackOverSettings });
        this.mountPopover(popover, anchor, { mode: trigger, preservePosition: options.preservePosition, stackOverSettings: options.stackOverSettings });
        void this.parsePopoverJapanese(popover);
    }

    private prepareTokenListNavigation(trigger: 'modal' | 'hover', navigation: CardNavigationMode): void {
        if (trigger === 'modal' && navigation === 'reset') this.navigation.clearWord();
    }

    private renderTokenListHtml(tokens: JPDBToken[], selected: string, source: TokenListSource, previousNavigationEntry?: PopupNavigationEntry): string {
        return renderTokenListMarkup(tokens, selected, source, previousNavigationEntry, this.settings.interfaceLanguage);
    }

    private installTokenListHandlers(
        popover: HTMLElement,
        tokens: JPDBToken[],
        anchor: HTMLElement | undefined,
        context: TokenListContext,
    ): void {
        installTokenListClickHandlers(popover, tokens, anchor, context, {
            showPrevious: (previousAnchor, previousContext) => void this.showTokenListPrevious(previousAnchor, previousContext),
            showCard: (button, nextTokens, cardAnchor, cardContext) => this.showTokenListCard(button, nextTokens, cardAnchor, cardContext),
        });
    }

    private async showTokenListPrevious(
        anchor: HTMLElement | undefined,
        context: Pick<TokenListContext, 'trigger' | 'previousNavigationEntry'>,
    ): Promise<void> {
        const previous = context.previousNavigationEntry;
        if (!previous) return;
        await this.showPreviousNavigationEntry(previous, anchor, context.trigger);
    }

    private showTokenListCard(
        button: HTMLButtonElement,
        tokens: JPDBToken[],
        anchor: HTMLElement | undefined,
        context: TokenListContext,
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
        if (this.isDestroyed || typeof document === 'undefined') return;
        sentence = this.preferredCardSentence(sentence, anchor);
        if (card !== requestedCard) this.prioritizeQueuedPitchEnrichment(card, { immediate: immediatePitch });
        this.lastCard = card;
        this.lastCardSentence = sentence;
        const popover = this.createPopover();
        const navigation = options.navigation ?? 'reset';
        const hoverLookup = this.cardHoverLookupContext(trigger, options);
        const isCurrentHoverCard = () => this.isCurrentCardHoverLookup(trigger, hoverLookup);
        this.navigation.updateWord(card, sentence, trigger, navigation, options.previousNavigationEntry);
        this.navigation.clearKanji();
        const done = log.time('showCard', { term: card.spelling, source: cardSourceLabel(card), trigger });
        this.rememberCardMiningContext(card, sentence, anchor, options);
        const fallbackAnkiLookup = this.fallbackCardAnkiLookup();
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
            hoverLookupGeneration: hoverLookup.generation,
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
            this.renderHydratedCardAnkiLookup(popover, card, sentence, trigger, fullData, renderData, mounted.requestId, isCurrentHoverCard);
        } finally {
            done();
        }
    }

    private cardHoverLookupContext(
        trigger: 'modal' | 'hover',
        options: CardDisplayOptions,
    ): { generation: number | undefined; key: string } {
        return trigger === 'hover'
            ? { generation: options.hoverLookupGeneration, key: options.hoverLookupKey ?? '' }
            : { generation: undefined, key: '' };
    }

    private isCurrentCardHoverLookup(
        trigger: 'modal' | 'hover',
        hoverLookup: { generation: number | undefined; key: string },
    ): boolean {
        return trigger !== 'hover' || this.isCurrentHoverGeneration(hoverLookup.generation, hoverLookup.key);
    }

    private fallbackCardAnkiLookup(): AnkiLookupResult {
        return { state: 'not-in-deck', notes: [], primary: null };
    }

    private async cardRenderDataOrFallback(
        card: JPDBCard,
        renderData: Promise<CardRenderData>,
        fallbackAnkiLookup: AnkiLookupResult,
    ): Promise<CardRenderData> {
        try {
            return await renderData;
        } catch (error) {
            log.warn('Popup details failed', { term: card.spelling }, error);
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
        let jitenVocabularyInfoValue: JitenVocabularyInfo | null = null;
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
                    jitenVocabularyInfoValue,
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
        if (renderData.jitenVocabularyInfo) {
            void renderData.jitenVocabularyInfo.then(jitenVocabularyInfo => {
                jitenVocabularyInfoValue = jitenVocabularyInfo;
                renderLoading();
            });
        }
        if (renderData.ankiLookup) {
            void renderData.ankiLookup.then(ankiLookup => {
                this.lastAnkiLookup = ankiLookup;
                this.applyAnkiLookupToRenderedWords(card, ankiLookup, { preserveExistingEmpty: trigger === 'hover' });
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
        updateHeadingWordPills(popover, {
            card,
            jpdbUrl: jpdbVocabularyUrl(card),
            settings: this.settings,
            metaEntries,
            isJpdbBackedCard: value => this.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        });
    }

    private updatePopoverPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        updateRenderedPitch(popover, card, metaEntries, this.settings.showPitchAccent);
    }

    private renderCompletedCardPopover(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
    ): void {
        this.lastAnkiLookup = data.ankiLookup;
        this.applyAnkiLookupToRenderedWords(card, data.ankiLookup, { preserveExistingEmpty: trigger === 'hover' });
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

    private renderHydratedCardAnkiLookup(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
        renderData: CardRenderDataLoad,
        requestId: number,
        isCurrentHoverCard: () => boolean,
    ): void {
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const hydrateAnkiLookup = renderData.hydrateAnkiLookup;
        if (!hydrateAnkiLookup) return;
        const hydrate = () => {
            if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
            void hydrateAnkiLookup()
                .then(ankiLookup => {
                    const resolvesPendingMiss = data.ankiLookup.trusted === false && ankiLookup.trusted !== false;
                    if (!ankiLookupHasDisplayableNotes(ankiLookup) && !ankiLookupHasDisplayableNotes(data.ankiLookup) && !resolvesPendingMiss) return;
                    if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                    this.renderCompletedCardPopover(popover, card, sentence, trigger, { ...data, ankiLookup });
                })
                .catch(error => {
                    log.warn('Popup Anki detail failed', { term: card.spelling }, error);
                    if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                    const ankiLookup = ankiLookupWithUnavailableDetails(data.ankiLookup);
                    if (!ankiLookup.primary) return;
                    this.renderCompletedCardPopover(popover, card, sentence, trigger, { ...data, ankiLookup });
                });
        };
        if (trigger === 'hover') {
            window.setTimeout(hydrate, HOVER_ANKI_HYDRATION_DELAY_MS);
            return;
        }
        hydrate();
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
        popover.addEventListener('click', event => this.handleCardPopoverClick(event, card, sentence, anchor, trigger));
        popover.addEventListener('change', event => this.handlePopoverReviewTargetChange(event, popover));
    }

    private handlePopoverReviewTargetChange(event: Event, popover: HTMLElement): void {
        const select = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>('[data-review-target-select]');
        if (select && popover.contains(select)) updatePopoverReviewTargetSelection(select);
    }

    private handleCardPopoverClick(event: MouseEvent, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
        if (this.handleDictionaryLookupLink(event, anchor, trigger)) return;
        const target = event.target as HTMLElement;
        const kanjiButton = target.closest<HTMLButtonElement>('[data-action="kanji"]');
        if (kanjiButton) {
            this.handleCardPopoverKanjiAction(event, kanjiButton, card, sentence, anchor);
            return;
        }
        const button = target.closest<HTMLButtonElement>('[data-action]');
        if (!button) return;
        event.preventDefault();
        event.stopPropagation();
        this.dispatchCardPopoverAction(button, card, sentence, anchor, trigger);
    }

    private handleCardPopoverKanjiAction(event: MouseEvent, button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined): void {
        event.preventDefault();
        event.stopPropagation();
        void this.showKanjiCard(card, button.dataset.kanji ?? '', sentence, anchor, { preservePosition: true });
    }

    private dispatchCardPopoverAction(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
        if (this.handleCardPopoverNavigationAction(button, anchor, trigger)) return;
        if (this.handleCardPopoverMiningAction(button)) return;
        if (this.handleCardPopoverDeckPickerAction(button, card, sentence)) return;
        void this.handleCardAction(button, card, sentence);
    }

    private handleCardPopoverNavigationAction(button: HTMLButtonElement, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        if (button.dataset.action !== 'word-history-back') return false;
        void this.showPreviousWord(anchor, trigger);
        return true;
    }

    private handleCardPopoverMiningAction(button: HTMLButtonElement): boolean {
        if (button.dataset.action !== 'mining-collapse') return false;
        this.toggleMiningControls(button);
        return true;
    }

    private handleCardPopoverDeckPickerAction(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        if (button.dataset.action === 'deck-picker') return this.openDeckPickerForAdd(button, card, sentence);
        return button.dataset.action === 'add' && this.openDeckPickerForAdd(button, card, sentence);
    }

    private toggleMiningControls(button: HTMLButtonElement): void {
        toggleMiningControlsState(button, expanded => this.miningControlsToggleLabel(expanded));
    }

    private setMiningControlsExpanded(button: HTMLButtonElement, expanded: boolean): void {
        setMiningControlsExpandedState(button, expanded, value => this.miningControlsToggleLabel(value));
    }

    private miningControlsToggleLabel(expanded: boolean): string {
        return uiText(this.settings.interfaceLanguage, expanded ? 'hideMiningActions' : 'showMiningActions');
    }

    private openDeckPickerForAdd(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        return openDeckPickerForCardAdd(button, card, sentence, (actionButton, actionCard, actionSentence) => (
            this.handleCardAction(actionButton, actionCard, actionSentence)
        ));
    }

    private async showPreviousWord(anchor?: HTMLElement, trigger: 'modal' | 'hover' = 'modal'): Promise<void> {
        const previous = this.navigation.popPreviousWord();
        if (!previous) return;
        await this.showPreviousNavigationEntry(previous, anchor, trigger);
    }

    private async showPreviousNavigationEntry(
        previous: PopupNavigationEntry,
        anchor: HTMLElement | undefined,
        trigger: 'modal' | 'hover',
    ): Promise<void> {
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
        if (!canAttemptReaderAutoAudio({
            anchor,
            settings: this.settings,
            subtitleSurfaceSelector: SUBTITLE_SURFACE_SELECTOR,
            trigger,
            userGesture,
        })) return false;
        const key = `${card.vid}:${card.sid}`;
        const now = Date.now();
        if (!userGesture) {
            if (key === this.lastAutoAudioKey && now - this.lastAutoAudioAt < 2500) return false;
            this.lastAutoAudioKey = key;
            this.lastAutoAudioAt = now;
        }
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
            jitenInfo: this.jitenKanjiDetailPromise(kanji),
            kanjiEntries: this.localKanjiEntriesPromise(kanji),
            rtkInfo: this.rtkDetailPromise(kanji),
            kanjiVGInfo: needsKanjiVG ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
    }

    private jpdbKanjiDetailPromise(kanji: string): Promise<JpdbKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private jitenKanjiDetailPromise(kanji: string): Promise<JitenKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled && this.isJitenApiActive()
            ? this.jiten.lookupKanji(kanji).catch(() => null)
            : Promise.resolve(null);
    }

    private isJitenApiActive(): boolean {
        return Boolean(hasJitenApiCredential(this.settings) && !hasJpdbApiCredential(this.settings));
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
        popover.addEventListener('click', event => this.handleKanjiCardActionClick(event, card, kanji, sentence, anchor));
        popover.addEventListener('change', event => this.handlePopoverReviewTargetChange(event, popover));
    }

    private handleKanjiCardActionClick(event: MouseEvent, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        if (this.handleDictionaryLookupLink(event, anchor, 'modal')) return;
        const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
        if (!actionButton?.dataset.action) return;
        event.preventDefault();
        event.stopPropagation();
        this.dispatchKanjiCardAction(actionButton, card, kanji, sentence, anchor);
    }

    private dispatchKanjiCardAction(actionButton: HTMLButtonElement, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        const handlers: Record<string, () => void> = {
            'copy-word': () => copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord'))),
            'jpdb-kanji-action': () => this.performJpdbKanjiAction(actionButton.dataset.kanjiActionId ?? '', card, kanji, sentence, anchor),
            'mining-collapse': () => this.toggleMiningControls(actionButton),
            grade: () => this.handleCardAction(actionButton, card, sentence),
            'word-back': () => this.showCard(card, sentence, anchor, { autoPlay: false, navigation: 'preserve', preservePosition: true }),
            'kanji-history-back': () => this.showPreviousKanji(anchor),
            'kanji-prev': () => this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true }),
            'kanji-next': () => this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true }),
            kanji: () => this.showKanjiCard(card, actionButton.dataset.kanji ?? kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true }),
            'similar-word': () => {
                const expression = actionButton.dataset.expression ?? '';
                this.lookupText(expression, actionButton.dataset.reading ?? expression, { navigation: 'push-current', preservePosition: true });
            },
            'jiten-kanji-more': () => {
                void this.loadMoreJitenKanjiWords(actionButton);
            },
            'jiten-kanji-reading': () => {
                void this.filterJitenKanjiWords(actionButton);
            },
        };
        void handlers[actionButton.dataset.action ?? '']?.();
    }

    private async loadMoreJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        if (button.disabled || !this.isJitenApiActive()) return;
        const character = button.dataset.jitenKanjiCharacter?.trim() ?? '';
        if (!character) return;
        const page = Math.max(2, Number(button.dataset.jitenKanjiPage) || 2);
        const pageSize = Math.max(1, Number(button.dataset.jitenKanjiPageSize) || jitenKanjiWordsPageSize());
        button.disabled = true;
        try {
            const wordsPage = await this.jiten.lookupKanjiWords(character, {
                reading: button.dataset.jitenKanjiReading || undefined,
                page,
                pageSize,
            });
            if (!button.isConnected) return;
            this.appendJitenKanjiWords(button, wordsPage, page);
        } catch (error) {
            log.warn('Jiten kanji words page lookup failed', { character, page }, error);
            if (button.isConnected) button.disabled = false;
        }
    }

    private appendJitenKanjiWords(button: HTMLButtonElement, page: Awaited<ReturnType<JitenApiClient['lookupKanjiWords']>>, requestedPage: number): void {
        const html = renderJitenKanjiWordsPage(page, button.dataset.jitenKanjiReading || '');
        const grid = button.closest<HTMLElement>('.jpdb-reader-jiten-kanji-vocabulary');
        if (!html || !grid) {
            button.remove();
            return;
        }
        button.insertAdjacentHTML('beforebegin', html);
        this.removeDuplicateJitenKanjiWords(grid);
        const total = page?.total || Number(button.dataset.jitenKanjiTotal) || 0;
        const rendered = grid.querySelectorAll('[data-jiten-kanji-word-key]').length;
        if (!page?.items.length || (total > 0 && rendered >= total)) {
            button.remove();
        } else {
            button.dataset.jitenKanjiPage = String(requestedPage + 1);
            button.dataset.jitenKanjiTotal = String(total);
            const status = button.querySelector<HTMLElement>('.jpdb-reader-source-status');
            if (status) status.textContent = String(Math.max(0, total - rendered));
            button.disabled = false;
        }
        this.repositionActivePopover();
    }

    private async filterJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        if (button.disabled || !this.isJitenApiActive()) return;
        const character = button.dataset.jitenKanjiCharacter?.trim() ?? '';
        const reading = button.dataset.jitenKanjiReading?.trim() ?? '';
        const source = button.closest<HTMLElement>('.jpdb-reader-jiten-kanji');
        const grid = source?.querySelector<HTMLElement>('.jpdb-reader-jiten-kanji-vocabulary');
        if (!character || !reading || !source || !grid) return;
        source.querySelectorAll<HTMLButtonElement>('[data-action="jiten-kanji-reading"]').forEach(candidate => {
            candidate.setAttribute('aria-pressed', candidate === button ? 'true' : 'false');
        });
        button.disabled = true;
        try {
            const pageSize = jitenKanjiWordsPageSize();
            const wordsPage = await this.jiten.lookupKanjiWords(character, { reading, page: 1, pageSize });
            if (!source.isConnected || !grid.isConnected) return;
            const wordsHtml = renderJitenKanjiWordsPage(wordsPage, reading);
            const rendered = wordsPage?.items.length ?? 0;
            const total = wordsPage?.total ?? rendered;
            const moreHtml = renderJitenKanjiWordsMoreButton(character, reading, rendered, total, 2, this.settings.interfaceLanguage);
            setInnerHtml(grid, wordsHtml || moreHtml ? `${wordsHtml}${moreHtml}` : `<div class="jpdb-reader-help">${escapeHtml(uiText(this.settings.interfaceLanguage, 'noSimilarWords'))}</div>`);
            this.repositionActivePopover();
        } catch (error) {
            log.warn('Jiten kanji reading filter failed', { character, reading }, error);
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    }

    private removeDuplicateJitenKanjiWords(grid: HTMLElement): void {
        const seen = new Set<string>();
        grid.querySelectorAll<HTMLElement>('[data-jiten-kanji-word-key]').forEach(word => {
            const key = word.dataset.jitenKanjiWordKey ?? '';
            if (!key || !seen.has(key)) {
                if (key) seen.add(key);
                return;
            }
            word.remove();
        });
    }

    private startKanjiProgressiveRender(popover: HTMLElement, detailsPromises: KanjiDetailPromises, card: JPDBCard, kanji: string, language: InterfaceLanguage, pageTarget?: JpdbTermTarget): void {
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
        return renderRuntimeKanjiSourceMounts({
            settings: this.settings,
            kanji,
            language,
            isSourceOpen: key => this.dictionarySourceState.isOpen(key),
            sourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            sourceTitle: sourceId => this.kanjiSourceTitle(sourceId),
            renderImmersionMount: () => this.renderKanjiImmersionKitMount(),
        });
    }

    private renderKanjiImmersionKitMount(): string {
        return renderKanjiImmersionKitMount(this.settings, (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded));
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
        const ankiNote = this.currentKanjiAnkiReviewNote(card);
        const canReviewWithAnki = Boolean(ankiNote?.primaryCardId);
        const canReviewWithJpdb = this.canReviewKanjiWithJpdb(card, states);
        if (!canReviewWithAnki && !canReviewWithJpdb) return '';
        return renderReviewButtons(this.settings, ankiNote);
    }

    private currentKanjiAnkiReviewNote(card: JPDBCard): AnkiLookupResult['primary'] | null {
        if (!this.shouldRunAnkiBackgroundWork()) return null;
        if (!this.lastCard || cardKey(this.lastCard) !== cardKey(card)) return null;
        return this.lastAnkiLookup?.primary ?? null;
    }

    private canReviewKanjiWithJpdb(card: JPDBCard, states: ReturnType<typeof normalizeCardStates>): boolean {
        return !hasBlockedJpdbReviewState(states)
            && this.isJpdbBackedCard(card)
            && Boolean(hasJpdbApiCredential(this.settings))
            && isApiMiningEnabled(this.settings);
    }

    private updateKanjiMiningControls(popover: HTMLElement, controls: string): void {
        updateKanjiMiningControlsMount(popover, controls, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
    }

    private async renderKanjiDetailsInto(
        popover: HTMLElement,
        detailsPromises: KanjiDetailPromises,
        kanji: string,
        language: InterfaceLanguage,
    ): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let jitenInfo: JitenKanjiInfo | null = null;
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
            setInnerHtml(keywordMount, jitenInfo
                ? renderJitenKanjiKeywordLine(jitenInfo, rtkInfo, kanjiEntries, language)
                : renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries, language));
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
                setInnerHtml(jpdbMount, jitenInfo
                    ? renderJitenKanjiInfo(jitenInfo, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(KANJI_JPDB_SOURCE_ID))
                    : renderJpdbKanjiInfo(jpdbInfo, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(KANJI_JPDB_SOURCE_ID)));
            }
            renderRtk();
        });
        const jitenInfoPromise = detailsPromises.jitenInfo.then(info => {
            jitenInfo = info;
            if (!popover.isConnected) return;
            renderKeyword();
            if (jpdbMount?.isConnected) {
                const sourceStateKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
                setInnerHtml(jpdbMount, jitenInfo
                    ? renderJitenKanjiInfo(jitenInfo, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(KANJI_JPDB_SOURCE_ID))
                    : renderJpdbKanjiInfo(jpdbInfo, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey, this.kanjiSourceTitle(KANJI_JPDB_SOURCE_ID)));
            }
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

        await Promise.all([jpdbInfoPromise, jitenInfoPromise, kanjiEntriesPromise, rtkInfoPromise, kanjiVGInfoPromise]);
        if (!popover.isConnected) return;
        const resolvedJpdbInfo = jpdbInfo as JpdbKanjiInfo | null;
        const resolvedJitenInfo = jitenInfo as JitenKanjiInfo | null;
        const resolvedRtkInfo = rtkInfo as RtkInfo | null;
        const resolvedKanjiVGInfo = kanjiVGInfo as KanjiVGInfo | null;

        if (this.settings.kanjiOriginsEnabled) {
            void this.renderKanjiOriginsInto(popover, kanji, resolvedJpdbInfo, resolvedJitenInfo, resolvedRtkInfo, resolvedKanjiVGInfo, kanjiEntries);
        }
        void (this.isJpdbPageAddonRoot(popover) ? this.parseJpdbPageAddonJapanese(popover) : this.parsePopoverJapanese(popover));
        this.repositionActivePopover();
    }

    private waitForIdle(timeoutMs = 75): Promise<void> {
        return waitForBrowserIdle(timeoutMs);
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

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.lookupKanjiOriginSourceInfo(kanji);
        if (!this.canRenderKanjiOriginMount(popover, mount)) return;
        this.renderKanjiOriginMount(mount, kanji, jpdbInfo, jitenInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
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
        jitenInfo: JitenKanjiInfo | null,
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
            this.hiddenKanjiOriginFactLabels(jpdbInfo, jitenInfo),
            this.kanjiSourceTitle(KANJI_ORIGINS_SOURCE_ID),
        ));
        installOriginGraphInteractions(mount);
    }

    private hiddenKanjiOriginFactLabels(jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null): Set<string> | undefined {
        const labels = new Set(jitenKanjiOriginFactLabels(jitenInfo, this.settings.interfaceLanguage));
        if (!jitenInfo) {
            if (jpdbInfo?.type) labels.add('Type');
            if (jpdbInfo?.frequency) labels.add('Frequency');
        }
        return labels.size ? labels : undefined;
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
            const url = image.dataset.radicalFrameUrl;
            if (!url) return;
            // Load cross-origin radical frames through the userscript bridge so a
            // strict page CSP (jpdb.io img-src) can't block them.
            void this.immersionKit.fetchBlobUrl(url, 9000, this.settings.corsProxyUrl, this.settings.interfaceLanguage)
                .then(blobUrl => { image.src = blobUrl; })
                .catch(() => image.remove());
        });
    }

    private renderDefinitionSources(
        card: JPDBCard,
        entries: YomitanTermEntry[],
        sentence?: string,
        jpdbVocabularyInfo: JpdbVocabularyInfo | null = null,
        jitenVocabularyInfo: JitenVocabularyInfo | null = null,
        extraSectionsOrOptions: Record<string, string> | DefinitionSourceStackOptions = {},
    ): string {
        return renderDefinitionSourcesStack({
            card,
            entries,
            settings: this.settings,
            sourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            dictionaryLabel: name => this.dictionaryLabel(name),
            noDefinitionsHtml: () => `<div class="jpdb-reader-help jpdb-reader-no-definitions">${uiText(this.settings.interfaceLanguage, 'noDefinitions')}</div>`,
            sentence,
            jpdbVocabularyInfo,
            jitenVocabularyInfo,
            extraSectionsOrOptions,
            jpdbLanguage: this.settings.interfaceLanguage,
            renderTranslationSource: renderSentence => this.studySources.renderTranslationSource(renderSentence),
            renderGrammarSource: renderSentence => this.studySources.renderGrammarSource(renderSentence),
            renderImmersionSource: () => renderDefinitionSourceImmersionMount(
                this.settings,
                (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
            ),
        });
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
        const plan = this.settingsJapaneseParsePlan(form);
        if (!plan) return;
        const parseLoadingId = `${Date.now()}:${Math.random()}`;
        form.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        form.dataset.jpdbReaderParseLoadingId = parseLoadingId;
        try {
            const parsed = await this.loadSettingsParsedJapaneseContent(plan);
            if (!this.isCurrentSettingsJapaneseParse(form, plan.parseKey, parseLoadingId)) return;
            this.applySettingsJapaneseParse(form, plan, parsed);
        } catch {
        } finally {
            clearNestedParseLoadingKey(form, plan.parseKey, parseLoadingId);
        }
    }

    private settingsJapaneseParsePlan(form: HTMLFormElement): NestedParsePlan | null {
        if (!this.isCurrentSettingsRoot(form)) return null;
        unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup]' });
        clearNestedParseState(form);
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.canParseJapanese()) return null;
        const plan = nestedSettingsTextParsePlan(form, 640);
        return plan && !nestedParseAlreadyScheduled(form, plan.parseKey) ? plan : null;
    }

    private loadSettingsParsedJapaneseContent(plan: NestedParsePlan): Promise<JPDBToken[][]> {
        return this.loadParsedNestedJapaneseContent(plan.targets.map(target => target.text), {
            allowJpdbTimeoutFallback: true,
            allowSegmentedFallback: true,
            includeLocalPitch: false,
            jpdbTimeoutMs: 1_200,
            requireJpdb: false,
            skipJpdb: true,
        });
    }

    private isCurrentSettingsJapaneseParse(form: HTMLFormElement, parseKey: string, parseLoadingId: string): boolean {
        return this.isCurrentSettingsRoot(form)
            && form.dataset.jpdbReaderParseLoadingKey === parseKey
            && form.dataset.jpdbReaderParseLoadingId === parseLoadingId;
    }

    private applySettingsJapaneseParse(form: HTMLFormElement, plan: NestedParsePlan, parsed: JPDBToken[][]): void {
        applyNestedParsePlan(plan, parsed, this.settings);
        highlightCardTargetScopes(form);
        refreshReaderWordContrast(form);
        form.dataset.jpdbReaderParseKey = plan.parseKey;
        const tokens = parsed.flat();
        void this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT });
        this.queueAnkiWordEnrichment(tokens, [form]);
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
            this.scheduleCachedPublicVocabularyHydration(root);
            highlightCardTargetScopes(root);
            refreshReaderWordContrast(root);
            root.dataset.jpdbReaderParseKey = plan.parseKey;
            this.afterNestedJapaneseParsed(parsed, root, options.skipJpdb ? { publicLookup: false } : undefined);
        } catch {
        } finally {
            clearNestedParseLoadingKey(root, plan.parseKey, parseLoadingId);
        }
    }

    private loadParsedNestedJapaneseContent(texts: string[], options: ReaderParserParseOptions = {}): Promise<JPDBToken[][]> {
        const parseOptions = normalizedNestedParseOptions(options, this.settings);
        const key = parseContentCacheKey(texts, parseOptions, this.settings);
        const now = Date.now();
        const cached = this.cachedNestedParseContent(key, now);
        if (cached) return cached;
        return this.loadAndCacheNestedParseContent(key, texts, parseOptions, now);
    }

    private cachedNestedParseContent(key: string, now: number): Promise<JPDBToken[][]> | null {
        const cached = this.nestedParseContentCache.get(key);
        if (!cached) return null;
        this.nestedParseContentCache.delete(key);
        if (cached.expiresAt <= now) return null;
        this.nestedParseContentCache.set(key, cached);
        return cached.promise;
    }

    private loadAndCacheNestedParseContent(
        key: string,
        texts: string[],
        parseOptions: Required<ReaderParserParseOptions>,
        now: number,
    ): Promise<JPDBToken[][]> {
        const promise = this.parseJapanese(texts, parseOptions).catch(error => {
            if (this.nestedParseContentCache.get(key)?.promise === promise) this.nestedParseContentCache.delete(key);
            throw error;
        });
        this.nestedParseContentCache.set(key, { expiresAt: now + NESTED_PARSE_CONTENT_CACHE_TTL_MS, promise });
        this.pruneNestedParseContentCache(now);
        return promise;
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

    private afterNestedJapaneseParsed(parsed: JPDBToken[][], root: ParentNode = document, pitchOptions?: PitchEnrichmentOptions): void {
        const tokens = parsed.flat();
        this.preloadTermAudioForTokens(tokens);
        void this.enrichPitchWords(tokens, pitchOptions ?? { publicLookupLimit: NESTED_PUBLIC_PITCH_ENRICHMENT_LIMIT });
        this.queueAnkiWordEnrichment(tokens, [root]);
    }

    private afterSubtitleJapaneseParsed(tokens: JPDBToken[], roots: ParentNode[] = []): void {
        this.preloadTermAudioForTokens(tokens);
        void this.enrichPitchWords(tokens, { publicLookupLimit: BACKGROUND_PUBLIC_PITCH_ENRICHMENT_LIMIT });
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const targetRoots = roots.length ? roots : this.subtitleAnkiEnrichmentRoots();
        void this.enrichAnkiWords(tokens, targetRoots.length ? targetRoots : [document]);
    }

    private async enrichOcrTokensBeforeRender(tokens: JPDBToken[]): Promise<void> {
        if (!tokens.length) return;
        this.preloadTermAudioForTokens(tokens);
        await this.resolveOcrFallbackTokens(tokens);
        await this.enrichPitchWords(tokens, { urgent: true });
    }

    private async enrichSubtitleTokensBeforeRender(tokens: JPDBToken[]): Promise<void> {
        if (!tokens.length) return;
        await this.resolveOcrFallbackTokens(tokens);
        await this.enrichPitchWords(tokens, { urgent: true });
    }

    private async resolveOcrFallbackTokens(tokens: JPDBToken[]): Promise<void> {
        const fallbackTokens = tokens.filter(token => token.card.source === 'fallback');
        if (!fallbackTokens.length) return;
        await runLimited(fallbackTokens, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, async token => {
            const resolved = await this.resolveLookupCardForInitialRender(token.card).catch(() => token.card);
            if (resolved === token.card || resolved.source === 'fallback') return;
            token.card = resolved;
            token.pitchClass = getPitchClass(resolved.pitchAccent, resolved.reading || resolved.spelling) || token.pitchClass;
        });
    }

    private async enrichOcrRenderedTokens(tokens: JPDBToken[], root: ParentNode): Promise<void> {
        if (!tokens.length) return;
        if (!this.shouldRunAnkiBackgroundWork()) return;
        await this.enrichAnkiWords(tokens, [root]);
    }

    private subtitleAnkiEnrichmentRoots(): ParentNode[] {
        return Array.from(document.querySelectorAll<HTMLElement>(
            '.jpdb-subtitle-primary, .jpdb-subtitle-row-text, .asbplayer-subtitles-container-bottom',
        ));
    }

    private isCurrentPopoverRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activePopover && (root === this.activePopover || this.activePopover.contains(root)));
    }

    private isCurrentSettingsRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && this.activePopover === root && root.classList.contains('jpdb-reader-settings'));
    }

    private queueAnkiWordEnrichment(tokens: JPDBToken[], roots: ParentNode[] = [document]): void {
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return;
        void this.enrichAnkiWords(tokens, roots);
    }

    private async enrichAnkiWords(tokens: JPDBToken[], roots: ParentNode[] = [document]): Promise<void> {
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return;
        const seen = new Set<string>();
        const uniqueTokens = tokens.filter(token => {
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const lookups = await this.anki.findCachedStatusBatch(uniqueTokens.map(token => token.card))
            .catch(error => {
                log.warnOnce('background-anki-coloring-failed', 'Anki background coloring failed', error);
                return uniqueTokens.map(() => untrustedAnkiLookupResult());
            });
        if (!this.shouldRunAnkiBackgroundWork()) return;
        this.applyAnkiLookupsToRenderedWords(uniqueTokens, lookups, roots);
    }

    private async recolorRenderedAnkiWordsFromCache(root: ParentNode = document): Promise<void> {
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const indexedTokens = this.renderedWordIndex.size
            ? this.renderedWordTokensForRecolorFromIndex(root)
            : [];
        if (indexedTokens.length || (root === document && this.renderedWordIndex.size)) {
            if (indexedTokens.length) await this.enrichAnkiWords(indexedTokens, [root]);
            return;
        }
        const tokens = await this.scanRenderedWordTokensForRecolor(root);
        if (tokens.length) await this.enrichAnkiWords(tokens, [root]);
    }

    private async scanRenderedWordTokensForRecolor(root: ParentNode): Promise<JPDBToken[]> {
        const seen = new Set<string>();
        const tokens: JPDBToken[] = [];
        for await (const word of renderedWordsInRootChunked(root, ANKI_RECOLOR_SCAN_CHUNK_SIZE)) {
            if (!this.shouldRunAnkiBackgroundWork()) return [];
            this.registerRenderedWord(word);
            const token = this.renderedWordTokenForRecolor(word);
            if (!token) continue;
            const key = cardKey(token.card);
            if (seen.has(key)) continue;
            seen.add(key);
            tokens.push(token);
        }
        if (root === document) this.renderedWordIndexFullyScanned = true;
        return tokens;
    }

    private renderedWordTokensForRecolorFromIndex(root: ParentNode): JPDBToken[] {
        const seen = new Set<string>();
        const tokens: JPDBToken[] = [];
        for (const [wordKey, words] of this.renderedWordIndex) {
            this.collectRenderedWordTokensForRecolor(words, wordKey, root, seen, tokens);
            if (!words.size) this.renderedWordIndex.delete(wordKey);
        }
        return tokens;
    }

    private collectRenderedWordTokensForRecolor(
        words: Set<HTMLElement>,
        wordKey: string,
        root: ParentNode,
        seen: Set<string>,
        tokens: JPDBToken[],
    ): void {
        for (const word of words) {
            const token = this.renderedWordTokenForRecolorFromIndexEntry(word, words, wordKey, root);
            if (!token) continue;
            this.appendUniqueRenderedWordToken(token, seen, tokens);
        }
    }

    private renderedWordTokenForRecolorFromIndexEntry(
        word: HTMLElement,
        words: Set<HTMLElement>,
        wordKey: string,
        root: ParentNode,
    ): JPDBToken | null {
        if (!word.isConnected || renderedWordElementKey(word) !== wordKey) {
            words.delete(word);
            return null;
        }
        return rootContainsRenderedWord(root, word) ? this.renderedWordTokenForRecolor(word) : null;
    }

    private appendUniqueRenderedWordToken(token: JPDBToken, seen: Set<string>, tokens: JPDBToken[]): void {
        const key = cardKey(token.card);
        if (seen.has(key)) return;
        seen.add(key);
        tokens.push(token);
    }

    private renderedWordTokenForRecolor(word: HTMLElement): JPDBToken | null {
        const card = this.getCachedCard(Number(word.dataset.vid), Number(word.dataset.sid));
        if (!card) return null;
        const surface = readerWordSurfaceText(word);
        return {
            card,
            start: 0,
            end: surface.length,
            length: surface.length,
            rubies: [],
            pitchClass: word.dataset.pitchClass ?? '',
            sentence: word.dataset.sentence,
        };
    }

    private async enrichPitchWords(tokens: JPDBToken[], options: PitchEnrichmentOptions = {}): Promise<void> {
        if (this.isDestroyed || !this.settings.showPitchAccent) return;
        const seen = new Set<string>();
        const tokensNeedingLookup = tokens.filter(token => !this.applyCachedPublicVocabularyToToken(token));
        const uniqueTokens = tokensNeedingLookup.filter(token => {
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
            const deferredPublicTokens = uniqueTokens.slice(publicLookupLimit);
            const localOnly = runLimited(
                deferredPublicTokens,
                BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
                token => this.enrichPitchToken(token, { publicLookup: false }),
            );
            if (!publicTokens.length) {
                await localOnly;
                this.scheduleDeferredPublicPitchEnrichment(deferredPublicTokens);
                return;
            }
            this.queuePitchEnrichmentTokens(publicTokens, options);
            await Promise.all([localOnly, this.drainPitchEnrichmentQueue()]);
            this.scheduleDeferredPublicPitchEnrichment(deferredPublicTokens);
            return;
        }

        this.queuePitchEnrichmentTokens(uniqueTokens, options);
        await this.drainPitchEnrichmentQueue();
    }

    private scheduleDeferredPublicPitchEnrichment(tokens: JPDBToken[]): void {
        if (!tokens.length) return;
        void this.waitForIdle().then(() => this.enrichPitchWords(tokens)).catch(error => {
            log.warn('Deferred pitch failed', error);
        });
    }

    private queuePitchEnrichmentTokens(tokens: JPDBToken[], options: { urgent?: boolean } = {}): void {
        for (const token of tokens) {
            const key = cardKey(token.card);
            if (this.pitchEnrichmentQueuedKeys.has(key)) {
                if (options.urgent) this.promoteQueuedPitchEnrichmentToken(key);
                this.pitchEnrichmentQueue.push(token);
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

    private applyCachedPublicVocabularyToToken(token: JPDBToken): boolean {
        if (token.card.source !== 'fallback') return false;
        const card = this.resolvedFallbackVocabularyCache.get(cardKey(token.card));
        if (!card) return false;
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        this.applyPublicVocabularyToRenderedWords(token.card, card, pitchClass);
        token.card = card;
        token.pitchClass = pitchClass;
        return true;
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
        if (this.pitchEnrichmentQueue.some(token => cardKey(token.card) === key)) return;
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

    private async fillCardPitchFromLocalDictionary(card: JPDBCard): Promise<void> {
        if (card.pitchAccent.length) return;
        const localPitch = await this.localPitchAccentForCard(card);
        if (localPitch.length) card.pitchAccent = localPitch;
    }

    private async enrichPitchToken(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookup'> = {}): Promise<void> {
        const fallback = token.card;
        const card = await this.pitchEnrichedRenderedCard(fallback, options);
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (card !== fallback) {
            this.applyResolvedPitchCardToToken(token, fallback, card, pitchClass);
            return;
        }
        this.applyPitchClassToFallbackToken(token, card, pitchClass);
    }

    private async pitchEnrichedRenderedCard(fallback: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup'>): Promise<JPDBCard> {
        await this.fillCardPitchFromLocalDictionary(fallback);
        const card = await this.resolvePitchFallbackCard(fallback, options);
        if (card !== fallback) await this.fillCardPitchFromLocalDictionary(card);
        await this.ensureCardPitchAccent(card, options);
        return card;
    }

    private async resolvePitchFallbackCard(fallback: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup'>): Promise<JPDBCard> {
        if (fallback.pitchAccent.length || options.publicLookup === false) return fallback;
        return await this.resolveRenderedFallbackVocabulary(fallback) ?? fallback;
    }

    private async ensureCardPitchAccent(card: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup'>): Promise<void> {
        if (card.pitchAccent.length || options.publicLookup === false) return;
        const pitchAccent = await this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(() => []);
        if (pitchAccent.length) card.pitchAccent = pitchAccent;
    }

    private applyResolvedPitchCardToToken(token: JPDBToken, fallback: JPDBCard, card: JPDBCard, pitchClass: string): void {
        this.applyPublicVocabularyToRenderedWords(fallback, card, pitchClass || 'unknown');
        token.card = card;
        token.pitchClass = pitchClass;
    }

    private applyPitchClassToFallbackToken(token: JPDBToken, card: JPDBCard, pitchClass: string): void {
        if (!pitchClass) return;
        token.pitchClass = pitchClass;
        this.applyPitchAccentToRenderedWords(card, pitchClass);
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
        evictOldestStringKeysWhileOverLimit(this.pitchEnrichmentLocalCache, PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT);
    }

    private async resolveRenderedFallbackVocabulary(card: JPDBCard): Promise<JPDBCard | undefined> {
        if (card.source !== 'fallback') return undefined;
        const publicCard = await this.lookupFallbackApiCard(card);
        if (!publicCard) return undefined;
        if (!publicCard.pitchAccent.length) {
            publicCard.pitchAccent = await this.jpdbPublicPitch.lookup(publicCard.spelling, publicCard.reading).catch(() => []);
        }
        this.rememberResolvedFallbackVocabulary(card, publicCard);
        this.parser.cacheCards?.([publicCard]);
        return publicCard;
    }

    private rememberResolvedFallbackVocabulary(fallback: JPDBCard, card: JPDBCard): void {
        if (fallback.source !== 'fallback') return;
        const key = cardKey(fallback);
        this.resolvedFallbackVocabularyCache.delete(key);
        this.resolvedFallbackVocabularyCache.set(key, card);
        evictOldestStringKeysWhileOverLimit(this.resolvedFallbackVocabularyCache, RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT);
        this.scheduleCachedPublicVocabularyHydration(document);
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
        evictOldestStringKeysWhileOverLimit(this.preloadedTermAudioKeys, PRELOADED_TERM_AUDIO_KEY_LIMIT);
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private kanjiSourceTitle(sourceId: string): string {
        if (sourceId === KANJI_STROKE_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'strokePractice');
        if (sourceId === KANJI_JPDB_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'readingsComponents');
        if (sourceId === KANJI_RTK_SOURCE_ID) return 'RTK';
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'kanjiDictionaries');
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'originStructure');
        return kanjiSourceLabel(this.settings, sourceId);
    }

    private applyAnkiLookupToRenderedWords(
        card: JPDBCard,
        ankiLookup: AnkiLookupResult,
        options: { preserveExistingEmpty?: boolean } = {},
    ): void {
        this.applyAnkiLookupMapToRenderedWords(new Map([[renderedWordCardKey(card.vid, card.sid), ankiLookup]]), [document], options);
    }

    private applyAnkiLookupsToRenderedWords(tokens: JPDBToken[], lookups: AnkiLookupResult[], roots: ParentNode[]): void {
        const lookupByWordKey = new Map<string, AnkiLookupResult>();
        const empty = (): AnkiLookupResult => ({ state: 'not-in-deck', notes: [], primary: null });
        tokens.forEach((token, index) => {
            lookupByWordKey.set(renderedWordCardKey(token.card.vid, token.card.sid), lookups[index] ?? empty());
        });
        this.applyAnkiLookupMapToRenderedWords(lookupByWordKey, roots.length ? roots : [document]);
    }

    private applyAnkiLookupMapToRenderedWords(
        lookupByWordKey: Map<string, AnkiLookupResult>,
        roots: ParentNode[],
        options: { preserveExistingEmpty?: boolean } = {},
    ): void {
        if (!lookupByWordKey.size) return;
        this.pauseAutoScanObserver(() => {
            const targetRoots = uniqueParentNodes(roots);
            if (!this.shouldRunAnkiBackgroundWork()) {
                this.clearRenderedAnkiLookupStateForKeys(lookupByWordKey, targetRoots);
                return;
            }
            this.prepareRenderedWordIndexForLookups(lookupByWordKey, targetRoots);
            lookupByWordKey.forEach((lookup, key) => {
                this.renderedWordsForLookupKey(key, targetRoots)
                    .forEach(word => applyAnkiLookupToRenderedWord(word, lookup, this.settings.interfaceLanguage, options));
            });
            targetRoots.forEach(root => refreshReaderWordContrast(root));
        });
    }

    private clearRenderedAnkiLookupStateForKeys(lookupByWordKey: Map<string, AnkiLookupResult>, roots: ParentNode[]): void {
        lookupByWordKey.forEach((_lookup, key) => {
            this.renderedWordsForLookupKey(key, roots)
                .forEach(word => clearRenderedWordAnkiState(word));
        });
        roots.forEach(root => refreshReaderWordContrast(root));
    }

    private clearRenderedAnkiWordStates(root: ParentNode = document): void {
        this.pauseAutoScanObserver(() => {
            renderedWordsInRoot(root).forEach(word => clearRenderedWordAnkiState(word));
            refreshReaderWordContrast(root);
        });
    }

    private prepareRenderedWordIndexForLookups(lookupByWordKey: Map<string, AnkiLookupResult>, roots: ParentNode[]): void {
        const targetRoots = roots.length ? roots : [document];
        const includesDocument = targetRoots.includes(document);
        if (this.shouldSkipRenderedWordIndexPreparation(lookupByWordKey, includesDocument)) return;
        targetRoots.forEach(root => this.registerRenderedWordsInRoot(root));
        if (includesDocument) this.renderedWordIndexFullyScanned = true;
    }

    private shouldSkipRenderedWordIndexPreparation(lookupByWordKey: Map<string, AnkiLookupResult>, includesDocument: boolean): boolean {
        if (!includesDocument) return false;
        if (this.renderedWordIndexFullyScanned) return true;
        if (this.renderedWordIndexHasLookupKeys(lookupByWordKey)) return true;
        if (this.renderedWordIndex.size) return true;
        return lookupByWordKey.size <= ANKI_TARGETED_RENDERED_WORD_SELECTOR_THRESHOLD;
    }

    private renderedWordIndexHasLookupKeys(lookupByWordKey: Map<string, AnkiLookupResult>): boolean {
        for (const key of lookupByWordKey.keys()) {
            if (!this.renderedWordIndex.has(key)) return false;
        }
        return true;
    }

    private renderedWordsForLookupKey(key: string, roots: ParentNode[]): HTMLElement[] {
        const targetRoots = roots.length ? roots : [document];
        const indexed = this.indexedRenderedWordsForLookupKey(key, targetRoots);
        if (indexed.length || this.renderedWordIndex.has(key)) return indexed;
        const queried = this.queryRenderedWordsForLookupKey(key, targetRoots);
        queried.forEach(word => this.registerRenderedWord(word));
        return queried;
    }

    private indexedRenderedWordsForLookupKey(key: string, roots: ParentNode[]): HTMLElement[] {
        const words = this.renderedWordIndex.get(key);
        if (!words) return [];
        const matches: HTMLElement[] = [];
        for (const word of words) {
            if (!word.isConnected || renderedWordElementKey(word) !== key) {
                words.delete(word);
                continue;
            }
            if (roots.some(root => rootContainsRenderedWord(root, word))) matches.push(word);
        }
        if (!words.size) this.renderedWordIndex.delete(key);
        return matches;
    }

    private queryRenderedWordsForLookupKey(key: string, roots: ParentNode[]): HTMLElement[] {
        const selector = renderedWordSelectorForKey(key);
        if (!selector) return [];
        const words = new Set<HTMLElement>();
        roots.forEach(root => {
            if (root instanceof HTMLElement && root.matches(selector)) words.add(root);
            root.querySelectorAll<HTMLElement>(selector).forEach(word => words.add(word));
        });
        return [...words];
    }

    private registerRenderedWordsInRoot(root: ParentNode): void {
        renderedWordsInRoot(root).forEach(word => this.registerRenderedWord(word));
    }

    private registerRenderedWord(word: HTMLElement): void {
        const key = renderedWordElementKey(word);
        if (!isValidRenderedWordKey(key)) return;
        const words = this.renderedWordIndex.get(key) ?? new Set<HTMLElement>();
        words.add(word);
        this.renderedWordIndex.set(key, words);
    }

    private clearRenderedWordIndex(): void {
        this.renderedWordIndex.clear();
        this.renderedWordIndexFullyScanned = false;
    }

    private applyPitchAccentToRenderedWords(card: JPDBCard, pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling)): void {
        if (!pitchClass) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.pauseAutoScanObserver(() => {
            const changedRoots = new Set<ParentNode>();
            document.querySelectorAll<HTMLElement>(selector).forEach(word => {
                setRenderedWordPitchClass(word, pitchClass);
                changedRoots.add(word.parentElement ?? word);
            });
            changedRoots.forEach(root => refreshReaderWordContrast(root));
        });
    }

    private applyPublicVocabularyToRenderedWords(fallback: JPDBCard, card: JPDBCard, pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown'): void {
        const selector = `.jpdb-reader-word[data-vid="${fallback.vid}"][data-sid="${fallback.sid}"]`;
        this.pauseAutoScanObserver(() => {
            const changedRoots = new Set<ParentNode>();
            document.querySelectorAll<HTMLElement>(selector).forEach(word => {
                this.applyPublicVocabularyToRenderedWord(word, card, pitchClass);
                changedRoots.add(word.parentElement ?? word);
            });
            changedRoots.forEach(root => refreshReaderWordContrast(root));
        });
    }

    private applyCachedPublicVocabularyToRenderedFallbackWords(root: ParentNode): void {
        if (!this.resolvedFallbackVocabularyCache.size) return;
        this.pauseAutoScanObserver(() => {
            const changedRoots = new Set<ParentNode>();
            root.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid][data-expression]').forEach(word => {
                const key = renderedFallbackVocabularyCacheKey(word);
                const card = key ? this.resolvedFallbackVocabularyCache.get(key) : undefined;
                if (!card) return;
                const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
                this.applyPublicVocabularyToRenderedWord(word, card, pitchClass);
                changedRoots.add(word.parentElement ?? word);
            });
            changedRoots.forEach(r => refreshReaderWordContrast(r));
        });
    }

    private scheduleCachedPublicVocabularyHydration(root: ParentNode): void {
        this.applyCachedPublicVocabularyToRenderedFallbackWords(root);
        [120, 500, 1_500, 5_000, 10_000].forEach(delay => {
            window.setTimeout(() => {
                if (this.isDestroyed) return;
                if (root instanceof Element && !root.isConnected) return;
                this.applyCachedPublicVocabularyToRenderedFallbackWords(root);
            }, delay);
        });
    }

    private applyPublicVocabularyToRenderedWord(word: HTMLElement, card: JPDBCard, pitchClass: string): void {
        this.renderedWordIndex.get(renderedWordElementKey(word))?.delete(word);
        setRenderedWordPitchClass(word, pitchClass);
        setRenderedWordCardIdentity(word, card);
        this.registerRenderedWord(word);
        applyPublicVocabularyFurigana(word, card, this.settings);
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        if (button.disabled) return;
        button.disabled = true;
        const action = button.dataset.action;
        const anchor = this.connectedActivePopoverAnchor();
        const trigger = this.activeTextLookupTrigger();
        const done = log.time('cardAction', { action, term: card.spelling, trigger });
        try {
            const shouldRefresh = await this.cardActions.perform(action, button, card, sentence, this.cardActionContext(anchor));
            if (shouldRefresh && action === 'grade') {
                this.dismissAfterReview();
                log.info('Card action completed', { action, term: card.spelling });
                return;
            }
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

    private dismissAfterReview(): void {
        this.dismiss({ suppressHoverTarget: true });
    }

    private connectedActivePopoverAnchor(): HTMLElement | undefined {
        return this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined;
    }

    private cardActionContext(anchor: HTMLElement | undefined): { sentenceTarget?: string } {
        const sentenceTarget = this.cardActionSentenceTarget(anchor);
        return sentenceTarget ? { sentenceTarget } : {};
    }

    private cardActionSentenceTarget(anchor: HTMLElement | undefined): string {
        const word = anchor?.closest<HTMLElement>('.jpdb-reader-word');
        const surface = word ? normalizedLookupText(readerWordSurfaceText(word)) : '';
        return surface.length <= 80 ? surface : '';
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
                hasVideo: Boolean(anchor?.closest(SUBTITLE_SURFACE_SELECTOR)) || Boolean(document.querySelector('video')),
            }),
            imageDataUrl: this.settings.ankiCaptureScreenshot ? this.ocr.captureSourceImageForElement(anchor ?? null) : undefined,
            videoImageDataUrl: this.settings.ankiCaptureScreenshot ? captureActiveVideoFrame() : undefined,
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit.fetchDataUrl(imageUrl, timeoutMs, this.settings.corsProxyUrl, this.settings.interfaceLanguage),
            fetchAudioDataUrl: (audioUrls, timeoutMs) => this.immersionKit.fetchDataUrl(audioUrls, timeoutMs, this.settings.corsProxyUrl, this.settings.interfaceLanguage),
        });
        return context;
    }

    private showSettings(panel?: string): void {
        const dialog = this.getSettingsDialog();
        if (dialog) dialog.open(panel);
    }

    private getSettingsDialog(): SettingsDialogControllerInstance | undefined {
        const Controller = yomuSettingsDialogController();
        if (!Controller) {
            log.warnOnce('settings-companion-missing', 'Settings companion is missing; settings are unavailable.');
            this.toast('Settings are unavailable because the settings companion did not load.');
            return undefined;
        }
        this.settingsDialog ??= new Controller({
            getSettings: () => this.settings,
            setSettings: settings => {
                this.settings = settings;
                this.applyPreferredJapaneseSiteLanguage();
                if (!settings.ankiEnabled) this.clearRenderedAnkiWordStates();
            },
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
            this.dismiss({
                suppressHoverTarget: false,
                preserveNavigation: true,
                preserveHoverGeneration: state.mode === 'hover',
                preserveKeyboardActive: state.resolvedAnchor === this.keyboardActiveWord,
            });
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
        this.installPopoverBodyStabilizers(popover);
        if (!popover.classList.contains('jpdb-reader-sheet')) {
            if (typeof ResizeObserver === 'function') {
                this.activePopoverResizeObserver = new ResizeObserver(() => this.repositionActivePopover());
                this.activePopoverResizeObserver.observe(popover);
            }
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
                maxHeight: configuredPopoverMaxHeight(this.settings),
                preferBefore: this.shouldPreferActiveHoverPopoverBefore(),
            },
        );
        this.syncActivePopoverFixedHeight();
    }

    private repositionableActivePopover(): HTMLElement | null {
        if (!this.activePopover) return null;
        if (this.activePopover.classList.contains('jpdb-reader-sheet')) return null;
        if (this.activePopover.classList.contains('jpdb-reader-settings')) return null;
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
        return runtimePopoverMaxHeightAtTop(this.settings, top);
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
        return shouldUseFixedPopoverHeight(popover, this.settings, this.activePopoverMode !== 'hover');
    }

    private syncActivePopoverFixedHeight(): void {
        const popover = this.activePopover;
        syncFixedPopoverHeight(popover, popover ? this.shouldUseFixedModalHeight(popover) : false);
    }

    private installPopoverBodyStabilizers(popover: HTMLElement): void {
        installRuntimePopoverBodyStabilizers(popover);
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
        this.prepareActivePopoverDismiss(options);
        this.restoreSettingsPreviewState();
        this.removeReaderDialogNodes();
        this.stackedSettingsDialog = undefined;
        this.clearActivePopoverState(options);
        if (!options.preserveNavigation) {
            this.navigation.clearWord();
            this.navigation.clearKanji();
        }
        if (hadSettingsDialog) {
            // The settings dialog hides the page behind it with aria-hidden/inert.
            // Restore it on every teardown path — backdrop click and the close-popup
            // shortcut reach here without going through the controller's own close,
            // and a stranded `inert` page swallows clicks until the user reloads.
            this.settingsDialog?.releaseModalBackground();
            this.schedulePendingDictionaryRescan();
        }
    }

    private shouldDismissStackedLookupOnly(): boolean {
        return Boolean(this.stackedSettingsDialog && this.activePopover && this.activePopover !== this.stackedSettingsDialog.form);
    }

    private dismissStackedLookupOverSettings(options: DismissOptions): void {
        this.prepareActivePopoverDismiss(options);
        this.nativeTitleGuard.restore();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        const stack = this.stackedSettingsDialog;
        this.clearActivePopoverState(options);
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

    private prepareActivePopoverDismiss(options: DismissOptions): void {
        if (this.activePopover) this.immersionPopover.abortPendingRequests(this.activePopover);
        this.clearHoverDismissState(options);
        this.audio.stop();
        this.immersionPopover.stopAudio();
        this.updateSuppressedHoverTarget(options);
        this.cardRenderRequest++;
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
        const shouldPublishThemeRestore = this.settingsPreviewOriginalTheme !== undefined;
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
        if (shouldPublishThemeRestore) this.publishThemeSettingsChange();
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

    private clearActivePopoverState(options: { preserveKeyboardActive?: boolean } = {}): void {
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
        if (!options.preserveKeyboardActive) this.clearKeyboardActiveWord();
    }

    private schedulePendingDictionaryRescan(): void {
        if (!this.dictionaryRescanPending) return;
        this.dictionaryRescanPending = false;
        window.setTimeout(() => this.scheduleDictionaryRescan(), 80);
    }

    private toast(message: string): void {
        showReaderToast(message);
    }
}

function normalizedNestedParseOptions(options: ReaderParserParseOptions, settings: ReaderSettings): Required<ReaderParserParseOptions> {
    const apiTimeoutMs = nestedParseApiTimeoutMs(options);
    const allowApiTimeoutFallback = nestedParseAllowApiTimeoutFallback(options);
    const skipApi = nestedParseSkipApi(options);
    const requireApi = nestedParseRequireApi(options, skipApi);
    return {
        apiTimeoutMs,
        allowApiTimeoutFallback,
        jpdbTimeoutMs: options.jpdbTimeoutMs ?? apiTimeoutMs,
        allowJpdbTimeoutFallback: options.allowJpdbTimeoutFallback ?? allowApiTimeoutFallback,
        includeLocalPitch: options.includeLocalPitch ?? false,
        skipApi,
        skipJpdb: options.skipJpdb ?? skipApi,
        requireApi,
        requireJpdb: options.requireJpdb ?? requireApi,
        allowSegmentedFallback: options.allowSegmentedFallback ?? !hasJpdbApiCredential(settings),
    };
}

function nestedParseApiTimeoutMs(options: ReaderParserParseOptions): number {
    return options.apiTimeoutMs ?? options.jpdbTimeoutMs ?? 1_200;
}

function nestedParseAllowApiTimeoutFallback(options: ReaderParserParseOptions): boolean {
    return options.allowApiTimeoutFallback ?? options.allowJpdbTimeoutFallback ?? false;
}

function nestedParseSkipApi(options: ReaderParserParseOptions): boolean {
    return options.skipApi ?? options.skipJpdb ?? false;
}

function nestedParseRequireApi(options: ReaderParserParseOptions, skipApi: boolean): boolean {
    return options.requireApi ?? options.requireJpdb ?? !skipApi;
}

function publicLookupCardRequest(
    readingOrOptions: string | { allowCandidateLookup?: boolean },
    maybeOptions: { allowCandidateLookup?: boolean },
): { options: { allowCandidateLookup?: boolean }; reading: string } {
    return typeof readingOrOptions === 'string'
        ? { options: maybeOptions, reading: readingOrOptions }
        : { options: readingOrOptions, reading: '' };
}

function canSearchPublicLookupCard(settings: ReaderSettings, options: { allowCandidateLookup?: boolean }): boolean {
    return Boolean(options.allowCandidateLookup || settings.jpdbDefinitionsEnabled || settings.showPitchAccent);
}

function publicLookupSearchLimit(reading: string): number {
    return reading ? 12 : 1;
}

function publicLookupCardFromResults(cards: JPDBCard[], term: string, exact: boolean, reading: string): JPDBCard | undefined {
    if (reading) return cards.find(card => card.spelling === term && card.reading === reading);
    const exactMatch = cards.find(card => card.spelling === term || card.reading === term);
    return exactMatch ?? (exact ? undefined : cards[0]);
}

function jitenFallbackTokenMatches(term: string, token: JPDBToken): boolean {
    const normalizedTerm = normalizedLookupText(term);
    const tokenSurface = normalizedLookupText(token.sentence?.slice(token.start, token.end) ?? '');
    return tokenSurface === normalizedTerm
        || normalizedLookupText(token.card.spelling) === normalizedTerm
        || normalizedLookupText(token.card.reading) === normalizedTerm;
}
