// Canvas-based manga readers (notably BookWalker's browser viewer) paint each
// page onto a <canvas> instead of an <img>, so the normal `document.images` OCR
// path never sees them. We snapshot the canvas to a data-URL <img> and feed it
// to the existing OCR pipeline — mirroring the paused-video-frame mechanism.
//
// Reference target — BookWalker browser viewer:
//   host:    viewer.bookwalker.jp / viewer-trial.bookwalker.jp  (page viewer.html)
//   pages:   <canvas class="default"> inside #wideScreenN containers
//   counter: #pageSliderCounter -> "current / total"
// The canvas is NOT tainted (the viewer composites decrypted pages itself), so
// toDataURL succeeds. See references/BookWalker-Screenshot-Simulator.

const CANVAS_READER_PAGE_SELECTOR = 'canvas.default';
const PAGE_COUNTER_SELECTOR = '#pageSliderCounter';

export function isBookwalkerViewerHost(hostname: string = location.hostname): boolean {
    return hostname === 'viewer.bookwalker.jp'
        || hostname === 'viewer-trial.bookwalker.jp'
        || hostname.endsWith('.bookwalker.jp');
}

/**
 * True on a page that paints manga into a <canvas> we can OCR. BookWalker's
 * viewer is the reference target; the DOM signature (a page counter alongside a
 * page canvas) also lets local fixtures and future viewers exercise the path.
 */
export function isCanvasReaderPage(): boolean {
    if (isBookwalkerViewerHost()) return true;
    return Boolean(document.querySelector(PAGE_COUNTER_SELECTOR) && document.querySelector(CANVAS_READER_PAGE_SELECTOR));
}

export function collectCanvasReaderSurfaces(): HTMLCanvasElement[] {
    if (!isCanvasReaderPage()) return [];
    return Array.from(document.querySelectorAll<HTMLCanvasElement>(CANVAS_READER_PAGE_SELECTOR));
}

/**
 * Cheap page-change fingerprint. Canvas redraws fire no DOM event, so we detect
 * page turns by combining the viewer's page counter ("3 / 48"), the rounded
 * scroll offset (vertical scroll mode) and the live surface count. A change means
 * the canvases were repainted and stale snapshots must be dropped + retaken.
 */
export function canvasReaderPageSignature(): string {
    const counter = document.querySelector(PAGE_COUNTER_SELECTOR)?.textContent?.trim() ?? '';
    const scroll = Math.round((window.scrollY || 0) / 40);
    const surfaces = document.querySelectorAll(CANVAS_READER_PAGE_SELECTOR).length;
    return `${counter}|${scroll}|${surfaces}`;
}

/** Snapshot a page canvas to a JPEG data URL, downscaling past `maxPixels`. */
export function captureCanvasDataUrl(canvas: HTMLCanvasElement, maxPixels: number): string | undefined {
    try {
        const width = canvas.width;
        const height = canvas.height;
        if (!width || !height) return undefined;
        const pixels = width * height;
        const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
        if (scale >= 1) return canvas.toDataURL('image/jpeg', 0.86);
        const scaled = document.createElement('canvas');
        scaled.width = Math.max(1, Math.round(width * scale));
        scaled.height = Math.max(1, Math.round(height * scale));
        const context = scaled.getContext('2d');
        if (!context) return undefined;
        context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
        return scaled.toDataURL('image/jpeg', 0.86);
    } catch {
        // Tainted canvas (cross-origin DRM drawn without CORS) — skip silently.
        return undefined;
    }
}

export function positionCanvasFrameImage(frame: HTMLImageElement, rect: DOMRect): void {
    frame.style.left = `${rect.left}px`;
    frame.style.top = `${rect.top}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
}
