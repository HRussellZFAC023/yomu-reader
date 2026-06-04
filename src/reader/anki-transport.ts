import { isYomuHostedAppUrl } from './app-pages';
import { GITHUB_PAGES_ORIGIN } from './constants';
import { getUserscriptHttpRequest } from './userscript';

interface UserscriptHttpResponse {
    status: number;
    response: unknown;
}

export function postAnkiJson<T>(url: string, body: string, timeoutMs: number): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            const handleLoad = (response: UserscriptHttpResponse) => {
                if (response.status >= 200 && response.status < 300) resolve(response.response as T);
                else reject(new Error(`AnkiConnect request failed (${response.status}).`));
            };
            const result = userscriptRequest({
                method: 'POST',
                url,
                headers: { 'Content-Type': 'application/json' },
                data: body,
                responseType: 'json',
                timeout: timeoutMs,
                onload: handleLoad,
                onerror: error => reject(error instanceof Error ? error : new Error('AnkiConnect request failed.')),
                ontimeout: () => reject(new Error('AnkiConnect timed out.')),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                (result as Promise<UserscriptHttpResponse>).then(handleLoad, reject);
            }
        });
    }

    if (!canFetchAnkiConnect(url)) {
        return Promise.reject(new Error('AnkiConnect needs the userscript request bridge on content pages.'));
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
    }).then(async response => {
        if (!response.ok) throw new Error(`AnkiConnect request failed (${response.status}).`);
        return response.json() as Promise<T>;
    }).catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('AnkiConnect timed out.');
        throw error;
    }).finally(() => {
        window.clearTimeout(timeoutId);
    });
}

export function isAnkiConnectAvailabilityError(error: unknown): boolean {
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isAnkiConnectAvailabilityError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /timed out|failed to fetch|networkerror|request bridge/i.test(error.message);
}

export function canFetchAnkiConnect(url: string): boolean {
    return canFetchAnkiConnectFrom(url, safeLocationHref());
}

export function canFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    const current = readAnkiUrl(currentHref);
    if (!current) return false;
    const target = readAnkiUrl(url, current.href);
    if (!target) return false;
    if (target.origin === current.origin) return true;
    if (isLoopbackHostname(current.hostname)) return true;
    // Hosted pages keep loopback AnkiConnect traffic on the userscript bridge.
    return isYomuHostedAppUrl(current.href) && isHttpUrl(target) && !isLoopbackHostname(target.hostname);
}

export function needsHostedAnkiConnectSetupHint(url: string, currentHref = safeLocationHref()): boolean {
    if (getUserscriptHttpRequest()) return false;
    const current = readAnkiUrl(currentHref);
    if (!current || current.origin !== GITHUB_PAGES_ORIGIN || !isYomuHostedAppUrl(current.href)) return false;
    const target = readAnkiUrl(url, current.href);
    return Boolean(target && target.origin !== current.origin && isHttpUrl(target));
}

function readAnkiUrl(value: string, base?: string): URL | null {
    try {
        return new URL(value, base);
    } catch {
        return null;
    }
}

function isHttpUrl(url: URL): boolean {
    return url.protocol === 'http:' || url.protocol === 'https:';
}

function isLoopbackHostname(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}
