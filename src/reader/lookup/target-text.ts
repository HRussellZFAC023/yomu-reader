import { activeLearningTarget } from '../languages/active';
import type { LanguageTextSegment } from '../languages/types';

/** Matches the Japanese fallback path's cap so migrated callers keep its shape. */
const TARGET_LOOKUP_TERM_LIMIT = 8;

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
 * Detection and segmentation below are pure re-exports of contract members.
 * They exist as named helpers rather than inline `activeLearningTarget()` calls
 * so that the intent at each call site is legible in a grep: a site that asks
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

/**
 * Dictionary forms to try for a surface, most literal first, with the
 * normalized surface itself always leading.
 *
 * This is the target-neutral twin of `fallbackLookupTermsForText`, which reaches
 * straight into the Japanese deinflector. A surface that arrives from OCR or a
 * caption is just "text in the language being studied", so the morphology that
 * turns it into lookup terms has to come from the active target: for Japanese
 * these are the deinflector's own candidates, and for a target that declares no
 * morphology the list is simply the surface.
 */
export function targetLookupTermsForText(text: string): string[] {
    const target = activeLearningTarget();
    const source = target.normalizeText(text);
    if (!source) return [];
    const terms = [...target.lookupCandidates(source)]
        // A depth-0 candidate is the surface again, and a single character is
        // never a useful extra term to try.
        .filter(candidate => candidate.depth > 0 && candidate.term.length > 1)
        .sort((a, b) => a.depth - b.depth
            || b.term.length - a.term.length
            || a.term.localeCompare(b.term))
        .map(candidate => target.normalizeText(candidate.term))
        .filter(Boolean);
    return [...new Set([source, ...terms])].slice(0, TARGET_LOOKUP_TERM_LIMIT);
}
