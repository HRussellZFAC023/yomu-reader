import { displayTag, requireAccount } from './accounts';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { inviteCodeHash, normalizeInviteCode, requireAdmin } from './invites';
import { calculateStreaks } from './progress';

const CLASS_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

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
