import type { DictionaryPreference, InterfaceLanguage } from '../app/types';
import type { LearningTargetModule } from '../languages/types';
import type {
    DictionaryImportOptions,
    DictionarySummary,
    GlossaryCursorSearchOptions,
    ImportSummary,
    RandomTopTermOptions,
    TermSearchOptions,
    YomitanExactTermCandidateMatch,
    YomitanExactTermCandidateRequest,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanTermEntry,
    YomitanTermMatch,
} from './yomitan/types';
import { yomuLocalDictionaries } from '../companions/registry';
import { extensionDictionaryStoreProxy } from './extension-store-client';

/**
 * Everything a surface may ask of imported dictionaries, whichever Dictionary
 * Engine answers it (ADR-0022). Declared rather than derived from an engine
 * class: the engine `implements` it and the inert store `satisfies` it, so a
 * method either one lacks is a typecheck failure, and callers hold this
 * interface, never an engine's own class. The extension client's method table,
 * DICTIONARY_STORE_METHODS, is checked against it the same way, so a method
 * added here fails the typecheck until it is classified for the Port (ADR-0010,
 * ADR-0023).
 */
export interface LocalDictionaryStore {
    lookup(expression: string, reading: string, limit: number, preferences?: DictionaryPreference[]): Promise<YomitanTermEntry[]>;
    searchTerms(query: string, limit: number, preferences?: DictionaryPreference[], options?: TermSearchOptions): Promise<YomitanTermEntry[]>;
    lookupKanji(text: string, limit: number, preferences?: DictionaryPreference[]): Promise<YomitanKanjiEntry[]>;
    listKanjiCharacters(limit: number, preferences?: DictionaryPreference[]): Promise<string[]>;
    lookupTermMeta(expression: string, limit: number, preferences?: DictionaryPreference[]): Promise<YomitanMetaEntry[]>;
    findTermMatches(
        text: string,
        limit?: number,
        preferences?: DictionaryPreference[],
        target?: LearningTargetModule,
    ): Promise<YomitanTermMatch[]>;
    lookupExactTermCandidates<TRequest extends YomitanExactTermCandidateRequest>(
        requests: readonly TRequest[],
        preferences?: DictionaryPreference[],
        target?: LearningTargetModule,
    ): Promise<Array<YomitanExactTermCandidateMatch<TRequest>>>;
    listRandomTerms(limit: number, preferences?: DictionaryPreference[], options?: GlossaryCursorSearchOptions): Promise<YomitanTermEntry[]>;
    listRandomTopTerms(limit: number, maxRank: number, preferences?: DictionaryPreference[], options?: RandomTopTermOptions): Promise<YomitanTermEntry[]>;
    hasDictionaries(): Promise<boolean>;
    hasTermDictionaries(): Promise<boolean>;
    hasPitchMetaDictionaries(): Promise<boolean>;
    prepareTermSearchIndex(): Promise<void>;
    summary(): Promise<DictionarySummary>;
    dictionaryStyleCss(preferences?: DictionaryPreference[]): Promise<string>;
    exportJson(): Promise<Blob>;
    importFile(file: File, onProgress?: (message: string) => void, sourceUrl?: string, options?: DictionaryImportOptions): Promise<ImportSummary>;
    importFromUrl(url: string, filename?: string, onProgress?: (message: string) => void, options?: DictionaryImportOptions): Promise<ImportSummary>;
    importZip(file: File, onProgress?: (message: string) => void, sourceUrl?: string, options?: DictionaryImportOptions): Promise<ImportSummary>;
    importJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary>;
    importDexieJson(file: File, onProgress?: (message: string) => void): Promise<ImportSummary>;
    clear(): Promise<void>;
    deleteDictionary(dictionary: string): Promise<void>;
    deleteDatabase(options?: { timeoutMs?: number; completedResetId?: string }): Promise<void>;
    invalidateCaches(): void;
    invalidateForFactoryReset(): Promise<void>;
}

// The Reader's store. The Dictionary Engine ships in the settings-surface
// companion (ADR-0003) to keep the core userscript under the Greasy Fork size
// limit, so core asks the companion for the one factory,
// createLocalDictionaryStore, instead of importing it. Without the companion
// there are no local dictionaries: lookups are empty and imports fail loudly, so
// parsing falls through to the network providers instead of breaking. In an
// extension content script the store answers from the background (ADR-0010).
export function createReaderDictionaryStore(
    getCorsProxyUrl: () => string,
    getInterfaceLanguage: () => InterfaceLanguage,
): LocalDictionaryStore {
    const companion = yomuLocalDictionaries();
    const direct = companion
        ? companion.createLocalDictionaryStore(getCorsProxyUrl, getInterfaceLanguage)
        : inertLocalDictionaryStore();
    // Only the extension build has a Shared Dictionary Host (ADR-0010), so the
    // userscript build keeps its origin store and drops the transport. The
    // proxy itself is transport-inert; capability discovery begins only when
    // target-owned runtime work invokes a dictionary operation.
    return typeof __YOMU_EXTENSION_BUILD__ === 'boolean' && __YOMU_EXTENSION_BUILD__
        ? extensionDictionaryStoreProxy(direct)
        : direct;
}

/**
 * How many reads a caller keeps in flight against a store. The extension
 * store client marks itself `coalescesReads`: it sends a macrotask's reads as
 * one Read Batch and bounds their IndexedDB fan-out in its host (ADR-0023), so
 * a caller's own lane would only split one page into many round trips. A
 * store in the caller's realm keeps the caller's limit.
 */
export function dictionaryReadConcurrency(store: LocalDictionaryStore, ownRealmLimit: number): number {
    return (store as { coalescesReads?: unknown }).coalescesReads === true ? Infinity : ownRealmLimit;
}

function inertLocalDictionaryStore(): LocalDictionaryStore {
    return {
        lookup: async () => [],
        searchTerms: async () => [],
        lookupKanji: async () => [],
        listKanjiCharacters: async () => [],
        lookupTermMeta: async () => [],
        findTermMatches: async () => [],
        lookupExactTermCandidates: async () => [],
        listRandomTerms: async () => [],
        listRandomTopTerms: async () => [],
        hasDictionaries: async () => false,
        hasTermDictionaries: async () => false,
        hasPitchMetaDictionaries: async () => false,
        prepareTermSearchIndex: async () => undefined,
        summary: async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 }),
        dictionaryStyleCss: async () => '',
        exportJson: async () => {
            throw companionMissingError();
        },
        importFile: async () => {
            throw companionMissingError();
        },
        importFromUrl: async () => {
            throw companionMissingError();
        },
        importZip: async () => {
            throw companionMissingError();
        },
        importJson: async () => {
            throw companionMissingError();
        },
        importDexieJson: async () => {
            throw companionMissingError();
        },
        clear: async () => undefined,
        deleteDictionary: async () => undefined,
        deleteDatabase: async () => undefined,
        invalidateCaches: () => undefined,
        invalidateForFactoryReset: async () => undefined,
    } satisfies LocalDictionaryStore;
}

function companionMissingError(): Error {
    return new Error('Local dictionaries unavailable: Yomu Settings Surface companion did not load.');
}
