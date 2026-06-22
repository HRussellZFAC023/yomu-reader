import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEYS } from '../settings/index';
import { gmStorageGet, gmStorageGetSync } from './storage';
import { pageCompartmentDescriptor, pageCompartmentValue } from '../platform/window-events';
import type { ReaderSettings } from './types';

const JAPANESE_LANGUAGE = 'ja';
const JAPANESE_COUNTRY = 'JP';
const JAPANESE_TIME_ZONE = 'Asia/Tokyo';
const JAPANESE_LOCALE = 'ja-JP';
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const REDIRECT_CACHE_KEY = 'yomu:jps';
// Hosts already auto-redirected to their Japanese URL in this tab session — used
// to redirect at most once per host so SPA URL rewrites cannot cause a loop.
const REDIRECT_HOSTS_KEY = 'yomu:jps:hosts';
const INJECTION_RETRY_LIMIT = 12;
const ALTERNATE_REDIRECT_RETRY_LIMIT = 80;
const ALTERNATE_REDIRECT_RETRY_MS = 125;
const ENGLISH_LOCALE_SEGMENT_RE = /^en(?:[-_][a-z]{2})?$/i;
const JAPANESE_SEARCH_PARAMS: Record<string, string> = { hl: 'ja', gl: 'JP' };
const JAPANESE_NEWS_SEARCH_PARAMS: Record<string, string> = { hl: 'ja', gl: 'JP', ceid: 'JP:ja' };

type StoredSettings = Partial<Pick<ReaderSettings, 'preferJapaneseSiteLanguage'>> | null;
type QueryRoot = Pick<ParentNode, 'querySelectorAll'>;

let alternateRedirectCleanup: (() => void) | undefined;

export function installPreferredJapaneseSiteLanguageFromStoredSettings(): void {
    const syncPreference = readStoredPreferenceEnabledSync();
    if (typeof syncPreference === 'boolean') {
        applyPreferredJapaneseSiteLanguage(syncPreference);
        return;
    }
    void readStoredPreferenceEnabledAsync().then(applyPreferredJapaneseSiteLanguage);
}

export function applyPreferredJapaneseSiteLanguage(enabled: boolean, revertOnDisable = false): void {
    if (typeof window === 'undefined') return;
    writeCachedPreferenceEnabled(enabled);
    applyPageContextJapanesePreferences(enabled);
    if (enabled) {
        applySitePreferenceCookies();
        schedulePreferredJapaneseSiteRedirect();
    } else {
        clearSitePreferenceCookies();
        cancelPreferredJapaneseSiteRedirectWatcher();
        if (revertOnDisable) attemptPreferredDefaultSiteRedirect();
    }
}

export function preferredJapaneseSiteUrl(sourceHref: string, root?: QueryRoot): string | null {
    const current = parseHttpUrl(sourceHref);
    if (!current) return null;
    const alternate = japaneseAlternateLinkUrl(current, root);
    const target = alternate ?? siteRuleJapaneseUrl(current) ?? genericJapaneseUrl(current);
    if (!target || target.href === current.href) return null;
    return target.href;
}

function readStoredPreferenceEnabledSync(): boolean | undefined {
    const cached = readCachedPreferenceEnabled();
    if (typeof cached === 'boolean') return cached;
    for (const key of SETTINGS_STORAGE_KEYS) {
        const stored = gmStorageGetSync<StoredSettings | undefined>(key, undefined);
        if (stored && typeof stored === 'object' && typeof stored.preferJapaneseSiteLanguage === 'boolean') {
            return stored.preferJapaneseSiteLanguage;
        }
    }
    return undefined;
}

async function readStoredPreferenceEnabledAsync(): Promise<boolean> {
    const cached = readCachedPreferenceEnabled();
    if (typeof cached === 'boolean') return cached;
    for (const key of SETTINGS_STORAGE_KEYS) {
        const stored = await gmStorageGet<StoredSettings | undefined>(key, undefined);
        if (stored && typeof stored === 'object' && typeof stored.preferJapaneseSiteLanguage === 'boolean') {
            return stored.preferJapaneseSiteLanguage;
        }
    }
    return DEFAULT_SETTINGS.preferJapaneseSiteLanguage;
}

