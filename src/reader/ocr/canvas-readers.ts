// Canvas readers paint pages outside document.images, so OCR snapshots the
// visible page canvas and feeds it through the normal image pipeline. Known manga
// hosts use size/shape; generic pages also need viewport prominence + raster
// content so UI, WebGL, blank, tainted, and off-screen buffers are skipped.

import { isBookwalkerViewerHost } from './canvas-hosts';
import { canvasMirrorContentToken, canvasMirrorTurnToken, markCanvasMirrorSkip } from './canvas-mirror';
import { attempt, attemptVoid } from '../core/attempt';

export { isBookwalkerViewerHost } from './canvas-hosts';

const PAGE_COUNTER_SELECTOR = '#pageSliderCounter';

// NFBR marks the on-screen page buffer's container (#viewportN) with this class.
const CURRENT_SCREEN_CLASS = 'currentScreen';
const CURRENT_SCREEN_SELECTOR = `.${CURRENT_SCREEN_CLASS}`;
const VIEWPORT_CONTAINER_SELECTOR = '[id^="viewport"]';
const BW_VERTICAL_SURFACE_SELECTOR = '.canvasRoot.verticalAxis[id], [id^="wideScreen"][id]';

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

// A canvas that is origin-unclean stays that way for the life of its backing
// store, so re-probing it is pure waste. Sampling a tainted BookWalker page canvas
// still pays the full source→sample drawImage (a ~10 MB GPU→CPU readback for a
// 1536x1694 page) before getImageData throws, and the page signature samples EVERY
// page canvas on every poll — so on a multi-surface vertical reader this burned
// tens of MB of pixel copy per poll to learn something already known. Remember the
// verdict per canvas, re-probing only when the backing store is reallocated.
const canvasTaintVerdict = new WeakMap<HTMLCanvasElement, { key: string; tainted: boolean; at: number }>();
// Resetting a canvas's backing store clears its taint, and a same-size reset leaves
// the dimension key unchanged — so the cached verdict is deliberately short-lived.
// Never let a stale "tainted" answer become permanent: that would silently disable
// OCR for the rest of the session, which is a far worse failure than a re-probe.
const CANVAS_TAINT_VERDICT_TTL_MS = 10_000;

function canvasKnownTainted(canvas: HTMLCanvasElement): boolean {
    const hit = canvasTaintVerdict.get(canvas);
    if (!hit || !hit.tainted) return false;
    if (hit.key !== `${canvas.width}x${canvas.height}`) return false;
    return Date.now() - hit.at < CANVAS_TAINT_VERDICT_TTL_MS;
}

function rememberCanvasTaint(canvas: HTMLCanvasElement, tainted: boolean): void {
    canvasTaintVerdict.set(canvas, { key: `${canvas.width}x${canvas.height}`, tainted, at: Date.now() });
}

function sampleCanvasContent(canvas: HTMLCanvasElement): CanvasContentSample | null {
    if (canvasKnownTainted(canvas)) return null;
    try {
        const sample = document.createElement('canvas');
        sample.width = CONTENT_SAMPLE_SIZE;
        sample.height = CONTENT_SAMPLE_SIZE;
        // Skip-mark so the mirror recorder ignores this Yomu-internal draw; otherwise
        // sampling the page canvas (every poll) would log a canvas→canvas composite
        // and drift the turn epoch the page signature depends on.
        const context = markCanvasMirrorSkip(sample.getContext('2d', { willReadFrequently: true }));
        if (!context) return null;
        context.drawImage(
            canvas,
            0,
            0,
            canvas.width,
            canvas.height,
            0,
            0,
            CONTENT_SAMPLE_SIZE,
            CONTENT_SAMPLE_SIZE,
        );
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
        rememberCanvasTaint(canvas, false);
        return { buckets: buckets.size, contrast: max - min, hash, opaque };
    } catch (error) {
        // ONLY a genuine cross-origin security error means "tainted". Any other
        // failure (a context that could not be acquired, an environment without a
        // real canvas implementation, a transient allocation failure) must NOT be
        // cached: doing so turns one bad probe into a verdict that suppresses
        // content sampling for every later call, which reads as "this page has no
        // content" rather than as an error.
        if (isCanvasTaintError(error)) rememberCanvasTaint(canvas, true);
        return null;
    }
}

