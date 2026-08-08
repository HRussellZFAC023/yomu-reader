import DefaultTheme from 'vitepress/theme-without-fonts';
import { useData, type Theme } from 'vitepress';
import { defineComponent, h, onMounted, provide, type Ref } from 'vue';
import pkg from '../../../package.json' with { type: 'json' };
import {
    hostedAccentColorFromValue,
    hostedAccentCssVariables,
    sanitizeHostedAccentColor,
} from '../../../src/reader/core/hosted-accent-css';
import {
    rememberSupportBannerDismissal,
    shouldShowSupportBannerImpression,
} from '../../../src/reader/app/support-banner-policy';
import { shouldInstallHostedReaderRuntime } from '../../../src/reader/app/runtime-presence';
import { gmStorageGet, gmStorageSet } from '../../../src/reader/app/storage';
import { HOSTED_DEMO_VIDEO_SETTINGS_PATCH } from '../../../src/reader/app/hosted-demo-settings';
import { cleanupHostedDocsAnnotations } from './chrome-annotation-cleanup';
import { syncHostedAcademyAccountControls } from './academy-account';
import { hostedOverflowLinks } from '../shared/nav';
import {
    localizedWebsiteHref,
    websiteLocaleForPathname,
    websiteNavigationLabel,
    websiteMessage,
} from '../locales/site-locales';
import { installMembershipPopover } from './membership-popover';
import './custom.css';

type InterfaceLanguage = 'en' | 'ja';
type HostedThemePreference = 'auto' | 'dark' | 'light';
type HostedInterfaceLanguagePreference = InterfaceLanguage | 'auto';
interface HostedHeroStudyLanguage {
    id: string;
    locale: string;
    englishName: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}
declare const __YOMU_HERO_LANGUAGES__: readonly HostedHeroStudyLanguage[];
type HostedSettingsChangeDetail = { preview?: unknown; settings?: Record<string, unknown> };
type HostedYomuRuntimeWindow = typeof window & {
    __yomuDevRuntime?: boolean;
    __yomuReaderAppInitialized?: boolean;
};

const SETTINGS_STORAGE_KEY = 'jpdb-popup-reader-settings';
const VITEPRESS_APPEARANCE_KEY = 'vitepress-theme-appearance';
const SETTINGS_CHANGE_EVENT = 'yomu-settings-change';
const OPEN_SETTINGS_EVENT = 'yomu-open-settings';
const YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-runtime';
const YOMU_HOSTED_SETTINGS_COMPANION_SCRIPT_ID = 'yomu-hosted-settings-companion';
const YOMU_HOSTED_VIDEO_COMPANION_SCRIPT_ID = 'yomu-hosted-video-companion';
const YOMU_HOSTED_OCR_MANGA_COMPANION_SCRIPT_ID = 'yomu-hosted-ocr-manga-companion';
const YOMU_HOSTED_UI_COPY_COMPANION_SCRIPT_ID = 'yomu-hosted-ui-copy-companion';
const YOMU_HOSTED_KANJI_STUDY_COMPANION_SCRIPT_ID = 'yomu-hosted-kanji-study-companion';
const YOMU_HOSTED_ANKI_COMPANION_SCRIPT_ID = 'yomu-hosted-anki-companion';
const HOSTED_RUNTIME_VERSION = pkg.version;
const LEGACY_YOMU_HOSTED_RUNTIME_SCRIPT_ID = 'yomu-hosted-demo-runtime';
const YOMU_SUPPORT_STATUS_URL = 'https://support.yomureader.com/status';
const YOMU_SUPPORT_FALLBACK_STATUS_URL = 'https://yomu-support.henry-robert-christopher-russell.workers.dev/status';
const YOMU_SUPPORT_BANNER_ID = 'yomu-support-banner';
const YOMU_SUPPORT_BANNER_DISMISSED_KEY = 'yomu-support-banner-dismissed-version';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const HOSTED_OVERFLOW_SELECTOR = '[data-yomu-hosted-overflow]';
const HOSTED_MOBILE_SETTINGS_SELECTOR = '[data-yomu-hosted-mobile-settings]';
const HOSTED_RUNTIME_SCROLL_MARGIN_PX = 160;
// The fold promises "press a word". 2.5s is long enough for a cold runtime on a
// slow connection to boot and short enough that nobody presses a dead sample
// first; after 15s a runtime that has not arrived is not going to.
const HOSTED_FOLD_WATCHDOG_TICK_MS = 500;
const HOSTED_FOLD_WATCHDOG_MS = 2500;
const HOSTED_FOLD_WATCHDOG_GIVE_UP_MS = 15000;
const HOSTED_JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
interface HostedSupportProvider {
    id?: string;
    label?: string;
    url?: string;
    kind?: string;
    enabled?: boolean;
}
interface HostedSupportDisplay {
    currency?: string;
    symbol?: string;
    amount?: number;
    goal?: number;
    amountText?: string;
    goalText?: string;
    converted?: boolean;
}
interface HostedSupportStatus {
    dailyBudgetGbp?: number;
    donationGoalGbp?: number;
    donationsTodayGbp?: number;
    donationsThisMonthGbp?: number;
    estimatedMonthlyCostGbp?: number;
    goalMet?: boolean;
    progressRatio?: number;
    donateUrl?: string;
    providers?: HostedSupportProvider[];
    display?: HostedSupportDisplay;
    banner?: {
        enabled?: boolean;
        dismissVersion?: string;
        message?: string;
        costLabel?: string;
        goalLabel?: string;
        ctaLabel?: string;
        donateUrl?: string;
    };
}
const HOSTED_RUNTIME_TARGET_SELECTOR = [
    '[data-yomu-runtime-surface]',
    '.VPHero',
    '.VPHomeHero',
    '.VPFeatures',
    '.yomu-install-panel',
    '.yomu-hosted-overflow-group',
    '.yomu-link-grid',
    '.vp-doc',
].join(',');
let hostedSupportBannerStatus: HostedSupportStatus | undefined;
let accentSyncBound = false;
let hostedThemeSyncBound = false;
let hostedThemeIsDark: Ref<boolean> | undefined;
let hostedSettingsEventPatch: Record<string, any> = {};
let hostedSharedSettingsWrite: Promise<void> = Promise.resolve();
let themeClassObserver: MutationObserver | undefined;
// Fingerprint of the annotation-affecting settings last seen/applied, seeded
// from stored settings at install time (before any change event can fire).
let hostedAppliedAnnotationSettings: string | undefined;
let hostedAccentSignature = '';
let hostedRuntimeIntentController: AbortController | undefined;
let hostedRuntimeIntentTargets: HTMLElement[] | undefined;
let hostedRuntimeHoverHandoff: { x: number; y: number } | undefined;
let hostedRuntimeHoverHandoffController: AbortController | undefined;
let routeSyncBound = false;
let localRuntimeCacheCleanupStarted = false;

// Built from docs/.vitepress/shared/nav.ts — the same list the docs nav uses.
// This was a second hand-maintained copy that had already drifted from it: it
// pointed Stats at /newtab/ (the route is /study/), and it was missing the FAQ,
// Guides, Academy and Membership entirely, so the hosted Study, PDF Reader and
// Video Player shells offered a menu the rest of the site did not have.
const HOSTED_OVERFLOW_LINKS = hostedOverflowLinks();

const HOSTED_THEME_PREFERENCES = new Set<HostedThemePreference>(['auto', 'dark', 'light']);

function syncLandmarks() {
    const content = document.querySelector<HTMLElement>('#VPContent');
    syncSkipLinkLandmark();
    if (!content) return;
    if (content.querySelector('main')) {
        content.removeAttribute('role');
        return;
    }
    content.setAttribute('role', 'main');
}

