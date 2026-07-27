import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { layoutOverlayOcrLines, overlayOcrFrame, overlayOcrLayerHtml } from '../../src/gaming/renderer/ocr-lines';
import {
    layoutOcrOverlayLines,
    ocrLineFrame,
    type OcrOverlayFrame,
} from '../../src/reader/ocr/ocr-overlay-geometry';

const FRAME: OcrOverlayFrame = { imageLeft: 0, imageTop: 0, imageWidth: 1280, imageHeight: 720 };
const LINE_TEXT = '港へ行くよ';
const LINE_BOX = { left: 240, top: 512, width: 320, height: 44 };
// A line of dialogue as a game draws it, and the box a provider hands back for it: the
// ink box, one glyph per em wide and a shade under an em tall.
const SOURCE_TEXT = '町の明かりが見えてきたから、そろそろ港へ行くよ。';
const SOURCE_FONT_PX = 46;
const SOURCE_INK_RATIO = 0.92;
const SOURCE_BOX = {
    left: 80,
    top: 600,
    width: [...SOURCE_TEXT].length * SOURCE_FONT_PX,
    height: SOURCE_FONT_PX * SOURCE_INK_RATIO,
};
// Room for a line of type too large for the old ceiling to reach.
const WIDE_FRAME: OcrOverlayFrame = { imageLeft: 0, imageTop: 0, imageWidth: 2600, imageHeight: 1400 };

// jsdom does not lay text out, and the sizing this file is about is a MEASUREMENT — so the
// suite supplies a typesetter rather than a constant. Japanese glyphs advance a full em,
// which is the whole reason a measured fit can put recognized text back at the size of the
// text it was read from, so a line of N glyphs at F px is N*F long and F thick.
//
// Two things about readings are modelled, because the fit turns on both (reader-words-ocr.css):
//   * a reading is `.jpdb-ocr-furi { position: absolute }`, so it costs the line no length;
//   * its wrapper is `.jpdb-ocr-ruby { padding-top: 0.5em }`, which in a vertical-rl column
//     is padding along the INLINE axis and does lengthen the column.
// That is enough of a layout engine to make the arithmetic real;
// scripts/ocr-line-register-smoke.mjs is the same assertion against a real engine painting
// real type, and scripts/gaming-app-smoke.mjs asserts it in the shipped app.
function installFakeTypesetting(): () => void {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        // Individual elements still get to answer for themselves — the overlay backdrop is
        // stubbed per element to stand for a window of a given shape.
        writable: true,
        value(this: HTMLElement): DOMRect {
            const fontSize = inheritedFontPx(this);
            const vertical = this.closest<HTMLElement>('.jpdb-ocr-line')?.dataset.vertical === 'true';
            const laidOut = this.cloneNode(true) as HTMLElement;
            laidOut.querySelectorAll('rt, .jpdb-ocr-furi, .jpdb-reader-detached-furi').forEach(node => node.remove());
            const rubyGutter = vertical ? laidOut.querySelectorAll('.jpdb-ocr-ruby').length * 0.5 : 0;
            const length = ([...(laidOut.textContent ?? '')].length + rubyGutter) * fontSize;
            return vertical ? new DOMRect(0, 0, fontSize, length) : new DOMRect(0, 0, length, fontSize);
        },
    });
    return () => {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', descriptor);
        else delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
    };
}

// The line as the reader leaves it: the same characters, wrapped word by word, with a
// reading on the first one. Appending a word instead would be testing a longer sentence.
function annotateOcrLine(root: ParentNode, text: string): void {
    const textElement = root.querySelector<HTMLElement>('.jpdb-ocr-line-text');
    if (!textElement) throw new Error('no OCR line text rendered');
    const [head = '', ...rest] = [...text];
    textElement.innerHTML = '<span class="jpdb-reader-word jpdb-reader-has-furi">'
        + `<span class="jpdb-ocr-ruby"><span class="jpdb-ocr-ruby-base">${head}</span>`
        + '<span class="jpdb-ocr-furi">みなと</span></span></span>'
        + `<span class="jpdb-reader-word">${rest.join('')}</span>`;
}

