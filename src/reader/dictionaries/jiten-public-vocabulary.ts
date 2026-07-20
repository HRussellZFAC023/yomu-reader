import { isNonNullObject as isRecord } from '../core/object-utils';
import { Logger } from '../app/logger';
import type { JPDBCard, JPDBPitchComponent, JPDBToken } from '../app/types';
import { ConcurrencyGate, mapLimited } from '../core/async-utils';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { pitchPatternFromPosition } from '../lookup/pitch-accent';
import { requestJson } from '../network/http';
import { readPublicJitenCache, writePublicJitenCache } from './jiten-public-cache';

const JITEN_PUBLIC_API_BASE_URL = 'https://api.jiten.moe/api';
const REQUEST_TIMEOUT_MS = 1500;
// Background hydration (readings/pitch for at-rest page words) tolerates a
// slower answer than an open popover: over a userscript-manager request
// bridge (iPad Userscripts, GM_xmlhttpRequest round-trips) a healthy /info
// response routinely takes >1.5s, and every timeout used to be cached as a
// 10-minute null that the caller then negative-cached for the whole page —
// one slow network turned most of a page's furigana off permanently.
export const JITEN_BACKGROUND_DETAIL_TIMEOUT_MS = 4000;
// Nulls produced by failures (timeout/network) are transient: keep them only
// long enough to absorb a burst, so the paced retry lane can actually retry.
const TRANSIENT_NULL_TTL_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 800;
const DETAIL_CONCURRENCY = 4;
const LOOKUP_DETAIL_LIMIT = 12;
const PARSE_DETAIL_LIMIT = LOOKUP_DETAIL_LIMIT;
const REQUEST_BACKOFF_INITIAL_MS = 30_000;
const REQUEST_BACKOFF_MAX_MS = 5 * 60_000;
const PARSE_TEXT_LIMIT = 1900;
const PARSE_TERM_SEPARATOR = '。';
const log = Logger.scope('JitenPublicVocabulary');
const sharedParseGate = new ConcurrencyGate(1);
let sharedRequestBackoffUntil = 0;
let sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;

export interface JitenPublicVocabularyClientOptions {
    baseUrl?: string;
    proxyUrl?: string | (() => string);
    requestJsonImpl?: (url: string, options?: Parameters<typeof requestJson>[1]) => Promise<unknown>;
}

export interface JitenPublicLookupManyOptions {
    detailLimit?: number;
    detailTimeoutMs?: number;
}

export function resetJitenPublicVocabularyBackoffForTests(): void {
    sharedRequestBackoffUntil = 0;
    sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
}

// Callers pacing their own retry lanes (deferred pitch enrichment) consult
// this instead of blindly consuming queued work into guaranteed misses while
// the shared public-endpoint backoff is active.
export function publicJitenBackoffRemainingMs(): number {
    return Math.max(0, sharedRequestBackoffUntil - Date.now());
}

interface PublicParseWord {
    wordId: number;
    readingIndex: number;
    originalText: string;
}

interface PublicParseChunkRange {
    paragraphIndex: number;
    paragraphStart: number;
    chunkStart: number;
    chunkEnd: number;
}

interface PublicParseChunk {
    text: string;
    ranges: PublicParseChunkRange[];
}

interface PublicCardCacheEntry {
    expiresAt: number;
    promise: Promise<JPDBCard | null>;
}

export class JitenPublicVocabularyClient {
    private readonly cardCache = new Map<string, PublicCardCacheEntry>();
    private readonly detailCache = new Map<string, PublicCardCacheEntry>();

    constructor(private readonly options: JitenPublicVocabularyClientOptions = {}) {}

