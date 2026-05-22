import { Logger } from './logger';
import { requestText as requestReaderText } from './reader-http';
import { parseHtmlDocument } from './dom';
import type { JPDBCard } from './types';

export interface JpdbVocabularyCompound {
    term: string;
    reading: string;
    meaning: string;
    url: string;
}

export interface JpdbVocabularyExample {
    sentence: string;
    translation: string;
    audioIds?: string[];
}

export interface JpdbVocabularyInfo {
    meanings: string[];
    compounds: JpdbVocabularyCompound[];
    usedInVocabulary?: JpdbVocabularyCompound[];
    examples: JpdbVocabularyExample[];
}

const log = Logger.scope('JpdbVocabulary');
const JPDB_VOCABULARY_BASE_URL = 'https://jpdb.io/vocabulary';
const JPDB_SEARCH_URL = 'https://jpdb.io/search';
const JPDB_COMPOUND_LIMIT = 8;
const JPDB_USED_IN_VOCABULARY_LIMIT = 3;
const JPDB_EXAMPLE_LIMIT = 3;
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const JPDB_AUDIO_ID_RE = /^(?:\/static\/user\/)?[A-Za-z0-9_./-]+$/;

type VocabularySupplementKind = 'details' | 'examples' | 'used-in-vocabulary';

interface VocabularySupplementUrl {
    url: string;
    kind: VocabularySupplementKind;
}

export class JpdbVocabularyClient {
    private cache = new Map<string, Promise<JpdbVocabularyInfo | null>>();
    private searchCache = new Map<string, Promise<JPDBCard[]>>();

    constructor(private readonly getCorsProxyUrl: () => string = () => '') {}

    lookup(vid: number, spelling: string, reading: string): Promise<JpdbVocabularyInfo | null> {
        if (!spelling) return Promise.resolve(null);
        const key = `${vid}:${spelling}:${reading}`;
        let promise = this.cache.get(key);
        if (!promise) {
            promise = this.fetchInfo(vid, spelling, reading);
            this.cache.set(key, promise);
        }
        return promise;
    }

    search(query: string, limit = 10): Promise<JPDBCard[]> {
        const normalized = cleanText(query);
        if (!normalized) return Promise.resolve([]);
        const key = `${normalized}:${limit}`;
        let promise = this.searchCache.get(key);
        if (!promise) {
            promise = this.fetchSearch(normalized, limit);
            this.searchCache.set(key, promise);
        }
        return promise;
    }

    private async fetchInfo(vid: number, spelling: string, reading: string): Promise<JpdbVocabularyInfo | null> {
        for (const url of vocabularyLookupUrls(vid, spelling, reading)) {
            const html = await requestText(url, this.getCorsProxyUrl()).catch(error => {
                log.warn('Vocabulary page request failed', { vid, spelling, url }, error);
                return '';
            });
            const info = html ? parseJpdbVocabularyHtml(html, spelling, reading) : null;
            if (info) return await this.fetchSupplementaryInfo(info, html, url, vid, spelling, reading);
        }
        return null;
    }

    private async fetchSearch(query: string, limit: number): Promise<JPDBCard[]> {
        const url = `${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`;
        const html = await requestText(url, this.getCorsProxyUrl()).catch(error => {
            log.warn('Vocabulary search request failed', { query }, error);
            return '';
        });
        return html ? parseJpdbSearchHtml(html, limit) : [];
    }

    private async fetchSupplementaryInfo(
        initialInfo: JpdbVocabularyInfo,
        html: string,
        initialUrl: string,
        vid: number,
        spelling: string,
        reading: string,
    ): Promise<JpdbVocabularyInfo> {
        let info = initialInfo;
        for (const supplement of vocabularySupplementUrls(html, spelling, reading, initialUrl)) {
            if (!needsSupplement(info, supplement.kind)) continue;
            const supplementHtml = await requestText(supplement.url, this.getCorsProxyUrl()).catch(error => {
                log.warn('Vocabulary supplement request failed', { vid, spelling, url: supplement.url }, error);
                return '';
            });
            const supplementalInfo = supplementHtml ? parseJpdbVocabularyHtml(supplementHtml, spelling, reading) : null;
            if (supplementalInfo) info = mergeVocabularyInfo(info, supplementalInfo);
        }
        return info;
    }
}

