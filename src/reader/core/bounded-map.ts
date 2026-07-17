import { pruneOldestCacheEntries } from './cache-utils';

/**
 * A Map that caps its own size with insertion-order eviction — the same policy
 * as {@link pruneOldestCacheEntries}, which already guards the parsed-sentence
 * cache. When a `set` pushes the size past `maxSize`, the oldest *inserted* keys
 * are dropped first. Re-setting an existing key updates its value in place and
 * does NOT refresh its position (this is not an LRU; see {@link ../core/lru-cache}
 * for recency-based eviction).
 *
 * Drop-in for `new Map<K, V>()` in per-card/per-kanji session caches that would
 * otherwise grow without bound until a factory reset.
 */
export class BoundedMap<K, V> extends Map<K, V> {
    constructor(private readonly maxSize: number) {
        super();
    }

    override set(key: K, value: V): this {
        super.set(key, value);
        pruneOldestCacheEntries(this, this.maxSize);
        return this;
    }
}
