import { isAppleTouchBrowser } from './browser-platform';
import { APP_REPOSITORY_NAME, GITHUB_PAGES_ORIGIN } from './constants';

type ProxyUrlBuilder = (targetUrl: string) => string;
type SpecializedProxyRoute = 'yomu-public-only' | 'jisho-search' | null;
type ConcreteSpecializedProxyRoute = Exclude<SpecializedProxyRoute, null>;

interface ProxyRuleOptions {
    method?: RequestInit['method'];
    headers?: HeadersInit;
    credentials?: RequestCredentials;
}

interface SpecializedProxyRouteRule {
    method: string;
    route: ConcreteSpecializedProxyRoute;
    matches: (target: URL) => boolean;
}

export const DEFAULT_YOMU_PUBLIC_PROXY_URL = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';

const BUILT_IN_PROXY_BUILDERS: ProxyUrlBuilder[] = [
    targetUrl => configuredProxyFetchUrl(targetUrl, DEFAULT_YOMU_PUBLIC_PROXY_URL) ?? '',
];

const SENSITIVE_REQUEST_KEY_RE = /(?:api[-_]?key|authorization|bearer|token|password|secret|credential|oauth|cookie|csrf)/i;
const READ_METHODS = new Set(['GET', 'HEAD']);
const PRIVATE_IPV4_HOSTNAME_PATTERNS = [
    /^(?:0|10|127)\./,
    /^169\.254\./,
    /^192\.168\./,
    /^172\.(?:1[6-9]|2\d|3[0-1])\./,
];
const PRIVATE_IPV6_HOSTNAME_PREFIXES = ['fc', 'fd', 'fe80:'];
const IMMERSION_KIT_API_HOSTS = new Set([
    'apiv2express.immersionkit.com',
    'apiv2.immersionkit.com',
]);
const KNOWN_CORS_BLOCKED_PUBLIC_AUDIO_CDN_HOSTS = new Set([
    'd1pra95f92lrn3.cloudfront.net',
    'd1vjc5dkcd3yh2.cloudfront.net',
]);
const SPECIALIZED_PROXY_ROUTE_RULES: SpecializedProxyRouteRule[] = [
    {
        method: 'GET',
        route: 'jisho-search',
        matches: target => target.hostname === 'jisho.org' && target.pathname.startsWith('/search/'),
    },
    {
        method: 'GET',
        route: 'yomu-public-only',
        matches: target => target.hostname === 'assets.languagepod101.com' && target.pathname === '/dictionary/japanese/audiomp3.php',
    },
    {
        method: 'POST',
        route: 'yomu-public-only',
        matches: target => target.hostname === 'www.japanesepod101.com' && target.pathname === '/learningcenter/reference/dictionary_post',
    },
    {
        method: 'GET',
        route: 'yomu-public-only',
        matches: target => isKnownCorsBlockedPublicAudioCdnUrl(target),
    },
    {
        method: 'GET',
        route: 'yomu-public-only',
        matches: target => target.hostname === 'cdn.innovativelanguage.com' && target.pathname.includes('/learningcenter/audio/'),
    },
    {
        method: 'GET',
        route: 'yomu-public-only',
        matches: target => target.hostname === 'jpdb.io' && target.pathname.startsWith('/static/v/'),
    },
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

export function shouldPreferProxyFirst(targetUrl: string, hasDirectCandidate: boolean, proxySafe: boolean): boolean {
    return hasDirectCandidate
        && proxySafe
        && !isKnownDirectCorsTarget(targetUrl)
        && (isHostedGithubPagesApp() || isAppleTouchBrowser())
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
    return Boolean(target
        && isCrossOriginHttpTarget(target)
        && (specializedProxyRoute(target, requestMethod(options))
            || isJpdbPublicLookupTarget(target, requestMethod(options))
            || isLocalHostedBrowserCorsTarget(target, requestMethod(options))));
}

export function builtInProxyUrls(targetUrl: string, options: ProxyRuleOptions): string[] {
    const specialized = specializedProxyUrls(targetUrl, options);
    const candidates = specialized ?? BUILT_IN_PROXY_BUILDERS.map(builder => builder(targetUrl));
    return candidates.filter(Boolean);
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
        return new URL(candidateUrl).origin === DEFAULT_YOMU_PUBLIC_PROXY_URL;
    } catch {
        return false;
    }
}

function isKnownDirectCorsTarget(targetUrl: string): boolean {
    try {
        const target = new URL(targetUrl, location.href);
        return IMMERSION_KIT_API_HOSTS.has(target.hostname) || target.hostname === 'api.nadeshiko.co';
    } catch {
        return false;
    }
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

function specializedProxyUrls(targetUrl: string, options: ProxyRuleOptions): string[] | null {
    const target = fetchTarget(targetUrl);
    const route = target ? specializedProxyRoute(target, requestMethod(options)) : null;
    if (!target || !route) return null;

    const proxyTargetUrl = target.href;
    if (route === 'jisho-search') {
        return [
            yomuPublicProxyUrl(proxyTargetUrl),
        ];
    }
    return [yomuPublicProxyUrl(proxyTargetUrl)];
}

function specializedProxyRoute(target: URL, method: string): SpecializedProxyRoute {
    return SPECIALIZED_PROXY_ROUTE_RULES.find(rule => rule.method === method && rule.matches(target))?.route ?? null;
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
        return isPrivateHostname(url.hostname);
    } catch {
        return false;
    }
}

function isPrivateHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return isLocalhostHostname(host)
        || isPrivateIpv4Hostname(host)
        || isPrivateIpv6Hostname(host);
}

function isLocalhostHostname(host: string): boolean {
    return host === 'localhost' || host.endsWith('.localhost');
}

function isPrivateIpv4Hostname(host: string): boolean {
    return PRIVATE_IPV4_HOSTNAME_PATTERNS.some(pattern => pattern.test(host));
}

function isPrivateIpv6Hostname(host: string): boolean {
    if (!host.includes(':')) return false;
    return host === '::1'
        || PRIVATE_IPV6_HOSTNAME_PREFIXES.some(prefix => host.startsWith(prefix));
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
