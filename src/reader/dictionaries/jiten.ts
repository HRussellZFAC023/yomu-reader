import { requestHttp } from '../reader-http-request';
import type { ReaderHttpOptions } from '../reader-http-options';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { pitchPatternFromPosition } from '../pitch-accent';
import type { CardState, JPDBCard, JPDBGrade, JPDBRuby, JPDBToken } from '../types';

export const JITEN_API_BASE_URL = 'https://api.jiten.moe/api';

const REQUEST_TIMEOUT_MS = 30_000;
const MISSING_API_KEY_MESSAGE = 'Jiten API key is not set.';

export interface JitenReaderStudyDeck {
    userStudyDeckId: number;
    name: string;
}

export interface JitenCardReference {
    wordId: number;
    readingIndex: number;
}

export interface JitenApiClientOptions {
    baseUrl?: string;
    fetchImpl?: JitenFetch;
    requestImpl?: JitenRequest;
    proxyUrl?: string | (() => string);
    timeoutMs?: number;
}

export class JitenApiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'JitenApiError';
    }
}

type JitenFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type JitenRequest = (url: string, options?: ReaderHttpOptions) => Promise<unknown>;

type JitenEndpointMap = {
    'reader/ping': [undefined, unknown];
    'reader/parse': [JitenParseRequest, JitenParseResult];
    'srs/reader-study-decks': [undefined, JitenReaderStudyDeck[]];
    'srs/study-batch': [undefined, JitenStudyBatchResponse];
    'srs/review': [JitenReviewRequest, unknown];
    'srs/set-vocabulary-state': [JitenVocabularyStateRequest, unknown];
};

interface JitenRequestOptions {
    method?: 'GET' | 'POST';
    query?: Record<string, string | number | boolean | undefined | null>;
}

interface JitenParseRequest {
    text: string[];
}

interface JitenParseResult {
    tokens: JitenRawToken[][];
    vocabulary: JitenRawVocabulary[];
}

interface JitenRawToken {
    wordId: number;
    readingIndex: number;
    start: number;
    end: number;
    length: number;
}

interface JitenRawVocabulary {
    wordId: number;
    readingIndex: number;
    spelling: string;
    reading: string;
    frequencyRank?: number | null;
    partsOfSpeech?: string[] | string;
    meaningsChunks?: string[][];
    meaningsPartOfSpeech?: string[][] | string[];
    knownState?: number[];
    pitchAccents?: number[] | null;
}

interface JitenStudyBatchResponse {
    sessionId: string;
    cards: JitenStudyCardDto[];
    newCardsRemaining: number;
    reviewsRemaining: number;
    newCardsToday: number;
    reviewsToday: number;
}

interface JitenStudyCardDto {
    cardId: number;
    wordId: number;
    readingIndex: number;
    state: number;
    isNewCard: boolean;
    wordText: string;
    wordTextPlain: string;
    readings: JitenStudyReadingDto[];
    definitions: JitenStudyDefinitionDto[];
    partsOfSpeech: string[];
    pitchAccents?: number[] | null;
    frequencyRank?: number | null;
    exampleSentence?: JitenStudyExampleSentenceDto | null;
    sourceDeckName?: string | null;
}

interface JitenStudyReadingDto {
    text: string;
    rubyText: string;
    readingIndex: number;
    formType: number;
}

interface JitenStudyDefinitionDto {
    index: number;
    meanings: string[];
    partsOfSpeech: string[];
}

interface JitenStudyExampleSentenceDto {
    text: string;
}

interface JitenReviewRequest extends JitenCardReference {
    rating: number;
}

interface JitenVocabularyStateRequest extends JitenCardReference {
    state: string;
}

export type JitenVocabularyDeckState = 'mining' | 'blacklist' | 'neverForget' | 'suspend' | 'forget';
export type JitenVocabularyStateAction = 'add' | 'remove';

export class JitenApiClient {
    constructor(
        private getApiKey: () => string,
        private options: JitenApiClientOptions = {},
    ) {}

