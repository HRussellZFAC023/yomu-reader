import { HAS_JAPANESE, escapeHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { accentToRgba } from './settings';
import type { JPDBToken, ReaderSettings } from './types';

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
}

const MAX_CACHE_ITEMS = 36;
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
const LENS_WRITING_TOP_TO_BOTTOM = 2;

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
            this.schedulePosition();
            this.scheduleRefresh(240);
        }, { passive: true });
        window.addEventListener('resize', () => {
            this.schedulePosition();
            this.scheduleRefresh(300);
        }, { passive: true });
        this.mutationObserver = new MutationObserver(mutations => {
            if (mutations.some(mutation => [...mutation.addedNodes].some(nodeContainsImage))) this.refresh();
        });
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    refresh(): void {
        const settings = this.options.getSettings();
        if (!settings.ocrEnabled) {
            this.clear();
            return;
        }

        this.pruneDisconnectedStates();
        this.ensureObserver(settings);
        const images = Array.from(document.images)
            .filter(image => isCandidateImage(image, settings) && shouldObserveImage(image, settings))
            .sort((a, b) => imageViewportDistance(a) - imageViewportDistance(b))
            .slice(0, settings.ocrMaxImagesPerPage);

        for (const image of images) {
            this.ensureState(image);
            this.observer?.observe(image);
        }
        this.schedulePosition();
    }

    toggle(): void {
        const settings = this.options.getSettings();
        settings.ocrEnabled = !settings.ocrEnabled;
        this.options.onToast(settings.ocrEnabled ? 'Image reading enabled.' : 'Image reading hidden.');
        this.refresh();
    }

    async scanVisible(): Promise<void> {
        this.refresh();
        const images = [...this.states.keys()].filter(image => isNearViewport(image, 120));
        if (!images.length) {
            this.options.onToast('No readable images nearby.');
            return;
        }
        images.forEach(image => this.enqueue(image, true));
    }

    captureSourceImageForElement(element: Element | null): string | undefined {
        const line = element?.closest?.('.jpdb-ocr-line');
        if (!line) return undefined;
        const state = [...this.states.values()].find(candidate => candidate.overlay.contains(line));
        if (!state) return undefined;
        return captureImageElement(state.image);
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
        if (state.autoSkipped && !userRequested) return;
        state.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image, false));
        state.manualRequested ||= userRequested;
        if (userRequested) state.autoSkipped = false;
        if (state.result) {
            if (userRequested) void this.renderResult(state, state.result, true);
            return;
        }
        if (state.loading) return;
        if (!this.queue.includes(image)) this.queue.push(image);
        if (userRequested) {
            state.status.hidden = false;
            state.status.textContent = 'Reading image...';
        }
        this.drainQueue();
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
        const cached = this.cache.get(key);
        if (cached) {
            await this.renderResult(state, cached);
            state.manualRequested = false;
            return;
        }

        state.loading = true;
        state.status.hidden = !state.overlayRequested;
        const canUseLocalService = settings.ocrProvider === 'local-service' && settings.ocrEndpointUrl.trim();
        const canUseCloudVision = settings.ocrProvider === 'cloud-vision' && settings.ocrCloudVisionApiKey.trim();
        const canUseGoogleLens = settings.ocrProvider === 'google-lens';
        state.status.textContent = 'Reading image...';

        try {
            const inlineFallback = readFallbackOcrResult(image, false);
            const providerResult = inlineFallback ? null : canUseLocalService
                ? await recognizeViaLocalService(image, settings)
                : canUseCloudVision
                    ? await recognizeViaCloudVision(image, settings)
                : canUseGoogleLens
                    ? await recognizeViaGoogleLens(image, settings)
                    : null;
            const result = inlineFallback ?? providerResult;

            if (!result?.lines.length) {
                state.autoSkipped = !manualRequested;
                state.status.textContent = 'No Japanese text found';
                state.status.hidden = !state.overlayRequested || state.autoSkipped;
                return;
            }

            this.remember(key, result);
            state.key = key;
            await this.renderResult(state, result);
        } catch (error) {
            const fallback = readFallbackOcrResult(image, false);
            if (fallback?.lines.length) {
                await this.renderResult(state, fallback);
            } else {
                state.status.textContent = error instanceof Error ? error.message : 'OCR failed';
                state.autoSkipped = !manualRequested;
                state.status.hidden = !state.overlayRequested || state.autoSkipped;
            }
        } finally {
            state.loading = false;
            state.manualRequested = false;
        }
    }

    private async renderResult(state: ImageState, result: OcrResult, forceOverlay = false): Promise<void> {
        state.result = result;
        state.status.hidden = true;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());

        const settings = this.options.getSettings();
        const showText = settings.ocrShowTextOverlay || forceOverlay;

        const sentence = result.lines.map(line => line.text).join('\n');
        const parsed = settings.apiKey.trim() || settings.localDictionariesEnabled
            ? await Promise.all(result.lines.map(line => this.options.parseJapanese(line.text).catch(() => [])))
            : result.lines.map(() => []);
        state.overlay.style.setProperty('--jpdb-ocr-text-color', settings.ocrTextColor);
        state.overlay.style.setProperty('--jpdb-ocr-outline-color', settings.ocrOutlineColor);
        state.overlay.style.setProperty('--jpdb-ocr-background-rgba', accentToRgba(settings.ocrBackgroundColor, settings.ocrBackgroundOpacity));
        state.overlay.style.setProperty('--jpdb-ocr-background-active-rgba', accentToRgba(settings.ocrBackgroundColor, Math.min(1, settings.ocrBackgroundOpacity + 0.12)));

        for (const [index, line] of result.lines.entries()) {
            const element = document.createElement('div');
            element.className = 'jpdb-ocr-line';
            if (showText) element.classList.add('jpdb-ocr-line-visible');
            element.dataset.ocrText = line.text;
            element.dataset.vertical = String(line.vertical);
            element.dataset.boxWidth = String(line.box.width / result.width);
            element.dataset.boxHeight = String(line.box.height / result.height);
            element.dataset.sentence = sentence;
            element.title = line.text;
            element.tabIndex = 0;
            element.style.left = `${100 * line.box.left / result.width}%`;
            element.style.top = `${100 * line.box.top / result.height}%`;
            element.style.width = `${100 * line.box.width / result.width}%`;
            element.style.height = `${100 * line.box.height / result.height}%`;
            element.style.writingMode = line.vertical ? 'vertical-rl' : 'horizontal-tb';
            element.setAttribute('aria-label', line.text);
            setInnerHtml(element, parsed[index]?.length
                ? renderTokensToHtml(line.text, parsed[index], settings)
                : escapeHtml(line.text));
            element.addEventListener('pointerenter', event => {
                if (event.pointerType === 'touch') return;
                this.activateLine(state, element, false);
            });
            element.addEventListener('pointerleave', event => {
                if (event.pointerType === 'touch' || element.dataset.pinned === 'true') return;
                this.deactivateLine(element);
            });
            element.addEventListener('focus', () => {
                if (element.dataset.pinned !== 'true') this.activateLine(state, element, false);
            });
            element.addEventListener('blur', () => {
                if (element.dataset.pinned !== 'true') this.deactivateLine(element);
            });
            element.addEventListener('click', event => {
                if ((event.target as HTMLElement).closest('.jpdb-reader-word')) return;
                event.preventDefault();
                event.stopPropagation();
                const wasPinned = element.classList.contains('jpdb-ocr-line-active') && element.dataset.pinned === 'true';
                if (wasPinned) {
                    this.deactivateLine(element);
                } else {
                    element.focus({ preventScroll: true });
                    this.activateLine(state, element, true);
                }
            });
            state.overlay.append(element);
        }
        this.positionState(state.image);
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
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
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
            const boxWidth = Number(element.dataset.boxWidth) * imageWidth;
            const boxHeight = Number(element.dataset.boxHeight) * imageHeight;
            if (!Number.isFinite(boxWidth) || !Number.isFinite(boxHeight) || boxWidth <= 0 || boxHeight <= 0) return;
            const text = element.dataset.ocrText ?? '';
            const vertical = element.dataset.vertical === 'true';
            element.style.fontSize = `${ocrFontPx(text, boxWidth, boxHeight, vertical, scale)}px`;
        });
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

    const resolution = record.context_resolution as Record<string, unknown> | undefined;
    const width = numberFrom(record.width) || numberFrom(resolution?.width) || fallbackWidth;
    const height = numberFrom(record.height) || numberFrom(resolution?.height) || fallbackHeight;
    const rawLines = Array.isArray(record.lines) ? record.lines : Array.isArray(record.regions) ? record.regions : undefined;
    const lines: OcrLine[] = [];

    if (rawLines) {
        for (const item of rawLines) {
            const line = normalizeSimpleLine(item, width, height);
            if (line) lines.push(line);
        }
    }

    if (Array.isArray(record.results)) {
        for (const item of record.results) {
            lines.push(...normalizeStructuredOcrResult(item, width, height));
        }
    }

    if (Array.isArray(record.ocr_regions)) {
        for (const region of record.ocr_regions) {
            const regionRecord = region as Record<string, unknown>;
            const regionBox = normalizeOcrRegion(regionRecord, width, height);
            const scaleWidth = regionBox?.width ?? width;
            const scaleHeight = regionBox?.height ?? height;
            if (Array.isArray(regionRecord.results)) {
                for (const item of regionRecord.results) {
                    const regionLines = normalizeStructuredOcrResult(item, scaleWidth, scaleHeight);
                    lines.push(...(regionBox ? regionLines.map(line => offsetLineToRegion(line, regionBox, width, height)).filter((line): line is OcrLine => Boolean(line)) : regionLines));
                }
            }
        }
    }

    const japaneseLines = lines.filter(line => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
}

