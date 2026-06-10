import { primaryCardState } from '../cards/state';
import type { CardState, JPDBCard } from './types';

export type StatsSourceId = 'combined' | 'jpdb' | 'anki';
export type StatsSourceStatus = 'setup' | 'loading' | 'ready' | 'partial' | 'error';
export type StatsActivityMetric = 'reviews' | 'minutes' | 'newCards';

export interface StatsDailyPoint {
    date: string;
    reviews: number;
    correct: number;
    failed: number;
    newCards: number;
    minutes: number;
}

export interface StatsMonthlyHeatmap {
    key: string;
    year: number;
    month: number;
    startWeekday: number;
    days: StatsDailyPoint[];
    total: StatsDailyPoint;
}

export interface StatsCardBreakdown {
    total: number;
    new: number;
    learning: number;
    review: number;
    due: number;
    failed: number;
    known: number;
    suspended: number;
    ignored: number;
}

export interface StatsSourceSnapshot {
    id: Exclude<StatsSourceId, 'combined'>;
    label: string;
    status: StatsSourceStatus;
    message: string;
    deckNames?: string[];
    activeDeckNames?: string[];
    daily: StatsDailyPoint[];
    cards: StatsCardBreakdown;
    reviewsToday: number;
    totalReviews: number;
    retention: number | null;
    currentStreak: number;
    longestStreak: number;
    updatedAt: number | null;
}

export interface StatsCombinedSnapshot extends Omit<StatsSourceSnapshot, 'id'> {
    id: 'combined';
}

export interface StatsDashboardSnapshot {
    jpdb: StatsSourceSnapshot;
    anki: StatsSourceSnapshot;
    combined: StatsCombinedSnapshot;
}

export interface JpdbReviewImport {
    daily: StatsDailyPoint[];
    importedAt: number;
    cardCount: number;
}

export interface StatsAnkiApi {
    invoke<T>(action: string, params?: Record<string, unknown>): Promise<T>;
}

export interface LoadAnkiConnectStatsOptions {
    disabledDeckNames?: readonly string[];
}

interface AnkiDeckStats {
    deck_id?: number;
    name?: string;
    new_count?: number;
    learn_count?: number;
    review_count?: number;
    total_in_deck?: number;
}

interface AnkiReviewLog {
    id?: number;
    ease?: number;
    time?: number;
}

const EMPTY_CARDS: StatsCardBreakdown = {
    total: 0,
    new: 0,
    learning: 0,
    review: 0,
    due: 0,
    failed: 0,
    known: 0,
    suspended: 0,
    ignored: 0,
};

const JPDB_SUCCESS_GRADES = new Set(['known', 'pass', 'hard', 'easy', 'okay']);
const JPDB_IGNORED_STATES = new Set<CardState>(['blacklisted', 'locked', 'redundant']);
const DAY_MS = 86_400_000;
const ANKI_RETENTION_WINDOW_DAYS = 30;
const ANKI_RETENTION_CARD_LIMIT = 5_000;

export function emptyStatsDashboardSnapshot(): StatsDashboardSnapshot {
    const jpdb = emptyStatsSource('jpdb', 'JPDB', 'Add JPDB data to see stats.');
    const anki = emptyStatsSource('anki', 'Anki', 'Connect Anki to see stats.');
    return {
        jpdb,
        anki,
        combined: combineStatsSources(jpdb, anki),
    };
}

export function emptyStatsSource(
    id: Exclude<StatsSourceId, 'combined'>,
    label: string,
    message: string,
    status: StatsSourceStatus = 'setup',
): StatsSourceSnapshot {
    return finalizeStatsSource({
        id,
        label,
        status,
        message,
        daily: [],
        cards: { ...EMPTY_CARDS },
        reviewsToday: 0,
        totalReviews: 0,
        retention: null,
        currentStreak: 0,
        longestStreak: 0,
        updatedAt: null,
    });
}

