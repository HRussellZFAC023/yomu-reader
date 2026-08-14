import { AudioPlayer } from '../audio/player';
import { isYomuHostedAppUrl } from './pages';
import { AnkiConnectClient, ankiLookupWithUnavailableDetails, captureActiveVideoFrame, untrustedAnkiLookupResult, type AnkiLookupResult } from '../anki/index';
import { renderReviewButtons } from '../anki/render';
import { promiseWithTimeout, runLimited } from '../core/async-utils';
import { copyText, isEditableEventContext, normalizePressedKey, pauseActiveVideo, positionPopover } from '../ui/browser';
import {
    applyOverlayPageScale,
    hasOverlayPageScale,
    overlayViewport,
    sourceRectToOverlay,
} from '../ui/page-scale';
import { installLocalTapActivation as installControlPointerActivation } from '../ui/pointer-activation';
import { dispatchAuthorizedReaderControlClick, installTrustedReaderRootBoundary, isTrustedReaderInteraction, trustedReaderEventHandler } from '../ui/trusted-interaction';
import { CardActionController } from '../cards/action-controller';
import { refreshAfterCardAction, reportCardActionFailure, runCardActionOperation } from '../cards/action-operation';
import { CardPopoverRenderer, popoverBunproGradeMode, togglePopoverReviewTargetSelection, updatePopoverReviewTargetSelection } from '../cards/popover-renderer';
import { CardRenderDataLoader, loadingCardRenderData, type CardRenderData, type CardRenderDataLoad } from '../cards/render-data';
import { kanjiFrequencyRanks } from '../cards/frequency-ranks';
import type { ProviderFrequencyRanks } from '../cards/frequency-ranks';
import { highlightCardTargetScopes } from '../cards/highlight';
import { cardKey } from '../cards/utils';
import { normalizeCardStates } from '../cards/state';
import {
    yomuImageOcrController,
    yomuOnboardingController,
    yomuSettingsSurfaceCompanion,
    yomuSettingsDialogController,
    yomuSubtitlePlayerController,
    yomuYoutubeImmersionFilter,
    type SettingsDialogControllerInstance,
    type YoutubeImmersionFilterInstance,
} from '../companions/registry';
import { APP_NAME, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, NEW_TAB_PAGE_URL } from './constants';
import { publishSettingsChange as publishPrivateSettingsChange, subscribeToSettingsChanges } from '../settings/settings-change-bus';
import { DictionarySourceStateController } from '../sources/state';
import { createReaderDictionaryStyleController } from '../sources/styles';
import { OfflineDictionarySetupController } from '../dictionaries/offline-setup-controller';
import { createFactoryResetCoordinator, type FactoryResetCoordinator } from './factory-reset-coordinator';
import {
    annotationScopeRoots,
    mutationMayExpandAnnotationScope,
    nodeWithinAnnotationScope,
    scanScopeRoots,
} from './annotation-scope';
import {
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    appendToDocumentHead,
    clearProjectedReadingsWithin,
    documentHasJapaneseText,
    documentJapaneseTextProbe,
    documentPortalReaderWordScopeForSource,
    documentPortalSourceHostForReaderWord,
    escapeHtml,
    getSelectionText,
    isParticleCard,
    isPassiveInteractionElement,
    nearestReadableSentenceForElement,
    projectedReadingWordAtPoint,
    readerRenderRejectionRescanDelay,
    readerWordAtPointInScope,
    readerWordAtSourcePointInScope,
    renderedWordSentenceScope,
    readerWordSourcePointScore,
    readerWordSurfaceText,
    renderedWordPrivateValue,
    releaseRubyRoomGrowth,
    removeNonDestructiveScanMirrors,
    scheduleProjectedAnnotationLayoutRefresh,
    setInnerHtml,
    setReviewCardFrontPredicate,
    unwrapReaderWords,
} from '../dom/index';
import { firstComposedEventGeometryMatch } from './pointer-event-geometry';
import { isReviewCardFrontPromptElement } from './site-parsers';
import { currentJitenStudyHeadwordText } from '../jiten/jiten-page-targets';
import {
    kanjiFactProviderTitle,
    kanjiSourceStateKey,
    renderKanjiDefinitions,
} from '../sources/definition-render';
import { renderDefinitionSourceImmersionMount, renderDefinitionSourcesStack, type DefinitionSourceStackOptions } from '../sources/definition-stack';
import { installProviderExampleBehaviors } from '../sources/provider-examples';
import { isUsefulImmersionPreloadQuery } from '../immersion/query';
import type { ImmersionSearchOptions } from '../immersion/popover-controller';
import { waitForIdle as waitForBrowserIdle } from '../platform/idle';
import { ParkableObserver, parkableMutationObserver } from '../platform/page-activity';
import { mutationContainsOnlyReaderPaint } from '../dom/mutation';
import { FloatingButtonController } from '../ui/floating-button';
import { JitenApiClient, type JitenKanjiInfo, type JitenVocabularyInfo } from '../dictionaries/jiten';
import { JitenPublicVocabularyClient, publicJitenBackoffRemainingMs } from '../dictionaries/jiten-public-vocabulary';
import { jitenKanjiOriginFactLabels, renderJitenKanjiInfo, renderJitenKanjiKeywordLine } from '../jiten/jiten-kanji-info-render';
import { filterJitenKanjiWords as filterSharedJitenKanjiWords, loadMoreJitenKanjiWords as loadMoreSharedJitenKanjiWords, type JitenKanjiWordsActionContext } from '../jiten/jiten-kanji-words-actions';
import { JpdbClient } from '../jpdb/jpdb';
import { yomuBunproCompanion, yomuKanjiStudyCompanion } from '../companions/registry';
import type { JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { renderedJpdbRelatedWords } from '../jpdb/jpdb-related-words';
import { jpdbVocabularyUrl } from '../jpdb/jpdb-vocabulary-url';
import {
    dictionaryPreferencePriority as jpdbPageDictionaryPreferencePriority,
    isJpdbHost,
    jpdbAudioCard,
    localDictionaryLookupVariants,
    uniqueLocalDictionaryEntries,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from '../jpdb/jpdb-page-targets';
import {
    currentPageEnhancementLayoutContext,
    currentPageKanji,
    currentPageLocalDictionaryTargets,
    currentPageTermTarget,
    isCurrentKanjiSurface,
    isBunproHost,
    isBunproQuizAnswerHidden,
    isJitenHost,
    isPageEnhancementHost,
    isPageEnhancementReady,
} from './page-enhancement-targets';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { KanjiSourceInfo } from '../kanji/origin';
import { updateKanjiMiningControlsMount } from '../kanji/mining-controls';
import type { KanjiVGInfo } from '../kanji/vg';
import {
    boundedPublicPitchLookupReservation,
    isLookupableJapaneseText,
    isLowValuePitchEnrichmentToken,
    lookupCandidateSentence,
    normalizedLookupText,
    pitchEnrichmentPriority,
    pitchEnrichmentTokenForCard,
    preferredRenderedWordSentence,
} from '../lookup/text-helpers';
import { isTargetLanguageText } from '../lookup/target-text';
import { hasPaintablePitchComponents, hasResolvedPitchComponents, inferredAnnotatedPitchComponents } from '../lookup/pitch-components';
import { publishCardStateSignal, subscribeToCardStateSignals } from './card-state-signal';
import {
    annotationPowerState,
    applyAnnotationPowerTransition,
    planAnnotationPowerTransition,
} from './annotation-power-policy';
import { configureLogger, Logger } from './logger';
import {
    cardMatchesRenderedLookupValue,
    jitenWordCardForMassReview,
    visibleJitenReviewableWords,
    renderedWordCardForLookup,
    renderedWordLookupText,
    unconfirmedRenderedWordSpan,
} from '../main/rendered-word-lookup';
import {
    installTokenListHandlers as installTokenListClickHandlers,
    renderTokenListHtml as renderTokenListMarkup,
    type TokenListContext,
} from '../main/token-list';
import * as privateCommands from '../dom/private-command-capabilities';
import {
    configuredPopoverMaxHeight,
    installPopoverBodyStabilizers as installRuntimePopoverBodyStabilizers,
    popoverMaxHeightAtTop as runtimePopoverMaxHeightAtTop,
    shouldUseFixedPopoverHeight,
    syncFixedPopoverHeight,
} from '../runtime/popover-body-stabilizer';
import {
    ANKI_RECOLOR_SCAN_CHUNK_SIZE,
    BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
    BUNPRO_FSRS_REVIEW_SHORTCUTS,
    DEFERRED_PUBLIC_PITCH_ENRICHMENT_CHUNK_SIZE,
    DEFERRED_PUBLIC_PITCH_HOVER_PAUSE_MS,
    DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS,
    DEFERRED_PUBLIC_PITCH_PER_URL_CAP,
    LOCAL_PITCH_ENRICHMENT_CONCURRENCY,
    LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS,
    FIVE_BUTTON_REVIEW_SHORTCUTS,
    HOVER_ANKI_HYDRATION_DELAY_MS,
    HOVER_POINTER_TEXT_LOOKUP_OPTIONS,
    NEARBY_TERM_AUDIO_PRELOAD_LIMIT,
    NEARBY_TERM_AUDIO_PRELOAD_DELAY_MS,
    NESTED_PARSE_CONTENT_CACHE_LIMIT,
    NESTED_PARSE_CONTENT_CACHE_TTL_MS,
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
    UNRESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT,
    UNRESOLVED_FALLBACK_VOCABULARY_RETRY_TTL_MS,
    PUBLIC_VOCABULARY_MISS_RETRY_LIMIT,
    DEFERRED_PUBLIC_PITCH_BACKOFF_WAIT_MS,
    MISALIGNED_PUBLIC_FURIGANA_RECOVERY_LIMIT,
    allowsGenericVisibleAutoScan,
    ankiLookupHasDisplayableNotes,
    audioPreloadLimits,
    backgroundPitchEnrichmentOptionsForHost,
    canSchedulePointerTextHoverLookup,
    cardDisplayTrigger,
    cardSourceLabel,
    connectedElement,
    dictionaryLookupLink,
    dictionaryLookupNestedWord,
    dictionaryLookupQuery,
    dictionaryLookupWordMatchesLink,
    handleReaderActionPillLink,
    eventElement,
    evictOldestStringKeysWhileOverLimit,
    hasBlockedJpdbReviewState,
    hasPressLookupEnabled,
    hasVisibleAutoScanTargets,
    hasVisibleSiteScanTargets,
    isMousePointerEvent,
    isYouTubeHostname,
    matchedReviewShortcutGrade,
    mountedHoverPointerPosition,
    nestedPitchEnrichmentOptionsForHost,
    pointerOffsetInsideLiveLookup,
    popoverAnchorRect,
    renderedWordAnchor,
    renderedWordNavigationMode,
    samePointerTextLookupTarget,
    selectionIntersectsElement,
    shouldLockMountedPopoverPosition,
    shouldAutoScanImageOcr,
    debouncedAutoScanDeadline,
    throttledAutoScanDelay,
    visibleAutoScanInitialDelay,
    visibleAutoScanMutationDelay,
    type CardDisplayOptions,
    type KanjiDetailPromises,
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
    type TextLookupOptions,
    type TokenListOptions,
} from './main-helpers';
import { watchMokuroOcrToggle } from './mokuro-integration';
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
import { AUTO_SCAN_OBSERVER_OPTIONS, clickMayRevealDynamicUiText, clickMayRevealReviewAnswer, createMutationJapaneseScanBudget, mutationInsideReaderRoot, mutationMayAffectJpdbPageEnhancements, mutationMayContainJapaneseText, mutationScanProbeCanProduceWork, mutationTouchesAsbPlayer } from './mutation-scan';
import { NativeTitleGuard } from './native-title-guard';
import { clearManagedBrowserCaches, managedLocalStorage, unregisterManagedServiceWorkers } from './storage';
import { isNativePageLookupBlocked, nativeClickableAncestor, shouldIgnoreDocumentClickTarget } from './native-page-lookup-targets';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedTextParsePlan, providerExampleTextParsePlan, type NestedParsePlan } from '../lookup/nested-text-parse';
import { resolveUiLanguage, uiText } from '../app/i18n';
import { userFacingErrorText } from './user-facing-errors';
import { translateJapaneseSentence } from '../study/tools';
import { activeLearningTarget } from '../languages/target-runtime';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
import { targetCanLookupCharacter, usesJapaneseCharacterStudy, usesJapaneseProviders } from '../languages/character-lookup';
import { outputLanguageOf, targetLanguageOf } from '../languages/selection';
import { immersionKitCapabilitiesFor } from '../sources/examples/immersion-kit';
import { abortPendingTargetExampleSources, installTargetExampleSources } from '../sources/examples/mount';
import { jpOnlyOn, syncLanguageFamilyDom } from '../settings/language-gating';
import { applyInterfaceLocaleToRoot } from '../locales/direction';
import { resolveInterfaceLocale } from '../locales/resolve';
import type { InterfaceLocale } from '../locales/manifest';
import { applyPreferredJapaneseSiteLanguage as applyJapaneseSiteLanguagePreference } from './preferred-site-language';
import { localPitchResolutionFromMetaLookup, type LocalPitchResolution } from '../lookup/pitch-meta';
import { isKanjiCharacter, uniqueKanji } from '../popup/pitch';
import { cardUsesPitchAccentPronunciation } from '../popup/pronunciation';
import type { ImageOcrController } from '../ocr/controller';
import { applyOcrInteractionMode, nextOcrInteractionMode, ocrInteractionModeFromSettings } from '../ocr/mode';
import { isApiMiningEnabled } from '../cards/srs-providers';
import {
    caretTextPositionFromPoint,
    pointerTextCharacterOffset,
    pointerTextLookupFromTextNode,
    pointerTextLookupFromRenderedWord,
    pointerTextLookupFromRenderedWordStart,
    type ActivePointerTextLookup,
    type PointerTextLookup,
} from '../lookup/pointer-text-lookup';
import { capturePopoverScrollOffset, clearDocumentSelection, createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, MINING_DRAWER_HANDLE_SELECTOR, MINING_DRAWER_POINTER_TARGET_SELECTOR, refreshForcedReaderPopoverSurface, restorePopoverScrollOffsetSoon, shouldUseSheet } from '../popup/shell';
import { addViewportChangeListeners } from '../popup/handle-drag';
import { HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS, isActiveHoverPopoverPointerContext, isHoverPopoverTransitActive, type HoverPopoverPointerState } from '../popup/hover-transit';
import { domHoverCloseTimers, HoverCloseController, type HoverContextQuery } from '../popup/hover-close';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import type { RtkInfo } from '../kanji/rtk';
import { ReaderAudioActions } from '../audio/actions';
import { canAttemptReaderAutoAudio } from '../audio/activation';
import { registerReaderMenuCommands } from './menu-commands';
import { bindReaderRuntimeEvents } from './runtime-events';
import { detectReaderStartupJapaneseText, installReaderStartupBridge, loadReaderStartupSettings, shouldShowReaderOnboarding, type ReaderAppInitOptions, type ReaderSettingsSurface } from './startup';
import { scheduleReaderAnkiStatusRefresh, scheduleReaderAnkiStatusWarmup } from './status-warmup';
import { createPostPaintPass, viewForNode } from '../dom/post-paint-pass';
import { refreshContrastForChangedWords, refreshReaderWordContrast } from '../dom/word-contrast';
import { applyAnkiLookupToRenderedWord, applyPublicVocabularyFurigana, canClickLookupPassiveReaderWordElement, canHoverLookupReaderWordElement, canLookupReaderWordElement, currentLookupNavigationWord, isOcrLineFrameWord, ocrLineWordAtPoint, singleKanjiOcrLookupCharacter, updateRenderedPitch, wait } from './dom-helpers';
import { ReaderParser, cardWithPreservedCachedEvidence, fallbackLookupTermsForCard, jpdbFirstParseOptions, type ReaderParserParseOptions } from '../lookup/parser';
import { hoverLookupScheduleDelay } from '../lookup/hover-scheduler';
import {
    clearRenderedWordAnkiState,
    applyBunproStateToRenderedWord,
    fallbackVocabularySpanCacheKey,
    renderedWordCardKey,
    renderedWordElementKey,
    renderedWordsInRoot,
    renderedWordsInRootChunked,
    setRenderedWordCardIdentity,
    setRenderedWordPitchAccentPattern,
    setRenderedWordPitchComponents,
    setRenderedWordPitchClass,
    uniqueParentNodes,
} from '../dom/rendered-word-state';
import {
    isProvisionalRenderedWord,
    renderedWordNumericIdentity,
    renderedWordSpan,
    resolveRenderedWordAttempts,
    selectRenderedWordAttempt,
} from '../dom/rendered-word-policy';
import { cachedRenderedWordHydration } from '../dom/rendered-word-hydration';
import {
    DEFAULT_SETTINGS,
    matchesShortcut,
    NO_EXPLICIT_USER_CHOICE,
    saveSettings,
    shortcutIsPressed,
    shouldLookupAnkiStatus,
    shouldLookupBunproWordStates,
} from '../settings/index';
import {
    effectiveBunproFrontendApiToken,
    effectiveBunproLegacyApiKey,
    effectiveJitenApiKey,
    effectiveJpdbApiKey,
    hasJitenApiCredential,
    hasJpdbApiCredential,
    isBunproFrontendCredentialExpired,
} from '../settings/api-credential';

import { createYomuLocalSrsAdapter, LocalYomuSrsRepository } from '../srs/local-yomu';
import { installAcademyReaderSrsSync } from '../srs/account-sync';
import { repaintYomuLocalSrsRenderedWords } from '../srs/local-yomu-state';
import { createWanikaniSrsAdapter } from '../srs/wanikani';
import { WanikaniClient } from '../wanikani/wanikani';
import { WanikaniLookupClient } from '../wanikani/wanikani-lookup';
import { WanikaniSourceController } from '../wanikani/wanikani-source';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from '../theme/reader-theme';
import { showReaderToast } from '../ui/toast';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    definitionSourceLabel,
    kanjiSourceLabel,
} from '../sources/sections';
import { parseContentCacheKey } from '../lookup/parse-content-cache-key';
import { renderKanjiImmersionKitMount, renderKanjiSourceMounts as renderRuntimeKanjiSourceMounts } from '../runtime/kanji-source-mounts';
import { initialReaderCss, loadReaderCssFallback, READER_CSS, shouldLoadReaderCssFallback } from '../styles/index';
import { setShadowReaderCss } from '../dom/shadow-styles';
import {
    forEachScannedShadowRoot,
    installOpenShadowRootDiscovery,
    setCustomElementUpgradeHook,
    setShadowRootScanHook,
    sweepDisconnectedShadowRoots,
    wakeShadowHostPoll,
} from '../dom/shadow-scan-registry';
import { StudySourceController } from '../study/sources';
import type { InterfaceLanguage, JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from './types';
import { currentAnkiLookupBatch, LateCardReconciliation } from './late-card-reconciliation';
import { RenderedWordIndex } from './rendered-word-index';
import { VisiblePageScanner } from './visible-page-scanner';
import { renderWordPills, updateHeadingWordPills } from '../sources/word-pills';
import { addWindowEventListener } from '../platform/window-events';
import { applyTargetSurfaceSettingsChange, shouldWakeTopLevelTarget, subscribeToFirstPersistedLearningTarget, subscribeToReaderSettingsChanges, TopLevelTargetLifecycle } from './settings-storage-subscription';
import type {
    YomitanDictionaryStore,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanTermEntry,
} from '../dictionaries/yomitan';
import { createLocalDictionaryStore } from '../dictionaries/local-store';
import { honorDictionaryReplicaPurge } from '../dictionaries/replica-purge';
import {
    cardHasContextPitch,
    isCompactPitchEnrichmentViewport,
    isHydratablePublicJitenCard,
    isSubstantivePublicPitchLookupToken,
    isYouTubeRuntimeHost,
    mergePitchPatterns,
    normalizedNestedParseOptions,
    pitchEnrichmentQueueOptions,
    uniqueTokensByCard,
    waitForHoverCardInitialPaint,
} from './main-lookup-helpers';
import { ReaderCardLookupSession, type CardLookupTargetSnapshot } from './card-lookup-session';
import { HoverWordOwnership } from './hover-word-ownership';
import {
    DeferredPublicJitenReadingCoordinator,
    resolvePublicFallbackPitchTokens as resolvePublicFallbackPitchTokensWithPublicJiten,
} from './deferred-public-jiten-readings';
import {
    READER_ROOT_GESTURE_EVENTS,
    READER_ROOT_SELECTOR,
    MIRROR_STALE_SCAN_MIN_INTERVAL_MS,
    VISIBLE_AUTO_SCAN_WORK_VERDICT_TTL_MS,
    eventTargetsReaderRoot,
    pointOverReaderRoot,
    readerRootGestureLeaks,
    READER_ROOT_SCROLL_BODY_SELECTOR,
    readerScrollBodyForEvent,
    eventTargetsInteractiveControl,
    knownStateBackfillSurface,
    knownStateBackfillCardForSurface,
    manualScrollReaderBody,
    MINING_PAUSE_REASSERT_WINDOW_MS,
    BUNPRO_WORD_STATE_WARMUP_DELAY_MS,
    KNOWN_STATE_BACKFILL_DELAY_MS,
    KNOWN_STATE_BACKFILL_IDLE_TIMEOUT_MS,
    KNOWN_STATE_BACKFILL_BATCH_LIMIT,
    KNOWN_STATE_BACKFILL_BACKOFF_MS,
    LINK_PRESS_LOOKUP_MS,
    SUBTITLE_HOVER_MINING_RESUME_GRACE_MS,
    HOVER_POPOVER_RESIZE_STICKY_MS,
    HOVER_READER_WORD_GEOMETRY_SCOPE_SELECTOR,
    JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY,
    REVIEW_PAGE_TARGET_SETTLE_MS,
    READER_POINTER_SURFACE_SELECTOR,
    TOKEN_LIST_POPOVER_CONTROL_SELECTOR,
    VIDEO_LOOKUP_ANCHOR_SELECTOR,
    PLAIN_SUBTITLE_HOVER_PAUSE_SELECTOR,
    createNoopImageOcrController,
    ocrModeToastKey,
    noopKanjiPracticeDoodle,
    keepsModalPopoverForOwnedSurface,
    fullscreenPopoverMountParent,
    isJsdomRuntime,
    firstLocalPitchPattern,
    japaneseSiteLanguageDisabled,
    pageAddonKeysMatch,
    type KanjiStudyCompanionSlot,
    type ReaderLifecycleSurface,
    type ActivePopoverDismissOptions,
    type CardPopoverHydrationContext,
    type PageWordDefinitionState,
    type PageAddonParseState,
    type MountedCardCompletionContext,
} from './main-runtime-support';
import { HostThemeController } from './host-theme-controller';

const log = Logger.scope('ReaderApp');

export class ReaderApp {
    private abortController = new AbortController();
    private isDestroyed = false;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    /** Non-persisted policy owned by a deliberate hosted reading surface. */
    private pageOwnedLearningTargetActive = false;
    private targetOwnedCoreInstalled = false;
    private settingsSurface?: ReaderSettingsSurface;
    private readonly topLevelTargetLifecycle = new TopLevelTargetLifecycle();
    private hostTheme = new HostThemeController({
        getSettings: () => this.settings,
        adoptTheme: theme => {
            this.settings = { ...this.settings, theme };
            void this.persistSettings(this.settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
            return this.settings;
        },
        publishThemeChange: () => this.publishThemeSettingsChange(),
        isDestroyed: () => this.isDestroyed,
    });
    private themeContrastRefreshFrame?: number;
    private themeContrastRefreshTimer?: number;
    private cardHydrationRenderPasses = new WeakMap<CardPopoverHydrationContext['state'], ReturnType<typeof createPostPaintPass>>();
    private setImmersionTranslationBlurred = (blurred: boolean): void => {
        if (this.settings.immersionKitRevealTranslationOnClick === blurred) return;
        this.settings = {
            ...this.settings,
            immersionKitRevealTranslationOnClick: blurred,
        };
        document.querySelectorAll<HTMLInputElement>('input[name="immersionKitRevealTranslationOnClick"]').forEach(input => {
            input.checked = blurred;
        });
        void this.persistSettings(this.settings, { explicitUserChoiceKeys: ['immersionKitRevealTranslationOnClick'] });
    };
    private jpdb = new JpdbClient(() => effectiveJpdbApiKey(this.settings), () => this.settings.corsProxyUrl);
    private jiten = new JitenApiClient(() => effectiveJitenApiKey(this.settings), { proxyUrl: () => this.settings.corsProxyUrl });
    // The kanji-study companion can register after this app constructs (hosted
    // pages append companion scripts around the core script, so load order is
    // not guaranteed). Every companion-backed collaborator therefore resolves
    // lazily at use time instead of being captured once at construction — a
    // late companion previously left Immersion Kit examples loading forever
    // and the mining drawer handle inert.
    private get kanjiCompanion(): ReturnType<typeof yomuKanjiStudyCompanion> {
        return yomuKanjiStudyCompanion();
    }
    private jpdbKanjiInstance: InstanceType<KanjiStudyCompanionSlot['JpdbKanjiClient']> | null = null;
    private get jpdbKanji(): InstanceType<KanjiStudyCompanionSlot['JpdbKanjiClient']> | null {
        const companion = this.kanjiCompanion;
        if (!this.jpdbKanjiInstance && companion) this.jpdbKanjiInstance = new companion.JpdbKanjiClient(() => this.settings.corsProxyUrl);
        return this.jpdbKanjiInstance;
    }
    private set jpdbKanji(value: InstanceType<KanjiStudyCompanionSlot['JpdbKanjiClient']> | null) {
        this.jpdbKanjiInstance = value;
    }
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private jitenPublicVocabulary = new JitenPublicVocabularyClient({ proxyUrl: () => this.settings.corsProxyUrl });
    private kanjiVGInstance: InstanceType<KanjiStudyCompanionSlot['KanjiVGClient']> | null = null;
    private get kanjiVG(): InstanceType<KanjiStudyCompanionSlot['KanjiVGClient']> | null {
        const companion = this.kanjiCompanion;
        if (!this.kanjiVGInstance && companion) this.kanjiVGInstance = new companion.KanjiVGClient();
        return this.kanjiVGInstance;
    }
    private set kanjiVG(value: InstanceType<KanjiStudyCompanionSlot['KanjiVGClient']> | null) {
        this.kanjiVGInstance = value;
    }
    private kanjiOriginInstance: InstanceType<KanjiStudyCompanionSlot['KanjiOriginClient']> | null = null;
    private get kanjiOrigin(): InstanceType<KanjiStudyCompanionSlot['KanjiOriginClient']> | null {
        const companion = this.kanjiCompanion;
        if (!this.kanjiOriginInstance && companion) this.kanjiOriginInstance = new companion.KanjiOriginClient();
        return this.kanjiOriginInstance;
    }
    private set kanjiOrigin(value: InstanceType<KanjiStudyCompanionSlot['KanjiOriginClient']> | null) {
        this.kanjiOriginInstance = value;
    }
    private immersionKitInstance: InstanceType<KanjiStudyCompanionSlot['ImmersionKitClient']> | null = null;
    private get immersionKit(): InstanceType<KanjiStudyCompanionSlot['ImmersionKitClient']> | null {
        const companion = this.kanjiCompanion;
        if (!this.immersionKitInstance && companion) this.immersionKitInstance = new companion.ImmersionKitClient();
        return this.immersionKitInstance;
    }
    private set immersionKit(value: InstanceType<KanjiStudyCompanionSlot['ImmersionKitClient']> | null) {
        this.immersionKitInstance = value;
    }
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private bunproCompanion = yomuBunproCompanion();
    private bunpro = this.bunproCompanion ? new this.bunproCompanion.BunproClient({
        getFrontendToken: () => this.activeBunproFrontendApiToken(),
        getLegacyApiKey: () => effectiveBunproLegacyApiKey(this.settings),
        getProxyUrl: () => this.settings.corsProxyUrl,
    }) : null;
    private bunproSrs = this.bunproCompanion && this.bunpro ? this.bunproCompanion.createBunproSrsAdapter(this.bunpro) : null;
    private wanikani = new WanikaniClient({ getToken: () => this.settings.wanikaniApiToken });
    private wanikaniSrs = createWanikaniSrsAdapter(this.wanikani);
    // fallow-ignore-next-line code-duplication
    private wanikaniSources = new WanikaniSourceController(
        new WanikaniLookupClient(this.wanikani),
        () => this.settings,
        (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        mount => {
            this.repositionActivePopover();
            const installDefinitionTranslationBehaviors =
                yomuSettingsSurfaceCompanion()?.installDefinitionTranslationBehaviors;
            if (!installDefinitionTranslationBehaviors) return;
            void installDefinitionTranslationBehaviors(mount, this.settings)
                .then(() => this.repositionActivePopover());
        },
    );
    private bunproWordStates = this.bunproCompanion && this.bunpro ? new this.bunproCompanion.BunproWordStateStore(this.bunpro) : null;
    private yomuLocalSrs = createYomuLocalSrsAdapter(new LocalYomuSrsRepository());
    private rtkInstance: InstanceType<KanjiStudyCompanionSlot['RtkClient']> | null = null;
    private get rtk(): InstanceType<KanjiStudyCompanionSlot['RtkClient']> | null {
        const companion = this.kanjiCompanion;
        if (!this.rtkInstance && companion) this.rtkInstance = new companion.RtkClient();
        return this.rtkInstance;
    }
    private set rtk(value: InstanceType<KanjiStudyCompanionSlot['RtkClient']> | null) {
        this.rtkInstance = value;
    }
    private dictionaries = createLocalDictionaryStore(() => this.settings.corsProxyUrl, () => this.settings.interfaceLanguage);
    private cardRenderData = new CardRenderDataLoader({
        getSettings: () => this.settings,
        dictionaries: this.dictionaries,
        jpdbPublicPitch: this.jpdbPublicPitch,
        jpdbVocabulary: this.jpdbVocabulary,
        anki: this.anki,
        jpdb: this.jpdb,
        jiten: this.jiten,
        bunpro: this.bunpro ?? undefined,
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
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery, _trigger, ankiLookup, frequencyRanks) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            ankiLookup,
            frequencyRanks,
            isJpdbBackedCard: value => this.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        }),
        renderDefinitionSources: (card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, bunproDefinitionInfo, extraSections) => this.renderDefinitionSources(card, entries, sentence, jpdbVocabularyInfo, jitenVocabularyInfo, bunproDefinitionInfo, extraSections),
        dictionarySourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
        dictionaryLabel: name => this.dictionaryLabel(name),
    });
    private dictionaryStyles = createReaderDictionaryStyleController(() => this.settings, preferences => this.dictionaries.dictionaryStyleCss(preferences), error => log.warn('Dictionary styles unavailable', error));
    private offlineDictionaries = new OfflineDictionarySetupController({
        dictionaries: this.dictionaries,
        getSettings: () => this.settings,
        applySettings: async settings => {
            this.settings = settings;
            await this.persistSettings(settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
        },
        notify: message => this.toast(message),
        afterInstalled: async () => {
            await this.refreshDictionaryStyles();
            this.scheduleDictionaryRescan();
        },
    });
    private studySources = new StudySourceController({
        getSettings: () => this.settings,
        dictionarySourceAttributes: key => this.dictionarySourceState.attributes(key),
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        parsePopoverJapanese: popover => this.isJpdbPageAddonRoot(popover)
            ? this.parseJpdbPageAddonJapanese(popover)
            : this.parsePopoverJapanese(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions()),
        enrichAnkiWords: (tokens, roots) => this.queueAnkiWordEnrichment(tokens, roots ?? [document]),
        // Study sections render inside popovers AND dictionary-site page addons;
        // both hosts must pass the "still on screen" guard or the addon's lazy
        // sections stay stuck on their loading placeholder forever.
        isCurrentPopoverRoot: root => this.isCurrentPopoverRoot(root) || this.isJpdbPageAddonRoot(root),
    });
    private cardActions = new CardActionController({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        jiten: this.jiten,
        srsAdapters: {
            bunpro: this.bunproSrs ?? undefined,
            wanikani: this.wanikaniSrs,
            'yomu-local': this.yomuLocalSrs,
        },
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
        setApiGradingProvider: provider => {
            this.settings.apiGradingProvider = provider;
            void this.persistSettings(this.settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
        },
        onAnkiStatusChanged: card => this.handleAnkiStatusChanged(card),
        onApiCardStateChanged: card => {
            this.applyPublicVocabularyToRenderedWords(card, card);
            repaintYomuLocalSrsRenderedWords(card, this.renderedAnnotationRoots());
        },
    });
    private immersionPopoverInstance: InstanceType<KanjiStudyCompanionSlot['ImmersionPopoverController']> | null = null;
    private get immersionPopover(): InstanceType<KanjiStudyCompanionSlot['ImmersionPopoverController']> | null {
        const companion = this.kanjiCompanion;
        const immersionKit = this.immersionKit;
        if (!this.immersionPopoverInstance && companion && immersionKit) {
            this.immersionPopoverInstance = new companion.ImmersionPopoverController({
                getSettings: () => this.settings,
                client: immersionKit,
                audio: this.audio,
                parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
                canParseJapanese: () => this.canParseJapanese(),
                parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
                enrichPitchWords: tokens => this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions()),
                enrichAnkiWords: (tokens, roots) => this.queueAnkiWordEnrichment(tokens, roots ?? [document]),
                repositionPopover: () => this.repositionActivePopover(),
                setImmersionTranslationBlurred: this.setImmersionTranslationBlurred,
                toast: message => this.toast(message),
            });
        }
        return this.immersionPopoverInstance;
    }
    private set immersionPopover(value: InstanceType<KanjiStudyCompanionSlot['ImmersionPopoverController']> | null) {
        this.immersionPopoverInstance = value;
    }
    private audioActions = new ReaderAudioActions({
        audio: this.audio,
        getSettings: () => this.settings,
        getActivePopover: () => this.activePopover,
        getHoverLookupGeneration: () => this.hoverLookupGeneration,
        stopImmersionAudio: () => this.immersionPopover?.stopAudio(),
        toast: message => this.toast(message),
    });
    private floatingButton = new FloatingButtonController();
    private parser = new ReaderParser({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        jiten: this.jiten,
        // Late-bound like getSettings: the public client is swappable state
        // (tests replace it; a future account sign-in may too), and the parser
        // must always consult the app's current one.
        jitenPublicVocabulary: {
            parse: (paragraphs, options) => this.jitenPublicVocabulary.parse(paragraphs, options),
            lookupMany: (terms, options) => this.jitenPublicVocabulary.lookupMany(terms, options),
        },
        // Also late-bound: the store the app holds is replaceable — the inert
        // placeholder upgrades when the settings-surface companion registers,
        // and the extension build resolves its backend on first use — so the
        // parser must read through to whatever the app currently holds. The
        // proxy also keeps capability probes honest: a method absent on the
        // current store stays absent here.
        dictionaries: new Proxy({} as YomitanDictionaryStore, {
            get: (_target, property) => {
                const store = this.dictionaries as unknown as Record<PropertyKey, unknown>;
                const value = store[property];
                return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(this.dictionaries) : value;
            },
            has: (_target, property) => property in (this.dictionaries as object),
        }),
        yomuLocalSrs: this.yomuLocalSrs,
    });
    private onboarding = this.createOnboardingController();
    private subtitles = this.createSubtitlePlayer();
    private ocr: ImageOcrController = this.createImageOcrController();
    private youtube = this.createYoutubeFilter();
    private pageScanner = new VisiblePageScanner({
        getSettings: () => this.settings,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        pauseMutationObserver: callback => this.pauseAutoScanObserver(callback),
        preloadParsedTokens: tokens => this.preloadParsedTokens(tokens),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions()),
        enrichAnkiWords: (tokens, roots) => this.queueAnkiWordEnrichment(tokens, roots ?? [document]),
        beginAnkiWordEnrichment: tokens => this.beginAnkiWordEnrichment(tokens),
        prepareAnkiWordEnrichmentBeforeRender: tokens => this.prepareAnkiWordEnrichmentBeforeRender(tokens),
        prepareSubtitleTokensBeforeRender: tokens => this.enrichSubtitleTokensBeforeRender(tokens),
        reconcileResolvedWordEffects: (tokens, roots) => this.queueResolvedWordEffects(tokens, roots),
        noteRenderedRoots: roots => roots.forEach(root => this.registerRenderedWordsInRoot(root)),
        refreshWordContrast: root => refreshReaderWordContrast(root),
        toast: message => this.toast(message),
    });
    private unsubscribeCardStateSignals?: () => void;
    private unsubscribeSettingsStorageChanges?: () => void;
    private disposeMokuroOcrToggleWatch?: () => void;
    private disposeJpdbReviewBridge?: () => void;
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

    private activeBunproFrontendApiToken(): string {
        return isBunproFrontendCredentialExpired(this.settings)
            ? ''
            : effectiveBunproFrontendApiToken(this.settings);
    }
    private activePopover?: HTMLElement;
    private activeBackdrop?: HTMLElement;
    private readonly lookupModal = new (yomuSettingsSurfaceCompanion()!.LookupModalAccessibility!)();
    private lastCard?: JPDBCard;
    private lastCardSentence?: string;
    private lastAnkiLookup?: AnkiLookupResult;
    private autoScanTimer?: number;
    private autoScanDeadline = 0;
    private autoScanForced = false;
    // Whether the pending timer was set by a debounced request; only such
    // timers may be pushed out by later debounced requests.
    private autoScanDebounced = false;
    // When the current debounce chain began — every push-out is capped at
    // AUTO_SCAN_DEBOUNCE_MAX_WAIT_MS past this, so busy pages still scan.
    private autoScanDebounceStartedAt = 0;
    // TTL-cached hasVisibleAutoScanWork verdict: the un-cached check runs a
    // limit-1 profile-root sweep, which a YouTube mutation burst re-ran many
    // times per second (~1.3% of core CPU in the heat profile).
    private visibleAutoScanWorkVerdict?: { at: number; verdict: boolean };
    // When the most recent scheduled scan started, used to throttle the
    // steady-state mutation storm from YouTube's comment/sidebar re-renders
    // (5-10 childList mutations/sec) into a bounded scan cadence.
    private lastAutoScanStartedAt = 0;
    private autoScanObserver?: MutationObserver;
    private documentBodyObserver?: ParkableObserver<Node, MutationObserverInit> | null;
    private observedDocumentBody?: HTMLElement;
    private documentBodyRecoveryPending = false;
    private disposeShadowRootDiscovery?: () => void;
    private lastMirrorStaleScanAt = 0;
    private readonly handleNonDestructiveMirrorStale = () => {
        if (!this.canParseJapanese()) return;
        // No debounce (a debounced deadline pushed forward on every event
        // starves the rescan past the 600ms stale-mirror grace and the mirror
        // flaps) — but throttled: surfaces that churn continuously (live-chat
        // messages, live view counters) would otherwise force a full page
        // rescan every few hundred ms for as long as the stream runs. The
        // first stale refreshes inside the grace window; sustained churn
        // backs off, letting the grace teardown restore native text until
        // the next throttled scan re-decorates it.
        const now = Date.now();
        const baseDelay = visibleAutoScanMutationDelay();
        const throttled = Math.max(baseDelay, this.lastMirrorStaleScanAt + MIRROR_STALE_SCAN_MIN_INTERVAL_MS - now);
        this.lastMirrorStaleScanAt = now + throttled;
        this.scheduleAutoScan(throttled, { force: true });
    };
    private asbScanTimer?: number;
    private hoverLookupTimer?: number;
    private readonly hoverClose = new HoverCloseController(domHoverCloseTimers, {
        isHoverPopoverActive: () => this.activePopoverMode === 'hover',
        closeDelayMs: () => this.settings.hoverCloseDelayMs,
        isHoverContextActive: query => this.isHoverContextActive(query),
        close: () => this.dismiss({
            suppressHoverTarget: false,
            deferSubtitleMiningResume: this.shouldDeferSubtitleMiningResumeForHoverClose(),
        }),
    });
    private hoverResizeStickyPointer?: { x: number; y: number };
    private hoverResizeStickyExpiry = 0;
    private hoverPendingWord?: HTMLElement;
    private hoverPendingLookupKey = '';
    private hoverLookupInFlightKey = '';
    private hoverLookupGeneration = 0;
    private activeHoverWord?: HTMLElement;
    private activeHoverLookupKey = '';
    private releaseActiveOcrLookupLine?: () => void;
    private ownedModalOcrPin?: HTMLElement;
    private activePointerTextLookup?: ActivePointerTextLookup;
    private suppressedHoverWord?: HTMLElement;
    private suppressedHoverLookupKey = '';
    private activePopoverMode?: 'modal' | 'hover';
    // The video we paused when a subtitle word was clicked, so closing the
    // lookup popover resumes exactly that video (and only if it is still paused).
    private subtitleMiningPausedVideo?: HTMLVideoElement;
    private activePlainSubtitleHoverSurface?: Element;
    // One-shot guard that re-pauses the mined video if the page re-plays it right
    // after our pause (YouTube player quirks or a competing extension/userscript).
    private miningPauseReassert?: { video: HTMLVideoElement; off: () => void };
    private subtitleHoverMiningResumeTimer?: number;
    private activePopoverAnchor?: HTMLElement;
    private activePopoverAnchorRect?: DOMRect;
    private keyboardActiveWord?: HTMLElement;
    private activePopoverPositionLocked = false;
    private activePopoverLockedPosition?: { left: number; top: number };
    private activePopoverResizeObserver?: ResizeObserver;
    private readonly nativeTitleGuard = new NativeTitleGuard();
    private lastPointerPosition?: { x: number; y: number };
    private readonly hoverWordOwnership = new HoverWordOwnership({
        wordFromPointStack: (x, y) => this.hoverReaderWordFromPointStack(x, y),
        ocrLineWordForPointer: (target, x, y) => this.ocrLineWordForPointer(target, x, y),
        wordFromRenderedGeometry: (target, x, y) => this.readerWordFromRenderedGeometry(
            target,
            x,
            y,
            word => this.canHoverLookupReaderWord(word),
        ),
    });
    private hoverPopoverPointerPosition?: { x: number; y: number };
    // Set by the popover's own `pointerenter`, cleared only by a real exit event.
    // See hasLatchedHoverPopoverPointer for why the watchdog must not re-derive
    // this from geometry once the learner's cursor is genuinely inside the panel.
    private hoverPopoverPointerLatched = false;
    private hoverPointerMoveFrame?: number;
    private pendingHoverPointerMove?: PointerEvent;
    private popoverRepositionFrame?: number;
    private popoverViewportChangePending = false;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private pendingPreferredJapaneseSiteLanguage?: boolean;
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private lastAutoAudioHoverGeneration?: number;
    private cardRenderRequest = 0;
    private cardLookup: ReaderCardLookupSession = new ReaderCardLookupSession({
        getSettings: () => this.settings,
        parser: () => this.parser,
        jpdbVocabulary: () => this.jpdbVocabulary,
        jiten: () => this.jiten,
        jitenPublicVocabulary: () => this.jitenPublicVocabulary,
        isJitenApiActive: () => this.isJitenApiActive(),
        lookupLocalEntries: selected => this.localLookupEntries(selected),
        textLookupDisplayState: () => ({
            activePopoverAnchor: this.activePopoverAnchor,
            defaultTrigger: this.activeTextLookupTrigger(),
            hasActivePopover: Boolean(this.activePopover),
            previousNavigationEntry: (trigger, navigation) => this.textLookupPreviousNavigationEntry(trigger, navigation),
        }),
        showCard: (card, sentence, anchor, options) => void this.showCard(card, sentence, anchor, options),
        showTokenList: (tokens, selected, anchor, options) => this.showTokenList(tokens, selected, anchor, options),
        toast: message => this.toast(message),
        onTargetChange: () => {
            this.cardRenderRequest += 1;
            this.deferredPublicJitenReadings.clear();
            this.cancelPendingHoverLookup();
            if (this.activePopover && !this.activePopover.classList.contains('jpdb-reader-settings')) {
                this.dismiss({ suppressHoverTarget: false });
            }
        },
        log,
    });
    private dictionaryRescanPending = false;
    private visiblePageReparseTimer?: number;
    private jpdbPageEnhanceTimer?: number;
    private jpdbPageEnhanceDeadline = 0;
    private jpdbPageEnhancementGeneration = 0;
    private lastEnhancedHref = '';
    private lastJitenStudyHeadword = '';
    private lastJitenImmersionPrefetchHeadword = '';
    private pendingReviewTargetSignature = '';
    private pendingReviewTargetReadyAt = 0;
    private nearbyReaderAudioPreloadTimer?: number;
    private preloadedTermAudioKeys = new Set<string>();
    private preloadedPreparedTermAudioKeys = new Set<string>();
    private nestedParseContentCache = new Map<string, NestedParseContentCacheEntry>();
    private pageAddonParseStates = new WeakMap<HTMLElement, PageAddonParseState>();
    private pitchEnrichmentLocalCache = new Map<string, Promise<LocalPitchResolution>>();
    private localPitchDictionaryAvailability?: Promise<boolean>;
    private resolvedFallbackVocabularyCache = new Map<string, JPDBCard>();
    // key -> retry-after timestamp. Misses EXPIRE (instead of persisting for
    // the page's whole lifetime) because a miss can be transient — a timed-out
    // /info over a slow userscript bridge, or a lookup issued during endpoint
    // backoff — and a permanent mark left most of a text-heavy page without
    // readings/pitch forever (the yomureader.com homepage was the canary).
    private unresolvedFallbackVocabularyCache = new Map<string, number>();
    private publicVocabularyMissRetries = new Map<string, number>();
    private misalignedPublicFuriganaRecoveries = new Set<string>();
    private fallbackVocabularyResolutionCache = new Map<string, Promise<JPDBCard>>();
    private renderedWords = new RenderedWordIndex({
        isDestroyed: () => this.isDestroyed,
        annotationRoots: roots => this.renderedAnnotationRoots(roots),
    });
    private renderedWordIndex = this.renderedWords.entries;
    private lateCardReconciliation = new LateCardReconciliation({
        isDestroyed: () => this.isDestroyed,
        getSettings: () => this.settings,
        getLocalSrs: () => this.yomuLocalSrs,
        renderedWordsForCardStateRepaint: card => this.renderedWords.wordsForCardStateRepaint(card),
        resetRenderedWordRepaintCycle: () => this.renderedWords.resetRepaintCycle(),
        pauseMutationObserver: callback => this.pauseAutoScanObserver(callback),
        applyVocabulary: (word, card, pitchClass) => this.applyPublicVocabularyToRenderedWord(word, card, pitchClass),
        reconcileInteractiveVocabulary: (word, card, pitchClass) => this.ocr.reconcileRenderedWordVocabulary(word, card, pitchClass),
        annotationRoot: word => this.lateAnnotationRootForRenderedWord(word),
        scheduleAnnotationRefresh: (roots, geometryRoots) => this.pageScanner.scheduleLateAnnotationRefresh(roots, geometryRoots),
        registerRenderedRoot: root => this.registerRenderedWordsInRoot(root),
        preloadAudio: tokens => this.preloadTermAudioForTokens(tokens),
        queueAnki: (tokens, roots) => this.queueAnkiWordEnrichment(tokens, roots),
    });
    // Known-state backfill (Cluster I1) scheduling + dedupe state. Deduped by
    // surface (not vid/sid): the words that need this most were parsed by the
    // LOCAL/segmented fallback and carry negative hash ids, so only a fresh
    // authenticated surface parse can resolve their real Jiten SRS state.
    private knownStateBackfillTimer?: number;
    private knownStateBackfillRunning = false;
    private knownStateBackfillBackoffUntil = 0;
    private knownStateBackfillRequestedForUrl = '';
    private readonly knownStateBackfillRequestedSurfaces = new Set<string>();
    // Surfaces that resolved to a real authenticated card this URL. A recycler
    // that re-renders the same text as a fresh provisional word is re-upgraded
    // from here without a second parse.
    private readonly knownStateBackfillResolvedCards = new Map<string, JPDBCard>();
    private pitchEnrichmentQueue: JPDBToken[] = [];
    private pitchEnrichmentQueuedKeys = new Set<string>();
    private pitchEnrichmentUrgentKeys = new Set<string>();
    private pitchEnrichmentQueuedOptions = new Map<string, Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>>();
    private pitchEnrichmentDrain?: Promise<void>;
    private deferredPublicPitchQueue: JPDBToken[] = [];
    private deferredPublicPitchQueuedKeys = new Set<string>();
    private deferredPublicPitchEnqueuedForUrl = 0;
    private deferredPublicPitchDrain?: Promise<void>;
    private deferredPublicJitenReadings = new DeferredPublicJitenReadingCoordinator({
        isDestroyed: () => this.isDestroyed,
        shouldEnrich: () => this.shouldRunCanonicalCardEnrichment(),
        captureTarget: () => this.cardLookup.captureTarget(),
        lookupCards: (cards, scope) => this.cardLookup.publicLookupHydratableJitenCards(cards, scope),
        applyResolvedCard: (token, fallback, card, pitchClass) =>
            this.applyResolvedPitchCardToToken(token, fallback, card, pitchClass),
        queueSubtitleRefresh: sentence => this.queueSubtitleParsedHtmlRefresh(sentence),
        cacheCards: cards => this.parser.cacheCards?.(cards),
        scheduleDeferredPitch: tokens => this.scheduleDeferredPublicPitchEnrichment(tokens),
        showPitchAccent: () => this.settings.showPitchAccent,
        hasUnresolvedFallback: key => this.hasUnresolvedFallbackVocabulary(key),
        rememberUnresolvedFallback: key => this.rememberUnresolvedFallbackVocabulary(key),
        forgetUnresolvedFallback: key => this.unresolvedFallbackVocabularyCache.delete(key),
        shouldPauseBackground: () => this.shouldPauseBackgroundPublicPitchLookup({}),
        waitForIdle: timeoutMs => this.waitForIdle(timeoutMs),
        renderedAnnotationRoots: () => this.renderedAnnotationRoots(),
        renderedWordToken: word => this.renderedWordTokenForRecolor(word),
    });
    private backgroundPublicPitchLookupBudgetHref = location.href;
    private backgroundPublicPitchLookupBudgetUsed = 0;
    private pendingSubtitleRebakeTexts = new Set<string>();
    private subtitleRebakeTimer?: number;
    private cachedPublicVocabularyHydrationTimer?: number;
    private pressedKeys = new Set<string>();
    private hoverAnchorIds = new WeakMap<HTMLElement, number>();
    private nextHoverAnchorId = 1;
    private suppressWordClickUntil = 0;
    private suppressPenHoverUntil = 0;
    private pageHasJapaneseText = false;
    private embeddedFrame = false;
    private pressLookup?: PressLookupState;
    private tapLookup?: { id: number; x: number; y: number; word?: HTMLElement };
    private linkPressLookup?: { id: number; x: number; y: number; word: HTMLElement; timer: number };
    private suppressLinkContextMenuUntil = 0;
    private suppressMiddleAuxClickUntil = 0;

    constructor(private readonly persistSettings: typeof saveSettings = saveSettings, private readonly observesSettingsStorage = true) {
        configureLogger({ settingsProvider: () => this.settings });
    }
    private createOnboardingController() {
        const Controller = yomuOnboardingController();
        if (!Controller) return undefined;
        return new Controller({
            getSettings: () => this.settings, saveSettings: (settings, options) => this.persistSettings(settings, options),
            setSettings: settings => {
                const previous = this.settings;
                this.settings = settings;
                if (settings.learningTargetChosen) this.syncCardLookupTarget(settings);
                this.applyTheme();
                if (settings.learningTargetChosen) this.stagePreferredJapaneseSiteLanguage(previous, settings);
            },
            showSettings: panel => this.showSettings(panel),
            parseJapanese: panel => void this.parseOnboardingJapanese(panel),
            lookupText: (text, sentence, anchor) => this.lookupText(text, sentence || text, { anchor, stackOverSettings: true }),
            installOfflineDictionaries: () => void this.offlineDictionaries.run(),
            onComplete: settings => this.completePreferredJapaneseSiteLanguageSave(settings),
            onPersistenceFailed: settings => this.rollbackOnboardingSettings(settings),
        });
    }

    private createSubtitlePlayer() {
        const Controller = yomuSubtitlePlayerController();
        if (!Controller) return {
            ...this.missingCompanionSurface('Video companion', 'subtitles'),
            hasDiscoverableVideoCandidate: () => false,
        };
        return new Controller({
            getSettings: () => this.settings,
            ...this.targetTextParserDependencies(),
            beforeRenderTokens: tokens => this.enrichSubtitleTokensBeforeRender(tokens),
            afterParseTokens: (tokens, roots) => this.afterSubtitleJapaneseParsed(tokens, roots),
            showBatchMiningCard: candidate => this.showCard(candidate.card, candidate.sentence, undefined, {
                autoPlay: false,
                trigger: 'modal',
                navigation: 'push-current',
            }),
            mineBatchMiningCandidates: candidates => this.cardActions.addBatchMiningCards(candidates),
            gradeBatchMiningCandidates: (candidates, grade) => this.cardActions.reviewBatchMiningCards(candidates, grade),
            toast: message => this.toast(message),
            onTranscriptPanelClosed: () => this.scheduleVisiblePageRescan(),
            onSettingsChange: (explicitUserChoiceKeys, clearExplicitUserChoiceKeys) => void this.persistSettings(this.settings, {
                explicitUserChoiceKeys,
                clearExplicitUserChoiceKeys,
            }),
        });
    }

    private targetTextParserDependencies() {
        return {
            parseJapanese: async (text: string, options: Parameters<typeof this.parseJapanese>[1]) =>
                (await this.parseJapanese([text], options))[0] ?? [],
            parseJapaneseBatch: (texts: string[], options: Parameters<typeof this.parseJapanese>[1]) => this.parseJapanese(texts, options),
        };
    }

    private createYoutubeFilter(): YoutubeImmersionFilterInstance | ReaderLifecycleSurface {
        const Controller = yomuYoutubeImmersionFilter();
        if (!Controller) return this.missingCompanionSurface('Video companion', 'youtube');
        return new Controller({
            getSettings: () => this.settings,
            setShowFilterNotice: visible => void this.setYoutubeFilterNoticeVisible(visible),
            setShowChannelRecommendations: visible => void this.setYoutubeChannelRecommendationsVisible(visible),
            parseShelfJapanese: root => void this.parseYoutubeShelfJapanese(root),
            scheduleAnnotationLayoutRefresh: () => scheduleProjectedAnnotationLayoutRefresh(),
        });
    }

    private async parseYoutubeShelfJapanese(root: HTMLElement): Promise<void> {
        if (!root.isConnected) return;
        const plan = nestedTextParsePlan(root, 160);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(root, plan, () => root.isConnected);
    }

    private createImageOcrController(): ImageOcrController {
        const Controller = yomuImageOcrController();
        if (!Controller) {
            log.warnOnce('ocr-companion-missing', 'OCR companion missing.');
            return createNoopImageOcrController();
        }
        return new Controller({
            getSettings: () => this.settings,
            ...this.targetTextParserDependencies(),
            onToast: message => this.toast(message),
            shouldAutoScan: () => shouldAutoScanImageOcr(this.pageHasJapaneseText),
            shouldScanInlineImages: () => true,
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

    async init(options: ReaderAppInitOptions = {}): Promise<void> {
        const done = log.time('init', { href: location.href, devMode: Logger.isDevMode() });
        try {
            this.settingsSurface = options.settingsSurface;
            this.embeddedFrame = options.embeddedFrame === true;
            const shouldShowWelcome = await this.loadInitialSettings(options);
            if (!this.canContinueStartup(shouldShowWelcome)) return;
            const surfacesReady = await this.initializeReaderSurfaces(shouldShowWelcome);
            if (!surfacesReady) return;
            publishPrivateSettingsChange({ settings: this.settings });
        } finally {
            done();
        }
    }

    private canContinueStartup(startupResult: boolean | null = false): startupResult is boolean {
        return startupResult !== null && !this.isDestroyed;
    }

    private async initializeReaderSurfaces(shouldShowWelcome: boolean): Promise<boolean> {
        await this.installCoreSurfaces();
        if (!this.canContinueStartup()) return false;
        await this.initReaderPage(shouldShowWelcome);
        return this.canContinueStartup();
    }

    private async waitForDocumentBody(): Promise<void> {
        if (document.body || this.isDestroyed) return;
        await new Promise<void>(resolve => {
            let timer: number | undefined;
            const abortSignal = this.abortController.signal;
            let check: () => void = () => undefined;
            const cleanup = (): void => {
                if (timer !== undefined) window.clearTimeout(timer);
                document.removeEventListener('DOMContentLoaded', check);
                abortSignal.removeEventListener('abort', check);
            };
            check = (): void => {
                if (document.body || this.isDestroyed) {
                    cleanup();
                    resolve();
                    return;
                }
                timer = window.setTimeout(check, 25);
            };
            document.addEventListener('DOMContentLoaded', check, { once: true });
            abortSignal.addEventListener('abort', check, { once: true });
            timer = window.setTimeout(check, 0);
        });
    }

    private async loadInitialSettings(options?: ReaderAppInitOptions): Promise<boolean | null> {
        const startup = await loadReaderStartupSettings(options);
        // Ownership can move to another runtime while browser storage is still
        // resolving. Do not bind controllers, restore styles, or publish state
        // after destroy() has already completed its one cleanup pass.
        if (this.isDestroyed) return null;
        this.factoryReset.bind();
        this.settings = startup.settings;
        this.pageOwnedLearningTargetActive = startup.pageOwnedLearningTarget !== null;
        if (startup.settings.learningTargetChosen) {
            this.syncCardLookupTarget(startup.settings);
            this.applyPreferredJapaneseSiteLanguage();
        }
        configureLogger({ forceEnabled: this.settings.enableLogging });
        this.pageHasJapaneseText = this.hasLearningTargetRuntimePolicy()
            ? detectReaderStartupJapaneseText()
            : false;
        log.info('Settings loaded', startup.settingsSummary);
        return startup.shouldShowWelcome;
    }

    private async installCoreSurfaces(): Promise<void> {
        this.installStyles();
        this.applyTheme();
        // A requested all-sites purge must delete this origin's dictionary
        // copy before anything opens the database — our own connection would
        // otherwise block the deletion on every visit. One shared-storage read
        // when no purge is pending.
        await honorDictionaryReplicaPurge().catch((error: unknown) => log.debug('Dictionary replica purge check failed', error));
        // Local dictionary CSS is an enhancement, not a prerequisite for the
        // reader controls. Opening the dictionary IndexedDB can be delayed by
        // browser storage startup (notably in userscript page contexts), and
        // awaiting it here used to hold back the FAB and subtitle rail with no
        // visible sign that Yomu had loaded.
        if (this.hasLearningTargetRuntimePolicy()) this.installTargetOwnedCoreSurfaces();
    }

    private installTargetOwnedCoreSurfaces(): void {
        if (this.targetOwnedCoreInstalled) return;
        this.targetOwnedCoreInstalled = true;
        this.installTargetOwnedStorageSurfaces();
        if (!this.embeddedFrame) this.installTopLevelCoreSurfaces();
    }

    private installTargetOwnedStorageSurfaces(): void {
        void this.refreshDictionaryStyles();
        if (this.observesSettingsStorage) this.installSettingsStorageSubscription();
    }

    private installTopLevelCoreSurfaces(): void {
        this.registerMenuCommands();
        this.bindEvents();
        this.disposeJpdbReviewBridge?.();
        this.disposeJpdbReviewBridge = installReaderStartupBridge();
    }

    private async initReaderPage(shouldShowWelcome: boolean): Promise<void> {
        await this.waitForDocumentBody();
        if (!this.canInitializeReaderPage()) return;
        if (this.embeddedFrame) {
            this.initEmbeddedReaderPage();
            return;
        }
        await this.initTopLevelReaderPage(shouldShowWelcome);
    }

    private canInitializeReaderPage(): boolean {
        return !this.isDestroyed && Boolean(document.body);
    }

    private initEmbeddedReaderPage(): void {
        // Embedded frames cannot host the required first-run chooser. Until the
        // top-level realm records a target, they must remain entirely inert.
        if (!this.hasLearningTargetRuntimePolicy()) return;
        this.captureStartupTargetProbe();
        this.subtitles.init();
        // Player iframes need OCR too: the subtitle rail's OCR button and
        // paused-frame OCR dispatch/listen inside this frame's document.
        this.ocr.init();
        // Sign-in widgets and other compact embedded controls often boot
        // with a Latin placeholder and localise to Japanese later. Every
        // frame gets the same mutation-driven scanner, but an initial scan
        // is still scheduled only when Japanese is already present (or for
        // the existing YouTube chat surface). Without the observer, a
        // Latin -> Japanese characterData mutation was invisible forever.
        this.setupAutoScan();
        if (this.shouldScanEmbeddedFrame() || this.pageHasJapaneseText) this.scheduleVisiblePageRescan();
    }

    private async initTopLevelReaderPage(shouldShowWelcome: boolean): Promise<void> {
        if (!await this.ensureTopLevelLearningTarget(shouldShowWelcome)) {
            this.installDormantLearningTargetSubscription();
            return;
        }
        if (!this.topLevelTargetLifecycle.beginTargetOwnedSurfaces(this.isDestroyed, this.embeddedFrame, this.hasLearningTargetRuntimePolicy())) return;
        this.installTargetOwnedCoreSurfaces();
        // The chosen target owns this bounded composed-DOM probe. Running it
        // before onboarding used to scan 200k characters for the compatibility
        // Japanese fallback even though the learner had selected nothing.
        const startupTargetProbe = this.captureStartupTargetProbe();
        this.installFab();
        void this.installBunproTokenImporter();
        this.subtitles.init();
        this.ocr.init();
        // mokuro's own "OCR enabled" toggle lives outside the reader's settings;
        // when the user flips it, re-evaluate whether to defer to mokuro's text
        // layer or run the reader's own OCR (no-op off mokuro hosts).
        this.disposeMokuroOcrToggleWatch?.();
        this.disposeMokuroOcrToggleWatch = watchMokuroOcrToggle(() => this.ocr.reassessAutoScan());
        this.youtube.init();
        this.setupAutoScan();
        this.initJpdbPageEnhancements();
        this.installCardStateSignalSubscription();
        installAcademyReaderSrsSync();
        this.resumePendingCloudSettingsSync();
        this.scheduleInitialReaderWork(startupTargetProbe.shadowDiscoveryExhausted);
    }

    private async ensureTopLevelLearningTarget(shouldShowWelcome: boolean): Promise<boolean> {
        if (this.hasLearningTargetRuntimePolicy()) return true;
        if (shouldShowReaderOnboarding(shouldShowWelcome)) await this.runOnboardingIfAvailable();
        return !this.isDestroyed && this.hasLearningTargetRuntimePolicy();
    }

    private async runOnboardingIfAvailable(): Promise<void> {
        const onboarding = this.onboarding;
        if (!onboarding) return;
        await onboarding.showIfNeeded();
        await onboarding.waitForCompletion();
    }

    private captureStartupTargetProbe(): ReturnType<typeof documentJapaneseTextProbe> {
        const probe = documentJapaneseTextProbe(200000, scanScopeRoots());
        if (!this.pageHasJapaneseText) this.pageHasJapaneseText = probe.hasJapanese;
        return probe;
    }

    private scheduleInitialReaderWork(shadowDiscoveryUncertain: boolean): void {
        if (this.shouldScanInitialPage(shadowDiscoveryUncertain)) {
            void this.pageScanner.scanVisiblePage({ silent: true })
                .finally(() => this.scheduleStatusWarmups());
        } else {
            this.scheduleStatusWarmups();
        }
    }

    private async installBunproTokenImporter(): Promise<void> {
        await this.bunproCompanion?.installBunproFrontendTokenImporter({
            getSettings: () => this.settings,
            setSettings: settings => { this.settings = settings; },
            saveSettings: (settings, options) => this.persistSettings(settings, options),
            toast: message => this.toast(message),
            language: () => this.settings.interfaceLanguage,
        });
    }

    // Cross-tab card-state mutation bus: grading or mining a card in another
    // tab (e.g. the new tab) recolors this page's rendered occurrences of the
    // same card immediately, without a rescan.
    private installCardStateSignalSubscription(): void {
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = subscribeToCardStateSignals(card => {
            if (this.isDestroyed) return;
            this.applyPublicVocabularyToRenderedWords(card, card);
            repaintYomuLocalSrsRenderedWords(card, this.renderedAnnotationRoots());
        });
    }

    private installSettingsStorageSubscription(): void {
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = subscribeToReaderSettingsChanges(settings => {
            if (!this.isDestroyed) void this.applyRemoteSettings(settings);
        });
    }

    private installDormantLearningTargetSubscription(): void {
        if (!this.topLevelTargetLifecycle.canWaitForTarget(this.isDestroyed, this.embeddedFrame, this.hasLearningTargetRuntimePolicy())) return;
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = subscribeToFirstPersistedLearningTarget(
            () => this.settings,
            settings => { if (!this.isDestroyed) void this.applyRemoteSettings(settings); },
        );
    }

    private async applyRemoteSettings(settings: ReaderSettings): Promise<void> {
        const wakesTopLevelTarget = shouldWakeTopLevelTarget(this.embeddedFrame, this.hasLearningTargetRuntimePolicy(), settings);
        const pauseChanged = settings.annotationsPaused !== this.settings.annotationsPaused;
        // Turning the preference off in another tab is still the user turning it
        // off here, so this tab leaves its Japanese URL as well instead of staying
        // Japanese until its next reload.
        const japaneseSiteOptOut = japaneseSiteLanguageDisabled(this.settings, settings);
        this.pendingPreferredJapaneseSiteLanguage = undefined;
        this.settings = settings;
        if (settings.learningTargetChosen) this.syncCardLookupTarget(settings);
        configureLogger({ forceEnabled: settings.enableLogging });
        this.applyPreferredJapaneseSiteLanguage(settings, japaneseSiteOptOut);
        this.applyTheme(settings);
        this.applyWordColors(settings);
        const initializedTarget = await applyTargetSurfaceSettingsChange(
            wakesTopLevelTarget, this.embeddedFrame,
            () => this.initTopLevelReaderPage(false), () => this.installFab(),
            () => { this.subtitles.refresh(); this.ocr.refresh(); this.youtube.refresh(); },
        );
        if (pauseChanged) this.applyAnnotationsPausedState();
        this.clearBridgeBackedCaches();
        if (!initializedTarget) {
            this.scheduleDictionaryRescan();
            await this.refreshDictionaryStyles();
        }
        publishPrivateSettingsChange({ settings, remote: true });
    }

    private syncCardLookupTarget(settings: ReaderSettings): void {
        adoptLearningTargetFromSettings(settings);
        this.cardLookup.syncTarget(settings);
    }

    private hasLearningTargetRuntimePolicy(): boolean {
        return this.settings.learningTargetChosen || this.pageOwnedLearningTargetActive;
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

    private scheduleStatusWarmups(): void {
        this.scheduleAnkiStatusWarmup();
        this.scheduleBunproWordStateWarmup();
        this.scheduleReaderKnownStateBackfill();
    }

    private scheduleBunproWordStateWarmup(): void {
        if (!this.shouldRunBunproWordStateWork()) return;
        window.setTimeout(() => this.queueBunproWordStateEnrichment([document]), BUNPRO_WORD_STATE_WARMUP_DELAY_MS);
    }

    private shouldRunBunproWordStateWork(): boolean {
        return !this.isDestroyed
            && usesJapaneseProviders()
            && shouldLookupBunproWordStates(this.settings);
    }

    private queueBunproWordStateEnrichment(roots: ParentNode[] = [document]): void {
        // Every token-producing scan funnels through here, so it doubles as the
        // single post-scan choke point that arms the authenticated known-state
        // backfill — independent of Bunpro settings, hence before the guard.
        this.scheduleReaderKnownStateBackfill();
        if (!this.shouldRunBunproWordStateWork()) return;
        void this.applyBunproWordStatesToRoots(roots).catch(error => {
            log.warnOnce('bunpro-word-state-coloring-failed', 'Bunpro word-state coloring failed', error);
        });
    }

    // Fills provider-untracked rendered words (not-in-deck) with the user's
    // Bunpro SRS state so pages colour like they do for jpdb/jiten users.
    private async applyBunproWordStatesToRoots(roots: ParentNode[]): Promise<void> {
        const bunproCompanion = this.bunproCompanion;
        if (!bunproCompanion || !this.bunproWordStates) return;
        const states = await this.bunproWordStates.load();
        if (!states?.size || !this.shouldRunBunproWordStateWork()) return;
        const now = Date.now();
        const changedWords: HTMLElement[] = [];
        this.pauseAutoScanObserver(() => {
            uniqueParentNodes(roots).forEach(root => {
                renderedWordsInRoot(root).forEach(word => {
                    const entry = word.dataset.expression ? states.get(word.dataset.expression) : undefined;
                    const state = entry ? bunproCompanion.effectiveBunproWordState(entry, now) : null;
                    if (applyBunproStateToRenderedWord(word, state)) changedWords.push(word);
                });
            });
        });
        if (!changedWords.length) return;
        // A late authenticated state can change which content word is the sole
        // unknown in a sentence. Route only changed sentence scopes through the
        // shared fixed-window semantic/contrast pass; Bunpro changes no ruby.
        const changedRoots = uniqueParentNodes(changedWords.map(word => this.lateAnnotationRootForRenderedWord(word)));
        this.pageScanner.scheduleLateAnnotationRefresh(changedRoots, []);
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

    private shouldScanInitialPage(shadowDiscoveryUncertain = false): boolean {
        if (this.settings.annotationsPaused || this.settings.manualScanEnabled) return false;
        return this.canParseJapanese()
            && (this.pageHasJapaneseText || hasVisibleSiteScanTargets() || shadowDiscoveryUncertain);
    }

    private registerMenuCommands(): void {
        registerReaderMenuCommands({
            cycleOcr: () => this.cycleOcrMode(),
            getSettings: () => this.settings,
            saveSettings: (settings, explicitUserChoiceKeys) => this.persistSettings(settings, { explicitUserChoiceKeys }),
            installFloatingButton: () => this.installFab(),
            showSettings: () => this.showSettings(),
            toggleAnnotations: () => this.toggleAnnotationsPaused(),
            toggleAudio: () => this.toggleAutoPlayAudio(),
            toggleSiteLanguage: () => this.togglePreferredJapaneseSiteLanguage(),
            toggleYoutube: () => this.toggleYoutubeImmersion(),
            factoryReset: () => void this.factoryReset.resetAllData(),
            logInfo: (message, details) => {
                log.info(message, details);
            },
        });
    }

    private async toggleYoutubeImmersion(): Promise<void> {
        await this.setYoutubeImmersionEnabled(!this.isYoutubeImmersionEnabled());
    }

    private async setYoutubeImmersionEnabled(enabled: boolean): Promise<void> {
        const previous = this.settings.youtubeImmersionEnabled;
        const previousChosen = this.settings.youtubeImmersionEnabledChosen;
        this.settings.youtubeImmersionEnabled = enabled;
        this.settings.youtubeImmersionEnabledChosen = true;
        // Respond on screen before persisting: settings writes can stall for
        // hundreds of ms on iPad userscript managers, and the puck toggle
        // must not feel dead while the filter is busy (2026-07-11 report).
        this.youtube.refresh();
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'youtubeToggleToastOn' : 'youtubeToggleToastOff'));
        try {
            await this.persistSettings(this.settings, {
                explicitUserChoiceKeys: ['youtubeImmersionEnabled', 'youtubeImmersionEnabledChosen'],
            });
        } catch (error) {
            this.settings.youtubeImmersionEnabled = previous;
            this.settings.youtubeImmersionEnabledChosen = previousChosen;
            this.youtube.refresh();
            this.toast(uiText(this.settings.interfaceLanguage, 'settingsSaveFailed'));
            throw error;
        }
    }

    private isYoutubeImmersionEnabled(): boolean {
        return jpOnlyOn(
            this.settings,
            this.settings.youtubeImmersionEnabled,
            this.settings.youtubeImmersionEnabledChosen,
        );
    }

    private async setYoutubeFilterNoticeVisible(visible: boolean): Promise<void> {
        this.settings.youtubeShowFilterNotice = visible;
        await this.persistSettings(this.settings, { explicitUserChoiceKeys: ['youtubeShowFilterNotice'] });
        this.youtube.refresh();
    }

    private async togglePreferredJapaneseSiteLanguage(): Promise<void> {
        await this.setPreferredJapaneseSiteLanguage(!this.settings.preferJapaneseSiteLanguage);
    }

    private async setPreferredJapaneseSiteLanguage(enabled: boolean): Promise<void> {
        const previous = this.settings.preferJapaneseSiteLanguage;
        if (previous === enabled) return;
        this.settings.preferJapaneseSiteLanguage = enabled;
        const save = this.persistSettings(this.settings, {
            persistPreferredJapaneseSiteLanguage: true,
            explicitUserChoiceKeys: ['preferJapaneseSiteLanguage'],
        });
        // Cancel an already-armed redirect synchronously. The navigation back
        // to the site's default waits for the canonical preference write, so a
        // slow userscript manager cannot unload the page before saving "off".
        if (!enabled) this.applyPreferredJapaneseSiteLanguage(this.settings, false, true);
        try {
            await save;
        } catch (error) {
            this.settings.preferJapaneseSiteLanguage = previous;
            this.applyPreferredJapaneseSiteLanguage(this.settings, false);
            throw error;
        }
        this.applyPreferredJapaneseSiteLanguage(this.settings, !enabled);
    }

    private async setYoutubeChannelRecommendationsVisible(visible: boolean): Promise<void> {
        this.settings.youtubeShowChannelRecommendations = visible;
        this.settings.youtubeShowChannelRecommendationsChosen = true;
        await this.persistSettings(this.settings, {
            explicitUserChoiceKeys: [
                'youtubeShowChannelRecommendations',
                'youtubeShowChannelRecommendationsChosen',
            ],
        });
        this.youtube.refresh();
    }

    private async setInterfaceLanguage(language: InterfaceLanguage): Promise<void> {
        if (this.settings.interfaceLanguage === language) return;
        this.settings.interfaceLanguage = language;
        await this.persistSettings(this.settings, { explicitUserChoiceKeys: ['interfaceLanguage'] });
        this.settingsDialog?.refreshLanguage(language);
        this.clearHostedPageReaderWords();
        this.installFab();
        this.subtitles.refresh();
        this.ocr.refresh();
        this.youtube.refresh();
        this.scheduleLanguageChangeScan();
    }

    private clearHostedPageReaderWords(): void {
        if (!isYomuHostedAppUrl(location.href)) return;
        const count = unwrapReaderWords(document);
        releaseRubyRoomGrowth(document);
        if (count > 0) refreshReaderWordContrast(document);
    }

    private scheduleLanguageChangeScan(): void {
        window.setTimeout(() => {
            if (this.isDestroyed) return;
            this.pageHasJapaneseText = documentHasJapaneseText(200000, scanScopeRoots());
            if (this.shouldScanInitialPage()) this.scheduleVisiblePageReparse(0);
        }, 160);
    }

    private async invalidateRuntimeStoresForFactoryReset(): Promise<void> {
        this.dismiss({ suppressHoverTarget: false });
        this.jpdb.clear();
        this.jitenPublicVocabulary.clear();
        this.parser.clearLocalCache();
        this.dictionarySourceState.clear();
        this.cardRenderData.clear();
        this.preloadedTermAudioKeys.clear();
        this.preloadedPreparedTermAudioKeys.clear();
        this.nestedParseContentCache.clear();
        this.pitchEnrichmentLocalCache.clear();
        this.localPitchDictionaryAvailability = undefined;
        this.jitenPublicVocabulary.clear();
        this.resolvedFallbackVocabularyCache.clear();
        this.unresolvedFallbackVocabularyCache.clear();
        this.publicVocabularyMissRetries.clear();
        this.misalignedPublicFuriganaRecoveries.clear();
        this.fallbackVocabularyResolutionCache.clear();
        this.clearPitchEnrichmentQueue();
        this.pitchEnrichmentUrgentKeys.clear();
        this.lateCardReconciliation.resetPending();
        window.clearTimeout(this.cachedPublicVocabularyHydrationTimer);
        this.cachedPublicVocabularyHydrationTimer = undefined;
        this.pressedKeys.clear();
        window.clearTimeout(this.nearbyReaderAudioPreloadTimer);
        this.nearbyReaderAudioPreloadTimer = undefined;
        this.cardRenderRequest++;
        await this.dictionaries.invalidateForFactoryReset();
        await clearManagedBrowserCaches();
        await unregisterManagedServiceWorkers();
    }

    private installStyles(): void {
        const hasLinkedReaderCss = Boolean(document.querySelector('link[href$="/yomu.css"], link[href*="/yomu.css?"]'));
        const style = document.createElement('style');
        style.textContent = hasLinkedReaderCss ? '' : initialReaderCss(READER_CSS);
        appendToDocumentHead(style);
        // Shadow roots never receive document-level CSS; seed the shared
        // shadow sheet with the same effective reader CSS (hosted pages link
        // the sheet instead of inlining it, so fall back to the bundled copy).
        setShadowReaderCss(initialReaderCss(READER_CSS));
        if (!shouldLoadReaderCssFallback(hasLinkedReaderCss, READER_CSS) || isJsdomRuntime()) return;
        void loadReaderCssFallback().then(css => {
            if (!css || this.isDestroyed) return;
            style.textContent = css;
            setShadowReaderCss(css);
            this.applyTheme();
        }).catch(error => {
            log.warn('Reader CSS fallback load failed', error);
        });
    }

    private applyTheme(settings = this.settings): void {
        applyReaderTheme(settings);
        this.hostTheme.sync(settings);
        refreshReaderWordContrast(document);
        this.scheduleDeferredThemeContrastRefresh();
    }

    private scheduleDeferredThemeContrastRefresh(): void {
        window.cancelAnimationFrame(this.themeContrastRefreshFrame ?? 0);
        window.clearTimeout(this.themeContrastRefreshTimer);
        this.themeContrastRefreshFrame = window.requestAnimationFrame(() => {
            this.themeContrastRefreshFrame = undefined;
            if (this.isDestroyed) return;
            this.hostTheme.refreshAmbient(this.settings);
            refreshReaderWordContrast(document);
            this.themeContrastRefreshTimer = window.setTimeout(() => {
                this.themeContrastRefreshTimer = undefined;
                if (this.isDestroyed) return;
                this.hostTheme.refreshAmbient(this.settings);
                refreshReaderWordContrast(document);
            }, 80);
        });
    }

    private applyPreferredJapaneseSiteLanguage(
        settings = this.settings,
        options?: Parameters<typeof applyJapaneseSiteLanguagePreference>[1],
        deferCookieResponseReloadUntilPersisted?: Parameters<typeof applyJapaneseSiteLanguagePreference>[2],
    ): void {
        applyJapaneseSiteLanguagePreference(
            settings.preferJapaneseSiteLanguage,
            options,
            deferCookieResponseReloadUntilPersisted,
            targetLanguageOf(settings),
        );
    }

    private stagePreferredJapaneseSiteLanguage(previous: ReaderSettings, next: ReaderSettings): void {
        if (previous.preferJapaneseSiteLanguage === next.preferJapaneseSiteLanguage) {
            if (this.pendingPreferredJapaneseSiteLanguage === undefined) {
                this.applyPreferredJapaneseSiteLanguage(next, false);
            }
            return;
        }
        this.pendingPreferredJapaneseSiteLanguage = next.preferJapaneseSiteLanguage;
        // "Off" must stop pending locale injection and redirects immediately.
        // URL/cookie rollback is held until the dedicated canonical key commits.
        if (!next.preferJapaneseSiteLanguage) {
            this.applyPreferredJapaneseSiteLanguage(next, false, true);
        }
    }

    private completePreferredJapaneseSiteLanguageSave(settings: ReaderSettings): void {
        if (this.pendingPreferredJapaneseSiteLanguage !== settings.preferJapaneseSiteLanguage) return;
        const enabled = settings.preferJapaneseSiteLanguage;
        this.pendingPreferredJapaneseSiteLanguage = undefined;
        this.applyPreferredJapaneseSiteLanguage(settings, !enabled);
    }

    private failPreferredJapaneseSiteLanguageSave(previousSettings: ReaderSettings): void {
        if (this.pendingPreferredJapaneseSiteLanguage === undefined) return;
        this.pendingPreferredJapaneseSiteLanguage = undefined;
        this.settings = {
            ...this.settings,
            preferJapaneseSiteLanguage: previousSettings.preferJapaneseSiteLanguage,
        };
        this.applyPreferredJapaneseSiteLanguage(this.settings, false);
    }

    private rollbackOnboardingSettings(previousSettings: ReaderSettings): void {
        this.failPreferredJapaneseSiteLanguageSave(previousSettings);
        this.settings = previousSettings;
        // An unchosen compatibility profile is not an instruction to replace a
        // previously active target. Chosen settings, however, are durable user
        // intent and can safely restore their target too.
        if (previousSettings.learningTargetChosen) this.syncCardLookupTarget(previousSettings);
        this.applyTheme(previousSettings);
        this.applyWordColors(previousSettings);
    }

    private publishThemeSettingsChange(): void {
        this.publishSettingsChange({ theme: this.settings.theme });
    }

    private publishSettingsChange(settings: Partial<ReaderSettings>): void {
        publishPrivateSettingsChange({ settings });
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private clearBridgeBackedCaches(): void {
        this.audio.clearCaches();
        this.jpdbVocabulary.clear();
        this.jitenPublicVocabulary.clear();
        this.cardRenderData.clear();
        // Credential/settings changes must drop the Bunpro SRS index too, or a
        // token swap keeps colouring words from the previous account.
        this.bunproWordStates?.clear();
    }

    /**
     * A dictionary rescan is a DESTRUCTIVE pass: reparseVisiblePage tears down the
     * page enhancements and re-runs the visible-page scan, which unwraps and
     * re-wraps every `.jpdb-reader-word`. Any word it replaces is a word some open
     * popover is anchored to — so the lookup the learner is reading gets its anchor
     * pulled out from under it and the hover watchdog closes the panel a beat later.
     *
     * Nothing that reaches here is the learner asking for it right now: a settings
     * write from another tab, an offline-dictionary install finishing, an
     * auto-discovery pass. They land seconds after the fact, which is why this read
     * as "the popup closed on its own after about twenty seconds". Defer until no
     * popover is open — dismiss() flushes the pending pass — instead of narrowing
     * the guard to the settings dialog, which was only ever the one surface someone
     * happened to notice this on.
     */
    private scheduleDictionaryRescan(): void {
        if (this.activePopover) {
            this.dictionaryRescanPending = true;
            return;
        }
        this.pitchEnrichmentLocalCache.clear();
        this.localPitchDictionaryAvailability = undefined;
        this.jitenPublicVocabulary.clear();
        this.nestedParseContentCache.clear();
        this.resolvedFallbackVocabularyCache.clear();
        this.unresolvedFallbackVocabularyCache.clear();
        this.publicVocabularyMissRetries.clear();
        this.misalignedPublicFuriganaRecoveries.clear();
        this.fallbackVocabularyResolutionCache.clear();
        this.clearPitchEnrichmentQueue();
        window.clearTimeout(this.cachedPublicVocabularyHydrationTimer);
        this.cachedPublicVocabularyHydrationTimer = undefined;
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
        // While annotations are paused, a settings/language change must not
        // silently re-annotate the page behind the user's back.
        if (this.settings.annotationsPaused) return;
        this.jpdb.clear();
        this.jitenPublicVocabulary.clear();
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
        // Seed the study-card baseline so the first card the learner loaded does
        // not scroll (they are already at the top); only later card changes do.
        this.lastJitenStudyHeadword = currentJitenStudyHeadwordText();
        this.prefetchJitenStudyImmersion();
        this.scheduleJpdbPageEnhancements(0);
        this.installJpdbReviewExamplesToggleMemory();
        addWindowEventListener('popstate', () => this.scheduleJpdbPageEnhancements(120), { signal: this.abortController.signal });
        addWindowEventListener('hashchange', () => this.scheduleJpdbPageEnhancements(120), { signal: this.abortController.signal });
    }

    private scheduleJpdbPageEnhancements(delay = 0, options: { preserveEarlier?: boolean } = {}): void {
        if (this.isDestroyed || !isPageEnhancementHost()) return;
        const normalizedDelay = Math.max(0, delay);
        const deadline = Date.now() + normalizedDelay;
        // Review hosts can emit many mutations for one card swap. Debouncing
        // those mutations repeatedly pushed a nominal 300–500 ms delay out by
        // seconds. A transition refresh keeps the earliest scheduled paint and
        // only replaces it when a genuinely earlier deadline arrives.
        if (this.jpdbPageEnhanceTimer !== undefined
            && options.preserveEarlier
            && this.jpdbPageEnhanceDeadline <= deadline) return;
        window.clearTimeout(this.jpdbPageEnhanceTimer);
        this.jpdbPageEnhanceDeadline = deadline;
        this.jpdbPageEnhanceTimer = window.setTimeout(() => {
            this.jpdbPageEnhanceTimer = undefined;
            this.jpdbPageEnhanceDeadline = 0;
            void this.refreshJpdbPageEnhancements();
        }, normalizedDelay);
    }

    private async refreshJpdbPageEnhancements(): Promise<void> {
        const generation = ++this.jpdbPageEnhancementGeneration;
        this.lastEnhancedHref = location.href;
        this.installJpdbReviewExamplesToggleMemory();
        if (!this.settings.jpdbPageEnhancementsEnabled || !isPageEnhancementReady()) {
            this.pauseAutoScanObserver(() => this.removeJpdbPageEnhancements());
            return;
        }
        if (isCurrentKanjiSurface()) {
            if (this.settings.jpdbPageKanjiEnhancementsEnabled) this.installJpdbKanjiPageEnhancement(generation);
            this.removeStaleJpdbPageEnhancements(generation);
            return;
        }
        if (this.settings.jpdbPageWordEnhancementsEnabled && this.reviewPageWordTargetsStableForMount()) {
            await this.installJpdbWordPageEnhancements(generation);
        }
        this.removeStaleJpdbPageEnhancements(generation);
    }

    private reviewPageWordTargetsStableForMount(): boolean {
        if (currentPageEnhancementLayoutContext() !== 'review') {
            this.resetPendingReviewTarget();
            return true;
        }
        const expectedKeys = currentPageLocalDictionaryTargets().map(target => this.jpdbPageWordAddonKey(target));
        if (!expectedKeys.length) {
            this.resetPendingReviewTarget();
            return true;
        }
        const mountedKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]'))
            .map(element => element.dataset.yomuAddonKey ?? '');
        if (expectedKeys.some(expected => mountedKeys.some(mounted => pageAddonKeysMatch(expected, mounted)))) {
            this.resetPendingReviewTarget();
            return true;
        }

        const signature = expectedKeys.join('\u0000');
        const now = Date.now();
        if (signature !== this.pendingReviewTargetSignature) {
            this.pendingReviewTargetSignature = signature;
            this.pendingReviewTargetReadyAt = now + REVIEW_PAGE_TARGET_SETTLE_MS;
        }
        const remaining = this.pendingReviewTargetReadyAt - now;
        if (remaining > 0) {
            this.scheduleJpdbPageEnhancements(Math.ceil(remaining), { preserveEarlier: true });
            return false;
        }
        this.resetPendingReviewTarget();
        return true;
    }

    private resetPendingReviewTarget(): void {
        this.pendingReviewTargetSignature = '';
        this.pendingReviewTargetReadyAt = 0;
    }

    private removeJpdbPageEnhancements(): void {
        document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]').forEach(element => this.removeJpdbPageAddonRoot(element));
    }

    private removeStaleJpdbPageEnhancements(generation: number): void {
        const generationKey = String(generation);
        this.pauseAutoScanObserver(() => {
            document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]').forEach(element => {
                if (element.dataset.yomuGeneration !== generationKey) this.removeJpdbPageAddonRoot(element);
            });
        });
    }

    // A jiten SRS study session keeps the same /srs/study URL across cards, so
    // grading to the next card leaves the page scrolled wherever the previous
    // card was read. Scroll back to the top when the study headword changes —
    // only on a genuine new card, not on revealing the same card (the headword
    // is identical front and back) and not on the very first card (already top).
    private maybeScrollJitenStudyToNewCard(): void {
        const headword = currentJitenStudyHeadwordText();
        if (!headword || headword === this.lastJitenStudyHeadword) return;
        const hadPreviousCard = this.lastJitenStudyHeadword !== '';
        this.lastJitenStudyHeadword = headword;
        if (hadPreviousCard) window.scrollTo({ top: 0 });
    }

    private prefetchJitenStudyImmersion(): void {
        if (!isJitenHost()
            || !location.pathname.startsWith('/srs/study')
            || !this.settings.immersionKitEnabled) return;
        const headword = currentJitenStudyHeadwordText();
        // Only prefetch the actual question side. During a phased host swap the
        // next headword can appear briefly inside the previous revealed card;
        // waiting for the answer target to disappear avoids warming from that
        // unstable intermediate DOM.
        if (!headword
            || headword === this.lastJitenImmersionPrefetchHeadword
            || currentPageLocalDictionaryTargets().length > 0) return;
        const controller = this.immersionPopover;
        if (!controller) return;
        this.lastJitenImmersionPrefetchHeadword = headword;
        const card = jpdbAudioCard(headword, headword);
        card.source = 'jiten';
        // Search only warms the keyed cache. No DOM is mounted on the question
        // side, so the learner gets a fast reveal without definition/media
        // spoilers on the front of the card.
        // Prefetch only the current card's exact spelling. Alternate forms and
        // parsed fallbacks can fan out into multiple searches, so leave those
        // for an explicit reveal when an exact hit is unavailable.
        void controller.searchExamples(card, { exactOnly: true })
            .then(result => {
                // Warm only the example reveal will select for this hidden
                // card. A persisted carousel position can point past index 0;
                // selecting through the controller keeps the question-side
                // request aligned with reveal while preserving the one-image
                // traffic bound (no lookahead or audio preload here).
                if (currentJitenStudyHeadwordText() !== headword) return;
                const example = controller.preferredExampleFor(card, result.examples);
                const client = this.immersionKit;
                if (!example || !client || !this.settings.immersionKitShowImages) return;
                const imageUrls = client.mediaUrls(example, 'image');
                if (!imageUrls.length) return;
                void client.fetchBlobUrl(
                    imageUrls[0],
                    this.settings.audioTimeoutMs,
                    this.settings.corsProxyUrl,
                    this.settings.interfaceLanguage,
                ).catch(() => undefined);
            })
            .catch(error => {
                log.debug('Jiten review Immersion prefetch failed', { term: headword, error });
            });
    }

    private jitenEnhancementsNeedRefresh(): boolean {
        if (location.href !== this.lastEnhancedHref) return true;
        if (!isPageEnhancementReady() || !this.settings.jpdbPageEnhancementsEnabled) return false;
        const hasAddon = Boolean(document.querySelector('[data-yomu-jpdb-addon]'));
        // Bunpro keeps the previous answer console alive briefly while the next
        // prompt renders. Remove its addon immediately so the preceding answer
        // cannot leak into the unrevealed question phase.
        if (isBunproHost() && isBunproQuizAnswerHidden()) return hasAddon;
        // Review question fronts intentionally expose no word target. Treat a
        // retained answer addon as refresh work on every supported SRS host so
        // the next zero-delay pass removes it without mounting a spoiler. This
        // also covers JPDB, whose front-side sentence contains generic `.plain`
        // tokens that are not the reviewed vocabulary headword.
        if (currentPageEnhancementLayoutContext() === 'review'
            && !isCurrentKanjiSurface()
            && currentPageLocalDictionaryTargets().length === 0) return hasAddon;
        if (!hasAddon) return true;
        if (this.jitenAddonWordIdentityChanged()) return true;
        return this.jitenAddonStrandedOnFallbackAnchor();
    }

    // A jiten SRS study session serves every card under the same /srs/study URL,
    // so advancing to the next card changes the headword without changing
    // location.href, and the swipe carousel leaves the previous card's addon in
    // the DOM. Existence alone can't tell the two words apart, so the addon —
    // and its Immersion Kit — kept showing the previous card. Refresh whenever
    // the mounted addon's word/kanji identity no longer matches the current target.
    private jitenAddonWordIdentityChanged(): boolean {
        const expected = this.currentJitenAddonKeys();
        if (!expected.length) return false;
        const mounted = Array.from(document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]'))
            .map(element => element.dataset.yomuAddonKey ?? '');
        return !expected.some(expectedKey => mounted.some(mountedKey => pageAddonKeysMatch(expectedKey, mountedKey)));
    }

    private currentJitenAddonKeys(): string[] {
        if (isCurrentKanjiSurface()) {
            const kanji = currentPageKanji();
            return isKanjiCharacter(kanji) ? [`kanji:${kanji}`] : [];
        }
        return currentPageLocalDictionaryTargets().map(target => this.jpdbPageWordAddonKey(target));
    }

    private jitenAddonStrandedOnFallbackAnchor(): boolean {
        if (!document.querySelector('[data-yomu-jpdb-addon][data-yomu-anchor-fallback="true"]')) return false;
        const anchor = currentPageTermTarget()?.anchor;
        return Boolean(anchor && anchor !== document.body && anchor.tagName !== 'MAIN');
    }

    private installJpdbReviewExamplesToggleMemory(): void {
        if (!this.isJpdbReviewPage()) return;
        const checkbox = document.querySelector<HTMLInputElement>('#show-checkbox-examples');
        if (!checkbox) return;
        if (checkbox.dataset.yomuExamplesMemoryInstalled === 'true') return;
        checkbox.dataset.yomuExamplesMemoryInstalled = 'true';
        this.restoreJpdbReviewExamplesVisible(checkbox);
        checkbox.addEventListener('change', trustedReaderEventHandler(() => {
            this.storeJpdbReviewExamplesVisible(checkbox.checked);
        }), { signal: this.abortController.signal });
    }

    private restoreJpdbReviewExamplesVisible(checkbox: HTMLInputElement): void {
        const storedVisible = this.storedJpdbReviewExamplesVisible();
        if (storedVisible === null || checkbox.checked === storedVisible) return;
        checkbox.checked = storedVisible;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    private isJpdbReviewPage(): boolean {
        return location.hostname === 'jpdb.io' && location.pathname.startsWith('/review');
    }

    private storedJpdbReviewExamplesVisible(): boolean | null {
        try {
            const value = managedLocalStorage.getItem(JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY);
            return value === 'true' ? true : value === 'false' ? false : null;
        } catch {
            return null;
        }
    }

    private storeJpdbReviewExamplesVisible(visible: boolean): void {
        try {
            managedLocalStorage.setItem(JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY, String(visible));
        } catch {
            // Ignore storage failures; the native checkbox should still work.
        }
    }

    private async installJpdbWordPageEnhancements(generation: number): Promise<void> {
        const targets = currentPageLocalDictionaryTargets();
        await Promise.all(targets.map(target => this.installJpdbWordPageEnhancement(target, generation)));
    }

    private installJpdbWordPageEnhancement(target: LocalDictionaryTarget, generation: number): void {
        const card = this.jpdbPageWordCard(target);
        if (!this.isCurrentJpdbPageEnhancement(generation)) return;
        const root = this.createJpdbPageAddonRoot('word', this.jpdbPageWordAddonKey(target), target.anchor, generation);
        if (!root) return;

        const state: PageWordDefinitionState = {
            entries: [],
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: null,
            bunproDefinitionInfo: null,
        };
        // Paint the keyed shell immediately. With Immersion enabled this mounts
        // its stable placeholder in the same task as answer reveal; dictionaries
        // and remote providers then hydrate independently instead of holding the
        // whole addon behind their longest timeout.
        this.renderJpdbPageWordDefinitionState(root, card, target, generation, state);

        const load = this.cardRenderData.loadDefinitionSources(card, {
            includeJpdbDefinition: !isJpdbHost(),
            includeJitenDefinition: !isJitenHost(),
            includeBunproDefinition: !isBunproHost(),
        });
        const mergeEntries = (entries: YomitanTermEntry[]): void => {
            state.entries = uniqueLocalDictionaryEntries([...state.entries, ...entries]);
            this.renderJpdbPageWordDefinitionState(root, card, target, generation, state);
        };
        const tasks = [
            load.localEntries.then(mergeEntries),
            load.hydrateLocalEntries().then(mergeEntries),
            this.lookupJpdbPageLocalEntries(target).then(mergeEntries),
            load.jpdbVocabularyInfo.then(value => {
                state.jpdbVocabularyInfo = value;
                this.renderJpdbPageWordDefinitionState(root, card, target, generation, state);
            }),
            load.jitenVocabularyInfo.then(value => {
                state.jitenVocabularyInfo = value;
                this.renderJpdbPageWordDefinitionState(root, card, target, generation, state);
            }),
            load.bunproDefinitionInfo.then(value => {
                state.bunproDefinitionInfo = value;
                this.renderJpdbPageWordDefinitionState(root, card, target, generation, state);
            }),
        ];
        void Promise.allSettled(tasks).then(() => {
            if (!this.isCurrentJpdbPageEnhancement(generation) || !root.isConnected) return;
            if (!this.hasJpdbPageWordContent(state.entries, state)) this.removeJpdbPageAddonRoot(root);
        });
    }

    private renderJpdbPageWordDefinitionState(
        root: HTMLElement,
        card: JPDBCard,
        target: LocalDictionaryTarget,
        generation: number,
        state: PageWordDefinitionState,
    ): void {
        if (!this.isCurrentJpdbPageEnhancement(generation)
            || !root.isConnected
            || root.dataset.yomuGeneration !== String(generation)) return;
        const entries = uniqueLocalDictionaryEntries(state.entries)
            .sort((first, second) =>
                jpdbPageDictionaryPreferencePriority(first.dictionary, this.settings)
                    - jpdbPageDictionaryPreferencePriority(second.dictionary, this.settings),
            )
            .slice(0, this.settings.localDictionaryMaxResults);
        if (!this.hasJpdbPageWordContent(entries, state)) return;
        const html = this.renderDefinitionSources(
            card,
            entries,
            target.examples[0]?.sentence,
            state.jpdbVocabularyInfo,
            state.jitenVocabularyInfo,
            state.bunproDefinitionInfo,
        );
        if (!this.updateJpdbPageAddonHtml(root, html)) return;
        this.wanikaniSources.installDefinitionMounts(root, card);
        this.installJpdbPageAddonHandlers(root, card);
        this.dictionarySourceState.installTracking(root);
        // Without loaders the translation/grammar sections render their
        // "Finding…" placeholders and never resolve on dictionary sites.
        this.studySources.installLoaders(root, target.examples[0]?.sentence);
        this.installJpdbPageImmersionExamples(root, card, [
            ...target.alternates,
            ...target.compounds.flatMap(compound => [compound.term, compound.reading]),
            ...target.examples.map(example => example.sentence),
        ]);
        void this.parseJpdbPageAddonJapanese(root);
    }

    private hasJpdbPageWordContent(entries: YomitanTermEntry[], data: Pick<PageWordDefinitionState, 'jpdbVocabularyInfo' | 'jitenVocabularyInfo' | 'bunproDefinitionInfo'> | null): boolean {
        // The addon's job on a dictionary's own site is to add sources the native
        // page lacks, so the self-site source (suppressed in renderDefinitionSources)
        // doesn't count as content — otherwise it leaves an empty "No definitions" box.
        return Boolean(
            entries.length
            || (data?.jpdbVocabularyInfo && !isJpdbHost())
            || (data?.jitenVocabularyInfo && !isJitenHost())
            || (data?.bunproDefinitionInfo && !isBunproHost())
            || this.settings.immersionKitEnabled,
        );
    }

    private jpdbPageWordCard(target: LocalDictionaryTarget): JPDBCard {
        const card = jpdbAudioCard(target.term, target.reading);
        card.source = isBunproHost() ? 'bunpro' : isJitenHost() ? 'jiten' : 'jpdb';
        return card;
    }

    private jpdbPageWordAddonKey(target: LocalDictionaryTarget): string {
        return `word:${target.term}:${target.reading}`;
    }

    private updateJpdbPageAddonHtml(root: HTMLElement, html: string): boolean {
        const preservedImmersion = root.querySelector<HTMLElement>('[data-immersion-kit]');
        const htmlChanged = root.dataset.yomuRenderedHtml !== html;
        if (htmlChanged) {
            root.dataset.yomuRenderedHtml = html;
            setInnerHtml(root, html);
            const nextImmersion = root.querySelector<HTMLElement>('[data-immersion-kit]');
            if (preservedImmersion && nextImmersion && preservedImmersion !== nextImmersion) {
                nextImmersion.replaceWith(preservedImmersion);
            }
        }
        this.applyJpdbReviewImmersionLayout(root);
        return htmlChanged;
    }

    private applyJpdbReviewImmersionLayout(root: HTMLElement): void {
        if (root.dataset.yomuPageContext !== 'review') return;
        // Review answers put the media source first while retaining the user's
        // configured order for every dictionary/provider panel that follows it.
        const immersion = root.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!immersion) return;
        const stack = immersion.parentElement;
        if (stack?.firstElementChild !== immersion) stack?.prepend(immersion);
        // Review media must participate in the host card's layout from its
        // first paint. A closed <details> with our grid styles can still paint
        // descendants outside its measured box in Chromium, leaving the image
        // or translation below an unscrollable Jiten card. Auto-open once per
        // mount; the marker then preserves an explicit user collapse.
        if (immersion.tagName !== 'DETAILS'
            || immersion.dataset.yomuReviewAutoOpened === 'true') return;
        const details = immersion as HTMLDetailsElement;
        details.dataset.yomuReviewAutoOpened = 'true';
        details.dataset.sourceInitialOpen = 'true';
        details.open = true;
    }

    private async lookupJpdbPageLocalEntries(target: LocalDictionaryTarget): Promise<YomitanTermEntry[]> {
        if (!this.settings.localDictionariesEnabled) return [];
        // CardRenderData already performs the exact term+reading lookup. Only
        // query the alternate/compound variants here so one card transition
        // does not duplicate the largest IndexedDB read.
        const variants = localDictionaryLookupVariants(target)
            .filter(variant => variant.term !== target.term || variant.reading !== target.reading)
            .slice(0, 11);
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

    private removeJpdbPageAddonRoot(root: HTMLElement): void {
        this.immersionPopover?.abortPendingRequests(root);
        abortPendingTargetExampleSources(root);
        root.remove();
    }

    private installJpdbKanjiPageEnhancement(generation: number): void {
        const kanji = currentPageKanji();
        if (!isKanjiCharacter(kanji) || !this.isCurrentJpdbPageEnhancement(generation)) return;
        const target = currentPageTermTarget();
        const root = this.createJpdbPageAddonRoot('kanji', `kanji:${kanji}`, target?.anchor ?? document.body, generation);
        if (!root) return;
        const language = this.settings.interfaceLanguage;
        const mounts = this.renderKanjiSourceMounts(kanji, language);
        if (!mounts) {
            root.remove();
            return;
        }

        const card = jpdbAudioCard(kanji, kanji);
        this.updateJpdbPageAddonHtml(root, `<div class="jpdb-reader-definition-stack jpdb-reader-kanji-section-stack">${mounts}</div>`);
        this.installJpdbPageAddonHandlers(root, card);
        this.dictionarySourceState.installTracking(root);
        this.startKanjiProgressiveRender(root, this.kanjiDetailPromises(kanji), card, kanji, language, target ?? undefined);
        void this.parseJpdbPageAddonJapanese(root);
    }

    private createJpdbPageAddonRoot(kind: 'word' | 'kanji', key: string, anchor: HTMLElement, generation: number): HTMLElement | null {
        // Never mount to document.body: prepending there renders the addon
        // above the site's entire app shell (a coarse pre-hydration anchor on
        // SPA pages). Skip instead — the enhancement refresh mounts once a
        // real anchor exists.
        if (!anchor.isConnected || anchor === document.body) return null;
        const existing = Array.from(document.querySelectorAll<HTMLElement>(`[data-yomu-jpdb-addon="${kind}"]`))
            .find(element => element.dataset.yomuAddonKey === key);
        if (existing) {
            existing.dataset.yomuGeneration = String(generation);
            existing.dataset.yomuAnchorFallback = String(anchor.tagName === 'MAIN');
            existing.dataset.yomuPageContext = currentPageEnhancementLayoutContext();
            this.syncReaderRootLanguage(existing);
            this.applyJpdbReviewImmersionLayout(existing);
            return existing;
        }
        const root = document.createElement('div');
        root.dataset.jpdbReaderRoot = 'true';
        root.dataset.yomuJpdbAddon = kind;
        root.dataset.yomuAddonKey = key;
        root.dataset.yomuGeneration = String(generation);
        root.dataset.yomuPageContext = currentPageEnhancementLayoutContext();
        // A coarse fallback anchor (e.g. <main>) is marked so the enhancement
        // re-mounts once the real anchor exists instead of staying stranded.
        root.dataset.yomuAnchorFallback = String(anchor.tagName === 'MAIN');
        root.className = `yomu-jpdb-page-addon yomu-jpdb-${kind}-addon`;
        this.syncReaderRootLanguage(root);
        this.pauseAutoScanObserver(() => {
            anchor.insertAdjacentElement('afterend', root);
        });
        queueMicrotask(() => {
            if (root.isConnected) this.applyJpdbReviewImmersionLayout(root);
        });
        return root;
    }

    private installJpdbPageAddonHandlers(root: HTMLElement, fallbackCard: JPDBCard): void {
        if (root.dataset.yomuHandlersInstalled === 'true') return;
        root.dataset.yomuHandlersInstalled = 'true';
        this.installReaderControlPointerActivation(root);
        root.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => this.handleJpdbPageAddonClick(event, root, fallbackCard)));
    }

    private installReaderControlPointerActivation(root: HTMLElement): void {
        installControlPointerActivation(root);
    }

    private handleJpdbPageAddonClick(event: MouseEvent, root: HTMLElement, fallbackCard: JPDBCard): void {
        if (!(event instanceof MouseEvent)) return;
        if (this.handleDictionaryLookupLink(event, root, 'modal')) return;
        const actionButton = jpdbPageAddonActionButton(event, root);
        if (!actionButton) return;
        event.preventDefault();
        event.stopPropagation();
        this.dispatchJpdbPageAddonAction(actionButton, fallbackCard);
    }

    private dispatchJpdbPageAddonAction(actionButton: HTMLButtonElement, fallbackCard: JPDBCard): void {
        privateCommands.dispatchPrivateCommand(actionButton, {
            'kanji-lookup': command => { void this.showKanjiCard(fallbackCard, command.kanji, fallbackCard.spelling, actionButton, { navigation: 'push-current', preservePosition: true }); },
            'kanji-word': command => { void this.lookupText(command.expression, command.reading || command.expression, { anchor: actionButton, navigation: 'push-current', preservePosition: true, userGesture: true }); },
            'jpdb-kanji-action': command => { void this.performJpdbKanjiAction(command.actionId, fallbackCard, fallbackCard.spelling, fallbackCard.spelling, actionButton); },
            'card-action': command => { void this.handleCardAction(actionButton, fallbackCard, command.sentence || fallbackCard.spelling, command); },
        });
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
            () => void this.persistSettings(this.settings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE }),
            {
                openSettings: () => this.showSettings(),
                openStudyPage: () => this.openStudyPage(),
                cyclePowerState: () => this.cyclePowerState(),
                powerState: () => this.puckPowerState(),
                isPaused: () => this.settings.annotationsPaused,
                toggleOcrMode: () => void this.cycleOcrMode(),
                ocrMode: () => ocrInteractionModeFromSettings(this.settings),
                toggleAutoPlayAudio: () => void this.toggleAutoPlayAudio(),
                isAutoPlayAudioEnabled: () => this.isAutoPlayAudioEnabled(),
                toggleJapaneseSiteLanguage: () => void this.togglePreferredJapaneseSiteLanguage(),
                isYouTube: () => isYouTubeHostname(),
                toggleYoutubeFilter: () => void this.toggleYoutubeImmersion(),
                isYoutubeFilterEnabled: () => this.isYoutubeImmersionEnabled(),
                toggleAutoSubtitles: () => void this.toggleAutoSubtitles(),
                isAutoSubtitlesEnabled: () => this.settings.subtitleAutoDetect,
                hasSubtitleVideo: () => this.settings.subtitlePlayerEnabled
                    && this.subtitles.hasDiscoverableVideoCandidate(),
            },
        );
    }

    // Re-init so disabling detaches an already-bound video.
    private async toggleAutoSubtitles(): Promise<void> {
        this.settings.subtitleAutoDetect = !this.settings.subtitleAutoDetect;
        await this.persistSettings(this.settings, { explicitUserChoiceKeys: ['subtitleAutoDetect'] });
        this.subtitles.destroy();
        this.subtitles.init();
    }

    private async toggleAnnotationsPaused(): Promise<void> {
        await this.setAnnotationsPaused(!this.settings.annotationsPaused);
    }

    // Always persists, even when `paused` already matches, so the explicit
    // annotation choice cannot be left behind an in-memory-only transition.
    private async setAnnotationsPaused(paused: boolean): Promise<void> {
        const changed = this.settings.annotationsPaused !== paused;
        const previous = this.settings.annotationsPaused;
        this.settings.annotationsPaused = paused;
        if (changed) this.applyAnnotationsPausedState();
        try {
            await this.persistAnnotationPauseChoice();
        } catch (error) {
            this.rollbackAnnotationPauseChoice(previous, changed);
            throw error;
        }
        if (changed) this.toastAnnotationPauseChoice(paused);
    }

    private persistAnnotationPauseChoice(): Promise<void> {
        return this.persistSettings(this.settings, { explicitUserChoiceKeys: ['annotationsPaused'] });
    }

    private rollbackAnnotationPauseChoice(previous: boolean, changed: boolean): void {
        this.settings.annotationsPaused = previous;
        if (changed) this.applyAnnotationsPausedState();
        this.toast(uiText(this.settings.interfaceLanguage, 'settingsSaveFailed'));
    }

    private toastAnnotationPauseChoice(paused: boolean): void {
        this.toast(uiText(this.settings.interfaceLanguage, paused ? 'annotationsPausedToast' : 'annotationsResumedToast'));
    }

    // Paused: drop any in-flight hover lookup and strip existing annotations so
    // the page reads natively. Resumed: re-scan (unless the user opted into
    // manual scanning, in which case the scan shortcut drives it).
    private applyAnnotationsPausedState(): void {
        if (this.settings.annotationsPaused) {
            this.cancelPendingHoverLookup();
            // OFF must also silence work already in motion: a pending
            // auto-scan timer or an in-flight scan's parse batches would
            // otherwise re-annotate right after the clear (sol review P1).
            window.clearTimeout(this.autoScanTimer);
            this.autoScanTimer = undefined;
            this.autoScanDeadline = 0;
            this.autoScanForced = false;
            this.autoScanDebounced = false;
            this.pageScanner.cancelVisiblePageScan();
            this.clearAllAnnotations();
        } else this.scheduleVisiblePageRescan();
        // Captions are a reader surface too: repaint them immediately so OFF
        // cannot leave parsed ruby/colour DOM visible until a later settings
        // refresh, and so the subtitle controller stops scheduling parse work.
        this.subtitles.refresh();
        // The pause gates OCR too (ocrRuntimeActive): clear its overlays on
        // pause, re-scan per the user's OCR mode on resume.
        this.ocr.refreshForModeChange();
    }

    private scanPageNow(): void {
        if (this.settings.annotationsPaused) return;
        void this.pageScanner.scanVisiblePage({ silent: false });
    }

    private isAutoPlayAudioEnabled(): boolean {
        return this.settings.autoPlayAudio && this.settings.audioAutoPlayMode !== 'off';
    }

    private async toggleAutoPlayAudio(): Promise<void> {
        const enabled = this.isAutoPlayAudioEnabled();
        this.settings.autoPlayAudio = !enabled;
        // Unmuting from a fully-off mode needs a playing mode again, otherwise
        // settings normalization forces autoPlayAudio back to false.
        if (!enabled && this.settings.audioAutoPlayMode === 'off') this.settings.audioAutoPlayMode = 'all';
        await this.persistSettings(this.settings, { explicitUserChoiceKeys: ['autoPlayAudio', 'audioAutoPlayMode'] });
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'autoplayAudioOffToast' : 'autoplayAudioOnToast'));
    }

    private puckPowerState(): 'on' | 'no-furigana' | 'paused' {
        return annotationPowerState(this.settings, usesJapaneseProviders());
    }

    // Puck power cycle — three states, always reachable in order:
    //   on (annotations + furigana) → on, furigana hidden (reader still active
    //   for colours, lookups, mining) → paused (annotations off) → on.
    // Resuming ALWAYS lands in a true furigana-ON state so the cycle offers all
    // three regardless of the user's saved furigana preference; a furigana-off
    // user reaches the furigana-on state by cycling, then hides it again next
    // press.
    private async cyclePowerState(): Promise<void> {
        await applyAnnotationPowerTransition(
            planAnnotationPowerTransition(this.settings, usesJapaneseProviders(), DEFAULT_SETTINGS.furiganaMode),
            {
                hideFurigana: async rememberedMode => {
                    this.settings.puckFuriganaModeBeforeHide = rememberedMode;
                    await this.applyFuriganaMode('off');
                    this.toast(uiText(this.settings.interfaceLanguage, 'furiganaOffToast'));
                },
                pause: () => this.setAnnotationsPaused(true),
                resume: async furiganaMode => {
                    this.settings.puckFuriganaModeBeforeHide = '';
                    if (furiganaMode) await this.applyFuriganaMode(furiganaMode);
                    await this.setAnnotationsPaused(false);
                },
            },
        );
    }

    private async applyFuriganaMode(mode: ReaderSettings['furiganaMode']): Promise<void> {
        this.settings.showFurigana = this.settings.showFurigana || mode !== 'off';
        this.settings.furiganaMode = mode;
        await this.persistSettings(this.settings, {
            explicitUserChoiceKeys: ['showFurigana', 'furiganaMode', 'puckFuriganaModeBeforeHide'],
        });
        this.clearAllAnnotations();
        this.scheduleVisiblePageRescan();
    }

    private scheduleVisiblePageRescan(): void {
        if (!this.settings.annotationsPaused && !this.settings.manualScanEnabled) this.scheduleAutoScan(0, { force: true });
    }

    private async cycleOcrMode(): Promise<void> {
        const nextMode = nextOcrInteractionMode(ocrInteractionModeFromSettings(this.settings));
        applyOcrInteractionMode(this.settings, nextMode);
        await this.persistSettings(this.settings, { explicitUserChoiceKeys: ['ocrEnabled', 'ocrAutoScanImages'] });
        this.ocr.refreshForModeChange();
        this.toast(uiText(this.settings.interfaceLanguage, ocrModeToastKey(nextMode)));
    }

    private openStudyPage(): void {
        const opened = window.open(NEW_TAB_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        else location.href = NEW_TAB_PAGE_URL;
    }

    private clearAllAnnotations(): void {
        clearProjectedReadingsWithin(document);
        removeNonDestructiveScanMirrors(document);
        releaseRubyRoomGrowth(document);
        const changedParents = new Set<Node>();
        document.querySelectorAll('.jpdb-reader-word, .jpdb-reader-furigana, .jpdb-reader-ruby, .jpdb-reader-number-bind').forEach(el => {
            const parent = el.parentNode;
            if (parent) changedParents.add(parent);
            if (el.classList.contains('jpdb-reader-word')
                || el.classList.contains('jpdb-reader-ruby')
                || el.classList.contains('jpdb-reader-number-bind')) {
                const text = document.createTextNode(el.classList.contains('jpdb-reader-word')
                    ? readerWordSurfaceText(el)
                    : el.textContent || '');
                el.replaceWith(text);
            } else {
                el.remove();
            }
        });
        changedParents.forEach(parent => parent.normalize());
    }

    destroy(options: ReaderAppDestroyOptions = {}): void {
        this.isDestroyed = true;
        this.destroySubscriptions();
        this.destroyScanningInfrastructure();
        this.destroyReaderServices();
        this.clearReaderRuntimeWork();
        this.destroyReaderSurfaces(options);
    }

    private destroySubscriptions(): void {
        this.destroyIntegrationSubscriptions();
        this.destroyStateSubscriptions();
    }

    private destroyIntegrationSubscriptions(): void {
        this.disposeMokuroOcrToggleWatch?.();
        this.disposeMokuroOcrToggleWatch = undefined;
        // Tear down the jpdb.io/review page bridge (observer + heartbeat +
        // BroadcastChannel) on an in-place re-boot — pagehide only fires on a
        // real tab close/navigation, not a same-window destroy+re-init.
        this.disposeJpdbReviewBridge?.();
        this.disposeJpdbReviewBridge = undefined;
    }

    private destroyStateSubscriptions(): void {
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = undefined;
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = undefined;
    }

    private destroyScanningInfrastructure(): void {
        this.pageScanner.destroy?.();
        this.factoryReset.destroy();
        this.abortController.abort();
        this.hostTheme.destroy();
        window.cancelAnimationFrame(this.themeContrastRefreshFrame ?? 0);
        window.clearTimeout(this.themeContrastRefreshTimer);
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, this.handleNonDestructiveMirrorStale);
        this.disposeShadowRootDiscovery?.();
        this.disposeShadowRootDiscovery = undefined;
        setShadowRootScanHook(null);
        setCustomElementUpgradeHook(null);
        setReviewCardFrontPredicate(null);
        this.autoScanObserver?.disconnect();
        this.documentBodyObserver?.dispose();
        this.documentBodyObserver = undefined;
        this.observedDocumentBody = undefined;
        this.documentBodyRecoveryPending = false;
        this.clearMiningPauseReassert();
        this.clearSubtitleHoverMiningResumeTimer();
        this.activePlainSubtitleHoverSurface = undefined;
    }

    private destroyReaderServices(): void {
        this.ocr.destroy();
        this.subtitles.destroy();
        this.youtube.destroy();
        this.anki.destroy?.();
        this.audio.destroy?.();
    }

    private clearReaderRuntimeWork(): void {
        window.clearTimeout(this.autoScanTimer);
        this.autoScanForced = false;
        window.clearTimeout(this.asbScanTimer);
        window.clearTimeout(this.knownStateBackfillTimer);
        this.knownStateBackfillTimer = undefined;
        window.clearTimeout(this.visiblePageReparseTimer);
        window.clearTimeout(this.jpdbPageEnhanceTimer);
        this.jpdbPageEnhanceDeadline = 0;
        window.clearTimeout(this.nearbyReaderAudioPreloadTimer);
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverClose.stop();
        this.nestedParseContentCache.clear();
        this.pitchEnrichmentLocalCache.clear();
        this.localPitchDictionaryAvailability = undefined;
        this.resolvedFallbackVocabularyCache.clear();
        this.unresolvedFallbackVocabularyCache.clear();
        this.publicVocabularyMissRetries.clear();
        this.misalignedPublicFuriganaRecoveries.clear();
        this.fallbackVocabularyResolutionCache.clear();
        this.clearPitchEnrichmentQueue();
        this.lateCardReconciliation.resetPending();
        window.clearTimeout(this.subtitleRebakeTimer);
        this.subtitleRebakeTimer = undefined;
        window.clearTimeout(this.cachedPublicVocabularyHydrationTimer);
        this.cachedPublicVocabularyHydrationTimer = undefined;
        this.pendingSubtitleRebakeTexts.clear();
        this.clearRenderedWordIndex();
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.popoverViewportChangePending = false;
        if (this.hoverPointerMoveFrame !== undefined) {
            window.cancelAnimationFrame(this.hoverPointerMoveFrame);
            this.hoverPointerMoveFrame = undefined;
        }
        this.pendingHoverPointerMove = undefined;
        this.activePopoverResizeObserver?.disconnect();
        this.nativeTitleGuard.restore();
    }

    private destroyReaderSurfaces(options: ReaderAppDestroyOptions): void {
        this.floatingButton.destroy();
        // If we tear down (e.g. a re-boot) while settings is open, release the
        // aria-hidden/inert it placed on the page so the next instance isn't inert.
        this.settingsDialog?.releaseModalBackground();
        this.lookupModal.release();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.removeJpdbPageEnhancements();
        if (!options.preservePageWords) {
            this.clearAllAnnotations();
        }
        this.dictionaryStyles.remove();
        document.querySelectorAll('[data-jpdb-reader-root]').forEach(el => el.remove());
    }

    private setupAutoScan(): void {
        const abortSignal = this.abortController.signal;
        addViewportChangeListeners(() => this.scheduleActivePopoverViewportChange(), abortSignal);
        this.autoScanObserver?.disconnect();
        this.disposeShadowRootDiscovery?.();
        this.disposeShadowRootDiscovery = installOpenShadowRootDiscovery();
        this.autoScanObserver = new MutationObserver(mutations => {
            const canScanText = this.canParseJapanese();
            const scanMutations: MutationRecord[] = [];
            let renderRejectionDelay: number | null = null;
            for (const mutation of mutations) {
                // Projection and mirror paint is observed at the document
                // root too. Reject it before any rejection classifier or
                // Japanese probe can turn our own write into another scan.
                if (mutationContainsOnlyReaderPaint(mutation)) continue;
                const delay = readerRenderRejectionRescanDelay(mutation);
                if (delay !== null) {
                    renderRejectionDelay = Math.max(renderRejectionDelay ?? 0, delay);
                    continue;
                }
                scanMutations.push(mutation);
            }
            // MutationObserver cannot unobserve one target. If a registered
            // shadow host left the composed document, disconnect once and
            // reattach only body + live roots so a detached component cannot
            // keep delivering work forever.
            const removedScannedShadowRoot = scanMutations.some(mutation =>
                mutation.type === 'childList' && mutation.removedNodes.length > 0,
            ) && sweepDisconnectedShadowRoots();
            if (removedScannedShadowRoot) {
                this.autoScanObserver?.disconnect();
                this.observeAutoScanMutations();
            }
            const mutationsOnlyInsideReaderRoot = scanMutations.length > 0
                && scanMutations.every(mutationInsideReaderRoot);
            const japaneseScanBudget = createMutationJapaneseScanBudget();
            const mutationScopeRoots = annotationScopeRoots();
            const mutationHasJapaneseText = mutationScanProbeCanProduceWork(this.settings, canScanText)
                && !mutationsOnlyInsideReaderRoot
                ? scanMutations.reduce(
                    (found, mutation) => mutationMayContainJapaneseText(
                        mutation,
                        japaneseScanBudget,
                        mutationScopeRoots,
                    ) || found,
                    false,
                )
                : false;
            // A root first discovered outside a declared Reader Surface is
            // intentionally not observed. If its connected host later moves
            // into a surface (or becomes one), registry idempotence will not
            // replay the hook, so refresh the now-in-scope observer targets
            // after the mutation probe has registered every candidate root.
            if (scanMutations.some(mutation =>
                mutationMayExpandAnnotationScope(mutation, mutationScopeRoots),
            )) {
                this.observeScopedScannedShadowRoots();
            }
            if (canScanText && renderRejectionDelay !== null) this.scheduleAutoScan(renderRejectionDelay, { force: true, debounce: true });
            if (canScanText && scanMutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (mutationsOnlyInsideReaderRoot) return;
            else if (mutationHasJapaneseText) {
                this.pageHasJapaneseText = true;
                this.noteVisibleAutoScanWorkObserved();
                this.scheduleAutoScan(visibleAutoScanMutationDelay(), {
                    // The observer has just proved fresh Japanese exists,
                    // potentially only behind an open shadow boundary. Trust
                    // that bounded verdict at fire time instead of re-gating
                    // through the light-DOM-only work detector.
                    force: true,
                    debounce: isYouTubeHostname(),
                });
            }
            if (isJitenHost()) {
                this.maybeScrollJitenStudyToNewCard();
                this.prefetchJitenStudyImmersion();
                if (this.jitenEnhancementsNeedRefresh()) {
                    this.scheduleJpdbPageEnhancements(0, { preserveEarlier: true });
                }
            } else if (isBunproHost()) {
                // Bunpro's lesson carousel and review loop both replace the
                // active item in place, so the generic JPDB mutation selector
                // is too narrow. The identity gate keeps steady DOM churn cheap.
                if (this.jitenEnhancementsNeedRefresh()) {
                    this.scheduleJpdbPageEnhancements(0, { preserveEarlier: true });
                }
            } else if (isPageEnhancementHost() && scanMutations.some(mutationMayAffectJpdbPageEnhancements)) {
                this.scheduleJpdbPageEnhancements(0, { preserveEarlier: true });
            }
        });
        this.setupDocumentBodyRecovery();
        // Keep the review-card front (jiten study / jpdb review question side)
        // a plain prompt: the decoration policy skips any element this predicate
        // flags, so furigana/pitch never spoil the reading being tested.
        setReviewCardFrontPredicate(isReviewCardFrontPromptElement);
        // New shadow roots discovered by the fragment walk join the same
        // observer; a Lit/web-component re-render then schedules a rescan
        // exactly like a light-DOM mutation would.
        setShadowRootScanHook((root, cause) => {
            if (this.isDestroyed || !nodeWithinAnnotationScope(root)) return;
            this.autoScanObserver?.observe(root, AUTO_SCAN_OBSERVER_OPTIONS);
            // A content-world watcher can discover a page-realm root only
            // after its component has already filled it. Observing now cannot
            // replay those earlier child mutations, so queue one ordinary
            // coalesced pass for that already-populated late root.
            if (cause === 'attached' && root.childNodes.length) {
                this.scheduleAutoScan(0, { force: true, debounce: true });
            }
        });
        // The page bridge and its bounded candidate timer are the primary
        // attachment path. Keep a separate name-level whenDefined wakeup for
        // an undefined custom element that upgrades only after that finite
        // fallback window has expired; it still enters the ordinary scoped
        // scan rather than bypassing the generic collector.
        setCustomElementUpgradeHook(() => {
            if (this.isDestroyed || !this.canParseJapanese()) return;
            this.scheduleAutoScan(visibleAutoScanMutationDelay(), { force: true, debounce: true });
        });
        this.observeAutoScanMutations();
        // Settings and dictionary setup is asynchronous. A defined component
        // can attach and populate an open root after the early startup verdict
        // but before this observer/hook exists, leaving no mutation to replay.
        // Refresh only a negative verdict now that discovery is live; the
        // normal initial-scan decision below then covers that pre-hook content.
        if (!this.pageHasJapaneseText) {
            this.pageHasJapaneseText = detectReaderStartupJapaneseText();
        }
        // capture: true — scroll does not bubble, so a bubble-phase window
        // listener only sees page scrolls. Bottom sheets and side panels
        // (m.youtube comment sheet) scroll their own containers; without the
        // capture phase their content never got a settle re-scan.
        // One handler tears the annotation loop down to a true zero-timer idle
        // whenever the tab is hidden and rebuilds it on show. Everything below
        // (the MutationObserver, debounce timers, scanner sweeps, the shadow
        // candidate poll) only ever produces work whose result must be painted;
        // a backgrounded SPA that never stops mutating would otherwise keep the
        // whole pipeline (and the CPU) awake for nothing.
        document.addEventListener('visibilitychange', () => this.handleAutoScanVisibilityChange(), { signal: abortSignal });
        window.addEventListener('scroll', event => {
            if (document.hidden) return;
            // Scrolls inside Yomu's own UI (popover bodies, settings sheet,
            // transcript drawer) never change page content — don't rescan.
            if (eventTargetsReaderRoot(event)) return;
            // Always debounce: without it the pending timer fires mid-fling
            // and every ~160ms of scrolling runs a full visible-page scan
            // (collection + residual body walk). Trailing-edge means one
            // settle scan after the scroll stops.
            this.scheduleAutoScan(visibleAutoScanMutationDelay(160), { force: true, debounce: true });
        }, { passive: true, capture: true, signal: abortSignal });
        window.addEventListener('resize', () => {
            if (document.hidden) return;
            this.scheduleAutoScan(250, { force: true, debounce: isYouTubeHostname() });
        }, { passive: true, signal: abortSignal });
        document.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => this.handleAutoScanClick(event)), { capture: true, signal: abortSignal });
        window.addEventListener('resize', () => this.scheduleJpdbPageEnhancements(700), { passive: true, signal: abortSignal });
        if (this.hasVisibleAutoScanWork()) this.scheduleAutoScan(visibleAutoScanInitialDelay());
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, this.handleNonDestructiveMirrorStale);
    }

    private handleAutoScanClick(event: MouseEvent): void {
        if (this.clickMayRevealReviewAnswer(event)) this.scheduleJpdbPageEnhancements(0, { preserveEarlier: true });
        if (!this.clickMayRevealDynamicUiText(event)) return;
        this.noteVisibleAutoScanWorkObserved();
        this.scheduleAutoScan(visibleAutoScanMutationDelay(), { force: true, debounce: true });
    }

    private clickMayRevealReviewAnswer(event: MouseEvent): boolean {
        return !document.hidden && isPageEnhancementHost() && clickMayRevealReviewAnswer(event);
    }

    private clickMayRevealDynamicUiText(event: MouseEvent): boolean {
        return !document.hidden && this.canParseJapanese() && clickMayRevealDynamicUiText(event);
    }

    private handleAutoScanVisibilityChange(): void {
        if (this.isDestroyed) return;
        if (document.hidden) {
            // Disconnect the observer (no target can deliver a paintable
            // change) and clear every pending timer so nothing re-arms. The
            // shadow candidate poll parks itself on the same visibility signal
            // inside the registry.
            this.autoScanObserver?.disconnect();
            window.clearTimeout(this.autoScanTimer);
            this.autoScanTimer = undefined;
            this.autoScanDeadline = 0;
            this.autoScanForced = false;
            this.autoScanDebounced = false;
            window.clearTimeout(this.asbScanTimer);
            this.asbScanTimer = undefined;
            window.clearTimeout(this.knownStateBackfillTimer);
            this.knownStateBackfillTimer = undefined;
            this.pageScanner.pauseGeometrySweeps();
            return;
        }
        // Back on screen: re-observe document.body plus every scoped shadow
        // root (disconnect dropped them all), re-arm the shadow candidate poll
        // that parked itself while hidden, then run one settle scan so any
        // content the page swapped in while hidden gets annotated now.
        if (this.documentBodyRecoveryPending) this.recoverAfterDocumentBodyReplacement();
        else this.observeAutoScanMutations();
        wakeShadowHostPoll();
        // The backfill parks itself while hidden (canScheduleKnownStateBackfill);
        // re-arm it so words scanned while backgrounded still get their state.
        this.scheduleReaderKnownStateBackfill();
        if (this.hasVisibleAutoScanWork()) this.scheduleAutoScan(visibleAutoScanInitialDelay());
    }

    private observeAutoScanMutations(): void {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => {
                if (!this.isDestroyed) this.observeAutoScanMutations();
            }, { once: true });
            return;
        }
        this.autoScanObserver?.observe(document.body, AUTO_SCAN_OBSERVER_OPTIONS);
        // disconnect() (pause path) dropped every target — re-attach the
        // registered shadow roots alongside document.body.
        this.observeScopedScannedShadowRoots();
    }

    private setupDocumentBodyRecovery(): void {
        this.documentBodyObserver?.dispose();
        this.observedDocumentBody = document.body ?? undefined;
        if (!document.documentElement) return;
        // The primary observer intentionally stays body-scoped to avoid head
        // churn. This O(1) companion watches only direct <html> children, so it
        // survives an SPA replacing <body> without observing ordinary page DOM.
        // It parks with the page: the handler compares the live body against
        // the remembered one, so one call on wake settles the whole hidden
        // period no matter how many times the host swapped it.
        this.documentBodyObserver = parkableMutationObserver(() => this.handleDocumentBodyReplacement(), {
            reconcile: () => this.handleDocumentBodyReplacement(),
            signal: this.abortController.signal,
        });
        this.documentBodyObserver?.observe(document.documentElement, { childList: true });
    }

    private handleDocumentBodyReplacement(): void {
        const body = document.body ?? undefined;
        if (this.isDestroyed || !body || body === this.observedDocumentBody) return;
        this.observedDocumentBody = body;
        this.documentBodyRecoveryPending = true;
        if (!document.hidden) this.recoverAfterDocumentBodyReplacement();
    }

    private recoverAfterDocumentBodyReplacement(): void {
        if (this.isDestroyed || !document.body || !this.documentBodyRecoveryPending) return;
        this.documentBodyRecoveryPending = false;
        // Drop the detached body target before observing the replacement. The
        // full body may already be populated, so queue one forced scan instead
        // of waiting for a later descendant mutation that might never arrive.
        this.autoScanObserver?.disconnect();
        this.observeAutoScanMutations();
        // The scanner's settle observer is body-scoped too, and it is installed
        // once — without this it would keep watching the detached body and no
        // reflow of the replacement would ever reach a geometry heal.
        this.pageScanner.repointGeometrySettleTarget?.();
        // JPDB's live Study bridge owns its own body-scoped observer. Recreate
        // it alongside the scanner so review status keeps publishing
        // immediately after JPDB swaps the document body on answer reveal.
        this.disposeJpdbReviewBridge?.();
        this.disposeJpdbReviewBridge = installReaderStartupBridge();
        if (!this.embeddedFrame) this.installFab();
        if (this.canParseJapanese()) {
            this.noteVisibleAutoScanWorkObserved();
            this.scheduleAutoScan(0, { force: true, debounce: true });
        }
        if (isPageEnhancementHost()) {
            this.scheduleJpdbPageEnhancements(0, { preserveEarlier: true });
        }
    }

    private observeScopedScannedShadowRoots(): void {
        forEachScannedShadowRoot(root => {
            if (nodeWithinAnnotationScope(root)) this.autoScanObserver?.observe(root, AUTO_SCAN_OBSERVER_OPTIONS);
        });
    }

    private shouldScanEmbeddedFrame(): boolean {
        return /(^|\.)youtube\.com$/i.test(location.hostname)
            && (location.pathname === '/live_chat' || location.pathname === '/live_chat_replay');
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

    private scheduleAutoScan(delay: number, options: { force?: boolean; debounce?: boolean } = {}): void {
        const forced = Boolean(options.force);
        if (!this.canScheduleAutoScan(forced)) return;
        // Steady-state throttle: on hosts that mutate their own content
        // constantly (YouTube comment/sidebar re-renders), a debounced scan
        // re-armed on every mutation still fired every ~320ms of quiet, each
        // re-collecting the whole visible page. Clamp the leading edge to
        // AUTO_SCAN_MIN_INTERVAL_MS since the last scan began; the trailing
        // settle scan still fires so no new-content scan is dropped.
        delay = throttledAutoScanDelay(delay, options, this.lastAutoScanStartedAt, Date.now());
        const now = Date.now();
        const deadline = now + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) {
            this.autoScanForced = this.autoScanForced || forced;
            // A debounced request may only push out a timer that was itself
            // debounced. Postponing a hard-scheduled scan breaks its caller's
            // contract — e.g. the render-rejection rescan throttle (10s) used
            // to swallow the immediate forced rescan after a puck toggle.
            // Every push-out is additionally capped at the debounce chain's
            // max-wait deadline so a busy page still scans (class E).
            const cappedDeadline = debouncedAutoScanDeadline(deadline, this.autoScanDebounceStartedAt);
            if (options.debounce && this.autoScanDebounced && this.autoScanDeadline < cappedDeadline) {
                window.clearTimeout(this.autoScanTimer);
                this.autoScanDeadline = cappedDeadline;
                this.autoScanTimer = window.setTimeout(() => {
                    this.runScheduledAutoScan();
                }, cappedDeadline - now);
            }
            return;
        }

        window.clearTimeout(this.autoScanTimer);
        this.autoScanForced = forced;
        this.autoScanDebounced = Boolean(options.debounce);
        if (this.autoScanDebounced) this.autoScanDebounceStartedAt = now;
        this.autoScanDeadline = deadline;
        this.autoScanTimer = window.setTimeout(() => {
            this.runScheduledAutoScan();
        }, delay);
    }

    private canScheduleAutoScan(force = false): boolean {
        // Both the master pause and manual-scan mode suppress every scheduled
        // scan. The explicit puck/shortcut scan bypasses this entirely via a
        // direct scanVisiblePage call, so on-demand scanning still works.
        if (this.settings.annotationsPaused || this.settings.manualScanEnabled) return false;
        if (this.isDestroyed || !this.canParseJapanese()) return false;
        // A hidden tab paints nothing, so a scheduled scan can only burn work
        // whose result no one can see. The visibilitychange handler tears the
        // loop down on hide and schedules a settle scan on show; this guard is
        // the belt-and-braces so a late async callback cannot re-arm it while
        // still hidden.
        if (typeof document !== 'undefined' && document.hidden) return false;
        // A pending timer means the work-check already passed (or the run was
        // forced) — merging into it needs no fresh profile-root sweep.
        return force || this.autoScanTimer !== undefined || this.hasVisibleAutoScanWorkCached();
    }

    private runScheduledAutoScan(): void {
        // Re-check the master gates at fire time: the pause/manual toggle can
        // flip between scheduling and the timer firing (sol review P1), and the
        // tab can have gone hidden after the timer was armed.
        if (this.isDestroyed || this.settings.annotationsPaused || this.settings.manualScanEnabled
            || (typeof document !== 'undefined' && document.hidden)) {
            this.autoScanTimer = undefined;
            this.autoScanDeadline = 0;
            this.autoScanForced = false;
            this.autoScanDebounced = false;
            return;
        }
        const forced = this.autoScanForced;
        this.autoScanTimer = undefined;
        this.autoScanDeadline = 0;
        this.autoScanForced = false;
        this.autoScanDebounced = false;
        this.lastAutoScanStartedAt = Date.now();
        if (typeof this.pageScanner.scanAsbPlayerSubtitles === 'function') void this.pageScanner.scanAsbPlayerSubtitles();
        if (forced || hasVisibleAutoScanTargets()) void this.pageScanner.scanVisiblePage({ silent: true });
    }

    private hasVisibleAutoScanWork(): boolean {
        return hasVisibleSiteScanTargets() || (allowsGenericVisibleAutoScan() && this.pageHasJapaneseText);
    }

    private hasVisibleAutoScanWorkCached(): boolean {
        const now = Date.now();
        if (this.visibleAutoScanWorkVerdict && now - this.visibleAutoScanWorkVerdict.at < VISIBLE_AUTO_SCAN_WORK_VERDICT_TTL_MS) {
            return this.visibleAutoScanWorkVerdict.verdict;
        }
        const verdict = this.hasVisibleAutoScanWork();
        this.visibleAutoScanWorkVerdict = { at: now, verdict };
        return verdict;
    }

    // The observer just verified the mutation carries Japanese text — trust
    // that verdict for the TTL window instead of re-running the sweep.
    private noteVisibleAutoScanWorkObserved(): void {
        this.visibleAutoScanWorkVerdict = { at: Date.now(), verdict: true };
    }

    private scheduleAsbPlayerScan(delay: number): void {
        if (this.isDestroyed) return;
        if (!this.canParseJapanese()) return;
        window.clearTimeout(this.asbScanTimer);
        this.asbScanTimer = window.setTimeout(() => void this.pageScanner.scanAsbPlayerSubtitles(), delay);
    }

    private bindEvents(): void {
        const abortSignal = this.abortController.signal;
        installTrustedReaderRootBoundary(document, abortSignal);
        bindReaderRuntimeEvents({
            getSettings: () => this.settings,
            setSettings: settings => {
                this.settings = settings;
            },
            isDestroyed: () => this.isDestroyed,
            showSettings: panel => this.showSettings(panel),
            setInterfaceLanguage: language => this.setInterfaceLanguage(language),
            applyTheme: () => this.applyTheme(),
            saveSettings: (settings, explicitUserChoiceKeys) => this.persistSettings(settings, { explicitUserChoiceKeys }),
            clearBridgeCaches: () => this.clearBridgeBackedCaches(),
        }, this.abortController.signal);
        subscribeToSettingsChanges(() => {
            if (!this.isDestroyed) {
                this.syncReaderRootLanguages();
            }
        }, abortSignal);

        // Tapping Yomu's OCR overlay must look the word up, never fall through to the
        // host viewer's tap-to-turn. BookWalker (NFBR) turns the page on a touchend /
        // click on its canvas; the viewer's handlers live on the canvas / viewer
        // container (a descendant of document) or bubble to document, so a
        // capture-phase stopPropagation here keeps the gesture from reaching them.
        // Two cases, handled differently so we don't break Yomu's OWN overlay handlers:
        //  • TOUCH (touchstart/touchend): Yomu has no overlay touch handler, and on
        //    touch WebKit may target the underlying canvas even with the OCR word on
        //    top — so swallow whenever the POINT is over the overlay (elementFromPoint
        //    finds the word through pointer-events:none layers).
        //  • POINTER / MOUSE / CLICK: Yomu's own line/word handlers process these and
        //    stopPropagation themselves when the event targets the overlay, so only
        //    swallow the "leaking" case (event targets the canvas but the point is over
        //    the overlay). Swallowing an overlay-targeted click here would cancel the
        //    lookup and break the OCR line's click handler.
        // A bare-page tap (genuine turn zone, point not over the overlay) is never
        // swallowed, so page-turn + auto-scan still work.
        const swallowReaderRootGesture = (event: Event): void => {
            const swallow = (event.type === 'touchstart' || event.type === 'touchend')
                ? pointOverReaderRoot(event)
                : readerRootGestureLeaks(event);
            if (swallow) event.stopPropagation();
        };
        for (const gestureType of READER_ROOT_GESTURE_EVENTS) {
            document.addEventListener(gestureType, swallowReaderRootGesture, { capture: true, passive: true, signal: abortSignal });
        }

        // Drive scroll inside a Yomu overlay body ourselves so a scroll-locking host
        // (BookWalker/NFBR et al. preventDefault touch/wheel to freeze their viewer)
        // can't keep the panel from scrolling on mobile. We set scrollTop directly (not
        // a cancellable default action) so it works regardless of the host's
        // preventDefault, listener phase, registration order, or realm. (The only shape
        // that could still starve it is a host that STOPS propagation before our
        // document-capture listener — scroll-locks preventDefault, they don't.)
        // A non-passive touch/wheel listener pessimises the browser's threaded scrolling,
        // so we attach these ONLY while an overlay is actually open — gated by the
        // observer below — and never during ordinary browsing.
        let scrollDragBody: HTMLElement | null = null;
        let scrollDragLastY = 0;
        const onScrollDragStart = trustedReaderEventHandler((event: TouchEvent): void => {
            // Editable / form controls keep native touch (caret, selection, option lists).
            scrollDragBody = eventTargetsInteractiveControl(event) ? null : readerScrollBodyForEvent(event);
            scrollDragLastY = event.touches[0]?.clientY ?? 0;
        });
        const onScrollDragMove = (event: TouchEvent): void => {
            if (!scrollDragBody?.isConnected || event.touches.length > 1) return; // pinch → native
            const y = event.touches[0]?.clientY;
            if (typeof y !== 'number') return;
            const consumed = manualScrollReaderBody(scrollDragBody, scrollDragLastY - y);
            scrollDragLastY = y;
            if (consumed && event.cancelable) event.preventDefault(); // the line above already moved the body
        };
        const endScrollDrag = trustedReaderEventHandler((_event: Event): void => { scrollDragBody = null; });
        const onScrollWheel = (event: WheelEvent): void => {
            if (eventTargetsInteractiveControl(event)) return;
            const body = readerScrollBodyForEvent(event);
            // deltaMode: 0=pixels, 1=lines, 2=pages — normalise so a notch scrolls sanely.
            const px = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * (body?.clientHeight ?? 0) : event.deltaY;
            if (!body || !manualScrollReaderBody(body, px)) return;
            if (event.cancelable) event.preventDefault();
        };
        const trustedOnScrollDragMove = trustedReaderEventHandler(onScrollDragMove);
        const trustedOnScrollWheel = trustedReaderEventHandler(onScrollWheel);
        let scrollDriveAttached = false;
        const setScrollDrive = (on: boolean): void => {
            if (on === scrollDriveAttached) return;
            scrollDriveAttached = on;
            if (on) {
                document.addEventListener('touchstart', onScrollDragStart, { capture: true, passive: true });
                document.addEventListener('touchmove', trustedOnScrollDragMove, { capture: true, passive: false });
                document.addEventListener('touchend', endScrollDrag, { capture: true, passive: true });
                document.addEventListener('touchcancel', endScrollDrag, { capture: true, passive: true });
                document.addEventListener('wheel', trustedOnScrollWheel, { capture: true, passive: false });
                return;
            }
            document.removeEventListener('touchstart', onScrollDragStart, true);
            document.removeEventListener('touchmove', trustedOnScrollDragMove, true);
            document.removeEventListener('touchend', endScrollDrag, true);
            document.removeEventListener('touchcancel', endScrollDrag, true);
            document.removeEventListener('wheel', trustedOnScrollWheel, true);
        };
        // Overlays mount as document.body children; attach the scroll driver only while
        // one carrying a scroll body is present (cheap querySelector, run only when body's
        // direct children change — never on every scroll).
        const syncScrollDrive = (): void => setScrollDrive(Boolean(document.querySelector(READER_ROOT_SCROLL_BODY_SELECTOR)));
        // A hidden tab receives no touch or wheel input, so every body-children
        // record it delivers pays for a document-wide selector match nobody can
        // act on. Park both watchers and re-decide once on wake.
        const scrollDriveObserver = parkableMutationObserver(syncScrollDrive, {
            reconcile: syncScrollDrive,
            signal: abortSignal,
        });
        let scrollDriveObservedRoot: Node | null = null;
        const observeScrollDriveRoot = (): void => {
            const root = document.body ?? document.documentElement;
            if (!root) {
                document.addEventListener('DOMContentLoaded', () => {
                    if (!this.isDestroyed) observeScrollDriveRoot();
                }, { once: true });
                return;
            }
            if (scrollDriveObservedRoot === root) return;
            scrollDriveObserver?.disconnect();
            scrollDriveObservedRoot = root;
            scrollDriveObserver?.observe(root, { childList: true });
            syncScrollDrive();
        };
        const rebindScrollDriveRoot = (): void => {
            syncScrollDrive();
            observeScrollDriveRoot();
        };
        scrollDriveObserver?.disconnect();
        const rootObserver = parkableMutationObserver(rebindScrollDriveRoot, {
            reconcile: observeScrollDriveRoot,
            signal: abortSignal,
        });
        const htmlRoot = document.documentElement;
        if (htmlRoot) rootObserver?.observe(htmlRoot, { childList: true });
        observeScrollDriveRoot();
        this.abortController.signal.addEventListener('abort', () => {
            // Reap the scroll-drive touch/wheel listeners FIRST. They are added
            // via a raw document.addEventListener toggle (no signal), and once
            // the observers below are disconnected nothing can ever call
            // setScrollDrive(false) again — so if an overlay carrying a scroll
            // body was open at teardown, the 5 listeners would otherwise survive
            // the abort and stack on every re-boot (retaining their closures).
            setScrollDrive(false);
            scrollDriveObserver?.dispose();
            rootObserver?.dispose();
        }, { once: true });

        document.addEventListener('click', event => this.handleDocumentClick(event), { capture: true, signal: abortSignal });
        document.addEventListener('mousedown', trustedReaderEventHandler((event: MouseEvent) => {
            if (this.isDestroyed) return;
            if (!this.shouldCaptureMiddleMouseLookup(event)) return;
            event.preventDefault();
            event.stopPropagation();
        }), { capture: true, passive: false, signal: abortSignal });
        document.addEventListener('auxclick', trustedReaderEventHandler((event: MouseEvent) => {
            if (this.isDestroyed) return;
            if (event.button !== 1 || Date.now() > this.suppressMiddleAuxClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
        }), { capture: true, signal: abortSignal });
        document.addEventListener('pointerdown', trustedReaderEventHandler((event: PointerEvent) => {
            this.primeLookupAudioFromFirstGesture();
            this.clearLatchedHoverPopoverPointerForOutsideEvent(event.target as Node | null);
            if ([
                () => this.isMiningDrawerHandlePointerEvent(event),
                () => {
                    if (!this.isLookupInteractionIgnoredTarget(event.target)) return false;
                    this.cancelPendingHoverLookup();
                    if (this.activePopoverMode === 'hover') this.dismiss({ suppressHoverTarget: false });
                    return true;
                },
            ].some(handle => handle())) return;
            this.suppressHoverAfterPenContact(event);
            if (this.handleOcrReaderWordPointerDown(event)) return;
            this.beginTapLookup(event);
            this.beginLinkPressLookup(event);
            this.pinHoverPopoverForInsidePointer(event);
            this.dismissModalPopoverForOutsidePointer(event);
            this.dismissHoverPopoverForOutsidePointer(event);
            this.beginPressLookup(event);
        }), { capture: true, passive: false, signal: abortSignal });
        document.addEventListener('pointermove', trustedReaderEventHandler((event: PointerEvent) => {
            this.updateTapLookup(event);
            this.updateLinkPressLookup(event);
            this.updatePressLookup(event);
        }), { capture: true, passive: false, signal: abortSignal });
        document.addEventListener('pointerup', trustedReaderEventHandler((event: PointerEvent) => {
            this.finishTapLookup(event);
            this.cancelLinkPressLookup(event);
            this.endPressLookup(event);
        }), { capture: true, signal: abortSignal });
        document.addEventListener('pointercancel', trustedReaderEventHandler((event: PointerEvent) => {
            this.cancelTapLookup(event);
            this.cancelLinkPressLookup(event);
            this.endPressLookup(event);
        }), { capture: true, signal: abortSignal });
        // Android fires contextmenu at its own long-press threshold; when the
        // link-word long-press lookup is pending or just opened, the popover
        // owns the gesture instead of the native link menu.
        document.addEventListener('contextmenu', trustedReaderEventHandler((event: MouseEvent) => {
            if (!this.linkPressLookup && Date.now() >= this.suppressLinkContextMenuUntil) return;
            event.preventDefault();
            event.stopPropagation();
        }), { capture: true, signal: abortSignal });

        document.addEventListener('pointerover', trustedReaderEventHandler((event: PointerEvent) => {
            this.clearLatchedHoverPopoverPointerForOutsideEvent(event.target as Node | null);
            this.handleHoverPointer(event);
        }), { capture: true, signal: abortSignal });

        document.addEventListener('pointermove', trustedReaderEventHandler((event: PointerEvent) => {
            // Ahead of every hover gate on purpose: the latch must be released by
            // any pointer event the browser routes outside the popover, even one
            // that hover handling itself ignores (drag, wrong pointer type, no
            // hover shortcut held).
            this.clearLatchedHoverPopoverPointerForOutsideEvent(event.target as Node | null);
            this.queueHoverPointerMove(event);
        }), { capture: true, signal: abortSignal });

        document.addEventListener('pointerout', trustedReaderEventHandler((event: PointerEvent) => {
            this.handleHoverPointerOut(event);
        }), { capture: true, signal: abortSignal });

        if (!window.PointerEvent) {
            document.addEventListener('mouseover', trustedReaderEventHandler((event: MouseEvent) => {
                this.handleHoverPointer(event as PointerEvent);
            }), { capture: true, signal: abortSignal });

            document.addEventListener('mousemove', trustedReaderEventHandler((event: MouseEvent) => {
                this.queueHoverPointerMove(event as PointerEvent);
            }), { capture: true, signal: abortSignal });

            document.addEventListener('mouseout', trustedReaderEventHandler((event: MouseEvent) => {
                this.handleHoverPointerOut(event as PointerEvent);
            }), { capture: true, signal: abortSignal });
        }

        document.addEventListener('keydown', this.handleDocumentKeydown, { signal: abortSignal });
        document.addEventListener('keyup', trustedReaderEventHandler((event: KeyboardEvent) => this.handleDocumentKeyup(event)), { signal: abortSignal });
        window.addEventListener('blur', () => {
            this.pressedKeys.clear();
            this.cancelPendingHoverLookup();
            if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
        }, { signal: abortSignal });
    }

    private handleDocumentClick(event: MouseEvent): void {
        if (!isTrustedReaderInteraction(event)) return;
        const target = this.documentClickTarget(event);
        if (!target) return;
        if (this.handleDocumentReaderWordClick(event, target)) return;
        this.handleDocumentNonWordClick(event);
    }
    private documentClickTarget(event: MouseEvent): HTMLElement | null {
        if (this.isDestroyed) return null;
        if (this.isMiningDrawerHandlePointerEvent(event)) return null;
        const target = event.target as HTMLElement;
        return this.documentClickTargetIgnored(target) ? null : target;
    }
    private documentClickTargetIgnored(target: HTMLElement): boolean {
        return shouldIgnoreDocumentClickTarget(target) || Boolean(target.closest?.(TOKEN_LIST_POPOVER_CONTROL_SELECTOR));
    }
    private handleDocumentReaderWordClick(event: MouseEvent, target: HTMLElement): boolean {
        const word = this.readerWordForPointerEvent(event, { clickLookup: true });
        if (!word) return Boolean(target.closest?.('[data-jpdb-reader-root] a.gloss-link[data-dictionary-lookup]'));
        this.handleReaderWordClick(event, word);
        return true;
    }
    private handleDocumentNonWordClick(event: MouseEvent): void {
        const insideActivePopover = this.activePopoverMode === 'modal' && this.isInsideActivePopover(event.target as Node | null);
        if (this.pauseForSubtitleSurfaceTap(event)) return;
        this.handleDocumentLookupCandidateClick(event, insideActivePopover);
    }
    private handleDocumentKeyup(event: KeyboardEvent): void {
        this.pressedKeys.delete(normalizePressedKey(event.key));
        if (!this.shouldCloseHoverAfterKeyup(event)) return;
        this.cancelPendingHoverLookup();
        if (this.activePopoverMode === 'hover') this.scheduleHoverClose(0, { ignoreCssHover: true });
    }
    private shouldCloseHoverAfterKeyup(event: KeyboardEvent): boolean {
        return Boolean(this.settings.shortcuts.hoverLookup?.trim()) && !this.shouldLookupOnHover(event);
    }

    private handleDocumentLookupCandidateClick(event: MouseEvent, insideActivePopover: boolean): void {
        if (this.settings.popupActivationMode === 'off' && !insideActivePopover) return;
        if (!this.settings.lookupOnClick && !insideActivePopover) return;
        const candidate = this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target);
        if (!candidate) return;
        event.preventDefault();
        event.stopPropagation();
        this.prepareModalLookupFromPointer(event);
        void this.showLookupCandidate(candidate, 'modal', {
            navigation: insideActivePopover ? 'push-current' : 'reset',
            preservePosition: insideActivePopover,
            userGesture: true,
        });
    }

    private handleReaderWordClick(event: MouseEvent, word: HTMLElement): void {
        const surfaces = this.readerWordClickSurfaces(event, word);
        if (!surfaces) return;
        this.openReaderWordFromPointer(event, word, surfaces);
    }

    private beginTapLookup(event: PointerEvent): void {
        this.tapLookup = undefined;
        if (this.isDestroyed
            || event.button !== 0
            || event.isPrimary === false
            || (event.pointerType !== 'touch' && event.pointerType !== 'pen')
            || this.isInsideActivePopover(event.target as Node | null)) return;
        // Seed the tap even when NO word resolves at pointerdown. A near-miss on a
        // small target (or the gap between two kana) often resolves cleanly at
        // pointerup, whose geometry is authoritative. Without this the only
        // fallback opener was the browser's ~300ms synthetic click — by which
        // point the cue had advanced (the reported "press twice, opens late").
        // Only bail if a word DID resolve but is not lookupable (e.g. a native
        // link we must not hijack).
        const word = this.readerWordForPointerEvent(event, { clickLookup: true });
        if (word && this.isNativeWord(word)) return;
        if (word && !this.readerWordClickSurfaces(event, word)) return;
        this.tapLookup = { id: event.pointerId, x: event.clientX, y: event.clientY, word: word ?? undefined };
        if (word) this.primeLookupAudioFromGesture();
    }

    private updateTapLookup(event: PointerEvent): void {
        const tap = this.tapLookup;
        if (!tap || tap.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) this.tapLookup = undefined;
    }

    private finishTapLookup(event: PointerEvent): void {
        const tap = this.tapLookup;
        if (!tap || tap.id !== event.pointerId) return;
        this.tapLookup = undefined;
        const releaseWord = this.readerWordForPointerEvent(event, { clickLookup: true });
        const fallbackWord = tap.word?.isConnected
            && this.readerWordMatchesPointerGeometry(tap.word, event.clientX, event.clientY)
            ? tap.word
            : undefined;
        const word = releaseWord ?? fallbackWord;
        if (!word?.isConnected) return;
        const surfaces = this.readerWordClickSurfaces(event, word);
        if (!surfaces) return;
        // Suppress the trailing synthetic click BEFORE opening so the ~300ms
        // click can neither double-open nor late-fire onto a cue that moved on.
        this.suppressWordClickUntil = Date.now() + 700;
        if (word) this.primeLookupAudioFromGesture();
        this.openReaderWordFromPointer(event, word, surfaces);
    }

    private cancelTapLookup(event: PointerEvent): void {
        const tap = this.tapLookup;
        if (tap && tap.id === event.pointerId) this.tapLookup = undefined;
    }

    // Words inside real links are passive: a click/tap must navigate, so the
    // popover has no click path there. Hover covers desktop; on touch (no
    // hover) a stationary long-press opens the lookup instead, and suppresses
    // the trailing click so the link does not also navigate.
    private beginLinkPressLookup(event: PointerEvent): void {
        this.clearLinkPressLookup();
        if (this.isDestroyed
            || event.button !== 0
            || event.isPrimary === false
            || (event.pointerType !== 'touch' && event.pointerType !== 'pen')
            || this.settings.popupActivationMode === 'off'
            || this.isInsideActivePopover(event.target as Node | null)) return;
        const word = this.linkPressLookupWord(event);
        if (!word) return;
        const timer = window.setTimeout(() => this.fireLinkPressLookup(), LINK_PRESS_LOOKUP_MS);
        this.linkPressLookup = { id: event.pointerId, x: event.clientX, y: event.clientY, word, timer };
        this.primeLookupAudioFromGesture();
    }

    private linkPressLookupWord(event: PointerEvent): HTMLElement | null {
        const word = this.readerWordForPointerEvent(event, { clickLookup: true });
        if (!word || this.isNativeWord(word)) return null;
        if (word.dataset.jpdbReaderPassive === 'true' && !canClickLookupPassiveReaderWordElement(word)) return null;
        if (word.closest('.jpdb-reader-popover') || word.closest(SUBTITLE_SURFACE_SELECTOR)) return null;
        return nativeClickableAncestor(documentPortalSourceHostForReaderWord(word) ?? word) instanceof HTMLAnchorElement
            ? word
            : null;
    }

    private updateLinkPressLookup(event: PointerEvent): void {
        const press = this.linkPressLookup;
        if (!press || press.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) this.clearLinkPressLookup();
    }

    private cancelLinkPressLookup(event: PointerEvent): void {
        if (this.linkPressLookup?.id === event.pointerId) this.clearLinkPressLookup();
    }

    private clearLinkPressLookup(): void {
        const press = this.linkPressLookup;
        if (!press) return;
        window.clearTimeout(press.timer);
        this.linkPressLookup = undefined;
    }

    private fireLinkPressLookup(): void {
        const press = this.linkPressLookup;
        this.linkPressLookup = undefined;
        if (!press || this.isDestroyed || !press.word.isConnected) return;
        const now = Date.now();
        this.suppressWordClickUntil = now + 1200;
        this.suppressLinkContextMenuUntil = now + 1200;
        this.lastPointerPosition = { x: press.x, y: press.y };
        this.cancelPendingHoverLookup();
        this.cancelHoverClose();
        this.pinOcrLineForModalLookup(press.word);
        if (this.shouldPauseForLookupAnchor(press.word)) this.pauseVideoForSubtitleMining();
        const candidate = this.renderedWordPointerLookupCandidate(press.word, press.x, press.y, press.word);
        if (candidate) {
            void this.showLookupCandidate(candidate, 'modal', { userGesture: true })
                .finally(() => this.releaseOrphanedModalOcrPin());
            return;
        }
        this.releaseOrphanedModalOcrPin();
    }

    private openReaderWordFromPointer(
        event: MouseEvent,
        word: HTMLElement,
        surfaces: { r: boolean; s: boolean; n?: boolean },
    ): void {
        if (!surfaces.n) {
            event.preventDefault();
            event.stopPropagation();
        }
        this.prepareModalLookupFromPointer(event);
        this.pinOcrLineForModalLookup(word);
        if (this.shouldPauseForLookupAnchor(word)) this.pauseVideoForSubtitleMining();
        const candidate = this.renderedWordLookupCandidateForActivation(word, event);
        if (candidate) {
            void this.showLookupCandidate(candidate, 'modal', {
                navigation: surfaces.r ? 'push-current' : 'reset',
                preservePosition: surfaces.r,
                userGesture: true,
            }).finally(() => this.releaseOrphanedModalOcrPin());
            return;
        }
        // A resolved word click must always open: shells without token spans
        // (and environments without caret geometry) fall back to the word's
        // own identity, which still routes through the span authority inside.
        void this.showWord(word, {
            trigger: 'click',
            userGesture: true,
            navigation: surfaces.r ? 'push-current' : 'reset',
        }).finally(() => this.releaseOrphanedModalOcrPin());
    }

    private handleOcrReaderWordPointerDown(event: PointerEvent): boolean {
        const word = this.ocrPointerDownReaderWord(event);
        if (!word) return false;
        const surfaces = this.readerWordClickSurfaces(event, word);
        if (!surfaces) return false;
        event.preventDefault();
        this.prepareModalLookupFromPointer(event);
        const now = Date.now();
        this.suppressWordClickUntil = now + 700;
        this.pinOcrLineForModalLookup(word);
        const candidate = this.renderedWordLookupCandidateForActivation(word, event);
        if (candidate) {
            void this.showLookupCandidate(candidate, 'modal', {
                navigation: surfaces.r ? 'push-current' : 'reset',
                preservePosition: surfaces.r,
                userGesture: true,
            }).finally(() => this.releaseOrphanedModalOcrPin());
            return true;
        }
        void this.showWord(word, {
            trigger: 'click',
            userGesture: true,
            navigation: surfaces.r ? 'push-current' : 'reset',
        }).finally(() => this.releaseOrphanedModalOcrPin());
        return true;
    }

    private ocrPointerDownReaderWord(event: PointerEvent): HTMLElement | null {
        if (event.button !== 0 || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return null;
        const target = event.target instanceof Element ? event.target : null;
        return target?.closest<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')
            ?? this.ocrLineWordForPointer(target, event.clientX, event.clientY);
    }

    private readerWordClickSurfaces(event: MouseEvent, word: HTMLElement): { r: boolean; s: boolean; n?: boolean } | null {
        if (!this.canClickLookupReaderWord(word)) return null;
        const p = canClickLookupPassiveReaderWordElement(word);
        if (word.dataset.jpdbReaderPassive === 'true' && !p) return null;
        if (this.consumeSuppressedReaderWordClick(event, word)) return null;
        const r = Boolean(word.closest('.jpdb-reader-popover'));
        const s = Boolean(word.closest(SUBTITLE_SURFACE_SELECTOR));
        if (this.settings.popupActivationMode === 'off' && !r) return null;
        const l = nativeClickableAncestor(documentPortalSourceHostForReaderWord(word) ?? word);
        const n = this.isNativeWord(word)
            && !r
            && !s
            && !this.clickForcesReaderWordLookup(event);
        if (!r && !s
            && l
            && !this.clickForcesReaderWordLookup(event)
            && !n) {
            return null;
        }
        if (!this.settings.lookupOnClick && !r && !s) return null;
        return { r, s, n };
    }

    private isNativeWord(word: HTMLElement): boolean {
        return Boolean(word.closest('.jpdb-reader-native-canvas'));
    }

    private consumeSuppressedReaderWordClick(event: MouseEvent, word: HTMLElement): boolean {
        const pointerType = (event as PointerEvent).pointerType;
        if (event.type.startsWith('pointer') && (pointerType === 'touch' || pointerType === 'pen')) return false;
        if (Date.now() >= this.suppressWordClickUntil && !this.shouldIgnoreCurrentImmersionExampleTargetClick(word)) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    // The subtitle controller's bound <video>, when present and still attached.
    // Preferred over the document-wide largest-video heuristic so the mining
    // pause targets the exact player the overlay tracks (not an ad/preview/
    // miniplayer). The companion may be a lifecycle stub, hence the optional call.
    private boundSubtitleVideo(): HTMLVideoElement | undefined {
        if (!('getBoundVideo' in this.subtitles)) return undefined;
        return this.subtitles.getBoundVideo();
    }

    // Pause the bound video on ANY lookup over page text while it is playing —
    // subtitle words, comments, titles, OCR lines — so the entry can be read.
    // Reader-popup-internal lookups never pause (you are already reading). Gated
    // by the subtitleMiningPause setting.
    private shouldPauseForLookupAnchor(anchor: Element | null): boolean {
        if (!this.settings.subtitleMiningPause || !anchor) return false;
        if (anchor.closest('.jpdb-reader-popover')) return false;
        if (anchor.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR)) return true;
        const bound = this.boundSubtitleVideo();
        return Boolean(bound && !bound.paused);
    }

    // Whether mounting this lookup should pause the video. A pinned (modal) lookup
    // pauses per the general rule above (any caption surface, or any text while a
    // bound video plays). A hover PREVIEW normally keeps playing — but directly
    // over a video caption surface the line scrolls out from under the cursor
    // before you finish reading, so the popover never settles and the wrong word
    // gets hit. The shipped default activation mode is hover, so without this a
    // caption lookup never paused at all. Hovering a caption therefore pauses too;
    // the hover popover re-anchors across words while paused (one popover, no
    // play/pause churn) and resumes when you leave the captions. General page-text
    // hover is unaffected — only real subtitle/caption surfaces opt in.
    private shouldPauseForMountedLookup(state: PopoverMountState): boolean {
        if (state.mode === 'modal') return this.shouldPauseForLookupAnchor(state.resolvedAnchor ?? null);
        // Hover preview: pause only directly over a real subtitle/caption surface.
        if (!this.settings.subtitleMiningPause || !this.settings.subtitleHoverPause) return false;
        const anchor = state.resolvedAnchor ?? null;
        if (!anchor || anchor.closest('.jpdb-reader-popover')) return false;
        return Boolean(anchor.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR));
    }

    // A tap that lands on the caption text but resolves no word still pauses the
    // playing video. Japanese caption words tile with no gaps, so on a phone the
    // furigana ruby band, punctuation, the line padding, the inter-line gaps of a
    // wrapped caption, or a cue that just changed are all easy to hit instead of an
    // exact word glyph — and before this a near-miss did nothing while the caption
    // kept scrolling (the reported "tapping the captions doesn't pause"). Pausing
    // freezes the line so the word can then be tapped cleanly. Scoped to the
    // player's own caption overlay text (not the transcript panel, whose rows seek)
    // and never steals a tap meant for a control or a word.
    private pauseForSubtitleSurfaceTap(event: MouseEvent): boolean {
        if (!this.settings.subtitleMiningPause) return false;
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.closest('.jpdb-subtitle-text')) return false;
        if (target.closest('button, a[href], input, [data-action], [data-resize-transcript], [data-subtitle-drag-handle], .jpdb-reader-word')) return false;
        const before = this.subtitleMiningPausedVideo;
        this.pauseVideoForSubtitleMining();
        // Only claim the tap when a playing video was actually paused; otherwise let
        // it fall through (nothing is playing, or it was already paused).
        if (this.subtitleMiningPausedVideo === before) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    // Opening a pinned lookup pauses the video so the entry can be read, and
    // remembers which video we paused so closing the popover resumes it. Prefer
    // the bound player; only fall back to the largest-video heuristic when the
    // controller has not bound one. A short-lived dataset marker tells the OCR
    // controller this pause was mining-initiated so it does not spawn a
    // paused-frame overlay over the player.
    private pauseVideoForSubtitleMining(): void {
        if (!this.settings.subtitleMiningPause) return;
        this.clearSubtitleHoverMiningResumeTimer();
        const bound = this.boundSubtitleVideo();
        let paused: HTMLVideoElement | undefined;
        if (bound?.isConnected && !bound.paused) {
            bound.pause();
            paused = bound;
        }
        paused ??= pauseActiveVideo();
        if (!paused) return;
        this.subtitleMiningPausedVideo = paused;
        this.markMiningPause(paused);
        this.armMiningPauseReassert(paused);
    }

    // Yomu's pause() sticks on its own, but on a video page the player or a
    // competing extension/userscript can re-issue play() immediately after we
    // pause — leaving the popover open while the subtitle keeps advancing (the
    // "click didn't pause" symptom). Re-pause that reactive re-play for a short
    // window while the mining marker is live, then stand down so a deliberate
    // resume — or closing the popover — is never fought.
    private armMiningPauseReassert(video: HTMLVideoElement): void {
        this.clearMiningPauseReassert();
        const armedAt = Date.now();
        const reassert = () => {
            if (this.subtitleMiningPausedVideo !== video || !video.dataset.jpdbReaderMiningPause) {
                this.clearMiningPauseReassert();
                return;
            }
            if (Date.now() - armedAt > MINING_PAUSE_REASSERT_WINDOW_MS) {
                this.clearMiningPauseReassert();
                return;
            }
            if (!video.paused) video.pause();
        };
        video.addEventListener('play', reassert);
        video.addEventListener('playing', reassert);
        this.miningPauseReassert = {
            video,
            off: () => {
                video.removeEventListener('play', reassert);
                video.removeEventListener('playing', reassert);
            },
        };
    }

    private clearMiningPauseReassert(): void {
        this.miningPauseReassert?.off();
        this.miningPauseReassert = undefined;
    }

    private scheduleSubtitleMiningVideoResume(delayMs = 0): void {
        this.clearSubtitleHoverMiningResumeTimer();
        if (delayMs <= 0) {
            this.resumeSubtitleMiningVideo();
            return;
        }
        this.subtitleHoverMiningResumeTimer = window.setTimeout(() => {
            this.subtitleHoverMiningResumeTimer = undefined;
            this.resumeSubtitleMiningVideo();
        }, delayMs);
    }

    private clearSubtitleHoverMiningResumeTimer(): void {
        window.clearTimeout(this.subtitleHoverMiningResumeTimer);
        this.subtitleHoverMiningResumeTimer = undefined;
    }

    private resumeSubtitleMiningVideo(): void {
        this.clearSubtitleHoverMiningResumeTimer();
        // Tear the re-assert guard down BEFORE the intentional play() below, so
        // resuming on close is never re-paused by our own listener.
        this.clearMiningPauseReassert();
        const stored = this.subtitleMiningPausedVideo;
        this.subtitleMiningPausedVideo = undefined;
        if (!stored) return;
        this.clearMiningPause(stored);
        // Resume ONLY the element we paused. After a player swap (ad-roll /
        // autoplay-next / SPA nav) the stored element is detached; we deliberately
        // do NOT force-play the swapped-in element — we never paused it, and
        // forcing play could override an ad or a deliberate user pause. YouTube's
        // own autoplay manages the new player.
        if (stored.isConnected && stored.paused) void stored.play().catch(() => undefined);
    }
    private markMiningPause(video: HTMLVideoElement): void { video.dataset.jpdbReaderMiningPause = String(Date.now()); }
    private clearMiningPause(video: HTMLVideoElement): void { delete video.dataset.jpdbReaderMiningPause; }
    private readonly handleDocumentKeydown = trustedReaderEventHandler((event: KeyboardEvent): void => {
        if (this.isDestroyed) return;
        this.pressedKeys.add(normalizePressedKey(event.key));
        if (isEditableEventContext(event)) return;
        [() => this.handleClosePopupShortcut(event),
            () => {
                if (this.hasHoverLookupShortcut() && this.shouldLookupOnHover(event)) this.scheduleHoverLookupAtPointer(event);
                return false;
            },
            () => this.handleLookupNavigationShortcut(event),
            () => this.handleReaderUtilityShortcut(event),
            () => { this.handleReviewShortcut(event); return true; }].some(handle => handle());
    });
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
            this.scanPageNow();
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.openSettings)) {
            event.preventDefault();
            this.showSettings();
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleOcr)) {
            this.toggleOcrFromShortcut(event);
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleSubtitleOverlay)) {
            this.toggleSubtitleOverlayFromShortcut(event);
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.toggleYoutubeImmersion)) {
            event.preventDefault();
            void this.toggleYoutubeImmersion();
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.scanImages)) {
            event.preventDefault();
            void this.ocr.scanVisible();
            return true;
        }
        if (matchesShortcut(event, this.settings.shortcuts.massReviewVisible)) {
            event.preventDefault();
            void this.massReviewVisibleJitenWords();
            return true;
        }
        return this.handleAudioShortcut(event);
    }

    private toggleOcrFromShortcut(event: KeyboardEvent): void {
        event.preventDefault();
        void this.cycleOcrMode();
    }

    private toggleSubtitleOverlayFromShortcut(event: KeyboardEvent): void {
        event.preventDefault();
        this.settings.subtitleOverlayVisible = !this.settings.subtitleOverlayVisible;
        this.settings.subtitleOverlayVisibleChosen = true;
        void this.persistSettings(this.settings, {
            explicitUserChoiceKeys: ['subtitleOverlayVisible', 'subtitleOverlayVisibleChosen'],
        });
        this.subtitles.refresh();
        this.toast(uiText(this.settings.interfaceLanguage, this.settings.subtitleOverlayVisible ? 'subtitleOverlayEnabled' : 'subtitleOverlayHidden'));
    }

    // Jiten v1.2.x parity: "review everything on screen" — grade every
    // visible due/learning Jiten word as Good in one srs/batch-review
    // transaction, then refresh their rendered states from a single parse.
    private async massReviewVisibleJitenWords(): Promise<void> {
        if (!hasJitenApiCredential(this.settings)) {
            this.toast(uiText(this.settings.interfaceLanguage, 'massReviewNoKey'));
            return;
        }
        const words = visibleJitenReviewableWords();
        if (!words.length) {
            this.toast(uiText(this.settings.interfaceLanguage, 'massReviewNoWords'));
            return;
        }
        const cards = words.map(word => jitenWordCardForMassReview(word));
        try {
            const count = await this.jiten.batchReviewCards(cards, 'okay');
            this.toast(uiText(this.settings.interfaceLanguage, 'massReviewDone').replace('{count}', String(count)));
            void this.refreshMassReviewedWordStates(cards);
        } catch (error) {
            log.warn('Mass review failed', error);
            this.toast(uiText(this.settings.interfaceLanguage, 'massReviewFailed'));
        }
    }

    private async refreshMassReviewedWordStates(cards: JPDBCard[]): Promise<void> {
        // One batched reader/lookup-vocabulary request refreshes every reviewed
        // word's state — previously this re-parsed each word in its own request.
        const batch = cards.slice(0, 60);
        await this.jiten.refreshCardStates(batch).catch(() => undefined);
        for (const card of batch) publishCardStateSignal(card);
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
        const selection = this.reviewShortcutSelection();
        if (!this.canReviewFromShortcut(selection.reviewTarget, selection.ankiCardId)) return null;
        return this.createReviewShortcutContext(target, selection);
    }

    private reviewShortcutTarget(event: KeyboardEvent): ReviewShortcutTarget | null {
        const grade = this.shortcutGrade(event);
        const card = this.lastCard;
        if (!grade || !card) return null;
        return this.isReviewShortcutPopoverOpen() ? { grade, card } : null;
    }

    private createReviewShortcutContext(
        target: ReviewShortcutTarget,
        selection: Pick<ReviewShortcutContext, 'reviewTarget' | 'ankiCardId'>,
    ): ReviewShortcutContext {
        return {
            grade: target.grade,
            card: target.card,
            ...selection,
            sentence: this.lastCardSentence,
            anchor: this.activePopoverAnchor?.isConnected ? this.activePopoverAnchor : undefined,
            trigger: this.activePopoverMode === 'hover' ? 'hover' : 'modal',
        };
    }

    private isReviewShortcutPopoverOpen(): boolean {
        return Boolean(this.activePopover?.classList.contains('jpdb-reader-popover'));
    }

    private reviewShortcutSelection(): Pick<ReviewShortcutContext, 'reviewTarget' | 'ankiCardId'> {
        const fallbackAnkiId = this.lastAnkiLookup?.primary?.primaryCardId ?? null;
        return privateCommands.resolvePrivateReviewSelection(this.activePopover, fallbackAnkiId);
    }

    private canReviewFromShortcut(reviewTarget: ReviewShortcutContext['reviewTarget'], ankiCardId: number | null): boolean {
        if (reviewTarget === 'anki') return Boolean(ankiCardId);
        if (reviewTarget === 'both') return Boolean(ankiCardId) && isApiMiningEnabled(this.settings);
        if (reviewTarget) return isApiMiningEnabled(this.settings);
        return Boolean(ankiCardId) || isApiMiningEnabled(this.settings);
    }

    private submitReviewShortcut(context: ReviewShortcutContext): Promise<void> {
        return this.cardActions.reviewGrade(context.grade, context.card, context.sentence, {
            target: context.reviewTarget,
            ankiCardId: this.reviewShortcutAnkiCardId(context.ankiCardId),
        }).then(() => this.dismissAfterReview()).catch(error => {
            log.warn('Shortcut review failed', { grade: context.grade, ankiCardId: this.reviewShortcutAnkiCardId(context.ankiCardId, true) }, error);
            this.toast(userFacingErrorText(this.settings.interfaceLanguage, 'reviewFailed', error));
        });
    }

    private reviewShortcutAnkiCardId(ankiCardId: number | null, includeZero = false): number | undefined {
        if (typeof ankiCardId !== 'number' || !Number.isFinite(ankiCardId)) return undefined;
        if (!includeZero && !ankiCardId) return undefined;
        return ankiCardId;
    }

    private shortcutGrade(event: KeyboardEvent): JPDBGrade | null {
        if (!this.settings.enableReviews) return null;
        const bunproMode = popoverBunproGradeMode(this.activePopover);
        const shortcuts = bunproMode === 'fsrs'
            ? BUNPRO_FSRS_REVIEW_SHORTCUTS
            : this.settings.twoButtonReviews || bunproMode === 'regular'
                ? TWO_BUTTON_REVIEW_SHORTCUTS
                : FIVE_BUTTON_REVIEW_SHORTCUTS;
        return matchedReviewShortcutGrade(event, this.settings.shortcuts, shortcuts);
    }

    private shouldLookupOnHover(event: MouseEvent | KeyboardEvent): boolean {
        return !this.settings.annotationsPaused
            && this.settings.popupActivationMode !== 'off'
            && !this.hasStickyModalPopover()
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
        this.primeLookupAudioFromGesture();
        if (request.isMiddleScan) this.captureMiddleMouseLookup(event);
        this.pressLookup = this.createPressLookup(event, request.isMiddleScan);
        if (request.isMiddleScan) this.updatePressLookup(event);
    }

    private pressLookupRequest(event: PointerEvent): { isMiddleScan: boolean } | null {
        if (this.isLookupInteractionIgnoredTarget(event.target)) return null;
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
        this.pinActiveHoverPopoverForPendingModalLookup();
        this.cancelHoverClose();
        this.primeLookupAudioFromGesture();
    }

    // A press anywhere inside a hover popover is the user engaging with it
    // (scrolling, selecting, tapping controls), so it must stop behaving as a
    // transient hover popup: pin it to sticky/modal mode so it stays open
    // until an outside press dismisses it.
    private pinHoverPopoverForInsidePointer(event: PointerEvent): void {
        if (this.activePopoverMode !== 'hover' || !this.activePopover) return;
        if (!this.isInsideActivePopover(event.target as Node | null)) return;
        this.cancelPendingHoverLookup();
        this.cancelHoverClose();
        this.pinActiveHoverPopoverForPendingModalLookup();
        this.lookupModal.activate(this.activePopover, this.activePopoverAnchor);
        this.activePopover.focus({ preventScroll: true });
    }

    private pinActiveHoverPopoverForPendingModalLookup(): void {
        if (this.activePopoverMode !== 'hover' || !this.activePopover) return;
        this.hoverClose.stopWatch();
        this.clearHoverPopoverResizeSticky();
        this.hoverPopoverPointerPosition = undefined;
        this.activePopoverMode = 'modal';
        this.activeHoverWord = undefined;
        this.activeHoverLookupKey = '';
        this.activePointerTextLookup = undefined;
    }

    // Safari (notably iPadOS) blocks audible playback until the page has had a
    // user gesture, so hover autoplay was dead until the first press ON a word
    // primed an authorized element. Any first tap on the page now primes it.
    private primeLookupAudioFromFirstGesture(): void {
        if (this.isDestroyed || !this.settings.audioEnabled || !this.settings.autoPlayAudio) return;
        this.audio.primeUserGestureIfUnprimed();
    }

    private primeLookupAudioFromGesture(): void {
        if (!this.settings.audioEnabled || !this.settings.autoPlayAudio) return;
        this.audio.primeUserGesture();
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
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        const candidate = this.renderedWordPointerLookupCandidate(word, event.clientX, event.clientY, event.target);
        if (candidate) void this.showLookupCandidate(candidate, 'hover', { hoverLookupGeneration });
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
    }

    private finishMiddlePressLookup(event: PointerEvent, pressLookup: PressLookupState): void {
        event.preventDefault();
        event.stopPropagation();
        this.finishMiddleMouseLookup(pressLookup);
        if (this.activePopoverMode === 'hover' && !this.isHoverContextActive()) this.scheduleHoverClose();
    }

    private shouldCaptureMiddleMouseLookup(event: MouseEvent | PointerEvent): boolean {
        if (this.settings.popupActivationMode === 'off' || !this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
        if (this.isInsideActivePopover(event.target as Node | null)) return false;
        return isMousePointerEvent(event) && !this.isNativeMiddleClickTarget(eventElement(event));
    }

    private captureMiddleMouseLookup(event: PointerEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.suppressMiddleAuxClickUntil = Date.now() + 1200;
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
            '[role=button]',
            '[contenteditable=true]',
            '[data-jpdb-reader-root]',
        ].join(',')));
    }

    private wordFromEventTarget(target: EventTarget | null): HTMLElement | null {
        const element = target instanceof Element ? target : null;
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canLookupReaderWord(word) ? word : null;
    }

    private wordFromPoint(
        x: number,
        y: number,
        surface: HTMLElement | null = null,
        canUseWord: (word: HTMLElement) => boolean = word => this.canLookupReaderWord(word),
    ): HTMLElement | null {
        if (typeof document.elementsFromPoint !== 'function') return null;
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word
                && this.readerWordBelongsToPointerSurface(word, surface)
                && canUseWord(word)
                && this.readerWordMatchesPointerGeometry(word, x, y)) return word;
        }
        return null;
    }

    private hoverReaderWordFromPointStack(x: number, y: number, surface: HTMLElement | null = null): HTMLElement | null {
        if (typeof document.elementsFromPoint !== 'function') return null;
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word
                && this.readerWordBelongsToPointerSurface(word, surface)
                && this.canHoverLookupReaderWord(word)
                && this.readerWordMatchesPointerGeometry(word, x, y)) return word;
        }
        return null;
    }

    private preloadHoverWordAudio(word: HTMLElement): void {
        const card = this.preloadableReaderWordCard(word);
        if (!card) return;
        this.preloadReaderCardAudio(card, {
            sourceLimit: 1,
            candidateLimit: 1,
            prepareAudio: this.shouldPrepareHoverWordAudio(word),
        });
        if (this.canPreloadBackgroundReaderAudio()) this.scheduleNearbyReaderWordAudioPreloads(word);
    }

    private preloadReaderWordAudio(word: HTMLElement, options: ReaderAudioPreloadOptions = {}): boolean {
        if (!this.canPreloadReaderAudio()) return false;
        const card = this.preloadableReaderWordCard(word);
        if (!card) return false;
        return this.preloadReaderCardAudio(card, options);
    }

    private preloadReaderCardAudio(card: JPDBCard, options: ReaderAudioPreloadOptions = {}): boolean {
        const limits = audioPreloadLimits(options);
        const key = cardKey(card);
        const prepareAudio = Boolean(limits.prepareAudio);
        if (prepareAudio && this.preloadedPreparedTermAudioKeys.has(key)) return false;
        if (!prepareAudio && this.preloadedTermAudioKeys.has(key)) return false;
        if (!this.audio.preload(card, limits)) return false;
        this.rememberPreloadedTermAudioKey(key);
        if (prepareAudio) this.rememberPreloadedPreparedTermAudioKey(key);
        return true;
    }

    private shouldPrepareHoverWordAudio(word: HTMLElement): boolean {
        // Prefetch (not just preconnect) the audio whenever a hover will auto-play,
        // so the clip is fetched concurrently with the lookup instead of cold at
        // play time. This must track the auto-play gate exactly — restricting it
        // further (e.g. by the immersion-example heuristic) is what made hover
        // playback lag behind the always-warm click/modal path.
        return canAttemptReaderAutoAudio({
            anchor: word,
            settings: this.settings,
            subtitleSurfaceSelector: SUBTITLE_SURFACE_SELECTOR,
            trigger: 'hover',
            userGesture: false,
        });
    }

    private canPreloadReaderAudio(): boolean {
        return this.settings.audioEnabled;
    }

    private canPreloadBackgroundReaderAudio(): boolean {
        return this.settings.audioEnabled
            && this.settings.autoPlayAudio
            && !isYouTubeRuntimeHost();
    }

    private backgroundPitchEnrichmentOptions(): PitchEnrichmentOptions {
        const options = backgroundPitchEnrichmentOptionsForHost(location.hostname, isCompactPitchEnrichmentViewport());
        if (hasJpdbApiCredential(this.settings) || hasJitenApiCredential(this.settings)) return options;
        const pageBudget = Math.max(0, Math.floor(options.publicLookupPageBudget ?? PITCH_ENRICHMENT_LIMIT));
        const keylessVisibleLimit = pageBudget || PITCH_ENRICHMENT_LIMIT;
        // The jpdb.io pitch lane stays ON for keyless users on EVERY host
        // (within the batch/page/deferred budgets): words outside the local
        // pitch dict otherwise stay grey 'unknown' forever — jiten backfills
        // readings but pitch for many words exists only on jpdb.io. Budgets,
        // pacing, and the deferred per-URL cap are the DOS guard; do not widen
        // them here.
        return {
            ...options,
            publicLookupLimit: Math.max(Math.floor(options.publicLookupLimit ?? 0), keylessVisibleLimit),
            publicLookupTotalLimit: Math.max(Math.floor(options.publicLookupTotalLimit ?? 0), keylessVisibleLimit),
        };
    }

    private nestedPitchEnrichmentOptions(): PitchEnrichmentOptions {
        return nestedPitchEnrichmentOptionsForHost(location.hostname);
    }

    private preloadableReaderWordCard(word: HTMLElement): JPDBCard | null {
        if (word.dataset.jpdbReaderPassive === 'true') return null;
        const card = this.getCachedCard(Number(renderedWordPrivateValue(word, 'vid')), Number(renderedWordPrivateValue(word, 'sid')));
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

    private canClickLookupReaderWord(word: HTMLElement): boolean {
        return this.canLookupReaderWord(word) || canClickLookupPassiveReaderWordElement(word);
    }

    private canHoverLookupReaderWord(word: HTMLElement): boolean {
        return canHoverLookupReaderWordElement(word, this.hasHoverLookupShortcut());
    }

    // pointermove fires far faster than the display refreshes; the hover path
    // does forced-layout reads (caretPositionFromPoint) + querySelectorAll +
    // getClientRects, so running it per raw event janks the main thread and
    // delays the lookup popover (notably over OCR overlays). Coalesce to one
    // hover probe per animation frame using the latest pointer position.
    private queueHoverPointerMove(event: PointerEvent): void {
        this.rememberQueuedHoverPointerPosition(event);
        if (event.buttons) {
            if (this.hoverPointerMoveFrame !== undefined) {
                window.cancelAnimationFrame(this.hoverPointerMoveFrame);
                this.hoverPointerMoveFrame = undefined;
            }
            this.pendingHoverPointerMove = undefined;
            this.cancelPendingHoverLookup();
            return;
        }
        this.pendingHoverPointerMove = event;
        if (this.hoverPointerMoveFrame !== undefined) return;
        this.hoverPointerMoveFrame = requestAnimationFrame(() => {
            this.hoverPointerMoveFrame = undefined;
            const pending = this.pendingHoverPointerMove;
            this.pendingHoverPointerMove = undefined;
            if (pending && !this.isDestroyed) this.handleHoverPointer(pending);
        });
    }

    private rememberQueuedHoverPointerPosition(event: PointerEvent): void {
        // Record geometry before the coalesced probe runs. An earlier hover
        // lookup can finish while this frame is waiting; its stale-result gate
        // must see where the pointer is now, not the previous frame's point.
        if (this.isDestroyed || !this.canUseHoverLookupPointer(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
    }

    private handleHoverPointer(event: PointerEvent): void {
        if (this.shouldIgnoreHoverPointer(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        this.keepPlainSubtitleHoverPause(event.target);
        const insideActivePopover = this.handleActivePopoverHover(event);
        if (insideActivePopover) return;
        const word = this.hoverReaderWordForEvent(event);
        const candidate = this.renderedWordPointerLookupCandidateAtPointer(word, event);
        if (isHoverPopoverTransitActive(this.activeHoverPopoverPointerState())) {
            this.handleHoverPopoverTransit(word, candidate, event);
            return;
        }
        if (!word) {
            this.handlePointerTextHover(event);
            return;
        }
        if (candidate) {
            this.keepSubtitleMiningPauseForPendingHover(word);
            this.preloadHoverWordAudio(word);
            this.handlePointerTextHoverCandidate(event, candidate);
            return;
        }
        this.handleReaderWordHover(word, event);
    }

    private renderedWordPointerLookupCandidateAtPointer(word: HTMLElement | null, event: PointerEvent): PointerTextLookup | null {
        if (!word) return null;
        return this.renderedWordPointerLookupCandidate(word, event.clientX, event.clientY, event.target);
    }

    private handleHoverPopoverTransit(word: HTMLElement | null, candidate: PointerTextLookup | null, event: PointerEvent): void {
        this.cancelHoverClose();
        // Transit is movement, not dwell. Re-arm the settle delay from the
        // latest pointer sample so a slow trip to the frame cannot accidentally
        // switch to page text underneath the deliberate layout gap.
        this.cancelPendingHoverLookup();
        if (candidate) {
            this.handlePointerTextHoverCandidate(event, candidate, { minimumDelayMs: HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS });
            return;
        }
        if (word) {
            this.scheduleHoverLookup(word, event, { minimumDelayMs: HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS });
        }
    }

    private shouldIgnoreHoverPointer(event: PointerEvent): boolean {
        if (this.isDestroyed || this.pressLookup?.source === 'middle' || !this.canUseHoverLookupPointer(event) || this.shouldSuppressPenHover(event)) return true;
        if (this.isLookupInteractionIgnoredTarget(event.target)) {
            this.cancelPendingHoverLookup();
            if (this.activePopoverMode === 'hover') this.dismiss({ suppressHoverTarget: false });
            return true;
        }
        // A held button means the pointer is DRAGGING (resizing the subtitle
        // panel, selecting text, scrubbing), not hovering to read. Running the
        // hover lookup then is pure waste — and live profiling showed it was a
        // dominant cost of subtitle-sidebar resize jank (elementFromPoint +
        // querySelectorAll + getClientRects over every transcript word, per
        // drag move). Skip hover probing entirely while any button is down.
        if (event.buttons) {
            this.cancelPendingHoverLookup();
            return true;
        }
        if (this.suppressHoverForActivePageSelection()) return true;
        if (!this.hasStickyModalPopover()) return false;
        this.cancelPendingHoverLookup();
        this.cancelHoverClose();
        return true;
    }

    private isLookupInteractionIgnoredTarget(target: EventTarget | null): boolean {
        return target instanceof Element
            && Boolean(target.closest('[data-jpdb-reader-surface-ignore], [data-jpdb-reader-interaction-ignore]'));
    }

    private canUseHoverLookupPointer(event: MouseEvent | KeyboardEvent): boolean {
        const pointerType = (event as Partial<PointerEvent>).pointerType;
        return pointerType !== 'touch';
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

    private suppressHoverForActivePageSelection(): boolean {
        if (!this.hasActivePageTextSelection()) return false;
        this.cancelPendingHoverLookup();
        if (this.activePopoverMode === 'hover') this.dismiss({ suppressHoverTarget: false });
        return true;
    }

    private hasActivePageTextSelection(): boolean {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
        for (let index = 0; index < selection.rangeCount; index += 1) {
            try {
                if (!this.isInsideActivePopover(selection.getRangeAt(index).commonAncestorContainer)) return true;
            } catch {
                return true;
            }
        }
        return false;
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
        const word = this.readerWordForPointerEvent(event, { hoverLookup: true });
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private readerWordForPointerEvent(event: MouseEvent, options: { hoverLookup?: boolean; clickLookup?: boolean } = {}): HTMLElement | null {
        const target = event.target instanceof Element ? event.target : null;
        const surface = this.readerPointerSurfaceForTarget(target);
        const direct = target?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        const canUseWord = (word: HTMLElement): boolean => {
            if (options.hoverLookup) return this.canHoverLookupReaderWord(word);
            if (options.clickLookup) return this.canClickLookupReaderWord(word);
            return this.canLookupReaderWord(word);
        };
        if (direct
            && this.readerWordBelongsToPointerSurface(direct, surface)
            && canUseWord(direct)
            && this.readerWordMatchesPointerGeometry(direct, event.clientX, event.clientY)) return direct;
        return this.ocrLineWordForPointer(target, event.clientX, event.clientY)
            // A projected reading is the one thing no rect fallback below can see: its clone lives in a paint-only overlay layer, so the press lands on the page behind the band. Resolve it to the word it annotates before the looser point/caret fallbacks, which would answer for the page instead.
            ?? projectedReadingWordAtPoint(document, event.clientX, event.clientY, word => this.readerWordBelongsToPointerSurface(word, surface) && canUseWord(word))
            ?? (options.hoverLookup ? this.hoverReaderWordFromPointStack(event.clientX, event.clientY, surface) : this.wordFromPoint(event.clientX, event.clientY, surface, canUseWord))
            ?? firstComposedEventGeometryMatch(event, candidate => this.readerWordFromRenderedGeometry(candidate, event.clientX, event.clientY, canUseWord));
    }

    private readerPointerSurfaceForTarget(target: Element | null): HTMLElement | null {
        return target?.closest<HTMLElement>(READER_POINTER_SURFACE_SELECTOR) ?? null;
    }

    private readerWordBelongsToPointerSurface(word: HTMLElement, surface: HTMLElement | null): boolean {
        return !surface || surface.contains(word);
    }

    private readerWordMatchesPointerGeometry(word: HTMLElement, x: number, y: number): boolean {
        // No mirror, or no range-rect API (jsdom, older embedded engines): there is no source geometry to validate against, so keep the direct-target answer. Real browsers validate it.
        if (!word.closest('.jpdb-reader-additive-text-mirror') || typeof Range.prototype.getClientRects !== 'function') return true;
        return readerWordSourcePointScore(word, x, y) !== null;
    }

    private isMiningDrawerHandlePointerEvent(event: MouseEvent | PointerEvent): boolean {
        return Boolean(this.miningDrawerHandleFromEventTarget(event.target)
            ?? (this.eventHasPointTarget(event) ? this.miningDrawerHandleFromPoint(event.clientX, event.clientY) : null));
    }

    private eventHasPointTarget(event: MouseEvent | PointerEvent): boolean {
        return event.type !== 'click' || event.detail > 0 || event.clientX !== 0 || event.clientY !== 0;
    }

    private miningDrawerHandleFromEventTarget(target: EventTarget | null): HTMLButtonElement | null {
        return target instanceof Element ? this.miningDrawerHandleFromElement(target) : null;
    }

    private miningDrawerHandleFromPoint(x: number, y: number): HTMLButtonElement | null {
        if (typeof document.elementsFromPoint !== 'function') return null;
        for (const element of document.elementsFromPoint(x, y)) {
            const handle = this.miningDrawerHandleFromElement(element);
            if (handle) return handle;
        }
        return null;
    }

    private miningDrawerHandleFromElement(element: Element): HTMLButtonElement | null {
        const target = element.closest<HTMLElement>(MINING_DRAWER_POINTER_TARGET_SELECTOR);
        const handle = target?.matches(MINING_DRAWER_HANDLE_SELECTOR)
            ? target as HTMLButtonElement
            : target?.querySelector<HTMLButtonElement>(MINING_DRAWER_HANDLE_SELECTOR) ?? null;
        if (!handle?.isConnected) return null;
        return handle.closest('[data-jpdb-reader-root], .jpdb-reader-popover') ? handle : null;
    }

    private ocrLineWordForPointer(target: Element | null, x: number, y: number): HTMLElement | null {
        const line = (target?.closest?.('.jpdb-ocr-line')
            ?? document.elementFromPoint(x, y)?.closest?.('.jpdb-ocr-line')) as HTMLElement | null;
        return line ? ocrLineWordAtPoint(line, x, y) : null;
    }

    private readerWordFromRenderedGeometry(
        target: Element | null,
        x: number,
        y: number,
        canUseWord: (word: HTMLElement) => boolean = word => this.canLookupReaderWord(word),
    ): HTMLElement | null {
        const scope = this.readerWordGeometryScope(target);
        if (!scope) return null;
        return readerWordAtSourcePointInScope(scope, x, y, canUseWord)
            ?? readerWordAtPointInScope(scope, x, y, word => canUseWord(word)
                && this.readerWordMatchesPointerGeometry(word, x, y));
    }

    private readerWordGeometryScope(target: Element | null): ParentNode | null {
        if (!target) return null;
        const documentPortalScope = documentPortalReaderWordScopeForSource(target);
        if (documentPortalScope) return documentPortalScope;
        // Additive mirrors deliberately never receive pointer events: the
        // page-owned source element stays the event target. Discover the
        // nearest mirror-bearing ancestor structurally before falling back to
        // the legacy prose/control scope list, otherwise a framework label in
        // an unfamiliar component is visibly annotated but cannot be tapped.
        // An open shadow root is also a valid scope after event retargeting at
        // its custom-element host.
        let current: Element | null = target;
        for (let depth = 0; current && depth < 12; depth += 1, current = current.parentElement) {
            const shadowRoot = current.shadowRoot;
            if (shadowRoot?.querySelector('.jpdb-reader-additive-text-mirror .jpdb-reader-word')) return shadowRoot;
            if (current.querySelector(':scope > .jpdb-reader-additive-text-mirror .jpdb-reader-word')) return current;
        }
        const scope = target.closest<HTMLElement>(HOVER_READER_WORD_GEOMETRY_SCOPE_SELECTOR);
        return scope && scope.querySelector('.jpdb-reader-word') ? scope : null;
    }

    private handlePointerTextHover(event: PointerEvent): void {
        const hoverEnabled = this.shouldLookupOnHover(event);
        const candidate = hoverEnabled ? this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS) : null;
        this.handlePointerTextHoverCandidate(event, candidate, { hoverEnabled });
    }

    private handlePointerTextHoverCandidate(
        event: PointerEvent,
        candidate: PointerTextLookup | null,
        options: { hoverEnabled?: boolean; minimumDelayMs?: number } = {},
    ): void {
        const hoverEnabled = this.pointerTextHoverEnabled(event, options.hoverEnabled);
        const activeCandidate = hoverEnabled ? candidate : null;
        if (activeCandidate && this.refreshActivePointerTextHover(activeCandidate, event)) return;
        this.cancelMissingPointerTextCandidate(activeCandidate);
        this.scheduleInactiveHoverClose();
        if (!canSchedulePointerTextHoverLookup(hoverEnabled, activeCandidate)) return;
        this.rememberPointerTextHoverOrigin(event, options.minimumDelayMs);
        this.schedulePointerTextLookup(activeCandidate, event, { minimumDelayMs: options.minimumDelayMs });
    }

    private pointerTextHoverEnabled(event: PointerEvent, configured?: boolean): boolean {
        return configured === undefined ? this.shouldLookupOnHover(event) : configured;
    }

    private rememberPointerTextHoverOrigin(event: PointerEvent, minimumDelayMs?: number): void {
        if (minimumDelayMs === undefined) this.rememberHoverPopoverPointer(event);
    }

    private renderedWordPointerLookupCandidate(
        word: HTMLElement,
        x: number,
        y: number,
        eventTarget: EventTarget | null,
    ): PointerTextLookup | null {
        // Rendered annotations and native page text share the same exact-point
        // candidate shape. The parser now owns the lexical span; this layer
        // contributes geometry only and never narrows via ICU segmentation or
        // card metadata.
        return pointerTextLookupFromRenderedWord(word, x, y)
            ?? this.lookupCandidateFromPoint(x, y, eventTarget, HOVER_POINTER_TEXT_LOOKUP_OPTIONS);
    }

    private renderedWordLookupCandidateForActivation(word: HTMLElement, event: MouseEvent): PointerTextLookup | null {
        const candidate = this.renderedWordPointerLookupCandidate(word, event.clientX, event.clientY, event.target);
        if (candidate || this.eventHasPointTarget(event)) return candidate;
        return pointerTextLookupFromRenderedWordStart(word);
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
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.cancelHoverClose();
            this.refreshActiveHoverAnchor(word);
            if (this.shouldRetryHoverAudio(word, event)) this.retryActiveHoverAudio(word, hoverLookupKey);
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        // Capture the placement point only for a NEW hover. Once mounted,
        // hydration may resize/reposition the frame several times; updating this
        // point on every move over the same word made each resize chase the cursor.
        this.rememberHoverPopoverPointer(event);
        this.keepSubtitleMiningPauseForPendingHover(word);
        this.preloadHoverWordAudio(word);
        this.scheduleHoverLookup(word, event);
    }

    private keepSubtitleMiningPauseForPendingHover(word: HTMLElement): void {
        if (!this.settings.subtitleMiningPause || !this.settings.subtitleHoverPause) return;
        if (!word.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR)) return;
        this.pauseVideoForSubtitleMining();
    }

    private keepPlainSubtitleHoverPause(target: EventTarget | null): void {
        const surface = this.plainSubtitleHoverPauseSurface(target);
        if (!surface) return;
        this.activePlainSubtitleHoverSurface = surface;
        this.pauseVideoForSubtitleMining();
    }

    private plainSubtitleHoverPauseSurface(target: EventTarget | null): Element | null {
        if (!this.settings.annotationsPaused
            || !this.settings.subtitleMiningPause
            || !this.settings.subtitleHoverPause
            || !(target instanceof Element)) return null;
        if (target.closest('.jpdb-reader-popover')) return null;
        return target.closest(PLAIN_SUBTITLE_HOVER_PAUSE_SELECTOR);
    }

    private shouldRetryHoverAudio(word: HTMLElement, event: PointerEvent): boolean {
        if (event.type !== 'pointerover' || !this.shouldPrepareHoverWordAudio(word)) return false;
        const related = event.relatedTarget as Node | null;
        return !this.isInsideNode(related, word) && !this.isInsideActivePopover(related);
    }

    private retryActiveHoverAudio(word: HTMLElement, hoverLookupKey: string): void {
        const card = this.cardForRenderedWord(word);
        if (!card) return;
        void this.audioActions.playTermAudio(card, {
            isCurrent: () => this.isActiveHoverLookup(hoverLookupKey) && this.isHoverContextActive(),
            autoPlay: true,
            hoverLookupGeneration: this.hoverLookupGeneration,
        });
    }

    private handleHoverPointerOut(event: PointerEvent): void {
        if (this.isDestroyed || this.hasStickyModalPopover() || !this.canUseHoverLookupPointer(event) || this.shouldSuppressPenHover(event)) return;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        const related = event.relatedTarget as Node | null;
        if (this.handlePlainSubtitleHoverPointerOut(event.target, related)) return;
        if (this.handleActivePopoverPointerOut(event, related)) return;
        this.handleReaderWordPointerOut(event, related);
    }

    private handlePlainSubtitleHoverPointerOut(target: EventTarget | null, related: Node | null): boolean {
        const active = this.activePlainSubtitleHoverSurface;
        if (!active || !(target instanceof Node) || !active.contains(target)) return false;
        const next = this.plainSubtitleHoverPauseSurface(related);
        if (next) {
            this.activePlainSubtitleHoverSurface = next;
            this.clearSubtitleHoverMiningResumeTimer();
            return true;
        }
        this.activePlainSubtitleHoverSurface = undefined;
        if (this.isInsideActivePopover(related)) {
            this.cancelHoverClose();
            return false;
        }
        if (this.activePopoverMode === 'hover') {
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        } else {
            this.scheduleSubtitleMiningVideoResume(this.settings.hoverCloseDelayMs);
        }
        return false;
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
        const pointer = this.lastPointerPosition;
        const pointerWord = pointer && this.isPendingHoverLookup(word, hoverLookupKey)
            ? this.hoverReaderWordFromElement(document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null)
            : null;
        if (pointerWord && pointerWord !== word) return;
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
        if (this.isWithinHoverWordHostControl(word, related)) {
            this.cancelHoverClose();
            return;
        }
        this.scheduleHoverClose(undefined, { ignoreCssHover: true });
    }

    // Native interactive controls (e.g. YouTube action buttons) insert transient
    // hover overlays — ripple, touch-feedback, animated icons — over their label
    // on hover. The pointer moving onto such an overlay within the SAME control
    // as the hovered word fires pointerout with relatedTarget inside that
    // control; it is not a real exit. Closing here would thrash the hover
    // popover open/closed as the overlay churns pointerout/pointerover. Treat
    // staying anywhere within the word's host control as still hovering.
    private isWithinHoverWordHostControl(word: HTMLElement, related: Node | null): boolean {
        if (!related) return false;
        const control = this.hoverWordHostControl(word);
        if (!control) return false;
        const relatedElement = related instanceof HTMLElement ? related : related.parentElement;
        return Boolean(relatedElement && control.contains(relatedElement));
    }

    private hoverWordHostControl(word: HTMLElement): HTMLElement | null {
        return this.hoverWordOwnership.hostControl(word);
    }

    private scheduleHoverLookupAtPointer(event: KeyboardEvent): void {
        if (this.isDestroyed || !this.lastPointerPosition) return;
        const pointer = this.lastPointerPosition;
        this.hoverPopoverPointerPosition = { ...pointer };
        this.scheduleHoverLookupForPointer(pointer, event);
    }

    private scheduleHoverLookupForPointer(pointer: { x: number; y: number }, event: KeyboardEvent): void {
        const target = document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null;
        const word = this.hoverReaderWordFromElement(target);
        if (word) {
            this.scheduleHoverLookup(word, event);
            return;
        }
        const candidate = this.lookupCandidateFromPoint(pointer.x, pointer.y, target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS);
        if (candidate) this.schedulePointerTextLookup(candidate, event);
    }

    private hoverReaderWordFromElement(element: HTMLElement | null): HTMLElement | null {
        const word = element?.closest?.('.jpdb-reader-word') as HTMLElement | null;
        return word && this.canHoverLookupReaderWord(word) ? word : null;
    }

    private dismissModalPopoverForOutsidePointer(event: PointerEvent): void {
        if (this.isDestroyed || this.activePopoverMode !== 'modal' || !this.activePopover) return;
        if (this.isInsideActivePopover(event.target as Node | null)) return;
        if (this.shouldKeepModalPopoverForOutsidePointer(event.target as Node | null)) return;
        // preventDefault keeps the press from starting a fresh native selection or
        // caret drag on whatever it landed on; the explicit clear then retires the
        // selection the popup was showing. Without the clear the highlight (and, on
        // touch, its selection handles and system callout) outlives the popup.
        if (getSelectionText()) {
            event.preventDefault();
            clearDocumentSelection();
        }
        this.dismiss({ suppressHoverTarget: true });
    }

    private shouldKeepModalPopoverForOutsidePointer(target: Node | null): boolean {
        const element = target instanceof Element ? target : target?.parentElement;
        // A lookup stacked over the settings dialog should collapse back to settings
        // when the user taps the settings panel behind it. The settings form carries
        // data-jpdb-reader-root, so it would otherwise match the owned-surface
        // keep-open selector and trap the stacked lookup open (notably on touch).
        if (this.isPointerOnStackedSettingsDialog(element)) return false;
        return keepsModalPopoverForOwnedSurface(element);
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
        this.scheduleRepositionActivePopoverFrame();
    }

    // Coalesce reposition requests (ResizeObserver bursts during hydration,
    // scroll) to at most one forced-layout reposition per animation frame.
    private scheduleRepositionActivePopoverFrame(): void {
        if (this.popoverRepositionFrame !== undefined) return;
        this.popoverRepositionFrame = window.requestAnimationFrame(() => {
            this.popoverRepositionFrame = undefined;
            if (this.isDestroyed) return;
            if (this.popoverViewportChangePending) {
                this.popoverViewportChangePending = false;
                this.repositionActivePopoverAfterViewportChange();
                return;
            }
            this.repositionActivePopover();
        });
    }

    private scheduleActivePopoverViewportChange(): void {
        const popover = this.repositionableActivePopover();
        if (!popover || (overlayViewport().pageScale === 1 && !hasOverlayPageScale(popover))) return;
        this.popoverViewportChangePending = true;
        this.scheduleRepositionActivePopoverFrame();
    }

    private repositionActivePopoverAfterViewportChange(): void {
        const popover = this.repositionableActivePopover();
        if (!popover) return;
        const relock = this.activePopoverPositionLocked && this.activePopoverMode !== 'hover';
        if (relock) {
            this.activePopoverPositionLocked = false;
            this.activePopoverLockedPosition = undefined;
            this.refreshActivePopoverAnchorRect();
        }
        this.repositionActivePopover();
        if (relock && popover.isConnected) this.lockActivePopoverPosition(this.popoverOverlayRect(popover));
    }

    private scheduleHoverLookup(
        word: HTMLElement,
        event: MouseEvent | KeyboardEvent,
        options: { minimumDelayMs?: number } = {},
    ): void {
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.shouldSkipHoverLookupSchedule(word, hoverLookupKey)) return;

        this.cancelHoverClose();
        if (this.retargetPendingHoverLookup(word, hoverLookupKey, options.minimumDelayMs)) return;
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = word;
        this.hoverPendingLookupKey = hoverLookupKey;
        const runLookup = () => {
            this.rememberSettledHoverPopoverPointer(options.minimumDelayMs);
            this.runScheduledHoverLookup(word, event, hoverLookupGeneration);
        };
        this.startHoverLookupAfterDelay(runLookup, hoverLookupScheduleDelay({
            switchesAnchor: this.activePopoverMode === 'hover' && Boolean(this.activeHoverWord) && this.activeHoverWord !== word,
            hoverOpenDelayMs: this.settings.hoverOpenDelayMs,
            minimumDelayMs: options.minimumDelayMs,
        }));
    }

    private retargetPendingHoverLookup(word: HTMLElement, hoverLookupKey: string, minimumDelayMs?: number): boolean {
        if (minimumDelayMs !== undefined) return false;
        if (!this.hoverLookupTimer || !this.hoverPendingWord) return false;
        this.hoverPendingWord = word;
        this.hoverPendingLookupKey = hoverLookupKey;
        return true;
    }

    private rememberSettledHoverPopoverPointer(minimumDelayMs?: number): void {
        if (minimumDelayMs === undefined || !this.lastPointerPosition) return;
        this.hoverPopoverPointerPosition = { ...this.lastPointerPosition };
    }

    private startHoverLookupAfterDelay(runLookup: () => void, delay: number): void {
        if (delay === 0) {
            runLookup();
            return;
        }
        this.hoverLookupTimer = window.setTimeout(runLookup, delay);
    }

    private shouldSkipHoverLookupSchedule(word: HTMLElement, hoverLookupKey: string): boolean {
        if (this.isSuppressedHoverLookup(word, hoverLookupKey)) return true;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(word);
            return true;
        }
        return (this.activePopoverMode === 'hover' && this.activeHoverWord === word)
            || this.isPendingHoverLookup(word, hoverLookupKey)
            || Boolean(hoverLookupKey && this.hoverLookupInFlightKey === hoverLookupKey);
    }

    private isSuppressedHoverLookup(word: HTMLElement, hoverLookupKey: string): boolean {
        return this.suppressedHoverWord === word || Boolean(hoverLookupKey && this.suppressedHoverLookupKey === hoverLookupKey);
    }

    private isPendingHoverLookup(word: HTMLElement, hoverLookupKey: string): boolean {
        return Boolean((this.hoverPendingWord === word || (hoverLookupKey && this.hoverPendingLookupKey === hoverLookupKey)) && this.hoverLookupTimer);
    }

    private runScheduledHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent, hoverLookupGeneration: number): void {
        if (this.hoverLookupGeneration !== hoverLookupGeneration) return;
        this.hoverLookupTimer = undefined;
        this.hoverPendingWord = undefined;
        this.hoverPendingLookupKey = '';
        const activeWord = this.scheduledHoverWord(word);
        if (!activeWord || !this.canRunScheduledHoverLookup(activeWord, event)) return;
        this.startScheduledHoverWordLookup(activeWord, hoverLookupGeneration);
    }

    private scheduledHoverWord(fallbackWord: HTMLElement): HTMLElement | null {
        const pointer = this.lastPointerPosition;
        if (pointer) {
            const liveWord = this.liveReaderWordAtPointer(pointer.x, pointer.y);
            if (liveWord) return liveWord;
        }
        return fallbackWord.isConnected ? fallbackWord : null;
    }

    private startScheduledHoverWordLookup(activeWord: HTMLElement, hoverLookupGeneration: number): void {
        const activeHoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        const pointer = this.lastPointerPosition;
        if (!pointer) return;
        const target = document.elementFromPoint(pointer.x, pointer.y);
        const candidate = this.renderedWordPointerLookupCandidate(activeWord, pointer.x, pointer.y, target);
        if (!candidate) return;
        if (activeHoverLookupKey) this.hoverLookupInFlightKey = activeHoverLookupKey;
        void this.showLookupCandidate(candidate, 'hover', { hoverLookupGeneration }).finally(() => {
            if (this.hoverLookupInFlightKey === activeHoverLookupKey) this.hoverLookupInFlightKey = '';
        });
    }

    private canRunScheduledHoverLookup(activeWord: HTMLElement, event: MouseEvent | KeyboardEvent): boolean {
        const hoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        if (!this.isRunnableScheduledHoverWord(activeWord, hoverLookupKey)) return false;
        if (this.isActiveHoverLookup(hoverLookupKey)) {
            this.refreshActiveHoverAnchor(activeWord);
            return false;
        }
        if (!this.canOpenHoverLookupForWord(activeWord, event)) return false;
        return true;
    }

    private isRunnableScheduledHoverWord(activeWord: HTMLElement, hoverLookupKey: string): boolean {
        return activeWord.isConnected && !this.isSuppressedHoverLookup(activeWord, hoverLookupKey);
    }

    private canOpenHoverLookupForWord(activeWord: HTMLElement, event: MouseEvent | KeyboardEvent): boolean {
        return this.isWordHoverActive(activeWord)
            && this.canUseHoverLookupPointer(event)
            && this.settings.lookupOnHover
            && shortcutIsPressed(this.settings.shortcuts.hoverLookup ?? '', event, this.pressedKeys);
    }

    private schedulePointerTextLookup(
        candidate: PointerTextLookup,
        event: MouseEvent | KeyboardEvent,
        options: { minimumDelayMs?: number } = {},
    ): void {
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
            if (options.minimumDelayMs !== undefined && this.lastPointerPosition) {
                this.hoverPopoverPointerPosition = { ...this.lastPointerPosition };
            }
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
        this.startHoverLookupAfterDelay(runLookup, hoverLookupScheduleDelay({
            switchesAnchor: this.activePopoverMode === 'hover',
            hoverOpenDelayMs: this.settings.hoverOpenDelayMs,
            minimumDelayMs: options.minimumDelayMs,
        }));
    }

    private isPointerTextLookupAlreadyQueued(hoverLookupKey: string): boolean {
        return Boolean(hoverLookupKey && (
            (this.hoverPendingLookupKey === hoverLookupKey && this.hoverLookupTimer)
            || this.hoverLookupInFlightKey === hoverLookupKey
        ));
    }

    private cancelHoverClose(): void {
        this.hoverClose.cancel();
    }

    // A <details> inside the hover popover toggled, resizing the popover under a
    // possibly-stationary pointer. Pin the current pointer position so the hover
    // context stays "active" until the pointer genuinely moves off — see
    // HOVER_POPOVER_RESIZE_STICKY_MS.
    private markHoverPopoverSelfResize(): void {
        if (this.activePopoverMode !== 'hover' || !this.activePopover || !this.lastPointerPosition) return;
        this.hoverResizeStickyPointer = { ...this.lastPointerPosition };
        this.hoverResizeStickyExpiry = Date.now() + HOVER_POPOVER_RESIZE_STICKY_MS;
        // The spurious pointerleave from the resize may already have scheduled a
        // close; drop it so the popover holds while the pointer is unmoved.
        this.cancelHoverClose();
    }

    private isHoverPopoverResizeStickyActive(): boolean {
        const sticky = this.hoverResizeStickyPointer;
        if (!sticky || !this.activePopover || this.activePopoverMode !== 'hover') return false;
        if (Date.now() > this.hoverResizeStickyExpiry) {
            this.clearHoverPopoverResizeSticky();
            return false;
        }
        const pointer = this.lastPointerPosition;
        if (pointer && pointer.x === sticky.x && pointer.y === sticky.y) return true;
        // The pointer actually moved — the grace is over and normal hover rules
        // decide from here (re-hovering the popover keeps it, leaving closes it).
        this.clearHoverPopoverResizeSticky();
        return false;
    }

    private clearHoverPopoverResizeSticky(): void {
        this.hoverResizeStickyPointer = undefined;
        this.hoverResizeStickyExpiry = 0;
    }

    // Asks the ONE close owner for a close in `delay` ms. The deadline is monotonic
    // (see HoverCloseController), so the callers that re-ask per pointer frame no
    // longer push the close out of reach while the hand keeps moving.
    private scheduleHoverClose(delay = this.settings.hoverCloseDelayMs, options: HoverContextQuery = {}): void {
        if (this.activePopoverMode !== 'hover') return;
        this.hoverClose.arm(delay, options);
    }

    private shouldDeferSubtitleMiningResumeForHoverClose(): boolean {
        if (this.activePopoverMode !== 'hover' || !this.subtitleMiningPausedVideo) return false;
        if (this.activeHoverWord?.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR)) return true;
        const pointer = this.lastPointerPosition;
        if (!pointer) return false;
        const target = document.elementFromPoint(pointer.x, pointer.y);
        if (target instanceof Element && target.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR)) return true;
        const liveWord = this.hoverReaderWordFromPointStack(pointer.x, pointer.y)
            ?? (target instanceof Element ? this.readerWordFromRenderedGeometry(target, pointer.x, pointer.y, item => this.canHoverLookupReaderWord(item)) : null);
        return Boolean(liveWord?.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR));
    }

    private isHoverContextActive(options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        if (this.hasDirectHoverContext()) return true;
        if (this.activePointerTextLookup) return this.isPointerTextHoverContextActive(options);
        if (this.hasActiveLookupHoverContext(options)) return true;
        return this.hasPopoverHoverContext(options);
    }

    private hasActiveLookupHoverContext(options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }): boolean {
        return Boolean(this.activeHoverWord && this.isWordHoverActive(this.activeHoverWord, options));
    }

    private hasPopoverHoverContext(options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean }): boolean {
        if (this.isPopoverCssHoverActive(options)) return true;
        const target = this.currentHoverPointerTarget(options);
        return Boolean(target && this.isInsideActiveHoverContext(target));
    }

    private hasDirectHoverContext(): boolean {
        // Firefox can transiently clear CSS :hover while a scroll changes the
        // descendant under a stationary cursor. Exact hit-testing remains
        // trustworthy both for the frame itself and for its narrow travel path.
        return this.hasLatchedHoverPopoverPointer()
            || this.isHoverPopoverResizeStickyActive()
            || this.isMiddlePressHoverContextActive()
            || isActiveHoverPopoverPointerContext(this.activeHoverPopoverPointerState());
    }

    private activeHoverPopoverPointerState(): HoverPopoverPointerState {
        return {
            mode: this.activePopoverMode,
            popover: this.activePopover,
            point: this.lastPointerPosition,
            origin: this.hoverPopoverPointerPosition,
        };
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
        const current = this.currentPointerTextHoverCandidateAtPoint(
            this.lastPointerPosition.x,
            this.lastPointerPosition.y,
            target,
        );
        const active = this.activePointerTextLookup;
        if (!active || !current) return false;
        // Mirror rebuild on reactive SPAs replaces the text anchor, breaking the node-identity
        // check in samePointerTextLookupTarget. When the original anchor is detached, accept a
        // freshly-resolved candidate with the same surface text + overlapping offset and
        // re-anchor instead of closing. Connected anchors keep the strict identity check.
        if (!active.anchor.isConnected) return this.reanchorDisconnectedPointerText(active, current);
        return samePointerTextLookupTarget(active, current)
            && pointerOffsetInsideLiveLookup(active, current.offset);
    }

    private reanchorDisconnectedPointerText(active: ActivePointerTextLookup, current: PointerTextLookup): boolean {
        if (active.text !== current.text || !pointerOffsetInsideLiveLookup(active, current.offset)) return false;
        this.activePointerTextLookup = { ...active, anchor: current.anchor };
        this.refreshActiveHoverAnchor(current.anchor);
        return true;
    }

    private isPopoverCssHoverActive(options: { ignoreCssHover?: boolean }): boolean {
        return !options.ignoreCssHover && Boolean(this.activePopover?.matches(':hover'));
    }

    private currentHoverPointerTarget(options: { ignorePointerPosition?: boolean }): Element | null {
        if (options.ignorePointerPosition || !this.lastPointerPosition) return null;
        return document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
    }

    private isInsideActiveHoverContext(target: Element): boolean {
        const anchor = this.activeHoverWord ?? (this.activePopoverMode === 'hover' ? this.activePopoverAnchor : undefined);
        return this.isInsideActivePopover(target)
            || Boolean(anchor && (
                this.isInsideNode(target, anchor)
                || this.isWithinHoverWordHostControl(anchor, target)
            ));
    }

    private isWordHoverActive(word: HTMLElement, options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        // Reactive SPAs (YouTube) reconcile and REPLACE rendered word nodes underneath a
        // stationary cursor. The stored anchor becomes detached, so the usual `:hover` /
        // geometry checks all fail even though the same logical word still sits under the
        // pointer. Re-resolve the live word at the last pointer position and re-anchor when
        // it is the SAME vid:sid; only do this for a disconnected node so the connected checks
        // can keep treating a live DOM node as the source of truth.
        if (!word.isConnected) return this.reanchorDisconnectedHoverWord(word, options);
        return this.hoverWordOwnership.isActive(word, this.lastPointerPosition, options);
    }

    private reanchorDisconnectedHoverWord(word: HTMLElement, options: { ignorePointerPosition?: boolean }): boolean {
        if (!this.lastPointerPosition) return false;
        const replacement = this.liveReaderWordAtPointer(this.lastPointerPosition.x, this.lastPointerPosition.y);
        if (!replacement || replacement === word || renderedWordElementKey(replacement) !== renderedWordElementKey(word)) return false;
        this.refreshActiveHoverAnchor(replacement);
        void options;
        return true;
    }

    private liveReaderWordAtPointer(x: number, y: number): HTMLElement | null {
        const target = document.elementFromPoint(x, y);
        return this.hoverReaderWordFromPointStack(x, y)
            ?? this.ocrLineWordForPointer(target, x, y)
            ?? (target instanceof Element ? this.readerWordFromRenderedGeometry(target, x, y, item => this.canHoverLookupReaderWord(item)) : null);
    }

    private hoverLookupKeyForWord(word: HTMLElement): string {
        const vid = Number(renderedWordPrivateValue(word, 'vid'));
        const sid = Number(renderedWordPrivateValue(word, 'sid'));
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
        const current = this.currentPointerTextHoverCandidateAtPoint(
            this.lastPointerPosition.x,
            this.lastPointerPosition.y,
            document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y),
        );
        return Boolean(current
            && samePointerTextLookupTarget({ anchor: candidate.anchor, text: candidate.text, start: candidate.start, end: candidate.end }, current)
            && pointerOffsetInsideLiveLookup({ anchor: candidate.anchor, text: candidate.text, start: candidate.start, end: candidate.end }, current.offset));
    }

    private currentPointerTextHoverCandidateAtPoint(x: number, y: number, target: EventTarget | null): PointerTextLookup | null {
        // Prefer the annotation surface owned by the actual event target. A
        // transparent OCR overlay can geometrically overlap a YouTube portal
        // word; consulting the global point stack first would keep validating
        // the old OCR token after the pointer had reached the portal source.
        const word = this.readerWordOwnedByPointerTarget(target, x, y)
            ?? this.liveReaderWordAtPointer(x, y);
        const candidate = this.pointerTextCandidateForRenderedWord(word, x, y, target);
        return candidate ?? this.lookupCandidateFromPoint(x, y, target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS);
    }

    private readerWordOwnedByPointerTarget(target: EventTarget | null, x: number, y: number): HTMLElement | null {
        if (!(target instanceof Element)) return null;
        return this.readerWordFromRenderedGeometry(target, x, y, item => this.canHoverLookupReaderWord(item));
    }

    private pointerTextCandidateForRenderedWord(
        word: HTMLElement | null,
        x: number,
        y: number,
        target: EventTarget | null,
    ): PointerTextLookup | null {
        if (!word) return null;
        return this.renderedWordPointerLookupCandidate(word, x, y, target);
    }

    private hasActiveHoverPopover(): boolean {
        return this.activePopoverMode === 'hover' && Boolean(this.activePopover);
    }

    private refreshActiveHoverAnchor(anchor: HTMLElement): void {
        if (!this.canRefreshActiveHoverAnchor(anchor)) return;
        if (this.activePopoverAnchor === anchor && (this.activePointerTextLookup || this.activeHoverWord === anchor)) return;
        this.activePopoverAnchor = anchor;
        if (!this.activePointerTextLookup) this.activeHoverWord = anchor;
        this.retainOcrLookupLineForAnchor(anchor);
        this.captureActiveHoverAnchorRect(anchor);
        this.repositionActivePopover();
    }

    private canRefreshActiveHoverAnchor(anchor: HTMLElement): boolean {
        return Boolean(this.activePopover && this.activePopoverMode === 'hover' && anchor.isConnected);
    }

    private captureActiveHoverAnchorRect(anchor: HTMLElement): void {
        this.activePopoverAnchorRect = popoverAnchorRect(anchor, this.activePopoverAnchorRect);
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

    private lookupText(text: string, sentence = text, options: TextLookupOptions = {}, scope: CardLookupTargetSnapshot = this.cardLookup.captureTarget()): Promise<void> {
        return this.cardLookup.lookupText(text, sentence, options, scope);
    }

    private resolveLookupCard(card: JPDBCard, scope = this.cardLookup.captureTarget()): Promise<JPDBCard> {
        return this.cardLookup.resolveLookupCard(card, scope);
    }

    private resolveLookupCardForInitialRender(card: JPDBCard, scope = this.cardLookup.captureTarget()): Promise<JPDBCard> {
        return this.cardLookup.resolveLookupCardForInitialRender(card, scope);
    }

    private publicLookupCard(
        term: string,
        exact = false,
        readingOrOptions: string | { allowCandidateLookup?: boolean } = '',
        options: { allowCandidateLookup?: boolean } = {},
    ): Promise<JPDBCard | undefined> {
        return this.cardLookup.publicLookupCard(term, exact, readingOrOptions, options);
    }

    private publicLookupFallbackCards(
        cards: readonly JPDBCard[],
        options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup'> = {},
        scope = this.cardLookup.captureTarget(),
    ): Promise<Map<string, JPDBCard>> {
        return this.cardLookup.publicLookupFallbackCards(cards, options, scope);
    }

    private lookupFallbackApiCard(
        card: JPDBCard,
        options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup'> = {},
        scope = this.cardLookup.captureTarget(),
    ): Promise<JPDBCard | undefined> {
        return this.cardLookup.lookupFallbackApiCard(card, options, scope);
    }

    private localLookupEntries(selected: string): Promise<YomitanTermEntry[]> {
        return this.settings.localDictionariesEnabled
            ? this.dictionaries.lookup(selected, selected, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private activeTextLookupTrigger(): 'modal' | 'hover' {
        return this.activePopoverMode === 'hover' ? 'hover' : 'modal';
    }

    private textLookupPreviousNavigationEntry(trigger: 'modal' | 'hover', navigation: CardNavigationMode): PopupNavigationEntry | undefined {
        return trigger === 'modal' && navigation === 'push-current'
            ? this.activePopoverNavigationEntry()
            : undefined;
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
        this.primeLookupAudioFromGesture();
        const navigation = trigger === 'modal' ? 'push-current' : 'reset';
        const candidate = this.renderedWordLookupCandidateForActivation(nestedWord, event);
        if (candidate) {
            void this.showLookupCandidate(candidate, trigger, {
                navigation,
                preservePosition: trigger === 'modal',
                userGesture: true,
            });
        } else {
            // Passive reference shells are clickable before the nested
            // re-parse stamps token spans; without a resolvable candidate the
            // word's own identity still beats the whole-compound reference.
            void this.showWord(nestedWord, { trigger: 'click', navigation, userGesture: true });
        }
        return true;
    }

    private shouldLookupNestedDictionaryWord(nestedWord: HTMLElement, query: string): boolean {
        if (isOcrLineFrameWord(nestedWord) || isNativePageLookupBlocked(nestedWord)) return false;
        if (!dictionaryLookupWordMatchesLink(nestedWord, query)) return true;
        return this.isInsideActivePopover(nestedWord)
            && nestedWord.hasAttribute('data-vid')
            && nestedWord.hasAttribute('data-sid')
            && nestedWord.dataset.jpdbReaderRelatedWord !== 'true';
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
        if (!isTargetLanguageText(query)) return;
        const scope = this.cardLookup.captureTarget();
        const normalizedReading = reading.replace(/\s+/g, ' ').trim();
        const navigation: CardNavigationMode = trigger === 'modal' ? 'push-current' : 'reset';
        const done = log.time('dictionaryReferenceLookup', { query, hasReading: Boolean(normalizedReading), sourceDictionary, trigger });
        try {
            const previousNavigationEntry = this.textLookupPreviousNavigationEntry(trigger, navigation);
            const jpdbCard = sourceDictionary === 'JPDB'
                ? await this.publicLookupCard(query, true, normalizedReading)
                : undefined;
            if (!scope.isCurrent()) return;
            if (jpdbCard) {
                this.parser.cacheCards?.([jpdbCard]);
                await this.showCard(jpdbCard, query, anchor, { autoPlay: false, trigger, navigation, preservePosition, previousNavigationEntry });
                return;
            }
            const localEntries = await this.dictionaryReferenceLocalEntries(query, normalizedReading, sourceDictionary);
            if (!scope.isCurrent()) return;
            const preferredEntry = localEntries.find(entry => entry.dictionary === sourceDictionary) ?? localEntries[0];
            if (preferredEntry) {
                await this.showCard(
                    this.parser.localCardFromEntry(preferredEntry, scope.target),
                    query,
                    anchor,
                    { autoPlay: false, trigger, navigation, preservePosition, previousNavigationEntry },
                );
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
        return this.lookupCandidateFromTextPosition(position.node, characterOffset, options);
    }

    private pointerLookupElement(x: number, y: number, eventTarget: EventTarget | null, options: PointerTextLookupOptions = {}): Element | null {
        const element = eventTarget instanceof Element ? eventTarget : document.elementFromPoint(x, y);
        return element && !this.isNativeTextLookupTarget(element, options) && !isNativePageLookupBlocked(element) ? element : null;
    }

    private usablePointerTextPosition(element: Element, x: number, y: number): NonNullable<ReturnType<typeof caretTextPositionFromPoint>> | null {
        const position = caretTextPositionFromPoint(x, y);
        return this.isUsablePointerTextPosition(element, position) ? position : null;
    }

    private lookupCandidateFromTextPosition(node: Text, characterOffset: number, options: PointerTextLookupOptions = {}): PointerTextLookup | null {
        return pointerTextLookupFromTextNode(node, characterOffset, { allowInteractiveText: options.allowPassiveInteractionText });
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
            || !!target.closest('input,textarea,select,[contenteditable],.jpdb-reader-word')
            || this.isSettingsNativeControlText(target);
    }

    private isReaderImmersionExampleSentenceText(target: Element): boolean {
        return Boolean(target.closest('[data-jpdb-reader-root] [data-immersion-kit] .jpdb-reader-example-sentence'));
    }

    private isSettingsNativeControlText(target: Element): boolean {
        return Boolean(target.closest('.jpdb-reader-settings')
            && target.closest('a[href],button,input,label,select,textarea,[role=button],[role=checkbox],[role=link],[role=menuitem],[role=option],[role=radio],[role=switch],[role=tab],[data-action]'));
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
        const scope = this.cardLookup.captureTarget();
        try {
            const token = await this.parser.lookupTokenAt(
                candidate.text,
                candidate.offset,
                { start: candidate.start, end: candidate.end },
                this.pointerTextJpdbParseOptions(),
            );
            if (!scope.isCurrent() || !token) return;
            await this.showPointerTextCard(token.card, sentence, candidate, token, trigger, options);
        } catch (error) {
            if (scope.isCurrent()) log.warn('Authoritative pointer lookup failed', { offset: candidate.offset }, error);
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
            pointerTextLookup,
            userGesture: options.userGesture,
        });
    }

    private isCurrentRenderedWordHover(word: HTMLElement, hoverLookupKey: string, hoverLookupGeneration?: number): boolean {
        if (!this.isCurrentHoverGeneration(hoverLookupGeneration, hoverLookupKey)) return false;
        const activeWord = this.currentRenderedHoverWord(word);
        if (!activeWord) return false;
        const activeMiddlePressLookup = this.pressLookup?.source === 'middle' && this.pressLookup.lastWord === activeWord;
        return this.isRunnableScheduledHoverWord(activeWord, hoverLookupKey)
            && (
                activeMiddlePressLookup
                || (this.isWordHoverActive(activeWord) && this.settings.lookupOnHover)
            );
    }

    private currentRenderedHoverWord(word: HTMLElement): HTMLElement | null {
        if (word.isConnected) return word;
        if (!this.reanchorDisconnectedHoverWord(word, {})) return null;
        return this.activeHoverWord?.isConnected ? this.activeHoverWord : null;
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

    private async showWord(word: HTMLElement, options: RenderedWordLookupOptions = {}): Promise<void> {
        const scope = this.cardLookup.captureTarget();
        if (this.shouldIgnoreRenderedWordLookup(word, options)) return;
        const insideReaderPopup = Boolean(word.closest('.jpdb-reader-popover'));
        const stackOverSettings = options.stackOverSettings || Boolean(word.closest('.jpdb-reader-settings'));
        const card = this.cardForRenderedWord(word);
        if (!card) {
            await this.handleMissingRenderedWordCard(word, { ...options, stackOverSettings }, insideReaderPopup, scope);
            return;
        }
        // The settings self-annotation parse caches reading/pitch skeleton
        // cards without meanings; showing one yields a header-only popup with
        // an empty body. Route those clicks through the fresh uncached-word
        // lookup (full dictionary/public fetch) instead.
        if (stackOverSettings && !insideReaderPopup && options.trigger !== 'hover'
            && !card.meanings.length
            && await this.lookupUncachedPageWord(word, { ...options, stackOverSettings }, scope)) return;
        if (!scope.isCurrent()) return;
        this.rememberRenderedWordMiningContext(word, card, insideReaderPopup);
        const context = this.renderedWordDisplayContext(word, options, insideReaderPopup);
        if (this.refreshActiveRenderedWordHover(word, context)) return;
        if (this.isStaleRenderedWordHover(word, context, options.hoverLookupGeneration)) return;
        this.preloadHoverWordAudio(word);
        if (await this.showAuthoritativeSpanForRenderedWord(word, card, context, options, stackOverSettings, scope)) return;
        if (await this.showOcrKanjiRenderedWord(word, card, context, scope)) return;
        await this.showRenderedWordCard(card, context, options, stackOverSettings, scope);
    }

    // The span authority deliberately stays silent for single-kanji fallback
    // surfaces, so an OCR click on one glyph opens the kanji card instead of
    // a guessed vocabulary parse.
    private async showOcrKanjiRenderedWord(
        word: HTMLElement,
        card: JPDBCard,
        context: RenderedWordDisplayContext,
        scope: CardLookupTargetSnapshot,
    ): Promise<boolean> {
        if (!scope.isCurrent()) return true;
        const ocrKanji = singleKanjiOcrLookupCharacter(word);
        if (!ocrKanji || context.trigger !== 'modal') return false;
        await this.showKanjiCard(card, ocrKanji, ocrKanji, context.anchor, {
            navigation: context.navigation,
            preservePosition: context.insideReaderPopup,
        });
        return true;
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

    private showRenderedWordCard(
        card: JPDBCard,
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
        stackOverSettings: boolean,
        scope: CardLookupTargetSnapshot,
    ): Promise<void> {
        if (!scope.isCurrent()) return Promise.resolve();
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
            // A rendered word's cached card decorates the span already chosen by
            // TermSpanResolver. Never rerun lexical candidate selection here.
            skipInitialCardResolution: true,
        });
    }

    /** Re-resolve only unconfirmed fallback spans so stale fragments can widen;
     * provider-confirmed cards skip this authority pass. */
    private async showAuthoritativeSpanForRenderedWord(
        word: HTMLElement,
        card: JPDBCard | undefined,
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
        stackOverSettings: boolean,
        scope: CardLookupTargetSnapshot,
    ): Promise<boolean> {
        const span = unconfirmedRenderedWordSpan(word, card, context);
        if (!span) return false;
        try {
            const token = await this.parser.lookupTokenAt(
                span.sentence,
                span.start,
                { start: 0, end: span.sentence.length },
                this.pointerTextJpdbParseOptions(),
            );
            if (!scope.isCurrent()) return true;
            if (!token) return false;
            // Re-resolving an existing fallback card needs a strictly wider
            // span to count as an upgrade; a cache miss has nothing on screen
            // worth keeping, so any authoritative answer wins.
            if (card && token.end - token.start <= span.end - span.start) return false;
            if (!card && token.card.source === 'fallback'
                && token.end - token.start <= span.end - span.start) return false;
            this.parser.cacheCards?.([token.card]);
            await this.showRenderedWordCard(
                token.card,
                { ...context, sentence: span.sentence },
                options,
                stackOverSettings,
                scope,
            );
            return true;
        } catch (error) {
            if (!scope.isCurrent()) return true;
            log.warn('Authoritative rendered-word span lookup failed', { expression: card?.spelling ?? word.dataset.expression }, error);
            return false;
        }
    }

    private cardForRenderedWord(word: HTMLElement): JPDBCard | undefined {
        const vid = Number(renderedWordPrivateValue(word, 'vid'));
        const sid = Number(renderedWordPrivateValue(word, 'sid'));
        const card = this.getCachedCard(vid, sid);
        return renderedWordCardForLookup(word, card);
    }

    private async handleMissingRenderedWordCard(
        word: HTMLElement,
        options: RenderedWordLookupOptions,
        insideReaderPopup: boolean,
        scope: CardLookupTargetSnapshot,
    ): Promise<void> {
        if (!scope.isCurrent()) return;
        const { vid, sid } = renderedWordNumericIdentity(word);
        // A cache miss is an unconfirmed span: give the authority the word's
        // sentence first, so a stale fragment resolves to the real word it
        // sits in instead of a text lookup for the fragment's surface.
        const context = this.renderedWordDisplayContext(word, options, insideReaderPopup);
        const uncachedLookup = selectRenderedWordAttempt(
            insideReaderPopup,
            () => this.lookupUncachedPopupWord(word, options, scope),
            () => this.lookupUncachedPageWord(word, options, scope),
        );
        if (await resolveRenderedWordAttempts([
            () => this.showAuthoritativeSpanForRenderedWord(word, undefined, context, options, options.stackOverSettings ?? false, scope),
            uncachedLookup,
        ], () => scope.isCurrent())) return;
        if (options.stackOverSettings) return;
        log.warn('Clicked word cache miss; reparsing', { vid, sid });
        this.scheduleVisiblePageReparse();
    }

    private async lookupUncachedPageWord(
        word: HTMLElement,
        options: RenderedWordLookupOptions,
        scope: CardLookupTargetSnapshot,
    ): Promise<boolean> {
        if (!scope.isCurrent()) return true;
        const expression = renderedWordLookupText(word);
        if (!isLookupableJapaneseText(expression)) return false;
        const trigger = this.renderedWordTrigger(options.trigger, false);
        const navigation = options.navigation ?? renderedWordNavigationMode(false, trigger);
        if (!scope.isCurrent()) return true;
        await this.lookupText(expression, this.renderedWordSentence(word) ?? expression, {
            anchor: renderedWordAnchor(word, false, this.activePopoverAnchor),
            navigation,
            preservePosition: trigger === 'hover',
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, false, trigger, navigation),
            userGesture: options.userGesture,
            trigger,
            hoverLookupGeneration: options.hoverLookupGeneration,
            stackOverSettings: options.stackOverSettings,
        }, scope);
        return true;
    }

    private async lookupUncachedPopupWord(
        word: HTMLElement,
        options: RenderedWordLookupOptions,
        scope: CardLookupTargetSnapshot,
    ): Promise<boolean> {
        if (!scope.isCurrent()) return true;
        const expression = renderedWordLookupText(word);
        if (!isLookupableJapaneseText(expression)) return false;
        const trigger = this.renderedWordTrigger(options.trigger, true);
        const navigation = options.navigation ?? renderedWordNavigationMode(true, trigger);
        const sentence = this.renderedWordSentence(word) ?? expression;
        if (word.closest('.jpdb-reader-example-card')) this.immersionPopover?.rememberTermMiningContext(expression, sentence, word);
        await this.lookupText(expression, sentence, {
            anchor: renderedWordAnchor(word, true, this.activePopoverAnchor),
            navigation,
            preservePosition: true,
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, true, trigger, navigation),
            insideReaderPopup: true,
            userGesture: options.userGesture,
            trigger,
            hoverLookupGeneration: options.hoverLookupGeneration,
        }, scope);
        return true;
    }

    private rememberRenderedWordMiningContext(word: HTMLElement, card: JPDBCard, insideReaderPopup: boolean): void {
        if (!insideReaderPopup || !word.closest('.jpdb-reader-example-card')) return;
        this.immersionPopover?.rememberPageMiningContext(card, this.renderedWordSentence(word), word);
    }

    private renderedWordDisplayContext(
        word: HTMLElement,
        options: { trigger?: 'click' | 'hover'; navigation?: CardNavigationMode; previousNavigationEntry?: PopupNavigationEntry },
        insideReaderPopup: boolean,
    ): RenderedWordDisplayContext {
        const trigger = this.renderedWordTrigger(options.trigger, insideReaderPopup);
        const navigation = options.navigation ?? renderedWordNavigationMode(insideReaderPopup, trigger);
        return {
            sentence: trigger === 'hover' ? this.renderedWordFastHoverSentence(word) : this.renderedWordSentence(word),
            anchor: renderedWordAnchor(word, insideReaderPopup, this.activePopoverAnchor),
            trigger,
            navigation,
            hoverLookupKey: this.renderedWordHoverLookupKey(word, trigger),
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, insideReaderPopup, trigger, navigation),
            insideReaderPopup,
        };
    }

    private renderedWordFastHoverSentence(word: HTMLElement): string | undefined {
        const immersionSentence = this.renderedImmersionExampleSentence(word);
        if (immersionSentence) return immersionSentence;
        const tokenSentence = normalizedLookupText(word.dataset.sentence || '');
        if (tokenSentence) return tokenSentence;
        return normalizedLookupText(renderedWordLookupText(word)) || undefined;
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
        const exampleSentence = word.closest('.jpdb-reader-example-sentence');
        if (!exampleSentence || !this.isInsideImmersionKitContainer(exampleSentence)) return false;
        if (!word.closest('.jpdb-reader-example-target')) return false;
        return cardMatchesRenderedLookupValue(this.lastCard, renderedWordLookupText(word));
    }

    private isInsideImmersionKitContainer(element: Element): boolean {
        for (let current = element.parentElement; current; current = current.parentElement) {
            if (current.hasAttribute('data-immersion-kit')) return true;
        }
        return false;
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
        const previousNavigationEntry = trigger === 'modal' ? options.previousNavigationEntry : undefined;
        this.prepareTokenListNavigation(trigger, navigation);
        const popover = this.createPopover(trigger);
        setInnerHtml(popover, this.renderTokenListHtml(tokens, selected, previousNavigationEntry));
        this.installTokenListHandlers(popover, tokens, anchor, { trigger, navigation, previousNavigationEntry, stackOverSettings: options.stackOverSettings });
        this.mountPopover(popover, anchor, {
            mode: trigger,
            preservePosition: options.preservePosition,
            focusOnMount: options.focusOnMount,
            stackOverSettings: options.stackOverSettings,
        });
        void this.parsePopoverJapanese(popover);
    }

    private prepareTokenListNavigation(trigger: 'modal' | 'hover', navigation: CardNavigationMode): void {
        if (trigger === 'modal' && navigation === 'reset') this.navigation.clearWord();
    }

    private renderTokenListHtml(tokens: JPDBToken[], selected: string, previousNavigationEntry?: PopupNavigationEntry): string {
        return renderTokenListMarkup(tokens, selected, previousNavigationEntry, this.settings);
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
            copySelected: selected => void this.copyTokenListSelection(selected),
        });
    }

    private async copyTokenListSelection(selected: string): Promise<void> {
        await copyText(selected);
        this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord'));
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
        const choice = privateCommands.readTokenChoiceCommandCapability(button);
        if (!choice) return;
        const card = this.getCachedCard(choice.vid, choice.sid);
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
        const scope = this.cardLookup.captureTarget();
        if (!scope.isCurrent()) return;
        const requestedCard = card;
        const trigger = cardDisplayTrigger(options);
        const immediatePitch = trigger === 'modal';
        this.prioritizeQueuedPitchEnrichment(requestedCard, { immediate: immediatePitch });
        if (!options.skipInitialCardResolution) card = await this.resolveLookupCardForInitialRender(card, scope);
        if (this.isDestroyed || typeof document === 'undefined' || !scope.isCurrent()) return;
        sentence = this.preferredCardSentence(sentence, anchor);
        if (card !== requestedCard) this.prioritizeQueuedPitchEnrichment(card, { immediate: immediatePitch });
        this.lastCard = card;
        this.lastCardSentence = sentence;
        const popover = this.createPopover(trigger);
        const navigation = options.navigation ?? 'reset';
        const hoverLookup = this.cardHoverLookupContext(trigger, options);
        const isCurrentHoverCard = () => scope.isCurrent()
            && this.isCurrentCardHoverLookup(trigger, hoverLookup);
        this.navigation.updateWord(card, sentence, trigger, navigation, options.previousNavigationEntry);
        this.navigation.clearKanji();
        const done = log.time('showCard', { term: card.spelling, source: cardSourceLabel(card), trigger });
        this.rememberCardMiningContext(card, sentence, anchor, options);
        const fallbackAnkiLookup = this.fallbackCardAnkiLookup();
        this.lastAnkiLookup = fallbackAnkiLookup;
        this.maybePreloadLookupCardAudio(card, options, anchor);
        let renderData: CardRenderDataLoad | undefined;
        const loadRenderData = (): CardRenderDataLoad => {
            renderData ??= this.noteInteractiveCardLoad(this.cardRenderData.load(card));
            return renderData;
        };
        if (trigger !== 'hover') loadRenderData();
        const requestId = ++this.cardRenderRequest;

        const mounted = await this.mountInitialCardShell(popover, card, sentence, anchor, {
            trigger,
            navigation,
            options,
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
        if (options.skipInitialCardResolution) {
            void this.refreshSkippedInitialCardResolution(
                popover,
                card,
                sentence,
                anchor,
                options,
                mounted.requestId,
                isCurrentHoverCard,
                scope,
            );
        }

        try {
            await this.completeMountedCardRender({
                popover,
                card,
                sentence,
                trigger,
                isCurrentHoverCard,
                anchor,
                mounted,
                fallbackAnkiLookup,
                loadRenderData,
            });
        } finally {
            done();
        }
    }

    private async completeMountedCardRender(context: MountedCardCompletionContext): Promise<void> {
        const { popover, card, sentence, trigger, mounted, fallbackAnkiLookup, isCurrentHoverCard, anchor } = context;
        if (trigger === 'hover') {
            await waitForHoverCardInitialPaint();
            if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
        }
        const renderData = context.loadRenderData();
        const renderState = { fullRenderCompleted: false };
        this.renderDeferredCardLocalEntries(popover, card, sentence, trigger, renderData, fallbackAnkiLookup, mounted, renderState, isCurrentHoverCard, anchor);

        const fullData = await this.cardRenderDataOrFallback(card, renderData.all, fallbackAnkiLookup);
        renderState.fullRenderCompleted = true;
        if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
        this.renderCompletedCardPopover(popover, card, sentence, trigger, fullData, anchor);
        const hydrationContext: CardPopoverHydrationContext = {
            popover,
            card,
            sentence,
            trigger,
            state: { data: fullData },
            requestId: mounted.requestId,
            isCurrentHoverCard,
            anchor,
        };
        this.renderHydratedCardAnkiLookup(hydrationContext, renderData);
        this.renderHydratedCardLocalEntries(hydrationContext, renderData);
        this.renderHydratedCardJitenVocabulary(hydrationContext, renderData);
        this.renderHydratedCardPitchAccent(hydrationContext, renderData);
        this.renderHydratedCardFrequencyRanks(hydrationContext, renderData);
        this.renderHydratedCardBunproDefinition(hydrationContext, renderData);
    }

    private async refreshSkippedInitialCardResolution(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        anchor: HTMLElement | undefined,
        options: CardDisplayOptions,
        requestId: number,
        isCurrentHoverCard: () => boolean,
        scope: CardLookupTargetSnapshot = this.cardLookup.captureTarget(),
    ): Promise<void> {
        if (!scope.isCurrent() || !usesJapaneseProviders()) return;
        if (!this.shouldResolveAfterSkippedInitialCardResolution(card)) return;
        const resolved = await this.resolveLookupCard(card, scope).catch(error => {
            log.warn('Skipped initial card resolution failed', { term: card.spelling }, error);
            return null;
        });
        if (!resolved
            || !scope.isCurrent()
            || !usesJapaneseProviders()
            || !this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
        if (!this.isResolvedCardRefresh(card, resolved)) return;
        const changedRoots = this.applyPublicVocabularyToRenderedWords(card, resolved);
        this.queueResolvedWordEffects([this.resolvedWordEffectsToken(resolved)], changedRoots);
        await this.showCard(resolved, sentence, anchor, {
            ...options,
            autoPlay: false,
            navigation: 'preserve',
            preservePosition: true,
            previousNavigationEntry: undefined,
            skipInitialCardResolution: false,
        });
    }

    private shouldResolveAfterSkippedInitialCardResolution(card: JPDBCard): boolean {
        return card.source === 'fallback'
            || (card.source === 'jpdb' && Boolean(card.sourceCardKey));
    }

    private isResolvedCardRefresh(card: JPDBCard, resolved: JPDBCard): boolean {
        return resolved !== card
            && (cardKey(resolved) !== cardKey(card)
                || (resolved.source ?? 'jpdb') !== (card.source ?? 'jpdb'));
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
        return isTargetLanguageText(sentence) ? sentence : '';
    }

    private rememberCardMiningContext(card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: CardDisplayOptions): void {
        const hasNestedImmersionContext = options.insideReaderPopup && Boolean(this.immersionPopover?.activeContextFor(card));
        if (hasNestedImmersionContext || this.immersionPopover?.hasActiveContext(card, sentence)) return;
        this.immersionPopover?.rememberPageMiningContext(card, sentence, anchor);
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
            focusOnMount: context.options.focusOnMount,
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
        if (context.trigger === 'hover') {
            this.installInitialHoverCardBackgroundBehaviors(popover, card, sentence, context);
            return;
        }
        this.studySources.installLoaders(popover, sentence);
        this.installLazyImmersionExamples(popover, card);
    }

    private installInitialHoverCardBackgroundBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        context: {
            isCurrentHoverCard: () => boolean;
        },
    ): void {
        requestAnimationFrame(() => {
            if (!this.isCurrentCardRender(popover, 0, context.isCurrentHoverCard)) return;
            this.studySources.installLoaders(popover, sentence);
            this.installLazyImmersionExamples(popover, card);
        });
    }

    private prioritizeQueuedPitchEnrichment(card: JPDBCard, options: { immediate?: boolean } = {}): void {
        if (!this.settings.showPitchAccent || cardHasContextPitch(card)) return;
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
            anchor?: HTMLElement;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): void {
        if (context.options.autoPlay === false || !this.isCurrentCardForAutoPlay(context)) return;
        void this.playInitialCardAudio(card, context);
    }

    private async playInitialCardAudio(
        card: JPDBCard,
        context: {
            trigger: 'modal' | 'hover';
            options: CardDisplayOptions;
            anchor?: HTMLElement;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): Promise<void> {
        const audioCard = await this.resolveInitialCardForAutoAudio(card, context);
        if (!this.shouldAutoPlayInitialCard(audioCard, context)) return;
        void this.audioActions.playTermAudio(audioCard, {
            hoverLookupGeneration: context.hoverLookupGeneration,
            userGesture: context.options.userGesture,
            isCurrent: context.trigger === 'hover' ? context.isCurrentHoverCard : undefined,
            autoPlay: true,
        });
    }

    private async resolveInitialCardForAutoAudio(
        card: JPDBCard,
        context: { trigger: 'modal' | 'hover'; options: CardDisplayOptions },
    ): Promise<JPDBCard> {
        // The mounted card gives hover autoplay instant feedback without another resolution.
        void context;
        return card;
    }

    private maybePreloadLookupCardAudio(card: JPDBCard, options: CardDisplayOptions, anchor?: HTMLElement): void {
        if (!this.canPreloadReaderAudio()) return;
        this.audio.preload(card, {
            sourceLimit: 1,
            candidateLimit: 1,
            prepareAudio: this.shouldPrepareLookupCardAudio(options, anchor),
        });
    }

    private shouldPrepareLookupCardAudio(options: CardDisplayOptions, anchor?: HTMLElement): boolean {
        const trigger = cardDisplayTrigger(options);
        if (trigger !== 'hover') return true;
        if (options.autoPlay === false) return false;
        // Match the auto-play gate so a hover that will play is warmed just like a
        // modal lookup, instead of deferring the fetch to play time for some words.
        return canAttemptReaderAutoAudio({
            anchor,
            settings: this.settings,
            subtitleSurfaceSelector: SUBTITLE_SURFACE_SELECTOR,
            trigger,
            userGesture: Boolean(options.userGesture),
        });
    }

    private shouldAutoPlayInitialCard(
        card: JPDBCard,
        context: {
            trigger: 'modal' | 'hover';
            options: CardDisplayOptions;
            anchor?: HTMLElement;
            isCurrentHoverCard: () => boolean;
            hoverLookupGeneration?: number;
        },
    ): boolean {
        return context.options.autoPlay !== false
            && this.isCurrentCardForAutoPlay(context)
            && this.shouldAutoPlay(card, context.trigger, Boolean(context.options.userGesture), context.anchor, context.hoverLookupGeneration);
    }

    private isCurrentCardForAutoPlay(context: { trigger: 'modal' | 'hover'; isCurrentHoverCard: () => boolean }): boolean {
        return context.trigger === 'modal' || context.isCurrentHoverCard();
    }

    private maybeParseInstantLocalEntries(popover: HTMLElement, instantLocalEntries: YomitanTermEntry[] | null): void {
        if (instantLocalEntries?.length) void this.parsePopoverJapanese(popover);
    }

    private installLazyImmersionExamples(popover: HTMLElement, card: JPDBCard, options: ImmersionSearchOptions = {}): void {
        // Japanese keeps the ImmersionKit controller as it is; any other TARGET has its
        // own example sources, which the shared loader fills. The target check precedes
        // `immersionKitEnabled` or one Japanese anime toggle empties all 31 (b15).
        if (!immersionKitCapabilitiesFor(targetLanguageOf(this.settings)).supported) {
            installTargetExampleSources(popover, {
                settings: this.settings,
                term: card.spelling,
                sourceAttributes: (key, initiallyExpanded) => this.dictionarySourceState.attributes(key, initiallyExpanded),
                isCurrentRoot: root => this.isCurrentPopoverRoot(root),
            });
            return;
        }
        if (!this.settings.immersionKitEnabled) return;
        this.immersionPopover?.installLazyLoad(popover, card, options);
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
        anchor?: HTMLElement,
    ): void {
        if (mounted.instantLocalEntries !== null) return;
        let localEntriesValue: YomitanTermEntry[] | null = null;
        let metaEntriesValue: YomitanMetaEntry[] = [];
        let jpdbVocabularyInfoValue: JpdbVocabularyInfo | null = null;
        let jitenVocabularyInfoValue: JitenVocabularyInfo | null = null;
        let frequencyRanksValue: ProviderFrequencyRanks = {};
        let ankiLookupValue: AnkiLookupResult | undefined;
        let renderedPitchKey = card.pitchAccent.join('|');
        let loadingRenderFrame: number | undefined;
        const isCurrentRender = () => this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard);
        const canRenderLoading = () => !renderState.fullRenderCompleted && isCurrentRender();
        const runLoadingRender = () => {
            loadingRenderFrame = undefined;
            if (!canRenderLoading()) return;
            renderedPitchKey = card.pitchAccent.join('|');
            const preservedImmersion = this.preserveImmersionMountForRerender(popover);
            const scrollOffset = capturePopoverScrollOffset(popover);
            clearNestedParseState(popover);
            setInnerHtml(popover, this.cardPopoverRenderer.render(
                card,
                sentence,
                trigger,
                loadingCardRenderData(
                    localEntriesValue ?? [],
                    ankiLookupValue ?? this.lastAnkiLookup ?? fallbackAnkiLookup,
                    metaEntriesValue,
                    jpdbVocabularyInfoValue,
                    jitenVocabularyInfoValue,
                    null,
                    frequencyRanksValue,
                ),
            ));
            this.restorePreservedImmersionMount(popover, preservedImmersion);
            restorePopoverScrollOffsetSoon(scrollOffset);
            refreshForcedReaderPopoverSurface(popover, this.settings);
            this.updateCardPopoverPosition(trigger);
            this.installDeferredCardPostRenderBehaviors(popover, card, sentence, trigger);
        };
        const renderLoading = () => {
            if (!canRenderLoading()) return;
            if (loadingRenderFrame !== undefined) return;
            loadingRenderFrame = window.requestAnimationFrame(runLoadingRender);
        };
        void renderData.localEntries.then(localEntries => {
            localEntriesValue = localEntries;
            renderLoading();
        });
        if (renderData.localMetaEntries) {
            void renderData.localMetaEntries.then(metaEntries => {
                metaEntriesValue = metaEntries;
                if (!canRenderLoading()) return;
                this.updateDeferredCardHeader(popover, card, metaEntriesValue, trigger, anchor, ankiLookupValue, frequencyRanksValue);
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
        if (renderData.frequencyRanks) {
            void renderData.frequencyRanks.then(frequencyRanks => {
                frequencyRanksValue = frequencyRanks;
                if (canRenderLoading()) this.updateDeferredCardHeader(popover, card, metaEntriesValue, trigger, anchor, ankiLookupValue, frequencyRanksValue);
            });
        }
        if (renderData.ankiLookup) {
            void renderData.ankiLookup.then(ankiLookup => {
                if (!isCurrentRender()) return;
                ankiLookupValue = ankiLookup;
                this.lastAnkiLookup = ankiLookup;
                this.applyAnkiLookupToRenderedWords(card, ankiLookup, {
                    preserveExistingEmpty: trigger === 'hover',
                    roots: this.renderedWordUpdateRootsForCardRender(trigger, anchor),
                });
                renderLoading();
            });
        }
        if (!renderData.pitchAccent) return;
        void renderData.pitchAccent.then(pitchAccent => {
            if (!pitchAccent.length || !isCurrentRender()) return;
            if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
            if (renderedPitchKey === card.pitchAccent.join('|')) return;
            renderedPitchKey = card.pitchAccent.join('|');
            this.updateDeferredCardHeader(popover, card, metaEntriesValue, trigger, anchor, ankiLookupValue, frequencyRanksValue);
        });
    }

    private installDeferredCardPostRenderBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
    ): void {
        this.installCardPostRenderBehaviors(popover, card, sentence, trigger, {});
    }

    private updateDeferredCardHeader(
        popover: HTMLElement,
        card: JPDBCard,
        metaEntries: YomitanMetaEntry[],
        trigger: 'modal' | 'hover' = 'modal',
        anchor?: HTMLElement,
        ankiLookup?: AnkiLookupResult,
        frequencyRanks?: ProviderFrequencyRanks,
    ): void {
        this.applyPitchAccentToRenderedWords(card, undefined, this.renderedWordUpdateRootsForCardRender(trigger, anchor));
        this.updatePopoverWordPills(popover, card, metaEntries, ankiLookup, frequencyRanks);
        this.updatePopoverPitch(popover, card, metaEntries);
        this.updateCardPopoverPosition(trigger);
    }

    private updatePopoverWordPills(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: AnkiLookupResult, frequencyRanks?: ProviderFrequencyRanks): void {
        updateHeadingWordPills(popover, {
            card,
            jpdbUrl: jpdbVocabularyUrl(card),
            settings: this.settings,
            metaEntries,
            ankiLookup,
            frequencyRanks,
            isJpdbBackedCard: value => this.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        });
    }

    private updatePopoverPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        updateRenderedPitch(popover, card, metaEntries, this.settings, name => this.dictionaryLabel(name));
    }

    private updateCardPopoverPosition(trigger: 'modal' | 'hover'): void {
        if (trigger === 'hover') {
            this.scheduleRepositionActivePopoverFrame();
            return;
        }
        this.repositionActivePopover();
    }

    private renderCompletedCardPopover(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
        anchor?: HTMLElement,
    ): void {
        this.lastAnkiLookup = data.ankiLookup;
        this.applyCardEnrichmentToRenderedAnchor(card, anchor);
        const renderedRoots = this.renderedWordUpdateRootsForCardRender(trigger, anchor);
        this.applyAnkiLookupToRenderedWords(card, data.ankiLookup, {
            preserveExistingEmpty: trigger === 'hover',
            roots: renderedRoots,
        });
        this.applyPitchAccentToRenderedWords(card, undefined, renderedRoots);
        const preservedImmersion = this.preserveImmersionMountForRerender(popover);
        // Late providers re-enter on the same popover; a non-zero offset is the
        // learner's scroll on that still-active entry.
        const scrollOffset = capturePopoverScrollOffset(popover);
        clearNestedParseState(popover);
        setInnerHtml(popover, this.cardPopoverRenderer.render(card, sentence, trigger, { ...data, loading: false }));
        this.wanikaniSources.installDefinitionMounts(popover, card);
        this.restorePreservedImmersionMount(popover, preservedImmersion);
        restorePopoverScrollOffsetSoon(scrollOffset);
        refreshForcedReaderPopoverSurface(popover, this.settings);

        this.updateCardPopoverPosition(trigger);
        this.installCardPostRenderBehaviors(popover, card, sentence, trigger, {
            relatedQueries: this.immersionRelatedQueries(data.jpdbVocabularyInfo),
        });
    }

    private applyCardEnrichmentToRenderedAnchor(card: JPDBCard, anchor?: HTMLElement): void {
        const word = anchor?.closest<HTMLElement>('.jpdb-reader-word');
        if (!word?.isConnected) return;
        const surface = normalizedLookupText(word.dataset.expression || readerWordSurfaceText(word));
        if (!surface || !cardMatchesRenderedLookupValue(card, surface)) return;
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        this.pauseAutoScanObserver(() => {
            this.applyPublicVocabularyToRenderedWord(word, card, pitchClass);
            refreshReaderWordContrast(word.parentElement ?? word);
        });
    }

    private installCardPostRenderBehaviors(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        immersionOptions: ImmersionSearchOptions,
    ): void {
        const install = () => {
            if (!this.isActivePopoverRender(popover)) return;
            void this.parsePopoverJapanese(popover);
            this.studySources.installLoaders(popover, sentence);
            this.installLazyImmersionExamples(popover, card, immersionOptions);
        };
        if (trigger === 'hover') {
            window.requestAnimationFrame(install);
            return;
        }
        install();
    }

    private isActivePopoverRender(popover: HTMLElement): boolean {
        return !this.isDestroyed && popover.isConnected && this.activePopover === popover;
    }

    private renderHydratedCardAnkiLookup(context: CardPopoverHydrationContext, renderData: CardRenderDataLoad): void {
        const { popover, card, trigger, state, requestId, isCurrentHoverCard } = context;
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const hydrateAnkiLookup = renderData.hydrateAnkiLookup;
        if (!hydrateAnkiLookup) return;
        const hydrate = () => {
            if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
            void hydrateAnkiLookup()
                .then(ankiLookup => {
                    const current = state.data;
                    const resolvesPendingMiss = current.ankiLookup.trusted === false && ankiLookup.trusted !== false;
                    if (!ankiLookupHasDisplayableNotes(ankiLookup) && !ankiLookupHasDisplayableNotes(current.ankiLookup) && !resolvesPendingMiss) return;
                    if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                    state.data = { ...current, ankiLookup };
                    this.scheduleHydratedCardPopoverRender(context);
                })
                .catch(error => {
                    log.warn('Popup Anki detail failed', { term: card.spelling }, error);
                    if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                    const ankiLookup = ankiLookupWithUnavailableDetails(state.data.ankiLookup);
                    if (!ankiLookup.primary) return;
                    state.data = { ...state.data, ankiLookup };
                    this.scheduleHydratedCardPopoverRender(context);
                });
        };
        if (trigger === 'hover') {
            window.setTimeout(hydrate, HOVER_ANKI_HYDRATION_DELAY_MS);
            return;
        }
        hydrate();
    }

    // A cold local lookup can lose the capped race; its uncapped hydration must
    // still add the source later.
    private renderHydratedCardLocalEntries(context: CardPopoverHydrationContext, renderData: CardRenderDataLoad): void {
        const { popover, card, state, requestId, isCurrentHoverCard } = context;
        if (state.data.localEntries.length || !renderData.hydrateLocalEntries) return;
        void renderData.hydrateLocalEntries()
            .then(entries => {
                if (!entries.length || state.data.localEntries.length || !this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                state.data = { ...state.data, localEntries: entries };
                this.scheduleHydratedCardPopoverRender(context);
            })
            .catch(error => log.debug('Popup local dictionary hydration failed', { term: card.spelling, error }));
    }

    // Jiten search → info → examples may overrun the capped render; preserve its
    // uncapped hydration like Bunpro rather than dropping the source.
    private renderHydratedCardJitenVocabulary(context: CardPopoverHydrationContext, renderData: CardRenderDataLoad): void {
        const { popover, card, state, requestId, isCurrentHoverCard } = context;
        if (!usesJapaneseProviders() || state.data.jitenVocabularyInfo || !renderData.hydrateJitenVocabularyInfo) return;
        void renderData.hydrateJitenVocabularyInfo()
            .then(info => {
                if (!usesJapaneseProviders() || !info || state.data.jitenVocabularyInfo || !this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                state.data = { ...state.data, jitenVocabularyInfo: info };
                this.scheduleHydratedCardPopoverRender(context);
            })
            .catch(error => log.debug('Popup Jiten vocabulary hydration failed', { term: card.spelling, error }));
    }

    private renderHydratedCardPitchAccent(context: CardPopoverHydrationContext, renderData: CardRenderDataLoad): void {
        const { popover, card, requestId, isCurrentHoverCard } = context;
        if (!renderData.hydratePitchAccent) return;
        const renderedPitchKey = card.pitchAccent.join('|');
        void renderData.hydratePitchAccent()
            .then(pitchAccent => {
                if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                if (!card.pitchAccent.length && pitchAccent.length) card.pitchAccent = [...pitchAccent];
                if (renderedPitchKey === card.pitchAccent.join('|')) return;
                this.scheduleHydratedCardPopoverRender(context);
            })
            .catch(error => log.debug('Popup pitch hydration failed', { term: card.spelling, error }));
    }

    private renderHydratedCardFrequencyRanks(context: CardPopoverHydrationContext, renderData: CardRenderDataLoad): void {
        const { popover, card, state, requestId, isCurrentHoverCard } = context;
        if (!usesJapaneseProviders() || !renderData.hydrateFrequencyRanks) return;
        void renderData.hydrateFrequencyRanks()
            .then(frequencyRanks => {
                if (!usesJapaneseProviders() || !this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                if (JSON.stringify(state.data.frequencyRanks ?? {}) === JSON.stringify(frequencyRanks)) return;
                state.data = { ...state.data, frequencyRanks };
                this.scheduleHydratedCardPopoverRender(context);
            })
            .catch(error => log.debug('Popup provider frequency hydration failed', { term: card.spelling, error }));
    }

    private renderHydratedCardBunproDefinition(context: CardPopoverHydrationContext, renderData: CardRenderDataLoad): void {
        const { popover, card, state, requestId, isCurrentHoverCard } = context;
        if (!usesJapaneseProviders() || !renderData.hydrateBunproDefinitionResult) return;
        void renderData.hydrateBunproDefinitionResult()
            .then(result => {
                if (!usesJapaneseProviders() || !this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                const unchangedInfo = state.data.bunproDefinitionInfo === result.info;
                const unchangedStatus = JSON.stringify(state.data.bunproDefinitionStatus) === JSON.stringify(result.status);
                if (unchangedInfo && unchangedStatus) return;
                state.data = {
                    ...state.data,
                    bunproDefinitionInfo: result.info,
                    bunproDefinitionStatus: result.status,
                };
                this.scheduleHydratedCardPopoverRender(context);
            })
            .catch(error => log.debug('Popup Bunpro definition hydration failed', { term: card.spelling, error }));
    }

    /** Merge same-frame provider completions so independent microtasks do not
     * repeat layout reads and large dictionary-tree replacements before input. */
    private scheduleHydratedCardPopoverRender(context: CardPopoverHydrationContext): void {
        let pass = this.cardHydrationRenderPasses.get(context.state);
        if (!pass) {
            pass = createPostPaintPass(() => {
                const { popover, card, sentence, trigger, state, requestId, isCurrentHoverCard, anchor } = context;
                if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                this.renderCompletedCardPopover(popover, card, sentence, trigger, state.data, anchor);
            });
            this.cardHydrationRenderPasses.set(context.state, pass);
        }
        pass.schedule(viewForNode(context.popover));
    }

    private renderedWordUpdateRootsForCardRender(trigger: 'modal' | 'hover', anchor?: HTMLElement): ParentNode[] {
        if (trigger !== 'hover') return [document];
        const word = anchor?.closest<HTMLElement>('.jpdb-reader-word');
        if (word?.isConnected) return [word];
        if (anchor?.isConnected) return [anchor];
        return [document];
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
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        this.installReaderControlPointerActivation(popover);
        popover.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => this.handleCardPopoverClick(event, card, sentence, anchor, trigger)));
        popover.addEventListener('keydown', trustedReaderEventHandler((event: KeyboardEvent) => this.handleCardPopoverLookupKeydown(event)));
        popover.addEventListener('change', trustedReaderEventHandler((event: Event) => this.handlePopoverReviewTargetChange(event, popover)));
    }

    // Dictionary-lookup chips (Composed of, related words) render as anchors;
    // Enter activates those natively but Space does not, so both keys are
    // routed through the same click path for keyboard users.
    private handleCardPopoverLookupKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const link = dictionaryLookupLink(event.target);
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        dispatchAuthorizedReaderControlClick(link);
    }

    private handlePopoverReviewTargetChange(event: Event, popover: HTMLElement): void {
        const select = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>('[data-review-target-select]');
        if (select && popover.contains(select)) updatePopoverReviewTargetSelection(select);
    }

    private handleCardPopoverClick(event: MouseEvent, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
        if (handleReaderActionPillLink(event)) return;
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
        const command = privateCommands.readKanjiCommandCapability(button);
        if (!command) return;
        event.preventDefault();
        event.stopPropagation();
        void this.showKanjiCard(card, command.kanji, sentence, anchor, { preservePosition: true });
    }

    private dispatchCardPopoverAction(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): void {
        if (this.handleCardPopoverNavigationAction(button, anchor, trigger)) return;
        if (this.handleCardPopoverMiningAction(button)) return;
        if (this.handleCardPopoverDeckPickerAction(button, card, sentence)) return;
        this.performCardPopoverCommand(button, card, sentence);
    }

    private performCardPopoverCommand(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): void {
        const command = privateCommands.readCardCommandCapability(button);
        if (command) void this.handleCardAction(button, card, sentence, command);
    }

    private handleCardPopoverNavigationAction(button: HTMLButtonElement, anchor: HTMLElement | undefined, trigger: 'modal' | 'hover'): boolean {
        if (button.dataset.action !== 'word-history-back') return false;
        void this.showPreviousWord(anchor, trigger);
        return true;
    }

    private handleCardPopoverMiningAction(button: HTMLButtonElement): boolean {
        const command = privateCommands.readCardUiCommandCapability(button);
        if (!command) return false;
        return this.performCardPopoverUiCommand(button, command.action);
    }

    private performCardPopoverUiCommand(button: HTMLButtonElement, action: 'deck-picker' | 'mining-collapse' | 'review-target-toggle'): boolean {
        if (action === 'review-target-toggle') {
            togglePopoverReviewTargetSelection(button);
            return true;
        }
        if (action !== 'mining-collapse') return false;
        this.toggleMiningControls(button);
        return true;
    }

    private handleCardPopoverDeckPickerAction(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined): boolean {
        if (cardPopoverDeckPickerCommand(button)) return this.openDeckPickerForAdd(button, card, sentence);
        if (!cardPopoverAddCommand(button)) return false;
        return this.openDeckPickerForAdd(button, card, sentence);
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
        return openDeckPickerForCardAdd(button, card, sentence, (actionButton, actionCard, actionSentence, command) => (
            this.handleCardAction(actionButton, actionCard, actionSentence, command)
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

    private shouldAutoPlay(card: JPDBCard, trigger: 'modal' | 'hover', userGesture = false, anchor?: HTMLElement, hoverLookupGeneration?: number): boolean {
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
            const sameHoverGeneration = trigger === 'hover'
                && hoverLookupGeneration !== undefined
                && this.lastAutoAudioHoverGeneration !== undefined
                && hoverLookupGeneration === this.lastAutoAudioHoverGeneration;
            const shouldSuppressDuplicate = key === this.lastAutoAudioKey
                && now - this.lastAutoAudioAt < 2500
                && (trigger !== 'hover' || hoverLookupGeneration === undefined || this.lastAutoAudioHoverGeneration === undefined || sameHoverGeneration);
            if (shouldSuppressDuplicate) return false;
            this.lastAutoAudioKey = key;
            this.lastAutoAudioAt = now;
            this.lastAutoAudioHoverGeneration = trigger === 'hover' ? hoverLookupGeneration : undefined;
        }
        return true;
    }

    private async showKanjiCard(card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement, options: { navigation?: CardNavigationMode; preservePosition?: boolean } = {}): Promise<void> {
        // Builds the Japanese card (jpdb link, RTK, KanjiVG) — see usesJapaneseCharacterStudy.
        if (!usesJapaneseCharacterStudy() || !targetCanLookupCharacter(kanji)) return;
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
            kanjiVGInfo: needsKanjiVG && this.kanjiVG ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
    }

    private jpdbKanjiDetailPromise(kanji: string): Promise<JpdbKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled && this.jpdbKanji ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private jitenKanjiDetailPromise(kanji: string): Promise<JitenKanjiInfo | null> {
        // Keyless requests ride the built-in edge proxy (the kanji endpoint is on
        // the shared-proxy allowlist), so no Jiten API credential is required.
        return this.settings.jpdbKanjiEnabled
            ? this.jiten.lookupKanji(kanji).catch(() => null)
            : Promise.resolve(null);
    }

    private isJitenApiActive(): boolean {
        return hasJitenApiCredential(this.settings);
    }

    private localKanjiEntriesPromise(kanji: string): Promise<YomitanKanjiEntry[]> {
        return this.settings.localDictionariesEnabled && this.settings.localDictionaryShowKanji
            ? this.dictionaries.lookupKanji(kanji, this.settings.localDictionaryMaxResults, this.settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private rtkDetailPromise(kanji: string): Promise<RtkInfo | null> {
        return this.settings.rtkEnabled && this.rtk ? this.rtk.lookup(kanji).catch(() => null) : Promise.resolve(null);
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
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}"${privateCommands.privateCommandAttributes({ kind: 'kanji-lookup', kanji: previous })} title="${escapeHtml(uiText(language, 'previousKanji'))}">‹</button>
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}"${privateCommands.privateCommandAttributes({ kind: 'kanji-lookup', kanji: next })} title="${escapeHtml(uiText(language, 'nextKanji'))}">›</button>
        `;
    }

    private installKanjiCardActions(popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        this.installReaderControlPointerActivation(popover);
        popover.addEventListener('click', trustedReaderEventHandler((event: MouseEvent) => this.handleKanjiCardActionClick(event, card, kanji, sentence, anchor)));
        popover.addEventListener('change', trustedReaderEventHandler((event: Event) => this.handlePopoverReviewTargetChange(event, popover)));
    }

    private handleKanjiCardActionClick(event: MouseEvent, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        if (handleReaderActionPillLink(event)) return;
        if (this.handleDictionaryLookupLink(event, anchor, 'modal')) return;
        const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
        if (!actionButton?.dataset.action) return;
        event.preventDefault();
        event.stopPropagation();
        this.dispatchKanjiCardAction(actionButton, card, kanji, sentence, anchor);
    }

    private dispatchKanjiCardAction(actionButton: HTMLButtonElement, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        if (privateCommands.dispatchPrivateCommand(actionButton, {
            'jpdb-kanji-action': command => { void this.performJpdbKanjiAction(command.actionId, card, kanji, sentence, anchor); },
            'kanji-lookup': command => { void this.showKanjiCard(card, command.kanji, sentence, anchor, { navigation: 'push-current', preservePosition: true }); },
            'card-ui': () => this.toggleMiningControls(actionButton),
            'card-action': command => { if (command.action === 'copy-word') void copyText(kanji).then(() => this.toast(uiText(this.settings.interfaceLanguage, 'copiedWord'))); else void this.handleCardAction(actionButton, card, sentence, command); },
            'kanji-word': command => { void this.lookupText(command.expression, command.reading || command.expression, { navigation: 'push-current', preservePosition: true }); },
            'jiten-kanji-words': command => { void (command.action === 'more' ? this.loadMoreJitenKanjiWords(actionButton) : this.filterJitenKanjiWords(actionButton)); },
        })) return;
        const handlers: Record<string, () => void> = {
            'word-back': () => this.showCard(card, sentence, anchor, { autoPlay: false, navigation: 'preserve', preservePosition: true }),
            'kanji-history-back': () => this.showPreviousKanji(anchor),
        };
        void handlers[actionButton.dataset.action ?? '']?.();
    }

    private jitenKanjiWordsActionContext(): JitenKanjiWordsActionContext | null {
        if (!this.isJitenApiActive()) return null;
        return {
            lookupKanjiWords: (character, options) => this.jiten.lookupKanjiWords(character, options),
            language: () => this.settings.interfaceLanguage,
            afterRender: () => this.repositionActivePopover(),
            onError: (details, error) => log.warn('Jiten kanji words lookup failed', details, error),
        };
    }

    private async loadMoreJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        const context = this.jitenKanjiWordsActionContext();
        if (context) await loadMoreSharedJitenKanjiWords(button, context);
    }

    private async filterJitenKanjiWords(button: HTMLButtonElement): Promise<void> {
        const context = this.jitenKanjiWordsActionContext();
        if (context) await filterSharedJitenKanjiWords(button, context);
    }

    private startKanjiProgressiveRender(popover: HTMLElement, detailsPromises: KanjiDetailPromises, card: JPDBCard, kanji: string, language: InterfaceLanguage, pageTarget?: JpdbTermTarget): void {
        this.installKanjiImmersionExamples(popover, card, pageTarget?.queries ?? []);
        void this.renderKanjiDetailsInto(popover, detailsPromises, card, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, detailsPromises.kanjiVGInfo, kanji, language);
        }
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        // JPDB is Japanese-only — see usesJapaneseCharacterStudy.
        if (!actionId || !this.jpdbKanji || !usesJapaneseCharacterStudy()) return;
        try {
            await this.jpdbKanji?.performAction(actionId);
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
                    <button class="jpdb-reader-mining-collapse jpdb-reader-mining-drawer-handle" type="button" data-action="mining-collapse"${privateCommands.privateCommandAttributes({ kind: 'card-ui', action: 'mining-collapse' })} aria-expanded="false" title="${escapeHtml(uiText(this.settings.interfaceLanguage, 'showMiningActions'))}" aria-label="${escapeHtml(uiText(this.settings.interfaceLanguage, 'showMiningActions'))}"></button>
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
        card: JPDBCard,
        kanji: string,
        language: InterfaceLanguage,
    ): Promise<void> {
        let jpdbInfo: JpdbKanjiInfo | null = null;
        let jitenInfo: JitenKanjiInfo | null = null;
        let kanjiEntries: YomitanKanjiEntry[] = [];
        let rtkInfo: RtkInfo | null = null;
        let kanjiVGInfo: KanjiVGInfo | null = null;
        let sourceInfo: KanjiSourceInfo | null = null;
        const practiceDoodle = this.kanjiCompanion?.installKanjiPracticeDoodle?.(popover, () => this.settings.interfaceLanguage, () => kanjiVGInfo)
            ?? noopKanjiPracticeDoodle();
        const keywordMount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
        const rtkMount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
        const definitionsMounts = Array.from(popover.querySelectorAll<HTMLElement>('[data-kanji-definitions-mount]'));
        this.wanikaniSources.installKanjiMount(popover, kanji);

        const renderKeyword = () => {
            if (!popover.isConnected || !keywordMount?.isConnected) return;
            setInnerHtml(keywordMount, jitenInfo
                ? renderJitenKanjiKeywordLine(jitenInfo, rtkInfo, kanjiEntries, language, sourceInfo)
                : this.renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries, language, sourceInfo));
            this.repositionActivePopover();
        };
        // Merge each provider's own KANJI frequency into the heading pills
        // (Jiten's kanji API rank, JPDB's "Top 300-400" band) once it arrives.
        const renderKanjiPillRanks = () => {
            if (!popover.isConnected) return;
            const frequencyRanks = kanjiFrequencyRanks(kanji, jitenInfo?.frequencyRank, jpdbInfo?.frequency);
            if (!frequencyRanks.jiten && !frequencyRanks.jpdb) return;
            updateHeadingWordPills(popover, {
                card,
                jpdbUrl: `https://jpdb.io/kanji/${encodeURIComponent(kanji)}`,
                settings: this.settings,
                metaEntries: [],
                overrideQuery: kanji,
                frequencyRanks,
                isJpdbBackedCard: value => this.isJpdbBackedCard(value),
                dictionaryLabel: name => this.dictionaryLabel(name),
            });
        };
        const renderRtk = () => {
            if (!popover.isConnected || !rtkMount?.isConnected) return;
            const companion = this.kanjiCompanion;
            if (!companion) {
                rtkMount.remove();
                this.repositionActivePopover();
                return;
            }
            const componentSummaries = companion.buildRtkComponentSummaries(rtkInfo, jpdbInfo, kanjiEntries);
            const sourceStateKey = kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
            setInnerHtml(rtkMount, companion.renderRtkInfo(rtkInfo, componentSummaries, language, this.dictionarySourceState.isOpen(sourceStateKey), sourceStateKey));
            this.repositionActivePopover();
        };

        const jpdbInfoPromise = detailsPromises.jpdbInfo.then(info => {
            jpdbInfo = info;
            if (!popover.isConnected) return;
            renderKeyword();
            renderKanjiPillRanks();
            if (miningMount?.isConnected && this.kanjiCompanion) this.updateKanjiMiningControls(popover, this.kanjiCompanion.renderJpdbKanjiMiningControls(jpdbInfo, language));
            if (jpdbMount?.isConnected) {
                setInnerHtml(jpdbMount, this.renderKanjiFactSourcesHtml(jpdbInfo, jitenInfo, language));
            }
            renderRtk();
        });
        const jitenInfoPromise = detailsPromises.jitenInfo.then(info => {
            jitenInfo = info;
            if (!popover.isConnected) return;
            renderKeyword();
            renderKanjiPillRanks();
            if (jpdbMount?.isConnected) {
                setInnerHtml(jpdbMount, this.renderKanjiFactSourcesHtml(jpdbInfo, jitenInfo, language));
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
        sourceInfo = await this.kanjiOrigin?.lookup(kanji, this.settings).catch(() => null) ?? null;
        renderKeyword();
        if (!popover.isConnected) return;

        if (this.settings.kanjiOriginsEnabled) {
            this.renderKanjiOriginsInto(popover, kanji, jpdbInfo as JpdbKanjiInfo | null, jitenInfo as JitenKanjiInfo | null, rtkInfo as RtkInfo | null, kanjiVGInfo as KanjiVGInfo | null, kanjiEntries, sourceInfo);
        }
        void (this.isJpdbPageAddonRoot(popover) ? this.parseJpdbPageAddonJapanese(popover) : this.parsePopoverJapanese(popover));
        this.repositionActivePopover();
    }

    private renderKanjiKeywordLine(jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, entries: YomitanKanjiEntry[], language: InterfaceLanguage, sourceInfo: KanjiSourceInfo | null): string {
        return this.kanjiCompanion?.renderKanjiKeywordLine(jpdbInfo, rtkInfo, entries, language, sourceInfo)
            ?? `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'kanjiDetailsUnavailable'))}</div>`;
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
        const trace = stage.closest('.jpdb-reader-kanjivg')?.querySelector<HTMLButtonElement>('[data-doodle-trace]');
        const traceVisible = !stage.classList.contains('trace-hidden');
        ghost.hidden = !traceVisible;
        if (trace) trace.textContent = uiText(language, traceVisible ? 'hideTrace' : 'showTrace');
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

    private renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[], sourceInfo: KanjiSourceInfo | null): void {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        if (!this.canRenderKanjiOriginMount(popover, mount)) return;
        this.renderKanjiOriginMount(mount, kanji, jpdbInfo, jitenInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        this.installKanjiOriginImageFallbacks(mount);
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
        const companion = this.kanjiCompanion;
        if (!companion) {
            mount.remove();
            this.repositionActivePopover();
            return;
        }
        const facts = companion.buildKanjiFacts(kanji, jpdbInfo, rtkInfo, this.settings.kanjivgEnabled ? kanjiVGInfo : null, kanjiEntries, sourceInfo);
        const graph = this.settings.kanjiOriginGraphEnabled
            ? companion.buildKanjiOriginGraph(kanji, jpdbInfo, rtkInfo, kanjiEntries, sourceInfo, kanjiVGInfo)
            : null;
        const sourceStateKey = kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID);
        setInnerHtml(mount, companion.renderKanjiOrigins(
            facts,
            graph,
            sourceInfo,
            this.settings,
            this.settings.interfaceLanguage,
            this.dictionarySourceState.isOpen(sourceStateKey),
            sourceStateKey,
            this.hiddenKanjiOriginFactLabels(jpdbInfo, jitenInfo),
            this.kanjiSourceTitle(KANJI_ORIGINS_SOURCE_ID),
        ));
        companion.installOriginGraphInteractions(mount);
    }

    private hiddenKanjiOriginFactLabels(jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null): Set<string> | undefined {
        const labels = new Set(jitenKanjiOriginFactLabels(jitenInfo, this.settings.interfaceLanguage));
        if (!jitenInfo) {
            if (jpdbInfo?.type) labels.add('Type');
            if (jpdbInfo?.frequency) labels.add('Frequency');
        }
        return labels.size ? labels : undefined;
    }

    private installKanjiOriginImageFallbacks(mount: HTMLElement): void {
        mount.querySelectorAll<HTMLImageElement>('[data-radical-frame]').forEach(image => {
            image.addEventListener('error', () => image.remove(), { once: true });
            const url = image.dataset.radicalFrameUrl;
            if (!url) return;
            // Load cross-origin radical frames through the userscript bridge so a
            // strict page CSP (jpdb.io img-src) can't block them.
            void this.immersionKit?.fetchBlobUrl(url, 9000, this.settings.corsProxyUrl, this.settings.interfaceLanguage)
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
        bunproDefinitionInfo: import('../bunpro/definition').BunproDefinitionInfo | null = null,
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
            bunproDefinitionInfo,
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
        this.immersionPopover?.installLazyLoad(root, card, relatedQueries.length ? { relatedQueries } : undefined);
    }

    private installJpdbPageImmersionExamples(root: HTMLElement, card: JPDBCard, relatedQueries: string[] = []): void {
        if (!this.settings.immersionKitEnabled) return;
        const controller = this.immersionPopover;
        if (!controller) return;
        const options = relatedQueries.length ? { relatedQueries } : undefined;
        if (root.dataset.yomuPageContext !== 'review') {
            controller.installLazyLoad(root, card, options);
            return;
        }
        const container = root.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!container || ['loading', 'loaded'].includes(container.dataset.immersionLoadState ?? '')) return;
        container.dataset.immersionLoadState = 'loading';
        // The review shell is already reveal-gated, so a second visibility
        // debounce only makes Next feel sluggish. Start immediately; hidden
        // question-side prefetch usually turns this into a cache hit.
        void controller.loadExamples(root, card, options).then(() => {
            if (container.isConnected && container.dataset.immersionLoadState === 'loading') {
                container.dataset.immersionLoadState = 'loaded';
            }
        }).catch(() => {
            if (container.isConnected && container.dataset.immersionLoadState === 'loading') {
                delete container.dataset.immersionLoadState;
            }
        });
    }

    private async parsePopoverJapanese(popover: HTMLElement): Promise<void> {
        if (!this.isCurrentPopoverRoot(popover)) return;
        void yomuSettingsSurfaceCompanion()?.installDefinitionTranslationBehaviors(popover, this.settings);
        installProviderExampleBehaviors(popover, {
            interfaceLanguage: this.settings.interfaceLanguage,
            outputLanguage: outputLanguageOf(this.settings),
            blurTranslations: this.settings.immersionKitRevealTranslationOnClick,
            translate: translateJapaneseSentence,
            isCurrentRoot: root => this.isCurrentPopoverRoot(root),
        });
        this.enrichJpdbRelatedWords(popover);
        const plan = nestedTextParsePlan(popover, 120, { excludeProviderExamples: true });
        if (plan && !nestedParseAlreadyScheduled(popover, plan.parseKey)) {
            await this.parseNestedJapaneseContent(popover, plan, () => this.isCurrentPopoverRoot(popover));
        }
        if (!this.isCurrentPopoverRoot(popover)) return;
        const providerPlan = providerExampleTextParsePlan(popover, 24);
        if (providerPlan && !nestedParseAlreadyScheduled(popover, providerPlan.parseKey)) {
            await this.parseNestedJapaneseContent(popover, providerPlan, () => this.isCurrentPopoverRoot(popover), {
                publicJitenDetailLimit: 24,
            }, false);
        }
    }

    private async parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void> {
        let state = this.pageAddonParseStates.get(root);
        if (!state) {
            state = { dirty: false };
            this.pageAddonParseStates.set(root, state);
        }
        state.dirty = true;
        if (state.running) return state.running;
        state.running = this.flushJpdbPageAddonJapaneseParse(root, state)
            .finally(() => {
                state.running = undefined;
                // A provider can commit in the microtask between the drain's
                // final check and this release. Chain the follow-up drain from
                // finally so that caller still awaits the parse it requested.
                if (state.dirty && this.isJpdbPageAddonRoot(root)) {
                    return this.parseJpdbPageAddonJapanese(root);
                }
            });
        return state.running;
    }

    private async flushJpdbPageAddonJapaneseParse(root: HTMLElement, state: PageAddonParseState): Promise<void> {
        // Provider promises commonly settle together. Let their HTML commits
        // coalesce into one parse pass, then serialize any genuinely later
        // update so whole-root JPDB/Jiten parsing never overlaps itself.
        await Promise.resolve();
        while (state.dirty && this.isJpdbPageAddonRoot(root)) {
            state.dirty = false;
            await this.performJpdbPageAddonJapaneseParse(root);
        }
    }

    private async performJpdbPageAddonJapaneseParse(root: HTMLElement): Promise<void> {
        if (!this.isJpdbPageAddonRoot(root)) return;
        this.enrichJpdbRelatedWords(root);
        clearNestedParseState(root);
        const plan = nestedTextParsePlan(root, 120);
        if (!plan || nestedParseAlreadyScheduled(root, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(root, plan, () => this.isJpdbPageAddonRoot(root));
    }

    // Welcome panel: furigana + pitch on its Japanese, through the same chrome
    // parse path as the settings dialog (local/segmented, no remote parse spend).
    private async parseOnboardingJapanese(panel: HTMLElement): Promise<void> {
        if (!panel.isConnected) return;
        clearNestedParseState(panel);
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.canParseJapanese()) return;
        const plan = nestedTextParsePlan(panel, 120);
        if (!plan || nestedParseAlreadyScheduled(panel, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(panel, plan, () => panel.isConnected, {
            allowJpdbTimeoutFallback: true,
            allowSegmentedFallback: true,
            skipJpdb: true,
        });
    }

    private enrichJpdbRelatedWords(root: ParentNode): void {
        const related = renderedJpdbRelatedWords(root)
            .filter(({ word }) => word.dataset.jpdbReaderRelatedEnqueued !== 'true');
        if (!related.length) return;
        related.forEach(({ word }) => { word.dataset.jpdbReaderRelatedEnqueued = 'true'; });
        const tokens = related.map(({ token }) => token);
        void this.enrichPitchWords(tokens, this.nestedPitchEnrichmentOptions());
        this.queueAnkiWordEnrichment(tokens, [root]);
    }

    private isJpdbPageAddonRoot(root: HTMLElement): boolean {
        return Boolean(root.isConnected && root.matches('[data-yomu-jpdb-addon]'));
    }

    private async parseSettingsJapanese(form: HTMLFormElement): Promise<void> {
        if (!this.isCurrentSettingsRoot(form)) return;
        const enhancement = yomuSettingsSurfaceCompanion()?.selfEnhancement;
        if (!enhancement || enhancement.nestedSettingsParseAlreadyRendered(form)) return;
        if (form.dataset.yomuSettingsSelfEnhancing === 'true') {
            form.dataset.yomuSettingsSelfEnhancePending = 'true';
            return;
        }
        form.dataset.yomuSettingsSelfEnhancing = 'true';
        let plan: NestedParsePlan | null = null;
        let parseLoadingId = '';
        try {
            plan = this.settingsJapaneseParsePlan(form);
            if (!plan) return;
            parseLoadingId = `${Date.now()}:${Math.random()}`;
            form.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
            form.dataset.jpdbReaderParseLoadingId = parseLoadingId;
            const parsed = await this.loadSettingsParsedJapaneseContent(plan);
            if (!this.isCurrentSettingsJapaneseParse(form, plan.parseKey, parseLoadingId)) return;
            const currentPlan = enhancement.nestedSettingsTextParsePlan(
                form,
                enhancement.SETTINGS_PARSE_TARGET_LIMIT,
            );
            if (!currentPlan) return;
            const currentParsed = enhancement.supplementSettingsFallbackTokens(
                currentPlan.targets,
                enhancement.parsedSettingsTargetsForCurrentPlan(plan, parsed, currentPlan),
            );
            this.applySettingsJapaneseParse(form, currentPlan, currentParsed);
            if (currentPlan.targets.length >= enhancement.SETTINGS_PARSE_TARGET_LIMIT) {
                window.setTimeout(() => void this.parseSettingsJapanese(form), 0);
            }
        } catch {
        } finally {
            if (plan) clearNestedParseLoadingKey(form, plan.parseKey, parseLoadingId);
            delete form.dataset.yomuSettingsSelfEnhancing;
            if (form.dataset.yomuSettingsSelfEnhancePending === 'true') {
                delete form.dataset.yomuSettingsSelfEnhancePending;
                void this.parseSettingsJapanese(form);
            }
        }
    }

    private settingsJapaneseParsePlan(form: HTMLFormElement): NestedParsePlan | null {
        if (!this.isCurrentSettingsRoot(form)) return null;
        if (resolveUiLanguage(this.settings.interfaceLanguage) !== 'ja' || !this.canParseJapanese()) return null;
        const enhancement = yomuSettingsSurfaceCompanion()?.selfEnhancement;
        if (!enhancement) return null;
        const plan = enhancement.nestedSettingsTextParsePlan(
            form,
            enhancement.SETTINGS_PARSE_TARGET_LIMIT,
        );
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
        const enhancement = yomuSettingsSurfaceCompanion()?.selfEnhancement;
        if (!enhancement) return;
        const renderSettings = enhancement.settingsForSettingsFormParse(form, this.settings);
        applyNestedParsePlan(plan, parsed, renderSettings);
        enhancement.addSettingsRubyFromRenderedReadings(form, renderSettings);
        highlightCardTargetScopes(form);
        refreshReaderWordContrast(form);
        form.dataset.jpdbReaderParseKey = plan.parseKey;
        form.dataset.yomuSettingsSelfEnhanced = 'true';
        const tokens = parsed.flat();
        void this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions());
        this.queueAnkiWordEnrichment(tokens, [form]);
    }

    private async parseNestedJapaneseContent(
        root: HTMLElement,
        plan: NestedParsePlan,
        isCurrent: () => boolean,
        options: ReaderParserParseOptions = {},
        recordParseKey = true,
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
            if (recordParseKey) root.dataset.jpdbReaderParseKey = plan.parseKey;
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
        parseOptions: ReaderParserParseOptions,
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
        void this.enrichPitchWords(tokens, pitchOptions ?? this.nestedPitchEnrichmentOptions());
        this.queueAnkiWordEnrichment(tokens, [root]);
    }

    private afterSubtitleJapaneseParsed(tokens: JPDBToken[], roots: ParentNode[] = []): void {
        void this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions());
        const targetRoots = roots.length ? roots : this.subtitleAnkiEnrichmentRoots();
        this.queueResolvedWordEffects(tokens, targetRoots.length ? targetRoots : [document]);
    }

    // Pitch/vocabulary enrichment lands after cue html is cached; pushing the
    // enriched sentences back through the subtitle controller re-bakes those
    // caches so stepping back to a previous line keeps its pitch colors
    // (UT-66) instead of re-rendering the pre-enrichment html.
    private queueSubtitleParsedHtmlRefresh(sentence: string | undefined): void {
        const text = sentence?.trim();
        if (!text || this.isDestroyed) return;
        this.pendingSubtitleRebakeTexts.add(text);
        if (this.subtitleRebakeTimer !== undefined) return;
        this.subtitleRebakeTimer = window.setTimeout(() => {
            this.subtitleRebakeTimer = undefined;
            this.flushSubtitleParsedHtmlRefresh();
        }, 150);
    }

    private flushSubtitleParsedHtmlRefresh(): void {
        const texts = Array.from(this.pendingSubtitleRebakeTexts);
        this.pendingSubtitleRebakeTexts.clear();
        if (!texts.length || this.isDestroyed) return;
        const subtitles = this.subtitles as { refreshParsedCueTexts?: (texts: string[]) => void };
        // Companion version skew: an older video companion has no rebake hook.
        if (typeof subtitles.refreshParsedCueTexts !== 'function') return;
        subtitles.refreshParsedCueTexts(texts);
    }

    private async enrichOcrTokensBeforeRender(tokens: JPDBToken[]): Promise<void> {
        if (!tokens.length) return;
        this.preloadTermAudioForTokens(tokens);
        await this.resolveOcrFallbackTokens(tokens);
        await this.enrichPitchWords(tokens, this.ocrBeforeRenderPitchEnrichmentOptions());
    }

    private async enrichSubtitleTokensBeforeRender(tokens: JPDBToken[]): Promise<void> {
        if (!tokens.length) return;
        await this.enrichPitchWords(tokens, this.subtitleBeforeRenderPitchEnrichmentOptions());
    }

    private ocrBeforeRenderPitchEnrichmentOptions(): PitchEnrichmentOptions {
        const hasJpdbKey = hasJpdbApiCredential(this.settings);
        const hasAnyApiKey = hasJpdbKey || hasJitenApiCredential(this.settings);
        return {
            urgent: true,
            ...(hasJpdbKey ? {} : { jpdbPublicLookup: false }),
            ...(hasAnyApiKey ? {} : { publicLookup: false }),
        };
    }

    private subtitleBeforeRenderPitchEnrichmentOptions(): PitchEnrichmentOptions {
        const background = this.backgroundPitchEnrichmentOptions();
        const noApiCredential = !hasJpdbApiCredential(this.settings) && !hasJitenApiCredential(this.settings);
        const isolateKeylessYouTubeSubtitleBudget = noApiCredential && isYouTubeRuntimeHost();
        const urgentPublicLimit = noApiCredential ? PITCH_ENRICHMENT_LIMIT * 4 : 2;
        const backgroundPublicLimit = isolateKeylessYouTubeSubtitleBudget ? urgentPublicLimit : background.publicLookupLimit;
        const backgroundPublicTotalLimit = isolateKeylessYouTubeSubtitleBudget ? urgentPublicLimit : background.publicLookupTotalLimit;
        const publicLookupLimit = Math.min(urgentPublicLimit, Math.max(0, Math.floor(backgroundPublicLimit ?? urgentPublicLimit)));
        const publicLookupTotalLimit = Math.min(publicLookupLimit, Math.max(0, Math.floor(backgroundPublicTotalLimit ?? publicLookupLimit)));
        // dictionaryFirstFallbackLookupTerms can put malformed shallow
        // deinflections before the real lemma (訪れた -> 訪る, 訪れる). Keep the
        // same bounded three-candidate window as background enrichment so the
        // exact-match Jiten guard can reject a partial first hit and still reach
        // the real reading/pitch before authoritative subtitle HTML is painted.
        const publicLookupTermLimit = Math.max(3, Math.floor(background.publicLookupTermLimit ?? 3));
        return {
            ...background,
            urgent: true,
            ...(isolateKeylessYouTubeSubtitleBudget ? { jpdbPublicLookup: true } : {}),
            publicLookupLimit,
            publicLookupTotalLimit,
            publicLookupPageBudget: isolateKeylessYouTubeSubtitleBudget ? undefined : background.publicLookupPageBudget,
            publicLookupTermLimit,
            deferPublicLookup: false,
        };
    }

    private async resolveOcrFallbackTokens(tokens: JPDBToken[]): Promise<void> {
        const fallbackTokens = tokens.filter(token => token.card.source === 'fallback');
        if (!fallbackTokens.length) return;
        if (!this.isJitenApiActive()) {
            await this.resolvePublicOcrFallbackTokens(fallbackTokens);
            return;
        }
        await runLimited(fallbackTokens, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, async token => {
            const fallback = token.card;
            const resolved = await this.resolveFallbackVocabularyForPriorityRender(token);
            if (resolved === fallback || resolved.source === 'fallback') return;
            this.applyResolvedFallbackVocabularyToToken(token, fallback, resolved);
        });
    }

    private async resolvePublicOcrFallbackTokens(tokens: JPDBToken[]): Promise<void> {
        const pending = new Map<string, { card: JPDBCard; tokens: JPDBToken[] }>();
        for (const token of tokens) {
            const fallback = token.card;
            const key = fallbackVocabularySpanCacheKey(fallback, token);
            const cached = this.resolvedFallbackVocabularyCache.get(key);
            if (cached && cached !== fallback && cached.source !== 'fallback') {
                this.applyResolvedFallbackVocabularyToToken(token, fallback, cached);
                continue;
            }
            const group = pending.get(key) ?? { card: fallback, tokens: [] };
            group.tokens.push(token);
            pending.set(key, group);
        }
        if (!pending.size) return;
        const resolved = await this.publicLookupFallbackCards([...pending.values()].map(group => group.card), { jpdbPublicLookup: false });
        for (const group of pending.values()) {
            const card = resolved.get(cardKey(group.card));
            if (!card || card.source === 'fallback') continue;
            for (const token of group.tokens) this.applyResolvedFallbackVocabularyToToken(token, group.card, card);
        }
    }

    private async resolveFallbackVocabularyForPriorityRender(token: JPDBToken): Promise<JPDBCard> {
        const fallback = token.card;
        if (fallback.source !== 'fallback') return fallback;
        const key = fallbackVocabularySpanCacheKey(fallback, token);
        const cached = this.resolvedFallbackVocabularyCache.get(key);
        if (cached) return cached;
        const existing = this.fallbackVocabularyResolutionCache.get(key);
        if (existing) return existing;
        const lookup = this.resolveLookupCard(fallback)
            .catch(() => fallback)
            .finally(() => {
                this.fallbackVocabularyResolutionCache.delete(key);
            });
        this.fallbackVocabularyResolutionCache.set(key, lookup);
        return lookup;
    }

    private applyResolvedFallbackVocabularyToToken(token: JPDBToken, fallback: JPDBCard, resolved: JPDBCard): void {
        this.rememberResolvedFallbackVocabulary(token, fallback, resolved);
        token.card = resolved;
        token.pitchClass = getPitchClass(resolved.pitchAccent, resolved.reading || resolved.spelling) || token.pitchClass;
    }

    private async enrichOcrRenderedTokens(tokens: JPDBToken[], root: ParentNode): Promise<void> {
        if (!tokens.length) return;
        this.queueResolvedWordEffects(tokens, [root]);
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
        if (tokens.length) this.queueBunproWordStateEnrichment(roots);
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return;
        void this.enrichAnkiWords(tokens, roots);
    }

    // Starts the cached status lookup before the scan touches the DOM so the
    // IndexedDB roundtrip overlaps the token apply; colors then land in the
    // same breath as the ruby instead of popping in afterwards.
    private ankiCachedStatusLookups(uniqueTokens: JPDBToken[]): Promise<AnkiLookupResult[]> {
        return this.anki.findCachedStatusBatch(uniqueTokens.map(token => token.card))
            .catch(error => {
                log.warnOnce('background-anki-coloring-failed', 'Anki background coloring failed', error);
                return uniqueTokens.map(() => untrustedAnkiLookupResult());
            });
    }

    private startAnkiLookupBatch(tokens: JPDBToken[]): {
        tokens: JPDBToken[];
        lookupKeys: string[];
        lookups: Promise<AnkiLookupResult[]>;
    } {
        const uniqueTokens = uniqueTokensByCard(tokens);
        return {
            tokens: uniqueTokens,
            lookupKeys: uniqueTokens.map(token => cardKey(token.card)),
            lookups: this.ankiCachedStatusLookups(uniqueTokens),
        };
    }

    private beginAnkiWordEnrichment(tokens: JPDBToken[]): (roots: ParentNode[]) => void {
        if (!tokens.length) return () => undefined;
        if (!this.shouldRunAnkiBackgroundWork()) return roots => this.queueBunproWordStateEnrichment(roots);
        const batch = this.startAnkiLookupBatch(tokens);
        return roots => {
            this.queueBunproWordStateEnrichment(roots);
            void batch.lookups.then(resolved => {
                if (!this.shouldRunAnkiBackgroundWork()) return;
                const current = currentAnkiLookupBatch(batch.tokens, batch.lookupKeys, resolved);
                if (current.tokens.length) this.applyAnkiLookupsToRenderedWords(current.tokens, current.lookups, roots);
                // A sparse/fallback lookup must never land after canonical
                // detail and erase its more precise result. The canonical
                // mutation path already queued one batched retry, so stale
                // callbacks only drop their obsolete result here.
            });
        };
    }

    private async prepareAnkiWordEnrichmentBeforeRender(tokens: JPDBToken[]): Promise<(roots: ParentNode[]) => void> {
        if (!tokens.length) return () => undefined;
        if (!this.shouldRunAnkiBackgroundWork()) return roots => this.queueBunproWordStateEnrichment(roots);
        const batch = this.startAnkiLookupBatch(tokens);
        const lookups = await batch.lookups;
        return roots => {
            this.queueBunproWordStateEnrichment(roots);
            if (!this.shouldRunAnkiBackgroundWork()) return;
            const current = currentAnkiLookupBatch(batch.tokens, batch.lookupKeys, lookups);
            if (current.tokens.length) this.applyAnkiLookupsToRenderedWords(current.tokens, current.lookups, roots);
        };
    }

    private async enrichAnkiWords(tokens: JPDBToken[], roots: ParentNode[] = [document]): Promise<void> {
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return;
        const batch = this.startAnkiLookupBatch(tokens);
        const lookups = await batch.lookups;
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const current = currentAnkiLookupBatch(batch.tokens, batch.lookupKeys, lookups);
        if (current.tokens.length) this.applyAnkiLookupsToRenderedWords(current.tokens, current.lookups, roots);
    }

    private queueResolvedWordEffects(tokens: JPDBToken[], roots: ParentNode[]): void {
        this.lateCardReconciliation.queue(tokens, roots);
    }

    private resolvedWordEffectsToken(card: JPDBCard, pitchClass?: string): JPDBToken {
        return this.lateCardReconciliation.token(card, pitchClass);
    }

    private async recolorRenderedAnkiWordsFromCache(root: ParentNode = document): Promise<void> {
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const indexedTokens = this.renderedWordIndex.size
            ? this.renderedWords.tokensForRecolor(root, word => this.renderedWordTokenForRecolor(word))
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
            const key = token.card.source === 'fallback'
                ? fallbackVocabularySpanCacheKey(token.card, token)
                : cardKey(token.card);
            if (seen.has(key)) continue;
            seen.add(key);
            tokens.push(token);
        }
        if (root === document) this.renderedWords.markFullyScanned();
        return tokens;
    }

    private renderedWordTokenForRecolor(word: HTMLElement): JPDBToken | null {
        const identity = renderedWordNumericIdentity(word);
        const card = this.getCachedCard(identity.vid, identity.sid);
        if (!card) return null;
        const surface = readerWordSurfaceText(word);
        const { start, end } = renderedWordSpan(word, surface.length);
        return {
            card,
            start,
            end,
            length: end - start,
            rubies: [],
            pitchClass: word.dataset.pitchClass ?? '',
            sentence: word.dataset.sentence,
        };
    }

    private async enrichPitchWords(tokens: JPDBToken[], options: PitchEnrichmentOptions = {}): Promise<void> {
        if (this.isDestroyed || !this.shouldRunCanonicalCardEnrichment()) return;
        const enrichmentHref = location.href;
        const enrichmentScope = this.cardLookup.captureTarget();
        // Parsing and visual enrichment are independent channels. A parser can
        // already know a card's reading/pitch while omitting ruby spans for the
        // contextual surface (inflections are the common example). Reconcile
        // that exact evidence onto the connected word before the pitch-complete
        // fast path filters the token out of network work.
        tokens.forEach(token => this.reconcileRenderedTokenFurigana(token));
        // Public Jiten /parse deliberately returns sparse cards after its small
        // inline detail budget. Reading-less kanji must not compete with the
        // optional pitch page budget: hydrate them through their exact ids in a
        // dedicated, paced lane. Ordinary page enrichment queues this work and
        // paints immediately; only explicit pre-render/urgent surfaces await one
        // bounded detail batch. The remaining exact ids stay in the idle lane
        // instead of depending on a click to recover.
        this.deferredPublicJitenReadings.resetIfNeeded();
        const readingGeneration = this.deferredPublicJitenReadings.generation;
        await this.deferredPublicJitenReadings.hydrate(tokens, enrichmentScope, enrichmentHref, options.urgent === true);
        if (this.isDestroyed
            || location.href !== enrichmentHref
            || readingGeneration !== this.deferredPublicJitenReadings.generation
            || !enrichmentScope.isCurrent()) return;
        // Canonical reading/POS/state is also required by Anki, Academy SRS and
        // guarded audio preloads. When both visual channels are disabled, stop
        // after the exact-id detail lane instead of waking any pitch work.
        if (!this.shouldRunPitchOrReadingEnrichment()) return;
        // An installed local pitch dictionary (e.g. Kanjium) is the PRIMARY
        // pitch source: the at-rest pass stays offline. But local-FIRST, not
        // local-ONLY (class F): words the local bank misses are fed into the
        // paced deferred public lane below instead of being abandoned at
        // jpdb-pitch-unknown until clicked. Urgent (popover) flows keep the
        // bounded public fallback; an EXPLICIT publicLookup choice by the
        // caller (the deferred drain's true, a surface's deliberate false) is
        // never overridden.
        let deferLocalMissesToPublicLane = false;
        if (options.publicLookup === undefined && options.urgent !== true && await this.hasLocalPitchDictionary()) {
            options = { ...options, publicLookup: false };
            deferLocalMissesToPublicLane = true;
        }
        const seen = new Set<string>();
        const tokensNeedingLookup = tokens.filter(token => !this.applyCachedPublicVocabularyToToken(token));
        const uniqueTokens = tokensNeedingLookup.filter(token => {
            // A bounded reading batch may leave an exact-id tail in the
            // dedicated lane. Do not duplicate those /info requests through
            // the optional pitch path; already-readable peers still continue.
            if (this.deferredPublicJitenReadings.needsHydration(token)) return false;
            // Classifiability, not mere pattern presence: a card whose stored
            // patterns fit a DIFFERENT reading (dictionary form vs the
            // conjugated/contextual one) renders jpdb-pitch-unknown forever if
            // pitchAccent.length excludes it from every enrichment pass.
            if (cardHasContextPitch(token.card) || hasResolvedPitchComponents(token.card)) return false;
            if (isLowValuePitchEnrichmentToken(token)) return false;
            if (options.substantivePublicLookupOnly && token.card.source === 'fallback' && !isSubstantivePublicPitchLookupToken(token)) return false;
            if (!token.card.spelling.trim()) return false;
            const key = cardKey(token.card);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((first, second) => pitchEnrichmentPriority(first) - pitchEnrichmentPriority(second));

        if (options.publicLookup === false) {
            await this.enrichLocalOnlyPitchTokens(uniqueTokens, options);
            // Local-first: whatever the local bank could not classify goes to
            // the paced deferred public jpdb.io lane — on EVERY surface (the
            // Google evidence showed the silent drop is not YouTube-specific).
            // Volume stays bounded by design: per-URL enqueue cap + dedupe,
            // idle-gated 4-token chunks, shared concurrency 4, the pitch
            // client's TTL/persistent caches, and its failure backoff. Tokens
            // arrive in enrichment-priority order, so visible words drain
            // first. Callers that explicitly demanded no public lookups are
            // respected (deferLocalMissesToPublicLane is only set when the
            // local dictionary forced the offline pass).
            if (deferLocalMissesToPublicLane) {
                const misses = uniqueTokens.filter(token => !cardHasContextPitch(token.card));
                if (misses.length) this.scheduleDeferredPublicPitchEnrichment(misses);
            }
            return;
        }

        if (options.urgent && typeof options.publicLookupLimit !== 'number') {
            const urgentTokens = uniqueTokens.map(token => this.takeQueuedPitchEnrichmentToken(cardKey(token.card)) ?? token);
            await runLimited(urgentTokens, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, options));
            return;
        }

        if (typeof options.publicLookupLimit === 'number') {
            const publicLookupLimit = Math.max(0, Math.floor(options.publicLookupLimit));
            const requestedPublicTotal = boundedPublicPitchLookupReservation(
                uniqueTokens.length,
                publicLookupLimit,
                options.publicLookupTotalLimit,
            );
            const publicLookupCandidateLimit = this.reserveBackgroundPublicPitchLookups(requestedPublicTotal, options);
            const publicLookupCandidates = uniqueTokens.slice(0, publicLookupCandidateLimit);
            const localOnlyTokens = uniqueTokens.slice(publicLookupCandidateLimit);
            const pausePublicLookupForHover = this.shouldPauseBackgroundPublicPitchLookup(options);
            const publicTokens = pausePublicLookupForHover ? [] : publicLookupCandidates.slice(0, publicLookupLimit);
            const deferredPublicTokens = pausePublicLookupForHover ? publicLookupCandidates : publicLookupCandidates.slice(publicLookupLimit);
            const shouldDeferPublicLookup = pausePublicLookupForHover || options.deferPublicLookup !== false;
            // Tokens that only got a local-only pass: the deferred public-pitch
            // candidates AND the budget-denied tail. Keyless users (no local
            // dictionary) resolve nothing locally, so these must ALL be retried
            // via the paced deferred public lane — otherwise budget-denied page
            // text (notably YouTube comments, while captions bypass the budget)
            // is abandoned at jpdb-pitch-unknown forever, with no underline. The
            // deferredPublicPitchQueuedKeys dedup + per-URL budget keep it bounded.
            const localOnlyRetryTokens = [...deferredPublicTokens, ...localOnlyTokens];
            const localOnly = runLimited(
                localOnlyRetryTokens,
                LOCAL_PITCH_ENRICHMENT_CONCURRENCY,
                token => this.enrichPitchToken(token, { publicLookup: false }),
            );
            if (!publicTokens.length) {
                await localOnly;
                if (shouldDeferPublicLookup) this.scheduleDeferredPublicPitchEnrichment(localOnlyRetryTokens);
                return;
            }
            const queuedPublicTokens = await this.resolvePublicFallbackPitchTokens(publicTokens, options);
            if (!queuedPublicTokens.length) {
                await localOnly;
                if (shouldDeferPublicLookup) this.scheduleDeferredPublicPitchEnrichment(localOnlyRetryTokens);
                return;
            }
            this.queuePitchEnrichmentTokens(queuedPublicTokens, options);
            await Promise.all([localOnly, this.drainPitchEnrichmentQueue()]);
            if (shouldDeferPublicLookup) this.scheduleDeferredPublicPitchEnrichment(localOnlyRetryTokens);
            return;
        }

        this.queuePitchEnrichmentTokens(uniqueTokens, options);
        await this.drainPitchEnrichmentQueue();
    }

    private shouldRunPitchOrReadingEnrichment(): boolean {
        return usesJapaneseProviders()
            && (this.settings.showPitchAccent || (this.settings.showFurigana && this.settings.furiganaMode !== 'off'));
    }

    private shouldRunCanonicalCardEnrichment(): boolean {
        return usesJapaneseProviders() && (
            this.shouldRunPitchOrReadingEnrichment()
            || shouldLookupAnkiStatus(this.settings)
            || shouldLookupBunproWordStates(this.settings)
            || this.settings.yomuLocalSrsEnabled
            || this.canPreloadBackgroundReaderAudio()
        );
    }

    private reconcileRenderedTokenFurigana(token: JPDBToken): void {
        if (!this.settings.showFurigana || this.settings.furiganaMode === 'off' || token.rubies.length) return;
        const reading = token.card.reading.trim();
        if (!reading || reading === token.card.spelling.trim()) return;
        const surface = (token.sentence?.slice(token.start, token.end) || token.card.spelling).trim();
        if (![...surface].some(isKanjiCharacter)) return;
        const pitchClass = token.pitchClass || getPitchClass(token.card.pitchAccent, reading) || 'unknown';
        this.applyPublicVocabularyToRenderedWords(token.card, token.card, pitchClass);
    }

    private resolvePublicFallbackPitchTokens(
        tokens: JPDBToken[],
        options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {},
    ): Promise<JPDBToken[]> {
        return resolvePublicFallbackPitchTokensWithPublicJiten(tokens, options, {
            captureTarget: () => this.cardLookup.captureTarget(),
            hasUnresolvedFallback: key => this.hasUnresolvedFallbackVocabulary(key),
            lookupFallbackCards: (cards, lookupOptions, scope) =>
                this.publicLookupFallbackCards(cards, lookupOptions, scope),
            lookupJitenCards: (cards, scope) => this.cardLookup.publicLookupHydratableJitenCards(cards, scope),
            noteFallbackMiss: (key, missedTokens) => this.noteFallbackVocabularyMiss(key, missedTokens),
            showPitchAccent: () => this.settings.showPitchAccent,
            rememberResolvedFallback: (token, fallback, card) => this.rememberResolvedFallbackVocabulary(token, fallback, card),
            applyResolvedCard: (token, fallback, card, pitchClass) =>
                this.applyResolvedPitchCardToToken(token, fallback, card, pitchClass),
            shouldQueueResolvedPublicPitch: (card, publicLookup) =>
                this.shouldQueueResolvedPublicPitch(card, publicLookup),
            queueSubtitleRefresh: sentence => this.queueSubtitleParsedHtmlRefresh(sentence),
            cacheCards: cards => this.parser.cacheCards?.(cards),
            enrichLocalPitch: localTokens => runLimited(
                localTokens,
                LOCAL_PITCH_ENRICHMENT_CONCURRENCY,
                token => this.enrichPitchToken(token, { publicLookup: false }),
            ).then(() => undefined),
        });
    }

    private shouldQueueResolvedPublicPitch(card: JPDBCard, publicLookup: boolean): boolean {
        return this.settings.showPitchAccent
            && !cardHasContextPitch(card)
            && publicLookup;
    }

    private scheduleDeferredPublicPitchEnrichment(tokens: JPDBToken[]): void {
        if (!tokens.length) return;
        this.queueDeferredPublicPitchTokens(tokens);
        void this.drainDeferredPublicPitchQueue().catch(error => {
            log.warn('Deferred pitch failed', error);
        });
    }

    private reserveBackgroundPublicPitchLookups(requested: number, options: Pick<PitchEnrichmentOptions, 'publicLookupPageBudget'>): number {
        const normalizedRequested = Math.max(0, Math.floor(requested));
        if (!normalizedRequested) return 0;
        if (typeof options.publicLookupPageBudget !== 'number') return normalizedRequested;
        this.resetBackgroundPublicPitchLookupBudgetIfNeeded();
        const budget = Math.max(0, Math.floor(options.publicLookupPageBudget));
        const remaining = Math.max(0, budget - this.backgroundPublicPitchLookupBudgetUsed);
        const reserved = Math.min(normalizedRequested, remaining);
        this.backgroundPublicPitchLookupBudgetUsed += reserved;
        return reserved;
    }

    private resetBackgroundPublicPitchLookupBudgetIfNeeded(): void {
        if (this.backgroundPublicPitchLookupBudgetHref === location.href) return;
        this.backgroundPublicPitchLookupBudgetHref = location.href;
        this.backgroundPublicPitchLookupBudgetUsed = 0;
        this.deferredPublicPitchEnqueuedForUrl = 0;
        this.publicVocabularyMissRetries.clear();
        this.misalignedPublicFuriganaRecoveries.clear();
    }

    private queueDeferredPublicPitchTokens(tokens: JPDBToken[]): void {
        this.resetBackgroundPublicPitchLookupBudgetIfNeeded();
        for (const token of tokens) {
            // Cap the paced deferred lane per URL so budget-denied tokens (incl.
            // comment words) cannot trickle unbounded public lookups; once the cap
            // is hit the remainder stay local-only, exactly like the immediate
            // per-URL budget. Reset alongside that budget on URL change.
            if (this.deferredPublicPitchEnqueuedForUrl >= DEFERRED_PUBLIC_PITCH_PER_URL_CAP) break;
            const key = cardKey(token.card);
            if (this.deferredPublicPitchQueuedKeys.has(key)) continue;
            if (this.pitchEnrichmentQueuedKeys.has(key)) continue;
            this.deferredPublicPitchQueuedKeys.add(key);
            this.deferredPublicPitchQueue.push(token);
            this.deferredPublicPitchEnqueuedForUrl++;
        }
    }

    private async drainDeferredPublicPitchQueue(): Promise<void> {
        if (this.deferredPublicPitchDrain) return this.deferredPublicPitchDrain;
        this.deferredPublicPitchDrain = this.runDeferredPublicPitchQueue().finally(() => {
            this.deferredPublicPitchDrain = undefined;
            if (!this.isDestroyed && this.shouldRunPitchOrReadingEnrichment() && this.deferredPublicPitchQueue.length) {
                void this.drainDeferredPublicPitchQueue();
            }
        });
        return this.deferredPublicPitchDrain;
    }

    private async runDeferredPublicPitchQueue(): Promise<void> {
        while (!this.isDestroyed && this.shouldRunPitchOrReadingEnrichment() && this.deferredPublicPitchQueue.length) {
            await this.waitForIdle(DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS);
            if (this.shouldPauseBackgroundPublicPitchLookup({})) {
                await wait(DEFERRED_PUBLIC_PITCH_HOVER_PAUSE_MS);
                continue;
            }
            // Consuming queue entries while the shared public-jiten backoff is
            // active turns every one of them into a guaranteed miss; sleep the
            // backoff out in bounded slices instead (only when the next chunk
            // actually needs the public jiten endpoint).
            const backoffMs = publicJitenBackoffRemainingMs();
            if (backoffMs > 0 && this.deferredPublicPitchQueue
                .slice(0, DEFERRED_PUBLIC_PITCH_ENRICHMENT_CHUNK_SIZE)
                .some(token => token.card.source === 'fallback' || isHydratablePublicJitenCard(token.card))) {
                await wait(Math.min(backoffMs, DEFERRED_PUBLIC_PITCH_BACKOFF_WAIT_MS));
                continue;
            }
            const batch = this.deferredPublicPitchQueue.splice(0, DEFERRED_PUBLIC_PITCH_ENRICHMENT_CHUNK_SIZE);
            batch.forEach(token => this.deferredPublicPitchQueuedKeys.delete(cardKey(token.card)));
            // publicLookup: true — the lane EXISTS to do the paced public
            // retry; without the explicit flag the local-dictionary override
            // would force this call offline again and the lane became a no-op
            // for exactly the users whose local bank missed (class F).
            await this.enrichPitchWords(batch, { publicLookupLimit: batch.length, publicLookup: true });
        }
    }

    private shouldPauseBackgroundPublicPitchLookup(options: Pick<PitchEnrichmentOptions, 'urgent'>): boolean {
        return !options.urgent && this.activePopoverMode === 'hover' && Boolean(this.activePopover?.isConnected);
    }

    private queuePitchEnrichmentTokens(tokens: JPDBToken[], options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {}): void {
        for (const token of tokens) {
            const key = cardKey(token.card);
            if (this.pitchEnrichmentQueuedKeys.has(key)) {
                if (options.urgent) this.promoteQueuedPitchEnrichmentToken(key, options);
                continue;
            }
            this.pitchEnrichmentQueuedKeys.add(key);
            if (options.urgent) this.pitchEnrichmentUrgentKeys.add(key);
            this.pitchEnrichmentQueuedOptions.set(key, pitchEnrichmentQueueOptions(options));
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
        const fallback = token.card;
        const card = this.resolvedFallbackVocabularyCache.get(fallbackVocabularySpanCacheKey(fallback, token));
        if (!card) return false;
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        token.card = card;
        token.pitchClass = isParticleCard(card) ? 'particle' : pitchClass;
        const changedRoots = this.applyPublicVocabularyToRenderedWords(fallback, card, token.pitchClass, token);
        this.queueResolvedWordEffects([token], changedRoots);
        this.queueSubtitleParsedHtmlRefresh(token.sentence);
        return true;
    }

    private promoteQueuedPitchEnrichmentToken(key: string, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {}): void {
        const index = this.pitchEnrichmentQueue.findIndex(token => cardKey(token.card) === key);
        if (index < 0) return;
        this.pitchEnrichmentUrgentKeys.add(key);
        this.pitchEnrichmentQueuedOptions.set(key, pitchEnrichmentQueueOptions({
            ...this.pitchEnrichmentQueuedOptions.get(key),
            ...options,
            urgent: true,
        }));
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
        this.pitchEnrichmentQueuedOptions.delete(key);
    }

    private async drainPitchEnrichmentQueue(): Promise<void> {
        // Chain every caller behind the drain it observed. Returning an
        // already-resolved drain during its `finally` hand-off let a caller
        // enqueue new tokens, await the old promise, and bake HTML before the
        // follow-up drain (started fire-and-forget) enriched those tokens.
        const previous = this.pitchEnrichmentDrain;
        const drain = (previous ? previous.catch(() => undefined) : Promise.resolve())
            .then(async () => {
                // `runPitchEnrichmentQueue` normally drains entries queued
                // during its own awaits, but keep the shared drain alive until
                // quiescence as well. This closes the final await -> return
                // window without handing a follow-up run to a detached promise.
                do {
                    await this.runPitchEnrichmentQueue();
                } while (!this.isDestroyed
                    && this.shouldRunPitchOrReadingEnrichment()
                    && this.pitchEnrichmentQueue.length);
            });
        this.pitchEnrichmentDrain = drain;
        void drain.finally(() => {
            if (this.pitchEnrichmentDrain === drain) this.pitchEnrichmentDrain = undefined;
        }).catch(() => undefined);
        return drain;
    }

    private async runPitchEnrichmentQueue(): Promise<void> {
        while (!this.isDestroyed && this.shouldRunPitchOrReadingEnrichment() && this.pitchEnrichmentQueue.length) {
            const batch = this.pitchEnrichmentQueue.splice(0, PITCH_ENRICHMENT_LIMIT);
            const batchOptions = new Map<string, Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>>();
            batch.forEach(token => {
                const key = cardKey(token.card);
                batchOptions.set(key, this.pitchEnrichmentQueuedOptions.get(key) ?? {});
                this.forgetQueuedPitchEnrichmentToken(key);
            });
            await this.waitForBackgroundEnrichmentTurn();
            await runLimited(batch, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, batchOptions.get(cardKey(token.card)) ?? {}));
            if (this.pitchEnrichmentQueue.length) await this.waitForIdle();
        }
    }

    // Local pitch is IndexedDB-backed (no network, no rate limit), so EVERY
    // visible word should get it — not just the first PITCH_ENRICHMENT_LIMIT.
    // (The old slice(0, PITCH_ENRICHMENT_LIMIT) cap was a vestige of the
    // network-queue batch size; on this branch resolvePitchFallbackCard and
    // ensureCardPitchAccent both short-circuit, so it issues no HTTP and the
    // cap only starved coverage — words past 12 were dropped with no re-queue.)
    // Drain the whole batch at the wide local concurrency in idle-paced chunks
    // so a dense page colours fully within a few idle ticks while staying
    // responsive, instead of trickling in one word at a time as rescans fire.
    private async enrichLocalOnlyPitchTokens(tokens: JPDBToken[], options: PitchEnrichmentOptions): Promise<void> {
        for (let index = 0; index < tokens.length; index += PITCH_ENRICHMENT_LIMIT) {
            if (this.isDestroyed || !this.shouldRunPitchOrReadingEnrichment()) return;
            const chunk = tokens.slice(index, index + PITCH_ENRICHMENT_LIMIT);
            await this.waitForBackgroundEnrichmentTurn();
            await runLimited(chunk, LOCAL_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, options));
            if (index + PITCH_ENRICHMENT_LIMIT < tokens.length) await this.waitForIdle();
        }
    }

    private async fillCardPitchFromLocalDictionary(card: JPDBCard): Promise<void> {
        if (cardHasContextPitch(card)) return;
        const localPitch = await this.localPitchAccentForCard(card);
        if (localPitch.length) card.pitchAccent = mergePitchPatterns(localPitch, card.pitchAccent);
    }

    // Interactive card enrichment (hover/modal popovers) shares IndexedDB and
    // the network lanes with the background pitch scan; on dense pages the
    // scan saturated both and every popover blew its 2.5s/4s data budgets,
    // rendering with empty pills (same starvation class as the 1.6.185
    // homepage fix). Background drains yield between chunks while a card is
    // actively loading; the wait is bounded so a wedged load can never stall
    // the scan for good.
    private interactiveCardLoadDepth = 0;

    private noteInteractiveCardLoad(load: CardRenderDataLoad): CardRenderDataLoad {
        this.interactiveCardLoadDepth += 1;
        const release = () => { this.interactiveCardLoadDepth = Math.max(0, this.interactiveCardLoadDepth - 1); };
        void load.all.then(release, release);
        return load;
    }

    private async waitForBackgroundEnrichmentTurn(): Promise<void> {
        const deadline = Date.now() + 10_000;
        while (this.interactiveCardLoadDepth > 0 && Date.now() < deadline && !this.isDestroyed) {
            await wait(150);
        }
    }

    private async enrichPitchToken(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {}): Promise<void> {
        // Particles render as deliberately accentless — enriching them would
        // only resurrect a homophone noun's pattern as a spurious underline.
        if (isParticleCard(token.card)) return;
        const fallback = token.card;
        const previousPitchClass = token.pitchClass ?? '';
        const card = await this.pitchEnrichedRenderedCard(token, options);
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (card !== fallback) {
            await this.applyResolvedPitchCardToToken(token, fallback, card, pitchClass);
            this.queueSubtitleParsedHtmlRefresh(token.sentence);
            return;
        }
        // Paint as soon as ANY morpheme resolves so a partial gradient lands and
        // then improves; the strict predicate above/at the skip gates keeps the
        // public-lookup passes filling the remaining morphemes.
        if (hasPaintablePitchComponents(card)) {
            this.applyPitchComponentsToRenderedWords(card);
            this.queueSubtitleParsedHtmlRefresh(token.sentence);
            return;
        }
        this.applyPitchClassToFallbackToken(token, card, pitchClass);
        if (pitchClass && pitchClass !== previousPitchClass) this.queueSubtitleParsedHtmlRefresh(token.sentence);
    }

    private async pitchEnrichedRenderedCard(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>): Promise<JPDBCard> {
        const fallback = token.card;
        if (!cardUsesPitchAccentPronunciation(fallback)) return fallback;
        await this.fillCardPitchFromLocalDictionary(fallback);
        const card = await this.resolvePitchFallbackCard(token, options);
        if (card !== fallback) await this.fillCardPitchFromLocalDictionary(card);
        await this.ensureCardPitchAccent(card, options);
        return card;
    }

    private async resolvePitchFallbackCard(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>): Promise<JPDBCard> {
        const fallback = token.card;
        if (cardHasContextPitch(fallback) || hasResolvedPitchComponents(fallback) || options.publicLookup === false) return fallback;
        return await this.resolveRenderedFallbackVocabulary(token, options) ?? fallback;
    }

    private async ensureCardPitchAccent(card: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'jpdbPublicLookup'>): Promise<void> {
        if (!this.settings.showPitchAccent || !cardUsesPitchAccentPronunciation(card)) return;
        if (cardHasContextPitch(card) || hasResolvedPitchComponents(card)) return;
        const allowPublicLookup = options.publicLookup !== false && options.jpdbPublicLookup !== false;
        // Whole-expression evidence always wins. A component accent is never
        // allowed to stand in for a direct exact spelling+reading contour.
        if (allowPublicLookup) {
            const pitchAccent = await this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(() => []);
            if (pitchAccent.length) {
                card.pitchAccent = mergePitchPatterns(pitchAccent, card.pitchAccent);
                return;
            }
        }

        if (card.pitchComponents?.length) {
            await this.enrichCardPitchComponents(card, card.pitchComponents, allowPublicLookup);
            return;
        }

        // Some exact expression records provide excellent bracket-aligned
        // reading geometry but omit `composedOf` (申し訳ありません is the standing
        // subtitle example). ICU boundaries may recover the exact substrings;
        // only components with their own exact pitch evidence are coloured and
        // every unresolved suffix remains a neutral segment.
        const inferred = inferredAnnotatedPitchComponents(card);
        if (!inferred.length) return;
        await this.enrichCardPitchComponents(card, inferred, allowPublicLookup);
        if (hasPaintablePitchComponents({ ...card, pitchComponents: inferred })) card.pitchComponents = inferred;
    }

    private async enrichCardPitchComponents(
        card: JPDBCard,
        components: JPDBCard['pitchComponents'],
        allowPublicLookup: boolean,
    ): Promise<void> {
        await Promise.all((components ?? []).map(async component => {
            if (getPitchClass(component.pitchAccent, component.reading || component.spelling)) return;
            // Inferred kana fragments are neutral geometry, not lexical
            // candidates: querying せん/を could paint an unrelated homophone.
            if (component.inferredFromAnnotatedReading
                && !Array.from(component.spelling).some(isKanjiCharacter)) return;
            const localPitch = await this.localPitchAccentForCard({
                ...card,
                spelling: component.spelling,
                reading: component.reading,
                pitchAccent: [],
                pitchComponents: undefined,
                wordWithReading: component.wordWithReading,
            });
            if (localPitch.length) {
                component.pitchAccent = mergePitchPatterns(localPitch, component.pitchAccent);
                return;
            }
            if (!allowPublicLookup) return;
            component.pitchAccent = await this.jpdbPublicPitch.lookup(component.spelling, component.reading).catch(() => []);
        }));
    }

    private async applyResolvedPitchCardToToken(token: JPDBToken, fallback: JPDBCard, card: JPDBCard, pitchClass: string): Promise<void> {
        const surface = (token.sentence?.slice(token.start, token.end) || fallback.spelling).trim();
        const preserved = cardWithPreservedCachedEvidence(card, fallback, surface);
        // The coordinator caches its original object after this callback. Merge
        // onto that object so the DOM, live token, and later popup/cache all keep
        // the same conservative same-identity evidence.
        if (preserved !== card) Object.assign(card, preserved);
        // Particles are deliberately accentless throughout Yomu. If a sparse
        // same-id card carried stale pitch evidence before canonical POS
        // arrived, do not let the popup/cache retain what the page correctly
        // clears when the word becomes a particle.
        if (isParticleCard(card)) {
            card.pitchAccent = [];
            card.pitchComponents = undefined;
        }
        token.card = card;
        token.pitchClass = isParticleCard(card)
            ? 'particle'
            : getPitchClass(card.pitchAccent, card.reading || card.spelling) || pitchClass;
        const changedRoots = this.applyPublicVocabularyToRenderedWords(fallback, card, token.pitchClass || 'unknown', token);
        this.queueResolvedWordEffects([token], changedRoots);
        await this.invalidateActivePopoverPitch(card, fallback);
    }

    private applyPitchClassToFallbackToken(token: JPDBToken, card: JPDBCard, pitchClass: string): void {
        if (!pitchClass) return;
        token.pitchClass = pitchClass;
        this.applyPitchAccentToRenderedWords(card, pitchClass);
        void this.invalidateActivePopoverPitch(card);
    }

    private async invalidateActivePopoverPitch(card: JPDBCard, resolvedFrom?: JPDBCard): Promise<void> {
        const popover = this.activePopover;
        const activeCard = this.lastCard;
        if (!popover?.isConnected || !activeCard) return;
        const trigger = this.activePopoverMode === 'hover' ? 'hover' : 'modal';
        if (cardKey(activeCard) === cardKey(card)) {
            this.updatePopoverPitch(popover, activeCard, []);
            this.updateCardPopoverPosition(trigger);
            return;
        }
        if (!resolvedFrom
            || cardKey(activeCard) !== cardKey(resolvedFrom)
            || !this.isExactCanonicalFallbackResolution(resolvedFrom, card)) return;
        await this.showCard(card, this.lastCardSentence, this.activePopoverAnchor, {
            autoPlay: false,
            trigger,
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private isExactCanonicalFallbackResolution(fallback: JPDBCard, resolved: JPDBCard): boolean {
        if (fallback.source !== 'fallback' || !resolved.reading.trim()) return false;
        const expression = normalizedLookupText(resolved.spelling).replace(/\s+/g, '');
        if (!expression) return false;
        return fallbackLookupTermsForCard(fallback)
            .some(term => normalizedLookupText(term).replace(/\s+/g, '') === expression);
    }

    private clearPitchEnrichmentQueue(): void {
        this.pitchEnrichmentQueue = [];
        this.pitchEnrichmentQueuedKeys.clear();
        this.pitchEnrichmentUrgentKeys.clear();
        this.pitchEnrichmentQueuedOptions.clear();
        this.deferredPublicPitchQueue = [];
        this.deferredPublicPitchQueuedKeys.clear();
        this.deferredPublicJitenReadings.clear();
        // Deliberately NOT resetting the per-URL enqueue counter or the page
        // budget here: this clear runs on every settings save / dictionary
        // rescan, and zeroing the counters re-admitted another full public
        // budget for the SAME URL each time (sol review P1 — the cumulative
        // endpoint bound must survive rescans). URL changes reset both via
        // resetBackgroundPublicPitchLookupBudgetIfNeeded.
    }

    private hasLocalPitchDictionary(): Promise<boolean> {
        if (!this.settings.localDictionariesEnabled) return Promise.resolve(false);
        const store = this.dictionaries as typeof this.dictionaries & {
            hasPitchMetaDictionaries?: () => Promise<boolean>;
        };
        if (typeof store.hasPitchMetaDictionaries !== 'function') return Promise.resolve(false);
        this.localPitchDictionaryAvailability ??= store.hasPitchMetaDictionaries().catch(error => {
            this.localPitchDictionaryAvailability = undefined;
            log.warn('Local pitch dictionary availability check failed', { error });
            return false;
        });
        return promiseWithTimeout(
            this.localPitchDictionaryAvailability,
            LOCAL_PITCH_DICTIONARY_PRESENCE_TIMEOUT_MS,
            'Local pitch dictionary presence check timed out.',
        ).catch(error => {
            // Keep the raw probe cached: if IndexedDB eventually answers, later
            // scans still recover local-first behavior. This caller may proceed
            // through the existing bounded public lane instead of leaving page
            // words unknown until they are clicked.
            log.warnOnce('local-pitch-dictionary-presence-timeout', 'Local pitch dictionary presence check timed out', error);
            return false;
        });
    }

    private async localPitchAccentForCard(card: JPDBCard): Promise<string[]> {
        const pattern = await this.localPitchPatternForCard(card);
        return pattern ? [pattern] : [];
    }

    private async localPitchPatternForCard(card: JPDBCard): Promise<string> {
        if (!this.settings.localDictionariesEnabled || !card.spelling.trim()) return '';
        const key = this.localPitchEnrichmentCacheKey(card);
        const cached = this.pitchEnrichmentLocalCache.get(key);
        if (cached) return firstLocalPitchPattern(await cached);
        const promise: Promise<LocalPitchResolution> = localPitchResolutionFromMetaLookup(
            card.spelling,
            card.reading,
            expression => this.dictionaries.lookupTermMeta(expression, PITCH_LOCAL_META_LIMIT, this.settings.dictionaryPreferences),
        ).catch(error => {
            log.warn('Local pitch enrichment failed', { term: card.spelling }, error);
            return { patterns: [] };
        });
        this.rememberLocalPitchEnrichment(key, promise);
        return firstLocalPitchPattern(await promise);
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

    private rememberLocalPitchEnrichment(key: string, promise: Promise<LocalPitchResolution>): void {
        this.pitchEnrichmentLocalCache.set(key, promise);
        evictOldestStringKeysWhileOverLimit(this.pitchEnrichmentLocalCache, PITCH_ENRICHMENT_LOCAL_CACHE_LIMIT);
    }

    private async resolveRenderedFallbackVocabulary(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {}): Promise<JPDBCard | undefined> {
        const card = token.card;
        if (card.source !== 'fallback') return undefined;
        const scope = this.cardLookup.captureTarget();
        const key = fallbackVocabularySpanCacheKey(card, token);
        if (!options.urgent && this.hasUnresolvedFallbackVocabulary(key)) return undefined;
        const publicCard = await this.lookupFallbackApiCard(card, options, scope);
        if (!scope.isCurrent()) return undefined;
        if (!publicCard) {
            this.noteFallbackVocabularyMiss(key, []);
            return undefined;
        }
        if (cardUsesPitchAccentPronunciation(publicCard)
            && !publicCard.pitchAccent.length
            && options.jpdbPublicLookup !== false) {
            const pitchAccent = await this.jpdbPublicPitch.lookup(publicCard.spelling, publicCard.reading).catch(() => []);
            if (!scope.isCurrent()) return undefined;
            publicCard.pitchAccent = pitchAccent;
        }
        this.rememberResolvedFallbackVocabulary(token, card, publicCard);
        this.parser.cacheCards?.([publicCard]);
        return publicCard;
    }

    private rememberResolvedFallbackVocabulary(token: JPDBToken, fallback: JPDBCard, card: JPDBCard): void {
        if (fallback.source !== 'fallback') return;
        const key = fallbackVocabularySpanCacheKey(fallback, token);
        this.unresolvedFallbackVocabularyCache.delete(key);
        this.resolvedFallbackVocabularyCache.delete(key);
        this.resolvedFallbackVocabularyCache.set(key, card);
        evictOldestStringKeysWhileOverLimit(this.resolvedFallbackVocabularyCache, RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT);
        this.scheduleCachedPublicVocabularyHydration(document, { fallback, card, span: token });
    }

    private rememberUnresolvedFallbackVocabulary(key: string): void {
        this.unresolvedFallbackVocabularyCache.delete(key);
        this.unresolvedFallbackVocabularyCache.set(key, Date.now() + UNRESOLVED_FALLBACK_VOCABULARY_RETRY_TTL_MS);
        evictOldestStringKeysWhileOverLimit(this.unresolvedFallbackVocabularyCache, UNRESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT);
    }

    private hasUnresolvedFallbackVocabulary(key: string): boolean {
        const retryAfter = this.unresolvedFallbackVocabularyCache.get(key);
        if (retryAfter === undefined) return false;
        if (retryAfter > Date.now()) return true;
        this.unresolvedFallbackVocabularyCache.delete(key);
        return false;
    }

    // A miss during endpoint backoff, or one that has retries left, goes back
    // through the paced deferred lane; only a miss that exhausted its retries
    // is negative-cached (and even that expires — see the TTL above).
    private noteFallbackVocabularyMiss(key: string, tokens: JPDBToken[]): void {
        // A miss recorded while the shared public endpoint is in backoff is
        // transient: the term was never really looked up (the client short-
        // circuits to null under backoff, and a timeout is what arms the
        // backoff in the first place). Counting it would let a run of timeouts
        // burn the retry budget and negative-cache a word that has a perfectly
        // good public entry, stranding it reading-less for the whole TTL. Re-pace
        // it without spending a retry so a real post-backoff lookup decides.
        if (publicJitenBackoffRemainingMs() > 0) {
            this.requeueDeferredPublicPitchTokens(tokens);
            return;
        }
        const attempts = (this.publicVocabularyMissRetries.get(key) ?? 0) + 1;
        this.publicVocabularyMissRetries.set(key, attempts);
        evictOldestStringKeysWhileOverLimit(this.publicVocabularyMissRetries, UNRESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT);
        if (attempts <= PUBLIC_VOCABULARY_MISS_RETRY_LIMIT) {
            this.requeueDeferredPublicPitchTokens(tokens);
            return;
        }
        this.rememberUnresolvedFallbackVocabulary(key);
    }

    // Re-enqueue without touching the per-URL enqueue cap: these tokens were
    // already admitted once; a retry must not consume another page-budget slot
    // (and must not be dropped once the cap is reached).
    private requeueDeferredPublicPitchTokens(tokens: JPDBToken[]): void {
        let queued = false;
        for (const token of tokens) {
            const key = cardKey(token.card);
            if (this.deferredPublicPitchQueuedKeys.has(key)) continue;
            if (this.pitchEnrichmentQueuedKeys.has(key)) continue;
            this.deferredPublicPitchQueuedKeys.add(key);
            this.deferredPublicPitchQueue.push(token);
            queued = true;
        }
        if (!queued) return;
        void this.drainDeferredPublicPitchQueue().catch(error => {
            log.warn('Deferred pitch retry failed', error);
        });
    }

    private preloadTermAudioForTokens(tokens: JPDBToken[]): void {
        if (!this.canPreloadBackgroundReaderAudio()) return;
        this.queueTermAudioPreloads(tokens);
    }

    private preloadParsedTokens(tokens: JPDBToken[]): void {
        if (!tokens.length) return;
        this.parser.cacheCards?.(tokens.map(token => token.card));
        this.preloadTermAudioForTokens(tokens);
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
        return this.preloadReaderCardAudio(token.card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: false });
    }

    private rememberPreloadedTermAudioKey(key: string): void {
        this.preloadedTermAudioKeys.add(key);
        evictOldestStringKeysWhileOverLimit(this.preloadedTermAudioKeys, PRELOADED_TERM_AUDIO_KEY_LIMIT);
    }

    private rememberPreloadedPreparedTermAudioKey(key: string): void {
        this.preloadedPreparedTermAudioKeys.add(key);
        evictOldestStringKeysWhileOverLimit(this.preloadedPreparedTermAudioKeys, PRELOADED_TERM_AUDIO_KEY_LIMIT);
    }

    private dictionaryLabel(name: string): string {
        return this.settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private kanjiSourceTitle(sourceId: string): string {
        return kanjiSourceLabel(this.settings, sourceId, this.defaultKanjiSourceTitle(sourceId));
    }

    private kanjiFactSourceTitle(source: 'jpdb' | 'jiten'): string {
        const sourceId = source === 'jpdb' ? JPDB_DEFINITION_SOURCE_ID : JITEN_DEFINITION_SOURCE_ID;
        return definitionSourceLabel(this.settings, sourceId, kanjiFactProviderTitle(source));
    }

    private defaultKanjiSourceTitle(sourceId: string): string {
        if (sourceId === KANJI_STROKE_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'strokePractice');
        if (sourceId === KANJI_JPDB_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'readingsComponents');
        if (sourceId === KANJI_RTK_SOURCE_ID) return 'RTK';
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'kanjiDictionaries');
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return uiText(this.settings.interfaceLanguage, 'originStructure');
        return '';
    }

    private renderKanjiFactSourcesHtml(jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null, language: InterfaceLanguage): string {
        const sections: string[] = [];
        const jpdbKey = kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID);
        if (jpdbInfo && this.kanjiCompanion) {
            sections.push(this.kanjiCompanion.renderJpdbKanjiInfo(jpdbInfo, language, this.dictionarySourceState.isOpen(jpdbKey), jpdbKey, this.kanjiFactSourceTitle('jpdb')));
        }
        // When both services answer for this kanji we show both cards (the reader
        // asked to see Jiten and JPDB facts side by side, not just the active one).
        if (jitenInfo) {
            const jitenKey = `${jpdbKey}:jiten`;
            sections.push(renderJitenKanjiInfo(jitenInfo, language, this.dictionarySourceState.isOpen(jitenKey), jitenKey, this.kanjiFactSourceTitle('jiten')));
        }
        return sections.join('');
    }

    private applyAnkiLookupToRenderedWords(
        card: JPDBCard,
        ankiLookup: AnkiLookupResult,
        options: { preserveExistingEmpty?: boolean; roots?: ParentNode[] } = {},
    ): void {
        this.applyAnkiLookupMapToRenderedWords(new Map([[renderedWordCardKey(card.vid, card.sid), ankiLookup]]), options.roots ?? [document], options);
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
            const targetRoots = this.renderedAnnotationRoots(roots);
            if (!this.shouldRunAnkiBackgroundWork()) {
                this.clearRenderedAnkiLookupStateForKeys(lookupByWordKey, targetRoots);
                return;
            }
            this.renderedWords.prepareForLookups(lookupByWordKey, targetRoots);
            const touchedWords: HTMLElement[] = [];
            lookupByWordKey.forEach((lookup, key) => {
                this.renderedWords.wordsForLookupKey(key, targetRoots).forEach(word => {
                    applyAnkiLookupToRenderedWord(word, lookup, this.settings.interfaceLanguage, options);
                    touchedWords.push(word);
                });
            });
            // Refresh contrast only around the words this batch touched: a
            // whole-root refresh forces layout across every transcript row on
            // every cue, which made the YouTube side panel unusable.
            refreshContrastForChangedWords(touchedWords);
        });
    }

    private clearRenderedAnkiLookupStateForKeys(lookupByWordKey: Map<string, AnkiLookupResult>, roots: ParentNode[]): void {
        const touchedWords: HTMLElement[] = [];
        lookupByWordKey.forEach((_lookup, key) => {
            this.renderedWords.wordsForLookupKey(key, roots).forEach(word => {
                clearRenderedWordAnkiState(word);
                touchedWords.push(word);
            });
        });
        refreshContrastForChangedWords(touchedWords);
    }

    private clearRenderedAnkiWordStates(root: ParentNode = document): void {
        this.pauseAutoScanObserver(() => {
            this.renderedAnnotationRoots([root]).forEach(targetRoot => {
                renderedWordsInRoot(targetRoot).forEach(word => clearRenderedWordAnkiState(word));
                refreshReaderWordContrast(targetRoot);
            });
        });
    }

    private registerRenderedWordsInRoot(root: ParentNode): void {
        this.renderedWords.registerRoot(root);
    }

    private registerRenderedWord(word: HTMLElement): void {
        this.renderedWords.register(word);
    }

    private renderedAnnotationRoots(roots: ParentNode[] = [document]): ParentNode[] {
        const expanded = [...roots];
        if (roots.includes(document)) {
            forEachScannedShadowRoot(root => expanded.push(root));
        }
        return uniqueParentNodes(expanded);
    }

    private clearRenderedWordIndex(): void {
        this.renderedWords.clear();
    }

    private applyPitchAccentToRenderedWords(
        card: JPDBCard,
        pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling),
        roots: ParentNode[] = [document],
    ): void {
        if (!pitchClass) return;
        this.applyPitchComponentsToRenderedWords(card, roots, pitchClass);
    }

    private applyPitchComponentsToRenderedWords(card: JPDBCard, roots: ParentNode[] = [document], pitchClass = ''): void {
        if (!pitchClass && !hasPaintablePitchComponents(card)) return;
        const key = renderedWordCardKey(card.vid, card.sid);
        this.pauseAutoScanObserver(() => {
            const changedRoots = new Set<ParentNode>();
            const apply = (word: HTMLElement): void => {
                if (pitchClass) {
                    this.applyPitchClassToRenderedSurface(word, pitchClass);
                    setRenderedWordPitchAccentPattern(word, card);
                }
                setRenderedWordPitchComponents(word, card);
                changedRoots.add(word.parentElement ?? word);
            };
            const targetRoots = this.renderedAnnotationRoots(roots);
            this.renderedWords.prepareForLookups(new Map([[key, true]]), targetRoots);
            this.renderedWords.wordsForLookupKey(key, targetRoots).forEach(apply);
            changedRoots.forEach(root => refreshReaderWordContrast(root));
        });
    }

    private applyPublicVocabularyToRenderedWords(
        fallback: JPDBCard,
        card: JPDBCard,
        pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown',
        span?: Pick<JPDBToken, 'start' | 'end'>,
    ): ParentNode[] {
        return this.lateCardReconciliation.repaint(fallback, card, pitchClass, span);
    }

    private lateAnnotationRootForRenderedWord(word: HTMLElement): ParentNode {
        // The hydrated word may sit inside an inline wrapper while the other
        // cards from its sentence live in sibling wrappers. Reconcile at the
        // nearest established reading/geometry scope so inverse i+1 changes
        // reach those siblings without escalating to a document-wide pass.
        return renderedWordSentenceScope(word);
    }

    // Cluster I1: SRS status may never arrive for a word that fell back to a
    // provisional not-in-deck (visible-scan parse timed out to local/segmented,
    // or a keyless public-jiten lookup carried no authenticated state). Nothing
    // else backfills it. This is the safety net: one debounced, idle-scheduled,
    // batched authenticated lookup that upgrades those words with the user's
    // real Jiten known-state and marks them authoritative so they are never
    // re-requested. Debounced to a single pending timer, so repeated scans
    // coalesce and the pipeline still idles to zero timers (respects ccbe1c023).
    private scheduleReaderKnownStateBackfill(): void {
        if (this.knownStateBackfillTimer !== undefined) return;
        if (!this.canScheduleKnownStateBackfill()) return;
        this.knownStateBackfillTimer = window.setTimeout(() => {
            this.knownStateBackfillTimer = undefined;
            if (!this.canScheduleKnownStateBackfill()) return;
            if (Date.now() < this.knownStateBackfillBackoffUntil) return;
            const requestIdle = (window as Window & {
                requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
            }).requestIdleCallback;
            const run = () => { void this.runReaderKnownStateBackfill(); };
            if (typeof requestIdle === 'function') requestIdle(run, { timeout: KNOWN_STATE_BACKFILL_IDLE_TIMEOUT_MS });
            else run();
        }, KNOWN_STATE_BACKFILL_DELAY_MS);
    }

    // The backfill only makes sense with an authenticated Jiten session (there is
    // no SRS state to fetch otherwise), never on a hidden tab (its result would
    // paint nothing), and never after the app is torn down.
    private canScheduleKnownStateBackfill(): boolean {
        return !this.isDestroyed
            && this.isJitenApiActive()
            && !(typeof document !== 'undefined' && document.hidden);
    }

    private async runReaderKnownStateBackfill(): Promise<void> {
        if (this.knownStateBackfillRunning || !this.canScheduleKnownStateBackfill()) return;
        if (Date.now() < this.knownStateBackfillBackoffUntil) return;
        this.resetKnownStateBackfillForUrlIfNeeded();
        const wordsBySurface = this.collectProvisionalWordsBySurface();
        if (!wordsBySurface.size) return;
        // Re-apply already-resolved cards to freshly re-rendered provisional words
        // (recyclers) with no network; parse only surfaces not yet attempted.
        const toParse: string[] = [];
        const recycledChangedRoots = new Set<ParentNode>();
        const recycledGeometryRoots = new Set<ParentNode>();
        const recycledEffectTokens = new Map<string, JPDBToken>();
        this.pauseAutoScanObserver(() => {
            for (const [surface, words] of wordsBySurface) {
                const cached = this.knownStateBackfillResolvedCards.get(surface);
                if (cached) {
                    this.applyKnownStateBackfillCardToWords(cached, words, recycledChangedRoots, recycledGeometryRoots);
                    recycledEffectTokens.set(cardKey(cached), this.resolvedWordEffectsToken(cached));
                    continue;
                }
                if (this.knownStateBackfillRequestedSurfaces.has(surface)) continue;
                if (toParse.length < KNOWN_STATE_BACKFILL_BATCH_LIMIT) toParse.push(surface);
            }
        });
        this.pageScanner.scheduleLateAnnotationRefresh(recycledChangedRoots, recycledGeometryRoots);
        if (recycledChangedRoots.size) {
            this.queueResolvedWordEffects([...recycledEffectTokens.values()], [...recycledChangedRoots]);
        }
        if (!toParse.length) return;
        // Reserve optimistically so a concurrent re-arm cannot double-request the
        // same surfaces; released only if the authenticated parse throws (a
        // surface that resolves to no card IS a resolved answer — not-a-word —
        // and must not be re-requested).
        toParse.forEach(surface => this.knownStateBackfillRequestedSurfaces.add(surface));
        this.knownStateBackfillRunning = true;
        let parsed: JPDBToken[][];
        try {
            parsed = await this.jiten.parse(toParse);
        } catch (error) {
            toParse.forEach(surface => this.knownStateBackfillRequestedSurfaces.delete(surface));
            this.knownStateBackfillBackoffUntil = Date.now() + KNOWN_STATE_BACKFILL_BACKOFF_MS;
            log.warnOnce('known-state-backfill-failed', 'Jiten known-state backfill failed', error);
            return;
        } finally {
            this.knownStateBackfillRunning = false;
        }
        if (this.isDestroyed) return;
        this.applyKnownStateBackfill(toParse, parsed, wordsBySurface);
    }

    private applyKnownStateBackfill(
        surfaces: string[],
        parsed: JPDBToken[][],
        wordsBySurface: Map<string, HTMLElement[]>,
    ): void {
        const changedRoots = new Set<ParentNode>();
        const geometryRoots = new Set<ParentNode>();
        const effectTokens = new Map<string, JPDBToken>();
        this.pauseAutoScanObserver(() => {
            surfaces.forEach((surface, index) => {
                const card = knownStateBackfillCardForSurface(surface, parsed[index] ?? []);
                if (!card) return;
                // A fresh authenticated parse: its state is a real verdict
                // (including a genuine not-in-deck), so cache it for recyclers and
                // never re-tag as provisional. The word's identity is upgraded to
                // the real Jiten ids too, so grading/refresh reach it afterwards.
                this.knownStateBackfillResolvedCards.set(surface, card);
                this.applyKnownStateBackfillCardToWords(card, wordsBySurface.get(surface) ?? [], changedRoots, geometryRoots);
                effectTokens.set(cardKey(card), this.resolvedWordEffectsToken(card));
            });
        });
        this.pageScanner.scheduleLateAnnotationRefresh(changedRoots, geometryRoots);
        if (changedRoots.size) this.queueResolvedWordEffects([...effectTokens.values()], [...changedRoots]);
    }

    private applyKnownStateBackfillCardToWords(
        card: JPDBCard,
        words: HTMLElement[],
        changedRoots: Set<ParentNode>,
        geometryRoots: Set<ParentNode>,
    ): void {
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        words.forEach(word => {
            if (!word.isConnected) return;
            const changedRoot = this.lateAnnotationRootForRenderedWord(word);
            if (this.applyPublicVocabularyToRenderedWord(word, card, pitchClass)) geometryRoots.add(changedRoot);
            changedRoots.add(changedRoot);
        });
    }

    private resetKnownStateBackfillForUrlIfNeeded(): void {
        if (this.knownStateBackfillRequestedForUrl === location.href) return;
        this.knownStateBackfillRequestedForUrl = location.href;
        this.knownStateBackfillRequestedSurfaces.clear();
        this.knownStateBackfillResolvedCards.clear();
        this.knownStateBackfillBackoffUntil = 0;
    }

    // Distinct surfaces of provisional rendered words, each mapped to its live
    // rendered words (light DOM + scanned shadow roots + the index for recycled
    // shadow mirrors), capped at the batch limit of DISTINCT surfaces. Surfaces
    // beyond the cap or words rendered later are caught by the next scan's
    // re-arm, so the pipeline still idles to zero timers.
    private collectProvisionalWordsBySurface(): Map<string, HTMLElement[]> {
        const bySurface = new Map<string, HTMLElement[]>();
        for (const word of this.provisionalKnownStateWords()) {
            const surface = knownStateBackfillSurface(word);
            if (!surface) continue;
            const existing = bySurface.get(surface);
            if (existing) {
                existing.push(word);
                continue;
            }
            // A surface already requested that resolved to NO card stays
            // provisional forever; letting it occupy a distinct-surface slot
            // every run would starve surfaces past the cap on pages with many
            // unresolvable runs. Requested-and-resolved surfaces still collect
            // (the cached card re-applies to recycled words with no network).
            if (this.knownStateBackfillRequestedSurfaces.has(surface)
                && !this.knownStateBackfillResolvedCards.has(surface)) continue;
            if (bySurface.size >= KNOWN_STATE_BACKFILL_BATCH_LIMIT) continue;
            bySurface.set(surface, [word]);
        }
        return bySurface;
    }

    private provisionalKnownStateWords(): HTMLElement[] {
        const annotatedWords = this.renderedAnnotationRoots().flatMap(root => renderedWordsInRoot(root));
        // Mirror words inside recycled/unscanned shadow roots live only in the
        // index; include any that still match the provisional predicate.
        const indexedWords = [...this.renderedWordIndex.values()]
            .flatMap(words => [...words])
            .filter(word => word.isConnected);
        return [...new Set([...annotatedWords, ...indexedWords])].filter(isProvisionalRenderedWord);
    }

    private applyCachedPublicVocabularyToRenderedFallbackWords(root: ParentNode): void {
        if (!this.resolvedFallbackVocabularyCache.size) return;
        const changedRoots = new Set<ParentNode>();
        const geometryRoots = new Set<ParentNode>();
        const effectTokens = new Map<string, JPDBToken>();
        this.pauseAutoScanObserver(() => {
            this.renderedAnnotationRoots([root])
                .flatMap(targetRoot => renderedWordsInRoot(targetRoot))
                .forEach(word => this.applyCachedPublicVocabularyToRenderedWord(word, changedRoots, geometryRoots, effectTokens));
        });
        this.pageScanner.scheduleLateAnnotationRefresh(changedRoots, geometryRoots);
        if (changedRoots.size) this.queueResolvedWordEffects([...effectTokens.values()], [...changedRoots]);
    }

    private applyCachedPublicVocabularyToRenderedWord(word: HTMLElement, changedRoots: Set<ParentNode>, geometryRoots: Set<ParentNode>, effectTokens: Map<string, JPDBToken>): void {
        const hydration = cachedRenderedWordHydration(word, this.resolvedFallbackVocabularyCache);
        if (!hydration) return;
        const { card, pitchClass } = hydration;
        const changedRoot = this.lateAnnotationRootForRenderedWord(word);
        if (this.applyPublicVocabularyToRenderedWord(word, card, pitchClass)) geometryRoots.add(changedRoot);
        changedRoots.add(changedRoot);
        effectTokens.set(cardKey(card), this.resolvedWordEffectsToken(card, pitchClass));
    }

    private scheduleCachedPublicVocabularyHydration(
        root: ParentNode,
        resolved?: { fallback: JPDBCard; card: JPDBCard; span: Pick<JPDBToken, 'start' | 'end'> },
    ): void {
        if (resolved) {
            // A single card just resolved: patch only its own rendered spans
            // instead of re-scanning the whole document. On a keyless transcript
            // fallback cards resolve in a continuous stream, and a full-document
            // querySelectorAll sweep per resolution is the open-sidebar long
            // task. The selector is vid/sid-scoped, so this is
            // O(occurrences-of-this-card); the cascade below still backfills
            // words that render after their card resolved.
            const changedRoots = this.applyPublicVocabularyToRenderedWords(
                resolved.fallback,
                resolved.card,
                undefined,
                resolved.span,
            );
            if (changedRoots.length) {
                this.queueResolvedWordEffects([this.resolvedWordEffectsToken(resolved.card)], changedRoots);
            }
        } else {
            this.applyCachedPublicVocabularyToRenderedFallbackWords(root);
        }
        if (this.cachedPublicVocabularyHydrationTimer !== undefined) return;
        const delays = [120, 500, 1_500, 5_000, 10_000];
        let index = 0;
        const scheduleNext = () => {
            const delay = delays[index++];
            if (delay === undefined) {
                this.cachedPublicVocabularyHydrationTimer = undefined;
                return;
            }
            this.cachedPublicVocabularyHydrationTimer = window.setTimeout(() => {
                if (this.isDestroyed) {
                    this.cachedPublicVocabularyHydrationTimer = undefined;
                    return;
                }
                this.applyCachedPublicVocabularyToRenderedFallbackWords(document);
                scheduleNext();
            }, delay);
        };
        scheduleNext();
    }

    private applyPublicVocabularyToRenderedWord(word: HTMLElement, card: JPDBCard, pitchClass: string): boolean {
        const previousKey = renderedWordElementKey(word);
        const previousWords = this.renderedWordIndex.get(previousKey);
        previousWords?.delete(word);
        if (previousWords && !previousWords.size) this.renderedWordIndex.delete(previousKey);
        const showPitch = this.settings.showPitchAccent;
        this.applyPitchClassToRenderedSurface(word, showPitch ? pitchClass : '');
        setRenderedWordCardIdentity(word, card, { pitchPolicy: showPitch ? 'replace' : 'clear' });
        this.registerRenderedWord(word);
        const furiganaChanged = applyPublicVocabularyFurigana(word, card, this.settings);
        this.ocr.reconcileRenderedWordVocabulary(word, card, word.dataset.pitchClass ?? '');
        this.recoverMisalignedPublicVocabularyWord(word, card);
        return furiganaChanged;
    }

    // Chunk-context tokenization can hand a span a DIFFERENT word than its own
    // surface (離れ resolved as 離[り], 調べ as 調[ちょう]): the reading cannot
    // align, so the span keeps no furigana and wears the wrong word's pitch.
    // Standalone parses pick the right word, so re-resolve the exact surface
    // once through the cached public term lookup and re-apply. Bounded by the
    // per-surface dedupe, the per-page cap, and the client's own caches/backoff.
    private recoverMisalignedPublicVocabularyWord(word: HTMLElement, card: JPDBCard): void {
        if (!this.shouldRunPitchOrReadingEnrichment()) return;
        if (word.classList.contains('jpdb-reader-has-furi') || word.closest('ruby')) return;
        const surface = (word.dataset.surface ?? '').trim();
        if (!surface || surface === card.spelling.trim()) return;
        if (![...surface].some(isKanjiCharacter)) return;
        if (this.misalignedPublicFuriganaRecoveries.has(surface)) return;
        if (this.misalignedPublicFuriganaRecoveries.size >= MISALIGNED_PUBLIC_FURIGANA_RECOVERY_LIMIT) return;
        this.misalignedPublicFuriganaRecoveries.add(surface);
        void this.jitenPublicVocabulary.lookup(surface).then(better => {
            if (!better || this.isDestroyed) return;
            if (better.spelling.trim() === card.spelling.trim() && better.reading.trim() === card.reading.trim()) return;
            const changedRoots = this.applyPublicVocabularyToRenderedWords(card, better);
            this.queueResolvedWordEffects([this.resolvedWordEffectsToken(better)], changedRoots);
        }).catch(() => undefined);
    }

    private applyPitchClassToRenderedSurface(word: HTMLElement, pitchClass: string): void {
        setRenderedWordPitchClass(word, pitchClass);
    }

    private async handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string, suppliedCommand?: privateCommands.CardCommandCapability): Promise<void> {
        if (button.disabled) return;
        const command = mainCardCommand(button, suppliedCommand);
        if (!command) return;
        const action = command.action;
        const anchor = this.connectedActivePopoverAnchor();
        const trigger = this.activeTextLookupTrigger();
        const done = log.time('cardAction', { action, term: card.spelling, trigger });
        await runCardActionOperation(
            button,
            () => refreshAfterCardAction(
                command.action,
                () => this.cardActions.perform(command, button, card, sentence, this.cardActionContext(anchor)),
                () => this.dismissAfterReview(),
                () => this.showCard(card, sentence, anchor, { autoPlay: false, trigger, navigation: 'preserve', preservePosition: true }),
            ),
            error => reportCardActionFailure({ logger: log, warning: 'Card action failed', action, term: card.spelling, language: this.settings.interfaceLanguage, toast: message => this.toast(message) }, error),
            done,
        );
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
        const activeContext = this.immersionPopover?.activeContextFor(card);
        const storedImmersionContext = this.immersionPopover?.storedContextFor(card);
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
            fetchImageDataUrl: (imageUrl, timeoutMs) => this.immersionKit ? this.immersionKit.fetchDataUrl(imageUrl, timeoutMs, this.settings.corsProxyUrl, this.settings.interfaceLanguage) : Promise.resolve(undefined),
            fetchAudioDataUrl: (audioUrls, timeoutMs) => this.immersionKit ? this.immersionKit.fetchDataUrl(audioUrls, timeoutMs, this.settings.corsProxyUrl, this.settings.interfaceLanguage) : Promise.resolve(undefined),
        });
        return context;
    }

    private showSettings(panel?: string): void {
        const settingsSurface = this.settingsSurface;
        if (settingsSurface) {
            void Promise.resolve()
                .then(() => settingsSurface.open(panel))
                .catch(error => {
                    log.warn('Host Settings surface failed', error);
                    this.toast(uiText(this.settings.interfaceLanguage, 'settingsCompanionUnavailable'));
                });
            return;
        }
        const dialog = this.getSettingsDialog();
        if (dialog) dialog.open(panel);
    }

    private resumePendingCloudSettingsSync(): void {
        const dialog = this.getSettingsDialog();
        if (dialog) void dialog.resumePendingCloudSettingsSync();
    }

    private settingsAfterDialogTargetChange(
        previous: ReaderSettings,
        settings: ReaderSettings,
        transient: boolean,
    ): ReaderSettings {
        if (transient) return settings;
        if (targetLanguageOf(settings) === targetLanguageOf(previous)) return settings;
        return { ...settings, learningTargetChosen: true };
    }
    private applyDialogSettingsTransitions(
        previous: ReaderSettings,
        settings: ReaderSettings,
        pauseChanged: boolean,
    ): void {
        this.syncCardLookupTarget(settings);
        this.stagePreferredJapaneseSiteLanguage(previous, settings);
        if (!settings.ankiEnabled) this.clearRenderedAnkiWordStates();
        if (pauseChanged) this.applyAnnotationsPausedState();
    }
    private getSettingsDialog(): SettingsDialogControllerInstance | undefined {
        const Controller = yomuSettingsDialogController();
        if (!Controller) {
            log.warnOnce('settings-companion-missing', 'Settings companion missing.');
            this.toast(uiText(this.settings.interfaceLanguage, 'settingsCompanionUnavailable'));
            return undefined;
        }
        this.settingsDialog ??= new Controller({
            getSettings: () => this.settings,
            setSettings: (settings, options) => {
                const transient = options?.transient === true;
                const pauseChanged = settings.annotationsPaused !== this.settings.annotationsPaused;
                const previous = this.settings;
                const nextSettings = this.settingsAfterDialogTargetChange(previous, settings, transient);
                this.settings = nextSettings;
                if (transient) return;
                this.applyDialogSettingsTransitions(previous, nextSettings, pauseChanged);
            },
            saveSettings: (settings, options) => this.persistSettings(settings, options),
            onSettingsPersisted: settings => this.completePreferredJapaneseSiteLanguageSave(settings),
            onSettingsPersistenceFailed: settings => this.failPreferredJapaneseSiteLanguageSave(settings),
            jpdb: this.jpdb,
            dictionaries: this.dictionaries,
            anki: this.anki,
            audio: this.audio,
            subtitles: this.subtitles,
            ocr: this.ocr,
            youtube: this.youtube,
            createBackdrop: () => this.createLanguageAwareBackdrop(() => this.dismiss()),
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

    private mountSettingsDialog(backdrop: HTMLElement, surface: HTMLElement): void {
        this.dismiss({ forceAll: true });
        this.syncReaderRootLanguage(backdrop);
        this.syncReaderRootLanguage(surface);
        applyOverlayPageScale(surface);
        document.body.append(backdrop, surface);
        this.activeBackdrop = backdrop;
        this.activePopover = surface;
        surface.focus();
    }

    private createPopover(trigger: 'modal' | 'hover' = 'modal'): HTMLElement {
        const popover = createReaderPopover(APP_NAME, this.settings, trigger);
        this.syncReaderRootLanguage(popover);
        return popover;
    }

    private mountPopover(
        popover: HTMLElement,
        anchor?: HTMLElement,
        options: MountPopoverOptions = {},
    ): void {
        const settingsStack = this.settingsStackForMountedPopover(options);
        if (settingsStack) forceReaderPopoverSurface(popover, this.settings);
        const state = this.popoverMountState(anchor, { ...options, stackOverSettings: Boolean(settingsStack) });
        const preserveOcrLookupLine = Boolean(
            state.resolvedAnchor
            && this.activePopover?.contains(state.resolvedAnchor),
        );
        if (settingsStack) {
            this.prepareSettingsStackedPopover(settingsStack);
        } else {
            this.dismiss({
                suppressHoverTarget: false,
                preserveNavigation: true,
                preserveHoverGeneration: state.mode === 'hover',
                preserveKeyboardActive: state.resolvedAnchor === this.keyboardActiveWord,
                preserveOcrLookupState: true,
                preserveLookupModalSession: state.assistiveModal,
            });
        }
        this.appendMountedPopover(popover, state);
        this.activateMountedPopover(popover, state, options, preserveOcrLookupLine);
        this.dictionarySourceState.installTracking(popover);
        this.installMountedPopoverSurface(popover, state);
        this.finishMountedPopoverLifecycle(popover, state.mode, options);
    }

    private popoverMountState(anchor: HTMLElement | undefined, options: MountPopoverOptions): PopoverMountState {
        const mode = options.mode ?? 'modal';
        const assistiveModal = mode === 'modal' && options.focusOnMount !== false;
        const backdrop = options.stackOverSettings || mode === 'hover' || shouldUseSheet(this.settings) || !this.settings.popoverBackdropEnabled
            ? undefined
            : this.createLanguageAwareBackdrop(() => {
                this.dismiss();
            });
        const resolvedAnchor = connectedElement(anchor) ?? connectedElement(this.activePopoverAnchor);
        const anchorRect = popoverAnchorRect(resolvedAnchor, this.activePopoverAnchorRect);
        const previousPopoverRect = options.preservePosition && this.activePopover
            ? this.popoverOverlayRect(this.activePopover)
            : undefined;
        const previousHoverPointerPosition = this.hoverPopoverPointerPosition;
        const mountParent = fullscreenPopoverMountParent(resolvedAnchor);
        return { mode, assistiveModal, backdrop, mountParent, resolvedAnchor, anchorRect, previousPopoverRect, previousHoverPointerPosition };
    }

    private createLanguageAwareBackdrop(onDismiss: () => void): HTMLElement {
        const backdrop = createReaderBackdrop(onDismiss);
        this.syncReaderRootLanguage(backdrop);
        return backdrop;
    }

    private syncReaderRootLanguages(): void {
        document.querySelectorAll<HTMLElement>(READER_ROOT_SELECTOR)
            .forEach(root => this.syncReaderRootLanguage(root));
        // `document.querySelectorAll` stops at a shadow boundary, so a reader
        // surface mounted inside a page's shadow tree — which is where the
        // fullscreen popover mount lands on several video sites — would keep the
        // page's direction. The scanned-shadow-root registry is the only list of
        // those trees, and it is already maintained for annotation.
        // Note what is NOT stamped: the shadow host. Direction inherits across a
        // shadow boundary, so stamping the host would be less code — but the host
        // belongs to the page, and giving a page element `dir="rtl"` to lay out
        // Yomu's popover would flip the site's own component.
        forEachScannedShadowRoot(shadowRoot => {
            shadowRoot.querySelectorAll<HTMLElement>(READER_ROOT_SELECTOR)
                .forEach(root => this.syncReaderRootLanguage(root));
        });
    }

    private syncReaderRootLanguage(root: HTMLElement): void {
        syncLanguageFamilyDom(root, activeLearningTarget().language);
        // U79's fail-closed CSS gate depends on this exact data-language
        // attribute being present on every reader-owned surface.
        root.setAttribute('data-language', root.dataset.language ?? activeLearningTarget().language);
        // D43: the same seam carries the INTERFACE locale and its direction.
        // These are two different axes on the same element — `data-language` is
        // the TARGET being studied and drives which controls exist, while
        // `lang`/`dir` are the language Yomu is speaking and drive layout,
        // fonts and screen-reader voice. Every reader-owned surface reaches this
        // method: popover, settings dialog, bottom sheet, backdrop, HUD, FAB.
        //
        // The host page's own documentElement is deliberately untouched. Yomu is
        // injected into pages it does not own; flipping their direction would
        // rewrite the article the learner came to read.
        applyInterfaceLocaleToRoot(root, this.activeInterfaceLocale());
    }

    private activeInterfaceLocale(): InterfaceLocale {
        return resolveInterfaceLocale(this.settings.interfaceLanguage, {
            browserLocales: typeof navigator === 'undefined'
                ? []
                : [...(Array.isArray(navigator.languages) ? navigator.languages : []), navigator.language],
        }).locale;
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
            this.immersionPopover?.abortPendingRequests(this.activePopover);
            this.activePopover.remove();
        }
        if (this.activeBackdrop && this.activeBackdrop !== stack.backdrop) this.activeBackdrop.remove();
        this.activePopoverResizeObserver?.disconnect();
        this.activePopoverResizeObserver = undefined;
        this.activeBackdrop = undefined;
    }

    private appendMountedPopover(popover: HTMLElement, state: PopoverMountState): void {
        const mountParent = state.mountParent ?? document.body;
        applyOverlayPageScale(popover);
        if (state.backdrop) mountParent.append(state.backdrop, popover);
        else mountParent.append(popover);
    }

    private activateMountedPopover(
        popover: HTMLElement,
        state: PopoverMountState,
        options: MountPopoverOptions,
        preserveOcrLookupLine: boolean,
    ): void {
        this.activeBackdrop = state.backdrop;
        this.activePopover = popover;
        this.activePopoverMode = state.mode;
        this.activePopoverAnchor = state.resolvedAnchor;
        this.activePopoverAnchorRect = state.anchorRect;
        this.activePopoverPositionLocked = shouldLockMountedPopoverPosition(popover, state);
        this.activeHoverWord = state.mode === 'hover' && !options.pointerTextLookup ? state.resolvedAnchor : undefined;
        this.activeHoverLookupKey = state.mode === 'hover' ? options.hoverLookupKey ?? '' : '';
        this.activePointerTextLookup = state.mode === 'hover' ? options.pointerTextLookup : undefined;
        if (state.assistiveModal) {
            this.lookupModal.activate(popover, state.resolvedAnchor);
        }
        // A lookup sheet can cover its OCR source line and steal CSS :hover.
        // Hold a transient visibility lease without changing manual pin state.
        this.retainOcrLookupLineForAnchor(state.resolvedAnchor, { preserveExisting: preserveOcrLookupLine });
        this.hoverPopoverPointerPosition = mountedHoverPointerPosition(state, this.lastPointerPosition);
        popover.classList.toggle('jpdb-reader-sheet-sticky', this.isStickyMountedSheet(popover, state));
        this.nativeTitleGuard.suppressForPopover(popover, state.resolvedAnchor);
        // Opening a lookup over a subtitle word pauses the video so the entry can
        // be read; closing the popover resumes it. Anchored here so EVERY path
        // that mounts a lookup pauses, not just the direct word-click.
        if (this.shouldPauseForMountedLookup(state)) {
            this.pauseVideoForSubtitleMining();
        }
    }

    private installMountedPopoverSurface(popover: HTMLElement, state: PopoverMountState): void {
        this.installReaderControlPointerActivation(popover);
        this.installPopoverBodyStabilizers(popover);
        if (!popover.classList.contains('jpdb-reader-sheet')) {
            if (typeof ResizeObserver === 'function') {
                // Hydration (deferred sections, anki, immersion) resizes the
                // popover several times in quick succession; coalesce those into
                // one reposition per frame so each hover doesn't trigger a burst
                // of forced-layout reposition passes.
                this.activePopoverResizeObserver = new ResizeObserver(() => this.scheduleRepositionActivePopoverFrame());
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
                if (state.mode !== 'hover') this.lockActivePopoverPosition(this.popoverOverlayRect(popover));
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

    private finishMountedPopoverLifecycle(popover: HTMLElement, mode: 'modal' | 'hover', options: MountPopoverOptions): void {
        if (mode === 'hover') {
            this.installHoverPopoverLifecycle(popover);
            this.hoverClose.startWatch();
            return;
        }
        if (options.focusOnMount === false) return;
        popover.focus();
    }

    private repositionActivePopover(): void {
        const popover = this.repositionableActivePopover();
        if (!popover) return;
        applyOverlayPageScale(popover);
        // Title suppression is set up once at mount (suppressForPopover) and its
        // MutationObserver re-suppresses any titles added during hydration, so a
        // full popover [title] re-scan on every reposition was redundant — and
        // reposition fires repeatedly per hover (mount + ResizeObserver + rAF),
        // so the repeated querySelectorAll showed up as hover latency.
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
        if (!this.shouldUseFixedModalHeight(popover)) return;
        const fixedHeight = configuredPopoverMaxHeight(this.settings);
        if (fixedHeight) popover.style.height = `${fixedHeight}px`;
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
                // The popover mounts as a loading skeleton and grows as the
                // entry hydrates; keep whichever side the first placement
                // chose so hydration resizes never flip it across the anchor.
                keepPlacementSide: true,
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
        const rect = this.popoverOverlayRect(popover);
        if (!this.activePopoverLockedPosition) this.lockActivePopoverPosition(rect);
        this.placeActivePopoverWithoutMoving(popover, this.activePopoverLockedPosition ?? rect);
        this.syncActivePopoverFixedHeight();
    }

    private popoverOverlayRect(popover: HTMLElement): DOMRect {
        return sourceRectToOverlay(popover.getBoundingClientRect(), popover);
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
        this.activePopoverAnchorRect = popoverAnchorRect(this.activePopoverAnchor, this.activePopoverAnchorRect);
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
            this.latchHoverPopoverPointer(popover);
            this.cancelHoverClose();
        });
        popover.addEventListener('pointerleave', event => {
            this.lastPointerPosition = { x: event.clientX, y: event.clientY };
            // A pointerleave whose relatedTarget is still inside the popover is the
            // panel's own subtree churning under the cursor (a re-render swapping the
            // node the pointer was over), not an exit — the latch must survive it.
            if (this.isInsideActivePopover(event.relatedTarget as Node | null)) return;
            this.hoverPopoverPointerLatched = false;
            if (this.activeHoverWord && this.isInsideNode(event.relatedTarget as Node | null, this.activeHoverWord)) return;
            this.scheduleHoverClose(undefined, { ignoreCssHover: true });
        });
        // <details> collapse/expand fires a non-bubbling `toggle`; a capturing
        // listener on the popover still catches it from the section inside.
        popover.addEventListener('toggle', event => {
            if (this.activePopoverMode !== 'hover') return;
            if (event.target instanceof HTMLDetailsElement) this.markHoverPopoverSelfResize();
        }, true);
    }

    /**
     * The learner's cursor has entered the hover panel. Two things become true and
     * must STAY true until a real exit event says otherwise.
     *
     * 1. The pointer is inside. The hover watchdog re-asks that question every
     *    HOVER_WATCH_PERIOD_MS by hit-testing the last known pointer point,
     *    which is a *sample* of a moving DOM: a re-render between two samples can
     *    put a different element under a parked cursor, and Firefox transiently
     *    clears CSS :hover while a scroll changes the descendant beneath it. Over a
     *    20-second read that is ~220 chances to guess wrong once — which is exactly
     *    the reported "the hover closed while I was scrolling inside it". A latch set
     *    by `pointerenter` and cleared by `pointerleave` uses the browser's own
     *    hit-test at event time instead of re-deriving it from stale geometry.
     * 2. The panel must stop moving. A hover popover placed above the cursor is
     *    bottom-pinned, so every hydration re-render moves its TOP edge by the full
     *    height delta and can slide the frame out from under a stationary cursor.
     *    Locking the position pins the top and lets growth extend downward instead,
     *    capped by popoverMaxHeightAtTop so it cannot run off the viewport.
     *
     * Locking is deliberately deferred to first hover rather than done at mount:
     * before the cursor arrives, following the anchor and flipping sides is the
     * correct behaviour and is what keeps the panel reachable.
     */
    private latchHoverPopoverPointer(popover: HTMLElement): void {
        if (this.activePopoverMode !== 'hover' || this.activePopover !== popover) return;
        this.hoverPopoverPointerLatched = true;
        if (this.activePopoverPositionLocked || popover.classList.contains('jpdb-reader-sheet')) return;
        this.lockActivePopoverPosition(this.popoverOverlayRect(popover));
        this.placeActivePopoverWithoutMoving(popover, this.activePopoverLockedPosition ?? this.popoverOverlayRect(popover));
    }

    private hasLatchedHoverPopoverPointer(): boolean {
        return this.hoverPopoverPointerLatched
            && this.activePopoverMode === 'hover'
            && Boolean(this.activePopover?.isConnected);
    }

    // A pointer event anywhere outside the popover is the browser telling us, from
    // its own live hit-test, that the cursor left without the popover seeing a
    // pointerleave (a re-render can detach the node the pointer was over before the
    // exit event is dispatched). That is an event, not a geometry re-derivation, so
    // it stays trustworthy — and it is what keeps the latch from wedging a hover
    // popover open forever.
    private clearLatchedHoverPopoverPointerForOutsideEvent(target: Node | null): void {
        if (!this.hoverPopoverPointerLatched || this.isInsideActivePopover(target)) return;
        this.hoverPopoverPointerLatched = false;
    }

    private dismiss(options: ActivePopoverDismissOptions = { suppressHoverTarget: true }): void {
        if (!options.forceAll && this.shouldDismissStackedLookupOnly()) {
            this.dismissStackedLookupOverSettings(options);
            return;
        }
        const hadSettingsDialog = Boolean(this.activePopover?.classList.contains('jpdb-reader-settings'));
        this.lookupModal.release(options.preserveLookupModalSession);
        this.prepareActivePopoverDismiss(options);
        if (!options.preserveOcrLookupState) this.releaseOwnedModalOcrPin();
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
        }
        // A rescan deferred by scheduleDictionaryRescan runs now that no popover is
        // anchored to the words it will replace. `preserveNavigation` marks a
        // RE-MOUNT (mountPopover dismisses the previous panel before appending the
        // next one, and nested navigation drills through this path), where the next
        // popover is about to claim an anchor — flushing there would reparse the page
        // out from under it and reintroduce the very bug in a new disguise.
        if (!options.preserveNavigation) this.schedulePendingDictionaryRescan();
    }

    private shouldDismissStackedLookupOnly(): boolean {
        return Boolean(this.stackedSettingsDialog && this.activePopover && this.activePopover !== this.stackedSettingsDialog.form);
    }

    private dismissStackedLookupOverSettings(options: ActivePopoverDismissOptions): void {
        const restoredLookupFocus = this.lookupModal.release(options.preserveLookupModalSession);
        this.prepareActivePopoverDismiss(options);
        if (!options.preserveOcrLookupState) this.releaseOwnedModalOcrPin();
        this.nativeTitleGuard.restore();
        this.activePopover?.remove();
        this.activeBackdrop?.remove();
        this.activePopoverResizeObserver?.disconnect();
        const stack = this.stackedSettingsDialog;
        this.clearActivePopoverState(options);
        if (stack?.form.isConnected) {
            this.activePopover = stack.form;
            this.activeBackdrop = stack.backdrop;
            if (!restoredLookupFocus) stack.form.focus();
        }
        this.stackedSettingsDialog = undefined;
        if (!options.preserveNavigation) {
            this.navigation.clearWord();
            this.navigation.clearKanji();
        }
    }

    private prepareActivePopoverDismiss(options: ActivePopoverDismissOptions): void {
        if (this.activePopover) this.immersionPopover?.abortPendingRequests(this.activePopover);
        // Re-mounts during nested navigation (push-current) dismiss with
        // preserveNavigation:true — keep the video paused across them; only a
        // real close resumes. Without this gate, drilling into a sub-lookup
        // resumed playback mid-read.
        if (!options.preserveNavigation) {
            this.scheduleSubtitleMiningVideoResume(options.deferSubtitleMiningResume ? SUBTITLE_HOVER_MINING_RESUME_GRACE_MS : 0);
        }
        this.clearHoverDismissState(options);
        this.audio.stop();
        this.immersionPopover?.stopAudio();
        this.updateSuppressedHoverTarget(options);
        this.cardRenderRequest++;
    }

    private clearHoverDismissState(options: { preserveHoverGeneration?: boolean }): void {
        window.clearTimeout(this.hoverLookupTimer);
        this.hoverClose.stop();
        if (this.popoverRepositionFrame !== undefined) {
            window.cancelAnimationFrame(this.popoverRepositionFrame);
            this.popoverRepositionFrame = undefined;
        }
        this.hoverLookupTimer = undefined;
        this.clearHoverPopoverResizeSticky();
        this.hoverPopoverPointerLatched = false;
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
        const restoredSettings: Partial<ReaderSettings> = {};
        if (this.settingsPreviewOriginalAccent !== undefined) {
            this.applyAccentColor(this.settingsPreviewOriginalAccent);
            this.applyWordColors();
            restoredSettings.accentColor = this.settingsPreviewOriginalAccent;
        }
        if (this.settingsPreviewOriginalLanguage !== undefined) {
            this.settings.interfaceLanguage = this.settingsPreviewOriginalLanguage;
        }
        if (this.settingsPreviewOriginalTheme !== undefined) {
            this.settings.theme = this.settingsPreviewOriginalTheme;
            restoredSettings.theme = this.settingsPreviewOriginalTheme;
        }
        this.applyTheme();
        if (Object.keys(restoredSettings).length) this.publishSettingsChange(restoredSettings);
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

    private clearActivePopoverState(options: ActivePopoverDismissOptions = {}): void {
        if (!options.preserveOcrLookupState) this.releaseOcrLookupLine();
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

    private retainOcrLookupLineForAnchor(
        anchor: Element | undefined,
        options: { preserveExisting?: boolean } = {},
    ): void {
        const release = this.ocr.retainLineForLookup(anchor ?? null);
        if (!release) {
            if (!options.preserveExisting) this.releaseOcrLookupLine();
            return;
        }
        const releasePrevious = this.releaseActiveOcrLookupLine;
        this.releaseActiveOcrLookupLine = release;
        releasePrevious?.();
    }

    private releaseOcrLookupLine(): void {
        const release = this.releaseActiveOcrLookupLine;
        this.releaseActiveOcrLookupLine = undefined;
        release?.();
    }

    private pinOcrLineForModalLookup(anchor: Element): void {
        const line = anchor.closest<HTMLElement>('.jpdb-ocr-line');
        if (!line) {
            this.releaseOwnedModalOcrPin();
            return;
        }
        if (this.ownedModalOcrPin && this.ownedModalOcrPin !== line) this.releaseOwnedModalOcrPin();
        if (line.dataset.pinned === 'true') return;
        this.ocr.pinLineForElement(anchor);
        if (line.dataset.pinned === 'true') this.ownedModalOcrPin = line;
    }

    private releaseOwnedModalOcrPin(): void {
        const line = this.ownedModalOcrPin;
        this.ownedModalOcrPin = undefined;
        if (line?.dataset.pinned === 'true') this.ocr.unpinLineForElement(line);
    }

    private releaseOrphanedModalOcrPin(): void {
        if (!this.activePopover || this.activePopoverMode !== 'modal') this.releaseOwnedModalOcrPin();
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

function jpdbPageAddonActionButton(event: MouseEvent, root: HTMLElement): HTMLButtonElement | null {
    if (!(event.target instanceof Element)) return null;
    const button = event.target.closest<HTMLButtonElement>('[data-action]');
    return button && root.contains(button) ? button : null;
}

function cardPopoverDeckPickerCommand(button: HTMLButtonElement): boolean {
    return privateCommands.readCardUiCommandCapability(button)?.action === 'deck-picker';
}

function cardPopoverAddCommand(button: HTMLButtonElement): boolean {
    return privateCommands.readCardCommandCapability(button)?.action === 'add';
}

function mainCardCommand(button: HTMLButtonElement, supplied: privateCommands.CardCommandCapability | undefined): privateCommands.CardCommandCapability | undefined {
    return supplied ?? privateCommands.readCardCommandCapability(button);
}
