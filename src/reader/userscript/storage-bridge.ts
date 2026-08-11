import { isYomuStorageBridgeHostedUrl } from '../app/pages';
import { USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../app/constants';
import { isBridgeManagedStorageKey, isPrivateManagedStorageKey } from '../app/managed-storage-keys';
import { bridgeEventDetail, normalizedBridgeEventDetail } from './bridge-detail';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from '../platform/window-events';

// GM storage event bridge.
//
// The hosted reader page (github.io / localhost newtab) runs in the page's main
// world, which has no GM_* APIs — those live only in the userscript's content
// world. Storage values are plain JSON, so unlike binary HTTP bodies they cross
// the world boundary cleanly through DOM CustomEvents. This bridge lets the
// hosted page route gmStorageGet/Set/Delete/listValues to the userscript's GM
// storage, so settings edited on the hosted page reach the shared GM store the
// userscript reads everywhere — and vice versa.

type DatasetEventTarget = EventTarget & { dataset?: DOMStringMap };
type GmStorageOp = 'get' | 'set' | 'delete' | 'list' | 'clear-private-managed';

interface StorageBridgeRequestDetail {
    id: string;
    op: GmStorageOp;
    key?: string;
    value?: unknown;
}

interface StorageBridgeResponseDetail {
    id: string;
    ok: boolean;
    found?: boolean;
    value?: unknown;
    keys?: string[];
    message?: string;
}

export interface UserscriptGmStorage {
    getValue<T>(key: string, fallback: T): Promise<T>;
    setValue(key: string, value: unknown): Promise<void>;
    deleteValue(key: string): Promise<void>;
    listValues(): Promise<string[]>;
    clearPrivateManagedValues(): Promise<void>;
}

type GmGetValue = <T>(key: string, defaultValue: T) => T | Promise<T>;
type GmSetValue = (key: string, value: unknown) => void | Promise<void>;
type GmDeleteValue = (key: string) => void | Promise<void>;
type GmListValues = () => string[] | Promise<string[]>;

const BRIDGE_REQUEST_EVENT = 'yomu-userscript-storage-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-storage-response';
const BRIDGE_MARKER = 'yomuUserscriptStorageBridge';
const BRIDGE_TIMEOUT_MS = 10000;
let bridgeRequestListenerCleanup: (() => void) | undefined;

export function getUserscriptGmStorage(): UserscriptGmStorage | undefined {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (bridgeMarkerDataset()?.[BRIDGE_MARKER] !== 'true') return undefined;
    return {
        getValue: <T>(key: string, fallback: T) => storageBridgeRequest({ op: 'get', key })
            .then(detail => (detail.found ? detail.value as T : fallback)),
        setValue: (key, value) => storageBridgeRequest({ op: 'set', key, value }).then(() => undefined),
        deleteValue: key => storageBridgeRequest({ op: 'delete', key }).then(() => undefined),
        listValues: () => storageBridgeRequest({ op: 'list' }).then(detail => detail.keys ?? []),
        clearPrivateManagedValues: () => storageBridgeRequest({ op: 'clear-private-managed' }).then(() => undefined),
    };
}

export function installUserscriptGmStorageBridge(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!shouldInstallUserscriptStorageBridge()) return;
    const accessors = gmStorageAccessors();
    if (!accessors) return;
    const markerDataset = bridgeMarkerDataset();
    if (!markerDataset) return;
    if (hasInstalledUserscriptStorageBridge(markerDataset)) {
        dispatchStorageBridgeReady();
        return;
    }
    bridgeRequestListenerCleanup?.();
    markerDataset[BRIDGE_MARKER] = 'true';
    const handledRequestIds = new Set<string>();
    bridgeRequestListenerCleanup = addBridgeEventListener(BRIDGE_REQUEST_EVENT, event => {
        const detail = storageBridgeRequestDetail(event);
        if (!detail || handledRequestIds.has(detail.id)) return;
        rememberBridgeRequestId(handledRequestIds, detail.id);
        void handleStorageBridgeRequest(detail, accessors);
    });
    dispatchStorageBridgeReady();
}

