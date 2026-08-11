import {
    isYomuHostedAcademyPage,
    isYomuHostedAppUrl,
    isYomuHostedPassivePage,
    isYomuHostedPdfReaderPage,
    isYomuHostedVideoPlayerPage,
} from './pages';
import { isYomuNewTabUrl } from '../newtab/url';
import { runningAsBrowserExtension } from './runtime-env';
import { documentHasJapaneseText } from '../dom/index';
import { initJpdbReviewPageBridge } from '../jpdb/jpdb-review-bridge';
import { adoptLearningTargetFromSettings } from '../languages/target-selection';
import { adoptLearningTargetLanguage } from '../languages/target-runtime';
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
    pageOwnedLearningTarget: 'ja' | null;
}

export async function loadReaderStartupSettings(options?: ReaderAppInitOptions): Promise<ReaderStartupSettings> {
    const loadedSettings = adoptHostedInterfaceLanguage(await loadSettings());
    const settings = applyUrlBootstrapSettings(loadedSettings);
    const pageOwnedLearningTarget = activateReaderStartupTarget(settings);
    // Every surface that resolves a language capability reads the active
    // target, and several of them run before the first settings-change event
    // (the startup text probe, the initial scan, embedded frames that never
    // bind runtime events). The target has to follow the stored profile from
    // the moment settings exist, not from the first write afterwards.
    // A fresh install has a legacy-compatible Japanese profile in storage shape,
    // but it is not the learner's choice. Do not make that compatibility value
    // ambient runtime state until onboarding confirms a target explicitly.
    return {
        settings,
        settingsSummary: loggingSettingsSummary(settings),
        shouldShowWelcome: options?.showWelcome ?? true,
        pageOwnedLearningTarget,
    };
}

function activateReaderStartupTarget(settings: ReaderSettings, href = location.href): 'ja' | null {
    if (settings.learningTargetChosen) {
        adoptLearningTargetFromSettings(settings);
        return null;
    }
    const pageOwnedLearningTarget = hostedPageOwnedLearningTarget(href);
    if (pageOwnedLearningTarget) adoptLearningTargetLanguage(pageOwnedLearningTarget);
    return pageOwnedLearningTarget;
}

/**
 * Hosted docs and Academy own deliberate Japanese reading surfaces. That local
 * policy may activate the matching Adapter for the page, but it is never stored
 * as the learner's target choice. Standalone Study/PDF/Video remain choosers.
 */
export function hostedPageOwnedLearningTarget(href: string): 'ja' | null {
    return isYomuHostedPassivePage(href) || isYomuHostedAcademyPage(href) ? 'ja' : null;
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
    // These public file readers have no page-owned language. A fresh visitor
    // must choose before OCR, subtitle, dictionary, or annotation work starts.
    if (hostedFileReaderRequiresOnboarding(href)) return true;
    if (!shouldShowWelcome) return false;
    // Userscripts use their manager's shared GM store and packaged extensions
    // use chrome.storage.local/browser.storage.local. Both carry onboardingSeen
    // across content origins, so the first eligible top-level page can host the
    // required target chooser and the stored flag keeps it from returning.
    if (extensionNewTabCanHostOnboarding(href)) return true;
    return !isYomuHostedAppUrl(href);
}

function hostedFileReaderRequiresOnboarding(href: string): boolean {
    return isYomuHostedPdfReaderPage(href) || isYomuHostedVideoPlayerPage(href);
}

function extensionNewTabCanHostOnboarding(href: string): boolean {
    return runningAsBrowserExtension() && isYomuNewTabUrl(href);
}

export function installReaderStartupBridge(): (() => void) | undefined {
    return initJpdbReviewPageBridge();
}

export function detectReaderStartupJapaneseText(): boolean {
    return documentHasJapaneseText(200000, scanScopeRoots());
}
