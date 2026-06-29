import { splitMorae } from '../lookup/pitch-accent';
import type { PitchSrsItem } from './pitch-srs';

// Minimal-pair / contrast generation over the persistent pitch deck (NOT just the
// small live session), tiered so it never dead-ends:
//   1. STRICT — same kana reading, different downstep (true minimal pair: はし箸 vs 橋)
//   2. LOOSE  — same mora count, different pitch class ("similar", not identical)
// A target with an unverified contour is excluded from strict pairs (it could grade
// the learner against a contour the audio contradicts) but can still drill loosely.

export type PitchPairKind = 'strict' | 'loose';

export interface PitchContrast {
    contrast: PitchSrsItem;
    kind: PitchPairKind;
}

function moraLength(reading: string): number {
    return splitMorae(reading).length;
}

export function findPitchContrast(target: PitchSrsItem, pool: PitchSrsItem[]): PitchContrast | null {
    // Contrast partners are played aloud as a teaching example, so they must have a
    // trusted contour — never pair against an unverified-pitch word.
    const others = pool.filter(item => item.key !== target.key && !item.suspended && !item.unverifiedPitch);
    if (!target.unverifiedPitch) {
        const strict = others.find(item => item.reading === target.reading && item.pitchNumber !== target.pitchNumber);
        if (strict) return { contrast: strict, kind: 'strict' };
    }
    const targetMora = moraLength(target.reading);
    const loose = others.find(item => item.pitchClass && item.pitchClass !== target.pitchClass && moraLength(item.reading) === targetMora);
    return loose ? { contrast: loose, kind: 'loose' } : null;
}

// All true minimal-pair sets present in the deck (for an "N minimal pairs ready"
// indicator and for prioritising which words to warm audio for).
export function collectStrictPitchPairs(pool: PitchSrsItem[]): Array<[PitchSrsItem, PitchSrsItem]> {
    const byReading = new Map<string, PitchSrsItem[]>();
    for (const item of pool) {
        if (item.unverifiedPitch || item.suspended) continue;
        const list = byReading.get(item.reading) ?? [];
        list.push(item);
        byReading.set(item.reading, list);
    }
    const pairs: Array<[PitchSrsItem, PitchSrsItem]> = [];
    for (const list of byReading.values()) {
        for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 1; j < list.length; j += 1) {
                if (list[i].pitchNumber !== list[j].pitchNumber) pairs.push([list[i], list[j]]);
            }
        }
    }
    return pairs;
}
