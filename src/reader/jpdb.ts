import { JpdbApiClient } from './jpdb-api';
import { jpdbParseResultToTokens, jpdbVocabularyToCards, splitJapaneseSentences } from './jpdb-parser';
import { runLimited } from './async-utils';
import { LruCache } from './lru-cache';
import { Logger } from './logger';
import type { JPDBCard, JPDBDeck, JPDBGrade, JPDBParseResult, JPDBRawVocabulary, JPDBToken } from './types';

const TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana'];
const VOCABULARY_FIELDS = [
    'vid',
    'sid',
    'rid',
    'spelling',
    'reading',
    'frequency_rank',
    'part_of_speech',
    'meanings_chunks',
    'meanings_part_of_speech',
    'card_state',
    'pitch_accent',
];
const DECK_FIELDS = ['id', 'name'];
const PARSE_CACHE_SIZE = 250;
const PARAGRAPH_PARSE_CACHE_SIZE = 800;
const PARSE_BATCH_BYTE_LIMIT = 16_384;
const PARSE_PARAGRAPH_JSON_OVERHEAD_BYTES = 7;
const VOCABULARY_LOOKUP_CHUNK_SIZE = 100;
const USER_DECK_POOL_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_DECK_POOL_CONCURRENCY = 4;
const JPDB_ALL_DECKS_ID = 'all';
const log = Logger.scope('JpdbClient');
const utf8Encoder = new TextEncoder();

interface JpdbDeckVocabularyResponse {
    vocabulary?: unknown[];
    occurences?: number[];
}

interface JpdbVocabularyLookupResponse {
    vocabulary_info?: unknown[];
}

export interface JpdbListDeckCardsOptions {
    scheduledOnly?: boolean;
    scanLimit?: number;
}

export { splitJapaneseSentences };

export class JpdbClient {
    private api: JpdbApiClient;
    private cardCache = new Map<string, JPDBCard>();
    private parseCache = new LruCache<string, JPDBToken[][]>(PARSE_CACHE_SIZE);
    private parseInFlight = new Map<string, Promise<JPDBToken[][]>>();
    private paragraphParseCache = new LruCache<string, JPDBToken[]>(PARAGRAPH_PARSE_CACHE_SIZE);
    private paragraphParseInFlight = new Map<string, Promise<JPDBToken[]>>();
    private userDeckPoolCache?: { key: string; expiresAt: number; promise: Promise<Set<string>> };

    constructor(private getApiKey: () => string, getProxyUrl: () => string = () => '') {
        this.api = new JpdbApiClient(getApiKey, getProxyUrl);
    }

    // Used by ReaderParser as the live JPDB parse backend.
    // fallow-ignore-next-line unused-class-member
    async parse(paragraphs: string[]): Promise<JPDBToken[][]> {
        const text = normalizeParagraphs(paragraphs);
        if (!text.length) return [];

        const cacheKey = text.join('\n');
        const cached = this.parseCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const inFlight = this.parseInFlight.get(cacheKey);
        if (inFlight) {
            return inFlight;
        }

        const promise = this.parseParagraphs(text, cacheKey);
        this.parseInFlight.set(cacheKey, promise);
        void promise.then(() => {
            if (this.parseInFlight.get(cacheKey) === promise) this.parseInFlight.delete(cacheKey);
        }, () => {
            if (this.parseInFlight.get(cacheKey) === promise) this.parseInFlight.delete(cacheKey);
        });
        return promise;
    }

    // Used by review controllers to submit JPDB grades.
    // fallow-ignore-next-line unused-class-member
    async reviewCard(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        log.info('Reviewing card', { term: card.spelling, grade });
        await this.api.request<void>('review', { vid: card.vid, sid: card.sid, grade });
        await this.refreshCard(card);
    }

    // Used by mining controls to add JPDB-backed cards to selected decks.
    // fallow-ignore-next-line unused-class-member
    async addToDeck(deckId: string, card: JPDBCard, sentence?: string): Promise<void> {
        log.info('Adding card to deck', { term: card.spelling, deckId, hasSentence: Boolean(sentence) });
        await this.addVocabularyToDeck(deckId, card);
        this.clearUserDeckPoolCache();
        if (sentence) await this.setCardSentence(card, sentence);
        await this.refreshCard(card);
    }

