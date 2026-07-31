import { managedLocalStorage } from '../app/storage';
import { isManagedStorageKey } from '../app/managed-storage-keys';

interface PublicCacheEntry {
    t: number;
    v: unknown;
}

type PublicCacheState = Record<string, PublicCacheEntry>;

export interface PublicCache {
    read<T>(kind: string, key: string, now?: number): T | undefined;
    write(kind: string, key: string, value: unknown, now?: number): void;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 240;

// TTL + LRU JSON cache over one localStorage key, namespaced by `${kind}\n${key}`.
// Storage access is best-effort: failures fall through to the caller's memory cache.
export function createPublicCache(
    storageKey: string,
    { ttlMs = DEFAULT_TTL_MS, limit = DEFAULT_LIMIT }: { ttlMs?: number; limit?: number } = {},
): PublicCache {
    const storage = isManagedStorageKey(storageKey) ? managedLocalStorage : localStorage;
    const expiresAt = (entry: PublicCacheEntry): number => entry.t + ttlMs;

    function isEntry(value: unknown): value is PublicCacheEntry {
        if (!value || typeof value !== 'object') return false;
        const entry = value as Partial<PublicCacheEntry>;
        return typeof entry.t === 'number'
            && Number.isFinite(entry.t)
            && Object.prototype.hasOwnProperty.call(entry, 'v');
    }

    function readState(): PublicCacheState {
        try {
            const value = JSON.parse(storage.getItem(storageKey) ?? '{}');
            return value && typeof value === 'object' && !Array.isArray(value)
                ? value as PublicCacheState
                : {};
        } catch {
            return {};
        }
    }

    function writeState(state: PublicCacheState): void {
        try {
            storage.setItem(storageKey, JSON.stringify(state));
        } catch {
            // Callers can still use their memory cache.
        }
    }

    function pruneState(state: PublicCacheState, now: number): void {
        for (const [key, entry] of Object.entries(state)) {
            if (!isEntry(entry) || expiresAt(entry) <= now) delete state[key];
        }
        const entries = Object.entries(state);
        if (entries.length <= limit) return;
        entries
            .sort((a, b) => a[1].t - b[1].t)
            .slice(0, entries.length - limit)
            .forEach(([key]) => delete state[key]);
    }

    return {
        read<T>(kind: string, key: string, now = Date.now()): T | undefined {
            const state = readState();
            const cacheKey = `${kind}\n${key}`;
            const entry = state[cacheKey];
            if (!entry) return undefined;
            if (!isEntry(entry) || expiresAt(entry) <= now) {
                delete state[cacheKey];
                writeState(state);
                return undefined;
            }
            return entry.v as T;
        },
        write(kind: string, key: string, value: unknown, now = Date.now()): void {
            const state = readState();
            state[`${kind}\n${key}`] = { t: now, v: value };
            pruneState(state, now);
            writeState(state);
        },
    };
}
