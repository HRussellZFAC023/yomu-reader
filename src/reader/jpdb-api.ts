import { Logger } from './logger';
import { isAppleTouchBrowser } from './browser-platform';
import { getUserscriptHttpRequest } from './userscript';

const API_BASE = 'https://jpdb.io/api/v1';
const RATE_LIMIT_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;
const log = Logger.scope('JpdbApi');

export class JpdbApiClient {
    private retryAfter = 0;

    constructor(
        private getApiKey: () => string,
        private getProxyUrl: () => string = () => '',
    ) {}

    request<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
        return this.requestByUrl(`${API_BASE}/${endpoint}`, body);
    }

    async requestByUrl<T>(url: string, body?: Record<string, unknown>, options: { response?: 'json' | 'none' } = {}): Promise<T> {
        const token = this.getApiKey();
        const endpoint = endpointLabel(url);
        this.assertCanRequest(token, endpoint);

        const done = log.time('request', { endpoint, hasBody: Boolean(body) });
        const response = await postJson(url, token, body, this.getProxyUrl());
        done();
        this.assertSuccessfulResponse(response, endpoint);
        return parseJpdbApiResponse<T>(response, endpoint, options.response);
    }

    private assertCanRequest(token: string, endpoint: string): asserts token is string {
        if (!token) {
            log.warn('Request blocked; JPDB API key is missing', { endpoint });
            throw new Error('JPDB API key is not set.');
        }
        if (Date.now() < this.retryAfter) {
            log.warn('Request blocked by JPDB rate-limit backoff', { endpoint, retryAfterMs: this.retryAfter - Date.now() });
            throw new Error('JPDB is rate limited. Try again in a moment.');
        }
    }

    private assertSuccessfulResponse(response: JsonPostResponse, endpoint: string): void {
        if (response.status === 429) {
            this.retryAfter = Date.now() + RATE_LIMIT_BACKOFF_MS;
            log.warn('JPDB rate limit reached', { endpoint, backoffMs: RATE_LIMIT_BACKOFF_MS });
            throw new Error('JPDB rate limit reached.');
        }
        if (response.status === 403) {
            log.warn('JPDB rejected API key', { endpoint });
            throw new Error('JPDB rejected the API key.');
        }
        if (!response.ok) {
            log.warn('JPDB request failed', { endpoint, status: response.status });
            throw new Error(`JPDB request failed (${response.status}).`);
        }
    }
}

function parseJpdbApiResponse<T>(response: JsonPostResponse, endpoint: string, responseMode: 'json' | 'none' | undefined): T {
    if (responseMode === 'none' || !response.text) return undefined as T;
    const json = JSON.parse(response.text) as T | { error_message?: string };
    const errorMessage = jpdbApplicationErrorMessage(json);
    if (errorMessage) {
        log.warn('JPDB returned application error', { endpoint, message: errorMessage });
        throw new Error(errorMessage);
    }
    return json as T;
}

function jpdbApplicationErrorMessage(value: unknown): string | undefined {
    if (!isJsonRecord(value)) return undefined;
    const message = value.error_message;
    return typeof message === 'string' && message ? message : undefined;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

interface JsonPostResponse {
    status: number;
    ok: boolean;
    text: string;
}

function postJson(url: string, token: string, body?: Record<string, unknown>, proxyUrl = ''): Promise<JsonPostResponse> {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
    };

    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return postJsonWithUserscriptRequest(userscriptRequest, url, headers, data);

    return postJsonWithFetch(url, headers, data, proxyUrl);
}

async function postJsonWithFetch(
    url: string,
    headers: Record<string, string>,
    data: string | undefined,
    proxyUrl: string,
): Promise<JsonPostResponse> {
    let lastError: unknown;
    for (const candidate of jpdbApiFetchCandidates(url, proxyUrl)) {
        try {
            const response = await fetchWithTimeout(candidate, {
                method: 'POST',
                headers,
                body: data,
            }, REQUEST_TIMEOUT_MS);
            if (!response.ok && candidate !== url) {
                lastError = new Error(`JPDB proxy request failed (${response.status}).`);
                continue;
            }
            return {
                status: response.status,
                ok: response.ok,
                text: await response.text(),
            };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error('JPDB request failed.');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (isAbortError(error)) throw new Error('JPDB request timed out.');
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function jpdbApiFetchCandidates(url: string, proxyUrl: string): string[] {
    const configuredProxy = configuredProxyFetchUrl(url, proxyUrl);
    const shouldPreferProxy = Boolean(configuredProxy) && shouldPreferConfiguredProxyForJpdbApi(url);
    const candidates = shouldPreferProxy ? [configuredProxy, url] : [url, configuredProxy];
    return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}

function configuredProxyFetchUrl(targetUrl: string, configuredProxyUrl: string): string | null {
    const proxy = configuredProxyUrl.trim();
    if (!proxy) return null;
    try {
        const url = new URL(proxy);
        url.searchParams.set('url', targetUrl);
        return url.href;
    } catch {
        return null;
    }
}

function shouldPreferConfiguredProxyForJpdbApi(url: string): boolean {
    if (!isJpdbApiUrl(url)) return false;
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

function isHostedGithubPagesApp(): boolean {
    if (typeof location === 'undefined') return false;
    try {
        const current = new URL(location.href);
        return current.origin === 'https://hrussellzfac023.github.io'
            && current.pathname.replace(/\/index\.html$/, '/').startsWith('/yomu-reader/');
    } catch {
        return false;
    }
}

function isCrossOriginJpdbApiPage(): boolean {
    if (typeof location === 'undefined') return false;
    try {
        return new URL(location.href).origin !== 'https://jpdb.io';
    } catch {
        return false;
    }
}

function postJsonWithUserscriptRequest(
    request: UserscriptHttpRequest,
    url: string,
    headers: Record<string, string>,
    data?: string,
): Promise<JsonPostResponse> {
    return new Promise((resolve, reject) => {
        const handleLoad = (response: UserscriptHttpResponse) => resolve({
            status: response.status,
            ok: response.status >= 200 && response.status < 300,
            text: String(response.responseText ?? response.response ?? ''),
        });
        const result = request({
            method: 'POST',
            url,
            headers,
            data,
            responseType: 'text',
            timeout: REQUEST_TIMEOUT_MS,
            onload: handleLoad,
            onerror: reject,
            ontimeout: () => reject(new Error('JPDB request timed out.')),
        });
        if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
            (result as Promise<UserscriptHttpResponse>).then(handleLoad, reject);
        }
    });
}

function endpointLabel(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'jpdb.io' ? parsed.pathname.replace(/^\/api\/v1\//, '') : parsed.hostname + parsed.pathname;
    } catch {
        return url;
    }
}
