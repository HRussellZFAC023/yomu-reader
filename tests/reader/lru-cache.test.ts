import { describe, expect, it } from 'vitest';

import { LruCache } from '../../src/reader/lru-cache';

describe('LruCache', () => {
    it('returns undefined for missing keys', () => {
        const cache = new LruCache<string, number>(3);
        expect(cache.get('a')).toBeUndefined();
    });

    it('stores and retrieves values', () => {
        const cache = new LruCache<string, number>(3);
        cache.set('a', 1);
        expect(cache.get('a')).toBe(1);
    });

    it('evicts the least recently used entry when full', () => {
        const cache = new LruCache<string, number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.set('d', 4); // 'a' should be evicted
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
    });

    it('promotes a recently accessed entry to prevent its eviction', () => {
        const cache = new LruCache<string, number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('c', 3);
        cache.get('a'); // promote 'a' — 'b' becomes LRU
        cache.set('d', 4);
        expect(cache.get('b')).toBeUndefined(); // 'b' was evicted
        expect(cache.get('a')).toBe(1);
        expect(cache.get('c')).toBe(3);
        expect(cache.get('d')).toBe(4);
    });

    it('overwrites an existing entry without growing the cache beyond maxSize', () => {
        const cache = new LruCache<string, number>(2);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.set('a', 99); // overwrite, not a new entry
        cache.set('c', 3);  // 'b' is now oldest — should be evicted
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('a')).toBe(99);
        expect(cache.get('c')).toBe(3);
    });

    it('clears all entries', () => {
        const cache = new LruCache<string, number>(3);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
    });

    it('handles a maxSize of 1', () => {
        const cache = new LruCache<string, number>(1);
        cache.set('a', 1);
        cache.set('b', 2);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe(2);
    });

    it('works with non-string keys', () => {
        const cache = new LruCache<number, string>(2);
        cache.set(1, 'one');
        cache.set(2, 'two');
        expect(cache.get(1)).toBe('one');
        expect(cache.get(2)).toBe('two');
    });
});