function readCachedPreferenceEnabled(): boolean | undefined {
    try {
        const value = localStorage.getItem(PREFERENCE_CACHE_KEY);
        if (value === 'true' || value === 'false') return value === 'true';
        const parsed = value == null ? undefined : JSON.parse(value);
        return typeof parsed === 'boolean' ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function writeCachedPreferenceEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(PREFERENCE_CACHE_KEY, String(enabled));
    } catch {
        // Best effort; the canonical setting is still stored with the rest of Yomu settings.
    }
}

function applyPageContextJapanesePreferences(enabled: boolean): void {
    const pageWindow = sameRealmUnsafeWindow();
    if (pageWindow) {
        try {
            applyJapanesePreferencesInPage(pageWindow as unknown as typeof globalThis, enabled);
            return;
        } catch {
            // Fall back to a script element below.
        }
    }
    injectPagePreferenceScript(enabled);
}

function sameRealmUnsafeWindow(): Window | undefined {
    if (hasExtensionRuntime()) return undefined;
    const pageWindow = (globalThis as { unsafeWindow?: Window }).unsafeWindow;
    return pageWindow && pageWindow === window ? pageWindow : undefined;
}

function hasExtensionRuntime(): boolean {
    const root = globalThis as {
        browser?: { runtime?: { id?: string } };
        chrome?: { runtime?: { id?: string } };
    };
    return Boolean(root.browser?.runtime?.id || root.chrome?.runtime?.id);
}

function injectPagePreferenceScript(enabled: boolean, attempt = 0): void {
    const parent = document.head || document.documentElement;
    if (!parent) {
        if (attempt < INJECTION_RETRY_LIMIT) window.setTimeout(() => injectPagePreferenceScript(enabled, attempt + 1), 0);
        return;
    }
    try {
        const script = document.createElement('script');
        const nonce = Array.from(document.querySelectorAll('script[nonce]'))
            .map(el => el.getAttribute('nonce'))
            .find(Boolean);
        if (nonce) {
            script.setAttribute('nonce', nonce);
        }
        const source = injectedPagePreferenceSource(enabled);
        const trusted = createTrustedScript(source);
        if (trusted && typeof trusted === 'object') {
            (script as any).textContent = trusted;
        } else {
            script.textContent = source;
        }
        parent.append(script);
        script.remove();
    } catch {
        if (attempt < INJECTION_RETRY_LIMIT) window.setTimeout(() => injectPagePreferenceScript(enabled, attempt + 1), 0);
    }
}

function createTrustedScript(code: string): any {
    try {
        const root = globalThis as any;
        const factory = root.trustedTypes
            || (typeof window !== 'undefined' ? (window as any).trustedTypes : undefined)
            || root.unsafeWindow?.trustedTypes;
        if (!factory) return code;

        let policy = factory.getPolicy?.('yomu-reader-script');
        if (!policy) {
            const options = { createScript: (s: string) => s };
            policy = createTrustedScriptPolicy(factory, pageCompartmentValue(options, { cloneFunctions: true, wrapReflectors: true }))
                ?? createTrustedScriptPolicy(factory, options);
        }
        return policy && typeof policy.createScript === 'function' ? policy.createScript(code) : code;
    } catch {
        return code;
    }
}

function createTrustedScriptPolicy(
    factory: { createPolicy?: (name: string, options: { createScript: (value: string) => string }) => { createScript?: (value: string) => unknown } | undefined },
    options: { createScript: (value: string) => string },
): { createScript?: (value: string) => unknown } | undefined {
    try {
        return factory.createPolicy?.('yomu-reader-script', options);
    } catch {
        return undefined;
    }
}

function injectedPagePreferenceSource(enabled: boolean): string {
    return [
        ';(() => {',
        `const JAPANESE_LOCALE = ${JSON.stringify(JAPANESE_LOCALE)};`,
        `const defineUntrackedValue = ${defineUntrackedValue.toString()};`,
        `const preferenceState = ${preferenceState.toString()};`,
        `const rememberDescriptor = ${rememberDescriptor.toString()};`,
        `const crossRealmDescriptor = ${crossRealmDescriptor.toString()};`,
        `const defineGetter = ${defineGetter.toString()};`,
        `const defineValue = ${defineValue.toString()};`,
        `const restoreJapanesePreferences = ${restoreJapanesePreferences.toString()};`,
        `const wrapIntlConstructor = ${wrapIntlConstructor.toString()};`,
        `const installIntlDefaults = ${installIntlDefaults.toString()};`,
        `const installDateTimezoneHint = ${installDateTimezoneHint.toString()};`,
        `const installGeolocationHint = ${installGeolocationHint.toString()};`,
        `const applyJapanesePreferencesInPage = ${applyJapanesePreferencesInPage.toString()};`,
        `applyJapanesePreferencesInPage(globalThis, ${JSON.stringify(enabled)});`,
        '})();',
    ].join('\n');
}

