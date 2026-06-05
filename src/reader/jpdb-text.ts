export const KANJI_RE = /[\p{Script=Han}\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef\u3005\u3006\u3007々〆ヶ]/u;
export const JAPANESE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const JPDB_BASE_URL = 'https://jpdb.io';
const JAPANESE_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3005\u3006\u3007々〆ヶー]+/u;

export interface JpdbVocabularyUrlIdentity {
    vid: number;
    expression: string;
    reading: string;
}

export function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

export function decodePathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

export function absoluteJpdbUrl(value: string, fallback = ''): string {
    try {
        return new URL(value || '/', JPDB_BASE_URL).toString();
    } catch {
        return fallback;
    }
}

export function parseJpdbVocabularyUrl(value: string): JpdbVocabularyUrlIdentity | null {
    if (!value) return null;
    try {
        return parseJpdbVocabularyPath(new URL(value, JPDB_BASE_URL).pathname);
    } catch {
        return null;
    }
}

function parseJpdbVocabularyPath(pathname: string): JpdbVocabularyUrlIdentity | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'vocabulary') return null;
    const vid = Number.parseInt(parts[1] ?? '', 10);
    const reading = decodePathPart(parts[3] ?? '');
    return {
        vid: Number.isFinite(vid) ? vid : 0,
        expression: decodePathPart(parts[2] ?? ''),
        reading: JAPANESE_RE.test(reading) ? reading : '',
    };
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

export function firstJapaneseRun(value: string): string {
    return value.match(JAPANESE_RUN_RE)?.[0] ?? cleanText(value);
}

export function firstJapaneseRunOrEmpty(value: string): string {
    return cleanText(value.match(JAPANESE_RUN_RE)?.[0] ?? '');
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