function isCanvasTaintError(error: unknown): boolean {
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
        return error.name === 'SecurityError';
    }
    return error instanceof Error && /insecure|tainted|cross-origin/i.test(error.message);
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
    if (shouldForceCanvasReaderSurface(canvas)) return hasForcedCanvasReaderShape(canvas);
    if (!hasPageShape(canvas)) return false;
    if (lenient) return true;
    return isViewportProminent(canvas) && looksLikeRenderedCanvasImage(canvas);
}

function pageCanvases(
    hostname: string = location.hostname,
    options: { preferBookwalkerCurrent?: boolean } = {},
): HTMLCanvasElement[] {
    const lenient = isKnownCanvasReaderHost(hostname) || Boolean(document.querySelector(PAGE_COUNTER_SELECTOR));
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas'))
        .filter(canvas => !shouldSkipCanvasReaderSurface(canvas))
        .filter(isVisibleCanvasReaderSurface)
        .filter(canvas => isLikelyPageCanvas(canvas, lenient));
    if (!isBookwalkerViewerHost(hostname) || options.preferBookwalkerCurrent === false) return canvases;
    const continuousScroll = bookwalkerContinuousScrollCanvases(canvases, hostname);
    return continuousScroll.length ? continuousScroll : preferCurrentScreenCanvases(canvases);
}

function shouldSkipCanvasReaderSurface(canvas: HTMLCanvasElement): boolean {
    const mode = canvasOcrMode(canvas);
    return mode === 'off' || mode === 'manual';
}

function isVisibleCanvasReaderSurface(canvas: HTMLCanvasElement): boolean {
    if (canvas.hidden || canvas.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(canvas);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    if (Number(style.opacity || '1') <= 0) return false;
    return true;
}

function shouldForceCanvasReaderSurface(canvas: HTMLCanvasElement): boolean {
    return canvasOcrMode(canvas) === 'on';
}

export function isManualCanvasReaderSurface(canvas: HTMLCanvasElement): boolean {
    return canvasOcrMode(canvas) === 'manual'
        && isVisibleCanvasReaderSurface(canvas)
        && isLikelyPageCanvas(canvas, true);
}

function canvasOcrMode(canvas: HTMLCanvasElement): string | undefined {
    return canvas.dataset.yomuCanvasOcr
        || canvas.closest<HTMLElement>('[data-yomu-canvas-ocr]')?.dataset.yomuCanvasOcr;
}

function hasForcedCanvasReaderShape(canvas: HTMLCanvasElement): boolean {
    const { width, height } = canvas;
    if (Math.max(width, height) < MIN_PAGE_CANVAS_DIMENSION || Math.min(width, height) < MIN_RENDERED_DIMENSION) return false;
    const aspect = width / height;
    return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
}

// In BookWalker's vertical/continuous mode the visible document pages live in a
// stacked canvas run. The older NFBR DOM exposed that stack as #viewportW /
// .overScroll; live Firefox can expose the same mode under plain #viewport. The
// viewer can also leave #viewport0/#viewport1 page buffers mounted at the same
// screen rect; in Firefox those buffers may be blank from Yomu's side and have no
// mirror records, so treating them as current pages makes OCR spin forever with
// no frame to scan.
function bookwalkerContinuousScrollCanvases(canvases: HTMLCanvasElement[], hostname: string = location.hostname): HTMLCanvasElement[] {
    if (!isBookwalkerViewerHost(hostname)) return [];
    const byViewport = new Map<HTMLElement, HTMLCanvasElement[]>();
    for (const canvas of canvases) {
        const viewport = canvas.closest<HTMLElement>(VIEWPORT_CONTAINER_SELECTOR);
        if (!viewport) continue;
        const group = byViewport.get(viewport) ?? [];
        group.push(canvas);
        byViewport.set(viewport, group);
    }
    const scrollCanvases: HTMLCanvasElement[] = [];
    for (const [viewport, group] of byViewport) {
        const explicitContinuousViewport = viewport.id === 'viewportW' || viewport.classList.contains('overScroll');
        if (explicitContinuousViewport || hasVerticallyStackedDocumentPageRun(group)) scrollCanvases.push(...group);
    }
    if (scrollCanvases.length < 2) return [];
    return hasVerticallyStackedDocumentPageRun(scrollCanvases) ? scrollCanvases : [];
}

export function isBookwalkerContinuousScrollCanvas(canvas: HTMLCanvasElement): boolean {
    if (!isBookwalkerViewerHost()) return false;
    return bookwalkerContinuousScrollCanvases(pageCanvases(location.hostname, { preferBookwalkerCurrent: false })).includes(canvas);
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
    const visible = visibleViewportCanvases(canvases);
    if (hasDistinctVisiblePageLayout(visible)) return visible;
    const current = canvases.filter(isOnScreenViewportCanvas);
    if (current.length && visible.length === 1 && !current.includes(visible[0]!)) return visible;
    if (hasVerticallyStackedDocumentPageRun(canvases)) return canvases;
    if (!current.length) return canvases;
    const renderedCurrent = current.filter(looksLikeRenderedCanvasImage);
    if (renderedCurrent.length) return renderedCurrent;
    const renderedFallback = canvases
        .filter(canvas => !current.includes(canvas))
        .filter(looksLikeRenderedCanvasImage);
    return renderedFallback.length ? renderedFallback : current;
}

function visibleViewportCanvases(canvases: HTMLCanvasElement[]): HTMLCanvasElement[] {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return [];
    return canvases.filter(canvas => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0
            && rect.height > 0
            && rect.bottom >= 0
            && rect.right >= 0
            && rect.top <= viewportHeight
            && rect.left <= viewportWidth;
    });
}

