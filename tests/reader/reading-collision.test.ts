import { describe, expect, it } from 'vitest';
import { readingOverlapsPreviousLine } from '../../src/reader/dom/reading-collision';

const rect = (x: number, y: number, width: number, height: number) =>
    ({ left: x, top: y, right: x + width, bottom: y + height, width, height } as DOMRect);

describe('detached reading clearance', () => {
    it('protects a previous native line even when it has no annotations', () => {
        const source = rect(20, 30, 32, 16);
        const plainLatinLine = rect(10, 10, 180, 16);
        expect(readingOverlapsPreviousLine(source, [plainLatinLine], 36, 40, 8)).toBe(true);
    });
    it('allows a reading in a clear lane and ignores its own native base', () => {
        const source = rect(20, 38, 32, 16);
        expect(readingOverlapsPreviousLine(source, [rect(10, 10, 180, 16), source], 36, 40, 8)).toBe(false);
    });
    it('does not hide a reading because unrelated text is beside it', () => {
        expect(readingOverlapsPreviousLine(rect(20, 30, 32, 16), [rect(100, 10, 180, 16)], 36, 40, 8)).toBe(false);
    });
});
