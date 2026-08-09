import { isUnifiedIdeograph } from './han';
import { activeLearningTarget } from './target-runtime';
import type { LearningTargetModule } from './types';

/** Whether the active target offers character lookup through either Adapter. */
export function targetSupportsCharacterLookup(): boolean {
    return activeLearningTarget().capabilities['character-lookup'];
}

/** Whether the active target has a dedicated character-bank surface. */
export function targetUsesCharacterDictionary(): boolean {
    const target = activeLearningTarget();
    return target.capabilities['character-lookup']
        && target.experiences.characterLookup === 'character-dictionary';
}

/**
 * Whether Japanese-only lookup providers may run for the active target.
 *
 * This is deliberately separate from character lookup. A target may use a
 * dedicated character bank or one-grapheme term lookup without thereby becoming
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
    return targetUsesCharacterDictionary() && usesJapaneseProviders();
}

/**
 * Whether the active target offers handwriting through stroke feedback or an
 * explicit self-check. Automatic per-character stroke data is the narrower
 * `targetCanHandwriteCharacter` question below.
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
 * Whether text is one target-language writing unit that can be sent through
 * the ordinary term dictionary.
 *
 * A writing unit is a grapheme cluster, not a UTF-16 code unit: supplementary
 * Han characters and joined/combining scripts must remain intact. This is the
 * universal character-lookup Adapter for targets without a dedicated character
 * bank.
 */
export function targetCanLookupWritingUnit(
    value: string,
    target: LearningTargetModule = activeLearningTarget(),
): boolean {
    const unit = singleGrapheme(value);
    return Boolean(unit) && target.isLookupableText(unit);
}

/**
 * Whether target-aware recognition may accept this handwriting prediction.
 * Reference-backed Japanese stroke grading is deliberately a narrower
 * question (`targetCanHandwriteCharacter`); every other target uses an explicit
 * self-check and therefore never receives a fabricated automatic score.
 */
export function targetCanHandwriteText(
    value: string,
    target: LearningTargetModule = activeLearningTarget(),
): boolean {
    return target.capabilities.handwriting
        && Boolean(value.trim())
        && target.isLookupableText(value);
}

/**
 * Defensive execution gate for character-card entry points.
 *
 * Rendering also uses the capability, but stale DOM and direct controller
 * calls must not reach Japanese providers after the target changes.
 */
export function targetCanLookupCharacter(value: string): boolean {
    const target = activeLearningTarget();
    return target.capabilities['character-lookup']
        && target.experiences.characterLookup === 'character-dictionary'
        && isUnifiedIdeograph(value);
}

/** Whether a character may receive automatic stroke feedback. */
export function targetCanHandwriteCharacter(value: string): boolean {
    const target = activeLearningTarget();
    return target.capabilities.handwriting
        && target.experiences.handwriting === 'stroke-feedback'
        && isUnifiedIdeograph(value);
}

function singleGrapheme(value: string): string {
    const units = segmentGraphemes(value.trim());
    return units.length === 1 ? units[0] ?? '' : '';
}

function segmentGraphemes(value: string): string[] {
    if (typeof Intl.Segmenter !== 'function') return Array.from(value);
    return Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
        segment => segment.segment,
    );
}
