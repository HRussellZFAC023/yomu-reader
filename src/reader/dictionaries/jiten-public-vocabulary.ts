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
// The span resolver asks about every candidate substring of a page's
// sentences, about 4,000 terms on a long article. A smaller memory evicted the
// page's own answers before a hover re-parsed their sentence, and every repeat
// spent api.jiten.moe's anonymous budget (300 requests a minute) again.
const CACHE_LIMIT = 5000;
const DETAIL_CONCURRENCY = 4;
const LOOKUP_DETAIL_LIMIT = 12;
const PARSE_DETAIL_LIMIT = LOOKUP_DETAIL_LIMIT;
const REQUEST_BACKOFF_INITIAL_MS = 30_000;
const REQUEST_BACKOFF_MAX_MS = 5 * 60_000;
const PARSE_TEXT_LIMIT = 1900;
// The public endpoint uses GET. 1,900 Japanese characters become a 17 KB
// request URL, so the encoded query is bounded as well as the text. Jiten's
// own limit is an 8 KB request line (an 8,148-byte URL parsed, 8,247 bytes got
// HTTP 414, 2026-10-08). Fuller requests mean fewer of them from the anonymous
// 300-a-minute budget.
const PARSE_ENCODED_TEXT_LIMIT = 7800;
const PARSE_TERM_SEPARATOR = '。';
const PARSE_SEPARATOR_ENCODED_LENGTH = encodeURIComponent(PARSE_TERM_SEPARATOR).length;
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

interface CacheEntry<T> {
    expiresAt: number;
    value: T;
}

export class JitenPublicVocabularyClient {
    // Jiten's reading of each term asked: the word it reads the whole term
    // as, or null when it reads the term as anything else.
    private readonly words = new Map<string, CacheEntry<PublicParseWord | null>>();
    private readonly details = new Map<string, CacheEntry<Promise<JPDBCard | null>>>();

    constructor(private readonly options: JitenPublicVocabularyClientOptions = {}) {}

    async lookup(term: string): Promise<JPDBCard | null> {
        const normalized = normalizeLookupText(term);
        if (!normalized) return null;
        return (await this.lookupMany([normalized])).get(normalized) ?? null;
    }

    // Answers each term Jiten reads as one word with that word's card. Terms
    // are asked once a cache lifetime; details go to the first `detailLimit`
    // words not yet looked up, in the caller's order.
    async lookupMany(terms: readonly string[], options: JitenPublicLookupManyOptions = {}): Promise<Map<string, JPDBCard>> {
        const result = new Map<string, JPDBCard>();
        const asked: string[] = [];
        const unread: string[] = [];
        const now = Date.now();
        for (const term of uniqueNormalizedTerms(terms)) {
            const known = this.cached(this.words, term, now);
            const persisted = known ? undefined : readPublicJitenCache<JPDBCard>('card', term, now);
            if (persisted) {
                result.set(term, persisted);
                continue;
            }
            asked.push(term);
            if (!known) unread.push(term);
        }
        if (unread.length && !this.isBackoffActive()) {
            await this.readTerms(unread).catch(error => {
                this.noteFailure(error);
                logPublicJitenFailure('Jiten batch', { terms: unread.length }, error);
            });
        }

        let detailBudget = normalizedDetailLimit(options.detailLimit);
        const answers = asked.flatMap(term => {
            const word = this.cached(this.words, term, Date.now())?.value;
            if (!word) return [];
            const key = publicWordKey(word);
            const detail = this.cached(this.details, key, Date.now())?.value;
            if (detail) return [{ term, card: detail, fresh: false }];
            if (detailBudget <= 0 || this.isBackoffActive()) return [];
            detailBudget--;
            return [{ term, card: this.lookupDetail(word, term, options.detailTimeoutMs), fresh: true }];
        });
        await Promise.all(answers.map(async ({ term, card: pending, fresh }) => {
            const card = await pending;
            if (!card) return;
            result.set(term, card);
            if (fresh) writePublicJitenCache('card', term, card);
        }));
        return result;
    }

