import { describe, expect, it } from 'vitest';

import { renderTokensToHtml } from '../../src/reader/dom/index';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard, JPDBToken } from '../../src/reader/app/types';

const WORD_JOINER = '\u2060';

// Renders `text` where the substring [start,end) is a single token and the rest is
// untokenized gap text, mirroring how Google "key moments" labels reach the reader
// (e.g. "この動画の7件…" arrives with 7 as a bare digit between word spans).
function renderWithToken(text: string, start: number, end: number): string {
    return renderTokensToHtml(text, [counterToken(text.slice(start, end), start, end)], DEFAULT_SETTINGS);
}

describe('number/counter line breaking', () => {
    it('welds a trailing number to the following counter token with a WORD JOINER', () => {
        const html = renderWithToken('7件', 1, 2);
        // The digit keeps its joiner so "7件" cannot wrap between the number and 件.
        expect(html).toContain(`7${WORD_JOINER}<span`);
        expect(html).not.toContain('>7<'); // the bare 7 is never emitted joiner-free before a span
    });

    it('welds a multi-digit and full-width number to its counter', () => {
        expect(renderWithToken('100人', 3, 4)).toContain(`100${WORD_JOINER}<span`);
        expect(renderWithToken('３つ', 1, 2)).toContain(`３${WORD_JOINER}<span`);
    });

    it('leaves non-numeric gap text untouched', () => {
        const html = renderWithToken('の件', 1, 2);
        expect(html).not.toContain(WORD_JOINER);
    });

    it('does not weld a trailing number when no token follows it', () => {
        // "件7": 件 is the token, the digit is trailing gap text with nothing after it.
        const html = renderWithToken('件7', 0, 1);
        expect(html).not.toContain(WORD_JOINER);
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
