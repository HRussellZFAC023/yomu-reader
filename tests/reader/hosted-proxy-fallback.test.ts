import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostedFallbackProxyUrl } from '../../src/reader/network/http-request';
import { proxyUrlCandidates } from '../../src/reader/network/proxy-fetch';
import { installUserscriptHttpBridge, uninstallUserscriptHttpBridge } from '../../src/reader/userscript/index';
import { jpdbApiFetchCandidates } from "../../src/reader/jpdb/jpdb-api";

// The hosted reader (yomureader.com homepage demo, /video-player/, /newtab/) runs
// in the page world with no GM_xmlhttpRequest, so cross-origin api.jiten.moe /
// jpdb.io requests are CORS-blocked. Without a fallback proxy its subtitle parse
// fails → reading-less, pitch-less fallback tokens (no furigana/pitch) and the
// retrying parse churns the caption so word taps miss (video does not pause).
describe('hostedFallbackProxyUrl', () => {
    afterEach(() => {
        uninstallUserscriptHttpBridge();
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        vi.unstubAllGlobals();
    });

    it('routes a cross-origin request through Yomu\'s public proxy on the official hosted reader with no userscript bridge', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://yomureader.com/'));
        const proxied = hostedFallbackProxyUrl('https://api.jiten.moe/api/vocabulary/parse?text=%E9%9F%B3%E6%A5%BD');
        expect(proxied).toBe('https://edge.yomureader.com/');
    });

    it('keeps the deployed workers.dev proxy as a fallback while the Yomu domain is being attached', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://yomureader.com/'));
        const target = 'https://api.jiten.moe/api/vocabulary/parse?text=%E9%9F%B3%E6%A5%BD';
        expect(proxyUrlCandidates(target)).toEqual([
            `https://edge.yomureader.com/?url=${encodeURIComponent(target)}`,
            `https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=${encodeURIComponent(target)}`,
        ]);
    });

    it('never proxies same-origin or non-http requests', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://yomureader.com/'));
        expect(hostedFallbackProxyUrl('https://yomureader.com/api/x')).toBe('');
        expect(hostedFallbackProxyUrl('data:text/plain,hi')).toBe('');
        expect(hostedFallbackProxyUrl('blob:https://x/y')).toBe('');
    });

    it('proxies allowlisted read-only requests on ANY origin when no bridge exists (no dead "No configured proxy." toast)', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://hrussellzfac023.github.io/yomu-reader/'));
        expect(hostedFallbackProxyUrl('https://api.jiten.moe/api/vocabulary/parse?text=x')).toBe('https://edge.yomureader.com/');
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=x'));
        expect(hostedFallbackProxyUrl('https://api.jiten.moe/api/vocabulary/parse?text=x')).toBe('https://edge.yomureader.com/');
    });

    it('never proxies non-allowlisted or sensitive requests off the hosted reader', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=x'));
        expect(hostedFallbackProxyUrl('https://example.com/api/x')).toBe('');
        expect(hostedFallbackProxyUrl('https://jpdb.io/api/v1/lookup-vocabulary', { headers: { Authorization: 'Bearer x' } })).toBe('');
    });

    it('does NOT add a proxy when the userscript HTTP bridge is present (GM bypasses CORS)', () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/'));
        vi.stubGlobal('GM_xmlhttpRequest', () => undefined);
        vi.stubGlobal('GM', undefined);
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        installUserscriptHttpBridge();
        expect(hostedFallbackProxyUrl('https://api.jiten.moe/api/vocabulary/parse?text=x')).toBe('');
    });
});

describe('jpdbApiFetchCandidates candidate order', () => {
    const TARGET = 'https://jpdb.io/api/v1/list-user-decks';
    const PROXY = 'https://yomu-proxy.example/fetch';
    const PROXIED = `${PROXY}?url=${encodeURIComponent(TARGET)}`;

    function stubLocation(href: string): void {
        const url = new URL(href);
        vi.stubGlobal('location', {
            href: url.href,
            origin: url.origin,
            hostname: url.hostname,
            pathname: url.pathname,
        });
    }

    function stubNavigator(overrides: Partial<{ userAgent: string; platform: string; maxTouchPoints: number }>): void {
        vi.stubGlobal('navigator', {
            userAgent: overrides.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            platform: overrides.platform ?? 'Win32',
            maxTouchPoints: overrides.maxTouchPoints ?? 0,
        });
    }


    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('prefers the configured proxy before direct fetch on the hosted GitHub Pages app', () => {
        stubLocation('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([PROXIED, TARGET]);
    });

    it('prefers the configured proxy before direct fetch on any cross-origin http page', () => {
        stubLocation('https://example.com/reader');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([PROXIED, TARGET]);
    });

    it('prefers the configured proxy before direct fetch on Apple touch browsers', () => {
        // Same-origin jpdb.io page (not cross-origin, not hosted) so only the
        // Apple-touch branch can force the proxy-first ordering.
        stubLocation('https://jpdb.io/deck');
        stubNavigator({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 });
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([PROXIED, TARGET]);
    });

    it('fetches direct before the configured proxy on a plain desktop jpdb.io page', () => {
        stubLocation('https://jpdb.io/deck');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, PROXY)).toEqual([TARGET, PROXIED]);
    });

    it('uses only the direct URL when no proxy is configured', () => {
        stubLocation('https://hrussellzfac023.github.io/yomu-reader/newtab/index.html');
        stubNavigator({});
        expect(jpdbApiFetchCandidates(TARGET, '')).toEqual([TARGET]);
    });
});
