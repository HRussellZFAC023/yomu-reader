import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { renderTokensToHtml } from '../../src/reader/dom';
import {
    hasResolvedPitchComponents,
    pitchComponentUnderlineGradient,
    resolvedPitchComponents,
} from '../../src/reader/lookup/pitch-components';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

function compound(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 2858295,
        sid: 0,
        rid: 0,
        spelling: '王子様',
        reading: 'おうじさま',
        frequencyRank: null,
        partOfSpeech: ['n'],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: '王[おう]子[じ]様[さま]',
        pitchComponents: [
            { spelling: '王子', reading: 'おうじ', pitchAccent: ['HLLL'], wordWithReading: '王[おう]子[じ]' },
            { spelling: '様', reading: 'さま', pitchAccent: ['LHH'], wordWithReading: '様[さま]' },
        ],
        ...overrides,
    };
}

describe('inline compound pitch components', () => {
    it('keeps aligned component accents separate in a proportional underline gradient', () => {
        const card = compound();

        expect(resolvedPitchComponents(card).map(component => component.pitchClass)).toEqual(['atamadaka', 'heiban']);
        expect(hasResolvedPitchComponents(card)).toBe(true);
        expect(pitchComponentUnderlineGradient(card)).toBe(
            'linear-gradient(to right, var(--jpdb-reader-pitch-atamadaka) 0%, var(--jpdb-reader-pitch-atamadaka) 66.667%, var(--jpdb-reader-pitch-heiban) 66.667%, var(--jpdb-reader-pitch-heiban) 100%)',
        );
    });

    it('carries the component gradient into cached subtitle/example HTML', () => {
        const card = compound();
        const html = renderTokensToHtml('王子様', [{
            card,
            start: 0,
            end: 3,
            length: 3,
            rubies: [],
            pitchClass: '',
            sentence: '王子様',
        }], { ...DEFAULT_SETTINGS, showPitchAccent: true });
        const root = document.createElement('div');
        root.innerHTML = html;
        const word = root.querySelector<HTMLElement>('.jpdb-reader-word');

        expect(word?.dataset.pitchComponents).toBe('true');
        expect(word?.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient')).toContain('--jpdb-reader-pitch-atamadaka');
        expect(word?.style.getPropertyValue('--jpdb-reader-inline-pitch-gradient')).toContain('--jpdb-reader-pitch-heiban');
    });

    it('refuses incomplete or misaligned decompositions', () => {
        expect(hasResolvedPitchComponents(compound({
            pitchComponents: [
                { spelling: '王子', reading: 'おうじ', pitchAccent: ['HLLL'], wordWithReading: null },
                { spelling: '達', reading: 'たち', pitchAccent: ['LHH'], wordWithReading: null },
            ],
        }))).toBe(false);
        expect(hasResolvedPitchComponents(compound({
            pitchComponents: [
                { spelling: '王子', reading: 'おうじ', pitchAccent: [], wordWithReading: null },
                { spelling: '様', reading: 'さま', pitchAccent: ['LHH'], wordWithReading: null },
            ],
        }))).toBe(false);
    });

    it('prefers an exact whole-word pitch over component decoration', () => {
        expect(hasResolvedPitchComponents(compound({ pitchAccent: ['LHHHHH'] }))).toBe(false);
        expect(pitchComponentUnderlineGradient(compound({ pitchAccent: ['LHHHHH'] }))).toBe('');
    });
});
