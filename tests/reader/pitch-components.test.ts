import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { renderTokensToHtml } from '../../src/reader/dom';
import {
    hasPaintablePitchComponents,
    hasResolvedPitchComponents,
    inferredAnnotatedPitchComponents,
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
    it('recovers aligned component geometry from an annotated expression without inventing pitch', () => {
        const card = compound({
            spelling: '申し訳ありません',
            reading: 'もうしわけありません',
            wordWithReading: '申[もう]し訳[わけ]ありません',
            pitchComponents: undefined,
        });

        expect(inferredAnnotatedPitchComponents(card)).toEqual([
            {
                spelling: '申し訳',
                reading: 'もうしわけ',
                pitchAccent: [],
                wordWithReading: null,
                inferredFromAnnotatedReading: true,
            },
            {
                spelling: 'ありません',
                reading: 'ありません',
                pitchAccent: [],
                wordWithReading: null,
                inferredFromAnnotatedReading: true,
            },
        ]);
        expect(card.pitchAccent).toEqual([]);
    });

    it('rejects inferred boundaries when the provider reading cannot tile them exactly', () => {
        expect(inferredAnnotatedPitchComponents(compound({
            spelling: '申し訳ありません',
            reading: 'もうしわけございません',
            wordWithReading: '申[もう]し訳[わけ]ありません',
            pitchComponents: undefined,
        }))).toEqual([]);
    });

    it('refuses broad inferred decompositions that would fan out public lookups', () => {
        expect(inferredAnnotatedPitchComponents(compound({
            spelling: '東京大学日本語学校',
            reading: 'とうきょうだいがくにほんごがっこう',
            wordWithReading: '東京[とうきょう]大学[だいがく]日本語[にほんご]学校[がっこう]',
            pitchComponents: undefined,
        }))).toEqual([]);
    });

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

    it('paints a partial gradient with a neutral segment when one morpheme has no pitch', () => {
        // 賛成 resolves; 票率順 has no bank entry. The whole underline used to
        // vanish; now 賛成's colour paints and the unresolved tail is neutral.
        const card = compound({
            spelling: '賛成票率順',
            reading: 'さんせいひょうりつじゅん',
            wordWithReading: null,
            pitchComponents: [
                { spelling: '賛成', reading: 'さんせい', pitchAccent: ['LHHH'], wordWithReading: null },
                { spelling: '票率順', reading: 'ひょうりつじゅん', pitchAccent: [], wordWithReading: null },
            ],
        });

        // Strict resolution still reports "incomplete" so the enrichment passes
        // keep trying to fill 票率順, but the paintable/gradient views tolerate it.
        expect(resolvedPitchComponents(card)).toEqual([]);
        expect(hasResolvedPitchComponents(card)).toBe(false);
        expect(hasPaintablePitchComponents(card)).toBe(true);

        const gradient = pitchComponentUnderlineGradient(card);
        expect(gradient).toContain('var(--jpdb-reader-pitch-heiban)');
        expect(gradient).toContain('var(--jpdb-reader-pitch-unknown)');
        // The colour boundary sits on the exact 賛成 | 票率順 substring split (2/5).
        expect(gradient).toBe(
            'linear-gradient(to right, var(--jpdb-reader-pitch-heiban) 0%, var(--jpdb-reader-pitch-heiban) 40%, var(--jpdb-reader-pitch-unknown) 40%, var(--jpdb-reader-pitch-unknown) 100%)',
        );
    });

    it('still voids the gradient when not a single morpheme resolves', () => {
        const card = compound({
            pitchComponents: [
                { spelling: '王子', reading: 'おうじ', pitchAccent: [], wordWithReading: null },
                { spelling: '様', reading: 'さま', pitchAccent: [], wordWithReading: null },
            ],
        });
        expect(hasPaintablePitchComponents(card)).toBe(false);
        expect(pitchComponentUnderlineGradient(card)).toBe('');
    });
});
