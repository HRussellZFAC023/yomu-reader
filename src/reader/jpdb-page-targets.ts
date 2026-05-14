import type { JPDBCard, ReaderSettings } from './types';
import type { YomitanTermEntry } from './yomitan';
import { cleanText, firstJapaneseRun, firstReviewGlyph, JAPANESE_RE } from './jpdb-text';

const ADDON_ROOT_SELECTOR = '[data-yomu-jpdb-addon], [data-jpdb-reader-root]';

export interface JpdbTermTarget {
    term: string;
    reading: string;
    queries: string[];
    examples: JpdbPageExample[];
    anchor: HTMLElement;
}

export interface LocalDictionaryTarget {
    term: string;
    reading: string;
    alternates: string[];
    compounds: JpdbPageCompound[];
    examples: JpdbPageExample[];
    anchor: HTMLElement;
}

export interface JpdbPageCompound {
    term: string;
    reading: string;
    meaning: string;
    url: string;
}

export interface JpdbPageExample {
    sentence: string;
    translation: string;
}

export interface JpdbReviewCardState {
    kind: string;
    kanji: string;
    isKanji: boolean;
    phase: 'before' | 'after' | 'none';
}

export function isJpdbHost(): boolean {
    return location.hostname === 'jpdb.io';
}

export function isReviewPage(): boolean {
    return location.pathname.startsWith('/review');
}

export function isKanjiPage(): boolean {
    return location.pathname.startsWith('/kanji/');
}

export function isReviewAnswer(): boolean {
    return isReviewPage() && (/[?&]r=/.test(location.search) || Boolean(document.querySelector('.review-reveal, .kanji, .subsection-meanings')));
}

export function isKanjiReviewFront(): boolean {
    const state = currentReviewCardState();
    return state.isKanji && state.phase === 'before' && !hasReviewAnswerContent();
}

export function isKanjiReviewBack(): boolean {
    const state = currentReviewCardState();
    return state.isKanji && (state.phase === 'after' || hasReviewAnswerContent());
}

function hasReviewAnswerContent(): boolean {
    return Boolean(document.querySelector('.review-reveal, .result.kanji .kanji, .answer-box .kanji, a.kanji.plain, .subsection-meanings'));
}

export function currentReviewCardState(): JpdbReviewCardState {
    if (!isReviewPage()) return { kind: '', kanji: '', isKanji: false, phase: 'none' };
    const response = new URLSearchParams(location.search).get('r');
    const cardValue = new URLSearchParams(location.search).get('c')
        ?? document.querySelector<HTMLInputElement>('input[name="c"]')?.value
        ?? '';
    return parseJpdbReviewCardValue(cardValue, response);
}

export function parseJpdbReviewCardValue(value: string | null | undefined, response: string | null | undefined = null): JpdbReviewCardState {
    const parts = (value ?? '').split(',');
    const kind = (parts[0] ?? '').trim();
    const kanji = firstReviewGlyph(parts.slice(1).join(',')) ?? '';
    const isKanji = kind.startsWith('k') && Boolean(kanji);
    const phase = !isKanji ? 'none' : response === '1' ? 'after' : 'before';
    return { kind, kanji, isKanji, phase };
}

export function extractCurrentKanji(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'kanji' && parts[1]) return firstReviewGlyph(decodeURIComponent(parts[1])) ?? '';
    const hidden = document.querySelector<HTMLInputElement>('input[name="c"]')?.value ?? '';
    const hiddenParts = hidden.split(',');
    if (hiddenParts[0] === 'kb' && hiddenParts[1]) return firstReviewGlyph(hiddenParts[1]) ?? '';
    return firstReviewGlyph(document.querySelector<HTMLElement>('.kanji, a.kanji.plain')?.textContent ?? '') ?? '';
}

