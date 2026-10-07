import { describe, expect, it, vi } from 'vitest';
import { overlayDocumentUrl, singleFlight } from '../../src/gaming/lifecycle';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

describe('gaming capture shortcut presses', () => {
    it('joins a press made while a capture is still running instead of starting a second one', async () => {
        const pending = deferred();
        const capture = vi.fn(() => pending.promise);
        const press = singleFlight(capture);

        const first = press();
        const second = press();
        expect(capture).toHaveBeenCalledOnce();
        expect(second).toBe(first);

        pending.resolve();
        await first;
    });

    it('takes a fresh capture on the next press once the previous one finished', async () => {
        const capture = vi.fn(async () => undefined);
        const press = singleFlight(capture);

        await press();
        await press();

        expect(capture).toHaveBeenCalledTimes(2);
    });

    it('lets the next press capture again after a failed capture', async () => {
        const failing = deferred();
        const capture = vi.fn()
            .mockImplementationOnce(() => failing.promise)
            .mockImplementationOnce(async () => undefined);
        const press = singleFlight(capture);

        const first = press();
        failing.reject(new Error('No capture source is available.'));
        await expect(first).rejects.toThrow('No capture source');
        await press();

        expect(capture).toHaveBeenCalledTimes(2);
    });
});

describe('gaming overlay documents', () => {
    const renderer = new URL('file:///Applications/Yomu%20Gaming.app/Contents/Resources/app.asar/renderer/index.html');

    // Loading the URL a window already shows is a same-document fragment navigation, which
    // kept the first capture's document — and its frame and words — on every later press.
    it('gives every capture of the same mode a URL that loads a new document', () => {
        const first = new URL(overlayDocumentUrl(renderer, 'instant', 1));
        const second = new URL(overlayDocumentUrl(renderer, 'instant', 2));

        expect(second.toString()).not.toBe(first.toString());
        expect(second.search).not.toBe(first.search);
        expect(second.pathname).toBe(first.pathname);
    });

    it('keeps the capture mode where the renderer reads it', () => {
        const area = new URL(overlayDocumentUrl(renderer, 'area', 3));
        expect(area.searchParams.get('captureMode')).toBe('area');
        expect(area.hash).toBe('#overlay-area');
        expect(new URL(overlayDocumentUrl(renderer, 'instant', 4)).hash).toBe('#overlay-instant');
    });

    it('keeps a development server URL and its own query', () => {
        const dev = new URL('http://127.0.0.1:5187/?debug=1');
        const url = new URL(overlayDocumentUrl(dev, 'instant', 5));
        expect(url.origin).toBe('http://127.0.0.1:5187');
        expect(url.searchParams.get('debug')).toBe('1');
        expect(dev.toString()).toBe('http://127.0.0.1:5187/?debug=1');
    });
});
