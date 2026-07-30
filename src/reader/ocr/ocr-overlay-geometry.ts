import type { OcrRect } from './response';

/** How long a line of the source text is in our own type, and the size it was measured at. */
interface OcrTextMeasurement {
    fontSize: number;
    /** Extent along the direction the text runs: width when horizontal, height when vertical. */
    length: number;
}

// A tight OCR box is drawn around the ink, and Japanese glyphs fill roughly 0.92 em of
// their line box, so type of size F leaves a box about 0.92F thick. Inverting that gives
// the largest type a box of a given thickness can have come from. Boxes that carry
// leading are looser than this, and for those the length fit decides — which is why the
// old `boxHeight * 0.58` was wrong in the common case: against a provider's tight ink box
// it typeset the line at barely half the size of the text it was sitting on.
const OCR_BOX_INK_RATIO = 0.92;
const MIN_OCR_FONT_PX = 11;

// Every OCR surface anchors recognized text over a source box, so every one of them needs
// the same answer to "how big is this line?". Sizing it per surface is what let the gaming
// overlay drift out of register with the text underneath it.
//
// The honest answer needs a measurement: how long IS this string in the reader's own type?
// Text advances scale linearly with the font size, so one measurement at a known size is
// enough to land the line on exactly the extent the source occupied — a 20-glyph sentence
// in a 920px-wide box comes back at 46px, the size the game drew it at, whatever font
// either side happens to use. `measured` is that reading; without it (nothing rendered to
// measure) the em-count estimate below stands in.
//
// There is deliberately no upper clamp any more. The box IS the bound: a line cannot be
// thicker than the box drawn around it, and a fixed 38px ceiling only meant that large
// game and manga type could never be matched at any "Image text scale" setting.
function ocrFontPx(
    text: string,
    boxWidth: number,
    boxHeight: number,
    vertical: boolean,
    scale: number,
    measured?: OcrTextMeasurement,
): number {
    const safeScale = Math.max(0.7, Math.min(1.8, scale));
    const boxThickness = vertical ? boxWidth : boxHeight;
    const boxLength = vertical ? boxHeight : boxWidth;
    const byBoxThickness = boxThickness / OCR_BOX_INK_RATIO;
    const byBoxLength = measuredFontPx(boxLength, measured) ?? estimatedFontPx(text, boxLength, vertical);
    return Math.max(MIN_OCR_FONT_PX, Math.min(byBoxThickness, byBoxLength) * safeScale);
}

function measuredFontPx(boxLength: number, measured: OcrTextMeasurement | undefined): number | null {
    if (!measured || !(measured.length > 0) || !(measured.fontSize > 0)) return null;
    return (boxLength / measured.length) * measured.fontSize;
}

function estimatedFontPx(text: string, boxLength: number, vertical: boolean): number {
    return (boxLength / Math.max(1, visualTextLength(text))) * (vertical ? 1.12 : 1.08);
}

// Kana and kanji occupy a full em; latin and whitespace do not. Counting characters
// instead would oversize any line with punctuation or romaji in it.
function visualTextLength(text: string): number {
    return [...text.trim()].reduce((total, char) => {
        if (/\s/.test(char)) return total + 0.35;
        if ((char.codePointAt(0) ?? 0) <= 0xff) return total + 0.62;
        return total + 1;
    }, 0);
}

function shouldCenterOcrText(text: string): boolean {
    return visualTextLength(text) <= 1.5;
}

const OCR_WORD_UNDERLINE_OFFSET_EM = 0.12;
const OCR_WORD_UNDERLINE_THICKNESS_EM = 0.12;
const OCR_WORD_UNDERLINE_CLEARANCE_PX = 1;

function ocrWordUnderlineBleedPx(fontSize: number): number {
    return Math.ceil(fontSize * (OCR_WORD_UNDERLINE_OFFSET_EM + OCR_WORD_UNDERLINE_THICKNESS_EM))
        + OCR_WORD_UNDERLINE_CLEARANCE_PX;
}

// The rendered surface an OCR line is anchored inside: the painted image for the
// reader, the frozen screen capture for the gaming overlay. Lines are clamped to it
// so a reading never runs off the edge into the layer's overflow:hidden.
export interface OcrOverlayFrame {
    imageLeft: number;
    imageTop: number;
    imageWidth: number;
    imageHeight: number;
    safeBottomInset?: number;
}

export interface OcrLineBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface OcrLinePadding {
    padX: number;
    padTop: number;
    padBottom: number;
}

export type OcrLineFrame = OcrLineBox & OcrLinePadding;

