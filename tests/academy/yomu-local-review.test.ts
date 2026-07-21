import { LocalYomuSrsRepository, yomuSrsImportBatch } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import { createYomuLocalReviewService } from '../../src/academy/integration/yomu-local-review';
import { n3StoryPractice, storyPractice } from '../../src/academy/content/n3-story-practice';
import { storyReplayReviewSeed } from '../../src/academy/content/story-replay-catalog';
import type { ActivityEvaluation, ReviewSeed } from '../../src/academy/domain/activity-runtime';
import { createLibraryVocabularySheet, libraryVocabularyReviewSeeds } from '../../src/academy/content/library-vocabulary-sheet';
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

    it('reads new and cleared syllabus state from the same shared Yomu deck', async () => {
        let now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const service = createYomuLocalReviewService(repository, () => now);
        const syllabus = [{ id: 'lesson:read', expression: '読む', reading: 'よむ' }] as const;

        await expect(service.syllabusState?.(syllabus)).resolves.toBe('new');
        const collected = await repository.collectAcademyVocabulary({
            expression: '読む',
            reading: 'よむ',
            meanings: ['to read'],
            provenance: { id: 'academy:study-syllabus:lesson:read', kind: 'study-encounter', sourceId: 'lesson:read' },
        });
        await repository.review({ card: collected.card, grade: 'good' });
        now += 1;

        await expect(service.syllabusState?.(syllabus)).resolves.toBe('cleared');
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
        expect((await reloaded.queue(10)).cards).toEqual([]);
        expect(await reloaded.stats()).toMatchObject({ reviewsToday: 1, levelCounts: { new: 0, learning: 1, known: 0 } });
        expect(await createYomuLocalReviewService(reloaded, () => now).due(10)).toHaveLength(0);

        now += 2 * 86_400_000;
        const [rescheduled] = (await reloaded.queue(10)).cards;
        expect(rescheduled).toMatchObject({ providerCardId: semanticId, state: ['due'] });
    });

    it('ingests a passed story replay into the real Yomu SRS queue before scheduling its callback', async () => {
        const now = Date.parse('2026-07-15T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const review = createYomuLocalReviewService(repository, () => now);
        const events = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(events, review);
        const practice = n3StoryPractice('activity:story-n3:after-applause-tone')!;
        await evidence.initialize();

        await evidence.recordAuthoredStoryPractice({
            ...practice,
            reviewSeed: storyReplayReviewSeed(practice),
        }, 'pass');

        const [card] = (await repository.queue(10)).cards;
        expect(card).toMatchObject({ expression: 'まだ決定していない。', state: ['new'] });
        expect(Object.values(evidence.projection.scheduledReviews)).toEqual([
            expect.objectContaining({ reviewItemId: canonicalStudyCardKey('まだ決定していない。'), conceptId: practice.conceptIds[0] }),
        ]);
    });

    it('records Season 4 choice and production gates with truthful evidence and SRS provenance', async () => {
        const now = Date.parse('2026-07-20T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const review = createYomuLocalReviewService(repository, () => now);
        const events = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(events, review);
        const activityIds = [
            'activity:s4e02-map-of-claims-evidence-map',
            'activity:s4e04-three-true-versions-synthesis',
            'activity:s4e05-left-unsaid-trim-the-line',
            'activity:s4e06-open-question-reframe-premise',
            'activity:s4e07-journey-not-everyone-takes-non-comparative-futures',
            'activity:s4e08-last-revision-vivid-without-restoring',
        ] as const;
        await evidence.initialize();

        for (const activityId of activityIds) {
            const practice = storyPractice(activityId)!;
            await evidence.recordAuthoredStoryPractice({
                ...practice,
                reviewSeed: storyReplayReviewSeed(practice),
            }, 'pass');
        }

        const recorded = (await events.readAll()).filter(event =>
            event.kind === 'learning-evidence-recorded' && activityIds.includes(event.activityId as typeof activityIds[number]));
        expect(recorded).toHaveLength(activityIds.length);
        expect(recorded).toEqual(activityIds.map(activityId => {
            const practice = storyPractice(activityId)!;
            return expect.objectContaining({
                kind: 'learning-evidence-recorded',
                activityId,
                modeId: 'authored-story-practice',
                skill: practice.skill,
                action: practice.action,
                outcome: 'pass',
                independent: true,
            });
        }));

        const expectedExpressions = activityIds.map(activityId => {
            const practice = storyPractice(activityId)!;
            return practice.reviewAnswer.ja;
        });
        expect((await repository.queue(10)).cards.map(card => card.providerCardId))
            .toEqual(expect.arrayContaining(expectedExpressions.map(expression => canonicalStudyCardKey(expression))));
        const scheduled = (await events.readAll()).filter(event => event.kind === 'review-scheduled');
        expect(scheduled).toHaveLength(activityIds.length);
        expect(scheduled.map(event => event.provenance.response)).toEqual(activityIds.map(activityId => {
            const interaction = storyPractice(activityId)!.interaction;
            return interaction === 'choice' ? 'selected-response' : interaction;
        }));
    });

    it('seeds verified pre-study rows into the real local SRS without recording pretend answers', async () => {
        let now = Date.parse('2026-07-15T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const review = createYomuLocalReviewService(repository, () => now);
        const events = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(events, review);
        const seeds = libraryVocabularyReviewSeeds(createLibraryVocabularySheet());
        await evidence.initialize();

        await evidence.seedVocabularyPrerequisite('authored-week:l1-l01', seeds);
        const [first] = (await repository.queue(100)).cards;
        expect(first).toMatchObject({ state: ['new'] });
        expect((await events.readAll()).filter(event => event.kind === 'attempt-recorded')).toEqual([]);
        const scheduled = (await events.readAll()).filter(event => event.kind === 'review-scheduled');
        expect(scheduled.length).toBeGreaterThan(0);
        expect(scheduled.every(event => event.provenance.prerequisite === 'authored-week:l1-l01')).toBe(true);

        await repository.review({ card: first!, grade: 'good' });
        now += 1;
        await evidence.seedVocabularyPrerequisite('authored-week:l1-l01', seeds);
        expect((await repository.queue(100)).cards.some(card => card.providerCardId === first!.providerCardId)).toBe(false);
        expect((await events.readAll()).filter(event => event.kind === 'review-scheduled')).toHaveLength(scheduled.length);
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
