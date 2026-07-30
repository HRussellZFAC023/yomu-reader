// @vitest-environment node
import worker from '../../workers/yomu-academy/src/index';
import { linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import { hmacSha256Hex } from '../../workers/yomu-academy/src/crypto';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import type { Env } from '../../workers/yomu-academy/src/env';
import {
    ACCOUNT_RECOVERY_INVITE_ID,
    READER_ACCOUNT_INVITE_ID,
    activeSession,
} from '../../workers/yomu-academy/src/sessions';
import { createFakeAcademy, jsonRequest, type FakeAcademy } from './helpers/fake-academy-env';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const ctx = { waitUntil: () => undefined };

async function seedInvite(academy: FakeAcademy, code: string, uses = 3): Promise<void> {
    academy.db.invites.push({
        id: `invite-${crypto.randomUUID()}`,
        code_hash: await inviteCodeHash(academy.env, code),
        uses_remaining: uses,
        kind: 'seed',
        created_at: 0,
        expires_at: null,
        revoked_at: null,
        purchase_id: null,
        account_required: 1,
    });
}

function dispatch(env: Env, request: Request): Promise<Response> {
    return worker.fetch(request, env, ctx);
}

function sessionCookie(response: Response): string {
    const header = response.headers.get('set-cookie') ?? '';
    expect(header).toMatch(/^__Host-academy_session=v2[A-Za-z0-9_-]{86}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
    return header.split(';')[0];
}

async function seedSqliteInvite(
    academy: ReturnType<typeof createSqliteAcademy>,
    code = 'OPEN2026',
    uses = 100,
): Promise<void> {
    academy.db.rows(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES (?, ?, ?, 'seed', ?, NULL, NULL, 1) RETURNING id",
        `invite-${crypto.randomUUID()}`, await inviteCodeHash(academy.env, code), uses, Date.now() - 1,
    );
}

describe('Academy Worker sessions', () => {
    it('has the family-index migration and uses it for the logout lookup', () => {
        const academy = createSqliteAcademy();
        try {
            expect(academy.db.rows<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_sessions_token_family'",
            )).toEqual([{ name: 'idx_sessions_token_family' }]);
            const plan = academy.db.rows<{ detail: string }>(
                "EXPLAIN QUERY PLAN UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL AND (token_hash = ? OR "
                + "(length(token_hash) = 129 AND substr(token_hash, 65, 1) = '.' AND substr(token_hash, 1, 64) = ?))",
                1, 'exact-token-digest', 'family-digest',
            );
            expect(plan.some(step => step.detail.includes('idx_sessions_token_family'))).toBe(true);
        } finally {
            academy.close();
        }
    });

    it('exchanges a seeded invite for the exact client session contract', async () => {
        const academy = createFakeAcademy();
        await seedInvite(academy, 'OPEN2026', 3);

        const before = Date.now();
        const response = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(Object.keys(body).sort()).toEqual(['accountRequired', 'expiresAt', 'offlineResumeUntil', 'sessionId']);
        expect(body.accountRequired).toBe(true);
        expect(typeof body.sessionId).toBe('string');
        expect(body.expiresAt).toBeGreaterThanOrEqual(before + 8 * 60 * 60_000);
        expect(body.offlineResumeUntil).toBeGreaterThan(body.expiresAt);

        const cookie = sessionCookie(response);
        // Opaque cookie token: never the sessionId, never stored in plaintext.
        const token = cookie.split('=')[1];
        expect(token).not.toBe(body.sessionId);
        const storedSessions = JSON.stringify(academy.db.sessions);
        expect(academy.db.sessions[0]?.token_hash).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/u);
        expect(storedSessions).not.toContain(token);
        expect(storedSessions).not.toContain(token.slice(2, 45));
        expect(storedSessions).not.toContain(token.slice(45));
        expect(academy.db.invites[0].uses_remaining).toBe(2);

        const current = await dispatch(academy.env, new Request('https://yomureader.com/academy/api/session', { headers: { cookie } }));
        expect(current.status).toBe(200);
        expect(await current.json()).toEqual(body);
    });

    it('reports account-required capability without exposing invite classification', async () => {
        const academy = createFakeAcademy();
        await seedInvite(academy, 'STAFF2026');

        const response = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'STAFF2026' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ accountRequired: true });
    });

    it('reports anonymous, active, linked, and resumable status without a failing or mutating probe', async () => {
        const academy = createSqliteAcademy();
        try {
            const statusRequest = (cookie?: string) => new Request(
                'https://yomureader.com/academy/api/session/status',
                cookie ? { headers: { cookie } } : undefined,
            );

            const anonymous = await dispatch(academy.env, statusRequest());
            expect(anonymous.status).toBe(200);
            expect(anonymous.headers.get('cache-control')).toBe('no-store');
            expect(anonymous.headers.get('set-cookie')).toBeNull();
            expect(await anonymous.json()).toEqual({ state: 'signed-out' });
            expect(await (await dispatch(
                academy.env,
                statusRequest('__Host-academy_session=malformed'),
            )).json()).toEqual({ state: 'signed-out' });
            expect(await (await dispatch(
                academy.env,
                statusRequest(`__Host-academy_session=v2${'A'.repeat(86)}`),
            )).json()).toEqual({ state: 'signed-out' });
            expect(academy.db.rows<{ count: number }>(
                'SELECT COUNT(*) AS count FROM rate_limits',
            )).toEqual([{ count: 0 }]);

            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const cookie = sessionCookie(created);
            const rateWindowsBeforeStatus = academy.db.rows<{ count: number }>(
                'SELECT COUNT(*) AS count FROM rate_limits',
            );
            const tokenHashBeforeStatus = academy.db.rows<{ token_hash: string }>(
                'SELECT token_hash FROM sessions',
            );
            const active = await dispatch(academy.env, statusRequest(cookie));
            expect(active.status).toBe(200);
            expect(await active.json()).toEqual({ state: 'active-unlinked' });
            expect(academy.db.rows<{ count: number }>(
                'SELECT COUNT(*) AS count FROM rate_limits',
            )).toEqual(rateWindowsBeforeStatus);
            expect(academy.db.rows<{ token_hash: string }>(
                'SELECT token_hash FROM sessions',
            )).toEqual(tokenHashBeforeStatus);

            const now = Date.now();
            const accountId = crypto.randomUUID();
            academy.db.rows(
                'INSERT INTO accounts (id, public_id, google_sub_hash, discriminator, created_at, updated_at) '
                + 'VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
                accountId, crypto.randomUUID(), 'google-sub-hash', '419213', now, now,
            );
            academy.db.rows(
                'UPDATE sessions SET account_id = ? RETURNING public_id',
                accountId,
            );
            const linked = await dispatch(academy.env, statusRequest(cookie));
            expect(linked.status).toBe(200);
            expect(await linked.json()).toEqual({ state: 'linked' });

            academy.db.rows(
                'UPDATE sessions SET created_at = ?, expires_at = ? WHERE account_id = ? RETURNING public_id',
                now - 10_000, now - 1, accountId,
            );
            const resumable = await dispatch(academy.env, statusRequest(cookie));
            expect(resumable.status).toBe(200);
            expect(await resumable.json()).toEqual({ state: 'resumable' });

            academy.db.rows(
                'UPDATE sessions SET offline_resume_until = ? WHERE account_id = ? RETURNING public_id',
                now - 1, accountId,
            );
            const elapsed = await dispatch(academy.env, statusRequest(cookie));
            expect(elapsed.status).toBe(200);
            expect(await elapsed.json()).toEqual({ state: 'signed-out' });

            academy.db.rows(
                'UPDATE sessions SET expires_at = ?, offline_resume_until = ?, revoked_at = ? '
                + 'WHERE account_id = ? RETURNING public_id',
                now + 60_000, now + 120_000, now, accountId,
            );
            const revoked = await dispatch(academy.env, statusRequest(cookie));
            expect(revoked.status).toBe(200);
            expect(await revoked.json()).toEqual({ state: 'signed-out' });
        } finally {
            academy.close();
        }
    });

    it('atomically preserves active and resumable invite sessions when Reader sign-in starts', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const cookie = sessionCookie(created);
            const original = academy.db.rows<{ public_id: string; invite_id: string }>(
                'SELECT public_id, invite_id FROM sessions',
            )[0]!;

            const active = await dispatch(academy.env, jsonRequest(
                '/academy/api/auth/google/reader', {}, { cookie },
            ));
            expect(active.status).toBe(200);
            expect(active.headers.get('set-cookie')).toBeNull();
            expect(await active.json()).toMatchObject({ state: 'active-unlinked' });
            expect(academy.db.rows<{ public_id: string; invite_id: string }>(
                'SELECT public_id, invite_id FROM sessions',
            )).toEqual([original]);

            const now = Date.now();
            const accountId = crypto.randomUUID();
            academy.db.rows(
                'INSERT INTO accounts (id, public_id, google_sub_hash, discriminator, created_at, updated_at) '
                + 'VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
                accountId, crypto.randomUUID(), 'reader-ensure-google-sub-hash', '517204', now, now,
            );
            academy.db.rows(
                'UPDATE sessions SET account_id = ? RETURNING public_id',
                accountId,
            );
            const linked = await dispatch(academy.env, jsonRequest(
                '/academy/api/auth/google/reader', {}, { cookie },
            ));
            expect(linked.status).toBe(200);
            expect(linked.headers.get('set-cookie')).toBeNull();
            expect(await linked.json()).toMatchObject({ state: 'linked' });

            academy.db.rows(
                'UPDATE sessions SET created_at = ?, expires_at = ? RETURNING public_id',
                now - 10_000, now - 1,
            );
            const resumed = await dispatch(academy.env, jsonRequest(
                '/academy/api/auth/google/reader', {}, { cookie },
            ));
            expect(resumed.status).toBe(200);
            expect(await resumed.json()).toMatchObject({ state: 'linked' });
            expect(sessionCookie(resumed)).not.toBe(cookie);
            expect(academy.db.rows<{ public_id: string; invite_id: string }>(
                'SELECT public_id, invite_id FROM sessions',
            )).toEqual([original]);
        } finally {
            academy.close();
        }
    });

    it('converts an unlinked recovery session so a new Google subject can create a Reader account', async () => {
        const academy = createSqliteAcademy();
        try {
            const recovery = await dispatch(
                academy.env,
                jsonRequest('/academy/api/auth/google/recovery', {}),
            );
            expect(recovery.status).toBe(201);
            const cookie = sessionCookie(recovery);
            expect(academy.db.rows<{ invite_id: string }>(
                'SELECT invite_id FROM sessions',
            )).toEqual([{ invite_id: ACCOUNT_RECOVERY_INVITE_ID }]);

            const ensured = await dispatch(
                academy.env,
                jsonRequest('/academy/api/auth/google/reader', {}, { cookie }),
            );
            expect(ensured.status).toBe(200);
            expect(ensured.headers.get('set-cookie')).toBeNull();
            expect(await ensured.json()).toMatchObject({ state: 'active-unlinked' });
            expect(academy.db.rows<{ invite_id: string }>(
                'SELECT invite_id FROM sessions',
            )).toEqual([{ invite_id: READER_ACCOUNT_INVITE_ID }]);

            const now = Date.now();
            const session = await activeSession(
                new Request('https://yomureader.com/academy/api/session', { headers: { cookie } }),
                academy.env,
                now,
            );
            expect(session).not.toBeNull();
            const account = await linkGoogleSubject(
                academy.env,
                session!,
                'new-reader-google-subject',
                now,
            );
            expect(account.access_tier).toBe('reader');
        } finally {
            academy.close();
        }
    });

    it('keeps a recovery session after it is linked to an account', async () => {
        const academy = createSqliteAcademy();
        try {
            const recovery = await dispatch(
                academy.env,
                jsonRequest('/academy/api/auth/google/recovery', {}),
            );
            expect(recovery.status).toBe(201);
            const cookie = sessionCookie(recovery);
            const body = await recovery.json() as { sessionId: string };
            const now = Date.now();
            const accountId = crypto.randomUUID();
            academy.db.rows(
                'INSERT INTO accounts '
                + '(id, public_id, google_sub_hash, discriminator, recovery_bound_at, created_at, updated_at) '
                + 'VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
                accountId,
                crypto.randomUUID(),
                'linked-recovery-google-sub-hash',
                '871204',
                now,
                now,
                now,
            );
            academy.db.rows(
                'UPDATE sessions SET account_id = ? WHERE public_id = ? RETURNING public_id',
                accountId,
                body.sessionId,
            );

            const ensured = await dispatch(
                academy.env,
                jsonRequest('/academy/api/auth/google/reader', {}, { cookie }),
            );
            expect(ensured.status).toBe(200);
            expect(ensured.headers.get('set-cookie')).toBeNull();
            expect(await ensured.json()).toMatchObject({ state: 'linked' });
            expect(academy.db.rows<{ invite_id: string }>(
                'SELECT invite_id FROM sessions',
            )).toEqual([{ invite_id: ACCOUNT_RECOVERY_INVITE_ID }]);
            expect(academy.db.rows<{ count: number }>(
                'SELECT COUNT(*) AS count FROM invites WHERE id = ?',
                READER_ACCOUNT_INVITE_ID,
            )).toEqual([{ count: 0 }]);
        } finally {
            academy.close();
        }
    });

    it('never creates a Reader session when another request has rotated the presented family', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const oldCookie = sessionCookie(created);
            const originalInviteId = academy.db.rows<{ invite_id: string }>(
                'SELECT invite_id FROM sessions',
            )[0]!.invite_id;
            const now = Date.now();
            academy.db.rows(
                'UPDATE sessions SET created_at = ?, expires_at = ? RETURNING public_id',
                now - 10_000, now - 1,
            );

            const attempts = await Promise.all([
                dispatch(academy.env, jsonRequest('/academy/api/auth/google/reader', {}, { cookie: oldCookie })),
                dispatch(academy.env, jsonRequest('/academy/api/auth/google/reader', {}, { cookie: oldCookie })),
            ]);
            const statuses = attempts.map(response => response.status).sort((left, right) => left - right);
            expect(statuses[0]).toBe(200);
            expect([401, 409]).toContain(statuses[1]);

            const staleRetry = await dispatch(academy.env, jsonRequest(
                '/academy/api/auth/google/reader', {}, { cookie: oldCookie },
            ));
            expect(staleRetry.status).toBe(409);
            expect(academy.db.rows<{ count: number }>(
                'SELECT COUNT(*) AS count FROM sessions',
            )).toEqual([{ count: 1 }]);
            expect(academy.db.rows<{ invite_id: string }>(
                'SELECT invite_id FROM sessions',
            )).toEqual([{ invite_id: originalInviteId }]);
            expect(academy.db.rows<{ count: number }>(
                'SELECT COUNT(*) AS count FROM invites WHERE id = ?',
                READER_ACCOUNT_INVITE_ID,
            )).toEqual([{ count: 0 }]);
        } finally {
            academy.close();
        }
    });

    it('never persists a plaintext invite code anywhere in D1', async () => {
        const academy = createFakeAcademy();
        await seedInvite(academy, 'OPEN2026');
        await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
        const dump = JSON.stringify({ invites: academy.db.invites, sessions: academy.db.sessions });
        expect(dump).not.toContain('OPEN2026');
    });

    it('rejects unknown, exhausted, and malformed codes without side effects', async () => {
        const academy = createFakeAcademy();
        await seedInvite(academy, 'OPEN2026', 1);

        expect((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'WRONG-CODE' }))).status).toBe(403);
        expect((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'a' }))).status).toBe(400);
        expect((await dispatch(academy.env, jsonRequest('/academy/api/session', {}))).status).toBe(400);

        expect((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'open2026 ' }))).status).toBe(200);
        // Single-use invite is now consumed atomically.
        expect((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }))).status).toBe(403);
        expect(academy.db.sessions).toHaveLength(1);
    });

    it('requires an exact same-origin browser mutation', async () => {
        const academy = createFakeAcademy();
        await seedInvite(academy, 'OPEN2026');
        const crossOrigin = jsonRequest('/academy/api/session', { code: 'OPEN2026' }, { origin: 'https://evil.example' });
        expect((await dispatch(academy.env, crossOrigin)).status).toBe(403);

        const noOrigin = new Request('https://yomureader.com/academy/api/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: 'OPEN2026' }),
        });
        expect((await dispatch(academy.env, noOrigin)).status).toBe(403);
        expect(academy.db.invites[0].uses_remaining).toBe(3);
    });

    it('rate-limits repeated attempts per HMACed client subject', async () => {
        const academy = createFakeAcademy();
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 12; attempt += 1) {
            statuses.push((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'WRONG-CODE' }))).status);
        }
        expect(statuses.slice(0, 10)).toEqual(Array(10).fill(403));
        expect(statuses.slice(10)).toEqual([429, 429]);
        // The stored subject is an HMAC digest, never the raw IP.
        for (const key of academy.db.rateCounters.keys()) expect(key).not.toContain('203.0.113.7');

        // A different client subject is unaffected.
        const other = jsonRequest('/academy/api/session', { code: 'WRONG-CODE' }, { 'cf-connecting-ip': '198.51.100.9' });
        expect((await dispatch(academy.env, other)).status).toBe(403);
    });

    it('keeps automatic cookie rotation out of the human invite-exchange rate budget', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy, 'OPEN2026', 3);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const cookie = sessionCookie(created);

            // Exhaust the invite-exchange bucket for this client subject.
            for (let attempt = 0; attempt < 11; attempt += 1) {
                await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'WRONG-CODE' }));
            }
            expect((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }))).status).toBe(429);

            // Rotation still succeeds: it draws from its own resume bucket.
            const resumed = await dispatch(academy.env, jsonRequest('/academy/api/session/resume', {}, { cookie }));
            expect(resumed.status).toBe(200);
            expect(sessionCookie(resumed)).not.toBe(cookie);
        } finally {
            academy.close();
        }
    });

    it('revokes the rotated row when logout carries the captured pre-rotation cookie', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const oldCookie = sessionCookie(created);
            const resumed = await dispatch(academy.env, jsonRequest('/academy/api/session/resume', {}, { cookie: oldCookie }));
            expect(resumed.status).toBe(200);
            const rotatedCookie = sessionCookie(resumed);

            // Resume has committed before the stale tab sends logout.
            expect((await dispatch(academy.env, jsonRequest('/academy/api/logout', {}, { cookie: oldCookie }))).status).toBe(200);
            expect((await dispatch(academy.env, new Request(
                'https://yomureader.com/academy/api/session', { headers: { cookie: rotatedCookie } },
            ))).status).toBe(401);
        } finally {
            academy.close();
        }
    });

    it('rejects cross-origin resume and logout without changing the live family', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const cookie = sessionCookie(created);
            expect((await dispatch(academy.env, jsonRequest(
                '/academy/api/session/resume', {}, { cookie, origin: 'https://evil.example' },
            ))).status).toBe(403);
            expect((await dispatch(academy.env, jsonRequest(
                '/academy/api/logout', {}, { cookie, origin: 'https://evil.example' },
            ))).status).toBe(403);
            expect((await dispatch(academy.env, new Request(
                'https://yomureader.com/academy/api/session', { headers: { cookie } },
            ))).status).toBe(200);
        } finally {
            academy.close();
        }
    });

    it('allows exactly one concurrent resume of the same current token', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const oldCookie = sessionCookie(created);
            const attempts = await Promise.all([
                dispatch(academy.env, jsonRequest('/academy/api/session/resume', {}, { cookie: oldCookie })),
                dispatch(academy.env, jsonRequest('/academy/api/session/resume', {}, { cookie: oldCookie })),
            ]);
            expect(attempts.map(response => response.status).sort()).toEqual([200, 401]);
            expect((await dispatch(academy.env, new Request(
                'https://yomureader.com/academy/api/session', { headers: { cookie: oldCookie } },
            ))).status).toBe(401);
            const winner = attempts.find(response => response.status === 200)!;
            expect((await dispatch(academy.env, new Request(
                'https://yomureader.com/academy/api/session', { headers: { cookie: sessionCookie(winner) } },
            ))).status).toBe(200);
        } finally {
            academy.close();
        }
    });

    it('gives valid session families independent resume budgets behind one NAT', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy, 'SCHOOL2026', 40);
            const cookies: string[] = [];
            for (let learner = 0; learner < 35; learner += 1) {
                const created = await dispatch(academy.env, jsonRequest(
                    '/academy/api/session', { code: 'SCHOOL2026' }, { 'cf-connecting-ip': `198.51.100.${learner + 1}` },
                ));
                cookies.push(sessionCookie(created));
            }

            const statuses: number[] = [];
            for (const cookie of cookies) {
                statuses.push((await dispatch(academy.env, jsonRequest(
                    '/academy/api/session/resume', {}, { cookie, 'cf-connecting-ip': '203.0.113.50' },
                ))).status);
            }
            expect(statuses).toEqual(Array(35).fill(200));
            expect(academy.db.rows<{ count: number }>(
                "SELECT COUNT(*) AS count FROM rate_limits WHERE bucket = 'session-resume'",
            )[0]?.count).toBe(35);
        } finally {
            academy.close();
        }
    });

    it('bounds invalid resume abuse without spending a valid family budget', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
            const cookie = sessionCookie(created);
            const [name, value] = cookie.split('=');
            const family = value.slice(2, 45);
            const invalidCookie = `${name}=v2${family}${'A'.repeat(43)}`;
            const sharedIp = '203.0.113.77';

            for (let attempt = 0; attempt < 15; attempt += 1) {
                expect((await dispatch(academy.env, jsonRequest(
                    '/academy/api/session/resume', {}, { 'cf-connecting-ip': sharedIp },
                ))).status).toBe(401);
                expect((await dispatch(academy.env, jsonRequest(
                    '/academy/api/session/resume', {}, { cookie: invalidCookie, 'cf-connecting-ip': sharedIp },
                ))).status).toBe(401);
            }
            const limited = await dispatch(academy.env, jsonRequest(
                '/academy/api/session/resume', {}, { 'cf-connecting-ip': sharedIp },
            ));
            expect(limited.status).toBe(429);
            expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);

            const resumed = await dispatch(academy.env, jsonRequest(
                '/academy/api/session/resume', {}, { cookie, 'cf-connecting-ip': sharedIp },
            ));
            expect(resumed.status).toBe(200);
            expect(academy.db.rows<{ count: number }>(
                "SELECT count FROM rate_limits WHERE bucket = 'session-resume'",
            )).toEqual([{ count: 1 }]);
        } finally {
            academy.close();
        }
    });

    it('upgrades a legacy cookie while preserving family-wide logout authority', async () => {
        const academy = createSqliteAcademy();
        try {
            await seedSqliteInvite(academy);
            const legacyToken = 'L'.repeat(43);
            const now = Date.now();
            const inviteId = academy.db.rows<{ id: string }>('SELECT id FROM invites')[0]!.id;
            academy.db.rows(
                'INSERT INTO sessions (token_hash, public_id, invite_id, created_at, expires_at, offline_resume_until) '
                + 'VALUES (?, ?, ?, ?, ?, ?) RETURNING public_id',
                await hmacSha256Hex(academy.env.ACADEMY_INVITE_HMAC_KEY, `session:${legacyToken}`),
                crypto.randomUUID(), inviteId, now - 1, now + 60_000, now + 120_000,
            );
            const legacyCookie = `__Host-academy_session=${legacyToken}`;

            const resumed = await dispatch(academy.env, jsonRequest('/academy/api/session/resume', {}, { cookie: legacyCookie }));
            expect(resumed.status).toBe(200);
            const upgradedCookie = sessionCookie(resumed);
            expect((await dispatch(academy.env, jsonRequest('/academy/api/logout', {}, { cookie: legacyCookie }))).status).toBe(200);
            expect((await dispatch(academy.env, new Request(
                'https://yomureader.com/academy/api/session', { headers: { cookie: upgradedCookie } },
            ))).status).toBe(401);
        } finally {
            academy.close();
        }
    });

    it('logs out by revoking the session and clearing the cookie', async () => {
        const academy = createFakeAcademy();
        await seedInvite(academy, 'OPEN2026');
        const created = await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }));
        const cookie = sessionCookie(created);

        const logout = await dispatch(academy.env, jsonRequest('/academy/api/logout', {}, { cookie }));
        expect(logout.status).toBe(200);
        expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');

        const after = await dispatch(academy.env, new Request('https://yomureader.com/academy/api/session', { headers: { cookie } }));
        expect(after.status).toBe(401);
    });
});

