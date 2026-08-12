import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT,
    nonDestructiveRenderReplayCountForTest,
    projectAdditiveTextMirrors,
    removeNonDestructiveScanMirrors,
    withMirrorTokenApply,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { MIRROR_TEXT as TEXT, mirrorToken as token, paintMirrorToken } from './helpers/japanese-token-fixtures';

function paint(host: HTMLElement): void {
    paintMirrorToken(host, { nonDestructive: true });
}

function flushObservers(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// Class Y (live-page thrash) + class BB (mobile scroll content-shift):
// framework re-renders with UNCHANGED text (ytd-watch-info-text every ~6s on
// live streams; scroll recyclers rehydrating tiles) must re-apply the cached
// render synchronously in the mutation-observer microtask — no stale event
// (i.e. no scheduled re-scan/re-parse), no bare frame, no paint change.
describe('identical-text re-render replays the cached render (class Y/BB)', () => {
    it('preserves the multiline prose reading lane across a cache replay', async () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="info" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('info')!;
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

        host.textContent = prose;
        await flushObservers();
        projectAdditiveTextMirrors(document);

        const replayed = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(replayed.dataset.yomuReadingLaneCandidate).toBe('true');
        expect(host.style.lineHeight).toBe('29px');
    });

    it('does not restore a removed inline line-height while replaying a wiped mirror', async () => {
        const prose = `${TEXT}\n${TEXT}`;
        document.body.innerHTML = `<span id="info" style="display:block;white-space:pre-wrap;font-size:14px;line-height:16px">${prose}</span>`;
        const host = document.getElementById('info')!;
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
        host.textContent = prose;
        await flushObservers();
        projectAdditiveTextMirrors(document);
        removeNonDestructiveScanMirrors(document);

        expect(host.style.lineHeight).toBe('');
    });

    it('replays N recycle cycles from cache with zero stale rescans and stable paint inputs', async () => {
        document.body.innerHTML = `<span id="info" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('info')!;
        paint(host);
        const initialMirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(initialMirror).toBeTruthy();
        const initialSignature = initialMirror.dataset.renderSignature;
        const initialSourceText = initialMirror.dataset.sourceText;
        const initialHostStyle = host.getAttribute('style') ?? '';
        // Paint invariance baseline: the source glyphs remain authoritative.
        expect(host.style.getPropertyValue('visibility')).toBe('');

        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);
        const replaysBefore = nonDestructiveRenderReplayCountForTest();

        const cycles = 5;
        for (let cycle = 0; cycle < cycles; cycle += 1) {
            // The 6s live re-render / scroll-recycle shape: children replaced
            // (mirror wiped) with byte-identical text in one mutation batch.
            host.textContent = TEXT;
            await flushObservers();

            const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
            expect(mirror, `cycle ${cycle}: mirror must be re-applied`).toBeTruthy();
            // Deterministic same-input/same-output: identical render signature
            // and source text, identical host inline paint writes — so the
            // row's paint inputs (and therefore its height) cannot oscillate.
            expect(mirror!.dataset.renderSignature).toBe(initialSignature);
            expect(mirror!.dataset.sourceText).toBe(initialSourceText);
            expect(mirror!.querySelector('.jpdb-reader-furi')?.textContent).toBe('にほんご');
            expect(host.style.getPropertyValue('visibility')).toBe('');
            expect(host.getAttribute('style') ?? '').toBe(initialHostStyle);
        }
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        // N recycles = N cache replays and ZERO stale rescans (a stale event is
        // the only trigger for the re-scan → re-parse → re-decorate churn).
        expect(staleEvents).toBe(0);
        expect(nonDestructiveRenderReplayCountForTest() - replaysBefore).toBe(cycles);
    });

    it('still dispatches stale (and does not replay) when the re-rendered text CHANGED', async () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paint(host);
        let staleEvents = 0;
        const onStale = () => { staleEvents += 1; };
        document.addEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);
        const replaysBefore = nonDestructiveRenderReplayCountForTest();

        host.textContent = '新しい題名';
        await flushObservers();
        document.removeEventListener(NON_DESTRUCTIVE_SCAN_MIRROR_STALE_EVENT, onStale);

        expect(staleEvents).toBeGreaterThan(0);
        expect(nonDestructiveRenderReplayCountForTest() - replaysBefore).toBe(0);
    });

    it('never replays after a bulk clear (annotations off must stay off)', async () => {
        document.body.innerHTML = `<span id="info" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('info')!;
        paint(host);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();

        removeNonDestructiveScanMirrors(document);
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeFalsy();
        const replaysBefore = nonDestructiveRenderReplayCountForTest();

        // A framework re-render with identical text after the clear must not
        // resurrect the mirror from the (now invalidated) cache.
        host.textContent = TEXT;
        await flushObservers();
        expect(host.querySelector('.jpdb-reader-text-mirror')).toBeFalsy();
        expect(nonDestructiveRenderReplayCountForTest() - replaysBefore).toBe(0);
    });
});

