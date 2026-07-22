// @vitest-environment node
import { describe, expect, it } from 'vitest';

import worker from '../../workers/yomu-academy/src/index';
import { linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import type { ExecutionContext } from '../../workers/yomu-academy/src/cf';
import { toBase64Url } from '../../workers/yomu-academy/src/crypto';
import type { Env } from '../../workers/yomu-academy/src/env';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { activeSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const context: ExecutionContext = { waitUntil(promise): void { void promise.catch(() => undefined); } };

describe('Reader extension device sync', () => {
    it('idempotently claims a wrapped key, syncs opaque events, and revokes the bearer device', async () => {
        const academy = createSqliteAcademy();
        try {
            const ownerCookie = await createLinkedOwner(academy.env);
            const profile = await dispatch(academy.env, request(academy.env, '/academy/api/profile', 'GET', undefined, ownerCookie));
            expect(profile.status).toBe(200);
            const key = await dispatch(academy.env, request(academy.env, '/academy/api/profile/key', 'POST', {
                keyCommitment: 'A'.repeat(43),
            }, ownerCookie));
            expect(key.status).toBe(200);

            const ticketResponse = await dispatch(academy.env, request(academy.env, '/academy/api/pairings', 'POST', {}, ownerCookie));
            const ticket = await ticketResponse.json() as { pairingId: string; code: string };
            const envelope = {
                keyVersion: 1,
                salt: encodedBytes(16, 1),
                nonce: encodedBytes(12, 2),
                ciphertext: encodedBytes(48, 3),
            };
            const completed = await dispatch(academy.env, request(
                academy.env, `/academy/api/pairings/${ticket.pairingId}`, 'PUT', envelope, ownerCookie,
            ));
            expect(completed.status).toBe(200);

            const claimRequest = {
                code: ticket.code,
                claimId: '12345678-1234-4123-8123-123456789012',
                deviceSecret: encodedBytes(32, 9),
            };
            const claimed = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/pairings/claim', 'POST', claimRequest, undefined, 'chrome-extension://reader-id',
            ));
            expect(claimed.status).toBe(201);
            expect(claimed.headers.get('access-control-allow-origin')).toBe('*');
            const claim = await claimed.json() as { credential: string; deviceId: string; keyEnvelope: typeof envelope; displayName?: string };
            expect(claim.credential).toMatch(/^yda1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
            expect(claim.keyEnvelope).toEqual(envelope);
            expect((await dispatch(academy.env, request(
                academy.env, '/academy/api/device/pairings/claim', 'POST', claimRequest, undefined, 'chrome-extension://reader-id',
            ))).status).toBe(200);
            expect((await dispatch(academy.env, request(
                academy.env, '/academy/api/device/pairings/claim', 'POST', {
                    ...claimRequest,
                    claimId: '22345678-1234-4123-8123-123456789012',
                }, undefined, 'chrome-extension://reader-id',
            ))).status).toBe(409);

            const authorization = { authorization: `Bearer ${claim.credential}` };
            const status = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/status', 'GET', undefined, undefined, 'chrome-extension://reader-id', authorization,
            ));
            expect(await status.json()).toMatchObject({ connected: true, displayName: 'Learner', keyVersion: 1 });
            const recoveryTicketResponse = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/pairings', 'POST', {}, undefined,
                'chrome-extension://reader-id', authorization,
            ));
            expect(recoveryTicketResponse.status).toBe(201);
            const recoveryTicket = await recoveryTicketResponse.json() as { pairingId: string; code: string };
            expect((await dispatch(academy.env, request(
                academy.env, `/academy/api/device/pairings/${recoveryTicket.pairingId}`, 'PUT', envelope,
                undefined, 'chrome-extension://reader-id', authorization,
            ))).status).toBe(200);
            expect((await dispatch(academy.env, request(
                academy.env, '/academy/api/pairings/claim', 'POST', { code: recoveryTicket.code }, ownerCookie,
            ))).status).toBe(200);
            const empty = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/srs/pull', 'GET', undefined, undefined, 'chrome-extension://reader-id', authorization,
            ));
            expect(await empty.json()).toEqual({ events: [], nextCursor: 0, hasMore: false });

            const event = {
                id: encodedBytes(32, 7),
                occurredAt: Date.now(),
                keyVersion: 1,
                nonce: encodedBytes(12, 4),
                ciphertext: encodedBytes(96, 5),
            };
            const saved = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/srs/push', 'POST', { events: [event] }, undefined, 'chrome-extension://reader-id', authorization,
            ));
            expect(await saved.json()).toMatchObject({ accepted: 1, inserted: 1, conflicts: [] });
            const duplicate = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/srs/push', 'POST', { events: [event] }, undefined, 'chrome-extension://reader-id', authorization,
            ));
            expect(await duplicate.json()).toMatchObject({ accepted: 1, duplicates: 1, conflicts: [] });
            const secondEvent = {
                ...event,
                id: encodedBytes(32, 8),
                occurredAt: event.occurredAt + 1,
                nonce: encodedBytes(12, 6),
                ciphertext: encodedBytes(96, 7),
            };
            expect((await dispatch(academy.env, request(
                academy.env, '/academy/api/device/srs/push', 'POST', { events: [secondEvent] },
                undefined, 'chrome-extension://reader-id', authorization,
            ))).status).toBe(200);
            const pulled = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/srs/pull?cursor=0', 'GET', undefined, undefined, 'chrome-extension://reader-id', authorization,
            ));
            const pulledBody = await pulled.json() as {
                events: Array<typeof event & { cursor: number }>;
                nextCursor: number;
                hasMore: boolean;
            };
            expect(pulledBody.events).toHaveLength(2);
            expect(pulledBody.events[0]).toMatchObject({ ...event, cursor: 1 });
            expect(pulledBody.events[1]).toMatchObject(secondEvent);
            // INSERT OR IGNORE may consume an AUTOINCREMENT value for a
            // duplicate envelope, so cursors are ordered but not contiguous.
            expect(pulledBody.events[1]!.cursor).toBeGreaterThan(pulledBody.events[0]!.cursor);
            expect(pulledBody).toMatchObject({ nextCursor: pulledBody.events[1]!.cursor, hasMore: false });

            const academyEvent = {
                id: '42345678-1234-4123-8123-123456789012',
                occurredAt: event.occurredAt,
                keyVersion: 1,
                nonce: encodedBytes(12, 11),
                ciphertext: encodedBytes(96, 12),
            };
            expect((await dispatch(academy.env, request(
                academy.env, '/academy/api/srs/push', 'POST', { events: [academyEvent] }, ownerCookie,
            ))).status).toBe(200);
            const firstExport = await (await dispatch(academy.env, request(
                academy.env, '/academy/api/account/export?limit=1&eventCursor=0&readerSrsCursor=0',
                'GET', undefined, ownerCookie,
            ))).json() as {
                eventPage: { events: Array<{ id: string }>; nextCursor: number; hasMore: boolean };
                readerSrsEventPage: { events: Array<{ id: string }>; nextCursor: number; hasMore: boolean };
            };
            expect(firstExport.eventPage).toMatchObject({ events: [{ id: academyEvent.id }], hasMore: false });
            expect(firstExport.readerSrsEventPage).toMatchObject({ events: [{ id: event.id }], hasMore: true });
            const secondExport = await (await dispatch(academy.env, request(
                academy.env,
                `/academy/api/account/export?limit=1&eventCursor=${firstExport.eventPage.nextCursor}`
                    + `&readerSrsCursor=${firstExport.readerSrsEventPage.nextCursor}`,
                'GET', undefined, ownerCookie,
            ))).json() as typeof firstExport;
            expect(secondExport.eventPage.events).toEqual([]);
            expect(secondExport.readerSrsEventPage).toMatchObject({ events: [{ id: secondEvent.id }], hasMore: false });
            expect(JSON.stringify(firstExport)).not.toContain(claimRequest.deviceSecret);

            const preflight = await dispatch(academy.env, new Request(`${academy.env.ACADEMY_ORIGIN}/academy/api/device`, {
                method: 'OPTIONS',
                headers: { origin: 'chrome-extension://reader-id', 'access-control-request-method': 'DELETE' },
            }));
            expect(preflight.status).toBe(204);
            expect(preflight.headers.get('access-control-allow-origin')).toBe('*');

            const listed = await dispatch(academy.env, request(
                academy.env, '/academy/api/account/devices', 'GET', undefined, ownerCookie,
            ));
            expect(await listed.json()).toMatchObject({ devices: [{ deviceId: claim.deviceId, revokedAt: null }] });
            const revoked = await dispatch(academy.env, request(
                academy.env, `/academy/api/account/devices/${claim.deviceId}`, 'DELETE', {}, ownerCookie,
            ));
            expect(revoked.status).toBe(200);
            const denied = await dispatch(academy.env, request(
                academy.env, '/academy/api/device/status', 'GET', undefined, undefined, 'chrome-extension://reader-id', authorization,
            ));
            expect(denied.status).toBe(401);
            expect(denied.headers.get('access-control-allow-origin')).toBe('*');

            const deleted = await dispatch(academy.env, request(
                academy.env, '/academy/api/account', 'DELETE', { confirmation: 'delete-account' }, ownerCookie,
            ));
            expect(deleted.status).toBe(200);
            expect(academy.db.rows('SELECT * FROM reader_srs_events')).toEqual([]);
            expect(academy.db.rows('SELECT * FROM profile_device_credentials')).toEqual([]);
            expect(academy.db.rows('SELECT * FROM profiles')).toEqual([]);
        } finally {
            academy.close();
        }
    });
});

