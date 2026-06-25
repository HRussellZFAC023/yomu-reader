import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';

// Jiten review history covers reviews, correctness, and duration. The study
// batch still exposes today's new-card counter, so keep a small daily snapshot
// for new cards and as a fallback when history cannot be loaded.
const JITEN_DAILY_STATS_KEY = 'jpdb-reader-jiten-daily-stats';
const JITEN_DAILY_STATS_MAX_DAYS = 400;

export interface JitenDailyStatsSnapshot {
    newCardsToday: number;
    reviewsToday: number;
    updatedAt: number;
}

export type JitenDailyStatsByDate = Record<string, JitenDailyStatsSnapshot>;

export function recordJitenDailyStats(counts: { newCardsToday?: number; reviewsToday?: number }, now = new Date()): void {
    const newCardsToday = finiteCount(counts.newCardsToday);
    const reviewsToday = finiteCount(counts.reviewsToday);
    if (newCardsToday === undefined && reviewsToday === undefined) return;
    try {
        const stored = loadJitenDailyStats();
        const key = jitenStatsDateKey(now);
        const previous = stored[key];
        stored[key] = {
            // Counters reset at Jiten's day boundary; keep the daily maximum
            // so a late small batch never shrinks an earlier snapshot.
            newCardsToday: Math.max(previous?.newCardsToday ?? 0, newCardsToday ?? 0),
            reviewsToday: Math.max(previous?.reviewsToday ?? 0, reviewsToday ?? 0),
            updatedAt: now.getTime(),
        };
        gmStorageSetSync(JITEN_DAILY_STATS_KEY, pruneJitenDailyStats(stored));
    } catch {
        // Stats history is best-effort only.
    }
}

export function loadJitenDailyStats(): JitenDailyStatsByDate {
    try {
        const stored = gmStorageGetSync<JitenDailyStatsByDate>(JITEN_DAILY_STATS_KEY, {});
        return stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
    } catch {
        return {};
    }
}

export function jitenStatsDateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

function pruneJitenDailyStats(stored: JitenDailyStatsByDate): JitenDailyStatsByDate {
    const keys = Object.keys(stored).sort();
    while (keys.length > JITEN_DAILY_STATS_MAX_DAYS) {
        delete stored[keys.shift() ?? ''];
    }
    return stored;
}

function finiteCount(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}
