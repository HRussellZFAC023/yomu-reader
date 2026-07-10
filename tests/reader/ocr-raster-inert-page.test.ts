import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import {
    collectBackgroundImageReaderSurfaces,
    isBackgroundImageReaderPage,
    mutationsMayAddReaderRasterCandidate,
} from '../../src/reader/ocr/canvas-readers';

import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import { waitForExpect } from './test-utils';

// Class-H heat profile (2026-07-10): a YouTube watch page holds hundreds of
// `[style*="background-image"]` thumbnail tiles and ZERO reader raster
// surfaces, yet every viewport shift and mutation re-arm swept them all and
// forced a layout per tile (~0.6% of a core, 104 re-arms/75s). These tests pin
// the inert path: decorative tiles are rejected from layout-free facts alone,
// the page-level raster-free verdict is memoized, and the memo is invalidated
// the moment a genuine raster candidate enters the DOM — including via full
// <body> replacement and cross-realm adopted nodes.

const originalGetContext = HTMLCanvasElement.prototype.getContext;

function mountThumbnailFeed(count = 40): void {
    document.body.innerHTML = Array.from({ length: count }, (_, index) =>
        `<div style="width:320px;height:180px;background-image:url('https://i.ytimg.com/vi/${index}/hq720.jpg');"></div>`,
    ).join('');
}

function createController(): ImageOcrController {
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrMinImageArea: 1,
        } as ReaderSettings),
        parseJapanese: vi.fn(async () => []),
        onToast: vi.fn(),
    });
    controller.init();
    return controller;
}

function forcedOcrCanvasHost(): HTMLElement {
    const host = document.createElement('div');
    host.setAttribute('data-yomu-canvas-ocr', 'on');
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    host.append(canvas);
    return host;
}

type RasterProbe = {
    hasReaderRasterSurfaces(): boolean;
    readerRasterPoll: number;
};

function probe(controller: ImageOcrController): RasterProbe {
    return controller as unknown as RasterProbe;
}

let activeController: ImageOcrController | undefined;

