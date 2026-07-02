import { Logger } from '../app/logger';
import { mergeDictionaryPreferences } from '../settings/dictionary';
import { findRecommendedDictionary, type RecommendedDictionary } from './recommended';
import type { DictionarySummary, ImportSummary } from './yomitan';
import type { ReaderSettings } from '../app/types';

const log = Logger.scope('OfflineDictionarySetup');

// Jitendex feeds segmentation and furigana; Kanjium feeds pitch.
const OFFLINE_PARSING_DICTIONARY_IDS = ['jitendex', 'kanjium-pitch'] as const;

export interface OfflineDictionarySetupStore {
    importFromUrl(url: string, filename?: string, onProgress?: (message: string) => void): Promise<ImportSummary>;
    summary(): Promise<DictionarySummary>;
    hasTermDictionaries?(): Promise<boolean>;
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

export async function installOfflineParsingDictionaries(options: OfflineDictionarySetupOptions): Promise<OfflineDictionarySetupResult> {
    const result: OfflineDictionarySetupResult = { installed: [], skipped: [], failed: [] };
    for (const target of await missingOfflineSetupDictionaries(options.dictionaries, result)) {
        try {
            const summary = await options.dictionaries.importFromUrl(target.downloadUrl!, undefined, options.onProgress);
            const settings = options.getSettings();
            await options.applySettings({
                ...settings,
                dictionaryPreferences: mergeDictionaryPreferences(settings.dictionaryPreferences, summary.dictionaries, summary.dictionaryTypes ?? {}),
                localDictionariesEnabled: true,
            });
            result.installed.push(target.name);
        } catch (error) {
            result.failed.push(target.name);
            log.warn('Offline dictionary install failed', { dictionary: target.name }, error);
        }
    }
    return result;
}

async function missingOfflineSetupDictionaries(store: OfflineDictionarySetupStore, result: OfflineDictionarySetupResult): Promise<RecommendedDictionary[]> {
    const targets = OFFLINE_PARSING_DICTIONARY_IDS
        .map(id => findRecommendedDictionary(id))
        .filter((dictionary): dictionary is RecommendedDictionary => Boolean(dictionary?.downloadUrl));
    const installedUrls = await store.summary()
        .then(summary => new Set(summary.dictionaries.map(info => info.downloadUrl ?? '').filter(Boolean)))
        .catch(() => new Set<string>());
    const hasTerms = await store.hasTermDictionaries?.().catch(() => false) ?? false;
    const missing: RecommendedDictionary[] = [];
    for (const target of targets) {
        if (installedUrls.has(target.downloadUrl!) || (target.category === 'terms' && hasTerms)) result.skipped.push(target.name);
        else missing.push(target);
    }
    return missing;
}
