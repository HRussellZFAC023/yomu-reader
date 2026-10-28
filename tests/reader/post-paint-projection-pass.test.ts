import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    applyTokensToScanTarget,
    collectTextTargetsIn,
    projectAdditiveTextMirrors,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { createPostPaintPass, viewForNode } from '../../src/reader/dom/post-paint-pass';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

/**
 * A coalescing latch that only its own frame callback can clear is a permanent
 * off switch for whatever it guards. These pin both halves of that:
 *
 * - a frame armed against a scheduler that never calls back must not suppress
 *   the next request (the re-stamp after a live re-render is routed through
 *   this pass, so a stuck latch leaves the status tint and pitch/status
 *   underline pinned to where the glyphs used to be);
 * - the frame must be requested as a METHOD on its window, because a free call
 *   throws in a Gecko userscript-manager sandbox and takes the rest of the
 *   mutation-observer callback with it.
 */
describe('post-paint pass latch', () => {
    it('coalesces repeated requests into one frame while a scheduler owes one', () => {
        const frames: FrameRequestCallback[] = [];
        const view = { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) };
        let runs = 0;
        const pass = createPostPaintPass(() => { runs += 1; });

        pass.schedule(view as unknown as Window);
        pass.schedule(view as unknown as Window);
        pass.schedule(view as unknown as Window);
        expect(frames).toHaveLength(1);
        expect(runs).toBe(0);

        frames[0](0);
        expect(runs).toBe(1);
        // The latch cleared with the frame, so the next burst arms again.
        pass.schedule(view as unknown as Window);
        expect(frames).toHaveLength(2);
    });

    it('re-arms when a different scheduler is asked, so a dead one cannot latch it off', () => {
        let runs = 0;
        const pass = createPostPaintPass(() => { runs += 1; });
        // A scheduler that hands back a handle and never calls back: the realm
        // it belonged to is gone, so nothing it holds can ever be released.
        const dead = { requestAnimationFrame: (_callback: FrameRequestCallback) => 1 };
        pass.schedule(dead as unknown as Window);
        expect(runs).toBe(0);

        const frames: FrameRequestCallback[] = [];
        const live = { requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) };
        pass.schedule(live as unknown as Window);
        expect(frames).toHaveLength(1);
        frames[0](0);
        expect(runs).toBe(1);
    });

    it('runs inline in a realm with no animation frames', () => {
        let runs = 0;
        const pass = createPostPaintPass(() => { runs += 1; });
        pass.schedule(undefined);
        pass.schedule({} as unknown as Window);
        expect(runs).toBe(2);
    });

    it('leaves no latch behind when arming the frame throws', () => {
        let runs = 0;
        const pass = createPostPaintPass(() => { runs += 1; });
        const hostile = {
            requestAnimationFrame(this: unknown, _callback: FrameRequestCallback): number {
                throw new TypeError("'requestAnimationFrame' called on an object that does not implement interface Window.");
            },
        };
        expect(() => pass.schedule(hostile as unknown as Window)).toThrow(TypeError);

        // Nothing was armed, so nothing would ever have cleared that latch.
        const frames: FrameRequestCallback[] = [];
        pass.schedule({ requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) } as unknown as Window);
        expect(frames).toHaveLength(1);
        frames[0](0);
        expect(runs).toBe(1);
    });

    it('resolves the window that owes a node its frames', () => {
        expect(viewForNode(document)).toBe(document.defaultView);
        expect(viewForNode(document.body)).toBe(document.defaultView);
        expect(viewForNode(null)).toBeNull();
    });
});

const TEXT = '日本語';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: TEXT, reading: 'にほんご', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
};

function token(): JPDBToken {
    return {
        card: { ...CARD },
        start: 0, end: TEXT.length, length: TEXT.length,
        rubies: [{ text: 'にほんご', start: 0, end: TEXT.length, length: TEXT.length }],
        pitchClass: '', sentence: TEXT,
    };
}

describe('additive mirror re-stamp survives a frame that never arrives', () => {
    const HOST_RECT = { left: 100, top: 50, width: 200, height: 20 };
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
    let nativeRequestAnimationFrame: typeof window.requestAnimationFrame;

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

    function sourceFragmentLefts(mirror: HTMLElement): string[] {
        return [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-source-fragment')]
            .map(fragment => fragment.style.left);
    }

    const flushObservers = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
    const frame = (): Promise<void> => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    async function settle(count = 4): Promise<void> {
        for (let index = 0; index < count; index += 1) {
            await flushObservers();
            await frame();
        }
    }

    function useFrameScheduler(value: typeof window.requestAnimationFrame): void {
        Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, writable: true, value });
    }

    beforeEach(() => {
        sourceLeft = SOURCE_LEFT_BEFORE;
        nativeRequestAnimationFrame = window.requestAnimationFrame;
        Object.defineProperty(rangeProto, 'getClientRects', {
            configurable: true,
            value(this: Range) {
                if (!this.startContainer.isConnected || !this.endContainer.isConnected) return [];
                return this.toString() === TEXT ? [rect(sourceLeft)] : [];
            },
        });
    });

    afterEach(() => {
        useFrameScheduler(nativeRequestAnimationFrame);
        if (!hadNativeRangeRects) delete rangeProto.getClientRects;
        removeNonDestructiveScanMirrors(document);
        document.body.innerHTML = '';
    });

    it('re-stamps after a re-render even when an earlier frame was armed by a scheduler that never ran', async () => {
        const { host, mirror } = mount();
        projectAdditiveTextMirrors(document);
        await settle(2);
        expect(sourceFragmentLefts(mirror)).toEqual(['60px']);

        // A scheduler that hands back a handle and never calls back. The pass it
        // latches can only ever be released by the callback it swallowed.
        useFrameScheduler(((_callback: FrameRequestCallback) => 1) as typeof window.requestAnimationFrame);
        sourceLeft = SOURCE_LEFT_AFTER;
        rerenderHostNodes(host);
        await flushObservers();
        expect(sourceFragmentLefts(mirror)).toEqual(['60px']);

        // Frames work again. The re-stamp must come back with them, not stay
        // suppressed by a latch the dead scheduler can never clear.
        useFrameScheduler(nativeRequestAnimationFrame);
        rerenderHostNodes(host);
        await settle();

        expect(sourceFragmentLefts(mirror)).toEqual(['100px']);
        expect(mirror.dataset.yomuSourceProjected).toBe('true');
    });

    it('requests its frame with the root window as receiver', async () => {
        const { host } = mount();
        projectAdditiveTextMirrors(document);
        await settle(2);

        const receivers: unknown[] = [];
        // Exactly what Gecko does for a receiver that is not a Window: a free
        // `requestAnimationFrame(...)` call inside a Firefox userscript-manager
        // sandbox reaches the WebIDL binding with no Window and throws.
        function geckoLike(this: unknown, callback: FrameRequestCallback): number {
            receivers.push(this);
            if (this !== window) {
                throw new TypeError("'requestAnimationFrame' called on an object that does not implement interface Window.");
            }
            return nativeRequestAnimationFrame.call(window, callback);
        }
        useFrameScheduler(geckoLike as typeof window.requestAnimationFrame);

        sourceLeft = SOURCE_LEFT_AFTER;
        rerenderHostNodes(host);
        await flushObservers();

        expect(receivers.length).toBeGreaterThan(0);
        expect(receivers.every(receiver => receiver === window)).toBe(true);
    });
});
