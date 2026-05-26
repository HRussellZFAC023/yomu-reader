import { HAS_JAPANESE, escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { resolveUiLanguage, uiText } from './i18n';
import { waitForIdle } from './idle';
import { Logger } from './logger';
import { accentToRgba } from './settings';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

type OcrRecognizer = (image: HTMLImageElement, settings: ReaderSettings) => Promise<OcrResult | null>;

export interface OcrRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

type NullableOcrRect = { left: number | null; top: number | null; width: number | null; height: number | null };

export interface OcrLine {
    text: string;
    box: OcrRect;
    vertical: boolean;
}

export interface OcrResult {
    width: number;
    height: number;
    lines: OcrLine[];
}

interface ImageState {
    image: HTMLImageElement;
    overlay: HTMLElement;
    status: HTMLElement;
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

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string) => Promise<JPDBToken[]>;
    onToast: (message: string) => void;
    shouldAutoScan?: () => boolean;
    enrichPitchTokens?: (tokens: JPDBToken[]) => void;
}

const MAX_CACHE_ITEMS = 36;
const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15000;
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
const DEFAULT_LOCAL_OCR_ENDPOINT_URL = 'http://127.0.0.1:7331/ocr';
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
const LENS_WRITING_TOP_TO_BOTTOM = 2;
const OCR_KANA_ONLY_RE = /^[\u3040-\u30ffー・]+$/u;
const OCR_KANJI_RE = /[\u3400-\u9fff々〆]/u;
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

interface ProtoField {
    field: number;
    wire: number;
    value: bigint | number | string | Uint8Array;
}

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

function showOcrReadingStatus(state: ImageState, settings: ReaderSettings): void {
    state.status.hidden = false;
    state.status.textContent = uiText(settings.interfaceLanguage, 'ocrReadingImage');
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
    state.status.hidden = !state.overlayRequested;
    state.status.textContent = uiText(settings.interfaceLanguage, 'ocrReadingImage');
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
    state.status.textContent = '';
    state.status.hidden = true;
    state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());
}

function renderOcrErrorStatus(state: ImageState, settings: ReaderSettings, provider: string, manualRequested: boolean, error: unknown): void {
    state.status.textContent = ocrVisibleErrorMessage(settings, error);
    state.autoSkipped = !manualRequested;
    state.status.hidden = !state.overlayRequested || state.autoSkipped;
    if (isLocalOcrUnavailableError(error)) {
        log.warnOnce(`local-ocr-unavailable:${error.endpointUrl}`, 'Local OCR endpoint unavailable; pausing requests', { provider, endpoint: error.endpointUrl });
        return;
    }
    log.warn('OCR scan failed', { provider, manualRequested }, error);
}

function ocrVisibleErrorMessage(settings: ReaderSettings, error: unknown): string {
    if (settings.ocrProvider === 'local-service' && isLocalOcrConnectionError(error)) {
        return uiText(settings.interfaceLanguage, 'localOcrUnavailable');
    }
    if (resolveUiLanguage(settings.interfaceLanguage) === 'ja') return uiText(settings.interfaceLanguage, 'ocrFailed');
    return error instanceof Error ? error.message : uiText(settings.interfaceLanguage, 'ocrFailed');
}

export class ImageOcrController {
    private states = new Map<HTMLImageElement, ImageState>();
    private cache = new Map<string, OcrResult>();
    private localOcrUnavailable?: { endpointUrl: string; retryAt: number };
    private observer?: IntersectionObserver;
    private observerMargin = '';
    private mutationObserver?: MutationObserver;
    private queue: HTMLImageElement[] = [];
    private busy = false;
    private positionFrame = 0;
    private refreshTimer = 0;
    private lastPointerMoveImage?: HTMLImageElement;
    private readonly handleDocumentPointerDown = (event: Event) => {
        this.unpinOcrLinesFromDocumentEvent(event);
        this.requestOcrFromPointerEvent(event);
    };
    private readonly handleDocumentPointerOver = (event: Event) => this.requestOcrFromPointerEvent(event);
    private readonly handleDocumentPointerMove = (event: Event) => this.requestOcrFromPointerEvent(event);
    private readonly handleDocumentClick = (event: Event) => this.unpinOcrLinesFromDocumentEvent(event);

    constructor(private readonly options: OcrControllerOptions) {}

