import {
    PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
    SETTINGS_STORAGE_KEYS,
} from '../settings/index';
import { normalizeLearningTargetChosen } from '../settings/learning-target-choice';
import {
    ensureManagedWebStorageCurrent,
    ensureManagedWebStorageCurrentSync,
    gmStorageGet,
    gmStorageGetShared,
    gmStorageGetSharedSync,
    isHostedYomuOrigin,
    managedLocalStorage,
    managedSessionStorage,
} from './storage';
import { pageCompartmentDescriptorOrNull, pageCompartmentValue } from '../platform/window-events';
import type { ReaderSettings } from './types';
import { targetLanguageOf } from '../languages/selection';
import { languageFamilyIncludes } from '../settings/language-gating';
import { isRecord } from '../core/object-utils';
import { SETTINGS_INTENT_LEDGER_STORAGE_KEY } from '../settings/intent-ledger';
import { committedSettingsStoragePair } from '../settings/settings-persistence-transaction';

const JA_LANG = 'ja';
const JA_COUNTRY = 'JP';
const JA_LOCALE = 'ja-JP';
const PREFERENCE_CACHE_KEY = 'yomu:prefer-japanese-site-language';
const REDIRECT_CACHE_KEY = 'yomu:jps';
// Hosts already auto-redirected to their Japanese URL in this tab session — used
// to redirect at most once per host so SPA URL rewrites cannot cause a loop.
const REDIRECT_HOSTS_KEY = 'yomu:jps:hosts';
const INJECTION_RETRY_LIMIT = 12;
const ALTERNATE_REDIRECT_RETRY_LIMIT = 80;
const ALTERNATE_REDIRECT_RETRY_MS = 125;
const EN_LOCALE_RE = /^en(?:[-_][a-z]{2})?$/i;
const JA_PARAMS: Record<string, string> = { hl: JA_LANG, gl: JA_COUNTRY };
const JA_NEWS: Record<string, string> = { hl: JA_LANG, gl: JA_COUNTRY, ceid: 'JP:ja' };
// Every query key applyParams / JA_PARAMS / JA_NEWS / the site rules can leave a
// Japanese marker in, and the marker values worth removing on the way back out.
const JA_MARKER_PARAM_KEYS = [
    'hl', 'gl', 'ceid', 'locale', 'ui_locale', 'mkt', 'market',
    'lang', 'language', 'lng', 'region', 'country', 'cc',
];
const JA_MARKER_VALUE_RE = /^(?:ja(?:[-_]jp)?|jp(?::ja)?)$/i;
const JA_PATH_SEGMENT_RE = /^ja(?:[-_]jp)?$/i;
const LOCAL_DEVELOPMENT_HOSTS = new Set(['0.0.0.0', '[::]', '[::1]']);
const LOCALHOST_NAME_RE = /(?:^|\.)localhost$/u;
const IPV4_LOOPBACK_HOST_RE = /^127(?:\.\d{1,3}){3}$/u;
const IPV4_MAPPED_LOOPBACK_HOST_RE = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/u;

type StoredSettings = Partial<ReaderSettings> | null;
interface StoredPreference {
    enabled: boolean;
    targetLanguage: string;
}
interface CanonicalStoredSettings {
    readonly settings: StoredSettings | undefined;
    readonly blocksLegacy: boolean;
}
type QueryRoot = Pick<ParentNode, 'querySelectorAll'> & Partial<Pick<Document, 'readyState'>>;

let alternateRedirectCleanup: (() => void) | undefined;
let preferenceRevision = 0;
let currentPreferenceEnabled = false;
let deferredCookieResponseReload = false;

export async function installPreferredJapaneseSiteLanguageFromStoredSettings(): Promise<void> {
    // Capture intent before an async epoch barrier: a later settings action
    // must supersede this whole install, not just its eventual storage read.
    const revision = ++preferenceRevision;
    if (!ensureManagedWebStorageCurrentSync()) await ensureManagedWebStorageCurrent();
    installPreferredJapaneseSiteLanguageAfterStorageBarrier(revision);
}

function installPreferredJapaneseSiteLanguageAfterStorageBarrier(revision: number): void {
    if (revision !== preferenceRevision) return;
    const syncPreference = readStoredPreferenceSync();
    if (syncPreference) {
        applyPreferredJapaneseSiteLanguageAtRevision(
            syncPreference.enabled,
            false,
            revision,
            false,
            syncPreference.targetLanguage,
        );
        return;
    }
    // The shared setting is behind async-only storage here. This origin's cache
    // only records what the last visit to THIS site resolved to, and a toggle on
    // any other site cannot reach it. Do not expose a cached "on" through
    // navigator/Intl while storage resolves: sites snapshot those values during
    // startup and cannot be repaired after the authoritative opt-out arrives.
    void readStoredPreferenceAsync().then(preference => {
        if (revision !== preferenceRevision) return;
        if (!preference) return;
        applyPreferredJapaneseSiteLanguageAtRevision(
            preference.enabled,
            false,
            revision,
            false,
            preference.targetLanguage,
        );
    });
}

