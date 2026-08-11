import { APP_REPOSITORY_NAME, DOCS_ORIGIN, GITHUB_PAGES_ORIGIN } from '../app/constants';
import { isAppleTouchBrowser } from '../platform/browser';
import { isPrivateOrLocalHostname } from './private-host';
import { attempt } from '../core/attempt';

interface ProxyRuleOptions {
    method?: RequestInit['method'];
    headers?: HeadersInit;
    credentials?: RequestCredentials;
}

const SENSITIVE_REQUEST_KEY_RE = /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
const READ_METHODS = new Set(['GET', 'HEAD']);
const IMMERSION_KIT_API_HOSTS = new Set([
    'apiv2express.immersionkit.com',
    'apiv2.immersionkit.com',
]);
const KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS = new Set([
    'd1pra95f92lrn3.cloudfront.net',
    'd1vjc5dkcd3yh2.cloudfront.net',
    // Bunpro pronunciation CDN: public (HTTP 200 without auth) but returns no
    // access-control-allow-origin header, so browser fetch()/Web-Audio paths
    // must go through the worker proxy; direct <audio src> playback is fine.
    'dk3kgylsgq3k1.cloudfront.net',
]);
const YOMU_PUBLIC_PROXY_HOSTS = new Set([
    'yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev',
    'edge.yomureader.com',
    'proxy.yomureader.com',
]);
export const YOMU_SHARED_PUBLIC_PROXY_URL = 'https://edge.yomureader.com/';
const YOMU_SHARED_PUBLIC_PROXY_FALLBACK_URLS = [
    YOMU_SHARED_PUBLIC_PROXY_URL,
    'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/',
];

