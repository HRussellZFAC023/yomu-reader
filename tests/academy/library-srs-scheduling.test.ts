import { createLibraryVocabularySheet, libraryVocabularyReviewSeeds } from '../../src/academy/content/library-vocabulary-sheet';
import { createMemoryLearnerEventRepository } from '../../src/academy/domain/learner-record';
import { createLearnerEvidence } from '../../src/academy/evidence/learner-evidence';
import {
    DEFAULT_LIBRARY_REVIEW_LIMIT,
    scheduleLibrarySyllabusReviews,
} from '../../src/academy/library/scheduled-syllabus-reviews';
import { createYomuLocalReviewService } from '../../src/academy/integration/yomu-local-review';
import { LocalYomuSrsRepository, yomuSrsImportBatch } from '../../src/reader/srs/local-yomu';
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

        expect(seeds).toHaveLength(27);
        expect(due).toHaveLength(seeds.length);
        expect(due[0]).toMatchObject({
            id: firstIdentity.key,
            expression: firstIdentity.expression,
            dueAt: now,
        });
        const cards = (await repository.queue(DEFAULT_LIBRARY_REVIEW_LIMIT)).cards;
        expect(cards).toHaveLength(seeds.length);
        for (const seed of seeds) {
            const identity = canonicalStudyCardIdentity(seed.content.expression, seed.content.reading);
            const card = cards.find(candidate => candidate.providerCardId === identity.key);
            expect(card, seed.sourceQuestionId).toMatchObject({
                expression: identity.expression,
                reading: identity.reading,
                state: ['new'],
                meanings: [{ glosses: seed.content.meanings, partOfSpeech: [] }],
            });
        }
        expect(cards.map(card => card.expression)).toEqual(expect.arrayContaining([
            'なまえ', 'しごと', 'くに', 'はい', 'いいえ',
            'おはよう', 'こんにちは', 'こんばんは', 'ありがとう', 'すみません',
            'はじめまして', 'わたし',
        ]));
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
        const reviewed = await repository.review({ card: firstCard, grade: 'good' });
        expect(reviewed.card?.raw).toMatchObject({
            dueAt: firstSeenAt + 2 * 86_400_000,
            lastReviewAt: firstSeenAt,
            reviews: 1,
            lapses: 0,
            intervalDays: 2,
            ease: 2.5,
        });
        now += 1;

        const revisited = await scheduleLibrarySyllabusReviews(evidence, sheet);

        expect(revisited.some(item => item.id === firstCard.providerCardId)).toBe(false);
        expect((await repository.stats()).levelCounts).toMatchObject({ new: firstQueue.length - 1, learning: 1 });
        expect((await events.readAll()).filter(event => event.kind === 'review-scheduled')).toHaveLength(firstQueue.length);

        now = firstSeenAt + 2 * 86_400_000;
        const scheduled = (await repository.queue(DEFAULT_LIBRARY_REVIEW_LIMIT)).cards
            .find(card => card.providerCardId === firstCard.providerCardId);
        expect(scheduled).toMatchObject({ dueAt: firstSeenAt + 2 * 86_400_000, state: ['due'] });
        expect(scheduled?.raw).toMatchObject({
            dueAt: firstSeenAt + 2 * 86_400_000,
            lastReviewAt: firstSeenAt,
            reviews: 1,
            lapses: 0,
            intervalDays: 2,
            ease: 2.5,
        });
    });

    it('does not pull an existing unreviewed Yomu card forward when l1-l01 is seeded', async () => {
        let now = Date.parse('2026-07-17T09:00:00.000Z');
        const futureDueAt = now + 7 * 86_400_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const events = createMemoryLearnerEventRepository();
        const evidence = createLearnerEvidence(events, createYomuLocalReviewService(repository, () => now));
        const sheet = createLibraryVocabularySheet();
        const first = libraryVocabularyReviewSeeds(sheet)[0]!;
        const identity = canonicalStudyCardIdentity(first.content.expression, first.content.reading);
        const importedAt = now - 86_400_000;
        await repository.importBatch(yomuSrsImportBatch('existing-yomu-deck', [{
            expression: identity.expression,
            reading: identity.reading,
            meanings: ['Existing meaning'],
            sentence: 'わたしのなまえはヘンリーです。',
            sourceProviderId: 'jiten',
            sourceCardId: 'jiten:beginner-name',
            sourceUrl: 'https://jiten.moe/word/beginner-name',
            tags: ['jiten-import', 'beginner'],
            dueAt: futureDueAt,
        }], importedAt));
        await evidence.initialize();

        const due = await scheduleLibrarySyllabusReviews(evidence, sheet);

        expect(due.some(item => item.id === identity.key)).toBe(false);
        now = futureDueAt;
        const stored = (await repository.queue(100)).cards.find(card => card.providerCardId === identity.key);
        expect(stored).toMatchObject({
            reading: identity.reading,
            sentence: 'わたしのなまえはヘンリーです。',
            sourceUrl: 'https://jiten.moe/word/beginner-name',
            dueAt: futureDueAt,
            lastReviewAt: null,
            state: ['new'],
        });
        expect(stored?.meanings.flatMap(meaning => meaning.glosses)).toEqual(
            expect.arrayContaining(['Existing meaning', first.content.meanings[0]]),
        );
        expect(stored?.raw).toMatchObject({
            sourceProviderId: 'jiten',
            sourceCardId: 'jiten:beginner-name',
            sourceUrl: 'https://jiten.moe/word/beginner-name',
            tags: expect.arrayContaining(['jiten-import', 'beginner', 'academy']),
            dueAt: futureDueAt,
            lastReviewAt: null,
            createdAt: importedAt,
            reviews: 0,
            lapses: 0,
            intervalDays: 0,
            ease: 2.5,
        });
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
