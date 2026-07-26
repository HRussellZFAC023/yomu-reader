import { describe, expect, it } from 'vitest';

import * as SCRIPT from '../../src/reader/lookup/japanese-script';
import { HAS_JAPANESE, HAS_JAPANESE_LETTER } from '../../src/reader/dom/constants';

/**
 * The shared script ranges are the single definition every kana/kanji check in
 * the reader now composes from, and several of their endpoints are unassigned
 * or combining code points that render as nothing in an editor. Pin them
 * numerically: a mistyped range here silently changes what the whole reader
 * treats as Japanese.
 */
function codePoints(value: string): string[] {
    return [...value].map(char => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
}

const EXPECTED: Record<string, string[]> = {
    HIRAGANA: ['U+3040', 'U+002D', 'U+309F'],
    KATAKANA: ['U+30A0', 'U+002D', 'U+30FF'],
    KANA: ['U+3040', 'U+002D', 'U+30FF'],
    HALFWIDTH_KATAKANA: ['U+FF66', 'U+002D', 'U+FF9F'],
    KANJI: ['U+3400', 'U+002D', 'U+9FFF'],
    ITERATION_MARK: ['U+3005'],
    ITERATION_MARKS: ['U+3005', 'U+3006'],
    KANA_COUNTERS: ['U+30F5', 'U+30F6'],
    PROLONGED_SOUND_MARK: ['U+30FC'],
    KATAKANA_MIDDLE_DOT: ['U+30FB'],
    COMBINING_KANA_MARKS: ['U+3099', 'U+309A'],
    HIRAGANA_LETTERS: ['U+3041', 'U+002D', 'U+3096', 'U+309D', 'U+002D', 'U+309F'],
    KATAKANA_LETTERS: ['U+30A1', 'U+002D', 'U+30FA', 'U+30FD', 'U+002D', 'U+30FF'],
    HALFWIDTH_KATAKANA_LETTERS: ['U+FF66', 'U+002D', 'U+FF6F', 'U+FF71', 'U+002D', 'U+FF9D'],
};

describe('shared Japanese script ranges', () => {
    for (const [name, expected] of Object.entries(EXPECTED)) {
        it(`${name} is exactly ${expected.join(' ')}`, () => {
            expect(codePoints(SCRIPT[name as keyof typeof SCRIPT] as string)).toEqual(expected);
        });
    }
});

describe('the detectors rebuilt from the shared ranges', () => {
    // The literals below are the ones dom/constants.ts carried before the
    // ranges were deduplicated. Every code point in the BMP must be classified
    // identically, or the reader's idea of "Japanese" has moved.
    const ORIGINAL_HAS_JAPANESE = /[぀-ヿ㐀-鿿々〆ｦ-ﾟ]/;
    const ORIGINAL_HAS_JAPANESE_LETTER = /[ぁ-ゖゝ-ゟァ-ヺヽ-ヿ㐀-鿿ｦ-ｯｱ-ﾝ]/u;

    it('classifies every BMP code point exactly as the old literals did', () => {
        const broadDiffs: number[] = [];
        const letterDiffs: number[] = [];
        for (let cp = 0; cp <= 0xffff; cp++) {
            const char = String.fromCharCode(cp);
            if (HAS_JAPANESE.test(char) !== ORIGINAL_HAS_JAPANESE.test(char)) broadDiffs.push(cp);
            if (HAS_JAPANESE_LETTER.test(char) !== ORIGINAL_HAS_JAPANESE_LETTER.test(char)) letterDiffs.push(cp);
        }
        expect(broadDiffs).toEqual([]);
        expect(letterDiffs).toEqual([]);
    });

    it('keeps the flags the call sites depend on', () => {
        expect(HAS_JAPANESE.flags).toBe('');
        expect(HAS_JAPANESE_LETTER.flags).toBe('u');
    });

    it('keeps the render boundary narrower than the scan gate', () => {
        // The two marks the render boundary must reject and the scan gate must accept.
        for (const punctuation of ['・', 'ー']) {
            expect(HAS_JAPANESE.test(punctuation)).toBe(true);
            expect(HAS_JAPANESE_LETTER.test(punctuation)).toBe(false);
        }
    });
});