export function statsFromApiCards(cards: JPDBCard[], label: string, message: string): StatsSourceSnapshot {
    return finalizeStatsSource({
        id: 'jpdb',
        label,
        status: cards.length ? 'ready' : 'partial',
        message,
        daily: [],
        cards: jpdbCardBreakdown(cards),
        reviewsToday: 0,
        totalReviews: 0,
        retention: null,
        currentStreak: 0,
        longestStreak: 0,
        updatedAt: Date.now(),
    });
}

export function statsFromJpdbCards(cards: JPDBCard[], message = 'JPDB card states loaded.'): StatsSourceSnapshot {
    return statsFromApiCards(cards, 'JPDB', message);
}

export function applyJpdbReviewImport(source: StatsSourceSnapshot, imported: JpdbReviewImport | null): StatsSourceSnapshot {
    if (!imported) return source;
    return finalizeStatsSource({
        ...source,
        status: source.status === 'ready' ? 'ready' : 'partial',
        message: source.status === 'ready' ? source.message : 'JPDB review history imported.',
        daily: mergeDailyPoints(source.daily, imported.daily),
        updatedAt: Math.max(source.updatedAt ?? 0, imported.importedAt),
    });
}

// Jiten has no history API; its per-day counters are snapshotted locally on
// every study-batch load (see dictionaries/jiten-stats-cache) and merged into
// the API source's activity here.
export function applyJitenDailyStats(source: StatsSourceSnapshot, byDate: Record<string, { newCardsToday: number; reviewsToday: number; updatedAt: number }>): StatsSourceSnapshot {
    const entries = Object.entries(byDate);
    if (!entries.length) return source;
    const daily: StatsDailyPoint[] = entries.map(([date, snapshot]) => ({
        date,
        reviews: snapshot.reviewsToday,
        correct: 0,
        failed: 0,
        newCards: snapshot.newCardsToday,
        minutes: 0,
    }));
    return finalizeStatsSource({
        ...source,
        daily: mergeDailyPoints(source.daily, daily),
        updatedAt: Math.max(source.updatedAt ?? 0, ...entries.map(([, snapshot]) => snapshot.updatedAt)),
    });
}

export function combineStatsSources(jpdb: StatsSourceSnapshot, anki: StatsSourceSnapshot): StatsCombinedSnapshot {
    const daily = mergeDailyPoints(jpdb.daily, anki.daily);
    return finalizeCombinedStatsSource({
        id: 'combined',
        label: 'Combined',
        status: combinedStatus(jpdb, anki),
        message: combinedMessage(jpdb, anki),
        daily,
        cards: addCardBreakdowns(jpdb.cards, anki.cards),
        reviewsToday: 0,
        totalReviews: 0,
        retention: null,
        currentStreak: 0,
        longestStreak: 0,
        updatedAt: Math.max(jpdb.updatedAt ?? 0, anki.updatedAt ?? 0) || null,
    });
}

export function parseJpdbReviewExportText(text: string): JpdbReviewImport {
    const parsed = JSON.parse(text) as unknown;
    return parseJpdbReviewExport(parsed);
}

export function parseJpdbReviewExport(value: unknown): JpdbReviewImport {
    const cards = jpdbReviewCards(value);
    const daily = new Map<string, StatsDailyPoint>();
    for (const card of cards) {
        const reviews = normalizeJpdbReviewEntries(card);
        const first = reviews.find(review => review.grade !== 'abandoned');
        if (first) ensureDailyPoint(daily, dateKey(first.timestamp)).newCards += 1;
        for (const review of reviews) {
            if (review.grade === 'abandoned') continue;
            const point = ensureDailyPoint(daily, dateKey(review.timestamp));
            point.reviews += 1;
            point.minutes += review.minutes;
            if (isJpdbSuccessfulGrade(review.grade)) point.correct += 1;
            else point.failed += 1;
        }
    }
    return {
        daily: sortedDailyPoints([...daily.values()]),
        importedAt: Date.now(),
        cardCount: cards.length,
    };
}

