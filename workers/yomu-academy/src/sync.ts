import { fromBase64Url, sha256Hex } from './crypto';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody, requireSameOriginMutation } from './http';
import { SYNC_PULL_RATE, SYNC_PUSH_RATE, clientSubject, enforceRateLimit } from './rate-limit';
import { requireAcademyProfile, type ProfileContext } from './profiles';

const MAX_PUSH_BYTES = 256 * 1024;
const MAX_PUSH_EVENTS = 50;
const DEFAULT_PULL_LIMIT = 200;
const MAX_PULL_LIMIT = 200;
const MAX_EVENT_CIPHERTEXT_BYTES = 16 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface EncryptedSyncEventInput {
    readonly id: string;
    readonly occurredAt: number;
    readonly keyVersion: number;
    readonly nonce: string;
    readonly ciphertext: string;
}

interface EncryptedSyncEvent extends EncryptedSyncEventInput {
    readonly cursor: number;
    readonly sourceDeviceId: string | null;
    readonly receivedAt: number;
}

interface SyncPage {
    readonly events: readonly EncryptedSyncEvent[];
    readonly nextCursor: number;
    readonly hasMore: boolean;
}

interface StoredEventRow {
    readonly sequence: number;
    readonly event_id: string;
    readonly occurred_at: number;
    readonly key_version: number;
    readonly nonce: string;
    readonly ciphertext: string;
    readonly source_device_public_id: string | null;
    readonly received_at: number;
}

interface EventHashRow {
    readonly event_id: string;
    readonly event_hash: string;
}

interface ParsedEvent extends EncryptedSyncEventInput {
    readonly hash: string;
}

/** Append encrypted, immutable event envelopes; retries are byte-idempotent. */
export async function handleSyncPush(request: Request, env: Env, clock: Clock): Promise<Response> {
    requireSameOriginMutation(request, env.ACADEMY_ORIGIN);
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), SYNC_PUSH_RATE, now);
    const context = await requireAcademyProfile(request, env, now);
    const body = await readJsonBody(request, MAX_PUSH_BYTES);
    assertOnlyKeys(body, ['events']);
    if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > MAX_PUSH_EVENTS) {
        throw new HttpError(400, `events must contain 1–${MAX_PUSH_EVENTS} encrypted envelopes.`);
    }

    const events = await Promise.all(body.events.map(event => parseEvent(event, context, now)));
    if (new Set(events.map(event => event.id)).size !== events.length) {
        throw new HttpError(400, 'A push cannot repeat an event id.');
    }

    const writes = await env.ACADEMY_DB.batch([
        ...events.map(event => env.ACADEMY_DB.prepare(
            'INSERT OR IGNORE INTO srs_events '
            + '(profile_id, event_id, source_device_id, occurred_at, key_version, nonce, ciphertext, event_hash, received_at) '
            + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
        ).bind(
            context.profile.id,
            event.id,
            context.device.id,
            event.occurredAt,
            event.keyVersion,
            event.nonce,
            event.ciphertext,
            event.hash,
            now,
        )),
        env.ACADEMY_DB.prepare(
            'UPDATE profile_devices SET last_seen_at = ?1 WHERE id = ?2 AND profile_id = ?3 AND revoked_at IS NULL',
        ).bind(now, context.device.id, context.profile.id),
        env.ACADEMY_DB.prepare('UPDATE profiles SET updated_at = ?1 WHERE id = ?2').bind(now, context.profile.id),
    ]);
    const stored = await env.ACADEMY_DB.batch<EventHashRow>(events.map(event => env.ACADEMY_DB.prepare(
        'SELECT event_id, event_hash FROM srs_events WHERE profile_id = ?1 AND event_id = ?2',
    ).bind(context.profile.id, event.id)));

    let inserted = 0;
    let duplicates = 0;
    const conflicts: string[] = [];
    events.forEach((event, index) => {
        const row = stored[index]?.results[0];
        if (!row || row.event_hash !== event.hash) conflicts.push(event.id);
        else if ((writes[index]?.meta.changes ?? 0) === 1) inserted += 1;
        else duplicates += 1;
    });
    const payload = { accepted: inserted + duplicates, inserted, duplicates, conflicts };
    return jsonResponse(payload, conflicts.length > 0 ? 409 : 200);
}