// The highlight box breathes with the type inside it: a 38px line of dialogue needs
// more room around the glyphs than an 11px caption, and a furigana line needs a top
// gutter for the reading. Hard-coded padding is what made the gaming overlay's boxes
// sit tight and low against text the reader would have framed generously.
function ocrLinePadding(fontSize: number, vertical: boolean, hasFurigana: boolean): OcrLinePadding {
    const underlineBleed = ocrWordUnderlineBleedPx(fontSize);
    return {
        padX: Math.max(4, Math.round(fontSize * 0.16)),
        padTop: hasFurigana ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(2, Math.round(fontSize * 0.08)),
        padBottom: vertical ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(3, underlineBleed),
    };
}

export interface OcrLineFrameInput {
    text: string;
    /** Source box, in the same space as `frame`. */
    box: OcrLineBox;
    frame: OcrOverlayFrame;
    vertical: boolean;
    hasFurigana: boolean;
    fontSize: number;
    /** Measured size of the re-typeset .jpdb-ocr-line-text. */
    contentWidth: number;
    contentHeight: number;
}

// Where a line's highlight box lands, given the type that ended up inside it. Every
// OCR surface runs this: sizing the frame from the OCR box alone clips re-typeset
// text, and anchoring it at the box's top-left drops the line off its own baseline.
export function ocrLineFrame(input: OcrLineFrameInput): OcrLineFrame {
    const { box, frame, vertical, fontSize } = input;
    const padding = ocrLinePadding(fontSize, vertical, input.hasFurigana);
    const contentWidth = Math.max(1, input.contentWidth);
    const contentHeight = Math.max(1, input.contentHeight);
    const underlineBleed = ocrWordUnderlineBleedPx(fontSize);
    const minHitSize = Math.max(24, Math.round(fontSize * 1.25));
    // A vertical furigana reading sits in a strip to the RIGHT of its column
    // (real vertical ruby). The line is overflow:visible, so the reading can
    // spill past the highlight box harmlessly; reserving a symmetric gutter to
    // wrap it only made furigana columns look wider than the OCR text (user
    // feedback). Keep the frame the same width as a plain column and instead
    // reserve the reading's width in the horizontal position clamp, so only the
    // rightmost column (the first one read, whose reading would otherwise run
    // past the image edge into the layer's overflow:hidden) is nudged inward.
    const furiGutter = vertical && input.hasFurigana ? Math.round(fontSize * 0.55) : 0;
    const underlineGutter = vertical ? underlineBleed : 0;
    const width = Math.min(frame.imageWidth, Math.max(box.width, minHitSize, contentWidth + padding.padX * 2 + underlineGutter * 2));
    // Vertical columns must also grow to the rendered text height: the OCR box is
    // often shorter than the re-typeset column, and a frame clamped to the box
    // height leaves the overflowing glyphs to be clipped at the layer edge instead
    // of wrapped by the highlight.
    const height = Math.min(frame.imageHeight, Math.max(box.height, minHitSize, contentHeight + padding.padTop + padding.padBottom));
    const minLeft = frame.imageLeft;
    const minTop = frame.imageTop;
    const maxLeft = Math.max(minLeft, frame.imageLeft + frame.imageWidth - width - furiGutter);
    const maxTop = Math.max(minTop, frame.imageTop + frame.imageHeight - (frame.safeBottomInset ?? 0) - height);
    const left = clampNumber(box.left + box.width / 2 - width / 2, minLeft, maxLeft);
    const centeredTop = box.top + box.height / 2 - height / 2;
    const baselineAlignedTop = box.top + box.height - height + padding.padBottom;
    // Expanded vertical columns must stay anchored to the OCR provider's box top.
    // Centering a tall re-typeset column around a short source box shifts it upward
    // (often all the way to the layer edge), while X remains correct. The max clamp
    // still moves a near-bottom column only as far as necessary.
    const targetTop = vertical
        ? box.top
        : shouldCenterOcrText(input.text)
            ? centeredTop
            : baselineAlignedTop;
    return {
        ...padding,
        left,
        top: clampNumber(targetTop, minTop, maxTop),
        width,
        height,
    };
}

interface OcrLineLayoutInput {
    text: string;
    box: OcrLineBox;
    frame: OcrOverlayFrame;
    vertical: boolean;
    fontScale: number;
    /** The face the lines are set in, read once for the whole layer. See ocrLayerTypeface(). */
    typeface?: string;
    /** The transform the layer itself carries. See paintedElementBox(). */
    layerTransform?: OcrLinearTransform | null;
}

