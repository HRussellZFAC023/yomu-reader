import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { KOREAN_LEARNING_TARGET } from '../../../src/reader/languages/korean';
import { createLearningTargetModule } from '../../../src/reader/languages/module';
import {
    targetHasMorphology,
    targetLookupCandidateRulesMatch,
    targetLookupCandidates,
} from '../../../src/reader/languages/morphology';
import {
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../../src/reader/languages/registry';
import type { LanguageLookupCandidate } from '../../../src/reader/languages/types';

// The Japanese primitives the dictionary engine used to import directly. They
// are imported here only to prove the contract reproduces them exactly.
import { deinflectJapaneseTerm, termRulesMatch, type DeinflectedTerm } from '../../../src/reader/lookup/deinflect';

// The generic Yomitan layer, imported exactly as it ships. Nothing in this file
// edits it; the point is that what the contract returns drops into it unchanged.
import { nonOverlappingMatches } from '../../../src/reader/dictionaries/yomitan/ranking';
import { termMatchesForEntries, type TermMatchCandidates } from '../../../src/reader/dictionaries/yomitan/term-match';
import type { YomitanTermEntry, YomitanTermMatch } from '../../../src/reader/dictionaries/yomitan/types';
import type { DictionaryPreference } from '../../../src/reader/app/types';

// A second real consumer of morphology, imported as it ships.
import { localPitchResolutionFromMetaLookup } from '../../../src/reader/lookup/pitch-meta';
import type { YomitanMetaEntry } from '../../../src/reader/dictionaries/yomitan';

const AD_HOC_LANGUAGES = ['de'] as const;

afterEach(() => {
    resetActiveLearningTargetLanguage();
    for (const language of AD_HOC_LANGUAGES) unregisterLearningTargetModule(language);
});

/**
 * A second real-morphology target that is emphatically not Japanese. Its rules
 * are German participle formation, in a tag vocabulary of its own.
 */
function germanTarget() {
    return createLearningTargetModule({
        id: 'german-morphology-test-target',
        language: 'de',
        featureSemantics: {
            characterSystem: 'latin',
            phoneticScripts: ['latin'],
            pronunciation: 'stress',
            readingAnnotation: 'none',
        },
        detectsText: /[A-Za-zÄÖÜäöüß]/u,
        lookupCandidates(text: string): readonly LanguageLookupCandidate[] {
            const candidates: LanguageLookupCandidate[] = [{ term: text, rules: [], reasons: [], depth: 0 }];
            const participle = /^ge(.+)t$/u.exec(text);
            if (participle) {
                candidates.push({
                    term: `${participle[1]}en`,
                    rules: ['verb-weak'],
                    reasons: ['past participle'],
                    depth: 1,
                });
            }
            return candidates;
        },
    });
}

function activateGerman() {
    const target = registerLearningTargetModule(germanTarget());
    expect(setActiveLearningTargetLanguage('de')).toBe(target);
    return target;
}

const JAPANESE_SURFACES = [
    '食べました',
    '読んでいる',
    'やっちゃった',
    '行った',
    '来られる',
    '高くなかった',
    '勉強しませんでした',
    '見る',
    'ねこ',
    '',
];

describe('morphology is a contract member, not a Japanese import', () => {
    it('reproduces the Japanese deinflector exactly, depth included', () => {
        for (const surface of JAPANESE_SURFACES) {
            expect(JAPANESE_LEARNING_TARGET.lookupCandidates(surface))
                .toEqual(deinflectJapaneseTerm(surface));
        }
    });

    it('carries the depth the dictionary ranks on', () => {
        const candidates = JAPANESE_LEARNING_TARGET.lookupCandidates('食べました');

        // The surface itself is always candidate zero, at depth 0.
        expect(candidates[0]).toEqual({ term: '食べました', rules: [], reasons: [], depth: 0 });
        // Every candidate states a depth, and depth is non-decreasing.
        expect(candidates.every(candidate => typeof candidate.depth === 'number')).toBe(true);
        expect(candidates.map(candidate => candidate.depth))
            .toEqual([...candidates.map(candidate => candidate.depth)].sort((a, b) => a - b));

        const lemma = candidates.find(candidate => candidate.term === '食べる');
        expect(lemma?.depth).toBe(1);
        expect(lemma?.reasons).toContain('polite past');
        expect(lemma?.rules).toContain('v1');
    });

    it('carries grammatical conditions across every deinflection step', () => {
        const impossibleVerbChain = deinflectJapaneseTerm('食べましたい');
        expect(impossibleVerbChain.map(candidate => candidate.term)).not.toContain('食べる');

        const impossibleAdjectiveChain = deinflectJapaneseTerm('高かった');
        expect(impossibleAdjectiveChain.map(candidate => candidate.term)).toContain('高い');
        expect(impossibleAdjectiveChain.map(candidate => candidate.term)).not.toContain('高う');

        const shallow = deinflectJapaneseTerm('読みました')
            .filter(candidate => candidate.term === '読む');
        expect(shallow).toHaveLength(1);
        expect(shallow[0]).toMatchObject({
            rules: ['v5m', 'v5'],
            reasons: ['polite past'],
            depth: 1,
        });

        // With the intermediate conditions sound, a real chain is no longer
        // cut off at the old arbitrary depth of two.
        expect(deinflectJapaneseTerm('読ませられました'))
            .toContainEqual(expect.objectContaining({
                term: '読む',
                rules: ['v5m', 'v5'],
                reasons: ['polite past', 'potential/passive', 'causative'],
                depth: 3,
            }));
    });

    it('exposes the JMdict rule-tag semantics through the target, not the engine', () => {
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('v5m vt', ['v5m', 'v5'])).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('', ['v5m', 'v5'])).toBe(false);
        // The Japanese-only families: v5m is a kind of v5, adj-i and i-adj are one tag.
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('v5', ['v5m'])).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('adj-i', ['i-adj'])).toBe(true);
        // A candidate's generic v5 fallback may answer a generic dictionary
        // tag, but it must not erase a contradictory specific godan class.
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('v5s', ['v5m', 'v5'])).toBe(false);
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('v5k-s', ['v5k', 'v5'])).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules('v5aru', ['v5r', 'v5'])).toBe(true);

        // Byte-for-byte the primitive the engine used to call directly.
        const cases: Array<[string | undefined, string[]]> = [
            ['v5m vt', ['v5m', 'v5']],
            ['v5', ['v5m']],
            ['adj-i', ['i-adj']],
            ['i-adj', ['adj-i']],
            ['vs vt', ['vs', 'vs-s', 'suru']],
            ['', ['v1']],
            [undefined, []],
            ['v1', []],
        ];
        for (const [entryRules, candidateRules] of cases) {
            expect(JAPANESE_LEARNING_TARGET.matchesLookupCandidateRules(entryRules, candidateRules))
                .toBe(termRulesMatch(entryRules, candidateRules));
        }
    });
});

