import type { ExecutionContext } from '../../../workers/yomu-academy/src/cf';
import type { Env } from '../../../workers/yomu-academy/src/env';

export interface AcademyWorker {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

const context: ExecutionContext = {
    waitUntil(promise): void {
        void promise.catch(() => undefined);
    },
};

/** Browser-shaped same-origin client for Academy contract integration tests. */
export class AcademyAccessBrowser {
    private readonly cookies = new Map<string, string>();
    private url: string;

    constructor(
        private readonly worker: AcademyWorker,
        private readonly env: Env,
    ) {
        this.url = `${env.ACADEMY_ORIGIN}/academy/`;
    }

    get location(): string { return this.url; }

    navigate = (url: string): void => {
        this.url = new URL(url, this.env.ACADEMY_ORIGIN).href;
    };

    replaceUrl = (url: string): void => {
        this.url = new URL(url, this.url).href;
    };

    request = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const inherited = input instanceof Request ? input : undefined;
        const url = new URL(inherited?.url ?? String(input), this.env.ACADEMY_ORIGIN);
        const headers = new Headers(init?.headers ?? inherited?.headers);
        headers.set('cf-connecting-ip', '198.51.100.24');
        headers.set('sec-fetch-site', 'same-origin');
        if (this.cookies.size > 0) headers.set('cookie', this.cookieHeader());
        const method = init?.method ?? inherited?.method ?? 'GET';
        if (method !== 'GET' && method !== 'HEAD') headers.set('origin', this.env.ACADEMY_ORIGIN);
        const response = await this.worker.fetch(new Request(url, {
            method,
            headers,
            body: init?.body ?? (inherited && inherited.method !== 'GET' && inherited.method !== 'HEAD' ? inherited.body : undefined),
        }), this.env, context);
        this.captureCookie(response);
        return response;
    };

    async followGoogleCallback(subject: string, provider: TestGoogleOidcProvider): Promise<Response> {
        const start = await this.request('/academy/api/auth/google/start');
        if (start.status !== 302) throw new Error(`Google start failed with ${start.status}.`);
        const authorization = new URL(start.headers.get('location') ?? '');
        await provider.setIdentity(
            this.env,
            authorization.searchParams.get('nonce') ?? '',
            subject,
        );
        const callback = new URL('/academy/api/auth/google/callback', this.env.ACADEMY_ORIGIN);
        callback.searchParams.set('code', 'test-authorization-code');
        callback.searchParams.set('state', authorization.searchParams.get('state') ?? '');
        callback.searchParams.set('iss', 'https://accounts.google.com');
        const response = await this.request(callback);
        if (response.status === 302) this.navigate(response.headers.get('location') ?? '/academy/');
        return response;
    }

    private cookieHeader(): string {
        return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    private captureCookie(response: Response): void {
        const setCookie = response.headers.get('set-cookie');
        if (!setCookie) return;
        const [pair, ...attributes] = setCookie.split(';').map(part => part.trim());
        const separator = pair.indexOf('=');
        if (separator <= 0) return;
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (attributes.some(attribute => attribute.toLowerCase() === 'max-age=0')) this.cookies.delete(name);
        else this.cookies.set(name, value);
    }
}

/** Signed OIDC fixtures keep Google traffic and identity data entirely local. */
export class TestGoogleOidcProvider {
    private readonly signingKey = crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
    );
    private idToken = '';
    private jwk: JsonWebKey | null = null;

    fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url === 'https://oauth2.googleapis.com/token') return json({ id_token: this.idToken });
        if (url === 'https://www.googleapis.com/oauth2/v3/certs' && this.jwk) return json({ keys: [this.jwk] });
        throw new Error(`Unexpected Google request: ${url}`);
    };

    async setIdentity(env: Env, nonce: string, subject: string): Promise<void> {
        const pair = await this.signingKey;
        const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
        Object.assign(jwk, { kid: 'academy-access-e2e-key', alg: 'RS256', use: 'sig' });
        const now = Math.floor(Date.now() / 1000);
        const encode = (value: unknown): string => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
        const header = encode({ alg: 'RS256', kid: 'academy-access-e2e-key' });
        const claims = encode({
            iss: 'https://accounts.google.com',
            aud: env.GOOGLE_OIDC_CLIENT_ID,
            exp: now + 3600,
            iat: now,
            nonce,
            sub: subject,
        });
        const signature = await crypto.subtle.sign(
            { name: 'RSASSA-PKCS1-v1_5' }, pair.privateKey, new TextEncoder().encode(`${header}.${claims}`),
        );
        this.idToken = `${header}.${claims}.${toBase64Url(new Uint8Array(signature))}`;
        this.jwk = jwk;
    }
}

function json(value: unknown): Response {
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

function toBase64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
