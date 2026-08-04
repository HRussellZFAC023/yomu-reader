// Single source of truth for "what is Yomu-managed persistent state."
//
// Before this module, factory reset enumerated managed keys ≥4 ways
// (GM_listValues, prefix scan, a hand-maintained KNOWN_MANAGED_STORAGE_KEYS
// list, MANAGED_INDEXED_DB_NAMES), so every new store (pitch-srs, cloud-sync
// pending, newtab grade queue…) that forgot one of those lists silently
// survived a factory reset. This registry replaces those parallel lists with
// one place a store declares itself, and one write-suppression flag debounced
// writers consult so they cannot re-write a key mid-reset.
//
// Enforcement lives in tests/reader/factory-reset-invariant.test.ts: it seeds
// every registered store, runs the reset, and fails if anything survives.

export type ManagedStateKind = 'gm' | 'local' | 'session' | 'idb';

export interface ManagedStateEntry {
    /**
     * Human owner label for diagnostics (the owning module, e.g. 'newtab/pitch-srs').
     */
    readonly owner: string;
    /**
     * Where the value lives: GM storage, localStorage, sessionStorage, or an
     * IndexedDB database. 'gm' entries also cover the localStorage/sessionStorage
     * mirrors written by the storage layer.
     */
    readonly kind: ManagedStateKind;
    /**
     * Exact storage key or IndexedDB database name. Mutually exclusive with `prefix`.
     */
    readonly key?: string;
    /**
     * Dynamic key family — every key the store may write starts with this prefix
     * (e.g. 'yomu-mining-context:').
     */
    readonly prefix?: string;
    /**
     * Authoritative fallback for a dynamic family when the storage backend cannot
     * list its keys. The owning store derives these keys from its own index.
     */
    readonly enumerate?: () => Promise<string[]>;
}

const entries: ManagedStateEntry[] = [];
const registeredEntryIndexes = new Map<string, number>();

let resetWritesSuppressed = false;

/**
 * Register a Yomu-managed store at its definition site. Idempotent per
 * (kind, key/prefix) so a module re-imported across test files does not duplicate.
 */
export function registerManagedState(entry: ManagedStateEntry): void {
    const identity = managedStateIdentity(entry);
    const existingIndex = registeredEntryIndexes.get(identity);
    if (existingIndex !== undefined) {
        const existing = entries[existingIndex];
        if (existing.owner !== entry.owner) {
            throw new Error(`Managed state ${identity} has conflicting owners: ${existing.owner}, ${entry.owner}.`);
        }
        if (existing.enumerate && entry.enumerate && existing.enumerate !== entry.enumerate) {
            throw new Error(`Managed state ${identity} has conflicting enumerators.`);
        }
        if (!existing.enumerate && entry.enumerate) entries[existingIndex] = { ...existing, enumerate: entry.enumerate };
        return;
    }
    registeredEntryIndexes.set(identity, entries.length);
    entries.push(entry);
}

export function registerManagedStates(list: readonly ManagedStateEntry[]): void {
    for (const entry of list) registerManagedState(entry);
}

function managedStateIdentity(entry: ManagedStateEntry): string {
    return `${entry.kind}:${entry.key ?? ''}:${entry.prefix ?? ''}`;
}

export function managedStateEntries(): readonly ManagedStateEntry[] {
    return entries;
}

/** Exact storage keys (not prefixes) across gm/local/session kinds. */
export function registeredManagedStorageKeys(): string[] {
    const keys = new Set<string>();
    for (const entry of entries) {
        if (entry.kind !== 'idb' && entry.key) keys.add(entry.key);
    }
    return [...keys];
}

/** Prefixes across gm/local/session kinds (dynamic key families). */
export function registeredManagedStoragePrefixes(): string[] {
    const prefixes = new Set<string>();
    for (const entry of entries) {
        if (entry.kind !== 'idb' && entry.prefix) prefixes.add(entry.prefix);
    }
    return [...prefixes];
}

/** IndexedDB database names. */
export function registeredManagedIndexedDbNames(): string[] {
    const names = new Set<string>();
    for (const entry of entries) {
        if (entry.kind === 'idb' && entry.key) names.add(entry.key);
    }
    return [...names];
}

/**
 * Enter the reset window: debounced/deferred writers consult
 * managedStateWritesSuppressed() and skip their flush so they cannot re-write a
 * key after clearManagedStoredValues() has cleared it.
 */
export function beginManagedStateReset(): void {
    resetWritesSuppressed = true;
}

export function endManagedStateReset(): void {
    resetWritesSuppressed = false;
}

/**
 * True while a factory reset is clearing/reloading. Debounced persisters MUST
 * check this before writing (the deferred-write-during-reset race is a core
 * cause of "factory reset did not fully reset my settings").
 */
export function managedStateWritesSuppressed(): boolean {
    return resetWritesSuppressed;
}
