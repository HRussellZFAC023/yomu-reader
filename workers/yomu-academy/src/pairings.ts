import { fromBase64Url, hmacSha256Hex, randomBytes } from './crypto';
import { deviceCredentialHash, deviceCredentialValue, requireDeviceProfile } from './device-auth';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { PAIR_CLAIM_RATE, PAIR_CREATE_RATE, clientSubject, enforceRateLimit } from './rate-limit';
import { requireProfile } from './profiles';

const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_ALPHABET = '023456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PAIRING_CODE_LENGTH = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface PairingKeyEnvelope {
    readonly keyVersion: number;
    readonly salt: string;
    readonly nonce: string;
    readonly ciphertext: string;
}

interface PairingRow {
    readonly id: string;
    readonly profile_id: string;
    readonly profile_public_id: string;
    readonly created_by_device_id: string;
    readonly key_version: number;
    readonly key_salt: string;
    readonly key_nonce: string;
    readonly wrapped_key: string;
    readonly consumed_at: number | null;
    readonly consumed_by_device_id: string | null;
}

interface DisposableProfileRow {
    readonly account_id: string | null;
    readonly event_count: number;
    readonly reader_event_count: number;
    readonly device_count: number;
}

/** Create a 100-bit, ten-minute pairing ticket. Its plaintext is returned once. */
export async function handleCreatePairing(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), PAIR_CREATE_RATE, now);
    const context = await requireProfile(request, env, now);
    return jsonResponse(await createPairingTicket(env, context.profile.id, context.device.id, now), 201);
}

/** Let a surviving Reader device restore a website that lost its local profile key. */
export async function handleCreateReaderDevicePairing(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    const context = await requireDeviceProfile(request, env, now);
    await enforceRateLimit(env, `reader-device:${context.device.public_id}`, PAIR_CREATE_RATE, now);
    return jsonResponse(await createPairingTicket(env, context.profile.id, context.device.id, now), 201);
}

async function createPairingTicket(env: Env, profileId: string, deviceId: string, now: number): Promise<Record<string, unknown>> {
    const code = createPairingCode();
    const pairingId = crypto.randomUUID();
    const expiresAt = now + PAIRING_TTL_MS;
    await env.ACADEMY_DB.prepare(
        'INSERT INTO device_pairings '
        + '(id, profile_id, created_by_device_id, code_hash, created_at, expires_at) '
        + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(
        pairingId,
        profileId,
        deviceId,
        await pairingCodeHash(env, code),
        now,
        expiresAt,
    ).run();
    return { pairingId, code, expiresAt };
}

/** Attach the client-encrypted profile key to a ticket before it can be claimed. */
export async function handleCompletePairing(
    request: Request,
    env: Env,
    clock: Clock,
    rawPairingId: string,
): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const pairingId = parsePairingId(rawPairingId);
    const now = clock();
    const context = await requireProfile(request, env, now);
    const envelope = parseKeyEnvelope(await readJsonBody(request, 2048));
    return completePairing(env, pairingId, context.profile.id, context.device.id,
        context.profile.sync_key_version, envelope, now);
}

export async function handleCompleteReaderDevicePairing(
    request: Request,
    env: Env,
    clock: Clock,
    rawPairingId: string,
): Promise<Response> {
    const pairingId = parsePairingId(rawPairingId);
    const now = clock();
    const context = await requireDeviceProfile(request, env, now);
    const envelope = parseKeyEnvelope(await readJsonBody(request, 2048));
    return completePairing(env, pairingId, context.profile.id, context.device.id,
        context.profile.sync_key_version, envelope, now);
}

