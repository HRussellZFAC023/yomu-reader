import { escapeHtml, readerWordSurfaceText, renderTokensToHtml, setInnerHtml, unwrapReaderWords } from '../dom/index';
import {
    compactTextLength,
    cueHasExactWordTimings,
    escapeWithBreaks,
    findActiveSubtitleCue,
    findInitialLeadInCue,
    findAlignedCue,
    formatSubtitleTime,
    karaokeCharacterProgress,
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
    saveSubtitleDragOffsetFraction,
    saveTranscriptPanelSize,
    shouldUseCompactSubtitleDrawer,
    type SubtitleDrawerLayoutOptions,
    type TranscriptPanelLayout,
} from './subtitle-layout';
import {
    collectPageSubtitleSources,
    normalizedSubtitleUrl,
    sameSubtitleUrl,
    type PageSubtitleSource,
} from './subtitle-sources';
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
    discoverYouTubeCaptionTracks,
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
import {
    compareSubtitleTrackOptions,
    isEnglishSubtitleTrack,
    isJapaneseSubtitleTrack,
    shouldReplaceWaitingNativeTrack,
} from './subtitle-track-metadata';
import { renderSubtitleTrackPanel, subtitleDrawerMetaText } from './subtitle-track-panel';
import {
    hasSelectedSubtitleTrackOrLines,
    subtitleDrawerButtonState,
    subtitleTrackPanelState,
    syncSubtitleDrawerButton,
    syncSubtitleLineNavigationButton,
    syncSubtitlePlaybackButton,
    syncSubtitleTrackStatus,
    syncTranscriptPlacementButtons,
} from './subtitle-panel-actions';
import { applySubtitleNativeTrackModes } from './subtitle-native-track-modes';
import {
    canUseDomCaptionFallback as canUseSubtitleDomCaptionFallback,
    mutationCouldAffectVideoDiscovery,
    mutationInsideReaderRoot,
    shouldHideSubtitleRoot,
    shouldKeepIdleControlClass,
    subtitleSourceContextKey,
    videoSummary,
} from './subtitle-player-context';
import {
    SUBTITLE_SECONDARY_BLURRED_CLASS,
    SUBTITLE_SECONDARY_CLEAR_CLASS,
    renderSubtitleKaraokeCue,
    renderSubtitlePrimary,
    renderSubtitleSecondary,
    syncSubtitleSecondaryBlurState,
} from './subtitle-rendering';
import {
    compareNativeOverlaySubtitleTrackOptions,
    isStalePageSubtitleTrack,
    loadedTrackState,
    updatePageSubtitleTrack,
    type LoadedSubtitleTrackSelection,
    type SubtitleTrackOption,
    type SubtitleTrackSelectionLoadRequest,
    type SubtitleTrackSelectionRole,
} from './subtitle-track-options';
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
    SUBTITLE_EMPTY_PARSE_RETRY_MS,
    subtitleParseOptions,
    subtitleParseSourceSignature,
    waitForBackgroundTranscriptParseTurn,
    type SubtitleParseOptions,
} from './subtitle-parse-policy';
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
    SUBTITLE_STYLE_FONT_FAMILY_VALUES,
    type SubtitleIconName,
    type SubtitlePanelMode,
} from './subtitle-surface';
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
import { resolveUiLanguage, uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import { accentToRgba, DEFAULT_SETTINGS, matchesShortcut } from '../settings/index';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { primaryCardState } from '../cards/state';

// UT-48: parsed cue html survives reloads via sessionStorage (same-tab,
// same video session). Keys are hashed — raw parse keys embed whole cue
// texts and would blow past storage key-size sanity.
const SUBTITLE_SESSION_PARSE_CACHE_PREFIX = 'yomu:subtitle-parse:v3:';
const SUBTITLE_SESSION_PARSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function subtitleSessionParseHash(key: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x1505;
    for (let i = 0; i < key.length; i += 1) {
        const code = key.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
        h2 = (Math.imul(h2, 33) ^ code) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`;
}
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
const YOUTUBE_FULLSCREEN_HOST_SELECTOR = [
    '[data-yomu-inline-fullscreen="true"]',
    '.html5-video-player.ytp-fullscreen',
    '.html5-video-player.fullscreen',
    '#movie_player.ytp-fullscreen',
    '#movie_player.fullscreen',
    'ytd-watch-flexy[fullscreen] #movie_player',
    'ytd-watch-flexy[fullscreen] ytd-player',
    'ytm-player[fullscreen]',
    'ytm-player.fullscreen',
    'ytm-player.ytp-fullscreen',
].join(',');
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
const INLINE_FULLSCREEN_CLASS = 'jpdb-subtitle-inline-fullscreen';
const INLINE_FULLSCREEN_ATTRIBUTE = 'data-yomu-inline-fullscreen';

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
    onSettingsChange: () => void;
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

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitCancelFullScreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
};

type FullscreenVideoElement = HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean;
    webkitPresentationMode?: string;
    webkitEnterFullscreen?: () => void;
    webkitEnterFullScreen?: () => void;
};

type FullscreenTargetElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitRequestFullScreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
};

function currentFullscreenElement(): Element | null {
    const fullscreenDocument = document as FullscreenDocument;
    return document.fullscreenElement
        ?? fullscreenDocument.webkitFullscreenElement
        ?? fullscreenDocument.mozFullScreenElement
        ?? fullscreenDocument.msFullscreenElement
        ?? null;
}

function exitCurrentFullscreen(): Promise<void> | void {
    const fullscreenDocument = document as FullscreenDocument;
    return document.exitFullscreen?.()
        ?? fullscreenDocument.webkitExitFullscreen?.()
        ?? fullscreenDocument.webkitCancelFullScreen?.()
        ?? fullscreenDocument.mozCancelFullScreen?.()
        ?? fullscreenDocument.msExitFullscreen?.();
}

function requestElementFullscreen(element: HTMLElement): Promise<void> | void {
    const target = element as FullscreenTargetElement;
    return target.requestFullscreen?.()
        ?? target.webkitRequestFullscreen?.()
        ?? target.webkitRequestFullScreen?.()
        ?? target.mozRequestFullScreen?.()
        ?? target.msRequestFullscreen?.();
}

function canRequestElementFullscreen(element: HTMLElement): boolean {
    const target = element as FullscreenTargetElement;
    return Boolean(target.requestFullscreen
        || target.webkitRequestFullscreen
        || target.webkitRequestFullScreen
        || target.mozRequestFullScreen
        || target.msRequestFullscreen);
}

function enterInlineFullscreen(target: HTMLElement): void {
    const current = activeInlineFullscreenElement();
    if (current && current !== target) clearInlineFullscreenElement(current);
    target.setAttribute(INLINE_FULLSCREEN_ATTRIBUTE, 'true');
    if (!target.hasAttribute('fullscreen')) {
        target.setAttribute('fullscreen', '');
        target.dataset.yomuInlineFullscreenAttr = 'true';
    }
    if (!target.classList.contains('ytp-fullscreen')) {
        target.classList.add('ytp-fullscreen');
        target.dataset.yomuInlineYtpFullscreenClass = 'true';
    }
    if (!target.classList.contains('fullscreen')) {
        target.classList.add('fullscreen');
        target.dataset.yomuInlineFullscreenClass = 'true';
    }
    document.documentElement.classList.add(INLINE_FULLSCREEN_CLASS);
    dispatchFullscreenLikeEvents();
}

function exitInlineFullscreen(): void {
    const current = activeInlineFullscreenElement();
    if (!current) return;
    clearInlineFullscreenElement(current);
    document.documentElement.classList.remove(INLINE_FULLSCREEN_CLASS);
    dispatchFullscreenLikeEvents();
}

function activeInlineFullscreenElement(): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[${INLINE_FULLSCREEN_ATTRIBUTE}="true"]`);
}

function clearInlineFullscreenElement(element: HTMLElement): void {
    element.removeAttribute(INLINE_FULLSCREEN_ATTRIBUTE);
    if (element.dataset.yomuInlineFullscreenAttr === 'true') element.removeAttribute('fullscreen');
    if (element.dataset.yomuInlineYtpFullscreenClass === 'true') element.classList.remove('ytp-fullscreen');
    if (element.dataset.yomuInlineFullscreenClass === 'true') element.classList.remove('fullscreen');
    delete element.dataset.yomuInlineFullscreenAttr;
    delete element.dataset.yomuInlineYtpFullscreenClass;
    delete element.dataset.yomuInlineFullscreenClass;
}

function dispatchFullscreenLikeEvents(): void {
    for (const eventName of ['fullscreenchange', 'webkitfullscreenchange']) document.dispatchEvent(new Event(eventName));
    window.dispatchEvent(new Event('resize'));
}

function subtitleViewportRect(): DOMRect {
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function videoIsInNativeFullscreen(video: HTMLVideoElement | undefined): boolean {
    if (!video) return false;
    const fullscreenVideo = video as FullscreenVideoElement;
    return Boolean(fullscreenVideo.webkitDisplayingFullscreen
        || (fullscreenVideo.webkitPresentationMode && fullscreenVideo.webkitPresentationMode !== 'inline'));
}

function elementContainsVideo(element: HTMLElement | null | undefined, video: HTMLVideoElement | undefined): element is HTMLElement {
    return Boolean(element && video && (element === video || element.contains(video)));
}

function youtubeFullscreenHostForVideo(video: HTMLVideoElement | undefined): HTMLElement | null {
    if (!isYouTubePage()) return null;
    const scopedHost = video?.closest<HTMLElement>(YOUTUBE_FULLSCREEN_HOST_SELECTOR);
    if (scopedHost) return scopedHost;

    return Array.from(document.querySelectorAll<HTMLElement>(YOUTUBE_FULLSCREEN_HOST_SELECTOR))
        .find(element => elementContainsVideo(element, video)
            || isYouTubeMobileFullscreenHost(element)
            || isVisibleYouTubeFullscreenHost(element)) ?? null;
}

function isYouTubeMobileFullscreenHost(element: HTMLElement | null | undefined): element is HTMLElement {
    return Boolean(element
        && /^m\.youtube\.com$/i.test(location.hostname)
        && element.matches('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen'));
}

function isVisibleYouTubeFullscreenHost(element: HTMLElement | null | undefined): element is HTMLElement {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    return rect.width >= viewportWidth / 2
        && rect.height >= viewportHeight / 2
        && rect.left <= viewportWidth / 4
        && rect.top <= viewportHeight / 4
        && Boolean(element.querySelector('video'));
}

function subtitleMinimumFontSize(root: HTMLElement): number {
    const rootRect = root.getBoundingClientRect();
    // Narrow/portrait frames (phones, Shorts) keep a higher absolute floor so a
    // long line never shrinks into illegibly small text against the chrome;
    // desktop stays at 14.
    return rootRect.width < 700 || rootRect.height < 360 ? 16 : 14;
}

function subtitleFrameTargetFontSize(root: HTMLElement, settings: ReaderSettings): number {
    const rootRect = root.getBoundingClientRect();
    const width = Math.max(1, rootRect.width);
    const height = Math.max(1, rootRect.height);
    const baseline = Math.max(16, Math.min(64, settings.subtitleFontSize));
    // Desktop landscape references 1280x720. A portrait/Shorts frame has ample
    // vertical room, so scale off width against a 720 reference instead of being
    // penalized by the tall-but-narrow box (which previously slammed the scale
    // into the 0.62 floor and rendered ~17px on a phone). Narrow or portrait
    // frames also get a higher scale floor so the default stays readable; the
    // user's explicit setting still wins upward via the baseline.
    const portrait = height > width;
    const frameScale = portrait
        ? Math.sqrt(width / 720)
        : Math.sqrt(Math.min(width / 1280, height / 720));
    const minScale = portrait || width < 700 ? 0.82 : 0.74;
    const scaled = Math.round(baseline * Math.max(minScale, Math.min(1, frameScale)));
    return Math.max(subtitleMinimumFontSize(root), Math.min(baseline, scaled));
}

const DEFAULT_SUBTITLE_BOTTOM_OFFSET = DEFAULT_SETTINGS.subtitleBottomOffset;
function effectiveSubtitleBottomPercent(settings: ReaderSettings): number {
    return settings.subtitleBottomOffset;
}

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

function subtitleElementOverflows(element: HTMLElement): boolean {
    return element.scrollHeight > element.clientHeight + 1
        || element.scrollWidth > element.clientWidth + 1;
}

function subtitleSecondaryFontSize(target: number): number {
    return Math.max(13, Math.min(22, Math.round(target * 0.62)));
}

function nextSubtitleFontSize(element: HTMLElement, fitted: number, minimum: number): number {
    const heightScale = element.clientHeight / Math.max(1, element.scrollHeight);
    const widthScale = element.clientWidth / Math.max(1, element.scrollWidth);
    return Math.max(minimum, Math.floor(fitted * Math.min(.92, heightScale, widthScale)));
}

function applyKaraokeClassToWordElement(element: HTMLElement, cursor: number, progress: number): number {
    element.classList.remove('jpdb-subtitle-word-pending', 'jpdb-subtitle-word-spoken', 'jpdb-subtitle-word-current');
    const surface = readerWordSurfaceText(element).replace(/\s+/g, '');
    if (!surface) return cursor;
    const start = cursor;
    const end = cursor + compactTextLength(surface);
    element.classList.add(karaokeWordClass(progress, start, end));
    return end;
}

function karaokeWordClass(progress: number, start: number, end: number): string {
    if (progress >= end) return 'jpdb-subtitle-word-spoken';
    return progress > start ? 'jpdb-subtitle-word-current' : 'jpdb-subtitle-word-pending';
}

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Position + size signature of the video's on-screen box, rounded so sub-pixel
// jitter does not churn alignment. Used to detect when the active video has
// moved (e.g. a Shorts reel swipe) without a resize/scroll/navigation event.
function videoRectKey(rect: DOMRect): string {
    return `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}`;
}

function subtitleAnimeSearchQuery(video?: HTMLVideoElement): string {
    const raw = video?.dataset.yomuAnimeSearch
        || video?.dataset.yomuVideoTitle
        || video?.title
        || document.title
        || '';
    return raw
        .replace(/\.(?:mkv|mp4|m4v|mov|webm|ogv)$/iu, '')
        .replace(/[-|]\s*(?:YouTube|Yomu Video|よむ 動画)\s*$/iu, '')
        .replace(/\[[^\]]*\]/gu, ' ')
        .replace(/[._]+/gu, ' ')
        .replace(/^\s*(?:watch|stream)\s+/iu, '')
        .replace(/\s+(?:episode|ep\.?)\s*\d+(?:\.\d+)?\b.*$/iu, '')
        .replace(/\s*[-|·]\s*(?:watch|stream|free|anime|online|subbed|dubbed|hd)\b.*$/iu, '')
        .replace(/\b(?:english|eng)\s+(?:subbed|sub|dubbed|dub)\b/giu, ' ')
        .replace(/\b(?:subbed|dubbed)\b/giu, ' ')
        .replace(/\s+\b(?:online|free|hd)\b\s*$/iu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 120);
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
const SUBTITLE_PARSE_CACHE_MIN_ENTRIES = 180;
const SUBTITLE_PARSE_CACHE_MAX_ENTRIES = 5000;
const SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM = 64;
const TRANSCRIPT_BACKGROUND_PARSE_LIMIT = SUBTITLE_PARSE_CACHE_MAX_ENTRIES;
const TRANSCRIPT_WARMUP_SIGNATURE_BUCKET_SIZE = 8;
const YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS = 120;
// Mirror the furigana gate in dom/index.ts (sourceTokenRubies): a kanji surface
// with a usable kana reading is the only thing that renders ruby. Kept local
// because those regexes are module-private in the dom module.
const SUBTITLE_FURIGANA_KANJI_RE = /[㐀-鿿]/u;
const SUBTITLE_FURIGANA_KANA_RE = /^[぀-ヿー・]+$/u;
// A cue whose furigana is still incomplete stays re-hydratable so a later pass
// (orientation/resize/scroll, or once the public-lookup term window finds the
// reading) can retry. Subtitle lookups are urgent and bypass the unresolved
// negative cache, so cap retries: a word genuinely absent from public Jiten
// must settle to bare rather than re-request on every hydration tick. The cap
// is generous enough to outlast the open/drag/scroll/orientation sequence.
const SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT = 6;
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
const SUBTITLE_FRAME_GEOMETRY_SYNC_MS = 120;
const TRANSCRIPT_DEFERRED_RENDER_DELAY_MS = 500;
const SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS = 1000;
// Window after a programmatic scroll during which scroll events are treated as
// self-induced (scrollIntoView fires async), not as a user scroll.
const TRANSCRIPT_PROGRAMMATIC_SCROLL_WINDOW_MS = 350;
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
    playVideo?: () => void;
}
const TRACK_LOAD_OPTIONS: Omit<SubtitleTrackLoadOptions<SubtitleTrackOption>, 'tracks' | 'transcriptEligible'> = {
    requestText: defaultRequestSubtitleText,
    onYouTubeRequestError: (track, url, error) => log.debug('YouTube subtitle request failed', {
        label: track.label,
        ...subtitleRequestFailureDetails(url),
        error,
    }),
};

function normalizedSubtitleText(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

interface TranscriptRow {
    cue: SubtitleCue;
    cueIndex: number;
}

interface HostedSubtitleFileJob {
    kind: 'primary' | 'secondary';
    file: File;
}

interface HostedSubtitleFileLoadRequest {
    jobs: HostedSubtitleFileJob[];
    openPanel?: 'auto' | 'lines' | 'tracks' | false;
}

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

interface TranscriptPanelRenderState {
    rows: TranscriptRow[];
    warmupRows?: TranscriptRow[];
    currentRowIndex: number;
    signature: string;
    rowIndexOffset?: number;
    totalRowCount?: number;
    virtual?: TranscriptPanelVirtualWindow;
}

interface TranscriptRowHydrationTarget {
    cue: SubtitleCue;
    target: HTMLElement;
    key: string;
}

interface TranscriptPanelVirtualWindow {
    start: number;
    end: number;
    scrollTop: number;
    topSpacer: number;
    bottomSpacer: number;
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

function fittedSubtitleFontSize(element: HTMLElement, fitted: number, minimum: number, apply: (value: number) => void): number {
    for (let attempt = 0; attempt < 10; attempt++) {
        if (!subtitleElementOverflows(element)) return fitted;
        const next = nextSubtitleFontSize(element, fitted, minimum);
        if (next >= fitted) break;
        fitted = next;
        apply(fitted);
    }
    return fitted;
}

function subtitleFilesFromHostEvent(event: Event): HostedSubtitleFileLoadRequest {
    const rawDetail = event instanceof CustomEvent ? detailValue(event) : undefined;
    const detail = isRecord(rawDetail) ? rawDetail : {};
    const explicitJobs = [
        ...hostedSubtitleFileJobs('primary', detail.primary ?? detail.primaryFiles),
        ...hostedSubtitleFileJobs('secondary', detail.secondary ?? detail.secondaryFiles),
    ];
    const inferredJobs = explicitJobs.length ? [] : inferHostedSubtitleFileJobs(hostedFiles(detail.files));
    return {
        jobs: [...explicitJobs, ...inferredJobs],
        openPanel: normalizeHostedSubtitleOpenPanel(detail.openPanel),
    };
}

function detailValue(event: Event): unknown {
    return (event as CustomEvent<unknown>).detail;
}

function hostedSubtitleFileJobs(kind: 'primary' | 'secondary', value: unknown): HostedSubtitleFileJob[] {
    return hostedFiles(value).map(file => ({ kind, file }));
}

function hostedFiles(value: unknown): File[] {
    if (isHostedFile(value)) return [value];
    if (!value || typeof value !== 'object') return [];
    if (typeof (value as { length?: unknown }).length === 'number') {
        return Array.from(value as ArrayLike<unknown>).filter(isHostedFile);
    }
    if (Symbol.iterator in value) return Array.from(value as Iterable<unknown>).filter(isHostedFile);
    return [];
}

function isHostedFile(value: unknown): value is File {
    if (typeof File !== 'undefined' && value instanceof File) return true;
    return Boolean(value
        && typeof value === 'object'
        && typeof (value as File).name === 'string'
        && typeof (value as Blob).slice === 'function');
}

function readHostedSubtitleFileText(file: File): Promise<string> {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Could not read subtitle file.'));
        reader.readAsText(file);
    });
}

function inferHostedSubtitleFileJobs(files: File[]): HostedSubtitleFileJob[] {
    const subtitleFiles = files.filter(file => isSubtitleFileName(file.name));
    if (!subtitleFiles.length) return [];
    const primaryCandidates = subtitleFiles.filter(file => looksLikeJapaneseSubtitleFile(file.name));
    const secondaryCandidates = subtitleFiles.filter(file => looksLikeNativeSubtitleFile(file.name));
    const fallbackCandidates = subtitleFiles.filter(file => !primaryCandidates.includes(file) && !secondaryCandidates.includes(file));
    const primary = primaryCandidates.shift() ?? fallbackCandidates.shift() ?? secondaryCandidates.shift();
    if (!primary) return [];
    return [
        { kind: 'primary', file: primary },
        ...[...primaryCandidates, ...fallbackCandidates, ...secondaryCandidates].map(file => ({ kind: 'secondary' as const, file })),
    ];
}

function subtitleFilePickerJobs(kind: 'primary' | 'secondary', files: File[]): HostedSubtitleFileJob[] {
    if (files.length <= 1 || kind === 'secondary') return files.map(file => ({ kind, file }));
    return inferHostedSubtitleFileJobs(files);
}

function isSubtitleFileName(name: string): boolean {
    return /\.(?:srt|vtt|ass|ssa)$/iu.test(name);
}

function looksLikeJapaneseSubtitleFile(name: string): boolean {
    return /(^|[.\-_\s()[\]])(?:ja|jp|jpn|japanese|日本語)(?=$|[.\-_\s()[\]])/iu.test(name);
}

function looksLikeNativeSubtitleFile(name: string): boolean {
    return /(^|[.\-_\s()[\]])(?:en|eng|english|native|translation|translated)(?=$|[.\-_\s()[\]])/iu.test(name);
}

function normalizeHostedSubtitleOpenPanel(value: unknown): HostedSubtitleFileLoadRequest['openPanel'] {
    return value === 'lines' || value === 'tracks' || value === 'auto' || value === false ? value : 'auto';
}

type SubtitleStyleNumberSetting = 'subtitleFontSize' | 'subtitleFontWeight' | 'subtitleBottomOffset' | 'subtitleBackgroundOpacity';

function updateNumberSetting(
    settings: ReaderSettings,
    key: SubtitleStyleNumberSetting,
    value: string,
    min: number,
    max: number,
): boolean {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return false;
    const next = Math.min(Math.max(parsed, min), max);
    const normalized = key === 'subtitleBackgroundOpacity' ? Number(next.toFixed(2)) : Math.round(next);
    if (settings[key] === normalized) return false;
    settings[key] = normalized;
    return true;
}

function syncSubtitleStyleRangeControl(
    root: HTMLElement,
    key: SubtitleStyleNumberSetting,
    value: number,
    suffix: 'px' | '%' | 'weight' | '',
): void {
    const control = root.querySelector<HTMLInputElement>(`[data-subtitle-style-setting="${key}"]`);
    const nextValue = key === 'subtitleBackgroundOpacity' ? String(Number(value.toFixed(2))) : String(Math.round(value));
    if (control && control.value !== nextValue) control.value = nextValue;
    const output = root.querySelector<HTMLOutputElement>(`[data-subtitle-style-output="${key}"]`);
    if (!output) return;
    if (suffix === 'weight') output.textContent = String(Math.round(value));
    else output.textContent = suffix ? `${Math.round(value)}${suffix}` : `${Math.round(value * 100)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
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
    private videoResizeObserver?: ResizeObserver;
    private lastPlayerChromeHidden = false;
    private discoverTimer?: number;
    private tickTimer?: number;
    // Per-frame cue/karaoke sampler (rVFC, rAF fallback). Armed only while the
    // bound video plays; cancelled on pause/seek-away/destroy/hidden.
    private frameSyncHandle?: number;
    private frameSyncVideo?: HTMLVideoElement;
    private lastFrameGeometrySampleAt = 0;
    // Dirty-check for the per-frame karaoke pass: classes only flip at integer
    // character boundaries, so skip the class churn between crossings.
    private lastKaraokeProgressKey?: number;
    private lastKaraokePrimaryWord?: HTMLElement | null;
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
    private pendingDomCaption?: { text: string; firstSeenAt: number };
    private lastDomCaptionSeenAt = 0;
    private parsedHtmlCache = new Map<string, string>();
    private provisionalParsedHtmlCache = new Map<string, string>();
    private enrichedProvisionalParsedHtmlKeys = new Set<string>();
    private incompleteEnrichmentAttempts = new Map<string, number>();
    private sessionParseCacheChecked = new Set<string>();
    private emptyParsedHtmlCache = new Map<string, { html: string; expiresAt: number }>();
    private pendingParsedHtml = new Map<string, Promise<string>>();
    private pendingProvisionalParsedHtml = new Map<string, Promise<string>>();
    private parsedTokenCache = new Map<string, JPDBToken[]>();
    private parsedTokenNotifiedAt = new Map<string, number>();
    private transcriptTextTargetsByParseKey = new Map<string, HTMLElement[]>();
    private renderSerial = 0;
    private panelMode: SubtitlePanelMode = 'lines';
    private lastTranscriptSignature = '';
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
    // Tracks-panel virtualization (parallel to the lines-panel window above):
    // videos with auto-translated captions expose hundreds of track rows.
    private renderedTracksVirtualWindow?: { start: number; end: number; rowCount: number };
    private tracksVirtualRenderFrame?: number;
    private tracksVirtualScrollTop = 0;
    // Manual-scroll override for transcript auto-follow: a user scroll pauses
    // the snap-to-active so advancing to the next cue does not yank the list
    // back; programmatic scrollIntoView calls are ignored for a short window so
    // they are not mistaken for user scrolls.
    private transcriptUserScrollAt = 0;
    private transcriptProgrammaticScrollUntil = 0;
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
    private youtubeDomCaptionFallbackTrackId = '';
    private fullscreen = false;
    private lastRenderedPrimaryText = '';
    private lastRenderedPrimaryHtml = '';
    private lastRenderedPrimaryKey = '';
    private lastAppliedSubtitleHtml = '';
    private parseWarmupSerial = 0;
    private lastParseWarmupAnchor = -1;
    private transcriptHydrationCursor = 0;
    private effectiveTranscriptPlacement: ReaderSettings['subtitleTranscriptPlacement'] = 'right';
    private lastAutoCopiedCueSignature = '';
    private youtubeTrackDiscoveryInFlight = false;
    private lastYouTubeTrackDiscoveryAt = 0;
    private lastYouTubeCaptionActivationAt = 0;
    private transcriptPanelClosing = false;
    private transcriptLayoutReferenceRect?: DOMRect;
    private transcriptLayoutReferenceViewport = '';
    private primarySelectionRequest = 0;
    private secondarySelectionRequest = 0;
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
    private transcriptResizeActive = false;
    private asbMoveHandlesActive = false;
    private readonly asbSubtitleDragHandles = new WeakSet<HTMLElement>();
    private readonly asbSubtitleBaseTransforms = new WeakMap<HTMLElement, string>();

    constructor(private options: SubtitlePlayerOptions) {}

    private readonly clickHandlers: Record<string, (target: HTMLElement) => void> = {
        cue: target => this.seekToTranscriptRow(this.rowIndexFromTarget(target)),
        previous: () => this.seekSubtitle(-1),
        next: () => this.seekSubtitle(1),
        playback: () => this.toggleVideoPlayback(),
        ocr: () => this.requestVideoFrameOcr(),
        visibility: () => this.toggleOverlayVisibility(),
        fullscreen: () => this.togglePlayerFullscreen(),
        copy: target => { void this.copySubtitle().then(() => flashSubtitleCopyFeedback(target)); },
        'copy-row': target => { void this.copyTranscriptRow(this.rowIndexFromTarget(target)).then(() => flashSubtitleCopyFeedback(target)); },
        'peek-row': target => this.toggleRowTranslationPeek(target),
        'jump-current': () => this.jumpToCurrentTranscriptRow(),
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
        this.observer = new MutationObserver(mutations => {
            this.syncYouTubeMobileBottomSheetState();
            // Reader-root-only batches (Yomu's own overlay re-renders, the most
            // common kind during playback) cannot change fullscreen state: the
            // inline-fullscreen marker lives on the video-player host outside
            // the reader root. Bail before the per-mutation fullscreen walk.
            if (mutations.every(mutationInsideReaderRoot)) return;
            if (mutations.some(mutation => this.mutationCouldAffectFullscreenState(mutation))) {
                this.syncFullscreenState();
                this.scheduleAlignToVideo();
            }
            if (!mutations.some(mutationCouldAffectVideoDiscovery)) return;
            this.scheduleDiscoverVideo();
        });
        this.observer.observe(body, {
            attributeFilter: ['aria-modal', 'class', 'data-yomu-inline-fullscreen', 'fullscreen', 'hidden'],
            attributes: true,
            childList: true,
            subtree: true,
        });
        // Capture phase: YouTube's own keydown handlers stopImmediatePropagation
        // on keys they know, which starved the subtitle seek shortcuts of the
        // event entirely. handleKeydown only preventDefaults on a configured
        // shortcut match, so unmatched keys pass through untouched.
        document.addEventListener('keydown', event => this.handleKeydown(event), this.eventOptions({ capture: true }));
        document.addEventListener('pointerdown', event => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
        document.addEventListener('visibilitychange', () => this.restartTickAfterVisibilityChange(), this.eventOptions());
        document.addEventListener('pointermove', event => this.handlePointerActivity(event), this.eventOptions({ passive: true }));
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
        window.addEventListener('scroll', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        window.addEventListener('resize', () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
        window.addEventListener('orientationchange', () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
        window.visualViewport?.addEventListener('resize', () => this.handleTranscriptViewportChange({ stabilize: true }), this.eventOptions({ passive: true }));
        window.visualViewport?.addEventListener('scroll', () => this.scheduleAlignToVideo(), this.eventOptions({ passive: true }));
        this.discoverVideo();
        this.tick();
        log.info('Subtitle controller initialized');
    }

    private mutationCouldAffectFullscreenState(mutation: MutationRecord): boolean {
        if (mutation.type !== 'attributes') return false;
        const target = mutation.target;
        if (!(target instanceof HTMLElement)) return false;
        return target.matches('ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player, [data-yomu-inline-fullscreen]')
            || Boolean(target.closest('ytd-watch-flexy, ytd-player, ytm-player, #movie_player, .html5-video-player, [data-yomu-inline-fullscreen]'));
    }

    private handleYouTubeNavigation(): void {
        if (!isYouTubePage()) return;
        this.lastYouTubeTrackDiscoveryAt = 0;
        // A new video is a fresh surface: let "open by default" re-apply once.
        this.transcriptDefaultOpenApplied = false;
        this.scheduleDiscoverVideo();
        void this.discoverYouTubeTracksThrottled(true);
        this.scheduleAlignToVideo();
    }

    private handleFullscreenLayoutChange(): void {
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
        this.resetShadowPracticeState();
        this.clearPlaybackPauseReassert();
        this.abortController?.abort();
        this.abortController = undefined;
        this.observer?.disconnect();
        this.observer = undefined;
        this.videoResizeObserver?.disconnect();
        this.videoResizeObserver = undefined;
        this.discoverTimer = clearWindowTimeout(this.discoverTimer);
        this.tickTimer = clearWindowTimeout(this.tickTimer);
        this.stopFrameSync();
        this.clearControlsIdleTimer();
        this.alignFrame = clearWindowAnimationFrame(this.alignFrame);
        this.transcriptScrollFrame = clearWindowAnimationFrame(this.transcriptScrollFrame);
        this.transcriptHydrateFrame = clearWindowAnimationFrame(this.transcriptHydrateFrame);
        this.transcriptVirtualRenderFrame = clearWindowAnimationFrame(this.transcriptVirtualRenderFrame);
        this.tracksVirtualRenderFrame = clearWindowAnimationFrame(this.tracksVirtualRenderFrame);
        this.clearDeferredTranscriptPanelRender();
        this.transcriptInsetRealignFrame = clearWindowAnimationFrame(this.transcriptInsetRealignFrame);
        this.transcriptViewportStabilizeTimer = clearWindowTimeout(this.transcriptViewportStabilizeTimer);
        this.transcriptResizeBackgroundResumeTimer = clearWindowTimeout(this.transcriptResizeBackgroundResumeTimer);
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        this.clearTranscriptPanelAnimation();
        this.pointerActivityFrame = clearWindowAnimationFrame(this.pointerActivityFrame);
        this.pendingPointerActivity = undefined;
        this.clearVideoInsetForTranscriptPanel();
        this.subtitleStylePanelOpen = false;
        document.documentElement.classList.remove(YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS);
        this.removeAsbPlayerSubtitleMoveHandles();
        this.transcriptPanel?.remove();
        this.root?.remove();
        this.root = undefined;
        this.subtitleEl = undefined;
        this.transcriptPanel = undefined;
        this.video = undefined;
    }

    private eventOptions(options: AddEventListenerOptions = {}): AddEventListenerOptions {
        return this.abortController ? { ...options, signal: this.abortController.signal } : options;
    }

    refresh(): void {
        if (!this.root) return;
        const settings = this.options.getSettings();
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
        this.hideControlsImmediately();
    }

    private syncRootVisibility(settings: ReaderSettings): void {
        if (!this.root) return;
        const tracksPanelOpen = settings.subtitlePlayerEnabled && this.panelMode === 'tracks' && this.isTranscriptPanelOpen();
        const hidden = !tracksPanelOpen && shouldHideSubtitleRoot(settings, this.video, this.cues, this.tracks);
        this.root.hidden = hidden;
        if (hidden && this.transcriptPanel) this.hideTranscriptPanelElement({ immediate: true });
        this.root.classList.toggle('jpdb-subtitle-hidden', !settings.subtitleOverlayVisible);
        this.root.classList.toggle('jpdb-subtitle-controls-auto', settings.subtitleControlsMode === 'auto');
        this.root.classList.toggle('jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
        this.root.classList.toggle('jpdb-subtitle-controls-always', settings.subtitleControlsMode === 'always');
        this.root.classList.toggle('jpdb-subtitle-controls-idle', shouldKeepIdleControlClass(this.root, settings));
        if (!this.video) {
            this.root.classList.remove('jpdb-subtitle-has-video-frame', 'jpdb-subtitle-compact-video');
            this.root.classList.add('jpdb-subtitle-video-out-of-view');
        }
        this.transcriptPanel?.classList.toggle('jpdb-subtitle-controls-hidden', settings.subtitleControlsMode === 'hidden');
    }

    private syncRootStyleSettings(settings: ReaderSettings): void {
        if (!this.root) return;
        setStylePropertyIfChanged(this.root, '--subtitle-font-size-target', `${settings.subtitleFontSize}px`);
        setStylePropertyIfChanged(this.root, '--subtitle-font-size', `${settings.subtitleFontSize}px`);
        this.applyEffectiveSubtitleBottom();
        this.syncSubtitleDragOffsetStyle();
        this.root.style.setProperty('--subtitle-color', settings.subtitleTextColor);
        this.root.style.setProperty('--subtitle-outline', settings.subtitleOutlineColor);
        this.root.style.setProperty('--subtitle-background-rgba', accentToRgba(settings.subtitleBackgroundColor, settings.subtitleBackgroundOpacity));
        this.root.style.setProperty('--subtitle-family', settings.subtitleFontFamily);
        this.root.style.setProperty('--subtitle-weight', String(settings.subtitleFontWeight));
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
        const playLabel = uiText(settings.interfaceLanguage, 'playVideo');
        const fullscreenLabel = uiText(settings.interfaceLanguage, 'enterFullscreen');
        const visibilityLabel = uiText(settings.interfaceLanguage, 'subtitleOverlayVisible');
        const panelLabel = uiText(settings.interfaceLanguage, 'openSubtitlePanel');
        const moveLabel = uiText(settings.interfaceLanguage, 'moveSubtitles');
        const ocrLabel = uiText(settings.interfaceLanguage, 'readVideoFrame');
        const ocrButton = settings.ocrEnabled && settings.ocrProvider !== 'off'
            ? `<button class="jpdb-subtitle-ocr-trigger" type="button" data-action="ocr" title="${escapeHtml(ocrLabel)}" aria-label="${escapeHtml(ocrLabel)}">${subtitleIcon('scan')}</button>`
            : '';
        setInnerHtml(root, `
            <div class="jpdb-subtitle-text"><div class="jpdb-subtitle-lines" aria-live="polite"></div><button class="jpdb-subtitle-drag-handle" type="button" data-subtitle-drag-handle data-jpdb-reader-surface-ignore title="${escapeHtml(moveLabel)}" aria-label="${escapeHtml(moveLabel)}"><span aria-hidden="true"></span></button></div>
            <div class="jpdb-subtitle-status" aria-live="polite" data-jpdb-reader-surface-ignore></div>
            <div class="jpdb-subtitle-rail" data-jpdb-reader-surface-ignore>
                <button type="button" data-action="previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}">‹</button>
                <button type="button" data-action="next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}">›</button>
                <button class="jpdb-subtitle-playback-toggle" type="button" data-action="playback" title="${escapeHtml(playLabel)}" aria-label="${escapeHtml(playLabel)}">${subtitleIcon('play')}</button>
                ${ocrButton}
                <button class="jpdb-subtitle-visibility-toggle" type="button" data-action="visibility" title="${escapeHtml(visibilityLabel)}" aria-label="${escapeHtml(visibilityLabel)}">${subtitleIcon(settings.subtitleOverlayVisible ? 'eye' : 'eye-off')}</button>
                <button class="jpdb-subtitle-fullscreen-toggle" type="button" data-action="fullscreen" title="${escapeHtml(fullscreenLabel)}" aria-label="${escapeHtml(fullscreenLabel)}">${subtitleIcon('fullscreen')}</button>
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
        this.transcriptPanel.addEventListener('click', event => this.handleTranscriptPanelClick(event), this.eventOptions());
        this.transcriptPanel.addEventListener('keydown', event => this.handleTranscriptPanelKeydown(event), this.eventOptions());
        for (const eventName of TRANSCRIPT_PANEL_OWNED_POINTER_EVENTS) {
            this.transcriptPanel.addEventListener(eventName, event => this.stopTranscriptPanelPropagation(event), this.eventOptions());
        }
        body.appendChild(root);
        body.appendChild(this.transcriptPanel);
        this.root = root;
        this.bindSubtitleDragHandle();
        this.restoreSubtitleDragOffset();
        this.refresh();
        // First paint lands in the right place instead of being corrected a
        // frame later by the rAF-deferred alignment refresh() scheduled.
        this.alignToVideo();
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
            if (this.video && !this.isSubtitleVideoCandidate(this.video)) this.clearDiscoveredVideoCandidate();
            this.syncSubtitleSourceContext(undefined);
            this.refresh();
            return;
        }
        if (candidate && candidate !== this.video) this.useDiscoveredVideoCandidate(candidate);
        this.syncSubtitleSourceContext(candidate ?? this.video);
        this.discoverPageSubtitleTracks();
        void this.discoverYouTubeTracksThrottled(true);
        this.refresh();
    }

    private discoverVideoCandidate(): HTMLVideoElement | undefined {
        return Array.from(document.querySelectorAll<HTMLVideoElement>('video'))
            .filter(video => this.isSubtitleVideoCandidate(video))
            .sort(compareSubtitleVideoCandidates)[0];
    }

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
        if (this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement) && frameHasPlayerControls(fullscreenElement)) return true;
        const frame = subtitleVideoLayoutTarget(this.video);
        if (frame && frame !== this.video && frameHasPlayerControls(frame)) return true;
        return Boolean(this.tracks.length || this.cues.length || this.currentCue?.text);
    }

    private clearDiscoveredVideoCandidate(): void {
        this.video = undefined;
        this.subtitleSourceContextKey = '';
        this.youtubeVideoId = '';
        this.youtubeAutoSelectSuppressedVideoId = '';
        this.youtubeDomCaptionFallbackTrackId = '';
        this.clearTransientSubtitleState();
        this.removeSubtitleTracks(track => track.kind !== 'file');
        this.setNativeTrackModes();
        this.render();
        this.syncControls();
    }

    private useDiscoveredVideoCandidate(candidate: HTMLVideoElement): void {
        this.video = candidate;
        this.clearTransientSubtitleState();
        this.removeStaleNativeTracks(candidate);
        this.attachTextTracks(candidate);
        this.observeVideoLayout(candidate);
        // Align synchronously on bind: the video box is already measurable, and
        // the rAF-deferred path otherwise paints the control rail one frame at
        // the wrong position before it "sorts itself out".
        this.alignToVideo();
        log.info('Subtitle video detected', videoSummary(candidate));
    }

    private attachTextTracks(video: HTMLVideoElement): void {
        for (const track of Array.from(video.textTracks)) this.addNativeTrack(track);
        video.textTracks.addEventListener?.('addtrack', event => {
            if (video !== this.video) return;
            const track = (event as TrackEvent).track as TextTrack | null;
            if (track) this.addNativeTrack(track);
        }, this.eventOptions());
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
        this.lastAutoCopiedCueSignature = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
        this.lastAppliedSubtitleHtml = '';
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
        this.lastParseWarmupAnchor = -1;
        this.resetShadowPracticeState();
        this.restoreSubtitleDragOffset();
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

    private renderOpenSubtitlePanel(): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
        if (this.panelMode === 'tracks' || !this.hasTranscriptSurface()) this.renderTrackPanel();
        else if (this.panelMode === 'shadow') this.renderShadowPanel(true);
        else if (this.panelMode === 'mine') this.renderBatchMiningPanel();
        else this.renderTranscriptPanel(true);
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
            video.addEventListener(eventName, () => this.handleFullscreenLayoutChange(), this.eventOptions({ passive: true }));
        }
        const handlePlaybackTimeChanged = () => this.syncSubtitleToPlaybackTime();
        video.addEventListener('timeupdate', handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
        video.addEventListener('seeking', handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
        video.addEventListener('seeked', handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
        video.addEventListener('ratechange', handlePlaybackTimeChanged, this.eventOptions({ passive: true }));
        video.addEventListener('pause', () => {
            // Only the BOUND video's pause tears down the sampler. After a player
            // element swap (miniplayer/ad), a stale element's listener stays armed
            // (its closure captured the old `video`); without this guard its pause
            // would cancel the sampler that is actively tracking the new, playing
            // element. syncPauseTranscriptPanel is self-guarding (it no-ops when
            // this.video is not paused), so it stays unconditional.
            if (video === this.video) this.stopFrameSync();
            if (video === this.video) this.syncControls();
            this.syncPauseTranscriptPanel({ deferRender: true });
        }, this.eventOptions({ passive: true }));
        const handlePlaybackStarted = () => {
            this.pausePanelDismissed = false;
            // Same deferred path as pause: syncPauseTranscriptPanel sees the
            // playing video and closes the auto-opened panel after the paint.
            if (this.pausePanelOpen) this.schedulePauseTranscriptPanelSync();
            if (video === this.video) {
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
        this.refreshNativeCueLists();
        this.updateFromLoadedCues();
        if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }

    private addNativeTrack(track: TextTrack): void {
        if (isYouTubePage()) return;
        if (this.tracks.some(item => item.track === track)) return;
        const id = `native-${this.tracks.length}`;
        const label = track.label || track.language || `${uiText(this.options.getSettings().interfaceLanguage, 'subtitleFallbackLabel')} ${this.tracks.length + 1}`;
        const option: SubtitleTrackOption = { id, label, kind: 'native', language: track.language, track };
        this.tracks.push(option);

        track.addEventListener('cuechange', () => this.updateFromNativeTrack(track), this.eventOptions());
        this.maybeAutoSelectNativeTrack(option);
        if (this.ensureTranslatedJapaneseTrack()) this.maybeAutoSelectTranslatedJapaneseTrack();
        window.setTimeout(() => {
            if (this.destroyed) return;
            this.setNativeTrackModes();
            this.syncControls();
        }, 0);
        this.syncControls();
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
        const generated = this.ensureTranslatedJapaneseTrack();
        if (generated) this.maybeAutoSelectTranslatedJapaneseTrack();
        if (changes.added || changes.updated || changes.removed || generated) {
            this.renderTrackPanel();
            this.syncControls();
        }
    }

    private addOrUpdatePageSubtitleTrack(source: PageSubtitleSource): { added: number; updated: number } {
        const existing = this.findPageSubtitleTrack(source);
        if (existing) return { added: 0, updated: updatePageSubtitleTrack(existing, source) ? 1 : 0 };
        const track = this.createPageSubtitleTrack(source);
        this.tracks.push(track);
        this.maybeAutoSelectPageSubtitleTrack(track);
        return { added: 1, updated: 0 };
    }

    private findPageSubtitleTrack(source: PageSubtitleSource): SubtitleTrackOption | undefined {
        return this.tracks.find(track => track.sourceKey === source.sourceKey || (track.url && sameSubtitleUrl(track.url, source.url)));
    }

    private createPageSubtitleTrack(source: PageSubtitleSource): SubtitleTrackOption {
        return {
            id: `remote-${this.tracks.length}`,
            label: source.label,
            kind: 'remote',
            language: source.language,
            url: source.url,
            sourceKey: source.sourceKey,
        };
    }

    private maybeAutoSelectPageSubtitleTrack(option: SubtitleTrackOption): void {
        if (option.kind !== 'remote' || !option.url) return;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const secondary = this.tracks.find(track => track.id === this.secondaryTrackId);
        if (this.shouldAutoSelectPrimaryPageTrack(option, selected)) {
            void this.selectTrack(option.id);
            return;
        }
        if (this.shouldAutoSelectSecondaryPageTrack(option, secondary)) {
            void this.selectSecondaryTrack(option.id);
        }
    }

    private shouldAutoSelectPrimaryPageTrack(option: SubtitleTrackOption, selected: SubtitleTrackOption | undefined): boolean {
        return isJapaneseSubtitleTrack(option)
            && (!this.selectedTrackId || this.isSyntheticTranslatedSelection() || shouldReplaceWaitingNativeTrack(selected, option, this.cues));
    }

    private shouldAutoSelectSecondaryPageTrack(option: SubtitleTrackOption, secondary: SubtitleTrackOption | undefined): boolean {
        return isEnglishSubtitleTrack(option)
            && (!this.secondaryTrackId || shouldReplaceWaitingNativeTrack(secondary, option, this.secondaryCues));
    }

    private maybeAutoSelectNativeTrack(option: SubtitleTrackOption): void {
        const track = option.track;
        if (!track) return;
        const role = this.autoSelectableNativeTrackRole(option);
        if (role) this.autoSelectNativeTrack(option, track, role);
    }

    private autoSelectableNativeTrackRole(option: SubtitleTrackOption): 'primary' | 'secondary' | null {
        // A real Japanese track always beats an auto-selected machine translation.
        if (isJapaneseSubtitleTrack(option) && (!this.selectedTrackId || this.isSyntheticTranslatedSelection())) return 'primary';
        if (!this.secondaryTrackId && isEnglishSubtitleTrack(option)) return 'secondary';
        return null;
    }

    private isSyntheticTranslatedSelection(): boolean {
        if (!this.selectedTrackId) return false;
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        return Boolean(selected?.translatedFromTrackId);
    }

    private maybeAutoSelectTranslatedJapaneseTrack(): void {
        if (this.selectedTrackId) return;
        const synthetic = this.tracks.find(track => track.translatedFromTrackId && isJapaneseSubtitleTrack(track));
        if (synthetic) void this.selectTrack(synthetic.id);
    }

    private autoSelectNativeTrack(option: SubtitleTrackOption, track: TextTrack, role: 'primary' | 'secondary'): void {
        const requestId = this.beginTrackSelection(role);
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
        if (settings.subtitlePlayerEnabled && !document.hidden) this.tickSubtitlePlayer(settings);
        this.tickTimer = window.setTimeout(() => {
            this.tickTimer = undefined;
            this.tick();
        }, this.tickDelayMs(settings));
    }

    // The active cadence is only needed while a video is actually playing;
    // hidden tabs and videoless pages ticking that fast just drains battery.
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

    // Frame-synced cue + karaoke sampler. The housekeeping tick (500ms) is too
    // coarse for cue boundaries — a line could flip up to a tick late, worse at
    // 1.5-2x playback — so sample once per presented frame while the bound video
    // plays. Cancelled on pause/seek-away/destroy/hidden so a paused or
    // backgrounded tab never spins. updateFromLoadedCues no-ops when the active
    // cue is unchanged, so the steady-state per-frame cost is two bounded cue
    // searches.
    private startFrameSync(video: HTMLVideoElement): void {
        if (this.destroyed || document.hidden) return;
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
            if (!current || current.paused || !current.isConnected) {
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
            this.applyKaraokeStateToPrimary(this.currentCue, video.currentTime);
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
    getBoundVideo(): HTMLVideoElement | undefined {
        return this.video && this.video.isConnected ? this.video : undefined;
    }

    private tickSubtitlePlayer(settings: ReaderSettings): void {
        this.syncYouTubeMobileBottomSheetState();
        this.refreshSubtitleSourcesForTick();
        this.refreshNativeCueLists();
        this.setNativeTrackModes();
        this.syncShortsReelNavigation();
        this.updateFromLoadedCues();
        this.syncShadowAutoPause();
        this.syncShadowLoop();
        this.realignIfVideoMoved();
        this.syncPlayerChromeIdleState();
        this.syncAsbPlayerSubtitleMoveHandles(settings);
        if (settings.subtitleKaraokeMode && cueHasExactWordTimings(this.currentCue)) this.render();
        if (this.shouldUpdateFromDomCaptions()) this.updateFromDomCaptions();
    }

    private syncYouTubeMobileBottomSheetState(): void {
        document.documentElement.classList.toggle(
            YOUTUBE_MOBILE_BOTTOM_SHEET_OPEN_CLASS,
            hasOpenYouTubeMobileBottomSheet(),
        );
    }

    // The rail follows the player's own chrome: on phones there is no hover,
    // so the player's fade state is the only "controls are visible" signal
    // the viewer has — the rail must appear and disappear in lockstep.
    private syncPlayerChromeIdleState(): void {
        if (!this.root || !this.hasAutoIdleMode(this.options.getSettings())) return;
        const chromeHidden = this.videoPlayerChromeHidden();
        if (chromeHidden) {
            // Mobile taps leave the last rail button focused, which would
            // otherwise block idling forever via :focus-within.
            this.blurFocusedRailControl();
            if (this.shouldAutoIdleControls()) this.hideControlsImmediately();
        } else if (this.lastPlayerChromeHidden && this.isVideoPlayerChromeSurface()) {
            // Chrome just re-appeared (e.g. the viewer tapped the video):
            // re-reveal the rail alongside the player's own controls.
            this.showControlsTemporarily();
        }
        this.lastPlayerChromeHidden = chromeHidden;
    }

    private blurFocusedRailControl(): void {
        const active = document.activeElement;
        if (active instanceof HTMLElement && this.root?.contains(active) && active.closest('.jpdb-subtitle-rail')) {
            active.blur();
        }
    }

    private isVideoPlayerChromeSurface(): boolean {
        return Boolean(document.querySelector('#player-control-overlay')
            || this.video?.closest('#movie_player, .html5-video-player'));
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
        return Boolean(getYouTubeVideoId())
            && isYouTubeOwnedVideoElement(this.video)
            && !this.cues.length
            && (Boolean(this.selectedTrackId) || !this.tracks.some(track => track.kind === 'youtube'));
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
        if (!this.video) {
            this.root.classList.remove('jpdb-subtitle-has-video-frame', 'jpdb-subtitle-compact-video');
            this.root.classList.add('jpdb-subtitle-video-out-of-view');
            this.lastAlignedVideoRectKey = '';
            this.positionTranscriptPanel();
            return;
        }
        const rect = this.videoLayoutRect();
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

    // Swiping between Shorts reels reuses the same <video> element at the same
    // position and emits no yt-navigate-finish, so the controller never treats
    // it as navigation: tracks/overlay stay bound to the previous reel and the
    // overlay can latch out-of-view until an unrelated DOM mutation (a manual
    // pause/resume) happens to re-trigger discovery. Poll the active /shorts/ id
    // from the tick and run the normal navigation path when it changes.
    private syncShortsReelNavigation(): void {
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

    private isVideoOverlayVisible(rect: DOMRect): boolean {
        return isSubtitleOverlayVideoVisible(rect)
            && (!isYouTubePage() || this.fullscreen || youtubeWatchPlayerMeaningfullyVisible(rect))
            && (!this.video || isSubtitleVideoElementRenderable(this.video))
            && this.videoHasPlayerAffordances();
    }

    private applyVideoLayout(rect: DOMRect): void {
        if (!this.root) return;
        const videoVisible = this.isVideoOverlayVisible(rect);
        this.root.classList.toggle('jpdb-subtitle-video-out-of-view', !videoVisible);
        this.root.classList.toggle('jpdb-subtitle-has-video-frame', videoVisible);
        if (!videoVisible) {
            this.root.classList.remove('jpdb-subtitle-compact-video');
            this.clearVideoInsetForTranscriptPanel();
            this.positionTranscriptPanel();
            return;
        }
        const layout = subtitleOverlayLayout(rect);
        this.root.classList.toggle('jpdb-subtitle-compact-video', layout.width < 560 || layout.height < 260);
        if (rect.width < 120 || rect.height < 80) {
            applyElementLayout(this.root, {
                left: 0,
                top: 0,
                width: this.transcriptViewportWidth(),
                height: this.transcriptViewportHeight(),
            });
            this.positionTranscriptPanel();
            this.fitSubtitleTextToVideo();
            return;
        }
        applyElementLayout(this.root, layout);
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.fitSubtitleTextToVideo();
    }

    private updateFromLoadedCues(): void {
        if (!this.video) return;
        const time = this.video.currentTime;
        const secondary = this.secondaryTrackId
            ? (findActiveSubtitleCue(this.secondaryCues, time) ?? findInitialLeadInCue(this.secondaryCues, time))
            : undefined;
        const cue = this.selectedTrackId ? this.findRenderablePrimaryCue(time, secondary) : undefined;
        if (this.updateLoadedCueState(cue, secondary, time)) this.afterLoadedCueStateChanged();
        else this.warmParseOnGapAnchorJump();
    }

    // Auto-generated YouTube captions and their `&tlang=` translations are
    // segmented independently, so the primary (JP) cue often begins a beat
    // after — or falls into a gap relative to — the native (EN) line that's
    // already active. That left no primary cue at the playhead while a native
    // cue was active, showing the native line alone (user-reported). When the
    // direct lookup misses but a native cue is active, surface the primary
    // aligned to it so the pair appears together. Mirrors
    // primaryHeldByActiveSecondary for the not-yet-shown direction.
    private findRenderablePrimaryCue(time: number, activeSecondary?: SubtitleCue): SubtitleCue | undefined {
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
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncPauseTranscriptPanel();
        this.syncControls();
        this.warmParseAroundActiveCue();
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

    // Auto-generated YouTube captions and their `&tlang=` translations are
    // normalized independently (text-overlap rolling-cue merge), so the
    // primary line's cue often ends a beat before its translation's does.
    // Clearing the primary on its own boundary left the translation showing
    // alone (user-reported). Hold the primary while the still-active secondary
    // cue is the one aligned to it, so the pair appears and clears as a unit.
    private primaryHeldByActiveSecondary(time: number): boolean {
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
        this.ensureYouTubeDomCaptionFallbackActive(selected);
        const text = readPageCaptionText(this.video, this.root, {
            allowNonJapanese: this.shouldAllowNonJapaneseDomCaptionFallback(selected),
        });
        if (!text) {
            this.clearDomCaptionFallbackIfExpired();
            return null;
        }
        this.keepDomCaptionCueAlive(text);
        if (!this.isDomCaptionStable(text, performance.now())) return null;

        return { text, selected };
    }

    // The synthetic DOM-caption cue gets a 4s guess for its duration; lines
    // the page keeps showing longer used to expire mid-display and could
    // never re-apply (same text). Renew the cue while the page still shows it.
    private keepDomCaptionCueAlive(text: string): void {
        if (this.cues.length || !this.currentCue) return;
        if (text !== this.lastDomCaption) return;
        this.lastDomCaptionSeenAt = performance.now();
        const now = this.video?.currentTime ?? 0;
        if (now >= this.currentCue.start && this.currentCue.end < now + 1) this.currentCue.end = now + 4;
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

    private shouldAllowNonJapaneseDomCaptionFallback(selected: SubtitleTrackOption | undefined): boolean {
        // While a Japanese track is still loading its cues, YouTube's own
        // caption overlay shows whatever language the player defaulted to
        // (e.g. Arabic); mirroring that flashes foreign subs before the
        // Japanese ones arrive (user-reported).
        return Boolean(selected?.kind === 'youtube'
            && selected.sourceKey !== YOUTUBE_DOM_CAPTION_FALLBACK_SOURCE_KEY
            && !isJapaneseSubtitleTrack(selected));
    }

    private clearDomCaptionFallbackIfExpired(): void {
        if (this.shouldHoldRecentDomCaption()) return;
        this.pendingDomCaption = undefined;
        if (!this.cues.length && this.currentCue && (this.video?.currentTime ?? 0) > this.currentCue.end) {
            this.currentCue = undefined;
            this.lastDomCaption = '';
            this.lastDomCaptionSeenAt = 0;
            this.render();
            this.syncControls();
        }
    }

    private shouldHoldRecentDomCaption(): boolean {
        if (this.cues.length || !this.currentCue || !this.lastDomCaptionSeenAt) return false;
        return performance.now() - this.lastDomCaptionSeenAt < DOM_CAPTION_MISSING_GRACE_MS;
    }

    private isDomCaptionStable(text: string, nowMs: number): boolean {
        if (this.pendingDomCaption?.text !== text) {
            this.pendingDomCaption = { text, firstSeenAt: nowMs };
            // Parse during the stability window instead of after it, so the
            // caption renders colorized the moment it counts as stable.
            this.warmDomCaptionParse(text);
            return false;
        }
        return nowMs - this.pendingDomCaption.firstSeenAt >= DOM_CAPTION_STABLE_DELAY_MS && text !== this.lastDomCaption;
    }

    private warmDomCaptionParse(text: string): void {
        if (!text.trim() || !this.shouldParseSubtitles()) return;
        // Warm the texts that will actually render: applyDomCaptionFallback
        // normalizes and sentence-splits the raw caption, so warming the raw
        // string would cache under a key no render ever reads and the line
        // would parse only AFTER the stability window.
        const texts = this.domCaptionCueTexts(text);
        if (!texts.length) return;
        void this.parseCueHtmlBatch(texts, this.options.getSettings(), { enrichBeforeRender: true, requireEnrichedProvisional: true }).catch(() => undefined);
    }

    private domCaptionCueTexts(text: string): string[] {
        return normalizeSubtitleCues([{ start: 0, end: 4, text }])
            .map(cue => cue.text.trim())
            .filter(Boolean);
    }

    private applyDomCaptionFallback(text: string, selected: SubtitleTrackOption | undefined): void {
        this.lastDomCaption = text;
        this.lastDomCaptionSeenAt = performance.now();
        const now = this.video?.currentTime ?? 0;
        this.currentCue = normalizeSubtitleCues([{ start: now, end: now + 4, text }])[0];
        if (selected?.loadingState === 'waiting') selected.loadingState = 'ready';
        this.render();
        this.renderOpenSubtitlePanel();
        this.syncControls();
        void this.autoCopyCurrentCue();
    }

    private render(): void {
        if (!this.subtitleEl) return;
        const settings = this.options.getSettings();
        const text = this.currentCue?.text.trim() ?? '';
        if (!text) {
            this.renderEmptySubtitle(settings);
            return;
        }
        this.renderActiveSubtitle(text, settings);
    }

    private renderEmptySubtitle(settings: ReaderSettings): void {
        if (!this.subtitleEl) return;
        this.applySubtitleHtml(this.renderSecondarySubtitle(settings));
    }

    private renderActiveSubtitle(text: string, settings: ReaderSettings): void {
        if (!this.subtitleEl) return;
        const primary = this.renderPrimarySubtitle(text, settings);
        const changed = this.applySubtitleHtml(`<div class="jpdb-subtitle-primary">${primary.html}</div>${this.renderSecondarySubtitle(settings)}`);
        this.applyRenderedPrimarySubtitle(primary, text);
        // Re-applying state colors only matters when the DOM was rebuilt;
        // re-notifying on identical renders made pitch/state highlights
        // flicker out under time-driven render ticks (user-reported).
        if (changed) this.notifyParsedTokensForRenderedPrimary(text, settings, primary.html);
    }

    // render() runs on every cue/time/settings tick; rebuilding identical DOM
    // each tick wiped the async-applied word-state coloring and caused a
    // visible rerender flicker plus constant layout work (user-reported).
    private applySubtitleHtml(html: string): boolean {
        if (!this.subtitleEl) return false;
        const hasContent = this.subtitleEl.firstChild !== null;
        const unchanged = this.lastAppliedSubtitleHtml === html
            && (html === '' ? !hasContent : hasContent);
        if (unchanged) return false;
        setInnerHtml(this.subtitleEl, html);
        this.lastAppliedSubtitleHtml = html;
        return true;
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
        return renderControllerPrimarySubtitle({
            cue: activeCue,
            text,
            settings,
            parseKey,
            parsedHtml: this.primaryParsedHtmlForRender(text, settings, parseKey),
            lastRenderedKey: this.lastRenderedPrimaryKey,
            lastRenderedText: this.lastRenderedPrimaryText,
            lastRenderedHtml: this.lastRenderedPrimaryHtml,
            hasFreshEmptyParsedHtml: this.hasFreshEmptyParsedHtml(parseKey),
            hasParser: this.shouldParseSubtitles(settings),
            time: this.video?.currentTime ?? activeCue?.start ?? 0,
        });
    }

    private primaryParsedHtmlForRender(text: string, settings: ReaderSettings, key: string): string | undefined {
        const cached = this.cachedParsedCueHtml(key, settings);
        if (cached !== undefined) return cached;
        const provisional = this.provisionalParsedHtmlCache.get(key);
        if (provisional !== undefined) {
            if (this.shouldUseProvisionalSubtitleParse(settings)) {
                if (!this.enrichedProvisionalParsedHtmlKeys.has(key)) {
                    if (this.hasAuthoritativeParseTier(settings)) {
                        this.ensureAuthoritativeParsedCueHtml(text, settings, key);
                        return undefined;
                    }
                    this.ensureEnrichedProvisionalParsedCueHtml(text, settings, key);
                    if (!this.parsedTokenCache.has(key)) return undefined;
                } else {
                    this.ensureAuthoritativeParsedCueHtml(text, settings, key);
                }
            }
            return provisional;
        }
        return undefined;
    }

    private renderSecondarySubtitle(settings: ReaderSettings): string {
        return settings.subtitleSecondaryVisible && this.secondaryCue?.text
            ? renderSubtitleSecondary(this.secondaryCue.text, settings.subtitleNativeBlurred, settings.interfaceLanguage)
            : '';
    }

    private applyRenderedPrimarySubtitle(primary: ReturnType<typeof renderSubtitlePrimary>, text: string): void {
        this.applyRenderedPrimaryKaraoke(primary);
        this.fitSubtitleTextToVideo();
        this.cacheRenderedPrimarySubtitle(primary);
        this.requestParsedPrimaryIfNeeded(primary, text);
    }

    private applyRenderedPrimaryKaraoke(primary: ReturnType<typeof renderSubtitlePrimary>): void {
        const activeCue = this.currentCue;
        if (primary.karaokeActive && activeCue) this.applyKaraokeStateToPrimary(activeCue, this.video?.currentTime ?? activeCue.start);
    }

    private cacheRenderedPrimarySubtitle(primary: ReturnType<typeof renderSubtitlePrimary>): void {
        if (!primary.nextRenderedPrimary) return;
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
        const cached = this.parsedHtmlCache.get(key);
        if (cached) {
            const root = this.replacePrimaryHtml(cached, serial);
            if (root) this.notifyParsedTokensForKey(key, true, [root]);
            return;
        }

        try {
            const html = await this.parseCueHtml(text, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });
            this.applyParsedPrimaryHtml(key, text, html, serial);
        } catch {
            // Keep plain selectable subtitles if JPDB is unavailable.
        }
    }

    private replacePrimaryHtml(html: string, serial: number): HTMLElement | null {
        if (serial !== this.renderSerial) return null;
        const primary = this.subtitleEl?.querySelector('.jpdb-subtitle-primary');
        if (primary) {
            const currentCue = this.currentCue ?? null;
            const shouldSyncKaraoke = this.shouldRenderKaraokePrimary(primary, currentCue);
            const shouldRenderPlainKaraoke = shouldSyncKaraoke && !parsedSubtitleHtmlHasReaderWords(html);
            const replacement = this.primaryReplacementHtml(html, currentCue, shouldRenderPlainKaraoke);
            setInnerHtml(primary, replacement);
            // Keep the applied-html cache aligned with the live DOM so the
            // next composed render() is a no-op and the freshly applied state
            // colors survive instead of being rebuilt away.
            this.lastAppliedSubtitleHtml = `<div class="jpdb-subtitle-primary">${replacement}</div>${this.renderSecondarySubtitle(this.options.getSettings())}`;
            this.syncKaraokePrimary(currentCue, shouldSyncKaraoke);
            this.fitSubtitleTextToVideo();
            return primary as HTMLElement;
        }
        return null;
    }

    private shouldRenderKaraokePrimary(primary: Element, currentCue: SubtitleCue | null): boolean {
        return Boolean(this.options.getSettings().subtitleKaraokeMode
            && currentCue
            && cueHasExactWordTimings(currentCue)
            && normalizedSubtitleText(primary.textContent) === normalizedSubtitleText(currentCue.text));
    }

    private primaryReplacementHtml(html: string, currentCue: SubtitleCue | null, shouldKaraoke: boolean): string {
        return shouldKaraoke && currentCue && !html.includes('jpdb-reader-word')
            ? renderSubtitleKaraokeCue(currentCue, this.video?.currentTime ?? currentCue.start)
            : html;
    }

    private syncKaraokePrimary(currentCue: SubtitleCue | null, shouldKaraoke: boolean): void {
        if (!shouldKaraoke || !currentCue) return;
        this.applyKaraokeStateToPrimary(currentCue, this.video?.currentTime ?? currentCue.start);
    }

    private shouldParseSubtitles(settings = this.options.getSettings()): boolean {
        return canParseSubtitleTranscriptRows(settings);
    }

    private parseCacheKey(text: string, settings = this.options.getSettings()): string {
        return [
            subtitleParseSourceSignature(settings),
            settings.showFurigana,
            settings.furiganaMode,
            settings.hideKnownFurigana,
            settings.wordHighlightColorSource,
            settings.wordUnderlineColorSource,
            settings.wordTextColorSource,
            settings.subtitleHighlightColorSource,
            settings.subtitleUnderlineColorSource,
            settings.subtitleTextColorSource,
            text,
        ].join(':');
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
            this.rememberParsedCueHtml(key, html, tokens);
            return html;
        })();
        this.pendingParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            this.pendingParsedHtml.delete(key);
        }
    }

    private async parseAuthoritativeCueHtml(text: string, settings: ReaderSettings, key: string): Promise<string> {
        this.ensureAuthoritativeParsedCueHtml(text, settings, key);
        const pending = this.pendingParsedHtml.get(key);
        if (pending) return pending;
        const cached = this.cachedParsedCueHtml(key, settings);
        if (cached) return cached;
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text, authoritativeSubtitleParseOptions());
            await this.beforeRenderParsedTokens(tokens);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            this.rememberParsedCueHtml(key, html, tokens, { forceNotify: true });
            this.applyAuthoritativeParsedCueHtml(key, text, html);
            return html;
        })();
        this.pendingParsedHtml.set(key, promise);
        try {
            return await promise;
        } finally {
            if (this.pendingParsedHtml.get(key) === promise) this.pendingParsedHtml.delete(key);
        }
    }

    private async parseProvisionalCueHtml(text: string, settings: ReaderSettings, key: string, options: ParseCueHtmlOptions = {}): Promise<string> {
        const restored = this.restoreSessionParsedCueHtml(key);
        if (restored) return restored;
        const shouldUpgradeAuthoritative = options.authoritativeUpgrade !== false;
        const cached = this.provisionalParsedHtmlCache.get(key);
        const cachedIsEnriched = this.enrichedProvisionalParsedHtmlKeys.has(key);
        if (cached
            && (!options.refreshProvisional || cachedIsEnriched)
            && (!options.requireEnrichedProvisional || cachedIsEnriched)) {
            if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return cached;
        }
        const pending = options.refreshProvisional
            ? options.requireEnrichedProvisional ? undefined : this.pendingProvisionalParsedHtml.get(key)
            : this.pendingParsedCueHtml(key, 'provisional');
        if (pending) {
            const html = await pending;
            if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return html;
        }
        const promise = (async () => {
            const tokens = await this.options.parseJapanese(text, provisionalSubtitleParseOptions());
            if (options.enrichBeforeRender) await this.beforeRenderParsedTokens(tokens);
            const html = withBreaks(renderTokensToHtml(text, tokens, settings));
            this.rememberParsedCueHtml(key, html, tokens, { provisional: true, enriched: this.shouldMarkCueEnriched(key, tokens, options.enrichBeforeRender === true) });
            return html;
        })();
        this.pendingProvisionalParsedHtml.set(key, promise);
        try {
            const html = await promise;
            if (shouldUpgradeAuthoritative) this.ensureAuthoritativeParsedCueHtml(text, settings, key);
            return html;
        } finally {
            this.pendingProvisionalParsedHtml.delete(key);
        }
    }

    private ensureEnrichedProvisionalParsedCueHtml(text: string, settings: ReaderSettings, key: string): void {
        if (this.enrichedProvisionalParsedHtmlKeys.has(key) || this.pendingProvisionalParsedHtml.has(key)) return;
        void this.parseProvisionalCueHtml(text, settings, key, {
            authoritativeUpgrade: false,
            enrichBeforeRender: true,
            requireEnrichedProvisional: true,
            refreshProvisional: true,
        }).then(html => {
            if (!this.enrichedProvisionalParsedHtmlKeys.has(key)) return;
            this.updateTranscriptRowsForParseKey(key, html, { provisional: true, force: true });
            if (this.currentPrimaryParseCacheKey() === key) this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
        }).catch(() => undefined);
    }

    private ensureAuthoritativeParsedCueHtml(text: string, settings: ReaderSettings, key: string): void {
        this.ensureAuthoritativeParsedCueHtmlBatch([{ text, key }], settings);
    }

    private ensureAuthoritativeParsedCueHtmlBatch(items: SubtitleParseBatchItem[], settings: ReaderSettings): void {
        // Without an API credential there is no authoritative tier to upgrade
        // to; the provisional parse is the final result for both surfaces.
        if (!this.hasAuthoritativeParseTier(settings)) return;
        const missing = items.filter(item => this.cachedParsedCueHtml(item.key, settings) === undefined && !this.pendingParsedHtml.has(item.key));
        if (!missing.length) return;
        const parsed = this.options.parseJapaneseBatch
            ? this.options.parseJapaneseBatch(missing.map(item => item.text), authoritativeSubtitleParseOptions())
            : Promise.all(missing.map(item => this.options.parseJapanese(item.text, authoritativeSubtitleParseOptions())));
        const enriched = this.enrichParsedTokenBatchBeforeRender(parsed);
        const parsedHtml = missing.map((item, index) => enriched.then(tokens => {
            const tokenList = tokens[index] ?? [];
            const html = withBreaks(renderTokensToHtml(item.text, tokenList, settings));
            this.rememberParsedCueHtml(item.key, html, tokenList, { forceNotify: true });
            this.applyAuthoritativeParsedCueHtml(item.key, item.text, html);
            return html;
        }));
        missing.forEach((item, index) => this.pendingParsedHtml.set(item.key, parsedHtml[index]));
        void Promise.allSettled(parsedHtml).finally(() => {
            missing.forEach((item, index) => {
                if (this.pendingParsedHtml.get(item.key) === parsedHtml[index]) this.pendingParsedHtml.delete(item.key);
            });
        });
    }

    private applyAuthoritativeParsedCueHtml(key: string, text: string, html: string): void {
        this.updateTranscriptRowsForParseKey(key, html);
        if (this.currentPrimaryParseCacheKey() !== key) return;
        this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
    }

    // Late token enrichment (public jpdb pitch lookups, fallback-vocabulary
    // resolution) mutates the cached token objects AFTER their cue html was
    // baked. Re-baking the cached html keeps every re-render — Previous/Next
    // steps, transcript rows, session restores — pre-coloured with the
    // enriched pitch and word state instead of silently dropping it on the
    // next cache hit (UT-66).
    refreshParsedCueTexts(texts: string[]): void {
        if (!texts.length) return;
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
        const tokens = this.parsedTokenCache.get(key);
        if (!tokens?.length) return;
        const provisional = !this.parsedHtmlCache.has(key) && this.provisionalParsedHtmlCache.has(key);
        const previous = provisional ? this.provisionalParsedHtmlCache.get(key) : this.parsedHtmlCache.get(key);
        if (previous === undefined) return;
        const html = withBreaks(renderTokensToHtml(text, tokens, settings));
        if (html === previous) return;
        this.rememberParsedCueHtml(key, html, tokens, provisional ? { provisional: true, enriched: true } : {});
        this.updateTranscriptRowsForParseKey(key, html, { provisional, force: true });
        if (this.currentPrimaryParseCacheKey() !== key) return;
        this.applyParsedPrimaryHtml(key, text, html, ++this.renderSerial);
    }

    private applyParsedPrimaryHtml(key: string, text: string, html: string, serial: number): void {
        const root = this.replacePrimaryHtml(html, serial);
        this.lastRenderedPrimaryKey = key;
        this.lastRenderedPrimaryText = text;
        this.lastRenderedPrimaryHtml = html;
        if (root) this.notifyParsedTokensForKey(key, true, [root]);
    }

    private currentPrimaryParseCacheKey(): string {
        const text = this.currentCue?.text.trim() ?? '';
        return text ? this.parseCacheKey(text, this.options.getSettings()) : '';
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
                ?? (this.hasAuthoritativeParseTier(settings) ? undefined : this.provisionalParsedHtmlCache.get(key)),
            key => this.pendingParsedCueHtml(key, 'authoritative'),
        );
        if (!batch.length) return Promise.all(ready);
        if (!this.options.parseJapaneseBatch) {
            return Promise.all([...ready, ...batch.map(async item => ({
                key: item.key,
                html: await this.parseCueHtml(item.text, settings, options),
            }))]);
        }

        const parsed = this.options.parseJapaneseBatch(batch.map(item => item.text), this.finalSubtitleParseOptions(settings));
        const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { enrichBeforeRender: options.enrichBeforeRender });
        return await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingParsedHtml);
    }

    private async parseAuthoritativeCueHtmlBatch(items: SubtitleParseBatchItem[], settings: ReaderSettings): Promise<ParsedSubtitleHtmlResult[]> {
        if (!items.length) return [];
        this.ensureAuthoritativeParsedCueHtmlBatch(items, settings);
        return await Promise.all(items.map(async item => {
            const cached = this.cachedParsedCueHtml(item.key, settings);
            if (cached) return { key: item.key, html: cached };
            const pending = this.pendingParsedHtml.get(item.key);
            return { key: item.key, html: pending ? await pending : await this.parseAuthoritativeCueHtml(item.text, settings, item.key) };
        }));
    }

    private async parseCueHtmlBatchWithProvisionalFallback(
        items: SubtitleParseBatchItem[],
        settings: ReaderSettings,
        options: ParseCueHtmlOptions = {},
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const shouldUpgradeAuthoritative = options.authoritativeUpgrade !== false;
        const { ready, batch } = planProvisionalSubtitleParseBatch(
            items,
            key => this.parsedHtmlCache.get(key),
            key => this.usableProvisionalParsedHtml(key, options),
            key => options.refreshProvisional ? undefined : this.pendingParsedCueHtml(key, 'provisional'),
            key => this.freshEmptyParsedHtml(key),
        );
        if (shouldUpgradeAuthoritative) {
            const batchedItems = new Set(batch);
            this.ensureAuthoritativeParsedCueHtmlBatch(items.filter(item => !batchedItems.has(item)), settings);
        }
        if (!batch.length) return Promise.all(ready);
        const parsed = this.options.parseJapaneseBatch
            ? this.options.parseJapaneseBatch(batch.map(item => item.text), provisionalSubtitleParseOptions())
            : Promise.all(batch.map(item => this.options.parseJapanese(item.text, provisionalSubtitleParseOptions())));
        const parsedHtml = this.renderParsedHtmlBatch(batch, parsed, settings, { provisional: true, enrichBeforeRender: options.enrichBeforeRender });
        const results = await this.resolveParsedHtmlBatch(ready, batch, parsedHtml, this.pendingProvisionalParsedHtml);
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
            this.rememberParsedCueHtml(item.key, html, tokenList, { ...options, enriched: this.shouldMarkCueEnriched(item.key, tokenList, options.enrichBeforeRender === true) });
            return options.provisional ? { key: item.key, html, provisional: true } : { key: item.key, html };
        }));
    }

    private async enrichParsedTokenBatchBeforeRender(parsed: Promise<JPDBToken[][]>): Promise<JPDBToken[][]> {
        const tokenRows = await parsed;
        await this.beforeRenderParsedTokens(tokenRows.flat());
        return tokenRows;
    }

    private async beforeRenderParsedTokens(tokens: JPDBToken[]): Promise<void> {
        if (!tokens.length || !this.options.beforeRenderTokens) return;
        await this.options.beforeRenderTokens(tokens);
    }

    private async resolveParsedHtmlBatch(
        ready: Promise<ParsedSubtitleHtmlResult>[],
        batch: SubtitleParseBatchItem[],
        parsedHtml: Promise<ParsedSubtitleHtmlResult>[],
        pendingCache: Map<string, Promise<string>>,
    ): Promise<ParsedSubtitleHtmlResult[]> {
        const pendingHtml = parsedHtml.map(promise => promise.then(result => result.html));
        batch.forEach((item, index) => pendingCache.set(item.key, pendingHtml[index]));
        try {
            return await Promise.all([...ready, ...parsedHtml]);
        } finally {
            batch.forEach((item, index) => {
                if (pendingCache.get(item.key) === pendingHtml[index]) pendingCache.delete(item.key);
            });
        }
    }

    private usableProvisionalParsedHtml(key: string, options: Pick<ParseCueHtmlOptions, 'refreshProvisional' | 'requireEnrichedProvisional'>): string | undefined {
        const html = this.provisionalParsedHtmlCache.get(key);
        if (!html) return undefined;
        if ((options.refreshProvisional || options.requireEnrichedProvisional) && !this.enrichedProvisionalParsedHtmlKeys.has(key)) return undefined;
        return html;
    }

    // A cue is only "fully enriched" when every kanji-bearing token can render
    // furigana (explicit rubies, or a usable kana reading != surface). A
    // fallback token whose public lookup has not resolved yet leaves the cue
    // re-hydratable, so a later pass (e.g. after orientationchange/resize) can
    // retry it instead of the enriched-once flag freezing the missing furigana
    // forever. Local/authoritative tokens are final and never block. Mirrors
    // sourceTokenRubies (dom/index.ts).
    private tokensFullyEnriched(tokens: JPDBToken[]): boolean {
        return tokens.every(token => {
            if (token.rubies.length) return true;
            const surface = token.card.spelling || '';
            if (!SUBTITLE_FURIGANA_KANJI_RE.test(surface)) return true;
            if (token.card.source !== 'fallback') return true;
            const reading = token.card.reading.trim();
            return Boolean(reading) && reading !== surface && SUBTITLE_FURIGANA_KANA_RE.test(reading);
        });
    }

    // Decide whether a freshly parsed provisional cue is "enriched" (sticky, no
    // re-hydration). A fully-resolved cue is sticky immediately. A cue that
    // still has an unresolved fallback kanji word is left re-hydratable so a
    // later pass can retry — but only up to a bounded number of attempts, after
    // which it settles to bare to avoid re-requesting an unresolvable word on
    // every hydration tick.
    private shouldMarkCueEnriched(key: string, tokens: JPDBToken[], enrichRequested: boolean): boolean {
        if (!enrichRequested) return false;
        if (this.tokensFullyEnriched(tokens)) {
            this.incompleteEnrichmentAttempts.delete(key);
            return true;
        }
        const attempts = (this.incompleteEnrichmentAttempts.get(key) ?? 0) + 1;
        if (attempts >= SUBTITLE_INCOMPLETE_ENRICHMENT_RETRY_LIMIT) {
            this.incompleteEnrichmentAttempts.delete(key);
            return true;
        }
        if (this.incompleteEnrichmentAttempts.size >= SUBTITLE_PARSE_CACHE_MAX_ENTRIES) {
            this.incompleteEnrichmentAttempts.delete(this.incompleteEnrichmentAttempts.keys().next().value ?? '');
        }
        this.incompleteEnrichmentAttempts.set(key, attempts);
        return false;
    }

    private rememberParsedCueHtml(key: string, html: string, tokens: JPDBToken[] = [], options: { provisional?: boolean; forceNotify?: boolean; enriched?: boolean } = {}): void {
        if (parsedSubtitleHtmlHasReaderWords(html)) {
            if (options.provisional) {
                this.provisionalParsedHtmlCache.set(key, html);
                if (options.enriched) this.enrichedProvisionalParsedHtmlKeys.add(key);
                else this.enrichedProvisionalParsedHtmlKeys.delete(key);
            }
            else {
                this.parsedHtmlCache.set(key, html);
                this.provisionalParsedHtmlCache.delete(key);
                this.enrichedProvisionalParsedHtmlKeys.delete(key);
            }
            // UT-48: refreshing the page must keep parsed ruby. Keyless cheap
            // warmup is provisional-only; persist it only after visible
            // enrichment has rebaked furigana/pitch into the HTML.
            if (!options.provisional || (!this.hasAuthoritativeParseTier() && options.enriched)) this.persistSessionParsedCueHtml(key, html);
            this.emptyParsedHtmlCache.delete(key);
            if (tokens.length) this.parsedTokenCache.set(key, tokens);
            this.pruneParsedSubtitleCaches();
        } else {
            // Provisional empties are cached too: keyless they ARE the final
            // tier (re-parsing every tick rendered word-less cues as a
            // perpetual loading shimmer), keyed the authoritative upgrade is
            // already in flight and overwrites this entry when it lands.
            this.emptyParsedHtmlCache.set(key, { html, expiresAt: Date.now() + SUBTITLE_EMPTY_PARSE_RETRY_MS });
            this.pruneParsedSubtitleCaches();
        }
    }

    private pruneParsedSubtitleCaches(): void {
        const limit = this.parsedSubtitleCacheLimit();
        this.pruneParsedSubtitleCache(this.parsedHtmlCache, limit);
        this.pruneParsedSubtitleCache(this.provisionalParsedHtmlCache, limit);
        while (this.emptyParsedHtmlCache.size > SUBTITLE_PARSE_CACHE_MIN_ENTRIES) this.deleteParsedSubtitleKey(this.emptyParsedHtmlCache.keys().next().value ?? '');
        while (this.parsedTokenCache.size > limit) this.deleteParsedSubtitleKey(this.parsedTokenCache.keys().next().value ?? '');
    }

    private parsedSubtitleCacheLimit(): number {
        const transcriptRows = this.cues.filter(cue => cue.transcriptEligible !== false).length;
        return Math.min(
            SUBTITLE_PARSE_CACHE_MAX_ENTRIES,
            Math.max(SUBTITLE_PARSE_CACHE_MIN_ENTRIES, transcriptRows + SUBTITLE_PARSE_CACHE_TRANSCRIPT_HEADROOM),
        );
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

    // UT-48 session persistence: parsed cue html survives reloads of the
    // same video/session. Quota errors and disabled storage degrade to the
    // in-memory caches silently.
    private persistSessionParsedCueHtml(key: string, html: string): void {
        try {
            sessionStorage.setItem(`${SUBTITLE_SESSION_PARSE_CACHE_PREFIX}${subtitleSessionParseHash(key)}`, JSON.stringify({ at: Date.now(), html }));
        } catch {
            // Storage full or unavailable — in-memory cache still applies.
        }
    }

    private restoreSessionParsedCueHtml(key: string): string | undefined {
        if (this.sessionParseCacheChecked.has(key)) return undefined;
        this.sessionParseCacheChecked.add(key);
        try {
            const raw = sessionStorage.getItem(`${SUBTITLE_SESSION_PARSE_CACHE_PREFIX}${subtitleSessionParseHash(key)}`);
            if (!raw) return undefined;
            const value = JSON.parse(raw) as { at?: number; html?: string };
            if (typeof value.html !== 'string' || typeof value.at !== 'number') return undefined;
            if (Date.now() - value.at > SUBTITLE_SESSION_PARSE_CACHE_TTL_MS) return undefined;
            this.parsedHtmlCache.set(key, value.html);
            this.pruneParsedSubtitleCaches();
            return value.html;
        } catch {
            return undefined;
        }
    }

    private pruneParsedSubtitleCache(cache: Map<string, string>, limit = this.parsedSubtitleCacheLimit()): void {
        while (cache.size > limit) this.deleteParsedSubtitleKey(cache.keys().next().value ?? '');
    }

    private deleteParsedSubtitleKey(key: string): void {
        if (!key) return;
        this.parsedHtmlCache.delete(key);
        this.provisionalParsedHtmlCache.delete(key);
        this.emptyParsedHtmlCache.delete(key);
        this.pendingParsedHtml.delete(key);
        this.pendingProvisionalParsedHtml.delete(key);
        this.parsedTokenCache.delete(key);
        this.parsedTokenNotifiedAt.delete(key);
    }

    private notifyParsedTokensForKey(key: string, force = false, roots?: ParentNode[]): void {
        if (!this.options.afterParseTokens) return;
        const tokens = this.parsedTokenCache.get(key);
        if (!tokens?.length) return;
        const now = Date.now();
        const lastNotifiedAt = this.parsedTokenNotifiedAt.get(key) ?? 0;
        if (!force && now - lastNotifiedAt < SUBTITLE_TOKEN_ENRICHMENT_RETRY_MS) return;
        this.parsedTokenNotifiedAt.set(key, now);
        this.options.afterParseTokens(tokens, roots);
    }

    private shouldUseProvisionalSubtitleParse(_settings: ReaderSettings): boolean {
        // The provisional tier (skipJpdb + segmented fallback) is also the
        // keyless parse, so overlay cues render colorised immediately even
        // without an API key instead of waiting on the slow JPDB-timeout path.
        return isYouTubePage();
    }

    private hasFreshEmptyParsedHtml(key: string): boolean {
        return Boolean(this.freshEmptyParsedHtml(key));
    }

    private freshEmptyParsedHtml(key: string): string | undefined {
        const cached = this.emptyParsedHtmlCache.get(key);
        if (!cached) return undefined;
        if (cached.expiresAt > Date.now()) return cached.html;
        this.emptyParsedHtmlCache.delete(key);
        return undefined;
    }

    private warmParseAroundActiveCue(): void {
        if (!this.shouldParseSubtitles() || !this.cues.length) return;
        const anchor = this.parseWarmupAnchorIndex();
        this.lastParseWarmupAnchor = anchor;
        const start = Math.max(0, anchor - SUBTITLE_ACTIVE_PREPARSE_BEHIND);
        const end = Math.min(this.cues.length, anchor + SUBTITLE_ACTIVE_PREPARSE_AHEAD + 1);
        const serial = ++this.parseWarmupSerial;
        const settings = this.options.getSettings();
        const texts = this.subtitleWarmupTexts(start, end, settings);
        if (!texts.length) return;
        void (async () => {
            try {
                // Warm ahead with enrichment so upcoming overlay cues do not
                // appear until furigana/pitch-ready HTML is cached.
                await this.parseCueHtmlBatch(texts, settings, { enrichBeforeRender: true, requireEnrichedProvisional: true });
            } catch {
            }
            if (serial !== this.parseWarmupSerial) return;
            if (this.currentCue?.text.trim()) this.render();
        })();
    }

    // A seek that lands between cues has no active cue; anchoring the warmup
    // window at the next upcoming cue (instead of the transcript start) keeps
    // the "active cue + lookahead warm within one turn" guarantee after long
    // seeks in either direction.
    private parseWarmupAnchorIndex(): number {
        const active = this.activeTranscriptIndex();
        if (active >= 0) return active;
        const time = this.video?.currentTime ?? 0;
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
        if (this.cachedParsedCueHtml(key, settings) !== undefined || this.hasFreshEmptyParsedHtml(key)) return true;
        return !this.hasAuthoritativeParseTier(settings) && this.enrichedProvisionalParsedHtmlKeys.has(key);
    }

    private cachedParsedCueHtml(key: string, settings: ReaderSettings): string | undefined {
        const cached = this.parsedHtmlCache.get(key) ?? this.restoreSessionParsedCueHtml(key);
        if (!cached) return undefined;
        if (this.hasAuthoritativeParseTier(settings) && cached.includes('data-card-source="fallback"')) {
            this.parsedHtmlCache.delete(key);
            return undefined;
        }
        return cached;
    }

    // Keyless both tiers produce the same local-tokenizer result, so an
    // in-flight parse on EITHER tier satisfies the other — without this the
    // overlay warmup and the transcript-tail warmup tokenized the same cue
    // twice whenever their windows overlapped.
    private pendingParsedCueHtml(key: string, tier: 'authoritative' | 'provisional'): Promise<string> | undefined {
        const own = tier === 'provisional' ? this.pendingProvisionalParsedHtml.get(key) : this.pendingParsedHtml.get(key);
        if (own || this.hasAuthoritativeParseTier()) return own;
        return tier === 'provisional' ? this.pendingParsedHtml.get(key) : this.pendingProvisionalParsedHtml.get(key);
    }

    private applyEffectiveSubtitleBottom(): void {
        if (!this.root) return;
        this.root.style.setProperty('--subtitle-bottom', `${effectiveSubtitleBottomPercent(this.options.getSettings())}%`);
    }

    private fitSubtitleTextToVideo(): void {
        if (!this.root || !this.subtitleEl) return;
        // The frame just changed size/orientation (reel swipe, rotate, inset):
        // recompute the default bottom clearance for portrait/Shorts here too.
        this.applyEffectiveSubtitleBottom();
        const settings = this.options.getSettings();
        const target = subtitleFrameTargetFontSize(this.root, settings);
        let fitted = target;
        this.root.style.setProperty('--subtitle-font-size-target', `${target}px`);
        this.root.style.setProperty('--subtitle-secondary-font-size', `${subtitleSecondaryFontSize(target)}px`);
        this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
        const primary = this.subtitleEl.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary) return;
        const minimum = Math.max(subtitleMinimumFontSize(this.root), Math.round(target * 0.9));
        fitted = this.fitPrimarySubtitleFontSize(fitted, minimum);
        this.root.style.setProperty('--subtitle-font-size', `${fitted}px`);
    }

    private fitPrimarySubtitleFontSize(fitted: number, minimum: number): number {
        if (!this.root || !this.subtitleEl) return fitted;
        const secondaryLines = Array.from(this.subtitleEl.querySelectorAll<HTMLElement>('.jpdb-subtitle-secondary'));
        const previousDisplay = secondaryLines.map(element => element.style.display);
        for (const element of secondaryLines) element.style.display = 'none';
        try {
            return fittedSubtitleFontSize(this.subtitleEl, fitted, minimum, value => {
                this.root?.style.setProperty('--subtitle-font-size', `${value}px`);
            });
        } finally {
            secondaryLines.forEach((element, index) => { element.style.display = previousDisplay[index] ?? ''; });
        }
    }

    private applyKaraokeStateToPrimary(cue: SubtitleCue, time: number): void {
        const state = this.primaryKaraokeState(cue);
        if (!state) {
            this.lastKaraokeProgressKey = undefined;
            this.lastKaraokePrimaryWord = undefined;
            return;
        }

        const progress = karaokeCharacterProgress(cue, state.words, time);
        const progressKey = Math.floor(progress);
        const primaryWord = state.wordElements[0] ?? null;
        // The sampler runs this every presented frame, but karaoke classes only
        // flip when the integer character progress crosses a word boundary. Skip
        // the per-word classList churn while neither the progress bucket nor the
        // rendered primary (a re-render makes new word elements) has changed.
        if (progressKey === this.lastKaraokeProgressKey && primaryWord === this.lastKaraokePrimaryWord) return;
        this.lastKaraokeProgressKey = progressKey;
        this.lastKaraokePrimaryWord = primaryWord;

        let cursor = 0;
        for (const element of state.wordElements) {
            cursor = applyKaraokeClassToWordElement(element, cursor, progress);
        }
    }

    private primaryKaraokeState(cue: SubtitleCue): { words: SubtitleWordTiming[]; wordElements: HTMLElement[] } | null {
        const primary = this.subtitleEl?.querySelector<HTMLElement>('.jpdb-subtitle-primary');
        if (!primary || !cueHasExactWordTimings(cue)) return null;
        const words = cue.words;
        const wordElements = Array.from(primary.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        return words.length && wordElements.length ? { words, wordElements } : null;
    }

    private handleClick(event: MouseEvent): void {
        const eventTarget = event.target as HTMLElement;
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
        this.showControlsTemporarily();

        const handler = this.clickHandlers[action];
        if (!handler) return;
        handler(target);
        if (event.detail > 0) target.closest<HTMLButtonElement>('button')?.blur();
        if (action !== 'menu') this.syncControls();
    }

    private handleTranscriptPanelClick(event: MouseEvent): void {
        this.handleClick(event);
        event.stopPropagation();
    }

    private handleSubtitleStyleInput(event: Event): void {
        const target = event.target instanceof HTMLElement
            ? event.target.closest<HTMLInputElement | HTMLSelectElement>('[data-subtitle-style-setting]')
            : null;
        if (!target || !this.root?.contains(target)) return;
        event.stopPropagation();
        if (!this.applySubtitleStyleControlValue(target)) return;
        this.syncRootStyleSettings(this.options.getSettings());
        this.syncSubtitleStyleControls();
        this.render();
        this.options.onSettingsChange();
        this.showControlsTemporarily();
    }

    private stopTranscriptPanelPropagation(event: Event): void {
        event.stopPropagation();
    }

    private stopSubtitleStylePopoverPropagation(event: Event): void {
        event.stopPropagation();
        this.showControlsTemporarily();
    }

    private handleTranscriptPanelKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape' && this.panelOptionsMenuOpen) {
            event.preventDefault();
            event.stopPropagation();
            this.closePanelOptionsMenu();
            this.transcriptPanel?.querySelector<HTMLButtonElement>('[data-action="panel-options"]')?.focus();
            return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const target = event.target as HTMLElement;
        if (target.closest('button, input, [data-resize-transcript], .jpdb-reader-word')) return;
        const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row[data-row-index]');
        if (!row) return;
        event.preventDefault();
        event.stopPropagation();
        this.seekToTranscriptRow(this.rowIndexFromTarget(row));
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
            this.lastAutoCopiedCueSignature = '';
            this.lastRenderedPrimaryText = '';
            this.lastRenderedPrimaryHtml = '';
            this.lastAppliedSubtitleHtml = '';
            this.renderSerial += 1;
            this.parseWarmupSerial += 1;
            this.lastParseWarmupAnchor = -1;
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
        this.options.onSettingsChange();
        if (this.panelMode === 'tracks' || !this.hasTranscriptSurface()) this.renderOpenSubtitlePanel();
        else {
            this.lastTranscriptSignature = '';
            this.syncPanelPlacementButtons();
        }
        this.clearVideoInsetForTranscriptPanel();
        this.positionTranscriptPanel({ realignAfterInset: true });
        this.syncControls();
    }

    private applySubtitleStyleControlValue(control: HTMLInputElement | HTMLSelectElement): boolean {
        const settings = this.options.getSettings();
        const setting = control.dataset.subtitleStyleSetting;
        if (setting === 'subtitleFontSize') return updateNumberSetting(settings, 'subtitleFontSize', control.value, 16, 64);
        if (setting === 'subtitleFontWeight') return updateNumberSetting(settings, 'subtitleFontWeight', control.value, 300, 900);
        if (setting === 'subtitleBottomOffset') return updateNumberSetting(settings, 'subtitleBottomOffset', control.value, 2, 40);
        if (setting === 'subtitleBackgroundOpacity') return updateNumberSetting(settings, 'subtitleBackgroundOpacity', control.value, 0, 0.7);
        if (setting === 'subtitleFontFamily') {
            const next = SUBTITLE_STYLE_FONT_FAMILY_VALUES.includes(control.value)
                ? control.value
                : settings.subtitleFontFamily;
            if (settings.subtitleFontFamily === next) return false;
            settings.subtitleFontFamily = next;
            return true;
        }
        if (setting === 'subtitleHoverPause' && control instanceof HTMLInputElement) {
            if (settings.subtitleHoverPause === control.checked) return false;
            settings.subtitleHoverPause = control.checked;
            return true;
        }
        if (setting === 'subtitleMiningPause' && control instanceof HTMLInputElement) {
            if (settings.subtitleMiningPause === control.checked) return false;
            settings.subtitleMiningPause = control.checked;
            return true;
        }
        return false;
    }

    private resetSubtitleStyleDefaults(): void {
        const settings = this.options.getSettings();
        let changed = false;
        const reset = <Key extends keyof ReaderSettings>(key: Key): void => {
            if (settings[key] === DEFAULT_SETTINGS[key]) return;
            settings[key] = DEFAULT_SETTINGS[key];
            changed = true;
        };
        reset('subtitleFontSize');
        reset('subtitleFontWeight');
        reset('subtitleBottomOffset');
        reset('subtitleBackgroundOpacity');
        reset('subtitleFontFamily');
        reset('subtitleMiningPause');
        reset('subtitleHoverPause');
        this.resetLegacySubtitleDragOffset();
        this.syncRootStyleSettings(settings);
        this.syncSubtitleStyleControls();
        this.render();
        if (changed) this.options.onSettingsChange();
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
        this.syncPointerActivity(event.clientX, event.clientY);
    }

    private syncPointerActivity(clientX: number, clientY: number): void {
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
            startBottomOffset: this.options.getSettings().subtitleBottomOffset,
            referenceHeight: this.subtitlePositionReferenceHeight(dragFrame),
            bounds: this.subtitleDragOffsetBounds(dragFrame),
            lastClientY: startY,
        };
        this.subtitleDragActive = true;
        handle.classList.add('jpdb-subtitle-dragging');
        dragRoot?.classList.add('jpdb-subtitle-dragging');
        if (dragRoot !== this.root) this.root?.classList.add('jpdb-subtitle-dragging');
        document.documentElement.classList.add('jpdb-subtitle-dragging');
        this.showControlsDuringSubtitleDrag();
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
        this.showControlsTemporarily();
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
        this.showControlsDuringSubtitleDrag();
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
        this.setSubtitleBottomOffset(this.options.getSettings().subtitleBottomOffset - (deltaY / this.subtitlePositionReferenceHeight(dragFrame)) * 100);
    }

    private setSubtitleBottomOffset(value: number): void {
        if (!Number.isFinite(value)) return;
        const settings = this.options.getSettings();
        const next = this.clampedSubtitleBottomOffset(value);
        if (settings.subtitleBottomOffset === next) return;
        settings.subtitleBottomOffset = next;
        this.applyEffectiveSubtitleBottom();
        this.syncSubtitleStyleControls();
        this.options.onSettingsChange();
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

    // Reproject the remembered nudge (a viewport-height fraction) into pixels
    // against the current viewport. Runs on first install, on video changes, and
    // on every viewport/fullscreen change (via syncFullscreenState) so the line
    // keeps its relative position when the player resizes, rotates, or enters
    // fullscreen instead of staying frozen at the old pixel magnitude. Skipped
    // mid-drag so it never fights the gesture the user is performing.
    private restoreSubtitleDragOffset(): void {
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
        return Math.round(Math.min(Math.max(value, 2), 40));
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
        handle.setAttribute('aria-label', moveLabel);
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

    private showControlsTemporarily(): void {
        if (!this.root) return;
        this.root.classList.remove('jpdb-subtitle-controls-idle');
        this.syncAsbPlayerSubtitleMoveHandles();
        this.scheduleControlsIdle();
    }

    private showControlsDuringSubtitleDrag(): void {
        if (!this.root) return;
        this.root.classList.remove('jpdb-subtitle-controls-idle');
        this.scheduleControlsIdle();
    }

    private hideControlsImmediately(): void {
        this.clearControlsIdleTimer();
        if (!this.root || !this.shouldAutoIdleControls()) return;
        this.root.classList.add('jpdb-subtitle-controls-idle');
        this.syncAsbPlayerSubtitleMoveHandles();
    }

    private scheduleControlsIdle(): void {
        this.clearControlsIdleTimer();
        if (!this.shouldAutoIdleControls()) return;
        this.controlsIdleTimer = window.setTimeout(() => {
            this.controlsIdleTimer = undefined;
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
        return Boolean(this.root?.matches(':focus-within'));
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

    private videoPlayerChromeHidden(): boolean {
        // m.youtube.com renders its controls in #player-control-overlay and
        // toggles a fadein class; the desktop ytp-* classes never appear there.
        const mobileOverlay = document.querySelector<HTMLElement>('#player-control-overlay');
        if (mobileOverlay) return !mobileOverlay.classList.contains('fadein');
        const player = this.video?.closest<HTMLElement>('#movie_player, .html5-video-player');
        return Boolean(player?.classList.contains('ytp-autohide')
            || player?.classList.contains('ytp-hide-controls')
            || player?.classList.contains('ytp-player-minimized'));
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
        if (isEditableTarget(event.target)) return;
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

    // Rail OCR button: pause first (reading needs a still frame), then ask the
    // OCR controller for a manual paused-frame snapshot — works even when the
    // automatic ocrVideoPauseFrames setting is off.
    private requestVideoFrameOcr(): void {
        const video = this.video;
        if (!video) return;
        if (!video.paused) {
            const player = this.youTubePlayerApi(video);
            if (player?.pauseVideo) player.pauseVideo();
            else video.pause();
            this.armPlaybackPauseReassert(video);
        }
        document.dispatchEvent(new CustomEvent('yomu-ocr-video-frame-request', { detail: { video } }));
    }

    private toggleVideoPlayback(): void {
        const video = this.video;
        if (!video) return;
        const player = this.youTubePlayerApi(video);
        if (video.paused) {
            this.clearPlaybackPauseReassert();
            if (player?.playVideo) player.playVideo();
            else void video.play().catch(() => undefined);
        } else {
            if (player?.pauseVideo) player.pauseVideo();
            else video.pause();
            this.armPlaybackPauseReassert(video);
        }
        this.syncControls();
    }

    // YouTube's #movie_player exposes its player API on the element in the
    // page world. Routing pause/play/seek through it keeps YT's own state
    // machine in agreement — a raw currentTime write triggers a re-buffer YT
    // can bounce, and a raw pause() gets reactively re-played. Feature-detected
    // so embeds, mobile hosts, isolated-world extension builds, and every
    // non-YouTube site keep the raw HTMLMediaElement path.
    private youTubePlayerApi(video: HTMLVideoElement): YouTubePlayerApi | null {
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

    private togglePlayerFullscreen(): void {
        const video = this.video;
        if (!video) return;
        if (this.isFullscreenActive()) {
            this.exitPlayerFullscreen();
            return;
        }
        const target = this.fullscreenRequestTarget(video);
        if (target && target !== video) {
            if (canRequestElementFullscreen(target)) void Promise.resolve(requestElementFullscreen(target)).catch(() => this.enterInlinePlayerFullscreen(target));
            else this.enterInlinePlayerFullscreen(target);
            return;
        }
        if (canRequestElementFullscreen(video)) void Promise.resolve(requestElementFullscreen(video)).catch(() => this.enterNativeVideoFullscreen(video));
        else this.enterNativeVideoFullscreen(video);
    }

    private exitPlayerFullscreen(): void {
        if (activeInlineFullscreenElement()) {
            exitInlineFullscreen();
            this.syncFullscreenState();
            this.scheduleAlignToVideo();
            this.render();
            return;
        }
        void Promise.resolve(exitCurrentFullscreen()).catch(() => undefined);
    }

    private enterInlinePlayerFullscreen(target: HTMLElement): void {
        enterInlineFullscreen(target);
        this.syncFullscreenState();
        this.scheduleAlignToVideo();
        this.render();
    }

    private fullscreenRequestTarget(video: HTMLVideoElement): HTMLElement {
        return subtitleVideoLayoutTarget(video) ?? video;
    }

    private enterNativeVideoFullscreen(video: HTMLVideoElement): void {
        try {
            const fullscreenVideo = video as FullscreenVideoElement;
            (fullscreenVideo.webkitEnterFullscreen ?? fullscreenVideo.webkitEnterFullScreen)?.call(video);
        } catch {
            // Fullscreen is best-effort across userscript hosts and mobile Safari.
        }
    }

    private isFullscreenActive(): boolean {
        return Boolean(this.fullscreen || currentFullscreenElement() || videoIsInNativeFullscreen(this.video));
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

    // UT-68c: when the Lines list shows only Japanese, each row with an
    // aligned translation gets an eye toggle to peek it.
    private transcriptRowPeekButton(cue: SubtitleCue, index: number, settings: ReaderSettings): string {
        const secondary = findAlignedCue(this.secondaryCues, cue);
        if (!secondary?.text.trim()) return '';
        const label = uiText(settings.interfaceLanguage, 'peekSubtitleTranslation');
        return `<button class="jpdb-subtitle-row-peek" type="button" data-action="peek-row" data-row-index="${index}" aria-pressed="false" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${subtitleIcon('eye')}</button>`;
    }

    private toggleRowTranslationPeek(target: HTMLElement): void {
        const button = target.closest<HTMLElement>('[data-action="peek-row"]');
        const row = target.closest<HTMLElement>('.jpdb-subtitle-list-row');
        if (!button || !row) return;
        const existing = row.querySelector<HTMLElement>('.jpdb-subtitle-row-secondary');
        const language = this.options.getSettings().interfaceLanguage;
        if (existing) {
            existing.remove();
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('title', uiText(language, 'peekSubtitleTranslation'));
            button.setAttribute('aria-label', uiText(language, 'peekSubtitleTranslation'));
            setInnerHtml(button, subtitleIcon('eye'));
            return;
        }
        const cue = this.transcriptRows()[this.rowIndexFromTarget(button)]?.cue;
        const secondary = cue ? findAlignedCue(this.secondaryCues, cue) : undefined;
        if (!secondary?.text.trim()) return;
        const body = row.querySelector<HTMLElement>('.jpdb-subtitle-row-body') ?? row;
        const peek = document.createElement('div');
        peek.className = 'jpdb-subtitle-row-secondary';
        peek.lang = 'en';
        peek.textContent = secondary.text.trim();
        body.append(peek);
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('title', uiText(language, 'hideSubtitleTranslation'));
        button.setAttribute('aria-label', uiText(language, 'hideSubtitleTranslation'));
        setInnerHtml(button, subtitleIcon('eye-off'));
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
        const jobs = subtitleFilePickerJobs(kind, files);
        if (!jobs.length) return;
        await this.loadHostedSubtitleFileJobs({ jobs, openPanel: false });
    }

    private loadSubtitleFilesFromHost(event: Event): void {
        const request = subtitleFilesFromHostEvent(event);
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
        log.info('Subtitle file loaded', { kind, name: file.name, cues: cues.length });
    }

    private async selectTrack(id: string): Promise<void> {
        const requestId = this.preparePrimaryTrackSelection(id);
        this.revealPrimarySubtitleOverlay();
        const loaded = await this.loadPrimaryTrackSelection(id, requestId);
        if (!loaded) return;
        this.applyPrimaryTrackSelection(loaded);
        this.finishPrimaryTrackSelection(id, loaded.track);
    }

    private preparePrimaryTrackSelection(id: string): number {
        const requestId = this.beginTrackSelection('primary');
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
        this.invalidateTrackSelection('secondary');
        this.secondaryTrackId = '';
        this.secondaryCues = [];
        this.secondaryCue = undefined;
    }

    private revealPrimarySubtitleOverlay(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitleOverlayVisible) {
            settings.subtitleOverlayVisible = true;
            this.options.onSettingsChange();
        }
        this.root?.classList.remove('jpdb-subtitle-hidden');
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
        this.markTrackLoading(selected);
        this.setNativeTrackModes();
        const loaded = await loadSubtitleTrackCues(selected, {
            ...TRACK_LOAD_OPTIONS,
            tracks: this.tracks,
            transcriptEligible: request.transcriptEligible,
            translationFallback: this.translationFallbackModeForSelection(request, selected),
        });
        return this.loadedTrackSelection(request, loaded.track, loaded.cues);
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

    private finishPrimaryTrackSelection(id: string, selected: SubtitleTrackOption | undefined): void {
        this.finishTrackSelection('Primary', id, selected, this.cues.length);
    }

    private async selectSecondaryTrack(id: string): Promise<void> {
        const requestId = this.prepareSecondaryTrackSelection(id);
        this.revealSecondarySubtitleOverlay();
        const loaded = await this.loadSecondaryTrackSelection(id, requestId);
        if (!loaded) return;
        this.applySecondaryTrackSelection(loaded);
        this.finishSecondaryTrackSelection(id, loaded.track);
    }

    private prepareSecondaryTrackSelection(id: string): number {
        if (this.selectedTrackId === id) {
            this.suppressYouTubeAutoSelectForCurrentVideo();
            this.invalidateTrackSelection('primary');
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
        const requestId = this.beginTrackSelection('secondary');
        this.secondaryTrackId = id;
        this.secondaryCues = [];
        this.secondaryCue = undefined;
        this.lastShadowSignature = '';
        return requestId;
    }

    private revealSecondarySubtitleOverlay(): void {
        const settings = this.options.getSettings();
        if (!settings.subtitleSecondaryVisible) {
            settings.subtitleSecondaryVisible = true;
            this.options.onSettingsChange();
        }
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

    private finishSecondaryTrackSelection(id: string, selected: SubtitleTrackOption | undefined): void {
        this.finishTrackSelection('Secondary', id, selected, this.secondaryCues.length);
    }

    private finishTrackSelection(role: 'Primary' | 'Secondary', id: string, selected: SubtitleTrackOption | undefined, cues: number): void {
        this.setNativeTrackModes();
        this.updateFromLoadedCues();
        this.warmParseAroundActiveCue();
        this.render();
        this.refreshTranscriptPanelAfterTrackChange();
        this.syncControls();
        log.info(`${role} subtitle track selected`, { id, label: selected?.label ?? '', kind: selected?.kind ?? 'unknown', cues });
    }

    private setNativeTrackModes(): void {
        const settings = this.options.getSettings();
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        this.lastYomuCaptionsActive = applySubtitleNativeTrackModes({
            tracks: this.tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            overlayVisible: settings.subtitleOverlayVisible || this.isTranscriptPanelOpen(),
            suppressNativeCaptions: Boolean(settings.subtitlePlayerEnabled && this.video),
            suppressCaptionPlayerUi: !this.shouldUseDomCaptionFallback(selected),
            video: this.video,
            hasPrimaryCues: Boolean(this.cues.length),
            currentCueText: this.currentCue?.text,
            youtubeDomCaptionFallbackTrackId: this.youtubeDomCaptionFallbackTrackId,
            lastYomuCaptionsActive: this.lastYomuCaptionsActive,
        });
    }

    private async discoverYouTubeTracksThrottled(force = false): Promise<void> {
        if (this.youtubeTrackDiscoveryInFlight) return;
        const now = performance.now();
        const interval = this.tracks.some(track => track.kind === 'youtube') ? 5000 : 1500;
        if (!force && now - this.lastYouTubeTrackDiscoveryAt < interval) return;
        this.lastYouTubeTrackDiscoveryAt = now;
        this.youtubeTrackDiscoveryInFlight = true;
        try {
            await this.discoverYouTubeTracks();
        } finally {
            this.youtubeTrackDiscoveryInFlight = false;
        }
    }

    private async discoverYouTubeTracks(): Promise<void> {
        const hostname = (typeof window !== 'undefined' ? window.location?.hostname : undefined) || '';
        if (!hostname.includes('youtube.com')) return;
        const videoId = getYouTubeVideoId();
        if (!videoId) return;

        this.updateYouTubeDiscoveryVideo(videoId);

        const tracks = await discoverYouTubeCaptionTracks();
        if (!tracks.length) return;

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
        const generated = this.ensureTranslatedJapaneseTrack();
        const autoPrimaryTrack = this.findAutoPrimaryYouTubeTrack();
        const autoSecondaryTrack = this.findAutoSecondaryYouTubeTrack(autoPrimaryTrack?.id);
        const primaryTrackId = autoPrimaryTrack?.id || (this.shouldReloadUpdatedSelectedTrack(updatedSelectedTrack) ? this.selectedTrackId : '');
        if (primaryTrackId) {
            void this.selectTrack(primaryTrackId);
            if (autoSecondaryTrack) void this.selectSecondaryTrack(autoSecondaryTrack.id);
            return;
        }
        if (autoSecondaryTrack) {
            void this.selectSecondaryTrack(autoSecondaryTrack.id);
            return;
        }
        if (!added && !generated) return;
        this.renderTrackPanel();
        this.syncControls();
    }

    private ensureTranslatedJapaneseTrack(): boolean {
        const hasJapanese = this.tracks.some(track => isJapaneseSubtitleTrack(track));
        if (hasJapanese) return false;

        const englishTracks = this.tracks.filter(track => isEnglishSubtitleTrack(track)).sort(compareSubtitleTrackOptions);
        if (!englishTracks.length) return false;

        const source = englishTracks[0];
        const existing = this.tracks.find(t => t.translatedFromTrackId === source.id);
        if (existing) return false;

        const settings = this.options.getSettings();
        const synthetic: SubtitleTrackOption = {
            id: `translated-${source.id}`,
            label: `${uiText(settings.interfaceLanguage, 'translation')} (${source.label})`,
            kind: source.kind,
            language: 'ja',
            autoGenerated: true,
            translatedFromTrackId: source.id,
        };
        this.tracks.push(synthetic);
        return true;
    }

    private shouldReloadUpdatedSelectedTrack(updatedSelectedTrack: boolean): boolean {
        return updatedSelectedTrack && Boolean(this.selectedTrackId);
    }

    private findAutoPrimaryYouTubeTrack(): SubtitleTrackOption | undefined {
        // A synthetic translated selection stays replaceable by a real Japanese track.
        if (this.selectedTrackId && !this.isSyntheticTranslatedSelection()) return undefined;
        if (this.youtubeAutoSelectSuppressedVideoId && this.youtubeAutoSelectSuppressedVideoId === this.youtubeVideoId) return undefined;
        const candidate = [...this.tracks]
            .filter(track => track.kind === 'youtube' && isJapaneseSubtitleTrack(track))
            .sort((a, b) => Number(Boolean(a.translatedFromTrackId)) - Number(Boolean(b.translatedFromTrackId))
                || compareSubtitleTrackOptions(a, b))[0];
        return candidate?.id === this.selectedTrackId ? undefined : candidate;
    }

    private findAutoSecondaryYouTubeTrack(primaryTrackId = this.selectedTrackId): SubtitleTrackOption | undefined {
        if (!primaryTrackId || this.secondaryTrackId) return undefined;
        return [...this.tracks]
            .filter(track => track.kind === 'youtube' && track.id !== primaryTrackId && isEnglishSubtitleTrack(track))
            .sort(compareNativeOverlaySubtitleTrackOptions)[0];
    }

    private syncControls(): void {
        const hasLines = this.hasVisibleSubtitleLines();
        this.root?.classList.toggle('jpdb-subtitle-panel-open', this.isTranscriptPanelOpen());
        this.root?.classList.toggle('jpdb-subtitle-style-open', this.subtitleStylePanelOpen);
        this.root?.classList.toggle('jpdb-subtitle-has-lines', hasLines);
        this.root?.classList.toggle('jpdb-subtitle-has-track', hasSelectedSubtitleTrackOrLines(this.selectedTrackId, hasLines));
        this.syncTranscriptPlacementClass();
        this.syncLineNavigationButtons(hasLines);
        this.syncDrawerButtons(hasLines);
        this.syncSubtitleStyleControls();
        this.syncFullscreenRailButton();
        this.syncVisibilityRailButton();
        this.syncTranscriptAutoScrollPausedClass();
        this.syncStatus();
        this.setNativeTrackModes();
    }

    private hasVisibleSubtitleLines(): boolean {
        return Boolean(this.cues.length || this.currentCue?.text);
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
        this.options.onSettingsChange();
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

    private syncFullscreenRailButton(): void {
        const button = this.root?.querySelector<HTMLButtonElement>('[data-action="fullscreen"]');
        if (!button) return;
        const active = this.isFullscreenActive();
        const label = uiText(this.options.getSettings().interfaceLanguage, active ? 'exitFullscreen' : 'enterFullscreen');
        button.hidden = this.shouldHideFullscreenRailButton();
        button.disabled = !this.video;
        button.title = label;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(active));
        setInnerHtml(button, subtitleIcon(active ? 'fullscreen-exit' : 'fullscreen'));
    }

    private shouldHideFullscreenRailButton(): boolean {
        return Boolean(this.video?.closest('[data-yomu-video-frame]'));
    }

    private syncLineNavigationButtons(hasLines: boolean): void {
        const settings = this.options.getSettings();
        // Prev/next live on the on-video rail AND in the drawer head's playback
        // cluster; only the rail copy is subject to the hidden-controls mode
        // (the drawer is an explicitly opened surface).
        const hideRailNavigation = settings.subtitleControlsMode === 'hidden';
        const language = settings.interfaceLanguage;
        for (const action of ['previous', 'next'] as const) {
            const railButton = this.root?.querySelector<HTMLButtonElement>(`.jpdb-subtitle-rail [data-action="${action}"]`);
            if (railButton) syncSubtitleLineNavigationButton(railButton, action, hasLines, Boolean(this.video), hideRailNavigation, language);
            const drawerButton = this.transcriptPanel?.querySelector<HTMLButtonElement>(`.jpdb-subtitle-drawer-playback [data-action="${action}"]`);
            if (drawerButton) syncSubtitleLineNavigationButton(drawerButton, action, hasLines, Boolean(this.video), false, language);
        }
        const drawerPlayback = this.transcriptPanel?.querySelector<HTMLButtonElement>('.jpdb-subtitle-drawer-playback [data-action="playback"]');
        if (drawerPlayback) {
            syncSubtitlePlaybackButton(drawerPlayback, {
                video: this.video,
                hiddenByNavigation: false,
                hasLines,
                language,
            });
        }
        const playbackButton = this.root?.querySelector<HTMLButtonElement>('.jpdb-subtitle-rail [data-action="playback"]');
        if (playbackButton) {
            syncSubtitlePlaybackButton(playbackButton, {
                video: this.video,
                hiddenByNavigation: settings.subtitleControlsMode === 'hidden',
                hasLines,
                language,
            });
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
            element.classList.toggle('jpdb-subtitle-transcript-right', this.effectiveTranscriptPlacement === 'right');
            element.classList.toggle('jpdb-subtitle-transcript-left', this.effectiveTranscriptPlacement === 'left');
            element.classList.toggle('jpdb-subtitle-transcript-bottom', this.effectiveTranscriptPlacement === 'bottom');
        }
        this.root.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
        if (this.transcriptPanel) this.transcriptPanel.dataset.transcriptPlacement = this.effectiveTranscriptPlacement;
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
        this.clearTranscriptPanelAnimation();
        panel.hidden = true;
        this.syncTranscriptPanelFullscreenDisplayOverride();
        panel.classList.remove('jpdb-subtitle-panel-entering', 'jpdb-subtitle-panel-opened', 'jpdb-subtitle-panel-closing');
        this.transcriptPanelClosing = false;
        this.syncControls();
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
        this.options.onSettingsChange();
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
        const time = this.video.currentTime;
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
        const time = this.video.currentTime;
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
        this.options.onSettingsChange();
        if (!appliedInline) this.render();
        log.info('Native subtitle blur toggled', { blurred: settings.subtitleNativeBlurred });
    }

    private applyNativeSubtitleBlurState(nativeBlurred: boolean, language: ReaderSettings['interfaceLanguage'], target?: HTMLElement | null): boolean {
        const targets = target
            ? [target]
            : Array.from(this.subtitleEl?.querySelectorAll<HTMLElement>('.jpdb-subtitle-secondary[data-action="toggle-native-blur"]') ?? []);
        if (!targets.length) return false;
        for (const button of targets) syncSubtitleSecondaryBlurState(button, nativeBlurred, language);
        this.lastAppliedSubtitleHtml = this.lastAppliedSubtitleHtml
            .split(nativeBlurred ? SUBTITLE_SECONDARY_CLEAR_CLASS : SUBTITLE_SECONDARY_BLURRED_CLASS)
            .join(nativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS);
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
        this.options.onSettingsChange();
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
        this.transcriptUserScrollAt = 0;
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
        const settings = this.options.getSettings();
        const open = this.subtitleStylePanelOpen && settings.subtitleControlsMode !== 'hidden';
        this.root.classList.toggle('jpdb-subtitle-style-open', open);
        const button = this.root.querySelector<HTMLButtonElement>('[data-action="style"]');
        if (button) {
            const label = uiText(settings.interfaceLanguage, 'subtitleStyle');
            button.title = label;
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-expanded', String(open));
        }
        const popover = this.root.querySelector<HTMLElement>('[data-subtitle-style-popover]');
        if (!popover) return;
        popover.hidden = !open;
        syncSubtitleStyleRangeControl(popover, 'subtitleFontSize', settings.subtitleFontSize, 'px');
        syncSubtitleStyleRangeControl(popover, 'subtitleFontWeight', settings.subtitleFontWeight, 'weight');
        syncSubtitleStyleRangeControl(popover, 'subtitleBottomOffset', settings.subtitleBottomOffset, '%');
        syncSubtitleStyleRangeControl(popover, 'subtitleBackgroundOpacity', settings.subtitleBackgroundOpacity, '');
        const fontSelect = popover.querySelector<HTMLSelectElement>('[data-subtitle-style-setting="subtitleFontFamily"]');
        if (fontSelect && fontSelect.value !== settings.subtitleFontFamily) fontSelect.value = settings.subtitleFontFamily;
        const hoverPause = popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleHoverPause"]');
        if (hoverPause) hoverPause.checked = settings.subtitleHoverPause;
        const miningPause = popover.querySelector<HTMLInputElement>('[data-subtitle-style-setting="subtitleMiningPause"]');
        if (miningPause) miningPause.checked = settings.subtitleMiningPause;
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

    private renderTranscriptPanel(force = false): void {
        const panel = this.renderableTranscriptPanel();
        if (!panel) return;
        this.clearDeferredTranscriptPanelRender();
        this.transcriptPreviewPlayerResizeDeferred = false;
        const state = this.transcriptPanelRenderState();
        if (this.canRefreshTranscriptPanel(force, state)) return;
        this.lastTranscriptSignature = state.signature;
        this.renderedVirtualWindow = state.virtual
            ? { start: state.virtual.start, end: state.virtual.end, rowCount: state.totalRowCount ?? state.rows.length }
            : undefined;
        setInnerHtml(panel, this.renderTranscriptPanelHtml(state));
        this.afterTranscriptPanelRender(state);
    }

    private renderTranscriptPanelPreview(): void {
        const panel = this.renderableTranscriptPanel();
        if (!panel) return;
        const fullState = this.transcriptPanelRenderState();
        const state = this.transcriptPanelPreviewState(fullState);
        this.transcriptPreviewPlayerResizeDeferred = true;
        this.lastTranscriptSignature = '';
        setInnerHtml(panel, this.renderTranscriptPanelHtml(state));
        this.afterTranscriptPanelRender(state, { deferPlayerResize: true });
    }

    private renderShadowPanel(force = false): void {
        const panel = this.renderableShadowPanel();
        if (!panel) return;
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
            canShowLines: this.hasTranscriptSurface(),
            options: this.panelOptionsState(state.settings.subtitlePausePanel, language),
        });
    }

    private renderShadowPanelBody(state: ShadowPanelRenderState): string {
        const cueText = state.cue?.text.trim();
        if (!state.cue || !cueText) return this.renderTranscriptWaitingState();
        return this.renderShadowCueCard(state.cue, cueText, state);
    }

    private renderShadowCueCard(cue: SubtitleCue, cueText: string, state: ShadowPanelRenderState): string {
        const language = state.settings.interfaceLanguage;
        const parsedLine = this.shadowParsedLine(cueText, state.parseKey, state.settings);
        const hiddenClass = this.shadowTextVisible ? '' : ' jpdb-subtitle-shadow-line-hidden';
        const secondary = this.renderShadowSecondaryLine(state);
        const neighbors = this.shadowCueNeighbors(cue);
        return `
            <div class="jpdb-subtitle-shadow-card">
                ${this.renderShadowContextLine(neighbors.prev, 'prev', language)}
                <div class="jpdb-subtitle-shadow-current">
                    <span class="jpdb-subtitle-shadow-time">${formatSubtitleTime(cue.start)}-${formatSubtitleTime(cue.end)}</span>
                    <strong class="jpdb-subtitle-shadow-line jpdb-subtitle-row-text${hiddenClass}" lang="ja" data-transcript-text data-parse-key="${escapeHtml(state.parseKey)}"${parsedLine.parsedKeyAttribute}${parsedLine.provisionalAttribute}>${parsedLine.html}</strong>
                    ${secondary}
                </div>
                ${this.renderShadowContextLine(neighbors.next, 'next', language)}
                <div class="jpdb-subtitle-shadow-actions">
                    ${this.renderShadowActions(language)}
                </div>
            </div>
        `;
    }

    // Surrounding lines for context (kotu-style): tappable to jump the loop/focus
    // onto them. Rendered as plain (escaped) text — the parsed/highlighted treatment
    // stays reserved for the focused current line.
    private renderShadowContextLine(cue: SubtitleCue | undefined, direction: 'prev' | 'next', language: ReaderSettings['interfaceLanguage']): string {
        const text = cue?.text.trim();
        if (!cue || !text) return '';
        const japanese = resolveUiLanguage(language) === 'ja';
        const label = direction === 'prev' ? (japanese ? '前の行へ' : 'Previous line') : (japanese ? '次の行へ' : 'Next line');
        return `<button type="button" class="jpdb-subtitle-shadow-context jpdb-subtitle-shadow-context-${direction}" data-action="shadow-goto" data-shadow-goto="${direction}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" lang="ja">${escapeWithBreaks(text)}</button>`;
    }

    private shadowParsedLine(cueText: string, parseKey: string, settings: ReaderSettings): ShadowParsedLine {
        const parsed = this.cachedParsedCueHtml(parseKey, settings) ?? this.provisionalParsedHtmlCache.get(parseKey);
        const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parseKey)}"` : '';
        const provisionalAttribute = parsed && !this.parsedHtmlCache.has(parseKey) ? ' data-parsed-provisional="true"' : '';
        return { html: parsed ?? escapeWithBreaks(cueText), parsedKeyAttribute, provisionalAttribute };
    }

    private renderShadowSecondaryLine(state: ShadowPanelRenderState): string {
        if (!state.settings.subtitleSecondaryVisible) return '';
        const text = state.secondary?.text.trim();
        if (!text) return '';
        const blurClass = state.settings.subtitleNativeBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS;
        const label = uiText(state.settings.interfaceLanguage, 'toggleNativeSubtitleBlur');
        return `<button class="jpdb-subtitle-shadow-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeWithBreaks(text)}</button>`;
    }

    private renderShadowActions(language: ReaderSettings['interfaceLanguage']): string {
        const recording = Boolean(this.shadowRecorder && this.shadowRecorder.state !== 'inactive');
        const loopAction = this.shadowLoopEnabled ? 'stop' : 'loop';
        const toggleIcon = this.shadowTextVisible ? 'eye-off' : 'eye';
        const recordLabel = this.shadowActionLabel(language, recording ? 'stop-record' : 'record');
        return `
            ${this.renderShadowAction('shadow-replay', this.shadowActionLabel(language, 'replay'), 'repeat', false)}
            ${this.renderShadowAction('shadow-loop', this.shadowActionLabel(language, loopAction), 'repeat', this.shadowLoopEnabled)}
            ${this.renderShadowAction('shadow-auto-pause', this.shadowActionLabel(language, 'auto-pause'), 'pause', this.options.getSettings().subtitleShadowAutoPause)}
            ${this.renderShadowAction('shadow-toggle-text', uiText(language, this.shadowTextVisible ? 'hide' : 'show'), toggleIcon, !this.shadowTextVisible)}
            ${this.renderShadowAction('shadow-record', recordLabel, recording ? 'stop' : 'mic', recording)}
            ${this.shadowRecordingUrl ? this.renderShadowAction('shadow-play-recording', this.shadowActionLabel(language, 'play-recording'), 'play', false) : ''}
            ${this.shadowRecordingUnavailable && !recording ? `<span class="jpdb-subtitle-shadow-note">${escapeHtml(this.shadowActionLabel(language, 'record-unavailable'))}</span>` : ''}
        `;
    }

    private renderShadowAction(action: string, label: string, icon: SubtitleIconName, pressed: boolean): string {
        return `<button class="jpdb-subtitle-shadow-action" type="button" data-action="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${pressed}">${subtitleIcon(icon)}<span>${escapeHtml(label)}</span></button>`;
    }

    private shadowActionLabel(language: ReaderSettings['interfaceLanguage'], action: 'replay' | 'loop' | 'stop' | 'auto-pause' | 'record' | 'stop-record' | 'play-recording' | 'record-unavailable'): string {
        const japanese = resolveUiLanguage(language) === 'ja';
        switch (action) {
            case 'replay': return japanese ? '再生' : 'Replay';
            case 'loop': return japanese ? 'ループ' : 'Loop';
            case 'stop': return japanese ? '停止' : 'Stop';
            case 'auto-pause': return japanese ? '自動停止' : 'Auto pause';
            case 'record': return japanese ? '録音' : 'Record';
            case 'stop-record': return japanese ? '録音停止' : 'Stop';
            case 'play-recording': return japanese ? '録音を再生' : 'Play yours';
            case 'record-unavailable': return japanese ? 'マイクを使用できません' : 'Mic unavailable';
        }
    }

    private requestParsedShadowLineIfNeeded(cue: SubtitleCue, key: string, signature: string, settings: ReaderSettings): void {
        if (!this.shouldParseSubtitles(settings) || this.cachedParsedCueHtml(key, settings) !== undefined) {
            const target = this.transcriptPanel ? this.transcriptTextTargetsForParseKey(this.transcriptPanel, key)[0] : undefined;
            if (target && this.parsedHtmlCache.has(key)) this.notifyParsedTokensForKey(key, true, [target]);
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
                tokens: this.parsedTokenCache.get(key) ?? [],
            };
        });
    }

    private async scanBatchMiningTranscript(): Promise<void> {
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
            target.tokens = this.parsedTokenCache.get(key) ?? [];
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
            this.options.toast?.(error instanceof Error ? error.message : subtitleText(language, 'bmAddFailed'));
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
            this.options.toast?.(error instanceof Error ? error.message : subtitleText(language, 'bmGradeFailed'));
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
        const signature = [
            rows.length,
            this.selectedTrackId,
            this.tracks.find(track => track.id === this.selectedTrackId)?.loadingState ?? '',
            !this.cues.length && this.currentCue ? subtitleCueSignature(this.currentCue) : '',
            this.parseCacheKey('', settings),
            virtual ? `v:${virtual.start}:${virtual.end}` : '',
        ].join(':');
        return {
            rows: renderedRows,
            warmupRows: virtual ? renderedRows : undefined,
            currentRowIndex,
            signature,
            rowIndexOffset: virtual?.start,
            totalRowCount: virtual ? rows.length : undefined,
            virtual,
        };
    }

    private transcriptVirtualWindow(rowCount: number, currentRowIndex: number): TranscriptPanelVirtualWindow | undefined {
        if (rowCount <= TRANSCRIPT_VIRTUALIZE_ROW_THRESHOLD) return undefined;
        const scroller = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-scroll');
        const clientHeight = Math.max(
            scroller?.clientHeight ?? 0,
            Math.round((this.transcriptPanel?.getBoundingClientRect().height ?? 0) * 0.72),
            TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX * 6,
        );
        const scrollTop = Math.max(0, scroller?.scrollTop ?? this.transcriptVirtualScrollTop);
        const visibleRows = Math.max(
            TRANSCRIPT_VIRTUAL_MIN_RENDERED_ROWS,
            Math.ceil(clientHeight / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) + TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS * 2,
        );
        const { start, end } = this.resolveVirtualWindowBounds(rowCount, currentRowIndex, scrollTop, visibleRows);
        return {
            start,
            end,
            scrollTop,
            topSpacer: start * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX,
            bottomSpacer: Math.max(0, (rowCount - end) * TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX),
        };
    }

    // While auto-following, keep the committed window as long as the active row
    // stays comfortably inside it: consecutive line advances then reuse the same
    // window so the panel signature is unchanged and only the cheap active-line
    // class-swap runs — no full list re-render recreating (and flickering) the
    // highlighted row. The window only shifts when the active row nears an edge,
    // or on a user scroll (auto-follow paused), where it tracks scrollTop as before.
    private resolveVirtualWindowBounds(rowCount: number, currentRowIndex: number, scrollTop: number, visibleRows: number): { start: number; end: number } {
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
        return Math.floor(scrollTop / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
    }

    private shouldCenterActiveTranscriptRow(scrollTop: number, currentRowIndex: number, visibleRows: number): boolean {
        if (currentRowIndex < 0) return false;
        if (!this.options.getSettings().subtitleTranscriptAutoScroll) return false;
        if (this.isTranscriptAutoScrollPaused()) return false;
        const firstRendered = Math.floor(scrollTop / TRANSCRIPT_VIRTUAL_ROW_ESTIMATE_PX) - TRANSCRIPT_VIRTUAL_OVERSCAN_ROWS;
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

    private renderTranscriptPanelHtml(state: TranscriptPanelRenderState): string {
        const settings = this.options.getSettings();
        const language = settings.interfaceLanguage;
        const rowCount = state.totalRowCount ?? state.rows.length;
        const rowIndexOffset = state.rowIndexOffset ?? 0;
        return `
            ${renderDrawerHead({
                mode: 'lines',
                title: uiText(language, 'subtitlesTitle'),
                meta: subtitleDrawerMetaText({
                    mode: 'lines',
                    count: rowCount,
                    tracks: this.tracks,
                    selectedTrackId: this.selectedTrackId,
                    secondaryTrackId: this.secondaryTrackId,
                    language,
                }),
                canShowLines: this.hasTranscriptSurface(),
                options: this.panelOptionsState(settings.subtitlePausePanel, language),
                extraActions: `<button class="jpdb-subtitle-jump-current" type="button" data-action="jump-current" title="${escapeHtml(uiText(language, 'jumpToCurrentSubtitle'))}" aria-label="${escapeHtml(uiText(language, 'jumpToCurrentSubtitle'))}">${subtitleIcon('locate')}</button>`,
            })}
            <div class="jpdb-subtitle-list-scroll" data-total-rows="${rowCount}"${state.virtual ? ' data-virtualized="true"' : ''}>
                ${state.virtual ? this.renderTranscriptVirtualSpacer(state.virtual.topSpacer) : ''}
                ${state.rows.length
                    ? state.rows.map((row, index) => this.renderTranscriptRow(row, rowIndexOffset + index, state.currentRowIndex)).join('')
                    : this.renderTranscriptWaitingState()}
                ${state.virtual ? this.renderTranscriptVirtualSpacer(state.virtual.bottomSpacer) : ''}
            </div>
            <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeTranscriptPanel'))}"></div>
        `;
    }

    private renderTranscriptVirtualSpacer(height: number): string {
        return height > 0
            ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>`
            : '';
    }

    private afterTranscriptPanelRender(state: TranscriptPanelRenderState, options: { deferPlayerResize?: boolean; warmupRows?: TranscriptRow[] } = {}): void {
        this.indexTranscriptTextTargets();
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
            this.markTranscriptProgrammaticScroll();
            scroller.scrollTop = scrollTop;
        }
        this.transcriptVirtualScrollTop = scrollTop;
    }

    private renderTranscriptRow(row: TranscriptRow, index: number, currentIndex: number): string {
        const cue = row.cue;
        const settings = this.options.getSettings();
        const parsedKey = this.parseCacheKey(cue.text, settings);
        const parsed = this.parsedHtmlCache.get(parsedKey) ?? this.provisionalParsedHtmlCache.get(parsedKey);
        const parsedKeyAttribute = parsed ? ` data-parsed-key="${escapeHtml(parsedKey)}"` : '';
        const provisionalAttribute = parsed && !this.parsedHtmlCache.has(parsedKey) ? ' data-parsed-provisional="true"' : '';
        const seekLabel = `${uiText(settings.interfaceLanguage, 'seekSubtitleLine')} ${formatSubtitleTime(cue.start)}`;
        return `
            <div class="jpdb-subtitle-list-row ${index === currentIndex ? 'active' : ''}" data-action="cue" data-row-index="${index}" data-cue-index="${row.cueIndex}" role="button" tabindex="0" aria-label="${escapeHtml(seekLabel)}">
                <div class="jpdb-subtitle-row-body">
                    <strong class="jpdb-subtitle-row-text" lang="ja" data-transcript-text data-row-index="${index}" data-parse-key="${escapeHtml(parsedKey)}"${parsedKeyAttribute}${provisionalAttribute}>${parsed ?? escapeWithBreaks(cue.text)}</strong>
                </div>
                <div class="jpdb-subtitle-row-tools">
                    ${this.transcriptRowPeekButton(cue, index, settings)}
                    <button class="jpdb-subtitle-row-copy" type="button" data-action="copy-row" data-row-index="${index}" title="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, 'copySubtitleLine'))}">${subtitleIcon('copy')}</button>
                    <span class="jpdb-subtitle-row-time">${formatSubtitleTime(cue.start)}</span>
                </div>
            </div>
        `;
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

    private renderTranscriptWaitingState(): string {
        const selected = this.tracks.find(track => track.id === this.selectedTrackId);
        const language = this.options.getSettings().interfaceLanguage;
        const label = selected?.label ? `: ${escapeHtml(selected.label)}` : '';
        const status = selected?.loadingState === 'loading' ? uiText(language, 'loadingSubtitleLines') : uiText(language, 'waitingForCaptionLines');
        return `<div class="jpdb-subtitle-list-empty">${escapeHtml(status)}${label}. ${escapeHtml(uiText(language, 'subtitleCurrentLineWillAppear'))}</div>`;
    }

    private updateTranscriptActiveLine(currentIndex: number): void {
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== 'lines') return;
        const activeRows = Array.from(this.transcriptPanel.querySelectorAll<HTMLElement>('.jpdb-subtitle-list-row.active'));
        const active = this.transcriptPanel.querySelector<HTMLElement>(`.jpdb-subtitle-list-row[data-row-index="${currentIndex}"]`);
        if (active && activeRows.length === 1 && activeRows[0] === active) return;
        activeRows.forEach(row => {
            if (row !== active) row.classList.remove('active');
        });
        if (active) active.classList.add('active');
        this.scrollTranscriptToActive();
    }

    private scrollTranscriptToActive(options: { force?: boolean } = {}): void {
        if ((!options.force && !this.options.getSettings().subtitleTranscriptAutoScroll) || !this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing) return;
        // Respect a manual scroll: don't yank the list back to the active row
        // while the viewer is reading elsewhere. Auto-follow resumes after the
        // configurable resume window with no further manual scrolling.
        if (!options.force && this.isTranscriptAutoScrollPaused()) return;
        if (this.transcriptScrollFrame) cancelAnimationFrame(this.transcriptScrollFrame);
        this.transcriptScrollFrame = requestAnimationFrame(() => {
            this.transcriptScrollFrame = undefined;
            if (this.destroyed) return;
            const active = this.transcriptPanel?.querySelector<HTMLElement>('.jpdb-subtitle-list-row.active');
            if (!active) return;
            // Mark the self-induced scroll so its scroll events are not counted
            // as a manual scroll that would pause auto-follow.
            this.markTranscriptProgrammaticScroll();
            active.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        });
    }

    private markTranscriptProgrammaticScroll(): void {
        this.transcriptProgrammaticScrollUntil = performance.now() + TRANSCRIPT_PROGRAMMATIC_SCROLL_WINDOW_MS;
    }

    private noteTranscriptScroll(): void {
        if (performance.now() < this.transcriptProgrammaticScrollUntil) return;
        if (!this.options.getSettings().subtitleTranscriptAutoScroll) return;
        this.transcriptUserScrollAt = performance.now();
        this.syncTranscriptAutoScrollPausedClass();
        this.scheduleTranscriptAutoScrollResume();
    }

    private jumpToCurrentTranscriptRow(): void {
        this.clearTranscriptManualScrollPause();
        this.clearTranscriptVirtualRender();
        this.renderTranscriptPanel(true);
        this.scrollTranscriptToActive({ force: true });
    }

    private clearTranscriptManualScrollPause(): void {
        this.transcriptUserScrollAt = 0;
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        this.syncTranscriptAutoScrollPausedClass();
    }

    private scheduleTranscriptAutoScrollResume(): void {
        this.transcriptAutoScrollResumeTimer = clearWindowTimeout(this.transcriptAutoScrollResumeTimer);
        const remaining = Math.max(0, this.transcriptAutoScrollResumeMs() - (performance.now() - this.transcriptUserScrollAt));
        this.transcriptAutoScrollResumeTimer = window.setTimeout(() => {
            this.transcriptAutoScrollResumeTimer = undefined;
            this.syncTranscriptAutoScrollPausedClass();
            this.scrollTranscriptToActive();
        }, remaining + 20);
    }

    private syncTranscriptAutoScrollPausedClass(): void {
        this.transcriptPanel?.classList.toggle('jpdb-subtitle-auto-scroll-paused', this.isTranscriptAutoScrollPaused());
    }

    private isTranscriptAutoScrollPaused(): boolean {
        return Boolean(this.options.getSettings().subtitleTranscriptAutoScroll
            && this.transcriptUserScrollAt
            && performance.now() - this.transcriptUserScrollAt < this.transcriptAutoScrollResumeMs());
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
            this.renderTranscriptPanel(true);
        });
    }

    private isTranscriptVirtualScroller(scroller: HTMLElement): boolean {
        return scroller.dataset.virtualized === 'true';
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
        return this.cues.length ? -1 : 0;
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
            const cached = this.parsedHtmlCache.get(hydration.key);
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
            const parsed = await this.parseCueHtmlBatch(targets.map(target => target.cue.text), settings, {
                enrichBeforeRender: true,
                refreshProvisional: true,
                requireEnrichedProvisional: true,
            });
            if (serial !== this.transcriptHydrationSerial) return;
            for (const item of parsed) {
                if (item.provisional === true && !this.enrichedProvisionalParsedHtmlKeys.has(item.key)) continue;
                this.updateTranscriptRowsForParseKey(item.key, item.html, { provisional: item.provisional === true, force: item.provisional === true });
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
        const key = this.parseCacheKey(cue.text, settings);
        const provisionalNeedsHydration = (target.dataset.parsedProvisional === 'true'
            || (this.provisionalParsedHtmlCache.has(key) && !this.enrichedProvisionalParsedHtmlKeys.has(key)))
            && (this.hasAuthoritativeParseTier() || !this.enrichedProvisionalParsedHtmlKeys.has(key));
        return !provisionalNeedsHydration && hasAttemptedTranscriptParse(target, key) ? null : { cue, target, key };
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
                    const parsed = await this.parseCueHtmlBatch(batch.map(item => item.text), settings, parseOptions);
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
        planned: Array<{ rowIndex: number; text: string; key: string }>,
        settings: ReaderSettings,
        takeNextIndex: () => number,
    ): Array<{ rowIndex: number; text: string; key: string }> {
        const batchSize = this.options.parseJapaneseBatch ? TRANSCRIPT_BACKGROUND_PARSE_BATCH : 1;
        const batch: Array<{ rowIndex: number; text: string; key: string }> = [];
        while (batch.length < batchSize) {
            const item = planned[takeNextIndex()];
            if (!item) break;
            if (this.isWarmParsedCueKey(item.key, settings)) continue;
            batch.push(item);
        }
        return batch;
    }

    private transcriptWarmupPlan(rows: TranscriptRow[], preferredIndex: number, settings: ReaderSettings): Array<{ rowIndex: number; text: string; key: string }> {
        const priority = this.transcriptHydrationIndexes(preferredIndex, rows.length);
        const focusIndex = preferredIndex >= 0 ? preferredIndex : 0;
        const orderedIndexes = transcriptWarmupIndexes(priority, focusIndex, rows.length);
        const limit = this.transcriptBackgroundParseLimit(rows.length);
        const seen = new Set<string>();
        const plan: Array<{ rowIndex: number; text: string; key: string }> = [];
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
        plan: Array<{ rowIndex: number; text: string; key: string }>,
        seen: Set<string>,
        rows: TranscriptRow[],
        rowIndex: number,
        settings: ReaderSettings,
    ): void {
        const text = rows[rowIndex]?.cue.text.trim();
        if (!text) return;
        const key = this.parseCacheKey(text, settings);
        if (seen.has(key) || this.isWarmParsedCueKey(key, settings)) return;
        seen.add(key);
        plan.push({ rowIndex, text, key });
    }

    private transcriptBackgroundParsePauseMs(): number {
        return isYouTubePage() ? YOUTUBE_TRANSCRIPT_BACKGROUND_PARSE_PAUSE_MS : 0;
    }

    private updateTranscriptRowsForParseKey(key: string, html: string, options: { provisional?: boolean; force?: boolean } = {}): void {
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
            if (!options.force && !shouldApplyParsedTranscriptHtml(target, key, options.provisional === true)) continue;
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
        if (!this.transcriptPanel || this.transcriptPanel.hidden || this.transcriptPanelClosing || this.panelMode !== 'tracks') return;
        this.transcriptTextTargetsByParseKey.clear();
        const state = subtitleTrackPanelState(this.tracks);
        const settings = this.options.getSettings();
        const tracks = state.tracks.map(track => ({
            ...track,
            timing: this.trackTimingControlState(track.id),
        }));
        const virtual = this.tracksVirtualWindow(tracks.length);
        this.renderedTracksVirtualWindow = virtual
            ? { start: virtual.start, end: virtual.end, rowCount: tracks.length }
            : undefined;
        setInnerHtml(this.transcriptPanel, renderSubtitleTrackPanel({
            ...state,
            tracks,
            selectedTrackId: this.selectedTrackId,
            secondaryTrackId: this.secondaryTrackId,
            hasTranscriptSurface: this.hasTranscriptSurface(),
            pausePanelEnabled: settings.subtitlePausePanel,
            placement: this.effectiveTranscriptPlacement,
            optionsMenuOpen: this.panelOptionsMenuOpen,
            language: settings.interfaceLanguage,
            animeSearchQuery: subtitleAnimeSearchQuery(this.video),
            virtual,
        }));
        this.restoreTracksVirtualScroll(virtual);
        this.bindTranscriptResizeHandle();
        this.bindTracksScroller();
        this.syncPanelState();
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

    private beginTrackSelection(role: 'primary' | 'secondary'): number {
        if (role === 'primary') {
            this.primarySelectionRequest += 1;
            return this.primarySelectionRequest;
        }
        this.secondarySelectionRequest += 1;
        return this.secondarySelectionRequest;
    }

    private invalidateTrackSelection(role: 'primary' | 'secondary'): void {
        this.beginTrackSelection(role);
    }

    private isTrackSelectionCurrent(role: 'primary' | 'secondary', requestId: number, trackId: string): boolean {
        return role === 'primary'
            ? this.primarySelectionRequest === requestId && this.selectedTrackId === trackId
            : this.secondarySelectionRequest === requestId && this.secondaryTrackId === trackId;
    }

    private resetPrimarySubtitleState(): void {
        this.invalidateTrackSelection('primary');
        this.selectedTrackId = '';
        this.cues = [];
        this.currentCue = undefined;
        this.transcriptVirtualScrollTop = 0;
        this.clearTranscriptVirtualRender();
        this.lastDomCaption = '';
        this.lastDomCaptionSeenAt = 0;
        this.pendingDomCaption = undefined;
        this.youtubeDomCaptionFallbackTrackId = '';
        this.lastAutoCopiedCueSignature = '';
        this.lastRenderedPrimaryText = '';
        this.lastRenderedPrimaryHtml = '';
        this.lastAppliedSubtitleHtml = '';
        this.renderSerial += 1;
        this.parseWarmupSerial += 1;
        this.lastParseWarmupAnchor = -1;
        this.lastShadowSignature = '';
        this.shadowLoopEnabled = false;
    }

    private resetSecondarySubtitleState(): void {
        this.invalidateTrackSelection('secondary');
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
        log.info('Primary subtitle track cleared');
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
        log.info('Secondary subtitle track cleared');
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
        let cleared = 0;
        const roots = Array.from(document.querySelectorAll<HTMLElement>(ASBPLAYER_SUBTITLE_ROOT_SELECTOR));
        for (const root of roots) cleared += unwrapReaderWords(root);
        if (cleared) log.info('Cleared parsed ASBPlayer subtitle lines', { roots: roots.length, cleared });
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
        // Resize, orientationchange, and fullscreen transitions all route through
        // here; reproject the remembered drag nudge so it tracks the new viewport
        // height instead of staying frozen at its previous pixel value.
        this.restoreSubtitleDragOffset();
        const fullscreenElement = currentFullscreenElement();
        const fullscreenHost = this.subtitleFullscreenHost(fullscreenElement);
        this.fullscreen = Boolean(fullscreenElement || fullscreenHost || videoIsInNativeFullscreen(this.video));
        this.syncSubtitleRootParent(fullscreenHost);
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

    private syncSubtitleRootParent(fullscreenHost: HTMLElement | null = this.subtitleFullscreenHost()): void {
        if (!this.root) return;
        // When the entire document is the fullscreen element (YouTube's desktop
        // fullscreen promotes <html> to the top layer) reader roots already
        // render inside it through <body>; appending a <div> directly under
        // <html> is unnecessary and a non-standard place for it, so keep it in
        // <body>.
        const parent = this.fullscreenReaderRootParent(fullscreenHost);
        if (this.root.parentElement !== parent) parent.appendChild(this.root);
        if (this.transcriptPanel && this.transcriptPanel.parentElement !== parent) parent.appendChild(this.transcriptPanel);
    }

    private fullscreenReaderRootParent(fullscreenHost: HTMLElement | null): HTMLElement {
        return !fullscreenHost || fullscreenHost === document.documentElement
            ? (document.body ?? document.documentElement)
            : fullscreenHost;
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

    private subtitleFullscreenHost(fullscreenElement: Element | null = currentFullscreenElement()): HTMLElement | null {
        if (this.shouldHostSubtitleRootInFullscreenElement(fullscreenElement)) return fullscreenElement;
        const inlineHost = this.inlineFullscreenHostForVideo();
        if (inlineHost) return inlineHost;
        const youtubeHost = youtubeFullscreenHostForVideo(this.video);
        if (youtubeHost) return youtubeHost;
        if (fullscreenElement instanceof HTMLVideoElement && fullscreenElement === this.video) {
            const target = subtitleVideoLayoutTarget(this.video);
            return target && target !== this.video ? target : null;
        }
        return null;
    }

    private shouldHostSubtitleRootInFullscreenElement(fullscreenElement: Element | null): fullscreenElement is HTMLElement {
        return Boolean(fullscreenElement instanceof HTMLElement
            && !(fullscreenElement instanceof HTMLVideoElement)
            && this.video
            && fullscreenElement.contains(this.video));
    }

    private inlineFullscreenHostForVideo(): HTMLElement | null {
        const host = this.video?.closest<HTMLElement>('[data-yomu-inline-fullscreen="true"]')
            ?? document.querySelector<HTMLElement>('[data-yomu-inline-fullscreen="true"]');
        return host && (!this.video || host.contains(this.video) || isYouTubeMobileFullscreenHost(host))
            ? host
            : null;
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
        const fullscreenHost = this.subtitleFullscreenHost();
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

    // The side panel normally hangs from the video's top. Once the video scrolls
    // out of view, that top is off-screen (negative when scrolled up, huge when
    // below the fold) and the clamp in the layout math then swings the panel's
    // height from full-height to a bottom-pinned sliver. Return a stable on-screen
    // anchor while the video is not overlay-visible so the panel keeps a steady
    // height as you scroll past it (it stays position:fixed on screen regardless).
    private stableTranscriptAnchorTop(referenceVideoRect: DOMRect): number {
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

function shouldHonorExplicitYouTubeSideLayout(layout: TranscriptPanelLayout): boolean {
    return layout.margin > 0 && layout.viewportWidth >= 900;
}