function hasDistinctVisiblePageLayout(canvases: HTMLCanvasElement[]): boolean {
    return hasDistinctPageLayout(canvases.map(canvas => canvas.getBoundingClientRect()));
}

function hasVerticallyStackedDocumentPageRun(canvases: HTMLCanvasElement[]): boolean {
    const rects = canvases
        .map(canvas => canvas.getBoundingClientRect())
        .filter(rect => rect.width > 0 && rect.height > 0)
        .sort((a, b) => a.top - b.top);
    if (rects.length < 2) return false;
    for (let index = 1; index < rects.length; index += 1) {
        const previous = rects[index - 1];
        const current = rects[index];
        const smallerHeight = Math.max(1, Math.min(previous.height, current.height));
        const smallerWidth = Math.max(1, Math.min(previous.width, current.width));
        const verticalOverlap = Math.max(0, Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top));
        const horizontalOverlap = Math.max(0, Math.min(previous.right, current.right) - Math.max(previous.left, current.left));
        if (Math.abs(current.top - previous.top) > smallerHeight * 0.45
            && verticalOverlap / smallerHeight < 0.55
            && horizontalOverlap / smallerWidth > 0.55) return true;
    }
    return false;
}

function hasDistinctPageLayout(rects: DOMRect[]): boolean {
    const usefulRects = rects.filter(rect => rect.width > 0 && rect.height > 0);
    for (let i = 0; i < usefulRects.length; i += 1) {
        for (let j = i + 1; j < usefulRects.length; j += 1) {
            const a = usefulRects[i]!;
            const b = usefulRects[j]!;
            const smallerWidth = Math.max(1, Math.min(a.width, b.width));
            const smallerHeight = Math.max(1, Math.min(a.height, b.height));
            const largerWidth = Math.max(a.width, b.width);
            const largerHeight = Math.max(a.height, b.height);
            if (smallerWidth / largerWidth < 0.55 || smallerHeight / largerHeight < 0.55) continue;
            const horizontalOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) / smallerWidth;
            const verticalOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / smallerHeight;
            const separatedHorizontally = Math.abs(a.left - b.left) > smallerWidth * 0.45
                && horizontalOverlap < 0.55
                && verticalOverlap > 0.55;
            const separatedVertically = Math.abs(a.top - b.top) > smallerHeight * 0.45
                && verticalOverlap < 0.55
                && horizontalOverlap > 0.55;
            if (separatedHorizontally || separatedVertically) return true;
        }
    }
    return false;
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
    // Layout-free facts first: a page with hundreds of decorative
    // background-image tiles (e.g. video thumbnails) must reject every one
    // without a computed-style read or a forced layout.
    const knownHost = isKnownBackgroundImageReaderHost(hostname);
    if (!knownHost && !hasBackgroundReaderSignal(element)) return false;
    if (!backgroundImageReaderUrl(element)) return false;
    if (!hasRenderedPageShape(element.getBoundingClientRect())) return false;
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
    // Host recognition is enough and avoids a full DOM canvas scan on every
    // document/window/visualViewport scroll event in BookWalker continuous mode.
    return isKnownCanvasReaderHost(hostname)
        || isKnownBackgroundImageReaderHost(hostname)
        || isCanvasReaderPage(hostname)
        || isBackgroundImageReaderPage(hostname);
}

