import type { YomitanDictionaryStore } from './yomitan';
import type { InterfaceLanguage } from '../app/types';
import { yomuLocalDictionaries } from '../companions/registry';

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
    if (companion) return new companion.YomitanDictionaryStore(getCorsProxyUrl, getInterfaceLanguage);
    return inertLocalDictionaryStore();
}

// Derived, never declared: `keyof` over a class type is exactly its public
// surface, so the fallback covers the store by construction. A hand-written
// list of the methods "reachable from core" is how this contract rots — the
// list is written where the store is not, so adding a public store method
// (1.8.79 added lookupExactTermCandidates) leaves the fallback one method
// short and the gap only surfaces as a TypeError on the first companion-less
// call. Derived, the same mistake is a typecheck failure.
type InertLocalDictionaryStore = Pick<YomitanDictionaryStore, keyof YomitanDictionaryStore>;

function inertLocalDictionaryStore(): YomitanDictionaryStore {
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
    } satisfies InertLocalDictionaryStore;
    // satisfies pins the structural contract; the cast is still required
    // because the class's private members block a direct assign.
    return inert as unknown as YomitanDictionaryStore;
}

function companionMissingError(): Error {
    return new Error('Local dictionaries unavailable: Yomu Settings Surface companion did not load.');
}