    async listDecks(): Promise<JPDBDeck[]> {
        const response = await this.api.request<{ decks?: unknown[] }>('list-user-decks', { fields: DECK_FIELDS });
        const decks = Array.isArray(response.decks)
            ? response.decks.map(normalizeDeck).filter((deck): deck is JPDBDeck => deck !== null)
            : [];
        return decks;
    }

    // Used by new-tab study and stats loaders to sample deck cards.
    // fallow-ignore-next-line unused-class-member
    async listDeckCards(deckId: string, limit = 80, options: JpdbListDeckCardsOptions = {}): Promise<JPDBCard[]> {
        const id = normalizeDeckRequestId(deckId);
        const maxCards = Math.max(1, Math.floor(limit));
        const done = log.time('listDeckCards', { deckId, limit: maxCards, scheduledOnly: options.scheduledOnly, scanLimit: options.scanLimit });
        try {
            const pairs = await this.listDeckVocabularyPairsByRequestId(id);
            return await this.cardsFromDeckVocabularyPairs(pairs, maxCards, options);
        } catch (error) {
            if (id !== JPDB_ALL_DECKS_ID) throw error;
            log.warn('JPDB all-decks list failed; falling back to listed deck scan', error);
            return await this.listCardsFromListedDecks(maxCards, options);
        } finally {
            done();
        }
    }

    // Used by card render data to hydrate deck-membership status.
    // fallow-ignore-next-line unused-class-member
    async isInUserDeckPool(card: JPDBCard): Promise<boolean> {
        if (!isDeckMembershipCard(card)) return false;
        const pool = await this.cachedUserDeckPool();
        return pool.has(vocabularyPairKey(card.vid, card.sid));
    }

    // Used by mining controls to toggle JPDB deck membership.
    // fallow-ignore-next-line unused-class-member
    async removeFromDeck(deckId: string, card: JPDBCard): Promise<void> {
        log.info('Removing card from deck', { term: card.spelling, deckId });
        await this.api.request<void>('deck/remove-vocabulary', {
            id: deckId,
            vocabulary: [[card.vid, card.sid]],
        });
        this.clearUserDeckPoolCache();
        await this.refreshCard(card);
    }

    // Used by ReaderParser to reuse cached JPDB cards from parsed vocabulary.
    // fallow-ignore-next-line unused-class-member
    getCard(vid: number, sid: number): JPDBCard | undefined {
        return this.cardCache.get(vocabularyPairKey(vid, sid));
    }

    clear(): void {
        this.cardCache.clear();
        this.parseCache.clear();
        this.parseInFlight.clear();
        this.paragraphParseCache.clear();
        this.paragraphParseInFlight.clear();
        this.userDeckPoolCache = undefined;
    }

    private async addVocabularyToDeck(deckId: string, card: JPDBCard): Promise<void> {
        if (deckId === 'forq') {
            await this.api.requestByUrl('https://jpdb.io/prioritize', {
                v: card.vid,
                s: card.sid,
                origin: '/',
            }, { response: 'none' });
            return;
        }

        await this.api.request<void>('deck/add-vocabulary', {
            id: deckId,
            vocabulary: [[card.vid, card.sid]],
        });
    }

    private async setCardSentence(card: JPDBCard, sentence: string): Promise<void> {
        await this.api.request<void>('set-card-sentence', {
            vid: card.vid,
            sid: card.sid,
            sentence,
        }).catch(error => {
            log.warn('Failed to set JPDB sentence', { term: card.spelling }, error);
        });
    }

