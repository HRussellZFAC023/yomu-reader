import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { closestRubyFragileConstrainedRow } from '../../src/reader/dom/decoration-policy';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { FragmentTextTarget } from '../../src/reader/dom';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const FURI = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
}

function token(spelling: string, reading: string, sentence: string): JPDBToken {
    const start = sentence.indexOf(spelling);
    return {
        card: card(spelling, reading),
        start, end: start + spelling.length, length: spelling.length,
        rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
        pitchClass: '', sentence,
    };
}

function fragmentTarget(host: HTMLElement, text: string, overrides: Partial<FragmentTextTarget> = {}): FragmentTextTarget {
    return {
        text,
        parent: host,
        fragments: [{ node: host.firstChild as Text, start: 0, end: text.length, hasNativeRuby: false }],
        ...overrides,
    };
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// A detached (suppressRuby) reading is absolutely positioned with
// width:max-content and spills a closed clip box horizontally; the spill
// raises the row's scrollWidth so iOS applies the row's own ellipsis to the
// native base text (共有 → 共… on the m.youtube Shorts action rail). The clip
// row must therefore be stamped for BOTH channels so the rest-hide rule can
// keep unverified clips reading-free.
describe('clip-constrained stamping covers the detached channel', () => {
    it('keeps a reading-free annotated mirror inside its native ellipsis box', () => {
        document.body.innerHTML = '<span id="label" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:80px">ショート</span>';
        const label = document.querySelector<HTMLElement>('#label')!;
        applyTokensToScanTarget(
            fragmentTarget(label, 'ショート', { nonDestructive: true, decoration: 'interactive-passive' }),
            [token('ショート', 'ショート', 'ショート')],
            DEFAULT_SETTINGS,
        );

        const mirror = label.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.dataset.yomuDetachedReadings).toBeUndefined();
        expect(mirror.querySelector('.jpdb-reader-detached-furi')).toBeNull();
        expect(mirror.style.overflow).toBe('hidden');
    });

    it('stamps the ellipsis row for a suppressRuby target', () => {
        document.body.innerHTML = '<div><span id="label" style="display:block;overflow-x:hidden;overflow-y:visible;text-overflow:ellipsis;white-space:nowrap;width:40px">共有</span></div>';
        const label = document.querySelector<HTMLElement>('#label')!;
        applyTokensToScanTarget(
            fragmentTarget(label, '共有', { suppressRuby: true, decoration: 'interactive-passive' }),
            [token('共有', 'きょうゆう', '共有')],
            FURI,
        );
        expect(label.dataset.yomuClipConstrained).toBe('true');
    });

    it('finds a light-DOM clip ancestor from inside an open shadow root', () => {
        document.body.innerHTML = '<div id="clip" style="overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap;width:40px"></div>';
        const clip = document.querySelector<HTMLElement>('#clip')!;
        const host = document.createElement('div');
        clip.append(host);
        const root = host.attachShadow({ mode: 'open' });
        const inner = document.createElement('span');
        inner.textContent = '共有';
        root.append(inner);

        expect(closestRubyFragileConstrainedRow(inner)).toBe(clip);
    });
});
