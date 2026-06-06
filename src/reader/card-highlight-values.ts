const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff々〆]/u;

export interface CardHighlightTarget {
    spelling: string;
    reading?: string;
    vid?: number | string;
    sid?: number | string;
}

export function cardHighlightTargets(card: CardHighlightTarget): string[] {
    const spelling = cleanCardHighlightValue(card.spelling);
    const reading = optionalJapaneseCardReading(card);
    return uniqueCardHighlightValues([spelling, reading]);
}

export function normalizedJapaneseCardReading(spelling: string, reading: string | undefined): string {
    const cleanSpelling = cleanCardHighlightValue(spelling);
    const cleanReading = cleanCardHighlightValue(reading);
    return cleanReading && JAPANESE_TEXT_RE.test(cleanReading) ? cleanReading : cleanSpelling;
}

export function cleanCardHighlightValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function compactCardHighlightValue(value: string): string {
    return cleanCardHighlightValue(value).replace(/\s+/g, '');
}

function optionalJapaneseCardReading(card: CardHighlightTarget): string {
    const spelling = cleanCardHighlightValue(card.spelling);
    const reading = normalizedJapaneseCardReading(spelling, card.reading);
    return reading && reading !== spelling ? reading : '';
}

function uniqueCardHighlightValues(values: string[]): string[] {
    const seen = new Set<string>();
    return values
        .map(cleanCardHighlightValue)
        .filter(value => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}
