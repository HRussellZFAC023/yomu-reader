import { describe, expect, it } from 'vitest';

import {
    collectPitchVariants,
    pitchClassNameForPattern,
    pitchNumberForReading,
    pitchPatternFromPosition,
    splitMorae,
} from '../../src/reader/lookup/pitch-accent';

// pitchNumberForReading is the single source of truth for a word's pitch identity
// (the SRS item key, minimal-pair bucketing, and the position-picker option count).
// It must round-trip cleanly against pitchPatternFromPosition for every downstep
// position of a reading, because any drift would split or merge SRS items wrongly.
describe('pitchNumberForReading', () => {
    const readings = ['め', 'はし', 'くるま', 'たまご', 'おとこ', 'ともだち', 'にほんご'];

    it('round-trips every downstep position back to its number', () => {
        for (const reading of readings) {
            const moraCount = Array.from(reading).length; // these readings have no small kana
            for (let position = 0; position <= moraCount; position++) {
                const pattern = pitchPatternFromPosition(reading, position);
                expect(pattern, `pattern for ${reading}@${position}`).not.toBe('');
                expect(pitchNumberForReading([pattern], reading), `${reading}@${position}`).toBe(position);
            }
        }
    });

    it('maps the four canonical classes to the expected number', () => {
        // heiban (0), atamadaka (1), nakadaka (2 of 3), odaka (3 of 3)
        expect(pitchNumberForReading([pitchPatternFromPosition('くるま', 0)], 'くるま')).toBe(0);
        expect(pitchClassNameForPattern(pitchPatternFromPosition('くるま', 0), 'くるま')).toBe('heiban');
        expect(pitchNumberForReading([pitchPatternFromPosition('ねこ', 1)], 'ねこ')).toBe(1);
        expect(pitchClassNameForPattern(pitchPatternFromPosition('ねこ', 1), 'ねこ')).toBe('atamadaka');
        expect(pitchNumberForReading([pitchPatternFromPosition('たまご', 2)], 'たまご')).toBe(2);
        expect(pitchClassNameForPattern(pitchPatternFromPosition('たまご', 2), 'たまご')).toBe('nakadaka');
        expect(pitchNumberForReading([pitchPatternFromPosition('おとこ', 3)], 'おとこ')).toBe(3);
        expect(pitchClassNameForPattern(pitchPatternFromPosition('おとこ', 3), 'おとこ')).toBe('odaka');
    });

    it('classifies every numeric position without inventing a fifth positional class', () => {
        const reading = 'ふたご';
        const expected = ['heiban', 'atamadaka', 'nakadaka', 'odaka'];
        for (let position = 0; position <= splitMorae(reading).length; position += 1) {
            expect(pitchClassNameForPattern(pitchPatternFromPosition(reading, position), reading))
                .toBe(expected[position]);
        }
    });

    it('counts small kana as part of the preceding mora for every valid position', () => {
        const reading = 'きょう';
        expect(splitMorae(reading)).toEqual(['きょ', 'う']);
        expect([0, 1, 2].map(position => ({
            position,
            pattern: pitchPatternFromPosition(reading, position),
            className: pitchClassNameForPattern(pitchPatternFromPosition(reading, position), reading),
            roundTrip: pitchNumberForReading([pitchPatternFromPosition(reading, position)], reading),
        }))).toEqual([
            { position: 0, pattern: 'LHH', className: 'heiban', roundTrip: 0 },
            { position: 1, pattern: 'HLL', className: 'atamadaka', roundTrip: 1 },
            { position: 2, pattern: 'LHL', className: 'odaka', roundTrip: 2 },
        ]);
    });

    it('treats malformed multi-transition contours as unclassifiable instead of kifuku', () => {
        for (const pattern of ['LHLH', 'HLHL', 'LHLHL']) {
            expect(pitchClassNameForPattern(pattern, 'ふたご')).toBe('');
            expect(pitchNumberForReading([pattern], 'ふたご')).toBeNull();
        }
        expect(collectPitchVariants('ふたご', ['LHLH', pitchPatternFromPosition('ふたご', 2)]))
            .toEqual([{ pattern: pitchPatternFromPosition('ふたご', 2), position: 2 }]);
    });

    it('keeps compact no-drop source contours as heiban without accepting other truncated shapes', () => {
        expect(pitchClassNameForPattern('LH', 'そくじ')).toBe('heiban');
        expect(pitchNumberForReading(['LH'], 'そくじ')).toBe(0);
        expect(pitchClassNameForPattern('HL', 'ふたご')).toBe('');
    });

    it('collapses different spellings of the same reading+contour and distinguishes by contour', () => {
        // 箸 (atamadaka, 1) vs 橋/端 (odaka, 2) share reading はし — different numbers.
        const atama = pitchNumberForReading([pitchPatternFromPosition('はし', 1)], 'はし');
        const odaka = pitchNumberForReading([pitchPatternFromPosition('はし', 2)], 'はし');
        expect(atama).toBe(1);
        expect(odaka).toBe(2);
        expect(atama).not.toBe(odaka);
    });

    it('skips unresolvable patterns and uses the first that classifies', () => {
        const valid = pitchPatternFromPosition('はし', 1); // atamadaka for 2-mora はし
        expect(pitchNumberForReading(['', 'not-a-pattern', valid], 'はし')).toBe(1);
    });

    it('returns null for unusable inputs', () => {
        expect(pitchNumberForReading(null, 'はし')).toBeNull();
        expect(pitchNumberForReading([], 'はし')).toBeNull();
        expect(pitchNumberForReading(['LHL'], '')).toBeNull();
        // non-kana reading (kanji) cannot be split into morae
        expect(pitchNumberForReading(['LHL'], '橋')).toBeNull();
        // a pattern with no resolvable class
        expect(pitchNumberForReading([''], 'はし')).toBeNull();
    });
});
