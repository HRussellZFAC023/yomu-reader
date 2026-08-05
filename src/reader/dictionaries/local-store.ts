import type { YomitanDictionaryStore } from './yomitan';
import type { InterfaceLanguage } from '../app/types';
import { yomuLocalDictionaries } from '../companions/registry';
import { extensionDictionaryStoreProxy } from './extension-store-client';

// Derived, never declared: `keyof` over a class type is exactly its public
// surface, so both the inert fallback and the extension Proxy cover the store
// by construction. A list written elsewhere rots: adding a public method then
// surfaces as a hot-path TypeError instead of a typecheck failure.
export type LocalDictionaryStore = Pick<YomitanDictionaryStore, keyof YomitanDictionaryStore>;

// The local-dictionary store implementation ships in the settings-surface
// companion (ADR-0003) to keep the core userscript under the Greasy Fork size
// limit. Without the companion there are no local dictionaries: lookups are
// empty and imports fail loudly, so parsing falls through to the network
// providers instead of breaking.
export function createLocalDictionaryStore(
    getCorsProxyUrl: () => string,
    getInterfaceLanguage: () => InterfaceLanguage,
): YomitanDictionaryStore {
    const companion = yomuLocalDictionaries();
    const direct = companion
        ? new companion.YomitanDictionaryStore(getCorsProxyUrl, getInterfaceLanguage)
        : inertLocalDictionaryStore();
    return extensionDictionaryStoreProxy(direct) as YomitanDictionaryStore;
}

function inertLocalDictionaryStore(): LocalDictionaryStore {
    const inert = {
        lookup: async () => [],
        searchTerms: async () => [],
        lookupKanji: async () => [],
        listKanjiCharacters: async () => [],
        lookupTermMeta: async () => [],
        lookupSimilarTermsByKanji: async () => [],
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
    // satisfies pins the structural contract; the cast is still required
    // because the class's private members block a direct assign.
    return inert as unknown as LocalDictionaryStore;
}

function companionMissingError(): Error {
    return new Error('Local dictionaries unavailable: Yomu Settings Surface companion did not load.');
}
