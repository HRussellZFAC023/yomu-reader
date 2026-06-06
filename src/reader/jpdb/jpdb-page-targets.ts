import type { JPDBCard, ReaderSettings } from '../types';
import type { YomitanTermEntry } from '../yomitan';
import { cleanText, firstReviewGlyph, JAPANESE_RE } from './jpdb-text';

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

function isReviewPage(): boolean {
    return location.pathname.startsWith('/review');
}

export function isKanjiPage(): boolean {
    return location.pathname.startsWith('/kanji/');
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

function currentReviewCardState(): JpdbReviewCardState {
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
    const phase = reviewCardPhase(isKanji, response);
    return { kind, kanji, isKanji, phase };
}

function reviewCardPhase(isKanji: boolean, response: string | null | undefined): JpdbReviewCardState['phase'] {
    if (!isKanji) return 'none';
    return response === '1' ? 'after' : 'before';
}

export function extractCurrentKanji(): string {
    return currentKanjiFromPath()
        || currentKanjiFromHiddenInput()
        || currentKanjiFromPageText();
}

function currentKanjiFromPath(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'kanji' && parts[1]) return firstReviewGlyph(decodeURIComponent(parts[1])) ?? '';
    return '';
}

function currentKanjiFromHiddenInput(): string {
    const hidden = document.querySelector<HTMLInputElement>('input[name="c"]')?.value ?? '';
    const hiddenParts = hidden.split(',');
    if (hiddenParts[0] === 'kb' && hiddenParts[1]) return firstReviewGlyph(hiddenParts[1]) ?? '';
    return '';
}

function currentKanjiFromPageText(): string {
    return firstReviewGlyph(document.querySelector<HTMLElement>('.kanji, a.kanji.plain')?.textContent ?? '') ?? '';
}

export function currentJpdbTermTarget(): JpdbTermTarget | null {
    return currentKanjiTermTarget() ?? currentVocabularyTermTarget();
}

function currentKanjiTermTarget(): JpdbTermTarget | null {
    const kanji = extractCurrentKanji();
    if (!canReadCurrentKanjiTarget(kanji)) return null;
    const anchor = currentKanjiAddonAnchor();
    const queries = uniqueLookupValues([kanji, ...kanjiComponentTerms(document)]);
    return { term: kanji, reading: kanji, queries: queries.length ? queries : [kanji], examples: extractPageExamples(document), anchor: anchor ?? document.body };
}

function canReadCurrentKanjiTarget(kanji: string): boolean {
    return Boolean(kanji && (isKanjiPage() || isKanjiReviewBack()));
}

function currentVocabularyTermTarget(): JpdbTermTarget | null {
    const pageTerm = extractCurrentTermTarget();
    const searchQuery = extractSearchQuery();
    const term = currentVocabularyLookupTerm(pageTerm, searchQuery);
    if (!term) return null;
    const queries = vocabularyTermQueries(term, pageTerm, searchQuery);
    return { term, reading: pageTerm?.reading || term, queries: queries.length ? queries : [term], examples: extractPageExamples(document), anchor: currentVocabularyAddonAnchor() };
}

function currentVocabularyLookupTerm(pageTerm: Pick<JpdbTermTarget, 'term'> | null, searchQuery: string): string {
    return isSearchPage() && searchQuery ? searchQuery : pageTerm?.term ?? '';
}

function currentVocabularyAddonAnchor(): HTMLElement {
    return firstElementForSelectors(VOCABULARY_ADDON_ANCHOR_SELECTORS)
        ?? document.body.firstElementChild as HTMLElement | null
        ?? document.body;
}

const VOCABULARY_ADDON_ANCHOR_SELECTORS = [
    '.subsection-meanings',
    '.result.vocabulary',
    '.subsection-used-in',
    '.cross-table',
    '.answer-box',
    'main',
];

function firstElementForSelectors(selectors: string[]): HTMLElement | null {
    for (const selector of selectors) {
        const element = document.querySelector<HTMLElement>(selector);
        if (element) return element;
    }
    return null;
}