export function currentJpdbTermTarget(): JpdbTermTarget | null {
    const kanji = extractCurrentKanji();
    if ((isKanjiPage() || isKanjiReviewBack()) && kanji) {
        const anchor = currentKanjiAddonAnchor();
        const queries = uniqueLookupValues([kanji, ...kanjiComponentTerms(document)]);
        return { term: kanji, reading: kanji, queries: queries.length ? queries : [kanji], examples: extractPageExamples(document), anchor: anchor ?? document.body };
    }
    const pageTerm = extractCurrentTermTarget();
    const searchQuery = extractSearchQuery();
    const term = isSearchPage() && searchQuery ? searchQuery : pageTerm?.term ?? '';
    if (!term) return null;
    const anchor = document.querySelector<HTMLElement>('.subsection-meanings')
        ?? document.querySelector<HTMLElement>('.result.vocabulary')
        ?? document.querySelector<HTMLElement>('.subsection-used-in')
        ?? document.querySelector<HTMLElement>('.cross-table')
        ?? document.querySelector<HTMLElement>('.answer-box')
        ?? document.querySelector<HTMLElement>('main')
        ?? document.body.firstElementChild as HTMLElement | null
        ?? document.body;
    const queries = isSearchPage()
        ? uniqueLookupValues([searchQuery, pageTerm?.term, pageTerm?.reading, ...searchResultTerms(8).flatMap(item => [item.term, item.reading])])
        : uniqueLookupValues([pageTerm?.term, pageTerm?.reading, term, ...searchResultTerms(8).flatMap(item => [item.term, item.reading])]);
    return { term, reading: pageTerm?.reading || term, queries: queries.length ? queries : [term], examples: extractPageExamples(document), anchor };
}

export function currentLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isDeckPage() || isSearchPage()) {
        return Array.from(document.querySelectorAll<HTMLElement>('.result.vocabulary, .entry'))
            .map(section => {
                const term = extractTermFromElement(section);
                return term ? {
                    ...term,
                    alternates: uniqueLookupValues([term.reading, ...extractAlternateTerms(section), ...extractPageCompounds(section).flatMap(compound => [compound.term, compound.reading])]),
                    compounds: extractPageCompounds(section),
                    examples: extractPageExamples(section),
                    anchor: section.querySelector<HTMLElement>('.subsection-meanings') ?? section,
                } : null;
            })
            .filter((item): item is LocalDictionaryTarget => item !== null)
            .slice(0, 16);
    }
    const target = currentJpdbTermTarget();
    if (!target) return [];
    const compounds = extractPageCompounds(document);
    return [{
        term: target.term,
        reading: target.reading,
        alternates: uniqueLookupValues([...target.queries, ...compounds.flatMap(compound => [compound.term, compound.reading])]),
        compounds,
        examples: extractPageExamples(document),
        anchor: target.anchor,
    }];
}

function currentKanjiAddonAnchor(): HTMLElement | null {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('h6.subsection-label'));
    const mnemonic = labels.find(label => label.textContent?.trim().toLowerCase().startsWith('mnemonic'));
    if (mnemonic?.nextElementSibling instanceof HTMLElement) return mnemonic.nextElementSibling;
    return document.querySelector<HTMLElement>('.result.kanji .vbox')
        ?? document.querySelector<HTMLElement>('.result.kanji')
        ?? document.querySelector<HTMLElement>('.answer-box')
        ?? document.querySelector<HTMLElement>('.bugfix')
        ?? document.querySelector<HTMLElement>('main');
}

function kanjiComponentTerms(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.subsection-composed-of-kanji a.plain, a[href^="/kanji/"]'))
        .map(element => cleanText(extractBaseText(element)) || cleanText(element.textContent ?? ''))
        .filter(value => value && JAPANESE_RE.test(value));
}

function extractPageCompounds(root: ParentNode): JpdbPageCompound[] {
    const entries: JpdbPageCompound[] = [];
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.subsection-composed-of, .subsection-composed-of-vocabulary, .subsection-composed-of-kanji'));
    for (const section of sections) {
        const label = cleanText(section.querySelector<HTMLElement>('.subsection-label')?.textContent ?? '').toLowerCase();
        if (label && !label.startsWith('composed of')) continue;
        const rows = Array.from(section.querySelectorAll<HTMLElement>('.subsection > div, .subsection .used-in'));
        for (const row of rows) {
            const link = row.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href^="/kanji/"]');
            const spelling = row.querySelector<HTMLElement>('.spelling, .jp, .plain, a[href^="/vocabulary/"], a[href^="/kanji/"]') ?? link;
            const term = cleanText(spelling ? extractBaseText(spelling) : '') || cleanText(spelling?.textContent ?? '');
            const reading = cleanText(spelling ? extractReadingText(spelling) : '') || term;
            if (!term || !JAPANESE_RE.test(term) || entries.some(entry => entry.term === term)) continue;
            const description = row.querySelector<HTMLElement>('.description, .en, .meaning');
            entries.push({
                term,
                reading,
                meaning: cleanText(description?.textContent ?? ''),
                url: link?.getAttribute('href') ?? '',
            });
        }
    }
    return entries.slice(0, 8);
}

