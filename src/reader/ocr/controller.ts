import { escapeHtml, renderRuby, renderTokensToHtml, setInnerHtml, shouldRenderRuby } from '../dom/index';
import { captureOcrTargetContext, claimOcrScan, ocrFallbackCardFromText, ocrTargetWork, ocrTargetWorkKey,
    releaseOcrScan, type OcrTargetContext, type OcrTargetWork } from './target-context';
import { ocrRuntimeActive } from './mode';
import {
    DARK_REGION_TRIGGER,
    buildLuminanceField,
    darkAreaIsRead,
    loadImage,
    loadedImageSize,
    luminanceFieldDarkFraction,
    mergeDarkPassResult,
    mergeOcrResults,
    offsetOcrResult,
    splitImageIntoPageColumns,
} from './image-preprocess';
import {
    composedOcrSurfaceTransform,
    fittedObjectSize,
    forgetAllComposedOcrSurfaceTransforms,
    forgetComposedOcrSurfaceTransform,
    imageContentBox,
    objectPositionOffset,
    ocrOverlayLayerPlacement,
    ocrOverlayTypeface,
    paintedImageFrame,
    type OcrLayerPlacement,
    type OcrOverlayFrame,
    type OcrSurfaceRect,
} from './ocr-overlay-geometry';
import {
    layoutOcrOverlayIfChanged,
    ocrArtifactRootOffset,
    ocrPlacedSurfaceRect,
    setOcrArtifactPosition,
    setOcrLayerTransform,
    setOcrOverlayAccessibility,
    type OcrArtifactOffset,
} from './ocr-position-pass';
import { isOcrProviderConfigured, ocrRecognizer, requestBlob, type OcrRecognizer } from './ocr-providers';
import { imageCacheKey, isOcrRequestTimeout, localOcrEndpointUrl, ocrAttemptTimeoutMs } from './ocr-shared';
import { normalizeOcrRenderedText } from './rendered-text';
import { loadPersistedOcrCache, persistOcrCacheSoon } from './ocr-cache-store';
import {
    backgroundImageReaderUrl,
    canUseReaderCanvasSourceImageFallback,
    canvasPageContentToken,
    canvasReaderHasStableSurface,
    captureCanvasRegionDataUrl,
    canvasRenderedContentSignature,
    canvasReaderPageSignature,
    canvasReaderSurfaceId,
    captureCanvasDataUrl,
    collectBackgroundImageReaderSurfaces,
    collectCanvasReaderSurfaces,
    isBookwalkerContinuousScrollCanvas,
    isBookwalkerViewerHost,
    isCanvasReadable,
    isManualCanvasReaderSurface,
    isReaderRasterPage,
    mutationsMayAddReaderRasterCandidate,
    mutationsMayRemoveReaderRasterCandidate,
    ocrPointerHitElement,
    pageHasReaderRasterCandidates,
    positionCanvasFrameImage,
    readerCanvasSourceImageUrl,
} from './canvas-readers';
import { captureReaderSurfaceViaExtensionScreenshot } from './extension-screenshot';
import {
    canonicalBookwalkerAssetUrl,
    canvasMirrorContentToken,
    captureCanvasMirror,
} from './canvas-mirror';
import { BookwalkerAssetResolver } from './bookwalker-assets';
import {
    hasIdentityChanged as hasCanvasIdentityChanged,
    isRealContentChange as isRealCanvasContentChange,
} from './canvas-page-identity';
import {
    canvasContentReadinessKey,
    canvasStablePageContentToken,
    canvasSurfaceSnapshotKey,
    hasDifferentRecordedCanvasReaderContent,
    hasSameRealCanvasReaderContent,
    hasSameStableCanvasReaderPageCounter,
    isCanvasMirrorEpochTransition,
    isSameCanvasReaderPageLocation,
    shouldTrustStableBookwalkerPageCounter,
} from './canvas-page-signature';
import { uiText, type UiCopyKey } from '../app/i18n';
import { waitForIdle } from '../platform/idle';
import { promiseWithTimeout } from '../core/async-utils';
import { Logger } from '../app/logger';
import { isYouTubeAppHostname } from '../app/youtube-host';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { pitchPatternFromPosition } from '../lookup/pitch-accent';
import {
    cleanOcrLookupLines,
    normalizeOcrResult,
    ocrLinesChanged,
    parseGoogleLensUploadHtml,
    type OcrLine,
    type OcrRect,
    type OcrResult,
} from './response';
import { accentToRgba, accessibleOcrBackgroundColor, accessibleOcrBackgroundOpacity, isPopupLookupEnabled } from '../settings/index';
import { segmentTargetLanguageText } from '../lookup/target-text';
import type { ReaderParserParseOptions } from '../lookup/parser';
import { stableHashBase36, stablePositiveHashId } from '../core/stable-hash';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { OcrWordRenderStateRegistry } from './word-render-state';
import {
    classifyRenderableMediaMutations,
    type RenderableMediaMutationBatch,
} from './renderable-media-mutations';

type OcrVideoFrameStatus = 'loading' | 'ready' | 'empty' | 'failed';

function isTerminalOcrStatus(status: string | undefined): status is 'empty' | 'failed' {
    return status === 'empty' || status === 'failed';
}

interface ImageState {
    image: HTMLImageElement;
    overlay: HTMLElement;
    key: string;
    target: OcrTargetContext;
    result?: OcrResult;
    loading: boolean;
    overlayRequested: boolean;
    manualRequested: boolean;
    autoSkipped: boolean;
    scan?: symbol;
    /** The image's 'load' listener, removed when the state is torn down so a re-boot doesn't leak it. */
    loadListener?: () => void;
}

type OcrRenderedImageFrame = OcrOverlayFrame;

interface PendingCanvasSnapshot {
    key: string;
    contentToken?: string;
    startedAt: number;
    cancelled: boolean;
    timeoutId?: number;
}

interface CanvasSnapshotCapture {
    frameSrc: string;
    frameRect: DOMRect;
    contentKey?: string;
    contentToken?: string;
}

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string, options?: ReaderParserParseOptions) => Promise<JPDBToken[]>;
    parseJapaneseBatch?: (texts: string[], options?: ReaderParserParseOptions) => Promise<JPDBToken[][]>;
    onToast: (message: string) => void;
    shouldAutoScan?: () => boolean;
    shouldScanInlineImages?: (userRequested: boolean) => boolean;
    enrichTokensBeforeRender?: (tokens: JPDBToken[]) => void | Promise<void>;
    enrichRenderedTokens?: (tokens: JPDBToken[], root: ParentNode) => void | Promise<void>;
    fallbackCardFromText?: (text: string) => JPDBCard;
    /** Test seam: overrides the canvas capture of a paused video frame. */
    captureVideoFrame?: (video: HTMLVideoElement) => string | undefined;
    /** Test seam: overrides trusted screenshot capture for tainted reader canvases. */
    captureReaderSurface?: typeof captureReaderSurfaceViaExtensionScreenshot;
    /** Test seam: overrides clean-source replay for tainted BookWalker canvases. */
    captureCanvasMirror?: typeof captureCanvasMirror;
    /** Test seam: lowers the 30-second OCR attempt floor so timeout paths run fast. */
    ocrAttemptTimeoutFloorMs?: number;
}

interface OcrLookupLineLease {
    line?: HTMLElement;
}

const MAX_CACHE_ITEMS = 36;
const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15000;
// Flash the "ready" dot briefly so the user sees the scan finished, then fade
// it away rather than leaving a solid dot lingering on a finished page.
const OCR_STATUS_READY_DWELL_MS = 1000;
const OCR_STATUS_FADE_MS = 360; // keep in sync with the CSS opacity transition
// A canvas capture can fail transiently — the DRM engine hasn't painted yet, or
// the mirror recorder hasn't recorded the new page's draw ops when the poll races
// a turn. Retry with backoff so the page is never left permanently un-OCR'd while
// waiting for the next 1200ms poll (the "stuck, must refresh" report). After the
// cap automatic retries pause on a tappable status; a page turn or tap reopens capture.
const READER_RASTER_RETRY_BASE_MS = 140;
const READER_RASTER_RETRY_MAX_MS = 1100;
const READER_RASTER_MAX_CAPTURE_ATTEMPTS = 8;
const READER_RASTER_MAX_COMMIT_MISMATCHES = 3;
const READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS = 3;
const READER_RASTER_EMPTY_RETRY_MS = 400;
const READER_RASTER_MAX_PROVIDER_ATTEMPTS = 3;
const READER_RASTER_PROVIDER_RETRY_BASE_MS = 350;
// Mirror capture can spend one timeout fetching, one decoding, then six seconds
// asking the extension screenshot bridge. Ownership must outlive that whole chain.
const READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS = 40_000;
const READER_RASTER_FRAME_LOAD_TIMEOUT_MS = 8_000;
const BOOKWALKER_RECORDER_BOOT_GRACE_MS = 15_000;
const READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT = 40;
const READER_RASTER_BOTTOM_CHROME_RESERVE_PX = 56;
const READER_RASTER_FRAME_SIZE_CHANGE_PX = 2;
const READER_RASTER_REGION_MIN_SIZE_PX = 96;
const READER_RASTER_REGION_FULL_PAGE_FRACTION = 0.88;
const MIRROR_IMAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_CLEAN_MIRROR_IMAGE_CACHE_ITEMS = 48;
const BOOKWALKER_SPREAD_MIN_ASPECT = 1.15;
const bookwalkerAssetResolver = new BookwalkerAssetResolver();
const log = Logger.scope('OCR');
const STALE_OCR_STATE = Symbol('stale-ocr-state');
const ocrVocabularyCache = new WeakMap<HTMLImageElement, Map<string, JPDBCard> | null>();
let ocrLayerCounter = 0;
const OCR_PROVIDER_LABELS: Partial<Record<ReaderSettings['ocrProvider'], (settings: ReaderSettings) => string | null>> = {
    'google-lens': () => 'google-lens',
    'cloud-vision': settings => settings.ocrCloudVisionApiKey.trim() ? 'cloud-vision' : null,
    'local-service': localServiceProviderLabel,
};
const VIDEO_FRAME_PLAYER_SELECTOR = [
    '#movie_player',
    '.html5-video-player',
    'ytd-player',
    '#player',
    '#player-container',
    '#player-container-outer',
    '[data-yomu-video-frame]',
].join(',');
const VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR = [
    '[data-yomu-inline-fullscreen="true"]',
    '[data-fullscreen-active="true"]',
    '[fullscreen]',
    '#movie_player.ytp-fullscreen',
    '.html5-video-player.ytp-fullscreen',
    'ytd-watch-flexy[fullscreen]',
    'ytm-player[fullscreen]',
    'ytm-player.fullscreen',
    'ytm-player.ytp-fullscreen',
].join(',');
// YouTube feed/preview tile containers. A <video> OR thumbnail <img> inside one
// of these is unambiguously a feed/preview surface, never the main watch player,
// so OCR must skip it: neither the paused-frame snapshot card nor the image
// auto-scan should fire on a thumbnail. `ytd-video-preview` is YouTube's
// body-level inline hover preview — it reuses the real player markup
// (#movie_player / ytd-player / #player-container), so without naming the
// preview wrapper here its <video> matches VIDEO_FRAME_PLAYER_SELECTOR and gets
// read as the main player. The `yt-*-view-model` tags wrap modern feed/Shorts
// thumbnail images.
const VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR = [
    'ytd-thumbnail',
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-playlist-thumbnail',
    'ytd-video-preview',
    'yt-thumbnail-view-model',
    'yt-lockup-view-model',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-video-with-context-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
].join(',');
// Weak link wrappers: these also wrap the MAIN player on m.youtube.com, so a
// video matched ONLY by these is treated as a thumbnail only when it is not
// player-sized (see isLikelyPausedVideoThumbnail).
const VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR = [
    'a[href*="/watch"]',
    'a[href*="/shorts/"]',
].join(',');
const OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR = [
    VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR,
    'yt-image',
    '.yt-core-image',
].join(',');

export { normalizeOcrResult, parseGoogleLensUploadHtml };
export type { OcrResult };

function shouldSkipOcrRequest(state: ImageState, userRequested: boolean): boolean {
    return state.autoSkipped && !userRequested;
}

function updateOcrRequestFlags(state: ImageState, image: HTMLImageElement, userRequested: boolean): void {
    state.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image, false));
    state.manualRequested ||= userRequested;
    if (userRequested) state.autoSkipped = false;
}

function shouldPinOcrLineFromPointer(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
}

function isOcrImageStateIdle(state: ImageState): boolean {
    return !state.result && !state.loading && !state.autoSkipped;
}

interface OcrScanContext {
    provider: string;
    done: () => void;
    token: symbol;
}

type OcrPositionPlan = [
    HTMLElement,
    OcrLayerPlacement?,
    OcrOverlayFrame?,
    OcrArtifactOffset?,
    string?,
];

class LocalOcrUnavailableError extends Error {
    constructor(readonly endpointUrl: string) {
        super('Local OCR server is unreachable.');
        this.name = 'LocalOcrUnavailableError';
    }
}

function beginOcrScan(
    state: ImageState,
    image: HTMLImageElement,
    settings: ReaderSettings,
    manualRequested: boolean,
): OcrScanContext {
    const token = claimOcrScan(state);
    const provider = inlineProviderLabel(settings);
    return {
        provider,
        done: log.time('scanImage', { provider, image: imageSummary(image), manualRequested }),
        token,
    };
}

function renderNoOcrLines(state: ImageState): void {
    state.autoSkipped = true;
    state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());
}

function logOcrFailure(state: ImageState, provider: string, manualRequested: boolean, error: unknown): void {
    state.autoSkipped = !manualRequested;
    if (isLocalOcrUnavailableError(error)) {
        log.warnOnce(`local-ocr-unavailable:${error.endpointUrl}`, 'Local OCR endpoint unavailable; pausing requests', { provider, endpoint: error.endpointUrl });
        return;
    }
    log.warn('OCR scan failed', { provider, manualRequested }, error);
}

// YouTube SPA route changes fire yt-navigate-start/finish; history navigation
// fires popstate. Any of them means the current OCR overlays are stale.
const OCR_NAVIGATION_EVENTS = ['yt-navigate-start', 'yt-navigate-finish', 'popstate'] as const;

// Viewport changes the paused-frame overlay must re-align to. Mirrors the
// subtitle controller's set so OCR and subtitles never visibly disagree after a
// rotate or entering native fullscreen (which often emit no window 'resize').
const OCR_FULLSCREEN_CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'] as const;

// A lookup/mining pause stamps this dataset marker on the video; within the
// window the paused-frame OCR snapshot is suppressed so opening a dictionary
// entry never covers the player's comment/like controls.
const MINING_PAUSE_MARKER_TTL_MS = 1500;

function isFreshMiningPause(video: HTMLVideoElement): boolean {
    const marked = Number(video.dataset.jpdbReaderMiningPause);
    return Number.isFinite(marked) && Date.now() - marked < MINING_PAUSE_MARKER_TTL_MS;
}

export class ImageOcrController {
    private states = new Map<HTMLImageElement, ImageState>();
    private cache = new Map<string, OcrResult | null>();
    private localOcrUnavailable?: { endpointUrl: string; retryAt: number };
    private observer?: IntersectionObserver;
    private observerMargin = '';
    private mutationObserver?: MutationObserver;
    private queue: HTMLImageElement[] = [];
    // Small bounded pool; inFlightJobs also deduplicates identical image content.
    private activeScans = 0;
    // Tokens stop a stale scan deleting a newer job's marker.
    private readonly inFlightJobs = new Map<string, symbol>();
    private positionFrame = 0;
    private refreshTimer = 0;
    private destroyed = false;
    private pageScannerIsolationEnabled?: boolean;
    private lastPointerMoveImage?: HTMLImageElement;
    private lastPointerMoveReaderSurface?: Element;
    private lastPointerMoveReaderSurfaceKey?: string;
    private videoFrames = new Map<HTMLVideoElement, HTMLImageElement>();
    private videoFrameVideos = new Map<HTMLImageElement, HTMLVideoElement>();
    private videoFrameControls = new Map<HTMLVideoElement, HTMLElement>();
    private videoFrameStatuses = new Map<HTMLVideoElement, HTMLElement>();
    private imageStatuses = new Map<HTMLImageElement, HTMLElement>();
    private imageStatusTimers = new Map<HTMLImageElement, number>();
    // Reader surfaces map to the invisible images OCR actually scans.
    private canvasFrames = new Map<HTMLCanvasElement, HTMLImageElement>();
    private canvasFrameSources = new Map<HTMLImageElement, HTMLCanvasElement>();
    private canvasFrameStaticRects = new Map<HTMLImageElement, DOMRect>();
    private canvasFrameRegionFractions = new Map<HTMLImageElement, DOMRect>();
    private canvasFrameKeys = new Map<HTMLCanvasElement, string>();
    private canvasFrameContentTokens = new Map<HTMLCanvasElement, string>();
    private readonly canvasFrameLoadTimers = new Map<HTMLImageElement, number>();
    private canvasPendingStatuses = new Map<HTMLCanvasElement, HTMLElement>();
    private canvasPendingStatusKeys = new Map<HTMLCanvasElement, string>();
    // Explicitly tapped frames survive native-text-layer polling until a real turn.
    private readonly canvasFrameUserRequested = new Set<HTMLCanvasElement>();
    private backgroundFrames = new Map<HTMLElement, HTMLImageElement>();
    private backgroundFrameSources = new Map<HTMLImageElement, HTMLElement>();
    private backgroundFrameKeys = new Map<HTMLElement, string>();
    private canvasReaderSignature?: string;
    private canvasReaderSamePageSignatureSkips = 0;
    // Keeps viewport shifts O(1) on pages proven free of reader rasters.
    private readerRasterFreeMemo?: { href: string; free: boolean };
    private readerRasterPoll = 0;
    private readerRasterRetryTimer = 0;
    private readonly pendingCanvasSnapshots = new Map<HTMLCanvasElement, PendingCanvasSnapshot>();
    // Stable-location keys survive equivalent NFBR canvas-node swaps.
    private readonly canvasContentReadiness = new Map<string, string>();
    private readonly canvasCaptureAttempts = new Map<HTMLCanvasElement, number>();
    private readonly canvasMirrorWaitStartedAt = new Map<HTMLCanvasElement, number>();
    private readonly canvasCommitMismatches = new Map<HTMLCanvasElement, number>();
    // A recycled canvas reopens terminally paused capture for genuinely new content.
    private readonly canvasFailureContentTokens = new Map<HTMLCanvasElement, string>();
    private readonly readerRasterEmptyScans = new Map<string, number>();
    private readonly readerRasterFailedScans = new Set<string>();
    private readonly readerRasterProviderFailures = new Map<string, number>();
    private readonly readerRasterProviderRetryTimers = new Map<string, number>();
    // Bounded tap-mode retries survive late repaint/signature churn without enabling auto-OCR.
    private readonly canvasTapRecapture = new Map<HTMLCanvasElement, number>();
    private readonly ocrWordRenderStates = new OcrWordRenderStateRegistry();
    private readonly pointerActivatedOcrLines = new WeakMap<HTMLElement, number>();
    private readonly replacementOcrLines = new WeakMap<HTMLElement, HTMLElement>();
    private readonly lookupLineLeases = new Map<HTMLElement, Set<OcrLookupLineLease>>();
    private recentTouchOcrPoint?: { clientX: number; clientY: number; at: number };
    private readonly handleMediaPause = (event: Event) => this.snapshotPausedVideo(event.target);
    private readonly handleManualFrameRequest = (event: Event) => {
        const video = (event as CustomEvent<{ video?: HTMLVideoElement }>).detail?.video;
        if (video) this.snapshotPausedVideo(video, true);
    };
    private readonly handleMediaResume = (event: Event) => this.releaseVideoFrame(event.target);
    private readonly handleMediaSeeked = (event: Event) => this.refreshVideoFrameAfterSeek(event.target);
    private readonly handleDocumentPointerDown = (event: Event) => {
        this.unpinOcrLinesFromDocumentEvent(event);
        this.requestOcrFromPointerEvent(event);
    };
    private readonly handleDocumentTouchStart = (event: Event) => {
        this.unpinOcrLinesFromDocumentEvent(event);
        this.requestOcrFromTouchEvent(event);
    };
    private readonly handleDocumentPointerOver = (event: Event) => this.requestOcrFromPointerEvent(event);
    private readonly handleDocumentPointerMove = (event: Event) => this.requestOcrFromPointerEvent(event);
    private readonly handleDocumentClick = (event: Event) => this.unpinOcrLinesFromDocumentEvent(event);
    private readonly handleDocumentScroll = () => this.handleOcrViewportShift(120);
    private readonly handleWindowScroll = () => this.handleOcrViewportShift(240);
    private readonly handleWindowResize = () => {
        forgetAllComposedOcrSurfaceTransforms();
        this.handleOcrViewportShift(300);
    };
    private readonly handleVisualViewportResize = () => {
        forgetAllComposedOcrSurfaceTransforms();
        this.handleOcrViewportShift(120);
    };
    private readonly handleSpaNavigation = () => this.teardownForNavigation();

    constructor(private readonly options: OcrControllerOptions) {
        for (const [key, result] of loadPersistedOcrCache()) this.cache.set(key, result);
    }

