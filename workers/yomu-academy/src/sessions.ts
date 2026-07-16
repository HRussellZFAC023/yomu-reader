import { hmacSha256Hex, randomToken } from './crypto';
import type { Clock, Env } from './env';
import { clearHostCookie, hostCookie, HttpError, jsonResponse, readCookie, readJsonBody, requireSameOriginMutation } from './http';
import { inviteCodeHash, normalizeInviteCode } from './invites';
import { clientSubject, enforceRateLimit, OAUTH_RATE, SESSION_RATE } from './rate-limit';

const SESSION_COOKIE = '__Host-academy_session';
const SESSION_TTL_MS = 8 * 60 * 60_000;
const OFFLINE_RESUME_MS = 30 * 24 * 60 * 60_000;
export const ACCOUNT_RECOVERY_INVITE_ID = 'system_google_recovery_v1';
const RECOVERY_INVITE_PREIMAGE = '\u0000GOOGLE-ACCOUNT-RECOVERY\u0000';

export interface ActiveSession {
    readonly public_id: string;
    readonly invite_id: string;
    readonly account_id: string | null;
    readonly expires_at: number;
    readonly offline_resume_until: number;
}

/** Exact client contract (`src/academy/access/gateway.ts`): epoch milliseconds. */
function sessionContract(row: Pick<ActiveSession, 'public_id' | 'expires_at' | 'offline_resume_until'>): { sessionId: string; expiresAt: number; offlineResumeUntil: number } {
    return { sessionId: row.public_id, expiresAt: row.expires_at, offlineResumeUntil: row.offline_resume_until };
}

async function tokenHash(env: Env, token: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `session:${token}`);
}

/**
 * POST /academy/api/session — exchange an invite code for a session.
 * Same-origin only and rate-limited per HMACed client subject. Seed uses are
 * consumed atomically; paid codes issue retryable auth sessions and are bound
 * only after OIDC. The cookie carries an opaque random token whose HMAC is the
 * stored lookup key; the returned sessionId is a separate public identifier.
 */
export async function handleCreateSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), SESSION_RATE, now);

    const body = await readJsonBody(request);
    const code = normalizeInviteCode(body.code);
    const token = randomToken(32);
    const row = {
        public_id: crypto.randomUUID(),
        expires_at: now + SESSION_TTL_MS,
        offline_resume_until: now + OFFLINE_RESUME_MS,
    };
    const codeHash = await inviteCodeHash(env, code);
    const [inserted] = await env.ACADEMY_DB.batch<{ public_id: string }>([
        env.ACADEMY_DB.prepare(
            'INSERT INTO sessions (token_hash, public_id, invite_id, created_at, expires_at, offline_resume_until) '
            + 'SELECT ?1, ?2, id, ?3, ?4, ?5 FROM invites '
            + 'WHERE code_hash = ?6 AND revoked_at IS NULL '
            + "AND ((kind = 'seed' AND uses_remaining > 0) OR (kind = 'paid' AND EXISTS "
            + "(SELECT 1 FROM purchases p WHERE p.id = invites.purchase_id AND p.status = 'paid'))) "
            + 'AND (expires_at IS NULL OR expires_at > ?3) RETURNING public_id',
        ).bind(await tokenHash(env, token), row.public_id, now, row.expires_at, row.offline_resume_until, codeHash),
        env.ACADEMY_DB.prepare(
            'UPDATE invites SET uses_remaining = uses_remaining - 1 '
            + "WHERE code_hash = ?1 AND kind = 'seed' AND uses_remaining > 0 AND revoked_at IS NULL "
            + 'AND (expires_at IS NULL OR expires_at > ?2)',
        ).bind(codeHash, now),
    ]);
    if ((inserted?.meta.changes ?? 0) !== 1 || inserted.results.length !== 1) {
        throw new HttpError(403, 'Invitation was not accepted.');
    }

    return jsonResponse(sessionContract(row), 200, {
        'set-cookie': hostCookie(SESSION_COOKIE, token, OFFLINE_RESUME_MS / 1000),
    });
}

