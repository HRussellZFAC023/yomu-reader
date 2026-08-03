import { isUnifiedIdeograph } from './han';
import { activeLearningTarget } from './target-runtime';

/** Whether the active target has trustworthy per-character data. */
export function targetSupportsCharacterLookup(): boolean {
    return activeLearningTarget().capabilities['character-lookup'];
}

/**
 * Whether Japanese-only lookup providers may run for the active target.
 *
 * This is deliberately separate from character lookup. A future Chinese
 * target may gain trustworthy per-character data without thereby becoming
 * eligible for JPDB, Jiten, Japanese pitch, or the Japanese parser.
 */
export function usesJapaneseProviders(): boolean {
    return activeLearningTarget().language === 'ja';
}

/**
 * Whether the JAPANESE character-study machinery may run.
 *
 * A third question, distinct from both of the above, and the one most call sites
 * actually mean. Kanji unlock queues, composed-of chips, RTK keywords, kanji
 * summaries in search and the character study steps are all built on Japanese
 * per-character data and Japanese providers. They used to be gated on character
 * lookup alone, which was indistinguishable from "is the target Japanese" for as
 * long as Japanese was the only target with per-character data.
 *
 * Chinese now has per-character dictionaries, so the two came apart on 2026-08-02
 * and every one of those surfaces would have started running Japanese machinery
 * for a Chinese learner. Naming the composite keeps the next call site from
 * reaching for the wrong half.
 */
export function usesJapaneseCharacterStudy(): boolean {
    return targetSupportsCharacterLookup() && usesJapaneseProviders();
}

/**
 * Whether the active target has per-character STROKE data, which is a different
 * question from whether it has per-character definitions.
 *
 * Handwriting needs stroke order (KanjiVG); a character card needs a dictionary
 * entry. Those coincided for as long as Japanese was the only target with either,
 * and the Write step therefore asked about character lookup and got the right
 * answer by luck. When Chinese gained per-character dictionaries on 2026-08-02 the
 * luck ran out: a Chinese learner who had once chosen handwriting was handed the
 * Japanese KanjiVG grader and no keyboard at all. Ask the right question instead.
 */
export function targetSupportsHandwriting(): boolean {
    return activeLearningTarget().capabilities.handwriting;
}

/**
 * Defensive execution gate for character-card entry points.
 *
 * Rendering also uses the capability, but stale DOM and direct controller
 * calls must not reach Japanese providers after the target changes.
 */
export function targetCanLookupCharacter(value: string): boolean {
    return targetSupportsCharacterLookup() && isUnifiedIdeograph(value);
}

/** Whether a character may be drilled by hand: stroke data AND a Han character. */
export function targetCanHandwriteCharacter(value: string): boolean {
    return targetSupportsHandwriting() && isUnifiedIdeograph(value);
}
