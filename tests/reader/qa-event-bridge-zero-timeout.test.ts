import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestBlob as requestOcrBlob } from '../../src/reader/ocr/ocr-providers';

// QA probe: the hosted DOM-event bridge reads its own deadline as
// `options.timeout ?? BRIDGE_TIMEOUT_MS` (userscript/bridge-runtime.ts:195).
// `??` does not treat 0 as absent, so a caller that means "no cap" by passing
// timeout: 0 — ocr-providers.requestBlob(url) defaults to exactly that — gets a
// 0 ms bridge deadline and fails instantly on hosted pages.
describe('event-bridge zero-timeout probe', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.documentElement.dataset.yomuUserscriptHttpBridge = 'true';
    });

    afterEach(() => {
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('fails an uncapped image fetch immediately on the hosted bridge', async () => {
        let outcome = 'pending';
        const request = requestOcrBlob('https://cdn.example/page.jpg').then(
            () => { outcome = 'resolved'; },
            error => { outcome = error instanceof Error ? error.message : String(error); },
        );
        // No bridge server is listening, but the deadline alone decides this.
        await vi.advanceTimersByTimeAsync(1);
        await request.catch(() => undefined);
        expect(outcome).toBe('Request timed out.');
    });
});
