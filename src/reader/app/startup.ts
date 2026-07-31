import { isYomuHostedAppUrl } from './pages';
import { isYomuNewTabUrl } from '../newtab/url';
import { runningAsBrowserExtension } from './runtime-env';
import { documentHasJapaneseText } from '../dom/index';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
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
    // Every surface that resolves a language capability reads the active
    // target, and several of them run before the first settings-change event
    // (the startup text probe, the initial scan, embedded frames that never
    // bind runtime events). The target has to follow the stored profile from
    // the moment settings exist, not from the first write afterwards.
    adoptLearningTargetFromSettings(settings);
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
    // ReaderApp reaches startup only after the managed web-storage epoch gate;
    // this raw read is the hosted page's own same-origin language handoff.
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
    // Userscripts use their manager's shared GM store and packaged extensions
    // use chrome.storage.local/browser.storage.local. Both carry onboardingSeen
    // across content origins, so the first Japanese page is a safe first-run
    // surface and the stored flag keeps the welcome from returning.
    if (runningAsBrowserExtension() && isYomuNewTabUrl(href)) return true;
    return !isYomuHostedAppUrl(href);
}

export function installReaderStartupBridge(): (() => void) | undefined {
    return initJpdbReviewPageBridge();
}

export function detectReaderStartupJapaneseText(): boolean {
    return documentHasJapaneseText(200000, scanScopeRoots());
}
