import { HAS_JAPANESE } from './dom';
import type { ReaderSettings } from './types';

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
}

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    onLookup: LookupText;
    onToast: (message: string) => void;
}

const MAX_CACHE_ITEMS = 36;
const TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
const TESSERACT_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js';
const TESSERACT_CORE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7/tesseract-core-simd.wasm.js';
const TESSERACT_LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0';

let tesseractLoader: Promise<TesseractLike> | undefined;
let tesseractWorker: Promise<TesseractWorkerLike> | undefined;

interface BrowserDetectedText {
    rawValue?: string;
    boundingBox?: DOMRectReadOnly;
}

interface TextDetectorLike {
    detect(source: CanvasImageSource): Promise<BrowserDetectedText[]>;
}

interface TesseractLike {
    createWorker(language: string, oem?: number, options?: Record<string, unknown>): Promise<TesseractWorkerLike>;
}

interface TesseractWorkerLike {
    recognize(source: CanvasImageSource): Promise<{
        data?: {
            lines?: Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
            words?: Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
            text?: string;
        };
    }>;
}

declare global {
    interface Window {
        TextDetector?: { new(): TextDetectorLike };
        Tesseract?: TesseractLike;
    }
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
        let count = 0;
        for (const image of Array.from(document.images)) {
            if (count >= settings.ocrMaxImagesPerPage) break;
            if (!isCandidateImage(image, settings)) continue;
            if (!shouldObserveImage(image, settings)) continue;
            count++;
            this.ensureState(image);
            this.observer?.observe(image);
        }
        this.schedulePosition();
    }

    toggle(): void {
        const settings = this.options.getSettings();
        settings.ocrEnabled = !settings.ocrEnabled;
        this.options.onToast(settings.ocrEnabled ? 'OCR enabled.' : 'OCR hidden.');
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

        const state = { image, overlay, status, key: imageCacheKey(image), loading: false, overlayRequested: false };
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
        state.overlayRequested ||= userRequested || Boolean(readFallbackOcrResult(image));
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
        const hasFastText = Boolean(readFallbackOcrResult(image));
        const delay = this.states.get(image)?.overlayRequested || hasFastText ? 0 : 1800;
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
        this.resetStateIfImageChanged(state);
        const cached = this.cache.get(key);
        if (cached) {
            await this.renderResult(state, cached);
            return;
        }

        state.loading = true;
        state.status.hidden = !state.overlayRequested;
        const canUseEndpoint = settings.ocrProvider === 'custom-json' && settings.ocrEndpointUrl.trim();
        state.status.textContent = 'Reading image...';

        try {
            const fallback = readFallbackOcrResult(image);
            const result = fallback
                ?? (canUseEndpoint
                    ? await recognizeViaEndpoint(image, settings)
                    : settings.ocrProvider === 'auto'
                        ? await recognizeViaBrowser(image, settings)
                        : null);

            if (!result?.lines.length) {
                state.status.textContent = 'No Japanese text found';
                state.status.hidden = !state.overlayRequested;
                return;
            }

            this.remember(key, result);
            state.key = key;
            await this.renderResult(state, result);
        } catch (error) {
            const fallback = readFallbackOcrResult(image);
            if (fallback?.lines.length) {
                await this.renderResult(state, fallback);
            } else {
                state.status.textContent = error instanceof Error ? error.message : 'OCR failed';
                state.status.hidden = !state.overlayRequested;
            }
        } finally {
            state.loading = false;
        }
    }

    private async renderResult(state: ImageState, result: OcrResult, forceOverlay = false): Promise<void> {
        state.result = result;
        state.status.hidden = true;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());

        const showText = this.options.getSettings().ocrShowTextOverlay && (state.overlayRequested || forceOverlay);

        const sentence = result.lines.map(line => line.text).join('\n');
        for (const line of result.lines) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'jpdb-ocr-line';
            if (showText) button.classList.add('jpdb-ocr-line-visible');
            button.dataset.ocrText = line.text;
            button.dataset.vertical = String(line.vertical);
            button.title = line.text;
            button.style.left = `${100 * line.box.left / result.width}%`;
            button.style.top = `${100 * line.box.top / result.height}%`;
            button.style.width = `${100 * line.box.width / result.width}%`;
            button.style.height = `${100 * line.box.height / result.height}%`;
            button.style.writingMode = line.vertical ? 'vertical-rl' : 'horizontal-tb';
            button.style.fontSize = `clamp(12px, ${line.vertical ? 52 * line.box.width / result.width : 46 * line.box.height / result.height}vw, 24px)`;
            button.setAttribute('aria-label', line.text);
            button.textContent = showText ? line.text : '';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void this.options.onLookup(line.text, sentence);
            });
            state.overlay.append(button);
        }
        this.positionState(state.image);
    }

    private resetStateIfImageChanged(state: ImageState): void {
        const key = imageCacheKey(state.image);
        if (key === state.key) return;
        state.key = key;
        state.result = undefined;
        state.loading = false;
        state.overlayRequested = false;
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

export function normalizeOcrResult(value: unknown, fallbackWidth = 1, fallbackHeight = 1): OcrResult | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
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

    const japaneseLines = lines.filter(line => line.text.length > 0 && HAS_JAPANESE.test(line.text));
    return japaneseLines.length ? { width, height, lines: japaneseLines } : null;
}

