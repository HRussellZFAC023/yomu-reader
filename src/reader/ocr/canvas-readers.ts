// Canvas-based manga readers paint each page onto a <canvas> instead of an
// <img> (usually to wrap DRM/scrambling), so the normal `document.images` OCR
// path never sees them. We snapshot the canvas to a data-URL <img> and feed it
// to the existing OCR pipeline — mirroring the paused-video-frame mechanism.
//
// Detection is GENERIC — it targets "canvas-wrapped rendered images" on any
// site, not a fixed host list. A manga page canvas is:
//   1. large + page-shaped (drawing-buffer size & aspect),
//   2. prominent in the viewport (a reader fills the screen with the page), and
//   3. carrying a RENDERED RASTER IMAGE — the decoded page. Test 3 is what tells
//      a wrapped page image apart from WebGL games, vector/UI canvases, charts
//      and blank buffers; it also rejects cross-origin-tainted canvases, which
//      throw on read and which we could not OCR anyway.
// Known reader hosts (or a reader page-counter) take a LENIENT path — size+shape
// only — because the context already disambiguates them and we want maximum
// reliability there; every other site must additionally clear the prominence +
// rendered-image tests before we spend an OCR call. Size/shape/content — not
// class names or container ids — is what makes a page canvas, which is resilient
// to viewer rewrites (an earlier class-name match, `canvas.default`/`#renderer
// canvas`, silently broke when BookWalker shipped a new DOM). The controller's
// isHiddenByCss / isNearViewport then narrow capture to the page(s) on screen, so
// off-screen buffers and transition canvases drop out on their own.
//
// Verified canvas viewers (2026-06-16): bookwalker.jp (viewer.html, #viewport
// canvases under #renderer, page counter), comic-walker.com (カドコミ, vertical
// scroll, one persistent canvas per page, no counter). Page canvases are NOT
// tainted (the viewer composites decrypted pages itself), so toDataURL /
// getImageData succeed. See references/BookWalker-Screenshot-Simulator.

const PAGE_COUNTER_SELECTOR = '#pageSliderCounter';

// Hosts known to render manga pages onto <canvas>. They skip the prominence +
// rendered-image heuristics (the host already disambiguates them); the generic
// path below covers every other reader.
const CANVAS_READER_HOST_PATTERNS: RegExp[] = [
    /(^|\.)bookwalker\.jp$/i,
    /(^|\.)comic-walker\.com$/i,
];
const BACKGROUND_IMAGE_READER_HOST_PATTERNS: RegExp[] = [
    /(^|\.)mokuro\.app$/i,
];
const BACKGROUND_IMAGE_READER_SELECTOR = [
    '[data-page-index]',
    '[style*="background-image"]',
    '[style*="background:"][style*="url("]',
].join(',');

const MIN_PAGE_CANVAS_DIMENSION = 600;     // drawing-buffer floor: rejects decoy/UI canvases
const MIN_PAGE_CANVAS_ASPECT = 0.3;        // a single portrait page …
const MAX_PAGE_CANVAS_ASPECT = 3.2;        // … through a two-page landscape spread
const MIN_RENDERED_DIMENSION = 200;        // must be laid out at a readable on-screen size
const VIEWPORT_COVERAGE_FRACTION = 0.4;    // a reader page fills ≥40% of a viewport axis …
const VIEWPORT_AREA_FRACTION = 0.18;       // … and ≥18% of the viewport area
const CONTENT_SAMPLE_SIZE = 20;            // downscale target for the rendered-image sniff
const MIN_CONTENT_CONTRAST = 36;           // luminance spread of a real page (B&W manga = high)
const MIN_CONTENT_BUCKETS = 3;             // distinct luminance bands (anti-aliasing/screentone)
const MIN_OPAQUE_FRACTION = 0.5;           // a mostly-transparent canvas is an overlay, not a page

export function isBookwalkerViewerHost(hostname: string = location.hostname): boolean {
    return hostname === 'viewer.bookwalker.jp'
        || hostname === 'viewer-trial.bookwalker.jp'
        || hostname.endsWith('.bookwalker.jp');
}

export function isKnownCanvasReaderHost(hostname: string = location.hostname): boolean {
    return CANVAS_READER_HOST_PATTERNS.some(pattern => pattern.test(hostname));
}

export function isKnownBackgroundImageReaderHost(hostname: string = location.hostname): boolean {
    return BACKGROUND_IMAGE_READER_HOST_PATTERNS.some(pattern => pattern.test(hostname));
}

function hasPageShape(canvas: HTMLCanvasElement): boolean {
    const { width, height } = canvas;
    if (width < MIN_PAGE_CANVAS_DIMENSION || height < MIN_PAGE_CANVAS_DIMENSION) return false;
    const aspect = width / height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
}

function hasRenderedPageShape(rect: DOMRect): boolean {
    if (rect.width < MIN_RENDERED_DIMENSION || rect.height < MIN_RENDERED_DIMENSION) return false;
    const aspect = rect.width / rect.height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
}

