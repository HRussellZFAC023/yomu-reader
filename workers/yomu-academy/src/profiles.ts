import type { Clock, Env } from './env';
import { academyAccessForAccount } from './entitlements';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { activeSession, type ActiveSession } from './sessions';

export interface ProfileRow {
    readonly id: string;
    readonly public_id: string;
    readonly account_id: string | null;
    readonly sync_key_version: number;
    readonly created_at: number;
    readonly updated_at: number;
}

export interface ProfileDeviceRow {
    readonly id: string;
    readonly public_id: string;
    readonly profile_id: string;
    readonly created_at: number;
    readonly last_seen_at: number;
    readonly revoked_at: number | null;
}

export interface ProfileContext {
    readonly session: ActiveSession;
    readonly profile: ProfileRow;
    readonly device: ProfileDeviceRow;
    readonly accountPublicId: string | null;
}

interface ProfileContextRow {
    readonly profile_id: string;
    readonly profile_public_id: string;
    readonly account_id: string | null;
    readonly account_public_id: string | null;
    readonly sync_key_version: number;
    readonly profile_created_at: number;
    readonly profile_updated_at: number;
    readonly device_id: string;
    readonly device_public_id: string;
    readonly device_created_at: number;
    readonly device_last_seen_at: number;
    readonly device_revoked_at: number | null;
}

interface DisposableProfileRow {
    readonly account_id: string | null;
    readonly event_count: number;
    readonly reader_event_count: number;
    readonly device_count: number;
    readonly session_count: number;
}

/** Authorize paid/class Academy resources: Reader-only sessions never pass. */
export async function requireAcademyAccessSession(request: Request, env: Env, now: number): Promise<ActiveSession> {
    const session = await requireSignedInProfileSession(request, env, now);
    if (!(await academyAccessForAccount(env, session.account_id!, now))) {
        throw new HttpError(403, 'Academy access requires an Academy invitation or active entitlement.');
    }
    return session;
}

/** Authorize account-owned encrypted sync without granting Academy content. */
async function requireSignedInProfileSession(request: Request, env: Env, now: number): Promise<ActiveSession> {
    const session = await activeSession(request, env, now);
    if (!session) throw new HttpError(401, 'No active session.');
    if (!session.account_id) throw new HttpError(401, 'Sign in with Google to use an Academy profile.');
    return session;
}

export async function requireProfile(request: Request, env: Env, now: number): Promise<ProfileContext> {
    const session = await requireSignedInProfileSession(request, env, now);
    return ensureSessionProfile(env, session, now);
}

/** Academy learner-event sync remains behind the curriculum entitlement gate. */
export async function requireAcademyProfile(request: Request, env: Env, now: number): Promise<ProfileContext> {
    const session = await requireAcademyAccessSession(request, env, now);
    return ensureSessionProfile(env, session, now);
}

/** Lazily backfills profiles for sessions issued before migration 0003. */
export async function ensureSessionProfile(env: Env, session: ActiveSession, now: number): Promise<ProfileContext> {
    const existing = await profileContextBySession(env, session);
    if (existing) return existing;

    const profileId = crypto.randomUUID();
    const profilePublicId = crypto.randomUUID();
    const deviceId = crypto.randomUUID();
    const devicePublicId = crypto.randomUUID();
    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'INSERT INTO profiles (id, public_id, account_id, sync_key_version, created_at, updated_at) '
            + 'SELECT ?1, ?2, NULL, 1, ?3, ?3 WHERE EXISTS '
            + '(SELECT 1 FROM sessions WHERE public_id = ?4 AND revoked_at IS NULL AND profile_id IS NULL AND device_id IS NULL)',
        ).bind(profileId, profilePublicId, now, session.public_id),
        env.ACADEMY_DB.prepare(
            'INSERT INTO profile_devices (id, public_id, profile_id, created_at, last_seen_at, revoked_at) '
            + 'SELECT ?1, ?2, ?3, ?4, ?4, NULL WHERE EXISTS (SELECT 1 FROM profiles WHERE id = ?3)',
        ).bind(deviceId, devicePublicId, profileId, now),
        env.ACADEMY_DB.prepare(
            'UPDATE sessions SET profile_id = ?1, device_id = ?2 WHERE public_id = ?3 '
            + 'AND revoked_at IS NULL AND profile_id IS NULL AND device_id IS NULL',
        ).bind(profileId, deviceId, session.public_id),
    ]);

    const created = await profileContextBySession(env, session);
    if (!created) throw new HttpError(500, 'Academy profile creation failed.');
    return created;
}

export async function handleGetProfile(request: Request, env: Env, clock: Clock): Promise<Response> {
    const context = await requireProfile(request, env, clock());
    return jsonResponse(profileView(context));
}

