import { parseHtmlDocument } from '../dom';
import {
    jpdbDocumentVocabularyIdentity,
    JpdbPublicLookupBackoff,
    jpdbSearchUrl,
} from './jpdb-public-lookup';
import { unique } from '../core/array-utils';
import { isRecord } from '../core/object-utils';
import { readJpdbPitchPatterns } from './jpdb-public-pitch';
import { readPublicJpdbCache, writePublicJpdbCache } from './jpdb-public-cache';
import { absoluteJpdbUrl, cleanText, JAPANESE_RE, parseJpdbVocabularyUrl, type JpdbVocabularyUrlIdentity } from './jpdb-text';
import { Logger } from '../app/logger';
import { BoundedMap } from '../core/bounded-map';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import type { JPDBCard } from '../app/types';
import {
    isBetterJpdbAudioIds,
    jpdbAudioIds,
    jpdbVocabularyAudioIds,
    shouldRefreshVocabularyEntryAudio,
} from './jpdb-vocabulary-audio';
import { JPDB_COMPOUND_LIMIT, JPDB_EXAMPLE_LIMIT, JPDB_LINKED_AUDIO_ENRICHMENT_BUDGET, JPDB_USED_IN_AUDIO_REQUEST_TIMEOUT_MS, JPDB_USED_IN_VOCABULARY_LIMIT } from './jpdb-vocabulary-constants';
import { baseText, cleanMeaning, escapeRegExp, isJapaneseTerm, optionalRichHtml, readingText, sectionLabel, uniqueBy } from './jpdb-vocabulary-dom';
import { vocabularyRoot } from './jpdb-vocabulary-root';
import { mergeVocabularyInfo, needsSupplement, requestSearchText, requestText, vocabularyLookupUrls, vocabularySupplementUrls } from './jpdb-vocabulary-request';
import type { JpdbVocabularyCompound, JpdbVocabularyExample, JpdbVocabularyInfo, JpdbVocabularyLookupResult, JpdbVocabularySearchResult } from './jpdb-vocabulary-types';

export { parseJpdbAudioData } from './jpdb-audio-ids';
export type { JpdbVocabularyInfo, JpdbVocabularyLookupResult, JpdbVocabularySearchResult } from './jpdb-vocabulary-types';

const log = Logger.scope('JpdbVocabulary');

interface SearchResultModel {
    identity: JpdbVocabularyUrlIdentity | null;
    spelling: string;
    reading: string;
    partOfSpeech: string[];
    meanings: string[];
    frequencyRank: number | null;
}

type VocabularyScope = { proxy: string; backoff: JpdbPublicLookupBackoff };
type VocabularyRequest = { scope: VocabularyScope; failure: Error | null };
type QueryEntry<T> = { expiresAt: number; promise: Promise<T>; result?: T };
const QUERY_CACHE_LIMIT = 160;
const COMPLETE_QUERY_TTL_MS = 300_000;
const EMPTY_QUERY_TTL_MS = 10_000;
const INCOMPLETE_QUERY_TTL_MS = 1_000;

export class JpdbVocabularyClient {
    private cache = new BoundedMap<string, QueryEntry<JpdbVocabularyLookupResult>>(QUERY_CACHE_LIMIT);
    private searchCache = new BoundedMap<string, QueryEntry<JpdbVocabularySearchResult>>(QUERY_CACHE_LIMIT);
    private backoffs = new BoundedMap<string, JpdbPublicLookupBackoff>(QUERY_CACHE_LIMIT);
    private scope?: VocabularyScope;

    constructor(private readonly getCorsProxyUrl: () => string = () => '') {}

    clear(): void {
        this.cache.clear();
        this.searchCache.clear();
        this.scope = undefined;
    }

    lookup(vid: number, spelling: string, reading: string): Promise<JpdbVocabularyLookupResult> {
        if (!spelling) return Promise.resolve({ info: null, status: 'complete' });
        const request = this.request();
        const key = JSON.stringify([sensitiveFingerprint(request.scope.proxy), vid, spelling, reading]);
        return this.query(this.cache, 'vocabulary-complete-v2', key, request,
            () => this.fetchInfo(request, vid, spelling, reading),
            result => result.info !== null, isCachedVocabularyLookup);
    }

    search(query: string, limit = 10): Promise<JpdbVocabularySearchResult> {
        const normalized = cleanText(query);
        if (!normalized) return Promise.resolve({ cards: [], status: 'complete' });
        const request = this.request();
        const key = JSON.stringify([sensitiveFingerprint(request.scope.proxy), normalized, limit]);
        return this.query(this.searchCache, 'search-complete-v2', key, request,
            () => this.fetchSearch(request, normalized, limit),
            result => result.cards.length > 0, isCachedVocabularySearch);
    }