export function applyPreferredJapaneseSiteLanguage(
    enabled: boolean,
    revertOnDisable = false,
    deferCookieResponseReloadUntilPersisted = false,
    targetLanguage = 'ja',
): void {
    // Settings UI calls occur after boot, but direct companion consumers can
    // still arrive first when a synchronous userscript backend is available.
    try { ensureManagedWebStorageCurrentSync(); } catch { /* fail closed in the cache facade */ }
    applyPreferredJapaneseSiteLanguageAtRevision(
        enabled,
        revertOnDisable,
        ++preferenceRevision,
        deferCookieResponseReloadUntilPersisted,
        targetLanguage,
    );
}

function applyPreferredJapaneseSiteLanguageAtRevision(
    enabled: boolean,
    revertOnDisable: boolean,
    revision: number,
    deferCookieResponseReloadUntilPersisted = false,
    targetLanguage = 'ja',
): void {
    if (!canApplyPreferenceRevision(revision)) return;
    const effectiveEnabled = japaneseSitePreferenceEnabled(enabled, targetLanguage);
    // A default-off value is not evidence that Yomu ever changed this site.
    // Leave native locale cookies and the page realm completely untouched
    // unless this realm is turning an active preference off, the UI requested
    // rollback, or this origin still carries Yomu's earlier enabled cache.
    if (shouldIgnoreInactivePreference(effectiveEnabled, revertOnDisable)) {
        cancelPreferredJapaneseSiteRedirectWatcher();
        forgetSessionRedirectState();
        return;
    }
    // A stored opt-out does not prove this realm caused the current URL. Only
    // an active on -> off transition or the settings UI's explicit rollback may
    // navigate away; a stale per-origin cache must remain reconciliation-only.
    const shouldRevert = shouldRevertSitePreference(effectiveEnabled, revertOnDisable);
    currentPreferenceEnabled = effectiveEnabled;
    writeCachedPreferenceEnabled(effectiveEnabled);
    applyPageContextJapanesePreferences(effectiveEnabled, revision);
    if (effectiveEnabled) {
        enablePreferredJapaneseSiteLanguage(revision);
        return;
    }
    disablePreferredJapaneseSiteLanguage(shouldRevert, deferCookieResponseReloadUntilPersisted);
}

function canApplyPreferenceRevision(revision: number): boolean {
    return typeof window !== 'undefined' && revision === preferenceRevision;
}

function japaneseSitePreferenceEnabled(enabled: boolean, targetLanguage: string): boolean {
    return enabled && languageFamilyIncludes('jp-only', targetLanguage);
}

function shouldRevertSitePreference(effectiveEnabled: boolean, revertOnDisable: boolean): boolean {
    if (effectiveEnabled) return false;
    return currentPreferenceEnabled || revertOnDisable;
}

function shouldIgnoreInactivePreference(effectiveEnabled: boolean, revertOnDisable: boolean): boolean {
    if (effectiveEnabled) return false;
    return !hasJapaneseSitePreferenceProvenance(revertOnDisable);
}

function hasJapaneseSitePreferenceProvenance(revertOnDisable: boolean): boolean {
    if (currentPreferenceEnabled) return true;
    if (revertOnDisable) return true;
    if (readCachedPreferenceEnabled() === true) return true;
    return deferredCookieResponseReload;
}

function enablePreferredJapaneseSiteLanguage(revision: number): void {
    deferredCookieResponseReload = false;
    applySitePreferenceCookies();
    schedulePreferredJapaneseSiteRedirect(revision);
}

function disablePreferredJapaneseSiteLanguage(
    shouldRevert: boolean,
    deferCookieResponseReloadUntilPersisted: boolean,
): void {
    const clearedSiteCookie = clearSitePreferenceCookies();
    const shouldReloadCookieShapedResponse = clearedSiteCookie || deferredCookieResponseReload;
    deferredCookieResponseReload = deferCookieResponseReloadUntilPersisted
        ? shouldReloadCookieShapedResponse
        : false;
    cancelPreferredJapaneseSiteRedirectWatcher();
    // Disabling also retires this tab's loop-suppression provenance. A cold
    // authoritative opt-out must not navigate, but a later explicit opt-in in
    // the same tab still needs permission to redirect the host once.
    finishDisabledSiteNavigation(shouldRevert, shouldReloadCookieShapedResponse);
}

