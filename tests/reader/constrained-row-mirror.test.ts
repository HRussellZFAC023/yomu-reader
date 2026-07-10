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

    it('renders a bare clipped row IN PLACE, paint-invariant at rest (no mirror, no visible reading)', () => {
        // Paint-invariant design (third live gate): clip-constrained rows are
        // never mirror-rerouted — hiding the host and anchoring the mirror to
        // a clamped box collapsed live feed titles to 0px. The row renders in
        // place with the reading suppressed; host text keeps painting.
        document.body.innerHTML = `<div id="host" style="${CLIP_STYLE}">${TEXT}</div>`;
        const host = document.getElementById('host')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('rt')).toBeNull();
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
        // Engine-unconditional: no probe verdict re-enables in-flow ruby in a
        // clipped row; the row renders in place, suppressed, host painted.
        setRubyDistortsConstrainedRowsForTest(false);
        document.body.innerHTML = `<div id="host" style="${CLIP_STYLE}">${TEXT}</div>`;
        const host = document.getElementById('host')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(host.querySelector('rt')).toBeNull();
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
    });
});
