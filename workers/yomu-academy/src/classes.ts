import { displayTag, requireAccount } from './accounts';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { inviteCodeHash, normalizeInviteCode, requireAdmin } from './invites';
import { calculateStreaks } from './progress';

const CLASS_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const LEADERBOARD_PAGE_LIMIT = 50;
const LEADERBOARD_PAGE_MAX = 1_000;
const DAY_MS = 86_400_000;

type LeaderboardMetric = 'streak' | 'review-activity' | 'known-words' | 'lesson-progress';

interface LeaderboardMetricDefinition {
    readonly meaning: string;
    readonly unit: 'days' | 'words' | 'lessons';
    readonly window: 'current-streak' | 'rolling-7-utc-days' | 'all-time';
}

const LEADERBOARD_METRICS: Readonly<Record<LeaderboardMetric, LeaderboardMetricDefinition>> = {
    streak: {
        meaning: 'Current consecutive qualifying study-day run from synced Yomu progress.',
        unit: 'days',
        window: 'current-streak',
    },
    'review-activity': {
        meaning: 'Qualifying Yomu study days synced in the trailing seven UTC days; this is not a count of answers, grades, or reviews.',
        unit: 'days',
        window: 'rolling-7-utc-days',
    },
    'known-words': {
        meaning: 'Vocabulary concepts currently reported as independently known by Yomu SRS.',
        unit: 'words',
        window: 'all-time',
    },
    'lesson-progress': {
        meaning: 'Academy lessons currently reported complete in the learner progress snapshot.',
        unit: 'lessons',
        window: 'all-time',
    },
};

interface MembershipRow {
    readonly role: 'learner' | 'sensei';
    readonly board_hidden: number;
}

interface BoardRow {
    readonly id: string;
    readonly public_id: string;
    readonly display_name: string;
    readonly discriminator: string;
    readonly avatar_key: string | null;
    readonly share_avatar: number;
    readonly role: 'learner' | 'sensei';
    readonly known_word_count: number;
    readonly reviews_completed: number;
    readonly reviews_due: number;
    readonly lessons_completed: number;
    readonly lessons_total: number;
}

interface LeaderboardRow {
    readonly id: string;
    readonly public_id: string;
    readonly display_name: string;
    readonly discriminator: string;
    readonly avatar_key: string | null;
    readonly share_avatar: number;
    readonly role: 'learner' | 'sensei';
    readonly known_word_count: number;
    readonly lessons_completed: number;
    readonly progress_updated_at: number | null;
}

interface StudyDayRow {
    readonly account_id: string;
    readonly study_date: string;
}

export async function handleAdminClass(request: Request, env: Env, clock: Clock): Promise<Response> {
    await requireAdmin(request, env);
    const body = await readJsonBody(request);
    const classId = parseClassId(body.classId);
    const name = parseClassName(body.name);
    const inviteCode = normalizeInviteCode(body.inviteCode);
    const codeHash = await inviteCodeHash(env, inviteCode);
    const results = await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'INSERT INTO classes (id, name, created_at) VALUES (?1, ?2, ?3) '
            + 'ON CONFLICT(id) DO UPDATE SET name = excluded.name, archived_at = NULL',
        ).bind(classId, name, clock()),
        env.ACADEMY_DB.prepare(
            'UPDATE invites SET class_id = ?1 WHERE code_hash = ?2 AND revoked_at IS NULL',
        ).bind(classId, codeHash),
    ]);
    if ((results[1]?.meta.changes ?? 0) !== 1) throw new HttpError(404, 'Invitation code was not found.');
    return jsonResponse({ classId, name });
}

export async function handleAdminRole(request: Request, env: Env): Promise<Response> {
    await requireAdmin(request, env);
    const body = await readJsonBody(request);
    const classId = parseClassId(body.classId);
    const accountPublicId = parsePublicId(body.accountId);
    if (body.role !== 'learner' && body.role !== 'sensei') throw new HttpError(400, 'role must be learner or sensei.');
    const result = await env.ACADEMY_DB.prepare(
        'UPDATE class_memberships SET role = ?1 WHERE class_id = ?2 '
        + 'AND account_id = (SELECT id FROM accounts WHERE public_id = ?3)',
    ).bind(body.role, classId, accountPublicId).run();
    if ((result.meta.changes ?? 0) !== 1) throw new HttpError(404, 'Class member was not found.');
    return jsonResponse({ ok: true });
}

