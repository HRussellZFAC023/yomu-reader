// @vitest-environment node
import { toBase64Url, sha256Base64Url } from '../../workers/yomu-academy/src/crypto';
import { handleGoogleCallback, handleGoogleStart } from '../../workers/yomu-academy/src/oauth';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import { createFakeAcademy, jsonRequest } from './helpers/fake-academy-env';

const now = Date.UTC(2026, 6, 12, 12);

async function sessionFixture() {
    const academy = createFakeAcademy();
    academy.db.classes.push({ id: 'ucl-2026', name: 'UCL Japanese 2026', created_at: now, archived_at: null });
    academy.db.invites.push({
        id: 'invite-ucl', code_hash: await inviteCodeHash(academy.env, 'UCL2026'), uses_remaining: 10,
        kind: 'seed', created_at: now - 1, expires_at: null, revoked_at: null, purchase_id: null, class_id: 'ucl-2026',
    });
    const response = await handleCreateSession(jsonRequest('/academy/api/session', { code: 'UCL2026' }), academy.env, () => now);
    return { academy, sessionCookie: (response.headers.get('set-cookie') ?? '').split(';')[0] };
}

async function signedIdToken(nonce: string) {
    const pair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    Object.assign(jwk, { kid: 'oidc-test-key', alg: 'RS256', use: 'sig' });
    const encode = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
    const head = encode({ alg: 'RS256', kid: 'oidc-test-key' });
    const body = encode({
        iss: 'https://accounts.google.com', aud: 'test.apps.googleusercontent.com',
        exp: Math.floor(now / 1000) + 3600, iat: Math.floor(now / 1000), nonce,
        sub: 'google-sub-private', email: 'never-store@example.invalid', name: 'Never Store',
    });
    const signature = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, new TextEncoder().encode(`${head}.${body}`),
    );
    return { token: `${head}.${body}.${toBase64Url(new Uint8Array(signature))}`, jwk };
}

describe('Academy Google OIDC flow', () => {
    it('issues PKCE/state/nonce, validates callback once, and stores no Google profile data', async () => {
        const { academy, sessionCookie } = await sessionFixture();
        const startRequest = new Request('https://yomureader.com/academy/api/auth/google/start', {
            headers: { cookie: sessionCookie, 'sec-fetch-site': 'same-origin' },
        });
        const start = await handleGoogleStart(startRequest, academy.env, () => now);
        expect(start.status).toBe(302);
        const auth = new URL(start.headers.get('location') ?? '');
        expect(auth.origin).toBe('https://accounts.google.com');
        expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
        expect(auth.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(auth.searchParams.get('nonce')).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(auth.searchParams.get('scope')).toBe('openid');
        const flowCookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
        expect(start.headers.get('set-cookie')).toContain('HttpOnly');

        const nonce = auth.searchParams.get('nonce') ?? '';
        const signed = await signedIdToken(nonce);
        let verifierSeen = '';
        const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth2.googleapis.com/token') {
                const form = init?.body as URLSearchParams;
                verifierSeen = form.get('code_verifier') ?? '';
                return new Response(JSON.stringify({ id_token: signed.token }), { status: 200 });
            }
            if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
                return new Response(JSON.stringify({ keys: [signed.jwk] }), { status: 200 });
            }
            throw new Error(`unexpected fetch ${url}`);
        };
        const callbackUrl = new URL('https://yomureader.com/academy/api/auth/google/callback');
        callbackUrl.searchParams.set('code', 'google-code');
        callbackUrl.searchParams.set('state', auth.searchParams.get('state') ?? '');
        callbackUrl.searchParams.set('iss', 'https://accounts.google.com');
        const callbackRequest = new Request(callbackUrl, { headers: { cookie: `${sessionCookie}; ${flowCookie}` } });
        const callback = await handleGoogleCallback(callbackRequest, academy.env, () => now + 1, fetcher);
        expect(callback.status).toBe(302);
        expect(callback.headers.get('location')).toBe('https://yomureader.com/academy/?account=linked');
        expect(await sha256Base64Url(verifierSeen)).toBe(auth.searchParams.get('code_challenge'));
        expect(academy.db.accounts).toHaveLength(1);
        expect(academy.db.accounts[0].google_sub_hash).not.toContain('google-sub-private');
        expect(JSON.stringify(academy.db.accounts[0])).not.toContain('never-store@example.invalid');
        expect(JSON.stringify(academy.db.accounts[0])).not.toContain('Never Store');

        await expect(handleGoogleCallback(callbackRequest, academy.env, () => now + 2, fetcher)).rejects.toMatchObject({ status: 400 });
    });

    it('rejects cross-site starts and state substitution', async () => {
        const { academy, sessionCookie } = await sessionFixture();
        const crossSite = new Request('https://yomureader.com/academy/api/auth/google/start', {
            headers: { cookie: sessionCookie, 'sec-fetch-site': 'cross-site' },
        });
        await expect(handleGoogleStart(crossSite, academy.env, () => now)).rejects.toMatchObject({ status: 403 });

        const start = await handleGoogleStart(new Request('https://yomureader.com/academy/api/auth/google/start', {
            headers: { cookie: sessionCookie, 'sec-fetch-site': 'same-origin' },
        }), academy.env, () => now);
        const flowCookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
        const callback = new Request('https://yomureader.com/academy/api/auth/google/callback?code=x&state=substituted', {
            headers: { cookie: `${sessionCookie}; ${flowCookie}` },
        });
        await expect(handleGoogleCallback(callback, academy.env, () => now + 1, async () => new Response())).rejects.toMatchObject({ status: 400 });
    });
});
