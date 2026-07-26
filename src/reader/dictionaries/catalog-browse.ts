import {
    FROZEN_DICTIONARY_CATALOG,
    type DictionaryCatalogEntry,
    type DictionaryCatalogManifest,
    type DictionaryCategory,
} from './catalog';
import type { RecommendedDictionary, RecommendedDictionaryCategory } from './recommended';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';

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

export function catalogBrowseCardId(targetLanguage: string, catalogDictionaryId: string): string {
    return `mirror-${targetLanguage}-${catalogDictionaryId}`;
}

/**
 * The catalogue mirrors dictionaries for several headword languages. Only the
 * ones written in the catalogue's own target language can help this reader, so
 * the target language — not a hardcoded 'ja' — decides membership.
 */
export function catalogBrowseDictionaries(
    catalog: DictionaryCatalogManifest = FROZEN_DICTIONARY_CATALOG,
): readonly RecommendedDictionary[] {
    return catalog === FROZEN_DICTIONARY_CATALOG
        ? FROZEN_CATALOG_BROWSE_DICTIONARIES
        : buildCatalogBrowseDictionaries(catalog);
}

export function catalogBrowseGroups(
    options: CatalogBrowseOptions = {},
    catalog: DictionaryCatalogManifest = FROZEN_DICTIONARY_CATALOG,
): readonly CatalogBrowseGroup[] {
    const excluded = options.excludeCatalogIds;
    const dictionaries = catalogBrowseDictionaries(catalog).filter(
        dictionary => !excluded?.has(dictionary.catalogDictionaryId ?? ''),
    );
    const byCategory = new Map<DictionaryCategory, RecommendedDictionary[]>();
    for (const dictionary of dictionaries) {
        const category = dictionary.catalogCategory ?? 'utility';
        const bucket = byCategory.get(category);
        if (bucket) bucket.push(dictionary);
        else byCategory.set(category, [dictionary]);
    }
    return CATEGORY_ORDER.flatMap(category => {
        const bucket = byCategory.get(category);
        if (!bucket?.length) return [];
        return [{
            category,
            dictionaries: bucket.sort(compareForLearnerLanguage(options.learnerLanguage, catalog.targetLanguage)),
        }];
    });
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

function buildCatalogBrowseDictionaries(catalog: DictionaryCatalogManifest): readonly RecommendedDictionary[] {
    const target = catalog.targetLanguage;
    const forTarget = catalog.entries.filter(entry => entry.headwordLanguages.includes(target));
    return Object.freeze(
        dedupeByPublishedObject(forTarget)
            .map(entry => browseCard(catalog, entry))
            .sort(compareForLearnerLanguage(undefined, target)),
    );
}

/**
 * The mirror keeps a starter-pack copy of archives that also live in the main
 * language collection. They are byte-identical, so one content hash must not
 * produce two Settings rows offering the same download twice.
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

function browseCard(catalog: DictionaryCatalogManifest, entry: DictionaryCatalogEntry): RecommendedDictionary {
    const primaryCategory = primaryCatalogCategory(entry);
    const object = entry.distribution.state === 'published' ? entry.distribution.object : undefined;
    return {
        id: catalogBrowseCardId(catalog.targetLanguage, entry.id),
        category: UI_CATEGORY_BY_CATALOG_CATEGORY[primaryCategory],
        catalogCategory: primaryCategory,
        name: entry.title,
        description: describeMirroredDictionary(entry.definitionLanguages[0], object?.bytes),
        ...(object
            ? {
                  downloadUrl: new URL(object.key, catalog.objectsBaseUrl).href,
                  sha256: object.sha256,
                  bytes: object.bytes,
              }
            : {}),
        ...(entry.source.projectUrl ? { helpUrl: entry.source.projectUrl } : {}),
        origin: 'catalog',
        catalogDictionaryId: entry.id,
        selectedByDefault: false,
        definitionLanguage: entry.definitionLanguages[0],
        translationMode: 'off',
        installedDictionaryIdentity: yomitanDictionaryIdentity(entry.title),
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
    const language = definitionLanguage ? displayLanguageName(definitionLanguage, locale) : '';
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

function displayLanguageName(language: string, locale = 'en'): string {
    try {
        return new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
    } catch {
        return language;
    }
}

const FROZEN_CATALOG_BROWSE_DICTIONARIES = buildCatalogBrowseDictionaries(FROZEN_DICTIONARY_CATALOG);
