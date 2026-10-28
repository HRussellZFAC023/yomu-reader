import { describe, expect, it } from 'vitest';

import { renderTokensToHtml, unwrapReaderWords } from '../../src/reader/dom/index';
import { ReaderApp } from '../../src/reader/app/main';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard, JPDBToken } from '../../src/reader/app/types';

// Renders `text` where the substring [start,end) is a single token and the rest is
// untokenized gap text, mirroring how Google "key moments" labels reach the reader
// (e.g. "この動画の7件…" arrives with 7 as a bare digit before a word span).
function renderWithToken(text: string, start: number, end: number): string {
    return renderTokensToHtml(text, [counterToken(text.slice(start, end), start, end)], DEFAULT_SETTINGS);
}

describe('number/counter line breaking', () => {
    it('wraps a trailing number before its counter token in a bind element', () => {
        const html = renderWithToken('7件', 1, 2);
        // The digit sits in .jpdb-reader-number-bind, whose ::after WORD JOINER keeps
        // "7件" from wrapping between the number and 件.
        expect(html).toContain('<span class="jpdb-reader-number-bind">7</span>');
        // …immediately followed by the counter word, with no bare digit in between.
        expect(html).toMatch(/<span class="jpdb-reader-number-bind">7<\/span><span class="jpdb-reader-word/);
    });

    it('binds multi-digit and full-width numbers to their counter', () => {
        expect(renderWithToken('100人', 3, 4)).toContain('<span class="jpdb-reader-number-bind">100</span>');
        expect(renderWithToken('３つ', 1, 2)).toContain('<span class="jpdb-reader-number-bind">３</span>');
    });

    it('keeps the rendered text content free of join markers', () => {
        // The joiner lives in CSS generated content, never in the DOM text, so copy,
        // mining, and re-scan comparisons still see the clean source.
        document.body.innerHTML = renderWithToken('7件', 1, 2);
        expect(document.body.textContent).toContain('7件');
        expect(document.body.textContent).not.toContain('\u2060');
    });

    it('leaves non-numeric gap text untouched', () => {
        expect(renderWithToken('の件', 1, 2)).not.toContain('jpdb-reader-number-bind');
    });

    it('does not bind a trailing number when no token follows it', () => {
        // "件7": 件 is the token, the digit is trailing gap text with nothing after it.
        expect(renderWithToken('件7', 0, 1)).not.toContain('jpdb-reader-number-bind');
    });

    it('restores the native number-counter text run when annotations are cleared', () => {
        document.body.innerHTML = renderWithToken('7件', 1, 2);
        expect(document.body.querySelector('.jpdb-reader-number-bind')).toBeTruthy();

        expect(unwrapReaderWords(document)).toBe(1);

        expect(document.body.textContent).toBe('7件');
        expect(document.body.childNodes).toHaveLength(1);
        expect(document.body.querySelector('.jpdb-reader-number-bind')).toBeNull();
    });

    it('removes number binders on the immediate annotations-off path', () => {
        const app = new ReaderApp() as unknown as {
            clearAllAnnotations: () => void;
            destroy: () => void;
        };
        document.body.innerHTML = renderWithToken('7件', 1, 2);

        try {
            expect(document.body.querySelector('.jpdb-reader-number-bind')).toBeTruthy();

            app.clearAllAnnotations();

            expect(document.body.textContent).toBe('7件');
            expect(document.body.childNodes).toHaveLength(1);
            expect(document.body.querySelector('.jpdb-reader-number-bind')).toBeNull();
            expect(document.body.querySelector('.jpdb-reader-word')).toBeNull();
        } finally {
            app.destroy();
        }
    });
});

function counterToken(surface: string, start: number, end: number): JPDBToken {
    return {
        card: counterCard(),
        start,
        end,
        length: surface.length,
        rubies: [],
        pitchClass: 'heiban',
        sentence: surface,
    };
}

function counterCard(): JPDBCard {
    return {
        vid: 1,
        sid: 0,
        rid: 0,
        spelling: '件',
        reading: 'けん',
        frequencyRank: 500,
        partOfSpeech: ['ctr'],
        meanings: [{ glosses: ['counter for matters'], partOfSpeech: ['ctr'] }],
        cardState: ['not-in-deck'] as CardState[],
        pitchAccent: ['H'],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        jitenWordId: undefined,
        jitenReadingIndex: undefined,
    };
}