    init(): void {
        this.destroyed = false;
        forgetAllComposedOcrSurfaceTransforms();
        this.readerRasterFreeMemo = undefined;
        const body = document.body;
        if (!body) {
            document.addEventListener('DOMContentLoaded', () => {
                if (!this.destroyed) this.init();
            }, { once: true });
            return;
        }
        this.refresh();
        document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
        document.addEventListener('touchstart', this.handleDocumentTouchStart, { capture: true, passive: true });
        document.addEventListener('pointerover', this.handleDocumentPointerOver, true);
        document.addEventListener('pointermove', this.handleDocumentPointerMove, true);
        document.addEventListener('click', this.handleDocumentClick, true);
        // Media events do not bubble.
        document.addEventListener('pause', this.handleMediaPause, true);
        document.addEventListener('yomu-ocr-video-frame-request', this.handleManualFrameRequest, true);
        document.addEventListener('play', this.handleMediaResume, true);
        document.addEventListener('emptied', this.handleMediaResume, true);
        document.addEventListener('seeked', this.handleMediaSeeked, true);
        document.addEventListener('scroll', this.handleDocumentScroll, { capture: true, passive: true });
        window.addEventListener('scroll', this.handleWindowScroll, { passive: true });
        window.addEventListener('resize', this.handleWindowResize, { passive: true });
        // Rotate/fullscreen can move overlays without a window resize.
        window.addEventListener('orientationchange', this.handleWindowResize, { passive: true });
        for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
            document.addEventListener(eventName, this.handleWindowResize, true);
        }
        window.visualViewport?.addEventListener('resize', this.handleVisualViewportResize, { passive: true });
        window.visualViewport?.addEventListener('scroll', this.handleDocumentScroll, { passive: true });
        // YouTube reuses its connected player across routes; navigation must tear OCR down.
        for (const eventName of OCR_NAVIGATION_EVENTS) {
            window.addEventListener(eventName, this.handleSpaNavigation);
        }
        this.mutationObserver = new MutationObserver(mutations => this.handleRenderableMediaMutations(mutations));
        // Root scope survives SPA body replacement and direct <html> media mounts.
        this.mutationObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'src', 'srcset', 'sizes', 'loading', 'poster', 'width', 'height', 'data-yomu-canvas-ocr', 'data-page-index', 'data-mokuro-reader'],
        });
        this.startReaderRasterPollingIfNeeded();
    }

    destroy(): void {
        this.destroyed = true;
        document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
        document.removeEventListener('touchstart', this.handleDocumentTouchStart, true);
        document.removeEventListener('pointerover', this.handleDocumentPointerOver, true);
        document.removeEventListener('pointermove', this.handleDocumentPointerMove, true);
        document.removeEventListener('click', this.handleDocumentClick, true);
        document.removeEventListener('pause', this.handleMediaPause, true);
        document.removeEventListener('yomu-ocr-video-frame-request', this.handleManualFrameRequest, true);
        document.removeEventListener('play', this.handleMediaResume, true);
        document.removeEventListener('emptied', this.handleMediaResume, true);
        document.removeEventListener('seeked', this.handleMediaSeeked, true);
        document.removeEventListener('scroll', this.handleDocumentScroll, true);
        window.removeEventListener('scroll', this.handleWindowScroll);
        window.removeEventListener('resize', this.handleWindowResize);
        window.removeEventListener('orientationchange', this.handleWindowResize);
        for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
            document.removeEventListener(eventName, this.handleWindowResize, true);
        }
        window.visualViewport?.removeEventListener('resize', this.handleVisualViewportResize);
        window.visualViewport?.removeEventListener('scroll', this.handleDocumentScroll);
        for (const eventName of OCR_NAVIGATION_EVENTS) {
            window.removeEventListener(eventName, this.handleSpaNavigation);
        }
        this.releaseAllVideoFrames();
        this.releaseAllCanvasFrames();
        this.canvasTapRecapture.clear();
        this.releaseAllBackgroundFrames();
        for (const pending of this.pendingCanvasSnapshots.values()) pending.cancelled = true;
        this.pendingCanvasSnapshots.clear();
        if (this.readerRasterPoll) { window.clearInterval(this.readerRasterPoll); this.readerRasterPoll = 0; }
        if (this.readerRasterRetryTimer) { window.clearTimeout(this.readerRasterRetryTimer); this.readerRasterRetryTimer = 0; }
        this.mutationObserver?.disconnect();
        if (this.positionFrame) window.cancelAnimationFrame(this.positionFrame);
        this.clear();
    }

    refresh(options: { userRequested?: boolean } = {}): void {
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        this.syncPageScannerIsolation(settings);
        if (!ocrRuntimeActive(settings)) {
            this.releaseAllVideoFrames();
            this.clear();
            return;
        }
        // Reader rasters have no <img>, so refresh them independently.
        this.refreshCanvasReaderSurfaces(settings, options.userRequested);
        this.refreshBackgroundImageReaderSurfaces(settings, options.userRequested);
        if (!this.canScanInlineImages(Boolean(options.userRequested))) {
            this.releaseInlineImageStates();
            this.pruneDisconnectedStates();
            this.schedulePosition();
            return;
        }
        if (this.shouldSkipRefresh(settings, options)) {
            this.pruneDisconnectedStates();
            this.schedulePosition();
            return;
        }

        this.pruneDisconnectedStates();
        this.ensureObserver(settings);
        const images = this.refreshImages(settings);

        for (const image of images) {
            this.observeRefreshImage(image, settings);
        }
        this.schedulePosition();
    }

    /**
     * Re-evaluate auto-scan after something *outside* the reader's own settings
     * changes the answer at runtime — currently mokuro's own "OCR enabled"
     * (displayOCR) toggle, which the reader cannot see through its settings
     * subscription. When the page now supplies its native text layer we drop the
     * overlays the reader auto-painted before the flip, so the reader's OCR stops
     * competing with mokuro's text boxes; manually-scanned panels are kept. When
     * it no longer does, a normal refresh starts the reader's own scan.
     */
    reassessAutoScan(): void {
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        if (!ocrRuntimeActive(settings)) return;
        if (this.options.shouldAutoScan?.() === false && !hasCanvasOcrOptInSurface()) {
            this.clearAutoScannedOverlays();
            this.schedulePosition();
            return;
        }
        this.refresh();
    }

    refreshForModeChange(): void {
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        this.syncPageScannerIsolation(settings);
        if (!ocrRuntimeActive(settings)) {
            this.releaseAllVideoFrames();
            this.clear();
            return;
        }
        if (!settings.ocrAutoScanImages) {
            this.clearAutoScannedOverlays();
            this.schedulePosition();
            return;
        }
        this.refresh();
    }

    private shouldSkipRefresh(settings: ReaderSettings, options: { userRequested?: boolean }): boolean {
        if (options.userRequested) return false;
        if (this.canAutoScanImage(settings)) return false;
        return !settings.ocrAutoScanImages || !this.hasVisibleInlineOcrFallback(settings);
    }

    private handleRenderableMediaMutations(mutations: MutationRecord[]): void {
        const batch = classifyRenderableMediaMutations(mutations);
        if (!batch.mutations.length) return;
        this.invalidatePositionTransformsForMutations(batch);
        const settings = this.options.getSettings();
        if (!ocrRuntimeActive(settings)) {
            this.readerRasterFreeMemo = undefined;
            return;
        }
        const memo = this.readerRasterFreeMemo;
        if (memo && (memo.free
            ? mutationsMayAddReaderRasterCandidate(batch.mutations)
            : mutationsMayRemoveReaderRasterCandidate(batch.mutations))) {
            this.readerRasterFreeMemo = undefined;
        }
        if (!batch.touchesRenderableMedia) return;
        this.schedulePosition();
        if (!canAutoRefreshOcrAfterMutation(settings, this.options.shouldAutoScan)) return;
        this.scheduleRefresh(batch.addedImage ? 0 : 40);
    }

    private invalidatePositionTransformsForMutations(batch: RenderableMediaMutationBatch): void {
        if (batch.restylesEverySurface) {
            forgetAllComposedOcrSurfaceTransforms();
            return;
        }
        for (const image of this.states.keys()) {
            const surface = this.ocrLayerTransformSurface(image);
            if (surface && batch.mutations.some(({ target }) => {
                const element = target instanceof Element ? target : target.parentElement;
                return element === surface || Boolean(element?.contains(surface));
            })) {
                forgetComposedOcrSurfaceTransform(surface);
            }
        }
    }

    private handleOcrViewportShift(refreshDelay: number): void {
        if (!ocrRuntimeActive(this.options.getSettings())) return;
        this.schedulePosition();
        if (this.hasReaderRasterSurfaces()) {
            this.scheduleReaderRasterRefresh(refreshDelay);
            return;
        }
        this.scheduleRefresh(refreshDelay);
    }

    private hasReaderRasterSurfaces(): boolean {
        if (this.canvasFrames.size > 0
            || this.canvasPendingStatuses.size > 0
            || this.backgroundFrames.size > 0) return true;
        // The memo keeps this O(1) and querySelector-free on non-reader pages
        // (the inert-raster hardening). On reader pages the cheap host check
        // replaces the full canvas/background census that ran on every scroll
        // and regressed BookWalker continuous-mode smoothness.
        if (this.isProvenRasterFreePage()) return false;
        return isReaderRasterPage();
    }

    private hasReaderRasterCaptureWork(): boolean {
        return this.canvasFrames.size > 0
            || this.canvasPendingStatuses.size > 0
            || this.backgroundFrames.size > 0
            || isReaderRasterPage();
    }

    private hasTrackedManualCanvasSurface(): boolean {
        for (const canvas of this.canvasFrames.keys()) {
            if (isManualCanvasReaderSurface(canvas)) return true;
        }
        for (const canvas of this.canvasPendingStatuses.keys()) {
            if (isManualCanvasReaderSurface(canvas)) return true;
        }
        return false;
    }

    // A "free" verdict is provable from layout-free facts alone and stays valid
    // until a mutation could add a candidate (observer invalidates) or the SPA
    // navigates (href key). A "not free" verdict just means the full sweeps must
    // run, exactly as before the memo existed — canvas paint can change their
    // answer without any DOM mutation, so it is never trusted beyond that.
    private isProvenRasterFreePage(): boolean {
        const memo = this.readerRasterFreeMemo;
        if (memo && memo.href === location.href) return memo.free;
        const free = !pageHasReaderRasterCandidates();
        this.readerRasterFreeMemo = { href: location.href, free };
        return free;
    }

    private hasVisibleInlineOcrFallback(settings: ReaderSettings): boolean {
        if (!this.canScanInlineImages(false)) return false;
        return Array.from(document.images).some(image => {
            if (!readFallbackOcrResult(image, false)) return false;
            return isCandidateImage(image, settings) && shouldObserveImage(image, settings);
        });
    }

    private refreshImages(settings: ReaderSettings): HTMLImageElement[] {
        return Array.from(document.images)
            .filter(image => isCandidateImage(image, settings) && shouldObserveImage(image, settings))
            .sort((a, b) => this.compareRefreshImages(a, b))
            .slice(0, imageReaderMaxImages(settings));
    }

    private compareRefreshImages(a: HTMLImageElement, b: HTMLImageElement): number {
        const priorityDelta = this.observePriority(a) - this.observePriority(b);
        return priorityDelta || imageViewportDistance(a) - imageViewportDistance(b);
    }

    private observeRefreshImage(image: HTMLImageElement, settings: ReaderSettings): void {
        const state = this.ensureState(image);
        this.resetStateIfImageChanged(state);
        this.observer?.observe(image);
        if (this.shouldAutoEnqueueImage(image, state, settings)) this.enqueue(image);
    }

    private shouldAutoEnqueueImage(image: HTMLImageElement, state: ImageState, settings: ReaderSettings): boolean {
        return (this.canAutoScanImage(settings) || (settings.ocrAutoScanImages && hasInlineOcrFallback(image)))
            && isOcrImageStateIdle(state)
            && isNearViewport(image, imagePrefetchMargin(settings));
    }

    private canAutoScanImage(settings: ReaderSettings): boolean {
        return settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false;
    }

    private canScanInlineImages(userRequested: boolean): boolean {
        // A full-page raster capture is the authoritative reader image. BookWalker
        // also keeps decoded source <img>s mounted behind its canvas; auto-scanning
        // those starts a second OCR job, flashes a terminal pill for the hidden image,
        // and competes with the mirror capture that actually owns hit testing.
        // Keep explicit/manual inline-image OCR available for mixed-content pages.
        if (!userRequested && this.hasActiveReaderRasterOwnership()) return false;
        return this.options.shouldScanInlineImages?.(userRequested) !== false;
    }

    private hasActiveReaderRasterOwnership(): boolean {
        return this.canvasFrames.size > 0
            || this.canvasPendingStatuses.size > 0
            || this.pendingCanvasSnapshots.size > 0
            || this.backgroundFrames.size > 0;
    }

    async scanVisible(): Promise<void> {
        // An explicit user scan always re-verifies the page instead of trusting
        // the memoized raster-free verdict.
        this.readerRasterFreeMemo = undefined;
        const settings = this.options.getSettings();
        const retriedReaderFrames = this.retryVisibleReaderRasterFrames(settings);
        this.refresh({ userRequested: true });
        if (!this.canScanInlineImages(true)) {
            if (!retriedReaderFrames) this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, 'ocrNoReadableImages'));
            return;
        }
        const images = [...this.states.keys()].filter(image => isCandidateImage(image, settings) && isNearViewport(image, 120));
        if (!images.length) {
            // Canvas capture is asynchronous. Reporting "no images" while a
            // BookWalker mirror is being fetched is both false and noisy.
            if (!retriedReaderFrames && !this.hasReaderRasterCaptureWork()) {
                this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, 'ocrNoReadableImages'));
            }
            return;
        }
        images.forEach(image => this.enqueue(image, true));
        log.info('Manual OCR scan queued images', { images: images.length });
    }

    captureSourceImageForElement(element: Element | null): string | undefined {
        const staleLine = element?.closest?.<HTMLElement>('.jpdb-ocr-line');
        if (!staleLine) return undefined;
        const line = this.currentOcrLine(staleLine);
        const state = [...this.states.values()].find(candidate => candidate.overlay.contains(line));
        if (!state) return undefined;
        const image = captureImageElement(state.image);
        return image;
    }

    pinLineForElement(element: Element | null): void {
        const staleLine = element?.closest?.<HTMLElement>('.jpdb-ocr-line');
        if (!staleLine) return;
        const line = this.currentOcrLine(staleLine);
        const state = [...this.states.values()].find(candidate => candidate.overlay.contains(line));
        if (state) this.pinLine(state, line);
    }

    unpinLineForElement(element: Element | null): void {
        const staleLine = element?.closest?.<HTMLElement>('.jpdb-ocr-line');
        const line = staleLine ? this.currentOcrLine(staleLine) : undefined;
        if (line?.dataset.pinned === 'true') this.unpinLine(line);
    }

    retainLineForLookup(element: Element | null): (() => void) | undefined {
        const staleLine = element?.closest?.<HTMLElement>('.jpdb-ocr-line');
        if (!staleLine) return undefined;
        const line = this.currentOcrLine(staleLine);
        const state = [...this.states.values()].find(candidate => candidate.overlay.contains(line));
        const lease: OcrLookupLineLease = { line };
        const leases = this.lookupLineLeases.get(line) ?? new Set<OcrLookupLineLease>();
        leases.add(lease);
        this.lookupLineLeases.set(line, leases);
        // Gaming and other native shells can host the shared OCR markup
        // without an ImageState. They still need the same transient active
        // lease while a lookup covers the source line; only controller-owned
        // lines need markup activation and geometry scheduling.
        if (state) this.activateOcrLineMarkup(state, line);
        this.syncOcrLineActiveState(line);
        if (state) this.schedulePosition();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const currentLine = lease.line;
            lease.line = undefined;
            if (!currentLine) return;
            const current = this.lookupLineLeases.get(currentLine);
            if (!current?.delete(lease)) return;
            if (current.size === 0) this.lookupLineLeases.delete(currentLine);
            this.syncOcrLineActiveState(currentLine);
            if (state) this.schedulePosition();
        };
    }

    private ensureObserver(settings: ReaderSettings): void {
        const rootMargin = `${imagePrefetchMargin(settings)}px 0px`;
        if (this.observer && this.observerMargin === rootMargin) return;
        this.observer?.disconnect();
        this.observerMargin = rootMargin;
        if (typeof IntersectionObserver !== 'function') {
            this.observer = undefined;
            return;
        }
        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const image = entry.target as HTMLImageElement;
                this.positionState(image);
                const current = this.options.getSettings();
                const state = this.states.get(image);
                if (state && this.shouldAutoEnqueueImage(image, state, current)) this.enqueue(image);
            }
        }, { rootMargin });
    }

    private ensureState(image: HTMLImageElement): ImageState {
        const existing = this.states.get(image);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';
        overlay.dataset.ocrLayerId = String(++ocrLayerCounter);
        overlay.hidden = true;
        setOcrOverlayAccessibility(overlay, false);

        this.mountOcrOverlayForImage(overlay, image);

        const state: ImageState = { image, overlay, key: imageCacheKey(image), target: captureOcrTargetContext(), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
        const loadListener = (): void => {
            this.resetStateIfImageChanged(state);
            this.schedulePosition();
            this.scheduleRefresh(0);
        };
        state.loadListener = loadListener;
        image.addEventListener('load', loadListener);
        this.states.set(image, state);
        if (image.complete && image.naturalWidth > 0) {
            this.schedulePosition();
            const settings = this.options.getSettings();
            if (this.canAutoScanImage(settings) || (settings.ocrAutoScanImages && hasInlineOcrFallback(image))) this.enqueue(image);
        }
        return state;
    }

    private mountOcrOverlayForImage(overlay: HTMLElement, image: HTMLImageElement): void {
        const video = this.videoFrameVideos.get(image);
        appendOcrArtifactToRoot(overlay, video ? videoFrameArtifactRoot(video) : document.body);
    }

    private enqueue(image: HTMLImageElement, userRequested = false): void {
        if (isYouTubeThumbnailImage(image)) return;
        const state = this.states.get(image) ?? this.ensureState(image);
        this.resetStateIfImageChanged(state);
        if (!this.shouldQueueOcrRequest(state, image, userRequested)) return;
        this.queueOcrRequest(image);
    }

    private shouldQueueOcrRequest(state: ImageState, image: HTMLImageElement, userRequested: boolean): boolean {
        if (shouldSkipOcrRequest(state, userRequested)) return false;
        const forceExistingOverlay = userRequested && !state.overlayRequested;
        updateOcrRequestFlags(state, image, userRequested);
        if (this.renderExistingOcrResult(state, forceExistingOverlay)) return false;
        return !state.loading;
    }

    private queueOcrRequest(image: HTMLImageElement): void {
        this.queueImageForOcr(image);
        this.drainQueue();
    }

    private renderExistingOcrResult(state: ImageState, userRequested: boolean): boolean {
        if (!state.result) return false;
        if (userRequested) void this.renderResult(state, state.result, true);
        return true;
    }

    private requestOcrFromPointerEvent(event: Event): boolean {
        if (this.isDuplicateTouchPointerOcrEvent(event)) return false;
        const settings = this.options.getSettings();
        const image = ocrImageFromPointerEvent(event, settings);
        if (image) {
            if (!this.canScanInlineImages(true)) return false;
            if (event.type === 'pointermove' && image === this.lastPointerMoveImage) return false;
            if (event.type === 'pointermove') this.lastPointerMoveImage = image;
            else this.lastPointerMoveImage = undefined;
            this.lastPointerMoveReaderSurface = undefined;
            this.lastPointerMoveReaderSurfaceKey = undefined;
            this.enqueue(image, true);
            return true;
        }
        const surface = ocrReaderSurfaceFromPointerEvent(event, settings, this.isProvenRasterFreePage());
        if (!surface) return false;
        // Auto mode owns reader canvases through the stable full-page poll. Treating
        // pointermove/pointerover as a manual request captures only the visible crop;
        // scrolling then changes that crop and repeatedly tears down/re-OCRs the same
        // page. A failed status card remains the explicit retry control.
        const autoOwnsSurface = settings.ocrAutoScanImages
            && this.options.shouldAutoScan?.() !== false
            && !(surface instanceof HTMLCanvasElement && isManualCanvasReaderSurface(surface));
        if (autoOwnsSurface) return false;
        const surfaceKey = readerRasterSurfaceSnapshotKey(surface);
        if (event.type === 'pointermove' && surface === this.lastPointerMoveReaderSurface && surfaceKey === this.lastPointerMoveReaderSurfaceKey) return false;
        if (event.type === 'pointermove') {
            this.lastPointerMoveReaderSurface = surface;
            this.lastPointerMoveReaderSurfaceKey = surfaceKey;
        } else {
            this.lastPointerMoveReaderSurface = undefined;
            this.lastPointerMoveReaderSurfaceKey = undefined;
        }
        void this.snapshotReaderSurface(surface, settings);
        return true;
    }

    private requestOcrFromTouchEvent(event: Event): void {
        const point = touchPointFromEvent(event);
        if (!point) return;
        if (this.requestOcrFromPointerEvent(eventWithPoint(event, point))) {
            this.recentTouchOcrPoint = { ...point, at: Date.now() };
        }
    }

    private isDuplicateTouchPointerOcrEvent(event: Event): boolean {
        if (event.type !== 'pointerdown' || !isPointerLikeEvent(event) || event.pointerType !== 'touch') return false;
        const recent = this.recentTouchOcrPoint;
        if (!recent) return false;
        if (Date.now() - recent.at > 700) {
            this.recentTouchOcrPoint = undefined;
            return false;
        }
        return Math.abs(event.clientX - recent.clientX) <= 6 && Math.abs(event.clientY - recent.clientY) <= 6;
    }

    private async snapshotReaderSurface(surface: HTMLCanvasElement | HTMLElement, settings: ReaderSettings): Promise<void> {
        if (surface instanceof HTMLCanvasElement) {
            const existing = this.canvasFrames.get(surface);
            if (existing?.complete && existing.naturalWidth > 0) {
                this.enqueue(existing, true);
                return;
            }
            await this.snapshotCanvasSurface(surface, settings, true);
            // A newly created frame is queued exclusively by its load listener.
            // Queuing here races image decode and used to poison the page with an
            // "Image is not loaded yet" failure before the valid load event arrived.
            return;
        }
        const existing = this.backgroundFrames.get(surface);
        if (existing?.complete && existing.naturalWidth > 0) {
            this.enqueue(existing, true);
            return;
        }
        this.snapshotBackgroundImageSurface(surface, settings, true);
    }

    private queueImageForOcr(image: HTMLImageElement): void {
        if (!this.queue.includes(image)) this.queue.push(image);
    }

    private drainQueue(): void {
        if (this.destroyed) return;
        const limit = ocrConcurrencyLimit(this.options.getSettings());
        while (this.activeScans < limit) {
            const image = this.takeNextQueuedImage();
            if (!image) return;
            this.startScan(image);
        }
    }

    // Hold duplicate content until the in-flight scan fills its shared cache entry.
    private takeNextQueuedImage(): HTMLImageElement | undefined {
        for (let index = 0; index < this.queue.length; index++) {
            const candidate = this.queue[index];
            if (this.inFlightJobs.has(ocrTargetWorkKey(imageCacheKey(candidate)))) continue;
            this.queue.splice(index, 1);
            return candidate;
        }
        return undefined;
    }

    private startScan(image: HTMLImageElement): void {
        if (this.destroyed) return;
        const target = captureOcrTargetContext();
        const work = ocrTargetWork(imageCacheKey(image), target);
        const key = work.workKey;
        const job = Symbol(key);
        this.activeScans++;
        this.inFlightJobs.set(key, job);
        const hasFastText = Boolean(readFallbackOcrResult(image, false));
        // Dedicated manga frames skip the idle used to batch incidental page images.
        const isReaderRasterFrame = this.isReaderRasterFrame(image);
        const delay = this.cache.has(work.cacheKey) || this.states.get(image)?.overlayRequested || hasFastText || isReaderRasterFrame || this.videoFrameVideos.has(image) ? 0 : 900;
        void waitForIdle(delay, delay)
            .then(() => this.scanImage(image, target))
            .catch(error => {
                if (isStaleOcrState(error)) return;
                log.warn('OCR scan task failed unexpectedly', {}, error);
            })
            .finally(() => {
                this.activeScans = Math.max(0, this.activeScans - 1);
                if (this.inFlightJobs.get(key) === job) this.inFlightJobs.delete(key);
                if (!this.destroyed) this.drainQueue();
            });
    }

    private async scanImage(image: HTMLImageElement, target = captureOcrTargetContext()): Promise<void> {
        if (this.destroyed) return;
        target.requireCurrent(STALE_OCR_STATE);
        // Do not let a job waiting in the batching idle resurrect state cleared by pause.
        if (!ocrRuntimeActive(this.options.getSettings())) return;
        const existingState = this.states.get(image);
        if (!image.isConnected) {
            if (existingState) this.releaseImageState(image, existingState);
            return;
        }
        const state = existingState ?? this.ensureState(image);
        const settings = this.options.getSettings();
        const manualRequested = state.manualRequested;
        this.resetStateIfImageChanged(state);
        const work = ocrTargetWork(state.key, target);
        if (await this.tryRenderCachedOcrResult(state, work)) return;
        if (!this.isCurrentContentState(state, work.contentKey)) return;

        this.updateOcrStatus(image, 'loading');
        const scan = beginOcrScan(state, image, settings, manualRequested);

        try {
            await this.scanUncachedImage(state, image, work, settings, scan.provider, manualRequested);
        } catch (error) {
            if (isStaleOcrState(error)) return;
            try {
                await this.renderOcrFailure(state, image, work, scan.provider, manualRequested, error);
            } catch (renderError) {
                if (isStaleOcrState(renderError)) return;
                throw renderError;
            }
        } finally {
            releaseOcrScan(state, scan.token);
            scan.done();
        }
    }

    private async renderCachedOcrResult(state: ImageState, work: OcrTargetWork): Promise<boolean> {
        work.target.requireCurrent(STALE_OCR_STATE);
        if (this.isReaderRasterFrame(state.image) && !state.manualRequested && this.readerRasterFailedScans.has(work.workKey)) {
            this.requireCurrentContentState(state, work.contentKey);
            this.renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'failed');
            state.manualRequested = false;
            return true;
        }
        if (!this.cache.has(work.cacheKey)) return false;
        if (this.shouldSuppressAutoRenderedResult(state, false)) {
            this.clearAutoScannedOverlays();
            return true;
        }
        const cached = this.cache.get(work.cacheKey);
        this.requireCurrentContentState(state, work.contentKey);
        if (!cached) {
            if (this.isReaderRasterFrame(state.image)) {
                const emptyScanKey = this.readerRasterEmptyScanKey(state, work);
                if ((this.readerRasterEmptyScans.get(emptyScanKey) ?? 0) >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) {
                    this.renderNoOcrLines(state);
                    this.updateOcrStatus(state.image, 'empty');
                    state.manualRequested = false;
                    return true;
                }
                this.forget(work.cacheKey);
                return false;
            }
            if (this.shouldPreserveReaderRasterResult(state)) return true;
            this.renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'empty');
            state.manualRequested = false;
            return true;
        }
        await this.renderResult(state, cached, false, work);
        state.manualRequested = false;
        return true;
    }

    private async tryRenderCachedOcrResult(state: ImageState, work: OcrTargetWork): Promise<boolean> {
        try {
            return await this.renderCachedOcrResult(state, work);
        } catch (error) {
            if (isStaleOcrState(error)) return true;
            throw error;
        }
    }

    private async scanUncachedImage(
        state: ImageState,
        image: HTMLImageElement,
        work: OcrTargetWork,
        settings: ReaderSettings,
        provider: string,
        manualRequested: boolean,
    ): Promise<void> {
        const inlineFallback = readFallbackOcrResult(image, false);
        // Bound canvas encoding plus fallback transports; an HTTP timer alone misses a hung WebKit encode.
        const providerResult = inlineFallback ? null : await promiseWithTimeout(
            this.recognizeImage(image, settings),
            ocrAttemptTimeoutMs(settings, this.options.ocrAttemptTimeoutFloorMs),
            'OCR timed out.',
        );
        work.target.requireCurrent(STALE_OCR_STATE);
        this.requireCurrentContentState(state, work.contentKey);
        const result = inlineFallback ?? providerResult;
        if (!result?.lines.length) {
            this.readerRasterFailedScans.delete(work.workKey);
            this.clearReaderRasterProviderRetry(work.workKey);
            if (this.shouldPreserveReaderRasterResult(state)) {
                this.updateOcrStatus(image, 'ready');
                return;
            }
            const readerRasterEmptyAttempts = this.isReaderRasterFrame(image)
                ? this.recordReaderRasterEmptyScan(state, work, manualRequested)
                : 0;
            if (this.isReaderRasterFrame(image)) {
                if (!manualRequested && readerRasterEmptyAttempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) {
                    this.remember(work.cacheKey, null);
                } else {
                    this.forget(work.cacheKey);
                }
            } else {
                this.remember(work.cacheKey, null);
            }
            this.requireCurrentContentState(state, work.contentKey);
            this.renderNoOcrLines(state);
            this.updateOcrStatus(
                image,
                this.isReaderRasterFrame(image) && readerRasterEmptyAttempts < READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS
                    ? 'loading'
                    : 'empty',
            );
            return;
        }

        this.remember(work.cacheKey, result);
        this.readerRasterEmptyScans.delete(this.readerRasterEmptyScanKey(state, work));
        this.readerRasterFailedScans.delete(work.workKey);
        this.clearReaderRasterProviderRetry(work.workKey);
        this.requireCurrentContentState(state, work.contentKey);
        // If a native text layer appeared mid-scan, cache the result without competing onscreen.
        if (this.shouldSuppressAutoRenderedResult(state, Boolean(inlineFallback), manualRequested)) {
            this.clearAutoScannedOverlays();
            return;
        }
        await this.renderResult(state, result, false, work);
        log.info('OCR result rendered', { provider, lines: result.lines.length, manualRequested });
    }

    private shouldSuppressAutoRenderedResult(state: ImageState, inlineFallback: boolean, manualRequested = state.manualRequested): boolean {
        return !manualRequested
            && !state.overlayRequested
            && !inlineFallback
            && !this.isReaderRasterOcrOptInFrame(state.image)
            && this.options.shouldAutoScan?.() === false;
    }

    private isReaderRasterOcrOptInFrame(image: HTMLImageElement): boolean {
        const canvas = this.canvasFrameSources.get(image);
        return Boolean(canvas && isCanvasOcrOptInSurface(canvas));
    }

    private async renderOcrFailure(
        state: ImageState,
        image: HTMLImageElement,
        work: OcrTargetWork,
        provider: string,
        manualRequested: boolean,
        error: unknown,
    ): Promise<void> {
        work.target.requireCurrent(STALE_OCR_STATE);
        this.requireCurrentContentState(state, work.contentKey);
        const fallback = readFallbackOcrResult(image, false);
        if (fallback?.lines.length) {
            log.warn('OCR provider failed', { provider }, error);
            this.readerRasterFailedScans.delete(work.workKey);
            this.clearReaderRasterProviderRetry(work.workKey);
            await this.renderResult(state, fallback, false, work);
            return;
        }
        if (this.isReaderRasterFrame(image) && this.scheduleReaderRasterProviderRetry(state, work, manualRequested, error)) {
            this.updateOcrStatus(image, 'loading');
            return;
        }
        if (this.isReaderRasterFrame(image)) {
            this.clearReaderRasterProviderRetry(work.workKey);
            this.rememberReaderRasterFailure(work.workKey);
        }
        logOcrFailure(state, provider, manualRequested, error);
        this.updateOcrStatus(image, 'failed');
    }

    private recognizeImage(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
        const recognizer = ocrRecognizer(settings);
        if (!recognizer) return Promise.resolve(null);
        if (this.shouldSplitBookwalkerSpreadFrame(image)) return this.recognizeBookwalkerSpreadFrame(image, settings, recognizer);
        return this.recognizeWithDarkPass(image, settings, recognizer);
    }

    private shouldSplitBookwalkerSpreadFrame(image: HTMLImageElement): boolean {
        const canvas = this.canvasFrameSources.get(image);
        if (!canvas || !isWideBookwalkerSpreadCanvas(canvas)) return false;
        try {
            const size = loadedImageSize(image);
            return size.width / Math.max(1, size.height) >= BOOKWALKER_SPREAD_MIN_ASPECT;
        } catch {
            return false;
        }
    }

    private async recognizeBookwalkerSpreadFrame(
        image: HTMLImageElement,
        settings: ReaderSettings,
        recognizer: OcrRecognizer,
    ): Promise<OcrResult | null> {
        const slices = await splitImageIntoPageColumns(image);
        const results = await Promise.all(slices.map(async slice => {
            const result = await this.recognizeWithDarkPass(slice.image, settings, recognizer).catch(() => null);
            return result ? offsetOcrResult(result, slice.left, 0, slice.totalWidth, slice.totalHeight) : null;
        }));
        return mergeOcrResults(slices[0]?.totalWidth ?? 0, slices[0]?.totalHeight ?? 0, results);
    }

    // Normal recognition always runs. A second, inverted pass is spent only when
    // the image has a dark region (where white-on-black text could hide) AND that
    // region came back unread by the normal pass. Full-page reader canvases are
    // the latency-sensitive path: if the normal pass found text on a manga page,
    // don't double the provider round-trip just to search dark art regions. If a
    // reader page comes back empty, the inverted recovery still gets a chance.
    private async recognizeWithDarkPass(
        image: HTMLImageElement,
        settings: ReaderSettings,
        recognizer: OcrRecognizer,
    ): Promise<OcrResult | null> {
        const normal = await this.runRecognizer(image, settings, recognizer, false);
        if (!settings.ocrInvertDarkPanels) return normal;
        const field = buildLuminanceField(image);
        if (!field || luminanceFieldDarkFraction(field) < DARK_REGION_TRIGGER) return normal;
        if ((this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image)) && normal?.lines.length) return normal;
        if (darkAreaIsRead(field, normal)) return normal;
        const inverted = await this.runRecognizer(image, settings, recognizer, true).catch(() => null);
        return mergeDarkPassResult(normal, inverted, field);
    }

    private runRecognizer(
        image: HTMLImageElement,
        settings: ReaderSettings,
        recognizer: OcrRecognizer,
        invert: boolean,
    ): Promise<OcrResult | null> {
        if (settings.ocrProvider !== 'local-service') return recognizer(image, settings, invert);
        return this.recognizeViaLocalServiceWithBackoff(image, settings, recognizer, invert);
    }

    private async recognizeViaLocalServiceWithBackoff(
        image: HTMLImageElement,
        settings: ReaderSettings,
        recognizer: OcrRecognizer,
        invert: boolean,
    ): Promise<OcrResult | null> {
        const endpointUrl = localOcrEndpointUrl(settings);
        if (this.isLocalOcrUnavailable(endpointUrl)) throw new LocalOcrUnavailableError(endpointUrl);
        try {
            const result = await recognizer(image, settings, invert);
            this.clearLocalOcrUnavailable(endpointUrl);
            return result;
        } catch (error) {
            if (isLocalOcrConnectionError(error)) this.rememberLocalOcrUnavailable(endpointUrl);
            throw error;
        }
    }

    private isLocalOcrUnavailable(endpointUrl: string): boolean {
        const unavailable = this.localOcrUnavailable;
        if (!unavailable || unavailable.endpointUrl !== endpointUrl) return false;
        if (Date.now() < unavailable.retryAt) return true;
        this.localOcrUnavailable = undefined;
        return false;
    }

    private rememberLocalOcrUnavailable(endpointUrl: string): void {
        this.localOcrUnavailable = { endpointUrl, retryAt: Date.now() + LOCAL_OCR_UNAVAILABLE_RETRY_MS };
    }

    private clearLocalOcrUnavailable(endpointUrl: string): void {
        if (this.localOcrUnavailable?.endpointUrl === endpointUrl) this.localOcrUnavailable = undefined;
    }

    private async renderResult(
        state: ImageState,
        result: OcrResult,
        forceOverlay = false,
        work = ocrTargetWork(state.key),
    ): Promise<void> {
        this.requireCurrentContentState(state, work.contentKey);
        work.target.requireCurrent(STALE_OCR_STATE);
        if (
            this.shouldPreserveReaderRasterResult(state)
            && state.overlay.querySelector('.jpdb-ocr-line')
            && ocrResultTextKey(state.result) === ocrResultTextKey(result)
        ) {
            this.updateOcrStatus(state.image, 'ready');
            return;
        }
        state.result = result;

        const settings = this.options.getSettings();
        const showText = this.shouldShowOcrTextOverlay(state, settings, forceOverlay);

        const initialParsed = await this.parseOcrLines(result.lines);
        this.requireCurrentContentState(state, work.contentKey);
        work.target.requireCurrent(STALE_OCR_STATE);
        const lines = cleanOcrLookupLines(result.lines, initialParsed);
        if (!lines.length) {
            if (this.shouldPreserveReaderRasterResult(state)) {
                this.updateOcrStatus(state.image, 'ready');
                return;
            }
            this.renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'empty');
            return;
        }
        const parsed = ocrLinesChanged(result.lines, lines)
            ? await this.parseOcrLines(lines)
            : initialParsed;
        this.requireCurrentContentState(state, work.contentKey);
        work.target.requireCurrent(STALE_OCR_STATE);
        const sentence = lines.map(line => line.text).join('\n');
        const vocabulary = ocrVocabularyCards(state.image);
        const fallbackCardFromText = ocrFallbackCardFromImage(
            state.image,
            this.options.fallbackCardFromText ?? ocrFallbackCardFromText,
        );
        const renderedTokens = lines.map((line, index) => ocrTokensWithFallbackGaps(
            line.text,
            ocrTokensWithVocabulary(line.text, parsed[index] ?? [], vocabulary),
            fallbackCardFromText,
        ));
        const flatTokens = renderedTokens.flat();
        await this.options.enrichTokensBeforeRender?.(flatTokens);
        this.requireCurrentContentState(state, work.contentKey);
        work.target.requireCurrent(STALE_OCR_STATE);
        applyOcrOverlayStyle(state.overlay, settings);

        const lineElements = lines.map((line, index) => (
            this.renderOcrLineElement(state, result, line, renderedTokens[index] ?? [], sentence, showText, settings)
        ));
        const staleLines = Array.from(state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line'));
        state.overlay.append(...lineElements);
        this.migrateOcrLineInteractionState(state, staleLines, lineElements);
        staleLines.forEach(node => node.remove());
        this.revealVideoFrameOverlay(state.image);
        this.positionState(state.image);
        if (this.canvasFrameSources.has(state.image)) {
            this.canvasReaderSignature = canvasReaderPageSignature();
            this.canvasReaderSamePageSignatureSkips = 0;
        }
        this.updateOcrStatus(state.image, 'ready');
        void Promise.resolve(this.options.enrichRenderedTokens?.(flatTokens, state.overlay))
            .catch(error => {
                if (isStaleOcrState(error)) return;
                log.warn('OCR rendered token enrichment failed', {}, error);
            })
            .finally(() => this.schedulePosition());
    }

    private shouldShowOcrTextOverlay(state: ImageState, settings: ReaderSettings, forceOverlay: boolean): boolean {
        if (this.isScannedPdfCanvasFrame(state.image)) return false;
        if (this.isReaderRasterFrame(state.image)) return false;
        void settings;
        void forceOverlay;
        return false;
    }

    private isScannedPdfCanvasFrame(image: HTMLImageElement): boolean {
        const canvas = this.canvasFrameSources.get(image);
        return Boolean(canvas
            && (canvas.dataset.pdfText === 'scanned'
                || canvas.closest('.pdf-page[data-pdf-text="scanned"]')));
    }

    private async parseOcrLines(lines: OcrLine[]): Promise<JPDBToken[][]> {
        const options = ocrParseOptions();
        const texts = lines.map(line => line.text);
        if (this.options.parseJapaneseBatch) {
            return this.options.parseJapaneseBatch(texts, options)
                .then(parsed => texts.map((_, index) => parsed[index] ?? []))
                .catch(() => texts.map(() => []));
        }
        return Promise.all(lines.map(line => this.options.parseJapanese(line.text, options).catch(() => {
            return [];
        })));
    }

    private renderOcrLineElement(
        state: ImageState,
        result: OcrResult,
        line: OcrLine,
        tokens: JPDBToken[],
        sentence: string,
        showText: boolean,
        settings: ReaderSettings,
    ): HTMLElement {
        const element = createOcrLineElement(result, line, tokens, sentence, showText, settings);
        this.rememberOcrWordRenderStates(element, tokens);
        element.addEventListener('pointerenter', () => this.activateOcrLineMarkup(state, element));
        element.addEventListener('focusin', () => this.activateOcrLineMarkup(state, element));
        element.addEventListener('pointerdown', event => this.activateOcrLineFromPointer(state, element, event), true);
        element.addEventListener('keydown', event => this.toggleOcrLinePinnedFromKeyboard(state, element, event));
        element.addEventListener('click', event => this.toggleOcrLinePinned(state, element, event));
        return element;
    }

    private activateOcrLineFromPointer(state: ImageState, element: HTMLElement, event: PointerEvent): void {
        if (event.button !== 0) return;
        if (element.dataset.pinned === 'true') {
            this.activateOcrLineMarkup(state, element);
            return;
        }
        if (shouldPinOcrLineFromPointer(event)) {
            element.focus({ preventScroll: true });
            this.pinLine(state, element);
        } else {
            this.activateOcrLineMarkup(state, element);
        }
        this.pointerActivatedOcrLines.set(element, Date.now());
    }

    private toggleOcrLinePinnedFromKeyboard(state: ImageState, element: HTMLElement, event: KeyboardEvent): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (element.dataset.pinned === 'true') {
            this.unpinLine(element);
        } else {
            this.pinLine(state, element);
        }
        event.preventDefault();
        event.stopPropagation();
    }

    private toggleOcrLinePinned(state: ImageState, element: HTMLElement, event: MouseEvent): void {
        if (this.wasRecentlyPointerActivated(element)) {
            // The pointerdown handler already made tapped OCR text active before
            // popup lookup handlers run. Keep the following synthetic click from
            // toggling the line or leaving desktop mouse OCR text stuck visible.
            this.activateOcrLineMarkup(state, element);
        } else if (element.dataset.pinned === 'true') {
            this.unpinLine(element);
        } else {
            this.activateOcrLineMarkup(state, element);
        }
        // UT-77b: OCR overlays often sit on top of links (video thumbnails) —
        // the click must never fall through to the host anchor and navigate.
        // Word lookups are unaffected: they run in the document CAPTURE
        // phase, which has already fired by the time this bubble handler runs.
        event.preventDefault();
        event.stopPropagation();
    }

    private wasRecentlyPointerActivated(element: HTMLElement): boolean {
        const activatedAt = this.pointerActivatedOcrLines.get(element);
        if (activatedAt === undefined) return false;
        const recent = Date.now() - activatedAt < 800;
        if (!recent) this.pointerActivatedOcrLines.delete(element);
        return recent;
    }

    private pinLine(state: ImageState, element: HTMLElement): void {
        state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line[data-pinned="true"]').forEach(line => {
            if (line !== element) this.unpinLine(line);
        });
        this.activateOcrLineMarkup(state, element);
        element.dataset.pinned = 'true';
        element.setAttribute('aria-pressed', 'true');
        this.syncOcrLineActiveState(element);
        this.schedulePosition();
    }

    private unpinLine(element: HTMLElement): void {
        element.dataset.pinned = 'false';
        element.setAttribute('aria-pressed', 'false');
        this.syncOcrLineActiveState(element);
        this.schedulePosition();
    }

    private syncOcrLineActiveState(element: HTMLElement): void {
        const retained = Boolean(this.lookupLineLeases.get(element)?.size);
        element.classList.toggle('jpdb-ocr-line-active', element.dataset.pinned === 'true' || retained);
    }

    private migrateOcrLineInteractionState(
        state: ImageState,
        staleLines: HTMLElement[],
        replacementLines: HTMLElement[],
    ): void {
        const available = new Set(replacementLines);
        const replacements = new Map<HTMLElement, HTMLElement>();
        staleLines.forEach(staleLine => {
            const identity = ocrRenderedLineIdentity(staleLine);
            const replacement = replacementLines.find(candidate => (
                available.has(candidate) && ocrRenderedLineIdentity(candidate) === identity
            ));
            if (!replacement) return;
            replacements.set(staleLine, replacement);
            available.delete(replacement);
        });
        staleLines.forEach((staleLine, index) => {
            if (replacements.has(staleLine)) return;
            const replacement = replacementLines[index];
            if (!replacement || !available.has(replacement)) return;
            replacements.set(staleLine, replacement);
            available.delete(replacement);
        });

        staleLines.forEach(staleLine => {
            const replacement = replacements.get(staleLine);
            if (replacement) {
                this.replacementOcrLines.set(staleLine, replacement);
            }

            const leases = this.lookupLineLeases.get(staleLine);
            this.lookupLineLeases.delete(staleLine);
            if (leases && replacement) {
                const replacementLeases = this.lookupLineLeases.get(replacement) ?? new Set<OcrLookupLineLease>();
                leases.forEach(lease => {
                    lease.line = replacement;
                    replacementLeases.add(lease);
                });
                this.lookupLineLeases.set(replacement, replacementLeases);
            } else {
                leases?.forEach(lease => { lease.line = undefined; });
            }

            if (!replacement) return;
            if (staleLine.dataset.pinned === 'true') {
                replacement.dataset.pinned = 'true';
                replacement.setAttribute('aria-pressed', 'true');
            }
            if (leases?.size || replacement.dataset.pinned === 'true') {
                this.activateOcrLineMarkup(state, replacement);
            }
            this.syncOcrLineActiveState(replacement);
        });
    }

    private currentOcrLine(line: HTMLElement): HTMLElement {
        let current = line;
        let replacement = this.replacementOcrLines.get(current);
        while (replacement && replacement !== current) {
            current = replacement;
            replacement = this.replacementOcrLines.get(current);
        }
        if (current !== line) this.replacementOcrLines.set(line, current);
        return current;
    }

    private discardOcrLineInteractionState(lines: Iterable<HTMLElement>): void {
        for (const line of lines) {
            const leases = this.lookupLineLeases.get(line);
            leases?.forEach(lease => { lease.line = undefined; });
            this.lookupLineLeases.delete(line);
            this.syncOcrLineActiveState(line);
        }
    }

    private renderNoOcrLines(state: ImageState): void {
        this.discardOcrLineInteractionState(state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line'));
        renderNoOcrLines(state);
    }

    private unpinOcrLinesFromDocumentEvent(event: Event): void {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.jpdb-ocr-line, .jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-onboarding, .jpdb-reader-fab')) return;
        this.unpinAllLines();
    }

    private unpinAllLines(): void {
        for (const state of this.states.values()) {
            state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line[data-pinned="true"]').forEach(line => this.unpinLine(line));
        }
    }

    private observePriority(image: HTMLImageElement): number {
        const state = this.states.get(image);
        if (!state) return 0;
        if (!state.result) return state.autoSkipped ? 2 : 0;
        return 1;
    }

    private resetStateIfImageChanged(state: ImageState): void {
        const key = imageCacheKey(state.image);
        const targetChanged = !state.target.isCurrent();
        if (key === state.key && !targetChanged) return;
        const preserveReaderRasterResult = !targetChanged && this.shouldPreserveReaderRasterResult(state);
        state.key = key;
        state.target = captureOcrTargetContext();
        if (!preserveReaderRasterResult) state.result = undefined;
        state.loading = false;
        state.overlayRequested = false;
        state.manualRequested = false;
        state.autoSkipped = false;
        if (!preserveReaderRasterResult) {
            this.discardOcrLineInteractionState(state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line'));
            state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());
            this.removeImageStatusCard(state.image);
        }
    }

    private shouldPreserveReaderRasterResult(state: ImageState): boolean {
        return Boolean(state.result && this.isReaderRasterFrame(state.image));
    }

    private isReaderRasterFrame(image: HTMLImageElement): boolean {
        return this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image);
    }

    private recordReaderRasterEmptyScan(
        state: ImageState,
        work: OcrTargetWork,
        userRequested: boolean,
    ): number {
        if (!this.isReaderRasterFrame(state.image)) return 0;
        const emptyScanKey = this.readerRasterEmptyScanKey(state, work);
        const attempts = (this.readerRasterEmptyScans.get(emptyScanKey) ?? 0) + 1;
        this.readerRasterEmptyScans.set(emptyScanKey, attempts);
        if (attempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) return attempts;
        window.setTimeout(() => {
            if (!work.target.isCurrent() || !this.isCurrentContentState(state, work.contentKey)) return;
            const canvas = this.canvasFrameSources.get(state.image);
            if (canvas && this.canvasFrameNeedsResnapshot(canvas)) {
                this.releaseCanvasFrameForResnapshot(canvas);
                this.scheduleReaderRasterRefresh(0);
                return;
            }
            // Retry OCR on the stable frame; the surface poll separately detects real repaints.
            state.autoSkipped = false;
            this.enqueue(state.image, userRequested);
        }, READER_RASTER_EMPTY_RETRY_MS);
        return attempts;
    }

    private readerRasterEmptyScanKey(state: ImageState, work: OcrTargetWork): string {
        const attemptKey = state.image.dataset.ocrAttemptKey;
        return attemptKey ? work.target.workKey(attemptKey) : work.workKey;
    }

    private scheduleReaderRasterProviderRetry(
        state: ImageState,
        work: OcrTargetWork,
        userRequested: boolean,
        error: unknown,
    ): boolean {
        // A full-budget timeout gets one retry; charging two slots still converges quickly to failure.
        const attemptCost = isOcrRequestTimeout(error) ? 2 : 1;
        const attempts = (this.readerRasterProviderFailures.get(work.workKey) ?? 0) + attemptCost;
        this.readerRasterProviderFailures.set(work.workKey, attempts);
        if (attempts >= READER_RASTER_MAX_PROVIDER_ATTEMPTS + 1) return false;

        const delay = READER_RASTER_PROVIDER_RETRY_BASE_MS * 2 ** (attempts - 1);
        log.warn('OCR provider failed transiently; retrying reader page', { attempt: attempts, delay }, error);
        const previousTimer = this.readerRasterProviderRetryTimers.get(work.workKey);
        if (previousTimer) window.clearTimeout(previousTimer);
        const timer = window.setTimeout(() => {
            if (this.readerRasterProviderRetryTimers.get(work.workKey) !== timer) return;
            this.readerRasterProviderRetryTimers.delete(work.workKey);
            if (!work.target.isCurrent() || !this.isCurrentContentState(state, work.contentKey)) return;
            state.autoSkipped = false;
            this.enqueue(state.image, userRequested);
        }, delay);
        this.readerRasterProviderRetryTimers.set(work.workKey, timer);
        return true;
    }

    private clearReaderRasterProviderRetry(key: string): void {
        this.cancelReaderRasterProviderRetryTimer(key);
        this.readerRasterProviderFailures.delete(key);
    }

    private cancelReaderRasterProviderRetryTimer(key: string): void {
        const timer = this.readerRasterProviderRetryTimers.get(key);
        if (timer) window.clearTimeout(timer);
        this.readerRasterProviderRetryTimers.delete(key);
    }

    private rememberReaderRasterFailure(key: string): void {
        if (key.startsWith('data:')) return;
        this.readerRasterFailedScans.add(key);
        while (this.readerRasterFailedScans.size > MAX_CACHE_ITEMS) {
            const oldest = this.readerRasterFailedScans.values().next().value;
            if (!oldest) break;
            this.readerRasterFailedScans.delete(oldest);
        }
    }

    private remember(key: string, result: OcrResult | null): void {
        // Paused-video frames key by their data: URL — far too large to keep.
        if (key.startsWith('data:')) return;
        this.cache.set(key, result);
        while (this.cache.size > MAX_CACHE_ITEMS) {
            const oldest = this.cache.keys().next().value;
            if (!oldest) break;
            this.cache.delete(oldest);
        }
        // Mirror to storage so the result survives a page refresh.
        persistOcrCacheSoon(this.cache, Date.now());
    }

    private forget(key: string): void {
        if (!this.cache.delete(key)) return;
        persistOcrCacheSoon(this.cache, Date.now());
    }

    private schedulePosition(): void {
        if (this.destroyed) return;
        if (this.positionFrame) return;
        // The explicit receiver is required by Firefox userscript sandboxes.
        this.positionFrame = window.requestAnimationFrame(() => {
            this.positionFrame = 0;
            if (this.destroyed) return;
            this.positionVideoFrames();
            this.positionCanvasFrames();
            this.positionBackgroundFrames();
            this.positionAllStates();
            this.positionImageStatusCards();
        });
    }

    private positionImageStatusCards(): void {
        for (const [image, card] of [...this.imageStatuses]) {
            if (!image.isConnected) this.removeImageStatusCard(image);
            else this.positionImageStatusCard(image, card);
        }
    }

    // --- Paused-video frames (UT-27) ---

    private snapshotPausedVideo(target: EventTarget | null, manual = false): void {
        if (this.destroyed) return;
        if (!(target instanceof HTMLVideoElement) || this.videoFrames.has(target)) return;
        const settings = this.options.getSettings();
        if (!ocrRuntimeActive(settings) || settings.ocrProvider === 'off') return;
        // The automatic pause path stays heuristic-gated; an explicit rail-button
        // request is an unambiguous ask, so it skips the auto-only filters.
        if (!manual) {
            if (!settings.ocrVideoPauseFrames) return;
            if (isFreshMiningPause(target)) return;
            if (isLikelyPausedVideoThumbnail(target)) return;
        }
        const rect = target.getBoundingClientRect();
        if (!manual && rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(target, 0) || isHiddenByCss(target)) return;
        const dataUrl = (this.options.captureVideoFrame ?? captureVideoFrameDataUrl)(target);
        if (!dataUrl) return;
        const frame = document.createElement('img');
        frame.className = 'jpdb-ocr-video-frame';
        frame.classList.add('jpdb-ocr-video-frame-pending');
        frame.dataset.yomuVideoFrame = 'true';
        frame.dataset.ocrPending = 'true';
        frame.alt = '';
        frame.addEventListener('load', () => {
            if (this.videoFrames.get(target) === frame) this.enqueue(frame, true);
        }, { once: true });
        frame.src = dataUrl;
        appendOcrArtifactToRoot(frame, videoFrameArtifactRoot(target));
        this.videoFrames.set(target, frame);
        this.videoFrameVideos.set(frame, target);
        const status = this.createVideoFrameStatus('loading');
        // Keep the native player fully visible/usable until OCR actually has text
        // to show: the status spinner and the captured frame image stay gated
        // (hidden, not tappable), so the viewer can reach the player's
        // comment/like/scrubber controls while OCR runs.
        status.classList.add('jpdb-ocr-video-frame-pending');
        this.videoFrameStatuses.set(target, status);
        positionVideoFrameStatus(status, rect, target);
        // Paused-frame escape hatch: recognized text areas swallow clicks for
        // lookups, so on text-dense frames the player itself becomes hard to
        // reach. The resume/play control therefore appears IMMEDIATELY on pause
        // — never gated behind OCR — so the user can always unpause right away.
        // It is a single compact button (placed in the existing video rail when
        // available, with a fallback for pages without that rail), so it does
        // not cover the player chrome the way the full frame image would.
        const resume = this.createVideoFrameResumeControl(target);
        this.videoFrameControls.set(target, resume);
        this.syncVideoFrameArtifactMount(target, frame);
        positionVideoFrameImage(frame, rect, target);
        positionVideoFrameStatus(status, rect, target);
        positionVideoFrameResumeControl(resume, rect, target);
        this.schedulePosition();
    }

    // Reveal the rest of the overlay once OCR has produced text: the frame image
    // and status dot un-gate (the resume/play control is already visible from the
    // moment the video paused), so the readable text appears with its status.
    private revealVideoFrameOverlay(image: HTMLImageElement): void {
        if (!this.videoFrameVideos.has(image)) return;
        image.classList.remove('jpdb-ocr-video-frame-pending');
        delete image.dataset.ocrPending;
        this.revealVideoFrameStatusAndResume(image);
    }

    // Reveal the status dot (the resume/play control is already visible from the
    // moment of pause), leaving the captured frame image gated. Used on
    // empty/failed terminal states: the viewer gets feedback without the
    // (text-less) frame covering the player. During loading the status stays
    // gated so the native player is reachable.
    private revealVideoFrameStatusAndResume(image: HTMLImageElement): void {
        const video = this.videoFrameVideos.get(image);
        if (!video) return;
        this.videoFrameStatuses.get(video)?.classList.remove('jpdb-ocr-video-frame-pending');
        this.videoFrameControls.get(video)?.classList.remove('jpdb-ocr-video-frame-pending');
    }

    private createVideoFrameResumeControl(video: HTMLVideoElement): HTMLElement {
        const language = this.options.getSettings().interfaceLanguage;
        const label = uiText(language, 'ocrPlayVideo');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'jpdb-ocr-video-frame-resume';
        setInnerHtml(button, playVideoIcon());
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            // Remove the overlay even if play() is blocked — getting the
            // frame out of the way is the usability win.
            this.releaseVideoFrame(video);
            try {
                void video.play()?.catch(() => undefined);
            } catch {
                // jsdom / autoplay-blocked: overlay removal already happened.
            }
        });
        return button;
    }

    private createVideoFrameStatus(status: OcrVideoFrameStatus): HTMLElement {
        const element = document.createElement('div');
        element.className = 'jpdb-ocr-video-frame-status';
        element.dataset.jpdbReaderRoot = 'true';
        element.dataset.jpdbReaderSurfaceIgnore = 'true';
        element.setAttribute('role', 'status');
        element.setAttribute('aria-live', 'polite');
        // Visible label text, shown only in the full-page canvas variant (a corner
        // spinner is easy to miss on a full-bleed manga reader, so a labeled pill
        // makes the multi-second Lens scan feel responsive rather than frozen).
        const label = document.createElement('span');
        label.className = 'jpdb-ocr-video-frame-status-label';
        element.append(label);
        this.setVideoFrameStatus(element, status);
        appendOcrArtifactToRoot(element, document.body);
        return element;
    }

    private setVideoFrameStatus(element: HTMLElement, status: OcrVideoFrameStatus): void {
        const language = this.options.getSettings().interfaceLanguage;
        const label = uiText(language, videoFrameStatusTextKey(status));
        element.dataset.status = status;
        // Toggle status classes individually instead of reassigning className, so
        // the gating class (jpdb-ocr-video-frame-pending) survives a 'loading'
        // status update — otherwise the spinner would un-gate over the player
        // mid-scan, defeating the keep-native-player-reachable behavior.
        element.classList.remove(
            'jpdb-ocr-video-frame-status-loading',
            'jpdb-ocr-video-frame-status-ready',
            'jpdb-ocr-video-frame-status-empty',
            'jpdb-ocr-video-frame-status-failed',
            'jpdb-ocr-video-frame-status-fade-out',
        );
        element.classList.add('jpdb-ocr-video-frame-status', `jpdb-ocr-video-frame-status-${status}`);
        element.setAttribute('aria-label', label);
    }

    private updateVideoFrameStatusForImage(image: HTMLImageElement, status: OcrVideoFrameStatus): void {
        const video = this.videoFrameVideos.get(image);
        if (!video) return;
        const element = this.videoFrameStatuses.get(video);
        if (element) this.setVideoFrameStatus(element, status);
    }

    // Drive both status surfaces: paused-video frames keep their card over the
    // player; every other OCR'd image gets its own card over the image.
    private updateOcrStatus(image: HTMLImageElement, status: OcrVideoFrameStatus): void {
        if (this.videoFrameVideos.has(image)) {
            this.applyVideoFrameStatusTransition(image, status);
            return;
        }
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) this.removeCanvasPendingStatus(canvas);
        this.updateImageStatusCard(image, status);
    }

    // Paused-frame overlays keep the image + status gated while OCR runs (the
    // resume/play control is visible from the moment of pause), so the native
    // player and its comment/like/scrubber controls stay reachable. On 'ready'
    // the image + status un-gate; on empty/failed only the status un-gates (the
    // text-less frame image stays hidden) so the viewer still gets feedback
    // without the frame covering the player. A lookup/mining pause never reaches
    // here — it is skipped at snapshot time via the mining marker.
    private applyVideoFrameStatusTransition(image: HTMLImageElement, status: OcrVideoFrameStatus): void {
        if (status === 'ready') this.revealVideoFrameOverlay(image);
        else if (status === 'empty' || status === 'failed') this.revealVideoFrameStatusAndResume(image);
        this.updateVideoFrameStatusForImage(image, status);
    }

    private updateImageStatusCard(image: HTMLImageElement, status: OcrVideoFrameStatus): void {
        if (this.videoFrameVideos.has(image)) return; // already shown over its video
        if (!ocrRuntimeActive(this.options.getSettings())) return;
        const existing = this.imageStatuses.get(image);
        const isCanvasFrame = this.canvasFrameSources.has(image);
        const isReaderRasterFrame = isCanvasFrame || this.backgroundFrameSources.has(image);
        // Status changed — cancel any pending "ready" fade so a re-scan starts clean.
        this.clearImageStatusTimer(image);
        if (isReaderRasterFrame && isTerminalOcrStatus(status) && this.hasReadyReaderRasterSibling(image)) {
            this.releaseReaderRasterFrameForImage(image);
            return;
        }
        // No recognizable text on an incidental inline image: drop the loader.
        // Full-page reader-raster frames keep an explicit "no text" pill so the
        // reader never looks like scanning vanished mid-page.
        if (status === 'empty' && !isReaderRasterFrame) {
            if (existing) removeOcrArtifact(existing);
            this.imageStatuses.delete(image);
            return;
        }
        const card = existing ?? this.createVideoFrameStatus(status);
        // setVideoFrameStatus rewrites the class list, clearing any fade-out class.
        if (existing) this.setVideoFrameStatus(card, status);
        else this.imageStatuses.set(image, card);
        // Full-page canvas/background readers (BookWalker/ComicWalker/Mokuro scanned
        // pages) get the prominent labeled pill; ordinary inline images keep the
        // unobtrusive corner dot (and the label span stays empty so their textContent
        // is unchanged).
        card.classList.toggle('jpdb-ocr-canvas-status', isReaderRasterFrame);
        this.configureReaderRasterStatusRetry(card, isReaderRasterFrame);
        const labelNode = card.querySelector('.jpdb-ocr-video-frame-status-label');
        if (labelNode) labelNode.textContent = isReaderRasterFrame ? this.readerRasterStatusLabel(status) : '';
        if (isReaderRasterFrame) this.updateReaderRasterRetryLabel(card, status);
        this.positionImageStatusCard(image, card);
        // "ready" is terminal for incidental inline images: flash the dot, then
        // remove it. Reader-raster pages keep a persistent page-level pill while
        // the captured frame is alive; otherwise BookWalker looks like scanning
        // randomly disappears even though the OCR layer is still current.
        if (status === 'ready' && isReaderRasterFrame) this.releaseTerminalReaderRasterSiblings(image);
        if (status === 'ready' && !isReaderRasterFrame) this.scheduleImageStatusFade(image, card);
    }

    private hasReadyReaderRasterSibling(image: HTMLImageElement): boolean {
        const groupKey = this.readerRasterFrameGroupKey(image);
        if (!groupKey) return false;
        for (const [candidate, card] of this.imageStatuses) {
            if (candidate === image || card.dataset.status !== 'ready') continue;
            if (this.readerRasterFrameGroupKey(candidate) === groupKey) return true;
        }
        return false;
    }

    private releaseTerminalReaderRasterSiblings(image: HTMLImageElement): void {
        const groupKey = this.readerRasterFrameGroupKey(image);
        if (!groupKey) return;
        for (const [candidate, card] of [...this.imageStatuses]) {
            if (candidate === image || !isTerminalOcrStatus(card.dataset.status)) continue;
            if (this.readerRasterFrameGroupKey(candidate) === groupKey) this.releaseReaderRasterFrameForImage(candidate);
        }
    }

    private readerRasterFrameGroupKey(image: HTMLImageElement): string {
        if (!isBookwalkerViewerHost()) return '';
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) return bookwalkerSurfaceGroupKey(canvas);
        const surface = this.backgroundFrameSources.get(image);
        return surface?.id ?? '';
    }

    private releaseReaderRasterFrameForImage(image: HTMLImageElement): void {
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) {
            this.releaseCanvasFrame(canvas);
            return;
        }
        const background = this.backgroundFrameSources.get(image);
        if (background) {
            this.releaseBackgroundFrame(background);
            return;
        }
        this.removeImageStatusCard(image);
    }

    private scheduleImageStatusFade(image: HTMLImageElement, card: HTMLElement): void {
        const dwell = window.setTimeout(() => {
            card.classList.add('jpdb-ocr-video-frame-status-fade-out');
            const remove = window.setTimeout(() => this.removeImageStatusCard(image), OCR_STATUS_FADE_MS);
            this.imageStatusTimers.set(image, remove);
        }, OCR_STATUS_READY_DWELL_MS);
        this.imageStatusTimers.set(image, dwell);
    }

    private clearImageStatusTimer(image: HTMLImageElement): void {
        const timer = this.imageStatusTimers.get(image);
        if (timer !== undefined) window.clearTimeout(timer);
        this.imageStatusTimers.delete(image);
    }

    private positionImageStatusCard(image: HTMLImageElement, card: HTMLElement): void {
        const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
        if (!isImageVisibleForOcr(image, rect)) { card.hidden = true; return; }
        card.hidden = false;
        positionOcrImageStatus(card, rect);
    }

    private removeImageStatusCard(image: HTMLImageElement): void {
        this.clearImageStatusTimer(image);
        const card = this.imageStatuses.get(image);
        if (!card) return;
        removeOcrArtifact(card);
        this.imageStatuses.delete(image);
    }

    private configureReaderRasterStatusRetry(card: HTMLElement, enabled: boolean): void {
        if (!enabled) {
            if (card.dataset.yomuOcrRetry === 'true') {
                delete card.dataset.yomuOcrRetry;
                card.removeAttribute('role');
                card.removeAttribute('tabindex');
                card.removeAttribute('title');
            }
            return;
        }
        card.dataset.yomuOcrRetry = 'true';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        if (card.dataset.yomuOcrRetryListener === 'true') return;
        card.dataset.yomuOcrRetryListener = 'true';
        card.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.retryReaderRasterStatusCard(card);
        });
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            this.retryReaderRasterStatusCard(card);
        });
    }

    // Empty/failed pills read as a dead end without a visible cue that a click
    // re-runs OCR (title/aria alone were invisible on touch readers like
    // BookWalker), so terminal non-ready statuses carry the retry hint inline.
    private readerRasterStatusLabel(status: OcrVideoFrameStatus): string {
        const language = this.options.getSettings().interfaceLanguage;
        const statusLabel = uiText(language, videoFrameStatusTextKey(status));
        if (status !== 'empty' && status !== 'failed') return statusLabel;
        return `${statusLabel} · ${uiText(language, 'ocrRetryScan')}`;
    }

    private updateReaderRasterRetryLabel(card: HTMLElement, status: OcrVideoFrameStatus): void {
        const language = this.options.getSettings().interfaceLanguage;
        const statusLabel = uiText(language, videoFrameStatusTextKey(status));
        const retryLabel = uiText(language, 'ocrRetryScan');
        card.setAttribute('aria-label', `${statusLabel}. ${retryLabel}`);
        card.setAttribute('title', retryLabel);
    }

    private retryReaderRasterStatusCard(card: HTMLElement): void {
        const image = [...this.imageStatuses].find(([, candidate]) => candidate === card)?.[0];
        if (!image) return;
        this.retryReaderRasterImage(image);
    }

    private refreshVideoFrameAfterSeek(target: EventTarget | null): void {
        if (!(target instanceof HTMLVideoElement) || !target.paused) return;
        if (!this.videoFrames.has(target)) return;
        this.releaseVideoFrame(target);
        this.snapshotPausedVideo(target);
    }

    private releaseVideoFrame(target: EventTarget | null): void {
        if (!(target instanceof HTMLVideoElement)) return;
        const frame = this.videoFrames.get(target);
        if (!frame) return;
        this.videoFrames.delete(target);
        const control = this.videoFrameControls.get(target);
        if (control) removeVideoFrameResumeControl(control);
        this.videoFrameControls.delete(target);
        const status = this.videoFrameStatuses.get(target);
        if (status) removeOcrArtifact(status);
        this.videoFrameStatuses.delete(target);
        const state = this.states.get(frame);
        if (state) this.releaseImageState(frame, state);
        else this.forgetImageWork(frame);
        this.videoFrameVideos.delete(frame);
        removeOcrArtifact(frame);
    }

    private releaseAllVideoFrames(): void {
        for (const video of [...this.videoFrames.keys()]) this.releaseVideoFrame(video);
    }

    // --- Reader raster frames (canvas readers + CSS background-image readers) ---

    private startReaderRasterPollingIfNeeded(): void {
        if (this.readerRasterPoll) return;
        if (this.isProvenRasterFreePage() || !isReaderRasterPage()) return;
        // Canvas redraws and CSS background page swaps emit no useful media load
        // event for us, so a light poll catches page turns and async viewer boot.
        // The per-tick work is cheap (a fingerprint + querySelectorAll); a real
        // capture only runs when a visible surface is new or changed.
        this.readerRasterPoll = window.setInterval(() => {
            const settings = this.options.getSettings();
            this.refreshCanvasReaderSurfaces(settings);
            this.refreshBackgroundImageReaderSurfaces(settings);
        }, 1200);
    }

    private refreshCanvasReaderSurfaces(settings: ReaderSettings, userRequested = false): void {
        if (!ocrRuntimeActive(settings) || settings.ocrProvider === 'off') return;
        if (this.isProvenRasterFreePage()) {
            this.releaseAllCanvasFrames();
            return;
        }
        const nativeTextLayerBlocksAutoScan = this.options.shouldAutoScan?.() === false
            && settings.ocrAutoScanImages
            && !userRequested;
        const ocrOptInCanvases = nativeTextLayerBlocksAutoScan
            ? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested)
            : undefined;
        if (this.handleNativeTextLayerCanvasGate(nativeTextLayerBlocksAutoScan, ocrOptInCanvases)) return;
        if (!isReaderRasterPage() && !this.hasTrackedManualCanvasSurface()) {
            this.releaseAllCanvasFrames();
            return;
        }
        this.startReaderRasterPollingIfNeeded();
        const canvases = ocrOptInCanvases ?? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
        const signature = this.registerCanvasReaderPageSignature(canvases);
        if (signature === null) return;
        // Tap/manual mode: never spend OCR calls on the poll. Detection above already
        // cleared the stale overlay; a tap (userRequested) re-enters here to capture.
        // A tap that failed because the page wasn't composited yet still re-attempts
        // here (it stays flagged user-requested) so the page OCRs without a 2nd tap.
        if (!settings.ocrAutoScanImages && !userRequested) {
            this.refreshManualCanvasReaderFrames(canvases, settings);
            return;
        }
        this.reconcileCanvasReaderFrames(canvases, signature, settings, userRequested);
    }

    private handleNativeTextLayerCanvasGate(
        nativeTextLayerBlocksAutoScan: boolean,
        ocrOptInCanvases: HTMLCanvasElement[] | undefined,
    ): boolean {
        if (!nativeTextLayerBlocksAutoScan || ocrOptInCanvases?.length) return false;
        // A native-text-layer page (mokuro et al.) strips auto frames but keeps a
        // frame the user explicitly tapped until a genuine page turn.
        if (!isReaderRasterPage()) {
            this.releaseAllCanvasFrames();
            return true;
        }
        const signature = canvasReaderPageSignature();
        const turned = signature !== this.canvasReaderSignature;
        this.canvasReaderSignature = signature;
        for (const canvas of [...this.canvasFrames.keys()]) {
            if (turned || !this.canvasFrameUserRequested.has(canvas)) this.releaseCanvasFrame(canvas);
        }
        return true;
    }

    private registerCanvasReaderPageSignature(canvases: HTMLCanvasElement[]): string | null {
        const signature = canvasReaderPageSignature();
        if (signature === this.canvasReaderSignature) {
            this.canvasReaderSamePageSignatureSkips = 0;
            return signature;
        }
        // Continuous BookWalker mounts/reorders offscreen surfaces. Its aggregate
        // signature is only a wake-up hint; stable per-canvas content owns frames.
        if (canvases.some(canvasReaderHasStableSurface)) {
            this.canvasReaderSamePageSignatureSkips = 0;
            this.canvasReaderSignature = signature;
            return signature;
        }
        if (this.shouldHoldCanvasFramesForSamePageSignature(signature)) {
            // A readable BookWalker canvas may expose a raw pixel signature here,
            // while the landed frame still carries the recorder's canonical source
            // token. If that per-canvas token moved, let reconciliation repair the
            // counter-before-paint race; benign readable-pixel flicker has no mirror
            // mismatch and continues through the stable-counter hold below.
            if (canvases.some(canvas => this.canvasFrameNeedsResnapshot(canvas))) {
                this.canvasReaderSamePageSignatureSkips = 0;
                this.canvasReaderSignature = signature;
                return signature;
            }
            this.scheduleReaderRasterRefresh(80);
            return null;
        }
        this.canvasReaderSamePageSignatureSkips = 0;
        this.releaseAllCanvasFrames();
        this.canvasReaderSignature = signature;
        return signature;
    }

    private refreshManualCanvasReaderFrames(canvases: HTMLCanvasElement[], settings: ReaderSettings): void {
        for (const canvas of [...this.canvasFrames.keys()]) {
            if (this.reconcileUserRequestedManualCanvasFrame(canvas)) continue;
            if (!canvases.includes(canvas)) this.releaseCanvasFrame(canvas);
            else if (this.canvasFrameNeedsResnapshot(canvas)) this.releaseCanvasFrameForResnapshot(canvas);
        }
        this.retryPendingUserRequestedCaptures(settings);
    }

    private reconcileCanvasReaderFrames(
        canvases: HTMLCanvasElement[],
        signature: string,
        settings: ReaderSettings,
        userRequested: boolean,
    ): void {
        for (const canvas of [...this.canvasPendingStatuses.keys()]) {
            if (canvases.includes(canvas)) continue;
            if (isBookwalkerViewerHost()) this.cancelCanvasSnapshot(canvas);
            this.removeCanvasPendingStatus(canvas);
        }
        for (const canvas of canvases) {
            if (this.canvasFrames.has(canvas)) continue;
            this.rebindExistingCanvasFrame(canvas, canvasSurfaceSnapshotKey(canvas), userRequested);
        }
        for (const canvas of [...this.canvasFrames.keys()]) {
            if (canvases.includes(canvas)) continue;
            if (this.reconcileUserRequestedManualCanvasFrame(canvas)) continue;
            if (this.shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas, signature)) continue;
            // Don't drop a frame whose image is still loading — a transient off-screen
            // blip (layout shift right after capture, before the mirror image decodes)
            // would otherwise waste the in-flight capture and leave the page un-OCR'd.
            if (this.canvasFrames.get(canvas)?.complete === false) continue;
            this.releaseCanvasFrame(canvas);
        }
        for (const canvas of canvases) {
            if (!this.canvasFrameNeedsResnapshot(canvas)) continue;
            this.releaseCanvasFrameForResnapshot(canvas);
        }
        for (const canvas of canvases) {
            if (this.canvasFrames.has(canvas)) continue;
            this.snapshotCanvasSurface(canvas, settings, userRequested);
        }
        if (this.canvasFrames.size || this.canvasPendingStatuses.size) this.schedulePosition();
    }

    private reconcileUserRequestedManualCanvasFrame(canvas: HTMLCanvasElement): boolean {
        if (!this.canvasFrameUserRequested.has(canvas) || !isManualCanvasReaderSurface(canvas)) return false;
        // Per-surface manual canvases are deliberately absent from auto candidates.
        // Keep the tapped frame through observer/poll refreshes, but never carry it
        // onto changed pixels or auto-recapture the next page.
        if (this.canvasFrameNeedsResnapshot(canvas)) this.releaseCanvasFrameForResnapshot(canvas);
        return true;
    }

    private async snapshotCanvasSurface(canvas: HTMLCanvasElement, settings: ReaderSettings, userRequested = false): Promise<void> {
        const key = canvasSurfaceSnapshotKey(canvas);
        const startContentToken = canvasStablePageContentToken(canvas);
        if (this.canvasFrames.has(canvas)) {
            if (!userRequested || this.canvasFrameKeys.get(canvas) === key) return;
            this.releaseCanvasFrame(canvas);
        }
        if (!userRequested
            && (this.canvasCaptureAttempts.get(canvas) ?? 0) > READER_RASTER_MAX_CAPTURE_ATTEMPTS) {
            // The pause belongs to the page that failed. A recycled canvas that now
            // shows a DIFFERENT real content identity reopens capture; the same
            // failing page stays paused until a tap or a page turn.
            const liveToken = canvasStablePageContentToken(canvas);
            const failedToken = this.canvasFailureContentTokens.get(canvas);
            if (liveToken && failedToken && liveToken !== failedToken) {
                this.clearCanvasCaptureRetry(canvas);
            } else {
                this.updateCanvasPendingStatus(canvas, canvas.getBoundingClientRect(), 'failed');
                return;
            }
        }
        const existingPending = this.pendingCanvasSnapshots.get(canvas);
        const pendingContentChanged = Boolean(existingPending
            && isRealCanvasContentChange(existingPending.contentToken ?? '', startContentToken));
        if (existingPending?.key === key && !pendingContentChanged) {
            if (Date.now() - existingPending.startedAt < READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS) return;
            this.cancelCanvasSnapshot(canvas, existingPending);
            this.handleCanvasCaptureNotReady(canvas, canvas.getBoundingClientRect(), userRequested);
            return;
        }
        if (existingPending) this.cancelCanvasSnapshot(canvas, existingPending);
        const pendingSnapshot: PendingCanvasSnapshot = {
            key,
            contentToken: startContentToken || undefined,
            startedAt: Date.now(),
            cancelled: false,
        };
        this.pendingCanvasSnapshots.set(canvas, pendingSnapshot);
        const rect = canvas.getBoundingClientRect();
        try {
            if (rect.width * rect.height < settings.ocrMinImageArea) return;
            // Prefetch a sliding window of upcoming pages (canvasPrefetchMargin), but
            // never spend an OCR call on a page the reader hasn't painted yet.
            if (!isNearViewport(canvas, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(canvas)) return;
            this.updateCanvasPendingStatus(canvas, rect, 'loading');
            this.armCanvasSnapshotTimeout(canvas, pendingSnapshot, rect, userRequested);
            const captured = await this.captureCanvasSnapshotSource(canvas, settings, rect, userRequested, startContentToken);
            if (captured === null) return;
            // A missing pending entry means the capture was canceled by a page turn,
            // teardown, timeout, or surface removal. Never let that old async result
            // commit into a recycled canvas; tap-mode recapture is already bounded and
            // survives the cancellation separately.
            if (this.shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested)) return;
            if (!captured) { this.handleCanvasCaptureNotReady(canvas, rect, userRequested); return; }
            // A stable surface id is not page identity: BookWalker deliberately
            // recycles the same viewport canvas for the whole book. When neither
            // mirror/source identity is available, hash the captured pixels instead
            // of aliasing every page to `surface:${key}`.
            const contentKey = captured.contentKey ?? (captured.frameSrc.startsWith('data:')
                ? `raster:${stableHashBase36(captured.frameSrc)}`
                : undefined);
            this.commitCanvasSnapshot(canvas, pendingSnapshot, key, rect, { ...captured, contentKey }, userRequested);
        } catch (error) {
            if (!this.wasCanvasSnapshotSuperseded(canvas, pendingSnapshot)) {
                const surface = canvasReaderSurfaceId(canvas) || canvas.dataset.yomuMid || 'unidentified';
                log.warnOnce(`canvas-capture:${surface}`, 'Reader raster capture failed; retrying', { surface }, error);
                this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
            }
        } finally {
            this.settleCanvasSnapshot(canvas, pendingSnapshot);
        }
    }

    private async captureCanvasSnapshotSource(
        canvas: HTMLCanvasElement,
        settings: ReaderSettings,
        rect: DOMRect,
        userRequested: boolean,
        startContentToken: string | undefined,
    ): Promise<CanvasSnapshotCapture | null | undefined> {
        const visibleRect = userRequested ? bookwalkerVisibleCanvasRegion(canvas, rect) : undefined;
        const frameRect = visibleRect ?? rect;
        const regionKey = visibleRect ? canvasRegionContentKey(rect, visibleRect) : '';
        if (isCanvasReadable(canvas)) {
            return this.captureReadableCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, userRequested, startContentToken);
        }
        if (isBookwalkerViewerHost()) {
            return this.captureBookwalkerCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, startContentToken);
        }
        if (!canUseReaderCanvasSourceImageFallback()) return undefined;
        const frameSrc = readerCanvasSourceImageUrl();
        return frameSrc ? { frameSrc, frameRect, contentKey: `src:${frameSrc}`, contentToken: startContentToken } : undefined;
    }

    private captureReadableCanvasSnapshot(
        canvas: HTMLCanvasElement,
        settings: ReaderSettings,
        rect: DOMRect,
        frameRect: DOMRect,
        visibleRect: DOMRect | undefined,
        regionKey: string,
        userRequested: boolean,
        contentToken: string | undefined,
    ): CanvasSnapshotCapture | null | undefined {
        const contentSignature = canvasRenderedContentSignature(canvas);
        if (!contentSignature) {
            this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
            return null;
        }
        if (!this.canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested)) return null;
        const frameSrc = visibleRect
            ? captureCanvasRegionDataUrl(canvas, rect, visibleRect, settings.ocrMaxImagePixels)
            : captureCanvasDataUrl(canvas, settings.ocrMaxImagePixels);
        return frameSrc ? {
            frameSrc,
            frameRect,
            contentKey: bookwalkerCanvasContentKey(contentToken, regionKey)
                ?? `cv:${contentSignature}:${canvas.width}x${canvas.height}${regionKey}`,
            contentToken,
        } : undefined;
    }

    private async captureBookwalkerCanvasSnapshot(
        canvas: HTMLCanvasElement,
        settings: ReaderSettings,
        rect: DOMRect,
        frameRect: DOMRect,
        visibleRect: DOMRect | undefined,
        regionKey: string,
        startContentToken: string | undefined,
    ): Promise<CanvasSnapshotCapture | undefined> {
        // Firefox/iPad taint the DRM page canvas. Rebuild the viewer's recorded
        // draw graph with origin-clean assets, then use the extension screenshot
        // bridge only when no recorder graph is available.
        const captureMirror = this.options.captureCanvasMirror ?? captureCanvasMirror;
        const mirror = await captureMirror(canvas, loadCleanMirrorImage);
        if (!mirror) {
            const captureReaderSurface = this.options.captureReaderSurface ?? captureReaderSurfaceViaExtensionScreenshot;
            const screenshot = await captureReaderSurface(canvas, settings.ocrMaxImagePixels);
            return screenshot?.dataUrl ? {
                frameSrc: screenshot.dataUrl,
                frameRect: screenshot.rect ?? rect,
                contentKey: bookwalkerCanvasContentKey(startContentToken, regionKey),
                contentToken: startContentToken,
            } : undefined;
        }
        const frameSrc = visibleRect
            ? captureCanvasRegionDataUrl(mirror, rect, visibleRect, settings.ocrMaxImagePixels)
            : captureCanvasDataUrl(mirror, settings.ocrMaxImagePixels);
        if (!frameSrc) return undefined;
        const mirrorSignature = canvasRenderedContentSignature(mirror);
        const contentToken = mirror.dataset.yomuMirrorContentToken || startContentToken;
        // Derive EVERYTHING from the mirror before releasing it. The fallback key
        // embeds the mirror's dimensions, so releasing first silently produced
        // `cv:<sig>:0x0` — a different page identity on every capture, which reads
        // downstream as a commit-identity mismatch rather than as an error.
        const contentKey = bookwalkerCanvasContentKey(contentToken, regionKey)
            ?? (mirrorSignature ? `cv:${mirrorSignature}:${mirror.width}x${mirror.height}${regionKey}` : undefined);
        // NOTE: the rebuilt mirror is a ~10 MB page-sized buffer and freeing it here
        // would help the GC, but it is NOT safe to release: the mirror is supplied by
        // captureCanvasMirror (injectable, and reused across captures in tests), so
        // zeroing it mutates a buffer the caller may still own. Left to the collector
        // deliberately. The genuinely local scratch canvases in canvas-readers ARE
        // released at their point of use.
        return { frameSrc, frameRect, contentKey, contentToken };
    }

    private commitCanvasSnapshot(
        canvas: HTMLCanvasElement,
        pendingSnapshot: PendingCanvasSnapshot,
        key: string,
        canvasRect: DOMRect,
        captured: CanvasSnapshotCapture,
        userRequested: boolean,
    ): void {
        if (this.destroyed || !canvas.isConnected || this.canvasFrames.has(canvas)) return;
        if (!ocrRuntimeActive(this.options.getSettings())) return;
        if (this.shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested)) return;
        const finishContentToken = canvasStablePageContentToken(canvas);
        if (captured.contentToken && finishContentToken && finishContentToken !== captured.contentToken) {
            this.handleCanvasCommitMismatch(canvas, canvasRect, userRequested, 'content identity');
            return;
        }
        if (canvasSurfaceSnapshotKey(canvas) !== key) {
            this.handleCanvasCommitMismatch(canvas, canvasRect, userRequested, 'surface identity');
            return;
        }
        const frame = document.createElement('img');
        frame.className = 'jpdb-ocr-canvas-frame';
        frame.dataset.yomuCanvasFrame = 'true';
        if (captured.contentKey) frame.dataset.ocrContentKey = canvasFrameContentKey(captured.contentKey, canvas);
        frame.alt = '';
        positionCanvasFrameImage(frame, captured.frameRect);
        const finishFrameLoad = (loaded: boolean) => {
            if (this.canvasFrames.get(canvas) !== frame) return;
            const timer = this.canvasFrameLoadTimers.get(frame);
            if (timer) window.clearTimeout(timer);
            this.canvasFrameLoadTimers.delete(frame);
            if (loaded) {
                this.removeCanvasPendingStatus(canvas);
                this.clearCanvasCaptureRetry(canvas);
                this.canvasCommitMismatches.delete(canvas);
                this.enqueue(frame, userRequested);
                return;
            }
            this.discardUnloadedCanvasFrame(canvas, frame);
            this.handleCanvasCaptureNotReady(canvas, canvasRect, userRequested);
        };
        frame.addEventListener('load', () => finishFrameLoad(true), { once: true });
        frame.addEventListener('error', () => finishFrameLoad(false), { once: true });
        document.body.append(frame);
        this.canvasFrames.set(canvas, frame);
        this.canvasFrameSources.set(frame, canvas);
        this.canvasFrameKeys.set(canvas, key);
        const committedContentToken = captured.contentToken || finishContentToken;
        if (committedContentToken) this.canvasFrameContentTokens.set(canvas, committedContentToken);
        else this.canvasFrameContentTokens.delete(canvas);
        frame.dataset.ocrAttemptKey = canvasFrameOcrAttemptKey(canvas, key, committedContentToken);
        this.rememberCanvasSnapshotRegion(frame, canvasRect, captured.frameRect);
        if (userRequested) this.canvasFrameUserRequested.add(canvas);
        else this.canvasFrameUserRequested.delete(canvas);
        this.canvasFrameLoadTimers.set(frame, window.setTimeout(
            () => finishFrameLoad(false),
            READER_RASTER_FRAME_LOAD_TIMEOUT_MS,
        ));
        frame.src = captured.frameSrc;
        this.canvasReaderSignature = canvasReaderPageSignature();
        this.canvasReaderSamePageSignatureSkips = 0;
        this.schedulePosition();
    }

    private handleCanvasCommitMismatch(
        canvas: HTMLCanvasElement,
        rect: DOMRect,
        userRequested: boolean,
        reason: string,
    ): void {
        const mismatches = (this.canvasCommitMismatches.get(canvas) ?? 0) + 1;
        this.canvasCommitMismatches.set(canvas, mismatches);
        if (mismatches < READER_RASTER_MAX_COMMIT_MISMATCHES) {
            if (userRequested) this.scheduleCanvasCaptureRetry(canvas, true);
            else this.scheduleReaderRasterRefresh(READER_RASTER_RETRY_BASE_MS * mismatches);
            return;
        }
        this.canvasCommitMismatches.delete(canvas);
        this.canvasCaptureAttempts.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS + 1);
        this.canvasTapRecapture.delete(canvas);
        this.canvasFailureContentTokens.set(canvas, canvasStablePageContentToken(canvas));
        const surface = canvasReaderSurfaceId(canvas) || canvas.dataset.yomuMid || 'unidentified';
        log.warnOnce(
            `canvas-commit-mismatch:${surface}:${reason}`,
            `Reader raster capture repeatedly changed ${reason}; automatic retries paused`,
            { surface, userRequested },
        );
        this.updateCanvasPendingStatus(canvas, rect, 'failed');
    }

    private rememberCanvasSnapshotRegion(frame: HTMLImageElement, canvasRect: DOMRect, frameRect: DOMRect): void {
        if (frameRect === canvasRect) return;
        this.canvasFrameStaticRects.set(frame, frameRect);
        this.canvasFrameRegionFractions.set(frame, new DOMRect(
            (frameRect.left - canvasRect.left) / canvasRect.width,
            (frameRect.top - canvasRect.top) / canvasRect.height,
            frameRect.width / canvasRect.width,
            frameRect.height / canvasRect.height,
        ));
    }

    private wasCanvasSnapshotSuperseded(canvas: HTMLCanvasElement, pendingSnapshot: PendingCanvasSnapshot): boolean {
        const current = this.pendingCanvasSnapshots.get(canvas);
        return pendingSnapshot.cancelled || Boolean(current && current !== pendingSnapshot);
    }

    private armCanvasSnapshotTimeout(
        canvas: HTMLCanvasElement,
        pending: PendingCanvasSnapshot,
        rect: DOMRect,
        userRequested: boolean,
    ): void {
        pending.timeoutId = window.setTimeout(() => {
            if (this.pendingCanvasSnapshots.get(canvas) !== pending || pending.cancelled) return;
            this.cancelCanvasSnapshot(canvas, pending);
            this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
        }, READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS);
    }

    private settleCanvasSnapshot(canvas: HTMLCanvasElement, pending: PendingCanvasSnapshot): void {
        if (pending.timeoutId) window.clearTimeout(pending.timeoutId);
        pending.timeoutId = undefined;
        if (this.pendingCanvasSnapshots.get(canvas) === pending) this.pendingCanvasSnapshots.delete(canvas);
    }

    private cancelCanvasSnapshot(canvas: HTMLCanvasElement, pending = this.pendingCanvasSnapshots.get(canvas)): void {
        if (!pending) return;
        pending.cancelled = true;
        if (pending.timeoutId) window.clearTimeout(pending.timeoutId);
        pending.timeoutId = undefined;
        if (this.pendingCanvasSnapshots.get(canvas) === pending) this.pendingCanvasSnapshots.delete(canvas);
    }

    private discardUnloadedCanvasFrame(canvas: HTMLCanvasElement, frame: HTMLImageElement): void {
        if (this.canvasFrames.get(canvas) !== frame) return;
        const timer = this.canvasFrameLoadTimers.get(frame);
        if (timer) window.clearTimeout(timer);
        this.canvasFrameLoadTimers.delete(frame);
        this.canvasFrames.delete(canvas);
        this.canvasFrameSources.delete(frame);
        this.canvasFrameStaticRects.delete(frame);
        this.canvasFrameRegionFractions.delete(frame);
        this.canvasFrameKeys.delete(canvas);
        this.canvasFrameContentTokens.delete(canvas);
        this.canvasFrameUserRequested.delete(canvas);
        this.removeImageStatusCard(frame);
        frame.remove();
    }

    private shouldDiscardCanvasSnapshot(
        canvas: HTMLCanvasElement,
        pendingSnapshot: PendingCanvasSnapshot,
        userRequested: boolean,
    ): boolean {
        if (!this.wasCanvasSnapshotSuperseded(canvas, pendingSnapshot)) return false;
        // Signature registration/page cleanup may cancel an async tap capture before
        // the mirror fetch resolves. The pixels remain canceled, but carry the tap's
        // intent into the existing bounded recapture window so one tap is sufficient.
        if (userRequested && canvas.isConnected && !this.canvasFrames.has(canvas)) {
            this.scheduleCanvasCaptureRetry(canvas, true);
        }
        return true;
    }

    private shouldHoldCanvasFramesForSamePageSignature(signature: string): boolean {
        if (!this.canvasReaderSignature) return false;
        if (!this.canvasFrames.size) return false;
        // BookWalker moves its counter/currentScreen before the replacement pixels
        // land. A capture in that gap can have the new counter but the previous page's
        // real mirror token, so a later real-token change must beat the otherwise
        // stable counter and repair the stale frame. Empty/epoch-only churn still
        // falls through to the counter hold below.
        if (hasDifferentRecordedCanvasReaderContent(this.canvasReaderSignature, signature)) return false;
        if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
        if (!isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature)) return false;
        // A genuine page turn replaces the per-canvas CONTENT fingerprint with a
        // DIFFERENT real token, so release and re-OCR the new page even if the page
        // counter lags. Scroll offset and global mirror-epoch churn are NOT real
        // content changes — holding through them is what stops within-page scroll on a
        // single vertical viewport (BookWalker cty=2) from tearing the overlay down.
        if (hasSameRealCanvasReaderContent(this.canvasReaderSignature, signature)) return true;
        if (hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
        // No usable page counter and no real content token: the global mirror epoch is
        // the only remaining page-turn signal, so honour it here. A viewer WITH a stable
        // counter (e.g. cty=2) returns above before reaching this line, so epoch churn
        // there no longer tears the overlay down.
        if (isCanvasMirrorEpochTransition(this.canvasReaderSignature, signature)) return false;
        this.canvasReaderSamePageSignatureSkips += 1;
        if (this.canvasReaderSamePageSignatureSkips <= READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT) return true;
        this.canvasReaderSamePageSignatureSkips = 0;
        return false;
    }

    private shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas: HTMLCanvasElement, signature: string): boolean {
        if (!canvas.isConnected) return false;
        if (!this.canvasReaderSignature) return false;
        if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
        return isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature)
            && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature);
    }

    private rebindExistingCanvasFrame(canvas: HTMLCanvasElement, key: string, userRequested: boolean): boolean {
        const existing = this.findCanvasFrameBySnapshotKey(key, canvas);
        if (!existing) return false;
        const { canvas: previousCanvas, frame } = existing;
        if (this.canvasFrameStaticRects.has(frame)) return false;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;

        this.removeCanvasPendingStatus(previousCanvas);
        this.removeCanvasPendingStatus(canvas);
        this.cancelCanvasSnapshot(previousCanvas);
        this.cancelCanvasSnapshot(canvas);
        this.canvasFrames.delete(previousCanvas);
        this.canvasFrames.set(canvas, frame);
        this.canvasFrameSources.set(frame, canvas);
        this.canvasFrameKeys.delete(previousCanvas);
        this.canvasFrameKeys.set(canvas, key);
        const contentToken = this.canvasFrameContentTokens.get(previousCanvas) || canvasStablePageContentToken(canvas);
        this.canvasFrameContentTokens.delete(previousCanvas);
        if (contentToken) this.canvasFrameContentTokens.set(canvas, contentToken);
        else this.canvasFrameContentTokens.delete(canvas);
        this.canvasContentReadiness.delete(canvasContentReadinessKey(previousCanvas));
        this.canvasContentReadiness.set(canvasContentReadinessKey(canvas), canvasPageContentToken(canvas));
        this.canvasCaptureAttempts.delete(previousCanvas);
        this.canvasTapRecapture.delete(previousCanvas);
        if (this.canvasFrameUserRequested.has(previousCanvas) || userRequested) this.canvasFrameUserRequested.add(canvas);
        else this.canvasFrameUserRequested.delete(canvas);
        this.canvasFrameUserRequested.delete(previousCanvas);
        positionCanvasFrameImage(frame, rect);
        this.schedulePosition();
        return true;
    }

    private findCanvasFrameBySnapshotKey(
        key: string,
        excludeCanvas: HTMLCanvasElement,
    ): { canvas: HTMLCanvasElement; frame: HTMLImageElement } | undefined {
        for (const [canvas, frame] of this.canvasFrames) {
            if (canvas === excludeCanvas) continue;
            if (this.canvasFrameKeys.get(canvas) !== key) continue;
            if (frame.complete === false) continue;
            if (this.canvasContentTokenChanged(excludeCanvas, this.canvasFrameContentTokens.get(canvas))) continue;
            return { canvas, frame };
        }
        return undefined;
    }

    private canvasContentIsReadyToSnapshot(
        canvas: HTMLCanvasElement,
        contentSignature: string,
        userRequested: boolean,
    ): boolean {
        const readinessKey = canvasContentReadinessKey(canvas);
        if (userRequested) {
            this.canvasContentReadiness.set(readinessKey, contentSignature);
            return true;
        }
        const previous = this.canvasContentReadiness.get(readinessKey);
        this.canvasContentReadiness.set(readinessKey, contentSignature);
        if (previous === contentSignature) return true;
        this.scheduleReaderRasterRefresh(140);
        return false;
    }

    private scheduleReaderRasterRefresh(delayMs: number): void {
        if (this.readerRasterRetryTimer || this.destroyed) return;
        this.readerRasterRetryTimer = window.setTimeout(() => {
            this.readerRasterRetryTimer = 0;
            if (this.destroyed) return;
            const settings = this.options.getSettings();
            this.refreshCanvasReaderSurfaces(settings);
            this.refreshBackgroundImageReaderSurfaces(settings);
        }, delayMs);
    }

    // A canvas capture failed (engine hasn't painted / mirror has no ops yet).
    // Retry with exponential backoff so the page OCRs as soon as it's ready instead
    // of waiting for the next 1200ms poll. After the cap automatic retries pause on
    // a tappable status. A real turn (releaseAllCanvasFrames), success, or explicit
    // tap resets the counter and reopens capture.
    // A user-requested (tapped) capture opens a bounded recapture WINDOW so the retry
    // re-attempts AS a tap — in tap/manual mode the poll itself never captures, so
    // without this a failed tap is dropped and the page never OCRs until the user taps
    // again. The window survives page-signature changes (a late repaint, or the poll
    // first seeing the freshly-composited page, that releaseAllCanvasFrames treats as a
    // turn) and is bounded by its own attempt count, so it can never become permanent
    // auto-OCR — it expires after READER_RASTER_MAX_CAPTURE_ATTEMPTS tries.
    private handleCanvasCaptureNotReady(canvas: HTMLCanvasElement, rect: DOMRect, userRequested: boolean): void {
        if (this.deferAutomaticCaptureForBookwalkerRecorder(canvas, rect, userRequested)) return;
        if (this.scheduleCanvasCaptureRetry(canvas, userRequested)) return;
        this.canvasFailureContentTokens.set(canvas, canvasStablePageContentToken(canvas));
        this.updateCanvasPendingStatus(canvas, rect, 'failed');
    }

    private deferAutomaticCaptureForBookwalkerRecorder(
        canvas: HTMLCanvasElement,
        rect: DOMRect,
        userRequested: boolean,
    ): boolean {
        if (userRequested || !isBookwalkerViewerHost()) return false;
        // Firefox can report BookWalker's just-created canvas as origin-readable
        // while it is still a blank backing store. Only bypass recorder boot when
        // that readable surface also contains page-like pixels; otherwise the
        // ordinary retry budget expires seconds before BookWalker paints/claims it.
        if (isCanvasReadable(canvas) && canvasRenderedContentSignature(canvas)) return false;
        // Tampermonkey can finish the sandboxed app before its page-world recorder
        // injection has installed or claimed BookWalker's first canvas. Treat that
        // short startup gap as recorder boot: the live canvas becomes capturable as
        // soon as the recorder arrives, while spending the ordinary retry budget
        // here flashes a false failure immediately before the same page succeeds.
        // Readable canvases bypass this wait above, and the bounded grace still
        // terminates genuinely unavailable recorder/screenshot paths.
        if (canvasMirrorContentToken(canvas)) {
            if (this.canvasMirrorWaitStartedAt.delete(canvas)) this.canvasCaptureAttempts.delete(canvas);
            return false;
        }
        const startedAt = this.canvasMirrorWaitStartedAt.get(canvas) ?? Date.now();
        this.canvasMirrorWaitStartedAt.set(canvas, startedAt);
        if (Date.now() - startedAt >= BOOKWALKER_RECORDER_BOOT_GRACE_MS) return false;
        // Keep one cheap retry per poll while BookWalker's document-start recorder
        // is still empty. The ordinary exponential budget is for genuine capture
        // failures after a page identity exists, not for viewer boot.
        this.canvasCaptureAttempts.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
        this.updateCanvasPendingStatus(canvas, rect, 'loading');
        // The existing 1200 ms reader-raster poll owns the next check. Scheduling
        // another timer here doubles mirror capture work and makes scrolling stutter.
        return true;
    }

    private scheduleCanvasCaptureRetry(canvas: HTMLCanvasElement, userRequested = false): boolean {
        if (userRequested) {
            if (!this.canvasTapRecapture.has(canvas)) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
            const remaining = this.canvasTapRecapture.get(canvas) ?? 0;
            if (remaining <= 0) { this.canvasTapRecapture.delete(canvas); return false; }
            const attempt = READER_RASTER_MAX_CAPTURE_ATTEMPTS - remaining; // 0,1,2…
            const delay = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** attempt, READER_RASTER_RETRY_MAX_MS);
            this.scheduleReaderRasterRefresh(delay);
            return true;
        }
        const attempts = (this.canvasCaptureAttempts.get(canvas) ?? 0) + 1;
        this.canvasCaptureAttempts.set(canvas, attempts);
        if (attempts > READER_RASTER_MAX_CAPTURE_ATTEMPTS) return false;
        const delay = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** (attempts - 1), READER_RASTER_RETRY_MAX_MS);
        this.scheduleReaderRasterRefresh(delay);
        return true;
    }

    // Re-attempt captures a tap requested but that weren't ready yet. Called before the
    // tap-mode poll early-return so a tapped-but-not-ready page keeps trying without the
    // user tapping again (the "page has no OCR" / no-pill report). Each pass decrements
    // the canvas's remaining window so it bounds out even if snapshot can't schedule.
    private retryPendingUserRequestedCaptures(settings: ReaderSettings): void {
        if (!this.canvasTapRecapture.size) return;
        for (const [canvas, remaining] of [...this.canvasTapRecapture]) {
            if (!canvas.isConnected || this.canvasFrames.has(canvas) || remaining <= 0) {
                this.canvasTapRecapture.delete(canvas);
                continue;
            }
            this.canvasTapRecapture.set(canvas, remaining - 1);
            void this.snapshotCanvasSurface(canvas, settings, true);
        }
    }

    private clearCanvasCaptureRetry(canvas: HTMLCanvasElement): void {
        this.canvasCaptureAttempts.delete(canvas);
        this.canvasMirrorWaitStartedAt.delete(canvas);
        this.canvasCommitMismatches.delete(canvas);
        this.canvasFailureContentTokens.delete(canvas);
        this.canvasTapRecapture.delete(canvas);
    }

    private updateCanvasPendingStatus(canvas: HTMLCanvasElement, rect: DOMRect, status: OcrVideoFrameStatus): void {
        const existing = this.canvasPendingStatuses.get(canvas);
        const card = existing ?? this.createVideoFrameStatus(status);
        if (existing) this.setVideoFrameStatus(card, status);
        else this.canvasPendingStatuses.set(canvas, card);
        card.classList.add('jpdb-ocr-canvas-status');
        this.configureCanvasPendingStatusRetry(card);
        this.updateReaderRasterRetryLabel(card, status);
        const labelNode = card.querySelector('.jpdb-ocr-video-frame-status-label');
        if (labelNode) labelNode.textContent = uiText(this.options.getSettings().interfaceLanguage, videoFrameStatusTextKey(status));
        card.hidden = false;
        this.canvasPendingStatusKeys.set(canvas, canvasSurfaceSnapshotKey(canvas));
        positionOcrImageStatus(card, this.visibleViewportIntersection(rect) ?? rect);
    }

    private removeCanvasPendingStatus(canvas: HTMLCanvasElement): void {
        const card = this.canvasPendingStatuses.get(canvas);
        if (!card) return;
        removeOcrArtifact(card);
        this.canvasPendingStatuses.delete(canvas);
        this.canvasPendingStatusKeys.delete(canvas);
    }

    private isTerminalCanvasPendingStatus(card: HTMLElement): boolean {
        const status = card.dataset.status;
        return status === 'empty' || status === 'failed';
    }

    private configureCanvasPendingStatusRetry(card: HTMLElement): void {
        card.dataset.yomuOcrRetry = 'true';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        if (card.dataset.yomuOcrRetryListener === 'true') return;
        card.dataset.yomuOcrRetryListener = 'true';
        card.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.retryCanvasPendingStatusCard(card);
        });
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            this.retryCanvasPendingStatusCard(card);
        });
    }

    private retryCanvasPendingStatusCard(card: HTMLElement): void {
        const canvas = [...this.canvasPendingStatuses].find(([, candidate]) => candidate === card)?.[0];
        if (!canvas) return;
        this.cancelCanvasSnapshot(canvas);
        this.removeCanvasPendingStatus(canvas);
        this.clearCanvasCaptureRetry(canvas);
        void this.snapshotCanvasSurface(canvas, this.options.getSettings(), true);
    }

    private releaseCanvasFrame(canvas: HTMLCanvasElement): void {
        const frame = this.canvasFrames.get(canvas);
        this.cancelCanvasSnapshot(canvas);
        this.removeCanvasPendingStatus(canvas);
        if (!frame) return;
        const loadTimer = this.canvasFrameLoadTimers.get(frame);
        if (loadTimer) window.clearTimeout(loadTimer);
        this.canvasFrameLoadTimers.delete(frame);
        this.canvasFrames.delete(canvas);
        const state = this.states.get(frame);
        if (state) this.releaseImageState(frame, state);
        else this.forgetImageWork(frame);
        this.canvasFrameSources.delete(frame);
        this.canvasFrameStaticRects.delete(frame);
        this.canvasFrameRegionFractions.delete(frame);
        this.canvasFrameKeys.delete(canvas);
        this.canvasFrameContentTokens.delete(canvas);
        this.canvasContentReadiness.delete(canvasContentReadinessKey(canvas));
        this.canvasCaptureAttempts.delete(canvas);
        this.canvasMirrorWaitStartedAt.delete(canvas);
        this.canvasCommitMismatches.delete(canvas);
        this.canvasFailureContentTokens.delete(canvas);
        this.canvasTapRecapture.delete(canvas);
        this.canvasFrameUserRequested.delete(canvas);
        frame.remove();
    }

    private releaseAllCanvasFrames(): void {
        for (const canvas of [...this.canvasFrames.keys()]) this.releaseCanvasFrame(canvas);
        for (const canvas of [...this.canvasPendingStatuses.keys()]) {
            this.cancelCanvasSnapshot(canvas);
            this.removeCanvasPendingStatus(canvas);
        }
        // NFBR reuses the same canvas object across turns; a stale readiness entry
        // (or capture-attempt count) would carry into the next page, so clear both.
        this.canvasContentReadiness.clear();
        this.canvasCaptureAttempts.clear();
        this.canvasMirrorWaitStartedAt.clear();
        this.canvasCommitMismatches.clear();
        this.canvasFailureContentTokens.clear();
        // NOTE: canvasTapRecapture is deliberately NOT cleared here. A turn is detected
        // by a page-signature change, but so is a late repaint / the poll first seeing
        // the just-composited page — clearing the tap window on either would drop a tap
        // whose capture wasn't ready (the no-OCR bug). The window is self-bounding (it
        // expires after its attempt budget) so a genuine turn can't leave it auto-OCRing.
        this.canvasReaderSignature = undefined;
        this.canvasReaderSamePageSignatureSkips = 0;
    }

    private positionCanvasFrames(): void {
        for (const [canvas, status] of [...this.canvasPendingStatuses]) {
            if (!canvas.isConnected) {
                this.cancelCanvasSnapshot(canvas);
                this.removeCanvasPendingStatus(canvas);
                continue;
            }
            const key = this.canvasPendingStatusKeys.get(canvas);
            if (key && canvasSurfaceSnapshotKey(canvas) !== key) {
                this.cancelCanvasSnapshot(canvas);
                this.removeCanvasPendingStatus(canvas);
                continue;
            }
            const rect = this.visibleViewportIntersection(canvas.getBoundingClientRect());
            if (!rect) {
                if (this.isTerminalCanvasPendingStatus(status)) this.removeCanvasPendingStatus(canvas);
                else status.hidden = true;
                continue;
            }
            status.hidden = false;
            positionOcrImageStatus(status, rect);
        }
        for (const [canvas, frame] of [...this.canvasFrames]) {
            if (!canvas.isConnected) {
                this.releaseCanvasFrame(canvas);
                continue;
            }
            const rect = canvas.getBoundingClientRect();
            // A modal lookup marks the visibly painted host aria-hidden for assistive tech.
            // That must not look like a page turn and tear down the OCR anchor mid-lookup.
            if (!rect.width || !rect.height || isHiddenByCss(canvas) || isInsideHiddenAncestor(canvas, false)) {
                this.releaseCanvasFrame(canvas);
                continue;
            }
            const key = this.canvasFrameKeys.get(canvas);
            if (key && key !== canvasSurfaceSnapshotKey(canvas)) {
                this.releaseCanvasFrame(canvas);
                this.scheduleReaderRasterRefresh(40);
                continue;
            }
            // Content identity is checked by the debounced raster refresh. The rAF
            // scroll path only repositions artifacts; sampling/pulling mirror state
            // here made continuous scrolling stutter and could tear down a ready
            // frame mid-gesture.
            const staticRect = this.canvasFrameStaticRects.get(frame);
            if (staticRect) {
                const currentRegionRect = this.canvasFrameRegionRect(frame, rect);
                if (this.canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, rect)) {
                    if (this.shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame)) {
                        this.releaseCanvasFrameForResnapshot(canvas);
                        this.scheduleReaderRasterRefresh(40);
                        continue;
                    }
                }
                positionCanvasFrameImage(frame, currentRegionRect ?? staticRect);
                continue;
            }
            // A CSS-only zoom/reflow does not invalidate a complete OCR map. Reader
            // overlays use proportional provider coordinates, so resizing both the
            // canvas and frame in place preserves alignment without another mirror
            // capture or OCR request. Intrinsic bitmap and page-content changes are
            // still rejected above through the snapshot key/content token.
            positionCanvasFrameImage(frame, rect);
        }
    }

    private releaseCanvasFrameForResnapshot(canvas: HTMLCanvasElement): void {
        const preserveUserRequested = this.canvasFrameUserRequested.has(canvas);
        this.releaseCanvasFrame(canvas);
        if (preserveUserRequested) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
    }

    private canvasFrameNeedsResnapshot(canvas: HTMLCanvasElement): boolean {
        const frame = this.canvasFrames.get(canvas);
        if (!frame || frame.complete === false) return false;
        const key = this.canvasFrameKeys.get(canvas);
        if (key && key !== canvasSurfaceSnapshotKey(canvas)) return true;
        if (this.canvasContentTokenChanged(canvas, this.canvasFrameContentTokens.get(canvas))) return true;
        const staticRect = this.canvasFrameStaticRects.get(frame);
        if (staticRect) {
            const canvasRect = canvas.getBoundingClientRect();
            const currentRegionRect = this.canvasFrameRegionRect(frame, canvasRect);
            return Boolean(this.canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, canvasRect)
                && this.shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame));
        }
        return false;
    }

    private shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame: HTMLImageElement): boolean {
        if (!this.isReaderRasterFrame(frame)) return false;
        const status = this.imageStatuses.get(frame)?.dataset.status;
        // A manual retry may OCR only the visible crop of a tall canvas. If that crop
        // changes, its pixels no longer represent the newly visible source region and
        // must be rebuilt. Full-page frames never enter this branch and can scale in
        // place. Use the parsed result as the durable signal because the status pill
        // can be removed independently from the OCR layer.
        return status === 'ready' || Boolean(this.states.get(frame)?.result?.lines.length);
    }

    private canvasFrameRectSizeChanged(captured: DOMRect, current: DOMRect): boolean {
        return Math.abs(captured.width - current.width) > READER_RASTER_FRAME_SIZE_CHANGE_PX
            || Math.abs(captured.height - current.height) > READER_RASTER_FRAME_SIZE_CHANGE_PX;
    }

    private canvasStaticFrameGeometryChanged(
        frame: HTMLImageElement,
        staticRect: DOMRect,
        currentRegionRect: DOMRect | undefined,
        canvasRect: DOMRect,
    ): boolean {
        return Boolean(currentRegionRect && (
            this.canvasFrameRectSizeChanged(staticRect, currentRegionRect)
            || this.canvasFrameSourceSizeChanged(frame, staticRect, canvasRect)
        ));
    }

    private canvasFrameSourceSizeChanged(frame: HTMLImageElement, staticRect: DOMRect, canvasRect: DOMRect): boolean {
        const fractions = this.canvasFrameRegionFractions.get(frame);
        if (!fractions?.width || !fractions.height) return false;
        const sourceWidth = staticRect.width / fractions.width;
        const sourceHeight = staticRect.height / fractions.height;
        return Math.abs(sourceWidth - canvasRect.width) > READER_RASTER_FRAME_SIZE_CHANGE_PX
            || Math.abs(sourceHeight - canvasRect.height) > READER_RASTER_FRAME_SIZE_CHANGE_PX;
    }

    private canvasContentTokenChanged(canvas: HTMLCanvasElement, previous: string | undefined): boolean {
        return hasCanvasIdentityChanged(canvas, previous);
    }

    private canvasFrameRegionRect(frame: HTMLImageElement, canvasRect: DOMRect): DOMRect | undefined {
        const fractions = this.canvasFrameRegionFractions.get(frame);
        if (!fractions || !canvasRect.width || !canvasRect.height) return undefined;
        return new DOMRect(
            canvasRect.left + fractions.x * canvasRect.width,
            canvasRect.top + fractions.y * canvasRect.height,
            fractions.width * canvasRect.width,
            fractions.height * canvasRect.height,
        );
    }

    private visibleViewportIntersection(rect: DOMRect): DOMRect | undefined {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewportWidth || !viewportHeight) return undefined;
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(viewportWidth, rect.right);
        const bottom = Math.min(viewportHeight, rect.bottom);
        const width = right - left;
        const height = bottom - top;
        return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : undefined;
    }

    private refreshBackgroundImageReaderSurfaces(settings: ReaderSettings, userRequested = false): void {
        if (!ocrRuntimeActive(settings) || settings.ocrProvider === 'off') return;
        if (!settings.ocrAutoScanImages && !userRequested) return;
        // BookWalker's CSS/source assets are scrambled inputs to its page canvas,
        // not alternate readable pages. Sending them to OCR duplicates the mirror
        // request, adds substantial scroll work, and can flash a false failure.
        if (isBookwalkerViewerHost()) {
            this.releaseAllBackgroundFrames();
            return;
        }
        if (this.options.shouldAutoScan?.() === false && !userRequested) {
            this.releaseAllBackgroundFrames();
            return;
        }
        if (this.isProvenRasterFreePage() || !isReaderRasterPage()) {
            this.releaseAllBackgroundFrames();
            return;
        }
        this.startReaderRasterPollingIfNeeded();
        // Some readers expose the same painted page twice: a canvas used for display
        // plus its raw CSS/source image underneath. OCRing both wastes a provider
        // request and, on scrambled readers such as BookWalker, lets the unusable raw
        // asset flash "Could not read text" while the reconstructed canvas succeeds.
        // Prefer the canvas only when the two representations visibly overlap; true
        // background-only readers and distinct neighbouring pages remain untouched.
        const canvasSurfaces = activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
        const surfaces = activeReaderRasterSurfaces(collectBackgroundImageReaderSurfaces(), settings, userRequested)
            .filter(surface => !canvasSurfaces.some(canvas => readerRasterSurfacesOverlap(canvas, surface)));
        for (const surface of [...this.backgroundFrames.keys()]) {
            const key = this.backgroundFrameKeys.get(surface);
            if (!surfaces.includes(surface) || key !== backgroundSurfaceCacheKey(surface)) this.releaseBackgroundFrame(surface);
        }
        for (const surface of surfaces) {
            if (this.backgroundFrames.has(surface)) continue;
            this.snapshotBackgroundImageSurface(surface, settings, userRequested);
        }
    }

    private snapshotBackgroundImageSurface(surface: HTMLElement, settings: ReaderSettings, userRequested = false): void {
        if (this.backgroundFrames.has(surface)) return;
        const url = backgroundImageReaderUrl(surface);
        if (!url) return;
        const rect = surface.getBoundingClientRect();
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(surface, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(surface) || isInsideHiddenAncestor(surface)) return;
        const frame = document.createElement('img');
        frame.className = 'jpdb-ocr-background-frame';
        frame.dataset.yomuBackgroundFrame = 'true';
        frame.alt = '';
        frame.decoding = 'async';
        positionCanvasFrameImage(frame, rect);
        frame.addEventListener('load', () => {
            if (this.backgroundFrames.get(surface) === frame) this.enqueue(frame, userRequested);
        }, { once: true });
        frame.src = url;
        document.body.append(frame);
        this.backgroundFrames.set(surface, frame);
        this.backgroundFrameSources.set(frame, surface);
        this.backgroundFrameKeys.set(surface, backgroundSurfaceCacheKey(surface));
        this.schedulePosition();
    }

    private releaseBackgroundFrame(surface: HTMLElement): void {
        const frame = this.backgroundFrames.get(surface);
        if (!frame) return;
        this.backgroundFrames.delete(surface);
        this.backgroundFrameKeys.delete(surface);
        const state = this.states.get(frame);
        if (state) this.releaseImageState(frame, state);
        else this.forgetImageWork(frame);
        this.backgroundFrameSources.delete(frame);
        frame.remove();
    }

    private releaseAllBackgroundFrames(): void {
        for (const surface of [...this.backgroundFrames.keys()]) this.releaseBackgroundFrame(surface);
    }

    private retryVisibleReaderRasterFrames(settings: ReaderSettings): number {
        let retried = 0;
        for (const image of [...this.states.keys()]) {
            if (!this.isReaderRasterFrame(image)) continue;
            const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
            if (!isImageVisibleForOcr(image, rect) || !isNearViewport(image, readerRasterCaptureMargin(settings, true))) continue;
            this.retryReaderRasterImage(image);
            retried++;
        }
        return retried;
    }

    private retryReaderRasterImage(image: HTMLImageElement): void {
        const target = captureOcrTargetContext();
        const work = ocrTargetWork(imageCacheKey(image), target);
        const state = this.states.get(image);
        const attemptKey = image.dataset.ocrAttemptKey;
        const emptyScanKey = state ? this.readerRasterEmptyScanKey(state, work) : attemptKey && target.workKey(attemptKey);
        if (state) this.forget(state.target.cacheKey(state.key));
        this.forget(work.cacheKey);
        this.readerRasterEmptyScans.delete(work.workKey);
        if (state) this.readerRasterEmptyScans.delete(state.target.workKey(state.key));
        if (emptyScanKey) this.readerRasterEmptyScans.delete(emptyScanKey);
        this.readerRasterFailedScans.delete(work.workKey);
        if (state) this.readerRasterFailedScans.delete(state.target.workKey(state.key));
        this.clearReaderRasterProviderRetry(work.workKey);
        if (state) this.clearReaderRasterProviderRetry(state.target.workKey(state.key));
        this.queue = this.queue.filter(queued => queued !== image);
        const settings = this.options.getSettings();
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) {
            this.releaseCanvasFrame(canvas);
            void this.snapshotCanvasSurface(canvas, settings, true);
            return;
        }
        const background = this.backgroundFrameSources.get(image);
        if (background) {
            this.releaseBackgroundFrame(background);
            this.snapshotBackgroundImageSurface(background, settings, true);
        }
    }

    private positionBackgroundFrames(): void {
        for (const [surface, frame] of [...this.backgroundFrames]) {
            if (!surface.isConnected) {
                this.releaseBackgroundFrame(surface);
                continue;
            }
            positionCanvasFrameImage(frame, surface.getBoundingClientRect());
        }
    }

    private positionVideoFrames(): void {
        for (const [video, frame] of [...this.videoFrames]) {
            if (!video.isConnected || !video.paused) {
                this.releaseVideoFrame(video);
                continue;
            }
            const rect = video.getBoundingClientRect();
            this.syncVideoFrameArtifactMount(video, frame);
            positionVideoFrameImage(frame, rect, video);
            const resume = this.videoFrameControls.get(video);
            if (resume) positionVideoFrameResumeControl(resume, rect, video);
            const status = this.videoFrameStatuses.get(video);
            if (status) positionVideoFrameStatus(status, rect, video);
        }
    }

    private scheduleRefresh(delay: number): void {
        if (this.destroyed) return;
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            if (!this.destroyed) this.refresh();
        }, delay);
    }

    private positionState(image: HTMLImageElement): void {
        this.positionStates([image], true);
    }

    private positionAllStates(): void {
        this.positionStates(this.states.keys());
    }

    private positionStates(images: Iterable<HTMLImageElement>, forceLayout = false): void {
        const plans: OcrPositionPlan[] = [];
        const fontScale = this.options.getSettings().ocrFontScale;
        for (const image of images) {
            const state = this.states.get(image);
            if (!state) continue;
            const overlay = state.overlay;
            const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
            if (!isImageVisibleForOcr(image, rect)) {
                plans.push([overlay]);
                continue;
            }
            const surface = this.ocrLayerTransformSurface(image);
            const linear = surface
                ? composedOcrSurfaceTransform(surface, overlay.parentElement, rect)
                : null;
            const placement = ocrOverlayLayerPlacement(
                rect,
                linear,
                { width: surface?.offsetWidth ?? 0, height: surface?.offsetHeight ?? 0 },
            );
            plans.push([
                overlay,
                placement,
                this.renderedOcrImageFrameForState(
                    image,
                    ocrPlacedSurfaceRect(rect, placement),
                    state.result,
                    rect.bottom,
                ),
                ocrArtifactRootOffset(overlay),
                ocrOverlayTypeface(overlay),
            ]);
        }
        for (const [overlay, placement, frame, offset, typeface] of plans) {
            const visible = Boolean(placement && frame);
            overlay.hidden = !visible;
            setOcrOverlayAccessibility(overlay, visible);
            if (!placement || !frame) continue;
            setOcrArtifactPosition(overlay, placement.left, placement.top, offset);
            overlay.style.width = `${placement.width}px`;
            overlay.style.height = `${placement.height}px`;
            setOcrLayerTransform(overlay, placement.transform);
            layoutOcrOverlayIfChanged(
                overlay,
                frame,
                fontScale,
                placement.linear,
                typeface,
                forceLayout,
            );
        }
    }

    // Follow the element painting the pixels; regional canvas captures stay axis-aligned.
    private ocrLayerTransformSurface(image: HTMLImageElement): HTMLElement | null {
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) {
            return this.canvasFrameRegionFractions.has(image) || this.canvasFrameStaticRects.has(image) ? null : canvas;
        }
        return this.backgroundFrameSources.get(image) ?? image;
    }

    private readerRasterSourceRect(image: HTMLImageElement): DOMRect | undefined {
        const canvas = this.canvasFrameSources.get(image);
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            return this.canvasFrameRegionRect(image, rect) ?? this.canvasFrameStaticRects.get(image) ?? rect;
        }
        const surface = this.backgroundFrameSources.get(image);
        return surface?.getBoundingClientRect();
    }

    // Reserve only true viewport-bottom reader chrome, never in-page player chrome.
    private renderedOcrImageFrameForState(
        image: HTMLImageElement,
        rect: OcrSurfaceRect,
        result: OcrResult | undefined,
        viewportBottom = rect.bottom,
    ): OcrRenderedImageFrame {
        const frame = this.canvasFrameSources.has(image)
            ? renderedCanvasReaderFrame(rect)
            : renderedOcrImageFrame(image, rect, result);
        if (!this.canvasFrameSources.has(image) && !this.backgroundFrameSources.has(image)) return frame;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewportHeight || viewportBottom < viewportHeight - 2) return frame;
        const reserved = Math.max(0, Math.min(READER_RASTER_BOTTOM_CHROME_RESERVE_PX, frame.imageHeight - 1));
        return reserved ? { ...frame, safeBottomInset: reserved } : frame;
    }

    private clear(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        this.observerMargin = '';
        window.clearTimeout(this.refreshTimer);
        this.releaseAllCanvasFrames();
        this.releaseAllBackgroundFrames();
        this.queue = [];
        this.inFlightJobs.clear();
        for (const timer of this.readerRasterProviderRetryTimers.values()) window.clearTimeout(timer);
        this.readerRasterProviderRetryTimers.clear();
        this.readerRasterProviderFailures.clear();
        for (const state of this.states.values()) {
            if (state.loadListener) state.image.removeEventListener('load', state.loadListener);
            removeOcrArtifact(state.overlay);
        }
        this.states.clear();
        this.discardOcrLineInteractionState([...this.lookupLineLeases.keys()]);
        for (const timer of this.imageStatusTimers.values()) window.clearTimeout(timer);
        this.imageStatusTimers.clear();
        for (const card of this.imageStatuses.values()) removeOcrArtifact(card);
        this.imageStatuses.clear();
    }

    // Drop only the overlays the reader auto-painted, keeping panels the user
    // scanned by hand (those carry overlayRequested/manualRequested). Used when
    // we start deferring to a page's native text layer mid-session. The cached
    // results stay in `this.cache`, so flipping back re-renders them instantly
    // without re-OCRing.
    private clearAutoScannedOverlays(): void {
        for (const [image, state] of [...this.states]) {
            if (state.manualRequested || state.overlayRequested) continue;
            const canvas = this.canvasFrameSources.get(image);
            if (canvas) {
                this.releaseCanvasFrame(canvas);
                continue;
            }
            const background = this.backgroundFrameSources.get(image);
            if (background) {
                this.releaseBackgroundFrame(background);
                continue;
            }
            this.releaseImageState(image, state);
        }
    }

    private releaseInlineImageStates(): void {
        for (const [image, state] of [...this.states]) {
            if (this.isReaderRasterFrame(image) || this.videoFrameVideos.has(image)) continue;
            this.releaseImageState(image, state);
        }
    }

    private syncPageScannerIsolation(settings: ReaderSettings): void {
        const enabled = isPopupLookupEnabled(settings);
        if (this.pageScannerIsolationEnabled === enabled) return;
        this.pageScannerIsolationEnabled = enabled;
        for (const state of this.states.values()) {
            state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line-text')
                .forEach(lineText => normalizeOcrRenderedText(lineText, enabled));
        }
    }

    private rememberOcrWordRenderStates(line: HTMLElement, tokens: JPDBToken[]): void {
        this.ocrWordRenderStates.rememberLine(line, tokens);
    }

    reconcileRenderedWordVocabulary(word: HTMLElement, card: JPDBCard, pitchClass: string): void {
        this.ocrWordRenderStates.reconcile(word, card, pitchClass);
    }

    private activateOcrLineMarkup(state: ImageState, line: HTMLElement): void {
        if (this.activateOcrMarkup(line)) this.positionState(state.image);
    }

    private activateOcrMarkup(line: HTMLElement): boolean {
        const previousHasFurigana = line.dataset.hasFuri;
        const wasActivated = line.dataset.ocrMarkupActivated === 'true';
        let hasFurigana = false;
        const settings = this.options.getSettings();
        const isolatePageScanners = isPopupLookupEnabled(settings);
        line.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]').forEach(word => {
            const state = this.ocrWordRenderStates.get(word);
            if (!state) return;
            this.applyOcrPitchClass(word, state.token);
            if (!shouldRenderRuby(state.surface, state.token, settings)) {
                this.setOcrWordPlainText(word, state.surface, isolatePageScanners);
                return;
            }
            setInnerHtml(word, renderRuby(state.surface, state.token));
            normalizeOcrRenderedText(word, isolatePageScanners);
            word.classList.add('jpdb-reader-has-furi');
            hasFurigana = true;
        });
        line.dataset.hasFuri = String(hasFurigana);
        line.dataset.ocrMarkupActivated = 'true';
        return !wasActivated || previousHasFurigana !== line.dataset.hasFuri;
    }

    private applyOcrPitchClass(word: HTMLElement, token: JPDBToken): void {
        this.clearOcrPitchClass(word);
        const pitchClass = ocrSafePitchClass(token.pitchClass);
        word.dataset.pitchClass = pitchClass;
        if (pitchClass) word.classList.add(`jpdb-pitch-${pitchClass}`);
    }

    private clearOcrPitchClass(word: HTMLElement): void {
        word.classList.forEach(className => {
            if (/^jpdb-pitch-/u.test(className)) word.classList.remove(className);
        });
        word.dataset.pitchClass = '';
    }

    private setOcrWordPlainText(word: HTMLElement, surface: string, isolatePageScanners: boolean): void {
        word.classList.remove('jpdb-reader-has-furi');
        setInnerHtml(word, escapeHtml(surface));
        normalizeOcrRenderedText(word, isolatePageScanners);
    }

    // Drop every paused-frame and image overlay when YouTube navigates so no
    // stale OCR artifact (rail resume button, overlay over the player) carries
    // across the SPA route change, then re-scan the destination page.
    private teardownForNavigation(): void {
        if (this.states.size === 0 && this.videoFrames.size === 0 && this.canvasFrames.size === 0 && this.backgroundFrames.size === 0) return;
        this.releaseAllVideoFrames();
        this.clear();
        if (ocrRuntimeActive(this.options.getSettings())) this.scheduleRefresh(0);
    }

    private pruneDisconnectedStates(): void {
        for (const [image, state] of this.states) {
            if (image.isConnected) continue;
            this.releaseImageState(image, state);
        }
    }

    private releaseImageState(image: HTMLImageElement, state = this.states.get(image)): void {
        if (state) {
            this.observer?.unobserve(image);
            if (state.loadListener) image.removeEventListener('load', state.loadListener);
            this.discardOcrLineInteractionState(state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line'));
            removeOcrArtifact(state.overlay);
            this.states.delete(image);
        }
        this.forgetImageWork(image, state);
    }

    private syncVideoFrameArtifactMount(video: HTMLVideoElement, frame: HTMLImageElement): void {
        const root = videoFrameArtifactRoot(video);
        appendOcrArtifactToRoot(frame, root);
        const state = this.states.get(frame);
        if (state) appendOcrArtifactToRoot(state.overlay, root);
        const status = this.videoFrameStatuses.get(video);
        if (status) appendOcrArtifactToRoot(status, root);
        const resume = this.videoFrameControls.get(video);
        if (resume?.classList.contains('jpdb-ocr-video-frame-resume-fallback')) appendOcrArtifactToRoot(resume, root);
    }

    private forgetImageWork(image: HTMLImageElement, state?: ImageState): void {
        this.queue = this.queue.filter(queued => queued !== image);
        this.cancelReaderRasterProviderRetryTimer(ocrTargetWorkKey(imageCacheKey(image)));
        if (state) this.cancelReaderRasterProviderRetryTimer(state.target.workKey(state.key));
        this.removeImageStatusCard(image);
    }

    private isCurrentState(state: ImageState): boolean {
        return !this.destroyed && this.states.get(state.image) === state;
    }

    private isCurrentContentState(state: ImageState, key: string): boolean {
        return this.isCurrentState(state) && state.key === key && imageCacheKey(state.image) === key;
    }

    private requireCurrentContentState(state: ImageState, key: string): void {
        if (!this.isCurrentContentState(state, key)) throw STALE_OCR_STATE;
    }
}

