import { isAppleTouchBrowser } from '../platform/browser';

const SCALE_EPSILON = 0.05;
const MAX_PAGE_SCALE = 3;
const REDDIT_APPLE_TOUCH_ADAPTER = 'reddit-apple-touch-page-scale';
const rememberedRectScales = new WeakMap<object, number>();

export interface RedditOverlayEnvironment {
    hostname: string;
    appleTouch: boolean;
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
}

export interface RedditOverlayViewport {
    width: number;
    height: number;
    pageScale: number;
}

interface RedditVisualViewportMetrics {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
}

export interface RedditOverlayViewportBounds extends RedditOverlayViewport {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface RedditOverlayPoint {
    x: number;
    y: number;
}

export function isRedditHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    return normalized === 'reddit.com' || normalized.endsWith('.reddit.com');
}

/**
 * iPad Safari implements full-page zoom by narrowing the layout viewport and
 * scaling it back to the browser surface. Pinch zoom only changes the visual
 * viewport, so deliberately do not consult visualViewport.scale here.
 */
export function redditPageScale(environment: RedditOverlayEnvironment): number {
    if (!isRedditHostname(environment.hostname) || !environment.appleTouch) return 1;
    if (!positiveFinite(environment.innerWidth) || !positiveFinite(environment.outerWidth)) return 1;

    const scale = environment.outerWidth / environment.innerWidth;
    if (!Number.isFinite(scale) || scale <= 1 + SCALE_EPSILON) return 1;
    return Math.min(scale, MAX_PAGE_SCALE);
}

/** Screen-space viewport used by inverse-scaled Reddit controls on WebKit. */
export function redditOverlayViewport(environment = currentEnvironment()): RedditOverlayViewport {
    const pageScale = redditPageScale(environment);
    return {
        width: environment.innerWidth * pageScale,
        height: environment.innerHeight * pageScale,
        pageScale,
    };
}

/** Visible viewport bounds in the screen-space coordinate system of fixed chrome. */
export function redditOverlayViewportBounds(
    environment = currentEnvironment(),
    visualViewport = currentVisualViewport(),
): RedditOverlayViewportBounds {
    const pageScale = redditPageScale(environment);
    const width = positiveFinite(visualViewport?.width) ? visualViewport.width : environment.innerWidth;
    const height = positiveFinite(visualViewport?.height) ? visualViewport.height : environment.innerHeight;
    const left = finiteCoordinate(visualViewport?.offsetLeft) * pageScale;
    const top = finiteCoordinate(visualViewport?.offsetTop) * pageScale;
    const scaledWidth = width * pageScale;
    const scaledHeight = height * pageScale;
    return {
        left,
        top,
        right: left + scaledWidth,
        bottom: top + scaledHeight,
        width: scaledWidth,
        height: scaledHeight,
        pageScale,
    };
}

export function redditOverlayViewportBottomInset(
    environment = currentEnvironment(),
    visualViewport = currentVisualViewport(),
): number {
    const fullViewport = redditOverlayViewport(environment);
    const visibleBounds = redditOverlayViewportBounds(environment, visualViewport);
    return Math.max(0, fullViewport.height - visibleBounds.bottom);
}

/** Convert layout-space input coordinates to the compensated control space. */
export function redditLayoutPointToOverlay(
    point: RedditOverlayPoint,
    pageScale = redditOverlayViewport().pageScale,
): RedditOverlayPoint {
    return {
        x: point.x * pageScale,
        y: point.y * pageScale,
    };
}

/** Convert a host-page layout rect to the screen space used by the controls. */
export function redditLayoutRectToOverlay(
    rect: DOMRect | DOMRectReadOnly,
    pageScale = redditOverlayViewport().pageScale,
): DOMRect {
    return new DOMRect(
        rect.left * pageScale,
        rect.top * pageScale,
        rect.width * pageScale,
        rect.height * pageScale,
    );
}

/**
 * Record which fixed surface produced a detached fallback rect. Once its DOM
 * source disappears we still need to know whether the rect is already in the
 * compensated surface's screen-space coordinate system.
 */
export function rememberRedditSourceRect<T extends DOMRect | DOMRectReadOnly>(
    rect: T,
    source: Node | null | undefined,
    pageScale = redditOverlayViewport().pageScale,
): T {
    const root = compensatedRedditOverlayRoot(source);
    if (root) rememberedRectScales.set(rect, compensatedRootRectScale(root, pageScale));
    return rect;
}