function vocabularyTermQueries(term: string, pageTerm: { term: string; reading: string } | null, searchQuery: string): string[] {
    const searchTerms = searchResultTerms(8).flatMap(item => [item.term, item.reading]);
    return isSearchPage()
        ? uniqueLookupValues([searchQuery, pageTerm?.term, pageTerm?.reading, ...searchTerms])
        : uniqueLookupValues([pageTerm?.term, pageTerm?.reading, term, ...searchTerms]);
}

export function currentLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isDeckPage() || isSearchPage()) {
        return sourceElements(document, '.result.vocabulary, .entry')
            .map(section => {
                const term = extractTermFromElement(section);
                const compounds = extractPageCompounds(section);
                return term ? {
                    ...term,
                    alternates: uniqueLookupValues([term.reading, ...extractAlternateTerms(section), ...compounds.flatMap(compound => [compound.term, compound.reading])]),
                    compounds,
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
        alternates: uniqueLookupValues([...target.queries, ...extractAlternateTerms(document), ...compounds.flatMap(compound => [compound.term, compound.reading])]),
        compounds,
        examples: extractPageExamples(document),
        anchor: target.anchor,
    }];
}

function currentKanjiAddonAnchor(): HTMLElement | null {
    const mnemonic = mnemonicSiblingAnchor();
    if (mnemonic) return mnemonic;
    return firstElementForSelectors(KANJI_ADDON_ANCHOR_SELECTORS);
}

const KANJI_ADDON_ANCHOR_SELECTORS = [
    '.result.kanji .vbox',
    '.result.kanji',
    '.answer-box',
    '.bugfix',
    'main',
];

function mnemonicSiblingAnchor(): HTMLElement | null {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('h6.subsection-label'));
    const mnemonic = labels.find(label => label.textContent?.trim().toLowerCase().startsWith('mnemonic'));
    return mnemonic?.nextElementSibling instanceof HTMLElement ? mnemonic.nextElementSibling : null;
}

function kanjiComponentTerms(root: ParentNode): string[] {
    return sourceElements(root, '.subsection-composed-of-kanji a.plain, a[href^="/kanji/"]')
        .map(element => cleanText(extractBaseText(element)) || cleanText(element.textContent ?? ''))
        .filter(value => value && JAPANESE_RE.test(value));
}

function extractPageCompounds(root: ParentNode): JpdbPageCompound[] {
    const entries: JpdbPageCompound[] = [];
    const seen = new Set<string>();
    for (const row of compoundRows(root)) {
        const compound = readPageCompound(row);
        if (!compound || seen.has(compound.term)) continue;
        seen.add(compound.term);
        entries.push(compound);
    }
    return entries.slice(0, 8);
}

function compoundRows(root: ParentNode): HTMLElement[] {
    return compoundSections(root).flatMap(section =>
        Array.from(section.querySelectorAll<HTMLElement>('.subsection > div, .subsection .used-in')),
    );
}

function compoundSections(root: ParentNode): HTMLElement[] {
    return sourceElements(root, '.subsection-composed-of, .subsection-composed-of-vocabulary, .subsection-composed-of-kanji')
        .filter(isComposedOfSection);
}

function isComposedOfSection(section: HTMLElement): boolean {
    const label = cleanText(section.querySelector<HTMLElement>('.subsection-label')?.textContent ?? '').toLowerCase();
    return !label || label.startsWith('composed of');
}

function readPageCompound(row: HTMLElement): JpdbPageCompound | null {
    const link = compoundLink(row);
    const spelling = compoundSpellingElement(row, link);
    const term = readCompoundTerm(spelling, link);
    if (!isJapaneseTerm(term)) return null;
    return {
        term,
        reading: readCompoundReading(spelling, link, term),
        meaning: cleanText(row.querySelector<HTMLElement>('.description, .en, .meaning')?.textContent ?? ''),
        url: link?.getAttribute('href') ?? '',
    };
}