function finishDisabledSiteNavigation(shouldRevert: boolean, shouldReloadCookieShapedResponse: boolean): void {
    if (!shouldRevert) {
        forgetSessionRedirectState();
        return;
    }
    // A deliberate opt-out also has to undo the navigation the preference caused;
    // leaving the site on its Japanese URL reads as the toggle having done nothing.
    if (attemptPreferredDefaultSiteRedirect()) return;
    if (!shouldReloadCookieShapedResponse) return;
    // The Japanese preference cookie shaped the response before document-start
    // could remove it. The false cache makes this a one-shot reload.
    reloadCurrentLocation();
}

export function preferredJapaneseSiteUrl(sourceHref: string, root?: QueryRoot): string | null {
    const current = parseHttpUrl(sourceHref);
    if (!current || isLocalDevelopmentUrl(current)) return null;
    const alternate = japaneseAlternateLinkUrl(current, root);
    const target = alternate ?? siteRuleJapaneseUrl(current) ?? genericUrl(current, root);
    if (target) applyParams(target);
    if (!target || target.href === current.href) return null;
    return target.href;
}

// The way back out: the URL the user should be on once they stop preferring
// Japanese. Site rules add markers that were never in the original URL (reddit's
// ?locale=ja-JP) and rewrite ones that were (hl=en -> hl=ja), and neither is
// recoverable from the URL alone, so removing every Japanese marker we know how
// to add is the honest inverse: the site then serves its own default again.
function preferredDefaultSiteUrl(sourceHref: string, root?: QueryRoot): string | null {
    const current = parseHttpUrl(sourceHref);
    if (!current || isLocalDevelopmentUrl(current)) return null;
    const target = defaultAlternateLinkUrl(current, root) ?? withoutJapaneseMarkers(current);
    if (!target || target.href === current.href) return null;
    return target.href;
}

// The shared settings store is the only cross-site record of the preference, so
// it always outranks the per-origin cache below. Reading the cache first used to
// pin every site the user had ever opened while the preference was on to "on":
// turning it off elsewhere could not reach them, and each load rewrote the cache
// from itself, so the toggle had to be pressed again on every site, forever.
function readStoredPreferenceSync(): StoredPreference | undefined {
    const preferredLanguage = gmStorageGetSharedSync<unknown>(
        PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
        undefined,
    );
    return syncSitePreference(preferredLanguage, readStoredSettingsSync());
}

function readStoredSettingsSync(): StoredSettings | undefined {
    const storedCanonical = gmStorageGetSharedSync<unknown>(SETTINGS_STORAGE_KEYS[0], undefined);
    const canonical = canonicalStoredSettings(
        storedCanonical,
        gmStorageGetSharedSync<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, undefined),
    );
    return canonical.blocksLegacy ? canonical.settings : readLegacyStoredSettingsSync();
}

function readLegacyStoredSettingsSync(): StoredSettings | undefined {
    for (const key of SETTINGS_STORAGE_KEYS.slice(1)) {
        const stored = gmStorageGetSharedSync<unknown>(key, undefined);
        if (isRecord(stored)) return stored as Partial<ReaderSettings>;
    }
    return undefined;
}

function syncSitePreference(
    preferredLanguage: unknown,
    storedSettings: StoredSettings | undefined,
): StoredPreference | undefined {
    // "Off" is safe before the target is known. "On" is not: a dedicated
    // scalar can resolve synchronously while the profile-bearing settings blob
    // is still behind an async bridge, and assuming Japanese in that gap would
    // recreate the document-start race this gate exists to prevent.
    if (preferredLanguage === true && !storedSettings) return undefined;
    return sitePreference(preferredLanguage, storedSettings);
}

async function readStoredPreferenceAsync(): Promise<StoredPreference | undefined> {
    const preferredLanguage = await readPreferenceStorageValue<unknown>(
        PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
        undefined,
    );
    const storedSettings = await readStoredSettingsAsync();
    return sitePreference(preferredLanguage, storedSettings, cachedPreferenceFallback());
}

async function readStoredSettingsAsync(): Promise<StoredSettings | undefined> {
    const storedCanonical = await readPreferenceStorageValue<unknown>(SETTINGS_STORAGE_KEYS[0], undefined);
    const canonical = canonicalStoredSettings(
        storedCanonical,
        await readPreferenceStorageValue<unknown>(SETTINGS_INTENT_LEDGER_STORAGE_KEY, undefined),
    );
    return canonical.blocksLegacy ? canonical.settings : readLegacyStoredSettingsAsync();
}