function applySitePreferenceCookies(): void {
    const hostname = currentLocationHostname();
    if (/(^|\.)youtube\.com$/.test(hostname)) {
        mergeCookie('PREF', {
            hl: JAPANESE_LANGUAGE,
            gl: JAPANESE_COUNTRY,
            tz: JAPANESE_TIME_ZONE,
        }, '.youtube.com');
    }
    if (/(^|\.)google\./.test(hostname)) {
        mergeCookie('PREF', {
            hl: JAPANESE_LANGUAGE,
            gl: JAPANESE_COUNTRY,
        });
    }
}

function clearSitePreferenceCookies(): void {
    const hostname = currentLocationHostname();
    if (/(^|\.)youtube\.com$/.test(hostname)) clearCookieValues('PREF', ['hl', 'gl', 'tz'], '.youtube.com');
    if (/(^|\.)google\./.test(hostname)) clearCookieValues('PREF', ['hl', 'gl']);
}

function currentLocationHostname(): string {
    return typeof location.hostname === 'string' ? location.hostname.toLowerCase() : '';
}

function schedulePreferredJapaneseSiteRedirect(): void {
    // Redirect at most ONCE per host per tab session. SPA sites (notably
    // m.youtube.com) rewrite their URL on every in-app navigation without keeping
    // hl=ja, so the alternate-redirect watcher would keep computing a "more
    // Japanese" URL and full-reloading back to it forever ("A problem repeatedly
    // occurred on https://m.youtube.com/?ra=m&hl=ja&gl=JP"). The language cookie
    // set on the first redirect keeps the site Japanese afterward, so any further
    // URL redirect is both redundant and the source of the loop.
    if (hostAlreadyRedirectedThisSession()) return;
    if (attemptPreferredJapaneseSiteRedirect()) return;
    installAlternateRedirectWatcher();
}

function attemptPreferredJapaneseSiteRedirect(): boolean {
    const href = currentLocationHref();
    const target = href ? preferredJapaneseSiteUrl(href, document) : null;
    if (!target || hostAlreadyRedirectedThisSession() || recentlyAttemptedRedirect(href, target)) return false;
    rememberRedirectAttempt(href, target);
    markHostRedirectedThisSession();
    replaceLocation(target);
    return true;
}

function currentLocationHost(): string {
    try {
        return new URL(currentLocationHref()).host;
    } catch {
        return '';
    }
}

function hostAlreadyRedirectedThisSession(): boolean {
    const host = currentLocationHost();
    if (!host) return false;
    try {
        const raw = sessionStorage.getItem(REDIRECT_HOSTS_KEY);
        return raw ? (JSON.parse(raw) as string[]).includes(host) : false;
    } catch {
        return false;
    }
}

function markHostRedirectedThisSession(): void {
    const host = currentLocationHost();
    if (!host) return;
    try {
        const raw = sessionStorage.getItem(REDIRECT_HOSTS_KEY);
        const hosts = raw ? (JSON.parse(raw) as string[]) : [];
        if (!hosts.includes(host)) {
            hosts.push(host);
            sessionStorage.setItem(REDIRECT_HOSTS_KEY, JSON.stringify(hosts));
        }
    } catch {
        // Loop suppression is best-effort; failure should not block the redirect.
    }
}

function attemptPreferredDefaultSiteRedirect(): boolean {
    const href = currentLocationHref();
    const target = href ? rememberedRedirectSourceForTarget(href) : null;
    if (!target) return false;
    replaceLocation(target);
    return true;
}

function currentLocationHref(): string {
    return typeof location.href === 'string' ? location.href : '';
}

