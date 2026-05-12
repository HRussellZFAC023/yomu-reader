export const KANJI_RE = /[\p{Script=Han}\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef\u3005\u3006\u3007々〆ヶ]/u;
export const JAPANESE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;

export function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function decodeEntities(value: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
}

export function canonicalUchisenUrl(value: string): string {
    let url = value.trim();
    if (!/^https?:\/\//i.test(url)) {
        if (url.startsWith('/')) url = `https://ik.imagekit.io/uchisen${url}`;
        else if (url.startsWith('generated_')) url = `https://ik.imagekit.io/uchisen/generated/saved/${url}`;
        else url = `https://ik.imagekit.io/uchisen/${url}`;
    }
    try {
        const parsed = new URL(url);
        parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');
        parsed.search = '';
        parsed.hash = '';
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url.replace(/\/{2,}/g, '/').split(/[?#]/)[0];
    }
}

export function reviewItemsLeftCount(htmlOrText: string): string {
    const decoded = decodeEntities(htmlOrText.replace(/<[^>]+>/g, ' '));
    return decoded.match(/\(([\d,]+)\)/)?.[1] ?? decoded.match(/\b(\d{1,6})\b/)?.[1] ?? '';
}

export function firstJapaneseRun(value: string): string {
    return value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/u)?.[0] ?? cleanText(value);
}

export function firstReviewGlyph(text: string): string | null {
    const direct = text.match(KANJI_RE);
    if (direct) return direct[0];
    try {
        return decodeURIComponent(text).match(KANJI_RE)?.[0] ?? null;
    } catch {
        return null;
    }
}

export function kanjiVgUrl(glyph: string): string {
    const hex = glyph.codePointAt(0)?.toString(16).padStart(5, '0') ?? '';
    return `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`;
}
