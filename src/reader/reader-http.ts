import { fetchWithCorsFallbacks, type ProxyFetchOptions } from './proxy-fetch';
import { getUserscriptHttpRequest } from './userscript';

export interface ReaderHttpOptions extends Omit<ProxyFetchOptions, 'body'> {
    data?: string | Blob | FormData | ArrayBuffer;
    proxyUrl?: string;
    responseType?: 'text' | 'blob' | 'json' | 'arraybuffer';
    failureLabel?: string;
    failureMessage?: string;
    statusFailureMessage?: (status: number) => string;
    timeoutLabel?: string;
    blobFailureMessage?: string;
    preferFetch?: boolean;
    anonymous?: boolean;
    withCredentials?: boolean;
    cookie?: string;
}

export async function requestText(url: string, options: ReaderHttpOptions = {}): Promise<string> {
    const value = await requestHttp(url, { ...options, responseType: 'text' });
    return typeof value === 'string' ? value : String(value ?? '');
}

export async function requestBlob(url: string, options: ReaderHttpOptions = {}): Promise<Blob> {
    const value = await requestHttp(url, { ...options, responseType: 'blob' });
    if (value instanceof Blob) return value;
    if (isBlobLike(value)) return new Blob([await value.arrayBuffer()], { type: value.type });
    throw new Error(options.blobFailureMessage ?? `${options.failureLabel ?? 'Request'} did not return a blob.`);
}

export async function requestJson(url: string, options: ReaderHttpOptions = {}): Promise<unknown> {
    const value = await requestHttp(url, { ...options, responseType: 'json' });
    return value;
}

export async function requestHttp(url: string, options: ReaderHttpOptions = {}): Promise<unknown> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (options.preferFetch) {
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
    if (responseType === 'blob' || responseType === 'arraybuffer') return response.response;
    if (responseType === 'json') {
        if (response.response !== undefined && typeof response.response !== 'string') return response.response;
        return JSON.parse(String(response.responseText ?? response.response ?? 'null'));
    }
    return String(response.responseText ?? response.response ?? '');
}

function isBlobLike(value: unknown): value is { arrayBuffer: () => Promise<ArrayBuffer>; type: string } {
    return Boolean(value
        && typeof value === 'object'
        && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
        && typeof (value as { type?: unknown }).type === 'string');
}

async function requestViaFetch(url: string, options: ReaderHttpOptions): Promise<unknown> {
    const response = await fetchWithCorsFallbacks(url, options.proxyUrl ?? '', {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.data,
        credentials: options.credentials ?? 'omit',
        redirect: options.redirect ?? 'follow',
        referrerPolicy: options.referrerPolicy ?? 'no-referrer',
        timeoutMs: options.timeoutMs,
        allowConfiguredProxy: options.allowConfiguredProxy,
        allowPublicProxies: options.allowPublicProxies,
        allowDirectCrossOrigin: options.allowDirectCrossOrigin,
        signal: options.signal,
    });
    if (!response.ok) throw new Error(formatStatusFailure(options, response.status));
    if (options.responseType === 'blob') return response.blob();
    if (options.responseType === 'arraybuffer') return response.arrayBuffer();
    if (options.responseType === 'json') return response.json();
    return response.text();
}

function formatFailure(options: ReaderHttpOptions): string {
    return options.failureMessage ?? `${options.failureLabel ?? 'Request'} failed.`;
}

function formatStatusFailure(options: ReaderHttpOptions, status: number): string {
    return options.statusFailureMessage?.(status) ?? `${options.failureLabel ?? 'Request'} failed (${status}).`;
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
