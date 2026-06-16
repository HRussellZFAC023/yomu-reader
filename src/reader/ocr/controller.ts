import { escapeHtml, renderRuby, renderTokensToHtml, setInnerHtml, shouldRenderRuby } from '../dom/index';
import { normalizeOcrRenderedText } from './rendered-text';
import {
    backgroundImageReaderUrl,
    canvasReaderPageSignature,
    captureCanvasDataUrl,
    collectBackgroundImageReaderSurfaces,
    collectCanvasReaderSurfaces,
    isReaderRasterPage,
    looksLikeRenderedCanvasImage,
    positionCanvasFrameImage,
} from './canvas-readers';
import { uiText, type UiCopyKey } from '../app/i18n';
import { waitForIdle } from '../platform/idle';
import { readBlobAsDataUrl } from '../core/blob-data-url';
import { Logger } from '../app/logger';
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

type OcrRecognizer = (image: HTMLImageElement, settings: ReaderSettings) => Promise<OcrResult | null>;
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
}

interface OcrWordRenderState {
    surface: string;
    token: JPDBToken;
}

const MAX_CACHE_ITEMS = 36;
const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15000;
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
const DEFAULT_LOCAL_OCR_ENDPOINT_URL = 'http://127.0.0.1:7331/ocr';
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
const log = Logger.scope('OCR');
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

export class ImageOcrController {
    private states = new Map<HTMLImageElement, ImageState>();
    private cache = new Map<string, OcrResult | null>();
    private localOcrUnavailable?: { endpointUrl: string; retryAt: number };
    private observer?: IntersectionObserver;
    private observerMargin = '';
    private mutationObserver?: MutationObserver;
    private queue: HTMLImageElement[] = [];
    private busy = false;
    private positionFrame = 0;
    private refreshTimer = 0;
    private lastPointerMoveImage?: HTMLImageElement;
    private lastPointerMoveReaderSurface?: Element;
    private videoFrames = new Map<HTMLVideoElement, HTMLImageElement>();
    private videoFrameVideos = new Map<HTMLImageElement, HTMLVideoElement>();
    private videoFrameControls = new Map<HTMLVideoElement, HTMLElement>();
    private videoFrameStatuses = new Map<HTMLVideoElement, HTMLElement>();
    // Compact loading/ready indicators for every OCR'd image (not just
    // paused-video frames), so slow image OCR shows progress without a card.
    private imageStatuses = new Map<HTMLImageElement, HTMLElement>();
    // Reader raster snapshots (BookWalker/ComicWalker canvases and Mokuro CSS
    // background pages): map each page surface to the invisible <img> we OCR in
    // its place, plus the page fingerprint and the page-turn poll.
    private canvasFrames = new Map<HTMLCanvasElement, HTMLImageElement>();
    private canvasFrameSources = new Map<HTMLImageElement, HTMLCanvasElement>();
    private backgroundFrames = new Map<HTMLElement, HTMLImageElement>();
    private backgroundFrameSources = new Map<HTMLImageElement, HTMLElement>();
    private backgroundFrameKeys = new Map<HTMLElement, string>();
    private canvasReaderSignature?: string;
    private readerRasterPoll = 0;
    private readonly ocrWordRenderStates = new WeakMap<HTMLElement, OcrWordRenderState>();
    private readonly handleMediaPause = (event: Event) => this.snapshotPausedVideo(event.target);
    private readonly handleMediaResume = (event: Event) => this.releaseVideoFrame(event.target);
    // Stepping subtitle lines while paused seeks the video — the snapshot
    // must follow the new frame instead of showing the stale one.
    private readonly handleMediaSeeked = (event: Event) => this.refreshVideoFrameAfterSeek(event.target);
    private readonly handleDocumentPointerDown = (event: Event) => {
        this.unpinOcrLinesFromDocumentEvent(event);
        this.requestOcrFromPointerEvent(event);
    };
    private readonly handleDocumentPointerOver = (event: Event) => this.requestOcrFromPointerEvent(event);
    private readonly handleDocumentPointerMove = (event: Event) => this.requestOcrFromPointerEvent(event);
    private readonly handleDocumentClick = (event: Event) => this.unpinOcrLinesFromDocumentEvent(event);
    private readonly handleDocumentScroll = () => this.handleOcrViewportShift(120);
    private readonly handleWindowScroll = () => this.handleOcrViewportShift(240);
    private readonly handleWindowResize = () => this.handleOcrViewportShift(300);
    private readonly handleSpaNavigation = () => this.teardownForNavigation();

