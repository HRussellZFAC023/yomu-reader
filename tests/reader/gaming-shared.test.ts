import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

    it('keeps Electron first-run focused on capture while page scanning stays in Settings', () => {
        const source = readFileSync(path.join(process.cwd(), 'src/gaming/renderer/app.ts'), 'utf8');

        expect(source).toContain('Yomu Gaming is ready.');
        expect(source).toContain('Google Lens-style image OCR');
        expect(source).toContain('data-action="test-capture-overlay"');
        expect(source).toContain('data-action="start-overlay"');
        expect(source).toContain("replaceControlLabel(form, 'shortcuts.scanPage', 'Manual page scan shortcut')");
        expect(source).toContain("replaceControlLabel(form, 'shortcuts.hoverLookup', 'Scan modifier key')");
        expect(source).not.toContain('data-gaming-page-scan-setup');
        expect(source).not.toContain('name="gamingPageScanMode"');
        expect(source).not.toContain('data-gaming-manual-scan-shortcut');
        expect(source).not.toContain('syncSharedPageScanModeFromGamingOnboarding');
        expect(source).not.toContain('syncGamingPageScanControls');
    });
});
