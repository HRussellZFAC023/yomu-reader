import type { UiCopyKey } from '../app/i18n';
import { languageDisplayName } from '../languages/locale';
import {
    FROZEN_DICTIONARY_CATALOG,
    FROZEN_DICTIONARY_RECOMMENDATIONS,
    SLICE1_LEARNER_LANGUAGES,
    dictionaryEntryDownload,
    type DictionaryCategory,
    type DictionaryCatalogEntry,
    type DictionaryEntryDownload,
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
    /** The project's own newest build, for a page that may read a host without CORS. */
    latestUrl?: string;
    /** The index.json revision of the archive `downloadUrl` serves, where it is known. */
    revision?: string;
}

type CuratedDictionary = readonly [
    id: string,
    category: RecommendedDictionaryCategory,
    name: string,
    descriptionKey: UiCopyKey,
    /** The id of the published mirror copy, or an upstream URL that sends CORS. */
    source: string,
    /** Where the project serves newer builds than that copy, and the copy's revision. */
    latest?: readonly [url: string, mirrorRevision: string],
];

const CATALOG_ENTRY_BY_ID = new Map(
    FROZEN_DICTIONARY_CATALOG.entries.map(entry => [entry.id, entry]),
);

/**
 * Hand-picked Japanese cards shown after the catalogue's own seed (which
 * already offers JMdict, JMnedict, KANJIDIC and JPDBv2㋕). Each installs from
 * Yomu's mirror, verified by its digest, except the two whose only copy is
 * upstream; both of those hosts send CORS, so Study can fetch them directly.
 * Jitendex and Jiten publish newer builds than the mirror holds, from hosts
 * that send no CORS: see recommendedDictionaryBuild.
 */
const CURATED_JAPANESE_DICTIONARIES = [
    ['jitendex', 'terms', 'Jitendex', 'recommendedJitendex', 'drive-japanese-ja-en-jitendex-yomitan-2026-07-09-icndfbtjny', ['https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip', '2026.07.09.0']],
    ['wty-ja-ja', 'terms', 'WTY JA-JA', 'recommendedWtyJapaneseJapanese', 'https://huggingface.co/datasets/daxida/wty-release/resolve/main/latest/dict/ja/ja/wty-ja-ja.zip'],
    ['pixiv-light', 'terms', 'Pixiv Light', 'recommendedPixivLight', 'drive-japanese-ja-ja-encyclopedia-pixivlight-2026-07-23-b2yz0hz8ye'],
    ['jpdb-kanji', 'kanji', 'JPDB Kanji', 'recommendedJpdbKanji', 'drive-japanese-kanji-jpdb-kanji-gyuvmtw8ve'],
    ['kanjium-pitch', 'pitch', 'Kanjium pitch accents', 'recommendedKanjiumPitch', 'https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip'],
    ['jiten', 'frequency', 'Jiten', 'recommendedJiten', 'drive-japanese-ja-freq-jiten-freq-global-2026-07-23-gtrllz-fon', ['https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan', 'Jiten 26-07-13']],
    ['bccwj', 'frequency', 'BCCWJ', 'recommendedBccwj', 'drive-japanese-ja-freq-bccwj-suw-luw-combined-wpf0pnuvsu'],
] satisfies readonly CuratedDictionary[];

export const RECOMMENDED_JAPANESE_DICTIONARIES: RecommendedDictionary[] = CURATED_JAPANESE_DICTIONARIES.map(
    ([id, category, name, descriptionKey, source, latest]: CuratedDictionary) => ({
        id, category, name, descriptionKey, ...curatedDownload(source),
        ...(latest && { latestUrl: latest[0], revision: latest[1] }),
    }),
);

/**
 * The build a card installs. A page that may read any host (a userscript
 * manager, the Reader bridge, an extension page) takes the project's newest
 * build; Study on its own reads only hosts that send CORS, so it keeps the
 * mirror's integrity-checked copy.
 */
