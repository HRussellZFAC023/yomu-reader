import { describe, expect, it, vi } from 'vitest';

import { BookwalkerAssetResolver, bookwalkerSignedUrlNeedsRefresh } from '../../src/reader/ocr/bookwalker-assets';

const VIEWER = 'https://viewer-trial.bookwalker.jp/03/21/viewer.html?cid=book-id&cty=1';
const SESSION = 'https://viewer-trial.bookwalker.jp/trial-page/c?cid=book-id&BID=session-id';
const ROTATED_SESSION = 'https://viewer-trial.bookwalker.jp/trial-page/c?cid=book-id&BID=rotated-session-id';
const BASE = 'https://viewer-epubs-trial.bookwalker.jp/6_normal/book-id/4/';
const IMAGE_PATH = 'OPS/images/page.jpg/0.jpeg';

describe('BookWalker signed asset resolver', () => {
    it('refreshes an expired recorded image URL through the viewer content session', async () => {
        const expired = signedAssetUrl(1_700_000_000, 'old');
        const fetchJson = vi.fn(async () => sessionResponse(1_700_004_000, 'fresh'));
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => VIEWER,
            resourceUrls: () => [SESSION],
            fetchJson,
            now: () => 1_700_003_000_000,
        });

        const resolved = new URL(await resolver.resolve(expired));

        expect(fetchJson).toHaveBeenCalledWith(SESSION);
        expect(resolved.origin + resolved.pathname).toBe(BASE + IMAGE_PATH);
        expect(resolved.searchParams.get('Signature')).toBe('fresh-signature');
        expect(resolved.searchParams.get('Policy')).toBe(policy(1_700_004_000));
        expect(resolved.searchParams.get('page')).toBe('8');
    });

    it('keeps a fresh signed URL and remembers the session for a later forced refresh', async () => {
        const fresh = signedAssetUrl(1_700_010_000, 'first');
        const fetchJson = vi.fn(async () => sessionResponse(1_700_020_000, 'second'));
        const resourceUrls = vi.fn()
            .mockReturnValueOnce([SESSION])
            .mockReturnValue([]);
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => VIEWER,
            resourceUrls,
            fetchJson,
            now: () => 1_700_000_000_000,
        });

        expect(await resolver.resolve(fresh)).toBe(fresh);
        expect(fetchJson).not.toHaveBeenCalled();
        expect(new URL((await resolver.refresh(fresh)) ?? '').searchParams.get('Signature')).toBe('second-signature');
    });

    it('uses a newer session endpoint after the recorded BID fails', async () => {
        const expired = signedAssetUrl(1_700_000_000, 'old');
        const resourceUrls = vi.fn()
            .mockReturnValueOnce([SESSION])
            .mockReturnValue([SESSION, ROTATED_SESSION]);
        const fetchJson = vi.fn(async (endpoint: string) => {
            if (endpoint === SESSION) throw new Error('Expired BookWalker session');
            return sessionResponse(1_700_040_000, 'rotated');
        });
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => VIEWER,
            resourceUrls,
            fetchJson,
            now: () => 1_700_030_000_000,
        });

        expect(await resolver.refresh(expired)).toBeUndefined();

        const resolved = new URL((await resolver.refresh(expired)) ?? '');

        expect(fetchJson).toHaveBeenNthCalledWith(1, SESSION);
        expect(fetchJson).toHaveBeenNthCalledWith(2, ROTATED_SESSION);
        expect(resolved.searchParams.get('Signature')).toBe('rotated-signature');
    });

    it('rejects a session response whose content root does not own the recorded image', async () => {
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => VIEWER,
            resourceUrls: () => [SESSION],
            fetchJson: async () => ({
                ...sessionResponse(1_700_020_000, 'fresh'),
                url: 'https://viewer-epubs-trial.bookwalker.jp/6_normal/another-book/4/',
            }),
            now: () => 1_700_030_000_000,
        });

        expect(await resolver.refresh(signedAssetUrl(1_700_000_000, 'old'))).toBeUndefined();
    });

    it('recognizes both CloudFront policies and Expires query values near their deadline', () => {
        expect(bookwalkerSignedUrlNeedsRefresh(signedAssetUrl(1_700_000_020, 'old'), 1_700_000_000_000)).toBe(true);
        expect(bookwalkerSignedUrlNeedsRefresh(signedAssetUrl(1_700_000_200, 'new'), 1_700_000_000_000)).toBe(false);
        expect(bookwalkerSignedUrlNeedsRefresh(`${BASE}${IMAGE_PATH}?Expires=1700000010`, 1_700_000_000_000)).toBe(true);
    });
});

function sessionResponse(expiresAt: number, label: string) {
    return {
        status: '200',
        url: BASE,
        auth_info: {
            pfCd: '03',
            Policy: policy(expiresAt),
            Signature: `${label}-signature`,
            'Key-Pair-Id': `${label}-key`,
        },
    };
}

function signedAssetUrl(expiresAt: number, label: string): string {
    const url = new URL(BASE + IMAGE_PATH);
    url.searchParams.set('page', '8');
    url.searchParams.set('pfCd', '03');
    url.searchParams.set('Policy', policy(expiresAt));
    url.searchParams.set('Signature', `${label}-signature`);
    url.searchParams.set('Key-Pair-Id', `${label}-key`);
    return url.toString();
}

function policy(expiresAt: number): string {
    const json = JSON.stringify({
        Statement: [{
            Resource: `${BASE}*`,
            Condition: { DateLessThan: { 'AWS:EpochTime': expiresAt } },
        }],
    });
    return btoa(json).replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');
}