function isStaleOcrState(error: unknown): error is typeof STALE_OCR_STATE {
    return error === STALE_OCR_STATE;
}

function applyOcrOverlayStyle(overlay: HTMLElement, settings: ReaderSettings): void {
    const theme = effectiveOcrOverlayTheme(settings);
    overlay.dataset.ocrOverlayTheme = theme;
    overlay.dataset.ocrOverlayVariant = settings.ocrOverlayTheme === 'auto' ? 'auto' : 'custom';
    if (theme === 'light') {
        overlay.style.setProperty('--jpdb-ocr-text-color', '#17202a');
        overlay.style.setProperty('--jpdb-ocr-outline-color', 'rgba(255, 255, 255, 0)');
        overlay.style.setProperty('--jpdb-ocr-background-rgba', 'rgba(248, 250, 252, 0.68)');
        overlay.style.setProperty('--jpdb-ocr-background-active-rgba', 'rgba(248, 250, 252, 0.86)');
        return;
    }
    overlay.style.setProperty('--jpdb-ocr-text-color', settings.ocrTextColor);
    overlay.style.setProperty('--jpdb-ocr-outline-color', settings.ocrOutlineColor);
    const opacity = accessibleOcrBackgroundOpacity(settings.ocrBackgroundOpacity);
    const background = accessibleOcrBackgroundColor(settings.accentColor, opacity);
    overlay.style.setProperty('--jpdb-ocr-background-rgba', accentToRgba(background, opacity));
    overlay.style.setProperty('--jpdb-ocr-background-active-rgba', accentToRgba(background, Math.min(1, opacity + 0.12)));
}

