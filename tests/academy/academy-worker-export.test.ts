// @vitest-environment node
import worker from '../../workers/yomu-academy/src/index';
import { linkGoogleSubject } from '../../workers/yomu-academy/src/accounts';
import { toBase64Url } from '../../workers/yomu-academy/src/crypto';
import type { Env } from '../../workers/yomu-academy/src/env';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { activeSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';

const now = Date.UTC(2026, 6, 20, 9);
const sharedIp = '203.0.113.77';
const ctx = { waitUntil: (_promise: Promise<unknown>) => undefined };

function get(path: string, cookie: string): Request {
    return new Request(`https://yomureader.com${path}`, {
        headers: { cookie, 'cf-connecting-ip': sharedIp },
    });
}

function mutation(path: string, body: unknown): Request {
    return new Request(`https://yomureader.com${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'cf-connecting-ip': sharedIp,
        },
        body: JSON.stringify(body),
    });
}

async function dispatch(env: Env, request: Request): Promise<Response> {
    return worker.fetch(request, env, ctx);
}

function responseCookie(response: Response): string {
    const value = response.headers.get('set-cookie')?.split(';')[0];
    if (!value) throw new Error('session cookie missing');
    return value;
}

async function createLinkedSession(env: Env, code: string, subject: string): Promise<string> {
    const response = await dispatch(env, mutation('/academy/api/session', { code }));
    expect(response.status).toBe(200);
    const cookie = responseCookie(response);
    const session = await activeSession(get('/academy/api/session', cookie), env, now);
    if (!session) throw new Error('active session missing');
    await linkGoogleSubject(env, session, subject, now);
    return cookie;
}

describe('Academy authenticated export traversal', () => {
    it('exports more than 24,000 snapshot rows exactly once with tamper, replay, and shared-NAT isolation', async () => {
        const academy = createSqliteAcademy();
        try {
            await academy.env.ACADEMY_DB.prepare(
                'INSERT INTO invites '
                + '(id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required) '
                + "VALUES ('export-invite', ?1, 200, 'seed', ?2, NULL, NULL, 1)",
            ).bind(await inviteCodeHash(academy.env, 'EXPORT2026'), now - 1).run();
            const primaryCookie = await createLinkedSession(academy.env, 'EXPORT2026', 'large-export-subject');
            const peerCookie = await createLinkedSession(academy.env, 'EXPORT2026', 'large-export-subject');
            const [profile] = academy.db.rows<{ id: string }>('SELECT id FROM profiles');
            if (!profile) throw new Error('profile missing');

            const insert = academy.db.database.prepare(
                'INSERT INTO srs_events '
                + '(profile_id, event_id, occurred_at, key_version, nonce, ciphertext, event_hash, received_at) '
                + 'VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?3)',
            );
            const nonce = toBase64Url(new Uint8Array(12).fill(1));
            const ciphertext = toBase64Url(new Uint8Array(32).fill(2));
            academy.db.database.exec('BEGIN IMMEDIATE');
            try {
                for (let index = 0; index < 24_001; index += 1) {
                    insert.run(profile.id, crypto.randomUUID(), now + index, nonce, ciphertext, index.toString(16).padStart(64, '0'));
                }
                academy.db.database.exec('COMMIT');
            } catch (error) {
                academy.db.database.exec('ROLLBACK');
                throw error;
            }

            const firstResponse = await dispatch(academy.env, get('/academy/api/account/export', primaryCookie));
            expect(firstResponse.status).toBe(200);
            const first = await firstResponse.json() as ExportBody;
            expect(first.schemaVersion).toBe(2);
            expect(first.snapshotSemantics).toBe('events-at-export-start');
            expect(first.eventPage.events).toHaveLength(200);
            const firstCursor = first.eventPage.exportCursor;
            if (!firstCursor) throw new Error('first export cursor missing');

            const tampered = `${firstCursor.slice(0, -1)}${firstCursor.endsWith('0') ? '1' : '0'}`;
            expect((await dispatch(academy.env, get(
                `/academy/api/account/export?cursor=${encodeURIComponent(tampered)}`,
                primaryCookie,
            ))).status).toBe(400);
            expect((await dispatch(academy.env, get(
                `/academy/api/account/export?cursor=${encodeURIComponent(firstCursor)}`,
                peerCookie,
            ))).status).toBe(409);

            const lateEventId = crypto.randomUUID();
            insert.run(profile.id, lateEventId, now + 30_000, nonce, ciphertext, 'f'.repeat(64));

            const events = [...first.eventPage.events];
            let cursor: string | null = firstCursor;
            let pageCount = 1;
            while (cursor) {
                const response = await dispatch(academy.env, get(
                    `/academy/api/account/export?cursor=${encodeURIComponent(cursor)}`,
                    primaryCookie,
                ));
                expect(response.status).toBe(200);
                const body = await response.json() as ExportBody;
                events.push(...body.eventPage.events);
                pageCount += 1;
                const usedCursor = cursor;
                cursor = body.eventPage.exportCursor;
                if (pageCount === 2) {
                    expect((await dispatch(academy.env, get(
                        `/academy/api/account/export?cursor=${encodeURIComponent(usedCursor)}`,
                        primaryCookie,
                    ))).status).toBe(409);
                }
                expect(pageCount).toBeLessThan(200);
            }

            expect(pageCount).toBe(121);
            expect(events).toHaveLength(24_001);
            const cursors = events.map(event => event.cursor);
            expect(new Set(cursors).size).toBe(24_001);
            expect(cursors).toEqual(Array.from({ length: 24_001 }, (_, index) => index + 1));
            expect(events.some(event => event.id === lateEventId)).toBe(false);

            for (let attempt = 1; attempt < 120; attempt += 1) {
                expect((await dispatch(academy.env, get('/academy/api/profile/export', primaryCookie))).status).toBe(200);
            }
            expect((await dispatch(academy.env, get('/academy/api/profile/export', primaryCookie))).status).toBe(429);
            expect((await dispatch(academy.env, get('/academy/api/profile/export', peerCookie))).status).toBe(200);
        } finally {
            academy.close();
        }
    }, 30_000);
});

interface ExportBody {
    readonly schemaVersion: number;
    readonly snapshotSemantics?: string;
    readonly eventPage: {
        readonly events: Array<{ readonly cursor: number; readonly id: string }>;
        readonly nextCursor: number;
        readonly hasMore: boolean;
        readonly exportCursor: string | null;
    };
}
