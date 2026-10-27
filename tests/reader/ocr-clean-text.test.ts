import { describe, expect, it } from 'vitest';

import { normalizeOcrResult } from '../../src/reader/ocr/response';
import { cleanOcrText } from '../../src/reader/ocr/response-shared';
import { isVerticalOcrBox, type OcrRect } from "../../src/reader/ocr/response-shared";

// Regression: a code screenshot with one embedded kanji had EVERY space in
// the line stripped ("radar updated :reply" → "radarupdated:reply"), because
// containing any Japanese used to switch the whole line to space-less
// joining. Whitespace is OCR noise only BETWEEN Japanese characters.
describe('cleanOcrText', () => {
    it('strips OCR segment spaces inside Japanese runs', () => {
        expect(cleanOcrText('日本 語 を 読む')).toBe('日本語を読む');
        expect(cleanOcrText('読む。 それ から')).toBe('読む。それから');
    });

    it('keeps Latin spacing in mixed lines with embedded Japanese', () => {
        expect(cleanOcrText('{:radar updated :reply string :options 菜单-or-nil}'))
            .toBe('{:radar updated :reply string :options 菜单-or-nil}');
        expect(cleanOcrText('Deterministic control flow; の 説明'))
            .toBe('Deterministic control flow; の説明');
    });

    it('keeps the natural space at Latin-Japanese boundaries', () => {
        expect(cleanOcrText('iPhone を 買う')).toBe('iPhone を買う');
    });

    it('collapses whitespace runs in Latin-only lines', () => {
        expect(cleanOcrText('state  machine \t grounding')).toBe('state machine grounding');
    });

    it('normalizes fullwidth ellipsis dots', () => {
        expect(cleanOcrText('それ ．．． から')).toBe('それ…から');
    });
});

/**
 * The same rule, one layer up: a recognizer's own line fields go through the
 * cleaner above when a provider's JSON is turned into lines.
 */
describe('recognizer line text', () => {
    function lineTexts(value: unknown): string[] {
        return normalizeOcrResult(value, 800, 450)?.lines.map(line => line.text) ?? [];
    }

    it('keeps a Japanese line spaceless, exactly as before', () => {
        expect(lineTexts({
            lines: [{ text: '冒険 を 始めよう', box: { left: 10, top: 20, width: 180, height: 28 } }],
        })).toEqual(['冒険を始めよう']);
    });

    it('joins the lines of a boxless Japanese result without inserting spaces', () => {
        // No per-line box, so the whole result collapses into one string.
        expect(lineTexts({
            results: [{
                box: { left: 10, top: 20, width: 180, height: 60 },
                text: [{ content: '冒険を' }, { content: '始めよう' }],
            }],
        })).toEqual(['冒険を始めよう']);
    });
});

describe('OCR orientation fallback (isVerticalOcrBox)', () => {
    function box(width: number, height: number): OcrRect {
        return { left: 0, top: 0, width, height };
    }


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
