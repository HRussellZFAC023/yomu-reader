import { afterEach, describe, expect, it, vi } from 'vitest';
import { JITEN_API_BASE_URL, JitenApiClient, JitenApiError, jitenCardReference, jitenRatingForGrade, validateJitenApiKey } from '../../src/reader/jiten';
import type { JPDBCard } from '../../src/reader/types';

function jsonResponse(payload: unknown, status = 200): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => JSON.stringify(payload),
    } as Response;
}

function createFetchMock(payload: unknown, status = 200) {
    return vi.fn(async () => jsonResponse(payload, status));
}

afterEach(() => {
    vi.clearAllMocks();
});

describe('JitenApiClient', () => {
    it('routes requests through the Yomu HTTP helper when no fetch override is supplied', async () => {
        const requestMock = vi.fn(async () => ({ success: true }));
        const client = new JitenApiClient(() => 'jiten-token', {
            requestImpl: requestMock,
            proxyUrl: () => 'https://proxy.example.test',
        });

        await expect(client.ping()).resolves.toBe(true);

        expect(requestMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/reader/ping`, expect.objectContaining({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'ApiKey jiten-token',
                Accept: 'application/json',
            },
            data: undefined,
            responseType: 'json',
            proxyUrl: 'https://proxy.example.test',
            allowDirectCrossOrigin: true,
            allowConfiguredProxy: true,
            preferFetch: true,
        }));
    });

    it('pings Jiten with the API key auth convention', async () => {
        const fetchMock = createFetchMock({ success: true });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.ping()).resolves.toBe(true);

        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/reader/ping`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'ApiKey jiten-token',
                Accept: 'application/json',
            },
            body: undefined,
            signal: expect.any(AbortSignal) as AbortSignal,
        });
    });

    it('lists reader study decks from the SRS reader endpoint', async () => {
        const fetchMock = createFetchMock([
            { userStudyDeckId: 10, name: 'Mining' },
            { userStudyDeckId: 11, name: 'Reading backlog' },
        ]);
        const client = new JitenApiClient(() => 'jiten-token', {
            baseUrl: 'https://example.test/api/',
            fetchImpl: fetchMock,
        });

        await expect(client.listReaderStudyDecks()).resolves.toEqual([
            { userStudyDeckId: 10, name: 'Mining' },
            { userStudyDeckId: 11, name: 'Reading backlog' },
        ]);
        expect(fetchMock).toHaveBeenCalledWith('https://example.test/api/srs/reader-study-decks', expect.any(Object));
    });

    it('loads Jiten SRS study-batch cards for new-tab reviews', async () => {
        const fetchMock = createFetchMock({
            sessionId: 'session-1',
            cards: [{
                cardId: 9001,
                wordId: 42,
                readingIndex: 2,
                state: 2,
                isNewCard: false,
                wordText: '日本語[にほんご]',
                wordTextPlain: '日本語',
                readings: [{ text: 'にほんご', rubyText: '日本語[にほんご]', readingIndex: 2, formType: 0 }],
                definitions: [{ index: 0, meanings: ['Japanese language'], partsOfSpeech: ['n'] }],
                partsOfSpeech: ['n'],
                pitchAccents: [0],
                frequencyRank: 123,
                exampleSentence: { text: '日本語を読む。' },
                reviewButtons: [
                    { rating: 1, nextInterval: '1m' },
                    { rating: 2, nextInterval: '5m' },
                    { rating: 3, nextInterval: '10m' },
                    { rating: 4, nextInterval: '4.1y' },
                ],
            }],
            newCardsRemaining: 3,
            reviewsRemaining: 4,
            newCardsToday: 1,
            reviewsToday: 2,
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.listStudyBatchCards(2)).resolves.toEqual([expect.objectContaining({
            vid: 42,
            sid: 2,
            rid: 9001,
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
            spelling: '日本語',
            reading: 'にほんご',
            frequencyRank: 123,
            cardState: ['due'],
            meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
            sentence: '日本語を読む。',
            wordWithReading: '日本語[にほんご]',
            reviewGradeIntervals: {
                nothing: { buttonLabel: 'Again', intervalLabel: '1m', label: 'Again 1m', source: 'jiten-study-batch' },
                fail: { buttonLabel: 'Again', intervalLabel: '1m', label: 'Again 1m', source: 'jiten-study-batch' },
                something: { buttonLabel: 'Hard', intervalLabel: '5m', label: 'Hard 5m', source: 'jiten-study-batch' },
                hard: { buttonLabel: 'Hard', intervalLabel: '5m', label: 'Hard 5m', source: 'jiten-study-batch' },
                okay: { buttonLabel: 'Good', intervalLabel: '10m', label: 'Good 10m', source: 'jiten-study-batch' },
                pass: { buttonLabel: 'Good', intervalLabel: '10m', label: 'Good 10m', source: 'jiten-study-batch' },
                easy: { buttonLabel: 'Easy', intervalLabel: '4.1y', label: 'Easy 4.1y', source: 'jiten-study-batch' },
            },
        })]);
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/srs/study-batch?limit=2`, expect.objectContaining({
            method: 'GET',
            body: undefined,
        }));
    });

    it('parses Jiten reader output into Yomu token cards', async () => {
        const fetchMock = createFetchMock({
            vocabulary: [{
                wordId: 42,
                readingIndex: 2,
                spelling: '日本語',
                reading: '日本語[にほんご]',
                frequencyRank: 123,
                partsOfSpeech: ['n'],
                meaningsChunks: [['Japanese language']],
                meaningsPartOfSpeech: ['n', 'adj-no'],
                knownState: [4],
                pitchAccents: [0],
            }],
            tokens: [[{
                wordId: 42,
                readingIndex: 2,
                start: 2,
                end: 5,
                length: 3,
            }]],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const parsed = await client.parse(['私は日本語を読む。']);
        const token = parsed[0]?.[0];

        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/reader/parse`, expect.objectContaining({
            body: JSON.stringify({ text: ['私は日本語を読む。'] }),
        }));
        expect(token).toMatchObject({
            start: 2,
            end: 5,
            length: 3,
            sentence: '私は日本語を読む。',
            pitchClass: 'heiban',
            rubies: [{ text: 'にほんご', start: 2, end: 5, length: 3 }],
            card: {
                vid: 42,
                sid: 2,
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 42,
                jitenReadingIndex: 2,
                spelling: '日本語',
                reading: 'にほんご',
                frequencyRank: 123,
                partOfSpeech: ['n'],
                cardState: ['due'],
                meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n', 'adj-no'] }],
                wordWithReading: '日本語[にほんご]',
            },
        });
    });

    it('maps the Jiten known-state enum to Yomu card states', async () => {
        const fetchMock = createFetchMock({
            vocabulary: [
                jitenVocabulary({ wordId: 1, readingIndex: 0, knownState: [] }),
                jitenVocabulary({ wordId: 2, readingIndex: 0, knownState: [0] }),
                jitenVocabulary({ wordId: 3, readingIndex: 0, knownState: [1] }),
                jitenVocabulary({ wordId: 4, readingIndex: 0, knownState: [2] }),
                jitenVocabulary({ wordId: 5, readingIndex: 0, knownState: [3] }),
                jitenVocabulary({ wordId: 6, readingIndex: 0, knownState: [4] }),
                jitenVocabulary({ wordId: 7, readingIndex: 0, knownState: [5] }),
                jitenVocabulary({ wordId: 8, readingIndex: 0, knownState: [6] }),
                jitenVocabulary({ wordId: 9, readingIndex: 0, knownState: [4, 2] }),
            ],
            tokens: [[
                { wordId: 1, readingIndex: 0, start: 0, end: 2, length: 2 },
                { wordId: 2, readingIndex: 0, start: 3, end: 5, length: 2 },
                { wordId: 3, readingIndex: 0, start: 6, end: 8, length: 2 },
                { wordId: 4, readingIndex: 0, start: 9, end: 11, length: 2 },
                { wordId: 5, readingIndex: 0, start: 12, end: 14, length: 2 },
                { wordId: 6, readingIndex: 0, start: 15, end: 17, length: 2 },
                { wordId: 7, readingIndex: 0, start: 18, end: 20, length: 2 },
                { wordId: 8, readingIndex: 0, start: 21, end: 23, length: 2 },
                { wordId: 9, readingIndex: 0, start: 24, end: 26, length: 2 },
            ]],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const states = (await client.parse(['読む 書く 見る 待つ 消す 学ぶ 知る 外す 返す']))[0]?.map(token => token.card.cardState);

        expect(states).toEqual([
            ['known'],
            ['new'],
            ['learning'],
            ['known'],
            ['blacklisted'],
            ['due'],
            ['never-forget'],
            ['redundant'],
            ['due', 'known'],
        ]);
    });

    it('returns false when validating a rejected or missing API key', async () => {
        const rejectedFetch = createFetchMock({ error_message: 'Unauthorized' }, 401);
        const rejectedClient = new JitenApiClient(() => 'bad-token', { fetchImpl: rejectedFetch });
        const missingClient = new JitenApiClient(() => ' ', { fetchImpl: createFetchMock({ success: true }) });

        await expect(rejectedClient.validateApiKey()).resolves.toBe(false);
        await expect(missingClient.validateApiKey()).resolves.toBe(false);
    });

    it('throws on invalid reader study deck responses', async () => {
        const client = new JitenApiClient(() => 'jiten-token', {
            fetchImpl: createFetchMock([{ userStudyDeckId: '10', name: 'Mining' }]),
        });

        await expect(client.listReaderStudyDecks()).rejects.toThrow(JitenApiError);
    });

    it('validates an explicit key with the standalone helper', async () => {
        const fetchMock = createFetchMock({ success: true });

        await expect(validateJitenApiKey('explicit-token', { fetchImpl: fetchMock })).resolves.toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/reader/ping`, expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'ApiKey explicit-token' }) as Record<string, string>,
        }));
    });

    it('mines Jiten-backed cards to native study decks', async () => {
        const fetchMock = createFetchMock({ success: true });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });
        const card = jitenCard({ jitenWordId: 42, jitenReadingIndex: 2 });

        await client.addToStudyDeck('12', card, '本を読みます。', 'Yomu');

        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/srs/study-decks/12/words`, expect.objectContaining({
            body: JSON.stringify({
                wordId: 42,
                readingIndex: 2,
                occurrences: 1,
                sentence: '本を読みます。',
                source: 'Yomu',
            }),
        }));
    });

    it('reviews and toggles Jiten vocabulary state with the Jiten rating/state conventions', async () => {
        const fetchMock = createFetchMock({ success: true });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });
        const card = jitenCard({ source: 'jiten', vid: 42, sid: 2 });

        await client.reviewCard(card, 'hard');
        await client.setVocabularyState(card, 'neverForget', 'add');

        expect(fetchMock).toHaveBeenNthCalledWith(1, `${JITEN_API_BASE_URL}/srs/review`, expect.objectContaining({
            body: JSON.stringify({ wordId: 42, readingIndex: 2, rating: 2 }),
        }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, `${JITEN_API_BASE_URL}/srs/set-vocabulary-state`, expect.objectContaining({
            body: JSON.stringify({ wordId: 42, readingIndex: 2, state: 'neverForget-add' }),
        }));
    });

    it('normalizes Yomu review grades to Jiten FSRS ratings', () => {
        expect(jitenRatingForGrade('nothing')).toBe(1);
        expect(jitenRatingForGrade('fail')).toBe(1);
        expect(jitenRatingForGrade('something')).toBe(2);
        expect(jitenRatingForGrade('hard')).toBe(2);
        expect(jitenRatingForGrade('okay')).toBe(3);
        expect(jitenRatingForGrade('pass')).toBe(3);
        expect(jitenRatingForGrade('easy')).toBe(4);
    });

    it('requires an explicit Jiten card reference', () => {
        expect(jitenCardReference(jitenCard({ jitenWordId: 42, jitenReadingIndex: 0 }))).toEqual({ wordId: 42, readingIndex: 0 });
        expect(jitenCardReference(jitenCard({ source: 'jiten', vid: 99, sid: 1 }))).toEqual({ wordId: 99, readingIndex: 1 });
        expect(() => jitenCardReference(jitenCard({ source: 'jpdb', vid: 99, sid: 1 }))).toThrow(JitenApiError);
    });
});

function jitenVocabulary(overrides: Record<string, unknown> = {}) {
    return {
        wordId: 1,
        readingIndex: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 100,
        partsOfSpeech: ['v5m'],
        meaningsChunks: [['to read']],
        meaningsPartOfSpeech: [['v5m']],
        knownState: [0],
        pitchAccents: [1],
        ...overrides,
    };
}

function jitenCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 0,
        sid: 0,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['new'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        ...overrides,
    };
}