describe('a non-Japanese target does not get Japanese morphology', () => {
    it('uses its own bounded Adapter without deinflecting Japanese verbs', () => {
        // Under Japanese, 食べました is an inflection of 食べる.
        expect(targetLookupCandidates('食べました').map(candidate => candidate.term))
            .toContain('食べる');
        expect(targetHasMorphology()).toBe(true);

        expect(setActiveLearningTargetLanguage('ko')).toBe(KOREAN_LEARNING_TARGET);
        expect(targetHasMorphology()).toBe(true);
        expect(KOREAN_LEARNING_TARGET.experiences.morphology).toBe('bounded-rewrites');

        // Under Korean it is a surface and nothing else. Before morphology was
        // a contract member this text went through godan/ichidan rules no
        // matter which language the reader was studying.
        for (const surface of ['食べました', '読んでいる', 'やっちゃった', '来られる', '高くなかった']) {
            expect(targetLookupCandidates(surface))
                .toEqual([{ term: surface, rules: [], reasons: [], depth: 0 }]);
        }
    });

    it('refuses the JMdict part-of-speech families for a non-Japanese target', () => {
        // Japanese: v5m counts as v5, and adj-i/i-adj are the same tag.
        expect(targetLookupCandidateRulesMatch('v5', ['v5m'])).toBe(true);
        expect(targetLookupCandidateRulesMatch('adj-i', ['i-adj'])).toBe(true);

        setActiveLearningTargetLanguage('ko');

        // Generic: tags are opaque strings, compared verbatim. A Korean or
        // German dictionary entry is not silently a Japanese godan verb.
        expect(targetLookupCandidateRulesMatch('v5', ['v5m'])).toBe(false);
        expect(targetLookupCandidateRulesMatch('adj-i', ['i-adj'])).toBe(false);
        expect(targetLookupCandidateRulesMatch('v5m vt', ['v5m'])).toBe(true);
        expect(targetLookupCandidateRulesMatch('anything', [])).toBe(true);
    });

    it('runs the second target\'s own morphology, in its own tag vocabulary', () => {
        activateGerman();

        expect(targetLookupCandidates('gemacht')).toEqual([
            { term: 'gemacht', rules: [], reasons: [], depth: 0 },
            { term: 'machen', rules: ['verb-weak'], reasons: ['past participle'], depth: 1 },
        ]);
        expect(targetLookupCandidateRulesMatch('verb-weak vt', ['verb-weak'])).toBe(true);
        expect(targetLookupCandidateRulesMatch('v5m', ['verb-weak'])).toBe(false);

        // And Japanese morphology is nowhere in sight.
        expect(targetLookupCandidates('食べました'))
            .toEqual([{ term: '食べました', rules: [], reasons: [], depth: 0 }]);
    });
});