describe('Academy Worker admin invites', () => {
    it('seeds a known code via bearer auth without persisting plaintext', async () => {
        const academy = createFakeAcademy();
        const response = await dispatch(academy.env, jsonRequest('/academy/api/admin/invites', {
            code: 'OPEN2026', uses: 25,
        }, {
            authorization: 'Bearer test-admin-token',
        }));
        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.code).toBeUndefined();
        expect(JSON.stringify(academy.db.invites)).not.toContain('OPEN2026');
        expect(academy.db.invites[0].uses_remaining).toBe(25);
        expect(academy.db.invites[0].account_required).toBe(1);

        // The seeded code then redeems normally.
        expect((await dispatch(academy.env, jsonRequest('/academy/api/session', { code: 'OPEN2026' }))).status).toBe(200);
    });

    it('rejects the withdrawn accountRequired field so no invite can be made anonymous', async () => {
        const academy = createFakeAcademy();
        const headers = { authorization: 'Bearer test-admin-token' };
        expect((await dispatch(academy.env, jsonRequest(
            '/academy/api/admin/invites', { code: 'OPEN2026', accountRequired: false }, headers,
        ))).status).toBe(400);
        expect((await dispatch(academy.env, jsonRequest(
            '/academy/api/admin/invites', { code: 'OPEN2026', accountRequired: true }, headers,
        ))).status).toBe(400);
        expect(academy.db.invites).toHaveLength(0);
        expect((await dispatch(academy.env, jsonRequest(
            '/academy/api/admin/invites', { code: 'STAFF2026' }, headers,
        ))).status).toBe(201);
        expect(academy.db.invites[0].account_required).toBe(1);
    });

    it('generates a random code exactly once and rejects duplicates and bad tokens', async () => {
        const academy = createFakeAcademy();
        const generated = await dispatch(academy.env, jsonRequest('/academy/api/admin/invites', {}, { authorization: 'Bearer test-admin-token' }));
        expect(generated.status).toBe(201);
        const { code } = await generated.json();
        expect(code).toMatch(/^[A-Z0-9-]{4,64}$/);
        expect(JSON.stringify(academy.db.invites)).not.toContain(code);

        const duplicate = await dispatch(academy.env, jsonRequest('/academy/api/admin/invites', { code }, { authorization: 'Bearer test-admin-token' }));
        expect(duplicate.status).toBe(409);

        expect((await dispatch(academy.env, jsonRequest('/academy/api/admin/invites', {}, { authorization: 'Bearer nope' }))).status).toBe(401);
        expect((await dispatch(academy.env, jsonRequest('/academy/api/admin/invites', {}))).status).toBe(401);
    });
});