function effectiveOcrOverlayTheme(settings: ReaderSettings): 'dark' | 'light' {
    if (settings.ocrOverlayTheme === 'dark' || settings.ocrOverlayTheme === 'light') return settings.ocrOverlayTheme;
    if (settings.theme === 'dark' || settings.theme === 'light') return settings.theme;
    try {
        return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

function ocrParseOptions(): ReaderParserParseOptions {
    return {
        allowSegmentedFallback: true,
        includeLocalPitch: true,
    };
}

function ocrTokensWithFallbackGaps(
    text: string,
    tokens: JPDBToken[],
    fallbackCardFromText: (text: string) => JPDBCard,
): JPDBToken[] {
    const safeTokens = tokens.filter(token => isRenderableOcrToken(token, text.length));
    const fallbackTokens = segmentTargetLanguageText(text)
        .filter(segment => !safeTokens.some(token => rangesOverlap(segment.start, segment.end, token.start, token.end)))
        .map(segment => ocrFallbackToken(text, segment, fallbackCardFromText));
    return fallbackTokens.length
        ? [...safeTokens, ...fallbackTokens].sort(compareOcrTokens)
        : safeTokens;
}

function ocrTokensWithVocabulary(
    text: string,
    tokens: JPDBToken[],
    vocabulary: Map<string, JPDBCard> | null,
): JPDBToken[] {
    if (!vocabulary?.size) return tokens;
    return tokens.map(token => ocrTokenWithVocabulary(text, token, vocabulary));
}

function ocrTokenWithVocabulary(
    text: string,
    token: JPDBToken,
    vocabulary: Map<string, JPDBCard>,
): JPDBToken {
    const surface = ocrTokenSurface(text, token);
    const seeded = vocabulary.get(ocrVocabularyKey(surface)) ?? vocabulary.get(ocrVocabularyKey(token.card.spelling));
    if (!seeded) return token;
    const card = cloneOcrVocabularyCard(seeded);
    return {
        ...token,
        card,
        pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass,
    };
}

function ocrTokenSurface(text: string, token: JPDBToken): string {
    return text.slice(token.start, token.end) || token.card.spelling;
}

function isRenderableOcrToken(token: JPDBToken, textLength: number): boolean {
    return Number.isFinite(token.start)
        && Number.isFinite(token.end)
        && token.start >= 0
        && token.end <= textLength
        && token.end > token.start;
}

function ocrFallbackToken(
    sentence: string,
    segment: { text: string; start: number; end: number },
    fallbackCardFromText: (text: string) => JPDBCard,
): JPDBToken {
    const card = fallbackCardFromText(segment.text);
    return {
        card,
        start: segment.start,
        end: segment.end,
        length: segment.end - segment.start,
        rubies: [],
        pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling),
        sentence,
    };
}

function ocrFallbackCardFromImage(
    image: HTMLImageElement,
    fallbackCardFromText: (text: string) => JPDBCard,
): (text: string) => JPDBCard {
    const vocabulary = ocrVocabularyCards(image);
    if (!vocabulary?.size) return fallbackCardFromText;
    return text => {
        const seeded = vocabulary.get(ocrVocabularyKey(text));
        return seeded ? cloneOcrVocabularyCard(seeded) : fallbackCardFromText(text);
    };
}

function ocrVocabularyCards(image: HTMLImageElement): Map<string, JPDBCard> | null {
    const cached = ocrVocabularyCache.get(image);
    if (cached !== undefined) return cached;
    const parsed = parseOcrVocabularyCards(image.dataset.ocrVocabulary);
    ocrVocabularyCache.set(image, parsed);
    return parsed;
}

function parseOcrVocabularyCards(value: string | undefined): Map<string, JPDBCard> | null {
    if (!value) return null;
    try {
        const entries = JSON.parse(value);
        if (!Array.isArray(entries)) return null;
        const cards = new Map<string, JPDBCard>();
        entries.forEach(entry => {
            if (!isOcrVocabularyRecord(entry)) return;
            const card = ocrVocabularyCard(entry);
            const surface = ocrVocabularySurface(entry) || card?.spelling;
            if (card && surface) cards.set(ocrVocabularyKey(surface), card);
        });
        return cards.size ? cards : null;
    } catch {
        return null;
    }
}

function ocrVocabularyCard(entry: unknown): JPDBCard | null {
    if (!isOcrVocabularyRecord(entry)) return null;
    const surface = ocrVocabularySurface(entry);
    const spelling = ocrVocabularyString(entry.spelling) || surface;
    if (!surface || !spelling) return null;
    const reading = ocrVocabularyString(entry.reading);
    const id = -stablePositiveHashId(`ocr-vocabulary\n${spelling}\n${reading}`);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading,
        frequencyRank: ocrVocabularyInteger(entry.frequencyRank) ?? null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: ocrVocabularyPitchPatterns(entry, reading),
        wordWithReading: null,
        source: 'fallback',
    };
}