function canonicalStoredSettings(
    storedCanonical: unknown,
    storedIntentLedger: unknown,
): CanonicalStoredSettings {
    const settings = committedSettingsStoragePair(storedCanonical, storedIntentLedger)?.settings;
    return isRecord(settings)
        ? { settings: settings as Partial<ReaderSettings>, blocksLegacy: true }
        : { settings: undefined, blocksLegacy: storedCanonical != null };
}

async function readLegacyStoredSettingsAsync(): Promise<StoredSettings | undefined> {
    for (const key of SETTINGS_STORAGE_KEYS.slice(1)) {
        const stored = await readPreferenceStorageValue<unknown>(key, undefined);
        if (!isRecord(stored)) continue;
        return stored as Partial<ReaderSettings>;
    }
    return undefined;
}

function readPreferenceStorageValue<T>(key: string, fallback: T): Promise<T> {
    return isHostedYomuOrigin()
        ? gmStorageGet(key, fallback)
        : gmStorageGetShared(key, fallback);
}

// No stored settings at all is a genuinely fresh install. Only a cache written
// by an earlier Yomu visit is provenance worth reconciling.
function cachedPreferenceFallback(): boolean | undefined {
    const cached = readCachedPreferenceEnabled();
    return cached === false ? false : undefined;
}

function sitePreference(
    dedicated: unknown,
    settings: StoredSettings | undefined,
    fallback?: boolean,
): StoredPreference | undefined {
    const enabled = storedSitePreferenceEnabled(dedicated, settings, fallback);
    if (typeof enabled !== 'boolean') return undefined;
    if (enabled === true && !storedSettingsChooseLearningTarget(settings)) return undefined;
    return { enabled, targetLanguage: targetLanguageOf(settings) };
}

function storedSitePreferenceEnabled(
    dedicated: unknown,
    settings: StoredSettings | undefined,
    fallback: boolean | undefined,
): boolean | undefined {
    if (typeof dedicated === 'boolean') return dedicated;
    if (typeof settings?.preferJapaneseSiteLanguage === 'boolean') {
        return settings.preferJapaneseSiteLanguage;
    }
    return fallback;
}

function storedSettingsChooseLearningTarget(settings: StoredSettings | undefined): boolean {
    return normalizeLearningTargetChosen(settings ?? null);
}

function readCachedPreferenceEnabled(): boolean | undefined {
    try {
        const value = managedLocalStorage.getItem(PREFERENCE_CACHE_KEY);
        if (value === 'true') return true;
        if (value === 'false') return false;
    } catch {
        return undefined;
    }
}

function writeCachedPreferenceEnabled(enabled: boolean): void {
    try {
        managedLocalStorage.setItem(PREFERENCE_CACHE_KEY, String(enabled));
    } catch {
        // Best effort; the canonical setting is still stored with the rest of Yomu settings.
    }
}

function applyPageContextJapanesePreferences(enabled: boolean, revision: number): void {
    const pageWindow = sameRealmUnsafeWindow();
    if (pageWindow) {
        try {
            applyJapanesePreferencesInPage(pageWindow as unknown as typeof globalThis, enabled);
            return;
        } catch {
            // Fall back to a script element below.
        }
    }
    // In the MV3 browser extension the content script runs in the isolated world
    // with no page-realm access, and the extension CSP refuses any inline <script>
    // we append to the page. Skip the injection entirely (it would only log a
    // "Refused to execute inline script" error); the cookie + redirect paths in
    // applyPreferredJapaneseSiteLanguage remain the working mechanism there.
    if (hasExtensionRuntime()) return;
    injectPagePreferenceScript(enabled, revision);
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

function injectPagePreferenceScript(enabled: boolean, revision: number, attempt = 0): void {
    if (!preferenceIsCurrent(enabled, revision)) return;
    const parent = document.head || document.documentElement;
    if (!parent) {
        if (attempt < INJECTION_RETRY_LIMIT) {
            window.setTimeout(() => injectPagePreferenceScript(enabled, revision, attempt + 1), 0);
        }
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
        if (attempt < INJECTION_RETRY_LIMIT) {
            window.setTimeout(() => injectPagePreferenceScript(enabled, revision, attempt + 1), 0);
        }
    }
}

function preferenceIsCurrent(enabled: boolean, revision: number): boolean {
    return revision === preferenceRevision && currentPreferenceEnabled === enabled;
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
        `const JA_LOCALE = ${JSON.stringify(JA_LOCALE)};`,
        `const defineUntrackedValue = ${defineUntrackedValue.toString()};`,
        `const preferenceState = ${preferenceState.toString()};`,
        `const rememberDescriptor = ${rememberDescriptor.toString()};`,
        `const crossRealmDescriptor = ${crossRealmDescriptor.toString()};`,
        `const defineGetter = ${defineGetter.toString()};`,
        `const defineValue = ${defineValue.toString()};`,
        `const restoreJapanesePreferences = ${restoreJapanesePreferences.toString()};`,
        `const wrapIntlConstructor = ${wrapIntlConstructor.toString()};`,
        `const installIntlDefaults = ${installIntlDefaults.toString()};`,
        `const applyJapanesePreferencesInPage = ${applyJapanesePreferencesInPage.toString()};`,
        `applyJapanesePreferencesInPage(globalThis, ${JSON.stringify(enabled)});`,
        '})();',
    ].join('\n');
}

