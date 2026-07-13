import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    removeNonDestructiveScanMirrors,
    textMirrorAlreadyRenders,
    withMirrorTokenApply,
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
function paintMirror(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
    expect(target).toBeTruthy();
    applyTokensToScanTarget({ ...target!, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}
function flushMicrotasks(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
    vi.unstubAllGlobals();
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// An SPA page swap (YouTube home -> watch -> home) hides the old page's
// subtree while re-rendering its cards. A host attribute mutation during that
// hidden window makes syncTextMirrorVisibilityToPage force the mirror to
// visibility:hidden — correct while the page conceals it, but once the page
// un-hides the ancestor there is no host mutation left to re-sync. Silent
// scroll scans then SKIP the host (textMirrorAlreadyRenders) forever: the
// host text stays concealed and the mirror stays hidden — a permanently
// blank title/chip (2026-07-11 iPad blank-text regression).
describe('mirror visibility heals after a transient page hide', () => {
    it('re-shows a stuck-hidden mirror when the silent-scan skip check consults it', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');

        // The SPA hides the page, then touches the host's class attribute in
        // the same re-render batch — the per-host observer re-asserts styles
        // and syncs the mirror to the concealed page state.
        page.style.display = 'none';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');

        // The SPA un-hides the page WITHOUT touching the host again.
        page.style.removeProperty('display');

        // The next silent scroll scan consults the skip check; it must heal
        // the stuck-hidden mirror instead of leaving the row blank forever.
        expect(textMirrorAlreadyRenders(host, TEXT)).toBe(true);
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');
    });

    it('re-shows a stuck-hidden mirror on the guarded-apply sweep even when scans never re-collect the host', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;

        page.style.display = 'none';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');
        page.style.removeProperty('display');

        // Channel bylines are often outside the scan budget: no skip check
        // ever consults them. The sweep at the end of every guarded token
        // apply must heal them instead.
        withMirrorTokenApply(() => undefined);
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');
    });

    it('keeps the mirror hidden while the page still conceals the host', async () => {
        document.body.innerHTML = `<div id="page"><div id="host">${TEXT}</div></div>`;
        const page = document.getElementById('page')!;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;

        page.style.display = 'none';
        host.classList.add('recycled');
        await flushMicrotasks();
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');

        expect(textMirrorAlreadyRenders(host, TEXT)).toBe(true);
        expect(mirror.style.getPropertyValue('visibility')).toBe('hidden');
    });
});

// Interactive chrome rendered through the MIRROR channel is out-of-flow and
// paint-invariant: readings cannot distort the control's own layout. The
// sealed interactive-passive decision must therefore suppress ruby only for
// IN-PLACE renders — a mirrored control keeps its furigana (2026-07-11
// "furigana is missing" report: 作成 / もっと見る / feed chips).
describe('mirrored interactive chrome keeps furigana', () => {
    it('renders detached readings inside a mirrored button', () => {
        document.body.innerHTML = `<button id="host">${TEXT}</button>`;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.querySelector('rt')).toBeNull();
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        // Detached readings stay out of the button's line box while the
        // control-mirror stamp keeps the base glyph on the exact native
        // metrics instead of the roomier prose mirror metrics.
        expect(mirror.dataset.yomuControlMirror).toBe('true');
    });

    it('uses the same detached-reading channel on YouTube controls', () => {
        vi.stubGlobal('location', {
            hostname: 'www.youtube.com',
            href: 'https://www.youtube.com/watch?v=test',
        });
        document.body.innerHTML = `<button id="host">${TEXT}</button>`;
        const host = document.getElementById('host')!;
        paintMirror(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        expect(mirror.dataset.yomuControlMirror).toBe('true');
    });
});
