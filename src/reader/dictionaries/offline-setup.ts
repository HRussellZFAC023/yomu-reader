import { Logger } from '../app/logger';
import {
    captureActiveLanguageProfileDictionaries,
    mergeDictionaryPreferences,
} from '../settings/dictionary';
import {
    findRecommendedDictionary,
    recommendedDictionariesForLearnerLanguage,
    recommendedDictionaryImportOptions,
    recommendedDictionaryInstalledIdentity,
    type RecommendedDictionary,
} from './recommended';
import type {
    DictionaryImportOptions,
    DictionarySummary,
    ImportSummary,
    YomitanDictionaryInfo,
} from './yomitan';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';
import type { ReaderSettings } from '../app/types';
import {
    activeLanguageProfile,
    slice1LanguageIdForTag,
} from '../languages';

const log = Logger.scope('OfflineDictionarySetup');

// Every language profile receives its frozen native-first starter set. Kanjium
// remains a shared pronunciation supplement because the Slice 1 manifests
// intentionally cover definition and kanji language, not pitch metadata.
const OFFLINE_PITCH_DICTIONARY_ID = 'kanjium-pitch';

export interface OfflineDictionarySetupStore {
    importFromUrl(
        url: string,
        filename?: string,
        onProgress?: (message: string) => void,
        options?: DictionaryImportOptions,
    ): Promise<ImportSummary>;
    summary(): Promise<DictionarySummary>;
}

export interface OfflineDictionarySetupOptions {
    dictionaries: OfflineDictionarySetupStore;
    getSettings: () => ReaderSettings;
    applySettings: (settings: ReaderSettings) => Promise<void> | void;
    onProgress?: (message: string) => void;
}

export interface OfflineDictionarySetupResult {
    installed: string[];
    skipped: string[];
    failed: string[];
}

interface OfflineDictionarySetupPlan {
    missing: RecommendedDictionary[];
    installed: YomitanDictionaryInfo[];
}

export async function installOfflineParsingDictionaries(options: OfflineDictionarySetupOptions): Promise<OfflineDictionarySetupResult> {
    const result: OfflineDictionarySetupResult = { installed: [], skipped: [], failed: [] };
    const learnerLanguage = activeLearnerLanguage(options.getSettings());
    const plan = await offlineDictionarySetupPlan(
        options.dictionaries,
        learnerLanguage,
        result,
    );
    if (plan.installed.length) {
        await captureAlreadyInstalledStarters(options, plan.installed);
    }
    for (const target of plan.missing) {
        try {
            const importOptions = recommendedDictionaryImportOptions(target);
            const summary = importOptions
                ? await options.dictionaries.importFromUrl(target.downloadUrl!, undefined, options.onProgress, importOptions)
                : await options.dictionaries.importFromUrl(target.downloadUrl!, undefined, options.onProgress);
            const settings = options.getSettings();
            const dictionaryPreferences = mergeDictionaryPreferences(
                settings.dictionaryPreferences,
                summary.dictionaries,
                summary.dictionaryTypes ?? {},
                summary.replacedDictionaries ?? [],
            );
            await options.applySettings(captureActiveLanguageProfileDictionaries(
                { ...settings, localDictionariesEnabled: true },
                dictionaryPreferences,
            ));
            result.installed.push(target.name);
        } catch (error) {
            result.failed.push(target.name);
            log.warn('Offline dictionary install failed', { dictionary: target.name }, error);
        }
    }
    return result;
}

async function offlineDictionarySetupPlan(
    store: OfflineDictionarySetupStore,
    learnerLanguage: Parameters<typeof recommendedDictionariesForLearnerLanguage>[0],
    result: OfflineDictionarySetupResult,
): Promise<OfflineDictionarySetupPlan> {
    const targets = [
        ...recommendedDictionariesForLearnerLanguage(learnerLanguage),
        findRecommendedDictionary(OFFLINE_PITCH_DICTIONARY_ID),
    ]
        .filter((dictionary): dictionary is RecommendedDictionary => Boolean(dictionary?.downloadUrl));
    const installedDictionaries = await store.summary()
        .then(summary => summary.dictionaries)
        .catch(() => []);
    const missing: RecommendedDictionary[] = [];
    const installed: YomitanDictionaryInfo[] = [];
    for (const target of targets) {
        const match = installedDictionaries.find(info =>
            canonicalDownloadUrl(info.downloadUrl ?? '') === canonicalDownloadUrl(target.downloadUrl!)
            || yomitanDictionaryIdentity(info.title) === recommendedDictionaryInstalledIdentity(target));
        if (!match) {
            missing.push(target);
            continue;
        }
        result.skipped.push(target.name);
        installed.push(match);
    }
    return { missing, installed };
}

async function captureAlreadyInstalledStarters(
    options: OfflineDictionarySetupOptions,
    installed: YomitanDictionaryInfo[],
): Promise<void> {
    const settings = options.getSettings();
    const active = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    const profileInstalledIdentities = new Set(
        active?.dictionaries.installed.map(yomitanDictionaryIdentity) ?? [],
    );
    const newlyAddedNames = new Set(installed
        .filter(info => !profileInstalledIdentities.has(yomitanDictionaryIdentity(info.title)))
        .map(info => info.title));
    let dictionaryPreferences = mergeDictionaryPreferences(
        settings.dictionaryPreferences,
        installed.map(info => info.title),
        Object.fromEntries(installed.map(info => [info.title, info.type])),
    );
    // A dictionary installed for another profile is disabled by normalization
    // in a new profile. Offline setup is explicitly adding this starter here,
    // so enable it unless this profile already recorded (and disabled) it.
    dictionaryPreferences = dictionaryPreferences.map(preference => newlyAddedNames.has(preference.name)
        ? { ...preference, enabled: true }
        : preference);
    await options.applySettings(captureActiveLanguageProfileDictionaries(
        { ...settings, localDictionariesEnabled: true },
        dictionaryPreferences,
    ));
}

function canonicalDownloadUrl(value: string): string {
    if (!value) return '';
    try {
        return new URL(value).href;
    } catch {
        return value.trim();
    }
}

function activeLearnerLanguage(
    settings: ReaderSettings,
): Parameters<typeof recommendedDictionariesForLearnerLanguage>[0] {
    const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
    return slice1LanguageIdForTag(profile?.learnerLanguage) ?? 'en';
}
