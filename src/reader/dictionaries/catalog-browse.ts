import {
    FROZEN_DICTIONARY_CATALOG,
    dictionaryEntryDownload,
    type DictionaryCatalogEntry,
    type DictionaryCatalogManifest,
    type DictionaryCategory,
} from './catalog';
import type { RecommendedDictionary, RecommendedDictionaryCategory } from './recommended';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';
import { languageDisplayName } from '../languages/locale';

/**
 * Every archive Yomu mirrors is installable from Settings, not only the small
 * per-language recommendation seed. The seed answers "what should I install?";
 * this module answers "what else is there?" from the same frozen catalogue, so
 * neither list is a hand-maintained copy of the mirror.
 */

export interface CatalogBrowseGroup {
    category: DictionaryCategory;
    dictionaries: readonly RecommendedDictionary[];
}

/**
 * One shelf of the browse panel: every catalogued dictionary whose *headwords*
 * are written in `headwordLanguage`, split into the usual category groups.
 *
 * The catalogue carries Mandarin, Cantonese and Literary Chinese archives
 * beside the Japanese ones, and Wiktionary-derived sets for languages nothing
 * has been mirrored for at all. Keying panel membership to the catalogue's
 * target language hid all of those behind a URL nobody has, so they are shelved
 * by their own language instead of dropped — reachable, but never mixed into
 * the shelf the reader is actually studying.
 */
export interface CatalogBrowseLanguageSection {
    headwordLanguage: string;
    /** True for the one shelf that matches what this catalogue is built to read. */
    isTargetLanguage: boolean;
    groups: readonly CatalogBrowseGroup[];
}

export interface CatalogBrowseOptions {
    /** Definition languages matching the learner sort first inside each group. */
    learnerLanguage?: string;
    /** Catalogue IDs already rendered elsewhere (the recommendation seed). */
    excludeCatalogIds?: ReadonlySet<string>;
}

const CATEGORY_ORDER: readonly DictionaryCategory[] = [
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
];

const UI_CATEGORY_BY_CATALOG_CATEGORY: Readonly<Record<DictionaryCategory, RecommendedDictionaryCategory>> = {
    terms: 'terms',
    names: 'terms',
    grammar: 'terms',
    kanji: 'kanji',
    frequency: 'frequency',
    pronunciation: 'pitch',
    examples: 'terms',
    thesaurus: 'terms',
    encyclopedia: 'terms',
    utility: 'terms',
};

export function catalogBrowseCardId(headwordLanguage: string, catalogDictionaryId: string): string {
    return `mirror-${headwordLanguage}-${catalogDictionaryId}`;
}

/**
 * Every mirrored archive, in shelf order: the reader's target language first,
 * then the other headword languages the mirror carries.
 */
export function catalogBrowseDictionaries(
    catalog: DictionaryCatalogManifest = FROZEN_DICTIONARY_CATALOG,
): readonly RecommendedDictionary[] {
    return catalog === FROZEN_DICTIONARY_CATALOG
        ? FROZEN_CATALOG_BROWSE_DICTIONARIES
        : catalogBrowseShelves(catalog).flatMap(shelf => shelf.dictionaries);
}

/**
 * Category groups for one headword language. Defaults to the catalogue's target
 * language so callers that only care about the studied language keep reading
 * exactly the shelf they used to get.
 */
export function catalogBrowseGroups(
    options: CatalogBrowseOptions = {},
    catalog: DictionaryCatalogManifest = FROZEN_DICTIONARY_CATALOG,
    headwordLanguage: string = catalog.targetLanguage,
): readonly CatalogBrowseGroup[] {
    const shelf = catalogBrowseShelves(catalog).find(candidate => candidate.language === headwordLanguage);
    return shelf ? groupShelfByCategory(shelf, options) : [];
}

/**
 * The whole panel: one section per headword language, target language first.
 * A section with nothing left to show (its entire shelf is already rendered as
 * the recommendation seed) is dropped rather than left as a bare heading.
 */
export function catalogBrowseLanguageSections(
    options: CatalogBrowseOptions = {},
    catalog: DictionaryCatalogManifest = FROZEN_DICTIONARY_CATALOG,
): readonly CatalogBrowseLanguageSection[] {
    return catalogBrowseShelves(catalog).flatMap(shelf => {
        const groups = groupShelfByCategory(shelf, options);
        if (!groups.length) return [];
        return [{
            headwordLanguage: shelf.language,
            isTargetLanguage: shelf.language === catalog.targetLanguage,
            groups,
        }];
    });
}

export function catalogBrowseSectionGroups(
    sections: readonly CatalogBrowseLanguageSection[],
): readonly CatalogBrowseGroup[] {
    return sections.flatMap(section => section.groups);
}