// Anything the raster detectors could EVER accept carries one of these signals;
// plain background-image styling without them can never qualify (see
// isLikelyBackgroundImagePage), so it is deliberately NOT a candidate signal.
const READER_RASTER_SIGNAL_SELECTOR = '[data-page-index], [data-mokuro-reader], [data-yomu-canvas-ocr]';
const READER_RASTER_CANDIDATE_NODE_SELECTOR = `canvas, ${PAGE_COUNTER_SELECTOR}, ${READER_RASTER_SIGNAL_SELECTOR}`;
const READER_RASTER_CANDIDATE_ATTRIBUTES = new Set([
    'width',
    'height',
    'data-page-index',
    'data-mokuro-reader',
    'data-yomu-canvas-ocr',
]);

/**
 * Layout-free census of everything the raster-reader detectors could ever
 * accept: a known reader host, a reader signal attribute, a reader page
 * counter, or a page-shaped canvas backing store. Canvas PAINT can flip the
 * full detectors without any DOM mutation, so a page-shaped canvas counts as a
 * candidate even when it currently fails the prominence/content sniff. When
 * this returns false the page is provably raster-reader-free and the sweeps
 * can be skipped until a mutation introduces a candidate.
 */
export function pageHasReaderRasterCandidates(hostname: string = location.hostname): boolean {
    if (isKnownCanvasReaderHost(hostname) || isKnownBackgroundImageReaderHost(hostname)) return true;
    if (document.querySelector(READER_RASTER_SIGNAL_SELECTOR)) return true;
    if (document.querySelector(PAGE_COUNTER_SELECTOR)) return true;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas')) {
        if (hasPageShape(canvas)) return true;
    }
    return false;
}

const pointerHitElements = new WeakMap<object, { element: Element | null }>();

/**
 * The element under one pointer event, hit-tested at most once per event.
 *
 * The OCR pointer path asks three separate questions of the same point — is the
 * pointer over our own overlay, over a candidate image, over a reader surface —
 * and each used to run its own `document.elementFromPoint`. That is three
 * hit-tests per `pointermove`, i.e. three per mouse-move frame on every page the
 * reader is installed on, for an answer that cannot differ: same event, same
 * coordinates, same frame.
 *
 * Keyed on the event object, so the memo lives exactly as long as the event does
 * and there is no window in which a stale point could be served.
 */
export function ocrPointerHitElement(event: Pick<PointerEvent, 'clientX' | 'clientY'>): Element | null {
    const cached = pointerHitElements.get(event);
    if (cached) return cached.element;
    const hit = typeof event.clientX === 'number' && typeof event.clientY === 'number'
        ? document.elementFromPoint?.(event.clientX, event.clientY) ?? null
        : null;
    pointerHitElements.set(event, { element: hit });
    return hit;
}

/**
 * True when a mutation batch could add a raster candidate to a page that was
 * proven raster-free: an added canvas / signal element (or subtree containing
 * one), a candidate attribute flip, or a canvas backing-store resize (a 300x150
 * placeholder growing to page shape mutates only width/height).
 */