/** Pull one ordered page; clients union by id and re-project local state. */
export async function handleSyncPull(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), SYNC_PULL_RATE, now);
    const context = await requireAcademyProfile(request, env, now);
    const { cursor, limit } = readPageRequest(new URL(request.url));
    return jsonResponse(await readSyncPage(env, context.profile.id, cursor, limit));
}

async function readSyncPage(
    env: Env,
    profileId: string,
    cursor: number,
    limit: number,
): Promise<SyncPage> {
    const result = await env.ACADEMY_DB.prepare(
        'SELECT e.sequence, e.event_id, e.occurred_at, e.key_version, e.nonce, e.ciphertext, '
        + 'd.public_id AS source_device_public_id, e.received_at FROM srs_events e '
        + 'LEFT JOIN profile_devices d ON d.id = e.source_device_id '
        + 'WHERE e.profile_id = ?1 AND e.sequence > ?2 ORDER BY e.sequence LIMIT ?3',
    ).bind(profileId, cursor, limit + 1).all<StoredEventRow>();
    const pageRows = result.results.slice(0, limit);
    const events = pageRows.map(row => ({
        cursor: row.sequence,
        id: row.event_id,
        occurredAt: row.occurred_at,
        keyVersion: row.key_version,
        nonce: row.nonce,
        ciphertext: row.ciphertext,
        sourceDeviceId: row.source_device_public_id,
        receivedAt: row.received_at,
    }));
    return {
        events,
        nextCursor: events.at(-1)?.cursor ?? cursor,
        hasMore: result.results.length > limit,
    };
}

function readPageRequest(url: URL): { cursor: number; limit: number } {
    const cursor = integerQuery(url.searchParams.get('cursor'), 'cursor', 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = integerQuery(url.searchParams.get('limit'), 'limit', 1, MAX_PULL_LIMIT, DEFAULT_PULL_LIMIT);
    return { cursor, limit };
}

async function parseEvent(value: unknown, context: ProfileContext, now: number): Promise<ParsedEvent> {
    if (!isRecord(value)) throw new HttpError(400, 'Each event must be an object.');
    assertOnlyKeys(value, ['id', 'occurredAt', 'keyVersion', 'nonce', 'ciphertext']);
    if (typeof value.id !== 'string' || !UUID_V4_PATTERN.test(value.id)) {
        throw new HttpError(400, 'Event id must be an opaque UUIDv4.');
    }
    if (!Number.isSafeInteger(value.occurredAt) || (value.occurredAt as number) < 0 || (value.occurredAt as number) > now + MAX_CLOCK_SKEW_MS) {
        throw new HttpError(400, 'occurredAt must be a valid epoch-milliseconds timestamp.');
    }
    if (!Number.isSafeInteger(value.keyVersion) || (value.keyVersion as number) < 1 || (value.keyVersion as number) > 1_000_000) {
        throw new HttpError(400, 'keyVersion is invalid.');
    }
    if (value.keyVersion !== context.profile.sync_key_version) {
        throw new HttpError(409, 'Event key version does not match this profile.');
    }
    const nonce = base64Url(value.nonce, 'nonce', 12, 12);
    const ciphertext = base64Url(value.ciphertext, 'ciphertext', 17, MAX_EVENT_CIPHERTEXT_BYTES);
    const input: EncryptedSyncEventInput = {
        id: value.id,
        occurredAt: value.occurredAt as number,
        keyVersion: value.keyVersion as number,
        nonce,
        ciphertext,
    };
    return { ...input, hash: await sha256Hex(JSON.stringify([input.id, input.occurredAt, input.keyVersion, input.nonce, input.ciphertext])) };
}

function base64Url(value: unknown, field: string, minBytes: number, maxBytes: number): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new HttpError(400, `${field} is invalid.`);
    try {
        const bytes = fromBase64Url(value).byteLength;
        if (bytes < minBytes || bytes > maxBytes) throw new HttpError(400, `${field} is invalid.`);
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, `${field} is invalid.`);
    }
    return value;
}

function integerQuery(value: string | null, field: string, minimum: number, maximum: number, fallback: number): number {
    if (value === null || value === '') return fallback;
    if (!/^\d+$/u.test(value)) throw new HttpError(400, `${field} is invalid.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new HttpError(400, `${field} is invalid.`);
    return parsed;
}

function assertOnlyKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
    const keys = Object.keys(body);
    if (keys.length !== allowed.length || keys.some(key => !allowed.includes(key))) {
        throw new HttpError(400, 'Request contains unsupported fields.');
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
