import { readFileSync } from 'node:fs';

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
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT)!;
    expect(target).toBeTruthy();
    applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8').replace(/\r\n/g, '\n');

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// The hidden text mirror is a full duplicate of the host text. If it stays
// selectable, Cmd+A / copy grabs BOTH the visible host text AND the mirror's
// duplicate (doubled/garbled clipboard) and the furigana rt readings come along
// too. The mirror must be excluded from selection AND the a11y tree so the only
// selectable copy is the clean original host text.
describe('text mirror copy/paste isolation', () => {
    it('marks the created mirror aria-hidden so screen readers and copy skip the duplicate', () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paint(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.getAttribute('aria-hidden')).toBe('true');
    });

    it('gives the mirror user-select:none (both standard and -webkit) in CSS', () => {
        const mirrorRule = css.match(/(^|\n)\.jpdb-reader-text-mirror\s*\{[^}]*\}/)?.[0] ?? '';
        expect(mirrorRule).toContain('user-select: none');
        expect(mirrorRule).toContain('-webkit-user-select: none');
    });

    it('gives the mirror furigana rt user-select:none so ruby readings never copy', () => {
        // The shared .jpdb-reader-furi rule already carries user-select:none; pin
        // that both the standard and the -webkit property are present so WebKit
        // (iOS Safari) also excludes rt readings from the selection.
        const furiRule = css.match(/(^|\n)\.jpdb-reader-furi\s*\{[^}]*\}/)?.[0] ?? '';
        expect(furiRule).toContain('user-select: none');
        expect(furiRule).toContain('-webkit-user-select: none');
    });
});
