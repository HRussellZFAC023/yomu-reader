import type { UiCopyKey } from '../app/i18n';
import { languageDisplayName } from '../languages/locale';
import {
    FROZEN_DICTIONARY_CATALOG,
    FROZEN_DICTIONARY_RECOMMENDATIONS,
    SLICE1_LEARNER_LANGUAGES,
    assertRecommendationReferencesCatalog,
    dictionaryEntryDownload,
    type DictionaryCategory,
    type DictionaryCatalogManifest,
    type DictionaryRecommendation,
    type DictionaryRecommendationManifest,
    type RecommendationRole,
    type Slice1LearnerLanguage,
    type TranslationMode,
} from './catalog';
import {
    catalogBrowseDictionaries,
    catalogBrowseGroups,
    catalogBrowseLanguageSections,
    type CatalogBrowseGroup,
    type CatalogBrowseLanguageSection,
} from './catalog-browse';
import { LOCALE_CATALOGS, learnerLanguageById } from '../locales';
import { yomitanDictionaryIdentity } from './yomitan/zip-normalize';
import type { DictionaryImportOptions } from './yomitan';
import type { LearningTargetRosterId } from '../languages';
import { googleTranslationLanguageCapability } from '../translation/google';

export type RecommendedDictionaryCategory = 'terms' | 'kanji' | 'pitch' | 'pronunciation' | 'frequency';
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
    targetLanguage?: LearningTargetRosterId;
    /** Language of the dictionary's headwords — the text it can actually match. */
    headwordLanguage?: string;
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
    targetLanguage: LearningTargetRosterId,
    dictionaryId: string,
): string {
    return `catalog-${learnerLanguage}-${targetLanguage}-${dictionaryId}`;
}

export function recommendedDictionariesForLearnerLanguage(
    learnerLanguage: Slice1LearnerLanguage,
): readonly RecommendedDictionary[] {
    return CATALOG_RECOMMENDATIONS_BY_LANGUAGE[learnerLanguage];
}

/**
 * Profile-aware recommendation seam.
 *
 * Japanese keeps its curated shelf. The other 32 targets derive the same
 * deterministic terms-and-IPA pair as their published learner-target manifest
 * from the compact runtime catalogue, avoiding 1,056 static JSON imports in
 * the size-limited userscript.
 */
export function recommendedDictionariesForLanguageProfile(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): readonly RecommendedDictionary[] {
    if (targetLanguage === 'ja') return recommendedDictionariesForLearnerLanguage(learnerLanguage);
    const key = languageProfileRecommendationKey(learnerLanguage, targetLanguage);
    const cached = TARGET_RECOMMENDATIONS_BY_PAIR.get(key);
    if (cached) return cached;
    const recommendations = Object.freeze(
        recommendedDictionariesFromCatalog(
            FROZEN_DICTIONARY_CATALOG,
            recommendationManifestForLanguageProfile(learnerLanguage, targetLanguage),
        ),
    );
    TARGET_RECOMMENDATIONS_BY_PAIR.set(key, recommendations);
    recommendations.forEach(dictionary => CATALOG_RECOMMENDATIONS_BY_ID.set(dictionary.id, dictionary));
    return recommendations;
}

export function recommendedDictionaryInstalledIdentity(
    dictionary: RecommendedDictionary,
): string {
    return dictionary.installedDictionaryIdentity
        ?? yomitanDictionaryIdentity(dictionary.name);
}

/**
 * Integrity terms for a catalogue install, where there are any to state.
 *
 * A mirror-served archive is content-addressed, so a missing digest means the
 * catalogue is wrong and the install must fail loudly rather than fetch
 * unverified bytes. An archive the publishing project serves itself has no
 * digest to state — its URL names the project's current build — so it installs
 * on the same terms as the hand-curated upstream cards above it.
 */
