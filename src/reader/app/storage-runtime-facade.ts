import { storageRuntimeApi, type RuntimeStoredValueChangeSource } from './storage-runtime-bridge';
import type { ManagedStateEpoch } from './managed-state-epoch';

export type { GmStorageLeaseOptions } from './gm-storage-lease';
export type StoredValueChangeSource = RuntimeStoredValueChangeSource;

export const managedLocalStorage = managedWebStorageProxy('managedLocalStorage');
export const managedSessionStorage = managedWebStorageProxy('managedSessionStorage');

export function hasAsyncGmStorageBackend(): boolean {
    return storageRuntimeApi().hasAsyncGmStorageBackend();
}

export function assertManagedStateMutationAllowed(): Promise<ManagedStateEpoch> {
    return storageRuntimeApi().assertManagedStateMutationAllowed();
}

export function ensureManagedWebStorageCurrent(): Promise<void> {
    return storageRuntimeApi().ensureManagedWebStorageCurrent();
}

export function ensureManagedWebStorageCurrentSync(): boolean {
    return storageRuntimeApi().ensureManagedWebStorageCurrentSync();
}

export function localFallbackStoredValue<T>(key: string, fallback: T): T {
    return storageRuntimeApi().localFallbackStoredValue(key, fallback);
}

export function gmStorageGet<T>(key: string, fallback: T): Promise<T> {
    return storageRuntimeApi().gmStorageGet(key, fallback);
}

export function gmStorageGetForResetEnumeration<T>(key: string, fallback: T): Promise<T> {
    return storageRuntimeApi().gmStorageGetForResetEnumeration(key, fallback);
}

export function gmPrivateStorageGet<T>(key: string, fallback: T): Promise<T> {
    return storageRuntimeApi().gmPrivateStorageGet(key, fallback);
}

export function withGmStorageLease<T>(
    name: string,
    operation: () => Promise<T>,
    options: import('./gm-storage-lease').GmStorageLeaseOptions = {},
): Promise<T> {
    return storageRuntimeApi().withGmStorageLease(name, operation, options);
}

export function gmStorageGetSync<T>(key: string, fallback: T): T {
    return storageRuntimeApi().gmStorageGetSync(key, fallback);
}

export function gmStorageGetSharedSync<T>(key: string, fallback: T): T {
    return storageRuntimeApi().gmStorageGetSharedSync(key, fallback);
}

export function gmStorageSet(key: string, value: unknown): Promise<void> {
    return storageRuntimeApi().gmStorageSet(key, value);
}

export function gmPrivateStorageSet(key: string, value: unknown): Promise<void> {
    return storageRuntimeApi().gmPrivateStorageSet(key, value);
}

export function gmStorageSetSync(key: string, value: unknown): void {
    storageRuntimeApi().gmStorageSetSync(key, value);
}

export function gmStorageDelete(key: string): Promise<void> {
    return storageRuntimeApi().gmStorageDelete(key);
}

export function gmPrivateStorageDelete(key: string): Promise<void> {
    return storageRuntimeApi().gmPrivateStorageDelete(key);
}

export function gmStorageDeleteSync(key: string): void {
    storageRuntimeApi().gmStorageDeleteSync(key);
}

export function exportManagedStoredValues(): Promise<Record<string, unknown>> {
    return storageRuntimeApi().exportManagedStoredValues();
}

export function importStoredValues(values: unknown): Promise<number> {
    return storageRuntimeApi().importStoredValues(values);
}

export function clearManagedBrowserCaches(): Promise<number> {
    return storageRuntimeApi().clearManagedBrowserCaches();
}

export function unregisterManagedServiceWorkers(): Promise<number> {
    return storageRuntimeApi().unregisterManagedServiceWorkers();
}

export function subscribeToStoredValueChanges(
    key: string,
    onChange: (newValue: unknown, source: StoredValueChangeSource) => void,
): () => void {
    return storageRuntimeApi().subscribeToStoredValueChanges(key, onChange);
}

export function storedValueExists(key: string): Promise<boolean> {
    return storageRuntimeApi().storedValueExists(key);
}

export function cacheManagedValueForHostedStartup(key: string, value: unknown): void {
    storageRuntimeApi().cacheManagedValueForHostedStartup(key, value);
}

export function isHostedYomuOrigin(): boolean {
    return storageRuntimeApi().isHostedYomuOrigin();
}

function managedWebStorageProxy(
    area: 'managedLocalStorage' | 'managedSessionStorage',
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
    return {
        getItem: key => storageRuntimeApi()[area].getItem(key),
        setItem: (key, value) => storageRuntimeApi()[area].setItem(key, value),
        removeItem: key => storageRuntimeApi()[area].removeItem(key),
    };
}
