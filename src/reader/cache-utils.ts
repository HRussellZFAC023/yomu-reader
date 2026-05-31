export function pruneOldestCacheEntries<K, V>(cache: Map<K, V>, limit: number): void;
export function pruneOldestCacheEntries<K>(cache: Set<K>, limit: number): void;
export function pruneOldestCacheEntries(cache: Map<unknown, unknown> | Set<unknown>, limit: number): void {
    while (cache.size > limit) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
    }
}
