import { afterEach, describe, expect, it } from 'vitest';

import {
    backgroundImageReaderUrl,
    canvasRenderedContentSignature,
    looksLikeRenderedCanvasImage,
    canvasReaderPageSignature,
    captureCanvasDataUrl,
    collectBackgroundImageReaderSurfaces,
    collectCanvasReaderSurfaces,
    isBackgroundImageReaderPage,
    isBookwalkerViewerHost,
    isCanvasReaderPage,
    isKnownBackgroundImageReaderHost,
    isKnownCanvasReaderHost,
    isReaderRasterPage,
} from '../../src/reader/ocr/canvas-readers';

// Canna wish: automatic OCR on BookWalker. Its browser viewer paints pages onto
// <canvas class="default"> inside #wideScreenN with a #pageSliderCounter, so the
// reader detects that surface, snapshots it, and re-snapshots on page turns.
function mountViewerFixture(counter = '1 / 3'): void {
    document.body.innerHTML = `
        <div id="wideScreen0"><canvas class="default" width="800" height="1130"></canvas></div>
        <span id="pageSliderCounter">${counter}</span>`;
}

// The live viewer (verified 2026-06-16) uses unclassed page canvases inside
// #renderer > #viewport0/#viewport1, alongside `canvas.dummy` decoys and a
// #frontScreen transition canvas. Size-based detection keeps the two big page
// canvases and drops the small decoys without depending on class names/ids.
function mountLiveViewerFixture(counter = '1/13'): void {
    document.body.innerHTML = `
        <div id="viewer"><div id="renderer">
            <canvas class="dummy" width="300" height="150"></canvas>
            <div id="viewport0"><canvas width="2400" height="1794"></canvas></div>
            <div id="viewport1" class="currentScreen"><canvas width="2400" height="1794"></canvas></div>
            <div id="frontScreen"><canvas width="300" height="150"></canvas></div>
        </div></div>
        <span id="pageSliderCounter">${counter}</span>`;
}

// ComicWalker (カドコミ): a vertical-scroll reader with one large, persistent
// page canvas per page and NO page counter — only the known-host gate (mocked
// here) and the size filter qualify it. Class names are build-hashed, so
// detection must not depend on them.
function mountComicWalkerFixture(): void {
    document.body.innerHTML = `
        <img src="/cover.jpg" width="350" height="498">
        <div class="_pageWrapper_x1"><canvas class="_root_bx4cr_1" width="1284" height="1825"></canvas></div>
        <div class="_pageWrapper_x1"><canvas class="_root_bx4cr_1" width="1200" height="1600"></canvas></div>
        <canvas class="_uiSwatch_q9" width="32" height="32"></canvas>`;
}

