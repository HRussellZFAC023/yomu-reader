import { describe, expect, it } from 'vitest';

import { layoutOverlayOcrLines, overlayOcrLayerHtml } from '../../src/gaming/renderer/ocr-lines';
import {
    layoutOcrOverlayLines,
    ocrLineFrame,
    type OcrOverlayFrame,
} from '../../src/reader/ocr/ocr-overlay-geometry';

const FRAME: OcrOverlayFrame = { imageLeft: 0, imageTop: 0, imageWidth: 1280, imageHeight: 720 };
const LINE_TEXT = '港へ行くよ';
const LINE_BOX = { left: 240, top: 512, width: 320, height: 44 };
// jsdom does not lay text out, so both surfaces are handed the SAME measured text box.
// That is the point of the comparison: given identical type, they must place it identically.
const MEASURED_TEXT = { width: 268, height: 30 };

// The reader's image overlay, as ImageOcrController builds and fits it: a .jpdb-ocr-layer
// of .jpdb-ocr-line elements carrying their source box as a fraction of the rendered
// image, laid out by layoutOcrOverlayLines().
function readerOcrLayer(): HTMLElement {
    const layer = document.createElement('div');
    layer.className = 'jpdb-ocr-layer';
    const line = document.createElement('div');
    line.className = 'jpdb-ocr-line jpdb-ocr-line-visible';
    line.dataset.ocrText = LINE_TEXT;
    line.dataset.vertical = 'false';
    line.dataset.hasFuri = 'false';
    line.dataset.boxLeft = String(LINE_BOX.left / FRAME.imageWidth);
    line.dataset.boxTop = String(LINE_BOX.top / FRAME.imageHeight);
    line.dataset.boxWidth = String(LINE_BOX.width / FRAME.imageWidth);
    line.dataset.boxHeight = String(LINE_BOX.height / FRAME.imageHeight);
    line.style.writingMode = 'horizontal-tb';
    const text = document.createElement('span');
    text.className = 'jpdb-ocr-line-text';
    line.append(text);
    layer.append(line);
    return layer;
}

function gamingOcrLayer(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = overlayOcrLayerHtml([{ text: LINE_TEXT, box: LINE_BOX, vertical: false }], FRAME);
    return host;
}

function stubMeasuredText(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('.jpdb-ocr-line-text').forEach(text => {
        text.getBoundingClientRect = () => new DOMRect(0, 0, MEASURED_TEXT.width, MEASURED_TEXT.height);
    });
}

function placedGeometry(root: ParentNode): Record<string, string> {
    const line = root.querySelector<HTMLElement>('.jpdb-ocr-line');
    if (!line) throw new Error('no OCR line rendered');
    return {
        fontSize: line.style.fontSize,
        left: line.style.left,
        top: line.style.top,
        width: line.style.width,
        height: line.style.height,
        padX: line.style.getPropertyValue('--jpdb-ocr-pad-x'),
        padTop: line.style.getPropertyValue('--jpdb-ocr-pad-top'),
        padBottom: line.style.getPropertyValue('--jpdb-ocr-pad-bottom'),
    };
}