export function installUserscriptGmStorageBridgeWhenReady(): void {
    installUserscriptGmStorageBridge();
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!shouldInstallUserscriptStorageBridge()) return;
    if (hasInstalledUserscriptStorageBridge()) return;
    scheduleUserscriptStorageBridgeRetry();
}

export function uninstallUserscriptGmStorageBridge(): void {
    bridgeRequestListenerCleanup?.();
    bridgeRequestListenerCleanup = undefined;
    const markerDataset = bridgeMarkerDataset();
    if (markerDataset) delete markerDataset[BRIDGE_MARKER];
}

async function handleStorageBridgeRequest(detail: StorageBridgeRequestDetail, accessors: GmStorageAccessors): Promise<void> {
    const send = (response: Omit<StorageBridgeResponseDetail, 'id'>) =>
        dispatchBridgeEvent(BRIDGE_RESPONSE_EVENT, { id: detail.id, ...response });
    try {
        if (detail.op === 'list') {
            send({ ok: true, keys: (await accessors.listValues()).filter(isBridgeManagedStorageKey) });
            return;
        }
        if (detail.op === 'clear-private-managed') {
            const privateKeys = (await accessors.listValues()).filter(isPrivateManagedStorageKey);
            for (const key of privateKeys) await accessors.deleteValue(key);
            const remaining = (await accessors.listValues()).filter(isPrivateManagedStorageKey);
            if (remaining.length) throw new Error('Private managed storage could not be cleared.');
            send({ ok: true });
            return;
        }
        if (!detail.key || !isBridgeManagedStorageKey(detail.key)) {
            // Only proxy Yomu-owned keys; never let the page read/write arbitrary GM storage.
            send({ ok: false, found: false, message: 'Unmanaged storage key.' });
            return;
        }
        if (detail.op === 'get') {
            const value = await accessors.getValue(detail.key, MISSING);
            send((value as Partial<typeof MISSING> | null)?.__yomuStorageBridgeMissing === true
                ? { ok: true, found: false }
                : { ok: true, found: true, value });
            return;
        }
        if (detail.op === 'set') {
            await accessors.setValue(detail.key, detail.value);
            send({ ok: true });
            return;
        }
        await accessors.deleteValue(detail.key);
        send({ ok: true });
    } catch (error) {
        send({ ok: false, found: false, message: error instanceof Error ? error.message : String(error) });
    }
}