export function recommendedDictionaryBuild(dictionary: RecommendedDictionary, readsAnyHost: boolean): RecommendedDictionary {
    if (!readsAnyHost || !dictionary.latestUrl) return dictionary;
    return { ...dictionary, downloadUrl: dictionary.latestUrl, sha256: undefined, bytes: undefined, revision: undefined };
}

/**
 * Whether an install already holds this build or a newer one, so installing it
 * would gain nothing or go backwards. Only a known revision compares, number by
 * number: "2026.07.09.0" is older than "2026.10.03.0". A project's latest build
 * has none, and an install recorded without one predates every mirror copy. An
 * install whose numbers run out first is older too: Yomichan's KANJIDIC says
 * only "kanjidic2", which is not "kanjidic2.2026-204".
 */
export function recommendedDictionaryInstallIsCurrent(build: RecommendedDictionary, installedRevision: string | undefined): boolean {
    const installed = installedRevision?.match(/\d+/gu)?.map(Number);
    const offered = build.revision?.match(/\d+/gu)?.map(Number);
    if (!installed || !offered) return false;
    const index = offered.findIndex((value, at) => value !== installed[at]);
    return index < 0 || (installed[index] ?? -1) > offered[index]!;
}

/** The mirror archives the hand-picked cards install, so the browse below them skips those. */
const CURATED_JAPANESE_CATALOG_IDS: readonly string[] = CURATED_JAPANESE_DICTIONARIES
    .map(([, , , , source]) => source)
    .filter(source => !source.startsWith('https://'));

function curatedDownload(source: string): Pick<RecommendedDictionary, 'downloadUrl' | 'sha256' | 'bytes'> {
    if (source.startsWith('https://')) return { downloadUrl: source };
    const { url, sha256, bytes } = mirroredCatalogDownload(source);
    return { downloadUrl: url, sha256, bytes };
}

function mirroredCatalogDownload(id: string): DictionaryEntryDownload {
    const entry = CATALOG_ENTRY_BY_ID.get(id);
    const download = entry && dictionaryEntryDownload(entry, FROZEN_DICTIONARY_CATALOG.objectsBaseUrl);
    if (!download?.mirrored) throw new Error(`Curated dictionary "${id}" is not published on the mirror.`);
    return download;
}

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

/** Japanese is the one target (ADR-0024), with its curated shelf. */
export function recommendedDictionariesForLanguageProfile(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): readonly RecommendedDictionary[] {
    return targetLanguage === 'ja' ? recommendedDictionariesForLearnerLanguage(learnerLanguage) : [];
}

export function recommendedDictionaryInstalledIdentity(
    dictionary: RecommendedDictionary,
): string {
    return dictionary.installedDictionaryIdentity
        ?? yomitanDictionaryIdentity(dictionary.name);
}

/**
 * Integrity terms for an install, where there are any to state.
 *
 * A mirror-served archive is content-addressed, so a missing digest means the
 * catalogue is wrong and the install must fail loudly rather than fetch
 * unverified bytes, whichever card offers it. An archive the publishing
 * project serves itself has no digest to state — its URL names the project's
 * current build.
 */
export function recommendedDictionaryImportOptions(
    dictionary: RecommendedDictionary,
): DictionaryImportOptions | undefined {
    if (!isMirrorServedDownload(dictionary.downloadUrl)) return undefined;
    if (!dictionary.sha256 || !dictionary.bytes) {
        throw new Error(`Mirrored dictionary "${dictionary.id}" is missing integrity metadata.`);
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
        revision: entry.revision,
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

/** The same shelf, as the catalogue browser lists it. */
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
    return new Set([
        ...recommendedDictionariesForLanguageProfile(learnerLanguage, targetLanguage)
            .map(dictionary => dictionary.catalogDictionaryId)
            .filter((id): id is string => Boolean(id)),
        ...(targetLanguage === 'ja' ? CURATED_JAPANESE_CATALOG_IDS : []),
    ]);
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