export async function handleClassRoute(request: Request, env: Env, clock: Clock): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const board = /^\/academy\/api\/classes\/([^/]+)\/board$/.exec(pathname);
    if (board && request.method === 'GET') return handleBoard(request, env, clock, decodeURIComponent(board[1]));
    const leaderboard = /^\/academy\/api\/classes\/([^/]+)\/leaderboard$/.exec(pathname);
    if (leaderboard && request.method === 'GET') {
        return handleLeaderboard(request, env, clock, decodeURIComponent(leaderboard[1]));
    }
    const summary = /^\/academy\/api\/classes\/([^/]+)\/summary$/.exec(pathname);
    if (summary && request.method === 'GET') return handleSummary(request, env, clock, decodeURIComponent(summary[1]));
    const moderation = /^\/academy\/api\/classes\/([^/]+)\/members\/([^/]+)\/moderation$/.exec(pathname);
    if (moderation && request.method === 'PATCH') {
        return handleModeration(request, env, clock, decodeURIComponent(moderation[1]), decodeURIComponent(moderation[2]));
    }
    throw new HttpError(404, 'Not found.');
}

async function handleBoard(request: Request, env: Env, clock: Clock, rawClassId: string): Promise<Response> {
    const classId = parseClassId(rawClassId);
    const { account } = await requireAccount(request, env, clock());
    await requireMembership(env, classId, account.id);
    const members = await boardMembers(env, classId, clock());
    return jsonResponse({ classId, members });
}

async function handleLeaderboard(request: Request, env: Env, clock: Clock, rawClassId: string): Promise<Response> {
    const classId = parseClassId(rawClassId);
    const now = clock();
    const { account } = await requireAccount(request, env, now);
    await requireMembership(env, classId, account.id);
    const { metric, page, limit } = parseLeaderboardQuery(new URL(request.url).searchParams);
    const rows = await leaderboardRows(env, classId);
    const studyDays = await leaderboardStudyDays(env, classId);
    const daysByAccount = new Map<string, string[]>();
    studyDays.forEach(row => {
        const days = daysByAccount.get(row.account_id) ?? [];
        days.push(row.study_date);
        daysByAccount.set(row.account_id, days);
    });

    const ranked = rows.map(row => {
        const days = daysByAccount.get(row.id) ?? [];
        return {
            accountId: row.public_id,
            displayTag: displayTag(row),
            ...(row.share_avatar === 1 && row.avatar_key ? { avatarKey: row.avatar_key } : {}),
            role: row.role,
            value: leaderboardValue(metric, row, days, now),
            updatedAt: row.progress_updated_at,
        };
    }).sort((left, right) => right.value - left.value || compareOpaqueIds(left.accountId, right.accountId));

    let priorValue: number | undefined;
    let priorRank = 0;
    const placements = ranked.map((entry, index) => {
        if (entry.value !== priorValue) priorRank = index + 1;
        priorValue = entry.value;
        return { rank: priorRank, ...entry };
    });
    const offset = (page - 1) * limit;
    const updatedAt = rows.reduce<number | null>((latest, row) => (
        row.progress_updated_at !== null && (latest === null || row.progress_updated_at > latest)
            ? row.progress_updated_at
            : latest
    ), null);

    return jsonResponse({
        classId,
        metric: leaderboardMetricView(metric, now),
        entries: placements.slice(offset, offset + limit),
        me: placements.find(entry => entry.accountId === account.public_id) ?? null,
        pagination: {
            page,
            limit,
            visibleEntries: placements.length,
            pages: placements.length === 0 ? 0 : Math.ceil(placements.length / limit),
        },
        updatedAt,
        freshness: {
            generatedAt: now,
            mode: 'server-snapshot',
            realTime: false,
        },
    });
}

async function handleSummary(request: Request, env: Env, clock: Clock, rawClassId: string): Promise<Response> {
    const classId = parseClassId(rawClassId);
    const { account } = await requireAccount(request, env, clock());
    await requireMembership(env, classId, account.id);
    const members = await boardMembers(env, classId, clock());
    const average = (values: number[]): number => values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    return jsonResponse({
        classId,
        visibleMembers: members.length,
        aggregates: {
            averageCurrentStreak: average(members.map(member => member.currentStreak)),
            averageKnownWordCount: average(members.map(member => member.knownWordCount)),
            reviewsCompleted: members.reduce((sum, member) => sum + member.reviews.completed, 0),
            lessonsCompleted: members.reduce((sum, member) => sum + member.lessons.completed, 0),
        },
    });
}

