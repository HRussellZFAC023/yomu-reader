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
// spent api.jiten.moe's anonymous budget again.
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
// budget.
const PARSE_ENCODED_TEXT_LIMIT = 7800;
const PARSE_TERM_SEPARATOR = '。';
const PARSE_SEPARATOR_ENCODED_LENGTH = encodeURIComponent(PARSE_TERM_SEPARATOR).length;
const log = Logger.scope('JitenPublicVocabulary');
const sharedParseGate = new ConcurrencyGate(1);
let sharedRequestBackoffUntil = 0;
let sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
// When the running backoff began. A request sent by then failed for the
// reason it already counts, so it neither extends nor doubles it.
let sharedRequestBackoffArmedAt = Number.NEGATIVE_INFINITY;

// api.jiten.moe gives an anonymous address 120 vocabulary requests in any
// minute: Jiten's limiter since 2026-10-08 (Sirush/Jiten 506bc13e, a sliding
// 60 s window of six 10 s segments) queues three more and refuses the rest
// with 429. The live API still allowed 300 in a fixed minute on 2026-10-09;
// keeping to the published 120 holds under both. Each request counts as one.
// A word detail Jiten's CDN answers from its cache never reaches the limiter,
// but this client cannot tell which did, and on an article read for the
// first time four in five reached it.
//
// Accounting is per reader realm, not shared across tabs or other apps on
// the same address; upstream refusal still uses the backoff below.
//
// Each kind of work may fill the last minute only up to its own ceiling, so
// the less urgent kinds always leave the more urgent ones room:
// - lookup: the word the learner hovers or clicks. The 15 it leaves are for
//   the popup's own Jiten requests (rank badge search, word info), which the
//   definition client sends.
// - annotation: the word boundaries of the page being read.
// - enrichment: page readings and pitch, and the popup's example sentences.
export type JitenRequestPriority = 'lookup' | 'annotation' | 'enrichment';
const REQUEST_CEILINGS: Readonly<Record<JitenRequestPriority, number>> = { lookup: 105, annotation: 70, enrichment: 50 };
const PRIORITY_RANKS: Readonly<Record<JitenRequestPriority, number>> = { lookup: 2, annotation: 1, enrichment: 0 };
const REQUEST_WINDOW_MS = 60_000;
const sentRequests: number[] = [];

export interface JitenPublicVocabularyClientOptions {
    baseUrl?: string;
    proxyUrl?: string | (() => string);
    requestJsonImpl?: (url: string, options?: Parameters<typeof requestJson>[1]) => Promise<unknown>;
}

export interface JitenPublicLookupManyOptions {
    detailLimit?: number;
    detailTimeoutMs?: number;
    // Enrichment unless the caller says otherwise.
    priority?: JitenRequestPriority;
}

export function resetJitenPublicVocabularyBackoffForTests(): void {
    sharedRequestBackoffUntil = 0;
    sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
    sharedRequestBackoffArmedAt = Number.NEGATIVE_INFINITY;
    sentRequests.length = 0;
}

// The background lanes (deferred readings and pitch) wait this long before
// asking again: while the shared backoff runs, or until enrichment's share of
// the last minute has room.
export function publicJitenBackoffRemainingMs(): number {
    const now = Date.now();
    return Math.max(0, sharedRequestBackoffUntil - now, ceilingWaitMs('enrichment', now));
}

// How long until fewer requests than the priority's ceiling were sent in the
// last minute.
function ceilingWaitMs(priority: JitenRequestPriority, now: number): number {
    while (sentRequests.length && sentRequests[0] <= now - REQUEST_WINDOW_MS) sentRequests.shift();
    const excess = sentRequests.length - REQUEST_CEILINGS[priority];
    return excess < 0 ? 0 : sentRequests[excess] + REQUEST_WINDOW_MS - now;
}

// Backoff and a spent share hold requests back, never answers already in
// hand: a hovered word the page looked up earlier keeps its Jiten card (and
// so its rank badge) while api.jiten.moe is not being asked.
function mayRequest(priority: JitenRequestPriority): boolean {
    const now = Date.now();
    return now >= sharedRequestBackoffUntil && ceilingWaitMs(priority, now) === 0;
}

function noteRequestFailure(error: unknown, sentAt: number): void {
    if (!isPublicJitenBackoffError(error) || sentAt <= sharedRequestBackoffArmedAt) return;
    const now = Date.now();
    sharedRequestBackoffArmedAt = now;
    sharedRequestBackoffUntil = now + sharedRequestBackoffMs;
    sharedRequestBackoffMs = Math.min(sharedRequestBackoffMs * 2, REQUEST_BACKOFF_MAX_MS);
}

