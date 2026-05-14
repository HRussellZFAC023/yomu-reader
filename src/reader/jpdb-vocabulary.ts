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
    compounds: JpdbVocabularyCompound[];
    examples: JpdbVocabularyExample[];
}

const log = Logger.scope('JpdbVocabulary');
const JPDB_VOCABULARY_BASE_URL = 'https://jpdb.io/vocabulary';
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

export class JpdbVocabularyClient {
    private cache = new Map<string, Promise<JpdbVocabularyInfo | null>>();

    lookup(vid: number, spelling: string, reading: string): Promise<JpdbVocabularyInfo | null> {
        if (!vid || !spelling) return Promise.resolve(null);
        const key = `${vid}:${spelling}:${reading}`;
        let promise = this.cache.get(key);
        if (!promise) {
            promise = this.fetchInfo(vid, spelling, reading);
            this.cache.set(key, promise);
        }
        return promise;
    }

    private async fetchInfo(vid: number, spelling: string, reading: string): Promise<JpdbVocabularyInfo | null> {
        const url = `${JPDB_VOCABULARY_BASE_URL}/${vid}/${encodeURIComponent(spelling)}/${encodeURIComponent(reading || spelling)}`;
        const html = await requestText(url).catch(error => {
            log.warn('Vocabulary page request failed', { vid, spelling }, error);
            return '';
        });
        return html ? parseJpdbVocabularyHtml(html) : null;
    }
}

export function parseJpdbVocabularyHtml(html: string): JpdbVocabularyInfo | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const compounds = extractCompounds(doc);
    const examples = extractExamples(doc);
    return compounds.length || examples.length ? { compounds, examples } : null;
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
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    if (element.tagName === 'RUBY') {
        const rt = Array.from(element.children).find(child => child.tagName === 'RT')?.textContent ?? '';
        return rt || baseText(element);
    }
    return Array.from(element.childNodes).map(readingText).join('');
}

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
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
    return fetch(url, { credentials: 'include', redirect: 'follow' }).then(response => {
        if (!response.ok) throw new Error(`JPDB vocabulary request failed (${response.status}).`);
        return response.text();
    });
}
