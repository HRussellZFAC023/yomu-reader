import { afterEach, describe, expect, it, vi } from 'vitest';

import { scheduleIdleCallback, waitForIdle } from '../../src/reader/platform/idle';

const originalRequestIdleCallback = window.requestIdleCallback;

function setRequestIdleCallback(value: unknown): void {
    Object.defineProperty(window, 'requestIdleCallback', {
        configurable: true,
        writable: true,
        value,
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setRequestIdleCallback(originalRequestIdleCallback);
});

describe('idle scheduling', () => {
    it('falls back when requestIdleCallback exists but is not callable', async () => {
        vi.useFakeTimers();
        setRequestIdleCallback(true);

        const idle = waitForIdle(75);
        vi.runOnlyPendingTimers();
        await idle;

        expect(scheduleIdleCallback(vi.fn(), 75)).toBe(false);
    });

    it('uses native requestIdleCallback when it is callable', async () => {
        const callback = vi.fn();
        const requestIdleCallback = vi.fn((run: IdleRequestCallback, _options?: IdleRequestOptions) => {
            run({ didTimeout: false, timeRemaining: () => 12 });
            return 1;
        });
        setRequestIdleCallback(requestIdleCallback);

        expect(scheduleIdleCallback(callback, 50)).toBe(true);

        expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 50 });
        expect(callback).toHaveBeenCalled();
    });
});
