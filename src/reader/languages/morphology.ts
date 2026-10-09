import { activeLearningTarget } from './target-runtime';

/**
 * Whether a dictionary entry tagged `entryRules` may answer a candidate that
 * the Japanese target produced with `candidateRules`. Rule tags are the
 * target's own vocabulary, so only the target knows that `v5m` is a kind of
 * `v5` — a generic engine comparing them itself is asserting Japanese.
 */
export function targetLookupCandidateRulesMatch(
    entryRules: string | undefined,
    candidateRules: readonly string[],
): boolean {
    return activeLearningTarget().matchesLookupCandidateRules(entryRules, candidateRules);
}
