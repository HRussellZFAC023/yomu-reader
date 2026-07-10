import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BunproApiError, BunproClient } from '../../src/reader/bunpro/bunpro';
import type { ReaderHttpOptions } from '../../src/reader/network/http-options';
import { createBunproSrsAdapter, normalizeBunproQueueResponse, normalizeBunproReviewable, normalizeBunproStatsResponse } from '../../src/reader/srs/bunpro';
import { LocalYomuSrsRepository, createYomuLocalSrsAdapter, yomuSrsImportBatch } from '../../src/reader/srs/local-yomu';
import type { YomuSrsReviewable } from '../../src/reader/srs/types';

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

        const liveShapedStats = normalizeBunproStatsResponse(
            { facts: { days_studied: 5, streak: 1, grammar_studied: 3, vocab_studied: 26 }, badges: { data: [] } },
            { total_due_grammar: 3, total_due_vocab: 26 },
        );
        expect(liveShapedStats).toMatchObject({ providerId: 'bunpro', reviewsDue: 29, streakDays: 1 });
    });

    it('normalizes the /reviews/quiz_index envelope Bunpro serves its own quiz from', () => {
        const queue = normalizeBunproQueueResponse({
            review_session_id: 1,
            total_pending_attempt_count: 28,
            total_pending_wrapup_count: 0,
            pending_attempt: [{
                data: {
                    id: '60714209',
                    type: 'review',
                    attributes: {
                        id: 60714209,
                        streak: 3,
                        ghost_count: 0,
                        next_review: '2026-07-02T06:00:00.000Z',
                        reviewable_id: 10,
                        reviewable_type: 'Vocab',
                    },
                },
                included: [
                    { id: '17132', type: 'study_question', attributes: { id: 17132, content: '…' } },
                    { id: '10', type: 'vocab', attributes: { id: 10, title: 'アパート', kana: 'アパート', furigana: 'アパート', slug: 'アパート', meaning: 'apartment' } },
                ],
            }, {
                data: {
                    id: '60714300',
                    type: 'review',
                    attributes: { id: 60714300, streak: 1, ghost_count: 0, next_review: '2026-07-02T06:00:00.000Z', reviewable_id: 100, reviewable_type: 'GrammarPoint' },
                },
                included: [
                    { id: '100', type: 'grammar_point', attributes: { id: 100, title: 'にくい', furigana: 'にくい', slug: 'にくい', meaning: 'Difficult to, Hard to' } },
                ],
            }],
            pending_wrapup: [],
        });

        expect(queue).toMatchObject({ providerId: 'bunpro', dueCount: 28, reviewCount: 2 });
        expect(queue.cards[0]).toMatchObject({
            providerCardId: '60714209',
            providerReviewId: '60714209',
            providerReviewableId: '10',
            kind: 'vocabulary',
            expression: 'アパート',
            reading: 'アパート',
            state: ['due'] as Array<'due'>,
            reviewSession: { id: '1', inputMode: 'regular', endpoint: 'review' },
            sourceUrl: `https://bunpro.jp/vocabs/${encodeURIComponent('アパート')}`,
        });
        expect(queue.cards[0]?.dueAt).toBe(Date.parse('2026-07-02T06:00:00.000Z'));
        expect(queue.cards[0]?.meanings[0]?.glosses).toEqual(['apartment']);
        expect(queue.cards[1]).toMatchObject({
            providerReviewId: '60714300',
            kind: 'grammar',
            expression: 'にくい',
            state: ['due'],
        });
    });

    it('routes queue and final grades through the Bunpro client boundary', async () => {
        const request = vi.fn<[string, ReaderHttpOptions?], Promise<unknown>>(async (url, _options) => {
            if (url.endsWith('/reviews/quiz_index')) return { review_session_id: 9, reviews: [{ id: 10, reviewable_type: 'Vocab', word: '読む', reading: 'よむ' }] };
            if (url.endsWith('/reviews/10/update')) return { id: 10, word: '読む', reading: 'よむ' };
            return {};
        });
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));

        const queue = await adapter.queue(1);
        await adapter.review({ card: queue.cards[0]!, grade: 'pass' });

        expect(queue.cards[0]).toMatchObject({ expression: '読む', providerReviewId: '10' });
        expect(request.mock.calls.map(([url]) => String(url))).toEqual([
            'https://api.bunpro.jp/api/frontend/reviews/quiz_index',
            'https://api.bunpro.jp/api/frontend/reviews/10/update',
        ]);
        expect(JSON.parse(String(request.mock.calls[1]?.[1]?.data))).toEqual({
            review_session_id: 9,
            correct: true,
            fsrs_input: null,
            loaded_review_ids: null,
            loaded_ghost_review_ids: null,
            loaded_self_study_review_ids: null,
        });
    });

    it('preserves ordinary, ghost, and self-study review endpoint kinds from the queue', () => {
        const entry = (id: number, attributes: Record<string, unknown>) => ({
            data: { id: String(id), type: 'review', attributes: { id, reviewable_id: id, reviewable_type: 'Vocab', ...attributes } },
            included: [{ id: String(id), type: 'vocab', attributes: { id, title: `語${id}`, kana: `ご${id}`, meaning: 'word' } }],
        });
        const queue = normalizeBunproQueueResponse({
            review_session_id: 44,
            pending_attempt: [
                entry(1, { ghost_count: 0 }),
                entry(2, {}),
                entry(3, { user_study_question_id: 99 }),
            ],
            pending_wrapup: [],
        });

        expect(queue.cards.map(card => card.reviewSession?.endpoint)).toEqual(['review', 'ghost-review', 'self-study-review']);
    });

    it('sends Bunpro FSRS inputs to the endpoint owned by the active session', async () => {
        const request = vi.fn(async (_url: string, _options?: ReaderHttpOptions) => ({}));
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));
        const baseCard: YomuSrsReviewable = {
            providerId: 'bunpro' as const,
            providerCardId: '17',
            providerReviewId: '17',
            providerReviewableId: '7',
            kind: 'vocabulary' as const,
            expression: '読む',
            reading: 'よむ',
            meanings: [],
            state: ['due'],
            reviewSession: { id: '44', inputMode: 'fsrs' as const, endpoint: 'review' as const },
        };

        await adapter.review({ card: baseCard, grade: 'hard' });

        const [url, options] = request.mock.calls[0] as unknown as [string, ReaderHttpOptions];
        expect(url).toBe('https://api.bunpro.jp/api/frontend/reviews/17/update');
        expect(JSON.parse(String(options.data))).toEqual({
            review_session_id: 44,
            correct: false,
            fsrs_input: 'hard',
            loaded_review_ids: null,
            loaded_ghost_review_ids: null,
            loaded_self_study_review_ids: null,
            incorrect_answer: '__FLASHCARD_FSRS_HARD',
        });
    });

    it('dispatches regular ghost and self-study grades to their own collections', async () => {
        const request = vi.fn(async (_url: string, _options?: ReaderHttpOptions) => ({}));
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));
        const card = (id: string, endpoint: 'ghost-review' | 'self-study-review'): YomuSrsReviewable => ({
            providerId: 'bunpro',
            providerCardId: id,
            providerReviewId: id,
            kind: 'vocabulary',
            expression: `語${id}`,
            reading: `ご${id}`,
            meanings: [],
            state: ['due'],
            reviewSession: { id: '44', inputMode: 'regular', endpoint },
        });

        await adapter.review({ card: card('18', 'ghost-review'), grade: 'pass' });
        await adapter.review({ card: card('19', 'self-study-review'), grade: 'fail' });

        expect(request.mock.calls.map(([url]) => url)).toEqual([
            'https://api.bunpro.jp/api/frontend/ghost_reviews/18/update',
            'https://api.bunpro.jp/api/frontend/self_study_reviews/19/update',
        ]);
    });

    it('refuses to grade outside an active Bunpro review session', async () => {
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: vi.fn() }));
        const card = normalizeBunproReviewable({ id: 1, reviewable_id: 2, reviewable_type: 'Vocab', word: '読む', reading: 'よむ' });
        if (!card) throw new Error('Expected normalized Bunpro card.');
        await expect(adapter.review({ card, grade: 'pass' })).rejects.toThrow(/active review session/i);
    });

    it('refuses malformed review ids even when the rest of the live session looks valid', async () => {
        const request = vi.fn(async () => ({}));
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));
        const corrupt: YomuSrsReviewable = {
            providerId: 'bunpro',
            providerCardId: 'reviewable:42',
            providerReviewId: '../ghost_reviews/1',
            providerReviewableId: '42',
            kind: 'vocabulary',
            expression: '読む',
            reading: 'よむ',
            meanings: [],
            state: ['due'],
            reviewSession: { id: '44', inputMode: 'regular', endpoint: 'review' },
        };

        await expect(adapter.review({ card: corrupt, grade: 'pass' })).rejects.toThrow(/numeric review id/i);
        expect(request).not.toHaveBeenCalled();
    });

    it('adds mined vocabulary through the Bunpro reviewable action endpoint', async () => {
        const request = vi.fn(async (url: string) => {
            if (url.endsWith('/search/reviewables_v1_1')) {
                return { vocabs: { data: [{ id: 42, reviewable_type: 'Vocab', word: '読む', reading: 'よむ', meaning: 'to read' }] } };
            }
            if (url.endsWith('/reviews/update_via_action_type')) return { ok: true };
            return {};
        });
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));

        const result = await adapter.mine({ expression: '読む', reading: 'よむ', kind: 'vocabulary' });

        expect(result.card).toMatchObject({ expression: '読む', providerReviewableId: '42', kind: 'vocabulary' });
        const calls = request.mock.calls as Array<[string, ReaderHttpOptions?]>;
        const updateOptions = calls[1]?.[1];
        if (!updateOptions) throw new Error('Expected Bunpro update request options.');
        expect(JSON.parse(String(updateOptions.data))).toEqual({
            deck_id: null,
            action_type: 'add',
            reviewables: [['Vocab', 42]],
        });
    });

    it('prefers vocabulary search hits and infers missing Bunpro reviewable types from the requested mining kind', async () => {
        const request = vi.fn(async (url: string) => {
            if (url.endsWith('/search/reviewables_v1_1')) {
                return {
                    grammar_points: { data: [{ id: 9, grammar_point: '〜よう', reading: 'よう', meaning: 'appearance' }] },
                    vocabs: { data: [{ id: 42, word: '読む', reading: 'よむ', meaning: 'to read' }] },
                };
            }
            if (url.endsWith('/reviews/update_via_action_type')) return { ok: true };
            return {};
        });
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));

        const result = await adapter.mine({ expression: '読む', reading: 'よむ', kind: 'vocabulary' });

        expect(result.card).toMatchObject({ expression: '読む', providerReviewableId: '42', kind: 'vocabulary' });
        const calls = request.mock.calls as Array<[string, ReaderHttpOptions?]>;
        const updateOptions = calls[1]?.[1];
        if (!updateOptions) throw new Error('Expected Bunpro update request options.');
        expect(JSON.parse(String(updateOptions.data))).toMatchObject({
            action_type: 'add',
            reviewables: [['Vocab', 42]],
        });
    });

    it('rejects Bunpro mining when search returns no addable item', async () => {
        const request = vi.fn(async (url: string) => {
            if (url.endsWith('/search/reviewables_v1_1')) return { grammar_points: { data: [] }, vocabs: { data: [] } };
            if (url.endsWith('/reviews/update_via_action_type')) return { ok: true };
            return {};
        });
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));

        await expect(adapter.mine({ expression: '幻語', kind: 'vocabulary' })).rejects.toBeInstanceOf(BunproApiError);
        expect(request.mock.calls.map(([url]) => String(url)).filter(url => url.endsWith('/reviews/update_via_action_type'))).toHaveLength(0);
    });

    it('rejects an exact-spelling Bunpro homograph when the requested reading differs', async () => {
        const request = vi.fn(async (url: string) => {
            if (url.endsWith('/search/reviewables_v1_1')) {
                return { vocabs: { data: [{ id: 42, reviewable_type: 'Vocab', word: '生', reading: 'せい', meaning: 'life' }] } };
            }
            return { ok: true };
        });
        const adapter = createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => 'token', requestImpl: request }));

        await expect(adapter.mine({ expression: '生', reading: 'なま', kind: 'vocabulary' })).rejects.toThrow(/No Bunpro item found/u);
        expect(request.mock.calls.map(([url]) => String(url)).filter(url => url.endsWith('/reviews/update_via_action_type'))).toHaveLength(0);
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
