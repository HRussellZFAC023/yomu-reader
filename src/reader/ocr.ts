import { HAS_JAPANESE, escapeHtml, renderTokensToHtml } from './dom';
import type { JPDBToken, ReaderSettings } from './types';

type ParseJapanese = (text: string) => Promise<JPDBToken[]>;
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
    chip: HTMLButtonElement;
    status: HTMLElement;
    key: string;
    result?: OcrResult;
    loading: boolean;
    parsed: Map<string, string>;
}

interface OcrControllerOptions {
    getSettings: () => ReaderSettings;
    parseJapanese: ParseJapanese;
    onLookup: LookupText;
    onToast: (message: string) => void;
}

const MAX_CACHE_ITEMS = 36;

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
        const hasEndpoint = settings.ocrProvider !== 'off' && Boolean(settings.ocrEndpointUrl.trim());
        let count = 0;
        for (const image of Array.from(document.images)) {
            if (count >= settings.ocrMaxImagesPerPage) break;
            if (!isCandidateImage(image, settings)) continue;
            if (!hasEndpoint && !readFallbackOcrResult(image)) continue;
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
            const settings = this.options.getSettings();
            const hasEndpoint = settings.ocrProvider !== 'off' && Boolean(settings.ocrEndpointUrl.trim());
            this.options.onToast(hasEndpoint ? 'No readable images nearby.' : 'Add an OCR endpoint in settings to read images.');
            return;
        }
        images.forEach(image => this.enqueue(image));
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
                const hasEndpoint = current.ocrProvider !== 'off' && Boolean(current.ocrEndpointUrl.trim());
                if (current.ocrAutoScanImages && (hasEndpoint || readFallbackOcrResult(image))) this.enqueue(image);
            }
        }, { rootMargin });
    }

    private ensureState(image: HTMLImageElement): ImageState {
        const existing = this.states.get(image);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        overlay.dataset.jpdbReaderRoot = 'true';

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'jpdb-ocr-chip';
        chip.textContent = 'OCR';
        chip.title = 'Read text in this image';
        chip.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.enqueue(image, true);
        });

        const status = document.createElement('div');
        status.className = 'jpdb-ocr-status';
        status.hidden = true;

        overlay.append(chip, status);
        document.body.append(overlay);

        const state = { image, overlay, chip, status, key: imageCacheKey(image), loading: false, parsed: new Map<string, string>() };
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
        if (state.loading || state.result) return;
        if (!this.queue.includes(image)) this.queue.push(image);
        if (userRequested) state.status.textContent = 'Reading image...';
        this.drainQueue();
    }

    private drainQueue(): void {
        if (this.busy) return;
        const image = this.queue.shift();
        if (!image) return;
        this.busy = true;
        void this.scanImage(image)
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
        state.chip.textContent = '...';
        state.status.hidden = false;
        const canUseEndpoint = settings.ocrProvider !== 'off' && settings.ocrEndpointUrl.trim();
        state.status.textContent = canUseEndpoint ? 'Reading image...' : 'Tap to configure OCR';

        try {
            const fallback = readFallbackOcrResult(image);
            const result = canUseEndpoint
                ? await recognizeViaEndpoint(image, settings)
                : fallback;

            if (!result?.lines.length) {
                state.status.textContent = canUseEndpoint
                    ? 'No Japanese text found'
                    : 'Add an OCR endpoint in settings';
                state.chip.textContent = 'OCR';
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
                state.chip.textContent = 'OCR';
            }
        } finally {
            state.loading = false;
        }
    }

    private async renderResult(state: ImageState, result: OcrResult): Promise<void> {
        state.result = result;
        state.chip.textContent = '読';
        state.status.hidden = true;
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());

        if (!this.options.getSettings().ocrShowTextOverlay) return;

        const sentence = result.lines.map(line => line.text).join('\n');
        let searchOffset = 0;
        for (const line of result.lines) {
            const lineStart = Math.max(0, sentence.indexOf(line.text, searchOffset));
            searchOffset = lineStart + line.text.length + 1;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'jpdb-ocr-line';
            button.dataset.ocrText = line.text;
            button.dataset.vertical = String(line.vertical);
            button.title = line.text;
            button.style.left = `${100 * line.box.left / result.width}%`;
            button.style.top = `${100 * line.box.top / result.height}%`;
            button.style.width = `${100 * line.box.width / result.width}%`;
            button.style.height = `${100 * line.box.height / result.height}%`;
            button.style.writingMode = line.vertical ? 'vertical-rl' : 'horizontal-tb';
            button.style.fontSize = `clamp(13px, ${line.vertical ? 70 * line.box.width / result.width : 80 * line.box.height / result.height}vw, 34px)`;
            button.innerHTML = await this.renderLineText(line.text, sentence, state, lineStart);
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
        state.parsed.clear();
        state.overlay.querySelectorAll('.jpdb-ocr-line').forEach(node => node.remove());
        state.chip.textContent = 'OCR';
        state.status.hidden = true;
    }

    private async renderLineText(text: string, sentence: string, state: ImageState, lineStart: number): Promise<string> {
        const cached = state.parsed.get(text);
        if (cached) return cached;
        try {
            const tokens = await this.options.parseJapanese(sentence);
            const lineEnd = lineStart + text.length;
            const lineTokens = tokens
                .filter(token => token.start >= lineStart && token.end <= lineEnd)
                .map(token => ({ ...token, start: token.start - lineStart, end: token.end - lineStart, sentence }));
            const html = renderTokensToHtml(text, lineTokens, this.options.getSettings());
            state.parsed.set(text, html);
            return html;
        } catch {
            return escapeHtml(text);
        }
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
        state.chip.hidden = !this.options.getSettings().ocrTapToScan;
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
            const line = normalizeYomiNinjaResult(item, width, height);
            if (line) lines.push(line);
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

    const alt = image.alt?.replace(/\s+/g, ' ').trim();
    if (!alt || !HAS_JAPANESE.test(alt)) return null;
    return {
        width,
        height,
        lines: [{
            text: alt,
            vertical: false,
            box: { left: width * 0.08, top: height * 0.76, width: width * 0.84, height: height * 0.16 },
        }],
    };
}

