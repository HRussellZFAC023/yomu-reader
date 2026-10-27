import { describe, expect, it } from 'vitest';
import { reachableSubtitleBottomPercent } from '../../src/reader/subtitles/subtitle-layout';
import { youtubeCaptionFontSize } from '../../src/reader/subtitles/subtitle-caption-layout';
import { railPositionOutsideReservedRects } from '../../src/reader/subtitles/subtitle-control-rail';

const position = (height: number, belowAnchor = 0) => reachableSubtitleBottomPercent({
    preferredBottomPercent: 16, positionRect: new DOMRect(0, 68, 320, 180),
    viewportTop: 0, viewportHeight: 568, subtitleHeight: height, belowAnchor,
});

describe('caption viewport anchor', () => {
    it('keeps a fixed baseline while wrapped cues and their handle still fit', () => {
        expect(position(100)).toBe(16);
        expect(position(180)).toBe(16);
    });
    it('recovers every line and the handle when upward growth would leave the screen', () => {
        const bottom = position(310);
        expect(248 - bottom * 1.8 - 310).toBeGreaterThanOrEqual(12);
    });
    it('keeps wrapped translation overflow above the viewport bottom', () => {
        const bottom = position(200, 400);
        expect(248 - bottom * 1.8 + 400).toBeLessThanOrEqual(556);
    });
});

describe('YouTube caption size', () => {
    it('uses native size only for automatic and preserves explicit pixel choices', () => {
        expect(youtubeCaptionFontSize(0, 22, 640)).toBe(22);
        expect(youtubeCaptionFontSize(64, 22, 640)).toBe(64);
        expect(youtubeCaptionFontSize(28, 22, 640)).toBe(28);
    });
    it('scales with the player before native captions exist without shrinking below 16px', () => {
        expect(youtubeCaptionFontSize(0, NaN, 320)).toBe(16);
        expect(youtubeCaptionFontSize(0, NaN, 640)).toBe(22);
        expect(youtubeCaptionFontSize(0, NaN, 1280)).toBe(28);
    });
});

describe('caption control exclusion', () => {
    const bounds = { rootRect: new DOMRect(0, 68, 320, 180), railWidth: 300, railHeight: 52,
        maxLeft: 8, maxTop: 120, fallbackMaxTop: 440 };
    it('keeps the rail outside both the Japanese and translation rows', () => {
        const rows = [new DOMRect(8, 130, 304, 80), new DOMRect(8, 210, 304, 45)];
        expect(railPositionOutsideReservedRects(8, 120, bounds, rows)).toEqual({ left: 8, top: 8 });
    });
    it('uses room below a short player when no position inside it clears the caption', () => {
        expect(railPositionOutsideReservedRects(8, 100, bounds, [new DOMRect(0, 68, 320, 240)]))
            .toEqual({ left: 8, top: 246 });
    });
});