// A completed request proves the endpoint is healthy again: stop the
// doubling so the NEXT backoff (if any) starts from the initial window
// instead of a session-cumulative maximum.
function noteRequestSuccess(): void {
    sharedRequestBackoffMs = REQUEST_BACKOFF_INITIAL_MS;
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
    // Jiten's words for each passage parsed. Hovering another word of a
    // sentence parses that sentence again.
    private readonly passages = new Map<string, CacheEntry<PublicParseWord[]>>();
    // The word Jiten read each run of letters as inside a parsed passage. A
    // term that cannot be asked is answered from here, so the 移住者 a page's
    // own parse read as one word stays one word for a hover while Jiten is
    // backed off, instead of falling to the segmenter's 移住.
    private readonly seen = new Map<string, CacheEntry<PublicParseWord>>();
    private readonly details = new Map<string, CacheEntry<Promise<JPDBCard | null>>>();
    private readonly reading = new Map<string, { read: Promise<void>; priority: JitenRequestPriority }>();

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
        const priority = options.priority ?? 'enrichment';
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
        // A term another call is already asking about is waited for, not sent
        // twice: the hover, the popup and the page scan often overlap. A call
        // waits only for an ask at least as urgent as its own; behind the
        // page's queue a hover would wait for all of it.
        const reads = new Set<Promise<void>>();
        const toRead: string[] = [];
        for (const term of unread) {
            const pending = this.reading.get(term);
            if (pending && PRIORITY_RANKS[pending.priority] >= PRIORITY_RANKS[priority]) reads.add(pending.read);
            else toRead.push(term);
        }
        if (toRead.length && mayRequest(priority)) {
            const read: Promise<void> = this.readTerms(toRead, priority)
                .catch(error => logPublicJitenFailure('Jiten batch', { terms: toRead.length }, error))
                .finally(() => toRead.forEach(term => {
                    if (this.reading.get(term)?.read === read) this.reading.delete(term);
                }));
            toRead.forEach(term => this.reading.set(term, { read, priority }));
            reads.add(read);
        }
        await Promise.all(reads);

        let detailBudget = normalizedDetailLimit(options.detailLimit);
        const answers = asked.flatMap(term => {
            const now = Date.now();
            const answered = this.cached(this.words, term, now);
            const word = answered ? answered.value : this.cached(this.seen, term, now)?.value;
            if (!word) return [];
            const detail = this.cached(this.details, publicWordKey(word), now)?.value;
            if (detail) return [{ term, card: detail, persist: false }];
            if (detailBudget > 0 && mayRequest(priority)) {
                detailBudget--;
                // Only Jiten's answer for the term itself is kept across pages.
                return [{ term, card: this.lookupDetail(word, term, options.detailTimeoutMs), persist: Boolean(answered) }];
            }
            // While Jiten cannot be asked, the word a learner waits on still
            // has its identity; the popup asks for the rest when it can.
            if (priority === 'lookup' && !mayRequest(priority)) return [{ term, card: Promise.resolve(publicJitenParsedCard(word, term)), persist: false }];
            return [];
        });
        await Promise.all(answers.map(async ({ term, card: pending, persist }) => {
            const card = await pending;
            if (!card) return;
            result.set(term, card);
            if (persist) writePublicJitenCache('card', term, card);
        }));
        return result;
    }

    async parse(paragraphs: readonly string[], options: JitenPublicLookupManyOptions = {}): Promise<JPDBToken[][]> {
        const priority = options.priority ?? 'enrichment';
        const result = paragraphs.map((): JPDBToken[] => []);
        if (!paragraphs.length) return result;
        const chunks = publicParseChunks(paragraphs);
        await mapLimited(chunks, DETAIL_CONCURRENCY, async chunk => {
            const parsed = this.cached(this.passages, chunk.text, Date.now())?.value ?? await this.readPassage(chunk.text, priority);
            applyPublicParseChunk(result, chunk, parsed, paragraphs);
        });
        await this.hydrateParsedTokens(result, options.detailLimit ?? PARSE_DETAIL_LIMIT, priority);
        return result;
    }

    async hydrateCards(cards: readonly JPDBCard[], options: JitenPublicLookupManyOptions = {}): Promise<Map<string, JPDBCard>> {
        const priority = options.priority ?? 'enrichment';
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
        await mapLimited(pending, DETAIL_CONCURRENCY, async item => {
            if (!this.cached(this.details, publicWordKey(item.word), Date.now()) && !mayRequest(priority)) return;
            const card = await this.lookupDetail(item.word, item.requestedTerm, options.detailTimeoutMs ?? JITEN_BACKGROUND_DETAIL_TIMEOUT_MS);
            if (!card) return;
            result.set(item.key, card);
            writePublicJitenCache('card', normalizeLookupText(card.spelling), card);
        });
        return result;
    }

    clear(): void {
        this.words.clear();
        this.passages.clear();
        this.seen.clear();
        this.details.clear();
    }

    private async readPassage(text: string, priority: JitenRequestPriority): Promise<PublicParseWord[]> {
        const records = await this.parseTurn(priority, () => this.requestParseRecords(text, priority)).catch(error => {
            logPublicJitenFailure('Jiten public parse', { length: text.length }, error);
            return null;
        });
        if (!records) return [];
        const words = records.filter(word => word.wordId > 0);
        const now = Date.now();
        this.remember(this.passages, text, words, now);
        words.forEach(word => this.remember(this.seen, normalizeLookupText(word.originalText), word, now));
        return words;
    }

    // Jiten answers a joined batch with words and gaps laid end to end over
    // the text, and its answer for one term depends on its neighbours: a gap
    // runs on across separators, and a word it skipped can be placed over an
    // earlier copy of the same letters. A term whose own records stay inside
    // it is answered; one a record crosses is asked again with its neighbours
    // reversed, and Jiten does not read a term unsettled both ways as a word.
    private async readTerms(terms: readonly string[], priority: JitenRequestPriority): Promise<void> {
        const unsettled = await this.readTermBatches(terms, priority);
        if (!unsettled.length) return;
        const now = Date.now();
        for (const term of await this.readTermBatches(unsettled.reverse(), priority)) this.remember(this.words, term, null, now);
    }

    private async readTermBatches(terms: readonly string[], priority: JitenRequestPriority): Promise<string[]> {
        const unsettled = await mapLimited(chunkTermsForParse(terms), DETAIL_CONCURRENCY, chunk => this.parseTurn(priority, async () => {
            // A more urgent ask may have answered some of these while this
            // one waited its turn.
            const asked = chunk.filter(term => !this.cached(this.words, term, Date.now()));
            if (!asked.length) return [];
            const records = await this.requestParseRecords(asked.join(PARSE_TERM_SEPARATOR), priority);
            if (!records) return [];
            const now = Date.now();
            return publicParseTermAnswers(asked, records).flatMap((word, index) => {
                if (word === undefined) return [asked[index]];
                this.remember(this.words, asked[index], word, now);
                return [];
            });
        }));
        return unsettled.flatMap(terms => terms ?? []);
    }

    private async hydrateParsedTokens(result: JPDBToken[][], limit: number, priority: JitenRequestPriority): Promise<void> {
        const tokens = result.flat();
        if (!tokens.length || limit <= 0) return;
        const hydrationCards = parsedCardsWithinTargetBoundary(result, limit);
        const cards = await this.hydrateCards(hydrationCards, { detailLimit: hydrationCards.length, priority });
        if (!cards.size) return;
        for (const token of tokens) {
            const card = cards.get(parsedCardHydrationKey(token.card));
            if (!card) continue;
            token.card = card;
            token.pitchClass = getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass;
        }
    }

    // Public parses go to Jiten one at a time, and a more urgent one goes
    // ahead of those waiting. Null when backoff or a spent share kept the
    // turn from asking.
    private parseTurn<R>(priority: JitenRequestPriority, ask: () => Promise<R>): Promise<R | null> {
        return sharedParseGate.run(() => mayRequest(priority) ? ask() : null, PRIORITY_RANKS[priority]);
    }

    private async requestParseRecords(text: string, priority: JitenRequestPriority): Promise<PublicParseWord[] | null> {
        const records: PublicParseWord[] = [];
        for (const part of publicParseTextSlices(text)) {
            // A long term may span more than one request. If its share ends
            // between chunks, do not cache an incomplete response as a miss.
            if (!mayRequest(priority)) return null;
            const payload = await this.requestJson(`vocabulary/parse?text=${encodeURIComponent(part.text)}`);
            if (!Array.isArray(payload)) continue;
            records.push(...payload.map(normalizePublicParseWord).filter((word): word is PublicParseWord => Boolean(word)));
        }
        return records;
    }

    private lookupDetail(word: PublicParseWord, requestedTerm: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<JPDBCard | null> {
        const key = publicWordKey(word);
        const now = Date.now();
        const cached = this.cached(this.details, key, now);
        if (cached) return cached.value;
        const promise = this.requestJson(`vocabulary/${word.wordId}/${word.readingIndex}/info`, timeoutMs)
            .then(payload => publicJitenCardFromDetail(payload, requestedTerm, word))
            .catch(error => {
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

    // Every request is counted here, once, whatever its outcome.
    private async requestJson(endpoint: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
        const request = this.options.requestJsonImpl ?? requestJson;
        const sentAt = Date.now();
        sentRequests.push(sentAt);
        try {
            const payload = await request(endpointUrl(this.options.baseUrl, endpoint), {
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
            noteRequestSuccess();
            return payload;
        } catch (error) {
            noteRequestFailure(error, sentAt);
            throw error;
        }
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
