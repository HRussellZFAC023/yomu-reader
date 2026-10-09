import { isYomuPrivilegedHostedAppUrl } from '../app/pages';
import { USERSCRIPT_HTTP_BRIDGE_READY_EVENT, USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../app/constants';
import {
    bridgeEventId,
    bridgeEventOwnerId,
    bridgeEventDetail,
    bridgeProgressEventDetail,
    bridgeRequestDetail,
    bridgeRequestOptions,
    bridgeResponseDetail,
    bridgeResponseEventDetail,
    type BridgeProgressDetail,
    type BridgeResponseDetail,
    type UserscriptHttpRequestOptions,
} from './bridge-detail';
import { asUserscriptRequest, isPromiseLike, userscriptRequestCandidates } from './request-source';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from '../platform/window-events';
import { detectInstalledReaderRuntime } from '../app/runtime-presence';
import {
    bridgeRequestAddressedTo, createBridgeOwnerId, expectedBridgeKind, mayClaimBridge, readyBridgeOwner,
    type BridgeDatasetKeys, type BridgeOwner,
} from './bridge-authority';
import { installedStorageResponderReady } from './storage-bridge';

type DatasetEventTarget = EventTarget & { dataset?: DOMStringMap };
type UserscriptBridgeResolve = (response: UserscriptHttpResponse) => void;
type UserscriptBridgeReject = (reason?: unknown) => void;

const BRIDGE_REQUEST_EVENT = 'yomu-userscript-http-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-http-response';
const BRIDGE_PROBE_EVENT = 'yomu-userscript-http-probe';
const BRIDGE_PROBE_RESPONSE_EVENT = 'yomu-userscript-http-probe-response';
// Download progress, as data. A page from before it ignores the event, and a
// Reader from before it sends none, so either side may be older.
const BRIDGE_PROGRESS_EVENT = 'yomu-userscript-http-progress';
const BRIDGE_PROGRESS_INTERVAL_MS = 250;
const BRIDGE_MARKER = 'yomuUserscriptHttpBridge';
const BRIDGE_KEYS: BridgeDatasetKeys = { ready: BRIDGE_MARKER, owner: 'yomuHttpBridgeOwner', kind: 'yomuHttpBridgeKind' };
const BRIDGE_TIMEOUT_MS = 30000;
// How long an announced Reader may take to install its responder before a
// request falls back to fetch; the same bound the storage bridge waits.
const BRIDGE_READY_TIMEOUT_MS = 10000;
export const USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS = 120;
let bridgeListenerCleanup: (() => void) | undefined;
let bridgeOwnerId: string | undefined;
let clientOwner: BridgeOwner | undefined;
let eventBridgeProbeInFlight: Promise<boolean> | undefined;

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
    const kind = detectInstalledReaderRuntime() === 'extension' ? 'extension' : 'userscript';
    if (!mayClaimBridge(markerDataset, BRIDGE_KEYS, kind, bridgeOwnerId)) return;
    if (hasInstalledUserscriptHttpBridge(markerDataset)) {
        dispatchUserscriptBridgeReady();
        return;
    }
    bridgeListenerCleanup?.();
    bridgeListenerCleanup = undefined;
    const request = bridgeCandidate.request.bind(bridgeCandidate.candidate.thisArg);
    const handledRequestIds = new Set<string>();
    const ownerId = createBridgeOwnerId('yomu-http');
    bridgeOwnerId = ownerId;
    markerDataset[BRIDGE_KEYS.owner] = ownerId;
    markerDataset[BRIDGE_KEYS.kind] = kind;
    markerDataset[BRIDGE_MARKER] = 'true';
    const addressedHere = (event: Event) => bridgeRequestAddressedTo(bridgeMarkerDataset(), BRIDGE_KEYS, ownerId, bridgeEventOwnerId(event));
    const requestCleanup = addBridgeEventListener(BRIDGE_REQUEST_EVENT, event => {
        const detail = bridgeRequestDetail(event);
        if (!detail || !addressedHere(event)) return;
        if (handledRequestIds.has(detail.id)) return;
        rememberBridgeRequestId(handledRequestIds, detail.id);
        const send = (kind: 'load' | 'error' | 'timeout', response?: UserscriptHttpResponse, message?: string) => {
            dispatchBridgeEvent(BRIDGE_RESPONSE_EVENT, bridgeResponseDetail(detail.id, kind, response, message));
        };
        const options = {
            ...bridgeRequestOptions(detail.options),
            ...(detail.options.reportProgress === true ? { onprogress: forwardProgress(detail.id) } : {}),
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
    const probeCleanup = addBridgeEventListener(BRIDGE_PROBE_EVENT, event => {
        const id = bridgeEventId(event);
        if (id && addressedHere(event)) dispatchBridgeEvent(BRIDGE_PROBE_RESPONSE_EVENT, { id });
    });
    bridgeListenerCleanup = () => {
        requestCleanup();
        probeCleanup();
    };
    dispatchUserscriptBridgeReady();
}

/** Relays the manager's download progress to the page, at most every 250 ms. */
function forwardProgress(id: string): (event: { lengthComputable?: boolean; loaded: number; total: number }) => void {
    let sentAt = 0;
    return event => {
        const now = Date.now();
        if (now - sentAt < BRIDGE_PROGRESS_INTERVAL_MS) return;
        sentAt = now;
        const progress: BridgeProgressDetail = {
            id,
            loaded: Number(event.loaded) || 0,
            total: Number(event.total) || 0,
            lengthComputable: event.lengthComputable === true,
        };
        dispatchBridgeEvent(BRIDGE_PROGRESS_EVENT, progress);
    };
}

export function installUserscriptHttpBridgeWhenReady(): void {
    installUserscriptHttpBridge();
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!shouldInstallUserscriptHttpBridge()) return;
    if (hasInstalledUserscriptHttpBridge()) return;
    scheduleUserscriptHttpBridgeRetry();
}

export function uninstallUserscriptHttpBridge(): void {
    bridgeListenerCleanup?.();
    bridgeListenerCleanup = undefined;
    const markerDataset = bridgeMarkerDataset();
    if (markerDataset && markerDataset[BRIDGE_KEYS.owner] === bridgeOwnerId) {
        delete markerDataset[BRIDGE_MARKER];
        delete markerDataset[BRIDGE_KEYS.owner];
        delete markerDataset[BRIDGE_KEYS.kind];
    }
    bridgeOwnerId = undefined;
    clientOwner = undefined;
}

function shouldInstallUserscriptHttpBridge(): boolean {
    try {
        return typeof location !== 'undefined' && isYomuPrivilegedHostedAppUrl(location.href);
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
    return Boolean(markerDataset?.[BRIDGE_MARKER] === 'true' && bridgeListenerCleanup);
}

function dispatchUserscriptBridgeReady(): void {
    dispatchBridgeEvent(USERSCRIPT_HTTP_BRIDGE_READY_EVENT);
}

// The DOM-event bridge can be marked as installed yet still fail at request time
// (e.g. a Firefox Xray regression in the userscript world). Callers use this tag
// to fall back to fetch+proxy on transport-level bridge failures instead of
// treating the timeout as a final answer.
const EVENT_BRIDGE_TAG = Symbol.for('yomu.userscriptEventBridge');

export function isUserscriptEventBridgeRequest(request: unknown): boolean {
    return typeof request === 'function'
        && (request as { [EVENT_BRIDGE_TAG]?: boolean })[EVENT_BRIDGE_TAG] === true;
}

export function probeUserscriptEventBridge(request: unknown): Promise<boolean> {
    if (!isUserscriptEventBridgeRequest(request)) return Promise.resolve(true);
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
    if (eventBridgeProbeInFlight) return eventBridgeProbeInFlight;
    // Probe in this call when the owner is known; wait only while an announced Reader starts.
    const current = currentHttpBridgeOwner();
    const probe = current !== undefined
        ? (current ? probeHttpBridgeOwner(current) : Promise.resolve(false))
        : httpBridgeOwner().then(owner => owner ? probeHttpBridgeOwner(owner) : false);
    eventBridgeProbeInFlight = probe;
    void probe.then(() => {
        if (eventBridgeProbeInFlight === probe) eventBridgeProbeInFlight = undefined;
    });
    return probe;
}

function probeHttpBridgeOwner(owner: BridgeOwner): Promise<boolean> {
    return new Promise<boolean>(resolve => {
        const id = `yomu-probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        let settled = false;
        let responseCleanup = noop;
        const finish = (alive: boolean) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            responseCleanup();
            if (!alive) {
                const markerDataset = bridgeMarkerDataset();
                if (markerDataset?.[BRIDGE_MARKER] === 'true') delete markerDataset[BRIDGE_MARKER];
            }
            resolve(alive);
        };
        const timeout = window.setTimeout(() => finish(false), USERSCRIPT_EVENT_BRIDGE_PROBE_TIMEOUT_MS);
        responseCleanup = addBridgeEventListener(BRIDGE_PROBE_RESPONSE_EVENT, event => {
            if (bridgeEventId(event) === id) finish(true);
        });
        dispatchBridgeEvent(BRIDGE_PROBE_EVENT, { id, ownerId: owner.ownerId });
    });
}

/** The pinned responder, or the one an announced Reader installs as it starts, within the bound. */
function httpBridgeOwner(): Promise<BridgeOwner | null> {
    const current = currentHttpBridgeOwner();
    if (current !== undefined) return Promise.resolve(current);
    return new Promise(resolve => {
        const cleanups: Array<() => void> = [];
        const settle = (owner: BridgeOwner | null) => {
            for (const cleanup of cleanups.splice(0)) cleanup();
            resolve(owner);
        };
        const recheck = () => {
            const owner = currentHttpBridgeOwner();
            if (owner !== undefined) settle(owner);
        };
        const timeout = window.setTimeout(() => settle(null), BRIDGE_READY_TIMEOUT_MS);
        cleanups.push(() => window.clearTimeout(timeout));
        cleanups.push(addBridgeEventListener(USERSCRIPT_HTTP_BRIDGE_READY_EVENT, recheck));
        // A Reader with a chosen target installs its HTTP responder in the same
        // task as its storage responder, so look once that task has finished.
        cleanups.push(addBridgeEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, () => {
            const later = window.setTimeout(recheck, 0);
            cleanups.push(() => window.clearTimeout(later));
        }));
    });
}

/**
 * The responder this page's requests go to. undefined while an announced
 * Reader is still starting, which is until its storage responder is ready.
 * null when there is none: no Reader is announced, the pinned responder is
 * gone, or the Reader has started without one because it has no Learning
 * Target yet. Requests then use fetch, as in v1.9.3, until a responder
 * announces itself ready.
 */
function currentHttpBridgeOwner(): BridgeOwner | null | undefined {
    const dataset = bridgeMarkerDataset();
    if (clientOwner) {
        return dataset?.[BRIDGE_MARKER] === 'true' && dataset[BRIDGE_KEYS.owner] === clientOwner.ownerId ? clientOwner : null;
    }
    const expected = expectedHttpBridgeKind();
    const owner = readyBridgeOwner(dataset, BRIDGE_KEYS, expected);
    // A v1.9.3 responder publishes no owner, so there is nothing to pin.
    if (owner?.ownerId) clientOwner = owner;
    if (owner) return owner;
    return expected && !installedStorageResponderReady() ? undefined : null;
}

function expectedHttpBridgeKind() {
    return expectedBridgeKind(shouldInstallUserscriptHttpBridge);
}

function userscriptHttpEventBridge(): UserscriptHttpRequest | undefined {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (currentHttpBridgeOwner() === null) return undefined;
    return tagEventBridgeRequest((options: UserscriptHttpRequestOptions) => new Promise<UserscriptHttpResponse>((resolve, reject) => {
        const id = `yomu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const onTimeout = () => {
            cleanup();
            options.ontimeout?.();
            reject(new Error('Request timed out.'));
        };
        // Progress proves the transfer is alive, so it rearms the budget: a
        // large dictionary on a thin link must not hit a fixed wall.
        let timeout = window.setTimeout(onTimeout, options.timeout ?? BRIDGE_TIMEOUT_MS);
        let cleanupBridgeListeners = noop;
        const cleanup = () => {
            window.clearTimeout(timeout);
            cleanupBridgeListeners();
        };
        const onResponse = (event: CustomEvent) => {
            handleBridgeResponseEvent(event, id, options, cleanup, resolve, reject);
        };
        const onProgress = (event: Event) => {
            const progress = bridgeProgressEventDetail(event);
            if (progress?.id !== id) return;
            window.clearTimeout(timeout);
            timeout = window.setTimeout(onTimeout, options.timeout ?? BRIDGE_TIMEOUT_MS);
            options.onprogress?.(progress);
        };
        void httpBridgeOwner().then(owner => {
            if (!owner) {
                cleanup();
                const error = new Error('Installed Yomu request bridge is unavailable; reload to reconnect.');
                options.onerror?.(error);
                reject(error);
                return;
            }
            const reportProgress = typeof options.onprogress === 'function';
            const cleanups = [addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse as EventListener)];
            if (reportProgress) cleanups.push(addBridgeEventListener(BRIDGE_PROGRESS_EVENT, onProgress));
            cleanupBridgeListeners = () => cleanups.forEach(cleanupListener => cleanupListener());
            dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, {
                id,
                ownerId: owner.ownerId,
                options: { ...withoutCallbacks(options), ...(reportProgress ? { reportProgress: true } : {}) },
            });
        });
    }));
}

/**
 * Every callback stays on this side. A function cannot be structured-cloned, and
 * the browser hands an installed Reader in another world a `null` detail rather
 * than the rest of the request -- so one `onprogress` silently dropped every
 * dictionary download until the page's own 120 s deadline fired.
 */
function withoutCallbacks(options: UserscriptHttpRequestOptions): UserscriptHttpRequestOptions {
    return Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value !== 'function')) as UserscriptHttpRequestOptions;
}

function tagEventBridgeRequest(request: (options: UserscriptHttpRequestOptions) => Promise<UserscriptHttpResponse>): UserscriptHttpRequest {
    (request as unknown as { [EVENT_BRIDGE_TAG]?: boolean })[EVENT_BRIDGE_TAG] = true;
    return request as UserscriptHttpRequest;
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
