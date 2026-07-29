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
export type LearningTargetRosterEntry = Omit<LearnerLanguage, 'id'> & {
    id: LearningTargetRosterId;
};

const JAPANESE_TARGET_ROSTER_ENTRY: LearningTargetRosterEntry = Object.freeze({
    id: 'ja',
    runtimeLocale: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    defaultScript: 'Jpan',
    scripts: Object.freeze(['Jpan']),
    direction: 'ltr',
});

/**
 * The target picker is Japanese plus the frozen 32-language catalogue roster.
 * Japanese is not itself a learner/definition language in Slice 1, so this
 * view adds it without duplicating the other 32 rows or changing their IDs.
 */
export const LEARNING_TARGET_ROSTER: readonly LearningTargetRosterEntry[] = Object.freeze([
    JAPANESE_TARGET_ROSTER_ENTRY,
    ...LEARNER_LANGUAGES,
]);

const RUNTIME_BASE_TO_CATALOGUE_ID = new Map<string, Slice1LearnerLanguageId>(
    LEARNER_LANGUAGES.map(language => [
        languageSubtag(language.runtimeLocale) ?? language.id,
        language.id,
    ]),
);

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
    return RUNTIME_BASE_TO_CATALOGUE_ID.get(base) ?? null;
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