function applySitePreferenceCookies(): void {
    const hostname = currentLocationHostname();
    if (/(^|\.)youtube\.com$/.test(hostname)) {
        // Older builds wrote a Tokyo timezone into PREF. Remove that legacy
        // marker before keeping the narrower language and region preference.
        clearCookieValues('PREF', ['tz'], '.youtube.com');
        mergeCookie('PREF', {
            hl: JA_LANG,
            gl: JA_COUNTRY,
        }, '.youtube.com');
    }
    if (/(^|\.)google\./.test(hostname)) {
        mergeCookie('PREF', {
            hl: JA_LANG,
            gl: JA_COUNTRY,
        });
    }
}

function clearSitePreferenceCookies(): boolean {
    const hostname = currentLocationHostname();
    let changed = false;
    if (/(^|\.)youtube\.com$/.test(hostname)) changed = clearCookieValues('PREF', ['hl', 'gl', 'tz'], '.youtube.com') || changed;
    if (/(^|\.)google\./.test(hostname)) changed = clearCookieValues('PREF', ['hl', 'gl']) || changed;
    return changed;
}

function currentLocationHostname(): string {
    return typeof location.hostname === 'string' ? location.hostname.toLowerCase() : '';
}

// The script matches every URL in every frame, so without this an embedded
// player, comment widget or sign-in frame gets navigated to its Japanese URL on
// its own — the page's own frame, replaced under it, which is exactly the "sites
// behaved oddly" shape. Locale hints and cookies still apply in sub-frames; only
// the navigation is reserved for the tab the user is actually looking at.
function isTopLevelFrame(): boolean {
    try {
        return window.top === window;
    } catch {
        // A cross-origin parent throws on access, which itself means we are framed.
        return false;
    }
}

function schedulePreferredJapaneseSiteRedirect(revision: number): void {
    if (!preferenceIsCurrent(true, revision)) return;
    if (!isTopLevelFrame()) return;
    // Redirect at most ONCE per host per tab session. SPA sites (notably
    // m.youtube.com) rewrite their URL on every in-app navigation without keeping
    // hl=ja, so the alternate-redirect watcher would keep computing a "more
    // Japanese" URL and full-reloading back to it forever ("A problem repeatedly
    // occurred on https://m.youtube.com/?ra=m&hl=ja&gl=JP"). The language cookie
    // set on the first redirect keeps the site Japanese afterward, so any further
    // URL redirect is both redundant and the source of the loop.
    if (hostAlreadyRedirectedThisSession()) return;
    if (attemptPreferredJapaneseSiteRedirect(revision)) return;
    installAlternateRedirectWatcher(revision);
}

function attemptPreferredJapaneseSiteRedirect(revision: number): boolean {
    if (!preferenceIsCurrent(true, revision)) return false;
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
        const raw = managedSessionStorage.getItem(REDIRECT_HOSTS_KEY);
        return raw ? (JSON.parse(raw) as string[]).includes(host) : false;
    } catch {
        return false;
    }
}

function markHostRedirectedThisSession(): void {
    const host = currentLocationHost();
    if (!host) return;
    try {
        const raw = managedSessionStorage.getItem(REDIRECT_HOSTS_KEY);
        const hosts = raw ? (JSON.parse(raw) as string[]) : [];
        if (!hosts.includes(host)) {
            hosts.push(host);
            managedSessionStorage.setItem(REDIRECT_HOSTS_KEY, JSON.stringify(hosts));
        }
    } catch {
        // Loop suppression is best-effort; failure should not block the redirect.
    }
}