    constructor(private readonly options: OcrControllerOptions) {}

    init(): void {
        this.refresh();
        document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
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
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'src', 'srcset', 'sizes', 'loading', 'poster'],
        });
        this.startReaderRasterPollingIfNeeded();
    }

    destroy(): void {
        document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
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
        for (const eventName of OCR_NAVIGATION_EVENTS) {
            window.removeEventListener(eventName, this.handleSpaNavigation);
        }
        this.releaseAllVideoFrames();
        this.releaseAllCanvasFrames();
        this.releaseAllBackgroundFrames();
        if (this.readerRasterPoll) { window.clearInterval(this.readerRasterPoll); this.readerRasterPoll = 0; }
        this.mutationObserver?.disconnect();
        if (this.positionFrame) cancelAnimationFrame(this.positionFrame);
        this.clear();
    }

    refresh(options: { userRequested?: boolean } = {}): void {
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled) {
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
            .slice(0, settings.ocrMaxImagesPerPage);
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
            && isNearViewport(image, settings.ocrPrefetchMargin);
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
        const rootMargin = `${settings.ocrPrefetchMargin}px 0px`;
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
                if (current.ocrAutoScanImages && isCandidateImage(image, current) && shouldObserveImage(image, current)) this.enqueue(image);
            }
        }, { rootMargin });
    }

    private ensureState(image: HTMLImageElement): ImageState {
        const existing = this.states.get(image);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';

        document.body.append(overlay);

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
        if (userRequested) void this.renderResult(state, state.result, true);
        return true;
    }

    private requestOcrFromPointerEvent(event: Event): void {
        const settings = this.options.getSettings();
        const image = ocrImageFromPointerEvent(event, settings);
        if (image) {
            if (event.type === 'pointermove' && image === this.lastPointerMoveImage) return;
            if (event.type === 'pointermove') this.lastPointerMoveImage = image;
            else this.lastPointerMoveImage = undefined;
            this.lastPointerMoveReaderSurface = undefined;
            this.enqueue(image, true);
            return;
        }
        const surface = ocrReaderSurfaceFromPointerEvent(event, settings);
        if (!surface) return;
        if (event.type === 'pointermove' && surface === this.lastPointerMoveReaderSurface) return;
        if (event.type === 'pointermove') this.lastPointerMoveReaderSurface = surface;
        else this.lastPointerMoveReaderSurface = undefined;
        const frame = this.snapshotReaderSurface(surface, settings);
        if (frame) this.enqueue(frame, true);
    }

    private snapshotReaderSurface(surface: HTMLCanvasElement | HTMLElement, settings: ReaderSettings): HTMLImageElement | undefined {
        if (surface instanceof HTMLCanvasElement) {
            this.snapshotCanvasSurface(surface, settings);
            return this.canvasFrames.get(surface);
        }
        this.snapshotBackgroundImageSurface(surface, settings);
        return this.backgroundFrames.get(surface);
    }

    private queueImageForOcr(image: HTMLImageElement): void {
        if (!this.queue.includes(image)) this.queue.push(image);
    }

    private drainQueue(): void {
        if (this.busy) return;
        const image = this.queue.shift();
        if (!image) return;
        this.busy = true;
        const hasFastText = Boolean(readFallbackOcrResult(image, false));
        const delay = this.states.get(image)?.overlayRequested || hasFastText ? 0 : 900;
        void waitForIdle(delay, delay)
            .then(() => this.scanImage(image))
            .finally(() => {
                this.busy = false;
                this.drainQueue();
            });
    }

    private async scanImage(image: HTMLImageElement): Promise<void> {
        const state = this.states.get(image) ?? this.ensureState(image);
        const settings = this.options.getSettings();
        const key = imageCacheKey(image);
        const manualRequested = state.manualRequested;
        this.resetStateIfImageChanged(state);
        if (await this.renderCachedOcrResult(state, key)) return;

        this.updateOcrStatus(image, 'loading');
        const scan = beginOcrScan(state, image, settings, manualRequested);

        try {
            await this.scanUncachedImage(state, image, key, settings, scan.provider, manualRequested);
        } catch (error) {
            await this.renderOcrFailure(state, image, scan.provider, manualRequested, error);
        } finally {
            finishOcrScan(state);
            scan.done();
        }
    }

    private async renderCachedOcrResult(state: ImageState, key: string): Promise<boolean> {
        if (!this.cache.has(key)) return false;
        const cached = this.cache.get(key);
        if (!cached) {
            renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'empty');
            state.manualRequested = false;
            return true;
        }
        await this.renderResult(state, cached);
        state.manualRequested = false;
        return true;
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
        const result = inlineFallback ?? providerResult;
        if (!result?.lines.length) {
            this.remember(key, null);
            renderNoOcrLines(state);
            this.updateOcrStatus(image, 'empty');
            return;
        }

        this.remember(key, result);
        state.key = key;
        await this.renderResult(state, result);
        log.info('OCR result rendered', { provider, lines: result.lines.length, manualRequested });
    }

    private async renderOcrFailure(
        state: ImageState,
        image: HTMLImageElement,
        provider: string,
        manualRequested: boolean,
        error: unknown,
    ): Promise<void> {
        const fallback = readFallbackOcrResult(image, false);
        if (fallback?.lines.length) {
            log.warn('OCR provider failed', { provider }, error);
            await this.renderResult(state, fallback);
            return;
        }
        logOcrFailure(state, provider, manualRequested, error);
        this.updateOcrStatus(image, 'failed');
    }

    private recognizeImage(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
        const recognizer = ocrRecognizer(settings);
        if (!recognizer) return Promise.resolve(null);
        if (settings.ocrProvider !== 'local-service') return recognizer(image, settings);
        return this.recognizeViaLocalServiceWithBackoff(image, settings, recognizer);
    }

    private async recognizeViaLocalServiceWithBackoff(
        image: HTMLImageElement,
        settings: ReaderSettings,
        recognizer: OcrRecognizer,
    ): Promise<OcrResult | null> {
        const endpointUrl = localOcrEndpointUrl(settings);
        if (this.isLocalOcrUnavailable(endpointUrl)) throw new LocalOcrUnavailableError(endpointUrl);
        try {
            const result = await recognizer(image, settings);
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

    private async renderResult(state: ImageState, result: OcrResult, forceOverlay = false): Promise<void> {
        state.result = result;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());

        const settings = this.options.getSettings();
        const showText = settings.ocrShowTextOverlay || forceOverlay;

        const initialParsed = await this.parseOcrLines(result.lines);
        const lines = cleanOcrLookupLines(result.lines, initialParsed);
        if (!lines.length) {
            renderNoOcrLines(state);
            this.updateOcrStatus(state.image, 'empty');
            return;
        }
        const parsed = ocrLinesChanged(result.lines, lines)
            ? await this.parseOcrLines(lines)
            : initialParsed;
        const sentence = lines.map(line => line.text).join('\n');
        const renderedTokens = lines.map((line, index) => ocrTokensWithFallbackGaps(
            line.text,
            parsed[index] ?? [],
            this.options.fallbackCardFromText ?? ocrFallbackCardFromText,
        ));
        const flatTokens = renderedTokens.flat();
        await this.options.enrichTokensBeforeRender?.(flatTokens);
        applyOcrOverlayStyle(state.overlay, settings);

        for (const [index, line] of lines.entries()) {
            state.overlay.append(this.renderOcrLineElement(state, result, line, renderedTokens[index] ?? [], sentence, showText, settings));
        }
        this.positionState(state.image);
        this.updateOcrStatus(state.image, 'ready');
        void Promise.resolve(this.options.enrichRenderedTokens?.(flatTokens, state.overlay)).finally(() => this.schedulePosition());
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
        element.addEventListener('click', event => this.toggleOcrLinePinned(state, element, event));
        return element;
    }

    private toggleOcrLinePinned(state: ImageState, element: HTMLElement, event: MouseEvent): void {
        if (element.dataset.pinned === 'true') {
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
        state.key = key;
        state.result = undefined;
        state.loading = false;
        state.overlayRequested = false;
        state.manualRequested = false;
        state.autoSkipped = false;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());
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
    }

    private schedulePosition(): void {
        if (this.positionFrame) return;
        this.positionFrame = requestAnimationFrame(() => {
            this.positionFrame = 0;
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
        if (!(target instanceof HTMLVideoElement) || this.videoFrames.has(target)) return;
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled || !settings.ocrVideoPauseFrames || settings.ocrProvider === 'off') return;
        if (isLikelyPausedVideoThumbnail(target)) return;
        const rect = target.getBoundingClientRect();
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(target, 0) || isHiddenByCss(target)) return;
        const dataUrl = (this.options.captureVideoFrame ?? captureVideoFrameDataUrl)(target);
        if (!dataUrl) return;
        const frame = document.createElement('img');
        frame.className = 'jpdb-ocr-video-frame';
        frame.dataset.yomuVideoFrame = 'true';
        frame.alt = '';
        positionVideoFrameImage(frame, rect, target);
        frame.addEventListener('load', () => {
            if (this.videoFrames.get(target) === frame) this.enqueue(frame, true);
        }, { once: true });
        frame.src = dataUrl;
        document.body.append(frame);
        this.videoFrames.set(target, frame);
        this.videoFrameVideos.set(frame, target);
        const status = this.createVideoFrameStatus('loading');
        this.videoFrameStatuses.set(target, status);
        positionVideoFrameStatus(status, rect, target);
        // Paused-frame escape hatch: recognized text areas swallow clicks for
        // lookups, so on text-dense frames the player itself becomes hard to
        // reach. Keep playback control in the existing video rail when it is
        // available, with a compact fallback for pages without that rail.
        const resume = this.createVideoFrameResumeControl(target);
        this.videoFrameControls.set(target, resume);
        positionVideoFrameResumeControl(resume, rect, target);
        this.schedulePosition();
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
        this.setVideoFrameStatus(element, status);
        document.body.append(element);
        return element;
    }

    private setVideoFrameStatus(element: HTMLElement, status: OcrVideoFrameStatus): void {
        const language = this.options.getSettings().interfaceLanguage;
        const label = uiText(language, videoFrameStatusTextKey(status));
        element.dataset.status = status;
        element.className = `jpdb-ocr-video-frame-status jpdb-ocr-video-frame-status-${status}`;
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
        this.updateVideoFrameStatusForImage(image, status);
        this.updateImageStatusCard(image, status);
    }

    private updateImageStatusCard(image: HTMLImageElement, status: OcrVideoFrameStatus): void {
        if (this.videoFrameVideos.has(image)) return; // already shown over its video
        if (!this.options.getSettings().ocrEnabled) return;
        const existing = this.imageStatuses.get(image);
        // No recognizable text — drop the loader rather than linger on the image.
        if (status === 'empty') {
            existing?.remove();
            this.imageStatuses.delete(image);
            return;
        }
        const card = existing ?? this.createVideoFrameStatus(status);
        if (existing) this.setVideoFrameStatus(card, status);
        else this.imageStatuses.set(image, card);
        this.positionImageStatusCard(image, card);
    }

    private positionImageStatusCard(image: HTMLImageElement, card: HTMLElement): void {
        const rect = image.getBoundingClientRect();
        if (!isImageVisibleForOcr(image, rect)) { card.hidden = true; return; }
        card.hidden = false;
        positionOcrImageStatus(card, rect);
    }

    private removeImageStatusCard(image: HTMLImageElement): void {
        const card = this.imageStatuses.get(image);
        if (!card) return;
        card.remove();
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
        status?.remove();
        this.videoFrameStatuses.delete(target);
        const state = this.states.get(frame);
        if (state) {
            this.observer?.unobserve(frame);
            state.overlay.remove();
            this.states.delete(frame);
        }
        this.videoFrameVideos.delete(frame);
        this.queue = this.queue.filter(queued => queued !== frame);
        frame.remove();
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
        if (!settings.ocrAutoScanImages && !userRequested) return;
        if (!isReaderRasterPage()) {
            this.releaseAllCanvasFrames();
            return;
        }
        this.startReaderRasterPollingIfNeeded();
        const signature = canvasReaderPageSignature();
        if (signature !== this.canvasReaderSignature) {
            this.releaseAllCanvasFrames();
            this.canvasReaderSignature = signature;
        }
        const canvases = collectCanvasReaderSurfaces();
        for (const canvas of [...this.canvasFrames.keys()]) {
            if (!canvases.includes(canvas)) this.releaseCanvasFrame(canvas);
        }
        for (const canvas of canvases) {
            if (this.canvasFrames.has(canvas)) continue;
            this.snapshotCanvasSurface(canvas, settings);
        }
    }

    private snapshotCanvasSurface(canvas: HTMLCanvasElement, settings: ReaderSettings): void {
        if (this.canvasFrames.has(canvas)) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(canvas, settings.ocrPrefetchMargin) || isHiddenByCss(canvas)) return;
        if (!looksLikeRenderedCanvasImage(canvas)) return;
        const dataUrl = captureCanvasDataUrl(canvas, settings.ocrMaxImagePixels);
        if (!dataUrl) return;
        const frame = document.createElement('img');
        frame.className = 'jpdb-ocr-canvas-frame';
        frame.dataset.yomuCanvasFrame = 'true';
        frame.alt = '';
        positionCanvasFrameImage(frame, rect);
        frame.addEventListener('load', () => {
            if (this.canvasFrames.get(canvas) === frame) this.enqueue(frame, true);
        }, { once: true });
        frame.src = dataUrl;
        document.body.append(frame);
        this.canvasFrames.set(canvas, frame);
        this.canvasFrameSources.set(frame, canvas);
        this.schedulePosition();
    }

    private releaseCanvasFrame(canvas: HTMLCanvasElement): void {
        const frame = this.canvasFrames.get(canvas);
        if (!frame) return;
        this.canvasFrames.delete(canvas);
        const state = this.states.get(frame);
        if (state) {
            this.observer?.unobserve(frame);
            state.overlay.remove();
            this.states.delete(frame);
        }
        this.canvasFrameSources.delete(frame);
        this.queue = this.queue.filter(queued => queued !== frame);
        frame.remove();
    }

    private releaseAllCanvasFrames(): void {
        for (const canvas of [...this.canvasFrames.keys()]) this.releaseCanvasFrame(canvas);
        this.canvasReaderSignature = undefined;
    }

    private positionCanvasFrames(): void {
        for (const [canvas, frame] of [...this.canvasFrames]) {
            if (!canvas.isConnected) {
                this.releaseCanvasFrame(canvas);
                continue;
            }
            positionCanvasFrameImage(frame, canvas.getBoundingClientRect());
        }
    }

    private refreshBackgroundImageReaderSurfaces(settings: ReaderSettings, userRequested = false): void {
        if (!settings.ocrEnabled || settings.ocrProvider === 'off') return;
        if (!settings.ocrAutoScanImages && !userRequested) return;
        if (!isReaderRasterPage()) {
            this.releaseAllBackgroundFrames();
            return;
        }
        this.startReaderRasterPollingIfNeeded();
        const surfaces = collectBackgroundImageReaderSurfaces();
        for (const surface of [...this.backgroundFrames.keys()]) {
            const key = this.backgroundFrameKeys.get(surface);
            if (!surfaces.includes(surface) || key !== backgroundSurfaceCacheKey(surface)) this.releaseBackgroundFrame(surface);
        }
        for (const surface of surfaces) {
            if (this.backgroundFrames.has(surface)) continue;
            this.snapshotBackgroundImageSurface(surface, settings);
        }
    }

    private snapshotBackgroundImageSurface(surface: HTMLElement, settings: ReaderSettings): void {
        if (this.backgroundFrames.has(surface)) return;
        const url = backgroundImageReaderUrl(surface);
        if (!url) return;
        const rect = surface.getBoundingClientRect();
        if (rect.width * rect.height < settings.ocrMinImageArea) return;
        if (!isNearViewport(surface, settings.ocrPrefetchMargin) || isHiddenByCss(surface) || isInsideHiddenAncestor(surface)) return;
        const frame = document.createElement('img');
        frame.className = 'jpdb-ocr-background-frame';
        frame.dataset.yomuBackgroundFrame = 'true';
        frame.alt = '';
        frame.decoding = 'async';
        positionCanvasFrameImage(frame, rect);
        frame.addEventListener('load', () => {
            if (this.backgroundFrames.get(surface) === frame) this.enqueue(frame, true);
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
        if (state) {
            this.observer?.unobserve(frame);
            state.overlay.remove();
            this.states.delete(frame);
        }
        this.backgroundFrameSources.delete(frame);
        this.queue = this.queue.filter(queued => queued !== frame);
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
            positionVideoFrameImage(frame, rect, video);
            const resume = this.videoFrameControls.get(video);
            if (resume) positionVideoFrameResumeControl(resume, rect, video);
            const status = this.videoFrameStatuses.get(video);
            if (status) positionVideoFrameStatus(status, rect, video);
        }
    }

    private scheduleRefresh(delay: number): void {
        window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => this.refresh(), delay);
    }

    private positionState(image: HTMLImageElement): void {
        const state = this.states.get(image);
        if (!state) return;
        const rect = image.getBoundingClientRect();
        const visible = isImageVisibleForOcr(image, rect);
        state.overlay.hidden = !visible;
        if (!visible) return;
        state.overlay.style.left = `${rect.left}px`;
        state.overlay.style.top = `${rect.top}px`;
        state.overlay.style.width = `${rect.width}px`;
        state.overlay.style.height = `${rect.height}px`;
        this.fitLineFonts(state, renderedOcrImageFrame(image, rect, state.result));
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
        const padX = Math.max(4, Math.round(fontSize * 0.16));
        const padTop = hasFurigana ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(2, Math.round(fontSize * 0.08));
        const padBottom = Math.max(3, Math.round(fontSize * 0.1));
        element.style.setProperty('--jpdb-ocr-pad-x', `${padX}px`);
        element.style.setProperty('--jpdb-ocr-pad-top', `${padTop}px`);
        element.style.setProperty('--jpdb-ocr-pad-bottom', `${padBottom}px`);

        const contentRect = textElement.getBoundingClientRect();
        const contentWidth = Math.max(1, contentRect.width);
        const contentHeight = Math.max(1, contentRect.height);
        const minHitSize = Math.max(24, Math.round(fontSize * 1.25));
        const frameWidth = Math.min(frame.imageWidth, Math.max(boxWidth, minHitSize, contentWidth + padX * 2));
        const frameHeight = Math.min(frame.imageHeight, Math.max(boxHeight, minHitSize, contentHeight + padTop + padBottom));
        const minLeft = frame.imageLeft;
        const minTop = frame.imageTop;
        const maxLeft = Math.max(minLeft, frame.imageLeft + frame.imageWidth - frameWidth);
        const maxTop = Math.max(minTop, frame.imageTop + frame.imageHeight - frameHeight);
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
        for (const state of this.states.values()) {
            state.overlay.remove();
        }
        this.states.clear();
        for (const card of this.imageStatuses.values()) card.remove();
        this.imageStatuses.clear();
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
            this.observer?.unobserve(image);
            state.overlay.remove();
            this.states.delete(image);
            this.removeImageStatusCard(image);
        }
    }
}

