import { escapeHtml, renderRuby, renderTokensToHtml, setInnerHtml, shouldRenderRuby } from '../dom/index';
import { normalizeOcrRenderedText } from './rendered-text';
import { loadPersistedOcrCache, persistOcrCacheSoon } from './ocr-cache-store';
import {
    backgroundImageReaderUrl,
    canUseReaderCanvasSourceImageFallback,
    canvasPageContentToken,
    canvasRenderedContentSignature,
    canvasReaderPageCounter,
    canvasReaderPageSignature,
    captureCanvasDataUrl,
    collectBackgroundImageReaderSurfaces,
    collectCanvasReaderSurfaces,
    isBookwalkerViewerHost,
    isCanvasReadable,
    isReaderRasterPage,
    positionCanvasFrameImage,
    readerCanvasSourceImageUrl,
} from './canvas-readers';
import { captureReaderSurfaceViaExtensionScreenshot } from './extension-screenshot';
import { captureCanvasMirror } from './canvas-mirror';
import { uiText, type UiCopyKey } from '../app/i18n';
import { waitForIdle } from '../platform/idle';
import { readBlobAsDataUrl } from '../core/blob-data-url';
import { Logger } from '../app/logger';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { pitchPatternFromPosition } from '../lookup/pitch-accent';
import {
    cleanOcrLookupLines,
    normalizeOcrResult,
    ocrLinesChanged,
    parseGoogleLensResponse,
    parseGoogleLensUploadHtml,
    type OcrLine,
    type OcrRect,
    type OcrResult,
} from './response';
import { accentToRgba } from '../settings/index';
import { fallbackJapaneseSegments } from '../lookup/parser';
import type { ReaderParserParseOptions } from '../lookup/parser';
import { stablePositiveHashId } from '../core/stable-hash';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { getUserscriptHttpRequest } from '../userscript/index';

type OcrRecognizer = (image: HTMLImageElement, settings: ReaderSettings, invert?: boolean) => Promise<OcrResult | null>;
type OcrVideoFrameStatus = 'loading' | 'ready' | 'empty' | 'failed';

interface ImageState {
    image: HTMLImageElement;
    overlay: HTMLElement;
    key: string;
    result?: OcrResult;
    loading: boolean;
    overlayRequested: boolean;
    manualRequested: boolean;
    autoSkipped: boolean;
}

interface OcrRenderedImageFrame {
    imageLeft: number;
    imageTop: number;
    imageWidth: number;
    imageHeight: number;
    safeBottomInset?: number;
}

interface OcrRenderableMediaMutationSummary {
    touched: boolean;
    addedImage: boolean;
}

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string, options?: ReaderParserParseOptions) => Promise<JPDBToken[]>;
    parseJapaneseBatch?: (texts: string[], options?: ReaderParserParseOptions) => Promise<JPDBToken[][]>;
    onToast: (message: string) => void;
    shouldAutoScan?: () => boolean;
    enrichTokensBeforeRender?: (tokens: JPDBToken[]) => void | Promise<void>;
    enrichRenderedTokens?: (tokens: JPDBToken[], root: ParentNode) => void | Promise<void>;
    fallbackCardFromText?: (text: string) => JPDBCard;
    /** Test seam: overrides the canvas capture of a paused video frame. */
    captureVideoFrame?: (video: HTMLVideoElement) => string | undefined;
    /** Test seam: overrides trusted screenshot capture for tainted reader canvases. */
    captureReaderSurface?: typeof captureReaderSurfaceViaExtensionScreenshot;
    /** Test seam: overrides clean-source replay for tainted BookWalker canvases. */
    captureCanvasMirror?: typeof captureCanvasMirror;
}

interface OcrWordRenderState {
    surface: string;
    token: JPDBToken;
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
// cap the 1200ms poll keeps retrying at its own cadence, and a tap force-rescans.
const READER_RASTER_RETRY_BASE_MS = 140;
const READER_RASTER_RETRY_MAX_MS = 1100;
const READER_RASTER_MAX_CAPTURE_ATTEMPTS = 8;
const READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS = 3;
const READER_RASTER_EMPTY_RETRY_MS = 650;
const READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT = 40;
const READER_RASTER_BOTTOM_CHROME_RESERVE_PX = 56;
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
const DEFAULT_LOCAL_OCR_ENDPOINT_URL = 'http://127.0.0.1:7331/ocr';
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
const log = Logger.scope('OCR');
const STALE_OCR_STATE = Symbol('stale-ocr-state');
const OCR_WORD_UNDERLINE_OFFSET_EM = 0.12;
const OCR_WORD_UNDERLINE_THICKNESS_EM = 0.12;
const OCR_WORD_UNDERLINE_CLEARANCE_PX = 1;
const ocrVocabularyCache = new WeakMap<HTMLImageElement, Map<string, JPDBCard> | null>();
let ocrLayerCounter = 0;
const OCR_RECOGNIZERS: Partial<Record<ReaderSettings['ocrProvider'], OcrRecognizer>> = {
    'google-lens': recognizeViaGoogleLens,
    'cloud-vision': recognizeViaCloudVision,
    'local-service': recognizeViaLocalService,
};
const OCR_PROVIDER_CONFIGURED: Partial<Record<ReaderSettings['ocrProvider'], (settings: ReaderSettings) => boolean>> = {
    'google-lens': () => true,
    'cloud-vision': settings => Boolean(settings.ocrCloudVisionApiKey.trim()),
    'local-service': () => true,
};
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

function isOcrImageStateIdle(state: ImageState): boolean {
    return !state.result && !state.loading && !state.autoSkipped;
}

interface OcrScanContext {
    provider: string;
    done: () => void;
}

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
    state.loading = true;
    const provider = inlineProviderLabel(settings);
    return {
        provider,
        done: log.time('scanImage', { provider, image: imageSummary(image), manualRequested }),
    };
}