export function recommendedDictionaryImportOptions(
    dictionary: RecommendedDictionary,
): DictionaryImportOptions | undefined {
    if (dictionary.origin !== 'catalog') return undefined;
    if (!isMirrorServedDownload(dictionary.downloadUrl)) return undefined;
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

function isMirrorServedDownload(downloadUrl: string | undefined): boolean {
    return Boolean(downloadUrl?.startsWith(FROZEN_DICTIONARY_CATALOG.objectsBaseUrl));
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
        const download = dictionaryEntryDownload(entry, catalog.objectsBaseUrl);
        return {
            id: catalogRecommendedDictionaryId(manifest.learnerLanguage, manifest.targetLanguage, entry.id),
            category: recommendedDictionaryCategory(recommendation),
            name: entry.title,
            description: catalogRecommendationDescription(manifest.learnerLanguage, recommendation),
            ...(download
                ? {
                      downloadUrl: download.url,
                      ...(download.sha256 === undefined ? {} : { sha256: download.sha256 }),
                      ...(download.bytes === undefined ? {} : { bytes: download.bytes }),
                  }
                : {}),
            ...(entry.source.projectUrl ? { helpUrl: entry.source.projectUrl } : {}),
            origin: 'catalog',
            learnerLanguage: manifest.learnerLanguage,
            targetLanguage: manifest.targetLanguage,
            headwordLanguage: manifest.targetLanguage,
            catalogDictionaryId: entry.id,
            role: recommendation.role,
            selectedByDefault: recommendation.selectedByDefault,
            definitionLanguage: recommendation.definitionLanguage,
            translationMode: recommendation.translationMode,
            installedDictionaryIdentity: CATALOG_INSTALLED_DICTIONARY_IDENTITIES[entry.id]
                ?? yomitanDictionaryIdentity(entry.installedTitle ?? entry.title),
        };
    });
}

const TARGET_RECOMMENDATIONS_BY_PAIR = new Map<string, readonly RecommendedDictionary[]>();

function languageProfileRecommendationKey(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): string {
    return `${learnerLanguage}-${targetLanguage}`;
}

function recommendationManifestForLanguageProfile(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: Exclude<LearningTargetRosterId, 'ja'>,
): DictionaryRecommendationManifest {
    const candidates = FROZEN_DICTIONARY_CATALOG.entries
        .filter(entry =>
            entry.distribution.state === 'published'
            && entry.headwordLanguages.includes(targetLanguage),
        );
    const terms = bestTargetDictionary(candidates, targetLanguage, learnerLanguage, 'terms');
    const pronunciation = bestTargetDictionary(candidates, targetLanguage, learnerLanguage, 'pronunciation');
    if (!terms) {
        throw new Error(`Published dictionary catalog has no term dictionary for target ${targetLanguage}.`);
    }
    const dictionaries: DictionaryRecommendation[] = [
        recommendationForEntry(terms, learnerLanguage, targetLanguage, 'terms', 10),
        ...(pronunciation
            ? [recommendationForEntry(pronunciation, learnerLanguage, targetLanguage, 'pronunciation', 20)]
            : []),
    ];
    return {
        schemaVersion: 1,
        catalogRevision: FROZEN_DICTIONARY_CATALOG.revision,
        learnerLanguage,
        targetLanguage,
        strategy: 'native-first',
        readiness: 'ready',
        blockers: [],
        dictionaries,
    };
}

function bestTargetDictionary(
    entries: readonly DictionaryCatalogManifest['entries'][number][],
    targetLanguage: string,
    learnerLanguage: Slice1LearnerLanguage,
    category: 'terms' | 'pronunciation',
): DictionaryCatalogManifest['entries'][number] | undefined {
    return entries
        .filter(entry => entry.categories.includes(category))
        .sort((left, right) =>
            targetDictionaryRank(left, targetLanguage, learnerLanguage, category)
            - targetDictionaryRank(right, targetLanguage, learnerLanguage, category)
            || left.id.localeCompare(right.id, 'en'),
        )[0];
}

