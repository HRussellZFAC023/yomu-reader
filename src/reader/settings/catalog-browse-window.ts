import { uiText } from '../app/i18n';
import type { DictionaryCategory } from '../dictionaries/catalog';
import {
    catalogBrowseDescription,
    headwordLanguageEndonym,
    headwordLanguageName,
    type CatalogBrowseLanguageSection,
} from '../dictionaries/catalog-browse';
import { catalogBrowseCopy } from '../dictionaries/catalog-browse-copy';
import type { RecommendedDictionary } from '../dictionaries/recommended';
import type { LearningTargetRosterId } from '../languages';
import { learnerLanguageById, type LearnerLanguageId } from '../locales';

export const CATALOG_BROWSE_PAGE_SIZE = 40;

export const CATALOG_BROWSE_CATEGORY_TEXT_KEYS = {
    terms: 'termDictionaries',
    names: 'nameDictionaries',
    grammar: 'grammarDictionaries',
    kanji: 'kanjiDictionaries',
    frequency: 'frequencyDictionaries',
    pronunciation: 'pronunciationDictionaries',
    examples: 'exampleDictionaries',
    thesaurus: 'thesaurusDictionaries',
    encyclopedia: 'encyclopediaDictionaries',
    utility: 'utilityDictionaries',
} as const satisfies Readonly<Record<DictionaryCategory, Parameters<typeof uiText>[1]>>;

export interface CatalogBrowseWindow {
    readonly sections: readonly CatalogBrowseLanguageSection[];
    readonly matchingCount: number;
    readonly offset: number;
    readonly first: number;
    readonly last: number;
    readonly hasPrevious: boolean;
    readonly hasNext: boolean;
}

export interface CatalogBrowseIndex {
    readonly total: number;
    select(query: string, offset?: number): CatalogBrowseWindow;
}

interface CachedCatalogBrowseIndex {
    readonly profile: string;
    readonly index: CatalogBrowseIndex;
}

let cachedCatalogBrowseIndex: CachedCatalogBrowseIndex | undefined;

interface IndexedCatalogDictionary {
    readonly sectionIndex: number;
    readonly groupIndex: number;
    readonly dictionary: RecommendedDictionary;
    readonly searchText: string;
}

/**
 * Builds the catalogue's search model once. DOM sessions keep this index while
 * the learner types or pages, so neither normalization nor lookup reads the
 * rendered cards.
 */
function createCatalogBrowseIndex(
    sections: readonly CatalogBrowseLanguageSection[],
    learnerLanguage: LearnerLanguageId,
): CatalogBrowseIndex {
    const entries = indexCatalogDictionaries(sections, learnerLanguage);
    return {
        total: entries.length,
        select: (query, offset = 0) => selectCatalogBrowseWindow(sections, entries, query, offset),
    };
}

/** Reuses the immutable catalogue index across collapsed search and expansion. */
export function catalogBrowseIndexForLanguageProfile(
    sections: readonly CatalogBrowseLanguageSection[],
    learnerLanguage: LearnerLanguageId,
    targetLanguage: LearningTargetRosterId,
): CatalogBrowseIndex {
    const profile = `${learnerLanguage}:${targetLanguage}`;
    if (cachedCatalogBrowseIndex?.profile === profile) return cachedCatalogBrowseIndex.index;
    const index = createCatalogBrowseIndex(sections, learnerLanguage);
    cachedCatalogBrowseIndex = { profile, index };
    return index;
}

export function normalizeSearchQuery(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function indexCatalogDictionaries(
    sections: readonly CatalogBrowseLanguageSection[],
    learnerLanguage: LearnerLanguageId,
): readonly IndexedCatalogDictionary[] {
    return sections.flatMap((section, sectionIndex) => section.groups.flatMap((group, groupIndex) =>
        group.dictionaries.map(dictionary => ({
            sectionIndex,
            groupIndex,
            dictionary,
            searchText: catalogDictionarySearchText(section, group.category, dictionary, learnerLanguage),
        }))));
}

function catalogDictionarySearchText(
    section: CatalogBrowseLanguageSection,
    category: DictionaryCategory,
    dictionary: RecommendedDictionary,
    learnerLanguage: LearnerLanguageId,
): string {
    const learnerLocale = learnerLanguageById(learnerLanguage).runtimeLocale;
    return normalizeSearchQuery([
        dictionary.name,
        dictionary.catalogDictionaryId ?? '',
        dictionary.definitionLanguage ?? '',
        headwordLanguageName(section.headwordLanguage, learnerLocale),
        headwordLanguageName(section.headwordLanguage, 'en'),
        headwordLanguageName(section.headwordLanguage, 'ja'),
        headwordLanguageEndonym(section.headwordLanguage),
        section.headwordLanguage,
        catalogBrowseCopy(learnerLanguage).categories[category],
        uiText('en', CATALOG_BROWSE_CATEGORY_TEXT_KEYS[category]),
        uiText('ja', CATALOG_BROWSE_CATEGORY_TEXT_KEYS[category]),
        catalogBrowseDescription(dictionary, learnerLocale),
        catalogBrowseDescription(dictionary, 'en'),
        catalogBrowseDescription(dictionary, 'ja'),
    ].join(' '));
}

function selectCatalogBrowseWindow(
    sections: readonly CatalogBrowseLanguageSection[],
    entries: readonly IndexedCatalogDictionary[],
    query: string,
    requestedOffset: number,
): CatalogBrowseWindow {
    const normalized = normalizeSearchQuery(query);
    const matches = normalized ? entries.filter(entry => entry.searchText.includes(normalized)) : entries;
    const offset = boundedWindowOffset(requestedOffset, matches.length);
    const visible = matches.slice(offset, offset + CATALOG_BROWSE_PAGE_SIZE);
    return {
        sections: groupVisibleCatalogDictionaries(sections, visible),
        matchingCount: matches.length,
        offset,
        first: visible.length ? offset + 1 : 0,
        last: offset + visible.length,
        hasPrevious: offset > 0,
        hasNext: offset + visible.length < matches.length,
    };
}

function boundedWindowOffset(requestedOffset: number, matchingCount: number): number {
    if (!matchingCount || !Number.isFinite(requestedOffset)) return 0;
    const pageOffset = Math.max(0, Math.floor(requestedOffset / CATALOG_BROWSE_PAGE_SIZE) * CATALOG_BROWSE_PAGE_SIZE);
    const lastOffset = Math.floor((matchingCount - 1) / CATALOG_BROWSE_PAGE_SIZE) * CATALOG_BROWSE_PAGE_SIZE;
    return Math.min(pageOffset, lastOffset);
}

function groupVisibleCatalogDictionaries(
    sections: readonly CatalogBrowseLanguageSection[],
    entries: readonly IndexedCatalogDictionary[],
): readonly CatalogBrowseLanguageSection[] {
    const byGroup = new Map<string, RecommendedDictionary[]>();
    for (const entry of entries) {
        const key = `${entry.sectionIndex}:${entry.groupIndex}`;
        const dictionaries = byGroup.get(key);
        if (dictionaries) dictionaries.push(entry.dictionary);
        else byGroup.set(key, [entry.dictionary]);
    }
    return sections.flatMap((section, sectionIndex) => {
        const groups = section.groups.flatMap((group, groupIndex) => {
            const dictionaries = byGroup.get(`${sectionIndex}:${groupIndex}`);
            return dictionaries?.length ? [{ ...group, dictionaries }] : [];
        });
        return groups.length ? [{ ...section, groups }] : [];
    });
}
