import { JAPANESE_CHARACTER_RE } from './japanese-segments';

export interface TextRange {
    start: number;
    end: number;
}

/**
 * Finds uncovered Japanese runs without converting the UTF-16 offsets used by
 * DOM Ranges and parser tokens into code-point indexes.
 */
export function* uncoveredJapaneseRanges(
    text: string,
    rangeStart: number,
    rangeEnd: number,
    isCovered: (start: number, end: number) => boolean,
): Generator<TextRange> {
    let gapStart = -1;
    for (let index = rangeStart; index < rangeEnd;) {
        const codePoint = text.codePointAt(index);
        if (codePoint === undefined) break;
        const character = String.fromCodePoint(codePoint);
        const codePointEnd = index + character.length;
        const nextIndex = Math.min(rangeEnd, codePointEnd);
        const uncoveredJapanese = codePointEnd <= rangeEnd
            && JAPANESE_CHARACTER_RE.test(character)
            && !isCovered(index, nextIndex);
        if (uncoveredJapanese) {
            if (gapStart < 0) gapStart = index;
        } else if (gapStart >= 0) {
            yield { start: gapStart, end: index };
            gapStart = -1;
        }
        index = nextIndex;
    }
    if (gapStart >= 0) yield { start: gapStart, end: rangeEnd };
}