function syncSkipLinkLandmark(): void {
    const skipLink = document.querySelector<HTMLAnchorElement>('.VPSkipLink');
    if (!skipLink || skipLink.closest('[data-yomu-skip-links]')) return;
    const nav = document.createElement('nav');
    nav.className = 'yomu-skip-links';
    nav.dataset.yomuSkipLinks = 'true';
    nav.setAttribute('aria-label', 'Skip links');
    skipLink.before(nav);
    nav.append(skipLink);
}

function activeWebsiteLocale(): InterfaceLanguage {
    return websiteLocaleForPathname(window.location.pathname);
}

function installHostedOverflowMenu() {
    syncHostedOverflowMenu();
    syncHostedMobileNavSettings();
}

function syncHostedOverflowMenu() {
    const extra = document.querySelector<HTMLElement>('.VPNavBarExtra');
    if (!extra) return;
    extra.classList.add('yomu-hosted-extra');
    syncHostedOverflowButton(extra);
    syncHostedOverflowGroup(extra);
}

function syncHostedOverflowButton(extra: HTMLElement): void {
    const button = extra.querySelector<HTMLButtonElement>(':scope > button.button');
    if (!button) return;
    button.setAttribute('aria-label', websiteMessage('docs.theme.menu', activeWebsiteLocale()));
    button.removeAttribute('title');
}

function syncHostedOverflowGroup(extra: HTMLElement): void {
    const menu = extra.querySelector<HTMLElement>('.VPMenu');
    if (!menu) return;
    if (!menu.querySelector(HOSTED_OVERFLOW_SELECTOR)) menu.prepend(createHostedOverflowGroup());
}

function syncHostedMobileNavSettings() {
    const moreItems = document.querySelector<HTMLElement>('#NavScreenGroup-more');
    if (!moreItems || moreItems.querySelector(HOSTED_MOBILE_SETTINGS_SELECTOR)) return;
    moreItems.prepend(createHostedMobileSettingsItem());
}

function createHostedOverflowGroup(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'group yomu-hosted-overflow-group';
    group.dataset.yomuHostedOverflow = 'true';

    const list = document.createElement('div');
    list.className = 'yomu-hosted-overflow-list';
    list.append(createHostedSettingsItem(), ...HOSTED_OVERFLOW_LINKS.map(createHostedOverflowLink));
    group.append(list);
    return group;
}

function createHostedSettingsItem(): HTMLButtonElement {
    const locale = activeWebsiteLocale();
    const button = document.createElement('button');
    button.className = 'yomu-hosted-overflow-link';
    configureHostedSettingsButton(button, locale, openHostedSettings);
    return button;
}

function createHostedMobileSettingsItem(): HTMLElement {
    const locale = activeWebsiteLocale();
    const item = document.createElement('div');
    item.className = 'item yomu-hosted-mobile-settings-item';
    item.dataset.yomuHostedMobileSettings = 'true';

    const button = document.createElement('button');
    button.className = 'yomu-hosted-mobile-settings-button';
    configureHostedSettingsButton(button, locale, () => {
        closeHostedMobileNavScreen();
        openHostedSettings();
    });
    item.append(button);
    return item;
}

function configureHostedSettingsButton(
    button: HTMLButtonElement,
    locale: InterfaceLanguage,
    open: () => void,
): void {
    button.type = 'button';
    button.textContent = websiteNavigationLabel('Settings reference', locale);
    button.setAttribute('aria-label', locale === 'ja' ? '設定を開く' : 'Open settings');
    bindHostedSettingsWarmup(button);
    button.addEventListener('click', open);
}

function closeHostedMobileNavScreen(): void {
    const hamburger = document.querySelector<HTMLButtonElement>('.VPNavBarHamburger[aria-expanded="true"]');
    hamburger?.click();
}

function createHostedOverflowLink(item: typeof HOSTED_OVERFLOW_LINKS[number]): HTMLAnchorElement {
    const locale = activeWebsiteLocale();
    const link = document.createElement('a');
    link.className = 'yomu-hosted-overflow-link';
    link.href = localizedWebsiteHref(item.href, locale);
    link.textContent = websiteNavigationLabel(item.text, locale);
    if (item.target) link.target = item.target;
    return link;
}

function bindHostedSettingsWarmup(button: HTMLElement): void {
    const warm = () => warmHostedSettingsRuntime();
    const options = { passive: true, once: true } as AddEventListenerOptions;
    button.addEventListener('pointerenter', warm, options);
    button.addEventListener('pointerdown', warm, options);
    button.addEventListener('touchstart', warm, options);
    button.addEventListener('focusin', warm, { once: true });
}

function warmHostedSettingsRuntime(): HTMLScriptElement[] {
    const forceLocalRuntime = isLocalHostedRuntime();
    const settings = appendHostedSettingsCompanionScript(forceLocalRuntime);
    const core = loadHostedYomuRuntime();
    return [settings, core].filter(isHostedRuntimeScriptElement);
}

function openHostedSettings(): void {
    const scripts = warmHostedSettingsRuntime();
    const dispatch = () => {
        if (document.querySelector('.jpdb-reader-settings')) return true;
        window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: 'basics' } }));
        return Boolean(document.querySelector('.jpdb-reader-settings'));
    };
    if (dispatch()) return;
    onHostedScriptsReady(scripts, () => window.requestAnimationFrame(dispatch));
    [50, 120, 240, 480, 900, 1500].forEach(delay => window.setTimeout(dispatch, delay));
}
function readStoredSettings(): Record<string, any> {
    return parseHostedSettings(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
}

function readEffectiveHostedSettings(): Record<string, any> {
    return { ...readStoredSettings(), ...hostedSettingsEventPatch };
}

function parseHostedSettings(value: string): Record<string, any> {
    try {
        return hostedSettingsRecord(JSON.parse(value));
    } catch {
        return {};
    }
}

function hostedSettingsRecord(value: unknown): Record<string, any> {
    if (isHostedSettingsRecord(value)) return value;
    return {};
}

function isHostedSettingsRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function installHostedThemeSync(isDark: Ref<boolean>): void {
    hostedThemeIsDark = isDark;
    syncHostedThemeFromSettings();
    if (hostedThemeSyncBound) return;
    hostedThemeSyncBound = true;
    window.addEventListener(SETTINGS_CHANGE_EVENT, event => {
        const change = settingsFromChangeEvent(event);
        if (!change) return;
        rememberHostedSettingsChange(change.settings, !change.preview);
        const theme = hostedThemePreferenceFromValue(change.settings.theme);
        if (!theme) return;
        syncHostedThemeFromSettings(theme);
    });
    window.addEventListener('storage', event => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
            hostedSettingsEventPatch = {};
            syncHostedThemeFromSettings();
        }
    });
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (readStoredThemePreference() === 'auto') syncHostedThemeFromSettings();
    });
}

function installHostedAppearanceProvider(): void {
    provide('toggle-appearance', () => {
        const current = effectiveHostedTheme(readStoredThemePreference());
        setHostedThemePreference(current === 'dark' ? 'light' : 'dark');
    });
}

function setHostedThemePreference(theme: HostedThemePreference): void {
    const settings = writeStoredThemePreference(theme);
    syncHostedThemeFromSettings(theme);
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));
}

function writeStoredThemePreference(theme: HostedThemePreference): Record<string, any> {
    return writeStoredSettingsPatch({ theme });
}

function syncHostedThemeFromSettings(theme: unknown = readStoredThemePreference()): void {
    const preference = normalizeHostedThemePreference(theme);
    const effective = effectiveHostedTheme(preference);
    if (hostedThemeIsDark && hostedThemeIsDark.value !== (effective === 'dark')) {
        hostedThemeIsDark.value = effective === 'dark';
    }
    document.documentElement.classList.toggle('dark', effective === 'dark');
    writeVitePressAppearancePreference(preference, effective);
    syncHostedAccent();
}

