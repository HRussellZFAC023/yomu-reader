import { describe, expect, it } from 'vitest';
import { providerSpanBox } from '../../src/gaming/renderer/word-boxes';
import { layerInputRegions, pointInLayerRegions } from '../../src/gaming/layer-input';
import { normalizeGamingOcrResponse } from '../../src/gaming/shared';

describe('provider geometry survives desktop parsing and tokenizer boundaries', () => {
    it('uses unequal provider widths instead of distributing all glyphs evenly', () => {
        const words = [{ text: '冒険', box: { left: 0, top: 0, width: 20, height: 10 } },
            { text: 'へ行く', box: { left: 30, top: 0, width: 90, height: 10 } }];
        expect(providerSpanBox('冒険へ行く', words, 2, 3, false)).toEqual({ left: 30, top: 0, width: 30, height: 10 });
        expect(providerSpanBox('冒険へ行く', words, 1, 4, false)).toEqual({ left: 10, top: 0, width: 80, height: 10 });
        const result = normalizeGamingOcrResponse({ lines: [{ text: '冒険へ行く', box: { left: 0, top: 0, width: 120, height: 10 }, words }] }, 200, 100);
        expect(result?.lines[0].words).toEqual(words);
    });
    it('interpolates vertical spans on the vertical axis', () => {
        expect(providerSpanBox('日本語', [{ text: '日本語', box: { left: 10, top: 20, width: 20, height: 90 } }], 1, 3, true))
            .toEqual({ left: 10, top: 50, width: 20, height: 60 });
    });
    it('only captures input over valid explicit word or popup regions', () => {
        const regions = layerInputRegions([{ left: 10, top: 20, width: 30, height: 40 }, { left: NaN, top: 0, width: 100, height: 100 }]);
        expect(regions).toHaveLength(1);
        expect(pointInLayerRegions(15, 25, regions)).toBe(true);
        expect(pointInLayerRegions(40, 25, regions)).toBe(false);
        expect(pointInLayerRegions(15, 19, regions)).toBe(false);
    });
});


it('offsets nested provider words together with their enclosing OCR region', () => {
    const result = normalizeGamingOcrResponse({ ocr_regions: [{
        box: { left: 500, top: 300, width: 200, height: 100 },
        lines: [{ text: '日本語', box: { left: 10, top: 20, width: 60, height: 30 }, vertical: false,
            words: [{ text: '日本語', box: { left: 10, top: 20, width: 60, height: 30 } }] }],
    }] }, 1000, 800);
    expect(result?.lines[0].box).toEqual({ left: 510, top: 320, width: 60, height: 30 });
    expect(result?.lines[0].words?.[0].box).toEqual({ left: 510, top: 320, width: 60, height: 30 });
    expect(providerSpanBox('日本語', result!.lines[0].words!, 0, 3, false)).toEqual(result?.lines[0].box);
});
