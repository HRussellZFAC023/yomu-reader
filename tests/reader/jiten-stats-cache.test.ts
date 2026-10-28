import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gmStorageDelete } from '../../src/reader/app/storage';
import { jitenStatsDateKey, loadJitenDailyStats, recordJitenDailyStats } from '../../src/reader/dictionaries/jiten-stats-cache';
import { applyJitenDailyStats, emptyStatsSource } from '../../src/reader/app/stats';

beforeEach(() => gmStorageDelete('jpdb-reader-jiten-daily-stats'));
afterEach(() => gmStorageDelete('jpdb-reader-jiten-daily-stats'));

describe('jiten daily stats cache', () => {
    it('snapshots study-batch counters per day and keeps the daily maximum', () => {
        const day = new Date(2026, 5, 10, 8);
        recordJitenDailyStats({ newCardsToday: 4, reviewsToday: 20 }, day);
        recordJitenDailyStats({ newCardsToday: 2, reviewsToday: 35 }, new Date(2026, 5, 10, 19));

        const stored = loadJitenDailyStats();
        const key = jitenStatsDateKey(day);
        expect(stored[key]).toMatchObject({ newCardsToday: 4, reviewsToday: 35 });
    });

    it('merges cached snapshots into a stats source as daily activity', () => {
        recordJitenDailyStats({ newCardsToday: 3, reviewsToday: 12 }, new Date(2026, 5, 9, 12));
        const source = applyJitenDailyStats(
            emptyStatsSource('jiten', 'Jiten', 'Jiten SRS loaded.', 'ready'),
            loadJitenDailyStats(),
        );

        const merged = source.daily.find(point => point.date === '2026-06-09');
        expect(merged).toMatchObject({ reviews: 12, newCards: 3 });
    });

    it('keeps snapshots on opposite sides of local midnight separate', () => {
        recordJitenDailyStats({ newCardsToday: 4, reviewsToday: 20 }, new Date(2026, 5, 10, 23, 59));
        recordJitenDailyStats({ newCardsToday: 1, reviewsToday: 2 }, new Date(2026, 5, 11, 0, 1));

        const stored = loadJitenDailyStats();
        expect(stored['2026-06-10']).toMatchObject({ newCardsToday: 4, reviewsToday: 20 });
        expect(stored['2026-06-11']).toMatchObject({ newCardsToday: 1, reviewsToday: 2 });
    });
});
