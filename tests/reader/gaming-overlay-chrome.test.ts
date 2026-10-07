import { afterEach, describe, expect, it } from 'vitest';
import { onOverlayChrome, overlayChromeScreenRects } from '../../src/gaming/renderer/ocr-lines';

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
}

describe('Yomu Gaming keeps its own chrome out of recognized text', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    // Reported: "even the yomu text is getting the overlay and parsed in the top right". A
    // frame grabbed before the overlay had left the screen carries the toolbar's "よむ".
    it('measures the toolbar as a fraction of the screen the overlay covers', () => {
        document.body.innerHTML = '<main><div class="overlay-toolbar"><strong>よむ</strong></div>'
            + '<div class="overlay-status"><strong>よむ</strong><span>Reading screen</span></div></main>';
        (document.querySelector('.overlay-toolbar') as HTMLElement).getBoundingClientRect = () => rect(1636, 12, 274, 34);
        (document.querySelector('.overlay-status') as HTMLElement).getBoundingClientRect = () => rect(860, 520, 200, 40);

        // Only the standing toolbar: the status pill sits mid-screen over the player's text.
        expect(overlayChromeScreenRects(document, { width: 1920, height: 1080 })).toEqual([
            { left: 1636 / 1920, top: 12 / 1080, width: 274 / 1920, height: 34 / 1080 },
        ]);
    });

    it('drops a line read from the toolbar and keeps the game text around it', () => {
        const toolbar = [{ left: 1636 / 1920, top: 12 / 1080, width: 274 / 1920, height: 34 / 1080 }];

        expect(onOverlayChrome({ left: 0.9, top: 0.015, width: 0.03, height: 0.02 }, toolbar)).toBe(true);
        expect(onOverlayChrome({ left: 0.15, top: 0.72, width: 0.4, height: 0.04 }, toolbar)).toBe(false);
        // A HUD column starting just under the toolbar stays the game's.
        expect(onOverlayChrome({ left: 0.93, top: 0.05, width: 0.045, height: 0.4 }, toolbar)).toBe(false);
        expect(onOverlayChrome({ left: 0.9, top: 0.015, width: 0.03, height: 0.02 }, [])).toBe(false);
    });
});
