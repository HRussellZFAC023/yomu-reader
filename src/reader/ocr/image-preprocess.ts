import { markCanvasMirrorSkip } from './canvas-mirror';
import type { OcrRect, OcrResult } from './response';

export function invertedCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
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
export const DARK_REGION_TRIGGER = 0.1;      // ≥10% of the page is dark → worth a second pass
const DARK_LINE_MEAN_LUMINANCE = 110; // only trust inverted lines over dark originals

export interface LuminanceField { size: number; lum: Uint8Array }

export function buildLuminanceField(image: HTMLImageElement): LuminanceField | null {
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

export function luminanceFieldDarkFraction(field: LuminanceField): number {
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
export function darkAreaIsRead(field: LuminanceField, normal: OcrResult | null): boolean {
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

export function drawImageToCanvas(image: HTMLImageElement, maxPixels: number): HTMLCanvasElement {
    const size = loadedImageSize(image);
    const canvas = scaledCanvas(size, maxPixels);
    markCanvasMirrorSkip(drawableCanvasContext(canvas)).drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

export interface OcrImageSlice {
    image: HTMLImageElement;
    left: number;
    totalWidth: number;
    totalHeight: number;
}

export async function splitImageIntoPageColumns(image: HTMLImageElement): Promise<OcrImageSlice[]> {
    const size = loadedImageSize(image);
    const mid = Math.round(size.width / 2);
    return Promise.all([
        cropOcrImageColumn(image, 0, mid, size),
        cropOcrImageColumn(image, mid, size.width - mid, size),
    ]);
}

async function cropOcrImageColumn(
    image: HTMLImageElement,
    left: number,
    width: number,
    size: { width: number; height: number },
): Promise<OcrImageSlice> {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, size.height);
    markCanvasMirrorSkip(drawableCanvasContext(canvas)).drawImage(image, left, 0, width, size.height, 0, 0, canvas.width, canvas.height);
    return {
        image: await loadImage(canvas.toDataURL('image/jpeg', 0.9)),
        left,
        totalWidth: size.width,
        totalHeight: size.height,
    };
}

export function offsetOcrResult(result: OcrResult, left: number, top: number, width: number, height: number): OcrResult {
    return {
        width,
        height,
        lines: result.lines.map(line => ({
            ...line,
            box: { ...line.box, left: line.box.left + left, top: line.box.top + top },
        })),
    };
}

export function mergeOcrResults(width: number, height: number, results: Array<OcrResult | null>): OcrResult | null {
    const lines = results.flatMap(result => result?.lines ?? []);
    return width && height && lines.length ? { width, height, lines } : null;
}

export function loadedImageSize(image: HTMLImageElement): { width: number; height: number } {
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

export function assertCanvasReadable(canvas: HTMLCanvasElement): void {
    canvas.getContext('2d')?.getImageData(0, 0, 1, 1);
}

export function loadImage(url: string, timeout = 0): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        let timer = 0;
        const settle = (fn: () => void): void => {
            if (timer) window.clearTimeout(timer);
            fn();
        };
        image.onload = () => settle(() => resolve(image));
        image.onerror = () => settle(() => reject(new Error('Image decode failed.')));
        if (timeout) timer = window.setTimeout(() => settle(() => reject(new Error('Image decode timed out.'))), timeout);
        image.src = url;
    });
}
