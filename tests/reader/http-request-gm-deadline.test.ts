import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestHttp } from '../../src/reader/network/http-request';
import { requestBlob } from "../../src/reader/network/http";

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

    // Settlement is invisible from outside once a promise has settled, so track
    // it as data: a test that only awaits the promise cannot tell "never called
    // back" from "called back late".
    function trackSettlement(request: Promise<unknown>): { outcome: string } {
        const settlement = { outcome: 'pending' };
        request.then(
            () => { settlement.outcome = 'resolved'; },
            error => { settlement.outcome = error instanceof Error ? error.message : String(error); },
        );
        return settlement;
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

    // Violentmonkey's GM.xmlHttpRequest returns a thenable that also carries
    // abort(); if the promise shape wins the dispatch check the deadline has
    // nothing to cancel and the transfer is orphaned, not stopped.
    it('cancels a promise-returning manager that also exposes abort', async () => {
        const abort = vi.fn();
        stubTransport(() => Object.assign(new Promise(() => undefined), { abort }));

        const request = requestHttp('https://translate.example/api', {
            timeoutMs: 5000,
            failureLabel: 'Translation',
        });
        const outcome = expect(request).rejects.toThrow(/timed out/i);
        await vi.advanceTimersByTimeAsync(5001);
        await outcome;
        expect(abort).toHaveBeenCalled();
    });

    it('tears the deadline and the abort listener down exactly once when a manager answers late', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        let load: ((response: unknown) => void) | undefined;
        stubTransport(options => {
            load = options.onload as (response: unknown) => void;
            return { abort: () => undefined };
        });

        const request = requestHttp('https://translate.example/api', { timeoutMs: 1000, signal: controller.signal });
        const outcome = expect(request).rejects.toThrow(/timed out/i);
        await vi.advanceTimersByTimeAsync(1001);
        await outcome;
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);

        // A manager that answers after we gave up must be a no-op: settling
        // twice would run teardown against a request that no longer exists.
        load?.({ status: 200, responseText: 'late', response: 'late' });
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('drops the deadline and the abort listener when the manager refuses synchronously', async () => {
        const controller = new AbortController();
        const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
        stubTransport(() => { throw new Error('Host is not granted to this userscript.'); });

        await expect(requestHttp('https://translate.example/api', {
            timeoutMs: 5000,
            signal: controller.signal,
        })).rejects.toThrow(/not granted/i);
        // Nothing is left holding the request closure for the whole budget.
        expect(vi.getTimerCount()).toBe(0);
        expect(removeAbortListener).toHaveBeenCalledTimes(1);
    });

    // A caller with no budget of its own must still recover from a dropped
    // callback, and the backstop must sit clear of every real budget so it
    // cannot cut a slow-but-healthy request short.
    it('backstops a budget-less request without cutting a slow one short', async () => {
        stubTransport(() => ({ abort: () => undefined }));

        const settlement = trackSettlement(requestHttp('https://translate.example/api', { failureLabel: 'Translation' }));
        await vi.advanceTimersByTimeAsync(30_000);
        expect(settlement.outcome).toBe('pending');

        await vi.advanceTimersByTimeAsync(300_000);
        expect(settlement.outcome).toMatch(/timed out/i);
    });

    it('resolves normally when the manager answers inside the deadline', async () => {
        stubTransport(options => {
            (options.onload as (response: unknown) => void)({ status: 200, responseText: 'ok', response: 'ok' });
            return { abort: () => undefined };
        });

        await expect(requestHttp('https://translate.example/api', { timeoutMs: 5000 })).resolves.toBe('ok');
    });
});

describe('audio blob requests on the hosted (newtab) runtime', () => {
    // A recording userscript request (GM_xmlhttpRequest) that always "succeeds" with
    // an empty body — it stands in for the DOM-event bridge that, in production,
    // cannot carry binary audio Blobs across the content/page world boundary.
    const bridgeCalls: Array<{ url: string }> = [];
    function bridgeRequest(options: { url: string; onload?: (response: unknown) => void }): void {
        bridgeCalls.push({ url: options.url });
        options.onload?.({ status: 200, response: new Blob([new Uint8Array([7])], { type: 'audio/mpeg' }), responseText: '', finalUrl: options.url });
    }

    const CLOUDFRONT_AUDIO = 'https://d1vjc5dkcd3yh2.cloudfront.net/audio/%E8%AA%AD%E3%82%80_%E3%82%88%E3%82%80.mp3';
    const CONFIGURED_PROXY = 'https://proxy.example/fetch';

    let fetchCalls: string[] = [];

    beforeEach(() => {
        bridgeCalls.length = 0;
        fetchCalls = [];
        delete (window as { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__;
        vi.stubGlobal('GM_xmlhttpRequest', bridgeRequest);
        vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
            const url = typeof input === 'string' ? input : String((input as { url?: unknown }).url ?? '');
            fetchCalls.push(url);
            return new Response(new Blob([new Uint8Array([0, 1, 2])], { type: 'audio/mpeg' }), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete (window as { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__;
    });


    it('routes cross-origin audio through configured proxy fetch, not the blob-incapable bridge', async () => {
        (window as { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ = 'newtab';

        const blob = await requestBlob(CLOUDFRONT_AUDIO, { responseType: 'blob', preferFetch: true, proxyUrl: CONFIGURED_PROXY });

        expect(blob.size).toBeGreaterThan(0);
        expect(fetchCalls).toEqual([`${CONFIGURED_PROXY}?url=${encodeURIComponent(CLOUDFRONT_AUDIO)}`]);
        expect(bridgeCalls).toHaveLength(0);
    });

    it('still uses the userscript bridge for cross-origin audio off the hosted runtime', async () => {
        // Not the newtab runtime: a real userscript on jpdb.io etc. must keep using
        // the bridge (its GM_xmlhttpRequest is exempt from the page CSP).
        await requestBlob(CLOUDFRONT_AUDIO, { responseType: 'blob', preferFetch: true }).catch(() => undefined);

        expect(bridgeCalls.some(call => call.url === CLOUDFRONT_AUDIO)).toBe(true);
        expect(fetchCalls).toHaveLength(0);
    });
});
