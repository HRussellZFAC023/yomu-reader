import { fromBase64Url, sha256Hex } from './crypto';
import { requireDeviceProfile } from './device-auth';
import type { Clock, Env } from './env';
import { HttpError, jsonResponse, readJsonBody } from './http';
import { enforceRateLimit, SYNC_PULL_RATE, SYNC_PUSH_RATE } from './rate-limit';

const MAX_PUSH_BYTES = 256 * 1024;
// Each event currently costs an INSERT plus an idempotency verification SELECT.
// Keep the whole invocation below the Workers Free plan's 50 D1-query limit.
const MAX_PUSH_EVENTS = 20;
const MAX_EVENT_CIPHERTEXT_BYTES = 16 * 1024;
const MAX_PULL_LIMIT = 200;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

interface ParsedReaderEvent {
    readonly id: string;
    readonly occurredAt: number;
    readonly keyVersion: number;
    readonly nonce: string;
    readonly ciphertext: string;
    readonly hash: string;
}

interface ReaderEventRow {
    readonly sequence: number;
    readonly event_id: string;
    readonly occurred_at: number;
    readonly key_version: number;
    readonly nonce: string;
    readonly ciphertext: string;
    readonly source_device_public_id: string;
    readonly received_at: number;
}

/** Append bounded encrypted deck mutations; byte-identical retries are idempotent. */
export async function handlePushReaderSrsEvents(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    const context = await requireDeviceProfile(request, env, now);
    await enforceRateLimit(env, `reader-device:${context.device.public_id}`, SYNC_PUSH_RATE, now);
    const body = await readJsonBody(request, MAX_PUSH_BYTES);
    if (Object.keys(body).length !== 1 || !Array.isArray(body.events)
        || body.events.length === 0 || body.events.length > MAX_PUSH_EVENTS) {
        throw new HttpError(400, `events must contain 1–${MAX_PUSH_EVENTS} encrypted envelopes.`);
    }
    const events = await Promise.all(body.events.map(value => parseEvent(value, context.profile.sync_key_version, now)));
    if (new Set(events.map(event => event.id)).size !== events.length) throw new HttpError(400, 'A push cannot repeat an event id.');
    const writes = await env.ACADEMY_DB.batch(events.map(event => env.ACADEMY_DB.prepare(
        'INSERT OR IGNORE INTO reader_srs_events '
        + '(profile_id, event_id, source_device_id, occurred_at, key_version, nonce, ciphertext, event_hash, received_at) '
        + 'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
    ).bind(context.profile.id, event.id, context.device.id, event.occurredAt, event.keyVersion,
        event.nonce, event.ciphertext, event.hash, now)));
    const stored = await env.ACADEMY_DB.batch<{ event_id: string; event_hash: string }>(events.map(event => env.ACADEMY_DB.prepare(
        'SELECT event_id, event_hash FROM reader_srs_events WHERE profile_id = ?1 AND event_id = ?2',
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
    return jsonResponse({ accepted: inserted + duplicates, inserted, duplicates, conflicts }, conflicts.length ? 409 : 200);
}

/** Pull ordered encrypted mutations; the server never sees card identities or contents. */
export async function handlePullReaderSrsEvents(request: Request, env: Env, clock: Clock): Promise<Response> {
    const now = clock();
    const context = await requireDeviceProfile(request, env, now);
    await enforceRateLimit(env, `reader-device:${context.device.public_id}`, SYNC_PULL_RATE, now);
    const url = new URL(request.url);
    const cursor = integerQuery(url.searchParams.get('cursor'), 'cursor', 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = integerQuery(url.searchParams.get('limit'), 'limit', 1, MAX_PULL_LIMIT, MAX_PULL_LIMIT);
    return jsonResponse(await readReaderSrsEventPage(env, context.profile.id, cursor, limit));
}

async function readReaderSrsEventPage(env: Env, profileId: string, cursor: number, limit: number): Promise<Record<string, unknown>> {
    const result = await env.ACADEMY_DB.prepare(
        'SELECT e.sequence, e.event_id, e.occurred_at, e.key_version, e.nonce, e.ciphertext, '
        + 'd.public_id AS source_device_public_id, e.received_at FROM reader_srs_events e '
        + 'JOIN profile_devices d ON d.id = e.source_device_id '
        + 'WHERE e.profile_id = ?1 AND e.sequence > ?2 ORDER BY e.sequence LIMIT ?3',
    ).bind(profileId, cursor, limit + 1).all<ReaderEventRow>();
    const rows = result.results.slice(0, limit);
    const events = rows.map(row => ({
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

async function parseEvent(value: unknown, keyVersion: number, now: number): Promise<ParsedReaderEvent> {
    if (!isRecord(value) || Object.keys(value).length !== 5
        || Object.keys(value).some(key => !['id', 'occurredAt', 'keyVersion', 'nonce', 'ciphertext'].includes(key))) {
        throw new HttpError(400, 'Each event must be a supported encrypted envelope.');
    }
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value.id)) throw new HttpError(400, 'Event id is invalid.');
    if (!Number.isSafeInteger(value.occurredAt) || (value.occurredAt as number) < 0
        || (value.occurredAt as number) > now + MAX_CLOCK_SKEW_MS) throw new HttpError(400, 'occurredAt is invalid.');
    if (value.keyVersion !== keyVersion) throw new HttpError(409, 'Event key version does not match this profile.');
    const nonce = base64Url(value.nonce, 'nonce', 12, 12);
    const ciphertext = base64Url(value.ciphertext, 'ciphertext', 17, MAX_EVENT_CIPHERTEXT_BYTES);
    const event = { id: value.id, occurredAt: value.occurredAt as number, keyVersion, nonce, ciphertext };
    return { ...event, hash: await sha256Hex(JSON.stringify(Object.values(event))) };
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

function integerQuery(value: string | null, field: string, min: number, max: number, fallback: number): number {
    if (value === null || value === '') return fallback;
    if (!/^\d+$/u.test(value)) throw new HttpError(400, `${field} is invalid.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, `${field} is invalid.`);
    return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
