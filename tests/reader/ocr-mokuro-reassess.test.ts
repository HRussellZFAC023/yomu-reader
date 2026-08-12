import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';
import { ocrToken as token } from './helpers/japanese-token-fixtures';
import { waitForExpect } from './test-utils';
import { privateRasterImageForHost } from '../../src/reader/ocr/private-raster-presenter';

// mokuro's own "OCR enabled" toggle flips the reader between deferring to
// mokuro's text layer (on) and running its own image OCR (off). The reader
// learns about the flip out-of-band (it is not a reader setting) and calls
// controller.reassessAutoScan(). These tests pin what that does to overlays the
// reader has already painted: auto-painted ones are dropped (so they stop
// competing with mokuro's text boxes — the reported bug), but a panel the user
// scanned by hand is kept, and turning mokuro OCR off starts a fresh scan.

function makeImage(src: string): HTMLImageElement {
    const image = document.createElement('img');
    image.src = src;
    image.width = 500;
    image.height = 300;
    image.style.display = 'block';
    image.style.width = '500px';
    image.style.height = '300px';
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
    Object.defineProperty(image, 'complete', { configurable: true, value: true });
    Object.defineProperty(image, 'offsetWidth', { configurable: true, value: 500 });
    Object.defineProperty(image, 'offsetHeight', { configurable: true, value: 300 });
    image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
    return image;
}

const RESULT: OcrResult = {
    width: 1000,
    height: 600,
    lines: [{ text: '日本語を読む', box: { left: 100, top: 120, width: 300, height: 80 }, vertical: false }],
};

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

function makeController(shouldAutoScan: () => boolean, settings: Partial<ReaderSettings> = {}): ImageOcrController {
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrShowTextOverlay: false,
            ocrMinImageArea: 1,
            ocrMaxImagesPerPage: 30,
            ocrPrefetchMargin: 1000,
            ...settings,
        }),
        parseJapanese: vi.fn(async (text: string) => [token(text)]),
        onToast: vi.fn(),
        shouldAutoScan,
    });
    // Test seam: skip the network recognizer and return a fixed result.
    (controller as unknown as { recognizeImage: () => Promise<OcrResult> }).recognizeImage = vi.fn(async () => RESULT);
    return controller;
}

function controlledResult(): { promise: Promise<OcrResult>; resolve: () => void } {
    let resolvePromise!: (result: OcrResult) => void;
    return {
        promise: new Promise<OcrResult>(resolve => { resolvePromise = resolve; }),
        resolve: () => resolvePromise(RESULT),
    };
}

function scanImage(controller: ImageOcrController, image: HTMLImageElement): Promise<void> {
    return (controller as unknown as { scanImage: (target: HTMLImageElement) => Promise<void> }).scanImage(image);
}

function stubMokuroLocation(): void {
    vi.stubGlobal('location', {
        hostname: 'reader.mokuro.app',
        href: 'https://reader.mokuro.app/reader/example',
        origin: 'https://reader.mokuro.app',
        pathname: '/reader/example',
        protocol: 'https:',
    });
}

function makeMokuroBackgroundPage(): HTMLElement {
    const page = document.createElement('div');
    page.dataset.pageIndex = '1';
    page.style.width = '1080px';
    page.style.height = '1530px';
    page.style.backgroundImage = 'url("blob:https://reader.mokuro.app/page-1")';
    page.style.backgroundSize = 'contain';
    page.getBoundingClientRect = () => new DOMRect(24, 18, 681, 965);
    document.body.append(page);
    return page;
}

