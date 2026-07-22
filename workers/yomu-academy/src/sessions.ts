import { hmacSha256Hex, randomToken } from './crypto';
import type { Clock, Env } from './env';
import { clearHostCookie, hostCookie, HttpError, jsonResponse, readCookie, readJsonBody, requireSameOriginMutation } from './http';
import { inviteCodeHash, normalizeInviteCode } from './invites';
import {
    clientSubject,
    enforceRateLimit,
    OAUTH_RATE,
    RESUME_ABUSE_RATE,
    RESUME_RATE,
    SESSION_RATE,
} from './rate-limit';

const SESSION_COOKIE = '__Host-academy_session';
const SESSION_TTL_MS = 8 * 60 * 60_000;
const OFFLINE_RESUME_MS = 30 * 24 * 60 * 60_000;
const SESSION_COOKIE_VERSION = 'v2';
const COOKIE_PART_PATTERN = '[A-Za-z0-9_-]{43}';
const VERSIONED_SESSION_COOKIE = new RegExp(`^${SESSION_COOKIE_VERSION}(${COOKIE_PART_PATTERN})(${COOKIE_PART_PATTERN})$`);
const LEGACY_SESSION_COOKIE = new RegExp(`^${COOKIE_PART_PATTERN}$`);
export const ACCOUNT_RECOVERY_INVITE_ID = 'system_google_recovery_v1';
export const READER_ACCOUNT_INVITE_ID = 'system_reader_account_v1';
const RECOVERY_INVITE_PREIMAGE = '\u0000GOOGLE-ACCOUNT-RECOVERY\u0000';
const READER_INVITE_PREIMAGE = '\u0000YOMU-READER-ACCOUNT\u0000';

export interface ActiveSession {
    readonly public_id: string;
    readonly invite_id: string;
    readonly account_id: string | null;
    readonly expires_at: number;
    readonly offline_resume_until: number;
}

/**
 * Exact client contract (`src/academy/access/gateway.ts`): epoch milliseconds.
 * Every invite requires an authenticated account, so `accountRequired` is a
 * constant the client still consumes.
 */
function sessionContract(
    row: Pick<ActiveSession, 'public_id' | 'expires_at' | 'offline_resume_until'>,
): { sessionId: string; expiresAt: number; offlineResumeUntil: number; accountRequired: boolean } {
    return {
        sessionId: row.public_id,
        expiresAt: row.expires_at,
        offlineResumeUntil: row.offline_resume_until,
        accountRequired: true,
    };
}

async function tokenHash(env: Env, token: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `session:${token}`);
}

async function familyHash(env: Env, familySecret: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `session-family:${familySecret}`);
}

interface SessionCookieParts {
    readonly familySecret: string;
    readonly token: string;
    readonly legacy: boolean;
}

function createSessionCookie(): { readonly value: string; readonly parts: SessionCookieParts } {
    const familySecret = randomToken(32);
    const token = randomToken(32);
    return {
        value: `${SESSION_COOKIE_VERSION}${familySecret}${token}`,
        parts: { familySecret, token, legacy: false },
    };
}

function parseSessionCookie(value: string | null): SessionCookieParts | null {
    if (!value) return null;
    const versioned = VERSIONED_SESSION_COOKIE.exec(value);
    if (versioned) return { familySecret: versioned[1], token: versioned[2], legacy: false };
    if (LEGACY_SESSION_COOKIE.test(value)) {
        // The former rotating token becomes the stable family secret during its
        // first resume. A captured legacy cookie can therefore still revoke the
        // upgraded row, while it can no longer authenticate or rotate it.
        return { familySecret: value, token: value, legacy: true };
    }
    return null;
}

async function storedTokenHash(env: Env, parts: SessionCookieParts): Promise<string> {
    const digest = await tokenHash(env, parts.token);
    if (parts.legacy) return digest;
    return `${await familyHash(env, parts.familySecret)}.${digest}`;
}

