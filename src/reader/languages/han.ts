import type { LanguageTextSegment } from './types';

const UNIFIED_IDEOGRAPH_RE = /^\p{Unified_Ideograph}$/u;
const UNIFIED_IDEOGRAPH_RUN_RE = /\p{Unified_Ideograph}+/gu;

/** One Unicode Han ideograph, including supplementary CJK extensions. */
export function isUnifiedIdeograph(value: string): boolean {
    return UNIFIED_IDEOGRAPH_RE.test(value);
}

/**
 * Contiguous Han lookup runs. ICU remains the target's display segmenter, but
 * dictionary lookup must not trust its word guesses for unspaced Han text.
 */
export function hanIdeographSegments(text: string): readonly LanguageTextSegment[] {
    return [...text.matchAll(UNIFIED_IDEOGRAPH_RUN_RE)].map(match => ({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
    }));
}
