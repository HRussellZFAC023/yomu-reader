// Canvas readers paint pages outside document.images, so OCR snapshots the
// visible page canvas and feeds it through the normal image pipeline. Known manga
// hosts use size/shape; generic pages also need viewport prominence + raster
// content so UI, WebGL, blank, tainted, and off-screen buffers are skipped.

const PAGE_COUNTER_SELECTOR = '#pageSliderCounter';

// NFBR marks the on-screen page buffer's container (#viewportN) with this class.
const CURRENT_SCREEN_CLASS = 'currentScreen';
const CURRENT_SCREEN_SELECTOR = `.${CURRENT_SCREEN_CLASS}`;
const VIEWPORT_CONTAINER_SELECTOR = '[id^="viewport"]';

// Known manga canvas hosts skip the generic prominence/content sniff.
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

const MIN_PAGE_CANVAS_DIMENSION = 600;
const MIN_PAGE_CANVAS_ASPECT = 0.3;
const MAX_PAGE_CANVAS_ASPECT = 3.2;
const MIN_RENDERED_DIMENSION = 200;
const VIEWPORT_COVERAGE_FRACTION = 0.4;
const VIEWPORT_AREA_FRACTION = 0.18;
const CONTENT_SAMPLE_SIZE = 20;
const MIN_CONTENT_CONTRAST = 36;
const MIN_CONTENT_BUCKETS = 3;
const MIN_OPAQUE_FRACTION = 0.5;

// Any BookWalker host that can paint the DRM canvas reader. The browser viewer is
// served BOTH from the apex `bookwalker.jp` (per-book `/de…/` reader paths) and the
// `viewer.`/`viewer-trial.` subdomains — and iOS Safari's address bar hides the
// subdomain, so reports show only `bookwalker.jp`. Matching the whole registrable
// domain keeps the tainted-canvas descramble pipeline (recorder + mirror replay,
// not the scrambled source-image fallback) enabled wherever the reader loads. This
// mirrors `isKnownCanvasReaderHost`'s `(^|.)bookwalker.jp$`, which already covered
// the apex; the two predicates disagreeing on the apex is what silently disabled
// OCR there. Storefront catalog pages share these hosts but carry no page-shaped
// reader canvas, so canvas/OCR callers stay inert on them.
export function isBookwalkerViewerHost(hostname: string = location.hostname): boolean {
    return hostname === 'bookwalker.jp' || hostname.endsWith('.bookwalker.jp');
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

// Reject incidental large canvases on unknown hosts.
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

// Real pages have mostly opaque, high-contrast raster content; flat/blank/tainted
// buffers fail here.
interface CanvasContentSample {
    buckets: number;
    contrast: number;
    hash: number;
    opaque: number;
}

function sampleCanvasContent(canvas: HTMLCanvasElement): CanvasContentSample | null {
    try {
        const sample = document.createElement('canvas');
        sample.width = CONTENT_SAMPLE_SIZE;
        sample.height = CONTENT_SAMPLE_SIZE;
        const context = sample.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(canvas, 0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, CONTENT_SAMPLE_SIZE, CONTENT_SAMPLE_SIZE);
        const buckets = new Set<number>();
        let min = 255;
        let max = 0;
        let hash = 2166136261;
        let opaque = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 8) continue;
            opaque++;
            const luminance = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
            if (luminance < min) min = luminance;
            if (luminance > max) max = luminance;
            buckets.add(luminance >> 4);
            hash ^= luminance;
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        return { buckets: buckets.size, contrast: max - min, hash, opaque };
    } catch {
        return null;
    }
}

export function looksLikeRenderedCanvasImage(canvas: HTMLCanvasElement): boolean {
    return Boolean(canvasRenderedContentSignature(canvas));
}

export function canvasRenderedContentSignature(canvas: HTMLCanvasElement): string | undefined {
    const sample = sampleCanvasContent(canvas);
    if (!sample) return undefined;
    if (sample.opaque < (CONTENT_SAMPLE_SIZE * CONTENT_SAMPLE_SIZE) * MIN_OPAQUE_FRACTION) return undefined;
    if (sample.contrast < MIN_CONTENT_CONTRAST || sample.buckets < MIN_CONTENT_BUCKETS) return undefined;
    return `${sample.hash.toString(36)}:${sample.contrast}:${sample.buckets}`;
}

function isLikelyPageCanvas(canvas: HTMLCanvasElement, lenient: boolean): boolean {
    if (!hasPageShape(canvas)) return false;
    if (lenient) return true;
    return isViewportProminent(canvas) && looksLikeRenderedCanvasImage(canvas);
}

