import { Logger } from '../app/logger';
import type { JPDBCard } from '../app/types';
import { ConcurrencyGate, mapLimited } from '../core/async-utils';
import { pitchPatternFromPosition } from '../lookup/pitch-accent';
import { requestJson } from '../network/http';

const JITEN_PUBLIC_API_BASE_URL = 'https://api.jiten.moe/api';
const REQUEST_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 800;
const DETAIL_CONCURRENCY = 4;
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

export function resetJitenPublicVocabularyBackoffForTests(): void {
    sharedRequestBackoffUntil = 0;
    sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
}

interface PublicParseWord {
    wordId: number;
    readingIndex: number;
    originalText: string;
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
        const promise = this.lookupUncached(normalized)
            .catch(error => {
                this.noteFailure(error);
                log.warn('Jiten lookup', { term: normalized }, error);
                return null;
            });
        this.remember(this.cardCache, normalized, promise, now);
        return promise;
    }

    async lookupMany(terms: readonly string[]): Promise<Map<string, JPDBCard>> {
        const uniqueTerms = uniqueNormalizedTerms(terms);
        const result = new Map<string, JPDBCard>();
        if (!uniqueTerms.length || this.isBackoffActive()) return result;

        const cachedTerms: string[] = [];
        const pendingTerms: string[] = [];
        const now = Date.now();
        uniqueTerms.forEach(term => {
            const cached = this.cardCache.get(term);
            if (cached && cached.expiresAt > now) {
                cachedTerms.push(term);
                return;
            }
            if (cached) this.cardCache.delete(term);
            pendingTerms.push(term);
        });

        if (pendingTerms.length) {
            const loaded = await this.lookupManyUncached(pendingTerms).catch(error => {
                this.noteFailure(error);
                log.warn('Jiten batch', { terms: pendingTerms.length }, error);
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

    clear(): void {
        this.cardCache.clear();
        this.detailCache.clear();
    }

    private async lookupUncached(term: string): Promise<JPDBCard | null> {
        const parsed = await this.parseTerms([term]);
        const candidate = bestParsedWordForTerm(term, parsed);
        return candidate ? this.lookupDetail(candidate, term) : null;
    }

    private async lookupManyUncached(terms: string[]): Promise<Map<string, JPDBCard>> {
        const parsed = await this.parseTerms(terms);
        const candidatesByTerm = new Map<string, PublicParseWord>();
        terms.forEach(term => {
            const candidate = bestParsedWordForBatchTerm(term, parsed);
            if (candidate) candidatesByTerm.set(term, candidate);
        });

        await mapLimited([...candidatesByTerm].slice(0, 12), DETAIL_CONCURRENCY, async ([term, candidate]) => {
            const promise = this.lookupDetail(candidate, term);
            this.remember(this.cardCache, term, promise, Date.now());
            await promise;
        });

        const cards = new Map<string, JPDBCard>();
        await Promise.all([...candidatesByTerm.keys()].map(async term => {
            const card = await this.cardCache.get(term)?.promise.catch(() => null);
            if (card) cards.set(term, card);
        }));
        return cards;
    }

    private async parseTerms(terms: readonly string[]): Promise<PublicParseWord[]> {
        const chunks = chunkTermsForParse(terms);
        const groups = await mapLimited(chunks, DETAIL_CONCURRENCY, chunk => this.requestParse(chunk).catch(error => {
            log.warn('Jiten parse', { terms: chunk.length }, error);
            return [];
        }));
        return groups.flat();
    }

    private async requestParse(terms: readonly string[]): Promise<PublicParseWord[]> {
        return sharedParseGate.run(async () => {
            if (this.isBackoffActive()) return [];
            const text = terms.join(PARSE_TERM_SEPARATOR);
            const payload = await this.requestJson(`vocabulary/parse?text=${encodeURIComponent(text)}`).catch(error => {
                this.noteFailure(error);
                throw error;
            });
            return Array.isArray(payload)
                ? payload.map(normalizePublicParseWord).filter((word): word is PublicParseWord => Boolean(word))
                : [];
        });
    }

    private async lookupDetail(word: PublicParseWord, requestedTerm: string): Promise<JPDBCard | null> {
        const key = `${word.wordId}:${word.readingIndex}`;
        const cached = this.detailCache.get(key);
        const now = Date.now();
        if (cached && cached.expiresAt > now) return cached.promise;
        if (cached) this.detailCache.delete(key);
        const promise = this.requestJson(`vocabulary/${word.wordId}/${word.readingIndex}/info`)
            .then(payload => publicJitenCardFromDetail(payload, requestedTerm, word))
            .catch(error => {
                this.noteFailure(error);
                log.warn('Jiten detail', { wordId: word.wordId, readingIndex: word.readingIndex }, error);
                return null;
            });
        this.remember(this.detailCache, key, promise, now);
        return promise;
    }

    private requestJson(endpoint: string): Promise<unknown> {
        const request = this.options.requestJsonImpl ?? requestJson;
        return request(endpointUrl(this.options.baseUrl, endpoint), {
            responseType: 'json',
            timeoutMs: REQUEST_TIMEOUT_MS,
            timeoutLabel: 'Jiten timeout.',
            failureLabel: 'Jiten',
            statusFailureMessage: status => `Jiten fail (${status}).`,
            proxyUrl: this.proxyUrl(),
            allowDirectCrossOrigin: true,
            allowConfiguredProxy: true,
            allowSensitiveConfiguredProxy: false,
            allowPublicProxies: true,
            preferFetch: true,
        });
    }

    private proxyUrl(): string {
        return typeof this.options.proxyUrl === 'function'
            ? this.options.proxyUrl()
            : this.options.proxyUrl ?? '';
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
}

function publicJitenCardFromDetail(payload: unknown, requestedTerm: string, fallback: PublicParseWord): JPDBCard | null {
    if (!isRecord(payload)) return null;
    const wordId = finiteInteger(payload.wordId) ?? fallback.wordId;
    const mainReading = isRecord(payload.mainReading) ? payload.mainReading : {};
    const annotatedReading = stringValue(mainReading.text) || requestedTerm;
    const spelling = cleanAnnotatedJitenText(annotatedReading) || requestedTerm;
    const reading = cleanJitenAnnotatedReading(annotatedReading) || spelling;
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
        pitchAccent: pitchPatterns(payload.pitchAccents, reading),
        wordWithReading: annotatedReading.includes('[') ? annotatedReading : null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: wordId,
        jitenReadingIndex: fallback.readingIndex,
    };
}

function normalizePublicParseWord(value: unknown): PublicParseWord | null {
    if (!isRecord(value)) return null;
    const wordId = finiteInteger(value.wordId);
    const readingIndex = finiteInteger(value.readingIndex);
    const originalText = stringValue(value.originalText);
    if (wordId === undefined || wordId <= 0 || readingIndex === undefined || !originalText) return null;
    return { wordId, readingIndex, originalText };
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

function bestParsedWordForBatchTerm(term: string, parsed: PublicParseWord[]): PublicParseWord | null {
    const normalized = normalizeLookupText(term);
    return parsed.find(word => normalizeLookupText(word.originalText) === normalized) ?? null;
}

function pitchPatterns(value: unknown, reading: string): string[] {
    return Array.isArray(value)
        ? value.map(finiteInteger).filter((position): position is number => position !== undefined)
            .map(position => pitchPatternFromPosition(reading, position))
            .filter(Boolean)
        : [];
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

function normalizeLookupText(value: string): string {
    return value.replace(/\s+/g, '').trim();
}

function endpointUrl(baseUrl: string | undefined, endpoint: string): string {
    return `${(baseUrl ?? JITEN_PUBLIC_API_BASE_URL).replace(/\/+$/u, '')}/${endpoint.replace(/^\/+/u, '')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
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

function errorName(error: unknown): string {
    return isRecord(error) && typeof error.name === 'string' ? error.name : '';
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return isRecord(error) && typeof error.message === 'string' ? error.message : '';
}
