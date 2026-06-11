import { getUserscriptHttpRequest } from '../userscript/index';

interface UserscriptHttpResponse {
    status: number;
    response: unknown;
}

export async function postAnkiJson<T>(url: string, body: string, timeoutMs: number): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return await postAnkiJsonWithUserscript<T>(userscriptRequest, url, body, timeoutMs);

    if (!canFetchAnkiConnect(url)) {
        return Promise.reject(new Error('AnkiConnect URL must be HTTP or HTTPS.'));
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    return await fetch(url, {
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

// Distinguishes the two ways a direct (non-bridge) AnkiConnect probe fails:
// a no-cors fetch resolving opaquely means the server IS up but rejected this
// page's origin (webCorsOriginList) — the classic 'Firefox shows not
// connected' case — while a network error means Anki/AnkiConnect isn't
// reachable at that URL at all.
export async function diagnoseAnkiConnectFailure(url: string): Promise<'cors-blocked' | 'unreachable'> {
    if (typeof fetch !== 'function') return 'unreachable';
    try {
        await fetch(url, { method: 'GET', mode: 'no-cors' });
        return 'cors-blocked';
    } catch {
        return 'unreachable';
    }
}

export function hasUserscriptAnkiBridge(): boolean {
    return Boolean(getUserscriptHttpRequest());
}

export function isAnkiConnectAvailabilityError(error: unknown): boolean {
    if (error instanceof Error && error.cause && error.cause !== error) {
        return isAnkiConnectAvailabilityError(error.cause);
    }
    if (!(error instanceof Error)) return false;
    return /timed out|failed to fetch|networkerror|request bridge/i.test(error.message);
}

function postAnkiJsonWithUserscript<T>(
    userscriptRequest: UserscriptHttpRequest,
    url: string,
    body: string,
    timeoutMs: number,
): Promise<T> {
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

function canFetchAnkiConnect(url: string): boolean {
    return canFetchAnkiConnectFrom(url, safeLocationHref());
}

export function canFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    const current = readAnkiUrl(currentHref);
    if (!current) return false;
    const target = readAnkiUrl(url, current.href);
    return Boolean(target && isHttpUrl(target));
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

function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}
