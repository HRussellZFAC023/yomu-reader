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

function isJitenStudyPage(): boolean {
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
        const anchor = jitenKanjiAnchor();
        return kanji && anchor ? { term: kanji, reading: kanji, queries: [kanji], examples: [], anchor } : null;
    }
    const headword = jitenHeadword();
    if (!headword) return null;
    const anchor = jitenContentAnchor();
    if (!anchor) return null;
    return {
        term: headword.term,
        reading: headword.reading,
        queries: uniqueLookupValues([headword.term, headword.reading, ...jitenAlternateForms()]),
        examples: [],
        anchor,
    };
}

function jitenContentAnchor(): HTMLElement | null {
    if (isJitenStudyPage()) return jitenStudyCardAnchor();
    return jitenVocabAnchor();
}

// /srs/study: the addon belongs INSIDE the revealed study card — after the
// card's own sections (Kanji breakdown, Composed of) — and must never mount
// during the question phase, where dictionary entries would spoil the
// answer. While the answer is hidden no target is produced at all; once
// revealed, the enhancement refresh sees the missing addon and mounts it
// inside the card.
function jitenStudyCardAnchor(): HTMLElement | null {
    if (jitenStudyAnswerHidden()) return null;
    const wrap = ownedElement(document.querySelector<HTMLElement>('.relative.touch-pan-y'));
    if (!wrap) return null;
    const content = Array.from(wrap.children).find(child =>
        child instanceof HTMLElement && !/pointer-events-none/.test(String(child.className)),
    ) as HTMLElement | undefined;
    const card = content?.firstElementChild instanceof HTMLElement ? content.firstElementChild : content;
    const last = card?.lastElementChild;
    if (last instanceof HTMLElement && !last.closest(READER_OWNED_SELECTOR)) return last;
    return card ?? null;
}

function jitenStudyAnswerHidden(): boolean {
    return Array.from(document.querySelectorAll('button'))
        .some(button => /show answer/i.test(button.textContent ?? ''));
}

// The study-card front (question phase) shows only the headword; furigana or a
// pitch/status underline there spoils the reading the learner must recall. Flag
// any element inside the study card while the answer is hidden so the scan drops
// it (plain prompt) instead of annotating it — matching the hosted study page.
// Self-heals on reveal: jitenStudyAnswerHidden() flips false and the re-scan
// annotates the now-revealed card normally.
export function isJitenStudyFrontPrompt(element: HTMLElement): boolean {
    // Cheapest gates first: this runs per element during classifyDecoration, so
    // the document-wide "Show Answer" button scan only happens for elements that
    // actually sit inside the study card on the study page.
    if (!isJitenHost() || !isJitenStudyPage()) return false;
    if (!element.closest('.relative.touch-pan-y')) return false;
    return jitenStudyAnswerHidden();
}

// Per-card identity signal for the study page, readable while the answer is
// hidden (currentJitenTermTarget is null on the front). Used to scroll to the
// top only on a genuine new card, not on revealing the same card.
export function currentJitenStudyHeadwordText(): string {
    if (!isJitenHost() || !isJitenStudyPage()) return '';
    const element = document.querySelector<HTMLElement>(HEADWORD_SELECTOR);
    return element ? cleanText(extractBaseText(element)) : '';
}

export function currentJitenLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isJitenKanjiPage()) {
        const kanji = extractCurrentJitenKanji();
        const anchor = jitenKanjiAnchor();
        return kanji && anchor ? [{ term: kanji, reading: kanji, alternates: [kanji], compounds: [], examples: [], anchor }] : [];
    }
    const headword = jitenHeadword();
    if (!headword) return [];
    const anchor = jitenContentAnchor();
    if (!anchor) return [];
    return [{
        term: headword.term,
        reading: headword.reading,
        alternates: uniqueLookupValues([headword.reading, ...jitenAlternateForms()]),
        compounds: [],
        examples: [],
        anchor,
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

// Search/parse pages title as "Search <query> - Jiten": a Latin word in the
// stripped title means it is page chrome around a query, not a headword, so
// the fallback must refuse it — a "Search ペッパピック" term once drove an
// Immersion Kit lookup whose result mounted over the whole search page.
function termFromTitle(): string {
    const title = cleanText(document.title.replace(/\s*[-–—|].*$/, ''));
    return JAPANESE_RE.test(title) && !/[A-Za-z]/.test(title) ? title : '';
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

// No coarse fallback (jiten has no <main>; document.body would mount the
// addon above the whole app shell): until Nuxt hydrates the real content
// column there is no target, and the enhancement refresh mounts once it exists.
function jitenVocabAnchor(): HTMLElement | null {
    const column = ownedElement(document.querySelector<HTMLElement>(VOCAB_COLUMN_SELECTOR));
    const lastChild = column?.lastElementChild;
    if (lastChild instanceof HTMLElement) return lastChild;
    return column;
}

function jitenKanjiAnchor(): HTMLElement | null {
    const header = ownedElement(document.querySelector<HTMLElement>('.text-center'));
    if (header) return header;
    return document.querySelector<HTMLElement>(KANJI_GLYPH_SELECTOR)?.closest<HTMLElement>('.space-y-2') ?? null;
}

function ownedElement<T extends HTMLElement>(element: T | null): T | null {
    return element && !element.closest(READER_OWNED_SELECTOR) ? element : null;
}