/** Atomically pin this profile to one client-held 256-bit sync key. */
export async function handleInitializeProfileKey(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const context = await requireProfile(request, env, clock());
    const body = await readJsonBody(request, 256);
    if (Object.keys(body).length !== 1 || typeof body.keyCommitment !== 'string'
        || !/^[A-Za-z0-9_-]{43}$/u.test(body.keyCommitment)) {
        throw new HttpError(400, 'keyCommitment must be a SHA-256 base64url value.');
    }
    const initialized = await env.ACADEMY_DB.prepare(
        'UPDATE profiles SET sync_key_commitment = ?1 '
        + 'WHERE id = ?2 AND (sync_key_commitment IS NULL OR sync_key_commitment = ?1) '
        + 'RETURNING sync_key_commitment',
    ).bind(body.keyCommitment, context.profile.id).first<{ sync_key_commitment: string }>();
    if (!initialized) {
        throw new HttpError(409, 'This profile already has a different encryption key. Pair this device instead.');
    }
    return jsonResponse({ initialized: true });
}

export function profileView(context: ProfileContext): Record<string, unknown> {
    return {
        profileId: context.profile.public_id,
        deviceId: context.device.public_id,
        accountId: context.accountPublicId,
        keyVersion: context.profile.sync_key_version,
        createdAt: context.profile.created_at,
    };
}

/**
 * Make the session's anonymous profile the account profile, or move its empty
 * provisional device onto the account's existing profile. Encrypted events
 * from two independently keyed profiles are never mixed server-side.
 */
export async function attachSessionProfileToAccount(
    env: Env,
    session: ActiveSession,
    accountId: string,
    now: number,
): Promise<ProfileContext> {
    let current = await ensureSessionProfile(env, session, now);
    if (current.profile.account_id && current.profile.account_id !== accountId) {
        throw new HttpError(409, 'Log out before linking a different Academy account.');
    }

    let accountProfile = await profileByAccount(env, accountId);
    if (!accountProfile) {
        const linked = await env.ACADEMY_DB.prepare(
            'UPDATE OR IGNORE profiles SET account_id = ?1, updated_at = ?2 '
            + 'WHERE id = ?3 AND (account_id IS NULL OR account_id = ?1)',
        ).bind(accountId, now, current.profile.id).run();
        if ((linked.meta.changes ?? 0) === 1) {
            const result = await profileContextBySession(env, session);
            if (!result) throw new HttpError(500, 'Academy profile link failed.');
            return result;
        }

        // A concurrent callback may have claimed the account's unique profile.
        accountProfile = await profileByAccount(env, accountId);
        current = await ensureSessionProfile(env, session, now);
        if (!accountProfile) throw new HttpError(409, 'Academy profile could not be linked.');
    }
    if (accountProfile.id === current.profile.id) return current;

    const disposable = await env.ACADEMY_DB.prepare(
        'SELECT p.account_id, '
        + '(SELECT COUNT(*) FROM srs_events e WHERE e.profile_id = p.id) AS event_count, '
        + '(SELECT COUNT(*) FROM reader_srs_events e WHERE e.profile_id = p.id) AS reader_event_count, '
        + '(SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = p.id AND d.revoked_at IS NULL) AS device_count, '
        + '(SELECT COUNT(*) FROM sessions s WHERE s.profile_id = p.id AND s.revoked_at IS NULL) AS session_count '
        + 'FROM profiles p WHERE p.id = ?1',
    ).bind(current.profile.id).first<DisposableProfileRow>();
    if (
        !disposable
        || disposable.account_id
        || disposable.event_count !== 0
        || disposable.reader_event_count !== 0
        || disposable.device_count !== 1
        || disposable.session_count !== 1
    ) {
        throw new HttpError(409, 'Pair or export this profile before linking the existing account.');
    }

    const results = await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'UPDATE profile_devices SET profile_id = ?1, last_seen_at = ?2 '
            + 'WHERE id = ?3 AND profile_id = ?4 AND revoked_at IS NULL '
            + 'AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ?4 AND p.account_id IS NULL) '
            + 'AND NOT EXISTS (SELECT 1 FROM srs_events e WHERE e.profile_id = ?4) '
            + 'AND NOT EXISTS (SELECT 1 FROM reader_srs_events e WHERE e.profile_id = ?4) '
            + 'AND 1 = (SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = ?4 AND d.revoked_at IS NULL) '
            + 'AND 1 = (SELECT COUNT(*) FROM sessions s WHERE s.profile_id = ?4 AND s.revoked_at IS NULL) '
            + 'AND EXISTS (SELECT 1 FROM sessions s WHERE s.public_id = ?5 AND s.profile_id = ?4 '
            + 'AND s.device_id = ?3 AND s.revoked_at IS NULL)',
        ).bind(accountProfile.id, now, current.device.id, current.profile.id, current.session.public_id),
        env.ACADEMY_DB.prepare(
            'UPDATE sessions SET profile_id = ?1, account_id = ?2 '
            + 'WHERE public_id = ?3 AND profile_id = ?4 AND device_id = ?5 AND revoked_at IS NULL '
            + 'AND EXISTS (SELECT 1 FROM profile_devices d WHERE d.id = ?5 AND d.profile_id = ?1 AND d.revoked_at IS NULL) '
            + 'AND NOT EXISTS (SELECT 1 FROM profile_devices d WHERE d.profile_id = ?4 AND d.revoked_at IS NULL) '
            + 'AND 1 = (SELECT COUNT(*) FROM sessions s WHERE s.profile_id = ?4 AND s.revoked_at IS NULL) '
            + 'AND NOT EXISTS (SELECT 1 FROM srs_events e WHERE e.profile_id = ?4) '
            + 'AND NOT EXISTS (SELECT 1 FROM reader_srs_events e WHERE e.profile_id = ?4)',
        ).bind(accountProfile.id, accountId, current.session.public_id, current.profile.id, current.device.id),
        env.ACADEMY_DB.prepare('UPDATE profiles SET updated_at = ?1 WHERE id = ?2').bind(now, accountProfile.id),
        env.ACADEMY_DB.prepare(
            'DELETE FROM profiles WHERE id = ?1 AND account_id IS NULL '
            + 'AND NOT EXISTS (SELECT 1 FROM srs_events WHERE profile_id = ?1) '
            + 'AND NOT EXISTS (SELECT 1 FROM reader_srs_events WHERE profile_id = ?1) '
            + 'AND NOT EXISTS (SELECT 1 FROM profile_devices WHERE profile_id = ?1 AND revoked_at IS NULL) '
            + 'AND NOT EXISTS (SELECT 1 FROM sessions WHERE profile_id = ?1 AND revoked_at IS NULL)',
        ).bind(current.profile.id),
    ]);
    if (
        (results[0]?.meta.changes ?? 0) !== 1
        || (results[1]?.meta.changes ?? 0) !== 1
        || (results[3]?.meta.changes ?? 0) !== 1
    ) throw new HttpError(409, 'Pair or export this profile before linking the existing account.');
    const merged = await profileContextBySession(env, session);
    if (!merged || merged.profile.id !== accountProfile.id) throw new HttpError(500, 'Academy profile merge failed.');
    return merged;
}