    async ping(): Promise<boolean> {
        await this.request('reader/ping', undefined);
        return true;
    }

    async validateApiKey(apiKey?: string): Promise<boolean> {
        const client = apiKey === undefined ? this : new JitenApiClient(() => apiKey, this.options);
        try {
            await client.ping();
            return true;
        } catch (error) {
            if (isJitenAuthenticationError(error) || isMissingJitenApiKeyError(error)) return false;
            throw error;
        }
    }

    async parse(paragraphs: string[]): Promise<JPDBToken[][]> {
        const response = await this.request('reader/parse', { text: paragraphs });
        return jitenParseResultToTokens(paragraphs, response);
    }

    async listReaderStudyDecks(): Promise<JitenReaderStudyDeck[]> {
        const response = await this.request('srs/reader-study-decks', undefined);
        return normalizeReaderStudyDecks(response);
    }

    async listStudyBatchCards(limit = 80): Promise<JPDBCard[]> {
        const cardLimit = Math.max(1, Math.floor(limit));
        const response = await this.requestEndpoint<JitenStudyBatchResponse>('srs/study-batch', undefined, {
            method: 'GET',
            query: { limit: cardLimit },
        });
        return normalizeJitenStudyBatchCards(response).slice(0, cardLimit);
    }

    async reviewCard(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        await this.request('srs/review', {
            ...jitenCardReference(card),
            rating: jitenRatingForGrade(grade),
        });
    }

    async setVocabularyState(card: JPDBCard, deck: JitenVocabularyDeckState, action: JitenVocabularyStateAction): Promise<void> {
        await this.request('srs/set-vocabulary-state', {
            ...jitenCardReference(card),
            state: `${deck}-${action}`,
        });
    }

    async addToStudyDeck(deckId: string | number, card: JPDBCard, sentence?: string, source?: string): Promise<void> {
        const normalizedDeckId = normalizeJitenStudyDeckId(deckId);
        await this.requestEndpoint<unknown>(`srs/study-decks/${normalizedDeckId}/words`, {
            ...jitenCardReference(card),
            occurrences: 1,
            sentence,
            source,
        });
    }

    private async request<Key extends keyof JitenEndpointMap>(
        endpoint: Key,
        body: JitenEndpointMap[Key][0],
    ): Promise<JitenEndpointMap[Key][1]> {
        return this.requestEndpoint<JitenEndpointMap[Key][1]>(endpoint, body);
    }

    private async requestEndpoint<T>(endpoint: string, body: unknown, options: JitenRequestOptions = {}): Promise<T> {
        const apiKey = this.getApiKey().trim();
        if (!apiKey) throw new JitenApiError(MISSING_API_KEY_MESSAGE);
        const method = options.method ?? 'POST';
        const data = method === 'GET' ? undefined : body === undefined ? undefined : JSON.stringify(body);
        const url = endpointUrl(this.options.baseUrl, endpoint, options.query);

        if (this.options.fetchImpl) {
            const response = await fetchWithTimeout(
                this.options.fetchImpl,
                url,
                {
                    method,
                    headers: this.headers(apiKey),
                    body: data,
                },
                this.options.timeoutMs ?? REQUEST_TIMEOUT_MS,
            );

            return parseJitenResponse<T>(response);
        }

        try {
            const payload = await this.requestImpl()(url, {
                method,
                headers: this.headers(apiKey),
                data,
                responseType: 'json',
                timeoutMs: this.options.timeoutMs ?? REQUEST_TIMEOUT_MS,
                timeoutLabel: 'Jiten request timed out.',
                failureLabel: 'Jiten request',
                statusFailureMessage: status => `Jiten request failed (${status}).`,
                proxyUrl: this.proxyUrl(),
                allowDirectCrossOrigin: true,
                allowConfiguredProxy: true,
                preferFetch: true,
            });
            return parseJitenPayload<T>(payload);
        } catch (error) {
            throw normalizeJitenRequestError(error);
        }
    }