    lookup(term: string): Promise<JPDBCard | null> {
        const normalized = normalizeLookupText(term);
        if (!normalized || this.isBackoffActive()) return Promise.resolve(null);
        const cached = this.cardCache.get(normalized);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
            this.cardCache.delete(normalized);
            this.cardCache.set(normalized, cached);
            return cached.promise;
        }
        if (cached) this.cardCache.delete(normalized);
        const persisted = readPublicJitenCache<JPDBCard>('card', normalized, now);
        if (persisted) {
            const promise = Promise.resolve(persisted);
            this.remember(this.cardCache, normalized, promise, now);
            return promise;
        }
        const promise = this.lookupUncached(normalized)
            .then(card => {
                if (card) writePublicJitenCache('card', normalized, card);
                return card;
            })
            .catch(error => {
                this.noteFailure(error);
                this.shortenCacheEntry(this.cardCache, normalized, TRANSIENT_NULL_TTL_MS);
                logPublicJitenFailure('Jiten lookup', { term: normalized }, error);
                return null;
            });
        this.remember(this.cardCache, normalized, promise, now);
        return promise;
    }

    async lookupMany(terms: readonly string[], options: JitenPublicLookupManyOptions = {}): Promise<Map<string, JPDBCard>> {
        const uniqueTerms = uniqueNormalizedTerms(terms);
        const result = new Map<string, JPDBCard>();
        if (!uniqueTerms.length || this.isBackoffActive()) return result;

        const cachedTerms: string[] = [];
        const persistedCards = new Map<string, JPDBCard>();
        const pendingTerms: string[] = [];
        const now = Date.now();
        uniqueTerms.forEach(term => {
            const cached = this.cardCache.get(term);
            if (cached && cached.expiresAt > now) {
                cachedTerms.push(term);
                return;
            }
            if (cached) this.cardCache.delete(term);
            const persisted = readPublicJitenCache<JPDBCard>('card', term, now);
            if (persisted) {
                persistedCards.set(term, persisted);
                this.remember(this.cardCache, term, Promise.resolve(persisted), now);
                return;
            }
            pendingTerms.push(term);
        });

        persistedCards.forEach((card, term) => result.set(term, card));
        if (pendingTerms.length) {
            const loaded = await this.lookupManyUncached(pendingTerms, options).catch(error => {
                this.noteFailure(error);
                logPublicJitenFailure('Jiten batch', { terms: pendingTerms.length }, error);
                return new Map<string, JPDBCard>();
            });
            loaded.forEach((card, term) => result.set(term, card));
        }

        await Promise.all(cachedTerms.map(async term => {
            const cached = this.cardCache.get(term);
            if (!cached) return;
            const card = await cached.promise.catch(() => null);
            if (card) result.set(term, card);
        }));
        return result;
    }

    async parse(paragraphs: readonly string[]): Promise<JPDBToken[][]> {
        const result = paragraphs.map((): JPDBToken[] => []);
        if (!paragraphs.length || this.isBackoffActive()) return result;
        const chunks = publicParseChunks(paragraphs);
        await mapLimited(chunks, DETAIL_CONCURRENCY, async chunk => {
            const parsed = await this.requestParseText(chunk.text).catch(error => {
                this.noteFailure(error);
                logPublicJitenFailure('Jiten public parse', { length: chunk.text.length }, error);
                return [];
            });
            applyPublicParseChunk(result, chunk, parsed, paragraphs);
        });
        await this.hydrateParsedTokens(result, PARSE_DETAIL_LIMIT);
        return result;
    }

    async hydrateCards(cards: readonly JPDBCard[], options: JitenPublicLookupManyOptions = {}): Promise<Map<string, JPDBCard>> {
        const result = new Map<string, JPDBCard>();
        if (!cards.length || this.isBackoffActive()) return result;
        const pending: Array<{ key: string; word: PublicParseWord; requestedTerm: string }> = [];
        const seen = new Set<string>();
        const limit = normalizedDetailLimit(options.detailLimit);
        const now = Date.now();
        for (const card of cards) {
            const word = publicParseWordFromCard(card);
            if (!word) continue;
            const key = parsedCardHydrationKey(card);
            if (seen.has(key)) continue;
            seen.add(key);
            const persisted = readPublicJitenCache<JPDBCard>('card', normalizeLookupText(card.spelling), now);
            if (persisted) {
                result.set(key, persisted);
                this.remember(this.cardCache, normalizeLookupText(card.spelling), Promise.resolve(persisted), now);
                continue;
            }
            if (pending.length < limit) pending.push({ key, word, requestedTerm: card.spelling || word.originalText });
        }
        await mapLimited(pending, DETAIL_CONCURRENCY, async item => {
            const card = await this.lookupDetail(item.word, item.requestedTerm, options.detailTimeoutMs ?? JITEN_BACKGROUND_DETAIL_TIMEOUT_MS).catch(error => {
                this.noteFailure(error);
                logPublicJitenFailure('Jiten parsed detail', { wordId: item.word.wordId, readingIndex: item.word.readingIndex }, error);
                return null;
            });
            if (!card) return;
            result.set(item.key, card);
            writePublicJitenCache('card', normalizeLookupText(card.spelling), card);
        });
        return result;
    }

    clear(): void {
        this.cardCache.clear();
        this.detailCache.clear();
    }

    private async lookupUncached(term: string): Promise<JPDBCard | null> {
        const parsed = await this.parseTerms([term]);
        const candidate = bestParsedWordForTerm(term, parsed);
        return candidate ? this.lookupDetail(candidate, term) : null;
    }

    private async lookupManyUncached(terms: string[], options: JitenPublicLookupManyOptions): Promise<Map<string, JPDBCard>> {
        const parsedByTerm = await this.parseTermGroups(terms);
        const candidatesByTerm = new Map<string, PublicParseWord>();
        terms.forEach((term, index) => {
            const candidate = bestParsedWordForTerm(term, parsedByTerm[index] ?? []);
            if (candidate) candidatesByTerm.set(term, candidate);
        });

        await mapLimited([...candidatesByTerm].slice(0, normalizedDetailLimit(options.detailLimit)), DETAIL_CONCURRENCY, async ([term, candidate]) => {
            const promise = this.lookupDetail(candidate, term, options.detailTimeoutMs);
            this.remember(this.cardCache, term, promise, Date.now());
            await promise;
        });

        const cards = new Map<string, JPDBCard>();
        await Promise.all([...candidatesByTerm.keys()].map(async term => {
            const card = await this.cardCache.get(term)?.promise.catch(() => null);
            if (!card) {
                // A failed detail lookup resolves null; keeping that null for the
                // full TTL would block the paced retry lane from ever retrying.
                this.shortenCacheEntry(this.cardCache, term, TRANSIENT_NULL_TTL_MS);
                return;
            }
            cards.set(term, card);
            writePublicJitenCache('card', term, card);
        }));
        return cards;
    }

    private async hydrateParsedTokens(result: JPDBToken[][], limit: number): Promise<void> {
        const tokens = result.flat();
        if (!tokens.length || limit <= 0) return;
        const cards = await this.hydrateCards(tokens.map(token => token.card), { detailLimit: limit });
        if (!cards.size) return;
        for (const token of tokens) {
            const card = cards.get(parsedCardHydrationKey(token.card));
            if (!card) continue;
            token.card = card;
            token.pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass;
        }
    }

    private async parseTerms(terms: readonly string[]): Promise<PublicParseWord[]> {
        const chunks = chunkTermsForParse(terms);
        const groups = await mapLimited(chunks, DETAIL_CONCURRENCY, chunk => this.requestParse(chunk).catch(error => {
            logPublicJitenFailure('Jiten parse', { terms: chunk.length }, error);
            return [];
        }));
        return groups.flat();
    }

    private async requestParse(terms: readonly string[]): Promise<PublicParseWord[]> {
        return this.requestParseText(terms.join(PARSE_TERM_SEPARATOR));
    }

    private async requestParseText(text: string): Promise<PublicParseWord[]> {
        const records = await this.requestParseRecords(text);
        return records.filter(word => word.wordId > 0);
    }

    private async parseTermGroups(terms: readonly string[]): Promise<PublicParseWord[][]> {
        const records = await this.requestParseRecords(terms.join(PARSE_TERM_SEPARATOR));
        return publicParseTermGroups(terms, records);
    }

    private async requestParseRecords(text: string): Promise<PublicParseWord[]> {
        return sharedParseGate.run(async () => {
            if (this.isBackoffActive()) return [];
            const payload = await this.requestJson(`vocabulary/parse?text=${encodeURIComponent(text)}`).catch(error => {
                this.noteFailure(error);
                throw error;
            });
            this.noteSuccess();
            return Array.isArray(payload)
                ? payload.map(normalizePublicParseWord).filter((word): word is PublicParseWord => Boolean(word))
                : [];
        });
    }

    private async lookupDetail(word: PublicParseWord, requestedTerm: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<JPDBCard | null> {
        const key = `${word.wordId}:${word.readingIndex}`;
        const cached = this.detailCache.get(key);
        const now = Date.now();
        if (cached && cached.expiresAt > now) return cached.promise;
        if (cached) this.detailCache.delete(key);
        const promise = this.requestJson(`vocabulary/${word.wordId}/${word.readingIndex}/info`, timeoutMs)
            .then(payload => {
                this.noteSuccess();
                return publicJitenCardFromDetail(payload, requestedTerm, word);
            })
            .catch(error => {
                this.noteFailure(error);
                this.shortenCacheEntry(this.detailCache, key, TRANSIENT_NULL_TTL_MS);
                logPublicJitenFailure('Jiten detail', { wordId: word.wordId, readingIndex: word.readingIndex }, error);
                return null;
            });
        this.remember(this.detailCache, key, promise, now);
        return promise;
    }

    private requestJson(endpoint: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
        const request = this.options.requestJsonImpl ?? requestJson;
        return request(endpointUrl(this.options.baseUrl, endpoint), {
            responseType: 'json',
            timeoutMs,
            timeoutLabel: 'Jiten timeout.',
            failureLabel: 'Jiten',
            statusFailureMessage: status => `Jiten fail (${status}).`,
            proxyUrl: this.proxyUrl(),
            anonymous: true,
            allowDirectCrossOrigin: false,
            allowConfiguredProxy: true,
            allowSensitiveConfiguredProxy: false,
            // Every request here is a keyless GET against the shared-proxy
            // allowlist (vocabulary/parse + vocabulary/{id}/{idx}/info), so the
            // built-in Yomu edge proxy may serve it. api.jiten.moe sends no
            // Access-Control-Allow-Origin, so on hosted pages with no GM bridge
            // and no configured proxy this is the ONLY transport — blocking it
            // killed all keyless public lookups there ("No configured proxy.").
            allowPublicProxies: true,
            preferFetch: true,
        });
    }

    private proxyUrl(): string {
        return typeof this.options.proxyUrl === 'function'
            ? this.options.proxyUrl()
            : this.options.proxyUrl ?? '';
    }

    // Clamp an existing cache entry's lifetime down to a transient-failure
    // window so a null produced by a timeout/network error cannot masquerade
    // as an authoritative 10-minute "no such word".
    private shortenCacheEntry(cache: Map<string, PublicCardCacheEntry>, key: string, ttlMs: number): void {
        const entry = cache.get(key);
        if (entry) entry.expiresAt = Math.min(entry.expiresAt, Date.now() + ttlMs);
    }

    private remember(cache: Map<string, PublicCardCacheEntry>, key: string, promise: Promise<JPDBCard | null>, now: number): void {
        cache.set(key, { expiresAt: now + CACHE_TTL_MS, promise });
        for (const [entryKey, entry] of cache) {
            if (entry.expiresAt <= now) cache.delete(entryKey);
        }
        while (cache.size > CACHE_LIMIT) {
            const oldest = cache.keys().next().value;
            if (typeof oldest !== 'string') break;
            cache.delete(oldest);
        }
    }

    private isBackoffActive(): boolean {
        return Date.now() < sharedRequestBackoffUntil;
    }

    private noteFailure(error: unknown): void {
        if (!isPublicJitenBackoffError(error)) return;
        sharedRequestBackoffUntil = Date.now() + sharedRequestBackoffMs;
        sharedRequestBackoffMs = Math.min(sharedRequestBackoffMs * 2, REQUEST_BACKOFF_MAX_MS);
    }

    // A completed request proves the endpoint is healthy again: stop the
    // doubling so the NEXT backoff (if any) starts from the initial window
    // instead of a session-cumulative maximum.
    private noteSuccess(): void {
        sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
    }
}

