import { isYomuHostedAppUrl } from './pages';
import { documentHasJapaneseText } from '../dom/index';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { loggingSettingsSummary } from './logger';
import { applyUrlBootstrapSettings, loadSettings } from '../settings/index';
import type { ReaderSettings } from './types';

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
    return shouldShowWelcome && !isYomuHostedAppUrl(href);
}

export function installReaderStartupBridge(): void {
    initJpdbReviewPageBridge();
}

export function detectReaderStartupJapaneseText(): boolean {
    return documentHasJapaneseText();
}