async function completePairing(
    env: Env,
    pairingId: string,
    profileId: string,
    deviceId: string,
    keyVersion: number,
    envelope: PairingKeyEnvelope,
    now: number,
): Promise<Response> {
    if (envelope.keyVersion !== keyVersion) {
        throw new HttpError(409, 'Pairing key version does not match this profile.');
    }
    const result = await env.ACADEMY_DB.prepare(
        'UPDATE device_pairings SET key_version = ?1, key_salt = ?2, key_nonce = ?3, wrapped_key = ?4 '
        + 'WHERE id = ?5 AND profile_id = ?6 AND created_by_device_id = ?7 '
        + 'AND consumed_at IS NULL AND expires_at > ?8 '
        + 'AND (wrapped_key IS NULL OR (key_version = ?1 AND key_salt = ?2 AND key_nonce = ?3 AND wrapped_key = ?4))',
    ).bind(
        envelope.keyVersion,
        envelope.salt,
        envelope.nonce,
        envelope.ciphertext,
        pairingId,
        profileId,
        deviceId,
        now,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) throw new HttpError(404, 'Pairing ticket is unavailable.');
    return jsonResponse({ pairingId, ready: true });
}

/**
 * Claim a ready ticket from a fresh invite session, or transfer the key to a
 * device account login already attached to the source profile. A fresh
 * target's empty provisional profile is discarded; unsynced local events stay
 * local and can be pushed after the profile switch.
 */
export async function handleClaimPairing(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), PAIR_CLAIM_RATE, now);
    const target = await requireProfile(request, env, now);
    const body = await readJsonBody(request, 1024);
    assertOnlyKeys(body, ['code']);
    const code = normalizePairingCode(body.code);

    const codeHash = await pairingCodeHash(env, code);
    const pairing = await env.ACADEMY_DB.prepare(
        'SELECT dp.id, dp.profile_id, p.public_id AS profile_public_id, dp.created_by_device_id, dp.key_version, '
        + 'dp.key_salt, dp.key_nonce, dp.wrapped_key FROM device_pairings dp '
        + 'JOIN profiles p ON p.id = dp.profile_id WHERE dp.code_hash = ?1 '
        + 'AND dp.consumed_at IS NULL AND dp.expires_at > ?2 AND dp.wrapped_key IS NOT NULL',
    ).bind(codeHash, now).first<PairingRow>();
    if (!pairing) throw new HttpError(404, 'Pairing code is invalid or expired.');
    if (pairing.profile_id === target.profile.id) {
        if (pairing.created_by_device_id === target.device.id) throw new HttpError(409, 'Use this code on the other device.');
        await claimExistingProfileKey(env, target, pairing, codeHash, now);
        return pairingClaimResponse(pairing, target.device.public_id);
    }
    if (target.session.account_id) throw new HttpError(409, 'Log out before pairing a different profile.');

    const disposable = await env.ACADEMY_DB.prepare(
        'SELECT p.account_id, '
        + '(SELECT COUNT(*) FROM srs_events e WHERE e.profile_id = p.id) AS event_count, '
        + '(SELECT COUNT(*) FROM reader_srs_events e WHERE e.profile_id = p.id) AS reader_event_count, '
        + '(SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = p.id AND d.revoked_at IS NULL) AS device_count '
        + 'FROM profiles p WHERE p.id = ?1',
    ).bind(target.profile.id).first<DisposableProfileRow>();
    if (!disposable || disposable.account_id || disposable.event_count !== 0
        || disposable.reader_event_count !== 0 || disposable.device_count !== 1) {
        throw new HttpError(409, 'Pairing requires a fresh device profile.');
    }

    const results = await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'UPDATE device_pairings SET consumed_at = ?1, consumed_by_device_id = ?2 '
            + 'WHERE id = ?3 AND code_hash = ?4 AND consumed_at IS NULL AND expires_at > ?1 '
            + 'AND wrapped_key IS NOT NULL '
            + 'AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = ?5 AND p.account_id IS NULL) '
            + 'AND NOT EXISTS (SELECT 1 FROM srs_events e WHERE e.profile_id = ?5) '
            + 'AND NOT EXISTS (SELECT 1 FROM reader_srs_events e WHERE e.profile_id = ?5) '
            + 'AND 1 = (SELECT COUNT(*) FROM profile_devices d WHERE d.profile_id = ?5 AND d.revoked_at IS NULL) '
            + 'AND EXISTS (SELECT 1 FROM profile_devices d WHERE d.id = ?2 AND d.profile_id = ?5 AND d.revoked_at IS NULL) '
            + 'AND EXISTS (SELECT 1 FROM sessions s WHERE s.public_id = ?6 AND s.profile_id = ?5 '
            + 'AND s.device_id = ?2 AND s.revoked_at IS NULL) RETURNING id',
        ).bind(now, target.device.id, pairing.id, codeHash, target.profile.id, target.session.public_id),
        env.ACADEMY_DB.prepare(
            'UPDATE profile_devices SET profile_id = ?1, last_seen_at = ?2 WHERE id = ?3 AND profile_id = ?4 '
            + 'AND EXISTS (SELECT 1 FROM device_pairings WHERE id = ?5 AND consumed_by_device_id = ?3 AND consumed_at = ?2)',
        ).bind(pairing.profile_id, now, target.device.id, target.profile.id, pairing.id),
        env.ACADEMY_DB.prepare(
            'UPDATE sessions SET profile_id = ?1, account_id = (SELECT account_id FROM profiles WHERE id = ?1) '
            + 'WHERE public_id = ?2 AND device_id = ?3 AND profile_id = ?4 '
            + 'AND EXISTS (SELECT 1 FROM device_pairings WHERE id = ?5 AND consumed_by_device_id = ?3 AND consumed_at = ?6)',
        ).bind(pairing.profile_id, target.session.public_id, target.device.id, target.profile.id, pairing.id, now),
        env.ACADEMY_DB.prepare(
            'DELETE FROM profiles WHERE id = ?1 AND account_id IS NULL '
            + 'AND NOT EXISTS (SELECT 1 FROM sessions WHERE profile_id = ?1) '
            + 'AND NOT EXISTS (SELECT 1 FROM profile_devices WHERE profile_id = ?1) '
            + 'AND NOT EXISTS (SELECT 1 FROM srs_events WHERE profile_id = ?1) '
            + 'AND NOT EXISTS (SELECT 1 FROM reader_srs_events WHERE profile_id = ?1)',
        ).bind(target.profile.id),
        env.ACADEMY_DB.prepare('UPDATE profiles SET updated_at = ?1 WHERE id = ?2').bind(now, pairing.profile_id),
    ]);
    if (
        (results[0]?.meta.changes ?? 0) !== 1
        || results[0].results.length !== 1
        || (results[1]?.meta.changes ?? 0) !== 1
        || (results[2]?.meta.changes ?? 0) !== 1
    ) {
        throw new HttpError(409, 'Pairing code was already used.');
    }

    return pairingClaimResponse(pairing, target.device.public_id);
}