    init(): void {
        this.refresh();
        document.addEventListener('pointerdown', this.handleDocumentPointerDown, true);
        document.addEventListener('pointerover', this.handleDocumentPointerOver, true);
        document.addEventListener('pointermove', this.handleDocumentPointerMove, true);
        document.addEventListener('click', this.handleDocumentClick, true);
        window.addEventListener('scroll', () => {
            if (!this.options.getSettings().ocrEnabled) return;
            this.schedulePosition();
            this.scheduleRefresh(240);
        }, { passive: true });
        window.addEventListener('resize', () => {
            if (!this.options.getSettings().ocrEnabled) return;
            this.schedulePosition();
            this.scheduleRefresh(300);
        }, { passive: true });
        this.mutationObserver = new MutationObserver(mutations => {
            const settings = this.options.getSettings();
            if (!settings.ocrEnabled) return;
            let addedImage = false;
            let touched = false;
            for (const mutation of mutations) {
                if (!mutationTouchesRenderableMedia(mutation)) continue;
                touched = true;
                if (mutation.type === 'childList' && [...mutation.addedNodes].some(nodeContainsRenderableMedia)) addedImage = true;
                if (addedImage) break;
            }
            if (!touched) return;
            this.schedulePosition();
            if (!settings.ocrAutoScanImages || this.options.shouldAutoScan?.() === false) return;
            this.scheduleRefresh(addedImage ? 0 : 40);
        });
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'src', 'srcset', 'sizes', 'loading', 'poster'],
        });
    }

    destroy(): void {
        document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true);
        document.removeEventListener('pointerover', this.handleDocumentPointerOver, true);
        document.removeEventListener('pointermove', this.handleDocumentPointerMove, true);
        document.removeEventListener('click', this.handleDocumentClick, true);
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
        return !options.userRequested
            && (!settings.ocrAutoScanImages || this.options.shouldAutoScan?.() === false);
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
        return this.canAutoScanImage(settings)
            && isOcrImageStateIdle(state)
            && isNearViewport(image, settings.ocrPrefetchMargin);
    }

    private canAutoScanImage(settings: ReaderSettings): boolean {
        return settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false;
    }

    toggle(): void {
        const settings = this.options.getSettings();
        settings.ocrEnabled = !settings.ocrEnabled;
        this.options.onToast(uiText(settings.interfaceLanguage, settings.ocrEnabled ? 'ocrEnabledToast' : 'ocrHiddenToast'));
        this.refresh();
        log.info('OCR toggled', { enabled: settings.ocrEnabled });
    }

    async scanVisible(): Promise<void> {
        this.refresh({ userRequested: true });
        const images = [...this.states.keys()].filter(image => isNearViewport(image, 120));
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
                if (current.ocrAutoScanImages && shouldObserveImage(image, current)) this.enqueue(image);
            }
        }, { rootMargin });
    }

    private ensureState(image: HTMLImageElement): ImageState {
        const existing = this.states.get(image);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';

        const status = document.createElement('div');
        status.className = 'jpdb-ocr-status';
        status.dataset.jpdbReaderSurfaceIgnore = 'true';
        status.hidden = true;

        overlay.append(status);
        document.body.append(overlay);

        const state = { image, overlay, status, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
        image.addEventListener('load', () => {
            this.resetStateIfImageChanged(state);
            this.schedulePosition();
            this.scheduleRefresh(0);
        });
        this.states.set(image, state);
        if (image.complete && image.naturalWidth > 0) {
            this.schedulePosition();
            const settings = this.options.getSettings();
            if (settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false) this.enqueue(image);
        }
        return state;
    }

    private enqueue(image: HTMLImageElement, userRequested = false): void {
        const state = this.states.get(image) ?? this.ensureState(image);
        if (!this.shouldQueueOcrRequest(state, image, userRequested)) return;
        this.queueOcrRequest(image, state, userRequested);
    }

    private shouldQueueOcrRequest(state: ImageState, image: HTMLImageElement, userRequested: boolean): boolean {
        if (shouldSkipOcrRequest(state, userRequested)) return false;
        const forceExistingOverlay = userRequested && !state.overlayRequested;
        updateOcrRequestFlags(state, image, userRequested);
        if (this.renderExistingOcrResult(state, forceExistingOverlay)) return false;
        return !state.loading;
    }

    private queueOcrRequest(image: HTMLImageElement, state: ImageState, userRequested: boolean): void {
        this.queueImageForOcr(image);
        if (userRequested) showOcrReadingStatus(state, this.options.getSettings());
        this.drainQueue();
    }

    private renderExistingOcrResult(state: ImageState, userRequested: boolean): boolean {
        if (!state.result) return false;
        if (userRequested) void this.renderResult(state, state.result, true);
        return true;
    }

    private requestOcrFromPointerEvent(event: Event): void {
        const image = ocrImageFromPointerEvent(event, this.options.getSettings());
        if (!image) return;
        if (event.type === 'pointermove' && image === this.lastPointerMoveImage) return;
        if (event.type === 'pointermove') this.lastPointerMoveImage = image;
        else this.lastPointerMoveImage = undefined;
        this.enqueue(image, true);
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
        const cached = this.cache.get(key);
        if (!cached) return false;
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
            renderNoOcrLines(state);
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
            log.warn('OCR provider failed; rendered fallback metadata', { provider }, error);
            await this.renderResult(state, fallback);
            return;
        }
        renderOcrErrorStatus(state, this.options.getSettings(), provider, manualRequested, error);
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
        state.status.hidden = true;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());

        const settings = this.options.getSettings();
        const showText = settings.ocrShowTextOverlay || forceOverlay;

        const initialParsed = await this.parseOcrLines(result.lines, settings);
        const lines = cleanOcrLookupLines(result.lines, initialParsed);
        const parsed = ocrLinesChanged(result.lines, lines)
            ? await this.parseOcrLines(lines, settings)
            : initialParsed;
        const sentence = lines.map(line => line.text).join('\n');
        applyOcrOverlayStyle(state.overlay, settings);

        for (const [index, line] of lines.entries()) {
            state.overlay.append(this.renderOcrLineElement(state, result, line, parsed[index] ?? [], sentence, showText, settings));
        }
        this.positionState(state.image);
        this.options.enrichPitchTokens?.(parsed.flat());
    }

    private async parseOcrLines(lines: OcrLine[], settings: ReaderSettings): Promise<JPDBToken[][]> {
        if (!settings.apiKey.trim() && !settings.localDictionariesEnabled) return lines.map(() => []);
        return Promise.all(lines.map(line => this.options.parseJapanese(line.text).catch(() => {
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
        element.addEventListener('click', event => this.toggleOcrLinePinned(state, element, event));
        return element;
    }

    private toggleOcrLinePinned(state: ImageState, element: HTMLElement, event: MouseEvent): void {
        if ((event.target as HTMLElement).closest('.jpdb-reader-word[data-vid]')) return;
        event.preventDefault();
        event.stopPropagation();
        if (element.dataset.pinned === 'true') {
            this.unpinLine(element);
            return;
        }
        element.focus({ preventScroll: true });
        this.pinLine(state, element);
    }

    private pinLine(state: ImageState, element: HTMLElement): void {
        state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line-active').forEach(line => {
            if (line !== element) this.unpinLine(line);
        });
        element.classList.add('jpdb-ocr-line-active');
        element.dataset.pinned = 'true';
    }

    private unpinLine(element: HTMLElement): void {
        element.classList.remove('jpdb-ocr-line-active');
        element.dataset.pinned = 'false';
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
        state.status.hidden = true;
    }

    private remember(key: string, result: OcrResult): void {
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
            for (const image of this.states.keys()) this.positionState(image);
        });
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
        const top = clampNumber(!vertical ? baselineAlignedTop : centeredTop, minTop, maxTop);

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
        this.queue = [];
        for (const state of this.states.values()) {
            state.overlay.remove();
        }
        this.states.clear();
    }

    private pruneDisconnectedStates(): void {
        for (const [image, state] of this.states) {
            if (image.isConnected) continue;
            this.observer?.unobserve(image);
            state.overlay.remove();
            this.states.delete(image);
        }
    }
}

