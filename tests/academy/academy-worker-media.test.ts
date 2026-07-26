// @vitest-environment node
import { errorResponse } from '../../workers/yomu-academy/src/http';
import { handleMedia, MEDIA_MANIFEST, parseMediaManifest, type MediaManifest } from '../../workers/yomu-academy/src/media';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import type { Env } from '../../workers/yomu-academy/src/env';
import { createFakeAcademy, jsonRequest, type FakeAcademy } from './helpers/fake-academy-env';

const bytes = new TextEncoder().encode('0123456789abcdef');
const sha = 'a'.repeat(64);
const manifest: MediaManifest = {
    version: 1,
    bucket: 'yomu-academy-media',
    objects: [{
        key: 'media/audio/persona/theme/evening.m4a',
        contentType: 'audio/mp4',
        bytes: bytes.length,
        sha256: sha,
    }],
};

async function authedAcademy(): Promise<{ academy: FakeAcademy; cookie: string }> {
    const academy = createFakeAcademy();
    academy.db.invites.push({
        id: 'invite-1',
        code_hash: await inviteCodeHash(academy.env, 'OPEN2026'),
        uses_remaining: 5,
        kind: 'seed',
        created_at: 0,
        expires_at: null,
        revoked_at: null,
        purchase_id: null,
        account_required: 1,
    });
    const session = await handleCreateSession(jsonRequest('/academy/api/session', { code: 'OPEN2026' }), academy.env, Date.now);
    const cookie = (session.headers.get('set-cookie') ?? '').split(';')[0];
    // Media requires a signed-in account for every invite kind.
    academy.db.sessions[0].account_id = 'acct-media-1';
    academy.db.academyGrants.add('acct-media-1');
    academy.bucket.put('media/audio/persona/theme/evening.m4a', bytes);
    return { academy, cookie };
}

async function media(env: Env, path: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
    const request = new Request(`https://yomureader.com${path}`, init);
    try {
        return await handleMedia(request, env, Date.now, manifest);
    } catch (error) {
        return errorResponse(error);
    }
}

describe('Academy Worker protected media', () => {
    it('requires an authenticated session', async () => {
        const { academy } = await authedAcademy();
        expect((await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a')).status).toBe(401);
        const stolen = { headers: { cookie: '__Host-academy_session=forged-token' } };
        expect((await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', stolen)).status).toBe(401);
    });

    it('rejects invite sessions that have not signed in with an account', async () => {
        const { academy } = await authedAcademy();
        const unauthenticated = await handleCreateSession(
            jsonRequest('/academy/api/session', { code: 'OPEN2026' }), academy.env, Date.now,
        );
        const cookie = (unauthenticated.headers.get('set-cookie') ?? '').split(';')[0];
        expect((await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie } })).status).toBe(401);
    });

    it('serves only allowlisted keys with private cache headers, no traversal', async () => {
        const { academy, cookie } = await authedAcademy();
        academy.bucket.put('secret/other.m4a', bytes);

        const ok = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie } });
        expect(ok.status).toBe(200);
        expect(ok.headers.get('content-type')).toBe('audio/mp4');
        expect(ok.headers.get('content-length')).toBe(String(bytes.length));
        expect(ok.headers.get('cache-control')).toBe('private, max-age=3600');
        expect(ok.headers.get('vary')).toBe('Cookie');
        expect(ok.headers.get('accept-ranges')).toBe('bytes');
        expect(new Uint8Array(await ok.arrayBuffer())).toEqual(bytes);

        for (const path of [
            '/academy/media/audio/secret/other.m4a',
            '/academy/media/audio/../secret/other.m4a',
            '/academy/media/audio/persona/theme/evening.m4a/extra',
            '/academy/media/audio/%2e%2e/secret/other.m4a',
        ]) {
            expect((await media(academy.env, path, { headers: { cookie } })).status, path).toBe(404);
        }
        expect((await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { method: 'POST', headers: { cookie } })).status).toBe(405);
    });

    it('supports HEAD, single byte ranges, and rejects unsatisfiable ranges', async () => {
        const { academy, cookie } = await authedAcademy();

        const head = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { method: 'HEAD', headers: { cookie } });
        expect(head.status).toBe(200);
        expect(head.headers.get('content-length')).toBe(String(bytes.length));
        expect(await head.text()).toBe('');

        const partial = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie, range: 'bytes=4-7' } });
        expect(partial.status).toBe(206);
        expect(partial.headers.get('content-range')).toBe(`bytes 4-7/${bytes.length}`);
        expect(partial.headers.get('content-length')).toBe('4');
        expect(await partial.text()).toBe('4567');

        const suffix = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie, range: 'bytes=-4' } });
        expect(suffix.status).toBe(206);
        expect(await suffix.text()).toBe('cdef');

        // Multi-range degrades to a full 200; out-of-bounds start is 416.
        const multi = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie, range: 'bytes=0-1,4-5' } });
        expect(multi.status).toBe(200);
        const beyond = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie, range: 'bytes=999-' } });
        expect(beyond.status).toBe(416);
        expect(beyond.headers.get('content-range')).toBe(`bytes */${bytes.length}`);
    });

    it('serves manifest-hash ETags and honours If-None-Match', async () => {
        const { academy, cookie } = await authedAcademy();
        const first = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', { headers: { cookie } });
        expect(first.headers.get('etag')).toBe(`"${sha}"`);

        const cached = await media(academy.env, '/academy/media/audio/persona/theme/evening.m4a', {
            headers: { cookie, 'if-none-match': `"${sha}"` },
        });
        expect(cached.status).toBe(304);
        expect(await cached.text()).toBe('');
    });
});