// The single place an OCR line element is sized and placed. Both the reader's image
// overlay and the gaming overlay call this against the same markup
// (.jpdb-ocr-line > .jpdb-ocr-line-text), so a line lands at the size and position of
// the text underneath it on every surface.
function layoutOcrLineElement(element: HTMLElement, input: OcrLineLayoutInput): OcrLineFrame | null {
    const { box, frame, vertical } = input;
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) return null;
    const textElement = element.querySelector<HTMLElement>('.jpdb-ocr-line-text');
    if (!textElement) return null;
    // Read the readings off the line rather than trusting a flag set when it was built:
    // furigana can arrive after the first paint (the gaming overlay lets the reader
    // annotate its lines in place), and a line that grew readings needs the taller top
    // gutter on the very next fit.
    const hasFurigana = Boolean(textElement.querySelector('.jpdb-reader-has-furi'));
    const typeface = input.typeface ?? ocrLayerTypeface(element);
    // A vertical column wraps inside its own previous answer. Clear that frame before
    // measuring the natural line.
    element.style.width = '';
    element.style.height = '';
    const fontSize = ocrFontPx(
        input.text,
        box.width,
        box.height,
        vertical,
        input.fontScale,
        measureOcrLineExtent(element, textElement, vertical, typeface, input.layerTransform),
    );
    element.style.fontSize = `${fontSize}px`;
    element.dataset.hasFuri = String(hasFurigana);
    const padding = ocrLinePadding(fontSize, vertical, hasFurigana);
    applyOcrLinePadding(element, padding);
    const content = paintedElementBox(textElement, input.layerTransform);
    const placed = ocrLineFrame({
        text: input.text,
        box,
        frame,
        vertical,
        hasFurigana,
        fontSize,
        contentWidth: content.width,
        contentHeight: content.height,
    });
    element.style.left = `${placed.left}px`;
    element.style.top = `${placed.top}px`;
    element.style.width = `${placed.width}px`;
    element.style.height = `${placed.height}px`;
    return placed;
}

// The whole layer in one pass. Lines carry their source box on the element as a
// fraction of the rendered frame (data-box-*), so the same markup re-fits itself
// against whatever the frame currently measures — a scrolled image in the reader, a
// resized window in the gaming overlay.
export function layoutOcrOverlayLines(
    layer: ParentNode,
    frame: OcrOverlayFrame,
    fontScale: number,
    layerTransform: OcrLinearTransform | null = null,
    knownTypeface?: string,
): void {
    const lines = layer.querySelectorAll<HTMLElement>('.jpdb-ocr-line');
    const typeface = knownTypeface ?? (lines.length > 0 ? ocrLayerTypeface(lines[0]) : '');
    lines.forEach(element => {
        layoutOcrLineElement(element, {
            text: element.dataset.ocrText ?? '',
            box: {
                left: frame.imageLeft + Number(element.dataset.boxLeft) * frame.imageWidth,
                top: frame.imageTop + Number(element.dataset.boxTop) * frame.imageHeight,
                width: Number(element.dataset.boxWidth) * frame.imageWidth,
                height: Number(element.dataset.boxHeight) * frame.imageHeight,
            },
            frame,
            vertical: element.dataset.vertical === 'true',
            fontScale,
            typeface,
            layerTransform,
        });
    });
}

// The one thing besides its own markup that changes how long a line is: the face it is set
// in. Every line on a layer inherits the same `--jpdb-reader-font`, and the reader moves
// that under them when the font setting changes without re-typesetting anything, so it is
// read once for the whole layer — before the pass has written a single style, when the
// style tree is still clean — and folded into what each line remembers about its length.
// Japanese advances a full em in any face, so what this actually protects is a line with
// latin or punctuation in it. Only real engines have a live computed style (jsdom caches
// it per element), so this is exercised by scripts/ocr-line-register-smoke.mjs, not by the
// jsdom suites.
function ocrLayerTypeface(line: HTMLElement): string {
    const view = line.ownerDocument.defaultView;
    return view ? view.getComputedStyle(line).fontFamily : '';
}

/** Read a layer's typeface during the gather phase, before any overlay writes. */
export function ocrOverlayTypeface(layer: ParentNode): string {
    const line = layer.querySelector<HTMLElement>('.jpdb-ocr-line');
    return line ? ocrLayerTypeface(line) : '';
}

// The size the fit is measured at. One reading is enough: text advances scale linearly
// with the font, so the source box divided by the measured length gives the size directly.
const OCR_FIT_MEASURE_PX = 32;

// A line's length in its own type depends only on its markup and the face it is set in, so
// it outlives the pass that measured it. Remembering it matters: the reader re-fits every
// line of an OCR'd image on each animation frame while the page scrolls, and taking the
// reading again means a second forced reflow per line per frame (measured at about twice
// the cost of the whole pass). The remembered answer is dropped the moment either of those
// changes — which is what happens when the reader annotates a line, or when the reader's
// font setting moves under it.
const rememberedLineExtents = new WeakMap<HTMLElement, { signature: string; measurement: OcrTextMeasurement }>();