function targetDictionaryRank(
    entry: DictionaryCatalogManifest['entries'][number],
    targetLanguage: string,
    learnerLanguage: Slice1LearnerLanguage,
    category: 'terms' | 'pronunciation',
): number {
    const definitionRank = entry.definitionLanguages.includes(learnerLanguage)
        ? 0
        : entry.definitionLanguages.includes(targetLanguage)
            ? 10
            : entry.definitionLanguages.includes('en')
                ? 20
                : 30;
    const selectedDefinition = preferredDefinitionLanguage(entry.definitionLanguages, learnerLanguage, targetLanguage);
    const canonicalWtyId = `wty-${targetLanguage}-${selectedDefinition}${category === 'pronunciation' ? '-ipa' : ''}`;
    const shapeRank = entry.id === canonicalWtyId
        ? 0
        : entry.id.includes('-gloss')
            ? 2
            : 1;
    return definitionRank + shapeRank;
}

function recommendationForEntry(
    entry: DictionaryCatalogManifest['entries'][number],
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
    category: 'terms' | 'pronunciation',
    priority: number,
): DictionaryRecommendation {
    const definitionLanguage = preferredDefinitionLanguage(
        entry.definitionLanguages,
        learnerLanguage,
        targetLanguage,
    );
    return {
        dictionaryId: entry.id,
        role: category === 'pronunciation'
            ? 'pronunciation'
            : definitionLanguage === learnerLanguage
                ? 'primary-terms'
                : 'fallback-terms',
        priority,
        selectedByDefault: true,
        definitionLanguage,
        translationMode: category === 'pronunciation'
            || definitionLanguage === learnerLanguage
            || !googleTranslationLanguageCapability(learnerLanguage).supported
            ? 'off'
            : 'offer',
    };
}

function preferredDefinitionLanguage(
    languages: readonly string[],
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: string,
): string {
    return [learnerLanguage, targetLanguage, 'en']
        .find(language => languages.includes(language))
        ?? languages[0]
        ?? 'en';
}

/**
 * Settings offers the whole mirror, not just the seed: the recommendation cards
 * stay preselected at the top and every other mirrored archive is listed below
 * them, grouped by catalogue category.
 */
export function catalogBrowseGroupsForLearnerLanguage(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId = 'ja',
): readonly CatalogBrowseGroup[] {
    return catalogBrowseGroups({
        learnerLanguage,
        targetLanguage,
        excludeCatalogIds: recommendedCatalogIds(learnerLanguage, targetLanguage),
    });
}

/**
 * The same shelf, continued past the studied language: Japanese first, then the
 * Mandarin, Cantonese and Literary Chinese archives the mirror also hosts.
 */
export function catalogBrowseLanguageSectionsForLearnerLanguage(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId = 'ja',
): readonly CatalogBrowseLanguageSection[] {
    return catalogBrowseLanguageSections({
        learnerLanguage,
        targetLanguage,
        excludeCatalogIds: recommendedCatalogIds(learnerLanguage, targetLanguage),
    });
}

function recommendedCatalogIds(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): ReadonlySet<string> {
    const key = languageProfileRecommendationKey(learnerLanguage, targetLanguage);
    const cached = RECOMMENDED_CATALOG_IDS_BY_LANGUAGE.get(key);
    if (cached) return cached;
    const ids = new Set(
        recommendedDictionariesForLanguageProfile(learnerLanguage, targetLanguage)
            .map(dictionary => dictionary.catalogDictionaryId)
            .filter((id): id is string => Boolean(id)),
    );
    RECOMMENDED_CATALOG_IDS_BY_LANGUAGE.set(key, ids);
    return ids;
}

const RECOMMENDED_CATALOG_IDS_BY_LANGUAGE = new Map<string, ReadonlySet<string>>();

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
    if (recommendation.role === 'pronunciation') return 'pronunciation';
    return 'terms';
}

function catalogRecommendationDescription(
    learnerLanguage: Slice1LearnerLanguage,
    recommendation: DictionaryRecommendation,
): string {
    const learner = learnerLanguageById(learnerLanguage);
    const messages = LOCALE_CATALOGS[learnerLanguage].messages;
    const definitionLanguage = languageDisplayName(recommendation.definitionLanguage, learner.runtimeLocale);
    const original = messages.originalDefinitionLabel.replace('{language}', definitionLanguage);
    if (recommendation.translationMode === 'off') return original;
    const translation = messages.automaticTranslationLabel.replace('{language}', learner.nativeName);
    return `${original} · ${translation}`;
}