/**
 * Normalize a DOM rect into the coordinate space used by inverse-scaled fixed
 * chrome. Host-page rects are layout-space and need the page-scale multiplier.
 * WebKit versions disagree on whether getBoundingClientRect() inside CSS zoom
 * is already screen-space, so compensated roots are measured once here rather
 * than making every geometry consumer guess.
 */
export function redditSourceRectToOverlay(
    rect: DOMRect | DOMRectReadOnly,
    source?: Node | null,
    pageScale = redditOverlayViewport().pageScale,
): DOMRect {
    const rememberedScale = rememberedRectScales.get(rect);
    const root = compensatedRedditOverlayRoot(source);
    const rectScale = rememberedScale
        ?? (root ? compensatedRootRectScale(root, pageScale) : pageScale);
    const overlayRect = scaleRect(rect, rectScale);
    rememberedRectScales.set(overlayRect, 1);
    return overlayRect;
}

export function isInsideCompensatedRedditOverlay(source: Node | null | undefined): boolean {
    return compensatedRedditOverlayRoot(source) !== null;
}

function compensatedRedditOverlayRoot(source: Node | null | undefined): HTMLElement | null {
    const element = source instanceof Element
        ? source
        : source?.parentElement;
    const root = element?.closest(`[data-jpdb-reader-scale-adapter="${REDDIT_APPLE_TOUCH_ADAPTER}"]`);
    return root instanceof HTMLElement ? root : null;
}

/**
 * Keep a Yomu-owned fixed content root at its intended physical size when
 * Reddit has a non-default iPad Safari page zoom. Full-screen host-facing
 * scrims deliberately stay outside this adapter.
 */
export function applyRedditOverlayScale(
    element: HTMLElement,
    environment = currentEnvironment(),
): void {
    const pageScale = redditPageScale(environment);
    if (pageScale === 1) {
        clearOwnedScale(element);
        return;
    }

    const inverseScale = 1 / pageScale;
    element.style.setProperty('zoom', formatScale(inverseScale), 'important');
    element.dataset.jpdbReaderScaleAdapter = REDDIT_APPLE_TOUCH_ADAPTER;
    element.dataset.jpdbReaderPageScale = formatScale(pageScale);
    element.dataset.jpdbReaderScaleCompensation = formatScale(inverseScale);
}

export function hasRedditOverlayScale(element: HTMLElement | null | undefined): boolean {
    return element?.dataset.jpdbReaderScaleAdapter === REDDIT_APPLE_TOUCH_ADAPTER;
}

function currentEnvironment(): RedditOverlayEnvironment {
    return {
        hostname: location.hostname,
        appleTouch: isAppleTouchBrowser(),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
    };
}

function currentVisualViewport(): RedditVisualViewportMetrics | undefined {
    const viewport = window.visualViewport;
    return viewport ? {
        width: viewport.width,
        height: viewport.height,
        offsetLeft: viewport.offsetLeft,
        offsetTop: viewport.offsetTop,
    } : undefined;
}

function clearOwnedScale(element: HTMLElement): void {
    if (!hasRedditOverlayScale(element)) return;
    element.style.removeProperty('zoom');
    delete element.dataset.jpdbReaderScaleAdapter;
    delete element.dataset.jpdbReaderPageScale;
    delete element.dataset.jpdbReaderScaleCompensation;
}

function compensatedRootRectScale(root: HTMLElement, pageScale = redditOverlayViewport().pageScale): number {
    if (pageScale === 1) return 1;
    const rect = root.getBoundingClientRect();
    const ratios = [
        dimensionRatio(rect.width, root.offsetWidth),
        dimensionRatio(rect.height, root.offsetHeight),
    ].filter((ratio): ratio is number => ratio !== undefined);
    if (!ratios.length) return 1;
    const measuredScale = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    const inverseScale = Number.parseFloat(root.dataset.jpdbReaderScaleCompensation ?? '') || 1 / pageScale;
    return Math.abs(measuredScale - inverseScale) < Math.abs(measuredScale - 1)
        ? pageScale
        : 1;
}

function dimensionRatio(rectSize: number, offsetSize: number): number | undefined {
    if (!positiveFinite(rectSize) || !positiveFinite(offsetSize)) return undefined;
    return rectSize / offsetSize;
}

function scaleRect(rect: DOMRect | DOMRectReadOnly, scale: number): DOMRect {
    return new DOMRect(rect.left * scale, rect.top * scale, rect.width * scale, rect.height * scale);
}

function positiveFinite(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteCoordinate(value: number | undefined): number {
    return Number.isFinite(value) ? value ?? 0 : 0;
}

function formatScale(value: number): string {
    return String(Number(value.toFixed(6)));
}
