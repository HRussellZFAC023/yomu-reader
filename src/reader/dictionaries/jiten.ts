import { requestHttp } from '../network/http-request';
import { recordJitenDailyStats } from './jiten-stats-cache';
import type { ReaderHttpOptions } from '../network/http-options';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { pitchPatternFromPosition } from '../lookup/pitch-accent';
import type { CardState, JPDBCard, JPDBGrade, JPDBRuby, JPDBToken, ReviewGradeInterval, ReviewGradeIntervals } from '../app/types';

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
    'reader/lookup-vocabulary': [JitenLookupVocabularyRequest, JitenLookupVocabularyResult];
    'kanji': [undefined, JitenKanjiInfo];
    'kanji/words': [undefined, JitenKanjiWordsPage];
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

interface JitenLookupVocabularyRequest {
    words: Array<[number, number]>;
}

interface JitenLookupVocabularyResult {
    result: unknown[];
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
    reviewButtons?: unknown;
    reviewGradeIntervals?: unknown;
    nextReviewIntervals?: unknown;
    nextIntervals?: unknown;
    nextReviews?: unknown;
    reviewIntervals?: unknown;
    srsIntervals?: unknown;
    ratingIntervals?: unknown;
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
    reviewButtons?: unknown;
    reviewGradeIntervals?: unknown;
    nextReviewIntervals?: unknown;
    nextIntervals?: unknown;
    nextReviews?: unknown;
    reviewIntervals?: unknown;
    srsIntervals?: unknown;
    ratingIntervals?: unknown;
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

export interface JitenVocabularyDefinition {
    index: number;
    meanings: string[];
    partsOfSpeech: string[];
    field: string[];
    dial: string[];
    misc: string[];
    restrictedToReadingIndices: number[];
}

export interface JitenVocabularyReading {
    text: string;
    readingIndex: number;
    frequencyRank: number | null;
    usedInMediaAmount: number | null;
}

export interface JitenVocabularyWordSummary {
    wordId: number;
    readingIndex: number;
    reading: string;
    readingFurigana: string;
    mainDefinition: string;
    frequencyRank: number | null;
    matchSurface: string;
    audioUrls?: string[];
}

export interface JitenVocabularyExample {
    sentenceId: number;
    text: string;
    wordPosition: number;
    wordLength: number;
    difficulty: number | null;
    sourceTitle: string;
    audioUrls?: string[];
}

export interface JitenVocabularyInfo {
    wordId: number;
    mainReading: JitenVocabularyReading | null;
    alternativeReadings: JitenVocabularyReading[];
    partsOfSpeech: string[];
    definitions: JitenVocabularyDefinition[];
    pitchAccents: number[];
    knownStates: CardState[];
    composedOf: JitenVocabularyWordSummary[];
    usedIn: JitenVocabularyWordSummary[];
    usedInTotal: number;
    examples: JitenVocabularyExample[];
}

export interface JitenKanjiReadingWords {
    reading: string;
    totalWords: number;
    words: JitenVocabularyWordSummary[];
}

export interface JitenKanjiGroupingTags {
    kanken: string | null;
    wanikani: string | null;
    rtk: string | null;
    klc: string | null;
    tmw: string | null;
}

export interface JitenKanjiInfo {
    character: string;
    onReadings: string[];
    kunReadings: string[];
    meanings: string[];
    strokeCount: number | null;
    jlptLevel: number | null;
    grade: number | null;
    frequencyRank: number | null;
    groupingTags: JitenKanjiGroupingTags;
    topWords: JitenVocabularyWordSummary[];
    wordsByReading: JitenKanjiReadingWords[];
}

export interface JitenKanjiWordsPage {
    items: JitenVocabularyWordSummary[];
    total: number;
    pageSize: number;
    offset: number;
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

