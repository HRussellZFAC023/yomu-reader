import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LEARNING_TARGET_ROSTER,
    studyTargetReadinessMeets,
    type LearningTargetRosterEntry,
    type StudyTargetReadiness,
} from '../../src/reader/languages/roster';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLISHED_RECOMMENDATIONS_DIRECTORY = 'config/dictionaries/published/v1/recommendations';

interface PublishedRecommendation {
    learnerLanguage?: unknown;
    dictionaries?: unknown;
}

export interface HeroStudyLanguage {
    id: string;
    locale: string;
    englishName: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}

export type StudyTargetClaimReadiness = Exclude<StudyTargetReadiness, 'planned'>;

/**
 * The homepage names every target that can support reading and lookup. Keep the
 * strength of its copy separate from that membership rule: otherwise changing
 * the claim to `full` would merely hide reading-only targets and make the gate
 * approve its own overstatement.
 */
export const HOMEPAGE_STUDY_TARGET_CLAIM_READINESS =
    'reading-only' as const satisfies StudyTargetClaimReadiness;
const HERO_TARGET_MINIMUM_READINESS =
    'reading-only' as const satisfies StudyTargetClaimReadiness;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Assert a product surface's explicit claim against the canonical, deliberately
 * hand-maintained target-readiness field.
 */
export function assertStudyTargetClaimReadiness(
    targetIds: readonly string[],
    claimedReadiness: StudyTargetClaimReadiness,
    surface = 'Product surface',
): void {
    const targetsById = new Map<string, LearningTargetRosterEntry>(
        LEARNING_TARGET_ROSTER.map(target => [target.id, target]),
    );
    for (const targetId of targetIds) {
        const target = targetsById.get(targetId);
        if (!target) {
            throw new Error(`${surface} claims an unknown study target: ${targetId}.`);
        }
        if (!studyTargetReadinessMeets(target.studyTargetReadiness, claimedReadiness)) {
            throw new Error(
                `${surface} claims ${target.englishName} (${target.id}) as ${claimedReadiness}, `
                + `but its study-target readiness is ${target.studyTargetReadiness}.`,
            );
        }
    }
}

/**
 * Public hero membership is every target ready for reading and lookup. The
 * separate assertion above prevents its copy from implying the full Japanese
 * feature set for a reading-only target.
 */
export function heroStudyLanguages(
    claimedReadiness: StudyTargetClaimReadiness = HOMEPAGE_STUDY_TARGET_CLAIM_READINESS,
): readonly HeroStudyLanguage[] {
    const languages = LEARNING_TARGET_ROSTER
        .filter(language =>
            studyTargetReadinessMeets(language.studyTargetReadiness, HERO_TARGET_MINIMUM_READINESS),
        );
    assertStudyTargetClaimReadiness(
        languages.map(language => language.id),
        claimedReadiness,
        'Homepage hero',
    );
    const heroLanguages = languages
        .map(language => ({
            id: language.id,
            locale: language.runtimeLocale,
            englishName: language.englishName,
            nativeName: language.nativeName,
            direction: language.direction,
        }));
    if (!heroLanguages.length) {
        throw new Error('The shipped target roster exposes no reading-ready study targets.');
    }
    return heroLanguages;
}

/**
 * Count distinct learner languages with at least one published pair whose
 * definitions are written in that learner language. A learner now has one
 * manifest per target, so counting matching files would multiply the claim by
 * the number of readable targets.
 */
export function measuredDefinitionLanguageCount(
    recommendationsDirectory = path.join(PROJECT_ROOT, PUBLISHED_RECOMMENDATIONS_DIRECTORY),
): number {
    const definitionLanguages = new Set<string>();
    readdirSync(recommendationsDirectory)
        .filter(file => file.endsWith('.json'))
        .map(file => JSON.parse(readFileSync(path.join(recommendationsDirectory, file), 'utf8')) as PublishedRecommendation)
        .forEach(recommendation => {
            if (typeof recommendation.learnerLanguage !== 'string') return;
            if (!Array.isArray(recommendation.dictionaries)) return;
            if (recommendation.dictionaries.some(dictionary =>
                isRecord(dictionary)
                && dictionary.definitionLanguage === recommendation.learnerLanguage,
            )) {
                definitionLanguages.add(recommendation.learnerLanguage);
            }
        });
    return definitionLanguages.size;
}