    private requestImpl(): JitenRequest {
        return this.options.requestImpl ?? requestHttp;
    }

    private proxyUrl(): string {
        return typeof this.options.proxyUrl === 'function'
            ? this.options.proxyUrl()
            : this.options.proxyUrl ?? '';
    }

    private headers(apiKey: string): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            Authorization: `ApiKey ${apiKey}`,
            Accept: 'application/json',
        };
    }
}

export function validateJitenApiKey(apiKey: string, options?: JitenApiClientOptions): Promise<boolean> {
    return new JitenApiClient(() => apiKey, options).validateApiKey();
}

function jitenParseResultToTokens(paragraphs: string[], result: JitenParseResult): JPDBToken[][] {
    const vocabulary = Array.isArray(result.vocabulary) ? result.vocabulary : [];
    const cardByKey = new Map(vocabulary.map(entry => [jitenLookupKey(entry.wordId, entry.readingIndex), jitenCardFromVocabulary(entry)]));
    const vocabByKey = new Map(vocabulary.map(entry => [jitenLookupKey(entry.wordId, entry.readingIndex), entry]));
    const tokens: JPDBToken[][] = (Array.isArray(result.tokens) ? result.tokens : []).map((group, paragraphIndex) => {
        let lastPitchClass = '';
        const parsed: JPDBToken[] = [];
        for (const token of Array.isArray(group) ? group : []) {
            const card = cardByKey.get(jitenLookupKey(token.wordId, token.readingIndex));
            if (!card) continue;
            const vocabularyEntry = vocabByKey.get(jitenLookupKey(token.wordId, token.readingIndex));
            const pitchClass = card.partOfSpeech.includes('prt') ? '' : getPitchClass(card.pitchAccent, card.reading);
            lastPitchClass = pitchClass || lastPitchClass;
            const rubies = jitenTokenRubies(vocabularyEntry, token);
            if (rubies.length) card.wordWithReading = jitenWordWithReading(card.spelling, rubies, token.start);
            parsed.push({
                card,
                start: token.start,
                end: token.end,
                length: token.length,
                rubies,
                pitchClass: lastPitchClass,
                sentence: paragraphs[paragraphIndex] ?? '',
            });
        }
        return parsed;
    });
    addJitenSentenceInfo(paragraphs, tokens);
    return tokens;
}

export function jitenCardReference(card: JPDBCard): JitenCardReference {
    const wordId = finiteJitenInteger(card.jitenWordId) ?? (card.source === 'jiten' ? finiteJitenInteger(card.vid) : undefined);
    const readingIndex = finiteJitenInteger(card.jitenReadingIndex) ?? (card.source === 'jiten' ? finiteJitenInteger(card.sid) : undefined);
    if (wordId === undefined || readingIndex === undefined || wordId <= 0 || readingIndex < 0) {
        throw new JitenApiError('Card is not backed by Jiten.');
    }
    return { wordId, readingIndex };
}

export function jitenRatingForGrade(grade: JPDBGrade): number {
    if (grade === 'easy') return 4;
    if (grade === 'okay' || grade === 'pass') return 3;
    if (grade === 'hard' || grade === 'something') return 2;
    return 1;
}

function jitenCardFromVocabulary(vocabulary: JitenRawVocabulary): JPDBCard {
    const reading = cleanJitenAnnotatedReading(vocabulary.reading);
    const pitchAccent = (vocabulary.pitchAccents ?? [])
        .map(position => pitchPatternFromPosition(reading, position))
        .filter(Boolean);
    return {
        vid: vocabulary.wordId,
        sid: vocabulary.readingIndex,
        rid: 0,
        spelling: vocabulary.spelling,
        reading,
        frequencyRank: typeof vocabulary.frequencyRank === 'number' ? vocabulary.frequencyRank : null,
        partOfSpeech: arrayOfStrings(vocabulary.partsOfSpeech),
        meanings: (vocabulary.meaningsChunks ?? []).map((glosses, index) => ({
            glosses: arrayOfStrings(glosses),
            partOfSpeech: jitenMeaningPartOfSpeech(vocabulary.meaningsPartOfSpeech, index),
        })),
        cardState: jitenKnownStateToCardStates(vocabulary.knownState),
        pitchAccent,
        wordWithReading: null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: vocabulary.wordId,
        jitenReadingIndex: vocabulary.readingIndex,
    };
}

