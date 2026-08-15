import { isYomuStorageBridgeHostedUrl } from '../app/pages';
import { USERSCRIPT_STORAGE_BRIDGE_READY_EVENT } from '../app/constants';
import { isBridgeManagedStorageKey, isPrivateManagedStorageKey } from '../app/managed-storage-keys';
import { bridgeEventDetail, normalizedBridgeEventDetail } from './bridge-detail';
import { addWindowEventListener, createWindowCustomEvent, dispatchWindowEvent, removeWindowEventListener } from '../platform/window-events';
import {
    clearLegacyExtensionManagedStorage,
    legacyExtensionManagedStorageAvailable,
} from '../app/extension-legacy-storage';

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
type GmStorageOp = 'get' | 'set' | 'delete' | 'list' | 'clear-private-managed'
    | 'clear-legacy-extension-managed';
type GmStorageTarget = 'extension-storage';
const GM_STORAGE_OPS: ReadonlySet<string> = new Set<GmStorageOp>([
    'get',
    'set',
    'delete',
    'list',
    'clear-private-managed',
    'clear-legacy-extension-managed',
]);

interface StorageBridgeRequestDetail {
    id: string;
    op: GmStorageOp;
    target?: GmStorageTarget;
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
    clearLegacyExtensionManagedValues(): Promise<void>;
}

type GmGetValue = <T>(key: string, defaultValue: T) => T | Promise<T>;
type GmSetValue = (key: string, value: unknown) => void | Promise<void>;
type GmDeleteValue = (key: string) => void | Promise<void>;
type GmListValues = () => string[] | Promise<string[]>;

const BRIDGE_REQUEST_EVENT = 'yomu-userscript-storage-request';
const BRIDGE_RESPONSE_EVENT = 'yomu-userscript-storage-response';
const BRIDGE_MARKER = 'yomuUserscriptStorageBridge';
const EXTENSION_STORAGE_BRIDGE_MARKER = 'yomuExtensionStorageBridge';
const EXTENSION_STORAGE_TARGET: GmStorageTarget = 'extension-storage';
const BRIDGE_TIMEOUT_MS = 10000;
let bridgeRequestListenerCleanup: (() => void) | undefined;
let extensionStorageBridgeAdvertisedByThisRealm = false;

export function getUserscriptGmStorage(): UserscriptGmStorage | undefined {
    if (!storageBridgeClientReady()) return undefined;
    return {
        getValue: <T>(key: string, fallback: T) => storageBridgeRequest({ op: 'get', key })
            .then(detail => (detail.found ? detail.value as T : fallback)),
        setValue: (key, value) => storageBridgeRequest({ op: 'set', key, value }).then(() => undefined),
        deleteValue: key => storageBridgeRequest({ op: 'delete', key }).then(() => undefined),
        listValues: () => storageBridgeRequest({ op: 'list' }).then(detail => detail.keys ?? []),
        clearPrivateManagedValues: () => storageBridgeRequest({ op: 'clear-private-managed' }).then(() => undefined),
        clearLegacyExtensionManagedValues: () => extensionStorageBridgeAdvertised()
            ? storageBridgeRequest({
                op: 'clear-legacy-extension-managed',
                target: EXTENSION_STORAGE_TARGET,
            }).then(() => undefined)
            : Promise.resolve(),
    };
}

function storageBridgeClientReady(): boolean {
    if (typeof window === 'undefined') return false;
    if (typeof document === 'undefined') return false;
    return bridgeMarkerDataset()?.[BRIDGE_MARKER] === 'true';
}