function extractPageExamples(root: ParentNode): JpdbPageExample[] {
    const seen = new Set<string>();
    const examples: JpdbPageExample[] = [];
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.subsection-examples, .subsection-monolingual-examples'));
    for (const section of sections) {
        const rows = Array.from(section.querySelectorAll<HTMLElement>('.subsection > div, .example, li, p'));
        for (const row of rows) {
            const sentenceNode = row.querySelector<HTMLElement>('.sentence, .jp, .japanese, .plain') ?? row;
            const sentence = cleanText(extractBaseText(sentenceNode)) || cleanText(sentenceNode.textContent ?? '');
            if (!sentence || !JAPANESE_RE.test(sentence) || seen.has(sentence)) continue;
            seen.add(sentence);
            const translation = cleanText(row.querySelector<HTMLElement>('.translation, .en, .english')?.textContent ?? '');
            examples.push({ sentence, translation });
        }
    }
    return examples.slice(0, 5);
}

export function currentAudioTargets(): Array<{ term: string; reading: string; link: HTMLElement }> {
    const targets: Array<{ term: string; reading: string; link: HTMLElement }> = [];
    const seen = new Set<HTMLElement>();
    document.querySelectorAll<HTMLElement>('a.vocabulary-audio[data-audio]').forEach(link => {
        if (seen.has(link) || link.closest(ADDON_ROOT_SELECTOR)) return;
        const root = link.closest<HTMLElement>('.result.vocabulary, .answer-box, .review-hidden, .subsection-headword, .plain') ?? link.parentElement;
        if (!root) return;
        const term = extractTermFromElement(root) ?? extractTermFromAudioLink(link);
        if (!term?.term) return;
        seen.add(link);
        targets.push({ ...term, link });
    });
    return targets.slice(0, 12);
}

export function localDictionaryLookupVariants(target: LocalDictionaryTarget): Array<{ term: string; reading: string }> {
    const variants: Array<{ term: string; reading: string }> = [];
    const add = (term: string, reading = '') => {
        const cleanTerm = cleanText(term);
        const cleanReading = cleanText(reading);
        if (!cleanTerm) return;
        if (variants.some(item => item.term === cleanTerm && item.reading === cleanReading)) return;
        variants.push({ term: cleanTerm, reading: cleanReading });
    };
    add(target.term, target.reading);
    add(target.reading);
    for (const alternate of target.alternates) {
        add(alternate, alternate === target.term ? target.reading : '');
        if (target.reading && alternate !== target.reading) add(alternate, target.reading);
    }
    return variants;
}

