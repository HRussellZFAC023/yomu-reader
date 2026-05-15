import { HAS_JAPANESE, escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { Logger } from './logger';
import { accentToRgba } from './settings';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';

type LookupText = (text: string, sentence?: string) => Promise<void> | void;
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

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: (text: string) => Promise<JPDBToken[]>;
    onLookup: LookupText;
    onToast: (message: string) => void;
    shouldAutoScan?: () => boolean;
}

const MAX_CACHE_ITEMS = 36;
const log = Logger.scope('OCR');
const OCR_RECOGNIZERS: Partial<Record<ReaderSettings['ocrProvider'], OcrRecognizer>> = {
    'local-service': recognizeViaLocalService,
};
const OCR_PROVIDER_CONFIGURED: Partial<Record<ReaderSettings['ocrProvider'], (settings: ReaderSettings) => boolean>> = {
    'local-service': settings => Boolean(settings.ocrEndpointUrl.trim()),
};
const OCR_PROVIDER_LABELS: Partial<Record<ReaderSettings['ocrProvider'], (settings: ReaderSettings) => string | null>> = {
    'local-service': localServiceProviderLabel,
};

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

function renderNoOcrLines(state: ImageState, manualRequested: boolean): void {
    state.autoSkipped = !manualRequested;
    state.status.textContent = 'No Japanese text found';
    state.status.hidden = !state.overlayRequested || state.autoSkipped;
}

function renderOcrErrorStatus(state: ImageState, provider: string, manualRequested: boolean, error: unknown): void {
    state.status.textContent = error instanceof Error ? error.message : 'OCR failed';
    state.autoSkipped = !manualRequested;
    state.status.hidden = !state.overlayRequested || state.autoSkipped;
    log.warn('OCR scan failed', { provider, manualRequested }, error);
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
            return;
        }
        if (this.shouldSkipRefresh(settings, options)) {
            this.clear();
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
        this.options.onToast(settings.ocrEnabled ? 'Image reading enabled.' : 'Image reading hidden.');
        this.refresh();
        log.info('OCR toggled', { enabled: settings.ocrEnabled });
    }

    async scanVisible(): Promise<void> {
        this.refresh({ userRequested: true });
        const images = [...this.states.keys()].filter(image => isNearViewport(image, 120));
        if (!images.length) {
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
        return state;
    }

    private enqueue(image: HTMLImageElement, userRequested = false): void {
        const state = this.states.get(image) ?? this.ensureState(image);
        if (!this.shouldQueueOcrRequest(state, image, userRequested)) return;
        this.queueOcrRequest(image, state, userRequested);
    }

    private shouldQueueOcrRequest(state: ImageState, image: HTMLImageElement, userRequested: boolean): boolean {
        if (shouldSkipOcrRequest(state, userRequested)) return false;
        updateOcrRequestFlags(state, image, userRequested);
        if (this.renderExistingOcrResult(state, userRequested)) return false;
        return !state.loading;
    }

    private queueOcrRequest(image: HTMLImageElement, state: ImageState, userRequested: boolean): void {
        this.queueImageForOcr(image);
        if (userRequested) showOcrReadingStatus(state);
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
            renderNoOcrLines(state, manualRequested);
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
        const recognizer = ocrRecognizer(settings);
        return recognizer ? recognizer(image, settings) : Promise.resolve(null);
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
    const japaneseLines = lines.filter(line => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
}

function japaneseOcrLine(text: string, box: OcrRect | null): OcrLine | null {
    return text && box && HAS_JAPANESE.test(text)
        ? { text, box, vertical: box.height > box.width * 1.25 && text.length > 1 }
        : null;
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
    return settings.ocrProvider === 'local-service' && Boolean(settings.ocrEndpointUrl.trim());
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
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data })
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
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
    return configuredOcrProviderLabel(settings) ?? settings.ocrProvider;
}

function configuredOcrProviderLabel(settings: ReaderSettings): string | null {
    return OCR_PROVIDER_LABELS[settings.ocrProvider]?.(settings) ?? null;
}

function localServiceProviderLabel(settings: ReaderSettings): string | null {
    return settings.ocrEndpointUrl.trim() ? `local-service:${ocrEngineLabel(settings)}` : null;
}

function ocrEngineLabel(settings: ReaderSettings): string {
    return settings.ocrEngine || 'auto';
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return 'inline-or-invalid';
    }
}
