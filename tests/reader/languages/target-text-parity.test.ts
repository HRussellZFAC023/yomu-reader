import { afterEach, describe, expect, it } from 'vitest';

import { resetActiveLearningTargetLanguage } from '../../../src/reader/languages/active';
import { fallbackLookupTermsForText } from '../../../src/reader/lookup/japanese-segments';
import { targetLookupTermsForText } from '../../../src/reader/lookup/target-text';

/**
 * `targetLookupTermsForText` is the target-neutral door into the same
 * deinflector `fallbackLookupTermsForText` has always used, and callers are
 * expected to migrate from one to the other. That only holds if Japanese comes
 * out the far side unchanged.
 *
 * The trap this pins is ordering, not membership. Both lists are capped at
 * eight terms, so a comparator that ranks two same-depth analyses differently
 * does not merely reshuffle the answer — it decides which dictionary form
 * survives the cap. Ranking needs the candidate's `rules`, which only the
 * target that produced them may read, so the ordering lives on the target
 * contract as `compareLookupCandidates`. Sorting on shape alone inside the
 * shared helper pushed 食べる, the dictionary form of 食べられなかった, off the
 * end of the list entirely.
 *
 * Every sample below is a real conjugation whose ranking depends on the rule
 * tags: potential/negative/past stacks, a suru compound, an irregular kuru,
 * and a polite negative past.
 */
const JAPANESE_CONJUGATION_CORPUS = [
    '食べられなかった',
    '勉強しました',
    '来ました',
    'できませんでした',
    '読まなければならない',
    '話しかけられている',
    '行かせられた',
    '面白くなかった',
    '見つからない',
    '始めよう',
    '冒険を始めよう',
    'もう一度、冒険を始めよう。',
] as const;

afterEach(() => {
    resetActiveLearningTargetLanguage();
});

describe('targetLookupTermsForText on the default Japanese target', () => {
    it.each(JAPANESE_CONJUGATION_CORPUS)('matches the Japanese fallback path for %s', surface => {
        expect(targetLookupTermsForText(surface)).toEqual(fallbackLookupTermsForText(surface));
    });

    it('keeps the dictionary form inside the eight-term cap', () => {
        const terms = targetLookupTermsForText('食べられなかった');

        expect(terms.length).toBeLessThanOrEqual(8);
        expect(terms).toContain('食べる');
    });

    it('leads with the surface itself', () => {
        expect(targetLookupTermsForText('勉強しました')[0]).toBe('勉強しました');
    });
});