function applyOcrOverlayStyle(overlay: HTMLElement, settings: ReaderSettings): void {
    overlay.style.setProperty('--jpdb-ocr-text-color', settings.ocrTextColor);
    overlay.style.setProperty('--jpdb-ocr-outline-color', settings.ocrOutlineColor);
    overlay.style.setProperty('--jpdb-ocr-background-rgba', accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity));
    overlay.style.setProperty('--jpdb-ocr-background-active-rgba', accentToRgba(settings.ocrBackgroundColor, Math.min(1, settings.ocrBackgroundOpacity + 0.12)));
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
        pitchClass: '',
        sentence,
    };
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

async function recognizeViaLocalService(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels);
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

async function recognizeViaCloudVision(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const apiKey = settings.ocrCloudVisionApiKey.trim();
    if (!apiKey) return null;
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels);
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

async function recognizeViaGoogleLens(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, 'image/jpeg', 0.88);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    try {
        const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, settings.audioTimeoutMs);
        return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
    } catch (error) {
        log.warn('Google Lens protobuf failed', error);
        return recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, settings.audioTimeoutMs);
    }
}

function ocrRecognizer(settings: ReaderSettings): OcrRecognizer | null {
    const recognizer = OCR_RECOGNIZERS[settings.ocrProvider] ?? null;
    return recognizer && isOcrProviderConfigured(settings) ? recognizer : null;
}

