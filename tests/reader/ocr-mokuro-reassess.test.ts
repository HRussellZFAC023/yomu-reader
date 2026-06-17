import { describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';
import { waitForExpect } from './test-utils';

// mokuro's own "OCR enabled" toggle flips the reader between deferring to
// mokuro's text layer (on) and running its own image OCR (off). The reader
// learns about the flip out-of-band (it is not a reader setting) and calls
// controller.reassessAutoScan(). These tests pin what that does to overlays the
// reader has already painted: auto-painted ones are dropped (so they stop
// competing with mokuro's text boxes — the reported bug), but a panel the user
// scanned by hand is kept, and turning mokuro OCR off starts a fresh scan.

function token(sentence: string): JPDBToken {
    const card: JPDBCard = {
        vid: 1, sid: 1, rid: 1, spelling: '日本語', reading: 'にほんご', frequencyRank: 1,
        partOfSpeech: ['n'], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null,
    };
    return { card, start: 0, end: 3, length: 3, rubies: [], pitchClass: 'unknown', sentence };
}

function makeImage(src: string): HTMLImageElement {
    const image = document.createElement('img');
    image.src = src;
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
    Object.defineProperty(image, 'complete', { configurable: true, value: true });
    image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
    return image;
}

const RESULT: OcrResult = {
    width: 1000,
    height: 600,
    lines: [{ text: '日本語を読む', box: { left: 100, top: 120, width: 300, height: 80 }, vertical: false }],
};

function makeController(shouldAutoScan: () => boolean, settings: Partial<ReaderSettings> = {}): ImageOcrController {
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrShowTextOverlay: false,
            ocrMinImageArea: 1,
            ocrMaxImagesPerPage: 30,
            ocrPrefetchMargin: 0,
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

describe('OCR reassessAutoScan (mokuro OCR toggle)', () => {
    it('drops auto-painted overlays when the page starts providing its own text layer', async () => {
        stubInstantIntersectionObserver();
        let defer = false; // mokuro OCR off → reader scans
        const controller = makeController(() => !defer);
        document.body.replaceChildren(makeImage('/page-1.png'));
        try {
            controller.init();
            await waitForExpect(() => expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0));
            // user turns mokuro OCR on → reader must stop competing with mokuro's text
            defer = true;
            controller.reassessAutoScan();
            expect(document.querySelectorAll('.jpdb-ocr-layer').length).toBe(0);
            expect(document.querySelectorAll('.jpdb-ocr-line').length).toBe(0);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
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
});
