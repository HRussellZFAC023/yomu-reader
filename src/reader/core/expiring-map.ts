export interface ExpiringEntry {
    expiresAt: number;
}

export function pruneExpiringMapEntries<T extends ExpiringEntry>(cache: Map<string, T>, limit: number, now = Date.now()): void {
    for (const [key, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > limit) {
        const oldest = cache.keys().next().value;
        if (typeof oldest !== 'string') break;
        cache.delete(oldest);
    }
}