function applyOcrOverlayStyle(overlay: HTMLElement, settings: ReaderSettings): void {
    overlay.style.setProperty('--jpdb-ocr-text-color', settings.ocrTextColor);
    overlay.style.setProperty('--jpdb-ocr-outline-color', settings.ocrOutlineColor);
    overlay.style.setProperty('--jpdb-ocr-background-rgba', accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity));
    overlay.style.setProperty('--jpdb-ocr-background-active-rgba', accentToRgba(settings.ocrBackgroundColor, Math.min(1, settings.ocrBackgroundOpacity + 0.12)));
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
    element.className = showText ? 'jpdb-ocr-line jpdb-reader-word jpdb-ocr-line-visible' : 'jpdb-ocr-line jpdb-reader-word';
    setOcrLineDataset(element, result, line, sentence);
    element.title = line.text;
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
    normalizeOcrRuby(textElement);
    normalizeOcrPlainText(textElement);
    return textElement;
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
    const sourceWidth = result?.width || image.naturalWidth || image.width || content.width || rect.width || 1;
    const sourceHeight = result?.height || image.naturalHeight || image.height || content.height || rect.height || 1;
    const object = fittedObjectSize(style.objectFit, sourceWidth, sourceHeight, content.width, content.height);
    const offset = objectPositionOffset(style.objectPosition, content.width - object.width, content.height - object.height);
    return {
        imageLeft: content.left + offset.x,
        imageTop: content.top + offset.y,
        imageWidth: Math.max(1, object.width),
        imageHeight: Math.max(1, object.height),
    };
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

export function normalizeOcrResult(value: unknown, fallbackWidth = 1, fallbackHeight = 1): OcrResult | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const cloudVision = normalizeCloudVisionResponse(record, fallbackWidth, fallbackHeight);
    if (cloudVision) return cloudVision;
    const { width, height } = ocrResultDimensions(record, fallbackWidth, fallbackHeight);
    const lines = collectGenericOcrLines(record, width, height);
    return japaneseOcrResult(width, height, lines);
}

function ocrResultDimensions(record: Record<string, unknown>, fallbackWidth: number, fallbackHeight: number): Pick<OcrResult, 'width' | 'height'> {
    const resolution = record.context_resolution as Record<string, unknown> | undefined;
    const width = numberFrom(record.width) || numberFrom(resolution?.width) || fallbackWidth;
    const height = numberFrom(record.height) || numberFrom(resolution?.height) || fallbackHeight;
    return { width, height };
}

function collectGenericOcrLines(record: Record<string, unknown>, width: number, height: number): OcrLine[] {
    const lines: OcrLine[] = [];
    appendGenericOcrLines(lines, genericRawLines(record), width, height, normalizeSimpleLines);
    appendGenericOcrLines(lines, record.results, width, height, normalizeStructuredOcrResults);
    appendGenericOcrLines(lines, record.ocr_regions, width, height, normalizeOcrRegionResults);
    return lines;
}

function genericRawLines(record: Record<string, unknown>): unknown {
    return Array.isArray(record.lines) ? record.lines : record.regions;
}

function appendGenericOcrLines(
    lines: OcrLine[],
    value: unknown,
    width: number,
    height: number,
    normalize: (values: unknown[], width: number, height: number) => OcrLine[],
): void {
    if (Array.isArray(value)) lines.push(...normalize(value, width, height));
}

function normalizeSimpleLines(values: unknown[], width: number, height: number): OcrLine[] {
    return values
        .map(item => normalizeSimpleLine(item, width, height))
        .filter((line): line is OcrLine => Boolean(line));
}

function normalizeStructuredOcrResults(values: unknown[], width: number, height: number): OcrLine[] {
    return values.flatMap(item => normalizeStructuredOcrResult(item, width, height));
}

function normalizeOcrRegionResults(regions: unknown[], width: number, height: number): OcrLine[] {
    return regions.flatMap(region => normalizeSingleOcrRegionResults(region, width, height));
}

function normalizeSingleOcrRegionResults(region: unknown, width: number, height: number): OcrLine[] {
    const regionRecord = asRecord(region);
    if (!regionRecord) return [];
    const regionBox = normalizeOcrRegion(regionRecord, width, height);
    const { scaleWidth, scaleHeight } = ocrRegionScale(regionBox, width, height);
    if (!Array.isArray(regionRecord.results)) return [];
    const lines = normalizeStructuredOcrResults(regionRecord.results, scaleWidth, scaleHeight);
    return offsetRegionLines(lines, regionBox, width, height);
}

function ocrRegionScale(regionBox: OcrRect | null, width: number, height: number): { scaleWidth: number; scaleHeight: number } {
    return {
        scaleWidth: regionBox?.width ?? width,
        scaleHeight: regionBox?.height ?? height,
    };
}

function offsetRegionLines(lines: OcrLine[], regionBox: OcrRect | null, width: number, height: number): OcrLine[] {
    if (!regionBox) return lines;
    return lines.map(line => offsetLineToRegion(line, regionBox, width, height)).filter((line): line is OcrLine => Boolean(line));
}

function japaneseOcrResult(width: number, height: number, lines: OcrLine[]): OcrResult | null {
    const japaneseLines = removeStandaloneFuriganaLines(lines)
        .filter(line => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
}

function japaneseOcrLine(text: string, box: OcrRect | null): OcrLine | null {
    return text && box && HAS_JAPANESE.test(text)
        ? { text, box, vertical: box.height > box.width * 1.25 && text.length > 1 }
        : null;
}

function cleanOcrLookupLines(lines: OcrLine[], parsed: JPDBToken[][]): OcrLine[] {
    const cleaned = lines.map((line, index) => {
        const text = cleanOcrLookupText(line.text, parsed[index] ?? []);
        return text === line.text ? line : { ...line, text };
    });
    return removeStandaloneFuriganaLines(cleaned);
}

function ocrLinesChanged(original: OcrLine[], cleaned: OcrLine[]): boolean {
    return original.length !== cleaned.length
        || cleaned.some((line, index) => line.text !== original[index]?.text);
}

function cleanOcrLookupText(text: string, tokens: JPDBToken[]): string {
    const rubies = tokens
        .flatMap(token => token.rubies.map(ruby => ({ ruby, token })))
        .sort((a, b) => b.ruby.start - a.ruby.start);
    let cleaned = text;
    for (const { ruby } of rubies) {
        if (!OCR_KANJI_RE.test(cleaned.slice(ruby.start, ruby.end))) continue;
        cleaned = removeOcrReadingAroundRuby(cleaned, ruby.text, ruby.start, ruby.end);
    }
    return cleanOcrText(cleaned);
}

function removeOcrReadingAroundRuby(text: string, reading: string, start: number, end: number): string {
    const cleanReading = cleanOcrText(reading);
    if (!cleanReading) return text;
    if (text.slice(Math.max(0, start - cleanReading.length), start) === cleanReading) {
        return text.slice(0, start - cleanReading.length) + text.slice(start);
    }
    if (text.slice(end, end + cleanReading.length) === cleanReading) {
        return text.slice(0, end) + text.slice(end + cleanReading.length);
    }
    return text;
}

function removeStandaloneFuriganaLines(lines: OcrLine[]): OcrLine[] {
    const filtered = lines.filter((line, index) => !isStandaloneFuriganaLine(line, lines, index));
    return filtered.length ? filtered : lines;
}

function isStandaloneFuriganaLine(line: OcrLine, lines: OcrLine[], index: number): boolean {
    const text = cleanOcrText(line.text).replace(/\s+/g, '');
    if (!text || text.length > 10 || !OCR_KANA_ONLY_RE.test(text)) return false;
    return lines.some((other, otherIndex) => otherIndex !== index
        && OCR_KANJI_RE.test(other.text)
        && ocrLineLooksLikeFuriganaFor(line, other));
}

function ocrLineLooksLikeFuriganaFor(furi: OcrLine, base: OcrLine): boolean {
    if (furi.vertical || base.vertical) return ocrLineLooksLikeVerticalFuriganaFor(furi, base);
    const overlap = horizontalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.width, base.box.width));
    const smaller = furi.box.height <= base.box.height * 0.75 || furi.box.width <= base.box.width * 0.65;
    const nearTop = furi.box.top <= base.box.top + base.box.height * 0.5
        && furi.box.top + furi.box.height >= base.box.top - Math.max(base.box.height * 0.45, furi.box.height * 3);
    return overlapRatio >= 0.32 && smaller && nearTop;
}