async function handleModeration(
    request: Request,
    env: Env,
    clock: Clock,
    rawClassId: string,
    rawAccountId: string,
): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const classId = parseClassId(rawClassId);
    const accountPublicId = parsePublicId(rawAccountId);
    const { account } = await requireAccount(request, env, clock());
    const membership = await requireMembership(env, classId, account.id);
    if (membership.role !== 'sensei') throw new HttpError(403, 'Sensei access required.');
    const body = await readJsonBody(request);
    if (typeof body.hidden !== 'boolean') throw new HttpError(400, 'hidden must be true or false.');
    const result = await env.ACADEMY_DB.prepare(
        'UPDATE class_memberships SET board_hidden = ?1 WHERE class_id = ?2 AND role = ?3 '
        + 'AND account_id = (SELECT id FROM accounts WHERE public_id = ?4)',
    ).bind(body.hidden ? 1 : 0, classId, 'learner', accountPublicId).run();
    if ((result.meta.changes ?? 0) !== 1) throw new HttpError(404, 'Learner was not found.');
    return jsonResponse({ ok: true });
}

async function requireMembership(env: Env, classId: string, accountId: string): Promise<MembershipRow> {
    const membership = await env.ACADEMY_DB.prepare(
        'SELECT m.role, m.board_hidden FROM class_memberships m JOIN classes c ON c.id = m.class_id '
        + 'WHERE m.class_id = ?1 AND m.account_id = ?2 AND c.archived_at IS NULL',
    ).bind(classId, accountId).first<MembershipRow>();
    if (!membership) throw new HttpError(403, 'This class is not available to your account.');
    return membership;
}

async function boardMembers(env: Env, classId: string, now: number): Promise<Array<{
    accountId: string;
    displayTag: string;
    avatarKey?: string;
    role: string;
    currentStreak: number;
    longestStreak: number;
    knownWordCount: number;
    reviews: { completed: number; due: number };
    lessons: { completed: number; total: number };
}>> {
    const result = await env.ACADEMY_DB.prepare(
        'SELECT a.id, a.public_id, a.display_name, a.discriminator, a.avatar_key, a.share_avatar, m.role, '
        + 'COALESCE(p.known_word_count, 0) AS known_word_count, COALESCE(p.reviews_completed, 0) AS reviews_completed, '
        + 'COALESCE(p.reviews_due, 0) AS reviews_due, COALESCE(p.lessons_completed, 0) AS lessons_completed, '
        + 'COALESCE(p.lessons_total, 0) AS lessons_total FROM class_memberships m '
        + 'JOIN accounts a ON a.id = m.account_id LEFT JOIN progress_snapshots p ON p.account_id = a.id '
        + 'WHERE m.class_id = ?1 AND m.board_hidden = 0 AND a.board_visible = 1 ORDER BY a.display_name, a.discriminator',
    ).bind(classId).all<BoardRow>();
    return Promise.all(result.results.map(async row => {
        const days = await env.ACADEMY_DB.prepare(
            'SELECT study_date FROM study_days WHERE account_id = ?1 ORDER BY study_date',
        ).bind(row.id).all<{ study_date: string }>();
        const streaks = calculateStreaks(days.results.map(day => day.study_date), now);
        return {
            accountId: row.public_id,
            displayTag: displayTag(row),
            ...(row.share_avatar === 1 && row.avatar_key ? { avatarKey: row.avatar_key } : {}),
            role: row.role,
            currentStreak: streaks.current,
            longestStreak: streaks.longest,
            knownWordCount: row.known_word_count,
            reviews: { completed: row.reviews_completed, due: row.reviews_due },
            lessons: { completed: row.lessons_completed, total: row.lessons_total },
        };
    }));
}

async function leaderboardRows(env: Env, classId: string): Promise<LeaderboardRow[]> {
    const result = await env.ACADEMY_DB.prepare(
        'SELECT a.id, a.public_id, a.display_name, a.discriminator, a.avatar_key, a.share_avatar, m.role, '
        + 'COALESCE(p.known_word_count, 0) AS known_word_count, '
        + 'COALESCE(p.lessons_completed, 0) AS lessons_completed, p.updated_at AS progress_updated_at '
        + 'FROM class_memberships m JOIN accounts a ON a.id = m.account_id '
        + 'LEFT JOIN progress_snapshots p ON p.account_id = a.id '
        + 'WHERE m.class_id = ?1 AND m.board_hidden = 0 AND a.board_visible = 1 ORDER BY a.public_id',
    ).bind(classId).all<LeaderboardRow>();
    return result.results;
}

