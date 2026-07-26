import type { UiCopyKey } from '../app/i18n';
import {
    FROZEN_DICTIONARY_CATALOG,
    FROZEN_DICTIONARY_RECOMMENDATIONS,
    SLICE1_LEARNER_LANGUAGES,
    assertRecommendationReferencesCatalog,
    type DictionaryCategory,
    type DictionaryCatalogManifest,
    type DictionaryRecommendation,
    type DictionaryRecommendationManifest,
    type RecommendationRole,
    type Slice1LearnerLanguage,
    type TranslationMode,
} from './catalog';
import { catalogBrowseDictionaries, catalogBrowseGroups, type CatalogBrowseGroup } from './catalog-browse';
import { LOCALE_CATALOGS, learnerLanguageById } from '../locales';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';
import type { DictionaryImportOptions } from './yomitan';

export type RecommendedDictionaryCategory = 'terms' | 'kanji' | 'pitch' | 'frequency';
export type RecommendedDictionaryOrigin = 'catalog';

export interface RecommendedDictionary {
    id: string;
    category: RecommendedDictionaryCategory;
    name: string;
    descriptionKey?: UiCopyKey;
    description?: string;
    downloadUrl?: string;
    helpUrl?: string;
    origin?: RecommendedDictionaryOrigin;
    learnerLanguage?: Slice1LearnerLanguage;
    catalogDictionaryId?: string;
    catalogCategory?: DictionaryCategory;
    role?: RecommendationRole;
    selectedByDefault?: boolean;
    definitionLanguage?: string;
    translationMode?: TranslationMode;
    sha256?: string;
    bytes?: number;
    installedDictionaryIdentity?: string;
}

// The catalogue title is user-facing ("JMdict (de)"), while Yomitan's
// index.json owns the installed title ("JMdict (German) [2026-07-23]").
// Freeze those revision-independent identities beside the frozen release
// metadata so offline setup skips only the exact starter already installed.
const CATALOG_INSTALLED_DICTIONARY_IDENTITIES: Readonly<Record<string, string>> = Object.freeze({
    'jmdict-de': 'jmdict (german)',
    'jmdict-en': 'jmdict',
    'jmdict-es': 'jmdict (spanish)',
    'jmdict-fr': 'jmdict (french)',
    'jmdict-hu': 'jmdict (hungarian)',
    'jmdict-nl': 'jmdict (dutch)',
    'jmdict-ru': 'jmdict (russian)',
    'jmdict-sv': 'jmdict (swedish)',
    jmnedict: 'jmnedict',
    'kanjidic-en': 'kanjidic',
    'kanjidic-es': 'kanjidic (spanish)',
    'kanjidic-fr': 'kanjidic (french)',
    'kanjidic-pt': 'kanjidic (portuguese)',
});

export const RECOMMENDED_JAPANESE_DICTIONARIES: RecommendedDictionary[] = [
    {
        id: 'jitendex',
        category: 'terms',
        name: 'Jitendex',
        descriptionKey: 'recommendedJitendex',
        downloadUrl: 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip',
    },
    {
        id: 'jmdict',
        category: 'terms',
        name: 'JMdict',
        descriptionKey: 'recommendedJmdict',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip',
    },
    {
        id: 'jmnedict',
        category: 'terms',
        name: 'JMnedict',
        descriptionKey: 'recommendedJmnedict',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip',
    },
    {
        id: 'wty-ja-ja',
        category: 'terms',
        name: 'WTY JA-JA',
        descriptionKey: 'recommendedWtyJapaneseJapanese',
        downloadUrl: 'https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/ja/ja/wty-ja-ja.zip',
    },
    {
        id: 'pixiv-light',
        category: 'terms',
        name: 'Pixiv Light',
        descriptionKey: 'recommendedPixivLight',
        downloadUrl: 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BMonolingual%5D%20PixivLight.zip',
    },
    {
        id: 'kanjidic',
        category: 'kanji',
        name: 'KANJIDIC',
        descriptionKey: 'recommendedKanjidic',
        downloadUrl: 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip',
    },
    {
        id: 'jpdb-kanji',
        category: 'kanji',
        name: 'JPDB Kanji',
        descriptionKey: 'recommendedJpdbKanji',
        downloadUrl: 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BKanji%5D%20JPDB%20Kanji.zip',
    },
    {
        id: 'kanjium-pitch',
        category: 'pitch',
        name: 'Kanjium pitch accents',
        descriptionKey: 'recommendedKanjiumPitch',
        downloadUrl: 'https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip',
    },
    {
        id: 'jpdbv2-kana',
        category: 'frequency',
        name: 'JPDBv2㋕',
        descriptionKey: 'recommendedJpdbv2Kana',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip',
    },
    {
        id: 'jiten',
        category: 'frequency',
        name: 'Jiten',
        descriptionKey: 'recommendedJiten',
        downloadUrl: 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan',
    },
    {
        id: 'bccwj',
        category: 'frequency',
        name: 'BCCWJ',
        descriptionKey: 'recommendedBccwj',
        downloadUrl: 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip',
    },
];

