// @vitest-environment node
import { handleGetAccount, handlePatchAccount, linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import { handleClassRoute } from '../../workers/yomu-academy/src/classes';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { handleProgressSync } from '../../workers/yomu-academy/src/progress';
import { activeSession, handleCreateSession, handleGetSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const now = Date.UTC(2026, 6, 12, 12);

async function enrolled(classId: string | null = 'ucl-2026') {
    const academy = createSqliteAcademy();
    if (classId) {
        await academy.env.ACADEMY_DB.prepare(
            'INSERT INTO classes (id, name, created_at) VALUES (?1, ?2, ?3)',
        ).bind(classId, 'UCL Japanese 2026', now).run();
    }
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO invites '
        + '(id, code_hash, uses_remaining, kind, created_at, expires_at, revoked_at, purchase_id, account_required, class_id) '
        + "VALUES ('invite-ucl', ?1, 20, 'seed', ?2, NULL, NULL, NULL, 1, ?3)",
    ).bind(await inviteCodeHash(academy.env, 'OPEN2026'), now - 1000, classId).run();
    const response = await handleCreateSession(jsonRequest('/academy/api/session', { code: 'OPEN2026' }), academy.env, () => now);
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0];
    const request = new Request('https://yomureader.com/academy/api/session', { headers: { cookie } });
    const session = await activeSession(request, academy.env, now);
    if (!session) throw new Error('fixture session missing');
    return { academy, cookie, session };
}

function jsonRequest(path: string, body: unknown): Request {
    return mutation(path, 'POST', '', body);
}

function get(path: string, cookie: string): Request {
    return new Request(`https://yomureader.com${path}`, { headers: { cookie } });
}