export function parseJpdbVocabularyHtml(html: string, spelling = '', reading = ''): JpdbVocabularyInfo | null {
    const doc = parseHtmlDocument(html);
    const root = vocabularyRoot(doc, spelling, reading);
    if (!root) return null;
    const meanings = extractMeanings(root, doc, spelling, reading);
    const compounds = extractCompounds(root);
    const usedInVocabulary = extractUsedInVocabulary(root);
    const examples = extractExamples(root);
    return meanings.length || compounds.length || usedInVocabulary.length || examples.length
        ? { meanings, compounds, usedInVocabulary, examples }
        : null;
}

export function parseJpdbSearchHtml(html: string, limit = 10): JPDBCard[] {
    const doc = parseHtmlDocument(html);
    const roots = Array.from(doc.querySelectorAll<HTMLElement>('.results.search .result.vocabulary, .result.vocabulary'));
    return uniqueBy(
        roots
            .map(root => searchResultCard(root, doc))
            .filter((card): card is JPDBCard => card !== null),
        card => `${card.vid}:${card.spelling}:${card.reading}`,
    ).slice(0, limit);
}

function searchResultCard(root: HTMLElement, doc: Document): JPDBCard | null {
    const identity = searchResultIdentity(root);
    const headword = root.querySelector<HTMLElement>('.subsection-headword .primary-spelling .spelling, .subsection-headword .spelling');
    const spelling = cleanText(identity?.expression ?? '') || cleanText(headword ? baseText(headword) : '');
    const reading = cleanText(identity?.reading ?? '') || cleanText(headword ? readingText(headword) : '') || spelling;
    if (!spelling || !JAPANESE_RE.test(spelling)) return null;
    const meanings = extractMeanings(root, doc, spelling, reading);
    const partOfSpeech = extractPartOfSpeech(root);
    return {
        vid: identity?.vid ?? 0,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: extractFrequencyRank(root),
        partOfSpeech,
        meanings: meanings.map(meaning => ({ glosses: [meaning], partOfSpeech })),
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: spelling,
    };
}

function searchResultIdentity(root: ParentNode): { vid: number; expression: string; reading: string } | null {
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href*="jpdb.io/vocabulary/"]'));
    const details = links.find(link => /more details/i.test(cleanText(link.textContent ?? '')));
    return (details ? vocabularyEntryFromUrl(details.href || details.getAttribute('href') || '') : null)
        ?? links.map(link => vocabularyEntryFromUrl(link.href || link.getAttribute('href') || '')).find((entry): entry is { vid: number; expression: string; reading: string } => entry !== null)
        ?? null;
}

function vocabularyEntryFromUrl(value: string): { vid: number; expression: string; reading: string } | null {
    if (!value) return null;
    try {
        const parsed = new URL(value, 'https://jpdb.io');
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        const vid = Number.parseInt(parts[1] ?? '', 10);
        return {
            vid: Number.isFinite(vid) ? vid : 0,
            expression: decodePathPart(parts[2] ?? ''),
            reading: decodePathPart(parts[3] ?? ''),
        };
    } catch {
        return null;
    }
}

function extractPartOfSpeech(root: ParentNode): string[] {
    return unique(Array.from(root.querySelectorAll<HTMLElement>('.subsection-meanings .part-of-speech div'))
        .map(element => cleanText(element.textContent ?? ''))
        .filter(Boolean));
}

function extractFrequencyRank(root: ParentNode): number | null {
    for (const tag of Array.from(root.querySelectorAll<HTMLElement>('.tags .tag, .tag'))) {
        const match = /\bTop\s+([\d,]+)/i.exec(cleanText(tag.textContent ?? ''));
        if (!match?.[1]) continue;
        const rank = Number.parseInt(match[1].replace(/,/g, ''), 10);
        if (Number.isFinite(rank)) return rank;
    }
    return null;
}

