import { describe, expect, it, vi } from 'vitest';

import { isDecodedImage, OcrDecodeGate } from '../../src/reader/ocr/ocr-decode-gate';

// An <img> with a layout box but no decoded pixels drew as a blank canvas, so
// 2.1.x sent a blank JPEG to Lens and then read the image again once it loaded.

function loadingImage(): HTMLImageElement {
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 0, configurable: true });
    return image;
}

function finishLoading(image: HTMLImageElement, event: 'load' | 'error', size = 640): void {
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    Object.defineProperty(image, 'naturalWidth', { value: event === 'load' ? size : 0, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: event === 'load' ? size : 0, configurable: true });
    image.dispatchEvent(new Event(event));
}

describe('OCR decode gate', () => {
    it('reads an image only once its pixels are decoded', () => {
        const image = loadingImage();
        expect(isDecodedImage(image)).toBe(false);
        finishLoading(image, 'load');
        expect(isDecodedImage(image)).toBe(true);
    });

    it('keeps a tap on a loading image and hands it over once, when it decodes', () => {
        const onDecoded = vi.fn();
        const gate = new OcrDecodeGate(onDecoded);
        const image = loadingImage();
        gate.hold(image, false);
        gate.hold(image, true);
        gate.hold(image, false);
        expect(onDecoded).not.toHaveBeenCalled();
        finishLoading(image, 'load');
        expect(onDecoded).toHaveBeenCalledTimes(1);
        expect(onDecoded).toHaveBeenCalledWith(image, true);
        image.dispatchEvent(new Event('load'));
        expect(onDecoded).toHaveBeenCalledTimes(1);
    });

    it('never reads an image that failed to load', () => {
        const onDecoded = vi.fn();
        const gate = new OcrDecodeGate(onDecoded);
        const image = loadingImage();
        gate.hold(image, true);
        finishLoading(image, 'error');
        expect(onDecoded).not.toHaveBeenCalled();
    });
});