function horizontalOverlap(a: OcrRect, b: OcrRect): number {
    return Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
}

function ocrLineLooksLikeVerticalFuriganaFor(furi: OcrLine, base: OcrLine): boolean {
    if (!furi.vertical || !base.vertical) return false;
    const overlap = verticalOverlap(furi.box, base.box);
    const overlapRatio = overlap / Math.max(1, Math.min(furi.box.height, base.box.height));
    const smaller = furi.box.width <= base.box.width * 0.75 || furi.box.height <= base.box.height * 0.65;
    const nearSide = horizontalGap(furi.box, base.box) <= Math.max(base.box.width * 0.75, furi.box.width * 2);
    return overlapRatio >= 0.32 && smaller && nearSide;
}

function verticalOverlap(a: OcrRect, b: OcrRect): number {
    return Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
}

function horizontalGap(a: OcrRect, b: OcrRect): number {
    if (a.left + a.width < b.left) return b.left - (a.left + a.width);
    if (b.left + b.width < a.left) return a.left - (b.left + b.width);
    return 0;
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

function normalizeOcrRuby(root: HTMLElement): void {
    root.querySelectorAll('ruby').forEach(ruby => {
        const replacement = document.createElement('span');
        replacement.className = 'jpdb-ocr-ruby';

        const furi = document.createElement('span');
        furi.className = 'jpdb-ocr-furi';
        furi.dataset.jpdbReaderSurfaceIgnore = 'true';
        furi.setAttribute('aria-hidden', 'true');
        const base = document.createElement('span');
        base.className = 'jpdb-ocr-ruby-base';

        for (const child of Array.from(ruby.childNodes)) {
            if (child instanceof HTMLElement && child.tagName === 'RT') {
                furi.textContent += child.textContent ?? '';
            } else if (!(child instanceof HTMLElement && child.tagName === 'RP')) {
                base.append(child.cloneNode(true));
            }
        }

        replacement.append(furi, base);
        ruby.replaceWith(replacement);
    });
}

function normalizeOcrPlainText(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
            if (parent.classList.contains('jpdb-ocr-furi') || parent.classList.contains('jpdb-ocr-ruby-base')) return NodeFilter.FILTER_REJECT;
            return parent === root || parent.classList.contains('jpdb-reader-word')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });

    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Text) textNodes.push(node);
    }

    for (const textNode of textNodes) {
        const replacement = document.createElement('span');
        replacement.className = 'jpdb-ocr-plain';
        replacement.textContent = textNode.textContent ?? '';
        textNode.replaceWith(replacement);
    }
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
        log.warn('Google Lens protobuf endpoint failed; trying upload fallback', error);
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
    return { base64: (await blobToDataUrl(blob)).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
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

function parseGoogleLensResponse(bytes: Uint8Array, width: number, height: number): OcrResult | null {
    const root = decodeProtoMessage(bytes);
    const objectsResponse = protoFirstMessage(root, 2);
    const text = objectsResponse ? protoFirstMessage(objectsResponse, 3) : null;
    const layout = text ? protoFirstMessage(text, 1) : null;
    if (!layout) return null;

    const lines: OcrLine[] = [];
    for (const paragraph of protoMessages(layout, 1)) {
        const paragraphVertical = protoNumber(paragraph, 4) === LENS_WRITING_TOP_TO_BOTTOM;
        const paragraphBox = protoBox(protoFirstMessage(paragraph, 3), width, height);
        for (const line of protoMessages(paragraph, 2)) {
            const lineBox = protoBox(protoFirstMessage(line, 2), width, height);
            const words = protoMessages(line, 1).map(word => ({
                text: protoString(word, 2),
                separator: protoString(word, 3),
                box: protoBox(protoFirstMessage(word, 4), width, height),
            })).filter(word => word.text);
            const orderedWords = paragraphVertical ? words : [...words].sort((a, b) => (a.box?.left ?? 0) - (b.box?.left ?? 0));
            const rawText = orderedWords
                .map((word, index) => word.text + (word.separator || (index < orderedWords.length - 1 ? ' ' : '')))
                .join('');
            const textValue = cleanOcrText(rawText);
            if (!textValue || !HAS_JAPANESE.test(textValue)) continue;

            const box = lineBox ?? unionBoxes(words.map(word => word.box).filter((item): item is OcrRect => Boolean(item))) ?? paragraphBox;
            if (!box) continue;
            lines.push({
                text: textValue,
                box,
                vertical: paragraphVertical || (box.height > box.width * 1.25 && textValue.length > 1),
            });
        }
    }
    return lines.length ? { width, height, lines } : null;
}

export function parseGoogleLensUploadHtml(html: string, width: number, height: number): OcrResult | null {
    const literal = googleLensUploadCallbackLiteral(html, 'ds:1');
    if (!literal) return null;
    try {
        const callback = parseJsDataLiteral(literal) as { data?: unknown[] };
        const blocks = (((callback.data?.[2] as unknown[])?.[3] as unknown[])?.[0] as unknown[]) ?? [];
        const lines: OcrLine[] = [];
        for (const block of blocks) {
            const blockData = block as unknown[];
            const rawLines = (((blockData[2] as unknown[])?.[0] as unknown[])?.[5] as unknown[])?.[3] as unknown[] | undefined;
            const lineItems = rawLines?.[0] as unknown[] | undefined;
            if (!Array.isArray(lineItems)) continue;
            for (const item of lineItems) {
                const lineData = item as unknown[];
                const words = Array.isArray(lineData[0]) ? lineData[0] as unknown[] : [];
                const boxData = Array.isArray(lineData[1]) ? lineData[1] as number[] : [];
                const text = cleanOcrText(words.map(word => {
                    const wordData = word as unknown[];
                    return `${wordData[0] ?? ''}${wordData[3] ?? ''}`;
                }).join(''));
                const box = boxData.length >= 4 ? clampBox({
                    top: Number(boxData[0]) * height,
                    left: Number(boxData[1]) * width,
                    width: Number(boxData[2]) * width,
                    height: Number(boxData[3]) * height,
                }, width, height) : null;
                if (text && box && HAS_JAPANESE.test(text)) {
                    lines.push({ text, box, vertical: box.height > box.width * 1.25 && text.length > 1 });
                }
            }
        }
        return lines.length ? { width, height, lines } : null;
    } catch {
        return null;
    }
}

function googleLensUploadCallbackLiteral(html: string, key: string): string | null {
    const marker = 'AF_initDataCallback(';
    let searchIndex = 0;
    while (searchIndex < html.length) {
        const markerIndex = html.indexOf(marker, searchIndex);
        if (markerIndex < 0) return null;
        const literalStart = markerIndex + marker.length;
        const literal = readBalancedLiteral(html, literalStart);
        if (literal && callbackLiteralHasKey(literal, key)) return literal;
        searchIndex = literalStart + Math.max(1, literal?.length ?? 1);
    }
    return null;
}

function callbackLiteralHasKey(literal: string, key: string): boolean {
    return new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegex(key)}['"]`).test(literal);
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readBalancedLiteral(source: string, startIndex: number): string | null {
    let index = startIndex;
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '{') return null;
    let depth = 0;
    let quote = '';
    for (let current = index; current < source.length; current += 1) {
        const char = source[current];
        if (quote) {
            if (char === '\\') {
                current += 1;
            } else if (char === quote) {
                quote = '';
            }
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === '{' || char === '[' || char === '(') depth += 1;
        if (char === '}' || char === ']' || char === ')') depth -= 1;
        if (depth === 0) return source.slice(index, current + 1);
    }
    return null;
}

function parseJsDataLiteral(source: string): unknown {
    let index = 0;
    const value = parseValue();
    skipWhitespace();
    if (index !== source.length) throw new Error('Unexpected trailing data.');
    return value;

    function parseValue(): unknown {
        skipWhitespace();
        const char = source[index];
        if (char === '{') return parseObject();
        if (char === '[') return parseArray();
        if (char === '"' || char === "'") return parseString();
        if (char === '-' || /\d/.test(char ?? '')) return parseNumber();
        return parseIdentifierValue();
    }

    function parseObject(): Record<string, unknown> {
        const record: Record<string, unknown> = {};
        index += 1;
        skipWhitespace();
        while (source[index] !== '}') {
            const key = parseObjectKey();
            skipWhitespace();
            expect(':');
            record[key] = parseValue();
            skipWhitespace();
            if (source[index] === ',') {
                index += 1;
                skipWhitespace();
                continue;
            }
            break;
        }
        expect('}');
        return record;
    }

    function parseObjectKey(): string {
        skipWhitespace();
        const char = source[index];
        if (char === '"' || char === "'") return parseString();
        return parseIdentifier();
    }

    function parseArray(): unknown[] {
        const values: unknown[] = [];
        index += 1;
        skipWhitespace();
        while (source[index] !== ']') {
            if (source[index] === ',') {
                values.push(null);
                index += 1;
                skipWhitespace();
                continue;
            }
            values.push(parseValue());
            skipWhitespace();
            if (source[index] === ',') {
                index += 1;
                skipWhitespace();
                continue;
            }
            break;
        }
        expect(']');
        return values;
    }

    function parseString(): string {
        const quote = source[index];
        let value = '';
        index += 1;
        while (index < source.length) {
            const char = source[index++];
            if (char === quote) return value;
            if (char !== '\\') {
                value += char;
                continue;
            }
            value += parseEscapeSequence();
        }
        throw new Error('Unterminated string.');
    }

    function parseEscapeSequence(): string {
        const escaped = source[index++];
        if (escaped === 'n') return '\n';
        if (escaped === 'r') return '\r';
        if (escaped === 't') return '\t';
        if (escaped === 'b') return '\b';
        if (escaped === 'f') return '\f';
        if (escaped === 'v') return '\v';
        if (escaped === '0') return '\0';
        if (escaped === '\n') return '';
        if (escaped === '\r') {
            if (source[index] === '\n') index += 1;
            return '';
        }
        if (escaped === 'x') return codePointEscape(2);
        if (escaped === 'u') return parseUnicodeEscape();
        return escaped ?? '';
    }

    function parseUnicodeEscape(): string {
        if (source[index] === '{') {
            const end = source.indexOf('}', index + 1);
            if (end < 0) throw new Error('Invalid unicode escape.');
            const value = Number.parseInt(source.slice(index + 1, end), 16);
            index = end + 1;
            return Number.isFinite(value) ? String.fromCodePoint(value) : '';
        }
        return codePointEscape(4);
    }

    function codePointEscape(length: number): string {
        const hex = source.slice(index, index + length);
        if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex)) throw new Error('Invalid character escape.');
        index += length;
        return String.fromCharCode(Number.parseInt(hex, 16));
    }

    function parseNumber(): number {
        const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
        if (!match) throw new Error('Invalid number.');
        index += match[0].length;
        return Number(match[0]);
    }

    function parseIdentifierValue(): unknown {
        const identifier = parseIdentifier();
        if (identifier === 'null' || identifier === 'undefined' || identifier === 'NaN') return null;
        if (identifier === 'true') return true;
        if (identifier === 'false') return false;
        if (identifier === 'Infinity') return Infinity;
        return identifier;
    }

    function parseIdentifier(): string {
        const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
        if (!match) throw new Error('Expected identifier.');
        index += match[0].length;
        return match[0];
    }

    function skipWhitespace(): void {
        while (/\s/.test(source[index] ?? '')) index += 1;
    }

    function expect(char: string): void {
        if (source[index] !== char) throw new Error(`Expected ${char}.`);
        index += 1;
    }
}

