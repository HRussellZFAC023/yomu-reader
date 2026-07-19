import { isAppleTouchBrowser } from '../platform/browser';

const SCALE_EPSILON = 0.05;
const MAX_PAGE_SCALE = 3;
/** Safari's selectable full-page zoom steps above 100%. */
const SAFARI_PAGE_ZOOM_STEPS = [1.15, 1.25, 1.5, 1.75, 2, 2.5, 3];
const ZOOM_STEP_TOLERANCE = 0.025;
/** Chrome is carved out of the window height before the zoom divides it, so
    the height ratio runs slightly above the width ratio — never far below. */
const MIN_AXIS_AGREEMENT = 0.97;
const MAX_AXIS_AGREEMENT = 1.4;
const APPLE_TOUCH_ADAPTER = 'apple-touch-page-scale';
const rememberedRectScales = new WeakMap<object, number>();

export interface PageScaleEnvironment {
    appleTouch: boolean;
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    screenWidth: number;
    screenHeight: number;
}

export interface OverlayViewport {
    width: number;
    height: number;
    pageScale: number;
}

interface VisualViewportMetrics {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
}

export interface OverlayViewportBounds extends OverlayViewport {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface OverlayPoint {
    x: number;
    y: number;
}

/**
 * iPad Safari implements full-page zoom by narrowing the layout viewport and
 * scaling it back to the browser surface. Pinch zoom only changes the visual
 * viewport, so deliberately do not consult visualViewport.scale here.
 *
 * The browser-surface signal (outerWidth vs innerWidth) only fires in
 * emulation: real iOS WebKit answers outerWidth from the web view itself, so
 * on-device it always equals innerWidth and the zoom is invisible to it.
 * On-device the zoom is instead visible as the layout viewport shrinking
 * against the physical screen, checked second.
 */
export function overlayPageScale(environment: PageScaleEnvironment): number {
    if (!environment.appleTouch) return 1;
    if (!positiveFinite(environment.innerWidth)) return 1;

    if (positiveFinite(environment.outerWidth)) {
        const surfaceScale = environment.outerWidth / environment.innerWidth;
        if (Number.isFinite(surfaceScale) && surfaceScale > 1 + SCALE_EPSILON) {
            return Math.min(surfaceScale, MAX_PAGE_SCALE);
        }
    }
    return screenDerivedPageScale(environment);
}

/**
 * Infer on-device full-page zoom from screen-vs-layout-viewport shrinkage.
 * Full-page zoom divides both axes together, so both must agree; Split View
 * and Slide Over windows shrink one axis far more than the other and must
 * never read as zoom. WebKit versions disagree on whether screen dimensions
 * follow the interface orientation, so both pairings are evaluated. The width
 * ratio must also land on one of Safari's selectable zoom steps — arbitrary
 * window proportions (Stage Manager, splits) rarely do.
 */
function screenDerivedPageScale(environment: PageScaleEnvironment): number {
    const { innerWidth, innerHeight, screenWidth, screenHeight } = environment;
    if (!positiveFinite(innerHeight) || !positiveFinite(screenWidth) || !positiveFinite(screenHeight)) return 1;

    const pairings: ReadonlyArray<readonly [number, number]> = [
        [screenWidth / innerWidth, screenHeight / innerHeight],
        [screenHeight / innerWidth, screenWidth / innerHeight],
    ];
    for (const [widthRatio, heightRatio] of pairings) {
        if (widthRatio <= 1 + SCALE_EPSILON) continue;
        const step = nearestSafariZoomStep(widthRatio);
        if (step === undefined) continue;
        if (heightRatio < widthRatio * MIN_AXIS_AGREEMENT) continue;
        if (heightRatio > widthRatio * MAX_AXIS_AGREEMENT) continue;
        return step;
    }
    return 1;
}

function nearestSafariZoomStep(ratio: number): number | undefined {
    for (const step of SAFARI_PAGE_ZOOM_STEPS) {
        if (Math.abs(ratio - step) <= step * ZOOM_STEP_TOLERANCE) return step;
    }
    return undefined;
}

/** Screen-space viewport used by inverse-scaled fixed controls on WebKit. */
export function overlayViewport(environment = currentEnvironment()): OverlayViewport {
    const pageScale = overlayPageScale(environment);
    return {
        width: environment.innerWidth * pageScale,
        height: environment.innerHeight * pageScale,
        pageScale,
    };
}

/** Visible viewport bounds in the screen-space coordinate system of fixed chrome. */
export function overlayViewportBounds(
    environment = currentEnvironment(),
    visualViewport = currentVisualViewport(),
): OverlayViewportBounds {
    const pageScale = overlayPageScale(environment);
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

export function overlayViewportBottomInset(
    environment = currentEnvironment(),
    visualViewport = currentVisualViewport(),
): number {
    const fullViewport = overlayViewport(environment);
    const visibleBounds = overlayViewportBounds(environment, visualViewport);
    return Math.max(0, fullViewport.height - visibleBounds.bottom);
}

/** Convert layout-space input coordinates to the compensated control space. */
export function layoutPointToOverlay(
    point: OverlayPoint,
    pageScale = overlayViewport().pageScale,
): OverlayPoint {
    return {
        x: point.x * pageScale,
        y: point.y * pageScale,
    };
}

/** Convert a host-page layout rect to the screen space used by the controls. */
export function layoutRectToOverlay(
    rect: DOMRect | DOMRectReadOnly,
    pageScale = overlayViewport().pageScale,
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
export function rememberOverlaySourceRect<T extends DOMRect | DOMRectReadOnly>(
    rect: T,
    source: Node | null | undefined,
    pageScale = overlayViewport().pageScale,
): T {
    const root = compensatedOverlayRoot(source);
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
export function sourceRectToOverlay(
    rect: DOMRect | DOMRectReadOnly,
    source?: Node | null,
    pageScale = overlayViewport().pageScale,
): DOMRect {
    const rememberedScale = rememberedRectScales.get(rect);
    const root = compensatedOverlayRoot(source);
    const rectScale = rememberedScale
        ?? (root ? compensatedRootRectScale(root, pageScale) : pageScale);
    const overlayRect = scaleRect(rect, rectScale);
    rememberedRectScales.set(overlayRect, 1);
    return overlayRect;
}

export function isInsideCompensatedOverlay(source: Node | null | undefined): boolean {
    return compensatedOverlayRoot(source) !== null;
}

function compensatedOverlayRoot(source: Node | null | undefined): HTMLElement | null {
    const element = source instanceof Element
        ? source
        : source?.parentElement;
    const root = element?.closest(`[data-jpdb-reader-scale-adapter="${APPLE_TOUCH_ADAPTER}"]`);
    return root instanceof HTMLElement ? root : null;
}

/**
 * Keep a Yomu-owned fixed content root at its intended physical size when
 * the host page has a non-default iPad Safari page zoom. Full-screen
 * host-facing scrims deliberately stay outside this adapter.
 */
export function applyOverlayPageScale(
    element: HTMLElement,
    environment = currentEnvironment(),
): void {
    const pageScale = overlayPageScale(environment);
    if (pageScale === 1) {
        clearOwnedScale(element);
        return;
    }

    const inverseScale = 1 / pageScale;
    element.style.setProperty('zoom', formatScale(inverseScale), 'important');
    element.dataset.jpdbReaderScaleAdapter = APPLE_TOUCH_ADAPTER;
    element.dataset.jpdbReaderPageScale = formatScale(pageScale);
    element.dataset.jpdbReaderScaleCompensation = formatScale(inverseScale);
}

export function hasOverlayPageScale(element: HTMLElement | null | undefined): boolean {
    return element?.dataset.jpdbReaderScaleAdapter === APPLE_TOUCH_ADAPTER;
}

function currentEnvironment(): PageScaleEnvironment {
    return {
        appleTouch: isAppleTouchBrowser(),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        screenWidth: window.screen?.width ?? 0,
        screenHeight: window.screen?.height ?? 0,
    };
}

function currentVisualViewport(): VisualViewportMetrics | undefined {
    const viewport = window.visualViewport;
    return viewport ? {
        width: viewport.width,
        height: viewport.height,
        offsetLeft: viewport.offsetLeft,
        offsetTop: viewport.offsetTop,
    } : undefined;
}

function clearOwnedScale(element: HTMLElement): void {
    if (!hasOverlayPageScale(element)) return;
    element.style.removeProperty('zoom');
    delete element.dataset.jpdbReaderScaleAdapter;
    delete element.dataset.jpdbReaderPageScale;
    delete element.dataset.jpdbReaderScaleCompensation;
}

function compensatedRootRectScale(root: HTMLElement, pageScale = overlayViewport().pageScale): number {
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
