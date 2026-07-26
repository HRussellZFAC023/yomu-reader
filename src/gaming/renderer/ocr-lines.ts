import { escapeHtml } from '../../reader/dom/index';
import { layoutOcrOverlayLines, type OcrOverlayFrame } from '../../reader/ocr/ocr-overlay-geometry';
import type { YomuGamingSelectionRect } from '../ipc';

export interface GamingOcrLine {
    text: string;
    box: YomuGamingSelectionRect;
    vertical: boolean;
}

// The recognized lines ARE the reader's OCR overlay: the same layer, the same line
// markup, the same stylesheet (reader-words-ocr.css), the same measurement pass.
// Yomu's image OCR is the reference for putting recognized text back over the picture
// it came from, so the gaming overlay renders through it instead of keeping a parallel
// implementation that drifts out of register with it.
//
// The layer spans the overlay window, which is exactly the space the OCR boxes were
// mapped into, so it is the frame every line is measured and clamped against.
export function overlayOcrLayerHtml(lines: GamingOcrLine[], frame: OcrOverlayFrame): string {
    return `<section class="jpdb-ocr-layer overlay-inline-layer" data-ocr-overlay-theme="dark" data-overlay-inline role="group" aria-label="Recognized text">`
        + lines.map(line => overlayOcrLineHtml(line, frame)).join('')
        + `</section>`;
}

// Each recognized line is a real Japanese text node anchored over its source box. The
// bundled Yomu reader scans these nodes in place: it adds furigana and wires the full
// hover/click popover (definitions, pitch, kanji, SRS) onto the words it finds.
//
// Size, padding and placement are all left to layoutOverlayOcrLines(); the box travels
// here as data, stored as a fraction of the frame exactly as the reader stores it, so
// the shared layout pass reads both surfaces the same way.
export function overlayOcrLineHtml(line: GamingOcrLine, frame: OcrOverlayFrame): string {
    const box = normalizedLineBox(line.box, frame);
    return `<div class="jpdb-ocr-line jpdb-ocr-line-visible" data-ocr-line data-vertical="${line.vertical}"`
        + ` data-ocr-text="${escapeHtml(line.text)}"`
        + ` data-box-left="${box.left}" data-box-top="${box.top}"`
        + ` data-box-width="${box.width}" data-box-height="${box.height}"`
        + ` style="writing-mode:${line.vertical ? 'vertical-rl' : 'horizontal-tb'}">`
        + `<span class="jpdb-ocr-line-text" lang="ja">${escapeHtml(line.text)}</span></div>`;
}

// The reader's line geometry, run over the gaming overlay: the font size comes from the
// OCR box, and the highlight box then grows around the type that was actually laid out
// — padding scaled to the size, room for the word underline, a minimum hit target, the
// furigana gutter, baseline alignment, and a clamp that keeps every line on screen.
//
// Re-run whenever the reader re-typesets a line: furigana arrives after the first paint
// and changes what the line measures.
//
// `fontScale` is the reader's own OCR text size setting, so the slider in Settings moves
// the overlay's text here exactly as it does over an image.
export function layoutOverlayOcrLines(root: ParentNode, frame: OcrOverlayFrame, fontScale = 1): void {
    layoutOcrOverlayLines(root, frame, fontScale);
}

// The frame the overlay's OCR boxes live in: the overlay window itself.
export function overlayOcrFrame(): OcrOverlayFrame {
    return {
        imageLeft: 0,
        imageTop: 0,
        imageWidth: Math.max(1, window.innerWidth),
        imageHeight: Math.max(1, window.innerHeight),
    };
}

function normalizedLineBox(box: YomuGamingSelectionRect, frame: OcrOverlayFrame): { left: string; top: string; width: string; height: string } {
    return {
        left: fraction(box.left - frame.imageLeft, frame.imageWidth),
        top: fraction(box.top - frame.imageTop, frame.imageHeight),
        width: fraction(box.width, frame.imageWidth),
        height: fraction(box.height, frame.imageHeight),
    };
}

// Full precision, exactly as the reader stores it. Rounding here would put the gaming
// overlay a fraction of a pixel off the reader for the same box — the kind of drift
// this convergence exists to remove.
function fraction(value: number, extent: number): string {
    return String(value / Math.max(1, extent));
}
