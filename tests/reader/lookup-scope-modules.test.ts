import { afterEach, describe, expect, it } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/target-runtime';
import { uncoveredJapaneseRanges } from '../../src/reader/lookup/uncovered-japanese-ranges';
import { captureOcrTargetContext, ocrFallbackCardFromText } from '../../src/reader/ocr/target-context';

afterEach(() => resetActiveLearningTargetLanguage());

describe('lookup scope modules', () => {
    it('reports uncovered Japanese runs in UTF-16 coordinates without splitting supplementary kanji', () => {
        const text = 'あ𠮷い';
        const covered = (start: number, end: number): boolean => start < 3 && 1 < end;

        expect([...uncoveredJapaneseRanges(text, 0, text.length, covered)]).toEqual([
            { start: 0, end: 1 },
            { start: 3, end: 4 },
        ]);
        expect([...uncoveredJapaneseRanges(text, 0, 2, () => false)]).toEqual([
            { start: 0, end: 1 },
        ]);
    });

    it('invalidates OCR work across an away-and-back target switch', () => {
        const context = captureOcrTargetContext();
        const stale = Symbol('stale');

        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        let thrown: unknown;
        try {
            context.requireCurrent(stale);
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBe(stale);
    });

    it('scopes OCR fallback identity and language to the active target', () => {
        const japanese = ocrFallbackCardFromText('  word  ');
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        const korean = ocrFallbackCardFromText('  word  ');

        expect(japanese).toMatchObject({ spelling: 'word', language: 'ja' });
        expect(korean).toMatchObject({ spelling: 'word', language: 'ko' });
        expect(korean.vid).not.toBe(japanese.vid);
    });
});
