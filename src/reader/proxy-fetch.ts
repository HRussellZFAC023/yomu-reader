import { APP_REPOSITORY_NAME, GITHUB_PAGES_ORIGIN } from './constants';

export interface ProxyFetchOptions extends RequestInit {
    timeoutMs?: number;
    allowPublicProxies?: boolean;
    allowConfiguredProxy?: boolean;
    allowDirectCrossOrigin?: boolean;
}

type ProxyUrlBuilder = (targetUrl: string) => string;
type FetchCandidateKind = 'direct' | 'configured-proxy' | 'public-proxy';
type SpecializedProxyRoute = 'yomu-public-only' | 'jisho-search' | null;

interface FetchUrlCandidate {
    url: string;
    kind: FetchCandidateKind;
}

interface FetchAttempt {
    url: string;
    options: ProxyFetchOptions;
}

export const DEFAULT_YOMU_PUBLIC_PROXY_URL = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';

const BUILT_IN_PROXY_BUILDERS: ProxyUrlBuilder[] = [
    targetUrl => configuredProxyFetchUrl(targetUrl, DEFAULT_YOMU_PUBLIC_PROXY_URL) ?? '',
    targetUrl => allOriginsProxyUrl(targetUrl),
    targetUrl => jishoMarkdownProxyUrl(targetUrl) ?? '',
];

const SENSITIVE_REQUEST_KEY_RE = /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
const READ_METHODS = new Set(['GET', 'HEAD']);
const KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS = new Set([
    'd1pra95f92lrn3.cloudfront.net',
    'd1vjc5dkcd3yh2.cloudfront.net',
]);

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
            const attempt = fetchAttemptForCandidate(targetUrl, candidate, options);
            const response = await fetchWithTimeout(attempt.url, attempt.options);
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

function fetchAttemptForCandidate(targetUrl: string, candidate: FetchUrlCandidate, options: ProxyFetchOptions): FetchAttempt {
    if (candidate.kind === 'direct' || !isJpdbPublicAudioUrl(targetUrl) || !isYomuPublicProxyUrl(candidate.url)) {
        return { url: candidate.url, options };
    }

    return {
        url: proxyControlUrl(candidate.url, options.headers),
        options: {
            ...options,
            headers: stripProxyOnlyHeaders(options.headers, ['x-access', 'x-forcecaf']),
        },
    };
}

function proxyControlUrl(candidateUrl: string, headers: HeadersInit | undefined): string {
    const forceCaf = headerValue(headers, 'x-forcecaf');
    if (!forceCaf) return candidateUrl;
    try {
        const url = new URL(candidateUrl);
        url.searchParams.set('x-forcecaf', forceCaf);
        return url.href;
    } catch {
        return candidateUrl;
    }
}

function stripProxyOnlyHeaders(headers: HeadersInit | undefined, names: string[]): HeadersInit | undefined {
    if (!headers) return headers;
    const excluded = new Set(names.map(name => name.toLowerCase()));
    const sanitized: Record<string, string> = {};
    new Headers(headers).forEach((value, key) => {
        if (!excluded.has(key.toLowerCase())) sanitized[key] = value;
    });
    return Object.keys(sanitized).length ? sanitized : undefined;
}

function headerValue(headers: HeadersInit | undefined, name: string): string {
    if (!headers) return '';
    return new Headers(headers).get(name) ?? '';
}

function fetchUrlCandidates(targetUrl: string, configuredProxyUrl: string, options: ProxyFetchOptions): FetchUrlCandidate[] {
    const direct = directFetchUrl(targetUrl, options);
    const proxySafe = isProxySafeRequest(targetUrl, options);
    const configured = proxySafe && options.allowConfiguredProxy !== false
        ? configuredProxyFetchUrl(targetUrl, configuredProxyUrl)
        : null;
    const publicProxySafe = proxySafe && options.allowPublicProxies !== false;
    const publicProxies = publicProxySafe
        ? builtInProxyUrls(targetUrl, options)
        : [];
    const directCandidate = direct ? { url: direct, kind: 'direct' as const } : null;
    const proxyCandidates = ([
        configured ? { url: configured, kind: 'configured-proxy' as const } : null,
        ...publicProxies.map((url): FetchUrlCandidate => ({ url, kind: 'public-proxy' })),
    ] as Array<FetchUrlCandidate | null>).filter((candidate): candidate is FetchUrlCandidate => Boolean(candidate));
    const orderedCandidates: Array<FetchUrlCandidate | null> = shouldPreferProxyFirst(targetUrl, directCandidate, proxySafe)
        ? [...proxyCandidates, directCandidate]
        : [directCandidate, ...proxyCandidates];
    return uniqueFetchCandidates([
        ...orderedCandidates,
    ]);
}

