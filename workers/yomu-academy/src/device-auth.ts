import { hmacSha256Hex } from './crypto';
import type { Env } from './env';
import { HttpError, jsonResponse } from './http';
import { requireSameOriginMutation } from './http';
import type { ProfileContext, ProfileDeviceRow, ProfileRow } from './profiles';
import { requireProfile } from './profiles';
import type { ActiveSession } from './sessions';

const DEVICE_CREDENTIAL_PATTERN = /^yda1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/iu;

interface DeviceProfileRow {
    readonly profile_id: string;
    readonly profile_public_id: string;
    readonly profile_account_id: string | null;
    readonly sync_key_version: number;
    readonly profile_created_at: number;
    readonly profile_updated_at: number;
    readonly device_id: string;
    readonly device_public_id: string;
    readonly device_created_at: number;
    readonly device_last_seen_at: number;
    readonly device_revoked_at: number | null;
    readonly account_public_id: string | null;
    readonly display_name: string | null;
}

export interface DeviceProfileContext extends ProfileContext {
    readonly displayName: string | null;
}

export function deviceCredentialValue(devicePublicId: string, secret: string): string {
    return `yda1.${devicePublicId}.${secret}`;
}

export async function deviceCredentialHash(env: Env, secret: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `reader-device:${secret}`);
}

export async function requireDeviceProfile(request: Request, env: Env, now: number): Promise<DeviceProfileContext> {
    const authorization = request.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/iu.exec(authorization);
    const credential = match?.[1] ?? '';
    const parsed = DEVICE_CREDENTIAL_PATTERN.exec(credential);
    if (!parsed) throw new HttpError(401, 'A Reader device credential is required.');
    const row = await env.ACADEMY_DB.prepare(
        'SELECT p.id AS profile_id, p.public_id AS profile_public_id, p.account_id AS profile_account_id, '
        + 'p.sync_key_version, p.created_at AS profile_created_at, p.updated_at AS profile_updated_at, '
        + 'd.id AS device_id, d.public_id AS device_public_id, d.created_at AS device_created_at, '
        + 'd.last_seen_at AS device_last_seen_at, d.revoked_at AS device_revoked_at, '
        + 'a.public_id AS account_public_id, a.display_name '
        + 'FROM profile_device_credentials c '
        + 'JOIN profile_devices d ON d.id = c.profile_device_id '
        + 'JOIN profiles p ON p.id = d.profile_id '
        + 'LEFT JOIN accounts a ON a.id = p.account_id '
        + 'WHERE d.public_id = ?1 AND c.token_hash = ?2 AND c.revoked_at IS NULL AND d.revoked_at IS NULL',
    ).bind(parsed[1], await deviceCredentialHash(env, parsed[2])).first<DeviceProfileRow>();
    if (!row) throw new HttpError(401, 'Reader device credential is invalid or revoked.');
    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'UPDATE profile_device_credentials SET last_seen_at = ?1 WHERE profile_device_id = ?2 AND revoked_at IS NULL',
        ).bind(now, row.device_id),
        env.ACADEMY_DB.prepare(
            'UPDATE profile_devices SET last_seen_at = ?1 WHERE id = ?2 AND revoked_at IS NULL',
        ).bind(now, row.device_id),
    ]);
    const profile: ProfileRow = {
        id: row.profile_id,
        public_id: row.profile_public_id,
        account_id: row.profile_account_id,
        sync_key_version: row.sync_key_version,
        created_at: row.profile_created_at,
        updated_at: row.profile_updated_at,
    };
    const device: ProfileDeviceRow = {
        id: row.device_id,
        public_id: row.device_public_id,
        profile_id: row.profile_id,
        created_at: row.device_created_at,
        last_seen_at: now,
        revoked_at: row.device_revoked_at,
    };
    const session: ActiveSession = {
        public_id: `device:${row.device_public_id}`,
        invite_id: 'system_reader_device_v1',
        account_id: row.profile_account_id,
        expires_at: Number.MAX_SAFE_INTEGER,
        offline_resume_until: Number.MAX_SAFE_INTEGER,
    };
    return { session, profile, device, accountPublicId: row.account_public_id, displayName: row.display_name };
}

export async function handleGetDeviceStatus(request: Request, env: Env, now: number): Promise<Response> {
    const context = await requireDeviceProfile(request, env, now);
    return jsonResponse({
        connected: true,
        accountId: context.accountPublicId,
        displayName: context.displayName,
        profileId: context.profile.public_id,
        deviceId: context.device.public_id,
        keyVersion: context.profile.sync_key_version,
    });
}

export async function handleRevokeDevice(request: Request, env: Env, now: number): Promise<Response> {
    const context = await requireDeviceProfile(request, env, now);
    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'UPDATE profile_device_credentials SET revoked_at = ?1 WHERE profile_device_id = ?2 AND revoked_at IS NULL',
        ).bind(now, context.device.id),
        env.ACADEMY_DB.prepare(
            'UPDATE profile_devices SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL',
        ).bind(now, context.device.id),
    ]);
    return jsonResponse({ revoked: true });
}

/** Account-owned inventory for recovering from a lost or stolen Reader device. */
export async function handleListReaderDevices(request: Request, env: Env, now: number): Promise<Response> {
    const context = await requireProfile(request, env, now);
    const devices = await env.ACADEMY_DB.prepare(
        'SELECT d.public_id, c.created_at, c.last_seen_at, c.revoked_at '
        + 'FROM profile_device_credentials c JOIN profile_devices d ON d.id = c.profile_device_id '
        + 'WHERE d.profile_id = ?1 ORDER BY c.created_at DESC',
    ).bind(context.profile.id).all<{ public_id: string; created_at: number; last_seen_at: number; revoked_at: number | null }>();
    return jsonResponse({ devices: devices.results.map(device => ({
        deviceId: device.public_id,
        createdAt: device.created_at,
        lastSeenAt: device.last_seen_at,
        revokedAt: device.revoked_at,
    })) });
}

export async function handleAccountRevokeReaderDevice(
    request: Request,
    env: Env,
    now: number,
    devicePublicId: string,
): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    if (!/^[0-9a-f-]{36}$/iu.test(devicePublicId)) throw new HttpError(404, 'Reader device was not found.');
    const context = await requireProfile(request, env, now);
    const result = await env.ACADEMY_DB.prepare(
        'UPDATE profile_device_credentials SET revoked_at = COALESCE(revoked_at, ?1) '
        + 'WHERE profile_device_id = (SELECT id FROM profile_devices WHERE public_id = ?2 AND profile_id = ?3) '
        + 'RETURNING profile_device_id',
    ).bind(now, devicePublicId, context.profile.id).run();
    if (!result.results.length) throw new HttpError(404, 'Reader device was not found.');
    await env.ACADEMY_DB.prepare(
        'UPDATE profile_devices SET revoked_at = COALESCE(revoked_at, ?1) WHERE public_id = ?2 AND profile_id = ?3',
    ).bind(now, devicePublicId, context.profile.id).run();
    return jsonResponse({ revoked: true, deviceId: devicePublicId });
}
