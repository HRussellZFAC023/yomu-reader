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

export { headwordLanguageEndonym, headwordLanguageName } from '../languages/display-name';

/**
 * Every archive Yomu mirrors is installable from Settings, not only the small
 * per-language recommendation seed. The seed answers "what should I install?";
 * this module answers "what else can I install?" from the same frozen catalogue,
 * so neither list is a hand-maintained copy of the mirror. Provenance-only rows
 * remain in the catalogue ledger, but never become dead-end Guide cards here.
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
    /** True for the one shelf that matches what the reader selected to study. */
    isTargetLanguage: boolean;
    groups: readonly CatalogBrowseGroup[];
}

export interface CatalogBrowseOptions {
    /** Definition languages matching the learner sort first inside each group. */
    learnerLanguage?: string;
    /**
     * Language the reader selected to study.
     *
     * The published catalogue still carries its Japanese-era `targetLanguage`
     * field for schema compatibility. Browse routing must use this explicit
     * profile choice instead, while callers without a profile keep the legacy
     * catalogue default.
     */
    targetLanguage?: string;
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
    pronunciation: 'pronunciation',
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
    targetLanguage: string = catalog.targetLanguage,
): readonly RecommendedDictionary[] {
    return catalog === FROZEN_DICTIONARY_CATALOG && targetLanguage === catalog.targetLanguage
        ? FROZEN_CATALOG_BROWSE_DICTIONARIES
        : catalogBrowseShelves(catalog, targetLanguage).flatMap(shelf => shelf.dictionaries);
}

/**
 * Category groups for one headword language. Defaults to the selected target,
 * falling back to the catalogue's legacy target for callers without a profile.
 */
export function catalogBrowseGroups(
    options: CatalogBrowseOptions = {},
    catalog: DictionaryCatalogManifest = FROZEN_DICTIONARY_CATALOG,
    headwordLanguage: string = options.targetLanguage ?? catalog.targetLanguage,
): readonly CatalogBrowseGroup[] {
    const shelf = catalogBrowseShelves(catalog, options.targetLanguage).find(
        candidate => candidate.language === headwordLanguage,
    );
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
    const targetLanguage = options.targetLanguage ?? catalog.targetLanguage;
    return catalogBrowseShelves(catalog, targetLanguage).flatMap(shelf => {
        const groups = groupShelfByCategory(shelf, options);
        if (!groups.length) return [];
        return [{
            headwordLanguage: shelf.language,
            isTargetLanguage: shelf.language === targetLanguage,
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

function catalogBrowseShelves(
    catalog: DictionaryCatalogManifest,
    targetLanguage: string = catalog.targetLanguage,
): readonly CatalogBrowseShelf[] {
    const shelves = catalog === FROZEN_DICTIONARY_CATALOG
        ? FROZEN_CATALOG_BROWSE_SHELVES
        : buildCatalogBrowseShelves(catalog);
    if (targetLanguage === catalog.targetLanguage) return shelves;
    return Object.freeze([...shelves].sort(compareCatalogBrowseShelves(targetLanguage)));
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
    for (const entry of catalog.entries.filter(entry => catalogBrowseEntryIsInstallable(catalog, entry))) {
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
    return Object.freeze(shelves.sort(compareCatalogBrowseShelves(catalog.targetLanguage)));
}

/**
 * Source-only catalogue rows are release and licensing evidence, not a learner
 * action. Legacy variants remain in that evidence even if a future mirror
 * refresh publishes their bytes, so they are rejected independently of the
 * download check instead of being allowed to reappear as install cards.
 */
function catalogBrowseEntryIsInstallable(
    catalog: DictionaryCatalogManifest,
    entry: DictionaryCatalogEntry,
): boolean {
    const legacy = /(?:^|-)legacy(?:-|$)/iu.test(entry.id) || /\blegacy\b/iu.test(entry.title);
    return !legacy && dictionaryEntryDownload(entry, catalog.objectsBaseUrl) !== undefined;
}

function compareCatalogBrowseShelves(targetLanguage: string) {
    return (left: CatalogBrowseShelf, right: CatalogBrowseShelf): number => {
        if ((left.language === targetLanguage) !== (right.language === targetLanguage)) {
            return left.language === targetLanguage ? -1 : 1;
        }
        return right.dictionaries.length - left.dictionaries.length
            || left.language.localeCompare(right.language, 'en');
    };
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