afterEach(() => {
    activeController?.destroy();
    activeController = undefined;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('OCR raster detection stays inert on non-reader pages', () => {
    it('rejects decorative background-image tiles without a single forced layout or style read', () => {
        mountThumbnailFeed();
        const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
        const styleSpy = vi.spyOn(window, 'getComputedStyle');
        expect(collectBackgroundImageReaderSurfaces('www.youtube.com')).toEqual([]);
        expect(isBackgroundImageReaderPage('www.youtube.com')).toBe(false);
        expect(rectSpy).not.toHaveBeenCalled();
        expect(styleSpy).not.toHaveBeenCalled();
    });

    it('memoizes the raster-free page verdict: repeated surface checks run no sweep and no layout', () => {
        mountThumbnailFeed();
        activeController = createController();
        const controller = probe(activeController);
        expect(controller.hasReaderRasterSurfaces()).toBe(false);
        const querySpy = vi.spyOn(document, 'querySelectorAll');
        const singleQuerySpy = vi.spyOn(document, 'querySelector');
        const rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
        for (let repeat = 0; repeat < 5; repeat += 1) {
            expect(controller.hasReaderRasterSurfaces()).toBe(false);
        }
        expect(querySpy).not.toHaveBeenCalled();
        expect(singleQuerySpy).not.toHaveBeenCalled();
        expect(rectSpy).not.toHaveBeenCalled();
    });

    it('invalidates the memo when a genuine raster candidate is added after the free verdict', async () => {
        mountThumbnailFeed();
        activeController = createController();
        const controller = probe(activeController);
        expect(controller.hasReaderRasterSurfaces()).toBe(false);
        document.body.append(forcedOcrCanvasHost());
        await waitForExpect(() => expect(controller.hasReaderRasterSurfaces()).toBe(true));
    });

    it('drives the PUBLIC mutation pipeline: an added surface starts the reader raster poll with no probe call', async () => {
        // Observer callback -> memo invalidation -> scheduleRefresh -> refresh
        // -> sweep -> startReaderRasterPollingIfNeeded. Nothing here calls the
        // private detector; the poll starting proves the whole re-arm path
        // works after memoization.
        mountThumbnailFeed();
        activeController = createController();
        const controller = probe(activeController);
        expect(controller.readerRasterPoll).toBe(0);
        document.body.append(forcedOcrCanvasHost());
        await waitForExpect(() => expect(controller.readerRasterPoll).not.toBe(0));
    });

    it('invalidates the memo when an SPA replaces <body> wholesale with a reader surface', async () => {
        // A body-scoped observer receives ZERO records for body replacement;
        // the observer must live on the root element or the stale free memo
        // survives every scroll/resize/refresh until navigation.
        mountThumbnailFeed();
        activeController = createController();
        const controller = probe(activeController);
        expect(controller.hasReaderRasterSurfaces()).toBe(false);
        const replacement = document.createElement('body');
        replacement.append(forcedOcrCanvasHost());
        document.documentElement.replaceChild(replacement, document.body);
        await waitForExpect(() => expect(controller.hasReaderRasterSurfaces()).toBe(true));
    });

    it('re-detects a placeholder canvas resized to page shape (width/height mutation only)', async () => {
        // Some viewers boot with a default 300x150 canvas and only later size the
        // backing store; the resize is the ONLY DOM signal, so it must invalidate.
        const richPixels = new Uint8ClampedArray(20 * 20 * 4);
        for (let pixel = 0; pixel < 400; pixel += 1) {
            const value = (pixel * 7) % 256;
            richPixels[pixel * 4] = value;
            richPixels[pixel * 4 + 1] = value;
            richPixels[pixel * 4 + 2] = value;
            richPixels[pixel * 4 + 3] = 255;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            drawImage() { /* noop */ },
            getImageData: () => ({ data: richPixels }),
        });
        const canvas = document.createElement('canvas');
        canvas.getBoundingClientRect = () => new DOMRect(0, 0, 900, 1260);
        document.body.append(canvas);
        activeController = createController();
        const controller = probe(activeController);
        expect(controller.hasReaderRasterSurfaces()).toBe(false);
        canvas.width = 1200;
        canvas.height = 1680;
        await waitForExpect(() => expect(controller.hasReaderRasterSurfaces()).toBe(true));
    });

    it('regains the O(1) free verdict after a transient page-shaped canvas is removed', async () => {
        // A splash/chart canvas must not disable the memo for the rest of the
        // page's life: its removal re-censuses back to "free".
        mountThumbnailFeed();
        const splash = document.createElement('canvas');
        splash.width = 1920;
        splash.height = 1080;
        document.body.append(splash);
        activeController = createController();
        const controller = probe(activeController);
        expect(controller.hasReaderRasterSurfaces()).toBe(false);
        splash.remove();
        // Wait for the observer to deliver the removal, then let one check
        // re-census before pinning the O(1) path.
        await waitForExpect(() => {
            expect(controller.hasReaderRasterSurfaces()).toBe(false);
            const querySpy = vi.spyOn(document, 'querySelectorAll');
            try {
                expect(controller.hasReaderRasterSurfaces()).toBe(false);
                expect(querySpy).not.toHaveBeenCalled();
            } finally {
                querySpy.mockRestore();
            }
        });
    });

    it('matcher is realm-neutral: accepts a canvas whose constructors are from another realm', () => {
        // A canvas created in a same-origin iframe and adopted into this
        // document is not `instanceof` this realm's HTMLCanvasElement; the
        // matcher must still recognise it or the census and the invalidator
        // disagree and a stale free verdict survives the adoption.
        const foreignCanvas = { nodeType: Node.ELEMENT_NODE, localName: 'canvas' } as unknown as Node;
        const record = {
            type: 'childList',
            addedNodes: [foreignCanvas],
            removedNodes: [],
        } as unknown as MutationRecord;
        expect(mutationsMayAddReaderRasterCandidate([record])).toBe(true);
    });
});