export function uniqueLocalDictionaryEntries(entries: YomitanTermEntry[]): YomitanTermEntry[] {
    const seen = new Set<string>();
    return entries.filter(entry => {
        const key = localDictionaryEntryKey(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function localDictionaryEntryKey(entry: YomitanTermEntry): string {
    const glossaryKey = JSON.stringify(entry.glossary);
    return entry.sequence !== undefined
        ? `${entry.dictionary}\nsequence:${entry.sequence}\n${glossaryKey}`
        : `${entry.dictionary}\n${entry.expression}\n${entry.reading}\n${glossaryKey}`;
}

export function dictionaryPreferencePriority(dictionary: string, settings: ReaderSettings): number {
    const preference = settings.dictionaryPreferences.find(item => item.name === dictionary);
    return preference?.priority ?? 999;
}

export function jpdbAudioCard(term: string, reading: string): JPDBCard {
    return {
        vid: 0,
        sid: 0,
        rid: 0,
        spelling: term,
        reading: reading || term,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
    };
}

function isDeckPage(): boolean {
    return location.pathname.startsWith('/deck');
}

function isSearchPage(): boolean {
    return location.pathname.startsWith('/search');
}

function extractTermFromAudioLink(link: HTMLElement): { term: string; reading: string } | null {
    const root = link.closest<HTMLElement>('.result.vocabulary, .answer-box') ?? link.parentElement;
    if (!root) return null;
    const linkToVocabulary = root.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"]');
    if (linkToVocabulary) {
        const parts = linkToVocabulary.pathname.split('/').filter(Boolean);
        if (parts[0] === 'vocabulary' && parts[2]) {
            const term = decodePathPart(parts[2]);
            return { term, reading: decodePathPart(parts[3] ?? '') || term };
        }
    }
    const text = cleanText(extractBaseText(root));
    return text && JAPANESE_RE.test(text) ? { term: firstJapaneseRun(text), reading: firstJapaneseRun(text) } : null;
}

function extractCurrentTermTarget(): { term: string; reading: string } | null {
    const fromPage = extractTermFromElement(document.body);
    const fromUrl = extractTermFromUrl();
    if (fromUrl) {
        const pageReading = fromPage?.term === fromUrl ? fromPage.reading : '';
        return { term: fromUrl, reading: extractReadingFromUrl() || pageReading || fromUrl };
    }
    return fromPage;
}

function extractSearchQuery(): string {
    if (!isSearchPage()) return '';
    return cleanText(new URLSearchParams(location.search).get('q') ?? '');
}

function extractTermFromUrl(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'vocabulary' && parts[2]) return decodePathPart(parts[2]);
    if (parts[0] === 'kanji' && parts[1]) return decodePathPart(parts[1]);
    return '';
}

function extractReadingFromUrl(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts[0] === 'vocabulary' && parts[3] ? decodePathPart(parts[3]) : '';
}

function decodePathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function extractTermFromElement(root: ParentNode): { term: string; reading: string } | null {
    const candidates = [
        '.vocabulary-spelling a',
        '.vocabulary-spelling',
        '.horizontal-spelling',
        '.subsection-spelling',
        '.answer-box .plain',
        '.plain',
    ];
    for (const selector of candidates) {
        const element = root.querySelector<HTMLElement>(selector);
        if (!element) continue;
        const term = cleanText(extractBaseText(element)) || cleanText(element.textContent ?? '');
        const reading = cleanText(extractReadingText(element)) || term;
        if (term && JAPANESE_RE.test(term)) return { term, reading };
    }
    return null;
}

function extractBaseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    return Array.from(element.childNodes).map(extractBaseText).join('');
}

function extractReadingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    if (element.tagName === 'RUBY') {
        const rt = Array.from(element.children).find(child => child.tagName === 'RT')?.textContent ?? '';
        return rt || extractBaseText(element);
    }
    return Array.from(element.childNodes).map(extractReadingText).join('');
}

function extractAlternateTerms(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.subsection-other-spellings .alt-spelling, .alt-spelling, a[href^="/vocabulary/"]'))
        .flatMap(element => {
            const fromText = cleanText(extractBaseText(element)) || cleanText(element.textContent ?? '');
            const href = element instanceof HTMLAnchorElement ? element : element.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"]');
            const fromHref = href ? vocabularyPathTerm(href.pathname) : '';
            return [fromText, fromHref];
        })
        .filter(value => value && JAPANESE_RE.test(value));
}

function searchResultTerms(limit: number): Array<{ term: string; reading: string }> {
    if (!isSearchPage()) return [];
    return Array.from(document.querySelectorAll<HTMLElement>('.result.vocabulary, .entry'))
        .map(section => extractTermFromElement(section))
        .filter((item): item is { term: string; reading: string } => item !== null)
        .slice(0, limit);
}

function vocabularyPathTerm(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] === 'vocabulary' && parts[2] ? decodePathPart(parts[2]) : '';
}

function uniqueLookupValues(values: Array<string | undefined | null>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = cleanText(value ?? '');
        const key = text.replace(/\s+/g, '').toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}
