import { isYomuHostedAppUrl } from './pages';
import { isYomuNewTabUrl } from '../newtab/url';
import { runningAsBrowserExtension } from './runtime-env';
import { documentHasJapaneseText } from '../dom/index';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { loggingSettingsSummary } from './logger';
import { applyUrlBootstrapSettings, loadSettings } from '../settings/index';
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
    const loadedSettings = await loadSettings();
    const settings = applyUrlBootstrapSettings(loadedSettings);
    return {
        settings,
        settingsSummary: loggingSettingsSummary(settings),
        shouldShowWelcome: options?.showWelcome ?? true,
    };
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
