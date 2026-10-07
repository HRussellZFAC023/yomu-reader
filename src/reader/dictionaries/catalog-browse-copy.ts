import type { DictionaryCategory } from './catalog';

/**
 * Chrome for the "everything else the mirror hosts" panel, in English. The
 * Japanese interface reads the same strings from the main copy catalogue.
 */
export interface CatalogBrowseCopy {
    readonly title: string;
    /** Carries {count} and {size}. */
    readonly summary: string;
    readonly searchLabel: string;
    readonly noResults: string;
    readonly categories: Readonly<Record<DictionaryCategory, string>>;
}

/** Positional order of the `categories` tuple below. */
export const CATALOG_BROWSE_CATEGORY_ORDER = [
    'terms',
    'names',
    'grammar',
    'kanji',
    'frequency',
    'pronunciation',
    'examples',
    'thesaurus',
    'encyclopedia',
    'utility',
] as const satisfies readonly DictionaryCategory[];

const ENGLISH_CATEGORY_NAMES = ['Term dictionaries', 'Name dictionaries', 'Grammar dictionaries', 'Kanji dictionaries', 'Frequency dictionaries', 'Pronunciation dictionaries', 'Example sentence dictionaries', 'Thesauruses', 'Encyclopedias', 'Utility dictionaries'] as const;

const ENGLISH_CATALOG_BROWSE_COPY: CatalogBrowseCopy = Object.freeze({
    title: 'All mirrored dictionaries',
    summary: '{count} more dictionaries · {size} total',
    searchLabel: 'Search dictionaries',
    noResults: 'No dictionaries match your search.',
    categories: Object.freeze(Object.fromEntries(
        CATALOG_BROWSE_CATEGORY_ORDER.map((category, index) => [category, ENGLISH_CATEGORY_NAMES[index]]),
    ) as Record<DictionaryCategory, string>),
});

export function catalogBrowseCopy(_language?: string): CatalogBrowseCopy {
    return ENGLISH_CATALOG_BROWSE_COPY;
}