function attemptPreferredDefaultSiteRedirect(): boolean {
    if (!isTopLevelFrame()) return false;
    const href = currentLocationHref();
    // The remembered source is exact, so it wins; it only exists when this tab
    // performed the redirect and has not navigated since, which is the minority
    // of opt-outs. Otherwise undo the Japanese markers the preference adds.
    const target = href ? (rememberedRedirectSourceForTarget(href) ?? preferredDefaultSiteUrl(href, document)) : null;
    // Resolve the exact remembered source first: clearing the session record
    // before this point would turn an original hl=en&gl=GB URL into a guessed
    // marker-free URL instead of restoring what the learner actually opened.
    forgetSessionRedirectState();
    if (!target || target === href) return false;
    replaceLocation(target);
    return true;
}

function forgetSessionRedirectState(): void {
    try {
        managedSessionStorage.removeItem(REDIRECT_CACHE_KEY);
        const host = currentLocationHost();
        const raw = host ? managedSessionStorage.getItem(REDIRECT_HOSTS_KEY) : null;
        if (!raw) return;
        const hosts = (JSON.parse(raw) as string[]).filter(entry => entry !== host);
        if (hosts.length) managedSessionStorage.setItem(REDIRECT_HOSTS_KEY, JSON.stringify(hosts));
        else managedSessionStorage.removeItem(REDIRECT_HOSTS_KEY);
    } catch {
        // Session bookkeeping only; failing it must never block the opt-out.
    }
}

function currentLocationHref(): string {
    return typeof location.href === 'string' ? location.href : '';
}

