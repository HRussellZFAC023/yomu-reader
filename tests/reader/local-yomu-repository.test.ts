import { LocalYomuSrsRepository, yomuSrsImportBatch } from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';

const STORAGE_KEY = 'yomu:srs-local:v1';

describe('LocalYomuSrsRepository semantic collection', () => {
    beforeEach(() => localStorage.clear());

    it('migrates raw and source-card ids into one canonical semantic card without losing review state', async () => {
        const now = Date.parse('2026-07-13T10:00:00.000Z');
        const semanticId = canonicalStudyCardKey('A読む', 'よむ');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            cards: {
                'yomu-local:lesson-a': storedCard({
                    id: 'yomu-local:lesson-a',
                    expression: ' Ａ読む ',
                    reading: ' よむ ',
                    meanings: ['read A'],
                    createdAt: now - 2,
                    updatedAt: now - 2,
                }),
                [semanticId]: storedCard({
                    id: semanticId,
                    expression: 'A読む',
                    reading: 'よむ',
                    meanings: ['A reading'],
                    reviews: 1,
                    intervalDays: 2,
                    lastReviewAt: now - 1,
                    dueAt: now + 86_400_000,
                    createdAt: now - 3,
                    updatedAt: now - 1,
                }),
            },
        }));

        const repository = new LocalYomuSrsRepository(() => now);
        const queue = await repository.queue(10);
        expect(queue.cards).toHaveLength(1);
        expect(queue.cards[0]).toMatchObject({
            providerCardId: semanticId,
            expression: 'A読む',
            reading: 'よむ',
            state: ['learning'],
        });
        expect(queue.cards[0]?.meanings[0]?.glosses).toEqual(['read A', 'A reading']);

        await repository.review({ card: queue.cards[0]!, grade: 'good' });
        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { cards?: Record<string, unknown> };
        expect(Object.keys(persisted.cards ?? {})).toEqual([semanticId]);
    });

    it('serializes concurrent normalized retries and merges distinct lesson provenance into one card', async () => {
        const now = 1_000_000;
        const firstRepository = new LocalYomuSrsRepository(() => now);
        const secondRepository = new LocalYomuSrsRepository(() => now);
        const firstInput = academyInput('lesson:a', 'source:lesson-a', ' Ａ読む ', ' よむ ');

        const concurrent = await Promise.all([
            firstRepository.collectAcademyVocabulary(firstInput),
            secondRepository.collectAcademyVocabulary(firstInput),
        ]);
        expect(concurrent.filter(result => result.cardCreated)).toHaveLength(1);
        expect(concurrent.filter(result => result.provenanceAdded)).toHaveLength(1);

        const secondSource = await secondRepository.collectAcademyVocabulary(
            academyInput('lesson:b', 'source:lesson-b', 'A読む', 'よむ'),
        );
        expect(secondSource).toMatchObject({ cardCreated: false, provenanceAdded: true, provenanceCount: 2 });
        expect((await firstRepository.queue(10)).cards).toHaveLength(1);

        const firstUndo = await firstRepository.removeAcademyVocabularyProvenance(secondSource.cardId, 'lesson:a');
        expect(firstUndo).toMatchObject({ provenanceRemoved: true, cardDeleted: false, reason: 'other-provenance' });
        expect((await firstRepository.queue(10)).cards).toHaveLength(1);

        const secondUndo = await secondRepository.removeAcademyVocabularyProvenance(secondSource.cardId, 'lesson:b');
        expect(secondUndo).toMatchObject({ provenanceRemoved: true, cardDeleted: true, reason: 'deleted' });
        expect((await firstRepository.queue(10)).cards).toHaveLength(0);
    });

    it('retains a reviewed Academy card after its last provenance is undone', async () => {
        let now = Date.parse('2026-07-13T10:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const collected = await repository.collectAcademyVocabulary(academyInput('lesson:a', 'source:a'));
        const [card] = (await repository.queue(10)).cards;
        await repository.review({ card: card!, grade: 'good' });
        now += 1;

        const removed = await repository.removeAcademyVocabularyProvenance(collected.cardId, 'lesson:a');
        expect(removed).toMatchObject({ provenanceRemoved: true, cardDeleted: false, reason: 'study-history' });
        const reloaded = new LocalYomuSrsRepository(() => now);
        expect((await reloaded.queue(10)).cards).toHaveLength(1);
        expect((await reloaded.stats()).reviewsToday).toBe(1);
    });

    it('never deletes an independently mined card when Academy provenance is undone', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        await repository.importBatch(yomuSrsImportBatch('manual', [{
            expression: '読む',
            reading: 'よむ',
            meanings: ['to read'],
        }], now));
        const collected = await repository.collectAcademyVocabulary(academyInput('lesson:a', 'source:a'));

        const removed = await repository.removeAcademyVocabularyProvenance(collected.cardId, 'lesson:a');
        expect(removed).toMatchObject({ provenanceRemoved: true, cardDeleted: false, reason: 'independent-card' });
        expect((await repository.queue(10)).cards).toHaveLength(1);
    });
});

function academyInput(provenanceId: string, sourceId: string, expression = '読む', reading = 'よむ') {
    return {
        expression,
        reading,
        meanings: ['to read'],
        provenance: {
            id: provenanceId,
            kind: 'study-encounter' as const,
            activityId: `activity:${provenanceId}`,
            sourceId,
        },
    };
}

function storedCard(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        id: 'legacy',
        expression: '読む',
        reading: 'よむ',
        meanings: ['to read'],
        dueAt: 0,
        lastReviewAt: null,
        createdAt: 0,
        updatedAt: 0,
        reviews: 0,
        lapses: 0,
        intervalDays: 0,
        ease: 2.5,
        ...overrides,
    };
}