export function readFallbackOcrResult(image: HTMLImageElement, _includeAccessibleText = false): OcrResult | null {
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const data = image.dataset.ocrLines;
    if (data) {
        try {
            const parsed = normalizeOcrResult({ width, height, lines: JSON.parse(data) }, width, height);
            if (parsed) return parsed;
        } catch {
            // Ignore invalid fixture/helper metadata.
        }
    }

    return null;
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

async function recognizeViaLocalService(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const payload = await canvasToBase64Payload(canvas);
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
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const payload = await canvasToBase64Payload(canvas);
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
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    try {
        const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, settings.audioTimeoutMs);
        return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
    } catch {
        return recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, settings.audioTimeoutMs);
    }
}

async function recognizeViaGoogleLensUpload(blob: Blob, width: number, height: number, timeout: number): Promise<OcrResult | null> {
    const data = new FormData();
    data.append('encoded_image', blob, 'image.jpg');
    const response = await requestTextForm('https://lens.google.com/v3/upload?stcs=' + Date.now().toString().slice(0, 10), data, timeout);
    return parseGoogleLensUploadHtml(response, width, height);
}

async function imageToCanvas(image: HTMLImageElement, maxPixels: number): Promise<HTMLCanvasElement> {
    try {
        return drawImageToCanvas(image, maxPixels);
    } catch {
        const url = image.currentSrc || image.src;
        if (!url || url.startsWith('data:')) throw new Error('Image cannot be read by OCR.');
        const blob = await requestBlob(url);
        const objectUrl = URL.createObjectURL(blob);
        try {
            const loaded = await loadImage(objectUrl);
            return drawImageToCanvas(loaded, maxPixels);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
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

async function canvasToBase64Payload(canvas: HTMLCanvasElement): Promise<{ base64: string; width: number; height: number }> {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
    return { base64: (await blobToDataUrl(blob)).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
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

function parseGoogleLensUploadHtml(html: string, width: number, height: number): OcrResult | null {
    const match = html.match(/AF_initDataCallback\((\{key:\s*['"]ds:1['"][\s\S]*?\})\);/);
    if (!match) return null;
    try {
        const callback = Function(`"use strict";return (${match[1]});`)() as { data?: unknown[] };
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

function normalizeSimpleLine(value: unknown, width: number, height: number): OcrLine | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const text = stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
    const box = normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: Boolean(record.vertical ?? record.is_vertical) };
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

function normalizeStructuredOcrResult(value: unknown, width: number, height: number): OcrLine[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const textLines = Array.isArray(record.text_lines) ? record.text_lines : Array.isArray(record.text) ? record.text : [];
    const vertical = Boolean(record.is_vertical ?? (record.box as Record<string, unknown> | undefined)?.isVertical);
    const lines = textLines
        .map(item => {
            const lineRecord = item as Record<string, unknown>;
            const text = stringFrom(lineRecord?.content ?? lineRecord?.text ?? lineRecord?.word);
            const box = normalizeBox(lineRecord.box ?? lineRecord.boundingBox ?? lineRecord, width, height);
            return text && box ? { text, box, vertical: Boolean(lineRecord.is_vertical ?? (lineRecord.box as Record<string, unknown> | undefined)?.isVertical ?? vertical) } : null;
        })
        .filter((line): line is OcrLine => line !== null);
    if (lines.length) return lines;

    const text = textLines.map(item => stringFrom((item as Record<string, unknown>)?.content)).filter(Boolean).join('');
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
}

function normalizeOcrRegion(record: Record<string, unknown>, width: number, height: number): OcrRect | null {
    const position = record.position as Record<string, unknown> | undefined;
    const size = record.size as Record<string, unknown> | undefined;
    if (!position || !size) return null;

    const left = numberFrom(position.left);
    const top = numberFrom(position.top);
    const regionWidth = numberFrom(size.width);
    const regionHeight = numberFrom(size.height);
    if (left === null || top === null || regionWidth === null || regionHeight === null) return null;

    const fractional = Math.max(left, top, regionWidth, regionHeight) <= 1;
    const box = clampBox({
        left: (fractional ? left : left / 100) * width,
        top: (fractional ? top : top / 100) * height,
        width: (fractional ? regionWidth : regionWidth / 100) * width,
        height: (fractional ? regionHeight : regionHeight / 100) * height,
    }, width, height);

    if (!box) return null;
    const isFullImage = box.left <= 1 && box.top <= 1 && box.width >= width - 2 && box.height >= height - 2;
    return isFullImage ? null : box;
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
    const position = record.position as Record<string, unknown> | undefined;
    const dimensions = record.dimensions as Record<string, unknown> | undefined;
    if (position && dimensions) {
        const left = numberFrom(position.left);
        const top = numberFrom(position.top);
        const boxWidth = numberFrom(dimensions.width);
        const boxHeight = numberFrom(dimensions.height);
        if (left !== null && top !== null && boxWidth !== null && boxHeight !== null) {
            return clampBox({
                left: left / 100 * width,
                top: top / 100 * height,
                width: boxWidth / 100 * width,
                height: boxHeight / 100 * height,
            }, width, height);
        }
    }

    const directLeft = numberFrom(record.left ?? record.x);
    const directTop = numberFrom(record.top ?? record.y);
    const directWidth = numberFrom(record.width ?? record.w);
    const directHeight = numberFrom(record.height ?? record.h);
    if (directLeft !== null && directTop !== null && directWidth !== null && directHeight !== null) {
        const percent = directLeft <= 1 && directTop <= 1 && directWidth <= 1 && directHeight <= 1;
        return clampBox({
            left: percent ? directLeft * width : directLeft,
            top: percent ? directTop * height : directTop,
            width: percent ? directWidth * width : directWidth,
            height: percent ? directHeight * height : directHeight,
        }, width, height);
    }

    const points = ['top_left', 'top_right', 'bottom_right', 'bottom_left']
        .map(key => record[key] as Record<string, unknown> | undefined)
        .filter(Boolean);
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
    if (image.closest('[data-jpdb-reader-root]')) return false;
    const rect = image.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < settings.ocrMinImageArea) return false;
    if (!isNearViewport(image, settings.ocrPrefetchMargin)) return false;
    const style = getComputedStyle(image);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > 0;
}

function shouldObserveImage(image: HTMLImageElement, settings: ReaderSettings): boolean {
    if (settings.ocrProvider === 'off') return false;
    if (readFallbackOcrResult(image, false)) return true;
    if (settings.ocrProvider === 'local-service') return Boolean(settings.ocrEndpointUrl.trim());
    if (settings.ocrProvider === 'cloud-vision') return Boolean(settings.ocrCloudVisionApiKey.trim());
    return settings.ocrProvider === 'google-lens';
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
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
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

function requestArrayBuffer(url: string, data: Uint8Array, timeout: number): Promise<ArrayBuffer> {
    const body = new Uint8Array(data);
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
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
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
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
    return fetch(url, { method: 'POST', body: data }).then(response => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}

function requestBlob(url: string): Promise<Blob> {
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
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

function numberFrom(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