export function configuredProxyFetchUrl(targetUrl: string, configuredProxyUrl: string): string | null {
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

export function isProxySafeRequest(targetUrl: string, options: ProxyRuleOptions): boolean {
    return !hasSensitiveRequestHeaders(options.headers)
        && !hasCredentialedRequest(options.credentials)
        && !isPrivateJpdbTarget(targetUrl, options)
        && !isPrivateNetworkTarget(targetUrl)
        && !hasSensitiveUrlParams(targetUrl);
}

export function isSharedPublicProxySafeRequest(targetUrl: string, options: ProxyRuleOptions): boolean {
    const target = fetchTarget(targetUrl);
    return Boolean(target
        && isProxySafeRequest(targetUrl, options)
        && isReadMethod(options.method)
        && isSharedPublicProxyAllowlistedTarget(target));
}

export function shouldPreferProxyFirst(targetUrl: string, hasDirectCandidate: boolean, proxySafe: boolean): boolean {
    return hasDirectCandidate
        && proxySafe
        && !isKnownDirectCorsTarget(targetUrl)
        && isHostedGithubPagesApp()
        && isCrossOriginHttpUrl(targetUrl);
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

export function shouldSkipDirectCrossOriginFetch(targetUrl: string, options: ProxyRuleOptions): boolean {
    const target = fetchTarget(targetUrl);
    const method = requestMethod(options);
    return Boolean(target
        && isCrossOriginHttpTarget(target)
        && (isKnownCorsBlockedConfiguredProxyTarget(target, method)
            || isJpdbPublicLookupTarget(target, method)
            || isLocalHostedBrowserCorsTarget(target, method)));
}

// The shared public proxy is safe to use from ANY origin because
// isSharedPublicProxySafeRequest restricts it to read-only GETs against the
// dictionary/audio allowlist with no credentials or sensitive headers. Without
// this fallback, a user with no configured proxy whose transport falls back to
// page fetch (e.g. GM request unavailable or CORS-blocked) hits a dead
// "No configured proxy." toast instead of a working lookup.
export function builtInProxyUrls(targetUrl: string, options: ProxyRuleOptions): string[] {
    if (!isSharedPublicProxySafeRequest(targetUrl, options)) return [];
    return YOMU_SHARED_PUBLIC_PROXY_FALLBACK_URLS
        .map(proxyUrl => configuredProxyFetchUrl(targetUrl, proxyUrl))
        .filter((url): url is string => Boolean(url));
}

export function isJpdbPublicAudioUrl(targetUrl: string): boolean {
    try {
        const target = new URL(targetUrl, location.href);
        return (target.hostname === 'jpdb.io' && target.pathname.startsWith('/static/v/'))
            || isKnownCorsBlockedPublicAudioCdnUrl(target);
    } catch {
        return false;
    }
}

export function isYomuPublicProxyUrl(candidateUrl: string): boolean {
    try {
        const url = new URL(candidateUrl);
        return YOMU_PUBLIC_PROXY_HOSTS.has(url.hostname);
    } catch {
        return false;
    }
}

export function isKnownDirectCorsTarget(targetUrl: string): boolean {
    try {
        const target = new URL(targetUrl, location.href);
        return IMMERSION_KIT_API_HOSTS.has(target.hostname)
            || target.hostname === 'api.nadeshiko.co'
            || target.hostname === 'raw.githubusercontent.com';
    } catch {
        return false;
    }
}

function isKnownCorsBlockedConfiguredProxyTarget(target: URL, method: string): boolean {
    return method === 'GET'
        && (isJpdbPublicAudioUrl(target.href)
            || (target.hostname === 'jisho.org' && target.pathname.startsWith('/search/'))
            || (target.hostname === 'assets.languagepod101.com' && target.pathname === '/dictionary/japanese/audiomp3.php')
            || (target.hostname === 'cdn.innovativelanguage.com' && target.pathname.includes('/learningcenter/audio/'))
            || (target.hostname === 'api.jiten.moe'
                && (target.pathname.startsWith('/api/tts/word/')
                    || target.pathname.startsWith('/api/tts/sentence/')
                    || target.pathname === '/api/vocabulary/search'
                    || target.pathname === '/api/vocabulary/parse'
                    || /^\/api\/vocabulary\/\d+\/\d+\/info$/u.test(target.pathname))));
}

function isSharedPublicProxyAllowlistedTarget(target: URL): boolean {
    const host = target.hostname.toLowerCase();
    const path = target.pathname;
    if (target.protocol !== 'https:') return false;
    if (host === 'api.jiten.moe') {
        return path.startsWith('/api/tts/word/')
            || path.startsWith('/api/tts/sentence/')
            || path === '/api/vocabulary/search'
            || path === '/api/vocabulary/parse'
            || path === '/api/vocabulary/parse-normalised'
            || /^\/api\/vocabulary\/\d+\/\d+\/info$/u.test(path)
            || path.startsWith('/api/kanji/');
    }
    if (host === 'jpdb.io') {
        return path === '/search'
            || path.startsWith('/vocabulary/')
            || path.startsWith('/kanji/')
            || path.startsWith('/static/v/');
    }
    if (host === 'jisho.org') return path.startsWith('/search/');
    if (host === 'assets.languagepod101.com') return path === '/dictionary/japanese/audiomp3.php';
    if (host === 'cdn.innovativelanguage.com') return path.includes('/learningcenter/audio/');
    if (KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS.has(host)) return path.startsWith('/audio/');
    return IMMERSION_KIT_API_HOSTS.has(host) && path === '/search';
}

function isJpdbPublicLookupTarget(target: URL, method: string): boolean {
    return method === 'GET'
        && target.hostname === 'jpdb.io'
        && (target.pathname === '/search' || target.pathname.startsWith('/vocabulary/'));
}

function isLocalHostedBrowserCorsTarget(target: URL, method: string): boolean {
    return method === 'GET'
        && isLocalHostedApp()
        && IMMERSION_KIT_API_HOSTS.has(target.hostname)
        && target.pathname === '/search';
}

// Single owner of jpdb.io API proxy-candidate preference. The JPDB private-API
// client (jpdb-api.ts) must prefer the configured proxy AHEAD of the direct
// jpdb.io request in three cases where the direct cross-origin POST is unreliable:
// a page not served from jpdb.io itself, the hosted GitHub Pages app, and
// Apple touch browsers (iOS/iPadOS Safari fails the direct authenticated POST).
// This is intentionally distinct from shouldPreferProxyFirst, which governs the
// generic public-proxy read path; JPDB-API POSTs are sensitive/authenticated and
// never eligible for public proxies.
export function shouldPreferConfiguredProxyForJpdbApi(targetUrl: string): boolean {
    if (!isJpdbApiUrl(targetUrl)) return false;
    return isCrossOriginJpdbApiPage() || isHostedGithubPagesApp() || isAppleTouchBrowser();
}

function isJpdbApiUrl(url: string): boolean {
    try {
        const target = new URL(url);
        return target.hostname === 'jpdb.io' && target.pathname.startsWith('/api/v1/');
    } catch {
        return false;
    }
}

function isCrossOriginJpdbApiPage(): boolean {
    if (typeof location === 'undefined') return false;
    return attempt(() => new URL(location.href).origin !== 'https://jpdb.io', false, 'proxy-fetch-rules.isCrossOriginJpdbApiPage');
}

function isHostedGithubPagesApp(): boolean {
    if (typeof location === 'undefined') return false;
    try {
        const current = new URL(location.href);
        const path = current.pathname.replace(/\/index\.html$/, '/');
        return current.origin === DOCS_ORIGIN
            || (current.origin === GITHUB_PAGES_ORIGIN && path.startsWith(`/${APP_REPOSITORY_NAME}/`));
    } catch {
        return false;
    }
}

function isLocalHostedApp(): boolean {
    if (typeof location === 'undefined') return false;
    return ['127.0.0.1', 'localhost', '::1'].includes(location.hostname);
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

function requestMethod(options: ProxyRuleOptions): string {
    return String(options.method ?? 'GET').toUpperCase();
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

function isPrivateJpdbTarget(targetUrl: string, options: ProxyRuleOptions): boolean {
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
        return isPrivateOrLocalHostname(url.hostname);
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