function publicJitenCardFromDetail(payload: unknown, requestedTerm: string, fallback: PublicParseWord): JPDBCard | null {
    if (!isRecord(payload)) return null;
    const wordId = finiteInteger(payload.wordId) ?? fallback.wordId;
    const mainReading = isRecord(payload.mainReading) ? payload.mainReading : {};
    const annotatedReading = stringValue(mainReading.text) || requestedTerm;
    const spelling = cleanAnnotatedJitenText(annotatedReading) || requestedTerm;
    const reading = cleanJitenAnnotatedReading(annotatedReading) || spelling;
    const pitchComponents = publicJitenPitchComponents(payload.composedOf);
    return {
        vid: wordId,
        sid: fallback.readingIndex,
        rid: 0,
        spelling,
        reading,
        frequencyRank: nullableInteger(mainReading.frequencyRank),
        partOfSpeech: stringArray(payload.partsOfSpeech),
        meanings: arrayRecords(payload.definitions).map(definition => ({
            glosses: stringArray(definition.meanings ?? definition.englishMeanings).slice(0, 8),
            partOfSpeech: stringArray(definition.partsOfSpeech ?? definition.pos),
        })).filter(meaning => meaning.glosses.length),
        cardState: ['not-in-deck'],
        // Keyless public endpoint: it carries no authenticated SRS state, so the
        // not-in-deck above is a default, not a verdict. Tagged provisional so a
        // repaint from this lane cannot downgrade an authoritative word and the
        // known-state backfill knows to look it up.
        provisionalState: true,
        pitchAccent: pitchPatterns(payload.pitchAccents, reading),
        wordWithReading: annotatedReading.includes('[') ? annotatedReading : null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: wordId,
        jitenReadingIndex: fallback.readingIndex,
        ...(pitchComponents.length ? { pitchComponents } : {}),
    };
}

