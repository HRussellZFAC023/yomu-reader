// @vitest-environment node
import { handleClassRoute } from '../../workers/yomu-academy/src/classes';
import type { Env } from '../../workers/yomu-academy/src/env';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy, type SqliteAcademy } from './helpers/sqlite-academy-env';

const now = Date.UTC(2026, 6, 19, 12);
const CLASS_A = 'ucl-2026';
const CLASS_B = 'ucl-2027';

interface MemberOptions {
    readonly classId?: string;
    readonly publicId: string;
    readonly displayName: string;
    readonly discriminator: string;
    readonly role?: 'learner' | 'sensei';
    readonly boardVisible?: boolean;
    readonly boardHidden?: boolean;
    readonly avatarKey?: 'quality-2' | 'quality-3';
    readonly shareAvatar?: boolean;
    readonly knownWords?: number;
    readonly lessonsCompleted?: number;
    readonly lessonsTotal?: number;
    readonly updatedAt?: number;
    readonly studyDays?: readonly string[];
}

interface LeaderboardEntry {
    readonly rank: number;
    readonly accountId: string;
    readonly displayTag: string;
    readonly role: 'learner' | 'sensei';
    readonly value: number;
    readonly avatarKey?: string;
    readonly updatedAt: number | null;
}

interface LeaderboardPayload {
    readonly entries: LeaderboardEntry[];
    readonly me: LeaderboardEntry | null;
    readonly metric: Record<string, unknown>;
    readonly pagination: { readonly page: number; readonly limit: number; readonly visibleEntries: number; readonly pages: number };
    readonly updatedAt: number | null;
    readonly freshness: Record<string, unknown>;
}

function get(path: string, cookie?: string): Request {
    return new Request(`https://yomureader.com${path}`, {
        headers: cookie ? { cookie } : {},
    });
}

function publicId(sequence: number): string {
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

async function addMember(academy: SqliteAcademy, options: MemberOptions): Promise<string> {
    const accountId = `account-${options.discriminator}`;
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO accounts '
        + '(id, public_id, google_sub_hash, display_name, name_chosen, discriminator, avatar_key, '
        + 'board_visible, share_avatar, created_at, updated_at, recovery_bound_at) '
        + 'VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8, ?9, ?9, ?9)',
    ).bind(
        accountId,
        options.publicId,
        `opaque-subject-hash-${options.discriminator}`,
        options.displayName,
        options.discriminator,
        options.avatarKey ?? null,
        options.boardVisible === false ? 0 : 1,
        options.shareAvatar ? 1 : 0,
        now - 100_000,
    ).run();
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO class_memberships (class_id, account_id, role, board_hidden, joined_at) VALUES (?1, ?2, ?3, ?4, ?5)',
    ).bind(
        options.classId ?? CLASS_A,
        accountId,
        options.role ?? 'learner',
        options.boardHidden ? 1 : 0,
        now - 90_000,
    ).run();
    if (options.knownWords !== undefined || options.lessonsCompleted !== undefined) {
        const lessonsCompleted = options.lessonsCompleted ?? 0;
        await academy.env.ACADEMY_DB.prepare(
            'INSERT INTO progress_snapshots '
            + '(account_id, known_word_count, reviews_completed, reviews_due, lessons_completed, lessons_total, updated_at) '
            + 'VALUES (?1, ?2, 0, 0, ?3, ?4, ?5)',
        ).bind(
            accountId,
            options.knownWords ?? 0,
            lessonsCompleted,
            options.lessonsTotal ?? lessonsCompleted,
            options.updatedAt ?? now - 1_000,
        ).run();
    }
    for (const studyDate of options.studyDays ?? []) {
        await academy.env.ACADEMY_DB.prepare(
            'INSERT INTO study_days (account_id, study_date) VALUES (?1, ?2)',
        ).bind(accountId, studyDate).run();
    }
    return accountId;
}

let inviteSequence = 0;