function vocabularyLookupUrls(vid: number, spelling: string, reading: string): string[] {
    const urls: string[] = [];
    if (vid > 0) {
        urls.push(`${JPDB_VOCABULARY_BASE_URL}/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading || spelling)}`);
    }
    unique([spelling, reading].filter(Boolean))
        .forEach(query => urls.push(`${JPDB_SEARCH_URL}?q=${encodeURIComponent(query)}`));
    return unique(urls);
}

function vocabularySupplementUrls(html: string, spelling: string, reading: string, currentUrl = ''): VocabularySupplementUrl[] {
    const doc = parseHtmlDocument(html);
    const current = absoluteJpdbUrl(currentUrl);
    return uniqueBy([
        ...vocabularyDetailUrls(doc, spelling, reading),
        ...vocabularyExpandUrls(doc),
    ], supplement => `${supplement.kind}:${supplement.url}`)
        .filter(supplement => !current || supplement.url !== current);
}

function vocabularyDetailUrls(doc: Document, spelling: string, reading: string): VocabularySupplementUrl[] {
    if (!doc.querySelector('.results.search')) return [];
    const root = vocabularyRoot(doc, spelling, reading);
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a.view-conjugations-link[href*="/vocabulary/"]'))
        .filter(link => /more details/i.test(cleanText(link.textContent ?? '')))
        .map(link => absoluteJpdbUrl(link.getAttribute('href') ?? link.href))
        .filter(Boolean)
        .map(url => ({ url, kind: 'details' as const }));
}

function vocabularyExpandUrls(doc: Document): VocabularySupplementUrl[] {
    return Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="expand="]'))
        .map(link => vocabularyExpandSupplement(link.getAttribute('href') ?? link.href))
        .filter((supplement): supplement is VocabularySupplementUrl => supplement !== null);
}

function vocabularyExpandSupplement(value: string): VocabularySupplementUrl | null {
    try {
        const url = new URL(value, 'https://jpdb.io');
        const expand = url.searchParams.get('expand') ?? '';
        if (expand.includes('e')) return { url: url.toString(), kind: 'examples' };
        if (expand.includes('v')) return { url: url.toString(), kind: 'used-in-vocabulary' };
    } catch {
        return null;
    }
    return null;
}

function needsSupplement(info: JpdbVocabularyInfo, kind: VocabularySupplementKind): boolean {
    if (kind === 'details') {
        return info.examples.length < JPDB_EXAMPLE_LIMIT
            || (info.usedInVocabulary?.length ?? 0) < JPDB_USED_IN_VOCABULARY_LIMIT
            || info.compounds.length < JPDB_COMPOUND_LIMIT;
    }
    if (kind === 'examples') return info.examples.length < JPDB_EXAMPLE_LIMIT;
    return (info.usedInVocabulary?.length ?? 0) < JPDB_USED_IN_VOCABULARY_LIMIT;
}

function mergeVocabularyInfo(primary: JpdbVocabularyInfo, supplemental: JpdbVocabularyInfo): JpdbVocabularyInfo {
    return {
        meanings: unique([...primary.meanings, ...supplemental.meanings]).slice(0, 8),
        compounds: mergeBy(primary.compounds, supplemental.compounds, compound => `${compound.term}\t${compound.reading}`, JPDB_COMPOUND_LIMIT),
        usedInVocabulary: mergeBy(
            primary.usedInVocabulary ?? [],
            supplemental.usedInVocabulary ?? [],
            entry => `${entry.term}\t${entry.reading}`,
            JPDB_USED_IN_VOCABULARY_LIMIT,
        ),
        examples: mergeBy(primary.examples, supplemental.examples, example => example.sentence, JPDB_EXAMPLE_LIMIT),
    };
}

function vocabularyRoot(doc: Document, spelling: string, reading: string): ParentNode | null {
    const roots = Array.from(doc.querySelectorAll('.result.vocabulary'));
    const matches = roots.filter(root => vocabularyRootMatches(root, spelling, reading));
    const matched = firstVocabularyRoot(matches);
    if (matched) return matched;
    if (canUseFallbackVocabularyRoot(doc, roots, spelling, reading)) return roots[0] ?? doc;
    return null;
}

