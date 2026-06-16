import { afterEach, describe, expect, it } from 'vitest';

import {
    canvasReaderPageSignature,
    captureCanvasDataUrl,
    collectCanvasReaderSurfaces,
    isBookwalkerViewerHost,
    isCanvasReaderPage,
} from '../../src/reader/ocr/canvas-readers';

// Canna wish: automatic OCR on BookWalker. Its browser viewer paints pages onto
// <canvas class="default"> inside #wideScreenN with a #pageSliderCounter, so the
// reader detects that surface, snapshots it, and re-snapshots on page turns.
function mountViewerFixture(counter = '1 / 3'): void {
    document.body.innerHTML = `
        <div id="wideScreen0"><canvas class="default" width="800" height="1130"></canvas></div>
        <span id="pageSliderCounter">${counter}</span>`;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('canvas readers (BookWalker)', () => {
    it('recognises BookWalker viewer hosts', () => {
        expect(isBookwalkerViewerHost('viewer.bookwalker.jp')).toBe(true);
        expect(isBookwalkerViewerHost('viewer-trial.bookwalker.jp')).toBe(true);
        expect(isBookwalkerViewerHost('global.bookwalker.jp')).toBe(true);
        expect(isBookwalkerViewerHost('example.com')).toBe(false);
        expect(isBookwalkerViewerHost('notbookwalker.jp.evil.com')).toBe(false);
    });

    it('detects a canvas reader page by DOM signature and collects surfaces', () => {
        expect(isCanvasReaderPage()).toBe(false);
        mountViewerFixture();
        expect(isCanvasReaderPage()).toBe(true);
        expect(collectCanvasReaderSurfaces()).toHaveLength(1);
    });

    it('changes the page signature when the counter advances (re-snapshot trigger)', () => {
        mountViewerFixture('1 / 3');
        const first = canvasReaderPageSignature();
        document.querySelector('#pageSliderCounter')!.textContent = '2 / 3';
        expect(canvasReaderPageSignature()).not.toBe(first);
    });

    it('captures a canvas without throwing and skips empty canvases', () => {
        const empty = document.createElement('canvas');
        empty.width = 0; empty.height = 0;
        expect(captureCanvasDataUrl(empty, 1_200_000)).toBeUndefined();
        // Success path (jsdom has no real toDataURL — stub it).
        const sized = document.createElement('canvas');
        sized.width = 100; sized.height = 100;
        sized.toDataURL = () => 'data:image/jpeg;base64,AAAA';
        expect(captureCanvasDataUrl(sized, 1_200_000)).toBe('data:image/jpeg;base64,AAAA');
        // A tainted canvas (toDataURL throws) is skipped, never thrown.
        const tainted = document.createElement('canvas');
        tainted.width = 100; tainted.height = 100;
        tainted.toDataURL = () => { throw new Error('tainted'); };
        expect(captureCanvasDataUrl(tainted, 1_200_000)).toBeUndefined();
    });
});
