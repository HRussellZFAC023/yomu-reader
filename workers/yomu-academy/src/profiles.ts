import type { Clock, Env } from './env';
import { requirePaidSessionEntitlement } from './entitlements';
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

/** Authorize Academy resources: every invite session must be signed in. */
export async function requireAcademyAccessSession(request: Request, env: Env, now: number): Promise<ActiveSession> {
    const session = await activeSession(request, env, now);
    if (!session) throw new HttpError(401, 'No active session.');
    if (!session.account_id) throw new HttpError(401, 'Sign in with Google to use an Academy profile.');
    await requirePaidSessionEntitlement(env, session, session.account_id, now);
    return session;
}

export async function requireProfile(request: Request, env: Env, now: number): Promise<ProfileContext> {
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
