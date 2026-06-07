import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyPreferredJapaneseSiteLanguage,
    installPreferredJapaneseSiteLanguageFromStoredSettings,
} from '../../src/reader/app/preferred-site-language';
import { SETTINGS_STORAGE_KEY } from '../../src/reader/settings/index';

describe('preferred Japanese site language', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        applyPreferredJapaneseSiteLanguage(false);
        localStorage.clear();
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
});

function settleAsyncHandlers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}
