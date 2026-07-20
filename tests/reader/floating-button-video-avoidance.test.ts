import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { FloatingButtonController } from '../../src/reader/ui/floating-button';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { mockFloatingButtonRects, stubFloatingButtonActions } from './jpdb/fixtures';

// Cluster G5 (iPad heat / battery): scroll/resize on a scaled or video page used
// to run avoidVideoOverlap inside requestAnimationFrame on EVERY frame of an
// inertial fling — a forced layout (puck box + every video box) per frame. The
// recompute must debounce to the trailing edge, and skip entirely when the
// overlay is unscaled with no <video> on the page.

let restoreRects: () => void;
let rafSpy: MockInstance<[FrameRequestCallback], number>;

beforeEach(() => {
    vi.useFakeTimers();
    restoreRects = mockFloatingButtonRects(700, 500);
    // Count scheduling without executing the frame body (avoidVideoOverlap):
    // this test is about WHEN a recompute is scheduled, not its layout result.
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
});

afterEach(() => {
    rafSpy.mockRestore();
    restoreRects();
    document.body.innerHTML = '';
    vi.useRealTimers();
});

function installPuck(): FloatingButtonController {
    const controller = new FloatingButtonController();
    controller.install({ ...DEFAULT_SETTINGS, showFloatingButton: true }, vi.fn(), stubFloatingButtonActions());
    return controller;
}

describe('floating button video avoidance', () => {
    it('collapses a burst of scroll events into one trailing-edge recompute', () => {
        const controller = installPuck();
        try {
            const baseline = rafSpy.mock.calls.length;
            document.body.insertAdjacentHTML('beforeend', '<video></video>');

            for (let i = 0; i < 5; i += 1) window.dispatchEvent(new Event('scroll'));
            // No recompute is scheduled mid-fling — the old code ran one rAF per
            // scroll event.
            expect(rafSpy.mock.calls.length).toBe(baseline);

            vi.advanceTimersByTime(200);
            // Exactly one coalesced recompute after the scroll settles.
            expect(rafSpy.mock.calls.length).toBe(baseline + 1);
        } finally {
            controller.destroy();
        }
    });

    it('skips the layout read entirely when unscaled with no video on the page', () => {
        const controller = installPuck();
        try {
            const baseline = rafSpy.mock.calls.length;

            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
            vi.advanceTimersByTime(200);

            expect(rafSpy.mock.calls.length).toBe(baseline);
        } finally {
            controller.destroy();
        }
    });
});
