import { fromBase64Url, hmacSha256Hex, randomToken, sha256Base64Url, timingSafeEqual } from './crypto';
import type { Clock, Env } from './env';
import { clearHostCookie, hostCookie, HttpError, readBoundedText } from './http';
import { linkGoogleSubject } from './accounts';
import { clientSubject, enforceRateLimit, OAUTH_RATE } from './rate-limit';
import { activeSession } from './sessions';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const FLOW_COOKIE = '__Host-academy_oidc';
const FLOW_TTL_MS = 10 * 60_000;
const MAX_JWT_BYTES = 24_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface FlowCookie {
    readonly state: string;
    readonly nonce: string;
    readonly verifier: string;
}

interface GoogleClaims {
    readonly iss: string;
    readonly aud: string | string[];
    readonly azp?: string;
    readonly exp: number;
    readonly iat: number;
    readonly nonce: string;
    readonly sub: string;
}

interface GoogleJwk extends JsonWebKey {
    readonly kid?: string;
    readonly alg?: string;
    readonly use?: string;
}

let cachedJwks: { expiresAt: number; keys: GoogleJwk[] } | null = null;

export async function handleGoogleStart(request: Request, env: Env, clock: Clock): Promise<Response> {
    if (request.headers.get('sec-fetch-site') !== 'same-origin') {
        throw new HttpError(403, 'Google sign-in must begin inside Academy.');
    }
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), OAUTH_RATE, now);
    const session = await activeSession(request, env, now);
    if (!session) throw new HttpError(401, 'Start account recovery or enter an Academy code first.');
    assertGoogleConfig(env);

    const flow: FlowCookie = { state: randomToken(32), nonce: randomToken(32), verifier: randomToken(48) };
    await env.ACADEMY_DB.batch([
        env.ACADEMY_DB.prepare(
            'DELETE FROM oauth_flows WHERE expires_at <= ?1 OR (consumed_at IS NOT NULL AND consumed_at <= ?2)',
        ).bind(now, now - FLOW_TTL_MS),
        env.ACADEMY_DB.prepare(
            'INSERT INTO oauth_flows (state_hash, session_public_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)',
        ).bind(await flowStateHash(env, flow.state), session.public_id, now, now + FLOW_TTL_MS),
    ]);

    const callback = callbackUrl(env);
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
        client_id: env.GOOGLE_OIDC_CLIENT_ID,
        redirect_uri: callback,
        response_type: 'code',
        scope: 'openid',
        access_type: 'online',
        include_granted_scopes: 'false',
        state: flow.state,
        nonce: flow.nonce,
        code_challenge: await sha256Base64Url(flow.verifier),
        code_challenge_method: 'S256',
    }).toString();
    return redirect(url.toString(), hostCookie(FLOW_COOKIE, serializeFlow(flow), FLOW_TTL_MS / 1000));
}

export async function handleGoogleCallback(
    request: Request,
    env: Env,
    clock: Clock,
    fetcher: Fetcher = fetch,
): Promise<Response> {
    const now = clock();
    await enforceRateLimit(env, await clientSubject(request, env), OAUTH_RATE, now);
    const session = await activeSession(request, env, now);
    if (!session) throw new HttpError(401, 'Your Academy session expired.');
    assertGoogleConfig(env);

    const url = new URL(request.url);
    if (url.searchParams.has('error')) throw new HttpError(400, 'Google sign-in was not completed.');
    const code = url.searchParams.get('code') ?? '';
    const returnedState = url.searchParams.get('state') ?? '';
    const returnedIssuer = url.searchParams.get('iss');
    if (!code || code.length > 2048 || !returnedState || returnedIssuer !== 'https://accounts.google.com') {
        throw new HttpError(400, 'Google sign-in response was invalid.');
    }

    const flow = readFlowCookie(request);
    if (!flow || !(await timingSafeEqual(returnedState, flow.state))) throw new HttpError(400, 'Google sign-in state expired.');
    const consumed = await env.ACADEMY_DB.prepare(
        'UPDATE oauth_flows SET consumed_at = ?1 WHERE state_hash = ?2 AND session_public_id = ?3 '
        + 'AND consumed_at IS NULL AND expires_at > ?1 RETURNING state_hash',
    ).bind(now, await flowStateHash(env, flow.state), session.public_id).run();
    if ((consumed.meta.changes ?? 0) !== 1) throw new HttpError(400, 'Google sign-in state expired.');

    let tokenResponse: Response;
    try {
        tokenResponse = await fetcher(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
            body: new URLSearchParams({
                code,
                client_id: env.GOOGLE_OIDC_CLIENT_ID,
                client_secret: env.GOOGLE_OIDC_CLIENT_SECRET,
                redirect_uri: callbackUrl(env),
                grant_type: 'authorization_code',
                code_verifier: flow.verifier,
            }),
        });
    } catch {
        throw new HttpError(502, 'Google sign-in could not be verified.');
    }
    let tokenText: string;
    try {
        tokenText = await readBoundedText(tokenResponse, 64_000);
    } catch {
        throw new HttpError(502, 'Google sign-in could not be verified.');
    }
    if (!tokenResponse.ok) throw new HttpError(502, 'Google sign-in could not be verified.');
    let tokenBody: unknown;
    try {
        tokenBody = JSON.parse(tokenText);
    } catch {
        throw new HttpError(502, 'Google sign-in could not be verified.');
    }
    const idToken = isRecord(tokenBody) && typeof tokenBody.id_token === 'string' ? tokenBody.id_token : '';
    const claims = await verifyGoogleIdToken(idToken, env.GOOGLE_OIDC_CLIENT_ID, flow.nonce, now, fetcher);
    await linkGoogleSubject(env, session, claims.sub, now);

    return redirect(`${env.ACADEMY_ORIGIN}/academy/?account=linked`, clearHostCookie(FLOW_COOKIE));
}

