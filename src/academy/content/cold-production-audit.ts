export type AcademyLearningStepKind =
    | 'context'
    | 'instruction'
    | 'guided-practice'
    | 'assessed-recognition'
    | 'assessed-production';

export interface AcademyLearningStepContract {
    readonly id: string;
    readonly kind: AcademyLearningStepKind;
    readonly conceptIds: readonly string[];
}

export interface AcademyLearningSequenceContract {
    readonly id: string;
    readonly steps: readonly AcademyLearningStepContract[];
}

export type ColdProductionRequirement = 'context' | 'explicit-instruction' | 'guided-practice';

export interface ColdProductionIssue {
    readonly sequenceId: string;
    readonly activityId: string;
    readonly conceptId: string;
    readonly missing: readonly ColdProductionRequirement[];
}

export interface AuthoredAcademyActivityContract {
    readonly id: string;
    readonly conceptIds: readonly string[];
    readonly responseKind: string;
    /** Optional only while older adapters still expose assessment-only contracts. */
    readonly curriculumPhase?: AcademyLearningStepKind;
}

const PRODUCTION_RESPONSE_KINDS = new Set([
    'handwriting',
    'ime',
    'reconstruct',
    'speech',
    'text',
    'voice',
]);

/**
 * A production step is ready only when every assessed Concept has already had
 * a meaningful context, explicit teaching, and post-teaching guided practice.
 */
export function auditColdProductionSequence(
    sequence: AcademyLearningSequenceContract,
): readonly ColdProductionIssue[] {
    const contextualized = new Set<string>();
    const instructed = new Set<string>();
    const guided = new Set<string>();
    const issues: ColdProductionIssue[] = [];

    for (const step of sequence.steps) {
        if (step.kind === 'context') {
            step.conceptIds.forEach(conceptId => contextualized.add(conceptId));
            continue;
        }
        if (step.kind === 'instruction') {
            step.conceptIds.forEach(conceptId => instructed.add(conceptId));
            continue;
        }
        if (step.kind === 'guided-practice') {
            step.conceptIds.forEach(conceptId => {
                if (instructed.has(conceptId)) guided.add(conceptId);
            });
            continue;
        }
        if (step.kind !== 'assessed-production') continue;

        for (const conceptId of step.conceptIds) {
            const missing: ColdProductionRequirement[] = [];
            if (!contextualized.has(conceptId)) missing.push('context');
            if (!instructed.has(conceptId)) missing.push('explicit-instruction');
            if (!guided.has(conceptId)) missing.push('guided-practice');
            if (missing.length) {
                issues.push({ sequenceId: sequence.id, activityId: step.id, conceptId, missing });
            }
        }
    }
    return issues;
}

export function assertNoColdProduction(sequence: AcademyLearningSequenceContract): void {
    const issues = auditColdProductionSequence(sequence);
    if (!issues.length) return;
    const detail = issues.map(issue =>
        `${issue.activityId}/${issue.conceptId} missing ${issue.missing.join(', ')}`).join('; ');
    throw new TypeError(`Cold production in ${sequence.id}: ${detail}.`);
}

/** Audit the activity contracts that an authored Academy adapter actually exposes. */
export function auditAuthoredActivityContracts(
    sequenceId: string,
    activities: readonly AuthoredAcademyActivityContract[],
): readonly ColdProductionIssue[] {
    return auditColdProductionSequence({
        id: sequenceId,
        steps: activities.map(activity => ({
            id: activity.id,
            conceptIds: activity.conceptIds,
            kind: activity.curriculumPhase
                ?? (PRODUCTION_RESPONSE_KINDS.has(activity.responseKind)
                    ? 'assessed-production'
                    : 'assessed-recognition'),
        })),
    });
}