describe('the generic Yomitan layer consumes contract output unchanged', () => {
    const rank = new Map<string, DictionaryPreference>();

    function entry(overrides: Partial<YomitanTermEntry> = {}): YomitanTermEntry {
        return {
            expression: '読む',
            reading: 'よむ',
            rules: 'v5m vt',
            glossary: ['to read'],
            dictionary: 'JMdict',
            ...overrides,
        };
    }

    function candidatesFor(surface: string): TermMatchCandidates {
        const candidates: TermMatchCandidates = new Map();
        for (const deinflected of targetLookupCandidates(surface)) {
            const positions = candidates.get(deinflected.term) ?? [];
            // This is exactly the object dictionaries/yomitan/index.ts builds;
            // if the contract's candidate shape did not satisfy the engine's
            // `deinflected` field, this file would not compile.
            positions.push({ start: 0, end: surface.length, surface, deinflected });
            candidates.set(deinflected.term, positions);
        }
        return candidates;
    }

    it('matches a contract candidate against a JMdict entry and keeps its depth', () => {
        const matches = termMatchesForEntries('読む', [entry()], candidatesFor('読みました'), rank);

        // The direct polite-past rule is valid. The old past-then-polite route
        // reinterpreted a v5s intermediate as v5m and must not survive.
        expect(matches.map(match => match.deinflected?.depth)).toEqual([1]);
        expect(matches.every(match => match.surface === '読みました')).toBe(true);
        expect(matches.every(match => match.deinflected?.term === '読む')).toBe(true);
        expect(matches[0]?.deinflected?.reasons).toEqual(['polite past']);
    });

    it('drops a contract candidate whose rules the entry cannot carry', () => {
        // 読みました deinflects to 読む as a v5m godan verb; an ichidan entry
        // must not answer it.
        const matches = termMatchesForEntries('読む', [entry({ rules: 'v1' })], candidatesFor('読みました'), rank);
        expect(matches).toEqual([]);
    });

    it('does not collapse distinct id-less rows before checking their rules', () => {
        const matches = termMatchesForEntries(
            '読む',
            [entry({ rules: 'v1' }), entry({ rules: 'v5m', glossary: ['to read, compatible row'] })],
            candidatesFor('読みました'),
            rank,
        );

        expect(matches).toHaveLength(1);
        expect(matches[0]?.entry).toMatchObject({ rules: 'v5m', glossary: ['to read, compatible row'] });
    });

    it('lets the engine rank on the depth the contract supplied', () => {
        const candidates = candidatesFor('読みました');
        const shallowPosition = candidates.get('読む')?.[0];
        expect(shallowPosition).toBeDefined();
        candidates.get('読む')?.push({
            ...shallowPosition!,
            deinflected: {
                ...shallowPosition!.deinflected,
                reasons: [...shallowPosition!.deinflected.reasons, 'test outer form'],
                depth: 3,
            },
        });
        const matches: YomitanTermMatch[] = termMatchesForEntries(
            '読む',
            [entry()],
            candidates,
            rank,
        );
        const shallow = matches.find(match => match.deinflected?.depth === 1);
        expect(shallow).toBeDefined();

        // Both analyses cover the same span, so exactly one survives selection.
        // The comparator picks the shallower one — which it can only do because
        // `depth` crossed the contract intact. Feeding them in deepest-first
        // order proves the ordering is the comparator's doing, not input order.
        expect(nonOverlappingMatches([...matches].reverse(), 5)).toEqual([shallow]);
    });

    // GitHub #43, the part no amount of reordering in Settings could fix: the
    // shelf order decided how sections were LISTED, but the parse-time comparator
    // never looked at priority at all -- it broke a tie between two dictionaries
    // ALPHABETICALLY, so which dictionary actually answered was decided by name.
    it('lets the dictionary order the learner arranged decide which entry answers', () => {
        const shelf = (...names: string[]): Map<string, DictionaryPreference> => new Map(names.map((name, index) => [
            name,
            { name, alias: name, enabled: true, priority: index, type: 'terms' as const },
        ]));
        const match = (dictionary: string): YomitanTermMatch => ({
            ...termMatchesForEntries('読む', [entry({ dictionary })], candidatesFor('読む'), rank)[0]!,
        });
        const alphabeticallyFirst = match('AAA Dictionary');
        const arrangedFirst = match('Zzz Dictionary');

        expect(nonOverlappingMatches(
            [alphabeticallyFirst, arrangedFirst],
            1,
            shelf('Zzz Dictionary', 'AAA Dictionary'),
        )).toEqual([arrangedFirst]);

        // Reverse the shelf and the other one answers; with no shelf at all the
        // historical alphabetical tiebreak still applies.
        expect(nonOverlappingMatches(
            [alphabeticallyFirst, arrangedFirst],
            1,
            shelf('AAA Dictionary', 'Zzz Dictionary'),
        )).toEqual([alphabeticallyFirst]);
        expect(nonOverlappingMatches([arrangedFirst, alphabeticallyFirst], 1)).toEqual([alphabeticallyFirst]);
    });
});