function isOcrProviderConfigured(settings: ReaderSettings): boolean {
    return OCR_PROVIDER_CONFIGURED[settings.ocrProvider]?.(settings) ?? false;
}

async function imageToBase64Payload(image: HTMLImageElement, maxPixels: number): Promise<{ base64: string; width: number; height: number }> {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, 'image/jpeg', 0.86);
    return { base64: (await readBlobAsDataUrl(blob, 'Blob read failed.')).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
}

async function imageToBlobPayload(image: HTMLImageElement, maxPixels: number, type: string, quality: number): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
    const canvas = await imageToCanvas(image, maxPixels);
    try {
        return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch {
        const fallbackCanvas = await imageBlobToCanvas(image, maxPixels);
        return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
}

async function recognizeViaGoogleLensUpload(blob: Blob, width: number, height: number, timeout: number): Promise<OcrResult | null> {
    const data = new FormData();
    data.append('encoded_image', blob, 'image.jpg');
    const response = await requestTextForm(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, data, timeout);
    return parseGoogleLensUploadHtml(response, width, height);
}

async function imageToCanvas(image: HTMLImageElement, maxPixels: number): Promise<HTMLCanvasElement> {
    try {
        const canvas = drawImageToCanvas(image, maxPixels);
        assertCanvasReadable(canvas);
        return canvas;
    } catch {
        return imageBlobToCanvas(image, maxPixels);
    }
}

async function imageBlobToCanvas(image: HTMLImageElement, maxPixels: number): Promise<HTMLCanvasElement> {
    const url = image.currentSrc || image.src;
    if (!url || url.startsWith('data:')) throw new Error('Image cannot be read by OCR.');
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
        const loaded = await loadImage(objectUrl);
        const canvas = drawImageToCanvas(loaded, maxPixels);
        assertCanvasReadable(canvas);
        return canvas;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
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
    if (!isNearViewport(image, settings.ocrPrefetchMargin)) return false;
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
    return pointerEventReaderSurfaceTarget(event, settings) ?? pointerEventReaderSurfaceAtPoint(event, settings);
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
    return settings.ocrAutoScanImages && shouldAutoScan?.() !== false;
}

function nodeContainsRenderableMedia(node: Node): boolean {
    return node instanceof HTMLImageElement
        || node instanceof HTMLVideoElement
        || node instanceof HTMLCanvasElement
        || node instanceof HTMLSourceElement
        || (node instanceof HTMLElement && Boolean(backgroundImageReaderUrl(node)))
        || (node instanceof Element && Boolean(node.querySelector('img, video, source, canvas, [data-page-index], [style*="background-image"], [style*="background:"][style*="url("]')));
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

function imageViewportDistance(image: HTMLImageElement): number {
    const rect = image.getBoundingClientRect();
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
    frame.style.left = `${content.left}px`;
    frame.style.top = `${content.top}px`;
    frame.style.width = `${content.width}px`;
    frame.style.height = `${content.height}px`;
}

function positionVideoFrameResumeControl(control: HTMLElement, rect: DOMRect, video: HTMLVideoElement): void {
    if (attachVideoFrameResumeControlToSubtitleRail(control)) return;
    attachVideoFrameResumeControlFallback(control);
    const content = videoContentBox(rect, video);
    control.style.left = `${content.left + content.width - 12}px`;
    control.style.top = `${content.top + 12}px`;
}

function positionVideoFrameStatus(status: HTMLElement, rect: DOMRect, video: HTMLVideoElement): void {
    const content = videoContentBox(rect, video);
    const maxWidth = Math.max(96, Math.min(Math.max(96, content.width - 24), 320));
    status.style.left = `${Math.max(8, content.left + 12)}px`;
    status.style.top = `${Math.max(8, content.top + 12)}px`;
    status.style.maxWidth = `${maxWidth}px`;
}

function positionOcrImageStatus(status: HTMLElement, rect: DOMRect): void {
    const maxWidth = Math.max(96, Math.min(Math.max(96, rect.width - 24), 320));
    status.style.left = `${Math.max(8, rect.left + 12)}px`;
    status.style.top = `${Math.max(8, rect.top + 12)}px`;
    status.style.maxWidth = `${maxWidth}px`;
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

function attachVideoFrameResumeControlToSubtitleRail(control: HTMLElement): boolean {
    const rail = document.querySelector<HTMLElement>('.jpdb-subtitle-player[data-jpdb-reader-root="true"] .jpdb-subtitle-rail');
    if (!rail?.isConnected) return false;
    const oldRoot = subtitlePlayerRoot(control);
    control.classList.remove('jpdb-ocr-video-frame-resume-fallback');
    control.style.left = '';
    control.style.top = '';
    const panelButton = rail.querySelector<HTMLElement>('.jpdb-subtitle-panel-toggle');
    if (control.parentElement !== rail) rail.insertBefore(control, panelButton ?? null);
    updateSubtitleRailResumeState(oldRoot);
    updateSubtitleRailResumeState(subtitlePlayerRoot(control));
    return true;
}

function attachVideoFrameResumeControlFallback(control: HTMLElement): void {
    const oldRoot = subtitlePlayerRoot(control);
    if (control.parentElement !== document.body) document.body.append(control);
    control.classList.add('jpdb-ocr-video-frame-resume-fallback');
    updateSubtitleRailResumeState(oldRoot);
}

function removeVideoFrameResumeControl(control: HTMLElement): void {
    const root = subtitlePlayerRoot(control);
    control.remove();
    updateSubtitleRailResumeState(root);
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
    const scale = Math.min(rect.width / intrinsicWidth, rect.height / intrinsicHeight);
    const width = intrinsicWidth * scale;
    const height = intrinsicHeight * scale;
    return {
        left: rect.left + (rect.width - width) / 2,
        top: rect.top + (rect.height - height) / 2,
        width,
        height,
    };
}

function imageCacheKey(image: HTMLImageElement): string {
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
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

function requestTextForm(url: string, data: FormData, timeout: number): Promise<string> {
    const userscriptRequest = requestViaUserscript({
        method: 'POST',
        url,
        data,
        responseType: 'text',
        timeout,
    }, response => String(response.responseText ?? response.response ?? ''), status => `Google Lens upload returned ${status}.`, 'Google Lens upload timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetch(url, { method: 'POST', body: data })
        .then(response => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}

function requestBlob(url: string): Promise<Blob> {
    const userscriptRequest = requestViaUserscript<Blob>({
        method: 'GET',
        url,
        responseType: 'blob',
    }, response => response.response as Blob, status => `Image fetch returned ${status}.`);
    if (userscriptRequest) return userscriptRequest;
    return fetch(url).then(response => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
}

function requestViaUserscript<T>(
    options: Parameters<UserscriptHttpRequest>[0],
    readResponse: (response: UserscriptHttpResponse) => T,
    statusMessage: (status: number) => string,
    timeoutMessage?: string,
): Promise<T> | null {
    const userscriptRequest = getUserscriptHttpRequest();
    if (!userscriptRequest) return null;
    return new Promise((resolve, reject) => {
        userscriptRequest({
            ...options,
            onload: response => isSuccessfulHttpStatus(response.status)
                ? resolve(readResponse(response))
                : reject(new Error(statusMessage(response.status))),
            onerror: reject,
            ...(timeoutMessage ? { ontimeout: () => reject(new Error(timeoutMessage)) } : {}),
        });
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
