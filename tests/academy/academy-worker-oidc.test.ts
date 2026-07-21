// @vitest-environment node
import { toBase64Url, sha256Base64Url } from '../../workers/yomu-academy/src/crypto';
import { handleGoogleCallback, handleGoogleStart } from '../../workers/yomu-academy/src/oauth';
import { inviteCodeHash } from '../../workers/yomu-academy/src/invites';
import { handleCreateSession } from '../../workers/yomu-academy/src/sessions';
import { createSqliteAcademy } from './helpers/sqlite-academy-env';
import worker from '../../workers/yomu-academy/src/index';

const now = Date.UTC(2026, 6, 12, 12);

async function sessionFixture() {
    const academy = createSqliteAcademy();
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO classes (id, name, created_at) VALUES (?1, ?2, ?3)',
    ).bind('ucl-2026', 'UCL Japanese 2026', now).run();
    await academy.env.ACADEMY_DB.prepare(
        'INSERT INTO invites '
        + '(id, code_hash, uses_remaining, kind, created_at, expires_at, purchase_id, account_required, class_id) '
        + "VALUES ('invite-ucl', ?1, 10, 'seed', ?2, NULL, NULL, 1, 'ucl-2026')",
    ).bind(await inviteCodeHash(academy.env, 'OPEN2026'), now - 1).run();
    const response = await handleCreateSession(jsonRequest('/academy/api/session', { code: 'OPEN2026' }), academy.env, () => now);
    return { academy, sessionCookie: (response.headers.get('set-cookie') ?? '').split(';')[0] };
}

function jsonRequest(path: string, body: unknown): Request {
    return new Request(`https://yomureader.com${path}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
            'cf-connecting-ip': '198.51.100.24',
        },
        body: JSON.stringify(body),
    });
}

async function signedIdToken(nonce: string, clientId: string) {
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
        iss: 'https://accounts.google.com', aud: clientId,
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
        const signed = await signedIdToken(nonce, academy.env.GOOGLE_OIDC_CLIENT_ID);
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
        const accounts = academy.db.rows<Record<string, unknown>>('SELECT * FROM accounts');
        expect(accounts).toHaveLength(1);
        expect(accounts[0]?.google_sub_hash).not.toContain('google-sub-private');
        expect(JSON.stringify(accounts[0])).not.toContain('never-store@example.invalid');
        expect(JSON.stringify(accounts[0])).not.toContain('Never Store');

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
        const missingIssuer = new URL('https://yomureader.com/academy/api/auth/google/callback');
        missingIssuer.searchParams.set('code', 'x');
        missingIssuer.searchParams.set('state', new URL(start.headers.get('location') ?? '').searchParams.get('state') ?? '');
        await expect(handleGoogleCallback(new Request(missingIssuer, {
            headers: { cookie: `${sessionCookie}; ${flowCookie}` },
        }), academy.env, () => now + 1, async () => new Response())).rejects.toMatchObject({ status: 400 });

        const callback = new Request('https://yomureader.com/academy/api/auth/google/callback?code=x&state=substituted&iss=https%3A%2F%2Faccounts.google.com', {
            headers: { cookie: `${sessionCookie}; ${flowCookie}` },
        });
        await expect(handleGoogleCallback(callback, academy.env, () => now + 1, async () => new Response())).rejects.toMatchObject({ status: 400 });
    });

    it('scrubs provider parameters from failed callbacks at the deployed Worker boundary', async () => {
        const { academy, sessionCookie } = await sessionFixture();
        const start = await handleGoogleStart(new Request('https://yomureader.com/academy/api/auth/google/start', {
            headers: { cookie: sessionCookie, 'sec-fetch-site': 'same-origin' },
        }), academy.env, () => now);
        const flowCookie = (start.headers.get('set-cookie') ?? '').split(';')[0];
        const failedUrl = new URL('https://yomureader.com/academy/api/auth/google/callback');
        failedUrl.searchParams.set('code', 'authorization-code-must-disappear');
        failedUrl.searchParams.set('state', 'substituted-state-must-disappear');
        failedUrl.searchParams.set('iss', 'https://accounts.google.com');

        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const response = await worker.fetch(new Request(failedUrl, {
            headers: { cookie: `${sessionCookie}; ${flowCookie}`, 'cf-connecting-ip': '198.51.100.24' },
        }), academy.env, { waitUntil: () => undefined });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/academy/?account=failed');
        expect(response.headers.get('location')).not.toMatch(/authorization-code|substituted-state/u);
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(response.headers.get('set-cookie')).toContain('__Host-academy_oidc=;');
        expect(await response.text()).toBe('');
        expect(warning).toHaveBeenCalledWith('academy_google_callback_failed:identity_rejected');
        expect(JSON.stringify(warning.mock.calls)).not.toMatch(/authorization-code|substituted-state|google-sub|never-store/iu);
        warning.mockRestore();
    });

    it('rejects configured redirect origins containing paths or non-HTTPS schemes', async () => {
        const { academy, sessionCookie } = await sessionFixture();
        const request = new Request('https://yomureader.com/academy/api/auth/google/start', {
            headers: { cookie: sessionCookie, 'sec-fetch-site': 'same-origin' },
        });
        await expect(handleGoogleStart(request, { ...academy.env, ACADEMY_ORIGIN: 'https://yomureader.com/elsewhere' }, () => now))
            .rejects.toMatchObject({ status: 503 });
        await expect(handleGoogleStart(request, { ...academy.env, ACADEMY_ORIGIN: 'http://yomureader.com' }, () => now))
            .rejects.toMatchObject({ status: 503 });
    });
});