function cloneOcrVocabularyCard(card: JPDBCard): JPDBCard {
    return {
        ...card,
        partOfSpeech: [...card.partOfSpeech],
        meanings: card.meanings.map(meaning => ({
            ...meaning,
            glosses: [...meaning.glosses],
            partOfSpeech: [...meaning.partOfSpeech],
        })),
        cardState: [...card.cardState],
        pitchAccent: [...card.pitchAccent],
    };
}

function ocrVocabularySurface(entry: Record<string, unknown>): string {
    return ocrVocabularyString(entry.surface) || ocrVocabularyString(entry.text);
}

function ocrVocabularyPitchPatterns(entry: Record<string, unknown>, reading: string): string[] {
    const explicit = Array.isArray(entry.pitchAccent)
        ? entry.pitchAccent.filter((value): value is string => typeof value === 'string' && /^[HL]+$/u.test(value))
        : [];
    const positions = ocrVocabularyPitchPositions(entry);
    return [
        ...explicit,
        ...positions.map(position => pitchPatternFromPosition(reading, position)).filter(Boolean),
    ];
}

function ocrVocabularyPitchPositions(entry: Record<string, unknown>): number[] {
    if (Array.isArray(entry.pitchPositions)) {
        return entry.pitchPositions
            .map(ocrVocabularyInteger)
            .filter((position): position is number => position !== undefined);
    }
    const position = ocrVocabularyInteger(entry.pitchPosition);
    return position === undefined ? [] : [position];
}