function finishOcrScan(state: ImageState): void {
    state.loading = false;
    state.manualRequested = false;
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
    // OCR runs as a small concurrency pool rather than one-at-a-time: manga
    // readers surface many page images/canvases at once and the serial wait was
    // the dominant source of "slow OCR". `activeScans` counts in-flight requests
    // (capped by settings.ocrConcurrency) and `inFlightKeys` deduplicates work
    // when several queued elements share the same image content (e.g. a canvas
    // frame re-snapshotted on a page poll).
    private activeScans = 0;
    private readonly inFlightKeys = new Set<string>();
    private positionFrame = 0;
    private refreshTimer = 0;
    private destroyed = false;
    private lastPointerMoveImage?: HTMLImageElement;
    private lastPointerMoveReaderSurface?: Element;
    private lastPointerMoveReaderSurfaceKey?: string;
    private videoFrames = new Map<HTMLVideoElement, HTMLImageElement>();
    private videoFrameVideos = new Map<HTMLImageElement, HTMLVideoElement>();
    private videoFrameControls = new Map<HTMLVideoElement, HTMLElement>();
    private videoFrameStatuses = new Map<HTMLVideoElement, HTMLElement>();
    // Compact loading/ready indicators for every OCR'd image (not just
    // paused-video frames), so slow image OCR shows progress without a card.
    private imageStatuses = new Map<HTMLImageElement, HTMLElement>();
    private imageStatusTimers = new Map<HTMLImageElement, number>();
    // Reader raster snapshots (BookWalker/ComicWalker canvases and Mokuro CSS
    // background pages): map each page surface to the invisible <img> we OCR in
    // its place, plus the page fingerprint and the page-turn poll.
    private canvasFrames = new Map<HTMLCanvasElement, HTMLImageElement>();
    private canvasFrameSources = new Map<HTMLImageElement, HTMLCanvasElement>();
    private canvasFrameStaticRects = new Map<HTMLImageElement, DOMRect>();
    private canvasFrameKeys = new Map<HTMLCanvasElement, string>();
    // Canvases whose frame the user explicitly tapped to create. A native-text-layer
    // page (shouldAutoScan=false) strips AUTO frames on the poll, but a frame the user
    // tapped to make must survive that poll — only a real page turn drops it.
    private readonly canvasFrameUserRequested = new Set<HTMLCanvasElement>();
    private backgroundFrames = new Map<HTMLElement, HTMLImageElement>();
    private backgroundFrameSources = new Map<HTMLImageElement, HTMLElement>();
    private backgroundFrameKeys = new Map<HTMLElement, string>();
    private canvasReaderSignature?: string;
    private canvasReaderSamePageSignatureSkips = 0;
    private readerRasterPoll = 0;
    private readerRasterRetryTimer = 0;
    private readonly pendingCanvasSnapshots = new WeakMap<HTMLCanvasElement, string>();
    // Map (not WeakMap) so a page turn can clear ALL readiness at once. Keyed by
    // stable surface location instead of the canvas object: NFBR sometimes swaps an
    // equivalent #viewport canvas node while painting the same page, and object-keyed
    // readiness would then wait forever for "the same" sample to appear twice.
    private readonly canvasContentReadiness = new Map<string, string>();
    // Per-canvas failed-capture counter driving the backoff retry above.
    private readonly canvasCaptureAttempts = new Map<HTMLCanvasElement, number>();
    private readonly readerRasterEmptyScans = new Map<string, number>();
    // Canvas -> remaining tap-driven recapture attempts. In tap/manual mode the poll
    // never captures, so a tap whose capture wasn't ready (the tainted-canvas mirror
    // rebuild momentarily failed: the origin-clean page image was still loading, or
    // the engine repainted the page a beat late) must keep retrying AS a tap. This
    // window deliberately SURVIVES page-signature changes (a late NFBR repaint, or the
    // poll first registering the freshly-composited page, looks like a "turn") so the
    // tap isn't silently dropped — the reported "a page just has no OCR, no Scanning…/
    // Text ready pill" bug. Bounded so it can never become permanent auto-OCR in tap
    // mode; cleared on success, frame release, disconnect, or teardown.
    private readonly canvasTapRecapture = new Map<HTMLCanvasElement, number>();
    private readonly ocrWordRenderStates = new WeakMap<HTMLElement, OcrWordRenderState>();
    private readonly pointerActivatedOcrLines = new WeakMap<HTMLElement, number>();
    private recentTouchOcrPoint?: { clientX: number; clientY: number; at: number };
    private readonly handleMediaPause = (event: Event) => this.snapshotPausedVideo(event.target);
    private readonly handleMediaResume = (event: Event) => this.releaseVideoFrame(event.target);
    // Stepping subtitle lines while paused seeks the video — the snapshot
    // must follow the new frame instead of showing the stale one.
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
    private readonly handleWindowResize = () => this.handleOcrViewportShift(300);
    private readonly handleSpaNavigation = () => this.teardownForNavigation();

    constructor(private readonly options: OcrControllerOptions) {
        // Re-use OCR results from a previous visit so refreshing a manga/reading
        // page re-renders recognized text instantly instead of re-OCR'ing it.
        for (const [key, result] of loadPersistedOcrCache()) this.cache.set(key, result);
    }

    init(): void {
        this.destroyed = false;
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
        // UT-27: paused video frames are OCR'd like images and cleared the
        // moment playback resumes. Media events do not bubble, so listen in
        // the capture phase.
        document.addEventListener('pause', this.handleMediaPause, true);
        document.addEventListener('play', this.handleMediaResume, true);
        document.addEventListener('emptied', this.handleMediaResume, true);
        document.addEventListener('seeked', this.handleMediaSeeked, true);
        document.addEventListener('scroll', this.handleDocumentScroll, { capture: true, passive: true });
        window.addEventListener('scroll', this.handleWindowScroll, { passive: true });
        window.addEventListener('resize', this.handleWindowResize, { passive: true });
        // Rotate / fullscreen / pinch-zoom move the paused-frame overlay's
        // reference box without always firing a plain window 'resize'; mirror the
        // subtitle controller's listener set so the frame snaps with it.
        window.addEventListener('orientationchange', this.handleWindowResize, { passive: true });
        for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
            document.addEventListener(eventName, this.handleWindowResize, true);
        }
        window.visualViewport?.addEventListener('resize', this.handleDocumentScroll, { passive: true });
        window.visualViewport?.addEventListener('scroll', this.handleDocumentScroll, { passive: true });
        // UT-77c: YouTube reuses its shared player <video> across SPA route
        // changes, so a hover-preview's paused-frame OCR overlay, its rail
        // resume control, and image overlays survive the navigation and pile
        // onto the watch page (overlay stuck over the player, a duplicate play
        // button in the subtitle rail). isConnected-based pruning never fires
        // because the element is still attached. Tear everything down on
        // navigation so the destination page re-scans from a clean slate.
        for (const eventName of OCR_NAVIGATION_EVENTS) {
            window.addEventListener(eventName, this.handleSpaNavigation);
        }
        this.mutationObserver = new MutationObserver(mutations => this.handleRenderableMediaMutations(mutations));
        this.mutationObserver.observe(body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'src', 'srcset', 'sizes', 'loading', 'poster', 'data-yomu-canvas-ocr'],
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
        window.visualViewport?.removeEventListener('resize', this.handleDocumentScroll);
        window.visualViewport?.removeEventListener('scroll', this.handleDocumentScroll);
        for (const eventName of OCR_NAVIGATION_EVENTS) {
            window.removeEventListener(eventName, this.handleSpaNavigation);
        }
        this.releaseAllVideoFrames();
        this.releaseAllCanvasFrames();
        this.canvasTapRecapture.clear();
        this.releaseAllBackgroundFrames();
        if (this.readerRasterPoll) { window.clearInterval(this.readerRasterPoll); this.readerRasterPoll = 0; }
        if (this.readerRasterRetryTimer) { window.clearTimeout(this.readerRasterRetryTimer); this.readerRasterRetryTimer = 0; }
        this.mutationObserver?.disconnect();
        if (this.positionFrame) cancelAnimationFrame(this.positionFrame);
        this.clear();
    }

    refresh(options: { userRequested?: boolean } = {}): void {
        if (this.destroyed) return;
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled) {
            this.releaseAllVideoFrames();
            this.clear();
            return;
        }
        // Reader raster pages have no <img> to find, so drive their
        // snapshots independently of the document.images skip logic below.
        this.refreshCanvasReaderSurfaces(settings, options.userRequested);
        this.refreshBackgroundImageReaderSurfaces(settings, options.userRequested);
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
        if (!settings.ocrEnabled) return;
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
        if (!settings.ocrEnabled) {
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
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled) return;
        const summary = summarizeRenderableMediaMutations(mutations);
        if (!summary.touched) return;
        this.schedulePosition();
        if (!canAutoRefreshOcrAfterMutation(settings, this.options.shouldAutoScan)) return;
        this.scheduleRefresh(summary.addedImage ? 0 : 40);
    }

    private handleOcrViewportShift(refreshDelay: number): void {
        if (!this.options.getSettings().ocrEnabled) return;
        this.schedulePosition();
        this.scheduleRefresh(refreshDelay);
    }

    private hasVisibleInlineOcrFallback(settings: ReaderSettings): boolean {
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

    async scanVisible(): Promise<void> {
        this.refresh({ userRequested: true });
        const settings = this.options.getSettings();
        const images = [...this.states.keys()].filter(image => isCandidateImage(image, settings) && isNearViewport(image, 120));
        if (!images.length) {
            this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, 'ocrNoReadableImages'));
            return;
        }
        images.forEach(image => this.enqueue(image, true));
        log.info('Manual OCR scan queued images', { images: images.length });
    }

    captureSourceImageForElement(element: Element | null): string | undefined {
        const line = element?.closest?.('.jpdb-ocr-line');
        if (!line) return undefined;
        const state = [...this.states.values()].find(candidate => candidate.overlay.contains(line));
        if (!state) return undefined;
        const image = captureImageElement(state.image);
        return image;
    }

    pinLineForElement(element: Element | null): void {
        const line = element?.closest?.<HTMLElement>('.jpdb-ocr-line');
        if (!line) return;
        const state = [...this.states.values()].find(candidate => candidate.overlay.contains(line));
        if (state) this.pinLine(state, line);
    }

    clearActiveLines(): void {
        this.unpinAllLines();
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

        const state = { image, overlay, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
        image.addEventListener('load', () => {
            this.resetStateIfImageChanged(state);
            this.schedulePosition();
            this.scheduleRefresh(0);
        });
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
        if (userRequested) void this.renderResult(state, state.result, true, state.key);
        return true;
    }

    private requestOcrFromPointerEvent(event: Event): boolean {
        if (this.isDuplicateTouchPointerOcrEvent(event)) return false;
        const settings = this.options.getSettings();
        const image = ocrImageFromPointerEvent(event, settings);
        if (image) {
            if (event.type === 'pointermove' && image === this.lastPointerMoveImage) return false;
            if (event.type === 'pointermove') this.lastPointerMoveImage = image;
            else this.lastPointerMoveImage = undefined;
            this.lastPointerMoveReaderSurface = undefined;
            this.lastPointerMoveReaderSurfaceKey = undefined;
            this.enqueue(image, true);
            return true;
        }
        const surface = ocrReaderSurfaceFromPointerEvent(event, settings);
        if (!surface) return false;
        const surfaceKey = readerRasterSurfaceSnapshotKey(surface);
        if (event.type === 'pointermove' && surface === this.lastPointerMoveReaderSurface && surfaceKey === this.lastPointerMoveReaderSurfaceKey) return false;
        if (event.type === 'pointermove') {
            this.lastPointerMoveReaderSurface = surface;
            this.lastPointerMoveReaderSurfaceKey = surfaceKey;
        } else {
            this.lastPointerMoveReaderSurface = undefined;
            this.lastPointerMoveReaderSurfaceKey = undefined;
        }
        void this.snapshotReaderSurface(surface, settings).then(frame => {
            if (frame) this.enqueue(frame, true);
        });
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

    private async snapshotReaderSurface(surface: HTMLCanvasElement | HTMLElement, settings: ReaderSettings): Promise<HTMLImageElement | undefined> {
        if (surface instanceof HTMLCanvasElement) {
            await this.snapshotCanvasSurface(surface, settings, true);
            return this.canvasFrames.get(surface);
        }
        this.snapshotBackgroundImageSurface(surface, settings, true);
        return this.backgroundFrames.get(surface);
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

    // Pull the next queued image whose content is not already being scanned, so
    // duplicate enqueues / re-snapshotted canvas frames don't fire redundant OCR
    // calls (the cache fills them in once the in-flight scan resolves).
    private takeNextQueuedImage(): HTMLImageElement | undefined {
        for (let index = 0; index < this.queue.length; index++) {
            const candidate = this.queue[index];
            if (this.inFlightKeys.has(imageCacheKey(candidate))) continue;
            this.queue.splice(index, 1);
            return candidate;
        }
        return undefined;
    }

    private startScan(image: HTMLImageElement): void {
        if (this.destroyed) return;
        const key = imageCacheKey(image);
        this.activeScans++;
        this.inFlightKeys.add(key);
        const hasFastText = Boolean(readFallbackOcrResult(image, false));
        // Canvas / background reader frames are dedicated manga pages where OCR is
        // the entire point, so skip the 900ms batching idle that only earns its
        // keep on incidental page images — the page is already on screen and waiting.
        const isReaderRasterFrame = this.isReaderRasterFrame(image);
        const delay = this.cache.has(key) || this.states.get(image)?.overlayRequested || hasFastText || isReaderRasterFrame || this.videoFrameVideos.has(image) ? 0 : 900;
        void waitForIdle(delay, delay)
            .then(() => this.scanImage(image))
            .finally(() => {
                this.activeScans = Math.max(0, this.activeScans - 1);
                this.inFlightKeys.delete(key);
                if (!this.destroyed) this.drainQueue();
            });
    }

    private async scanImage(image: HTMLImageElement): Promise<void> {
        if (this.destroyed) return;
        const existingState = this.states.get(image);
        if (!image.isConnected) {
            if (existingState) this.releaseImageState(image, existingState);
            return;
        }
        const state = existingState ?? this.ensureState(image);
        const settings = this.options.getSettings();
        const key = imageCacheKey(image);
        const manualRequested = state.manualRequested;
        this.resetStateIfImageChanged(state);
        if (await this.tryRenderCachedOcrResult(state, key)) return;
        if (!this.isCurrentContentState(state, key)) return;

        this.updateOcrStatus(image, 'loading');
        const scan = beginOcrScan(state, image, settings, manualRequested);

        try {
            await this.scanUncachedImage(state, image, key, settings, scan.provider, manualRequested);
        } catch (error) {
            if (isStaleOcrState(error)) return;
            try {
                await this.renderOcrFailure(state, image, key, scan.provider, manualRequested, error);
            } catch (renderError) {
                if (isStaleOcrState(renderError)) return;
                throw renderError;
            }
        } finally {
            finishOcrScan(state);
            scan.done();
        }
    }

    private async renderCachedOcrResult(state: ImageState, key: string): Promise<boolean> {
        if (!this.cache.has(key)) return false;
        if (this.shouldSuppressAutoRenderedResult(state, false)) {
            this.clearAutoScannedOverlays();
            return true;
        }
        const cached = this.cache.get(key);
        this.requireCurrentContentState(state, key);
        if (!cached) {
            if (this.isReaderRasterFrame(state.image)) {
                this.forget(key);
                this.readerRasterEmptyScans.delete(key);
                return false;
            }
            if (this.shouldPreserveReaderRasterResult(state)) return true;
            renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'empty');
            state.manualRequested = false;
            return true;
        }
        await this.renderResult(state, cached, false, key);
        state.manualRequested = false;
        return true;
    }

    private async tryRenderCachedOcrResult(state: ImageState, key: string): Promise<boolean> {
        try {
            return await this.renderCachedOcrResult(state, key);
        } catch (error) {
            if (isStaleOcrState(error)) return true;
            throw error;
        }
    }

    private async scanUncachedImage(
        state: ImageState,
        image: HTMLImageElement,
        key: string,
        settings: ReaderSettings,
        provider: string,
        manualRequested: boolean,
    ): Promise<void> {
        const inlineFallback = readFallbackOcrResult(image, false);
        const providerResult = inlineFallback ? null : await this.recognizeImage(image, settings);
        this.requireCurrentState(state);
        const result = inlineFallback ?? providerResult;
        if (!result?.lines.length) {
            if (this.shouldPreserveReaderRasterResult(state)) {
                this.updateOcrStatus(image, 'ready');
                return;
            }
            if (this.isReaderRasterFrame(image)) this.forget(key);
            else this.remember(key, null);
            this.requireCurrentContentState(state, key);
            renderNoOcrLines(state);
            this.updateOcrStatus(image, 'empty');
            this.scheduleReaderRasterEmptyRetry(state, key, manualRequested);
            return;
        }

        this.remember(key, result);
        this.readerRasterEmptyScans.delete(key);
        this.requireCurrentContentState(state, key);
        state.key = key;
        // The page may have started providing its own native text layer while
        // this auto scan was in flight (e.g. mokuro OCR toggled on). Keep the
        // cached result but don't paint — the reader now defers to that layer.
        // Manual scans and page-baked inline fallbacks always render regardless.
        if (this.shouldSuppressAutoRenderedResult(state, Boolean(inlineFallback), manualRequested)) {
            this.clearAutoScannedOverlays();
            return;
        }
        await this.renderResult(state, result, false, key);
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
        key: string,
        provider: string,
        manualRequested: boolean,
        error: unknown,
    ): Promise<void> {
        this.requireCurrentContentState(state, key);
        const fallback = readFallbackOcrResult(image, false);
        if (fallback?.lines.length) {
            log.warn('OCR provider failed', { provider }, error);
            await this.renderResult(state, fallback, false, key);
            return;
        }
        logOcrFailure(state, provider, manualRequested, error);
        this.updateOcrStatus(image, 'failed');
    }

    private recognizeImage(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
        const recognizer = ocrRecognizer(settings);
        if (!recognizer) return Promise.resolve(null);
        return this.recognizeWithDarkPass(image, settings, recognizer);
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

    private async renderResult(state: ImageState, result: OcrResult, forceOverlay = false, expectedKey = state.key): Promise<void> {
        this.requireCurrentContentState(state, expectedKey);
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
        this.requireCurrentContentState(state, expectedKey);
        const lines = cleanOcrLookupLines(result.lines, initialParsed);
        if (!lines.length) {
            if (this.shouldPreserveReaderRasterResult(state)) {
                this.updateOcrStatus(state.image, 'ready');
                return;
            }
            renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'empty');
            return;
        }
        const parsed = ocrLinesChanged(result.lines, lines)
            ? await this.parseOcrLines(lines)
            : initialParsed;
        this.requireCurrentContentState(state, expectedKey);
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
        this.requireCurrentContentState(state, expectedKey);
        applyOcrOverlayStyle(state.overlay, settings);

        const lineElements = lines.map((line, index) => (
            this.renderOcrLineElement(state, result, line, renderedTokens[index] ?? [], sentence, showText, settings)
        ));
        const staleLines = Array.from(state.overlay.querySelectorAll('.jpdb-ocr-line'));
        state.overlay.append(...lineElements);
        staleLines.forEach(node => node.remove());
        this.revealVideoFrameOverlay(state.image);
        this.positionState(state.image);
        if (this.canvasFrameSources.has(state.image)) {
            this.canvasReaderSignature = canvasReaderPageSignature();
            this.canvasReaderSamePageSignatureSkips = 0;
        }
        this.updateOcrStatus(state.image, 'ready');
        void Promise.resolve(this.options.enrichRenderedTokens?.(flatTokens, state.overlay)).finally(() => this.schedulePosition());
    }

    private shouldShowOcrTextOverlay(state: ImageState, settings: ReaderSettings, forceOverlay: boolean): boolean {
        if (this.isScannedPdfCanvasFrame(state.image)) return false;
        return settings.ocrShowTextOverlay || forceOverlay;
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
        element.addEventListener('pointerenter', () => this.activateOcrMarkup(element));
        element.addEventListener('focusin', () => this.activateOcrMarkup(element));
        element.addEventListener('pointerdown', event => this.activateOcrLineFromPointer(state, element, event), true);
        element.addEventListener('click', event => this.toggleOcrLinePinned(state, element, event));
        return element;
    }

    private activateOcrLineFromPointer(state: ImageState, element: HTMLElement, event: PointerEvent): void {
        if (event.button !== 0) return;
        if (element.dataset.pinned === 'true') {
            this.activateOcrMarkup(element);
            return;
        }
        element.focus({ preventScroll: true });
        this.pinLine(state, element);
        this.pointerActivatedOcrLines.set(element, Date.now());
    }

    private toggleOcrLinePinned(state: ImageState, element: HTMLElement, event: MouseEvent): void {
        if (this.wasRecentlyPointerActivated(element)) {
            // The pointerdown handler already made tapped OCR text active before
            // popup lookup handlers run. Keep the following click from toggling
            // the line off again.
            this.activateOcrMarkup(element);
        } else if (element.dataset.pinned === 'true') {
            this.unpinLine(element);
        } else {
            element.focus({ preventScroll: true });
            this.pinLine(state, element);
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
        state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line-active').forEach(line => {
            if (line !== element) this.unpinLine(line);
        });
        this.activateOcrMarkup(element);
        element.classList.add('jpdb-ocr-line-active');
        element.dataset.pinned = 'true';
        this.schedulePosition();
    }

    private unpinLine(element: HTMLElement): void {
        element.classList.remove('jpdb-ocr-line-active');
        element.dataset.pinned = 'false';
        this.schedulePosition();
    }

    private unpinOcrLinesFromDocumentEvent(event: Event): void {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.jpdb-ocr-line, .jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-onboarding, .jpdb-reader-fab')) return;
        this.unpinAllLines();
    }

    private unpinAllLines(): void {
        for (const state of this.states.values()) {
            state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line-active').forEach(line => this.unpinLine(line));
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
        if (key === state.key) return;
        const preserveReaderRasterResult = this.shouldPreserveReaderRasterResult(state);
        state.key = key;
        if (!preserveReaderRasterResult) state.result = undefined;
        state.loading = false;
        state.overlayRequested = false;
        state.manualRequested = false;
        state.autoSkipped = false;
        if (!preserveReaderRasterResult) {
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

    private scheduleReaderRasterEmptyRetry(state: ImageState, key: string, userRequested: boolean): void {
        if (!this.isReaderRasterFrame(state.image)) return;
        const attempts = (this.readerRasterEmptyScans.get(key) ?? 0) + 1;
        this.readerRasterEmptyScans.set(key, attempts);
        if (!userRequested && attempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) return;
        window.setTimeout(() => {
            if (!this.isCurrentContentState(state, key)) return;
            const canvas = this.canvasFrameSources.get(state.image);
            if (canvas) {
                this.releaseCanvasFrame(canvas);
                this.scheduleCanvasCaptureRetry(canvas, userRequested);
                return;
            }
            const background = this.backgroundFrameSources.get(state.image);
            if (background) {
                this.releaseBackgroundFrame(background);
                this.scheduleReaderRasterRefresh(READER_RASTER_RETRY_BASE_MS);
            }
        }, READER_RASTER_EMPTY_RETRY_MS);
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
        this.positionFrame = requestAnimationFrame(() => {
            this.positionFrame = 0;
            if (this.destroyed) return;
            this.positionVideoFrames();
            this.positionCanvasFrames();
            this.positionBackgroundFrames();
            for (const image of this.states.keys()) this.positionState(image);
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

    private snapshotPausedVideo(target: EventTarget | null): void {
        if (this.destroyed) return;
        if (!(target instanceof HTMLVideoElement) || this.videoFrames.has(target)) return;
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled || !settings.ocrVideoPauseFrames || settings.ocrProvider === 'off') return;
        if (isFreshMiningPause(target)) return;
        if (isLikelyPausedVideoThumbnail(target)) return;
        const rect = target.getBoundingClientRect();
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
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
        if (!this.options.getSettings().ocrEnabled) return;
        const existing = this.imageStatuses.get(image);
        const isCanvasFrame = this.canvasFrameSources.has(image);
        const isReaderRasterFrame = isCanvasFrame || this.backgroundFrameSources.has(image);
        // Status changed — cancel any pending "ready" fade so a re-scan starts clean.
        this.clearImageStatusTimer(image);
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
        const labelNode = card.querySelector('.jpdb-ocr-video-frame-status-label');
        if (labelNode) labelNode.textContent = isReaderRasterFrame ? uiText(this.options.getSettings().interfaceLanguage, videoFrameStatusTextKey(status)) : '';
        this.positionImageStatusCard(image, card);
        // "ready" is terminal for incidental inline images: flash the dot, then
        // remove it. Reader-raster pages keep a persistent page-level pill while
        // the captured frame is alive; otherwise BookWalker looks like scanning
        // randomly disappears even though the OCR layer is still current.
        if (status === 'ready' && !isReaderRasterFrame) this.scheduleImageStatusFade(image, card);
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
        const rect = image.getBoundingClientRect();
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
        if (this.readerRasterPoll || !isReaderRasterPage()) return;
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
        if (!settings.ocrEnabled || settings.ocrProvider === 'off') return;
        const nativeTextLayerBlocksAutoScan = this.options.shouldAutoScan?.() === false
            && settings.ocrAutoScanImages
            && !userRequested;
        const ocrOptInCanvases = nativeTextLayerBlocksAutoScan
            ? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested)
            : undefined;
        // asked to scan, so a background poll must NOT wipe the frame they tapped to
        // create — only a genuine page turn (detected below) should drop it.
        if (nativeTextLayerBlocksAutoScan && !ocrOptInCanvases?.length) {
            if (!isReaderRasterPage()) { this.releaseAllCanvasFrames(); return; }
            // Native-text-layer page (mokuro et al.): strip AUTO frames so we don't
            // double-paint the page's own text, but KEEP a frame the user explicitly
            // tapped to create — only a real page turn drops that. Releasing everything
            // here wiped a just-tapped frame on the very next background poll. Never
            // auto-capture from this path (that is the whole point of the gate).
            const signature = canvasReaderPageSignature();
            const turned = signature !== this.canvasReaderSignature;
            this.canvasReaderSignature = signature;
            for (const canvas of [...this.canvasFrames.keys()]) {
                if (turned || !this.canvasFrameUserRequested.has(canvas)) this.releaseCanvasFrame(canvas);
            }
            return;
        }
        if (!isReaderRasterPage()) {
            this.releaseAllCanvasFrames();
            return;
        }
        this.startReaderRasterPollingIfNeeded();
        // ALWAYS detect page turns — even when we won't auto-capture. NFBR repaints
        // one in-place canvas, so without this a turn in tap/manual mode left the
        // previous page's overlay sitting over the new page until a full reload. On
        // a turn we drop stale frames; whether we then capture is the mode's choice.
        const signature = canvasReaderPageSignature();
        if (signature !== this.canvasReaderSignature) {
            if (this.shouldHoldCanvasFramesForSamePageSignature(signature)) {
                this.scheduleReaderRasterRefresh(80);
                return;
            }
            this.canvasReaderSamePageSignatureSkips = 0;
            this.releaseAllCanvasFrames();
            this.canvasReaderSignature = signature;
        } else {
            this.canvasReaderSamePageSignatureSkips = 0;
        }
        // Tap/manual mode: never spend OCR calls on the poll. Detection above already
        // cleared the stale overlay; a tap (userRequested) re-enters here to capture.
        // A tap that failed because the page wasn't composited yet still re-attempts
        // here (it stays flagged user-requested) so the page OCRs without a 2nd tap.
        if (!settings.ocrAutoScanImages && !userRequested) {
            this.retryPendingUserRequestedCaptures(settings);
            return;
        }
        const canvases = ocrOptInCanvases ?? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
        for (const canvas of [...this.canvasFrames.keys()]) {
            if (canvases.includes(canvas)) continue;
            if (this.shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas, signature)) continue;
            // Don't drop a frame whose image is still loading — a transient off-screen
            // blip (layout shift right after capture, before the mirror image decodes)
            // would otherwise waste the in-flight capture and leave the page un-OCR'd.
            if (this.canvasFrames.get(canvas)?.complete === false) continue;
            this.releaseCanvasFrame(canvas);
        }
        for (const canvas of canvases) {
            if (this.canvasFrames.has(canvas)) continue;
            this.snapshotCanvasSurface(canvas, settings, userRequested);
        }
    }

    private async snapshotCanvasSurface(canvas: HTMLCanvasElement, settings: ReaderSettings, userRequested = false): Promise<void> {
        const key = canvasSurfaceSnapshotKey(canvas);
        if (this.canvasFrames.has(canvas)) {
            if (!userRequested || this.canvasFrameKeys.get(canvas) === key) return;
            this.releaseCanvasFrame(canvas);
        }
        if (this.pendingCanvasSnapshots.get(canvas) === key) return;
        this.pendingCanvasSnapshots.set(canvas, key);
        try {
            const rect = canvas.getBoundingClientRect();
            if (rect.width * rect.height < settings.ocrMinImageArea) return;
            // Prefetch a sliding window of upcoming pages (canvasPrefetchMargin), but
            // never spend an OCR call on a page the reader hasn't painted yet.
            if (!isNearViewport(canvas, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(canvas)) return;
            // A readable canvas is snapshotted directly. A tainted one can only fall
            // back to a fetched source image on readers where that resource is the
            // same page the user sees; BookWalker source assets may be scrambled, so
            // those must wait for a readable rendered buffer/screenshot instead.
            let frameSrc: string | undefined;
            let frameRect = rect;
            // Stable per-page OCR cache key. The captured data-URL changes every
            // capture (re-encoded JPEG, re-rebuilt mirror), so keying the OCR cache on
            // it re-OCRs a page each time it is revisited (turn forward then back).
            // A content key — the page's rendered pixel hash, or its source image URL —
            // is the same whenever the same page is shown, so the revisit hits the
            // cache instead of calling Lens again.
            let contentKey: string | undefined;
            if (isCanvasReadable(canvas)) {
                const contentSignature = canvasRenderedContentSignature(canvas);
                if (!contentSignature) { this.scheduleCanvasCaptureRetry(canvas, userRequested); return; }
                if (!this.canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested)) return;
                frameSrc = captureCanvasDataUrl(canvas, settings.ocrMaxImagePixels);
                contentKey = `cv:${contentSignature}:${canvas.width}x${canvas.height}`;
            } else if (isBookwalkerViewerHost()) {
                // Firefox/iPad taint the DRM page canvas. Rebuild it from the engine's
                // own descramble drawImage ops replayed against GM-fetched origin-clean
                // source images (works in any userscript manager, including iPad). Fall
                // back to the extension screenshot bridge when nothing was recorded
                // (e.g. the Yomu extension, where the canvas is read directly anyway).
                const captureMirror = this.options.captureCanvasMirror ?? captureCanvasMirror;
                const mirror = await captureMirror(canvas, loadCleanMirrorImage);
                if (mirror) {
                    frameSrc = captureCanvasDataUrl(mirror, settings.ocrMaxImagePixels);
                    // The rebuilt mirror canvas is origin-clean, so its pixel hash is a
                    // stable per-page key (the same page rebuilds to the same image).
                    const mirrorSignature = canvasRenderedContentSignature(mirror);
                    if (mirrorSignature) contentKey = `cv:${mirrorSignature}:${mirror.width}x${mirror.height}`;
                } else {
                    const captureReaderSurface = this.options.captureReaderSurface ?? captureReaderSurfaceViaExtensionScreenshot;
                    const screenshot = await captureReaderSurface(canvas, settings.ocrMaxImagePixels);
                    frameSrc = screenshot?.dataUrl;
                    frameRect = screenshot?.rect ?? rect;
                }
            } else if (canUseReaderCanvasSourceImageFallback()) {
                frameSrc = readerCanvasSourceImageUrl();
                if (frameSrc) contentKey = `src:${frameSrc}`; // page image URL is stable per page
            }
            if (!frameSrc) { this.scheduleCanvasCaptureRetry(canvas, userRequested); return; }
            if (this.destroyed || !canvas.isConnected || this.canvasFrames.has(canvas)) return;
            if (canvasSurfaceSnapshotKey(canvas) !== key) {
                // BookWalker can repaint the same canvas while a mirror/screenshot
                // capture from the previous page is still resolving. Never append
                // that stale frame over the new page; schedule a fresh capture for
                // the current signature instead.
                this.scheduleReaderRasterRefresh(40);
                return;
            }
            const frame = document.createElement('img');
            frame.className = 'jpdb-ocr-canvas-frame';
            frame.dataset.yomuCanvasFrame = 'true';
            // Set before the load → enqueue so the OCR cache keys by stable content.
            if (contentKey) frame.dataset.ocrContentKey = contentKey;
            frame.alt = '';
            positionCanvasFrameImage(frame, frameRect);
            frame.addEventListener('load', () => {
                if (this.canvasFrames.get(canvas) === frame) this.enqueue(frame, userRequested);
            }, { once: true });
            document.body.append(frame);
            this.canvasFrames.set(canvas, frame);
            this.canvasFrameSources.set(frame, canvas);
            this.canvasFrameKeys.set(canvas, key);
            if (frameRect !== rect) this.canvasFrameStaticRects.set(frame, frameRect);
            if (userRequested) this.canvasFrameUserRequested.add(canvas);
            else this.canvasFrameUserRequested.delete(canvas);
            this.updateOcrStatus(frame, 'loading');
            frame.src = frameSrc;
            this.clearCanvasCaptureRetry(canvas);
            // Sync the page-turn signature to the state we just captured. A tap
            // (userRequested) reaches snapshotCanvasSurface WITHOUT going through
            // refreshCanvasReaderSurfaces, so canvasReaderSignature would still hold a
            // pre-capture value; the next poll would then see a "change" and release
            // this fresh frame. Recording it here keeps the tapped/auto frame alive
            // until the page genuinely turns.
            this.canvasReaderSignature = canvasReaderPageSignature();
            this.canvasReaderSamePageSignatureSkips = 0;
            this.schedulePosition();
        } finally {
            if (this.pendingCanvasSnapshots.get(canvas) === key) this.pendingCanvasSnapshots.delete(canvas);
        }
    }

    private shouldHoldCanvasFramesForSamePageSignature(signature: string): boolean {
        if (!this.canvasReaderSignature) return false;
        if (!this.canvasFrames.size) return false;
        if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
        if (!isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature)) return false;
        if (hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
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
    // of waiting for the next 1200ms poll. After the cap we stop the fast retry; the
    // poll keeps trying and a tap force-rescans, so the page is never permanently
    // stuck. The counter resets on a real turn (releaseAllCanvasFrames) or success.
    // A user-requested (tapped) capture opens a bounded recapture WINDOW so the retry
    // re-attempts AS a tap — in tap/manual mode the poll itself never captures, so
    // without this a failed tap is dropped and the page never OCRs until the user taps
    // again. The window survives page-signature changes (a late repaint, or the poll
    // first seeing the freshly-composited page, that releaseAllCanvasFrames treats as a
    // turn) and is bounded by its own attempt count, so it can never become permanent
    // auto-OCR — it expires after READER_RASTER_MAX_CAPTURE_ATTEMPTS tries.
    private scheduleCanvasCaptureRetry(canvas: HTMLCanvasElement, userRequested = false): void {
        if (userRequested) {
            if (!this.canvasTapRecapture.has(canvas)) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
            const remaining = this.canvasTapRecapture.get(canvas) ?? 0;
            if (remaining <= 0) { this.canvasTapRecapture.delete(canvas); return; }
            const attempt = READER_RASTER_MAX_CAPTURE_ATTEMPTS - remaining; // 0,1,2…
            const delay = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** attempt, READER_RASTER_RETRY_MAX_MS);
            this.scheduleReaderRasterRefresh(delay);
            return;
        }
        const attempts = (this.canvasCaptureAttempts.get(canvas) ?? 0) + 1;
        this.canvasCaptureAttempts.set(canvas, attempts);
        if (attempts > READER_RASTER_MAX_CAPTURE_ATTEMPTS) return;
        const delay = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** (attempts - 1), READER_RASTER_RETRY_MAX_MS);
        this.scheduleReaderRasterRefresh(delay);
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
        this.canvasTapRecapture.delete(canvas);
    }

    private releaseCanvasFrame(canvas: HTMLCanvasElement): void {
        const frame = this.canvasFrames.get(canvas);
        if (!frame) return;
        this.canvasFrames.delete(canvas);
        const state = this.states.get(frame);
        if (state) this.releaseImageState(frame, state);
        else this.forgetImageWork(frame);
        this.canvasFrameSources.delete(frame);
        this.canvasFrameStaticRects.delete(frame);
        this.canvasFrameKeys.delete(canvas);
        this.canvasContentReadiness.delete(canvasContentReadinessKey(canvas));
        this.canvasCaptureAttempts.delete(canvas);
        this.canvasTapRecapture.delete(canvas);
        this.canvasFrameUserRequested.delete(canvas);
        frame.remove();
    }

    private releaseAllCanvasFrames(): void {
        for (const canvas of [...this.canvasFrames.keys()]) this.releaseCanvasFrame(canvas);
        // NFBR reuses the same canvas object across turns; a stale readiness entry
        // (or capture-attempt count) would carry into the next page, so clear both.
        this.canvasContentReadiness.clear();
        this.canvasCaptureAttempts.clear();
        // NOTE: canvasTapRecapture is deliberately NOT cleared here. A turn is detected
        // by a page-signature change, but so is a late repaint / the poll first seeing
        // the just-composited page — clearing the tap window on either would drop a tap
        // whose capture wasn't ready (the no-OCR bug). The window is self-bounding (it
        // expires after its attempt budget) so a genuine turn can't leave it auto-OCRing.
        this.canvasReaderSignature = undefined;
        this.canvasReaderSamePageSignatureSkips = 0;
    }

    private positionCanvasFrames(): void {
        for (const [canvas, frame] of [...this.canvasFrames]) {
            if (!canvas.isConnected) {
                this.releaseCanvasFrame(canvas);
                continue;
            }
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height || isHiddenByCss(canvas) || isInsideHiddenAncestor(canvas)) {
                this.releaseCanvasFrame(canvas);
                continue;
            }
            const staticRect = this.canvasFrameStaticRects.get(frame);
            if (staticRect) {
                const currentRect = this.visibleViewportIntersection(rect);
                if (!currentRect || !rectsNearlyEqual(staticRect, currentRect)) {
                    this.releaseCanvasFrame(canvas);
                    this.scheduleReaderRasterRefresh(40);
                    continue;
                }
                positionCanvasFrameImage(frame, staticRect);
                continue;
            }
            positionCanvasFrameImage(frame, rect);
        }
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
        if (!settings.ocrEnabled || settings.ocrProvider === 'off') return;
        if (!settings.ocrAutoScanImages && !userRequested) return;
        if (this.options.shouldAutoScan?.() === false && !userRequested) {
            this.releaseAllBackgroundFrames();
            return;
        }
        if (!isReaderRasterPage()) {
            this.releaseAllBackgroundFrames();
            return;
        }
        this.startReaderRasterPollingIfNeeded();
        const surfaces = activeReaderRasterSurfaces(collectBackgroundImageReaderSurfaces(), settings, userRequested);
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
        const state = this.states.get(image);
        if (!state) return;
        const rect = image.getBoundingClientRect();
        const visible = isImageVisibleForOcr(image, rect);
        state.overlay.hidden = !visible;
        setOcrOverlayAccessibility(state.overlay, visible);
        if (!visible) return;
        setOcrArtifactPosition(state.overlay, rect.left, rect.top);
        state.overlay.style.width = `${rect.width}px`;
        state.overlay.style.height = `${rect.height}px`;
        this.fitLineFonts(state, this.renderedOcrImageFrameForState(image, rect, state.result));
    }

    private renderedOcrImageFrameForState(image: HTMLImageElement, rect: DOMRect, result: OcrResult | undefined): OcrRenderedImageFrame {
        const frame = renderedOcrImageFrame(image, rect, result);
        if (!this.canvasFrameSources.has(image) && !this.backgroundFrameSources.has(image)) return frame;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (!viewportHeight || rect.bottom < viewportHeight - 2) return frame;
        const reserved = Math.max(0, Math.min(READER_RASTER_BOTTOM_CHROME_RESERVE_PX, frame.imageHeight - 1));
        return reserved ? { ...frame, safeBottomInset: reserved } : frame;
    }

    private fitLineFonts(state: ImageState, frame: OcrRenderedImageFrame): void {
        const scale = this.options.getSettings().ocrFontScale;
        state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line').forEach(element => {
            const boxLeft = frame.imageLeft + Number(element.dataset.boxLeft) * frame.imageWidth;
            const boxTop = frame.imageTop + Number(element.dataset.boxTop) * frame.imageHeight;
            const boxWidth = Number(element.dataset.boxWidth) * frame.imageWidth;
            const boxHeight = Number(element.dataset.boxHeight) * frame.imageHeight;
            if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth <= 0 || boxHeight <= 0) return;
            const text = element.dataset.ocrText ?? '';
            const vertical = element.dataset.vertical === 'true';
            element.style.fontSize = `${ocrFontPx(text, boxWidth, boxHeight, vertical, scale)}px`;
            this.fitLineFrame(element, boxLeft, boxTop, boxWidth, boxHeight, frame, vertical);
        });
    }

    private fitLineFrame(
        element: HTMLElement,
        boxLeft: number,
        boxTop: number,
        boxWidth: number,
        boxHeight: number,
        frame: OcrRenderedImageFrame,
        vertical: boolean,
    ): void {
        const textElement = element.querySelector<HTMLElement>('.jpdb-ocr-line-text');
        if (!textElement) return;
        const hasFurigana = element.dataset.hasFuri === 'true';
        const fontSize = Number.parseFloat(element.style.fontSize) || 16;
        const underlineBleed = ocrWordUnderlineBleedPx(fontSize);
        const padX = Math.max(4, Math.round(fontSize * 0.16));
        const padTop = hasFurigana ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(2, Math.round(fontSize * 0.08));
        const padBottom = vertical
            ? Math.max(3, Math.round(fontSize * 0.1))
            : Math.max(3, underlineBleed);
        element.style.setProperty('--jpdb-ocr-pad-x', `${padX}px`);
        element.style.setProperty('--jpdb-ocr-pad-top', `${padTop}px`);
        element.style.setProperty('--jpdb-ocr-pad-bottom', `${padBottom}px`);

        const contentRect = textElement.getBoundingClientRect();
        const contentWidth = Math.max(1, contentRect.width);
        const contentHeight = Math.max(1, contentRect.height);
        const minHitSize = Math.max(24, Math.round(fontSize * 1.25));
        // A vertical furigana reading sits in a strip to the RIGHT of its column
        // (real vertical ruby). The .jpdb-ocr-line is overflow:visible, so the
        // reading can spill past the highlight box harmlessly; reserving a
        // symmetric gutter to wrap it only made furigana columns look wider than
        // the OCR text (user feedback). Keep the frame the same width as a plain
        // column and instead reserve the reading's width in the horizontal
        // position clamp, so only the rightmost column (the first one read, whose
        // reading would otherwise run past the image edge into
        // .jpdb-ocr-layer{overflow:hidden}) is nudged inward.
        const furiGutter = vertical && hasFurigana ? Math.round(fontSize * 0.55) : 0;
        const underlineGutter = vertical ? underlineBleed : 0;
        const frameWidth = Math.min(frame.imageWidth, Math.max(boxWidth, minHitSize, contentWidth + padX * 2 + underlineGutter * 2));
        const frameHeight = Math.min(frame.imageHeight, Math.max(boxHeight, minHitSize, contentHeight + padTop + padBottom));
        const minLeft = frame.imageLeft;
        const minTop = frame.imageTop;
        const maxLeft = Math.max(minLeft, frame.imageLeft + frame.imageWidth - frameWidth - furiGutter);
        const maxTop = Math.max(minTop, frame.imageTop + frame.imageHeight - (frame.safeBottomInset ?? 0) - frameHeight);
        const left = clampNumber(boxLeft + boxWidth / 2 - frameWidth / 2, minLeft, maxLeft);
        const centeredTop = boxTop + boxHeight / 2 - frameHeight / 2;
        const baselineAlignedTop = boxTop + boxHeight - frameHeight + padBottom;
        const top = clampNumber(shouldCenterOcrText(element.dataset.ocrText ?? '', vertical) ? centeredTop : baselineAlignedTop, minTop, maxTop);

        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.width = `${frameWidth}px`;
        element.style.height = `${frameHeight}px`;
    }

    private clear(): void {
        this.observer?.disconnect();
        this.observer = undefined;
        this.observerMargin = '';
        window.clearTimeout(this.refreshTimer);
        this.releaseAllCanvasFrames();
        this.releaseAllBackgroundFrames();
        this.queue = [];
        this.inFlightKeys.clear();
        for (const state of this.states.values()) {
            removeOcrArtifact(state.overlay);
        }
        this.states.clear();
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

    private rememberOcrWordRenderStates(line: HTMLElement, tokens: JPDBToken[]): void {
        const tokensByKey = new Map(tokens.map(token => [ocrTokenRenderKey(token), token]));
        line.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]').forEach(word => {
            const token = tokensByKey.get(ocrRenderedWordKey(word));
            if (!token) return;
            this.ocrWordRenderStates.set(word, {
                surface: word.dataset.surface || line.dataset.ocrText?.slice(token.start, token.end) || word.textContent || '',
                token,
            });
        });
    }

    private activateOcrMarkup(line: HTMLElement): void {
        let hasFurigana = false;
        const settings = this.options.getSettings();
        line.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]').forEach(word => {
            const state = this.ocrWordRenderStates.get(word);
            if (!state) return;
            this.applyOcrPitchClass(word, state.token);
            if (!shouldRenderRuby(state.surface, state.token, settings)) {
                this.setOcrWordPlainText(word, state.surface);
                return;
            }
            setInnerHtml(word, renderRuby(state.surface, state.token));
            normalizeOcrRenderedText(word);
            word.classList.add('jpdb-reader-has-furi');
            hasFurigana = true;
        });
        line.dataset.hasFuri = String(hasFurigana);
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

    private setOcrWordPlainText(word: HTMLElement, surface: string): void {
        word.classList.remove('jpdb-reader-has-furi');
        setInnerHtml(word, escapeHtml(surface));
        normalizeOcrRenderedText(word);
    }

    // Drop every paused-frame and image overlay when YouTube navigates so no
    // stale OCR artifact (rail resume button, overlay over the player) carries
    // across the SPA route change, then re-scan the destination page.
    private teardownForNavigation(): void {
        if (this.states.size === 0 && this.videoFrames.size === 0 && this.canvasFrames.size === 0 && this.backgroundFrames.size === 0) return;
        this.releaseAllVideoFrames();
        this.clear();
        if (this.options.getSettings().ocrEnabled) this.scheduleRefresh(0);
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
        this.inFlightKeys.delete(imageCacheKey(image));
        if (state) this.inFlightKeys.delete(state.key);
        this.removeImageStatusCard(image);
    }

    private isCurrentState(state: ImageState): boolean {
        return !this.destroyed && this.states.get(state.image) === state;
    }

    private requireCurrentState(state: ImageState): void {
        if (!this.isCurrentState(state)) throw STALE_OCR_STATE;
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
    overlay.style.setProperty('--jpdb-ocr-background-rgba', accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity));
    overlay.style.setProperty('--jpdb-ocr-background-active-rgba', accentToRgba(settings.ocrBackgroundColor, Math.min(1, settings.ocrBackgroundOpacity + 0.12)));
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
    const fallbackTokens = fallbackJapaneseSegments(text)
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
    segment: { surface: string; start: number; end: number },
    fallbackCardFromText: (text: string) => JPDBCard,
): JPDBToken {
    const card = fallbackCardFromText(segment.surface);
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

function ocrFallbackCardFromText(text: string): JPDBCard {
    const spelling = text.replace(/\s+/g, ' ').trim().slice(0, 80);
    const id = -stablePositiveHashId(`ocr-fallback\n${spelling}`);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading: '',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
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
    element.setAttribute('aria-label', line.text);
    const textElement = createOcrLineText(line, tokens, settings);
    element.append(textElement);
    element.dataset.hasFuri = String(Boolean(textElement.querySelector('.jpdb-reader-has-furi')));
    setOcrLinePosition(element, result, line);
    return element;
}

function setOcrOverlayAccessibility(overlay: HTMLElement, visible: boolean): void {
    overlay.setAttribute('aria-hidden', String(!visible));
    if (!visible) {
        overlay.removeAttribute('role');
        overlay.removeAttribute('aria-label');
        return;
    }
    overlay.setAttribute('role', 'region');
    overlay.setAttribute('aria-label', `Yomu OCR text ${overlay.dataset.ocrLayerId ?? ''}`.trim());
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
    normalizeOcrRenderedText(textElement);
    return textElement;
}

function ocrTokenRenderKey(token: JPDBToken): string {
    return `${token.start}:${token.end}:${token.card.vid}:${token.card.sid}`;
}

function ocrRenderedWordKey(word: HTMLElement): string {
    return `${word.dataset.tokenStart ?? ''}:${word.dataset.tokenEnd ?? ''}:${word.dataset.vid ?? ''}:${word.dataset.sid ?? ''}`;
}

function ocrSafePitchClass(pitchClass: string | undefined): string {
    const normalized = pitchClass?.trim() ?? '';
    return /^(?:heiban|atamadaka|nakadaka|odaka|kifuku)$/u.test(normalized) ? normalized : '';
}

function setOcrLinePosition(element: HTMLElement, result: OcrResult, line: OcrLine): void {
    element.style.left = `${100 * line.box.left / result.width}%`;
    element.style.top = `${100 * line.box.top / result.height}%`;
    element.style.width = `${100 * line.box.width / result.width}%`;
    element.style.height = `${100 * line.box.height / result.height}%`;
}

function renderedOcrImageFrame(image: HTMLImageElement, rect: DOMRect, result: OcrResult | undefined): OcrRenderedImageFrame {
    const pausedVideoFrame = renderedPausedVideoFrame(image, rect);
    if (pausedVideoFrame) return pausedVideoFrame;
    const style = getComputedStyle(image);
    const content = imageContentBox(image, rect, style);
    const { sourceWidth, sourceHeight } = ocrSourceDimensions(image, rect, content, result);
    const object = fittedObjectSize(style.objectFit, sourceWidth, sourceHeight, content.width, content.height);
    const offset = objectPositionOffset(style.objectPosition, content.width - object.width, content.height - object.height);
    return {
        imageLeft: content.left + offset.x,
        imageTop: content.top + offset.y,
        imageWidth: Math.max(1, object.width),
        imageHeight: Math.max(1, object.height),
    };
}

function renderedPausedVideoFrame(image: HTMLImageElement, rect: DOMRect): OcrRenderedImageFrame | null {
    if (image.dataset.yomuVideoFrame !== 'true') return null;
    return {
        imageLeft: 0,
        imageTop: 0,
        imageWidth: Math.max(1, rect.width),
        imageHeight: Math.max(1, rect.height),
    };
}

function ocrSourceDimensions(
    image: HTMLImageElement,
    rect: DOMRect,
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

function imageContentBox(image: HTMLImageElement, rect: DOMRect, style: CSSStyleDeclaration): OcrRect {
    const scaleX = rectScale(rect.width, image.offsetWidth);
    const scaleY = rectScale(rect.height, image.offsetHeight);
    const left = scaledBoxEdge(style.borderLeftWidth, scaleX) + scaledBoxEdge(style.paddingLeft, scaleX);
    const right = scaledBoxEdge(style.borderRightWidth, scaleX) + scaledBoxEdge(style.paddingRight, scaleX);
    const top = scaledBoxEdge(style.borderTopWidth, scaleY) + scaledBoxEdge(style.paddingTop, scaleY);
    const bottom = scaledBoxEdge(style.borderBottomWidth, scaleY) + scaledBoxEdge(style.paddingBottom, scaleY);
    return {
        left,
        top,
        width: Math.max(1, rect.width - left - right),
        height: Math.max(1, rect.height - top - bottom),
    };
}

function rectScale(rectSize: number, layoutSize: number): number {
    return layoutSize > 0 ? rectSize / layoutSize : 1;
}

function scaledBoxEdge(value: string, scale: number): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed * scale : 0;
}

function fittedObjectSize(
    objectFit: string,
    sourceWidth: number,
    sourceHeight: number,
    contentWidth: number,
    contentHeight: number,
): { width: number; height: number } {
    const safeSourceWidth = Math.max(1, sourceWidth);
    const safeSourceHeight = Math.max(1, sourceHeight);
    const safeContentWidth = Math.max(1, contentWidth);
    const safeContentHeight = Math.max(1, contentHeight);
    const contain = () => scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.min(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
    switch (objectFit) {
        case 'contain':
            return contain();
        case 'cover':
            return scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.max(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
        case 'none':
            return { width: safeSourceWidth, height: safeSourceHeight };
        case 'scale-down': {
            const contained = contain();
            return contained.width < safeSourceWidth || contained.height < safeSourceHeight
                ? contained
                : { width: safeSourceWidth, height: safeSourceHeight };
        }
        case 'fill':
        default:
            return { width: safeContentWidth, height: safeContentHeight };
    }
}

function scaledObjectSize(width: number, height: number, scale: number): { width: number; height: number } {
    return {
        width: Math.max(1, width * scale),
        height: Math.max(1, height * scale),
    };
}

function objectPositionOffset(value: string, freeX: number, freeY: number): { x: number; y: number } {
    const tokens = cssPositionTokens(value);
    const axes = parseObjectPositionAxes(tokens);
    return {
        x: axisPositionOffset(axes.x, freeX),
        y: axisPositionOffset(axes.y, freeY),
    };
}

type OcrObjectPositionAxis = { keyword?: string; token?: string; offset?: string };

function cssPositionTokens(value: string): string[] {
    return value.trim().match(/(?:calc\([^)]*\)|[^\s]+)/g) ?? [];
}

function parseObjectPositionAxes(tokens: string[]): { x: OcrObjectPositionAxis; y: OcrObjectPositionAxis } {
    const paired = parseKeywordPositionAxes(tokens);
    if (paired) return paired;
    const [first = '50%', second] = tokens;
    if (isVerticalPositionKeyword(first)) return { x: positionAxis(second || '50%'), y: positionAxis(first) };
    return { x: positionAxis(first), y: positionAxis(second || '50%') };
}

function parseKeywordPositionAxes(tokens: string[]): { x: OcrObjectPositionAxis; y: OcrObjectPositionAxis } | null {
    let x: OcrObjectPositionAxis | null = null;
    let y: OcrObjectPositionAxis | null = null;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (isHorizontalPositionKeyword(token)) {
            x = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
            continue;
        }
        if (isVerticalPositionKeyword(token)) {
            y = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
        }
    }
    return x || y ? { x: x ?? positionAxis('50%'), y: y ?? positionAxis('50%') } : null;
}

function positionAxis(token: string): OcrObjectPositionAxis {
    return positionKeyword(token) ? { keyword: token } : { token };
}

function positionOffsetToken(token: string | undefined): string | undefined {
    return token && !positionKeyword(token) ? token : undefined;
}

function axisPositionOffset(axis: OcrObjectPositionAxis, freeSpace: number): number {
    const base = axis.keyword ? keywordPositionOffset(axis.keyword, freeSpace) : tokenPositionOffset(axis.token, freeSpace);
    const offset = cssLengthPx(axis.offset);
    if (axis.keyword === 'right' || axis.keyword === 'bottom') return base - offset;
    return base + offset;
}

function keywordPositionOffset(keyword: string, freeSpace: number): number {
    if (keyword === 'right' || keyword === 'bottom') return freeSpace;
    if (keyword === 'center') return freeSpace / 2;
    return 0;
}

function tokenPositionOffset(token: string | undefined, freeSpace: number): number {
    if (!token) return freeSpace / 2;
    if (token.endsWith('%')) return freeSpace * (Number.parseFloat(token) || 0) / 100;
    return cssLengthPx(token);
}

function cssLengthPx(value: string | undefined): number {
    if (!value) return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function positionKeyword(token: string | undefined): token is string {
    return isHorizontalPositionKeyword(token) || isVerticalPositionKeyword(token) || token === 'center';
}

function isHorizontalPositionKeyword(token: string | undefined): token is string {
    return token === 'left' || token === 'right';
}

function isVerticalPositionKeyword(token: string | undefined): token is string {
    return token === 'top' || token === 'bottom';
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

function ocrFontPx(text: string, boxWidth: number, boxHeight: number, vertical: boolean, scale: number): number {
    const safeScale = Math.max(0.7, Math.min(1.8, scale));
    const length = Math.max(1, visualTextLength(text));
    const byBoxThickness = vertical ? boxWidth * 0.72 : boxHeight * 0.58;
    const byBoxLength = vertical ? (boxHeight / length) * 1.12 : (boxWidth / length) * 1.08;
    const fitted = Math.min(byBoxThickness, byBoxLength) * safeScale;
    return Math.max(11, Math.min(38, fitted));
}

function ocrWordUnderlineBleedPx(fontSize: number): number {
    return Math.ceil(fontSize * (OCR_WORD_UNDERLINE_OFFSET_EM + OCR_WORD_UNDERLINE_THICKNESS_EM))
        + OCR_WORD_UNDERLINE_CLEARANCE_PX;
}

function visualTextLength(text: string): number {
    return [...text.trim()].reduce((total, char) => {
        if (/\s/.test(char)) return total + 0.35;
        if (/[\u0000-\u00ff]/.test(char)) return total + 0.62;
        return total + 1;
    }, 0);
}

function shouldCenterOcrText(text: string, vertical: boolean): boolean {
    return vertical || visualTextLength(text) <= 1.5;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

async function recognizeViaLocalService(image: HTMLImageElement, settings: ReaderSettings, invert = false): Promise<OcrResult | null> {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
    const engine = settings.ocrEngine === 'auto' ? '' : settings.ocrEngine;
    const body = JSON.stringify({
        id: imageCacheKey(image),
        language_code: settings.ocrLanguage || 'ja-JP',
        language: {
            bcp47_tag: settings.ocrLanguage || 'ja-JP',
            two_letter_code: (settings.ocrLanguage || 'ja').slice(0, 2),
        },
        base64_image: payload.base64,
        image: payload.base64,
        image_bytes: payload.base64,
        ocr_engine: engine,
        ocr_adapter_name: engine,
        detection_only: false,
    });
    const response = await requestJson(localOcrEndpointUrl(settings), body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
}

async function recognizeViaCloudVision(image: HTMLImageElement, settings: ReaderSettings, invert = false): Promise<OcrResult | null> {
    const apiKey = settings.ocrCloudVisionApiKey.trim();
    if (!apiKey) return null;
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
    const body = JSON.stringify({
        requests: [{
            image: { content: payload.base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 50, model: 'builtin/latest' }],
            imageContext: { languageHints: [(settings.ocrLanguage || 'ja-JP').slice(0, 2)] },
        }],
    });
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    const response = await requestJson(url, body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
}

async function recognizeViaGoogleLens(image: HTMLImageElement, settings: ReaderSettings, invert = false): Promise<OcrResult | null> {
    const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, 'image/jpeg', 0.88, invert);
    const protobuf = await recognizeViaGoogleLensProtobuf(blob, canvas, settings).catch(error => {
        log.warn('Google Lens protobuf failed', error);
        return undefined;
    });
    if (protobuf?.lines.length) return protobuf;
    const upload = await recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, settings.audioTimeoutMs).catch(error => {
        log.warn('Google Lens upload failed', error);
        return undefined;
    });
    if (protobuf === undefined && upload === undefined) throw new Error('Google Lens OCR failed.');
    return upload?.lines.length ? upload : (upload ?? protobuf ?? null);
}

async function recognizeViaGoogleLensProtobuf(blob: Blob, canvas: HTMLCanvasElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, settings.audioTimeoutMs);
    return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
}

function ocrRecognizer(settings: ReaderSettings): OcrRecognizer | null {
    const recognizer = OCR_RECOGNIZERS[settings.ocrProvider] ?? null;
    return recognizer && isOcrProviderConfigured(settings) ? recognizer : null;
}

function isOcrProviderConfigured(settings: ReaderSettings): boolean {
    return OCR_PROVIDER_CONFIGURED[settings.ocrProvider]?.(settings) ?? false;
}

async function imageToBase64Payload(image: HTMLImageElement, maxPixels: number, invertDark = false): Promise<{ base64: string; width: number; height: number }> {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, 'image/jpeg', 0.86, invertDark);
    return { base64: (await readBlobAsDataUrl(blob, 'Blob read failed.')).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
}

async function imageToBlobPayload(image: HTMLImageElement, maxPixels: number, type: string, quality: number, invertDark = false): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
    const canvas = await imageToCanvas(image, maxPixels, invertDark);
    try {
        return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch {
        const fallbackCanvas = await imageBlobToCanvas(image, maxPixels, invertDark);
        return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
}

async function recognizeViaGoogleLensUpload(blob: Blob, width: number, height: number, timeout: number): Promise<OcrResult | null> {
    const data = new FormData();
    data.append('encoded_image', blob, 'image.jpg');
    // Match the real Lens web client (cf. references/YomiNinja): this endpoint is
    // hit with the user's own .google.com session cookies (GM_xmlhttpRequest sends
    // them automatically) plus an Origin/Referer of lens.google.com, so it draws
    // on a per-user quota instead of the shared, easily throttled keyless protobuf
    // endpoint. The privileged GM request can set these otherwise-forbidden headers.
    const response = await requestTextForm(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, data, timeout, {
        Origin: 'https://lens.google.com',
        Referer: 'https://lens.google.com/',
    });
    return parseGoogleLensUploadHtml(response, width, height);
}

async function imageToCanvas(image: HTMLImageElement, maxPixels: number, invert = false): Promise<HTMLCanvasElement> {
    try {
        const canvas = drawImageToCanvas(image, maxPixels);
        assertCanvasReadable(canvas);
        return invert ? invertedCanvas(canvas) : canvas;
    } catch {
        return imageBlobToCanvas(image, maxPixels, invert);
    }
}

async function imageBlobToCanvas(image: HTMLImageElement, maxPixels: number, invert = false): Promise<HTMLCanvasElement> {
    const url = image.currentSrc || image.src;
    if (!url || url.startsWith('data:')) throw new Error('Image cannot be read by OCR.');
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
        const loaded = await loadImage(objectUrl);
        const canvas = drawImageToCanvas(loaded, maxPixels);
        assertCanvasReadable(canvas);
        return invert ? invertedCanvas(canvas) : canvas;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function invertedCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    try {
        const inverted = document.createElement('canvas');
        inverted.width = canvas.width;
        inverted.height = canvas.height;
        const context = inverted.getContext('2d');
        if (!context) return canvas;
        context.filter = 'invert(1)';
        context.drawImage(canvas, 0, 0);
        return inverted;
    } catch {
        return canvas;
    }
}

// --- Dark-panel second pass ---------------------------------------------------
// A single manga page routinely mixes black-on-white bubbles with white-on-black
// boxes (a black caption box on an otherwise light page, an inverted SFX panel,
// etc.). Recognizers are tuned for dark-on-light, so the white-on-black regions
// often come back empty. Inverting the WHOLE page would just swap the problem, so
// instead — only when the page actually contains a meaningful dark area — we run a
// second, inverted recognition concurrently with the normal one and merge the
// lines that fall in genuinely dark regions of the original. The normal pass keeps
// the light bubbles; the inverted pass recovers the dark ones; concurrency hides
// the extra round-trip. Bright/normal pages skip the second pass entirely.

const DARK_FIELD_SIZE = 48;
const DARK_LUMINANCE = 90;            // a pixel this dark could be hiding light text
const DARK_REGION_TRIGGER = 0.1;      // ≥10% of the page is dark → worth a second pass
const DARK_LINE_MEAN_LUMINANCE = 110; // only trust inverted lines over dark originals

export interface LuminanceField { size: number; lum: Uint8Array }

function buildLuminanceField(image: HTMLImageElement): LuminanceField | null {
    try {
        if (!image.naturalWidth || !image.naturalHeight) return null;
        const size = DARK_FIELD_SIZE;
        const sample = document.createElement('canvas');
        sample.width = size;
        sample.height = size;
        const context = sample.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        const lum = new Uint8Array(size * size);
        let opaque = 0;
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
            if (data[i + 3] >= 8) opaque++;
            lum[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
        }
        // A mostly-transparent sample means the canvas wasn't really drawn (an
        // overlay surface, or an environment without real 2D rasterization) — we
        // can't judge darkness, so skip the second pass rather than treat "all
        // zero" as a black page.
        if (opaque < lum.length * 0.5) return null;
        return { size, lum };
    } catch {
        return null;
    }
}

function luminanceFieldDarkFraction(field: LuminanceField): number {
    let dark = 0;
    for (const value of field.lum) if (value < DARK_LUMINANCE) dark++;
    return dark / field.lum.length;
}

function regionMeanLuminance(field: LuminanceField, box: OcrRect, width: number, height: number): number {
    if (width <= 0 || height <= 0) return 255;
    const x0 = Math.max(0, Math.floor((box.left / width) * field.size));
    const x1 = Math.min(field.size, Math.ceil(((box.left + box.width) / width) * field.size));
    const y0 = Math.max(0, Math.floor((box.top / height) * field.size));
    const y1 = Math.min(field.size, Math.ceil(((box.top + box.height) / height) * field.size));
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) { sum += field.lum[y * field.size + x]; count++; }
    }
    return count ? sum / count : 255;
}

// True when the page's dark cells are mostly already covered by normal-pass text
// boxes — meaning the recognizer read the dark region and no inverted pass is
// needed. Empty/uncovered dark areas (a black caption box the normal pass skipped)
// return false, triggering the second pass.
function darkAreaIsRead(field: LuminanceField, normal: OcrResult | null): boolean {
    const size = field.size;
    let darkTotal = 0;
    let darkCovered = 0;
    const lines = normal?.lines ?? [];
    const width = normal?.width || 1;
    const height = normal?.height || 1;
    const cellRects = lines.map(line => ({
        x0: Math.floor((line.box.left / width) * size),
        x1: Math.ceil(((line.box.left + line.box.width) / width) * size),
        y0: Math.floor((line.box.top / height) * size),
        y1: Math.ceil(((line.box.top + line.box.height) / height) * size),
    }));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (field.lum[y * size + x] >= DARK_LUMINANCE) continue;
            darkTotal++;
            if (cellRects.some(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) darkCovered++;
        }
    }
    if (!darkTotal) return true;
    return darkCovered / darkTotal >= 0.5;
}

