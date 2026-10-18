// What a page word can paint at rest, read from the root's colour channel
// classes (ADR-0026 §2): highlight, underline and text colour each name one
// source or none. A word in no deck carries nothing on the JPDB and Status
// underlines, so with the highlight and text channels off (the default) a
// not-in-deck word without a reading paints nothing a contrast pass could
// derive a colour for. Contrast skips such words instead of sampling the page
// behind each one; a root class change resamples every word
// (page-annotation-contrast-observer.ts), so turning a channel on reaches them.
import { selectedWordColorSourceToken } from '../theme/color-source-classes';

const PAINTING_SOURCES = ['status', 'jpdb', 'anki', 'pitch'] as const;
const NOT_IN_DECK_CLASSES = ['jpdb-not-in-deck', 'jiten-not-in-deck'];
// Study-state classes come from these families; pitch classes only paint
// through the pitch source, and jpdb-reader-* classes are the reader's own.
const STATE_CLASS_RE = /^(?:jpdb|jiten|anki|yomu-review)-/u;
const NON_STATE_CLASS_RE = /^(?:jpdb-reader-|jpdb-pitch-)/u;
const QUIET_UNDERLINE_SOURCES = new Set(['status', 'jpdb']);
const READING_WORD_SELECTOR = '.jpdb-reader-has-furi, .jpdb-reader-detached-reading-word';

const CHANNEL_CLASS_RE = /^jpdb-reader-word-(?:highlight|underline|text)-/u;

export interface WordPaintChannels {
    // False when the root names no channel at all (a document the Reader has
    // not styled): nothing is known, so every word is sampled.
    declared: boolean;
    highlight: string | null;
    underline: string | null;
    text: string | null;
}

export function wordPaintChannels(root: Element | null = document.documentElement): WordPaintChannels {
    const source = (channel: string): string | null => (root ? selectedWordColorSourceToken(root, [channel], PAINTING_SOURCES) : null);
    const declared = Boolean(root && [...root.classList].some(className => CHANNEL_CLASS_RE.test(className)));
    return { declared, highlight: source('highlight'), underline: source('underline'), text: source('text') };
}

export function wordPaintsNothingAtRest(word: Element, channels: WordPaintChannels): boolean {
    if (!channels.declared || channels.highlight || channels.text) return false;
    if (word.matches(READING_WORD_SELECTOR)) return false;
    if (!channels.underline) return true;
    if (!QUIET_UNDERLINE_SOURCES.has(channels.underline)) return false;
    let notInDeck = false;
    for (const className of word.classList) {
        if (NOT_IN_DECK_CLASSES.includes(className)) notInDeck = true;
        else if (STATE_CLASS_RE.test(className) && !NON_STATE_CLASS_RE.test(className)) return false;
    }
    return notInDeck;
}
