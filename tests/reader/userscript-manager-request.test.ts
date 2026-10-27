import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestViaUserscriptManager, DROPPED_CALLBACK_DEADLINE_MS } from '../../src/reader/userscript/manager-request';
import { isAbortError } from "../../src/reader/core/errors";
import { requestPrivateApi } from "../../src/reader/network/private-request";
import { requestBlob as requestOcrBlob } from "../../src/reader/ocr/ocr-providers";
import { JpdbApiClient } from "../../src/reader/jpdb/jpdb-api";
import { requestSubtitleText } from "../../src/reader/subtitles/subtitle-request";
import { loadReaderCssFallback } from "../../src/reader/styles/index";
import { postAnkiJson } from "../../src/reader/anki/transport";
import { requestBlob as requestDictionaryBlob } from "../../src/reader/dictionaries/yomitan/file-utils";
import { userFacingCopyKeyOf } from "../../src/reader/app/user-facing-errors";

// Every GM_xmlhttpRequest call site used to hand-roll its own promise wrapper,
// and each copy carried some subset of three defects that end in a promise that
// NEVER SETTLES — a reader that hangs with no error anywhere:
//
//   (a) the `timeout` field handed to the manager with no local deadline, so a
//       manager that drops the callback leaves the promise pending forever;
//   (b) the abort handle taken only in the non-thenable branch, so on
//       Violentmonkey (a thenable that ALSO carries abort()) the deadline has
//       nothing to cancel and the transfer runs on orphaned;
//   (c) no teardown when the manager throws synchronously, so the deadline timer
//       and the abort listener stay alive holding the closure for the budget.
//
// These tests drive the shared helper directly; userscript-manager-request-sites
// proves each real call site is routed through it.
describe('userscript manager request helper', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Settlement is invisible from outside once a promise has settled, so track
    // it as data: a test that only awaits cannot tell "never called back" from
    // "called back late".
    function trackSettlement(request: Promise<unknown>): { outcome: string } {
        const settlement = { outcome: 'pending' };
        request.then(
            () => { settlement.outcome = 'resolved'; },
            error => { settlement.outcome = error instanceof Error ? error.message : String(error); },
        );
        return settlement;
    }

    function readText(response: UserscriptHttpResponse): string {
        return String(response.responseText ?? response.response ?? '');
    }

    // (a) A manager that accepts the request and never calls any callback. This
    // is the DOM-event bridge with a dropped message, and every GM4-era manager
    // that ignores the `timeout` field.
    it('rejects at the local deadline when the manager drops the callback', async () => {
        const abort = vi.fn();
        const request = vi.fn(() => ({ abort })) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/a', timeout: 5000 },
            readResponse: readText,
            onTimeout: () => new Error('Site request timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(4999);
        expect(settlement.outcome).toBe('pending');
        await vi.advanceTimersByTimeAsync(2);
        expect(settlement.outcome).toBe('Site request timed out.');
        // The dangling manager request is cancelled, not left running.
        expect(abort).toHaveBeenCalledTimes(1);
    });

    // (a) with no budget at all: private-request sends no `timeout` field, so a
    // compliant manager never fires ontimeout either. The backstop is the floor.
    it('backstops a budget-less request without cutting a slow one short', async () => {
        const request = vi.fn(() => ({ abort: () => undefined })) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/b' },
            readResponse: readText,
            onTimeout: () => new Error('Budget-less request timed out.'),
        }));

        // Clear of every real budget in the reader (the widest explicit one is 30 s).
        await vi.advanceTimersByTimeAsync(30_000);
        expect(settlement.outcome).toBe('pending');
        await vi.advanceTimersByTimeAsync(DROPPED_CALLBACK_DEADLINE_MS - 30_000 + 1);
        expect(settlement.outcome).toBe('Budget-less request timed out.');
    });

    // (b) Violentmonkey's GM.xmlHttpRequest returns a thenable that ALSO carries
    // abort(). Taking the handle only in the else-branch of the thenable check
    // left the deadline with nothing to cancel.
    it('takes the abort handle from a thenable that also exposes abort', async () => {
        const abort = vi.fn();
        const request = vi.fn(() => Object.assign(new Promise<UserscriptHttpResponse>(() => undefined), { abort })) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/c', timeout: 3000 },
            readResponse: readText,
            onTimeout: () => new Error('Thenable request timed out.'),
        }));

        await vi.advanceTimersByTimeAsync(3001);
        expect(settlement.outcome).toBe('Thenable request timed out.');
        expect(abort).toHaveBeenCalledTimes(1);
    });

    // (b)'s other half: a promise-only manager (GM4 / the Safari "Userscripts"
    // extension) resolves instead of firing onload, and must not be left hanging.
    it('bridges a promise-only manager that never fires onload', async () => {
        const request = vi.fn(() => Promise.resolve({ status: 200, response: 'via-promise' })) as unknown as UserscriptHttpRequest;

        await expect(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/d', timeout: 3000 },
            readResponse: readText,
        })).resolves.toBe('via-promise');
        expect(vi.getTimerCount()).toBe(0);
    });

    // (c) A manager can refuse synchronously — a host outside @connect, a dead
    // page-world binding. The rejection alone is not enough: the deadline timer
    // and the abort listener must go with it.
    it('tears the deadline and the abort listener down when the manager throws synchronously', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        const request = vi.fn(() => { throw new Error('Host is not granted to this userscript.'); }) as unknown as UserscriptHttpRequest;

        await expect(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/e', timeout: 5000 },
            signal: controller.signal,
            readResponse: readText,
        })).rejects.toThrow(/not granted/i);
        // Nothing is left holding the request closure for the whole budget.
        expect(vi.getTimerCount()).toBe(0);
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
    });

    it('settles once when a manager answers after the deadline already fired', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        let load: ((response: UserscriptHttpResponse) => void) | undefined;
        const request = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            load = details.onload;
            return { abort: () => undefined };
        }) as unknown as UserscriptHttpRequest;

        const settlement = trackSettlement(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/f', timeout: 1000 },
            signal: controller.signal,
            readResponse: readText,
            onTimeout: () => new Error('Late manager timed out.'),
        }));
        await vi.advanceTimersByTimeAsync(1001);
        expect(settlement.outcome).toBe('Late manager timed out.');
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);

        // A manager that answers after we gave up must be a no-op: settling twice
        // would run teardown against a request that no longer exists.
        load?.({ status: 200, response: 'late' });
        await vi.advanceTimersByTimeAsync(0);
        expect(settlement.outcome).toBe('Late manager timed out.');
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    // readResponse carries each caller's status check and body decode. Thrown
    // from inside the manager's own onload the failure would escape into the
    // manager and leave this promise pending — the same hang by another door.
    it('rejects, not hangs, when the response reader throws', async () => {
        const request = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            details.onload?.({ status: 200, response: '{' });
            return undefined;
        }) as unknown as UserscriptHttpRequest;

        await expect(requestViaUserscriptManager<unknown>(request, {
            details: { url: 'https://example.test/g', timeout: 5000 },
            readResponse: () => { throw new Error('Malformed payload.'); },
        })).rejects.toThrow('Malformed payload.');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('resolves normally and disarms the deadline when the manager answers in time', async () => {
        const request = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            details.onload?.({ status: 200, responseText: 'ok', response: 'ok' });
            return { abort: () => undefined };
        }) as unknown as UserscriptHttpRequest;

        await expect(requestViaUserscriptManager<string>(request, {
            details: { url: 'https://example.test/h', timeout: 5000 },
            readResponse: readText,
        })).resolves.toBe('ok');
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('userscript manager request — cancellation audit', () => {
    // ADVERSARIAL AUDIT of cancellation in the shared userscript-manager transport.
    // Every test here models a manager shape that a real userscript manager can
    // present, and asks: when we give up (deadline or caller abort), is the transfer
    // actually cancelled, and does teardown survive the cancellation?

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

describe('userscript request sites hand the manager the right details', () => {
    // The routed call sites are now three lines of config each, and everything that
    // used to be spelled out in a hand-rolled wrapper — the per-request budget, the
    // privacy flags on bearer traffic, the download progress callback — survives only
    // as a property of `details`. Nothing asserted those properties: the transport
    // suites all drive the stub manager to a deadline or a refusal and never look at
    // what was handed to it, so deleting a field from `details` changes what the
    // manager actually does while every existing suite stays green.
    //
    // These tests read the details object the manager was called with. They are the
    // only thing standing between `anonymous: true` on the account bearer path and a
    // silent, green deletion.

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    type ManagerDetails = Parameters<UserscriptHttpRequest>[0];

    // Accepts the request and never calls back, so the request stays in flight
    // and its details stay readable. Nothing here is ever settled: each caller's
    // promise is parked with a catch so the pending rejection is not unhandled.
    function captureManagerDetails(): { calls: ManagerDetails[] } {
        const calls: ManagerDetails[] = [];
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details: ManagerDetails) => {
            calls.push(details);
            return { abort: () => undefined };
        }));
        return { calls };
    }

    function park(request: Promise<unknown>): void {
        request.catch(() => undefined);
    }

    // The call sites reached through a page-fetch or storage step need their
    // microtasks flushed before the manager has been called.
    async function flush(): Promise<void> {
        await vi.advanceTimersByTimeAsync(0);
    }

    function failPageFetch(): void {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    }

    // The account bearer path is the one place in the reader where the request
    // details are a privacy boundary, not a tuning knob: the sync endpoint must
    // never see the user's cookies for the site they happen to be reading on.
    it('sends account bearer traffic anonymously and without credentials', async () => {
        const { calls } = captureManagerDetails();
        park(requestPrivateApi('https://api.example/account'));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].anonymous).toBe(true);
        expect(calls[0].withCredentials).toBe(false);
        // Deliberately budget-less: the local backstop is the floor, and adding a
        // `timeout` here would change what the manager itself does.
        expect(calls[0].timeout).toBeUndefined();
    });

    it('keeps a 20 minute manager ceiling and download progress for the local idle deadline', async () => {
        const { calls } = captureManagerDetails();
        const progress = vi.fn();
        park(requestDictionaryBlob('https://cdn.example/dict.zip', '', progress));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(20 * 60_000);
        expect(calls[0].responseType).toBe('blob');
        // The import dialog's only sign of life during a multi-megabyte archive.
        expect(typeof calls[0].onprogress).toBe('function');
        calls[0].onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        expect(progress).toHaveBeenCalledTimes(1);
        expect(String(progress.mock.calls[0][0])).toContain('50%');
    });

    it('keeps the reader CSS fallback on its 6 s budget, anonymously', async () => {
        const { calls } = captureManagerDetails();
        const deadFetcher = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        park(loadReaderCssFallback(deadFetcher, 'https://example.test/page'));
        await flush();

        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0].timeout).toBe(6000);
        expect(calls[0].anonymous).toBe(true);
    });

    it('keeps the subtitle fetch on its 8 s budget', async () => {
        failPageFetch();
        const { calls } = captureManagerDetails();
        park(requestSubtitleText('https://cdn.example/details-track.vtt'));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(8000);
    });

    it('keeps the JPDB request on its 30 s budget', async () => {
        const { calls } = captureManagerDetails();
        park(new JpdbApiClient(() => 'token').request('set-card-sentence', {}));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(30_000);
    });

    it('hands AnkiConnect the caller budget and a JSON post', async () => {
        const { calls } = captureManagerDetails();
        park(postAnkiJson('http://127.0.0.1:8765', '{"action":"version"}', 4000));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(4000);
        expect(calls[0].method).toBe('POST');
        expect(calls[0].responseType).toBe('json');
        expect(calls[0].headers?.['Content-Type']).toBe('application/json');
    });

    it('passes the OCR image budget through to the manager', async () => {
        const { calls } = captureManagerDetails();
        park(requestOcrBlob('https://cdn.example/page.jpg', 9000));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(9000);
        expect(calls[0].responseType).toBe('arraybuffer');
    });
});