describe('the pitch fallback deconjugates through the contract too', () => {
    function metaLookup(bank: Record<string, YomitanMetaEntry[]>) {
        return vi.fn(async (expression: string) => bank[expression] ?? []);
    }

    const bank = {
        問う: [{ expression: '問う', mode: 'pitch', data: { reading: 'とう', position: 0 }, dictionary: 'probe-pitch' } as YomitanMetaEntry],
    };

    it('projects the base accent for Japanese', async () => {
        const lookup = metaLookup(bank);
        await expect(localPitchResolutionFromMetaLookup('問わず', 'とわず', lookup))
            .resolves.toEqual({ patterns: ['LHHH'] });
        expect(lookup).toHaveBeenCalledWith('問う');
    });

    it('does not deconjugate, or spend a lookup, under a non-Japanese target', async () => {
        setActiveLearningTargetLanguage('ko');

        const lookup = metaLookup(bank);
        await expect(localPitchResolutionFromMetaLookup('問わず', 'とわず', lookup))
            .resolves.toEqual({ patterns: [] });
        // Only the exact form is asked for. Japanese morphology used to invent
        // 問う here regardless of the target and pay for a second lookup.
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith('問わず');
        expect(lookup).not.toHaveBeenCalledWith('問う');
    });
});

describe('resolving morphology stays cheap without going stale', () => {
    it('re-resolves when a target is re-registered for the language already active', () => {
        // The seam is asked for candidates once per candidate substring —
        // thousands of times per line — so activeLearningTarget() caches its
        // answer. The cache must still notice a module swapped in underneath it.
        expect(targetLookupCandidates('食べました').map(candidate => candidate.term))
            .toContain('食べる');

        const inert = createLearningTargetModule({
            id: 'japanese-inert-test-target',
            language: 'ja',
            featureSemantics: {
                characterSystem: 'kanji',
                phoneticScripts: ['hiragana'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
        });

        try {
            registerLearningTargetModule(inert);
            expect(targetLookupCandidates('食べました'))
                .toEqual([{ term: '食べました', rules: [], reasons: [], depth: 0 }]);
        } finally {
            registerLearningTargetModule(JAPANESE_LEARNING_TARGET);
        }

        expect(targetLookupCandidates('食べました').map(candidate => candidate.term))
            .toContain('食べる');
    });
});

describe('the morphology shape is language-neutral', () => {
    it('is one type under two names, so the engine never holds a Japanese-named shape', () => {
        const fromContract: LanguageLookupCandidate = targetLookupCandidates('食べた')[0]!;
        // Assignable both ways: `DeinflectedTerm` is an alias of the neutral
        // shape, not a parallel Japanese type. tsc is the real assertion here.
        const asLegacy: DeinflectedTerm = fromContract;
        const backToNeutral: LanguageLookupCandidate = asLegacy;

        expect(Object.keys(backToNeutral).sort()).toEqual(['depth', 'reasons', 'rules', 'term']);
    });
});
