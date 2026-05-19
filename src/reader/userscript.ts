import { monkeyWindow } from 'vite-plugin-monkey/dist/client';
import { USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from './constants';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from './window-events';
type UserscriptRequestSource = {
    GM_xmlhttpRequest?: UserscriptHttpRequest;
    GM?: {
        xmlHttpRequest?: UserscriptHttpRequest;
        xmlhttpRequest?: UserscriptHttpRequest;
    };
};

type UserscriptRequestCandidate = {
    request: unknown;
    thisArg: unknown;
    source: string;
    path: string;
};

const BRIDGE_REQUEST_EVENT = 'yomu-userscript-http-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-http-response';
const BRIDGE_MARKER = 'yomuUserscriptHttpBridge';
const BRIDGE_TIMEOUT_MS = 30000;

export function getUserscriptHttpRequest(): UserscriptHttpRequest | undefined {
    for (const candidate of userscriptRequestCandidates()) {
        const request = asUserscriptRequest(candidate.request);
        if (request) {
            return request.bind(candidate.thisArg);
        }
    }
    return userscriptHttpEventBridge();
}

export function installUserscriptHttpBridge(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const bridgeCandidate = userscriptRequestCandidates()
        .map(candidate => ({ candidate, request: asUserscriptRequest(candidate.request) }))
        .find(item => item.request);
    if (!bridgeCandidate?.request) return;
    if (document.documentElement.dataset[BRIDGE_MARKER] === 'true') {
        dispatchUserscriptBridgeReady();
        return;
    }
    const request = bridgeCandidate.request.bind(bridgeCandidate.candidate.thisArg);
    document.documentElement.dataset[BRIDGE_MARKER] = 'true';
    addWindowEventListener(BRIDGE_REQUEST_EVENT, event => {
        const detail = (event as CustomEvent).detail as { id?: string; options?: Parameters<UserscriptHttpRequest>[0] } | undefined;
        if (!detail?.id || !detail.options) return;
        const send = (kind: 'load' | 'error' | 'timeout', response?: UserscriptHttpResponse, message?: string) => {
            dispatchWindowEvent(createWindowCustomEvent(BRIDGE_RESPONSE_EVENT, { id: detail.id, kind, response, message }));
        };
        const options = {
            ...detail.options,
            onload: (response: UserscriptHttpResponse) => send('load', response),
            onerror: (error: unknown) => send('error', undefined, error instanceof Error ? error.message : String(error || 'Request failed.')),
            ontimeout: () => send('timeout', undefined, 'Request timed out.'),
        };
        try {
            const result = request(options);
            if (isPromiseLike(result)) {
                result.then(response => send('load', response), error => send('error', undefined, error instanceof Error ? error.message : String(error || 'Request failed.')));
            }
        } catch (error) {
            send('error', undefined, error instanceof Error ? error.message : String(error || 'Request failed.'));
        }
    });
    dispatchUserscriptBridgeReady();
}

function dispatchUserscriptBridgeReady(): void {
    dispatchWindowEvent(createWindowCustomEvent(USERSCRIPT_HTTP_BRIDGE_READY_EVENT));
}

function userscriptHttpEventBridge(): UserscriptHttpRequest | undefined {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (document.documentElement.dataset[BRIDGE_MARKER] !== 'true') return undefined;
    return ((options: Parameters<UserscriptHttpRequest>[0]) => new Promise<UserscriptHttpResponse>((resolve, reject) => {
        const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            options.ontimeout?.();
            reject(new Error('Request timed out.'));
        }, options.timeout ?? BRIDGE_TIMEOUT_MS);
        const cleanup = () => {
            window.clearTimeout(timeout);
            removeWindowEventListener(BRIDGE_RESPONSE_EVENT, onResponse as EventListener);
        };
        const onResponse = (event: CustomEvent) => {
            const detail = event.detail as { id?: string; kind?: string; response?: UserscriptHttpResponse; message?: string } | undefined;
            if (detail?.id !== id) return;
            cleanup();
            if (detail.kind === 'load' && detail.response) {
                options.onload?.(detail.response);
                resolve(detail.response);
                return;
            }
            if (detail.kind === 'timeout') options.ontimeout?.();
            else options.onerror?.(new Error(detail?.message || 'Request failed.'));
            reject(new Error(detail?.message || 'Request failed.'));
        };
        addWindowEventListener(BRIDGE_RESPONSE_EVENT, onResponse as EventListener);
        const { onload: _onload, onerror: _onerror, ontimeout: _ontimeout, ...requestOptions } = options;
        dispatchWindowEvent(createWindowCustomEvent(BRIDGE_REQUEST_EVENT, { id, options: requestOptions }));
    })) as UserscriptHttpRequest;
}

