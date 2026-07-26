import { activeLearningTarget } from '../languages/active';
import type { LanguageTextSegment } from '../languages/types';

/**
 * Detection and segmentation, resolved through the active learning target.
 *
 * Core used to answer both questions with Japanese primitives directly --
 * `HAS_JAPANESE.test(...)` for "is there anything to annotate here" and
 * `segmentJapaneseText(...)` for "where are the words". Those are the two
 * capabilities that decide whether Yomu wakes up on a page at all and what it
 * hands the parser, so while they were hardcoded no other target could ever be
 * annotated no matter what the language registry contained.
 *
 * Both functions below are pure re-exports of contract members. They exist as
 * named helpers rather than inline `activeLearningTarget()` calls so that the
 * intent at each call site is legible in a grep: a site that asks
 * `isTargetLanguageText` means "text in the language being studied", and a site
 * that still names Japanese means Japanese specifically.
 */
export function isTargetLanguageText(text: string): boolean {
    return activeLearningTarget().isLookupableText(text);
}

/**
 * Word boundaries for the active target. Japanese supplies the existing
 * segmenter as its implementation; a target that does not declare one falls
 * back to the whitespace segmentation in `languages/module.ts`.
 */
export function segmentTargetLanguageText(text: string): readonly LanguageTextSegment[] {
    return activeLearningTarget().segment(text);
}
