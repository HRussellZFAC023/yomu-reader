import { describe, expect, it } from 'vitest';

import {
    boundedSizeBalancedBatches,
    firstNonzeroStatus,
} from '../../scripts/lib/ci-test-batches.mjs';

describe('reader CI bounded isolated batching', () => {
    it('covers every file once while hard-bounding and balancing batch counts', () => {
        const files = Array.from({ length: 17 }, (_, index) => `file-${String(index).padStart(2, '0')}`);
        const sizes = new Map(files.map((file, index) => [file, index < 3 ? 1_000 - index : 1]));

        const batches = boundedSizeBalancedBatches(files, 6, file => sizes.get(file) ?? 0);

        expect(batches).toHaveLength(3);
        expect(batches.every(batch => batch.length <= 6)).toBe(true);
        expect(Math.max(...batches.map(batch => batch.length)) - Math.min(...batches.map(batch => batch.length))).toBeLessThanOrEqual(1);
        expect(batches.every(batch => batch.length > 1)).toBe(true);
        expect(batches.flat().sort()).toEqual(files);
        expect(new Set(batches.flat()).size).toBe(files.length);
        expect(batches.every(batch => batch.filter(file => (sizes.get(file) ?? 0) > 100).length === 1)).toBe(true);
    });

    it('handles an empty pass and rejects a non-positive batch limit', () => {
        expect(boundedSizeBalancedBatches([], 6, () => 1)).toEqual([]);
        expect(() => boundedSizeBalancedBatches(['file'], 0, () => 1)).toThrow('positive integer');
    });

    it('retains the first failure only after every collected pass status is available', () => {
        expect(firstNonzeroStatus([0, 7, 0, 124])).toBe(7);
        expect(firstNonzeroStatus([0, 0, 0])).toBe(0);
    });
});
