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
