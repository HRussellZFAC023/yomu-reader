import {
    isLearnerLanguageId,
    LEARNER_LANGUAGES,
    learnerLanguageById,
} from '../locales/roster';
import {
    LEARNER_LANGUAGE_IDS,
    type LearnerLanguage,
    type LearnerLanguageId,
} from '../locales/types';
import { canonicalLanguageTag, languageSubtag } from './locale';
import type { LanguageTag } from './types';

/**
 * Language ownership, display names, scripts, and catalogue IDs live in the
 * locale registry. The profile Module adapts that source of truth into
 * canonical BCP-47 runtime tags rather than maintaining a second roster.
 */
export const SLICE1_LEARNER_LANGUAGE_IDS = LEARNER_LANGUAGE_IDS;
export type Slice1LearnerLanguageId = LearnerLanguageId;

export const SLICE1_TARGET_LANGUAGE = 'ja' as const;
export const DEFAULT_SLICE1_LEARNER_LANGUAGE = 'en' as const;
export type LearningTargetRosterId = typeof SLICE1_TARGET_LANGUAGE | LearnerLanguageId;
export type StudyTargetReadiness = 'full' | 'reading-only' | 'planned';
export type LearningTargetRosterEntry = Omit<LearnerLanguage, 'id'> & {
    id: LearningTargetRosterId;
    studyTargetReadiness: StudyTargetReadiness;
};

const JAPANESE_TARGET_ROSTER_ENTRY: LearningTargetRosterEntry = Object.freeze({
    id: 'ja',
    runtimeLocale: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    defaultScript: 'Jpan',
    scripts: Object.freeze(['Jpan']),
    direction: 'ltr',
    studyTargetReadiness: 'full',
});

/**
 * A product decision, not a capability inference. Every non-Japanese target is
 * named exactly once here, and the erased type checks make a new roster ID fail
 * the build until it receives an explicit readiness decision.
 */
const READING_ONLY_STUDY_TARGET_ID_LIST =
    'sq grc ar yue zh da nl en fi fr de el hu id it km ko lo la mn fa pl pt ro ru sh es sv tl th tr vi' as const;

type SpaceSeparatedStudyTargetIds<Value extends string> =
    Value extends `${infer Head} ${infer Tail}`
        ? Head | SpaceSeparatedStudyTargetIds<Tail>
        : Value;
type ExplicitNonFullStudyTargetId =
    SpaceSeparatedStudyTargetIds<typeof READING_ONLY_STUDY_TARGET_ID_LIST>;
type AssertNoStudyTargets<T extends never> = T;
/** @internal Compile-time proof that readiness decisions are exhaustive and disjoint. */
export type StudyTargetReadinessDecisionAudit = AssertNoStudyTargets<
    Exclude<LearnerLanguageId, ExplicitNonFullStudyTargetId>
    | Exclude<ExplicitNonFullStudyTargetId, LearnerLanguageId>
>;

const READING_ONLY_STUDY_TARGET_IDS = READING_ONLY_STUDY_TARGET_ID_LIST.split(' ');

/**
 * The target picker is Japanese plus the frozen 32-language catalogue roster.
 * Japanese is not itself a learner/definition language in Slice 1, so this
 * view adds it without duplicating the other 32 rows or changing their IDs.
 */
export const LEARNING_TARGET_ROSTER: readonly LearningTargetRosterEntry[] = Object.freeze([
    JAPANESE_TARGET_ROSTER_ENTRY,
    ...LEARNER_LANGUAGES.map(language => Object.freeze({
        ...language,
        studyTargetReadiness: READING_ONLY_STUDY_TARGET_IDS.includes(language.id)
            ? 'reading-only'
            : 'planned',
    })),
]);

export function learningTargetRosterEntry(id: LearningTargetRosterId): LearningTargetRosterEntry {
    const target = LEARNING_TARGET_ROSTER.find(language => language.id === id);
    if (!target) throw new Error(`Unknown learning target: ${id}`);
    return target;
}

export function studyTargetReadinessMeets(
    actual: StudyTargetReadiness,
    claimed: Exclude<StudyTargetReadiness, 'planned'>,
): boolean {
    return actual === 'full' || actual === claimed;
}

export const SLICE1_LEARNER_LANGUAGE_TAGS: readonly LanguageTag[] = Object.freeze(
    LEARNER_LANGUAGES.map(language => canonicalLanguageTag(language.runtimeLocale) ?? language.runtimeLocale),
);

export function canonicalTagForSlice1Language(id: Slice1LearnerLanguageId): LanguageTag {
    const runtimeLocale = learnerLanguageById(id).runtimeLocale;
    return canonicalLanguageTag(runtimeLocale) ?? runtimeLocale;
}

export function canonicalTagForLearningTarget(id: LearningTargetRosterId): LanguageTag {
    return id === SLICE1_TARGET_LANGUAGE
        ? SLICE1_TARGET_LANGUAGE
        : canonicalTagForSlice1Language(id);
}

export function learningTargetRosterIdForTag(value: unknown): LearningTargetRosterId | null {
    const canonical = canonicalLanguageTag(value);
    if (languageSubtag(canonical) === SLICE1_TARGET_LANGUAGE) return SLICE1_TARGET_LANGUAGE;
    return slice1LanguageIdForTag(value);
}

export function isLearningTargetRosterId(value: string): value is LearningTargetRosterId {
    return value === SLICE1_TARGET_LANGUAGE || isLearnerLanguageId(value);
}

export function slice1LanguageIdForTag(value: unknown): Slice1LearnerLanguageId | null {
    if (typeof value !== 'string') return null;
    const input = value.trim().toLowerCase().replace(/_/g, '-');
    const inputBase = input.split('-')[0] ?? '';
    if (isLearnerLanguageId(inputBase)) return inputBase;

    const canonical = canonicalLanguageTag(value);
    if (!canonical) return null;
    const base = languageSubtag(canonical);
    if (!base) return null;
    if (base === 'sr' || base === 'hr' || base === 'bs') return 'sh';
    if (base === 'fil') return 'tl';
    return isLearnerLanguageId(base) ? base : null;
}

/**
 * Returns a canonical profile language while preserving explicit supported
 * script and region detail such as zh-Hant-TW or pt-BR. A bare catalogue ID
 * resolves to its configured runtime locale (zh -> zh-Hans, yue -> yue-Hant).
 */
export function normalizeSlice1LearnerLanguage(
    value: unknown,
    fallback: LanguageTag = DEFAULT_SLICE1_LEARNER_LANGUAGE,
): LanguageTag {
    if (typeof value === 'string') {
        const input = value.trim().toLowerCase().replace(/_/g, '-');
        if (isLearnerLanguageId(input)) return canonicalTagForSlice1Language(input);
    }
    const canonical = canonicalLanguageTag(value);
    const canonicalId = canonical ? slice1LanguageIdForTag(canonical) : null;
    if (canonical && canonicalId) {
        // The frozen catalogue keeps Yomitan's historical `sh` identity, but
        // every runtime alias must converge on one Latin-script profile tag.
        // Otherwise `sr`, `hr`, and `bs` profiles silently acquire different
        // provider behavior and cache identities for the same roster row.
        if (canonicalId === 'sh') return canonicalTagForSlice1Language('sh');
        return canonical;
    }

    const fallbackId = slice1LanguageIdForTag(fallback) ?? DEFAULT_SLICE1_LEARNER_LANGUAGE;
    return canonicalTagForSlice1Language(fallbackId);
}

export function isSlice1LearnerLanguage(value: unknown): boolean {
    return slice1LanguageIdForTag(value) !== null;
}
