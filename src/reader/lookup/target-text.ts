import { activeLearningTarget } from '../languages/target-runtime';
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

export interface TargetPointerWord {
    start: number;
    end: number;
    offset: number;
}

/** Pointer-word spans, resolved through the active target profile. */
export function targetPointerWordSegments(text: string): readonly LanguageTextSegment[] {
    return activeLearningTarget().pointerWordSegments(text);
}

/**
 * The active target's word at a browser caret offset.
 *
 * Browser caret APIs may report the boundary just after the pressed character,
 * so the historical reader rule first checks the offset and then the character
 * immediately before it. Japanese depended on that rule and keeps it exactly;
 * every other target gets the same predictable caret semantics.
 */
export function targetPointerWordAt(text: string, offset: number): TargetPointerWord | null {
    if (!text.length) return null;
    let index = Math.min(Math.max(offset, 0), text.length - 1);
    const segments = targetPointerWordSegments(text);
    let segment = segments.find(item => item.start <= index && index < item.end);
    if (!segment && index > 0) {
        segment = segments.find(item => item.start <= index - 1 && index - 1 < item.end);
        if (segment) index--;
    }
    return segment ? { start: segment.start, end: segment.end, offset: index } : null;
}

/** Whether text contains any pointer-look-up word for the active target. */
export function hasTargetPointerWord(text: string): boolean {
    return Boolean(text) && targetPointerWordSegments(text).length > 0;
}

/** The active target's normalized form of a surface. */
export function normalizeTargetLanguageText(text: string): string {
    return activeLearningTarget().normalizeText(text);
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
 *
 * Every step below is a contract member, including the ordering: rule tags are
 * the target's own vocabulary, so ranking two same-depth analyses is the
 * target's decision and not this function's. Sorting here on shape alone would
 * silently rewrite Japanese results — `target-text-parity.test.ts` pins this
 * list to the Japanese fallback path term for term.
 */
export function targetLookupTermsForText(text: string): string[] {
    const target = activeLearningTarget();
    const source = target.normalizeText(text);
    if (!source) return [];
    const terms = [...target.lookupCandidates(source)]
        // A depth-0 candidate is the surface again, a single character is never
        // a useful extra term to try, and a candidate the target does not
        // recognize as its own language is not worth a lookup.
        .filter(candidate => candidate.depth > 0
            && candidate.term.length > 1
            && target.isLookupableText(candidate.term))
        .sort((a, b) => target.compareLookupCandidates(a, b))
        .map(candidate => target.normalizeText(candidate.term))
        .filter(Boolean);
    return [...new Set([source, ...terms])].slice(0, TARGET_LOOKUP_TERM_LIMIT);
}
