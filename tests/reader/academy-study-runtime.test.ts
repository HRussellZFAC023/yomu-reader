import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { LocalYomuSrsRepository } from '../../src/reader/srs/local-yomu';

describe('Academy vocabulary handoff to Reader Study', () => {
    beforeEach(() => localStorage.clear());

    it('keeps mounted syllabus context read-only instead of bypassing Academy evidence', async () => {
        const now = 1_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const runtime = new NewTabRuntime({
            sessionVocabulary: [{
                id: 'lesson-01:drink',
                expression: '飲み物',
                reading: 'のみもの',
                meaning: 'drink',
                source: 'academy:lesson-01',
            }],
        });
        const internals = runtime as unknown as {
            yomuLocalSrsRepository: LocalYomuSrsRepository;
            assertSessionVocabularyReadOnly(): void;
        };
        internals.yomuLocalSrsRepository = repository;

        internals.assertSessionVocabularyReadOnly();
        const queue = await repository.queue(10);

        expect(queue).toMatchObject({ providerId: 'yomu-local', newCount: 0, cards: [] });
    });

    it('uses the repository review scheduler rather than synthetic completion state', async () => {
        let now = 2_000_000;
        const repository = new LocalYomuSrsRepository(() => now);
        const collected = await repository.collectAcademyVocabulary({
            expression: '読む',
            reading: 'よむ',
            meanings: ['to read'],
            sentence: '本を読む。',
            provenance: { id: 'academy:study-syllabus:read', kind: 'study-encounter' },
        });

        await repository.review({ card: collected.card, grade: 'good' });
        expect((await repository.queue(1)).cards).toHaveLength(0);
        now += 2 * 86_400_000;
        const reviewed = (await repository.queue(1)).cards[0];
        expect(reviewed).toMatchObject({ sentence: '本を読む。', state: ['due'], lastReviewAt: 2_000_000 });
        expect(reviewed?.dueAt).toBe(now);
        expect(vi.isMockFunction(repository.review)).toBe(false);
    });

    it('accepts a read-only syllabus item without an authored gloss for dictionary enrichment', () => {
        const runtime = new NewTabRuntime({
            sessionVocabulary: [{ id: 'lesson-02:platform', expression: 'ホーム', reading: 'ほーむ' }],
        });
        const internals = runtime as unknown as {
            assertSessionVocabularyReadOnly(): void;
        };

        expect(() => internals.assertSessionVocabularyReadOnly()).not.toThrow();
    });

    it('rejects malformed mounted syllabus context without writing a scheduler card', () => {
        const runtime = new NewTabRuntime({
            sessionVocabulary: [{ id: 'lesson-03:read', expression: '   ', reading: 'よむ', meaning: 'to read' }],
        });
        const internals = runtime as unknown as {
            assertSessionVocabularyReadOnly(): void;
        };

        expect(() => internals.assertSessionVocabularyReadOnly()).toThrow(/stable ids and expressions/);
    });
});
