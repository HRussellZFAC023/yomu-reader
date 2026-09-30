// The v1.9.3 learner actions the corpus replays, expressed through v1.9.3's own
// entry points: its OnboardingController, the Settings dialog's Save contract
// (declare every changed key), and ReaderApp's undeclared machine writes.
// Only v1.9.3 stages import this file; the paths are v1.9.3's module layout.
import { vi } from 'vitest';
import { OnboardingController } from '@yomu-ref/src/reader/app/onboarding';
import {
    changedSettingsKeys,
    endSettingsResetGuard,
    loadSettings,
    NO_EXPLICIT_USER_CHOICE,
    saveSettings,
} from '@yomu-ref/src/reader/settings/index';
import { resetManagedStateEpochSessionsForTests } from '@yomu-ref/src/reader/app/managed-state-epoch';
import { resetManagedWebStorageForTests } from '@yomu-ref/src/reader/app/managed-web-storage';
import {
    installUserscriptGmStorageBridge,
    uninstallUserscriptGmStorageBridge,
} from '@yomu-ref/src/reader/userscript/storage-bridge';
import type { ReaderSettings } from '@yomu-ref/src/reader/app/types';
import { yomitanZipBlob } from '@yomu-ref/tests/reader/zip-fixture';
import { pick } from './corpus-output';
import {
    EXTENSION_STUDY_URL,
    installExtensionContentScript,
    installGmApi,
    installPackagedStudyRuntime,
    setLocation,
    type OriginWebStorage,
    type RecordingStore,
} from './realm-stubs';
import {
    CORPUS_DICTIONARY_TERMS,
    CORPUS_DICTIONARY_TITLE,
    HOSTED_STUDY_URL,
    VISIBLE_SETTINGS_KEYS,
} from './learner-story';

const GM_API = ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_listValues'] as const;
const CHANNEL_GLOBALS = [
    ...GM_API,
    'browser',
    'chrome',
    '__YOMU_EXTENSION_STORAGE_PREFIX__',
    '__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__',
] as const;

/**
 * Every realm switch is a new page load. v1.9.3's own test hooks drop the
 * per-realm epoch session and web-storage certificate, exactly what a reload
 * (including the one Factory reset forces) discards.
 */
function newPageLoad(): void {
    uninstallUserscriptGmStorageBridge();
    for (const name of CHANNEL_GLOBALS) vi.stubGlobal(name, undefined);
    endSettingsResetGuard();
    resetManagedStateEpochSessionsForTests();
    resetManagedWebStorageForTests();
    delete document.documentElement.dataset.yomuHosted;
    document.body.replaceChildren();
}

/** A userscript content realm on an ordinary site: direct GM_* access. */
export function enterUserscriptSite(gm: RecordingStore, origins: OriginWebStorage, href: string): void {
    newPageLoad();
    setLocation(href);
    origins.enter(href);
    installGmApi(gm);
}

/**
 * The hosted Study page realm with the userscript installed: the page has no
 * GM_* of its own and reaches the userscript's store through the DOM bridge.
 */
export function enterHostedStudyWithUserscript(gm: RecordingStore, origins: OriginWebStorage, href = HOSTED_STUDY_URL): void {
    newPageLoad();
    setLocation(href);
    origins.enter(href);
    installGmApi(gm);
    installUserscriptGmStorageBridge();
    for (const name of GM_API) vi.stubGlobal(name, undefined);
    document.documentElement.dataset.yomuHosted = '';
}

/** Packaged Study: moz-extension://…/newtab/ with the build's storage runtime. */
export function enterPackagedStudy(storage: RecordingStore, origins: OriginWebStorage): void {
    newPageLoad();
    setLocation(EXTENSION_STUDY_URL);
    origins.enter(EXTENSION_STUDY_URL);
    installPackagedStudyRuntime(storage);
}

/** A compiled extension content script on an ordinary page. */
export function enterExtensionContentScript(storage: RecordingStore, origins: OriginWebStorage, href: string): void {
    newPageLoad();
    setLocation(href);
    origins.enter(href);
    installExtensionContentScript(storage);
}

/** A yomureader.com page with nothing installed: page-local storage only. */
export function enterHostedWithoutInstall(origins: OriginWebStorage, href: string): void {
    newPageLoad();
    setLocation(href);
    origins.enter(href);
    document.documentElement.dataset.yomuHosted = '';
}

export async function completeOnboarding(target: string): Promise<ReaderSettings> {
    let settings = await loadSettings();
    const controller = new OnboardingController({
        getSettings: () => settings,
        setSettings: next => { settings = next; },
        showSettings: () => undefined,
        parseJapanese: () => undefined,
        installOfflineDictionaries: () => undefined,
    });
    await controller.showIfNeeded();
    const select = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]');
    if (!select) throw new Error(`v1.9.3 onboarding rendered no target chooser at ${location.href}.`);
    select.value = target;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
    await controller.waitForCompletion();
    document.body.replaceChildren();
    return settings;
}

/** The Settings dialog Save contract: every field the learner moved is declared. */
export async function dialogSave(patch: Partial<ReaderSettings>): Promise<void> {
    const previous = await loadSettings();
    const next = { ...previous, ...patch } as ReaderSettings;
    await saveSettings(next, {
        persistPreferredJapaneseSiteLanguage: previous.preferJapaneseSiteLanguage !== next.preferJapaneseSiteLanguage,
        explicitUserChoiceKeys: changedSettingsKeys(previous, next),
    });
}

/** A declared single-control write such as the rail's language switch. */
export async function controlSave(patch: Partial<ReaderSettings>): Promise<void> {
    const previous = await loadSettings();
    await saveSettings({ ...previous, ...patch } as ReaderSettings, {
        explicitUserChoiceKeys: Object.keys(patch) as (keyof ReaderSettings)[],
    });
}

/** ReaderApp's undeclared writes, e.g. setApiGradingProvider after a review. */
export async function machineSave(patch: Partial<ReaderSettings>): Promise<void> {
    const previous = await loadSettings();
    await saveSettings({ ...previous, ...patch } as ReaderSettings, { explicitUserChoiceKeys: NO_EXPLICIT_USER_CHOICE });
}

/** What v1.9.3 showed after a reload: the recorded outcome v2 must match. */
export async function visibleAfterReload(): Promise<Record<string, unknown>> {
    const settings = await loadSettings();
    return {
        settings: pick(settings, VISIBLE_SETTINGS_KEYS),
        targetLanguage: activeTargetLanguage(settings),
        onboardingShown: !(settings.onboardingSeen && settings.learningTargetChosen),
    };
}

function activeTargetLanguage(settings: ReaderSettings): string | null {
    const profiles = (settings as { languageProfiles?: Array<{ id?: string; targetLanguage?: string }> }).languageProfiles ?? [];
    return profiles.find(profile => profile.id === settings.activeLanguageProfileId)?.targetLanguage ?? null;
}

/** The corpus dictionary as the ZIP a learner imports (v1.9.3's own ZIP fixture writer). */
export function corpusDictionaryFile(): File {
    return new File([yomitanZipBlob({
        'index.json': { title: CORPUS_DICTIONARY_TITLE, format: 3, revision: 'corpus-1' },
        'term_bank_1.json': CORPUS_DICTIONARY_TERMS,
    })], 'yomu-upgrade-corpus-mini.zip', { type: 'application/zip' });
}
