import { escapeHtml } from '../../reader/dom/index';
import { targetContentLocale } from '../../reader/languages/resolve';
import {
    fittedObjectSize,
    layoutOcrOverlayLines,
    objectPositionOffset,
    paintedImageFrame,
    type OcrOverlayFrame,
} from '../../reader/ocr/ocr-overlay-geometry';
import type { YomuGamingImageSize, YomuGamingSelectionRect } from '../ipc';

export interface GamingOcrLine {
    text: string;
    box: YomuGamingSelectionRect;
    vertical: boolean;
}

// The overlay paints the frozen frame with these (styles.css .overlay-backdrop). The
// painted element is measured first; this is the contract to fall back on when there is
// nothing painted to measure yet.
const BACKDROP_OBJECT_FIT = 'contain';
const BACKDROP_OBJECT_POSITION = 'center';

// The recognized lines ARE the reader's OCR overlay: the same layer, the same line
// markup, the same stylesheet (reader-words-ocr.css), the same measurement pass.
// Yomu's image OCR is the reference for putting recognized text back over the picture
// it came from, so the gaming overlay renders through it instead of keeping a parallel
// implementation that drifts out of register with it.
//
// The layer spans the overlay window, but the FRAME is the frozen capture as painted —
// see overlayOcrFrame(). Every box is stored relative to that, so the lines follow the
// picture rather than the window.
export function overlayOcrLayerHtml(lines: GamingOcrLine[], frame: OcrOverlayFrame): string {
    return `<section class="jpdb-ocr-layer overlay-inline-layer" data-ocr-overlay-theme="dark" data-overlay-inline role="group" aria-label="Recognized text">`
        + lines.map(line => overlayOcrLineHtml(line, frame)).join('')
        + `</section>`;
}

// Each recognized line is a real text node in the language being studied, anchored over
// its source box and stamped with that target's own content locale. The bundled Yomu
// reader scans these nodes in place: it adds readings and wires the full hover/click
// popover (definitions, pitch, kanji, SRS) onto the words it finds.
//
// The line carries .jpdb-ocr-line-visible — the reader's "show the recognized text"
// dressing: white type on a dark chip (measured rgba(24, 27, 32, 0.32), 1px border,
// 0 3px 10px shadow), the same as over a video frame. That is deliberate, and it is the
// only styling decision this file makes. The overlay sits on a frozen screenshot, so
// there is nothing live underneath to keep clear, and the recognized text IS the thing
// the player opened the overlay to read. It also has to be legible with no pointer at
// all: on a Steam Deck the gamepad moves focus to a WORD, which does not put the line
// itself in :hover or :focus-visible, so a line left transparent-at-rest would never
// become readable there.
//
// The lines deliberately do NOT take the reader's role="button"/tabIndex. In the reader
// the controller wires an activation handler onto each line; here the interactive
// targets are the words the reader annotates inside the line, and the line itself does
// nothing when pressed. Announcing it as a button would be a promise the overlay does
// not keep.
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
        + `<span class="jpdb-ocr-line-text" lang="${escapeHtml(targetContentLocale())}">${escapeHtml(line.text)}</span></div>`;
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

// The frame the overlay's OCR boxes live in: the frozen capture AS PAINTED, which is a
// centered, letterboxed rect inside the overlay window (.overlay-backdrop is
// object-fit: contain) — never the window itself. The two coincide only while the window
// keeps the aspect ratio the capture was read at, so anchoring to the window looks right
// on first paint and slides the lines off the dialogue as soon as the window is resized.
// Measured through the reader's own object-fit machinery, so both surfaces answer
// "where is the picture?" with the same code.
export function overlayOcrFrame(root: ParentNode, capture: YomuGamingImageSize | null): OcrOverlayFrame {
    const backdrop = root.querySelector<HTMLImageElement>('img.overlay-backdrop');
    const rect = backdrop?.getBoundingClientRect();
    const source = captureSourceSize(capture, backdrop);
    if (!backdrop || !rect || rect.width <= 0 || rect.height <= 0) return overlayCaptureFrame(source, viewportSize());
    const style = getComputedStyle(backdrop);
    const painted = paintedImageFrame({
        image: backdrop,
        rect,
        style,
        objectFit: style.objectFit || BACKDROP_OBJECT_FIT,
        objectPosition: style.objectPosition || BACKDROP_OBJECT_POSITION,
        sourceWidth: source.width,
        sourceHeight: source.height,
    });
    // paintedImageFrame answers inside the backdrop's own box; the OCR layer spans the
    // window, so shift it into the space the lines are positioned in.
    return {
        imageLeft: rect.left + painted.imageLeft,
        imageTop: rect.top + painted.imageTop,
        imageWidth: painted.imageWidth,
        imageHeight: painted.imageHeight,
    };
}

// The same answer with no painted backdrop to measure (the very first frame): the
// capture contained inside the overlay window. Built from the shared object-fit
// primitives so there is one definition of "contained", not a second copy of the
// arithmetic that can drift from the stylesheet.
export function overlayCaptureFrame(source: YomuGamingImageSize, viewport: YomuGamingImageSize): OcrOverlayFrame {
    const object = fittedObjectSize(BACKDROP_OBJECT_FIT, source.width, source.height, viewport.width, viewport.height);
    const offset = objectPositionOffset(BACKDROP_OBJECT_POSITION, viewport.width - object.width, viewport.height - object.height);
    return {
        imageLeft: offset.x,
        imageTop: offset.y,
        imageWidth: object.width,
        imageHeight: object.height,
    };
}

// The capture's own pixel size decides how the picture is letterboxed. The bridge
// reports it; the loaded backdrop knows it too, and the window is the last resort.
function captureSourceSize(capture: YomuGamingImageSize | null, backdrop: HTMLImageElement | null): YomuGamingImageSize {
    if (capture && capture.width > 0 && capture.height > 0) return capture;
    if (backdrop?.naturalWidth && backdrop.naturalHeight) return { width: backdrop.naturalWidth, height: backdrop.naturalHeight };
    return viewportSize();
}

function viewportSize(): YomuGamingImageSize {
    return { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
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
