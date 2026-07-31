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

export const MANAGED_STATE_SLOT_KEY_PREFIX = 'yomu:state-slot:v1:';
export const MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX = 'yomu:web-storage-slot:v1:';

const MANAGED_SLOT_KEY_PREFIXES = [
    MANAGED_STATE_SLOT_KEY_PREFIX,
    MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX,
] as const;

export function isManagedStorageKey(key: string): boolean {
    return MANAGED_STORAGE_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Secrets stay managed for reset, but never cross page-world or backup bridges. */
export function isPrivateManagedStorageKey(key: string): boolean {
    return logicalManagedStorageKey(key)?.startsWith('yomu:private:') === true;
}

export function isBridgeManagedStorageKey(key: string): boolean {
    const logicalKey = logicalManagedStorageKey(key);
    return logicalKey !== null
        && isManagedStorageKey(logicalKey)
        && !isPrivateManagedStorageKey(logicalKey);
}

/**
 * Resolve an epoch-scoped physical slot to the Yomu key it contains. A malformed
 * slot is rejected instead of being treated as an ordinary public `yomu:` key:
 * the userscript bridge uses this result as its page-world privacy boundary.
 */
export function logicalManagedStorageKey(key: string): string | null {
    const prefix = MANAGED_SLOT_KEY_PREFIXES.find(candidate => key.startsWith(candidate));
    if (!prefix) return key;
    const encoded = key.slice(prefix.length);
    const separator = encoded.indexOf(':');
    if (separator < 1 || separator === encoded.length - 1) return null;
    try {
        const logicalKey = decodeURIComponent(encoded.slice(separator + 1));
        return logicalKey
            && !isManagedStorageSlotKey(logicalKey)
            && isManagedStorageKey(logicalKey)
            ? logicalKey
            : null;
    } catch {
        return null;
    }
}

export function isManagedStorageSlotKey(key: string): boolean {
    return MANAGED_SLOT_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
}