describe('Academy media manifest integrity', () => {
    it('accepts the checked-in manifest and pins its shape', () => {
        expect(MEDIA_MANIFEST.version).toBe(1);
        expect(MEDIA_MANIFEST.bucket).toBe('yomu-academy-archive');
        expect(MEDIA_MANIFEST.objects).toHaveLength(27);
        for (const object of MEDIA_MANIFEST.objects) {
            expect(object.key).toMatch(/^[a-z0-9][a-z0-9/_.-]*$/);
            expect(object.sha256).toMatch(/^[a-f0-9]{64}$/);
            expect(object.bytes).toBeGreaterThan(0);
            expect(object.contentType).toMatch(/^audio\/(?:flac|wav)$/);
        }
    });

    it('rejects malformed manifests loudly', () => {
        expect(() => parseMediaManifest({ version: 2, bucket: 'b', objects: [] })).toThrow(/version/);
        expect(() => parseMediaManifest({ version: 1, bucket: '', objects: [] })).toThrow(/bucket/);
        const bad = (entry: Record<string, unknown>): unknown => ({ version: 1, bucket: 'b', objects: [entry] });
        expect(() => parseMediaManifest(bad({ key: '../escape', contentType: 'audio/mp4', bytes: 1, sha256: sha }))).toThrow(/invalid/);
        expect(() => parseMediaManifest(bad({ key: 'ok/a.m4a', contentType: 'audio/mp4', bytes: 1, sha256: 'nothex' }))).toThrow(/invalid/);
        expect(() => parseMediaManifest({
            version: 1,
            bucket: 'b',
            objects: [
                { key: 'dup.m4a', contentType: 'audio/mp4', bytes: 1, sha256: sha },
                { key: 'dup.m4a', contentType: 'audio/mp4', bytes: 2, sha256: sha },
            ],
        })).toThrow(/duplicate/i);
        expect(() => parseMediaManifest({
            version: 1,
            bucket: 'b',
            objects: [
                { key: 'v1/cue.wav', contentType: 'audio/wav', bytes: 1, sha256: sha },
                { key: 'media/audio/v1/cue.wav', contentType: 'audio/wav', bytes: 1, sha256: sha },
            ],
        })).toThrow(/public route/i);
    });
});