/**
 * Consume a ready one-time pairing code without a website cookie and mint a
 * profile-scoped Reader device credential. The pairing code is the 100-bit
 * authorization; the durable secret is returned once and stored only hashed.
 */
export async function handleClaimReaderDevicePairing(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), PAIR_CLAIM_RATE, now);
    const body = await readJsonBody(request, 1024);
    assertOnlyKeys(body, ['code', 'claimId', 'deviceSecret']);
    const code = normalizePairingCode(body.code);
    if (typeof body.claimId !== 'string') throw new HttpError(400, 'Claim id is invalid.');
    const claimId = parsePairingId(body.claimId);
    if (typeof body.deviceSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(body.deviceSecret)) {
        throw new HttpError(400, 'Device secret is invalid.');
    }
    const secret = body.deviceSecret;
    const codeHash = await pairingCodeHash(env, code);
    const pairing = await env.ACADEMY_DB.prepare(
        'SELECT dp.id, dp.profile_id, p.public_id AS profile_public_id, dp.created_by_device_id, dp.key_version, '
        + 'dp.key_salt, dp.key_nonce, dp.wrapped_key, dp.consumed_at, dp.consumed_by_device_id FROM device_pairings dp '
        + 'JOIN profiles p ON p.id = dp.profile_id WHERE dp.code_hash = ?1 '
        + 'AND (dp.consumed_at IS NOT NULL OR dp.expires_at > ?2) AND dp.wrapped_key IS NOT NULL',
    ).bind(codeHash, now).first<PairingRow>();
    if (!pairing) throw new HttpError(404, 'Pairing code is invalid or expired.');

    const secretHash = await deviceCredentialHash(env, secret);
    if (pairing.consumed_at !== null) {
        const retry = await env.ACADEMY_DB.prepare(
            'SELECT d.public_id FROM profile_device_credentials c '
            + 'JOIN profile_devices d ON d.id = c.profile_device_id '
            + 'WHERE d.id = ?1 AND d.profile_id = ?2 AND c.claim_request_id = ?3 AND c.token_hash = ?4',
        ).bind(pairing.consumed_by_device_id, pairing.profile_id, claimId, secretHash)
            .first<{ public_id: string }>();
        if (!retry) throw new HttpError(409, 'Pairing code was already used.');
        return readerDevicePairingClaimResponse(pairing, retry.public_id, secret);
    }

    const deviceId = crypto.randomUUID();
    const devicePublicId = crypto.randomUUID();
    const credentialId = crypto.randomUUID();
    const results = await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'INSERT INTO profile_devices (id, public_id, profile_id, created_at, last_seen_at, revoked_at) '
            + 'SELECT ?1, ?2, profile_id, ?3, ?3, NULL FROM device_pairings '
            + 'WHERE id = ?4 AND code_hash = ?5 AND consumed_at IS NULL AND expires_at > ?3 AND wrapped_key IS NOT NULL',
        ).bind(deviceId, devicePublicId, now, pairing.id, codeHash),
        env.ACADEMY_DB.prepare(
            'INSERT INTO profile_device_credentials '
            + '(id, profile_device_id, claim_request_id, token_hash, created_at, last_seen_at, revoked_at) '
            + 'SELECT ?1, ?2, ?3, ?4, ?5, ?5, NULL WHERE EXISTS '
            + '(SELECT 1 FROM profile_devices WHERE id = ?2 AND profile_id = ?6)',
        ).bind(credentialId, deviceId, claimId, secretHash, now, pairing.profile_id),
        env.ACADEMY_DB.prepare(
            'UPDATE device_pairings SET consumed_at = ?1, consumed_by_device_id = ?2 '
            + 'WHERE id = ?3 AND code_hash = ?4 AND consumed_at IS NULL AND expires_at > ?1 '
            + 'AND wrapped_key IS NOT NULL AND EXISTS '
            + '(SELECT 1 FROM profile_device_credentials WHERE profile_device_id = ?2) RETURNING id',
        ).bind(now, deviceId, pairing.id, codeHash),
        env.ACADEMY_DB.prepare('UPDATE profiles SET updated_at = ?1 WHERE id = ?2').bind(now, pairing.profile_id),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1 || (results[1]?.meta.changes ?? 0) !== 1
        || (results[2]?.meta.changes ?? 0) !== 1 || results[2].results.length !== 1) {
        throw new HttpError(409, 'Pairing code was already used.');
    }
    return readerDevicePairingClaimResponse(pairing, devicePublicId, secret);
}