describe('userscript request sites survive a hostile manager', () => {
    // Every one of these call sites used to wrap GM_xmlhttpRequest by hand, and the
    // wrappers shared three defects that all end the same way — a promise that NEVER
    // SETTLES, i.e. a reader stuck with no error to report:
    //
    //   (a) the `timeout` field handed to the manager with no local deadline;
    //   (b) the abort handle claimed only when the manager's result is NOT thenable;
    //   (c) no teardown when the manager refuses synchronously.
    //
    // The three stub managers below are exactly those transports. A site that is not
    // routed through the shared helper hangs on them, so `pending` here is the
    // regression signal — not a slow test.

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // (a) Accepts the request, then never calls back — the DOM-event bridge with
    // a dropped message, and every manager that ignores the `timeout` field.
    function stubDroppedCallbackManager(): { abort: ReturnType<typeof vi.fn> } {
        const abort = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => ({ abort })));
        return { abort };
    }

    // (b) Violentmonkey: a thenable that ALSO carries abort().
    function stubThenableWithAbortManager(): { abort: ReturnType<typeof vi.fn> } {
        const abort = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => Object.assign(new Promise(() => undefined), { abort })));
        return { abort };
    }

    // (c) Refuses synchronously — a host outside @connect, a dead page-world binding.
    function stubSynchronousRefusalManager(): void {
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => { throw new Error('Host is not granted to this userscript.'); }));
    }

    // Settlement is invisible from outside once a promise settles, so track it as
    // data: awaiting alone cannot tell "never called back" from "answered late".
    // `outcome` keeps Error.message for the plain-Error paths below. `copyKey` is the
    // durable identity for anything that throws a UserFacingError: since #39, those
    // carry an English DIAGNOSTIC on `message` (for logs) and the user-facing string
    // behind `yomuUiCopyKey`, because matching rendered copy is what left the
    // dictionary manual-import recovery unreachable.
    function trackSettlement(request: Promise<unknown>): { outcome: string; copyKey: string } {
        const settlement = { outcome: 'pending', copyKey: '' };
        request.then(
            () => { settlement.outcome = 'resolved'; },
            error => {
                settlement.outcome = error instanceof Error ? error.message : String(error);
                settlement.copyKey = userFacingCopyKeyOf(error) ?? '';
            },
        );
        return settlement;
    }

    async function settle(request: Promise<unknown>, ms: number): Promise<string> {
        const settlement = trackSettlement(request);
        await vi.advanceTimersByTimeAsync(ms);
        return settlement.outcome;
    }

    // The account/bearer path passes NO timeout field at all, so even a fully
    // compliant manager never fires ontimeout. Only the local backstop can end it.
    describe('account bearer sync (private-request)', () => {
        it('(a) gives up at the dropped-callback backstop instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(requestPrivateApi('https://api.example/account'), 120_001))
                .toBe('Reader account request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(requestPrivateApi('https://api.example/account'), 120_001))
                .toBe('Reader account request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(requestPrivateApi('https://api.example/account')).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // OCR image fetch: the site that had defect (b) verbatim — the handle was
    // assigned only in the else-branch of the thenable check.
    describe('OCR image fetch (ocr-providers)', () => {
        it('(a) gives up at its own budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(requestOcrBlob('https://cdn.example/page.jpg', 9000), 9001))
                .toBe('Image fetch timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) aborts a thenable-with-abort manager rather than orphaning the transfer', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(requestOcrBlob('https://cdn.example/page.jpg', 9000), 9001))
                .toBe('Image fetch timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        // requestBlob's own callers pass timeout = 0 (the BookWalker mirror's
        // uncapped fetch), which armed no local timer at all before.
        it('(a) backstops a budget-less image fetch', async () => {
            stubDroppedCallbackManager();
            expect(await settle(requestOcrBlob('https://cdn.example/page.jpg'), 120_001))
                .toBe('Request timed out.');
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(requestOcrBlob('https://cdn.example/page.jpg', 9000)).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // JPDB annotation: lookup/parser only wraps this in withTimeout when
    // allowApiTimeoutFallback is set, so a dropped callback stalled page
    // annotation outright with nothing above it to recover.
    describe('JPDB API (jpdb-api)', () => {
        // set-card-sentence is not a retryable read endpoint, so this is one attempt.
        const jpdbRequest = () => new JpdbApiClient(() => 'token').request('set-card-sentence', {});

        it('(a) gives up at the 30 s budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(jpdbRequest(), 30_001)).toBe('JPDB request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(jpdbRequest(), 30_001)).toBe('JPDB request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(jpdbRequest()).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // Subtitles: the page fetch is tried first, so the stub below makes it fail
    // and hands the request to the userscript transport, which had no local
    // deadline and did not bridge the promise shape at all.
    describe('subtitle text (subtitle-request)', () => {
        // Two attempts (SUBTITLE_REQUEST_MAX_ATTEMPTS) at 8 s each plus the retry delay.
        const SUBTITLE_BUDGET_MS = 8000 * 2 + 250 + 10;

        function failPageFetch(): void {
            vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
        }

        it('(a) gives up at its own budget instead of hanging', async () => {
            failPageFetch();
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(requestSubtitleText('https://cdn.example/track.vtt'), SUBTITLE_BUDGET_MS))
                .toBe('Subtitle request timed out.');
            expect(abort).toHaveBeenCalled();
        });

        it('(b) bridges a promise-shaped manager and cancels it at the deadline', async () => {
            failPageFetch();
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(requestSubtitleText('https://cdn.example/track.vtt'), SUBTITLE_BUDGET_MS))
                .toBe('Subtitle request timed out.');
            expect(abort).toHaveBeenCalled();
        });

        // A synchronous refusal is classed as a retryable transport failure, so
        // the caller's own retry runs; the timer count proves neither attempt
        // left a deadline behind.
        it('(c) reports a synchronous refusal instead of leaking a timer', async () => {
            failPageFetch();
            stubSynchronousRefusalManager();
            expect(await settle(requestSubtitleText('https://cdn.example/track.vtt'), SUBTITLE_BUDGET_MS))
                .toBe('Subtitle request failed during transport.');
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // Reader stylesheet: without a local deadline the fallback walk never
    // advanced past its first URL, so the reader stayed on the critical CSS
    // subset for the whole session with nothing logged.
    describe('reader CSS fallback (styles)', () => {
        // Three fallback URLs, each with its own 6 s userscript attempt.
        const CSS_WALK_BUDGET_MS = 6000 * 3 + 100;

        function deadFetcher(): typeof fetch {
            return vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
        }

        it('(a) finishes the fallback walk instead of hanging on the first URL', async () => {
            stubDroppedCallbackManager();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            expect(await settle(loadReaderCssFallback(deadFetcher(), 'https://example.test/page'), CSS_WALK_BUDGET_MS))
                .toBe('resolved');
        });

        it('(b) finishes the walk against a thenable-with-abort manager', async () => {
            const { abort } = stubThenableWithAbortManager();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            expect(await settle(loadReaderCssFallback(deadFetcher(), 'https://example.test/page'), CSS_WALK_BUDGET_MS))
                .toBe('resolved');
            expect(abort).toHaveBeenCalled();
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            await expect(loadReaderCssFallback(deadFetcher(), 'https://example.test/page')).resolves.toBe('');
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    describe('AnkiConnect (anki/transport)', () => {
        it('(a) gives up at the caller-supplied budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(postAnkiJson('http://127.0.0.1:8765', '{}', 4000), 4001))
                .toBe('AnkiConnect timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(postAnkiJson('http://127.0.0.1:8765', '{}', 4000), 4001))
                .toBe('AnkiConnect timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(postAnkiJson('http://127.0.0.1:8765', '{}', 4000)).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // The dictionary download legitimately needs the widest budget in the reader.
    // 120 s stays 120 s — it is only enforced locally now as well.
    describe('dictionary download (yomitan/file-utils)', () => {
        it('(a) gives up at its own 120 s budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            const request = requestDictionaryBlob('https://cdn.example/dict.zip', '');
            const settlement = trackSettlement(request);
            await vi.advanceTimersByTimeAsync(119_000);
            expect(settlement.outcome).toBe('pending');
            await vi.advanceTimersByTimeAsync(1_100);
            expect(settlement.copyKey).toBe('dictionaryDownloadTimedOut');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            const settlement = trackSettlement(requestDictionaryBlob('https://cdn.example/dict.zip', ''));
            await vi.advanceTimersByTimeAsync(120_001);
            expect(settlement.copyKey).toBe('dictionaryDownloadTimedOut');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) reports a synchronous refusal instead of leaking a timer', async () => {
            stubSynchronousRefusalManager();
            const settlement = trackSettlement(requestDictionaryBlob('https://cdn.example/dict.zip', ''));
            await vi.advanceTimersByTimeAsync(0);
            expect(settlement.copyKey).toBe('dictionaryDownloadFailed');
            expect(vi.getTimerCount()).toBe(0);
        });
    });
});
