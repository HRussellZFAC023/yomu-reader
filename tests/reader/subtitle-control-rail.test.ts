import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindSubtitleControlRail } from '../../src/reader/subtitles/subtitle-control-rail';
import {
    SUBTITLE_CONTROL_RAIL_POSITION_KEY,
    loadSubtitleControlRailPosition,
} from '../../src/reader/subtitles/subtitle-layout';

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
        const binding = bindSubtitleControlRail(root, activity)!;

        handle.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7, clientX: 20, clientY: 30 }));
        window.dispatchEvent(pointerEvent('pointermove', { pointerId: 7, clientX: 140, clientY: 120 }));
        window.dispatchEvent(pointerEvent('pointerup', { pointerId: 7, clientX: 140, clientY: 120 }));

        expect(rail.style.left).toBe('128px');
        expect(rail.style.top).toBe('98px');
        expect(loadSubtitleControlRailPosition()).toEqual(expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
        }));
        expect(activity).toHaveBeenCalled();

        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(rail.style.left).toBe('8px');
        expect(rail.style.top).toBe('8px');
        expect(loadSubtitleControlRailPosition()).toEqual({ x: 0, y: 0 });

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
});
