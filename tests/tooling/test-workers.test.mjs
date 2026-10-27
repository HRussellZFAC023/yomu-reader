import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reclaimableMacMemory, workerBudget } from '../../scripts/lib/test-workers.mjs';
test('worker budget uses cores and reclaimable memory, with no load-average dependency', () => {
    assert.equal(workerBudget({ cores: 10, available: 16 * 1024 ** 3, total: 32 * 1024 ** 3 }), 10);
    assert.equal(workerBudget({ cores: 2, available: 3 * 1024 ** 3, total: 8 * 1024 ** 3 }), 2);
    assert.equal(workerBudget({ cores: 10, available: 2.5 * 1024 ** 3, total: 32 * 1024 ** 3 }), 2);
    assert.equal(reclaimableMacMemory('(page size of 16384 bytes)\nPages free: 100.\nPages inactive: 200.\nPages speculative: 50.\nPages occupied by compressor: 999999.'), 350 * 16384);
});
