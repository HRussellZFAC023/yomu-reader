import { isLearnerLanguageId, LEARNER_LANGUAGES } from '../locales/roster';
import { type LearnerLanguage, type LearnerLanguageId } from '../locales/types';
import { canonicalLanguageTag, languageSubtag } from './locale';

type Slice1LearnerLanguageId = LearnerLanguageId;

const SLICE1_TARGET_LANGUAGE = 'ja' as const;
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

export function learningTargetRosterIdForTag(value: unknown): LearningTargetRosterId | null {
    const canonical = canonicalLanguageTag(value);
    if (languageSubtag(canonical) === SLICE1_TARGET_LANGUAGE) return SLICE1_TARGET_LANGUAGE;
    return slice1LanguageIdForTag(value);
}

export function isLearningTargetRosterId(value: string): value is LearningTargetRosterId {
    return value === SLICE1_TARGET_LANGUAGE || isLearnerLanguageId(value);
}

function slice1LanguageIdForTag(value: unknown): Slice1LearnerLanguageId | null {
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