function ocrVocabularyKey(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function ocrVocabularyString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function ocrVocabularyInteger(value: unknown): number | undefined {
    return Number.isInteger(value) ? value as number : undefined;
}

function isOcrVocabularyRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rangesOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && otherStart < end;
}

function compareOcrTokens(first: JPDBToken, second: JPDBToken): number {
    return first.start - second.start || second.length - first.length;
}

function createOcrLineElement(
    result: OcrResult,
    line: OcrLine,
    tokens: JPDBToken[],
    sentence: string,
    showText: boolean,
    settings: ReaderSettings,
): HTMLElement {
    const element = document.createElement('div');
    element.className = showText ? 'jpdb-ocr-line jpdb-ocr-line-visible' : 'jpdb-ocr-line';
    setOcrLineDataset(element, result, line, sentence);
    element.tabIndex = 0;
    element.style.writingMode = line.vertical ? 'vertical-rl' : 'horizontal-tb';
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', line.text);
    element.setAttribute('aria-pressed', 'false');
    const textElement = createOcrLineText(line, tokens, settings);
    element.append(textElement);
    element.dataset.hasFuri = String(Boolean(textElement.querySelector('.jpdb-reader-has-furi')));
    setOcrLinePosition(element, result, line);
    return element;
}

function ocrRenderedLineIdentity(element: HTMLElement): string {
    return JSON.stringify([
        element.dataset.ocrText ?? '',
        element.dataset.boxLeft ?? '',
        element.dataset.boxTop ?? '',
        element.dataset.boxWidth ?? '',
        element.dataset.boxHeight ?? '',
        element.dataset.vertical ?? '',
    ]);
}

