import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetryableTimeoutError } from '../../src/reader/core/errors';
import { fetchWithCorsFallbacks } from '../../src/reader/network/proxy-fetch';

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