export function installUserscriptGmStorageBridge(): void {
    const installation = userscriptStorageBridgeInstallation();
    if (!installation) return;
    advertiseExtensionStorageBridge(installation.markerDataset);
    if (hasInstalledUserscriptStorageBridge(installation.markerDataset)) {
        dispatchStorageBridgeReady();
        return;
    }
    bridgeRequestListenerCleanup?.();
    installation.markerDataset[BRIDGE_MARKER] = 'true';
    const handledRequestIds = new Set<string>();
    bridgeRequestListenerCleanup = addBridgeEventListener(BRIDGE_REQUEST_EVENT, event => {
        const detail = storageBridgeRequestDetail(event);
        if (!detail || !storageBridgeResponderAccepts(detail) || handledRequestIds.has(detail.id)) return;
        rememberBridgeRequestId(handledRequestIds, detail.id);
        void handleStorageBridgeRequest(detail, installation.accessors);
    });
    dispatchStorageBridgeReady();
}

interface UserscriptStorageBridgeInstallation {
    readonly accessors: GmStorageAccessors;
    readonly markerDataset: DOMStringMap;
}

function userscriptStorageBridgeInstallation(): UserscriptStorageBridgeInstallation | undefined {
    const accessors = installableGmStorageAccessors();
    if (!accessors) return undefined;
    const markerDataset = bridgeMarkerDataset();
    return markerDataset ? { accessors, markerDataset } : undefined;
}

function installableGmStorageAccessors(): GmStorageAccessors | null | undefined {
    if (!userscriptStorageBridgeEnvironmentReady()) return undefined;
    return shouldInstallUserscriptStorageBridge() ? gmStorageAccessors() : undefined;
}

