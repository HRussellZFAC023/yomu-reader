import { cssPixels } from './decoration-policy';

export function rubyFriendlyMirrorLineHeight(style: CSSStyleDeclaration): string {
    const fontSize = cssPixels(style.fontSize) || 16;
    const existingLineHeight = cssPixels(style.lineHeight) || fontSize * 1.2;
    // 1.62 fit the ruby glyphs but parked the reading strip against the
    // previous line's baseline on tight hosts (YouTube's ~1.3 titles);
    // 1.78 leaves an actual gap between lines of annotated text.
    return `${Math.ceil(Math.max(existingLineHeight, fontSize * 1.78))}px`;
}

export function detachedReadingLaneLineHeight(style: CSSStyleDeclaration, alreadyReserved: boolean): string {
    const fontSize = cssPixels(style.fontSize) || 16;
    // One device pixel beyond 2em keeps the reading lane visibly separate
    // across engines whose glyph boxes land on different subpixel boundaries.
    const minimum = Math.ceil(fontSize * 2) + 1;
    const current = cssPixels(style.lineHeight);
    if (alreadyReserved) return `${Math.ceil(Math.max(current, minimum))}px`;
    return current >= minimum ? '' : `${minimum}px`;
}
