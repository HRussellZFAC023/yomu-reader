// Splits a whole-word reading across individual kanji using readings from the
// user's imported kanji dictionaries. Shared kana affixes are trimmed first, so
// 質問する/しつもんする can align as 質=しつ 問=もん while する stays unannotated.
// Only an exact, unambiguous alignment splits; anything else keeps one ruby.
export interface KanjiRubySegment {
    text: string;
    start: number;
    end: number;
}

const KANA_ONLY_RE = /^[぀-ヿー]+$/u;
const KANA_CHAR_RE = /^[぀-ヿー]$/u;
const KANJI_CHAR_RE = /^[㐀-鿿々]$/u;

export function splitReadingAcrossKanji(
    base: string,
    reading: string,
    readingsForKanji: (kanji: string) => string[],
): KanjiRubySegment[] | null {
    if (kanjiCharacterCount(base) < 2) return null;
    const sourceReading = reading.trim();
    const kana = toHiragana(sourceReading);
    if (!kana || !KANA_ONLY_RE.test(kana)) return null;

    const trimmed = trimSharedKanaAffixes(base, kana);
    const characters = Array.from(trimmed.base);
    if (characters.length < 2 || !characters.every(char => KANJI_CHAR_RE.test(char))) return null;

    const plans = alignKanjiReadings(characters, trimmed.reading, 0, readingsForKanji);
    if (plans.length !== 1) return null;
    const readingCharacters = Array.from(sourceReading);
    const segments: KanjiRubySegment[] = [];
    let offset = trimmed.readingStart;
    plans[0].forEach((segment, index) => {
        const segmentText = readingCharacters.slice(offset, offset + segment.length).join('');
        segments.push({ text: segmentText, start: trimmed.baseStart + index, end: trimmed.baseStart + index + 1 });
        offset += segment.length;
    });
    return segments;
}

function trimSharedKanaAffixes(base: string, reading: string): { base: string; reading: string; baseStart: number; readingStart: number } {
    let baseStart = 0;
    let baseEnd = base.length;
    let readingStart = 0;
    let readingEnd = reading.length;
    while (baseStart < baseEnd && readingStart < readingEnd && sameKana(base[baseStart], reading[readingStart])) {
        baseStart += 1;
        readingStart += 1;
    }
    while (baseEnd > baseStart && readingEnd > readingStart && sameKana(base[baseEnd - 1], reading[readingEnd - 1])) {
        baseEnd -= 1;
        readingEnd -= 1;
    }
    return {
        base: base.slice(baseStart, baseEnd),
        reading: reading.slice(readingStart, readingEnd),
        baseStart,
        readingStart,
    };
}

function sameKana(base: string | undefined, reading: string | undefined): boolean {
    return Boolean(base && reading && KANA_CHAR_RE.test(base) && toHiragana(base) === reading);
}

function kanjiCharacterCount(value: string): number {
    return Array.from(value).filter(char => KANJI_CHAR_RE.test(char)).length;
}

function alignKanjiReadings(
    characters: string[],
    kana: string,
    index: number,
    readingsForKanji: (kanji: string) => string[],
): string[][] {
    if (index >= characters.length) return kana.length === 0 ? [[]] : [];
    const candidates = candidateReadings(characters[index], readingsForKanji);
    const plans: string[][] = [];
    for (const candidate of candidates) {
        if (!kana.startsWith(candidate)) continue;
        for (const rest of alignKanjiReadings(characters, kana.slice(candidate.length), index + 1, readingsForKanji)) {
            plans.push([candidate, ...rest]);
            if (plans.length > 1) return plans;
        }
    }
    return plans;
}

function candidateReadings(kanji: string, readingsForKanji: (kanji: string) => string[]): string[] {
    const seen = new Set<string>();
    for (const raw of readingsForKanji(kanji)) {
        const normalized = toHiragana(raw.trim()).replace(/[.\-．].*$/u, '');
        if (!normalized || !KANA_ONLY_RE.test(normalized)) continue;
        seen.add(normalized);
        // Rendaku and sokuon surface forms (きゅう→ぎゅう, つ→っ endings).
        const voiced = withInitialDakuten(normalized);
        if (voiced) seen.add(voiced);
        if (/[つくきち]$/u.test(normalized)) seen.add(`${normalized.slice(0, -1)}っ`);
    }
    return [...seen].sort((a, b) => b.length - a.length);
}

const DAKUTEN_MAP: Record<string, string> = {
    か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
    さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
    た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
    は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};

function withInitialDakuten(reading: string): string | null {
    const voiced = DAKUTEN_MAP[reading[0] ?? ''];
    return voiced ? `${voiced}${reading.slice(1)}` : null;
}

function toHiragana(value: string): string {
    return value.replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
}