async function familyRateSubject(env: Env, familySecret: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_RATE_HMAC_KEY, `session-family:${familySecret}`);
}

async function rejectInvalidResume(request: Request, env: Env, now: number): Promise<never> {
    await enforceRateLimit(env, await clientSubject(request, env), RESUME_ABUSE_RATE, now);
    throw new HttpError(401, 'No resumable session.');
}

/**
 * POST /academy/api/session — exchange an invite code for a session.
 * Same-origin only and rate-limited per HMACed client subject. Seed uses are
 * consumed atomically; unredeemed paid codes issue retryable auth sessions and
 * are bound only after OIDC. The cookie carries an opaque random token whose
 * HMAC is the stored lookup key; the returned sessionId is a separate public
 * identifier.
 */
export async function handleCreateSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), SESSION_RATE, now);

    const body = await readJsonBody(request);
    const code = normalizeInviteCode(body.code);
    const credential = createSessionCookie();
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
            + "(SELECT 1 FROM purchases p WHERE p.id = invites.purchase_id AND p.status = 'paid' "
            + 'AND p.redeemed_at IS NULL AND NOT EXISTS (SELECT 1 FROM payment_entitlements pe '
            + "WHERE pe.purchase_id = p.id AND (pe.state <> 'active' "
            + 'OR (pe.expires_at IS NOT NULL AND pe.expires_at <= ?3)))))) '
            + 'AND (expires_at IS NULL OR expires_at > ?3) RETURNING public_id',
        ).bind(await storedTokenHash(env, credential.parts), row.public_id, now, row.expires_at, row.offline_resume_until, codeHash),
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
        'set-cookie': hostCookie(SESSION_COOKIE, credential.value, OFFLINE_RESUME_MS / 1000),
    });
}

/**
 * POST /academy/api/auth/google/recovery — issue an auth-only session so an
 * existing Google account can recover its profile without an invite code.
 * The internal invite preimage cannot pass normalizeInviteCode, so it is not
 * exchangeable through the public session endpoint.
 */
export async function handleCreateRecoverySession(request: Request, env: Env, clock: Clock): Promise<Response> {
    return handleCreateSystemAccountSession(request, env, clock, {
        inviteId: ACCOUNT_RECOVERY_INVITE_ID,
        invitePreimage: RECOVERY_INVITE_PREIMAGE,
        failureMessage: 'Account recovery could not be started.',
    });
}

/**
 * POST /academy/api/auth/google/reader — issue a free Reader account session.
 * It may create or recover a Google-bound identity and its encrypted-sync
 * profile, but it is deliberately not an Academy curriculum entitlement.
 */
export async function handleCreateReaderAccountSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    return handleCreateSystemAccountSession(request, env, clock, {
        inviteId: READER_ACCOUNT_INVITE_ID,
        invitePreimage: READER_INVITE_PREIMAGE,
        failureMessage: 'Reader account sign-in could not be started.',
    });
}

interface SystemAccountSessionOptions {
    readonly inviteId: string;
    readonly invitePreimage: string;
    readonly failureMessage: string;
}

