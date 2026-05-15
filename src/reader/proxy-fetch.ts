export interface ProxyFetchOptions extends RequestInit {
    timeoutMs?: number;
    allowPublicProxies?: boolean;
    allowConfiguredProxy?: boolean;
}

type ProxyUrlBuilder = (targetUrl: string) => string;
type FetchCandidateKind = 'direct' | 'configured-proxy' | 'public-proxy';

interface FetchUrlCandidate {
    url: string;
    kind: FetchCandidateKind;
}

export const DEFAULT_YOMU_PUBLIC_PROXY_URL = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';

const BUILT_IN_PROXY_BUILDERS: ProxyUrlBuilder[] = [
    targetUrl => `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    targetUrl => `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
];

const SENSITIVE_REQUEST_KEY_RE = /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
const READ_METHODS = new Set(['GET', 'HEAD']);

export function proxyUrlCandidates(targetUrl: string, configuredProxyUrl = '', allowPublicProxies = true): string[] {
    const candidates = [
        configuredProxyFetchUrl(targetUrl, configuredProxyUrl),
        ...(allowPublicProxies ? BUILT_IN_PROXY_BUILDERS.map(builder => builder(targetUrl)) : []),
    ].filter((url): url is string => Boolean(url));
    return [...new Set(candidates)];
}

function configuredProxyFetchUrl(targetUrl: string, configuredProxyUrl: string): string | null {
    const proxyUrl = configuredProxyUrl.trim();
    if (!proxyUrl) return null;
    try {
        const url = new URL(proxyUrl);
        url.searchParams.set('url', targetUrl);
        return url.href;
    } catch {
        return null;
    }
}

export async function fetchWithCorsFallbacks(
    targetUrl: string,
    configuredProxyUrl = '',
    options: ProxyFetchOptions = {},
): Promise<Response> {
    const candidates = fetchUrlCandidates(targetUrl, configuredProxyUrl, options);
    if (!candidates.length) throw new Error('Cross-origin request needs a configured proxy or userscript HTTP bridge.');
    let lastError: unknown;
    for (const [index, candidate] of candidates.entries()) {
        try {
            const response = await fetchWithTimeout(candidate.url, options);
            if (shouldTryNextFetchCandidate(response, candidate, index, candidates)) {
                lastError = new Error(`Proxy request failed (${response.status}).`);
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Cross-origin request failed.');
}

function fetchUrlCandidates(targetUrl: string, configuredProxyUrl: string, options: ProxyFetchOptions): FetchUrlCandidate[] {
    const direct = browserReadableUrl(targetUrl);
    const proxySafe = isProxySafeRequest(targetUrl, options);
    const configured = proxySafe && options.allowConfiguredProxy !== false
        ? configuredProxyFetchUrl(targetUrl, configuredProxyUrl)
        : null;
    const publicProxySafe = proxySafe && options.allowPublicProxies !== false && isReadMethod(options.method);
    const publicProxies = publicProxySafe ? BUILT_IN_PROXY_BUILDERS.map(builder => builder(targetUrl)) : [];
    return uniqueFetchCandidates([
        direct ? { url: direct, kind: 'direct' } : null,
        configured ? { url: configured, kind: 'configured-proxy' } : null,
        ...publicProxies.map(url => ({ url, kind: 'public-proxy' as const })),
    ]);
}

function uniqueFetchCandidates(candidates: Array<FetchUrlCandidate | null>): FetchUrlCandidate[] {
    const seen = new Set<string>();
    return candidates.filter((candidate): candidate is FetchUrlCandidate => {
        if (!candidate || seen.has(candidate.url)) return false;
        seen.add(candidate.url);
        return true;
    });
}

function shouldTryNextFetchCandidate(
    response: Response,
    candidate: FetchUrlCandidate,
    index: number,
    candidates: FetchUrlCandidate[],
): boolean {
    return !response.ok
        && candidate.kind !== 'direct'
        && index < candidates.length - 1;
}

function browserReadableUrl(url: string): string | null {
    if (!isHttpUrl(url)) return url;
    try {
        const target = new URL(url, location.href);
        return target.origin === location.origin ? target.href : null;
    } catch {
        return null;
    }
}

function isHttpUrl(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

function fetchWithTimeout(url: string, options: ProxyFetchOptions): Promise<Response> {
    const {
        timeoutMs,
        allowPublicProxies: _allowPublicProxies,
        allowConfiguredProxy: _allowConfiguredProxy,
        signal,
        ...init
    } = options;
    if (!timeoutMs) return fetch(url, { ...init, signal });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    return fetch(url, { ...init, signal: controller.signal }).finally(() => {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    });
}

function isProxySafeRequest(targetUrl: string, options: ProxyFetchOptions): boolean {
    return !hasSensitiveRequestHeaders(options.headers)
        && !hasCredentialedRequest(options.credentials)
        && !isPrivateJpdbTarget(targetUrl, options)
        && !hasSensitiveUrlParams(targetUrl);
}

function hasSensitiveRequestHeaders(headers: HeadersInit | undefined): boolean {
    if (!headers) return false;
    if (headers instanceof Headers) {
        return Array.from(headers.keys()).some(header => SENSITIVE_REQUEST_KEY_RE.test(header));
    }
    if (Array.isArray(headers)) return headers.some(([header]) => SENSITIVE_REQUEST_KEY_RE.test(header));
    return Object.keys(headers).some(header => SENSITIVE_REQUEST_KEY_RE.test(header));
}

function hasCredentialedRequest(credentials: RequestCredentials | undefined): boolean {
    return credentials === 'include';
}

function isPrivateJpdbTarget(targetUrl: string, options: ProxyFetchOptions): boolean {
    try {
        const url = new URL(targetUrl, location.href);
        if (url.hostname !== 'jpdb.io') return false;
        if (!isReadMethod(options.method)) return true;
        return url.pathname.startsWith('/api/')
            || /^\/(?:prioritize|review|settings|login)(?:\/|$)/.test(url.pathname);
    } catch {
        return false;
    }
}

function hasSensitiveUrlParams(targetUrl: string): boolean {
    try {
        const url = new URL(targetUrl, location.href);
        return Array.from(url.searchParams.keys()).some(key => SENSITIVE_REQUEST_KEY_RE.test(key));
    } catch {
        return false;
    }
}

function isReadMethod(method: RequestInit['method'] | undefined): boolean {
    return READ_METHODS.has(String(method ?? 'GET').toUpperCase());
}