const CATALOG_RECOMMENDATIONS_BY_LANGUAGE: Readonly<
    Record<Slice1LearnerLanguage, readonly RecommendedDictionary[]>
> = Object.freeze(
    Object.fromEntries(
        SLICE1_LEARNER_LANGUAGES.map(language => [
            language,
            Object.freeze(
                recommendedDictionariesFromCatalog(
                    FROZEN_DICTIONARY_CATALOG,
                    FROZEN_DICTIONARY_RECOMMENDATIONS[language],
                ),
            ),
        ]),
    ) as Record<Slice1LearnerLanguage, readonly RecommendedDictionary[]>,
);

const CATALOG_RECOMMENDATIONS_BY_ID = new Map<string, RecommendedDictionary>(
    Object.values(CATALOG_RECOMMENDATIONS_BY_LANGUAGE)
        .flat()
        .map(dictionary => [dictionary.id, dictionary]),
);

const expectedCatalogRecommendationCount = Object.values(
    CATALOG_RECOMMENDATIONS_BY_LANGUAGE,
).reduce((total, dictionaries) => total + dictionaries.length, 0);
if (CATALOG_RECOMMENDATIONS_BY_ID.size !== expectedCatalogRecommendationCount) {
    throw new Error('Frozen dictionary recommendations must have globally unique card IDs.');
}

export function catalogRecommendedDictionaryId(
    learnerLanguage: Slice1LearnerLanguage,
    dictionaryId: string,
): string {
    return `catalog-${learnerLanguage}-ja-${dictionaryId}`;
}

export function recommendedDictionariesForLearnerLanguage(
    learnerLanguage: Slice1LearnerLanguage,
): readonly RecommendedDictionary[] {
    return CATALOG_RECOMMENDATIONS_BY_LANGUAGE[learnerLanguage];
}

export function recommendedDictionaryInstalledIdentity(
    dictionary: RecommendedDictionary,
): string {
    return dictionary.installedDictionaryIdentity
        ?? yomitanDictionaryIdentity(dictionary.name);
}

export function recommendedDictionaryImportOptions(
    dictionary: RecommendedDictionary,
): DictionaryImportOptions | undefined {
    if (dictionary.origin !== 'catalog') return undefined;
    if (!dictionary.sha256 || !dictionary.bytes) {
        throw new Error(`Catalogue dictionary "${dictionary.id}" is missing integrity metadata.`);
    }
    return {
        integrity: {
            sha256: dictionary.sha256,
            bytes: dictionary.bytes,
        },
    };
}