/**
 * The same invariant ("no bare frame") on the channel the suite above never
 * looked at: the PROJECTED READINGS. They are not part of the mirror — each one
 * is a clone in a reader-owned overlay layer, positioned from client rects
 * measured off the host's own text nodes.
 *
 * The re-render shape here is the other half of class Y: the host keeps its
 * text AND its mirror, but the framework swaps the nodes underneath for
 * equivalent copies (`replaceWith(cloneNode(true))` — React/Polymer
 * reconciliation, the live watch-info cycle). Measured in Chromium on that
 * fixture, every reading went `display:none` on the next frame and stayed there
 * through 120 frames, a sustained 200px scroll and a viewport resize; only an
 * explicit `projectAdditiveTextMirrors(document)` brought them back.
 *
 * jsdom computes no layout, so the geometry below is stubbed — but the ONE
 * browser behaviour the bug turns on is modelled honestly and was measured
 * directly: a Range over detached text nodes reports no client rects at all
 * (`rectsFromCapturedNodes: []` against `rectsFromLiveNodes: [[69,43,133]]`
 * immediately after the replacement).
 */
describe('same-text node replacement keeps the projected readings painted (class Y)', () => {
    const HOST_RECT = { left: 100, top: 50, width: 200, height: 20 };
    // Where the host's glyphs are before the re-render, and after it. The
    // re-render nudging the line is what separates a genuine re-measure from a
    // grace paint of the last known rect.
    const SOURCE_LEFT_BEFORE = 160;
    const SOURCE_LEFT_AFTER = 200;
    let sourceLeft = SOURCE_LEFT_BEFORE;

    function rect(left: number, top = 50, width = 48, height = 16): DOMRect {
        return {
            left, top, width, height,
            right: left + width, bottom: top + height,
            x: left, y: top,
            toJSON: () => ({}),
        } as DOMRect;
    }

    const rangeProto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
    const hadNativeRangeRects = 'getClientRects' in rangeProto;

    function stubGeometry(element: HTMLElement, box: typeof HOST_RECT): void {
        Object.defineProperties(element, {
            getBoundingClientRect: { configurable: true, value: () => rect(box.left, box.top, box.width, box.height) },
            clientWidth: { configurable: true, value: box.width },
            clientHeight: { configurable: true, value: box.height },
            offsetWidth: { configurable: true, value: box.width },
            offsetHeight: { configurable: true, value: box.height },
        });
    }

    function mount(): { host: HTMLElement; mirror: HTMLElement } {
        // The host's text lives in a CHILD element, which is what a framework
        // replaces. The host itself, and the mirror inside it, both survive.
        document.body.innerHTML = `<span id="info" class="ytAttributedStringHost"><span class="seg">${TEXT}</span></span>`;
        const host = document.getElementById('info') as HTMLElement;
        stubGeometry(host, HOST_RECT);
        const collected = collectTextTargetsIn(host, 40, false)[0];
        applyTokensToScanTarget(
            { ...collected, parent: host, text: TEXT, fragments: [], nonDestructive: true, passiveInteraction: true },
            [token()],
            { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' },
        );
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror');
        if (!mirror) throw new Error('no additive mirror mounted');
        stubGeometry(mirror, HOST_RECT);
        return { host, mirror };
    }

    function rerenderHostNodes(host: HTMLElement): void {
        for (const child of [...host.children]) {
            if (child.classList.contains('jpdb-reader-text-mirror')) continue;
            child.replaceWith(child.cloneNode(true));
        }
    }

    const frame = (): Promise<void> => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    async function settle(count = 4): Promise<void> {
        for (let index = 0; index < count; index += 1) {
            await flushObservers();
            await frame();
        }
    }

    function projectedReading(): HTMLElement | null {
        return document.querySelector<HTMLElement>('[data-yomu-projected-reading="true"]');
    }

    function sourceFragmentLefts(mirror: HTMLElement): string[] {
        return [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')]
            .map(fragment => fragment.style.left);
    }

    beforeEach(() => {
        sourceLeft = SOURCE_LEFT_BEFORE;
        Object.defineProperty(rangeProto, 'getClientRects', {
            configurable: true,
            value(this: Range) {
                // A Range whose boundaries have left the document measures
                // nothing — the browser behaviour this whole failure rides on.
                if (!this.startContainer.isConnected || !this.endContainer.isConnected) return [];
                return this.toString() === TEXT ? [rect(sourceLeft)] : [];
            },
        });
    });

    afterEach(() => {
        if (!hadNativeRangeRects) delete rangeProto.getClientRects;
    });

    it('re-measures the reading against the replacement nodes, within a frame', async () => {
        const { host } = mount();
        projectAdditiveTextMirrors(document);
        await settle(2);
        expect(projectedReading()?.textContent).toBe('にほんご');
        expect(projectedReading()?.style.display).toBe('block');
        expect(projectedReading()?.dataset.yomuSourceLeft).toBe(String(SOURCE_LEFT_BEFORE));

        sourceLeft = SOURCE_LEFT_AFTER;
        rerenderHostNodes(host);
        await settle();

        // Not blank, and not the last known rect held open by the grace window:
        // the pass measured the nodes the framework actually left behind.
        expect(projectedReading()?.style.display).toBe('block');
        expect(projectedReading()?.dataset.yomuSourceLeft).toBe(String(SOURCE_LEFT_AFTER));
    });

    it('recovers even when the replacement never reaches the mirror observer', async () => {
        const { host } = mount();
        projectAdditiveTextMirrors(document);
        await settle(2);
        expect(projectedReading()?.dataset.yomuSourceLeft).toBe(String(SOURCE_LEFT_BEFORE));

        // A guarded token apply drains every live mirror observer's records, so
        // a page write in the same delivery turn is never reported to it and
        // nothing schedules a projection pass. The overlay's own refresh pump
        // still runs — and it has to be able to measure, on its own, what the
        // re-render left behind.
        withMirrorTokenApply(() => rerenderHostNodes(host));
        sourceLeft = SOURCE_LEFT_AFTER;
        await settle();

        expect(projectedReading()?.style.display).toBe('block');
        expect(projectedReading()?.dataset.yomuSourceLeft).toBe(String(SOURCE_LEFT_AFTER));
    });

    it('re-stamps the source-fragment paint the same re-render invalidated', async () => {
        const { host, mirror } = mount();
        projectAdditiveTextMirrors(document);
        await settle(2);
        // Fragment geometry is mirror-relative: 160 - 100.
        expect(sourceFragmentLefts(mirror)).toEqual(['60px']);

        sourceLeft = SOURCE_LEFT_AFTER;
        rerenderHostNodes(host);
        await settle();

        // The status tint and the pitch/status underline ride these boxes, so a
        // re-render that moved the glyphs must move them too — no scroll, no
        // resize, no re-scan required.
        expect(sourceFragmentLefts(mirror)).toEqual(['100px']);
        expect(mirror.dataset.yomuSourceProjected).toBe('true');
    });
});
