import { activeLearningTarget } from './target-runtime';
import type { LanguageLookupCandidate } from './types';

/**
 * Morphology resolved against the active learning target.
 *
 * These two functions exist so that machinery which is not about any one
 * language — above all the Yomitan dictionary engine, whose format serves
 * dozens of languages — can deinflect a surface without importing a Japanese
 * primitive. Importing `deinflectJapaneseTerm` into that engine makes every
 * lookup in every dictionary, Chinese or German or Korean, run Japanese
 * godan/ichidan/i-adjective rules and match against JMdict part-of-speech tags.
 *
 * For a Japanese target these are the deinflector and its rule matcher
 * verbatim, so routing a call site through here changes nothing about Japanese
 * behaviour; for any other target they are that target's morphology, and for a
 * a dictionary-forms target they are the surface at depth 0, matched against
 * the inflected rows the published dictionary owns.
 */
export function targetLookupCandidates(text: string): readonly LanguageLookupCandidate[] {
    return activeLearningTarget().lookupCandidates(text);
}

/**
 * Whether a dictionary entry tagged `entryRules` may answer a candidate that
 * `targetLookupCandidates` produced with `candidateRules`. Rule tags are the
 * target's own vocabulary, so only the target knows that `v5m` is a kind of
 * `v5` — a generic engine comparing them itself is asserting Japanese.
 */
export function targetLookupCandidateRulesMatch(
    entryRules: string | undefined,
    candidateRules: readonly string[],
): boolean {
    return activeLearningTarget().matchesLookupCandidateRules(entryRules, candidateRules);
}

/** Whether the active target has a coded or dictionary-owned morphology path. */
export function targetHasMorphology(): boolean {
    return activeLearningTarget().capabilities.morphology;
}
