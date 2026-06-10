// Splits a whole-word reading across the individual kanji of an all-kanji
// compound (琉球藍/りゅうきゅうあい → 琉=りゅう 球=きゅう 藍=あい) using the
// kanji readings from the user's imported kanji dictionaries. Only an exact,
// unambiguous greedy alignment splits; anything else keeps the single ruby.
export interface KanjiRubySegment {
    text: string;
    start: number;
    end: number;
}

const KANA_ONLY_RE = /^[぀-ヿー]+$/u;
const KANJI_CHAR_RE = /^[㐀-鿿々]$/u;

export function splitReadingAcrossKanji(
    base: string,
    reading: string,
    readingsForKanji: (kanji: string) => string[],
): KanjiRubySegment[] | null {
    const characters = Array.from(base);
    if (characters.length < 2 || !characters.every(char => KANJI_CHAR_RE.test(char))) return null;
    const kana = toHiragana(reading.trim());
    if (!kana || !KANA_ONLY_RE.test(kana)) return null;

    const plans = alignKanjiReadings(characters, kana, 0, readingsForKanji);
    if (plans.length !== 1) return null;
    const segments: KanjiRubySegment[] = [];
    let offset = 0;
    plans[0].forEach((segment, index) => {
        const segmentText = Array.from(reading).slice(offset, offset + segment.length).join('');
        segments.push({ text: segmentText, start: index, end: index + 1 });
        offset += segment.length;
    });
    return segments;
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