function normalizeJitenStudyBatchCards(response: JitenStudyBatchResponse): JPDBCard[] {
    const cards = Array.isArray(response.cards) ? response.cards : [];
    return cards
        .map(jitenCardFromStudyCard)
        .filter((card): card is JPDBCard => Boolean(card));
}

function jitenCardFromStudyCard(card: JitenStudyCardDto): JPDBCard | null {
    const wordId = finiteJitenInteger(card.wordId);
    const readingIndex = finiteJitenInteger(card.readingIndex);
    if (wordId === undefined || readingIndex === undefined) return null;
    const reading = jitenStudyCardReading(card);
    return {
        vid: wordId,
        sid: readingIndex,
        rid: finiteJitenInteger(card.cardId) ?? 0,
        spelling: jitenStudyCardSpelling(card),
        reading,
        frequencyRank: jitenStudyCardFrequencyRank(card),
        partOfSpeech: arrayOfStrings(card.partsOfSpeech),
        meanings: jitenStudyCardMeanings(card),
        cardState: jitenStudyStateToCardStates(card.state, card.isNewCard),
        pitchAccent: jitenStudyCardPitchAccent(card, reading),
        wordWithReading: card.wordText || null,
        source: 'jiten',
        sentence: jitenStudyCardSentence(card),
        reviewSource: 'jiten-api',
        jitenWordId: wordId,
        jitenReadingIndex: readingIndex,
    };
}

function jitenStudyCardPitchAccent(card: JitenStudyCardDto, reading: string): string[] {
    return (card.pitchAccents ?? [])
        .map(position => pitchPatternFromPosition(reading, position))
        .filter(Boolean);
}

function jitenStudyCardFrequencyRank(card: JitenStudyCardDto): number | null {
    return typeof card.frequencyRank === 'number' ? card.frequencyRank : null;
}

function jitenStudyCardMeanings(card: JitenStudyCardDto): JPDBCard['meanings'] {
    return (Array.isArray(card.definitions) ? card.definitions : []).map(definition => ({
        glosses: arrayOfStrings(definition.meanings),
        partOfSpeech: arrayOfStrings(definition.partsOfSpeech),
    }));
}

function jitenStudyCardSentence(card: JitenStudyCardDto): string | undefined {
    return typeof card.exampleSentence?.text === 'string' ? card.exampleSentence.text : undefined;
}

function jitenStudyCardSpelling(card: JitenStudyCardDto): string {
    return (card.wordTextPlain || cleanJitenAnnotatedReading(card.wordText || '') || jitenStudyCardReading(card)).trim();
}

function jitenStudyCardReading(card: JitenStudyCardDto): string {
    const reading = (Array.isArray(card.readings) ? card.readings : [])
        .find(candidate => candidate.readingIndex === card.readingIndex);
    return cleanJitenAnnotatedReading(reading?.text || reading?.rubyText || card.wordText || card.wordTextPlain || '').trim();
}

function jitenStudyStateToCardStates(state: number, isNewCard: boolean): CardState[] {
    if (isNewCard) return ['new'];
    return [JITEN_FSRS_CARD_STATE_MAP[state] ?? 'known'];
}

const JITEN_FSRS_CARD_STATE_MAP: Record<number, CardState> = {
    0: 'new',
    1: 'learning',
    2: 'due',
    3: 'failed',
    4: 'blacklisted',
    5: 'never-forget',
    6: 'suspended',
};

