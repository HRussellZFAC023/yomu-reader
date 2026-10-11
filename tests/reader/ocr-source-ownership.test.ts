import { createPrivateRasterImage, privateRasterHost, releasePrivateRasterImage } from '../../src/reader/ocr/private-raster-presenter';
import { afterEach, describe, expect, it } from 'vitest';
import { isImageVisibleForOcr } from '../../src/reader/ocr/surface-visibility';
import { ocrPointerImage } from '../../src/reader/ocr/pointer-targets';

const pointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
const stackDescriptor = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
const box = () => new DOMRect(20, 80, 500, 300);

function image(): HTMLImageElement {
    const element = document.createElement('img');
    element.getBoundingClientRect = box;
    document.body.append(element);
    return element;
}

afterEach(() => {
    document.body.replaceChildren();
    for (const [name, descriptor] of [['elementFromPoint', pointDescriptor], ['elementsFromPoint', stackDescriptor]] as const) {
        if (descriptor) Object.defineProperty(document, name, descriptor);
        else delete (document as unknown as Record<string, unknown>)[name];
    }
});

describe('OCR source ownership', () => {
    it('keeps an intentionally invisible private capture readable while respecting its page host', () => {
        const capture = createPrivateRasterImage('jpdb-ocr-canvas-frame');
        const host = privateRasterHost(capture);
        host.style.opacity = '0';
        const wrapper = document.createElement('div');
        wrapper.append(host);
        document.body.append(wrapper);
        capture.getBoundingClientRect = box;
        try {
            expect(isImageVisibleForOcr(capture, box())).toBe(true);
            wrapper.hidden = true;
            expect(isImageVisibleForOcr(capture, box())).toBe(false);
        } finally { releasePrivateRasterImage(capture); }
    });

    it('withdraws the layer and corner mark when a scanned source is hidden', () => {
        const source = image();
        const wrapper = document.createElement('div');
        document.body.append(wrapper);
        wrapper.append(source);
        expect(isImageVisibleForOcr(source, box())).toBe(true);
        wrapper.style.display = 'none';
        expect(isImageVisibleForOcr(source, box())).toBe(false);
        wrapper.style.display = '';
        wrapper.setAttribute('aria-hidden', 'true');
        expect(isImageVisibleForOcr(source, box())).toBe(false);
    });

    it.each([-600, 2000])('hides a carousel copy parked horizontally at %s', left => {
        expect(isImageVisibleForOcr(image(), new DOMRect(left, 80, 500, 300))).toBe(false);
    });

    it('gives an overlapping full-resolution copy sole ownership', () => {
        const thumbnail = image();
        const fullSize = image();
        Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [fullSize, thumbnail] });
        expect(isImageVisibleForOcr(thumbnail, box())).toBe(false);
        expect(isImageVisibleForOcr(fullSize, box())).toBe(true);
        fullSize.remove();
        Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [thumbnail] });
        expect(isImageVisibleForOcr(thumbnail, box())).toBe(true);
    });

    it('gives the smaller foreground sole ownership over a blurred Reddit backdrop', () => {
        const backdrop = image();
        backdrop.style.filter = 'blur(24px)';
        backdrop.getBoundingClientRect = () => new DOMRect(0, 50, 600, 360);
        const foreground = image();
        Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [foreground, backdrop] });
        expect(isImageVisibleForOcr(backdrop, backdrop.getBoundingClientRect())).toBe(false);
        expect(isImageVisibleForOcr(foreground, box())).toBe(true);
        // A real picture with a small inset image still retains its own OCR.
        backdrop.style.filter = '';
        expect(isImageVisibleForOcr(backdrop, backdrop.getBoundingClientRect())).toBe(true);
    });

    it('resolves foreground images inside nested shadow roots and honours a hidden host', () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const nested = document.createElement('div');
        const inner = nested.attachShadow({ mode: 'open' });
        const backdrop = image();
        const foreground = image();
        backdrop.style.filter = 'blur(24px)';
        inner.append(backdrop, foreground);
        shadow.append(nested);
        document.body.append(host);
        Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [host] });
        Object.defineProperty(shadow, 'elementsFromPoint', { value: () => [nested] });
        Object.defineProperty(inner, 'elementsFromPoint', { value: () => [foreground, backdrop, nested] });
        expect(isImageVisibleForOcr(backdrop, box())).toBe(false);
        expect(isImageVisibleForOcr(foreground, box())).toBe(true);
        host.hidden = true;
        expect(isImageVisibleForOcr(foreground, box())).toBe(false);
    });

    it('does not re-scan a touch retargeted to the image beneath existing OCR text', () => {
        const source = image();
        const overlay = document.createElement('div');
        overlay.dataset.jpdbReaderRoot = 'true';
        overlay.innerHTML = '<span class="jpdb-ocr-line">日本語</span>';
        document.body.append(overlay);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => overlay.firstElementChild });
        const event = new MouseEvent('pointerdown', { button: 0, clientX: 50, clientY: 100 });
        Object.defineProperty(event, 'pointerType', { value: 'touch' });
        Object.defineProperty(event, 'target', { value: source });
        expect(ocrPointerImage(event)).toBeNull();
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => source });
        const nextEvent = new MouseEvent('pointerdown', { button: 0, clientX: 50, clientY: 100 });
        Object.defineProperty(nextEvent, 'target', { value: source });
        expect(ocrPointerImage(nextEvent)).toBe(source);
    });
});
