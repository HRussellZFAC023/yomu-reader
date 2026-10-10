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
