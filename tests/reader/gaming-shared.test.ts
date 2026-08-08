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
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings/index';
import { readFormSettings } from '../../src/reader/settings/form-read';
import type { ReaderSettings } from '../../src/reader/app/types';

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

    it('leads its candidates with the whole recognized line', () => {
        expect(gamingLookupCandidates('もう一度、冒険を始めよう。')[0]).toBe('もう一度、冒険を始めよう。');
    });
});

/**
 * The capture path must own NO opinion about which characters are worth
 * reading. It used to carry its own kana/kanji regex; these pin that the only
 * thing deciding is the active target's `isLookupableText`.
 */
describe('Yomu Gaming line filtering defers to the target predicate', () => {
    it('follows a target predicate that has nothing to do with any script', () => {
        const target = registerLearningTargetModule(createLearningTargetModule({
            id: 'sv-gaming-predicate-target',
            language: AD_HOC_TARGET_LANGUAGE,
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
            // Deliberately arbitrary: no local regex in gaming could ever agree
            // with this, so a passing expectation means the contract decided.
            detectsText: /ZZ/u,
        }));
        expect(setActiveLearningTargetLanguage(AD_HOC_TARGET_LANGUAGE)).toBe(target);

        const result = normalizeGamingOcrResponse({
            width: 800,
            height: 450,
            lines: [
                { text: 'ZZ top', box: { left: 10, top: 20, width: 180, height: 28 } },
                { text: '冒険を始めよう', box: { left: 10, top: 60, width: 180, height: 28 } },
                { text: 'Tryck på A', box: { left: 10, top: 100, width: 180, height: 28 } },
            ],
        }, 640, 360);

        expect(result?.lines.map(line => line.text)).toEqual(['ZZ top']);
    });

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
 * The regression the previous attempt shipped: the OCR language followed the
 * study target only until the player touched Settings once, because saving the
 * form resolved the "follow the target" sentinel into a literal that nothing
 * could clear. Gaming persists on seven handlers including a theme click, so
 * that was every install. This walks the real path — render, save, reload —
 * rather than handing `gamingOcrRequest` a settings object directly.
 */
describe('Yomu Gaming OCR language across a settings save', () => {
    it('still follows the study target after the settings form is saved', () => {
        const savedUnderJapanese = readFormSettings(new FormData(), DEFAULT_SETTINGS);
        const reloaded = normalizeReaderSettings(
            JSON.parse(JSON.stringify(savedUnderJapanese)) as ReaderSettings,
        );
        expect(gamingOcrRequest(reloaded, CAPTURE_IMAGE).language).toBe('ja-JP');

        activateAdHocTarget();

        const request = gamingOcrRequest(reloaded, CAPTURE_IMAGE);
        expect(request.language).toBe('sv-SE');
        expect(request.language.startsWith('ja')).toBe(false);
    });

    it('unpins an OCR language an older build already wrote', () => {
        const pinnedByAnOlderBuild = normalizeReaderSettings({ ...DEFAULT_SETTINGS, ocrLanguage: 'ja-JP' });

        activateAdHocTarget();

        expect(gamingOcrRequest(pinnedByAnOlderBuild, CAPTURE_IMAGE).language).toBe('sv-SE');
    });
});
