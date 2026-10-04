import { describe, expect, it } from 'vitest';

import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { renderTokensToHtml, setInnerHtml } from '../../src/reader/dom/index';
import { readerWordSurfaceText } from '../../src/reader/dom/reader-word';
import { assignSentenceInfo } from '../../src/reader/jpdb/jpdb-parser-sentences';
import { pointerTextLookupFromRenderedWordStart } from '../../src/reader/lookup/pointer-text-lookup';
import { unconfirmedRenderedWordSpan } from '../../src/reader/main/rendered-word-lookup';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';

// A painted word records its token range from the start of the text the parser
// read (a whole paragraph), while data-sentence holds only its own sentence.
// The two agree in a paragraph's first sentence and nowhere after it, which is
// how hovering 練習 in the lookup-perf-gate page never opened a popup while
// 図書館 and 漢字 in the sentence before it did.
describe('rendered word position inside its own sentence', () => {
    const GATE_PARAGRAPH = '図書館で漢字を調べています。練習をします。図書館は静かです。';
    const GATE_WORDS = ['図書館', '漢字', '調べています', '練習', 'します', '図書館', '静か'];

    it('starts a pointer lookup on every word of a multi-sentence paragraph, not only the first sentence', () => {
        const words = paintParagraph(GATE_PARAGRAPH, GATE_WORDS);

        expect(words.map(word => word.dataset.tokenStart)).toEqual(['0', '4', '7', '14', '17', '21', '25']);
        for (const word of words) {
            const surface = readerWordSurfaceText(word);
            const lookup = pointerTextLookupFromRenderedWordStart(word);
            expect(lookup, surface).not.toBeNull();
            expect(lookup!.text).toBe(word.dataset.sentence);
            expect(lookup!.text.slice(lookup!.offset, lookup!.offset + surface.length)).toBe(surface);
        }
    });

    it('re-resolves an unconfirmed word at its own position, not at its paragraph offset', () => {
        // Painted at paragraph offset 7, which inside its sentence is 調べ.
        const kanji = paintParagraph('はい。図書館で漢字を調べています。', ['図書館', '漢字', '調べています'])[1];

        const span = unconfirmedRenderedWordSpan(kanji, undefined, {});

        expect(span).toEqual({ sentence: '図書館で漢字を調べています。', start: 4, end: 6 });
    });

    it('keeps each occurrence of a repeated surface at its own place in the sentence', () => {
        const [, first, , second] = paintParagraph('本だ。本と本を読む。', ['本', '本', 'と', '本', '読む']);

        expect(unconfirmedRenderedWordSpan(first, undefined, {})).toMatchObject({ start: 0, end: 1 });
        expect(unconfirmedRenderedWordSpan(second, undefined, {})).toMatchObject({ start: 2, end: 3 });
    });

    it('still declines a word whose surface is not in the sentence it is given', () => {
        const [word] = paintParagraph('練習をします。', ['練習']);

        expect(unconfirmedRenderedWordSpan(word, undefined, { sentence: '図書館は静かです。' })).toBeNull();
    });
});

/** Paints `surfaces` in order through the production HTML path, with the
 * parser's own sentence assignment, and returns the painted words. */
function paintParagraph(paragraph: string, surfaces: string[]): HTMLElement[] {
    let cursor = 0;
    const tokens = surfaces.map((surface, index): JPDBToken => {
        const start = paragraph.indexOf(surface, cursor);
        cursor = start + surface.length;
        return { card: fallbackCard(surface, index), start, end: cursor, length: surface.length, rubies: [], pitchClass: 'unknown' };
    });
    assignSentenceInfo([paragraph], [tokens]);
    const host = document.createElement('p');
    setInnerHtml(host, renderTokensToHtml(paragraph, tokens, DEFAULT_SETTINGS));
    document.body.replaceChildren(host);
    return [...host.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
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
