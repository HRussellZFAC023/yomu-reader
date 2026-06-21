import { coordinateInRange, hasPositiveRectArea } from './rect';

export interface PointerPoint {
    x: number;
    y: number;
}

export function pointerPointFromEvent(event: MouseEvent): PointerPoint | null {
    const point = { x: event.clientX, y: event.clientY };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

export function nearestElementByPoint(elements: HTMLElement[], point: PointerPoint): HTMLElement | null {
    let nearest: HTMLElement | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const element of elements) {
        const distance = squaredDistanceToVisibleElement(element, point);
        if (distance === null || distance >= nearestDistance) continue;
        nearest = element;
        nearestDistance = distance;
    }
    return nearest;
}

export function pointInElementClientRects(clientX: number, clientY: number, element: HTMLElement): boolean {
    return Array.from(element.getClientRects()).some(rect =>
        coordinateInRange(clientX, rect.left, rect.right, 0)
        && coordinateInRange(clientY, rect.top, rect.bottom, 0));
}

function squaredDistanceToVisibleElement(element: HTMLElement, point: PointerPoint): number | null {
    const rect = element.getBoundingClientRect();
    if (!hasPositiveRectArea(rect)) return null;
    const dx = distanceOutsideRange(point.x, rect.left, rect.right);
    const dy = distanceOutsideRange(point.y, rect.top, rect.bottom);
    return dx * dx + dy * dy;
}

function distanceOutsideRange(value: number, min: number, max: number): number {
    if (value < min) return min - value;
    if (value > max) return value - max;
    return 0;
}