function readerDevicePairingClaimResponse(pairing: PairingRow, devicePublicId: string, secret: string): Response {
    return jsonResponse({
        connected: true,
        pairingId: pairing.id,
        profileId: pairing.profile_public_id,
        deviceId: devicePublicId,
        credential: deviceCredentialValue(devicePublicId, secret),
        keyEnvelope: {
            keyVersion: pairing.key_version,
            salt: pairing.key_salt,
            nonce: pairing.key_nonce,
            ciphertext: pairing.wrapped_key,
        },
    }, pairing.consumed_at === null ? 201 : 200);
}

async function claimExistingProfileKey(
    env: Env,
    target: Awaited<ReturnType<typeof requireProfile>>,
    pairing: PairingRow,
    codeHash: string,
    now: number,
): Promise<void> {
    const claimed = await env.ACADEMY_DB.prepare(
        'UPDATE device_pairings SET consumed_at = ?1, consumed_by_device_id = ?2 '
        + 'WHERE id = ?3 AND code_hash = ?4 AND profile_id = ?5 AND consumed_at IS NULL AND expires_at > ?1 '
        + 'AND wrapped_key IS NOT NULL AND created_by_device_id <> ?2 '
        + 'AND EXISTS (SELECT 1 FROM profile_devices d WHERE d.id = ?2 AND d.profile_id = ?5 AND d.revoked_at IS NULL) '
        + 'AND EXISTS (SELECT 1 FROM sessions s WHERE s.public_id = ?6 AND s.profile_id = ?5 '
        + 'AND s.device_id = ?2 AND s.revoked_at IS NULL) RETURNING id',
    ).bind(now, target.device.id, pairing.id, codeHash, target.profile.id, target.session.public_id).run<{ id: string }>();
    if ((claimed.meta.changes ?? 0) !== 1 || claimed.results.length !== 1) {
        throw new HttpError(409, 'Pairing code was already used.');
    }
}

