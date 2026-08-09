import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { gmStorageBridgeInitProgram } from '../../scripts/lib/smoke-harness.mjs';

const requestBridgeName = '__yomuGmCancellationTest';
const profileWindow = window as typeof window & Record<string, any>;
const originalGlobals = new Map<string, unknown>();

afterEach(() => {
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
        let observedSignal: AbortSignal | undefined;
        const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
            observedSignal = init.signal as AbortSignal;
            observedSignal.addEventListener('abort', () => reject(observedSignal?.reason), { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);
        installWindowValue(requestBridgeName, vi.fn());
        installGmBridge([{ origin: 'https://www.youtube.com', pathname: '/api/timedtext' }]);
        const onabort = vi.fn();

        const handle = profileWindow.GM_xmlhttpRequest({
            url: 'https://www.youtube.com/api/timedtext?lang=ja',
            onabort,
        });
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        handle.abort();

        expect(observedSignal?.aborted).toBe(true);
        expect(onabort).toHaveBeenCalledOnce();
    });
});

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
