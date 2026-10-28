import { describe, expect, it } from 'vitest';

import { createPitchItem, type PitchSrsItem } from '../../src/reader/newtab/pitch-srs';
import { collectStrictPitchPairs, findPitchContrast } from '../../src/reader/newtab/pitch-pairs';

const NOW = 1_000_000_000_000;

function item(reading: string, pitchNumber: number, pitchClass: PitchSrsItem['pitchClass'], overrides: Partial<PitchSrsItem> = {}): PitchSrsItem {
    return {
        ...createPitchItem({ reading, pitchNumber, pattern: 'LHL', pitchClass, displaySpelling: reading, now: NOW }),
        ...overrides,
    };
}

describe('findPitchContrast', () => {
    it('prefers a strict same-reading, different-downstep twin', () => {
        const target = item('はし', 1, 'atamadaka');
        const twin = item('はし', 2, 'odaka');
        const unrelated = item('くるま', 0, 'heiban');
        const found = findPitchContrast(target, [target, twin, unrelated]);
        expect(found?.kind).toBe('strict');
        expect(found?.contrast.key).toBe(twin.key);
    });

    it('falls back to a loose same-mora, different-class word when no twin exists', () => {
        const target = item('ねこ', 1, 'atamadaka'); // 2 mora
        const looseSameMora = item('いぬ', 0, 'heiban'); // 2 mora, different class
        const wrongMora = item('たまご', 0, 'heiban'); // 3 mora
        const found = findPitchContrast(target, [target, wrongMora, looseSameMora]);
        expect(found?.kind).toBe('loose');
        expect(found?.contrast.key).toBe(looseSameMora.key);
    });

    it('never dead-ends incorrectly: returns null only when nothing contrasts', () => {
        const target = item('ねこ', 1, 'atamadaka');
        const sameEverything = item('うみ', 1, 'atamadaka'); // 2 mora but SAME class
        expect(findPitchContrast(target, [target, sameEverything])).toBeNull();
    });

    it('excludes unverified-pitch words from strict pairs', () => {
        const target = item('はし', 1, 'atamadaka');
        const unverifiedTwin = item('はし', 2, 'odaka', { unverifiedPitch: true });
        const found = findPitchContrast(target, [target, unverifiedTwin]);
        // no strict (unverified twin excluded); 2-mora different-class loose also fails here
        expect(found).toBeNull();
    });
});

describe('collectStrictPitchPairs', () => {
    it('enumerates every same-reading, different-downstep pair', () => {
        const pool = [
            item('はし', 1, 'atamadaka'),
            item('はし', 2, 'odaka'),
            item('あめ', 1, 'atamadaka'),
            item('あめ', 0, 'heiban'),
            item('くるま', 0, 'heiban'),
        ];
        const pairs = collectStrictPitchPairs(pool);
        expect(pairs).toHaveLength(2); // はし pair + あめ pair; くるま has no twin
    });

    it('skips unverified items', () => {
        const pool = [item('はし', 1, 'atamadaka'), item('はし', 2, 'odaka', { unverifiedPitch: true })];
        expect(collectStrictPitchPairs(pool)).toHaveLength(0);
    });
});