async function authenticatedCookie(academy: SqliteAcademy, accountId: string): Promise<string> {
    inviteSequence += 1;
    const code = `LEADER${String(inviteSequence).padStart(4, '0')}`;
    const inviteId = `leaderboard-session-${inviteSequence}`;
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO invites '
        + '(id, code_hash, uses_remaining, kind, created_at, expires_at, revoked_at, purchase_id, class_id, account_required) '
        + "VALUES (?1, ?2, 1, 'seed', ?3, NULL, NULL, NULL, NULL, 1)",
    ).bind(inviteId, await inviteCodeHash(academy.env, code), now - 10_000).run();
    const response = await handleCreateSession(new Request('https://yomureader.com/academy/api/session', {
        method: 'POST',
        headers: {
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            'cf-connecting-ip': `198.51.100.${inviteSequence}`,
        },
        body: JSON.stringify({ code }),
    }), academy.env, () => now - 5_000);
    const session = await response.json() as { sessionId: string };
    await academy.env.ACADEMY_DB.prepare(
        'UPDATE sessions SET account_id = ?1 WHERE public_id = ?2',
    ).bind(accountId, session.sessionId).run();
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Session cookie was not created.');
    return cookie;
}

async function leaderboard(env: Env, cookie: string, query = ''): Promise<LeaderboardPayload> {
    const response = await handleClassRoute(
        get(`/academy/api/classes/${CLASS_A}/leaderboard${query}`, cookie),
        env,
        () => now,
    );
    return response.json() as Promise<LeaderboardPayload>;
}

