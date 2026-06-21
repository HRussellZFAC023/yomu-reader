import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyPreferredJapaneseSiteLanguage,
    installPreferredJapaneseSiteLanguageFromStoredSettings,
    preferredJapaneseSiteUrl,
} from '../../src/reader/app/preferred-site-language';
import { SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';

describe('preferred Japanese site language', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        applyPreferredJapaneseSiteLanguage(false);
        localStorage.clear();
        sessionStorage.clear();
        document.head.querySelectorAll('[data-test-japanese-alternate]').forEach(element => element.remove());
        document.cookie.split(/;\s*/).forEach(cookie => {
            const name = cookie.split('=')[0];
            if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
        });
        vi.unstubAllGlobals();
        if (originalFetch) vi.stubGlobal('fetch', originalFetch);
        vi.restoreAllMocks();
    });

    it('applies the default-on Japanese locale hints from empty storage', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('unsafeWindow', window);

        installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();

        expect(navigator.language).toBe('ja-JP');
        expect(navigator.languages.slice(0, 2)).toEqual(['ja-JP', 'ja']);
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Tokyo');
        expect(new Date().getTimezoneOffset()).toBe(-540);
    });

    it('builds Japanese URLs for common locale-based sites', () => {
        expect(preferredJapaneseSiteUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/watch?v=abc123&hl=ja&gl=JP');
        expect(preferredJapaneseSiteUrl('https://youtu.be/abc123?t=14')).toBe('https://www.youtube.com/watch?v=abc123&t=14&hl=ja&gl=JP');
        expect(preferredJapaneseSiteUrl('https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E&hl=en')).toBe('https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E&hl=ja&gl=JP');
        expect(preferredJapaneseSiteUrl('https://news.google.com/home?hl=en-US&gl=US&ceid=US%3Aen')).toBe('https://news.google.com/home?hl=ja&gl=JP&ceid=JP%3Aja');
        expect(preferredJapaneseSiteUrl('https://developer.mozilla.org/en-US/docs/Web/JavaScript')).toBe('https://developer.mozilla.org/ja/docs/Web/JavaScript');
        expect(preferredJapaneseSiteUrl('https://docs.github.com/en/get-started/start-your-journey/about-github-and-git')).toBe('https://docs.github.com/ja/get-started/start-your-journey/about-github-and-git');
        expect(preferredJapaneseSiteUrl('https://learn.microsoft.com/en-us/windows/apps/')).toBe('https://learn.microsoft.com/ja-jp/windows/apps/');
        expect(preferredJapaneseSiteUrl('https://support.apple.com/en-us/102603')).toBe('https://support.apple.com/ja-jp/102603');
    });

    it('rewrites generic English URL locale hints to Japanese', () => {
        expect(preferredJapaneseSiteUrl('https://en.example.com/docs/start?locale=en_US')).toBe('https://ja.example.com/docs/start?locale=en_US');
        expect(preferredJapaneseSiteUrl('https://example.com/en-US/products?language=en-US&region=US')).toBe('https://example.com/ja-jp/products?language=en-US&region=US');
    });

    it('rewrites Google consent continuations to the Japanese destination', () => {
        const target = preferredJapaneseSiteUrl('https://consent.google.com/m?continue=https%3A%2F%2Fnews.google.com%2Fhome%3Fhl%3Den-US%26gl%3DUS%26ceid%3DUS%253Aen&gl=GB&hl=en-US');
        const consent = new URL(target!);
        const continued = new URL(consent.searchParams.get('continue')!);

        expect(consent.searchParams.get('hl')).toBe('ja');
        expect(consent.searchParams.get('gl')).toBe('JP');
        expect(continued.hostname).toBe('news.google.com');
        expect(continued.searchParams.get('hl')).toBe('ja');
        expect(continued.searchParams.get('gl')).toBe('JP');
        expect(continued.searchParams.get('ceid')).toBe('JP:ja');
    });

    it('prefers exact Japanese alternate links when a page exposes them', () => {
        const link = document.createElement('link');
        link.dataset.testJapaneseAlternate = 'true';
        link.rel = 'alternate';
        link.hreflang = 'ja';
        link.href = 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E';
        document.head.append(link);

        expect(preferredJapaneseSiteUrl('https://en.wikipedia.org/wiki/Japanese_language', document)).toBe('https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E');
    });

    it('uses Japanese hreflang anchors for Wikipedia-style interlanguage links', () => {
        const anchor = document.createElement('a');
        anchor.dataset.testJapaneseAlternate = 'true';
        anchor.setAttribute('hreflang', 'ja');
        anchor.href = 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E';
        document.body.append(anchor);

        expect(preferredJapaneseSiteUrl('https://en.wikipedia.org/wiki/Japanese_language', document)).toBe('https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E');
        anchor.remove();
    });

    it('replaces the current URL when the setting is enabled on a known site', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            hostname: 'www.youtube.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(true);

        expect(replace).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123&hl=ja&gl=JP');
    });

    it('returns to the remembered default URL when the setting is disabled after a redirect', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123',
            hostname: 'www.youtube.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(true);
        expect(replace).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123&hl=ja&gl=JP');

        replace.mockClear();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=abc123&hl=ja&gl=JP',
            hostname: 'www.youtube.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(false, true);

        expect(replace).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
    });

    it('does not force a default URL when an already-disabled preference is applied at startup', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://developer.mozilla.org/ja/docs/Web/JavaScript',
            hostname: 'developer.mozilla.org',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(false);

        expect(replace).not.toHaveBeenCalled();
    });

    it('uses the local opt-out cache before the default-on setting', () => {
        const language = navigator.language;
        localStorage.setItem('yomu:prefer-japanese-site-language', 'false');
        vi.stubGlobal('unsafeWindow', window);

        installPreferredJapaneseSiteLanguageFromStoredSettings();

        expect(navigator.language).toBe(language);
    });

    it('waits for async-only userscript storage before applying the default', async () => {
        const language = navigator.language;
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM', {
            getValue: vi.fn(async (key: string, fallback: unknown) => (
                key === SETTINGS_STORAGE_KEY ? { preferJapaneseSiteLanguage: false } : fallback
            )),
        });
        vi.stubGlobal('unsafeWindow', window);

        installPreferredJapaneseSiteLanguageFromStoredSettings();
        expect(navigator.language).toBe(language);
        await settleAsyncHandlers();

        expect(navigator.language).toBe(language);
    });

    it('can restore page-level patches and clear site preference cookies when disabled', () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'));
        const originalLanguage = navigator.language;
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', { hostname: 'www.google.com', protocol: 'http:' });

        applyPreferredJapaneseSiteLanguage(true);
        document.cookie = 'PREF=hl=ja&gl=JP&keep=1; Path=/';
        expect(navigator.language).toBe('ja-JP');
        expect(document.cookie).toContain('PREF=');

        applyPreferredJapaneseSiteLanguage(false);

        expect(navigator.language).toBe(originalLanguage);
        expect(globalThis.fetch).toBe(fetchMock);
        expect(document.cookie).toContain('keep=1');
        expect(document.cookie).not.toContain('hl=ja');
        expect(document.cookie).not.toContain('gl=JP');
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
    });

    it('injects page-realm shims instead of patching a separate unsafeWindow directly', () => {
        const unsafeFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'));
        const unsafeWindow = {
            fetch: unsafeFetch,
            navigator: {},
            Headers,
            Request,
        };
        const appendedScripts: string[] = [];
        const appendSpy = vi.spyOn(document.head, 'append').mockImplementation((...nodes: Array<Node | string>) => {
            for (const node of nodes) {
                if (node instanceof HTMLScriptElement) appendedScripts.push(node.textContent ?? '');
            }
        });
        vi.stubGlobal('unsafeWindow', unsafeWindow);

        applyPreferredJapaneseSiteLanguage(true);

        expect(unsafeWindow.fetch).toBe(unsafeFetch);
        expect(appendedScripts.join('\n')).toContain('const JAPANESE_LOCALE = "ja-JP";');
        expect(appendedScripts.join('\n')).toContain('applyJapanesePreferencesInPage(globalThis, true)');
        appendSpy.mockRestore();
    });

    it('uses page injection in WebExtension content scripts even when unsafeWindow mirrors window', () => {
        const language = navigator.language;
        const appendedScripts: string[] = [];
        const appendSpy = vi.spyOn(document.head, 'append').mockImplementation((...nodes: Array<Node | string>) => {
            for (const node of nodes) {
                if (node instanceof HTMLScriptElement) appendedScripts.push(node.textContent ?? '');
            }
        });
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('browser', { runtime: { id: 'yomu-extension-test' } });

        applyPreferredJapaneseSiteLanguage(true);

        expect(navigator.language).toBe(language);
        expect(appendedScripts.join('\n')).toContain('const crossRealmDescriptor =');
        expect(appendedScripts.join('\n')).toContain('applyJapanesePreferencesInPage(globalThis, true)');
        appendSpy.mockRestore();
    });

    it('clones Trusted Types script policy callbacks before injecting page shims', () => {
        const clonedOptions = { createScript: vi.fn((code: string) => code) };
        const cloneInto = vi.fn(() => clonedOptions);
        const createPolicy = vi.fn((_name: string, options: typeof clonedOptions) => {
            if (options !== clonedOptions) throw new Error('uncloned script policy options');
            return { createScript: options.createScript };
        });
        const appendSpy = vi.spyOn(document.head, 'append').mockImplementation(() => undefined);
        vi.stubGlobal('browser', { runtime: { id: 'yomu-extension-test' } });
        vi.stubGlobal('cloneInto', cloneInto);
        vi.stubGlobal('trustedTypes', { createPolicy });
        vi.stubGlobal('unsafeWindow', window);

        applyPreferredJapaneseSiteLanguage(true);

        expect(cloneInto).toHaveBeenCalledWith(expect.objectContaining({
            createScript: expect.any(Function),
        }), window, { cloneFunctions: true, wrapReflectors: true });
        expect(createPolicy).toHaveBeenCalledWith('yomu-reader-script', clonedOptions);
        appendSpy.mockRestore();
    });
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