    async parse(paragraphs: readonly string[], options: JitenPublicLookupManyOptions = {}): Promise<JPDBToken[][]> {
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
        await this.hydrateParsedTokens(result, options.detailLimit ?? PARSE_DETAIL_LIMIT);
        return result;
    }

    async hydrateCards(cards: readonly JPDBCard[], options: JitenPublicLookupManyOptions = {}): Promise<Map<string, JPDBCard>> {
        const result = new Map<string, JPDBCard>();
        if (!cards.length) return result;
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
                continue;
            }
            if (pending.length < limit) pending.push({ key, word, requestedTerm: card.spelling || word.originalText });
        }
        if (this.isBackoffActive()) return result;
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
        this.words.clear();
        this.details.clear();
    }

    // Jiten answers a joined batch with words and gaps laid end to end over
    // the text, and its answer for one term depends on its neighbours: a gap
    // runs on across separators, and a word it skipped can be placed over an
    // earlier copy of the same letters. A term whose own records stay inside
    // it is answered; one a record crosses is asked again with its neighbours
    // reversed, and Jiten does not read a term unsettled both ways as a word.
    private async readTerms(terms: readonly string[]): Promise<void> {
        const unsettled = await this.readTermBatches(terms);
        if (!unsettled.length) return;
        const now = Date.now();
        for (const term of await this.readTermBatches(unsettled.reverse())) this.remember(this.words, term, null, now);
    }

    private async readTermBatches(terms: readonly string[]): Promise<string[]> {
        const unsettled = await mapLimited(chunkTermsForParse(terms), DETAIL_CONCURRENCY, async chunk => {
            const records = await this.requestParseRecords(chunk.join(PARSE_TERM_SEPARATOR));
            if (!records) return [];
            const now = Date.now();
            return publicParseTermAnswers(chunk, records).flatMap((word, index) => {
                if (word === undefined) return [chunk[index]];
                this.remember(this.words, chunk[index], word, now);
                return [];
            });
        });
        return unsettled.flat();
    }

    private async hydrateParsedTokens(result: JPDBToken[][], limit: number): Promise<void> {
        const tokens = result.flat();
        if (!tokens.length || limit <= 0) return;
        const hydrationCards = parsedCardsWithinTargetBoundary(result, limit);
        const cards = await this.hydrateCards(hydrationCards, { detailLimit: hydrationCards.length });
        if (!cards.size) return;
        for (const token of tokens) {
            const card = cards.get(parsedCardHydrationKey(token.card));
            if (!card) continue;
            token.card = card;
            token.pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass;
        }
    }

    private async requestParseText(text: string): Promise<PublicParseWord[]> {
        const records = await this.requestParseRecords(text);
        return records?.filter(word => word.wordId > 0) ?? [];
    }

    // Null when backoff kept part of the text from being asked.
    private async requestParseRecords(text: string): Promise<PublicParseWord[] | null> {
        const records: PublicParseWord[] = [];
        for (const part of publicParseTextSlices(text)) {
            const answer = await this.requestParseRecordChunk(part.text);
            if (!answer) return null;
            records.push(...answer);
        }
        return records;
    }

    private requestParseRecordChunk(text: string): Promise<PublicParseWord[] | null> {
        return sharedParseGate.run(async () => {
            if (this.isBackoffActive()) return null;
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

    private lookupDetail(word: PublicParseWord, requestedTerm: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<JPDBCard | null> {
        const key = publicWordKey(word);
        const now = Date.now();
        const cached = this.cached(this.details, key, now);
        if (cached) return cached.value;
        const promise = this.requestJson(`vocabulary/${word.wordId}/${word.readingIndex}/info`, timeoutMs)
            .then(payload => {
                this.noteSuccess();
                return publicJitenCardFromDetail(payload, requestedTerm, word);
            })
            .catch(error => {
                this.noteFailure(error);
                // A failure is not an answer: keep its null only long enough
                // to absorb a burst, so the paced retry lane can ask again.
                const entry = this.details.get(key);
                if (entry) entry.expiresAt = Math.min(entry.expiresAt, Date.now() + TRANSIENT_NULL_TTL_MS);
                logPublicJitenFailure('Jiten detail', { wordId: word.wordId, readingIndex: word.readingIndex }, error);
                return null;
            });
        this.remember(this.details, key, promise, now);
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

    private cached<T>(cache: Map<string, CacheEntry<T>>, key: string, now: number): CacheEntry<T> | undefined {
        const entry = cache.get(key);
        if (entry && entry.expiresAt <= now) cache.delete(key);
        return entry && entry.expiresAt > now ? entry : undefined;
    }

    // Oldest first: entries go in as they are answered, so pruning stops at the
    // first live one instead of walking a page-sized map on every insert.
    private remember<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, now: number): void {
        cache.delete(key);
        cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
        for (const [entryKey, entry] of cache) {
            if (cache.size <= CACHE_LIMIT && entry.expiresAt > now) break;
            cache.delete(entryKey);
        }
    }

    // Backoff holds requests back, never answers already in hand: a hovered
    // word the page looked up earlier keeps its Jiten card (and so its rank
    // badge) while api.jiten.moe is refusing this address.
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

function parsedCardsWithinTargetBoundary(result: readonly JPDBToken[][], limit: number): JPDBCard[] {
    const detailLimit = normalizedDetailLimit(limit);
    const selected: JPDBCard[] = [];
    const seen = new Set<string>();
    for (const tokens of result) {
        if (selected.length >= detailLimit) break;
        const targetCards: JPDBCard[] = [];
        const targetSeen = new Set<string>();
        for (const { card } of tokens) {
            const key = parsedCardHydrationKey(card);
            if (seen.has(key) || targetSeen.has(key)) continue;
            targetSeen.add(key);
            targetCards.push(card);
        }
        const remaining = detailLimit - selected.length;
        // This is a network ceiling, not a layout preference. Never finish a
        // target by overrunning the caller's detail budget (11 earlier cards +
        // a 12-card title used to fan out into 23 /info requests). Sparse tail
        // cards retain exact ids and are completed by the paced reading lane.
        const selectedTargetCards = targetCards.slice(0, remaining);
        for (const card of selectedTargetCards) {
            selected.push(card);
            seen.add(parsedCardHydrationKey(card));
        }
    }
    return selected;
}

function publicJitenCardFromDetail(payload: unknown, requestedTerm: string, fallback: PublicParseWord): JPDBCard | null {
    if (!isRecord(payload)) return null;
    const wordId = finiteInteger(payload.wordId) ?? fallback.wordId;
    const mainReading = isRecord(payload.mainReading) ? payload.mainReading : {};
    // A missing lexical form is not evidence for the requested spelling or
    // reading. Leave the sparse card unresolved instead of inventing either.
    const annotatedReading = stringValue(mainReading.text).trim();
    if (!annotatedReading) return null;
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

// Jiten's answer for each term of a joined batch, by where its records lie:
// the word whose record is exactly the term, null when every record over the
// term stays inside it, undefined when one crosses its edge or the answer
// stops short of it. Text no record covers counts as a gap.
function publicParseTermAnswers(terms: readonly string[], records: readonly PublicParseWord[]): Array<PublicParseWord | null | undefined> {
    const text = terms.join(PARSE_TERM_SEPARATOR);
    const placed: Array<{ start: number; end: number; wordId: number; word?: PublicParseWord }> = [];
    let covered = 0;
    for (const word of records) {
        const start = text.indexOf(word.originalText, covered);
        if (start < 0) continue;
        if (start > covered) placed.push({ start: covered, end: start, wordId: 0 });
        covered = start + word.originalText.length;
        placed.push({ start, end: covered, wordId: word.wordId, word });
    }
    let start = 0;
    let first = 0;
    return terms.map(term => {
        const end = start + term.length;
        const termStart = start;
        start = end + PARSE_TERM_SEPARATOR.length;
        if (end > covered) return undefined;
        while (placed[first].end <= termStart) first++;
        let last = first;
        while (placed[last].end < end) last++;
        if (placed[first].start < termStart || placed[last].end > end) return undefined;
        return first === last && placed[first].wordId > 0 ? placed[first].word : null;
    });
}

function publicParseChunks(paragraphs: readonly string[]): PublicParseChunk[] {
    const chunks: PublicParseChunk[] = [];
    let current: PublicParseChunk = { text: '', ranges: [] };
    let encodedLength = 0;
    const flush = (): void => {
        if (!current.text) return;
        chunks.push(current);
        current = { text: '', ranges: [] };
        encodedLength = 0;
    };
    paragraphs.forEach((paragraph, paragraphIndex) => {
        for (const { text: part, offset } of publicParseTextSlices(paragraph)) {
            const partEncodedLength = encodeURIComponent(part).length;
            if (current.text && (current.text.length + 1 + part.length > PARSE_TEXT_LIMIT
                || encodedLength + PARSE_SEPARATOR_ENCODED_LENGTH + partEncodedLength > PARSE_ENCODED_TEXT_LIMIT)) flush();
            encodedLength += partEncodedLength + (current.text ? PARSE_SEPARATOR_ENCODED_LENGTH : 0);
            const chunkStart = current.text ? current.text.length + 1 : 0;
            // Independent targets need a hard boundary: the public endpoint's
            // newline batch can return large unparsed gaps even for known words.
            // The separator is transport-only and lies outside every source range.
            current.text += `${current.text ? PARSE_TERM_SEPARATOR : ''}${part}`;
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

function* publicParseTextSlices(text: string): Generator<{ text: string; offset: number }> {
    let start = 0, end = 0, encodedLength = 0;
    for (const character of text) {
        const length = encodeURIComponent(character).length;
        if (end > start && (end - start + character.length > PARSE_TEXT_LIMIT
            || encodedLength + length > PARSE_ENCODED_TEXT_LIMIT)) {
            yield { text: text.slice(start, end), offset: start };
            start = end;
            encodedLength = 0;
        }
        end += character.length;
        encodedLength += length;
    }
    if (end > start) yield { text: text.slice(start, end), offset: start };
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
    let encodedLength = 0;
    for (const term of terms) {
        const termEncodedLength = encodeURIComponent(term).length;
        const nextEncodedLength = encodedLength + termEncodedLength + (current.length ? PARSE_SEPARATOR_ENCODED_LENGTH : 0);
        const nextLength = length + term.length + (current.length ? PARSE_TERM_SEPARATOR.length : 0);
        if (current.length && (nextLength > PARSE_TEXT_LIMIT || nextEncodedLength > PARSE_ENCODED_TEXT_LIMIT)) {
            chunks.push(current);
            current = [];
            length = 0;
            encodedLength = 0;
        }
        encodedLength += termEncodedLength + (current.length ? PARSE_SEPARATOR_ENCODED_LENGTH : 0);
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

function publicWordKey(word: PublicParseWord): string {
    return `${word.wordId}:${word.readingIndex}`;
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

// A host that stopped answering backs off like one that said 429. Matched by
// type: the timeout labels are copy ("Jiten timeout."), and when one was
// shortened from "...timed out." every timeout stopped counting, so a
// throttled api.jiten.moe kept each popup queued behind 1.5 s waits.
function isPublicJitenBackoffError(error: unknown): boolean {
    const name = errorName(error);
    if (name === 'AbortError' || name === 'RetryableTimeoutError') return true;
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
