import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    projectAdditiveTextMirror,
    readerWordSourcePointScore,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

/**
 * A mirror's source ranges are stamped in the coordinate system of its RENDERED
 * text, and both source projection and source hit-testing resolve them against
 * the host's own text. For an ordinary fragment target those are the same
 * string — but a SYNTHETIC target's text never existed in the DOM. YouTube's
 * watch-info line is assembled from the `#view-count`/`#date-text` aria-labels
 * joined with " • " while the host's own nodes read "12,345回視聴", so the guard
 * could never pass and 回視聴 rendered with no furigana and could not be clicked.
 */
const SYNTHETIC = '12,345 回視聴';
const HOST_TEXT = '12,345回視聴';

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null, source: 'jpdb',
    };
}

function token(spelling: string, reading: string, start: number): JPDBToken {
    const end = start + spelling.length;
    return {
        card: card(spelling, reading),
        start,
        end,
        length: spelling.length,
        rubies: [{ text: reading, start, end, length: spelling.length }],
        pitchClass: '',
        sentence: SYNTHETIC,
    };
}

function rect(left: number, top = 50, width = 16, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

// Range geometry for the host's live text, keyed by what the range actually
// selects — the only thing the production code can ask jsdom for.
const RANGE_RECTS: Record<string, DOMRect[]> = {
    '回': [rect(160)],
    '視聴': [rect(176, 50, 32)],
};

const rangeProto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
const hadNativeRangeRects = 'getClientRects' in rangeProto;

function mount(text: string): { host: HTMLElement; mirror: HTMLElement } {
    document.body.innerHTML = '<div id="host"><span>12,345</span><span>回視聴</span></div>';
    const host = document.getElementById('host') as HTMLElement;
    Object.defineProperties(host, {
        getBoundingClientRect: { configurable: true, value: () => rect(100, 50, 120, 20) },
        clientWidth: { configurable: true, value: 120 },
        clientHeight: { configurable: true, value: 20 },
        offsetWidth: { configurable: true, value: 120 },
        offsetHeight: { configurable: true, value: 20 },
    });
    const collected = collectTextTargetsIn(host, 40, false)[0];
    applyTokensToScanTarget(
        // Exactly the shape collectYouTubeSyntheticTextTargets pushes: replacement
        // text with no fragments to remap through.
        { ...collected, parent: host, text, fragments: [], nonDestructive: true, suppressRuby: true },
        [token('回', 'かい', text.indexOf('回')), token('視聴', 'しちょう', text.indexOf('視聴'))],
        { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
    );
    const mirror = host.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror');
    if (!mirror) throw new Error('no additive mirror mounted');
    Object.defineProperties(mirror, {
        getBoundingClientRect: { configurable: true, value: () => rect(100, 50, 120, 20) },
        offsetWidth: { configurable: true, value: 120 },
        offsetHeight: { configurable: true, value: 20 },
    });
    return { host, mirror };
}

function wordFor(mirror: HTMLElement, surface: string): HTMLElement {
    const word = [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-word.jpdb-reader-scan-word')]
        .find(candidate => (candidate.dataset.surface ?? candidate.textContent ?? '').startsWith(surface));
    if (!word) throw new Error(`no mirrored word for ${surface}`);
    return word;
}

beforeEach(() => {
    Object.defineProperty(rangeProto, 'getClientRects', {
        configurable: true,
        value(this: Range) { return RANGE_RECTS[this.toString()] ?? []; },
    });
});

afterEach(() => {
    if (!hadNativeRangeRects) delete rangeProto.getClientRects;
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('synthetic mirror source ranges', () => {
    it('stamps a synthetic mirror in host coordinates', () => {
        const { mirror } = mount(SYNTHETIC);

        expect(mirror.dataset.sourceText).toBe(SYNTHETIC);
        expect(mirror.dataset.yomuHostSourceText).toBe(HOST_TEXT);
        // 視聴 is at 8 in the aria string and at 7 in the host's own text.
        const word = wordFor(mirror, '視聴');
        expect(word.dataset.yomuSourceStart).toBe('7');
        expect(word.dataset.yomuSourceEnd).toBe('9');
    });

    // The clickability half: every additive-mirror word is gated on its stamped
    // range resolving to live host geometry, so a synthetic stamp made the word
    // unhittable by every lookup path at once.
    it('makes a synthetic mirror word hit-testable on its host glyphs', () => {
        const { mirror } = mount(SYNTHETIC);

        const word = wordFor(mirror, '視聴');
        expect(readerWordSourcePointScore(word, 190, 58)).not.toBeNull();
        expect(readerWordSourcePointScore(word, 400, 58)).toBeNull();
    });

    // The furigana half: projection bails wholesale when the guard fails, so a
    // synthetic mirror painted no reading at all.
    it('projects a synthetic mirror word onto its host glyphs', () => {
        const { host, mirror } = mount(SYNTHETIC);

        projectAdditiveTextMirror(mirror, host);

        expect(mirror.dataset.yomuSourceProjected).toBe('true');
        const word = wordFor(mirror, '視聴');
        expect(word.querySelectorAll('.jpdb-reader-source-fragment').length).toBeGreaterThan(0);
        const reading = [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
            .find(clone => clone.textContent === 'しちょう');
        expect(reading).toBeTruthy();
        // Painted on the host's 視聴 glyphs (176..208), not on the aria offsets.
        expect(Number.parseFloat(reading?.style.left ?? 'NaN')).toBeCloseTo(192, 5);
    });

    // The remap must not touch an ordinary target: its render text IS the host
    // text, so the stamps are already host coordinates and nothing may be
    // re-derived (or the common path pays for a search it does not need).
    it('leaves an ordinary fragment target unremapped', () => {
        const { mirror } = mount(HOST_TEXT);

        expect(mirror.dataset.sourceText).toBe(HOST_TEXT);
        expect(mirror.dataset.yomuHostSourceText).toBeUndefined();
        const word = wordFor(mirror, '視聴');
        expect(word.dataset.yomuSourceStart).toBe('7');
    });
});
