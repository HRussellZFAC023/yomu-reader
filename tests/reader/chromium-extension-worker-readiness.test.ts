import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForChromiumExtensionWorker } from '../../scripts/lib/chromium-extension-smoke.mjs';

describe('extension smoke worker readiness', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    const worker = () => ({
        url: () => 'chrome-extension://test/background.js',
        evaluate: vi.fn(async (probe: () => boolean) => probe()),
    });

    it('waits for storage and tabs before returning an existing extension worker', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('chrome', undefined);
        const extension = worker();
        const context = {
            serviceWorkers: () => [{ ...worker(), url: () => 'https://example.test/sw.js' }, extension],
            waitForEvent: vi.fn(),
        };
        let ready = false;
        const pending = waitForChromiumExtensionWorker(context).then(value => { ready = true; return value; });
        await vi.advanceTimersByTimeAsync(100);
        expect(ready).toBe(false);
        vi.stubGlobal('chrome', { storage: { local: {} } });
        await vi.advanceTimersByTimeAsync(100);
        expect(ready).toBe(false);
        vi.stubGlobal('chrome', { storage: { local: {} }, tabs: { query: () => {} } });
        await vi.advanceTimersByTimeAsync(100);
        await expect(pending).resolves.toBe(extension);
        expect(context.waitForEvent).not.toHaveBeenCalled();
    });

    it('waits for an extension target when none exists yet', async () => {
        vi.stubGlobal('chrome', { storage: { local: {} }, tabs: { query: () => {} } });
        const extension = worker();
        const context = { serviceWorkers: () => [], waitForEvent: vi.fn().mockResolvedValue(extension) };
        await expect(waitForChromiumExtensionWorker(context)).resolves.toBe(extension);
        const [event, options] = context.waitForEvent.mock.calls[0]!;
        expect(event).toBe('serviceworker');
        expect(options.predicate(extension)).toBe(true);
        expect(options.predicate({ url: () => 'https://example.test/sw.js' })).toBe(false);
    });

    it('fails with a readiness error when APIs never initialize', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('chrome', undefined);
        const extension = worker();
        const pending = expect(waitForChromiumExtensionWorker({ serviceWorkers: () => [extension], waitForEvent: vi.fn() }, 200))
            .rejects.toThrow('Extension worker APIs did not become ready: chrome-extension://test/background.js');
        await vi.advanceTimersByTimeAsync(200);
        await pending;
    });
});
