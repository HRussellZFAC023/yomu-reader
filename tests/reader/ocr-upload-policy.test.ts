import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { OcrProvider } from '../../src/reader/app/types';
import { allowSyntheticReaderInteractionsForTests } from '../../src/reader/ui/trusted-interaction';
import { dispatchPointerEvent } from './helpers/browser-fixtures';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';
import { ocrToken as token } from './helpers/japanese-token-fixtures';
import { waitForExpect } from './test-utils';

// Owner decision 4: a cloud OCR provider reads an image only after a tap. The
// default install (Google Lens, "read images automatically" on) on a page that
// looks like reading material must send nothing on load or when a mouse passes
// over an image; one press sends exactly that image. The learner's own OCR
// service keeps reading on load and on hover.

const RESULT: OcrResult = {
    width: 1000,
    height: 600,
    lines: [{ text: '日本語を読む', box: { left: 100, top: 120, width: 300, height: 80 }, vertical: false }],
};

function makeImage(): HTMLImageElement {
    const image = document.createElement('img');
    image.src = '/page-1.png';
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
    Object.defineProperty(image, 'complete', { configurable: true, value: true });
    image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
    return image;
}

function makeController(ocrProvider: OcrProvider) {
    const recognize = vi.fn(async () => RESULT);
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrProvider,
            ocrShowTextOverlay: false,
            ocrMinImageArea: 1,
            ocrMaxImagesPerPage: 5,
            ocrPrefetchMargin: 1000,
        }),
        parseJapanese: vi.fn(async (text: string) => [token(text)]),
        onToast: vi.fn(),
        shouldAutoScan: () => true,
    });
    (controller as unknown as { recognizeImage: typeof recognize }).recognizeImage = recognize;
    return { controller, recognize };
}

const settle = () => vi.advanceTimersByTimeAsync(1200);

afterEach(() => {
    allowSyntheticReaderInteractionsForTests(false);
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('cloud OCR waits for a tap', () => {
    it('sends nothing to Google Lens on load or hover, and one image on a press', async () => {
        vi.useFakeTimers();

        stubInstantIntersectionObserver();
        const image = makeImage();
        document.body.replaceChildren(image);
        const { controller, recognize } = makeController('google-lens');
        try {
            controller.init();
            allowSyntheticReaderInteractionsForTests(true);
            dispatchPointerEvent(image, 'pointerover', { clientX: 100, clientY: 100 });
            dispatchPointerEvent(image, 'pointermove', { clientX: 120, clientY: 110 });
            await settle();
            expect(recognize).not.toHaveBeenCalled();

            dispatchPointerEvent(image, 'pointerdown', { clientX: 120, clientY: 110 });
            await waitForExpect(() => expect(document.querySelectorAll('.jpdb-ocr-line').length).toBeGreaterThan(0));
            expect(recognize).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('lets the learner OCR service read on load', async () => {
        vi.useFakeTimers();

        stubInstantIntersectionObserver();
        document.body.replaceChildren(makeImage());
        const { controller, recognize } = makeController('local-service');
        try {
            controller.init();
            await waitForExpect(() => expect(recognize).toHaveBeenCalledTimes(1));
        } finally {
            controller.destroy();
        }
    });
});
