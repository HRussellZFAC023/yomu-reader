import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BunproClient } from '../../src/reader/bunpro/bunpro';
import { createBunproSrsAdapter, normalizeBunproQueueResponse, normalizeBunproReviewable, normalizeBunproStatsResponse } from '../../src/reader/srs/bunpro';
import { LocalYomuSrsRepository, createYomuLocalSrsAdapter, yomuSrsImportBatch } from '../../src/reader/srs/local-yomu';

describe('Bunpro SRS adapter', () => {
    it('normalizes frontend review records into provider-neutral reviewables', () => {
        const card = normalizeBunproReviewable({
            data: {
                id: '123',
                type: 'review',
                attributes: {
                    review_id: 123,
                    reviewable_id: 456,
                    reviewable_type: 'Grammar',
                    grammar_point: '〜ている',
                    reading: 'ている',
                    meaning: 'progressive action',
                    srs_stage: 'Seasoned',
                    next_review_at: '2026-06-30T12:00:00.000Z',
                    last_reviewed_at: '2026-06-29T12:00:00.000Z',
                    slug: 'teiru',
                },
            },
        });

        expect(card).toMatchObject({
            providerId: 'bunpro',
            providerCardId: '123',
            providerReviewId: '123',
            providerReviewableId: '456',
            kind: 'grammar',
            expression: '〜ている',
            reading: 'ている',
            state: ['learning'],
            srsLevel: 'Seasoned',
            sourceUrl: 'https://bunpro.jp/grammar_points/teiru',
        });
        expect(card?.meanings[0]?.glosses).toEqual(['progressive action']);
        expect(card?.dueAt).toBe(Date.parse('2026-06-30T12:00:00.000Z'));
        expect(card?.lastReviewAt).toBe(Date.parse('2026-06-29T12:00:00.000Z'));
    });

    it('normalizes queue and stats payloads without depending on exact Bunpro envelopes', () => {
        const queue = normalizeBunproQueueResponse({
            due_count: 2,
            new_count: 1,
            review_count: 3,
            reviews: [{
                id: 10,
                reviewable_id: 11,
                reviewable_type: 'Vocab',
                word: '食べる',
                reading: 'たべる',
                meanings: ['to eat'],
                srs_stage: 'Due',
            }],
        });
        const stats = normalizeBunproStatsResponse({
            reviews_due: 5,
            reviews_today: 12,
            new_today: 3,
            streak_days: 9,
            srs_level_counts: { Seasoned: 4 },
        });

        expect(queue).toMatchObject({ providerId: 'bunpro', dueCount: 2, newCount: 1, reviewCount: 3 });
        expect(queue.cards[0]).toMatchObject({ providerId: 'bunpro', kind: 'vocabulary', expression: '食べる', state: ['due'] });
        expect(stats).toMatchObject({ providerId: 'bunpro', reviewsDue: 5, reviewsToday: 12, newToday: 3, streakDays: 9, levelCounts: { Seasoned: 4 } });
    });

    it('routes queue and final grades through the Bunpro client boundary', async () => {
        const request = vi.fn(async (url: string) => {
            if (url.endsWith('/user/queue')) return { reviews: [{ id: 10, reviewable_type: 'Vocab', word: '読む', reading: 'よむ' }] };
            if (url.endsWith('/reviews/10/update')) return { id: 10, word: '読む', reading: 'よむ' };
            return {};
        });
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));

        const queue = await adapter.queue(1);
        await adapter.review({ card: queue.cards[0]!, grade: 'pass' });

        expect(queue.cards[0]).toMatchObject({ expression: '読む', providerReviewId: '10' });
        expect(request.mock.calls.map(([url]) => String(url))).toEqual([
            'https://api.bunpro.jp/api/frontend/user/queue',
            'https://api.bunpro.jp/api/frontend/reviews/10/update',
        ]);
    });
});

describe('Yomu local SRS adapter', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
        vi.unstubAllGlobals();
    });

    it('imports due cards and schedules them locally with no account', async () => {
        const now = Date.parse('2026-06-29T12:00:00.000Z');
        const repository = new LocalYomuSrsRepository(() => now);
        const adapter = createYomuLocalSrsAdapter(repository);

        await adapter.importBatch?.(yomuSrsImportBatch('test', [{
            expression: '図鑑',
            reading: 'ずかん',
            meanings: ['illustrated reference book'],
        }], now));

        const queue = await adapter.queue(10);
        expect(adapter.hasCredential()).toBe(true);
        expect(queue.cards[0]).toMatchObject({
            providerId: 'yomu-local',
            expression: '図鑑',
            reading: 'ずかん',
            state: ['new'],
        });

        const result = await adapter.review({ card: queue.cards[0]!, grade: 'easy' });
        expect(result.card?.state).toEqual(['learning']);
        expect(result.card?.dueAt).toBeGreaterThan(now);
    });
});