function firstVocabularyRoot(matches: Element[]): Element | null {
    return matches[0] ?? null;
}

function canUseGenericVocabularyRoot(roots: Element[], spelling: string, reading: string): boolean {
    const hasRequestedIdentity = Boolean(cleanText(spelling) || cleanText(reading));
    return !hasRequestedIdentity && roots.length <= 1;
}

function canUseFallbackVocabularyRoot(doc: Document, roots: Element[], spelling: string, reading: string): boolean {
    return canUseGenericVocabularyRoot(roots, spelling, reading)
        || documentMatchesVocabulary(doc, spelling, reading);
}

function vocabularyRootMatches(root: Element, spelling: string, reading: string): boolean {
    return vocabularyIdentities(root).some(identity => vocabularyIdentityMatches(identity, spelling, reading));
}

function documentMatchesVocabulary(doc: Document, spelling: string, reading: string): boolean {
    const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"][href*="/vocabulary/"]')?.href ?? '';
    const identity = vocabularyIdentityFromUrl(canonical);
    return identity ? vocabularyIdentityMatches(identity, spelling, reading) : false;
}

function vocabularyIdentities(root: ParentNode): Array<{ expression: string; reading: string }> {
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href*="jpdb.io/vocabulary/"]'))
        .filter(link => !link.closest('.subsection-used-in, .subsection-examples'))
        .map(link => vocabularyIdentityFromUrl(link.href || link.getAttribute('href') || ''))
        .filter((identity): identity is { expression: string; reading: string } => identity !== null);
}

function vocabularyIdentityFromUrl(value: string): { expression: string; reading: string } | null {
    if (!value) return null;
    try {
        const parsed = new URL(value, 'https://jpdb.io');
        return vocabularyIdentityFromPath(parsed.pathname);
    } catch {
        return null;
    }
}

function vocabularyIdentityFromPath(pathname: string): { expression: string; reading: string } | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'vocabulary') return null;
    return {
        expression: decodePathPart(parts[2] ?? ''),
        reading: decodePathPart(parts[3] ?? ''),
    };
}

function vocabularyIdentityMatches(identity: { expression: string; reading: string }, spelling: string, reading: string): boolean {
    const requestedSpelling = cleanText(spelling);
    const requestedReading = cleanText(reading);
    const expression = cleanText(identity.expression);
    const canonicalReading = cleanText(identity.reading);
    const requested = new Set([requestedSpelling, requestedReading].filter(Boolean));
    if (!requested.size) return true;
    if (!vocabularyIdentityIntersectsRequest(requested, expression, canonicalReading)) return false;
    if (!requestedReading) return true;
    return vocabularyIdentityMatchesReading(expression, canonicalReading, requestedSpelling, requestedReading);
}

function vocabularyIdentityIntersectsRequest(requested: Set<string>, expression: string, canonicalReading: string): boolean {
    return requested.has(expression) || requested.has(canonicalReading);
}

function vocabularyIdentityMatchesReading(
    expression: string,
    canonicalReading: string,
    requestedSpelling: string,
    requestedReading: string,
): boolean {
    return canonicalReading === requestedReading
        || expression === requestedReading
        || expression === requestedSpelling;
}

function extractMeanings(root: ParentNode, doc: Document, spelling: string, reading: string): string[] {
    const meanings = Array.from(root.querySelectorAll<HTMLElement>('.subsection-meanings .description'))
        .map(element => cleanMeaning(element.textContent ?? ''))
        .filter(Boolean);
    if (meanings.length) return unique(meanings).slice(0, 8);

    return shouldReadMetaMeanings(spelling, reading) ? metaDescriptionMeanings(doc) : [];
}

function shouldReadMetaMeanings(spelling: string, reading: string): boolean {
    return Boolean(spelling || reading);
}

