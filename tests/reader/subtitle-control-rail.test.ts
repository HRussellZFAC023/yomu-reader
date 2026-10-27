import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindSubtitleControlRail } from '../../src/reader/subtitles/subtitle-control-rail';
import {
    SUBTITLE_CONTROL_RAIL_POSITION_KEY,
    loadSubtitleControlRailPosition,
} from '../../src/reader/subtitles/subtitle-layout';
import { SUBTITLE_DRAG_OFFSET_KEY, loadSubtitleDragOffsetFraction, saveSubtitleControlRailPosition, saveSubtitleDragOffsetFraction } from "../../src/reader/subtitles/subtitle-layout";

function pointerEvent(type: string, options: { pointerId: number; clientX: number; clientY: number; button?: number }): PointerEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: options.clientX,
        clientY: options.clientY,
        button: options.button ?? 0,
    });
    Object.defineProperty(event, 'pointerId', { configurable: true, value: options.pointerId });
    return event as unknown as PointerEvent;
}

describe('movable subtitle control rail', () => {
    beforeEach(() => {
        localStorage.removeItem(SUBTITLE_CONTROL_RAIL_POSITION_KEY);
        document.body.innerHTML = `
            <div id="root">
                <div class="jpdb-subtitle-rail" style="left:8px;top:8px">
                    <button data-subtitle-rail-drag-handle></button>
                    <button data-action="next"></button>
                </div>
            </div>
        `;
        const root = document.getElementById('root')!;
        const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        root.getBoundingClientRect = () => new DOMRect(10, 20, 400, 220);
        rail.getBoundingClientRect = () => new DOMRect(
            10 + Number.parseFloat(rail.style.left || '8'),
            20 + Number.parseFloat(rail.style.top || '8'),
            100,
            40,
        );
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        localStorage.removeItem(SUBTITLE_CONTROL_RAIL_POSITION_KEY);
    });

    it('drags, clamps, persists, and resets from the keyboard', () => {
        const root = document.getElementById('root')!;
        const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        const handle = rail.querySelector<HTMLElement>('[data-subtitle-rail-drag-handle]')!;
        const activity = vi.fn();
        const positioned: string[] = [];
        const binding = bindSubtitleControlRail(root, activity, {
            onPositionChange: () => positioned.push(`${rail.style.left},${rail.style.top}`),
        })!;

        handle.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 20, clientY: 30 }));
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 140, clientY: 120 }));
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 140, clientY: 120 }));

        expect(rail.style.left).toBe('128px');
        expect(rail.style.top).toBe('98px');
        expect(positioned).toContain('128px,98px');
        expect(loadSubtitleControlRailPosition()).toEqual(expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
        }));
        expect(activity).toHaveBeenCalled();

        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(rail.style.left).toBe('8px');
        expect(rail.style.top).toBe('8px');
        expect(positioned.at(-1)).toBe('8px,8px');
        expect(loadSubtitleControlRailPosition()).toEqual({ x: 0, y: 0 });

        binding.destroy();
    });

    it('does not rewrite or reposition a stationary rail on housekeeping ticks', () => {
        const root = document.getElementById('root')!;
        const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        const positioned = vi.fn();
        const binding = bindSubtitleControlRail(root, vi.fn(), { onPositionChange: positioned })!;
        binding.syncPosition();
        const rootReads = vi.spyOn(root, 'getBoundingClientRect');
        const railReads = vi.spyOn(rail, 'getBoundingClientRect');
        const writes = vi.spyOn(rail.style, 'setProperty');
        positioned.mockClear();
        for (let i = 0; i < 100; i++) binding.syncPosition();
        expect(rootReads).toHaveBeenCalledTimes(100);
        expect(railReads).toHaveBeenCalledTimes(100);
        expect(writes).not.toHaveBeenCalled();
        expect(positioned).not.toHaveBeenCalled();
        rootReads.mockReturnValue(new DOMRect(30, 50, 400, 220));
        binding.syncPosition();
        expect(writes).not.toHaveBeenCalled();
        expect(positioned).toHaveBeenCalledOnce();
        binding.destroy();
    });

    it('treats a small finger-jitter tap as a tap so the pin/expand toggle still fires', () => {
        const root = document.getElementById('root')!;
        const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        const handle = rail.querySelector<HTMLElement>('[data-subtitle-rail-drag-handle]')!;
        const click = vi.fn();
        handle.addEventListener('click', click);
        const binding = bindSubtitleControlRail(root, vi.fn())!;

        // A touch tap always carries a few pixels of jitter; below the tap slop
        // the gesture must NOT become a drag, so the synthesised click still
        // reaches the expand/pin toggle instead of being suppressed.
        handle.dispatchEvent(pointerEvent('pointerdown', { pointerId: 3, clientX: 20, clientY: 30 }));
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 3, clientX: 24, clientY: 33 }));
        const up = pointerEvent('pointerup', { pointerId: 3, clientX: 24, clientY: 33 });
        window.dispatchEvent(up);
        handle.click();

        expect(up.defaultPrevented).toBe(false);
        expect(handle.dataset.subtitleRailSuppressClick).toBeUndefined();
        expect(click).toHaveBeenCalledOnce();
        binding.destroy();
    });

    it('does not cancel a stationary touch-style tap needed for iOS click synthesis', () => {
        const root = document.getElementById('root')!;
        const handle = root.querySelector<HTMLElement>('[data-subtitle-rail-drag-handle]')!;
        const click = vi.fn();
        handle.addEventListener('click', click);
        const binding = bindSubtitleControlRail(root, vi.fn())!;

        const down = pointerEvent('pointerdown', { pointerId: 9, clientX: 20, clientY: 30 });
        handle.dispatchEvent(down);
        const up = pointerEvent('pointerup', { pointerId: 9, clientX: 20, clientY: 30 });
        window.dispatchEvent(up);
        handle.click();

        expect(down.defaultPrevented).toBe(false);
        expect(up.defaultPrevented).toBe(false);
        expect(click).toHaveBeenCalledOnce();
        binding.destroy();
    });

    it('moves and restores the rail outside native player control safe zones', () => {
        const root = document.getElementById('root')!;
        const rail = root.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        const handle = rail.querySelector<HTMLElement>('[data-subtitle-rail-drag-handle]')!;
        const nativeControl = new DOMRect(130, 110, 110, 60);
        const options = { getReservedRects: () => [nativeControl] };
        const binding = bindSubtitleControlRail(root, vi.fn(), options)!;

        handle.dispatchEvent(pointerEvent('pointerdown', { pointerId: 14, clientX: 20, clientY: 30 }));
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 14, clientX: 140, clientY: 120 }));
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 14, clientX: 140, clientY: 120 }));

        expect(rectsOverlap(rail.getBoundingClientRect(), nativeControl)).toBe(false);
        expect(loadSubtitleControlRailPosition()).not.toBeNull();
        const persistedPosition = loadSubtitleControlRailPosition();
        binding.destroy();

        // A freshly bound rail uses the persisted location, but re-runs safe
        // placement in case the native control topology changed meanwhile.
        rail.style.left = '8px';
        rail.style.top = '8px';
        const restored = bindSubtitleControlRail(root, vi.fn(), options)!;
        restored.syncPosition();
        expect(rectsOverlap(rail.getBoundingClientRect(), nativeControl)).toBe(false);
        expect(loadSubtitleControlRailPosition()).toEqual(persistedPosition);
        restored.destroy();
    });
});

