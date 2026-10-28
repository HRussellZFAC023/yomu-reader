import { describe, expect, it, vi } from 'vitest';

import { ConcurrencyGate, mapLimited, promiseWithTimeout, runLimited } from '../../src/reader/core/async-utils';

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
