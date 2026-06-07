import { parseHtmlDocument } from '../dom';
import {
    jpdbDocumentVocabularyIdentity,
    JpdbPublicLookupBackoff,
    jpdbSearchUrl,
    unique,
} from './jpdb-public-lookup';
import { readJpdbPitchPatterns } from './jpdb-public-pitch';
import { absoluteJpdbUrl, cleanText, JAPANESE_RE, parseJpdbVocabularyUrl, type JpdbVocabularyUrlIdentity } from './jpdb-text';
import { Logger } from '../logger';
import type { JPDBCard } from '../types';
import {
    isBetterJpdbAudioIds,
    jpdbAudioIds,
    jpdbVocabularyAudioIds,
    shouldRefreshVocabularyEntryAudio,
} from './jpdb-vocabulary-audio';
import { JPDB_COMPOUND_LIMIT, JPDB_EXAMPLE_LIMIT, JPDB_USED_IN_AUDIO_REQUEST_TIMEOUT_MS, JPDB_USED_IN_VOCABULARY_LIMIT } from './jpdb-vocabulary-constants';
import { baseText, cleanMeaning, escapeRegExp, isJapaneseTerm, optionalRichHtml, readingText, sectionLabel, uniqueBy } from './jpdb-vocabulary-dom';
import { vocabularyRoot } from './jpdb-vocabulary-root';
import { mergeVocabularyInfo, needsSupplement, requestText, vocabularyLookupUrls, vocabularySupplementUrls } from './jpdb-vocabulary-request';
import type { JpdbVocabularyCompound, JpdbVocabularyExample, JpdbVocabularyInfo } from './jpdb-vocabulary-types';

export { parseJpdbAudioData } from './jpdb-audio-ids';
export type { JpdbVocabularyInfo } from './jpdb-vocabulary-types';

const log = Logger.scope('JpdbVocabulary');

interface SearchResultModel {
    identity: JpdbVocabularyUrlIdentity | null;
    spelling: string;
    reading: string;
    partOfSpeech: string[];
    meanings: string[];
    frequencyRank: number | null;
}

export class JpdbVocabularyClient {
    private cache = new Map<string, Promise<JpdbVocabularyInfo | null>>();
    private searchCache = new Map<string, Promise<JPDBCard[]>>();
    private readonly requestBackoff = new JpdbPublicLookupBackoff();

    constructor(private readonly getCorsProxyUrl: () => string = () => '') {}

