import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyJpdbReviewImport,
    averageReviewSpeed,
    combineStatsSources,
    estimatedDueMinutes,
    loadAnkiConnectStats,
    parseJpdbReviewExport,
    statsActivityMetricTotal,
    statsCardSegments,
    statsFromJpdbCards,
} from '../../src/reader/stats';
import type { JPDBCard } from '../../src/reader/types';

function statsCard(overrides: Partial<JPDBCard>): JPDBCard {
    return {
        vid: 1,
        sid: 1,
        rid: 1,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

describe('stats aggregation', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('parses JPDB review exports into daily activity and retention inputs', () => {
        const imported = parseJpdbReviewExport({
            cards_vocabulary_jp_en: [
                {
                    reviews: [
                        { timestamp: '2026-05-20T10:00:00Z', grade: 'fail', time_spent_ms: 3000 },
                        { timestamp: '2026-05-20T10:10:00Z', grade: 'okay', time_spent_ms: 9000 },
                    ],
                },
                {
                    reviews: [
                        { timestamp: '2026-05-21T08:00:00Z', grade: 'easy', duration: 6 },
                        { timestamp: '2026-05-21T08:05:00Z', grade: 'abandoned' },
                    ],
                },
            ],
        });

        expect(imported.cardCount).toBe(2);
        expect(imported.daily).toEqual([
            expect.objectContaining({ date: '2026-05-20', reviews: 2, correct: 1, failed: 1, newCards: 1 }),
            expect.objectContaining({ date: '2026-05-21', reviews: 1, correct: 1, failed: 0, newCards: 1 }),
        ]);
    });

    it('merges JPDB cards, imported history, and Anki stats into the combined source', async () => {
        vi.setSystemTime(new Date('2026-05-23T12:00:00Z'));
        const jpdb = applyJpdbReviewImport(
            statsFromJpdbCards([
                statsCard({ cardState: ['new'] }),
                statsCard({ cardState: ['learning'] }),
                statsCard({ cardState: ['known'] }),
                statsCard({ cardState: ['failed'] }),
            ]),
            {
                importedAt: Date.now(),
                cardCount: 1,
                daily: [
                    { date: '2026-05-22', reviews: 2, correct: 1, failed: 1, newCards: 1, minutes: 1 },
                    { date: '2026-05-23', reviews: 3, correct: 3, failed: 0, newCards: 0, minutes: 1 },
                ],
            },
        );
        const api = {
            invoke: async <T>(action: string): Promise<T> => {
                const reply = (value: unknown): T => value as T;
                if (action === 'deckNames') return reply(['Default']);
                if (action === 'getNumCardsReviewedToday') return reply(4);
                if (action === 'getNumCardsReviewedByDay') return reply([['2026-05-23', 4]]);
                if (action === 'getDeckStats') {
                    return reply({
                        deck: {
                            new_count: 2,
                            learn_count: 1,
                            review_count: 5,
                            total_in_deck: 8,
                        },
                    });
                }
                if (action === 'findCards') return reply([10]);
                if (action === 'getReviewsOfCards') {
                    return reply({
                        10: [
                            { id: Date.parse('2026-05-23T09:00:00Z'), ease: 1, time: 4000 },
                            { id: Date.parse('2026-05-23T09:05:00Z'), ease: 3, time: 6000 },
                        ],
                    });
                }
                throw new Error(`unexpected action ${action}`);
            },
        } as Parameters<typeof loadAnkiConnectStats>[0];
        const anki = await loadAnkiConnectStats(api);
        const combined = combineStatsSources(jpdb, anki);

        expect(combined.reviewsToday).toBe(7);
        expect(combined.totalReviews).toBe(9);
        expect(combined.retention).toBeCloseTo(5 / 7);
        expect(combined.cards).toMatchObject({ total: 12, new: 3, learning: 2, review: 7, due: 6, failed: 1 });
        expect(averageReviewSpeed(combined)).toBeCloseTo(9 / (2 + (10 / 60)));
        expect(estimatedDueMinutes(combined)).toBeCloseTo(6 / (9 / (2 + (10 / 60))));
        expect(statsActivityMetricTotal(combined.daily, 'newCards')).toBe(1);
        expect(statsCardSegments(combined.cards)).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: 'failed', value: 1 }),
            expect.objectContaining({ key: 'due', value: 5 }),
        ]));
        expect(combined.status).toBe('ready');
    });

    it('loads Anki stats across every deck returned by AnkiConnect', async () => {
        const calls: Array<{ action: string; params?: Record<string, unknown> }> = [];
        const api = {
            invoke: async <T>(action: string, params?: Record<string, unknown>): Promise<T> => {
                calls.push({ action, params });
                const reply = (value: unknown): T => value as T;
                if (action === 'deckNames') return reply(['Core', 'Mining', 'Anime::Subs']);
                if (action === 'getNumCardsReviewedToday') return reply(0);
                if (action === 'getNumCardsReviewedByDay') return reply([]);
                if (action === 'getDeckStats') return reply({});
                if (action === 'findCards') return reply([]);
                throw new Error(`unexpected action ${action}`);
            },
        } as Parameters<typeof loadAnkiConnectStats>[0];

        const anki = await loadAnkiConnectStats(api);

        expect(anki.message).toBe('Connected to 3 decks.');
        expect(anki.deckNames).toEqual(['Core', 'Mining', 'Anime::Subs']);
        expect(calls.find(call => call.action === 'getDeckStats')?.params).toEqual({
            decks: ['Core', 'Mining', 'Anime::Subs'],
        });
        expect(calls.find(call => call.action === 'findCards')?.params).toEqual({ query: 'rated:30' });
    });
});