async function leaderboardStudyDays(env: Env, classId: string): Promise<StudyDayRow[]> {
    const result = await env.ACADEMY_DB.prepare(
        'SELECT d.account_id, d.study_date FROM study_days d '
        + 'JOIN class_memberships m ON m.account_id = d.account_id '
        + 'JOIN accounts a ON a.id = m.account_id '
        + 'WHERE m.class_id = ?1 AND m.board_hidden = 0 AND a.board_visible = 1 '
        + 'ORDER BY d.account_id, d.study_date',
    ).bind(classId).all<StudyDayRow>();
    return result.results;
}

function leaderboardValue(
    metric: LeaderboardMetric,
    row: Pick<LeaderboardRow, 'known_word_count' | 'lessons_completed'>,
    studyDays: readonly string[],
    now: number,
): number {
    if (metric === 'known-words') return row.known_word_count;
    if (metric === 'lesson-progress') return row.lessons_completed;
    if (metric === 'streak') return calculateStreaks(studyDays, now).current;
    const today = startOfUtcDay(now);
    const windowStart = today - 6 * DAY_MS;
    return new Set(studyDays).size === 0
        ? 0
        : [...new Set(studyDays)].filter(day => {
            const timestamp = Date.parse(`${day}T00:00:00Z`);
            return timestamp >= windowStart && timestamp <= today;
        }).length;
}

function leaderboardMetricView(metric: LeaderboardMetric, now: number): Record<string, unknown> {
    const definition = LEADERBOARD_METRICS[metric];
    const today = startOfUtcDay(now);
    if (definition.window === 'rolling-7-utc-days') {
        return {
            id: metric,
            ...definition,
            startsOn: new Date(today - 6 * DAY_MS).toISOString().slice(0, 10),
            endsOn: new Date(today).toISOString().slice(0, 10),
        };
    }
    if (definition.window === 'current-streak') {
        return { id: metric, ...definition, asOf: new Date(today).toISOString().slice(0, 10) };
    }
    return { id: metric, ...definition };
}

function parseLeaderboardQuery(searchParams: URLSearchParams): {
    metric: LeaderboardMetric;
    page: number;
    limit: number;
} {
    const allowed = new Set(['metric', 'page', 'limit']);
    for (const key of searchParams.keys()) {
        if (!allowed.has(key)) throw new HttpError(400, `Unknown leaderboard query parameter: ${key}.`);
        if (searchParams.getAll(key).length !== 1) throw new HttpError(400, `Leaderboard query parameter ${key} must appear once.`);
    }
    const metricValue = searchParams.get('metric') ?? 'streak';
    if (!Object.hasOwn(LEADERBOARD_METRICS, metricValue)) throw new HttpError(400, 'Unknown leaderboard metric.');
    return {
        metric: metricValue as LeaderboardMetric,
        page: parseBoundedInteger(searchParams.get('page'), 1, LEADERBOARD_PAGE_MAX, 1, 'page'),
        limit: parseBoundedInteger(searchParams.get('limit'), 1, LEADERBOARD_PAGE_LIMIT, 20, 'limit'),
    };
}

function parseBoundedInteger(value: string | null, minimum: number, maximum: number, fallback: number, field: string): number {
    if (value === null) return fallback;
    if (!/^\d+$/.test(value)) throw new HttpError(400, `${field} must be an integer from ${minimum} to ${maximum}.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new HttpError(400, `${field} must be an integer from ${minimum} to ${maximum}.`);
    }
    return parsed;
}

function startOfUtcDay(now: number): number {
    const date = new Date(now);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function compareOpaqueIds(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function parseClassId(value: unknown): string {
    if (typeof value !== 'string' || !CLASS_ID_PATTERN.test(value)) throw new HttpError(400, 'Invalid class id.');
    return value;
}

function parseClassName(value: unknown): string {
    if (typeof value !== 'string') throw new HttpError(400, 'Class name is required.');
    const name = value.normalize('NFKC').trim().replaceAll(/\s+/gu, ' ');
    if (!name || [...name].length > 80 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)) throw new HttpError(400, 'Class name is invalid.');
    return name;
}

function parsePublicId(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) throw new HttpError(400, 'Invalid account id.');
    return value;
}
