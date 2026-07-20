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
let pendingFrames: FrameRequestCallback[] = [];

// Run every scheduled frame callback, as one real frame tick would. Releases
// the controller's coalescing guard so the next recompute schedules a new rAF.
function flushFrames(): void {
    const frames = pendingFrames;
    pendingFrames = [];
    frames.forEach(frame => frame(0));
}

beforeEach(() => {
    vi.useFakeTimers();
    restoreRects = mockFloatingButtonRects(700, 500);
    // Count scheduling without executing the frame body (avoidVideoOverlap):
    // this test is about WHEN a recompute is scheduled, not its layout result.
    // Callbacks are collected so flushFrames() can release the controller's
    // rAF-coalescing guard between phases, the way a real frame tick would.
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        pendingFrames.push(callback);
        return pendingFrames.length;
    });
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
            flushFrames();
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
            flushFrames();
            const baseline = rafSpy.mock.calls.length;

            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
            vi.advanceTimersByTime(200);

            expect(rafSpy.mock.calls.length).toBe(baseline);
        } finally {
            controller.destroy();
        }
    });

    // The release smoke marks a video overlap within three frames of a resize:
    // resize is a discrete layout change (rotation, viewport chrome), so it must
    // recompute immediately, never on the scroll settle delay.
    it('recomputes immediately on resize when a video is present', () => {
        const controller = installPuck();
        try {
            flushFrames();
            const baseline = rafSpy.mock.calls.length;
            document.body.insertAdjacentHTML('beforeend', '<video></video>');

            window.dispatchEvent(new Event('resize'));
            expect(rafSpy.mock.calls.length).toBe(baseline + 1);
        } finally {
            controller.destroy();
        }
    });

    // A puck still displaced by a since-removed video must stay eligible for
    // the recompute that returns it home — the no-video skip only applies when
    // the puck is not currently marked.
    it('still recomputes after the last video is removed while the puck is marked', () => {
        const controller = installPuck();
        try {
            flushFrames();
            document.querySelector<HTMLElement>('.jpdb-reader-fab')?.classList.add('jpdb-reader-fab-over-video');
            const baseline = rafSpy.mock.calls.length;

            window.dispatchEvent(new Event('resize'));
            expect(rafSpy.mock.calls.length).toBe(baseline + 1);
        } finally {
            controller.destroy();
        }
    });
});
