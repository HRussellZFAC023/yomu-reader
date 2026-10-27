import { describe, expect, it, vi } from 'vitest';

import { ConcurrencyGate, mapLimited, promiseWithTimeout, runLimited } from '../../src/reader/core/async-utils';
import { BoundedMap } from "../../src/reader/core/bounded-map";
import { pruneOldestCacheEntries } from "../../src/reader/core/cache-utils";
import { afterEach, beforeEach } from "vitest";
import { attempt, attemptAsync, attemptVoid, parseJson, setAttemptRecorder } from "../../src/reader/core/attempt";

async function measureMaxConcurrentWorkers<T>(items: T[], concurrency: number): Promise<number> {
    let active = 0;
    let maxActive = 0;

    await runLimited(items, concurrency, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>(resolve => setTimeout(resolve, 1));
        active--;
    });

    return maxActive;
}

describe('runLimited', () => {
    it('processes all items', async () => {
        const results: number[] = [];
        await runLimited([1, 2, 3, 4, 5], 2, async (item) => {
            results.push(item);
        });
        expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });

    it('returns immediately for an empty array', async () => {
        const worker = vi.fn();
        await runLimited([], 4, worker);
        expect(worker).not.toHaveBeenCalled();
    });

    it('respects concurrency by limiting simultaneous workers', async () => {
        const concurrency = 3;

        const maxActive = await measureMaxConcurrentWorkers([1, 2, 3, 4, 5, 6], concurrency);

        expect(maxActive).toBeLessThanOrEqual(concurrency);
    });

    it('passes the correct index to the worker', async () => {
        const callArgs: Array<[number, number]> = [];
        await runLimited([10, 20, 30], 2, async (item, index) => {
            callArgs.push([item, index]);
        });
        expect(callArgs.sort((a, b) => a[1] - b[1])).toEqual([[10, 0], [20, 1], [30, 2]]);
    });

    it('uses concurrency of 1 when a fractional value is given', async () => {
        const maxActive = await measureMaxConcurrentWorkers([1, 2, 3], 0.9);
        expect(maxActive).toBe(1);
    });

    it('clamps concurrency to item count when concurrency exceeds items', async () => {
        const maxActive = await measureMaxConcurrentWorkers([1, 2], 100);
        expect(maxActive).toBeLessThanOrEqual(2);
    });

    it('supports synchronous workers', async () => {
        const results: number[] = [];
        await runLimited([1, 2, 3], 2, (item) => {
            results.push(item * 2);
        });
        expect(results.sort((a, b) => a - b)).toEqual([2, 4, 6]);
    });
});

describe('mapLimited', () => {
    it('returns results in input order regardless of completion order', async () => {
        const delays = [30, 5, 20, 1];
        const out = await mapLimited(delays, 2, async (ms, i) => {
            await new Promise<void>(resolve => setTimeout(resolve, ms));
            return i;
        });
        expect(out).toEqual([0, 1, 2, 3]);
    });

    it('caps concurrency while collecting results', async () => {
        let active = 0;
        let maxActive = 0;
        const out = await mapLimited([1, 2, 3, 4, 5, 6], 2, async value => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>(resolve => setTimeout(resolve, 1));
            active--;
            return value * 10;
        });
        expect(maxActive).toBeLessThanOrEqual(2);
        expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    });
});

describe('ConcurrencyGate', () => {
    it('bounds concurrent tasks across independent call sites', async () => {
        // Models the keyless parse flood: many cues, each fanning out over
        // several enrichment tasks, all sharing ONE gate so the aggregate
        // in-flight count stays bounded instead of thousands at once.
        const gate = new ConcurrencyGate(3);
        let active = 0;
        let maxActive = 0;
        const task = () => gate.run(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise<void>(resolve => setTimeout(resolve, 2));
            active--;
        });
        // 5 "cues" × 8 "matches" = 40 tasks launched concurrently.
        await Promise.all(Array.from({ length: 40 }, () => task()));
        expect(maxActive).toBeLessThanOrEqual(3);
        expect(active).toBe(0);
    });

    it('runs all queued tasks and propagates results + errors', async () => {
        const gate = new ConcurrencyGate(2);
        const values = await Promise.all([1, 2, 3].map(n => gate.run(() => n * 2)));
        expect(values).toEqual([2, 4, 6]);
        await expect(gate.run(() => { throw new Error('boom'); })).rejects.toThrow('boom');
        // Gate is not wedged after an error: a later task still runs.
        await expect(gate.run(() => 'ok')).resolves.toBe('ok');
    });
});