function installAlternateRedirectWatcher(revision: number, attempt = 0): void {
    if (!preferenceIsCurrent(true, revision)) return;
    if (alternateRedirectCleanup) return;
    const root = document.documentElement || document.head;
    if (!root) {
        if (attempt < INJECTION_RETRY_LIMIT) {
            window.setTimeout(() => installAlternateRedirectWatcher(revision, attempt + 1), 0);
        }
        return;
    }

    let checks = 0;
    const stop = () => {
        cleanup();
        alternateRedirectCleanup = undefined;
    };
    const check = () => {
        if (!preferenceIsCurrent(true, revision)) {
            stop();
            return;
        }
        checks += 1;
        if (attemptPreferredJapaneseSiteRedirect(revision) || checks >= ALTERNATE_REDIRECT_RETRY_LIMIT) stop();
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

function reloadCurrentLocation(): void {
    const href = currentLocationHref();
    if (href) {
        replaceLocation(href);
        return;
    }
    try {
        location.reload();
    } catch {
        // The cookie and cached setting are already corrected for the next load.
    }
}

function recentlyAttemptedRedirect(sourceHref: string, targetHref: string): boolean {
    try {
        const value = managedSessionStorage.getItem(REDIRECT_CACHE_KEY);
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
        managedSessionStorage.setItem(REDIRECT_CACHE_KEY, JSON.stringify([sourceHref, targetHref, Date.now()]));
    } catch {
        // Redirect suppression is only a loop guard; failure should not block the redirect.
    }
}

function rememberedRedirectSourceForTarget(targetHref: string): string | null {
    try {
        const value = managedSessionStorage.getItem(REDIRECT_CACHE_KEY);
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

function isLocalDevelopmentUrl(url: URL): boolean {
    const hostname = url.hostname.toLowerCase().replace(/\.+$/u, '');
    return [
        LOCAL_DEVELOPMENT_HOSTS.has(hostname),
        LOCALHOST_NAME_RE.test(hostname),
        IPV4_LOOPBACK_HOST_RE.test(hostname),
        IPV4_MAPPED_LOOPBACK_HOST_RE.test(hostname),
    ].some(Boolean);
}

function japaneseAlternateLinkUrl(current: URL, root: QueryRoot | undefined): URL | null {
    return alternateLinkUrl(current, root, /^ja(?:[-_]|$)/i, alts);
}

// x-default is the page's own answer to "which URL for a visitor with no
// Japanese preference", so it beats guessing; a plain English alternate is the
// next best thing when the site does not publish one. Head metadata only: an
// <a hreflang="ja"> is a deliberate "read this in Japanese" affordance, but an
// <a hreflang="en"> is usually just a link to some unrelated English page, and
// following one would drop the reader somewhere they never asked to go.
function defaultAlternateLinkUrl(current: URL, root: QueryRoot | undefined): URL | null {
    return alternateLinkUrl(current, root, /^x-default$/i, metadataAlts)
        ?? alternateLinkUrl(current, root, EN_LOCALE_RE, metadataAlts);
}

function alternateLinkUrl(
    current: URL,
    root: QueryRoot | undefined,
    hreflang: RegExp,
    candidates: (root: QueryRoot) => NodeListOf<HTMLLinkElement | HTMLAnchorElement>,
): URL | null {
    if (!root) return null;
    try {
        for (const element of candidates(root)) {
            if (!hreflang.test(element.getAttribute('hreflang') ?? '')) continue;
            const href = element.getAttribute('href');
            const candidate = href ? parseHttpUrl(new URL(href, current.href).href) : null;
            if (candidate && candidate.href !== current.href) return candidate;
        }
    } catch {
        return null;
    }
    return null;
}

function withoutJapaneseMarkers(current: URL): URL | null {
    const next = new URL(current.href);
    let changed = false;
    for (const key of JA_MARKER_PARAM_KEYS) {
        const value = next.searchParams.get(key);
        if (!value || !JA_MARKER_VALUE_RE.test(value)) continue;
        next.searchParams.delete(key);
        changed = true;
    }
    // Drop a leading /ja/ or /ja-jp/ rather than swapping in a guessed English
    // one: every host we add such a segment to redirects the segment-less path
    // to the visitor's own default, and an invented /en/ can 404.
    const parts = next.pathname.split('/');
    if (JA_PATH_SEGMENT_RE.test(parts[1] ?? '')) {
        parts.splice(1, 1);
        next.pathname = parts.join('/') || '/';
        changed = true;
    }
    return changed ? next : null;
}

function alts(root: QueryRoot): NodeListOf<HTMLLinkElement | HTMLAnchorElement> {
    return root.querySelectorAll<HTMLLinkElement | HTMLAnchorElement>('link[rel~=alternate][hreflang][href],a[hreflang][href]');
}

function metadataAlts(root: QueryRoot): NodeListOf<HTMLLinkElement | HTMLAnchorElement> {
    return root.querySelectorAll<HTMLLinkElement | HTMLAnchorElement>('link[rel~=alternate][hreflang][href]');
}

function siteRuleJapaneseUrl(current: URL): URL | null {
    const hostname = current.hostname.toLowerCase();
    if (hostname === 'youtu.be') return youtuBeJapaneseUrl(current);
    if (/(^|\.)youtube\.com$/.test(hostname)) return withSearchParams(current, JA_PARAMS);
    if (hostname === 'consent.google.com') return googleConsentJapaneseUrl(current);
    if (hostname === 'news.google.com') return withSearchParams(current, JA_NEWS);
    if (isGooglePreferenceHost(hostname)) return withSearchParams(current, JA_PARAMS);
    if (/^(?:reddit|www\.reddit|new\.reddit|sh\.reddit)\.com$/.test(hostname)) return withSearchParams(current, { locale: JA_LOCALE });
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
    if (!videoId) return withSearchParams(current, JA_PARAMS);
    const target = new URL('https://www.youtube.com/watch');
    target.searchParams.set('v', videoId);
    for (const [key, value] of current.searchParams.entries()) {
        if (key !== 'v' && key !== 'hl' && key !== 'gl') target.searchParams.append(key, value);
    }
    for (const [key, value] of Object.entries(JA_PARAMS)) target.searchParams.set(key, value);
    target.hash = current.hash;
    return target;
}

function googleConsentJapaneseUrl(current: URL): URL | null {
    const next = new URL(current.href);
    let changed = false;
    for (const [key, value] of Object.entries(JA_PARAMS)) {
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

function genericUrl(current: URL, root?: QueryRoot): URL | null {
    const next = new URL(current.href);
    let hit = applyParams(next);
    if (!root || (!alts(root).length && root.readyState !== 'loading')) {
        if (/^en\./i.test(next.hostname)) {
            next.hostname = next.hostname.replace(/^en\./i, 'ja.');
            hit = true;
        }
        const parts = next.pathname.split('/');
        const first = (parts[1] ?? '').toLowerCase();
        if (EN_LOCALE_RE.test(first)) {
            parts[1] = /[-_]/.test(first) ? 'ja-jp' : JA_LANG;
            next.pathname = parts.join('/') || '/';
            hit = true;
        }
    } else {
        // Generic `/en` -> `/ja` guesses are deliberately weaker than explicit
        // site rules and `hreflang` links. At document-start the page may not
        // have published its supported locales yet; once it does, the absence of
        // Japanese is evidence that a guessed `/ja` URL is likely invalid.
    }
    return hit ? next : null;
}

function applyParams(next: URL): boolean {
    const p = next.searchParams;
    let hit = false;
    for (const k of ['locale', 'ui_locale', 'mkt', 'market']) hit = sp(p, k, jl(p.get(k))) || hit;
    for (const k of ['lang', 'language', 'lng']) {
        const v = p.get(k);
        hit = sp(p, k, v && /[-_]/.test(v) ? jl(v) : JA_LANG) || hit;
    }
    hit = sp(p, 'hl', JA_LANG) || hit;
    for (const k of ['region', 'country', 'gl', 'cc']) hit = sp(p, k, JA_COUNTRY, /^(?:us|usa|gb|uk)$/i) || hit;
    return hit;
}

function jl(v: string | null): string {
    return v?.includes('_') ? 'ja_JP' : JA_LOCALE;
}

function sp(p: URLSearchParams, k: string, v: string, r = EN_LOCALE_RE): boolean {
    const current = p.get(k);
    if (!current || !r.test(current)) return false;
    p.set(k, v);
    return true;
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

function clearCookieValues(name: string, keys: string[], domain?: string): boolean {
    try {
        const currentValue = cookieValue(name);
        if (!currentValue) return false;
        const params = new URLSearchParams(currentValue);
        for (const key of keys) params.delete(key);
        const nextValue = params.toString();
        if (nextValue === currentValue) return false;
        if (nextValue) writeCookie(name, nextValue, domain, 31536000);
        else writeCookie(name, '', domain, 0);
        return true;
    } catch {
        // Cookie cleanup should never block settings changes.
        return false;
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

    const locale = JA_LOCALE;
    const languages = [locale, 'ja', 'en-US', 'en'];

    const navigatorObject = root.navigator;
    const navigatorPrototype = root.Navigator?.prototype ?? Object.getPrototypeOf(navigatorObject);
    defineGetter(state, navigatorPrototype, 'language', () => locale);
    defineGetter(state, navigatorPrototype, 'languages', () => languages.slice());
    defineGetter(state, navigatorObject, 'language', () => locale);
    defineGetter(state, navigatorObject, 'languages', () => languages.slice());

    installIntlDefaults(root, state, locale);
}

function preferenceState(root: typeof globalThis & { __yomuJapaneseSiteLanguagePreference?: JapanesePreferenceState }): JapanesePreferenceState {
    if (root.__yomuJapaneseSiteLanguagePreference) return root.__yomuJapaneseSiteLanguagePreference;
    const state: JapanesePreferenceState = {
        installed: false,
        properties: [],
    };
    defineUntrackedValue(root, '__yomuJapaneseSiteLanguagePreference', state);
    return state;
}

function restoreJapanesePreferences(state: JapanesePreferenceState): void {
    for (const snapshot of state.properties.slice().reverse()) {
        try {
            if (snapshot.hadOwn && snapshot.descriptor) {
                const descriptor = crossRealmDescriptor(snapshot.descriptor, snapshot.target);
                if (descriptor) Object.defineProperty(snapshot.target, snapshot.key, descriptor);
            } else {
                delete (snapshot.target as Record<PropertyKey, unknown>)[snapshot.key];
            }
        } catch {
            // Some browser host objects are immutable after first definition; leave them as-is.
        }
    }
    state.properties = [];
    state.installed = false;
}

function installIntlDefaults(root: typeof globalThis, state: JapanesePreferenceState, locale: string): void {
    const intl = root.Intl as (typeof Intl & Record<string, unknown>) | undefined;
    if (!intl) return;
    wrapIntlConstructor(intl, state, 'DateTimeFormat', locale);
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

// Returns null when the descriptor cannot enter the page compartment — the
// caller must skip the write; a raw sandbox descriptor makes Firefox log
// "Not allowed to define cross-origin object" even when the throw is caught.
// (Serialized into the page-side script, where pageCompartmentDescriptorOrNull
// is a free undefined name and every descriptor is same-realm.)
function crossRealmDescriptor(descriptor: PropertyDescriptor, _target: object): PropertyDescriptor | null {
    try {
        return typeof pageCompartmentDescriptorOrNull === 'function'
            ? pageCompartmentDescriptorOrNull(descriptor)
            : descriptor;
    } catch {
        return null;
    }
}

function defineGetter(state: JapanesePreferenceState, target: object | null | undefined, key: PropertyKey, getter: () => unknown): void {
    if (!target) return;
    rememberDescriptor(state, target, key);
    try {
        // Firefox Xray: a sandbox getter must be cloned into the page
        // compartment or the define throws "Not allowed to define
        // cross-origin object" and the spoof silently never applies.
        const descriptor = crossRealmDescriptor({
            configurable: true,
            get: getter,
        }, target);
        if (descriptor) Object.defineProperty(target, key, descriptor);
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
        const descriptor = crossRealmDescriptor({
            configurable: true,
            writable: true,
            value,
        }, target);
        // A null descriptor means the value cannot cross into the page
        // compartment; a raw assignment would be denied the same way, so skip.
        if (descriptor) Object.defineProperty(target, key, descriptor);
    } catch {
        try {
            (target as Record<PropertyKey, unknown>)[key] = value;
        } catch {
            // Ignore immutable host objects.
        }
    }
}
