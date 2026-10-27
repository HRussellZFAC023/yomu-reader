import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetryableTimeoutError } from '../../src/reader/core/errors';
import { fetchWithCorsFallbacks } from '../../src/reader/network/proxy-fetch';
import { beforeEach } from "vitest";
import { requestBlob as requestOcrBlob } from "../../src/reader/ocr/ocr-providers";
import { requestBlob as requestDictionaryBlob } from "../../src/reader/dictionaries/yomitan/file-utils";

describe('proxy fetch timeout ownership', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('rejects a direct-fetch deadline as a typed retryable timeout', async () => {
        vi.useFakeTimers();
        let transportSignal: AbortSignal | undefined;
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            transportSignal = init?.signal ?? undefined;
            transportSignal?.addEventListener('abort', () => {
                reject(new DOMException('Browser fetch aborted', 'AbortError'));
            }, { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);

        const request = fetchWithCorsFallbacks('/translation-timeout', '', {
            timeoutMs: 25,
            timeoutLabel: 'Translation timed out.',
        });
        const assertion = expect(request).rejects.toMatchObject({
            name: 'RetryableTimeoutError',
            message: 'Translation timed out.',
        });
        await vi.advanceTimersByTimeAsync(25);

        await assertion;
        expect(transportSignal?.reason).toBeInstanceOf(RetryableTimeoutError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('propagates the exact caller abort without waiting for or relabelling it as timeout', async () => {
        vi.useFakeTimers();
        const caller = new AbortController();
        const reason = new DOMException('Selection replaced', 'AbortError');
        const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('Transport noticed abort')), { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);

        const request = fetchWithCorsFallbacks('/translation-cancelled', '', {
            timeoutMs: 25,
            timeoutLabel: 'Translation timed out.',
            signal: caller.signal,
        });
        caller.abort(reason);

        await expect(request).rejects.toBe(reason);
        await vi.advanceTimersByTimeAsync(100);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('manager-request budget drift', () => {
    // QA characterisation of the behaviour DRIFT introduced by routing the
    // hand-rolled GM_xmlhttpRequest wrappers through requestViaUserscriptManager.
    // Neither case is one of the three defects the refactor set out to fix; both are
    // budgets that used to be open-ended on the very transports the fix targets
    // (managers that ignore the `timeout` field) and are now hard wall-clock caps.
    // These tests pin the CURRENT behaviour so a deliberate change to it is visible.

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    function trackSettlement(request: Promise<unknown>): { outcome: string } {
        const settlement = { outcome: 'pending' };
        request.then(
            () => { settlement.outcome = 'resolved'; },
            error => { settlement.outcome = error instanceof Error ? error.message : String(error); },
        );
        return settlement;
    }

    type Details = Parameters<UserscriptHttpRequest>[0];

    // DRIFT 1 — dictionaries/yomitan/file-utils.ts:85.
    // The 120 s used to be a REQUEST to the manager with no local timer, so a
    // manager that ignored it (GM4 / Safari Userscripts / the hosted bridge — the
    // whole reason the fix exists) let a slow archive finish. Enforcing it locally
    // as a wall would have cut those downloads off, trading a hang for a new
    // failure. The budget catches a DROPPED callback, so it counts from the last
    // sign of life: onprogress rearms it, and a download that keeps reporting runs
    // as long as it needs.
    it('lets an actively progressing dictionary download run past its budget', async () => {
        const progress = vi.fn();
        const totalMs = 150_000;
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details: Details) => {
            for (let elapsed = 10_000; elapsed < totalMs; elapsed += 10_000) {
                setTimeout(() => {
                    progress();
                    details.onprogress?.({ lengthComputable: true, loaded: elapsed, total: totalMs });
                }, elapsed);
            }
            setTimeout(() => details.onload?.({ status: 200, response: new Blob(['zip-bytes']) }), totalMs);
            return { abort: vi.fn() };
        }));

        const settlement = trackSettlement(requestDictionaryBlob('https://cdn.example/jitendex.zip', ''));
        await vi.advanceTimersByTimeAsync(119_000);
        expect(settlement.outcome).toBe('pending');
        expect(progress.mock.calls.length).toBeGreaterThan(10);   // the transfer is alive

        await vi.advanceTimersByTimeAsync(2_000);
        // Still alive at 121 s: a fixed wall would have cut it here.
        expect(settlement.outcome).toBe('pending');

        // It finishes at 150 s exactly as it did before the refactor.
        await vi.advanceTimersByTimeAsync(30_000);
        expect(settlement.outcome).toBe('resolved');
    });

    // DRIFT 2 — ocr/ocr-providers.ts:295. requestBlob(url) defaults to
    // timeout = 0, and the module's own fetch fallback (:304) still treats 0 as
    // "no cap". The old wrapper armed no timer for 0; the shared helper reads 0
    // as "no budget named" and applies DROPPED_CALLBACK_DEADLINE_MS instead.
    it('caps an explicitly uncapped OCR image fetch at the 120 s backstop', async () => {
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details: Details) => {
            setTimeout(() => details.onload?.({ status: 200, response: new ArrayBuffer(8) }), 130_000);
            return { abort: vi.fn() };
        }));

        const settlement = trackSettlement(requestOcrBlob('https://cdn.example/page.jpg'));
        await vi.advanceTimersByTimeAsync(131_000);
        // Before the refactor this resolved with the Blob at 130 s. Note also the
        // generic message: requestBlob only passes a timeoutMessage when timeout
        // is truthy, so this deadline cannot say "Image fetch timed out."
        expect(settlement.outcome).toBe('Request timed out.');
    });
});