    clear(): void {
        this.cache.clear();
        this.searchCache.clear();
        this.requestBackoff.reset();
    }

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
        if (this.requestBackoff.isActive()) return null;
        for (const url of vocabularyLookupUrls(vid, spelling, reading)) {
            const html = await requestText(url, this.getCorsProxyUrl()).catch(error => {
                this.noteRequestFailure('Vocabulary page request failed', { vid, spelling, url }, error);
                return '';
            });
            if (html) this.requestBackoff.noteSuccess();
            const info = html ? parseJpdbVocabularyHtml(html, spelling, reading) : null;
            if (info) return await this.fetchSupplementaryInfo(info, html, url, vid, spelling, reading);
            if (this.requestBackoff.isActive()) break;
        }
        return null;
    }

    private async fetchSearch(query: string, limit: number): Promise<JPDBCard[]> {
        if (this.requestBackoff.isActive()) return [];
        const url = jpdbSearchUrl(query);
        const html = await requestText(url, this.getCorsProxyUrl()).catch(error => {
            this.noteRequestFailure('Vocabulary search request failed', { query }, error);
            return '';
        });
        if (html) this.requestBackoff.noteSuccess();
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
            if (this.requestBackoff.isActive()) break;
            if (!needsSupplement(info, supplement.kind)) continue;
            const supplementHtml = await requestText(supplement.url, this.getCorsProxyUrl()).catch(error => {
                this.noteRequestFailure('Vocabulary supplement request failed', { vid, spelling, url: supplement.url }, error);
                return '';
            });
            if (supplementHtml) this.requestBackoff.noteSuccess();
            const supplementalInfo = supplementHtml ? parseJpdbVocabularyHtml(supplementHtml, spelling, reading) : null;
            if (supplementalInfo) info = mergeVocabularyInfo(info, supplementalInfo);
        }
        return await this.enrichLinkedVocabularyAudio(info);
    }

    private async enrichLinkedVocabularyAudio(info: JpdbVocabularyInfo): Promise<JpdbVocabularyInfo> {
        const compounds = await this.enrichVocabularyEntryAudio(info.compounds, 'Compound vocabulary audio request failed');
        const entries = info.usedInVocabulary ?? [];
        const usedInVocabulary = await this.enrichVocabularyEntryAudio(entries, 'Used-in vocabulary audio request failed');
        return { ...info, compounds, usedInVocabulary };
    }

    private async enrichVocabularyEntryAudio(entries: JpdbVocabularyCompound[], failureLabel: string): Promise<JpdbVocabularyCompound[]> {
        if (!entries.some(entry => shouldRefreshVocabularyEntryAudio(entry))) return entries;
        return await Promise.all(entries.map(entry => this.vocabularyEntryWithAudio(entry, failureLabel)));
    }

    private async vocabularyEntryWithAudio(entry: JpdbVocabularyCompound, failureLabel: string): Promise<JpdbVocabularyCompound> {
        if (!shouldRefreshVocabularyEntryAudio(entry) || this.requestBackoff.isActive()) return entry;
        if (!parseJpdbVocabularyUrl(entry.url)) return entry;
        const url = absoluteJpdbUrl(entry.url);
        if (!url) return entry;
        const html = await requestText(url, this.getCorsProxyUrl(), JPDB_USED_IN_AUDIO_REQUEST_TIMEOUT_MS).catch(error => {
            this.noteRequestFailure(failureLabel, { term: entry.term, url }, error);
            return '';
        });
        if (html) this.requestBackoff.noteSuccess();
        const audioIds = html ? jpdbVocabularyAudioIds(html, entry.term, entry.reading) : [];
        return isBetterJpdbAudioIds(audioIds, entry.audioIds ?? []) ? { ...entry, audioIds } : entry;
    }

    private noteRequestFailure(message: string, context: Record<string, unknown>, error: unknown): void {
        this.requestBackoff.noteFailure(error);
        log.warn(message, context, error);
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
    const model = searchResultModel(root, doc);
    if (!model) return null;
    return jpdbCardFromSearchResult(root, model);
}

function searchResultModel(root: HTMLElement, doc: Document): SearchResultModel | null {
    const identity = searchResultIdentity(root, doc);
    const { spelling, reading } = searchResultText(root, doc, identity);
    if (!isJapaneseTerm(spelling)) return null;
    const partOfSpeech = extractPartOfSpeech(root);
    const meanings = extractMeanings(root, doc, spelling, reading);
    return {
        identity,
        spelling,
        reading,
        partOfSpeech,
        meanings,
        frequencyRank: extractFrequencyRank(root),
    };
}

function searchResultText(root: HTMLElement, doc: Document, identity: JpdbVocabularyUrlIdentity | null): { spelling: string; reading: string } {
    const headword = searchResultHeadword(root);
    const spelling = searchResultSpelling(identity, headword);
    return {
        spelling,
        reading: searchResultReading(doc, spelling, identity, headword),
    };
}

function searchResultHeadword(root: HTMLElement): HTMLElement | null {
    return root.querySelector<HTMLElement>('.subsection-headword .primary-spelling .spelling, .subsection-headword .spelling');
}

function searchResultSpelling(identity: JpdbVocabularyUrlIdentity | null, headword: HTMLElement | null): string {
    const expression = cleanText(identity?.expression ?? '');
    if (expression) return expression;
    return cleanText(headword ? baseText(headword) : '');
}

function searchResultReading(doc: Document, spelling: string, identity: JpdbVocabularyUrlIdentity | null, headword: HTMLElement | null): string {
    const identityReading = cleanText(identity?.reading ?? '');
    if (identityReading) return identityReading;
    const headwordReading = cleanText(headword ? readingText(headword) : '');
    if (headwordReading) return headwordReading;
    return metaDescriptionReading(doc, spelling) || spelling;
}

