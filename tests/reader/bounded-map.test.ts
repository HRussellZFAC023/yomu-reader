import { describe, expect, it } from 'vitest';

import { BoundedMap } from '../../src/reader/core/bounded-map';

describe('BoundedMap', () => {
    it('behaves like a Map below the limit', () => {
        const map = new BoundedMap<string, number>(3);
        map.set('a', 1).set('b', 2);
        expect(map.size).toBe(2);
        expect(map.get('a')).toBe(1);
        expect(map.has('b')).toBe(true);
    });

    it('evicts the oldest inserted key when it exceeds the limit', () => {
        const map = new BoundedMap<string, number>(2);
        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3); // pushes past the cap → 'a' (oldest) is dropped
        expect(map.size).toBe(2);
        expect(map.has('a')).toBe(false);
        expect(map.has('b')).toBe(true);
        expect(map.has('c')).toBe(true);
    });

    it('re-setting an existing key updates in place without refreshing its age', () => {
        const map = new BoundedMap<string, number>(2);
        map.set('a', 1);
        map.set('b', 2);
        map.set('a', 10); // update, does NOT make 'a' the newest
        map.set('c', 3); // 'a' is still the oldest, so it is evicted
        expect(map.get('a')).toBeUndefined();
        expect(map.get('b')).toBe(2);
        expect(map.get('c')).toBe(3);
    });
});