// How long this line is, along the direction it runs, in the line's own type.
//
// The line AS THE PLAYER SEES IT is what has to cover the source line, so it is what gets
// measured — in both writing modes, by the same rule. Once the reader has been over a line
// its characters live in inline-flex boxes (.jpdb-reader-word, .jpdb-ocr-plain,
// .jpdb-ocr-ruby), which comes out a few percent longer than the same characters as one
// plain run; that overhead is real and it is the thing sitting on the source line. The
// reading itself costs nothing on either axis: .jpdb-ocr-furi is position:absolute in both
// modes, and reader-words-ocr.css zeroes .jpdb-ocr-ruby's padding-top for
// .jpdb-ocr-line[data-vertical="true"], so it never lands on a vertical column's inline
// axis. Measuring anything other than the rendered line — a clean copy of the source
// string, say — fits the box to a line nobody sees, and leaves the visible one overhanging
// it by that same few percent.
//
// The reading is taken at a fixed reference size, with the line's frame already cleared by
// the caller, so the answer never depends on the size or the box the line last had. It
// also may not TOUCH that DOM: the gaming overlay re-runs this pass on any childList
// mutation under the overlay root, so a probe node appended and removed here would schedule
// the next pass, forever, at one full re-typeset of every line per frame.
//
// Nothing rendered (a detached layer, a test environment that does not lay text out)
// measures 0, and ocrFontPx falls back to its em-count estimate.
function measureOcrLineExtent(
    line: HTMLElement,
    textElement: HTMLElement,
    vertical: boolean,
    typeface: string,
    layerTransform: OcrLinearTransform | null | undefined,
): OcrTextMeasurement | undefined {
    const signature = `${vertical ? 'vertical' : 'horizontal'}|${typeface}|${textElement.innerHTML}`;
    const remembered = rememberedLineExtents.get(line);
    if (remembered?.signature === signature) return remembered.measurement;
    // A vertical line wraps inside its own previous answer. Clear that frame before taking
    // the reference-size measurement.
    line.style.width = '';
    line.style.height = '';
    line.style.fontSize = `${OCR_FIT_MEASURE_PX}px`;
    const length = axisLength(paintedElementBox(textElement, layerTransform), vertical);
    if (!(length > 0)) return undefined;
    const measurement = { fontSize: OCR_FIT_MEASURE_PX, length };
    rememberedLineExtents.set(line, { signature, measurement });
    return measurement;
}

function axisLength(box: OcrLayoutSize, vertical: boolean): number {
    return vertical ? box.height : box.width;
}

// How big a line's type actually is, in the layer's own space.
//
// A23.1, one level down: once the layer carries the surface's transform, every rect read
// INSIDE it is a bounding box too — at 90 degrees a line's rect reports its height as its
// width, which sized the widest line to the whole layer and shoved it against the edge.
// The layer's transform is known exactly, so the box is taken back out of its bounding box
// the same way the layer's own was. With no transform the arithmetic is the identity and
// the rect is returned to the last bit, which is what keeps untransformed surfaces still.
function paintedElementBox(element: HTMLElement, layerTransform: OcrLinearTransform | null | undefined): OcrLayoutSize {
    const rect = element.getBoundingClientRect();
    if (!layerTransform) return { width: rect.width, height: rect.height };
    return untransformedBoxSize(rect, layerTransform, { width: element.offsetWidth, height: element.offsetHeight })
        ?? { width: rect.width, height: rect.height };
}

function applyOcrLinePadding(element: HTMLElement, padding: OcrLinePadding): void {
    element.style.setProperty('--jpdb-ocr-pad-x', `${padding.padX}px`);
    element.style.setProperty('--jpdb-ocr-pad-top', `${padding.padTop}px`);
    element.style.setProperty('--jpdb-ocr-pad-bottom', `${padding.padBottom}px`);
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * The part of a rect this module reads. DOMRect satisfies it, and so does the
 * untransformed border box recovered by ocrOverlayLayerPlacement — which is the box the
 * frame math has to run in once the layer carries the surface's own transform.
 */
export interface OcrSurfaceRect {
    left: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
}

export interface OcrPaintedImage {
    image: HTMLImageElement;
    /** Border-box rect of the element showing the picture. */
    rect: OcrSurfaceRect;
    style: CSSStyleDeclaration;
    objectFit: string;
    objectPosition: string;
    /** Intrinsic size of the picture being shown. */
    sourceWidth: number;
    sourceHeight: number;
}

// Where the picture is actually painted inside the element that shows it. `object-fit`
// letterboxes a picture whose aspect ratio differs from its element, so the picture
// occupies a centered sub-rect — and THAT rect, never the element's own box, is the
// space OCR boxes were mapped into. Taking the element instead is identity only while
// the element keeps the shape the picture was measured at, and walks every line off its
// text the moment it does not (a scrolled/zoomed image in the reader, a resized window
// in the gaming overlay). Answered relative to the element's border box, which is the
// space its OCR layer covers.
export function paintedImageFrame(input: OcrPaintedImage): OcrOverlayFrame {
    const content = imageContentBox(input.image, input.rect, input.style);
    const object = fittedObjectSize(input.objectFit, input.sourceWidth, input.sourceHeight, content.width, content.height);
    const offset = objectPositionOffset(input.objectPosition, content.width - object.width, content.height - object.height);
    return {
        imageLeft: content.left + offset.x,
        imageTop: content.top + offset.y,
        imageWidth: Math.max(1, object.width),
        imageHeight: Math.max(1, object.height),
    };
}

export function imageContentBox(image: HTMLImageElement, rect: OcrSurfaceRect, style: CSSStyleDeclaration): OcrRect {
    const scaleX = rectScale(rect.width, image.offsetWidth);
    const scaleY = rectScale(rect.height, image.offsetHeight);
    const left = scaledBoxEdge(style.borderLeftWidth, scaleX) + scaledBoxEdge(style.paddingLeft, scaleX);
    const right = scaledBoxEdge(style.borderRightWidth, scaleX) + scaledBoxEdge(style.paddingRight, scaleX);
    const top = scaledBoxEdge(style.borderTopWidth, scaleY) + scaledBoxEdge(style.paddingTop, scaleY);
    const bottom = scaledBoxEdge(style.borderBottomWidth, scaleY) + scaledBoxEdge(style.paddingBottom, scaleY);
    return {
        left,
        top,
        width: Math.max(1, rect.width - left - right),
        height: Math.max(1, rect.height - top - bottom),
    };
}

function rectScale(rectSize: number, layoutSize: number): number {
    return layoutSize > 0 ? rectSize / layoutSize : 1;
}

function scaledBoxEdge(value: string, scale: number): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed * scale : 0;
}

