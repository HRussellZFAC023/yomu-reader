import type { LanguageTextSegment } from './types';

export interface LookupSurfaceSpan {
    term: string;
    start: number;
    end: number;
    codePoints: number;
}

/**
 * A UTF-16 offset that is also a Unicode code-point boundary.
 *
 * Browser ranges and IndexedDB matches use UTF-16 offsets, while lookup limits
 * are counts of visible code points. Keeping this conversion in one place
 * prevents supplementary ideographs from being split into lone surrogates.
 */
export function codePointBoundaryAtOrBefore(text: string, offset: number): number {
    const clamped = Math.max(0, Math.min(offset, text.length));
    if (
        clamped > 0
        && clamped < text.length
        && isLowSurrogate(text.charCodeAt(clamped))
        && isHighSurrogate(text.charCodeAt(clamped - 1))
    ) {
        return clamped - 1;
    }
    return clamped;
}

export function codePointBoundaryAtOrAfter(text: string, offset: number): number {
    const before = codePointBoundaryAtOrBefore(text, offset);
    return before === offset ? before : Math.min(text.length, before + 2);
}

export function codePointSafePrefix(text: string, maxUtf16Units: number): string {
    return text.slice(0, codePointBoundaryAtOrBefore(text, maxUtf16Units));
}

/**
 * Every bounded substring that starts inside [from, to), longest first at each
 * start. Segment coordinates remain UTF-16 so the result can be painted back
 * into the DOM without conversion.
 */
export function lookupSpansStartingInRange(
    text: string,
    segment: LanguageTextSegment,
    from: number,
    to: number,
    maxCodePoints: number,
): LookupSurfaceSpan[] {
    const offsets = codePointOffsets(text, segment.start, segment.end);
    const spans: LookupSurfaceSpan[] = [];
    for (let startIndex = 0; startIndex < offsets.length - 1; startIndex++) {
        const start = offsets[startIndex]!;
        if (start < from || start >= to) continue;
        const lastEndIndex = Math.min(offsets.length - 1, startIndex + maxCodePoints);
        for (let endIndex = lastEndIndex; endIndex > startIndex; endIndex--) {
            const end = offsets[endIndex]!;
            spans.push({
                term: text.slice(start, end),
                start,
                end,
                codePoints: endIndex - startIndex,
            });
        }
    }
    return spans;
}

/**
 * Bounded substrings containing one pointer code point, longest first.
 */
export function lookupSpansContainingOffset(
    text: string,
    segment: Pick<LanguageTextSegment, 'start' | 'end'>,
    pointerOffset: number,
    maxCodePoints: number,
    startWindow: number,
): LookupSurfaceSpan[] {
    const offsets = codePointOffsets(text, segment.start, segment.end);
    const pointer = codePointBoundaryAtOrBefore(text, pointerOffset);
    const pointerIndex = offsets.findIndex((start, index) =>
        index < offsets.length - 1 && start <= pointer && pointer < offsets[index + 1]!,
    );
    if (pointerIndex < 0) return [];

    const firstStartIndex = Math.max(0, pointerIndex - startWindow);
    const spans: LookupSurfaceSpan[] = [];
    for (let startIndex = firstStartIndex; startIndex <= pointerIndex; startIndex++) {
        const lastEndIndex = Math.min(offsets.length - 1, startIndex + maxCodePoints);
        for (let endIndex = pointerIndex + 1; endIndex <= lastEndIndex; endIndex++) {
            spans.push({
                term: text.slice(offsets[startIndex]!, offsets[endIndex]!),
                start: offsets[startIndex]!,
                end: offsets[endIndex]!,
                codePoints: endIndex - startIndex,
            });
        }
    }
    return spans.sort((a, b) =>
        b.codePoints - a.codePoints
        || a.start - b.start
        || a.end - b.end,
    );
}

function codePointOffsets(text: string, start: number, end: number): number[] {
    const safeStart = codePointBoundaryAtOrAfter(text, start);
    const safeEnd = codePointBoundaryAtOrBefore(text, end);
    const offsets = [safeStart];
    let offset = safeStart;
    for (const character of text.slice(safeStart, safeEnd)) {
        offset += character.length;
        offsets.push(offset);
    }
    return offsets;
}

function isHighSurrogate(value: number): boolean {
    return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
    return value >= 0xdc00 && value <= 0xdfff;
}