async function createLinkedOwner(env: Env): Promise<string> {
    const code = 'DEVICE2026';
    await env.ACADEMY_DB.prepare(
        'INSERT INTO invites (id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
        + "VALUES ('device-owner-invite', ?1, 1, 'seed', ?2, NULL, NULL, 1)",
    ).bind(await inviteCodeHash(env, code), Date.now() - 1).run();
    const sessionResponse = await dispatch(env, request(env, '/academy/api/session', 'POST', { code }));
    const ownerCookie = responseCookie(sessionResponse);
    const session = await activeSession(request(env, '/academy/api/session', 'GET', undefined, ownerCookie), env, Date.now());
    if (!session) throw new Error('owner session missing');
    await linkGoogleSubject(env, session, 'reader-device-owner', Date.now());
    return ownerCookie;
}

async function dispatch(env: Env, input: Request): Promise<Response> {
    return worker.fetch(input, env, context);
}

function request(
    env: Env,
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: unknown,
    cookie?: string,
    origin = env.ACADEMY_ORIGIN,
    extraHeaders: Record<string, string> = {},
): Request {
    return new Request(`${env.ACADEMY_ORIGIN}${path}`, {
        method,
        headers: {
            origin,
            'sec-fetch-site': origin === env.ACADEMY_ORIGIN ? 'same-origin' : 'cross-site',
            'cf-connecting-ip': '198.51.100.41',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(cookie ? { cookie } : {}),
            ...extraHeaders,
        },
        body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
    });
}

function responseCookie(response: Response): string {
    const value = response.headers.get('set-cookie')?.split(';')[0];
    if (!value) throw new Error('response cookie missing');
    return value;
}

function encodedBytes(length: number, fill: number): string {
    return toBase64Url(new Uint8Array(length).fill(fill));
}