function publicJitenParsedCard(word: PublicParseWord, surface: string): JPDBCard | null {
    if (word.wordId <= 0 || word.readingIndex < 0) return null;
    return {
        vid: word.wordId,
        sid: word.readingIndex,
        rid: 0,
        spelling: surface || word.originalText,
        reading: '',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        provisionalState: true,
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        jitenWordId: word.wordId,
        jitenReadingIndex: word.readingIndex,
    };
}

function publicParseWordFromCard(card: JPDBCard): PublicParseWord | null {
    const wordId = finiteInteger(card.jitenWordId) ?? finiteInteger(card.vid);
    const readingIndex = finiteInteger(card.jitenReadingIndex) ?? finiteInteger(card.sid);
    if (wordId === undefined || wordId <= 0 || readingIndex === undefined || readingIndex < 0) return null;
    return {
        wordId,
        readingIndex,
        originalText: card.spelling || card.reading,
    };
}

function normalizePublicParseWord(value: unknown): PublicParseWord | null {
    if (!isRecord(value)) return null;
    const wordId = finiteInteger(value.wordId);
    const readingIndex = finiteInteger(value.readingIndex);
    const originalText = stringValue(value.originalText);
    if (wordId === undefined || wordId < 0 || readingIndex === undefined || !originalText) return null;
    return { wordId, readingIndex, originalText };
}

