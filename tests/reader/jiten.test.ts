import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJitenStudyBatchCard } from '../../scripts/fixtures/jiten-fixtures.mjs';
import { JITEN_API_BASE_URL, JitenApiClient, JitenApiError, jitenCardReference, jitenRatingForGrade, validateJitenApiKey } from '../../src/reader/dictionaries/jiten';
import { renderTokensToHtml } from '../../src/reader/dom/index';
import { renderJitenDefinitionSource } from '../../src/reader/jiten/jiten-definition-source-render';
import { jitenKanjiFactRows, jitenKanjiOriginFactLabels, jitenKanjiVocabulary, renderJitenKanjiInfo } from '../../src/reader/jiten/jiten-kanji-info-render';
import { renderKanjiOrigins } from '../../src/reader/popup/kanji-origin';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { CardState, JPDBCard } from '../../src/reader/app/types';
import type { JitenKanjiInfo, JitenVocabularyInfo } from '../../src/reader/dictionaries/jiten';

const POPOVER_CORE_CSS = readFileSync('src/reader/styles/popover-core.css', 'utf8');

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
            allowDirectCrossOrigin: false,
            allowConfiguredProxy: true,
            allowSensitiveConfiguredProxy: true,
            allowPublicProxies: false,
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

    it('labels only authenticated 401/403 responses as rejected Jiten keys', async () => {
        const rejectedRequest = vi.fn(async () => {
            throw new Error('Jiten request failed (401).');
        });
        const rejectedClient = new JitenApiClient(() => 'jiten-token', { requestImpl: rejectedRequest });

        await expect(rejectedClient.parse(['読む'])).rejects.toMatchObject({
            message: 'Jiten rejected the API key.',
            status: 401,
        });

        const publicFailureRequest = vi.fn(async () => {
            throw new Error('Jiten request failed (403).');
        });
        const publicClient = new JitenApiClient(() => 'jiten-token', { requestImpl: publicFailureRequest });

        await expect(publicClient.lookupKanji('復')).rejects.toMatchObject({
            message: 'Jiten request failed (403).',
            status: 403,
        });
    });

    it('keeps transient authenticated Jiten failures neutral', async () => {
        const rateLimitedRequest = vi.fn(async () => {
            throw new Error('Jiten request failed (429).');
        });
        const rateLimitedClient = new JitenApiClient(() => 'jiten-token', { requestImpl: rateLimitedRequest });

        await expect(rateLimitedClient.parse(['読む'])).rejects.toMatchObject({
            message: 'Jiten request failed (429).',
            status: 429,
        });

        const serverFailureRequest = vi.fn(async () => {
            throw new Error('Jiten request failed (503).');
        });
        const serverFailureClient = new JitenApiClient(() => 'jiten-token', { requestImpl: serverFailureRequest });

        await expect(serverFailureClient.parse(['読む'])).rejects.toMatchObject({
            message: 'Jiten request failed (503).',
            status: 503,
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

    it('loads paginated Jiten review history for the My Cards history sort', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/srs/review-history?offset=0&limit=2')) {
                return jsonResponse({
                    data: [{
                        wordId: 42,
                        readingIndex: 2,
                        wordText: '困[こま]る',
                        rating: 4,
                        reviewDateTime: '2026-06-24T17:04:00Z',
                        reviewDuration: 12000,
                        cardState: 2,
                    }],
                    totalItems: 2,
                    pageSize: 1,
                    currentOffset: 0,
                });
            }
            return jsonResponse({
                data: [{
                    wordId: 43,
                    readingIndex: 0,
                    wordText: '図鑑',
                    rating: 1,
                    reviewDateTime: '2026-06-24T17:03:00Z',
                    cardState: 3,
                }],
                totalItems: 2,
                pageSize: 1,
                currentOffset: 1,
            });
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.listRecentReviews(2)).resolves.toEqual([
            expect.objectContaining({ wordId: 42, readingIndex: 2, reviewedAt: Date.parse('2026-06-24T17:04:00Z') }),
            expect.objectContaining({ wordId: 43, readingIndex: 0, reviewedAt: Date.parse('2026-06-24T17:03:00Z') }),
        ]);
        expect(fetchMock).toHaveBeenNthCalledWith(1, `${JITEN_API_BASE_URL}/srs/review-history?offset=0&limit=2`, expect.any(Object));
        expect(fetchMock).toHaveBeenNthCalledWith(2, `${JITEN_API_BASE_URL}/srs/review-history?offset=1&limit=1`, expect.any(Object));
    });

    it('loads Jiten SRS study-batch cards for new-tab reviews', async () => {
        const fetchMock = createFetchMock({
            sessionId: 'session-1',
            cards: [createJitenStudyBatchCard({
                reviewButtons: [
                    { rating: 1, nextInterval: '1m' },
                    { rating: 2, nextInterval: '5m' },
                    { rating: 3, nextInterval: '10m' },
                    { rating: 4, nextInterval: '4.1y' },
                ],
            })],
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

    it('loads paginated Jiten study deck vocabulary for new-tab browse filters', async () => {
        const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            const href = String(url);
            if (href.endsWith('/srs/study-decks/7/vocabulary?offset=0')) {
                return jsonResponse({
                    data: [{
                        wordId: 101,
                        mainReading: { text: '日本語[にほんご]', readingIndex: 2, frequencyRank: 123 },
                        partsOfSpeech: ['n'],
                        definitions: [{ meanings: ['Japanese language'], partsOfSpeech: ['n'] }],
                        pitchAccents: [0],
                        knownStates: [4],
                    }],
                    totalItems: 2,
                    pageSize: 1,
                    currentOffset: 0,
                });
            }
            if (href.endsWith('/srs/study-decks/7/vocabulary?offset=1')) {
                return jsonResponse({
                    data: [{
                        wordId: 102,
                        mainReading: { text: '仮名[かな]', readingIndex: 0, frequencyRank: 0 },
                        definitions: [{ meanings: ['kana'] }],
                        knownStates: [1],
                    }],
                    totalItems: 2,
                    pageSize: 1,
                    currentOffset: 1,
                });
            }
            throw new Error(`Unexpected Jiten vocabulary URL: ${href}`);
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.listStudyDeckVocabularyCards(7, 5)).resolves.toEqual([
            expect.objectContaining({
                vid: 101,
                sid: 2,
                spelling: '日本語',
                reading: 'にほんご',
                frequencyRank: 123,
                cardState: ['due'],
                meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 101,
                jitenReadingIndex: 2,
            }),
            expect.objectContaining({
                vid: 102,
                sid: 0,
                spelling: '仮名',
                reading: 'かな',
                frequencyRank: null,
                cardState: ['young'],
                meanings: [{ glosses: ['kana'], partOfSpeech: [] }],
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 102,
                jitenReadingIndex: 0,
            }),
        ]);
        expect(fetchMock).toHaveBeenNthCalledWith(1, `${JITEN_API_BASE_URL}/srs/study-decks/7/vocabulary?offset=0`, expect.any(Object));
        expect(fetchMock).toHaveBeenNthCalledWith(2, `${JITEN_API_BASE_URL}/srs/study-decks/7/vocabulary?offset=1`, expect.any(Object));
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

    it('normalizes Jiten byte offsets before rendering multi-kanji reader tokens', async () => {
        const fetchMock = createFetchMock({
            vocabulary: [
                {
                    wordId: 42,
                    readingIndex: 0,
                    spelling: '検索',
                    reading: '検索[けんさく]',
                    partsOfSpeech: ['n', 'vs'],
                    meaningsChunks: [['search']],
                    knownState: [1],
                    pitchAccents: [0],
                },
                {
                    wordId: 43,
                    readingIndex: 0,
                    spelling: '訓読み',
                    reading: '訓読[くんよ]み',
                    partsOfSpeech: ['n'],
                    meaningsChunks: [['kun reading']],
                    knownState: [2],
                    pitchAccents: [0],
                },
            ],
            tokens: [
                [{ wordId: 42, readingIndex: 0, start: 0, end: 6, length: 6 }],
                [{ wordId: 43, readingIndex: 0, start: 9, end: 18, length: 9 }],
            ],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const parsed = await client.parse(['検索する。', '今日は訓読みを学ぶ。']);
        const [searchToken] = parsed[0] ?? [];
        const [kunReadingToken] = parsed[1] ?? [];

        expect(searchToken).toMatchObject({
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'けんさく', start: 0, end: 2, length: 2 }],
        });
        expect(kunReadingToken).toMatchObject({
            start: 3,
            end: 6,
            length: 3,
            rubies: [{ text: 'くんよ', start: 3, end: 5, length: 2 }],
        });

        document.body.innerHTML = renderTokensToHtml('検索する。', parsed[0] ?? [], {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            furiganaMode: 'all',
        });
        const word = document.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.dataset.expression).toBe('検索');
        expect(word.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('検索');
        expect(word.nextSibling?.textContent).toBe('する。');
    });

    it('refreshes a card state from a self-parse after reviews (JPDB refreshCard parity)', async () => {
        const fetchMock = createFetchMock({
            vocabulary: [{
                wordId: 42,
                readingIndex: 2,
                spelling: '日本語',
                reading: '日本語[にほんご]',
                partsOfSpeech: ['n'],
                meaningsChunks: [['Japanese language']],
                meaningsPartOfSpeech: ['n'],
                knownState: [4],
                pitchAccents: [0],
            }],
            tokens: [[{ wordId: 42, readingIndex: 2, start: 0, end: 3, length: 3 }]],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });
        const card = {
            vid: 42,
            sid: 2,
            rid: 0,
            spelling: '日本語',
            reading: 'にほんご',
            frequencyRank: null,
            partOfSpeech: ['n'],
            meanings: [],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten' as const,
            jitenWordId: 42,
            jitenReadingIndex: 2,
        };

        await client.refreshCardState(card as never);

        expect(card.cardState).toEqual(['due']);
    });

    it('refreshes many card states in ONE batched reader/lookup-vocabulary request', async () => {
        // Jiten known-state enum → Yomu card state: 2 = mature, 4 = due.
        const fetchMock = createFetchMock({ result: [[2], [4]] });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });
        const makeCard = (wordId: number, readingIndex: number) => ({
            vid: wordId,
            sid: readingIndex,
            rid: 0,
            spelling: '',
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten' as const,
            jitenWordId: wordId,
            jitenReadingIndex: readingIndex,
        });
        const cards = [makeCard(11, 0), makeCard(22, 1)];

        const count = await client.refreshCardStates(cards as never);

        // The whole batch costs a single request — not one parse per card.
        expect(count).toBe(2);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/reader/lookup-vocabulary`, expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ words: [[11, 0], [22, 1]] }),
        }));
        expect(cards[0].cardState).toEqual(['mature']);
        expect(cards[1].cardState).toEqual(['due']);
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
                jitenVocabulary({ wordId: 10, readingIndex: 0, knownState: [7] }),
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
                { wordId: 10, readingIndex: 0, start: 27, end: 29, length: 2 },
            ]],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const states = (await client.parse(['読む 書く 見る 待つ 消す 学ぶ 知る 外す 返す 掘る']))[0]?.map(token => token.card.cardState);

        expect(states).toEqual([
            // empty knownState = Jiten does not track the word — NOT mature:
            // the old default suppressed furigana via the known-hidden group.
            ['not-in-deck'],
            ['new'],
            ['young'],
            ['mature'],
            ['blacklisted'],
            ['due'],
            ['mastered'],
            ['redundant'],
            ['due', 'mature'],
            ['in-deck'],
        ]);
    });

    it('carries Jiten deck membership fields through reader parse tokens', async () => {
        const fetchMock = createFetchMock({
            vocabulary: [
                jitenVocabulary({
                    deckNames: ['Mining'],
                    studyDecks: [{ name: 'Yomu E2E Seed' }],
                    lookupDecks: [{ title: 'Drama backlog' }],
                }),
            ],
            tokens: [[
                { wordId: 1, readingIndex: 0, start: 0, end: 2, length: 2 },
            ]],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const tokens = await client.parse(['読む']);

        expect(tokens[0]?.[0]?.card.deckNames).toEqual(['Mining', 'Yomu E2E Seed', 'Drama backlog']);
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

    it('normalizes Jiten vocabulary info notes and audio urls without dropping examples', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/vocabulary/42/0/info')) {
                return jsonResponse({
                    wordId: 42,
                    mainReading: { text: '読む', readingIndex: 0 },
                    alternativeReadings: [{ text: '訓む', readingIndex: 1 }],
                    definitions: [{
                        index: 0,
                        meanings: ['to read (a kanji) with its native Japanese reading'],
                        partsOfSpeech: ['v5m'],
                        misc: ['also written as 訓む'],
                    }],
                    composedOf: [{
                        wordId: 7,
                        readingIndex: 0,
                        reading: '訓む',
                        readingFurigana: '訓[よ]む',
                        mainDefinition: 'to read',
                        audioUrl: 'https://audio.example.test/yomu.mp3',
                    }],
                });
            }
            return jsonResponse([{
                sentenceId: 99,
                text: '訓むこともある。',
                wordPosition: 0,
                wordLength: 2,
                audioUrls: ['https://audio.example.test/sentence.mp3'],
            }]);
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const info = await client.lookupVocabularyInfo(jitenCard({ jitenWordId: 42, jitenReadingIndex: 0 }));

        expect(info?.definitions[0]).toMatchObject({
            meanings: ['to read (a kanji) with its native Japanese reading'],
            misc: ['also written as 訓む'],
        });
        expect(info?.alternativeReadings[0]).toMatchObject({ text: '訓む', readingIndex: 1 });
        expect(info?.composedOf[0]?.audioUrls).toEqual(['https://audio.example.test/yomu.mp3']);
        expect(info?.examples[0]?.audioUrls).toEqual(['https://audio.example.test/sentence.mp3']);
        expect(fetchMock).toHaveBeenNthCalledWith(1, `${JITEN_API_BASE_URL}/vocabulary/42/0/info`, expect.objectContaining({ method: 'GET' }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, `${JITEN_API_BASE_URL}/vocabulary/42/0/random-example-sentences`, expect.objectContaining({ method: 'POST' }));
    });

    it('loads Jiten kanji facts with exact frequency and reading word groups', async () => {
        const fetchMock = createFetchMock({
            character: '青',
            onReadings: ['セイ'],
            kunReadings: ['あお'],
            meanings: ['blue', 'green'],
            strokeCount: 8,
            jlptLevel: 4,
            grade: 1,
            frequencyRank: 549,
            kanken: '8級',
            waniKaniLevel: 2,
            rtkFrame: 153,
            klc: 'KLC 21',
            tmwLevel: 'Lesson 3',
            topWords: [
                { wordId: 10, readingIndex: 0, reading: '青い', readingFurigana: '青[あお]い', mainDefinition: 'blue', frequencyRank: 700, matchSurface: '青い' },
            ],
            wordsByReading: [
                {
                    reading: 'あお',
                    totalWords: 12,
                    words: [
                        { wordId: 11, readingIndex: 0, reading: '青', readingFurigana: '青[あお]', mainDefinition: 'blue', frequencyRank: 549, matchSurface: '青' },
                    ],
                },
            ],
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const info = await client.lookupKanji('青');

        expect(info).toEqual(expect.objectContaining({
            character: '青',
            meanings: ['blue', 'green'],
            frequencyRank: 549,
            jlptLevel: 4,
            strokeCount: 8,
            groupingTags: {
                kanken: '8級',
                wanikani: '2',
                rtk: '153',
                klc: 'KLC 21',
                tmw: 'Lesson 3',
            },
            topWords: [expect.objectContaining({ wordId: 10, mainDefinition: 'blue' })],
            wordsByReading: [expect.objectContaining({ reading: 'あお', totalWords: 12 })],
        }));
        expect(jitenKanjiFactRows(info, 'en')).toEqual(expect.arrayContaining([
            ['Kanken', '8級'],
            ['WK', '2'],
            ['RTK', '153'],
            ['KLC', 'KLC 21'],
            ['TMW', 'Lesson 3'],
        ]));
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/kanji/%E9%9D%92`, expect.objectContaining({ method: 'GET' }));
    });

    it('loads paginated Jiten kanji word pages with optional reading filters', async () => {
        const fetchMock = createFetchMock({
            data: [
                { wordId: 21, readingIndex: 0, reading: '青空', readingFurigana: '青空[あおぞら]', mainDefinition: 'blue sky', frequencyRank: 1300, matchSurface: '青空' },
            ],
            totalItems: 17,
            pageSize: 9,
            currentOffset: 9,
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.lookupKanjiWords('青', { reading: 'あお', page: 2, pageSize: 9 })).resolves.toEqual({
            items: [expect.objectContaining({ wordId: 21, mainDefinition: 'blue sky' })],
            total: 17,
            pageSize: 9,
            offset: 9,
        });
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/kanji/%E9%9D%92/words?reading=%E3%81%82%E3%81%8A&page=2&pageSize=9`, expect.objectContaining({ method: 'GET' }));
    });

    it('renders Jiten kanji fact tags, reading chips, and real vocabulary pagination', () => {
        const words = Array.from({ length: 18 }, (_, index) => ({
            wordId: 100 + index,
            readingIndex: index,
            reading: `語${index}`,
            readingFurigana: `語[ご]${index}`,
            mainDefinition: `word ${index}`,
            frequencyRank: 600 + index,
            matchSurface: `語${index}`,
            knownStates: index === 0 ? ['due' as CardState] : [],
            pitchAccents: index === 0 ? [1] : [],
        }));
        const info: JitenKanjiInfo = {
            character: '語',
            onReadings: ['ゴ'],
            kunReadings: ['かた.る'],
            meanings: ['language', 'word'],
            strokeCount: 14,
            jlptLevel: 5,
            grade: 2,
            frequencyRank: 301,
            groupingTags: {
                kanken: '8級',
                wanikani: '3',
                rtk: '112',
                klc: 'KLC 44',
                tmw: 'Lesson 9',
            },
            topWords: words,
            wordsByReading: [
                { reading: 'ご', totalWords: 30, words: [] },
                { reading: 'かた', totalWords: 10, words: [] },
            ],
        };
        const mount = document.createElement('div');
        mount.innerHTML = renderJitenKanjiInfo(info, 'en', true, 'kanji-source:jiten', 'Jiten kanji facts');

        expect(mount.querySelector<HTMLDetailsElement>('[data-source="jiten-kanji"]')?.open).toBe(true);
        expect(mount.querySelector('.jpdb-reader-jiten-kanji')?.textContent).toContain('Jiten kanji facts');
        const facts = Array.from(mount.querySelectorAll<HTMLElement>('.jpdb-reader-kanji-facts > span'))
            .map(item => item.textContent?.trim() ?? '');
        expect(facts).toEqual(expect.arrayContaining([
            'Meaninglanguage, word',
            'FrequencyJiten #301',
            'JLPTJiten N5',
            'GradeJiten Grade 2',
            'strokesJiten 14',
            'Kanken8級',
            'WK3',
            'RTK112',
            'KLCKLC 44',
            'TMWLesson 9',
        ]));
        expect(facts).not.toEqual(expect.arrayContaining(['TypeJōyō kanji']));
        expect(mount.querySelector<HTMLElement>('.jpdb-reader-kanji-facts > span')?.title).toBe('Jiten · Meaning: language, word');
        expect(jitenKanjiVocabulary(info)).toEqual([]);

        const originHtml = renderKanjiOrigins([
            { label: 'JLPT', value: 'N4', source: 'KANJIDIC' },
            { label: 'Grade', value: 'Grade 2', source: 'KANJIDIC' },
            { label: 'Strokes', value: '14', source: 'KanjiVG' },
            { label: 'Frequency', value: 'Top 300', source: 'JPDB' },
            { label: 'Kanken', value: 'Level 9', source: 'JPDB' },
            { label: 'Type', value: 'Jōyō kanji', source: 'JPDB' },
        ], null, null, DEFAULT_SETTINGS, 'en', true, 'kanji-source:origin', jitenKanjiOriginFactLabels(info, 'en'));
        expect(originHtml).toContain('Type');
        expect(originHtml).toContain('Jōyō kanji');
        expect(originHtml).not.toContain('N4');
        expect(originHtml).not.toContain('Grade 2');
        expect(originHtml).not.toContain('Top 300');
        expect(originHtml).not.toContain('Level 9');

        const readingButtons = Array.from(mount.querySelectorAll<HTMLButtonElement>('.jpdb-reader-kanji-readings > button'));
        expect(readingButtons.map(button => button.dataset)).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'jiten-kanji-reading', jitenKanjiCharacter: '語', jitenKanjiReading: 'ご' }),
            expect.objectContaining({ action: 'jiten-kanji-reading', jitenKanjiCharacter: '語', jitenKanjiReading: 'かた' }),
        ]));
        expect(readingButtons.map(button => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual(expect.arrayContaining(['ご75%', 'かた25%']));
        expect(mount.textContent).not.toContain('On ゴ');
        expect(mount.textContent).not.toContain('Kun かた.る');
        expect(mount.querySelectorAll('.jpdb-reader-similar-word')).toHaveLength(9);
        expect(mount.querySelector<HTMLButtonElement>('.jpdb-reader-similar-word')?.dataset).toMatchObject({
            action: 'similar-word',
            expression: '語0',
            reading: 'ご0',
            jitenKanjiWordKey: '語0:ご0',
        });
        expect(mount.querySelector('.jpdb-reader-jiten-kanji-word-term')?.innerHTML).toContain('<ruby>');
        expect(mount.querySelector('.jpdb-reader-jiten-kanji-word-status')?.textContent).toContain('Due');
        expect(mount.querySelector('.jpdb-reader-jiten-kanji-word-pitch')?.textContent).toBe('P1');
        const more = mount.querySelector<HTMLButtonElement>('.jpdb-reader-jiten-kanji-more');
        expect(more).not.toBeNull();
        expect(more?.dataset).toMatchObject({
            action: 'jiten-kanji-more',
            jitenKanjiCharacter: '語',
            jitenKanjiPage: '2',
            jitenKanjiPageSize: '9',
            jitenKanjiTotal: '40',
        });
        expect(more?.textContent?.replace(/\s+/g, ' ').trim()).toBe('More 31');
    });

    it('deduplicates Jiten meanings and hides repeated card-level parts of speech', () => {
        const card = jitenCard({
            partOfSpeech: ["Godan verb with 'mu' ending", 'transitive verb'],
            meanings: [{ glosses: ['to read'], partOfSpeech: ["Godan verb with 'mu' ending", 'transitive verb'] }],
        });
        const info = jitenVocabularyInfo({
            definitions: [
                jitenDefinition({ meanings: ['to read', 'to recite'] }),
                jitenDefinition({ index: 1, meanings: ['to read'] }),
            ],
        });

        const html = renderJitenDefinitionSource(card, () => '', info, 'en');
        const mount = document.createElement('div');
        mount.innerHTML = html;

        expect(mount.textContent).not.toContain("Godan verb with 'mu' ending");
        expect(mount.textContent).not.toContain('transitive verb');
        expect(Array.from(mount.querySelectorAll('.jpdb-reader-jiten-meaning')).map(item => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['1 to read', '2 to recite']);
    });

    it('uses the configured Jiten source title', () => {
        const html = renderJitenDefinitionSource(jitenCard(), () => '', jitenVocabularyInfo(), 'en', 'Jiten Custom');
        const mount = document.createElement('div');
        mount.innerHTML = html;

        expect(mount.querySelector('summary')?.textContent?.trim()).toBe('Jiten Custom');
    });

    it('omits duplicate Jiten definition part-of-speech tag rows', () => {
        const card = jitenCard({
            partOfSpeech: ['noun'],
            meanings: [{ glosses: ['reading'], partOfSpeech: ['noun'] }],
        });
        const info = jitenVocabularyInfo({
            definitions: [
                jitenDefinition({ partsOfSpeech: ['Godan verb with mu ending'], meanings: ['to read'] }),
                jitenDefinition({ index: 1, partsOfSpeech: ['transitive verb'], meanings: ['to recite'] }),
            ],
        });

        const mount = document.createElement('div');
        mount.innerHTML = renderJitenDefinitionSource(card, () => '', info, 'en');

        expect(mount.querySelector('.jpdb-reader-jiten-pos-tags')).toBeNull();
        expect(mount.querySelector('.jpdb-reader-jiten-meaning .jpdb-reader-dict-tag')).toBeNull();
        expect(mount.textContent).not.toContain('Godan verb with mu ending');
        expect(mount.textContent).not.toContain('transitive verb');
        expect(Array.from(mount.querySelectorAll('.jpdb-reader-jiten-meaning')).map(item => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['1 to read', '2 to recite']);

        const normalizedCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).not.toContain('jpdb-reader-jiten-pos-tags');
    });

    it('formats Jiten definition notes with spacing and renders textual word references', () => {
        const card = jitenCard({ spelling: '読む', reading: 'よむ', jitenWordId: 42, jitenReadingIndex: 0 });
        const info = jitenVocabularyInfo({
            wordId: 42,
            mainReading: { text: '読む', readingIndex: 0, frequencyRank: 100, usedInMediaAmount: null },
            alternativeReadings: [{ text: '訓む', readingIndex: 1, frequencyRank: null, usedInMediaAmount: null }],
            definitions: [
                jitenDefinition({
                    meanings: [
                        'to count; to estimate',
                        'to read (a kanji) with its native Japanese reading',
                    ],
                    misc: [
                        'now mostly used in idioms',
                        'also written as 訓む',
                    ],
                }),
            ],
        });

        const mount = document.createElement('div');
        mount.innerHTML = renderJitenDefinitionSource(card, () => '', info, 'en');

        const meaningText = mount.textContent?.replace(/\s+/g, ' ') ?? '';
        expect(meaningText).toContain('to count; to estimate; now mostly used in idioms; also written as 訓む');
        expect(meaningText).toContain('to read (a kanji) with its native Japanese reading; now mostly used in idioms; also written as 訓む');
        expect(meaningText).not.toContain('estimatenow');
        expect(meaningText).not.toContain('readingalso');
        const reference = mount.querySelector<HTMLElement>('.jpdb-reader-jiten-meaning .jpdb-reader-word[data-expression="訓む"]');
        expect(reference).not.toBeNull();
        expect(reference?.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(reference?.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(reference?.dataset.dictionary).toBe('Jiten');
        expect(reference?.dataset.reading).toBe('よむ');
        expect(reference?.innerHTML).toContain('<ruby>');
    });

    it('drops JMdict orthography-form notes (e.g. "uk") from Jiten meanings', () => {
        const card = jitenCard({ spelling: '全て', reading: 'すべて', jitenWordId: 7, jitenReadingIndex: 0 });
        const info = jitenVocabularyInfo({
            wordId: 7,
            mainReading: { text: '全て', readingIndex: 0, frequencyRank: 100, usedInMediaAmount: null },
            definitions: [
                jitenDefinition({
                    meanings: ['everything', 'all', 'the whole'],
                    misc: ['uk'],
                }),
            ],
        });

        const mount = document.createElement('div');
        mount.innerHTML = renderJitenDefinitionSource(card, () => '', info, 'en');

        const meaningText = mount.textContent?.replace(/\s+/g, ' ') ?? '';
        expect(meaningText).toContain('everything');
        expect(meaningText).toContain('the whole');
        expect(meaningText).not.toContain('uk');
        expect(meaningText).not.toContain('; uk');
    });

    it('renders Jiten example, composite, and used-in audio affordances', () => {
        const info = jitenVocabularyInfo({
            composedOf: [{
                wordId: 7,
                readingIndex: 0,
                reading: '訓む',
                readingFurigana: '訓[よ]む',
                mainDefinition: 'to read',
                frequencyRank: 5000,
                matchSurface: '訓む',
                audioUrls: ['https://audio.example.test/word.mp3'],
            }],
            usedIn: [{
                wordId: 8,
                readingIndex: 1,
                reading: '訓読み',
                readingFurigana: '訓読[くんよ]み',
                mainDefinition: 'kun reading',
                frequencyRank: null,
                matchSurface: '訓',
            }],
            usedInTotal: 1,
            examples: [{
                sentenceId: 99,
                text: '今日は訓むこともある。',
                wordPosition: 9,
                wordLength: 6,
                difficulty: null,
                sourceTitle: 'Jiten examples',
                audioUrls: ['https://audio.example.test/sentence.mp3'],
            }],
        });

        const mount = document.createElement('div');
        mount.innerHTML = renderJitenDefinitionSource(jitenCard(), () => '', info, 'en');

        const buttons = Array.from(mount.querySelectorAll<HTMLButtonElement>('.jpdb-reader-jiten-audio'));
        expect(buttons).toHaveLength(3);
        expect(buttons.map(button => button.dataset.action)).toEqual(['jiten-audio', 'jiten-audio', 'jiten-audio']);
        expect(buttons.map(button => button.dataset.studySentence)).toEqual(['訓む', '訓読み', '今日は訓むこともある。']);
        expect(buttons[0]?.dataset.jitenWordId).toBe('7');
        expect(buttons[0]?.dataset.jitenReadingIndex).toBe('0');
        expect(buttons[0]?.dataset.jitenAudioUrls).toBe(JSON.stringify(['https://audio.example.test/word.mp3']));
        expect(buttons[2]?.dataset.jitenSentenceId).toBe('99');
        expect(buttons[2]?.dataset.jitenAudioUrls).toBe(JSON.stringify(['https://audio.example.test/sentence.mp3']));
        expect(buttons[2]?.classList.contains('jpdb-reader-jpdb-example-audio')).toBe(true);
        expect(buttons[2]?.getAttribute('aria-label')).toBe('Play audio');

        const relatedRow = mount.querySelector<HTMLElement>('.jpdb-reader-jiten-related-row');
        expect(relatedRow?.classList.contains('jpdb-reader-jpdb-used-in-row')).toBe(true);
        expect(relatedRow?.classList.contains('has-audio')).toBe(true);
        const relatedLink = relatedRow?.querySelector<HTMLAnchorElement>('.jpdb-reader-jiten-related-link');
        expect(relatedLink?.dataset.dictionaryLookup).toBe('訓む');
        expect(relatedLink?.dataset.dictionaryReading).toBe('よむ');
        expect(relatedLink?.dataset.dictionary).toBe('Jiten');
        const relatedHead = relatedLink?.querySelector<HTMLElement>('.jpdb-reader-jiten-related-head');
        expect(relatedHead?.innerHTML).toContain('<ruby>');
        const relatedWord = relatedHead?.querySelector<HTMLElement>('.jpdb-reader-word.jpdb-reader-passive-word');
        expect(relatedWord).not.toBeNull();
        expect(relatedWord?.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(relatedWord?.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(relatedWord?.dataset.dictionary).toBe('Jiten');
        expect(relatedWord?.dataset.vid).toBe('7');
        expect(relatedWord?.dataset.sid).toBe('0');
        expect(relatedWord?.dataset.expression).toBe('訓む');
        expect(relatedWord?.dataset.reading).toBe('よむ');

        const relatedRows = Array.from(mount.querySelectorAll<HTMLElement>('.jpdb-reader-jiten-related-row'));
        const usedInRow = relatedRows[1];
        const usedInLink = usedInRow?.querySelector<HTMLAnchorElement>('.jpdb-reader-jiten-related-link');
        const usedInWord = usedInRow?.querySelector<HTMLElement>('.jpdb-reader-word.jpdb-reader-passive-word');
        expect(usedInLink?.dataset.dictionaryLookup).toBe('訓読み');
        expect(usedInLink?.dataset.dictionaryReading).toBe('くんよみ');
        expect(usedInWord?.dataset.expression).toBe('訓読み');
        expect(usedInWord?.dataset.reading).toBe('くんよみ');
        // Ruby is distributed from the annotated reading (訓読[くんよ]み): the
        // kanji run carries the ruby and the okurigana み stays as base text,
        // instead of one rt sitting over the whole word.
        expect(usedInWord?.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('訓読');
        expect(usedInWord?.querySelector('rt')?.textContent).toBe('くんよ');
        expect(usedInWord?.querySelectorAll('rt').length).toBe(1);
        expect(usedInWord?.textContent?.replace(/\s+/g, '')).toContain('み');

        const exampleRow = mount.querySelector<HTMLElement>('.jpdb-reader-jiten-example-row.has-audio');
        expect(exampleRow).not.toBeNull();
        const target = exampleRow?.querySelector<HTMLElement>('.jpdb-reader-jiten-example-target');
        expect(target?.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(target?.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(target?.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(target?.dataset.dictionary).toBe('Jiten');
        expect(target?.dataset.vid).toBe('7');
        expect(target?.dataset.sid).toBe('0');
        expect(target?.dataset.expression).toBe('訓む');
        expect(target?.dataset.reading).toBe('よむ');
        expect(target?.dataset.sentence).toBe('今日は訓むこともある。');
        expect(target?.innerHTML).toContain('<ruby>');
        expect(target?.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('訓む');
        const sentence = exampleRow?.querySelector<HTMLElement>('.jpdb-reader-jiten-example-sentence');
        expect(sentence?.innerHTML).toContain('今日は');
        expect(sentence?.innerHTML).toContain('こともある。');
    });

    it('marks long Jiten related words with horizontal wrapping and neutral decoration hooks', () => {
        const longWord = '超長複合語彙連接表現';
        const info = jitenVocabularyInfo({
            usedIn: [{
                wordId: 108,
                readingIndex: 0,
                reading: longWord,
                readingFurigana: `${longWord}[ちょうちょうふくごうごいれんせつひょうげん]`,
                mainDefinition: 'very long compound vocabulary expression used as a layout stress case',
                frequencyRank: 12345,
                matchSurface: longWord,
            }],
            usedInTotal: 1,
        });

        const mount = document.createElement('div');
        mount.innerHTML = renderJitenDefinitionSource(jitenCard(), () => '', info, 'en');

        const row = mount.querySelector<HTMLElement>('.jpdb-reader-jiten-related-row');
        expect(row).not.toBeNull();
        expect(row?.classList.contains('jpdb-reader-jpdb-used-in-row')).toBe(true);
        expect(row?.classList.contains('has-audio')).toBe(true);
        expect(row?.querySelector('.jpdb-reader-jiten-audio')).not.toBeNull();
        const main = row?.querySelector<HTMLElement>('.jpdb-reader-jiten-related-main');
        expect(main?.classList.contains('jpdb-reader-jpdb-used-in-main')).toBe(true);
        const link = row?.querySelector<HTMLAnchorElement>('.jpdb-reader-jiten-related-link');
        expect(link?.classList.contains('gloss-link')).toBe(true);
        expect(link?.dataset.dictionaryLookup).toBe(longWord);
        const head = row?.querySelector<HTMLElement>('.jpdb-reader-jiten-related-head');
        expect(head?.classList.contains('jpdb-reader-jpdb-compound-head')).toBe(true);
        expect(head?.textContent).toContain(longWord);
        expect(head?.innerHTML).toContain('<ruby>');

        const normalizedCss = POPOVER_CORE_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-reader-jiten-example-row.has-audio { grid-template-columns: 28px minmax(0, 1fr); gap: 7px; }');
        expect(normalizedCss).toContain('button.jpdb-reader-jiten-audio.jpdb-reader-icon-mini {');
        expect(normalizedCss).toContain('.jpdb-reader-local-glossary .jpdb-reader-jiten-related-link.gloss-link { display: inline; max-width: 100%; color: inherit !important; text-decoration: none !important;');
        expect(normalizedCss).toContain('.jpdb-reader-jiten-related-head { display: inline; max-width: 100%; white-space: normal; overflow-wrap: anywhere; word-break: normal; line-break: auto; }');
        expect(normalizedCss).not.toContain('.jpdb-reader-jiten-related-head .jpdb-reader-word');
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

    it('mass-reviews visible words through srs/batch-review in one transaction', async () => {
        const fetchMock = createFetchMock({ success: true });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });
        const cards = [
            jitenCard({ source: 'jiten', vid: 42, sid: 0 }),
            jitenCard({ source: 'jiten', vid: 43, sid: 1 }),
        ];

        const count = await client.batchReviewCards(cards, 'okay');

        expect(count).toBe(2);
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/srs/batch-review`, expect.objectContaining({
            body: JSON.stringify({ reviews: [
                { wordId: 42, readingIndex: 0, rating: 3 },
                { wordId: 43, readingIndex: 1, rating: 3 },
            ] }),
        }));
    });

    it('skips the batch-review request entirely when no card is Jiten-backed', async () => {
        const fetchMock = createFetchMock({ success: true });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.batchReviewCards([], 'okay')).resolves.toBe(0);
        expect(fetchMock).not.toHaveBeenCalled();
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

    it('resolves JPDB-shaped cards through Jiten parse before loading vocabulary info', async () => {
        const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            const endpoint = String(url);
            if (endpoint.endsWith('/reader/parse')) {
                expect(init?.body).toBe(JSON.stringify({ text: ['大学'] }));
                return jsonResponse({
                    vocabulary: [{
                        wordId: 321,
                        readingIndex: 0,
                        spelling: '大学',
                        reading: '大学[だいがく]',
                        frequencyRank: 475,
                        partsOfSpeech: ['noun'],
                        meaningsChunks: [['university; college']],
                        meaningsPartOfSpeech: ['noun'],
                        knownState: [],
                        pitchAccents: [0],
                    }],
                    tokens: [[{ wordId: 321, readingIndex: 0, start: 0, end: 2, length: 2 }]],
                });
            }
            if (endpoint.endsWith('/vocabulary/321/0/info')) {
                return jsonResponse({
                    wordId: 321,
                    mainReading: { text: '大学', readingIndex: 0, frequencyRank: 475, usedInMediaAmount: null },
                    partsOfSpeech: ['noun'],
                    definitions: [{ senseIndex: 0, englishMeanings: ['university; college'], pos: ['noun'] }],
                    pitchAccents: [0],
                    knownStates: [],
                });
            }
            if (endpoint.endsWith('/vocabulary/321/0/random-example-sentences')) return jsonResponse([]);
            return jsonResponse({ success: false }, 404);
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const info = await client.lookupVocabularyInfoForCard(jitenCard({
            source: 'jpdb',
            vid: 999,
            sid: 1,
            spelling: '大学',
            reading: 'だいがく',
        }));

        expect(info).toMatchObject({
            wordId: 321,
            definitions: [{ meanings: ['university; college'], partsOfSpeech: ['noun'] }],
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('renders real Jiten vocabulary definitions without local substitute cards or external buttons', () => {
        const card = jitenCard({ spelling: '大学', reading: 'だいがく' });
        const info = jitenVocabularyInfo({
            wordId: 321,
            mainReading: { text: '大学', readingIndex: 0, frequencyRank: 475, usedInMediaAmount: null },
            definitions: [jitenDefinition({ meanings: ['university; college'], partsOfSpeech: ['noun'] })],
        });

        const rendered = renderJitenDefinitionSource(card, () => '', info, 'en');
        const empty = renderJitenDefinitionSource(card, () => '', jitenVocabularyInfo({
            definitions: [],
            composedOf: [],
            usedIn: [],
            examples: [],
        }), 'en');

        expect(rendered).toContain('data-source="jiten"');
        expect(rendered).toContain('university; college');
        expect(rendered).not.toContain('No Jiten definitions');
        expect(rendered).not.toContain('Open in Jiten');
        expect(rendered).not.toContain('jpdb-reader-jiten-external-lookup');
        expect(rendered).not.toContain('jpdb-reader-jiten-local-definitions');
        expect(empty).toBe('');

        const mount = document.createElement('div');
        mount.innerHTML = rendered;
        const headword = mount.querySelector<HTMLElement>('.jpdb-reader-jiten-headword .jpdb-reader-word[data-expression="大学"]');
        expect(headword).not.toBeNull();
        expect(headword?.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(headword?.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(headword?.dataset.dictionary).toBe('Jiten');
        expect(headword?.dataset.vid).toBe('321');
        expect(headword?.dataset.sid).toBe('0');
        expect(headword?.dataset.reading).toBe('だいがく');
        expect(headword?.querySelector('rt')?.textContent).toBe('だいがく');
    });

    it('renders the headword with per-kanji furigana from the annotated mainReading instead of leaking bracketed kana', () => {
        const card = jitenCard({ spelling: '以前', reading: 'いぜん' });
        const info = jitenVocabularyInfo({
            wordId: 849,
            mainReading: { text: '以[い]前[ぜん]', readingIndex: 0, frequencyRank: 100, usedInMediaAmount: null },
            definitions: [jitenDefinition({ meanings: ['before; prior to; ago'], partsOfSpeech: ['n-suf', 'noun', 'adverb'] })],
        });

        const rendered = renderJitenDefinitionSource(card, () => '', info, 'en');
        const mount = document.createElement('div');
        mount.innerHTML = rendered;

        const headword = mount.querySelector<HTMLElement>('.jpdb-reader-jiten-headword .jpdb-reader-word');
        expect(headword).not.toBeNull();
        // Base text must be the clean spelling, never the bracketed annotation.
        expect(headword?.dataset.expression).toBe('以前');
        expect(headword?.textContent ?? '').not.toContain('[');
        expect(headword?.dataset.reading).toBe('いぜん');
        // Per-kanji ruby: two <ruby> nodes, one rt per kanji.
        const rubies = headword?.querySelectorAll('ruby') ?? [];
        expect(rubies.length).toBe(2);
        expect(Array.from(headword?.querySelectorAll('rt') ?? []).map(rt => rt.textContent)).toEqual(['い', 'ぜん']);
        expect(Array.from(headword?.querySelectorAll('.jpdb-reader-ruby-base') ?? []).map(node => node.textContent)).toEqual(['以', '前']);
    });

    it('allows keyless requests to public endpoints and throws for auth-required ones', async () => {
        const fetchMock = createFetchMock({ success: true });
        const client = new JitenApiClient(() => '', { fetchImpl: fetchMock });

        await expect(client.lookupKanji('復')).resolves.toBeDefined();
        expect(fetchMock).toHaveBeenCalledWith(`${JITEN_API_BASE_URL}/kanji/%E5%BE%A9`, expect.objectContaining({
            headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
        }));

        await expect(client.parse(['test'])).rejects.toThrow(JitenApiError);
        await expect(client.parse(['test'])).rejects.toThrow('Jiten API key is not set.');
    });

    it('falls back to vocabulary/search when resolving a card without an API key', async () => {
        const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
            const endpoint = String(url);
            if (endpoint.includes('/vocabulary/search')) {
                return jsonResponse({
                    results: [{
                        wordId: 1500800,
                        readingIndex: 0,
                        text: '復習',
                        rubyText: '復[ふく]習[しゅう]',
                        frequencyRank: 12435,
                        partsOfSpeech: ['n'],
                        meanings: ['review'],
                    }],
                });
            }
            if (endpoint.endsWith('/vocabulary/1500800/0/info')) {
                return jsonResponse({
                    wordId: 1500800,
                    mainReading: { text: '復習', readingIndex: 0 },
                    partsOfSpeech: ['n'],
                    definitions: [{ senseIndex: 0, englishMeanings: ['review'], pos: ['n'] }],
                });
            }
            return jsonResponse([]);
        });
        const client = new JitenApiClient(() => '', { fetchImpl: fetchMock });

        const info = await client.lookupVocabularyInfoForCard(jitenCard({
            source: 'jpdb',
            spelling: '復習',
            reading: 'ふくしゅう',
        }));

        expect(info).toMatchObject({
            wordId: 1500800,
            definitions: [{ meanings: ['review'] }],
        });
        expect(fetchMock).toHaveBeenCalledTimes(3); // search, info, examples
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

function jitenVocabularyInfo(overrides: Partial<JitenVocabularyInfo> = {}): JitenVocabularyInfo {
    return {
        wordId: 1,
        mainReading: { text: '読む', readingIndex: 0, frequencyRank: 100, usedInMediaAmount: null },
        alternativeReadings: [],
        partsOfSpeech: ["Godan verb with 'mu' ending", 'transitive verb'],
        definitions: [jitenDefinition()],
        pitchAccents: [],
        knownStates: ['new'],
        composedOf: [],
        usedIn: [],
        usedInTotal: 0,
        examples: [],
        ...overrides,
    };
}

function jitenDefinition(overrides: Partial<JitenVocabularyInfo['definitions'][number]> = {}): JitenVocabularyInfo['definitions'][number] {
    return {
        index: 0,
        meanings: ['to read'],
        partsOfSpeech: ["Godan verb with 'mu' ending", 'transitive verb'],
        field: [],
        dial: [],
        misc: [],
        restrictedToReadingIndices: [],
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
