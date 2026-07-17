import { describe, expect, it } from 'vitest';
import { gamingLookupCandidates, normalizeGamingOcrResponse, yomuStudySearchUrl } from '../../src/gaming/shared';

describe('Yomu Gaming shared helpers', () => {
    it('normalizes local OCR responses into Japanese lines', () => {
        const result = normalizeGamingOcrResponse({
            width: 800,
            height: 450,
            lines: [
                { text: '冒険を始めよう', box: { left: 10, top: 20, width: 180, height: 28 } },
                { text: 'Press A', box: { left: 10, top: 60, width: 120, height: 28 } },
            ],
        }, 640, 360);

        expect(result?.width).toBe(800);
        expect(result?.lines).toHaveLength(1);
        expect(result?.lines[0].text).toBe('冒険を始めよう');
        expect(result?.lines[0].hasGeometry).toBe(true);
    });

    it('marks plain OCR text fallback as having no geometry', () => {
        const result = normalizeGamingOcrResponse({
            width: 800,
            height: 450,
            text: '冒険を始めよう',
        }, 640, 360);

        expect(result?.lines[0].hasGeometry).toBe(false);
    });

    it('builds lookup candidates from game dialogue', () => {
        expect(gamingLookupCandidates('もう一度、冒険を始めよう。')).toContain('冒険');
    });

    it('links captured terms to the Yomu study search surface', () => {
        const url = new URL(yomuStudySearchUrl('冒険'));
        expect(url.hostname).toBe('yomureader.com');
        expect(url.searchParams.get('mode')).toBe('search');
        expect(url.searchParams.get('q')).toBe('冒険');
    });

});
