import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEYS } from '../settings/index';
import { gmStorageGet, gmStorageGetSync } from './storage';
import { pageCompartmentDescriptor, pageCompartmentValue } from '../platform/window-events';
import type { ReaderSettings } from './types';

const JAPANESE_LANGUAGE = 'ja';
const JAPANESE_COUNTRY = 'JP';
const JAPANESE_TIME_ZONE = 'Asia/Tokyo';
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const INJECTION_RETRY_LIMIT = 12;

type StoredSettings = Partial<Pick<ReaderSettings, 'preferJapaneseSiteLanguage'>> | null;

export function installPreferredJapaneseSiteLanguageFromStoredSettings(): void {
    const sync = readPrefSync();
    if (typeof sync === 'boolean') {
        applyPreferredJapaneseSiteLanguage(sync);
        return;
    }
    void readPrefAsync().then(applyPreferredJapaneseSiteLanguage);
}

export function applyPreferredJapaneseSiteLanguage(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    cachePref(enabled);
    applyPagePrefs(enabled);
    if (enabled) {
        const nextHref = preferredJapaneseSiteUrl(location.href || '');
        if (nextHref) {
            try {
                location.replace(nextHref);
            } catch {
                // URL rewrites are best-effort. Header, navigator, and cookie hints still apply.
            }
        }
        setPrefCookies();
    }
    else clearCookies();
}

export function preferredJapaneseSiteUrl(href: string): string | undefined {
    if (!href) return undefined;
    try {
        const url = new URL(href);
        const before = url.href;
        url.hostname = url.hostname.replace(/^((?:www\.)?)en(?:[-_][a-z0-9]+)*(?=\.)/i, '$1ja');
        url.pathname = url.pathname.replace(/(^|\/)en(?:[-_][a-z0-9]+)*(?:\.[a-z0-9-]+)?(?=\/|$)/gi, '$1ja');
        if (url.hash) url.hash = `#${url.hash.slice(1).replace(/(^|\/)en(?:[-_][a-z0-9]+)*(?:\.[a-z0-9-]+)?(?=\/|$)/gi, '$1ja')}`;
        url.searchParams.forEach((value, key) => {
            const k = key.toLowerCase().replace(/[-_]/g, '');
            if (k === 'lr' && /^lang_en(?:[-_][a-z0-9]+)*$/i.test(value)) {
                url.searchParams.set(key, 'lang_ja');
                return;
            }
            if (/^(?:culture|hl|i18n(?:locale)?|l|lang(?:uage(?:code)?)?|lng|locale(?:code)?|uilang)$/.test(k) && /^en(?:[-_][a-z0-9]+)*(?:\.[a-z0-9-]+)?$/i.test(value)) {
                const locale = /^(?:culture|languagecode|locale(?:code)?)$/.test(k) || /[-_]/.test(value);
                url.searchParams.set(key, locale ? value.includes('_') ? 'ja_JP' : 'ja-JP' : 'ja');
                return;
            }
            if (/^(?:c(?:c|ountry(?:code)?)|g(?:eo|l)|market|region(?:code)?)$/.test(k) && /^(?:en|us|gb|uk)$/i.test(value)) {
                url.searchParams.set(key, JAPANESE_COUNTRY);
            }
        });
        return url.href === before ? undefined : url.href;
    } catch {
        return undefined;
    }
}

function readPrefSync(): boolean | undefined {
    const cached = cachedPref();
    if (typeof cached === 'boolean') return cached;
    for (const key of SETTINGS_STORAGE_KEYS) {
        const stored = gmStorageGetSync<StoredSettings | undefined>(key, undefined);
        if (stored && typeof stored === 'object' && typeof stored.preferJapaneseSiteLanguage === 'boolean') {
            return stored.preferJapaneseSiteLanguage;
        }
    }
    return undefined;
}

async function readPrefAsync(): Promise<boolean> {
    const cached = cachedPref();
    if (typeof cached === 'boolean') return cached;
    for (const key of SETTINGS_STORAGE_KEYS) {
        const stored = await gmStorageGet<StoredSettings | undefined>(key, undefined);
        if (stored && typeof stored === 'object' && typeof stored.preferJapaneseSiteLanguage === 'boolean') {
            return stored.preferJapaneseSiteLanguage;
        }
    }
    return DEFAULT_SETTINGS.preferJapaneseSiteLanguage;
}

