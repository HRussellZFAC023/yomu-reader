import type { GmGetValue } from './managed-read-path';
import { getUserscriptGmStorage } from '../userscript/storage-bridge';

export type GmSetValue = (key: string, value: unknown) => void | Promise<void>;
export type GmDeleteValue = (key: string) => void | Promise<void>;
type GmListValues = () => string[] | Promise<string[]>;
export type GmValueChangeListener = (
    key: string,
    oldValue: unknown,
    newValue: unknown,
    remote: boolean,
) => void;
export type GmAddValueChangeListener = (key: string, listener: GmValueChangeListener) => number;
export type GmRemoveValueChangeListener = (listenerId: number) => void;

interface ExtensionStorageArea {
    get(key: string | null): Promise<Record<string, unknown>>;
    set(values: Record<string, unknown>): Promise<void>;
    remove(key: string): Promise<void>;
    getKeys?(): Promise<string[]>;
}

export interface ExtensionStorageChange {
    readonly newValue?: unknown;
}

interface ExtensionStorageChangedEvent {
    addListener(listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void): void;
    removeListener(listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void): void;
}

interface ExtensionApi {
    readonly runtime?: { readonly id?: string };
    readonly storage?: {
        readonly local?: ExtensionStorageArea;
        readonly onChanged?: ExtensionStorageChangedEvent;
    };
}

export function asyncGmGetValue(): GmGetValue | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    const direct = directGmGetValue();
    if (direct) return direct;
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
}

export function directGmGetValue(): GmGetValue | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    return legacyGmGetValue()
        ?? modernGmGetValue()
        ?? rawExtensionStorageGetValue();
}

function legacyGmGetValue(): GmGetValue | null {
    return typeof GM_getValue === 'function' ? GM_getValue as GmGetValue : null;
}

function modernGmGetValue(): GmGetValue | null {
    const modern = (globalThis as { GM?: { getValue?: GmGetValue } }).GM?.getValue;
    return typeof modern === 'function'
        ? modern.bind((globalThis as { GM?: unknown }).GM)
        : null;
}

export function asyncGmSetValue(): GmSetValue | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    const direct = directGmSetValue();
    if (direct) return direct;
    if (directGmGetValue()) return null;
    return bridgeGmSetValue();
}

export function directGmSetValue(): GmSetValue | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    return legacyGmSetValue() ?? modernGmSetValue() ?? extensionGmSetValue();
}

function legacyGmSetValue(): GmSetValue | null {
    return typeof GM_setValue === 'function' ? GM_setValue as GmSetValue : null;
}

function modernGmSetValue(): GmSetValue | null {
    const modern = (globalThis as { GM?: { setValue?: GmSetValue } }).GM?.setValue;
    return typeof modern === 'function'
        ? modern.bind((globalThis as { GM?: unknown }).GM)
        : null;
}

function extensionGmSetValue(): GmSetValue | null {
    const extension = extensionStorageArea();
    return extension ? (key, value) => extension.set({ [key]: value }) : null;
}

function bridgeGmSetValue(): GmSetValue | null {
    const bridge = getUserscriptGmStorage();
    return bridge ? (key, value) => bridge.setValue(key, value) : null;
}

export function asyncGmDeleteValue(): GmDeleteValue | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    const direct = directGmDeleteValue();
    if (direct) return direct;
    if (directGmGetValue()) return null;
    return bridgeGmDeleteValue();
}

export function directGmDeleteValue(): GmDeleteValue | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    return legacyGmDeleteValue() ?? modernGmDeleteValue() ?? extensionGmDeleteValue();
}

function legacyGmDeleteValue(): GmDeleteValue | null {
    return typeof GM_deleteValue === 'function' ? GM_deleteValue as GmDeleteValue : null;
}

function modernGmDeleteValue(): GmDeleteValue | null {
    const modern = (globalThis as { GM?: { deleteValue?: GmDeleteValue } }).GM?.deleteValue;
    return typeof modern === 'function'
        ? modern.bind((globalThis as { GM?: unknown }).GM)
        : null;
}

function extensionGmDeleteValue(): GmDeleteValue | null {
    const extension = extensionStorageArea();
    return extension ? key => extension.remove(key) : null;
}

function bridgeGmDeleteValue(): GmDeleteValue | null {
    const bridge = getUserscriptGmStorage();
    return bridge ? key => bridge.deleteValue(key) : null;
}

export function asyncGmListValues(): GmListValues | null {
    if (packagedExtensionStorageAdapterMissing()) return null;
    const direct = directGmListValues();
    if (direct) return direct;
    if (directGmGetValue()) return null;
    return bridgeGmListValues();
}

function directGmListValues(): GmListValues | null {
    return legacyGmListValues() ?? modernGmListValues() ?? extensionGmListValues();
}

function legacyGmListValues(): GmListValues | null {
    if (typeof GM_listValues === 'function') return GM_listValues as GmListValues;
    const directListValues = (globalThis as { GM_listValues?: GmListValues }).GM_listValues;
    return typeof directListValues === 'function' ? directListValues : null;
}

function modernGmListValues(): GmListValues | null {
    const modern = (globalThis as { GM?: { listValues?: GmListValues } }).GM?.listValues;
    return typeof modern === 'function'
        ? modern.bind((globalThis as { GM?: unknown }).GM)
        : null;
}

function extensionGmListValues(): GmListValues | null {
    const extension = extensionStorageArea();
    if (!extension) return null;
    return async () => extension.getKeys
        ? extension.getKeys()
        : Object.keys(await extension.get(null));
}

function bridgeGmListValues(): GmListValues | null {
    const bridge = getUserscriptGmStorage();
    return bridge ? () => bridge.listValues() : null;
}

function extensionStorageArea(): ExtensionStorageArea | null {
    return extensionCapability(extension => extension.storage?.local);
}

function extensionCapability<T>(select: (extension: ExtensionApi) => T | undefined): T | null {
    const candidate = globalThis as unknown as { browser?: ExtensionApi; chrome?: ExtensionApi };
    return activeExtensionCapability(candidate.browser, select)
        ?? activeExtensionCapability(candidate.chrome, select)
        ?? null;
}

function activeExtensionCapability<T>(
    extension: ExtensionApi | undefined,
    select: (extension: ExtensionApi) => T | undefined,
): T | undefined {
    return extension?.runtime?.id ? select(extension) : undefined;
}

export function packagedExtensionStorageAdapterMissing(): boolean {
    if (!isPackagedExtensionDocument()) return false;
    const runtimeInstalled = (globalThis as { __YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__?: unknown })
        .__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__ === true;
    return !runtimeInstalled
        || typeof GM_getValue !== 'function'
        || typeof GM_setValue !== 'function';
}

function isPackagedExtensionDocument(): boolean {
    try {
        const protocol = (globalThis as typeof globalThis & { location?: Location }).location?.protocol ?? '';
        return /^(?:chrome|moz|safari-web)-extension:$/.test(protocol);
    } catch {
        return false;
    }
}

/** Recovery-only reader for unprefixed values stranded by older packaged Study builds. */
export function rawExtensionStorageGetValue(): GmGetValue | null {
    const extension = extensionStorageArea();
    return extension ? extensionStorageGetValue(extension) : null;
}

function extensionStorageGetValue(extension: ExtensionStorageArea): GmGetValue {
    return (async <T>(key: string, fallback: T): Promise<T> => {
        const value = (await extension.get(key))[key];
        return value === undefined ? fallback : value as T;
    }) as GmGetValue;
}

export function extensionStorageChangedEvent(): ExtensionStorageChangedEvent | null {
    return extensionCapability(extension => extension.storage?.onChanged);
}
