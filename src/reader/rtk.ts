import { Logger } from './logger';
import { requestText as requestReaderText } from './reader-http';
import { rtkElementFallbackGlyph, rtkElementKey, splitRtkElements, type RtkElementGlyph } from './rtk-elements';

export interface RtkInfo {
    kanji: string;
    keyword: string;
    frameNumber: string;
    onYomi: string;
    kunYomi: string;
    elements: string;
    componentKanji: string[];
    elementGlyphs?: Record<string, RtkElementGlyph>;
    heisigStory: string;
    heisigComment: string;
    koohiiStories: string[];
}

const RTK_BASE_URL = 'https://hrussellzfac023.github.io/rtk';
const RTK_SEARCH_INDEX_URL = `${RTK_BASE_URL}/assets/js/search.js`;
const KANJI_RE = /[\u3400-\u9fff]/u;
const log = Logger.scope('RTK');

export class RtkClient {
    private cache = new Map<string, Promise<RtkInfo | null>>();
    private keywordIndex?: Promise<Map<string, string>>;

    lookup(kanji: string): Promise<RtkInfo | null> {
        if (!KANJI_RE.test(kanji)) return Promise.resolve(null);
        const key = Array.from(kanji)[0] ?? kanji;
        let promise = this.cache.get(key);
        if (!promise) {
            promise = this.fetchInfo(key);
            this.cache.set(key, promise);
        } else {
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
        return info ? this.withElementGlyphs(info) : null;
    }

    private async withElementGlyphs(info: RtkInfo): Promise<RtkInfo> {
        const index = await this.lookupKeywordIndex().catch(() => {
            return new Map<string, string>();
        });
        const elementGlyphs: Record<string, RtkElementGlyph> = {};
        splitRtkElements(info.elements)
            .filter(keyword => rtkElementKey(keyword) !== rtkElementKey(info.keyword))
            .forEach(keyword => {
                const key = rtkElementKey(keyword);
                const fallback = rtkElementFallbackGlyph(keyword);
                const indexedKanji = index.get(key) ?? index.get(compactRtkElementKey(key));
                const glyph = fallback ?? (indexedKanji ? { glyph: indexedKanji, kanji: indexedKanji } : undefined);
                if (glyph) elementGlyphs[key] = glyph;
            });
        return Object.keys(elementGlyphs).length ? { ...info, elementGlyphs } : info;
    }

    private lookupKeywordIndex(): Promise<Map<string, string>> {
        if (!this.keywordIndex) {
            this.keywordIndex = requestText(RTK_SEARCH_INDEX_URL)
                .then(parseRtkSearchIndex)
                .catch(error => {
                    this.keywordIndex = undefined;
                    throw error;
                });
        }
        return this.keywordIndex;
    }
}

export function parseRtkHtml(html: string, kanji: string): RtkInfo | null {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const keywordElement = doc.querySelector('h2 code');
    const keyword = rtkKeywordText(keywordElement);
    if (!keyword) return null;

    const { onYomi, kunYomi } = rtkReadings(doc);
    const elements = textAfterHeading(doc, 'Elements:');
    const heisigStory = textAfterHeading(doc, 'Heisig story:');
    const heisigComment = textAfterHeading(doc, 'Heisig comment:');
    const koohiiStories = paragraphsAfterHeading(doc, 'Koohii stories:').slice(0, 3);

    return {
        kanji,
        keyword,
        frameNumber: rtkFrameNumber(keywordElement),
        onYomi,
        kunYomi,
        elements,
        componentKanji: [...new Set(Array.from(elements).filter(character => KANJI_RE.test(character) && character !== kanji))],
        heisigStory,
        heisigComment,
        koohiiStories,
    };
}

function rtkKeywordText(keywordElement: Element | null): string {
    return keywordElement?.textContent?.trim() ?? '';
}

function rtkReadings(doc: Document): { onYomi: string; kunYomi: string } {
    const yomiText = doc.querySelector('h3')?.textContent ?? '';
    return {
        onYomi: yomiText.match(/On-Yomi:\s*([^—]+)/)?.[1]?.trim() ?? '',
        kunYomi: yomiText.match(/Kun-Yomi:\s*(.+)/)?.[1]?.trim() ?? '',
    };
}

function rtkFrameNumber(keywordElement: Element | null): string {
    return keywordElement?.getAttribute('title')?.trim() ?? '';
}

export function parseRtkSearchIndex(script: string): Map<string, string> {
    const entries = new Map<string, string>();
    const collisions = new Set<string>();
    const entryRe = /"kanji"\s*:\s*"([^"]+)"[\s\S]*?"keyword"\s*:\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = entryRe.exec(script))) {
        const entry = rtkSearchIndexEntry(match);
        if (!entry) continue;
        addRtkKeywordIndexEntry(entries, collisions, rtkElementKey(entry.keyword), entry.kanji);
        addRtkKeywordIndexEntry(entries, collisions, compactRtkElementKey(entry.keyword), entry.kanji);
    }
    return entries;
}

function rtkSearchIndexEntry(match: RegExpExecArray): { kanji: string; keyword: string } | null {
    const kanji = firstKanjiCharacter(match[1]);
    const keyword = match[2] ?? '';
    return kanji && keyword ? { kanji, keyword } : null;
}

function firstKanjiCharacter(value: string | undefined): string {
    return Array.from(value ?? '').find(isKanjiCharacter) ?? '';
}

function isKanjiCharacter(character: string): boolean {
    return KANJI_RE.test(character);
}

function addRtkKeywordIndexEntry(entries: Map<string, string>, collisions: Set<string>, key: string, kanji: string): void {
    if (!key || collisions.has(key)) return;
    const existing = entries.get(key);
    if (existing && existing !== kanji) {
        entries.delete(key);
        collisions.add(key);
        return;
    }
    entries.set(key, kanji);
}

function compactRtkElementKey(value: string): string {
    return rtkElementKey(value).replace(/\s+/g, '');
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
    return requestReaderText(url, {
        timeoutMs: 8000,
        failureLabel: 'RTK request',
        timeoutLabel: 'RTK request timed out.',
    });
}
