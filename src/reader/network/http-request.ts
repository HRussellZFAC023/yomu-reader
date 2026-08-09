import { fetchWithCorsFallbacks } from './proxy-fetch';
import { isKnownDirectCorsTarget, isProxySafeRequest, isSharedPublicProxySafeRequest, YOMU_SHARED_PUBLIC_PROXY_URL } from './proxy-fetch-rules';
import type { ReaderHttpOptions } from './http-options';
import { getUserscriptHttpRequest, isUserscriptEventBridgeRequest, probeUserscriptEventBridge, requestViaUserscriptManager } from '../userscript/index';

export async function requestHttp(url: string, options: ReaderHttpOptions = {}): Promise<unknown> {
    // Offline-first: when the browser is offline, skip the cross-origin attempt and
    // let callers fall back to cache or queue the write (keeps an offline study run
    // from firing doomed requests). Same-origin still flows (service worker serves it).
    if (__YOMU_NEWTAB_BUILD__ && !navigator.onLine && !isSameOriginUrl(url)) throw Error('Offline');
    let userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest && isUserscriptEventBridgeRequest(userscriptRequest)) {
        const bridgeIsAlive = await probeUserscriptEventBridge(userscriptRequest);
        if (!bridgeIsAlive) userscriptRequest = undefined;
    }
    // preferFetch only makes sense same-origin; cross-origin fetch is blocked by
    // strict page CSPs (e.g. jpdb.io), so route it through the userscript request
    // which is exempt from the page's connect-src.
    //
    // The hosted reader (newtab runtime) is the exception: the userscript request
    // there is the DOM-event bridge, which serialises responses as JSON and so
    // cannot carry binary audio Blobs across the content/page world boundary
    // (they arrive empty, and the error is swallowed → "No playable audio found"
    // with no detail). A configured proxy can serve that same cross-origin media
    // with CORS headers, so a direct proxied fetch succeeds and returns a real
    // Blob. Prefer fetch there, keeping the bridge as a fallback.
    if (options.preferFetch && (!userscriptRequest
        || isSameOriginUrl(url)
        || ((window as typeof window & { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ === 'newtab'
            && options.responseType === 'blob'))) {
        try {
            return await requestViaFetch(url, options, userscriptRequest ?? null);
        } catch (error) {
            if (!userscriptRequest) throw error;
            return await requestViaUserscript(url, options, userscriptRequest);
        }
    }
    if (userscriptRequest) {
        try {
            return await requestViaUserscript(url, options, userscriptRequest);
        } catch (error) {
            if (!shouldRetryWithFetch(error) && !shouldRetryEventBridgeFailureWithFetch(userscriptRequest, error)) throw error;
            userscriptRequest = undefined;
        }
    }
    return requestViaFetch(url, browserFetchFallbackOptions(url, options, userscriptRequest), userscriptRequest ?? null);
}

// The manager's own `timeout` field is only a REQUEST, and some transports drop
// it entirely — the hosted DOM-event bridge, and managers that predate the
// field. requestViaUserscriptManager enforces the deadline locally whatever the
// transport does, keeps settlement single-shot, and tears the timer and abort
// listener down on every exit path (see ../userscript/manager-request).
function requestViaUserscript(
    url: string,
    options: ReaderHttpOptions,
    userscriptRequest: UserscriptHttpRequest,
): Promise<unknown> {
    return requestViaUserscriptManager<unknown>(userscriptRequest, {
        details: {
            method: options.method ?? 'GET',
            url,
            headers: recordHeaders(options.headers),
            data: options.data,
            responseType: options.responseType,
            timeout: options.timeoutMs,
            anonymous: options.anonymous,
            withCredentials: options.withCredentials,
            cookie: options.cookie,
        },
        deadlineMs: options.timeoutMs,
        signal: options.signal ?? undefined,
        readResponse: response => {
            if (response.status < 200 || response.status >= 300) throw new Error(formatStatusFailure(options, response.status));
            return normalizeUserscriptResponse(response, options.responseType ?? 'text');
        },
        onError: error => error instanceof Error ? error : new Error(formatFailure(options)),
        onTimeout: () => new Error(options.timeoutLabel ?? `${options.failureLabel ?? 'Request'} timed out.`),
    });
}

function normalizeUserscriptResponse(response: UserscriptHttpResponse, responseType: NonNullable<ReaderHttpOptions['responseType']>): unknown {
    return USERSCRIPT_RESPONSE_NORMALIZERS[responseType]?.(response) ?? userscriptTextResponse(response);
}

const USERSCRIPT_RESPONSE_NORMALIZERS: Record<string, (response: UserscriptHttpResponse) => unknown> = {
    blob: response => response.response,
    arraybuffer: response => response.response,
    json: userscriptJsonResponse,
    text: userscriptTextResponse,
};

function userscriptJsonResponse(response: UserscriptHttpResponse): unknown {
    return response.response !== undefined && typeof response.response !== 'string'
        ? response.response
        : JSON.parse(String(response.responseText ?? response.response ?? 'null'));
}

function userscriptTextResponse(response: UserscriptHttpResponse): string {
    return String(response.responseText ?? response.response ?? '');
}

// Yomu's public CORS-proxy worker. Any surface running in the page world with NO
// GM_xmlhttpRequest (the hosted reader pages, or a userscript whose GM transport
// failed and fell back to fetch) has cross-origin requests to api.jiten.moe /
// jpdb.io blocked by CORS (those origins send no Access-Control-Allow-Origin).
// So when nothing is configured AND there is no userscript bridge, fall back to
// the public proxy — otherwise users with no configured proxy hit a dead
// "No configured proxy." toast and lookups/captions silently degrade.
// isSharedPublicProxySafeRequest keeps this to read-only GETs against the
// dictionary/audio allowlist with no credentials or sensitive headers.
export function hostedFallbackProxyUrl(
    url: string,
    options: ReaderHttpOptions = {},
    userscriptRequest: UserscriptHttpRequest | null = getUserscriptHttpRequest() ?? null,
): string {
    if (userscriptRequest) return '';        // GM bypasses CORS — no proxy needed
    if (!isSharedPublicProxySafeRequest(url, options)) return '';
    return YOMU_SHARED_PUBLIC_PROXY_URL;
}

async function requestViaFetch(
    url: string,
    options: ReaderHttpOptions,
    userscriptRequest: UserscriptHttpRequest | null = getUserscriptHttpRequest() ?? null,
): Promise<unknown> {
    const response = await fetchWithCorsFallbacks(url, (options.proxyUrl ?? '').trim() || hostedFallbackProxyUrl(url, options, userscriptRequest), {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.data,
        credentials: options.credentials ?? 'omit',
        redirect: options.redirect ?? 'follow',
        referrerPolicy: options.referrerPolicy ?? 'no-referrer',
        timeoutMs: options.timeoutMs,
        timeoutLabel: options.timeoutLabel,
        allowConfiguredProxy: options.allowConfiguredProxy,
        allowSensitiveConfiguredProxy: options.allowSensitiveConfiguredProxy,
        allowPublicProxies: options.allowPublicProxies,
        allowDirectCrossOrigin: options.allowDirectCrossOrigin,
        signal: options.signal,
    });
    if (!response.ok) throw new Error(formatStatusFailure(options, response.status));
    return readFetchResponseBody(response, options.responseType);
}

function browserFetchFallbackOptions(
    url: string,
    options: ReaderHttpOptions,
    userscriptRequest: UserscriptHttpRequest | undefined,
): ReaderHttpOptions {
    if (userscriptRequest || options.allowDirectCrossOrigin !== undefined) return options;
    const method = String(options.method ?? 'GET').toUpperCase();
    if ((method !== 'GET' && method !== 'HEAD')
        || !isKnownDirectCorsTarget(url)
        || !isProxySafeRequest(url, options)) return options;
    return { ...options, allowDirectCrossOrigin: true };
}

function readFetchResponseBody(response: Response, responseType: ReaderHttpOptions['responseType']): Promise<unknown> {
    return FETCH_RESPONSE_READERS[responseType ?? 'text']?.(response) ?? response.text();
}

const FETCH_RESPONSE_READERS: Record<string, (response: Response) => Promise<unknown>> = {
    blob: response => response.blob(),
    arraybuffer: response => response.arrayBuffer(),
    json: response => response.json(),
    text: response => response.text(),
};

function formatFailure(options: ReaderHttpOptions): string {
    return options.failureMessage ?? `${options.failureLabel ?? 'Request'} failed.`;
}

function formatStatusFailure(options: ReaderHttpOptions, status: number): string {
    return options.statusFailureMessage?.(status) ?? `${options.failureLabel ?? 'Request'} failed (${status}).`;
}

function isSameOriginUrl(url: string): boolean {
    if (typeof location === 'undefined') return false;
    try {
        return new URL(url, location.href).origin === location.origin;
    } catch {
        return false;
    }
}

// The hosted-page DOM-event bridge can be marked installed yet dead at request
// time (a broken userscript world — e.g. a Firefox Xray failure — never answers,
// so every request "times out" locally). An HTTP status failure means the bridge
// actually worked, so only transport-level failures fall back to fetch, where the
// hosted origin still has public-proxy candidates.
function shouldRetryEventBridgeFailureWithFetch(userscriptRequest: UserscriptHttpRequest, error: unknown): boolean {
    if (!isUserscriptEventBridgeRequest(userscriptRequest)) return false;
    if (!(error instanceof Error)) return true;
    return !/\(\d{3}\)/.test(error.message);
}

function shouldRetryWithFetch(error: unknown): boolean {
    if (!(error instanceof Error)) return true;
    if (/\(\d{3}\)/.test(error.message)) return false;
    if (/timed out|timeout/i.test(error.message)) return false;
    return /network|cors|blocked|request failed/i.test(error.message);
}

function recordHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
    if (!headers) return undefined;
    if (headers instanceof Headers) return Object.fromEntries(headers.entries());
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return headers;
}
