import { afterEach, describe, expect, it } from 'vitest';

import { documentBackgroundLooksDark } from '../../src/reader/dom/page-background';
import { localPitchPatternsFromMeta } from '../../src/reader/lookup/pitch-meta';
import { setRenderedWordPitchAccentPattern } from '../../src/reader/dom/rendered-word-state';
import type { JPDBCard } from '../../src/reader/app/types';

afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
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

    // An unpainted page is the user agent's canvas, and the only signal left is
    // the copy's own colour — which has to be DECISIVELY light to imply a dark
    // canvas. Reading "closer to white than to black" as light accepted every
    // grey lighter than about #767676, so ordinary muted secondary copy on a
    // plainly white page resolved to the dark canvas.
    it('reports light for an unpainted page whose copy is muted grey', () => {
        document.body.style.color = 'rgb(153, 153, 153)';
        expect(documentBackgroundLooksDark()).toBe(false);
    });

    it('still reports dark for an unpainted page with decisively light copy', () => {
        document.body.style.color = 'rgb(242, 244, 248)';
        expect(documentBackgroundLooksDark()).toBe(true);
    });

    // This function and the per-word probe are the two authorities over the same
    // question, and both resolve it here. A `true` here puts
    // `jpdb-reader-theme-dark` on the document element, which swaps the
    // highlight backdrop token for the whole page — so a wrong answer paints
    // dark-theme state colours over a light page, exactly the reported symptom.
    // `color-scheme: light dark` means "either canvas is fine, the UA decides":
    // matching the bare `dark` token flipped every such page.
    it('reports light for a light-dark color-scheme page while the UA prefers light', () => {
        document.documentElement.style.colorScheme = 'light dark';
        expect(documentBackgroundLooksDark()).toBe(false);
    });

    it('still reports dark for a page that declares a dark color-scheme outright', () => {
        document.documentElement.style.colorScheme = 'dark';
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