export async function loadAnkiConnectStats(api: StatsAnkiApi, options: LoadAnkiConnectStatsOptions = {}): Promise<StatsSourceSnapshot> {
    const deckNames = await api.invoke<string[]>('deckNames');
    const allDecks = deckNames.filter(deck => deck.trim());
    const disabledDecks = new Set(options.disabledDeckNames ?? []);
    const decks = allDecks.filter(deck => !disabledDecks.has(deck));
    const allDecksSelected = decks.length === allDecks.length;
    const [reviewedToday, reviewedByDay, deckStats, retentionDaily] = await Promise.all([
        allDecksSelected ? api.invoke<number>('getNumCardsReviewedToday').catch(() => 0) : Promise.resolve(0),
        allDecksSelected ? api.invoke<Array<[string, number]>>('getNumCardsReviewedByDay').catch(() => []) : Promise.resolve([]),
        decks.length
            ? api.invoke<Record<string, AnkiDeckStats>>('getDeckStats', { decks }).catch(() => ({}))
            : Promise.resolve({} as Record<string, AnkiDeckStats>),
        loadAnkiRetentionDaily(api, allDecksSelected ? null : decks).catch(() => []),
    ]);
    const daily = allDecksSelected ? mergeDailyPoints(ankiReviewedByDayToDaily(reviewedByDay), retentionDaily) : retentionDaily;
    const source = finalizeStatsSource({
        id: 'anki',
        label: 'Anki',
        status: 'ready',
        message: ankiDeckSelectionMessage(decks.length, allDecks.length),
        deckNames: allDecks,
        activeDeckNames: decks,
        daily,
        cards: ankiCardBreakdown(Object.values(deckStats)),
        reviewsToday: reviewedToday,
        totalReviews: 0,
        retention: null,
        currentStreak: 0,
        longestStreak: 0,
        updatedAt: Date.now(),
    });
    return {
        ...source,
        reviewsToday: Math.max(source.reviewsToday, reviewedToday),
    };
}

export function recentDailyPoints(points: StatsDailyPoint[], days = 30, today = new Date()): StatsDailyPoint[] {
    const byDate = new Map(points.map(point => [point.date, point]));
    const end = startOfLocalDay(today).getTime();
    const out: StatsDailyPoint[] = [];
    for (let offset = days - 1; offset >= 0; offset--) {
        const date = dateKey(new Date(end - offset * DAY_MS));
        out.push(byDate.get(date) ?? emptyDailyPoint(date));
    }
    return out;
}

export function monthlyActivityHeatmaps(points: StatsDailyPoint[], months = 6, today = new Date()): StatsMonthlyHeatmap[] {
    const monthCount = Math.max(1, Math.floor(months));
    const byDate = new Map(points.map(point => [point.date, point]));
    const currentMonth = startOfLocalMonth(today);
    const firstMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - monthCount + 1, 1);
    const out: StatsMonthlyHeatmap[] = [];
    for (let offset = 0; offset < monthCount; offset++) {
        const monthStart = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1);
        const year = monthStart.getFullYear();
        const month = monthStart.getMonth() + 1;
        const daysInMonth = new Date(year, month, 0).getDate();
        const days: StatsDailyPoint[] = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = dateKey(new Date(year, month - 1, day));
            days.push(byDate.get(date) ?? emptyDailyPoint(date));
        }
        out.push({
            key: `${year}-${String(month).padStart(2, '0')}`,
            year,
            month,
            startWeekday: mondayFirstWeekday(monthStart),
            days,
            total: sumDailyPoints(days, `${year}-${String(month).padStart(2, '0')}`),
        });
    }
    return out;
}

export function statsSourceForId(snapshot: StatsDashboardSnapshot, id: StatsSourceId): StatsSourceSnapshot | StatsCombinedSnapshot {
    if (id === 'jpdb') return snapshot.jpdb;
    if (id === 'anki') return snapshot.anki;
    return snapshot.combined;
}

