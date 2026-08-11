import { readFileSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isYomuHostedAppUrl, isYomuPrivilegedHostedAppUrl, isYomuStorageBridgeHostedUrl } from '../../src/reader/app/pages';
import { isYomuNewTabUrl, isYomuStudyRoutePath } from '../../src/reader/newtab/url';
import {
    installUserscriptHttpBridge,
    uninstallUserscriptHttpBridge,
} from '../../src/reader/userscript/bridge-runtime';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '../../src/reader/userscript/storage-bridge';

const HOSTILE_STUDY_URLS = [
    'https://evil.example/study/',
    'https://evil.example/newtab/index.html',
    'https://evil.example/?yomu-newtab=1',
    'https://yomureader.com.evil.example/study/',
    'https://yomureader.com@evil.example/study/',
    'https://evil.example@yomureader.com/study/',
    'http://yomureader.com/study/',
    'https://yomureader.com:444/study/',
    'https://hrussellzfac023.github.io/not-yomu-reader/study/',
    'https://127.0.0.1.evil.example/study/',
    'file:///tmp/study/index.html',
];

describe('trusted Study route', () => {
    afterEach(() => {
        uninstallUserscriptHttpBridge();
        uninstallUserscriptGmStorageBridge();
        delete document.documentElement.dataset.yomuUserscriptHttpBridge;
        delete document.documentElement.dataset.yomuUserscriptStorageBridge;
        vi.unstubAllGlobals();
    });

    it('keeps route shape separate from privileged origin authorization', () => {
        expect(isYomuStudyRoutePath('/study/index.html')).toBe(true);
        expect(isYomuStudyRoutePath('/newtab/')).toBe(true);
        expect(isYomuNewTabUrl('https://yomureader.com/study/')).toBe(true);
        expect(isYomuNewTabUrl('https://yomureader.com/newtab/index.html')).toBe(true);
        expect(isYomuNewTabUrl('https://hrussellzfac023.github.io/yomu-reader/study/')).toBe(true);
        expect(isYomuNewTabUrl('http://localhost:5174/study/index.html')).toBe(true);
        expect(isYomuNewTabUrl('http://127.0.0.1:9000/yomu-reader/newtab/')).toBe(true);
        expect(isYomuNewTabUrl('http://[::1]:5174/study/')).toBe(true);
        expect(isYomuNewTabUrl('chrome-extension://abcdefghijkl/newtab/index.html')).toBe(true);
        expect(isYomuNewTabUrl('moz-extension://yomu-test/newtab/index.html')).toBe(true);
    });

    it.each(HOSTILE_STUDY_URLS)('rejects hostile or ambiguous Study URL %s', value => {
        expect(isYomuNewTabUrl(value)).toBe(false);
        expect(isYomuHostedAppUrl(value)).toBe(false);
        expect(isYomuPrivilegedHostedAppUrl(value)).toBe(false);
        expect(isYomuStorageBridgeHostedUrl(value)).toBe(false);
    });

    it('does not mistake path tricks on the trusted docs origin for the Study route', () => {
        expect(isYomuNewTabUrl('https://yomureader.com/elsewhere/study/')).toBe(false);
        expect(isYomuNewTabUrl('https://yomureader.com/study/%2F..%2Fnewtab/')).toBe(false);
        // The exact production origin remains trusted for other hosted Yomu tools.
        expect(isYomuHostedAppUrl('https://yomureader.com/elsewhere/study/')).toBe(true);
        expect(isYomuPrivilegedHostedAppUrl('https://yomureader.com/elsewhere/study/')).toBe(false);
        expect(isYomuPrivilegedHostedAppUrl('http://localhost:5174/')).toBe(false);
        expect(isYomuPrivilegedHostedAppUrl('https://yomureader.com/academy/')).toBe(true);
    });

    it('gives the exact docs smoke host route parity without broad storage-bridge trust', () => {
        expect(isYomuHostedAppUrl('http://yomureader.localhost:4199/ja/learn/reading')).toBe(true);
        expect(isYomuNewTabUrl('http://yomureader.localhost:4199/study/')).toBe(true);
        expect(isYomuPrivilegedHostedAppUrl('http://yomureader.localhost:4199/ja/')).toBe(false);
        expect(isYomuStorageBridgeHostedUrl('http://yomureader.localhost:4199/ja/')).toBe(false);
        expect(isYomuHostedAppUrl('http://other.yomureader.localhost:4199/ja/')).toBe(false);
    });

    it('does not expose HTTP or GM storage bridges to a hostile Study-looking page', () => {
        vi.stubGlobal('location', new URL('https://evil.example/study/'));
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn());
        vi.stubGlobal('GM_getValue', vi.fn());
        vi.stubGlobal('GM_setValue', vi.fn());

        installUserscriptHttpBridge();
        installUserscriptGmStorageBridge();

        expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBeUndefined();
        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBeUndefined();
    });

    it('keeps the HTTP bridge off docs pages but lets the managed storage bridge cover the trusted origin', () => {
        vi.stubGlobal('location', new URL('https://yomureader.com/elsewhere/study/'));
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn());
        vi.stubGlobal('GM_getValue', vi.fn());
        vi.stubGlobal('GM_setValue', vi.fn());

        installUserscriptHttpBridge();
        installUserscriptGmStorageBridge();

        // The HTTP bridge stays restricted to executable app routes. The
        // storage bridge proxies managed Yomu keys only and must reach every
        // trusted docs page, or settings edited on yomureader.com strand in
        // that origin's localStorage instead of the shared GM store.
        expect(document.documentElement.dataset.yomuUserscriptHttpBridge).toBeUndefined();
        expect(document.documentElement.dataset.yomuUserscriptStorageBridge).toBe('true');
    });
});