function cachedPref(): boolean | undefined {
    try {
        const value = localStorage.getItem(PREFERENCE_CACHE_KEY);
        if (value === 'true' || value === 'false') return value === 'true';
        const parsed = value == null ? undefined : JSON.parse(value);
        return typeof parsed === 'boolean' ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function cachePref(enabled: boolean): void {
    try {
        localStorage.setItem(PREFERENCE_CACHE_KEY, String(enabled));
    } catch {
        // Best effort; the canonical setting is still stored with the rest of Yomu settings.
    }
}

function applyPagePrefs(enabled: boolean): void {
    const pageWindow = sameWindow();
    if (pageWindow) {
        try {
            applyJapanesePreferencesInPage(pageWindow as unknown as typeof globalThis, enabled);
            return;
        } catch {
            // Fall back to a script element below.
        }
    }
    injectPrefs(enabled);
}

function sameWindow(): Window | undefined {
    if (hasRuntime()) return undefined;
    const pageWindow = (globalThis as { unsafeWindow?: Window }).unsafeWindow;
    return pageWindow && pageWindow === window ? pageWindow : undefined;
}

function hasRuntime(): boolean {
    const root = globalThis as {
        browser?: { runtime?: { id?: string } };
        chrome?: { runtime?: { id?: string } };
    };
    return Boolean(root.browser?.runtime?.id || root.chrome?.runtime?.id);
}

function injectPrefs(enabled: boolean, attempt = 0): void {
    const parent = document.head || document.documentElement;
    if (!parent) {
        if (attempt < INJECTION_RETRY_LIMIT) window.setTimeout(() => injectPrefs(enabled, attempt + 1), 0);
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
        const source = scriptSource(enabled);
        const trusted = trustScript(source);
        if (trusted && typeof trusted === 'object') {
            (script as any).textContent = trusted;
        } else {
            script.textContent = source;
        }
        parent.append(script);
        script.remove();
    } catch {
        if (attempt < INJECTION_RETRY_LIMIT) window.setTimeout(() => injectPrefs(enabled, attempt + 1), 0);
    }
}

function trustScript(code: string): any {
    try {
        const root = globalThis as any;
        const factory = root.trustedTypes
            || (typeof window !== 'undefined' ? (window as any).trustedTypes : undefined)
            || root.unsafeWindow?.trustedTypes;
        if (!factory) return code;

        let policy = factory.getPolicy?.('yomu-reader-script');
        if (!policy) {
            const options = { createScript: (s: string) => s };
            policy = trustPolicy(factory, pageCompartmentValue(options, { cloneFunctions: true, wrapReflectors: true }))
                ?? trustPolicy(factory, options);
        }
        return policy && typeof policy.createScript === 'function' ? policy.createScript(code) : code;
    } catch {
        return code;
    }
}

function trustPolicy(
    factory: { createPolicy?: (name: string, options: { createScript: (value: string) => string }) => { createScript?: (value: string) => unknown } | undefined },
    options: { createScript: (value: string) => string },
): { createScript?: (value: string) => unknown } | undefined {
    try {
        return factory.createPolicy?.('yomu-reader-script', options);
    } catch {
        return undefined;
    }
}

function scriptSource(enabled: boolean): string {
    return [
        ';(() => {',
        `const def = ${def.toString()};`,
        `const stateFor = ${stateFor.toString()};`,
        `const rem = ${rem.toString()};`,
        `const crossRealmDescriptor = ${crossRealmDescriptor.toString()};`,
        `const defG = ${defG.toString()};`,
        `const defV = ${defV.toString()};`,
        `const restore = ${restore.toString()};`,
        `const wrap = ${wrap.toString()};`,
        `const intlPrefs = ${intlPrefs.toString()};`,
        `const tzHint = ${tzHint.toString()};`,
        `const geoHint = ${geoHint.toString()};`,
        `const fetchPref = ${fetchPref.toString()};`,
        `const xhrPref = ${xhrPref.toString()};`,
        `const applyJapanesePreferencesInPage = ${applyJapanesePreferencesInPage.toString()};`,
        `applyJapanesePreferencesInPage(globalThis, ${JSON.stringify(enabled)});`,
        '})();',
    ].join('\n');
}

function setPrefCookies(): void {
    const hostname = locHost();
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

function clearCookies(): void {
    const hostname = locHost();
    if (/(^|\.)youtube\.com$/.test(hostname)) clearCookieValues('PREF', ['hl', 'gl', 'tz'], '.youtube.com');
    if (/(^|\.)google\./.test(hostname)) clearCookieValues('PREF', ['hl', 'gl']);
}

function locHost(): string {
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
    const state = stateFor(root);
    if (!enabled) {
        restore(state);
        return;
    }
    if (state.installed) return;
    state.installed = true;

    const locale = 'ja-JP';
    const languages = ['ja-JP', 'ja', 'en-US', 'en'];
    const timeZone = 'Asia/Tokyo';
    const acceptLang = 'ja-JP,ja;q=0.9,en-US;q=0.5,en;q=0.3';
    const tokyo = { latitude: 35.681236, longitude: 139.767125, accuracy: 25 };

    const nav = root.navigator;
    const navProto = root.Navigator?.prototype ?? Object.getPrototypeOf(nav);
    defG(state, navProto, 'language', () => locale);
    defG(state, navProto, 'languages', () => languages.slice());
    defG(state, navProto, 'userLanguage', () => locale);
    defG(state, navProto, 'browserLanguage', () => locale);
    defG(state, nav, 'language', () => locale);
    defG(state, nav, 'languages', () => languages.slice());

    intlPrefs(root, state, locale, timeZone);
    tzHint(root, state, timeZone);
    geoHint(root, state, nav, navProto, tokyo);
    fetchPref(root, state, acceptLang);
    xhrPref(root, state, acceptLang);
}

function stateFor(root: typeof globalThis & { __yomuJapaneseSiteLanguagePreference?: JapanesePreferenceState }): JapanesePreferenceState {
    if (root.__yomuJapaneseSiteLanguagePreference) return root.__yomuJapaneseSiteLanguagePreference;
    const state: JapanesePreferenceState = {
        installed: false,
        properties: [],
        watchTimers: new Map(),
        nextWatchId: 1,
    };
    def(root, '__yomuJapaneseSiteLanguagePreference', state);
    return state;
}

function restore(state: JapanesePreferenceState): void {
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

function intlPrefs(root: typeof globalThis, state: JapanesePreferenceState, locale: string, timeZone: string): void {
    const intl = root.Intl as (typeof Intl & Record<string, unknown>) | undefined;
    if (!intl) return;
    wrap(intl, state, 'DateTimeFormat', locale, options => ({ ...options, timeZone: options?.timeZone ?? timeZone }));
    wrap(intl, state, 'NumberFormat', locale);
    wrap(intl, state, 'Collator', locale);
    wrap(intl, state, 'RelativeTimeFormat', locale);
    wrap(intl, state, 'PluralRules', locale);
    wrap(intl, state, 'ListFormat', locale);
    wrap(intl, state, 'Segmenter', locale);
}

function wrap(
    intl: typeof Intl & Record<string, unknown>,
    state: JapanesePreferenceState,
    name: string,
    locale: string,
    normOptions: (options: Record<string, unknown> | undefined) => Record<string, unknown> | undefined = options => options,
): void {
    const Native = intl[name];
    if (typeof Native !== 'function' || (Native as { __yomuWrapped?: boolean }).__yomuWrapped) return;
    const Wrapped = function(this: unknown, locales?: string | string[], options?: Record<string, unknown>) {
        const locs = locales === undefined ? locale : locales;
        const opts = normOptions(options);
        return Reflect.construct(Native, [locs, opts], new.target || Native);
    };
    def(Wrapped, '__yomuWrapped', true);
    try {
        Object.setPrototypeOf(Wrapped, Native);
        Wrapped.prototype = Native.prototype;
    } catch {
        // Constructor wrapping still works without mirroring every static property.
    }
    defV(state, intl, name, Wrapped);
}

function tzHint(root: typeof globalThis, state: JapanesePreferenceState, timeZone: string): void {
    const datePrototype = root.Date?.prototype;
    if (!datePrototype) return;
    defV(state, datePrototype, 'getTimezoneOffset', function getTimezoneOffset() {
        return timeZone === 'Asia/Tokyo' ? -540 : 0;
    });
}

function geoHint(
    root: typeof globalThis,
    state: JapanesePreferenceState,
    nav: Navigator,
    navProto: object | null,
    coords: { latitude: number; longitude: number; accuracy: number },
): void {
    if (!nav) return;
    const nativeGeo = nav.geolocation;
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
    const geolocation = Object.create(nativeGeo ?? null) as Geolocation;
    def(geolocation, 'getCurrentPosition', (success: PositionCallback) => {
        root.setTimeout(() => success(position() as GeolocationPosition), 0);
    });
    def(geolocation, 'watchPosition', (success: PositionCallback) => {
        const id = state.nextWatchId++;
        const emit = () => success(position() as GeolocationPosition);
        const timer = root.setInterval(emit, 60000);
        state.watchTimers.set(id, timer);
        root.setTimeout(emit, 0);
        return id;
    });
    def(geolocation, 'clearWatch', (id: number) => {
        const timer = state.watchTimers.get(id);
        if (timer !== undefined) root.clearInterval(timer);
        state.watchTimers.delete(id);
    });
    defG(state, navProto, 'geolocation', () => geolocation);
    defG(state, nav, 'geolocation', () => geolocation);
}

function fetchPref(root: typeof globalThis, state: JapanesePreferenceState, acceptLang: string): void {
    const nativeFetch = root.fetch;
    if (typeof nativeFetch !== 'function' || (nativeFetch as { __yomuWrapped?: boolean }).__yomuWrapped) return;
    const wrappedFetch: typeof fetch = function(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        const nextInit = { ...(init ?? {}) };
        try {
            const inputHeaders = typeof root.Request === 'function' && input instanceof root.Request ? input.headers : undefined;
            const headers = new root.Headers(init?.headers ?? inputHeaders);
            if (!headers.has('Accept-Language')) headers.set('Accept-Language', acceptLang);
            nextInit.headers = headers;
        } catch {
            // Keep the original fetch behavior if headers cannot be cloned.
        }
        return nativeFetch.call(this, input, nextInit);
    };
    def(wrappedFetch, '__yomuWrapped', true);
    defV(state, root, 'fetch', wrappedFetch);
}

function xhrPref(root: typeof globalThis, state: JapanesePreferenceState, acceptLang: string): void {
    const xhrPrototype = root.XMLHttpRequest?.prototype as (XMLHttpRequest & {
        __yomuAcceptLanguageSet?: boolean;
    }) | undefined;
    if (!xhrPrototype) return;
    const nativeOpen = xhrPrototype.open;
    const nativeSend = xhrPrototype.send;
    const nativeSetRequestHeader = xhrPrototype.setRequestHeader;
    defV(state, xhrPrototype, 'open', function open(this: typeof xhrPrototype, ...args: Parameters<XMLHttpRequest['open']>) {
        this.__yomuAcceptLanguageSet = false;
        return nativeOpen.apply(this, args);
    });
    defV(state, xhrPrototype, 'setRequestHeader', function setRequestHeader(this: typeof xhrPrototype, name: string, value: string) {
        if (name.toLowerCase() === 'accept-language') this.__yomuAcceptLanguageSet = true;
        return nativeSetRequestHeader.call(this, name, value);
    });
    defV(state, xhrPrototype, 'send', function send(this: typeof xhrPrototype, ...args: Parameters<XMLHttpRequest['send']>) {
        if (!this.__yomuAcceptLanguageSet) {
            try {
                nativeSetRequestHeader.call(this, 'Accept-Language', acceptLang);
            } catch {
                // Some request states disallow setting headers; send normally.
            }
        }
        return nativeSend.apply(this, args);
    });
}

function rem(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey): void {
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

function defG(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey, getter: () => unknown): void {
    if (!target) return;
    rem(state, target, key);
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

function defV(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey, value: unknown): void {
    if (!target) return;
    rem(state, target, key);
    def(target, key, value);
}

function def(target: object | null | undefined, key: PropertyKey, value: unknown): void {
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
