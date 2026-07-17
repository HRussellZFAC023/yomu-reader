import { createLibraryVocabularySheet, libraryVocabularyReviewSeeds } from '../../src/academy/content/library-vocabulary-sheet';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import {
    DEFAULT_LIBRARY_REVIEW_LIMIT,
    scheduleLibrarySyllabusReviews,
} from '../../src/academy/library/scheduled-syllabus-reviews';
import { createYomuLocalReviewService } from '../../src/academy/integration/yomu-local-review';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardIdentity } from '../../src/reader/srs/shared';

describe('Library syllabus review scheduling', () => {
    beforeEach(() => localStorage.clear());

    it('seeds a fresh syllabus before reading Yomu due reviews', async () => {
        const now = Date.parse('2026-07-17T09:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const events = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(events, createYomuLocalReviewService(repository, () => now));
        const sheet = createLibraryVocabularySheet();
        const seeds = libraryVocabularyReviewSeeds(sheet);
        const firstIdentity = canonicalStudyCardIdentity(seeds[0]!.content.expression, seeds[0]!.content.reading);
        await evidence.initialize();

        const due = await scheduleLibrarySyllabusReviews(evidence, sheet);

        expect(due).toHaveLength(seeds.length);
        expect(due[0]).toMatchObject({
            id: firstIdentity.key,
            expression: firstIdentity.expression,
            dueAt: now,
        });
        expect((await repository.queue(DEFAULT_LIBRARY_REVIEW_LIMIT)).cards[0]?.state).toEqual(['new']);
        expect((await events.readAll()).filter(event => event.kind === 'review-scheduled')).toHaveLength(due.length);
    });

    it('does not reset a reviewed syllabus card when the Library is revisited', async () => {
        const firstSeenAt = Date.parse('2026-07-17T09:00:00.000Z');
        let now = firstSeenAt;
        const repository = new LocalYomuSrsRepository(() => now);
        const events = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(events, createYomuLocalReviewService(repository, () => now));
        const sheet = createLibraryVocabularySheet();
        await evidence.initialize();

        const firstQueue = await scheduleLibrarySyllabusReviews(evidence, sheet);
        const firstCard = (await repository.queue(DEFAULT_LIBRARY_REVIEW_LIMIT)).cards
            .find(card => card.providerCardId === firstQueue[0]?.id);
        if (!firstCard) throw new Error('Expected the first syllabus card in Yomu.');
        await repository.review({ card: firstCard, grade: 'good' });
        now += 1;

        const revisited = await scheduleLibrarySyllabusReviews(evidence, sheet);

        expect(revisited.some(item => item.id === firstCard.providerCardId)).toBe(false);
        expect((await repository.stats()).levelCounts).toMatchObject({ new: firstQueue.length - 1, learning: 1 });
        expect((await events.readAll()).filter(event => event.kind === 'review-scheduled')).toHaveLength(firstQueue.length);

        now = firstSeenAt + 2 * 86_400_000;
        const scheduled = (await repository.queue(DEFAULT_LIBRARY_REVIEW_LIMIT)).cards
            .find(card => card.providerCardId === firstCard.providerCardId);
        expect(scheduled).toMatchObject({ dueAt: firstSeenAt + 2 * 86_400_000, state: ['due'] });
    });

    it('validates the queue limit before mutating the scheduler', async () => {
        const scheduler = {
            seedVocabularyPrerequisite: vi.fn(async () => {}),
            dueReviews: vi.fn(async () => []),
        };

        await expect(scheduleLibrarySyllabusReviews(scheduler, createLibraryVocabularySheet(), 0))
            .rejects.toThrow('Library review limit must be a positive integer.');
        expect(scheduler.seedVocabularyPrerequisite).not.toHaveBeenCalled();
        expect(scheduler.dueReviews).not.toHaveBeenCalled();
    });
});