async function profileByAccount(env: Env, accountId: string): Promise<ProfileRow | null> {
    return env.ACADEMY_DB.prepare(
        'SELECT id, public_id, account_id, sync_key_version, created_at, updated_at FROM profiles WHERE account_id = ?1',
    ).bind(accountId).first<ProfileRow>();
}

async function profileContextBySession(env: Env, session: ActiveSession): Promise<ProfileContext | null> {
    const row = await env.ACADEMY_DB.prepare(
        'SELECT p.id AS profile_id, p.public_id AS profile_public_id, p.account_id, '
        + 'a.public_id AS account_public_id, p.sync_key_version, p.created_at AS profile_created_at, '
        + 'p.updated_at AS profile_updated_at, d.id AS device_id, d.public_id AS device_public_id, '
        + 'd.created_at AS device_created_at, d.last_seen_at AS device_last_seen_at, d.revoked_at AS device_revoked_at '
        + 'FROM sessions s JOIN profiles p ON p.id = s.profile_id '
        + 'JOIN profile_devices d ON d.id = s.device_id AND d.profile_id = p.id '
        + 'LEFT JOIN accounts a ON a.id = p.account_id '
        + 'WHERE s.public_id = ?1 AND s.revoked_at IS NULL AND d.revoked_at IS NULL',
    ).bind(session.public_id).first<ProfileContextRow>();
    if (!row) return null;
    return {
        session,
        accountPublicId: row.account_public_id,
        profile: {
            id: row.profile_id,
            public_id: row.profile_public_id,
            account_id: row.account_id,
            sync_key_version: row.sync_key_version,
            created_at: row.profile_created_at,
            updated_at: row.profile_updated_at,
        },
        device: {
            id: row.device_id,
            public_id: row.device_public_id,
            profile_id: row.profile_id,
            created_at: row.device_created_at,
            last_seen_at: row.device_last_seen_at,
            revoked_at: row.device_revoked_at,
        },
    };
}
