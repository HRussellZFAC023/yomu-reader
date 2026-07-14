import type { ActivityEvaluation, ReviewSeed } from '../../../src/academy/domain/activity-runtime';
import type { GroundedLessonResolver } from '../../../src/academy/content/grounded-lesson-resolver';
import { canonicalGroundedConceptReviewKey } from '../../../src/academy/domain/review-identity';
import type {
    GroundedDefinitionRef,
    GroundedLessonContract,
    GroundingProofSet,
} from '../../../src/academy/domain/grounded-lesson';

export function groundedLessonForEvaluation(evaluation: ActivityEvaluation): GroundedLessonContract {
    const target = evaluation.attempt.activityId;
    const independent = 'activity:test-independent';
    const transfer = 'activity:test-transfer';
    return {
        schemaVersion: 1,
        lessonId: 'lesson:test-grounded',
        contentRevision: 'test.v1',
        status: 'playable',
        blockerIds: [],
        overview: {
            proofs: proofsFor({
                activityId: 'activity:test-overview',
                conceptIds: ['concept:test-overview'],
                reviewSeeds: [testSeed('review:test-overview', 'concept:test-overview', '概要', 'がいよう')],
                entry: true,
            }),
            productionSequence: {
                state: 'ready',
                evidence: {
                    guidedActivityIds: [target],
                    independentActivityIds: [independent],
                    changedContextTransfers: [{
                        activityId: transfer,
                        fromContextId: 'context:test-lesson',
                        toContextId: 'context:test-transfer',
                    }],
                },
            },
        },
        activities: [
            activity(target, 1, 'guided', proofsFor({
                activityId: target,
                conceptIds: evaluation.attempt.conceptIds,
                reviewSeeds: evaluation.reviewSeeds,
                sourceQuestionId: evaluation.attempt.sourceQuestionId,
                entry: true,
            })),
            activity(independent, 2, 'independent', proofsFor({
                activityId: independent,
                conceptIds: ['concept:test-independent'],
                reviewSeeds: [testSeed('review:test-independent', 'concept:test-independent', '自分', 'じぶん')],
            })),
            activity(transfer, 3, 'transfer', proofsFor({
                activityId: transfer,
                conceptIds: ['concept:test-transfer'],
                reviewSeeds: [testSeed('review:test-transfer', 'concept:test-transfer', '応用', 'おうよう')],
            })),
        ],
    };
}

export function staticGroundedLessonResolver(lesson: GroundedLessonContract): GroundedLessonResolver {
    return {
        async resolve(lessonId) {
            if (lessonId !== lesson.lessonId) throw new TypeError(`Unexpected test lesson ${lessonId}.`);
            return structuredClone(lesson);
        },
    };
}

function activity(
    id: string,
    order: number,
    phase: 'guided' | 'independent' | 'transfer',
    proofs: GroundingProofSet,
) {
    return { id, order, phase, production: true, status: 'playable' as const, blockerIds: [], proofs };
}

