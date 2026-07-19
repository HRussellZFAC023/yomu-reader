import { isYomuHostedAppUrl } from './pages';
import { isYomuNewTabUrl } from '../newtab/url';
import { runningAsBrowserExtension } from './runtime-env';
import { documentHasJapaneseText } from '../dom/index';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { loggingSettingsSummary } from './logger';
import { applyUrlBootstrapSettings, loadSettings, SETTINGS_STORAGE_KEY } from '../settings/index';
import type { ReaderSettings } from './types';
import { scanScopeRoots } from './annotation-scope';

export interface ReaderAppInitOptions {
    embeddedFrame?: boolean;
    showWelcome?: boolean;
}

export interface ReaderStartupSettings {
    settings: ReaderSettings;
    settingsSummary: ReturnType<typeof loggingSettingsSummary>;
    shouldShowWelcome: boolean;
}

export async function loadReaderStartupSettings(options?: ReaderAppInitOptions): Promise<ReaderStartupSettings> {
    const loadedSettings = adoptHostedInterfaceLanguage(await loadSettings());
    const settings = applyUrlBootstrapSettings(loadedSettings);
    return {
        settings,
        settingsSummary: loggingSettingsSummary(settings),
        shouldShowWelcome: options?.showWelcome ?? true,
    };
}

// The hosted docs/study pages keep their interface-language choice in
// page-localStorage (the docs theme's あ toggle writes it there and mirrors
// every runtime echo into it), while the userscript runtime persists to GM
// storage. When the runtime boots AFTER the visitor toggles the page language
// — the toggle itself boots the runtime on docs pages — the runtime's stale GM
// copy would otherwise ride along on its next full-settings save and clobber
// the visitor's choice back (the "tap the toggle twice" bug). On hosted app
// URLs the page-visible choice is authoritative at boot.
function adoptHostedInterfaceLanguage(settings: ReaderSettings, href = location.href): ReaderSettings {
    if (!isYomuHostedAppUrl(href)) return settings;
    const language = hostedPageInterfaceLanguage();
    if (!language || settings.interfaceLanguage === language) return settings;
    return { ...settings, interfaceLanguage: language };
}

function hostedPageInterfaceLanguage(): ReaderSettings['interfaceLanguage'] | null {
    try {
        const raw = window.localStorage?.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        const record = JSON.parse(raw) as { interfaceLanguage?: unknown } | null;
        const value = record?.interfaceLanguage;
        return value === 'auto' || value === 'en' || value === 'ja' ? value : null;
    } catch {
        return null;
    }
}

export function shouldShowReaderOnboarding(shouldShowWelcome: boolean, href = location.href): boolean {
    if (!shouldShowWelcome) return false;
    // A browser extension injects the reader into every website, but its settings
    // persist to per-origin localStorage (there is no GM_* store), so the
    // onboardingSeen flag saved on the study/new-tab page never reads true on an
    // arbitrary content origin. Left ungated, the welcome overlay reappears on
    // every website (SIGHUP, iOS Safari). The onboarding belongs on the Yomu
    // new-tab/study page only, so restrict extension builds to that page.
    if (runningAsBrowserExtension()) return isYomuNewTabUrl(href);
    // Userscript builds keep their first-run overlay on any host (guarded by
    // onboardingSeen); only the hosted Yomu app suppresses it.
    return !isYomuHostedAppUrl(href);
}

export function installReaderStartupBridge(): (() => void) | undefined {
    return initJpdbReviewPageBridge();
}

export function detectReaderStartupJapaneseText(): boolean {
    return documentHasJapaneseText(200000, scanScopeRoots());
}
