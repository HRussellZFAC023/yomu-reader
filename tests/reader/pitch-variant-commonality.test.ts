import { describe, expect, it } from 'vitest';

import {
    collectPitchVariants,
    pitchPatternFromPosition,
    validPitchPositions,
} from '../../src/reader/lookup/pitch-accent';
import { pitchVariantBlockFit, pitchVariantDisplayPercentages, renderPitch } from '../../src/reader/popup/pitch';
import type { JPDBCard } from '../../src/reader/app/types';

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
    it('shows two ordinal-only variants as relative percentages', () => {
        const html = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 3),
        ]));
        const root = document.createElement('div');
        root.innerHTML = html;
        const badges = Array.from(root.querySelectorAll('.jpdb-reader-pitch-variant-badge'), badge => badge.textContent);
        expect(badges).toEqual(['67%', '33%']);
        const first = root.querySelector('.jpdb-reader-pitch-component');
        expect(first?.classList.contains('jpdb-reader-pitch-variant-primary')).toBe(true);
    });

    it('renders no badge for a single variant', () => {
        const single = renderPitch(card([pitchPatternFromPosition('ふたご', 0)]));
        expect(single).not.toContain('jpdb-reader-pitch-variant-badge');
    });

    it('keeps all three supported variants in one wrapping graph group with shares totalling 100%', () => {
        const html = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 1),
            pitchPatternFromPosition('ふたご', 3),
        ]));
        const root = document.createElement('div');
        root.innerHTML = html;

        expect(root.querySelectorAll('.jpdb-reader-pitch-variant')).toHaveLength(3);
        expect(root.querySelector('.jpdb-reader-pitch-variants')).not.toBeNull();
        expect(Array.from(root.querySelectorAll('.jpdb-reader-pitch-variant-badge'), badge => badge.textContent)).toEqual(['50%', '33%', '17%']);
    });

    it('centres each contour and percentage inside its variant card', () => {
        const root = document.createElement('div');
        root.innerHTML = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 3),
        ]));

        for (const variant of root.querySelectorAll('.jpdb-reader-pitch-variant')) {
            const svg = variant.querySelector('svg')!;
            const width = Number(svg.getAttribute('width'));
            const points = Array.from(svg.querySelectorAll('circle'), point => Number(point.getAttribute('cx')));
            expect(points[0]).toBe(21);
            expect(points.at(-1)).toBe(width - 21);
            expect(variant.lastElementChild?.classList.contains('jpdb-reader-pitch-variant-badge')).toBe(true);
        }
    });

    it('uses complete supplied commonality values instead of ordinal shares', () => {
        expect(pitchVariantDisplayPercentages([
            { pattern: 'LHH', position: 0, commonality: 80 },
            { pattern: 'HLL', position: 1, commonality: 15 },
            { pattern: 'LHL', position: 2, commonality: 5 },
        ])).toEqual([80, 15, 5]);
    });

    it('does not mix a partial commonality signal with ordinal-only variants', () => {
        expect(pitchVariantDisplayPercentages([
            { pattern: 'LHH', position: 0, commonality: 90 },
            { pattern: 'HLL', position: 1 },
        ])).toEqual([67, 33]);
    });


});

describe('pitchVariantBlockFit', () => {
    it('keeps a two-graph block of a short reading compact (fits beside the headword)', () => {
        expect(pitchVariantBlockFit('ふたご', 2)).toBe('compact');
    });

    it('treats three graphs as wide so they demote to their own row', () => {
        expect(pitchVariantBlockFit('ふたご', 3)).toBe('wide');
    });

    it('treats a long reading as wide even with only two graphs', () => {
        expect(pitchVariantBlockFit('いっしょうけんめい', 2)).toBe('wide');
    });
});

describe('renderPitch fit hint', () => {
    it('marks a compact two-variant block so the header keeps it top-right', () => {
        const root = document.createElement('div');
        root.innerHTML = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 3),
        ]));
        expect(root.querySelector('.jpdb-reader-pitch-variants')?.getAttribute('data-pitch-fit')).toBe('compact');
    });

    it('marks a three-variant block wide so it demotes to a full-width row', () => {
        const root = document.createElement('div');
        root.innerHTML = renderPitch(card([
            pitchPatternFromPosition('ふたご', 0),
            pitchPatternFromPosition('ふたご', 1),
            pitchPatternFromPosition('ふたご', 3),
        ]));
        expect(root.querySelector('.jpdb-reader-pitch-variants')?.getAttribute('data-pitch-fit')).toBe('wide');
    });
});