function compoundLink(row: HTMLElement): HTMLAnchorElement | null {
    return sourceElements<HTMLAnchorElement>(row, 'a[href^="/vocabulary/"], a[href^="/kanji/"]')[0] ?? null;
}

function compoundSpellingElement(row: HTMLElement, link: HTMLAnchorElement | null): HTMLElement | HTMLAnchorElement | null {
    return row.querySelector<HTMLElement>('.spelling, .jp, .plain, a[href^="/vocabulary/"], a[href^="/kanji/"]') ?? link;
}

function readCompoundTerm(spelling: HTMLElement | HTMLAnchorElement | null, link: HTMLAnchorElement | null): string {
    return cleanText(link ? jpdbPathTerm(link.pathname) : '')
        || cleanText(spelling ? extractBaseText(spelling) : '')
        || cleanText(sourceTextContent(spelling));
}

function readCompoundReading(spelling: HTMLElement | HTMLAnchorElement | null, link: HTMLAnchorElement | null, term: string): string {
    return cleanText(link ? vocabularyPathReading(link.pathname) : '')
        || cleanText(spelling ? extractReadingText(spelling) : '')
        || term;
}

function extractPageExamples(root: ParentNode): JpdbPageExample[] {
    const seen = new Set<string>();
    const examples: JpdbPageExample[] = [];
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.subsection-examples, .subsection-monolingual-examples'));
    for (const section of sections) {
        const rows = Array.from(section.querySelectorAll<HTMLElement>('.subsection > div, .example, li, p'));
        for (const row of rows) {
            const example = readPageExampleRow(row, seen);
            if (example) examples.push(example);
        }
    }
    return examples.slice(0, 5);
}

function readPageExampleRow(row: HTMLElement, seen: Set<string>): JpdbPageExample | null {
    const sentence = pageExampleSentence(row);
    if (!shouldKeepPageExample(sentence, seen)) return null;
    seen.add(sentence);
    const translation = cleanText(row.querySelector<HTMLElement>('.translation, .en, .english')?.textContent ?? '');
    return { sentence, translation };
}

function pageExampleSentence(row: HTMLElement): string {
    const sentenceNode = row.querySelector<HTMLElement>('.sentence, .jp, .japanese, .plain') ?? row;
    return cleanText(extractBaseText(sentenceNode)) || cleanText(sentenceNode.textContent ?? '');
}

function shouldKeepPageExample(sentence: string, seen: Set<string>): boolean {
    return isJapaneseTerm(sentence) && !seen.has(sentence);
}

export function localDictionaryLookupVariants(target: LocalDictionaryTarget): Array<{ term: string; reading: string }> {
    const variants: Array<{ term: string; reading: string }> = [];
    const compoundValues = new Set(target.compounds.flatMap(compound => [
        cleanText(compound.term),
        cleanText(compound.reading),
    ]).filter(Boolean));
    const add = (term: string, reading = '') => {
        const cleanTerm = cleanText(term);
        const cleanReading = cleanText(reading);
        if (!cleanTerm) return;
        if (variants.some(item => item.term === cleanTerm && item.reading === cleanReading)) return;
        variants.push({ term: cleanTerm, reading: cleanReading });
    };
    add(target.term, target.reading);
    add(target.reading);
    for (const compound of target.compounds) {
        add(compound.term, compound.reading);
    }
    for (const alternate of target.alternates) {
        add(alternate, alternate === target.term ? target.reading : '');
        if (target.reading && alternate !== target.reading && !compoundValues.has(cleanText(alternate))) add(alternate, target.reading);
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

function localDictionaryEntryKey(entry: YomitanTermEntry): string {
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
    for (const selector of TERM_TARGET_SELECTORS) {
        const element = sourceElements(root, selector)[0];
        if (!element) continue;
        const target = termTargetFromElement(element);
        if (target) return target;
    }
    return null;
}

const TERM_TARGET_SELECTORS = [
    '.vocabulary-spelling a',
    '.vocabulary-spelling',
    '.horizontal-spelling',
    '.subsection-spelling',
    '.answer-box .plain',
    '.plain',
];

function termTargetFromElement(element: HTMLElement): { term: string; reading: string } | null {
    const term = cleanText(extractBaseText(element)) || cleanText(sourceTextContent(element));
    if (!isJapaneseTerm(term)) return null;
    const reading = cleanText(extractReadingText(element)) || term;
    return { term, reading };
}

function extractBaseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    return extractBaseElementText(root as HTMLElement);
}

function extractBaseElementText(element: HTMLElement): string {
    if (isIgnoredSourceTextElement(element)) return '';
    return Array.from(element.childNodes).map(extractBaseText).join('');
}

function extractReadingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    return extractReadingElementText(root as HTMLElement);
}

