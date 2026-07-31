import type { ManagedStateEpoch } from './managed-state-epoch';
import type { GmStorageLeaseOptions } from './gm-storage-lease';

export interface RuntimeStoredValueChangeSource {
    readonly remote: boolean;
    readonly transport: 'gm-storage' | 'extension-storage' | 'web-storage';
}

export type RuntimeManagedWebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Storage calls used by the aggregate @require runtime after the core IIFE has
 * installed the authoritative implementation. This deliberately excludes the
 * factory-reset coordinator surface: reset ownership never leaves core.
 */
export interface StorageRuntimeApi {
    readonly managedLocalStorage: RuntimeManagedWebStorage;
    readonly managedSessionStorage: RuntimeManagedWebStorage;
    readonly hasAsyncGmStorageBackend: () => boolean;
    readonly assertManagedStateMutationAllowed: () => Promise<ManagedStateEpoch>;
    readonly ensureManagedWebStorageCurrent: () => Promise<void>;
    readonly ensureManagedWebStorageCurrentSync: () => boolean;
    readonly localFallbackStoredValue: <T>(key: string, fallback: T) => T;
    readonly gmStorageGet: <T>(key: string, fallback: T) => Promise<T>;
    readonly gmStorageGetForResetEnumeration: <T>(key: string, fallback: T) => Promise<T>;
    readonly gmPrivateStorageGet: <T>(key: string, fallback: T) => Promise<T>;
    readonly withGmStorageLease: <T>(
        name: string,
        operation: () => Promise<T>,
        options?: GmStorageLeaseOptions,
    ) => Promise<T>;
    readonly gmStorageGetSync: <T>(key: string, fallback: T) => T;
    readonly gmStorageGetSharedSync: <T>(key: string, fallback: T) => T;
    readonly gmStorageSet: (key: string, value: unknown) => Promise<void>;
    readonly gmPrivateStorageSet: (key: string, value: unknown) => Promise<void>;
    readonly gmStorageSetSync: (key: string, value: unknown) => void;
    readonly gmStorageDelete: (key: string) => Promise<void>;
    readonly gmPrivateStorageDelete: (key: string) => Promise<void>;
    readonly gmStorageDeleteSync: (key: string) => void;
    readonly exportManagedStoredValues: () => Promise<Record<string, unknown>>;
    readonly importStoredValues: (values: unknown) => Promise<number>;
    readonly clearManagedBrowserCaches: () => Promise<number>;
    readonly unregisterManagedServiceWorkers: () => Promise<number>;
    readonly subscribeToStoredValueChanges: (
        key: string,
        onChange: (newValue: unknown, source: RuntimeStoredValueChangeSource) => void,
    ) => () => void;
    readonly storedValueExists: (key: string) => Promise<boolean>;
    readonly cacheManagedValueForHostedStartup: (key: string, value: unknown) => void;
    readonly isHostedYomuOrigin: () => boolean;
}

// @require libraries and the main userscript are separate IIFEs in one
// userscript sandbox. A Symbol.for slot crosses those IIFE closures without
// entering the string-keyed companion registry, which is intentionally cloned
// into Firefox's page compartment. Private GM methods must remain sandbox-only.
const STORAGE_RUNTIME_API_SLOT = Symbol.for('yomu.storage-runtime-api.v1');

type StorageRuntimeRealm = typeof globalThis & { [key: symbol]: unknown };

export function registerStorageRuntimeApi(api: StorageRuntimeApi): void {
    Object.defineProperty(globalThis as StorageRuntimeRealm, STORAGE_RUNTIME_API_SLOT, {
        configurable: true,
        enumerable: false,
        value: api,
        writable: true,
    });
}

export function storageRuntimeApi(): StorageRuntimeApi {
    const api = (globalThis as StorageRuntimeRealm)[STORAGE_RUNTIME_API_SLOT];
    if (!isStorageRuntimeApi(api)) {
        throw new Error('The authoritative Yomu storage runtime is not installed.');
    }
    return api;
}

function isStorageRuntimeApi(value: unknown): value is StorageRuntimeApi {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<StorageRuntimeApi>;
    return typeof candidate.gmStorageGet === 'function'
        && typeof candidate.gmPrivateStorageGet === 'function'
        && typeof candidate.assertManagedStateMutationAllowed === 'function'
        && typeof candidate.managedLocalStorage?.getItem === 'function'
        && typeof candidate.managedSessionStorage?.getItem === 'function';
}
