export interface HoverPopoverPointerState {
    mode?: 'modal' | 'hover';
    popover?: HTMLElement;
    point?: { x: number; y: number };
    origin?: { x: number; y: number };
}

// The hover frame deliberately clears the pointer by a small gap. Count only
// the direct route from the opening point to the nearest frame edge as owned by
// the popup, so a learner can cross that gap without closing the lookup or
// accidentally parsing whatever page text happens to sit behind it.
const HOVER_POPOVER_TRANSIT_RADIUS_PX = 12;
export const HOVER_POPOVER_TRANSIT_SETTLE_DELAY_MS = 160;

export function isActiveHoverPopoverPointerContext(state: HoverPopoverPointerState): boolean {
    const { mode, popover, point } = state;
    if (mode !== 'hover' || !popover || !point) return false;
    const target = document.elementFromPoint(point.x, point.y);
    return Boolean(target && (target === popover || popover.contains(target)))
        || isHoverPopoverTransitActive(state);
}

export function isHoverPopoverTransitActive(state: HoverPopoverPointerState): boolean {
    const { mode, popover, point, origin } = state;
    if (mode !== 'hover' || !popover || !point || !origin) return false;
    return pointInsideHoverPopoverTransit(point, origin, popover.getBoundingClientRect());
}

function pointInsideHoverPopoverTransit(
    point: { x: number; y: number },
    origin: { x: number; y: number },
    popoverRect: DOMRect,
): boolean {
    if (popoverRect.width <= 0 || popoverRect.height <= 0) return false;
    const destination = {
        x: Math.max(popoverRect.left, Math.min(origin.x, popoverRect.right)),
        y: Math.max(popoverRect.top, Math.min(origin.y, popoverRect.bottom)),
    };
    const segmentX = destination.x - origin.x;
    const segmentY = destination.y - origin.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (segmentLengthSquared <= 0) return false;
    const projection = ((point.x - origin.x) * segmentX + (point.y - origin.y) * segmentY) / segmentLengthSquared;
    // The circular caps are not part of the bridge: the source word owns the
    // opening endpoint and the popover owns the destination. This keeps a
    // sideways move to an adjacent word from being swallowed by the corridor.
    if (projection <= 0 || projection >= 1) return false;
    const nearestX = origin.x + segmentX * projection;
    const nearestY = origin.y + segmentY * projection;
    return Math.hypot(point.x - nearestX, point.y - nearestY) <= HOVER_POPOVER_TRANSIT_RADIUS_PX;
}
