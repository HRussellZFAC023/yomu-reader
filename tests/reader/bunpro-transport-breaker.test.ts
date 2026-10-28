import { describe, expect, it, vi } from 'vitest';

import { BunproClient, BunproApiError } from '../../src/reader/bunpro/bunpro';

function networkError(): Error {
    return new TypeError('NetworkError when attempting to fetch resource.');
}

// A transport failure (CORS wall, dead bridge) dooms EVERY Bunpro call from
// this page; without a breaker each hovered word refired the same blocked
// search request and spammed the console with CORS errors.
describe('Bunpro transport circuit breaker', () => {
    it('stops issuing requests after a transport failure', async () => {
        const requestImpl = vi.fn().mockRejectedValue(networkError());
        const client = new BunproClient({ getFrontendToken: () => 'token', requestImpl });
        await expect(client.search('読む')).rejects.toThrow();
        await expect(client.search('新しい')).rejects.toThrow(BunproApiError);
        expect(requestImpl).toHaveBeenCalledTimes(1);
    });

    it('does not trip the breaker on HTTP-status failures', async () => {
        const httpError = Object.assign(new Error('Bunpro API request failed (500).'), { status: 500 });
        const requestImpl = vi.fn().mockRejectedValue(httpError);
        const client = new BunproClient({ getFrontendToken: () => 'token', requestImpl });
        await expect(client.search('読む')).rejects.toThrow();
        await expect(client.search('新しい')).rejects.toThrow();
        expect(requestImpl).toHaveBeenCalledTimes(2);
    });

    it('closes the breaker again after a success', async () => {
        const requestImpl = vi.fn()
            .mockRejectedValueOnce(networkError())
            .mockResolvedValue({ data: [] });
        const client = new BunproClient({ getFrontendToken: () => 'token', requestImpl });
        await expect(client.search('読む')).rejects.toThrow();
        expect(requestImpl).toHaveBeenCalledTimes(1);
        // While the breaker is open, calls fail fast without touching the wire.
        await expect(client.search('新しい')).rejects.toThrow(BunproApiError);
        expect(requestImpl).toHaveBeenCalledTimes(1);
    });

    it('threads the configured proxy into every request', async () => {
        const requestImpl = vi.fn().mockResolvedValue({ data: [] });
        const client = new BunproClient({
            getFrontendToken: () => 'token',
            getProxyUrl: () => 'https://proxy.example/fetch',
            requestImpl,
        });
        await client.search('読む');
        const options = requestImpl.mock.calls[0][1];
        expect(options.proxyUrl).toBe('https://proxy.example/fetch');
        expect(options.allowSensitiveConfiguredProxy).toBe(true);
        expect(options.allowPublicProxies).toBe(false);
    });
});
