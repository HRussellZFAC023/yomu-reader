import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reclaimableMacMemory, workerBudget } from '../../scripts/lib/test-workers.mjs';
test('worker budget uses cores and reclaimable memory, with no load-average dependency', () => {
    assert.equal(workerBudget({ cores: 10, available: 16 * 1024 ** 3, total: 32 * 1024 ** 3 }), 10);
    assert.equal(workerBudget({ cores: 2, available: 3 * 1024 ** 3, total: 8 * 1024 ** 3 }), 2);
    assert.equal(workerBudget({ cores: 10, available: 2.5 * 1024 ** 3, total: 32 * 1024 ** 3 }), 2);
    assert.equal(reclaimableMacMemory('(page size of 16384 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 50.\nPages occupied by compressor: 999999.'), 350 * 16384);
});

test('compiler reservations constrain jobs until released, then spare capacity is reclaimed', async () => {
    const { runSlotQueue } = await import('../../scripts/lib/slot-queue.mjs');
    let limit = 1;
    let active = 0;
    let peak = 0;
    const starts = [];
    const finish = [];
    const pending = runSlotQueue([0, 1, 2], () => limit, index => new Promise((resolve, reject) => {
        starts.push(index); peak = Math.max(peak, ++active);
        finish[index] = () => { active--; index === 2 ? reject(new Error('job failure')) : resolve(index); };
    }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(starts, [0]);
    assert.equal(peak, 1);
    limit = 3;
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.deepEqual(starts, [0, 1, 2]);
    assert.equal(peak, 3);
    finish.forEach(resolve => resolve());
    const results = await pending;
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});
