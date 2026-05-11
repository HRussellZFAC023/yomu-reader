import { Logger } from './logger';

export interface RtkInfo {
    kanji: string;
    keyword: string;
    frameNumber: string;
    onYomi: string;
    kunYomi: string;
    elements: string;
    componentKanji: string[];
    heisigStory: string;
    heisigComment: string;
    koohiiStories: string[];
}

const RTK_BASE_URL = 'https://hrussellzfac023.github.io/rtk';
const KANJI_RE = /[\u3400-\u9fff]/u;
const log = Logger.scope('RTK');

export class RtkClient {
    private cache = new Map<string, Promise<RtkInfo | null>>();

    lookup(kanji: string): Promise<RtkInfo | null> {
        if (!KANJI_RE.test(kanji)) return Promise.resolve(null);
        const key = Array.from(kanji)[0] ?? kanji;
        let promise = this.cache.get(key);
        if (!promise) {
            log.debug('Lookup cache miss', { kanji: key });
            promise = this.fetchInfo(key);
            this.cache.set(key, promise);
        } else {
            log.debug('Lookup cache hit', { kanji: key });
        }
        return promise;
    }

    private async fetchInfo(kanji: string): Promise<RtkInfo | null> {
        const html = await requestText(`${RTK_BASE_URL}/${encodeURIComponent(kanji)}/index.html`).catch(error => {
            log.warn('RTK request failed', { kanji }, error);
            return '';
        });
        if (!html) return null;
        const info = parseRtkHtml(html, kanji);
        log.debug('RTK info parsed', { kanji, found: Boolean(info), keyword: info?.keyword ?? '' });
        return info;
    }
}

export function parseRtkHtml(html: string, kanji: string): RtkInfo | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const keywordElement = doc.querySelector('h2 code');
    const keyword = keywordElement?.textContent?.trim() ?? '';
    if (!keyword) return null;

    const yomiText = doc.querySelector('h3')?.textContent ?? '';
    const onYomi = yomiText.match(/On-Yomi:\s*([^—]+)/)?.[1]?.trim() ?? '';
    const kunYomi = yomiText.match(/Kun-Yomi:\s*(.+)/)?.[1]?.trim() ?? '';
    const elements = textAfterHeading(doc, 'Elements:');
    const heisigStory = textAfterHeading(doc, 'Heisig story:');
    const heisigComment = textAfterHeading(doc, 'Heisig comment:');
    const koohiiStories = paragraphsAfterHeading(doc, 'Koohii stories:').slice(0, 3);

    return {
        kanji,
        keyword,
        frameNumber: keywordElement?.getAttribute('title')?.trim() ?? '',
        onYomi,
        kunYomi,
        elements,
        componentKanji: [...new Set(Array.from(elements).filter(character => KANJI_RE.test(character) && character !== kanji))],
        heisigStory,
        heisigComment,
        koohiiStories,
    };
}

function textAfterHeading(doc: Document, label: string): string {
    const heading = Array.from(doc.querySelectorAll('h2'))
        .find(element => element.textContent?.includes(label));
    const next = heading?.nextElementSibling;
    return next?.tagName === 'P' ? cleanText(next.textContent ?? '') : '';
}

function paragraphsAfterHeading(doc: Document, label: string): string[] {
    const heading = Array.from(doc.querySelectorAll('h2'))
        .find(element => element.textContent?.includes(label));
    const paragraphs: string[] = [];
    let next = heading?.nextElementSibling;
    while (next?.tagName === 'P') {
        const text = cleanText(next.textContent ?? '');
        if (text) paragraphs.push(text);
        next = next.nextElementSibling;
    }
    return paragraphs;
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
                    else reject(new Error(`RTK request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('RTK request timed out.')),
            });
        });
    }

    return fetch(url).then(response => {
        if (!response.ok) throw new Error(`RTK request failed (${response.status}).`);
        return response.text();
    });
}

function getUserscriptHttpRequest(): UserscriptHttpRequest | undefined {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM !== 'undefined') return GM.xmlHttpRequest ?? GM.xmlhttpRequest;
    return undefined;
}