function metaDescriptionMeanings(doc: Document): string[] {
    const description = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
    const match = /\s[—-]\s(.+)$/.exec(description);
    return match?.[1]?.split(/;\s+/).map(cleanMeaning).filter(Boolean).slice(0, 8) ?? [];
}

function extractCompounds(root: ParentNode): JpdbVocabularyCompound[] {
    const entries: JpdbVocabularyCompound[] = [];
    root.querySelectorAll<HTMLElement>('.subsection-composed-of, .subsection-composed-of-vocabulary, .subsection-composed-of-kanji').forEach(section => {
        const label = cleanText(section.querySelector<HTMLElement>('.subsection-label')?.textContent ?? '').toLowerCase();
        if (label && !label.startsWith('composed of')) return;
        section.querySelectorAll<HTMLElement>('.subsection > div, .subsection .used-in').forEach(row => addCompoundEntry(entries, row));
    });
    root.querySelectorAll<HTMLElement>('.subsection > .composed-of, .subsection .composed-of')
        .forEach(row => addCompoundEntry(entries, row));
    return entries.slice(0, JPDB_COMPOUND_LIMIT);
}

function addCompoundEntry(entries: JpdbVocabularyCompound[], row: HTMLElement): void {
    const link = row.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href^="/kanji/"]');
    const spelling = row.querySelector<HTMLElement>('.spelling, .jp, .plain, a[href^="/vocabulary/"], a[href^="/kanji/"]') ?? link;
    const term = cleanText(spelling ? baseText(spelling) : '') || cleanText(spelling?.textContent ?? '');
    const reading = cleanText(spelling ? readingText(spelling) : '') || term;
    if (!term || !JAPANESE_RE.test(term) || entries.some(entry => entry.term === term)) return;
    entries.push({
        term,
        reading,
        meaning: cleanText(row.querySelector<HTMLElement>('.description, .en, .meaning')?.textContent ?? ''),
        url: link?.getAttribute('href') ?? '',
    });
}

function extractUsedInVocabulary(root: ParentNode): JpdbVocabularyCompound[] {
    const entries: JpdbVocabularyCompound[] = [];
    root.querySelectorAll<HTMLElement>('.subsection-used-in, .subsection-used-in-vocabulary').forEach(section => {
        const label = cleanText(section.querySelector<HTMLElement>('.subsection-label')?.textContent ?? '').toLowerCase();
        if (label && !label.startsWith('used in')) return;
        usedInRows(section).forEach(row => {
            const link = vocabularyLink(row);
            if (!link) return;
            const identity = vocabularyIdentityFromUrl(link.href || link.getAttribute('href') || '');
            const term = cleanText(identity?.expression ?? '') || cleanText(baseText(link)) || cleanText(link.textContent ?? '');
            const reading = cleanText(identity?.reading ?? '') || cleanText(readingText(link)) || term;
            if (!term || !JAPANESE_RE.test(term) || entries.some(entry => entry.term === term && entry.reading === reading)) return;
            entries.push({
                term,
                reading,
                meaning: cleanText(row.querySelector<HTMLElement>('.description, .en, .english, .meaning')?.textContent ?? ''),
                url: link.getAttribute('href') ?? '',
            });
        });
    });
    return entries.slice(0, JPDB_USED_IN_VOCABULARY_LIMIT);
}

function usedInRows(section: HTMLElement): HTMLElement[] {
    const rows = Array.from(section.querySelectorAll<HTMLElement>('.used-in, .subsection > div'));
    const directLinks = Array.from(section.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && vocabularyLink(child) !== null);
    return unique([...rows, ...directLinks]);
}

function vocabularyLink(root: HTMLElement): HTMLAnchorElement | null {
    if (root instanceof HTMLAnchorElement && isVocabularyLink(root)) return root;
    return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href*="jpdb.io/vocabulary/"]'))
        .find(isVocabularyLink) ?? null;
}

function isVocabularyLink(link: HTMLAnchorElement): boolean {
    return vocabularyIdentityFromUrl(link.href || link.getAttribute('href') || '') !== null;
}

