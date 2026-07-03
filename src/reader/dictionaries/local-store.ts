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

// Every store method reachable from core (or shared surfaces the store
// instance flows into) must appear here so a missing companion degrades to
// empty results instead of a TypeError.
type InertLocalDictionaryStore = Pick<
    YomitanDictionaryStore,
    | 'lookup'
    | 'searchTerms'
    | 'lookupKanji'
    | 'lookupTermMeta'
    | 'findTermMatches'
    | 'listRandomTerms'
    | 'listRandomTopTerms'
    | 'hasDictionaries'
    | 'hasTermDictionaries'
    | 'prepareTermSearchIndex'
    | 'summary'
    | 'dictionaryStyleCss'
    | 'exportJson'
    | 'importFile'
    | 'importFromUrl'
    | 'deleteDictionary'
    | 'deleteDatabase'
    | 'invalidateForFactoryReset'
>;

function inertLocalDictionaryStore(): YomitanDictionaryStore {
    const inert = {
        lookup: async () => [],
        searchTerms: async () => [],
        lookupKanji: async () => [],
        lookupTermMeta: async () => [],
        findTermMatches: async () => [],
        listRandomTerms: async () => [],
        listRandomTopTerms: async () => [],
        hasDictionaries: async () => false,
        hasTermDictionaries: async () => false,
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
        deleteDictionary: async () => undefined,
        deleteDatabase: async () => undefined,
        invalidateForFactoryReset: async () => undefined,
    } satisfies InertLocalDictionaryStore;
    // satisfies pins the structural contract; the cast is still required
    // because the class's private members block a direct assign.
    return inert as unknown as YomitanDictionaryStore;
}

function companionMissingError(): Error {
    return new Error('Local dictionaries unavailable: Yomu Settings Surface companion did not load.');
}
