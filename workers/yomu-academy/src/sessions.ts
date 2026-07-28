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

export type SessionStatus =
    | { readonly state: 'signed-out' }
    | { readonly state: 'active-unlinked' }
    | { readonly state: 'resumable' }
    | { readonly state: 'linked' };

type UsableSessionRow = Pick<
    ActiveSession,
    'public_id' | 'invite_id' | 'account_id' | 'expires_at' | 'offline_resume_until'
>;

interface UsableSession {
    readonly credential: SessionCookieParts;
    readonly tokenHash: string;
    readonly row: UsableSessionRow;
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
    const now = await authorizeSystemAccountSessionRequest(request, env, clock);
    const issued = await createSystemAccountSession(env, now, {
        inviteId: ACCOUNT_RECOVERY_INVITE_ID,
        invitePreimage: RECOVERY_INVITE_PREIMAGE,
        failureMessage: 'Account recovery could not be started.',
    });
    return jsonResponse(sessionContract(issued.row), 201, { 'set-cookie': issued.cookie });
}

/**
 * POST /academy/api/auth/google/reader — ensure Google sign-in has a session.
 * An existing paid, invite, Reader, or linked recovery session wins. An
 * unlinked recovery session becomes a Reader session so an unknown Google
 * subject is not trapped in recovery. A new Reader session is created only
 * when the request carries no usable credential.
 */
export async function handleCreateReaderAccountSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = await authorizeSystemAccountSessionRequest(request, env, clock);
    let current = await usableSession(request, env, now);
    if (
        current?.row.invite_id === ACCOUNT_RECOVERY_INVITE_ID
        && current.row.account_id === null
    ) {
        current = await convertUnlinkedRecoveryToReader(env, current, now);
    }
    if (current) {
        if (current.row.expires_at > now) {
            return jsonResponse(readerAuthSessionContract(current.row));
        }
        const rotated = await rotateUsableSession(env, current, now);
        return jsonResponse(readerAuthSessionContract(rotated.row), 200, { 'set-cookie': rotated.cookie });
    }
    if (await hasUsableSessionFamily(request, env, now)) {
        // Another tab rotated this family after the request captured its
        // cookie. Never replace that newer paid/invite session with Reader.
        throw new HttpError(409, 'Session changed. Try again.');
    }
    const issued = await createSystemAccountSession(env, now, {
        inviteId: READER_ACCOUNT_INVITE_ID,
        invitePreimage: READER_INVITE_PREIMAGE,
        failureMessage: 'Reader account sign-in could not be started.',
    });
    return jsonResponse(readerAuthSessionContract(issued.row), 201, { 'set-cookie': issued.cookie });
}

interface SystemAccountSessionOptions {
    readonly inviteId: string;
    readonly invitePreimage: string;
    readonly failureMessage: string;
}

async function authorizeSystemAccountSessionRequest(
    request: Request,
    env: Env,
    clock: Clock,
): Promise<number> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), OAUTH_RATE, now);
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 0) throw new HttpError(400, 'Account session request must be empty.');
    return now;
}

async function createSystemAccountSession(
    env: Env,
    now: number,
    options: SystemAccountSessionOptions,
): Promise<{ readonly row: UsableSessionRow; readonly cookie: string }> {
    const credential = createSessionCookie();
    const row: UsableSessionRow = {
        public_id: crypto.randomUUID(),
        invite_id: options.inviteId,
        account_id: null,
        expires_at: now + SESSION_TTL_MS,
        offline_resume_until: now + OFFLINE_RESUME_MS,
    };
    await ensureSystemAccountInvite(env, now, options);
    const inserted = await env.ACADEMY_DB.prepare(
        'INSERT INTO sessions (token_hash, public_id, invite_id, created_at, expires_at, offline_resume_until) '
        + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING public_id',
    ).bind(
        await storedTokenHash(env, credential.parts), row.public_id, options.inviteId, now, row.expires_at, row.offline_resume_until,
    ).run();
    if ((inserted.meta.changes ?? 0) !== 1) throw new HttpError(500, options.failureMessage);
    return {
        row,
        cookie: hostCookie(SESSION_COOKIE, credential.value, OFFLINE_RESUME_MS / 1000),
    };
}

async function ensureSystemAccountInvite(
    env: Env,
    now: number,
    options: SystemAccountSessionOptions,
): Promise<void> {
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES (?1, ?2, 100000, 'seed', ?3, NULL, NULL, 1) ON CONFLICT(id) DO NOTHING",
    ).bind(options.inviteId, await inviteCodeHash(env, options.invitePreimage), now).run();
}

