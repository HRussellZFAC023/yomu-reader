import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    documentPortalProjectionCountsForTest,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    projectAdditiveTextMirrors,
    removeNonDestructiveScanMirrors,
    STALE_MIRROR_REMOVAL_GRACE_MS,
    withMirrorTokenApply,
    type FragmentTextTarget,
    type ScanTextTarget,
} from '../../src/reader/dom';
import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBToken } from '../../src/reader/app/types';
import { MIRROR_TEXT as TEXT, mirrorToken as token, paintMirrorToken } from './helpers/japanese-token-fixtures';
import { settleProjectionFrame } from './helpers/projection-frame';

const CARD = token().card;

function paint(host: HTMLElement): void {
    paintMirrorToken(host);
}
function paintForcedInline(host: HTMLElement): void {
    paintMirrorToken(host, { forceInlineRender: true });
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.getElementById('roomy-style')?.remove();
    document.body.innerHTML = '';
});

// A reconciling SPA (e.g. the mokuro.moe catalog) strips our annotation, we
// re-paint, it strips again — the text flips between plain and annotated. After
// a few rapid reverts the reader must switch that host to the non-destructive
// mirror (which never mutates the app's node) to break the loop.
describe('repaint-loop mirror fallback', () => {
    it('coalesces a batch of late readings into one exact portal projection', async () => {
        const text = '先生学生';
        document.body.innerHTML = `<article class="comment-thread"><p id="comment-text">${text}</p></article>`;
        const host = document.getElementById('comment-text')!;
        const target = collectTextTargetsIn(host, 40, false).find(item => item.text.trim() === text)!;
        const unresolved = (surface: string, start: number, vid: number): JPDBToken => ({
            card: { ...CARD, vid, sid: 1, spelling: surface, reading: '', source: 'jiten' },
            start,
            end: start + surface.length,
            length: surface.length,
            rubies: [],
            pitchClass: 'unknown',
            sentence: text,
        });
        applyTokensToScanTarget(
            { ...target, nonDestructive: true },
            [unresolved('先生', 0, 11), unresolved('学生', 2, 12)],
            { ...DEFAULT_SETTINGS, furiganaMode: 'all' },
        );
        await settleProjectionFrame();

        const words = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-document-annotation-portal .jpdb-reader-word')];
        expect(words).toHaveLength(2);
        const before = documentPortalProjectionCountsForTest().mirrors;
        applyPublicVocabularyFurigana(words[0], { ...CARD, vid: 11, spelling: '先生', reading: 'せんせい', source: 'jiten' }, {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
        });
        applyPublicVocabularyFurigana(words[1], { ...CARD, vid: 12, spelling: '学生', reading: 'がくせい', source: 'jiten' }, {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
        });

        // Neither word may synchronously Range-project the whole comment.
        expect(documentPortalProjectionCountsForTest().mirrors).toBe(before);
        await settleProjectionFrame();
        expect(documentPortalProjectionCountsForTest().mirrors - before).toBe(1);
    });

    it('keeps source-preserving prose outside the native host across same-text framework rewrites', async () => {
        document.body.innerHTML = `<article class="comment-thread"><p id="comment-text">${TEXT}</p></article>`;
        const host = document.getElementById('comment-text')!;
        const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
        expect(target).toBeTruthy();
        const nativeStyle = host.getAttribute('style');

        applyTokensToScanTarget({ ...target!, nonDestructive: true }, [token()], {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
        });

        const portal = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(portal).toBeTruthy();
        expect(host.contains(portal)).toBe(false);
        expect(portal.parentElement).toBe(document.body);
        expect(host.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).toBeNull();
        expect(host.textContent).toBe(TEXT);
        expect(host.getAttribute('style')).toBe(nativeStyle);

        let readerWordAdds = 0;
        let readerWordRemovals = 0;
        const lifecycle = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                readerWordAdds += readerWordsIn(mutation.addedNodes);
                readerWordRemovals += readerWordsIn(mutation.removedNodes);
            }
        });
        lifecycle.observe(document.body, { childList: true, subtree: true });

        // A React/YouTube-style same-text reconciliation replaces the source
        // children. The document portal must survive by identity: no reader
        // word is retired or replay-mounted inside the framework-owned host.
        host.textContent = TEXT;
        const replacementTarget = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT);
        expect(replacementTarget).toBeTruthy();
        applyTokensToScanTarget({ ...replacementTarget!, nonDestructive: true }, [token()], {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'all',
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(document.querySelector('.jpdb-reader-text-mirror')).toBe(portal);
        expect(host.contains(portal)).toBe(false);
        expect(host.querySelector('.jpdb-reader-word,.jpdb-reader-text-mirror')).toBeNull();
        expect(host.textContent).toBe(TEXT);
        expect(host.getAttribute('style')).toBe(nativeStyle);
        expect(readerWordAdds).toBe(0);
        expect(readerWordRemovals).toBe(0);
        lifecycle.disconnect();
    });

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

    it('keeps inline attributed-string host layout and clipping page-owned', () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost" style="display:inline;overflow:hidden">${TEXT}</span>`;
        const host = document.getElementById('title')!;

        for (let i = 0; i < 6 && !host.querySelector('.jpdb-reader-text-mirror'); i++) {
            host.textContent = TEXT;
            paint(host);
        }

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(host.style.getPropertyValue('display')).toBe('inline');
        expect(host.style.getPropertyPriority('display')).toBe('');
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');
        expect(host.style.getPropertyPriority('overflow')).toBe('');
        expect(mirror.style.inset).toBe('0 0 auto 0');
        expect(mirror.style.boxSizing).toBe('border-box');
        expect(mirror.style.width).toBe('');
        expect(mirror.style.minWidth).toBe('');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(host.style.display).toBe('inline');
        expect(host.style.overflow).toBe('hidden');
        expect(host.style.visibility).toBe('');
        expect(host.style.position).toBe('');
    });

    it('reserves and restores a detached-reading lane for multiline prose', () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="prose" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('prose')!;

        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
            proseWrap: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);

        const reading = host.querySelector<HTMLElement>('.jpdb-reader-detached-furi');
        expect(reading).toBeTruthy();
        expect(reading?.style.display).toBe('none');
        expect(host.style.getPropertyValue('line-height')).toBe('29px');
        expect(host.style.getPropertyPriority('line-height')).toBe('important');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(host.style.getPropertyValue('line-height')).toBe('16px');
        expect(host.style.getPropertyPriority('line-height')).toBe('');
    });

    it('keeps single-line prose at its authored line-height', () => {
        document.body.innerHTML = `<span id="prose" style="display:block;font-size:14px;line-height:16px">${TEXT}</span>`;
        const host = document.getElementById('prose')!;

        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: TEXT,
            nonDestructive: true,
            decoration: 'content-ruby',
            proseWrap: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);

        expect(host.style.getPropertyValue('line-height')).toBe('16px');
    });

    it('reserves the same lane for multiline passive content', () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="prose" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('prose')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
            passiveInteraction: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);

        expect(host.style.lineHeight).toBe('29px');
    });

    it('re-reserves from and restores a newer page line-height', () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="prose" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('prose')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
            proseWrap: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');

        host.style.setProperty('line-height', '18px');
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');

        removeNonDestructiveScanMirrors(document);
        expect(host.style.lineHeight).toBe('18px');
    });

    it('refreshes an unreserved page baseline before later reserving', () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="prose" style="display:block;white-space:pre-wrap;font-size:14px;line-height:40px">${prose}</span>`;
        const host = document.getElementById('prose')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('40px');

        host.style.lineHeight = '18px';
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');
        removeNonDestructiveScanMirrors(document);

        expect(host.style.lineHeight).toBe('18px');
    });

    it('never shrinks an active lane on a responsive font-size change', () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="prose" style="display:block;white-space:pre-wrap;font-size:16px;line-height:30px">${prose}</span>`;
        const host = document.getElementById('prose')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('33px');

        host.style.fontSize = '14px';
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('33px');
        removeNonDestructiveScanMirrors(document);

        expect(host.style.lineHeight).toBe('30px');
    });

    it('does not resurrect an old inline baseline after a class rewrite', async () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.head.insertAdjacentHTML('beforeend', '<style id="roomy-style">.roomy-prose{line-height:24px}</style>');
        document.body.innerHTML = `<span id="prose" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('prose')!;
        applyTokensToScanTarget({
            node: host.firstChild as Text,
            parent: host,
            text: prose,
            nonDestructive: true,
            decoration: 'content-ruby',
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');

        host.style.removeProperty('line-height');
        host.classList.add('roomy-prose');
        await new Promise(resolve => setTimeout(resolve, 0));
        projectAdditiveTextMirrors(document);
        expect(host.style.lineHeight).toBe('29px');
        removeNonDestructiveScanMirrors(document);

        expect(host.style.lineHeight).toBe('');
        expect(getComputedStyle(host).lineHeight).toBe('24px');
        document.getElementById('roomy-style')?.remove();
    });

    it('keeps ruby-suppressed passive mirrors clipped by native host overflow', () => {
        document.body.innerHTML = `<a id="title" style="display:block;overflow:hidden;height:36px;line-height:18px">${TEXT}</a>`;
        const host = document.getElementById('title')!;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;

        applyTokensToScanTarget({
            ...target,
            nonDestructive: true,
            suppressRuby: true,
            passiveInteraction: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        // Detached passive mirrors are additive: native glyphs remain visible
        // while the overlay supplies hit targets, pitch, and readings.
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');
        expect(host.style.getPropertyPriority('overflow')).toBe('');
        expect(mirror.querySelector('rt')).toBeNull();
        expect(mirror.querySelector('.jpdb-reader-passive-word')).toBeTruthy();
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');

        expect(removeNonDestructiveScanMirrors(document)).toBe(1);
        expect(host.style.overflow).toBe('hidden');
        expect(host.style.visibility).toBe('');
    });

    it('preserves the host content-box inset in non-destructive mirrors', () => {
        document.body.innerHTML = `<button id="control" style="box-sizing:border-box;height:40px;padding:13px 18px 13px 10px;line-height:14px">${TEXT}</button>`;
        const host = document.getElementById('control')!;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;

        applyTokensToScanTarget({
            ...target,
            nonDestructive: true,
            suppressRuby: true,
            passiveInteraction: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.style.paddingTop).toBe('13px');
        expect(mirror.style.paddingRight).toBe('18px');
        expect(mirror.style.paddingBottom).toBe('13px');
        expect(mirror.style.paddingLeft).toBe('10px');
        expect(mirror.style.inset).toBe('50% 0 auto 0');
        expect(mirror.style.transform).toBe('translateY(-50%)');
    });

    it('preserves an explicit non-centred control cross-axis alignment', () => {
        document.body.innerHTML = `<button id="control" style="display:flex;align-items:flex-start;height:40px;padding:4px 10px;line-height:14px">${TEXT}</button>`;
        const host = document.getElementById('control')!;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;

        applyTokensToScanTarget({
            ...target,
            nonDestructive: true,
            suppressRuby: true,
            passiveInteraction: true,
        }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.style.inset).toBe('0 0 auto 0');
        expect(mirror.style.transform).toBe('');
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
        expect(textHost.style.getPropertyValue('visibility')).toBe('');
        expect(Array.from(textHost.children).some(child => child.matches('.jpdb-reader-text-mirror'))).toBe(true);
        expect(document.getElementById('toolbar')?.textContent).toBe('返信');
    });

    it('restores native text styles if a host removes its non-destructive mirror', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;
        const nonDestructive = { ...target, nonDestructive: true };

        applyTokensToScanTarget(nonDestructive, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const host = document.getElementById('title')!;
        expect(host.style.getPropertyValue('visibility')).toBe('');

        host.querySelector('.jpdb-reader-text-mirror')?.remove();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyValue('position')).toBe('');
        expect(host.style.getPropertyValue('display')).toBe('');
    });

    it('reasserts only mirror anchoring when a re-render rewrites host style', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost" style="display:inline">${TEXT}</span>`;
        const target = collectTextTargetsIn(document.body, 40, false).find(t => t.text.trim() === TEXT)!;
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const host = document.getElementById('title')!;
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        // A YouTube polymer re-render rewrites the host style attribute without
        // changing its text, wiping our positioning context.
        host.setAttribute('style', 'display:inline-block;overflow:hidden');
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');
        await new Promise(resolve => setTimeout(resolve, 0));

        // The mirror survives while native visibility/overflow remain exactly
        // page-owned. (position:relative is re-asserted in real browsers for
        // mirror anchoring; jsdom's
        // getComputedStyle does not report position:static so state.positioned is
        // false here and only visibility/overflow are exercised.)
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        expect(host.style.getPropertyValue('visibility')).toBe('');
        expect(host.style.getPropertyPriority('visibility')).toBe('');
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');
        expect(host.style.getPropertyPriority('overflow')).toBe('');
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

function readerWordsIn(nodes: NodeList): number {
    return Array.from(nodes).reduce((count, node) => {
        if (!(node instanceof Element)) return count;
        return count
            + (node.matches('.jpdb-reader-word') ? 1 : 0)
            + node.querySelectorAll('.jpdb-reader-word').length;
    }, 0);
}

// A long/paginated reading surface (Narou, ttsu) recycles the same host slots
// as the reader scrolls: each new title paints a mirror, the SPA later swaps
// the host content, we paint again. Every mirror install creates a per-host
// MutationObserver. If a recycled/detached host's observer is never
// disconnected, the observer's callback closure pins the detached host in
// memory forever — an unbounded leak that OOM-crashes the tab. Every observer
// created for a mirror MUST be disconnected when that mirror is torn down.
describe('text mirror observer lifecycle (leak guard)', () => {
    function paintNonDestructive(host: HTMLElement): void {
        const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT)!;
        expect(target).toBeTruthy();
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
    }

    it('disconnects one observer for every observe across detached-host recycle cycles', () => {
        const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
        const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect');

        try {
            // A virtualized reader (Narou, ttsu) recycles slots by detaching the
            // whole host node and mounting a fresh one. On the leaky code the
            // detached host's per-host observer is NEVER disconnected — its
            // callback closure strong-references the host, so host<->state<->
            // observer form a self-sustaining cycle that survives detach and
            // GC (the OOM leak). The fix disconnects the prior/placeholder
            // observer when a new one is installed, so across N recycle cycles
            // the number of disconnects matches the number of observe() calls.
            const CYCLES = 12;
            for (let cycle = 0; cycle < CYCLES; cycle++) {
                document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
                const host = document.getElementById('title')!;
                paintNonDestructive(host);
                host.remove();
            }

            // Every mirror install ran observe(); each must be balanced by a
            // disconnect (leaky code left them all connected -> disconnect == 0).
            expect(observeSpy.mock.calls.length).toBeGreaterThanOrEqual(CYCLES);
            expect(disconnectSpy.mock.calls.length).toBeGreaterThanOrEqual(observeSpy.mock.calls.length);
        } finally {
            observeSpy.mockRestore();
            disconnectSpy.mockRestore();
        }
    });

    it('does not fire a dangling stale-removal timer after the mirror host is torn down', async () => {
        vi.useFakeTimers();
        try {
            document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
            const host = document.getElementById('title')!;
            paintNonDestructive(host);

            // A benign external re-render changes the host text -> the per-host
            // observer schedules a stale-removal timer (STALE_MIRROR_REMOVAL_GRACE_MS).
            const textNode = Array.from(host.childNodes).find(n => n.nodeType === Node.TEXT_NODE) as Text;
            textNode.nodeValue = '新しい題名';
            // Flush the MutationObserver microtask so the timer is scheduled.
            await Promise.resolve();

            // Tear down before the grace elapses (recycler swaps the slot away).
            removeNonDestructiveScanMirrors(document);

            // Advancing past the grace must NOT fire a dangling callback that
            // re-touches the torn-down host (the aborted lifecycle no-ops it).
            expect(() => vi.advanceTimersByTime(STALE_MIRROR_REMOVAL_GRACE_MS + 50)).not.toThrow();
            // The host must have been fully restored by teardown (no residual
            // hidden state from a late timer).
            expect(host.style.getPropertyValue('visibility')).toBe('');
        } finally {
            vi.useRealTimers();
        }
    });

    it('tears down control-mirror change/input listeners on removal (no accumulation across recycles)', () => {
        // Regression guard for LEAK 4: a control (button/input) text mirror adds
        // change+input listeners bound to a stored closure. Across repeated
        // mirror install/teardown cycles the net listener count must stay
        // bounded — teardown (AbortController.abort) removes both every time.
        document.body.innerHTML = `<button id="btn">${TEXT}</button>`;
        const host = document.getElementById('btn')!;
        const added = new Set<EventListenerOrEventListenerObject>();
        const addSpy = vi.spyOn(host, 'addEventListener');
        const removeSpy = vi.spyOn(host, 'removeEventListener');
        addSpy.mockImplementation(function (this: HTMLElement, type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) {
            if ((type === 'change' || type === 'input') && listener) {
                added.add(listener);
                if (opts && typeof opts === 'object' && opts.signal) {
                    opts.signal.addEventListener('abort', () => added.delete(listener));
                }
            }
            return HTMLElement.prototype.addEventListener.call(this, type, listener, opts);
        });
        removeSpy.mockImplementation(function (this: HTMLElement, type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) {
            if (type === 'change' || type === 'input') added.delete(listener);
            return HTMLElement.prototype.removeEventListener.call(this, type, listener, opts);
        });

        try {
            const target = {
                text: TEXT, parent: host, fragments: [], nonDestructive: true,
                controlTextMirror: true, passiveInteraction: true,
            } as unknown as ScanTextTarget;
            for (let cycle = 0; cycle < 6; cycle++) {
                applyTokensToScanTarget(target, [{ ...token(), rubies: [] }], { ...DEFAULT_SETTINGS, furiganaMode: 'off' });
                removeNonDestructiveScanMirrors(document);
            }
            // After the final teardown, no change/input listener may remain live.
            expect(added.size).toBe(0);
        } finally {
            addSpy.mockRestore();
            removeSpy.mockRestore();
        }
    });
});

