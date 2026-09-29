import { getUserscriptHttpRequest, requestViaUserscriptManager } from '../userscript/index';
import { canDirectFetchAnkiConnectFrom } from './connection-origin';

// "request bridge" keeps isAnkiConnectAvailabilityError() matching this, so a
// bridge-less cross-origin endpoint is treated as a normal unavailable state
// (cooldown + "needs bridge" UI) rather than a hard error.
const ANKI_CONNECT_NEEDS_BRIDGE_MESSAGE = 'AnkiConnect needs the userscript request bridge for cross-origin endpoints.';

export async function postAnkiJson<T>(url: string, body: string, timeoutMs: number): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return await postAnkiJsonWithUserscript<T>(userscriptRequest, url, body, timeoutMs);

    // Packaged pages use their existing host permissions. Hosted/content pages
    // still need a bridge for cross-origin requests; do not weaken their gate.
    if (!canDirectFetchAnkiConnect(url)) {
        return Promise.reject(new Error(ANKI_CONNECT_NEEDS_BRIDGE_MESSAGE));
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

// timeoutMs used to reach the manager only, and no abort handle was ever taken.
// A manager that drops the callback left every AnkiConnect probe pending, so the
// availability cooldown never armed and the "needs bridge" UI never appeared.
// The helper enforces the same caller-supplied budget locally and aborts on it.
function postAnkiJsonWithUserscript<T>(
    userscriptRequest: UserscriptHttpRequest,
    url: string,
    body: string,
    timeoutMs: number,
): Promise<T> {
    return requestViaUserscriptManager<T>(userscriptRequest, {
        details: {
            method: 'POST',
            url,
            headers: { 'Content-Type': 'application/json' },
            data: body,
            responseType: 'json',
            timeout: timeoutMs,
        },
        readResponse: response => {
            if (response.status < 200 || response.status >= 300) throw new Error(`AnkiConnect request failed (${response.status}).`);
            return response.response as T;
        },
        onError: error => error instanceof Error ? error : new Error('AnkiConnect request failed.'),
        onTimeout: () => new Error('AnkiConnect timed out.'),
    });
}

function canDirectFetchAnkiConnect(url: string): boolean {
    return canDirectFetchAnkiConnectFrom(url, safeLocationHref());
}

export function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}
