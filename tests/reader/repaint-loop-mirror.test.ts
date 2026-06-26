import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors, type FragmentTextTarget } from '../../src/reader/dom';
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
function paintForcedInline(host: HTMLElement): void {
    const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
    expect(target).toBeTruthy();
    applyTokensToScanTarget({ ...target!, forceInlineRender: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
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

    it('keeps forced-inline targets inline until they prove they are repaint-looping', () => {
        document.body.innerHTML = `<div id="comment">${TEXT}</div>`;
        const host = document.getElementById('comment')!;

        paintForcedInline(host);
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();

        let mirroredAt = -1;
        for (let i = 0; i < 6; i++) {
            host.textContent = TEXT;
            paintForcedInline(host);
            if (host.querySelector('.jpdb-reader-text-mirror')) { mirroredAt = i; break; }
        }

        expect(mirroredAt).toBeGreaterThanOrEqual(0);
        expect(mirroredAt).toBeLessThanOrEqual(4);
    });

    it('keeps volatile forced-inline targets inline when repaint-loop mirrors are suppressed', () => {
        document.body.innerHTML = `<div id="comment">${TEXT}</div>`;
        const host = document.getElementById('comment')!;

        paintForcedInline(host);
        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();

        for (let i = 0; i < 6; i++) {
            host.textContent = TEXT;
            const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
            expect(target).toBeTruthy();
            applyTokensToScanTarget({
                ...target!,
                forceInlineRender: true,
                suppressRepaintLoopMirror: true,
            }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        }

        expect(host.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeNull();
    });

    it('stretches text mirrors across inline attributed-string hosts without width or ruby clipping', () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost" style="display:inline;overflow:hidden">${TEXT}</span>`;
        const host = document.getElementById('title')!;

        for (let i = 0; i < 6 && !host.querySelector('.jpdb-reader-text-mirror'); i++) {
            host.textContent = TEXT;
            paint(host);
        }

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(host.style.getPropertyValue('display')).toBe('inline-block');
        expect(host.style.getPropertyPriority('display')).toBe('important');
        expect(host.style.getPropertyValue('overflow')).toBe('visible');
        expect(host.style.getPropertyPriority('overflow')).toBe('important');
        expect(mirror.style.inset).toBe('0 0 auto 0');
        expect(mirror.style.width).toBe('');
        expect(mirror.style.minWidth).toBe('');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(host.style.display).toBe('inline');
        expect(host.style.overflow).toBe('hidden');
        expect(host.style.visibility).toBe('');
        expect(host.style.position).toBe('');
    });

    it('keeps broad YouTube comment containers visible by mirroring the attributed text host only', () => {
        document.body.innerHTML = `
            <ytd-comment-view-model>
                <div id="content">
                    <yt-attributed-string id="content-text">
                        <span class="yt-core-attributed-string ytAttributedStringHost">${TEXT}</span>
                    </yt-attributed-string>
                    <div id="toolbar">返信</div>
                </div>
            </ytd-comment-view-model>
        `;
        const content = document.getElementById('content')!;
        const textHost = document.querySelector<HTMLElement>('.ytAttributedStringHost')!;
        const textNode = textHost.firstChild as Text;
        const target: FragmentTextTarget = {
            text: TEXT,
            parent: content,
            fragments: [{ node: textNode, start: 0, end: TEXT.length, hasNativeRuby: false }],
            nonDestructive: true,
        };

        applyTokensToScanTarget(target, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(content.style.getPropertyValue('visibility')).toBe('');
        expect(textHost.style.getPropertyValue('visibility')).toBe('hidden');
        expect(Array.from(textHost.children).some(child => child.matches('.jpdb-reader-text-mirror'))).toBe(true);
        expect(document.getElementById('toolbar')?.textContent).toBe('返信');
    });

    it('restores native text styles if a host removes its non-destructive mirror', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;
        const nonDestructive = { ...target, nonDestructive: true };

        applyTokensToScanTarget(nonDestructive, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const host = document.getElementById('title')!;
        expect(host.style.getPropertyValue('visibility')).toBe('hidden');

        host.querySelector('.jpdb-reader-text-mirror')?.remove();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyValue('position')).toBe('');
        expect(host.style.getPropertyValue('display')).toBe('');
    });

    it('re-hides the host when a re-render strips our inline style (no duplicate/missing title)', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost" style="display:inline">${TEXT}</span>`;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const host = document.getElementById('title')!;
        expect(host.style.getPropertyValue('visibility')).toBe('hidden');
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        // A YouTube polymer re-render rewrites the host style attribute without
        // changing its text, wiping our visibility:hidden / position:relative.
        host.setAttribute('style', 'display:inline-block;overflow:hidden');
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');
        await new Promise(resolve => setTimeout(resolve, 0));

        // The mirror survives and the host is re-hidden, so the native title cannot
        // re-appear beside the mirror (the duplication/"missing title" symptom).
        // Overflow is also re-opened so over-ruby is not clipped by YouTube's
        // attributed-string host after a Polymer style rewrite. (position:relative
        // is re-asserted in real browsers for mirror anchoring; jsdom's
        // getComputedStyle does not report position:static so state.positioned is
        // false here and only visibility/overflow are exercised.)
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.style.getPropertyValue('visibility')).toBe('hidden');
        expect(host.style.getPropertyPriority('visibility')).toBe('important');
        expect(host.style.getPropertyValue('overflow')).toBe('visible');
        expect(host.style.getPropertyPriority('overflow')).toBe('important');
    });

    it('does not replace an unchanged non-destructive mirror on repeated scans', () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;
        const nonDestructive = { ...target, nonDestructive: true };

        applyTokensToScanTarget(nonDestructive, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const firstMirror = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;

        applyTokensToScanTarget(nonDestructive, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        expect(document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')).toBe(firstMirror);
        expect(document.querySelectorAll('.jpdb-reader-text-mirror')).toHaveLength(1);
    });
});