// The visible-page scanner batches token-apply inside pauseMutationObserver
// (which pauses only the app-level auto-scan observer). The PER-HOST mirror
// observers are NOT paused, so Yomu's own mirror teardown/rebuild mutations
// fire them -> dispatchTextMirrorStale -> the app schedules ANOTHER scan ->
// self-sustaining allocation loop on long/dynamic pages (the OOM feedback
// loop). Yomu's own token-apply must not re-trigger the stale-rescan path,
// while a REAL external re-render still must.
describe('mirror stale-event feedback loop guard', () => {
    function paintNonDestructive(host: HTMLElement): void {
        const target = collectTextTargetsIn(host, 40, false).find(t => t.text.trim() === TEXT)!;
        expect(target).toBeTruthy();
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
    }

    it('does not dispatch a stale event for host mutations made during Yomu token-apply', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paintNonDestructive(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // During a guarded apply the scanner mutates host subtrees that carry
        // OTHER live mirrors (batched apply touches many hosts). Such a host-text
        // change queues the per-host observer, but because it happened inside the
        // apply guard, its records are drained before the microtask runs — no
        // stale event, so no follow-up scan is scheduled (the loop is broken).
        // The observer callback fires as a microtask AFTER the synchronous guard
        // exits, so this specifically exercises the end-of-apply record drain
        // (a bare synchronous flag would already be 0 by callback time).
        withMirrorTokenApply(() => {
            host.firstChild!.nodeValue = '別の題名';
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        expect(staleEvents).toBe(0);
    });

    it('still dispatches a stale event for a REAL external re-render (outside token-apply)', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paintNonDestructive(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // Recycler swaps the title in place with NO apply guard active — the
        // 1.6.108 YouTube title-recycler rescan must still fire.
        const textNode = Array.from(host.childNodes).find(n => n.nodeType === Node.TEXT_NODE) as Text;
        textNode.nodeValue = '新しい題名';
        await new Promise(resolve => setTimeout(resolve, 0));
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        expect(staleEvents).toBeGreaterThan(0);
    });
});