function jpdbCardFromSearchResult(root: HTMLElement, model: SearchResultModel): JPDBCard {
    return {
        vid: model.identity?.vid ?? 0,
        sid: 0,
        rid: 0,
        spelling: model.spelling,
        reading: model.reading,
        frequencyRank: model.frequencyRank,
        partOfSpeech: model.partOfSpeech,
        meanings: model.meanings.map(meaning => ({ glosses: [meaning], partOfSpeech: model.partOfSpeech })),
        cardState: ['not-in-deck'],
        pitchAccent: readJpdbPitchPatterns(root),
        wordWithReading: null,
        source: 'jpdb',
        sentence: model.spelling,
    };
}

function searchResultIdentity(root: ParentNode, doc: Document): JpdbVocabularyUrlIdentity | null {
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href*="jpdb.io/vocabulary/"]'));
    const details = links.find(link => /more details/i.test(cleanText(link.textContent ?? '')));
    const detailIdentity = details ? parseJpdbVocabularyUrl(details.href || details.getAttribute('href') || '') : null;
    const canonicalIdentity = documentVocabularyEntry(doc);
    const linkIdentities = links.map(link => parseJpdbVocabularyUrl(link.href || link.getAttribute('href') || ''))
        .filter((entry): entry is { vid: number; expression: string; reading: string } => entry !== null);
    return bestVocabularyIdentity([
        detailIdentity,
        canonicalIdentity,
        ...linkIdentities,
    ]);
}

function documentVocabularyEntry(doc: Document): JpdbVocabularyUrlIdentity | null {
    return jpdbDocumentVocabularyIdentity(doc);
}

function bestVocabularyIdentity(entries: Array<JpdbVocabularyUrlIdentity | null>): JpdbVocabularyUrlIdentity | null {
    const candidates = entries.filter((entry): entry is JpdbVocabularyUrlIdentity => entry !== null);
    return candidates.find(entry => entry.reading) ?? candidates[0] ?? null;
}

function metaDescriptionReading(doc: Document, spelling: string): string {
    if (!spelling) return '';
    const description = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '';
    const escaped = escapeRegExp(spelling);
    const match = new RegExp(`${escaped}\\s*[（(]([^）)]+)[）)]`).exec(description);
    const reading = cleanText(match?.[1] ?? '');
    return JAPANESE_RE.test(reading) ? reading : '';
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
    root.querySelectorAll<HTMLElement>('.subsection-composed-of, .subsection-composed-of-vocabulary, .subsection-composed-of-kanji')
        .forEach(section => addCompoundSectionEntries(entries, section));
    root.querySelectorAll<HTMLElement>('.subsection > .composed-of, .subsection .composed-of')
        .forEach(row => addCompoundEntry(entries, row));
    return entries.slice(0, JPDB_COMPOUND_LIMIT);
}

function addCompoundSectionEntries(entries: JpdbVocabularyCompound[], section: HTMLElement): void {
    if (!isComposedOfSection(section)) return;
    section.querySelectorAll<HTMLElement>('.subsection > div, .subsection .used-in')
        .forEach(row => addCompoundEntry(entries, row));
}

function isComposedOfSection(section: HTMLElement): boolean {
    const label = sectionLabel(section);
    if (!label) return true;
    return label.startsWith('composed of');
}

function addCompoundEntry(entries: JpdbVocabularyCompound[], row: HTMLElement): void {
    const entry = compoundEntryFromRow(row);
    if (!entry) return;
    if (hasCompoundEntry(entries, entry)) return;
    entries.push(entry);
}

function compoundEntryFromRow(row: HTMLElement): JpdbVocabularyCompound | null {
    const link = row.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"], a[href^="/kanji/"]');
    const spelling = compoundSpelling(row, link);
    const term = compoundTerm(spelling);
    if (!isJapaneseTerm(term)) return null;
    return {
        term,
        reading: compoundReading(spelling, term),
        meaning: cleanText(row.querySelector<HTMLElement>('.description, .en, .meaning')?.textContent ?? ''),
        url: link?.getAttribute('href') ?? '',
        audioIds: jpdbAudioIds(row),
        ...optionalRichHtml('termHtml', spelling),
    };
}