function inheritedFontPx(element: HTMLElement | null): number {
    for (let node = element; node; node = node.parentElement) {
        const declared = Number.parseFloat(node.style.fontSize);
        if (Number.isFinite(declared) && declared > 0) return declared;
    }
    return 16;
}

let restoreTypesetting: () => void;
beforeEach(() => {
    restoreTypesetting = installFakeTypesetting();
});
afterEach(() => restoreTypesetting());

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

// A game's line of dialogue with the ink box a provider drew around it.
function sourceLineLayer(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = overlayOcrLayerHtml([{ text: SOURCE_TEXT, box: SOURCE_BOX, vertical: false }], FRAME);
    return host;
}

function renderedTextRect(root: ParentNode): DOMRect {
    const text = root.querySelector<HTMLElement>('.jpdb-ocr-line-text');
    if (!text) throw new Error('no OCR line text rendered');
    return text.getBoundingClientRect();
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

        layoutOcrOverlayLines(reader, FRAME, 1);
        layoutOverlayOcrLines(gaming, FRAME);

        expect(placedGeometry(gaming)).toEqual(placedGeometry(reader));
    });

    it('typesets a recognized line at the size of the text it was read from', () => {
        const gaming = sourceLineLayer();
        layoutOverlayOcrLines(gaming, FRAME);
        const placed = placedGeometry(gaming);
        const rendered = renderedTextRect(gaming);

        // THE BAR. The old rule took type from `boxHeight * 0.58` under a 38px ceiling, so
        // this box — the ink box of a 46px line — was typeset at 24.5px, 0.533x the size of
        // the text underneath it, and being centred it covered only the middle half of the
        // sentence. Size and span are asserted, not existence.
        expect(Number.parseFloat(placed.fontSize) / SOURCE_FONT_PX).toBeCloseTo(1, 1);
        expect(rendered.width / SOURCE_BOX.width).toBeCloseTo(1, 2);
        // The rendered box is a full em tall while the source box is only as tall as the
        // source's ink, so the honest comparison there is against the em the ink came from.
        expect(rendered.height / (SOURCE_BOX.height / SOURCE_INK_RATIO)).toBeCloseTo(1, 1);
    });

    it('covers the source line end to end instead of floating in the middle of it', () => {
        const gaming = sourceLineLayer();
        layoutOverlayOcrLines(gaming, FRAME);
        const placed = placedGeometry(gaming);

        // The highlight is the line plus its padding, so the TYPE starts one pad in. The
        // reported defect put that start 215px inside the source line's left edge.
        const padX = Number.parseFloat(placed.padX);
        const textLeft = Number.parseFloat(placed.left) + padX;
        const textRight = Number.parseFloat(placed.left) + Number.parseFloat(placed.width) - padX;
        expect(textLeft).toBeCloseTo(SOURCE_BOX.left, 0);
        expect(textRight).toBeCloseTo(SOURCE_BOX.left + SOURCE_BOX.width, 0);
    });

    it('matches game type too large for the old 38px ceiling', () => {
        const large = 96;
        const box = {
            left: 120,
            top: 500,
            width: [...SOURCE_TEXT].length * large,
            height: large * SOURCE_INK_RATIO,
        };
        const host = document.createElement('div');
        host.innerHTML = overlayOcrLayerHtml([{ text: SOURCE_TEXT, box, vertical: false }], WIDE_FRAME);
        layoutOverlayOcrLines(host, WIDE_FRAME);

        // At the ceiling this was 38px whatever the setting did — 0.4x the source, and
        // unreachable even at the maximum "Image text scale" of 1.8.
        expect(Number.parseFloat(placedGeometry(host).fontSize) / large).toBeCloseTo(1, 1);
    });

    it('does not resize a line when the reader annotates it', () => {
        const gaming = sourceLineLayer();
        layoutOverlayOcrLines(gaming, FRAME);
        const bare = placedGeometry(gaming).fontSize;

        // A reading is out of flow, so an annotated horizontal line is the same length as
        // the sentence it came from and must be typeset at the same size. What the fit
        // follows is the line as the player sees it — the reader's word boxes, not a plain
        // run of the same characters — because it is those boxes that cover the source line.
        annotateOcrLine(gaming, SOURCE_TEXT);
        layoutOverlayOcrLines(gaming, FRAME);

        expect(placedGeometry(gaming).fontSize).toBe(bare);
    });

    it('does not shrink a vertical column when the reader adds readings to it', () => {
        const host = document.createElement('div');
        const box = { left: 900, top: 40, width: SOURCE_FONT_PX * SOURCE_INK_RATIO, height: [...LINE_TEXT].length * SOURCE_FONT_PX };
        host.innerHTML = overlayOcrLayerHtml([{ text: LINE_TEXT, box, vertical: true }], FRAME);
        layoutOverlayOcrLines(host, FRAME);
        const bare = placedGeometry(host).fontSize;

        // A vertical reading sits in the column's own inline direction and lengthens it, so
        // an annotated column measured against its own box would be squeezed smaller and
        // smaller. Vertical columns with readings are fitted to a clean copy of the source.
        annotateOcrLine(host, LINE_TEXT);
        layoutOverlayOcrLines(host, FRAME);

        expect(placedGeometry(host).fontSize).toBe(bare);
    });

    it('moves the whole line with the reader’s image text size setting', () => {
        const gaming = sourceLineLayer();
        layoutOverlayOcrLines(gaming, FRAME, 1.8);

        expect(Number.parseFloat(placedGeometry(gaming).fontSize) / SOURCE_FONT_PX).toBeCloseTo(1.8, 1);
    });

    it('derives the line padding from the font size, so the box breathes with the type', () => {
        const gaming = gamingOcrLayer();
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
        layoutOverlayOcrLines(host, FRAME);
        const placed = placedGeometry(host);

        expect(Number.parseFloat(placed.left) + Number.parseFloat(placed.width)).toBeLessThanOrEqual(FRAME.imageWidth);
        expect(Number.parseFloat(placed.top) + Number.parseFloat(placed.height)).toBeLessThanOrEqual(FRAME.imageHeight);
    });

    it('gives a line the furigana top gutter once the reader adds readings to it', () => {
        const gaming = gamingOcrLayer();
        layoutOverlayOcrLines(gaming, FRAME);
        const bare = placedGeometry(gaming);

        // The reader annotates the overlay's lines in place, so the readings land after
        // the first paint — the next fit has to notice them.
        annotateOcrLine(gaming, LINE_TEXT);
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

// A 16:9 frozen capture shown in windows of two different shapes. object-fit: contain
// letterboxes it, so the picture is NOT the window: 1920x1080 in 1280x800 paints
// 1280x720 at top 40; in 800x800 it paints 800x450 at top 175.
const CAPTURE = { width: 1920, height: 1080 };
const WIDE_WINDOW = { width: 1280, height: 800 };
const TALL_WINDOW = { width: 800, height: 800 };
// A line of dialogue in the capture's own pixels.
const CAPTURE_BOX = { left: 960, top: 900, width: 400, height: 60 };

function overlayHost(window: { width: number; height: number }): HTMLElement {
    const host = document.createElement('div');
    const backdrop = document.createElement('img');
    backdrop.className = 'overlay-backdrop';
    host.append(backdrop);
    resizeOverlay(host, window);
    return host;
}

// .overlay-backdrop is position:fixed inset:0, so it always measures the whole window.
function resizeOverlay(host: HTMLElement, window: { width: number; height: number }): void {
    const backdrop = host.querySelector<HTMLImageElement>('img.overlay-backdrop');
    if (!backdrop) throw new Error('no backdrop');
    backdrop.getBoundingClientRect = () => new DOMRect(0, 0, window.width, window.height);
}

// Where a box on the frozen capture lands in the overlay, exactly as app.ts maps it.
function boxOnCapture(box: typeof CAPTURE_BOX, frame: OcrOverlayFrame): typeof CAPTURE_BOX {
    const scaleX = frame.imageWidth / CAPTURE.width;
    const scaleY = frame.imageHeight / CAPTURE.height;
    return {
        left: frame.imageLeft + box.left * scaleX,
        top: frame.imageTop + box.top * scaleY,
        width: box.width * scaleX,
        height: box.height * scaleY,
    };
}

function renderLine(host: HTMLElement, box: typeof CAPTURE_BOX, frame: OcrOverlayFrame): void {
    host.insertAdjacentHTML('beforeend', overlayOcrLayerHtml([{ text: LINE_TEXT, box, vertical: false }], frame));
    layoutOverlayOcrLines(host, frame);
}

// A resized line and a freshly built one reach the same place by different arithmetic —
// one divides by the old frame and multiplies by the new, the other does neither — so
// they agree to about a thousandth of a pixel rather than to the last bit of a double.
function expectSamePlacement(actual: Record<string, string>, expected: Record<string, string>): void {
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const [key, value] of Object.entries(actual)) {
        expect(Number.parseFloat(value), key).toBeCloseTo(Number.parseFloat(expected[key]), 3);
    }
}

describe('Yomu Gaming anchors OCR lines to the capture, not to the window', () => {
    it('frames the lines with the letterboxed picture rather than the overlay window', () => {
        const frame = overlayOcrFrame(overlayHost(TALL_WINDOW), CAPTURE);

        expect(frame.imageLeft).toBeCloseTo(0, 3);
        expect(frame.imageTop).toBeCloseTo(175, 3);
        expect(frame.imageWidth).toBeCloseTo(800, 3);
        expect(frame.imageHeight).toBeCloseTo(450, 3);
    });

    it('keeps a line on the same point of the capture when the window changes shape', () => {
        const host = overlayHost(WIDE_WINDOW);
        const wide = overlayOcrFrame(host, CAPTURE);
        renderLine(host, boxOnCapture(CAPTURE_BOX, wide), wide);

        resizeOverlay(host, TALL_WINDOW);
        const tall = overlayOcrFrame(host, CAPTURE);
        layoutOverlayOcrLines(host, tall); // what the resize listener does

        // The reference: the same line, built from scratch at the new window shape.
        const fresh = overlayHost(TALL_WINDOW);
        renderLine(fresh, boxOnCapture(CAPTURE_BOX, tall), tall);

        expectSamePlacement(placedGeometry(host), placedGeometry(fresh));
        // Stated as the thing the player sees rather than as a magic pixel: the line rests
        // on the bottom of its source box. The box's bottom is capture y=960, which is
        // overlay y=575 once the picture re-letterboxes to 800x450 at top 175 — a
        // window-sized frame would have left it 97px lower, off the dialogue entirely.
        const placed = placedGeometry(host);
        const lineBottom = Number.parseFloat(placed.top) + Number.parseFloat(placed.height)
            - Number.parseFloat(placed.padBottom);
        expect(lineBottom).toBeCloseTo(175 + 960 * (450 / CAPTURE.height), 3);
    });

    it('clamps an edge line onto the picture instead of the letterbox bar', () => {
        const host = overlayHost(TALL_WINDOW);
        const frame = overlayOcrFrame(host, CAPTURE);
        renderLine(host, boxOnCapture({ left: 1500, top: 1040, width: 400, height: 40 }, frame), frame);
        const placed = placedGeometry(host);

        expect(Number.parseFloat(placed.top)).toBeGreaterThanOrEqual(frame.imageTop);
        expect(Number.parseFloat(placed.top) + Number.parseFloat(placed.height))
            .toBeLessThanOrEqual(frame.imageTop + frame.imageHeight + 0.001);
        expect(Number.parseFloat(placed.left) + Number.parseFloat(placed.width))
            .toBeLessThanOrEqual(frame.imageLeft + frame.imageWidth + 0.001);
    });

    it('still frames the capture before the backdrop has been painted', () => {
        const frame = overlayOcrFrame(document.createElement('div'), CAPTURE);

        expect(frame.imageWidth / frame.imageHeight).toBeCloseTo(CAPTURE.width / CAPTURE.height, 5);
        expect(frame.imageWidth).toBeLessThanOrEqual(window.innerWidth);
        expect(frame.imageHeight).toBeLessThanOrEqual(window.innerHeight);
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