function publicParseTermGroups(terms: readonly string[], parsed: readonly PublicParseWord[]): PublicParseWord[][] {
    const groups = terms.map((): PublicParseWord[] => []);
    let termIndex = 0;
    let consumed = '';
    let complete = false;
    for (const word of parsed) {
        if (termIndex >= terms.length) break;
        const surface = normalizeLookupText(word.originalText);
        if (!surface) continue;
        if (surface === PARSE_TERM_SEPARATOR) {
            termIndex++;
            consumed = '';
            complete = false;
            continue;
        }
        if (complete) {
            termIndex++;
            consumed = '';
            complete = false;
            if (termIndex >= terms.length) break;
        }
        const target = normalizeLookupText(terms[termIndex] ?? '');
        const next = `${consumed}${surface}`;
        if (!target.startsWith(next)) continue;
        consumed = next;
        if (word.wordId > 0) groups[termIndex].push(word);
        complete = consumed === target;
    }
    return groups;
}

function bestParsedWordForTerm(term: string, parsed: PublicParseWord[]): PublicParseWord | null {
    const normalized = normalizeLookupText(term);
    return parsed.find(word => normalizeLookupText(word.originalText) === normalized)
        ?? parsed.find(word => {
            const original = normalizeLookupText(word.originalText);
            return Boolean(original && normalized.includes(original));
        })
        ?? parsed[0]
        ?? null;
}

function publicParseChunks(paragraphs: readonly string[]): PublicParseChunk[] {
    const chunks: PublicParseChunk[] = [];
    let current: PublicParseChunk = { text: '', ranges: [] };
    const flush = (): void => {
        if (!current.text) return;
        chunks.push(current);
        current = { text: '', ranges: [] };
    };
    paragraphs.forEach((paragraph, paragraphIndex) => {
        for (let offset = 0; offset < paragraph.length; offset += PARSE_TEXT_LIMIT) {
            const part = paragraph.slice(offset, offset + PARSE_TEXT_LIMIT);
            if (!part) continue;
            if (current.text && current.text.length + 1 + part.length > PARSE_TEXT_LIMIT) flush();
            const chunkStart = current.text ? current.text.length + 1 : 0;
            current.text += `${current.text ? '\n' : ''}${part}`;
            current.ranges.push({
                paragraphIndex,
                paragraphStart: offset,
                chunkStart,
                chunkEnd: chunkStart + part.length,
            });
        }
    });
    flush();
    return chunks;
}