function pairingClaimResponse(pairing: PairingRow, deviceId: string): Response {
    return jsonResponse({
        pairingId: pairing.id,
        profileId: pairing.profile_public_id,
        deviceId,
        keyEnvelope: {
            keyVersion: pairing.key_version,
            salt: pairing.key_salt,
            nonce: pairing.key_nonce,
            ciphertext: pairing.wrapped_key,
        },
    });
}

export async function pruneExpiredPairings(env: Env, clock: Clock): Promise<void> {
    await env.ACADEMY_DB.prepare('DELETE FROM device_pairings WHERE expires_at < ?1').bind(clock() - 24 * 60 * 60_000).run();
}

function normalizePairingCode(value: unknown): string {
    if (typeof value !== 'string') throw new HttpError(400, 'Pairing code is required.');
    const compact = value.normalize('NFKC').trim().toUpperCase().replaceAll(/[-\s]/gu, '');
    if (compact.length !== PAIRING_CODE_LENGTH || [...compact].some(character => !PAIRING_ALPHABET.includes(character))) {
        throw new HttpError(400, 'Pairing code is malformed.');
    }
    return compact.match(/.{4}/gu)?.join('-') ?? compact;
}

function createPairingCode(): string {
    const bytes = randomBytes(PAIRING_CODE_LENGTH);
    const compact = [...bytes].map(byte => PAIRING_ALPHABET[byte & 31]).join('');
    return compact.match(/.{4}/gu)?.join('-') ?? compact;
}

async function pairingCodeHash(env: Env, code: string): Promise<string> {
    const compact = normalizePairingCode(code).replaceAll('-', '');
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `device-pairing:${compact}`);
}

function parsePairingId(value: string): string {
    if (!UUID_PATTERN.test(value)) throw new HttpError(404, 'Pairing ticket is unavailable.');
    return value;
}

function parseKeyEnvelope(body: Record<string, unknown>): PairingKeyEnvelope {
    assertOnlyKeys(body, ['keyVersion', 'salt', 'nonce', 'ciphertext']);
    if (!Number.isSafeInteger(body.keyVersion) || (body.keyVersion as number) < 1 || (body.keyVersion as number) > 1_000_000) {
        throw new HttpError(400, 'keyVersion is invalid.');
    }
    const salt = base64UrlBytes(body.salt, 'salt', 16);
    const nonce = base64UrlBytes(body.nonce, 'nonce', 12);
    const ciphertext = base64UrlBytes(body.ciphertext, 'ciphertext', 48);
    return { keyVersion: body.keyVersion as number, salt, nonce, ciphertext };
}

function base64UrlBytes(value: unknown, field: string, expectedBytes: number): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new HttpError(400, `${field} is invalid.`);
    try {
        if (fromBase64Url(value).byteLength !== expectedBytes) throw new HttpError(400, `${field} is invalid.`);
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, `${field} is invalid.`);
    }
    return value;
}

function assertOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
    const keys = Object.keys(body);
    if (keys.length !== allowed.length || keys.some(key => !allowed.includes(key))) {
        throw new HttpError(400, 'Request contains unsupported fields.');
    }
}