function pageCanvases(hostname: string = location.hostname): HTMLCanvasElement[] {
    const lenient = isKnownCanvasReaderHost(hostname) || Boolean(document.querySelector(PAGE_COUNTER_SELECTOR));
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas'))
        .filter(canvas => isLikelyPageCanvas(canvas, lenient));
    return isBookwalkerViewerHost(hostname) ? preferCurrentScreenCanvases(canvases) : canvases;
}

// BookWalker's NFBR viewer keeps the previous/next page painted in an off-screen
// sibling buffer at the same screen rect as the visible page. When the on-screen
// buffer is identifiable (its #viewportN container carries `.currentScreen`),
// restrict OCR to it so the off-screen buffer never costs a Lens call or stacks a
// stale overlay over the current page. We anchor the match to the page's own
// #viewport container (not any ancestor) so a shared ancestor that ever gained
// `.currentScreen` (e.g. #renderer) could not select BOTH buffers; only when a
// canvas has no #viewport container do we fall back to a generic ancestor match.
// Falls back to all candidates (e.g. the cover, painted before any buffer is
// marked current) so a page is never dropped.
function preferCurrentScreenCanvases(canvases: HTMLCanvasElement[]): HTMLCanvasElement[] {
    if (canvases.length < 2) return canvases;
    const current = canvases.filter(isOnScreenViewportCanvas);
    if (!current.length) return canvases;
    const renderedCurrent = current.filter(looksLikeRenderedCanvasImage);
    if (renderedCurrent.length) return renderedCurrent;
    const renderedFallback = canvases
        .filter(canvas => !current.includes(canvas))
        .filter(looksLikeRenderedCanvasImage);
    return renderedFallback.length ? renderedFallback : current;
}

// The on-screen page lives in the #viewportN whose own container carries
// `.currentScreen`. Anchor to that container so a `.currentScreen` placed on a
// shared ancestor (e.g. #renderer) cannot match both buffers; if a canvas has no
// #viewport container (unknown future DOM), fall back to a generic ancestor match.
function isOnScreenViewportCanvas(canvas: HTMLCanvasElement): boolean {
    const viewport = canvas.closest<HTMLElement>(VIEWPORT_CONTAINER_SELECTOR);
    return viewport
        ? viewport.classList.contains(CURRENT_SCREEN_CLASS)
        : Boolean(canvas.closest(CURRENT_SCREEN_SELECTOR));
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

// True when a 2D canvas's pixels can actually be read. A canvas drawn from a
// cross-origin image without CORS is "tainted": getImageData/toDataURL throw
// "The operation is insecure." We probe readability before snapshotting so a
// tainted canvas never becomes a broken or garbage OCR frame.
export function isCanvasReadable(canvas: HTMLCanvasElement): boolean {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    try {
        context.getImageData(0, 0, 1, 1);
        return true;
    } catch {
        return false;
    }
}

// Some canvas readers fetch a normal page image that remains usable through
// GM_xmlhttpRequest even when the rendered canvas is tainted and the CDN sends no
// CORS headers. BookWalker/NFBR is deliberately excluded: its fetched resources
// can be scrambled, and only the rendered canvas/screenshot is trustworthy.
// This finds the most recent page image the viewer fetched — preferring common
// per-page tile URLs, then any large content image — so it generalises beyond one
// host when source-image fallback is safe.
const READER_PAGE_IMAGE_PATTERNS: RegExp[] = [
    /\/item\/xhtml\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i, // SpeedBinB / NFBR page tile
    /\/(?:page|img|image|content)s?\/.+\.(?:jpe?g|png|webp)(?:\?|$)/i,
];
const READER_PAGE_IMAGE_EXCLUDE = /(?:icon|logo|avatar|banner|thumb(?:nail)?|sprite|favicon|cover|ad[\b_-])/i;

export function readerCanvasSourceImageUrl(): string | undefined {
    let entries: PerformanceEntry[];
    try {
        entries = performance.getEntriesByType('resource');
    } catch {
        return undefined;
    }
    const urls = entries
        .map(entry => (entry as PerformanceResourceTiming).name)
        .filter(url => typeof url === 'string' && !READER_PAGE_IMAGE_EXCLUDE.test(url));
    for (const pattern of READER_PAGE_IMAGE_PATTERNS) {
        // Most recent match wins: navigating to a page loads its image last.
        for (let index = urls.length - 1; index >= 0; index--) {
            if (pattern.test(urls[index])) return urls[index];
        }
    }
    return undefined;
}

export function canUseReaderCanvasSourceImageFallback(hostname: string = location.hostname): boolean {
    return !isBookwalkerViewerHost(hostname);
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
