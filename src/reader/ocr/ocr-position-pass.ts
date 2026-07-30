// Where every OCR layer on the page goes, once per animation frame.
//
// A35.22. The scroll path used to interleave DOM reads and writes for each recognized
// image: measure one image, write its layer, read its transforms and rendered frame, write
// its lines, then repeat. Each later read flushed the styles dirtied by the previous image.
//
// The public split is the fix: planOcrSurfacePosition only reads,
// applyOcrSurfacePosition only writes, and positionOcrSurfaces plans every layer before the
// first write. Reader-owned details stay behind OcrPositionSources instead of leaking the
// controller's canvas, background, video, and safe-inset state into this module.
import {
    composedOcrSurfaceTransform,
    layoutOcrOverlayLines,
    ocrOverlayLayerPlacement,
    ocrOverlayTypeface,
    type OcrLayerPlacement,
    type OcrOverlayFrame,
    type OcrSurfaceRect,
} from './ocr-overlay-geometry';

export interface OcrPositionSurface {
    image: HTMLImageElement;
    overlay: HTMLElement;
}

/** DOM-backed inputs collected during the read phase. */
export interface OcrPositionSources {
    sourceRect(image: HTMLImageElement): DOMRect | undefined;
    isVisible(image: HTMLImageElement, rect: DOMRect): boolean;
    transformSurface(image: HTMLImageElement): HTMLElement | null;
    renderedFrame(image: HTMLImageElement, rect: OcrSurfaceRect, viewportBottom: number): OcrOverlayFrame;
    fontScale(): number;
}

export interface OcrPositionPlan {
    overlay: HTMLElement;
    placement?: OcrLayerPlacement;
    frame?: OcrOverlayFrame;
    rootOffset?: OcrArtifactOffset;
    typeface?: string;
    fontScale?: number;
}

export interface OcrArtifactOffset {
    left: number;
    top: number;
}

const positionedLayoutKeys = new WeakMap<HTMLElement, string>();

/** Read-only: measure one surface and retain everything the write phase needs. */
export function planOcrSurfacePosition(
    surface: OcrPositionSurface,
    sources: OcrPositionSources,
): OcrPositionPlan {
    const { image, overlay } = surface;
    const rect = sources.sourceRect(image) ?? image.getBoundingClientRect();
    if (!sources.isVisible(image, rect)) return { overlay };
    const placement = ocrLayerPlacement(image, rect, overlay, sources);
    return {
        overlay,
        placement,
        frame: sources.renderedFrame(image, ocrPlacedSurfaceRect(rect, placement), rect.bottom),
        rootOffset: ocrArtifactRootOffset(overlay),
        typeface: ocrOverlayTypeface(overlay),
        fontScale: sources.fontScale(),
    };
}

/** Write-only on a warm line-layout cache: no surface/style measurement belongs here. */
export function applyOcrSurfacePosition(plan: OcrPositionPlan): void {
    const { placement, frame } = plan;
    const visible = Boolean(placement && frame);
    plan.overlay.hidden = !visible;
    setOcrOverlayAccessibility(plan.overlay, visible);
    if (!placement || !frame) return;
    setOcrArtifactPosition(plan.overlay, placement.left, placement.top, plan.rootOffset);
    plan.overlay.style.width = `${placement.width}px`;
    plan.overlay.style.height = `${placement.height}px`;
    setOcrLayerTransform(plan.overlay, placement.transform);
    layoutOcrOverlayIfChanged(
        plan.overlay,
        frame,
        plan.fontScale ?? 1,
        placement.linear,
        plan.typeface,
    );
}

/** Every layer: all reads, then all writes. */
export function positionOcrSurfaces(
    surfaces: Iterable<OcrPositionSurface>,
    sources: OcrPositionSources,
): void {
    const plans: OcrPositionPlan[] = [];
    for (const surface of surfaces) plans.push(planOcrSurfacePosition(surface, sources));
    for (const plan of plans) applyOcrSurfacePosition(plan);
}

function ocrLayerPlacement(
    image: HTMLImageElement,
    rect: DOMRect,
    overlay: HTMLElement,
    sources: OcrPositionSources,
): OcrLayerPlacement {
    const surface = sources.transformSurface(image);
    const linear = surface ? composedOcrSurfaceTransform(surface, overlay.parentElement, rect) : null;
    return ocrOverlayLayerPlacement(
        rect,
        linear,
        { width: surface?.offsetWidth ?? 0, height: surface?.offsetHeight ?? 0 },
    );
}

export function setOcrOverlayAccessibility(overlay: HTMLElement, visible: boolean): void {
    overlay.setAttribute('aria-hidden', String(!visible));
    if (!visible) {
        overlay.removeAttribute('role');
        overlay.removeAttribute('aria-label');
        return;
    }
    overlay.setAttribute('role', 'region');
    overlay.setAttribute('aria-label', `Yomu OCR text ${overlay.dataset.ocrLayerId ?? ''}`.trim());
}

// Identical writes still invalidate a compositor layer, so touch the transform only when
// the value changes.
export function setOcrLayerTransform(overlay: HTMLElement, transform: string): void {
    if (overlay.style.transform === transform) return;
    overlay.style.transform = transform;
    overlay.style.transformOrigin = transform ? '0 0' : '';
}

export function layoutOcrOverlayIfChanged(
    overlay: HTMLElement,
    frame: OcrOverlayFrame,
    fontScale: number,
    transform: OcrLayerPlacement['linear'],
    typeface?: string,
    force = false,
): void {
    const key = JSON.stringify([frame, fontScale, transform, typeface]);
    if (!force && positionedLayoutKeys.get(overlay) === key) return;
    layoutOcrOverlayLines(overlay, frame, fontScale, transform, typeface);
    positionedLayoutKeys.set(overlay, key);
}

// Frame math runs in the layer's own space. The measured viewport bottom stays separate
// because safe-inset checks need it and must not make bottom disagree with top + height.
export function ocrPlacedSurfaceRect(
    rect: DOMRect,
    placement: OcrLayerPlacement,
): OcrSurfaceRect {
    if (placement.width === rect.width && placement.height === rect.height) return rect;
    return {
        left: placement.left,
        top: placement.top,
        bottom: placement.top + placement.height,
        width: placement.width,
        height: placement.height,
    };
}

export function setOcrArtifactPosition(
    element: HTMLElement,
    viewportLeft: number,
    viewportTop: number,
    offset: OcrArtifactOffset = ocrArtifactRootOffset(element),
): void {
    element.style.left = `${viewportLeft - offset.left}px`;
    element.style.top = `${viewportTop - offset.top}px`;
}

export function ocrArtifactRootOffset(element: HTMLElement): OcrArtifactOffset {
    if (element.dataset.yomuOcrFullscreenHosted !== 'true') return { left: 0, top: 0 };
    const root = element.parentElement;
    if (!root || root === document.body || root === document.documentElement) return { left: 0, top: 0 };
    const rect = root.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
}