describe('promiseWithTimeout', () => {
    it('resolves with the underlying value when it settles before the timeout', async () => {
        await expect(promiseWithTimeout(Promise.resolve('ok'), 1000, 'late')).resolves.toBe('ok');
    });

    it('rejects with the given message when the timeout fires first', async () => {
        await expect(promiseWithTimeout(new Promise<string>(() => {}), 10, 'timed out')).rejects.toThrow('timed out');
    });

    it('clears the pending timer once the promise wins the race', async () => {
        const clearSpy = vi.spyOn(window, 'clearTimeout');
        await promiseWithTimeout(Promise.resolve('done'), 1000, 'late');
        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
    });
});

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

describe('attempt helpers', () => {
    /**
     * `attempt`/`attemptVoid`/`attemptAsync`/`parseJson` replace silent-swallow
     * `catch` blocks. Their whole value is that the fallback is unchanged and the
     * failure is no longer invisible, so both halves are pinned here.
     */




    let debug: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        debug = vi.fn();
        setAttemptRecorder((label, error) => debug(`${label} failed`, error));
    });

    afterEach(() => {
        setAttemptRecorder(() => undefined);
        vi.restoreAllMocks();
    });

    it('returns the value and logs nothing on success', () => {
        expect(attempt(() => 41 + 1, 0, 'sum')).toBe(42);
        expect(debug).not.toHaveBeenCalled();
    });

    it('returns the fallback and records the failure', () => {
        const boom = new Error('nope');
        expect(attempt<number | null>(() => { throw boom; }, null, 'thrower')).toBeNull();
        expect(debug).toHaveBeenCalledWith('thrower failed', boom);
    });

    it('preserves falsy fallbacks exactly', () => {
        expect(attempt(() => { throw new Error('x'); }, false, 'a')).toBe(false);
        expect(attempt(() => { throw new Error('x'); }, '', 'b')).toBe('');
        expect(attempt(() => { throw new Error('x'); }, 0, 'c')).toBe(0);
        expect(attempt<undefined>(() => { throw new Error('x'); }, undefined, 'd')).toBeUndefined();
        expect(attempt(() => { throw new Error('x'); }, [], 'e')).toEqual([]);
    });

    it('never rethrows from attemptVoid', () => {
        const boom = new Error('effect blew up');
        expect(() => attemptVoid(() => { throw boom; }, 'effect')).not.toThrow();
        expect(debug).toHaveBeenCalledWith('effect failed', boom);
    });

    it('runs the effect when it does not throw', () => {
        const effect = vi.fn();
        attemptVoid(effect, 'effect');
        expect(effect).toHaveBeenCalledTimes(1);
        expect(debug).not.toHaveBeenCalled();
    });

    it('resolves the fallback for a rejected promise', async () => {
        const boom = new Error('rejected');
        await expect(attemptAsync(() => Promise.reject(boom), 'fallback', 'async')).resolves.toBe('fallback');
        expect(debug).toHaveBeenCalledWith('async failed', boom);
    });

    it('resolves the fallback for a synchronous throw inside an async attempt', async () => {
        await expect(attemptAsync<string>(() => { throw new Error('sync'); }, 'fallback', 'async-sync')).resolves.toBe('fallback');
        expect(debug).toHaveBeenCalledTimes(1);
    });

    it('resolves the value when nothing throws', async () => {
        await expect(attemptAsync(() => Promise.resolve('ok'), 'fallback', 'async-ok')).resolves.toBe('ok');
        expect(debug).not.toHaveBeenCalled();
    });

    describe('parseJson', () => {
        it('parses valid JSON', () => {
            expect(parseJson<{ a: number }>('{"a":1}', { a: 0 })).toEqual({ a: 1 });
            expect(debug).not.toHaveBeenCalled();
        });

        it('returns the fallback for absent input without logging', () => {
            expect(parseJson(null, 'fallback')).toBe('fallback');
            expect(parseJson(undefined, 'fallback')).toBe('fallback');
            expect(parseJson('', 'fallback')).toBe('fallback');
            expect(debug).not.toHaveBeenCalled();
        });

        it('returns the fallback and logs for malformed input', () => {
            expect(parseJson('{not json', 'fallback', 'settings-blob')).toBe('fallback');
            expect(debug).toHaveBeenCalledTimes(1);
            expect(debug.mock.calls[0][0]).toBe('settings-blob failed');
        });

        it('returns a parsed null as-is so it is a drop-in for JSON.parse', () => {
            expect(parseJson<string | null>('null', 'fallback')).toBeNull();
            expect(debug).not.toHaveBeenCalled();
        });
    });
});