    private request(): VocabularyRequest {
        const proxy = this.getCorsProxyUrl();
        if (!this.scope || this.scope.proxy !== proxy) {
            this.cache.clear();
            this.searchCache.clear();
            let backoff = this.backoffs.get(proxy);
            if (!backoff) {
                backoff = new JpdbPublicLookupBackoff();
                this.backoffs.set(proxy, backoff);
            }
            this.scope = { proxy, backoff };
        }
        return { scope: this.scope, failure: null };
    }

    private assertCurrent(request: VocabularyRequest): void {
        if (request.scope !== this.request().scope) throw new Error('JPDB vocabulary request context changed.');
    }

    private query<T extends { status: 'complete' | 'partial' }>(
        cache: Map<string, QueryEntry<T>>,
        kind: string,
        key: string,
        request: VocabularyRequest,
        load: () => Promise<T>,
        usable: (result: T) => boolean,
        valid: (value: unknown) => value is T,
    ): Promise<T> {
        const existing = cache.get(key);
        if (existing && (existing.expiresAt > Date.now()
            || existing.result?.status === 'partial' && usable(existing.result) && request.scope.backoff.isActive())) {
            return existing.promise;
        }
        const stored = readPublicJpdbCache<unknown>(kind, key);
        const cached = valid(stored) && usable(stored) ? stored : undefined;
        const entry: QueryEntry<T> = {
            expiresAt: Infinity,
            promise: (cached ? Promise.resolve(cached) : load()).then(result => {
                this.assertCurrent(request);
                entry.result = result;
                const hasData = usable(result);
                entry.expiresAt = Date.now() + (result.status === 'partial'
                    ? request.scope.backoff.retryAfterMs() || INCOMPLETE_QUERY_TTL_MS
                    : hasData ? COMPLETE_QUERY_TTL_MS : EMPTY_QUERY_TTL_MS);
                if (!cached && result.status === 'complete' && hasData) writePublicJpdbCache(kind, key, result);
                return result;
            }).catch(error => {
                entry.expiresAt = Date.now() + (request.scope.backoff.retryAfterMs() || INCOMPLETE_QUERY_TTL_MS);
                throw error;
            }),
        };
        cache.set(key, entry);
        return entry.promise;
    }

    private async text(
        request: VocabularyRequest,
        url: string,
        transport = requestText,
        timeoutMs = 8_000,
    ): Promise<string> {
        this.assertCurrent(request);
        if (request.scope.backoff.isActive()) {
            request.failure = new Error('JPDB public lookup is temporarily rate limited.');
            throw request.failure;
        }
        try {
            const html = await transport(url, request.scope.proxy, timeoutMs);
            this.assertCurrent(request);
            if (!request.scope.backoff.isActive()) request.scope.backoff.noteSuccess();
            return html;
        } catch (error) {
            request.failure = error instanceof Error ? error : new Error('JPDB public lookup failed.', { cause: error });
            this.assertCurrent(request);
            request.scope.backoff.noteFailure(error);
            log.warn('JPDB public lookup failed', { url }, error);
            throw request.failure;
        }
    }

    private async fetchInfo(request: VocabularyRequest, vid: number, spelling: string, reading: string): Promise<JpdbVocabularyLookupResult> {
        for (const url of vocabularyLookupUrls(vid, spelling, reading)) {
            const html = await this.text(request, url).catch(() => '');
            this.assertCurrent(request);
            const initial = html ? parseJpdbVocabularyHtml(html, spelling, reading) : null;
            if (initial) {
                const info = await this.fetchSupplementaryInfo(request, initial, html, url, spelling, reading);
                return { info, status: request.failure ? 'partial' : 'complete' };
            }
            if (request.scope.backoff.isActive()) break;
        }
        if (request.failure) throw request.failure;
        return { info: null, status: 'complete' };
    }

    private async fetchSearch(request: VocabularyRequest, query: string, limit: number): Promise<JpdbVocabularySearchResult> {
        const html = await this.text(request, jpdbSearchUrl(query), requestSearchText);
        return { cards: parseJpdbSearchHtml(html, limit), status: 'complete' };
    }

    private async fetchSupplementaryInfo(
        request: VocabularyRequest,
        initialInfo: JpdbVocabularyInfo,
        html: string,
        initialUrl: string,
        spelling: string,
        reading: string,
    ): Promise<JpdbVocabularyInfo> {
        let info = initialInfo;
        for (const supplement of vocabularySupplementUrls(html, spelling, reading, initialUrl)) {
            if (!needsSupplement(info, supplement.kind)) continue;
            const supplementHtml = await this.text(request, supplement.url).catch(() => '');
            this.assertCurrent(request);
            const supplementalInfo = supplementHtml ? parseJpdbVocabularyHtml(supplementHtml, spelling, reading) : null;
            if (supplementalInfo) info = mergeVocabularyInfo(info, supplementalInfo);
        }
        return this.enrichLinkedVocabularyAudio(request, info);
    }

