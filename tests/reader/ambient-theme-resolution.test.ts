import { afterEach, describe, expect, it } from 'vitest';

import { documentBackgroundLooksDark } from '../../src/reader/dom/word-contrast';
import { localPitchPatternsFromMeta } from '../../src/reader/lookup/pitch-meta';
import { setRenderedWordPitchAccentPattern } from '../../src/reader/dom/rendered-word-state';
import type { JPDBCard } from '../../src/reader/app/types';

afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.backgroundColor = '';
    document.documentElement.style.backgroundColor = '';
});

// theme:'auto' on ordinary hosts used to defer to prefers-color-scheme, which
// desktop shells can report as light while painting a dark page — the popover
// then rendered white-on-dark. Resolve from the page's real paint instead.
describe('documentBackgroundLooksDark', () => {
    it('reports dark for a dark-painted page', () => {
        document.body.style.backgroundColor = 'rgb(24, 27, 32)';
        expect(documentBackgroundLooksDark()).toBe(true);
    });

    it('reports light for a light-painted page', () => {
        document.body.style.backgroundColor = 'rgb(255, 255, 255)';
        expect(documentBackgroundLooksDark()).toBe(false);
    });

    it('blends a translucent body over the root paint', () => {
        document.documentElement.style.backgroundColor = 'rgb(10, 10, 12)';
        document.body.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        expect(documentBackgroundLooksDark()).toBe(true);
    });
});

// The in-place enrichment repaint must write the pattern with the class, so
// popup data and the underline can never disagree again.
describe('setRenderedWordPitchAccentPattern', () => {
    function card(pitchAccent: string[]): JPDBCard {
        return {
            vid: 9, sid: 9, rid: 0, spelling: '役に立つ', reading: 'やくにたつ', frequencyRank: null,
            partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent,
            wordWithReading: null, source: 'jiten',
        };
    }

    it('writes the joined pattern onto the word', () => {
        const word = document.createElement('span');
        setRenderedWordPitchAccentPattern(word, card(['LHHHLL']));
        expect(word.dataset.pitchAccent).toBe('LHHHLL');
    });

    it('leaves an existing pattern alone when the card has none', () => {
        const word = document.createElement('span');
        word.dataset.pitchAccent = 'LHHHLL';
        setRenderedWordPitchAccentPattern(word, card([]));
        expect(word.dataset.pitchAccent).toBe('LHHHLL');
    });
});

// Regression companion for the deconjugation fallback: exact-form entries keep
// resolving through the plain meta path untouched.
describe('exact local pitch meta path (unchanged)', () => {
    it('resolves an exact entry', () => {
        const patterns = localPitchPatternsFromMeta('漫画', 'まんが', [
            { expression: '漫画', mode: 'pitch', data: { reading: 'まんが', position: 0 }, dictionary: 'probe' } as never,
        ]);
        expect(patterns).toEqual(['LHHH']);
    });
});