export function readFallbackOcrResult(image: HTMLImageElement): OcrResult | null {
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

    return readAccessibleImageText(image, width, height);
}

async function recognizeViaBrowser(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const nativeResult = await recognizeViaTextDetector(canvas).catch(() => null);
    if (nativeResult?.lines.length) return nativeResult;
    return recognizeViaTesseract(canvas);
}

async function recognizeViaEndpoint(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const canvas = await imageToCanvas(image, settings.ocrMaxImagePixels);
    const payload = await canvasToBase64Payload(canvas);
    const body = JSON.stringify({
        id: imageCacheKey(image),
        language_code: settings.ocrLanguage || 'ja-JP',
        base64_image: payload.base64,
        ocr_engine: settings.ocrEngine || 'MangaOCR',
        detection_only: false,
    });
    const response = await requestJson(settings.ocrEndpointUrl.trim(), body, settings.audioTimeoutMs);
    return normalizeOcrResult(response, payload.width, payload.height);
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
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image encoding failed.')), 'image/jpeg', 0.86);
    });
    return { base64: (await blobToDataUrl(blob)).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
}

async function recognizeViaTextDetector(canvas: HTMLCanvasElement): Promise<OcrResult | null> {
    if (!window.TextDetector) return null;
    const detected = await new window.TextDetector().detect(canvas);
    const lines = detected
        .map(item => {
            const text = (item.rawValue ?? '').trim();
            const box = item.boundingBox
                ? clampBox({ left: item.boundingBox.x, top: item.boundingBox.y, width: item.boundingBox.width, height: item.boundingBox.height }, canvas.width, canvas.height)
                : null;
            return text && box ? { text, box, vertical: box.height > box.width * 1.5 && text.length > 1 } : null;
        })
        .filter((line): line is OcrLine => Boolean(line && HAS_JAPANESE.test(line.text)));
    return lines.length ? { width: canvas.width, height: canvas.height, lines } : null;
}

async function recognizeViaTesseract(canvas: HTMLCanvasElement): Promise<OcrResult | null> {
    const worker = await getTesseractWorker();
    const response = await worker.recognize(canvas);
    const data = response.data ?? {};
    const items = (data.lines?.length ? data.lines : data.words) ?? [];
    const lines = items
        .map(item => {
            const text = (item.text ?? '').replace(/\s+/g, '').trim();
            const bbox = item.bbox;
            const box = bbox ? clampBox({ left: bbox.x0, top: bbox.y0, width: bbox.x1 - bbox.x0, height: bbox.y1 - bbox.y0 }, canvas.width, canvas.height) : null;
            return text && box ? { text, box, vertical: box.height > box.width * 1.5 && text.length > 1 } : null;
        })
        .filter((line): line is OcrLine => Boolean(line && HAS_JAPANESE.test(line.text)));
    if (lines.length) return { width: canvas.width, height: canvas.height, lines };

    const text = (data.text ?? '').replace(/\s+/g, '').trim();
    return HAS_JAPANESE.test(text)
        ? { width: canvas.width, height: canvas.height, lines: [{ text, box: { left: 0, top: canvas.height * 0.68, width: canvas.width, height: canvas.height * 0.28 }, vertical: false }] }
        : null;
}

