import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEYS } from '../settings/index';
import { gmStorageGet, gmStorageGetSync } from './storage';
import type { ReaderSettings } from './types';

const JAPANESE_LANGUAGE = 'ja';
const JAPANESE_COUNTRY = 'JP';
const JAPANESE_TIME_ZONE = 'Asia/Tokyo';
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const INJECTION_RETRY_LIMIT = 12;

type StoredSettings = Partial<Pick<ReaderSettings, 'preferJapaneseSiteLanguage'>> | null;

export function installPreferredJapaneseSiteLanguageFromStoredSettings(): void {
    const syncPreference = readStoredPreferenceEnabledSync();
    if (typeof syncPreference === 'boolean') {
        applyPreferredJapaneseSiteLanguage(syncPreference);
        return;
    }
    void readStoredPreferenceEnabledAsync().then(applyPreferredJapaneseSiteLanguage);
}

export function applyPreferredJapaneseSiteLanguage(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    writeCachedPreferenceEnabled(enabled);
    applyPageContextJapanesePreferences(enabled);
    if (enabled) applySitePreferenceCookies();
    else clearSitePreferenceCookies();
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
    const pageWindow = (globalThis as { unsafeWindow?: Window }).unsafeWindow;
    return pageWindow && pageWindow === window ? pageWindow : undefined;
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
            policy = factory.createPolicy?.('yomu-reader-script', { createScript: (s: string) => s });
        }
        return policy && typeof policy.createScript === 'function' ? policy.createScript(code) : code;
    } catch {
        return code;
    }
}

function injectedPagePreferenceSource(enabled: boolean): string {
    return [
        ';(() => {',
        `const defineUntrackedValue = ${defineUntrackedValue.toString()};`,
        `const preferenceState = ${preferenceState.toString()};`,
        `const rememberDescriptor = ${rememberDescriptor.toString()};`,
        `const defineGetter = ${defineGetter.toString()};`,
        `const defineValue = ${defineValue.toString()};`,
        `const restoreJapanesePreferences = ${restoreJapanesePreferences.toString()};`,
        `const wrapIntlConstructor = ${wrapIntlConstructor.toString()};`,
        `const installIntlDefaults = ${installIntlDefaults.toString()};`,
        `const installDateTimezoneHint = ${installDateTimezoneHint.toString()};`,
        `const installGeolocationHint = ${installGeolocationHint.toString()};`,
        `const installFetchAcceptLanguage = ${installFetchAcceptLanguage.toString()};`,
        `const installXhrAcceptLanguage = ${installXhrAcceptLanguage.toString()};`,
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

    const locale = 'ja-JP';
    const languages = ['ja-JP', 'ja', 'en-US', 'en'];
    const timeZone = 'Asia/Tokyo';
    const acceptLanguage = 'ja-JP,ja;q=0.9,en-US;q=0.5,en;q=0.3';
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
    installFetchAcceptLanguage(root, state, acceptLanguage);
    installXhrAcceptLanguage(root, state, acceptLanguage);
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
            if (snapshot.hadOwn && snapshot.descriptor) Object.defineProperty(snapshot.target, snapshot.key, snapshot.descriptor);
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

function installFetchAcceptLanguage(root: typeof globalThis, state: JapanesePreferenceState, acceptLanguage: string): void {
    const nativeFetch = root.fetch;
    if (typeof nativeFetch !== 'function' || (nativeFetch as { __yomuWrapped?: boolean }).__yomuWrapped) return;
    const wrappedFetch: typeof fetch = function(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        const nextInit = { ...(init ?? {}) };
        try {
            const inputHeaders = typeof root.Request === 'function' && input instanceof root.Request ? input.headers : undefined;
            const headers = new root.Headers(init?.headers ?? inputHeaders);
            if (!headers.has('Accept-Language')) headers.set('Accept-Language', acceptLanguage);
            nextInit.headers = headers;
        } catch {
            // Keep the original fetch behavior if headers cannot be cloned.
        }
        return nativeFetch.call(this, input, nextInit);
    };
    defineUntrackedValue(wrappedFetch, '__yomuWrapped', true);
    defineValue(state, root, 'fetch', wrappedFetch);
}

function installXhrAcceptLanguage(root: typeof globalThis, state: JapanesePreferenceState, acceptLanguage: string): void {
    const xhrPrototype = root.XMLHttpRequest?.prototype as (XMLHttpRequest & {
        __yomuAcceptLanguageSet?: boolean;
    }) | undefined;
    if (!xhrPrototype) return;
    const nativeOpen = xhrPrototype.open;
    const nativeSend = xhrPrototype.send;
    const nativeSetRequestHeader = xhrPrototype.setRequestHeader;
    defineValue(state, xhrPrototype, 'open', function open(this: typeof xhrPrototype, ...args: Parameters<XMLHttpRequest['open']>) {
        this.__yomuAcceptLanguageSet = false;
        return nativeOpen.apply(this, args);
    });
    defineValue(state, xhrPrototype, 'setRequestHeader', function setRequestHeader(this: typeof xhrPrototype, name: string, value: string) {
        if (name.toLowerCase() === 'accept-language') this.__yomuAcceptLanguageSet = true;
        return nativeSetRequestHeader.call(this, name, value);
    });
    defineValue(state, xhrPrototype, 'send', function send(this: typeof xhrPrototype, ...args: Parameters<XMLHttpRequest['send']>) {
        if (!this.__yomuAcceptLanguageSet) {
            try {
                nativeSetRequestHeader.call(this, 'Accept-Language', acceptLanguage);
            } catch {
                // Some request states disallow setting headers; send normally.
            }
        }
        return nativeSend.apply(this, args);
    });
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

function defineGetter(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey, getter: () => unknown): void {
    if (!target) return;
    rememberDescriptor(state, target, key);
    try {
        Object.defineProperty(target, key, {
            configurable: true,
            get: getter,
        });
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
        Object.defineProperty(target, key, {
            configurable: true,
            writable: true,
            value,
        });
    } catch {
        try {
            (target as Record<PropertyKey, unknown>)[key] = value;
        } catch {
            // Ignore immutable host objects.
        }
    }
}
