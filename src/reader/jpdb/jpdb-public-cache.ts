export const PUBLIC_JPDB_CACHE_STORAGE_KEY = 'yomu:jpdb-cache:v1';

const PUBLIC_JPDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PUBLIC_JPDB_CACHE_LIMIT = 240;

interface PublicJpdbCacheEntry {
    t: number;
    v: unknown;
}

type PublicJpdbCacheState = Record<string, PublicJpdbCacheEntry>;

function readCache<T>(kind: string, key: string, now = Date.now()): T | undefined {
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
}

function writeCache(kind: string, key: string, value: unknown, now = Date.now()): void {
    const state = readState();
    state[`${kind}\n${key}`] = { t: now, v: value };
    pruneState(state, now);
    writeState(state);
}

function readState(): PublicJpdbCacheState {
    try {
        const value = JSON.parse(localStorage.getItem(PUBLIC_JPDB_CACHE_STORAGE_KEY) ?? '{}');
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value as PublicJpdbCacheState
            : {};
    } catch {
        return {};
    }
}

function isEntry(value: unknown): value is PublicJpdbCacheEntry {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<PublicJpdbCacheEntry>;
    return typeof entry.t === 'number'
        && Number.isFinite(entry.t)
        && Object.prototype.hasOwnProperty.call(entry, 'v');
}

function pruneState(state: PublicJpdbCacheState, now: number): void {
    for (const [key, entry] of Object.entries(state)) {
        if (!isEntry(entry) || expiresAt(entry) <= now) delete state[key];
    }
    const entries = Object.entries(state);
    if (entries.length <= PUBLIC_JPDB_CACHE_LIMIT) return;
    entries
        .sort((a, b) => a[1].t - b[1].t)
        .slice(0, entries.length - PUBLIC_JPDB_CACHE_LIMIT)
        .forEach(([key]) => delete state[key]);
}

function expiresAt(entry: PublicJpdbCacheEntry): number {
    return entry.t + PUBLIC_JPDB_CACHE_TTL_MS;
}

function writeState(state: PublicJpdbCacheState): void {
    try {
        localStorage.setItem(PUBLIC_JPDB_CACHE_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Callers can still use their memory cache.
    }
}

export { readCache as readPublicJpdbCache, writeCache as writePublicJpdbCache };