async function getTesseractWorker(): Promise<TesseractWorkerLike> {
    if (!tesseractWorker) {
        tesseractWorker = loadTesseract().then(tesseract => tesseract.createWorker('jpn', 1, {
            workerPath: TESSERACT_WORKER_URL,
            corePath: TESSERACT_CORE_URL,
            langPath: TESSERACT_LANG_URL,
            workerBlobURL: true,
        }));
    }
    return tesseractWorker;
}

async function loadTesseract(): Promise<TesseractLike> {
    if (window.Tesseract) return window.Tesseract;
    if (!tesseractLoader) {
        tesseractLoader = requestText(TESSERACT_SCRIPT_URL).then(code => {
            (0, eval)(`${code}\n//# sourceURL=${TESSERACT_SCRIPT_URL}`);
            if (!window.Tesseract) throw new Error('Browser OCR failed to load.');
            return window.Tesseract;
        });
    }
    return tesseractLoader;
}

function normalizeSimpleLine(value: unknown, width: number, height: number): OcrLine | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const text = stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
    const box = normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: Boolean(record.vertical ?? record.is_vertical) };
}

function normalizeStructuredOcrResult(value: unknown, width: number, height: number): OcrLine[] {
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const textLines = Array.isArray(record.text_lines) ? record.text_lines : [];
    const vertical = Boolean(record.is_vertical);
    const lines = textLines
        .map(item => {
            const lineRecord = item as Record<string, unknown>;
            const text = stringFrom(lineRecord?.content ?? lineRecord?.text);
            const box = normalizeBox(lineRecord.box ?? lineRecord.boundingBox ?? lineRecord, width, height);
            return text && box ? { text, box, vertical: Boolean(lineRecord.is_vertical ?? vertical) } : null;
        })
        .filter((line): line is OcrLine => line !== null);
    if (lines.length) return lines;

    const text = textLines.map(item => stringFrom((item as Record<string, unknown>)?.content)).filter(Boolean).join('');
    const box = normalizeBox(record.box, width, height);
    return text && box ? [{ text, box, vertical }] : [];
}

function normalizeBox(value: unknown, width: number, height: number): OcrRect | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
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
    if (readFallbackOcrResult(image)) return true;
    if (settings.ocrProvider === 'fast') return false;
    if (settings.ocrProvider === 'custom-json') return Boolean(settings.ocrEndpointUrl.trim());
    return true;
}

function readAccessibleImageText(image: HTMLImageElement, width: number, height: number): OcrResult | null {
    const candidates = [
        image.alt,
        image.title,
        image.getAttribute('aria-label'),
        image.closest('figure')?.querySelector('figcaption')?.textContent,
    ]
        .map(value => (value ?? '').replace(/\s+/g, ' ').trim())
        .filter(value => value.length >= 2 && HAS_JAPANESE.test(value));
    const text = candidates[0];
    if (!text) return null;
    const boxHeight = Math.max(44, height * 0.18);
    return {
        width,
        height,
        lines: [{
            text,
            box: { left: width * 0.04, top: height - boxHeight - height * 0.04, width: width * 0.92, height: boxHeight },
            vertical: false,
        }],
    };
}

function isNearViewport(element: Element, margin: number): boolean {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -margin && rect.top <= window.innerHeight + margin && rect.right >= -margin && rect.left <= window.innerWidth + margin;
}

function nodeContainsImage(node: Node): boolean {
    return node instanceof HTMLImageElement || (node instanceof Element && Boolean(node.querySelector('img')));
}

function imageCacheKey(image: HTMLImageElement): string {
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
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

function requestText(url: string): Promise<string> {
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'text',
                onload: response => response.status >= 200 && response.status < 300
                    ? resolve(String(response.responseText ?? response.response ?? ''))
                    : reject(new Error(`Script fetch returned ${response.status}.`)),
                onerror: reject,
            });
        });
    }
    return fetch(url).then(response => response.ok ? response.text() : Promise.reject(new Error(`Script fetch returned ${response.status}.`)));
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
