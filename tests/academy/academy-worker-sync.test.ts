// @vitest-environment node
import worker from '../../workers/yomu-academy/src/index';
import { linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import { toBase64Url } from '../../workers/yomu-academy/src/crypto';
import type { Env } from '../../workers/yomu-academy/src/env';
import { ensureSessionProfile } from '../../workers/yomu-academy/src/profiles';
import { activeSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy, type SqliteAcademy } from './helpers/sqlite-academy-env';

const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };

function request(
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body: unknown,
    cookie?: string,
    ip = '203.0.113.20',
    extraHeaders: Record<string, string> = {},
): Request {
    return new Request(`https://yomureader.com${path}`, {
        method,
        headers: {
            'content-type': 'application/json',
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'cf-connecting-ip': ip,
            ...(cookie ? { cookie } : {}),
            ...extraHeaders,
        },
        body: JSON.stringify(body),
    });
}

function get(path: string, cookie: string, ip = '203.0.113.20'): Request {
    return new Request(`https://yomureader.com${path}`, {
        headers: { cookie, 'cf-connecting-ip': ip },
    });
}

async function dispatch(env: Env, input: Request): Promise<Response> {
    pending.length = 0;
    const response = await worker.fetch(input, env, ctx);
    await Promise.all(pending.splice(0));
    return response;
}

function cookie(response: Response): string {
    const header = response.headers.get('set-cookie') ?? '';
    const value = /^(__Host-academy_session=[A-Za-z0-9_-]+)/u.exec(header)?.[1];
    if (!value) throw new Error(`Session cookie missing: ${header}`);
    return value;
}

async function enrolled(academy: SqliteAcademy, count = 1): Promise<string[]> {
    const seeded = await dispatch(academy.env, request('/academy/api/admin/invites', 'POST', {
        code: 'OPEN2026',
        uses: 50,
    }, undefined, '203.0.113.20', { authorization: 'Bearer sqlite-test-admin-token' }));
    expect(seeded.status).toBe(201);
    const cookies: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const response = await dispatch(academy.env, request(
            '/academy/api/session',
            'POST',
            { code: 'OPEN2026' },
            undefined,
            `203.0.113.${30 + index}`,
        ));
        expect(response.status).toBe(200);
        cookies.push(cookie(response));
    }
    return cookies;
}

/** Every invite is account-gated, so device cookies sign in before use. */
async function signedIn(academy: SqliteAcademy, subjects: string[]): Promise<string[]> {
    const cookies = await enrolled(academy, subjects.length);
    for (const [index, subject] of subjects.entries()) {
        const session = await activeSession(get('/academy/api/session', cookies[index]), academy.env, Date.now());
        if (!session) throw new Error(`fixture session ${index} missing`);
        await linkGoogleSubject(academy.env, session, subject, Date.now());
    }
    return cookies;
}

function bytes(length: number, value: number): string {
    return toBase64Url(new Uint8Array(length).fill(value));
}

function envelope() {
    return {
        keyVersion: 1,
        salt: bytes(16, 1),
        nonce: bytes(12, 2),
        ciphertext: bytes(48, 3),
    };
}

function event(id: string, value: number, occurredAt = Date.now()) {
    return {
        id,
        occurredAt,
        keyVersion: 1,
        nonce: bytes(12, value),
        ciphertext: bytes(32, value),
    };
}

