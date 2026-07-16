import type { ActivityEvaluation } from './activity-runtime';
import type { WorldPractice } from './world-locations';

/** Converts an earned local replay into one canonical, reviewable learner attempt. */
export function completedWorldPracticeEvaluation(practice: WorldPractice): ActivityEvaluation | undefined {
    const review = practice.review;
    if (!review) return undefined;

    return {
        result: {
            outcome: 'pass',
            score: 1,
            errorTags: [],
            feedback: { explanation: practice.success },
        },
        attempt: {
            kind: 'attempt-recorded',
            activityId: `activity:world:${practice.id}`,
            ...(review.sourceQuestionId ? { sourceQuestionId: review.sourceQuestionId } : {}),
            conceptIds: [review.conceptId],
            responseKind: practice.manipulation?.kind === 'token-order'
                ? 'world-token-order'
                : practice.manipulation?.kind === 'time-range'
                    ? 'world-time-range'
                    : practice.manipulation?.kind === 'order-grid'
                        ? 'world-order-grid'
                        : practice.manipulation?.kind === 'counter-tag'
                            ? 'world-counter-tag'
                            : practice.manipulation?.kind === 'cash-count'
                                ? 'world-cash-count'
                            : 'world-listening-choice',
            outcome: 'pass',
            score: 1,
            errorTags: [],
        },
        reviewSeeds: [{
            id: review.id,
            conceptId: review.conceptId,
            reason: 'new-learning',
            ...(review.sourceQuestionId ? { sourceQuestionId: review.sourceQuestionId } : {}),
            content: {
                expression: review.expression,
                ...(review.reading ? { reading: review.reading } : {}),
                meanings: review.meanings,
                ...(review.sentence ? { sentence: review.sentence } : {}),
            },
        }],
    };
}
