import { isYomuHostedAppUrl } from './app-pages';
import { documentHasJapaneseText } from './dom';
import { initJpdbReviewPageBridge } from './jpdb-review-bridge';
import { loggingSettingsSummary } from './logger';
import { applyUrlBootstrapSettings, loadSettings } from './settings';
import type { ReaderSettings } from './types';

export interface ReaderAppInitOptions {
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