function boxesOverlapSignificantly(a: OcrRect, b: OcrRect): boolean {
    const ix = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    const intersection = ix * iy;
    if (intersection <= 0) return false;
    const minArea = Math.min(a.width * a.height, b.width * b.height) || 1;
    return intersection / minArea >= 0.5;
}

// Merge an inverted-pass result into the normal one: keep every inverted line that
// (a) doesn't duplicate a normal line and (b) sits over a dark region of the
// original — so we add recovered white-on-black text without trusting inverted
// readings of already-light areas (which would be noise).
export function mergeDarkPassResult(normal: OcrResult | null, inverted: OcrResult | null, field: LuminanceField | null): OcrResult | null {
    if (!inverted?.lines.length) return normal;
    if (!normal) {
        const darkOnly = field
            ? inverted.lines.filter(line => regionMeanLuminance(field, line.box, inverted.width, inverted.height) < DARK_LINE_MEAN_LUMINANCE)
            : inverted.lines;
        return darkOnly.length ? { width: inverted.width, height: inverted.height, lines: darkOnly } : null;
    }
    const lines = [...normal.lines];
    for (const line of inverted.lines) {
        if (field && regionMeanLuminance(field, line.box, inverted.width, inverted.height) >= DARK_LINE_MEAN_LUMINANCE) continue;
        if (lines.some(existing => boxesOverlapSignificantly(existing.box, line.box))) continue;
        lines.push(line);
    }
    return { width: normal.width, height: normal.height, lines };
}