function userscriptStorageBridgeEnvironmentReady(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function advertiseExtensionStorageBridge(markerDataset: DOMStringMap): void {
    if (!legacyExtensionManagedStorageAvailable()) return;
    // A hosted page can have both an extension and a userscript-manager
    // responder. Advertise the one realm that can actually inspect raw
    // extension storage so reset can target it instead of accepting the
    // other responder's successful no-op.
    markerDataset[EXTENSION_STORAGE_BRIDGE_MARKER] = 'true';
    extensionStorageBridgeAdvertisedByThisRealm = true;
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
    if (markerDataset) {
        delete markerDataset[BRIDGE_MARKER];
        // In a mixed extension + userscript-manager install, each isolated
        // world owns a separate module instance but shares this DOM marker.
        // A userscript-only teardown must not erase the extension authority.
        if (extensionStorageBridgeAdvertisedByThisRealm) {
            delete markerDataset[EXTENSION_STORAGE_BRIDGE_MARKER];
        }
    }
    extensionStorageBridgeAdvertisedByThisRealm = false;
}

async function handleStorageBridgeRequest(detail: StorageBridgeRequestDetail, accessors: GmStorageAccessors): Promise<void> {
    const send = (response: Omit<StorageBridgeResponseDetail, 'id'>) =>
        dispatchBridgeEvent(BRIDGE_RESPONSE_EVENT, { id: detail.id, ...response });
    try {
        send(await storageBridgeOperationResponse(detail, accessors));
    } catch (error) {
        send({ ok: false, found: false, message: error instanceof Error ? error.message : String(error) });
    }
}

async function storageBridgeOperationResponse(
    detail: StorageBridgeRequestDetail,
    accessors: GmStorageAccessors,
): Promise<Omit<StorageBridgeResponseDetail, 'id'>> {
    const maintenanceResponse = await storageBridgeMaintenanceResponse(detail.op, accessors);
    if (maintenanceResponse) return maintenanceResponse;
    if (!detail.key || !isBridgeManagedStorageKey(detail.key)) {
        // Only proxy Yomu-owned keys; never let the page read/write arbitrary GM storage.
        return { ok: false, found: false, message: 'Unmanaged storage key.' };
    }
    return managedStorageBridgeResponse(detail.op, detail.key, detail.value, accessors);
}

async function storageBridgeMaintenanceResponse(
    op: GmStorageOp,
    accessors: GmStorageAccessors,
): Promise<Omit<StorageBridgeResponseDetail, 'id'> | undefined> {
    if (op === 'list') {
        return { ok: true, keys: (await accessors.listValues()).filter(isBridgeManagedStorageKey) };
    }
    if (op === 'clear-private-managed') {
        await clearPrivateManagedStorage(accessors);
        return { ok: true };
    }
    if (op === 'clear-legacy-extension-managed') {
        await clearLegacyExtensionStorageFromAuthoritativeResponder();
        return { ok: true };
    }
    return undefined;
}

async function clearLegacyExtensionStorageFromAuthoritativeResponder(): Promise<void> {
    if (!legacyExtensionManagedStorageAvailable()) {
        throw new Error('Extension storage authority is unavailable.');
    }
    await clearLegacyExtensionManagedStorage();
}

async function clearPrivateManagedStorage(accessors: GmStorageAccessors): Promise<void> {
    const privateKeys = (await accessors.listValues()).filter(isPrivateManagedStorageKey);
    for (const key of privateKeys) await accessors.deleteValue(key);
    const remaining = (await accessors.listValues()).filter(isPrivateManagedStorageKey);
    if (remaining.length) throw new Error('Private managed storage could not be cleared.');
}

async function managedStorageBridgeResponse(
    op: GmStorageOp,
    key: string,
    value: unknown,
    accessors: GmStorageAccessors,
): Promise<Omit<StorageBridgeResponseDetail, 'id'>> {
    if (op === 'get') return readStorageBridgeResponse(key, accessors);
    if (op === 'set') {
        await accessors.setValue(key, value);
        return { ok: true };
    }
    await accessors.deleteValue(key);
    return { ok: true };
}

async function readStorageBridgeResponse(
    key: string,
    accessors: GmStorageAccessors,
): Promise<Omit<StorageBridgeResponseDetail, 'id'>> {
    const value = await accessors.getValue(key, MISSING);
    return (value as Partial<typeof MISSING> | null)?.__yomuStorageBridgeMissing === true
        ? { ok: true, found: false }
        : { ok: true, found: true, value };
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
    const record = storageBridgeRequestRecord(event);
    if (!record) return undefined;
    const target = storageBridgeTarget(record.target);
    if (!validStorageBridgeTarget(record.target, target)) return undefined;
    return {
        id: record.id,
        op: record.op,
        target,
        key: storageBridgeRequestKey(record.key),
        value: record.value,
    };
}

function storageBridgeRequestRecord(event: Event): StorageBridgeRequestDetail | undefined {
    const record = storageBridgeEventRecord(event);
    if (!record) return undefined;
    if (!validStorageBridgeRequestIdentity(record)) return undefined;
    return record as StorageBridgeRequestDetail;
}

function storageBridgeEventRecord(event: Event): Partial<StorageBridgeRequestDetail> | undefined {
    const detail = normalizedBridgeEventDetail(event);
    if (!detail) return undefined;
    if (typeof detail !== 'object') return undefined;
    return detail as Partial<StorageBridgeRequestDetail>;
}

function validStorageBridgeRequestIdentity(record: Partial<StorageBridgeRequestDetail>): boolean {
    if (typeof record.id !== 'string') return false;
    return isGmStorageOp(record.op);
}

function validStorageBridgeTarget(value: unknown, target: GmStorageTarget | undefined): boolean {
    return value === undefined || target !== undefined;
}

function storageBridgeRequestKey(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
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
    return typeof value === 'string' && GM_STORAGE_OPS.has(value);
}

function storageBridgeTarget(value: unknown): GmStorageTarget | undefined {
    return value === EXTENSION_STORAGE_TARGET ? value : undefined;
}

function storageBridgeResponderAccepts(detail: StorageBridgeRequestDetail): boolean {
    return detail.target !== EXTENSION_STORAGE_TARGET || legacyExtensionManagedStorageAvailable();
}

function extensionStorageBridgeAdvertised(): boolean {
    return bridgeMarkerDataset()?.[EXTENSION_STORAGE_BRIDGE_MARKER] === 'true';
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
