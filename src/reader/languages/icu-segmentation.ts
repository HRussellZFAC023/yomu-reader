import type { LanguageTag, LanguageTextSegment } from './types';

/**
 * Word boundaries from ICU, which every browser already ships. Japanese text
 * is segmented by Yomu's own segmenter; ICU only splits an already-confirmed
 * compound into the components whose pitch is shown (pitch-components.ts).
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