    private async enrichLinkedVocabularyAudio(request: VocabularyRequest, info: JpdbVocabularyInfo): Promise<JpdbVocabularyInfo> {
        const budget = { remaining: JPDB_LINKED_AUDIO_ENRICHMENT_BUDGET };
        const compounds = await this.enrichVocabularyEntryAudio(request, info.compounds, budget);
        const usedInVocabulary = await this.enrichVocabularyEntryAudio(request, info.usedInVocabulary ?? [], budget);
        return { ...info, compounds, usedInVocabulary };
    }

    private enrichVocabularyEntryAudio(request: VocabularyRequest, entries: JpdbVocabularyCompound[], budget: { remaining: number }): Promise<JpdbVocabularyCompound[]> {
        return Promise.all(entries.map(entry => {
            if (budget.remaining <= 0 || !shouldRefreshVocabularyEntryAudio(entry)) return entry;
            budget.remaining--;
            return this.vocabularyEntryWithAudio(request, entry);
        }));
    }

    private async vocabularyEntryWithAudio(request: VocabularyRequest, entry: JpdbVocabularyCompound): Promise<JpdbVocabularyCompound> {
        if (!parseJpdbVocabularyUrl(entry.url)) return entry;
        const url = absoluteJpdbUrl(entry.url);
        if (!url) return entry;
        const html = await this.text(request, url, requestText, JPDB_USED_IN_AUDIO_REQUEST_TIMEOUT_MS).catch(() => '');
        this.assertCurrent(request);
        const audioIds = html ? jpdbVocabularyAudioIds(html, entry.term, entry.reading) : [];
        return isBetterJpdbAudioIds(audioIds, entry.audioIds ?? []) ? { ...entry, audioIds } : entry;
    }
}

function isCachedVocabularyLookup(value: unknown): value is JpdbVocabularyLookupResult {
    if (!isRecord(value) || value.status !== 'complete') return false;
    const info = value.info;
    if (info === null) return true;
    return isRecord(info)
        && isStringArray(info.meanings)
        && Array.isArray(info.compounds) && info.compounds.every(isVocabularyCompound)
        && (info.usedInVocabulary === undefined || Array.isArray(info.usedInVocabulary) && info.usedInVocabulary.every(isVocabularyCompound))
        && Array.isArray(info.examples) && info.examples.every(example =>
            isRecord(example) && typeof example.sentence === 'string' && typeof example.translation === 'string'
            && (example.sentenceHtml === undefined || typeof example.sentenceHtml === 'string')
            && (example.audioIds === undefined || isStringArray(example.audioIds)));
}

function isVocabularyCompound(value: unknown): boolean {
    return isRecord(value) && ['term', 'reading', 'meaning', 'url'].every(key => typeof value[key] === 'string')
        && (value.termHtml === undefined || typeof value.termHtml === 'string')
        && (value.audioIds === undefined || isStringArray(value.audioIds));
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

const PUBLIC_SEARCH_CARD_FIELDS = new Set<keyof JPDBCard>([
    'vid', 'sid', 'rid', 'spelling', 'reading', 'frequencyRank', 'partOfSpeech',
    'meanings', 'cardState', 'pitchAccent', 'wordWithReading', 'source', 'sentence',
]);

function isCachedVocabularySearch(value: unknown): value is JpdbVocabularySearchResult {
    return isRecord(value) && value.status === 'complete' && Array.isArray(value.cards)
        && value.cards.every(card => isRecord(card)
            && Object.keys(card).every(key => PUBLIC_SEARCH_CARD_FIELDS.has(key as keyof JPDBCard))
            && typeof card.spelling === 'string' && typeof card.reading === 'string'
            && Number.isFinite(card.vid) && Number.isFinite(card.sid) && Number.isFinite(card.rid)
            && (card.frequencyRank === null || Number.isFinite(card.frequencyRank))
            && isStringArray(card.partOfSpeech)
            && card.source === 'jpdb' && typeof card.sentence === 'string' && card.wordWithReading === null
            && Array.isArray(card.cardState) && card.cardState.length === 1 && card.cardState[0] === 'not-in-deck'
            && isStringArray(card.pitchAccent)
            && Array.isArray(card.meanings) && card.meanings.every(meaning =>
                isRecord(meaning) && isStringArray(meaning.glosses) && isStringArray(meaning.partOfSpeech)));
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
