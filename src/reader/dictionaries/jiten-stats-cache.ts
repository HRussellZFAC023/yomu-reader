import { gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import { isNonNullObject, isRecord } from '../core/object-utils';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';

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

interface StoredJitenDailyStats {
    version: 2;
    accounts: Record<string, JitenDailyStatsByDate>;
}

export function recordJitenDailyStats(counts: { newCardsToday?: number; reviewsToday?: number }, now = new Date(), credential = ''): void {
    const newCardsToday = finiteCount(counts.newCardsToday);
    const reviewsToday = finiteCount(counts.reviewsToday);
    if (!hasDailyStats(newCardsToday, reviewsToday)) return;
    try {
        const context = sensitiveFingerprint(credential);
        const container = storedJitenDailyStats();
        const stored = jitenStatsForContext(container, context);
        const key = jitenStatsDateKey(now);
        stored[key] = updatedDailyStats(stored[key], newCardsToday, reviewsToday, now);
        saveJitenStatsForContext(container, context, stored);
    } catch {
        // Stats history is best-effort only.
    }
}

function hasDailyStats(newCardsToday: number | undefined, reviewsToday: number | undefined): boolean {
    return newCardsToday !== undefined || reviewsToday !== undefined;
}

function jitenStatsForContext(container: StoredJitenDailyStats, context: string): JitenDailyStatsByDate {
    return context ? { ...container.accounts[context] } : legacyJitenDailyStats();
}

function updatedDailyStats(previous: JitenDailyStatsSnapshot | undefined, newCardsToday: number | undefined, reviewsToday: number | undefined, now: Date): JitenDailyStatsSnapshot {
    return {
        // Counters reset at Jiten's day boundary; keep the daily maximum so a
        // late small batch never shrinks an earlier snapshot.
        newCardsToday: greatestDailyCount(previous?.newCardsToday, newCardsToday),
        reviewsToday: greatestDailyCount(previous?.reviewsToday, reviewsToday),
        updatedAt: now.getTime(),
    };
}

function greatestDailyCount(previous: number | undefined, next: number | undefined): number {
    return Math.max(previous ?? 0, next ?? 0);
}

function saveJitenStatsForContext(container: StoredJitenDailyStats, context: string, stats: JitenDailyStatsByDate): void {
    const pruned = pruneJitenDailyStats(stats);
    if (!context) {
        gmStorageSetSync(JITEN_DAILY_STATS_KEY, pruned);
        return;
    }
    container.accounts[context] = pruned;
    gmStorageSetSync(JITEN_DAILY_STATS_KEY, container);
}

export function loadJitenDailyStats(credential = ''): JitenDailyStatsByDate {
    try {
        const context = sensitiveFingerprint(credential);
        return context ? { ...storedJitenDailyStats().accounts[context] } : legacyJitenDailyStats();
    } catch {
        return {};
    }
}

function storedJitenDailyStats(): StoredJitenDailyStats {
    const stored = gmStorageGetSync<unknown>(JITEN_DAILY_STATS_KEY, null);
    return isStoredJitenDailyStats(stored)
        ? { version: 2, accounts: { ...stored.accounts } }
        : { version: 2, accounts: {} };
}

function legacyJitenDailyStats(): JitenDailyStatsByDate {
    const stored = gmStorageGetSync<unknown>(JITEN_DAILY_STATS_KEY, {});
    return isLegacyJitenDailyStats(stored) ? { ...stored } : {};
}

function isStoredJitenDailyStats(value: unknown): value is StoredJitenDailyStats {
    if (!isNonNullObject(value)) return false;
    if (value.version !== 2) return false;
    return isNonNullObject(value.accounts);
}

function isLegacyJitenDailyStats(value: unknown): value is JitenDailyStatsByDate {
    if (!isRecord(value)) return false;
    return !('version' in value);
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