function writeVitePressAppearancePreference(preference: HostedThemePreference, effective: 'dark' | 'light'): void {
    const stored = preference === 'auto' ? 'auto' : effective;
    localStorage.setItem(VITEPRESS_APPEARANCE_KEY, stored);
    window.requestAnimationFrame?.(() => {
        if (readStoredThemePreference() === preference) localStorage.setItem(VITEPRESS_APPEARANCE_KEY, stored);
    });
}

function settingsFromChangeEvent(event: Event): { settings: Record<string, unknown>; preview: boolean } | undefined {
    const detail = hostedSettingsChangeDetail(event);
    if (!isHostedSettingsRecord(detail.settings)) return undefined;
    return { settings: detail.settings, preview: detail.preview === true };
}

function hostedSettingsChangeDetail(event: Event): HostedSettingsChangeDetail {
    return (event as CustomEvent<HostedSettingsChangeDetail>).detail ?? {};
}

function rememberHostedSettingsChange(settings: Record<string, unknown>, persist: boolean): void {
    const patch = hostedSettingsPatch(settings);
    if (!Object.keys(patch).length) return;
    hostedSettingsEventPatch = { ...hostedSettingsEventPatch, ...patch };
    if (persist) writeStoredSettingsPatch(patch);
}

function hostedSettingsPatch(settings: Record<string, unknown>): Record<string, any> {
    const patch: Record<string, any> = {};
    const theme = hostedThemePreferenceFromValue(settings.theme);
    const accentColor = hostedAccentColorFromValue(settings.accentColor);
    const interfaceLanguage = hostedInterfaceLanguagePreferenceFromValue(settings.interfaceLanguage);
    if (theme) patch.theme = theme;
    if (accentColor) patch.accentColor = accentColor;
    if (interfaceLanguage) patch.interfaceLanguage = interfaceLanguage;
    return patch;
}

function writeStoredSettingsPatch(patch: Record<string, any>, options: { shared?: boolean } = {}): Record<string, any> {
    const settings = { ...readStoredSettings(), ...patch };
    hostedSettingsEventPatch = { ...hostedSettingsEventPatch, ...patch };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (options.shared !== false) propagateSettingsPatchToSharedStorage(patch);
    return settings;
}

// The localStorage write above only reaches this origin. When the userscript's
// storage bridge is active, patch the shared GM settings as well so docs-chrome
// edits (theme toggle, HUD language) follow the user to every other site.
// Read-modify-write against the shared copy so a stale hosted blob never
// clobbers settings saved elsewhere.
function propagateSettingsPatchToSharedStorage(patch: Record<string, any>): void {
    hostedSharedSettingsWrite = hostedSharedSettingsWrite.then(async () => {
        try {
            const shared = await gmStorageGet<Record<string, any> | null>(SETTINGS_STORAGE_KEY, null);
            await gmStorageSet(SETTINGS_STORAGE_KEY, { ...(shared ?? {}), ...patch });
        } catch {
            // Bridge unavailable: the localStorage copy stays authoritative here.
        }
    });
}

function readStoredThemePreference(): HostedThemePreference {
    return normalizeHostedThemePreference(readEffectiveHostedSettings().theme);
}

function normalizeHostedThemePreference(value: unknown, fallback: HostedThemePreference | undefined = 'auto'): HostedThemePreference {
    return hostedThemePreferenceFromValue(value) ?? fallback ?? 'auto';
}

function hostedThemePreferenceFromValue(value: unknown): HostedThemePreference | undefined {
    return typeof value === 'string' && HOSTED_THEME_PREFERENCES.has(value as HostedThemePreference)
        ? value as HostedThemePreference
        : undefined;
}

function hostedInterfaceLanguagePreferenceFromValue(value: unknown): HostedInterfaceLanguagePreference | undefined {
    return value === 'auto' || value === 'en' || value === 'ja'
        ? value
        : undefined;
}