function rectsOverlap(first: DOMRect, second: DOMRect): boolean {
    return first.right > second.left
        && second.right > first.left
        && first.bottom > second.top
        && second.bottom > first.top;
}

describe('subtitle drag offset storage', () => {
    // The remembered subtitle drag position is persisted as a viewport-height
    // fraction. These guard the defensive clamp/parse layer the controller leans on
    // (a bad fraction must never strand the overlay off-screen) and the round-trip.

    beforeEach(() => {
        localStorage.removeItem(SUBTITLE_DRAG_OFFSET_KEY);
        localStorage.removeItem(SUBTITLE_CONTROL_RAIL_POSITION_KEY);
    });
    afterEach(() => {
        localStorage.removeItem(SUBTITLE_DRAG_OFFSET_KEY);
        localStorage.removeItem(SUBTITLE_CONTROL_RAIL_POSITION_KEY);
    });

    it('defaults to 0 when nothing is stored', () => {
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
    });

    it('round-trips an in-band fraction', () => {
        saveSubtitleDragOffsetFraction(-0.25);
        expect(loadSubtitleDragOffsetFraction()).toBeCloseTo(-0.25, 6);
    });

    it('clamps out-of-band values on the way in and out', () => {
        saveSubtitleDragOffsetFraction(-5);
        expect(loadSubtitleDragOffsetFraction()).toBe(-0.9);
        saveSubtitleDragOffsetFraction(5);
        expect(loadSubtitleDragOffsetFraction()).toBe(0.35);
    });

    it('treats non-finite saved values as 0', () => {
        saveSubtitleDragOffsetFraction(Number.NaN);
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
        saveSubtitleDragOffsetFraction(Number.POSITIVE_INFINITY);
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
    });

    it('falls back to 0 for a malformed or wrongly-typed stored value', () => {
        localStorage.setItem(SUBTITLE_DRAG_OFFSET_KEY, JSON.stringify({ fraction: 'oops' }));
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
        localStorage.setItem(SUBTITLE_DRAG_OFFSET_KEY, 'not json at all');
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
    });

    it('round-trips and clamps the movable control rail position', () => {
        expect(loadSubtitleControlRailPosition()).toBeNull();
        saveSubtitleControlRailPosition({ x: 0.25, y: 0.75 });
        expect(loadSubtitleControlRailPosition()).toEqual({ x: 0.25, y: 0.75 });
        saveSubtitleControlRailPosition({ x: -2, y: 4 });
        expect(loadSubtitleControlRailPosition()).toEqual({ x: 0, y: 1 });
    });
});