export function fittedObjectSize(
    objectFit: string,
    sourceWidth: number,
    sourceHeight: number,
    contentWidth: number,
    contentHeight: number,
): { width: number; height: number } {
    const safeSourceWidth = Math.max(1, sourceWidth);
    const safeSourceHeight = Math.max(1, sourceHeight);
    const safeContentWidth = Math.max(1, contentWidth);
    const safeContentHeight = Math.max(1, contentHeight);
    const contain = () => scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.min(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
    switch (objectFit) {
        case 'contain':
            return contain();
        case 'cover':
            return scaledObjectSize(safeSourceWidth, safeSourceHeight, Math.max(safeContentWidth / safeSourceWidth, safeContentHeight / safeSourceHeight));
        case 'none':
            return { width: safeSourceWidth, height: safeSourceHeight };
        case 'scale-down': {
            const contained = contain();
            return contained.width < safeSourceWidth || contained.height < safeSourceHeight
                ? contained
                : { width: safeSourceWidth, height: safeSourceHeight };
        }
        case 'fill':
        default:
            return { width: safeContentWidth, height: safeContentHeight };
    }
}

function scaledObjectSize(width: number, height: number, scale: number): { width: number; height: number } {
    return {
        width: Math.max(1, width * scale),
        height: Math.max(1, height * scale),
    };
}

export function objectPositionOffset(value: string, freeX: number, freeY: number): { x: number; y: number } {
    const tokens = cssPositionTokens(value);
    const axes = parseObjectPositionAxes(tokens);
    return {
        x: axisPositionOffset(axes.x, freeX),
        y: axisPositionOffset(axes.y, freeY),
    };
}

type OcrObjectPositionAxis = { keyword?: string; token?: string; offset?: string };

function cssPositionTokens(value: string): string[] {
    return value.trim().match(/(?:calc\([^)]*\)|[^\s]+)/g) ?? [];
}

function parseObjectPositionAxes(tokens: string[]): { x: OcrObjectPositionAxis; y: OcrObjectPositionAxis } {
    const paired = parseKeywordPositionAxes(tokens);
    if (paired) return paired;
    const [first = '50%', second] = tokens;
    if (isVerticalPositionKeyword(first)) return { x: positionAxis(second || '50%'), y: positionAxis(first) };
    return { x: positionAxis(first), y: positionAxis(second || '50%') };
}

function parseKeywordPositionAxes(tokens: string[]): { x: OcrObjectPositionAxis; y: OcrObjectPositionAxis } | null {
    let x: OcrObjectPositionAxis | null = null;
    let y: OcrObjectPositionAxis | null = null;
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (isHorizontalPositionKeyword(token)) {
            x = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
            continue;
        }
        if (isVerticalPositionKeyword(token)) {
            y = { keyword: token, offset: positionOffsetToken(tokens[index + 1]) };
        }
    }
    return x || y ? { x: x ?? positionAxis('50%'), y: y ?? positionAxis('50%') } : null;
}

function positionAxis(token: string): OcrObjectPositionAxis {
    return positionKeyword(token) ? { keyword: token } : { token };
}

function positionOffsetToken(token: string | undefined): string | undefined {
    return token && !positionKeyword(token) ? token : undefined;
}