describe('OCR reassessAutoScan (mokuro OCR toggle)', () => {
    it('drops auto-painted overlays when the page starts providing its own text layer', async () => {
        let defer = false; // mokuro OCR off → reader scans
        const controller = makeController(() => !defer);
        const image = makeImage('/page-1.png');
        document.body.replaceChildren(image);
        try {
            await scanImage(controller, image);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0);
            // user turns mokuro OCR on → reader must stop competing with mokuro's text
            defer = true;
            controller.reassessAutoScan();
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
        } finally {
            controller.destroy();
        }
    });

    it('keeps a manually-scanned panel when deferring to the native text layer', async () => {
        stubInstantIntersectionObserver();
        const controller = makeController(() => false); // always deferring (mokuro OCR on)
        document.body.replaceChildren(makeImage('/page-1.png'));
        try {
            controller.init();
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0); // no auto scan while deferring
            await controller.scanVisible(); // user scans a panel by hand
            await waitForExpect(() => expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0));
            controller.reassessAutoScan(); // still deferring
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0); // manual panel survives
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('starts scanning when the native text layer turns off', async () => {
        stubInstantIntersectionObserver();
        let defer = true; // mokuro OCR on → reader idle
        const controller = makeController(() => !defer);
        document.body.replaceChildren(makeImage('/page-1.png'));
        try {
            controller.init();
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
            // user turns mokuro OCR off → reader should OCR the page itself
            defer = false;
            controller.reassessAutoScan();
            await waitForExpect(() => expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0));
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not paint an auto OCR result that completes after mokuro OCR turns on', async () => {
        let defer = false; // mokuro OCR off → reader scans
        const controller = makeController(() => !defer);
        const pending = controlledResult();
        (controller as unknown as { recognizeImage: () => Promise<OcrResult> }).recognizeImage = vi.fn(() => pending.promise);
        const image = makeImage('/page-1.png');
        document.body.replaceChildren(image);
        try {
            const scan = scanImage(controller, image);
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(1);
            defer = true;
            controller.reassessAutoScan();
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            pending.resolve();
            await scan;
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
        } finally {
            controller.destroy();
        }
    });

    it('clears stale OCR lines and status when an image content key changes', async () => {
        const controller = makeController(() => true, { ocrShowTextOverlay: true });
        const image = makeImage('/page-1.png');
        image.dataset.ocrContentKey = 'page-1';
        document.body.replaceChildren(image);
        try {
            await scanImage(controller, image);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0);
            expect(document.querySelector('.jpdb-ocr-video-frame-status-ready')).not.toBeNull();

            image.dataset.ocrContentKey = 'page-2';
            image.dispatchEvent(new Event('load'));

            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
            expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('does not paint an OCR result that completes after the image content key changes', async () => {
        const controller = makeController(() => true, { ocrShowTextOverlay: true });
        const pending = controlledResult();
        (controller as unknown as { recognizeImage: () => Promise<OcrResult> }).recognizeImage = vi.fn(() => pending.promise);
        const image = makeImage('/page-1.png');
        image.dataset.ocrContentKey = 'page-1';
        document.body.replaceChildren(image);
        try {
            const scan = scanImage(controller, image);
            await waitForExpect(() => expect(document.querySelector('.jpdb-ocr-video-frame-status-loading')).not.toBeNull());

            image.dataset.ocrContentKey = 'page-2';
            image.dispatchEvent(new Event('load'));
            pending.resolve();
            await scan;

            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
            expect(document.querySelector('.jpdb-ocr-video-frame-status-ready')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('does not repaint a cached auto OCR result while mokuro OCR is on', async () => {
        let defer = false; // mokuro OCR off → reader scans
        const controller = makeController(() => !defer);
        const image = makeImage('/page-1.png');
        document.body.replaceChildren(image);
        try {
            await scanImage(controller, image);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0);
            defer = true;
            controller.reassessAutoScan();
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            await scanImage(controller, image);
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
        } finally {
            controller.destroy();
        }
    });

    it('drops auto-painted Mokuro CSS background OCR frames when mokuro OCR turns on', async () => {
        stubMokuroLocation();
        let defer = false; // mokuro OCR off → reader scans background pages
        makeMokuroBackgroundPage();
        const controller = makeController(() => !defer, { ocrProvider: 'local-service' });
        try {
            controller.init();
            await waitForExpect(() => expect(document.querySelector('.jpdb-ocr-background-frame')).not.toBeNull());
            await scanImage(controller, privateRasterImageForHost(document.querySelector('.jpdb-ocr-background-frame'))!);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0);

            defer = true;
            controller.reassessAutoScan();
            expect(document.querySelectorAll('.jpdb-ocr-background-frame').length).toBe(0);
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
        } finally {
            controller.destroy();
        }
    });
});