async function convertUnlinkedRecoveryToReader(
    env: Env,
    current: UsableSession,
    now: number,
): Promise<UsableSession> {
    const options: SystemAccountSessionOptions = {
        inviteId: READER_ACCOUNT_INVITE_ID,
        invitePreimage: READER_INVITE_PREIMAGE,
        failureMessage: 'Reader account sign-in could not be started.',
    };
    await ensureSystemAccountInvite(env, now, options);
    const row = await env.ACADEMY_DB.prepare(
        'UPDATE sessions SET invite_id = ?1 WHERE token_hash = ?2 '
        + 'AND invite_id = ?3 AND account_id IS NULL AND revoked_at IS NULL '
        + 'AND offline_resume_until > ?4 '
        + 'RETURNING public_id, invite_id, account_id, expires_at, offline_resume_until',
    ).bind(
        READER_ACCOUNT_INVITE_ID,
        current.tokenHash,
        ACCOUNT_RECOVERY_INVITE_ID,
        now,
    ).first<UsableSessionRow>();
    if (row) return { ...current, row };

    const refreshed = await env.ACADEMY_DB.prepare(
        'SELECT public_id, invite_id, account_id, expires_at, offline_resume_until FROM sessions '
        + 'WHERE token_hash = ?1 AND revoked_at IS NULL AND offline_resume_until > ?2',
    ).bind(current.tokenHash, now).first<UsableSessionRow>();
    if (!refreshed) throw new HttpError(409, 'Session changed. Try again.');
    return { ...current, row: refreshed };
}

function readerAuthSessionContract(
    row: UsableSessionRow,
): ReturnType<typeof sessionContract> & { readonly state: 'active-unlinked' | 'linked' } {
    return {
        ...sessionContract(row),
        state: row.account_id === null ? 'active-unlinked' : 'linked',
    };
}

/** GET /academy/api/session — report the live session bound to the cookie. */
export async function handleGetSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    const row = await activeSession(request, env, clock());
    if (!row) throw new HttpError(401, 'No active session.');
    return jsonResponse(sessionContract(row));
}

/**
 * GET /academy/api/session/status — passive browser-shell probe. Protected
 * account and session reads keep their 401 contract; this route collapses
 * every unusable cookie to the same state and exposes no identifiers.
 */
export async function handleGetSessionStatus(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    const current = await usableSession(request, env, now);
    if (!current) return jsonResponse({ state: 'signed-out' } satisfies SessionStatus);
    if (current.row.expires_at <= now) return jsonResponse({ state: 'resumable' } satisfies SessionStatus);
    return jsonResponse({
        state: current.row.account_id === null ? 'active-unlinked' : 'linked',
    } satisfies SessionStatus);
}

/**
 * POST /academy/api/session/resume — rotate an expired or active cookie while
 * its fixed 30-day offline-resume window is still valid. No invite is spent.
 */
export async function handleResumeSession(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    const current = await usableSession(request, env, now);
    if (!current) return rejectInvalidResume(request, env, now);
    const rotated = await rotateUsableSession(env, current, now);
    return jsonResponse(sessionContract(rotated.row), 200, { 'set-cookie': rotated.cookie });
}

async function usableSession(request: Request, env: Env, now: number): Promise<UsableSession | null> {
    const credential = parseSessionCookie(readCookie(request, SESSION_COOKIE));
    if (!credential) return null;
    const tokenHash = await storedTokenHash(env, credential);
    const row = await env.ACADEMY_DB.prepare(
        'SELECT public_id, invite_id, account_id, expires_at, offline_resume_until FROM sessions '
        + 'WHERE token_hash = ?1 AND revoked_at IS NULL AND offline_resume_until > ?2',
    ).bind(tokenHash, now).first<UsableSessionRow>();
    return row ? { credential, tokenHash, row } : null;
}

async function hasUsableSessionFamily(request: Request, env: Env, now: number): Promise<boolean> {
    const credential = parseSessionCookie(readCookie(request, SESSION_COOKIE));
    if (!credential) return false;
    const row = await env.ACADEMY_DB.prepare(
        'SELECT public_id FROM sessions WHERE revoked_at IS NULL AND offline_resume_until > ?1 '
        + "AND length(token_hash) = 129 AND substr(token_hash, 65, 1) = '.' "
        + 'AND substr(token_hash, 1, 64) = ?2 LIMIT 1',
    ).bind(now, await familyHash(env, credential.familySecret)).first<Pick<ActiveSession, 'public_id'>>();
    return row !== null;
}

async function rotateUsableSession(
    env: Env,
    current: UsableSession,
    now: number,
): Promise<{ readonly row: UsableSessionRow; readonly cookie: string }> {
    await enforceRateLimit(env, await familyRateSubject(env, current.credential.familySecret), RESUME_RATE, now);
    const nextToken = randomToken(32);
    const next: SessionCookieParts = {
        familySecret: current.credential.familySecret,
        token: nextToken,
        legacy: false,
    };
    const row = await env.ACADEMY_DB.prepare(
        'UPDATE sessions SET token_hash = ?1, expires_at = MIN(?2, offline_resume_until) '
        + 'WHERE token_hash = ?3 AND revoked_at IS NULL AND offline_resume_until > ?4 '
        + 'RETURNING public_id, invite_id, account_id, expires_at, offline_resume_until',
    ).bind(
        await storedTokenHash(env, next),
        now + SESSION_TTL_MS,
        current.tokenHash,
        now,
    ).first<UsableSessionRow>();
    if (!row) throw new HttpError(401, 'No resumable session.');
    return {
        row,
        cookie: hostCookie(
            SESSION_COOKIE,
            `${SESSION_COOKIE_VERSION}${current.credential.familySecret}${nextToken}`,
            (row.offline_resume_until - now) / 1000,
        ),
    };
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