function mutation(path: string, method: 'POST' | 'PATCH', cookie: string, body: unknown): Request {
    return new Request(`https://yomureader.com${path}`, {
        method,
        headers: {
            cookie,
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

async function linked(fixture?: Awaited<ReturnType<typeof enrolled>>) {
    const active = fixture ?? await enrolled();
    const account = await linkGoogleSubject(active.academy.env, active.session, 'private-google-sub', now);
    return { ...active, account };
}

describe('Academy optional accounts', () => {
    it('leaves invite/local study accountless until the learner opts into server features', async () => {
        const { academy, cookie } = await enrolled();
        expect((await handleGetSession(get('/academy/api/session', cookie), academy.env, () => now)).status).toBe(200);
        await expect(handleGetAccount(get('/academy/api/account', cookie), academy.env, () => now)).rejects.toMatchObject({ status: 401 });
        expect(academy.db.rows('SELECT id FROM accounts')).toHaveLength(0);
    });

    it('creates one private account, preserves its discriminator, and exposes only Academy identity', async () => {
        const fixture = await linked();
        expect(fixture.account.display_name).toBe('Learner');
        expect(fixture.account.discriminator).toMatch(/^\d{6}$/);
        expect(fixture.account.board_visible).toBe(0);
        expect(fixture.academy.db.rows('SELECT class_id FROM class_memberships')).toHaveLength(1);

        const again = await linkGoogleSubject(fixture.academy.env, fixture.session, 'private-google-sub', now + 1);
        expect(again.id).toBe(fixture.account.id);
        expect(again.discriminator).toBe(fixture.account.discriminator);
        expect(fixture.academy.db.rows('SELECT id FROM accounts')).toHaveLength(1);
        const refreshedSession = await activeSession(
            get('/academy/api/session', fixture.cookie), fixture.academy.env, now + 1,
        );
        if (!refreshedSession) throw new Error('linked session missing');
        await expect(linkGoogleSubject(fixture.academy.env, refreshedSession, 'different-google-sub', now + 2))
            .rejects.toMatchObject({ status: 409 });
        expect(fixture.academy.db.rows('SELECT id FROM accounts')).toHaveLength(1);

        const patched = await handlePatchAccount(mutation('/academy/api/account', 'PATCH', fixture.cookie, {
            displayName: '  Aakash  ',
            avatarKey: 'quality-2',
            boardVisible: true,
            shareAvatar: true,
        }), fixture.academy.env, () => now + 2);
        const view = await patched.json() as Record<string, unknown>;
        expect(view.displayTag).toBe(`Aakash#${fixture.account.discriminator}`);
        expect(view).not.toHaveProperty('email');
        expect(view).not.toHaveProperty('googleName');
        expect(view).not.toHaveProperty('googlePhoto');
    });
});

describe('aggregate progress merge and class board privacy', () => {
    const progress = {
        knownWordCount: 420,
        reviewsCompleted: 31,
        reviewsDue: 6,
        lessonsCompleted: 8,
        lessonsTotal: 12,
    };

    it('merges the anonymous aggregate exactly once and stores no private event material', async () => {
        const fixture = await linked();
        const body = { mutationId: 'import_local_001', studyDays: ['2026-07-10', '2026-07-11', '2026-07-12'], progress };
        const first = await handleProgressSync(mutation('/academy/api/progress/sync', 'POST', fixture.cookie, body), fixture.academy.env, () => now);
        const second = await handleProgressSync(mutation('/academy/api/progress/sync', 'POST', fixture.cookie, body), fixture.academy.env, () => now + 1);
        expect(await first.json()).toEqual({ merged: true });
        expect(await second.json()).toEqual({ merged: false });
        expect(fixture.academy.db.rows('SELECT mutation_id FROM progress_imports')).toHaveLength(1);
        expect(fixture.academy.db.rows('SELECT study_date FROM study_days')).toHaveLength(3);
        expect(fixture.academy.db.rows(
            'SELECT known_word_count, reviews_completed FROM progress_snapshots WHERE account_id = ?', fixture.account.id,
        )[0]).toMatchObject({ known_word_count: 420, reviews_completed: 31 });
        expect(JSON.stringify(fixture.academy.db.rows('SELECT * FROM accounts'))).not.toContain('private-google-sub');
    });

    it('requires membership, defaults off, and returns only opted-in aggregate board fields', async () => {
        const fixture = await linked();
        await handleProgressSync(mutation('/academy/api/progress/sync', 'POST', fixture.cookie, {
            mutationId: 'import_local_002', studyDays: ['2026-07-10', '2026-07-11', '2026-07-12'], progress,
        }), fixture.academy.env, () => now);

        let board = await handleClassRoute(get('/academy/api/classes/ucl-2026/board', fixture.cookie), fixture.academy.env, () => now);
        expect((await board.json() as { members: unknown[] }).members).toEqual([]);

        await handlePatchAccount(mutation('/academy/api/account', 'PATCH', fixture.cookie, {
            displayName: 'Aakash', avatarKey: 'quality-2', boardVisible: true, shareAvatar: true,
        }), fixture.academy.env, () => now);
        board = await handleClassRoute(get('/academy/api/classes/ucl-2026/board', fixture.cookie), fixture.academy.env, () => now);
        const payload = await board.json() as { members: Array<Record<string, unknown>> };
        expect(payload.members).toHaveLength(1);
        expect(payload.members[0]).toMatchObject({
            avatarKey: 'quality-2', currentStreak: 3, longestStreak: 3, knownWordCount: 420,
            reviews: { completed: 31, due: 6 }, lessons: { completed: 8, total: 12 },
        });
        for (const forbidden of ['email', 'wordList', 'answers', 'failures', 'sentences', 'events']) {
            expect(JSON.stringify(payload)).not.toContain(forbidden);
        }

        const outsider = await linked(await enrolled(null));
        await expect(handleClassRoute(get('/academy/api/classes/ucl-2026/board', outsider.cookie), outsider.academy.env, () => now))
            .rejects.toMatchObject({ status: 403 });
    });

    it('allows Sensei moderation but never role grants through the class route', async () => {
        const fixture = await linked();
        fixture.academy.db.database.prepare(
            "UPDATE class_memberships SET role = 'sensei' WHERE class_id = 'ucl-2026' AND account_id = ?1",
        ).run(fixture.account.id);

        const learner = {
            ...fixture.account,
            id: 'learner-internal',
            public_id: '11111111-1111-4111-8111-111111111111',
            google_sub_hash: 'private-hash-only',
            display_name: 'Karen',
            discriminator: '419213',
            name_chosen: 1,
            board_visible: 1,
            created_at: now,
            updated_at: now,
            recovery_bound_at: now,
        };
        fixture.academy.db.database.prepare(
            'INSERT INTO accounts '
            + '(id, public_id, google_sub_hash, display_name, name_chosen, discriminator, avatar_key, board_visible, share_avatar, created_at, updated_at, recovery_bound_at) '
            + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, 0, ?8, ?8, ?8)',
        ).run(
            learner.id,
            learner.public_id,
            learner.google_sub_hash,
            learner.display_name,
            learner.name_chosen,
            learner.discriminator,
            learner.board_visible,
            now,
        );
        fixture.academy.db.database.prepare(
            "INSERT INTO class_memberships (class_id, account_id, role, board_hidden, joined_at) VALUES ('ucl-2026', ?1, 'learner', 0, ?2)",
        ).run(learner.id, now);

        const response = await handleClassRoute(mutation(
            `/academy/api/classes/ucl-2026/members/${learner.public_id}/moderation`,
            'PATCH', fixture.cookie, { hidden: true, role: 'sensei' },
        ), fixture.academy.env, () => now);
        expect(response.status).toBe(200);
        expect(fixture.academy.db.rows(
            'SELECT board_hidden, role FROM class_memberships WHERE account_id = ?', learner.id,
        )[0]).toMatchObject({ board_hidden: 1, role: 'learner' });
    });
});
