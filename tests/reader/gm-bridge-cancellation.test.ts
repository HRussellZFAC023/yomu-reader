import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { gmStorageBridgeInitProgram } from '../../scripts/lib/smoke-harness.mjs';

const requestBridgeName = '__yomuGmCancellationTest';
const profileWindow = window as typeof window & Record<string, any>;
const originalGlobals = new Map<string, unknown>();

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const [name, value] of originalGlobals) {
        if (value === undefined) delete profileWindow[name];
        else profileWindow[name] = value;
    }
    originalGlobals.clear();
    localStorage.clear();
});

describe('GM bridge cancellation', () => {
    it('returns an abort handle and suppresses a late callback response', async () => {
        let resolveBridge: ((value: unknown) => void) | undefined;
        installWindowValue(requestBridgeName, () => new Promise(resolve => { resolveBridge = resolve; }));
        installGmBridge();
        const onload = vi.fn();
        const onabort = vi.fn();

        const handle = profileWindow.GM_xmlhttpRequest({
            url: 'https://jpdb.io/api/v1/parse',
            onload,
            onabort,
        });
        await vi.waitFor(() => expect(resolveBridge).toBeTypeOf('function'));
        handle.abort();
        resolveBridge?.({ status: 200, responseText: '{}' });
        await Promise.resolve();
        await Promise.resolve();

        expect(onabort).toHaveBeenCalledOnce();
        expect(onload).not.toHaveBeenCalled();
    });

    it('uses an abortable browser-session fetch for configured timedtext routes', async () => {
        const pendingFetch = installPendingTimedtextFetch();
        const onabort = vi.fn();

        const handle = profileWindow.GM_xmlhttpRequest({
            url: 'https://www.youtube.com/api/timedtext?lang=ja',
            onabort,
        });
        await vi.waitFor(() => expect(pendingFetch.fetchMock).toHaveBeenCalledOnce());
        handle.abort();

        expect(pendingFetch.signal()?.aborted).toBe(true);
        expect(onabort).toHaveBeenCalledOnce();
    });

    it('returns timedtext from browser-session fetch with credentials, headers, body, and observer evidence', async () => {
        const responseText = '<transcript><text>日本語</text></transcript>';
        const fetchMock = vi.fn(async () => ({
            status: 200,
            text: async () => responseText,
            headers: { get: (name: string) => name === 'content-type' ? 'application/xml' : null },
        }));
        const observer = vi.fn(async () => ({ status: 204, responseText: '' }));
        vi.stubGlobal('fetch', fetchMock);
        installWindowValue(requestBridgeName, observer);
        installGmBridge([{ origin: 'https://www.youtube.com', pathname: '/api/timedtext' }]);

        const loaded = await new Promise<Record<string, any>>((resolve, reject) => {
            profileWindow.GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://www.youtube.com/api/timedtext?lang=ja',
                headers: { 'x-profile-proof': 'timedtext' },
                data: 'caption-request-body',
                onload: resolve,
                onerror: reject,
            });
        });

        expect(fetchMock).toHaveBeenCalledWith('https://www.youtube.com/api/timedtext?lang=ja', expect.objectContaining({
            method: 'POST',
            headers: { 'x-profile-proof': 'timedtext' },
            body: 'caption-request-body',
            credentials: 'include',
            redirect: 'follow',
            signal: expect.any(AbortSignal),
        }));
        expect(observer).toHaveBeenCalledWith(expect.objectContaining({
            data: 'caption-request-body',
            browserFetchObservation: {
                status: 200,
                bytes: new TextEncoder().encode(responseText).byteLength,
                format: 'xml',
                contentType: 'application/xml',
            },
        }));
        expect(loaded).toMatchObject({ status: 200, responseText, response: responseText });
    });

    it('composes GM timeout settlement with transport abort', async () => {
        vi.useFakeTimers();
        const pendingFetch = installPendingTimedtextFetch();
        const ontimeout = vi.fn();
        const onabort = vi.fn();
        const onerror = vi.fn();

        profileWindow.GM_xmlhttpRequest({
            url: 'https://www.youtube.com/api/timedtext?lang=ja',
            timeout: 25,
            ontimeout,
            onabort,
            onerror,
        });
        await Promise.resolve();
        await Promise.resolve();
        vi.advanceTimersByTime(25);
        await Promise.resolve();

        expect(pendingFetch.fetchMock).toHaveBeenCalledOnce();
        expect(pendingFetch.signal()?.aborted).toBe(true);
        expect(ontimeout).toHaveBeenCalledOnce();
        expect(onabort).not.toHaveBeenCalled();
        expect(onerror).not.toHaveBeenCalled();
    });
});

function installPendingTimedtextFetch() {
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        observedSignal = init.signal as AbortSignal;
        observedSignal.addEventListener('abort', () => reject(observedSignal?.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    installWindowValue(requestBridgeName, vi.fn());
    installGmBridge([{ origin: 'https://www.youtube.com', pathname: '/api/timedtext' }]);
    return { fetchMock, signal: () => observedSignal };
}

function installGmBridge(browserFetchRoutes: Array<{ origin: string; pathname: string }> = []): void {
    for (const name of [
        'GM',
        'GM_xmlhttpRequest',
        'GM_getValue',
        'GM_setValue',
        'GM_deleteValue',
        'GM_listValues',
        'GM_addStyle',
        'GM_getResourceText',
        'GM_registerMenuCommand',
    ]) {
        rememberWindowValue(name);
    }
    const program = gmStorageBridgeInitProgram({
        key: 'settings',
        value: {},
        requestBridgeName,
        browserFetchRoutes,
    });
    new Function(program)();
}

function installWindowValue(name: string, value: unknown): void {
    rememberWindowValue(name);
    profileWindow[name] = value;
}

function rememberWindowValue(name: string): void {
    if (!originalGlobals.has(name)) originalGlobals.set(name, profileWindow[name]);
}
