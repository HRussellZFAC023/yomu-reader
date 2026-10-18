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
        gate.hold(image, 'auto');
        gate.hold(image, 'press');
        gate.hold(image, 'hover');
        expect(onDecoded).not.toHaveBeenCalled();
        finishLoading(image, 'load');
        expect(onDecoded).toHaveBeenCalledTimes(1);
        expect(onDecoded).toHaveBeenCalledWith(image, 'press');
        image.dispatchEvent(new Event('load'));
        expect(onDecoded).toHaveBeenCalledTimes(1);
    });

    it('keeps a pointer passing over a loading image apart from a press', () => {
        const onDecoded = vi.fn();
        const gate = new OcrDecodeGate(onDecoded);
        const image = loadingImage();
        gate.hold(image, 'auto');
        gate.hold(image, 'hover');
        finishLoading(image, 'load');
        expect(onDecoded).toHaveBeenCalledWith(image, 'hover');
    });

    it('never reads an image that failed to load', () => {
        const onDecoded = vi.fn();
        const gate = new OcrDecodeGate(onDecoded);
        const image = loadingImage();
        gate.hold(image, 'press');
        finishLoading(image, 'error');
        expect(onDecoded).not.toHaveBeenCalled();
    });
});
