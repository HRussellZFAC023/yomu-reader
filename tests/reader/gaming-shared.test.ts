import { afterEach, describe, expect, it } from 'vitest';
import {
    gamingLookupCandidates,
    gamingOcrRequest,
    normalizeGamingOcrResponse,
    yomuStudySearchUrl,
} from '../../src/gaming/shared';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../src/reader/languages/registry';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const AD_HOC_TARGET_LANGUAGE = 'sv';

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

/**
 * A second study target with nothing Japanese about it. Registering it is the
 * whole setup: if any part of the capture path still carried its own Japanese
 * rule, these expectations would keep answering `ja`.
 */
function activateAdHocTarget() {
    const target = registerLearningTargetModule(createLearningTargetModule({
        id: 'sv-gaming-test-target',
        language: AD_HOC_TARGET_LANGUAGE,
        capabilities: { segmentation: true, ocr: true },
        featureSemantics: {
            characterSystem: 'latin',
            phoneticScripts: ['latin'],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /[A-Za-zÅÄÖåäö]/u,
    }));
    expect(setActiveLearningTargetLanguage(AD_HOC_TARGET_LANGUAGE)).toBe(target);
    return target;
}

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule(AD_HOC_TARGET_LANGUAGE);
});

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

    it('asks for OCR in the language being studied', () => {
        expect(gamingOcrRequest(captureSettings(), CAPTURE_IMAGE).language).toBe('ja-JP');

        activateAdHocTarget();

        const request = gamingOcrRequest(captureSettings(), CAPTURE_IMAGE);
        expect(request.language).toBe('sv-SE');
        expect(request.language.startsWith('ja')).toBe(false);
    });

    it('still sends an explicitly configured OCR language over the target default', () => {
        activateAdHocTarget();

        expect(gamingOcrRequest(captureSettings({ ocrLanguage: 'de-DE' }), CAPTURE_IMAGE).language).toBe('de-DE');
    });

    it('keeps the lines the study target recognizes, not the Japanese ones', () => {
        activateAdHocTarget();

        const result = normalizeGamingOcrResponse({
            width: 800,
            height: 450,
            lines: [
                { text: 'Tryck på A', box: { left: 10, top: 20, width: 180, height: 28 } },
                { text: '冒険を始めよう', box: { left: 10, top: 60, width: 180, height: 28 } },
            ],
        }, 640, 360);

        expect(result?.lines.map(line => line.text)).toEqual(['Tryck på A']);
    });

    it('builds lookup candidates for a non-Japanese study target', () => {
        activateAdHocTarget();

        // Whitespace segmentation plus the target's own (absent) morphology:
        // the surfaces themselves, with no Japanese deinflection in sight.
        expect(gamingLookupCandidates('Tryck på A')).toEqual(
            expect.arrayContaining(['Tryck', 'på']),
        );
        expect(gamingLookupCandidates('冒険を始めよう')).toEqual([]);
    });
});