export function catalogBrowseTotalBytes(groups: readonly CatalogBrowseGroup[]): number {
    return groups.reduce(
        (total, group) => group.dictionaries.reduce((sum, dictionary) => sum + (dictionary.bytes ?? 0), total),
        0,
    );
}

/**
 * Endonyms for the headword languages the catalogue carries.
 *
 * ICU knows 'ja', 'zh', 'yue' and every living language in the Wiktionary-
 * derived shelves in practically every locale, but hands back the bare tag for
 * 'lzh' in several, and a heading reading "lzh" is not chrome any reader can
 * use. Falling back to the language's own name keeps the shelf readable without
 * dropping 31 learner languages into English. Only the tags ICU is weak on need
 * a row here.
 */
const HEADWORD_LANGUAGE_ENDONYMS: Readonly<Record<string, string>> = Object.freeze({
    ja: '日本語',
    zh: '中文',
    yue: '粵語',
    lzh: '文言',
});

export function headwordLanguageEndonym(language: string): string {
    return HEADWORD_LANGUAGE_ENDONYMS[language] ?? language;
}

/** The shelf heading: the language's name, in the language of the panel. */
export function headwordLanguageName(language: string, locale = 'en'): string {
    const display = languageDisplayName(language, locale);
    return display === language ? headwordLanguageEndonym(language) : display;
}

export function formatDictionaryBytes(bytes: number, locale = 'en'): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const gigabytes = bytes / 1024 ** 3;
    const megabytes = bytes / 1024 ** 2;
    const [value, unit] = gigabytes >= 1
        ? [gigabytes, 'GB']
        : megabytes >= 1
            ? [megabytes, 'MB']
            : [bytes / 1024, 'KB'];
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

interface CatalogBrowseShelf {
    language: string;
    dictionaries: readonly RecommendedDictionary[];
}

function catalogBrowseShelves(catalog: DictionaryCatalogManifest): readonly CatalogBrowseShelf[] {
    return catalog === FROZEN_DICTIONARY_CATALOG
        ? FROZEN_CATALOG_BROWSE_SHELVES
        : buildCatalogBrowseShelves(catalog);
}

function groupShelfByCategory(
    shelf: CatalogBrowseShelf,
    options: CatalogBrowseOptions,
): readonly CatalogBrowseGroup[] {
    const excluded = options.excludeCatalogIds;
    const byCategory = new Map<DictionaryCategory, RecommendedDictionary[]>();
    for (const dictionary of shelf.dictionaries) {
        if (excluded?.has(dictionary.catalogDictionaryId ?? '')) continue;
        const category = dictionary.catalogCategory ?? 'utility';
        const bucket = byCategory.get(category);
        if (bucket) bucket.push(dictionary);
        else byCategory.set(category, [dictionary]);
    }
    return CATEGORY_ORDER.flatMap(category => {
        const bucket = byCategory.get(category);
        if (!bucket?.length) return [];
        // A shelf ranks its own monolingual titles the way the Japanese shelf
        // ranks Japanese ones: the learner's language first, then the language
        // being read, then the English fallback.
        return [{ category, dictionaries: bucket.sort(compareForLearnerLanguage(options.learnerLanguage, shelf.language)) }];
    });
}

/**
 * Shelf order is the reader's target language, then the biggest remaining
 * collections. Ordering by card count rather than by name keeps the order
 * identical in all 32 interface locales, so a test or a screenshot means the
 * same thing everywhere.
 */
function buildCatalogBrowseShelves(catalog: DictionaryCatalogManifest): readonly CatalogBrowseShelf[] {
    const entriesByLanguage = new Map<string, DictionaryCatalogEntry[]>();
    for (const entry of catalog.entries) {
        for (const language of entry.headwordLanguages) {
            const bucket = entriesByLanguage.get(language);
            if (bucket) bucket.push(entry);
            else entriesByLanguage.set(language, [entry]);
        }
    }
    const shelves = [...entriesByLanguage].map(([language, entries]) => ({
        language,
        dictionaries: Object.freeze(
            dedupeByPublishedObject(entries)
                .map(entry => browseCard(catalog, language, entry))
                .sort(compareForLearnerLanguage(undefined, language)),
        ),
    }));
    const target = catalog.targetLanguage;
    return Object.freeze(shelves.sort((left, right) => {
        if ((left.language === target) !== (right.language === target)) return left.language === target ? -1 : 1;
        return right.dictionaries.length - left.dictionaries.length
            || left.language.localeCompare(right.language, 'en');
    }));
}

/**
 * The mirror keeps a starter-pack copy of archives that also live in the main
 * language collection. They are byte-identical, so one content hash must not
 * produce two Settings rows offering the same download twice.
 *
 * Deduplication is per shelf on purpose. One object is published under both a
 * Cantonese and a Mandarin catalogue entry; collapsing those globally would
 * make a dictionary vanish from one language's shelf entirely, which is the
 * unreachability this panel exists to stop.
 */