function effectiveHostedTheme(theme: HostedThemePreference): 'dark' | 'light' {
    if (theme === 'dark' || theme === 'light') return theme;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function installHostedAccentSync(): void {
    syncHostedAccent();
    if (accentSyncBound) return;
    accentSyncBound = true;
    window.addEventListener(SETTINGS_CHANGE_EVENT, syncHostedAccent);
    window.addEventListener('storage', event => {
        if (event.key === SETTINGS_STORAGE_KEY || event.key === null) {
            hostedSettingsEventPatch = {};
            syncHostedAccent();
        }
    });
    themeClassObserver = new MutationObserver(syncHostedAccent);
    themeClassObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

function syncHostedAccent(source?: unknown): void {
    if (source instanceof Event) {
        const change = settingsFromChangeEvent(source);
        if (change) rememberHostedSettingsChange(change.settings, !change.preview);
    }
    const accent = sanitizeHostedAccentColor(readEffectiveHostedSettings().accentColor);
    const root = document.documentElement;
    const dark = root.classList.contains('dark');
    const signature = `${accent}|${dark ? 'dark' : 'light'}`;
    if (hostedAccentSignature === signature) return;
    hostedAccentSignature = signature;

    // Same variable map the pre-paint bootstrap stamps (see
    // src/reader/core/hosted-appearance-boot.ts), so re-applying it after
    // hydration is a no-op instead of a visible colour correction.
    const variables = hostedAccentCssVariables(accent, dark);
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);

    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', accent);
}


function declareHostedAnnotationScope(): void {
    document.documentElement.setAttribute('data-yomu-annotation-scope', 'surface');
    syncHostedContentAnnotationSurface();
}

// On a Japanese route the docs are themselves Japanese immersion content, so the
// whole content column becomes a declared Reader Surface and annotates like
// any other Japanese site — for the hosted demo runtime and an installed
// userscript alike. English mode keeps the demo-only scope: outside the demo
// surfaces the chrome holds no meaningful Japanese, and scanning it is what
// made Japanese mode drag before the scope existed.
function syncHostedContentAnnotationSurface(): void {
    const content = document.getElementById('VPContent');
    if (!content) return;
    const japanese = activeWebsiteLocale() === 'ja';
    toggleHostedRuntimeSurface(content, japanese);
    // Japanese mode reads the chrome too: the top navigation, local nav, and
    // sidebar labels are ordinary Japanese vocabulary (学ぶ, 学習, アカデミー)
    // with ruby room, so they join the declared surfaces. English mode keeps
    // them out of scope entirely — there the chrome holds no Japanese.
    for (const selector of ['.VPNav', '.VPLocalNav', '.VPSidebar']) {
        document.querySelectorAll<HTMLElement>(selector).forEach(element => toggleHostedRuntimeSurface(element, japanese));
    }
}

function toggleHostedRuntimeSurface(element: HTMLElement, declared: boolean): void {
    if (declared) element.setAttribute('data-yomu-runtime-surface', '');
    else element.removeAttribute('data-yomu-runtime-surface');
}

function installHostedDocsEnhancements(): void {
    syncHostedRouteEnhancements();
    registerHostedDocsServiceWorker();
    installHostedAccentSync();
    if (routeSyncBound) return;
    routeSyncBound = true;
    hostedAppliedAnnotationSettings ??= hostedAnnotationSettingsFingerprint(readStoredSettings());
    window.addEventListener(SETTINGS_CHANGE_EVENT, syncHostedAnnotationSettingsFromEvent);
}

function syncHostedRouteEnhancements(): void {
    declareHostedAnnotationScope();
    syncLandmarks();
    syncHostedAcademyAccountControls(activeWebsiteLocale());
    document.querySelector(HOSTED_OVERFLOW_SELECTOR)?.remove();
    document.querySelector(HOSTED_MOBILE_SETTINGS_SELECTOR)?.remove();
    installHostedOverflowMenu();
    installHostedSupportBanner();
    prepareHostedYomuRuntime();
    installHostedHomepageInteractions();
    syncHostedAccent();
}

function registerHostedDocsServiceWorker(): void {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

function installHostedSupportBanner(): void {
    const existing = document.getElementById(YOMU_SUPPORT_BANNER_ID);
    if (existing) {
        if (hostedSupportBannerStatus) {
            existing.replaceWith(renderHostedSupportBanner(hostedSupportBannerStatus));
        }
        return;
    }
    void loadHostedSupportStatus()
        .then(status => {
            if (!shouldShowHostedSupportBanner(status)) return;
            hostedSupportBannerStatus = status;
            const banner = renderHostedSupportBanner(status);
            const content = document.querySelector<HTMLElement>('.VPContent');
            if (content) content.prepend(banner);
            else document.body.prepend(banner);
        })
        .catch(() => undefined);
}

async function loadHostedSupportStatus(): Promise<HostedSupportStatus> {
    let lastError: unknown;
    for (const url of [YOMU_SUPPORT_STATUS_URL, YOMU_SUPPORT_FALLBACK_STATUS_URL]) {
        try {
            return await fetchHostedSupportStatus(url);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Support status unavailable');
}

async function fetchHostedSupportStatus(url: string): Promise<HostedSupportStatus> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2400);
    try {
        const response = await fetch(url, {
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });
        if (!response.ok) throw new Error('Support status unavailable');
        return await response.json() as HostedSupportStatus;
    } finally {
        window.clearTimeout(timeout);
    }
}

function shouldShowHostedSupportBanner(status: HostedSupportStatus): boolean {
    const banner = status.banner;
    if (banner?.enabled === false) return false;
    if (hostedReadySupportProviders(status).length === 0) return false;
    if (!hostedSupportGoalAvailable(status)) return false;
    const version = hostedSupportDismissVersion(status);
    return shouldShowHostedSupportBannerImpression(version);
}

function renderHostedSupportBanner(status: HostedSupportStatus): HTMLElement {
    const banner = document.createElement('aside');
    banner.id = YOMU_SUPPORT_BANNER_ID;
    banner.className = 'yomu-support-banner';
    banner.setAttribute(
        'aria-label',
        activeWebsiteLocale() === 'ja' ? 'よむの運営支援' : 'Yomu running-cost support',
    );
    banner.dataset.yomuSupportBanner = 'true';

    const copy = document.createElement('div');
    copy.className = 'yomu-support-banner-copy';

    const message = document.createElement('strong');
    message.textContent = hostedSupportMessage(status);
    copy.append(message);

    const meta = document.createElement('span');
    meta.textContent = hostedSupportMeta(status);
    copy.append(meta);

    const breakdown = document.createElement('a');
    breakdown.className = 'yomu-support-banner-breakdown';
    breakdown.href = localizedWebsiteHref('/support#monthly-running-costs', activeWebsiteLocale());
    breakdown.textContent = activeWebsiteLocale() === 'ja'
        ? '内訳'
        : 'What this covers';
    copy.append(breakdown);

    const progress = renderHostedSupportProgress(status);
    if (progress) copy.append(progress);

    const actions = document.createElement('div');
    actions.className = 'yomu-support-banner-actions';

    for (const button of renderHostedSupportProviderButtons(status)) actions.append(button);

    const close = document.createElement('button');
    close.className = 'yomu-support-banner-close';
    close.type = 'button';
    close.setAttribute(
        'aria-label',
        activeWebsiteLocale() === 'ja' ? '支援状況を閉じる' : 'Dismiss support status',
    );
    close.textContent = '×';
    close.addEventListener('click', () => {
        rememberHostedSupportDismissal(hostedSupportDismissVersion(status));
        banner.remove();
    });
    actions.append(close);

    banner.append(copy, actions);
    return banner;
}

function renderHostedSupportProgress(status: HostedSupportStatus): HTMLElement | null {
    const ratio = hostedSupportProgressRatio(status);
    if (ratio === null) return null;
    const track = document.createElement('span');
    track.className = 'yomu-support-banner-progress';
    track.setAttribute('role', 'progressbar');
    track.setAttribute(
        'aria-label',
        activeWebsiteLocale() === 'ja'
            ? '今月の運営費に対する支援額'
            : 'Support received toward this month’s running costs',
    );
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    const fill = document.createElement('span');
    fill.className = 'yomu-support-banner-progress-fill';
    fill.style.width = `${Math.round(ratio * 100)}%`;
    track.append(fill);
    return track;
}

function hostedSupportProgressRatio(status: HostedSupportStatus): number | null {
    if (typeof status.progressRatio === 'number' && Number.isFinite(status.progressRatio)) {
        return Math.min(1, Math.max(0, status.progressRatio));
    }
    const goal = status.donationGoalGbp;
    const received = status.donationsThisMonthGbp ?? status.donationsTodayGbp;
    if (typeof goal === 'number' && goal > 0 && typeof received === 'number' && received >= 0) {
        return Math.min(1, received / goal);
    }
    return null;
}

function renderHostedSupportProviderButtons(status: HostedSupportStatus): HTMLElement[] {
    return hostedReadySupportProviders(status).map(provider => {
        const link = document.createElement('a');
        link.className = provider.id === 'stripe'
            ? 'yomu-support-banner-donate'
            : 'yomu-support-banner-provider';
        link.dataset.provider = provider.id ?? '';
        link.href = provider.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = provider.id === 'stripe'
            ? (activeWebsiteLocale() === 'ja' ? '寄付する' : 'Donate')
            : (provider.label || (provider.id ?? 'Support'));
        return link;
    });
}

function hostedReadySupportProviders(
    status: HostedSupportStatus,
): Array<HostedSupportProvider & { url: string }> {
    return (status.providers ?? []).flatMap(provider => {
        if (!provider?.enabled) return [];
        const url = safeHostedHttpsUrl(provider.url);
        return url ? [{ ...provider, url }] : [];
    });
}

function safeHostedHttpsUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

function hostedSupportMessage(status: HostedSupportStatus): string {
    if (activeWebsiteLocale() === 'ja') {
        return status.goalMet
            ? '今月分の高速音声の運営費が集まりました。ありがとうございます。'
            : '今月のご支援で、単語・シャドーイング向けの高速音声を運営します。';
    }
    return status.goalMet
        ? "This month's fast audio bill is covered. Thank you."
        : "This month's support keeps fast word and shadowing audio running.";
}

function hostedSupportMeta(status: HostedSupportStatus): string {
    const goalText = hostedSupportGoalText(status);
    const receivedText = hostedSupportReceivedText(status);
    const japanese = activeWebsiteLocale() === 'ja';
    const cost = japanese
        ? `月の運営費：${goalText}`
        : `Monthly running costs: ${goalText}`;
    const goal = japanese
        ? `今月のご支援：${receivedText} / ${goalText}`
        : `Received this month: ${receivedText} / ${goalText}`;
    return `${cost} · ${goal}`;
}

function hostedSupportGoalText(status: HostedSupportStatus): string {
    const display = status.display;
    if (display?.goalText) return display.goalText;
    if (display?.converted && typeof display.goal === 'number' && display.currency) {
        return formatHostedLocalCurrency(display.goal, display.currency);
    }
    const goal = status.donationGoalGbp ?? status.estimatedMonthlyCostGbp;
    return typeof goal === 'number' && Number.isFinite(goal)
        ? formatHostedSupportGbp(goal)
        : '';
}

function hostedSupportReceivedText(status: HostedSupportStatus): string {
    const display = status.display;
    if (display?.amountText) return display.amountText;
    if (display?.converted && typeof display.amount === 'number' && display.currency) {
        return formatHostedLocalCurrency(display.amount, display.currency);
    }
    return formatHostedSupportGbp(status.donationsThisMonthGbp ?? status.donationsTodayGbp ?? 0);
}

function hostedSupportGoalAvailable(status: HostedSupportStatus): boolean {
    if (typeof status.display?.goalText === 'string' && status.display.goalText.trim()) return true;
    if (typeof status.display?.goal === 'number' && Number.isFinite(status.display.goal)) return true;
    return [status.donationGoalGbp, status.estimatedMonthlyCostGbp]
        .some(value => typeof value === 'number' && Number.isFinite(value));
}

// Client-side fallback: if the Worker could not localize (FX unavailable), or
// the caller wants the visitor's own locale formatting, use Intl.NumberFormat
// with navigator.language and the currency the Worker reported.
function formatHostedLocalCurrency(value: number, currency: string): string {
    const rounded = Math.round(value);
    try {
        const locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(rounded);
    } catch {
        return `${rounded} ${currency}`;
    }
}

function hostedSupportDismissVersion(status: HostedSupportStatus): string {
    return status.banner?.dismissVersion || 'ultimate-audio-monthly-v1';
}

function shouldShowHostedSupportBannerImpression(version: string): boolean {
    return shouldShowSupportBannerImpression({
        storageKey: YOMU_SUPPORT_BANNER_DISMISSED_KEY,
        version,
    });
}

function rememberHostedSupportDismissal(version: string): void {
    rememberSupportBannerDismissal({
        storageKey: YOMU_SUPPORT_BANNER_DISMISSED_KEY,
        version,
    });
}

function formatHostedSupportGbp(value: number): string {
    return formatHostedLocalCurrency(value, 'GBP');
}

// Settings whose values are baked into rendered reader-word DOM (ruby rt
// presence, pitch classes, token boundaries). When one of these changes, the
// existing annotations are stale and must be torn down so the runtime's next
// scan rebuilds them (destructively painted words are excluded from rescan
// collection, so without a teardown old rt would linger after e.g.
// Furigana → Off). CSS-driven channels (theme, accent, colour sources) and
// subtitle state have their own refresh paths and are deliberately absent.
const HOSTED_ANNOTATION_SETTINGS_KEYS = [
    'furiganaMode',
    'showFurigana',
    'hideKnownFurigana',
    'showPitchAccent',
    'parserProvider',
    'dictionaryPreferences',
] as const;

function hostedAnnotationSettingsFingerprint(settings: Record<string, unknown>): string {
    return JSON.stringify(HOSTED_ANNOTATION_SETTINGS_KEYS.map(key => settings[key] ?? null));
}

function syncHostedAnnotationSettingsFromEvent(event: Event): void {
    const change = settingsFromChangeEvent(event);
    if (!change) return;
    const fingerprint = hostedAnnotationSettingsFingerprint(change.settings);
    const changed = hostedAppliedAnnotationSettings !== undefined
        && hostedAppliedAnnotationSettings !== fingerprint;
    hostedAppliedAnnotationSettings = fingerprint;
    if (!changed) return;
    cleanupHostedDocsAnnotations(document.body);
    prepareHostedYomuRuntime();
}

// Homepage-only progressive enhancements: scroll reveals and the click-to-play
// homepage reveal sections.
// All are idempotent (guarded by data flags) so they survive route re-runs.
function installHostedHomepageInteractions(): void {
    armHostedRevealElements();
    bindHostedYouTubeLiteEmbeds();
    bindHostedDemoVideos();
    watchHostedFoldRuntime();
    installHostedHeroLanguageRotator();
}

// The headline rotator, restored by owner decision 2026-08-04. The SSR
// headline stays "…learning 日本語." so crawlers, social unfurls and the no-JS
// page never see a language chosen by a timer; only a booted client rotates,
// and it starts from the same 日本語 the static page shows. Japanese word order
// puts the study target first (日本語を学ぶための…), so the rotator owns the
// WHOLE headline per interface language instead of swapping a word at a fixed
// position inside a translated template.
const HOSTED_HERO_HEADLINES: Record<InterfaceLanguage, readonly [string, string]> = {
    en: ['A complete system for learning ', '.'],
    ja: ['', 'を学ぶための、すべてがそろう。'],
};
const HOSTED_HERO_ROTATION_MS = 2800;

function installHostedHeroLanguageRotator(): void {
    const heading = document.querySelector<HTMLElement>('#yomu-home-title:not([data-yomu-hero-rotator])');
    if (!heading) return;
    const languages = __YOMU_HERO_LANGUAGES__;
    if (languages.length < 2) return;
    heading.dataset.yomuHeroRotator = 'on';
    // The rotator owns the headline from here on. Static route localisation has
    // already supplied the correct language before hydration.
    heading.dataset.yomuLocalize = 'off';
    let index = 0;
    const render = () => {
        if (!heading.isConnected) return;
        const [before, after] = HOSTED_HERO_HEADLINES[activeWebsiteLocale()];
        const language = languages[index];
        // A fresh span every tick so the entry animation replays.
        const word = document.createElement('span');
        word.className = 'yomu-fold-h1-lang';
        word.lang = language.locale;
        word.dir = language.direction;
        word.textContent = language.nativeName;
        heading.replaceChildren(document.createTextNode(before), word, document.createTextNode(after));
    };
    render();
    window.setInterval(() => {
        if (document.hidden || !heading.isConnected) return;
        index = (index + 1) % languages.length;
        render();
    }, HOSTED_HERO_ROTATION_MS);
}

// The fold's live line is pre-annotated static markup, so it still looks
// correct when the reader never executes — but the "press a word" prompt would
// then be a lie. Poll for a reader that has both booted and will actually
// answer a press on the sample; if it has not, swap the prompt for a quiet link
// to the section that shows the same thing working.
function watchHostedFoldRuntime(): void {
    const prompt = document.querySelector<HTMLElement>('[data-yomu-fold-prompt]:not([data-yomu-fold-watched])');
    if (!prompt) return;
    prompt.dataset.yomuFoldWatched = 'true';
    let elapsed = 0;
    const timer = window.setInterval(() => {
        elapsed += HOSTED_FOLD_WATCHDOG_TICK_MS;
        if (isHostedFoldSampleLive()) {
            // Only ever un-stamp before the fallback has been offered. Once a
            // visitor has been shown "see it working below", swapping it back to
            // the shorter live label moves the target out from under their
            // pointer mid-press: the two states are 180px and 113px wide at the
            // same origin, so the press lands on the label instead of the link
            // and appears to do nothing. A late-booting runtime is not worth
            // that; the link still goes somewhere true.
            if (!prompt.dataset.yomuFoldFallbackShown) prompt.removeAttribute('data-yomu-runtime-missing');
            window.clearInterval(timer);
            return;
        }
        if (elapsed >= HOSTED_FOLD_WATCHDOG_MS) {
            prompt.setAttribute('data-yomu-runtime-missing', '');
            prompt.dataset.yomuFoldFallbackShown = 'true';
        }
        if (elapsed >= HOSTED_FOLD_WATCHDOG_GIVE_UP_MS) window.clearInterval(timer);
    }, HOSTED_FOLD_WATCHDOG_TICK_MS);
}

// A booted runtime is necessary but not sufficient. The reader refuses every
// lookup inside [data-jpdb-reader-surface-ignore] (its own document-click
// ignore list), so a sample marked that way leaves __yomuReaderAppInitialized
// true while pressing a word does nothing at all — the exact failure the prompt
// exists to disclose. Treat a sample the reader will not serve as no runtime.
function isHostedFoldSampleLive(): boolean {
    if (!isAnyYomuRuntimeClaimed()) return false;
    const sample = document.querySelector<HTMLElement>('.yomu-try-me-text');
    return Boolean(sample)
        && !sample?.closest('[data-jpdb-reader-surface-ignore]')
        && !sample?.querySelector('[data-jpdb-reader-surface-ignore]');
}

/**
 * Whether ANY Yomu runtime owns this page — the hosted copy, an installed
 * extension, or a userscript.
 *
 * `__yomuReaderAppInitialized` is written to the runtime's OWN `window`
 * (`bootWindow = window` in src/reader/app/boot.ts), so it is realm-local. An
 * extension content script runs in an isolated world and a userscript manager
 * may hand the script a sandboxed window, and in both cases the page's `window`
 * never receives the flag. Checking only the flag therefore reported "no
 * runtime" to visitors who had Yomu installed and working, and the fold swapped
 * its live "press a word" prompt for "see it working below" — telling someone to
 * go look elsewhere at the exact moment the thing was working in front of them.
 *
 * The runtime also claims the page with a `<meta id="jpdb-reader-runtime-owner">`
 * carrying `data-yomu-runtime-owner` (runtime-claim in boot.ts). The DOM is the
 * one thing every realm shares, so that marker is the honest signal. The window
 * flag stays as a fast path for the hosted runtime's own boot.
 */
function isAnyYomuRuntimeClaimed(): boolean {
    if (hostedYomuRuntimeWindow().__yomuReaderAppInitialized) return true;
    const marker = document.getElementById(READER_RUNTIME_MARKER_ID);
    return Boolean(marker?.dataset.yomuRuntimeOwner);
}

// Copied rather than imported: the id's home, src/reader/app/runtime-health.ts,
// pulls in the whole companion registry, and the docs bundle must not carry the
// reader's companions to read one string. tests/reader/i18n.test.ts asserts this
// literal still equals READER_RUNTIME_MARKER_ID, so the copy cannot drift.
const READER_RUNTIME_MARKER_ID = 'jpdb-reader-runtime-owner';

function bindHostedDemoVideos(): void {
    document.querySelectorAll<HTMLVideoElement>('.yomu-demo-video:not([data-yomu-demo-video-bound])').forEach(video => {
        video.dataset.yomuDemoVideoBound = 'true';
        if (video.controls) return;
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let userPaused = false;
        const toggle = () => {
            if (video.paused) {
                userPaused = false;
                video.play().catch(() => {});
                return;
            }
            userPaused = true;
            video.pause();
        };
        video.addEventListener('click', toggle);
        video.addEventListener('keydown', event => {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            toggle();
        });
        const syncMotionPreference = () => {
            if (!motionQuery.matches) {
                if (!userPaused) video.play().catch(() => {});
                return;
            }
            video.pause();
            video.removeAttribute('autoplay');
        };
        syncMotionPreference();
        motionQuery.addEventListener?.('change', syncMotionPreference);
    });
}

function bindHostedYouTubeLiteEmbeds(): void {
    document.querySelectorAll<HTMLButtonElement>('.yomu-youtube-lite:not([data-yomu-youtube-bound])').forEach(button => {
        button.dataset.yomuYoutubeBound = 'true';
        button.addEventListener('click', () => playHostedYouTubeLiteEmbed(button));
    });
}

const HOSTED_YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function playHostedYouTubeLiteEmbed(button: HTMLButtonElement): void {
    const id = readHostedYouTubeVideoId(button);
    if (!id) return;
    const title = readHostedYouTubeTitle(button);
    const frame = document.createElement('iframe');
    frame.className = 'yomu-youtube-embed';
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?cc_load_policy=1&cc_lang_pref=ja&playsinline=1&rel=0&modestbranding=1`;
    frame.title = title;
    frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';

    button.replaceWith(frame);
    frame.focus();
}

function readHostedYouTubeVideoId(button: HTMLButtonElement): string | null {
    const id = button.dataset.yomuYoutubeId;
    if (!id) return null;
    if (!HOSTED_YOUTUBE_VIDEO_ID_PATTERN.test(id)) return null;
    return id;
}

function readHostedYouTubeTitle(button: HTMLButtonElement): string {
    const title = button.dataset.yomuYoutubeTitle;
    if (title) return title;
    const label = button.getAttribute('aria-label');
    if (label) return label;
    return websiteMessage('docs.media.youtubeVideo', activeWebsiteLocale());
}

function armHostedRevealElements(): void {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.yomu-reveal:not([data-yomu-revealed])'));
    if (!elements.length) return;
    const reveal = (element: HTMLElement): void => {
        element.dataset.yomuRevealed = 'true';
        delete element.dataset.yomuRevealReady;
        element.classList.add('is-in');
    };
    if (typeof IntersectionObserver !== 'function') {
        elements.forEach(reveal);
        return;
    }
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            reveal(entry.target as HTMLElement);
            obs.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    elements.forEach(element => {
        element.dataset.yomuRevealReady = 'true';
        observer.observe(element);
    });
    // Failsafe: never leave a section permanently hidden if the observer never fires.
    window.setTimeout(() => elements.forEach(element => {
        if (!element.dataset.yomuRevealed) reveal(element);
    }), 2200);
}

function prepareHostedYomuRuntime(): void {
    const forceLocalRuntime = isLocalHostedRuntime();
    if (!shouldInstallHostedReaderRuntime(forceLocalRuntime)) {
        clearHostedYomuRuntimeIntent();
        clearHostedRuntimeHoverHandoff();
        return;
    }
    if (shouldLoadHostedRuntimeCompanionsBeforeCore()) appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    if (isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime)) {
        // Only a live reader makes the tracker moot; a mid-boot re-entry must
        // leave it running so the pending replay can still fire.
        if (hostedYomuRuntimeWindow().__yomuReaderAppInitialized) clearHostedRuntimeHoverHandoff();
        return;
    }
    // The settings companion loads on the settings warm path; normal docs pages
    // should not download every companion before the reader is needed.
    const targets = findHostedYomuRuntimeTargets();
    if (!targets.length) {
        clearHostedYomuRuntimeIntent();
        clearHostedRuntimeHoverHandoff();
        return;
    }
    bindHostedYomuRuntimeIntent(targets);
    // Demo pages preload yomu.user.js in <head>, so the bytes are already on
    // disk; executing on idle makes the first hover over the Try-me sample and
    // the demo captions open the popover immediately instead of waiting for a
    // pointer to cross a demo surface before the runtime even starts booting.
    if (targets.some(target => target.matches('[data-yomu-runtime-surface], .yomu-try-me-text'))) {
        scheduleIdleHostedYomuRuntimeLoad();
    }
    window.requestAnimationFrame(() => {
        if (hostedRuntimeIntentTargets === targets && targets.some(isElementNearViewport)) loadHostedYomuRuntime();
    });
}

function scheduleIdleHostedYomuRuntimeLoad(): void {
    const load = () => { if (hostedRuntimeIntentTargets) loadHostedYomuRuntime(); };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(load, { timeout: 2500 });
    else window.setTimeout(load, 350);
}

function findHostedYomuRuntimeTargets(): HTMLElement[] {
    const explicit = Array.from(document.querySelectorAll<HTMLElement>('[data-yomu-runtime-surface], .yomu-try-me-text'));
    if (explicit.length) return explicit;
    if (document.documentElement.getAttribute('data-yomu-annotation-scope') === 'surface') return [];
    const fallback = Array.from(document.querySelectorAll<HTMLElement>(HOSTED_RUNTIME_TARGET_SELECTOR))
        .find(element => !element.closest('.VPContent.is-home') && HOSTED_JAPANESE_TEXT_RE.test(element.textContent ?? ''));
    return fallback ? [fallback] : [];
}

function bindHostedYomuRuntimeIntent(targets: HTMLElement[]): void {
    if (hostedRuntimeIntentTargets
        && hostedRuntimeIntentController
        && targets.length === hostedRuntimeIntentTargets.length
        && targets.every((target, index) => hostedRuntimeIntentTargets?.[index] === target)) {
        hostedRuntimeIntentTargets = targets;
        return;
    }
    clearHostedYomuRuntimeIntent();
    const controller = new AbortController();
    hostedRuntimeIntentController = controller;
    hostedRuntimeIntentTargets = targets;
    const options = { passive: true, once: true, signal: controller.signal };
    const load = () => loadHostedYomuRuntime();
    for (const target of targets) {
        target.addEventListener('pointerenter', load, options);
        target.addEventListener('pointerdown', load, options);
        target.addEventListener('touchstart', load, options);
        target.addEventListener('focusin', load, { once: true, signal: controller.signal });
    }
    window.addEventListener('scroll', () => {
        if (targets.some(isElementNearViewport)) loadHostedYomuRuntime();
    }, { passive: true, signal: controller.signal });
    trackHostedRuntimeHoverHandoff(targets);
}

// The runtime usually starts on idle/near-viewport with no pointer, so a hover
// already resting on a demo word never triggered the boot — and even a hover
// that does trigger it is consumed before the reader attaches its
// document-level hover listener. Track where the pointer rests over a demo word
// (from bind until the runtime is live) so the post-boot handoff can replay it
// and open the popover without a second hover. A move off the surface clears
// the handoff so a stale position is never replayed.
function trackHostedRuntimeHoverHandoff(targets: HTMLElement[]): void {
    hostedRuntimeHoverHandoffController?.abort();
    const controller = new AbortController();
    hostedRuntimeHoverHandoffController = controller;
    hostedRuntimeHoverHandoff = undefined;
    const track = (event: PointerEvent): void => {
        if (event.pointerType === 'touch') return;
        if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return;
        const target = event.target instanceof Element ? event.target : null;
        const word = target?.closest<HTMLElement>('.jpdb-reader-word') ?? null;
        hostedRuntimeHoverHandoff = word && targets.some(surface => surface.contains(word))
            ? { x: event.clientX, y: event.clientY }
            : undefined;
    };
    window.addEventListener('pointermove', track, { passive: true, signal: controller.signal });
    window.addEventListener('pointerover', track, { passive: true, signal: controller.signal });
}

function clearHostedRuntimeHoverHandoff(): void {
    hostedRuntimeHoverHandoffController?.abort();
    hostedRuntimeHoverHandoffController = undefined;
    hostedRuntimeHoverHandoff = undefined;
}

function isElementNearViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const height = window.innerHeight || document.documentElement.clientHeight;
    return rect.top <= height + HOSTED_RUNTIME_SCROLL_MARGIN_PX && rect.bottom >= -HOSTED_RUNTIME_SCROLL_MARGIN_PX;
}

function loadHostedYomuRuntime(): HTMLScriptElement | undefined {
    clearHostedYomuRuntimeIntent();
    return installHostedYomuRuntime() ?? hostedRuntimeScript() ?? undefined;
}

function clearHostedYomuRuntimeIntent(): void {
    hostedRuntimeIntentController?.abort();
    hostedRuntimeIntentController = undefined;
    hostedRuntimeIntentTargets = undefined;
}

function isHostedYomuRuntimeLoadingOrReady(forceLocalRuntime = false): boolean {
    if (!shouldInstallHostedReaderRuntime(forceLocalRuntime)) return true;
    if (hostedRuntimeScript()) return true;
    if (forceLocalRuntime) return false;
    return Boolean(hostedYomuRuntimeWindow().__yomuReaderAppInitialized);
}

function installHostedYomuRuntime(): HTMLScriptElement | undefined {
    const runtime = hostedYomuRuntimeWindow();
    const forceLocalRuntime = isLocalHostedRuntime();
    const currentScript = hostedRuntimeScript();
    const companionFirst = shouldLoadHostedRuntimeCompanionsBeforeCore();
    prepareLocalHostedRuntime(forceLocalRuntime);
    if (shouldSkipHostedRuntimeInstall(runtime, forceLocalRuntime, currentScript)) return undefined;
    prepareHostedDemoVideoSettings();
    enableLocalHostedRuntime(runtime, forceLocalRuntime);
    if (companionFirst) appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    const script = appendHostedRuntimeScript(YOMU_HOSTED_RUNTIME_SCRIPT_ID, hostedRuntimeScriptSrc(forceLocalRuntime));
    if (!companionFirst) appendHostedSettingsCompanionAfterCoreLoad(script, forceLocalRuntime);
    armHostedRuntimeHoverHandoff();
    return script;
}

// Once the reader boots, replay whatever demo word the pointer is resting on so
// its popover opens without a second hover. The pointer tracker keeps updating
// through the whole boot window (a hover often arrives during the async load),
// so this stays armed regardless of what triggered the boot. Generic across
// every demo surface; a no-op unless the pointer ends up on a demo word.
function armHostedRuntimeHoverHandoff(): void {
    const controller = new AbortController();
    let done = false;
    const cleanup = (): void => {
        if (done) return;
        done = true;
        controller.abort();
        window.clearInterval(poll);
        window.clearTimeout(timeout);
    };
    const tryReplay = (): void => {
        if (done || !hostedYomuRuntimeWindow().__yomuReaderAppInitialized) return;
        cleanup();
        // Let the reader's first page scan settle before replaying — a hover
        // lookup fired into the middle of the initial scan is dropped.
        window.setTimeout(() => window.requestAnimationFrame(replayHostedRuntimeHoverHandoff), 250);
    };
    window.addEventListener('yomu-extension-loaded', () => window.requestAnimationFrame(tryReplay), {
        once: true,
        signal: controller.signal,
    });
    // Fallbacks: the ready event can precede this listener, and the local dev
    // runtime never dispatches it. Poll briefly, then give up so a stale gesture
    // is never replayed into an unrelated page state.
    const poll = window.setInterval(tryReplay, 100);
    const timeout = window.setTimeout(cleanup, 6000);
    tryReplay();
}

function replayHostedRuntimeHoverHandoff(): void {
    const point = hostedRuntimeHoverHandoff;
    clearHostedRuntimeHoverHandoff();
    if (!point) return;
    const target = document.elementFromPoint(point.x, point.y);
    if (!(target instanceof Element) || !target.closest('.jpdb-reader-word')) return;
    // Dispatch on the leaf under the pointer (not the word wrapper) so the
    // reader's capture-phase hover handler sees the same event.target a real
    // pointer would. pointerover then pointermove mirrors a genuine hover, which
    // the reader's move-driven lookup requires.
    const shared: PointerEventInit = { bubbles: true, cancelable: true, view: window, clientX: point.x, clientY: point.y, pointerType: 'mouse' };
    target.dispatchEvent(hostedPointerEvent('pointerover', shared));
    target.dispatchEvent(hostedPointerEvent('pointermove', shared));
}

// PointerEvent exists in every browser the docs runtime hovers in, but fall back
// to MouseEvent so the replay still fires in a stripped-down webview.
function hostedPointerEvent(type: string, init: PointerEventInit): Event {
    if (typeof PointerEvent === 'function') return new PointerEvent(type, init);
    return new MouseEvent(type, init);
}

function prepareHostedDemoVideoSettings(): void {
    if (!document.querySelector('[data-yomu-demo-player]')) return;
    // Demo-player staging only: never replicate these into the shared GM store.
    writeStoredSettingsPatch(HOSTED_DEMO_VIDEO_SETTINGS_PATCH, { shared: false });
}

function hostedYomuRuntimeWindow(): HostedYomuRuntimeWindow {
    return window as HostedYomuRuntimeWindow;
}

function hostedRuntimeScript(): HTMLScriptElement | null {
    const element = document.getElementById(YOMU_HOSTED_RUNTIME_SCRIPT_ID);
    return element instanceof HTMLScriptElement ? element : null;
}

function prepareLocalHostedRuntime(forceLocalRuntime: boolean): void {
    if (!forceLocalRuntime) return;
    clearLocalHostedRuntimeCaches();
    document.getElementById(LEGACY_YOMU_HOSTED_RUNTIME_SCRIPT_ID)?.remove();
}

function shouldSkipHostedRuntimeInstall(
    runtime: HostedYomuRuntimeWindow,
    forceLocalRuntime: boolean,
    currentScript: HTMLElement | null,
): boolean {
    if (!shouldInstallHostedReaderRuntime(forceLocalRuntime)) return true;
    if (currentScript) return true;
    return shouldKeepInitializedHostedRuntime(runtime, forceLocalRuntime, currentScript);
}

function shouldKeepInitializedHostedRuntime(
    runtime: HostedYomuRuntimeWindow,
    forceLocalRuntime: boolean,
    currentScript: HTMLElement | null,
): boolean {
    if (!runtime.__yomuReaderAppInitialized) return false;
    if (forceLocalRuntime) return Boolean(currentScript);
    return true;
}

function enableLocalHostedRuntime(runtime: HostedYomuRuntimeWindow, forceLocalRuntime: boolean): void {
    if (forceLocalRuntime) runtime.__yomuDevRuntime = true;
}

function shouldLoadHostedRuntimeCompanionsBeforeCore(): boolean {
    return location.pathname.includes('/video-player/') || Boolean(document.querySelector('[data-yomu-video-frame]'));
}

// Companion registration is read lazily by the reader, so appending the full
// companion set after the core script keeps docs first paint lean while still
// giving the demo popup its settings dialog, Immersion Kit examples, mining
// drawer, and Anki sections.
function appendHostedSettingsCompanionAfterCoreLoad(script: HTMLScriptElement, forceLocalRuntime: boolean): void {
    const append = () => appendHostedRuntimeCompanionScripts(forceLocalRuntime);
    if (isHostedScriptReady(script)) {
        append();
        return;
    }
    script.addEventListener('load', append, { once: true });
}

function appendHostedRuntimeCompanionScripts(forceLocalRuntime: boolean): HTMLScriptElement[] {
    return hostedRuntimeCompanionScripts(forceLocalRuntime).map(appendHostedRuntimeCompanionScript);
}

function appendHostedSettingsCompanionScript(forceLocalRuntime: boolean): HTMLScriptElement {
    return appendHostedRuntimeCompanionScript(hostedSettingsCompanionScript(forceLocalRuntime));
}

function appendHostedRuntimeCompanionScript(script: { id: string; src: string }): HTMLScriptElement {
    return appendHostedRuntimeScript(script.id, script.src);
}

function hostedRuntimeCompanionScripts(forceLocalRuntime: boolean): Array<{ id: string; src: string }> {
    return [
        hostedSettingsCompanionScript(forceLocalRuntime),
        {
            id: YOMU_HOSTED_VIDEO_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-video.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_OCR_MANGA_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-ocr-manga.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_UI_COPY_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-ui-copy.user.js', forceLocalRuntime),
        },
        // The kanji-study companion carries the Immersion Kit example client,
        // its popup controller, and the mining drawer helpers; the anki
        // companion carries the popup Anki sections. Without them the hosted
        // demo popup shows "Loading examples..." forever and a mining drawer
        // handle that can never open (the video-player and PDF pages already
        // load both — this list is the homepage/docs demo).
        {
            id: YOMU_HOSTED_KANJI_STUDY_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-kanji-study.user.js', forceLocalRuntime),
        },
        {
            id: YOMU_HOSTED_ANKI_COMPANION_SCRIPT_ID,
            src: hostedRuntimeAssetSrc('/greasyfork/yomu-anki.user.js', forceLocalRuntime),
        },
    ];
}

function hostedSettingsCompanionScript(forceLocalRuntime: boolean): { id: string; src: string } {
    return {
        id: YOMU_HOSTED_SETTINGS_COMPANION_SCRIPT_ID,
        src: hostedRuntimeAssetSrc('/greasyfork/yomu-settings-surface.user.js', forceLocalRuntime),
    };
}

function appendHostedRuntimeScript(id: string, src: string): HTMLScriptElement {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLScriptElement) return existing;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    script.dataset.yomuHostedRuntimeState = 'loading';
    script.addEventListener('load', () => { script.dataset.yomuHostedRuntimeState = 'loaded'; }, { once: true });
    script.addEventListener('error', () => { script.dataset.yomuHostedRuntimeState = 'error'; }, { once: true });
    document.head.append(script);
    return script;
}

function isHostedRuntimeScriptElement(value: HTMLScriptElement | undefined): value is HTMLScriptElement {
    return value instanceof HTMLScriptElement;
}

function isHostedScriptReady(script: HTMLScriptElement): boolean {
    return script.dataset.yomuHostedRuntimeState === 'loaded' || script.dataset.yomuHostedRuntimeState === 'error';
}

function onHostedScriptsReady(scripts: HTMLScriptElement[], callback: () => void): void {
    const pending = scripts.filter(script => !isHostedScriptReady(script));
    if (!pending.length) {
        callback();
        return;
    }
    let remaining = pending.length;
    let done = false;
    const markReady = () => {
        if (done) return;
        remaining -= 1;
        if (remaining > 0) return;
        done = true;
        callback();
    };
    pending.forEach(script => {
        script.addEventListener('load', markReady, { once: true });
        script.addEventListener('error', markReady, { once: true });
    });
}

function hostedRuntimeScriptSrc(forceLocalRuntime: boolean): string {
    return hostedRuntimeAssetSrc('/yomu.user.js', forceLocalRuntime);
}

function hostedRuntimeAssetSrc(src: string, forceLocalRuntime: boolean): string {
    const separator = src.includes('?') ? '&' : '?';
    if (!forceLocalRuntime) return `${src}${separator}v=${encodeURIComponent(HOSTED_RUNTIME_VERSION)}`;
    return `${src}${separator}t=${Date.now()}`;
}

function isLocalHostedRuntime(): boolean {
    return LOCAL_HOSTS.has(location.hostname);
}

function clearLocalHostedRuntimeCaches(): void {
    if (localRuntimeCacheCleanupStarted) return;
    localRuntimeCacheCleanupStarted = true;
    if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistrations()
            .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
            .catch(() => undefined);
    }
    if ('caches' in window) {
        void caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('yomu-') || key.includes('yomu-reader'))
                .map(key => caches.delete(key))))
            .catch(() => undefined);
    }
}

const YomuLayout = defineComponent({
    name: 'YomuLayout',
    setup(_, { slots }) {
        const { isDark } = useData();
        installHostedAppearanceProvider();
        onMounted(() => {
            installHostedThemeSync(isDark);
            installHostedDocsEnhancements();
        });
        return () => h(DefaultTheme.Layout, null, slots);
    },
});

export default {
    ...DefaultTheme,
    Layout: YomuLayout,
    async enhanceApp(ctx) {
        await DefaultTheme.enhanceApp?.(ctx);
        // Delegated from document, so it survives VitePress's client-side route
        // changes without re-binding per page. Guarded because enhanceApp also
        // runs during SSR, where there is no document to listen on.
        if (typeof document !== 'undefined') {
            installMembershipPopover();
            const afterRouteChange = ctx.router.onAfterRouteChange;
            ctx.router.onAfterRouteChange = async to => {
                await afterRouteChange?.(to);
                window.requestAnimationFrame(syncHostedRouteEnhancements);
            };
        }
    },
} satisfies Theme;
