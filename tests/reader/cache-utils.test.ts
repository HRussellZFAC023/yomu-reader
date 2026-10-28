import { describe, expect, it } from 'vitest';
import { pruneOldestCacheEntries } from '../../src/reader/core/cache-utils';

describe('cache utilities', () => {
    it('prunes map entries in insertion order', () => {
        const cache = new Map<string, number>([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);

        pruneOldestCacheEntries(cache, 2);

        expect([...cache.entries()]).toEqual([['c', 3], ['d', 4]]);
    });

    it('prunes set entries in insertion order', () => {
        const cache = new Set(['a', 'b', 'c']);

        pruneOldestCacheEntries(cache, 1);

        expect([...cache.values()]).toEqual(['c']);
    });

    it('no-ops when cache size is at or below the limit', () => {
        const cache = new Map<string, number>([['a', 1], ['b', 2]]);

        pruneOldestCacheEntries(cache, 2);

        expect([...cache.entries()]).toEqual([['a', 1], ['b', 2]]);
    });

    it('supports clearing down to zero', () => {
        const cache = new Set(['a', 'b']);

        pruneOldestCacheEntries(cache, 0);

        expect(cache.size).toBe(0);
    });

    it('treats undefined as a valid cache key', () => {
        const cache = new Map<undefined | string, number>([[undefined, 1], ['a', 2], ['b', 3]]);

        pruneOldestCacheEntries(cache, 1);

        expect([...cache.entries()]).toEqual([['b', 3]]);
    });
});
