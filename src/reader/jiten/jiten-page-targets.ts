import type { JpdbTermTarget, LocalDictionaryTarget } from '../jpdb/jpdb-page-targets';
import { cleanText, JAPANESE_RE } from '../jpdb/jpdb-text';

const READER_OWNED_SELECTOR = '[data-jpdb-reader-root], [data-yomu-jpdb-addon]';
const VOCAB_COLUMN_SELECTOR = 'div.flex.flex-col.max-w-2xl';
const HEADWORD_SELECTOR = '.text-3xl[lang="ja"], .text-3xl.font-noto-sans';
const KANJI_GLYPH_SELECTOR = '.text-9xl';

export function isJitenHost(): boolean {
    return location.hostname === 'jiten.moe' || location.hostname.endsWith('.jiten.moe');
}

export function isJitenKanjiPage(): boolean {
    return location.pathname.startsWith('/kanji/');
}

export function isJitenVocabPage(): boolean {
    return location.pathname.startsWith('/vocabulary/') || location.pathname.startsWith('/parse');
}

export function isJitenEnhanceablePage(): boolean {
    return isJitenKanjiPage() || isJitenVocabPage();
}

export function extractCurrentJitenKanji(): string {
    const fromPath = kanjiFromPath();
    if (fromPath) return fromPath;
    return firstKanji(document.querySelector<HTMLElement>(KANJI_GLYPH_SELECTOR)?.textContent ?? '');
}

function kanjiFromPath(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'kanji' || !parts[1]) return '';
    return firstKanji(decodePart(parts[1]));
}

function firstKanji(value: string): string {
    return Array.from(value).find(char => /[㐀-鿿豈-﫿]/.test(char)) ?? '';
}

export function currentJitenTermTarget(): JpdbTermTarget | null {
    if (isJitenKanjiPage()) return jitenKanjiTermTarget();
    return jitenVocabTermTarget();
}

function jitenKanjiTermTarget(): JpdbTermTarget | null {
    const kanji = extractCurrentJitenKanji();
    if (!kanji) return null;
    return { term: kanji, reading: kanji, queries: [kanji], examples: [], anchor: jitenKanjiAnchor() };
}

function jitenVocabTermTarget(): JpdbTermTarget | null {
    const headword = jitenHeadword();
    if (!headword) return null;
    const alternates = jitenAlternateForms();
    return {
        term: headword.term,
        reading: headword.reading,
        queries: uniqueValues([headword.term, headword.reading, ...alternates]),
        examples: [],
        anchor: jitenVocabAnchor(),
    };
}

export function currentJitenLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isJitenKanjiPage()) {
        const kanji = extractCurrentJitenKanji();
        if (!kanji) return [];
        return [{ term: kanji, reading: kanji, alternates: [kanji], compounds: [], examples: [], anchor: jitenKanjiAnchor() }];
    }
    const headword = jitenHeadword();
    if (!headword) return [];
    const alternates = jitenAlternateForms();
    return [{
        term: headword.term,
        reading: headword.reading,
        alternates: uniqueValues([headword.reading, ...alternates]),
        compounds: [],
        examples: [],
        anchor: jitenVocabAnchor(),
    }];
}

function jitenHeadword(): { term: string; reading: string } | null {
    const element = ownedElement(document.querySelector<HTMLElement>(HEADWORD_SELECTOR));
    const term = element ? cleanText(rubyBaseText(element)) : termFromTitle();
    if (!term || !JAPANESE_RE.test(term)) return termFromTitle() ? { term: termFromTitle(), reading: termFromTitle() } : null;
    const reading = element ? cleanText(rubyReadingText(element)) || term : term;
    return { term, reading };
}

function termFromTitle(): string {
    const title = cleanText(document.title.replace(/\s*[-–—|].*$/, ''));
    return JAPANESE_RE.test(title) ? title : '';
}

function jitenAlternateForms(): string[] {
    const heading = headingByText(/^forms|別の表記|表記/i);
    if (!heading) return [];
    const section = heading.parentElement;
    if (!section) return [];
    return Array.from(section.querySelectorAll<HTMLElement>('[lang="ja"], ruby'))
        .map(element => cleanText(rubyBaseText(element)))
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
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.border.rounded-lg')).filter(ownedElement);
    if (cards.length) return cards[cards.length - 1];
    const glyph = document.querySelector<HTMLElement>(KANJI_GLYPH_SELECTOR);
    const header = glyph?.closest<HTMLElement>('.space-y-2');
    return header ?? document.querySelector<HTMLElement>('main') ?? document.body;
}

function headingByText(pattern: RegExp): HTMLElement | null {
    return Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))
        .find(heading => pattern.test(cleanText(heading.textContent ?? ''))) ?? null;
}

function rubyBaseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    return Array.from(element.childNodes).map(rubyBaseText).join('');
}

function rubyReadingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RP') return '';
    if (element.tagName === 'RUBY') {
        const reading = element.querySelector('rt')?.textContent ?? '';
        return reading || rubyBaseText(element);
    }
    return Array.from(element.childNodes).map(rubyReadingText).join('');
}

function ownedElement<T extends HTMLElement>(element: T | null): T | null {
    return element && !element.closest(READER_OWNED_SELECTOR) ? element : null;
}

function decodePart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function uniqueValues(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = cleanText(value);
        const key = text.replace(/\s+/g, '').toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}
