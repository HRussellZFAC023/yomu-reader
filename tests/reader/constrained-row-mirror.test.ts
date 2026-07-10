import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    removeNonDestructiveScanMirrors,
    setRubyDistortsConstrainedRowsForTest,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const TEXT = '日本語';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};
function token(): JPDBToken {
    return { card: CARD, start: 0, end: TEXT.length, length: TEXT.length, rubies: [{ text: 'にほんご', start: 0, end: TEXT.length, length: TEXT.length }], pitchClass: '', sentence: TEXT };
}
// A single-line clipped row (ellipsis) — the constrained-row shape the engine
// probe guards. jsdom computes inline styles, so the ellipsis predicate works
// without real layout.
const CLIP_STYLE = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

function paint(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
    expect(target).toBeTruthy();
    applyTokensToScanTarget(target!, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

describe('constrained-row mirror routing (forced distorting engine)', () => {
    beforeEach(() => setRubyDistortsConstrainedRowsForTest(true));
    afterEach(() => {
        setRubyDistortsConstrainedRowsForTest(null);
        removeNonDestructiveScanMirrors(document);
        document.body.innerHTML = '';
    });

    it('gives a visually bare clipped row its reading via the text mirror', () => {
        document.body.innerHTML = `<div id="host" style="${CLIP_STYLE}">${TEXT}</div>`;
        const host = document.getElementById('host')!;
        paint(host);
        const mirror = host.querySelector('.jpdb-reader-text-mirror');
        expect(mirror).toBeTruthy();
        expect(mirror?.querySelector('rt')?.textContent).toBe('にほんご');
        expect(host.style.getPropertyValue('visibility')).toBe('hidden');
    });

    it('keeps a styled clipped row (own background) rendering in place with the reading suppressed', () => {
        document.body.innerHTML = `<div id="host" style="${CLIP_STYLE} background-color: rgb(31, 41, 55);">${TEXT}</div>`;
        const host = document.getElementById('host')!;
        paint(host);
        // Never hide a host that paints its own box — that erases the pill/bar.
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        const word = host.querySelector('.jpdb-reader-word');
        expect(word).toBeTruthy();
        expect(word?.querySelector('rt')).toBeNull();
    });

    it('keeps a clipped row with a non-text child (chevron SVG) rendering in place', () => {
        document.body.innerHTML = `<div id="host" style="${CLIP_STYLE}">${TEXT}<svg aria-hidden="true"></svg></div>`;
        const host = document.getElementById('host')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(host.querySelector('svg')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
    });

    it('protects clipped rows on every engine (class Q): the probe verdict is irrelevant', () => {
        // rt paints into the half-leading on healthy engines too, so a bare
        // clipped row gets its reading via the out-of-flow mirror regardless
        // of the old rubyDistortsConstrainedRows() verdict.
        setRubyDistortsConstrainedRowsForTest(false);
        document.body.innerHTML = `<div id="host" style="${CLIP_STYLE}">${TEXT}</div>`;
        const host = document.getElementById('host')!;
        paint(host);
        const mirror = host.querySelector('.jpdb-reader-text-mirror');
        expect(mirror).toBeTruthy();
        expect(mirror?.querySelector('rt')?.textContent).toBe('にほんご');
    });
});
