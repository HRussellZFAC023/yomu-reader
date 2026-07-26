import { afterEach, describe, expect, it } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { createLearningTargetModule } from '../../src/reader/languages/module';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../src/reader/languages/registry';

// Core call sites, imported exactly as core ships them. None of these files
// knows that any target other than Japanese exists.
import { collectFragmentTextTargetsIn, documentHasJapaneseText } from '../../src/reader/dom/index';
import { isCompactInteractiveChromeText } from '../../src/reader/dom/decoration-policy';
import { fallbackLookupRangeAtOffset } from '../../src/reader/lookup/parser';
import { pushTargetLanguageOcrLine } from '../../src/reader/ocr/response-shared';
import { isTargetLanguageText, segmentTargetLanguageText } from '../../src/reader/lookup/target-text';
import type { OcrLine, OcrRect } from '../../src/reader/ocr/response-shared';

const AD_HOC_LANGUAGE = 'sv';

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule(AD_HOC_LANGUAGE);
    document.body.innerHTML = '';
});

/**
 * A Latin-script target with the generic whitespace segmentation from
 * `languages/module.ts`. Latin is deliberately a script Japanese detection can
 * never claim, so every assertion below reads as a straight yes/no on which
 * target answered.
 */
function activateLatinTarget() {
    const target = registerLearningTargetModule(createLearningTargetModule({
        id: 'sv-detection-test-target',
        language: AD_HOC_LANGUAGE,
        capabilities: { segmentation: true },
        featureSemantics: {
            characterSystem: 'latin',
            phoneticScripts: ['latin'],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /[A-Za-z]/u,
    }));
    expect(setActiveLearningTargetLanguage(AD_HOC_LANGUAGE)).toBe(target);
    return target;
}

function box(): OcrRect {
    return { left: 0, top: 0, width: 40, height: 10 };
}

describe('detection resolves through the active learning target', () => {
    it('keeps the Japanese answers the hardcoded regex used to give', () => {
        expect(isTargetLanguageText('日本語')).toBe(true);
        expect(isTargetLanguageText('hej du')).toBe(false);
        expect(isTargetLanguageText('')).toBe(false);
    });

    it('follows a non-Japanese target instead', () => {
        activateLatinTarget();

        expect(isTargetLanguageText('hej du')).toBe(true);
        expect(isTargetLanguageText('日本語')).toBe(false);
    });

    // dom/index.ts — the page-eligibility probe boot and main gate the whole
    // reader on. While this was HAS_JAPANESE, no other target could wake Yomu up.
    it('decides page eligibility for the active target', () => {
        document.body.innerHTML = '<p>Hej, vad heter du?</p>';
        expect(documentHasJapaneseText()).toBe(false);

        activateLatinTarget();
        expect(documentHasJapaneseText()).toBe(true);
    });

    it('still finds a Japanese page eligible under the default target', () => {
        document.body.innerHTML = '<p>日本語のページです</p>';
        expect(documentHasJapaneseText()).toBe(true);
    });

    // dom/index.ts — the text-node scan filter that decides what is annotatable.
    it('collects annotatable text targets for the active target', () => {
        document.body.innerHTML = '<p>Hej, vad heter du?</p>';
        expect(collectFragmentTextTargetsIn(document.body, 40, false, '', { minLength: 1 })).toHaveLength(0);

        activateLatinTarget();
        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['Hej, vad heter du?']);
    });

    it('keeps collecting Japanese text targets under the default target', () => {
        document.body.innerHTML = '<p>日本語のページです</p>';
        const targets = collectFragmentTextTargetsIn(document.body, 40, false, '', { minLength: 1 });
        expect(targets.map(target => target.text)).toEqual(['日本語のページです']);
    });

    // dom/decoration-policy.ts — chrome-label admission.
    it('admits compact chrome labels in the active target language', () => {
        expect(isCompactInteractiveChromeText('Meny')).toBe(false);
        expect(isCompactInteractiveChromeText('設定')).toBe(true);

        activateLatinTarget();
        expect(isCompactInteractiveChromeText('Meny')).toBe(true);
        expect(isCompactInteractiveChromeText('設定')).toBe(false);
    });

    // ocr/response-shared.ts — OCR line admission. The OCR request itself
    // already asks for the active target's language, so the response filter
    // that threw away everything non-Japanese was discarding its own answer.
    it('keeps OCR lines in the active target language', () => {
        const japaneseOnly: OcrLine[] = [];
        pushTargetLanguageOcrLine(japaneseOnly, 'Hej du', box());
        pushTargetLanguageOcrLine(japaneseOnly, '日本語', box());
        expect(japaneseOnly.map(line => line.text)).toEqual(['日本語']);

        activateLatinTarget();
        const latin: OcrLine[] = [];
        pushTargetLanguageOcrLine(latin, 'Hej du', box());
        pushTargetLanguageOcrLine(latin, '日本語', box());
        expect(latin.map(line => line.text)).toEqual(['Hej du']);
    });
});

describe('segmentation resolves through the active learning target', () => {
    it('keeps the Japanese segmenter as Japanese behaviour', () => {
        expect(segmentTargetLanguageText('日本語を読む').map(segment => segment.text))
            .toEqual(['日本語', 'を', '読む']);
        // Japanese is scriptio continua, so the generic whitespace segmenter
        // would return the whole run; this proves the real segmenter still runs.
        expect(segmentTargetLanguageText('日本語を読む')).not.toHaveLength(1);
    });

    it('uses the active target segmenter for a non-Japanese target', () => {
        activateLatinTarget();
        expect(segmentTargetLanguageText('hej vad heter du').map(segment => segment.text))
            .toEqual(['hej', 'vad', 'heter', 'du']);
    });

    // lookup/parser.ts — the pointer-lookup range, driven off segmentation.
    it('resolves a fallback lookup range through the active target segmenter', () => {
        // Japanese: the segmenter finds the word the offset lands inside.
        expect(fallbackLookupRangeAtOffset('日本語を読む', 1)).toEqual({ start: 0, end: 3 });
        // Latin text has no Japanese segment and no Japanese script group.
        expect(fallbackLookupRangeAtOffset('hej vad heter du', 5)).toBeUndefined();

        activateLatinTarget();
        expect(fallbackLookupRangeAtOffset('hej vad heter du', 5)).toEqual({ start: 4, end: 7 });
    });
});