// Reader pages dominate the viewport; this rejects incidental large canvases
// (thumbnails rendered to canvas, embedded widgets, sprite buffers) on unknown
// sites without needing to know the host.
function isViewportProminent(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_RENDERED_DIMENSION || rect.height < MIN_RENDERED_DIMENSION) return false;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    const coversAxis = rect.width >= viewportWidth * VIEWPORT_COVERAGE_FRACTION
        || rect.height >= viewportHeight * VIEWPORT_COVERAGE_FRACTION;
    const coversArea = rect.width * rect.height >= viewportWidth * viewportHeight * VIEWPORT_AREA_FRACTION;
    return coversAxis && coversArea;
}

// A wrapped page image has rich, mostly-opaque raster content: high luminance
// spread across several bands (manga is high-contrast B&W with screentone/anti-
// aliasing greys; colour pages span many bands too). Flat UI/solid canvases and
// near-blank buffers fail the contrast/bucket test; WebGL/vector canvases tend to
// as well; tainted canvases throw on read and are rejected (un-OCR-able anyway).
export function looksLikeRenderedCanvasImage(canvas: HTMLCanvasElement): boolean {
    try {
        const sample = document.createElement('canvas');
        sample.width = CONTENT_SAMPLE_SIZE;
        sample.height = CONTENT_SAMPLE_SIZE;
        const context = sample.getContext('2d', { willReadFrequently: true });
        if (!context) return false;
        context.drawImage(canvas, 0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
        const buckets = new Set<number>();
        let min = 255;
        let max = 0;
        let opaque = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 8) continue;
            opaque++;
            const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
            if (luminance < min) min = luminance;
            if (luminance > max) max = luminance;
            buckets.add(luminance >> 4);
        }
        if (opaque < (data.length / 4) * MIN_OPAQUE_FRACTION) return false;
        return max - min >= MIN_CONTENT_CONTRAST && buckets.size >= MIN_CONTENT_BUCKETS;
    } catch {
        return false;
    }
}

function isLikelyPageCanvas(canvas: HTMLCanvasElement, lenient: boolean): boolean {
    if (!hasPageShape(canvas)) return false;
    if (lenient) return true;
    return isViewportProminent(canvas) && looksLikeRenderedCanvasImage(canvas);
}

function pageCanvases(hostname: string = location.hostname): HTMLCanvasElement[] {
    const lenient = isKnownCanvasReaderHost(hostname) || Boolean(document.querySelector(PAGE_COUNTER_SELECTOR));
    return Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas'))
        .filter(canvas => isLikelyPageCanvas(canvas, lenient));
}

function hasBackgroundReaderSignal(element: HTMLElement): boolean {
    return element.hasAttribute('data-page-index')
        || Boolean(element.closest('[data-mokuro-reader]'));
}

function isLikelyBackgroundImagePage(element: HTMLElement, hostname: string): boolean {
    if (!backgroundImageReaderUrl(element)) return false;
    const rect = element.getBoundingClientRect();
    if (!hasRenderedPageShape(rect)) return false;
    const knownHost = isKnownBackgroundImageReaderHost(hostname);
    if (!knownHost && !hasBackgroundReaderSignal(element)) return false;
    return knownHost || isViewportProminent(element);
}

function backgroundImagePages(hostname: string = location.hostname): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(BACKGROUND_IMAGE_READER_SELECTOR))
        .filter(element => isLikelyBackgroundImagePage(element, hostname));
}

/**
 * True on a page that paints manga into a <canvas> we can OCR. Generic: any
 * large, page-shaped, viewport-prominent canvas carrying a rendered raster image
 * qualifies. A known reader host / reader page-counter relaxes the prominence +
 * content tests (the context already disambiguates them).
 */
export function isCanvasReaderPage(hostname: string = location.hostname): boolean {
    return pageCanvases(hostname).length > 0;
}

export function collectCanvasReaderSurfaces(hostname: string = location.hostname): HTMLCanvasElement[] {
    return pageCanvases(hostname);
}

export function isBackgroundImageReaderPage(hostname: string = location.hostname): boolean {
    return backgroundImagePages(hostname).length > 0;
}

export function collectBackgroundImageReaderSurfaces(hostname: string = location.hostname): HTMLElement[] {
    return backgroundImagePages(hostname);
}

export function isReaderRasterPage(hostname: string = location.hostname): boolean {
    return isCanvasReaderPage(hostname)
        || isBackgroundImageReaderPage(hostname)
        || isKnownCanvasReaderHost(hostname)
        || isKnownBackgroundImageReaderHost(hostname);
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
    const backgrounds = backgroundImagePages()
        .map(element => `${element.getAttribute('data-page-index') ?? ''}:${backgroundImageReaderUrl(element) ?? ''}`)
        .join('|');
    return `${counter}|${scroll}|${surfaces}|${backgrounds}`;
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

export function backgroundImageReaderUrl(element: HTMLElement): string | undefined {
    const image = getComputedStyle(element).backgroundImage;
    return firstCssBackgroundUrl(image);
}

function firstCssBackgroundUrl(value: string): string | undefined {
    const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/iu);
    const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
    return raw.trim() || undefined;
}
