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

// Thrown when a request has ZERO fetch candidates: cross-origin with no
// configured proxy and no eligible built-in proxy. Callers with a keyless
// degrade path use isMissingProxyTransportError to fall back instead of
// surfacing a dead lookup. Keep the message in sync with the logger's
// OPTIONAL_CORS_BRIDGE_MESSAGE, which downgrades these warns to debug.
const NO_PROXY_TRANSPORT_MESSAGE = 'No configured proxy.';

export function isMissingProxyTransportError(error: unknown): boolean {
    return error instanceof Error && error.message === NO_PROXY_TRANSPORT_MESSAGE;
}

export async function fetchWithCorsFallbacks(
    targetUrl: string,
    configuredProxyUrl = '',
    options: ProxyFetchOptions = {},
): Promise<Response> {
    const candidates = fetchUrlCandidates(targetUrl, configuredProxyUrl, options);
    if (!candidates.length) throw new Error(NO_PROXY_TRANSPORT_MESSAGE);
    let lastError: unknown;
    for (const [index, candidate] of candidates.entries()) {
        // A caller that has already given up must not reach the network at all,
        // and one that gives up part-way through must not have the remaining
        // candidates tried on its behalf — this walks several hosts per call, so
        // an ignored abort turns one cancelled request into a fan of live ones.
        // Checked outside the try so the abort cannot be swallowed into lastError
        // and retried as though it were a transport failure.
        if (options.signal?.aborted) throw abortReasonFor(options.signal);
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

/** The caller's own reason where it gave one, so `AbortError` handling upstream still matches. */
function abortReasonFor(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('Aborted', 'AbortError');
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
    const configuredUrl = configuredProxyFetchUrl(targetUrl, configuredProxyUrl);
    const configuredUrlIsSharedPublicProxy = configuredUrl ? isYomuPublicProxyUrl(configuredUrl) : false;
    const configured = configuredProxySafe && options.allowConfiguredProxy !== false && !configuredUrlIsSharedPublicProxy
        ? configuredUrl
        : null;
    const publicProxySafe = proxySafe && options.allowPublicProxies !== false;
    const configuredPublicProxy = publicProxySafe && configuredUrlIsSharedPublicProxy
        ? configuredUrl
        : null;
    const publicProxies = publicProxySafe
        ? [
            configuredPublicProxy,
            ...builtInProxyUrls(targetUrl, options),
        ].filter((url): url is string => Boolean(url))
        : [];
    const proxyCandidates = ([
        configured ? { url: configured, kind: 'configured-proxy' as const } : null,
        ...publicProxies.map((url): FetchUrlCandidate => ({ url, kind: 'public-proxy' })),
    ] as Array<FetchUrlCandidate | null>).filter((candidate): candidate is FetchUrlCandidate => Boolean(candidate));
    const direct = directFetchUrl(targetUrl, options, proxyCandidates.length > 0);
    const directCandidate = direct ? { url: direct, kind: 'direct' as const } : null;
    const orderedCandidates: Array<FetchUrlCandidate | null> = shouldPreferProxyFirst(targetUrl, Boolean(directCandidate), proxySafe)
        ? [...proxyCandidates, directCandidate]
        : [directCandidate, ...proxyCandidates];
    return uniqueFetchCandidates([
        ...orderedCandidates,
    ]);
}

function directFetchUrl(targetUrl: string, options: ProxyFetchOptions, hasProxyCandidate: boolean): string | null {
    if (!options.allowDirectCrossOrigin) return browserReadableUrl(targetUrl);
    // Known-CORS-blocked targets (jpod101 audiomp3, jisho, jpdb public audio…)
    // must not fire a direct cross-origin request when ANY proxy candidate can
    // serve them — a configured proxy OR a built-in public proxy on the hosted
    // reader. Previously this only fired for configured proxies, so keyless
    // hosted users saw the direct assets.languagepod101.com request CORS-fail
    // in the console before the working public-proxy candidate ran.
    if (hasProxyCandidate && shouldSkipDirectCrossOriginFetch(targetUrl, options)) return browserReadableUrl(targetUrl);
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
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    return fetch(url, { ...init, signal: controller.signal }).finally(() => {
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    });
}
