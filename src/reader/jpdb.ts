import { JpdbApiClient } from './jpdb-api';
import { getPitchClass, jpdbParseResultToTokens, jpdbVocabularyToCards, splitJapaneseSentences } from './jpdb-parser';
import { LruCache } from './lru-cache';
import { Logger } from './logger';
import type { JPDBCard, JPDBDeck, JPDBGrade, JPDBParseResult, JPDBToken } from './types';

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
const log = Logger.scope('JpdbClient');

export { getPitchClass, splitJapaneseSentences };

export class JpdbClient {
    private api: JpdbApiClient;
    private cardCache = new Map<string, JPDBCard>();
    private parseCache = new LruCache<string, JPDBToken[][]>(PARSE_CACHE_SIZE);

    constructor(getApiKey: () => string) {
        this.api = new JpdbApiClient(getApiKey);
    }

    async parse(paragraphs: string[]): Promise<JPDBToken[][]> {
        const text = normalizeParagraphs(paragraphs);
        if (!text.length) return [];

        const cacheKey = text.join('\n');
        const cached = this.parseCache.get(cacheKey);
        if (cached) {
            log.debug('Parse cache hit', { paragraphs: text.length, tokens: cached.reduce((sum, tokens) => sum + tokens.length, 0) });
            return cached;
        }

        const done = log.time('parse request', { paragraphs: text.length, chars: cacheKey.length });
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
        log.debug('Parse completed', {
            paragraphs: tokens.length,
            tokens: tokens.reduce((sum, paragraphTokens) => sum + paragraphTokens.length, 0),
            cards: cards.length,
        });
        done();
        return tokens;
    }

    async reviewCard(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        log.info('Reviewing card', { term: card.spelling, grade });
        await this.api.request<void>('review', { vid: card.vid, sid: card.sid, grade });
        await this.refreshCard(card);
    }

    async addToDeck(deckId: string, card: JPDBCard, sentence?: string): Promise<void> {
        log.info('Adding card to deck', { term: card.spelling, deckId, hasSentence: Boolean(sentence) });
        await this.addVocabularyToDeck(deckId, card);
        if (sentence) await this.setCardSentence(card, sentence);
        await this.refreshCard(card);
    }

    async listDecks(): Promise<JPDBDeck[]> {
        const response = await this.api.request<{ decks?: unknown[] }>('list-user-decks', { fields: DECK_FIELDS });
        const decks = Array.isArray(response.decks)
            ? response.decks.map(normalizeDeck).filter((deck): deck is JPDBDeck => deck !== null)
            : [];
        log.debug('Decks listed', { decks: decks.length });
        return decks;
    }

    async removeFromDeck(deckId: string, card: JPDBCard): Promise<void> {
        log.info('Removing card from deck', { term: card.spelling, deckId });
        await this.api.request<void>('deck/remove-vocabulary', {
            id: deckId,
            vocabulary: [[card.vid, card.sid]],
        });
        await this.refreshCard(card);
    }

    getCard(vid: number, sid: number): JPDBCard | undefined {
        return this.cardCache.get(cardKey(vid, sid));
    }

    clear(): void {
        this.cardCache.clear();
        this.parseCache.clear();
        log.debug('Caches cleared');
    }

    private async addVocabularyToDeck(deckId: string, card: JPDBCard): Promise<void> {
        if (deckId === 'forq') {
            log.debug('Adding card via JPDB prioritize endpoint', { term: card.spelling });
            await this.api.requestByUrl('https://jpdb.io/prioritize', {
                v: card.vid,
                s: card.sid,
                origin: '/',
            });
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
        const parsed = await this.parse([card.spelling]);
        const fresh = parsed.flat().find(token => token.card.vid === card.vid && token.card.sid === card.sid)?.card;
        if (!fresh) {
            log.warn('Card refresh did not return updated card', { term: card.spelling, vid: card.vid, sid: card.sid });
            return;
        }

        this.cardCache.set(cardKey(card.vid, card.sid), fresh);
        card.cardState = fresh.cardState;
        log.debug('Card refreshed', { term: card.spelling, state: fresh.cardState });
    }

    private cacheCards(cards: JPDBCard[]): void {
        for (const card of cards) {
            this.cardCache.set(cardKey(card.vid, card.sid), card);
        }
    }
}

function normalizeParagraphs(paragraphs: string[]): string[] {
    return paragraphs.map(paragraph => paragraph.trim()).filter(Boolean);
}

function cardKey(vid: number, sid: number): string {
    return `${vid}/${sid}`;
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