describe('hosted Study compatibility alias', () => {
    it('keeps one heavy asset set and a lightweight canonical alias source', () => {
        const canonical = readFileSync('public/newtab/index.html', 'utf8');
        const alias = readFileSync('public/newtab/redirect.html', 'utf8');
        const sync = readFileSync('scripts/sync-docs-userscript.cjs', 'utf8');
        const verify = readFileSync('scripts/verify-userscript.cjs', 'utf8');

        expect(canonical).toContain('<link rel="canonical" href="https://yomureader.com/study/">');
        expect(canonical).toContain('<script src="./app.js');
        expect(statSync('public/newtab/index.html').size).toBeGreaterThan(8_192);
        expect(statSync('public/newtab/redirect.html').size).toBeLessThan(8_192);
        expect(alias).toContain("new URL('../study/', current)");
        expect(alias).not.toContain('./app.js');
        expect(alias).not.toContain("serviceWorker.register('./sw.js')");
        expect(sync).toContain('syncCanonicalStudyRoute();');
        expect(sync).toContain('syncNewTabCompatibilityAlias();');
        expect(sync).not.toContain("copyBuiltAsset('dist/newtab/app.js', 'docs/public/newtab/app.js')");
        expect(verify).toContain("assertLightweightNewTabAlias('docs/public/newtab')");
    });

    it('preserves only deliberate Study state and cannot become an open redirect', async () => {
        const unsafe = await runAliasRedirect(
            'https://yomureader.com/newtab/?mode=stats&q=%E8%AA%AD%E3%82%80&return=https%3A%2F%2Fevil.example&redirect=https%3A%2F%2Fevil.example#javascript:alert(1)',
        );
        expect(unsafe.redirectedTo).toBe('https://yomureader.com/study/?mode=stats&q=%E8%AA%AD%E3%82%80');
        expect(unsafe.unregisteredScopes).toEqual(['https://yomureader.com/newtab/']);

        const academy = await runAliasRedirect(
            'https://yomureader.com/newtab/?return=academy&card=%E8%AA%AD%E3%82%80%00%E3%82%88%E3%82%80&context=lesson-0#card=key&w=%E8%AA%AD%E3%82%80&r=%E3%82%88%E3%82%80',
        );
        expect(academy.redirectedTo).toBe(
            'https://yomureader.com/study/?return=academy&card=%E8%AA%AD%E3%82%80%00%E3%82%88%E3%82%80&context=lesson-0#card=key&w=%E8%AA%AD%E3%82%80&r=%E3%82%88%E3%82%80',
        );
    });
});

async function runAliasRedirect(href: string): Promise<{ redirectedTo: string; unregisteredScopes: string[] }> {
    const html = readFileSync('public/newtab/redirect.html', 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
    if (!script) throw new Error('Compatibility redirect script is missing.');
    let redirectedTo = '';
    const unregisteredScopes: string[] = [];
    const location = {
        href,
        replace: (value: string) => { redirectedTo = value; },
    };
    const registrations = [
        {
            scope: 'https://yomureader.com/newtab/',
            unregister: async () => { unregisteredScopes.push('https://yomureader.com/newtab/'); },
        },
        {
            scope: 'https://yomureader.com/study/',
            unregister: async () => { unregisteredScopes.push('https://yomureader.com/study/'); },
        },
    ];
    const navigator = { serviceWorker: { getRegistrations: async () => registrations } };
    Function('location', 'navigator', 'URL', 'URLSearchParams', script)(location, navigator, URL, URLSearchParams);
    await new Promise(resolve => setTimeout(resolve, 0));
    return { redirectedTo, unregisteredScopes };
}
