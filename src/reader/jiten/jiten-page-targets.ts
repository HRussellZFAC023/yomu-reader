import {
    decodePathPart,
    extractBaseText,
    extractReadingText,
    uniqueLookupValues,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from '../jpdb/jpdb-page-targets';
import { cleanText, firstReviewGlyph, JAPANESE_RE } from '../jpdb/jpdb-text';

const READER_OWNED_SELECTOR = '[data-jpdb-reader-root], [data-yomu-jpdb-addon]';
const VOCAB_COLUMN_SELECTOR = 'div.flex.flex-col.max-w-2xl';
// The SRS study card renders its headword larger than vocabulary pages do, so
// include the bigger size buckets; matching stays tolerant (no match → no-op).
const HEADWORD_SELECTOR = [
    '.text-3xl[lang="ja"]',
    '.text-3xl.font-noto-sans',
    '.text-4xl[lang="ja"]',
    '.text-5xl[lang="ja"]',
    '.text-6xl[lang="ja"]',
].join(', ');
const KANJI_GLYPH_SELECTOR = '.text-9xl';

export function isJitenHost(): boolean {
    return location.hostname === 'jiten.moe' || location.hostname.endsWith('.jiten.moe');
}

export function isJitenKanjiPage(): boolean {
    return location.pathname.startsWith('/kanji/');
}

function isJitenVocabPage(): boolean {
    return location.pathname.startsWith('/vocabulary/') || location.pathname.startsWith('/parse');
}

export function isJitenStudyPage(): boolean {
    return location.pathname.startsWith('/srs/study');
}

export function isJitenEnhanceablePage(): boolean {
    return isJitenKanjiPage() || isJitenVocabPage() || isJitenStudyPage();
}

export function extractCurrentJitenKanji(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    const fromPath = parts[0] === 'kanji' && parts[1] ? firstReviewGlyph(decodePathPart(parts[1])) ?? '' : '';
    return fromPath || (firstReviewGlyph(document.querySelector<HTMLElement>(KANJI_GLYPH_SELECTOR)?.textContent ?? '') ?? '');
}

export function currentJitenTermTarget(): JpdbTermTarget | null {
    if (isJitenKanjiPage()) {
        const kanji = extractCurrentJitenKanji();
        return kanji ? { term: kanji, reading: kanji, queries: [kanji], examples: [], anchor: jitenKanjiAnchor() } : null;
    }
    const headword = jitenHeadword();
    if (!headword) return null;
    return {
        term: headword.term,
        reading: headword.reading,
        queries: uniqueLookupValues([headword.term, headword.reading, ...jitenAlternateForms()]),
        examples: [],
        anchor: jitenVocabAnchor(),
    };
}

export function currentJitenLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isJitenKanjiPage()) {
        const kanji = extractCurrentJitenKanji();
        return kanji ? [{ term: kanji, reading: kanji, alternates: [kanji], compounds: [], examples: [], anchor: jitenKanjiAnchor() }] : [];
    }
    const headword = jitenHeadword();
    if (!headword) return [];
    return [{
        term: headword.term,
        reading: headword.reading,
        alternates: uniqueLookupValues([headword.reading, ...jitenAlternateForms()]),
        compounds: [],
        examples: [],
        anchor: jitenVocabAnchor(),
    }];
}

function jitenHeadword(): { term: string; reading: string } | null {
    const element = ownedElement(document.querySelector<HTMLElement>(HEADWORD_SELECTOR));
    const domTerm = element ? cleanText(extractBaseText(element)) : '';
    if (element && domTerm && JAPANESE_RE.test(domTerm)) {
        return { term: domTerm, reading: cleanText(extractReadingText(element)) || domTerm };
    }
    const titleTerm = termFromTitle();
    return titleTerm ? { term: titleTerm, reading: titleTerm } : null;
}

function termFromTitle(): string {
    const title = cleanText(document.title.replace(/\s*[-–—|].*$/, ''));
    return JAPANESE_RE.test(title) ? title : '';
}

function jitenAlternateForms(): string[] {
    const heading = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
        .find(node => /^forms|別の表記|表記/i.test(cleanText(node.textContent ?? '')));
    if (!heading?.parentElement) return [];
    return Array.from(heading.parentElement.querySelectorAll<HTMLElement>('[lang="ja"], ruby'))
        .map(node => cleanText(extractBaseText(node)))
        .filter(value => value && JAPANESE_RE.test(value))
        .slice(0, 8);
}

function jitenVocabAnchor(): HTMLElement {
    const column = ownedElement(document.querySelector<HTMLElement>(VOCAB_COLUMN_SELECTOR));
    const lastChild = column?.lastElementChild;
    if (lastChild instanceof HTMLElement) return lastChild;
    return column ?? document.querySelector<HTMLElement>('main') ?? document.body;
}

function jitenKanjiAnchor(): HTMLElement {
    const header = ownedElement(document.querySelector<HTMLElement>('.text-center'));
    if (header) return header;
    const glyphHeader = document.querySelector<HTMLElement>(KANJI_GLYPH_SELECTOR)?.closest<HTMLElement>('.space-y-2');
    return glyphHeader ?? document.querySelector<HTMLElement>('main') ?? document.body;
}

function ownedElement<T extends HTMLElement>(element: T | null): T | null {
    return element && !element.closest(READER_OWNED_SELECTOR) ? element : null;
}
