import {
    loadSubtitleControlRailPosition,
    saveSubtitleControlRailPosition,
} from './subtitle-layout';

const RAIL_MARGIN_PX = 8;
const RAIL_KEY_STEP_PX = 12;
// The grip is both the drag handle AND the rail's expand/pin toggle, so a tap
// has to survive the finger jitter a touch always carries or the toggle never
// fires. Below this travel the gesture stays a tap (click reaches the toggle);
// past it the drag takes over and the synthesised click is suppressed.
const RAIL_TAP_SLOP_PX = 8;

export interface SubtitleControlRailBinding {
    syncPosition(): void;
    destroy(): void;
}

// Owns the rail's one interaction: moving it within the current video frame.
// The subtitle controller only needs a small lifecycle interface; pointer,
// keyboard, persistence and resize clamping stay behind this module boundary.
export function bindSubtitleControlRail(
    root: HTMLElement,
    onActivity: () => void,
): SubtitleControlRailBinding | null {
    const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail');
    const handle = rail?.querySelector<HTMLElement>('[data-subtitle-rail-drag-handle]');
    if (!rail || !handle) return null;

    const abort = new AbortController();
    let position = loadSubtitleControlRailPosition();
    let drag: { pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null = null;

    const railBounds = (): { maxLeft: number; maxTop: number } | null => {
        const rootRect = root.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        if (rootRect.width <= 0 || rootRect.height <= 0 || railRect.width <= 0 || railRect.height <= 0) return null;
        return {
            maxLeft: Math.max(RAIL_MARGIN_PX, rootRect.width - railRect.width - RAIL_MARGIN_PX),
            maxTop: Math.max(RAIL_MARGIN_PX, rootRect.height - railRect.height - RAIL_MARGIN_PX),
        };
    };

    const setPixels = (left: number, top: number, persist = false): void => {
        const bounds = railBounds();
        if (!bounds) return;
        const clampedLeft = Math.min(bounds.maxLeft, Math.max(RAIL_MARGIN_PX, left));
        const clampedTop = Math.min(bounds.maxTop, Math.max(RAIL_MARGIN_PX, top));
        rail.style.setProperty('left', `${Math.round(clampedLeft)}px`);
        rail.style.setProperty('right', 'auto');
        rail.style.setProperty('top', `${Math.round(clampedTop)}px`);
        position = {
            x: fractionWithinRailAxis(clampedLeft, bounds.maxLeft),
            y: fractionWithinRailAxis(clampedTop, bounds.maxTop),
        };
        if (persist) saveSubtitleControlRailPosition(position);
    };

    const syncPosition = (): void => {
        if (!position) return;
        const bounds = railBounds();
        if (!bounds) return;
        setPixels(
            railAxisPosition(position.x, bounds.maxLeft),
            railAxisPosition(position.y, bounds.maxTop),
        );
    };

    const pointerDown = (event: PointerEvent): void => {
        if (event.button !== 0 || drag) return;
        const rootRect = root.getBoundingClientRect();
        const railRect = rail.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: railRect.left - rootRect.left,
            top: railRect.top - rootRect.top,
            moved: false,
        };
        rail.classList.add('jpdb-subtitle-rail-dragging');
        onActivity();
        // Do not cancel pointerdown: iOS Safari can suppress the compatibility
        // click when pointerdown is prevented, leaving the collapsed grip unable
        // to expand. touch-action:none owns gesture arbitration; once movement
        // starts pointermove is cancelled below to keep the drag exclusive.
        event.stopPropagation();
        try {
            handle.setPointerCapture?.(event.pointerId);
        } catch {
            // WebKit can reject capture when the player rerenders the handle
            // during pointerdown. Window listeners still complete the drag.
        }
    };

    const pointerMove = (event: PointerEvent): void => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > RAIL_TAP_SLOP_PX) drag.moved = true;
        setPixels(drag.left + deltaX, drag.top + deltaY);
        if (drag.moved) event.preventDefault();
        event.stopPropagation();
    };

    const finishPointer = (event: PointerEvent): void => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const moved = drag.moved;
        drag = null;
        rail.classList.remove('jpdb-subtitle-rail-dragging');
        try {
            handle.releasePointerCapture?.(event.pointerId);
        } catch {
            // Capture may already be gone after a framework rerender/cancel.
        }
        if (position) saveSubtitleControlRailPosition(position);
        if (moved) {
            handle.dataset.subtitleRailSuppressClick = 'true';
            event.preventDefault();
        }
        event.stopPropagation();
    };

    const suppressDraggedClick = (event: MouseEvent): void => {
        if (handle.dataset.subtitleRailSuppressClick !== 'true') return;
        delete handle.dataset.subtitleRailSuppressClick;
        event.preventDefault();
        event.stopPropagation();
    };

    const keyDown = (event: KeyboardEvent): void => {
        const step = event.shiftKey ? RAIL_KEY_STEP_PX * 3 : RAIL_KEY_STEP_PX;
        const rect = rail.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const left = rect.left - rootRect.left;
        const top = rect.top - rootRect.top;
        let nextLeft = left;
        let nextTop = top;
        if (event.key === 'ArrowLeft') nextLeft -= step;
        else if (event.key === 'ArrowRight') nextLeft += step;
        else if (event.key === 'ArrowUp') nextTop -= step;
        else if (event.key === 'ArrowDown') nextTop += step;
        else if (event.key === 'Home' || event.key === '0') {
            nextLeft = RAIL_MARGIN_PX;
            nextTop = RAIL_MARGIN_PX;
        } else return;
        event.preventDefault();
        event.stopPropagation();
        onActivity();
        setPixels(nextLeft, nextTop, true);
    };

    handle.addEventListener('pointerdown', pointerDown, { signal: abort.signal });
    handle.addEventListener('click', suppressDraggedClick, { capture: true, signal: abort.signal });
    handle.addEventListener('keydown', keyDown, { signal: abort.signal });
    window.addEventListener('pointermove', pointerMove, { passive: false, signal: abort.signal });
    window.addEventListener('pointerup', finishPointer, { passive: false, signal: abort.signal });
    window.addEventListener('pointercancel', finishPointer, { passive: false, signal: abort.signal });

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncPosition) : null;
    resizeObserver?.observe(root);
    resizeObserver?.observe(rail);
    requestAnimationFrame(syncPosition);

    return {
        syncPosition,
        destroy: () => {
            abort.abort();
            resizeObserver?.disconnect();
            rail.classList.remove('jpdb-subtitle-rail-dragging');
        },
    };
}

function railAxisPosition(fraction: number, max: number): number {
    return RAIL_MARGIN_PX + fraction * Math.max(0, max - RAIL_MARGIN_PX);
}

function fractionWithinRailAxis(value: number, max: number): number {
    const range = max - RAIL_MARGIN_PX;
    return range > 0 ? Math.min(1, Math.max(0, (value - RAIL_MARGIN_PX) / range)) : 0;
}
