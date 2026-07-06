import { describe, expect, it } from 'vitest';

import {
    collectPitchVariants,
    pitchPatternFromPosition,
    validPitchPositions,
} from '../../src/reader/lookup/pitch-accent';
import { renderPitch } from '../../src/reader/popup/pitch';
import type { JPDBCard } from '../../src/reader/app/types';

const LABELS = { primary: 'Most common', alternative: 'Also used' };

function card(pitchAccent: string[]): JPDBCard {
    return {
        vid: 1,
        sid: 2,
        rid: 0,
        spelling: '双子',
        reading: 'ふたご',
        frequencyRank: 100,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['twins'], partOfSpeech: ['n'] }],
        cardState: ['due'],
        pitchAccent,
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
    } as JPDBCard;
}

describe('collectPitchVariants', () => {
    it('keeps source order (primary first), dedupes, and resolves downstep positions', () => {
        const variants = collectPitchVariants('ふたご', [
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 0), // duplicate contour drops
            pitchPatternFromPosition('ふたご', 3),
        ]);
        expect(variants.map(variant => variant.position)).toEqual([0, 3]);
        // Ordinal prevalence only — no invented percentages.
        expect(variants.every(variant => variant.commonality === undefined)).toBe(true);
    });

    it('exposes every valid downstep position across variants', () => {
        const positions = validPitchPositions('ふたご', [
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 3),
        ]);
        expect([...positions].sort()).toEqual([0, 3]);
    });
});

describe('renderPitch commonality badges', () => {
    it('labels the primary variant first and the rest as also-used', () => {
        const html = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 3),
        ]), [], LABELS);
        const root = document.createElement('div');
        root.innerHTML = html;
        const badges = Array.from(root.querySelectorAll('.jpdb-reader-pitch-variant-badge'), badge => badge.textContent);
        expect(badges).toEqual(['Most common', 'Also used']);
        const first = root.querySelector('.jpdb-reader-pitch-component');
        expect(first?.classList.contains('jpdb-reader-pitch-variant-primary')).toBe(true);
    });

    it('renders no badge for a single variant and none without labels', () => {
        const single = renderPitch(card([pitchPatternFromPosition('ふたご', 0)]), [], LABELS);
        expect(single).not.toContain('jpdb-reader-pitch-variant-badge');
        const unlabeled = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 3),
        ]));
        expect(unlabeled).not.toContain('jpdb-reader-pitch-variant-badge');
    });
});
