import runtimeCatalogJson from '../../../../config/dictionaries/published/v1/runtime-catalog.json';
import enRecommendations from '../../../../config/dictionaries/published/v1/recommendations/en-ja.json';
import { googleTranslationLanguageCapability } from '../../translation/google';
import { assertRecommendationReferencesCatalog, parseDictionaryRecommendationManifest } from './schema';
import {
    SLICE1_LEARNER_LANGUAGES,
    type DictionaryCatalogEntry,
    type DictionaryCatalogManifest,
    type DictionaryDistribution,
    type DictionaryRecommendation,
    type DictionaryRecommendationManifest,
    type Slice1LearnerLanguage,
} from './types';

export const FROZEN_DICTIONARY_CATALOG: DictionaryCatalogManifest = runtimeDictionaryCatalog(runtimeCatalogJson);

/**
 * The 32 Japanese-target manifests share one eight-role shelf. Keep only the
 * English template in the userscript and derive its three language-dependent
 * starter choices from the frozen catalogue. Release tests compare every
 * derived manifest with its published JSON, so the compact runtime projection
 * cannot drift from the files served by the dictionary worker.
 */
const JAPANESE_RECOMMENDATION_TEMPLATE = parseDictionaryRecommendationManifest(enRecommendations);

export const FROZEN_DICTIONARY_RECOMMENDATIONS: Readonly<Record<Slice1LearnerLanguage, DictionaryRecommendationManifest>> = Object.freeze(
    Object.fromEntries(
        SLICE1_LEARNER_LANGUAGES.map(language => {
            const manifest = japaneseRecommendationManifest(language);
            assertRecommendationReferencesCatalog(manifest, FROZEN_DICTIONARY_CATALOG);
            return [language, manifest];
        }),
    ) as Record<Slice1LearnerLanguage, DictionaryRecommendationManifest>,
);

function japaneseRecommendationManifest(
    learnerLanguage: Slice1LearnerLanguage,
): DictionaryRecommendationManifest {
    return {
        ...JAPANESE_RECOMMENDATION_TEMPLATE,
        learnerLanguage,
        dictionaries: JAPANESE_RECOMMENDATION_TEMPLATE.dictionaries.map(recommendation =>
            japaneseRecommendation(recommendation, learnerLanguage),
        ),
    };
}

function japaneseRecommendation(
    template: DictionaryRecommendation,
    learnerLanguage: Slice1LearnerLanguage,
): DictionaryRecommendation {
    const family = template.role === 'primary-terms'
        ? 'jmdict'
        : template.role === 'kanji'
            ? 'kanjidic'
            : null;
    const candidateId = family ? `${family}-${learnerLanguage}` : template.dictionaryId;
    const candidate = publishedCatalogEntry(candidateId)
        ?? publishedCatalogEntry(template.dictionaryId);
    if (!candidate) {
        throw new Error(`Japanese recommendation "${template.dictionaryId}" is missing from the catalogue.`);
    }
    const definitionLanguage = candidate.definitionLanguages[0] ?? 'en';
    const translationMode = template.role === 'frequency'
        || template.role === 'pronunciation'
        || definitionLanguage === learnerLanguage
        || !googleTranslationLanguageCapability(learnerLanguage).supported
        ? 'off'
        : 'offer';
    return {
        ...template,
        dictionaryId: candidate.id,
        role: family === 'jmdict'
            ? definitionLanguage === learnerLanguage ? 'primary-terms' : 'fallback-terms'
            : template.role,
        definitionLanguage,
        translationMode,
    };
}

function publishedCatalogEntry(id: string): DictionaryCatalogEntry | undefined {
    return FROZEN_DICTIONARY_CATALOG.entries.find(entry =>
        entry.id === id && entry.distribution.state === 'published',
    );
}

type RuntimeDistribution = readonly [
    state: 'published' | 'upstream' | 'blocked' | 'source-only',
    value?: string,
    bytes?: number | null,
];
type RuntimeCatalogEntry = readonly [
    id: string,
    title: string,
    installedTitle: string | null,
    categories: DictionaryCatalogEntry['categories'],
    headwordLanguages: string[],
    definitionLanguages: string[],
    projectUrl: string | null,
    catalogueSection: string | null,
    distribution: RuntimeDistribution,
];
interface RuntimeCatalog {
    revision: string;
    objectsBaseUrl: string;
    entries: RuntimeCatalogEntry[];
}

function runtimeDictionaryCatalog(input: unknown): DictionaryCatalogManifest {
    const compact = input as RuntimeCatalog;
    if (!compact || typeof compact.revision !== 'string' || !Array.isArray(compact.entries)) {
        throw new Error('Runtime dictionary catalog is invalid. Regenerate it from the published catalog.');
    }
    return {
        schemaVersion: 1,
        revision: compact.revision,
        generatedAt: 'runtime-projection',
        targetLanguage: 'ja',
        objectsBaseUrl: compact.objectsBaseUrl,
        sourceSnapshot: {
            catalogueRepository: 'runtime-projection',
            catalogueCommit: compact.revision,
            catalogueFile: 'config/dictionaries/published/v1/catalog.json',
            driveFolderUrl: 'https://dictionaries.yomureader.com/',
            capturedAt: 'runtime-projection',
        },
        entries: compact.entries.map(expandRuntimeCatalogEntry),
    };
}

function expandRuntimeCatalogEntry(entry: RuntimeCatalogEntry): DictionaryCatalogEntry {
    const [id, title, installedTitle, categories, headwordLanguages, definitionLanguages, projectUrl, catalogueSection, distribution] = entry;
    return {
        id,
        title,
        ...(installedTitle ? { installedTitle } : {}),
        format: 'yomitan',
        version: 'runtime',
        categories,
        headwordLanguages,
        definitionLanguages,
        source: {
            acquisitionId: id,
            url: projectUrl ?? 'https://dictionaries.yomureader.com/',
            ...(projectUrl ? { projectUrl } : {}),
            ...(catalogueSection ? { catalogueSection } : {}),
        },
        license: {
            spdx: null,
            attribution: title,
            sourceUrl: projectUrl ?? 'https://dictionaries.yomureader.com/',
            redistribution: 'allowed',
        },
        distribution: expandRuntimeDistribution(distribution),
    };
}

function expandRuntimeDistribution(distribution: RuntimeDistribution): DictionaryDistribution {
    const [state, value, bytes] = distribution;
    if (state === 'published') {
        const sha256 = value ?? '';
        return {
            state,
            object: {
                key: `objects/sha256/${sha256}.zip`,
                sha256,
                bytes: bytes ?? 0,
                contentType: 'application/zip',
            },
        };
    }
    if (state === 'upstream') {
        return {
            state,
            archive: {
                url: value ?? '',
                ...(bytes === null || bytes === undefined ? {} : { bytes }),
            },
        };
    }
    return state === 'blocked'
        ? { state, reason: value ?? 'Unavailable' }
        : { state: 'source-only' };
}
