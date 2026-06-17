import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
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
function paint(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
    expect(target).toBeTruthy();
    applyTokensToScanTarget(target!, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

afterEach(() => { document.body.innerHTML = ''; });

// A reconciling SPA (e.g. the mokuro.moe catalog) strips our annotation, we
// re-paint, it strips again — the text flips between plain and annotated. After
// a few rapid reverts the reader must switch that host to the non-destructive
// mirror (which never mutates the app's node) to break the loop.
describe('repaint-loop mirror fallback', () => {
    it('switches a host that keeps reverting our annotation to the text mirror', () => {
        document.body.innerHTML = `<div id="host">${TEXT}</div>`;
        const host = document.getElementById('host')!;
        let mirroredAt = -1;
        for (let i = 0; i < 6; i++) {
            host.textContent = TEXT; // SPA reverts our paint back to plain source
            paint(host);
            if (host.querySelector('.jpdb-reader-text-mirror')) { mirroredAt = i; break; }
        }
        expect(mirroredAt).toBeGreaterThanOrEqual(0);
        expect(mirroredAt).toBeLessThanOrEqual(4);
    });

    it('annotates a normal host destructively (no mirror without a loop)', () => {
        document.body.innerHTML = `<div id="solo">${TEXT}</div>`;
        const host = document.getElementById('solo')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
    });

    it('stretches text mirrors across inline attributed-string hosts without width collapse', () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost" style="display:inline">${TEXT}</span>`;
        const host = document.getElementById('title')!;

        for (let i = 0; i < 6 && !host.querySelector('.jpdb-reader-text-mirror'); i++) {
            host.textContent = TEXT;
            paint(host);
        }

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(host.style.getPropertyValue('display')).toBe('inline-block');
        expect(host.style.getPropertyPriority('display')).toBe('important');
        expect(mirror.style.inset).toBe('0 0 auto 0');
        expect(mirror.style.width).toBe('');
        expect(mirror.style.minWidth).toBe('');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(host.style.display).toBe('inline');
        expect(host.style.visibility).toBe('');
        expect(host.style.position).toBe('');
    });
});
