import { AudioPlayer } from '../audio/player';
import { isYomuHostedAppUrl, isYomuHostedPassivePage } from './pages';
import { AnkiConnectClient, ankiLookupWithUnavailableDetails, captureActiveVideoFrame, untrustedAnkiLookupResult, type AnkiLookupResult } from '../anki/index';
import { renderReviewButtons } from '../anki/render';
import { runLimited } from '../core/async-utils';
import { copyText, isEditableEventContext, normalizePressedKey, pauseActiveVideo, positionPopover } from '../ui/browser';
import { installReaderControlPointerActivation as installControlPointerActivation } from '../ui/pointer-activation';
import { CardActionController } from '../cards/action-controller';
import { CardPopoverRenderer, togglePopoverReviewTargetSelection, updatePopoverReviewTargetSelection } from '../cards/popover-renderer';
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
import { APP_NAME, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, NEW_TAB_PAGE_URL, SETTINGS_CHANGE_EVENT } from './constants';
import { dispatchWindowEvent, createWindowCustomEvent } from '../platform/window-events';
import { DictionarySourceStateController } from '../sources/state';
import { DictionaryStyleController } from '../sources/styles';
import { createFactoryResetCoordinator, type FactoryResetCoordinator } from './factory-reset-coordinator';
import {
    HAS_JAPANESE,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    appendToDocumentHead,
    documentHasJapaneseText,
    escapeHtml,
    getSelectionControlElement,
    getSelectionSentence,
    getSelectionText,
    isPassiveInteractionElement,
    nearestReadableSentenceForElement,
    readerRenderRejectionRescanDelay,
    readerWordAtPointInScope,
    readerWordSurfaceText,
    removeNonDestructiveScanMirrors,
    setInnerHtml,
    unwrapReaderWords,
} from '../dom/index';
import {
    kanjiFactProviderTitle,
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
import { JitenPublicVocabularyClient } from '../dictionaries/jiten-public-vocabulary';
import type { UchisenData } from '../dictionaries/uchisen';
import { jitenKanjiOriginFactLabels, renderJitenKanjiInfo, renderJitenKanjiKeywordLine } from '../jiten/jiten-kanji-info-render';
import { filterJitenKanjiWords as filterSharedJitenKanjiWords, loadMoreJitenKanjiWords as loadMoreSharedJitenKanjiWords, type JitenKanjiWordsActionContext } from '../jiten/jiten-kanji-words-actions';
import { JpdbClient } from '../jpdb/jpdb';
import { yomuKanjiStudyCompanion } from '../companions/registry';
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
    currentPageKanji,
    currentPageLocalDictionaryTargets,
    currentPageTermTarget,
    isCurrentKanjiSurface,
    isJitenHost,
    isPageEnhancementHost,
    isPageEnhancementReady,
} from './page-enhancement-targets';
import { JpdbVocabularyClient, type JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { KanjiSourceInfo } from '../kanji/origin';
import { updateKanjiMiningControlsMount } from '../kanji/mining-controls';
import type { KanjiVGInfo } from '../kanji/vg';
import {
    canExpandLocalPointerRange,
    isLookupableJapaneseText,
    isProseDominantSelection,
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
import { publishCardStateSignal, subscribeToCardStateSignals } from './card-state-signal';
import { configureLogger, Logger } from './logger';
import {
    cardMatchesRenderedLookupValue,
    jitenWordCardForMassReview,
    publicJpdbRenderedWordLookup,
    kanaRunRenderedWordsForSurface,
    visibleJitenReviewableWords,
    renderedKanaFragmentExpansionLookup,
    renderedWordCardForLookup,
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
    DEFERRED_PUBLIC_PITCH_ENRICHMENT_CHUNK_SIZE,
    DEFERRED_PUBLIC_PITCH_HOVER_PAUSE_MS,
    DEFERRED_PUBLIC_PITCH_ENRICHMENT_IDLE_TIMEOUT_MS,
    DEFERRED_PUBLIC_PITCH_PER_URL_CAP,
    LOCAL_PITCH_ENRICHMENT_CONCURRENCY,
    FALLBACK_LOOKUP_INITIAL_WAIT_MS,
    FIVE_BUTTON_REVIEW_SHORTCUTS,
    HOVER_ANKI_HYDRATION_DELAY_MS,
    HOVER_POINTER_TEXT_LOOKUP_OPTIONS,
    KANA_ONLY_LOOKUP_RUN_RE,
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
    PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT,
    RENDERED_KANA_EXPANSION_EXACT_MATCH_WAIT_MS,
    RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT,
    SUBTITLE_SURFACE_SELECTOR,
    TERM_AUDIO_PRELOAD_LIMIT,
    TWO_BUTTON_REVIEW_SHORTCUTS,
    UNRESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT,
    allowsFrequentVisibleAutoScan,
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
    visibleAutoScanInitialDelay,
    visibleAutoScanMutationDelay,
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
import { isBookWalkerStorefrontPage } from './site-parsers';
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
import { AUTO_SCAN_OBSERVER_OPTIONS, mutationInsideReaderRoot, mutationMayAffectJpdbPageEnhancements, mutationMayContainJapaneseText, mutationTouchesAsbPlayer } from './mutation-scan';
import { NativeTitleGuard } from './native-title-guard';
import { isNativePageLookupBlocked, nativeClickableAncestor, shouldIgnoreDocumentClickTarget } from './native-page-lookup-targets';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsParseAlreadyRendered, nestedSettingsTextParsePlan, nestedTextParsePlan, type NestedParsePlan } from '../lookup/nested-text-parse';
import { parsedSettingsTargetsForCurrentPlan, supplementSettingsFallbackTokens } from '../lookup/settings-fallback-tokens';
import { addSettingsRubyFromRenderedReadings, settingsForSettingsFormParse } from '../lookup/settings-parse-render';
import { resolveUiLanguage, uiText, type UiCopyKey } from './i18n';
import { OnboardingController } from './onboarding';

import { applyPreferredJapaneseSiteLanguage as applyJapaneseSiteLanguagePreference } from './preferred-site-language';
import { localPitchPatternFromMeta } from '../lookup/pitch-meta';
import { contextPitchPattern } from '../lookup/pitch-accent';
import { cardPronunciationReading, isKanjiCharacter, uniqueKanji } from '../popup/pitch';
import type { ImageOcrController } from '../ocr/controller';
import { applyOcrInteractionMode, nextOcrInteractionMode, ocrInteractionModeFromSettings, type OcrInteractionMode } from '../ocr/mode';
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
import { createReaderBackdrop, createReaderPopover, forceReaderPopoverSurface, installMiningDrawerHandle, installSheetCloseButton, installSheetHandle, MINING_DRAWER_HANDLE_SELECTOR, MINING_DRAWER_POINTER_TARGET_SELECTOR, refreshForcedReaderPopoverSurface, shouldUseSheet } from '../popup/shell';
import { PopupNavigationController, renderModalNavigation, type CardNavigationMode, type PopupNavigationEntry } from '../popup/navigation';
import type { RtkInfo } from '../kanji/rtk';
import { ReaderAudioActions } from '../audio/actions';
import { canAttemptReaderAutoAudio } from '../audio/activation';
import { registerReaderMenuCommands } from './menu-commands';
import { bindReaderRuntimeEvents } from './runtime-events';
import { detectReaderStartupJapaneseText, installReaderStartupBridge, loadReaderStartupSettings, shouldShowReaderOnboarding, type ReaderAppInitOptions } from './startup';
import { scheduleReaderAnkiStatusRefresh, scheduleReaderAnkiStatusWarmup } from './status-warmup';
import { refreshReaderWordContrast } from '../dom/word-contrast';
import { applyAnkiLookupToRenderedWord, applyPublicVocabularyFurigana, canClickLookupPassiveReaderWordElement, canHoverLookupReaderWordElement, canLookupReaderWordElement, currentLookupNavigationWord, isOcrLineFrameWord, ocrLineWordAtPoint, singleKanjiOcrLookupCharacter, updateRenderedPitch, wait } from './dom-helpers';
import { ReaderParser, fallbackDictionaryLookupTermsForText, fallbackLookupRangeAtOffset, fallbackLookupTermAtOffset, fallbackLookupTermsForCard, jpdbFirstParseOptions, type ReaderParserParseOptions } from '../lookup/parser';
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
    subscribeToSettingsStorageChanges,
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
import { BunproClient } from '../bunpro/bunpro';
import { createBunproSrsAdapter } from '../srs';
import { applyReaderAccentColor, applyReaderTheme, applyReaderWordColors } from '../theme/reader-theme';
import { applyHostTheme, detectHostTheme, isHostThemeAuthoritative, isThemeSyncHost, jitenThemeCookieMatches, observeHostTheme, type HostTheme } from '../theme/host-theme';
import { showReaderToast } from '../ui/toast';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    KANJI_UCHISEN_SOURCE_ID,
    definitionSourceLabel,
    kanjiSourceLabel,
} from '../sources/sections';
import { parseContentCacheKey } from '../lookup/parse-content-cache-key';
import { renderKanjiImmersionKitMount, renderKanjiSourceMounts as renderRuntimeKanjiSourceMounts } from '../runtime/kanji-source-mounts';
import { initialReaderCss, loadReaderCssFallback, READER_CSS, readerCssNeedsFallback } from '../styles/index';
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
// Gesture events a host viewer (e.g. BookWalker/NFBR) uses to turn the page; Yomu
// swallows them when they land on its own overlay/popover so a text tap looks up
// the word instead of flipping the page.
const READER_ROOT_GESTURE_EVENTS = ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'] as const;
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';

function eventTargetsReaderRoot(event: Event): boolean {
    return Boolean((event.target as Element | null)?.closest?.(READER_ROOT_SELECTOR));
}

// True when the gesture's POINT is over Yomu's overlay/popover. On touch, WebKit
// can target the underlying viewer canvas even when the OCR text is painted on top,
// so we resolve the element actually at the coordinates (elementFromPoint skips
// pointer-events:none layers and finds the OCR line/word).
function pointOverReaderRoot(event: Event): boolean {
    const touch = (event as TouchEvent).changedTouches?.[0] ?? (event as TouchEvent).touches?.[0];
    const x = touch ? touch.clientX : (event as MouseEvent).clientX;
    const y = touch ? touch.clientY : (event as MouseEvent).clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    return Boolean(document.elementFromPoint(x, y)?.closest?.(READER_ROOT_SELECTOR));
}

// A gesture should be kept from the host viewer's page-turn handler ONLY when it is
// "leaking" — its point is over Yomu's overlay but it targets the canvas/page (the
// touch-targets-canvas case). When the event already targets the overlay, Yomu's
// own line/word handlers process it (and stopPropagation themselves), so swallowing
// it here would wrongly cancel the lookup (it would also break the OCR-line click
// handler that stops the event reaching underlying host links).
function readerRootGestureLeaks(event: Event): boolean {
    return !eventTargetsReaderRoot(event) && pointOverReaderRoot(event);
}

// Scroll-lock hosts (BookWalker/NFBR and other fullscreen readers) register a
// non-passive touch/wheel listener that preventDefault()s every scroll so the page
// can't move under their viewer. That also kills scrolling INSIDE a Yomu overlay
// (settings dialog, popover, onboarding) that opens on top — on mobile the panel
// can't scroll at all. Trying to out-race the host (stop its listener before it runs)
// is fragile: a lock on window-CAPTURE registered before us, or on `touchstart`, or
// living in the page realm while we run in an isolated content world, all defeat a
// capture-phase stopPropagation. So instead of fighting the host's preventDefault we
// IGNORE it and drive the scroll ourselves: a document-level touch-drag / wheel
// handler sets the overlay body's scrollTop directly. Setting scrollTop is not a
// cancellable "default action", so it works even while the host preventDefaults native
// scrolling — independent of listener phase, registration order, and realm (document
// listeners demonstrably fire on these hosts; the OCR tap-swallow relies on the same).
// Scoped by event TARGET to scroll BODIES (a touch's target is fixed at touchstart, so
// a sheet-drag that began on the handle is never matched — the popover sheet-drag,
// the popover-body stabilizer, the newtab swipe and the OCR overlay are all untouched).
// Trade-off: these utility panels lose native fling momentum (1:1 drag), which is fine.
const READER_ROOT_SCROLL_BODY_SELECTOR = '.jpdb-reader-settings-scroll, .jpdb-reader-popover-body, .jpdb-reader-onboarding';

function readerScrollBodyForEvent(event: Event): HTMLElement | null {
    return (event.target as Element | null)?.closest?.<HTMLElement>(READER_ROOT_SCROLL_BODY_SELECTOR) ?? null;
}

// A gesture on an editable / form control inside an overlay body must keep its native
// behaviour (text caret + selection, a textarea's own scroll, native option lists) —
// the uchisen image-generation panel renders multi-line <textarea>s into the popover
// body — so the manual scroll driver leaves those alone.
const READER_INTERACTIVE_CONTROL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

function eventTargetsInteractiveControl(event: Event): boolean {
    return Boolean((event.target as Element | null)?.closest?.(READER_INTERACTIVE_CONTROL_SELECTOR));
}

// Move `body` by `deltaY` if it can scroll that way; returns true when it consumed the
// gesture (so the caller claims it and the host/page never act on the leftover).
function manualScrollReaderBody(body: HTMLElement, deltaY: number): boolean {
    const maxTop = body.scrollHeight - body.clientHeight;
    if (maxTop <= 0 || !deltaY) return false;
    body.scrollTop = Math.max(0, Math.min(maxTop, body.scrollTop + deltaY));
    return true;
}
const HOST_THEME_ENFORCE_STEPS = 12;
const HOST_THEME_ENFORCE_STEP_MS = 200;
// How long after a subtitle-mining pause we keep re-asserting it. A competing
// re-play (YouTube player, another extension) lands within a few hundred ms; a
// deliberate user resume seconds later is left alone.
const MINING_PAUSE_REASSERT_WINDOW_MS = 2500;
const SUBTITLE_HOVER_MINING_RESUME_GRACE_MS = 520;
const HOVER_READER_WORD_GEOMETRY_SCOPE_SELECTOR = [
    '.textBox',
    '.ocr-line',
    '.markdown',
    '.markdown-body',
    '.markdown-content',
    '.message',
    '.message-body',
    '.message-content',
    '.messageContent',
    '.chat-message',
    '.conversation-turn',
    '.model-response',
    '.model-response-text',
    '.response-content',
    '.lesson-canvas-clipper',
    'p',
    'li',
    'blockquote',
    'td',
    'th',
    'article',
    'main',
    '[data-jpdb-reader-root]',
    '[role="article"]',
    '[data-message-author-role]',
    '[data-message-id]',
    '[data-testid*="conversation-turn" i]',
    '[data-testid*="chat-message" i]',
    '[data-testid*="message-content" i]',
    '[data-testid*="message-bubble" i]',
    '[data-test-id*="chat-message" i]',
    '[data-test-id*="message-content" i]',
    'a[href]',
    'button',
    'summary',
    '[role="link"]',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
].join(',');
const JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY = 'yomu:jpdb-review-examples-visible:v1';
const READER_POINTER_SURFACE_SELECTOR = [
    '.jpdb-reader-popover',
    '.jpdb-reader-settings',
    '.jpdb-subtitle-player',
    '.jpdb-subtitle-list',
    '.jpdb-ocr-layer',
    '[data-jpdb-reader-root]',
].join(',');

// Interactive controls the selection/token-list popover handles itself. A click
// on any of these must not be re-resolved to a page word by point geometry.
const TOKEN_LIST_POPOVER_CONTROL_SELECTOR = [
    '.jpdb-reader-popover button[data-token-choice]',
    '.jpdb-reader-popover [data-action]',
    '.jpdb-reader-popover a.jpdb-reader-pill',
    '.jpdb-reader-popover .jpdb-reader-action-pill',
].join(',');
const NATIVE_CAPTION_SELECTION_SURFACE_SELECTOR = [
    '.ytp-caption-segment',
    '.caption-window',
    '.caption-visual-line',
    '.captions-text',
    '[data-purpose="captions-text"]',
].join(', ');
const VIDEO_LOOKUP_ANCHOR_SELECTOR = [
    SUBTITLE_SURFACE_SELECTOR,
    NATIVE_CAPTION_SELECTION_SURFACE_SELECTOR,
].join(', ');
const SELECTION_LOOKUP_ANCHOR_SELECTOR = [
    '.jpdb-reader-word',
    VIDEO_LOOKUP_ANCHOR_SELECTOR,
].join(', ');

function createNoopImageOcrController(): ImageOcrController {
    const noop = (): void => undefined;
    return {
        init: noop,
        refresh: noop,
        destroy: noop,
        scanVisible: noop,
        refreshForModeChange: noop,
        pinLineForElement: noop,
        clearActiveLines: noop,
        captureSourceImageForElement: () => undefined,
    } as unknown as ImageOcrController;
}

function ocrModeToastKey(mode: OcrInteractionMode): UiCopyKey {
    if (mode === 'auto') return 'ocrModeAutoToast';
    if (mode === 'manual') return 'ocrModeManualToast';
    return 'ocrModeOffToast';
}

function noopKanjiPracticeDoodle(): { reassess: () => void; clear: () => void } {
    const noop = (): void => undefined;
    return { reassess: noop, clear: noop };
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

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
};

function currentFullscreenElement(): Element | null {
    const fullscreenDocument = document as FullscreenDocument;
    return document.fullscreenElement
        ?? fullscreenDocument.webkitFullscreenElement
        ?? fullscreenDocument.mozFullScreenElement
        ?? fullscreenDocument.msFullscreenElement
        ?? null;
}

function fullscreenPopoverMountParent(anchor?: HTMLElement): HTMLElement | undefined {
    const fullscreenElement = currentFullscreenElement();
    if (!(fullscreenElement instanceof HTMLElement) || fullscreenElement instanceof HTMLVideoElement) return undefined;
    if (anchor && fullscreenElement.contains(anchor)) return fullscreenElement;
    return undefined;
}

function isJsdomRuntime(): boolean {
    return navigator.userAgent.includes('jsdom');
}

export class ReaderApp {
    private abortController = new AbortController();
    private isDestroyed = false;
    private settings: ReaderSettings = DEFAULT_SETTINGS;
    private disposeHostThemeObserver?: () => void;
    private hostThemeEnforceTimer?: number;
    private themeContrastRefreshFrame?: number;
    private themeContrastRefreshTimer?: number;
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
    private kanjiCompanion = yomuKanjiStudyCompanion();
    private jpdbKanji = this.kanjiCompanion ? new this.kanjiCompanion.JpdbKanjiClient(() => this.settings.corsProxyUrl) : null;
    private jpdbPublicPitch = new JpdbPublicPitchClient(() => this.settings.corsProxyUrl);
    private jpdbVocabulary = new JpdbVocabularyClient(() => this.settings.corsProxyUrl);
    private jitenPublicVocabulary = new JitenPublicVocabularyClient({ proxyUrl: () => this.settings.corsProxyUrl });
    private kanjiVG = this.kanjiCompanion ? new this.kanjiCompanion.KanjiVGClient() : null;
    private kanjiOrigin = this.kanjiCompanion ? new this.kanjiCompanion.KanjiOriginClient() : null;
    private immersionKit = new ImmersionKitClient();
    private audio = new AudioPlayer(() => this.settings);
    private anki = new AnkiConnectClient(() => this.settings);
    private bunpro = new BunproClient({
        getFrontendToken: () => this.activeBunproFrontendApiToken(),
        getLegacyApiKey: () => effectiveBunproLegacyApiKey(this.settings),
    });
    private bunproSrs = createBunproSrsAdapter(this.bunpro);
    private rtk = this.kanjiCompanion ? new this.kanjiCompanion.RtkClient() : null;
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
        renderWordPills: (card, jpdbUrl, metaEntries, overrideQuery, _trigger, ankiLookup, jitenVocabularyInfo) => renderWordPills({
            card,
            jpdbUrl,
            settings: this.settings,
            metaEntries,
            overrideQuery,
            ankiLookup,
            jitenVocabularyInfo,
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
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions()),
        enrichAnkiWords: (tokens, roots) => this.enrichAnkiWords(tokens, roots),
        isCurrentPopoverRoot: root => this.isCurrentPopoverRoot(root),
    });
    private cardActions = new CardActionController({
        getSettings: () => this.settings,
        jpdb: this.jpdb,
        jiten: this.jiten,
        srsAdapters: {
            bunpro: this.bunproSrs,
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
            void saveSettings(this.settings);
        },
        onAnkiStatusChanged: card => this.handleAnkiStatusChanged(card),
        onApiCardStateChanged: card => this.applyPublicVocabularyToRenderedWords(card, card),
    });
    private immersionPopover = new ImmersionPopoverController({
        getSettings: () => this.settings,
        client: this.immersionKit,
        audio: this.audio,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        canParseJapanese: () => this.canParseJapanese(),
        parsePopoverJapanese: popover => this.parsePopoverJapanese(popover),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions()),
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
        jitenPublicVocabulary: this.jitenPublicVocabulary,
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
        parseJapanese: panel => void this.parseOnboardingJapanese(panel),
        lookupText: (text, sentence, anchor) => this.lookupText(text, sentence || text, { anchor, stackOverSettings: true }),
    });
    private subtitles = this.createSubtitlePlayer();
    private ocr: ImageOcrController = this.createImageOcrController();
    private youtube = this.createYoutubeFilter();
    private pageScanner = new VisiblePageScanner({
        getSettings: () => this.settings,
        parseJapanese: (paragraphs, options) => this.parseJapanese(paragraphs, options),
        pauseMutationObserver: callback => this.pauseAutoScanObserver(callback),
        preloadParsedTokens: tokens => this.preloadParsedTokens(tokens),
        enrichPitchWords: tokens => this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions()),
        enrichAnkiWords: (tokens, roots) => this.enrichAnkiWords(tokens, roots),
        beginAnkiWordEnrichment: tokens => this.beginAnkiWordEnrichment(tokens),
        prepareAnkiWordEnrichmentBeforeRender: tokens => this.prepareAnkiWordEnrichmentBeforeRender(tokens),
        prepareSubtitleTokensBeforeRender: tokens => this.enrichSubtitleTokensBeforeRender(tokens),
        refreshWordContrast: root => refreshReaderWordContrast(root),
        toast: message => this.toast(message),
    });
    private unsubscribeCardStateSignals?: () => void;
    private unsubscribeSettingsStorageChanges?: () => void;
    private disposeMokuroOcrToggleWatch?: () => void;
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
    private lastCard?: JPDBCard;
    private lastCardSentence?: string;
    private lastAnkiLookup?: AnkiLookupResult;
    private selectionTimer?: number;
    private autoScanTimer?: number;
    private autoScanDeadline = 0;
    private autoScanForced = false;
    private autoScanObserver?: MutationObserver;
    private readonly handleNonDestructiveMirrorStale = () => {
        if (this.canParseJapanese()) this.scheduleAutoScan(visibleAutoScanMutationDelay(), { force: true, debounce: true });
    };
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
    // The video we paused when a subtitle word was clicked, so closing the
    // lookup popover resumes exactly that video (and only if it is still paused).
    private subtitleMiningPausedVideo?: HTMLVideoElement;
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
    private hoverPopoverPointerPosition?: { x: number; y: number };
    private hoverPointerMoveFrame?: number;
    private pendingHoverPointerMove?: PointerEvent;
    private popoverRepositionFrame?: number;
    private settingsPreviewOriginalAccent?: string;
    private settingsPreviewOriginalLanguage?: InterfaceLanguage;
    private settingsPreviewOriginalTheme?: ReaderSettings['theme'];
    private lastAutoAudioKey = '';
    private lastAutoAudioAt = 0;
    private lastAutoAudioHoverGeneration?: number;
    private cardRenderRequest = 0;
    private dictionaryRescanPending = false;
    private visiblePageReparseTimer?: number;
    private jpdbPageEnhanceTimer?: number;
    private jpdbPageEnhancementGeneration = 0;
    private lastEnhancedHref = '';
    private nearbyReaderAudioPreloadTimer?: number;
    private preloadedTermAudioKeys = new Set<string>();
    private preloadedPreparedTermAudioKeys = new Set<string>();
    private nestedParseContentCache = new Map<string, NestedParseContentCacheEntry>();
    private pitchEnrichmentLocalCache = new Map<string, Promise<string>>();
    private resolvedFallbackVocabularyCache = new Map<string, JPDBCard>();
    private unresolvedFallbackVocabularyCache = new Set<string>();
    private fallbackVocabularyResolutionCache = new Map<string, Promise<JPDBCard>>();
    private uchisenDataCache = new Map<string, Promise<UchisenData | null>>();
    private renderedWordIndex = new Map<string, Set<HTMLElement>>();
    private renderedWordIndexFullyScanned = false;
    private pitchEnrichmentQueue: JPDBToken[] = [];
    private pitchEnrichmentQueuedKeys = new Set<string>();
    private pitchEnrichmentUrgentKeys = new Set<string>();
    private pitchEnrichmentQueuedOptions = new Map<string, Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>>();
    private pitchEnrichmentDrain?: Promise<void>;
    private deferredPublicPitchQueue: JPDBToken[] = [];
    private deferredPublicPitchQueuedKeys = new Set<string>();
    private deferredPublicPitchEnqueuedForUrl = 0;
    private deferredPublicPitchDrain?: Promise<void>;
    private backgroundPublicPitchLookupBudgetHref = location.href;
    private backgroundPublicPitchLookupBudgetUsed = 0;
    private pendingSubtitleRebakeTexts = new Set<string>();
    private subtitleRebakeTimer?: number;
    private cachedPublicVocabularyHydrationTimer?: number;
    private pressedKeys = new Set<string>();
    private hoverAnchorIds = new WeakMap<HTMLElement, number>();
    private nextHoverAnchorId = 1;
    private suppressSelectionLookupUntil = 0;
    private dismissedSelectionText = '';
    private suppressWordClickUntil = 0;
    private suppressPenHoverUntil = 0;
    private pageHasJapaneseText = false;
    private embeddedFrame = false;
    private pressLookup?: PressLookupState;
    private tapLookup?: { id: number; x: number; y: number; word?: HTMLElement };
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
            beforeRenderTokens: tokens => this.enrichSubtitleTokensBeforeRender(tokens),
            afterParseTokens: (tokens, roots) => this.afterSubtitleJapaneseParsed(tokens, roots),
            showBatchMiningCard: candidate => this.showCard(candidate.card, candidate.sentence, undefined, {
                autoPlay: false,
                trigger: 'modal',
                navigation: 'push-current',
            }),
            mineBatchMiningCandidates: candidates => this.cardActions.addBatchMiningCards(candidates),
            toast: message => this.toast(message),
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
            parseShelfJapanese: root => void this.parseYoutubeShelfJapanese(root),
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
            parseJapanese: async (text, options) => (await this.parseJapanese([text], options))[0] ?? [],
            parseJapaneseBatch: (texts, options) => this.parseJapanese(texts, options),
            onToast: message => this.toast(message),
            shouldAutoScan: () => shouldAutoScanImageOcr(this.pageHasJapaneseText),
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
        dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { settings: this.settings }));
        done();
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
        this.installSettingsStorageSubscription();
        if (this.embeddedFrame) return;
        this.registerMenuCommands();
        this.bindEvents();
        installReaderStartupBridge();
    }

    private async initReaderPage(shouldShowWelcome: boolean): Promise<void> {
        await this.waitForDocumentBody();
        if (this.isDestroyed || !document.body) return;
        if (this.embeddedFrame) {
            this.subtitles.init();
            if (this.shouldScanEmbeddedFrame()) {
                this.setupAutoScan();
                this.scheduleAutoScan(0, { force: true });
            }
            return;
        }
        this.installFab();
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
        this.resumePendingCloudSettingsSync();
        if (shouldShowReaderOnboarding(shouldShowWelcome)) await this.onboarding.showIfNeeded();
        if (this.shouldScanInitialPage()) {
            void this.pageScanner.scanVisiblePage({ silent: true })
                .finally(() => this.scheduleAnkiStatusWarmup());
        } else {
            this.scheduleAnkiStatusWarmup();
        }
    }

    // Cross-tab card-state mutation bus: grading or mining a card in another
    // tab (e.g. the new tab) recolors this page's rendered occurrences of the
    // same card immediately, without a rescan.
    private installCardStateSignalSubscription(): void {
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = subscribeToCardStateSignals(card => {
            if (this.isDestroyed) return;
            this.applyPublicVocabularyToRenderedWords(card, card);
        });
    }

    private installSettingsStorageSubscription(): void {
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = subscribeToSettingsStorageChanges(settings => {
            if (this.isDestroyed) return;
            void this.applyRemoteSettings(settings);
        });
    }

    private async applyRemoteSettings(settings: ReaderSettings): Promise<void> {
        const pauseChanged = settings.annotationsPaused !== this.settings.annotationsPaused;
        this.settings = settings;
        configureLogger({ forceEnabled: settings.enableLogging });
        this.applyPreferredJapaneseSiteLanguage(settings);
        this.applyTheme(settings);
        this.applyWordColors(settings);
        if (!this.embeddedFrame) this.installFab();
        if (pauseChanged) this.applyAnnotationsPausedState();
        this.subtitles.refresh();
        this.ocr.refresh();
        this.youtube.refresh();
        this.clearBridgeBackedCaches();
        this.scheduleDictionaryRescan();
        await this.refreshDictionaryStyles();
        dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { settings, remote: true }));
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
        if (this.settings.annotationsPaused || this.settings.manualScanEnabled) return false;
        return this.canParseJapanese()
            && (this.pageHasJapaneseText || hasVisibleSiteScanTargets());
    }

    private registerMenuCommands(): void {
        registerReaderMenuCommands({
            cycleOcr: () => this.cycleOcrMode(),
            getSettings: () => this.settings,
            saveSettings: settings => saveSettings(settings),
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

    private async togglePreferredJapaneseSiteLanguage(): Promise<void> {
        await this.setPreferredJapaneseSiteLanguage(!this.settings.preferJapaneseSiteLanguage);
    }

    private async setPreferredJapaneseSiteLanguage(enabled: boolean): Promise<void> {
        this.settings.preferJapaneseSiteLanguage = enabled;
        await saveSettings(this.settings);
        this.applyPreferredJapaneseSiteLanguage(this.settings, true);
        log.info('Preferred Japanese site language toggled', { enabled });
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
        this.jitenPublicVocabulary.clear();
        this.parser.clearLocalCache();
        this.dictionarySourceState.clear();
        this.cardRenderData.clear();
        this.preloadedTermAudioKeys.clear();
        this.preloadedPreparedTermAudioKeys.clear();
        this.nestedParseContentCache.clear();
        this.pitchEnrichmentLocalCache.clear();
        this.jitenPublicVocabulary.clear();
        this.resolvedFallbackVocabularyCache.clear();
        this.unresolvedFallbackVocabularyCache.clear();
        this.fallbackVocabularyResolutionCache.clear();
        this.clearPitchEnrichmentQueue();
        this.pitchEnrichmentUrgentKeys.clear();
        window.clearTimeout(this.cachedPublicVocabularyHydrationTimer);
        this.cachedPublicVocabularyHydrationTimer = undefined;
        this.pressedKeys.clear();
        window.clearTimeout(this.nearbyReaderAudioPreloadTimer);
        this.nearbyReaderAudioPreloadTimer = undefined;
        this.cardRenderRequest++;
        await this.dictionaries.invalidateForFactoryReset();
    }

    private installStyles(): void {
        const hasLinkedReaderCss = Boolean(document.querySelector('link[href$="/yomu.css"], link[href*="/yomu.css?"]'));
        const style = document.createElement('style');
        style.textContent = hasLinkedReaderCss ? '' : initialReaderCss(READER_CSS);
        appendToDocumentHead(style);
        if (!readerCssNeedsFallback(READER_CSS) || isJsdomRuntime()) return;
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
        this.scheduleDeferredThemeContrastRefresh();
    }

    private scheduleDeferredThemeContrastRefresh(): void {
        window.cancelAnimationFrame(this.themeContrastRefreshFrame ?? 0);
        window.clearTimeout(this.themeContrastRefreshTimer);
        this.themeContrastRefreshFrame = window.requestAnimationFrame(() => {
            this.themeContrastRefreshFrame = undefined;
            if (this.isDestroyed) return;
            refreshReaderWordContrast(document);
            this.themeContrastRefreshTimer = window.setTimeout(() => {
                this.themeContrastRefreshTimer = undefined;
                if (!this.isDestroyed) refreshReaderWordContrast(document);
            }, 80);
        });
    }

    private initHostThemeSync(): void {
        if (this.disposeHostThemeObserver || !isThemeSyncHost()) return;
        this.disposeHostThemeObserver = observeHostTheme(theme => this.handleHostThemeChange(theme));
    }

    private syncHostTheme(settings = this.settings): void {
        if (!isThemeSyncHost()) return;
        this.initHostThemeSync();
        window.clearTimeout(this.hostThemeEnforceTimer);
        if (isYomuHostedPassivePage(location.href)) {
            const theme = settings.theme === 'auto' ? detectHostTheme() : settings.theme;
            applyHostTheme(theme);
            this.applyReaderThemeClasses(theme);
            return;
        }
        if (isHostThemeAuthoritative()) {
            const hostTheme = detectHostTheme();
            this.applyReaderThemeClasses(hostTheme);
            if (settings !== this.settings || this.settings.theme === 'auto' || this.settings.theme === hostTheme) return;
            this.settings = { ...this.settings, theme: hostTheme };
            void saveSettings(this.settings);
            this.publishThemeSettingsChange();
            return;
        }
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
        if (isYomuHostedPassivePage(location.href)) {
            const theme = setting === 'auto' ? hostTheme : setting;
            applyHostTheme(theme);
            this.applyReaderThemeClasses(theme);
            refreshReaderWordContrast(document);
            return;
        }
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

    private applyPreferredJapaneseSiteLanguage(
        settings = this.settings,
        options?: Parameters<typeof applyJapaneseSiteLanguagePreference>[1],
    ): void {
        applyJapaneseSiteLanguagePreference(settings.preferJapaneseSiteLanguage, options);
    }

    private publishThemeSettingsChange(): void {
        this.publishSettingsChange({ theme: this.settings.theme });
    }

    private publishSettingsChange(settings: Partial<ReaderSettings>): void {
        dispatchWindowEvent(createWindowCustomEvent(SETTINGS_CHANGE_EVENT, { settings }));
    }

    private async refreshDictionaryStyles(): Promise<void> {
        await this.dictionaryStyles.refresh();
    }

    private clearBridgeBackedCaches(): void {
        this.audio.clearCaches();
        this.jpdbVocabulary.clear();
        this.jitenPublicVocabulary.clear();
        this.cardRenderData.clear();
    }

    private scheduleDictionaryRescan(): void {
        if (this.activePopover?.classList.contains('jpdb-reader-settings')) {
            this.dictionaryRescanPending = true;
            return;
        }
        this.pitchEnrichmentLocalCache.clear();
        this.jitenPublicVocabulary.clear();
        this.nestedParseContentCache.clear();
        this.resolvedFallbackVocabularyCache.clear();
        this.unresolvedFallbackVocabularyCache.clear();
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
        this.scheduleJpdbPageEnhancements(0);
        this.installJpdbReviewExamplesToggleMemory();
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
        if (this.settings.jpdbPageWordEnhancementsEnabled) await this.installJpdbWordPageEnhancements(generation);
        this.removeStaleJpdbPageEnhancements(generation);
    }

    private removeJpdbPageEnhancements(): void {
        document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]').forEach(element => element.remove());
    }

    private removeStaleJpdbPageEnhancements(generation: number): void {
        const generationKey = String(generation);
        this.pauseAutoScanObserver(() => {
            document.querySelectorAll<HTMLElement>('[data-yomu-jpdb-addon]').forEach(element => {
                if (element.dataset.yomuGeneration !== generationKey) element.remove();
            });
        });
    }

    private jitenEnhancementsNeedRefresh(): boolean {
        if (location.href !== this.lastEnhancedHref) return true;
        if (!isPageEnhancementReady() || !this.settings.jpdbPageEnhancementsEnabled) return false;
        if (!document.querySelector('[data-yomu-jpdb-addon]')) return true;
        return this.jitenAddonStrandedOnFallbackAnchor();
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

        const storedVisible = this.storedJpdbReviewExamplesVisible();
        if (storedVisible !== null && checkbox.checked !== storedVisible) {
            checkbox.checked = storedVisible;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        checkbox.addEventListener('change', () => {
            this.storeJpdbReviewExamplesVisible(checkbox.checked);
        }, { signal: this.abortController.signal });
    }

    private isJpdbReviewPage(): boolean {
        return location.hostname === 'jpdb.io' && location.pathname.startsWith('/review');
    }

    private storedJpdbReviewExamplesVisible(): boolean | null {
        try {
            const value = localStorage.getItem(JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY);
            return value === 'true' ? true : value === 'false' ? false : null;
        } catch {
            return null;
        }
    }

    private storeJpdbReviewExamplesVisible(visible: boolean): void {
        try {
            localStorage.setItem(JPDB_REVIEW_EXAMPLES_VISIBLE_STORAGE_KEY, String(visible));
        } catch {
            // Ignore storage failures; the native checkbox should still work.
        }
    }

    private async installJpdbWordPageEnhancements(generation: number): Promise<void> {
        const targets = currentPageLocalDictionaryTargets();
        await Promise.all(targets.map(target => this.installJpdbWordPageEnhancement(target, generation)));
    }

    private async installJpdbWordPageEnhancement(target: LocalDictionaryTarget, generation: number): Promise<void> {
        const card = this.jpdbPageWordCard(target);
        const renderData = this.cardRenderData.load(card);
        const [data, variantEntries] = await Promise.all([
            renderData.all.catch(() => null),
            this.lookupJpdbPageLocalEntries(target),
        ]);
        const entries = uniqueLocalDictionaryEntries([
            ...(data?.localEntries ?? []),
            ...variantEntries,
        ])
            .sort((first, second) =>
                jpdbPageDictionaryPreferencePriority(first.dictionary, this.settings)
                    - jpdbPageDictionaryPreferencePriority(second.dictionary, this.settings),
            )
            .slice(0, this.settings.localDictionaryMaxResults);
        if (!this.isCurrentJpdbPageEnhancement(generation)) return;
        if (!this.hasJpdbPageWordContent(entries, data)) return;

        const root = this.createJpdbPageAddonRoot('word', this.jpdbPageWordAddonKey(target), target.anchor, generation);
        if (!root) return;
        const html = this.renderDefinitionSources(
            card,
            entries,
            target.examples[0]?.sentence,
            data?.jpdbVocabularyInfo ?? null,
            data?.jitenVocabularyInfo ?? null,
        );
        if (!this.updateJpdbPageAddonHtml(root, html)) return;
        this.installJpdbPageAddonHandlers(root, card);
        this.dictionarySourceState.installTracking(root);
        this.installJpdbPageImmersionExamples(root, card, [
            ...target.alternates,
            ...target.compounds.flatMap(compound => [compound.term, compound.reading]),
            ...target.examples.map(example => example.sentence),
        ]);
        void this.parseJpdbPageAddonJapanese(root);
    }

    private hasJpdbPageWordContent(entries: YomitanTermEntry[], data: CardRenderData | null): boolean {
        // The addon's job on a dictionary's own site is to add sources the native
        // page lacks, so the self-site source (suppressed in renderDefinitionSources)
        // doesn't count as content — otherwise it leaves an empty "No definitions" box.
        return Boolean(
            entries.length
            || (data?.jpdbVocabularyInfo && !isJpdbHost())
            || (data?.jitenVocabularyInfo && !isJitenHost())
            || this.settings.immersionKitEnabled,
        );
    }

    private jpdbPageWordCard(target: LocalDictionaryTarget): JPDBCard {
        const card = jpdbAudioCard(target.term, target.reading);
        card.source = isJitenHost() ? 'jiten' : 'jpdb';
        return card;
    }

    private jpdbPageWordAddonKey(target: LocalDictionaryTarget): string {
        return `word:${target.term}:${target.reading}`;
    }

    private updateJpdbPageAddonHtml(root: HTMLElement, html: string): boolean {
        if (root.dataset.yomuRenderedHtml === html) return false;
        root.dataset.yomuRenderedHtml = html;
        setInnerHtml(root, html);
        return true;
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
        if (!anchor.isConnected) return null;
        const existing = Array.from(document.querySelectorAll<HTMLElement>(`[data-yomu-jpdb-addon="${kind}"]`))
            .find(element => element.dataset.yomuAddonKey === key);
        if (existing) {
            existing.dataset.yomuGeneration = String(generation);
            existing.dataset.yomuAnchorFallback = String(anchor === document.body || anchor.tagName === 'MAIN');
            return existing;
        }
        const root = document.createElement('div');
        root.dataset.jpdbReaderRoot = 'true';
        root.dataset.yomuJpdbAddon = kind;
        root.dataset.yomuAddonKey = key;
        root.dataset.yomuGeneration = String(generation);
        // SPA pages (Nuxt on jiten.moe) can hand us only a coarse fallback
        // anchor before hydration; mark it so the enhancement re-mounts once
        // the real anchor exists instead of staying stranded.
        root.dataset.yomuAnchorFallback = String(anchor === document.body || anchor.tagName === 'MAIN');
        root.className = `yomu-jpdb-page-addon yomu-jpdb-${kind}-addon`;
        this.pauseAutoScanObserver(() => {
            if (anchor === document.body) document.body.prepend(root);
            else anchor.insertAdjacentElement('afterend', root);
        });
        return root;
    }

    private installJpdbPageAddonHandlers(root: HTMLElement, fallbackCard: JPDBCard): void {
        if (root.dataset.yomuHandlersInstalled === 'true') return;
        root.dataset.yomuHandlersInstalled = 'true';
        this.installReaderControlPointerActivation(root);
        root.addEventListener('click', event => this.handleJpdbPageAddonClick(event, root, fallbackCard));
    }

    private installReaderControlPointerActivation(root: HTMLElement): void {
        installControlPointerActivation(root);
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
            'jiten-audio': () => this.playJpdbPageAddonJitenAudio(actionButton, fallbackCard),
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

    private playJpdbPageAddonJitenAudio(actionButton: HTMLButtonElement, fallbackCard: JPDBCard): void {
        void this.handleCardAction(actionButton, fallbackCard, fallbackCard.spelling);
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
            {
                openSettings: () => this.showSettings(),
                openStudyPage: () => this.openStudyPage(),
                togglePause: () => void this.toggleAnnotationsPaused(),
                isPaused: () => this.settings.annotationsPaused,
                toggleOcrMode: () => void this.cycleOcrMode(),
                ocrMode: () => ocrInteractionModeFromSettings(this.settings),
                toggleAutoPlayAudio: () => void this.toggleAutoPlayAudio(),
                isAutoPlayAudioEnabled: () => this.isAutoPlayAudioEnabled(),
                toggleJapaneseSiteLanguage: () => void this.togglePreferredJapaneseSiteLanguage(),
                isYouTube: () => isYouTubeHostname(),
                toggleYoutubeFilter: () => void this.toggleYoutubeImmersion(),
                isYoutubeFilterEnabled: () => this.settings.youtubeImmersionEnabled,
            },
        );
    }

    private async toggleAnnotationsPaused(): Promise<void> {
        await this.setAnnotationsPaused(!this.settings.annotationsPaused);
    }

    private async setAnnotationsPaused(paused: boolean): Promise<void> {
        if (this.settings.annotationsPaused === paused) return;
        this.settings.annotationsPaused = paused;
        this.applyAnnotationsPausedState();
        await saveSettings(this.settings);
        log.info('Annotations paused toggled', { paused });
        this.toast(uiText(this.settings.interfaceLanguage, paused ? 'annotationsPausedToast' : 'annotationsResumedToast'));
    }

    // Paused: drop any in-flight hover lookup and strip existing annotations so
    // the page reads natively. Resumed: re-scan (unless the user opted into
    // manual scanning, in which case the scan shortcut drives it).
    private applyAnnotationsPausedState(): void {
        if (this.settings.annotationsPaused) {
            this.cancelPendingHoverLookup();
            this.clearAllAnnotations();
        } else if (!this.settings.manualScanEnabled) {
            this.scheduleAutoScan(0, { force: true });
        }
    }

    private scanPageNow(): void {
        if (this.settings.annotationsPaused) return;
        log.info('On-demand scan');
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
        await saveSettings(this.settings);
        log.info('Auto-play audio toggled', { enabled: !enabled });
        this.toast(uiText(this.settings.interfaceLanguage, enabled ? 'autoplayAudioOffToast' : 'autoplayAudioOnToast'));
    }

    private async cycleOcrMode(): Promise<void> {
        const nextMode = nextOcrInteractionMode(ocrInteractionModeFromSettings(this.settings));
        applyOcrInteractionMode(this.settings, nextMode);
        await saveSettings(this.settings);
        this.ocr.refreshForModeChange();
        log.info('OCR mode changed', { mode: nextMode });
        this.toast(uiText(this.settings.interfaceLanguage, ocrModeToastKey(nextMode)));
    }

    private openStudyPage(): void {
        const opened = window.open(NEW_TAB_PAGE_URL, '_blank');
        if (opened) opened.opener = null;
        else location.href = NEW_TAB_PAGE_URL;
        log.info('Study page opened', { url: NEW_TAB_PAGE_URL });
    }

    private clearAllAnnotations(): void {
        removeNonDestructiveScanMirrors(document);
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

    destroy(options: ReaderAppDestroyOptions = {}): void {
        this.isDestroyed = true;
        this.disposeMokuroOcrToggleWatch?.();
        this.disposeMokuroOcrToggleWatch = undefined;
        this.unsubscribeCardStateSignals?.();
        this.unsubscribeCardStateSignals = undefined;
        this.unsubscribeSettingsStorageChanges?.();
        this.unsubscribeSettingsStorageChanges = undefined;
        this.pageScanner.destroy?.();
        this.factoryReset.destroy();
        this.abortController.abort();
        this.disposeHostThemeObserver?.();
        window.clearTimeout(this.hostThemeEnforceTimer);
        window.cancelAnimationFrame(this.themeContrastRefreshFrame ?? 0);
        window.clearTimeout(this.themeContrastRefreshTimer);
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, this.handleNonDestructiveMirrorStale);
        this.autoScanObserver?.disconnect();
        this.clearMiningPauseReassert();
        this.clearSubtitleHoverMiningResumeTimer();
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
        this.unresolvedFallbackVocabularyCache.clear();
        this.fallbackVocabularyResolutionCache.clear();
        this.clearPitchEnrichmentQueue();
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
        if (this.hoverPointerMoveFrame !== undefined) {
            window.cancelAnimationFrame(this.hoverPointerMoveFrame);
            this.hoverPointerMoveFrame = undefined;
        }
        this.pendingHoverPointerMove = undefined;
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
            this.clearAllAnnotations();
        }
        
        this.dictionaryStyles.remove();
        document.querySelectorAll('[data-jpdb-reader-root]').forEach(el => el.remove());
    }

    private setupAutoScan(): void {
        this.autoScanObserver?.disconnect();
        this.autoScanObserver = new MutationObserver(mutations => {
            const canScanText = this.canParseJapanese();
            const scanMutations: MutationRecord[] = [];
            let renderRejectionDelay: number | null = null;
            for (const mutation of mutations) {
                const delay = readerRenderRejectionRescanDelay(mutation);
                if (delay !== null) {
                    renderRejectionDelay = Math.max(renderRejectionDelay ?? 0, delay);
                    continue;
                }
                scanMutations.push(mutation);
            }
            if (canScanText && renderRejectionDelay !== null) this.scheduleAutoScan(renderRejectionDelay, { force: true, debounce: true });
            if (canScanText && scanMutations.some(mutationTouchesAsbPlayer)) this.scheduleAsbPlayerScan(120);
            else if (scanMutations.length && scanMutations.every(mutationInsideReaderRoot)) return;
            else if (canScanText && allowsFrequentVisibleAutoScan() && scanMutations.some(mutationMayContainJapaneseText)) {
                this.pageHasJapaneseText = true;
                this.scheduleAutoScan(visibleAutoScanMutationDelay(), {
                    force: isBookWalkerStorefrontPage(),
                    debounce: isYouTubeHostname(),
                });
            }
            if (isJitenHost()) {
                if (this.jitenEnhancementsNeedRefresh()) this.scheduleJpdbPageEnhancements(500);
            } else if (isPageEnhancementHost() && scanMutations.some(mutationMayAffectJpdbPageEnhancements)) {
                this.scheduleJpdbPageEnhancements(500);
            }
        });
        this.observeAutoScanMutations();
        window.addEventListener('scroll', () => {
            if (allowsFrequentVisibleAutoScan()) {
                this.scheduleAutoScan(visibleAutoScanMutationDelay(160), { force: true, debounce: isYouTubeHostname() });
            }
        }, { passive: true });
        window.addEventListener('resize', () => {
            if (allowsFrequentVisibleAutoScan()) {
                this.scheduleAutoScan(250, { force: true, debounce: isYouTubeHostname() });
            }
        }, { passive: true });
        window.addEventListener('resize', () => this.scheduleJpdbPageEnhancements(700), { passive: true });
        if (this.hasVisibleAutoScanWork()) this.scheduleAutoScan(visibleAutoScanInitialDelay());
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, this.handleNonDestructiveMirrorStale);
    }

    private observeAutoScanMutations(): void {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => {
                if (!this.isDestroyed) this.observeAutoScanMutations();
            }, { once: true });
            return;
        }
        this.autoScanObserver?.observe(document.body, AUTO_SCAN_OBSERVER_OPTIONS);
    }

    private shouldScanEmbeddedFrame(): boolean {
        return /(^|\.)youtube\.com$/i.test(location.hostname)
            && location.pathname === '/live_chat';
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
        const deadline = Date.now() + delay;
        if (this.autoScanTimer && this.autoScanDeadline <= deadline) {
            this.autoScanForced = this.autoScanForced || forced;
            if (options.debounce && this.autoScanDeadline < deadline) {
                window.clearTimeout(this.autoScanTimer);
                this.autoScanDeadline = deadline;
                this.autoScanTimer = window.setTimeout(() => {
                    this.runScheduledAutoScan();
                }, delay);
            }
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
        // Both the master pause and manual-scan mode suppress every scheduled
        // scan. The explicit puck/shortcut scan bypasses this entirely via a
        // direct scanVisiblePage call, so on-demand scanning still works.
        if (this.settings.annotationsPaused || this.settings.manualScanEnabled) return false;
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
            document.addEventListener(gestureType, swallowReaderRootGesture, { capture: true, passive: true });
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
        const onScrollDragStart = (event: TouchEvent): void => {
            // Editable / form controls keep native touch (caret, selection, option lists).
            scrollDragBody = eventTargetsInteractiveControl(event) ? null : readerScrollBodyForEvent(event);
            scrollDragLastY = event.touches[0]?.clientY ?? 0;
        };
        const onScrollDragMove = (event: TouchEvent): void => {
            if (!scrollDragBody?.isConnected || event.touches.length > 1) return; // pinch → native
            const y = event.touches[0]?.clientY;
            if (typeof y !== 'number') return;
            const consumed = manualScrollReaderBody(scrollDragBody, scrollDragLastY - y);
            scrollDragLastY = y;
            if (consumed && event.cancelable) event.preventDefault(); // the line above already moved the body
        };
        const endScrollDrag = (): void => { scrollDragBody = null; };
        const onScrollWheel = (event: WheelEvent): void => {
            if (eventTargetsInteractiveControl(event)) return;
            const body = readerScrollBodyForEvent(event);
            // deltaMode: 0=pixels, 1=lines, 2=pages — normalise so a notch scrolls sanely.
            const px = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * (body?.clientHeight ?? 0) : event.deltaY;
            if (!body || !manualScrollReaderBody(body, px)) return;
            if (event.cancelable) event.preventDefault();
        };
        let scrollDriveAttached = false;
        const setScrollDrive = (on: boolean): void => {
            if (on === scrollDriveAttached) return;
            scrollDriveAttached = on;
            const bind = (on ? document.addEventListener : document.removeEventListener).bind(document);
            bind('touchstart', onScrollDragStart as EventListener, { capture: true, passive: true });
            bind('touchmove', onScrollDragMove as EventListener, { capture: true, passive: false });
            bind('touchend', endScrollDrag, { capture: true, passive: true });
            bind('touchcancel', endScrollDrag, { capture: true, passive: true });
            bind('wheel', onScrollWheel as EventListener, { capture: true, passive: false });
        };
        // Overlays mount as document.body children; attach the scroll driver only while
        // one carrying a scroll body is present (cheap querySelector, run only when body's
        // direct children change — never on every scroll).
        const syncScrollDrive = (): void => setScrollDrive(Boolean(document.querySelector(READER_ROOT_SCROLL_BODY_SELECTOR)));
        const scrollDriveObserver = new MutationObserver(syncScrollDrive);
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
            scrollDriveObserver.disconnect();
            scrollDriveObservedRoot = root;
            scrollDriveObserver.observe(root, { childList: true });
            syncScrollDrive();
        };
        const rebindScrollDriveRoot = (): void => {
            syncScrollDrive();
            observeScrollDriveRoot();
        };
        scrollDriveObserver.disconnect();
        scrollDriveObserver.takeRecords();
        const rootObserver = new MutationObserver(rebindScrollDriveRoot);
        const htmlRoot = document.documentElement;
        if (htmlRoot) rootObserver.observe(htmlRoot, { childList: true });
        observeScrollDriveRoot();
        this.abortController.signal.addEventListener('abort', () => {
            scrollDriveObserver.disconnect();
            rootObserver.disconnect();
        }, { once: true });

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
            if (this.isMiningDrawerHandlePointerEvent(event)) return;
            this.suppressHoverAfterPenContact(event);
            if (this.handleOcrReaderWordPointerDown(event)) return;
            this.beginTapLookup(event);
            this.dismissModalPopoverForOutsidePointer(event);
            this.dismissHoverPopoverForOutsidePointer(event);
            this.beginPressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointermove', event => {
            this.updateTapLookup(event);
            this.updatePressLookup(event);
        }, { capture: true, passive: false });

        document.addEventListener('pointerup', event => {
            this.finishTapLookup(event);
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointercancel', event => {
            this.cancelTapLookup(event);
            this.endPressLookup(event);
        }, { capture: true });

        document.addEventListener('pointerover', event => {
            this.handleHoverPointer(event);
        }, { capture: true });

        document.addEventListener('pointermove', event => {
            this.queueHoverPointerMove(event);
        }, { capture: true });

        document.addEventListener('pointerout', event => {
            this.handleHoverPointerOut(event);
        }, { capture: true });

        if (!window.PointerEvent) {
            document.addEventListener('mouseover', event => {
                this.handleHoverPointer(event as PointerEvent);
            }, { capture: true });

            document.addEventListener('mousemove', event => {
                this.queueHoverPointerMove(event as PointerEvent);
            }, { capture: true });

            document.addEventListener('mouseout', event => {
                this.handleHoverPointerOut(event as PointerEvent);
            }, { capture: true });
        }

        document.addEventListener('keyup', () => this.scheduleSelectionLookup(120));

        document.addEventListener('mouseup', () => this.scheduleSelectionLookup(140));

        document.addEventListener('touchend', () => this.scheduleSelectionLookup(180), { passive: true });

        // mouseup/touchend/keyup miss selections that settle without a fresh
        // gesture end on document — most visibly iPad selection-handle drags and
        // the text loupe. A debounced selectionchange catches the settled
        // selection so the popover triggers consistently; the longer delay
        // coalesces the burst of events a drag emits into a single lookup.
        document.addEventListener('selectionchange', () => this.scheduleSelectionLookup(250));

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
        if (this.isDestroyed || this.settings.popupActivationMode === 'off' || !this.settings.parseSelection) return;
        window.clearTimeout(this.selectionTimer);
        this.selectionTimer = window.setTimeout(() => void this.lookupSelection(), delayMs);
    }

    private handleDocumentClick(event: MouseEvent): void {
        if (this.isDestroyed) return;
        if (this.isMiningDrawerHandlePointerEvent(event)) return;
        const target = event.target as HTMLElement;
        if (shouldIgnoreDocumentClickTarget(target)) return;

        // The selection/token-list popover installs its own click handlers for
        // its word buttons, action pills and copy control. Let those run instead
        // of resolving a page word from the click point — the popover overlaps
        // page text, so point geometry would pierce through to an underlying word
        // and open its dictionary at the wrong location (and shift this popover).
        if (target.closest?.(TOKEN_LIST_POPOVER_CONTROL_SELECTOR)) return;

        const word = this.readerWordForPointerEvent(event, { clickLookup: true });
        if (!word && target.closest?.('[data-jpdb-reader-root] a.gloss-link[data-dictionary-lookup]')) return;

        const insideActivePopover = this.activePopoverMode === 'modal' && this.isInsideActivePopover(event.target as Node | null);
        if (!word) {
            if (this.pauseForSubtitleSurfaceTap(event)) return;
            this.handleDocumentLookupCandidateClick(event, insideActivePopover);
            return;
        }
        this.handleReaderWordClick(event, word);
    }

    private handleDocumentLookupCandidateClick(event: MouseEvent, insideActivePopover: boolean): void {
        if (this.settings.popupActivationMode === 'off' && !insideActivePopover) return;
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
        const word = this.readerWordForPointerEvent(event, { clickLookup: true }) ?? tap.word;
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
        this.suppressSelectionLookupUntil = Date.now() + 350;
        this.ocr.pinLineForElement(word);
        if (this.shouldPauseForLookupAnchor(word)) this.pauseVideoForSubtitleMining();
        // The touch fast-fallback shows a single-sense placeholder card first and only
        // fills in the full entry after a background reparse — so the FIRST tap on OCR
        // text showed partial results and you had to tap again. OCR overlay words are
        // already tokenized Japanese, so the full lookup (cached card or jiten) returns
        // the complete entry on the first tap; skip the fast-fallback for them.
        const fastInitialRender = (surfaces.s || this.shouldFastRenderReaderWordPointerLookup(event))
            && !word.closest('.jpdb-ocr-line');
        void this.showWord(word, surfaces.r
            ? { trigger: 'click', userGesture: true, navigation: 'push-current', fastInitialRender }
            : { trigger: 'click', userGesture: true, fastInitialRender });
    }

    private handleOcrReaderWordPointerDown(event: PointerEvent): boolean {
        const word = this.ocrPointerDownReaderWord(event);
        if (!word) return false;
        const surfaces = this.readerWordClickSurfaces(event, word);
        if (!surfaces) return false;
        event.preventDefault();
        this.prepareModalLookupFromPointer(event);
        const now = Date.now();
        this.suppressSelectionLookupUntil = now + 350;
        this.suppressWordClickUntil = now + 700;
        this.ocr.pinLineForElement(word);
        // Full entry on the first tap for OCR overlay text (see openReaderWordFromPointer).
        const fastInitialRender = !word.closest('.jpdb-ocr-line');
        void this.showWord(word, surfaces.r
            ? { trigger: 'click', userGesture: true, navigation: 'push-current', fastInitialRender }
            : { trigger: 'click', userGesture: true, fastInitialRender });
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
        const l = nativeClickableAncestor(word);
        const n = this.isNativeWord(word)
            && !r
            && !s
            && !this.clickForcesReaderWordLookup(event);
        if (!r && !s
            && l
            && !this.clickForcesReaderWordLookup(event)
            && !this.passiveTextMirrorClickOverridesNativeLink(word, l)
            && !n) {
            return null;
        }
        if (!this.settings.lookupOnClick && !r && !s) return null;
        return { r, s, n };
    }

    private isNativeWord(word: HTMLElement): boolean {
        return Boolean(word.closest('.jpdb-reader-native-canvas'));
    }

    private passiveTextMirrorClickOverridesNativeLink(word: HTMLElement, nativeClickable: HTMLElement): boolean {
        return canClickLookupPassiveReaderWordElement(word)
            && Boolean(word.closest('.jpdb-reader-text-mirror'))
            && nativeClickable instanceof HTMLAnchorElement;
    }

    private consumeSuppressedReaderWordClick(event: MouseEvent, word: HTMLElement): boolean {
        const pointerType = (event as PointerEvent).pointerType;
        if (event.type.startsWith('pointer') && (pointerType === 'touch' || pointerType === 'pen')) return false;
        if (Date.now() >= this.suppressWordClickUntil && !this.shouldIgnoreCurrentImmersionExampleTargetClick(word)) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
    }

    private shouldFastRenderReaderWordPointerLookup(event: MouseEvent): boolean {
        const pointerType = (event as PointerEvent).pointerType;
        return event.type.startsWith('pointer') && (pointerType === 'touch' || pointerType === 'pen');
    }

    // The subtitle controller's bound <video>, when present and still attached.
    // Preferred over the document-wide largest-video heuristic so the mining
    // pause targets the exact player the overlay tracks (not an ad/preview/
    // miniplayer). The companion may be a lifecycle stub, hence the optional call.
    private boundSubtitleVideo(): HTMLVideoElement | undefined {
        // Single `as {...}` cast (the same pattern as refreshParsedCueTexts) so
        // the optional getBoundVideo stays statically visible to dead-code
        // analysis: the companion is either the real controller (has it) or a
        // lifecycle stub (does not).
        const subtitles = this.subtitles as { getBoundVideo?: () => HTMLVideoElement | undefined };
        return subtitles.getBoundVideo?.();
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

    private markMiningPause(video: HTMLVideoElement): void {
        video.dataset.jpdbReaderMiningPause = String(Date.now());
    }

    private clearMiningPause(video: HTMLVideoElement): void {
        delete video.dataset.jpdbReaderMiningPause;
    }

    private handleDocumentKeydown(event: KeyboardEvent): void {
        if (this.isDestroyed) return;
        this.pressedKeys.add(normalizePressedKey(event.key));
        if (isEditableEventContext(event)) return;
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
        // Remember the current selection so the keyup that follows this Escape
        // doesn't immediately re-open the popover for it. The highlight stays put.
        this.rememberDismissedSelection();
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
            log.info('Shortcut opened settings');
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
            log.info('Shortcut triggered image scan');
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
        void saveSettings(this.settings);
        this.subtitles.refresh();
        log.info('Shortcut toggled subtitle overlay', { visible: this.settings.subtitleOverlayVisible });
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
            log.info('Mass-reviewed visible Jiten words', { count });
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

    private pinActiveHoverPopoverForPendingModalLookup(): void {
        if (this.activePopoverMode !== 'hover' || !this.activePopover) return;
        window.clearTimeout(this.hoverWatchTimer);
        this.hoverWatchTimer = undefined;
        this.hoverPopoverPointerPosition = undefined;
        this.activePopoverMode = 'modal';
        this.activeHoverWord = undefined;
        this.activeHoverLookupKey = '';
        this.activePointerTextLookup = undefined;
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
        if (this.settings.popupActivationMode === 'off' || !this.settings.lookupOnMiddleMouse || event.button !== 1) return false;
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
            if (word && this.readerWordBelongsToPointerSurface(word, surface) && canUseWord(word)) return word;
        }
        return null;
    }

    private hoverReaderWordFromPointStack(x: number, y: number, surface: HTMLElement | null = null): HTMLElement | null {
        if (typeof document.elementsFromPoint !== 'function') return null;
        for (const element of document.elementsFromPoint(x, y)) {
            const word = element.closest?.('.jpdb-reader-word') as HTMLElement | null;
            if (word && this.readerWordBelongsToPointerSurface(word, surface) && this.canHoverLookupReaderWord(word)) return word;
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
        if (!isYouTubeRuntimeHost() || hasJpdbApiCredential(this.settings) || hasJitenApiCredential(this.settings)) return options;
        const pageBudget = Math.max(0, Math.floor(options.publicLookupPageBudget ?? PITCH_ENRICHMENT_LIMIT));
        const keylessVisibleLimit = pageBudget || PITCH_ENRICHMENT_LIMIT;
        return {
            ...options,
            jpdbPublicLookup: false,
            publicLookupLimit: Math.max(Math.floor(options.publicLookupLimit ?? 0), keylessVisibleLimit),
            publicLookupTotalLimit: Math.max(Math.floor(options.publicLookupTotalLimit ?? 0), keylessVisibleLimit),
        };
    }

    private nestedPitchEnrichmentOptions(): PitchEnrichmentOptions {
        const options = nestedPitchEnrichmentOptionsForHost(location.hostname);
        if (!isYouTubeRuntimeHost() || hasJpdbApiCredential(this.settings) || hasJitenApiCredential(this.settings)) return options;
        return {
            publicLookupLimit: 16,
            publicLookupTotalLimit: 16,
            publicLookupPageBudget: 32,
            publicLookupTermLimit: 1,
            substantivePublicLookupOnly: true,
            deferPublicLookup: false,
        };
    }

    private preloadableReaderWordCard(word: HTMLElement): JPDBCard | null {
        if (word.dataset.jpdbReaderPassive === 'true') return null;
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
        if (this.isDestroyed || this.pressLookup?.source === 'middle' || !this.canUseHoverLookupPointer(event) || this.shouldSuppressPenHover(event)) return true;
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
        if (direct && this.readerWordBelongsToPointerSurface(direct, surface) && canUseWord(direct)) return direct;
        return this.ocrLineWordForPointer(target, event.clientX, event.clientY)
            ?? (options.hoverLookup ? this.hoverReaderWordFromPointStack(event.clientX, event.clientY, surface) : this.wordFromPoint(event.clientX, event.clientY, surface, canUseWord))
            ?? this.readerWordFromRenderedGeometry(target, event.clientX, event.clientY, canUseWord);
    }

    private readerPointerSurfaceForTarget(target: Element | null): HTMLElement | null {
        return target?.closest<HTMLElement>(READER_POINTER_SURFACE_SELECTOR) ?? null;
    }

    private readerWordBelongsToPointerSurface(word: HTMLElement, surface: HTMLElement | null): boolean {
        return !surface || surface.contains(word);
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
        return scope ? readerWordAtPointInScope(scope, x, y, canUseWord) : null;
    }

    private readerWordGeometryScope(target: Element | null): ParentNode | null {
        if (!target) return null;
        const scope = target.closest<HTMLElement>(HOVER_READER_WORD_GEOMETRY_SCOPE_SELECTOR);
        return scope && scope.querySelector('.jpdb-reader-word') ? scope : null;
    }

    private handlePointerTextHover(event: PointerEvent): void {
        const hoverEnabled = this.shouldLookupOnHover(event);
        const candidate = hoverEnabled ? this.lookupCandidateFromPoint(event.clientX, event.clientY, event.target, HOVER_POINTER_TEXT_LOOKUP_OPTIONS) : null;
        if (candidate && this.refreshActivePointerTextHover(candidate, event)) return;
        this.cancelMissingPointerTextCandidate(candidate);
        this.scheduleInactiveHoverClose();
        if (!canSchedulePointerTextHoverLookup(hoverEnabled, candidate)) return;
        this.pageScanner.interruptVisiblePageScan();
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
            if (this.shouldRetryHoverAudio(word, event)) this.retryActiveHoverAudio(word, hoverLookupKey);
            return;
        }
        if (this.activePopoverMode === 'hover' && this.activeHoverWord === word) {
            this.cancelHoverClose();
            return;
        }
        if (!this.shouldLookupOnHover(event)) return;
        this.keepSubtitleMiningPauseForPendingHover(word);
        this.pageScanner.interruptVisiblePageScan();
        this.preloadHoverWordAudio(word);
        this.scheduleHoverLookup(word, event);
    }

    private keepSubtitleMiningPauseForPendingHover(word: HTMLElement): void {
        if (!this.settings.subtitleMiningPause || !this.settings.subtitleHoverPause) return;
        if (!word.closest(VIDEO_LOOKUP_ANCHOR_SELECTOR)) return;
        this.pauseVideoForSubtitleMining();
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
        const control = word.closest('button,[role="button"],a[href],[aria-controls],[aria-expanded]');
        if (!control) return false;
        const relatedElement = related instanceof HTMLElement ? related : related.parentElement;
        return Boolean(relatedElement && control.contains(relatedElement));
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
        if (getSelectionText()) event.preventDefault();
        this.rememberDismissedSelection();
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
        this.scheduleRepositionActivePopoverFrame();
    }

    // Coalesce reposition requests (ResizeObserver bursts during hydration,
    // scroll) to at most one forced-layout reposition per animation frame.
    private scheduleRepositionActivePopoverFrame(): void {
        if (this.popoverRepositionFrame !== undefined) return;
        this.popoverRepositionFrame = window.requestAnimationFrame(() => {
            this.popoverRepositionFrame = undefined;
            if (!this.isDestroyed) this.repositionActivePopover();
        });
    }

    private scheduleHoverLookup(word: HTMLElement, event: MouseEvent | KeyboardEvent): void {
        const hoverLookupKey = this.hoverLookupKeyForWord(word);
        if (this.shouldSkipHoverLookupSchedule(word, hoverLookupKey)) return;

        this.cancelHoverClose();
        if (this.hoverLookupTimer && this.hoverPendingWord) {
            this.hoverPendingWord = word;
            this.hoverPendingLookupKey = hoverLookupKey;
            return;
        }
        window.clearTimeout(this.hoverLookupTimer);
        const hoverLookupGeneration = this.nextHoverLookupGeneration();
        this.hoverPendingWord = word;
        this.hoverPendingLookupKey = hoverLookupKey;
        const runLookup = () => this.runScheduledHoverLookup(word, event, hoverLookupGeneration);
        const delay = this.activePopoverMode === 'hover' && this.activeHoverWord && this.activeHoverWord !== word
            ? 0
            : Math.max(0, this.settings.hoverOpenDelayMs);
        if (delay === 0) runLookup();
        else this.hoverLookupTimer = window.setTimeout(runLookup, delay);
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
        const pointer = this.lastPointerPosition;
        const activeWord = (pointer
            ? this.hoverReaderWordFromElement(document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null)
            : null) ?? (word.isConnected ? word : null);
        if (!activeWord || !this.canRunScheduledHoverLookup(activeWord, event)) return;
        const activeHoverLookupKey = this.hoverLookupKeyForWord(activeWord);
        if (activeHoverLookupKey) this.hoverLookupInFlightKey = activeHoverLookupKey;
        void this.showWord(activeWord, { trigger: 'hover', hoverLookupGeneration }).finally(() => {
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
            this.dismiss({
                suppressHoverTarget: false,
                deferSubtitleMiningResume: this.shouldDeferSubtitleMiningResumeForHoverClose(),
            });
        }, Math.max(0, delay));
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
        return this.isInsideActivePopover(target)
            || Boolean(this.activeHoverWord && this.isInsideNode(target, this.activeHoverWord));
    }

    private isWordHoverActive(word: HTMLElement, options: { ignoreCssHover?: boolean; ignorePointerPosition?: boolean } = {}): boolean {
        // Reactive SPAs (YouTube) reconcile and REPLACE rendered word nodes underneath a
        // stationary cursor. The stored anchor becomes detached, so the usual `:hover` /
        // geometry checks all fail even though the same logical word still sits under the
        // pointer. Re-resolve the live word at the last pointer position and re-anchor when
        // it is the SAME vid:sid; only do this for a disconnected node so the connected path
        // stays byte-for-byte unchanged.
        if (!word.isConnected) return this.reanchorDisconnectedHoverWord(word, options);
        if (!options.ignoreCssHover && word.matches(':hover')) return true;
        if (options.ignorePointerPosition) return false;
        if (!this.lastPointerPosition) return false;
        const target = document.elementFromPoint(this.lastPointerPosition.x, this.lastPointerPosition.y);
        if (target instanceof Element) {
            if (this.isPointerInsideActiveOcrWordLine(word, target)) return true;
            if (this.hoverReaderWordFromPointStack(this.lastPointerPosition.x, this.lastPointerPosition.y) === word) return true;
            if (this.ocrLineWordForPointer(target, this.lastPointerPosition.x, this.lastPointerPosition.y) === word) return true;
            if (this.readerWordFromRenderedGeometry(target, this.lastPointerPosition.x, this.lastPointerPosition.y, item => this.canHoverLookupReaderWord(item)) === word) return true;
        }
        return this.isInsideNode(target, word);
    }

    private isPointerInsideActiveOcrWordLine(word: HTMLElement, target: Element): boolean {
        const line = word.closest<HTMLElement>('.jpdb-ocr-line');
        return Boolean(line && line.contains(target));
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
        if (this.settings.popupActivationMode === 'off') return;
        if (!this.settings.parseSelection) return;
        if (Date.now() < this.suppressSelectionLookupUntil) return;
        this.suppressHoverForActivePageSelection();
        const selected = this.selectionLookupText();
        if (!selected) {
            // Selection went away — drop the dismissal guard so a fresh
            // selection of the same text opens the popover again.
            this.dismissedSelectionText = '';
            return;
        }
        // The user explicitly closed the popover for this exact selection
        // (Escape or click-away). Keep the highlight but don't re-open until
        // the selection actually changes.
        if (selected === this.dismissedSelectionText) return;
        this.dismissedSelectionText = '';
        const anchor = this.selectionLookupAnchor();
        if (anchor && this.shouldPauseForLookupAnchor(anchor)) this.pauseVideoForSubtitleMining();
        if (await this.lookupRenderedSelection(selected)) return;
        await this.lookupText(selected, getSelectionSentence(), { source: 'selection', anchor });
    }

    private rememberDismissedSelection(): void {
        this.dismissedSelectionText = getSelectionText();
    }

    private selectionLookupText(): string {
        const selected = getSelectionText();
        return (!selected
            || selected.length > 500
            || !HAS_JAPANESE.test(selected)
            || isProseDominantSelection(selected)
            || (document.activeElement as HTMLElement | null)?.closest?.('[data-jpdb-reader-root]')) ? '' : selected;
    }

    private selectionLookupAnchor(): HTMLElement | undefined {
        const control = getSelectionControlElement();
        if (control) return control;
        const selection = window.getSelection();
        if (!selection?.rangeCount) return undefined;
        const range = selection.getRangeAt(0);
        return this.selectionLookupElement(selection.focusNode)
            ?? this.selectionLookupElement(selection.anchorNode)
            ?? this.selectionLookupElement(range.startContainer)
            ?? this.selectionLookupElement(range.commonAncestorContainer);
    }

    private selectionLookupElement(node: Node | null): HTMLElement | undefined {
        const element = node instanceof HTMLElement ? node : node?.parentElement;
        return element?.closest<HTMLElement>(SELECTION_LOOKUP_ANCHOR_SELECTOR) ?? element ?? undefined;
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
        if (!canSearchPublicLookupCard(this.settings, {})) return undefined;
        const cards = await this.jpdbVocabulary.search(term, PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT).catch(error => {
            log.warn('Public JPDB fallback search failed', { term }, error);
            return [];
        });
        return cards.find(card => card.spelling === term);
    }

    private async publicLookupFallbackCard(card: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup'> = {}): Promise<JPDBCard | undefined> {
        return (await this.publicLookupFallbackCards([card], options)).get(cardKey(card));
    }

    private async publicLookupFallbackCards(
        cards: readonly JPDBCard[],
        options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup'> = {},
    ): Promise<Map<string, JPDBCard>> {
        const result = new Map<string, JPDBCard>();
        if (!canSearchPublicLookupCard(this.settings, {})) return result;
        const entries = uniqueFallbackLookupEntries(cards, options.publicLookupTermLimit);
        if (!entries.length) return result;

        // Keyed users resolve EVERY fallback term through one batched
        // reader/parse (full vocabulary in a single request, metered per-user) —
        // this replaces the per-word /info fan-out that hammered the server.
        // Keyless keeps the public lookup (capped + cached) so it can no longer
        // fan out into the hundreds-of-requests storm. Mirrors the hosted
        // newtab runtime, which already routes keyed fallbacks this way.
        const jitenTerms = [...new Set(entries.flatMap(entry => entry.terms))];
        const jitenCards = this.isJitenApiActive()
            ? await this.batchJitenFallbackCards(jitenTerms)
            : await this.jitenPublicVocabulary.lookupMany(jitenTerms, { detailLimit: publicJitenDetailLimit(entries.length) }).catch(error => {
                log.warn('Jiten fallback failed', { terms: jitenTerms.length }, error);
                return new Map<string, JPDBCard>();
            });
        for (const entry of entries) {
            for (const term of entry.terms) {
                const card = jitenCards.get(normalizedJitenLookupKey(term));
                if (!card) continue;
                result.set(entry.key, card);
                break;
            }
        }

        if (options.jpdbPublicLookup === false) return result;
        const unresolved = entries.filter(entry => !result.has(entry.key));
        await runLimited(unresolved, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, async entry => {
            for (const term of entry.terms) {
                const publicCard = await this.publicLookupSpellingCard(term);
                if (!publicCard) continue;
                result.set(entry.key, publicCard);
                return;
            }
        });
        return result;
    }

    private async publicLookupHydratableJitenCards(cards: readonly JPDBCard[]): Promise<Map<string, JPDBCard>> {
        if (!cards.length) return new Map<string, JPDBCard>();
        return await this.jitenPublicVocabulary.hydrateCards(cards, { detailLimit: publicJitenDetailLimit(cards.length) }).catch(error => {
            log.warn('Jiten parsed-card hydration failed', { cards: cards.length }, error);
            return new Map<string, JPDBCard>();
        });
    }

    // Resolve fallback terms through Jiten with ZERO per-word requests: ALL
    // terms go through one batched reader/parse (each term as its own line),
    // which returns full vocabulary in a single request and is metered by
    // Jiten's per-user parse budget. Only called for keyed users; keyless never
    // bulk-hits Jiten this way (that path was the per-word /info request storm).
    private async batchJitenFallbackCards(terms: readonly string[]): Promise<Map<string, JPDBCard>> {
        const cards = new Map<string, JPDBCard>();
        const uniqueTerms = [...new Set(terms.map(term => term.trim()).filter(Boolean))];
        if (!uniqueTerms.length) return cards;
        const parsed = await this.jiten.parse(uniqueTerms).catch(error => {
            log.warn('Jiten batch fallback parse failed', { terms: uniqueTerms.length }, error);
            return [] as JPDBToken[][];
        });
        uniqueTerms.forEach((term, index) => {
            const tokens = parsed[index] ?? [];
            const card = tokens.find(token => jitenFallbackTokenMatches(term, token))?.card
                ?? tokens.find(token => token.card.source === 'jiten')?.card;
            if (card?.source === 'jiten') cards.set(normalizedJitenLookupKey(term), card);
        });
        return cards;
    }

    private async publicJitenLookupCandidateCards(terms: readonly string[]): Promise<Map<string, JPDBCard>> {
        const uniqueTerms = [...new Set(terms.map(term => term.trim()).filter(Boolean))];
        if (!uniqueTerms.length) return new Map<string, JPDBCard>();
        return await this.jitenPublicVocabulary.lookupMany(uniqueTerms).catch(error => {
            log.warn('Jiten candidate failed', { terms: uniqueTerms.length }, error);
            return new Map<string, JPDBCard>();
        });
    }

    private async publicLookupFirstCandidateTerm(terms: readonly string[]): Promise<JPDBCard | undefined> {
        const uniqueTerms = [...new Set(terms.map(term => term.trim()).filter(Boolean))];
        if (!uniqueTerms.length) return undefined;
        const jitenCards = await this.publicJitenLookupCandidateCards(uniqueTerms);
        for (const term of uniqueTerms) {
            const card = jitenCards.get(normalizedJitenLookupKey(term));
            if (card) return card;
        }
        for (const term of uniqueTerms) {
            const card = await this.publicLookupCard(term, true, { allowCandidateLookup: true });
            if (card) return card;
        }
        return undefined;
    }

    private async lookupFallbackApiCard(card: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup'> = {}): Promise<JPDBCard | undefined> {
        return this.isJitenApiActive()
            ? this.jitenLookupFallbackCard(card)
            : this.publicLookupFallbackCard(card, options);
    }

    private async jitenLookupFallbackCard(card: JPDBCard): Promise<JPDBCard | undefined> {
        const terms = fallbackLookupTermsForCard(card);
        const parsed = await this.jiten.parse(terms).catch(error => {
            log.warn('Jiten fallback lookup failed', { terms: terms.length }, error);
            return [];
        });
        for (const [index, term] of terms.entries()) {
            const tokens = parsed[index] ?? [];
            const candidate = tokens.find(token => jitenFallbackTokenMatches(term, token))?.card
                ?? tokens.find(token => token.card.source === 'jiten')?.card;
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
        this.primeLookupAudioFromGesture();
        void this.showWord(nestedWord, {
            trigger: 'click',
            navigation: trigger === 'modal' ? 'push-current' : 'reset',
            userGesture: true,
        });
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
        if (trigger === 'hover') this.pageScanner.interruptVisiblePageScan();
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
        const spans = this.publicJpdbPointerLookupCandidates(candidate);
        if (!this.canUsePublicJpdbPointerLookup() || !this.canUsePublicJpdbPointerTextLookup(candidate, spans)) return false;
        const jitenCards = await this.publicJitenLookupCandidateCards(spans.map(span => span.term));
        for (const span of spans) {
            const card = jitenCards.get(normalizedJitenLookupKey(span.term));
            if (!card) continue;
            const displaySpan = pointerSpanForResolvedCard(candidate.text, candidate.offset, span, card);
            this.parser.cacheCards?.([card]);
            await this.showPointerTextCard(card, sentence, candidate, displaySpan, trigger, options);
            return true;
        }
        for (const span of spans) {
            const card = await this.publicLookupCard(span.term, true, { allowCandidateLookup: true });
            if (card) {
                const displaySpan = pointerSpanForResolvedCard(candidate.text, candidate.offset, span, card);
                this.parser.cacheCards?.([card]);
                await this.showPointerTextCard(card, sentence, candidate, displaySpan, trigger, options);
                return true;
            }
        }
        return false;
    }

    private publicJpdbPointerLookupCandidates(candidate: PointerTextLookup): PointerTextSpanCandidate[] {
        const spans = jpdbPointerLookupCandidates(candidate.text, candidate.offset);
        const fallbackRange = fallbackLookupRangeAtOffset(candidate.text, candidate.offset);
        if (!fallbackRange) return spans;
        const fallbackSurface = candidate.text.slice(fallbackRange.start, fallbackRange.end);
        const fallbackSurfaceKey = normalizedLookupText(fallbackSurface);
        const deinflectedSpans = fallbackDictionaryLookupTermsForText(fallbackSurface)
            .filter(term => normalizedLookupText(term) !== fallbackSurfaceKey)
            .map(term => ({ term, start: fallbackRange.start, end: fallbackRange.end }));
        return uniquePointerTextSpans([...deinflectedSpans, ...spans]);
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
        if (options.trigger === 'hover') this.pageScanner.interruptVisiblePageScan();
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
        if (this.shouldShowRenderedWordCardImmediately(context, options)) {
            this.preloadHoverWordAudio(word);
            await this.showRenderedWordCard(card, context, options, stackOverSettings);
            return;
        }
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

    private shouldShowRenderedWordCardImmediately(
        context: RenderedWordDisplayContext,
        options: RenderedWordLookupOptions,
    ): boolean {
        return context.trigger === 'hover'
            || (context.trigger === 'modal' && options.fastInitialRender === true);
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
            skipInitialCardResolution: this.shouldShowRenderedWordCardImmediately(context, options),
        });
    }

    private cardForRenderedWord(word: HTMLElement): JPDBCard | undefined {
        const vid = Number(word.dataset.vid);
        const sid = Number(word.dataset.sid);
        const card = this.getCachedCard(vid, sid);
        return renderedWordCardForLookup(word, card);
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
        const resolved = await this.resolvePublicJpdbRenderedWordCandidate(lookup.terms, this.isExactRenderedWordCardMatch(word, card));
        if (!resolved) return false;
        this.parser.cacheCards?.([resolved]);
        await this.showRenderedWordCard(resolved, { ...context, sentence: lookup.sentence }, options, stackOverSettings);
        return true;
    }

    private isExactRenderedWordCardMatch(word: HTMLElement, card: JPDBCard): boolean {
        return renderedWordLookupText(word) === normalizedLookupText(card.spelling);
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
            this.restampKanaRunRenderedWords(word, token, lookup.sentence);
            await this.showRenderedWordCard(token.card, { ...context, sentence: lookup.sentence }, options, stackOverSettings);
            return true;
        } catch (error) {
            log.warn('Rendered JPDB parse failed', { expression: card.spelling }, error);
            return false;
        }
    }

    // P0 kana-run identity: re-stamp the rendered fragment run with the
    // resolved word's identity so grades/mining/cross-tab signals recolor the
    // WHOLE word, not just the tapped fragment.
    private restampKanaRunRenderedWords(word: HTMLElement, token: JPDBToken, sentence: string): void {
        const surface = sentence.slice(token.start, token.end);
        const run = kanaRunRenderedWordsForSurface(word, surface);
        if (run.length < 2) return;
        const pitchClass = getPitchClass(token.card.pitchAccent, token.card.reading || token.card.spelling) || 'unknown';
        this.pauseAutoScanObserver(() => {
            for (const fragment of run) {
                fragment.dataset.vid = String(token.card.vid);
                fragment.dataset.sid = String(token.card.sid);
                this.applyPublicVocabularyToRenderedWord(fragment, token.card, pitchClass);
            }
            refreshReaderWordContrast(word.parentElement ?? word);
        });
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
        if (this.isExactRenderedWordCardMatch(word, card)) return false;
        const surface = renderedWordLookupText(word);
        const spelling = normalizedLookupText(card.spelling);
        const reading = normalizedLookupText(card.reading);
        const isRenderedKanaFragment = KANA_ONLY_LOOKUP_RUN_RE.test(surface)
            && surface.length < Math.max(spelling.length, reading.length, lookup.terms[0]?.length ?? 0);
        return isRenderedKanaFragment;
    }

    private resolvePublicJpdbRenderedWordCandidate(terms: string[], boundWait: boolean): Promise<JPDBCard | undefined> {
        const resolved = this.resolvePublicJpdbRenderedWordCandidateTerms(terms);
        if (!boundWait) return resolved;
        // The clicked surface already matches its cached card, so the expansion
        // lookup is only a best-effort upgrade: don't hold the popover hostage
        // to a slow or offline public lookup.
        void resolved.catch(() => undefined);
        return Promise.race([
            resolved,
            wait(RENDERED_KANA_EXPANSION_EXACT_MATCH_WAIT_MS).then(() => undefined),
        ]);
    }

    private async resolvePublicJpdbRenderedWordCandidateTerms(terms: string[]): Promise<JPDBCard | undefined> {
        return this.publicLookupFirstCandidateTerm(terms);
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
        if (options.fastInitialRender) {
            await this.showFastFallbackUncachedPageWord(word, expression, options, trigger, navigation);
            return true;
        }
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

    private async showFastFallbackUncachedPageWord(
        word: HTMLElement,
        expression: string,
        options: RenderedWordLookupOptions,
        trigger: 'modal' | 'hover',
        navigation: CardNavigationMode,
    ): Promise<void> {
        const sentence = this.renderedWordSentence(word) ?? expression;
        const card = this.parser.fallbackCardFromText(expression);
        await this.showCard(card, sentence, renderedWordAnchor(word, false, this.activePopoverAnchor), {
            trigger,
            navigation,
            preservePosition: trigger === 'hover',
            previousNavigationEntry: this.renderedWordPreviousNavigationEntryForOptions(options, false, trigger, navigation),
            userGesture: options.userGesture,
            hoverLookupGeneration: options.hoverLookupGeneration,
            stackOverSettings: options.stackOverSettings,
            skipInitialCardResolution: true,
        });
        this.scheduleVisiblePageReparse();
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
        const resolved = await this.resolvePublicJpdbRenderedWordCandidate(terms, false);
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
        const source = options.source ?? 'lookup';
        const previousNavigationEntry = trigger === 'modal' ? options.previousNavigationEntry : undefined;
        this.prepareTokenListNavigation(trigger, navigation);
        const popover = this.createPopover();
        setInnerHtml(popover, this.renderTokenListHtml(tokens, selected, source, previousNavigationEntry));
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

    private renderTokenListHtml(tokens: JPDBToken[], selected: string, source: TokenListSource, previousNavigationEntry?: PopupNavigationEntry): string {
        return renderTokenListMarkup(tokens, selected, source, previousNavigationEntry, this.settings);
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
        if (!options.skipInitialCardResolution) card = await this.resolveLookupCardForInitialRender(card);
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
        this.maybePreloadLookupCardAudio(card, options, anchor);
        let renderData: CardRenderDataLoad | undefined;
        const loadRenderData = (): CardRenderDataLoad => {
            renderData ??= this.cardRenderData.load(card);
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
            void this.refreshSkippedInitialCardResolution(popover, card, sentence, anchor, options, mounted.requestId, isCurrentHoverCard);
        }

        try {
            if (trigger === 'hover') {
                await waitForHoverCardInitialPaint();
                if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
            }
            renderData = loadRenderData();
            const renderState = { fullRenderCompleted: false };
            this.renderDeferredCardLocalEntries(popover, card, sentence, trigger, renderData, fallbackAnkiLookup, mounted, renderState, isCurrentHoverCard, anchor);

            const fullData = await this.cardRenderDataOrFallback(card, renderData.all, fallbackAnkiLookup);
            renderState.fullRenderCompleted = true;
            if (!this.isCurrentCardRender(popover, mounted.requestId, isCurrentHoverCard)) return;
            this.renderCompletedCardPopover(popover, card, sentence, trigger, fullData, anchor);
            this.renderHydratedCardAnkiLookup(popover, card, sentence, trigger, fullData, renderData, mounted.requestId, isCurrentHoverCard, anchor);
        } finally {
            done();
        }
    }

    private async refreshSkippedInitialCardResolution(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        anchor: HTMLElement | undefined,
        options: CardDisplayOptions,
        requestId: number,
        isCurrentHoverCard: () => boolean,
    ): Promise<void> {
        if (!this.shouldResolveAfterSkippedInitialCardResolution(card)) return;
        const resolved = await this.resolveLookupCard(card).catch(error => {
            log.warn('Skipped initial card resolution failed', { term: card.spelling }, error);
            return null;
        });
        if (!resolved || !this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
        if (!this.isResolvedCardRefresh(card, resolved)) return;
        this.applyPublicVocabularyToRenderedWords(card, resolved);
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
        // The card shell has already mounted with this exact card. Hover autoplay
        // should provide instant feedback from that cached/prepared card instead
        // of waiting for fallback/public resolution and letting the caption move
        // under the cursor.
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
        anchor?: HTMLElement,
    ): void {
        if (mounted.instantLocalEntries !== null) return;
        let localEntriesValue: YomitanTermEntry[] | null = null;
        let metaEntriesValue: YomitanMetaEntry[] = [];
        let jpdbVocabularyInfoValue: JpdbVocabularyInfo | null = null;
        let jitenVocabularyInfoValue: JitenVocabularyInfo | null = null;
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
                ),
            ));
            this.restorePreservedImmersionMount(popover, preservedImmersion);
            refreshForcedReaderPopoverSurface(popover, this.settings);
            this.updateCardPopoverPosition(trigger);
            this.installDeferredCardPostRenderBehaviors(popover, card, sentence, trigger);
        };
        const renderLoading = () => {
            if (!canRenderLoading()) return;
            if (trigger !== 'hover') {
                runLoadingRender();
                return;
            }
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
                this.updateDeferredCardHeader(popover, card, metaEntriesValue, trigger, anchor, ankiLookupValue, jitenVocabularyInfoValue);
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
                if (jitenVocabularyInfoValue && canRenderLoading()) this.updateDeferredCardHeader(popover, card, metaEntriesValue, trigger, anchor, ankiLookupValue, jitenVocabularyInfoValue);
                renderLoading();
            });
        }
        if (renderData.ankiLookup) {
            void renderData.ankiLookup.then(ankiLookup => {
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
            this.updateDeferredCardHeader(popover, card, metaEntriesValue, trigger, anchor, ankiLookupValue, jitenVocabularyInfoValue);
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
        jitenVocabularyInfo?: JitenVocabularyInfo | null,
    ): void {
        this.applyPitchAccentToRenderedWords(card, undefined, this.renderedWordUpdateRootsForCardRender(trigger, anchor));
        this.updatePopoverWordPills(popover, card, metaEntries, ankiLookup, jitenVocabularyInfo);
        this.updatePopoverPitch(popover, card, metaEntries);
        this.updateCardPopoverPosition(trigger);
    }

    private updatePopoverWordPills(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: AnkiLookupResult, jitenVocabularyInfo?: JitenVocabularyInfo | null): void {
        updateHeadingWordPills(popover, {
            card,
            jpdbUrl: jpdbVocabularyUrl(card),
            settings: this.settings,
            metaEntries,
            ankiLookup,
            jitenVocabularyInfo,
            isJpdbBackedCard: value => this.isJpdbBackedCard(value),
            dictionaryLabel: name => this.dictionaryLabel(name),
        });
    }

    private updatePopoverPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[]): void {
        updateRenderedPitch(popover, card, metaEntries, this.settings.showPitchAccent);
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
        const renderedRoots = this.renderedWordUpdateRootsForCardRender(trigger, anchor);
        this.applyAnkiLookupToRenderedWords(card, data.ankiLookup, {
            preserveExistingEmpty: trigger === 'hover',
            roots: renderedRoots,
        });
        this.applyPitchAccentToRenderedWords(card, undefined, renderedRoots);
        const preservedImmersion = this.preserveImmersionMountForRerender(popover);
        clearNestedParseState(popover);
        setInnerHtml(popover, this.cardPopoverRenderer.render(card, sentence, trigger, { ...data, loading: false }));
        this.restorePreservedImmersionMount(popover, preservedImmersion);
        refreshForcedReaderPopoverSurface(popover, this.settings);

        this.updateCardPopoverPosition(trigger);
        this.installCardPostRenderBehaviors(popover, card, sentence, trigger, {
            relatedQueries: this.immersionRelatedQueries(data.jpdbVocabularyInfo),
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

    private renderHydratedCardAnkiLookup(
        popover: HTMLElement,
        card: JPDBCard,
        sentence: string | undefined,
        trigger: 'modal' | 'hover',
        data: CardRenderData,
        renderData: CardRenderDataLoad,
        requestId: number,
        isCurrentHoverCard: () => boolean,
        anchor?: HTMLElement,
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
                    this.renderCompletedCardPopover(popover, card, sentence, trigger, { ...data, ankiLookup }, anchor);
                })
                .catch(error => {
                    log.warn('Popup Anki detail failed', { term: card.spelling }, error);
                    if (!this.isCurrentCardRender(popover, requestId, isCurrentHoverCard)) return;
                    const ankiLookup = ankiLookupWithUnavailableDetails(data.ankiLookup);
                    if (!ankiLookup.primary) return;
                    this.renderCompletedCardPopover(popover, card, sentence, trigger, { ...data, ankiLookup }, anchor);
                });
        };
        if (trigger === 'hover') {
            window.setTimeout(hydrate, HOVER_ANKI_HYDRATION_DELAY_MS);
            return;
        }
        hydrate();
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
        popover.addEventListener('click', event => this.handleCardPopoverClick(event, card, sentence, anchor, trigger));
        popover.addEventListener('change', event => this.handlePopoverReviewTargetChange(event, popover));
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
        if (button.dataset.action === 'review-target-toggle') {
            togglePopoverReviewTargetSelection(button);
            return true;
        }
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
            kanjiVGInfo: needsKanjiVG && this.kanjiVG ? this.kanjiVG.lookup(kanji).catch(() => null) : Promise.resolve(null),
        };
    }

    private jpdbKanjiDetailPromise(kanji: string): Promise<JpdbKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled && this.jpdbKanji ? this.jpdbKanji.lookup(kanji).catch(() => null) : Promise.resolve(null);
    }

    private jitenKanjiDetailPromise(kanji: string): Promise<JitenKanjiInfo | null> {
        return this.settings.jpdbKanjiEnabled && this.isJitenApiActive()
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
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-prev" data-kanji="${escapeHtml(previous)}" title="${escapeHtml(uiText(language, 'previousKanji'))}">‹</button>
            <button class="jpdb-reader-icon-mini" type="button" data-action="kanji-next" data-kanji="${escapeHtml(next)}" title="${escapeHtml(uiText(language, 'nextKanji'))}">›</button>
        `;
    }

    private installKanjiCardActions(popover: HTMLElement, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): void {
        installMiningDrawerHandle(popover, (button, expanded) => this.setMiningControlsExpanded(button, expanded));
        this.installReaderControlPointerActivation(popover);
        popover.addEventListener('click', event => this.handleKanjiCardActionClick(event, card, kanji, sentence, anchor));
        popover.addEventListener('change', event => this.handlePopoverReviewTargetChange(event, popover));
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
        void this.renderKanjiDetailsInto(popover, detailsPromises, kanji, language);
        if (this.settings.kanjivgEnabled) {
            void this.renderKanjiVGInto(popover, detailsPromises.kanjiVGInfo, kanji, language);
        }
    }

    private async performJpdbKanjiAction(actionId: string, card: JPDBCard, kanji: string, sentence?: string, anchor?: HTMLElement): Promise<void> {
        if (!actionId || !this.jpdbKanji) return;
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
        const practiceDoodle = this.kanjiCompanion?.installKanjiPracticeDoodle?.(popover, () => this.settings.interfaceLanguage, () => kanjiVGInfo)
            ?? noopKanjiPracticeDoodle();
        const keywordMount = popover.querySelector<HTMLElement>('[data-kanji-keyword-mount]');
        const miningMount = popover.querySelector<HTMLElement>('[data-kanji-mining-mount]');
        const jpdbMount = popover.querySelector<HTMLElement>('[data-kanji-jpdb-mount]');
        const rtkMount = popover.querySelector<HTMLElement>('[data-kanji-rtk-mount]');
        const uchisenMount = popover.querySelector<HTMLElement>('[data-kanji-uchisen-mount]');
        const definitionsMounts = Array.from(popover.querySelectorAll<HTMLElement>('[data-kanji-definitions-mount]'));
        this.renderKanjiUchisenInto(popover, uchisenMount, kanji, language);

        const renderKeyword = () => {
            if (!popover.isConnected || !keywordMount?.isConnected) return;
            setInnerHtml(keywordMount, jitenInfo
                ? renderJitenKanjiKeywordLine(jitenInfo, rtkInfo, kanjiEntries, language)
                : this.renderKanjiKeywordLine(jpdbInfo, rtkInfo, kanjiEntries, language));
            this.repositionActivePopover();
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

    private renderKanjiKeywordLine(jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, entries: YomitanKanjiEntry[], language: InterfaceLanguage): string {
        return this.kanjiCompanion?.renderKanjiKeywordLine(jpdbInfo, rtkInfo, entries, language)
            ?? `<div class="jpdb-reader-help">${escapeHtml(uiText(language, 'kanjiDetailsUnavailable'))}</div>`;
    }

    private renderKanjiUchisenInto(popover: HTMLElement, mount: HTMLElement | null, kanji: string, language: InterfaceLanguage): void {
        if (!mount) return;
        const companion = this.kanjiCompanion;
        if (!this.settings.uchisenEnabled || !companion) {
            mount.remove();
            return;
        }
        const sourceAttributes = this.dictionarySourceState.attributes(kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID));
        void this.loadUchisenDetails(kanji).then(data => {
            if (!popover.isConnected || !mount.isConnected) return;
            if (!data || (!data.images.length && !data.canGenerateImages)) {
                mount.remove();
                this.repositionActivePopover();
                return;
            }
            void companion.installUchisenCarousel(mount, kanji, data.images, {
                sourceAttributes,
                detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
                summaryClass: 'jpdb-reader-local-title',
                bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
                proxyUrl: this.settings.corsProxyUrl,
                componentGroups: data.componentGroups,
                kanjiKeyword: data.kanjiKeyword,
                kanjiId: data.kanjiId,
                canGenerateImages: data.canGenerateImages,
                refreshData: () => {
                    this.uchisenDataCache.delete(kanji);
                    return companion.loadUchisenData(kanji, this.settings.corsProxyUrl);
                },
                interfaceLanguage: language,
            }).then(() => {
                if (!popover.isConnected) return;
                void (this.isJpdbPageAddonRoot(popover) ? this.parseJpdbPageAddonJapanese(popover) : this.parsePopoverJapanese(popover));
                this.repositionActivePopover();
            });
        }).catch(error => {
            log.warn('Uchisen kanji lookup failed', { kanji }, error);
            if (mount.isConnected) {
                mount.remove();
                this.repositionActivePopover();
            }
        });
    }

    private loadUchisenDetails(kanji: string): Promise<UchisenData | null> {
        const companion = this.kanjiCompanion;
        if (!this.settings.uchisenEnabled || !companion) return Promise.resolve(null);
        const existing = this.uchisenDataCache.get(kanji);
        if (existing) return existing;
        const promise = companion.loadUchisenData(kanji, this.settings.corsProxyUrl).catch(error => {
            this.uchisenDataCache.delete(kanji);
            log.warn('Uchisen kanji lookup failed', { kanji }, error);
            return null;
        });
        this.uchisenDataCache.set(kanji, promise);
        return promise;
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

    private async renderKanjiOriginsInto(popover: HTMLElement, kanji: string, jpdbInfo: JpdbKanjiInfo | null, jitenInfo: JitenKanjiInfo | null, rtkInfo: RtkInfo | null, kanjiVGInfo: KanjiVGInfo | null, kanjiEntries: YomitanKanjiEntry[]): Promise<void> {
        const mount = popover.querySelector<HTMLElement>('[data-kanji-origin-mount]');
        if (!mount) return;
        const sourceInfo = await this.lookupKanjiOriginSourceInfo(kanji);
        if (!this.canRenderKanjiOriginMount(popover, mount)) return;
        this.renderKanjiOriginMount(mount, kanji, jpdbInfo, jitenInfo, rtkInfo, kanjiVGInfo, kanjiEntries, sourceInfo);
        this.installKanjiOriginImageFallbacks(mount);
    }

    private async lookupKanjiOriginSourceInfo(kanji: string): Promise<KanjiSourceInfo | null> {
        if (!this.kanjiOrigin) return null;
        return await this.kanjiOrigin.lookup(kanji, this.settings).catch((error: unknown) => {
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
        this.enrichJpdbRelatedWords(popover);
        const plan = nestedTextParsePlan(popover, 120);
        if (!plan || nestedParseAlreadyScheduled(popover, plan.parseKey)) return;
        await this.parseNestedJapaneseContent(popover, plan, () => this.isCurrentPopoverRoot(popover));
    }

    private async parseJpdbPageAddonJapanese(root: HTMLElement): Promise<void> {
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
        if (nestedSettingsParseAlreadyRendered(form)) return;
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
            const currentPlan = nestedSettingsTextParsePlan(form, 640);
            if (!currentPlan) return;
            const currentParsed = supplementSettingsFallbackTokens(
                currentPlan.targets,
                parsedSettingsTargetsForCurrentPlan(plan, parsed, currentPlan),
            );
            this.applySettingsJapaneseParse(form, currentPlan, currentParsed);
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
        unwrapReaderWords(form, { includeReaderRoot: true, excludeSelector: '[data-settings-preview-lookup], [data-settings-preview-lookup] .jpdb-reader-word' });
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
        const renderSettings = settingsForSettingsFormParse(form, this.settings);
        applyNestedParsePlan(plan, parsed, renderSettings);
        addSettingsRubyFromRenderedReadings(form, renderSettings);
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
        void this.enrichPitchWords(tokens, pitchOptions ?? this.nestedPitchEnrichmentOptions());
        this.queueAnkiWordEnrichment(tokens, [root]);
    }

    private afterSubtitleJapaneseParsed(tokens: JPDBToken[], roots: ParentNode[] = []): void {
        this.preloadTermAudioForTokens(tokens);
        void this.enrichPitchWords(tokens, this.backgroundPitchEnrichmentOptions());
        if (!this.shouldRunAnkiBackgroundWork()) return;
        const targetRoots = roots.length ? roots : this.subtitleAnkiEnrichmentRoots();
        void this.enrichAnkiWords(tokens, targetRoots.length ? targetRoots : [document]);
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
        // Keyless YouTube subtitles: dictionaryFirstFallbackLookupTerms places
        // the surface (dictionary) form LAST, and publicLookupFallbackCard only
        // tries terms.slice(0, termLimit). A 2-term window can drop an inflected
        // verb's resolvable dictionary form (e.g. 戦う), leaving it without
        // furigana; widen to 3 so the dictionary form is reachable. The loop
        // stops at the first resolving term, so this only adds lookups when the
        // earlier candidates fail.
        const publicLookupTermLimit = isolateKeylessYouTubeSubtitleBudget
            ? Math.max(3, Math.floor(background.publicLookupTermLimit ?? 3))
            : Math.min(1, Math.max(1, Math.floor(background.publicLookupTermLimit ?? 1)));
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
            const resolved = await this.resolveFallbackVocabularyForPriorityRender(fallback);
            if (resolved === fallback || resolved.source === 'fallback') return;
            this.applyResolvedFallbackVocabularyToToken(token, fallback, resolved);
        });
    }

    private async resolvePublicOcrFallbackTokens(tokens: JPDBToken[]): Promise<void> {
        const pending = new Map<string, { card: JPDBCard; tokens: JPDBToken[] }>();
        for (const token of tokens) {
            const fallback = token.card;
            const key = cardKey(fallback);
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
        for (const [key, group] of pending) {
            const card = resolved.get(key);
            if (!card || card.source === 'fallback') continue;
            for (const token of group.tokens) this.applyResolvedFallbackVocabularyToToken(token, group.card, card);
        }
    }

    private async resolveFallbackVocabularyForPriorityRender(fallback: JPDBCard): Promise<JPDBCard> {
        if (fallback.source !== 'fallback') return fallback;
        const cached = this.resolvedFallbackVocabularyCache.get(cardKey(fallback));
        if (cached) return cached;
        const key = cardKey(fallback);
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
        this.rememberResolvedFallbackVocabulary(fallback, resolved);
        token.card = resolved;
        token.pitchClass = getPitchClass(resolved.pitchAccent, resolved.reading || resolved.spelling) || token.pitchClass;
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

    // Starts the cached status lookup before the scan touches the DOM so the
    // IndexedDB roundtrip overlaps the token apply; colors then land in the
    // same breath as the ruby instead of popping in afterwards.
    private beginAnkiWordEnrichment(tokens: JPDBToken[]): (roots: ParentNode[]) => void {
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return () => undefined;
        const uniqueTokens = uniqueTokensByCard(tokens);
        const lookups = this.anki.findCachedStatusBatch(uniqueTokens.map(token => token.card))
            .catch(error => {
                log.warnOnce('background-anki-coloring-failed', 'Anki background coloring failed', error);
                return uniqueTokens.map(() => untrustedAnkiLookupResult());
            });
        return roots => {
            void lookups.then(resolved => {
                if (!this.shouldRunAnkiBackgroundWork()) return;
                this.applyAnkiLookupsToRenderedWords(uniqueTokens, resolved, roots);
            });
        };
    }

    private async prepareAnkiWordEnrichmentBeforeRender(tokens: JPDBToken[]): Promise<(roots: ParentNode[]) => void> {
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return () => undefined;
        const uniqueTokens = uniqueTokensByCard(tokens);
        const lookups = await this.anki.findCachedStatusBatch(uniqueTokens.map(token => token.card))
            .catch(error => {
                log.warnOnce('background-anki-coloring-failed', 'Anki background coloring failed', error);
                return uniqueTokens.map(() => untrustedAnkiLookupResult());
            });
        return roots => {
            if (!this.shouldRunAnkiBackgroundWork()) return;
            this.applyAnkiLookupsToRenderedWords(uniqueTokens, lookups, roots);
        };
    }

    private async enrichAnkiWords(tokens: JPDBToken[], roots: ParentNode[] = [document]): Promise<void> {
        if (!tokens.length || !this.shouldRunAnkiBackgroundWork()) return;
        const uniqueTokens = uniqueTokensByCard(tokens);
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
        if (this.isDestroyed || !this.shouldRunPitchOrReadingEnrichment()) return;
        const seen = new Set<string>();
        const tokensNeedingLookup = tokens.filter(token => !this.applyCachedPublicVocabularyToToken(token));
        const uniqueTokens = tokensNeedingLookup.filter(token => {
            if (token.card.pitchAccent.length) return false;
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
            return;
        }

        if (options.urgent && typeof options.publicLookupLimit !== 'number') {
            const urgentTokens = uniqueTokens.map(token => this.takeQueuedPitchEnrichmentToken(cardKey(token.card)) ?? token);
            await runLimited(urgentTokens, BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, options));
            return;
        }

        if (typeof options.publicLookupLimit === 'number') {
            const publicLookupLimit = Math.max(0, Math.floor(options.publicLookupLimit));
            const requestedPublicTotal = Math.max(publicLookupLimit, Math.floor(options.publicLookupTotalLimit ?? uniqueTokens.length));
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
        return this.settings.showPitchAccent || (this.settings.showFurigana && this.settings.furiganaMode !== 'off');
    }

    private async resolvePublicFallbackPitchTokens(
        tokens: JPDBToken[],
        options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {},
    ): Promise<JPDBToken[]> {
        if (this.isJitenApiActive()) return tokens;
        const queuedTokens: JPDBToken[] = [];
        const fallbackGroups = new Map<string, { card: JPDBCard; tokens: JPDBToken[] }>();
        const jitenGroups = new Map<string, { card: JPDBCard; tokens: JPDBToken[] }>();
        for (const token of tokens) {
            if (token.card.source === 'fallback') {
                const key = cardKey(token.card);
                if (!options.urgent && this.unresolvedFallbackVocabularyCache.has(key)) continue;
                const group = fallbackGroups.get(key) ?? { card: token.card, tokens: [] };
                group.tokens.push(token);
                fallbackGroups.set(key, group);
                continue;
            }
            if (isHydratablePublicJitenCard(token.card)) {
                const key = cardKey(token.card);
                if (!options.urgent && this.unresolvedFallbackVocabularyCache.has(key)) continue;
                const group = jitenGroups.get(key) ?? { card: token.card, tokens: [] };
                group.tokens.push(token);
                jitenGroups.set(key, group);
                continue;
            }
            {
                queuedTokens.push(token);
                continue;
            }
        }
        if (!fallbackGroups.size && !jitenGroups.size) return queuedTokens;

        const resolved = new Map<string, JPDBCard>();
        const [fallbackCards, jitenCards] = await Promise.all([
            fallbackGroups.size
                ? this.publicLookupFallbackCards([...fallbackGroups.values()].map(group => group.card), options)
                : Promise.resolve(new Map<string, JPDBCard>()),
            jitenGroups.size
                ? this.publicLookupHydratableJitenCards([...jitenGroups.values()].map(group => group.card))
                : Promise.resolve(new Map<string, JPDBCard>()),
        ]);
        fallbackCards.forEach((card, key) => resolved.set(key, card));
        jitenCards.forEach((card, key) => resolved.set(key, card));
        const cardsToCache: JPDBCard[] = [];
        const localOnlyTokens: JPDBToken[] = [];
        for (const [key, group] of [...fallbackGroups, ...jitenGroups]) {
            const card = resolved.get(key);
            if (!card || card.source === 'fallback') {
                this.rememberUnresolvedFallbackVocabulary(key);
                localOnlyTokens.push(...group.tokens);
                continue;
            }
            cardsToCache.push(card);
            for (const token of group.tokens) {
                const fallback = token.card;
                const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
                if (fallback.source === 'fallback') this.rememberResolvedFallbackVocabulary(fallback, card);
                this.applyResolvedPitchCardToToken(token, fallback, card, pitchClass);
                this.queueSubtitleParsedHtmlRefresh(token.sentence);
            }
        }
        if (cardsToCache.length) this.parser.cacheCards?.(cardsToCache);
        if (localOnlyTokens.length) {
            await runLimited(
                localOnlyTokens,
                LOCAL_PITCH_ENRICHMENT_CONCURRENCY,
                token => this.enrichPitchToken(token, { publicLookup: false }),
            );
        }
        return queuedTokens;
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
            const batch = this.deferredPublicPitchQueue.splice(0, DEFERRED_PUBLIC_PITCH_ENRICHMENT_CHUNK_SIZE);
            batch.forEach(token => this.deferredPublicPitchQueuedKeys.delete(cardKey(token.card)));
            await this.enrichPitchWords(batch, { publicLookupLimit: batch.length });
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
        const card = this.resolvedFallbackVocabularyCache.get(cardKey(token.card));
        if (!card) return false;
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || 'unknown';
        this.applyPublicVocabularyToRenderedWords(token.card, card, pitchClass);
        token.card = card;
        token.pitchClass = pitchClass;
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
        if (this.pitchEnrichmentDrain) return this.pitchEnrichmentDrain;
        this.pitchEnrichmentDrain = this.runPitchEnrichmentQueue().finally(() => {
            this.pitchEnrichmentDrain = undefined;
            if (!this.isDestroyed && this.shouldRunPitchOrReadingEnrichment() && this.pitchEnrichmentQueue.length) void this.drainPitchEnrichmentQueue();
        });
        return this.pitchEnrichmentDrain;
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
            await runLimited(chunk, LOCAL_PITCH_ENRICHMENT_CONCURRENCY, token => this.enrichPitchToken(token, options));
            if (index + PITCH_ENRICHMENT_LIMIT < tokens.length) await this.waitForIdle();
        }
    }

    private async fillCardPitchFromLocalDictionary(card: JPDBCard): Promise<void> {
        if (cardHasContextPitch(card)) return;
        const localPitch = await this.localPitchAccentForCard(card);
        if (localPitch.length) card.pitchAccent = mergePitchPatterns(localPitch, card.pitchAccent);
    }

    private async enrichPitchToken(token: JPDBToken, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {}): Promise<void> {
        const fallback = token.card;
        const previousPitchClass = token.pitchClass ?? '';
        const card = await this.pitchEnrichedRenderedCard(fallback, options);
        const pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling);
        if (card !== fallback) {
            this.applyResolvedPitchCardToToken(token, fallback, card, pitchClass);
            this.queueSubtitleParsedHtmlRefresh(token.sentence);
            return;
        }
        this.applyPitchClassToFallbackToken(token, card, pitchClass);
        if (pitchClass && pitchClass !== previousPitchClass) this.queueSubtitleParsedHtmlRefresh(token.sentence);
    }

    private async pitchEnrichedRenderedCard(fallback: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>): Promise<JPDBCard> {
        await this.fillCardPitchFromLocalDictionary(fallback);
        const card = await this.resolvePitchFallbackCard(fallback, options);
        if (card !== fallback) await this.fillCardPitchFromLocalDictionary(card);
        await this.ensureCardPitchAccent(card, options);
        return card;
    }

    private async resolvePitchFallbackCard(fallback: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>): Promise<JPDBCard> {
        if (cardHasContextPitch(fallback) || options.publicLookup === false) return fallback;
        return await this.resolveRenderedFallbackVocabulary(fallback, options) ?? fallback;
    }

    private async ensureCardPitchAccent(card: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'jpdbPublicLookup'>): Promise<void> {
        if (!this.settings.showPitchAccent) return;
        if (cardHasContextPitch(card) || options.publicLookup === false || options.jpdbPublicLookup === false) return;
        const pitchAccent = await this.jpdbPublicPitch.lookup(card.spelling, card.reading).catch(() => []);
        if (pitchAccent.length) card.pitchAccent = mergePitchPatterns(pitchAccent, card.pitchAccent);
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
        this.pitchEnrichmentQueuedOptions.clear();
        this.deferredPublicPitchQueue = [];
        this.deferredPublicPitchQueuedKeys.clear();
        this.deferredPublicPitchEnqueuedForUrl = 0;
        this.backgroundPublicPitchLookupBudgetHref = location.href;
        this.backgroundPublicPitchLookupBudgetUsed = 0;
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

    private async resolveRenderedFallbackVocabulary(card: JPDBCard, options: Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> = {}): Promise<JPDBCard | undefined> {
        if (card.source !== 'fallback') return undefined;
        const key = cardKey(card);
        if (!options.urgent && this.unresolvedFallbackVocabularyCache.has(key)) return undefined;
        const publicCard = await this.lookupFallbackApiCard(card, options);
        if (!publicCard) {
            this.rememberUnresolvedFallbackVocabulary(key);
            return undefined;
        }
        if (!publicCard.pitchAccent.length && options.jpdbPublicLookup !== false) {
            publicCard.pitchAccent = await this.jpdbPublicPitch.lookup(publicCard.spelling, publicCard.reading).catch(() => []);
        }
        this.rememberResolvedFallbackVocabulary(card, publicCard);
        this.parser.cacheCards?.([publicCard]);
        return publicCard;
    }

    private rememberResolvedFallbackVocabulary(fallback: JPDBCard, card: JPDBCard): void {
        if (fallback.source !== 'fallback') return;
        const key = cardKey(fallback);
        this.unresolvedFallbackVocabularyCache.delete(key);
        this.resolvedFallbackVocabularyCache.delete(key);
        this.resolvedFallbackVocabularyCache.set(key, card);
        evictOldestStringKeysWhileOverLimit(this.resolvedFallbackVocabularyCache, RESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT);
        this.scheduleCachedPublicVocabularyHydration(document, { fallback, card });
    }

    private rememberUnresolvedFallbackVocabulary(key: string): void {
        this.unresolvedFallbackVocabularyCache.delete(key);
        this.unresolvedFallbackVocabularyCache.add(key);
        evictOldestStringKeysWhileOverLimit(this.unresolvedFallbackVocabularyCache, UNRESOLVED_FALLBACK_VOCABULARY_CACHE_LIMIT);
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
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return 'Uchisen';
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

    private applyPitchAccentToRenderedWords(
        card: JPDBCard,
        pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling),
        roots: ParentNode[] = [document],
    ): void {
        if (!pitchClass) return;
        const selector = `.jpdb-reader-word[data-vid="${card.vid}"][data-sid="${card.sid}"]`;
        this.pauseAutoScanObserver(() => {
            const changedRoots = new Set<ParentNode>();
            roots.forEach(root => {
                if (root instanceof HTMLElement && root.matches(selector)) {
                    this.applyPitchClassToRenderedSurface(root, pitchClass);
                    changedRoots.add(root);
                }
                root.querySelectorAll<HTMLElement>(selector).forEach(word => {
                    this.applyPitchClassToRenderedSurface(word, pitchClass);
                    changedRoots.add(word.parentElement ?? word);
                });
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

    private scheduleCachedPublicVocabularyHydration(root: ParentNode, resolved?: { fallback: JPDBCard; card: JPDBCard }): void {
        if (resolved) {
            // A single card just resolved: patch only its own rendered spans
            // instead of re-scanning the whole document. On a keyless transcript
            // fallback cards resolve in a continuous stream, and a full-document
            // querySelectorAll sweep per resolution is the open-sidebar long
            // task. The selector is vid/sid-scoped, so this is
            // O(occurrences-of-this-card); the cascade below still backfills
            // words that render after their card resolved.
            this.applyPublicVocabularyToRenderedWords(resolved.fallback, resolved.card);
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

    private applyPublicVocabularyToRenderedWord(word: HTMLElement, card: JPDBCard, pitchClass: string): void {
        this.renderedWordIndex.get(renderedWordElementKey(word))?.delete(word);
        this.applyPitchClassToRenderedSurface(word, pitchClass);
        setRenderedWordCardIdentity(word, card);
        this.registerRenderedWord(word);
        applyPublicVocabularyFurigana(word, card, this.settings);
    }

    private applyPitchClassToRenderedSurface(word: HTMLElement, pitchClass: string): void {
        setRenderedWordPitchClass(word, pitchClass);
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

    private resumePendingCloudSettingsSync(): void {
        const dialog = this.getSettingsDialog();
        if (dialog) void dialog.resumePendingCloudSettingsSync();
    }

    private getSettingsDialog(): SettingsDialogControllerInstance | undefined {
        const Controller = yomuSettingsDialogController();
        if (!Controller) {
            log.warnOnce('settings-companion-missing', 'Settings companion missing.');
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
        this.finishMountedPopoverLifecycle(popover, state.mode, options);
    }

    private popoverMountState(anchor: HTMLElement | undefined, options: MountPopoverOptions): PopoverMountState {
        const mode = options.mode ?? 'modal';
        const backdrop = options.stackOverSettings || mode === 'hover' || shouldUseSheet(this.settings) || !this.settings.popoverBackdropEnabled
            ? undefined
            : createReaderBackdrop(() => {
                // Clicking away keeps the page selection (the backdrop swallows the
                // selection-collapsing mousedown); remember it so the trailing
                // mouseup doesn't re-open the popover we just dismissed.
                this.rememberDismissedSelection();
                this.dismiss();
            });
        const resolvedAnchor = connectedElement(anchor) ?? connectedElement(this.activePopoverAnchor);
        const anchorRect = popoverAnchorRect(resolvedAnchor, this.activePopoverAnchorRect);
        const previousPopoverRect = options.preservePosition ? this.activePopover?.getBoundingClientRect() : undefined;
        const previousHoverPointerPosition = this.hoverPopoverPointerPosition;
        const mountParent = fullscreenPopoverMountParent(resolvedAnchor);
        return { mode, backdrop, mountParent, resolvedAnchor, anchorRect, previousPopoverRect, previousHoverPointerPosition };
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
        const mountParent = state.mountParent ?? document.body;
        popover.setAttribute('aria-modal', String(useBackdrop));
        if (state.backdrop) mountParent.append(state.backdrop, popover);
        else mountParent.append(popover);
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

    private finishMountedPopoverLifecycle(popover: HTMLElement, mode: 'modal' | 'hover', options: MountPopoverOptions): void {
        if (mode === 'hover') {
            this.installHoverPopoverLifecycle(popover);
            this.startHoverWatch();
            return;
        }
        if (options.focusOnMount === false) return;
        popover.focus();
    }

    private repositionActivePopover(): void {
        const popover = this.repositionableActivePopover();
        if (!popover) return;
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
                this.dismiss({
                    suppressHoverTarget: false,
                    deferSubtitleMiningResume: this.shouldDeferSubtitleMiningResumeForHoverClose(),
                });
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
        this.ocr.clearActiveLines();
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
        this.ocr.clearActiveLines();
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
        // Re-mounts during nested navigation (push-current) dismiss with
        // preserveNavigation:true — keep the video paused across them; only a
        // real close resumes. Without this gate, drilling into a sub-lookup
        // resumed playback mid-read.
        if (!options.preserveNavigation) {
            this.scheduleSubtitleMiningVideoResume(options.deferSubtitleMiningResume ? SUBTITLE_HOVER_MINING_RESUME_GRACE_MS : 0);
        }
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

function uniqueTokensByCard(tokens: JPDBToken[]): JPDBToken[] {
    const seen = new Set<string>();
    return tokens.filter(token => {
        const key = cardKey(token.card);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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

function waitForHoverCardInitialPaint(): Promise<void> {
    return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
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

function isYouTubeRuntimeHost(hostname = location.hostname): boolean {
    return isYouTubeHostname(hostname);
}

function isCompactPitchEnrichmentViewport(): boolean {
    return window.innerWidth <= 700 || navigator.maxTouchPoints > 1;
}

function pitchEnrichmentQueueOptions(
    options: Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'>,
): Pick<PitchEnrichmentOptions, 'publicLookup' | 'publicLookupTermLimit' | 'jpdbPublicLookup' | 'urgent'> {
    return {
        publicLookup: options.publicLookup,
        publicLookupTermLimit: options.publicLookupTermLimit,
        jpdbPublicLookup: options.jpdbPublicLookup,
        urgent: options.urgent,
    };
}

const SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE = /[\u3400-\u9fff々〆ヵヶ]|[\u30a0-\u30ffー]{2,}|[\u3040-\u309fー]{2,}/u;

function isSubstantivePublicPitchLookupToken(token: JPDBToken): boolean {
    const surface = token.sentence?.slice(token.start, token.end) ?? '';
    return SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE.test(token.card.spelling)
        || SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE.test(token.card.reading)
        || SUBSTANTIVE_PUBLIC_PITCH_LOOKUP_RE.test(surface);
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
    return Boolean(
        options.allowCandidateLookup
        || settings.jpdbDefinitionsEnabled
        || settings.showPitchAccent
        || (settings.showFurigana && settings.furiganaMode !== 'off'),
    );
}

function publicLookupSearchLimit(reading: string): number {
    return reading ? 12 : 1;
}

function publicLookupCardFromResults(cards: JPDBCard[], term: string, exact: boolean, reading: string): JPDBCard | undefined {
    if (reading) return cards.find(card => card.spelling === term && card.reading === reading);
    const exactMatch = cards.find(card => card.spelling === term || card.reading === term);
    return exactMatch ?? (exact ? undefined : cards[0]);
}

function publicJitenDetailLimit(requested: number): number {
    return Math.min(Math.max(0, Math.floor(requested)), PITCH_ENRICHMENT_LIMIT * 2);
}

function isHydratablePublicJitenCard(card: JPDBCard): boolean {
    return card.source === 'jiten'
        && Number.isFinite(card.jitenWordId ?? card.vid)
        && Number.isFinite(card.jitenReadingIndex ?? card.sid)
        && (!card.reading || !card.pitchAccent.length || !card.wordWithReading || !card.meanings.length);
}

interface FallbackLookupEntry {
    key: string;
    card: JPDBCard;
    terms: string[];
}

function uniqueFallbackLookupEntries(cards: readonly JPDBCard[], termLimit?: number): FallbackLookupEntry[] {
    const seen = new Set<string>();
    const entries: FallbackLookupEntry[] = [];
    for (const card of cards) {
        const key = cardKey(card);
        if (seen.has(key)) continue;
        seen.add(key);
        const allTerms = fallbackLookupTermsForCard(card);
        const terms = typeof termLimit === 'number'
            ? allTerms.slice(0, Math.max(1, Math.floor(termLimit)))
            : allTerms;
        if (!terms.length) continue;
        entries.push({ key, card, terms });
    }
    return entries;
}

function normalizedJitenLookupKey(term: string): string {
    return normalizedLookupText(term);
}

function uniquePointerTextSpans(spans: PointerTextSpanCandidate[]): PointerTextSpanCandidate[] {
    const seen = new Set<string>();
    return spans.filter(span => {
        const key = `${span.term}\n${span.start}\n${span.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function pointerSpanForResolvedCard(text: string, offset: number, span: PointerTextSpanCandidate, card: JPDBCard): PointerTextSpanCandidate {
    const surface = normalizedLookupText(text.slice(span.start, span.end));
    if (!surface) return span;
    const values = [...new Set([card.spelling, card.reading].map(normalizedLookupText).filter(Boolean))]
        .sort((first, second) => second.length - first.length);
    for (const value of values) {
        const relativeStart = surface.indexOf(value);
        if (relativeStart < 0) continue;
        const start = span.start + relativeStart;
        const end = start + value.length;
        if (offset < start || offset >= end) continue;
        return { ...span, start, end };
    }
    return span;
}

// "Has pitch" for enrichment means a pattern that actually fits the card's
// contextual reading; a Jiten/local pattern for a different reading (e.g.
// dictionary form) should still fall through to the JPDB pitch lookup.
function cardHasContextPitch(card: JPDBCard): boolean {
    if (!card.pitchAccent.length) return false;
    const reading = cardPronunciationReading(card);
    if (!reading) return true;
    return Boolean(contextPitchPattern(card.pitchAccent, reading));
}

function mergePitchPatterns(preferred: string[], existing: string[]): string[] {
    return [...preferred, ...existing.filter(pattern => !preferred.includes(pattern))];
}

function jitenFallbackTokenMatches(term: string, token: JPDBToken): boolean {
    const normalizedTerm = normalizedLookupText(term);
    const tokenSurface = normalizedLookupText(token.sentence?.slice(token.start, token.end) ?? '');
    return tokenSurface === normalizedTerm
        || normalizedLookupText(token.card.spelling) === normalizedTerm
        || normalizedLookupText(token.card.reading) === normalizedTerm;
}