    private async refreshCard(card: JPDBCard): Promise<void> {
        const lookup = await this.api.request<JpdbVocabularyLookupResponse>('lookup-vocabulary', {
            list: [[card.vid, card.sid]],
            fields: VOCABULARY_FIELDS,
        });
        const fresh = jpdbVocabularyToCards((lookup.vocabulary_info ?? []) as JPDBRawVocabulary[])[0];
        if (!fresh) {
            log.warn('Card refresh did not return updated card', { term: card.spelling, vid: card.vid, sid: card.sid });
            return;
        }

        this.cardCache.set(vocabularyPairKey(card.vid, card.sid), fresh);
        Object.assign(card, fresh);
    }

    private cacheCards(cards: JPDBCard[]): void {
        for (const card of cards) {
            this.cardCache.set(vocabularyPairKey(card.vid, card.sid), card);
        }
    }

    private async lookupScheduledDeckCards(pairs: Array<[number, number]>, limit: number): Promise<JPDBCard[]> {
        const cards: JPDBCard[] = [];
        for (let index = 0; index < pairs.length && cards.length < limit; index += VOCABULARY_LOOKUP_CHUNK_SIZE) {
            const batchCards = await this.lookupDeckVocabularyCards(pairs.slice(index, index + VOCABULARY_LOOKUP_CHUNK_SIZE));
            cards.push(...batchCards.filter(isScheduledJpdbStudyCard));
        }
        return cards.slice(0, limit);
    }

    private async lookupDeckVocabularyCards(pairs: Array<[number, number]>): Promise<JPDBCard[]> {
        const rawVocabulary: unknown[] = [];
        for (let index = 0; index < pairs.length; index += VOCABULARY_LOOKUP_CHUNK_SIZE) {
            const lookup = await this.api.request<JpdbVocabularyLookupResponse>('lookup-vocabulary', {
                list: pairs.slice(index, index + VOCABULARY_LOOKUP_CHUNK_SIZE),
                fields: VOCABULARY_FIELDS,
            });
            rawVocabulary.push(...(lookup.vocabulary_info ?? []));
        }
        const cards = jpdbVocabularyToCards(rawVocabulary as JPDBRawVocabulary[]);
        this.cacheCards(cards);
        return orderJpdbCardsByPairs(cards, pairs);
    }

    private cachedUserDeckPool(): Promise<Set<string>> {
        const now = Date.now();
        const key = this.getApiKey().trim();
        if (this.userDeckPoolCache?.key === key && this.userDeckPoolCache.expiresAt > now) return this.userDeckPoolCache.promise;
        const promise = this.loadUserDeckPool().catch(error => {
            if (this.userDeckPoolCache?.promise === promise) this.userDeckPoolCache = undefined;
            throw error;
        });
        this.userDeckPoolCache = { key, expiresAt: now + USER_DECK_POOL_CACHE_TTL_MS, promise };
        return promise;
    }

    private async loadUserDeckPool(): Promise<Set<string>> {
        try {
            return await this.fetchDeckVocabularyPairSet(JPDB_ALL_DECKS_ID);
        } catch (error) {
            log.warn('JPDB all-decks membership failed; falling back to user deck scan', error);
            return await this.fetchListedDeckVocabularyPairSet();
        }
    }

    private async fetchListedDeckVocabularyPairSet(): Promise<Set<string>> {
        const decks = await this.listDecks();
        const pool = new Set<string>();
        await runLimited(decks, USER_DECK_POOL_CONCURRENCY, async deck => {
            const pairs = await this.listDeckVocabularyPairs(deck.id).catch((): Array<[number, number]> => []);
            for (const [vid, sid] of pairs) pool.add(vocabularyPairKey(vid, sid));
        });
        return pool;
    }

    private async listCardsFromListedDecks(limit: number, options: JpdbListDeckCardsOptions): Promise<JPDBCard[]> {
        const decks = await this.listDecks();
        const cards: JPDBCard[] = [];
        const seen = new Set<string>();
        for (const deck of decks) {
            if (cards.length >= limit) break;
            const pairs = await this.listDeckVocabularyPairs(deck.id).catch(error => {
                log.warn('JPDB listed-deck scan skipped a deck', { deckId: deck.id }, error);
                return [] as Array<[number, number]>;
            });
            const deckCards = await this.cardsFromDeckVocabularyPairs(pairs, limit - cards.length, options);
            for (const card of deckCards) {
                const key = vocabularyPairKey(card.vid, card.sid);
                if (seen.has(key)) continue;
                seen.add(key);
                cards.push(card);
                if (cards.length >= limit) break;
            }
        }
        return cards.slice(0, limit);
    }

