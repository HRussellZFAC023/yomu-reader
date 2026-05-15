import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

export interface JpdbVocabularyCompound {
    term: string;
    reading: string;
    meaning: string;
    url: string;
}

export interface JpdbVocabularyExample {
    sentence: string;
    translation: string;
}

export interface JpdbVocabularyInfo {
    meanings: string[];
    compounds: JpdbVocabularyCompound[];
    examples: JpdbVocabularyExample[];
}

const log = Logger.scope('JpdbVocabulary');
const JPDB_VOCABULARY_BASE_URL = 'https://jpdb.io/vocabulary';
const JPDB_SEARCH_URL = 'https://jpdb.io/search';
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

export class JpdbVocabularyClient {
    private cache = new Map<string, Promise<JpdbVocabularyInfo | null>>();

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

    private async fetchInfo(vid: number, spelling: string, reading: string): Promise<JpdbVocabularyInfo | null> {
        for (const url of vocabularyLookupUrls(vid, spelling, reading)) {
            const html = await requestText(url).catch(error => {
                log.warn('Vocabulary page request failed', { vid, spelling, url }, error);
                return '';
            });
            const info = html ? parseJpdbVocabularyHtml(html, spelling, reading) : null;
            if (info) return info;
        }
        return null;
    }
}

export function parseJpdbVocabularyHtml(html: string, spelling = '', reading = ''): JpdbVocabularyInfo | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const root = vocabularyRoot(doc, spelling, reading);
    if (!root) return null;
    const meanings = extractMeanings(root, doc, spelling, reading);
    const compounds = extractCompounds(root);
    const examples = extractExamples(root);
    return meanings.length || compounds.length || examples.length ? { meanings, compounds, examples } : null;
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

function vocabularyRoot(doc: Document, spelling: string, reading: string): ParentNode | null {
    const roots = Array.from(doc.querySelectorAll('.result.vocabulary'));
    const matches = roots.filter(root => vocabularyRootMatches(root, spelling, reading));
    const matched = firstVocabularyRoot(matches);
    if (matched) return matched;
    if (canUseGenericVocabularyRoot(roots, spelling, reading)) return roots[0] ?? doc;
    if (documentMatchesVocabulary(doc, spelling, reading)) return roots[0] ?? doc;
    return null;
}

function firstVocabularyRoot(matches: Element[]): Element | null {
    return matches[0] ?? null;
}

function canUseGenericVocabularyRoot(roots: Element[], spelling: string, reading: string): boolean {
    const hasRequestedIdentity = Boolean(cleanText(spelling) || cleanText(reading));
    return !hasRequestedIdentity && roots.length <= 1;
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
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'vocabulary') return null;
        return {
            expression: decodePathPart(parts[2] ?? ''),
            reading: decodePathPart(parts[3] ?? ''),
        };
    } catch {
        return null;
    }
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

    if (!spelling && !reading) return [];
    const description = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
    const match = /\s[—-]\s(.+)$/.exec(description);
    return match?.[1]
        ? match[1].split(/;\s+/).map(cleanMeaning).filter(Boolean).slice(0, 8)
        : [];
}

function extractCompounds(root: ParentNode): JpdbVocabularyCompound[] {
    const entries: JpdbVocabularyCompound[] = [];
    root.querySelectorAll<HTMLElement>('.subsection-composed-of, .subsection-composed-of-vocabulary, .subsection-composed-of-kanji').forEach(section => {
        const label = cleanText(section.querySelector<HTMLElement>('.subsection-label')?.textContent ?? '').toLowerCase();
        if (label && !label.startsWith('composed of')) return;
        section.querySelectorAll<HTMLElement>('.subsection > div, .subsection .used-in').forEach(row => {
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
        });
    });
    return entries.slice(0, 8);
}

function extractExamples(root: ParentNode): JpdbVocabularyExample[] {
    const seen = new Set<string>();
    const examples: JpdbVocabularyExample[] = [];
    root.querySelectorAll<HTMLElement>('.subsection-examples, .subsection-monolingual-examples').forEach(section => {
        section.querySelectorAll<HTMLElement>('.subsection > div, .example, li, p').forEach(row => {
            const sentenceNode = row.querySelector<HTMLElement>('.sentence, .jp, .japanese, .plain') ?? row;
            const sentence = cleanText(baseText(sentenceNode)) || cleanText(sentenceNode.textContent ?? '');
            if (!sentence || !JAPANESE_RE.test(sentence) || seen.has(sentence)) return;
            seen.add(sentence);
            examples.push({
                sentence,
                translation: cleanText(row.querySelector<HTMLElement>('.translation, .en, .english')?.textContent ?? ''),
            });
        });
    });
    return examples.slice(0, 5);
}

function baseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    return Array.from(element.childNodes).map(baseText).join('');
}

function readingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
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

function unique<T>(values: T[]): T[] {
    return [...new Set(values)];
}

function requestText(url: string): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                timeout: 8000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ''));
                    else reject(new Error(`JPDB vocabulary request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('JPDB vocabulary request timed out.')),
            });
        });
    }
    const fetchUrl = publicFetchUrl(url);
    if (!fetchUrl) {
        return Promise.reject(new Error('Cross-origin JPDB vocabulary request needs a userscript HTTP bridge.'));
    }
    return fetch(fetchUrl, { credentials: 'include', redirect: 'follow', signal: AbortSignal.timeout(8000) })
        .then(response => {
            if (!response.ok) throw new Error(`JPDB vocabulary request failed (${response.status}).`);
            return response.text();
        })
        .catch(error => {
            if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
                throw new Error('JPDB vocabulary request timed out.');
            }
            throw error;
        });
}

function publicFetchUrl(url: string): string | null {
    try {
        const target = new URL(url, location.href);
        if (target.origin === location.origin) return target.href;
        if (isLoopbackPage()) return `/__jpdb-reader-dictionary-proxy?url=${encodeURIComponent(target.href)}`;
        return null;
    } catch {
        return url;
    }
}

function isLoopbackPage(): boolean {
    return typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
}
