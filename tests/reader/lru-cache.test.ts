import { describe, expect, it } from 'vitest';

import { LruCache } from '../../src/reader/core/lru-cache';
import { OperationTracker } from "../../src/reader/core/operation-token";
import { afterEach, vi } from "vitest";
import { ObjectUrlCache } from "../../src/reader/core/object-url-cache";

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

describe('OperationTracker', () => {
    it('leaves the freshly begun token live', () => {
        const tracker = new OperationTracker();
        const op = tracker.begin('load');
        expect(op.superseded).toBe(false);
    });

    it('supersedes the previous token of the same scope on the next begin', () => {
        const tracker = new OperationTracker();
        const first = tracker.begin('load');
        expect(first.superseded).toBe(false);
        const second = tracker.begin('load');
        expect(first.superseded).toBe(true);
        expect(second.superseded).toBe(false);
    });

    it('stays superseded once a newer operation begins (latest-wins is monotonic)', () => {
        const tracker = new OperationTracker();
        const first = tracker.begin('load');
        tracker.begin('load');
        tracker.begin('load');
        expect(first.superseded).toBe(true);
    });

    it('keeps scopes independent — beginning one never supersedes another', () => {
        const tracker = new OperationTracker();
        const stats = tracker.begin('stats');
        const search = tracker.begin('search');
        // A second stats op supersedes only the earlier stats op.
        const stats2 = tracker.begin('stats');
        expect(stats.superseded).toBe(true);
        expect(search.superseded).toBe(false);
        expect(stats2.superseded).toBe(false);
    });
});

describe('ObjectUrlCache lifecycle', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('expires a cached URL after the page window has been torn down', async () => {
        vi.useFakeTimers();
        const revoke = vi.fn();
        const cache = new ObjectUrlCache(60_000, revoke);
        const createUrl = vi.fn()
            .mockResolvedValueOnce('blob:first')
            .mockResolvedValueOnce('blob:second');

        await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:first');
        vi.stubGlobal('window', undefined);
        vi.advanceTimersByTime(60_000);

        expect(revoke).toHaveBeenCalledOnce();
        expect(revoke).toHaveBeenCalledWith('blob:first');
        await expect(cache.getOrCreate('audio', createUrl)).resolves.toBe('blob:second');
        expect(createUrl).toHaveBeenCalledTimes(2);
    });
});
