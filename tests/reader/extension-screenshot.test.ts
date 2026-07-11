import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureReaderSurfaceViaExtensionScreenshot } from '../../src/reader/ocr/extension-screenshot';

function createSurface(left = 10): HTMLCanvasElement {
    const surface = document.createElement('canvas');
    surface.getBoundingClientRect = () => new DOMRect(left, 20, 300, 400);
    document.body.append(surface);
    return surface;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(fulfill => {
        resolve = fulfill;
    });
    return { promise, resolve };
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    delete document.documentElement.dataset.yomuExtensionScreenshotCapture;
    document.getElementById('yomu-extension-screenshot-hide-style')?.remove();
});

describe('extension screenshot bridge', () => {
    it('keeps reader UI hidden until concurrent Firefox captures both settle', async () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        const firstResponse = deferred<unknown>();
        const secondResponse = deferred<unknown>();
        const sendMessage = vi
            .fn()
            .mockReturnValueOnce(firstResponse.promise)
            .mockReturnValueOnce(secondResponse.promise);
        vi.stubGlobal('browser', { runtime: { id: 'firefox-runtime', sendMessage } });

        const firstCapture = captureReaderSurfaceViaExtensionScreenshot(createSurface(), 1_000_000);
        const secondCapture = captureReaderSurfaceViaExtensionScreenshot(createSurface(30), 1_000_000);
        await Promise.resolve();

        expect(sendMessage).toHaveBeenCalledTimes(2);
        expect(document.documentElement.dataset.yomuExtensionScreenshotCapture).toBe('true');
        expect(document.getElementById('yomu-extension-screenshot-hide-style')).not.toBeNull();

        firstResponse.resolve({ ok: false });
        await expect(firstCapture).resolves.toBeUndefined();
        expect(document.documentElement.dataset.yomuExtensionScreenshotCapture).toBe('true');
        expect(document.getElementById('yomu-extension-screenshot-hide-style')).not.toBeNull();

        secondResponse.resolve({ ok: false });
        await expect(secondCapture).resolves.toBeUndefined();
        expect(document.documentElement.dataset.yomuExtensionScreenshotCapture).toBeUndefined();
        expect(document.getElementById('yomu-extension-screenshot-hide-style')).toBeNull();
    });

    it('bounds a promise-based Firefox runtime that never answers', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.stubGlobal('browser', {
            runtime: {
                id: 'tampermonkey-like-runtime',
                sendMessage: vi.fn(() => new Promise(() => { /* deliberately unresolved */ })),
            },
        });
        const capture = captureReaderSurfaceViaExtensionScreenshot(createSurface(), 1_000_000);
        await vi.advanceTimersByTimeAsync(6001);

        await expect(capture).resolves.toBeUndefined();
        expect(document.documentElement.dataset.yomuExtensionScreenshotCapture).toBeUndefined();
        expect(document.getElementById('yomu-extension-screenshot-hide-style')).toBeNull();
    });

    it('bounds a screenshot preflight when animation frames stop', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        const sendMessage = vi.fn(() => Promise.resolve({ ok: false }));
        vi.stubGlobal('browser', { runtime: { id: 'firefox-runtime', sendMessage } });

        const capture = captureReaderSurfaceViaExtensionScreenshot(createSurface(), 1_000_000);
        expect(document.documentElement.dataset.yomuExtensionScreenshotCapture).toBe('true');
        expect(sendMessage).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(251);

        await expect(capture).resolves.toBeUndefined();
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(document.documentElement.dataset.yomuExtensionScreenshotCapture).toBeUndefined();
        expect(document.getElementById('yomu-extension-screenshot-hide-style')).toBeNull();
    });

    it('bounds screenshot image decoding when the image never settles', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        class HungImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            naturalWidth = 800;
            naturalHeight = 600;
            src = '';
        }
        vi.stubGlobal('Image', HungImage);
        vi.stubGlobal('browser', {
            runtime: {
                id: 'firefox-runtime',
                sendMessage: vi.fn(() => Promise.resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,c2NyZWVu' })),
            },
        });

        let settled = false;
        const capture = captureReaderSurfaceViaExtensionScreenshot(createSurface(), 1_000_000);
        void capture.then(() => {
            settled = true;
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(4001);

        await expect(capture).resolves.toBeUndefined();
        expect(settled).toBe(true);
    });
});
