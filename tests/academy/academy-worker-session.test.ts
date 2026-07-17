// @vitest-environment node
import worker from '../../workers/yomu-academy/src/index';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import type { Env } from '../../workers/yomu-academy/src/env';
import { createFakeAcademy, jsonRequest, type FakeAcademy } from './helpers/fake-academy-env';

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
    expect(header).toMatch(/^__Host-academy_session=[A-Za-z0-9_-]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
    return header.split(';')[0];
}

describe('Academy Worker sessions', () => {
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
        expect(JSON.stringify(academy.db.sessions)).not.toContain(token);
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
