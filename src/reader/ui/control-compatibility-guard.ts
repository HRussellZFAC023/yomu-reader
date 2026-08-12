import { sandboxSharedState, syntheticEventsAllowed } from './sandbox-shared-state';

const GUARD_LIFETIME_MS = 750;
// Compatibility mouse coordinates may be touch-adjusted beyond either pointer
// endpoint. A new physical pointer clears the guard before its mouse events, so
// this bounded margin covers browser adjustment without consuming the next
// independent mouse gesture.
const COORDINATE_SLOP_PX = 16;

type CompatibilityGuard = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    expiresAt: number;
};

// A guard armed by one bundle's adapter must suppress the compatibility tail
// seen by every bundle in the sandbox, and each document installs one guard.
const { guardedDocuments, guards } = sandboxSharedState('yomu.compat-guard.v1', () => ({
    guardedDocuments: new WeakSet<Document>(),
    guards: new WeakMap<Document, CompatibilityGuard>(),
}));

export function installCompatibilityGuard(target: Document): void {
    if (guardedDocuments.has(target)) return;
    guardedDocuments.add(target);
    const clear = (event: Event): void => {
        if (blockable(event)) guards.delete(target);
    };
    for (const eventName of ['pointerdown', 'pointerover', 'pointermove', 'pointercancel'] as const) {
        target.defaultView?.addEventListener(eventName, clear, { capture: true, passive: true });
        target.addEventListener(eventName, clear, { capture: true, passive: true });
    }
    for (const eventName of ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'] as const) {
        target.addEventListener(eventName, event => suppressCompatibilityEvent(event, target), {
            capture: true,
            passive: false,
        });
    }
}

export function armCompatibilityGuard(
    target: Document,
    event: PointerEvent,
    startX: number,
    startY: number,
): void {
    installCompatibilityGuard(target);
    guards.set(target, {
        minX: Math.min(startX, event.clientX),
        maxX: Math.max(startX, event.clientX),
        minY: Math.min(startY, event.clientY),
        maxY: Math.max(startY, event.clientY),
        expiresAt: Date.now() + GUARD_LIFETIME_MS,
    });
}

function suppressCompatibilityEvent(event: MouseEvent, target: Document): void {
    const guard = guards.get(target);
    if (!guard || !blockable(event)) return;
    if (Date.now() > guard.expiresAt) return void guards.delete(target);
    if (!withinGestureEnvelope(event, guard) || !isCompatibilityMouseEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click') guards.delete(target);
}

function blockable(event: Event): boolean {
    return event.isTrusted || syntheticEventsAllowed();
}

function withinGestureEnvelope(event: MouseEvent, guard: CompatibilityGuard): boolean {
    return event.clientX >= guard.minX - COORDINATE_SLOP_PX
        && event.clientX <= guard.maxX + COORDINATE_SLOP_PX
        && event.clientY >= guard.minY - COORDINATE_SLOP_PX
        && event.clientY <= guard.maxY + COORDINATE_SLOP_PX;
}

function isCompatibilityMouseEvent(event: MouseEvent): boolean {
    return event.type !== 'click' || event.detail > 0;
}