function axisPositionOffset(axis: OcrObjectPositionAxis, freeSpace: number): number {
    const base = axis.keyword ? keywordPositionOffset(axis.keyword, freeSpace) : tokenPositionOffset(axis.token, freeSpace);
    const offset = cssLengthPx(axis.offset);
    if (axis.keyword === 'right' || axis.keyword === 'bottom') return base - offset;
    return base + offset;
}

function keywordPositionOffset(keyword: string, freeSpace: number): number {
    if (keyword === 'right' || keyword === 'bottom') return freeSpace;
    if (keyword === 'center') return freeSpace / 2;
    return 0;
}

function tokenPositionOffset(token: string | undefined, freeSpace: number): number {
    if (!token) return freeSpace / 2;
    if (token.endsWith('%')) return freeSpace * (Number.parseFloat(token) || 0) / 100;
    return cssLengthPx(token);
}

function cssLengthPx(value: string | undefined): number {
    if (!value) return 0;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function positionKeyword(token: string | undefined): token is string {
    return isHorizontalPositionKeyword(token) || isVerticalPositionKeyword(token) || token === 'center';
}

function isHorizontalPositionKeyword(token: string | undefined): token is string {
    return token === 'left' || token === 'right';
}

function isVerticalPositionKeyword(token: string | undefined): token is string {
    return token === 'top' || token === 'bottom';
}

// ─── The surface's own transform ─────────────────────────────────────────────────────
//
// A23.1. getBoundingClientRect answers the AXIS-ALIGNED BOUNDING BOX of a transformed
// element, not the box the picture is painted in. For an image under rotate(-3deg) that
// box measured 444.25 x 609.66 against a layout box of 414 x 589 — inflated by 1.073 in x
// and 1.035 in y, so laying lines out linearly inside it stretched the whole grid
// ANISOTROPICALLY and walked each reading off its glyphs (~20px on a 30px column).
//
// The layer is therefore sized as the surface's UNTRANSFORMED border box and given the
// surface's own transform to carry, so line geometry stays in the one space OCR boxes were
// ever expressed in — fractions of the painted picture — and the compositor rotates the
// finished layer exactly as it rotates the picture. The alternative was mounting the layer
// inside the transformed element to inherit the transform for free, which this codebase
// cannot do: an <img> takes no children, so it would mean wrapping host DOM on
// BookWalker/MangaFire (clipping, stacking and scroll containers all change under the
// wrapper), and the canvas/background/video paths overlay a synthesized <img> appended to
// document.body that has no host parent to mount into at all.
//
// Only the linear part of each representable 2D transform is read. The translation is
// recovered from the measured rect below, so ordinary rotations and skews compose through
// transformed ancestors without reimplementing layout. This is deliberately not a claim
// for every CSS transform: perspective/3D stays on the shipped path, as do exact half-turns
// and orientation-reversing flips because carrying those transforms would make OCR text
// upside-down or mirrored. Canvas sub-region rects and visible paused-video frame images
// are also kept axis-aligned by the controller because they are not whole transformed
// element boxes.
export interface OcrLinearTransform {
    a: number;
    b: number;
    c: number;
    d: number;
}

interface OcrLayoutSize {
    width: number;
    height: number;
}

export interface OcrLayerPlacement {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Value for the layer's `transform`; '' when the layer must stay axis-aligned. */
    transform: string;
    /**
     * The transform the layer ends up carrying, or null when it carries none. Line layout
     * needs it as well: every rect measured inside a transformed layer is a bounding box.
     */
    linear: OcrLinearTransform | null;
}

const IDENTITY_TRANSFORM: OcrLinearTransform = { a: 1, b: 0, c: 0, d: 1 };
const TRANSFORM_EPSILON = 1e-6;
// Below this the bounding box stops carrying two independent extents (at 45 degrees both
// extents are the same sum of the two sides), so the box cannot be inverted and the
// element's own layout box has to answer instead.
const MIN_INVERTIBLE_DETERMINANT = 0.05;
// A surface's ancestor transform chain is stable while the page scrolls. Cache it per
// surface, and let the controller invalidate only surfaces below a mutated ancestor.
// `globalEpoch` is reserved for infrequent whole-viewport signals such as resize,
// orientation, and fullscreen; it is not bumped by ordinary DOM mutations.
const rememberedAncestorTransforms =
    new WeakMap<HTMLElement, [number, Element, string, OcrLinearTransform | null]>();
let composedTransformGlobalEpoch = 0;

export function forgetComposedOcrSurfaceTransform(element: HTMLElement): void {
    rememberedAncestorTransforms.delete(element);
}

export function forgetAllComposedOcrSurfaceTransforms(): void {
    composedTransformGlobalEpoch += 1;
}

/**
 * The transform between the surface's own box and the space the OCR layer is positioned
 * in, or null when there is nothing to apply.
 *
 * `mountParent` is where the layer is appended: the layer already inherits everything
 * above that, so counting it again would transform the layer twice.
 */
export function composedOcrSurfaceTransform(
    element: HTMLElement,
    mountParent: Element | null,
    _rect: OcrSurfaceRect,
    fresh = false,
): OcrLinearTransform | null {
    const view = element.ownerDocument.defaultView;
    if (!view) return null;
    const ownTransform = view.getComputedStyle(element).transform;
    const stop = mountParent?.contains(element) ? mountParent : element.ownerDocument.body;
    const remembered = rememberedAncestorTransforms.get(element);
    if (!fresh
        && remembered?.[0] === composedTransformGlobalEpoch
        && remembered[1] === stop
        && remembered[2] === ownTransform) {
        return remembered[3];
    }
    let composed = parseCssTransformLinear(ownTransform);
    for (let node = element.parentElement; node && node !== stop && composed; node = node.parentElement) {
        composed = multiplyTransforms(parseCssTransformLinear(view.getComputedStyle(node).transform), composed);
    }
    const transform = composed && !isIdentityTransform(composed) ? composed : null;
    rememberedAncestorTransforms.set(element, [composedTransformGlobalEpoch, stop, ownTransform, transform]);
    return transform;
}

/**
 * Where the OCR layer goes, and what transform it carries.
 *
 * An untransformed surface — every BookWalker page, MangaFire image and paused YouTube
 * frame — returns the measured rect verbatim and no transform, so nothing on those
 * surfaces moves. An upright scale or translation is left on that same path deliberately:
 * its bounding box IS the painted box, so the shipped arithmetic is already right there
 * and re-deriving it would only introduce rounding.
 */
export function ocrOverlayLayerPlacement(
    rect: OcrSurfaceRect,
    linear: OcrLinearTransform | null,
    layout: OcrLayoutSize,
): OcrLayerPlacement {
    const axisAligned = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        transform: '',
        linear: null,
    };
    if (!linear || keepsReadableAxisAlignedPath(linear)) return axisAligned;
    const size = untransformedBoxSize(rect, linear, layout);
    if (!size) return axisAligned;
    const { a, b, c, d } = linear;
    const spanX = a * size.width;
    const spanY = c * size.height;
    return {
        // The rect's origin is the least corner of the transformed box, so the box's own
        // origin sits back along whichever corners the transform pushed out first.
        left: rect.left - Math.min(0, spanX, spanY, spanX + spanY),
        top: rect.top - Math.min(0, b * size.width, d * size.height, b * size.width + d * size.height),
        width: size.width,
        height: size.height,
        transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`,
        linear,
    };
}

// The measured bounding box carries the box it came from: its extents are
// |a|w + |c|h and |b|w + |d|h, two equations in the two sides. Solving them is better
// than reading offsetWidth/offsetHeight, which is rounded to whole pixels and answers in
// unzoomed units — this inversion is exact to the rect and stays in the rect's own units,
// so a page zoom under a rotation comes out right as well.
function untransformedBoxSize(
    rect: OcrSurfaceRect,
    linear: OcrLinearTransform,
    layout: OcrLayoutSize,
): OcrLayoutSize | null {
    const a = Math.abs(linear.a);
    const b = Math.abs(linear.b);
    const c = Math.abs(linear.c);
    const d = Math.abs(linear.d);
    const determinant = a * d - c * b;
    if (Math.abs(determinant) >= MIN_INVERTIBLE_DETERMINANT) {
        const width = (d * rect.width - c * rect.height) / determinant;
        const height = (a * rect.height - b * rect.width) / determinant;
        if (width > 0 && height > 0) return { width, height };
    }
    return layout.width > 0 && layout.height > 0 ? layout : null;
}

function isIdentityTransform(linear: OcrLinearTransform): boolean {
    return Math.abs(linear.a - 1) < TRANSFORM_EPSILON
        && Math.abs(linear.d - 1) < TRANSFORM_EPSILON
        && Math.abs(linear.b) < TRANSFORM_EPSILON
        && Math.abs(linear.c) < TRANSFORM_EPSILON;
}

// Upright positive scales already have a truthful bounding box. Orientation-reversing
// transforms and exact axis-aligned half-turns stay here as an explicit readability
// trade-off: their OCR text can be offset, but it remains readable instead of being
// mirrored or upside-down with the pixels.
function keepsReadableAxisAlignedPath(linear: OcrLinearTransform): boolean {
    const axisAligned = Math.abs(linear.b) < TRANSFORM_EPSILON
        && Math.abs(linear.c) < TRANSFORM_EPSILON;
    if (axisAligned && linear.a > 0 && linear.d > 0) return true;
    const determinant = linear.a * linear.d - linear.b * linear.c;
    if (determinant < -TRANSFORM_EPSILON) return true;
    return axisAligned && linear.a < 0 && linear.d < 0;
}

function multiplyTransforms(
    outer: OcrLinearTransform | null,
    inner: OcrLinearTransform,
): OcrLinearTransform | null {
    if (!outer) return null;
    return {
        a: outer.a * inner.a + outer.c * inner.b,
        b: outer.b * inner.a + outer.d * inner.b,
        c: outer.a * inner.c + outer.c * inner.d,
        d: outer.b * inner.c + outer.d * inner.d,
    };
}

/**
 * The linear part of a computed `transform`, or null for anything a 2D placement cannot
 * honestly represent (perspective, out-of-plane rotation) — those keep the shipped
 * axis-aligned behaviour rather than a guessed projection.
 *
 * Real engines always answer in matrix form. The function list is parsed because jsdom
 * hands back the authored string, and because a userscript can be running against an
 * engine that has not normalized it yet.
 */
export function parseCssTransformLinear(value: string): OcrLinearTransform | null {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'none') return IDENTITY_TRANSFORM;
    let composed = IDENTITY_TRANSFORM;
    for (const [name, args] of transformFunctions(trimmed)) {
        const step = transformFunctionLinear(name, args);
        if (!step) return null;
        composed = multiplyTransforms(composed, step) ?? IDENTITY_TRANSFORM;
    }
    return composed;
}

function transformFunctions(value: string): Array<[string, string[]]> {
    const functions: Array<[string, string[]]> = [];
    const pattern = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
    for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
        functions.push([match[1].toLowerCase(), match[2].split(',').map(part => part.trim())]);
    }
    return functions;
}

function transformFunctionLinear(name: string, args: Array<number | string>): OcrLinearTransform | null {
    const numbers = args.map(arg => Number.parseFloat(String(arg)));
    switch (name) {
        case 'matrix':
            return numbers.length >= 4 && numbers.slice(0, 4).every(Number.isFinite)
                ? { a: numbers[0], b: numbers[1], c: numbers[2], d: numbers[3] }
                : null;
        case 'matrix3d':
            return flatMatrix3dLinear(numbers);
        // Translation moves the box without reshaping it, and the move is already in the
        // measured rect.
        case 'translate':
        case 'translatex':
        case 'translatey':
        case 'translatez':
        case 'translate3d':
        case 'none':
            return IDENTITY_TRANSFORM;
        case 'scale':
        case 'scale3d': {
            const scaleX = Number.isFinite(numbers[0]) ? numbers[0] : 1;
            const scaleY = Number.isFinite(numbers[1]) ? numbers[1] : scaleX;
            return { a: scaleX, b: 0, c: 0, d: scaleY };
        }
        case 'scalex':
            return Number.isFinite(numbers[0]) ? { a: numbers[0], b: 0, c: 0, d: 1 } : null;
        case 'scaley':
            return Number.isFinite(numbers[0]) ? { a: 1, b: 0, c: 0, d: numbers[0] } : null;
        case 'rotate':
        case 'rotatez': {
            const radians = cssAngleRadians(String(args[0] ?? ''));
            return radians === null ? null : {
                a: Math.cos(radians),
                b: Math.sin(radians),
                c: -Math.sin(radians),
                d: Math.cos(radians),
            };
        }
        case 'skew':
        case 'skewx':
        case 'skewy': {
            const first = cssAngleRadians(String(args[0] ?? '0deg'));
            const second = args.length > 1 ? cssAngleRadians(String(args[1])) : 0;
            if (first === null || second === null) return null;
            if (name === 'skewy') return { a: 1, b: Math.tan(first), c: 0, d: 1 };
            return { a: 1, b: Math.tan(second ?? 0), c: Math.tan(first), d: 1 };
        }
        default:
            return null;
    }
}

// A matrix3d is usable exactly when it is a 2D affine matrix wearing four rows: no
// out-of-plane term, no perspective.
function flatMatrix3dLinear(numbers: number[]): OcrLinearTransform | null {
    if (numbers.length < 16 || !numbers.every(Number.isFinite)) return null;
    const flat = [2, 3, 6, 7, 8, 9, 11, 14].every(index => Math.abs(numbers[index]) < TRANSFORM_EPSILON)
        && Math.abs(numbers[10] - 1) < TRANSFORM_EPSILON
        && Math.abs(numbers[15] - 1) < TRANSFORM_EPSILON;
    return flat ? { a: numbers[0], b: numbers[1], c: numbers[4], d: numbers[5] } : null;
}

function cssAngleRadians(value: string): number | null {
    const amount = Number.parseFloat(value);
    if (!Number.isFinite(amount)) return null;
    if (value.endsWith('rad')) return amount;
    if (value.endsWith('turn')) return amount * 2 * Math.PI;
    if (value.endsWith('grad')) return amount * Math.PI / 200;
    return amount * Math.PI / 180;
}
