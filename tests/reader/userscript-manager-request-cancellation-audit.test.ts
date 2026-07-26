import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestViaUserscriptManager } from '../../src/reader/userscript/manager-request';
import { isAbortError } from '../../src/reader/core/errors';

// ADVERSARIAL AUDIT of cancellation in the shared userscript-manager transport.
// Every test here models a manager shape that a real userscript manager can
// present, and asks: when we give up (deadline or caller abort), is the transfer
// actually cancelled, and does teardown survive the cancellation?
describe('userscript manager request — cancellation audit', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function trackSettlement(request: Promise<unknown>): { outcome: string; name: string; error: unknown } {
        const settlement = { outcome: 'pending', name: '', error: undefined as unknown };
        request.then(
            () => { settlement.outcome = 'resolved'; },
            error => {
                settlement.error = error;
                settlement.name = error instanceof Error || error instanceof DOMException ? error.name : typeof error;
                settlement.outcome = error instanceof Error || error instanceof DOMException ? error.message : String(error);
            },
        );
        return settlement;
    }

    function readText(response: UserscriptHttpResponse): string {
        return String(response.responseText ?? response.response ?? '');
    }

    // ---------------------------------------------------------------------
    // A. abort() with a synchronous side effect.
    //
    // An XHR-backed manager that maps the XHR `abort` event onto the caller's
    // onerror (Greasemonkey-era shims, the vite-plugin-monkey dev shim, any
    // manager that has no onabort and routes every non-load terminal event to
    // onerror) calls back SYNCHRONOUSLY from inside abort(): xhr.abort() fires
    // `abort` + `loadend` synchronously per XHR spec.
    //
    // handleTimeout does `tryAbort(); finish(reject(timeoutReason))` — so the
    // manager's onerror wins the single-shot race and settles first.
    // ---------------------------------------------------------------------
    it('A1 deadline: an abort() that synchronously calls onerror steals the timeout reason', async () => {
        let onerror: ((error: unknown) => void) | undefined;
        const request = vi.fn((options: { onerror?: (error: unknown) => void }) => {
            onerror = options.onerror;
            // XHR-backed manager: abort() fires the abort event synchronously and
            // the shim routes it to onerror.
            return { abort: () => onerror?.(new Error('Request aborted.')) };
        }) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://jpdb.io/api/v1/parse', timeout: 30_000 },
            readResponse: readText,
            onError: error => error instanceof Error ? error : new Error('JPDB request failed.'),
            onTimeout: () => new Error('JPDB request timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(30_001);
        expect(settlement.outcome).toBe('JPDB request timed out.');
    });

    // The same defect on the caller-abort path is worse: the rejection is not an
    // AbortError at all, so every isAbortError() consumer misreads a user
    // cancellation as a hard transport failure.
    it('A2 caller abort: an abort() that synchronously calls onerror destroys the AbortError', async () => {
        const controller = new AbortController();
        let onerror: ((error: unknown) => void) | undefined;
        const request = vi.fn((options: { onerror?: (error: unknown) => void }) => {
            onerror = options.onerror;
            return { abort: () => onerror?.(new Error('Request aborted.')) };
        }) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://jpdb.io/api/v1/parse', timeout: 30_000 },
            readResponse: readText,
            signal: controller.signal,
            onError: error => error instanceof Error ? error : new Error('JPDB request failed.'),
            onTimeout: () => new Error('JPDB request timed out.'),
        }));

        controller.abort();
        await vi.advanceTimersByTimeAsync(1);
        expect(settlement.name).toBe('AbortError');
        expect(isAbortError(settlement.error)).toBe(true);
    });

    // ---------------------------------------------------------------------
    // B. Reading the handle off the manager's return value is OUTSIDE the
    // try/catch that guards the manager call. Every hand-rolled wrapper this
    // helper replaced kept the thenable/handle inspection INSIDE its try. A
    // Firefox Xray-wrapped page-world object (or any exotic handle) can throw on
    // property access — "Permission denied to access property" — and that throw
    // now escapes the executor with the deadline timer and the abort listener
    // still live: exactly defect (c), reintroduced at a new line.
    // ---------------------------------------------------------------------
    it('B1 a handle whose .abort access throws leaks the deadline timer and the abort listener', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        const request = vi.fn(() => {
            const handle = {};
            Object.defineProperty(handle, 'abort', {
                get() { throw new Error('Permission denied to access property "abort"'); },
            });
            return handle;
        }) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/xray', timeout: 6000 },
            readResponse: readText,
            signal: controller.signal,
            onError: () => new Error('Reader CSS request failed.'),
            onTimeout: () => new Error('Reader CSS request timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(0);
        // Desired: routed through onError with full teardown, exactly as the
        // hand-rolled wrappers did when the inspection sat inside their try.
        expect({ timers: vi.getTimerCount(), listenerRemovals: removeAbortListener.mock.calls.length, reason: settlement.outcome })
            .toEqual({ timers: 0, listenerRemovals: 1, reason: 'Reader CSS request failed.' });
    });

    it('B2 a thenable whose then() throws when invoked leaks the deadline timer and the abort listener', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        const request = vi.fn(() => ({
            abort: () => undefined,
            then() { throw new Error('Permission denied to access property "then"'); },
        })) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/xray-then', timeout: 6000 },
            readResponse: readText,
            signal: controller.signal,
            onError: () => new Error('Reader CSS request failed.'),
            onTimeout: () => new Error('Reader CSS request timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(0);
        expect({ timers: vi.getTimerCount(), listenerRemovals: removeAbortListener.mock.calls.length, reason: settlement.outcome })
            .toEqual({ timers: 0, listenerRemovals: 1, reason: 'Reader CSS request failed.' });
    });

    // ---------------------------------------------------------------------
    // C. abort() throwing must not break teardown (claimed guarantee).
    // ---------------------------------------------------------------------
    it('C1 an abort() that throws still rejects with the timeout reason and clears the timer', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        const request = vi.fn(() => Object.assign(new Promise(() => undefined), {
            abort: () => { throw new Error('abort() is dead'); },
        })) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/throwing-abort', timeout: 8000 },
            readResponse: readText,
            signal: controller.signal,
            onTimeout: () => new Error('Subtitle request timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(8001);
        expect(settlement.outcome).toBe('Subtitle request timed out.');
        expect(vi.getTimerCount()).toBe(0);
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
    });

    // ---------------------------------------------------------------------
    // D. Realistic Violentmonkey: abort() makes the manager's own promise reject
    // a microtask later. That late rejection must not corrupt the reason and
    // must not surface as an unhandled rejection.
    // ---------------------------------------------------------------------
    it('D1 a Violentmonkey thenable that rejects on abort keeps the timeout reason', async () => {
        const unhandled: unknown[] = [];
        const onUnhandled = (event: PromiseRejectionEvent) => unhandled.push(event.reason);
        globalThis.addEventListener?.('unhandledrejection', onUnhandled as unknown as EventListener);
        let rejectManager: ((reason: unknown) => void) | undefined;
        const request = vi.fn(() => {
            const promise = new Promise<UserscriptHttpResponse>((_resolve, reject) => { rejectManager = reject; });
            return Object.assign(promise, { abort: () => rejectManager?.(new Error('aborted')) });
        }) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/vm', timeout: 5000 },
            readResponse: readText,
            onError: error => error instanceof Error ? error : new Error('Image fetch failed.'),
            onTimeout: () => new Error('Image fetch timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(5001);
        expect(settlement.outcome).toBe('Image fetch timed out.');
        expect(unhandled).toEqual([]);
        globalThis.removeEventListener?.('unhandledrejection', onUnhandled as unknown as EventListener);
    });

    // ---------------------------------------------------------------------
    // E. Double cancellation: tryAbort() is not guarded by `settled`, so a
    // manager that also reports its own timeout after the local deadline aborts
    // the (already dead) handle a second time.
    // ---------------------------------------------------------------------
    it('E1 a manager that reports its own timeout after the local deadline aborts twice', async () => {
        const abort = vi.fn();
        let ontimeout: (() => void) | undefined;
        const request = vi.fn((options: { ontimeout?: () => void }) => {
            ontimeout = options.ontimeout;
            return { abort };
        }) as unknown as UserscriptHttpRequest;

        void requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/late-timeout', timeout: 5000 },
            readResponse: readText,
            onTimeout: () => new Error('Request timed out.'),
        }).catch(() => undefined);

        await vi.advanceTimersByTimeAsync(5001);
        expect(abort).toHaveBeenCalledTimes(1);
        ontimeout?.();
        expect(abort).toHaveBeenCalledTimes(1);
    });

    // ---------------------------------------------------------------------
    // F. The tier BELOW the userscript transport. When the userscript attempt
    // rejects, requestHttp can retry over fetch (shouldRetryEventBridgeFailure-
    // WithFetch does so for any non-HTTP-status bridge failure, and an
    // AbortError's message carries no status). fetchWithTimeout then subscribes
    // to the caller's signal with addEventListener — which never fires for a
    // signal that is ALREADY aborted — so the retry runs on a fresh, un-aborted
    // controller: the cancelled request is re-issued and allowed to complete.
    // Latent today (no production caller passes a signal to requestHttp) but it
    // is the landing spot for every abort the transport does forward.
    // ---------------------------------------------------------------------
    it('F1 fetchWithCorsFallbacks issues the request anyway when the caller signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchSpy = vi.fn(async (_url: string, init: RequestInit) => {
            if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            return new Response('body', { status: 200 });
        });
        vi.stubGlobal('fetch', fetchSpy);
        const { fetchWithCorsFallbacks } = await import('../../src/reader/network/proxy-fetch');

        const settlement = trackSettlement(fetchWithCorsFallbacks('/same-origin/resource', '', {
            timeoutMs: 30_000,
            signal: controller.signal,
        }));

        await vi.advanceTimersByTimeAsync(1);
        // The claim under test is transport-level, not message-level: no network
        // request may be issued on a controller that is not carrying the abort.
        // (The rejection MESSAGE is not asserted: jsdom's DOMException is not an
        // `instanceof Error`, so fetchWithCorsFallbacks relabels it here in a way
        // it would not in a browser.)
        const liveSignalFetches = fetchSpy.mock.calls.filter(([, init]) => !init.signal?.aborted);
        expect({ liveSignalFetches: liveSignalFetches.length, cancelled: settlement.outcome !== 'resolved' })
            .toEqual({ liveSignalFetches: 0, cancelled: true });
    });

    // ---------------------------------------------------------------------
    // G. requestBlob(url) takes the default timeout = 0 — the BookWalker canvas
    // mirror's page-image fetch (ocr-providers.ts, reached from imageBlobToCanvas).
    // It used to arm no timer at all, so a manager that dropped the callback hung
    // the OCR pass with no error. The backstop now bounds it. Capping is the
    // intent, not a regression: BookWalker's signed page URLs expire in about a
    // minute, so an image that has not arrived in two has no bytes coming, and an
    // unbounded wait is the hang this module exists to remove.
    // ---------------------------------------------------------------------
    it('G1 bounds an uncapped requestBlob transfer at the backstop instead of waiting forever', async () => {
        const abort = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => ({ abort })));
        const { requestBlob } = await import('../../src/reader/ocr/ocr-providers');

        const settlement = trackSettlement(requestBlob('https://viewer.bookwalker.jp/page/0001.jpg'));

        await vi.advanceTimersByTimeAsync(119_000);
        expect(settlement.outcome).toBe('pending');

        await vi.advanceTimersByTimeAsync(2_000);
        expect(abort).toHaveBeenCalledTimes(1);
        expect(settlement.outcome).toMatch(/timed out/i);
    });

    it('G2 keeps a live download alive past the backstop while progress keeps arriving', async () => {
        const abort = vi.fn();
        let report: ((event: unknown) => void) | undefined;
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn((options: { onprogress?: (event: unknown) => void }) => {
            report = options.onprogress;
            return { abort };
        }));
        const { requestViaUserscriptManager } = await import('../../src/reader/userscript/manager-request');

        const settlement = trackSettlement(requestViaUserscriptManager(
            (globalThis as unknown as { GM_xmlhttpRequest: never }).GM_xmlhttpRequest,
            {
                details: { method: 'GET', url: 'https://example.test/big.zip', onprogress: () => {} },
                readResponse: () => 'done',
            },
        ));

        // Four minutes of a healthy transfer, reporting every 60 s.
        for (let tick = 0; tick < 4; tick += 1) {
            await vi.advanceTimersByTimeAsync(60_000);
            report?.({ loaded: tick });
        }
        expect(abort).not.toHaveBeenCalled();
        expect(settlement.outcome).toBe('pending');

        // Progress stops: the backstop now bites from the last sign of life.
        await vi.advanceTimersByTimeAsync(120_001);
        expect(abort).toHaveBeenCalledTimes(1);
        expect(settlement.outcome).toMatch(/timed out/i);
    });
});