function drawImageToCanvas(image: HTMLImageElement, maxPixels: number): HTMLCanvasElement {
    const size = loadedImageSize(image);
    const canvas = scaledCanvas(size, maxPixels);
    drawableCanvasContext(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function loadedImageSize(image: HTMLImageElement): { width: number; height: number } {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('Image is not loaded yet.');
    return { width, height };
}

function scaledCanvas(size: { width: number; height: number }, maxPixels: number): HTMLCanvasElement {
    const scale = Math.min(1, Math.sqrt(Math.max(160000, maxPixels) / (size.width * size.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(size.width * scale));
    canvas.height = Math.max(1, Math.round(size.height * scale));
    return canvas;
}

function drawableCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    return context;
}

function assertCanvasReadable(canvas: HTMLCanvasElement): void {
    canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
}

function createGoogleLensRequest(imageBytes: Uint8Array, width: number, height: number, locale: string): Uint8Array {
    const [language = 'ja', region = 'US'] = (locale || 'ja-JP').split(/[-_]/);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const requestId = protoMessage(
        protoVarintField(1, BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))),
        protoVarintField(2, 1),
        protoVarintField(3, 1),
        protoBytesField(4, randomBytes(16)),
    );
    const localeContext = protoMessage(
        protoStringField(1, language || 'ja'),
        protoStringField(2, region || 'US'),
        protoStringField(3, timeZone),
    );
    const clientFilters = protoMessage(protoMessageField(1, protoMessage(protoVarintField(1, LENS_AUTO_FILTER))));
    const clientContext = protoMessage(
        protoVarintField(1, LENS_PLATFORM_WEB),
        protoVarintField(2, LENS_SURFACE_CHROMIUM),
        protoMessageField(4, localeContext),
        protoMessageField(17, clientFilters),
    );
    const requestContext = protoMessage(
        protoMessageField(3, requestId),
        protoMessageField(4, clientContext),
    );
    const imageData = protoMessage(
        protoMessageField(1, protoMessage(protoBytesField(1, imageBytes))),
        protoMessageField(3, protoMessage(protoVarintField(1, width), protoVarintField(2, height))),
    );
    return protoMessage(protoMessageField(1, protoMessage(
        protoMessageField(1, requestContext),
        protoMessageField(3, imageData),
    )));
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
    if (!settings.ocrEnabled || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
    const image = pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
    return image && isCandidateImage(image, settings) && shouldObserveImage(image, settings) ? image : null;
}

function ocrReaderSurfaceFromPointerEvent(event: Event, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    if (!settings.ocrEnabled || settings.ocrProvider === 'off' || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
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
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false;
    return Boolean(document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-jpdb-reader-root]'));
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
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    if (!element || element.closest('[data-jpdb-reader-root]')) return null;
    return element instanceof HTMLImageElement ? element : element.closest('img');
}

function pointerEventReaderSurfaceTarget(event: Event, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('[data-jpdb-reader-root]')) return null;
    return readerSurfaceFromElement(target, settings);
}

function pointerEventReaderSurfaceAtPoint(event: Event & Pick<PointerEvent, 'clientX' | 'clientY'>, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    if (element && !element.closest('[data-jpdb-reader-root]')) {
        const surface = readerSurfaceFromElement(element, settings);
        if (surface) return surface;
    }
    return readerSurfaceAtPoint(event.clientX, event.clientY, settings);
}

function readerSurfaceFromElement(element: Element, settings: ReaderSettings): HTMLCanvasElement | HTMLElement | null {
    const canvas = element instanceof HTMLCanvasElement ? element : element.closest<HTMLCanvasElement>('canvas');
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
        || isBrandOrIconOcrImage(image)
        || isYouTubeThumbnailImage(image));
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

function isInsideHiddenAncestor(element: Element): boolean {
    for (let current: Element | null = element.parentElement; current && current !== document.body; current = current.parentElement) {
        if (isHiddenByCss(current) || isHiddenByAttribute(current)) return true;
    }
    return false;
}

function isHiddenByCss(element: Element): boolean {
    const style = getComputedStyle(element);
    return style.visibility === 'hidden'
        || style.display === 'none'
        || Number(style.opacity || '1') <= 0;
}

function isHiddenByAttribute(element: Element): boolean {
    return element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden');
}

function mutationTouchesRenderableMedia(mutation: MutationRecord): boolean {
    if (mutation.type === 'childList') {
        return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsRenderableMedia);
    }
    return mutation.target instanceof Element && nodeContainsRenderableMedia(mutation.target);
}

function summarizeRenderableMediaMutations(mutations: MutationRecord[]): OcrRenderableMediaMutationSummary {
    let addedImage = false;
    let touched = false;
    for (const mutation of mutations) {
        if (!mutationTouchesRenderableMedia(mutation)) continue;
        touched = true;
        if (mutation.type === 'childList' && [...mutation.addedNodes].some(nodeContainsRenderableMedia)) addedImage = true;
        if (addedImage) break;
    }
    return { touched, addedImage };
}

function canAutoRefreshOcrAfterMutation(settings: ReaderSettings, shouldAutoScan: (() => boolean) | undefined): boolean {
    return settings.ocrAutoScanImages && (shouldAutoScan?.() !== false || hasCanvasOcrOptInSurface());
}

function nodeContainsRenderableMedia(node: Node): boolean {
    return node instanceof HTMLImageElement
        || node instanceof HTMLVideoElement
        || node instanceof HTMLCanvasElement
        || node instanceof HTMLSourceElement
        || (node instanceof HTMLElement && Boolean(backgroundImageReaderUrl(node)))
        || (node instanceof Element && Boolean(node.querySelector('img, video, source, canvas, [data-page-index], [style*="background-image"], [style*="background:"][style*="url("]')));
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

function rectsNearlyEqual(a: DOMRect, b: DOMRect): boolean {
    return Math.abs(a.left - b.left) <= 1
        && Math.abs(a.top - b.top) <= 1
        && Math.abs(a.width - b.width) <= 1
        && Math.abs(a.height - b.height) <= 1;
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
    return surfaces
        .filter(surface => isNearViewport(surface, margin))
        .sort((a, b) => elementViewportDistance(a) - elementViewportDistance(b))
        .slice(0, readerRasterMaxSurfaces(settings, userRequested));
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
    if (hideVideoFrameResumeControlBehindSubtitlePlayback(control, root)) return;
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

function setOcrArtifactPosition(element: HTMLElement, viewportLeft: number, viewportTop: number): void {
    const offset = ocrArtifactRootOffset(element);
    element.style.left = `${viewportLeft - offset.left}px`;
    element.style.top = `${viewportTop - offset.top}px`;
}

function ocrArtifactRootOffset(element: HTMLElement): { left: number; top: number } {
    if (element.dataset.yomuOcrFullscreenHosted !== 'true') return { left: 0, top: 0 };
    const root = element.parentElement;
    if (!root || root === document.body || root === document.documentElement) return { left: 0, top: 0 };
    const rect = root.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
}

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
    return /(^|\.)youtube\.com$/i.test(location.hostname) || /(^|\.)youtu\.be$/i.test(location.hostname);
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

function hideVideoFrameResumeControlBehindSubtitlePlayback(control: HTMLElement, root: HTMLElement): boolean {
    const rail = subtitleRailForOcrRoot(root);
    const playback = rail?.querySelector<HTMLButtonElement>('[data-action="playback"]');
    if (!rail?.isConnected || !playback || playback.hidden || playback.disabled) return false;
    const oldRoot = subtitlePlayerRoot(control);
    removeOcrArtifact(control);
    control.classList.remove('jpdb-ocr-video-frame-resume-fallback');
    control.dataset.yomuOcrFullscreenHosted = 'false';
    control.style.left = '';
    control.style.top = '';
    updateSubtitleRailResumeState(oldRoot);
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

function imageCacheKey(image: HTMLImageElement): string {
    // Canvas/background reader frames carry a stable per-page content key so the OCR
    // cache hits when a page is revisited, instead of re-OCRing the re-encoded
    // data-URL. Ordinary images key on their source URL + intrinsic size as before.
    const contentKey = image.dataset?.ocrContentKey;
    if (contentKey) return contentKey;
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
}

function ocrResultTextKey(result: OcrResult | undefined): string {
    return result?.lines.map(line => line.text).join('\n') ?? '';
}

function readerRasterSurfaceSnapshotKey(surface: HTMLCanvasElement | HTMLElement): string {
    return surface instanceof HTMLCanvasElement ? canvasSurfaceSnapshotKey(surface) : backgroundSurfaceCacheKey(surface);
}

// Per-canvas identity of the page currently painted into this surface: the viewer's
// page counter (a turn pre-signal, caught before the mirror records the new page) plus
// the canvas's own content (pixel hash / mirror source fingerprint) and intrinsic size.
// Deliberately NOT the full page signature or live rect: the async mirror/screenshot
// capture spans many frames, during which the viewer repaints other canvases and bumps
// the shared epoch, and in vertical mode the rect scrolls. Embedding any of those made
// the post-capture key recompute differently and discarded the fresh frame every time
// (the empty OCR layers on cty=2). This key moves only when THIS canvas shows a
// different page, so a capture lands and survives the surrounding epoch churn.
// Repositioning on scroll/zoom is handled separately, so dropping the rect costs nothing.
function canvasSurfaceSnapshotKey(canvas: HTMLCanvasElement): string {
    const viewportId = canvas.closest<HTMLElement>('[id^="viewport"]')?.id ?? '';
    return [
        canvasReaderPageCounter(),
        viewportId,
        canvas.width,
        canvas.height,
        canvasPageContentToken(canvas),
    ].join('|');
}

function canvasContentReadinessKey(canvas: HTMLCanvasElement): string {
    const rect = canvas.getBoundingClientRect();
    const viewportId = canvas.closest<HTMLElement>('[id^="viewport"]')?.id ?? '';
    return [
        viewportId,
        canvas.width,
        canvas.height,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
    ].join('|');
}

function isSameCanvasReaderPageLocation(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return previousParts.counter === nextParts.counter
        && previousParts.scroll === nextParts.scroll
        && previousParts.backgrounds === nextParts.backgrounds;
}

function isCanvasMirrorEpochTransition(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    if (previousParts.content === nextParts.content) return false;
    return isCanvasMirrorEpochOrEmpty(previousParts.content) && isCanvasMirrorEpochOrEmpty(nextParts.content);
}

function hasSameStableCanvasReaderPageCounter(previous: string, next: string): boolean {
    const previousParts = splitCanvasReaderSignature(previous);
    const nextParts = splitCanvasReaderSignature(next);
    if (!previousParts || !nextParts) return false;
    return previousParts.counter !== '' && previousParts.counter === nextParts.counter;
}

function shouldTrustStableBookwalkerPageCounter(): boolean {
    if (!isBookwalkerViewerHost()) return false;
    try {
        return new URL(location.href).searchParams.get('cty') !== '2';
    } catch {
        return true;
    }
}

function isCanvasMirrorEpochOrEmpty(content: string): boolean {
    return content === '' || /^\d+(?:,\d+)*$/.test(content);
}

function splitCanvasReaderSignature(signature: string): {
    backgrounds: string;
    content: string;
    counter: string;
    scroll: string;
    surfaces: string;
} | null {
    const parts = signature.split('|');
    if (parts.length < 5) return null;
    const [counter, scroll, surfaces, content, ...backgroundParts] = parts;
    return {
        backgrounds: backgroundParts.join('|'),
        content: content ?? '',
        counter: counter ?? '',
        scroll: scroll ?? '',
        surfaces: surfaces ?? '',
    };
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

function protoMessage(...parts: Uint8Array[]): Uint8Array {
    return concatBytes(parts);
}

function protoMessageField(field: number, value: Uint8Array): Uint8Array {
    return concatBytes([protoTag(field, 2), encodeVarint(value.length), value]);
}

function protoBytesField(field: number, value: Uint8Array): Uint8Array {
    return protoMessageField(field, value);
}

function protoStringField(field: number, value: string): Uint8Array {
    return protoBytesField(field, new TextEncoder().encode(value));
}

function protoVarintField(field: number, value: number | bigint): Uint8Array {
    return concatBytes([protoTag(field, 0), encodeVarint(value)]);
}

function protoTag(field: number, wire: number): Uint8Array {
    return encodeVarint((field << 3) | wire);
}

function encodeVarint(value: number | bigint): Uint8Array {
    let item = BigInt(value);
    const bytes: number[] = [];
    do {
        let byte = Number(item & 0x7fn);
        item >>= 7n;
        if (item) byte |= 0x80;
        bytes.push(byte);
    } while (item);
    return new Uint8Array(bytes);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

function requestJson(url: string, data: string, timeout: number): Promise<unknown> {
    const userscriptRequest = requestViaUserscript({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        data,
        responseType: 'json',
        timeout,
    }, response => response.response ?? (response.responseText ? JSON.parse(response.responseText) : null), status => `OCR endpoint returned ${status}.`, 'OCR timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetchJsonWithTimeout(url, data, timeout)
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
}

function fetchJsonWithTimeout(url: string, data: string, timeout: number): Promise<Response> {
    if (!timeout) return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data });
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeout);
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, signal: controller.signal })
        .catch(error => {
            if (timedOut || isAbortError(error)) throw new Error('OCR timed out.');
            throw error;
        })
        .finally(() => window.clearTimeout(timeoutId));
}

function requestArrayBuffer(url: string, data: Uint8Array, timeout: number): Promise<ArrayBuffer> {
    const body = new Uint8Array(data);
    const headers = {
        'content-type': 'application/x-protobuf',
        'x-goog-api-key': GOOGLE_LENS_API_KEY,
        accept: '*/*',
        'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    };
    const userscriptRequest = requestViaUserscript<ArrayBuffer>({
        method: 'POST',
        url,
        headers,
        data: body.buffer as ArrayBuffer,
        responseType: 'arraybuffer',
        timeout,
    }, response => response.response as ArrayBuffer, status => `Google Lens returned ${status}.`, 'Google Lens timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetch(url, {
        method: 'POST',
        headers,
        body: body.buffer,
    }).then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
}

function requestTextForm(url: string, data: FormData, timeout: number, headers?: Record<string, string>): Promise<string> {
    const userscriptRequest = requestViaUserscript({
        method: 'POST',
        url,
        ...(headers ? { headers } : {}),
        data,
        responseType: 'text',
        timeout,
    }, response => String(response.responseText ?? response.response ?? ''), status => `Google Lens upload returned ${status}.`, 'Google Lens upload timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetch(url, { method: 'POST', body: data })
        .then(response => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}

function requestBlob(url: string): Promise<Blob> {
    const fallbackType = imageMimeTypeFromUrl(url);
    const userscriptRequest = requestViaUserscript<Blob>({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
    }, response => blobFromUserscriptResponse(response, fallbackType), status => `Image fetch returned ${status}.`);
    if (userscriptRequest) return userscriptRequest;
    return fetch(url).then(response => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
}

// GM_xmlhttpRequest now returns an arraybuffer (not a typed Blob), and the reader turns
// these bytes into a blob: object-URL <img> to decode (loadCleanMirrorImage, used by the
// BookWalker canvas mirror, and imageBlobToCanvas for any tainted cross-origin image).
// WebKit/Safari REFUSES to decode an <img> whose backing Blob has no (or a non-image)
// MIME type — Chrome/Firefox content-sniff and tolerate it — so a typeless Blob silently
// breaks tainted-canvas OCR on iPad (no frame, no spinner, no overlay). Carry an image
// MIME type: sniff the magic bytes (most reliable), else infer from the URL extension.
export function blobFromUserscriptResponse(response: UserscriptHttpResponse, fallbackType = 'image/jpeg'): Blob {
    const value = response.response;
    if (value instanceof Blob) return value.type ? value : new Blob([value], { type: fallbackType });
    if (value instanceof ArrayBuffer) {
        const head = new Uint8Array(value, 0, Math.min(16, value.byteLength));
        return new Blob([value], { type: sniffImageMimeType(head) ?? fallbackType });
    }
    if (ArrayBuffer.isView(value)) {
        const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const copy = new Uint8Array(source.byteLength);
        copy.set(source);
        return new Blob([copy.buffer], { type: sniffImageMimeType(copy.subarray(0, 16)) ?? fallbackType });
    }
    return new Blob([value as BlobPart], { type: fallbackType });
}

export function imageMimeTypeFromUrl(url: string): string {
    const extension = url.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'avif': return 'image/avif';
        case 'bmp': return 'image/bmp';
        default: return 'image/jpeg';
    }
}

// Detect an image type from leading magic bytes (URL extensions and headers can lie or be
// absent). Returns undefined when the bytes match no known image signature.
export function sniffImageMimeType(bytes: Uint8Array): string | undefined {
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return undefined;
}

function requestViaUserscript<T>(
    options: Parameters<UserscriptHttpRequest>[0],
    readResponse: (response: UserscriptHttpResponse) => T,
    statusMessage: (status: number) => string,
    timeoutMessage?: string,
): Promise<T> | null {
    const userscriptRequest = getUserscriptHttpRequest();
    if (!userscriptRequest) {
        // The userscript HTTP request is the only way to fetch cross-origin OCR / DRM
        // page assets (a plain fetch is CORS-blocked). If no manager exposes one, OCR
        // fails silently; warn once so the cause is diagnosable, not a blank page.
        log.warnOnce('no-userscript-http-request', 'No userscript HTTP request (GM_xmlhttpRequest / GM.xmlHttpRequest) available — cross-origin OCR/image fetch is blocked. Grant GM.xmlHttpRequest in the userscript manager.');
        return null;
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const onload = (response: UserscriptHttpResponse): void => {
            if (settled) return;
            settled = true;
            if (isSuccessfulHttpStatus(response.status)) resolve(readResponse(response));
            else reject(new Error(statusMessage(response.status)));
        };
        const fail = (error: unknown): void => { if (!settled) { settled = true; reject(error instanceof Error ? error : new Error(String(error || 'Request failed.'))); } };
        const result = userscriptRequest({
            ...options,
            onload,
            onerror: fail,
            ...(timeoutMessage ? { ontimeout: () => fail(new Error(timeoutMessage)) } : {}),
        });
        // GM4 / the Safari "Userscripts" extension: GM.xmlHttpRequest can RESOLVE a
        // promise instead of (or as well as) firing onload. Bridge that so a
        // promise-only manager isn't left hanging until the 30s timeout (which broke
        // OCR + the BookWalker mirror image fetch on those harnesses).
        if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
            (result as Promise<UserscriptHttpResponse>).then(onload, fail);
        }
    });
}

function isSuccessfulHttpStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed.'));
        image.src = url;
    });
}

// Fetch a page's scrambled source image as an origin-clean bitmap (GM_xmlhttpRequest
// bypasses the CDN's missing CORS), so the canvas mirror can redraw the engine's
// descramble tiles without tainting. Returns undefined for unfetchable URLs.
async function loadCleanMirrorImage(url: string): Promise<HTMLImageElement | undefined> {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return undefined;
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
        return await loadImage(objectUrl);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image encoding failed.')), type, quality);
    });
}

function imageSummary(image: HTMLImageElement): Record<string, unknown> {
    return {
        host: safeHost(image.currentSrc || image.src),
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        altLength: image.alt?.length ?? 0,
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

function localOcrEndpointUrl(settings: ReaderSettings): string {
    return settings.ocrEndpointUrl.trim() || DEFAULT_LOCAL_OCR_ENDPOINT_URL;
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

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return 'inline-or-invalid';
    }
}
