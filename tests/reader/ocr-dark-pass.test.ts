import { describe, expect, it } from 'vitest';

import { darkPassWanted, mergeDarkPassResult, type LuminanceField } from '../../src/reader/ocr/image-preprocess';
import type { OcrLine, OcrResult } from '../../src/reader/ocr/response';

// The dark-panel second pass must ADD recovered white-on-black text without
// injecting noise: an inverted-pass line is kept only when it sits over a dark
// region of the page and does not duplicate a normal-pass line. These tests pin
// that merge so "improve dark panels" never costs accuracy on normal pages.

const W = 100;
const H = 100;

function line(text: string, left: number, top: number, width = 20, height = 20): OcrLine {
    return { text, box: { left, top, width, height }, vertical: false };
}
function result(lines: OcrLine[]): OcrResult {
    return { width: W, height: H, lines };
}
// A 10x10 field that is dark (lum 0) on the left half, light (lum 255) on the right.
function halfDarkField(): LuminanceField {
    const size = 10;
    const lum = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) lum[y * size + x] = x < size / 2 ? 0 : 255;
    return { size, lum };
}

describe('dark-pass merge', () => {
    it('keeps an inverted line over a dark region that the normal pass missed', () => {
        const normal = result([line('白地に黒', 70, 10)]);            // bubble in the light half
        const inverted = result([line('黒地に白', 10, 10)]);          // caption in the dark half
        const merged = mergeDarkPassResult(normal, inverted, halfDarkField());
        const texts = merged!.lines.map(l => l.text);
        expect(texts).toContain('白地に黒');
        expect(texts).toContain('黒地に白');
        expect(merged!.lines).toHaveLength(2);
    });

    it('drops an inverted line that falls over a light region (likely noise)', () => {
        const normal = result([line('本文', 70, 10)]);
        const inverted = result([line('反転ノイズ', 75, 50)]);        // light half → rejected
        const merged = mergeDarkPassResult(normal, inverted, halfDarkField());
        expect(merged!.lines.map(l => l.text)).toEqual(['本文']);
    });

    it('drops an inverted line that duplicates a normal line (overlapping box)', () => {
        const normal = result([line('重複', 10, 10)]);                // already read in the dark half
        const inverted = result([line('重複', 11, 11)]);              // same region, overlaps
        const merged = mergeDarkPassResult(normal, inverted, halfDarkField());
        expect(merged!.lines).toHaveLength(1);
    });

    it('returns the normal result unchanged when the inverted pass is empty', () => {
        const normal = result([line('本文', 70, 10)]);
        expect(mergeDarkPassResult(normal, result([]), halfDarkField())).toBe(normal);
        expect(mergeDarkPassResult(normal, null, halfDarkField())).toBe(normal);
    });

    it('returns inverted dark-region lines when the normal pass found nothing (fully dark panel)', () => {
        const inverted = result([line('全暗コマ', 10, 10), line('明部ノイズ', 80, 10)]);
        const merged = mergeDarkPassResult(null, inverted, halfDarkField());
        expect(merged!.lines.map(l => l.text)).toEqual(['全暗コマ']);
    });
});

describe('when the inverted pass is spent', () => {
    const lens = { ocrInvertDarkPanels: true, ocrProvider: 'google-lens' as const };
    const read = result([line('日本語', 10, 10)]);

    it('never runs for a cloud provider whose normal pass read text', () => {
        expect(darkPassWanted(lens, false, read)).toBe(false);
        expect(darkPassWanted(lens, true, read)).toBe(false);
        expect(darkPassWanted({ ...lens, ocrProvider: 'cloud-vision' }, true, read)).toBe(false);
    });

    it('does not double an automatic cloud scan that found nothing', () => {
        expect(darkPassWanted(lens, false, null)).toBe(false);
    });

    it('runs for a scan the learner asked for that found nothing', () => {
        expect(darkPassWanted(lens, true, null)).toBe(true);
        expect(darkPassWanted(lens, true, result([]))).toBe(true);
    });

    it('runs for the Learner OCR Service, and never when the setting is off', () => {
        expect(darkPassWanted({ ...lens, ocrProvider: 'local-service' }, false, read)).toBe(true);
        expect(darkPassWanted({ ocrInvertDarkPanels: false, ocrProvider: 'local-service' }, true, null)).toBe(false);
    });
});
