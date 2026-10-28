import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    readerWordAtSourcePointInScope,
    readerWordSourcePointScore,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

// Measured on real youtube.com (signed out, hl=ja, Chromium 126, 1280x900):
// ytd-watch-info-text renders "4億回視聴" as one <span>, the reader mirrors it
// non-destructively, and the parser produces 億[1,2) 回[2,3) 視聴[3,5). The
// leading digits belong to NO token, so a click on them resolved nothing and
// fell through to YouTube — which expands the description and rewrites the
// abbreviated count as the exact one ("401,370,881回視聴"), moving the line out
// from under the pointer. Reproduced verbatim: one click at the "4" left the
// popover closed and switched the line's text.
const LINE = '4億回視聴';
const CHAR = 10;

const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: '', reading: '', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};

function markReactOwned(element: Element): void {
    (element as unknown as Record<string, unknown>).__reactFiber$abc123 = {};
    (element as unknown as Record<string, unknown>).__reactProps$abc123 = {};
}

function makeToken(surface: string, start: number, end: number): JPDBToken {
    return {
        card: { ...CARD, spelling: surface, reading: surface },
        start, end, length: end - start, rubies: [], pitchClass: '', sentence: LINE,
    };
}

// Every character is CHAR wide on one 20px line, so a Range's client rect is a
// direct function of its offsets — the same shape the browser reports for the
// real single-line metadata run.
function withMonospaceRangeRects<T>(run: () => T): T {
    const restore = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value(this: Range) {
            const left = this.startOffset * CHAR;
            const right = this.endOffset * CHAR;
            if (right <= left) return [];
            return [{ left, right, top: 0, bottom: 20, width: right - left, height: 20 }];
        },
    });
    try {
        return run();
    } finally {
        if (restore) Object.defineProperty(Range.prototype, 'getClientRects', restore);
        else Reflect.deleteProperty(Range.prototype, 'getClientRects');
        vi.restoreAllMocks();
    }
}

function paintMetadataLine(): HTMLElement {
    document.body.innerHTML = '<div data-message-author-role="assistant"><div id="host" class="markdown">'
        + `${LINE}</div></div>`;
    const host = document.getElementById('host')!;
    markReactOwned(host);
    const target = collectFragmentTextTargetsIn(host, 40, false).find(item => item.text === LINE);
    expect(target).toBeTruthy();
    applyTokensToScanTarget(target!, [makeToken('億', 1, 2), makeToken('回', 2, 3), makeToken('視聴', 3, 5)], DEFAULT_SETTINGS);
    expect(host.querySelectorAll('.jpdb-reader-word[data-yomu-source-start]').length).toBe(3);
    return host;
}

afterEach(() => { removeNonDestructiveScanMirrors(document); document.body.innerHTML = ''; });

describe('mirrored run gaps keep the click', () => {
    it('resolves a click on the untokenised digits of "4億回視聴" to the nearest word in the run', () => {
        withMonospaceRangeRects(() => {
            const host = paintMetadataLine();
            // x=5 is the middle of the "4": inside the mirrored run (0..50) but
            // covered by no token. It must not fall through to the page.
            expect(readerWordAtSourcePointInScope(host, 5, 10)?.dataset.expression).toBe('億');
        });
    });

    it('still prefers the word the point actually lands on', () => {
        withMonospaceRangeRects(() => {
            const host = paintMetadataLine();
            expect(readerWordAtSourcePointInScope(host, 25, 10)?.dataset.expression).toBe('回');
            expect(readerWordAtSourcePointInScope(host, 45, 10)?.dataset.expression).toBe('視聴');
        });
    });

    it('leaves points outside the mirrored run to the page', () => {
        withMonospaceRangeRects(() => {
            const host = paintMetadataLine();
            // Past the last glyph of the run, and above/below the line: the
            // gaps BETWEEN runs, page links and buttons keep their native click.
            expect(readerWordAtSourcePointInScope(host, 120, 10)).toBeNull();
            expect(readerWordAtSourcePointInScope(host, 25, 90)).toBeNull();
        });
    });

    it('keeps the per-word score strictly inside the word so hover cannot drift', () => {
        withMonospaceRangeRects(() => {
            const host = paintMetadataLine();
            const word = Array.from(host.querySelectorAll<HTMLElement>('.jpdb-reader-word'))
                .find(candidate => candidate.dataset.expression === '視聴')!;
            expect(readerWordSourcePointScore(word, 45, 10)).not.toBeNull();
            expect(readerWordSourcePointScore(word, 5, 10)).toBeNull();
        });
    });
});