async function handleCreateSystemAccountSession(
    request: Request,
    env: Env,
    clock: Clock,
    options: SystemAccountSessionOptions,
): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), OAUTH_RATE, now);
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 0) throw new HttpError(400, 'Recovery request must be empty.');

    const credential = createSessionCookie();
    const row = {
        public_id: crypto.randomUUID(),
        expires_at: now + SESSION_TTL_MS,
        offline_resume_until: now + OFFLINE_RESUME_MS,
    };
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES (?1, ?2, 100000, 'seed', ?3, NULL, NULL, 1) ON CONFLICT(id) DO NOTHING",
    ).bind(options.inviteId, await inviteCodeHash(env, options.invitePreimage), now).run();
    const inserted = await env.ACADEMY_DB.prepare(
        'INSERT INTO sessions (token_hash, public_id, invite_id, created_at, expires_at, offline_resume_until) '
        + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING public_id',
    ).bind(
        await storedTokenHash(env, credential.parts), row.public_id, options.inviteId, now, row.expires_at, row.offline_resume_until,
    ).run();
    if ((inserted.meta.changes ?? 0) !== 1) throw new HttpError(500, options.failureMessage);
    return jsonResponse(sessionContract(row), 201, {
        'set-cookie': hostCookie(SESSION_COOKIE, credential.value, OFFLINE_RESUME_MS / 1000),
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
    const current = parseSessionCookie(readCookie(request, SESSION_COOKIE));
    if (!current) return rejectInvalidResume(request, env, now);
    const currentHash = await storedTokenHash(env, current);
    const resumable = await env.ACADEMY_DB.prepare(
        'SELECT public_id, expires_at, offline_resume_until FROM sessions '
        + 'WHERE token_hash = ?1 AND revoked_at IS NULL AND offline_resume_until > ?2',
    ).bind(currentHash, now).first<Pick<ActiveSession, 'public_id' | 'expires_at' | 'offline_resume_until'>>();
    if (!resumable) return rejectInvalidResume(request, env, now);

    await enforceRateLimit(env, await familyRateSubject(env, current.familySecret), RESUME_RATE, now);
    const nextToken = randomToken(32);
    const next: SessionCookieParts = { familySecret: current.familySecret, token: nextToken, legacy: false };
    const row = await env.ACADEMY_DB.prepare(
        'UPDATE sessions SET token_hash = ?1, expires_at = MIN(?2, offline_resume_until) '
        + 'WHERE token_hash = ?3 AND revoked_at IS NULL AND offline_resume_until > ?4 '
        + 'RETURNING public_id, expires_at, offline_resume_until',
    ).bind(
        await storedTokenHash(env, next),
        now + SESSION_TTL_MS,
        currentHash,
        now,
    ).first<Pick<ActiveSession, 'public_id' | 'expires_at' | 'offline_resume_until'>>();
    if (!row) throw new HttpError(401, 'No resumable session.');
    return jsonResponse(sessionContract(row), 200, {
        'set-cookie': hostCookie(
            SESSION_COOKIE,
            `${SESSION_COOKIE_VERSION}${current.familySecret}${nextToken}`,
            (row.offline_resume_until - now) / 1000,
        ),
    });
}

/** POST /academy/api/logout — revoke the session and clear the cookie. */
export async function handleLogout(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const credential = parseSessionCookie(readCookie(request, SESSION_COOKIE));
    if (credential) {
        const exactHash = await storedTokenHash(env, credential);
        const stableFamilyHash = await familyHash(env, credential.familySecret);
        await env.ACADEMY_DB
            .prepare(
                'UPDATE sessions SET revoked_at = ?1 WHERE revoked_at IS NULL AND '
                + "(token_hash = ?2 OR (length(token_hash) = 129 AND substr(token_hash, 65, 1) = '.' "
                + 'AND substr(token_hash, 1, 64) = ?3))',
            )
            .bind(clock(), exactHash, stableFamilyHash)
            .run();
    }
    return jsonResponse({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

export function clearSessionCookie(): string {
    return clearHostCookie(SESSION_COOKIE);
}

/** Shared auth gate for media routes; returns null instead of throwing. */
export async function activeSession(request: Request, env: Env, now: number): Promise<ActiveSession | null> {
    const credential = parseSessionCookie(readCookie(request, SESSION_COOKIE));
    if (!credential) return null;
    return env.ACADEMY_DB
        .prepare(
            'SELECT s.public_id, s.invite_id, s.account_id, '
            + 's.expires_at, s.offline_resume_until FROM sessions s '
            + 'WHERE s.token_hash = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?2',
        )
        .bind(await storedTokenHash(env, credential), now)
        .first<ActiveSession>();
}