    private async cardsFromDeckVocabularyPairs(
        rawPairs: Array<[number, number]>,
        limit: number,
        options: JpdbListDeckCardsOptions,
    ): Promise<JPDBCard[]> {
        const pairs = deckVocabularyPairsForRequest(rawPairs, limit, options);
        if (!pairs.length) return [];
        return options.scheduledOnly
            ? await this.lookupScheduledDeckCards(pairs, limit)
            : await this.lookupDeckVocabularyCards(pairs);
    }

    private async fetchDeckVocabularyPairSet(deckId: string): Promise<Set<string>> {
        const pairs = await this.listDeckVocabularyPairs(deckId);
        return new Set(pairs.map(([vid, sid]) => vocabularyPairKey(vid, sid)));
    }

    private async listDeckVocabularyPairs(deckId: string): Promise<Array<[number, number]>> {
        return this.listDeckVocabularyPairsByRequestId(normalizeDeckRequestId(deckId));
    }

    private async listDeckVocabularyPairsByRequestId(id: string | number): Promise<Array<[number, number]>> {
        const response = await this.api.request<JpdbDeckVocabularyResponse>('deck/list-vocabulary', {
            id,
            fetch_occurences: false,
        });
        return normalizeVocabularyPairs(response.vocabulary);
    }

    private clearUserDeckPoolCache(): void {
        this.userDeckPoolCache = undefined;
    }

    private async fetchParse(text: string[], cacheKey: string): Promise<JPDBToken[][]> {
        const done = log.time('parse request', { paragraphs: text.length, chars: cacheKey.length });
        try {
            const raw = await this.api.request<JPDBParseResult>('parse', {
                text,
                position_length_encoding: 'utf16',
                token_fields: TOKEN_FIELDS,
                vocabulary_fields: VOCABULARY_FIELDS,
            });
            const cards = jpdbVocabularyToCards(raw.vocabulary);
            const tokens = jpdbParseResultToTokens(text, raw.tokens, cards);

            this.cacheCards(cards);
            this.parseCache.set(cacheKey, tokens);
            text.forEach((paragraph, index) => {
                this.paragraphParseCache.set(paragraph, tokens[index] ?? []);
            });
            return tokens;
        } finally {
            done();
        }
    }

    private parseParagraphs(text: string[], cacheKey: string): Promise<JPDBToken[][]> {
        const missing: string[] = [];
        const seenMissing = new Set<string>();
        for (const paragraph of text) {
            if (this.paragraphParseCache.get(paragraph) || this.paragraphParseInFlight.has(paragraph)) continue;
            if (seenMissing.has(paragraph)) continue;
            seenMissing.add(paragraph);
            missing.push(paragraph);
        }

        if (missing.length) this.queueMissingParagraphParses(missing);

        return Promise.all(text.map(paragraph => this.paragraphParseCache.get(paragraph) ?? this.paragraphParseInFlight.get(paragraph) ?? []))
            .then(tokens => {
                this.parseCache.set(cacheKey, tokens);
                return tokens;
            });
    }

    private queueMissingParagraphParses(missing: string[]): void {
        let previousBatch: Promise<unknown> | null = null;
        for (const batch of parseParagraphBatches(missing)) {
            const batchRequest: Promise<JPDBToken[][]> = previousBatch
                ? previousBatch.then(() => this.fetchParse(batch, batch.join('\n')))
                : this.fetchParse(batch, batch.join('\n'));
            previousBatch = batchRequest.catch(() => undefined);
            batch.forEach((paragraph, index) => {
                const paragraphPromise = batchRequest.then(parsed => parsed[index] ?? []);
                this.paragraphParseInFlight.set(paragraph, paragraphPromise);
                void paragraphPromise.then(() => {
                    if (this.paragraphParseInFlight.get(paragraph) === paragraphPromise) this.paragraphParseInFlight.delete(paragraph);
                }, () => {
                    if (this.paragraphParseInFlight.get(paragraph) === paragraphPromise) this.paragraphParseInFlight.delete(paragraph);
                });
            });
        }
    }
}

