import { describe, expect, it, vi } from 'vitest';

import { runLimited } from '../../src/reader/core/async-utils';

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
