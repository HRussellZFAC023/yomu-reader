import type { UiCopyKey } from '../app/i18n';
import { languageDisplayName } from '../languages/locale';
import {
    FROZEN_DICTIONARY_CATALOG,
    FROZEN_DICTIONARY_RECOMMENDATIONS,
    SLICE1_LEARNER_LANGUAGES,
    dictionaryEntryDownload,
    type DictionaryCategory,
    type DictionaryCatalogEntry,
    type DictionaryRecommendation,
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

type CuratedDictionary = readonly [
    id: string,
    category: RecommendedDictionaryCategory,
    name: string,
    descriptionKey: UiCopyKey,
    downloadUrl: string,
];

export const RECOMMENDED_JAPANESE_DICTIONARIES: RecommendedDictionary[] = ([
    ['jitendex', 'terms', 'Jitendex', 'recommendedJitendex', 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip'],
    ['jmdict', 'terms', 'JMdict', 'recommendedJmdict', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'],
    ['jmnedict', 'terms', 'JMnedict', 'recommendedJmnedict', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip'],
    ['wty-ja-ja', 'terms', 'WTY JA-JA', 'recommendedWtyJapaneseJapanese', 'https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/ja/ja/wty-ja-ja.zip'],
    ['pixiv-light', 'terms', 'Pixiv Light', 'recommendedPixivLight', 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BMonolingual%5D%20PixivLight.zip'],
    ['kanjidic', 'kanji', 'KANJIDIC', 'recommendedKanjidic', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip'],
    ['jpdb-kanji', 'kanji', 'JPDB Kanji', 'recommendedJpdbKanji', 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BKanji%5D%20JPDB%20Kanji.zip'],
    ['kanjium-pitch', 'pitch', 'Kanjium pitch accents', 'recommendedKanjiumPitch', 'https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip'],
    ['jpdbv2-kana', 'frequency', 'JPDBv2㋕', 'recommendedJpdbv2Kana', 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip'],
    ['jiten', 'frequency', 'Jiten', 'recommendedJiten', 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan'],
    ['bccwj', 'frequency', 'BCCWJ', 'recommendedBccwj', 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/BCCWJ_SUW_LUW_combined.zip'],
] satisfies readonly CuratedDictionary[]).map(
    ([id, category, name, descriptionKey, downloadUrl]) =>
        ({ id, category, name, descriptionKey, downloadUrl }),
);

const CATALOG_ENTRY_BY_ID = new Map(
    FROZEN_DICTIONARY_CATALOG.entries.map(entry => [entry.id, entry]),
);

const CATALOG_RECOMMENDATIONS_BY_LANGUAGE: Readonly<
    Record<Slice1LearnerLanguage, readonly RecommendedDictionary[]>
> = Object.freeze(
    Object.fromEntries(
        SLICE1_LEARNER_LANGUAGES.map(language => [
            language,
            Object.freeze(
                FROZEN_DICTIONARY_RECOMMENDATIONS[language].dictionaries.map(recommendation =>
                    recommendedDictionaryFromCatalog(language, 'ja', recommendation),
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
    const key = `${learnerLanguage}-${targetLanguage}`;
    const cached = TARGET_RECOMMENDATIONS_BY_PAIR.get(key);
    if (cached) return cached;
    const recommendations = Object.freeze(targetRecommendations(learnerLanguage, targetLanguage));
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

function recommendedDictionaryFromCatalog(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
    recommendation: DictionaryRecommendation,
): RecommendedDictionary {
    const entry = CATALOG_ENTRY_BY_ID.get(recommendation.dictionaryId);
    if (!entry) throw new Error(`Recommended dictionary "${recommendation.dictionaryId}" is missing from the catalogue.`);
    const download = dictionaryEntryDownload(entry, FROZEN_DICTIONARY_CATALOG.objectsBaseUrl);
    return {
        id: catalogRecommendedDictionaryId(learnerLanguage, targetLanguage, entry.id),
        category: recommendedDictionaryCategory(recommendation),
        name: entry.title,
        description: catalogRecommendationDescription(learnerLanguage, recommendation),
        ...(download && {
            downloadUrl: download.url,
            sha256: download.sha256,
            bytes: download.bytes,
        }),
        ...(entry.source.projectUrl ? { helpUrl: entry.source.projectUrl } : {}),
        origin: 'catalog',
        learnerLanguage,
        targetLanguage,
        headwordLanguage: targetLanguage,
        catalogDictionaryId: entry.id,
        role: recommendation.role,
        selectedByDefault: recommendation.selectedByDefault,
        definitionLanguage: recommendation.definitionLanguage,
        translationMode: recommendation.translationMode,
        installedDictionaryIdentity: catalogInstalledDictionaryIdentity(entry),
    };
}

function catalogInstalledDictionaryIdentity(entry: DictionaryCatalogEntry): string {
    if (entry.id === 'jmnedict') return entry.id;
    const jmdict = /^(jmdict|kanjidic)-([a-z]+)$/.exec(entry.id);
    if (jmdict) {
        const [, family, language] = jmdict;
        return language === 'en'
            ? family!
            : yomitanDictionaryIdentity(`${family} (${learnerLanguageById(language as Slice1LearnerLanguage).englishName})`);
    }
    return yomitanDictionaryIdentity(entry.installedTitle ?? entry.title);
}

const TARGET_RECOMMENDATIONS_BY_PAIR = new Map<string, readonly RecommendedDictionary[]>();

function targetRecommendations(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): RecommendedDictionary[] {
    const terms = targetTermsRecommendation(learnerLanguage, targetLanguage);
    if (!terms) throw new Error(`Published dictionary catalog has no term dictionary for target ${targetLanguage}.`);
    const pronunciationLanguage = [learnerLanguage, targetLanguage, 'en'].find(definitionLanguage =>
        CATALOG_ENTRY_BY_ID.get(`wty-${targetLanguage}-${definitionLanguage}-ipa`)?.distribution.state === 'published',
    );
    const pronunciation: DictionaryRecommendation | undefined = pronunciationLanguage
        ? {
              dictionaryId: `wty-${targetLanguage}-${pronunciationLanguage}-ipa`,
              role: 'pronunciation',
              priority: 20,
              selectedByDefault: true,
              definitionLanguage: pronunciationLanguage,
              translationMode: 'off',
          }
        : undefined;
    return [terms, ...(pronunciation ? [pronunciation] : [])]
        .map(recommendation => recommendedDictionaryFromCatalog(learnerLanguage, targetLanguage, recommendation));
}

function targetTermsRecommendation(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): DictionaryRecommendation | undefined {
    const preferredDefinitions = [learnerLanguage, targetLanguage, 'en'];
    const candidates = FROZEN_DICTIONARY_CATALOG.entries
        .filter(entry =>
            entry.distribution.state === 'published'
            && entry.headwordLanguages.includes(targetLanguage)
            && entry.categories.includes('terms'),
        )
        .map(entry => {
            const definitionLanguage = preferredDefinitions.find(language =>
                entry.definitionLanguages.includes(language),
            ) ?? entry.definitionLanguages[0] ?? 'en';
            const definitionRank = preferredDefinitions.indexOf(definitionLanguage);
            // Preferring the canonical `wty-<target>-<definitions>` id used to outrank
            // everything else, which silently assumed WTY always has the content. For
            // Cantonese it does not: MEASURED 2026-08-03, `wty-yue-en` is 28,109 bytes
            // — 483x smaller than the published, licence-reviewed Words.hk Cantonese-
            // English dictionary at 13,578,603 — so a Cantonese learner installed the
            // recommendation and could look almost nothing up. That is the whole of
            // yue's 0/47 in the parity baseline while every other target averages 84%.
            //
            // Content decides instead, which is not a Cantonese special case: simulated
            // across all 32 non-Japanese targets, ordering by size changes exactly ONE
            // recommendation, because WTY already IS the largest everywhere else. The
            // canonical-shape preference was only ever a proxy for "the good one", and
            // it is the proxy that broke, not the goal. `-gloss` archives stay
            // deprioritised — they are a different kind of entry, not a smaller one.
            const shapeRank = entry.id.includes('-gloss') ? 2 : 0;
            return {
                entry,
                definitionLanguage,
                rank: (definitionRank < 0 ? 3 : definitionRank) * 10 + shapeRank,
                // Narrowed explicitly: only a published distribution carries an object,
                // and the filter above already excludes the others.
                bytes: entry.distribution.state === 'published' ? entry.distribution.object.bytes : 0,
            };
        })
        .sort((left, right) => left.rank - right.rank
            || right.bytes - left.bytes
            || left.entry.id.localeCompare(right.entry.id, 'en'))[0];
    if (!candidates) return undefined;
    const { entry, definitionLanguage } = candidates;
    return {
        dictionaryId: entry.id,
        role: definitionLanguage === learnerLanguage ? 'primary-terms' : 'fallback-terms',
        priority: 10,
        selectedByDefault: true,
        definitionLanguage,
        translationMode: definitionLanguage === learnerLanguage || learnerLanguage === 'grc'
            ? 'off'
            : 'offer',
    };
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
    return new Set(
        recommendedDictionariesForLanguageProfile(learnerLanguage, targetLanguage)
            .map(dictionary => dictionary.catalogDictionaryId)
            .filter((id): id is string => Boolean(id)),
    );
}

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
