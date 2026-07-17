import { afterEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    healTextMirrorPageVisibility,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

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
describe('late clip-constrained stamping', () => {
    it('stamps a row whose clipping styles arrived after the mirror rendered', async () => {
        document.body.innerHTML = `<div id="row"><button id="host">${TEXT}</button></div>`;
        const row = document.getElementById('row')!;
        const host = document.getElementById('host')!;
        const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === TEXT)!;
        applyTokensToScanTarget({ ...target, nonDestructive: true, suppressRuby: true }, [token()], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(row.dataset.yomuClipConstrained).toBeUndefined();

        // ytm hydration lands the clip styles late; the constrained-row fact
        // memo (250ms TTL) must have expired by the time settle re-examines.
        row.style.cssText = 'overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap;width:40px;display:block';
        await new Promise(resolve => setTimeout(resolve, 300));
        healTextMirrorPageVisibility();

        expect(row.dataset.yomuClipConstrained).toBe('true');
    });

    it('leaves un-clipped rows unstamped on settle', () => {
        document.body.innerHTML = `<div id="row"><button id="host">${TEXT}</button></div>`;
        const row = document.getElementById('row')!;
        const host = document.getElementById('host')!;
        const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === TEXT)!;
        applyTokensToScanTarget({ ...target, nonDestructive: true, suppressRuby: true }, [token()], { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' });

        healTextMirrorPageVisibility();
        expect(row.dataset.yomuClipConstrained).toBeUndefined();
    });
});