function userscriptRequestCandidates(): UserscriptRequestCandidate[] {
    const candidates: UserscriptRequestCandidate[] = [];
    const add = (request: unknown, thisArg: unknown, source: string, path: string) => {
        candidates.push({ request, thisArg, source, path });
    };

    const direct = directUserscriptGlobals();
    add(direct.GM_xmlhttpRequest, globalThis, 'directGlobal', 'GM_xmlhttpRequest');
    add(direct.GM?.xmlHttpRequest, direct.GM, 'directGlobal', 'GM.xmlHttpRequest');
    add(direct.GM?.xmlhttpRequest, direct.GM, 'directGlobal', 'GM.xmlhttpRequest');

    for (const source of userscriptRequestSources()) {
        const label = sourceLabel(source);
        add(readSourceProperty(source, 'GM_xmlhttpRequest'), source, label, 'GM_xmlhttpRequest');
        const gm = readSourceProperty(source, 'GM');
        add(readSourceProperty(gm, 'xmlHttpRequest'), gm, label, 'GM.xmlHttpRequest');
        add(readSourceProperty(gm, 'xmlhttpRequest'), gm, label, 'GM.xmlhttpRequest');
    }
    return candidates;
}

function directUserscriptGlobals(): UserscriptRequestSource {
    return {
        GM_xmlhttpRequest: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : undefined,
        GM: typeof GM === 'object' && GM ? GM : undefined,
    };
}

function userscriptRequestSources(): UserscriptRequestSource[] {
    const sources: UserscriptRequestSource[] = [];
    const seen = new Set<unknown>();
    const add = (value: unknown) => {
        if (!isRequestSource(value) || seen.has(value)) return;
        seen.add(value);
        sources.push(value);
    };

    for (const mounted of mountedMonkeyWindows()) add(mounted);
    add(monkeyWindow);
    add(globalThis);
    if (typeof window !== 'undefined') add(window);
    return sources;
}

function mountedMonkeyWindows(): unknown[] {
    if (typeof document === 'undefined') return [];
    const windows = Object.getOwnPropertyNames(document)
        .filter(key => key.startsWith('__monkeyWindow-'))
        .map(key => readSourceProperty(document, key))
        .filter(isRequestSource);
    return windows;
}

function isRequestSource(value: unknown): value is UserscriptRequestSource {
    return Boolean(value) && (typeof value === 'object' || typeof value === 'function');
}

function readSourceProperty(source: unknown, key: string): unknown {
    if (!isRequestSource(source)) return undefined;
    try {
        return (source as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

function asUserscriptRequest(value: unknown): UserscriptHttpRequest | undefined {
    return typeof value === 'function' ? value as UserscriptHttpRequest : undefined;
}

function isPromiseLike(value: unknown): value is Promise<UserscriptHttpResponse> {
    return Boolean(value) && typeof (value as Promise<UserscriptHttpResponse>).then === 'function';
}

function sourceLabel(source: UserscriptRequestSource): string {
    if (typeof window !== 'undefined' && source === window) return 'window';
    if (source === globalThis) return 'globalThis';
    if (source === (monkeyWindow as unknown)) return 'monkeyWindow';
    return 'mountedMonkeyWindow';
}
