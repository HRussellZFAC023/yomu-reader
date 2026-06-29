import { fetchWithCorsFallbacks } from './proxy-fetch';
import type { ReaderHttpOptions } from './http-options';
import { getUserscriptHttpRequest } from '../userscript/index';

export async function requestHttp(url: string, options: ReaderHttpOptions = {}): Promise<unknown> {
    // Offline-first: when the browser is offline, skip the cross-origin attempt and
    // let callers fall back to cache or queue the write (keeps an offline study run
    // from firing doomed requests). Same-origin still flows (service worker serves it).
    if (__YOMU_NEWTAB_BUILD__ && !navigator.onLine && !isSameOriginUrl(url)) throw Error('Offline');
    const userscriptRequest = getUserscriptHttpRequest();
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
            return await requestViaFetch(url, options);
        } catch (error) {
            if (!userscriptRequest) throw error;
            return await requestViaUserscript(url, options, userscriptRequest);
        }
    }
    if (userscriptRequest) {
        try {
            return await requestViaUserscript(url, options, userscriptRequest);
        } catch (error) {
            if (!shouldRetryWithFetch(error)) throw error;
        }
    }
    return requestViaFetch(url, options);
}

function requestViaUserscript(
    url: string,
    options: ReaderHttpOptions,
    userscriptRequest: UserscriptHttpRequest,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const signal = options.signal;
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        let handle: UserscriptHttpRequestHandle | undefined;
        const tryAbort = () => { try { handle?.abort?.(); } catch { /* ignore */ } };
        const handleLoad = (response: UserscriptHttpResponse) => {
            if (response.status < 200 || response.status >= 300) {
                reject(new Error(formatStatusFailure(options, response.status)));
                return;
            }
            try {
                resolve(normalizeUserscriptResponse(response, options.responseType ?? 'text'));
            } catch (error) {
                reject(error);
            }
        };
        const onAbort = () => {
            tryAbort();
            reject(abortError());
        };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        const result = userscriptRequest({
            method: options.method ?? 'GET',
            url,
            headers: recordHeaders(options.headers),
            data: options.data,
            responseType: options.responseType,
            timeout: options.timeoutMs,
            anonymous: options.anonymous,
            withCredentials: options.withCredentials,
            cookie: options.cookie,
            onload: handleLoad,
            onerror: error => reject(error instanceof Error ? error : new Error(formatFailure(options))),
            ontimeout: () => {
                tryAbort();
                reject(new Error(options.timeoutLabel ?? `${options.failureLabel ?? 'Request'} timed out.`));
            },
        });
        if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
            (result as Promise<UserscriptHttpResponse>).then(handleLoad, error => reject(error instanceof Error ? error : new Error(formatFailure(options))));
        } else if (result && typeof (result as UserscriptHttpRequestHandle).abort === 'function') {
            handle = result as UserscriptHttpRequestHandle;
        }
    });
}

function abortError(): Error {
    if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
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

// Yomu's public CORS-proxy worker. The hosted reader (yomureader.com pages — the
// homepage demo, /video-player/, /newtab/) runs in the page world with NO
// GM_xmlhttpRequest, so a cross-origin request to api.jiten.moe / jpdb.io is
// blocked by CORS (those origins send no Access-Control-Allow-Origin). The
// userscript is exempt via GM and needs no proxy. So when nothing is configured
// AND there is no userscript bridge, fall back to the public proxy — otherwise the
// hosted reader cannot parse subtitles or fetch readings/pitch, and its captions
// silently degrade to reading-less, pitch-less fallback tokens (and the failing
// parse retries churn the caption, making word taps miss).
const YOMU_HOSTED_FALLBACK_PROXY_URL = 'https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/';

export function hostedFallbackProxyUrl(url: string): string {
    if (getUserscriptHttpRequest()) return '';        // GM bypasses CORS — no proxy needed
    if (!isOfficialHostedReaderOrigin()) return '';   // only Yomu's own hosted pages opt in
    if (isSameOriginUrl(url) || !/^https?:\/\//i.test(url)) return '';
    return YOMU_HOSTED_FALLBACK_PROXY_URL;
}

// Scoped to Yomu's official hosted reader so a normal userscript page never silently
// routes through the shared proxy (the codebase deliberately requires explicit proxy
// config off-site). The hosted pages have no other cross-origin transport.
function isOfficialHostedReaderOrigin(): boolean {
    if (typeof location === 'undefined') return false;
    return location.hostname === 'yomureader.com' || location.hostname === 'www.yomureader.com';
}

async function requestViaFetch(url: string, options: ReaderHttpOptions): Promise<unknown> {
    const response = await fetchWithCorsFallbacks(url, (options.proxyUrl ?? '').trim() || hostedFallbackProxyUrl(url), {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.data,
        credentials: options.credentials ?? 'omit',
        redirect: options.redirect ?? 'follow',
        referrerPolicy: options.referrerPolicy ?? 'no-referrer',
        timeoutMs: options.timeoutMs,
        allowConfiguredProxy: options.allowConfiguredProxy,
        allowSensitiveConfiguredProxy: options.allowSensitiveConfiguredProxy,
        allowPublicProxies: options.allowPublicProxies,
        allowDirectCrossOrigin: options.allowDirectCrossOrigin,
        signal: options.signal,
    });
    if (!response.ok) throw new Error(formatStatusFailure(options, response.status));
    return readFetchResponseBody(response, options.responseType);
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