/**
 * POST /academy/api/auth/google/recovery — issue an auth-only session so an
 * existing Google account can recover its profile without an invite code.
 * The internal invite preimage cannot pass normalizeInviteCode, so it is not
 * exchangeable through the public session endpoint.
 */
export async function handleCreateRecoverySession(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), OAUTH_RATE, now);
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 0) throw new HttpError(400, 'Recovery request must be empty.');

    const token = randomToken(32);
    const row = {
        public_id: crypto.randomUUID(),
        expires_at: now + SESSION_TTL_MS,
        offline_resume_until: now + OFFLINE_RESUME_MS,
    };
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id) '
        + "VALUES (?1, ?2, 100000, 'seed', ?3, NULL, NULL) ON CONFLICT(id) DO NOTHING",
    ).bind(ACCOUNT_RECOVERY_INVITE_ID, await inviteCodeHash(env, RECOVERY_INVITE_PREIMAGE), now).run();
    const inserted = await env.ACADEMY_DB.prepare(
        'INSERT INTO sessions (token_hash, public_id, invite_id, created_at, expires_at, offline_resume_until) '
        + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING public_id',
    ).bind(
        await tokenHash(env, token), row.public_id, ACCOUNT_RECOVERY_INVITE_ID, now, row.expires_at, row.offline_resume_until,
    ).run();
    if ((inserted.meta.changes ?? 0) !== 1) throw new HttpError(500, 'Account recovery could not be started.');
    return jsonResponse(sessionContract(row), 201, {
        'set-cookie': hostCookie(SESSION_COOKIE, token, OFFLINE_RESUME_MS / 1000),
    });
}

/** GET /academy/api/session — report the live session bound to the cookie. */
export async function handleGetSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    const row = await activeSession(request, env, clock());
    if (!row) throw new HttpError(401, 'No active session.');
    return jsonResponse(sessionContract(row));
}

/**
 * POST /academy/api/session/resume — rotate an expired or active cookie while
 * its fixed 30-day offline-resume window is still valid. No invite is spent.
 */
export async function handleResumeSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), SESSION_RATE, now);
    const oldToken = readCookie(request, SESSION_COOKIE);
    if (!oldToken) throw new HttpError(401, 'No resumable session.');
    const newToken = randomToken(32);
    const row = await env.ACADEMY_DB.prepare(
        'UPDATE sessions SET token_hash = ?1, expires_at = MIN(?2, offline_resume_until) '
        + 'WHERE token_hash = ?3 AND revoked_at IS NULL AND offline_resume_until > ?4 '
        + 'RETURNING public_id, expires_at, offline_resume_until',
    ).bind(
        await tokenHash(env, newToken),
        now + SESSION_TTL_MS,
        await tokenHash(env, oldToken),
        now,
    ).first<Pick<ActiveSession, 'public_id' | 'expires_at' | 'offline_resume_until'>>();
    if (!row) throw new HttpError(401, 'No resumable session.');
    return jsonResponse(sessionContract(row), 200, {
        'set-cookie': hostCookie(SESSION_COOKIE, newToken, (row.offline_resume_until - now) / 1000),
    });
}

/** POST /academy/api/logout — revoke the session and clear the cookie. */
export async function handleLogout(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const token = readCookie(request, SESSION_COOKIE);
    if (token) {
        await env.ACADEMY_DB
            .prepare('UPDATE sessions SET revoked_at = ?1 WHERE token_hash = ?2 AND revoked_at IS NULL')
            .bind(clock(), await tokenHash(env, token))
            .run();
    }
    return jsonResponse({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

export function clearSessionCookie(): string {
    return clearHostCookie(SESSION_COOKIE);
}

/** Shared auth gate for media routes; returns null instead of throwing. */
export async function activeSession(request: Request, env: Env, now: number): Promise<ActiveSession | null> {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return null;
    return env.ACADEMY_DB
        .prepare(
            'SELECT public_id, invite_id, account_id, expires_at, offline_resume_until FROM sessions '
            + 'WHERE token_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2',
        )
        .bind(await tokenHash(env, token), now)
        .first<ActiveSession>();
}