function applyPublicParseChunk(result: JPDBToken[][], chunk: PublicParseChunk, parsed: PublicParseWord[], paragraphs: readonly string[]): void {
    let cursor = 0;
    for (const word of parsed) {
        const surface = word.originalText;
        if (!surface) continue;
        const start = chunk.text.indexOf(surface, cursor);
        if (start < 0) continue;
        const end = start + surface.length;
        cursor = end;
        const range = chunk.ranges.find(item => start >= item.chunkStart && end <= item.chunkEnd);
        if (!range) continue;
        const paragraphStart = range.paragraphStart + start - range.chunkStart;
        const paragraph = paragraphs[range.paragraphIndex] ?? '';
        const paragraphEnd = paragraphStart + surface.length;
        const card = publicJitenParsedCard(word, paragraph.slice(paragraphStart, paragraphEnd));
        if (!card) continue;
        result[range.paragraphIndex]?.push({
            card,
            start: paragraphStart,
            end: paragraphEnd,
            length: paragraphEnd - paragraphStart,
            rubies: [],
            pitchClass: '',
            sentence: paragraph,
        });
    }
}

function pitchPatterns(value: unknown, reading: string): string[] {
    return Array.isArray(value)
        ? value.map(finiteInteger).filter((position): position is number => position !== undefined)
            .map(position => pitchPatternFromPosition(reading, position))
            .filter(Boolean)
        : [];
}

function publicJitenPitchComponents(value: unknown): JPDBPitchComponent[] {
    return arrayRecords(value).flatMap(record => {
        // Jiten word summaries expose the written surface separately from the
        // kana reading. readingFurigana may be annotated (王[おう]子[じ]) or may
        // itself be kana-only (こう); matchSurface is authoritative in the
        // latter shape. Do not rely on the nonexistent `kanaReading` field.
        const annotated = stringValue(record.readingFurigana);
        const rawReading = stringValue(record.reading);
        const spelling = stringValue(record.matchSurface)
            || cleanAnnotatedJitenText(annotated)
            || cleanAnnotatedJitenText(rawReading);
        const reading = (annotated.includes('[') ? cleanJitenAnnotatedReading(annotated) : '')
            || rawReading
            || spelling;
        if (!spelling || !reading) return [];
        return [{
            spelling,
            reading,
            pitchAccent: pitchPatterns(record.pitchAccents, reading),
            wordWithReading: annotated.includes('[') ? annotated : null,
        }];
    });
}

function cleanJitenAnnotatedReading(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$2');
}

function cleanAnnotatedJitenText(value: string): string {
    return value.replace(/\[([^\]]+)\]/g, '');
}

function chunkTermsForParse(terms: readonly string[]): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];
    let length = 0;
    for (const term of terms) {
        const nextLength = length + term.length + (current.length ? PARSE_TERM_SEPARATOR.length : 0);
        if (current.length && nextLength > PARSE_TEXT_LIMIT) {
            chunks.push(current);
            current = [];
            length = 0;
        }
        current.push(term);
        length += term.length + (current.length > 1 ? 1 : 0);
    }
    if (current.length) chunks.push(current);
    return chunks;
}

function uniqueNormalizedTerms(terms: readonly string[]): string[] {
    return [...new Set(terms.map(normalizeLookupText).filter(Boolean))];
}

// The key hydrateCards() results are stored under. Exported so callers can
// re-key hydration results against their own card-key scheme instead of
// assuming the two coincide (they never did — cardKey embeds spelling and
// reading; this key deliberately does not, because hydration REPLACES them).
export function parsedCardHydrationKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}`;
}

function normalizedDetailLimit(value: number | undefined): number {
    if (value === undefined) return LOOKUP_DETAIL_LIMIT;
    return Math.max(0, Math.floor(value));
}

function normalizeLookupText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function endpointUrl(baseUrl: string | undefined, endpoint: string): string {
    return `${(baseUrl ?? JITEN_PUBLIC_API_BASE_URL).replace(/\/+$/u, '')}/${endpoint.replace(/^\/+/u, '')}`;
}


function arrayRecords(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function finiteInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

function nullableInteger(value: unknown): number | null {
    return finiteInteger(value) ?? null;
}

function isPublicJitenBackoffError(error: unknown): boolean {
    const name = errorName(error);
    if (name === 'AbortError') return true;
    const message = errorMessage(error);
    return /\b(?:429|5\d\d|too many requests|rate[- ]?limited|timed out|aborted|abort|upstream)\b|cloudflare/i.test(message);
}

function logPublicJitenFailure(message: string, context: Record<string, unknown>, error: unknown): void {
    log.warn(message, context, error);
}

function errorName(error: unknown): string {
    return isRecord(error) && typeof error.name === 'string' ? error.name : '';
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}
