import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

const API_BASE = 'https://jpdb.io/api/v1';
const RATE_LIMIT_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;
const log = Logger.scope('JpdbApi');

export class JpdbApiClient {
    private retryAfter = 0;

    constructor(private getApiKey: () => string) {}

    request<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
        return this.requestByUrl(`${API_BASE}/${endpoint}`, body);
    }

    async requestByUrl<T>(url: string, body?: Record<string, unknown>, options: { response?: 'json' | 'none' } = {}): Promise<T> {
        const token = this.getApiKey();
        const endpoint = endpointLabel(url);
        this.assertCanRequest(token, endpoint);

        const done = log.time('request', { endpoint, hasBody: Boolean(body) });
        const response = await postJson(url, token, body);
        done();
        log.debug('Response received', { endpoint, status: response.status, bytes: response.text.length });
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
    if (jpdbApplicationErrorMessage(json)) {
        log.warn('JPDB returned application error', { endpoint, message: json.error_message });
        throw new Error(json.error_message);
    }
    return json as T;
}

function jpdbApplicationErrorMessage(value: unknown): value is { error_message: string } {
    const message = value && typeof value === 'object' && 'error_message' in value
        ? (value as { error_message?: unknown }).error_message
        : undefined;
    return typeof message === 'string' && Boolean(message);
}

interface JsonPostResponse {
    status: number;
    ok: boolean;
    text: string;
}

function postJson(url: string, token: string, body?: Record<string, unknown>): Promise<JsonPostResponse> {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
    };

    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return postJsonWithUserscriptRequest(userscriptRequest, url, headers, data);

    return fetch(url, {
        method: 'POST',
        headers,
        body: data,
    }).then(async response => ({
        status: response.status,
        ok: response.ok,
        text: await response.text(),
    }));
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
