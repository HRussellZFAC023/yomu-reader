import { isYomuHostedAppUrl } from '../app-pages';
import { APP_REPOSITORY_NAME, GITHUB_PAGES_ORIGIN, USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from '../constants';
import { getUserscriptHttpRequest } from '../userscript';
import { addWindowEventListener, removeWindowEventListener } from '../window-events';

interface UserscriptHttpResponse {
    status: number;
    response: unknown;
}

const ANKI_USERSCRIPT_BRIDGE_MIN_WAIT_MS = 1_500;

export async function postAnkiJson<T>(url: string, body: string, timeoutMs: number): Promise<T> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) return await postAnkiJsonWithUserscript<T>(userscriptRequest, url, body, timeoutMs);

    if (!canFetchAnkiConnect(url)) {
        const delayedUserscriptRequest = needsHostedAnkiConnectSetupHint(url)
            ? await waitForUserscriptAnkiBridge(hostedAnkiBridgeWaitMs(timeoutMs))
            : undefined;
        if (delayedUserscriptRequest) return await postAnkiJsonWithUserscript<T>(delayedUserscriptRequest, url, body, timeoutMs);
        return Promise.reject(new Error('AnkiConnect needs the userscript request bridge on content pages.'));
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

function waitForUserscriptAnkiBridge(timeoutMs: number): Promise<UserscriptHttpRequest | undefined> {
    const immediate = getUserscriptHttpRequest();
    if (immediate || typeof window === 'undefined') return Promise.resolve(immediate);
    return new Promise(resolve => {
        let settled = false;
        const settle = (request?: UserscriptHttpRequest) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            removeWindowEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, onReady);
            resolve(request);
        };
        const onReady = () => settle(getUserscriptHttpRequest());
        addWindowEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, onReady);
        const timeoutId = window.setTimeout(() => settle(getUserscriptHttpRequest()), timeoutMs);
    });
}

function hostedAnkiBridgeWaitMs(timeoutMs: number): number {
    return Math.max(ANKI_USERSCRIPT_BRIDGE_MIN_WAIT_MS, Math.max(0, timeoutMs));
}

function canFetchAnkiConnect(url: string): boolean {
    return canFetchAnkiConnectFrom(url, safeLocationHref());
}

export function canFetchAnkiConnectFrom(url: string, currentHref: string): boolean {
    const current = readAnkiUrl(currentHref);
    if (!current) return false;
    const target = readAnkiUrl(url, current.href);
    if (!target || !isHttpUrl(target)) return false;
    if (target.origin === current.origin) return true;
    if (canLocalPreviewFetchAnkiConnect(current)) return true;
    if (!isYomuHostedAppUrl(current.href)) return false;
    if (current.origin === GITHUB_PAGES_ORIGIN) return !isLoopbackHostname(target.hostname);
    return !isLoopbackHostname(target.hostname);
}

export function needsHostedAnkiConnectSetupHint(url: string, currentHref = safeLocationHref()): boolean {
    if (getUserscriptHttpRequest()) return false;
    const current = readAnkiUrl(currentHref);
    if (!current || current.origin !== GITHUB_PAGES_ORIGIN || !isYomuHostedAppUrl(current.href)) return false;
    const target = readAnkiUrl(url, current.href);
    return Boolean(target && target.origin !== current.origin && isHttpUrl(target) && isLoopbackHostname(target.hostname));
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

function canLocalPreviewFetchAnkiConnect(current: URL): boolean {
    if (current.protocol !== 'file:' && !isLocalPreviewHostname(current.hostname)) return false;
    return isYomuHostedAppUrl(current.href) || isLocalPreviewYomuAppPath(current.pathname);
}

function isLocalPreviewHostname(hostname: string): boolean {
    return isLoopbackHostname(hostname) || hostname === '0.0.0.0';
}

function isLocalPreviewYomuAppPath(pathname: string): boolean {
    const path = pathname.replace(/\/index\.html$/, '/');
    return path === '/'
        || path.startsWith(`/${APP_REPOSITORY_NAME}/`)
        || path.endsWith('/newtab/')
        || path.endsWith('/video-player/');
}

function safeLocationHref(): string {
    return typeof location === 'undefined' ? '' : location.href;
}
