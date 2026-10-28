import { describe, expect, it } from 'vitest';

import { readerWordClassName, renderTokensToHtml } from '../../src/reader/dom/index';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function card(overrides: Partial<JPDBCard>): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling: '', reading: '', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null, source: 'jiten',
        ...overrides,
    };
}

function token(wordCard: JPDBCard, pitchClass = ''): JPDBToken {
    return {
        card: wordCard,
        start: 0, end: wordCard.spelling.length, length: wordCard.spelling.length,
        rubies: [], pitchClass, sentence: wordCard.spelling,
    };
}

// Particles are clitics with no lexical accent: a dictionary "pattern" for the
// same kana belongs to a homophone noun (葉/荷/戸), so は・に・と wore spurious
// underlines while を・の had none. All particles now render deliberately
// accentless via a dedicated class.
describe('particle pitch is deliberately accentless', () => {
    it('renders は with a particle class even when a homophone pattern leaked in', () => {
        const particle = card({ spelling: 'は', reading: 'は', pitchAccent: ['HL'], partOfSpeech: ['prt'] });
        const className = readerWordClassName('not-in-deck', token(particle, 'atamadaka'), { showPitchAccent: true });
        expect(className).toContain('jpdb-reader-particle');
        expect(className).toContain('jpdb-pitch-particle');
        expect(className).not.toContain('jpdb-pitch-atamadaka');
    });

    it('classes を and の identically to は (uniform accentless particles)', () => {
        for (const spelling of ['を', 'の']) {
            const particle = card({ spelling, reading: spelling });
            const className = readerWordClassName('not-in-deck', token(particle), { showPitchAccent: true });
            expect(className).toContain('jpdb-pitch-particle');
        }
    });

    it('does not emit data-pitch-accent for particles in rendered HTML', () => {
        const particle = card({ spelling: 'は', reading: 'は', pitchAccent: ['HL'], partOfSpeech: ['prt'] });
        const html = renderTokensToHtml('は', [token(particle, 'atamadaka')], DEFAULT_SETTINGS);
        expect(html).toContain('jpdb-pitch-particle');
        expect(html).not.toContain('data-pitch-accent');
    });

    it('keeps real content words on their lexical pitch class', () => {
        const noun = card({ spelling: '漫画', reading: 'まんが', pitchAccent: ['LHHH'] });
        const className = readerWordClassName('not-in-deck', token(noun, 'heiban'), { showPitchAccent: true });
        expect(className).toContain('jpdb-pitch-heiban');
        expect(className).not.toContain('jpdb-pitch-particle');
    });
});
