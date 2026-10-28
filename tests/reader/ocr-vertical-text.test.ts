
import { describe, expect, it } from 'vitest';

import { isVerticalOcrBox, type OcrRect } from '../../src/reader/ocr/response-shared';



function box(width: number, height: number): OcrRect {
    return { left: 0, top: 0, width, height };
}

describe('OCR orientation fallback (isVerticalOcrBox)', () => {
    it('treats a single glyph as having no orientation (horizontal)', () => {
        expect(isVerticalOcrBox(box(42, 44), 1)).toBe(false);
    });

    it('classifies a wide multi-glyph line as horizontal', () => {
        expect(isVerticalOcrBox(box(300, 50), 6)).toBe(false);
    });

    it('classifies a tall multi-glyph column as vertical', () => {
        expect(isVerticalOcrBox(box(50, 300), 6)).toBe(true);
    });

    it('reads a near-square longer column as vertical (the old flat 1.25 ratio missed this)', () => {
        // aspect 1.16: under the previous `height > width * 1.25` rule this was
        // wrongly horizontal; a 4-glyph run that is even slightly taller than
        // wide can only be a vertical column.
        expect(isVerticalOcrBox(box(50, 58), 4)).toBe(true);
    });

    it('keeps a near-square short phrase horizontal (needs a clearer vertical margin)', () => {
        expect(isVerticalOcrBox(box(50, 52), 2)).toBe(false);
    });
});