function installAlternateRedirectWatcher(attempt = 0): void {
    if (alternateRedirectCleanup) return;
    const root = document.documentElement || document.head;
    if (!root) {
        if (attempt < INJECTION_RETRY_LIMIT) window.setTimeout(() => installAlternateRedirectWatcher(attempt + 1), 0);
        return;
    }

    let checks = 0;
    const stop = () => {
        cleanup();
        alternateRedirectCleanup = undefined;
    };
    const check = () => {
        checks += 1;
        if (attemptPreferredJapaneseSiteRedirect() || checks >= ALTERNATE_REDIRECT_RETRY_LIMIT) stop();
    };
    const observer = new MutationObserver(check);
    const timer = window.setInterval(check, ALTERNATE_REDIRECT_RETRY_MS);
    const cleanup = () => {
        observer.disconnect();
        window.clearInterval(timer);
    };
    alternateRedirectCleanup = stop;
    observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['href', 'hreflang', 'rel'],
    });
}

function cancelPreferredJapaneseSiteRedirectWatcher(): void {
    alternateRedirectCleanup?.();
    alternateRedirectCleanup = undefined;
}

function replaceLocation(href: string): void {
    try {
        if (typeof location.replace === 'function') {
            location.replace(href);
            return;
        }
    } catch {
        // Fall through to assignment.
    }
    try {
        location.href = href;
    } catch {
        // If a browser blocks the navigation, keep the locale/cookie shims active.
    }
}

function recentlyAttemptedRedirect(sourceHref: string, targetHref: string): boolean {
    try {
        const value = sessionStorage.getItem(REDIRECT_CACHE_KEY);
        if (!value) return false;
        const [source, target, at] = JSON.parse(value) as [string?, string?, number?];
        return source === sourceHref
            && target === targetHref
            && Date.now() - (at ?? 0) < 60_000;
    } catch {
        return false;
    }
}

function rememberRedirectAttempt(sourceHref: string, targetHref: string): void {
    try {
        sessionStorage.setItem(REDIRECT_CACHE_KEY, JSON.stringify([sourceHref, targetHref, Date.now()]));
    } catch {
        // Redirect suppression is only a loop guard; failure should not block the redirect.
    }
}

function rememberedRedirectSourceForTarget(targetHref: string): string | null {
    try {
        const value = sessionStorage.getItem(REDIRECT_CACHE_KEY);
        if (!value) return null;
        const [source, target] = JSON.parse(value) as [string?, string?];
        if (target !== targetHref || !source) return null;
        return source;
    } catch {
        return null;
    }
}

function parseHttpUrl(sourceHref: string): URL | null {
    try {
        const url = new URL(sourceHref);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
}

function japaneseAlternateLinkUrl(current: URL, root: QueryRoot | undefined): URL | null {
    if (!root) return null;
    try {
        for (const element of Array.from(root.querySelectorAll<HTMLLinkElement | HTMLAnchorElement>('link[rel~="alternate"][hreflang][href],a[hreflang][href]'))) {
            const hreflang = element.getAttribute('hreflang')?.toLowerCase().replace(/_/g, '-');
            if (hreflang !== JAPANESE_LANGUAGE && hreflang !== JAPANESE_LOCALE.toLowerCase()) continue;
            const href = element.getAttribute('href');
            const candidate = href ? parseHttpUrl(new URL(href, current.href).href) : null;
            if (candidate && candidate.href !== current.href) return candidate;
        }
    } catch {
        return null;
    }
    return null;
}

function siteRuleJapaneseUrl(current: URL): URL | null {
    const hostname = current.hostname.toLowerCase();
    if (hostname === 'youtu.be') return youtuBeJapaneseUrl(current);
    if (/(^|\.)youtube\.com$/.test(hostname)) return withSearchParams(current, JAPANESE_SEARCH_PARAMS);
    if (hostname === 'consent.google.com') return googleConsentJapaneseUrl(current);
    if (hostname === 'news.google.com') return withSearchParams(current, JAPANESE_NEWS_SEARCH_PARAMS);
    if (isGooglePreferenceHost(hostname)) return withSearchParams(current, JAPANESE_SEARCH_PARAMS);
    if (hostname === 'wikipedia.org') return withHostname(current, 'ja.wikipedia.org');
    if (hostname.endsWith('.wikipedia.org') && hostname !== 'ja.wikipedia.org' && (current.pathname === '' || current.pathname === '/')) {
        return withHostname(current, 'ja.wikipedia.org');
    }
    if (hostname === 'developer.mozilla.org') return withLeadingLocaleSegment(current, 'ja');
    if (hostname === 'docs.github.com') return withLeadingLocaleSegment(current, 'ja');
    if (hostname === 'learn.microsoft.com' || hostname === 'support.microsoft.com') return withLeadingLocaleSegment(current, 'ja-jp');
    if (hostname === 'support.apple.com') return withLeadingLocaleSegment(current, 'ja-jp');
    return null;
}

function youtuBeJapaneseUrl(current: URL): URL | null {
    const videoId = current.pathname.split('/').filter(Boolean)[0];
    if (!videoId) return withSearchParams(current, JAPANESE_SEARCH_PARAMS);
    const target = new URL('https://www.youtube.com/watch');
    target.searchParams.set('v', videoId);
    for (const [key, value] of current.searchParams.entries()) {
        if (key !== 'v' && key !== 'hl' && key !== 'gl') target.searchParams.append(key, value);
    }
    for (const [key, value] of Object.entries(JAPANESE_SEARCH_PARAMS)) target.searchParams.set(key, value);
    target.hash = current.hash;
    return target;
}

function googleConsentJapaneseUrl(current: URL): URL | null {
    const next = new URL(current.href);
    let changed = false;
    for (const [key, value] of Object.entries(JAPANESE_SEARCH_PARAMS)) {
        if (next.searchParams.get(key) !== value) {
            next.searchParams.set(key, value);
            changed = true;
        }
    }
    const continueHref = current.searchParams.get('continue');
    const japaneseContinueHref = continueHref ? preferredJapaneseSiteUrl(continueHref) : null;
    if (japaneseContinueHref && japaneseContinueHref !== continueHref) {
        next.searchParams.set('continue', japaneseContinueHref);
        changed = true;
    }
    return changed ? next : null;
}

function isGooglePreferenceHost(hostname: string): boolean {
    return hostname === 'google.com'
        || hostname.startsWith('www.google.')
        || hostname === 'support.google.com'
        || hostname === 'cloud.google.com';
}

function withSearchParams(current: URL, values: Record<string, string>): URL | null {
    const next = new URL(current.href);
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
        if (next.searchParams.get(key) === value) continue;
        next.searchParams.set(key, value);
        changed = true;
    }
    return changed ? next : null;
}

