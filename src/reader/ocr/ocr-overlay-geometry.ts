import type { OcrRect } from './response';

// Every OCR surface anchors recognized text over a source box, so every one of them
// needs the same answer to "how big is this line?". Sizing it per surface is what let
// the gaming overlay drift out of register with the text underneath it.
export function ocrFontPx(text: string, boxWidth: number, boxHeight: number, vertical: boolean, scale: number): number {
    const safeScale = Math.max(0.7, Math.min(1.8, scale));
    const length = Math.max(1, visualTextLength(text));
    const byBoxThickness = vertical ? boxWidth * 0.72 : boxHeight * 0.58;
    const byBoxLength = vertical ? (boxHeight / length) * 1.12 : (boxWidth / length) * 1.08;
    const fitted = Math.min(byBoxThickness, byBoxLength) * safeScale;
    return Math.max(11, Math.min(38, fitted));
}

// Kana and kanji occupy a full em; latin and whitespace do not. Counting characters
// instead would oversize any line with punctuation or romaji in it.
export function visualTextLength(text: string): number {
    return [...text.trim()].reduce((total, char) => {
        if (/\s/.test(char)) return total + 0.35;
        if ((char.codePointAt(0) ?? 0) <= 0xff) return total + 0.62;
        return total + 1;
    }, 0);
}

export function shouldCenterOcrText(text: string): boolean {
    return visualTextLength(text) <= 1.5;
}

const OCR_WORD_UNDERLINE_OFFSET_EM = 0.12;
const OCR_WORD_UNDERLINE_THICKNESS_EM = 0.12;
const OCR_WORD_UNDERLINE_CLEARANCE_PX = 1;

export function ocrWordUnderlineBleedPx(fontSize: number): number {
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
export function ocrLinePadding(fontSize: number, vertical: boolean, hasFurigana: boolean): OcrLinePadding {
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

export interface OcrLineLayoutInput {
    text: string;
    box: OcrLineBox;
    frame: OcrOverlayFrame;
    vertical: boolean;
    fontScale: number;
}

// The single place an OCR line element is sized and placed. Both the reader's image
// overlay and the gaming overlay call this against the same markup
// (.jpdb-ocr-line > .jpdb-ocr-line-text), so a line lands at the size and position of
// the text underneath it on every surface.
export function layoutOcrLineElement(element: HTMLElement, input: OcrLineLayoutInput): OcrLineFrame | null {
    const { box, frame, vertical } = input;
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) return null;
    const fontSize = ocrFontPx(input.text, box.width, box.height, vertical, input.fontScale);
    element.style.fontSize = `${fontSize}px`;
    const textElement = element.querySelector<HTMLElement>('.jpdb-ocr-line-text');
    if (!textElement) return null;
    // Read the readings off the line rather than trusting a flag set when it was built:
    // furigana can arrive after the first paint (the gaming overlay lets the reader
    // annotate its lines in place), and a line that grew readings needs the taller top
    // gutter on the very next fit.
    const hasFurigana = Boolean(textElement.querySelector('.jpdb-reader-has-furi'));
    element.dataset.hasFuri = String(hasFurigana);
    const padding = ocrLinePadding(fontSize, vertical, hasFurigana);
    // The padding has to be on the element before the text is measured: it drives the
    // line box the re-typeset glyphs lay out inside.
    applyOcrLinePadding(element, padding);
    const contentRect = textElement.getBoundingClientRect();
    const placed = ocrLineFrame({
        text: input.text,
        box,
        frame,
        vertical,
        hasFurigana,
        fontSize,
        contentWidth: contentRect.width,
        contentHeight: contentRect.height,
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
export function layoutOcrOverlayLines(layer: ParentNode, frame: OcrOverlayFrame, fontScale: number): void {
    layer.querySelectorAll<HTMLElement>('.jpdb-ocr-line').forEach(element => {
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
        });
    });
}

function applyOcrLinePadding(element: HTMLElement, padding: OcrLinePadding): void {
    element.style.setProperty('--jpdb-ocr-pad-x', `${padding.padX}px`);
    element.style.setProperty('--jpdb-ocr-pad-top', `${padding.padTop}px`);
    element.style.setProperty('--jpdb-ocr-pad-bottom', `${padding.padBottom}px`);
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export interface OcrPaintedImage {
    image: HTMLImageElement;
    /** Border-box rect of the element showing the picture. */
    rect: DOMRect;
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

export function imageContentBox(image: HTMLImageElement, rect: DOMRect, style: CSSStyleDeclaration): OcrRect {
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
