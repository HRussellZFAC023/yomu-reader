import { monkeyWindow } from 'vite-plugin-monkey/dist/client';
import { isYomuHostedAppUrl } from './app-pages';
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

type DatasetEventTarget = EventTarget & { dataset?: DOMStringMap };
type BridgeRequestDetail = { id: string; options: Parameters<UserscriptHttpRequest>[0] };
type BridgeResponseDetail = { id: string; kind: 'load' | 'error' | 'timeout'; response?: UserscriptHttpResponse; message?: string };

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
    if (!shouldInstallUserscriptHttpBridge()) return;
    const bridgeCandidate = userscriptRequestCandidates()
        .map(candidate => ({ candidate, request: asUserscriptRequest(candidate.request) }))
        .find(item => item.request);
    if (!bridgeCandidate?.request) return;
    const markerDataset = bridgeMarkerDataset();
    if (!markerDataset) return;
    if (markerDataset[BRIDGE_MARKER] === 'true') {
        dispatchUserscriptBridgeReady();
        return;
    }
    const request = bridgeCandidate.request.bind(bridgeCandidate.candidate.thisArg);
    const handledRequestIds = new Set<string>();
    markerDataset[BRIDGE_MARKER] = 'true';
    addBridgeEventListener(BRIDGE_REQUEST_EVENT, event => {
        const detail = bridgeRequestDetail(event);
        if (!detail) return;
        if (handledRequestIds.has(detail.id)) return;
        rememberBridgeRequestId(handledRequestIds, detail.id);
        const send = (kind: 'load' | 'error' | 'timeout', response?: UserscriptHttpResponse, message?: string) => {
            dispatchBridgeEvent(BRIDGE_RESPONSE_EVENT, bridgeResponseDetail(detail.id, kind, response, message));
        };
        const options = {
            ...bridgeRequestOptions(detail.options),
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

function shouldInstallUserscriptHttpBridge(): boolean {
    try {
        return typeof location !== 'undefined' && isYomuHostedAppUrl(location.href);
    } catch {
        return false;
    }
}

function dispatchUserscriptBridgeReady(): void {
    dispatchBridgeEvent(USERSCRIPT_HTTP_BRIDGE_READY_EVENT);
}

function userscriptHttpEventBridge(): UserscriptHttpRequest | undefined {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== 'true') return undefined;
    return ((options: Parameters<UserscriptHttpRequest>[0]) => new Promise<UserscriptHttpResponse>((resolve, reject) => {
        const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            options.ontimeout?.();
            reject(new Error('Request timed out.'));
        }, options.timeout ?? BRIDGE_TIMEOUT_MS);
        let cleanupBridgeResponseListener = noop;
        const cleanup = () => {
            window.clearTimeout(timeout);
            cleanupBridgeResponseListener();
        };
        const onResponse = (event: CustomEvent) => {
            const detail = bridgeResponseEventDetail(event);
            if (!detail || detail.id !== id) return;
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
        cleanupBridgeResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse as EventListener);
        const { onload: _onload, onerror: _onerror, ontimeout: _ontimeout, ...requestOptions } = options;
        dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, options: requestOptions });
    })) as UserscriptHttpRequest;
}

function addBridgeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
): () => void {
    const cleanups: Array<() => void> = [];
    if (addWindowEventListener(type, listener)) {
        cleanups.push(() => removeWindowEventListener(type, listener));
    }
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget && callAddEventListener(documentTarget, type, listener)) {
        cleanups.push(() => callRemoveEventListener(documentTarget, type, listener));
    }
    return () => {
        for (const cleanup of cleanups) cleanup();
    };
}

function dispatchBridgeEvent<T>(type: string, detail?: T): boolean {
    let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, detail));
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget) {
        dispatched = callDispatchEvent(documentTarget, createWindowCustomEvent(type, detail)) || dispatched;
    }
    return dispatched;
}

function bridgeDocumentTarget(): HTMLElement | undefined {
    if (typeof document === 'undefined') return undefined;
    return document.documentElement instanceof HTMLElement ? document.documentElement : undefined;
}

function bridgeMarkerDataset(): DOMStringMap | undefined {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement as DatasetEventTarget | null;
    return root?.dataset;
}

function callAddEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
): boolean {
    try {
        target.addEventListener(type, listener);
        return true;
    } catch {
        return false;
    }
}

function callRemoveEventListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
): void {
    try {
        target.removeEventListener(type, listener);
    } catch {
    }
}

function callDispatchEvent(target: EventTarget, event: Event): boolean {
    try {
        return target.dispatchEvent(event);
    } catch {
        return false;
    }
}

function bridgeRequestDetail(event: Event): BridgeRequestDetail | undefined {
    const detail = safeEventDetail(event);
    const id = safeReadString(detail, 'id');
    const options = safeReadProperty(detail, 'options') as Parameters<UserscriptHttpRequest>[0] | undefined;
    return id && options ? { id, options } : undefined;
}

function bridgeResponseEventDetail(event: Event): BridgeResponseDetail | undefined {
    const detail = safeEventDetail(event);
    const id = safeReadString(detail, 'id');
    const kind = safeReadString(detail, 'kind');
    if (!id || (kind !== 'load' && kind !== 'error' && kind !== 'timeout')) return undefined;
    return {
        id,
        kind,
        response: safeReadProperty(detail, 'response') as UserscriptHttpResponse | undefined,
        message: safeReadString(detail, 'message'),
    };
}

function bridgeResponseDetail(
    id: string,
    kind: BridgeResponseDetail['kind'],
    response?: UserscriptHttpResponse,
    message?: string,
): BridgeResponseDetail {
    return {
        id,
        kind,
        response: response ? bridgeResponse(response) : undefined,
        message,
    };
}

function bridgeRequestOptions(options: Parameters<UserscriptHttpRequest>[0]): Parameters<UserscriptHttpRequest>[0] {
    return {
        ...options,
        headers: options.headers ? { ...options.headers } : undefined,
        data: bridgeRequestBody(options.data),
    };
}

function bridgeResponse(response: UserscriptHttpResponse): UserscriptHttpResponse {
    return {
        status: safeReadNumber(response, 'status') ?? 0,
        response: bridgeBody(safeReadProperty(response, 'response')),
        responseText: safeReadString(response, 'responseText'),
        finalUrl: safeReadString(response, 'finalUrl'),
    };
}

function bridgeBody(value: unknown): unknown {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) {
        const bytes = value as ArrayBufferView;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    if (value instanceof Blob) return value.slice(0, value.size, value.type);
    return value;
}

function bridgeRequestBody(
    value: Parameters<UserscriptHttpRequest>[0]['data'],
): Parameters<UserscriptHttpRequest>[0]['data'] {
    return bridgeBody(value) as Parameters<UserscriptHttpRequest>[0]['data'];
}

function safeEventDetail(event: Event): unknown {
    try {
        return (event as CustomEvent).detail;
    } catch {
        return undefined;
    }
}

function safeReadProperty(source: unknown, key: string): unknown {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) return undefined;
    try {
        return (source as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

function safeReadString(source: unknown, key: string): string | undefined {
    const value = safeReadProperty(source, key);
    return typeof value === 'string' ? value : undefined;
}

function safeReadNumber(source: unknown, key: string): number | undefined {
    const value = safeReadProperty(source, key);
    return typeof value === 'number' ? value : undefined;
}

function rememberBridgeRequestId(ids: Set<string>, id: string): void {
    ids.add(id);
    if (ids.size <= 100) return;
    const oldest = ids.values().next().value;
    if (oldest) ids.delete(oldest);
}

function noop(): void {}

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
