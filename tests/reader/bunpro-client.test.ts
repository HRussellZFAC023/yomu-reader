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

    it('supports the legacy API key only for legacy endpoints', async () => {
        const request = vi.fn(async () => ({ requested_information: { reviews_available: 3 } }));
        const client = new BunproClient({
            getLegacyApiKey: () => 'legacy-key',
            requestImpl: request,
        });

        await client.getLegacyStudyQueue();

        const [url, options] = request.mock.calls[0] as unknown as [string, ReaderHttpOptions];
        expect(url).toBe('https://bunpro.jp/api/user/legacy-key/study_queue');
        expect(options.headers).toEqual({ Accept: 'application/json' });
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