function dedupeByPublishedObject(entries: readonly DictionaryCatalogEntry[]): DictionaryCatalogEntry[] {
    const preferred = new Map<string, DictionaryCatalogEntry>();
    const unpublished: DictionaryCatalogEntry[] = [];
    for (const entry of entries) {
        if (entry.distribution.state !== 'published') {
            unpublished.push(entry);
            continue;
        }
        const sha256 = entry.distribution.object.sha256;
        const existing = preferred.get(sha256);
        if (!existing || preferDuplicate(entry, existing)) preferred.set(sha256, entry);
    }
    return [...preferred.values(), ...unpublished];
}

function preferDuplicate(candidate: DictionaryCatalogEntry, existing: DictionaryCatalogEntry): boolean {
    const candidateIsStarterPack = isStarterPackEntry(candidate);
    if (candidateIsStarterPack !== isStarterPackEntry(existing)) return !candidateIsStarterPack;
    return candidate.id < existing.id;
}

function isStarterPackEntry(entry: DictionaryCatalogEntry): boolean {
    return entry.source.catalogueSection === 'starter-pack' || entry.id.startsWith('drive-starter-pack-');
}

function browseCard(
    catalog: DictionaryCatalogManifest,
    headwordLanguage: string,
    entry: DictionaryCatalogEntry,
): RecommendedDictionary {
    const primaryCategory = primaryCatalogCategory(entry);
    const download = dictionaryEntryDownload(entry, catalog.objectsBaseUrl);
    return {
        id: catalogBrowseCardId(headwordLanguage, entry.id),
        headwordLanguage,
        category: UI_CATEGORY_BY_CATALOG_CATEGORY[primaryCategory],
        catalogCategory: primaryCategory,
        name: entry.title,
        description: describeMirroredDictionary(entry.definitionLanguages[0], download?.bytes),
        ...(download
            ? {
                  downloadUrl: download.url,
                  ...(download.sha256 === undefined ? {} : { sha256: download.sha256 }),
                  ...(download.bytes === undefined ? {} : { bytes: download.bytes }),
              }
            : {}),
        ...(entry.source.projectUrl ? { helpUrl: entry.source.projectUrl } : {}),
        origin: 'catalog',
        catalogDictionaryId: entry.id,
        selectedByDefault: false,
        definitionLanguage: entry.definitionLanguages[0],
        translationMode: 'off',
        installedDictionaryIdentity: yomitanDictionaryIdentity(entry.installedTitle ?? entry.title),
    };
}

function primaryCatalogCategory(entry: DictionaryCatalogEntry): DictionaryCategory {
    return entry.categories.find(category => CATEGORY_ORDER.includes(category)) ?? 'utility';
}

/**
 * The card sits under a localized category heading, so its own line only has to
 * answer "what language are the definitions in, and how big is the download?".
 * Both halves are locale-dependent, which is why Settings can rebuild the line
 * from the card instead of translating baked English.
 */
export function catalogBrowseDescription(dictionary: RecommendedDictionary, locale = 'en'): string {
    return describeMirroredDictionary(dictionary.definitionLanguage, dictionary.bytes, locale);
}

function describeMirroredDictionary(definitionLanguage: string | undefined, bytes: number | undefined, locale = 'en'): string {
    const language = definitionLanguage ? languageDisplayName(definitionLanguage, locale) : '';
    const size = bytes === undefined ? '' : formatDictionaryBytes(bytes, locale);
    return [language, size].filter(Boolean).join(' · ');
}

function compareForLearnerLanguage(learnerLanguage: string | undefined, targetLanguage: string) {
    return (left: RecommendedDictionary, right: RecommendedDictionary): number => {
        const rank = definitionLanguageRank(right, learnerLanguage, targetLanguage)
            - definitionLanguageRank(left, learnerLanguage, targetLanguage);
        if (rank !== 0) return rank;
        return left.name.localeCompare(right.name, 'en');
    };
}

/**
 * Native definitions rank above the target language's monolingual titles, which
 * in turn rank above the English fallback and anything else.
 */
function definitionLanguageRank(
    dictionary: RecommendedDictionary,
    learnerLanguage: string | undefined,
    targetLanguage: string,
): number {
    const language = dictionary.definitionLanguage;
    if (!language) return 0;
    if (learnerLanguage && language === learnerLanguage) return 3;
    if (language === targetLanguage) return 2;
    if (language === 'en') return 1;
    return 0;
}


const FROZEN_CATALOG_BROWSE_SHELVES = buildCatalogBrowseShelves(FROZEN_DICTIONARY_CATALOG);

const FROZEN_CATALOG_BROWSE_DICTIONARIES: readonly RecommendedDictionary[] = Object.freeze(
    FROZEN_CATALOG_BROWSE_SHELVES.flatMap(shelf => shelf.dictionaries),
);