    async lookupVocabularyInfo(card: JPDBCard): Promise<JitenVocabularyInfo | null> {
        const reference = jitenCardReference(card);
        const endpoint = `vocabulary/${reference.wordId}/${reference.readingIndex}/info`;
        const info = await this.requestEndpoint<unknown>(endpoint, undefined, { method: 'GET' });
        if (!isJsonRecord(info)) return null;
        const normalized = normalizeJitenVocabularyInfo(info);
        if (!normalized) return null;
        normalized.examples = await this.lookupVocabularyExamples(reference).catch(() => []);
        return normalized;
    }

    async lookupKanji(character: string): Promise<JitenKanjiInfo | null> {
        const kanji = character.trim();
        if (!kanji) return null;
        const payload = await this.requestEndpoint<unknown>(`kanji/${encodeURIComponent(kanji)}`, undefined, { method: 'GET' });
        return normalizeJitenKanjiInfo(payload);
    }

    async lookupKanjiWords(character: string, options: { reading?: string; page?: number; pageSize?: number } = {}): Promise<JitenKanjiWordsPage | null> {
        const kanji = character.trim();
        if (!kanji) return null;
        const payload = await this.requestEndpoint<unknown>(`kanji/${encodeURIComponent(kanji)}/words`, undefined, {
            method: 'GET',
            query: {
                reading: options.reading,
                page: options.page,
                pageSize: options.pageSize,
            },
        });
        return normalizeJitenKanjiWordsPage(payload);
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
        recordJitenDailyStats(response);
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

    private async lookupVocabularyExamples(card: JitenCardReference): Promise<JitenVocabularyExample[]> {
        const endpoint = `vocabulary/${card.wordId}/${card.readingIndex}/random-example-sentences`;
        const payload = await this.requestEndpoint<unknown>(endpoint, [], { method: 'POST' });
        return normalizeJitenVocabularyExamples(payload);
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
                allowDirectCrossOrigin: false,
                allowConfiguredProxy: true,
                allowSensitiveConfiguredProxy: true,
                allowPublicProxies: false,
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
    const payload: Record<string, unknown> = isJsonRecord(result) ? result : {};
    const vocabulary = jitenVocabularyEntries(payload.vocabulary);
    const cardByKey = new Map(vocabulary.map(entry => [jitenLookupKey(entry.wordId, entry.readingIndex), jitenCardFromVocabulary(entry)]));
    const vocabByKey = new Map(vocabulary.map(entry => [jitenLookupKey(entry.wordId, entry.readingIndex), entry]));
    const rawTokens = Array.isArray(payload.tokens) ? payload.tokens : [];
    const tokens: JPDBToken[][] = paragraphs.map((paragraph, paragraphIndex) => {
        let lastPitchClass = '';
        const parsed: JPDBToken[] = [];
        for (const token of jitenTokenEntries(rawTokens[paragraphIndex])) {
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
                sentence: paragraph,
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
    const pitchAccent = jitenPitchAccentPatterns(vocabulary.pitchAccents, reading);
    const reviewGradeIntervals = jitenReviewGradeIntervals(vocabulary);
    return {
        vid: vocabulary.wordId,
        sid: vocabulary.readingIndex,
        rid: 0,
        spelling: vocabulary.spelling,
        reading,
        frequencyRank: typeof vocabulary.frequencyRank === 'number' ? vocabulary.frequencyRank : null,
        partOfSpeech: arrayOfStrings(vocabulary.partsOfSpeech),
        meanings: (Array.isArray(vocabulary.meaningsChunks) ? vocabulary.meaningsChunks : []).map((glosses, index) => ({
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
        ...(reviewGradeIntervals ? { reviewGradeIntervals } : {}),
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
    const reviewGradeIntervals = jitenReviewGradeIntervals(card);
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
        ...(reviewGradeIntervals ? { reviewGradeIntervals } : {}),
    };
}

function jitenStudyCardPitchAccent(card: JitenStudyCardDto, reading: string): string[] {
    return jitenPitchAccentPatterns(card.pitchAccents, reading);
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

function jitenKnownStateToCardStates(states: unknown): CardState[] {
    const mapped = jitenStateNumbers(states)
        .map(state => JITEN_CARD_STATE_MAP[state])
        .filter((state): state is CardState => Boolean(state));
    return mapped.length ? mapped : ['mature'];
}

const JITEN_CARD_STATE_MAP: Record<number, CardState> = {
    0: 'new',
    1: 'young',
    2: 'mature',
    3: 'blacklisted',
    4: 'due',
    5: 'mastered',
    6: 'redundant',
};

function normalizeJitenVocabularyInfo(value: unknown): JitenVocabularyInfo | null {
    if (!isJsonRecord(value)) return null;
    const wordId = finiteJitenInteger(value.wordId);
    if (wordId === undefined || wordId <= 0) return null;
    const mainReading = normalizeJitenVocabularyReading(value.mainReading);
    return {
        wordId,
        mainReading,
        alternativeReadings: arrayOfRecords(value.alternativeReadings).map(normalizeJitenVocabularyReading).filter((item): item is JitenVocabularyReading => Boolean(item)),
        partsOfSpeech: arrayOfStrings(value.partsOfSpeech),
        definitions: arrayOfRecords(value.definitions).map(normalizeJitenVocabularyDefinition).filter((item): item is JitenVocabularyDefinition => Boolean(item)),
        pitchAccents: jitenStateNumbers(value.pitchAccents),
        knownStates: Array.isArray(value.knownStates) ? jitenKnownStateToCardStates(value.knownStates) : [],
        composedOf: normalizeJitenVocabularyWordSummaries(value.composedOf),
        usedIn: normalizeJitenVocabularyWordSummaries(value.usedIn),
        usedInTotal: finiteJitenInteger(value.usedInTotal) ?? 0,
        examples: [],
    };
}

function normalizeJitenVocabularyReading(value: unknown): JitenVocabularyReading | null {
    if (!isJsonRecord(value)) return null;
    const text = firstRecordString(value, ['text']);
    const readingIndex = finiteJitenInteger(value.readingIndex);
    if (!text || readingIndex === undefined) return null;
    return {
        text,
        readingIndex,
        frequencyRank: nullableFiniteInteger(value.frequencyRank),
        usedInMediaAmount: nullableFiniteInteger(value.usedInMediaAmount),
    };
}

function normalizeJitenVocabularyDefinition(value: unknown): JitenVocabularyDefinition | null {
    if (!isJsonRecord(value)) return null;
    const meanings = arrayOfStrings(value.meanings);
    if (!meanings.length) return null;
    return {
        index: finiteJitenInteger(value.index) ?? 0,
        meanings,
        partsOfSpeech: arrayOfStrings(value.partsOfSpeech),
        field: arrayOfStrings(value.field),
        dial: arrayOfStrings(value.dial),
        misc: arrayOfStrings(value.misc),
        restrictedToReadingIndices: jitenStateNumbers(value.restrictedToReadingIndices),
    };
}

function normalizeJitenVocabularyWordSummaries(value: unknown): JitenVocabularyWordSummary[] {
    return arrayOfRecords(value)
        .map(normalizeJitenVocabularyWordSummary)
        .filter((item): item is JitenVocabularyWordSummary => Boolean(item));
}

function normalizeJitenVocabularyWordSummary(value: unknown): JitenVocabularyWordSummary | null {
    if (!isJsonRecord(value)) return null;
    const wordId = finiteJitenInteger(value.wordId);
    const readingIndex = finiteJitenInteger(value.readingIndex);
    const reading = firstRecordString(value, ['reading']) ?? '';
    if (wordId === undefined || readingIndex === undefined || !reading) return null;
    return {
        wordId,
        readingIndex,
        reading,
        readingFurigana: firstRecordString(value, ['readingFurigana']) ?? '',
        mainDefinition: firstRecordString(value, ['mainDefinition']) ?? '',
        frequencyRank: nullableFiniteInteger(value.frequencyRank),
        matchSurface: firstRecordString(value, ['matchSurface']) ?? '',
        audioUrls: normalizeJitenAudioUrls(value),
    };
}

function normalizeJitenVocabularyExamples(value: unknown): JitenVocabularyExample[] {
    return arrayOfRecords(value)
        .map(normalizeJitenVocabularyExample)
        .filter((item): item is JitenVocabularyExample => Boolean(item));
}

function normalizeJitenVocabularyExample(value: unknown): JitenVocabularyExample | null {
    if (!isJsonRecord(value)) return null;
    const text = firstRecordString(value, ['text']);
    if (!text) return null;
    return {
        sentenceId: finiteJitenInteger(value.sentenceId) ?? 0,
        text,
        wordPosition: finiteJitenInteger(value.wordPosition) ?? -1,
        wordLength: finiteJitenInteger(value.wordLength) ?? 0,
        difficulty: nullableFiniteNumber(value.difficulty),
        sourceTitle: jitenExampleSourceTitle(value),
        audioUrls: normalizeJitenAudioUrls(value),
    };
}

function normalizeJitenKanjiInfo(value: unknown): JitenKanjiInfo | null {
    if (!isJsonRecord(value)) return null;
    const character = firstRecordString(value, ['character']);
    if (!character) return null;
    return {
        character,
        onReadings: arrayOfStrings(value.onReadings),
        kunReadings: arrayOfStrings(value.kunReadings),
        meanings: arrayOfStrings(value.meanings),
        strokeCount: nullableFiniteInteger(value.strokeCount),
        jlptLevel: nullableFiniteInteger(value.jlptLevel),
        grade: nullableFiniteInteger(value.grade),
        frequencyRank: nullableFiniteInteger(value.frequencyRank),
        groupingTags: normalizeJitenKanjiGroupingTags(value),
        topWords: normalizeJitenVocabularyWordSummaries(value.topWords),
        wordsByReading: arrayOfRecords(value.wordsByReading).map(normalizeJitenKanjiReadingWords).filter((item): item is JitenKanjiReadingWords => Boolean(item)),
    };
}

const JITEN_KANJI_GROUPING_TAG_FIELDS: Record<keyof JitenKanjiGroupingTags, string[]> = {
    kanken: ['kanken', 'kankenLevel'],
    wanikani: ['wanikani', 'waniKani', 'wanikaniLevel', 'waniKaniLevel', 'wk', 'wkLevel'],
    rtk: ['rtk', 'rtkFrame', 'rtkIndex'],
    klc: ['klc', 'klcFrame', 'klcIndex'],
    tmw: ['tmw', 'tmwLevel', 'tmwIndex', 'theMoeWay', 'theMoeWayLevel'],
};

function normalizeJitenKanjiGroupingTags(value: Record<string, unknown>): JitenKanjiGroupingTags {
    return {
        kanken: jitenKanjiGroupingTag(value, JITEN_KANJI_GROUPING_TAG_FIELDS.kanken),
        wanikani: jitenKanjiGroupingTag(value, JITEN_KANJI_GROUPING_TAG_FIELDS.wanikani),
        rtk: jitenKanjiGroupingTag(value, JITEN_KANJI_GROUPING_TAG_FIELDS.rtk),
        klc: jitenKanjiGroupingTag(value, JITEN_KANJI_GROUPING_TAG_FIELDS.klc),
        tmw: jitenKanjiGroupingTag(value, JITEN_KANJI_GROUPING_TAG_FIELDS.tmw),
    };
}

function jitenKanjiGroupingTag(value: Record<string, unknown>, keys: string[]): string | null {
    const text = firstRecordString(value, keys);
    if (text) return text;
    const number = firstRecordFiniteNumber(value, keys);
    return number === null ? null : String(number);
}

function normalizeJitenKanjiReadingWords(value: unknown): JitenKanjiReadingWords | null {
    if (!isJsonRecord(value)) return null;
    const reading = firstRecordString(value, ['reading']);
    if (!reading) return null;
    return {
        reading,
        totalWords: finiteJitenInteger(value.totalWords) ?? 0,
        words: normalizeJitenVocabularyWordSummaries(value.words),
    };
}

function normalizeJitenKanjiWordsPage(value: unknown): JitenKanjiWordsPage | null {
    if (!isJsonRecord(value)) return null;
    return {
        items: normalizeJitenVocabularyWordSummaries(value.items ?? value.data),
        total: finiteJitenInteger(value.total ?? value.totalItems) ?? 0,
        pageSize: finiteJitenInteger(value.pageSize) ?? 0,
        offset: finiteJitenInteger(value.offset ?? value.currentOffset) ?? 0,
    };
}

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

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.filter(isJsonRecord) : [];
}

function nullableFiniteInteger(value: unknown): number | null {
    return finiteJitenInteger(value) ?? null;
}

function nullableFiniteNumber(value: unknown): number | null {
    return finiteJitenNumber(value) ?? null;
}

function firstRecordString(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function firstRecordFiniteNumber(record: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = finiteJitenNumber(record[key]);
        if (value !== undefined) return value;
    }
    return null;
}

function jitenExampleSourceTitle(value: Record<string, unknown>): string {
    const direct = firstRecordString(value, ['sourceTitle', 'title']);
    if (direct) return direct;
    const sourceDeck = isJsonRecord(value.sourceDeck) ? firstRecordString(value.sourceDeck, ['title', 'name']) : null;
    const sourceDeckParent = isJsonRecord(value.sourceDeckParent) ? firstRecordString(value.sourceDeckParent, ['title', 'name']) : null;
    return sourceDeck ?? sourceDeckParent ?? '';
}

function normalizeJitenAudioUrls(value: Record<string, unknown>): string[] | undefined {
    const urls = uniqueJitenText([
        ...arrayOfStrings(value.audioUrls),
        ...arrayOfStrings(value.audioUrl),
        ...arrayOfStrings(value.soundUrls),
        ...arrayOfStrings(value.soundUrl),
    ]).filter(isLikelyJitenAudioUrl);
    return urls.length ? urls : undefined;
}

function uniqueJitenText(values: string[]): string[] {
    const seen = new Set<string>();
    return values.map(value => value.trim()).filter(value => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

function isLikelyJitenAudioUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return /^https?:$/i.test(url.protocol);
    } catch {
        return false;
    }
}

function jitenVocabularyEntries(value: unknown): JitenRawVocabulary[] {
    return Array.isArray(value) ? value.filter(isJitenRawVocabulary) : [];
}

function isJitenRawVocabulary(value: unknown): value is JitenRawVocabulary {
    if (!isJsonRecord(value)) return false;
    const wordId = finiteJitenInteger(value.wordId);
    const readingIndex = finiteJitenInteger(value.readingIndex);
    return wordId !== undefined
        && wordId > 0
        && readingIndex !== undefined
        && readingIndex >= 0
        && typeof value.spelling === 'string'
        && typeof value.reading === 'string';
}

function jitenTokenEntries(value: unknown): JitenRawToken[] {
    return Array.isArray(value) ? value.filter(isJitenRawToken) : [];
}

function isJitenRawToken(value: unknown): value is JitenRawToken {
    if (!isJsonRecord(value)) return false;
    return [
        hasPositiveJitenInteger(value.wordId),
        hasNonNegativeJitenInteger(value.readingIndex),
        hasNonNegativeJitenInteger(value.start),
        hasPositiveJitenInteger(value.length),
        hasJitenRawTokenEndAfterStart(value),
    ].every(Boolean);
}

function hasPositiveJitenInteger(value: unknown): boolean {
    const parsed = finiteJitenInteger(value);
    return parsed !== undefined && parsed > 0;
}

function hasNonNegativeJitenInteger(value: unknown): boolean {
    const parsed = finiteJitenInteger(value);
    return parsed !== undefined && parsed >= 0;
}

function hasJitenRawTokenEndAfterStart(value: Record<string, unknown>): boolean {
    const start = finiteJitenInteger(value.start);
    const end = finiteJitenInteger(value.end);
    return start !== undefined && end !== undefined && end > start;
}

function jitenPitchAccentPatterns(value: unknown, reading: string): string[] {
    return jitenStateNumbers(value)
        .map(position => pitchPatternFromPosition(reading, position))
        .filter(Boolean);
}

function jitenStateNumbers(value: unknown): number[] {
    return Array.isArray(value)
        ? value.map(finiteJitenInteger).filter((item): item is number => item !== undefined)
        : [];
}

function jitenReviewGradeIntervals(payload: object): ReviewGradeIntervals | undefined {
    const record = payload as Record<string, unknown>;
    for (const key of JITEN_REVIEW_INTERVAL_KEYS) {
        const parsed = jitenReviewGradeIntervalsFromValue(record[key]);
        if (parsed) return parsed;
    }
    return undefined;
}

function jitenReviewGradeIntervalsFromValue(value: unknown): ReviewGradeIntervals | undefined {
    if (Array.isArray(value)) return jitenReviewGradeIntervalsFromArray(value);
    if (isJsonRecord(value)) return jitenReviewGradeIntervalsFromRecord(value);
    return undefined;
}

function jitenReviewGradeIntervalsFromArray(values: unknown[]): ReviewGradeIntervals | undefined {
    const intervals: ReviewGradeIntervals = {};
    values.forEach((value, index) => {
        const meta = isJsonRecord(value) ? jitenReviewRatingMetaFromRecord(value) : undefined;
        addJitenReviewInterval(intervals, meta ?? JITEN_REVIEW_RATINGS[index], value);
    });
    return Object.keys(intervals).length ? intervals : undefined;
}

function jitenReviewGradeIntervalsFromRecord(record: Record<string, unknown>): ReviewGradeIntervals | undefined {
    const intervals: ReviewGradeIntervals = {};
    for (const meta of JITEN_REVIEW_RATINGS) {
        const value = meta.keys.map(key => record[key]).find(candidate => candidate !== undefined);
        addJitenReviewInterval(intervals, meta, value);
    }
    return Object.keys(intervals).length ? intervals : undefined;
}

function addJitenReviewInterval(
    intervals: ReviewGradeIntervals,
    meta: JitenReviewRatingMeta | undefined,
    value: unknown,
): void {
    if (!meta) return;
    const interval = jitenReviewInterval(value, meta);
    if (!interval) return;
    for (const grade of meta.grades) intervals[grade] = interval;
}

function jitenReviewInterval(value: unknown, meta: JitenReviewRatingMeta): ReviewGradeInterval | null {
    const record = isJsonRecord(value) ? value : null;
    const buttonLabel = jitenReviewButtonLabel(record, meta);
    const intervalLabel = jitenReviewIntervalLabel(value, record);
    if (!intervalLabel) return null;
    return {
        buttonLabel,
        intervalLabel,
        label: prefixedReviewIntervalLabel(buttonLabel, intervalLabel),
        source: 'jiten-study-batch',
    };
}

function jitenReviewButtonLabel(record: Record<string, unknown> | null, meta: JitenReviewRatingMeta): string {
    return firstString(record, ['buttonLabel', 'gradeLabel', 'ratingLabel', 'name']) ?? meta.buttonLabel;
}

function jitenReviewIntervalLabel(value: unknown, record: Record<string, unknown> | null): string {
    if (typeof value === 'string') return normalizeIntervalLabel(value);
    const explicit = firstString(record, [
        'intervalLabel',
        'nextReviewLabel',
        'nextIntervalLabel',
        'nextReviewInterval',
        'nextInterval',
        'interval',
        'duration',
        'time',
        'label',
        'text',
    ]);
    if (explicit) return normalizeIntervalLabel(explicit);
    return jitenReviewIntervalNumberLabel(record) ?? '';
}

function jitenReviewIntervalNumberLabel(record: Record<string, unknown> | null): string | null {
    if (!record) return null;
    for (const [key, unit] of JITEN_REVIEW_INTERVAL_NUMERIC_KEYS) {
        const value = finiteJitenNumber(record[key]);
        if (value !== undefined) return formatJitenInterval(value, unit);
    }
    return null;
}

function jitenReviewRatingMetaFromRecord(record: Record<string, unknown>): JitenReviewRatingMeta | undefined {
    const rating = finiteJitenInteger(record.rating)
        ?? finiteJitenInteger(record.ease)
        ?? finiteJitenInteger(record.button)
        ?? finiteJitenInteger(record.value);
    if (rating !== undefined) return JITEN_REVIEW_RATINGS.find(meta => meta.rating === rating);
    const label = firstString(record, ['grade', 'key', 'id', 'name', 'buttonLabel', 'gradeLabel', 'ratingLabel']);
    return label ? JITEN_REVIEW_RATINGS.find(meta => meta.keys.includes(normalizeJitenReviewKey(label))) : undefined;
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
    if (!record) return null;
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function normalizeIntervalLabel(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function prefixedReviewIntervalLabel(buttonLabel: string, intervalLabel: string): string {
    return intervalLabel.toLocaleLowerCase().startsWith(buttonLabel.toLocaleLowerCase())
        ? intervalLabel
        : `${buttonLabel} ${intervalLabel}`;
}

function normalizeJitenReviewKey(value: string): string {
    return value.replace(/[_\s-]+/g, '').toLocaleLowerCase();
}

function formatJitenInterval(value: number, unit: JitenReviewIntervalUnit): string {
    if (unit === 'seconds') return formatJitenSeconds(value);
    if (unit === 'minutes') return `${formatJitenIntervalNumber(value)}m`;
    if (unit === 'hours') return `${formatJitenIntervalNumber(value)}h`;
    if (unit === 'days') return `${formatJitenIntervalNumber(value)}d`;
    if (unit === 'months') return `${formatJitenIntervalNumber(value)}mo`;
    return `${formatJitenIntervalNumber(value)}y`;
}

function formatJitenSeconds(seconds: number): string {
    if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${formatJitenIntervalNumber(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${formatJitenIntervalNumber(hours)}h`;
    const days = hours / 24;
    if (days < 365) return `${formatJitenIntervalNumber(days)}d`;
    return `${formatJitenIntervalNumber(days / 365)}y`;
}

function formatJitenIntervalNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

type JitenReviewIntervalUnit = 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years';

interface JitenReviewRatingMeta {
    rating: number;
    buttonLabel: string;
    grades: JPDBGrade[];
    keys: string[];
}

const JITEN_REVIEW_INTERVAL_KEYS = [
    'reviewButtons',
    'reviewGradeIntervals',
    'nextReviewIntervals',
    'nextIntervals',
    'nextReviews',
    'reviewIntervals',
    'srsIntervals',
    'ratingIntervals',
];

const JITEN_REVIEW_RATINGS: JitenReviewRatingMeta[] = [
    { rating: 1, buttonLabel: 'Again', grades: ['nothing', 'fail'], keys: ['1', 'rating1', 'again', 'nothing', 'fail'] },
    { rating: 2, buttonLabel: 'Hard', grades: ['something', 'hard'], keys: ['2', 'rating2', 'hard', 'something'] },
    { rating: 3, buttonLabel: 'Good', grades: ['okay', 'pass'], keys: ['3', 'rating3', 'good', 'okay', 'pass'] },
    { rating: 4, buttonLabel: 'Easy', grades: ['easy'], keys: ['4', 'rating4', 'easy'] },
];

const JITEN_REVIEW_INTERVAL_NUMERIC_KEYS: Array<[string, JitenReviewIntervalUnit]> = [
    ['intervalSeconds', 'seconds'],
    ['nextIntervalSeconds', 'seconds'],
    ['nextReviewSeconds', 'seconds'],
    ['intervalMinutes', 'minutes'],
    ['nextIntervalMinutes', 'minutes'],
    ['nextReviewMinutes', 'minutes'],
    ['intervalHours', 'hours'],
    ['nextIntervalHours', 'hours'],
    ['nextReviewHours', 'hours'],
    ['intervalDays', 'days'],
    ['nextIntervalDays', 'days'],
    ['nextReviewDays', 'days'],
    ['intervalMonths', 'months'],
    ['nextIntervalMonths', 'months'],
    ['nextReviewMonths', 'months'],
    ['intervalYears', 'years'],
    ['nextIntervalYears', 'years'],
    ['nextReviewYears', 'years'],
];

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

function finiteJitenNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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