export function formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return 'n/a';
    return `${Math.round(value * 100)}%`;
}

export function formatCompactNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/u, '')}m`;
    if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}k`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/u, '')}k`;
    return String(Math.round(value));
}

export function statsCardSegments(cards: StatsCardBreakdown): Array<{ key: keyof StatsCardBreakdown; label: string; value: number }> {
    const segments: Array<{ key: keyof StatsCardBreakdown; label: string; value: number }> = [
        { key: 'new', label: 'New', value: cards.new },
        { key: 'learning', label: 'Learning', value: cards.learning },
        { key: 'failed', label: 'Failed', value: cards.failed },
        { key: 'due', label: 'Due', value: Math.max(0, cards.due - cards.failed) },
        { key: 'review', label: 'Review', value: cards.review },
        { key: 'known', label: 'Known', value: cards.known },
        { key: 'suspended', label: 'Suspended', value: cards.suspended },
        { key: 'ignored', label: 'Ignored', value: cards.ignored },
    ];
    return segments.filter(segment => segment.value > 0);
}

export function statsActivityMetricValue(point: StatsDailyPoint, metric: StatsActivityMetric): number {
    if (metric === 'minutes') return point.minutes;
    if (metric === 'newCards') return point.newCards;
    return point.reviews;
}

export function statsActivityMetricTotal(points: StatsDailyPoint[], metric: StatsActivityMetric): number {
    return points.reduce((sum, point) => sum + statsActivityMetricValue(point, metric), 0);
}

export function dailyActivityStreakAt(points: StatsDailyPoint[], date: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return 0;
    const active = new Set(points.filter(point => point.reviews > 0).map(point => point.date));
    let streak = 0;
    for (let cursor = startOfLocalDay(new Date(`${date}T00:00:00`)); active.has(dateKey(cursor)); cursor = new Date(cursor.getTime() - DAY_MS)) {
        streak += 1;
    }
    return streak;
}

export function averageReviewSpeed(source: Pick<StatsSourceSnapshot, 'daily'>): number | null {
    const totals = source.daily.reduce((accumulator, point) => {
        if (point.minutes <= 0) return accumulator;
        return {
            reviews: accumulator.reviews + point.reviews,
            minutes: accumulator.minutes + point.minutes,
        };
    }, { reviews: 0, minutes: 0 });
    return totals.reviews > 0 && totals.minutes > 0 ? totals.reviews / totals.minutes : null;
}

export function estimatedDueMinutes(source: Pick<StatsSourceSnapshot, 'cards' | 'daily'>): number | null {
    const speed = averageReviewSpeed(source);
    if (speed === null || speed <= 0) return null;
    return source.cards.due / speed;
}

function finalizeCombinedStatsSource(source: StatsCombinedSnapshot): StatsCombinedSnapshot {
    const finalized = finalizeStatsSource(source as unknown as StatsSourceSnapshot);
    return { ...finalized, id: 'combined' };
}

function finalizeStatsSource<T extends StatsSourceSnapshot>(source: T): T {
    const daily = sortedDailyPoints(source.daily);
    const totals = daily.reduce((accumulator, point) => ({
        reviews: accumulator.reviews + point.reviews,
        correct: accumulator.correct + point.correct,
        failed: accumulator.failed + point.failed,
    }), { reviews: 0, correct: 0, failed: 0 });
    const streaks = streakStats(daily);
    const today = dateKey(new Date());
    return {
        ...source,
        daily,
        reviewsToday: Math.max(source.reviewsToday, daily.find(point => point.date === today)?.reviews ?? 0),
        totalReviews: source.totalReviews || totals.reviews,
        retention: source.retention ?? (totals.correct + totals.failed > 0 ? totals.correct / (totals.correct + totals.failed) : null),
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
    };
}

function combinedStatus(jpdb: StatsSourceSnapshot, anki: StatsSourceSnapshot): StatsSourceStatus {
    if (sourcesHaveStatus(jpdb, anki, 'ready')) return bothSourcesHaveStatus(jpdb, anki, 'ready') ? 'ready' : 'partial';
    return COMBINED_STATUS_PRIORITY.find(status => sourcesHaveStatus(jpdb, anki, status)) ?? 'setup';
}

const COMBINED_STATUS_PRIORITY: StatsSourceStatus[] = ['partial', 'loading', 'error'];

function sourcesHaveStatus(jpdb: StatsSourceSnapshot, anki: StatsSourceSnapshot, status: StatsSourceStatus): boolean {
    return jpdb.status === status || anki.status === status;
}

function bothSourcesHaveStatus(jpdb: StatsSourceSnapshot, anki: StatsSourceSnapshot, status: StatsSourceStatus): boolean {
    return jpdb.status === status && anki.status === status;
}

function combinedMessage(jpdb: StatsSourceSnapshot, anki: StatsSourceSnapshot): string {
    const apiLabel = jpdb.label || 'JPDB';
    if (jpdb.status === 'ready' && anki.status === 'ready') return `${apiLabel} and Anki are connected.`;
    if (jpdb.status === 'ready' || jpdb.status === 'partial') return `Showing ${apiLabel} stats. Connect Anki for the combined view.`;
    if (anki.status === 'ready' || anki.status === 'partial') return 'Showing Anki stats. Add JPDB or Jiten data for the combined view.';
    return 'Connect JPDB, Jiten, or Anki to build your dashboard.';
}

function addCardBreakdowns(left: StatsCardBreakdown, right: StatsCardBreakdown): StatsCardBreakdown {
    return {
        total: left.total + right.total,
        new: left.new + right.new,
        learning: left.learning + right.learning,
        review: left.review + right.review,
        due: left.due + right.due,
        failed: left.failed + right.failed,
        known: left.known + right.known,
        suspended: left.suspended + right.suspended,
        ignored: left.ignored + right.ignored,
    };
}

function mergeDailyPoints(...groups: StatsDailyPoint[][]): StatsDailyPoint[] {
    const byDate = new Map<string, StatsDailyPoint>();
    for (const group of groups) {
        for (const point of group) {
            const existing = ensureDailyPoint(byDate, point.date);
            existing.reviews += point.reviews;
            existing.correct += point.correct;
            existing.failed += point.failed;
            existing.newCards += point.newCards;
            existing.minutes += point.minutes;
        }
    }
    return sortedDailyPoints([...byDate.values()]);
}

function jpdbCardBreakdown(cards: JPDBCard[]): StatsCardBreakdown {
    const out = { ...EMPTY_CARDS, total: cards.length };
    for (const card of cards) {
        addJpdbCardStateBreakdown(out, primaryCardState(card.cardState));
    }
    return out;
}

function addJpdbCardStateBreakdown(out: StatsCardBreakdown, state: CardState): void {
    const update = JPDB_CARD_STATE_BREAKDOWN_UPDATES[state];
    if (update) update(out);
    else if (JPDB_IGNORED_STATES.has(state)) out.ignored += 1;
    else out.review += 1;
}

const JPDB_CARD_STATE_BREAKDOWN_UPDATES: Record<string, (out: StatsCardBreakdown) => void> = {
    new: out => { out.new += 1; },
    learning: out => { out.learning += 1; },
    due: out => addDueJpdbCard(out, false),
    failed: out => addDueJpdbCard(out, true),
    known: addKnownJpdbCard,
    'never-forget': addKnownJpdbCard,
    suspended: out => { out.suspended += 1; },
};

function addDueJpdbCard(out: StatsCardBreakdown, failed: boolean): void {
    out.due += 1;
    out.review += 1;
    if (failed) out.failed += 1;
}

function addKnownJpdbCard(out: StatsCardBreakdown): void {
    out.known += 1;
    out.review += 1;
}

function ankiCardBreakdown(stats: AnkiDeckStats[]): StatsCardBreakdown {
    const out = { ...EMPTY_CARDS };
    for (const deck of stats) {
        const newCount = numberValue(deck.new_count);
        const learnCount = numberValue(deck.learn_count);
        const reviewCount = numberValue(deck.review_count);
        const total = numberValue(deck.total_in_deck) || newCount + learnCount + reviewCount;
        out.total += total;
        out.new += newCount;
        out.learning += learnCount;
        out.review += reviewCount;
        out.due += reviewCount;
    }
    return out;
}

function ankiReviewedByDayToDaily(value: Array<[string, number]>): StatsDailyPoint[] {
    return value
        .map(item => {
            const date = normalizeDateString(item[0]);
            const reviews = numberValue(item[1]);
            return date ? { ...emptyDailyPoint(date), reviews } : null;
        })
        .filter((point): point is StatsDailyPoint => point !== null);
}

async function loadAnkiRetentionDaily(api: StatsAnkiApi, deckNames: string[] | null): Promise<StatsDailyPoint[]> {
    const cards = await findAnkiRetentionCards(api, deckNames);
    const selectedCards = cards.filter(card => Number.isFinite(Number(card))).slice(0, ANKI_RETENTION_CARD_LIMIT);
    if (!selectedCards.length) return [];
    const reviewsByCard = await api.invoke<Record<string, AnkiReviewLog[]>>('getReviewsOfCards', { cards: selectedCards });
    const cutoff = Date.now() - ANKI_RETENTION_WINDOW_DAYS * DAY_MS;
    const daily = new Map<string, StatsDailyPoint>();
    for (const reviews of Object.values(reviewsByCard ?? {})) {
        for (const review of reviews ?? []) {
            const timestamp = numberValue(review.id);
            if (!timestamp || timestamp < cutoff) continue;
            const point = ensureDailyPoint(daily, dateKey(new Date(timestamp)));
            if (numberValue(review.ease) >= 2) point.correct += 1;
            else point.failed += 1;
            point.minutes += numberValue(review.time) / 60_000;
        }
    }
    return sortedDailyPoints([...daily.values()]);
}

async function findAnkiRetentionCards(api: StatsAnkiApi, deckNames: string[] | null): Promise<number[]> {
    if (deckNames !== null && !deckNames.length) return [];
    if (deckNames === null) return await api.invoke<number[]>('findCards', { query: ankiRetentionQuery() });
    const cardGroups = await Promise.all(deckNames.map(deck =>
        api.invoke<number[]>('findCards', { query: ankiRetentionQuery(deck) }).catch(() => []),
    ));
    return [...new Set(cardGroups.flat())];
}

function ankiRetentionQuery(deckName?: string): string {
    return [deckName ? `deck:${quoteAnkiSearch(deckName)}` : '', `rated:${ANKI_RETENTION_WINDOW_DAYS}`].filter(Boolean).join(' ');
}

function quoteAnkiSearch(value: string): string {
    return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}

function ankiDeckSelectionMessage(activeDeckCount: number, totalDeckCount: number): string {
    if (!totalDeckCount) return 'Connected to Anki.';
    if (!activeDeckCount) return `Connected to Anki. 0 of ${totalDeckCount} decks selected.`;
    if (activeDeckCount === totalDeckCount) return `Connected to ${totalDeckCount} deck${totalDeckCount === 1 ? '' : 's'}.`;
    return `Connected to ${activeDeckCount} of ${totalDeckCount} decks.`;
}

function jpdbReviewCards(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!isRecord(value)) return [];
    const cards = Object.entries(value)
        .filter(([key, item]) => key.startsWith('cards_') && Array.isArray(item))
        .flatMap(([, item]) => item as unknown[]);
    if (cards.length) return cards;
    return Array.isArray(value.cards) ? value.cards : [];
}

interface NormalizedJpdbReview {
    timestamp: Date;
    grade: string;
    minutes: number;
}

function normalizeJpdbReviewEntries(card: unknown): NormalizedJpdbReview[] {
    if (!isRecord(card) || !Array.isArray(card.reviews)) return [];
    return card.reviews
        .map(normalizeJpdbReview)
        .filter((review): review is NormalizedJpdbReview => review !== null)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function normalizeJpdbReview(value: unknown): NormalizedJpdbReview | null {
    if (Array.isArray(value)) {
        const timestamp = reviewTimestamp(value[0]);
        if (!timestamp) return null;
        return {
            timestamp,
            grade: reviewGrade(value[3]),
            minutes: numberValue(value[5]) / 60_000,
        };
    }
    if (!isRecord(value)) return null;
    const timestamp = reviewTimestamp(value.timestamp ?? value.time ?? value.date);
    if (!timestamp) return null;
    return {
        timestamp,
        grade: reviewGrade(value.grade ?? value.rating ?? value.ease),
        minutes: reviewMinutes(value),
    };
}

function reviewTimestamp(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    const numeric = numberValue(value);
    if (!numeric) return null;
    const ms = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date : null;
}

function reviewGrade(value: unknown): string {
    if (typeof value === 'string') return value.trim().toLowerCase();
    const numeric = numberValue(value);
    if (!numeric) return 'fail';
    if (numeric >= 4) return 'easy';
    if (numeric >= 3) return 'okay';
    if (numeric >= 2) return 'hard';
    return 'fail';
}

function reviewMinutes(value: Record<string, unknown>): number {
    const ms = numberValue(value.time_spent_ms ?? value.duration_ms);
    if (ms) return ms / 60_000;
    const seconds = numberValue(value.time_spent ?? value.duration ?? value.seconds);
    return seconds ? seconds / 60 : 0;
}

function isJpdbSuccessfulGrade(grade: string): boolean {
    return JPDB_SUCCESS_GRADES.has(grade) || (/^\d+$/u.test(grade) && Number(grade) >= 2);
}

function streakStats(points: StatsDailyPoint[]): { current: number; longest: number } {
    const active = new Set(points.filter(point => point.reviews > 0).map(point => point.date));
    let current = 0;
    for (let cursor = startOfLocalDay(new Date()); active.has(dateKey(cursor)); cursor = new Date(cursor.getTime() - DAY_MS)) {
        current += 1;
    }

    let longest = 0;
    let run = 0;
    let previousTime = 0;
    for (const point of points) {
        if (point.reviews <= 0) continue;
        const time = startOfLocalDay(new Date(`${point.date}T00:00:00`)).getTime();
        run = previousTime && time - previousTime === DAY_MS ? run + 1 : 1;
        longest = Math.max(longest, run);
        previousTime = time;
    }
    return { current, longest };
}

function sortedDailyPoints(points: StatsDailyPoint[]): StatsDailyPoint[] {
    return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

function sumDailyPoints(points: StatsDailyPoint[], date: string): StatsDailyPoint {
    return points.reduce((total, point) => ({
        date,
        reviews: total.reviews + point.reviews,
        correct: total.correct + point.correct,
        failed: total.failed + point.failed,
        newCards: total.newCards + point.newCards,
        minutes: total.minutes + point.minutes,
    }), emptyDailyPoint(date));
}

function ensureDailyPoint(points: Map<string, StatsDailyPoint>, date: string): StatsDailyPoint {
    const existing = points.get(date);
    if (existing) return existing;
    const created = emptyDailyPoint(date);
    points.set(date, created);
    return created;
}

function emptyDailyPoint(date: string): StatsDailyPoint {
    return { date, reviews: 0, correct: 0, failed: 0, newCards: 0, minutes: 0 };
}

function dateKey(date: Date): string {
    const local = startOfLocalDay(date);
    const year = local.getFullYear();
    const month = String(local.getMonth() + 1).padStart(2, '0');
    const day = String(local.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfLocalMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function mondayFirstWeekday(date: Date): number {
    return (date.getDay() + 6) % 7;
}

function normalizeDateString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) ? dateKey(parsed) : null;
}

function numberValue(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
