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

// Shapes below are copied verbatim from the live production viewer (captured
// 2026-07-25), not invented. The previous fixtures used `viewer-trial…`,
// `/trial-page/c` and `OPS/images/…`; production uses `viewer.bookwalker.jp`,
// `/browserWebApi/c` and `…/OEBPS/text/p_XXXX.xhtml/<hash>.jpeg`, so the resolver
// matched nothing, never renewed a signature, and every replayed asset 403'd.
// Signed URLs live ~52 seconds, so this path runs constantly in real reading.
describe('BookWalker signed asset resolver (production URL shapes)', () => {
    const PROD_VIEWER = 'https://viewer.bookwalker.jp/03/30/viewer.html?cid=1ade5c5d-286d-41db-8d9e-db484715aab7&cty=1';
    const PROD_SESSION = 'https://viewer.bookwalker.jp/browserWebApi/c?cid=1ade5c5d-286d-41db-8d9e-db484715aab7';
    const PROD_BASE = 'https://bw-bv-epubs.bookwalker.jp/1_product/1ade5c5d-286d-41db-8d9e-db484715aab7/1/3409568/';
    const PROD_ASSET = `${PROD_BASE}OEBPS/text/p_0000.xhtml/103d38b134e55abf63.jpeg`;

    const prodPolicy = (epoch: number) => btoa(JSON.stringify({
        Statement: [{ Resource: `${PROD_BASE}*`, Condition: { DateLessThan: { 'AWS:EpochTime': epoch } } }],
    })).replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

    const prodAssetUrl = (epoch: number, signature: string) =>
        `${PROD_ASSET}?hti=2ef4d5fcc2254651de839be9cbdf1ff8&cfg=1&pfCd=03`
        + `&Policy=${prodPolicy(epoch)}&Signature=${signature}-signature&Key-Pair-Id=APKAJXSHZG2ORSHLUG5A`;

    const prodSessionResponse = (epoch: number, signature: string) => ({
        status: '200',
        url: PROD_BASE,
        auth_info: {
            Policy: prodPolicy(epoch),
            Signature: `${signature}-signature`,
            'Key-Pair-Id': 'APKAJXSHZG2ORSHLUG5A',
        },
    });

    it('treats an /OEBPS/text asset as refreshable — the old /OPS/images matcher ignored it', () => {
        // 20 s before expiry is inside the refresh margin: the reader must renew
        // rather than replay a URL that is about to 403.
        expect(bookwalkerSignedUrlNeedsRefresh(prodAssetUrl(1_785_005_892, 'old'), 1_785_005_872_000)).toBe(true);
    });

    it('renews an expired production asset URL through /browserWebApi/c', async () => {
        const fetchJson = vi.fn(async () => prodSessionResponse(1_785_006_500, 'fresh'));
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => PROD_VIEWER,
            resourceUrls: () => [PROD_SESSION],
            fetchJson,
            now: () => 1_785_005_900_000,
        });

        const resolved = new URL(await resolver.resolve(prodAssetUrl(1_785_005_892, 'stale')));

        expect(fetchJson).toHaveBeenCalledWith(PROD_SESSION);
        expect(resolved.origin + resolved.pathname).toBe(PROD_ASSET);
        expect(resolved.searchParams.get('Signature')).toBe('fresh-signature');
        // Content-bearing parameters must survive the swap.
        expect(resolved.searchParams.get('hti')).toBe('2ef4d5fcc2254651de839be9cbdf1ff8');
    });

    it('finds the session endpoint without a BID parameter', async () => {
        const fetchJson = vi.fn(async () => prodSessionResponse(1_785_006_500, 'fresh'));
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => PROD_VIEWER,
            resourceUrls: () => [PROD_SESSION],
            fetchJson,
            now: () => 1_785_005_900_000,
        });

        expect(await resolver.refresh(prodAssetUrl(1_785_005_892, 'stale'))).toContain('fresh-signature');
    });

    it('never rewrites a URL outside the content session base path', async () => {
        const fetchJson = vi.fn(async () => prodSessionResponse(1_785_006_500, 'fresh'));
        const resolver = new BookwalkerAssetResolver({
            currentUrl: () => PROD_VIEWER,
            resourceUrls: () => [PROD_SESSION],
            fetchJson,
            now: () => 1_785_005_900_000,
        });
        const foreign = 'https://bw-bv-epubs.bookwalker.jp/1_product/some-other-book/1/1/OEBPS/text/p_0000.xhtml/x.jpeg'
            + `?Policy=${prodPolicy(1_785_005_892)}&Signature=stale-signature&Key-Pair-Id=APKAJXSHZG2ORSHLUG5A`;

        expect(await resolver.refresh(foreign)).toBeUndefined();
    });
});
