import { Logger } from '../app/logger';
import { mergeDictionaryPreferences } from '../settings/dictionary';
import { findRecommendedDictionary, type RecommendedDictionary } from './recommended';
import type { DictionarySummary, ImportSummary } from './yomitan';
import type { ReaderSettings } from '../app/types';

const log = Logger.scope('OfflineDictionarySetup');

// Terms + pitch cover default local parsing: Jitendex feeds segmentation,
// definitions, and furigana; Kanjium feeds pitch patterns and colors.
export const OFFLINE_PARSING_DICTIONARY_IDS = ['jitendex', 'kanjium-pitch'] as const;

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
            await persistOfflineDictionaryImport(summary, options);
            result.installed.push(target.name);
            log.info('Offline dictionary installed', { dictionary: target.name, entries: summary.entries });
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
    const installedUrls = await installedDictionaryDownloadUrls(store);
    const hasTerms = typeof store.hasTermDictionaries === 'function'
        ? await store.hasTermDictionaries().catch(() => false)
        : false;
    const missing: RecommendedDictionary[] = [];
    for (const target of targets) {
        const alreadyInstalled = installedUrls.has(target.downloadUrl!)
            || (target.category === 'terms' && hasTerms);
        if (alreadyInstalled) result.skipped.push(target.name);
        else missing.push(target);
    }
    return missing;
}

async function installedDictionaryDownloadUrls(store: OfflineDictionarySetupStore): Promise<Set<string>> {
    try {
        const summary = await store.summary();
        return new Set(summary.dictionaries.map(info => info.downloadUrl ?? '').filter(Boolean));
    } catch (error) {
        log.warn('Installed dictionary summary failed; assuming none installed', { error });
        return new Set();
    }
}

async function persistOfflineDictionaryImport(summary: ImportSummary, options: OfflineDictionarySetupOptions): Promise<void> {
    const settings = options.getSettings();
    await options.applySettings({
        ...settings,
        dictionaryPreferences: mergeDictionaryPreferences(settings.dictionaryPreferences, summary.dictionaries, summary.dictionaryTypes ?? {}),
        localDictionariesEnabled: true,
    });
}