function directFetchUrl(targetUrl: string, options: ProxyFetchOptions): string | null {
    if (!options.allowDirectCrossOrigin) return browserReadableUrl(targetUrl);
    if (shouldSkipDirectCrossOriginFetch(targetUrl, options)) return browserReadableUrl(targetUrl);
    return targetUrl;
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
    _candidate: FetchUrlCandidate,
    index: number,
    candidates: FetchUrlCandidate[],
): boolean {
    return !response.ok
        && response.status !== 429
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
        allowDirectCrossOrigin: _allowDirectCrossOrigin,
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
        && !isPrivateNetworkTarget(targetUrl)
        && !hasSensitiveUrlParams(targetUrl);
}

function shouldPreferProxyFirst(targetUrl: string, direct: FetchUrlCandidate | null, proxySafe: boolean): boolean {
    return Boolean(direct)
        && proxySafe
        && !isKnownDirectCorsTarget(targetUrl)
        && (isHostedGithubPagesApp() || isAppleTouchBrowser())
        && isCrossOriginHttpUrl(targetUrl);
}

function isKnownDirectCorsTarget(targetUrl: string): boolean {
    try {
        const target = new URL(targetUrl, location.href);
        return [
            'apiv2express.immersionkit.com',
            'apiv2.immersionkit.com',
            'api.nadeshiko.co',
        ].includes(target.hostname);
    } catch {
        return false;
    }
}

export function isKnownCorsBlockedPublicAudioCdnUrl(target: string | URL): boolean {
    try {
        const url = typeof target === 'string'
            ? (typeof location === 'undefined' ? new URL(target) : new URL(target, location.href))
            : target;
        return KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS.has(url.hostname)
            && url.pathname.startsWith('/audio/');
    } catch {
        return false;
    }
}

function shouldSkipDirectCrossOriginFetch(targetUrl: string, options: ProxyFetchOptions): boolean {
    const target = fetchTarget(targetUrl);
    return Boolean(target
        && isCrossOriginHttpTarget(target)
        && specializedProxyRoute(target, requestMethod(options)));
}

function builtInProxyUrls(targetUrl: string, options: ProxyFetchOptions): string[] {
    const specialized = specializedProxyUrls(targetUrl, options);
    const candidates = specialized ?? BUILT_IN_PROXY_BUILDERS.map(builder => builder(targetUrl));
    return candidates.filter(Boolean);
}

function specializedProxyUrls(targetUrl: string, options: ProxyFetchOptions): string[] | null {
    const target = fetchTarget(targetUrl);
    const route = target ? specializedProxyRoute(target, requestMethod(options)) : null;
    if (!target || !route) return null;

    const proxyTargetUrl = target.href;
    if (route === 'jisho-search') {
        return [
            allOriginsProxyUrl(proxyTargetUrl),
            jishoMarkdownProxyUrl(proxyTargetUrl) ?? '',
            yomuPublicProxyUrl(proxyTargetUrl),
        ];
    }
    return [yomuPublicProxyUrl(proxyTargetUrl)];
}

