import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import {
    createLearnerRecord,
    createMemoryLearnerEventRepository,
} from '../../src/academy/domain/learner-record';
import { projectReviewHealth } from '../../src/academy/domain/progress-projections';
import {
    LEGACY_UNGROUNDED_REVIEW_SEED_IDS,
    quarantineLegacyUngroundedReviews,
} from '../../src/academy/integration/legacy-review-quarantine';

describe('legacy ungrounded review quarantine', () => {
    beforeEach(() => localStorage.clear());

    it('deletes only unreviewed Academy-only cards and is idempotent', async () => {
        const repository = new LocalYomuSrsRepository(() => 1_000);
        const seedId = LEGACY_UNGROUNDED_REVIEW_SEED_IDS[0]!;
        await repository.collectAcademyVocabulary({
            expression: 'まっすぐ行って、右です。',
            reading: 'まっすぐいって、みぎです',
            meanings: ['Go straight, then right.'],
            provenance: { id: `academy:review-seed:${seedId}`, kind: 'review-seed' },
        });

        await expect(quarantineLegacyUngroundedReviews({ reviewRepository: repository })).resolves.toEqual({
            provenanceRemoved: 1,
            cardsDeleted: 1,
            cardsRetained: 0,
            schedulesNeutralized: 0,
        });
        expect((await repository.queue(10)).cards).toHaveLength(0);
        await expect(quarantineLegacyUngroundedReviews({ reviewRepository: repository })).resolves.toEqual({
            provenanceRemoved: 0,
            cardsDeleted: 0,
            cardsRetained: 0,
            schedulesNeutralized: 0,
        });
    });

    it('keeps a reviewed card while removing its ungrounded provenance', async () => {
        let now = 1_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const seedId = LEGACY_UNGROUNDED_REVIEW_SEED_IDS[1]!;
        const collected = await repository.collectAcademyVocabulary({
            expression: 'もう一度お願いします。',
            reading: 'もういちどおねがいします',
            meanings: ['One more time, please.'],
            provenance: { id: `academy:review-seed:${seedId}`, kind: 'review-seed' },
        });
        await repository.review({ card: collected.card, grade: 'good' });
        now += 2 * 86_400_000 + 1;

        await expect(quarantineLegacyUngroundedReviews({ reviewRepository: repository })).resolves.toEqual({
            provenanceRemoved: 1,
            cardsDeleted: 0,
            cardsRetained: 1,
            schedulesNeutralized: 0,
        });
        const [card] = (await repository.queue(10)).cards;
        expect(card).toBeDefined();
        const raw = card.raw as { academyProvenance?: Record<string, unknown>; tags?: string[] };
        expect(raw.academyProvenance).toEqual({});
        expect(raw.tags).toContain('legacy-academy');
        expect(raw.tags).not.toContain('academy');
    });

    it('supersedes a known legacy schedule without deleting its schedule or rating history', async () => {
        const learnerEvents = createMemoryLearnerEventRepository();
        const record = createLearnerRecord({ repository: learnerEvents, now: () => 2_000 });
        const seedId = LEGACY_UNGROUNDED_REVIEW_SEED_IDS[0]!;
        const scheduleEventId = `review-scheduled:yomu-local:${seedId}`;
        const reviewItemId = 'study-card:legacy-directions';
        await record.recordMany([
            {
                kind: 'review-scheduled',
                eventId: scheduleEventId,
                at: 1_000,
                reviewItemId,
                conceptId: 'concept:legacy-ungrounded-directions',
                dueAt: 1_000,
                provenance: { activity: 'activity:legacy-directions' },
            },
            {
                kind: 'review-rated',
                eventId: 'review-rated:legacy-directions',
                at: 1_500,
                reviewItemId,
                rating: 'good',
            },
        ]);

        await expect(quarantineLegacyUngroundedReviews({
            reviewRepository: new LocalYomuSrsRepository(() => 2_000),
            learnerEvents,
        })).resolves.toEqual({
            provenanceRemoved: 0,
            cardsDeleted: 0,
            cardsRetained: 0,
            schedulesNeutralized: 1,
        });

        const history = await record.history();
        expect(history.filter(event => event.kind === 'review-scheduled')).toHaveLength(1);
        expect(history).toContainEqual(expect.objectContaining({
            kind: 'review-schedule-neutralized',
            scheduledEventId: scheduleEventId,
            reason: 'legacy-ungrounded-academy',
        }));
        const projection = await record.snapshot();
        expect(projection.scheduledReviews).toEqual({});
        expect(projection.reviewRatings).toEqual({ [reviewItemId]: 'good' });
        expect(projectReviewHealth(history, 2_000)).toEqual({
            scheduled: 0,
            due: 0,
            ratings: { again: 0, hard: 0, good: 1, easy: 0 },
            repairNeeded: 0,
        });

        const eventCount = history.length;
        await expect(quarantineLegacyUngroundedReviews({
            reviewRepository: new LocalYomuSrsRepository(() => 2_001),
            learnerEvents,
        })).resolves.toMatchObject({ schedulesNeutralized: 0 });
        expect(await record.history()).toHaveLength(eventCount);
    });
});