function normalizeCloudVisionResponse(record: Record<string, unknown>, fallbackWidth: number, fallbackHeight: number): OcrResult | null {
    const responses = Array.isArray(record.responses) ? record.responses : ('fullTextAnnotation' in record ? [record] : []);
    const lines: OcrLine[] = [];
    let width = fallbackWidth;
    let height = fallbackHeight;
    for (const response of responses) {
        const annotation = (response as Record<string, unknown>)?.fullTextAnnotation as Record<string, unknown> | undefined;
        const pages = Array.isArray(annotation?.pages) ? annotation.pages : [];
        for (const page of pages) {
            const pageRecord = page as Record<string, unknown>;
            width = numberFrom(pageRecord.width) || width;
            height = numberFrom(pageRecord.height) || height;
            const blocks = Array.isArray(pageRecord.blocks) ? pageRecord.blocks : [];
            for (const block of blocks) {
                const paragraphs = Array.isArray((block as Record<string, unknown>).paragraphs) ? (block as Record<string, unknown>).paragraphs as unknown[] : [];
                for (const paragraph of paragraphs) {
                    pushCloudVisionParagraphLines(paragraph as Record<string, unknown>, lines, width, height);
                }
            }
        }
        const annotations = Array.isArray((response as Record<string, unknown>)?.textAnnotations) ? (response as Record<string, unknown>).textAnnotations as unknown[] : [];
        if (!lines.length && annotations.length > 1) {
            for (const annotationItem of annotations.slice(1)) {
                const item = annotationItem as Record<string, unknown>;
                const text = cleanOcrText(item.description);
                const box = normalizeCloudVisionVertices((item.boundingPoly as Record<string, unknown> | undefined)?.vertices, width, height);
                if (text && box && HAS_JAPANESE.test(text)) lines.push({ text, box, vertical: box.height > box.width * 1.25 && text.length > 1 });
            }
        }
    }
    return lines.length ? { width, height, lines } : null;
}