function recommendedDictionariesFromCatalog(
    catalog: DictionaryCatalogManifest,
    manifest: DictionaryRecommendationManifest,
): RecommendedDictionary[] {
    assertRecommendationReferencesCatalog(manifest, catalog);
    const entryById = new Map(catalog.entries.map(entry => [entry.id, entry]));
    return manifest.dictionaries.map(recommendation => {
        const entry = entryById.get(recommendation.dictionaryId);
        if (!entry) throw new Error(`Recommended dictionary "${recommendation.dictionaryId}" is missing from the catalogue.`);
        const object = entry.distribution.state === 'published' ? entry.distribution.object : undefined;
        return {
            id: catalogRecommendedDictionaryId(manifest.learnerLanguage, entry.id),
            category: recommendedDictionaryCategory(recommendation),
            name: entry.title,
            description: catalogRecommendationDescription(manifest.learnerLanguage, recommendation),
            ...(object
                ? {
                      downloadUrl: new URL(object.key, catalog.objectsBaseUrl).href,
                      sha256: object.sha256,
                      bytes: object.bytes,
                  }
                : {}),
            ...(entry.source.projectUrl ? { helpUrl: entry.source.projectUrl } : {}),
            origin: 'catalog',
            learnerLanguage: manifest.learnerLanguage,
            catalogDictionaryId: entry.id,
            role: recommendation.role,
            selectedByDefault: recommendation.selectedByDefault,
            definitionLanguage: recommendation.definitionLanguage,
            translationMode: recommendation.translationMode,
            installedDictionaryIdentity: CATALOG_INSTALLED_DICTIONARY_IDENTITIES[entry.id]
                ?? yomitanDictionaryIdentity(entry.title),
        };
    });
}

/**
 * Settings offers the whole mirror, not just the seed: the recommendation cards
 * stay preselected at the top and every other mirrored archive is listed below
 * them, grouped by catalogue category.
 */
export function catalogBrowseGroupsForLearnerLanguage(
    learnerLanguage: Slice1LearnerLanguage,
): readonly CatalogBrowseGroup[] {
    return catalogBrowseGroups({
        learnerLanguage,
        excludeCatalogIds: recommendedCatalogIds(learnerLanguage),
    });
}

function recommendedCatalogIds(learnerLanguage: Slice1LearnerLanguage): ReadonlySet<string> {
    const cached = RECOMMENDED_CATALOG_IDS_BY_LANGUAGE.get(learnerLanguage);
    if (cached) return cached;
    const ids = new Set(
        recommendedDictionariesForLearnerLanguage(learnerLanguage)
            .map(dictionary => dictionary.catalogDictionaryId)
            .filter((id): id is string => Boolean(id)),
    );
    RECOMMENDED_CATALOG_IDS_BY_LANGUAGE.set(learnerLanguage, ids);
    return ids;
}

const RECOMMENDED_CATALOG_IDS_BY_LANGUAGE = new Map<Slice1LearnerLanguage, ReadonlySet<string>>();

const CATALOG_BROWSE_BY_ID = new Map<string, RecommendedDictionary>(
    catalogBrowseDictionaries().map(dictionary => [dictionary.id, dictionary]),
);

export function findRecommendedDictionary(id: string): RecommendedDictionary | undefined {
    return (
        RECOMMENDED_JAPANESE_DICTIONARIES.find(dictionary => dictionary.id === id)
        ?? CATALOG_RECOMMENDATIONS_BY_ID.get(id)
        ?? CATALOG_BROWSE_BY_ID.get(id)
    );
}

function recommendedDictionaryCategory(
    recommendation: DictionaryRecommendation,
): RecommendedDictionaryCategory {
    if (recommendation.role === 'kanji') return 'kanji';
    if (recommendation.role === 'frequency') return 'frequency';
    if (recommendation.role === 'pronunciation') return 'pitch';
    return 'terms';
}

function catalogRecommendationDescription(
    learnerLanguage: Slice1LearnerLanguage,
    recommendation: DictionaryRecommendation,
): string {
    const learner = learnerLanguageById(learnerLanguage);
    const messages = LOCALE_CATALOGS[learnerLanguage].messages;
    const definitionLanguage = displayLanguageName(recommendation.definitionLanguage, learner.runtimeLocale);
    const original = messages.originalDefinitionLabel.replace('{language}', definitionLanguage);
    if (recommendation.translationMode === 'off') return original;
    const translation = messages.automaticTranslationLabel.replace('{language}', learner.nativeName);
    return `${original} · ${translation}`;
}

function displayLanguageName(language: string, locale: string): string {
    try {
        return new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? language;
    } catch {
        return language;
    }
}