export function mutationsMayAddReaderRasterCandidate(mutations: MutationRecord[]): boolean {
    return mutationsTouchReaderRasterCandidates(mutations, 'addedNodes');
}

/**
 * Mirror of the add matcher for pages memoized as NOT raster-free: a removed
 * candidate subtree (or a canvas resize, which can shrink a page-shaped canvas
 * back to decoration) may make the page raster-free again, so the memo is
 * dropped and the next check re-censuses instead of sweeping forever.
 */
export function mutationsMayRemoveReaderRasterCandidate(mutations: MutationRecord[]): boolean {
    return mutationsTouchReaderRasterCandidates(mutations, 'removedNodes');
}

function mutationsTouchReaderRasterCandidates(
    mutations: MutationRecord[],
    nodeList: 'addedNodes' | 'removedNodes',
): boolean {
    for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
            const attribute = mutation.attributeName;
            if (!attribute || !READER_RASTER_CANDIDATE_ATTRIBUTES.has(attribute)) continue;
            if (attribute === 'width' || attribute === 'height') {
                if (isCanvasNode(mutation.target)) return true;
                continue;
            }
            return true;
        }
        if (mutation.type !== 'childList') continue;
        for (const node of mutation[nodeList]) {
            if (nodeIsOrContainsReaderRasterCandidate(node)) return true;
        }
    }
    return false;
}

// Realm-neutral checks: a canvas created in a same-origin iframe and adopted
// into this document is NOT `instanceof` this realm's HTMLCanvasElement, but
// the document-wide census selector still finds it — the matcher must agree or
// a stale free verdict survives the adoption.
function isCanvasNode(node: Node): boolean {
    return node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === 'canvas';
}

function nodeIsOrContainsReaderRasterCandidate(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as Element;
    if (element.localName === 'canvas') return true;
    if (element.matches(READER_RASTER_CANDIDATE_NODE_SELECTOR)) return true;
    return Boolean(element.querySelector(READER_RASTER_CANDIDATE_NODE_SELECTOR));
}

export function canvasReaderPageCounter(): string {
    return document.querySelector(PAGE_COUNTER_SELECTOR)?.textContent?.trim() ?? '';
}

// Cheap page-change fingerprint for canvas readers.
export function canvasReaderPageSignature(): string {
    const canvases = pageCanvases();
    const counter = canvasReaderSignatureCounter(canvases);
    const tokens = canvasReaderContentTokens(canvases);
    const surfaces = tokens.length;
    const content = tokens.join(',');
    const backgrounds = backgroundImagePages()
        .map(element => `${element.getAttribute('data-page-index') ?? ''}:${backgroundImageReaderUrl(element) ?? ''}`)
        .join('|');
    // Keep the historical five-field shape but leave the scroll slot empty.
    // Scroll is not page identity; callers still parse counter/surfaces/content
    // from stable positions.
    return `${counter}||${surfaces}|${content}|${backgrounds}`;
}

function canvasReaderSignatureCounter(canvases: HTMLCanvasElement[]): string {
    const counter = canvasReaderPageCounter();
    if (isBookwalkerViewerHost() && shouldIgnoreBookwalkerCounterForCanvasSignature(canvases)) return '';
    return counter;
}

function shouldIgnoreBookwalkerCounterForCanvasSignature(canvases: HTMLCanvasElement[]): boolean {
    try {
        if (new URL(location.href).searchParams.get('cty') === '2') {
            return hasVerticallyStackedDocumentPageRun(canvases);
        }
    } catch { /* fall through to layout detection */ }
    return hasVerticallyStackedDocumentPageRun(canvases);
}

export function canvasPageContentToken(canvas: HTMLCanvasElement): string {
    try {
        const signature = canvasRenderedContentSignature(canvas);
        if (signature) return signature;
    } catch { /* tainted — fall through to the mirror identity */ }
    return canvasMirrorContentToken(canvas) || stableSurfaceToken(canvas) || canvasMirrorTurnToken();
}

export function canvasReaderSurfaceId(canvas: HTMLCanvasElement): string {
    return bookwalkerVerticalSurface(canvas)?.id ?? canvas.closest<HTMLElement>(VIEWPORT_CONTAINER_SELECTOR)?.id ?? '';
}