function proofsFor(options: Readonly<{
    activityId: string;
    conceptIds: readonly string[];
    reviewSeeds: readonly ReviewSeed[];
    sourceQuestionId?: string;
    entry?: boolean;
}>): GroundingProofSet {
    const input: GroundingProofSet['input'] = options.sourceQuestionId
        ? {
            state: 'ready',
            evidence: {
                kind: 'source',
                sourceQuestionIds: [options.sourceQuestionId],
                documents: [{
                    id: 'document:test-grounded',
                    sha256: 'a'.repeat(64),
                    extractionRevision: 'test.v1',
                }],
            },
        }
        : {
            state: 'ready',
            evidence: {
                kind: 'authored',
                authoredInputIds: ['input:test-grounded'],
                revision: 'test.v1',
                authorId: 'author:test',
                rationale: 'Grounded test input.',
                languageReview: {
                    reviewerId: 'reviewer:test',
                    revision: 'test.v1',
                    register: 'reviewed',
                    naturalness: 'reviewed',
                },
            },
        };
    const reviewItems = [...new Map(options.reviewSeeds.map(seed => [
        canonicalGroundedConceptReviewKey(seed.content.expression, seed.content.reading, seed.conceptId),
        {
            seedId: seed.id,
            conceptId: seed.conceptId,
            expressionKey: seed.content.expression,
            readingKey: seed.content.reading ?? seed.content.expression,
        },
    ])).values()];
    return {
        input,
        curriculum: {
            state: 'ready',
            evidence: {
                conceptIds: [...options.conceptIds],
                outcomeIds: [`outcome:${suffix(options.activityId)}`],
                prerequisites: options.entry
                    ? { kind: 'entry', reason: 'This is the test entry activity.' }
                    : {
                        kind: 'resolved',
                        conceptIds: ['concept:test-prior'],
                        resolution: definition(`prerequisite-resolution:${suffix(options.activityId)}`),
                    },
            },
        },
        instruction: {
            state: 'ready',
            evidence: {
                sequence: 'before-assessment',
                conceptCoverage: options.conceptIds.map(conceptId => ({
                    conceptId,
                    explanationRefs: [definition(`explanation:${suffix(conceptId)}`)],
                    workedExampleRefs: [definition(`worked-example:${suffix(conceptId)}`)],
                })),
            },
        },
        answerConcealment: {
            state: 'ready',
            evidence: {
                surfaceAudit: definition(`surface-audit:${suffix(options.activityId)}`),
                answerBearingContent: definition(`answer-bearing-content:${suffix(options.activityId)}`),
                auditBinding: {
                    surfaceId: `surface:${suffix(options.activityId)}`,
                    renderer: definition('surface-renderer:test-grounded'),
                    contentRevision: 'test.v1',
                },
                learnerFacingPreCommit: {
                    translations: 'absent',
                    transcripts: 'absent',
                    modelAnswers: 'absent',
                    acceptedAnswers: 'absent',
                },
                revealPolicy: 'after-first-attempt',
            },
        },
        media: { state: 'ready', evidence: { state: 'not-required', reason: 'Text-only test.' } },
        assessment: {
            state: 'ready',
            evidence: {
                method: 'deterministic',
                grader: definition(`grader:${suffix(options.activityId)}`),
                answerSets: [definition(`answer-set:${suffix(options.activityId)}`)],
            },
        },
        repair: {
            state: 'ready',
            evidence: {
                errorTagIds: [`error:${suffix(options.activityId)}`],
                feedbackIds: [`feedback:${suffix(options.activityId)}`],
                nearbyExampleIds: [`nearby-example:${suffix(options.activityId)}`],
                retry: 'same-activity',
            },
        },
        learnerEvidence: {
            state: 'ready',
            evidence: {
                attemptEventKind: 'attempt-recorded',
                reviewRepository: 'canonical-yomu',
                reviewItems,
            },
        },
        accessibility: {
            state: 'ready',
            evidence: {
                keyboardNavigation: 'equivalent',
                touchNavigation: 'equivalent',
                screenReader: 'equivalent',
                reducedMotion: 'equivalent',
                mediaAlternative: 'not-required',
                primaryEvidenceModality: 'constructed-text',
                inputAlternative: { kind: 'not-required', reason: 'The test uses text input.' },
            },
        },
    };
}

function definition(id: string): GroundedDefinitionRef {
    return { id, registry: 'academy-content', revision: 'test.v1', sha256: 'b'.repeat(64) };
}

function suffix(id: string): string {
    return id.split(':').at(-1) ?? 'test';
}

function testSeed(id: string, conceptId: string, expression: string, reading: string): ReviewSeed {
    return {
        id,
        conceptId,
        reason: 'new-learning',
        content: { expression, reading, meanings: ['Test'] },
    };
}
