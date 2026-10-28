import { describe, expect, it } from 'vitest';
import { chunkArray, unique } from '../../src/reader/core/array-utils';

describe('unique', () => {
    it('removes duplicates while preserving first-seen order', () => {
        expect(unique([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
        expect(unique<string>([])).toEqual([]);
    });
});

describe('chunkArray', () => {
    it('splits into chunks of the given size, last chunk holding the remainder', () => {
        expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns one full chunk when the size divides evenly', () => {
        expect(chunkArray([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
    });

    it('returns an empty array for empty input', () => {
        expect(chunkArray([], 3)).toEqual([]);
    });
});
