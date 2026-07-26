export const DICTIONARY_CATALOG_SCHEMA_VERSION = 1 as const;
export const DICTIONARY_CATALOG_TARGET_LANGUAGE = 'ja' as const;

/**
 * Slice 1's frozen learner-language roster.
 *
 * Keep this tuple in the same order as config/dictionaries/manifests/v1/languages.json.
 * Changing membership is a product/versioning decision, not a translation-only edit.
 */
export const SLICE1_LEARNER_LANGUAGES = [
    'sq',
    'grc',
    'ar',
    'yue',
    'zh',
    'da',
    'nl',
    'en',
    'fi',
    'fr',
    'de',
    'el',
    'hu',
    'id',
    'it',
    'km',
    'ko',
    'lo',
    'la',
    'mn',
    'fa',
    'pl',
    'pt',
    'ro',
    'ru',
    'sh',
    'es',
    'sv',
    'tl',
    'th',
    'tr',
    'vi',
] as const;

export type Slice1LearnerLanguage = typeof SLICE1_LEARNER_LANGUAGES[number];
export type TextDirection = 'ltr' | 'rtl';
export type DictionaryCategory =
    | 'terms'
    | 'names'
    | 'grammar'
    | 'kanji'
    | 'frequency'
    | 'pronunciation'
    | 'examples'
    | 'thesaurus'
    | 'encyclopedia'
    | 'utility';
export type RedistributionReview = 'allowed' | 'pending' | 'blocked';
export type DictionaryDistribution =
    | { state: 'source-only' }
    | { state: 'blocked'; reason: string }
    | { state: 'published'; object: DictionaryObject };

export interface DictionaryObject {
    key: string;
    sha256: string;
    bytes: number;
    contentType: 'application/zip';
}

export interface DictionaryLicense {
    spdx: string | null;
    attribution: string;
    sourceUrl: string;
    licenseUrl?: string;
    redistribution: RedistributionReview;
    reviewNote?: string;
}

export interface DictionaryCatalogEntry {
    id: string;
    title: string;
    format: 'yomitan';
    version: string;
    categories: DictionaryCategory[];
    headwordLanguages: string[];
    definitionLanguages: string[];
    source: {
        acquisitionId: string;
        url: string;
        projectUrl?: string;
        catalogueSection?: string;
    };
    license: DictionaryLicense;
    distribution: DictionaryDistribution;
}

export interface DictionarySourceSnapshot {
    catalogueRepository: string;
    catalogueCommit: string;
    catalogueFile: string;
    driveFolderUrl: string;
    capturedAt: string;
}

export interface DictionaryCatalogManifest {
    schemaVersion: typeof DICTIONARY_CATALOG_SCHEMA_VERSION;
    revision: string;
    generatedAt: string;
    targetLanguage: typeof DICTIONARY_CATALOG_TARGET_LANGUAGE;
    objectsBaseUrl: string;
    sourceSnapshot: DictionarySourceSnapshot;
    entries: DictionaryCatalogEntry[];
}

export interface CatalogLanguage {
    tag: Slice1LearnerLanguage;
    englishName: string;
    nativeName: string;
    direction: TextDirection;
    defaultScript?: string;
    targetLanguage: typeof DICTIONARY_CATALOG_TARGET_LANGUAGE;
    status: 'slice1';
    catalogueEvidence: string[];
}

export interface DictionaryLanguageManifest {
    schemaVersion: typeof DICTIONARY_CATALOG_SCHEMA_VERSION;
    revision: string;
    generatedAt: string;
    targetLanguage: typeof DICTIONARY_CATALOG_TARGET_LANGUAGE;
    count: 32;
    languages: CatalogLanguage[];
}

/**
 * A recommendation covers a whole reading setup, not just "a word list".
 * Slice 1 shipped the bilingual starter (terms/names/kanji); the monolingual,
 * grammar, frequency, pitch and example roles name the rest of the shelf so a
 * learner language can seed them from the same frozen catalogue.
 */
export type RecommendationRole =
    | 'primary-terms'
    | 'fallback-terms'
    | 'monolingual'
    | 'names'
    | 'kanji'
    | 'grammar'
    | 'frequency'
    | 'pronunciation'
    | 'examples';
export type TranslationMode = 'off' | 'offer';

export interface DictionaryRecommendation {
    dictionaryId: string;
    role: RecommendationRole;
    priority: number;
    selectedByDefault: boolean;
    definitionLanguage: string;
    translationMode: TranslationMode;
}

export interface DictionaryRecommendationManifest {
    schemaVersion: typeof DICTIONARY_CATALOG_SCHEMA_VERSION;
    catalogRevision: string;
    learnerLanguage: Slice1LearnerLanguage;
    targetLanguage: typeof DICTIONARY_CATALOG_TARGET_LANGUAGE;
    strategy: 'native-first';
    readiness: 'ready' | 'blocked';
    blockers: string[];
    dictionaries: DictionaryRecommendation[];
}

export function isSlice1LearnerLanguage(value: string): value is Slice1LearnerLanguage {
    return (SLICE1_LEARNER_LANGUAGES as readonly string[]).includes(value);
}