describe('Academy profile pairing and event-log sync', () => {
    let academy: SqliteAcademy;

    beforeEach(() => {
        academy = createSqliteAcademy();
    });

    afterEach(() => {
        academy.close();
    });

    it('atomically pins one profile key commitment and rejects a competing first key', async () => {
        const [sessionCookie] = await signedIn(academy, ['key-commit-subject']);
        expect((await dispatch(academy.env, get('/academy/api/profile', sessionCookie))).status).toBe(200);
        const firstCommitment = bytes(32, 7);
        const secondCommitment = bytes(32, 8);

        const results = await Promise.all([
            dispatch(academy.env, request('/academy/api/profile/key', 'POST', { keyCommitment: firstCommitment }, sessionCookie)),
            dispatch(academy.env, request('/academy/api/profile/key', 'POST', { keyCommitment: secondCommitment }, sessionCookie)),
        ]);
        expect(results.map(response => response.status).sort()).toEqual([200, 409]);
        const winner = results[0].status === 200 ? firstCommitment : secondCommitment;
        expect((await dispatch(academy.env, request(
            '/academy/api/profile/key', 'POST', { keyCommitment: winner }, sessionCookie,
        ))).status).toBe(200);
        expect(academy.db.rows<{ sync_key_commitment: string }>('SELECT sync_key_commitment FROM profiles')[0]?.sync_key_commitment)
            .toBe(winner);
    });

    it('pairs two signed-in devices of one account with a one-time HMACed code and encrypted key envelope', async () => {
        const [sourceCookie, targetCookie] = await signedIn(academy, ['pairing-subject', 'pairing-subject']);
        const sourceProfile = await (await dispatch(academy.env, get('/academy/api/profile', sourceCookie))).json() as { profileId: string };
        const targetProfile = await (await dispatch(academy.env, get('/academy/api/profile', targetCookie))).json() as { profileId: string };
        // The second sign-in moved the empty device onto the account profile.
        expect(sourceProfile.profileId).toBe(targetProfile.profileId);

        const created = await dispatch(academy.env, request('/academy/api/pairings', 'POST', {}, sourceCookie));
        expect(created.status).toBe(201);
        const ticket = await created.json() as { pairingId: string; code: string };
        expect(ticket.code).toMatch(/^[023456789A-HJ-KM-NP-Z]{4}(?:-[023456789A-HJ-KM-NP-Z]{4}){4}$/u);

        const completed = await dispatch(academy.env, request(
            `/academy/api/pairings/${ticket.pairingId}`,
            'PUT',
            envelope(),
            sourceCookie,
        ));
        expect(completed.status).toBe(200);

        const claimed = await dispatch(academy.env, request(
            '/academy/api/pairings/claim',
            'POST',
            { code: ticket.code.toLowerCase() },
            targetCookie,
            '198.51.100.44',
        ));
        expect(claimed.status).toBe(200);
        expect(await claimed.json()).toMatchObject({
            pairingId: ticket.pairingId,
            profileId: sourceProfile.profileId,
            keyEnvelope: envelope(),
        });
        expect(await (await dispatch(academy.env, get('/academy/api/profile', targetCookie))).json()).toMatchObject({
            profileId: sourceProfile.profileId,
        });
        expect((await dispatch(academy.env, request(
            '/academy/api/pairings/claim', 'POST', { code: ticket.code }, targetCookie, '198.51.100.45',
        ))).status).toBe(404);

        const stored = JSON.stringify(academy.db.rows<Record<string, unknown>>('SELECT * FROM device_pairings'));
        expect(stored).not.toContain(ticket.code);
        expect(stored).not.toContain(ticket.code.replaceAll('-', ''));
    });

    it('unions offline events, makes retries idempotent, and never overwrites a conflicting id', async () => {
        const [sourceCookie, targetCookie] = await signedIn(academy, ['union-subject', 'union-subject']);
        await dispatch(academy.env, get('/academy/api/profile', sourceCookie));
        await dispatch(academy.env, get('/academy/api/profile', targetCookie));
        const created = await dispatch(academy.env, request('/academy/api/pairings', 'POST', {}, sourceCookie));
        const ticket = await created.json() as { pairingId: string; code: string };
        await dispatch(academy.env, request(`/academy/api/pairings/${ticket.pairingId}`, 'PUT', envelope(), sourceCookie));
        await dispatch(academy.env, request('/academy/api/pairings/claim', 'POST', { code: ticket.code }, targetCookie, '198.51.100.50'));

        const first = event('11111111-1111-4111-8111-111111111111', 4);
        const second = event('22222222-2222-4222-8222-222222222222', 5, first.occurredAt - 60_000);
        expect(await (await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [first] }, sourceCookie))).json())
            .toEqual({ accepted: 1, inserted: 1, duplicates: 0, conflicts: [] });
        expect(await (await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [first] }, sourceCookie))).json())
            .toEqual({ accepted: 1, inserted: 0, duplicates: 1, conflicts: [] });
        expect((await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [second] }, targetCookie))).status).toBe(200);

        const conflicting = { ...first, ciphertext: bytes(32, 9) };
        const conflict = await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [conflicting] }, targetCookie));
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toEqual({ accepted: 0, inserted: 0, duplicates: 0, conflicts: [first.id] });

        const pageOne = await (await dispatch(academy.env, get('/academy/api/srs/pull?cursor=0&limit=1', targetCookie))).json() as {
            events: Array<{ id: string; ciphertext: string }>;
            nextCursor: number;
            hasMore: boolean;
        };
        expect(pageOne.events).toEqual([expect.objectContaining({ id: first.id, ciphertext: first.ciphertext })]);
        expect(pageOne.hasMore).toBe(true);
        const pageTwo = await (await dispatch(academy.env, get(`/academy/api/srs/pull?cursor=${pageOne.nextCursor}`, sourceCookie))).json() as {
            events: Array<{ id: string }>;
            hasMore: boolean;
        };
        expect(pageTwo.events.map(item => item.id)).toEqual([second.id]);
        expect(pageTwo.hasMore).toBe(false);
    });

    it('exports and deletes profile data without accepting plaintext provider credentials', async () => {
        const [anonymousCookie] = await signedIn(academy, ['export-delete-subject']);
        await dispatch(academy.env, get('/academy/api/profile', anonymousCookie));
        const privateEvent = event('33333333-3333-4333-8333-333333333333', 6);
        const rejected = await dispatch(academy.env, request('/academy/api/srs/push', 'POST', {
            events: [{ ...privateEvent, providerToken: 'plaintext-secret' }],
        }, anonymousCookie));
        expect(rejected.status).toBe(400);
        expect(JSON.stringify(academy.db.rows<Record<string, unknown>>('SELECT * FROM srs_events'))).not.toContain('plaintext-secret');

        await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [privateEvent] }, anonymousCookie));
        const exported = await dispatch(academy.env, get('/academy/api/profile/export?limit=20', anonymousCookie));
        expect(exported.status).toBe(200);
        const exportText = await exported.text();
        expect(exportText).toContain(privateEvent.ciphertext);
        expect(exportText).not.toContain('google_sub_hash');
        expect(exportText).not.toContain('code_hash');

        const deleted = await dispatch(academy.env, request(
            '/academy/api/profile', 'DELETE', { confirmation: 'delete-profile' }, anonymousCookie,
        ));
        expect(deleted.status).toBe(200);
        expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0');
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM srs_events')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM sessions')).toHaveLength(0);
        expect((await dispatch(academy.env, get('/academy/api/session', anonymousCookie))).status).toBe(401);
    });

    it('exports and fully deletes an optional account, and resumes the anonymous device session in place', async () => {
        const [accountCookie] = await enrolled(academy);
        const sessionRequest = get('/academy/api/session', accountCookie);
        const session = await activeSession(sessionRequest, academy.env, Date.now());
        if (!session) throw new Error('active session missing');
        await linkGoogleSubject(academy.env, session, 'durable-google-subject', Date.now());
        const initialProfile = await (await dispatch(academy.env, get('/academy/api/profile', accountCookie))).json() as { profileId: string };
        const accountEvent = event('44444444-4444-4444-8444-444444444444', 7);
        await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [accountEvent] }, accountCookie));

        const accountExport = await dispatch(academy.env, get('/academy/api/account/export', accountCookie));
        expect(accountExport.status).toBe(200);
        expect(await accountExport.json()).toMatchObject({
            account: { displayName: 'Learner' },
            profile: { profileId: initialProfile.profileId },
            eventPage: { events: [expect.objectContaining({ id: accountEvent.id })] },
        });

        academy.db.database.prepare(
            'INSERT INTO oauth_flows (state_hash, session_public_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)',
        ).run('pending-delete-flow', session.public_id, Date.now(), Date.now() + 60_000);

        academy.db.database.prepare('UPDATE sessions SET expires_at = ?1').run(Date.now() - 1);
        const resumed = await dispatch(academy.env, request('/academy/api/session/resume', 'POST', {}, accountCookie));
        expect(resumed.status).toBe(200);
        expect(await resumed.clone().json()).toMatchObject({ accountRequired: true });
        const resumedCookie = cookie(resumed);
        expect(resumedCookie).not.toBe(accountCookie);
        expect(await (await dispatch(academy.env, get('/academy/api/profile', resumedCookie))).json()).toMatchObject({
            profileId: initialProfile.profileId,
        });

        const deleted = await dispatch(academy.env, request(
            '/academy/api/account', 'DELETE', { confirmation: 'delete-account' }, resumedCookie,
        ));
        expect(deleted.status).toBe(200);
        expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM srs_events')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM sessions')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM oauth_flows')).toHaveLength(0);
        expect((await dispatch(academy.env, get('/academy/api/session', resumedCookie))).status).toBe(401);
    });

    it('deletes account-profile learning data while retaining the optional identity', async () => {
        const [accountCookie] = await enrolled(academy);
        const session = await activeSession(get('/academy/api/session', accountCookie), academy.env, Date.now());
        if (!session) throw new Error('account session missing');
        await linkGoogleSubject(academy.env, session, 'retained-account-subject', Date.now());
        await dispatch(academy.env, get('/academy/api/profile', accountCookie));
        const [account] = academy.db.rows<{ id: string }>('SELECT id FROM accounts');
        if (!account) throw new Error('account missing');
        academy.db.database.prepare(
            'INSERT INTO progress_snapshots '
            + '(account_id, known_word_count, reviews_completed, reviews_due, lessons_completed, lessons_total, updated_at) '
            + 'VALUES (?1, 10, 20, 3, 4, 5, ?2)',
        ).run(account.id, Date.now());
        academy.db.database.prepare('INSERT INTO study_days (account_id, study_date) VALUES (?1, ?2)')
            .run(account.id, '2026-07-14');

        const deleted = await dispatch(academy.env, request(
            '/academy/api/profile', 'DELETE', { confirmation: 'delete-profile' }, accountCookie,
        ));
        expect(deleted.status).toBe(200);
        expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(1);
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM sessions')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM progress_snapshots')).toHaveLength(0);
        expect(academy.db.rows('SELECT * FROM study_days')).toHaveLength(0);

        const recovery = await dispatch(academy.env, request(
            '/academy/api/auth/google/recovery', 'POST', {}, undefined, '203.0.113.99',
        ));
        const recoveryCookie = cookie(recovery);
        const recoverySession = await activeSession(
            get('/academy/api/session', recoveryCookie, '203.0.113.99'), academy.env, Date.now(),
        );
        if (!recoverySession) throw new Error('recovery session missing');
        await linkGoogleSubject(academy.env, recoverySession, 'retained-account-subject', Date.now());
        expect((await dispatch(academy.env, get(
            '/academy/api/profile', recoveryCookie, '203.0.113.99',
        ))).status).toBe(200);
    });

    it('moves an empty account-login profile, then pairs the existing key before syncing local events', async () => {
        const [firstCookie, secondCookie] = await enrolled(academy, 2);
        const firstSession = await activeSession(get('/academy/api/session', firstCookie), academy.env, Date.now());
        if (!firstSession) throw new Error('first session missing');
        await linkGoogleSubject(academy.env, firstSession, 'same-durable-subject', Date.now());
        const firstProfile = await (await dispatch(academy.env, get('/academy/api/profile', firstCookie))).json() as { profileId: string };

        const firstEvent = event('55555555-5555-4555-8555-555555555555', 8);
        const secondEvent = event('66666666-6666-4666-8666-666666666666', 9);
        await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [firstEvent] }, firstCookie));

        const secondSession = await activeSession(get('/academy/api/session', secondCookie), academy.env, Date.now());
        if (!secondSession) throw new Error('second session missing');
        await linkGoogleSubject(academy.env, secondSession, 'same-durable-subject', Date.now());

        expect(await (await dispatch(academy.env, get('/academy/api/profile', secondCookie))).json()).toMatchObject({
            profileId: firstProfile.profileId,
        });
        const created = await dispatch(academy.env, request('/academy/api/pairings', 'POST', {}, firstCookie));
        const ticket = await created.json() as { pairingId: string; code: string };
        await dispatch(academy.env, request(`/academy/api/pairings/${ticket.pairingId}`, 'PUT', envelope(), firstCookie));
        expect((await dispatch(academy.env, request(
            '/academy/api/pairings/claim', 'POST', { code: ticket.code }, secondCookie, '198.51.100.70',
        ))).status).toBe(200);
        await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [secondEvent] }, secondCookie));
        const pulled = await (await dispatch(academy.env, get('/academy/api/srs/pull?cursor=0', secondCookie))).json() as {
            events: Array<{ id: string }>;
        };
        expect(pulled.events.map(item => item.id).sort()).toEqual([firstEvent.id, secondEvent.id].sort());
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(1);
        expect(academy.db.rows('SELECT * FROM srs_events')).toHaveLength(2);
    });

    it('converges concurrent first-time account links on one profile', async () => {
        const [firstCookie, secondCookie] = await enrolled(academy, 2);
        const firstSession = await activeSession(get('/academy/api/session', firstCookie), academy.env, Date.now());
        const secondSession = await activeSession(get('/academy/api/session', secondCookie), academy.env, Date.now());
        if (!firstSession || !secondSession) throw new Error('sessions missing');

        const accounts = await Promise.all([
            linkGoogleSubject(academy.env, firstSession, 'concurrent-durable-subject', Date.now()),
            linkGoogleSubject(academy.env, secondSession, 'concurrent-durable-subject', Date.now()),
        ]);
        expect(accounts[0].id).toBe(accounts[1].id);
        const firstProfile = await (await dispatch(academy.env, get('/academy/api/profile', firstCookie))).json() as { profileId: string };
        const secondProfile = await (await dispatch(academy.env, get('/academy/api/profile', secondCookie))).json() as { profileId: string };
        expect(secondProfile.profileId).toBe(firstProfile.profileId);
        expect(academy.db.rows('SELECT * FROM accounts')).toHaveLength(1);
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(1);
        expect(academy.db.rows('SELECT * FROM profile_devices')).toHaveLength(2);
    });

    it('refuses to move a legacy multi-device anonymous profile during account login', async () => {
        // Anonymous profiles can no longer be created or paired over HTTP;
        // model a pre-migration paired profile at the domain level and prove
        // the linking guard and the account gate both still hold.
        const [accountCookie, sourceCookie] = await enrolled(academy, 2);
        const accountSession = await activeSession(get('/academy/api/session', accountCookie), academy.env, Date.now());
        if (!accountSession) throw new Error('account session missing');
        await linkGoogleSubject(academy.env, accountSession, 'paired-profile-subject', Date.now());

        const sourceSession = await activeSession(get('/academy/api/session', sourceCookie), academy.env, Date.now());
        if (!sourceSession) throw new Error('source session missing');
        const legacy = await ensureSessionProfile(academy.env, sourceSession, Date.now());
        academy.db.database.prepare(
            'INSERT INTO profile_devices (id, public_id, profile_id, created_at, last_seen_at, revoked_at) '
            + 'VALUES (?1, ?2, ?3, ?4, ?4, NULL)',
        ).run(crypto.randomUUID(), crypto.randomUUID(), legacy.profile.id, Date.now());

        await expect(linkGoogleSubject(academy.env, sourceSession, 'paired-profile-subject', Date.now()))
            .rejects.toMatchObject({ status: 409 });
        // The legacy anonymous session stays account-gated over HTTP.
        expect((await dispatch(academy.env, get('/academy/api/profile', sourceCookie))).status).toBe(401);
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(2);
    });

    it('refuses to mix independently encrypted profiles during account linking', async () => {
        const [firstCookie, secondCookie] = await enrolled(academy, 2);
        const firstSession = await activeSession(get('/academy/api/session', firstCookie), academy.env, Date.now());
        if (!firstSession) throw new Error('first session missing');
        await linkGoogleSubject(academy.env, firstSession, 'conflict-durable-subject', Date.now());

        const sharedId = '77777777-7777-4777-8777-777777777777';
        await dispatch(academy.env, request('/academy/api/srs/push', 'POST', { events: [event(sharedId, 10)] }, firstCookie));
        // A legacy anonymous profile with its own independently encrypted event.
        const secondSession = await activeSession(get('/academy/api/session', secondCookie), academy.env, Date.now());
        if (!secondSession) throw new Error('second session missing');
        const legacy = await ensureSessionProfile(academy.env, secondSession, Date.now());
        const conflicting = event(sharedId, 11);
        academy.db.database.prepare(
            'INSERT INTO srs_events (profile_id, event_id, occurred_at, key_version, nonce, ciphertext, event_hash, received_at) '
            + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
        ).run(legacy.profile.id, conflicting.id, conflicting.occurredAt, 1, conflicting.nonce, conflicting.ciphertext, 'f'.repeat(64), Date.now());

        await expect(linkGoogleSubject(academy.env, secondSession, 'conflict-durable-subject', Date.now()))
            .rejects.toMatchObject({ status: 409 });
        expect(academy.db.rows('SELECT * FROM profiles')).toHaveLength(2);
        expect(academy.db.rows('SELECT * FROM srs_events')).toHaveLength(2);
    });
});
