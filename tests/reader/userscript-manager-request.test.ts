import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestViaUserscriptManager, DROPPED_CALLBACK_DEADLINE_MS } from '../../src/reader/userscript/manager-request';

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
