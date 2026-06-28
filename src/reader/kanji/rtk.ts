import { Logger } from '../app/logger';
import { requestText as requestReaderText } from '../network/http';
import { isProxyOrBridgeUnavailableError } from '../network/proxy-fetch';
import { rtkElementFallbackGlyph, rtkElementKey, splitRtkElements, type RtkElementGlyph } from './rtk-elements';
import { parseHtmlDocument } from '../dom';

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

    // fallow-ignore-next-line unused-class-member
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
            if (isProxyOrBridgeUnavailableError(error)) return '';
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

function parseRtkHtml(html: string, kanji: string): RtkInfo | null {
    const doc = parseHtmlDocument(html);
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
    const searchEntries = rtkSearchIndexEntries(script);
    const entries = new Map<string, string>();
    const collisions = new Set<string>();
    const canonicalKeys = new Set<string>();
    searchEntries.forEach(entry => {
        rtkIndexKeys(entry.keyword).forEach(key => {
            canonicalKeys.add(key);
            addRtkKeywordIndexEntry(entries, collisions, key, entry.kanji);
        });
    });
    addRtkElementAliasEntries(entries, collisions, canonicalKeys, searchEntries);
    return entries;
}

interface RtkSearchIndexEntry {
    kanji: string;
    keyword: string;
    elements: string;
}

function rtkSearchIndexEntries(script: string): RtkSearchIndexEntry[] {
    const entries: RtkSearchIndexEntry[] = [];
    const entryRe = /\{[\s\S]*?\}/g;
    let match: RegExpExecArray | null;
    while ((match = entryRe.exec(script))) {
        const entry = rtkSearchIndexEntry(match[0]);
        if (entry) entries.push(entry);
    }
    return entries;
}

function rtkSearchIndexEntry(rawEntry: string): RtkSearchIndexEntry | null {
    const kanji = firstKanjiCharacter(rtkSearchIndexField(rawEntry, 'kanji'));
    const keyword = rtkSearchIndexField(rawEntry, 'keyword');
    if (!kanji || !keyword) return null;
    return {
        kanji,
        keyword,
        elements: rtkSearchIndexField(rawEntry, 'elements'),
    };
}

function rtkSearchIndexField(rawEntry: string, field: string): string {
    const match = rawEntry.match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
    if (!match?.[1]) return '';
    try {
        return JSON.parse(`"${match[1]}"`) as string;
    } catch {
        return match[1];
    }
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

function addRtkElementAliasEntries(entries: Map<string, string>, collisions: Set<string>, canonicalKeys: Set<string>, searchEntries: RtkSearchIndexEntry[]): void {
    const introduced = new Map<string, string>();
    const introducedCollisions = new Set<string>();
    searchEntries.forEach(entry => {
        rtkIndexKeys(entry.keyword).forEach(key => addRtkKeywordIndexEntry(introduced, introducedCollisions, key, entry.kanji));
        const elements = splitRtkElements(entry.elements);
        addLeadingRtkElementAliases(entries, collisions, canonicalKeys, introduced, introducedCollisions, entry, elements);
        addGroupedRtkElementAliases(entries, collisions, canonicalKeys, introduced, introducedCollisions, elements);
    });
}

function addLeadingRtkElementAliases(
    entries: Map<string, string>,
    collisions: Set<string>,
    canonicalKeys: Set<string>,
    introduced: Map<string, string>,
    introducedCollisions: Set<string>,
    entry: RtkSearchIndexEntry,
    elements: string[],
): void {
    const keywordKeys = rtkIndexKeys(entry.keyword);
    const keywordIndex = elements.findIndex(element => rtkIndexKeys(element).some(key => keywordKeys.includes(key)));
    if (keywordIndex <= 0) return;
    elements.slice(0, keywordIndex).forEach(element => {
        addRtkElementAliasEntry(entries, collisions, canonicalKeys, introduced, introducedCollisions, element, entry.kanji);
    });
}

function addGroupedRtkElementAliases(
    entries: Map<string, string>,
    collisions: Set<string>,
    canonicalKeys: Set<string>,
    introduced: Map<string, string>,
    introducedCollisions: Set<string>,
    elements: string[],
): void {
    let owner = '';
    elements.forEach(element => {
        const introducedOwner = rtkIntroducedElementOwner(introduced, element);
        if (introducedOwner) {
            owner = introducedOwner;
            return;
        }
        if (owner) addRtkElementAliasEntry(entries, collisions, canonicalKeys, introduced, introducedCollisions, element, owner);
    });
}

function addRtkElementAliasEntry(
    entries: Map<string, string>,
    collisions: Set<string>,
    canonicalKeys: Set<string>,
    introduced: Map<string, string>,
    introducedCollisions: Set<string>,
    element: string,
    kanji: string,
): void {
    if (rtkElementFallbackGlyph(element)) return;
    rtkIndexKeys(element)
        .filter(key => !canonicalKeys.has(key))
        .forEach(key => {
            addRtkKeywordIndexEntry(entries, collisions, key, kanji);
            addRtkKeywordIndexEntry(introduced, introducedCollisions, key, kanji);
        });
}

function rtkIntroducedElementOwner(introduced: Map<string, string>, element: string): string {
    for (const key of rtkIndexKeys(element)) {
        const owner = introduced.get(key);
        if (owner) return owner;
    }
    return '';
}

function rtkIndexKeys(value: string): string[] {
    return [...new Set([rtkElementKey(value), compactRtkElementKey(value)].filter(Boolean))];
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
