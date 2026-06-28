import {
    builtInProxyUrls,
    configuredProxyFetchUrl,
    isJpdbPublicAudioUrl,
    isProxySafeRequest,
    isYomuPublicProxyUrl,
    shouldPreferProxyFirst,
    shouldSkipDirectCrossOriginFetch,
} from './proxy-fetch-rules';

export {
    isKnownCorsBlockedPublicAudioCdnUrl,
} from './proxy-fetch-rules';

export interface ProxyFetchOptions extends RequestInit {
    timeoutMs?: number;
    allowPublicProxies?: boolean;
    allowConfiguredProxy?: boolean;
    allowSensitiveConfiguredProxy?: boolean;
    allowDirectCrossOrigin?: boolean;
}

type FetchCandidateKind = 'direct' | 'configured-proxy' | 'public-proxy';

interface FetchUrlCandidate {
    url: string;
    kind: FetchCandidateKind;
}

interface FetchAttempt {
    url: string;
    options: ProxyFetchOptions;
}

export function proxyUrlCandidates(targetUrl: string, configuredProxyUrl = '', allowPublicProxies = true): string[] {
    const candidates = [
        configuredProxyFetchUrl(targetUrl, configuredProxyUrl),
        ...(allowPublicProxies ? builtInProxyUrls(targetUrl, { method: 'GET' }) : []),
    ].filter((url): url is string => Boolean(url));
    return [...new Set(candidates)];
}

export async function fetchWithCorsFallbacks(
    targetUrl: string,
    configuredProxyUrl = '',
    options: ProxyFetchOptions = {},
): Promise<Response> {
    const candidates = fetchUrlCandidates(targetUrl, configuredProxyUrl, options);
    if (!candidates.length) throw new Error('No configured proxy.');
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
    const proxySafe = isProxySafeRequest(targetUrl, options);
    const configuredProxySafe = proxySafe || options.allowSensitiveConfiguredProxy === true;
    const configured = configuredProxySafe && options.allowConfiguredProxy !== false
        ? configuredProxyFetchUrl(targetUrl, configuredProxyUrl)
        : null;
    const publicProxySafe = proxySafe && options.allowPublicProxies !== false;
    const publicProxies = publicProxySafe
        ? builtInProxyUrls(targetUrl, options)
        : [];
    const direct = directFetchUrl(targetUrl, options, Boolean(configured));
    const directCandidate = direct ? { url: direct, kind: 'direct' as const } : null;
    const proxyCandidates = ([
        configured ? { url: configured, kind: 'configured-proxy' as const } : null,
        ...publicProxies.map((url): FetchUrlCandidate => ({ url, kind: 'public-proxy' })),
    ] as Array<FetchUrlCandidate | null>).filter((candidate): candidate is FetchUrlCandidate => Boolean(candidate));
    const orderedCandidates: Array<FetchUrlCandidate | null> = shouldPreferProxyFirst(targetUrl, Boolean(directCandidate), proxySafe)
        ? [...proxyCandidates, directCandidate]
        : [directCandidate, ...proxyCandidates];
    return uniqueFetchCandidates([
        ...orderedCandidates,
    ]);
}

function directFetchUrl(targetUrl: string, options: ProxyFetchOptions, hasConfiguredProxy: boolean): string | null {
    if (!options.allowDirectCrossOrigin) return browserReadableUrl(targetUrl);
    if (hasConfiguredProxy && shouldSkipDirectCrossOriginFetch(targetUrl, options)) return browserReadableUrl(targetUrl);
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
        allowSensitiveConfiguredProxy: _allowSensitiveConfiguredProxy,
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
