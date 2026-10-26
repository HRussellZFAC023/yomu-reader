import { applyOverlayPageScale, layoutPointToOverlay, overlayViewport, sourceRectToOverlay, type OverlayPoint } from './page-scale';

/** The puck lives in visible-screen coordinates, including pinch zoom and pan.
 * The host document and its OCR layers keep their normal page coordinates. */
export function mountPuckViewport(button: HTMLButtonElement): HTMLElement {
    const root = document.createElement('div');
    root.className = 'jpdb-reader-puck-viewport';
    root.dataset.jpdbReaderRoot = 'true';
    root.dataset.jpdbReaderInteractionIgnore = 'true';
    root.append(button);
    document.body.append(root);
    syncPuckViewport(root);
    return root;
}

export function syncPuckViewport(root: HTMLElement): void {
    const viewport = window.visualViewport;
    const pinch = pinchScale();
    const scale = applyOverlayPageScale(root, undefined, pinch);
    const values = {
        left: `${(viewport?.offsetLeft ?? 0) * scale}px`,
        top: `${(viewport?.offsetTop ?? 0) * scale}px`,
        width: `${(viewport?.width ?? window.innerWidth) * scale}px`,
        height: `${(viewport?.height ?? window.innerHeight) * scale}px`,
    };
    for (const [property, value] of Object.entries(values)) {
        if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value, 'important');
    }
}

export function puckViewport(): { width: number; height: number; pageScale: number } {
    const { pageScale } = overlayViewport();
    const scale = pageScale * pinchScale();
    const viewport = window.visualViewport;
    return {
        width: (viewport?.width ?? window.innerWidth) * scale,
        height: (viewport?.height ?? window.innerHeight) * scale,
        pageScale: scale,
    };
}

export function puckPoint(point: OverlayPoint, pageScale = overlayViewport().pageScale): OverlayPoint {
    const viewport = window.visualViewport;
    return layoutPointToOverlay({
        x: point.x - (viewport?.offsetLeft ?? 0),
        y: point.y - (viewport?.offsetTop ?? 0),
    }, pageScale * pinchScale());
}

export function puckRect(button: HTMLButtonElement, pageScale = overlayViewport().pageScale): DOMRect {
    const scale = pageScale * pinchScale();
    const rect = sourceRectToOverlay(button.getBoundingClientRect(), button, scale);
    const viewport = window.visualViewport;
    return new DOMRect(
        rect.left - (viewport?.offsetLeft ?? 0) * scale,
        rect.top - (viewport?.offsetTop ?? 0) * scale,
        rect.width,
        rect.height,
    );
}

function pinchScale(): number {
    // Initial viewport fitting/page zoom can also report visualViewport.scale.
    // Only a narrower visible width represents additional pinch magnification.
    // Compare against the layout width WITHOUT a classic scrollbar: innerWidth
    // includes it and visualViewport.width does not, so desktop Linux/Windows
    // pages read as ~1.5% "pinched" and shrank the puck and its menu.
    const width = window.visualViewport?.width ?? window.innerWidth;
    const layoutWidth = document.documentElement?.clientWidth || window.innerWidth;
    const scale = layoutWidth / width;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