function mountMokuroFixture(): HTMLElement {
    document.body.innerHTML = `
        <div data-mokuro-reader>
            <div data-page-index="6" style="width: 1080px; height: 1530px; background-image: url('blob:https://reader.mokuro.app/page-6'); background-size: contain;"></div>
        </div>`;
    const page = document.querySelector<HTMLElement>('[data-page-index="6"]')!;
    page.getBoundingClientRect = () => new DOMRect(32, 24, 681, 965);
    return page;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('canvas readers (BookWalker)', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    afterEach(() => {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
    });

    function stubBookWalkerCanvasContent(): void {
        let source: HTMLCanvasElement | undefined;
        const rich = canvasPixels(p => {
            const value = (p * 7) % 256;
            return [value, value, value, 255];
        });
        const blank = canvasPixels(() => [0, 0, 0, 255]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            drawImage(canvas: HTMLCanvasElement) { source = canvas; },
            getImageData: () => ({ data: source?.dataset.buffer === 'painted' ? rich : blank }),
        });
    }

    function canvasPixels(fill: (p: number) => [number, number, number, number]): Uint8ClampedArray {
        const data = new Uint8ClampedArray(20 * 20 * 4);
        for (let p = 0; p < 400; p += 1) {
            const [r, g, b, a] = fill(p);
            data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = a;
        }
        return data;
    }

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

    it('collects only the on-screen (.currentScreen) live viewer page canvas, skipping decoys + the off-screen buffer', () => {
        stubBookWalkerCanvasContent();
        mountLiveViewerFixture();
        expect(isCanvasReaderPage('viewer.bookwalker.jp')).toBe(true);
        const surfaces = collectCanvasReaderSurfaces('viewer.bookwalker.jp');
        // NFBR double-buffers the page across #viewport0 (off-screen) + #viewport1
        // (.currentScreen, on screen); both are page-sized. We keep ONLY the
        // current buffer so the off-screen page never costs a (shared-quota) Lens
        // call or stacks a stale overlay over the current page. The 300×150 .dummy
        // and #frontScreen decoys are dropped by the size floor.
        expect(surfaces).toHaveLength(1);
        expect(surfaces[0]?.closest('#viewport1')).not.toBeNull();
        expect(surfaces.some(c => c.classList.contains('dummy'))).toBe(false);
        expect(surfaces.every(c => c.width >= 600 && c.height >= 600)).toBe(true);
    });

    it('falls back to a painted sibling when the current live viewer buffer is blank', () => {
        stubBookWalkerCanvasContent();
        document.body.innerHTML = `
            <div id="renderer">
                <div id="viewport0"><canvas data-buffer="painted" width="2400" height="1794"></canvas></div>
                <div id="viewport1" class="currentScreen"><canvas data-buffer="blank" width="2400" height="1794"></canvas></div>
            </div>
            <span id="pageSliderCounter">2/13</span>`;

        const surfaces = collectCanvasReaderSurfaces('viewer.bookwalker.jp');

        expect(surfaces).toHaveLength(1);
        expect(surfaces[0]?.dataset.buffer).toBe('painted');
    });

    it('keeps every live viewer page canvas before a buffer is marked current (e.g. the cover)', () => {
        // Before NFBR marks an on-screen buffer, no canvas carries .currentScreen;
        // we must not drop the page, so all page-shaped canvases are kept.
        document.body.innerHTML = `
            <div id="renderer">
                <canvas class="dummy" width="300" height="150"></canvas>
                <div id="viewport0"><canvas width="2400" height="1794"></canvas></div>
                <div id="viewport1"><canvas width="2400" height="1794"></canvas></div>
            </div>
            <span id="pageSliderCounter">1/13</span>`;
        const surfaces = collectCanvasReaderSurfaces('viewer.bookwalker.jp');
        expect(surfaces).toHaveLength(2);
        expect(surfaces.every(c => c.width >= 600 && c.height >= 600)).toBe(true);
    });

    it('follows .currentScreen across a page turn and refreshes the page signature', () => {
        stubBookWalkerCanvasContent();
        mountLiveViewerFixture('6/13');
        const before = collectCanvasReaderSurfaces('viewer.bookwalker.jp');
        expect(before).toHaveLength(1);
        expect(before[0]?.closest('#viewport1')).not.toBeNull();
        const beforeSignature = canvasReaderPageSignature();

        // NFBR turns the page by swapping which #viewport carries .currentScreen
        // and advancing the counter; the on-screen canvas must move with it.
        document.querySelector('#viewport1')!.classList.remove('currentScreen');
        document.querySelector('#viewport0')!.classList.add('currentScreen');
        document.querySelector('#pageSliderCounter')!.textContent = '7/13';

        const after = collectCanvasReaderSurfaces('viewer.bookwalker.jp');
        expect(after).toHaveLength(1);
        expect(after[0]?.closest('#viewport0')).not.toBeNull();
        expect(after[0]).not.toBe(before[0]);
        // Signature must change so the controller releases stale frames + re-OCRs.
        expect(canvasReaderPageSignature()).not.toBe(beforeSignature);
    });

    it('keeps vertically stacked visible BookWalker pages instead of collapsing to one currentScreen', () => {
        document.body.innerHTML = `
            <div id="renderer">
                <div id="viewport0" class="currentScreen"><canvas width="1600" height="2260"></canvas></div>
                <div id="viewport1"><canvas width="1600" height="2260"></canvas></div>
            </div>
            <span id="pageSliderCounter">1/13</span>`;
        const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas')];
        canvases[0]!.getBoundingClientRect = () => new DOMRect(120, 24, 420, 594);
        canvases[1]!.getBoundingClientRect = () => new DOMRect(120, 650, 420, 594);

        const surfaces = collectCanvasReaderSurfaces('viewer.bookwalker.jp');

        expect(surfaces).toEqual(canvases);
    });

    it('collects explicit scanned PDF canvas OCR opt-in surfaces on generic hosts', () => {
        document.body.innerHTML = `
            <section class="pdf-page" data-yomu-canvas-ocr="on">
                <canvas width="595" height="842" data-yomu-canvas-ocr="on"></canvas>
            </section>`;
        const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;

        expect(collectCanvasReaderSurfaces('hrussellzfac023.github.io')).toEqual([canvas]);
    });

    it('does not select both buffers if .currentScreen sits on a shared ancestor (#renderer)', () => {
        // Hardening: a future DOM that marked the shared #renderer ancestor with
        // .currentScreen must NOT match both viewport canvases via closest().
        document.body.innerHTML = `
            <div id="renderer" class="currentScreen">
                <div id="viewport0"><canvas width="2400" height="1794"></canvas></div>
                <div id="viewport1"><canvas width="2400" height="1794"></canvas></div>
            </div>
            <span id="pageSliderCounter">1/13</span>`;
        // Neither #viewport carries .currentScreen, so we fall back to all page
        // canvases (safe) rather than OCR'ing both because of the ancestor match.
        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toHaveLength(2);
    });

    it('recognises known canvas-reader hosts', () => {
        expect(isKnownCanvasReaderHost('comic-walker.com')).toBe(true);
        expect(isKnownCanvasReaderHost('viewer.bookwalker.jp')).toBe(true);
        expect(isKnownCanvasReaderHost('example.com')).toBe(false);
        expect(isKnownCanvasReaderHost('comic-walker.com.evil.com')).toBe(false);
    });

    it('collects ComicWalker-style hashed-class page canvases on a known host (no counter)', () => {
        mountComicWalkerFixture();
        // No page counter: detection relies purely on the known-host gate, passed
        // explicitly so the test does not depend on jsdom's location.
        expect(isCanvasReaderPage('comic-walker.com')).toBe(true);
        expect(isCanvasReaderPage('example.com')).toBe(false); // no host, no counter → off
        const surfaces = collectCanvasReaderSurfaces('comic-walker.com');
        // Both 1284×1825 / 1200×1600 page canvases; never the 32×32 UI swatch.
        expect(surfaces).toHaveLength(2);
        expect(surfaces.every(c => c.width >= 600)).toBe(true);
    });

    it('recognises Mokuro CSS background pages as raster reader surfaces', () => {
        const page = mountMokuroFixture();
        expect(isKnownBackgroundImageReaderHost('reader.mokuro.app')).toBe(true);
        expect(isKnownBackgroundImageReaderHost('example.com')).toBe(false);
        expect(backgroundImageReaderUrl(page)).toBe('blob:https://reader.mokuro.app/page-6');
        expect(isBackgroundImageReaderPage('reader.mokuro.app')).toBe(true);
        expect(isReaderRasterPage('reader.mokuro.app')).toBe(true);
        expect(collectBackgroundImageReaderSurfaces('reader.mokuro.app')).toEqual([page]);
    });

    it('starts raster polling on known reader hosts before a page surface is mounted', () => {
        expect(isCanvasReaderPage('viewer.bookwalker.jp')).toBe(false);
        expect(isBackgroundImageReaderPage('reader.mokuro.app')).toBe(false);
        expect(isReaderRasterPage('viewer.bookwalker.jp')).toBe(true);
        expect(isReaderRasterPage('reader.mokuro.app')).toBe(true);
    });

    it('changes the page signature when the counter advances (re-snapshot trigger)', () => {
        mountViewerFixture('1 / 3');
        const first = canvasReaderPageSignature();
        document.querySelector('#pageSliderCounter')!.textContent = '2 / 3';
        expect(canvasReaderPageSignature()).not.toBe(first);
    });

    it('keeps the page signature stable when same-page canvas surface detection flickers', () => {
        mountViewerFixture('1 / 3');
        const first = canvasReaderPageSignature();
        document.querySelector('#wideScreen0')!.insertAdjacentHTML(
            'beforeend',
            '<canvas class="default" width="800" height="1130"></canvas>',
        );

        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toHaveLength(2);
        expect(canvasReaderPageSignature()).toBe(first);
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

// Generic detection: an UNKNOWN host with no page counter must clear all three
// gates — page shape, viewport prominence, and rendered-image content — before a
// canvas is treated as a manga page. jsdom ships no canvas 2D context or layout,
// so we stub getContext (for the content sniff) and getBoundingClientRect (for
// prominence). jsdom's viewport is 1024×768.
describe('canvas readers (generic, unknown host)', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    function stubContextPixels(pixels: Uint8ClampedArray): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            drawImage() { /* noop */ },
            getImageData: () => ({ data: pixels }),
        });
    }
    function pixels(fill: (p: number) => [number, number, number, number]): Uint8ClampedArray {
        const data = new Uint8ClampedArray(20 * 20 * 4);
        for (let p = 0; p < 400; p++) {
            const [r, g, b, a] = fill(p);
            data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = b; data[p * 4 + 3] = a;
        }
        return data;
    }
    const richImage = () => pixels(p => { const v = (p * 7) % 256; return [v, v, v, 255]; });   // high contrast, many bands
    const flatImage = () => pixels(() => [128, 128, 128, 255]);                                  // solid grey UI canvas
    const transparentImage = () => pixels(p => { const v = (p * 7) % 256; return [v, v, v, 0]; }); // overlay/sprite

    function mountCanvas(bufferW: number, bufferH: number, renderedW: number, renderedH: number): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        canvas.width = bufferW; canvas.height = bufferH;
        canvas.getBoundingClientRect = () => ({
            width: renderedW, height: renderedH, left: 0, top: 0, right: renderedW, bottom: renderedH, x: 0, y: 0, toJSON() { /* noop */ },
        } as DOMRect);
        document.body.appendChild(canvas);
        return canvas;
    }

    afterEach(() => {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        document.body.innerHTML = '';
    });

    it('detects a prominent, image-bearing page canvas on an unknown host', () => {
        stubContextPixels(richImage());
        mountCanvas(1200, 1680, 900, 1260);
        expect(isCanvasReaderPage('example.com')).toBe(true);
        expect(collectCanvasReaderSurfaces('example.com')).toHaveLength(1);
    });

    it('rejects a page-shaped image canvas that is not viewport-prominent (e.g. a thumbnail)', () => {
        stubContextPixels(richImage());
        mountCanvas(1200, 1680, 240, 336);
        expect(isCanvasReaderPage('example.com')).toBe(false);
    });

    it('rejects a prominent canvas whose content is flat/non-image (UI, chart, blank)', () => {
        stubContextPixels(flatImage());
        mountCanvas(1200, 1680, 900, 1260);
        expect(isCanvasReaderPage('example.com')).toBe(false);
    });

    it('rejects a prominent but mostly-transparent overlay canvas', () => {
        stubContextPixels(transparentImage());
        mountCanvas(1200, 1680, 900, 1260);
        expect(isCanvasReaderPage('example.com')).toBe(false);
    });

    it('rejects a sub-threshold canvas regardless of content', () => {
        stubContextPixels(richImage());
        mountCanvas(400, 560, 400, 560);
        expect(isCanvasReaderPage('example.com')).toBe(false);
    });

    // looksLikeRenderedCanvasImage powers the prefetch skip-blank gate: ComicWalker
    // pre-creates one <canvas> per page but only paints the ones near the
    // viewport, leaving the rest blank. Snapshotting a blank page wastes an OCR
    // call, so the controller skips canvases that have not rendered yet.
    it('treats a painted page canvas as rendered content', () => {
        stubContextPixels(richImage());
        expect(looksLikeRenderedCanvasImage(mountCanvas(1200, 1680, 900, 1260))).toBe(true);
    });

    it('fingerprints rendered canvas content so transition frames can wait for stability', () => {
        const canvas = mountCanvas(1200, 1680, 900, 1260);
        stubContextPixels(richImage());
        const first = canvasRenderedContentSignature(canvas);
        stubContextPixels(pixels(p => {
            const v = (255 - (p * 5)) % 256;
            return [v, v, v, 255];
        }));

        expect(first).toBeTruthy();
        expect(canvasRenderedContentSignature(canvas)).not.toBe(first);
    });

    it('treats a blank/un-painted page canvas as having no content (skip prefetch)', () => {
        const blank = () => pixels(() => [0, 0, 0, 255]); // ComicWalker's not-yet-decoded page
        stubContextPixels(blank());
        expect(looksLikeRenderedCanvasImage(mountCanvas(1200, 1680, 900, 1260))).toBe(false);
    });
});
