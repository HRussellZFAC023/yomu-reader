import { afterEach, describe, expect, it } from 'vitest';

import { wordPaintChannels, wordPaintsNothingAtRest } from '../../src/reader/dom/word-paint-facts';
import { refreshReaderWordContrast } from '../../src/reader/dom/word-contrast';

// Contrast is sampled for words that paint something at rest. With the
// default channels (no highlight, no text colour, the status underline) a word
// in no deck and without a reading paints nothing, which is every word of a
// keyless page, so no page backdrop is probed for it (W1-41). A root channel
// change resamples every word (ADR-0026 §4).

const DEFAULT_ROOT = 'jpdb-reader-word-highlight-off jpdb-reader-word-underline-status jpdb-reader-word-text-off';
const backdrop = (id: string): string => document.getElementById(id)!.style.getPropertyValue('--jpdb-reader-highlight-backdrop');

afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.className = '';
});

function word(classes: string): HTMLElement {
    const element = document.createElement('span');
    element.className = `jpdb-reader-word ${classes}`;
    return element;
}

describe('word paint facts', () => {
    it('finds nothing to paint on a word in no deck under the default channels', () => {
        document.documentElement.className = DEFAULT_ROOT;
        const channels = wordPaintChannels();
        expect(channels).toEqual({ declared: true, highlight: null, underline: 'status', text: null });
        expect(wordPaintsNothingAtRest(word('jpdb-not-in-deck jpdb-pitch-unknown jpdb-reader-scan-word'), channels)).toBe(true);
        expect(wordPaintsNothingAtRest(word('jiten-not-in-deck jpdb-reader-particle'), channels)).toBe(true);
    });

    it.each([
        ['a word with a study state', 'jpdb-learning', DEFAULT_ROOT],
        ['a word with a reading', 'jpdb-not-in-deck jpdb-reader-has-furi', DEFAULT_ROOT],
        ['a word under a highlight channel', 'jpdb-not-in-deck', 'jpdb-reader-word-highlight-status jpdb-reader-word-underline-status'],
        ['a word under the pitch underline', 'jpdb-not-in-deck jpdb-pitch-heiban', 'jpdb-reader-word-underline-pitch'],
        ['a word under the review underline', 'jpdb-not-in-deck', 'jpdb-reader-word-underline-review'],
    ])('paints %s', (_case, classes, root) => {
        document.documentElement.className = root;
        expect(wordPaintsNothingAtRest(word(classes), wordPaintChannels())).toBe(false);
    });

    it('samples every word on a root that names no channel', () => {
        expect(wordPaintsNothingAtRest(word('jpdb-not-in-deck'), wordPaintChannels())).toBe(false);
    });

    it('finds nothing to paint on any word without a reading when no channel is on', () => {
        document.documentElement.className = 'jpdb-reader-word-highlight-off jpdb-reader-word-underline-off jpdb-reader-word-text-off';
        expect(wordPaintsNothingAtRest(word('jpdb-learning'), wordPaintChannels())).toBe(true);
    });
});

describe('contrast for quiet words', () => {
    function page(): void {
        document.body.innerHTML = '<p style="background:#ffffff;color:#202122">'
            + '<span id="quiet" class="jpdb-reader-word jpdb-not-in-deck">日本</span>'
            + '<span id="learning" class="jpdb-reader-word jpdb-learning">本</span></p>';
    }

    it('samples only words that paint, and every word once a channel turns on', () => {
        document.documentElement.className = DEFAULT_ROOT;
        page();
        refreshReaderWordContrast(document);
        expect(backdrop('quiet')).toBe('');
        expect(backdrop('learning')).not.toBe('');

        document.documentElement.className = 'jpdb-reader-word-highlight-status jpdb-reader-word-underline-status jpdb-reader-word-text-off';
        refreshReaderWordContrast(document);
        expect(backdrop('quiet')).not.toBe('');
    });

    it('clears colours a word derived while it painted once it paints nothing', () => {
        document.documentElement.className = 'jpdb-reader-word-highlight-status jpdb-reader-word-underline-status';
        page();
        refreshReaderWordContrast(document);
        expect(backdrop('quiet')).not.toBe('');

        document.documentElement.className = DEFAULT_ROOT;
        refreshReaderWordContrast(document);
        expect(backdrop('quiet')).toBe('');
    });
});
