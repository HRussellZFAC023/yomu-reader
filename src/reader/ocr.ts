import { HAS_JAPANESE, escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { Logger } from './logger';
import { accentToRgba } from './settings';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

type LookupText = (text: string, sentence?: string) => Promise<void> | void;

export interface OcrRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

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

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string) => Promise<JPDBToken[]>;
    onLookup: LookupText;
    onToast: (message: string) => void;
    shouldAutoScan?: () => boolean;
}

const MAX_CACHE_ITEMS = 36;
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
const LENS_WRITING_TOP_TO_BOTTOM = 2;
const log = Logger.scope('OCR');

function shouldSkipOcrRequest(state: ImageState, userRequested: boolean): boolean {
    return state.autoSkipped && !userRequested;
}

function updateOcrRequestFlags(state: ImageState, image: HTMLImageElement, userRequested: boolean): void {
    state.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image, false));
    state.manualRequested ||= userRequested;
    if (userRequested) state.autoSkipped = false;
}

function showOcrReadingStatus(state: ImageState): void {
    state.status.hidden = false;
    state.status.textContent = 'Reading image...';
}

interface OcrScanContext {
    provider: string;
    done: () => void;
}

function beginOcrScan(
    state: ImageState,
    image: HTMLImageElement,
    settings: ReaderSettings,
    manualRequested: boolean,
): OcrScanContext {
    state.loading = true;
    state.status.hidden = !state.overlayRequested;
    state.status.textContent = 'Reading image...';
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

function renderNoOcrLines(state: ImageState, provider: string, manualRequested: boolean): void {
    state.autoSkipped = !manualRequested;
    state.status.textContent = 'No Japanese text found';
    state.status.hidden = !state.overlayRequested || state.autoSkipped;
    log.debug('OCR found no lines', { provider, manualRequested });
}

function renderOcrErrorStatus(state: ImageState, provider: string, manualRequested: boolean, error: unknown): void {
    state.status.textContent = error instanceof Error ? error.message : 'OCR failed';
    state.autoSkipped = !manualRequested;
    state.status.hidden = !state.overlayRequested || state.autoSkipped;
    log.warn('OCR scan failed', { provider, manualRequested }, error);
}

interface ProtoField {
    field: number;
    wire: number;
    value: bigint | number | string | Uint8Array;
}

export class ImageOcrController {
    private states = new Map<HTMLImageElement, ImageState>();
    private cache = new Map<string, OcrResult>();
    private observer?: IntersectionObserver;
    private observerMargin = '';
    private mutationObserver?: MutationObserver;
    private queue: HTMLImageElement[] = [];
    private busy = false;
    private positionFrame = 0;
    private refreshTimer = 0;

    constructor(private readonly options: OcrControllerOptions) {}

    init(): void {
        this.refresh();
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
            if (mutations.some(mutation => mutationTouchesRenderableMedia(mutation))) {
                this.schedulePosition();
                if (settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false) this.scheduleRefresh(80);
            }
        });
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'src', 'srcset', 'sizes', 'loading', 'poster'],
        });
        log.info('OCR controller initialized');
    }

    refresh(options: { userRequested?: boolean } = {}): void {
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled) {
            this.clear();
            log.debug('OCR disabled; cleared overlays');
            return;
        }
        if (this.shouldSkipRefresh(settings, options)) {
            this.clear();
            log.debugThrottled('refresh-skipped', 5000, 'OCR auto-scan skipped until Japanese text appears');
            return;
        }

        this.pruneDisconnectedStates();
        this.ensureObserver(settings);
        const images = this.refreshImages(settings);

        for (const image of images) {
            this.observeRefreshImage(image, settings);
        }
        this.schedulePosition();
        log.debugThrottled('refresh', 2500, 'OCR refreshed image candidates', { images: images.length });
    }

    private shouldSkipRefresh(settings: ReaderSettings, options: { userRequested?: boolean }): boolean {
        return !options.userRequested
            && !Array.from(document.images).some(hasFallbackOcrMetadata)
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
        return settings.ocrAutoScanImages
            && this.options.shouldAutoScan?.() !== false
            && !state.result
            && !state.loading
            && !state.autoSkipped
            && isNearViewport(image, settings.ocrPrefetchMargin);
    }

    toggle(): void {
        const settings = this.options.getSettings();
        settings.ocrEnabled = !settings.ocrEnabled;
        this.options.onToast(settings.ocrEnabled ? 'Image reading enabled.' : 'Image reading hidden.');
        this.refresh();
        log.info('OCR toggled', { enabled: settings.ocrEnabled });
    }

    async scanVisible(): Promise<void> {
        this.refresh({ userRequested: true });
        const images = [...this.states.keys()].filter(image => isNearViewport(image, 120));
        if (!images.length) {
            log.debug('Manual OCR scan found no nearby images');
            this.options.onToast('No readable images nearby.');
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
        log.debug('Captured OCR source image for mining', { success: Boolean(image) });
        return image;
    }

    private ensureObserver(settings: ReaderSettings): void {
        const rootMargin = `${settings.ocrPrefetchMargin}px 0px`;
        if (this.observer && this.observerMargin === rootMargin) return;
        this.observer?.disconnect();
        this.observerMargin = rootMargin;
        this.observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const image = entry.target as HTMLImageElement;
                this.positionState(image);
                const current = this.options.getSettings();
                if (current.ocrAutoScanImages && shouldObserveImage(image, current)) this.enqueue(image);
            }
        }, { rootMargin });
        log.debug('OCR observer configured', { rootMargin });
    }

    private ensureState(image: HTMLImageElement): ImageState {
        const existing = this.states.get(image);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';

        const status = document.createElement('div');
        status.className = 'jpdb-ocr-status';
        status.hidden = true;

        overlay.append(status);
        document.body.append(overlay);

        const state = { image, overlay, status, key: imageCacheKey(image), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
        image.addEventListener('load', () => {
            this.resetStateIfImageChanged(state);
            this.schedulePosition();
            this.scheduleRefresh(80);
        });
        this.states.set(image, state);
        log.debug('OCR state created for image', imageSummary(image));
        return state;
    }

    private enqueue(image: HTMLImageElement, userRequested = false): void {
        const state = this.states.get(image) ?? this.ensureState(image);
        if (shouldSkipOcrRequest(state, userRequested)) return;
        updateOcrRequestFlags(state, image, userRequested);
        if (this.renderExistingOcrResult(state, userRequested)) return;
        if (state.loading) return;
        this.queueImageForOcr(image);
        if (userRequested) showOcrReadingStatus(state);
        log.debug('OCR image queued', { userRequested, queue: this.queue.length, image: imageSummary(image) });
        this.drainQueue();
    }

    private renderExistingOcrResult(state: ImageState, userRequested: boolean): boolean {
        if (!state.result) return false;
        if (userRequested) void this.renderResult(state, state.result, true);
        return true;
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
        log.debug('OCR queue draining', { delay, hasFastText, remaining: this.queue.length });
        void waitForIdle(delay)
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
        if (await this.renderCachedOcrResult(state, image, key)) return;

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

    private async renderCachedOcrResult(state: ImageState, image: HTMLImageElement, key: string): Promise<boolean> {
        const cached = this.cache.get(key);
        if (!cached) return false;
        log.debug('OCR cache hit', { image: imageSummary(image), lines: cached.lines.length });
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
            renderNoOcrLines(state, provider, manualRequested);
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
        renderOcrErrorStatus(state, provider, manualRequested, error);
    }

    private recognizeImage(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
        if (settings.ocrProvider === 'local-service' && settings.ocrEndpointUrl.trim()) return recognizeViaLocalService(image, settings);
        if (settings.ocrProvider === 'cloud-vision' && settings.ocrCloudVisionApiKey.trim()) return recognizeViaCloudVision(image, settings);
        if (settings.ocrProvider === 'google-lens') return recognizeViaGoogleLens(image, settings);
        return Promise.resolve(null);
    }

    private async renderResult(state: ImageState, result: OcrResult, forceOverlay = false): Promise<void> {
        state.result = result;
        state.status.hidden = true;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());

        const settings = this.options.getSettings();
        const showText = settings.ocrShowTextOverlay || forceOverlay;

        const sentence = result.lines.map(line => line.text).join('\n');
        const parsed = await this.parseOcrLines(result.lines, settings);
        applyOcrOverlayStyle(state.overlay, settings);

        for (const [index, line] of result.lines.entries()) {
            state.overlay.append(this.renderOcrLineElement(state, result, line, parsed[index] ?? [], sentence, showText, settings));
        }
        this.positionState(state.image);
        log.debug('OCR overlay lines positioned', {
            lines: result.lines.length,
            parsedTokens: parsed.reduce((sum, tokens) => sum + tokens.length, 0),
            forcedOverlay: forceOverlay,
        });
    }

    private async parseOcrLines(lines: OcrLine[], settings: ReaderSettings): Promise<JPDBToken[][]> {
        if (!settings.apiKey.trim() && !settings.localDictionariesEnabled) return lines.map(() => []);
        return Promise.all(lines.map(line => this.options.parseJapanese(line.text).catch(error => {
            log.debug('OCR line parse failed quietly', { textLength: line.text.length }, error);
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
        element.addEventListener('pointerenter', event => {
            if (event.pointerType !== 'touch') this.activateLine(state, element, false);
        });
        element.addEventListener('pointerleave', event => {
            if (event.pointerType !== 'touch' && element.dataset.pinned !== 'true') this.deactivateLine(element);
        });
        element.addEventListener('focus', () => {
            if (element.dataset.pinned !== 'true') this.activateLine(state, element, false);
        });
        element.addEventListener('blur', () => {
            if (element.dataset.pinned !== 'true') this.deactivateLine(element);
        });
        element.addEventListener('click', event => this.toggleOcrLinePinned(state, element, event));
        return element;
    }

    private toggleOcrLinePinned(state: ImageState, element: HTMLElement, event: MouseEvent): void {
        if ((event.target as HTMLElement).closest('.jpdb-reader-word')) return;
        event.preventDefault();
        event.stopPropagation();
        if (element.classList.contains('jpdb-ocr-line-active') && element.dataset.pinned === 'true') {
            this.deactivateLine(element);
            return;
        }
        element.focus({ preventScroll: true });
        this.activateLine(state, element, true);
    }

    private activateLine(state: ImageState, element: HTMLElement, pinned: boolean): void {
        state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line-active').forEach(line => {
            if (line === element) return;
            this.deactivateLine(line);
        });
        element.classList.add('jpdb-ocr-line-active');
        element.dataset.pinned = pinned ? 'true' : 'false';
    }

    private deactivateLine(element: HTMLElement): void {
        element.classList.remove('jpdb-ocr-line-active');
        element.dataset.pinned = 'false';
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
        log.debug('OCR image state reset after source change', { image: imageSummary(state.image) });
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
        const visible = rect.width > 0
            && rect.height > 0
            && rect.bottom >= 0
            && rect.top <= window.innerHeight
            && !isImageOccludedByVideo(image, rect);
        state.overlay.hidden = !visible;
        if (!visible) return;
        state.overlay.style.left = `${rect.left}px`;
        state.overlay.style.top = `${rect.top}px`;
        state.overlay.style.width = `${rect.width}px`;
        state.overlay.style.height = `${rect.height}px`;
        this.fitLineFonts(state, rect.width, rect.height);
    }

    private fitLineFonts(state: ImageState, imageWidth: number, imageHeight: number): void {
        const scale = this.options.getSettings().ocrFontScale;
        state.overlay.querySelectorAll<HTMLElement>('.jpdb-ocr-line').forEach(element => {
            const boxLeft = Number(element.dataset.boxLeft) * imageWidth;
            const boxTop = Number(element.dataset.boxTop) * imageHeight;
            const boxWidth = Number(element.dataset.boxWidth) * imageWidth;
            const boxHeight = Number(element.dataset.boxHeight) * imageHeight;
            if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth <= 0 || boxHeight <= 0) return;
            const text = element.dataset.ocrText ?? '';
            const vertical = element.dataset.vertical === 'true';
            element.style.fontSize = `${ocrFontPx(text, boxWidth, boxHeight, vertical, scale)}px`;
            this.fitLineFrame(element, boxLeft, boxTop, boxWidth, boxHeight, imageWidth, imageHeight, vertical);
        });
    }

    private fitLineFrame(
        element: HTMLElement,
        boxLeft: number,
        boxTop: number,
        boxWidth: number,
        boxHeight: number,
        imageWidth: number,
        imageHeight: number,
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
        const frameWidth = Math.min(imageWidth, Math.max(1, contentWidth + padX * 2));
        const frameHeight = Math.min(imageHeight, Math.max(1, contentHeight + padTop + padBottom));
        const left = clampNumber(boxLeft + boxWidth / 2 - frameWidth / 2, 0, Math.max(0, imageWidth - frameWidth));
        const centeredTop = boxTop + boxHeight / 2 - frameHeight / 2;
        const baselineAlignedTop = boxTop + boxHeight - frameHeight + padBottom;
        const top = clampNumber(!vertical ? baselineAlignedTop : centeredTop, 0, Math.max(0, imageHeight - frameHeight));

        if (vertical) {
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
            element.style.width = `${frameWidth}px`;
            element.style.height = `${frameHeight}px`;
            return;
        }

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
        for (const state of this.states.values()) state.overlay.remove();
        this.states.clear();
        log.debug('OCR state cleared');
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
    element.className = showText ? 'jpdb-ocr-line jpdb-ocr-line-visible' : 'jpdb-ocr-line';
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
    const rawLines = Array.isArray(record.lines) ? record.lines : Array.isArray(record.regions) ? record.regions : undefined;
    const lines: OcrLine[] = [];
    if (rawLines) lines.push(...normalizeSimpleLines(rawLines, width, height));
    if (Array.isArray(record.results)) lines.push(...normalizeStructuredOcrResults(record.results, width, height));
    if (Array.isArray(record.ocr_regions)) lines.push(...normalizeOcrRegionResults(record.ocr_regions, width, height));
    return lines;
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
    if (!region || typeof region !== 'object') return [];
    const regionRecord = region as Record<string, unknown>;
    const regionBox = normalizeOcrRegion(regionRecord, width, height);
    const scaleWidth = regionBox?.width ?? width;
    const scaleHeight = regionBox?.height ?? height;
    if (!Array.isArray(regionRecord.results)) return [];
    const lines = normalizeStructuredOcrResults(regionRecord.results, scaleWidth, scaleHeight);
    return regionBox ? lines.map(line => offsetLineToRegion(line, regionBox, width, height)).filter((line): line is OcrLine => Boolean(line)) : lines;
}

function japaneseOcrResult(width: number, height: number, lines: OcrLine[]): OcrResult | null {
    const japaneseLines = lines.filter(line => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
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
    log.debug('Recognizing image via local OCR service', { endpointHost: safeHost(settings.ocrEndpointUrl), engine: settings.ocrEngine });
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
    const response = await requestJson(settings.ocrEndpointUrl.trim(), body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
}

async function recognizeViaCloudVision(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    log.debug('Recognizing image via Cloud Vision');
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels);
    const body = JSON.stringify({
        requests: [{
            image: { content: payload.base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 50, model: 'builtin/latest' }],
            imageContext: { languageHints: ['ja'] },
        }],
    });
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(settings.ocrCloudVisionApiKey.trim())}`;
    const response = await requestJson(url, body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
}

async function recognizeViaGoogleLens(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    log.debug('Recognizing image via Google Lens');
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

async function imageToBase64Payload(image: HTMLImageElement, maxPixels: number): Promise<{ base64: string; width: number; height: number }> {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, 'image/jpeg', 0.86);
    return { base64: (await blobToDataUrl(blob)).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
}

async function imageToBlobPayload(image: HTMLImageElement, maxPixels: number, type: string, quality: number): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
    const canvas = await imageToCanvas(image, maxPixels);
    try {
        return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch (error) {
        log.debug('Canvas export failed; retrying OCR image through blob fallback', { image: imageSummary(image) }, error);
        const fallbackCanvas = await imageBlobToCanvas(image, maxPixels);
        return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
}

async function recognizeViaGoogleLensUpload(blob: Blob, width: number, height: number, timeout: number): Promise<OcrResult | null> {
    log.debug('Recognizing image via Google Lens upload fallback', { width, height, size: blob.size });
    const data = new FormData();
    data.append('encoded_image', blob, 'image.jpg');
    const response = await requestTextForm('https://lens.google.com/v3/upload?stcs=' + Date.now().toString().slice(0, 10), data, timeout);
    return parseGoogleLensUploadHtml(response, width, height);
}

async function imageToCanvas(image: HTMLImageElement, maxPixels: number): Promise<HTMLCanvasElement> {
    try {
        const canvas = drawImageToCanvas(image, maxPixels);
        assertCanvasReadable(canvas);
        return canvas;
    } catch (error) {
        log.debug('Direct image canvas unavailable; fetching image blob fallback', { image: imageSummary(image) }, error);
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
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('Image is not loaded yet.');
    const scale = Math.min(1, Math.sqrt(Math.max(160000, maxPixels) / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
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

    const lines = protoMessages(layout, 1).flatMap(paragraph => googleLensParagraphLines(paragraph, width, height));
    return lines.length ? { width, height, lines } : null;
}

interface GoogleLensWord {
    text: string;
    separator: string;
    box: OcrRect | null;
}

function googleLensParagraphLines(paragraph: ProtoField[], width: number, height: number): OcrLine[] {
    const vertical = protoNumber(paragraph, 4) === LENS_WRITING_TOP_TO_BOTTOM;
    const paragraphBox = protoBox(protoFirstMessage(paragraph, 3), width, height);
    return protoMessages(paragraph, 2)
        .map(line => googleLensLine(line, width, height, vertical, paragraphBox))
        .filter((line): line is OcrLine => line !== null);
}

function googleLensLine(line: ProtoField[], width: number, height: number, paragraphVertical: boolean, paragraphBox: OcrRect | null): OcrLine | null {
    const lineBox = protoBox(protoFirstMessage(line, 2), width, height);
    const words = googleLensWords(line, width, height);
    const text = cleanOcrText(googleLensLineText(words, paragraphVertical));
    if (!text || !HAS_JAPANESE.test(text)) return null;
    const box = googleLensLineBox(lineBox, words, paragraphBox);
    return box ? { text, box, vertical: googleLensLineIsVertical(paragraphVertical, box, text) } : null;
}

function googleLensLineBox(lineBox: OcrRect | null, words: GoogleLensWord[], paragraphBox: OcrRect | null): OcrRect | null {
    return lineBox ?? unionBoxes(words.map(word => word.box).filter((item): item is OcrRect => Boolean(item))) ?? paragraphBox;
}

function googleLensLineIsVertical(paragraphVertical: boolean, box: OcrRect, text: string): boolean {
    return paragraphVertical || (box.height > box.width * 1.25 && text.length > 1);
}

function googleLensWords(line: ProtoField[], width: number, height: number): GoogleLensWord[] {
    return protoMessages(line, 1).map(word => ({
        text: protoString(word, 2),
        separator: protoString(word, 3),
        box: protoBox(protoFirstMessage(word, 4), width, height),
    })).filter(word => word.text);
}

function googleLensLineText(words: GoogleLensWord[], paragraphVertical: boolean): string {
    const orderedWords = paragraphVertical ? words : [...words].sort((a, b) => (a.box?.left ?? 0) - (b.box?.left ?? 0));
    return orderedWords
        .map((word, index) => word.text + (word.separator || (index < orderedWords.length - 1 ? ' ' : '')))
        .join('');
}

function parseGoogleLensUploadHtml(html: string, width: number, height: number): OcrResult | null {
    try {
        const callback = parseGoogleLensUploadCallback(html);
        if (!callback) return null;
        const lines = googleLensUploadBlocks(callback)
            .flatMap(block => googleLensUploadLineItems(block))
            .map(item => googleLensUploadLine(item, width, height))
            .filter((line): line is OcrLine => line !== null);
        return lines.length ? { width, height, lines } : null;
    } catch {
        return null;
    }
}

function parseGoogleLensUploadCallback(html: string): { data?: unknown[] } | null {
    const match = html.match(/AF_initDataCallback\((\{key:\s*['"]ds:1['"][\s\S]*?\})\);/);
    return match ? Function(`"use strict";return (${match[1]});`)() as { data?: unknown[] } : null;
}

function googleLensUploadBlocks(callback: { data?: unknown[] }): unknown[] {
    return (((callback.data?.[2] as unknown[])?.[3] as unknown[])?.[0] as unknown[]) ?? [];
}

function googleLensUploadLineItems(block: unknown): unknown[] {
    const blockData = block as unknown[];
    const rawLines = (((blockData[2] as unknown[])?.[0] as unknown[])?.[5] as unknown[])?.[3] as unknown[] | undefined;
    const lineItems = rawLines?.[0] as unknown[] | undefined;
    return Array.isArray(lineItems) ? lineItems : [];
}

function googleLensUploadLine(item: unknown, width: number, height: number): OcrLine | null {
    const lineData = item as unknown[];
    const text = cleanOcrText(googleLensUploadWordsText(lineData[0]));
    const box = googleLensUploadBox(lineData[1], width, height);
    return text && box && HAS_JAPANESE.test(text)
        ? { text, box, vertical: box.height > box.width * 1.25 && text.length > 1 }
        : null;
}

function googleLensUploadWordsText(value: unknown): string {
    const words = Array.isArray(value) ? value : [];
    return words.map(word => {
        const wordData = word as unknown[];
        return `${wordData[0] ?? ''}${wordData[3] ?? ''}`;
    }).join('');
}

function googleLensUploadBox(value: unknown, width: number, height: number): OcrRect | null {
    const boxData = Array.isArray(value) ? value as number[] : [];
    return boxData.length >= 4 ? clampBox({
        top: Number(boxData[0]) * height,
        left: Number(boxData[1]) * width,
        width: Number(boxData[2]) * width,
        height: Number(boxData[3]) * height,
    }, width, height) : null;
}

function normalizeSimpleLine(value: unknown, width: number, height: number): OcrLine | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const text = simpleLineText(record);
    const box = normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: simpleLineIsVertical(record) };
}

function simpleLineText(record: Record<string, unknown>): string {
    return stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
}

function simpleLineIsVertical(record: Record<string, unknown>): boolean {
    return Boolean(record.vertical ?? record.is_vertical);
}

function normalizeCloudVisionResponse(record: Record<string, unknown>, fallbackWidth: number, fallbackHeight: number): OcrResult | null {
    const responses = cloudVisionResponses(record);
    const lines: OcrLine[] = [];
    let width = fallbackWidth;
    let height = fallbackHeight;
    for (const response of responses) {
        const pageResult = collectCloudVisionPageLines(response, width, height);
        width = pageResult.width;
        height = pageResult.height;
        lines.push(...pageResult.lines);
        if (!lines.length) lines.push(...normalizeCloudVisionTextAnnotations(response, width, height));
    }
    return lines.length ? { width, height, lines } : null;
}

function cloudVisionResponses(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.responses)) return record.responses;
    return 'fullTextAnnotation' in record ? [record] : [];
}

function collectCloudVisionPageLines(response: unknown, fallbackWidth: number, fallbackHeight: number): OcrResult {
    const lines: OcrLine[] = [];
    let width = fallbackWidth;
    let height = fallbackHeight;
    for (const pageRecord of cloudVisionPages(response)) {
        width = numberFrom(pageRecord.width) || width;
        height = numberFrom(pageRecord.height) || height;
        for (const paragraph of cloudVisionPageParagraphs(pageRecord)) {
            pushCloudVisionParagraphLines(paragraph, lines, width, height);
        }
    }
    return { width, height, lines };
}

function cloudVisionPages(response: unknown): Record<string, unknown>[] {
    if (!response || typeof response !== 'object') return [];
    const annotation = (response as Record<string, unknown>).fullTextAnnotation as Record<string, unknown> | undefined;
    return Array.isArray(annotation?.pages) ? annotation.pages.filter(isRecord) : [];
}

function cloudVisionPageParagraphs(page: Record<string, unknown>): Record<string, unknown>[] {
    const blocks = Array.isArray(page.blocks) ? page.blocks.filter(isRecord) : [];
    return blocks.flatMap(block => Array.isArray(block.paragraphs) ? block.paragraphs.filter(isRecord) : []);
}

function normalizeCloudVisionTextAnnotations(response: unknown, width: number, height: number): OcrLine[] {
    if (!response || typeof response !== 'object') return [];
    const annotations = (response as Record<string, unknown>).textAnnotations;
    if (!Array.isArray(annotations) || annotations.length <= 1) return [];
    return annotations.slice(1)
        .map(item => normalizeCloudVisionTextAnnotation(item, width, height))
        .filter((line): line is OcrLine => Boolean(line));
}

function normalizeCloudVisionTextAnnotation(item: unknown, width: number, height: number): OcrLine | null {
    if (!isRecord(item)) return null;
    const text = cleanOcrText(item.description);
    const box = normalizeCloudVisionVertices((item.boundingPoly as Record<string, unknown> | undefined)?.vertices, width, height);
    return text && box && HAS_JAPANESE.test(text)
        ? { text, box, vertical: box.height > box.width * 1.25 && text.length > 1 }
        : null;
}

function pushCloudVisionParagraphLines(paragraph: Record<string, unknown>, lines: OcrLine[], width: number, height: number): void {
    const accumulator: CloudVisionLineAccumulator = { text: '', boxes: [] };
    for (const word of cloudVisionParagraphWords(paragraph)) {
        for (const symbol of cloudVisionWordSymbols(word)) appendCloudVisionSymbol(accumulator, symbol, lines, width, height);
    }
    pushCloudVisionLine(accumulator, lines);
}

interface CloudVisionLineAccumulator {
    text: string;
    boxes: OcrRect[];
}

function cloudVisionParagraphWords(paragraph: Record<string, unknown>): unknown[] {
    return Array.isArray(paragraph.words) ? paragraph.words : [];
}

function cloudVisionWordSymbols(word: unknown): unknown[] {
    return isRecord(word) && Array.isArray(word.symbols) ? word.symbols : [];
}

function appendCloudVisionSymbol(accumulator: CloudVisionLineAccumulator, symbol: unknown, lines: OcrLine[], width: number, height: number): void {
    if (!isRecord(symbol)) return;
    accumulator.text += String(symbol.text ?? '');
    const box = normalizeCloudVisionVertices((symbol.boundingBox as Record<string, unknown> | undefined)?.vertices, width, height);
    if (box) accumulator.boxes.push(box);
    const breakType = cloudVisionDetectedBreak(symbol);
    if (isCloudVisionSpaceBreak(breakType)) accumulator.text += ' ';
    if (isCloudVisionLineBreak(breakType)) pushCloudVisionLine(accumulator, lines);
}

function pushCloudVisionLine(accumulator: CloudVisionLineAccumulator, lines: OcrLine[]): void {
    const value = cleanOcrText(accumulator.text);
    const box = unionBoxes(accumulator.boxes);
    if (value && box && HAS_JAPANESE.test(value)) {
        lines.push({ text: value, box, vertical: box.height > box.width * 1.25 && value.length > 1 });
    }
    accumulator.text = '';
    accumulator.boxes = [];
}

function cloudVisionDetectedBreak(symbol: Record<string, unknown>): unknown {
    return ((symbol.property as Record<string, unknown> | undefined)?.detectedBreak as Record<string, unknown> | undefined)?.type;
}

function isCloudVisionSpaceBreak(value: unknown): boolean {
    return value === 'SPACE' || value === 'SURE_SPACE' || value === 'UNKNOWN';
}

function isCloudVisionLineBreak(value: unknown): boolean {
    return value === 'LINE_BREAK' || value === 'EOL_SURE_SPACE' || value === 'HYPHEN';
}

function normalizeCloudVisionVertices(value: unknown, width: number, height: number): OcrRect | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const xs = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.x) ?? 0);
    const ys = value.map(vertex => numberFrom((vertex as Record<string, unknown>)?.y) ?? 0);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return clampBox({ left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }, width, height);
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
    const lineRecord = item as Record<string, unknown>;
    const text = stringFrom(lineRecord?.content ?? lineRecord?.text ?? lineRecord?.word);
    const box = normalizeBox(lineRecord.box ?? lineRecord.boundingBox ?? lineRecord, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: structuredOcrLineVertical(lineRecord, inheritedVertical) };
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
    const left = numberFrom(position.left);
    const top = numberFrom(position.top);
    const regionWidth = numberFrom(size.width);
    const regionHeight = numberFrom(size.height);
    return left === null || top === null || regionWidth === null || regionHeight === null
        ? null
        : { left, top, width: regionWidth, height: regionHeight };
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
    const box = {
        left: numberFrom(record.left ?? record.x),
        top: numberFrom(record.top ?? record.y),
        width: numberFrom(record.width ?? record.w),
        height: numberFrom(record.height ?? record.h),
    };
    const values = Object.values(box);
    const scale = values.every(value => value !== null && value <= 1) ? 'fraction' : 'pixels';
    return boxFromNumbers(box, width, height, scale);
}

function normalizePointBox(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const points = ['top_left', 'top_right', 'bottom_right', 'bottom_left']
        .map(key => asRecord(record[key]))
        .filter((point): point is Record<string, unknown> => Boolean(point));
    if (points.length < 2) return null;
    const xs = points.map(point => numberFrom(point?.x)).filter((item): item is number => item !== null);
    const ys = points.map(point => numberFrom(point?.y)).filter((item): item is number => item !== null);
    if (!xs.length || !ys.length) return null;
    const percent = xs.every(value => value >= 0 && value <= 1) && ys.every(value => value >= 0 && value <= 1);
    const scaledXs = percent ? xs.map(value => value * width) : xs;
    const scaledYs = percent ? ys.map(value => value * height) : ys;
    const left = Math.min(...scaledXs);
    const top = Math.min(...scaledYs);
    return clampBox({ left, top, width: Math.max(...scaledXs) - left, height: Math.max(...scaledYs) - top }, width, height);
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
    if (settings.ocrProvider === 'local-service') return Boolean(settings.ocrEndpointUrl.trim());
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

function nodeContainsImage(node: Node): boolean {
    return node instanceof HTMLImageElement || (node instanceof Element && Boolean(node.querySelector('img')));
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
    const geometryBox = readProtoGeometryBox(box);
    return geometryBox ? clampBox(scaleProtoGeometryBox(geometryBox, width, height), width, height) : null;
}

interface ProtoGeometryBox {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
}

function readProtoGeometryBox(box: ProtoField[]): ProtoGeometryBox | null {
    const geometry = {
        centerX: protoNumber(box, 1),
        centerY: protoNumber(box, 2),
        width: protoNumber(box, 3),
        height: protoNumber(box, 4),
    };
    return geometry.width && geometry.height ? geometry : null;
}

function scaleProtoGeometryBox(box: ProtoGeometryBox, imageWidth: number, imageHeight: number): OcrRect {
    const normalized = Math.max(box.centerX, box.centerY, box.width, box.height) <= 2;
    const scaledWidth = normalized ? box.width * imageWidth : box.width;
    const scaledHeight = normalized ? box.height * imageHeight : box.height;
    return {
        left: (normalized ? box.centerX * imageWidth : box.centerX) - scaledWidth / 2,
        top: (normalized ? box.centerY * imageHeight : box.centerY) - scaledHeight / 2,
        width: scaledWidth,
        height: scaledHeight,
    };
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
        log.debug('JSON OCR request via userscript API', { host: safeHost(url), bytes: data.length });
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
    log.debug('JSON OCR request via fetch', { host: safeHost(url), bytes: data.length });
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data })
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
}

function requestArrayBuffer(url: string, data: Uint8Array, timeout: number): Promise<ArrayBuffer> {
    const body = new Uint8Array(data);
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('ArrayBuffer OCR request via userscript API', { host: safeHost(url), bytes: body.byteLength });
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'POST',
                url,
                headers: {
                    'content-type': 'application/x-protobuf',
                    'x-goog-api-key': GOOGLE_LENS_API_KEY,
                    accept: '*/*',
                    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
                },
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
    log.debug('ArrayBuffer OCR request via fetch', { host: safeHost(url), bytes: body.byteLength });
    return fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-protobuf',
            'x-goog-api-key': GOOGLE_LENS_API_KEY,
            accept: '*/*',
            'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        body: body.buffer,
    }).then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
}

function requestTextForm(url: string, data: FormData, timeout: number): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Form OCR request via userscript API', { host: safeHost(url) });
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
    log.debug('Form OCR request via fetch', { host: safeHost(url) });
    return fetch(url, { method: 'POST', body: data }).then(response => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}

function requestBlob(url: string): Promise<Blob> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        log.debug('Image blob request via userscript API', { host: safeHost(url) });
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
    log.debug('Image blob request via fetch', { host: safeHost(url) });
    return fetch(url).then(response => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
}

function waitForIdle(timeout: number): Promise<void> {
    if (!timeout) return Promise.resolve();
    return new Promise(resolve => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => resolve(), { timeout });
        } else {
            globalThis.setTimeout(resolve, timeout);
        }
    });
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
    if (settings.ocrProvider === 'local-service' && settings.ocrEndpointUrl.trim()) return `local-service:${settings.ocrEngine || 'auto'}`;
    if (settings.ocrProvider === 'cloud-vision' && settings.ocrCloudVisionApiKey.trim()) return 'cloud-vision';
    if (settings.ocrProvider === 'google-lens') return 'google-lens';
    return settings.ocrProvider;
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return 'inline-or-invalid';
    }
}
