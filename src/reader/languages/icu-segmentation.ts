import type { LanguageTag, LanguageTextSegment } from './types';

/**
 * Word boundaries from ICU, which every browser already ships.
 *
 * This is the right answer for far more targets than it looks. Thai, Lao,
 * Khmer and Burmese write without spaces, and ICU carries dictionary-based
 * boundaries for all four — so a target that states nothing beyond its language
 * tag gets real words in a script whitespace cannot touch. For space-delimited
 * languages ICU is whitespace minus the punctuation, which is strictly what a
 * dictionary lookup wants: `comer,` stops being a term nobody can find.
 *
 * Where ICU is NOT the right answer, it is worth naming precisely, because a
 * target that silently accepts these boundaries is claiming a quality of
 * segmentation it does not have:
 *
 * - Japanese: ICU has no kana dictionary and over-splits kana on phonetic
 *   guesses. The Japanese target supplies its own segmenter and never reaches
 *   this code.
 * - Korean: ICU splits on spaces, which is eojeol — real orthographic words,
 *   but a whole phrase-plus-particle each. Sub-eojeol morphology needs a
 *   Korean analyser Yomu does not have.
 * - Vietnamese: ICU splits on spaces, and a Vietnamese word is routinely
 *   several space-separated syllables (`cơm rang`). Compounds are lost.
 * - Cantonese: ICU splits Han runs a character at a time in many builds
 *   (鍾意 -> 鍾 + 意), so compounds are lost the other way round.
 *
 * `tests/reader/languages/icu-segmentation.test.ts` pins all four holes so that
 * closing one is a test that flips, not a silent behaviour change.
 */

const SEGMENTER_BY_LOCALE = new Map<string, Intl.Segmenter | null>();

function wordSegmenter(locale: LanguageTag): Intl.Segmenter | null {
    const cached = SEGMENTER_BY_LOCALE.get(locale);
    if (cached !== undefined) return cached;
    let segmenter: Intl.Segmenter | null = null;
    try {
        if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
            segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
        }
    } catch {
        segmenter = null;
    }
    SEGMENTER_BY_LOCALE.set(locale, segmenter);
    return segmenter;
}

/** Whether this build can answer word boundaries for `locale` through ICU. */
export function hasIcuWordSegmentation(locale: LanguageTag): boolean {
    return wordSegmenter(locale) !== null;
}

/**
 * ICU word segments for `text`, or `null` when the runtime has no segmenter.
 *
 * Punctuation and whitespace are dropped: a caller wants the words, and every
 * consumer of this contract goes on to look each segment up in a dictionary.
 */
export function icuWordSegments(text: string, locale: LanguageTag): readonly LanguageTextSegment[] | null {
    const segmenter = wordSegmenter(locale);
    if (!segmenter) return null;
    const segments: LanguageTextSegment[] = [];
    for (const segment of segmenter.segment(text)) {
        if (!segment.isWordLike) continue;
        segments.push({
            text: segment.segment,
            start: segment.index,
            end: segment.index + segment.segment.length,
        });
    }
    return segments;
}
