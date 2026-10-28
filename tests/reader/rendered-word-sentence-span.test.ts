import { afterEach, describe, expect, it } from 'vitest';

import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { applyTokensToScanTarget, collectFragmentTextTargetsIn, renderTokensToHtml, setInnerHtml } from '../../src/reader/dom/index';
import { readerWordSurfaceText } from '../../src/reader/dom/reader-word';
import { assignSentenceInfo } from '../../src/reader/jpdb/jpdb-parser-sentences';
import { pointerTextLookupFromRenderedWord, pointerTextLookupFromRenderedWordStart } from '../../src/reader/lookup/pointer-text-lookup';
import { unconfirmedRenderedWordSpan } from '../../src/reader/main/rendered-word-lookup';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

// A painted word records its token range from the start of the text the parser
// read (a whole paragraph), while data-sentence holds only its own sentence.
// The two agree in a paragraph's first sentence and nowhere after it, which is
// how hovering 練習 in the lookup-perf-gate page never opened a popup while
// 図書館 and 漢字 in the sentence before it did. Paint records where the
// sentence starts (data-sentence-start) so a Lookup subtracts it exactly.
describe('rendered word position inside its own sentence', () => {
    afterEach(() => document.body.replaceChildren());

    const GATE_PARAGRAPH = '図書館で漢字を調べています。練習をします。図書館は静かです。';
    const GATE_WORDS = ['図書館', '漢字', '調べています', '練習', 'します', '図書館', '静か'];

    it.each([
        ['the HTML paint', paintParagraph],
        ['the page scan paint', scanParagraph],
    ])('starts a pointer lookup on every word of a multi-sentence paragraph through %s', (_path, paint) => {
        const words = paint(GATE_PARAGRAPH, GATE_WORDS);

        expect(words.map(word => word.dataset.tokenStart)).toEqual(['0', '4', '7', '14', '17', '21', '25']);
        expect(words.map(word => word.dataset.sentenceStart)).toEqual([undefined, undefined, undefined, '14', '14', '21', '21']);
        for (const word of words) {
            const surface = readerWordSurfaceText(word);
            const lookup = pointerTextLookupFromRenderedWordStart(word);
            expect(lookup, surface).not.toBeNull();
            expect(lookup!.text).toBe(word.dataset.sentence);
            expect(lookup!.text.slice(lookup!.offset, lookup!.offset + surface.length)).toBe(surface);
        }
    });

    // The page scan paints a word inside <b> into the <b>, alone. Its surface
    // 本 also opens the sentence inside 本屋, so any lookup that searched for
    // the surface opened 本屋 on a click, tap or hover of the bold 本.
    it('places a word alone in an inline element at its own offset, not at an earlier match of its surface', () => {
        document.body.innerHTML = '<p>はい。本屋と<b>本</b>を読む。</p>';
        const words = scanTarget(['はい', '本屋', 'と', '本', 'を', '読む']);
        const book = words.find(word => word.parentElement?.tagName === 'B')!;
        book.getBoundingClientRect = () => new DOMRect(0, 0, 16, 16);

        expect(readerWordSurfaceText(book)).toBe('本');
        // Tap or keyboard activation without a point, then a click or hover at the glyph.
        expect(pointerTextLookupFromRenderedWordStart(book)).toMatchObject({ text: '本屋と本を読む。', offset: 3 });
        expect(pointerTextLookupFromRenderedWord(book, 8, 8)).toMatchObject({ text: '本屋と本を読む。', offset: 3 });
        expect(unconfirmedRenderedWordSpan(book, undefined)).toEqual({ sentence: '本屋と本を読む。', start: 3, end: 4 });
        expect(book.dataset).toMatchObject({ tokenStart: '6', sentence: '本屋と本を読む。', sentenceStart: '3' });
    });

    it('re-resolves an unconfirmed word at its own position, not at its paragraph offset', () => {
        // Painted at paragraph offset 7, which inside its sentence is 調べ.
        const kanji = paintParagraph('はい。図書館で漢字を調べています。', ['図書館', '漢字', '調べています'])[1];

        const span = unconfirmedRenderedWordSpan(kanji, undefined);

        expect(span).toEqual({ sentence: '図書館で漢字を調べています。', start: 4, end: 6 });
    });

    it('keeps each occurrence of a repeated surface at its own place in the sentence', () => {
        const [, first, , second] = paintParagraph('本だ。本と本を読む。', ['本', '本', 'と', '本', '読む']);

        expect(unconfirmedRenderedWordSpan(first, undefined)).toMatchObject({ start: 0, end: 1 });
        expect(unconfirmedRenderedWordSpan(second, undefined)).toMatchObject({ start: 2, end: 3 });
    });

    it('declines a word whose sentence no longer holds it at its recorded place', () => {
        const [, practice] = paintParagraph('はい。練習をします。', ['はい', '練習']);
        practice.dataset.sentence = '図書館で練習をします。';

        expect(pointerTextLookupFromRenderedWordStart(practice)).toBeNull();
        expect(unconfirmedRenderedWordSpan(practice, undefined)).toBeNull();
    });
});

/** Paints `surfaces` in order through the production HTML path, with the
 * parser's own sentence assignment, and returns the painted words. */
function paintParagraph(paragraph: string, surfaces: string[]): HTMLElement[] {
    const tokens = paragraphTokens(paragraph, surfaces);
    const host = document.createElement('p');
    setInnerHtml(host, renderTokensToHtml(paragraph, tokens, DEFAULT_SETTINGS));
    document.body.replaceChildren(host);
    return [...host.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
}

/** Paints `surfaces` through the page scan, as the reader paints a page. */
function scanParagraph(paragraph: string, surfaces: string[]): HTMLElement[] {
    const host = document.createElement('p');
    host.textContent = paragraph;
    document.body.replaceChildren(host);
    return scanTarget(surfaces);
}

function scanTarget(surfaces: string[]): HTMLElement[] {
    const [target] = collectFragmentTextTargetsIn(document.body, 10, false, '', { allowUiText: true, minLength: 1 });
    applyTokensToScanTarget(target, paragraphTokens(target.text, surfaces), DEFAULT_SETTINGS);
    return [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
}

function paragraphTokens(paragraph: string, surfaces: string[]): JPDBToken[] {
    let cursor = 0;
    const tokens = surfaces.map((surface, index): JPDBToken => {
        const start = paragraph.indexOf(surface, cursor);
        cursor = start + surface.length;
        return { card: fallbackCard(surface, index), start, end: cursor, length: surface.length, rubies: [], pitchClass: 'unknown' };
    });
    assignSentenceInfo([paragraph], [tokens]);
    return tokens;
}

function fallbackCard(spelling: string, index: number): JPDBCard {
    return {
        vid: -(index + 1),
        sid: -(index + 1),
        rid: 0,
        source: 'fallback',
        spelling,
        reading: '',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
    };
}