function pushCloudVisionParagraphLines(paragraph: Record<string, unknown>, lines: OcrLine[], width: number, height: number): void {
    const words = Array.isArray(paragraph.words) ? paragraph.words : [];
    let text = '';
    let boxes: OcrRect[] = [];
    const pushLine = () => {
        const value = cleanOcrText(text);
        const box = unionBoxes(boxes);
        if (value && box && HAS_JAPANESE.test(value)) {
            lines.push({ text: value, box, vertical: box.height > box.width * 1.25 && value.length > 1 });
        }
        text = '';
        boxes = [];
    };

    for (const word of words) {
        const symbols = Array.isArray((word as Record<string, unknown>).symbols) ? (word as Record<string, unknown>).symbols as unknown[] : [];
        for (const symbol of symbols) {
            const symbolRecord = symbol as Record<string, unknown>;
            text += String(symbolRecord.text ?? '');
            const box = normalizeCloudVisionVertices((symbolRecord.boundingBox as Record<string, unknown> | undefined)?.vertices, width, height);
            if (box) boxes.push(box);
            const breakType = ((symbolRecord.property as Record<string, unknown> | undefined)?.detectedBreak as Record<string, unknown> | undefined)?.type;
            if (breakType === 'SPACE' || breakType === 'SURE_SPACE' || breakType === 'UNKNOWN') text += ' ';
            if (breakType === 'LINE_BREAK' || breakType === 'EOL_SURE_SPACE' || breakType === 'HYPHEN') pushLine();
        }
    }
    pushLine();
}

function normalizeCloudVisionVertices(value: unknown, width: number, height: number): OcrRect | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.x) ?? 0);
    const ys = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
}

function normalizeSimpleLine(value: unknown, width: number, height: number): OcrLine | null {
    const record = asRecord(value);
    if (!record) return null;
    const text = simpleLineText(record);
    const box = simpleLineBox(record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: simpleLineIsVertical(record) };
}

function simpleLineText(record: Record<string, unknown>): string {
    return stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
}

function simpleLineBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
}

function simpleLineIsVertical(record: Record<string, unknown>): boolean {
    return Boolean(record.vertical ?? record.is_vertical);
}

function normalizeStructuredOcrResult(value: unknown, width: number, height: number): OcrLine[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const textLines = structuredOcrTextLines(record);
    const vertical = structuredOcrVertical(record);
    const lines = textLines
        .map(item => normalizeStructuredOcrLine(item, width, height, vertical))
        .filter((line): line is OcrLine => line !== null);
    if (lines.length) return lines;

    return normalizeStructuredOcrFallback(record, textLines, width, height, vertical);
}

function structuredOcrTextLines(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.text_lines)) return record.text_lines;
    return Array.isArray(record.text) ? record.text : [];
}

function structuredOcrVertical(record: Record<string, unknown>): boolean {
    return Boolean(record.is_vertical ?? (record.box as Record<string, unknown> | undefined)?.isVertical);
}

function normalizeStructuredOcrLine(item: unknown, width: number, height: number, inheritedVertical: boolean): OcrLine | null {
    const lineRecord = asRecord(item);
    if (!lineRecord) return null;
    const text = structuredOcrLineText(lineRecord);
    const box = structuredOcrLineBox(lineRecord, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: structuredOcrLineVertical(lineRecord, inheritedVertical) };
}

function structuredOcrLineText(record: Record<string, unknown>): string {
    return stringFrom(record.content ?? record.text ?? record.word);
}

function structuredOcrLineBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    return normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
}

function structuredOcrLineVertical(record: Record<string, unknown>, inheritedVertical: boolean): boolean {
    return Boolean(record.is_vertical ?? (record.box as Record<string, unknown> | undefined)?.isVertical ?? inheritedVertical);
}

function normalizeStructuredOcrFallback(record: Record<string, unknown>, textLines: unknown[], width: number, height: number, vertical: boolean): OcrLine[] {
    const text = textLines.map(item => stringFrom((item as Record<string, unknown>)?.content)).filter(Boolean).join('');
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
}