function extractExamples(root: ParentNode): JpdbVocabularyExample[] {
    const seen = new Set<string>();
    const examples: JpdbVocabularyExample[] = [];
    exampleSections(root).forEach(section => {
        section.querySelectorAll<HTMLElement>('.subsection > div, .example, li, p').forEach(row => {
            const sentenceNode = row.querySelector<HTMLElement>('.sentence, .jp, .japanese, .plain') ?? row;
            const sentence = cleanText(baseText(sentenceNode)) || cleanText(sentenceNode.textContent ?? '');
            if (!sentence || !JAPANESE_RE.test(sentence) || seen.has(sentence)) return;
            seen.add(sentence);
            examples.push({
                sentence,
                translation: cleanText(row.querySelector<HTMLElement>('.translation, .en, .english')?.textContent ?? ''),
                audioIds: jpdbAudioIds(row),
            });
        });
    });
    return examples.slice(0, JPDB_EXAMPLE_LIMIT);
}

function exampleSections(root: ParentNode): HTMLElement[] {
    const byClass = Array.from(root.querySelectorAll<HTMLElement>('.subsection-examples, .subsection-monolingual-examples'));
    const byLabel = Array.from(root.querySelectorAll<HTMLElement>('.subsection-label'))
        .filter(label => cleanText(label.textContent ?? '').toLowerCase().includes('examples'))
        .map(exampleSectionFromLabel)
        .filter((section): section is HTMLElement => section !== null);
    return unique([...byClass, ...byLabel]);
}

function exampleSectionFromLabel(label: HTMLElement): HTMLElement | null {
    let current = label.parentElement;
    while (current) {
        if (current.querySelector('.subsection')) return current;
        current = current.parentElement;
    }
    return label.parentElement;
}

export function jpdbAudioIds(root: ParentNode): string[] {
    return unique(Array.from(root.querySelectorAll<HTMLElement>('[data-audio]'))
        .flatMap(element => parseJpdbAudioData(element.dataset.audio ?? '')));
}

export function parseJpdbAudioData(value: string): string[] {
    return value
        .split(/[,+]/)
        .map(item => item.trim())
        .filter(isValidJpdbAudioId);
}

function isValidJpdbAudioId(value: string): boolean {
    return Boolean(value && JPDB_AUDIO_ID_RE.test(value) && !value.includes('..') && !value.startsWith('//'));
}

function baseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    return baseElementText(root as HTMLElement);
}

function baseElementText(element: HTMLElement): string {
    if (isRubyAnnotation(element)) return '';
    return Array.from(element.childNodes).map(baseText).join('');
}

function readingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    return readingElementText(root as HTMLElement);
}

function readingElementText(element: HTMLElement): string {
    if (isRubyAnnotation(element)) return '';
    if (element.tagName === 'RUBY') return rubyReadingText(element);
    return Array.from(element.childNodes).map(readingText).join('');
}

function isRubyAnnotation(element: Element): boolean {
    return element.tagName === 'RT' || element.tagName === 'RP';
}

function rubyReadingText(element: Element): string {
    return Array.from(element.children).find(child => child.tagName === 'RT')?.textContent || baseText(element);
}

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function cleanMeaning(value: string): string {
    return cleanText(value).replace(/^\d+\.\s*/, '');
}

function decodePathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function absoluteJpdbUrl(value: string): string {
    try {
        return new URL(value, 'https://jpdb.io').toString();
    } catch {
        return '';
    }
}

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
    const seen = new Set<string>();
    return values.filter(value => {
        const current = key(value);
        if (seen.has(current)) return false;
        seen.add(current);
        return true;
    });
}

function mergeBy<T>(primary: T[], supplemental: T[], key: (value: T) => string, limit: number): T[] {
    return uniqueBy([...primary, ...supplemental], key).slice(0, limit);
}

function requestText(url: string, proxyUrl = ''): Promise<string> {
    return requestReaderText(url, {
        proxyUrl,
        timeoutMs: 8000,
        failureLabel: 'JPDB vocabulary request',
        timeoutLabel: 'JPDB vocabulary request timed out.',
    });
}
