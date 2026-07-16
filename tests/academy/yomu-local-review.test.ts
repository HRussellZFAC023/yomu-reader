import { LocalYomuSrsRepository, yomuSrsImportBatch } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import { createYomuLocalReviewService } from '../../src/academy/integration/yomu-local-review';
import type { ActivityEvaluation, ReviewSeed } from '../../src/academy/domain/activity-runtime';
import { groundedLessonForEvaluation, staticGroundedLessonResolver } from './fixtures/grounded-lesson';

describe('Academy Yomu review bridge', () => {
    beforeEach(() => localStorage.clear());

    it('imports activity evidence into Yomu and records a canonical review rating', async () => {
        let now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const service = createYomuLocalReviewService(repository, () => now);
        const seed: ReviewSeed = {
            id: 'review:please-repeat',
            conceptId: 'concept:repair-language',
            reason: 'repair',
            sourceQuestionId: 'question:welcome-1',
            content: {
                expression: 'もう一度お願いします',
                reading: 'もういちどおねがいします',
                meanings: ['One more time, please.'],
                sentence: 'すみません。もう一度お願いします。',
            },
        };

        await service.ingest([seed]);
        const [item] = await service.due(5);
        expect(item).toMatchObject({
            expression: 'もう一度お願いします',
            reading: 'もういちどおねがいします',
            meaning: 'One more time, please.',
        });

        await service.rate(item.id, 'good');
        now += 1;
        expect(await service.due(5)).toHaveLength(0);
        expect((await repository.stats()).reviewsToday).toBe(1);
    });

    it('does not miss a due card beyond the review-ahead insertion window', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        await repository.importBatch(yomuSrsImportBatch('queue-order-audit', [
            ...Array.from({ length: 60 }, (_, index) => ({
                expression: `未来語${index}`,
                reading: `みらいご${index}`,
                meanings: [`future ${index}`],
                dueAt: now + index + 1,
            })),
            {
                expression: '期限',
                reading: 'きげん',
                meanings: ['deadline'],
                dueAt: now - 1,
            },
        ], now));

        await expect(createYomuLocalReviewService(repository, () => now).due(1)).resolves.toEqual([
            expect.objectContaining({ expression: '期限', dueAt: now - 1 }),
        ]);
    });

    it('carries a real Academy attempt through the canonical Study card, grade, stats, and reload', async () => {
        let now = Date.parse('2026-07-13T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const review = createYomuLocalReviewService(repository, () => now);
        const eventRepository = createMemoryLearnerEventRepository();
        const seed = repeatSeed();
        const normalizedDuplicate: ReviewSeed = {
            ...seed,
            id: 'review:please-repeat:worksheet',
            sourceQuestionId: 'question:worksheet-2',
            content: { ...seed.content, expression: ' もう一度お願いします ' },
        };
        const evaluation: ActivityEvaluation = {
            result: {
                outcome: 'pass',
                score: 1,
                errorTags: [],
                feedback: { explanation: { en: 'Good.', ja: 'いいですね。' } },
            },
            attempt: {
                kind: 'attempt-recorded',
                eventId: 'attempt:please-repeat',
                activityId: 'activity:please-repeat',
                sourceQuestionId: 'question:welcome-1',
                conceptIds: ['concept:repair-language'],
                responseKind: 'constructed-response',
                outcome: 'pass',
                score: 1,
                errorTags: [],
            },
            reviewSeeds: [seed, normalizedDuplicate],
        };
        const lesson = groundedLessonForEvaluation(evaluation);
        const evidence = createLearnerEvidence(eventRepository, review, staticGroundedLessonResolver(lesson));
        await evidence.initialize();

        await evidence.recordActivity(evaluation, lesson.lessonId);
        const semanticId = canonicalStudyCardKey(seed.content.expression, seed.content.reading);
        const queue = await repository.queue(10);
        expect(queue.cards).toHaveLength(1);
        expect(queue.cards[0]).toMatchObject({ providerCardId: semanticId, state: ['new'] });
        expect(Object.keys(evidence.projection.scheduledReviews)).toEqual([semanticId]);

        const [due] = await evidence.dueReviews(10);
        expect(due.id).toBe(semanticId);
        await evidence.rateReview(due.id, 'good');
        now += 1;

        const reloaded = new LocalYomuSrsRepository(() => now);
        const reloadedQueue = await reloaded.queue(10);
        expect(reloadedQueue.cards).toHaveLength(1);
        expect(reloadedQueue.cards[0]).toMatchObject({ providerCardId: semanticId, state: ['learning'] });
        expect(await reloaded.stats()).toMatchObject({ reviewsToday: 1, levelCounts: { new: 0, learning: 1, known: 0 } });
        expect(await createYomuLocalReviewService(reloaded, () => now).due(10)).toHaveLength(0);
    });
});

function repeatSeed(): ReviewSeed {
    return {
        id: 'review:please-repeat',
        conceptId: 'concept:repair-language',
        reason: 'repair',
        sourceQuestionId: 'question:welcome-1',
        content: {
            expression: 'もう一度お願いします',
            reading: 'もういちどおねがいします',
            meanings: ['One more time, please.'],
            sentence: 'すみません。もう一度お願いします。',
        },
    };
}