function specializedProxyRoute(target: URL, method: string): SpecializedProxyRoute {
    if (method === 'GET' && target.hostname === 'jisho.org' && target.pathname.startsWith('/search/')) {
        return 'jisho-search';
    }
    if (method === 'GET' && target.hostname === 'assets.languagepod101.com' && target.pathname === '/dictionary/japanese/audiomp3.php') {
        return 'yomu-public-only';
    }
    if (method === 'POST' && target.hostname === 'www.japanesepod101.com' && target.pathname === '/learningcenter/reference/dictionary_post') {
        return 'yomu-public-only';
    }
    if (method === 'GET' && isKnownCorsBlockedPublicAudioCdnUrl(target)) {
        return 'yomu-public-only';
    }
    if (method === 'GET' && target.hostname === 'cdn.innovativelanguage.com' && target.pathname.includes('/learningcenter/audio/')) {
        return 'yomu-public-only';
    }
    if (method === 'GET' && target.hostname === 'jpdb.io' && target.pathname.startsWith('/static/v/')) {
        return 'yomu-public-only';
    }
    return null;
}

function yomuPublicProxyUrl(targetUrl: string): string {
    return configuredProxyFetchUrl(targetUrl, DEFAULT_YOMU_PUBLIC_PROXY_URL) ?? '';
}

function isHostedGithubPagesApp(): boolean {
    if (typeof location === 'undefined') return false;
    try {
        const current = new URL(location.href);
        return current.origin === GITHUB_PAGES_ORIGIN
            && current.pathname.replace(/\/index\.html$/, '/').startsWith(`/${APP_REPOSITORY_NAME}/`);
    } catch {
        return false;
    }
}

function isAppleTouchBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const userAgent = navigator.userAgent ?? '';
    const platform = navigator.platform ?? '';
    return /iPad|iPhone|iPod/i.test(userAgent)
        || (/Macintosh/i.test(userAgent) && /Mac/i.test(platform) && (navigator.maxTouchPoints ?? 0) > 1);
}

function isCrossOriginHttpUrl(targetUrl: string): boolean {
    const target = fetchTarget(targetUrl);
    return Boolean(target && isCrossOriginHttpTarget(target));
}

function isCrossOriginHttpTarget(target: URL): boolean {
    return typeof location !== 'undefined'
        && /^https?:$/i.test(target.protocol)
        && target.origin !== location.origin;
}

function fetchTarget(targetUrl: string): URL | null {
    try {
        return typeof location === 'undefined'
            ? new URL(targetUrl)
            : new URL(targetUrl, location.href);
    } catch {
        return null;
    }
}

function requestMethod(options: ProxyFetchOptions): string {
    return String(options.method ?? 'GET').toUpperCase();
}

function isJpdbPublicAudioUrl(targetUrl: string): boolean {
    try {
        const target = new URL(targetUrl, location.href);
        return (target.hostname === 'jpdb.io' && target.pathname.startsWith('/static/v/'))
            || isKnownCorsBlockedPublicAudioCdnUrl(target);
    } catch {
        return false;
    }
}

function isYomuPublicProxyUrl(candidateUrl: string): boolean {
    try {
        return new URL(candidateUrl).origin === DEFAULT_YOMU_PUBLIC_PROXY_URL;
    } catch {
        return false;
    }
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

function isPrivateNetworkTarget(targetUrl: string): boolean {
    try {
        const url = new URL(targetUrl, location.href);
        return isPrivateHostname(url.hostname);
    } catch {
        return false;
    }
}

function isPrivateHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isIpv6 = host.includes(':');
    return host === 'localhost'
        || host.endsWith('.localhost')
        || /^(?:0|10|127)\./.test(host)
        || /^169\.254\./.test(host)
        || /^192\.168\./.test(host)
        || /^172\.(?:1[6-9]|2\d|3[0-1])\./.test(host)
        || (isIpv6 && (
            host === '::1'
            || host.startsWith('fc')
            || host.startsWith('fd')
            || host.startsWith('fe80:')
        ));
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

function jishoMarkdownProxyUrl(targetUrl: string): string | null {
    try {
        const target = new URL(targetUrl);
        if (target.hostname !== 'jisho.org' || !target.pathname.startsWith('/search/')) return null;
        return `https://r.jina.ai/http://r.jina.ai/http://${target.href}`;
    } catch {
        return null;
    }
}

function allOriginsProxyUrl(targetUrl: string): string {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
}
