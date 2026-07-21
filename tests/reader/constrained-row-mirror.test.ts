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

function mockCompactBox(element: HTMLElement, width = 80, height = 20): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect,
    });
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
    Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: width });
    Object.defineProperty(element, 'scrollHeight', { configurable: true, value: height });
}

function withSingleLineRange(callback: () => void): void {
    // detachedBaseContentFits counts real line boxes via Range.getClientRects,
    // which jsdom does not implement; stub one line so clip ownership—not the
    // test environment's missing layout—is the deciding fact.
    const restoreGetClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [{ left: 0, right: 80, top: 0, bottom: 20, width: 80, height: 20 }],
    });
    try {
        callback();
    } finally {
        if (restoreGetClientRects) Object.defineProperty(Range.prototype, 'getClientRects', restoreGetClientRects);
        else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    }
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

// Regression guard for commit 485d627d6, which dropped openSafeDetachedReadingClips
// from the non-destructive mirror path: the destructive and fragment paths open a
// safe compact clip synchronously at render, but the mirror path left it closed
// until a later scan-settle heal ran. Real paint visibility is covered by the
// Chromium/WebKit chip smoke; this jsdom test pins mount ordering and keeps
// explicitly enabled furigana visible without changing control geometry.
describe('non-destructive mirror opens safe clips synchronously at render', () => {
    afterEach(() => {
        removeNonDestructiveScanMirrors(document);
        document.body.innerHTML = '';
    });

    it('opens a compact disclosure trigger as soon as the mirror mounts (parity with destructive/fragment)', () => {
        // aria-expanded belongs to the trigger, not the content panel. A broad
        // expandable-content guard used to close this safe lane as soon as the
        // trigger opened its menu, without a measured safety rejection. The
        // generic div/class shape catches framework controls without a role.
        document.body.innerHTML = `<div><div id="host" class="expand-toggle" aria-expanded="true" style="display:block;overflow:hidden;height:20px;width:80px">${TEXT}</div></div>`;
        const host = document.getElementById('host')!;
        mockCompactBox(host);
        withSingleLineRange(() => {
            const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === TEXT)!;
            applyTokensToScanTarget(
                { ...target, nonDestructive: true },
                [token()],
                { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
            );

            expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
            expect(host.dataset.yomuDetachedReadingOverflow).toBe('true');
            const reading = host.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
            expect(reading?.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(reading?.style.getPropertyValue('display')).toBe('block');
        });
    });

    it('preserves authored clipping on a real expandable content panel', () => {
        document.body.innerHTML = `<details id="panel" open style="display:block;overflow:hidden;height:20px;width:80px"><span id="host">${TEXT}</span></details>`;
        const panel = document.getElementById('panel')!;
        const host = document.getElementById('host')!;
        mockCompactBox(panel);
        withSingleLineRange(() => {
            const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === TEXT)!;
            applyTokensToScanTarget(
                { ...target, nonDestructive: true },
                [token()],
                { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
            );

            expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
            expect(panel.style.getPropertyValue('overflow')).toBe('hidden');
            expect(panel.dataset.yomuDetachedReadingOverflow).toBeUndefined();
        });
    });
});
