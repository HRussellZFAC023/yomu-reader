import { createWindowCustomEvent } from '../platform/window-events';
import { currentFullscreenElement } from '../core/fullscreen';
import { READER_ROOT_SELECTOR } from '../dom/constants';
import { escapeHtml, renderTokensToHtml, setInnerHtml, unwrapReaderWords } from '../dom/index';
import {
    cueHasExactWordTimings,
    escapeWithBreaks,
    findActiveSubtitleCue,
    findInitialLeadInCue,
    findAlignedCue,
    normalizeSubtitleCues,
    parseSubtitleText,
    subtitleCueSignature,
    withBreaks,
    type SubtitleCue,
    type SubtitleWordTiming,
} from './subtitle-cues';
import {
    TRANSCRIPT_PANEL_MARGIN,
    applyTranscriptPanelLayout,
    computeSubtitleDrawerLayout,
    loadSubtitleDragOffsetFraction,
    loadTranscriptPanelSize,
    reachableSubtitleBottomPercent,
    saveSubtitleDragOffsetFraction,
    saveTranscriptPanelSize,
    shouldUseCompactSubtitleDrawer,
    type SubtitleDrawerLayoutOptions,
    type TranscriptPanelLayout,
} from './subtitle-layout';
import { setClassState, shouldHonorExplicitYouTubeSideLayout, shouldPreservePlainSubtitleSelection } from './subtitle-dom-state';
import { collectPageSubtitleSources, normalizedSubtitleUrl, sameSubtitleUrl, type PageSubtitleSource } from './subtitle-sources';
import {
    applyStableYouTubePlayerVideoSize,
    clearStableYouTubePlayerVideoSize,
    createSubtitleVideoInsetAdapter,
    isYouTubeShortsLikePlayer,
    resizeYouTubePlayerForSubtitleLayout,
    subtitleVisibleViewportSize,
    subtitleVideoLayoutRect,
    subtitleVideoLayoutTarget,
    transcriptAvoidanceTarget,
    type SubtitleVideoInsetAdapter,
    type SubtitleVideoInsetResizeEventMode,
    type SubtitleVideoInsetSide,
} from './subtitle-video-inset';
import {
    activateYouTubeCaptionTrack,
    discoverCurrentYouTubeCaptionTracks,
    getYouTubeVideoId,
    isYouTubeOwnedVideoElement,
    isYouTubePage,
    shouldRefreshYouTubeTrackUrl,
    type YouTubeCaptionTrackCandidate,
    youtubeCaptionTrackIdentity,
    youtubeVideoHasNativeCaptions,
} from './subtitle-youtube';
import { installSubtitleFullscreenRedirect } from './subtitle-fullscreen-redirect';
import {
    ensureTextTrackReadable,
    getTextTrackCueText,
    loadSubtitleTrackCues,
    readTextTrackCues,
    waitForTextTrackCues,
    type SubtitleTrackLoadOptions,
} from './subtitle-track-loader';
import { isSubtitleTrackLanguage, isTargetLanguageSubtitleTrack } from './subtitle-track-metadata';
import { renderSubtitleTrackPanel, subtitleAnimeSearchQuery, subtitleDrawerMetaText } from './subtitle-track-panel';
import {
    resolveSubtitleLanguageContext,
    subtitleContentLanguage,
    subtitleLanguageContextKey,
    type SubtitleLanguageContext,
} from './subtitle-language-context';
import {
    automaticSubtitleLanguagePair,
    disableSubtitleTextTrack,
    planSubtitleLanguageReconciliation,
    subtitleLanguageActions,
    type SubtitleLanguageAction,
} from './subtitle-language-reconciliation';
import { renderSubtitleShadowActions, renderSubtitleShadowCueCard } from './subtitle-shadow-rendering';
import {
    hasSelectedSubtitleTrackOrLines,
    subtitleDrawerButtonState,
    subtitleTrackPanelState,
    syncSubtitleDrawerButton,
    syncSubtitleLineNavigationButton,
    syncSubtitleTrackStatus,
    syncTranscriptPlacementButtons,
} from './subtitle-panel-actions';
import { applySubtitleNativeTrackModes, reconcileSubtitleNativeTrackModes, releaseDepartedSubtitleNativeTrackModes,
    releaseSubtitleNativeTrackModes, snapshotSubtitleNativeTrackModes, type SubtitleNativeTrackModeSnapshot } from './subtitle-native-track-modes';
import { mirrorNativeFullscreenCues } from './subtitle-native-fullscreen';
import {
    applySubtitleStyleControl,
    resetSubtitleStyleSettings,
    syncNativeSubtitleBlurVariables,
    syncSubtitleStylePopoverControls,
} from './subtitle-style-controls';
import {
    canUseDomCaptionFallback as canUseSubtitleDomCaptionFallback,
    mutationCouldAffectVideoDiscovery,
    mutationInsideReaderRoot,
    shouldHideSubtitleRoot,
    shouldKeepIdleControlClass,
    subtitleSourceContextKey,
} from './subtitle-player-context';
import {
    SUBTITLE_SECONDARY_CLASS,
    TOGGLE_NATIVE_BLUR_ACTION,
    reconcileSubtitlePrimaryRow,
    reconcileSubtitleSecondaryLine,
    renderSubtitlePrimary,
    syncSubtitleSecondaryBlurState,
} from './subtitle-rendering';
import {
    isStalePageSubtitleTrack,
    loadedTrackState,
    updatePageSubtitleTrack,
    type LoadedSubtitleTrackSelection,
    type SubtitleTrackOption,
    type SubtitleTrackSelectionLoadRequest,
    type SubtitleTrackSelectionRole,
} from './subtitle-track-options';
import {
    autoSelectableNativeTrackRole,
    autoSelectablePageTrackRole,
    createPageSubtitleTrack,
    ensureTranslatedTargetTrack,
    planYouTubeTrackDiscovery,
    readHostedSubtitleFileText,
    subtitleFilePickerJobs,
    subtitleFilesFromHostEvent,
    type HostedSubtitleFileLoadRequest,
    type YouTubeTrackDiscoverySelection,
} from './subtitle-track-selection';
import { settleSubtitleSelectionFailure, SubtitleSelectionLifecycle } from './subtitle-selection-lifecycle';
import { planTranscriptHydrationIndexes } from './subtitle-transcript-hydration';
import { readPageCaptionText } from './subtitle-dom-captions';
import { copyText, isEditableTarget } from '../ui/browser';
import {
    canParseSubtitleTranscriptRows,
    authoritativeSubtitleParseOptions,
    hasAttemptedTranscriptParse,
    parsedSubtitleHtmlHasReaderWords,
    provisionalSubtitleParseOptions,
    shouldApplyParsedTranscriptHtml,
    subtitleParseOptions,
    waitForBackgroundTranscriptParseTurn,
    type SubtitleParseOptions,
} from './subtitle-parse-policy';
import { SubtitlePinnedPlayerTracker } from './subtitle-pinned-player';
import { renderControllerPrimarySubtitle } from './subtitle-primary-render';
import {
    planProvisionalSubtitleParseBatch,
    planSubtitleParseBatch,
    type ParsedSubtitleHtmlResult,
    type SubtitleParseBatchItem,
} from './subtitle-parse-batch';
import { requestSubtitleText as defaultRequestSubtitleText, subtitleRequestFailureDetails } from './subtitle-request';
import {
    buildSubtitleBatchMiningCandidates,
    subtitleBatchMiningSummary,
    subtitleBatchMiningTsv,
    type SubtitleBatchMiningCandidate,
    type SubtitleBatchMiningRow,
} from './subtitle-batch-mining';
import { formatSubtitleText, subtitleText } from './i18n';
import {
    renderSubtitleBatchMiningPanel,
    type SubtitleBatchMiningGradeOption,
    type SubtitleBatchMiningStatus,
} from './subtitle-batch-mining-panel';
import {
    applyElementLayout,
    compareSubtitleVideoCandidates,
    isSubtitleOverlayVideoVisible,
    isSubtitleVideoElementRenderable,
    renderDrawerHead,
    renderSubtitleStyleControls,
    type PanelOptionsControlsState,
    setStylePropertyIfChanged,
    subtitleIcon,
    subtitleOverlayLayout,
    type SubtitlePanelMode,
} from './subtitle-surface';
import { bindSubtitleControlRail, type SubtitleControlRailBinding } from './subtitle-control-rail';
import { isTranscriptScrollIntentKey, TranscriptFollowState } from './transcript-follow-state';
import {
    TRANSCRIPT_PANEL_ANIMATION_MS,
    TRANSCRIPT_PANEL_MIN_SIDE_WIDTH,
    minimumSideTranscriptPlayerWidth,
    shouldUseBottomTranscriptLayoutForAvailableWidth,
    transcriptResizeBounds,
    transcriptResizeHandleMetrics,
    transcriptResizeKeyboardDirection,
    transcriptResizePatchForKeyboard,
    transcriptResizePatchForPointerDrag,
} from './subtitles-transcript-resize';
import { LOAD_SUBTITLE_FILES_EVENT, OPEN_SUBTITLE_TRACKS_EVENT } from '../app/constants';
import { uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { accentToRgba, DEFAULT_SETTINGS, matchesShortcut, NO_EXPLICIT_USER_CHOICE } from '../settings/index';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { primaryCardState } from '../cards/state';
import {
    SubtitleParsedHtmlCache,
    SUBTITLE_PARSE_CACHE_MAX_ENTRIES,
    type SubtitleParsedCueHtmlWriteResult,
} from './parsed-html-cache';
import {
    SubtitleTranscriptPanel,
    type TranscriptPanelRenderState,
    type TranscriptPanelVirtualWindow,
    type TranscriptRow,
} from './transcript-panel';
import { SubtitleKaraokeSampler } from './karaoke-sampler';
import { prewarmSubtitleFirstPaint } from './subtitle-first-paint-prewarm';
import {
    SubtitleFullscreenHost,
    isMobileYouTubePage,
    mutationSwapsFullscreenHostCandidate,
} from './fullscreen-host';
import type { InterfaceLanguage, JPDBGrade, JPDBToken, ReaderSettings } from '../app/types';

export { requestSubtitleText } from './subtitle-request';

const YOUTUBE_SUBTITLE_NAVIGATION_EVENTS = [
    'yt-navigate-finish',
    'yt-page-data-updated',
    'yt-page-type-changed',
    'popstate',
    'hashchange',
] as const;
const SUBTITLE_FULLSCREEN_CHANGE_EVENTS = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange',
] as const;
const TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS = [
    'pointerdown',
    'pointerup',
    'pointercancel',
    'mousedown',
    'mouseup',
    'touchstart',
    'touchend',
    'touchcancel',
] as const;
const YOUTUBE_STABLE_TRANSCRIPT_CLASSES = [
    'jpdb-subtitle-youtube-stable-side',
    'jpdb-subtitle-youtube-stable-left',
    'jpdb-subtitle-youtube-stable-right',
    'jpdb-subtitle-youtube-stable-player-fallback',
    'jpdb-subtitle-youtube-stable-full-bleed',
] as const;
const YOUTUBE_STABLE_TRANSCRIPT_STYLE_PROPERTIES = [
    '--jpdb-subtitle-youtube-stable-offset',
    '--jpdb-subtitle-youtube-stable-player-width',
    '--jpdb-subtitle-youtube-stable-player-height',
] as const;
const ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR = '.asbplayer-subtitles-container-bottom';
const ASBPLAYER_SUBTITLE_ROOT_SELECTOR = `.asbplayer-offscreen, ${ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR}`;
const ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR = '[data-yomu-asb-subtitle-drag-handle="true"]';
const ASBPLAYER_SUBTITLE_DRAG_CLASSES = [
    'jpdb-subtitle-asb-movable',
    'jpdb-subtitle-has-lines',
    'jpdb-subtitle-controls-auto',
    'jpdb-subtitle-controls-always',
    'jpdb-subtitle-controls-hidden',
    'jpdb-subtitle-controls-idle',
    'jpdb-subtitle-dragging',
] as const;
const YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS = 'jpdb-subtitle-yt-sheet-open';
const NATIVE_FULLSCREEN_CUE_TRACK_LABEL = 'Yomu';
const SUBTITLE_NATIVE_CONTROL_SAFE_ZONE_ATTRIBUTE = 'data-jpdb-subtitle-native-control-safe-zone';
const SUBTITLE_ANNOTATIONS_PAUSED_CLASS = 'jpdb-subtitle-annotations-paused';
// Everything inside the click-through overlay that opts back into pointer
// events, and so has to stand down over a native player control.
const SUBTITLE_HIT_TESTED_OVERLAY_SELECTOR = `.jpdb-subtitle-primary,.jpdb-subtitle-primary .jpdb-reader-word,.${SUBTITLE_SECONDARY_CLASS},.${SUBTITLE_SECONDARY_CLASS} .jpdb-reader-word`;
const NATIVE_PLAYER_CONTROL_SELECTOR = 'button,[role="button"],a[href],[tabindex]:not([tabindex="-1"])';
const NATIVE_SUBTITLE_BLUR_CONTROL_SELECTOR = `[data-action="${TOGGLE_NATIVE_BLUR_ACTION}"]`;
// A drawer control under a finger must survive until its tap is delivered, but
// a stuck press must not freeze the drawer: past this the finger is resting,
// not tapping.
const PANEL_PRESS_RENDER_HOLD_MAX_MS = 700;

interface SubtitlePlayerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string, options?: SubtitleParseOptions) => Promise<JPDBToken[]>;
    parseJapaneseBatch?: (texts: string[], options?: SubtitleParseOptions) => Promise<JPDBToken[][]>;
    beforeRenderTokens?: (tokens: JPDBToken[]) => void | Promise<void>;
    afterParseTokens?: (tokens: JPDBToken[], roots?: ParentNode[]) => void;
    showBatchMiningCard?: (candidate: SubtitleBatchMiningCandidate) => void | Promise<void>;
    mineBatchMiningCandidates?: (candidates: SubtitleBatchMiningCandidate[]) => Promise<number>;
    gradeBatchMiningCandidates?: (candidates: SubtitleBatchMiningCandidate[], grade: JPDBGrade) => Promise<number>;
    toast?: (message: string) => void;
    onTranscriptPanelClosed?: () => void;
    onSettingsChange: (
        explicitUserChoiceKeys: readonly (keyof ReaderSettings)[],
        clearExplicitUserChoiceKeys?: readonly (keyof ReaderSettings)[],
    ) => void;
}

interface TranscriptPanelOptions {
    persist?: boolean;
    autoPause?: boolean;
    deferRender?: boolean;
    immediate?: boolean;
}

interface ShadowPanelRenderState {
    settings: ReaderSettings;
    cue?: SubtitleCue;
    secondary?: SubtitleCue;
    parseKey: string;
    signature: string;
}

interface ShadowParsedLine {
    html: string;
    parsedKeyAttribute: string;
    provisionalAttribute: string;
}

interface ParseCueHtmlOptions {
    allowProvisional?: boolean;
    enrichBeforeRender?: boolean;
    authoritativeUpgrade?: boolean;
    requireEnrichedProvisional?: boolean;
    refreshProvisional?: boolean;
}

type PendingProvisionalParse = Promise<string> & { yomuEnriched?: true };

function isYouTubeTheaterMode(): boolean {
    return isYouTubePage() && Boolean(document.querySelector('ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]'));
}

function hasOpenYouTubeMobileBottomSheet(): boolean {
    for (const app of Array.from(document.getElementsByTagName('ytm-app'))) {
        for (const sheet of Array.from(app.getElementsByTagName('bottom-sheet-container'))) {
            if (sheet.getAttribute('aria-modal') === 'true' && !sheet.hasAttribute('hidden')) return true;
        }
    }
    return false;
}

type FullscreenVideoElement = HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean;
    webkitPresentationMode?: string;
};

function subtitleViewportRect(): DOMRect {
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function videoIsInNativeFullscreen(video: HTMLVideoElement | undefined): boolean {
    if (!video) return false;
    const fullscreenVideo = video as FullscreenVideoElement;
    return Boolean(fullscreenVideo.webkitDisplayingFullscreen
        || (fullscreenVideo.webkitPresentationMode && fullscreenVideo.webkitPresentationMode !== 'inline'));
}

function subtitleTargetFontSize(settings: ReaderSettings): number {
    return Math.max(16, Math.min(64, settings.subtitleFontSize));
}

const DEFAULT_SUBTITLE_BOTTOM_OFFSET = DEFAULT_SETTINGS.subtitleBottomOffset;

function setDocumentStylePropertyIfChanged(element: HTMLElement, property: string, value: string): boolean {
    if (element.style.getPropertyValue(property) === value) return false;
    element.style.setProperty(property, value);
    return true;
}

function youtubeWatchPlayerMeaningfullyVisible(rect: DOMRect): boolean {
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 0);
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const ratio = visibleHeight / Math.max(1, rect.height);
    return visibleHeight >= Math.min(220, rect.height * 0.45) && ratio >= 0.45;
}

function subtitleSecondaryFontSize(target: number): number {
    return Math.max(13, Math.min(22, Math.round(target * 0.62)));
}

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function rectsOverlap(first: DOMRect, second: DOMRect): boolean {
    return first.right > second.left
        && second.right > first.left
        && first.bottom > second.top
        && second.bottom > first.top;
}

function nativePlayerControlIsInteractive(control: HTMLElement): boolean {
    if (control.hidden
        || control.getAttribute('aria-hidden') === 'true'
        || control.getAttribute('aria-disabled') === 'true'
        || control.matches(':disabled')) return false;
    const style = getComputedStyle(control);
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.pointerEvents !== 'none'
        && Number.parseFloat(style.opacity || '1') > .01;
}

// Position + size signature of the video's on-screen box, rounded so sub-pixel
// jitter does not churn alignment. Used to detect when the active video has
// moved (e.g. a Shorts reel swipe) without a resize/scroll/navigation event.
function videoRectKey(rect: DOMRect): string {
    return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`;
}

function renderedTracksWindow(
    virtual: { start: number; end: number } | undefined,
    rowCount: number,
): { start: number; end: number; rowCount: number } | undefined {
    return virtual ? { start: virtual.start, end: virtual.end, rowCount } : undefined;
}

function clearWindowTimeout(id: number | undefined): undefined {
    if (id !== undefined) window.clearTimeout(id);
    return undefined;
}

function clearWindowAnimationFrame(id: number | undefined): undefined {
    if (id !== undefined) window.cancelAnimationFrame(id);
    return undefined;
}

// requestVideoFrameCallback gives a sample on every presented video frame
// (iOS Safari 15.4+, Chrome). Feature-detected so the cue/karaoke sampler can
// fall back to requestAnimationFrame where it is missing.
interface RequestVideoFrameCallbackHost {
    requestVideoFrameCallback(callback: (now: number, metadata: unknown) => void): number;
    cancelVideoFrameCallback(handle: number): void;
}
function videoFrameCallbackHost(video: HTMLVideoElement): RequestVideoFrameCallbackHost | null {
    const candidate = video as unknown as Partial<RequestVideoFrameCallbackHost>;
    return typeof candidate.requestVideoFrameCallback === 'function'
        && typeof candidate.cancelVideoFrameCallback === 'function'
        ? (candidate as RequestVideoFrameCallbackHost)
        : null;
}

function frameHasPlayerControls(frame: HTMLElement): boolean {
    return Boolean(frame.querySelector([
        'button',
        '[role="button"]',
        '[aria-label*="play" i]',
        '[aria-label*="pause" i]',
        '[class*="control" i]',
        '[class*="controls" i]',
        '[class*="play" i]',
        '[class*="pause" i]',
    ].join(',')));
}

// Behind matters for the previous-line button: keep enough parsed history
// that stepping back always hits the cache.
const SUBTITLE_ACTIVE_PREPARSE_BEHIND = 6;
const SUBTITLE_ACTIVE_PREPARSE_AHEAD = 10;
const SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS = 2500;
// Delay before a request to fully hide the rail is committed. A genuine idle
// or chrome-fade persists well past this; a strobing hover-autoplay signal
// settles back to "visible" first, so the pending hide is re-checked against
// live state at commit and abandoned — the rail stops flickering.
const SUBTITLE_CONTROLS_AWAY_COMMIT_DELAY_MS = 320;
const SUBTITLE_TIMING_OFFSET_STEP_SECONDS = 0.1;
const SUBTITLE_TIMING_OFFSET_MAX_SECONDS = 300;
const TRANSCRIPT_ACTIVE_HYDRATION_BEHIND = 1;
const TRANSCRIPT_ACTIVE_HYDRATION_AHEAD = 3;
const TRANSCRIPT_HYDRATION_MAX_ROWS = 12;
const TRANSCRIPT_BACKGROUND_HYDRATION_BATCH = 4;
const TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY = 2;
const TRANSCRIPT_BACKGROUND_PARSE_BATCH = 8;
const TRANSCRIPT_BACKGROUND_PARSE_AHEAD = 32;
const TRANSCRIPT_BACKGROUND_PARSE_BEHIND = 6;
const YOUTUBE_TRANSCRIPT_CHEAP_WARMUP_ROW_THRESHOLD = 240;
const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT = 96;
const TRANSCRIPT_BACKGROUND_PARSE_LIMIT = SUBTITLE_PARSE_CACHE_MAX_ENTRIES;
const TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE = 8;
const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS = 120;
// Cues near the playhead must colorise immediately; only the whole-transcript
// tail of the warmup queue is paced.
const TRANSCRIPT_WARMUP_PRIORITY_ROWS = 48;
const TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD = 64;
const TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX = 80;
const TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS = 3;
const TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS = 21;
const BATCH_MINING_PARSE_BATCH = 24;
// The Tracks panel scroll container starts with a fixed tools/summary/hint
// block above the rows; this estimate maps scrollTop to a row index. It only
// needs to be within an overscan window of the truth, so a fixed value is fine.
const TRACKS_VIRTUAL_HEADER_PX = 140;
const TRANSCRIPT_AUTO_SCROLL_RESUME_FALLBACK_SECONDS = 30;
const TRANSCRIPT_AUTO_SCROLL_RESUME_LEGACY_DEFAULT_SECONDS = 4;
// Housekeeping cadence while playing (track discovery, realign backstop, chrome
// idle). Cue + karaoke precision is owned by the per-frame sampler
// (startFrameSync), so this no longer needs to run at 250ms.
const SUBTITLE_TICK_ACTIVE_MS = 500;
const SUBTITLE_TICK_PAUSED_MS = 600;
const SUBTITLE_TICK_IDLE_MS = 1500;
// Cue-list additions fire no TextTrack event, so a bounded forced re-read is
// the only way to observe them; everything event-observable marks the dirty
// flag instead of paying the full per-tick re-read.
const SUBTITLE_TICK_FORCED_CUE_REFRESH_MS = 5000;
const SUBTITLE_FRAME_GEOMETRY_SYNC_MS = 120;
// WebKit/native-fullscreen players can remove one <video> a frame or two
// before inserting its replacement. Keep the painted cue through that
// hand-off instead of treating the empty discovery sample as media removal.
const SUBTITLE_VIDEO_CANDIDATE_LOSS_GRACE_MS = 1800;
const TRANSCRIPT_DEFERRED_RENDER_DELAY_MS = 500;
const SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS = 1000;
const TRANSCRIPT_SMOOTH_FOLLOW_MAX_ROWS = 3;
const YOUTUBE_CAPTION_ACTIVATION_RETRY_MS = 2000;
const DOM_CAPTION_STABLE_DELAY_MS = 180;
const DOM_CAPTION_MISSING_GRACE_MS = 1200;
const PLAYBACK_PAUSE_REASSERT_WINDOW_MS = 800;
const YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY = 'youtube-dom-caption-fallback';
const SUBTITLE_FILE_ACCEPT = [
    '.srt',
    '.vtt',
    '.ass',
    '.ssa',
    'text/vtt',
    'text/plain',
    'text/x-subrip',
    'text/x-ssa',
    'text/x-ass',
    'application/x-subrip',
    'application/srt',
].join(',');
const log = Logger.scope('Subtitles');
interface YouTubePlayerApi {
    seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
    pauseVideo?: () => void;
}
const TRACK_LOAD_OPTIONS: Omit<SubtitleTrackLoadOptions<SubtitleTrackOption>, 'tracks' | 'transcriptEligible'> = {
    requestText: defaultRequestSubtitleText,
    onYouTubeRequestError: (track, url, error) => log.debug('YouTube subtitle request failed', {
        label: track.label,
        ...subtitleRequestFailureDetails(url),
        error,
    }),
};

interface SubtitleDragSession {
    handle: HTMLElement;
    dragFrame: HTMLElement;
    dragRoot?: HTMLElement;
    mode: 'bottom-offset' | 'transform';
    startY: number;
    startOffset: number;
    startBottomOffset: number;
    referenceHeight: number;
    bounds: { min: number; max: number };
    lastClientY: number;
    frame?: number;
    previewBottomOffset?: number;
    previewOffset?: number;
    appliedClientY?: number;
}

interface TranscriptRowHydrationTarget {
    cue: SubtitleCue;
    rowIndex: number;
    target: HTMLElement;
    key: string;
}

interface TranscriptParseItem {
    rowIndex: number;
    text: string;
    key: string;
}

interface TranscriptContextWindow {
    text: string;
    rowStart: number;
    rowEnd: number;
}

function transcriptWarmupIndexes(priority: number[], focusIndex: number, rowCount: number): number[] {
    return [
        ...priority,
        ...forwardIndexes(focusIndex, Math.min(rowCount, focusIndex + TRANSCRIPT_BACKGROUND_PARSE_AHEAD)),
        ...backwardIndexes(focusIndex - 1, Math.max(0, focusIndex - TRANSCRIPT_BACKGROUND_PARSE_BEHIND)),
        // Then warm the whole transcript (lowest priority) so ruby is ready ahead
        // of playback instead of appearing line-by-line as cues become active.
        ...forwardIndexes(0, rowCount),
    ];
}

function uniqueSubtitleParseTexts(texts: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const text of texts.map(value => value.trim()).filter(Boolean)) {
        if (seen.has(text)) continue;
        seen.add(text);
        result.push(text);
    }
    return result;
}

function isTranscriptContextJoinChar(value: string | undefined): boolean {
    return Boolean(value && /[\u3040-\u30ff\u3400-\u9fff々〆〤ー]/u.test(value));
}

function lastTextChar(value: string): string | undefined {
    return value.trimEnd().at(-1);
}

function firstTextChar(value: string): string | undefined {
    return value.trimStart().charAt(0) || undefined;
}

function forwardIndexes(start: number, endExclusive: number): number[] {
    const indexes: number[] = [];
    for (let index = start; index < endExclusive; index++) indexes.push(index);
    return indexes;
}

function backwardIndexes(start: number, endInclusive: number): number[] {
    const indexes: number[] = [];
    for (let index = start; index >= endInclusive; index--) indexes.push(index);
    return indexes;
}

function shouldReplaceLoadedCue(next: SubtitleCue | undefined, current: SubtitleCue | undefined): next is SubtitleCue {
    return Boolean(next && next !== current);
}

function shouldClearLoadedCue(next: SubtitleCue | undefined, current: SubtitleCue | undefined, time: number): boolean {
    // Past the end (grace for boundary flicker) or before the start: the
    // latter happens on backward seeks into a gap, where keeping the stale
    // cue also left the parse-warmup window anchored at the old position.
    return Boolean(!next && current && (time > current.end + 0.12 || time < current.start - 0.12));
}

function normalizeSubtitleTimingOffsetSeconds(value: number | undefined): number {
    if (!Number.isFinite(value)) return 0;
    const clamped = Math.max(-SUBTITLE_TIMING_OFFSET_MAX_SECONDS, Math.min(SUBTITLE_TIMING_OFFSET_MAX_SECONDS, value ?? 0));
    const rounded = Math.round(clamped * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function offsetSubtitleCues(cues: SubtitleCue[], offsetSeconds: number): SubtitleCue[] {
    const offset = normalizeSubtitleTimingOffsetSeconds(offsetSeconds);
    if (!cues.length || !offset) return cues;
    return cues.map(cue => offsetSubtitleCue(cue, offset));
}

function offsetSubtitleCue(cue: SubtitleCue, offsetSeconds: number): SubtitleCue {
    return {
        ...cue,
        start: cue.start + offsetSeconds,
        end: cue.end + offsetSeconds,
        words: cue.words?.map(word => offsetSubtitleWordTiming(word, offsetSeconds)),
    };
}

function offsetSubtitleWordTiming(word: SubtitleWordTiming, offsetSeconds: number): SubtitleWordTiming {
    return {
        ...word,
        start: word.start + offsetSeconds,
        end: word.end + offsetSeconds,
    };
}

function adjacentSubtitleCueForOffset(cues: SubtitleCue[], time: number, offsetSeconds: number, forward: boolean): SubtitleCue | undefined {
    let adjacentIndex = -1;
    let minDiff = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        const start = cue.start + offsetSeconds;
        const end = cue.end + offsetSeconds;
        const diff = forward ? start - time : time - start;
        if (minDiff <= diff) continue;
        if (forward && time < start) {
            minDiff = diff;
            adjacentIndex = index;
        } else if (!forward && time > start) {
            minDiff = diff;
            adjacentIndex = time < end ? Math.max(0, index - 1) : index;
        }
    }
    return adjacentIndex >= 0 ? cues[adjacentIndex] : undefined;
}

function subtitleClipboardText(primary: SubtitleCue | undefined, secondary: SubtitleCue | undefined, includeTranslation: boolean): string {
    // UT-68: "include translation" is the user's call — jp-only copy stays
    // clean for mining/SRS workflows.
    return [primary?.text.trim(), includeTranslation ? secondary?.text.trim() : ''].filter(Boolean).join('\n');
}

// UT-68a: a subtle "copied" confirmation on the pressed control.
function flashSubtitleCopyFeedback(target: HTMLElement): void {
    const button = target.closest<HTMLElement>('button') ?? target;
    button.classList.add('jpdb-subtitle-copy-flash');
    window.setTimeout(() => button.classList.remove('jpdb-subtitle-copy-flash'), 1200);
}

export class SubtitlePlayerController {
    private root?: HTMLElement;
    private subtitleEl?: HTMLElement;
    private transcriptPanel?: HTMLElement;
    private abortController?: AbortController;
    private video?: HTMLVideoElement;
    private playbackPauseReassert?: { off: () => void };
    private cues: SubtitleCue[] = [];
    private secondaryCues: SubtitleCue[] = [];
    private tracks: SubtitleTrackOption[] = [];
    private currentCue?: SubtitleCue;
    private secondaryCue?: SubtitleCue;
    private observer?: MutationObserver;
    // The document observer runs in one of three modes so an idle subtitle
    // feature stops paying a busy SPA's mutation cost. 'full' (a video is
    // bound) watches attributes+childList for fullscreen/bottom-sheet/discovery
    // work; 'discovery' (enabled, no video yet) watches childList only, purely
    // to notice a video appearing; 'off' (disabled, no video) installs nothing.
    private observerMode: 'full' | 'discovery' | 'off' = 'off';
    // init() has wired the runtime signals. Guards the refresh()/bind-driven
    // re-sync so the install()-only test harness (which never calls init) keeps
    // its historical no-observer, no-tick behaviour.
    private runtimeSignalsInitialized = false;
    private videoResizeObserver?: ResizeObserver;
    private subtitleControlRail?: SubtitleControlRailBinding;
    private lastPlayerChromeHidden = false;
    private discoverTimer?: number;
    private videoCandidateLossTimer?: number;
    private tickTimer?: number;
    // Fullscreen top-layer host resolution + reader-root reparenting. Owns the
    // event-driven host-query cache; the controller keeps the fullscreen-state
    // bookkeeping and delegates host lookup/reparenting to it.
    private readonly fullscreenHost = new SubtitleFullscreenHost({
        getVideo: () => this.video,
        getRoot: () => this.root,
        getTranscriptPanel: () => this.transcriptPanel,
    });
    // Dirty-flag + forced-staleness gate for native cue-list re-reads.
    private nativeCueListsDirty = true;
    private lastForcedNativeCueRefreshAt = 0;
    // Per-frame cue/karaoke sampler (rVFC, rAF fallback). Armed only while the
    // bound video plays; cancelled on pause/seek-away/destroy/hidden.
    private frameSyncHandle?: number;
    private frameSyncVideo?: HTMLVideoElement;
    // `paused` describes user/media intent, not a network stall. Keep the
    // bound video's buffering clock separate so housekeeping cannot advance
    // cues while the browser's currentTime extrapolates without presenting a
    // frame. Only `playing` releases this snapshot.
    private bufferingPlayback?: { video: HTMLVideoElement; time: number };
    private lastFrameGeometrySampleAt = 0;
    // Word-level karaoke highlight progression (per-frame dirty-check + the
    // pending/current/spoken class pass over the rendered primary word spans)
    // lives in this collaborator; the controller keeps the frame/tick sampler
    // that decides when to sample and delegates the highlight pass to it.
    private readonly karaokeSampler = new SubtitleKaraokeSampler({
        getSubtitleElement: () => this.subtitleEl,
    });
    private alignFrame?: number;
    private alignAfterTranscriptResize = false;
    private lastAlignedVideoRectKey = '';
    private lastShortsNavVideoId = '';
    private destroyed = false;
    private selectedTrackId = '';
    private secondaryTrackId = '';
    private youtubeVideoId = '';
    private youtubeAutoSelectSuppressedVideoId = '';
    private lastDomCaption = '';
    private pendingDomCaption?: { text: string; firstSeenAt: number; parseSettled: boolean };
    private lastDomCaptionSeenAt = 0;
    // Parsed subtitle/transcript HTML caching (all tiers, TTL empties, in-flight
    // dedupe, token cache, session persistence, bounded eviction) lives in this
    // collaborator; the controller keeps the parse/render orchestration.
    private readonly htmlCache = new SubtitleParsedHtmlCache({
        getSettings: () => this.options.getSettings(),
        parseContextKey: () => subtitleLanguageContextKey(this.subtitleLanguageContext),
        shouldParseSubtitles: () => this.shouldParseSubtitles(),
        hasAuthoritativeParseTier: (settings?: ReaderSettings) => this.hasAuthoritativeParseTier(settings),
        transcriptRowCount: () => this.cues.filter(cue => cue.transcriptEligible !== false).length,
    });
    // Transcript (Lines) drawer DOM construction, per-row rendering, the row
    // translation-peek toggle, and the transcript list's DOM event handlers live
    // in this collaborator; the controller keeps the render orchestration
    // (render-state computation, hydration/warmup, virtualization, open/close
    // lifecycle, layout/positioning) and delegates the DOM-building surface to it.
    private readonly transcriptPanelSurface = new SubtitleTranscriptPanel({
        getSettings: () => this.options.getSettings(),
        getTracks: () => this.tracks,
        getSelectedTrackId: () => this.selectedTrackId,
        getSecondaryTrackId: () => this.secondaryTrackId,
        getSecondaryCues: () => this.secondaryCues,
        getTranscriptRows: () => this.transcriptRows(),
        getHtmlCache: () => this.htmlCache,
        getPanel: () => this.transcriptPanel,
        hasTranscriptSurface: () => this.hasTranscriptSurface(),
        panelOptionsState: (pausePanelEnabled, language) => this.panelOptionsState(pausePanelEnabled, language),
        transcriptRowParseKey: (row, rowIndex, rows, settings) => this.transcriptRowParseKey(row, rowIndex, rows, settings),
        isPanelOptionsMenuOpen: () => this.panelOptionsMenuOpen,
        closePanelOptionsMenu: () => this.closePanelOptionsMenu(),
        seekToTranscriptRow: index => this.seekToTranscriptRow(index),
        rowIndexFromTarget: target => this.rowIndexFromTarget(target),
        handleClick: event => this.handleClick(event),
    });
    private transcriptTextTargetsByParseKey = new Map<string, HTMLElement[]>();
    private renderSerial = 0;
    private lastRefreshAnnotationsPaused?: boolean;
    private panelMode: SubtitlePanelMode = 'lines';
    private lastTranscriptSignature = '';
    // Structure-only signature (see TranscriptPanelRenderState) committed by the
    // last full render. Lets an append-only cue-list growth be detected as
    // "only the row count grew" so it can patch the scroller's rows in place
    // instead of a full setInnerHtml(panel, ...) that would replace the
    // scroller and briefly paint a spacer-only, whitespace-band frame.
    private lastTranscriptStructureSignature = '';
    // The virtual window actually committed to the DOM by the last full render.
    // Reused while auto-following so consecutive active-line advances keep the
    // same window (stable signature -> cheap class-swap, no list re-render that
    // would recreate the active row and flicker its highlight).
    private renderedVirtualWindow?: { start: number; end: number; rowCount: number };
    private transcriptScrollFrame?: number;
    private transcriptHydrateFrame?: number;
    private transcriptDeferredRenderFrame?: number;
    private transcriptDeferredRenderTimer?: number;
    private transcriptVirtualRenderFrame?: number;
    private transcriptVirtualScrollTop = 0;
    // Lines-panel row-height estimate, calibrated from actually rendered rows.
    // The fixed 80px guess drifts badly on hydrated rows (furigana + wrapping
    // push real rows past 110px), and since spacers AND the scroll->index map
    // both use it, the error compounds with row index until deep scroll lands
    // the viewport inside a spacer and the panel shows blank rows.
    private transcriptRowEstimatePx = TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX;
    // Tracks-panel virtualization (parallel to the lines-panel window above):
    // videos with auto-translated captions expose hundreds of track rows.
    private renderedTracksVirtualWindow?: { start: number; end: number; rowCount: number };
    private tracksVirtualRenderFrame?: number;
    private tracksVirtualScrollTop = 0;
    // Scroll alone is not intent: layout, hydration and virtual-window updates
    // all scroll the panel. This state only enters manual mode when a direct
    // wheel/touch/pointer/key signal arms the next scroll.
    private readonly transcriptFollowState = new TranscriptFollowState();
    private transcriptInsetRealignFrame?: number;
    private transcriptViewportStabilizeTimer?: number;
    private transcriptPreviewPlayerResizeDeferred = false;
    private transcriptResizeBackgroundResumeTimer?: number;
    private transcriptAutoScrollResumeTimer?: number;
    private transcriptHydrationAfterResizeIndex?: number;
    private transcriptWarmupAfterResize = false;
    private transcriptPanelHideTimer?: number;
    private pointerActivityFrame?: number;
    private pendingPointerActivity?: { x: number; y: number };
    private controlsIdleTimer?: number;
    // Committing "away" (fully hidden) is debounced so a rapidly-flickering
    // player-chrome-fade signal — e.g. a feed tile that autoplays on hover and
    // strobes its own autohide class — cannot strobe the rail in and out.
    private awayCommitTimer?: number;
    // A subtitle line can be positioned outside the video frame. Activity on
    // that displaced line must briefly own control visibility even while the
    // host player's chrome remains autohidden (notably on touch devices).
    private subtitleSurfaceWakeActive = false;
    private transcriptHydrationSerial = 0;
    private transcriptCacheWarmupSerial = 0;
    private transcriptCacheWarmupSignature = '';
    private lastShadowSignature = '';
    private shadowLoopEnabled = false;
    // The specific cue the loop is pinned to. Looping must not track the live
    // currentCue (which drifts to the next line as playback advances) or the
    // loop "escapes" after one pass — pin the line and re-seek robustly.
    private shadowLoopCue: SubtitleCue | undefined;
    private shadowTextVisible = true;
    // Self-recording (shadowing practice): record the learner's voice locally and
    // play it back against the model. Never uploaded; the blob URL is local-only.
    private shadowRecorder: MediaRecorder | undefined;
    private shadowRecordingUrl: string | undefined;
    private shadowRecordingCueSignature = '';
    private shadowRecordingStopTimer?: number;
    private shadowRecordingDiscard = false;
    private shadowPlaybackAudio: HTMLAudioElement | undefined;
    private shadowAutoPausedCueSignature = '';
    private shadowRecordingUnavailable = false;
    private batchMiningStatus: SubtitleBatchMiningStatus = 'idle';
    private batchMiningCandidates: SubtitleBatchMiningCandidate[] = [];
    private batchMiningSelectedKeys = new Set<string>();
    private batchMiningRows: SubtitleBatchMiningRow[] = [];
    private batchMiningError = '';
    private batchMiningSerial = 0;
    private transcriptPanelSize = loadTranscriptPanelSize();
    private videoInset: SubtitleVideoInsetAdapter = createSubtitleVideoInsetAdapter();
    private lastYomuCaptionsActive = false;
    private nativeCaptionOwnership?: boolean;
    private readonly nativeTrackModeSnapshot: SubtitleNativeTrackModeSnapshot = new Map();
    private youtubeDomCaptionFallbackTrackId = '';
    private fullscreen = false;
    private pinnedPlayer = new SubtitlePinnedPlayerTracker();
    private lastRenderedPrimaryText = '';
    private lastRenderedPrimaryHtml = '';
    private lastRenderedPrimaryKey = '';
    private lastAppliedPrimaryRowHtml = '';
    private parseWarmupSerial = 0;
    private lastParseWarmupAnchor = -1;
    private priorityYouTubeCueWarmup: Promise<void> = Promise.resolve();
    private transcriptHydrationCursor = 0;
    private effectiveTranscriptPlacement: ReaderSettings['subtitleTranscriptPlacement'] = 'right';
    private lastAutoCopiedCueSignature = '';
    private youtubeTrackDiscoveryInFlight = false;
    private lastYouTubeTrackDiscoveryAt = 0;
    private lastYouTubeCaptionActivationAt = 0;
    private transcriptPanelClosing = false;
    private transcriptLayoutReferenceRect?: DOMRect;
    private transcriptLayoutReferenceViewport = '';
    private readonly trackSelections = new SubtitleSelectionLifecycle();
    private subtitleLanguageContext: SubtitleLanguageContext;
    private subtitleSourceContextKey = '';
    private pausePanelOpen = false;
    private pausePanelDismissed = false;
    private pausePanelSyncScheduled = false;
    // Runtime open-intent for the transcript drawer, scoped to THIS page/tab.
    // The persisted `subtitleTranscriptVisible` is a pure "open by default"
    // preference (settings form); mirroring runtime open/close into it leaked
    // an open drawer across tabs and onto the homepage. This in-memory flag
    // keeps the drawer re-openable after a track change within the same page
    // without touching persisted settings.
    private transcriptPanelSessionOpen = false;
    // "Open by default" auto-opens the drawer once per surface (page load / SPA
    // navigation), then a manual close sticks: without this a later refresh()
    // would see the preference still true + the panel hidden and reopen it,
    // making the new X close un-closable. Re-armed on YouTube navigation.
    private transcriptDefaultOpenApplied = false;
    private subtitleDragOffsetYPx = 0;
    private subtitleStylePanelOpen = false;
    // Drawer-head panel-options popover (placement / pause auto-open / close).
    // Kept as state, not DOM, so it survives the full panel re-renders that
    // toggling an option inside it triggers.
    private panelOptionsMenuOpen = false;
    // Remembered manual vertical position, as a fraction of viewport height, so a
    // nudge survives video changes and reloads instead of snapping back to the
    // configured bottom offset. Persisted via gmStorage; see subtitle-layout.
    private subtitleDragOffsetFraction = loadSubtitleDragOffsetFraction();
    private subtitleDragActive = false;
    private subtitleDragPreviewOffsetYPx?: number;
    private nativeFullscreenCueTrack?: TextTrack;
    private nativeFullscreenCueVideo?: HTMLVideoElement;
    private nativeFullscreenHostTracksRestored = false;
    private transcriptResizeActive = false;
    // A drawer render replaces the whole panel, so it rebuilds every control in
    // it. While a finger is on one of those controls the render waits here and
    // is replayed once the tap has been delivered.
    private panelPressHeld = false;
    private panelPressHoldTimer?: number;
    private heldPanelRender?: () => void;
    private asbMoveHandlesActive = false;
    private readonly asbSubtitleDragHandles = new WeakSet<HTMLElement>();
    private readonly asbSubtitleBaseTransforms = new WeakMap<HTMLElement, string>();

    constructor(private options: SubtitlePlayerOptions) {
        this.subtitleLanguageContext = resolveSubtitleLanguageContext(options.getSettings());
    }

    private readonly clickHandlers: Record<string, (target: HTMLElement) => void> = {
        cue: target => this.seekToTranscriptRow(this.rowIndexFromTarget(target)),
        previous: () => this.seekSubtitle(-1),
        next: () => this.seekSubtitle(1),
        ocr: () => this.toggleVideoFrameOcr(),
        visibility: () => this.toggleOverlayVisibility(),
        copy: target => { void this.copySubtitle().then(() => flashSubtitleCopyFeedback(target)); },
        'copy-row': target => { void this.copyTranscriptRow(this.rowIndexFromTarget(target)).then(() => flashSubtitleCopyFeedback(target)); },
        'peek-row': target => this.transcriptPanelSurface.toggleRowTranslationPeek(target),
        'jump-current': () => this.jumpToCurrentTranscriptRow(),
        'rail-expand': () => this.toggleSubtitleControlRailExpanded(),
        load: () => this.openSubtitleFilePicker('primary'),
        'load-secondary': () => this.openSubtitleFilePicker('secondary'),
        panel: () => this.toggleTranscriptDrawer(),
        'panel-options': () => this.togglePanelOptionsMenu(),
        style: () => this.toggleSubtitleStylePanel(),
        'style-reset': () => this.resetSubtitleStyleDefaults(),
        'panel-lines': () => this.openLinesPanel({ deferRender: true }),
        'panel-shadow': () => this.openShadowPanel(),
        'panel-mine': () => this.openBatchMiningPanel(),
        'panel-tracks': () => this.openTracksPanel(),
        'bm-scan': () => { void this.scanBatchMiningTranscript(); },
        'bm-toggle': target => this.toggleBatchMiningCandidate(target),
        'bm-open': target => { void this.openBatchMiningCandidate(target); },
        'bm-add': () => { void this.addSelectedBatchMiningCandidates(); },
        'bm-copy': () => { void this.copySelectedBatchMiningCandidates(); },
        'bm-grade': target => { void this.gradeBatchMiningCandidate(target); },
        'bm-grade-selected': target => { void this.gradeSelectedBatchMiningCandidates(target); },
        'bm-all': () => this.selectAllBatchMiningCandidates(),
        'bm-clear': () => this.clearBatchMiningSelection(),
        'shadow-replay': () => this.replayShadowCue(),
        'shadow-loop': () => this.toggleShadowLoop(),
        'shadow-auto-pause': () => this.toggleShadowAutoPause(),
        'shadow-toggle-text': () => this.toggleShadowText(),
        'shadow-goto': target => this.gotoShadowNeighbor(target),
        'shadow-record': () => { void this.toggleShadowRecording(); },
        'shadow-play-recording': () => this.playShadowRecording(),
        'close-panel': () => this.closeTranscriptPanel(),
        'transcript-placement': target => this.changeTranscriptPlacement(target),
        'toggle-pause-panel': () => this.togglePausePanelMode(),
        'primary-track': target => { void this.choosePrimaryTrack(this.trackIdFromTarget(target)); },
        'secondary-track': target => { void this.chooseSecondaryTrack(this.trackIdFromTarget(target)); },
        'offset-earlier': target => this.adjustTrackTimingOffset(this.trackIdFromTarget(target), -SUBTITLE_TIMING_OFFSET_STEP_SECONDS),
        'offset-later': target => this.adjustTrackTimingOffset(this.trackIdFromTarget(target), SUBTITLE_TIMING_OFFSET_STEP_SECONDS),
        'offset-previous': target => this.alignTrackTimingOffset(this.trackIdFromTarget(target), false),
        'offset-next': target => this.alignTrackTimingOffset(this.trackIdFromTarget(target), true),
        'offset-reset': target => this.setTrackTimingOffset(this.trackIdFromTarget(target), 0),
        'toggle-native-blur': target => this.toggleNativeSubtitleBlur(target.closest<HTMLElement>('.jpdb-subtitle-secondary, .jpdb-subtitle-shadow-secondary')),
    };

    init(): void {
        this.destroy();
        this.destroyed = false;
        this.abortController = new AbortController();
        const body = document.body;
        if (!body) {
            document.addEventListener('DOMContentLoaded', () => {
                if (!this.destroyed) this.init();
            }, this.eventOptions({ once: true }));
            return;
        }
        if (!this.install()) return;
        this.syncYouTubeMobileBottomSheetState();
        // Capture phase: YouTube's own keydown handlers stopImmediatePropagation
        // on keys they know, which starved the subtitle seek shortcuts of the
        // event entirely. handleKeydown only preventDefaults on a configured
        // shortcut match, so unmatched keys pass through untouched.
        document.addEventListener('keydown', event => this.handleKeydown(event), this.eventOptions({ capture: true }));
        document.addEventListener('focusin', event => this.handleSubtitleUiFocusIn(event), this.eventOptions({ capture: true }));
        document.addEventListener('focusout', event => this.handleSubtitleUiFocusOut(event), this.eventOptions({ capture: true }));
        // Reader-word handlers may stop pointerdown propagation for lookup.
        // Observe the subtitle rectangle first so tapping any part of a moved
        // line still wakes its controls without intercepting the underlying
        // video click or the word interaction.
        document.addEventListener('pointerdown', event => this.wakeControlsFromSubtitleSurface(event), this.eventOptions({ passive: true, capture: true }));
        document.addEventListener('click', event => this.handleSubtitleSurfaceClick(event), this.eventOptions({ capture: true }));
        document.addEventListener('pointerdown', event => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
        document.addEventListener('visibilitychange', () => this.restartTickAfterVisibilityChange(), this.eventOptions());
        document.addEventListener('pointermove', event => this.handlePointerActivity(event), this.eventOptions({ passive: true, capture: true }));
        window.addEventListener(OPEN_SUBTITLE_TRACKS_EVENT, () => this.openSubtitleTracksPanelFromHost(), this.eventOptions());
        window.addEventListener(LOAD_SUBTITLE_FILES_EVENT, event => this.loadSubtitleFilesFromHost(event), this.eventOptions());
        for (const eventName of YOUTUBE_SUBTITLE_NAVIGATION_EVENTS) {
            window.addEventListener(eventName, () => this.handleYouTubeNavigation(), this.eventOptions());
        }
        for (const eventName of SUBTITLE_FULLSCREEN_CHANGE_EVENTS) {
            document.addEventListener(eventName, () => {
                this.handleFullscreenLayoutChange();
            }, this.eventOptions());
        }
        // capture:true so scrolls inside nested scrollers (which don't bubble)
        // still re-anchor the overlay to the video's new on-screen position.
        window.addEventListener('scroll', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true, capture: true }));
        window.addEventListener('resize', () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
        window.addEventListener('orientationchange', () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
        window.visualViewport?.addEventListener('resize', () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
        window.visualViewport?.addEventListener('scroll', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        this.discoverVideo();
        this.syncRuntimeSignals();
        this.runtimeSignalsInitialized = true;
    }

    // Install the document observer that matches the current runtime state and
    // (re)start the housekeeping tick if it should run. Idempotent: the mode
    // guard skips a redundant re-observe and wakeTick no-ops when already
    // ticking, so refresh() and video bind/unbind can call it freely.
    private syncRuntimeSignals(): void {
        if (this.destroyed) return;
        this.installRuntimeDocumentObserver();
        this.wakeTick();
    }

    private installRuntimeDocumentObserver(): void {
        const settings = this.options.getSettings();
        const mode: 'full' | 'discovery' | 'off' = this.video
            ? 'full'
            : settings.subtitlePlayerEnabled ? 'discovery' : 'off';
        if (mode === this.observerMode) return;
        this.observer?.disconnect();
        this.observer = undefined;
        this.observerMode = mode;
        const body = document.body;
        if (mode === 'off' || !body) return;
        const observer = new MutationObserver(mutations => this.handleRuntimeMutations(mutations));
        // Discovery mode has no bound video: nothing is on screen, so the only
        // reason to watch the page is to notice a <video>/player host
        // appearing. A childList-only observer skips the attribute stream — a
        // busy SPA's class/aria churn no longer wakes Yomu every frame — and
        // the per-delivery bottom-sheet + fullscreen sync the full observer
        // runs is meaningless with no video to sync against.
        observer.observe(body, mode === 'full'
            ? { attributeFilter: ['aria-modal', 'class', 'data-yomu-inline-fullscreen', 'fullscreen', 'hidden'], attributes: true, childList: true, subtree: true }
            : { childList: true, subtree: true });
        this.observer = observer;
    }

    private handleRuntimeMutations(mutations: MutationRecord[]): void {
        if (this.destroyed) return;
        // No bound video (discovery mode, or a video that just unbound before
        // this batch was delivered): the sole job is to notice one appearing.
        if (!this.video) {
            if (mutations.some(mutationCouldAffectVideoDiscovery)) this.scheduleDiscoverVideo();
            return;
        }
        this.syncYouTubeMobileBottomSheetState();
        // Reader-root-only batches (Yomu's own overlay re-renders, the most
        // common kind during playback) cannot change fullscreen state: the
        // inline-fullscreen marker lives on the video-player host outside the
        // reader root. Bail before the per-mutation fullscreen walk.
        if (mutations.every(mutationInsideReaderRoot)) return;
        if (mutations.some(mutation => this.mutationCouldAffectFullscreenState(mutation))) {
            this.fullscreenHost.invalidateHostCache();
            this.syncFullscreenState();
            this.scheduleAlignToVideo();
        }
        if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
        this.scheduleDiscoverVideo();
    }

    private mutationCouldAffectFullscreenState(mutation: MutationRecord): boolean {
        if (mutation.type === 'childList') return mutationSwapsFullscreenHostCandidate(mutation);
        if (mutation.type !== 'attributes') return false;
        const target = mutation.target;
        if (!(target instanceof HTMLElement)) return false;
        return target.matches('ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player, [data-yomu-inline-fullscreen]')
            || Boolean(target.closest('ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player, [data-yomu-inline-fullscreen]'));
    }

    private handleYouTubeNavigation(): void {
        if (!isYouTubePage()) return;
        this.fullscreenHost.invalidateHostCache();
        this.markNativeCueListsDirty();
        this.lastYouTubeTrackDiscoveryAt = 0;
        // A new video is a fresh surface: let "open by default" re-apply once.
        this.transcriptDefaultOpenApplied = false;
        this.scheduleDiscoverVideo();
        void this.discoverYouTubeTracksThrottled(true);
        this.scheduleAlignToVideo();
    }

    private handleFullscreenLayoutChange(): void {
        this.fullscreenHost.invalidateHostCache();
        this.syncFullscreenState();
        if (this.video && !this.video.paused) this.startFrameSync(this.video);
        this.alignToVideo();
        this.scheduleAlignToVideo();
        window.setTimeout(() => {
            if (!this.destroyed) this.scheduleAlignToVideo();
        }, 80);
        this.render();
        this.syncControls();
    }

    destroy(): void {
        this.destroyed = true;
        // A destroy mid-native-fullscreen would otherwise strand the mirror
        // track showing and any restored host track modes ('showing') under
        // the next controller, which assumes suppressed defaults.
        this.hideNativeFullscreenCueTrack();
        this.resetShadowPracticeState();
        this.clearPlaybackPauseReassert();
        this.trackSelections.abortAll();
        this.abortController?.abort();
        this.abortController = undefined;
        this.releaseNativeCaptionOwnership();
        this.observer?.disconnect();
        this.observer = undefined;
        this.observerMode = 'off';
        this.runtimeSignalsInitialized = false;
        this.videoResizeObserver?.disconnect();
        this.videoResizeObserver = undefined;
        this.subtitleControlRail?.destroy();
        this.subtitleControlRail = undefined;
        this.discoverTimer = clearWindowTimeout(this.discoverTimer);
        this.videoCandidateLossTimer = clearWindowTimeout(this.videoCandidateLossTimer);
        this.tickTimer = clearWindowTimeout(this.tickTimer);
        this.stopFrameSync();
        this.clearControlsIdleTimer();
        this.clearAwayCommitTimer();
        this.alignFrame = clearWindowAnimationFrame(this.alignFrame);
        this.transcriptScrollFrame = clearWindowAnimationFrame(this.transcriptScrollFrame);
        this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
        this.transcriptVirtualRenderFrame = clearWindowAnimationFrame(this.transcriptVirtualRenderFrame);
        this.tracksVirtualRenderFrame = clearWindowAnimationFrame(this.tracksVirtualRenderFrame);
        this.clearDeferredTranscriptPanelRender();
        this.resetPanelPressHold();
        this.transcriptInsetRealignFrame = clearWindowAnimationFrame(this.transcriptInsetRealignFrame);
        this.transcriptViewportStabilizeTimer = clearWindowTimeout(this.transcriptViewportStabilizeTimer);
        this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        this.clearTranscriptPanelAnimation();
        this.pointerActivityFrame = clearWindowAnimationFrame(this.pointerActivityFrame);
        this.pendingPointerActivity = undefined;
        this.clearVideoInsetForTranscriptPanel();
        this.subtitleStylePanelOpen = false;
        // The controller instance outlives its own teardown (the app destroys and
        // re-inits it in place), so a remembered frame would keep the detached
        // media element alive and judge the next one against a dead anchor.
        this.pinnedPlayer.reset();
        document.documentElement.classList.remove(YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS);
        this.removeAsbPlayerSubtitleMoveHandles();
        this.transcriptPanel?.remove();
        this.root?.remove();
        this.root = undefined;
        this.subtitleEl = undefined;
        this.transcriptPanel = undefined;
        this.video = undefined;
        this.fullscreenHost.invalidateHostCache();
    }

    private eventOptions(options: AddEventListenerOptions = {}): AddEventListenerOptions {
        return this.abortController ? { ...options, signal: this.abortController.signal } : options;
    }

    refresh(): void {
        if (!this.root) return;
        // Settings may have flipped subtitlePlayerEnabled: re-pick the observer
        // mode and (re)start or leave the tick parked accordingly. Gated on the
        // init flag so the install()-only test harness is untouched.
        if (this.runtimeSignalsInitialized) this.syncRuntimeSignals();
        const settings = this.options.getSettings();
        this.reconcileSubtitleLanguageContext(settings);
        const annotationsModeChanged = this.prepareAnnotationsModeRender(settings);
        this.syncRootVisibility(settings);
        this.syncTranscriptPlacementClass();
        this.syncFullscreenState();
        this.syncRootStyleSettings(settings);
        this.syncAsbPlayerSubtitleMoveHandles(settings);
        this.openTranscriptPanelFromSettings(settings);
        this.syncPauseTranscriptPanel();
        this.scheduleAlignToVideo();
        this.syncControls();
        this.render();
        this.renderOpenSubtitlePanel(annotationsModeChanged);
        this.hideControlsImmediately();
    }

    private reconcileSubtitleLanguageContext(settings: ReaderSettings): void {
        const next = resolveSubtitleLanguageContext(settings);
        const plan = planSubtitleLanguageReconciliation(
            this.tracks,
            this.selectedTrackId,
            this.secondaryTrackId,
            this.subtitleLanguageContext,
            next,
        );
        if (!plan) return;
        this.subtitleLanguageContext = next;
        this.htmlCache.invalidateParseContext();
        this.removeSubtitleTrackIds(plan.removedTrackIds);
        disableSubtitleTextTrack(this.nativeFullscreenCueTrack);
        this.nativeFullscreenCueTrack = undefined;
        ensureTranslatedTargetTrack(this.tracks, settings.interfaceLanguage, next);
        const pair = automaticSubtitleLanguagePair(this.tracks, next);
        for (const action of subtitleLanguageActions(plan, pair, this.selectedTrackId, this.secondaryTrackId)) this.applySubtitleLanguageAction(action);
        this.refreshNativeFullscreenCueMirror();
        this.lastYouTubeTrackDiscoveryAt = 0;
        if (isYouTubePage()) void this.discoverYouTubeTracksThrottled(true);
    }

    private applySubtitleLanguageAction(action: SubtitleLanguageAction): void {
        const actions: Record<SubtitleLanguageAction['type'], () => void> = {
            'reset-primary': () => this.resetPrimarySubtitleState(),
            'reset-secondary': () => this.resetSecondarySubtitleState(),
            'select-primary': () => { void this.selectTrack(action.trackId, { auto: true }); },
            'select-secondary': () => { void this.selectSecondaryTrack(action.trackId, { auto: true }); },
        };
        actions[action.type]();
    }

    private prepareAnnotationsModeRender(settings: ReaderSettings): boolean {
        const previous = this.lastRefreshAnnotationsPaused;
        this.lastRefreshAnnotationsPaused = settings.annotationsPaused;
        if (previous === undefined || previous === settings.annotationsPaused) return false;

        // ReaderApp clears page annotations by replacing reader-word nodes.
        // Subtitle DOM is controller-owned, so that external cleanup can leave
        // the applied-HTML and transcript signatures claiming markup that no
        // longer exists. Treat pause/resume as a new render transaction: reject
        // late work from the old mode and force both owned surfaces to reconcile.
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
        this.lastParseWarmupAnchor = -1;
        this.transcriptHydrationSerial += 1;
        this.transcriptCacheWarmupSerial += 1;
        this.transcriptCacheWarmupSignature = '';
        this.lastAppliedPrimaryRowHtml = '';
        this.lastTranscriptSignature = '';
        this.lastTranscriptStructureSignature = '';
        this.transcriptTextTargetsByParseKey.clear();
        return true;
    }

    private syncRootVisibility(settings: ReaderSettings): void {
        if (!this.root) return;
        const tracksPanelOpen = settings.subtitlePlayerEnabled && this.panelMode === 'tracks' && this.isTranscriptPanelOpen();
        const hidden = !tracksPanelOpen && shouldHideSubtitleRoot(settings, this.video, this.cues, this.tracks);
        if (this.root.hidden !== hidden) this.root.hidden = hidden;
        if (hidden && this.transcriptPanel) this.hideTranscriptPanelElement({ immediate: true });
        setClassState(this.root, 'jpdb-subtitle-hidden', !settings.subtitleOverlayVisible);
        setClassState(this.root, 'jpdb-subtitle-controls-auto', settings.subtitleControlsMode === 'auto');
        setClassState(this.root, 'jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
        setClassState(this.root, 'jpdb-subtitle-controls-always', settings.subtitleControlsMode === 'always');
        setClassState(this.root, 'jpdb-subtitle-controls-idle', shouldKeepIdleControlClass(this.root, settings));
        setClassState(this.root, SUBTITLE_ANNOTATIONS_PAUSED_CLASS, settings.annotationsPaused);
        // Leaving auto mode (pinned or hidden) must drop any committed OR
        // pending fully-hidden state so a pin can never inherit a stale hide.
        if (settings.subtitleControlsMode !== 'auto') this.setControlsAway(false);
        if (!this.video) {
            setClassState(this.root, 'jpdb-subtitle-has-video-frame', false);
            setClassState(this.root, 'jpdb-subtitle-compact-video', false);
            setClassState(this.root, 'jpdb-subtitle-video-out-of-view', true);
        }
        if (this.transcriptPanel) {
            setClassState(this.transcriptPanel, 'jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
            setClassState(this.transcriptPanel, SUBTITLE_ANNOTATIONS_PAUSED_CLASS, settings.annotationsPaused);
        }
    }

    private syncRootStyleSettings(settings: ReaderSettings): void {
        if (!this.root) return;
        this.syncRootFontSize(settings);
        syncNativeSubtitleBlurVariables([this.root, this.transcriptPanel], settings.subtitleNativeBlurStrength);
        this.applyEffectiveSubtitleBottom();
        this.syncSubtitleDragOffsetStyle();
        this.root.style.setProperty('--subtitle-color', settings.subtitleTextColor);
        this.root.style.setProperty('--subtitle-outline', settings.subtitleOutlineColor);
        this.root.style.setProperty('--subtitle-background-rgba', accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
        this.root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
        this.root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
    }

    private syncRootFontSize(settings: ReaderSettings): void {
        if (!this.root) return;
        const target = subtitleTargetFontSize(settings);
        setStylePropertyIfChanged(this.root, '--subtitle-font-size-target', `${target}px`);
        setStylePropertyIfChanged(this.root, '--subtitle-font-size', `${target}px`);
        setStylePropertyIfChanged(this.root, '--subtitle-secondary-font-size', `${subtitleSecondaryFontSize(target)}px`);
    }

    private openTranscriptPanelFromSettings(settings: ReaderSettings): void {
        if (this.transcriptDefaultOpenApplied) return;
        if (!settings.subtitleTranscriptVisible || !this.hasTranscriptSurface()) return;
        // "Already open" only counts when the panel element exists; it is
        // created lazily by the open itself, so `?.hidden` being undefined on
        // a fresh page used to deadlock default-open entirely.
        if (this.transcriptPanel && !this.transcriptPanel.hidden) return;
        this.transcriptDefaultOpenApplied = true;
        // Go through the full open path: it creates the panel element when it
        // does not exist yet, which showTranscriptPanelElement alone cannot.
        this.openLinesPanel({ deferRender: true });
    }

    private install(): boolean {
        if (this.root) return true;
        const body = document.body;
        if (!body) return false;
        document.querySelectorAll<HTMLElement>('.jpdb-subtitle-player[data-jpdb-reader-root="true"], .jpdb-subtitle-list[data-jpdb-reader-root="true"]').forEach(element => element.remove());
        if (isYouTubePage() || document.querySelector('[data-yomu-video-frame]')) installSubtitleFullscreenRedirect();

        const root = document.createElement('div');
        root.className = 'jpdb-subtitle-player';
        root.dataset.jpdbReaderRoot = 'true';
        const settings = this.options.getSettings();
        const previousLabel = uiText(settings.interfaceLanguage, 'previousSubtitle');
        const nextLabel = uiText(settings.interfaceLanguage, 'nextSubtitle');
        const visibilityLabel = uiText(settings.interfaceLanguage, 'subtitleOverlayVisible');
        const panelLabel = uiText(settings.interfaceLanguage, 'openSubtitlePanel');
        const moveLabel = uiText(settings.interfaceLanguage, 'moveSubtitles');
        const moveAccessibleLabel = uiText(settings.interfaceLanguage, 'moveSubtitlesAccessible');
        const moveControlsLabel = uiText(settings.interfaceLanguage, 'moveSubtitleControls');
        const ocrLabel = uiText(settings.interfaceLanguage, settings.ocrVideoPauseFrames ? 'readVideoFrameStop' : 'readVideoFrame');
        const ocrButton = settings.ocrEnabled && settings.ocrProvider !== 'off'
            ? `<button class="jpdb-subtitle-ocr-trigger${settings.ocrVideoPauseFrames ? ' jpdb-subtitle-ocr-active' : ''}" type="button" data-action="ocr" title="${escapeHtml(ocrLabel)}" aria-label="${escapeHtml(ocrLabel)}" aria-pressed="${settings.ocrVideoPauseFrames}">${subtitleIcon('scan')}</button>`
            : '';
        setInnerHtml(root, `
            <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines" aria-live="polite"></div><button class="jpdb-subtitle-drag-handle" type="button" data-subtitle-drag-handle data-jpdb-reader-surface-ignore title="${escapeHtml(moveLabel)}" aria-label="${escapeHtml(moveAccessibleLabel)}" aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Home 0"><span aria-hidden="true"></span></button></div>
            <div class="jpdb-subtitle-status" aria-live="polite" data-jpdb-reader-surface-ignore></div>
            <div class="jpdb-subtitle-rail" data-jpdb-reader-surface-ignore>
                <button class="jpdb-subtitle-rail-move" type="button" data-action="rail-expand" data-subtitle-rail-drag-handle title="${escapeHtml(moveControlsLabel)}" aria-label="${escapeHtml(moveControlsLabel)}" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home 0">${subtitleIcon('grip')}</button>
                <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
                <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
                ${ocrButton}
                <button class="jpdb-subtitle-visibility-toggle" type="button" data-action="visibility" title="${escapeHtml(visibilityLabel)}" aria-label="${escapeHtml(visibilityLabel)}">${subtitleIcon(settings.subtitleOverlayVisible ? 'eye' : 'eye-off')}</button>
                <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel" title="${escapeHtml(panelLabel)}" aria-label="${escapeHtml(panelLabel)}">${subtitleIcon('panel-right')}</button>
                ${renderSubtitleStyleControls(settings, settings.interfaceLanguage)}
            </div>
            <div class="jpdb-subtitle-list" hidden></div>
        `);
        root.addEventListener('click', event => this.handleClick(event));
        root.addEventListener('input', event => this.handleSubtitleStyleInput(event), this.eventOptions());
        root.addEventListener('change', event => this.handleSubtitleStyleInput(event), this.eventOptions());
        const stylePopover = root.querySelector<HTMLElement>('[data-subtitle-style-popover]');
        for (const eventName of TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS) {
            stylePopover?.addEventListener(eventName, event => this.stopSubtitleStylePopoverPropagation(event), this.eventOptions());
        }
        this.subtitleEl = root.querySelector('.jpdb-subtitle-lines') as HTMLElement;
        this.transcriptPanel = root.querySelector('.jpdb-subtitle-list') as HTMLElement;
        this.transcriptPanel.dataset.jpdbReaderRoot = 'true';
        this.transcriptPanel.addEventListener('click', event => this.transcriptPanelSurface.handlePanelClick(event), this.eventOptions());
        // Bound after the click handler above so a held render replays with the
        // tap's own effect already applied, and never before the tap lands.
        this.transcriptPanel.addEventListener('pointerdown', event => this.beginPanelPress(event), this.eventOptions({ passive: true }));
        this.transcriptPanel.addEventListener('pointercancel', () => this.endPanelPress(), this.eventOptions({ passive: true }));
        this.transcriptPanel.addEventListener('click', () => this.endPanelPress(), this.eventOptions());
        this.transcriptPanel.addEventListener('keydown', event => this.transcriptPanelSurface.handlePanelKeydown(event), this.eventOptions());
        for (const eventName of TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS) {
            this.transcriptPanel.addEventListener(eventName, event => this.transcriptPanelSurface.stopPanelPropagation(event), this.eventOptions());
        }
        body.appendChild(root);
        body.appendChild(this.transcriptPanel);
        this.root = root;
        this.subtitleControlRail = bindSubtitleControlRail(
            root,
            () => this.showControlsTemporarily({ independentOfPlayerChrome: true }),
            {
                getReservedRects: () => this.nativePlayerControlSafeZones(),
                onPositionChange: () => {
                    if (this.subtitleStylePanelOpen) this.syncSubtitleStyleControls();
                },
            },
        ) ?? undefined;
        this.bindSubtitleDragHandle();
        this.restoreSubtitleDragOffset();
        this.refresh();
        // First paint lands in the right place instead of being corrected a
        // frame later by the rAF-deferred alignment refresh() scheduled.
        this.alignToVideo();
        this.subtitleControlRail?.syncPosition();
        // Touch devices get no pointermove, so without this the rail stays
        // visible forever; tapping the video re-reveals it via pointerdown.
        this.scheduleControlsIdle();
        return true;
    }

    private scheduleDiscoverVideo(): void {
        if (this.discoverTimer !== undefined) return;
        this.discoverTimer = window.setTimeout(() => {
            this.discoverTimer = undefined;
            if (this.destroyed) return;
            this.discoverVideo();
        }, 120);
    }

    private discoverVideo(): void {
        if (!this.shouldDiscoverVideo()) {
            this.refresh();
            return;
        }
        this.discoverEnabledVideo();
    }

    private shouldDiscoverVideo(): boolean {
        const settings = this.options.getSettings();
        return settings.subtitlePlayerEnabled && settings.subtitleAutoDetect;
    }

    private discoverEnabledVideo(): void {
        const candidate = this.discoverVideoCandidate();
        if (!candidate) {
            if (this.video) {
                // A source change is authoritative even if the element is
                // simultaneously hidden/detached. Never hold an old cue over a
                // navigation or a same-element src swap for the sake of the
                // replacement grace.
                if (this.syncSubtitleSourceContext(this.video)) {
                    this.clearDiscoveredVideoCandidate();
                    return;
                }
                this.scheduleDiscoveredVideoCandidateClear(this.video);
                // A fullscreen/native-player hand-off can expose one or more
                // discovery samples with no document candidate. Keep the last
                // painted frame and source context during that grace window:
                // refresh() would align against the detached old element,
                // mark the root out-of-view, and hide the otherwise intact
                // annotated row.
                return;
            }
            this.syncSubtitleSourceContext(undefined);
            this.refresh();
            return;
        }
        this.videoCandidateLossTimer = clearWindowTimeout(this.videoCandidateLossTimer);
        // Resolve identity BEFORE rebinding the element. YouTube and native
        // fullscreen implementations routinely replace <video> while keeping
        // the same media source; clearing the current cue in that case made
        // refresh() remove a fully annotated row for one playback sample.
        const sourceChanged = this.syncSubtitleSourceContext(candidate ?? this.video);
        if (candidate && candidate !== this.video) {
            this.useDiscoveredVideoCandidate(candidate, { preserveTransientSubtitleState: !sourceChanged });
        }
        this.discoverPageSubtitleTracks();
        void this.discoverYouTubeTracksThrottled(true);
        this.refresh();
    }

    private scheduleDiscoveredVideoCandidateClear(expected: HTMLVideoElement): void {
        if (this.videoCandidateLossTimer !== undefined) return;
        this.videoCandidateLossTimer = window.setTimeout(() => {
            this.videoCandidateLossTimer = undefined;
            if (this.destroyed || this.video !== expected) return;
            const replacement = this.discoverVideoCandidate();
            if (replacement) {
                this.discoverEnabledVideo();
                return;
            }
            // The document-level re-query is authoritative. A detached media
            // element can regain readyState while no longer being a player.
            this.clearDiscoveredVideoCandidate();
        }, SUBTITLE_VIDEO_CANDIDATE_LOSS_GRACE_MS);
    }

    private discoverVideoCandidate(): HTMLVideoElement | undefined {
        return Array.from(document.querySelectorAll<HTMLVideoElement>('video')).filter(video => this.isSubtitleVideoCandidate(video)).sort(compareSubtitleVideoCandidates)[0];
    }

    hasDiscoverableVideoCandidate(): boolean { return Boolean(this.discoverVideoCandidate()); }

    private isSubtitleVideoCandidate(video: HTMLVideoElement): boolean {
        if (isYouTubePage() && !isYouTubeOwnedVideoElement(video)) return false;
        if (video.closest('[data-jpdb-reader-surface-ignore]')) return false;
        return video.readyState >= 1 || video.clientWidth > 120 || video.getBoundingClientRect().width > 120;
    }

    // Our rail belongs next to a real player: if the video offers playback
    // controls (native attribute or a known player chrome) or we actually
    // have subtitle data for it, show ours too. Decorative/ad videos (e.g.
    // Discord promos) have neither, so the rail stays away.
    private videoHasPlayerAffordances(): boolean {
        if (!this.video) return false;
        if (this.video.controls || isYouTubePage()) return true;
        if (this.video.closest('#movie_player, .html5-video-player, [data-yomu-video-frame]')) return true;
        const fullscreenElement = currentFullscreenElement();
        if (this.fullscreenHost.shouldHostSubtitleRootInFullscreenElement(fullscreenElement) && frameHasPlayerControls(fullscreenElement)) return true;
        const frame = subtitleVideoLayoutTarget(this.video);
        if (frame && frame !== this.video && frameHasPlayerControls(frame)) return true;
        return Boolean(this.tracks.length || this.cues.length || this.currentCue?.text);
    }

    private clearDiscoveredVideoCandidate(): void {
        this.videoCandidateLossTimer = clearWindowTimeout(this.videoCandidateLossTimer);
        this.bufferingPlayback = undefined;
        this.video = undefined;
        this.fullscreenHost.invalidateHostCache();
        this.subtitleSourceContextKey = '';
        this.youtubeVideoId = '';
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.youtubeDomCaptionFallbackTrackId = '';
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind !== 'file');
        this.setNativeTrackModes();
        this.render();
        this.syncControls();
        // Losing the video drops the observer back to discovery/off mode.
        if (this.runtimeSignalsInitialized) this.syncRuntimeSignals();
    }

    private useDiscoveredVideoCandidate(
        candidate: HTMLVideoElement,
        options: { preserveTransientSubtitleState?: boolean } = {},
    ): void {
        this.bufferingPlayback = undefined;
        this.video = candidate;
        this.fullscreenHost.invalidateHostCache();
        this.markNativeCueListsDirty();
        if (!options.preserveTransientSubtitleState) this.clearTransientSubtitleState();
        if (options.preserveTransientSubtitleState) this.reconcileReplacementNativeTracks(candidate);
        this.removeStaleNativeTracks(candidate);
        this.attachTextTracks(candidate);
        this.observeVideoLayout(candidate);
        // Align synchronously on bind: the video box is already measurable, and
        // the rAF-deferred path otherwise paints the control rail one frame at
        // the wrong position before it "sorts itself out".
        this.alignToVideo();
        // A bound video upgrades the observer to full mode and wakes the tick.
        if (this.runtimeSignalsInitialized) this.syncRuntimeSignals();
    }

    private attachTextTracks(video: HTMLVideoElement): void {
        for (const track of Array.from(video.textTracks)) this.addNativeTrack(track);
        video.textTracks.addEventListener?.('addtrack', event => {
            if (video !== this.video) return;
            const track = (event as TrackEvent).track as TextTrack | null;
            if (track) this.addNativeTrack(track);
        }, this.eventOptions());
    }

    private reconcileReplacementNativeTracks(video: HTMLVideoElement): void {
        if (isYouTubePage()) return;
        const candidates = Array.from(video.textTracks)
            .filter(track => track !== this.nativeFullscreenCueTrack && track.label !== NATIVE_FULLSCREEN_CUE_TRACK_LABEL);
        const candidateSet = new Set(candidates);
        const claimed = new Set<TextTrack>();
        for (const option of this.tracks) {
            if (option.kind === 'native' && !option.translatedFromTrackId && option.track && candidateSet.has(option.track)) {
                claimed.add(option.track);
            }
        }

        let reconciled = false;
        for (const option of this.tracks) {
            const previous = option.track;
            if (option.kind !== 'native'
                || option.translatedFromTrackId
                || !previous
                || candidateSet.has(previous)) continue;
            const replacement = candidates.find(track => !claimed.has(track)
                && this.nativeTrackMetadataMatches(previous, track));
            if (!replacement) continue;
            claimed.add(replacement);
            option.track = replacement;
            this.observeNativeTrack(replacement);
            reconciled = true;
        }
        if (reconciled) this.setNativeTrackModes();
    }

    private nativeTrackMetadataMatches(left: TextTrack, right: TextTrack): boolean {
        return left.id === right.id
            && left.kind === right.kind
            && left.label === right.label
            && left.language === right.language;
    }

    private syncSubtitleSourceContext(video = this.video): boolean {
        const key = subtitleSourceContextKey(video);
        if (!key) return false;
        if (!this.subtitleSourceContextKey) {
            this.subtitleSourceContextKey = key;
            return false;
        }
        if (this.subtitleSourceContextKey === key) return false;

        this.subtitleSourceContextKey = key;
        this.markNativeCueListsDirty();
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.lastYouTubeTrackDiscoveryAt = 0;
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind !== 'file');
        return true;
    }

    private clearTransientSubtitleState(): void {
        this.currentCue = undefined;
        this.secondaryCue = undefined;
        this.pendingDomCaption = undefined;
        this.lastDomCaption = '';
        this.lastDomCaptionSeenAt = 0;
        this.invalidatePrimaryCueRender();
        this.resetShadowPracticeState();
        this.restoreSubtitleDragOffset();
    }

    private invalidatePrimaryCueRender(): void {
        this.lastAutoCopiedCueSignature = '';
        this.lastRenderedPrimaryKey = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
        this.lastAppliedPrimaryRowHtml = '';
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
        this.lastParseWarmupAnchor = -1;
    }

    private removeStaleNativeTracks(video: HTMLVideoElement): void {
        const textTracks = new Set(Array.from(video.textTracks));
        // Synthetic translated tracks have no TextTrack of their own; they are
        // culled with their source via the orphan cascade, not by liveness.
        this.removeSubtitleTracks(track => track.kind === 'native'
            && !track.translatedFromTrackId
            && (!track.track || !textTracks.has(track.track)));
    }

    private removeSubtitleTracks(predicate: (track: SubtitleTrackOption) => boolean): number {
        const removed = this.tracks.filter(predicate);
        if (!removed.length) return 0;

        this.removeSubtitleTrackIds(new Set(removed.map(track => track.id)));
        releaseDepartedSubtitleNativeTrackModes(this.nativeTrackModeSnapshot, this.tracks);
        this.lastTranscriptSignature = '';
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncControls();
        return removed.length;
    }

    private removeSubtitleTrackIds(removedIds: Set<string>): void {
        // Cascade: a synthetic translated track cannot outlive its source.
        const removed = new Set(removedIds);
        for (const track of this.tracks) {
            if (track.translatedFromTrackId && removed.has(track.translatedFromTrackId)) removed.add(track.id);
        }
        this.tracks = this.tracks.filter(track => !removed.has(track.id));
        if (removed.has(this.selectedTrackId)) this.resetPrimarySubtitleState();
        if (removed.has(this.secondaryTrackId)) this.resetSecondarySubtitleState();
    }

    private renderOpenSubtitlePanel(force = false): void {
        if (!this.canRenderOpenSubtitlePanel()) return;
        if (!this.hasTranscriptSurface()) {
            this.renderTrackPanel();
            return;
        }
        this.renderOpenTranscriptMode(force);
    }

    private canRenderOpenSubtitlePanel(): boolean {
        return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }

    private renderOpenTranscriptMode(force: boolean): void {
        if (this.panelMode === 'tracks') this.renderTrackPanel();
        else if (this.panelMode === 'shadow') this.renderShadowPanel(true);
        else if (this.panelMode === 'mine') this.renderBatchMiningPanel();
        else this.renderTranscriptPanel(force);
    }

    private observeVideoLayout(video: HTMLVideoElement): void {
        this.videoResizeObserver?.disconnect();
        this.videoResizeObserver = new ResizeObserver(() => this.scheduleAlignToVideo());
        this.videoResizeObserver.observe(video);
        video.addEventListener('loadstart', () => {
            this.lastYouTubeTrackDiscoveryAt = 0;
            void this.discoverYouTubeTracksThrottled(true);
        }, this.eventOptions({ passive: true }));
        video.addEventListener('loadedmetadata', () => {
            this.lastYouTubeTrackDiscoveryAt = 0;
            void this.discoverYouTubeTracksThrottled(true);
            this.scheduleAlignToVideo();
        }, this.eventOptions({ passive: true }));
        video.addEventListener('loadeddata', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        for (const eventName of ['webkitbeginfullscreen', 'webkitendfullscreen', 'webkitpresentationmodechanged'] as const) {
            video.addEventListener(eventName, () => {
                // The mirror must follow every native-fullscreen entry, not just
                // ones Yomu initiated — the site's own fullscreen button is the
                // only entry point now that the rail no longer has one.
                if (videoIsInNativeFullscreen(video)) this.showNativeFullscreenCueTrack(video);
                else this.hideNativeFullscreenCueTrack();
                this.handleFullscreenLayoutChange();
            }, this.eventOptions({ passive: true }));
        }
        const handlePlaybackTimeChanged = () => this.syncSubtitleToPlaybackTime();
        const handlePlaybackSeek = () => {
            if (this.bufferingPlayback?.video === video) this.bufferingPlayback.time = video.currentTime;
            this.syncSubtitleToPlaybackTime();
        };
        video.addEventListener('timeupdate', handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
        video.addEventListener('seeking', handlePlaybackSeek, this.eventOptions({ passive: true }));
        video.addEventListener('seeked', handlePlaybackSeek, this.eventOptions({ passive: true }));
        video.addEventListener('ratechange', handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
        const handlePlaybackBuffering = (event: Event) => {
            if (video !== this.video || video.paused || video.ended) return;
            // `stalled` is also emitted when fetching stops despite enough
            // buffered media to keep presenting frames. Only treat it as a
            // playback stall once the media element has no future data.
            if (event.type === 'stalled' && video.readyState > HTMLMediaElement.HAVE_CURRENT_DATA) return;
            if (this.bufferingPlayback?.video === video) return;
            this.bufferingPlayback = { video, time: video.currentTime };
            this.stopFrameSync();
        };
        video.addEventListener('waiting', handlePlaybackBuffering, this.eventOptions({ passive: true }));
        video.addEventListener('stalled', handlePlaybackBuffering, this.eventOptions({ passive: true }));
        video.addEventListener('pause', () => {
            // Only the BOUND video's pause tears down the sampler. After a player
            // element swap (miniplayer/ad), a stale element's listener stays armed
            // (its closure captured the old `video`); without this guard its pause
            // would cancel the sampler that is actively tracking the new, playing
            // element. syncPauseTranscriptPanel is self-guarding (it no-ops when
            // this.video is not paused), so it stays unconditional.
            if (video === this.video) {
                this.bufferingPlayback = undefined;
                this.stopFrameSync();
                this.syncControls();
            }
            this.syncPauseTranscriptPanel({ deferRender: true });
        }, this.eventOptions({ passive: true }));
        video.addEventListener('ended', () => {
            if (video === this.video) this.bufferingPlayback = undefined;
        }, this.eventOptions({ passive: true }));
        const handlePlaybackStarted = (event: Event) => {
            this.pausePanelDismissed = false;
            // Same deferred path as pause: syncPauseTranscriptPanel sees the
            // playing video and closes the auto-opened panel after the paint.
            if (this.pausePanelOpen) this.schedulePauseTranscriptPanelSync();
            if (video === this.video) {
                if (event.type === 'playing') this.bufferingPlayback = undefined;
                this.startFrameSync(video);
                this.syncControls();
            }
            this.scheduleAlignToVideo();
        };
        video.addEventListener('play', handlePlaybackStarted, this.eventOptions({ passive: true }));
        video.addEventListener('playing', handlePlaybackStarted, this.eventOptions({ passive: true }));
        this.scheduleAlignToVideo();
    }

    private syncSubtitleToPlaybackTime(): void {
        if (this.destroyed || document.hidden || !this.options.getSettings().subtitlePlayerEnabled) return;
        this.refreshNativeCueListsIfStale();
        this.updateFromLoadedCues();
        if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }

    private addNativeTrack(track: TextTrack): void {
        if (this.shouldIgnoreNativeTrack(track)) return;
        const option = this.createNativeTrackOption(track);
        // Capture before auto-selection makes a disabled page-owned track readable.
        snapshotSubtitleNativeTrackModes(this.nativeTrackModeSnapshot, [option]);
        this.tracks.push(option);
        this.markNativeCueListsDirty();

        // No dirty-mark here: updateFromNativeTrack itself re-reads and
        // assigns the full cue list for the selected/secondary track (the only
        // tracks refreshNativeCueLists maintains), so marking the global flag
        // just made the next tick normalize the same list a second time.
        this.observeNativeTrack(track);
        this.maybeAutoSelectNativeTrack(option);
        if (ensureTranslatedTargetTrack(this.tracks, this.options.getSettings().interfaceLanguage, this.subtitleLanguageContext)) {
            this.maybeAutoSelectTranslatedTargetTrack();
        }
        window.setTimeout(() => {
            if (this.destroyed) return;
            this.setNativeTrackModes();
            this.syncControls();
        }, 0);
        this.syncControls();
    }

    private shouldIgnoreNativeTrack(track: TextTrack): boolean {
        // The native-fullscreen mirror track echoes Yomu's own loaded cues; it
        // must never be re-discovered as a source track.
        return [
            isYouTubePage(),
            track === this.nativeFullscreenCueTrack,
            track.label === NATIVE_FULLSCREEN_CUE_TRACK_LABEL,
            this.tracks.some(item => item.track === track),
        ].some(Boolean);
    }

    private createNativeTrackOption(track: TextTrack): SubtitleTrackOption {
        const fallback = `${uiText(this.options.getSettings().interfaceLanguage, 'subtitleFallbackLabel')} ${this.tracks.length + 1}`;
        const label = [track.label, track.language].find(Boolean) ?? fallback;
        return { id: `native-${this.tracks.length}`, label, kind: 'native', language: track.language, track };
    }

    private observeNativeTrack(track: TextTrack): void {
        track.addEventListener('cuechange', () => this.updateFromNativeTrack(track), this.eventOptions());
    }

    private discoverPageSubtitleTracks(): void {
        const sources = collectPageSubtitleSources(document);
        const removed = this.removeStalePageSubtitleTracks(sources);
        if (!sources.length) return;

        const changes = this.addOrUpdatePageSubtitleTracks(sources, removed);
        this.finishPageSubtitleTrackDiscovery(changes);
    }

    private removeStalePageSubtitleTracks(sources: PageSubtitleSource[]): number {
        const sourceKeys = new Set(sources.map(source => source.sourceKey));
        const sourceUrls = new Set(sources.map(source => normalizedSubtitleUrl(source.url)));
        return this.removeSubtitleTracks(track => isStalePageSubtitleTrack(track, sourceKeys, sourceUrls));
    }

    private addOrUpdatePageSubtitleTracks(sources: PageSubtitleSource[], removed: number): { added: number; updated: number; removed: number } {
        const changes = { added: 0, updated: 0, removed };
        for (const source of sources) {
            const result = this.addOrUpdatePageSubtitleTrack(source);
            changes.added += result.added;
            changes.updated += result.updated;
        }
        return changes;
    }

    private finishPageSubtitleTrackDiscovery(changes: { added: number; updated: number; removed: number }): void {
        const generated = ensureTranslatedTargetTrack(this.tracks, this.options.getSettings().interfaceLanguage, this.subtitleLanguageContext);
        if (generated) this.maybeAutoSelectTranslatedTargetTrack();
        if (![generated, ...Object.values(changes)].some(Boolean)) return;
        this.renderTrackPanel();
        this.syncControls();
    }

    private addOrUpdatePageSubtitleTrack(source: PageSubtitleSource): { added: number; updated: number } {
        const existing = this.findPageSubtitleTrack(source);
        if (existing) return { added: 0, updated: updatePageSubtitleTrack(existing, source) ? 1 : 0 };
        const track = createPageSubtitleTrack(source, this.tracks.length);
        this.tracks.push(track);
        this.maybeAutoSelectPageSubtitleTrack(track);
        return { added: 1, updated: 0 };
    }

    private findPageSubtitleTrack(source: PageSubtitleSource): SubtitleTrackOption | undefined {
        return this.tracks.find(track => track.sourceKey === source.sourceKey || (track.url && sameSubtitleUrl(track.url, source.url)));
    }

    private maybeAutoSelectPageSubtitleTrack(option: SubtitleTrackOption): void {
        if (![option.kind === 'remote', Boolean(option.url)].every(Boolean)) return;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const secondary = this.tracks.find(track => track.id === this.secondaryTrackId);
        const role = autoSelectablePageTrackRole(option, {
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            selected,
            secondary,
            cues: this.cues,
            secondaryCues: this.secondaryCues,
        }, this.subtitleLanguageContext);
        if (!role) return;
        const select: Record<typeof role, () => void> = {
            primary: () => { void this.selectTrack(option.id, { auto: true }); },
            secondary: () => { void this.selectSecondaryTrack(option.id, { auto: true }); },
        };
        select[role]();
    }

    private maybeAutoSelectNativeTrack(option: SubtitleTrackOption): void {
        const track = option.track;
        if (!track) return;
        const role = autoSelectableNativeTrackRole(
            option,
            this.tracks,
            this.selectedTrackId,
            this.secondaryTrackId,
            this.subtitleLanguageContext,
        );
        if (role) this.autoSelectNativeTrack(option, track, role);
    }

    private maybeAutoSelectTranslatedTargetTrack(): void {
        if (this.selectedTrackId) return;
        const synthetic = this.tracks.find(track => track.translatedFromTrackId
            && isSubtitleTrackLanguage(track, this.subtitleLanguageContext.targetLanguage));
        if (synthetic) void this.selectTrack(synthetic.id, { auto: true });
    }

    private autoSelectNativeTrack(option: SubtitleTrackOption, track: TextTrack, role: 'primary' | 'secondary'): void {
        const requestId = this.trackSelections.begin(role);
        this.setSelectedNativeTrackId(role, option.id);
        ensureTextTrackReadable(track);
        void this.loadNativeTrackCues(option, role, requestId);
    }

    private setSelectedNativeTrackId(role: 'primary' | 'secondary', id: string): void {
        if (role === 'primary') this.selectedTrackId = id;
        else this.secondaryTrackId = id;
    }

    private async loadNativeTrackCues(option: SubtitleTrackOption, role: 'primary' | 'secondary', requestId: number): Promise<void> {
        const track = option.track;
        if (!track) return;
        const cues = readTextTrackCues(track);
        const loadedCues = cues.length ? cues : await waitForTextTrackCues(track);
        if (!this.isTrackSelectionCurrent(role, requestId, option.id)) return;
        // This path only runs for automatic selection — a single-line track
        // (one-cue credit, or metadata-only after normalization) isn't worth
        // auto-showing an overlay for; withdraw the pick, keep it selectable.
        if (loadedCues.length <= 1) {
            this.setSelectedNativeTrackId(role, '');
            option.loadingState = 'ready';
            this.syncControls();
            this.renderTrackPanel();
            return;
        }
        if (!this.canApplyNativeTrackCues(option, role, requestId, loadedCues)) return;
        this.applyNativeTrackCues(role, option.id, loadedCues);
        option.loadingState = 'ready';
        this.updateFromLoadedCues();
        this.render();
        this.syncControls();
    }

    private canApplyNativeTrackCues(option: SubtitleTrackOption, role: 'primary' | 'secondary', requestId: number, cues: SubtitleCue[]): boolean {
        return cues.length > 0 && this.isTrackSelectionCurrent(role, requestId, option.id);
    }

    private applyNativeTrackCues(role: 'primary' | 'secondary', optionId: string, cues: SubtitleCue[]): void {
        const option = this.tracks.find(track => track.id === optionId);
        if (option) option.cues = cues;
        if (role === 'primary' && this.selectedTrackId === optionId) this.cues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(optionId));
        if (role === 'secondary' && this.secondaryTrackId === optionId) this.secondaryCues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(optionId));
    }

    private updateFromNativeTrack(track: TextTrack): void {
        const active = track.activeCues?.[0] as VTTCue | TextTrackCue | undefined;
        if (!active) return;
        this.updatePrimaryNativeTrackCue(track, active);
        this.updateSecondaryNativeTrackCue(track, active);
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncPauseTranscriptPanel();
        this.syncControls();
    }

    private updatePrimaryNativeTrackCue(track: TextTrack, active: VTTCue | TextTrackCue): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        if (primary?.track === track) {
            const cues = readTextTrackCues(track);
            if (cues.length) primary.cues = cues;
            if (cues.length) {
                this.cues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(primary.id));
                this.updateFromLoadedCues();
                return;
            }
            this.currentCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active) }])[0];
            void this.autoCopyCurrentCue();
        }
    }

    private updateSecondaryNativeTrackCue(track: TextTrack, active: VTTCue | TextTrackCue): void {
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        if (secondary?.track === track) {
            const cues = readTextTrackCues(track);
            if (cues.length) secondary.cues = cues;
            if (cues.length) {
                this.secondaryCues = offsetSubtitleCues(cues, this.trackTimingOffsetSeconds(secondary.id));
                this.updateFromLoadedCues();
                return;
            }
            this.secondaryCue = normalizeSubtitleCues([{ start: active.startTime, end: active.endTime, text: getTextTrackCueText(active), transcriptEligible: false }])[0];
        }
    }

    private tick(): void {
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        if (!this.tickPlayerAndShouldContinue(settings)) { // Refresh/discovery wakes the parked timer.
            this.tickTimer = undefined;
            return;
        }
        const tickTimer = window.setTimeout(() => {
            if (this.tickTimer !== tickTimer) return;
            this.tickTimer = undefined;
            this.tick();
        }, this.tickDelayMs(settings));
        this.tickTimer = tickTimer;
    }

    private tickPlayerAndShouldContinue(settings: ReaderSettings): boolean {
        if (settings.subtitlePlayerEnabled && !document.hidden) this.tickSubtitlePlayer(settings);
        return settings.subtitlePlayerEnabled || Boolean(this.video);
    }

    private wakeTick(): void {
        if (this.destroyed || this.tickTimer !== undefined) return;
        this.tick();
    }

    // Idle cadence saves battery.
    private tickDelayMs(settings: ReaderSettings): number {
        if (document.hidden || !settings.subtitlePlayerEnabled || !this.video) return SUBTITLE_TICK_IDLE_MS;
        if (this.video.paused) return SUBTITLE_TICK_PAUSED_MS;
        return SUBTITLE_TICK_ACTIVE_MS;
    }

    private restartTickAfterVisibilityChange(): void {
        if (this.destroyed) return;
        if (document.hidden) {
            // A hidden tab must not hold a per-frame sampler: rVFC/rAF are
            // paused while hidden, but cancel explicitly so nothing re-arms.
            this.stopFrameSync();
            return;
        }
        if (this.video && !this.video.paused) this.startFrameSync(this.video);
        if (this.tickTimer === undefined) return;
        window.clearTimeout(this.tickTimer);
        this.tickTimer = undefined;
        this.tick();
    }

    private startFrameSync(video: HTMLVideoElement): void {
        // Frame-synced cue + karaoke sampler. The housekeeping tick (500ms) is too
        // coarse for cue boundaries — a line could flip up to a tick late, worse at
        // 1.5-2x playback — so sample once per presented frame while the bound video
        // plays. Cancelled on pause/seek-away/destroy/hidden so a paused or
        // backgrounded tab never spins. updateFromLoadedCues no-ops when the active
        // cue is unchanged, so the steady-state per-frame cost is two bounded cue
        // searches.
        if (this.destroyed || document.hidden || this.bufferingPlayback?.video === video) return;
        this.stopFrameSync();
        this.frameSyncVideo = video;
        this.scheduleFrameSync();
    }

    private scheduleFrameSync(): void {
        const video = this.frameSyncVideo;
        if (!video || this.frameSyncHandle !== undefined) return;
        const host = videoFrameCallbackHost(video);
        const run = () => {
            this.frameSyncHandle = undefined;
            if (this.destroyed || document.hidden) {
                this.frameSyncVideo = undefined;
                return;
            }
            const current = this.frameSyncVideo;
            if (!current || current.paused || !current.isConnected || this.bufferingPlayback?.video === current) {
                this.frameSyncVideo = undefined;
                return;
            }
            this.sampleSubtitleFrame(current);
            this.scheduleFrameSync();
        };
        this.frameSyncHandle = host ? host.requestVideoFrameCallback(run) : window.requestAnimationFrame(run);
    }

    private stopFrameSync(): void {
        const handle = this.frameSyncHandle;
        if (handle !== undefined) {
            const host = this.frameSyncVideo ? videoFrameCallbackHost(this.frameSyncVideo) : null;
            if (host) host.cancelVideoFrameCallback(handle);
            else window.cancelAnimationFrame(handle);
            this.frameSyncHandle = undefined;
        }
        this.frameSyncVideo = undefined;
    }

    private sampleSubtitleFrame(video: HTMLVideoElement): void {
        const settings = this.options.getSettings();
        if (!settings.subtitlePlayerEnabled) return;
        this.updateFromLoadedCues();
        this.syncShadowAutoPause();
        this.syncShadowLoop();
        this.syncPlayingVideoGeometry();
        if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) {
            this.applyKaraokeStateToPrimary(this.currentCue, this.subtitlePlaybackTime(video));
        }
    }

    private syncPlayingVideoGeometry(): void {
        const now = performance.now();
        if (now - this.lastFrameGeometrySampleAt < SUBTITLE_FRAME_GEOMETRY_SYNC_MS) return;
        this.lastFrameGeometrySampleAt = now;
        this.realignIfVideoMoved();
    }

    // The video the subtitle controller is currently bound to, when it is still
    // in the DOM. Consumed by the mining-pause path so it pauses the exact
    // player the overlay is tracking instead of a document-wide largest-video
    // heuristic (which mis-fires with ads/previews/miniplayers).
    // fallow-ignore-next-line unused-class-member
    getBoundVideo(): HTMLVideoElement | undefined {
        return this.video && this.video.isConnected ? this.video : undefined;
    }

    private tickSubtitlePlayer(settings: ReaderSettings): void {
        this.syncYouTubeMobileBottomSheetState();
        this.refreshSubtitleSourcesForTick();
        this.refreshNativeCueListsIfStale();
        this.setNativeTrackModes();
        this.syncShortsReelNavigation();
        this.updateFromLoadedCues();
        this.syncShadowAutoPause();
        this.syncShadowLoop();
        this.realignIfVideoMoved();
        this.syncPlayerChromeIdleState();
        this.syncNativeControlsInset();
        this.syncNativePlayerControlHitProtection();
        this.subtitleControlRail?.syncPosition();
        this.syncAsbPlayerSubtitleMoveHandles(settings);
        if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
        if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }

    private syncYouTubeMobileBottomSheetState(): void {
        setClassState(
            document.documentElement,
            YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS,
            hasOpenYouTubeMobileBottomSheet(),
        );
    }

    // The rail follows the player's own chrome: on phones there is no hover,
    // so the player's fade state is the only "controls are visible" signal
    // the viewer has — the rail must appear and disappear in lockstep.
    private syncPlayerChromeIdleState(): void {
        if (!this.root) return;
        const chromeHidden = this.videoPlayerChromeHidden();
        if (!this.hasAutoIdleMode(this.options.getSettings())) {
            this.setControlsAway(false);
            this.lastPlayerChromeHidden = chromeHidden;
            return;
        }
        if (!this.canObservePlayerChromeFade()) {
            // No native chrome to follow: the fully-hidden state is owned solely
            // by the idle timer (hideControlsImmediately). Leaving it untouched
            // here is what lets the rail actually disappear on generic players
            // instead of being un-hidden every tick.
            this.lastPlayerChromeHidden = chromeHidden;
            return;
        }
        if (chromeHidden) {
            if (this.shouldAutoIdleControls() && !this.subtitleSurfaceWakeActive) this.hideControlsImmediately();
        } else if (this.lastPlayerChromeHidden && this.isVideoPlayerChromeSurface()) {
            // Chrome just re-appeared (e.g. the viewer tapped the video):
            // re-reveal the rail alongside the player's own controls.
            this.showControlsTemporarily();
        }
        // An unfocused player hides the rail entirely (not just minimised):
        // it tracks the player's own chrome fade so the video stays clean. The
        // commit is debounced so a strobing autohide class cannot flash it.
        this.setControlsAway(chromeHidden && !this.subtitleSurfaceWakeActive && !this.hasActiveSubtitleUi());
        this.lastPlayerChromeHidden = chromeHidden;
    }

    // m.youtube.com stacks its own top control row (autoplay/CC/settings) in
    // the same corner the rail occupies, and the rail shows in lockstep with
    // that chrome — whenever both are visible they collide. Measure the native
    // top row and push the rail below it via a CSS inset variable.
    private syncNativeControlsInset(): void {
        if (!this.root) return;
        // The null path below still clears any previously-applied inset.
        const overlay = this.mobileYouTubeControlOverlay();
        this.root.classList.toggle('jpdb-subtitle-native-top-controls', Boolean(overlay));
        if (!overlay) {
            this.root.style.removeProperty('--jpdb-subtitle-native-top-inset');
            return;
        }
        const topRow = overlay.querySelector<HTMLElement>('.player-controls-top');
        const rowRect = topRow?.getBoundingClientRect();
        if (!rowRect || rowRect.height <= 0) return;
        const rootTop = this.root.getBoundingClientRect().top;
        const inset = Math.round(Math.min(Math.max(rowRect.bottom - rootTop + 8, 48), 160));
        this.root.style.setProperty('--jpdb-subtitle-native-top-inset', `${inset}px`);
    }

    private isVideoPlayerChromeSurface(): boolean {
        return Boolean(this.mobileYouTubeControlOverlay()
            || this.video?.closest('#movie_player, .html5-video-player'));
    }

    // #player-control-overlay is m.youtube-only chrome; everywhere else the
    // per-tick document query burned cycles to find nothing (profiled as part
    // of the tick's continuous cost).
    private mobileYouTubeControlOverlay(): HTMLElement | null {
        return isMobileYouTubePage()
            ? document.querySelector<HTMLElement>('#player-control-overlay')
            : null;
    }

    private refreshSubtitleSourcesForTick(): void {
        if (this.syncSubtitleSourceContext(this.video)) this.refreshDiscoveredSubtitleTracks();
        if (this.shouldRefreshYouTubeTracks()) void this.discoverYouTubeTracksThrottled();
    }

    private refreshDiscoveredSubtitleTracks(): void {
        this.discoverPageSubtitleTracks();
        void this.discoverYouTubeTracksThrottled(true);
    }

    private shouldRefreshYouTubeTracks(): boolean {
        return isYouTubePage()
            && Boolean(getYouTubeVideoId())
            && (!this.video || isYouTubeOwnedVideoElement(this.video))
            && (!this.selectedTrackId || !this.cues.length);
    }

    private shouldUpdateFromDomCaptions(): boolean {
        if (!isYouTubePage()) return true;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        // A concrete cue stream is already loading and preparing its first
        // annotated paint. Letting the current-only DOM fallback render during
        // this window creates the exact plain -> annotated flash that the
        // prewarm is intended to avoid.
        if (selected?.loadingState === 'loading') return false;
        return Boolean(getYouTubeVideoId())
            && isYouTubeOwnedVideoElement(this.video)
            && !this.cues.length
            && (Boolean(this.selectedTrackId) || !this.tracks.some(track => track.kind === 'youtube'));
    }

    // Re-reading (and normalizing) every cue of the selected tracks on each
    // 500ms tick AND every timeupdate was a continuous burner. Everything
    // event-observable (track add, selection change, cuechange, navigation,
    // video rebind) marks the dirty flag for an immediate refresh; silent
    // cue-list APPENDS fire no TextTrack event, so they are caught by the
    // bounded forced re-read (at most every 5s).
    private refreshNativeCueListsIfStale(): void {
        const now = performance.now();
        if (!this.nativeCueListsDirty && now - this.lastForcedNativeCueRefreshAt < SUBTITLE_TICK_FORCED_CUE_REFRESH_MS) return;
        this.nativeCueListsDirty = false;
        this.lastForcedNativeCueRefreshAt = now;
        this.refreshNativeCueLists();
    }

    private markNativeCueListsDirty(): void {
        this.nativeCueListsDirty = true;
    }

    // Completeness-sensitive discrete actions (opening a transcript-backed
    // panel, snapshotting a batch-mining scan) must not see up to the
    // staleness bound of silently-appended native cues: refresh NOW and reset
    // the gate so the next tick does not redo it.
    private forceNativeCueRefresh(): void {
        this.nativeCueListsDirty = false;
        this.lastForcedNativeCueRefreshAt = performance.now();
        this.refreshNativeCueLists();
    }

    private refreshNativeCueLists(): void {
        const primary = this.tracks.find(item => item.id === this.selectedTrackId);
        const secondary = this.tracks.find(item => item.id === this.secondaryTrackId);
        this.refreshNativeCueList(primary, this.cues.length, cues => { this.cues = cues; });
        this.refreshNativeCueList(secondary, this.secondaryCues.length, cues => { this.secondaryCues = cues; });
    }

    private refreshNativeCueList(track: SubtitleTrackOption | undefined, currentLength: number, assign: (cues: SubtitleCue[]) => void): void {
        if (!track?.track) return;
        const cues = readTextTrackCues(track.track);
        if (cues.length && cues.length !== currentLength) assign(cues);
    }

    private alignToVideo(): void {
        if (!this.root) return;
        if (this.video && this.videoCandidateLossTimer !== undefined) {
            // Discovery has already declared the bound element transiently
            // unavailable. Resize/fullscreen callbacks and the active tick can
            // still arrive during the grace window; measuring the detached
            // element here would convert its zero rect into an out-of-view
            // class and visually erase the held annotated cue.
            return;
        }
        if (!this.video) {
            this.pinnedPlayer.reset();
            setClassState(this.root, 'jpdb-subtitle-has-video-frame', false);
            setClassState(this.root, 'jpdb-subtitle-compact-video', false);
            setClassState(this.root, 'jpdb-subtitle-video-out-of-view', true);
            this.lastAlignedVideoRectKey = '';
            this.positionTranscriptPanel();
            return;
        }
        const rect = this.videoLayoutRect();
        // Fullscreen measures the viewport, not the frame's own box, so there is
        // nothing worth reading into the frame's position while it lasts; the
        // tracker suspends the pin and keeps what it already knew.
        this.pinnedPlayer.observe(this.video, rect, this.fullscreen);
        this.lastAlignedVideoRectKey = videoRectKey(rect);
        this.applyVideoLayout(rect);
    }

    // Reel-to-reel Shorts swipes (and other in-page layout shifts) move the
    // active <video> WITHOUT a resize, window scroll, or yt-navigate-finish, so
    // none of the alignment triggers fire and the overlay stays stuck
    // out-of-view until a play/pause re-aligns it. The tick already runs while
    // playing; cheaply re-align whenever the video's on-screen box has moved.
    private realignIfVideoMoved(): void {
        if (!this.video || !this.root) return;
        if (this.videoCandidateLossTimer !== undefined) return;
        const rect = this.videoLayoutRect();
        // Re-align when the video moved (a Shorts swipe reuses the element at the
        // same box, but other layout shifts move it) OR when the overlay's shown
        // state no longer matches what it should be — e.g. a reel becomes
        // renderable again after a transient hidden frame during the swipe, which
        // otherwise leaves the overlay latched out-of-view.
        const shouldShow = this.isVideoOverlayVisible(rect);
        const isShowing = !this.root.classList.contains('jpdb-subtitle-video-out-of-view');
        if (shouldShow !== isShowing || videoRectKey(rect) !== this.lastAlignedVideoRectKey) this.scheduleAlignToVideo();
    }

    private syncShortsReelNavigation(): void {
        // Swiping between Shorts reels reuses the same <video> element at the same
        // position and emits no yt-navigate-finish, so the controller never treats
        // it as navigation: tracks/overlay stay bound to the previous reel and the
        // overlay can latch out-of-view until an unrelated DOM mutation (a manual
        // pause/resume) happens to re-trigger discovery. Poll the active /shorts/ id
        // from the tick and run the normal navigation path when it changes.
        const pathname = typeof globalThis.location?.pathname === 'string' ? globalThis.location.pathname : '';
        if (!pathname.startsWith('/shorts/')) {
            this.lastShortsNavVideoId = '';
            return;
        }
        const videoId = getYouTubeVideoId();
        if (!videoId || videoId === this.lastShortsNavVideoId) return;
        const firstSync = this.lastShortsNavVideoId === '';
        this.lastShortsNavVideoId = videoId;
        // The very first short is already handled by initial discovery; only act
        // on genuine reel-to-reel changes.
        if (!firstSync) this.handleYouTubeNavigation();
    }

    // Judge the frame where the document put it, not where the page parked it: a
    // player the page pinned to the viewport as the reader scrolled past is a
    // fully visible box that nobody is looking at, and the overlay belongs with
    // the content the reader left behind.
    private isVideoOverlayVisible(rect: DOMRect): boolean {
        const gateRect = this.fullscreen ? rect : this.pinnedPlayer.visibilityRect(this.video, rect);
        return isSubtitleOverlayVideoVisible(gateRect)
            && (!isYouTubePage() || this.fullscreen || youtubeWatchPlayerMeaningfullyVisible(gateRect))
            && (!this.video || isSubtitleVideoElementRenderable(this.video))
            && this.videoHasPlayerAffordances();
    }

    private applyVideoLayout(rect: DOMRect): void {
        if (!this.root) return;
        const videoVisible = this.isVideoOverlayVisible(rect);
        setClassState(this.root, 'jpdb-subtitle-video-out-of-view', !videoVisible);
        setClassState(this.root, 'jpdb-subtitle-has-video-frame', videoVisible);
        if (!videoVisible) {
            setClassState(this.root, 'jpdb-subtitle-compact-video', false);
            this.clearVideoInsetForTranscriptPanel();
            this.positionTranscriptPanel();
            return;
        }
        const layout = subtitleOverlayLayout(rect);
        setClassState(this.root, 'jpdb-subtitle-compact-video', layout.width < 560 || layout.height < 260);
        if (rect.width < 120 || rect.height < 80) {
            applyElementLayout(this.root, {
                left: 0,
                top: 0,
                width: this.transcriptViewportWidth(),
                height: this.transcriptViewportHeight(),
            });
            this.positionTranscriptPanel();
            this.syncSubtitleTextSize();
            return;
        }
        applyElementLayout(this.root, layout);
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncSubtitleTextSize();
        this.syncNativePlayerControlHitProtection();
        this.subtitleControlRail?.syncPosition();
    }

    private updateFromLoadedCues(): void {
        if (!this.video) return;
        const time = this.subtitlePlaybackTime(this.video);
        const secondary = this.secondaryTrackId
            ? (findActiveSubtitleCue(this.secondaryCues, time) ?? findInitialLeadInCue(this.secondaryCues, time))
            : undefined;
        const cue = this.selectedTrackId ? this.findRenderablePrimaryCue(time, secondary) : undefined;
        if (this.updateLoadedCueState(cue, secondary, time)) this.afterLoadedCueStateChanged();
        else this.warmParseOnGapAnchorJump();
    }

    private subtitlePlaybackTime(video: HTMLVideoElement): number {
        return this.bufferingPlayback?.video === video
            ? this.bufferingPlayback.time
            : video.currentTime;
    }

    private findRenderablePrimaryCue(time: number, activeSecondary?: SubtitleCue): SubtitleCue | undefined {
        // Auto-generated YouTube captions and their `&tlang=` translations are
        // segmented independently, so the primary (JP) cue often begins a beat
        // after — or falls into a gap relative to — the native (EN) line that's
        // already active. That left no primary cue at the playhead while a native
        // cue was active, showing the native line alone (user-reported). When the
        // direct lookup misses but a native cue is active, surface the primary
        // aligned to it so the pair appears together. Mirrors
        // primaryHeldByActiveSecondary for the not-yet-shown direction.
        const direct = findActiveSubtitleCue(this.cues, time) ?? findInitialLeadInCue(this.cues, time);
        if (direct || !activeSecondary || !this.cues.length) return direct;
        return findAlignedCue(this.cues, activeSecondary);
    }

    // A repeated seek that lands in another inter-cue gap changes no cue
    // state, so afterLoadedCueStateChanged never fires; re-anchor the parse
    // warmup whenever the playhead's upcoming cue moved anyway.
    private warmParseOnGapAnchorJump(): void {
        if (this.currentCue || !this.selectedTrackId || !this.cues.length) return;
        if (this.parseWarmupAnchorIndex() === this.lastParseWarmupAnchor) return;
        this.warmParseAroundActiveCue();
    }

    private updateLoadedCueState(cue: SubtitleCue | undefined, secondary: SubtitleCue | undefined, time: number): boolean {
        // Evaluate both, not `||`: short-circuiting skipped the secondary
        // update on any tick the primary also changed, so a freshly active
        // line showed its translation only one tick later (lines out of sync).
        const primaryChanged = this.updateLoadedPrimaryCue(cue, time);
        const secondaryChanged = this.updateLoadedSecondaryCue(secondary);
        return primaryChanged || secondaryChanged;
    }

    private afterLoadedCueStateChanged(): void {
        this.warmParseAroundActiveCue();
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncPauseTranscriptPanel();
        this.syncControls();
        this.scheduleTranscriptCacheWarmup();
        void this.autoCopyCurrentCue();
    }

    private updateLoadedPrimaryCue(cue: SubtitleCue | undefined, time: number): boolean {
        if (shouldReplaceLoadedCue(cue, this.currentCue)) return this.replaceLoadedPrimaryCue(cue);
        if (shouldClearLoadedCue(cue, this.currentCue, time) && !this.primaryHeldByActiveSecondary(time)) {
            return this.clearLoadedPrimaryCue();
        }
        return false;
    }

    private primaryHeldByActiveSecondary(time: number): boolean {
        // Auto-generated YouTube captions and their `&tlang=` translations are
        // normalized independently (text-overlap rolling-cue merge), so the
        // primary line's cue often ends a beat before its translation's does.
        // Clearing the primary on its own boundary left the translation showing
        // alone (user-reported). Hold the primary while the still-active secondary
        // cue is the one aligned to it, so the pair appears and clears as a unit.
        if (!this.secondaryTrackId || !this.currentCue || !this.secondaryCues.length) return false;
        const activeSecondary = findActiveSubtitleCue(this.secondaryCues, time);
        return Boolean(activeSecondary && findAlignedCue(this.secondaryCues, this.currentCue) === activeSecondary);
    }

    private replaceLoadedPrimaryCue(cue: SubtitleCue): boolean {
        this.clearShadowRecordingIfCueChanged(cue);
        if (this.shadowAutoPausedCueSignature !== subtitleCueSignature(cue)) this.shadowAutoPausedCueSignature = '';
        this.currentCue = cue;
        return true;
    }

    private clearLoadedPrimaryCue(): boolean {
        this.clearShadowRecordingIfCueChanged(undefined);
        this.shadowAutoPausedCueSignature = '';
        this.currentCue = undefined;
        // A cleared DOM-caption cue (seek, expiry) must be re-appliable even
        // when the page still shows the identical text; the stability clock
        // in pendingDomCaption is kept so the re-apply is immediate.
        this.lastDomCaption = '';
        this.lastDomCaptionSeenAt = 0;
        return true;
    }

    private updateLoadedSecondaryCue(secondary: SubtitleCue | undefined): boolean {
        if (secondary === this.secondaryCue) return false;
        this.secondaryCue = secondary;
        return true;
    }

    private updateFromDomCaptions(): void {
        const fallback = this.domCaptionFallback();
        if (!fallback) return;
        this.applyDomCaptionFallback(fallback.text, fallback.selected);
    }

    private domCaptionFallback(): { text: string; selected: SubtitleTrackOption | undefined } | null {
        if (this.cues.length) return null;
        let selected = this.tracks.find(track => track.id === this.selectedTrackId);
        if (!this.shouldUseDomCaptionFallback(selected)) return null;
        selected = this.ensureDomCaptionFallbackTrack(selected);
        return this.readStableDomCaptionFallback(selected);
    }

    private readStableDomCaptionFallback(
        selected: SubtitleTrackOption | undefined,
    ): { text: string; selected: SubtitleTrackOption | undefined } | null {
        this.ensureYouTubeDomCaptionFallbackActive(selected);
        const text = readPageCaptionText(this.video, this.root, {
            allowAnyCaptionScript: this.shouldAllowAnyCaptionScriptDomCaptionFallback(selected),
        });
        if (!text) {
            this.clearDomCaptionFallbackIfExpired();
            return null;
        }
        this.keepDomCaptionCueAlive(text);
        return this.isDomCaptionStable(text, performance.now()) ? { text, selected } : null;
    }

    // The synthetic DOM-caption cue gets a 4s guess for its duration; lines
    // the page keeps showing longer used to expire mid-display and could
    // never re-apply (same text). Renew the cue while the page still shows it.
    private keepDomCaptionCueAlive(text: string): void {
        if (this.cues.length || !this.currentCue) return;
        if (text !== this.lastDomCaption) return;
        this.lastDomCaptionSeenAt = performance.now();
        const now = this.video ? this.subtitlePlaybackTime(this.video) : 0;
        if (now >= this.currentCue.start && this.currentCue.end < now + 1) {
            this.currentCue.end = now + 4;
            this.refreshNativeFullscreenCueMirror();
        }
    }

    private ensureYouTubeDomCaptionFallbackActive(selected: SubtitleTrackOption | undefined): void {
        if (selected?.kind !== 'youtube') return;
        if (this.youtubeDomCaptionFallbackTrackId !== this.selectedTrackId) return;
        const now = performance.now();
        if (now - this.lastYouTubeCaptionActivationAt < YOUTUBE_CAPTION_ACTIVATION_RETRY_MS) return;
        this.lastYouTubeCaptionActivationAt = now;
        activateYouTubeCaptionTrack(selected);
    }

    private shouldUseDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        if (!this.canUseDomCaptionFallback(selected)) return false;
        return this.options.getSettings().subtitleOverlayVisible || this.isTranscriptPanelOpen();
    }

    private canUseDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        return canUseSubtitleDomCaptionFallback({
            selected,
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            cues: this.cues,
            video: this.video,
        });
    }

    private ensureDomCaptionFallbackTrack(selected: SubtitleTrackOption | undefined): SubtitleTrackOption | undefined {
        if (!isYouTubePage() || selected || this.tracks.some(track => track.kind === 'youtube')) return selected;
        if (!youtubeVideoHasNativeCaptions()) return selected;
        const track = this.createYouTubeDomCaptionFallbackTrack();
        this.tracks.push(track);
        this.selectedTrackId = track.id;
        this.youtubeDomCaptionFallbackTrackId = track.id;
        return track;
    }

    private createYouTubeDomCaptionFallbackTrack(): SubtitleTrackOption {
        const videoId = getYouTubeVideoId();
        return {
            id: `youtube-dom-${this.youtubeVideoId || videoId}`,
            label: 'YouTube native captions',
            kind: 'youtube',
            loadingState: 'waiting',
            sourceKey: YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY,
        };
    }

    private shouldAllowAnyCaptionScriptDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        // While a target-language track is loading, YouTube's own caption overlay shows its default
        // (e.g. Arabic); mirroring that flashes foreign subs before the
        // requested ones arrive (user-reported).
        return Boolean(selected?.kind === 'youtube'
            && selected.sourceKey !== YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY
            && !isTargetLanguageSubtitleTrack(selected));
    }

    private clearDomCaptionFallbackIfExpired(): void {
        if (this.shouldHoldRecentDomCaption()) return;
        this.pendingDomCaption = undefined;
        if (!this.cues.length && this.currentCue && (this.video ? this.subtitlePlaybackTime(this.video) : 0) > this.currentCue.end) {
            this.currentCue = undefined;
            this.lastDomCaption = '';
            this.lastDomCaptionSeenAt = 0;
            this.render();
            this.syncControls();
            this.refreshNativeFullscreenCueMirror();
        }
    }

    private shouldHoldRecentDomCaption(): boolean {
        if (this.cues.length || !this.currentCue || !this.lastDomCaptionSeenAt) return false;
        return performance.now() - this.lastDomCaptionSeenAt < DOM_CAPTION_MISSING_GRACE_MS;
    }

    private isDomCaptionStable(text: string, nowMs: number): boolean {
        if (this.pendingDomCaption?.text !== text) {
            this.beginPendingDomCaption(text, nowMs);
            return false;
        }
        return this.pendingDomCaptionIsReady(this.pendingDomCaption, text, nowMs);
    }

    private beginPendingDomCaption(text: string, nowMs: number): void {
        const pending = { text, firstSeenAt: nowMs, parseSettled: !this.shouldParseSubtitles() };
        this.pendingDomCaption = pending;
        // Keep the page caption visible while the exact Yomu render is
        // prepared. Publishing only after this settles prevents a plain
        // subtitle from acquiring furigana/pitch after it is on screen.
        this.warmDomCaptionParse(text, pending);
    }

    private pendingDomCaptionIsReady(
        pending: { firstSeenAt: number; parseSettled: boolean },
        text: string,
        nowMs: number,
    ): boolean {
        return pending.parseSettled
            && nowMs - pending.firstSeenAt >= DOM_CAPTION_STABLE_DELAY_MS
            && text !== this.lastDomCaption;
    }

    private warmDomCaptionParse(
        text: string,
        pending: { text: string; firstSeenAt: number; parseSettled: boolean },
    ): void {
        if (!text.trim() || !this.shouldParseSubtitles()) {
            pending.parseSettled = true;
            return;
        }
        // Warm the texts that will actually render: applyDomCaptionFallback
        // normalizes and sentence-splits the raw caption, so warming the raw
        // string would cache under a key no render ever reads and the line
        // would parse only AFTER the stability window.
        const texts = this.domCaptionCueTexts(text);
        if (!texts.length) {
            pending.parseSettled = true;
            return;
        }
        void this.parseCueHtmlBatch(texts, this.options.getSettings(), {
            enrichBeforeRender: true,
            requireEnrichedProvisional: true,
        }).catch(() => undefined).finally(() => {
            if (this.pendingDomCaption !== pending) return;
            pending.parseSettled = true;
            this.wakeTick();
        });
    }

    private domCaptionCueTexts(text: string): string[] {
        return normalizeSubtitleCues([{ start: 0, end: 4, text }])
            .map(cue => cue.text.trim())
            .filter(Boolean);
    }

    private applyDomCaptionFallback(text: string, selected: SubtitleTrackOption | undefined): void {
        this.lastDomCaption = text;
        this.lastDomCaptionSeenAt = performance.now();
        const now = this.video ? this.subtitlePlaybackTime(this.video) : 0;
        this.currentCue = normalizeSubtitleCues([{ start: now, end: now + 4, text }])[0];
        if (selected?.loadingState === 'waiting') selected.loadingState = 'ready';
        // Paint the already-settled first frame before taking caption
        // ownership. Both operations happen in one JS turn, so the host and
        // Yomu layers never share a painted frame.
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncControls();
        this.refreshNativeFullscreenCueMirror();
        void this.autoCopyCurrentCue();
    }

    private render(): void {
        if (!this.subtitleEl) return;
        const settings = this.options.getSettings();
        const text = this.currentCue?.text.trim() ?? '';
        if (!text) {
            this.renderEmptySubtitle(settings);
        } else {
            this.renderActiveSubtitle(text, settings);
        }
        this.syncNativeCaptionOwnership(settings);
    }

    private syncNativeCaptionOwnership(settings: ReaderSettings): void {
        const next = this.shouldSuppressNativeCaptions(settings);
        if (this.nativeCaptionOwnership === next) return;
        this.setNativeTrackModes();
    }

    private renderEmptySubtitle(settings: ReaderSettings): void {
        if (!this.subtitleEl) return;
        this.applyPrimaryRow(null);
        this.applySecondaryLine(settings);
        // Ending a cue ends its visual lifetime. A later visit to the same
        // text may use background-enriched cache data from its first frame.
        this.lastRenderedPrimaryKey = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
    }

    private renderActiveSubtitle(text: string, settings: ReaderSettings): void {
        if (!this.subtitleEl) return;
        const primary = this.renderPrimarySubtitle(text, settings);
        const changed = this.applyPrimaryRow(primary.html);
        this.applySecondaryLine(settings);
        this.applyRenderedPrimarySubtitle(primary, text, settings);
        // Re-applying state colors only matters when the DOM was rebuilt;
        // re-notifying on identical renders made pitch/state highlights
        // flicker out under time-driven render ticks (user-reported).
        if (changed && primary.html) this.notifyParsedTokensForRenderedPrimary(text, settings, primary.html);
    }

    private applyPrimaryRow(html: string | null): boolean {
        // The subtitle body holds two independent rows: the annotated primary line
        // and the native caption line, which is a real control (tap to hide or
        // reveal the translation). Writing both as one innerHTML blob meant every
        // primary change — a new cue, a karaoke tick, a parse landing — also tore
        // down and rebuilt that button. A browser only delivers click when the
        // pressed node is still in the document at release, so any tap spanning a
        // caption change was dropped and had to be repeated (owner-reported on
        // phones). Each row now reconciles on its own, so a primary render can
        // never take the native line out from under a finger.
        //
        // render() also runs on every cue/time/settings tick; rebuilding identical
        // DOM each tick wiped the async-applied word-state coloring and caused a
        // visible rerender flicker plus constant layout work (user-reported), so
        // both rows keep their applied-state guard.
        const content = subtitleContentLanguage(
            this.tracks.find(track => track.id === this.selectedTrackId),
            this.subtitleLanguageContext.targetContent,
        );
        const result = reconcileSubtitlePrimaryRow({
            host: this.subtitleEl,
            html,
            appliedHtml: this.lastAppliedPrimaryRowHtml,
            content,
        });
        this.lastAppliedPrimaryRowHtml = result.appliedHtml;
        return result.changed;
    }

    private applySecondaryLine(settings: ReaderSettings): void {
        reconcileSubtitleSecondaryLine({
            host: this.subtitleEl,
            text: this.secondaryCue?.text,
            visible: settings.subtitleSecondaryVisible,
            content: subtitleContentLanguage(
                this.tracks.find(track => track.id === this.secondaryTrackId),
                this.subtitleLanguageContext.outputContent,
            ),
            blurred: settings.subtitleNativeBlurred,
            language: settings.interfaceLanguage,
        });
    }

    // A cache-hit render (e.g. stepping back to a previous line) inserts fresh
    // DOM, so JPDB/Anki state colors must be re-applied to the new nodes even
    // though the parse itself was cached.
    private notifyParsedTokensForRenderedPrimary(text: string, settings: ReaderSettings, html: string): void {
        if (!parsedSubtitleHtmlHasReaderWords(html)) return;
        const primary = this.subtitleEl?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary) return;
        this.notifyParsedTokensForKey(this.parseCacheKey(text, settings), true, [primary]);
    }

    private renderPrimarySubtitle(text: string, settings: ReaderSettings): ReturnType<typeof renderSubtitlePrimary> {
        const activeCue = this.currentCue;
        const parseKey = this.parseCacheKey(text, settings);
        const parsedHtml = this.primaryParsedHtmlForRender(text, settings, parseKey);
        return renderControllerPrimarySubtitle({
            cue: activeCue,
            text,
            settings,
            parseKey,
            parsedHtml,
            lastRenderedKey: this.lastRenderedPrimaryKey,
            lastRenderedText: this.lastRenderedPrimaryText,
            lastRenderedHtml: this.lastRenderedPrimaryHtml,
            hasFreshEmptyParsedHtml: this.htmlCache.hasFreshEmptyParsedHtml(parseKey),
            hasParser: this.shouldParseSubtitles(settings),
            time: this.video ? this.subtitlePlaybackTime(this.video) : activeCue?.start ?? 0,
        });
    }

    private primaryParsedHtmlForRender(text: string, settings: ReaderSettings, key: string): string | undefined {
        // Paused annotations are a plain-text contract even when this cue has a
        // warm parsed cache entry from before the pause.
        if (!this.shouldParseSubtitles(settings)) return undefined;
        // The active cue has one visual commit. Background pitch/card
        // enrichment may improve caches and transcript rows for the next visit,
        // but it must not add marks to words already being read on screen.
        const committed = this.committedPrimaryParsedHtml(key);
        if (committed !== undefined) return committed;
        const cached = this.cachedParsedCueHtml(key, settings);
        if (cached !== undefined) return cached;
        return this.provisionalPrimaryParsedHtmlForRender(text, settings, key);
    }

    private committedPrimaryParsedHtml(key: string): string | undefined {
        if (this.lastRenderedPrimaryKey !== key) return undefined;
        return this.lastRenderedPrimaryHtml || undefined;
    }

    private provisionalPrimaryParsedHtmlForRender(
        text: string,
        settings: ReaderSettings,
        key: string,
    ): string | undefined {
        const provisional = this.htmlCache.provisionalParsedHtmlCache.get(key);
        if (provisional === undefined) return undefined;
        return this.preparedProvisionalPrimaryHtml(text, settings, key, provisional);
    }

    private preparedProvisionalPrimaryHtml(
        text: string,
        settings: ReaderSettings,
        key: string,
        provisional: string,
    ): string | undefined {
        if (!this.shouldUseProvisionalSubtitleParse(settings)) return provisional;
        if (this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)) {
            this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return provisional;
        }
        if (!this.prepareUnenrichedProvisionalPrimary(text, settings, key)) return undefined;
        return provisional;
    }

    private prepareUnenrichedProvisionalPrimary(text: string, settings: ReaderSettings, key: string): boolean {
        if (this.hasAuthoritativeParseTier(settings)) {
            this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return false;
        }
        this.ensureEnrichedProvisionalParsedCueHtml(text, settings, key);
        // A cheap tokenization result is not a visual commit. Its mutable token
        // objects may still receive furigana, pitch and state during
        // beforeRenderTokens; expose the cue only after that enrichment pass
        // marks the provisional entry settled.
        return false;
    }

    private applyRenderedPrimarySubtitle(
        primary: ReturnType<typeof renderSubtitlePrimary>,
        text: string,
        settings: ReaderSettings,
    ): void {
        this.applyRenderedPrimaryKaraoke(primary);
        this.syncSubtitleTextSize();
        this.syncNativePlayerControlHitProtection();
        this.cacheRenderedPrimarySubtitle(primary, settings);
        this.requestParsedPrimaryIfNeeded(primary, text);
    }

    private applyRenderedPrimaryKaraoke(primary: ReturnType<typeof renderSubtitlePrimary>): void {
        const activeCue = this.currentCue;
        if (primary.karaokeActive && activeCue) this.applyKaraokeStateToPrimary(activeCue, this.video ? this.subtitlePlaybackTime(this.video) : activeCue.start);
    }

    private cacheRenderedPrimarySubtitle(
        primary: ReturnType<typeof renderSubtitlePrimary>,
        settings: ReaderSettings,
    ): void {
        if (!primary.nextRenderedPrimary) return;
        this.lastRenderedPrimaryKey = this.parseCacheKey(primary.nextRenderedPrimary.text, settings);
        this.lastRenderedPrimaryText = primary.nextRenderedPrimary.text;
        this.lastRenderedPrimaryHtml = primary.nextRenderedPrimary.html;
    }

    private requestParsedPrimaryIfNeeded(primary: ReturnType<typeof renderSubtitlePrimary>, text: string): void {
        if (primary.shouldRequestParse) void this.renderParsedPrimary(text);
    }

    private async renderParsedPrimary(text: string): Promise<void> {
        const settings = this.options.getSettings();
        const key = this.parseCacheKey(text, settings);
        const serial = ++this.renderSerial;
        const cached = this.htmlCache.parsedHtmlCache.get(key);
        if (cached) {
            this.applyParsedPrimaryHtml(key, text, cached, serial);
            return;
        }

        try {
            const html = await this.parseCueHtml(text, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });
            this.applyParsedPrimaryHtml(key, text, html, serial);
        } catch {
            if (!this.htmlCache.isCurrentParseKey(key)) return;
            // Parsing/enrichment failure is a settled plain fallback, not a
            // perpetual blank or retry loop. Commit it once for this cue's
            // visual lifetime; a later visit may retry after the empty-cache
            // TTL without mutating words already on screen.
            const fallback = escapeWithBreaks(text);
            const settled = this.htmlCache.rememberPlainCueFallback(key, fallback);
            this.applyParsedPrimaryHtml(key, text, settled, serial);
        }
    }

    private shouldParseSubtitles(settings = this.options.getSettings()): boolean {
        return canParseSubtitleTranscriptRows(settings);
    }

    private parseCacheKey(text: string, settings = this.options.getSettings()): string {
        return this.htmlCache.parseCacheKey(text, settings);
    }

    private async parseCueHtml(text: string, settings = this.options.getSettings(), options: ParseCueHtmlOptions = {}): Promise<string> {
        const key = this.parseCacheKey(text, settings);
        const cached = this.cachedParsedCueHtml(key, settings);
        if (cached) {
            return cached;
        }
        if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings) && this.shouldBypassProvisionalForAuthoritative(settings, options)) {
            return await this.parseAuthoritativeCueHtml(text, settings, key);
        }
        const emptyCached = this.freshEmptyParsedHtml(key);
        if (emptyCached) return emptyCached;
        if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) return await this.parseProvisionalCueHtml(text, settings, key, options);
        const pending = this.pendingParsedCueHtml(key, 'authoritative');
        if (pending) return pending;
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text, this.finalSubtitleParseOptions(settings));
            if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            return this.rememberParsedCueHtml(key, html, tokens).html;
        })();
        this.htmlCache.pendingParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            this.htmlCache.pendingParsedHtml.delete(key);
        }
    }

    private async parseAuthoritativeCueHtml(text: string, settings: ReaderSettings, key: string): Promise<string> {
        this.ensureAuthoritativeParsedCueHtml(text, settings, key);
        const pending = this.htmlCache.pendingParsedHtml.get(key);
        if (pending) return pending;
        const cached = this.cachedParsedCueHtml(key, settings);
        if (cached) return cached;
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text, authoritativeSubtitleParseOptions());
            await this.beforeRenderParsedTokens(tokens);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            const remembered = this.rememberParsedCueHtml(key, html, tokens, { forceNotify: true });
            if (!remembered.provisional) this.applyAuthoritativeParsedCueHtml(key, remembered.html);
            return remembered.html;
        })();
        this.htmlCache.pendingParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            if (this.htmlCache.pendingParsedHtml.get(key) === promise) this.htmlCache.pendingParsedHtml.delete(key);
        }
    }

    private async parseProvisionalCueHtml(text: string, settings: ReaderSettings, key: string, options: ParseCueHtmlOptions = {}): Promise<string> {
        const restored = this.htmlCache.restoreSessionParsedCueHtml(key);
        if (restored) return restored;
        const shouldUpgradeAuthoritative = options.authoritativeUpgrade !== false;
        const cached = this.htmlCache.provisionalParsedHtmlCache.get(key);
        const cachedIsEnriched = this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key);
        if (cached
            && (!options.refreshProvisional || cachedIsEnriched)
            && (!options.requireEnrichedProvisional || cachedIsEnriched)) {
            if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return cached;
        }
        const pending = (options.refreshProvisional
            ? this.htmlCache.pendingProvisionalParsedHtml.get(key)
            : this.pendingParsedCueHtml(key, 'provisional')) as PendingProvisionalParse | undefined;
        if (pending && (!options.refreshProvisional
            || !options.requireEnrichedProvisional
            || pending.yomuEnriched)) {
            const html = await pending;
            if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return html;
        }
        const promise: PendingProvisionalParse = (async () => {
            const tokens = await this.options.parseJapanese(text, provisionalSubtitleParseOptions());
            if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            return this.rememberParsedCueHtml(key, html, tokens, {
                provisional: true,
                enriched: this.shouldMarkCueEnriched(key, tokens, options.enrichBeforeRender === true),
            }).html;
        })();
        if (options.enrichBeforeRender) promise.yomuEnriched = true;
        this.htmlCache.pendingProvisionalParsedHtml.set(key, promise);
        try {
            const html = await promise;
            if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return html;
        } finally {
            if (this.htmlCache.pendingProvisionalParsedHtml.get(key) === promise) {
                this.htmlCache.pendingProvisionalParsedHtml.delete(key);
            }
        }
    }

    private ensureEnrichedProvisionalParsedCueHtml(text: string, settings: ReaderSettings, key: string): void {
        const pending = this.htmlCache.pendingProvisionalParsedHtml.get(key) as PendingProvisionalParse | undefined;
        if (this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key) || pending?.yomuEnriched) return;
        void this.parseProvisionalCueHtml(text, settings, key, {
            authoritativeUpgrade: false,
            enrichBeforeRender: true,
            requireEnrichedProvisional: true,
            refreshProvisional: true,
        }).then(html => {
            if (!this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)) return;
            this.updateTranscriptRowsForParseKey(key, html, { provisional: true, force: true });
        }).catch(() => undefined);
    }

    private ensureAuthoritativeParsedCueHtml(text: string, settings: ReaderSettings, key: string): void {
        this.ensureAuthoritativeParsedCueHtmlBatch([{ text, key }], settings);
    }

    private ensureAuthoritativeParsedCueHtmlBatch(items: SubtitleParseBatchItem[], settings: ReaderSettings): void {
        if (!this.shouldParseSubtitles()) return;
        // Without an API credential there is no authoritative tier to upgrade
        // to; the provisional parse is the final result for both surfaces.
        if (!this.hasAuthoritativeParseTier(settings)) return;
        const missing = items.filter(item => this.cachedParsedCueHtml(item.key, settings) === undefined && !this.htmlCache.pendingParsedHtml.has(item.key));
        if (!missing.length) return;
        const parsed = this.parseAuthoritativeSubtitleItems(missing);
        const enriched = this.enrichParsedTokenBatchBeforeRender(parsed);
        const parsedHtml = missing.map((item, index) => enriched.then(tokens => {
            const tokenList = tokens[index] ?? [];
            const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
            return this.rememberAuthoritativeParsedCueHtml(item.key, html, tokenList);
        }));
        missing.forEach((item, index) => this.htmlCache.pendingParsedHtml.set(item.key, parsedHtml[index]));
        void Promise.allSettled(parsedHtml).finally(() => {
            missing.forEach((item, index) => {
                if (this.htmlCache.pendingParsedHtml.get(item.key) === parsedHtml[index]) this.htmlCache.pendingParsedHtml.delete(item.key);
            });
        });
    }

    private parseAuthoritativeSubtitleItems(items: SubtitleParseBatchItem[]): Promise<JPDBToken[][]> {
        const texts = items.map(item => item.text);
        if (this.options.parseJapaneseBatch) {
            return this.options.parseJapaneseBatch(texts, authoritativeSubtitleParseOptions());
        }
        return Promise.all(texts.map(text => this.options.parseJapanese(text, authoritativeSubtitleParseOptions())));
    }

    private rememberAuthoritativeParsedCueHtml(key: string, html: string, tokens: JPDBToken[]): string {
        const remembered = this.rememberParsedCueHtml(key, html, tokens, { forceNotify: true });
        if (!remembered.provisional) this.applyAuthoritativeParsedCueHtml(key, remembered.html);
        return remembered.html;
    }

    private applyAuthoritativeParsedCueHtml(key: string, html: string): void {
        this.updateTranscriptRowsForParseKey(key, html);
    }

    // Late token enrichment (public jpdb pitch lookups, fallback-vocabulary
    // resolution) mutates the cached token objects AFTER their cue html was
    // baked. Re-baking the cached html keeps every re-render — Previous/Next
    // steps, transcript rows, session restores — pre-coloured with the
    // enriched pitch and word state instead of silently dropping it on the
    // next cache hit (UT-66).
    refreshParsedCueTexts(texts: string[]): void {
        if (!texts.length || !this.shouldParseSubtitles()) return;
        const settings = this.options.getSettings();
        const seen = new Set<string>();
        for (const raw of texts) {
            const text = raw.trim();
            if (!text) continue;
            const key = this.parseCacheKey(text, settings);
            if (seen.has(key)) continue;
            seen.add(key);
            this.rebakeParsedCueHtml(key, text, settings);
        }
    }

    private rebakeParsedCueHtml(key: string, text: string, settings: ReaderSettings): void {
        const tokens = this.htmlCache.parsedTokenCache.get(key);
        if (!tokens?.length) return;
        const provisional = !this.htmlCache.parsedHtmlCache.has(key) && this.htmlCache.provisionalParsedHtmlCache.has(key);
        const previous = provisional ? this.htmlCache.provisionalParsedHtmlCache.get(key) : this.htmlCache.parsedHtmlCache.get(key);
        if (previous === undefined) return;
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        if (html === previous) return;
        const remembered = this.rememberParsedCueHtml(key, html, tokens, provisional ? { provisional: true, enriched: true } : {});
        this.updateTranscriptRowsForParseKey(key, remembered.html, { provisional: remembered.provisional, force: true });
    }

    private applyParsedPrimaryHtml(key: string, text: string, html: string, serial: number): void {
        if (!this.shouldParseSubtitles()) return;
        if (serial !== this.renderSerial) return;
        if (!this.currentCueMatchesParseKey(key, text)) return;
        this.lastRenderedPrimaryKey = key;
        this.lastRenderedPrimaryText = text;
        this.lastRenderedPrimaryHtml = html;
        // Re-enter the normal render transaction so a pending state with no
        // primary row can create its first DOM node, and so karaoke/state
        // reconciliation follows the same path as cache hits.
        this.render();
    }

    private currentCueMatchesParseKey(key: string, text: string): boolean {
        return this.currentCue?.text.trim() === text
            && this.parseCacheKey(text) === key;
    }

    private async parseCueHtmlBatch(texts: string[], settings = this.options.getSettings(), options: ParseCueHtmlOptions = {}): Promise<ParsedSubtitleHtmlResult[]> {
        const items = uniqueSubtitleParseTexts(texts).map(text => ({ text, key: this.parseCacheKey(text, settings) }));
        if (options.allowProvisional !== false && this.shouldUseProvisionalSubtitleParse(settings)) {
            if (this.shouldBypassProvisionalForAuthoritative(settings, options)) return await this.parseAuthoritativeCueHtmlBatch(items, settings);
            return await this.parseCueHtmlBatchWithProvisionalFallback(items, settings, options);
        }

        const { ready, batch } = planSubtitleParseBatch(
            items,
            // Keyless there is nothing to upgrade to, so a provisional hit is
            // final here too — without it the transcript-tail warmup
            // (allowProvisional: false) re-parsed every already-parsed cue a
            // second time through the local tokenizer.
            key => this.cachedParsedCueHtml(key, settings)
                ?? this.freshEmptyParsedHtml(key)
                ?? (this.hasAuthoritativeParseTier(settings) ? undefined : this.htmlCache.provisionalParsedHtmlCache.get(key)),
            key => this.pendingParsedCueHtml(key, 'authoritative'),
        );
        if (!batch.length) {
            return this.htmlCache.canonicalParsedHtmlResults(await Promise.all(ready));
        }
        if (!this.options.parseJapaneseBatch) {
            return this.htmlCache.canonicalParsedHtmlResults(await Promise.all([...ready, ...batch.map(async item => ({
                key: item.key,
                html: await this.parseCueHtml(item.text, settings, options),
            }))]));
        }

        const parsed = this.options.parseJapaneseBatch(batch.map(item => item.text), this.finalSubtitleParseOptions(settings));
        const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { enrichBeforeRender: options.enrichBeforeRender });
        return await this.htmlCache.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.htmlCache.pendingParsedHtml);
    }

    private async parseAuthoritativeCueHtmlBatch(items: SubtitleParseBatchItem[], settings: ReaderSettings): Promise<ParsedSubtitleHtmlResult[]> {
        if (!items.length) return [];
        this.ensureAuthoritativeParsedCueHtmlBatch(items, settings);
        const results = await Promise.all(items.map(async item => {
            const cached = this.cachedParsedCueHtml(item.key, settings);
            if (cached) return { key: item.key, html: cached };
            const pending = this.htmlCache.pendingParsedHtml.get(item.key);
            const html = pending ? await pending : await this.parseAuthoritativeCueHtml(item.text, settings, item.key);
            return { key: item.key, html };
        }));
        // One item may be ready while another is still parsing. Canonicalize
        // only after the whole keyed batch settles so a cache upgrade that
        // lands during that wait is reflected in every returned item.
        return this.htmlCache.canonicalParsedHtmlResults(results);
    }

    private async parseCueHtmlBatchWithProvisionalFallback(
        items: SubtitleParseBatchItem[],
        settings: ReaderSettings,
        options: ParseCueHtmlOptions = {},
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const shouldUpgradeAuthoritative = options.authoritativeUpgrade !== false;
        const { ready, batch } = planProvisionalSubtitleParseBatch(
            items,
            key => this.htmlCache.parsedHtmlCache.get(key),
            key => this.usableProvisionalParsedHtml(key, options),
            key => options.refreshProvisional ? undefined : this.pendingParsedCueHtml(key, 'provisional'),
            key => this.freshEmptyParsedHtml(key),
        );
        if (shouldUpgradeAuthoritative) {
            const batchedItems = new Set(batch);
            this.ensureAuthoritativeParsedCueHtmlBatch(items.filter(item => !batchedItems.has(item)), settings);
        }
        if (!batch.length) {
            return this.htmlCache.canonicalParsedHtmlResults(await Promise.all(ready));
        }
        const parsed = this.options.parseJapaneseBatch
            ? this.options.parseJapaneseBatch(batch.map(item => item.text), provisionalSubtitleParseOptions())
            : Promise.all(batch.map(item => this.options.parseJapanese(item.text, provisionalSubtitleParseOptions())));
        const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { provisional: true, enrichBeforeRender: options.enrichBeforeRender });
        const results = await this.htmlCache.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.htmlCache.pendingProvisionalParsedHtml);
        if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtmlBatch(batch, settings);
        return results;
    }

    private renderParsedHtmlBatch(
        batch: SubtitleParseBatchItem[],
        parsed: Promise<JPDBToken[][]>,
        settings: ReaderSettings,
        options: { provisional?: boolean; enrichBeforeRender?: boolean } = {},
    ): Promise<ParsedSubtitleHtmlResult>[] {
        const prepared = options.enrichBeforeRender ? this.enrichParsedTokenBatchBeforeRender(parsed) : parsed;
        return batch.map((item, index) => prepared.then(tokens => {
            const tokenList = tokens[index] ?? [];
            const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
            const remembered = this.rememberParsedCueHtml(item.key, html, tokenList, {
                ...options,
                enriched: this.shouldMarkCueEnriched(item.key, tokenList, options.enrichBeforeRender === true),
            });
            return remembered.provisional
                ? { key: item.key, html: remembered.html, provisional: true }
                : { key: item.key, html: remembered.html };
        }));
    }

    private async parseTranscriptRowHtmlBatch(
        items: TranscriptParseItem[],
        rows: TranscriptRow[],
        settings: ReaderSettings,
        options: ParseCueHtmlOptions = {},
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const plain: TranscriptParseItem[] = [];
        const contextual: TranscriptParseItem[] = [];
        for (const item of items) {
            if (this.shouldParseTranscriptRowWithContext(rows, item.rowIndex)) contextual.push(item);
            else plain.push(item);
        }
        const results = await Promise.all([
            plain.length ? this.parseCueHtmlBatch(plain.map(item => item.text), settings, options) : Promise.resolve([]),
            contextual.length ? this.parseTranscriptContextHtmlBatch(contextual, rows, settings, options) : Promise.resolve([]),
        ]);
        return results.flat();
    }

    private async parseTranscriptContextHtmlBatch(
        items: TranscriptParseItem[],
        rows: TranscriptRow[],
        settings: ReaderSettings,
        options: ParseCueHtmlOptions = {},
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const provisional = options.allowProvisional !== false
            && this.shouldUseProvisionalSubtitleParse(settings)
            && !this.shouldBypassProvisionalForAuthoritative(settings, options);
        const pendingCache = provisional ? this.htmlCache.pendingProvisionalParsedHtml : this.htmlCache.pendingParsedHtml;
        const parseOptions = provisional ? provisionalSubtitleParseOptions() : this.finalSubtitleParseOptions(settings);
        const ready: Promise<ParsedSubtitleHtmlResult>[] = [];
        const batch: Array<TranscriptParseItem & { context: TranscriptContextWindow }> = [];

        for (const item of items) {
            const cached = this.cachedTranscriptContextHtml(item.key, settings, options, provisional);
            if (cached) {
                ready.push(Promise.resolve(cached));
                continue;
            }
            const pending = pendingCache.get(item.key);
            if (pending && !(provisional && options.refreshProvisional)) {
                ready.push(pending.then(html => provisional ? { key: item.key, html, provisional: true } : { key: item.key, html }));
                continue;
            }
            batch.push({ ...item, context: this.transcriptContextWindow(rows, item.rowIndex) });
        }

        if (!batch.length) {
            return this.htmlCache.canonicalParsedHtmlResults(await Promise.all(ready));
        }
        const parsed = this.options.parseJapaneseBatch
            ? this.options.parseJapaneseBatch(batch.map(item => item.context.text), parseOptions)
            : Promise.all(batch.map(item => this.options.parseJapanese(item.context.text, parseOptions)));
        const prepared = options.enrichBeforeRender ? this.enrichParsedTokenBatchBeforeRender(parsed) : parsed;
        const parsedHtml = batch.map((item, index) => prepared.then(tokenRows => {
            const rowTokens = this.projectTranscriptContextTokens(tokenRows[index] ?? [], item.context);
            const html = withBreaks(renderTokensToHtml(item.text, rowTokens, settings));
            const remembered = this.rememberParsedCueHtml(item.key, html, rowTokens, {
                provisional,
                enriched: this.shouldMarkCueEnriched(item.key, rowTokens, options.enrichBeforeRender === true),
            });
            return remembered.provisional
                ? { key: item.key, html: remembered.html, provisional: true }
                : { key: item.key, html: remembered.html };
        }));
        return await this.htmlCache.resolveParsedHtmlBatch(ready, batch, parsedHtml, pendingCache);
    }

    private cachedTranscriptContextHtml(
        key: string,
        settings: ReaderSettings,
        options: ParseCueHtmlOptions,
        provisional: boolean,
    ): ParsedSubtitleHtmlResult | undefined {
        const authoritative = this.cachedParsedCueHtml(key, settings);
        if (authoritative) return { key, html: authoritative };
        const empty = this.freshEmptyParsedHtml(key);
        if (empty) return { key, html: empty, provisional: provisional || undefined };
        if (provisional) {
            const html = this.usableProvisionalParsedHtml(key, options);
            if (html) return { key, html, provisional: true };
        } else if (!this.hasAuthoritativeParseTier(settings)) {
            const html = this.htmlCache.provisionalParsedHtmlCache.get(key);
            if (html) return { key, html, provisional: true };
        }
        return undefined;
    }

    private projectTranscriptContextTokens(tokens: JPDBToken[], context: TranscriptContextWindow): JPDBToken[] {
        return tokens.flatMap(token => this.projectTranscriptContextToken(token, context));
    }

    private projectTranscriptContextToken(token: JPDBToken, context: TranscriptContextWindow): JPDBToken[] {
        const start = Math.max(token.start, context.rowStart);
        const end = Math.min(token.end, context.rowEnd);
        if (end <= start) return [];
        return [{
            ...token,
            start: start - context.rowStart,
            end: end - context.rowStart,
            length: end - start,
            rubies: this.projectTranscriptContextRubies(token, start, end, context.rowStart),
        }];
    }

    private projectTranscriptContextRubies(token: JPDBToken, start: number, end: number, rowStart: number): JPDBToken['rubies'] {
        return token.rubies.flatMap(ruby => {
            const rubyStart = Math.max(ruby.start, start);
            const rubyEnd = Math.min(ruby.end, end);
            if (rubyEnd <= rubyStart) return [];
            return [{
                ...ruby,
                start: rubyStart - rowStart,
                end: rubyEnd - rowStart,
                length: rubyEnd - rubyStart,
            }];
        });
    }

    private async enrichParsedTokenBatchBeforeRender(parsed: Promise<JPDBToken[][]>): Promise<JPDBToken[][]> {
        const tokenRows = await parsed;
        await this.beforeRenderParsedTokens(tokenRows.flat());
        return tokenRows;
    }

    private async beforeRenderParsedTokens(tokens: JPDBToken[]): Promise<void> {
        if (!this.shouldParseSubtitles() || !tokens.length || !this.options.beforeRenderTokens) return;
        await this.options.beforeRenderTokens(tokens);
    }

    private usableProvisionalParsedHtml(key: string, options: Pick<ParseCueHtmlOptions, 'refreshProvisional' | 'requireEnrichedProvisional'>): string | undefined {
        return this.htmlCache.usableProvisionalParsedHtml(key, options);
    }

    private shouldMarkCueEnriched(key: string, tokens: JPDBToken[], enrichRequested: boolean): boolean {
        return this.htmlCache.shouldMarkCueEnriched(key, tokens, enrichRequested);
    }

    private rememberParsedCueHtml(key: string, html: string, tokens: JPDBToken[] = [], options: { provisional?: boolean; forceNotify?: boolean; enriched?: boolean } = {}): SubtitleParsedCueHtmlWriteResult {
        return this.htmlCache.rememberParsedCueHtml(key, html, tokens, options);
    }

    private hasAuthoritativeParseTier(settings = this.options.getSettings()): boolean {
        return hasJpdbApiCredential(settings) || hasJitenApiCredential(settings);
    }

    private finalSubtitleParseOptions(settings: ReaderSettings): SubtitleParseOptions {
        return this.hasAuthoritativeParseTier(settings) ? authoritativeSubtitleParseOptions() : subtitleParseOptions(settings);
    }

    private shouldBypassProvisionalForAuthoritative(settings: ReaderSettings, options: ParseCueHtmlOptions): boolean {
        return options.requireEnrichedProvisional === true && this.hasAuthoritativeParseTier(settings);
    }

    private notifyParsedTokensForKey(key: string, force = false, roots?: ParentNode[]): void {
        if (!this.shouldParseSubtitles() || !this.options.afterParseTokens) return;
        const tokens = this.htmlCache.parsedTokenCache.get(key);
        if (!tokens?.length) return;
        const now = Date.now();
        const lastNotifiedAt = this.htmlCache.parsedTokenNotifiedAt.get(key) ?? 0;
        if (!force && now - lastNotifiedAt < SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS) return;
        this.htmlCache.parsedTokenNotifiedAt.set(key, now);
        this.options.afterParseTokens(tokens, roots);
    }

    private shouldUseProvisionalSubtitleParse(_settings: ReaderSettings): boolean {
        // The provisional tier (skipJpdb + segmented fallback) is also the
        // keyless parse, so overlay cues render colorised immediately even
        // without an API key instead of waiting on the slow JPDB-timeout path.
        return isYouTubePage();
    }

    private freshEmptyParsedHtml(key: string): string | undefined {
        return this.htmlCache.freshEmptyParsedHtml(key);
    }

    private warmParseAroundActiveCue(): void {
        if (!this.shouldParseSubtitles() || !this.cues.length) return;
        const anchor = this.parseWarmupAnchorIndex();
        this.lastParseWarmupAnchor = anchor;
        const start = Math.max(0, anchor - SUBTITLE_ACTIVE_PREPARSE_BEHIND);
        const end = Math.min(this.cues.length, anchor + SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1);
        const serial = ++this.parseWarmupSerial;
        const settings = this.options.getSettings();
        const priorityWarmup = this.prewarmPriorityYouTubeCues(anchor, settings, serial).catch(() => undefined);
        this.priorityYouTubeCueWarmup = priorityWarmup;
        void (async () => {
            // The ordinary window stays batched for throughput, but its one
            // flat before-render enrichment promise made an upcoming cue wait
            // for every later cue's public lookups. Finish the first-paint
            // lanes before starting that tail so they do not contend in the
            // shared public vocabulary/pitch queues.
            await priorityWarmup;
            if (serial !== this.parseWarmupSerial) return;
            const texts = this.subtitleWarmupTexts(start, end, settings);
            if (texts.length) {
                try {
                    // Warm ahead with enrichment so upcoming overlay cues do
                    // not appear until furigana/pitch-ready HTML is cached.
                    await this.parseCueHtmlBatch(texts, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });
                } catch {
                }
            }
            if (serial !== this.parseWarmupSerial) return;
            if (this.currentCue?.text.trim()) this.render();
        })();
    }

    private async prewarmPriorityYouTubeCues(anchor: number, settings: ReaderSettings, serial: number): Promise<void> {
        if (!this.supportsPriorityYouTubeWarmup(settings)) return;
        // Reserve the cue at the playhead and its successor outside the flat
        // lookahead batch. Enrich them in playback order: independent
        // Promise.all lanes each carry their own Jiten detail fan-out, which
        // could multiply endpoint concurrency precisely while first paint is
        // most latency-sensitive.
        for (const priorityIndex of [anchor, anchor + 1]) {
            if (this.parseWarmupWasCancelled(serial)) return;
            await this.prewarmPriorityYouTubeCue(priorityIndex, settings, serial);
        }
    }

    private supportsPriorityYouTubeWarmup(settings: ReaderSettings): boolean {
        return isYouTubePage() && this.shouldUseProvisionalSubtitleParse(settings);
    }

    private async prewarmPriorityYouTubeCue(index: number, settings: ReaderSettings, serial: number): Promise<void> {
        const target = this.priorityYouTubeCueWarmupTarget(index, settings);
        if (!target) return;
        await this.pendingPriorityYouTubeCue(target.key);
        if (!this.priorityYouTubeCueStillNeedsWarmup(target.key, settings, serial)) return;
        await this.parseCueHtml(target.text, settings, {
            enrichBeforeRender: true,
            requireEnrichedProvisional: true,
            // A cheap transcript parse may have populated a provisional tier
            // without running before-render enrichment.
            refreshProvisional: true,
        });
    }

    private priorityYouTubeCueWarmupTarget(
        index: number,
        settings: ReaderSettings,
    ): { text: string; key: string } | undefined {
        const text = this.cues[index]?.text.trim();
        if (!text) return undefined;
        const key = this.parseCacheKey(text, settings);
        return this.isWarmParsedCueKey(key, settings) ? undefined : { text, key };
    }

    private async pendingPriorityYouTubeCue(key: string): Promise<void> {
        const pending = this.pendingParsedCueHtml(key, 'provisional')
            ?? this.pendingParsedCueHtml(key, 'authoritative');
        await pending?.catch(() => undefined);
    }

    private priorityYouTubeCueStillNeedsWarmup(key: string, settings: ReaderSettings, serial: number): boolean {
        return !this.parseWarmupWasCancelled(serial) && !this.isWarmParsedCueKey(key, settings);
    }

    private parseWarmupWasCancelled(serial: number): boolean {
        return serial !== this.parseWarmupSerial || !this.shouldParseSubtitles();
    }

    // A seek that lands between cues has no active cue; anchoring the warmup
    // window at the next upcoming cue (instead of the transcript start) keeps
    // the "active cue + lookahead warm within one turn" guarantee after long
    // seeks in either direction.
    private parseWarmupAnchorIndex(): number {
        const active = this.activeTranscriptIndex();
        if (active >= 0) return active;
        const time = this.video ? this.subtitlePlaybackTime(this.video) : 0;
        const upcoming = this.cues.findIndex(cue => cue.end >= time);
        return upcoming >= 0 ? upcoming : Math.max(0, this.cues.length - 1);
    }

    private subtitleWarmupTexts(start: number, end: number, settings: ReaderSettings): string[] {
        const texts: string[] = [];
        const seen = new Set<string>();
        for (let index = start; index < end; index++) {
            const text = this.cues[index]?.text.trim();
            if (!text) continue;
            const key = this.parseCacheKey(text, settings);
            if (seen.has(key) || this.isWarmParsedCueKey(key, settings)) continue;
            seen.add(key);
            texts.push(text);
        }
        return texts;
    }

    // Keyless there is no authoritative tier, so a provisional hit is final
    // and the cue counts as warm; keyed the provisional tier stays listed so
    // a failed authoritative upgrade is retried by the next warmup turn.
    private isWarmParsedCueKey(key: string, settings = this.options.getSettings()): boolean {
        if (this.cachedParsedCueHtml(key, settings) !== undefined || this.htmlCache.hasFreshEmptyParsedHtml(key)) return true;
        return !this.hasAuthoritativeParseTier(settings) && this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key);
    }

    private cachedParsedCueHtml(key: string, settings: ReaderSettings): string | undefined {
        return this.htmlCache.cachedParsedCueHtml(key, settings);
    }

    private pendingParsedCueHtml(key: string, tier: 'authoritative' | 'provisional'): Promise<string> | undefined {
        return this.htmlCache.pendingParsedCueHtml(key, tier);
    }

    private applyEffectiveSubtitleBottom(): void {
        if (!this.root) return;
        this.root.style.setProperty('--subtitle-bottom', `${this.effectiveSubtitleBottomPercent()}%`);
    }

    private effectiveSubtitleBottomPercent(preferred = this.options.getSettings().subtitleBottomOffset): number {
        const root = this.root;
        if (!root) return preferred;
        const positionRect = root.getBoundingClientRect();
        const viewport = subtitleVisibleViewportSize();
        const visualViewport = window.visualViewport;
        const viewportTop = visualViewport
            && Math.round(visualViewport.width) === viewport.width
            && Math.round(visualViewport.height) === viewport.height
            ? visualViewport.offsetTop
            : 0;
        return reachableSubtitleBottomPercent({
            preferredBottomPercent: preferred,
            positionRect,
            viewportTop,
            viewportHeight: viewport.height,
            subtitleHeight: root.querySelector<HTMLElement>('.jpdb-subtitle-text')?.getBoundingClientRect().height ?? 0,
        });
    }

    private syncSubtitleTextSize(): void {
        if (!this.root) return;
        // The frame just changed size/orientation (reel swipe, rotate, inset):
        // recompute the default bottom clearance for portrait/Shorts here too.
        this.applyEffectiveSubtitleBottom();
        // The labelled pixel setting is authoritative. Cue changes, late
        // furigana hydration, fullscreen/zoom transitions and background tabs
        // may all report different (or temporarily zero) layout measurements;
        // none of them may silently rewrite the user's saved size. The subtitle
        // grid wraps and lets residual height extend upward instead.
        this.syncRootFontSize(this.options.getSettings());
    }

    private applyKaraokeStateToPrimary(cue: SubtitleCue, time: number): void {
        this.karaokeSampler.applyKaraokeStateToPrimary(cue, time);
    }

    private handleClick(event: MouseEvent): void {
        const eventTarget = event.target as HTMLElement;
        if (shouldPreservePlainSubtitleSelection(eventTarget, this.options.getSettings().annotationsPaused)) {
            // A drag selection ends with a click. Plain transcript rows are
            // themselves cue actions, and the native subtitle line is a blur
            // toggle, so letting that click through would seek/toggle and can
            // destroy the text selection the learner just made.
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (eventTarget.closest?.('.jpdb-reader-word')) return;
        if (this.panelOptionsMenuOpen && !eventTarget.closest?.('[data-panel-options]')) this.closePanelOptionsMenu();
        const insideStylePopover = Boolean(eventTarget.closest?.('[data-subtitle-style-popover]'));
        const target = eventTarget.closest<HTMLElement>('[data-action]');
        const action = target?.dataset.action;
        if (!action) {
            if (insideStylePopover) {
                event.stopPropagation();
                this.showControlsTemporarily();
            }
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        // Every rail/panel action wants the controls awake, but the native
        // caption line is an action painted on the video itself: hiding the
        // translation must not be paid for with an expanded rail.
        if (!this.isNativeSubtitleBlurControl(target)) this.showControlsTemporarily();

        const handler = this.clickHandlers[action];
        if (!handler) return;
        handler(target);
        if (event.detail > 0) target.closest<HTMLButtonElement>('button')?.blur();
        if (action !== 'menu') this.syncControls();
    }

    private handleSubtitleStyleInput(event: Event): void {
        const target = event.target instanceof HTMLElement
            ? event.target.closest<HTMLInputElement | HTMLSelectElement>('[data-subtitle-style-setting]')
            : null;
        if (!target || !this.root?.contains(target)) return;
        event.stopPropagation();
        const explicitUserChoiceKeys = applySubtitleStyleControl(this.options.getSettings(), target);
        if (!explicitUserChoiceKeys) return;
        this.syncRootStyleSettings(this.options.getSettings());
        this.syncSubtitleStyleControls();
        this.render();
        this.options.onSettingsChange(explicitUserChoiceKeys);
        this.showControlsTemporarily();
    }

    private stopSubtitleStylePopoverPropagation(event: Event): void {
        event.stopPropagation();
        this.showControlsTemporarily();
    }

    private rowIndexFromTarget(target: HTMLElement): number {
        return Number(target.closest<HTMLElement>('[data-row-index]')?.dataset.rowIndex);
    }

    private trackIdFromTarget(target: HTMLElement): string | undefined {
        return target.closest<HTMLElement>('[data-track-id]')?.dataset.trackId;
    }

    private adjustTrackTimingOffset(id: string | undefined, deltaSeconds: number): void {
        if (!id) return;
        this.setTrackTimingOffset(id, this.trackTimingOffsetSeconds(id) + deltaSeconds);
    }

    private alignTrackTimingOffset(id: string | undefined, forward: boolean): void {
        if (!id || !this.video) return;
        const cue = this.adjacentTrackTimingCue(id, forward);
        if (!cue) return;
        this.setTrackTimingOffset(id, this.video.currentTime - cue.start);
    }

    private setTrackTimingOffset(id: string | undefined, offsetSeconds: number): void {
        if (!id) return;
        const track = this.tracks.find(item => item.id === id);
        if (!track) return;
        const role = this.trackSelectionRole(id);
        const previousOffset = this.trackTimingOffsetSeconds(id);
        const baseCues = role ? this.baseCuesForSelectedTrack(id, role, previousOffset) : [];
        const nextOffset = normalizeSubtitleTimingOffsetSeconds(offsetSeconds);
        if (nextOffset) track.timingOffsetSeconds = nextOffset;
        else delete track.timingOffsetSeconds;
        if (role) this.applySelectedTrackTimingOffset(id, role, baseCues, nextOffset);
        this.afterTrackTimingOffsetChanged();
    }

    private applySelectedTrackTimingOffset(
        id: string,
        role: SubtitleTrackSelectionRole,
        baseCues: SubtitleCue[],
        offsetSeconds: number,
    ): void {
        const adjusted = offsetSubtitleCues(baseCues, offsetSeconds);
        if (role === 'primary') {
            if (id !== this.selectedTrackId) return;
            this.cues = adjusted;
            this.currentCue = undefined;
            this.invalidatePrimaryCueRender();
            return;
        }
        if (id !== this.secondaryTrackId) return;
        this.secondaryCues = adjusted;
        this.secondaryCue = undefined;
    }

    private afterTrackTimingOffsetChanged(): void {
        this.lastTranscriptSignature = '';
        this.clearTranscriptVirtualRender();
        this.updateFromLoadedCues();
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncControls();
        this.warmParseAroundActiveCue();
        this.scheduleTranscriptCacheWarmup();
        void this.autoCopyCurrentCue();
    }

    private trackSelectionRole(id: string): SubtitleTrackSelectionRole | undefined {
        if (id === this.selectedTrackId) return 'primary';
        if (id === this.secondaryTrackId) return 'secondary';
        return undefined;
    }

    private baseCuesForSelectedTrack(
        id: string,
        role: SubtitleTrackSelectionRole,
        previousOffset = this.trackTimingOffsetSeconds(id),
    ): SubtitleCue[] {
        const track = this.tracks.find(item => item.id === id);
        if (track?.cues?.length) return track.cues;
        const cues = role === 'primary' ? this.cues : this.secondaryCues;
        return offsetSubtitleCues(cues, -previousOffset);
    }

    private trackTimingOffsetSeconds(id: string): number {
        return normalizeSubtitleTimingOffsetSeconds(this.tracks.find(track => track.id === id)?.timingOffsetSeconds);
    }

    private adjacentTrackTimingCue(id: string, forward: boolean): SubtitleCue | undefined {
        if (!this.video) return undefined;
        const role = this.trackSelectionRole(id);
        if (!role) return undefined;
        const baseCues = this.baseCuesForSelectedTrack(id, role);
        const offset = this.trackTimingOffsetSeconds(id);
        return adjacentSubtitleCueForOffset(baseCues, this.video.currentTime, offset, forward);
    }

    private transcriptPlacementFromTarget(target: HTMLElement): ReaderSettings['subtitleTranscriptPlacement'] | undefined {
        const placement = target.closest<HTMLElement>('[data-placement]')?.dataset.placement;
        return placement === 'left' || placement === 'right' || placement === 'bottom' ? placement : undefined;
    }

    private changeTranscriptPlacement(target: HTMLElement): void {
        const placement = this.transcriptPlacementFromTarget(target);
        if (!placement) return;
        this.closePanelOptionsMenu();
        const settings = this.options.getSettings();
        if (placement === this.plannedTranscriptPlacement()) return;
        settings.subtitleTranscriptPlacement = placement;
        if (placement !== 'bottom') this.clampStoredSideWidthForCurrentVideo(placement);
        this.options.onSettingsChange(['subtitleTranscriptPlacement']);
        if (this.panelMode === 'tracks' || !this.hasTranscriptSurface()) this.renderOpenSubtitlePanel();
        else {
            this.lastTranscriptSignature = '';
            this.syncPanelPlacementButtons();
        }
        this.clearVideoInsetForTranscriptPanel();
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncControls();
    }

    private resetSubtitleStyleDefaults(): void {
        const settings = this.options.getSettings();
        const explicitUserChoiceKeys = resetSubtitleStyleSettings(settings);
        this.resetLegacySubtitleDragOffset();
        this.syncRootStyleSettings(settings);
        this.syncSubtitleStyleControls();
        this.render();
        if (explicitUserChoiceKeys) {
            // Reset WITHDRAWS the style choices instead of declaring the
            // defaults it just wrote: pinning them made "restore defaults" pin
            // native subtitles ON as though the learner had asked for them.
            this.options.onSettingsChange(NO_EXPLICIT_USER_CHOICE, explicitUserChoiceKeys);
        }
        this.showControlsTemporarily();
    }

    private handlePointerActivity(event: PointerEvent): void {
        if (event.type === 'pointermove') {
            this.pendingPointerActivity = { x: event.clientX, y: event.clientY };
            if (this.pointerActivityFrame !== undefined) return;
            this.pointerActivityFrame = requestAnimationFrame(() => {
                this.pointerActivityFrame = undefined;
                const activity = this.pendingPointerActivity;
                this.pendingPointerActivity = undefined;
                if (activity) this.syncPointerActivity(activity.x, activity.y);
            });
            return;
        }
        // Pointerdowns inside the transcript panel never bubble to the document
        // (the panel owns its pointer events), so reaching here means the press
        // landed outside it — dismiss the panel-options popover.
        this.closePanelOptionsMenu();
        // The capture-phase subtitle-surface handler already woke controls for
        // this press. Do not let the bubbling activity path immediately hide
        // them merely because a displaced caption sits outside the video rect.
        if (this.pointInVisibleSubtitleSurface(event.clientX, event.clientY)) return;
        this.syncPointerActivity(event.clientX, event.clientY);
    }

    // A displaced subtitle can leave its move handle outside the player while
    // native chrome is hidden. Wake from a deliberate press inside the visible
    // subtitle rectangle so it remains recoverable; the document-level hit
    // test does not add a pointer-catching layer over transparent player space.
    private wakeControlsFromSubtitleSurface(event: PointerEvent): void {
        const target = event.target instanceof Element ? event.target : null;
        if (!this.pointInVisibleSubtitleSurface(event.clientX, event.clientY)) return;
        // Pressing inside a reader dialog that happens to overlap the video is
        // not a press on the subtitle surface, so it must not wake the rail.
        // The subtitle UI is itself a reader surface, and pressing THAT is
        // exactly the gesture this wake exists for, so it stays eligible.
        if (target && !this.isInSubtitleUi(target) && this.isInReaderSurface(target)) return;
        // The native caption line is not blank subtitle space — it IS the blur
        // toggle. A press that lands on it is a deliberate act on that control,
        // so the geometric wake must yield rather than answer the tap by
        // unfolding the rail over the video. Touch decides this at pointerdown:
        // this capture-phase handler runs before any click handler, so gating
        // only the click would still expand the rail as the finger lands.
        if (target && this.isNativeSubtitleBlurControl(target)) return;
        this.showControlsTemporarily({ independentOfPlayerChrome: true });
    }

    private handleSubtitleSurfaceClick(event: MouseEvent): void {
        if (!this.pointInVisibleSubtitleSurface(event.clientX, event.clientY)) return;
        const target = event.target instanceof Element ? event.target : null;
        const hitSubtitleContent = Boolean(target && this.isInSubtitleUi(target));
        if (hitSubtitleContent) return;
        if (target && this.isInReaderSurface(target)) return;
        // While the subtitle is still over the video, preserve the player's
        // native click/tap behavior (play/pause or revealing its own chrome).
        // The click shield is only for a displaced line landing over page
        // content below the player.
        if (target && this.isInNativeVideoPlayer(target)) return;
        // The subtitle frame itself intentionally has pointer-events:none so
        // annotated words remain the only painted hit targets. Once the line
        // is moved outside the player, however, blank space in that frame can
        // sit over links or buttons. Treat that rectangle as the player's
        // focus surface and never leak the resulting click to the page below.
        event.preventDefault();
        event.stopPropagation();
        const player = this.video?.closest<HTMLElement>('#movie_player, .html5-video-player');
        const focusTarget = player?.hasAttribute('tabindex') ? player : this.video;
        focusTarget?.focus({ preventScroll: true });
    }

    private handleSubtitleUiFocusOut(event: FocusEvent): void {
        const previous = event.target instanceof Element ? event.target : null;
        if (!previous || !this.isInSubtitleUi(previous)) return;
        const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (next && this.isInSubtitleUi(next)) return;
        // focusout fires during the focus transfer. Re-check in a microtask so
        // :focus-within reflects the destination before deciding to restart
        // the normal idle countdown.
        const signal = this.abortController?.signal;
        queueMicrotask(() => {
            if (this.destroyed || signal?.aborted) return;
            if (!this.hasActiveSubtitleUi()) this.scheduleControlsIdle();
        });
    }

    private handleSubtitleUiFocusIn(event: FocusEvent): void {
        const target = this.subtitleUiFocusTarget(event.target);
        if (!target) return;
        // Tapping the native caption line focuses it on the browsers that focus
        // buttons from a press, which would wake the rail through the back door
        // after the pointerdown and click gates have both declined. A keyboard
        // user who deliberately tabbed there still gets the reveal.
        if (this.nativeSubtitleFocusShouldRemainIdle(target)) return;
        // Idle controls remain in the accessibility tree as a skip-link-style
        // gateway. Real DOM focus must paint the whole control cluster even on
        // touch browsers whose :focus-within invalidation can lag behind Tab.
        this.showControlsTemporarily();
    }

    private subtitleUiFocusTarget(target: EventTarget | null): Element | null {
        if (!(target instanceof Element)) return null;
        if (!this.isInSubtitleUi(target)) return null;
        return target;
    }

    private nativeSubtitleFocusShouldRemainIdle(target: Element): boolean {
        return this.isNativeSubtitleBlurControl(target) && !target.matches(':focus-visible');
    }

    private isInSubtitleUi(element: Element): boolean {
        return Boolean(this.root?.contains(element)
            || this.asbPlayerSubtitleMoveRoots().some(root => root.contains(element)));
    }

    private isInReaderSurface(element: Element): boolean {
        // Every reader-owned surface — the settings dialog, the popover, the
        // onboarding sheet — paints ABOVE the subtitle layer. A click that lands on
        // one of them is therefore never page content the subtitle frame is
        // covering, whatever the geometry says, so the shield must let it through
        // untouched. Without this the shield's stopPropagation at document capture
        // kills the dialog's own button listeners: pressing Cancel over a video did
        // nothing except focus the player, which made the site reveal its controls.
        return Boolean(element.closest(READER_ROOT_SELECTOR));
    }

    // Same class of problem as isInReaderSurface: a gate that only knows where
    // the gesture landed, not what it hit. The native (source-language) caption
    // is rendered as a button that toggles its own blur, so every rail wake
    // triggered merely by being inside the subtitle rectangle has to check
    // whether the press actually landed on that button first.
    private isNativeSubtitleBlurControl(element: Element): boolean {
        return Boolean(element.closest(NATIVE_SUBTITLE_BLUR_CONTROL_SELECTOR));
    }

    private isInNativeVideoPlayer(element: Element): boolean {
        if (element === this.video) return true;
        const player = this.video?.closest('#movie_player, .html5-video-player, ytm-player, #player');
        return Boolean(player?.contains(element));
    }

    private syncPointerActivity(clientX: number, clientY: number): void {
        // A pinned rail (subtitleControlsMode === 'always') never auto-hides and
        // never auto-collapses, so pointer traffic must not toggle its state at
        // all — otherwise a mouse merely passing over the video would churn it.
        if (!this.hasAutoIdleMode(this.options.getSettings())) return;
        if (this.isPointerNearSubtitleSurface(clientX, clientY)) {
            this.showControlsTemporarily();
        } else {
            this.hideControlsImmediately();
        }
    }

    private bindSubtitleDragHandle(): void {
        const handle = this.root?.querySelector<HTMLElement>('[data-subtitle-drag-handle]');
        if (!handle) return;
        handle.addEventListener('pointerdown', event => this.startSubtitleDrag(event), this.eventOptions());
        handle.addEventListener('mousedown', event => this.startSubtitleMouseDrag(event), this.eventOptions());
        handle.addEventListener('keydown', event => this.moveSubtitleOverlayFromKeyboard(event), this.eventOptions());
    }

    private startSubtitleDrag(event: PointerEvent): void {
        const handle = event.currentTarget as HTMLElement;
        const session = this.beginSubtitleDrag(handle, event.button, event.clientY, event);
        if (!session) return;
        const pointerId = event.pointerId;
        handle.setPointerCapture?.(pointerId);

        const pointerMatches = (pointerEvent: PointerEvent) => pointerEvent.pointerId === pointerId;
        const onMove = (moveEvent: PointerEvent) => {
            if (!pointerMatches(moveEvent)) return;
            this.updateSubtitleDrag(session, moveEvent.clientY, moveEvent);
        };

        const onEnd = (upEvent: PointerEvent) => {
            if (!pointerMatches(upEvent)) return;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
            handle.releasePointerCapture?.(pointerId);
            this.endSubtitleDrag(session);
        };

        window.addEventListener('pointermove', onMove, this.eventOptions());
        window.addEventListener('pointerup', onEnd, this.eventOptions());
        window.addEventListener('pointercancel', onEnd, this.eventOptions());
    }

    private startSubtitleMouseDrag(event: MouseEvent): void {
        const handle = event.currentTarget as HTMLElement;
        const session = this.beginSubtitleDrag(handle, event.button, event.clientY, event);
        if (!session) return;
        const onMove = (moveEvent: MouseEvent) => this.updateSubtitleDrag(session, moveEvent.clientY, moveEvent);
        const onEnd = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            this.endSubtitleDrag(session);
        };
        window.addEventListener('mousemove', onMove, this.eventOptions());
        window.addEventListener('mouseup', onEnd, this.eventOptions());
    }

    private beginSubtitleDrag(handle: HTMLElement, button: number, startY: number, event: Event): SubtitleDragSession | undefined {
        if (this.subtitleDragActive || button !== 0) return undefined;
        const dragFrame = this.subtitleDragFrameForHandle(handle);
        if (!dragFrame) return undefined;
        event.preventDefault();
        event.stopPropagation();

        const dragRoot = this.subtitleDragClassRootForHandle(handle);
        const session: SubtitleDragSession = {
            handle,
            dragFrame,
            dragRoot,
            mode: handle.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR) ? 'transform' : 'bottom-offset',
            startY,
            startOffset: this.subtitleDragOffsetYPx,
            startBottomOffset: this.effectiveSubtitleBottomPercent(),
            referenceHeight: this.subtitlePositionReferenceHeight(dragFrame),
            bounds: this.subtitleDragOffsetBounds(dragFrame),
            lastClientY: startY,
        };
        this.subtitleDragActive = true;
        handle.classList.add('jpdb-subtitle-dragging');
        dragRoot?.classList.add('jpdb-subtitle-dragging');
        if (dragRoot !== this.root) this.root?.classList.add('jpdb-subtitle-dragging');
        document.documentElement.classList.add('jpdb-subtitle-dragging');
        return session;
    }

    private updateSubtitleDrag(session: SubtitleDragSession, clientY: number, event: Event): void {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        session.lastClientY = clientY;
        if (session.frame !== undefined) return;
        this.applySubtitleDragPreview(session, clientY);
        session.frame = window.requestAnimationFrame(() => {
            session.frame = undefined;
            if (session.appliedClientY !== session.lastClientY) this.applySubtitleDragPreview(session, session.lastClientY);
        });
    }

    private endSubtitleDrag(session: SubtitleDragSession): void {
        this.flushSubtitleDragPreview(session);
        this.subtitleDragActive = false;
        session.handle.classList.remove('jpdb-subtitle-dragging');
        session.dragRoot?.classList.remove('jpdb-subtitle-dragging');
        if (session.dragRoot !== this.root) this.root?.classList.remove('jpdb-subtitle-dragging');
        document.documentElement.classList.remove('jpdb-subtitle-dragging');
        if (session.mode === 'bottom-offset') {
            this.commitSubtitleBottomOffsetFromDrag(session);
            this.resetLegacySubtitleDragOffset();
        }
        else this.persistSubtitleDragOffset();
        // Repositioning the subtitle line is a reading gesture: releasing the
        // drag must not pop the control rail open.
    }

    private applySubtitleDragPreview(session: SubtitleDragSession, clientY: number): void {
        session.appliedClientY = clientY;
        const deltaY = clientY - session.startY;
        if (session.mode === 'bottom-offset') {
            const next = this.subtitleBottomOffsetFromDelta(session.startBottomOffset, deltaY, session.referenceHeight);
            session.previewBottomOffset = next;
            session.previewOffset = Math.round(((session.startBottomOffset - next) / 100) * session.referenceHeight);
            this.subtitleDragPreviewOffsetYPx = session.previewOffset;
            this.syncYomuSubtitleDragOffsetStyle();
        } else {
            this.setSubtitleDragOffset(session.startOffset + deltaY, session.dragFrame, session.bounds);
            session.previewOffset = this.subtitleDragOffsetYPx;
        }
    }

    private flushSubtitleDragPreview(session: SubtitleDragSession): void {
        if (session.frame !== undefined) {
            window.cancelAnimationFrame(session.frame);
            session.frame = undefined;
        }
        if (session.appliedClientY !== session.lastClientY) this.applySubtitleDragPreview(session, session.lastClientY);
    }

    private moveSubtitleOverlayFromKeyboard(event: KeyboardEvent): void {
        const dragFrame = event.currentTarget instanceof HTMLElement
            ? this.subtitleDragFrameForHandle(event.currentTarget)
            : undefined;
        const step = event.shiftKey ? 24 : 8;
        const deltas: Record<string, number> = {
            ArrowUp: -step,
            ArrowDown: step,
            PageUp: -step * 4,
            PageDown: step * 4,
        };
        const delta = deltas[event.key];
        const shouldReset = event.key === 'Home' || event.key === '0';
        if (delta === undefined && !shouldReset) return;

        event.preventDefault();
        event.stopPropagation();
        const mode = event.currentTarget instanceof HTMLElement && event.currentTarget.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR)
            ? 'transform'
            : 'bottom-offset';
        if (shouldReset) {
            if (mode === 'bottom-offset') this.resetSubtitleBottomOffset();
            else this.resetSubtitleDragOffset();
        } else {
            if (mode === 'bottom-offset') this.adjustSubtitleBottomOffsetByPixels(delta, dragFrame);
            else {
                this.setSubtitleDragOffset(this.subtitleDragOffsetYPx + delta, dragFrame);
                this.persistSubtitleDragOffset();
            }
        }
        this.showControlsTemporarily();
    }

    private commitSubtitleBottomOffsetFromDrag(session: SubtitleDragSession): void {
        if (session.previewBottomOffset === undefined) return;
        this.setSubtitleBottomOffset(session.previewBottomOffset);
    }

    private subtitleBottomOffsetFromDelta(startPercent: number, deltaY: number, referenceHeight: number): number {
        return this.clampedSubtitleBottomOffset(startPercent - (deltaY / referenceHeight) * 100);
    }

    private adjustSubtitleBottomOffsetByPixels(deltaY: number, dragFrame?: HTMLElement): void {
        this.setSubtitleBottomOffset(this.effectiveSubtitleBottomPercent() - (deltaY / this.subtitlePositionReferenceHeight(dragFrame)) * 100);
    }

    private setSubtitleBottomOffset(value: number): void {
        if (!Number.isFinite(value)) return;
        const settings = this.options.getSettings();
        const next = this.clampedSubtitleBottomOffset(value);
        if (settings.subtitleBottomOffset === next) return;
        settings.subtitleBottomOffset = next;
        this.applyEffectiveSubtitleBottom();
        this.syncSubtitleStyleControls();
        this.options.onSettingsChange(['subtitleBottomOffset']);
    }

    private resetSubtitleBottomOffset(): void {
        this.setSubtitleBottomOffset(DEFAULT_SUBTITLE_BOTTOM_OFFSET);
        this.resetLegacySubtitleDragOffset();
    }

    private subtitlePositionReferenceHeight(dragFrame?: HTMLElement): number {
        const rect = this.root?.getBoundingClientRect() ?? dragFrame?.getBoundingClientRect();
        const styledHeight = this.root?.style.height ?? '';
        const styledRootHeight = styledHeight.endsWith('px') ? Number.parseFloat(styledHeight) : 0;
        return Math.max(1, rect?.height || styledRootHeight || this.videoLayoutRect().height || dragFrame?.getBoundingClientRect().height || this.subtitleDragViewportHeight());
    }

    private setSubtitleDragOffset(offsetPx: number, dragFrame?: HTMLElement, bounds?: { min: number; max: number }): void {
        const offset = Math.round(this.clampedSubtitleDragOffset(offsetPx, dragFrame, bounds));
        if (offset === this.subtitleDragOffsetYPx) return;
        this.subtitleDragOffsetYPx = offset;
        this.syncAsbSubtitleDragOffsetStyle();
    }

    // Snap back to the configured bottom offset and forget the remembered nudge.
    private resetSubtitleDragOffset(): void {
        this.resetLegacySubtitleDragOffset();
    }

    private resetLegacySubtitleDragOffset(): void {
        this.subtitleDragOffsetFraction = 0;
        this.subtitleDragOffsetYPx = 0;
        this.subtitleDragPreviewOffsetYPx = undefined;
        saveSubtitleDragOffsetFraction(0);
        this.syncSubtitleDragOffsetStyle();
    }

    private restoreSubtitleDragOffset(): void {
        // Reproject the remembered nudge (a viewport-height fraction) into pixels
        // against the current viewport. Runs on first install, on video changes, and
        // on every viewport/fullscreen change (via syncFullscreenState) so the line
        // keeps its relative position when the player resizes, rotates, or enters
        // fullscreen instead of staying frozen at the old pixel magnitude. Skipped
        // mid-drag so it never fights the gesture the user is performing.
        if (this.subtitleDragActive) return;
        this.subtitleDragOffsetYPx = Math.round(this.subtitleDragOffsetFraction * this.subtitleDragViewportHeight());
        this.syncSubtitleDragOffsetStyle();
    }

    // Remember the current nudge as a viewport-height fraction so it scales across
    // players of different sizes. Called when a drag/keyboard adjustment settles.
    private persistSubtitleDragOffset(): void {
        const viewportHeight = this.subtitleDragViewportHeight();
        this.subtitleDragOffsetFraction = viewportHeight > 0 ? this.subtitleDragOffsetYPx / viewportHeight : 0;
        saveSubtitleDragOffsetFraction(this.subtitleDragOffsetFraction);
    }

    private subtitleDragViewportHeight(): number {
        return Math.max(240, window.innerHeight || document.documentElement.clientHeight || 0);
    }

    private syncSubtitleDragOffsetStyle(): void {
        this.syncYomuSubtitleDragOffsetStyle();
        this.syncAsbSubtitleDragOffsetStyle();
    }

    private syncYomuSubtitleDragOffsetStyle(): void {
        const yomuOffset = `${this.subtitleDragPreviewOffsetYPx ?? 0}px`;
        if (this.root) setStylePropertyIfChanged(this.root, '--subtitle-drag-offset-y', yomuOffset);
    }

    private syncAsbSubtitleDragOffsetStyle(): void {
        const offset = `${this.subtitleDragOffsetYPx}px`;
        for (const root of this.asbPlayerSubtitleMoveRoots()) {
            setStylePropertyIfChanged(root, '--jpdb-subtitle-asb-drag-offset-y', offset);
        }
    }

    private clampedSubtitleBottomOffset(value: number): number {
        const rootRect = this.root?.getBoundingClientRect();
        if (rootRect && rootRect.height > 0) return Math.round(this.effectiveSubtitleBottomPercent(value));
        return Math.round(Math.min(Math.max(value, this.minSubtitleBottomOffsetPercent()), this.maxSubtitleBottomOffsetPercent()));
    }

    // Mirror of minSubtitleBottomOffsetPercent for the upward direction: the
    // ceiling is the screen, not the frame — the line may ride as high as the
    // user drags it while its top edge stays on screen. The old hard 40% cap
    // "locked" upward drags near the middle of tall players while the downward
    // direction was already screen-bounded.
    private maxSubtitleBottomOffsetPercent(): number {
        const rect = this.root?.getBoundingClientRect();
        if (!rect || rect.height <= 0) return 40;
        const line = this.root?.querySelector<HTMLElement>('.jpdb-subtitle-text');
        const lineHeight = Math.max(24, line?.getBoundingClientRect().height ?? 0);
        const usable = rect.bottom - 12 - lineHeight;
        return Math.max(40, Math.round((usable / rect.height) * 100));
    }

    // The bottom offset is a percentage of the video frame, but the floor is
    // the screen: a letterboxed or inset frame leaves usable space below it,
    // so the line may ride into that gap (negative offset) as long as its
    // bottom edge stays on screen.
    private minSubtitleBottomOffsetPercent(): number {
        const rect = this.root?.getBoundingClientRect();
        const viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!rect || rect.height <= 0 || viewportBottom <= 0) return 2;
        const belowFrameGap = viewportBottom - rect.bottom - 12;
        if (belowFrameGap <= 0) return 2;
        return Math.min(2, -Math.round((belowFrameGap / rect.height) * 100));
    }

    private clampedSubtitleDragOffset(offsetPx: number, dragFrame?: HTMLElement, bounds?: { min: number; max: number }): number {
        if (!Number.isFinite(offsetPx)) return this.subtitleDragOffsetYPx;
        const { min, max } = bounds ?? this.subtitleDragOffsetBounds(dragFrame);
        return Math.min(max, Math.max(min, offsetPx));
    }

    private subtitleDragOffsetBounds(dragFrame?: HTMLElement): { min: number; max: number } {
        const viewportHeight = this.subtitleDragViewportHeight();
        const fallback = {
            min: -Math.round(viewportHeight * 0.45),
            max: Math.round(viewportHeight * 0.35),
        };
        const subtitleFrame = dragFrame ?? this.root?.querySelector<HTMLElement>('.jpdb-subtitle-text') ?? this.subtitleEl;
        const rect = subtitleFrame?.getBoundingClientRect();
        if (!rect || rect.height <= 0 || rect.width <= 0) return fallback;

        const margin = 12;
        const min = this.subtitleDragOffsetYPx + margin - rect.top;
        const max = this.subtitleDragOffsetYPx + viewportHeight - margin - rect.bottom;
        return min <= max ? { min, max } : fallback;
    }

    private subtitleDragFrameForHandle(handle: HTMLElement): HTMLElement | undefined {
        const asbRoot = handle.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR)
            ? handle.closest<HTMLElement>(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR)
            : null;
        return asbRoot ?? this.root?.querySelector<HTMLElement>('.jpdb-subtitle-text') ?? this.subtitleEl;
    }

    private subtitleDragClassRootForHandle(handle: HTMLElement): HTMLElement | undefined {
        return handle.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR)
            ? handle.closest<HTMLElement>(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR) ?? undefined
            : this.root;
    }

    private syncAsbPlayerSubtitleMoveHandles(settings: ReaderSettings = this.options.getSettings()): void {
        const roots = this.asbPlayerSubtitleMoveRoots();
        if (!roots.length) {
            // Fast path for the common case — no asbplayer subtitle containers
            // on the page (these only exist with the asbplayer extension). This
            // runs every ~250ms tick on every video, so skip the document-wide
            // handle-cleanup scan unless we actually created handles to tear down.
            if (this.asbMoveHandlesActive) {
                this.removeAsbPlayerSubtitleMoveHandles();
                this.asbMoveHandlesActive = false;
            }
            return;
        }
        const activeRoots = new Set<HTMLElement>(roots);
        for (const handle of Array.from(document.querySelectorAll<HTMLButtonElement>(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR))) {
            const root = handle.closest<HTMLElement>(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR);
            if (!root || !activeRoots.has(root)) handle.remove();
        }
        let anyEnabled = false;
        for (const root of roots) {
            const enabled = settings.subtitlePlayerEnabled
                && settings.subtitleOverlayVisible
                && settings.subtitleControlsMode !== 'hidden'
                && this.asbPlayerSubtitleRootHasText(root);
            if (!enabled) {
                this.teardownAsbPlayerSubtitleMoveRoot(root);
                continue;
            }
            anyEnabled = true;
            this.captureAsbPlayerSubtitleBaseTransform(root);
            root.classList.add('jpdb-subtitle-asb-movable', 'jpdb-subtitle-has-lines');
            root.classList.toggle('jpdb-subtitle-controls-auto', settings.subtitleControlsMode === 'auto');
            root.classList.toggle('jpdb-subtitle-controls-always', settings.subtitleControlsMode === 'always');
            root.classList.toggle('jpdb-subtitle-controls-idle', settings.subtitleControlsMode === 'auto'
                && Boolean(this.root?.classList.contains('jpdb-subtitle-controls-idle')));
            setStylePropertyIfChanged(root, '--jpdb-subtitle-asb-drag-offset-y', `${this.subtitleDragOffsetYPx}px`);
            this.ensureAsbPlayerSubtitleMoveHandle(root, settings);
        }
        this.asbMoveHandlesActive = anyEnabled;
    }

    private asbPlayerSubtitleMoveRoots(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR));
    }

    private asbPlayerSubtitleRootHasText(root: HTMLElement): boolean {
        return Array.from(root.childNodes)
            .filter(node => !(node instanceof HTMLElement && node.matches(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR)))
            .some(node => Boolean(node.textContent?.replace(/\s+/g, '')));
    }

    private ensureAsbPlayerSubtitleMoveHandle(root: HTMLElement, settings: ReaderSettings): void {
        let handle = Array.from(root.querySelectorAll<HTMLButtonElement>(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR))
            .find(candidate => candidate.parentElement === root);
        const moveLabel = uiText(settings.interfaceLanguage, 'moveSubtitles');
        const moveAccessibleLabel = uiText(settings.interfaceLanguage, 'moveSubtitlesAccessible');
        if (!handle) {
            handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'jpdb-subtitle-drag-handle jpdb-subtitle-asb-drag-handle';
            handle.dataset.subtitleDragHandle = 'true';
            handle.dataset.yomuAsbSubtitleDragHandle = 'true';
            handle.dataset.jpdbReaderSurfaceIgnore = 'true';
            setInnerHtml(handle, '<span aria-hidden="true"></span>');
            root.appendChild(handle);
        }
        handle.title = moveLabel;
        handle.setAttribute('aria-label', moveAccessibleLabel);
        handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown PageUp PageDown Home 0');
        if (this.asbSubtitleDragHandles.has(handle)) return;
        handle.addEventListener('pointerdown', event => this.startSubtitleDrag(event), this.eventOptions());
        handle.addEventListener('mousedown', event => this.startSubtitleMouseDrag(event), this.eventOptions());
        handle.addEventListener('keydown', event => this.moveSubtitleOverlayFromKeyboard(event), this.eventOptions());
        this.asbSubtitleDragHandles.add(handle);
    }

    private captureAsbPlayerSubtitleBaseTransform(root: HTMLElement): void {
        if (this.asbSubtitleBaseTransforms.has(root)) return;
        const transform = getComputedStyle(root).transform;
        const baseTransform = transform && transform !== 'none' ? transform : 'translateZ(0)';
        this.asbSubtitleBaseTransforms.set(root, baseTransform);
        root.style.setProperty('--jpdb-subtitle-asb-base-transform', baseTransform);
    }

    private removeAsbPlayerSubtitleMoveHandles(): void {
        for (const root of this.asbPlayerSubtitleMoveRoots()) this.teardownAsbPlayerSubtitleMoveRoot(root);
        for (const handle of Array.from(document.querySelectorAll<HTMLElement>(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR))) handle.remove();
    }

    private teardownAsbPlayerSubtitleMoveRoot(root: HTMLElement): void {
        root.querySelectorAll(ASBPLAYER_SUBTITLE_DRAG_HANDLE_SELECTOR).forEach(handle => handle.remove());
        root.classList.remove(...ASBPLAYER_SUBTITLE_DRAG_CLASSES);
        root.style.removeProperty('--jpdb-subtitle-asb-drag-offset-y');
        root.style.removeProperty('--jpdb-subtitle-asb-base-transform');
        this.asbSubtitleBaseTransforms.delete(root);
    }

    private showControlsTemporarily(options: { independentOfPlayerChrome?: boolean } = {}): void {
        if (!this.root) return;
        if (options.independentOfPlayerChrome === true) {
            this.subtitleSurfaceWakeActive = this.hasAutoIdleMode(this.options.getSettings());
        }
        this.root.classList.remove('jpdb-subtitle-controls-idle');
        // Revealing always wins immediately over any pending or committed hide.
        this.setControlsAway(false);
        this.syncSubtitleControlRailButtons();
        this.syncAsbPlayerSubtitleMoveHandles();
        this.scheduleControlsIdle();
    }

    private hideControlsImmediately(): void {
        this.clearControlsIdleTimer();
        this.subtitleSurfaceWakeActive = false;
        if (!this.root || !this.shouldAutoIdleControls()) return;
        this.root.classList.add('jpdb-subtitle-controls-idle');
        // The grip stub is only kept as a stand-in for a native player that is
        // currently showing its own chrome (YouTube), so the two stay in
        // lockstep. Everywhere else — generic <video>, players with no
        // observable chrome-fade — the idle timeout IS the "controls faded"
        // signal, so the rail must disappear entirely instead of leaving a
        // permanent stub that never hides.
        const keepGripForNativeChrome = this.canObservePlayerChromeFade() && !this.videoPlayerChromeHidden();
        this.setControlsAway(!keepGripForNativeChrome);
        this.syncSubtitleControlRailButtons();
        this.syncAsbPlayerSubtitleMoveHandles();
    }

    // Whether a native player exposes a chrome-fade signal the rail can follow.
    // Only YouTube surfaces do; for everything else the rail owns its own idle
    // fade via the idle timer.
    private canObservePlayerChromeFade(): boolean {
        return this.isVideoPlayerChromeSurface();
    }

    // Debounced commit of the fully-hidden ("away") state. Showing (away=false)
    // is immediate; hiding (away=true) waits out a strobing signal and
    // re-confirms against live state before committing, so a flickering
    // hover-autoplay chrome cannot thrash the rail's visibility.
    private setControlsAway(away: boolean): void {
        if (!this.root) return;
        if (!away) {
            this.clearAwayCommitTimer();
            this.root.classList.remove('jpdb-subtitle-controls-away');
            return;
        }
        if (this.root.classList.contains('jpdb-subtitle-controls-away') || this.awayCommitTimer !== undefined) return;
        this.awayCommitTimer = window.setTimeout(() => {
            this.awayCommitTimer = undefined;
            if (this.destroyed || !this.root) return;
            // Re-confirm the rail should still be away: a pinned rail, an active
            // subtitle UI, a fresh wake, or a native chrome that has since
            // re-appeared all abort the hide.
            if (!this.hasAutoIdleMode(this.options.getSettings())) return;
            if (this.subtitleSurfaceWakeActive || this.hasActiveSubtitleUi()) return;
            if (this.canObservePlayerChromeFade() && !this.videoPlayerChromeHidden()) return;
            this.root.classList.add('jpdb-subtitle-controls-away');
        }, SUBTITLE_CONTROLS_AWAY_COMMIT_DELAY_MS);
    }

    private clearAwayCommitTimer(): void {
        this.awayCommitTimer = clearWindowTimeout(this.awayCommitTimer);
    }

    private scheduleControlsIdle(): void {
        this.clearControlsIdleTimer();
        const shouldExpireSubtitleSurfaceWake = this.subtitleSurfaceWakeActive
            && this.hasAutoIdleMode(this.options.getSettings());
        if (!this.shouldAutoIdleControls() && !shouldExpireSubtitleSurfaceWake) return;
        this.controlsIdleTimer = window.setTimeout(() => {
            this.controlsIdleTimer = undefined;
            this.subtitleSurfaceWakeActive = false;
            this.hideControlsImmediately();
        }, SUBTITLE_CONTROLS_AUTO_IDLE_DELAY_MS);
    }

    private clearControlsIdleTimer(): void {
        this.controlsIdleTimer = clearWindowTimeout(this.controlsIdleTimer);
    }

    private shouldAutoIdleControls(): boolean {
        const settings = this.options.getSettings();
        if (!this.hasAutoIdleMode(settings)) return false;
        if (!this.canIdleSubtitleControls()) return false;
        return !this.video || this.videoIsLargeEnoughForIdleControls();
    }

    private hasAutoIdleMode(settings: ReaderSettings): boolean {
        return Boolean(this.root && settings.subtitleControlsMode === 'auto');
    }

    private canIdleSubtitleControls(): boolean {
        if (this.hasActiveSubtitleUi()) return false;
        return this.hasSubtitleIdleSurface();
    }

    private hasActiveSubtitleUi(): boolean {
        const active = document.activeElement;
        return Boolean(this.root?.matches(':focus-within')
            || (this.asbMoveHandlesActive
                && active instanceof Element
                && active.closest(ASBPLAYER_VISIBLE_SUBTITLE_ROOT_SELECTOR)));
    }

    private hasSubtitleIdleSurface(): boolean {
        return Boolean(this.video || this.cues.length || this.currentCue?.text);
    }

    private videoIsLargeEnoughForIdleControls(): boolean {
        const rect = this.video ? this.videoLayoutRect() : undefined;
        return Boolean(rect && rect.width > 120 && rect.height > 90);
    }

    private isPointerNearSubtitleSurface(x: number, y: number): boolean {
        if (!this.root) return false;
        if (this.pointInElement(this.root.querySelector('.jpdb-subtitle-rail'), x, y)) return true;
        if (this.pointInOpenTranscriptPanel(x, y)) return true;
        if (!this.video) return true;
        if (this.videoPlayerChromeHidden()) return false;
        return pointInRect(x, y, this.videoLayoutRect());
    }

    private pointInVisibleSubtitleSurface(x: number, y: number): boolean {
        const yomuLineVisible = Boolean(this.root
            && !this.root.hidden
            && this.root.classList.contains('jpdb-subtitle-has-lines')
            && !this.root.classList.contains('jpdb-subtitle-hidden')
            && !this.root.classList.contains('jpdb-subtitle-video-out-of-view'));
        if (yomuLineVisible && this.pointInElement(this.root?.querySelector('.jpdb-subtitle-text') ?? null, x, y)) return true;
        if (!this.asbMoveHandlesActive) return false;
        return this.asbPlayerSubtitleMoveRoots().some(root => this.pointInElement(root, x, y));
    }

    private videoPlayerChromeHidden(): boolean {
        // Shorts keep their side action rail visible while #movie_player stays
        // permanently stamped ytp-autohide. That class describes the standard
        // watch-player bottom chrome, not the Shorts control topology. Treating
        // it as a real fade made Yomu hide even its collapsed grip, leaving no
        // touch target with which to expand or move the subtitle controls.
        if (this.isYouTubeShortsControlSurface()) return false;
        // m.youtube.com renders its controls in #player-control-overlay and
        // toggles a fadein class; the desktop ytp-* classes never appear there.
        const mobileOverlay = this.mobileYouTubeControlOverlay();
        if (mobileOverlay) return !mobileOverlay.classList.contains('fadein');
        const player = this.video?.closest<HTMLElement>('#movie_player, .html5-video-player');
        return Boolean(player?.classList.contains('ytp-autohide')
            || player?.classList.contains('ytp-hide-controls')
            || player?.classList.contains('ytp-player-minimized'));
    }

    private isYouTubeShortsControlSurface(): boolean {
        return Boolean(this.video
            && isYouTubePage()
            && isYouTubeShortsLikePlayer(this.video, this.videoLayoutRect()));
    }

    private syncNativePlayerControlHitProtection(): void {
        // Native player controls must win when a moved/long subtitle crosses them.
        // The overlay frame is already click-through, but everything in it that a
        // finger can act on opts back into pointer events: lookup words, and the
        // native caption line, which is a toggle with a finger-sized box on touch.
        // Sweep all of them — a control left out of this sweep is an invisible strip
        // of the overlay stealing taps meant for the seek bar. Mark only boxes that
        // overlap a small, visible native control; CSS then returns just those to
        // the player while the rest of the subtitle stays interactive.
        const targets = Array.from(this.root?.querySelectorAll<HTMLElement>(SUBTITLE_HIT_TESTED_OVERLAY_SELECTOR) ?? []);
        targets.forEach(target => target.removeAttribute(SUBTITLE_NATIVE_CONTROL_SAFE_ZONE_ATTRIBUTE));
        const safeZones = this.nativePlayerControlSafeZones();
        if (!safeZones.length) return;
        for (const target of targets) {
            const rect = target.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (safeZones.some(zone => rectsOverlap(rect, zone))) {
                target.setAttribute(SUBTITLE_NATIVE_CONTROL_SAFE_ZONE_ATTRIBUTE, 'true');
            }
        }
    }

    private nativePlayerControlSafeZones(): DOMRect[] {
        if (!this.video || !isYouTubePage()) return [];
        const surfaces = this.youtubeNativeControlSurfaces();
        if (!surfaces.length) return [];
        const videoRect = this.videoLayoutRect();
        const maxWidth = Math.min(240, Math.max(72, videoRect.width * .42));
        const maxHeight = Math.min(180, Math.max(56, videoRect.height * .28));
        const controls = new Set(surfaces.flatMap(surface =>
            Array.from(surface.querySelectorAll<HTMLElement>(NATIVE_PLAYER_CONTROL_SELECTOR))));
        return Array.from(controls)
            .filter(control => !control.closest('[data-jpdb-reader-root="true"]'))
            .filter(control => nativePlayerControlIsInteractive(control))
            .map(control => control.getBoundingClientRect())
            .filter(rect => rect.width > 0
                && rect.height > 0
                && rect.width <= maxWidth
                && rect.height <= maxHeight
                && rectsOverlap(rect, videoRect));
    }

    private youtubeNativeControlSurfaces(): HTMLElement[] {
        if (!this.video) return [];
        const surfaces = new Set<HTMLElement>();
        // m.youtube.com keeps its interactive chrome in a sibling overlay,
        // outside the ytm-player that owns the video. Scan it as well or a
        // subtitle word's transparent line box can steal fullscreen/settings
        // taps even though its painted glyphs stop above the visible icon.
        const mobileOverlay = this.mobileYouTubeControlOverlay();
        if (mobileOverlay) surfaces.add(mobileOverlay);
        if (this.isYouTubeShortsControlSurface()) {
            const shortsSurface = this.video.closest<HTMLElement>('ytd-reel-video-renderer,shorts-video,shorts-page,ytd-shorts')
                ?? this.video.closest<HTMLElement>('#movie_player,.html5-video-player');
            if (shortsSurface) surfaces.add(shortsSurface);
            return Array.from(surfaces);
        }
        const playerSurface = this.video.closest<HTMLElement>('#movie_player,.html5-video-player,ytm-player,ytd-player,#player');
        if (playerSurface) surfaces.add(playerSurface);
        return Array.from(surfaces);
    }

    private pointInOpenTranscriptPanel(x: number, y: number): boolean {
        return Boolean(this.transcriptPanel
            && !this.transcriptPanel.hidden
            && !this.transcriptPanelClosing
            && this.pointInElement(this.transcriptPanel, x, y));
    }

    private pointInElement(element: Element | null, x: number, y: number): boolean {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    private handleKeydown(event: KeyboardEvent): void {
        const settings = this.options.getSettings();
        if (!settings.subtitlePlayerEnabled) return;
        const editable = isEditableTarget(event.target);
        if (editable) return;
        const previousSubtitle = matchesShortcut(event, settings.shortcuts.previousSubtitle);
        const nextSubtitle = matchesShortcut(event, settings.shortcuts.nextSubtitle);
        if (previousSubtitle || nextSubtitle) {
            if (!this.canUseSubtitleNavigationShortcut()) return;
            // A reader lookup popover shares defaults with subtitle seek
            // (Play audio and Previous subtitle are both "A"). While a lookup
            // is on screen the learner is acting on the word, not the
            // timeline — yield BEFORE preventDefault so the reader's
            // bubble-phase shortcut still receives the event.
            if (this.readerLookupPopoverOpen()) return;
            event.preventDefault();
            // Listener runs in capture phase; stop the site's own handler from
            // acting on the same key a second time.
            event.stopPropagation();
            this.seekSubtitle(previousSubtitle ? -1 : 1);
        } else if (matchesShortcut(event, settings.shortcuts.copySubtitle) && this.subtitleCopyText(undefined)) {
            event.preventDefault();
            event.stopPropagation();
            void this.copySubtitle();
        }
    }

    private canUseSubtitleNavigationShortcut(): boolean {
        return Boolean(this.video && this.videoHasPlayerAffordances());
    }

    private readerLookupPopoverOpen(): boolean {
        // Dismiss removes the popover node (main.ts removeReaderDialogNodes),
        // so DOM presence is the open/closed signal.
        return Boolean(document.querySelector('.jpdb-reader-popover'));
    }

    private seekSubtitle(direction: -1 | 1): void {
        if (!this.video) return;
        if (!this.cues.length) {
            this.seekVideoTo(Math.max(0, this.video.currentTime + direction * 5));
            return;
        }

        const time = this.video.currentTime;
        const activeIndex = this.cues.findIndex(cue => time >= cue.start && time <= cue.end);
        const nextFuture = this.cues.findIndex(cue => cue.start > time);
        const baseIndex = activeIndex >= 0 ? activeIndex : Math.max(0, nextFuture);
        const index = Math.max(0, Math.min(this.cues.length - 1, baseIndex + direction));
        this.seekToCue(index);
    }

    private seekToCue(index: number): void {
        const cue = Number.isFinite(index) ? this.cues[index] : undefined;
        if (!cue) return;
        this.seekToCueObject(cue);
    }

    private seekToTranscriptRow(index: number): void {
        const row = Number.isFinite(index) ? this.transcriptRows()[index] : undefined;
        if (!row) return;
        if (row.cueIndex >= 0) {
            const cue = this.cues[row.cueIndex];
            if (cue) this.seekToCueObject(cue, { exact: true });
            return;
        }
        this.seekToCueObject(row.cue, { exact: true });
    }

    private seekToCueObject(cue: SubtitleCue, options: { exact?: boolean } = {}): void {
        const padding = options.exact ? 0 : this.options.getSettings().subtitleSeekPadding;
        this.clearShadowRecordingIfCueChanged(cue);
        if (this.shadowAutoPausedCueSignature !== subtitleCueSignature(cue)) this.shadowAutoPausedCueSignature = '';
        this.seekVideoTo(Math.max(0, cue.start + padding));
        // Deliberate navigation (line click, Previous/Next) re-engages
        // auto-follow even if the viewer had manually scrolled moments ago.
        this.clearTranscriptManualScrollPause();
        this.currentCue = cue;
        // Navigating while looping moves the loop onto the line you jumped to.
        if (this.shadowLoopEnabled) this.shadowLoopCue = cue;
        this.secondaryCue = this.secondaryCues.find(item => cue.start >= item.start - 0.35 && cue.start <= item.end + 0.35);
        this.render();
        this.syncControls();
        if (this.panelMode === 'shadow') this.renderShadowPanel(true);
        else if (this.panelMode === 'lines') this.renderTranscriptPanel();
    }

    private toggleVideoFrameOcr(): void {
        const settings = this.options.getSettings();
        if (settings.ocrVideoPauseFrames) {
            settings.ocrVideoPauseFrames = false;
            this.options.onSettingsChange(['ocrVideoPauseFrames']);
            return;
        }

        // Request the manual snapshot before enabling pause-frame OCR so this
        // click cannot also enter the automatic pause path for the same frame.
        this.requestVideoFrameOcr();
        settings.ocrVideoPauseFrames = true;
        this.options.onSettingsChange(['ocrVideoPauseFrames']);
    }

    private requestVideoFrameOcr(): void {
        const video = this.video;
        if (!video) return;
        if (!video.paused) {
            const player = this.youTubePlayerApi(video);
            if (player?.pauseVideo) player.pauseVideo();
            else video.pause();
            this.armPlaybackPauseReassert(video);
        }
        // Raw sandbox detail objects are denied at the Firefox Xray boundary;
        // the shared factory clones the detail into the page compartment.
        document.dispatchEvent(createWindowCustomEvent('yomu-ocr-video-frame-request', { video }));
    }

    private youTubePlayerApi(video: HTMLVideoElement): YouTubePlayerApi | null {
        // YouTube's #movie_player exposes its player API on the element in the
        // page world. Routing pause/play/seek through it keeps YT's own state
        // machine in agreement — a raw currentTime write triggers a re-buffer YT
        // can bounce, and a raw pause() gets reactively re-played. Feature-detected
        // so embeds, mobile hosts, isolated-world extension builds, and every
        // non-YouTube site keep the raw HTMLMediaElement path.
        if (!isYouTubePage()) return null;
        const player = document.getElementById('movie_player');
        if (!player?.contains(video)) return null;
        const api = player as unknown as YouTubePlayerApi;
        return typeof api.seekTo === 'function' ? api : null;
    }

    // A single reactive play() from YouTube's controller or a competing
    // extension can silently undo the pause pill (the "pressing pause didn't
    // happen" symptom). Re-pause for a short window, then stand down so a
    // deliberate resume is never fought — mirrors the mining-pause re-assert.
    private armPlaybackPauseReassert(video: HTMLVideoElement): void {
        this.clearPlaybackPauseReassert();
        const armedAt = Date.now();
        const reassert = () => {
            if (this.video !== video || Date.now() - armedAt > PLAYBACK_PAUSE_REASSERT_WINDOW_MS) {
                this.clearPlaybackPauseReassert();
                return;
            }
            if (!video.paused) video.pause();
        };
        video.addEventListener('play', reassert);
        video.addEventListener('playing', reassert);
        this.playbackPauseReassert = {
            off: () => {
                video.removeEventListener('play', reassert);
                video.removeEventListener('playing', reassert);
            },
        };
    }

    private clearPlaybackPauseReassert(): void {
        this.playbackPauseReassert?.off();
        this.playbackPauseReassert = undefined;
    }

    // The iPhone system player paints in the browser top layer where the DOM
    // overlay cannot follow, so mirror the CURRENTLY-RENDERING cue stream —
    // loaded cues, or the DOM-caption fallback's synthesized cue — into a
    // native text track for the duration of native video fullscreen. With no
    // cue stream at all, hand the system player the host's own captions back.
    private showNativeFullscreenCueTrack(video: HTMLVideoElement): void {
        const cues = this.nativeFullscreenMirrorCues();
        if (!cues.length && this.restoreHostTracksForNativeFullscreen()) {
            disableSubtitleTextTrack(this.nativeFullscreenCueTrack);
            return;
        }
        this.reSuppressHostTracksAfterNativeFullscreen();
        // Create and show the track even with ZERO cues: m.youtube synthesizes
        // its first fallback cue only after native fullscreen is already open.
        const content = subtitleContentLanguage(
            this.tracks.find(track => track.id === this.selectedTrackId),
            this.subtitleLanguageContext.targetContent,
        );
        const mirror = mirrorNativeFullscreenCues({
            track: this.nativeFullscreenCueTrack,
            trackVideo: this.nativeFullscreenCueVideo,
            video,
            cues,
            label: NATIVE_FULLSCREEN_CUE_TRACK_LABEL,
            language: content.lang,
        });
        this.nativeFullscreenCueTrack = mirror.track;
        this.nativeFullscreenCueVideo = mirror.video;
    }

    // The m.youtube DOM-caption fallback never fills this.cues; it synthesizes
    // one short-lived cue at a time into currentCue. Mirror whichever stream
    // is actually rendering.
    private nativeFullscreenMirrorCues(): SubtitleCue[] {
        if (this.cues.length) return this.cues;
        return this.currentCue ? [this.currentCue] : [];
    }

    // The synthesized cue changes/extends while in native fullscreen; keep the
    // mirror track following it.
    private refreshNativeFullscreenCueMirror(): void {
        const video = this.video;
        if (!video || !videoIsInNativeFullscreen(video)) return;
        this.showNativeFullscreenCueTrack(video);
    }

    // Returns true when host captions are (already) covering the system
    // player; false when there is nothing restorable (e.g. YouTube, which
    // exposes no host TextTracks) so the caller arms the mirror instead.
    private restoreHostTracksForNativeFullscreen(): boolean {
        if (this.nativeFullscreenHostTracksRestored) return true;
        const restorable = this.tracks.filter(option => option.track);
        const selected = restorable.filter(option => option.id === this.selectedTrackId || option.id === this.secondaryTrackId);
        const targets = selected.length ? selected : restorable.slice(0, 1);
        if (!targets.length) return false;
        this.nativeFullscreenHostTracksRestored = true;
        for (const option of targets) {
            if (option.track) option.track.mode = 'showing';
        }
        return true;
    }

    private reSuppressHostTracksAfterNativeFullscreen(): void {
        if (!this.nativeFullscreenHostTracksRestored) return;
        this.nativeFullscreenHostTracksRestored = false;
        this.setNativeTrackModes();
    }

    private hideNativeFullscreenCueTrack(): void {
        const track = this.nativeFullscreenCueTrack;
        if (track && track.mode !== 'disabled') track.mode = 'disabled';
        this.reSuppressHostTracksAfterNativeFullscreen();
    }

    private seekVideoTo(time: number): void {
        const video = this.video;
        if (!video) return;
        const player = this.youTubePlayerApi(video);
        if (player?.seekTo) {
            // The player API honours the seek instantly and preserves the play
            // state itself — no resume dance, no post-seek 160ms wait.
            player.seekTo(Math.max(0, time), true);
            return;
        }
        const shouldResume = !video.paused && !video.ended;
        video.currentTime = time;
        if (shouldResume) this.resumeVideoAfterSeek(video);
    }

    private resumeVideoAfterSeek(video: HTMLVideoElement): void {
        const requestPlay = () => {
            if (this.video !== video || !video.paused) return;
            void video.play().catch(() => undefined);
        };
        const handleSeeked = () => requestPlay();
        requestPlay();
        video.addEventListener('seeked', handleSeeked, { once: true });
        window.setTimeout(() => {
            video.removeEventListener('seeked', handleSeeked);
            requestPlay();
        }, 160);
    }

    private async copySubtitle(index?: number): Promise<void> {
        const text = this.subtitleCopyText(Number.isInteger(index) ? index as number : undefined);
        if (!text) return;
        await this.writeSubtitleClipboard(text, 'Subtitle clipboard copy failed');
    }

    private subtitleCopyText(rowIndex: number | undefined): string {
        const cue = rowIndex !== undefined ? this.cues[rowIndex] : this.currentCue;
        const secondary = rowIndex !== undefined && cue ? findAlignedCue(this.secondaryCues, cue) : this.secondaryCue;
        return subtitleClipboardText(cue, secondary, this.options.getSettings().subtitleCopyIncludeTranslation);
    }

    private async copyTranscriptRow(index: number): Promise<void> {
        const row = Number.isFinite(index) ? this.transcriptRows()[index] : undefined;
        if (!row) return;
        if (row.cueIndex >= 0) {
            await this.copySubtitle(row.cueIndex);
            return;
        }
        const secondary = findAlignedCue(this.secondaryCues, row.cue);
        const text = subtitleClipboardText(row.cue, secondary, this.options.getSettings().subtitleCopyIncludeTranslation);
        if (!text) return;
        await this.writeSubtitleClipboard(text, 'Subtitle clipboard copy failed');
    }

    private async writeSubtitleClipboard(text: string, failureMessage: string): Promise<void> {
        await navigator.clipboard?.writeText(text).catch(error => log.warn(failureMessage, error));
    }

    private async autoCopyCurrentCue(): Promise<void> {
        if (!this.options.getSettings().subtitleAutoCopyLine || !this.currentCue?.text.trim()) return;
        const signature = subtitleCueSignature(this.currentCue);
        if (signature === this.lastAutoCopiedCueSignature) return;
        this.lastAutoCopiedCueSignature = signature;
        await navigator.clipboard?.writeText(this.currentCue.text.trim())
            .catch(error => log.warn('Subtitle auto-copy failed', error));
    }

    private openSubtitleFilePicker(kind: 'primary' | 'secondary'): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = SUBTITLE_FILE_ACCEPT;
        input.multiple = true;
        input.style.setProperty('display', 'none', 'important');
        input.addEventListener('change', () => {
            const files = Array.from(input.files ?? []);
            if (!files.length) {
                input.remove();
                return;
            }
            void this.loadSubtitleFilesFromPicker(kind, files)
                .finally(() => input.remove());
        }, { once: true });
        input.addEventListener('cancel', () => input.remove(), { once: true });
        (document.body || document.documentElement).appendChild(input);
        input.click();
    }

    private async loadSubtitleFilesFromPicker(kind: 'primary' | 'secondary', files: File[]): Promise<void> {
        const jobs = subtitleFilePickerJobs(kind, files, this.subtitleLanguageContext);
        if (!jobs.length) return;
        await this.loadHostedSubtitleFileJobs({ jobs, openPanel: false });
    }

    private loadSubtitleFilesFromHost(event: Event): void {
        const request = subtitleFilesFromHostEvent(event, this.subtitleLanguageContext);
        if (!request.jobs.length) return;
        void this.loadHostedSubtitleFileJobs(request);
    }

    private async loadHostedSubtitleFileJobs(request: HostedSubtitleFileLoadRequest): Promise<void> {
        for (const job of request.jobs) {
            await this.loadSubtitleFile(job.kind, job.file).catch(error => {
                log.warn('Hosted subtitle file load failed', { kind: job.kind, name: job.file.name, error });
            });
        }
        if (request.openPanel === false) {
            this.renderOpenSubtitlePanel();
            return;
        }
        if (request.openPanel === 'tracks') {
            this.openTracksPanel();
            return;
        }
        if (this.hasTranscriptSurface()) this.openLinesPanel({ deferRender: true });
        else this.openTracksPanel();
    }

    private async loadSubtitleFile(kind: 'primary' | 'secondary', file: File): Promise<void> {
        if (!file) return;
        const text = await readHostedSubtitleFileText(file);
        const cues = normalizeSubtitleCues(parseSubtitleText(text), { transcriptEligible: kind === 'primary' });
        const track: SubtitleTrackOption = {
            id: `file-${kind}-${Date.now()}`,
            label: file.name.replace(/\.(srt|vtt|ass|ssa)$/i, ''),
            kind: 'file',
            cues,
        };
        this.tracks.push(track);
        if (kind === 'primary') await this.selectTrack(track.id);
        else await this.selectSecondaryTrack(track.id);
        this.updateFromLoadedCues();
    }

    private async selectTrack(id: string, options: { auto?: boolean } = {}): Promise<void> {
        const requestId = this.preparePrimaryTrackSelection(id);
        if (!options.auto) this.revealPrimarySubtitleOverlay();
        const loaded = await this.loadPrimaryTrackSelection(id, requestId);
        if (!loaded) return;
        if (options.auto && this.revertSingleCueAutoSelection('primary', loaded)) return;
        if (options.auto) this.revealPrimarySubtitleOverlay();
        if (!await this.prewarmPrimaryTrackFirstPaint(loaded, requestId)) return;
        this.applyPrimaryTrackSelection(loaded);
        this.finishTrackSelection();
    }

    private async prewarmPrimaryTrackFirstPaint(
        selection: LoadedSubtitleTrackSelection,
        requestId: number,
    ): Promise<boolean> {
        if (!this.shouldParseSubtitles() || !selection.cues.length) {
            return this.isTrackSelectionCurrent('primary', requestId, selection.trackId);
        }
        const cues = offsetSubtitleCues(selection.cues, this.trackTimingOffsetSeconds(selection.trackId));
        const time = this.video ? this.subtitlePlaybackTime(this.video) : 0;
        const settings = this.options.getSettings();
        return prewarmSubtitleFirstPaint({
            cues,
            currentTime: time,
            isCurrent: () => this.isTrackSelectionCurrent('primary', requestId, selection.trackId),
            parse: text => this.parseCueHtml(text, settings, {
                enrichBeforeRender: true,
                requireEnrichedProvisional: true,
                refreshProvisional: true,
            }),
        });
    }

    // A track whose entire payload is a single usable line (a one-cue credit,
    // or a metadata-only track whose cues the normalizer dropped) isn't worth
    // auto-showing an overlay for the whole video; keep the track listed for
    // manual selection but withdraw the automatic pick.
    private revertSingleCueAutoSelection(role: 'primary' | 'secondary', loaded: LoadedSubtitleTrackSelection): boolean {
        if (loaded.cues.length > 1) return false;
        if (loaded.track) loaded.track.loadingState = 'ready';
        if (role === 'primary' && this.selectedTrackId === loaded.trackId) {
            this.selectedTrackId = '';
            this.cues = [];
            this.currentCue = undefined;
        }
        if (role === 'secondary' && this.secondaryTrackId === loaded.trackId) this.clearSecondaryTrackSelection();
        this.render();
        this.syncControls();
        this.renderTrackPanel();
        return true;
    }

    private preparePrimaryTrackSelection(id: string): number {
        const requestId = this.trackSelections.begin('primary');
        this.selectedTrackId = id;
        this.lastAutoCopiedCueSignature = '';
        if (this.secondaryTrackId === id) this.clearSecondaryTrackSelection();
        this.cues = [];
        this.currentCue = undefined;
        this.pendingDomCaption = undefined;
        this.lastDomCaption = '';
        this.lastDomCaptionSeenAt = 0;
        this.lastShadowSignature = '';
        this.resetShadowPracticeState();
        return requestId;
    }

    private clearSecondaryTrackSelection(): void {
        this.trackSelections.invalidate('secondary');
        this.secondaryTrackId = '';
        this.secondaryCues = [];
        this.secondaryCue = undefined;
    }

    private revealPrimarySubtitleOverlay(): void {
        this.revealSubtitleOverlay('subtitleOverlayVisible', 'subtitleOverlayVisibleChosen');
        if (!this.options.getSettings().subtitleOverlayVisible) return;
        this.root?.classList.remove('jpdb-subtitle-hidden');
    }

    // Selecting a track shows its overlay, but no track pick may overrule a
    // visibility the learner chose. The guard used to apply only to AUTOMATIC
    // picks, so choosing a track by hand switched a hidden overlay back on and
    // re-persisted it -- "the show native subtitles toggle turns itself back
    // on". Picking a track says which track to watch, not that the overlay the
    // learner switched off should come back; the rail eye and the style
    // popover are how it comes back. Nothing is declared here either way: this
    // is a consequence of loading a track, not a choice about visibility.
    private revealSubtitleOverlay(
        visibleKey: 'subtitleOverlayVisible' | 'subtitleSecondaryVisible',
        chosenKey: 'subtitleOverlayVisibleChosen' | 'subtitleSecondaryVisibleChosen',
    ): void {
        const settings = this.options.getSettings();
        if (settings[visibleKey] || settings[chosenKey]) return;
        settings[visibleKey] = true;
        this.options.onSettingsChange(NO_EXPLICIT_USER_CHOICE);
    }

    private async loadPrimaryTrackSelection(id: string, requestId: number): Promise<LoadedSubtitleTrackSelection | null> {
        return this.loadTrackSelection({ id, requestId, role: 'primary', transcriptEligible: true });
    }

    private markTrackLoading(track: SubtitleTrackOption): void {
        track.loadingState = 'loading';
        this.renderTrackPanel();
    }

    private async loadTrackSelection(request: SubtitleTrackSelectionLoadRequest): Promise<LoadedSubtitleTrackSelection | null> {
        const selected = this.tracks.find(option => option.id === request.id);
        if (!selected) return this.currentTrackSelection(request.role, request.requestId, request.id, undefined, []);
        const signal = this.trackSelections.signal(request.role, request.requestId);
        if (!signal) return null;
        this.markTrackLoading(selected);
        this.setNativeTrackModes();
        try {
            const loaded = await loadSubtitleTrackCues(selected, {
                ...TRACK_LOAD_OPTIONS,
                tracks: this.tracks,
                transcriptEligible: request.transcriptEligible,
                translationFallback: this.translationFallbackModeForSelection(request, selected),
                signal,
            });
            return this.loadedTrackSelection(request, loaded.track, loaded.cues);
        } catch (error) {
            return settleSubtitleSelectionFailure(signal, error);
        }
    }

    private translationFallbackModeForSelection(
        request: SubtitleTrackSelectionLoadRequest,
        track: SubtitleTrackOption | undefined,
    ): 'full' | 'skip' {
        if (request.role !== 'secondary') return 'full';
        return track?.kind === 'youtube' && track.sourceType === 'translation' ? 'full' : 'skip';
    }

    private loadedTrackSelection(
        request: SubtitleTrackSelectionLoadRequest,
        selected: SubtitleTrackOption,
        cues: SubtitleCue[],
    ): LoadedSubtitleTrackSelection | null {
        if (!this.isTrackSelectionCurrent(request.role, request.requestId, request.id)) return null;
        const trackId = selected.id;
        this.setSelectedTrackId(request.role, trackId);
        return this.currentTrackSelection(request.role, request.requestId, trackId, selected, cues);
    }

    private currentTrackSelection(
        role: SubtitleTrackSelectionRole,
        requestId: number,
        trackId: string,
        track: SubtitleTrackOption | undefined,
        cues: SubtitleCue[],
    ): LoadedSubtitleTrackSelection | null {
        return this.isTrackSelectionCurrent(role, requestId, trackId) ? { track, trackId, cues } : null;
    }

    private setSelectedTrackId(role: SubtitleTrackSelectionRole, trackId: string): void {
        if (role === 'primary') this.selectedTrackId = trackId;
        else this.secondaryTrackId = trackId;
    }

    private applyPrimaryTrackSelection(selection: LoadedSubtitleTrackSelection): void {
        if (selection.trackId !== this.selectedTrackId) this.selectedTrackId = selection.trackId;
        if (selection.track) selection.track.cues = selection.cues;
        this.cues = offsetSubtitleCues(selection.cues, this.trackTimingOffsetSeconds(selection.trackId));
        this.applyYouTubeCaptionFallback(selection.track, selection.trackId);
        if (selection.track) selection.track.loadingState = loadedTrackState(this.cues);
    }

    private applyYouTubeCaptionFallback(track: SubtitleTrackOption | undefined, trackId: string): void {
        if (track?.kind !== 'youtube') {
            this.youtubeDomCaptionFallbackTrackId = '';
            return;
        }
        this.youtubeDomCaptionFallbackTrackId = this.cues.length ? '' : trackId;
        this.lastYouTubeCaptionActivationAt = 0;
        if (!this.cues.length) this.ensureYouTubeDomCaptionFallbackActive(track);
    }

    private async selectSecondaryTrack(id: string, options: { auto?: boolean } = {}): Promise<void> {
        const requestId = this.prepareSecondaryTrackSelection(id);
        if (!options.auto) this.revealSecondarySubtitleOverlay();
        const loaded = await this.loadSecondaryTrackSelection(id, requestId);
        if (!loaded) return;
        if (options.auto && this.revertSingleCueAutoSelection('secondary', loaded)) return;
        if (options.auto) this.revealSecondarySubtitleOverlay();
        this.applySecondaryTrackSelection(loaded);
        this.finishTrackSelection();
    }

    private prepareSecondaryTrackSelection(id: string): number {
        if (this.selectedTrackId === id) {
            this.suppressYouTubeAutoSelectForCurrentVideo();
            this.trackSelections.invalidate('primary');
            this.selectedTrackId = '';
            this.cues = [];
            this.currentCue = undefined;
            this.pendingDomCaption = undefined;
            this.lastDomCaption = '';
            this.lastDomCaptionSeenAt = 0;
            this.youtubeDomCaptionFallbackTrackId = '';
            this.lastShadowSignature = '';
            this.resetShadowPracticeState();
        }
        const requestId = this.trackSelections.begin('secondary');
        this.secondaryTrackId = id;
        this.secondaryCues = [];
        this.secondaryCue = undefined;
        this.lastShadowSignature = '';
        return requestId;
    }

    private revealSecondarySubtitleOverlay(): void {
        this.revealSubtitleOverlay('subtitleSecondaryVisible', 'subtitleSecondaryVisibleChosen');
    }

    private async loadSecondaryTrackSelection(id: string, requestId: number): Promise<LoadedSubtitleTrackSelection | null> {
        return this.loadTrackSelection({ id, requestId, role: 'secondary', transcriptEligible: false });
    }

    private applySecondaryTrackSelection(selection: LoadedSubtitleTrackSelection): void {
        if (selection.trackId !== this.secondaryTrackId) this.secondaryTrackId = selection.trackId;
        if (selection.track) selection.track.cues = selection.cues;
        this.secondaryCues = offsetSubtitleCues(selection.cues, this.trackTimingOffsetSeconds(selection.trackId));
        if (selection.track) selection.track.loadingState = loadedTrackState(this.secondaryCues);
    }

    private finishTrackSelection(): void {
        this.markNativeCueListsDirty();
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.render();
        this.refreshNativeFullscreenCueMirror();
        this.refreshTranscriptPanelAfterTrackChange();
        this.syncControls();
    }

    private setNativeTrackModes(): void {
        reconcileSubtitleNativeTrackModes(this.nativeTrackModeSnapshot, this.tracks);
        // While the system player is showing the host's own captions (native
        // fullscreen with no Yomu cue stream), nothing may re-suppress them;
        // reSuppressHostTracksAfterNativeFullscreen clears the flag first.
        if (this.nativeFullscreenHostTracksRestored) return;
        const settings = this.options.getSettings();
        const suppressNativeCaptions = this.shouldSuppressNativeCaptions(settings);
        this.lastYomuCaptionsActive = applySubtitleNativeTrackModes({
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            overlayVisible: settings.subtitleOverlayVisible || this.isTranscriptPanelOpen(),
            // Caption ownership is a visual hand-off: the page/native caption
            // stays visible until the exact current Yomu cue has a settled
            // parse (or a final plain fallback) ready to paint.
            suppressNativeCaptions,
            video: this.video,
            hasPrimaryCues: Boolean(this.cues.length),
            currentCueText: this.currentCue?.text,
            youtubeDomCaptionFallbackTrackId: this.youtubeDomCaptionFallbackTrackId,
            lastYomuCaptionsActive: this.lastYomuCaptionsActive,
            nativeTrackModeSnapshot: this.nativeTrackModeSnapshot,
            // Cue ownership is reversible: a committed Yomu frame can be
            // followed immediately by an async cache miss that hands captions
            // back to the host. TextTrack modes plus the owned suppression CSS
            // provide that hand-off without toggling page controls or leaving
            // Plyr/Vidstack caption state switched off.
            suppressCaptionPlayerUi: false,
        });
        this.nativeCaptionOwnership = suppressNativeCaptions;
    }

    private releaseNativeCaptionOwnership(): void {
        releaseSubtitleNativeTrackModes(this.nativeTrackModeSnapshot);
        this.nativeCaptionOwnership = undefined; this.lastYomuCaptionsActive = false;
    }

    private shouldSuppressNativeCaptions(settings: ReaderSettings): boolean {
        return Boolean(settings.subtitlePlayerEnabled
            && this.video
            && this.hasVisualCommitForCurrentCue(settings));
    }

    private hasVisualCommitForCurrentCue(settings: ReaderSettings): boolean {
        const text = this.currentCue?.text.trim() ?? '';
        if (!text) return false;
        // With annotations paused (or no parser source), the plain synchronous
        // frame is final and can own captions immediately.
        if (!this.shouldParseSubtitles(settings)) return true;
        return this.primaryVisualCommitMatches(text, settings);
    }

    private primaryVisualCommitMatches(text: string, settings: ReaderSettings): boolean {
        return this.lastRenderedPrimaryKey === this.parseCacheKey(text, settings)
            && this.lastRenderedPrimaryText === text
            && Boolean(this.lastRenderedPrimaryHtml);
    }

    private async discoverYouTubeTracksThrottled(force = false): Promise<void> {
        if (this.youtubeTrackDiscoveryInFlight) return;
        const now = performance.now();
        if (!this.shouldStartYouTubeTrackDiscovery(force, now)) return;
        this.lastYouTubeTrackDiscoveryAt = now;
        this.youtubeTrackDiscoveryInFlight = true;
        const contextKey = subtitleLanguageContextKey(this.subtitleLanguageContext);
        await this.runYouTubeTrackDiscovery(contextKey);
    }

    private shouldStartYouTubeTrackDiscovery(force: boolean, now: number): boolean {
        const interval = this.tracks.some(track => track.kind === 'youtube') ? 5000 : 1500;
        return force || now - this.lastYouTubeTrackDiscoveryAt >= interval;
    }

    private async runYouTubeTrackDiscovery(contextKey: string): Promise<void> {
        try {
            await this.discoverYouTubeTracks();
        } finally {
            this.youtubeTrackDiscoveryInFlight = false;
            if (contextKey !== subtitleLanguageContextKey(this.subtitleLanguageContext)) void this.discoverYouTubeTracksThrottled(true);
        }
    }

    private async discoverYouTubeTracks(): Promise<void> {
        const contextKey = subtitleLanguageContextKey(this.subtitleLanguageContext);
        const tracks = await discoverCurrentYouTubeCaptionTracks({
            preferredTranslationLanguages: this.subtitleLanguageContext.preferredTranslationLanguages,
            contextKey,
            currentContextKey: () => subtitleLanguageContextKey(this.subtitleLanguageContext),
            onVideoId: videoId => this.updateYouTubeDiscoveryVideo(videoId),
        });
        if (!tracks) return;

        this.removeYouTubeDomCaptionFallbackTracks();
        const { added, updatedSelectedTrack } = this.mergeYouTubeCaptionTracks(tracks);
        this.finishYouTubeTrackDiscovery(added, updatedSelectedTrack);
    }

    private removeYouTubeDomCaptionFallbackTracks(): void {
        this.removeSubtitleTracks(track => track.sourceKey === YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY);
    }

    private updateYouTubeDiscoveryVideo(videoId: string): void {
        if (videoId === this.youtubeVideoId) return;
        this.youtubeVideoId = videoId;
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind === 'youtube');
        this.youtubeDomCaptionFallbackTrackId = '';
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.lastYouTubeTrackDiscoveryAt = 0;
    }

    private mergeYouTubeCaptionTracks(tracks: YouTubeCaptionTrackCandidate[]): { added: number; updatedSelectedTrack: boolean } {
        let added = 0;
        let updatedSelectedTrack = false;
        for (const track of tracks) {
            const existing = this.findExistingYouTubeTrack(track);
            if (existing) {
                updatedSelectedTrack ||= this.updateExistingYouTubeTrack(existing, track);
                continue;
            }
            this.addYouTubeCaptionTrack(track);
            added += 1;
        }
        return { added, updatedSelectedTrack };
    }

    private findExistingYouTubeTrack(track: YouTubeCaptionTrackCandidate): SubtitleTrackOption | undefined {
        const key = youtubeCaptionTrackIdentity(track);
        return this.tracks.find(option => option.kind === 'youtube' && youtubeCaptionTrackIdentity(option) === key);
    }

    private updateExistingYouTubeTrack(existing: SubtitleTrackOption, track: YouTubeCaptionTrackCandidate): boolean {
        let updatedSelectedTrack = false;
        if (shouldRefreshYouTubeTrackUrl(track.url, existing.url)) {
            existing.url = track.url;
            updatedSelectedTrack = existing.id === this.selectedTrackId && !this.cues.length;
        }
        existing.youtubeTrack = track.raw;
        existing.autoGenerated = track.autoGenerated;
        existing.sourceType = track.sourceType;
        existing.sourceLanguage = track.sourceLanguage;
        existing.targetLanguage = track.targetLanguage;
        existing.vssId = track.vssId;
        existing.youtubeIdentity = track.youtubeIdentity;
        return updatedSelectedTrack;
    }

    private addYouTubeCaptionTrack(track: YouTubeCaptionTrackCandidate): void {
        this.tracks.push({
            id: `youtube-${this.tracks.length}`,
            label: track.label,
            kind: 'youtube',
            language: track.language,
            autoGenerated: track.autoGenerated,
            url: track.url,
            youtubeTrack: track.raw,
            sourceType: track.sourceType,
            sourceLanguage: track.sourceLanguage,
            targetLanguage: track.targetLanguage,
            vssId: track.vssId,
            youtubeIdentity: track.youtubeIdentity,
        });
    }

    private finishYouTubeTrackDiscovery(added: number, updatedSelectedTrack: boolean): void {
        const generated = ensureTranslatedTargetTrack(this.tracks, this.options.getSettings().interfaceLanguage, this.subtitleLanguageContext);
        const plan = planYouTubeTrackDiscovery({
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            autoSelectSuppressedVideoId: this.youtubeAutoSelectSuppressedVideoId,
            videoId: this.youtubeVideoId,
            languages: this.subtitleLanguageContext,
            updatedSelectedTrack,
            tracksChanged: [added, generated].some(Boolean),
        });
        plan.selections.forEach(selection => this.applyYouTubeTrackDiscoverySelection(selection));
        if (!plan.refreshPanel) return;
        this.renderTrackPanel();
        this.syncControls();
    }

    private applyYouTubeTrackDiscoverySelection(selection: YouTubeTrackDiscoverySelection): void {
        const select: Record<YouTubeTrackDiscoverySelection['role'], (trackId: string) => void> = {
            primary: trackId => { void this.selectTrack(trackId, { auto: true }); },
            secondary: trackId => { void this.selectSecondaryTrack(trackId, { auto: true }); },
        };
        select[selection.role](selection.trackId);
    }

    private syncControls(): void {
        const hasLines = this.hasVisibleSubtitleLines();
        if (this.root) {
            setClassState(this.root, 'jpdb-subtitle-panel-open', this.isTranscriptPanelOpen());
            setClassState(this.root, 'jpdb-subtitle-style-open', this.subtitleStylePanelOpen);
            setClassState(this.root, 'jpdb-subtitle-has-lines', hasLines);
            setClassState(this.root, 'jpdb-subtitle-has-track', hasSelectedSubtitleTrackOrLines(this.selectedTrackId, hasLines));
        }
        this.syncTranscriptPlacementClass();
        this.syncLineNavigationButtons(hasLines);
        this.syncDrawerButtons(hasLines);
        this.syncSubtitleStyleControls();
        this.syncVisibilityRailButton();
        this.syncSubtitleControlRailButtons();
        this.syncVideoFrameOcrButton();
        this.syncTranscriptAutoScrollPausedClass();
        this.syncStatus();
        this.setNativeTrackModes();
    }

    private hasVisibleSubtitleLines(): boolean {
        const settings = this.options.getSettings();
        return Boolean(
            this.cues.length
            || this.currentCue?.text
            || (settings.subtitleSecondaryVisible && this.secondaryCue?.text),
        );
    }

    private syncStatus(): void {
        const status = this.root?.querySelector<HTMLElement>('.jpdb-subtitle-status');
        if (!status) return;
        syncSubtitleTrackStatus(status, this.tracks.length, this.options.getSettings().interfaceLanguage);
    }

    // Rail eye toggle: hides the subtitle text for the video being watched
    // while the rail itself stays reachable to bring it back.
    private toggleOverlayVisibility(): void {
        const settings = this.options.getSettings();
        settings.subtitleOverlayVisible = !settings.subtitleOverlayVisible;
        settings.subtitleOverlayVisibleChosen = true;
        this.options.onSettingsChange(['subtitleOverlayVisible', 'subtitleOverlayVisibleChosen']);
        this.refresh();
    }

    private syncVisibilityRailButton(): void {
        const button = this.root?.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="visibility"]');
        if (!button) return;
        const settings = this.options.getSettings();
        const visible = settings.subtitleOverlayVisible;
        const label = uiText(settings.interfaceLanguage, 'subtitleOverlayVisible');
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(visible));
        setInnerHtml(button, subtitleIcon(visible ? 'eye' : 'eye-off'));
    }

    // The grip is both the drag handle and the expand/collapse toggle: a
    // stationary tap flips the persisted mode so an expanded rail stays
    // expanded, while collapsing minimises back to the grip immediately.
    private toggleSubtitleControlRailExpanded(): void {
        const settings = this.options.getSettings();
        const expanded = settings.subtitleControlsMode === 'always';
        settings.subtitleControlsMode = expanded ? 'auto' : 'always';
        this.options.onSettingsChange(['subtitleControlsMode']);
        this.syncRootVisibility(settings);
        if (expanded) this.hideControlsImmediately();
        else this.showControlsTemporarily({ independentOfPlayerChrome: true });
        this.syncControls();
    }

    private syncSubtitleControlRailButtons(): void {
        const settings = this.options.getSettings();
        const expandedMode = settings.subtitleControlsMode === 'always';
        const expand = this.root?.querySelector<HTMLButtonElement>('[data-action="rail-expand"]');
        if (expand) {
            const expanded = String(!this.root?.classList.contains('jpdb-subtitle-controls-idle') || expandedMode);
            if (expand.getAttribute('aria-expanded') !== expanded) expand.setAttribute('aria-expanded', expanded);
        }
    }

    private syncVideoFrameOcrButton(): void {
        const button = this.root?.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="ocr"]');
        if (!button) return;
        const settings = this.options.getSettings();
        const active = settings.ocrVideoPauseFrames;
        const label = uiText(settings.interfaceLanguage, active ? 'readVideoFrameStop' : 'readVideoFrame');
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('jpdb-subtitle-ocr-active', active);
    }

    private syncLineNavigationButtons(hasLines: boolean): void {
        const language = this.options.getSettings().interfaceLanguage;
        // Prev/next live on the on-video rail AND in the drawer head's playback
        // cluster. The rail copy only shows while the subtitle panel is closed —
        // an open panel already carries its own transport, so the rail hides it.
        const hideRailNavigation = this.isTranscriptPanelOpen();
        for (const action of ['previous', 'next'] as const) {
            const railButton = this.root?.querySelector<HTMLButtonElement>(`.jpdb-subtitle-rail [data-action="${action}"]`);
            if (railButton) {
                syncSubtitleLineNavigationButton(railButton, action, hasLines, Boolean(this.video), language);
                if (hideRailNavigation) railButton.hidden = true;
            }
            const drawerButton = this.transcriptPanel?.querySelector<HTMLButtonElement>(`.jpdb-subtitle-drawer-playback [data-action="${action}"]`);
            if (drawerButton) syncSubtitleLineNavigationButton(drawerButton, action, hasLines, Boolean(this.video), language);
        }
    }

    private syncDrawerButtons(hasLines: boolean): void {
        const panelButton = this.root?.querySelector<HTMLButtonElement>('[data-action="panel"]');
        if (!panelButton) return;
        const state = subtitleDrawerButtonState({
            panelOpen: this.isTranscriptPanelOpen(),
            hasLines,
            hasTranscriptSurface: this.hasTranscriptSurface(),
            hasVideo: Boolean(this.video),
            trackCount: this.tracks.length,
        });
        syncSubtitleDrawerButton(panelButton, {
            disabled: state.disabled,
            pressed: state.panelOpen,
            // Compact viewports force the bottom drawer, so while closed the
            // toggle must advertise where the panel will actually open, not the
            // stored side preference.
            placement: state.panelOpen ? this.effectiveTranscriptPlacement : this.plannedTranscriptPlacement(),
            language: this.options.getSettings().interfaceLanguage,
        });
    }

    private plannedTranscriptPlacement(): ReaderSettings['subtitleTranscriptPlacement'] {
        return shouldUseCompactSubtitleDrawer(this.transcriptViewportWidth())
            ? 'bottom'
            : this.options.getSettings().subtitleTranscriptPlacement;
    }

    private panelOptionsState(pausePanelEnabled: boolean, language: InterfaceLanguage): PanelOptionsControlsState {
        return {
            placement: this.effectiveTranscriptPlacement,
            pausePanelEnabled,
            menuOpen: this.panelOptionsMenuOpen,
            language,
        };
    }

    private togglePanelOptionsMenu(): void {
        this.panelOptionsMenuOpen = !this.panelOptionsMenuOpen;
        this.syncPanelOptionsMenu();
    }

    private closePanelOptionsMenu(): void {
        if (!this.panelOptionsMenuOpen) return;
        this.panelOptionsMenuOpen = false;
        this.syncPanelOptionsMenu();
    }

    private syncPanelOptionsMenu(): void {
        const container = this.transcriptPanel?.querySelector<HTMLElement>('[data-panel-options]');
        if (!container) return;
        const open = this.panelOptionsMenuOpen;
        container.querySelector<HTMLButtonElement>('[data-action="panel-options"]')?.setAttribute('aria-expanded', String(open));
        const menu = container.querySelector<HTMLElement>('.jpdb-subtitle-panel-options-menu');
        if (menu) menu.hidden = !open;
    }

    private syncPanelState(): void {
        const hasLines = Boolean(this.cues.length || this.currentCue?.text);
        const panel = this.transcriptPanel;
        if (panel) {
            panel.classList.toggle('jpdb-subtitle-lines-panel', this.panelMode === 'lines');
            panel.classList.toggle('jpdb-subtitle-shadow-panel', this.panelMode === 'shadow');
            panel.classList.toggle('jpdb-subtitle-mine-panel', this.panelMode === 'mine');
            panel.classList.toggle('jpdb-subtitle-tracks-panel', this.panelMode === 'tracks');
        }
        this.syncLineNavigationButtons(hasLines);
    }

    private syncTranscriptPlacementClass(): void {
        if (!this.root) return;
        for (const element of [this.root, this.transcriptPanel].filter((item): item is HTMLElement => Boolean(item))) {
            setClassState(element, 'jpdb-subtitle-transcript-right', this.effectiveTranscriptPlacement === 'right');
            setClassState(element, 'jpdb-subtitle-transcript-left', this.effectiveTranscriptPlacement === 'left');
            setClassState(element, 'jpdb-subtitle-transcript-bottom', this.effectiveTranscriptPlacement === 'bottom');
        }
        if (this.root.dataset.transcriptPlacement !== this.effectiveTranscriptPlacement) {
            this.root.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
        }
        if (this.transcriptPanel && this.transcriptPanel.dataset.transcriptPlacement !== this.effectiveTranscriptPlacement) {
            this.transcriptPanel.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
        }
        this.syncPanelPlacementButtons();
    }

    private syncPanelPlacementButtons(): void {
        syncTranscriptPlacementButtons(
            this.transcriptPanel ?? null,
            this.effectiveTranscriptPlacement,
            this.options.getSettings().interfaceLanguage,
        );
    }

    private hasTranscriptSurface(): boolean {
        return Boolean(this.cues.length || this.currentCue?.text || this.selectedTrackId);
    }

    private preferredTranscriptDrawerMode(): SubtitlePanelMode {
        if (this.panelMode === 'lines' && this.hasTranscriptSurface()) return 'lines';
        if (this.panelMode === 'shadow' && this.hasTranscriptSurface()) return 'shadow';
        if (this.panelMode === 'mine' && this.hasTranscriptSurface()) return 'mine';
        if (this.panelMode === 'tracks') return 'tracks';
        return this.hasTranscriptSurface() ? 'lines' : 'tracks';
    }

    private toggleTranscriptDrawer(): void {
        if (!this.transcriptPanel) return;
        this.closeSubtitleStylePanel({ sync: false });
        if (this.isTranscriptPanelOpen()) {
            this.closeTranscriptPanel();
            return;
        }
        const mode = this.preferredTranscriptDrawerMode();
        if (mode === 'tracks') this.openTracksPanel();
        else if (mode === 'shadow') this.openShadowPanel();
        else if (mode === 'mine') this.openBatchMiningPanel();
        else this.openLinesPanel({ deferRender: true });
    }

    private showTranscriptPanelElement(): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        this.closeSubtitleStylePanel({ sync: false });
        this.clearTranscriptPanelAnimation();
        this.transcriptPanelClosing = false;
        this.prepareTranscriptPanelPlacementForOpen();
        panel.hidden = false;
        this.syncTranscriptPanelFullscreenDisplayOverride();
        panel.classList.remove('jpdb-subtitle-panel-entering', 'jpdb-subtitle-panel-closing');
        panel.classList.add('jpdb-subtitle-panel-opened');
    }

    private prepareTranscriptPanelPlacementForOpen(): void {
        const settings = this.options.getSettings();
        this.effectiveTranscriptPlacement = shouldUseCompactSubtitleDrawer(this.transcriptViewportWidth())
            ? 'bottom'
            : settings.subtitleTranscriptPlacement;
        this.syncTranscriptPlacementClass();
    }

    private hideTranscriptPanelElement(options: { immediate?: boolean } = {}): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        this.clearTranscriptPanelAnimation();
        this.transcriptPanelClosing = true;
        panel.classList.remove('jpdb-subtitle-panel-entering', 'jpdb-subtitle-panel-opened');
        if (options.immediate || panel.hidden) {
            this.finishTranscriptPanelHide(panel);
            return;
        }
        panel.classList.add('jpdb-subtitle-panel-closing');
        this.transcriptPanelHideTimer = window.setTimeout(() => this.finishTranscriptPanelHide(panel), TRANSCRIPT_PANEL_ANIMATION_MS);
    }

    private finishTranscriptPanelHide(panel: HTMLElement): void {
        if (this.transcriptPanel !== panel) return;
        const revealedPageContent = !panel.hidden;
        this.clearTranscriptPanelAnimation();
        panel.hidden = true;
        this.syncTranscriptPanelFullscreenDisplayOverride();
        panel.classList.remove('jpdb-subtitle-panel-entering', 'jpdb-subtitle-panel-opened', 'jpdb-subtitle-panel-closing');
        this.transcriptPanelClosing = false;
        this.syncControls();
        if (revealedPageContent) this.options.onTranscriptPanelClosed?.();
    }

    private clearTranscriptPanelAnimation(): void {
        this.transcriptPanelHideTimer = clearWindowTimeout(this.transcriptPanelHideTimer);
    }

    private clearDeferredTranscriptPanelRender(): void {
        this.transcriptDeferredRenderFrame = clearWindowAnimationFrame(this.transcriptDeferredRenderFrame);
        this.transcriptDeferredRenderTimer = clearWindowTimeout(this.transcriptDeferredRenderTimer);
    }

    private clearTranscriptVirtualRender(): void {
        this.transcriptVirtualRenderFrame = clearWindowAnimationFrame(this.transcriptVirtualRenderFrame);
    }

    private openLinesPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.prepareTranscriptPanelOpen('lines', options)) return;
        const deferRender = options.deferRender === true;
        if (deferRender) {
            this.renderTranscriptPanelPreview();
            this.syncPreviewOpenControls();
            this.scheduleDeferredTranscriptPanelRender();
            return;
        }
        this.clearDeferredTranscriptPanelRender();
        this.renderTranscriptPanel(true);
        this.syncControls();
    }

    private openShadowPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.prepareTranscriptPanelOpen('shadow', options)) return;
        this.clearDeferredTranscriptPanelRender();
        this.clearTranscriptVirtualRender();
        this.renderShadowPanel(true);
        this.syncControls();
    }

    private openBatchMiningPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.prepareTranscriptPanelOpen('mine', options)) return;
        this.clearDeferredTranscriptPanelRender();
        this.clearTranscriptVirtualRender();
        this.renderBatchMiningPanel();
        this.syncControls();
    }

    private prepareTranscriptPanelOpen(mode: 'lines' | 'shadow' | 'mine', options: TranscriptPanelOptions): boolean {
        if (!this.transcriptPanel || !this.hasTranscriptSurface()) return false;
        // Opening a transcript-backed panel is a completeness-sensitive
        // discrete action: a silently-grown native cue list must not render a
        // drawer that is missing its tail for up to the staleness bound.
        this.forceNativeCueRefresh();
        if (!options.autoPause) this.pausePanelDismissed = false;
        this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
        this.panelMode = mode;
        this.showTranscriptPanelElement();
        // Record the open as page-scoped runtime intent only. Persisting it into
        // `subtitleTranscriptVisible` (a global setting) is what leaked an open
        // drawer across tabs and onto the homepage.
        if (options.persist ?? true) this.transcriptPanelSessionOpen = true;
        return true;
    }

    private replayShadowCue(): void {
        const cue = this.currentCue;
        if (!cue || !this.video) return;
        this.shadowAutoPausedCueSignature = '';
        this.seekVideoTo(Math.max(0, cue.start));
        this.currentCue = cue;
        // Replaying while looping re-pins the loop to the line you just replayed.
        if (this.shadowLoopEnabled) this.shadowLoopCue = cue;
        this.playShadowModelLine();
        this.renderShadowPanel(true);
    }

    private playShadowModelLine(): void {
        if (!this.video) return;
        try {
            const result = this.video.play();
            if (result && typeof result.catch === 'function') void result.catch(() => undefined);
        } catch {
            // Some pages or test environments block programmatic playback.
        }
    }

    private toggleShadowLoop(): void {
        this.shadowLoopEnabled = !this.shadowLoopEnabled;
        this.shadowLoopCue = this.shadowLoopEnabled ? this.currentCue : undefined;
        if (this.shadowLoopEnabled) this.replayShadowCue();
        else this.renderShadowPanel(true);
    }

    private toggleShadowAutoPause(): void {
        const settings = this.options.getSettings();
        settings.subtitleShadowAutoPause = !settings.subtitleShadowAutoPause;
        this.shadowAutoPausedCueSignature = '';
        this.options.onSettingsChange(['subtitleShadowAutoPause']);
        this.renderShadowPanel(true);
    }

    private toggleShadowText(): void {
        this.shadowTextVisible = !this.shadowTextVisible;
        this.renderShadowPanel(true);
    }

    // Loop a single line for shadowing practice. The check runs every video frame
    // and on the polling tick; it must survive overshoot (a missed boundary frame
    // leaves currentTime past cue.end, with the live currentCue already advanced to
    // the next line) — so it re-seeks whenever playback is outside the pinned line.
    private syncShadowLoop(): void {
        if (!this.shadowLoopEnabled || !this.video) return;
        const cue = this.shadowLoopCue ?? this.currentCue;
        if (!cue) return;
        if (this.video.paused
            && this.options.getSettings().subtitleShadowAutoPause
            && this.shadowAutoPausedCueSignature === subtitleCueSignature(cue)) return;
        const time = this.subtitlePlaybackTime(this.video);
        if (time >= cue.end - 0.05 || time < cue.start - 0.3) {
            this.seekVideoTo(Math.max(0, cue.start));
            // Pin the panel to the looped line even if playback briefly overran it.
            if (this.currentCue !== cue) {
                this.currentCue = cue;
                this.renderShadowPanel(true);
            }
        }
    }

    private syncShadowAutoPause(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitleShadowAutoPause || this.panelMode !== 'shadow' || !this.video || this.video.paused || !this.currentCue) return;
        const cue = this.currentCue;
        const signature = subtitleCueSignature(cue);
        if (this.shadowAutoPausedCueSignature === signature) return;
        const time = this.subtitlePlaybackTime(this.video);
        if (time < cue.start - 0.05 || time < cue.end - 0.05) return;
        this.shadowAutoPausedCueSignature = signature;
        this.video.pause();
        this.clearShadowRecordingIfCueChanged(cue);
        this.renderShadowPanel(true);
        this.syncControls();
    }

    // Neighbours of a cue in the primary cue list (by identity, falling back to
    // matching start/end so a cloned currentCue still resolves its siblings).
    private shadowCueNeighbors(cue: SubtitleCue): { prev?: SubtitleCue; next?: SubtitleCue } {
        if (!this.cues.length) return {};
        let index = this.cues.indexOf(cue);
        if (index < 0) index = this.cues.findIndex(item => item.start === cue.start && item.end === cue.end);
        if (index < 0) return {};
        return { prev: this.cues[index - 1], next: this.cues[index + 1] };
    }

    private gotoShadowNeighbor(target: HTMLElement): void {
        const direction = target.closest<HTMLElement>('[data-shadow-goto]')?.dataset.shadowGoto;
        const cue = this.currentCue;
        if (!cue) return;
        const neighbors = this.shadowCueNeighbors(cue);
        const goal = direction === 'prev' ? neighbors.prev : neighbors.next;
        if (goal) this.seekToCueObject(goal, { exact: true });
    }

    private async toggleShadowRecording(): Promise<void> {
        if (this.shadowRecorder && this.shadowRecorder.state !== 'inactive') {
            this.stopShadowRecording();
            return;
        }
        const cue = this.currentCue;
        const mediaDevices = navigator.mediaDevices;
        if (!mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            this.shadowRecordingUnavailable = true;
            this.renderShadowPanel(true);
            return;
        }
        try {
            this.clearShadowRecording();
            if (this.video && !this.video.paused) this.video.pause();
            const stream = await mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            const chunks: Blob[] = [];
            recorder.addEventListener('dataavailable', event => {
                if (event.data && event.data.size) chunks.push(event.data);
            });
            recorder.addEventListener('stop', () => {
                const recordingSignature = this.shadowRecordingCueSignature;
                this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
                stream.getTracks().forEach(track => track.stop());
                if (!this.shadowRecordingDiscard && chunks.length) {
                    this.clearShadowRecording();
                    this.shadowRecordingUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
                    this.shadowRecordingCueSignature = recordingSignature;
                }
                if (!this.shadowRecordingDiscard && !chunks.length) this.clearShadowRecording();
                if (this.shadowRecordingDiscard) this.clearShadowRecording();
                this.shadowRecordingDiscard = false;
                this.shadowRecorder = undefined;
                this.renderShadowPanel(true);
            });
            this.shadowRecordingUnavailable = false;
            this.shadowRecorder = recorder;
            this.shadowRecordingCueSignature = cue ? subtitleCueSignature(cue) : '';
            this.shadowRecordingDiscard = false;
            recorder.start();
            this.scheduleShadowRecordingStop(cue);
            this.renderShadowPanel(true);
        } catch (error) {
            log.warn('Shadow self-recording unavailable', error);
            this.shadowRecorder = undefined;
            this.shadowRecordingUnavailable = true;
            this.renderShadowPanel(true);
        }
    }

    private playShadowRecording(): void {
        if (!this.shadowRecordingUrl) return;
        try {
            if (this.video && !this.video.paused) this.video.pause();
            this.shadowPlaybackAudio?.pause();
            const audio = new Audio(this.shadowRecordingUrl);
            this.shadowPlaybackAudio = audio;
            audio.addEventListener('ended', () => {
                if (this.shadowPlaybackAudio === audio) this.shadowPlaybackAudio = undefined;
            }, { once: true });
            void audio.play().catch(() => undefined);
        } catch {
            // Playback can throw in hardened contexts; ignore so the panel stays usable.
        }
    }

    private stopShadowRecording(options: { discard?: boolean } = {}): void {
        if (!this.shadowRecorder || this.shadowRecorder.state === 'inactive') return;
        this.shadowRecordingDiscard = this.shadowRecordingDiscard || options.discard === true;
        this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
        try {
            this.shadowRecorder.stop();
        } catch {
            this.shadowRecorder = undefined;
        }
    }

    private scheduleShadowRecordingStop(cue: SubtitleCue | undefined): void {
        this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
        if (!cue) return;
        const durationMs = Math.max(1200, Math.min(15000, Math.round((cue.end - cue.start) * 1000) + 800));
        this.shadowRecordingStopTimer = window.setTimeout(() => this.stopShadowRecording(), durationMs);
    }

    private clearShadowRecording(): void {
        this.shadowRecordingStopTimer = clearWindowTimeout(this.shadowRecordingStopTimer);
        if (this.shadowRecorder && this.shadowRecorder.state !== 'inactive') this.stopShadowRecording({ discard: true });
        this.shadowPlaybackAudio?.pause();
        this.shadowPlaybackAudio = undefined;
        if (this.shadowRecordingUrl) {
            URL.revokeObjectURL(this.shadowRecordingUrl);
            this.shadowRecordingUrl = undefined;
        }
        this.shadowRecordingCueSignature = '';
    }

    private resetShadowPracticeState(): void {
        this.shadowLoopEnabled = false;
        this.shadowLoopCue = undefined;
        this.shadowAutoPausedCueSignature = '';
        this.clearShadowRecording();
    }

    private clearShadowRecordingIfCueChanged(cue: SubtitleCue | undefined): void {
        if (!this.shadowRecordingCueSignature) return;
        const nextSignature = cue ? subtitleCueSignature(cue) : '';
        if (nextSignature === this.shadowRecordingCueSignature) return;
        this.clearShadowRecording();
    }

    private syncPreviewOpenControls(): void {
        this.root?.classList.add('jpdb-subtitle-panel-open');
        this.syncDrawerButtons(this.hasVisibleSubtitleLines());
    }

    private toggleNativeSubtitleBlur(target?: HTMLElement | null): void {
        const settings = this.options.getSettings();
        settings.subtitleNativeBlurred = !settings.subtitleNativeBlurred;
        const appliedInline = this.applyNativeSubtitleBlurState(settings.subtitleNativeBlurred, settings.interfaceLanguage, target);
        this.syncSubtitleStyleControls();
        this.options.onSettingsChange(['subtitleNativeBlurred']);
        if (!appliedInline) this.render();
    }

    private applyNativeSubtitleBlurState(nativeBlurred: boolean, language: ReaderSettings['interfaceLanguage'], target?: HTMLElement | null): boolean {
        const targets = target
            ? [target]
            : Array.from(this.subtitleEl?.querySelectorAll<HTMLElement>(NATIVE_SUBTITLE_BLUR_CONTROL_SELECTOR) ?? []);
        if (!targets.length) return false;
        // The line is state-synced in place and the next render re-syncs the
        // same node rather than re-emitting it, so there is no cached markup
        // left to keep byte-identical.
        for (const button of targets) syncSubtitleSecondaryBlurState(button, nativeBlurred, language);
        return true;
    }

    private togglePausePanelMode(): void {
        const settings = this.options.getSettings();
        settings.subtitlePausePanel = !settings.subtitlePausePanel;
        if (settings.subtitlePausePanel) {
            // "Open when paused" is mutually exclusive with "open by default":
            // turning it on clears the persisted default and the runtime open.
            settings.subtitleTranscriptVisible = false;
            this.transcriptPanelSessionOpen = false;
            if (this.video && this.video.paused && !this.video.ended && this.hasTranscriptSurface()) {
                this.openLinesPanel({ persist: false, autoPause: true, deferRender: true });
            } else if (this.isTranscriptPanelOpen()) {
                this.closeTranscriptPanel({ persist: false, autoPause: true });
            }
        } else {
            this.pausePanelOpen = false;
        }
        this.options.onSettingsChange(['subtitlePausePanel', 'subtitleTranscriptVisible']);
        this.renderOpenSubtitlePanel();
        this.syncControls();
    }

    private refreshTranscriptPanelAfterTrackChange(): void {
        if (this.shouldRestoreTranscriptPanel()) {
            this.openLinesPanel();
            return;
        }
        if (!this.isTranscriptPanelOpen()) return;
        if (this.panelMode === 'lines') {
            if (this.hasTranscriptSurface()) {
                this.renderTranscriptPanel(true);
            }
            else this.closeTranscriptPanel();
            return;
        }
        if (this.panelMode === 'shadow') {
            if (this.hasTranscriptSurface()) this.renderShadowPanel(true);
            else this.closeTranscriptPanel();
            return;
        }
        if (this.panelMode === 'mine') {
            if (this.hasTranscriptSurface()) this.renderBatchMiningPanel();
            else this.closeTranscriptPanel();
            return;
        }
        this.renderTrackPanel();
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncPanelState();
    }

    private shouldRestoreTranscriptPanel(): boolean {
        if (!this.hasTranscriptSurface()) return false;
        if (this.transcriptPanelSessionOpen) return true;
        // Persisted "open by default" applies once per surface from the load
        // path (track change), so a manual close sticks and opening never
        // writes the setting back — the 1.6.15 cross-tab leak fix moved this
        // out of the persisted flag but left no load-time trigger at all.
        if (!this.transcriptDefaultOpenApplied && this.options.getSettings().subtitleTranscriptVisible) {
            this.transcriptDefaultOpenApplied = true;
            return true;
        }
        return false;
    }

    private isTranscriptPanelOpen(): boolean {
        return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }

    private openTracksPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.transcriptPanel) return;
        const persist = options.persist ?? true;
        if (!options.autoPause) this.pausePanelDismissed = false;
        this.pausePanelOpen = this.shouldAutoHideOpenPanel(options);
        this.panelMode = 'tracks';
        this.clearDeferredTranscriptPanelRender();
        this.clearTranscriptVirtualRender();
        // A fresh tracks-tab open starts at the top of the (possibly virtualized) list.
        this.tracksVirtualScrollTop = 0;
        this.renderedTracksVirtualWindow = undefined;
        this.tracksVirtualRenderFrame = clearWindowAnimationFrame(this.tracksVirtualRenderFrame);
        this.showTranscriptPanelElement();
        // The tracks tab is a config surface, not the "lines open" state: don't
        // let a track change re-restore lines behind it.
        if (persist) this.transcriptPanelSessionOpen = false;
        this.renderTrackPanel();
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncPanelState();
    }

    private shouldAutoHideOpenPanel(options: TranscriptPanelOptions): boolean {
        if (options.autoPause) return true;
        const settings = this.options.getSettings();
        return Boolean(settings.subtitlePausePanel && this.video && this.video.paused && !this.video.ended);
    }

    private closeTranscriptPanel(options: TranscriptPanelOptions = {}): void {
        if (!this.transcriptPanel) return;
        const persist = options.persist ?? true;
        this.panelOptionsMenuOpen = false;
        this.clearDeferredTranscriptPanelRender();
        this.clearTranscriptVirtualRender();
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        this.transcriptFollowState.clear();
        if (!options.autoPause) {
            this.pausePanelOpen = false;
            // An explicit close while paused must stick: otherwise the "open panel
            // when paused" feature reopens it on the next tick and the toggle can
            // never close it. Re-arm on the next play (see the play listener).
            if (this.options.getSettings().subtitlePausePanel) this.pausePanelDismissed = true;
        }
        this.hideTranscriptPanelElement({ immediate: options.immediate });
        // Closing is page-scoped runtime state; it must not rewrite the persisted
        // "open by default" preference (that leaked closed/open across tabs).
        if (persist) this.transcriptPanelSessionOpen = false;
        this.clearVideoInsetForTranscriptPanel();
        this.syncControls();
    }

    private toggleSubtitleStylePanel(): void {
        const nextOpen = !this.subtitleStylePanelOpen;
        if (nextOpen) {
            if (this.options.getSettings().subtitlePausePanel) this.pausePanelDismissed = true;
            if (this.isTranscriptPanelOpen()) this.closeTranscriptPanel({ persist: false, immediate: true });
        }
        this.subtitleStylePanelOpen = nextOpen;
        this.syncSubtitleStyleControls();
        this.showControlsTemporarily();
    }

    private closeSubtitleStylePanel(options: { sync?: boolean } = {}): void {
        if (!this.subtitleStylePanelOpen) return;
        this.subtitleStylePanelOpen = false;
        if (options.sync !== false) this.syncSubtitleStyleControls();
    }

    private syncSubtitleStyleControls(): void {
        if (!this.root) return;
        syncSubtitleStylePopoverControls(this.root, this.options.getSettings(), this.subtitleStylePanelOpen);
    }

    private schedulePauseTranscriptPanelSync(): void {
        // Opening the pause panel rebuilds the transcript DOM and triggers
        // layout work; doing that synchronously inside the pause event makes
        // pausing feel sluggish. Defer past the next paint so the player's
        // pause feedback renders first (rAF runs before paint; the nested
        // timeout lands after it).
        if (this.pausePanelSyncScheduled) return;
        this.pausePanelSyncScheduled = true;
        requestAnimationFrame(() => window.setTimeout(() => {
            this.pausePanelSyncScheduled = false;
            if (this.destroyed) return;
            this.syncPauseTranscriptPanel();
        }, 0));
    }

    private syncPauseTranscriptPanel(options: { deferRender?: boolean } = {}): void {
        const settings = this.options.getSettings();
        if (!settings.subtitlePausePanel || !this.video || !this.video.paused || this.video.ended || !this.hasTranscriptSurface()) {
            this.closePauseTranscriptPanel();
            return;
        }
        if (this.pausePanelDismissed || this.subtitleStylePanelOpen || this.isTranscriptPanelOpen()) return;
        this.openLinesPanel({ persist: false, autoPause: true, deferRender: options.deferRender });
    }

    private closePauseTranscriptPanel(): void {
        if (!this.pausePanelOpen) return;
        this.pausePanelOpen = false;
        this.closeTranscriptPanel({ persist: false, autoPause: true });
    }

    private openSubtitleTracksPanelFromHost(): void {
        this.openTracksPanel({ persist: false });
        this.showControlsTemporarily();
        this.syncControls();
    }

    private holdPanelRenderDuringPress(render: () => void): boolean {
        // Every drawer render re-emits the panel as markup, so a cue advance
        // destroys and recreates each control in it — including whichever one a
        // finger is currently on. Measured in Chromium: when the pressed node is
        // removed before release, a mouse click is dropped outright, and a touch
        // click is re-hit-tested at release, landing on whatever control the
        // rebuild moved into that spot (tap "hide the translation", get a seek).
        // Node identity is not enough to save it: re-attaching the very same
        // element in the same task still loses the mouse click. So the render waits
        // for the finger instead.
        //
        // The release is the click, not pointerup: a touch click is dispatched
        // after pointerup — and after a task boundary — so flushing any earlier
        // still eats the tap. pointercancel (a scroll taking the pointer) and a
        // safety cap cover taps that never become a click.
        if (!this.panelPressHeld) return false;
        this.heldPanelRender = render;
        return true;
    }

    private beginPanelPress(event: Event): void {
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.('button,[data-action]')) return;
        this.panelPressHeld = true;
        this.panelPressHoldTimer = clearWindowTimeout(this.panelPressHoldTimer);
        this.panelPressHoldTimer = window.setTimeout(() => this.endPanelPress(), PANEL_PRESS_RENDER_HOLD_MAX_MS);
    }

    private endPanelPress(): void {
        this.panelPressHoldTimer = clearWindowTimeout(this.panelPressHoldTimer);
        if (!this.panelPressHeld) return;
        this.panelPressHeld = false;
        const held = this.heldPanelRender;
        this.heldPanelRender = undefined;
        if (held && !this.destroyed) held();
    }

    private resetPanelPressHold(): void {
        this.panelPressHoldTimer = clearWindowTimeout(this.panelPressHoldTimer);
        this.panelPressHeld = false;
        this.heldPanelRender = undefined;
    }

    private renderTranscriptPanel(force = false): void {
        const panel = this.renderableTranscriptPanel();
        if (!panel) return;
        if (this.holdPanelRenderDuringPress(() => this.renderTranscriptPanel(force))) return;
        this.clearDeferredTranscriptPanelRender();
        this.transcriptPreviewPlayerResizeDeferred = false;
        const state = this.transcriptPanelRenderState();
        if (this.canRefreshTranscriptPanel(force, state)) return;
        // Try the in-place patch first: an append-only cue-list growth (or a
        // scroll-driven window shift) can reuse the existing scroller node, so
        // it never replaces the panel and never paints a spacer-only frame.
        // Falls back to a full render for structure changes, shrinks, or
        // non-virtualized transcripts.
        const scroller = panel.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        if (scroller && this.patchTranscriptVirtualWindow(state, scroller)) return;
        this.lastTranscriptStructureSignature = state.structureSignature;
        this.lastTranscriptSignature = state.signature;
        this.renderedVirtualWindow = state.virtual
            ? { start: state.virtual.start, end: state.virtual.end, rowCount: state.totalRowCount ?? state.rows.length }
            : undefined;
        setInnerHtml(panel, this.transcriptPanelSurface.renderPanelHtml(state));
        this.afterTranscriptPanelRender(state);
    }

    private renderTranscriptPanelPreview(): void {
        const panel = this.renderableTranscriptPanel();
        if (!panel) return;
        const fullState = this.transcriptPanelRenderState();
        const state = this.transcriptPanelPreviewState(fullState);
        this.transcriptPreviewPlayerResizeDeferred = true;
        this.lastTranscriptSignature = '';
        setInnerHtml(panel, this.transcriptPanelSurface.renderPanelHtml(state));
        this.afterTranscriptPanelRender(state, { deferPlayerResize: true });
    }

    private renderShadowPanel(force = false): void {
        const panel = this.renderableShadowPanel();
        if (!panel) return;
        if (this.holdPanelRenderDuringPress(() => this.renderShadowPanel(force))) return;
        const state = this.shadowPanelRenderState();
        if (!force && state.signature === this.lastShadowSignature) return;
        this.lastShadowSignature = state.signature;
        this.transcriptTextTargetsByParseKey.clear();
        setInnerHtml(panel, this.renderShadowPanelHtml(state));
        this.indexTranscriptTextTargets(panel);
        this.bindTranscriptResizeHandle();
        this.positionTranscriptPanel();
        this.syncPanelState();
        if (state.cue && state.parseKey) this.requestParsedShadowLineIfNeeded(state.cue, state.parseKey, state.signature, state.settings);
    }

    private renderableShadowPanel(): HTMLElement | null {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
        return this.panelMode === 'shadow' ? this.transcriptPanel : null;
    }

    private shadowPanelRenderState(): ShadowPanelRenderState {
        const settings = this.options.getSettings();
        const cue = this.currentCue;
        const secondary = cue ? findAlignedCue(this.secondaryCues, cue) ?? this.secondaryCue : undefined;
        const parseKey = cue?.text.trim() ? this.parseCacheKey(cue.text, settings) : '';
        return { settings, cue, secondary, parseKey, signature: this.shadowPanelSignature(cue, secondary, parseKey) };
    }

    private shadowPanelSignature(cue: SubtitleCue | undefined, secondary: SubtitleCue | undefined, parseKey: string): string {
        return [
            cue ? subtitleCueSignature(cue) : '',
            secondary ? subtitleCueSignature(secondary) : '',
            parseKey,
            this.shadowLoopEnabled,
            this.options.getSettings().subtitleShadowAutoPause,
            this.options.getSettings().subtitleNativeBlurred,
            this.options.getSettings().subtitleSecondaryVisible,
            this.shadowTextVisible,
            this.shadowRecorder && this.shadowRecorder.state !== 'inactive' ? 'rec' : '',
            this.shadowRecordingUrl ? 'has-rec' : '',
            this.shadowRecordingUnavailable ? 'no-mic' : '',
            this.selectedTrackId,
            this.secondaryTrackId,
        ].join('|');
    }

    private renderShadowPanelHtml(state: ShadowPanelRenderState): string {
        const language = state.settings.interfaceLanguage;
        return `
            ${this.renderShadowPanelHead(state)}
            <div class="jpdb-subtitle-list-scroll jpdb-subtitle-shadow-scroll">
                ${this.renderShadowPanelBody(state)}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>
        `;
    }

    private renderShadowPanelHead(state: ShadowPanelRenderState): string {
        const language = state.settings.interfaceLanguage;
        return renderDrawerHead({
            mode: 'shadow',
            title: uiText(language, 'subtitlesTitle'),
            meta: subtitleDrawerMetaText({
                mode: 'lines',
                count: state.cue?.text.trim() ? 1 : 0,
                tracks: this.tracks,
                selectedTrackId: this.selectedTrackId,
                secondaryTrackId: this.secondaryTrackId,
                language,
            }),
            metaTitle: subtitleDrawerMetaText({
                mode: 'lines',
                count: state.cue?.text.trim() ? 1 : 0,
                tracks: this.tracks,
                selectedTrackId: this.selectedTrackId,
                secondaryTrackId: this.secondaryTrackId,
                language,
                compact: false,
            }),
            canShowLines: this.hasTranscriptSurface(),
            options: this.panelOptionsState(state.settings.subtitlePausePanel, language),
        });
    }

    private renderShadowPanelBody(state: ShadowPanelRenderState): string {
        const cueText = state.cue?.text.trim();
        if (!state.cue || !cueText) return this.transcriptPanelSurface.renderWaitingState();
        return this.renderShadowCueCard(state.cue, cueText, state);
    }

    private renderShadowCueCard(cue: SubtitleCue, cueText: string, state: ShadowPanelRenderState): string {
        return renderSubtitleShadowCueCard({
            cue,
            parseKey: state.parseKey,
            parsedLine: this.shadowParsedLine(cueText, state.parseKey, state.settings),
            textVisible: this.shadowTextVisible,
            secondaryText: state.secondary?.text,
            secondaryVisible: state.settings.subtitleSecondaryVisible,
            secondaryBlurred: state.settings.subtitleNativeBlurred,
            neighbors: this.shadowCueNeighbors(cue),
            language: state.settings.interfaceLanguage,
            primaryContent: subtitleContentLanguage(this.tracks.find(track => track.id === this.selectedTrackId), this.subtitleLanguageContext.targetContent),
            secondaryContent: subtitleContentLanguage(this.tracks.find(track => track.id === this.secondaryTrackId), this.subtitleLanguageContext.outputContent),
            actionsHtml: renderSubtitleShadowActions({
                language: state.settings.interfaceLanguage,
                recording: (this.shadowRecorder?.state ?? 'inactive') !== 'inactive',
                loopEnabled: this.shadowLoopEnabled,
                autoPause: state.settings.subtitleShadowAutoPause,
                textVisible: this.shadowTextVisible,
                hasRecording: Boolean(this.shadowRecordingUrl),
                recordingUnavailable: this.shadowRecordingUnavailable,
            }),
        });
    }

    private shadowParsedLine(cueText: string, parseKey: string, settings: ReaderSettings): ShadowParsedLine {
        const parsed = this.shadowParsedHtml(parseKey, settings);
        if (!parsed) return { html: escapeWithBreaks(cueText), parsedKeyAttribute: '', provisionalAttribute: '' };
        return {
            html: parsed,
            parsedKeyAttribute: ` data-parsed-key="${escapeHtml(parseKey)}"`,
            provisionalAttribute: this.htmlCache.parsedHtmlCache.has(parseKey) ? '' : ' data-parsed-provisional="true"',
        };
    }

    private shadowParsedHtml(parseKey: string, settings: ReaderSettings): string | undefined {
        if (!this.shouldParseSubtitles(settings)) return undefined;
        return this.cachedParsedCueHtml(parseKey, settings) ?? this.htmlCache.provisionalParsedHtmlCache.get(parseKey);
    }

    private requestParsedShadowLineIfNeeded(cue: SubtitleCue, key: string, signature: string, settings: ReaderSettings): void {
        if (!this.shouldParseSubtitles(settings) || this.cachedParsedCueHtml(key, settings) !== undefined) {
            const target = this.transcriptPanel ? this.transcriptTextTargetsForParseKey(this.transcriptPanel, key)[0] : undefined;
            if (target && this.htmlCache.parsedHtmlCache.has(key)) this.notifyParsedTokensForKey(key, true, [target]);
            return;
        }
        void this.parseCueHtml(cue.text, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true })
            .then(html => {
                if (this.panelMode !== 'shadow' || signature !== this.lastShadowSignature) return;
                this.updateTranscriptRowsForParseKey(key, html, { force: true });
            })
            .catch(() => undefined);
    }

    private renderBatchMiningPanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== 'mine') return;
        if (this.holdPanelRenderDuringPress(() => this.renderBatchMiningPanel())) return;
        this.clearDeferredTranscriptPanelRender();
        this.transcriptTextTargetsByParseKey.clear();
        setInnerHtml(this.transcriptPanel, renderSubtitleBatchMiningPanel(this.batchMiningPanelRenderState()));
        this.bindTranscriptResizeHandle();
        this.positionTranscriptPanel();
        this.syncPanelState();
    }

    private batchMiningPanelRenderState(): Parameters<typeof renderSubtitleBatchMiningPanel>[0] {
        const settings = this.options.getSettings();
        const rows = this.batchMiningRows.length ? this.batchMiningRows : this.currentBatchMiningRows();
        const candidates = this.batchMiningCandidates.map(candidate => ({
            ...candidate,
            selected: this.batchMiningSelectedKeys.has(candidate.key),
        }));
        return {
            status: this.batchMiningStatus,
            candidates,
            selectedKeys: this.batchMiningSelectedKeys,
            summary: subtitleBatchMiningSummary(rows, candidates),
            reviewGrades: this.batchMiningReviewGrades(settings),
            errorMessage: this.batchMiningError,
            hasTranscriptSurface: this.hasTranscriptSurface(),
            pausePanelEnabled: settings.subtitlePausePanel,
            placement: this.effectiveTranscriptPlacement,
            optionsMenuOpen: this.panelOptionsMenuOpen,
            language: settings.interfaceLanguage,
            targetContent: this.subtitleLanguageContext.targetContent,
        };
    }

    private batchMiningReviewGrades(settings: ReaderSettings): SubtitleBatchMiningGradeOption[] {
        if (!this.canReviewBatchMiningCandidates(settings)) return [];
        return settings.twoButtonReviews
            ? [
                { grade: 'fail', label: uiText(settings.interfaceLanguage, 'gradeFailLabel') },
                { grade: 'pass', label: uiText(settings.interfaceLanguage, 'gradePassLabel') },
            ]
            : [
                { grade: 'nothing', label: uiText(settings.interfaceLanguage, 'gradeNothingLabel') },
                { grade: 'something', label: uiText(settings.interfaceLanguage, 'gradeSomethingLabel') },
                { grade: 'hard', label: uiText(settings.interfaceLanguage, 'gradeHardLabel') },
                { grade: 'okay', label: uiText(settings.interfaceLanguage, 'gradeOkayLabel') },
                { grade: 'easy', label: uiText(settings.interfaceLanguage, 'gradeEasyLabel') },
            ];
    }

    private canReviewBatchMiningCandidates(settings: ReaderSettings): boolean {
        return settings.enableReviews
            && (settings.yomuLocalSrsEnabled
                || settings.bunproMiningEnabled
                || (settings.jpdbMiningEnabled && this.hasAuthoritativeParseTier(settings)));
    }

    private currentBatchMiningRows(): SubtitleBatchMiningRow[] {
        const settings = this.options.getSettings();
        return this.transcriptRows().map((row, rowIndex) => {
            const key = this.parseCacheKey(row.cue.text, settings);
            return {
                rowIndex,
                cueIndex: row.cueIndex,
                start: row.cue.start,
                end: row.cue.end,
                text: row.cue.text,
                tokens: this.htmlCache.parsedTokenCache.get(key) ?? [],
            };
        });
    }

    private async scanBatchMiningTranscript(): Promise<void> {
        // The scan SNAPSHOTS transcriptRows() into batchMiningRows: rows a
        // later refresh would add can never join this scan, so the cue lists
        // must be current at the moment of snapshotting.
        this.forceNativeCueRefresh();
        const rows = this.transcriptRows();
        const settings = this.options.getSettings();
        if (!rows.length || !canParseSubtitleTranscriptRows(settings)) {
            this.batchMiningStatus = 'failed';
            this.batchMiningError = subtitleText(settings.interfaceLanguage, 'bmNoTranscript');
            this.renderBatchMiningPanel();
            return;
        }

        const serial = ++this.batchMiningSerial;
        this.batchMiningStatus = 'scanning';
        this.batchMiningError = '';
        this.batchMiningCandidates = [];
        this.batchMiningSelectedKeys.clear();
        this.batchMiningRows = rows.map((row, rowIndex) => ({
            rowIndex,
            cueIndex: row.cueIndex,
            start: row.cue.start,
            end: row.cue.end,
            text: row.cue.text,
            tokens: [],
        }));
        this.renderBatchMiningPanel();

        try {
            for (let start = 0; start < rows.length; start += BATCH_MINING_PARSE_BATCH) {
                if (serial !== this.batchMiningSerial) return;
                const chunk = rows.slice(start, start + BATCH_MINING_PARSE_BATCH);
                await this.parseCueHtmlBatch(chunk.map(row => row.cue.text), settings, {
                    allowProvisional: false,
                    enrichBeforeRender: true,
                });
                this.captureBatchMiningParsedRows(rows, start, chunk.length, settings);
                this.renderBatchMiningPanel();
                await waitForBackgroundTranscriptParseTurn(0);
            }
            if (serial !== this.batchMiningSerial) return;
            this.batchMiningCandidates = buildSubtitleBatchMiningCandidates(this.batchMiningRows);
            this.batchMiningSelectedKeys = new Set(this.batchMiningCandidates.filter(candidate => candidate.selected).map(candidate => candidate.key));
            this.batchMiningStatus = 'ready';
            this.renderBatchMiningPanel();
        } catch (error) {
            if (serial !== this.batchMiningSerial) return;
            this.batchMiningStatus = 'failed';
            this.batchMiningError = error instanceof Error ? error.message : subtitleText(settings.interfaceLanguage, 'bmFailed');
            this.renderBatchMiningPanel();
        }
    }

    private captureBatchMiningParsedRows(rows: TranscriptRow[], startIndex: number, count: number, settings: ReaderSettings): void {
        for (let offset = 0; offset < count; offset += 1) {
            const row = rows[startIndex + offset];
            const target = this.batchMiningRows[startIndex + offset];
            if (!row || !target) continue;
            const key = this.parseCacheKey(row.cue.text, settings);
            target.tokens = this.htmlCache.parsedTokenCache.get(key) ?? [];
        }
    }

    private toggleBatchMiningCandidate(target: HTMLElement): void {
        const key = target.closest<HTMLElement>('[data-batch-candidate-key]')?.dataset.batchCandidateKey;
        if (!key) return;
        if (this.batchMiningSelectedKeys.has(key)) this.batchMiningSelectedKeys.delete(key);
        else this.batchMiningSelectedKeys.add(key);
        this.renderBatchMiningPanel();
    }

    private async openBatchMiningCandidate(target: HTMLElement): Promise<void> {
        const candidate = this.batchMiningCandidateForTarget(target);
        if (!candidate || !this.options.showBatchMiningCard) return;
        await this.options.showBatchMiningCard(candidate);
    }

    private async addSelectedBatchMiningCandidates(): Promise<void> {
        const language = this.options.getSettings().interfaceLanguage;
        const candidates = this.selectedBatchMiningCandidates();
        if (!candidates.length || !this.options.mineBatchMiningCandidates) {
            this.options.toast?.(candidates.length ? uiText(language, 'batchMiningNoDestination') : subtitleText(language, 'bmNoSelection'));
            return;
        }
        try {
            const count = await this.options.mineBatchMiningCandidates(candidates);
            for (const candidate of candidates) this.batchMiningSelectedKeys.delete(candidate.key);
            this.options.toast?.(formatSubtitleText(language, 'bmAdded', { count }));
            this.renderBatchMiningPanel();
        } catch (error) {
            log.warn('Batch mining add failed', error);
            this.options.toast?.(subtitleText(language, 'bmAddFailed'));
        }
    }

    private async copySelectedBatchMiningCandidates(): Promise<void> {
        const language = this.options.getSettings().interfaceLanguage;
        const candidates = this.selectedBatchMiningCandidates();
        if (!candidates.length) {
            this.options.toast?.(subtitleText(language, 'bmNoSelection'));
            return;
        }
        await copyText(subtitleBatchMiningTsv(candidates));
        this.options.toast?.(formatSubtitleText(language, 'bmCopied', { count: candidates.length }));
    }

    private async gradeBatchMiningCandidate(target: HTMLElement): Promise<void> {
        const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
        const candidate = this.batchMiningCandidateForTarget(target);
        if (!grade || !candidate) return;
        await this.gradeBatchMiningCandidates([candidate], grade);
    }

    private async gradeSelectedBatchMiningCandidates(target: HTMLElement): Promise<void> {
        const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
        if (!grade) return;
        await this.gradeBatchMiningCandidates(this.selectedBatchMiningCandidates(), grade);
    }

    private async gradeBatchMiningCandidates(candidates: SubtitleBatchMiningCandidate[], grade: JPDBGrade): Promise<void> {
        const language = this.options.getSettings().interfaceLanguage;
        if (!candidates.length || !this.options.gradeBatchMiningCandidates) {
            this.options.toast?.(candidates.length ? uiText(language, 'batchMiningNoDestination') : subtitleText(language, 'bmNoSelection'));
            return;
        }
        try {
            const count = await this.options.gradeBatchMiningCandidates(candidates, grade);
            for (const candidate of candidates) {
                candidate.state = primaryCardState(candidate.card.cardState);
                this.batchMiningSelectedKeys.delete(candidate.key);
            }
            this.options.toast?.(formatSubtitleText(language, 'bmGraded', { count }));
            this.renderBatchMiningPanel();
        } catch (error) {
            log.warn('Batch mining grade failed', error);
            this.options.toast?.(subtitleText(language, 'bmGradeFailed'));
        }
    }

    private selectAllBatchMiningCandidates(): void {
        this.batchMiningSelectedKeys = new Set(this.batchMiningCandidates.map(candidate => candidate.key));
        this.renderBatchMiningPanel();
    }

    private clearBatchMiningSelection(): void {
        this.batchMiningSelectedKeys.clear();
        this.renderBatchMiningPanel();
    }

    private selectedBatchMiningCandidates(): SubtitleBatchMiningCandidate[] {
        return this.batchMiningCandidates.filter(candidate => this.batchMiningSelectedKeys.has(candidate.key));
    }

    private batchMiningCandidateForTarget(target: HTMLElement): SubtitleBatchMiningCandidate | undefined {
        const key = target.closest<HTMLElement>('[data-batch-candidate-key]')?.dataset.batchCandidateKey;
        return key ? this.batchMiningCandidates.find(candidate => candidate.key === key) : undefined;
    }

    private transcriptPanelPreviewState(state: TranscriptPanelRenderState): TranscriptPanelRenderState {
        const rowCount = state.rows.length;
        if (!rowCount) return { ...state, signature: `preview:${state.signature}`, totalRowCount: 0 };
        const activeIndex = state.currentRowIndex >= 0 ? state.currentRowIndex : 0;
        const clampedActive = Math.min(Math.max(activeIndex, 0), rowCount - 1);
        const previewStart = Math.max(0, Math.min(clampedActive - 1, rowCount - 3));
        const previewEnd = Math.min(rowCount, previewStart + 3);
        return {
            rows: state.rows.slice(previewStart, previewEnd),
            warmupRows: state.warmupRows,
            currentRowIndex: state.currentRowIndex,
            structureSignature: `preview:${state.structureSignature}`,
            baseSignature: `preview:${state.baseSignature}`,
            signature: `preview:${state.signature}:${previewStart}`,
            rowIndexOffset: previewStart,
            totalRowCount: rowCount,
        };
    }

    private scheduleDeferredTranscriptPanelRender(): void {
        this.clearDeferredTranscriptPanelRender();
        this.transcriptDeferredRenderFrame = requestAnimationFrame(() => {
            this.transcriptDeferredRenderFrame = undefined;
            this.transcriptDeferredRenderTimer = window.setTimeout(() => {
                this.transcriptDeferredRenderTimer = undefined;
                if (this.destroyed || !this.isTranscriptPanelOpen() || this.panelMode !== 'lines') return;
                if (this.transcriptResizeActive) {
                    this.scheduleDeferredTranscriptPanelRender();
                    return;
                }
                this.renderTranscriptPanel(true);
                this.syncControls();
            }, TRANSCRIPT_DEFERRED_RENDER_DELAY_MS);
        });
    }

    private renderableTranscriptPanel(): HTMLElement | null {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
        return this.panelMode === 'lines' ? this.transcriptPanel : null;
    }

    private canRefreshTranscriptPanel(force: boolean, state: TranscriptPanelRenderState): boolean {
        if (force) return false;
        return this.refreshExistingTranscriptPanel(state);
    }

    private transcriptPanelRenderState(): TranscriptPanelRenderState {
        const rows = this.transcriptRows();
        const currentCueIndex = this.activeTranscriptIndex();
        const currentRowIndex = this.activeTranscriptRowIndex(rows, currentCueIndex);
        const settings = this.options.getSettings();
        const virtual = this.transcriptVirtualWindow(rows.length, currentRowIndex);
        const renderedRows = virtual ? rows.slice(virtual.start, virtual.end) : rows;
        const structureSignature = [
            this.selectedTrackId,
            this.tracks.find(track => track.id === this.selectedTrackId)?.loadingState ?? '',
            !this.cues.length && this.currentCue ? subtitleCueSignature(this.currentCue) : '',
            this.parseCacheKey('', settings),
        ].join(':');
        const baseSignature = [structureSignature, rows.length].join(':');
        const signature = [baseSignature, virtual ? `v:${virtual.start}:${virtual.end}` : ''].join(':');
        return {
            rows: renderedRows,
            warmupRows: virtual ? renderedRows : undefined,
            currentRowIndex,
            structureSignature,
            baseSignature,
            signature,
            rowIndexOffset: virtual?.start,
            totalRowCount: virtual ? rows.length : undefined,
            virtual,
        };
    }

    private transcriptVirtualWindow(rowCount: number, currentRowIndex: number): TranscriptPanelVirtualWindow | undefined {
        if (rowCount <= TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) return undefined;
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        const rowEstimate = this.transcriptRowEstimatePx;
        const clientHeight = Math.max(
            scroller?.clientHeight ?? 0,
            Math.round((this.transcriptPanel?.getBoundingClientRect().height ?? 0) * 0.72),
            rowEstimate * 6,
        );
        const scrollTop = Math.max(0, scroller?.scrollTop ?? this.transcriptVirtualScrollTop);
        const visibleRows = Math.max(
            TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS,
            Math.ceil(clientHeight / rowEstimate) + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS * 2,
        );
        const { start, end } = this.resolveVirtualWindowBounds(rowCount, currentRowIndex, scrollTop, visibleRows);
        return {
            start,
            end,
            scrollTop,
            topSpacer: start * rowEstimate,
            bottomSpacer: Math.max(0, (rowCount - end) * rowEstimate),
        };
    }

    private resolveVirtualWindowBounds(rowCount: number, currentRowIndex: number, scrollTop: number, visibleRows: number): { start: number; end: number } {
        // While auto-following, keep the committed window as long as the active row
        // stays comfortably inside it: consecutive line advances then reuse the same
        // window so the panel signature is unchanged and only the cheap active-line
        // class-swap runs — no full list re-render recreating (and flickering) the
        // highlighted row. The window only shifts when the active row nears an edge,
        // or on a user scroll (auto-follow paused), where it tracks scrollTop as before.
        const prev = this.renderedVirtualWindow;
        const autoFollowing = this.options.getSettings().subtitleTranscriptAutoScroll && !this.isTranscriptAutoScrollPaused();
        if (autoFollowing && prev && prev.rowCount === rowCount && prev.end - prev.start === visibleRows
            && currentRowIndex >= prev.start + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS
            && currentRowIndex < prev.end - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS) {
            return { start: prev.start, end: prev.end };
        }
        const preferredStart = this.transcriptVirtualStartIndex(scrollTop, currentRowIndex, visibleRows);
        const start = Math.max(0, Math.min(preferredStart, Math.max(0, rowCount - visibleRows)));
        return { start, end: Math.min(rowCount, start + visibleRows) };
    }

    private transcriptVirtualStartIndex(scrollTop: number, currentRowIndex: number, visibleRows: number): number {
        if (this.shouldCenterActiveTranscriptRow(scrollTop, currentRowIndex, visibleRows)) {
            return currentRowIndex - Math.floor(visibleRows / 2);
        }
        return Math.floor(scrollTop / this.transcriptRowEstimatePx) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
    }

    private shouldCenterActiveTranscriptRow(scrollTop: number, currentRowIndex: number, visibleRows: number): boolean {
        if (currentRowIndex < 0) return false;
        if (!this.options.getSettings().subtitleTranscriptAutoScroll) return false;
        if (this.isTranscriptAutoScrollPaused()) return false;
        const firstRendered = Math.floor(scrollTop / this.transcriptRowEstimatePx) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
        const lastRendered = firstRendered + visibleRows - 1;
        return scrollTop <= 1 || currentRowIndex < firstRendered || currentRowIndex > lastRendered;
    }

    private refreshExistingTranscriptPanel(state: TranscriptPanelRenderState): boolean {
        if (this.lastTranscriptSignature !== state.signature) return false;
        this.updateTranscriptActiveLine(state.currentRowIndex);
        const hydrationIndex = this.transcriptHydrationPreferredIndex(state);
        this.scheduleTranscriptHydration(hydrationIndex);
        this.scheduleTranscriptCacheWarmup(state.rows, hydrationIndex);
        return true;
    }

    private afterTranscriptPanelRender(state: TranscriptPanelRenderState, options: { deferPlayerResize?: boolean; warmupRows?: TranscriptRow[] } = {}): void {
        this.indexTranscriptTextTargets();
        this.calibrateTranscriptRowEstimate();
        this.bindTranscriptScroller();
        this.bindTranscriptResizeHandle();
        this.positionTranscriptPanel({ resizeEventMode: options.deferPlayerResize ? 'none' : 'immediate' });
        this.restoreTranscriptVirtualScroll(state);
        this.scrollTranscriptToActive();
        const hydrationIndex = this.transcriptHydrationPreferredIndex(state);
        this.scheduleTranscriptHydration(hydrationIndex);
        this.scheduleTranscriptCacheWarmup(options.warmupRows ?? state.warmupRows ?? state.rows, hydrationIndex);
        this.syncPanelState();
    }

    private transcriptHydrationPreferredIndex(state: TranscriptPanelRenderState): number {
        return state.virtual?.start ?? state.currentRowIndex;
    }

    private restoreTranscriptVirtualScroll(state: TranscriptPanelRenderState): void {
        if (!state.virtual) return;
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        if (!scroller) return;
        const scrollTop = Math.max(0, state.virtual.scrollTop);
        if (Math.abs(scroller.scrollTop - scrollTop) > 1) {
            scroller.scrollTop = scrollTop;
        }
        this.transcriptVirtualScrollTop = scrollTop;
    }

    // Blend the measured mean height of the rows on screen into the estimate.
    // Damped so a window of unusually tall/short rows nudges rather than jerks
    // the geometry; clamped so a degenerate measurement can't wreck the map.
    private calibrateTranscriptRowEstimate(): void {
        // Never recalibrate while the user is hand-scrolling: the estimate
        // scales BOTH spacers and the scroll->index map, so changing it
        // mid-interaction moves the content under the finger and feeds the
        // next window computation — the panel visibly drifts "by itself".
        // Frozen geometry is idempotent: same scrollTop -> same window.
        if (this.isTranscriptAutoScrollPaused()) return;
        const rows = Array.from(this.transcriptPanel?.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row') ?? []);
        if (rows.length < 4) return;
        const total = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
        const mean = total / rows.length;
        if (!Number.isFinite(mean) || mean <= 0) return;
        const blended = this.transcriptRowEstimatePx * 0.4 + mean * 0.6;
        this.transcriptRowEstimatePx = Math.min(240, Math.max(40, blended));
    }

    private transcriptRows(): TranscriptRow[] {
        if (this.cues.length) {
            return this.cues
                .map((cue, cueIndex) => ({ cue, cueIndex }))
                .filter(row => row.cue.transcriptEligible !== false);
        }
        return this.currentCue && this.currentCue.transcriptEligible !== false
            ? [{ cue: this.currentCue, cueIndex: -1 }]
            : [];
    }

    private transcriptRowParseKey(row: TranscriptRow, rowIndex: number, rows: TranscriptRow[], settings: ReaderSettings): string {
        if (!this.shouldParseTranscriptRowWithContext(rows, rowIndex)) return this.parseCacheKey(row.cue.text, settings);
        const context = this.transcriptContextWindow(rows, rowIndex);
        return this.parseCacheKey(`transcript-context:${context.rowStart}:${context.rowEnd}:${context.text}`, settings);
    }

    private shouldParseTranscriptRowWithContext(rows: TranscriptRow[], rowIndex: number): boolean {
        const text = rows[rowIndex]?.cue.text;
        if (!text?.trim()) return false;
        const previous = rows[rowIndex - 1]?.cue.text;
        const next = rows[rowIndex + 1]?.cue.text;
        return (isTranscriptContextJoinChar(lastTextChar(previous ?? '')) && isTranscriptContextJoinChar(firstTextChar(text)))
            || (isTranscriptContextJoinChar(lastTextChar(text)) && isTranscriptContextJoinChar(firstTextChar(next ?? '')));
    }

    private transcriptContextWindow(rows: TranscriptRow[], rowIndex: number): TranscriptContextWindow {
        const startIndex = Math.max(0, rowIndex - 1);
        const endIndex = Math.min(rows.length, rowIndex + 2);
        let text = '';
        let rowStart = 0;
        for (let index = startIndex; index < endIndex; index += 1) {
            if (index === rowIndex) rowStart = text.length;
            text += rows[index]?.cue.text ?? '';
        }
        return {
            text,
            rowStart,
            rowEnd: rowStart + (rows[rowIndex]?.cue.text.length ?? 0),
        };
    }

    private updateTranscriptActiveLine(currentIndex: number): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== 'lines') return;
        const activeRows = Array.from(this.transcriptPanel.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active'));
        const active = this.transcriptPanel.querySelector<HTMLElement>(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
        if (active && activeRows.length === 1 && activeRows[0] === active) return;
        const previousIndex = activeRows.length === 1 ? Number(activeRows[0]!.dataset.rowIndex) : undefined;
        activeRows.forEach(row => {
            if (row !== active) row.classList.remove('active');
        });
        if (active) active.classList.add('active');
        this.scrollTranscriptToActive({ behavior: this.transcriptActiveLineScrollBehavior(previousIndex, currentIndex) });
    }

    // Only a small, nearby move between two already-mounted rows -- e.g. the
    // ordinary line-by-line advance during playback -- reads well as a smooth
    // glide. A default/full render, an explicit jump, or a large seek should
    // land instantly: animating across a big distance (or one the viewer didn't
    // themselves request) just reads as sluggish, not helpful.
    private transcriptActiveLineScrollBehavior(previousIndex: number | undefined, currentIndex: number): ScrollBehavior {
        if (previousIndex === undefined || !Number.isFinite(previousIndex) || currentIndex < 0) return 'auto';
        if (this.prefersReducedMotion()) return 'auto';
        const delta = Math.abs(currentIndex - previousIndex);
        if (delta === 0 || delta > TRANSCRIPT_SMOOTH_FOLLOW_MAX_ROWS) return 'auto';
        return 'smooth';
    }

    private prefersReducedMotion(): boolean {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    }

    private scrollTranscriptToActive(options: { force?: boolean; behavior?: ScrollBehavior; sync?: boolean } = {}): void {
        if ((!options.force && !this.options.getSettings().subtitleTranscriptAutoScroll) || !this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
        // Respect a manual scroll: don't yank the list back to the active row
        // while the viewer is reading elsewhere. Auto-follow resumes after the
        // configurable resume window with no further manual scrolling.
        if (!options.force && this.isTranscriptAutoScrollPaused()) return;
        const behavior: ScrollBehavior = options.behavior ?? 'auto';
        const perform = () => {
            this.transcriptScrollFrame = undefined;
            if (this.destroyed) return;
            const active = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active');
            if (!active) return;
            active.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior });
        };
        if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
        if (options.sync) {
            this.transcriptScrollFrame = undefined;
            perform();
            return;
        }
        this.transcriptScrollFrame = requestAnimationFrame(perform);
    }

    private noteTranscriptScroll(): void {
        if (!this.options.getSettings().subtitleTranscriptAutoScroll) return;
        if (!this.transcriptFollowState.noteScroll()) return;
        this.syncTranscriptAutoScrollPausedClass();
        this.scheduleTranscriptAutoScrollResume();
    }

    private noteTranscriptScrollIntent(): void {
        if (!this.options.getSettings().subtitleTranscriptAutoScroll) return;
        this.transcriptFollowState.armUserScroll();
    }

    private jumpToCurrentTranscriptRow(): void {
        this.clearTranscriptManualScrollPause();
        this.clearTranscriptVirtualRender();
        this.renderTranscriptPanel(true);
        this.scrollTranscriptToActive({ force: true });
    }

    private clearTranscriptManualScrollPause(): void {
        this.transcriptFollowState.clear();
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        this.syncTranscriptAutoScrollPausedClass();
    }

    private scheduleTranscriptAutoScrollResume(): void {
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        const remaining = this.transcriptFollowState.remainingPauseMs(this.transcriptAutoScrollResumeMs());
        this.transcriptAutoScrollResumeTimer = window.setTimeout(() => {
            this.transcriptAutoScrollResumeTimer = undefined;
            this.syncTranscriptAutoScrollPausedClass();
            this.scrollTranscriptToActive();
        }, remaining + 20);
    }

    private syncTranscriptAutoScrollPausedClass(): void {
        if (this.transcriptPanel) {
            setClassState(this.transcriptPanel, 'jpdb-subtitle-auto-scroll-paused', this.isTranscriptAutoScrollPaused());
        }
    }

    private isTranscriptAutoScrollPaused(): boolean {
        return Boolean(this.options.getSettings().subtitleTranscriptAutoScroll
            && this.transcriptFollowState.isPaused(this.transcriptAutoScrollResumeMs()));
    }

    private transcriptAutoScrollResumeMs(): number {
        const seconds = this.options.getSettings().subtitleTranscriptAutoScrollResumeSeconds;
        const resumeSeconds = Number.isFinite(seconds) ? Math.max(1, seconds) : TRANSCRIPT_AUTO_SCROLL_RESUME_FALLBACK_SECONDS;
        return (resumeSeconds === TRANSCRIPT_AUTO_SCROLL_RESUME_LEGACY_DEFAULT_SECONDS
            ? TRANSCRIPT_AUTO_SCROLL_RESUME_FALLBACK_SECONDS
            : resumeSeconds) * 1000;
    }

    private bindTranscriptScroller(): void {
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        if (!scroller || scroller.dataset.transcriptHydrationBound === 'true') return;
        scroller.dataset.transcriptHydrationBound = 'true';
        scroller.addEventListener('scroll', () => {
            this.noteTranscriptScroll();
            this.scheduleTranscriptHydration();
            this.scheduleTranscriptVirtualRender(scroller);
        }, { passive: true });
        // Scroll events are also produced by hydration, virtualization, layout
        // correction and scrollIntoView. Arm manual mode only from direct input;
        // the next scroll consumes the arm and pauses follow. Momentum remains
        // manual through the existing resume timer.
        const armUserScroll = () => this.noteTranscriptScrollIntent();
        // Native desktop scrollbar drags do not reliably emit pointermove on
        // the scroller. Chrome does emit mousedown before the scrollbar starts
        // moving, so arm intent there as well; a plain click without a scroll
        // consumes nothing and cannot desynchronise follow mode.
        scroller.addEventListener('mousedown', armUserScroll, { passive: true });
        scroller.addEventListener('touchmove', armUserScroll, { passive: true });
        scroller.addEventListener('pointermove', event => {
            if (event.buttons || event.pointerType === 'touch') this.noteTranscriptScrollIntent();
        }, { passive: true });
        scroller.addEventListener('wheel', armUserScroll, { passive: true });
        scroller.addEventListener('keydown', event => {
            if (isTranscriptScrollIntentKey(event)) this.noteTranscriptScrollIntent();
        });
    }

    private scheduleTranscriptVirtualRender(scroller: HTMLElement): void {
        if (!this.isTranscriptVirtualScroller(scroller)) return;
        this.transcriptVirtualScrollTop = scroller.scrollTop;
        if (this.transcriptVirtualRenderFrame) return;
        this.transcriptVirtualRenderFrame = requestAnimationFrame(() => {
            this.transcriptVirtualRenderFrame = undefined;
            if (this.destroyed || this.transcriptResizeActive || !this.isTranscriptPanelOpen() || this.panelMode !== 'lines') return;
            const state = this.transcriptPanelRenderState();
            if (!state.virtual || state.signature === this.lastTranscriptSignature) return;
            if (this.patchTranscriptVirtualWindow(state, scroller)) return;
            this.renderTranscriptPanel(true);
        });
    }

    private isTranscriptVirtualScroller(scroller: HTMLElement): boolean {
        return scroller.dataset.virtualized === 'true';
    }

    private patchTranscriptVirtualWindow(state: TranscriptPanelRenderState, scroller: HTMLElement): boolean {
        // A scroll-driven virtual-window shift, or an append-only cue-list growth,
        // only needs the rows inside the scroller swapped; the scroller element
        // itself (and everything else in the panel) is unchanged. Patching its
        // children in place -- instead of routing through renderTranscriptPanel's
        // full setInnerHtml(panel, ...) -- keeps the scroller node identity stable,
        // so a tablet's in-flight native touch scroll gesture (bound to that node)
        // survives the update instead of stopping dead, and growth never paints a
        // spacer-only, whitespace-band frame while the new rows mount.
        // Only safe when the structure hasn't changed and the row count is equal
        // or grew (append-only); a shrink or a structure change falls back to a
        // full render.
        if (!state.virtual) return false;
        if (!this.isTranscriptVirtualScroller(scroller)) return false;
        if (state.structureSignature !== this.lastTranscriptStructureSignature) return false;
        const previousRowCount = this.renderedVirtualWindow?.rowCount;
        const rowCount = state.totalRowCount ?? state.rows.length;
        if (previousRowCount === undefined || rowCount < previousRowCount) return false;
        const rowIndexOffset = state.rowIndexOffset ?? 0;
        const transcriptRows = this.transcriptRows();
        setInnerHtml(scroller, `
            ${this.transcriptPanelSurface.renderVirtualSpacer(state.virtual.topSpacer)}
            ${state.rows.length
                ? state.rows.map((row, index) => this.transcriptPanelSurface.renderRow(row, rowIndexOffset + index, state.currentRowIndex, transcriptRows)).join('')
                : this.transcriptPanelSurface.renderWaitingState()}
            ${this.transcriptPanelSurface.renderVirtualSpacer(state.virtual.bottomSpacer)}
        `);
        scroller.dataset.totalRows = String(rowCount);
        this.lastTranscriptStructureSignature = state.structureSignature;
        this.lastTranscriptSignature = state.signature;
        this.renderedVirtualWindow = { start: state.virtual.start, end: state.virtual.end, rowCount };
        this.transcriptVirtualScrollTop = state.virtual.scrollTop;
        this.indexTranscriptTextTargets();
        this.updateTranscriptDrawerMeta(rowCount);
        // Center synchronously (no rAF round-trip) so the active row is never
        // painted at an obsolete scrollTop against the freshly-grown spacers.
        // A manual (auto-follow-paused) scroll keeps its own scrollTop, since
        // state.virtual.scrollTop was computed from the current scrollTop.
        this.restoreTranscriptVirtualScroll(state);
        if (this.options.getSettings().subtitleTranscriptAutoScroll && !this.isTranscriptAutoScrollPaused()) {
            this.scrollTranscriptToActive({ behavior: 'auto', sync: true });
        }
        const hydrationIndex = this.transcriptHydrationPreferredIndex(state);
        this.scheduleTranscriptHydration(hydrationIndex);
        this.scheduleTranscriptCacheWarmup(state.warmupRows ?? state.rows, hydrationIndex);
        this.syncPanelState();
        return true;
    }

    private updateTranscriptDrawerMeta(rowCount: number): void {
        const metaEl = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-drawer-meta');
        if (!metaEl) return;
        const language = this.options.getSettings().interfaceLanguage;
        const metaArgs = {
            mode: 'lines' as const,
            count: rowCount,
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            language,
        };
        const meta = subtitleDrawerMetaText(metaArgs);
        const metaTitle = subtitleDrawerMetaText({ ...metaArgs, compact: false });
        metaEl.textContent = meta;
        metaEl.title = metaTitle;
    }

    private bindTranscriptResizeHandle(): void {
        const handle = this.transcriptPanel?.querySelector<HTMLElement>('[data-resize-transcript]');
        if (!handle || handle.dataset.transcriptResizeBound === 'true') return;
        handle.dataset.transcriptResizeBound = 'true';
        handle.addEventListener('pointerdown', event => this.startTranscriptResize(event));
        handle.addEventListener('keydown', event => this.resizeTranscriptPanelFromKeyboard(event));
        this.syncTranscriptResizeHandle();
    }

    private startTranscriptResize(event: PointerEvent): void {
        if (!this.transcriptPanel) return;
        event.preventDefault();
        event.stopPropagation();
        const placement = this.effectiveTranscriptPlacement;
        const panelRect = this.transcriptPanel.getBoundingClientRect();
        const resizeBounds = transcriptResizeBounds(this.transcriptViewportWidth(), this.transcriptViewportHeight());
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = panelRect.width;
        const startHeight = panelRect.height;
        const originalSize = { ...this.transcriptPanelSize };
        this.transcriptResizeActive = true;
        this.alignAfterTranscriptResize = false;
        this.pauseTranscriptBackgroundWorkForResize();
        this.transcriptPanel.classList.add('jpdb-subtitle-resizing');
        this.root?.classList.add('jpdb-subtitle-resizing');
        document.documentElement.classList.add('jpdb-subtitle-transcript-resizing');
        const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
        try {
            handle?.setPointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture is a convenience, not a requirement. Some
            // embedded/live players reject synthetic or retargeted pointers;
            // keep the window-level drag listeners alive either way.
        }

        // pointermove fires far faster than the display refreshes; coalesce the
        // layout-heavy positionTranscriptPanel into one call per animation frame
        // so dragging the sidebar resize handle stays smooth (it used to relayout
        // the whole panel on every raw pointer event).
        let resizeFrame: number | undefined;
        let finished = false;
        let lastClientX = startX;
        let lastClientY = startY;
        const onMove = (moveEvent: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
            lastClientX = moveEvent.clientX;
            lastClientY = moveEvent.clientY;
            Object.assign(this.transcriptPanelSize, transcriptResizePatchForPointerDrag({
                bounds: resizeBounds,
                currentX: moveEvent.clientX,
                currentY: moveEvent.clientY,
                placement,
                startHeight,
                startWidth,
                startX,
                startY,
            }));
            if (resizeFrame !== undefined) return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = undefined;
                if (this.destroyed) return;
                this.positionTranscriptPanel({ skipInset: true, skipControlSync: true, skipResizeHandle: true });
            });
        };

        const finish = (mode: 'commit' | 'cancel' | 'settle', clientX = lastClientX, clientY = lastClientY) => {
            if (finished) return;
            finished = true;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            window.removeEventListener('mouseup', onMouseUp);
            handle?.removeEventListener('lostpointercapture', onLostPointerCapture);
            if (resizeFrame !== undefined) {
                cancelAnimationFrame(resizeFrame);
                resizeFrame = undefined;
            }
            try {
                if (handle?.hasPointerCapture?.(event.pointerId)) handle.releasePointerCapture(event.pointerId);
            } catch {
                // Capture can already be gone on cancel/lostpointercapture.
            }
            if (mode === 'cancel') {
                Object.assign(this.transcriptPanelSize, originalSize);
                this.positionTranscriptPanel({ skipInset: true, skipControlSync: true, skipResizeHandle: true });
                this.finishTranscriptResize();
                this.scheduleAlignToVideo();
                return;
            }
            const distance = Math.hypot(clientX - startX, clientY - startY);
            if (distance <= 8) {
                Object.assign(this.transcriptPanelSize, originalSize);
                this.finishTranscriptResize();
                if (mode === 'commit' || (mode === 'settle' && placement === 'bottom')) this.closeTranscriptPanel();
                else this.scheduleAlignToVideo();
                return;
            }
            saveTranscriptPanelSize(this.transcriptPanelSize);
            this.positionTranscriptPanel({ realignAfterInset: true, resizeEventMode: 'settled' });
            const shouldAlignAfterResize = this.finishTranscriptResize();
            this.scrollTranscriptToActive();
            if (shouldAlignAfterResize) this.scheduleAlignToVideo();
        };
        const onPointerUp = (upEvent: PointerEvent) => finish('commit', upEvent.clientX, upEvent.clientY);
        const onPointerCancel = () => finish('cancel');
        const onMouseUp = (upEvent: MouseEvent) => finish('commit', upEvent.clientX, upEvent.clientY);
        const onLostPointerCapture = () => finish('settle');

        window.addEventListener('pointermove', onMove, this.eventOptions());
        window.addEventListener('pointerup', onPointerUp, this.eventOptions());
        window.addEventListener('pointercancel', onPointerCancel, this.eventOptions());
        window.addEventListener('mouseup', onMouseUp, this.eventOptions());
        handle?.addEventListener('lostpointercapture', onLostPointerCapture, this.eventOptions());
    }

    private finishTranscriptResize(): boolean {
        const shouldAlignAfterResize = this.alignAfterTranscriptResize;
        this.transcriptResizeActive = false;
        this.alignAfterTranscriptResize = false;
        this.transcriptPanel?.classList.remove('jpdb-subtitle-resizing');
        this.root?.classList.remove('jpdb-subtitle-resizing');
        document.documentElement.classList.remove('jpdb-subtitle-transcript-resizing');
        this.resumeTranscriptBackgroundWorkAfterResize();
        return shouldAlignAfterResize;
    }

    private pauseTranscriptBackgroundWorkForResize(): void {
        this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
        this.transcriptHydrationSerial += 1;
        this.transcriptCacheWarmupSerial += 1;
        this.transcriptHydrationAfterResizeIndex = this.activeTranscriptRowIndex();
        this.transcriptWarmupAfterResize = true;
        this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
    }

    private resumeTranscriptBackgroundWorkAfterResize(): void {
        const preferredIndex = this.transcriptHydrationAfterResizeIndex;
        const shouldHydrate = preferredIndex !== undefined;
        const shouldWarmup = this.transcriptWarmupAfterResize;
        this.transcriptHydrationAfterResizeIndex = undefined;
        this.transcriptWarmupAfterResize = false;
        this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
        if (!shouldHydrate && !shouldWarmup) return;
        this.transcriptResizeBackgroundResumeTimer = window.setTimeout(() => {
            this.transcriptResizeBackgroundResumeTimer = undefined;
            if (this.destroyed || this.transcriptResizeActive || !this.canHydrateTranscriptRows()) return;
            const index = preferredIndex ?? this.activeTranscriptRowIndex();
            if (shouldHydrate) this.scheduleTranscriptHydration(index);
            if (shouldWarmup) this.scheduleTranscriptCacheWarmup(this.transcriptRows(), index);
        }, 160);
    }

    private resizeTranscriptPanelFromKeyboard(event: KeyboardEvent): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        const placement = this.effectiveTranscriptPlacement;
        const direction = transcriptResizeKeyboardDirection(placement, event.key);
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();

        Object.assign(this.transcriptPanelSize, transcriptResizePatchForKeyboard({
            bounds: transcriptResizeBounds(this.transcriptViewportWidth(), this.transcriptViewportHeight()),
            direction,
            panelRect: panel.getBoundingClientRect(),
            placement,
        }));
        saveTranscriptPanelSize(this.transcriptPanelSize);
        this.positionTranscriptPanel();
        this.scrollTranscriptToActive();
    }

    private syncTranscriptResizeHandle(layout?: TranscriptPanelLayout): void {
        const handle = this.transcriptPanel?.querySelector<HTMLElement>('[data-resize-transcript]');
        if (!handle) return;
        const panelRect = layout ? undefined : this.transcriptPanel?.getBoundingClientRect();
        const metrics = transcriptResizeHandleMetrics({
            bounds: transcriptResizeBounds(this.transcriptViewportWidth(), this.transcriptViewportHeight()),
            layout,
            panelRect,
            placement: this.effectiveTranscriptPlacement,
        });
        handle.setAttribute('role', 'separator');
        handle.setAttribute('tabindex', '0');
        handle.setAttribute('aria-orientation', metrics.orientation);
        handle.setAttribute('aria-valuemin', String(metrics.min));
        handle.setAttribute('aria-valuemax', String(metrics.max));
        handle.setAttribute('aria-valuenow', String(Math.round(metrics.current)));
    }

    private scheduleTranscriptHydration(preferredIndex?: number): void {
        if (this.transcriptResizeActive) {
            this.transcriptHydrationAfterResizeIndex = preferredIndex;
            return;
        }
        const index = preferredIndex ?? this.activeTranscriptRowIndex();
        if (this.transcriptHydrateFrame) return;
        this.transcriptHydrateFrame = requestAnimationFrame(() => {
            this.transcriptHydrateFrame = undefined;
            if (this.destroyed) return;
            void this.hydrateTranscriptRows(index);
        });
    }

    private activeTranscriptIndex(): number {
        if (!this.currentCue) return -1;
        const exact = this.cues.findIndex(cue => cue === this.currentCue);
        if (exact >= 0) return exact;
        return this.cues.findIndex(cue =>
            Math.abs(cue.start - this.currentCue!.start) < 0.05
            && Math.abs(cue.end - this.currentCue!.end) < 0.05
            && cue.text.trim() === this.currentCue!.text.trim());
    }

    private activeTranscriptRowIndex(rows = this.transcriptRows(), activeCueIndex = this.activeTranscriptIndex()): number {
        if (!rows.length) return -1;
        const exact = this.currentTranscriptRowIndex(rows);
        if (exact >= 0) return exact;
        if (activeCueIndex >= 0) return rows.findIndex(row => row.cueIndex === activeCueIndex);
        if (this.cues.length) return this.transcriptGapAnchorRowIndex(rows);
        return 0;
    }

    private transcriptGapAnchorRowIndex(rows: TranscriptRow[]): number {
        // A real inter-cue gap must still leave overlay/currentCue blank -- but for
        // the transcript list only, snapping to "no active row" makes the highlight
        // vanish and reappear a beat later, and forces a virtual-window recompute
        // for no reason. Anchor instead on the latest row whose cue has already
        // started: a seek into a gap lands near the seek destination immediately,
        // and playback running through a gap keeps the previous row highlighted
        // until the next cue advances it once. Only while auto-follow is enabled --
        // with it off the previous "no active row" gap behavior is unchanged.
        if (this.currentCue || !this.video) return -1;
        if (!this.options.getSettings().subtitleTranscriptAutoScroll) return -1;
        const time = this.subtitlePlaybackTime(this.video);
        for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (rows[index]!.cue.start <= time) return index;
        }
        return -1;
    }

    private currentTranscriptRowIndex(rows: TranscriptRow[]): number {
        return this.currentCue ? rows.findIndex(row => row.cue === this.currentCue) : -1;
    }

    private async hydrateTranscriptRows(preferredIndex: number): Promise<void> {
        const request = this.transcriptHydrationRequest();
        if (!request) return;
        const serial = ++this.transcriptHydrationSerial;
        const indexes = this.transcriptHydrationIndexes(preferredIndex, request.rows.length);
        const targets: TranscriptRowHydrationTarget[] = [];
        for (const index of indexes) {
            if (serial !== this.transcriptHydrationSerial) return;
            const hydration = this.transcriptRowHydrationTarget(index, request.settings, request.rows);
            if (!hydration) continue;
            const cached = this.htmlCache.parsedHtmlCache.get(hydration.key);
            if (cached) this.applyCachedTranscriptRowHtml(hydration, cached);
            else targets.push(hydration);
        }
        if (targets.length) await this.hydrateTranscriptRowTargets(targets, request.settings, serial);
    }

    private transcriptHydrationRequest(): { settings: ReaderSettings; rows: TranscriptRow[] } | null {
        if (!this.canHydrateTranscriptRows()) return null;
        const settings = this.options.getSettings();
        if (!canParseSubtitleTranscriptRows(settings)) return null;
        const rows = this.transcriptRows();
        return rows.length ? { settings, rows } : null;
    }

    private canHydrateTranscriptRows(): boolean {
        return Boolean(this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing && this.panelMode === 'lines');
    }

    private transcriptHydrationIndexes(preferredIndex: number, rowCount: number): number[] {
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        const plan = planTranscriptHydrationIndexes({
            preferredIndex,
            rowCount,
            scroller,
            cursor: this.transcriptHydrationCursor,
            activeBehind: TRANSCRIPT_ACTIVE_HYDRATION_BEHIND,
            activeAhead: TRANSCRIPT_ACTIVE_HYDRATION_AHEAD,
            maxRows: TRANSCRIPT_HYDRATION_MAX_ROWS,
            backgroundBatch: TRANSCRIPT_BACKGROUND_HYDRATION_BATCH,
        });
        this.transcriptHydrationCursor = plan.nextCursor;
        return plan.indexes;
    }

    private async hydrateTranscriptRowTargets(targets: TranscriptRowHydrationTarget[], settings: ReaderSettings, serial: number): Promise<void> {
        try {
            const rows = this.transcriptRows();
            const parsed = await this.parseTranscriptRowHtmlBatch(targets.map(target => ({
                rowIndex: target.rowIndex,
                text: target.cue.text,
                key: target.key,
            })), rows, settings, {
                enrichBeforeRender: true,
                refreshProvisional: true,
                requireEnrichedProvisional: true,
            });
            if (serial !== this.transcriptHydrationSerial) return;
            for (const item of parsed) {
                // Apply provisional html even while a fallback word is still
                // unresolved: most words already carry their colour, furigana
                // and pitch, and the row stays re-hydratable (non-enriched)
                // so later passes keep improving it. Dropping the whole row
                // here left visible lines bare/pitchless until the retry cap
                // even though enriched html for every other word was cached.
                this.updateTranscriptRowsForParseKey(item.key, item.html, {
                    provisional: item.provisional === true,
                    refreshProvisional: item.provisional === true && !this.htmlCache.parsedHtmlCache.has(item.key),
                });
            }
        } catch {
            targets.forEach(hydration => {
                hydration.target.dataset.parseFailedKey = hydration.key;
                hydration.target.dataset.parseFailedAt = String(Date.now());
                delete hydration.target.dataset.parsedKey;
            });
        }
    }

    private transcriptRowHydrationTarget(index: number, settings: ReaderSettings, rows: TranscriptRow[]): TranscriptRowHydrationTarget | null {
        const cue = rows[index]?.cue;
        const target = this.transcriptPanel?.querySelector<HTMLElement>(`.jpdb-subtitle-row-text[data-row-index="${index}"]`);
        if (!cue || !target) return null;
        const key = this.transcriptRowParseKey(rows[index], index, rows, settings);
        const provisionalNeedsHydration = (target.dataset.parsedProvisional === 'true'
            || (this.htmlCache.provisionalParsedHtmlCache.has(key) && !this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key)))
            && (this.hasAuthoritativeParseTier() || !this.htmlCache.enrichedProvisionalParsedHtmlKeys.has(key));
        return !provisionalNeedsHydration && hasAttemptedTranscriptParse(target, key) ? null : { cue, rowIndex: index, target, key };
    }

    private applyCachedTranscriptRowHtml(hydration: TranscriptRowHydrationTarget, html: string): void {
        hydration.target.dataset.parsedKey = hydration.key;
        delete hydration.target.dataset.parsedProvisional;
        delete hydration.target.dataset.parseEmptyKey;
        delete hydration.target.dataset.parseEmptyAt;
        delete hydration.target.dataset.parseFailedKey;
        delete hydration.target.dataset.parseFailedAt;
        setInnerHtml(hydration.target, html);
    }

    private scheduleTranscriptCacheWarmup(rows?: TranscriptRow[], preferredIndex?: number): void {
        if (this.transcriptResizeActive) {
            this.transcriptWarmupAfterResize = true;
            return;
        }
        const warmupRows = rows ?? this.transcriptRows();
        const index = preferredIndex ?? this.activeTranscriptRowIndex(warmupRows);
        const settings = this.options.getSettings();
        if (!this.shouldParseSubtitles(settings) || !warmupRows.length) return;
        const signature = this.transcriptCacheWarmupKey(warmupRows, settings, index);
        if (signature === this.transcriptCacheWarmupSignature) return;
        this.transcriptCacheWarmupSignature = signature;
        const serial = ++this.transcriptCacheWarmupSerial;
        void this.warmTranscriptParseCache(warmupRows, index, settings, serial);
    }

    private transcriptCacheWarmupKey(rows: TranscriptRow[], settings: ReaderSettings, preferredIndex: number): string {
        const first = rows[0]?.cue;
        const last = rows.at(-1)?.cue;
        return [
            this.selectedTrackId,
            rows.length,
            preferredIndex >= 0 ? Math.floor(preferredIndex / TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE) : 'start',
            first ? subtitleCueSignature(first) : '',
            last ? subtitleCueSignature(last) : '',
            this.parseCacheKey('', settings),
        ].join('|');
    }

    private async warmTranscriptParseCache(rows: TranscriptRow[], preferredIndex: number, settings: ReaderSettings, serial: number): Promise<void> {
        // afterLoadedCueStateChanged schedules overlay and transcript warmup
        // back-to-back. Without this shared barrier, the hidden transcript
        // workers can occupy the same public lookup queues while the visible
        // current/next cue is still baking.
        await this.awaitLatestPriorityYouTubeCueWarmup();
        if (serial !== this.transcriptCacheWarmupSerial) return;
        const planned = this.transcriptWarmupPlan(rows, preferredIndex, settings);
        if (!planned.length) return;

        let cursor = 0;
        const pauseMs = this.transcriptBackgroundParsePauseMs();
        const parseOptions = this.transcriptWarmupParseOptions(Math.max(rows.length, this.cues.length));
        const worker = async () => {
            while (cursor < planned.length) {
                if (serial !== this.transcriptCacheWarmupSerial) return;
                const batch = this.nextTranscriptWarmupBatch(planned, settings, () => cursor++);
                if (!batch.length) continue;
                try {
                    const parsed = await this.parseTranscriptRowHtmlBatch(batch, rows, settings, parseOptions);
                    if (serial !== this.transcriptCacheWarmupSerial) return;
                    for (const item of parsed) this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true });
                } catch {
                }
                // The plan is priority-ordered (visible + lookahead first):
                // never pace the head of the queue, only the background tail.
                if (cursor < planned.length && cursor > TRANSCRIPT_WARMUP_PRIORITY_ROWS) {
                    await waitForBackgroundTranscriptParseTurn(pauseMs);
                }
            }
        };

        const workers = Array.from(
            { length: Math.min(TRANSCRIPT_BACKGROUND_PARSE_CONCURRENCY, planned.length) },
            () => worker(),
        );
        await Promise.all(workers);
    }

    private async awaitLatestPriorityYouTubeCueWarmup(): Promise<void> {
        let pending: Promise<void>;
        do {
            pending = this.priorityYouTubeCueWarmup;
            await pending;
        } while (pending !== this.priorityYouTubeCueWarmup);
    }

    private transcriptWarmupParseOptions(totalRows: number): ParseCueHtmlOptions {
        if (this.shouldUseCheapYouTubeTranscriptWarmup(totalRows)) {
            return {
                allowProvisional: true,
                authoritativeUpgrade: false,
                enrichBeforeRender: false,
            };
        }
        return {
            allowProvisional: false,
            enrichBeforeRender: true,
        };
    }

    private shouldUseCheapYouTubeTranscriptWarmup(totalRows: number): boolean {
        return isYouTubePage() && totalRows > YOUTUBE_TRANSCRIPT_CHEAP_WARMUP_ROW_THRESHOLD;
    }

    private nextTranscriptWarmupBatch(
        planned: TranscriptParseItem[],
        settings: ReaderSettings,
        takeNextIndex: () => number,
    ): TranscriptParseItem[] {
        const batchSize = this.options.parseJapaneseBatch ? TRANSCRIPT_BACKGROUND_PARSE_BATCH : 1;
        const batch: TranscriptParseItem[] = [];
        while (batch.length < batchSize) {
            const item = planned[takeNextIndex()];
            if (!item) break;
            if (this.isWarmParsedCueKey(item.key, settings)) continue;
            batch.push(item);
        }
        return batch;
    }

    private transcriptWarmupPlan(rows: TranscriptRow[], preferredIndex: number, settings: ReaderSettings): TranscriptParseItem[] {
        const priority = this.transcriptHydrationIndexes(preferredIndex, rows.length);
        const focusIndex = preferredIndex >= 0 ? preferredIndex : 0;
        const orderedIndexes = transcriptWarmupIndexes(priority, focusIndex, rows.length);
        const limit = this.transcriptBackgroundParseLimit(rows.length);
        const seen = new Set<string>();
        const plan: TranscriptParseItem[] = [];
        for (const rowIndex of orderedIndexes) {
            this.addTranscriptWarmupPlanItem(plan, seen, rows, rowIndex, settings);
            if (plan.length >= limit) break;
        }
        return plan;
    }

    private transcriptBackgroundParseLimit(rowCount: number): number {
        if (isYouTubePage() && rowCount > YOUTUBE_TRANSCRIPT_CHEAP_WARMUP_ROW_THRESHOLD) {
            return Math.min(YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT, TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS);
        }
        if (isYouTubePage() && rowCount > YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT) {
            return YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_LIMIT;
        }
        return TRANSCRIPT_BACKGROUND_PARSE_LIMIT;
    }

    private addTranscriptWarmupPlanItem(
        plan: TranscriptParseItem[],
        seen: Set<string>,
        rows: TranscriptRow[],
        rowIndex: number,
        settings: ReaderSettings,
    ): void {
        const row = rows[rowIndex];
        const text = row?.cue.text;
        if (!text?.trim()) return;
        const key = this.transcriptRowParseKey(row, rowIndex, rows, settings);
        if (seen.has(key) || this.isWarmParsedCueKey(key, settings)) return;
        seen.add(key);
        plan.push({ rowIndex, text, key });
    }

    private transcriptBackgroundParsePauseMs(): number {
        return isYouTubePage() ? YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS : 0;
    }

    private updateTranscriptRowsForParseKey(key: string, html: string, options: { provisional?: boolean; force?: boolean; refreshProvisional?: boolean } = {}): void {
        if (!this.shouldParseSubtitles()) return;
        if (this.transcriptResizeActive) {
            this.transcriptWarmupAfterResize = true;
            return;
        }
        const panel = this.updatableTranscriptPanel();
        if (!panel) return;
        const hasReaderWords = parsedSubtitleHtmlHasReaderWords(html);
        const updatedRoots: HTMLElement[] = [];
        for (const target of this.transcriptTextTargetsForParseKey(panel, key)) {
            // force: a rebake refreshes rows that already carry this key's
            // final html (enrichment changed the underlying tokens).
            if (!options.force && !shouldApplyParsedTranscriptHtml(target, key, options.provisional === true, options.refreshProvisional === true)) continue;
            if (hasReaderWords) {
                target.dataset.parsedKey = key;
                if (options.provisional) target.dataset.parsedProvisional = 'true';
                else delete target.dataset.parsedProvisional;
                delete target.dataset.parseEmptyKey;
                delete target.dataset.parseEmptyAt;
                delete target.dataset.parseFailedKey;
                delete target.dataset.parseFailedAt;
                setInnerHtml(target, html);
                updatedRoots.push(target);
            } else {
                target.dataset.parseEmptyKey = key;
                target.dataset.parseEmptyAt = String(Date.now());
                delete target.dataset.parsedKey;
                delete target.dataset.parsedProvisional;
                delete target.dataset.parseFailedKey;
                delete target.dataset.parseFailedAt;
            }
        }
        if (updatedRoots.length) this.notifyParsedTokensForKey(key, true, updatedRoots);
    }

    private indexTranscriptTextTargets(panel = this.updatableTranscriptPanel()): void {
        this.transcriptTextTargetsByParseKey.clear();
        if (!panel) return;
        for (const target of Array.from(panel.querySelectorAll<HTMLElement>('[data-transcript-text][data-parse-key]'))) {
            const key = target.dataset.parseKey;
            if (!key) continue;
            const targets = this.transcriptTextTargetsByParseKey.get(key);
            if (targets) targets.push(target);
            else this.transcriptTextTargetsByParseKey.set(key, [target]);
        }
    }

    private transcriptTextTargetsForParseKey(panel: HTMLElement, key: string): HTMLElement[] {
        if (!this.transcriptTextTargetsByParseKey.size) this.indexTranscriptTextTargets(panel);
        const targets = this.transcriptTextTargetsByParseKey.get(key) ?? [];
        return targets.filter(target => target.isConnected && panel.contains(target));
    }

    private updatableTranscriptPanel(): HTMLElement | null {
        if (!this.transcriptPanel) return null;
        if (this.transcriptPanel.hidden || this.transcriptPanelClosing) return null;
        if (this.panelMode !== 'lines' && this.panelMode !== 'shadow') return null;
        return this.transcriptPanel;
    }

    private renderTrackPanel(): void {
        const panel = this.renderableTracksPanel();
        if (!panel) return;
        if (this.holdPanelRenderDuringPress(() => this.renderTrackPanel())) return;
        this.transcriptTextTargetsByParseKey.clear();
        const state = subtitleTrackPanelState(this.tracks);
        const settings = this.options.getSettings();
        const tracks = state.tracks.map(track => ({
            ...track,
            timing: this.trackTimingControlState(track.id),
        }));
        const virtual = this.tracksVirtualWindow(tracks.length);
        this.renderedTracksVirtualWindow = renderedTracksWindow(virtual, tracks.length);
        setInnerHtml(panel, renderSubtitleTrackPanel({
            ...state,
            tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            hasTranscriptSurface: this.hasTranscriptSurface(),
            pausePanelEnabled: settings.subtitlePausePanel,
            placement: this.effectiveTranscriptPlacement,
            optionsMenuOpen: this.panelOptionsMenuOpen,
            language: settings.interfaceLanguage,
            targetLanguage: this.subtitleLanguageContext.targetLanguage,
            outputLanguage: this.subtitleLanguageContext.outputLanguage,
            animeSearchQuery: subtitleAnimeSearchQuery(this.video),
            virtual,
        }));
        this.restoreTracksVirtualScroll(virtual);
        this.bindTranscriptResizeHandle();
        this.bindTracksScroller();
        this.syncPanelState();
    }

    private renderableTracksPanel(): HTMLElement | undefined {
        const panel = this.transcriptPanel;
        if (!panel) return undefined;
        const renderable = [!panel.hidden, !this.transcriptPanelClosing, this.panelMode === 'tracks'].every(Boolean);
        return renderable ? panel : undefined;
    }

    // Render only the visible window of track rows (plus overscan) when a video
    // exposes more than the threshold of (auto-translated) caption tracks, so the
    // Tracks tab opens and the sidebar resizes without reflowing hundreds of rows.
    private tracksVirtualWindow(rowCount: number): { start: number; end: number; topSpacer: number; bottomSpacer: number } | undefined {
        if (rowCount <= TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) return undefined;
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        const clientHeight = Math.max(
            scroller?.clientHeight ?? 0,
            Math.round((this.transcriptPanel?.getBoundingClientRect().height ?? 0) * 0.72),
            TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX * 6,
        );
        const scrollTop = Math.max(0, scroller?.scrollTop ?? this.tracksVirtualScrollTop);
        const visibleRows = Math.max(
            TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS,
            Math.ceil(clientHeight / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS * 2,
        );
        const firstRow = Math.floor(Math.max(0, scrollTop - TRACKS_VIRTUAL_HEADER_PX) / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
        const start = Math.max(0, Math.min(firstRow, Math.max(0, rowCount - visibleRows)));
        const end = Math.min(rowCount, start + visibleRows);
        return {
            start,
            end,
            topSpacer: start * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX,
            bottomSpacer: Math.max(0, (rowCount - end) * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX),
        };
    }

    private restoreTracksVirtualScroll(virtual: { start: number } | undefined): void {
        if (!virtual) return;
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        if (!scroller) return;
        const scrollTop = Math.max(0, this.tracksVirtualScrollTop);
        if (Math.abs(scroller.scrollTop - scrollTop) > 1) scroller.scrollTop = scrollTop;
    }

    private bindTracksScroller(): void {
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        if (!scroller || scroller.dataset.tracksVirtualBound === 'true') return;
        scroller.dataset.tracksVirtualBound = 'true';
        scroller.addEventListener('scroll', () => this.scheduleTracksVirtualRender(scroller), { passive: true });
    }

    private scheduleTracksVirtualRender(scroller: HTMLElement): void {
        if (scroller.dataset.virtualized !== 'true') return;
        this.tracksVirtualScrollTop = scroller.scrollTop;
        if (this.tracksVirtualRenderFrame) return;
        this.tracksVirtualRenderFrame = requestAnimationFrame(() => {
            this.tracksVirtualRenderFrame = undefined;
            if (this.destroyed || this.transcriptResizeActive || !this.isTranscriptPanelOpen() || this.panelMode !== 'tracks') return;
            const prev = this.renderedTracksVirtualWindow;
            if (!prev) return;
            // Track discovery can add rows while the user scrolls; if the count
            // moved, the cached window is stale — re-render against the live list.
            if (this.tracks.length !== prev.rowCount) {
                this.renderTrackPanel();
                return;
            }
            const next = this.tracksVirtualWindow(prev.rowCount);
            if (!next || (prev.start === next.start && prev.end === next.end)) return;
            this.renderTrackPanel();
        });
    }

    private trackTimingControlState(id: string): { offsetSeconds: number; canAdjust: boolean; canAlignPrevious: boolean; canAlignNext: boolean } | undefined {
        const role = this.trackSelectionRole(id);
        if (!role) return undefined;
        const baseCues = this.baseCuesForSelectedTrack(id, role);
        return {
            offsetSeconds: this.trackTimingOffsetSeconds(id),
            canAdjust: baseCues.length > 0,
            canAlignPrevious: Boolean(this.video && adjacentSubtitleCueForOffset(baseCues, this.video.currentTime, this.trackTimingOffsetSeconds(id), false)),
            canAlignNext: Boolean(this.video && adjacentSubtitleCueForOffset(baseCues, this.video.currentTime, this.trackTimingOffsetSeconds(id), true)),
        };
    }

    private isTrackSelectionCurrent(role: 'primary' | 'secondary', requestId: number, trackId: string): boolean {
        return !this.destroyed && this.trackSelections.isCurrent(role, requestId)
            && (role === 'primary' ? this.selectedTrackId : this.secondaryTrackId) === trackId;
    }

    private resetPrimarySubtitleState(): void {
        this.trackSelections.invalidate('primary');
        this.selectedTrackId = '';
        this.cues = [];
        this.currentCue = undefined;
        this.transcriptVirtualScrollTop = 0;
        this.clearTranscriptVirtualRender();
        this.lastDomCaption = '';
        this.lastDomCaptionSeenAt = 0;
        this.pendingDomCaption = undefined;
        this.youtubeDomCaptionFallbackTrackId = '';
        this.invalidatePrimaryCueRender();
        this.lastShadowSignature = '';
        this.shadowLoopEnabled = false;
    }

    private resetSecondarySubtitleState(): void {
        this.trackSelections.invalidate('secondary');
        this.secondaryTrackId = '';
        this.secondaryCues = [];
        this.secondaryCue = undefined;
        this.lastShadowSignature = '';
    }

    private async choosePrimaryTrack(id?: string): Promise<void> {
        if (!id) return;
        if (id === this.selectedTrackId) {
            this.clearPrimaryTrack();
            return;
        }
        this.youtubeAutoSelectSuppressedVideoId = '';
        await this.discoverYouTubeTracksThrottled(true);
        await this.selectTrack(id);
    }

    private async chooseSecondaryTrack(id?: string): Promise<void> {
        if (!id) return;
        if (id === this.secondaryTrackId) {
            this.clearSecondaryTrack();
            return;
        }
        await this.discoverYouTubeTracksThrottled(true);
        await this.selectSecondaryTrack(id);
    }

    private clearPrimaryTrack(): void {
        this.suppressYouTubeAutoSelectForCurrentVideo();
        this.resetPrimarySubtitleState();
        this.clearAsbPlayerReaderLines();
        this.clearPrimaryTrackLoadingStates();
        this.setNativeTrackModes();
        this.render();
        this.refreshOpenTranscriptPanelAfterPrimaryClear();
        this.syncControls();
    }

    private clearPrimaryTrackLoadingStates(): void {
        for (const track of this.tracks) {
            if (track.loadingState && track.id !== this.secondaryTrackId) track.loadingState = 'idle';
        }
    }

    private refreshOpenTranscriptPanelAfterPrimaryClear(): void {
        if (!this.isTranscriptPanelOpen()) return;
        this.panelMode = 'tracks';
        this.renderTrackPanel();
    }

    private suppressYouTubeAutoSelectForCurrentVideo(): void {
        if (!isYouTubePage()) return;
        this.youtubeAutoSelectSuppressedVideoId = this.youtubeVideoId || getYouTubeVideoId();
    }

    private clearSecondaryTrack(): void {
        this.resetSecondarySubtitleState();
        if (!this.selectedTrackId) this.clearAsbPlayerReaderLines();
        this.clearSecondaryTrackLoadingStates();
        this.setNativeTrackModes();
        this.render();
        this.refreshOpenTranscriptPanelAfterSecondaryClear();
        this.syncControls();
    }

    private clearSecondaryTrackLoadingStates(): void {
        for (const track of this.tracks) {
            if (track.loadingState && track.id !== this.selectedTrackId) track.loadingState = 'idle';
        }
    }

    private refreshOpenTranscriptPanelAfterSecondaryClear(): void {
        if (!this.isTranscriptPanelOpen()) return;
        if (this.panelMode === 'lines') this.renderTranscriptPanel(true);
        else if (this.panelMode === 'shadow') this.renderShadowPanel(true);
        else if (this.panelMode === 'mine') this.renderBatchMiningPanel();
        else this.renderTrackPanel();
    }

    private clearAsbPlayerReaderLines(): void {
        for (const root of document.querySelectorAll<HTMLElement>(ASBPLAYER_SUBTITLE_ROOT_SELECTOR)) {
            unwrapReaderWords(root);
        }
    }

    private positionTranscriptPanel(options: {
        realignAfterInset?: boolean;
        resizeEventMode?: SubtitleVideoInsetResizeEventMode;
        skipInset?: boolean;
        skipControlSync?: boolean;
        skipResizeHandle?: boolean;
    } = {}): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) {
            this.clearVideoInsetForTranscriptPanel();
            this.syncTranscriptPanelFullscreenDisplayOverride();
            return;
        }
        if (this.fullscreen) {
            this.positionFullscreenTranscriptPanel(options);
            return;
        }
        const panel = this.transcriptPanel;
        const viewport = this.transcriptViewportSize();
        const viewportWidth = viewport.width;
        const viewportHeight = viewport.height;
        const settings = this.options.getSettings();
        // During a resize drag (skipInset) reuse the already-latched reference
        // rect instead of re-running the
        // measureWithoutInset path every frame — that path toggles inset styles
        // and forces two synchronous layouts, the bulk of resize-drag jank.
        const reuseDragRect = options.skipInset && this.transcriptLayoutReferenceRect;
        const referenceVideoRect = reuseDragRect
            ? this.transcriptLayoutReferenceRect!
            : this.transcriptLayoutReferenceVideoRect(viewportWidth, viewportHeight);
        // During a drag the player isn't moving, so reuse the reference rect's
        // top instead of re-measuring the live player rect (youtubeVisiblePlayerRect
        // does 5 querySelectorAll + getBoundingClientRect) every frame — live
        // profiling showed getBoundingClientRect dominating resize-drag time.
        // Once the anchored video scrolls out of view, stop chasing its off-screen
        // top: a negative top (scrolled up) grows the side panel to full height and
        // a large top (scrolled below the fold) collapses it against the bottom, so
        // the panel height jumped around while scrolling past the video. Freeze it
        // at a stable on-screen anchor instead (the panel is position:fixed).
        const anchorTop = reuseDragRect
            ? referenceVideoRect.top
            : this.stableTranscriptAnchorTop(referenceVideoRect);
        const layout = this.transcriptDrawerLayout({
            viewportWidth,
            viewportHeight,
            anchorTop,
            compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
            preferredPlacement: settings.subtitleTranscriptPlacement,
            size: this.transcriptPanelSize,
        }, referenceVideoRect);
        this.commitTranscriptPanelLayout(panel, layout, options);
        const insetChanged = this.applyVideoInsetForTranscriptLayout(layout, referenceVideoRect, {
            resizeEventMode: options.resizeEventMode ?? (this.transcriptPreviewPlayerResizeDeferred || options.skipInset ? 'none' : 'immediate'),
        });
        if (!options.skipInset && options.realignAfterInset && insetChanged) this.scheduleTranscriptPanelRealignAfterInset();
    }

    private positionFullscreenTranscriptPanel(options: {
        skipControlSync?: boolean;
        skipResizeHandle?: boolean;
    } = {}): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        this.clearVideoInsetForTranscriptPanel();
        this.syncTranscriptPanelFullscreenDisplayOverride();
        const viewport = this.transcriptViewportSize();
        const viewportWidth = viewport.width;
        const viewportHeight = viewport.height;
        const layout = computeSubtitleDrawerLayout({
            viewportWidth,
            viewportHeight,
            anchorTop: Math.max(0, this.videoLayoutRect().top),
            compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
            preferredPlacement: this.options.getSettings().subtitleTranscriptPlacement,
            size: this.transcriptPanelSize,
        });
        this.commitTranscriptPanelLayout(panel, layout, options);
    }

    private commitTranscriptPanelLayout(
        panel: HTMLElement,
        layout: TranscriptPanelLayout,
        options: {
            skipControlSync?: boolean;
            skipResizeHandle?: boolean;
        } = {},
    ): void {
        const placementChanged = layout.placement !== this.effectiveTranscriptPlacement;
        applyTranscriptPanelLayout(panel, layout);
        this.effectiveTranscriptPlacement = layout.placement;
        if (placementChanged) this.syncTranscriptPlacementClass();
        if (!options.skipResizeHandle) this.syncTranscriptResizeHandle(layout);
        if (!options.skipControlSync) this.syncDrawerButtons(this.hasVisibleSubtitleLines());
    }

    private transcriptDrawerLayout(options: SubtitleDrawerLayoutOptions, referenceVideoRect: DOMRect): TranscriptPanelLayout {
        if (this.shouldUseStableYouTubeTranscriptLayout()) {
            return this.stableVideoTranscriptDrawerLayout(options, referenceVideoRect);
        }
        const layoutOptions = this.withConstrainedSideTranscriptSize(options, referenceVideoRect);
        const layout = computeSubtitleDrawerLayout(layoutOptions);
        const resolvedLayout = this.shouldUseBottomTranscriptLayout(layout, referenceVideoRect)
            ? computeSubtitleDrawerLayout({
                ...layoutOptions,
                compactPanel: true,
                preferredPlacement: 'bottom',
            })
            : layout;
        return resolvedLayout;
    }

    private shouldUseStableYouTubeTranscriptLayout(): boolean {
        if (!this.video) return false;
        if (!isYouTubePage()) return false;
        // Shorts (and other portrait players) must keep their native player
        // size: the stable layout sizes the player from the leftover viewport
        // width times the video aspect ratio, which for a portrait video blows
        // the player up far past the viewport and crops it. The plain inset
        // path already preserves native sizing for these players.
        return !isYouTubeShortsLikePlayer(this.video, this.videoLayoutRect());
    }

    private stableVideoTranscriptDrawerLayout(options: SubtitleDrawerLayoutOptions, videoRect: DOMRect): TranscriptPanelLayout {
        const placement = options.preferredPlacement === 'left' ? 'left' : options.preferredPlacement === 'bottom' ? 'bottom' : 'right';
        if (options.compactPanel || placement === 'bottom') {
            return computeSubtitleDrawerLayout({
                ...options,
                compactPanel: true,
                preferredPlacement: 'bottom',
            });
        }
        const sideLayout = this.stableSideTranscriptDrawerLayout(placement, options, videoRect);
        return sideLayout ?? computeSubtitleDrawerLayout({
            ...options,
            compactPanel: true,
            preferredPlacement: 'bottom',
        });
    }

    private stableSideTranscriptDrawerLayout(
        placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>,
        options: SubtitleDrawerLayoutOptions,
        videoRect: DOMRect,
    ): TranscriptPanelLayout | null {
        if (isYouTubePage()) return this.stableYouTubeSideTranscriptDrawerLayout(placement, options, videoRect);
        if (videoRect.width <= 0 || videoRect.height <= 0) return null;
        const margin = TRANSCRIPT_PANEL_MARGIN;
        const availableWidth = Math.floor(placement === 'left'
            ? videoRect.left - margin * 2
            : options.viewportWidth - videoRect.right - margin * 2);
        if (availableWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return null;
        const desiredWidth = options.size?.sideWidth ?? Math.min(460, options.viewportWidth * 0.32);
        const width = Math.round(Math.min(Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, desiredWidth), availableWidth));
        const top = Math.round(Math.min(
            Math.max(options.anchorTop ?? videoRect.top ?? 72, margin),
            Math.max(margin, options.viewportHeight - 280),
        ));
        return {
            placement,
            left: placement === 'left'
                ? Math.max(margin, Math.round(videoRect.left - margin - width))
                : Math.min(options.viewportWidth - margin - width, Math.max(margin, Math.round(videoRect.right + margin))),
            top,
            width,
            height: Math.max(260, options.viewportHeight - top - margin),
            viewportWidth: options.viewportWidth,
            viewportHeight: options.viewportHeight,
            margin,
            maxWidth: availableWidth,
        };
    }

    private stableYouTubeSideTranscriptDrawerLayout(
        placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>,
        options: SubtitleDrawerLayoutOptions,
        videoRect: DOMRect,
    ): TranscriptPanelLayout | null {
        if (videoRect.width <= 0 || videoRect.height <= 0) return null;
        const margin = TRANSCRIPT_PANEL_MARGIN;
        const maxWidth = this.maxSideTranscriptWidthForVideo(placement, options, videoRect);
        if (maxWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return null;
        const currentRightFreeWidth = Math.floor(options.viewportWidth - Math.round(videoRect.right + margin));
        const defaultWidth = placement === 'right'
            ? Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, Math.min(maxWidth, currentRightFreeWidth))
            : Math.min(460, maxWidth);
        const desiredWidth = options.size?.sideWidth ?? defaultWidth;
        const width = Math.round(Math.min(Math.max(TRANSCRIPT_PANEL_MIN_SIDE_WIDTH, desiredWidth), maxWidth));
        const top = Math.round(Math.min(
            Math.max(options.anchorTop ?? videoRect.top ?? 72, margin),
            Math.max(margin, options.viewportHeight - 280),
        ));
        return {
            placement,
            left: placement === 'left' ? 0 : Math.max(0, options.viewportWidth - width),
            top,
            width,
            height: Math.max(260, options.viewportHeight - top - margin),
            viewportWidth: options.viewportWidth,
            viewportHeight: options.viewportHeight,
            margin,
            maxWidth,
        };
    }

    private withConstrainedSideTranscriptSize(options: SubtitleDrawerLayoutOptions, referenceVideoRect: DOMRect): SubtitleDrawerLayoutOptions {
        if (options.compactPanel || options.preferredPlacement === 'bottom' || !this.video) return options;
        const placement = options.preferredPlacement === 'left' ? 'left' : 'right';
        const sideWidth = this.constrainedSideTranscriptWidth(placement, options, referenceVideoRect);
        if (sideWidth === undefined || sideWidth === options.size?.sideWidth) return options;
        return {
            ...options,
            size: {
                ...(options.size ?? {}),
                sideWidth,
            },
        };
    }

    private constrainedSideTranscriptWidth(
        placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>,
        options: SubtitleDrawerLayoutOptions,
        referenceVideoRect = this.transcriptLayoutReferenceVideoRect(options.viewportWidth, options.viewportHeight),
    ): number | undefined {
        const maxWidth = this.maxSideTranscriptWidthForVideo(placement, options, referenceVideoRect);
        if (maxWidth < TRANSCRIPT_PANEL_MIN_SIDE_WIDTH) return undefined;
        const currentWidth = options.size?.sideWidth ?? Math.min(460, options.viewportWidth * 0.32);
        return Math.round(Math.min(currentWidth, maxWidth));
    }

    private maxSideTranscriptWidthForVideo(
        _placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>,
        options: SubtitleDrawerLayoutOptions,
        videoRect: DOMRect,
    ): number {
        if (videoRect.width <= 0) return 0;
        const margin = options.compactPanel ? 0 : TRANSCRIPT_PANEL_MARGIN;
        const minimumPlayerWidth = minimumSideTranscriptPlayerWidth(videoRect.width);
        // Both placements share the same span (videoRect.left → viewport edge):
        // when docking left the player shifts right, so the available panel width
        // is symmetric. Using videoRect.right for left wrongly assumed the player
        // stayed put, which forced the bottom fallback on smaller screens.
        return Math.floor(options.viewportWidth - videoRect.left - margin * 2 - minimumPlayerWidth);
    }

    private clampStoredSideWidthForCurrentVideo(placement: Exclude<ReaderSettings['subtitleTranscriptPlacement'], 'bottom'>): void {
        const viewport = this.transcriptViewportSize();
        const viewportWidth = viewport.width;
        const constrained = this.constrainedSideTranscriptWidth(placement, {
            viewportWidth,
            viewportHeight: viewport.height,
            anchorTop: this.transcriptAnchorRect().top,
            compactPanel: shouldUseCompactSubtitleDrawer(viewportWidth),
            preferredPlacement: placement,
            size: this.transcriptPanelSize,
        });
        if (constrained !== undefined) this.transcriptPanelSize.sideWidth = constrained;
    }

    private transcriptViewportSize(): { width: number; height: number } {
        const { width, height } = subtitleVisibleViewportSize();
        return {
            width: Math.max(320, width),
            height: Math.max(240, height),
        };
    }

    private transcriptViewportWidth(): number {
        return this.transcriptViewportSize().width;
    }

    private transcriptViewportHeight(): number {
        return this.transcriptViewportSize().height;
    }

    private shouldUseBottomTranscriptLayout(layout: TranscriptPanelLayout, videoRect = this.videoLayoutRect()): boolean {
        if (!isYouTubePage()) return false;
        if (layout.placement === 'bottom' || !this.video) return false;
        if (shouldHonorExplicitYouTubeSideLayout(layout)) return false;
        if (isYouTubeTheaterMode()) return true;
        if (videoRect.width <= 0) return false;
        const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
        return shouldUseBottomTranscriptLayoutForAvailableWidth(videoRect.width, availableWidth);
    }

    private scheduleTranscriptPanelRealignAfterInset(): void {
        if (this.transcriptInsetRealignFrame !== undefined) return;
        this.transcriptInsetRealignFrame = requestAnimationFrame(() => this.realignTranscriptPanelAfterInset());
    }

    private realignTranscriptPanelAfterInset(): void {
        this.transcriptInsetRealignFrame = undefined;
        if (!this.shouldRealignTranscriptPanelAfterInset()) return;
        this.alignToVideo();
    }

    private shouldRealignTranscriptPanelAfterInset(): boolean {
        return Boolean(!this.destroyed && this.transcriptPanel && !this.transcriptPanel.hidden && !this.transcriptPanelClosing);
    }

    private handleTranscriptViewportChange(options: { stabilize?: boolean } = {}): void {
        this.syncFullscreenState();
        this.resetTranscriptLayoutReference();
        this.alignToVideo();
        this.scheduleAlignToVideo();
        this.scheduleTranscriptHydration();
        this.scheduleTranscriptCacheWarmup();
        if (options.stabilize) this.scheduleTranscriptViewportStabilizeAlign();
    }

    private scheduleTranscriptViewportStabilizeAlign(): void {
        this.transcriptViewportStabilizeTimer = clearWindowTimeout(this.transcriptViewportStabilizeTimer);
        this.transcriptViewportStabilizeTimer = window.setTimeout(() => {
            this.transcriptViewportStabilizeTimer = undefined;
            if (this.destroyed) return;
            this.resetTranscriptLayoutReference();
            this.scheduleAlignToVideo();
            this.scheduleTranscriptHydration();
            this.scheduleTranscriptCacheWarmup();
        }, 120);
    }

    private resetTranscriptLayoutReference(): void {
        this.transcriptLayoutReferenceRect = undefined;
        this.transcriptLayoutReferenceViewport = '';
    }

    private transcriptLayoutReferenceVideoRect(viewportWidth: number, viewportHeight: number): DOMRect {
        const current = this.measureWithoutStableYouTubeTranscriptLayout(() => this.videoInset.measureWithoutInset(this.video, () => this.videoLayoutRect()));
        const viewportKey = `${viewportWidth}x${viewportHeight}`;
        // A degenerate rect (player mid-resize, e.g. exiting fullscreen) would
        // otherwise latch in as the reference and shrink the video to nothing.
        const degenerate = current.width < 200 || current.height < 120;
        if (degenerate) return this.transcriptLayoutReferenceRect ?? current;
        if (!this.transcriptLayoutReferenceRect
            || this.transcriptLayoutReferenceViewport !== viewportKey
            || current.width > this.transcriptLayoutReferenceRect.width + 20
            || current.height > this.transcriptLayoutReferenceRect.height + 20) {
            this.transcriptLayoutReferenceRect = current;
            this.transcriptLayoutReferenceViewport = viewportKey;
        }
        return this.transcriptLayoutReferenceRect;
    }

    private applyVideoInsetForTranscriptLayout(
        layout: TranscriptPanelLayout,
        videoRect = this.videoLayoutRect(),
        options: { resizeEventMode?: SubtitleVideoInsetResizeEventMode } = {},
    ): boolean {
        if (!this.video) {
            this.clearVideoInsetForTranscriptPanel();
            return false;
        }
        if (layout.placement === 'bottom') {
            this.clearVideoInsetForTranscriptPanel();
            return false;
        }
        if (this.shouldUseStableYouTubeTranscriptLayout()) {
            const insetChanged = this.videoInset.clear(this.video);
            const stableChanged = this.applyStableYouTubeTranscriptLayout(layout, videoRect, options.resizeEventMode);
            return insetChanged || stableChanged;
        }
        this.clearStableYouTubeTranscriptLayout();
        const availableWidth = this.availablePlayerWidthForSideLayout(layout, videoRect);
        return this.applyPageVideoInset(layout.placement, Math.max(0, availableWidth), layout.width, videoRect, options);
    }

    private availablePlayerWidthForSideLayout(layout: TranscriptPanelLayout, videoRect: DOMRect): number {
        // For left docking the player shifts right toward the viewport edge, so
        // measure the room from the panel's right edge to the viewport. Live
        // YouTube can report an oversized pre-inset player rect during iPad
        // layout/bootstrap, so using videoRect.right here can make the shifted
        // player spill far past the visible viewport.
        // The extra margin matches the doubled left-side inset gap applied by
        // the video inset adapter so the shifted player still fits on screen.
        const viewportWidth = this.transcriptViewportWidth();
        return layout.placement === 'left'
            ? viewportWidth - (layout.left + layout.width + layout.margin * 2)
            : layout.left - videoRect.left - layout.margin;
    }

    private syncFullscreenState(): void {
        // Every caller of this is a discrete fullscreen-relevant signal
        // (observer batch, fullscreenchange, refresh, viewport change) — never
        // the per-sample geometry path — so a fresh host query here is cheap
        // and keeps direct syncFullscreenState() calls authoritative.
        this.fullscreenHost.invalidateHostCache();
        // The same discrete signals are the only ones that can reposition the
        // player's ancestor chain, which is what the pin verdict reads.
        this.pinnedPlayer.invalidatePinning();
        // Resize, orientationchange, and fullscreen transitions all route through
        // here; reproject the remembered drag nudge so it tracks the new viewport
        // height instead of staying frozen at its previous pixel value.
        this.restoreSubtitleDragOffset();
        const fullscreenElement = currentFullscreenElement();
        const fullscreenHost = this.fullscreenHost.subtitleFullscreenHost(fullscreenElement);
        this.fullscreen = Boolean(fullscreenElement || fullscreenHost || videoIsInNativeFullscreen(this.video));
        this.fullscreenHost.syncSubtitleRootParent(fullscreenElement);
        document.documentElement.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        this.root?.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        this.transcriptPanel?.classList.toggle('jpdb-subtitle-fullscreen', this.fullscreen);
        this.syncTranscriptPanelFullscreenDisplayOverride();
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return;
        }
        this.transcriptLayoutReferenceRect = undefined;
        this.transcriptLayoutReferenceViewport = '';
    }

    private syncTranscriptPanelFullscreenDisplayOverride(): void {
        const panel = this.transcriptPanel;
        if (!panel) return;
        const shouldOverride = this.fullscreen && !panel.hidden && !this.transcriptPanelClosing;
        if (shouldOverride) {
            panel.style.setProperty('display', 'grid', 'important');
            panel.dataset.jpdbFullscreenDisplayOverride = 'true';
            return;
        }
        if (panel.dataset.jpdbFullscreenDisplayOverride === 'true') {
            panel.style.removeProperty('display');
            delete panel.dataset.jpdbFullscreenDisplayOverride;
        }
    }

    private scheduleAlignToVideo(): void {
        if (this.transcriptResizeActive) {
            this.alignAfterTranscriptResize = true;
            return;
        }
        if (this.alignFrame) cancelAnimationFrame(this.alignFrame);
        this.alignFrame = requestAnimationFrame(() => {
            this.alignFrame = undefined;
            if (this.destroyed) return;
            this.alignToVideo();
        });
    }

    private videoLayoutRect(): DOMRect {
        const fullscreenHost = this.fullscreenHost.subtitleFullscreenHost();
        if (fullscreenHost) {
            // YouTube's desktop fullscreen promotes <html> (the document root) to
            // the top layer, where its layout box collapses to a zero-size rect.
            // Measuring it would make the visibility check read the video as
            // off-screen and hide the overlay, so fall back to the viewport when
            // the host is the document root or otherwise reports a degenerate box.
            if (fullscreenHost === document.documentElement) return subtitleViewportRect();
            const rect = fullscreenHost.getBoundingClientRect();
            return rect.width >= 1 && rect.height >= 1 ? rect : subtitleViewportRect();
        }
        if (videoIsInNativeFullscreen(this.video)) return subtitleViewportRect();
        return subtitleVideoLayoutRect(this.video);
    }

    private transcriptAnchorRect(): DOMRect {
        if (isYouTubePage()) return this.videoLayoutRect();
        if (!this.video) return this.videoLayoutRect();
        return transcriptAvoidanceTarget(this.video).getBoundingClientRect();
    }

    private stableTranscriptAnchorTop(referenceVideoRect: DOMRect): number {
        // The side panel normally hangs from the video's top. Once the video scrolls
        // out of view, that top is off-screen (negative when scrolled up, huge when
        // below the fold) and the clamp in the layout math then swings the panel's
        // height from full-height to a bottom-pinned sliver. Return a stable on-screen
        // anchor while the video is not overlay-visible so the panel keeps a steady
        // height as you scroll past it (it stays position:fixed on screen regardless).
        const liveTop = this.transcriptAnchorRect().top;
        if (this.isTranscriptAnchorVideoVisible(referenceVideoRect)) return liveTop;
        return TRANSCRIPT_PANEL_MARGIN;
    }

    private isTranscriptAnchorVideoVisible(referenceVideoRect: DOMRect): boolean {
        if (this.fullscreen) return true;
        if (this.root && !this.root.classList.contains('jpdb-subtitle-video-out-of-view')) return true;
        // Fall back to measuring the reference rect directly when the out-of-view
        // class has not been reconciled yet (position can run before alignToVideo).
        return this.isVideoOverlayVisible(referenceVideoRect);
    }

    private clearVideoInsetForTranscriptPanel(): boolean {
        this.transcriptLayoutReferenceRect = undefined;
        this.transcriptLayoutReferenceViewport = '';
        const stableChanged = this.clearStableYouTubeTranscriptLayout();
        const insetChanged = this.videoInset.clear(this.video);
        return stableChanged || insetChanged;
    }

    private applyStableYouTubeTranscriptLayout(
        layout: TranscriptPanelLayout,
        videoRect: DOMRect,
        resizeEventMode: SubtitleVideoInsetResizeEventMode = 'immediate',
    ): boolean {
        if (!isYouTubePage() || layout.placement === 'bottom') return this.clearStableYouTubeTranscriptLayout();
        const root = document.documentElement;
        if (!root) return false;
        let changed = false;
        const setClass = (className: typeof YOUTUBE_STABLE_TRANSCRIPT_CLASSES[number], enabled: boolean): void => {
            const hadClass = root.classList.contains(className);
            root.classList.toggle(className, enabled);
            changed = changed || hadClass !== enabled;
        };
        setClass('jpdb-subtitle-youtube-stable-side', true);
        setClass('jpdb-subtitle-youtube-stable-left', layout.placement === 'left');
        setClass('jpdb-subtitle-youtube-stable-right', layout.placement === 'right');
        const playerOffsetTarget = this.stableYouTubePlayerOffsetTarget();
        setClass('jpdb-subtitle-youtube-stable-player-fallback', layout.placement === 'left' && playerOffsetTarget === 'player');
        setClass('jpdb-subtitle-youtube-stable-full-bleed', layout.placement === 'left' && playerOffsetTarget === 'full-bleed');
        const offsetPx = layout.placement === 'left'
            ? Math.max(0, Math.round(layout.left + layout.width + layout.margin))
            : 0;
        const playerSize = this.stableYouTubePlayerSizeForLayout(layout, videoRect);
        const playerWidth = `${playerSize.width}px`;
        const playerHeight = `${playerSize.height}px`;
        const offset = `${offsetPx}px`;
        changed = setDocumentStylePropertyIfChanged(root, '--jpdb-subtitle-youtube-stable-offset', offset) || changed;
        changed = setDocumentStylePropertyIfChanged(root, '--jpdb-subtitle-youtube-stable-player-width', playerWidth) || changed;
        changed = setDocumentStylePropertyIfChanged(root, '--jpdb-subtitle-youtube-stable-player-height', playerHeight) || changed;
        const mediaChanged = applyStableYouTubePlayerVideoSize(this.video, playerSize.width, playerSize.height);
        if (changed && resizeEventMode !== 'none') {
            resizeYouTubePlayerForSubtitleLayout(
                playerSize.width,
                playerSize.height,
                resizeEventMode,
            );
        }
        return changed || mediaChanged;
    }

    private stableYouTubePlayerOffsetTarget(): 'player' | 'full-bleed' | null {
        if (!isYouTubePage()) return null;
        const fullBleed = document.querySelector<HTMLElement>('ytd-watch-flexy[is-single-column] #full-bleed-container #player-container');
        if (fullBleed) {
            const position = getComputedStyle(fullBleed).position;
            if (position === 'absolute' || position === 'fixed') return 'full-bleed';
        }
        const primary = document.querySelector<HTMLElement>('ytd-watch-flexy #primary');
        const player = document.querySelector<HTMLElement>('#movie_player, .html5-video-player');
        return !primary && player ? 'player' : null;
    }

    private stableYouTubePlayerSizeForLayout(layout: TranscriptPanelLayout, videoRect: DOMRect): { width: number; height: number } {
        const width = Math.max(0, Math.round(this.availablePlayerWidthForSideLayout(layout, videoRect)));
        return {
            width,
            height: this.stableYouTubePlayerHeightForWidth(width, videoRect),
        };
    }

    private stableYouTubePlayerHeightForWidth(width: number, videoRect: DOMRect): number {
        const aspectRatio = videoRect.width > 0 && videoRect.height > 0
            ? videoRect.height / videoRect.width
            : 9 / 16;
        return Math.max(180, Math.round(width * aspectRatio));
    }

    private clearStableYouTubeTranscriptLayout(): boolean {
        const root = document.documentElement;
        if (!root) return false;
        let changed = false;
        for (const className of YOUTUBE_STABLE_TRANSCRIPT_CLASSES) {
            if (!root.classList.contains(className)) continue;
            root.classList.remove(className);
            changed = true;
        }
        for (const property of YOUTUBE_STABLE_TRANSCRIPT_STYLE_PROPERTIES) {
            if (!root.style.getPropertyValue(property)) continue;
            root.style.removeProperty(property);
            changed = true;
        }
        return clearStableYouTubePlayerVideoSize() || changed;
    }

    private measureWithoutStableYouTubeTranscriptLayout<T>(callback: () => T): T {
        const root = document.documentElement;
        if (!root) return callback();
        const classSnapshot = YOUTUBE_STABLE_TRANSCRIPT_CLASSES.map(className => [className, root.classList.contains(className)] as const);
        const styleSnapshot = YOUTUBE_STABLE_TRANSCRIPT_STYLE_PROPERTIES.map(property => [property, root.style.getPropertyValue(property)] as const);
        this.clearStableYouTubeTranscriptLayout();
        try {
            return callback();
        } finally {
            for (const [className, enabled] of classSnapshot) root.classList.toggle(className, enabled);
            for (const [property, value] of styleSnapshot) {
                if (value) root.style.setProperty(property, value);
                else root.style.removeProperty(property);
            }
            this.restoreStableYouTubePlayerVideoSizeFromRoot(root);
        }
    }

    private restoreStableYouTubePlayerVideoSizeFromRoot(root: HTMLElement): void {
        if (!root.classList.contains('jpdb-subtitle-youtube-stable-side')) return;
        const width = Number.parseFloat(root.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-width'));
        const height = Number.parseFloat(root.style.getPropertyValue('--jpdb-subtitle-youtube-stable-player-height'));
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            applyStableYouTubePlayerVideoSize(this.video, width, height);
        }
    }

    private applyPageVideoInset(
        side: SubtitleVideoInsetSide,
        playerSize: number,
        panelSize?: number,
        videoRect = this.videoLayoutRect(),
        options: { resizeEventMode?: SubtitleVideoInsetResizeEventMode } = {},
    ): boolean {
        if (this.fullscreen) {
            this.clearVideoInsetForTranscriptPanel();
            return false;
        }
        const panelRect = panelSize === undefined ? this.transcriptPanel?.getBoundingClientRect() : undefined;
        return this.videoInset.apply({
            video: this.video,
            side,
            playerSize,
            panelSize: panelSize ?? ((side === 'bottom' ? panelRect?.height : panelRect?.width) ?? 0),
            videoRect,
            margin: TRANSCRIPT_PANEL_MARGIN,
            resizeEventMode: options.resizeEventMode,
        });
    }
}