function cleanJitenAnnotatedReading(value: string): string {
    return value.replace(/([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g, '$2');
}

function jitenKnownStateToCardStates(states: number[] | undefined): CardState[] {
    const mapped = (states ?? [])
        .map(state => JITEN_CARD_STATE_MAP[state])
        .filter((state): state is CardState => Boolean(state));
    return mapped.length ? mapped : ['known'];
}

const JITEN_CARD_STATE_MAP: Record<number, CardState> = {
    0: 'new',
    1: 'learning',
    2: 'known',
    3: 'blacklisted',
    4: 'due',
    5: 'never-forget',
    6: 'redundant',
};

function jitenMeaningPartOfSpeech(value: JitenRawVocabulary['meaningsPartOfSpeech'], index: number): string[] {
    if (!Array.isArray(value)) return [];
    return Array.isArray(value[index])
        ? arrayOfStrings(value[index])
        : arrayOfStrings(value);
}

function jitenTokenRubies(vocabulary: JitenRawVocabulary | undefined, token: JitenRawToken): JPDBRuby[] {
    return extractJitenRubiesFromAnnotated(vocabulary?.reading ?? '').map(ruby => ({
        ...ruby,
        start: token.start + ruby.start,
        end: token.start + ruby.end,
    }));
}

function extractJitenRubiesFromAnnotated(input: string): JPDBRuby[] {
    const rubies: JPDBRuby[] = [];
    const regex = /((?:.|\n)*?)([\u4e00-\u9faf\u3005-\u3007]+)\[([^\]]+)\]/g;
    let match: RegExpExecArray | null;
    let currentOffset = 0;
    while ((match = regex.exec(input)) !== null) {
        const prefix = match[1] ?? '';
        const base = match[2] ?? '';
        const text = match[3] ?? '';
        currentOffset += prefix.length;
        const start = currentOffset;
        const length = base.length;
        rubies.push({ text, start, end: start + length, length });
        currentOffset += length;
    }
    return rubies;
}

function jitenWordWithReading(spelling: string, rubies: JPDBRuby[], tokenStart: number): string {
    const word = Array.from(spelling);
    for (let index = rubies.length - 1; index >= 0; index -= 1) {
        const ruby = rubies[index];
        if (!ruby) continue;
        word.splice(ruby.start - tokenStart + ruby.length, 0, `[${ruby.text}]`);
    }
    return word.join('');
}

function addJitenSentenceInfo(paragraphs: string[], tokens: JPDBToken[][]): void {
    paragraphs.forEach((paragraph, index) => {
        const group = tokens[index] ?? [];
        const sentences = splitJitenJapaneseTextIntoSentences(paragraph);
        if (sentences.length === 1) {
            group.forEach(token => { token.sentence = sentences[0]; });
            return;
        }
        let offset = 0;
        sentences.forEach((sentence, sentenceIndex) => {
            const compareSentence = sentence.replace(/(^[「『])|([。！？」』]$)/g, '');
            const position = paragraph.substring(offset).indexOf(compareSentence);
            if (position === -1) return;
            const sentenceStart = offset + position;
            const nextCompareSentence = sentences[sentenceIndex + 1]?.replace(/(^[「『])|([。！？」』]$)/g, '');
            const nextPosition = nextCompareSentence ? paragraph.indexOf(nextCompareSentence, sentenceStart + compareSentence.length) : -1;
            const sentenceEnd = nextPosition !== -1 ? nextPosition : paragraph.length;
            group.forEach(token => {
                if (token.start >= sentenceStart && token.end <= sentenceEnd) token.sentence = sentence;
            });
            offset = sentenceStart + compareSentence.length;
        });
    });
}

function splitJitenJapaneseTextIntoSentences(text: string): string[] {
    const sentences = text.match(/.*?[。！？」』](?=\s?|$)|「.*?」|『.*?』/g) || [];
    return sentences.length
        ? sentences
            .map(sentence => sentence.trim())
            .filter(Boolean)
            .filter(sentence => !/^[」』]$/.test(sentence))
            .map(sentence => {
                if (/「.*?」|『.*?』/.test(sentence)) return sentence;
                const trimmed = sentence.replace(/(^「|『)|(」|』$)/, '');
                return /[。！？]$/.test(trimmed) ? trimmed : `${trimmed}。`;
            })
        : [text];
}

function arrayOfStrings(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    return typeof value === 'string' ? [value] : [];
}

function jitenLookupKey(wordId: number, readingIndex: number): string {
    return `${wordId}:${readingIndex}`;
}

function isJitenAuthenticationError(error: unknown): error is JitenApiError {
    return error instanceof JitenApiError && (error.status === 401 || error.status === 403);
}

async function fetchWithTimeout(fetchImpl: JitenFetch, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (isAbortError(error)) throw new JitenApiError('Jiten request timed out.');
        throw error;
    } finally {
        globalThis.clearTimeout(timeoutId);
    }
}