function storageBridgeRequest(request: Omit<StorageBridgeRequestDetail, 'id'>): Promise<StorageBridgeResponseDetail> {
    return new Promise((resolve, reject) => {
        const id = `yomu-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('Storage bridge request timed out.'));
        }, BRIDGE_TIMEOUT_MS);
        let cleanupResponseListener = noop;
        const cleanup = () => {
            window.clearTimeout(timeout);
            cleanupResponseListener();
        };
        const onResponse = (event: Event) => {
            const detail = storageBridgeResponseDetail(event);
            if (!detail || detail.id !== id) return;
            cleanup();
            if (detail.ok) resolve(detail);
            else reject(new Error(detail.message || 'Storage bridge request failed.'));
        };
        cleanupResponseListener = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
        dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, ...request });
    });
}

// A sentinel that survives the JSON round-trip across the world boundary only by
// value, so the content-world side compares structurally before treating it as
// "key not stored". Using an object the page is extremely unlikely to store.
const MISSING = { __yomuStorageBridgeMissing: true } as const;

interface GmStorageAccessors {
    getValue: GmGetValue;
    setValue: GmSetValue;
    deleteValue: GmDeleteValue;
    listValues: GmListValues;
}

function gmStorageAccessors(): GmStorageAccessors | null {
    const getValue = directGmGetValue();
    const setValue = directGmSetValue();
    const deleteValue = directGmDeleteValue();
    const listValues = directGmListValues();
    if (!getValue || !setValue) return null;
    return {
        getValue,
        setValue,
        deleteValue: deleteValue ?? (() => undefined),
        listValues: listValues ?? (() => { throw new Error('GM_listValues is unavailable.'); }),
    };
}

function directGmGetValue(): GmGetValue | null {
    if (typeof GM_getValue === 'function') return GM_getValue as GmGetValue;
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function directGmSetValue(): GmSetValue | null {
    if (typeof GM_setValue === 'function') return GM_setValue as GmSetValue;
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function directGmDeleteValue(): GmDeleteValue | null {
    if (typeof GM_deleteValue === 'function') return GM_deleteValue as GmDeleteValue;
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function directGmListValues(): GmListValues | null {
    if (typeof GM_listValues === 'function') return GM_listValues as GmListValues;
    const direct = (globalThis as { GM_listValues?: GmListValues }).GM_listValues;
    if (typeof direct === 'function') return direct;
    const modern = (globalThis as { GM?: { listValues?: GmListValues } }).GM?.listValues;
    return typeof modern === 'function' ? modern.bind((globalThis as { GM?: unknown }).GM) : null;
}

function shouldInstallUserscriptStorageBridge(): boolean {
    try {
        // Broader than the HTTP bridge on purpose: every trusted hosted page
        // (including the docs/reader site where the settings dialog lives) may
        // reach the shared GM store, otherwise settings edited there strand in
        // that origin's localStorage and never follow the user to other sites.
        return typeof location !== 'undefined' && isYomuStorageBridgeHostedUrl(location.href);
    } catch {
        return false;
    }
}

function scheduleUserscriptStorageBridgeRetry(): void {
    const retry = () => {
        if (hasInstalledUserscriptStorageBridge()) return;
        installUserscriptGmStorageBridge();
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

function hasInstalledUserscriptStorageBridge(markerDataset = bridgeMarkerDataset()): boolean {
    return Boolean(markerDataset?.[BRIDGE_MARKER] === 'true' && bridgeRequestListenerCleanup);
}

function dispatchStorageBridgeReady(): void {
    dispatchBridgeEvent(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT);
}

function storageBridgeRequestDetail(event: Event): StorageBridgeRequestDetail | undefined {
    const detail = normalizedBridgeEventDetail(event);
    if (!detail || typeof detail !== 'object') return undefined;
    const record = detail as Partial<StorageBridgeRequestDetail>;
    if (typeof record.id !== 'string' || !isGmStorageOp(record.op)) return undefined;
    return { id: record.id, op: record.op, key: typeof record.key === 'string' ? record.key : undefined, value: record.value };
}

function storageBridgeResponseDetail(event: Event): StorageBridgeResponseDetail | undefined {
    const detail = normalizedBridgeEventDetail(event);
    if (!detail || typeof detail !== 'object') return undefined;
    const record = detail as Partial<StorageBridgeResponseDetail>;
    if (typeof record.id !== 'string' || typeof record.ok !== 'boolean') return undefined;
    return {
        id: record.id,
        ok: record.ok,
        found: typeof record.found === 'boolean' ? record.found : undefined,
        value: record.value,
        keys: Array.isArray(record.keys) ? record.keys.filter((key): key is string => typeof key === 'string') : undefined,
        message: typeof record.message === 'string' ? record.message : undefined,
    };
}

function isGmStorageOp(value: unknown): value is GmStorageOp {
    return value === 'get' || value === 'set' || value === 'delete' || value === 'list'
        || value === 'clear-private-managed';
}

function addBridgeEventListener(type: string, listener: (event: Event) => void): () => void {
    const cleanups: Array<() => void> = [];
    if (addWindowEventListener(type, listener as EventListener)) {
        cleanups.push(() => removeWindowEventListener(type, listener as EventListener));
    }
    const documentTarget = bridgeDocumentTarget();
    if (documentTarget && callAddEventListener(documentTarget, type, listener as EventListener)) {
        cleanups.push(() => callRemoveEventListener(documentTarget, type, listener as EventListener));
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

function callAddEventListener(target: EventTarget, type: string, listener: EventListener): boolean {
    try {
        target.addEventListener(type, listener);
        return true;
    } catch {
        return false;
    }
}

function callRemoveEventListener(target: EventTarget, type: string, listener: EventListener): void {
    try {
        target.removeEventListener(type, listener);
    } catch {
        // Best-effort listener cleanup.
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
    if (ids.size <= 200) return;
    const oldest = ids.values().next().value;
    if (oldest) ids.delete(oldest);
}

function noop(): void {}
