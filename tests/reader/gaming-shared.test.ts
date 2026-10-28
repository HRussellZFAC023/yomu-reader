import { describe, expect, it } from 'vitest';
import {
    gamingLookupCandidates,
    gamingOcrRequest,
    normalizeGamingOcrResponse,
    yomuStudySearchUrl,
} from '../../src/gaming/shared';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings/index';
import { readFormSettings } from '../../src/reader/settings/form-read';
import type { ReaderSettings } from '../../src/reader/app/types';

const CAPTURE_IMAGE = { dataUrl: 'data:image/png;base64,AAAA', width: 640, height: 360 };

function captureSettings(overrides: Record<string, string> = {}) {
    return {
        ocrProvider: DEFAULT_SETTINGS.ocrProvider,
        ocrEndpointUrl: DEFAULT_SETTINGS.ocrEndpointUrl,
        ocrCloudVisionApiKey: DEFAULT_SETTINGS.ocrCloudVisionApiKey,
        ocrEngine: DEFAULT_SETTINGS.ocrEngine,
        ocrLanguage: DEFAULT_SETTINGS.ocrLanguage,
        ...overrides,
    };
}

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

    it('asks for OCR in Japanese and names no study target', () => {
        const request = gamingOcrRequest(captureSettings(), CAPTURE_IMAGE);
        expect(request.language).toBe('ja-JP');
        expect(request).not.toHaveProperty('targetLanguage');
    });

    it('still sends an explicitly configured OCR language over the Japanese default', () => {
        expect(gamingOcrRequest(captureSettings({ ocrLanguage: 'de-DE' }), CAPTURE_IMAGE).language).toBe('de-DE');
    });

    it('offers no lookup candidates for a line without Japanese', () => {
        expect(gamingLookupCandidates('Press A')).toEqual([]);
    });

    it('leads its candidates with the whole recognized line', () => {
        expect(gamingLookupCandidates('もう一度、冒険を始めよう。')[0]).toBe('もう一度、冒険を始めよう。');
    });
});

/**
 * The capture path must own NO opinion about which characters are worth
 * reading. It used to carry its own kana/kanji regex; the Japanese Adapter's
 * text predicate decides.
 */
describe('Yomu Gaming line filtering defers to the Japanese predicate', () => {
    it('keeps halfwidth katakana the old local regex threw away', () => {
        const result = normalizeGamingOcrResponse({
            width: 800,
            height: 450,
            lines: [{ text: 'ﾎﾟｰｼｮﾝ', box: { left: 10, top: 20, width: 180, height: 28 } }],
        }, 640, 360);

        expect(result?.lines.map(line => line.text)).toEqual(['ﾎﾟｰｼｮﾝ']);
    });
});

/**
 * Saving the form must not resolve the "use the default" sentinel into a
 * literal that nothing can clear. Gaming persists on seven handlers including a
 * theme click, so that would be every install. This walks the real path —
 * render, save, reload — rather than handing `gamingOcrRequest` a settings
 * object directly.
 */
describe('Yomu Gaming OCR language across a settings save', () => {
    it('keeps the Japanese default unpinned after the settings form is saved', () => {
        const saved = readFormSettings(new FormData(), DEFAULT_SETTINGS);
        const reloaded = normalizeReaderSettings(
            JSON.parse(JSON.stringify(saved)) as ReaderSettings,
        );
        expect(reloaded.ocrLanguage).toBe('');
        expect(gamingOcrRequest(reloaded, CAPTURE_IMAGE).language).toBe('ja-JP');
    });

    it('unpins an OCR language an older build already wrote', () => {
        const pinnedByAnOlderBuild = normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'ja-JP' });

        expect(pinnedByAnOlderBuild.ocrLanguage).toBe('');
        expect(gamingOcrRequest(pinnedByAnOlderBuild, CAPTURE_IMAGE).language).toBe('ja-JP');
    });
});