describe('Yomu Gaming renders OCR lines with the reader’s overlay geometry', () => {
    it('places a gaming line exactly where the reader would place the same box and text', () => {
        const reader = readerOcrLayer();
        const gaming = gamingOcrLayer();
        stubMeasuredText(reader);
        stubMeasuredText(gaming);

        layoutOcrOverlayLines(reader, FRAME, 1);
        layoutOverlayOcrLines(gaming, FRAME);

        expect(placedGeometry(gaming)).toEqual(placedGeometry(reader));
    });

    it('sizes the line to the text it sits over instead of a stylesheet default', () => {
        const gaming = gamingOcrLayer();
        stubMeasuredText(gaming);
        layoutOverlayOcrLines(gaming, FRAME);

        // A 320x44 box of dialogue is typeset near the height of the source text, not at
        // the 15px the overlay's own stylesheet used to force on every line.
        const fontSize = Number.parseFloat(placedGeometry(gaming).fontSize);
        expect(fontSize).toBeGreaterThan(20);
        expect(fontSize).toBeLessThanOrEqual(44 * 0.58);
    });

    it('derives the line padding from the font size, so the box breathes with the type', () => {
        const gaming = gamingOcrLayer();
        stubMeasuredText(gaming);
        layoutOverlayOcrLines(gaming, FRAME);
        const placed = placedGeometry(gaming);

        // The overlay used to hard-code `padding: 1px 2px` regardless of size.
        expect(Number.parseFloat(placed.padX)).toBeGreaterThan(2);
        expect(Number.parseFloat(placed.padBottom)).toBeGreaterThan(2);
    });

    it('keeps a line at the screen edge inside the frame', () => {
        const host = document.createElement('div');
        host.innerHTML = overlayOcrLayerHtml(
            [{ text: LINE_TEXT, box: { left: 1180, top: 700, width: 300, height: 40 }, vertical: false }],
            FRAME,
        );
        stubMeasuredText(host);
        layoutOverlayOcrLines(host, FRAME);
        const placed = placedGeometry(host);

        expect(Number.parseFloat(placed.left) + Number.parseFloat(placed.width)).toBeLessThanOrEqual(FRAME.imageWidth);
        expect(Number.parseFloat(placed.top) + Number.parseFloat(placed.height)).toBeLessThanOrEqual(FRAME.imageHeight);
    });

    it('gives a line the furigana top gutter once the reader adds readings to it', () => {
        const gaming = gamingOcrLayer();
        stubMeasuredText(gaming);
        layoutOverlayOcrLines(gaming, FRAME);
        const bare = placedGeometry(gaming);

        // The reader annotates the overlay's lines in place, so the readings land after
        // the first paint — the next fit has to notice them.
        const text = gaming.querySelector('.jpdb-ocr-line-text');
        text?.insertAdjacentHTML('beforeend', '<span class="jpdb-reader-word jpdb-reader-has-furi"><ruby>港<rt>みなと</rt></ruby></span>');
        layoutOverlayOcrLines(gaming, FRAME);
        const annotated = placedGeometry(gaming);

        expect(gaming.querySelector<HTMLElement>('.jpdb-ocr-line')?.dataset.hasFuri).toBe('true');
        expect(Number.parseFloat(annotated.padTop)).toBeGreaterThan(Number.parseFloat(bare.padTop));
    });

    it('carries the reader’s line markup, so the reader’s stylesheet dresses it', () => {
        const html = overlayOcrLayerHtml([{ text: LINE_TEXT, box: LINE_BOX, vertical: true }], FRAME);
        expect(html).toContain('class="jpdb-ocr-layer');
        expect(html).toContain('class="jpdb-ocr-line jpdb-ocr-line-visible"');
        expect(html).toContain('class="jpdb-ocr-line-text"');
        expect(html).toContain('writing-mode:vertical-rl');
        // The reader scans these nodes in place; the gaming gamepad driver finds the
        // annotated words through [data-ocr-line].
        expect(html).toContain('data-ocr-line');
    });
});

describe('OCR line frame', () => {
    it('reserves paint room for pitch underlines in small horizontal line frames', () => {
        const placed = ocrLineFrame({
            text: '読む',
            box: { left: 50, top: 20, width: 18, height: 14 },
            frame: { imageLeft: 0, imageTop: 0, imageWidth: 180, imageHeight: 90 },
            vertical: false,
            hasFurigana: true,
            fontSize: 24,
            contentWidth: 36,
            contentHeight: 24,
        });

        expect(placed.padBottom).toBe(7);
        expect(placed.height).toBe(34);
    });

    it('clamps bottom line frames above reserved reader chrome', () => {
        const placed = ocrLineFrame({
            text: '読む',
            box: { left: 48, top: 190, width: 64, height: 20 },
            frame: { imageLeft: 0, imageTop: 0, imageWidth: 220, imageHeight: 240, safeBottomInset: 56 },
            vertical: false,
            hasFurigana: false,
            fontSize: 24,
            contentWidth: 72,
            contentHeight: 24,
        });

        expect(placed.top + placed.height).toBeLessThanOrEqual(184);
    });

    it('reserves side paint room for vertical pitch underlines without requiring furigana', () => {
        const placed = ocrLineFrame({
            text: '読む',
            box: { left: 50, top: 20, width: 10, height: 48 },
            frame: { imageLeft: 0, imageTop: 0, imageWidth: 180, imageHeight: 120 },
            vertical: true,
            hasFurigana: false,
            fontSize: 24,
            contentWidth: 24,
            contentHeight: 48,
        });

        expect(placed.width).toBe(46);
    });

    it('does not widen a vertical frame when the column has furigana', () => {
        // Regression: a vertical furigana reading sits in a right-side strip and the
        // line is overflow:visible, so it spills past the box harmlessly instead of
        // forcing the highlight wider. A furigana column must size to the same width
        // as the equivalent plain column (46px above), not balloon by a symmetric
        // furi gutter.
        const placed = ocrLineFrame({
            text: '読む',
            box: { left: 50, top: 20, width: 10, height: 48 },
            frame: { imageLeft: 0, imageTop: 0, imageWidth: 180, imageHeight: 120 },
            vertical: true,
            hasFurigana: true,
            fontSize: 24,
            contentWidth: 24,
            contentHeight: 48,
        });

        expect(placed.width).toBe(46);
    });
});