async function parseJitenResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const json = parseJson(text);
    const errorMessage = jitenApplicationErrorMessage(json);

    if (errorMessage) throw new JitenApiError(errorMessage, response.status);
    if (!response.ok) throw new JitenApiError(`Jiten request failed (${response.status}).`, response.status);

    return json as T;
}

function parseJitenPayload<T>(payload: unknown): T {
    const errorMessage = jitenApplicationErrorMessage(payload);
    if (errorMessage) throw new JitenApiError(errorMessage);
    return payload as T;
}

function normalizeJitenRequestError(error: unknown): Error {
    if (error instanceof JitenApiError) return error;
    const status = error instanceof Error ? statusFromMessage(error.message) : undefined;
    if (status === 401 || status === 403) return new JitenApiError('Jiten rejected the API key.', status);
    if (status) return new JitenApiError(`Jiten request failed (${status}).`, status);
    if (error instanceof Error && /timed out|abort/i.test(error.message)) return new JitenApiError('Jiten request timed out.');
    return error instanceof Error ? error : new JitenApiError('Jiten request failed.');
}

function statusFromMessage(message: string): number | undefined {
    const match = /\((\d{3})\)/.exec(message);
    return match ? Number(match[1]) : undefined;
}

function parseJson(text: string): unknown {
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function jitenApplicationErrorMessage(value: unknown): string | undefined {
    if (!isJsonRecord(value)) return undefined;
    const message = value.error_message;
    return typeof message === 'string' && message ? message : undefined;
}

function normalizeReaderStudyDecks(value: unknown): JitenReaderStudyDeck[] {
    if (!Array.isArray(value)) throw new JitenApiError('Jiten reader study deck response was invalid.');
    return value.map(normalizeReaderStudyDeck);
}

function normalizeReaderStudyDeck(value: unknown): JitenReaderStudyDeck {
    if (!isJsonRecord(value)) throw new JitenApiError('Jiten reader study deck response was invalid.');
    const { userStudyDeckId, name } = value;
    if (typeof userStudyDeckId !== 'number' || !Number.isFinite(userStudyDeckId) || typeof name !== 'string') {
        throw new JitenApiError('Jiten reader study deck response was invalid.');
    }
    return { userStudyDeckId, name };
}

function normalizeJitenStudyDeckId(value: string | number): number {
    const id = typeof value === 'number' ? value : Number(value.trim());
    if (!Number.isInteger(id) || id <= 0) throw new JitenApiError('Jiten study deck id was invalid.');
    return id;
}

function finiteJitenInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function isMissingJitenApiKeyError(error: unknown): error is JitenApiError {
    return error instanceof JitenApiError && error.message === MISSING_API_KEY_MESSAGE;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function endpointUrl(baseUrl: string | undefined, endpoint: string, query?: JitenRequestOptions['query']): string {
    const base = (baseUrl?.trim() || JITEN_API_BASE_URL).replace(/\/+$/, '');
    const url = `${base}/${endpoint}`;
    const params = new URLSearchParams();
    Object.entries(query ?? {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        params.set(key, String(value));
    });
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}