function withHostname(current: URL, hostname: string): URL | null {
    if (current.hostname.toLowerCase() === hostname) return null;
    const next = new URL(current.href);
    next.hostname = hostname;
    return next;
}

function withLeadingLocaleSegment(current: URL, locale: string): URL | null {
    const parts = current.pathname.split('/');
    const first = (parts[1] ?? '').toLowerCase();
    if (!/^[a-z]{2}(?:[-_][a-z]{2})?$/.test(first) || first === locale.toLowerCase()) return null;
    const next = new URL(current.href);
    parts[1] = locale;
    next.pathname = parts.join('/') || '/';
    return next;
}

function genericJapaneseUrl(current: URL): URL | null {
    const next = new URL(current.href);
    let changed = false;
    if (/^en\./i.test(next.hostname)) {
        next.hostname = next.hostname.replace(/^en\./i, 'ja.');
        changed = true;
    }
    const pathParts = next.pathname.split('/');
    const firstPathPart = (pathParts[1] ?? '').toLowerCase();
    if (ENGLISH_LOCALE_SEGMENT_RE.test(firstPathPart)) {
        pathParts[1] = /[-_]/.test(firstPathPart) ? 'ja-jp' : JAPANESE_LANGUAGE;
        next.pathname = pathParts.join('/') || '/';
        changed = true;
    }
    return changed ? next : null;
}

function mergeCookie(name: string, values: Record<string, string>, domain?: string): void {
    try {
        const params = new URLSearchParams(cookieValue(name));
        for (const [key, value] of Object.entries(values)) params.set(key, value);
        writeCookie(name, params.toString(), domain, 31536000);
    } catch {
        // Preference cookies are opportunistic; the page-context shim still carries the generic behavior.
    }
}

function clearCookieValues(name: string, keys: string[], domain?: string): void {
    try {
        const currentValue = cookieValue(name);
        if (!currentValue) return;
        const params = new URLSearchParams(currentValue);
        for (const key of keys) params.delete(key);
        const nextValue = params.toString();
        if (nextValue) writeCookie(name, nextValue, domain, 31536000);
        else writeCookie(name, '', domain, 0);
    } catch {
        // Cookie cleanup should never block settings changes.
    }
}