function extractReadingElementText(element: HTMLElement): string {
    if (isIgnoredSourceTextElement(element)) return '';
    if (element.tagName === 'RUBY') return rubyReadingText(element, extractBaseText);
    return Array.from(element.childNodes).map(extractReadingText).join('');
}

function isJapaneseTerm(value: string): boolean {
    return Boolean(value && JAPANESE_RE.test(value));
}

function isRubyAnnotation(element: Element): boolean {
    return element.tagName === 'RT' || element.tagName === 'RP';
}

function isIgnoredSourceTextElement(element: Element): boolean {
    return isRubyAnnotation(element)
        || isGeneratedReaderAnnotation(element)
        || element.matches('[data-jpdb-reader-root], [data-yomu-jpdb-addon]');
}

function isGeneratedReaderAnnotation(element: Element): boolean {
    return element.matches('[data-jpdb-reader-surface-ignore="true"], .jpdb-reader-furi, .jpdb-ocr-furi');
}

function rubyReadingText(element: Element, fallback: (root: Node) => string): string {
    let text = '';
    let base = '';
    element.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
            base += child.textContent ?? '';
            return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        const childElement = child as Element;
        if (childElement.tagName === 'RT') {
            text += isGeneratedReaderAnnotation(childElement) ? base : childElement.textContent || base;
            base = '';
            return;
        }
        if (childElement.tagName === 'RP') return;
        base += fallback(childElement);
    });
    return text + base || fallback(element);
}

function extractAlternateTerms(root: ParentNode): string[] {
    return sourceElements(root, '.subsection-other-spellings .alt-spelling, .alt-spelling, a[href^="/vocabulary/"]')
        .flatMap(element => {
            const fromText = cleanText(extractBaseText(element)) || cleanText(sourceTextContent(element));
            const href = element instanceof HTMLAnchorElement ? element : element.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"]');
            const fromHref = href ? vocabularyPathTerm(href.pathname) : '';
            return [fromText, fromHref];
        })
        .filter(value => value && JAPANESE_RE.test(value));
}

function searchResultTerms(limit: number): Array<{ term: string; reading: string }> {
    if (!isSearchPage()) return [];
    return sourceElements(document, '.result.vocabulary, .entry')
        .map(section => extractTermFromElement(section))
        .filter((item): item is { term: string; reading: string } => item !== null)
        .slice(0, limit);
}

function vocabularyPathTerm(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] === 'vocabulary' && parts[2] ? decodePathPart(parts[2]) : '';
}

function vocabularyPathReading(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] === 'vocabulary' && parts[3] ? decodePathPart(parts[3]) : '';
}

function jpdbPathTerm(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'vocabulary' && parts[2]) return decodePathPart(parts[2]);
    if (parts[0] === 'kanji' && parts[1]) return decodePathPart(parts[1]);
    return '';
}

function sourceElements<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T[] {
    return Array.from(root.querySelectorAll<T>(selector)).filter(isSourceElement);
}

function isSourceElement(element: HTMLElement): boolean {
    return !element.closest('[data-jpdb-reader-root], [data-yomu-jpdb-addon]');
}

function sourceTextContent(element: Element | null | undefined): string {
    return element && isSourceElement(element as HTMLElement) ? element.textContent ?? '' : '';
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
