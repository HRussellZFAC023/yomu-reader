import { describe, expect, it } from 'vitest';
import { jitenStatsDateKey, loadJitenDailyStats, recordJitenDailyStats } from '../../src/reader/dictionaries/jiten-stats-cache';
import { applyJitenDailyStats, emptyStatsSource } from '../../src/reader/app/stats';

describe('jiten daily stats cache', () => {
    it('snapshots study-batch counters per day and keeps the daily maximum', () => {
        const day = new Date('2026-06-10T08:00:00Z');
        recordJitenDailyStats({ newCardsToday: 4, reviewsToday: 20 }, day);
        recordJitenDailyStats({ newCardsToday: 2, reviewsToday: 35 }, new Date('2026-06-10T19:00:00Z'));

        const stored = loadJitenDailyStats();
        const key = jitenStatsDateKey(day);
        expect(stored[key]).toMatchObject({ newCardsToday: 4, reviewsToday: 35 });
    });

    it('merges cached snapshots into a stats source as daily activity', () => {
        recordJitenDailyStats({ newCardsToday: 3, reviewsToday: 12 }, new Date('2026-06-09T12:00:00Z'));
        const source = applyJitenDailyStats(
            emptyStatsSource('jpdb', 'Jiten', 'Jiten SRS loaded.', 'ready'),
            loadJitenDailyStats(),
        );

        const merged = source.daily.find(point => point.date === '2026-06-09');
        expect(merged).toMatchObject({ reviews: 12, newCards: 3 });
    });
});