function writeCookie(name: string, value: string, domain: string | undefined, maxAge: number): void {
    const domainPart = domain ? `; Domain=${domain}` : '';
    const securePart = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${securePart}${domainPart}`;
}

function cookieValue(name: string): string {
    const prefix = `${name}=`;
    return document.cookie
        .split(/;\s*/)
        .find(cookie => cookie.startsWith(prefix))
        ?.slice(prefix.length) ?? '';
}

interface PropertySnapshot {
    target: object;
    key: PropertyKey;
    hadOwn: boolean;
    descriptor?: PropertyDescriptor;
}

interface JapanesePreferenceState {
    installed: boolean;
    properties: PropertySnapshot[];
    watchTimers: Map<number, ReturnType<typeof setInterval>>;
    nextWatchId: number;
}

function applyJapanesePreferencesInPage(scope: typeof globalThis, enabled: boolean): void {
    const root = scope as typeof globalThis & {
        __yomuJapaneseSiteLanguagePreference?: JapanesePreferenceState;
        Navigator?: typeof Navigator;
    };
    const state = preferenceState(root);
    if (!enabled) {
        restoreJapanesePreferences(state);
        return;
    }
    if (state.installed) return;
    state.installed = true;

    const locale = JAPANESE_LOCALE;
    const languages = ['ja-JP', 'ja', 'en-US', 'en'];
    const timeZone = 'Asia/Tokyo';
    const tokyo = { latitude: 35.681236, longitude: 139.767125, accuracy: 25 };

    const navigatorObject = root.navigator;
    const navigatorPrototype = root.Navigator?.prototype ?? Object.getPrototypeOf(navigatorObject);
    defineGetter(state, navigatorPrototype, 'language', () => locale);
    defineGetter(state, navigatorPrototype, 'languages', () => languages.slice());
    defineGetter(state, navigatorPrototype, 'userLanguage', () => locale);
    defineGetter(state, navigatorPrototype, 'browserLanguage', () => locale);
    defineGetter(state, navigatorObject, 'language', () => locale);
    defineGetter(state, navigatorObject, 'languages', () => languages.slice());

    installIntlDefaults(root, state, locale, timeZone);
    installDateTimezoneHint(root, state, timeZone);
    installGeolocationHint(root, state, navigatorObject, navigatorPrototype, tokyo);
}

function preferenceState(root: typeof globalThis & { __yomuJapaneseSiteLanguagePreference?: JapanesePreferenceState }): JapanesePreferenceState {
    if (root.__yomuJapaneseSiteLanguagePreference) return root.__yomuJapaneseSiteLanguagePreference;
    const state: JapanesePreferenceState = {
        installed: false,
        properties: [],
        watchTimers: new Map(),
        nextWatchId: 1,
    };
    defineUntrackedValue(root, '__yomuJapaneseSiteLanguagePreference', state);
    return state;
}

function restoreJapanesePreferences(state: JapanesePreferenceState): void {
    for (const timer of state.watchTimers.values()) clearInterval(timer);
    state.watchTimers.clear();
    for (const snapshot of state.properties.slice().reverse()) {
        try {
            if (snapshot.hadOwn && snapshot.descriptor) Object.defineProperty(snapshot.target, snapshot.key, crossRealmDescriptor(snapshot.descriptor, snapshot.target));
            else delete (snapshot.target as Record<PropertyKey, unknown>)[snapshot.key];
        } catch {
            // Some browser host objects are immutable after first definition; leave them as-is.
        }
    }
    state.properties = [];
    state.installed = false;
}

function installIntlDefaults(root: typeof globalThis, state: JapanesePreferenceState, locale: string, timeZone: string): void {
    const intl = root.Intl as (typeof Intl & Record<string, unknown>) | undefined;
    if (!intl) return;
    wrapIntlConstructor(intl, state, 'DateTimeFormat', locale, options => ({ ...options, timeZone: options?.timeZone ?? timeZone }));
    wrapIntlConstructor(intl, state, 'NumberFormat', locale);
    wrapIntlConstructor(intl, state, 'Collator', locale);
    wrapIntlConstructor(intl, state, 'RelativeTimeFormat', locale);
    wrapIntlConstructor(intl, state, 'PluralRules', locale);
    wrapIntlConstructor(intl, state, 'ListFormat', locale);
    wrapIntlConstructor(intl, state, 'Segmenter', locale);
}

function wrapIntlConstructor(
    intl: typeof Intl & Record<string, unknown>,
    state: JapanesePreferenceState,
    name: string,
    locale: string,
    normalizeOptions: (options: Record<string, unknown> | undefined) => Record<string, unknown> | undefined = options => options,
): void {
    const NativeConstructor = intl[name];
    if (typeof NativeConstructor !== 'function' || (NativeConstructor as { __yomuWrapped?: boolean }).__yomuWrapped) return;
    const WrappedConstructor = function(this: unknown, locales?: string | string[], options?: Record<string, unknown>) {
        const nextLocales = locales === undefined ? locale : locales;
        const nextOptions = normalizeOptions(options);
        return Reflect.construct(NativeConstructor, [nextLocales, nextOptions], new.target || NativeConstructor);
    };
    defineUntrackedValue(WrappedConstructor, '__yomuWrapped', true);
    try {
        Object.setPrototypeOf(WrappedConstructor, NativeConstructor);
        WrappedConstructor.prototype = NativeConstructor.prototype;
    } catch {
        // Constructor wrapping still works without mirroring every static property.
    }
    defineValue(state, intl, name, WrappedConstructor);
}

function installDateTimezoneHint(root: typeof globalThis, state: JapanesePreferenceState, timeZone: string): void {
    const datePrototype = root.Date?.prototype;
    if (!datePrototype) return;
    defineValue(state, datePrototype, 'getTimezoneOffset', function getTimezoneOffset() {
        return timeZone === 'Asia/Tokyo' ? -540 : 0;
    });
}

function installGeolocationHint(
    root: typeof globalThis,
    state: JapanesePreferenceState,
    navigatorObject: Navigator,
    navigatorPrototype: object | null,
    coords: { latitude: number; longitude: number; accuracy: number },
): void {
    if (!navigatorObject) return;
    const nativeGeolocation = navigatorObject.geolocation;
    const position = () => ({
        coords: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
        },
        timestamp: Date.now(),
    });
    const geolocation = Object.create(nativeGeolocation ?? null) as Geolocation;
    defineUntrackedValue(geolocation, 'getCurrentPosition', (success: PositionCallback) => {
        root.setTimeout(() => success(position() as GeolocationPosition), 0);
    });
    defineUntrackedValue(geolocation, 'watchPosition', (success: PositionCallback) => {
        const id = state.nextWatchId++;
        const emit = () => success(position() as GeolocationPosition);
        const timer = root.setInterval(emit, 60000);
        state.watchTimers.set(id, timer);
        root.setTimeout(emit, 0);
        return id;
    });
    defineUntrackedValue(geolocation, 'clearWatch', (id: number) => {
        const timer = state.watchTimers.get(id);
        if (timer !== undefined) root.clearInterval(timer);
        state.watchTimers.delete(id);
    });
    defineGetter(state, navigatorPrototype, 'geolocation', () => geolocation);
    defineGetter(state, navigatorObject, 'geolocation', () => geolocation);
}

function rememberDescriptor(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey): void {
    if (!target || state.properties.some(snapshot => snapshot.target === target && snapshot.key === key)) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    state.properties.push({
        target,
        key,
        hadOwn: Boolean(descriptor),
        descriptor,
    });
}

function crossRealmDescriptor(descriptor: PropertyDescriptor, target: object): PropertyDescriptor {
    try {
        return typeof pageCompartmentDescriptor === 'function'
            ? pageCompartmentDescriptor(descriptor, target)
            : descriptor;
    } catch {
        return descriptor;
    }
}

function defineGetter(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey, getter: () => unknown): void {
    if (!target) return;
    rememberDescriptor(state, target, key);
    try {
        // Firefox Xray: a sandbox getter must be cloned into the page
        // compartment or the define throws "Not allowed to define
        // cross-origin object" and the spoof silently never applies.
        Object.defineProperty(target, key, crossRealmDescriptor({
            configurable: true,
            get: getter,
        }, target));
    } catch {
        // Browser-defined properties may be non-configurable in some engines.
    }
}

function defineValue(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey, value: unknown): void {
    if (!target) return;
    rememberDescriptor(state, target, key);
    defineUntrackedValue(target, key, value);
}

function defineUntrackedValue(target: object | null | undefined, key: PropertyKey, value: unknown): void {
    if (!target) return;
    try {
        Object.defineProperty(target, key, crossRealmDescriptor({
            configurable: true,
            writable: true,
            value,
        }, target));
    } catch {
        try {
            (target as Record<PropertyKey, unknown>)[key] = value;
        } catch {
            // Ignore immutable host objects.
        }
    }
}
