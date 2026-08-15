import { isManagedStorageKey } from './managed-storage-keys';

interface ExtensionStorageArea {
    get(key: string | null): Promise<Record<string, unknown>>;
    remove(key: string): Promise<void>;
}

interface ExtensionStorageApi {
    runtime?: { id?: string };
    storage?: { local?: ExtensionStorageArea };
}

/**
 * Physical, unprefixed values stranded by packaged Study builds before 1.9.3.
 * Compiler-owned values start with `usc_` and therefore never match Yomu's
 * managed prefixes. This module is reset/recovery-only: normal reads and writes
 * must keep using the canonical GM authority.
 */
export async function legacyExtensionManagedStorageKeys(
    root: typeof globalThis = globalThis,
): Promise<string[]> {
    const storage = extensionStorageArea(root);
    if (!storage) return [];
    const values = await storage.get(null);
    return Object.keys(values).filter(isManagedStorageKey).sort();
}

/** Explicit Factory Reset is the only automatic destructive path for legacy bytes. */
export async function clearLegacyExtensionManagedStorage(
    root: typeof globalThis = globalThis,
): Promise<number> {
    const storage = extensionStorageArea(root);
    if (!storage) return 0;
    const keys = await legacyExtensionManagedStorageKeys(root);
    await removeStorageKeys(storage, keys);
    assertAllStorageKeysRemoved(await retainedStorageKeys(storage, keys));
    return keys.length;
}

/** Whether this realm can authoritatively inspect the extension's raw store. */
export function legacyExtensionManagedStorageAvailable(
    root: typeof globalThis = globalThis,
): boolean {
    return extensionStorageArea(root) !== null;
}

function extensionStorageArea(root: typeof globalThis): ExtensionStorageArea | null {
    const candidate = root as typeof globalThis & {
        browser?: ExtensionStorageApi;
        chrome?: ExtensionStorageApi;
    };
    return activeExtensionStorageArea(candidate.browser)
        ?? activeExtensionStorageArea(candidate.chrome);
}

function activeExtensionStorageArea(api: ExtensionStorageApi | undefined): ExtensionStorageArea | null {
    if (!hasActiveExtensionRuntime(api)) return null;
    return localStorageArea(api);
}

function hasActiveExtensionRuntime(api: ExtensionStorageApi | undefined): api is ExtensionStorageApi {
    if (!api) return false;
    if (!api.runtime) return false;
    return Boolean(api.runtime.id);
}

function localStorageArea(api: ExtensionStorageApi): ExtensionStorageArea | null {
    if (!api.storage) return null;
    return api.storage.local ?? null;
}

async function removeStorageKeys(storage: ExtensionStorageArea, keys: readonly string[]): Promise<void> {
    for (const key of keys) await storage.remove(key);
}

async function retainedStorageKeys(
    storage: ExtensionStorageArea,
    keys: readonly string[],
): Promise<string[]> {
    const retained: string[] = [];
    for (const key of keys) {
        if (Object.hasOwn(await storage.get(key), key)) retained.push(key);
    }
    return retained;
}

function assertAllStorageKeysRemoved(retained: readonly string[]): void {
    if (!retained.length) return;
    throw new Error(`Unprefixed managed extension storage retained: ${retained.join(', ')}`);
}
