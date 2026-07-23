import { describe, expect, it } from 'vitest';
import { reachableSubtitleBottomPercent } from '../../src/reader/subtitles/subtitle-layout';

describe('reachable subtitle position', () => {
    it('keeps an in-frame preference unchanged', () => {
        expect(reachableSubtitleBottomPercent({
            preferredBottomPercent: 16,
            positionRect: new DOMRect(0, 0, 390, 360),
            viewportTop: 0,
            viewportHeight: 780,
            subtitleHeight: 72,
        })).toBe(16);
    });

    it('rebases the same preference when the next media frame fills the viewport', () => {
        expect(reachableSubtitleBottomPercent({
            preferredBottomPercent: -110,
            positionRect: new DOMRect(0, 64, 390, 756),
            viewportTop: 0,
            viewportHeight: 820,
            subtitleHeight: 72,
        })).toBe(2);
    });

    it('preserves a reachable below-player preference on a shorter video', () => {
        expect(reachableSubtitleBottomPercent({
            preferredBottomPercent: -110,
            positionRect: new DOMRect(0, 0, 390, 360),
            viewportTop: 0,
            viewportHeight: 820,
            subtitleHeight: 72,
        })).toBe(-110);
    });

    it('keeps the recovery handle below an offset mobile viewport top', () => {
        expect(reachableSubtitleBottomPercent({
            preferredBottomPercent: 120,
            positionRect: new DOMRect(0, 64, 390, 756),
            viewportTop: 80,
            viewportHeight: 740,
            subtitleHeight: 72,
        })).toBe(80);
    });
});