function normalizeParagraphs(paragraphs: string[]): string[] {
    return paragraphs.map(paragraph => paragraph.trim()).filter(Boolean);
}

function parseParagraphBatches(paragraphs: string[]): string[][] {
    const batches: string[][] = [];
    let batch: string[] = [];
    let batchBytes = 0;

    for (const paragraph of paragraphs) {
        const paragraphBytes = parseParagraphRequestBytes(paragraph);
        if (batch.length && batchBytes + paragraphBytes > PARSE_BATCH_BYTE_LIMIT) {
            batches.push(batch);
            batch = [];
            batchBytes = 0;
        }
        batch.push(paragraph);
        batchBytes += paragraphBytes;
    }

    if (batch.length) batches.push(batch);
    return batches;
}

function parseParagraphRequestBytes(paragraph: string): number {
    return utf8Encoder.encode(paragraph).length + PARSE_PARAGRAPH_JSON_OVERHEAD_BYTES;
}

function vocabularyPairKey(vid: number, sid: number): string {
    return `${vid}/${sid}`;
}

function isDeckMembershipCard(card: JPDBCard): boolean {
    return Number.isInteger(card.vid) && card.vid > 0 && Number.isInteger(card.sid) && card.sid >= 0;
}

function normalizeDeckRequestId(value: string): string | number {
    const trimmed = value.trim();
    const number = Number(trimmed);
    return trimmed && Number.isInteger(number) && String(number) === trimmed ? number : trimmed;
}

function normalizeVocabularyPairs(value: unknown): Array<[number, number]> {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => {
            if (!Array.isArray(item)) return null;
            const vid = Number(item[0]);
            const sid = Number(item[1]);
            return Number.isInteger(vid) && Number.isInteger(sid) ? [vid, sid] as [number, number] : null;
        })
        .filter((item): item is [number, number] => item !== null);
}

function deckVocabularyPairsForRequest(pairs: Array<[number, number]>, limit: number, options: JpdbListDeckCardsOptions): Array<[number, number]> {
    const scanLimit = normalizePositiveInteger(options.scanLimit);
    const scannedPairs = scanLimit ? pairs.slice(0, scanLimit) : pairs;
    return options.scheduledOnly ? scannedPairs : scannedPairs.slice(0, limit);
}

function orderJpdbCardsByPairs(cards: JPDBCard[], pairs: Array<[number, number]>): JPDBCard[] {
    const byPair = new Map(cards.map(card => [vocabularyPairKey(card.vid, card.sid), card]));
    return pairs
        .map(([vid, sid]) => byPair.get(vocabularyPairKey(vid, sid)))
        .filter((card): card is JPDBCard => Boolean(card));
}

function normalizePositiveInteger(value: number | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const integer = Math.floor(value);
    return integer > 0 ? integer : null;
}

function isScheduledJpdbStudyCard(card: JPDBCard): boolean {
    return card.cardState.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'locked');
}

function normalizeDeck(value: unknown): JPDBDeck | null {
    if (Array.isArray(value)) return normalizeDeckTuple(value);
    if (value && typeof value === 'object') return normalizeDeckRecord(value as Record<string, unknown>);
    return null;
}

function normalizeDeckTuple([id, name]: unknown[]): JPDBDeck | null {
    return isDeckId(id) && typeof name === 'string' ? { id: String(id), name } : null;
}

function normalizeDeckRecord(record: Record<string, unknown>): JPDBDeck | null {
    const id = record.id;
    const name = record.name ?? record.title;
    return isDeckId(id) && typeof name === 'string' ? { id: String(id), name } : null;
}

function isDeckId(value: unknown): value is number | string {
    return typeof value === 'number' || typeof value === 'string';
}
