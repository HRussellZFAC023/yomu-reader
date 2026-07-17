import type { OcrRect } from './response';

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