function normalizeOcrRegion(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const region = readOcrRegion(record);
    if (!region) return null;
    const box = clampBox(scaleOcrRegion(region, width, height), width, height);
    return box && !isFullImageOcrRegion(box, width, height) ? box : null;
}

interface OcrRegionParts {
    left: number;
    top: number;
    width: number;
    height: number;
}

function readOcrRegion(record: Record<string, unknown>): OcrRegionParts | null {
    const position = record.position as Record<string, unknown> | undefined;
    const size = record.size as Record<string, unknown> | undefined;
    if (!position || !size) return null;
    return completeOcrRegionParts({
        left: numberFrom(position.left),
        top: numberFrom(position.top),
        width: numberFrom(size.width),
        height: numberFrom(size.height),
    });
}

function completeOcrRegionParts(parts: { left: number | null; top: number | null; width: number | null; height: number | null }): OcrRegionParts | null {
    if (parts.left === null) return null;
    if (parts.top === null) return null;
    if (parts.width === null) return null;
    if (parts.height === null) return null;
    return { left: parts.left, top: parts.top, width: parts.width, height: parts.height };
}

function scaleOcrRegion(region: OcrRegionParts, width: number, height: number): OcrRect {
    const divisor = Math.max(region.left, region.top, region.width, region.height) <= 1 ? 1 : 100;
    return {
        left: (region.left / divisor) * width,
        top: (region.top / divisor) * height,
        width: (region.width / divisor) * width,
        height: (region.height / divisor) * height,
    };
}

function isFullImageOcrRegion(box: OcrRect, width: number, height: number): boolean {
    return box.left <= 1 && box.top <= 1 && box.width >= width - 2 && box.height >= height - 2;
}

function offsetLineToRegion(line: OcrLine, region: OcrRect, width: number, height: number): OcrLine | null {
    const box = clampBox({
        left: region.left + line.box.left,
        top: region.top + line.box.top,
        width: line.box.width,
        height: line.box.height,
    }, width, height);
    return box ? { ...line, box } : null;
}

function normalizeBox(value: unknown, width: number, height: number): OcrRect | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return normalizePositionDimensionsBox(record, width, height)
        ?? normalizeDirectBox(record, width, height)
        ?? normalizePointBox(record, width, height);
}

function normalizePositionDimensionsBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const position = asRecord(record.position);
    const dimensions = asRecord(record.dimensions);
    if (!position || !dimensions) return null;

    return boxFromNumbers({
        left: numberFrom(position.left),
        top: numberFrom(position.top),
        width: numberFrom(dimensions.width),
        height: numberFrom(dimensions.height),
    }, width, height, 'percent-100');
}

function normalizeDirectBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const box = directBoxNumbers(record);
    return boxFromNumbers(box, width, height, directBoxScale(box));
}

function directBoxNumbers(record: Record<string, unknown>): NullableOcrRect {
    return {
        left: numberFrom(record.left ?? record.x),
        top: numberFrom(record.top ?? record.y),
        width: numberFrom(record.width ?? record.w),
        height: numberFrom(record.height ?? record.h),
    };
}

function directBoxScale(box: NullableOcrRect): 'fraction' | 'pixels' {
    return Object.values(box).every(value => value !== null && value <= 1) ? 'fraction' : 'pixels';
}

function normalizePointBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const points = ['top_left', 'top_right', 'bottom_right', 'bottom_left']
        .map(key => asRecord(record[key]))
        .filter((point): point is Record<string, unknown> => Boolean(point));
    if (points.length < 2) return null;
    const xs = points.map(point => numberFrom(point?.x)).filter((item): item is number => item !== null);
    const ys = points.map(point => numberFrom(point?.y)).filter((item): item is number => item !== null);
    if (!xs.length || !ys.length) return null;
    const percent = coordinatesAreFractional(xs, ys);
    const scaledXs = scaleCoordinates(xs, width, percent);
    const scaledYs = scaleCoordinates(ys, height, percent);
    const left = Math.min(...scaledXs);
    const top = Math.min(...scaledYs);
    return clampBox({ left, top, width: Math.max(...scaledXs) - left, height: Math.max(...scaledYs) - top }, width, height);
}

function coordinatesAreFractional(xs: number[], ys: number[]): boolean {
    return xs.every(isFractionalCoordinate) && ys.every(isFractionalCoordinate);
}

function isFractionalCoordinate(value: number): boolean {
    return value >= 0 && value <= 1;
}

function scaleCoordinates(values: number[], scale: number, enabled: boolean): number[] {
    return enabled ? values.map(value => value * scale) : values;
}

function boxFromNumbers(
    box: { left: number | null; top: number | null; width: number | null; height: number | null },
    imageWidth: number,
    imageHeight: number,
    scale: 'pixels' | 'fraction' | 'percent-100',
): OcrRect | null {
    if (!hasCompleteBoxNumbers(box)) return null;
    const scaleInfo = boxScaleInfo(scale);
    return clampBox({
        left: scaleBoxNumber(box.left, imageWidth, scaleInfo),
        top: scaleBoxNumber(box.top, imageHeight, scaleInfo),
        width: scaleBoxNumber(box.width, imageWidth, scaleInfo),
        height: scaleBoxNumber(box.height, imageHeight, scaleInfo),
    }, imageWidth, imageHeight);
}

function hasCompleteBoxNumbers(
    box: { left: number | null; top: number | null; width: number | null; height: number | null },
): box is { left: number; top: number; width: number; height: number } {
    return box.left !== null && box.top !== null && box.width !== null && box.height !== null;
}

function boxScaleInfo(scale: 'pixels' | 'fraction' | 'percent-100'): { fractional: boolean; factor: number } {
    return {
        fractional: scale !== 'pixels',
        factor: scale === 'percent-100' ? 100 : 1,
    };
}

function scaleBoxNumber(value: number, dimension: number, scale: { fractional: boolean; factor: number }): number {
    return scale.fractional ? value / scale.factor * dimension : value;
}

function clampBox(box: OcrRect, width: number, height: number): OcrRect | null {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
}

function unionBoxes(boxes: OcrRect[]): OcrRect | null {
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.left));
    const top = Math.min(...boxes.map(box => box.top));
    const right = Math.max(...boxes.map(box => box.left + box.width));
    const bottom = Math.max(...boxes.map(box => box.top + box.height));
    return { left, top, width: right - left, height: bottom - top };
}

