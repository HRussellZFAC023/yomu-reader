// Canvas-based manga readers paint each page onto a <canvas> instead of an
// <img> (usually to wrap DRM/scrambling), so the normal `document.images` OCR
// path never sees them. We snapshot the canvas to a data-URL <img> and feed it
// to the existing OCR pipeline — mirroring the paused-video-frame mechanism.
//
// Detection has to be host-aware: "OCR every large canvas everywhere" would
// fire on games, charts, map/photo editors, PDF.js, etc. So we activate only on
// known canvas-reader hosts OR on a page that exposes a reader page-counter, and
// then treat the LARGE, page-shaped canvases as surfaces. Size/shape — not class
// names or container ids — is what makes a page canvas, which is both general
// across readers and resilient to viewer rewrites (an earlier class-name match,
// `canvas.default`/`#renderer canvas`, silently broke when BookWalker shipped a
// new DOM). The controller's isHiddenByCss / isNearViewport then narrow capture
// to the page(s) actually on screen, so off-screen buffers and 0×0 transition
// canvases drop out on their own.
//
// Verified canvas viewers (2026-06-16):
//   bookwalker.jp     viewer.html — page canvases in #viewport0/#viewport1 under
//                     #renderer (visible spread = `.currentScreen`, buffers
//                     `visibility:hidden`); `canvas.dummy` + #frontScreen decoys.
//                     Page-turn signal: #pageSliderCounter ("3 / 48").
//   comic-walker.com  カドコミ (Kadokawa) — vertical scroll, one persistent
//                     canvas per page (1284×1825 etc.), no page counter.
// Page canvases are NOT tainted (the viewer composites decrypted pages itself),
// so toDataURL succeeds. See references/BookWalker-Screenshot-Simulator.

const PAGE_COUNTER_SELECTOR = '#pageSliderCounter';

// Hosts whose browser viewers are known to render manga pages onto <canvas>.
const CANVAS_READER_HOST_PATTERNS: RegExp[] = [
    /(^|\.)bookwalker\.jp$/i,
    /(^|\.)comic-walker\.com$/i,
];

// A manga page canvas is large and roughly page-shaped. The dimension floor
// rejects decoy/transition/sprite/UI canvases (BookWalker's 300×150 dummies,
// swatch canvases, etc.); the aspect window spans a single portrait page through
// a two-page landscape spread.
const MIN_PAGE_CANVAS_DIMENSION = 600;
const MIN_PAGE_CANVAS_ASPECT = 0.3;
const MAX_PAGE_CANVAS_ASPECT = 3.2;

export function isBookwalkerViewerHost(hostname: string = location.hostname): boolean {
    return hostname === 'viewer.bookwalker.jp'
        || hostname === 'viewer-trial.bookwalker.jp'
        || hostname.endsWith('.bookwalker.jp');
}

export function isKnownCanvasReaderHost(hostname: string = location.hostname): boolean {
    return CANVAS_READER_HOST_PATTERNS.some(pattern => pattern.test(hostname));
}

function isLikelyPageCanvas(canvas: HTMLCanvasElement): boolean {
    const { width, height } = canvas;
    if (width < MIN_PAGE_CANVAS_DIMENSION || height < MIN_PAGE_CANVAS_DIMENSION) return false;
    const aspect = width / height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
}

function pageCanvases(): HTMLCanvasElement[] {
    return Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas')).filter(isLikelyPageCanvas);
}

/**
 * True on a page that paints manga into a <canvas> we can OCR. We require a known
 * reader host (or a reader page-counter, which also lets local fixtures and other
 * viewers exercise the path) AND at least one large, page-shaped canvas — so the
 * path never activates on arbitrary canvas-using sites.
 */
export function isCanvasReaderPage(hostname: string = location.hostname): boolean {
    if (!isKnownCanvasReaderHost(hostname) && !document.querySelector(PAGE_COUNTER_SELECTOR)) return false;
    return pageCanvases().length > 0;
}

export function collectCanvasReaderSurfaces(hostname: string = location.hostname): HTMLCanvasElement[] {
    if (!isCanvasReaderPage(hostname)) return [];
    return pageCanvases();
}

/**
 * Cheap page-change fingerprint. Canvas redraws fire no DOM event, so we detect
 * page turns by combining the viewer's page counter ("3 / 48") and the live
 * surface count. A change means the canvases were repainted and stale snapshots
 * must be dropped + retaken. The rounded scroll offset is included ONLY for
 * BookWalker, whose single-viewport vertical mode repaints one canvas as you
 * scroll; multi-canvas scroll readers (e.g. ComicWalker) paint each page once
 * into its own persistent canvas, so scrolling must NOT invalidate them — the
 * per-canvas snapshot map already covers them as they enter the viewport.
 */
export function canvasReaderPageSignature(): string {
    const counter = document.querySelector(PAGE_COUNTER_SELECTOR)?.textContent?.trim() ?? '';
    const scroll = isBookwalkerViewerHost() ? Math.round((window.scrollY || 0) / 40) : 0;
    const surfaces = pageCanvases().length;
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