describe('Academy class leaderboard', () => {
    let academy: SqliteAcademy;

    beforeEach(async () => {
        academy = createSqliteAcademy();
        await academy.env.ACADEMY_DB.prepare(
            'INSERT INTO classes (id, name, created_at) VALUES (?1, ?2, ?3), (?4, ?5, ?3)',
        ).bind(CLASS_A, 'UCL Japanese 2026', now - 200_000, CLASS_B, 'UCL Japanese 2027').run();
    });

    afterEach(() => academy.close());

    it('requires an authenticated account and denies accounts outside the requested class', async () => {
        await expect(handleClassRoute(
            get(`/academy/api/classes/${CLASS_A}/leaderboard`), academy.env, () => now,
        )).rejects.toMatchObject({ status: 401 });

        const outsiderId = await addMember(academy, {
            classId: CLASS_B,
            publicId: publicId(1),
            displayName: 'Outsider',
            discriminator: '100001',
        });
        const outsiderCookie = await authenticatedCookie(academy, outsiderId);
        await expect(handleClassRoute(
            get(`/academy/api/classes/${CLASS_A}/leaderboard`, outsiderCookie), academy.env, () => now,
        )).rejects.toMatchObject({ status: 403 });
    });

    it('uses deterministic competition ranks and returns an off-page placement for me', async () => {
        await addMember(academy, {
            publicId: publicId(2),
            displayName: 'Aakash',
            discriminator: '200002',
            role: 'sensei',
            studyDays: ['2026-07-17', '2026-07-18', '2026-07-19'],
            knownWords: 450,
        });
        await addMember(academy, {
            publicId: publicId(1),
            displayName: 'Mira',
            discriminator: '200001',
            avatarKey: 'quality-2',
            shareAvatar: true,
            studyDays: ['2026-07-17', '2026-07-18', '2026-07-19'],
            knownWords: 420,
        });
        const meId = await addMember(academy, {
            publicId: publicId(3),
            displayName: 'Henry',
            discriminator: '200003',
            studyDays: ['2026-07-18', '2026-07-19'],
            knownWords: 400,
        });
        const cookie = await authenticatedCookie(academy, meId);

        const payload = await leaderboard(academy.env, cookie, '?metric=streak&page=1&limit=2');
        expect(payload.entries).toEqual([
            expect.objectContaining({ rank: 1, accountId: publicId(1), value: 3, role: 'learner', avatarKey: 'quality-2' }),
            expect.objectContaining({ rank: 1, accountId: publicId(2), value: 3, role: 'sensei' }),
        ]);
        expect(payload.entries[1]).not.toHaveProperty('avatarKey');
        expect(payload.me).toMatchObject({ rank: 3, accountId: publicId(3), value: 2 });
        expect(payload.pagination).toEqual({ page: 1, limit: 2, visibleEntries: 3, pages: 2 });
        expect(payload.metric).toMatchObject({ id: 'streak', unit: 'days', window: 'current-streak', asOf: '2026-07-19' });
        expect(payload.freshness).toEqual({ generatedAt: now, mode: 'server-snapshot', realTime: false });
    });

    it('excludes learner opt-outs, moderation-hidden members, and every member of another class', async () => {
        const visibleId = await addMember(academy, {
            publicId: publicId(10), displayName: 'Visible', discriminator: '300010', knownWords: 10,
        });
        await addMember(academy, {
            publicId: publicId(11), displayName: 'Opted Out', discriminator: '300011', boardVisible: false, knownWords: 999_999,
        });
        await addMember(academy, {
            publicId: publicId(12), displayName: 'Moderated', discriminator: '300012', boardHidden: true, knownWords: 999_998,
        });
        await addMember(academy, {
            classId: CLASS_B, publicId: publicId(13), displayName: 'Other Class', discriminator: '300013', knownWords: 999_997,
        });
        const cookie = await authenticatedCookie(academy, visibleId);
        const payload = await leaderboard(academy.env, cookie, '?metric=known-words');
        expect(payload.entries).toEqual([expect.objectContaining({ accountId: publicId(10), value: 10 })]);
        expect(payload.pagination.visibleEntries).toBe(1);
        const serialized = JSON.stringify(payload);
        for (const excluded of ['Opted Out', 'Moderated', 'Other Class', publicId(11), publicId(12), publicId(13)]) {
            expect(serialized).not.toContain(excluded);
        }
    });

    it('derives every metric from server snapshots or study days and declares its window', async () => {
        const accountId = await addMember(academy, {
            publicId: publicId(20),
            displayName: 'Learner',
            discriminator: '400020',
            knownWords: 321,
            lessonsCompleted: 8,
            lessonsTotal: 12,
            updatedAt: now - 2_000,
            studyDays: ['2026-07-12', '2026-07-13', '2026-07-18', '2026-07-19'],
        });
        const cookie = await authenticatedCookie(academy, accountId);

        const known = await leaderboard(academy.env, cookie, '?metric=known-words');
        expect(known.entries[0]).toMatchObject({ value: 321, updatedAt: now - 2_000 });
        expect(known.metric).toMatchObject({ window: 'all-time', unit: 'words' });
        expect(known.updatedAt).toBe(now - 2_000);

        const lessons = await leaderboard(academy.env, cookie, '?metric=lesson-progress');
        expect(lessons.entries[0].value).toBe(8);
        expect(lessons.metric).toMatchObject({ window: 'all-time', unit: 'lessons' });

        const activity = await leaderboard(academy.env, cookie, '?metric=review-activity');
        expect(activity.entries[0].value).toBe(3);
        expect(activity.metric).toMatchObject({
            window: 'rolling-7-utc-days', startsOn: '2026-07-13', endsOn: '2026-07-19', unit: 'days',
        });
        expect(activity.metric.meaning).toContain('not a count of answers, grades, or reviews');
    });

    it('returns only opaque board identity and explicitly shared avatars', async () => {
        const meId = await addMember(academy, {
            publicId: publicId(30),
            displayName: 'Private Avatar',
            discriminator: '500030',
            avatarKey: 'quality-3',
            shareAvatar: false,
            knownWords: 2,
        });
        await addMember(academy, {
            publicId: publicId(31),
            displayName: 'Shared Avatar',
            discriminator: '500031',
            avatarKey: 'quality-2',
            shareAvatar: true,
            knownWords: 3,
        });
        const cookie = await authenticatedCookie(academy, meId);
        const payload = await leaderboard(academy.env, cookie, '?metric=known-words');
        expect(payload.entries[0]).toMatchObject({ accountId: publicId(31), displayTag: 'Shared Avatar#500031', avatarKey: 'quality-2' });
        expect(payload.entries[1]).toMatchObject({ accountId: publicId(30), displayTag: 'Private Avatar#500030' });
        expect(payload.entries[1]).not.toHaveProperty('avatarKey');

        const serialized = JSON.stringify(payload);
        for (const forbidden of [
            'account-500030', 'opaque-subject-hash', 'google', 'email', 'raw-events', 'answers', 'failed-items',
            'word-lists', 'reviewsDue', 'reviewsCompleted',
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it('validates the metric and bounded pagination without accepting score input', async () => {
        const meId = await addMember(academy, {
            publicId: publicId(40), displayName: 'Learner', discriminator: '600040',
        });
        const cookie = await authenticatedCookie(academy, meId);
        for (const query of [
            '?metric=popularity', '?limit=0', '?limit=51', '?limit=1.5', '?page=0', '?page=1001',
            '?metric=streak&metric=known-words', '?score=999999',
        ]) {
            await expect(handleClassRoute(
                get(`/academy/api/classes/${CLASS_A}/leaderboard${query}`, cookie), academy.env, () => now,
            )).rejects.toMatchObject({ status: 400 });
        }
    });
});
