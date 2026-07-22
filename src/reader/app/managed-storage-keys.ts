// Shared definition of which storage keys Yomu owns. Kept in its own module so
// both the storage layer (app/storage.ts) and the userscript GM storage bridge
// (userscript/storage-bridge.ts) can reuse it without an import cycle.
export const MANAGED_STORAGE_KEY_PREFIXES = [
    'yomu-',
    'yomu:',
    'yomu.',
    // Yomu-internal redirect handoff keys use a leading double underscore.
    // Factory reset clears hosted web storage by managed prefix, so include it.
    '__yomu',
    'jpdb-reader-',
    'jpdb-popup-reader-',
];

export function isManagedStorageKey(key: string): boolean {
    return MANAGED_STORAGE_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Secrets stay managed for reset, but never cross page-world or backup bridges. */
export function isPrivateManagedStorageKey(key: string): boolean {
    return key.startsWith('yomu:private:');
}

export function isBridgeManagedStorageKey(key: string): boolean {
    return isManagedStorageKey(key) && !isPrivateManagedStorageKey(key);
}
