import { beforeEach, describe, expect, it } from 'vitest';
import { createPublicCache } from '../../src/reader/core/public-cache';

beforeEach(() => {
    localStorage.clear();
});

describe('createPublicCache', () => {
    it('round-trips a value by kind and key', () => {
        const cache = createPublicCache('test:rt');
        cache.write('vocab', 'よむ', { id: 1 });
        expect(cache.read('vocab', 'よむ')).toEqual({ id: 1 });
        expect(cache.read('vocab', 'missing')).toBeUndefined();
    });

    it('namespaces by kind so identical keys do not collide', () => {
        const cache = createPublicCache('test:kinds');
        cache.write('a', 'k', 'from-a');
        cache.write('b', 'k', 'from-b');
        expect(cache.read('a', 'k')).toBe('from-a');
        expect(cache.read('b', 'k')).toBe('from-b');
    });

    it('isolates caches that use different storage keys', () => {
        const jpdb = createPublicCache('yomu:jpdb-cache:v1');
        const jiten = createPublicCache('yomu:jiten-public-cache:v1');
        jpdb.write('card', 'x', 'jpdb-value');
        expect(jiten.read('card', 'x')).toBeUndefined();
        expect(jpdb.read('card', 'x')).toBe('jpdb-value');
    });

    it('expires entries past the TTL and purges them', () => {
        const cache = createPublicCache('test:ttl', { ttlMs: 1000 });
        cache.write('k', 'k', 'v', 0);
        expect(cache.read('k', 'k', 999)).toBe('v');
        expect(cache.read('k', 'k', 1001)).toBeUndefined();
        // The expired read purged the entry, so it stays gone even rewinding now.
        expect(cache.read('k', 'k', 0)).toBeUndefined();
    });

    it('evicts the oldest entries once the limit is exceeded', () => {
        const cache = createPublicCache('test:lru', { limit: 2 });
        cache.write('k', 'old', 1, 1);
        cache.write('k', 'mid', 2, 2);
        cache.write('k', 'new', 3, 3);
        expect(cache.read('k', 'old', 3)).toBeUndefined();
        expect(cache.read('k', 'mid', 3)).toBe(2);
        expect(cache.read('k', 'new', 3)).toBe(3);
    });

    it('survives corrupt or non-object persisted state', () => {
        const cache = createPublicCache('test:corrupt');
        localStorage.setItem('test:corrupt', 'not json {');
        expect(cache.read('k', 'k')).toBeUndefined();
        cache.write('k', 'k', 'recovered');
        expect(cache.read('k', 'k')).toBe('recovered');

        localStorage.setItem('test:corrupt', '[1,2,3]');
        expect(cache.read('k', 'k')).toBeUndefined();
    });

    it('stores falsy values distinctly from absent ones', () => {
        const cache = createPublicCache('test:falsy');
        cache.write('k', 'zero', 0);
        cache.write('k', 'empty', '');
        cache.write('k', 'null', null);
        expect(cache.read('k', 'zero')).toBe(0);
        expect(cache.read('k', 'empty')).toBe('');
        expect(cache.read('k', 'null')).toBeNull();
        expect(cache.read('k', 'never-written')).toBeUndefined();
    });
});
