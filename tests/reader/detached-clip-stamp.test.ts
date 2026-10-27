import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { closestRubyFragileConstrainedRow } from '../../src/reader/dom/decoration-policy';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { FragmentTextTarget } from '../../src/reader/dom';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import { collectTextTargetsIn, healTextMirrorPageVisibility, resetDecorationPolicyCachesForTest } from "../../src/reader/dom";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS2 } from "../../src/reader/settings";

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

describe('late clip-constrained stamping', () => {
    const TEXT = '共有';
    const CARD: JPDBCard = {
        vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'きょうゆう', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
    function token(): JPDBToken {
        return { card: CARD, start: 0, end: TEXT.length, length: TEXT.length, rubies: [{ text: 'きょうゆう', start: 0, end: TEXT.length, length: TEXT.length }], pitchClass: '', sentence: TEXT };
    }

    afterEach(() => {
        removeNonDestructiveScanMirrors(document);
        document.body.innerHTML = '';
    });

    // Framework chrome (m.youtube hydration) often receives its clipping styles
    // AFTER the mirror rendered: the row classified un-clipped at apply time and
    // the render-signature short-circuit never re-examined it, so a detached
    // reading stayed visible inside a closed ellipsis clip and its horizontal
    // spill ellipsized the native base (共有 → 共…). The scan-settle heal must
    // stamp such late-clipped rows.

    it('stamps a row whose clipping styles arrived after the mirror rendered', () => {
        document.body.innerHTML = `<div id="row" role="toolbar"><a id="host" href="/share">${TEXT}</a></div>`;
        const row = document.getElementById('row')!;
        const host = document.getElementById('host')!;
        const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === TEXT)!;
        applyTokensToScanTarget({ ...target, nonDestructive: true, suppressRuby: true }, [token()], { ...DEFAULT_SETTINGS2, showFurigana: true, furiganaMode: 'all' });

        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(row.dataset.yomuClipConstrained).toBeUndefined();

        // ytm hydration lands the clip styles late. Reset the short-lived
        // style-fact memo explicitly so this unit remains deterministic.
        row.style.cssText = 'overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap;width:40px;display:block';
        resetDecorationPolicyCachesForTest();
        healTextMirrorPageVisibility();

        expect(row.dataset.yomuClipConstrained).toBe('true');
    });

    it('leaves un-clipped rows unstamped on settle', () => {
        document.body.innerHTML = `<div id="row" role="toolbar"><a id="host" href="/share">${TEXT}</a></div>`;
        const row = document.getElementById('row')!;
        const host = document.getElementById('host')!;
        const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === TEXT)!;
        applyTokensToScanTarget({ ...target, nonDestructive: true, suppressRuby: true }, [token()], { ...DEFAULT_SETTINGS2, showFurigana: true, furiganaMode: 'all' });

        healTextMirrorPageVisibility();
        expect(row.dataset.yomuClipConstrained).toBeUndefined();
    });
});
