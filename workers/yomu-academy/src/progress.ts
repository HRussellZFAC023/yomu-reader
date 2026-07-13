import { randomToken } from './crypto';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { requireAccount } from './accounts';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MUTATION_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_COUNT = 10_000_000;
const MAX_STUDY_DAYS_PER_IMPORT = 366;
const HISTORY_WINDOW_DAYS = 5 * 366;

export interface ProgressSnapshot {
    readonly knownWordCount: number;
    readonly reviewsCompleted: number;
    readonly reviewsDue: number;
    readonly lessonsCompleted: number;
    readonly lessonsTotal: number;
}

export interface Streaks {
    readonly current: number;
    readonly longest: number;
}

export async function handleProgressSync(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    const { account } = await requireAccount(request, env, now);
    const body = await readJsonBody(request, 32_768);
    const mutationId = parseMutationId(body.mutationId);
    const snapshot = parseSnapshot(body.progress);
    const days = parseStudyDays(body.studyDays, now);
    const guard = randomToken(24);

    const statements = [
        env.ACADEMY_DB.prepare(
            'INSERT OR IGNORE INTO progress_imports (account_id, mutation_id, guard, received_at) VALUES (?1, ?2, ?3, ?4)',
        ).bind(account.id, mutationId, guard, now),
        ...days.map(day => env.ACADEMY_DB.prepare(
            'INSERT OR IGNORE INTO study_days (account_id, study_date) '
            + 'SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM progress_imports WHERE account_id = ?1 AND mutation_id = ?3 AND guard = ?4)',
        ).bind(account.id, day, mutationId, guard)),
        env.ACADEMY_DB.prepare(
            'INSERT INTO progress_snapshots '
            + '(account_id, known_word_count, reviews_completed, reviews_due, lessons_completed, lessons_total, updated_at) '
            + 'SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS '
            + '(SELECT 1 FROM progress_imports WHERE account_id = ?1 AND mutation_id = ?8 AND guard = ?9) '
            + 'ON CONFLICT(account_id) DO UPDATE SET '
            + 'known_word_count = MAX(known_word_count, excluded.known_word_count), '
            + 'reviews_completed = MAX(reviews_completed, excluded.reviews_completed), '
            + 'reviews_due = excluded.reviews_due, '
            + 'lessons_completed = MAX(lessons_completed, excluded.lessons_completed), '
            + 'lessons_total = MAX(lessons_total, excluded.lessons_total), updated_at = excluded.updated_at',
        ).bind(
            account.id,
            snapshot.knownWordCount,
            snapshot.reviewsCompleted,
            snapshot.reviewsDue,
            snapshot.lessonsCompleted,
            snapshot.lessonsTotal,
            now,
            mutationId,
            guard,
        ),
    ];
    const results = await env.ACADEMY_DB.batch(statements);
    return jsonResponse({ merged: (results[0]?.meta.changes ?? 0) === 1 });
}

export function parseSnapshot(value: unknown): ProgressSnapshot {
    if (!isRecord(value)) throw new HttpError(400, 'progress must be an aggregate object.');
    const snapshot: ProgressSnapshot = {
        knownWordCount: count(value.knownWordCount, 'knownWordCount'),
        reviewsCompleted: count(value.reviewsCompleted, 'reviewsCompleted'),
        reviewsDue: count(value.reviewsDue, 'reviewsDue'),
        lessonsCompleted: count(value.lessonsCompleted, 'lessonsCompleted'),
        lessonsTotal: count(value.lessonsTotal, 'lessonsTotal'),
    };
    if (snapshot.lessonsCompleted > snapshot.lessonsTotal) {
        throw new HttpError(400, 'lessonsCompleted cannot exceed lessonsTotal.');
    }
    const allowed = new Set(['knownWordCount', 'reviewsCompleted', 'reviewsDue', 'lessonsCompleted', 'lessonsTotal']);
    if (Object.keys(value).some(key => !allowed.has(key))) {
        throw new HttpError(400, 'Only aggregate progress fields can be synced.');
    }
    return snapshot;
}

export function parseStudyDays(value: unknown, now: number): string[] {
    if (!Array.isArray(value) || value.length > MAX_STUDY_DAYS_PER_IMPORT) {
        throw new HttpError(400, `studyDays must contain at most ${MAX_STUDY_DAYS_PER_IMPORT} UTC dates.`);
    }
    const today = startOfUtcDay(now);
    const earliest = today - HISTORY_WINDOW_DAYS * 86_400_000;
    const unique = new Set<string>();
    for (const item of value) {
        if (typeof item !== 'string' || !DATE_PATTERN.test(item)) throw new HttpError(400, 'studyDays must use YYYY-MM-DD UTC dates.');
        const timestamp = Date.parse(`${item}T00:00:00Z`);
        if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== item || timestamp < earliest || timestamp > today) {
            throw new HttpError(400, 'studyDays contains an invalid or out-of-range UTC date.');
        }
        unique.add(item);
    }
    return [...unique].sort();
}

/** Current streak remains live when the last study day is today or yesterday. */
export function calculateStreaks(studyDays: readonly string[], now: number): Streaks {
    const timestamps = [...new Set(studyDays)]
        .map(day => Date.parse(`${day}T00:00:00Z`))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    let longest = 0;
    let run = 0;
    let previous = Number.NEGATIVE_INFINITY;
    for (const timestamp of timestamps) {
        run = timestamp - previous === 86_400_000 ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = timestamp;
    }
    const today = startOfUtcDay(now);
    const last = timestamps.at(-1);
    if (last === undefined || (last !== today && last !== today - 86_400_000)) return { current: 0, longest };
    let current = 1;
    for (let index = timestamps.length - 1; index > 0; index -= 1) {
        if (timestamps[index] - timestamps[index - 1] !== 86_400_000) break;
        current += 1;
    }
    return { current, longest };
}

function parseMutationId(value: unknown): string {
    if (typeof value !== 'string' || !MUTATION_PATTERN.test(value)) {
        throw new HttpError(400, 'mutationId must be an opaque 8–80 character id.');
    }
    return value;
}

function count(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_COUNT) {
        throw new HttpError(400, `${field} must be a non-negative integer.`);
    }
    return value;
}

function startOfUtcDay(now: number): number {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