function compoundSpelling(row: HTMLElement, link: HTMLAnchorElement | null): HTMLElement | null {
    return row.querySelector<HTMLElement>('.spelling, .jp, .plain, a[href^="/vocabulary/"], a[href^="/kanji/"]') ?? link;
}

function compoundTerm(spelling: HTMLElement | null): string {
    const base = cleanText(spelling ? baseText(spelling) : '');
    if (base) return base;
    return cleanText(spelling?.textContent ?? '');
}

function compoundReading(spelling: HTMLElement | null, term: string): string {
    const reading = cleanText(spelling ? readingText(spelling) : '');
    if (reading) return reading;
    return term;
}

function hasCompoundEntry(entries: JpdbVocabularyCompound[], candidate: JpdbVocabularyCompound): boolean {
    return entries.some(entry => entry.term === candidate.term);
}

function extractUsedInVocabulary(root: ParentNode): JpdbVocabularyCompound[] {
    const entries: JpdbVocabularyCompound[] = [];
    root.querySelectorAll<HTMLElement>('.subsection-used-in, .subsection-used-in-vocabulary')
        .forEach(section => addUsedInVocabularySection(entries, section));
    return entries.slice(0, JPDB_USED_IN_VOCABULARY_LIMIT);
}

function addUsedInVocabularySection(entries: JpdbVocabularyCompound[], section: HTMLElement): void {
    if (!isUsedInVocabularySection(section)) return;
    usedInRows(section).forEach(row => addUsedInVocabularyEntry(entries, row));
}

function isUsedInVocabularySection(section: HTMLElement): boolean {
    const label = sectionLabel(section);
    if (!label) return true;
    return label.startsWith('used in');
}

function addUsedInVocabularyEntry(entries: JpdbVocabularyCompound[], row: HTMLElement): void {
    const entry = usedInVocabularyEntryFromRow(row);
    if (!entry) return;
    if (hasUsedInVocabularyEntry(entries, entry)) return;
    entries.push(entry);
}

function usedInVocabularyEntryFromRow(row: HTMLElement): JpdbVocabularyCompound | null {
    const link = vocabularyLink(row);
    if (!link) return null;
    const identity = parseJpdbVocabularyUrl(link.href || link.getAttribute('href') || '');
    const term = vocabularyTerm(identity, link);
    if (!isJapaneseTerm(term)) return null;
    return {
        term,
        reading: vocabularyReading(identity, link, term),
        meaning: cleanText(row.querySelector<HTMLElement>('.description, .en, .english, .meaning')?.textContent ?? ''),
        url: link.getAttribute('href') ?? '',
        audioIds: jpdbAudioIds(row),
        ...optionalRichHtml('termHtml', link),
    };
}

function vocabularyTerm(identity: JpdbVocabularyUrlIdentity | null, link: HTMLAnchorElement): string {
    const expression = cleanText(identity?.expression ?? '');
    if (expression) return expression;
    const base = cleanText(baseText(link));
    if (base) return base;
    return cleanText(link.textContent ?? '');
}

function vocabularyReading(identity: JpdbVocabularyUrlIdentity | null, link: HTMLAnchorElement, term: string): string {
    const identityReading = cleanText(identity?.reading ?? '');
    if (identityReading) return identityReading;
    const linkReading = cleanText(readingText(link));
    if (linkReading) return linkReading;
    return term;
}

function hasUsedInVocabularyEntry(entries: JpdbVocabularyCompound[], candidate: JpdbVocabularyCompound): boolean {
    return entries.some(entry => sameVocabularyEntry(entry, candidate));
}

function sameVocabularyEntry(entry: JpdbVocabularyCompound, candidate: JpdbVocabularyCompound): boolean {
    return entry.term === candidate.term && entry.reading === candidate.reading;
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
    return parseJpdbVocabularyUrl(link.href || link.getAttribute('href') || '') !== null;
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
                ...optionalRichHtml('sentenceHtml', sentenceNode, { preserveHighlight: true }),
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
