import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyPreferredJapaneseSiteLanguage,
    installPreferredJapaneseSiteLanguageFromStoredSettings,
    preferredJapaneseSiteUrl,
} from '../../src/reader/app/preferred-site-language-impl';
import {
    DEFAULT_SETTINGS,
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEY,
} from '../../src/reader/settings/index';

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
        vi.useRealTimers();
    });

    it('applies Japanese locale hints without changing timezone or geolocation', async () => {
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'));
        const browserLocation = {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset(),
            geolocation: navigator.geolocation,
        };
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('unsafeWindow', window);

        installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();

        expect(navigator.language).toBe('ja-JP');
        expect(navigator.languages.slice(0, 2)).toEqual(['ja-JP', 'ja']);
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(browserLocation.timeZone);
        expect(new Date().getTimezoneOffset()).toBe(browserLocation.offset);
        expect(navigator.geolocation).toBe(browserLocation.geolocation);
    });

    it('leaves browser location signals untouched for a stored Spanish target', async () => {
        const browserSignals = {
            language: navigator.language,
            languages: [...navigator.languages],
            intlLocale: Intl.DateTimeFormat().resolvedOptions().locale,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset(),
            geolocation: navigator.geolocation,
        };
        const replace = vi.fn();
        const spanishSettings = {
            ...DEFAULT_SETTINGS,
            preferJapaneseSiteLanguage: true,
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile =>
                profile.id === DEFAULT_SETTINGS.activeLanguageProfileId
                    ? { ...profile, targetLanguage: 'es' }
                    : profile),
        };
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => {
            if (key === PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY) return true;
            // The dedicated scalar can be synchronous while the profile-bearing
            // settings blob is still resolving through a userscript bridge.
            if (key === SETTINGS_STORAGE_KEY) return Promise.resolve(spanishSettings);
            return fallback;
        });
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.google.com/search?q=hola',
            hostname: 'www.google.com',
            protocol: 'https:',
            replace,
        });

        installPreferredJapaneseSiteLanguageFromStoredSettings();
        await settleAsyncHandlers();

        expect({
            language: navigator.language,
            languages: [...navigator.languages],
            intlLocale: Intl.DateTimeFormat().resolvedOptions().locale,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset(),
            geolocation: navigator.geolocation,
        }).toEqual(browserSignals);
        expect(replace).not.toHaveBeenCalled();

        applyPreferredJapaneseSiteLanguage(true, false, false, 'es');

        expect(navigator.language).toBe(browserSignals.language);
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(browserSignals.timeZone);
        expect(navigator.geolocation).toBe(browserSignals.geolocation);
        expect(replace).not.toHaveBeenCalled();
    });

    it('does not wrap page fetch requests while applying locale hints', () => {
        // The language preference used to wrap page fetch/XHR to add
        // Accept-Language. A missing injected helper broke YouTube and Reddit
        // request pipelines with ReferenceError/Request failed. Locale hints now
        // stay in navigator/Intl locale hints, cookies and URLs only.
        const seen: Array<{ url: string; acceptLanguage: string | null }> = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            seen.push({ url: String(input), acceptLanguage: new Headers(init?.headers).get('Accept-Language') });
            return new Response('ok');
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('unsafeWindow', window);
        applyPreferredJapaneseSiteLanguage(true);

        void window.fetch('/api/feed');
        void window.fetch('https://fonts.gstatic.com/s/i/icon.svg');

        const sameOrigin = seen.find(entry => entry.url.includes('/api/feed'));
        const crossOrigin = seen.find(entry => entry.url.includes('gstatic'));
        expect(globalThis.fetch).toBe(fetchMock);
        expect(sameOrigin?.acceptLanguage).toBeNull();
        expect(crossOrigin?.acceptLanguage).toBeNull();
    });

    it('leaves fragile app feed requests untouched on YouTube and Reddit', () => {
        const seen: Array<{ url: string; acceptLanguage: string | null }> = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            seen.push({ url: String(input), acceptLanguage: new Headers(init?.headers).get('Accept-Language') });
            return new Response('ok');
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/?hl=ja&gl=JP',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            protocol: 'https:',
            replace: vi.fn(),
        });

        applyPreferredJapaneseSiteLanguage(true);

        void window.fetch('/youtubei/v1/browse?prettyPrint=false');
        void window.fetch('https://www.reddit.com/svc/shreddit/comments');

        expect(seen[0]?.acceptLanguage).toBeNull();
        expect(seen[1]?.acceptLanguage).toBeNull();
    });

    it('builds Japanese URLs for common locale-based sites', () => {
        expect(preferredJapaneseSiteUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/watch?v=abc123&hl=ja&gl=JP');
        expect(preferredJapaneseSiteUrl('https://youtu.be/abc123?t=14')).toBe('https://www.youtube.com/watch?v=abc123&t=14&hl=ja&gl=JP');
        expect(preferredJapaneseSiteUrl('https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E&hl=en')).toBe('https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E&hl=ja&gl=JP');
        expect(preferredJapaneseSiteUrl('https://news.google.com/home?hl=en-US&gl=US&ceid=US%3Aen')).toBe('https://news.google.com/home?hl=ja&gl=JP&ceid=JP%3Aja');
        expect(preferredJapaneseSiteUrl('https://www.reddit.com/r/newsokur/?feed=home')).toBe('https://www.reddit.com/r/newsokur/?feed=home&locale=ja-JP');
        expect(preferredJapaneseSiteUrl('https://developer.mozilla.org/en-US/docs/Web/JavaScript')).toBe('https://developer.mozilla.org/ja/docs/Web/JavaScript');
        expect(preferredJapaneseSiteUrl('https://docs.github.com/en/get-started/start-your-journey/about-github-and-git')).toBe('https://docs.github.com/ja/get-started/start-your-journey/about-github-and-git');
        expect(preferredJapaneseSiteUrl('https://learn.microsoft.com/en-us/windows/apps/')).toBe('https://learn.microsoft.com/ja-jp/windows/apps/');
        expect(preferredJapaneseSiteUrl('https://support.apple.com/en-us/102603')).toBe('https://support.apple.com/ja-jp/102603');
    });

    it('rewrites generic English URL locale hints to Japanese', () => {
        expect(preferredJapaneseSiteUrl('https://en.example.com/docs/start?locale=en_US')).toBe('https://ja.example.com/docs/start?locale=ja_JP');
        expect(preferredJapaneseSiteUrl('https://example.com/en-US/products?language=en-US&region=US')).toBe('https://example.com/ja-jp/products?language=ja-JP&region=JP');
        expect(preferredJapaneseSiteUrl('https://example.com/products?locale=en-US&mkt=en-US&gl=US')).toBe('https://example.com/products?locale=ja-JP&mkt=ja-JP&gl=JP');
        expect(preferredJapaneseSiteUrl('https://developer.mozilla.org/en-US/docs/Web/JavaScript?locale=en_US')).toBe('https://developer.mozilla.org/ja/docs/Web/JavaScript?locale=ja_JP');
        expect(preferredJapaneseSiteUrl('https://example.com/search?tl=en')).toBeNull();
    });

    it('waits for page metadata before applying generic locale URL guesses', () => {
        const readyState = vi.spyOn(document, 'readyState', 'get');
        readyState.mockReturnValue('loading');

        expect(preferredJapaneseSiteUrl('https://example.com/en/docs', document)).toBeNull();

        readyState.mockReturnValue('complete');

        expect(preferredJapaneseSiteUrl('https://example.com/en/docs', document)).toBe('https://example.com/ja/docs');
    });

    it('does not guess a Japanese URL when the page declares alternates without Japanese', () => {
        const readyState = vi.spyOn(document, 'readyState', 'get');
        readyState.mockReturnValue('complete');
        for (const language of ['en', 'es', 'fr', 'pt', 'ru', 'zh']) {
            const link = document.createElement('link');
            link.dataset.testJapaneseAlternate = 'true';
            link.rel = 'alternate';
            link.hreflang = language;
            link.href = `https://handbook.example/${language}`;
            document.head.append(link);
        }

        expect(preferredJapaneseSiteUrl('https://handbook.example/en', document)).toBeNull();
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

    // The reported bug: the cache is per origin, so every site opened while the
    // preference was on pinned itself to on, and turning it off anywhere else
    // could never reach them — "every new page has defaulted to having that on".
    it('lets a stored opt-out override a stale enabled cache left by an earlier visit', () => {
        const language = navigator.language;
        const replace = vi.fn();
        localStorage.setItem('yomu:prefer-japanese-site-language', 'true');
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (
            key === SETTINGS_STORAGE_KEY ? { preferJapaneseSiteLanguage: false } : fallback
        ));
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/newsokur/',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        installPreferredJapaneseSiteLanguageFromStoredSettings();

        expect(navigator.language).toBe(language);
        expect(replace).not.toHaveBeenCalled();
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
    });

    it('lets the dedicated opt-out outrank a stale whole-settings save at document-start', () => {
        const language = navigator.language;
        localStorage.setItem('yomu:prefer-japanese-site-language', 'true');
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => {
            if (key === PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY) return false;
            if (key === SETTINGS_STORAGE_KEY) return { preferJapaneseSiteLanguage: true };
            return fallback;
        });
        vi.stubGlobal('unsafeWindow', window);

        installPreferredJapaneseSiteLanguageFromStoredSettings();

        expect(navigator.language).toBe(language);
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
    });

    it('reconciles a stale enabled cache with async-only storage without redirecting on the cache', async () => {
        const language = navigator.language;
        const replace = vi.fn();
        localStorage.setItem('yomu:prefer-japanese-site-language', 'true');
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM', {
            getValue: vi.fn(async (key: string, fallback: unknown) => (
                key === SETTINGS_STORAGE_KEY ? { preferJapaneseSiteLanguage: false } : fallback
            )),
        });
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/newsokur/',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        installPreferredJapaneseSiteLanguageFromStoredSettings();
        // A site can snapshot navigator/Intl during its own startup, so even a
        // reversible stale locale hint is already observable damage.
        expect(navigator.language).toBe(language);
        expect(replace).not.toHaveBeenCalled();
        await settleAsyncHandlers();

        expect(navigator.language).toBe(language);
        expect(replace).not.toHaveBeenCalled();
    });

    it('does not let a stale per-origin settings record bypass an async shared opt-out', async () => {
        const language = navigator.language;
        const replace = vi.fn();
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ preferJapaneseSiteLanguage: true }));
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM', {
            getValue: vi.fn(async (key: string, fallback: unknown) => (
                key === SETTINGS_STORAGE_KEY ? { preferJapaneseSiteLanguage: false } : fallback
            )),
        });
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/newsokur/',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        installPreferredJapaneseSiteLanguageFromStoredSettings();

        expect(navigator.language).toBe(language);
        expect(replace).not.toHaveBeenCalled();
        await settleAsyncHandlers();

        expect(navigator.language).toBe(language);
        expect(replace).not.toHaveBeenCalled();
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
    });

    it('ignores an obsolete async enabled read after a newer opt-out', async () => {
        const language = navigator.language;
        const replace = vi.fn();
        let resolveStoredPreference!: (value: unknown) => void;
        const storedPreference = new Promise<unknown>(resolve => {
            resolveStoredPreference = resolve;
        });
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM', {
            getValue: vi.fn((key: string, fallback: unknown) => (
                key === SETTINGS_STORAGE_KEY ? storedPreference : Promise.resolve(fallback)
            )),
        });
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/newsokur/',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        await installPreferredJapaneseSiteLanguageFromStoredSettings();
        applyPreferredJapaneseSiteLanguage(false, true);
        resolveStoredPreference({ preferJapaneseSiteLanguage: true });
        await storedPreference;
        await settleAsyncHandlers();

        expect(navigator.language).toBe(language);
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
        expect(replace).not.toHaveBeenCalled();
    });

    it('still applies a stored preference synchronously so an enabled site never flashes English', () => {
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (
            key === SETTINGS_STORAGE_KEY ? { preferJapaneseSiteLanguage: true } : fallback
        ));
        vi.stubGlobal('unsafeWindow', window);

        installPreferredJapaneseSiteLanguageFromStoredSettings();

        expect(navigator.language).toBe('ja-JP');
    });

    // Symptom two: the maintainer found that turning the preference off left
    // reddit's ?locale=ja-JP in the URL, so the site simply stayed Japanese.
    it('strips the Japanese locale markers when disabled without a remembered source URL', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/LearnJapanese/?locale=ja-JP&after=t3_1',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(false, true);

        expect(replace).toHaveBeenCalledWith('https://www.reddit.com/r/LearnJapanese/?after=t3_1');
    });

    it('never treats a stale enabled cache as permission to navigate during an authoritative opt-out', () => {
        const replace = vi.fn();
        localStorage.setItem('yomu:prefer-japanese-site-language', 'true');
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (
            key === SETTINGS_STORAGE_KEY ? { preferJapaneseSiteLanguage: false } : fallback
        ));
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/LearnJapanese/?locale=ja-JP&after=t3_1',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        installPreferredJapaneseSiteLanguageFromStoredSettings();

        expect(replace).not.toHaveBeenCalled();
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
    });

    it('keeps an authoritative opt-out inert across repeated language-host cold starts', () => {
        const replace = vi.fn();
        localStorage.setItem('yomu:prefer-japanese-site-language', 'true');
        vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => (
            key === PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY
                ? false
                : key === SETTINGS_STORAGE_KEY
                    ? { preferJapaneseSiteLanguage: true }
                    : fallback
        ));
        vi.stubGlobal('unsafeWindow', window);

        for (const href of [
            'https://en.wikipedia.org/wiki/Japanese_language',
            'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
            'https://en.wikipedia.org/wiki/Japanese_language',
        ]) {
            localStorage.setItem('yomu:prefer-japanese-site-language', 'true');
            vi.stubGlobal('location', {
                href,
                hostname: new URL(href).hostname,
                protocol: 'https:',
                replace,
            });
            installPreferredJapaneseSiteLanguageFromStoredSettings();
        }

        expect(replace).not.toHaveBeenCalled();
        expect(localStorage.getItem('yomu:prefer-japanese-site-language')).toBe('false');
    });

    it('reloads once when a cleared Japanese preference cookie already shaped the response', () => {
        const replace = vi.fn();
        let cookie = 'PREF=hl=ja&gl=JP&keep=1';
        vi.spyOn(document, 'cookie', 'get').mockImplementation(() => cookie);
        vi.spyOn(document, 'cookie', 'set').mockImplementation(value => {
            const [pair] = value.split(';');
            if (pair?.startsWith('PREF=')) cookie = pair;
        });
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.google.com/search?q=nihongo',
            hostname: 'www.google.com',
            protocol: 'https:',
            replace,
        });

        // The UI first cancels locale work synchronously, then only navigates
        // after the dedicated opt-out key has been durably stored.
        applyPreferredJapaneseSiteLanguage(false, false, true);
        expect(replace).not.toHaveBeenCalled();
        applyPreferredJapaneseSiteLanguage(false, true);

        expect(document.cookie).toContain('keep=1');
        expect(document.cookie).not.toContain('hl=ja');
        expect(document.cookie).not.toContain('gl=JP');
        expect(replace).toHaveBeenCalledWith('https://www.google.com/search?q=nihongo');
    });

    it('drops a Japanese path locale segment rather than guessing an English one', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://learn.microsoft.com/ja-jp/azure/overview',
            hostname: 'learn.microsoft.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(false, true);

        expect(replace).toHaveBeenCalledWith('https://learn.microsoft.com/azure/overview');
    });

    it('prefers the page x-default alternate over stripping markers', () => {
        const replace = vi.fn();
        const link = document.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hreflang', 'x-default');
        link.setAttribute('href', 'https://example.com/store');
        link.setAttribute('data-test-japanese-alternate', '');
        document.head.append(link);
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://example.com/store?locale=ja-JP',
            hostname: 'example.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(false, true);

        expect(replace).toHaveBeenCalledWith('https://example.com/store');
    });

    it('leaves a URL with no Japanese markers alone when disabled', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.reddit.com/r/LearnJapanese/',
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });

        applyPreferredJapaneseSiteLanguage(false, true);

        expect(replace).not.toHaveBeenCalled();
    });

    it('can redirect the same host again after the preference is turned off and back on', () => {
        const replace = vi.fn();
        const atReddit = (href: string) => vi.stubGlobal('location', {
            href,
            hostname: 'www.reddit.com',
            protocol: 'https:',
            replace,
        });
        vi.stubGlobal('unsafeWindow', window);

        atReddit('https://www.reddit.com/');
        applyPreferredJapaneseSiteLanguage(true);
        expect(replace).toHaveBeenCalledWith('https://www.reddit.com/?locale=ja-JP');

        atReddit('https://www.reddit.com/?locale=ja-JP');
        applyPreferredJapaneseSiteLanguage(false, true);
        expect(replace).toHaveBeenLastCalledWith('https://www.reddit.com/');

        replace.mockClear();
        atReddit('https://www.reddit.com/');
        applyPreferredJapaneseSiteLanguage(true);

        expect(replace).toHaveBeenCalledWith('https://www.reddit.com/?locale=ja-JP');
    });

    it('never navigates a sub-frame, in either direction', () => {
        const replace = vi.fn();
        vi.stubGlobal('unsafeWindow', window);
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/embed/abc123',
            hostname: 'www.youtube.com',
            protocol: 'https:',
            replace,
        });
        const framed = { ...window, top: {} as Window } as unknown as Window & typeof globalThis;
        vi.spyOn(window, 'top', 'get').mockReturnValue(framed.top);

        applyPreferredJapaneseSiteLanguage(true);
        expect(replace).not.toHaveBeenCalled();

        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/embed/abc123?hl=ja&gl=JP',
            hostname: 'www.youtube.com',
            protocol: 'https:',
            replace,
        });
        applyPreferredJapaneseSiteLanguage(false, true);

        expect(replace).not.toHaveBeenCalled();
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

    it('does not run a delayed enabled page injection after the preference is disabled', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('unsafeWindow', { document: {} });
        vi.stubGlobal('location', {
            href: 'https://example.com/',
            hostname: 'example.com',
            protocol: 'https:',
            replace: vi.fn(),
        });
        const head = document.head;
        const documentElement = document.documentElement;
        const headGetter = vi.spyOn(document, 'head', 'get')
            .mockReturnValue(null as unknown as HTMLHeadElement);
        const documentElementGetter = vi.spyOn(document, 'documentElement', 'get')
            .mockReturnValue(null as unknown as HTMLElement);

        applyPreferredJapaneseSiteLanguage(true);
        applyPreferredJapaneseSiteLanguage(false);

        headGetter.mockRestore();
        documentElementGetter.mockRestore();
        const appendedScripts: string[] = [];
        const appendSpy = vi.spyOn(head, 'append').mockImplementation((...nodes: Array<Node | string>) => {
            for (const node of nodes) {
                if (node instanceof HTMLScriptElement) appendedScripts.push(node.textContent ?? '');
            }
        });
        expect(document.documentElement).toBe(documentElement);

        await vi.runAllTimersAsync();

        expect(appendedScripts.join('\n')).not.toContain('applyJapanesePreferencesInPage(globalThis, true)');
        expect(appendedScripts.join('\n')).toContain('applyJapanesePreferencesInPage(globalThis, false)');
        appendSpy.mockRestore();
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
        expect(appendedScripts.join('\n')).toContain('const JA_LOCALE = "ja-JP";');
        expect(appendedScripts.join('\n')).toContain('applyJapanesePreferencesInPage(globalThis, true)');
        expect(appendedScripts.join('\n')).not.toContain('installFetchAcceptLanguage');
        expect(appendedScripts.join('\n')).not.toContain('isSameOriginRequestUrl');
        appendSpy.mockRestore();
    });

    it('skips inline page injection in WebExtension content scripts (MV3 CSP refuses it)', () => {
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

        // The isolated content-script world has no page-realm access and the
        // extension CSP refuses any inline <script>; injecting one only logs a
        // "Refused to execute inline script" error. No script must be appended.
        expect(navigator.language).toBe(language);
        expect(appendedScripts).toHaveLength(0);
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
        // Cross-realm userscript context (unsafeWindow is a distinct realm, no
        // extension runtime): the reader falls back to injecting a page shim and
        // must clone the Trusted Types policy options before creating the policy.
        vi.stubGlobal('cloneInto', cloneInto);
        vi.stubGlobal('trustedTypes', { createPolicy });
        vi.stubGlobal('unsafeWindow', { document: {} });
        vi.stubGlobal('GM_getValue', vi.fn());

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
