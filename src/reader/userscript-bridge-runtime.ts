import { isYomuHostedAppUrl } from './app-pages';
import { USERSCRIPT_HTTP_BRIDGE_READY_EVENT } from './constants';
import {
    bridgeEventDetail,
    bridgeRequestDetail,
    bridgeRequestOptions,
    bridgeResponseDetail,
    bridgeResponseEventDetail,
    type BridgeResponseDetail,
    type UserscriptHttpRequestOptions,
} from './userscript-bridge-detail';
import { asUserscriptRequest, isPromiseLike, userscriptRequestCandidates } from './userscript-request-source';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from './window-events';

type DatasetEventTarget = EventTarget & { dataset?: DOMStringMap };
type UserscriptBridgeResolve = (response: UserscriptHttpResponse) => void;
type UserscriptBridgeReject = (reason?: unknown) => void;

const BRIDGE_REQUEST_EVENT = 'yomu-userscript-http-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-http-response';
const BRIDGE_MARKER = 'yomuUserscriptHttpBridge';
const BRIDGE_TIMEOUT_MS = 30000;
let bridgeRequestListenerCleanup: (() => void) | undefined;

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
    if (hasInstalledUserscriptHttpBridge(markerDataset)) {
        dispatchUserscriptBridgeReady();
        return;
    }
    bridgeRequestListenerCleanup?.();
    bridgeRequestListenerCleanup = undefined;
    const request = bridgeCandidate.request.bind(bridgeCandidate.candidate.thisArg);
    const handledRequestIds = new Set<string>();
    markerDataset[BRIDGE_MARKER] = 'true';
    bridgeRequestListenerCleanup = addBridgeEventListener(BRIDGE_REQUEST_EVENT, event => {
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

export function installUserscriptHttpBridgeWhenReady(): void {
    installUserscriptHttpBridge();
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!shouldInstallUserscriptHttpBridge()) return;
    if (hasInstalledUserscriptHttpBridge()) return;
    scheduleUserscriptHttpBridgeRetry();
}

export function uninstallUserscriptHttpBridge(): void {
    bridgeRequestListenerCleanup?.();
    bridgeRequestListenerCleanup = undefined;
    const markerDataset = bridgeMarkerDataset();
    if (markerDataset) delete markerDataset[BRIDGE_MARKER];
}

function shouldInstallUserscriptHttpBridge(): boolean {
    try {
        return typeof location !== 'undefined' && isYomuHostedAppUrl(location.href);
    } catch {
        return false;
    }
}

function scheduleUserscriptHttpBridgeRetry(): void {
    const retry = () => {
        if (hasInstalledUserscriptHttpBridge()) return;
        installUserscriptHttpBridge();
    };
    if (typeof queueMicrotask === 'function') {
        queueMicrotask(retry);
    } else {
        void Promise.resolve().then(retry);
    }
    window.setTimeout(retry, 0);
    window.setTimeout(retry, 250);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', retry, { once: true });
    }
}

function hasInstalledUserscriptHttpBridge(markerDataset = bridgeMarkerDataset()): boolean {
    return Boolean(markerDataset?.[BRIDGE_MARKER] === 'true' && bridgeRequestListenerCleanup);
}

function dispatchUserscriptBridgeReady(): void {
    dispatchBridgeEvent(USERSCRIPT_HTTP_BRIDGE_READY_EVENT);
}

function userscriptHttpEventBridge(): UserscriptHttpRequest | undefined {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== 'true') return undefined;
    return ((options: UserscriptHttpRequestOptions) => new Promise<UserscriptHttpResponse>((resolve, reject) => {
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
            handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject);
        };
        cleanupBridgeResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse as EventListener);
        const { onload: _onload, onerror: _onerror, ontimeout: _ontimeout, ...requestOptions } = options;
        dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, options: requestOptions });
    })) as UserscriptHttpRequest;
}

function handleBridgeResponseEvent(
    event: CustomEvent,
    id: string,
    options: UserscriptHttpRequestOptions,
    cleanup: () => void,
    resolve: UserscriptBridgeResolve,
    reject: UserscriptBridgeReject,
): void {
    const detail = bridgeResponseEventDetail(event);
    if (!detail || detail.id !== id) return;
    cleanup();
    if (detail.kind === 'load' && detail.response) {
        options.onload?.(detail.response);
        resolve(detail.response);
        return;
    }
    rejectBridgeResponse(detail, options, reject);
}

function rejectBridgeResponse(
    detail: BridgeResponseDetail,
    options: UserscriptHttpRequestOptions,
    reject: UserscriptBridgeReject,
): void {
    const message = detail.message || 'Request failed.';
    if (detail.kind === 'timeout') options.ontimeout?.();
    else options.onerror?.(new Error(message));
    reject(new Error(message));
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
    const eventDetail = bridgeEventDetail(detail);
    let dispatched = dispatchWindowEvent(createWindowCustomEvent(type, eventDetail));
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget) {
        dispatched = callDispatchEvent(documentTarget, createWindowCustomEvent(type, eventDetail)) || dispatched;
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

function rememberBridgeRequestId(ids: Set<string>, id: string): void {
    ids.add(id);
    if (ids.size <= 100) return;
    const oldest = ids.values().next().value;
    if (oldest) ids.delete(oldest);
}

function noop(): void {}