function setOcrLineDataset(element: HTMLElement, result: OcrResult, line: OcrLine, sentence: string): void {
    element.dataset.ocrText = line.text;
    element.dataset.boxLeft = String(line.box.left / result.width);
    element.dataset.boxTop = String(line.box.top / result.height);
    element.dataset.vertical = String(line.vertical);
    element.dataset.boxWidth = String(line.box.width / result.width);
    element.dataset.boxHeight = String(line.box.height / result.height);
    element.dataset.sentence = sentence;
}

function createOcrLineText(line: OcrLine, tokens: JPDBToken[], settings: ReaderSettings): HTMLElement {
    const textElement = document.createElement('span');
    textElement.className = 'jpdb-ocr-line-text';
    setInnerHtml(textElement, tokens.length ? renderTokensToHtml(line.text, tokens, settings) : escapeHtml(line.text));
    normalizeOcrRenderedText(textElement, isPopupLookupEnabled(settings));
    return textElement;
}

function ocrSafePitchClass(pitchClass: string | undefined): string {
    const normalized = pitchClass?.trim() ?? '';
    return /^(?:heiban|atamadaka|nakadaka|odaka)$/u.test(normalized) ? normalized : '';
}

function setOcrLinePosition(element: HTMLElement, result: OcrResult, line: OcrLine): void {
    element.style.left = `${100 * line.box.left / result.width}%`;
    element.style.top = `${100 * line.box.top / result.height}%`;
    element.style.width = `${100 * line.box.width / result.width}%`;
    element.style.height = `${100 * line.box.height / result.height}%`;
}

function renderedOcrImageFrame(image: HTMLImageElement, rect: OcrSurfaceRect, result: OcrResult | undefined): OcrRenderedImageFrame {
    const pausedVideoFrame = renderedPausedVideoFrame(image, rect);
    if (pausedVideoFrame) return pausedVideoFrame;
    const style = getComputedStyle(image);
    const content = imageContentBox(image, rect, style);
    const { sourceWidth, sourceHeight } = ocrSourceDimensions(image, rect, content, result);
    return paintedImageFrame({
        image,
        rect,
        style,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        sourceWidth,
        sourceHeight,
    });
}

function renderedPausedVideoFrame(image: HTMLImageElement, rect: OcrSurfaceRect): OcrRenderedImageFrame | null {
    if (image.dataset.yomuVideoFrame !== 'true') return null;
    return {
        imageLeft: 0,
        imageTop: 0,
        imageWidth: Math.max(1, rect.width),
        imageHeight: Math.max(1, rect.height),
    };
}

function renderedCanvasReaderFrame(rect: OcrSurfaceRect): OcrRenderedImageFrame {
    return {
        imageLeft: 0,
        imageTop: 0,
        imageWidth: Math.max(1, rect.width),
        imageHeight: Math.max(1, rect.height),
    };
}

function ocrSourceDimensions(
    image: HTMLImageElement,
    rect: OcrSurfaceRect,
    content: OcrRect,
    result: OcrResult | undefined,
): { sourceWidth: number; sourceHeight: number } {
    return {
        sourceWidth: firstTruthyNumber(result?.width, image.naturalWidth, image.width, content.width, rect.width),
        sourceHeight: firstTruthyNumber(result?.height, image.naturalHeight, image.height, content.height, rect.height),
    };
}

function firstTruthyNumber(...values: Array<number | undefined>): number {
    const value = values.find(candidate => Boolean(candidate));
    return value === undefined ? 1 : value;
}

function captureImageElement(image: HTMLImageElement): string | undefined {
    try {
        if (!image.naturalWidth || !image.naturalHeight) return undefined;
        const canvas = document.createElement('canvas');
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / image.naturalWidth);
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.84);
    } catch {
        return undefined;
    }
}

export function readFallbackOcrResult(image: HTMLImageElement, _includeAccessibleText = false): OcrResult | null {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    return parseFallbackOcrLines(image.dataset.ocrLines, width, height);
}

function parseFallbackOcrLines(data: string | undefined, width: number, height: number): OcrResult | null {
    if (!data) return null;
    try {
        return normalizeOcrResult({ width, height, lines: JSON.parse(data) }, width, height);
    } catch {
        return null;
    }
}


function isCandidateImage(image: HTMLImageElement, settings: ReaderSettings): boolean {
    if (isIgnoredOcrImage(image)) return false;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < settings.ocrMinImageArea) return false;
    if (!isNearViewport(image, imagePrefetchMargin(settings))) return false;
    if (isImageOccludedByVideo(image, rect)) return false;
    return isVisibleOcrImage(image);
}

function ocrImageFromPointerEvent(event: Event, settings: ReaderSettings): HTMLImageElement | null {
    if (!ocrRuntimeActive(settings) || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    const image = pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
    return image && isCandidateImage(image, settings) && shouldObserveImage(image, settings) ? image : null;
}

function ocrReaderSurfaceFromPointerEvent(event: Event, settings: ReaderSettings, rasterFreePage: boolean): HTMLCanvasElement | HTMLElement | null {
    if (rasterFreePage || !ocrRuntimeActive(settings) || settings.ocrProvider === 'off' || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    // A tap whose POINT lands on existing OCR text must look it up, not re-scan.
    // Re-scanning releases the frame mid-tap, so the overlay vanishes before the
    // gesture ends — losing the lookup AND letting the tap fall through to the host
    // viewer's page turn. Touch can target the canvas even with the overlay painted
    // on top, so check the point, not just event.target.
    if (pointerEventOverOcrOverlay(event)) return null;
    return pointerEventReaderSurfaceTarget(event, settings) ?? pointerEventReaderSurfaceAtPoint(event, settings);
}

function touchPointFromEvent(event: Event): { clientX: number; clientY: number } | null {
    const touchEvent = event as Partial<TouchEvent>;
    const touch = touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0];
    if (!touch || typeof touch.clientX !== 'number' || typeof touch.clientY !== 'number') return null;
    return { clientX: touch.clientX, clientY: touch.clientY };
}

function eventWithPoint(
    event: Event,
    point: { clientX: number; clientY: number },
): Event & Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerType'> {
    return {
        type: 'pointerdown',
        target: event.target,
        button: 0,
        clientX: point.clientX,
        clientY: point.clientY,
        pointerType: 'touch',
    } as Event & Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerType'>;
}

function pointerEventOverOcrOverlay(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>): boolean {
    const target = event.target as Element | null;
    if (target?.closest?.('[data-jpdb-reader-root]')) return true;
    return Boolean(ocrPointerHitElement(event)?.closest?.('[data-jpdb-reader-root]'));
}

function shouldHandleOcrPointerEvent(event: Event & Pick<PointerEvent, 'button' | 'pointerType'>): boolean {
    if (event.type === 'pointerdown') return event.button === undefined || event.button === 0;
    return (event.type === 'pointerover' || event.type === 'pointermove') && isHoverPointerType(event.pointerType);
}

function isPointerLikeEvent(event: Event): event is Event & Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerType'> {
    const candidate = event as Partial<PointerEvent>;
    return typeof candidate.clientX === 'number' && typeof candidate.clientY === 'number';
}

function isHoverPointerType(pointerType: string): boolean {
    return !pointerType || pointerType === 'mouse' || pointerType === 'pen';
}

function pointerEventImageTarget(event: Event): HTMLImageElement | null {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-jpdb-reader-root]')) return null;
    return target instanceof HTMLImageElement ? target : target.closest('img');
}

function pointerEventImageAtPoint(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>): HTMLImageElement | null {
    const element = ocrPointerHitElement(event);
    if (!element || element.closest('[data-jpdb-reader-root]')) return null;
    return element instanceof HTMLImageElement ? element : element.closest('img');
}

function pointerEventReaderSurfaceTarget(event: Event, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-jpdb-reader-root]')) return null;
    return readerSurfaceFromElement(target, settings);
}

function pointerEventReaderSurfaceAtPoint(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const element = ocrPointerHitElement(event);
    if (element && !element.closest('[data-jpdb-reader-root]')) {
        const surface = readerSurfaceFromElement(element, settings);
        if (surface) return surface;
    }
    return readerSurfaceAtPoint(event.clientX, event.clientY, settings);
}

