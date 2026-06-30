import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostedFallbackProxyUrl } from '../../src/reader/network/http-request';
import { installUserscriptHttpBridge, uninstallUserscriptHttpBridge } from '../../src/reader/userscript/index';

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

    it('never proxies same-origin or non-http requests', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://yomureader.com/'));
        expect(hostedFallbackProxyUrl('https://yomureader.com/api/x')).toBe('');
        expect(hostedFallbackProxyUrl('data:text/plain,hi')).toBe('');
        expect(hostedFallbackProxyUrl('blob:https://x/y')).toBe('');
    });

    it('does NOT proxy on a normal userscript page (off the official hosted reader)', () => {
        uninstallUserscriptHttpBridge();
        vi.stubGlobal('location', new URL('https://hrussellzfac023.github.io/yomu-reader/'));
        expect(hostedFallbackProxyUrl('https://api.jiten.moe/api/vocabulary/parse?text=x')).toBe('');
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=x'));
        expect(hostedFallbackProxyUrl('https://api.jiten.moe/api/vocabulary/parse?text=x')).toBe('');
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
