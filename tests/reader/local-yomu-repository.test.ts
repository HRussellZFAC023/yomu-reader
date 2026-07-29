import {
    LocalYomuSrsRepository,
    subscribeLocalYomuSrsMutations,
    yomuSrsImportBatch,
} from '../../src/reader/srs/local-yomu';
import { canonicalStudyCardKey } from '../../src/reader/srs/shared';
import { mergeStoredYomuSrsDecks } from '../../src/reader/srs/local-yomu-deck';

const STORAGE_KEY = 'yomu:srs-local:v1';

describe('LocalYomuSrsRepository semantic collection', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => { vi.unstubAllGlobals(); });

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
                    dueAt: now,
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
            state: ['due'],
        });
        expect(queue.cards[0]?.meanings[0]?.glosses).toEqual(['read A', 'A reading']);

        await repository.review({ card: queue.cards[0]!, grade: 'good' });
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        const persisted = await repository.snapshot();
        expect(Object.keys(persisted.cards)).toEqual([semanticId]);
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

    it('keeps distinct cards when independent tab runtimes mutate the shared GM deck together', async () => {
        const values = new Map<string, unknown>();
        vi.stubGlobal('GM_getValue', vi.fn((key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback));
        vi.stubGlobal('GM_setValue', vi.fn((key: string, value: unknown) => { values.set(key, structuredClone(value)); }));
        vi.stubGlobal('GM_deleteValue', vi.fn((key: string) => { values.delete(key); }));
        vi.stubGlobal('GM_listValues', vi.fn(() => [...values.keys()]));

        vi.resetModules();
        const FirstRuntimeRepository = (await import('../../src/reader/srs/local-yomu')).LocalYomuSrsRepository;
        vi.resetModules();
        const SecondRuntimeRepository = (await import('../../src/reader/srs/local-yomu')).LocalYomuSrsRepository;
        const first = new FirstRuntimeRepository(() => 1_000_000);
        const second = new SecondRuntimeRepository(() => 1_000_001);

        await Promise.all([
            first.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' }),
            second.mine({ expression: '書く', reading: 'かく', meaning: 'to write' }),
        ]);

        const stored = await first.snapshot();
        expect(Object.keys(stored.cards).sort()).toEqual([
            canonicalStudyCardKey('書く', 'かく'),
            canonicalStudyCardKey('読む', 'よむ'),
        ].sort());
    });

    it('keeps a stable review-seed provenance across a lapse followed by a pass', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const base = academyInput('review:lesson-zero-repeat', 'source:classroom-09', 'もう一度お願いします', 'もういちどおねがいします');

        await repository.collectAcademyVocabulary({
            ...base,
            provenance: { ...base.provenance, kind: 'review-seed', conceptId: 'expression:classroom-09', reason: 'repair' },
        });
        const retried = await repository.collectAcademyVocabulary({
            ...base,
            provenance: { ...base.provenance, kind: 'review-seed', conceptId: 'expression:classroom-09', reason: 'new-learning' },
        });

        expect(retried).toMatchObject({ cardCreated: false, provenanceAdded: false, provenanceCount: 1 });
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
        expect((await repository.queue(10)).cards).toHaveLength(0);
        expect((await repository.stats()).reviewsToday).toBe(1);
        now += 2 * 86_400_000;
        const reloaded = new LocalYomuSrsRepository(() => now);
        expect((await reloaded.queue(10)).cards).toHaveLength(1);
    });

    it.each([
        ['again', 10 * 60_000, 0],
        ['hard', 86_400_000, 1],
        ['good', 2 * 86_400_000, 2],
        ['easy', 4 * 86_400_000, 4],
    ] as const)('schedules a new-card %s grade at its real due time', async (grade, delay, intervalDays) => {
        let now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const collected = await repository.collectAcademyVocabulary({
            ...academyInput(`lesson:${grade}`, `source:${grade}`, `読む${grade}`, 'よむ'),
            meanings: [],
        });

        const reviewed = await repository.review({ card: collected.card, grade });
        expect(reviewed.card).toMatchObject({ dueAt: now + delay, state: ['learning'] });
        expect(reviewed.card?.raw).toMatchObject({ intervalDays, reviews: 1 });
        expect((await repository.queue(10)).cards).toHaveLength(0);

        now += delay - 1;
        expect((await repository.queue(10)).cards).toHaveLength(0);
        now += 1;
        expect((await repository.queue(10)).cards).toHaveLength(1);
    });

    it('reports the complete due queue even when the returned page is bounded', async () => {
        const now = 1_000_000;
        const dueReviewId = canonicalStudyCardKey('読む', 'よむ');
        const dueNewId = canonicalStudyCardKey('書く', 'かく');
        const secondDueNewId = canonicalStudyCardKey('聞く', 'きく');
        const futureNewId = canonicalStudyCardKey('話す', 'はなす');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            cards: {
                [dueReviewId]: storedCard({ id: dueReviewId, expression: '読む', reading: 'よむ', reviews: 1, dueAt: now - 4 }),
                [dueNewId]: storedCard({ id: dueNewId, expression: '書く', reading: 'かく', dueAt: now - 3 }),
                [secondDueNewId]: storedCard({ id: secondDueNewId, expression: '聞く', reading: 'きく', dueAt: now - 2 }),
                [futureNewId]: storedCard({ id: futureNewId, expression: '話す', reading: 'はなす', dueAt: now + 1 }),
            },
        }));

        const queue = await new LocalYomuSrsRepository(() => now).queue(1);
        expect(queue.cards).toHaveLength(1);
        expect(queue).toMatchObject({ dueCount: 1, newCount: 2, reviewCount: 3 });
        expect(queue.cards[0]?.expression).toBe('読む');
    });

    it('reports syllabus rows already present in the shared deck without changing their schedule', async () => {
        let now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const collected = await repository.collectAcademyVocabulary(academyInput('lesson:a', 'source:a'));
        await repository.review({ card: collected.card, grade: 'good' });
        now += 1;

        await expect(repository.academySyllabusProgress([
            { expression: '読む', reading: 'よむ' },
            { expression: '書く', reading: 'かく' },
        ])).resolves.toEqual({ total: 2, seeded: 1, unseeded: 1 });
        expect((await repository.queue(10)).cards).toEqual([]);
    });

    it('resolves a parse batch from one deck snapshot and keeps exact reading identities distinct', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const mined = await repository.mine({ expression: '生', reading: 'なま', meaning: 'raw' });
        await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
        await repository.review({ card: mined.card!, grade: 'good' });

        const cards = await repository.lookupCards([
            { expression: '生', reading: 'なま' },
            { expression: '生', reading: 'せい' },
            { expression: '読む', reading: 'よむ' },
            { expression: '読む', reading: 'よむ' },
        ]);

        expect(cards).toHaveLength(2);
        expect(cards.find(card => card.reading === 'なま')).toMatchObject({ state: ['learning'], dueAt: now + 2 * 86_400_000 });
        expect(cards.find(card => card.expression === '読む')).toMatchObject({ state: ['new'], dueAt: now });
    });

    it('returns the authoritative stored schedule when an existing card is mined again', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const mined = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'to read' });
        await repository.review({ card: mined.card!, grade: 'good' });

        const duplicate = await repository.mine({ expression: '読む', reading: 'よむ', meaning: 'read' });

        expect(duplicate).toMatchObject({
            card: { state: ['learning'], dueAt: now + 2 * 86_400_000, lastReviewAt: now },
            raw: { imported: 0, skipped: 1 },
        });
    });

    it('reports hosted Study quota exhaustion without announcing a saved mine', async () => {
        const originalSetItem = Storage.prototype.setItem;
        vi.stubGlobal('GM_getValue', undefined);
        vi.stubGlobal('GM_setValue', undefined);
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
            if (key.startsWith('yomu:srs-local:')) {
                throw new DOMException(`Quota filled at ${value.length} chars`, 'QuotaExceededError');
            }
            originalSetItem.call(this, key, value);
        });
        const mutation = vi.fn();
        const unsubscribe = subscribeLocalYomuSrsMutations(mutation);

        try {
            const mine = new LocalYomuSrsRepository(() => 1_000_000).mine({
                expression: '守る',
                reading: 'まもる',
                meaning: 'to protect',
                sentence: 'デッキを守る。',
                sourceUrl: 'https://yomureader.com/study/',
            });

            await expect(mine).rejects.toMatchObject({ name: 'LocalYomuSrsStorageError' });
            expect(mutation).not.toHaveBeenCalled();
        } finally {
            unsubscribe();
            setItem.mockRestore();
        }
    });

    it('migrates the legacy single-key deck idempotently', async () => {
        const now = 1_000_000;
        const firstId = canonicalStudyCardKey('読む', 'よむ');
        const secondId = canonicalStudyCardKey('書く', 'かく');
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 1,
            cards: {
                [firstId]: storedCard({ id: firstId, expression: '読む', reading: 'よむ' }),
                [secondId]: storedCard({ id: secondId, expression: '書く', reading: 'かく' }),
            },
            tombstones: { deleted: now - 1 },
        }));

        const repository = new LocalYomuSrsRepository(() => now);
        const first = await repository.snapshot();
        const second = await repository.snapshot();
        const index = JSON.parse(localStorage.getItem('yomu:srs-local:v2:index') ?? '{}') as {
            cardIds?: string[];
            tombstoneIds?: string[];
        };

        expect(first).toEqual(second);
        expect(Object.keys(second.cards).sort()).toEqual([firstId, secondId].sort());
        expect(index.cardIds).toEqual([firstId, secondId].sort());
        expect(index.tombstoneIds).toEqual(['deleted']);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect([...Array(localStorage.length)].map((_, position) => localStorage.key(position))
            .filter(key => key?.includes(':card:'))).toHaveLength(2);
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

    it('converges deletions across replicas without resurrecting stale cards', () => {
        const id = canonicalStudyCardKey('読む', 'よむ');
        const staleCard = storedCard({ id, updatedAt: 100 });
        const deletedReplica = { version: 1, cards: {}, tombstones: { [id]: 200 } };
        const merged = mergeStoredYomuSrsDecks({ version: 1, cards: { [id]: staleCard } }, deletedReplica);
        expect(merged.cards[id]).toBeUndefined();
        expect(merged.tombstones?.[id]).toBe(200);

        const revivedCard = storedCard({ id, updatedAt: 300 });
        const revived = mergeStoredYomuSrsDecks(merged, { version: 1, cards: { [id]: revivedCard } });
        expect(revived.cards[id]).toMatchObject({ updatedAt: 300 });
        expect(revived.tombstones?.[id]).toBeUndefined();
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
