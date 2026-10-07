import { isYomuHostedAppUrl } from './pages';
import { documentHasJapaneseText } from '../dom/index';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { loggingSettingsSummary } from './logger';
import { applyUrlBootstrapSettings, loadSettings, SETTINGS_STORAGE_KEY } from '../settings/index';
import type { ReaderSettings } from './types';
import { scanScopeRoots } from './annotation-scope';

export interface ReaderAppInitOptions {
    embeddedFrame?: boolean;
    startupSettings?: ReaderSettings;
    settingsSurface?: ReaderSettingsSurface;
}

/**
 * A first-party host may own a safer settings surface than the Reader dialog.
 * The Adapter receives the same panel name used by the ordinary dialog.
 */
export interface ReaderSettingsSurface {
    open(panel?: string): Promise<void>;
}

export interface ReaderStartupSettings {
    settings: ReaderSettings;
    settingsSummary: ReturnType<typeof loggingSettingsSummary>;
}

export async function loadReaderStartupSettings(options: ReaderAppInitOptions = {}): Promise<ReaderStartupSettings> {
    // Packaged first-party surfaces can already own a normalized settings
    // snapshot without exposing it through page-readable storage. Ordinary
    // userscript/extension boot remains storage-backed.
    const loadedSettings = adoptHostedInterfaceLanguage(options.startupSettings ?? await loadSettings());
    const settings = applyUrlBootstrapSettings(loadedSettings);
    return {
        settings,
        settingsSummary: loggingSettingsSummary(settings),
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

export function installReaderStartupBridge(): (() => void) | undefined {
    return initJpdbReviewPageBridge();
}

export function detectReaderStartupJapaneseText(): boolean {
    return documentHasJapaneseText(200000, scanScopeRoots());
}