function cleanOcrText(value: unknown): string {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const normalized = text.replace(/[ \t\r\n]+/g, HAS_JAPANESE.test(text) ? '' : ' ').trim();
    return normalized.replaceAll('．．．', '…');
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

function isIgnoredOcrImage(image: HTMLImageElement): boolean {
    return Boolean(image.closest('[data-jpdb-reader-root]')
        || image.closest('[aria-hidden="true"], [hidden], .slick-cloned'));
}

function isVisibleOcrImage(image: HTMLImageElement): boolean {
    const style = getComputedStyle(image);
    return style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity || '1') > 0
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

function nodeContainsRenderableMedia(node: Node): boolean {
    return node instanceof HTMLImageElement
        || node instanceof HTMLVideoElement
        || node instanceof HTMLSourceElement
        || (node instanceof Element && Boolean(node.querySelector('img, video, source')));
}

function isImageOccludedByVideo(image: HTMLImageElement, rect = image.getBoundingClientRect()): boolean {
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
        && isVisibleElement(video);
}

function visibleVideoRect(video: HTMLVideoElement): DOMRect | null {
    const rect = video.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 ? rect : null;
}

function isVisibleElement(element: Element): boolean {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
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
    if (settings.ocrProvider === 'off') return false;
    if (readFallbackOcrResult(image, false)) return true;
    if (settings.ocrProvider === 'local-service') return true;
    if (settings.ocrProvider === 'cloud-vision') return Boolean(settings.ocrCloudVisionApiKey.trim());
    return settings.ocrProvider === 'google-lens';
}

function hasFallbackOcrMetadata(image: HTMLImageElement): boolean {
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

function imageCacheKey(image: HTMLImageElement): string {
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
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

function decodeProtoMessage(bytes: Uint8Array): ProtoField[] {
    const fields: ProtoField[] = [];
    let offset = 0;
    while (offset < bytes.length) {
        const [tag, nextOffset] = readVarint(bytes, offset);
        offset = nextOffset;
        const field = Number(tag >> 3n);
        const wire = Number(tag & 7n);
        if (!field) break;
        if (wire === 0) {
            const [value, afterValue] = readVarint(bytes, offset);
            offset = afterValue;
            fields.push({ field, wire, value });
        } else if (wire === 1) {
            fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true) });
            offset += 8;
        } else if (wire === 2) {
            const [length, afterLength] = readVarint(bytes, offset);
            offset = afterLength;
            const end = offset + Number(length);
            fields.push({ field, wire, value: bytes.slice(offset, end) });
            offset = end;
        } else if (wire === 5) {
            fields.push({ field, wire, value: new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true) });
            offset += 4;
        } else {
            break;
        }
    }
    return fields;
}

function readVarint(bytes: Uint8Array, offset: number): [bigint, number] {
    let shift = 0n;
    let result = 0n;
    while (offset < bytes.length) {
        const byte = bytes[offset++];
        result |= BigInt(byte & 0x7f) << shift;
        if (!(byte & 0x80)) return [result, offset];
        shift += 7n;
    }
    return [result, offset];
}

function protoMessages(fields: ProtoField[], field: number): ProtoField[][] {
    return fields
        .filter(item => item.field === field && item.wire === 2 && item.value instanceof Uint8Array)
        .map(item => decodeProtoMessage(item.value as Uint8Array));
}

function protoFirstMessage(fields: ProtoField[], field: number): ProtoField[] | null {
    return protoMessages(fields, field)[0] ?? null;
}

function protoString(fields: ProtoField[], field: number): string {
    const item = fields.find(value => value.field === field && value.wire === 2 && value.value instanceof Uint8Array);
    return item ? new TextDecoder().decode(item.value as Uint8Array) : '';
}

function protoNumber(fields: ProtoField[], field: number): number {
    const item = fields.find(value => value.field === field);
    if (!item) return 0;
    return typeof item.value === 'bigint' ? Number(item.value) : typeof item.value === 'number' ? item.value : 0;
}

function protoBox(geometry: ProtoField[] | null, width: number, height: number): OcrRect | null {
    const box = geometry ? protoFirstMessage(geometry, 1) : null;
    if (!box) return null;
    const centerX = protoNumber(box, 1);
    const centerY = protoNumber(box, 2);
    const boxWidth = protoNumber(box, 3);
    const boxHeight = protoNumber(box, 4);
    if (!boxWidth || !boxHeight) return null;
    const normalized = centerX <= 2 && centerY <= 2 && boxWidth <= 2 && boxHeight <= 2;
    return clampBox({
        left: (normalized ? centerX * width : centerX) - (normalized ? boxWidth * width : boxWidth) / 2,
        top: (normalized ? centerY * height : centerY) - (normalized ? boxHeight * height : boxHeight) / 2,
        width: normalized ? boxWidth * width : boxWidth,
        height: normalized ? boxHeight * height : boxHeight,
    }, width, height);
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
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'POST',
                url,
                headers: { 'content-type': 'application/json' },
                data,
                responseType: 'json',
                timeout,
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(response.response ?? (response.responseText ? JSON.parse(response.responseText) : null))
                    : reject(new Error(`OCR endpoint returned ${response.status}.`)),
                onerror: reject,
                ontimeout: () => reject(new Error('OCR timed out.')),
            });
        });
    }
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
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'POST',
                url,
                headers,
                data: body.buffer,
                responseType: 'arraybuffer',
                timeout,
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(response.response as ArrayBuffer)
                    : reject(new Error(`Google Lens returned ${response.status}.`)),
                onerror: reject,
                ontimeout: () => reject(new Error('Google Lens timed out.')),
            });
        });
    }
    return fetch(url, {
        method: 'POST',
        headers,
        body: body.buffer,
    }).then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
}

function requestTextForm(url: string, data: FormData, timeout: number): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'POST',
                url,
                data,
                responseType: 'text',
                timeout,
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(String(response.responseText ?? response.response ?? ''))
                    : reject(new Error(`Google Lens upload returned ${response.status}.`)),
                onerror: reject,
                ontimeout: () => reject(new Error('Google Lens upload timed out.')),
            });
        });
    }
    return fetch(url, { method: 'POST', body: data })
        .then(response => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}

function requestBlob(url: string): Promise<Blob> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(response.response as Blob)
                    : reject(new Error(`Image fetch returned ${response.status}.`)),
                onerror: reject,
            });
        });
    }
    return fetch(url).then(response => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
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

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('Blob read failed.'));
        reader.readAsDataURL(blob);
    });
}

function stringFrom(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\s+/g, '').trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberFrom(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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
