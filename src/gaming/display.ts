// Display maths for Yomu Gaming capture, kept free of Electron so it can be unit
// tested. The main process resolves the display the player is looking at (the one
// under the cursor) and threads the result through BOTH the overlay bounds and the
// screen grab — a single target per press, so the overlay can never show a frozen
// shot of a different monitor.

// OCR runs on the full-screen grab, so capture at the display's native framebuffer
// (logical size x scaleFactor) instead of a 1080p thumbnail. Retina/4K text is lost
// otherwise. Cap the long edge so a 5K/8K panel can't blow up the OCR payload.
export const MAX_CAPTURE_EDGE = 3840;

export interface GamingDisplayBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface GamingDisplayGeometry {
    id: string;
    bounds: GamingDisplayBounds;
    workArea: GamingDisplayBounds;
    size: { width: number; height: number };
    scaleFactor: number;
}

export interface GamingCaptureTarget {
    displayId: string;
    displayIndex: number;
    bounds: GamingDisplayBounds;
    captureSize: { width: number; height: number };
}

export interface GamingCaptureCandidate {
    kind: string;
    displayId: string;
}

// Native framebuffer size (logical x scaleFactor), long-edge-capped, so OCR sees
// full Retina/4K detail instead of a downscaled 1080p thumbnail. Each display brings
// its own scaleFactor, which is what keeps a mixed-DPI second monitor sharp.
export function nativeCaptureSize(
    display: Pick<GamingDisplayGeometry, 'size' | 'scaleFactor'>,
    maxEdge: number = MAX_CAPTURE_EDGE,
): { width: number; height: number } {
    const scale = positiveNumber(display.scaleFactor, 1);
    const rawWidth = Math.round(positiveNumber(display.size.width, 1) * scale);
    const rawHeight = Math.round(positiveNumber(display.size.height, 1) * scale);
    const longEdge = Math.max(rawWidth, rawHeight, 1);
    const limit = positiveNumber(maxEdge, MAX_CAPTURE_EDGE);
    const factor = longEdge > limit ? limit / longEdge : 1;
    return {
        width: Math.max(1, Math.round(rawWidth * factor)),
        height: Math.max(1, Math.round(rawHeight * factor)),
    };
}

// One target per capture: the overlay covers exactly the display we grabbed, at that
// display's own pixel density.
export function captureTargetForDisplay(
    displays: readonly GamingDisplayGeometry[],
    display: GamingDisplayGeometry,
    maxEdge: number = MAX_CAPTURE_EDGE,
): GamingCaptureTarget {
    const index = displays.findIndex(candidate => candidate.id === display.id);
    return {
        displayId: display.id,
        displayIndex: index >= 0 ? index : 0,
        bounds: { ...display.bounds },
        captureSize: nativeCaptureSize(display, maxEdge),
    };
}

// Pick the grab that belongs to the target display. Electron reports `display_id` on
// macOS and Windows, so an exact match is the normal path. Some Linux sessions report
// nothing at all — there screens come back in display order, so position is the next
// best signal, and a single screen is unambiguous either way.
export function selectCaptureSourceForDisplay<T extends GamingCaptureCandidate>(
    sources: readonly T[],
    target: Pick<GamingCaptureTarget, 'displayId' | 'displayIndex'>,
): T | null {
    const screens = sources.filter(source => source.kind === 'screen');
    if (!screens.length) return null;
    const exact = screens.find(source => source.displayId && source.displayId === target.displayId);
    if (exact) return exact;
    if (screens.length === 1) return screens[0];
    return screens[target.displayIndex] ?? screens[0];
}

function positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
