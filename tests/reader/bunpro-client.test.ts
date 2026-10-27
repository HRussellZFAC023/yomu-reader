import { describe, expect, it, vi } from 'vitest';

import { BunproClient, BunproApiError } from '../../src/reader/bunpro/bunpro';
import type { ReaderHttpOptions } from '../../src/reader/network/http-options';


describe('BunproClient', () => {
    it('uses the frontend token as a bearer token without public proxy fallback', async () => {
        const request = vi.fn(async () => ({ user: { data: { id: '1' } } }));
        const client = new BunproClient({
            getFrontendToken: () => 'token-123',
            requestImpl: request,
        });

        await expect(client.getUser()).resolves.toEqual({ user: { data: { id: '1' } } });

        const [url, options] = request.mock.calls[0] as unknown as [string, ReaderHttpOptions];
        expect(url).toBe('https://api.bunpro.jp/api/frontend/user');
        expect(options.headers).toMatchObject({
            Authorization: 'Bearer token-123',
            Accept: 'application/json',
            'Content-Type': 'application/json',
        });
        expect(options.allowDirectCrossOrigin).toBe(true);
        expect(options.allowPublicProxies).toBe(false);
        // The user's OWN configured proxy may carry the token (it is their
        // infrastructure) — only the shared public proxy stays forbidden.
        expect(options.allowSensitiveConfiguredProxy).toBe(true);
        expect(options.credentials).toBe('omit');
    });

    it('posts compact frontend search requests and trims bulky sections', async () => {
        const request = vi.fn(async () => ({
            grammar_points: { data: [{ id: 'g1' }, { id: 'g2' }] },
            vocabs: { data: [{ id: 'v1' }, { id: 'v2' }] },
        }));
        const client = new BunproClient({
            getFrontendToken: () => 'token-123',
            requestImpl: request,
        });

        await expect(client.search('読む', { grammar: false, vocab: true, limit: 1 })).resolves.toEqual({
            grammar_points: { data: [{ id: 'g1' }] },
            vocabs: { data: [{ id: 'v1' }] },
        });

        const [url, options] = request.mock.calls[0] as unknown as [string, ReaderHttpOptions];
        expect(url).toBe('https://api.bunpro.jp/api/frontend/search/reviewables_v1_1');
        expect(options.method).toBe('POST');
        expect(JSON.parse(String(options.data))).toMatchObject({
            query: '読む',
            is_searching_grammar: false,
            is_searching_vocab: true,
        });
    });

    it('maps review action requests to Bunpro reviewable tuples', async () => {
        const request = vi.fn(async () => ({ ok: true }));
        const client = new BunproClient({
            getFrontendToken: () => 'token-123',
            requestImpl: request,
        });

        await client.updateReviewsViaActionType({
            actionType: 'add',
            deckId: 7,
            reviewables: [{ type: 'Vocab', id: 42 }],
        });

        const [url, options] = request.mock.calls[0] as unknown as [string, ReaderHttpOptions];
        expect(url).toBe('https://api.bunpro.jp/api/frontend/reviews/update_via_action_type');
        expect(options.method).toBe('PATCH');
        expect(JSON.parse(String(options.data))).toEqual({
            deck_id: 7,
            action_type: 'add',
            reviewables: [['Vocab', 42]],
        });
    });

    it('fails clearly when the frontend token is missing', async () => {
        const client = new BunproClient({ getFrontendToken: () => '' });
        await expect(client.getDueCount()).rejects.toBeInstanceOf(BunproApiError);
    });

    it('serves public reviewable endpoints without a frontend token', async () => {
        const request = vi.fn(async () => ({ data: { attributes: { frequency_general: 334 } } }));
        const client = new BunproClient({ getFrontendToken: () => '', requestImpl: request });

        await expect(client.getVocab('もっと')).resolves.toMatchObject({ data: { attributes: { frequency_general: 334 } } });
        await client.search('もっと');
        await client.getGrammarPoint(466);

        for (const call of request.mock.calls as unknown as Array<[string, ReaderHttpOptions]>) {
            expect(call[1].headers).not.toHaveProperty('Authorization');
        }
        // Account-bound endpoints still demand the token.
        await expect(client.getDueCount()).rejects.toBeInstanceOf(BunproApiError);
        await expect(client.search('もっと', { includeReviews: true })).rejects.toBeInstanceOf(BunproApiError);
    });

    it('does not fire a doomed hosted-app request when Bunpro transport is unavailable', async () => {
        const request = vi.fn();
        const client = new BunproClient({
            getFrontendToken: () => 'token-123',
            requestImpl: request,
            isTransportAvailable: () => false,
        });

        await expect(client.search('読む')).rejects.toMatchObject({
            name: 'BunproApiError',
            message: expect.stringContaining('browser companion'),
        });
        expect(request).not.toHaveBeenCalled();
    });

    it('retries public reviewable endpoints anonymously when the stored token is stale', async () => {
        const request = vi.fn(async (_url: string, options?: ReaderHttpOptions) => {
            if ((options?.headers as Record<string, string> | undefined)?.Authorization) {
                throw Object.assign(new Error('Bunpro API request failed (401).'), { status: 401 });
            }
            return { data: { attributes: { frequency_general: 334 } } };
        });
        const client = new BunproClient({ getFrontendToken: () => 'stale-token', requestImpl: request });

        await expect(client.getVocab('もっと')).resolves.toMatchObject({ data: { attributes: { frequency_general: 334 } } });
        expect(request).toHaveBeenCalledTimes(2);
        // Account-bound endpoints must NOT silently degrade to anonymous.
        await expect(client.getUser()).rejects.toMatchObject({ status: 401 });
    });

    it('normalizes frontend token expiry into a typed 401 error', async () => {
        const request = vi.fn(async () => {
            throw Object.assign(new Error('Bunpro API request failed (401).'), { status: 401 });
        });
        const client = new BunproClient({
            getFrontendToken: () => 'expired-token',
            requestImpl: request,
        });

        await expect(client.getUser()).rejects.toMatchObject({
            name: 'BunproApiError',
            status: 401,
            message: 'Bunpro token expired or was denied.',
        });
    });
});

describe('Bunpro transport circuit breaker', () => {
    function networkError(): Error {
        return new TypeError('NetworkError when attempting to fetch resource.');
    }

    // A transport failure (CORS wall, dead bridge) dooms EVERY Bunpro call from
    // this page; without a breaker each hovered word refired the same blocked
    // search request and spammed the console with CORS errors.

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
