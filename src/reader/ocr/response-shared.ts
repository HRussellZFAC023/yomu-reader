import { HAS_JAPANESE } from '../dom/index';

export interface OcrRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface OcrLine {
    text: string;
    box: OcrRect;
    vertical: boolean;
}

export interface OcrResult {
    width: number;
    height: number;
    lines: OcrLine[];
}

export function pushJapaneseOcrLine(lines: OcrLine[], text: string, box: OcrRect | null): void {
    if (!text || !box || !HAS_JAPANESE.test(text)) return;
    lines.push({ text, box, vertical: isVerticalOcrBox(box, text.length) });
}

// Orientation fallback for OCR engines that don't report a writing direction.
// Vertical Japanese stacks N glyphs top-to-bottom, so its box is ~N glyphs tall
// and one glyph wide (aspect ratio ≈ N); a horizontal line of N glyphs is the
// transpose (aspect ≈ 1/N). So "taller than wide" is the vertical signal — but
// a short 2–3 glyph phrase can be near-square either way, so it needs a clearer
// margin than a longer column, where even a slightly-taller-than-wide box can
// only be vertical (a horizontal run of 4+ glyphs is always much wider than
// tall). A single glyph has no orientation. Previously this required a flat
// 1.25 height/width ratio regardless of length, which misread near-square
// vertical columns (e.g. a two-kanji 講師 box) as horizontal.
export function isVerticalOcrBox(box: OcrRect, textLength: number): boolean {
    if (textLength <= 1) return false;
    const aspect = box.height / Math.max(1, box.width);
    return aspect >= (textLength >= 4 ? 1.05 : 1.2);
}

export function clampBox(box: OcrRect, width: number, height: number): OcrRect | null {
    const left = Math.max(0, Math.min(width, box.left));
    const top = Math.max(0, Math.min(height, box.top));
    const right = Math.max(left, Math.min(width, box.left + Math.max(0, box.width)));
    const bottom = Math.max(top, Math.min(height, box.top + Math.max(0, box.height)));
    if (right - left < 2 || bottom - top < 2) return null;
    return { left, top, width: right - left, height: bottom - top };
}

export function unionBoxes(boxes: OcrRect[]): OcrRect | null {
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.left));
    const top = Math.min(...boxes.map(box => box.top));
    const right = Math.max(...boxes.map(box => box.left + box.width));
    const bottom = Math.max(...boxes.map(box => box.top + box.height));
    return { left, top, width: right - left, height: bottom - top };
}

export function cleanOcrText(value: unknown): string {
    const text = typeof value === 'string' ? value : String(value ?? '');
    const normalized = text.replace(/[ \t\r\n]+/g, HAS_JAPANESE.test(text) ? '' : ' ').trim();
    return normalized.replaceAll('．．．', '…');
}

export function numberFrom(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