export function canvasReaderHasStableSurface(canvas: HTMLCanvasElement): boolean {
    return Boolean(bookwalkerVerticalSurface(canvas));
}

function stableSurfaceToken(canvas: HTMLCanvasElement): string {
    const id = bookwalkerVerticalSurface(canvas)?.id;
    return id ? `s:${id}:${canvas.width}x${canvas.height}` : '';
}

function bookwalkerVerticalSurface(canvas: HTMLCanvasElement): HTMLElement | null {
    if (!isBookwalkerViewerHost()) return null;
    const surface = canvas.closest<HTMLElement>(BW_VERTICAL_SURFACE_SELECTOR);
    if (!surface) return null;
    if (surface.classList.contains('verticalAxis')) return surface;
    return surface.closest('#viewportW,.overScroll') ? surface : null;
}

function canvasReaderContentTokens(canvases: HTMLCanvasElement[]): string[] {
    const tokens = canvases.map(canvas => {
        return attempt(() => canvasPageContentToken(canvas), '', 'canvas-readers.canvasReaderContentTokens');
    });
    return [...new Set(tokens)].filter(Boolean);
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
        // Skip-mark so the recorder ignores this Yomu-internal downscale draw.
        const context = markCanvasMirrorSkip(scaled.getContext('2d'));
        if (!context) return undefined;
        context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
        const dataUrl = scaled.toDataURL('image/jpeg', 0.86);
        releaseTransientCanvas(scaled);
        return dataUrl;
    } catch {
        // Tainted canvas (cross-origin DRM drawn without CORS) — skip silently.
        return undefined;
    }
}

// Drop a scratch canvas's backing store the moment its pixels have been read out.
// These are page-sized (a BookWalker page downscales to ~1.2 MP, and the mirror
// rebuild allocates a full 1536x1694 ≈ 10 MB buffer), and several are created per
// capture. Left to the collector they accumulate until Firefox runs a GC/CC, which
// is exactly the shape of the isolated 1-2 s main-thread freeze seen while reading.
// Setting either dimension reallocates the buffer to nothing, which is deterministic.
function releaseTransientCanvas(canvas: HTMLCanvasElement): void {
    // A canvas that refuses to resize simply waits for GC, as before.
    attemptVoid(() => {
        canvas.width = 0;
        canvas.height = 0;
    }, 'canvas-readers.releaseTransientCanvas');
}

export function captureCanvasRegionDataUrl(
    canvas: HTMLCanvasElement,
    surfaceRect: DOMRect,
    regionRect: DOMRect,
    maxPixels: number,
): string | undefined {
    try {
        if (!canvas.width || !canvas.height || !surfaceRect.width || !surfaceRect.height) return undefined;
        const scaleX = canvas.width / surfaceRect.width;
        const scaleY = canvas.height / surfaceRect.height;
        const sx = Math.max(0, Math.round((regionRect.left - surfaceRect.left) * scaleX));
        const sy = Math.max(0, Math.round((regionRect.top - surfaceRect.top) * scaleY));
        const sw = Math.min(canvas.width - sx, Math.max(1, Math.round(regionRect.width * scaleX)));
        const sh = Math.min(canvas.height - sy, Math.max(1, Math.round(regionRect.height * scaleY)));
        if (sw <= 0 || sh <= 0) return undefined;
        const pixels = sw * sh;
        const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(sw * scale));
        out.height = Math.max(1, Math.round(sh * scale));
        const context = markCanvasMirrorSkip(out.getContext('2d'));
        if (!context) return undefined;
        context.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
        const dataUrl = out.toDataURL('image/jpeg', 0.86);
        releaseTransientCanvas(out);
        return dataUrl;
    } catch {
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

export function backgroundImageReaderUrl(element: HTMLElement): string | undefined {
    const image = getComputedStyle(element).backgroundImage;
    return firstCssBackgroundUrl(image);
}

function firstCssBackgroundUrl(value: string): string | undefined {
    const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/iu);
    const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
    return raw.trim() || undefined;
}