/** Verify Google's RS256 signature and the complete OIDC claim set we rely on. */
export async function verifyGoogleIdToken(
    token: string,
    clientId: string,
    expectedNonce: string,
    now: number,
    fetcher: Fetcher = fetch,
): Promise<GoogleClaims> {
    if (!token || token.length > MAX_JWT_BYTES) throw new HttpError(401, 'Google identity token was invalid.');
    const parts = token.split('.');
    if (parts.length !== 3) throw new HttpError(401, 'Google identity token was invalid.');
    let header: unknown;
    let claims: unknown;
    try {
        header = JSON.parse(decoder.decode(fromBase64Url(parts[0])));
        claims = JSON.parse(decoder.decode(fromBase64Url(parts[1])));
    } catch {
        throw new HttpError(401, 'Google identity token was invalid.');
    }
    if (!isRecord(header) || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
        throw new HttpError(401, 'Google identity token was invalid.');
    }
    const keys = await googleJwks(fetcher, now);
    const jwk = keys.find(key => key.kid === header.kid && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (!jwk) throw new HttpError(401, 'Google identity token was invalid.');
    const key = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    const validSignature = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' }, key, fromBase64Url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!validSignature || !isGoogleClaims(claims)) throw new HttpError(401, 'Google identity token was invalid.');

    const nowSeconds = Math.floor(now / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
        !GOOGLE_ISSUERS.has(claims.iss)
        || !audience.includes(clientId)
        || ((audience.length > 1 || claims.azp !== undefined) && claims.azp !== clientId)
        || claims.exp <= nowSeconds
        || claims.iat > nowSeconds + 300
        || claims.iat < nowSeconds - 86_400
        || !(await timingSafeEqual(claims.nonce, expectedNonce))
    ) {
        throw new HttpError(401, 'Google identity token was invalid.');
    }
    // Deliberately project the verified token to the minimum identity shape;
    // email, Google name, photo, locale, and all other profile claims die here.
    return {
        iss: claims.iss,
        aud: claims.aud,
        ...(claims.azp ? { azp: claims.azp } : {}),
        exp: claims.exp,
        iat: claims.iat,
        nonce: claims.nonce,
        sub: claims.sub,
    };
}

function isGoogleClaims(value: unknown): value is GoogleClaims {
    return isRecord(value)
        && typeof value.iss === 'string'
        && (typeof value.aud === 'string' || (Array.isArray(value.aud) && value.aud.every(item => typeof item === 'string')))
        && (value.azp === undefined || typeof value.azp === 'string')
        && typeof value.exp === 'number' && Number.isSafeInteger(value.exp)
        && typeof value.iat === 'number' && Number.isSafeInteger(value.iat)
        && typeof value.nonce === 'string' && value.nonce.length >= 20
        && typeof value.sub === 'string' && value.sub.length > 0 && value.sub.length <= 255;
}

async function googleJwks(fetcher: Fetcher, now: number): Promise<GoogleJwk[]> {
    if (fetcher === fetch && cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.keys;
    let response: Response;
    try {
        response = await fetcher(JWKS_ENDPOINT, { headers: { accept: 'application/json' } });
    } catch {
        throw new HttpError(502, 'Google signing keys were unavailable.');
    }
    let text: string;
    try {
        text = await readBoundedText(response, 128_000);
    } catch {
        throw new HttpError(502, 'Google signing keys were unavailable.');
    }
    if (!response.ok) throw new HttpError(502, 'Google signing keys were unavailable.');
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        throw new HttpError(502, 'Google signing keys were unavailable.');
    }
    if (!isRecord(body) || !Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 20) {
        throw new HttpError(502, 'Google signing keys were unavailable.');
    }
    const keys = body.keys.filter((key): key is GoogleJwk => isRecord(key) && typeof key.kty === 'string');
    if (keys.length !== body.keys.length) throw new HttpError(502, 'Google signing keys were unavailable.');
    if (fetcher === fetch) {
        const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '');
        cachedJwks = { expiresAt: now + Math.min(Number(maxAge?.[1] ?? 300), 86_400) * 1000, keys };
    }
    return keys;
}

function serializeFlow(flow: FlowCookie): string {
    return `v1.${flow.state}.${flow.nonce}.${flow.verifier}`;
}

function readFlowCookie(request: Request): FlowCookie | null {
    const header = request.headers.get('cookie') ?? '';
    const value = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${FLOW_COOKIE}=`))?.slice(FLOW_COOKIE.length + 1);
    if (!value) return null;
    const [version, state, nonce, verifier, extra] = value.split('.');
    if (version !== 'v1' || extra !== undefined || !validRandom(state, 43, 43) || !validRandom(nonce, 43, 43) || !validRandom(verifier, 64, 64)) return null;
    return { state, nonce, verifier };
}

function validRandom(value: string | undefined, min: number, max: number): value is string {
    return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

async function flowStateHash(env: Env, state: string): Promise<string> {
    return hmacSha256Hex(env.ACADEMY_INVITE_HMAC_KEY, `oauth-state:${state}`);
}

function callbackUrl(env: Env): string {
    return `${env.ACADEMY_ORIGIN}/academy/api/auth/google/callback`;
}

function assertGoogleConfig(env: Env): void {
    if (!env.GOOGLE_OIDC_CLIENT_ID?.endsWith('.apps.googleusercontent.com') || !env.GOOGLE_OIDC_CLIENT_SECRET) {
        throw new HttpError(503, 'Google account linking is not configured.');
    }
}

function redirect(location: string, cookie: string): Response {
    return new Response(null, {
        status: 302,
        headers: {
            location,
            'set-cookie': cookie,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
        },
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
