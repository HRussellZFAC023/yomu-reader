import { describe, expect, it } from 'vitest';

import {
    immersionFallbackFragments,
    immersionSentenceContainsQuery,
    isUsefulImmersionFallbackQuery,
    normalizeImmersionSearchQuery,
    queryHasKanji,
    queryKey,
    queryLength,
    shouldRequireOriginalSurfaceMatch,
    uniqueImmersionQueries,
} from '../../src/reader/immersion-query';

describe('normalizeImmersionSearchQuery', () => {
    it('trims leading and trailing whitespace', () => {
        expect(normalizeImmersionSearchQuery('  日本語  ')).toBe('日本語');
    });

    it('collapses internal whitespace to a single space', () => {
        expect(normalizeImmersionSearchQuery('日本  語')).toBe('日本 語');
        expect(normalizeImmersionSearchQuery('a\t\nb')).toBe('a b');
    });

    it('returns the string unchanged when already normalized', () => {
        expect(normalizeImmersionSearchQuery('日本語')).toBe('日本語');
    });
});

describe('queryKey', () => {
    it('removes all spaces and lowercases', () => {
        expect(queryKey('日本 語')).toBe('日本語');
        expect(queryKey('ABC')).toBe('abc');
    });

    it('normalizes before stripping spaces', () => {
        expect(queryKey('  日本  語  ')).toBe('日本語');
    });
});

describe('queryLength', () => {
    it('counts Unicode code points after normalization', () => {
        expect(queryLength('日本語')).toBe(3);
        expect(queryLength('  AB  ')).toBe(2);
    });
});

describe('queryHasKanji', () => {
    it('returns true for strings containing CJK ideographs', () => {
        expect(queryHasKanji('日本語')).toBe(true);
        expect(queryHasKanji('漢字')).toBe(true);
    });

    it('returns false for hiragana/katakana only', () => {
        expect(queryHasKanji('よむ')).toBe(false);
        expect(queryHasKanji('ヨム')).toBe(false);
    });

    it('returns false for non-Japanese text', () => {
        expect(queryHasKanji('hello')).toBe(false);
    });
});

describe('shouldRequireOriginalSurfaceMatch', () => {
    it('requires a match when query has kanji and is 3+ characters', () => {
        expect(shouldRequireOriginalSurfaceMatch('日本語')).toBe(true); // kanji + length 3
        expect(shouldRequireOriginalSurfaceMatch('日本語学習')).toBe(true);
    });

    it('does not require a match for short kanji queries', () => {
        expect(shouldRequireOriginalSurfaceMatch('日本')).toBe(false); // length 2
        expect(shouldRequireOriginalSurfaceMatch('日')).toBe(false); // length 1
    });

    it('does not require a match for kana-only queries regardless of length', () => {
        expect(shouldRequireOriginalSurfaceMatch('よむことができる')).toBe(false);
    });
});

describe('immersionSentenceContainsQuery', () => {
    it('returns true when the query appears in the sentence', () => {
        expect(immersionSentenceContainsQuery('今日は日本語を勉強します', '日本語')).toBe(true);
    });

    it('is not sensitive to spacing differences', () => {
        expect(immersionSentenceContainsQuery('今日 は 日本語', '日本語')).toBe(true);
    });

    it('returns false when the query is absent', () => {
        expect(immersionSentenceContainsQuery('今日は英語を勉強します', '日本語')).toBe(false);
    });

    it('returns false for an empty query', () => {
        expect(immersionSentenceContainsQuery('日本語', '')).toBe(false);
    });
});

describe('uniqueImmersionQueries', () => {
    it('deduplicates queries that differ only by spacing', () => {
        const result = uniqueImmersionQueries(['日本語', '日本語', ' 日本語 ']);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('日本語');
    });

    it('preserves order and filters empty strings', () => {
        const result = uniqueImmersionQueries(['c', '', 'a', 'b', 'a']);
        expect(result).toEqual(['c', 'a', 'b']);
    });

    it('returns an empty array for empty input', () => {
        expect(uniqueImmersionQueries([])).toEqual([]);
    });
});

describe('isUsefulImmersionFallbackQuery', () => {
    it('returns false when the query is the same as the exact query', () => {
        expect(isUsefulImmersionFallbackQuery('日本語', '日本語')).toBe(false);
    });

    it('returns false for common particles', () => {
        expect(isUsefulImmersionFallbackQuery('は', '日本語')).toBe(false);
        expect(isUsefulImmersionFallbackQuery('が', '勉強')).toBe(false);
    });

    it('returns false for single-character queries', () => {
        expect(isUsefulImmersionFallbackQuery('日', '日本語')).toBe(false);
    });

    it('returns true for a meaningful two-or-more character Japanese query', () => {
        expect(isUsefulImmersionFallbackQuery('日本', '日本語')).toBe(true);
    });

    it('returns false for non-Japanese queries', () => {
        expect(isUsefulImmersionFallbackQuery('hello', '日本語')).toBe(false);
    });
});

describe('immersionFallbackFragments', () => {
    it('returns kanji-containing fragments before kana-only ones', () => {
        const fragments = immersionFallbackFragments('日本語を話す');
        const hasKanji = fragments.filter(f => /[㐀-鿿]/u.test(f));
        const kanaOnly = fragments.filter(f => !/[㐀-鿿]/u.test(f));
        const kanjiIndices = hasKanji.map(f => fragments.indexOf(f));
        const kanaIndices = kanaOnly.map(f => fragments.indexOf(f));
        if (kanjiIndices.length > 0 && kanaIndices.length > 0) {
            expect(Math.max(...kanjiIndices)).toBeLessThan(Math.min(...kanaIndices));
        }
    });

    it('returns longer fragments before shorter ones of the same type', () => {
        const fragments = immersionFallbackFragments('日本語学習');
        const kanjiFragments = fragments.filter(f => /[㐀-鿿]/u.test(f));
        for (let i = 1; i < kanjiFragments.length; i++) {
            expect(kanjiFragments[i - 1]!.length).toBeGreaterThanOrEqual(kanjiFragments[i]!.length);
        }
    });

    it('returns an empty array for non-Japanese text', () => {
        expect(immersionFallbackFragments('hello world')).toEqual([]);
    });

    it('returns unique fragments', () => {
        const fragments = immersionFallbackFragments('日本語');
        const unique = new Set(fragments);
        expect(unique.size).toBe(fragments.length);
    });
});
