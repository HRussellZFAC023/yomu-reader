import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestHttp } from '../../src/reader/network/http-request';

// The userscript timeout field is only a request to the manager, and some
// transports ignore it — the hosted DOM-event bridge most of all. A dropped
// bridge message then never calls back, the transport promise never settles,
// and every await above it hangs forever (the study card's MEANING section
// stuck on "Translating..." was exactly this). The transport must enforce its
// own deadline, whatever the manager does.
describe('userscript transport deadline', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function stubTransport(implementation: (options: Record<string, unknown>) => unknown): void {
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(implementation));
    }

    it('rejects at the deadline when the manager never calls back', async () => {
        const abort = vi.fn();
        stubTransport(() => ({ abort }));

        const request = requestHttp('https://translate.example/api', {
            timeoutMs: 5000,
            failureLabel: 'Translation',
        });
        const outcome = expect(request).rejects.toThrow(/timed out/i);
        await vi.advanceTimersByTimeAsync(5001);
        await outcome;
        // The dangling manager request is cancelled, not left running.
        expect(abort).toHaveBeenCalled();
    });

    it('does not double-settle when a late manager callback arrives after the deadline', async () => {
        let load: ((response: unknown) => void) | undefined;
        stubTransport(options => {
            load = options.onload as (response: unknown) => void;
            return { abort: () => undefined };
        });

        const request = requestHttp('https://translate.example/api', { timeoutMs: 1000 });
        const outcome = expect(request).rejects.toThrow(/timed out/i);
        await vi.advanceTimersByTimeAsync(1001);
        await outcome;
        // A manager that answers after we gave up must be a no-op.
        expect(() => load?.({ status: 200, responseText: 'late', response: 'late' })).not.toThrow();
    });

    it('resolves normally when the manager answers inside the deadline', async () => {
        stubTransport(options => {
            (options.onload as (response: unknown) => void)({ status: 200, responseText: 'ok', response: 'ok' });
            return { abort: () => undefined };
        });

        await expect(requestHttp('https://translate.example/api', { timeoutMs: 5000 })).resolves.toBe('ok');
    });
});