async function recognizeViaEndpoint(image: HTMLImageElement, settings: ReaderSettings): Promise<OcrResult | null> {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels);
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

async function imageToBase64Payload(image: HTMLImageElement, maxPixels: number): Promise<{ base64: string; width: number; height: number }> {
    try {
        return await drawImageToBase64(image, maxPixels);
    } catch {
        const url = image.currentSrc || image.src;
        if (!url || url.startsWith('data:')) throw new Error('Image cannot be read by OCR.');
        const blob = await requestBlob(url);
        const objectUrl = URL.createObjectURL(blob);
        try {
            const loaded = await loadImage(objectUrl);
            return await drawImageToBase64(loaded, maxPixels);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }
}

async function drawImageToBase64(image: HTMLImageElement, maxPixels: number): Promise<{ base64: string; width: number; height: number }> {
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
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image encoding failed.')), 'image/jpeg', 0.86);
    });
    return { base64: (await blobToDataUrl(blob)).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
}

function normalizeSimpleLine(value: unknown, width: number, height: number): OcrLine | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const text = stringFrom(record.text) || stringFrom(record.content) || stringFrom(record.sentence);
    const box = normalizeBox(record.box ?? record.boundingBox ?? record, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: Boolean(record.vertical ?? record.is_vertical) };
}

function normalizeYomiNinjaResult(value: unknown, width: number, height: number): OcrLine | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const textLines = Array.isArray(record.text_lines) ? record.text_lines : [];
    const text = textLines
        .map(item => stringFrom((item as Record<string, unknown>)?.content))
        .filter(Boolean)
        .join('');
    const box = normalizeBox(record.box, width, height);
    if (!text || !box) return null;
    return { text, box, vertical: Boolean(record.is_vertical) };
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
        return {
            left: percent ? directLeft * width : directLeft,
            top: percent ? directTop * height : directTop,
            width: percent ? directWidth * width : directWidth,
            height: percent ? directHeight * height : directHeight,
        };
    }

    const points = ['top_left', 'top_right', 'bottom_right', 'bottom_left']
        .map(key => record[key] as Record<string, unknown> | undefined)
        .filter(Boolean);
    if (points.length < 2) return null;
    const xs = points.map(point => numberFrom(point?.x)).filter((item): item is number => item !== null);
    const ys = points.map(point => numberFrom(point?.y)).filter((item): item is number => item !== null);
    if (!xs.length || !ys.length) return null;
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
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