function readerSurfaceFromElement(element: Element, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const canvas = element instanceof HTMLCanvasElement ? element : element.closest<HTMLCanvasElement>('canvas');
    if (canvas && isManualCanvasReaderSurface(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    if (canvas && collectCanvasReaderSurfaces().includes(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
    const background = collectBackgroundImageReaderSurfaces()
        .find(surface => (surface === element || surface.contains(element)) && isReaderSurfaceCandidate(surface, settings));
    return background ?? null;
}

function readerSurfaceAtPoint(clientX: number, clientY: number, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const surfaces = [
        ...collectCanvasReaderSurfaces(),
        ...collectBackgroundImageReaderSurfaces(),
    ].filter(surface => isReaderSurfaceCandidate(surface, settings));
    return surfaces.find(surface => rectContainsPoint(surface.getBoundingClientRect(), clientX, clientY)) ?? null;
}

function isReaderSurfaceCandidate(surface: Element, settings: ReaderSettings): boolean {
    const rect = surface.getBoundingClientRect();
    return rect.width * rect.height >= settings.ocrMinImageArea
        && isNearViewport(surface, settings.ocrPrefetchMargin)
        && !isHiddenByCss(surface)
        && !isInsideHiddenAncestor(surface);
}

function rectContainsPoint(rect: DOMRect, clientX: number, clientY: number): boolean {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function isIgnoredOcrImage(image: HTMLImageElement): boolean {
    return Boolean(image.closest('[data-jpdb-reader-root]')
        || image.closest('[data-yomu-ocr="ignore"], [data-jpdb-reader-ocr="ignore"]')
        || image.closest('[aria-hidden="true"], [hidden], .slick-cloned')
        || isBookwalkerReaderSourceImage(image)
        || isBrandOrIconOcrImage(image)
        || isYouTubeThumbnailImage(image));
}

function isBookwalkerReaderSourceImage(image: HTMLImageElement): boolean {
    // NFBR's loadingImage is the scrambled page source that the viewer composites
    // into its canvas. OCR must consume Yomu's reconstructed canvas frame instead.
    return isBookwalkerViewerHost() && image.classList.contains('loadingImage');
}

function isYouTubeThumbnailImage(image: HTMLImageElement): boolean {
    return Boolean(image.closest(OCR_IMAGE_THUMBNAIL_CONTAINER_SELECTOR));
}

const OCR_BRAND_IMAGE_TEXT_RE = /(^|[\s/_.?#&=-])(?:app-?icon|apple-touch-icon|avatar|badge|brand|favicon|icon|logo|site-icon|touch-icon|yomu-icon)(?=$|[\s/_.?#&=-])/iu;
const OCR_BRAND_IMAGE_CONTAINER_SELECTOR = [
    'header',
    'nav',
    '[role="banner"]',
    '[role="navigation"]',
    '[class*="brand" i]',
    '[class*="logo" i]',
    '[id*="brand" i]',
    '[id*="logo" i]',
].join(',');

function isBrandOrIconOcrImage(image: HTMLImageElement): boolean {
    if (OCR_BRAND_IMAGE_TEXT_RE.test(imageIdentityText(image))) return true;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > 0 && area <= 12_000 && isIconLikeImage(image, rect)) return true;
    if (image.closest(OCR_BRAND_IMAGE_CONTAINER_SELECTOR)) return area <= 160_000 || isIconLikeImage(image, rect);
    return false;
}

function imageIdentityText(image: HTMLImageElement): string {
    return [
        image.currentSrc,
        image.src,
        image.alt,
        image.title,
        image.id,
        image.className,
        image.getAttribute('aria-label'),
        image.getAttribute('role'),
    ].filter(Boolean).join(' ');
}

function isIconLikeImage(image: HTMLImageElement, rect = image.getBoundingClientRect()): boolean {
    const width = image.naturalWidth || rect.width;
    const height = image.naturalHeight || rect.height;
    if (!width || !height) return false;
    const ratio = width / height;
    return ratio >= 0.72 && ratio <= 1.38 && Math.max(rect.width, rect.height, width, height) <= 256;
}

function isVisibleOcrImage(image: HTMLImageElement): boolean {
    return !isHiddenByCss(image)
        && !isInsideHiddenAncestor(image);
}

function isImageVisibleForOcr(image: HTMLImageElement, rect: DOMRect): boolean {
    return rect.width > 0
        && rect.height > 0
        && rect.bottom >= 0
        && rect.top <= window.innerHeight
        && !isImageOccludedByVideo(image, rect);
}

function isInsideHiddenAncestor(element: Element, includeAriaHidden = true): boolean {
    for (let current: Element | null = element.parentElement; current && current !== document.body; current = current.parentElement) {
        if (isHiddenByCss(current)
            || current.hasAttribute('hidden')
            || (includeAriaHidden && current.getAttribute('aria-hidden') === 'true')) return true;
    }
    return false;
}

function isHiddenByCss(element: Element): boolean {
    const style = getComputedStyle(element);
    return style.visibility === 'hidden'
        || style.display === 'none'
        || Number(style.opacity || '1') <= 0;
}

function canAutoRefreshOcrAfterMutation(settings: ReaderSettings, shouldAutoScan: (() => boolean) | undefined): boolean {
    return settings.ocrAutoScanImages && (shouldAutoScan?.() !== false || hasCanvasOcrOptInSurface());
}

function hasCanvasOcrOptInSurface(): boolean {
    return Boolean(document.querySelector('canvas[data-yomu-canvas-ocr="on"], [data-yomu-canvas-ocr="on"] canvas'));
}

function isCanvasOcrOptInSurface(canvas: HTMLCanvasElement): boolean {
    return canvas.dataset.yomuCanvasOcr === 'on'
        || Boolean(canvas.closest('[data-yomu-canvas-ocr="on"]'));
}

function isImageOccludedByVideo(image: HTMLImageElement, rect = image.getBoundingClientRect()): boolean {
    // Paused-video snapshots intentionally sit on their video.
    if (image.dataset.yomuVideoFrame) return false;
    const imageArea = rect.width * rect.height;
    if (imageArea < 4) return false;
    const imageRoot = image.getRootNode();
    for (const video of document.querySelectorAll('video')) {
        if (!isVisiblePeerVideo(video, image, imageRoot)) continue;
        if (videoOccludesImage(video, rect, imageArea)) return true;
    }
    return false;
}

function isVisiblePeerVideo(video: HTMLVideoElement, image: HTMLImageElement, imageRoot: Node): boolean {
    return video.isConnected
        && video.getRootNode() === imageRoot
        && !isSameMediaNode(video, image)
        && visibleVideoRect(video) !== null
        && !isHiddenByCss(video);
}

function visibleVideoRect(video: HTMLVideoElement): DOMRect | null {
    const rect = video.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 ? rect : null;
}

function videoOccludesImage(video: HTMLVideoElement, imageRect: DOMRect, imageArea: number): boolean {
    const videoRect = visibleVideoRect(video);
    return Boolean(videoRect && intersectionArea(imageRect, videoRect) / imageArea >= 0.6);
}

function isSameMediaNode(video: HTMLVideoElement, image: HTMLImageElement): boolean {
    return video === image.parentElement || image === video.parentElement;
}

function intersectionArea(a: DOMRect, b: DOMRect): number {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function shouldObserveImage(image: HTMLImageElement, settings: ReaderSettings): boolean {
    return settings.ocrProvider !== 'off'
        && (hasInlineOcrFallback(image) || isOcrProviderConfigured(settings));
}

function hasInlineOcrFallback(image: HTMLImageElement): boolean {
    return Boolean(readFallbackOcrResult(image, false));
}

function isNearViewport(element: Element, margin: number): boolean {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin && rect.right >= -margin && rect.left <= window.innerWidth + margin;
}

function ocrConcurrencyLimit(settings: ReaderSettings): number {
    return Math.max(1, Math.min(8, Math.round(settings.ocrConcurrency || 1)));
}

// How far ahead of the viewport a canvas reader prefetches pages: at least the
// configured margin, extended to `ocrPrefetchPages` viewport-heights so the next
// few spreads are snapshotted + OCR'd in the background before you scroll to them.
function canvasPrefetchMargin(settings: ReaderSettings): number {
    const pages = Math.max(0, settings.ocrPrefetchPages || 0);
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    return Math.max(settings.ocrPrefetchMargin, pages * viewportHeight);
}

// Image-based manga readers (mokuro, MangaDex, etc.) lay pages out as a vertical
// run of large <img>. On those pages we widen the OCR prefetch window and raise
// the per-page image budget so the next few pages are recognized in the
// background — the sliding window the canvas readers already get. The check is
// gated (and cheaply cached) so ordinary pages, where auto-OCR should stay near
// the viewport, are unaffected.
let imageReaderPageCache = { at: -Infinity, value: false };
function isLikelyImageReaderPage(settings: ReaderSettings): boolean {
    if (isReaderRasterPage()) return true;
    const now = Date.now();
    if (now - imageReaderPageCache.at < 1000) return imageReaderPageCache.value;
    let large = 0;
    let value = false;
    for (const image of Array.from(document.images)) {
        const rect = image.getBoundingClientRect();
        if (rect.width >= 300 && rect.width * rect.height >= settings.ocrMinImageArea && ++large >= 3) {
            value = true;
            break;
        }
    }
    imageReaderPageCache = { at: now, value };
    return value;
}

function imagePrefetchMargin(settings: ReaderSettings): number {
    return settings.ocrPrefetchPages > 0 && isLikelyImageReaderPage(settings)
        ? canvasPrefetchMargin(settings)
        : settings.ocrPrefetchMargin;
}

function imageReaderMaxImages(settings: ReaderSettings): number {
    return settings.ocrPrefetchPages > 0 && isLikelyImageReaderPage(settings)
        ? Math.max(settings.ocrMaxImagesPerPage, settings.ocrPrefetchPages * 2 + 1)
        : settings.ocrMaxImagesPerPage;
}

function activeReaderRasterSurfaces<T extends Element>(surfaces: T[], settings: ReaderSettings, userRequested: boolean): T[] {
    const margin = readerRasterCaptureMargin(settings, userRequested);
    const active = surfaces
        .filter(surface => isNearViewport(surface, margin))
        .sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a)
            || elementViewportDistance(a) - elementViewportDistance(b));
    if (!userRequested && isBookwalkerViewerHost()) return activeBookwalkerReaderRasterSurfaces(active, settings);
    const limit = readerRasterMaxSurfaces(settings, userRequested);
    return active.slice(0, limit);
}

function readerRasterCaptureMargin(settings: ReaderSettings, userRequested: boolean): number {
    if (userRequested) return settings.ocrPrefetchMargin;
    return Math.min(canvasPrefetchMargin(settings), settings.ocrPrefetchMargin);
}

function readerRasterMaxSurfaces(settings: ReaderSettings, userRequested: boolean): number {
    const configured = Math.max(1, Math.round(settings.ocrMaxImagesPerPage || 1));
    if (userRequested) return configured;
    return Math.min(configured, 3);
}

function imageViewportDistance(image: HTMLImageElement): number {
    return elementViewportDistance(image);
}

function elementViewportDistance(element: Element): number {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return Number.POSITIVE_INFINITY;
    if (rect.bottom < 0) return -rect.bottom;
    if (rect.top > window.innerHeight) return rect.top - window.innerHeight;
    if (rect.right < 0) return -rect.right;
    if (rect.left > window.innerWidth) return rect.left - window.innerWidth;
    return 0;
}

function visibleElementViewportArea(element: Element): number {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return 0;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function readerRasterSurfacesOverlap(first: Element, second: Element): boolean {
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);
    return smallerArea > 0 && intersection / smallerArea >= 0.72;
}

function bookwalkerVisibleCanvasRegion(canvas: HTMLCanvasElement, rect: DOMRect): DOMRect | undefined {
    if (!isBookwalkerViewerHost()) return undefined;
    const clip = elementVisibleViewportClip(canvas);
    if (!clip || !rect.width || !rect.height) return undefined;
    const left = Math.max(clip.left, rect.left);
    const top = Math.max(clip.top, rect.top);
    const right = Math.min(clip.right, rect.right);
    const bottom = Math.min(clip.bottom, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    if (width < READER_RASTER_REGION_MIN_SIZE_PX || height < READER_RASTER_REGION_MIN_SIZE_PX) return undefined;
    const area = width * height;
    const fullArea = rect.width * rect.height;
    if (area >= fullArea * READER_RASTER_REGION_FULL_PAGE_FRACTION) return undefined;
    return new DOMRect(left, top, width, height);
}

function elementVisibleViewportClip(element: Element): DOMRect | undefined {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return undefined;
    let left = 0;
    let top = 0;
    let right = viewportWidth;
    let bottom = viewportHeight;
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const clipsX = cssOverflowClips(style.overflowX) || cssOverflowClips(style.overflow);
        const clipsY = cssOverflowClips(style.overflowY) || cssOverflowClips(style.overflow);
        if (!clipsX && !clipsY) continue;
        const rect = ancestor.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (clipsX) {
            left = Math.max(left, rect.left);
            right = Math.min(right, rect.right);
        }
        if (clipsY) {
            top = Math.max(top, rect.top);
            bottom = Math.min(bottom, rect.bottom);
        }
    }
    const width = right - left;
    const height = bottom - top;
    return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : undefined;
}

function cssOverflowClips(value: string): boolean {
    return value === 'hidden' || value === 'clip' || value === 'auto' || value === 'scroll';
}

function canvasRegionContentKey(surfaceRect: DOMRect, regionRect: DOMRect): string {
    const parts = [
        regionRect.left - surfaceRect.left,
        regionRect.top - surfaceRect.top,
        regionRect.width,
        regionRect.height,
    ].map(value => Math.round(value));
    return `:region:${parts.join(',')}`;
}

function activeBookwalkerReaderRasterSurfaces<T extends Element>(surfaces: T[], settings: ReaderSettings): T[] {
    const visible = surfaces.filter(surface => visibleElementViewportArea(surface) > 1);
    if (visible.length <= 1) return visible;
    const spread = visibleBookwalkerSpreadSurfaces(visible);
    if (spread.length) return spread.slice(0, Math.min(2, readerRasterMaxSurfaces(settings, false)));
    const dominant = dominantBookwalkerSurfaceGroup(visible);
    return dominant.slice(0, 1);
}

function dominantBookwalkerSurfaceGroup<T extends Element>(surfaces: T[]): T[] {
    const groups = new Map<string, T[]>();
    for (const surface of surfaces) {
        const key = bookwalkerSurfaceGroupKey(surface);
        if (!key) continue;
        const group = groups.get(key);
        if (group) group.push(surface);
        else groups.set(key, [surface]);
    }
    let best: T[] | undefined;
    let bestArea = 0;
    for (const group of groups.values()) {
        const area = group.reduce((sum, surface) => sum + visibleElementViewportArea(surface), 0);
        if (area <= bestArea) continue;
        best = group;
        bestArea = area;
    }
    if (best?.length) {
        return best.slice().sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a)
            || elementViewportDistance(a) - elementViewportDistance(b));
    }
    return surfaces.slice(0, 1);
}

function bookwalkerSurfaceGroupKey(surface: Element): string {
    if (surface instanceof HTMLCanvasElement && canvasReaderHasStableSurface(surface)) return canvasReaderSurfaceId(surface);
    const element = surface instanceof HTMLElement ? surface : surface.parentElement;
    return element?.closest<HTMLElement>('.canvasRoot.verticalAxis[id], [id^="wideScreen"][id]')?.id ?? '';
}

function visibleBookwalkerSpreadSurfaces<T extends Element>(surfaces: T[]): T[] {
    if (surfaces.length < 2) return [];
    const spread = surfaces
        .slice()
        .sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a))
        .slice(0, 2);
    const [firstSurface, secondSurface] = spread;
    if (!firstSurface || !secondSurface) return [];
    const firstKey = bookwalkerSurfaceGroupKey(firstSurface);
    const secondKey = bookwalkerSurfaceGroupKey(secondSurface);
    if (firstKey && secondKey && firstKey === secondKey) return [];
    const [first, second] = spread.map(surface => surface.getBoundingClientRect());
    if (!first || !second) return [];
    const smallerHeight = Math.max(1, Math.min(first.height, second.height));
    const verticalOverlap = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    if (verticalOverlap / smallerHeight < 0.55) return [];
    const centerYGap = Math.abs((first.top + first.height / 2) - (second.top + second.height / 2));
    if (centerYGap > Math.max(first.height, second.height) * 0.2) return [];
    return first.right <= second.left || second.right <= first.left ? spread : [];
}

function captureVideoFrameDataUrl(video: HTMLVideoElement): string | undefined {
    try {
        if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return undefined;
        const canvas = document.createElement('canvas');
        const maxWidth = 960;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Throws on DRM/cross-origin tainted frames — treated as "no frame".
        return canvas.toDataURL('image/jpeg', 0.84);
    } catch {
        return undefined;
    }
}

function isTwitterHost(hostname = location.hostname): boolean {
    return hostname === 'twitter.com'
        || hostname === 'x.com'
        || hostname.endsWith('.twitter.com')
        || hostname.endsWith('.x.com');
}

function isLikelyPausedVideoThumbnail(video: HTMLVideoElement): boolean {
    // Twitter/X plays every video inline in the timeline/tweet — there is no
    // distinct "watch" player as on YouTube (clicking a clip just routes to the
    // tweet detail page, keeping the same <article> markup), so a paused-frame
    // OCR card would pop over autoplay timeline clips. Treat all of them as
    // thumbnails; posted photos still flow through the normal image OCR path.
    if (isTwitterHost()) return true;
    // A real feed/preview tile container (incl. the inline hover preview) is
    // unambiguous — checked before the player selector so YouTube's preview,
    // which reuses player markup, is still treated as a thumbnail.
    if (video.closest(VIDEO_FRAME_THUMBNAIL_CONTAINER_SELECTOR)) return true;
    if (video.closest(VIDEO_FRAME_PLAYER_SELECTOR)) return false;
    // Otherwise only generic watch/shorts link wrappers are left — these also
    // wrap the MAIN player on m.youtube.com, so a player-sized video here is the
    // real player, not a hover-preview. Misclassifying it skipped the OCR pause
    // snapshot on mobile entirely (regression v0.6.182).
    if (!video.closest(VIDEO_FRAME_THUMBNAIL_LINK_SELECTOR)) return false;
    return !isPrimaryPlayerSizedVideo(video);
}

function isPrimaryPlayerSizedVideo(video: HTMLVideoElement): boolean {
    const rect = video.getBoundingClientRect();
    if (rect.width < 280 || rect.height < 160) return false;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return rect.width >= 480 && rect.height >= 270;
    // Spans most of the viewport width (mobile full-bleed player) or covers a
    // large share of the viewport area (desktop/theater) → the primary player.
    return rect.width >= viewportWidth * 0.6
        || rect.width * rect.height >= viewportWidth * viewportHeight * 0.25;
}

// UT-77a: pin the snapshot to the video's CONTENT box (contain-fit of the
// intrinsic frame inside the element rect). Sizing to the element rect
// stretched the capture across the letterbox bars, and a correctly-shaped
// box keeps the OCR overlay's fractional line geometry aligned.
function positionVideoFrameImage(frame: HTMLImageElement, rect: DOMRect, video: HTMLVideoElement): void {
    const content = videoContentBox(rect, video);
    setOcrArtifactPosition(frame, content.left, content.top);
    frame.style.width = `${content.width}px`;
    frame.style.height = `${content.height}px`;
}

function positionVideoFrameResumeControl(control: HTMLElement, rect: DOMRect, video: HTMLVideoElement): void {
    const root = videoFrameArtifactRoot(video);
    if (attachVideoFrameResumeControlToSubtitleRail(control, root)) return;
    attachVideoFrameResumeControlFallback(control, root);
    const content = videoContentBox(rect, video);
    setOcrArtifactPosition(control, content.left + content.width - 12, content.top + 12);
}

function positionVideoFrameStatus(status: HTMLElement, rect: DOMRect, video: HTMLVideoElement): void {
    const content = videoContentBox(rect, video);
    const maxWidth = Math.max(96, Math.min(Math.max(96, content.width - 24), 320));
    setOcrArtifactPosition(status, Math.max(8, content.left + 12), Math.max(8, content.top + 12));
    status.style.maxWidth = `${maxWidth}px`;
}

function positionOcrImageStatus(status: HTMLElement, rect: DOMRect): void {
    const maxWidth = Math.max(96, Math.min(Math.max(96, rect.width - 24), 320));
    setOcrArtifactPosition(status, Math.max(8, rect.left + 12), Math.max(8, rect.top + 12));
    status.style.maxWidth = `${maxWidth}px`;
}

// The layer is written to on every animation frame while the page scrolls, so the
// transform is only touched when it actually changes: an identical style write still
// invalidates the compositor's cached layer.
function appendOcrArtifactToRoot(element: HTMLElement, root: HTMLElement): void {
    const oldRoot = element.parentElement;
    const fullscreenHosted = root !== document.body;
    if (fullscreenHosted) prepareOcrFullscreenHost(root);
    element.dataset.yomuOcrFullscreenHosted = fullscreenHosted ? 'true' : 'false';
    if (oldRoot !== root) root.append(element);
    clearOcrFullscreenHostMarker(oldRoot);
}

function removeOcrArtifact(element: HTMLElement): void {
    const oldRoot = element.parentElement;
    element.remove();
    clearOcrFullscreenHostMarker(oldRoot);
}

function clearOcrFullscreenHostMarker(root: Element | null): void {
    if (!(root instanceof HTMLElement) || root === document.body) return;
    if (root.querySelector('[data-yomu-ocr-fullscreen-hosted="true"]')) return;
    delete root.dataset.yomuOcrFullscreenHost;
    if (root.dataset.yomuOcrFullscreenHostPosition === 'relative') {
        root.style.position = '';
        delete root.dataset.yomuOcrFullscreenHostPosition;
    }
}

function prepareOcrFullscreenHost(root: HTMLElement): void {
    root.dataset.yomuOcrFullscreenHost = 'true';
    const position = getComputedStyle(root).position;
    if (position && position !== 'static') return;
    root.style.position = 'relative';
    root.dataset.yomuOcrFullscreenHostPosition = 'relative';
}

function videoFrameArtifactRoot(video: HTMLVideoElement): HTMLElement {
    return activeVideoFullscreenHost(video) ?? document.body;
}

function activeVideoFullscreenHost(video: HTMLVideoElement): HTMLElement | null {
    const active = activeFullscreenElement();
    if (active && (active === document.body || active === document.documentElement)) return document.body;
    if (active instanceof HTMLVideoElement && active === video) return fullscreenVideoArtifactHost(video);
    if (active && active.contains(video)) return active;
    const host = video.closest<HTMLElement>(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR);
    if (host && host.isConnected && host !== video && host.contains(video)) return host;
    return youtubeFullscreenHostForOcrVideo(video);
}

function fullscreenVideoArtifactHost(video: HTMLVideoElement): HTMLElement | null {
    const host = video.closest<HTMLElement>(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR)
        ?? video.closest<HTMLElement>(VIDEO_FRAME_PLAYER_SELECTOR);
    if (host && host !== video && host.isConnected && host.contains(video)) return host;
    return youtubeFullscreenHostForOcrVideo(video);
}

function youtubeFullscreenHostForOcrVideo(video: HTMLVideoElement): HTMLElement | null {
    if (!isYouTubePageForOcr()) return null;
    const scopedHost = [
        video.closest<HTMLElement>('[data-yomu-inline-fullscreen="true"]'),
        video.closest<HTMLElement>('.html5-video-player.ytp-fullscreen'),
        video.closest<HTMLElement>('#movie_player.ytp-fullscreen'),
        video.closest<HTMLElement>('ytd-watch-flexy[fullscreen] #movie_player'),
        video.closest<HTMLElement>('ytd-watch-flexy[fullscreen] ytd-player'),
        video.closest<HTMLElement>('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen'),
    ].find((element): element is HTMLElement => Boolean(element && element !== video));
    if (scopedHost) return scopedHost;

    return [
        document.querySelector<HTMLElement>('[data-yomu-inline-fullscreen="true"]'),
        document.querySelector<HTMLElement>('.html5-video-player.ytp-fullscreen'),
        document.querySelector<HTMLElement>('#movie_player.ytp-fullscreen'),
        document.querySelector<HTMLElement>('ytd-watch-flexy[fullscreen] #movie_player'),
        document.querySelector<HTMLElement>('ytd-watch-flexy[fullscreen] ytd-player'),
        document.querySelector<HTMLElement>('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen'),
    ].find(element => Boolean(element && element !== video && (element.contains(video) || isYouTubeMobileFullscreenHostForOcr(element)))) ?? null;
}

function isYouTubePageForOcr(): boolean {
    return isYouTubeAppHostname();
}

function isYouTubeMobileFullscreenHostForOcr(element: HTMLElement): boolean {
    return /^m\.youtube\.com$/i.test(location.hostname)
        && element.matches('ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen');
}

function activeFullscreenElement(): HTMLElement | null {
    const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
        mozFullScreenElement?: Element | null;
        msFullscreenElement?: Element | null;
    };
    const element = doc.fullscreenElement
        ?? doc.webkitFullscreenElement
        ?? doc.mozFullScreenElement
        ?? doc.msFullscreenElement
        ?? null;
    return element instanceof HTMLElement ? element : null;
}

function videoFrameStatusTextKey(status: OcrVideoFrameStatus): UiCopyKey {
    switch (status) {
        case 'ready':
            return 'ocrPausedFrameReady';
        case 'empty':
            return 'ocrPausedFrameNoText';
        case 'failed':
            return 'ocrPausedFrameFailed';
        case 'loading':
        default:
            return 'ocrPausedFrameScanning';
    }
}

function attachVideoFrameResumeControlToSubtitleRail(control: HTMLElement, root: HTMLElement): boolean {
    const rail = subtitleRailForOcrRoot(root);
    if (!rail?.isConnected) return false;
    const oldParent = control.parentElement;
    const oldRoot = subtitlePlayerRoot(control);
    control.classList.remove('jpdb-ocr-video-frame-resume-fallback');
    control.dataset.yomuOcrFullscreenHosted = 'false';
    control.style.left = '';
    control.style.top = '';
    const panelButton = rail.querySelector<HTMLElement>('.jpdb-subtitle-panel-toggle');
    if (control.parentElement !== rail) rail.insertBefore(control, panelButton ?? null);
    clearOcrFullscreenHostMarker(oldParent);
    updateSubtitleRailResumeState(oldRoot);
    updateSubtitleRailResumeState(subtitlePlayerRoot(control));
    return true;
}

function attachVideoFrameResumeControlFallback(control: HTMLElement, root: HTMLElement): void {
    const oldRoot = subtitlePlayerRoot(control);
    appendOcrArtifactToRoot(control, root);
    control.classList.add('jpdb-ocr-video-frame-resume-fallback');
    updateSubtitleRailResumeState(oldRoot);
}

function removeVideoFrameResumeControl(control: HTMLElement): void {
    const root = subtitlePlayerRoot(control);
    removeOcrArtifact(control);
    updateSubtitleRailResumeState(root);
}

function subtitleRailForOcrRoot(root: HTMLElement): HTMLElement | null {
    const rails = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-subtitle-player[data-jpdb-reader-root="true"] .jpdb-subtitle-rail'));
    if (root === document.body) return rails.find(rail => rail.isConnected) ?? null;
    return rails.find(rail => rail.isConnected && root.contains(rail)) ?? null;
}

function subtitlePlayerRoot(control: HTMLElement): HTMLElement | null {
    return control.closest<HTMLElement>('.jpdb-subtitle-player');
}

function updateSubtitleRailResumeState(root: HTMLElement | null): void {
    if (!root) return;
    root.classList.toggle('jpdb-ocr-video-frame-resume-active', Boolean(root.querySelector('.jpdb-ocr-video-frame-resume')));
}

function playVideoIcon(): string {
    return `<svg class="jpdb-ocr-video-frame-resume-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7-11-7Z"></path></svg>`;
}

function videoContentBox(rect: DOMRect, video: HTMLVideoElement): { left: number; top: number; width: number; height: number } {
    const intrinsicWidth = video.videoWidth;
    const intrinsicHeight = video.videoHeight;
    if (!intrinsicWidth || !intrinsicHeight || !rect.width || !rect.height) return rect;
    const style = getComputedStyle(video);
    const object = fittedObjectSize(videoObjectFit(style.objectFit), intrinsicWidth, intrinsicHeight, rect.width, rect.height);
    const offset = objectPositionOffset(style.objectPosition || '50% 50%', rect.width - object.width, rect.height - object.height);
    return {
        left: rect.left + offset.x,
        top: rect.top + offset.y,
        width: object.width,
        height: object.height,
    };
}

function videoObjectFit(value: string): string {
    switch (value) {
        case 'contain':
        case 'cover':
        case 'none':
        case 'scale-down':
            return value;
        case 'fill':
        default:
            // YouTube commonly sizes the <video> as a player surface while the
            // actual frame is aspect-preserved within it. Preserve the existing
            // contain-fit behavior unless the page explicitly opts into another
            // fit mode.
            return 'contain';
    }
}

function ocrResultTextKey(result: OcrResult | undefined): string {
    return result?.lines.map(line => line.text).join('\n') ?? '';
}

function readerRasterSurfaceSnapshotKey(surface: HTMLCanvasElement | HTMLElement): string {
    return surface instanceof HTMLCanvasElement ? canvasSurfaceSnapshotKey(surface) : backgroundSurfaceCacheKey(surface);
}

function canvasFrameContentKey(contentKey: string, canvas: HTMLCanvasElement): string {
    return isWideBookwalkerSpreadCanvas(canvas) ? `${contentKey}:bw-spread-v2` : contentKey;
}

function bookwalkerCanvasContentKey(
    contentToken: string | undefined,
    regionKey: string,
): string | undefined {
    if (!isBookwalkerViewerHost() || !contentToken) return undefined;
    // Provider coordinates are normalized to the captured frame. A full-page
    // zoom changes bitmap dimensions but not page content; a manual crop remains
    // region-keyed.
    return `bw:${contentToken}${regionKey}`;
}

function canvasFrameOcrAttemptKey(canvas: HTMLCanvasElement, snapshotKey: string, contentToken: string | undefined): string {
    return `canvas:${snapshotKey}|${contentToken || canvasStablePageContentToken(canvas)}`;
}

function isWideBookwalkerSpreadCanvas(canvas: HTMLCanvasElement): boolean {
    return isBookwalkerViewerHost()
        && !isBookwalkerContinuousScrollCanvas(canvas)
        && canvas.width / Math.max(1, canvas.height) >= BOOKWALKER_SPREAD_MIN_ASPECT;
}

function backgroundSurfaceCacheKey(surface: HTMLElement): string {
    const rect = surface.getBoundingClientRect();
    return [
        surface.getAttribute('data-page-index') ?? '',
        backgroundImageReaderUrl(surface) ?? '',
        Math.round(rect.width),
        Math.round(rect.height),
    ].join('|');
}

// Fetch a page's scrambled source image as an origin-clean bitmap (GM_xmlhttpRequest
// bypasses the CDN's missing CORS), so the canvas mirror can redraw the engine's
// descramble tiles without tainting. Returns undefined for unfetchable URLs.
const cleanMirrorImageCache = new Map<string, Promise<HTMLImageElement | undefined> | HTMLImageElement>();

async function loadCleanMirrorImage(url: string): Promise<HTMLImageElement | undefined> {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return undefined;
    // Authorization query parameters rotate while the page image does not. Preserve
    // content-bearing parameters but share the decoded bitmap across renewed tokens.
    const cacheKey = canonicalBookwalkerAssetUrl(url);
    const cached = cleanMirrorImageCache.get(cacheKey);
    if (cached) return cached;
    const pending = fetchCleanMirrorImage(url)
        .then(image => {
            if (!image) {
                cleanMirrorImageCache.delete(cacheKey);
                return undefined;
            }
            cleanMirrorImageCache.set(cacheKey, image);
            trimCleanMirrorImageCache();
            return image;
        })
        .catch(error => {
            cleanMirrorImageCache.delete(cacheKey);
            throw error;
        });
    cleanMirrorImageCache.set(cacheKey, pending);
    return pending;
}

async function fetchCleanMirrorImage(url: string): Promise<HTMLImageElement | undefined> {
    const resource = mirrorImageResourceLabel(url);
    let blob: Blob;
    try {
        const resolvedUrl = await bookwalkerAssetResolver.resolve(url);
        try {
            blob = await requestBlob(resolvedUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
        } catch (error) {
            if (!isBookwalkerAuthorizationFailure(error)) throw error;
            const refreshedUrl = await bookwalkerAssetResolver.refresh(url);
            if (!refreshedUrl || refreshedUrl === resolvedUrl) throw error;
            blob = await requestBlob(refreshedUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
        }
    } catch (error) {
        log.warnOnce(`mirror-image-fetch:${resource}`, 'BookWalker mirror image fetch failed', { resource }, error);
        throw error;
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
        return await loadImage(objectUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
    } catch (error) {
        log.warnOnce(
            `mirror-image-decode:${resource}`,
            'BookWalker mirror image decode failed',
            { bytes: blob.size, resource, type: blob.type },
            error,
        );
        throw error;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function isBookwalkerAuthorizationFailure(error: unknown): boolean {
    return error instanceof Error && /Image fetch returned (401|403)\./.test(error.message);
}

function mirrorImageResourceLabel(url: string): string {
    try {
        const parsed = new URL(url, location.href);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url.split(/[?#]/, 1)[0] ?? '';
    }
}

function trimCleanMirrorImageCache(): void {
    while (cleanMirrorImageCache.size > MAX_CLEAN_MIRROR_IMAGE_CACHE_ITEMS) {
        const oldest = cleanMirrorImageCache.keys().next().value;
        if (!oldest) return;
        cleanMirrorImageCache.delete(oldest);
    }
}

function imageSummary(image: HTMLImageElement): Record<string, unknown> {
    return {
        host: safeHost(image.currentSrc || image.src),
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        altLength: image.alt?.length ?? 0,
        frame: image.dataset.yomuCanvasFrame === 'true'
            ? 'canvas'
            : image.dataset.yomuBackgroundFrame === 'true' ? 'background' : 'inline',
        className: image.className,
        parentId: image.parentElement?.id || '',
    };
}

function inlineProviderLabel(settings: ReaderSettings): string {
    return configuredOcrProviderLabel(settings) ?? settings.ocrProvider;
}

function configuredOcrProviderLabel(settings: ReaderSettings): string | null {
    return OCR_PROVIDER_LABELS[settings.ocrProvider]?.(settings) ?? null;
}

function localServiceProviderLabel(settings: ReaderSettings): string | null {
    return `local-service:${ocrEngineLabel(settings)}`;
}

function ocrEngineLabel(settings: ReaderSettings): string {
    return settings.ocrEngine || 'auto';
}

function isLocalOcrConnectionError(error: unknown): boolean {
    if (isLocalOcrUnavailableError(error)) return true;
    if (!(error instanceof Error)) return true;
    return error.name === 'TypeError'
        || error.name === 'AbortError'
        || /network|failed to fetch|load failed|cors|blocked|timed out|timeout|request failed/i.test(error.message);
}

function isLocalOcrUnavailableError(error: unknown): error is LocalOcrUnavailableError {
    return error instanceof LocalOcrUnavailableError;
}


function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return 'inline-or-invalid';
    }
}
