import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AnkiConnectClient,
    DEFAULT_SETTINGS,
    YOMU_MODEL_FIELDS,
    card,
    deleteAnkiStatusIndexDatabase,
    largeAnkiStatusIndexResult,
    stubDueReadAnkiLookup,
    stubRenderedAnkiMediaLookup,
    stubTestAnkiConnectResponses,
    stubTestAnkiConnectResultMap,
    stubTestAnkiConnectResults,
    testAnkiClient,
    testAnkiConnectMultiResponse,
    testAnkiConnectRawResponse,
    testAnkiQueryRouteResult,
    testImportedCoreStatusIndexResult,
    testReadCard,
} from './fixtures';
import type {
    TestAnkiConnectMultiAction,
    TestAnkiConnectRequest,
    TestAnkiConnectResponse,
    TestAnkiQueryRoute,
} from './fixtures';
import { ankiStatusIndexSettingsKey } from '../../../src/reader/anki/account-context';

registerReaderHelpersCleanup();

describe('reader helpers', () => {
    it('attaches Immersion Kit audio data to Anki notes and refreshes the lookup cache', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                createDeck: null,
                modelNames: ['よむ Japanese'],
                modelFieldNames: YOMU_MODEL_FIELDS,
                updateModelTemplates: null,
                updateModelStyling: null,
                canAddNotes: [true],
                addNote: 42,
                notesInfo: [{
                    noteId: 42,
                    modelName: 'よむ Japanese',
                    tags: [],
                    fields: {
                        Expression: { value: '読む' },
                        Reading: { value: 'よむ' },
                    },
                    cards: [99],
                }],
                cardsInfo: [{
                    cardId: 99,
                    note: 42,
                    deckName: 'よむ',
                    queue: 0,
                    type: 0,
                    reps: 0,
                    lapses: 0,
                    question: '<div>読む</div>',
                    answer: '<div>to read</div>',
                }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient();
            await client.addCard(testReadCard(), '今日は本を読む。', { audioDataUrl: 'data:audio/mpeg;base64,audio-data' });

            const addNote = requests.find(request => request.action === 'addNote')?.params.note as { audio?: Array<Record<string, unknown>> };
            expect(YOMU_MODEL_FIELDS).toContain('Audio');
            expect(addNote.audio?.[0]).toMatchObject({
                data: 'audio-data',
                fields: ['Audio'],
            });
            expect(String(addNote.audio?.[0].filename)).toMatch(/\.mp3$/);

            requests.length = 0;
            await expect(client.findExistingCards({ ...card, spelling: '読む', reading: 'よむ' })).resolves.toMatchObject({
                primary: {
                    noteId: 42,
                    primaryCardId: 99,
                    renderedCards: [{ cardId: 99, question: '<div>読む</div>', answer: '<div>to read</div>' }],
                },
            });
            expect(requests.map(request => request.action)).not.toContain('findNotes');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('batch finds existing Anki cards across decks and common imported vocab fields', async () => {
        const requests = stubTestAnkiConnectResponses(request => {
            if (request.action === 'multi') {
                return testAnkiConnectMultiResponse(request, action => (
                    action.params.query.includes('動画') || action.params.query.includes('どうが') ? [55] : []
                ));
            }
            const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 55,
                        modelName: 'Imported Core',
                        tags: [],
                        fields: {
                            'Vocabulary-Kanji': { value: '動画【どうが】' },
                            'Vocabulary-Kana': { value: 'どうが' },
                            Glossary: { value: 'video' },
                        },
                        cards: [7701],
                    }],
                    cardsInfo: [{
                        cardId: 7701,
                        note: 55,
                        deckName: 'Anime::Mining',
                        queue: 2,
                        type: 2,
                        due: 0,
                        reps: 14,
                        lapses: 2,
                    }],
                    areDue: [true],
            };
            return testAnkiConnectRawResponse(resultByAction[request.action] ?? null);
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const [known, missing] = await client.findExistingCardsBatch([
                { ...card, spelling: '動画', reading: 'どうが' },
                { ...card, spelling: '字幕', reading: 'じまく' },
            ]);

            expect(known).toMatchObject({
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 14,
                    lapses: 2,
                },
            });
            expect(missing).toEqual({ state: 'not-in-deck', notes: [], primary: null });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            expect((requests[0]?.params.actions as unknown[])).toHaveLength(4);
            expect(requests[1]?.params).toEqual({ notes: [55] });
            expect(requests[2]?.params).toEqual({ cards: [7701] });
            expect(requests[3]?.params).toEqual({ cards: [7701] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not match Core-style sentence context when a dedicated vocab field points at another word', async () => {
        const requests = stubTestAnkiConnectResponses(request => {
            if (request.action === 'multi') {
                return testAnkiConnectMultiResponse(request, action => (
                    action.params.query.includes('日本語')
                        || action.params.query.includes('勉強')
                        || action.params.query.includes('べんきょう')
                        ? [101]
                        : []
                ));
            }
            const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 101,
                        modelName: 'Japanese',
                        tags: [],
                        fields: {
                            'Vocabulary-Kanji': { value: '勉強' },
                            'Vocabulary-Kana': { value: 'べんきょう' },
                            'Vocabulary-English': { value: 'study' },
                            Expression: { value: '私は日本語を<b>勉強</b>しています。' },
                            Reading: { value: '私[わたし]は 日本語[にほんご]を<b> 勉強[べんきょう]</b>しています。' },
                        },
                        cards: [8101],
                    }],
                    cardsInfo: [{
                        cardId: 8101,
                        note: 101,
                        deckName: 'Core 2k/6k',
                        queue: 0,
                        type: 0,
                        reps: 0,
                        lapses: 0,
                    }],
            };
            return testAnkiConnectRawResponse(resultByAction[request.action] ?? null);
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const [contextOnly, vocab] = await client.findExistingCardsBatch([
                { ...card, spelling: '日本語', reading: 'にほんご' },
                { ...card, spelling: '勉強', reading: 'べんきょう' },
            ]);

            expect(contextOnly).toEqual({ state: 'not-in-deck', notes: [], primary: null });
            expect(vocab).toMatchObject({
                state: 'new',
                primary: {
                    noteId: 101,
                    primaryCardId: 8101,
                    deckNames: ['Core 2k/6k'],
                    fields: {
                        'Vocabulary-Kanji': '勉強',
                        Expression: '私は日本語を勉強しています。',
                    },
                },
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not match a different Anki expression only because the reading is the same', async () => {
        const requests = stubTestAnkiConnectResponses(request => {
            if (request.action === 'multi') {
                return testAnkiConnectMultiResponse(request, action => (
                    action.params.query.includes('かい') ? [55] : []
                ));
            }
            const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 55,
                        modelName: 'Imported Core',
                        tags: [],
                        fields: {
                            Word: { value: '回' },
                            Reading: { value: 'かい' },
                            Meaning: { value: 'counter for occurrences' },
                        },
                        cards: [7701],
                    }],
                    cardsInfo: [{
                        cardId: 7701,
                        note: 55,
                        deckName: 'Core',
                        queue: 2,
                        type: 2,
                        due: 0,
                        reps: 14,
                        lapses: 0,
                    }],
                    areDue: [true],
            };
            return testAnkiConnectRawResponse(resultByAction[request.action] ?? null);
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.findExistingCards({ ...card, spelling: '買い', reading: 'かい' })).resolves.toEqual({
                state: 'not-in-deck',
                notes: [],
                primary: null,
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('hydrates rendered Anki card image media through AnkiConnect', async () => {
        const requests = stubRenderedAnkiMediaLookup('<div>写真<img src="scan.jpg?mtime=1"></div>');

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const result = await client.findExistingCards({ ...card, spelling: '写真', reading: 'しゃしん' });

            expect(result.primary?.renderedCards?.[0]?.mediaDataUrls).toEqual({
                'scan.jpg': 'data:image/jpeg;base64,image-data',
            });
            expect(requests.find(request => request.action === 'retrieveMediaFile')?.params).toEqual({ filename: 'scan.jpg' });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('leaves rendered Anki audio media lazy so long files do not block card details', async () => {
        const requests = stubRenderedAnkiMediaLookup(
            '<div>写真<img src="scan.jpg"><audio src="long-audio.mp3"></audio></div>',
        );

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const result = await client.findExistingCards({ ...card, spelling: '写真', reading: 'しゃしん' });

            expect(result.primary?.renderedCards?.[0]?.mediaDataUrls).toEqual({
                'scan.jpg': 'data:image/jpeg;base64,image-data',
            });
            expect(requests.filter(request => request.action === 'retrieveMediaFile').map(request => request.params))
                .toEqual([{ filename: 'scan.jpg' }]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('finds existing Anki cards through fallback lookup terms for inflected reader words', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubDueReadAnkiLookup('読む');

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.findExistingCards({
                ...card,
                spelling: '読みました',
                reading: 'よみました',
                fallbackLookupTerms: ['読む'],
            })).resolves.toMatchObject({
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            });

            const searches = requests
                .filter(request => request.action === 'multi')
                .flatMap(request => (request.params.actions as Array<{ params: { query: string } }>).map(action => action.params.query));
            expect(searches.some(query => query.includes('読む'))).toBe(true);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('cold-finds kanji Anki cards by reading when the clicked reader surface is kana-only', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubDueReadAnkiLookup('よむ');

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.findExistingCards({
                ...card,
                spelling: 'よむ',
                reading: 'よむ',
                fallbackLookupTerms: [],
            })).resolves.toMatchObject({
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                    fields: {
                        Word: '読む',
                        Reading: 'よむ',
                    },
                },
            });

            const searches = requests
                .filter(request => request.action === 'multi')
                .flatMap(request => (request.params.actions as Array<{ params: { query: string } }>).map(action => action.params.query));
            expect(searches.some(query => query.includes('よむ'))).toBe(true);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('accepts raw AnkiConnect multi results when finding existing Anki cards', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            if (request.action === 'multi') {
                const actions = request.params.actions as TestAnkiConnectMultiAction[];
                return actions.map(action => (
                    action.params.query.includes('難波') || action.params.query.includes('なにわ')
                        ? [1778972270889]
                        : []
                ));
            }
            const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 1778972270889,
                        modelName: 'よむ Japanese',
                        tags: ['yomu'],
                        fields: {
                            Expression: { value: '難波' },
                            Reading: { value: 'なにわ' },
                            Meaning: { value: 'Naniwa (former name for Osaka region)' },
                            Sentence: { value: '<span class="yomu-highlight">難波</span>金満高校' },
                        },
                        cards: [1778972270890],
                    }],
                    cardsInfo: [{
                        cardId: 1778972270890,
                        note: 1778972270889,
                        deckName: 'Mining',
                        queue: 2,
                        type: 2,
                        due: 0,
                        reps: 5,
                        lapses: 1,
                    }],
                    areDue: [true],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const [known] = await client.findExistingCardsBatch([{ ...card, spelling: '難波', reading: 'なにわ' }]);

            expect(known).toMatchObject({
                state: 'due',
                primary: {
                    noteId: 1778972270889,
                    primaryCardId: 1778972270890,
                    fields: {
                        Expression: '難波',
                        Reading: 'なにわ',
                    },
                },
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            expect(requests[1]?.params).toEqual({ notes: [1778972270889] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('deduplicates overlapping Anki status batches before the lookup cache is warm', async () => {
        let resolveMulti: ((value: TestAnkiConnectResponse) => void) | undefined;
        const multiResponse = new Promise<TestAnkiConnectResponse>(resolve => {
            resolveMulti = resolve;
        });
        const requests = stubTestAnkiConnectResponses(request => {
            if (request.action === 'multi') return multiResponse;
            const resultByAction: Record<string, unknown> = {
                notesInfo: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '動画' },
                        Reading: { value: 'どうが' },
                    },
                    cards: [7701],
                }],
                cardsInfo: [{
                    cardId: 7701,
                    note: 55,
                    deckName: 'Anime::Mining',
                    queue: 2,
                    type: 2,
                    due: 0,
                    reps: 14,
                    lapses: 2,
                }],
                areDue: [true],
            };
            return testAnkiConnectRawResponse(resultByAction[request.action] ?? null);
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const lookupCard = { ...card, spelling: '動画', reading: 'どうが' };
            const first = client.findExistingCardsBatch([lookupCard]);
            await Promise.resolve();
            const second = client.findExistingCardsBatch([lookupCard]);

            resolveMulti?.({
                status: 200,
                response: {
                    result: [
                        { result: [55], error: null },
                        { result: [55], error: null },
                    ],
                    error: null,
                },
            });

            const [firstResult, secondResult] = await Promise.all([first, second]);

            expect(firstResult[0]).toMatchObject({ state: 'due', primary: { noteId: 55 } });
            expect(secondResult[0]).toMatchObject({ state: 'due', primary: { noteId: 55 } });
            expect(requests.filter(request => request.action === 'multi')).toHaveLength(1);
            expect(requests.filter(request => request.action === 'notesInfo')).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not continue an existing-card lookup after the Anki client is destroyed', async () => {
        let resolveMulti: ((value: TestAnkiConnectResponse) => void) | undefined;
        const multiResponse = new Promise<TestAnkiConnectResponse>(resolve => {
            resolveMulti = resolve;
        });
        const requests = stubTestAnkiConnectResponses(request => {
            if (request.action === 'multi') return multiResponse;
            return testAnkiConnectRawResponse([]);
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const lookup = client.findExistingCardsBatch([{ ...card, spelling: '動画', reading: 'どうが' }]);
            await vi.waitFor(() => expect(requests.map(request => request.action)).toEqual(['multi']));

            client.destroy();
            resolveMulti?.({
                status: 200,
                response: {
                    result: [
                        { result: [55], error: null },
                        { result: [55], error: null },
                    ],
                    error: null,
                },
            });

            await expect(lookup).resolves.toEqual([{
                state: 'not-in-deck',
                notes: [],
                primary: null,
            }]);
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(requests.map(request => request.action)).toEqual(['multi']);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses a browser-stored Anki status index for hot path lookups', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request, {
            word: '動画',
            reading: 'どうが',
            meaning: 'video',
        }));

        try {
            const client = testAnkiClient();
            await client.rebuildStatusIndex();
            requests.length = 0;
            const cachedClient = testAnkiClient();
            const getAllSpy = vi.spyOn(IDBObjectStore.prototype, 'getAll')
                .mockImplementation(() => {
                    throw new Error('Anki status hot path should not scan every IndexedDB entry.');
                });

            try {
                await expect(cachedClient.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                    state: 'due',
                    primary: {
                        noteId: 55,
                        primaryCardId: 7701,
                    },
                }]);
            } finally {
                getAllSpy.mockRestore();
            }

            expect(requests.map(request => request.action)).toEqual([]);
            expect(localStorage.getItem('yomu:anki-status-index:v1')).toContain('"entryStore":"indexeddb"');
            expect(localStorage.getItem('yomu:anki-status-index:v1')).not.toContain('動画');
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('stores browser Anki status without hydrating every card detail', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => {
            const query = String(request.params?.query ?? '');
            const resultByAction: Record<string, unknown> = {
                findCards: query === 'deck:*'
                    ? [7701, 7702]
                    : query.includes('is:due')
                        ? [7702]
                        : [],
                findNotes: [55],
                notesInfo: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '動画' },
                        Reading: { value: 'どうが' },
                    },
                    cards: [7701, 7702],
                }],
                cardsInfo: [
                    { cardId: 7701, note: 55, deckName: 'Imported Core', queue: 0, type: 0, reps: 0, lapses: 0 },
                    { cardId: 7702, note: 55, deckName: 'Imported Core', queue: 2, type: 2, reps: 0, lapses: 0 },
                ],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient();
            await client.rebuildStatusIndex();
            expect(requests.find(request => request.action === 'cardsInfo')?.params).toEqual({ cards: [7701, 7702] });
            vi.unstubAllGlobals();
            vi.stubGlobal('GM', {
                xmlHttpRequest: () => Promise.reject(new Error('cached status lookup should not call AnkiConnect')),
            });

            const cachedClient = testAnkiClient();
            await expect(cachedClient.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7702,
                    deckNames: ['Imported Core'],
                    reps: 0,
                    lapses: 0,
                },
            }]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('uses fallback lookup terms for browser-stored Anki status index lookups', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request));

        try {
            const client = testAnkiClient();
            await client.rebuildStatusIndex();
            requests.length = 0;

            await expect(client.findCachedStatusBatch([{
                ...card,
                spelling: '読みました',
                reading: 'よみました',
                fallbackLookupTerms: ['読む'],
            }])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);
            expect(requests).toEqual([]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('uses reading keys for kana-only browser-stored Anki status index lookups', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request));

        try {
            const client = testAnkiClient();
            await client.rebuildStatusIndex();
            requests.length = 0;

            await expect(client.findCachedStatusBatch([{
                ...card,
                spelling: 'よむ',
                reading: 'よむ',
                fallbackLookupTerms: [],
            }])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);
            expect(requests).toEqual([]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('rebuilds legacy browser Anki status indexes that do not contain reading keys', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const now = Date.now();
        localStorage.setItem('yomu:anki-status-index:v1', JSON.stringify({
            version: 1,
            settingsKey: JSON.stringify({ url: DEFAULT_SETTINGS.ankiConnectUrl }),
            syncedAt: now,
            checkedAt: now,
            cardCount: 1,
            entries: {
                [String('読む').toLocaleLowerCase()]: {
                    state: 'due',
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Imported Core'],
                    reps: 12,
                    lapses: 0,
                    modelName: 'Imported Core',
                },
            },
        }));
        const requests = stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.warmStatusIndex();
            expect(requests.map(request => request.action)).toEqual(expect.arrayContaining(['findCards', 'notesInfo']));
            requests.length = 0;

            await expect(client.findCachedStatusBatch([{
                ...card,
                spelling: 'よむ',
                reading: 'よむ',
            }])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);
            expect(requests).toEqual([]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('hydrates duplicate Anki notes across decks even when the status index has one match', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests: TestAnkiConnectRequest[] = [];
        const duplicateNoteById = new Map([
            [55, { modelName: 'Imported Core', meaning: 'video', cards: [7701] }],
            [66, { modelName: 'Mining Clone', meaning: 'movie clip', cards: [8801] }],
        ]);
        const duplicateCardById = new Map([
            [7701, { note: 55, deckName: 'Core', queue: 2, type: 2, reps: 8 }],
            [8801, { note: 66, deckName: 'Mining', queue: 0, type: 0, reps: 0 }],
        ]);
        const duplicateQueryResults = new Map<string, TestAnkiQueryRoute>([
            ['findCards', { matches: ['deck:*', 'is:due'], result: [7701] }],
        ]);
        const duplicateResultByAction = new Map<string, (request: TestAnkiConnectRequest) => unknown>([
            ['multi', request => {
                const actions = request.params.actions as Array<{ action: string; params: { query: string } }>;
                return actions.map(action => ({
                    result: /動画|どうが/.test(action.params.query) ? [55, 66] : [],
                    error: null,
                }));
            }],
            ['notesInfo', request => {
                const ids = request.params.notes as number[];
                return ids.map(id => {
                    const note = duplicateNoteById.get(id)!;
                    return {
                        noteId: id,
                        modelName: note.modelName,
                        tags: [],
                        fields: {
                            Word: { value: '動画' },
                            Reading: { value: 'どうが' },
                            Meaning: { value: note.meaning },
                        },
                        cards: note.cards,
                    };
                });
            }],
            ['cardsInfo', request => {
                const ids = request.params.cards as number[];
                return ids.map(cardId => ({
                    cardId,
                    ...duplicateCardById.get(cardId)!,
                    lapses: 0,
                }));
            }],
            ['areDue', request => (request.params.cards as number[] | undefined)?.map(cardId => cardId === 7701) ?? []],
        ]);
        const duplicateAnkiResult = (request: TestAnkiConnectRequest): unknown => {
            return duplicateResultByAction.get(request.action)?.(request)
                ?? testAnkiQueryRouteResult(request, duplicateQueryResults)
                ?? (request.action === 'findNotes' ? [55] : null);
        };
        stubTestAnkiConnectResults(duplicateAnkiResult, requests);

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.rebuildStatusIndex();
            requests.length = 0;

            await expect(client.findExistingCards({ ...card, spelling: '動画', reading: 'どうが' })).resolves.toMatchObject({
                state: 'due',
                notes: [
                    { noteId: 55, deckNames: ['Core'], reps: 8 },
                    { noteId: 66, deckNames: ['Mining'], reps: 0 },
                ],
                primary: { noteId: 55, deckNames: ['Core'] },
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            expect(requests.find(request => request.action === 'notesInfo')?.params).toEqual({ notes: [55, 66] });
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('indexes Anki decks beyond two thousand cards while keeping hot path lookups keyed to visible words', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const totalCards = 4097;
        const targetCardId = totalCards;
        const allIds = Array.from({ length: totalCards }, (_, index) => index + 1);
        const noteInfoBatchSizes: number[] = [];
        const cardInfoBatchSizes: number[] = [];
        const requests = stubTestAnkiConnectResults(largeAnkiStatusIndexResult({
            allIds,
            cardInfoBatchSizes,
            noteInfoBatchSizes,
            targetCardId,
        }));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const index = await client.rebuildStatusIndex();
            expect(index).toMatchObject({
                cardCount: totalCards,
                entryCount: totalCards,
                entryStore: 'indexeddb',
            });
            expect(noteInfoBatchSizes.reduce((sum, size) => sum + size, 0)).toBe(totalCards);
            expect(Math.max(...noteInfoBatchSizes)).toBeLessThanOrEqual(500);
            expect(cardInfoBatchSizes.reduce((sum, size) => sum + size, 0)).toBe(totalCards);
            expect(Math.max(...cardInfoBatchSizes)).toBeLessThanOrEqual(500);

            requests.length = 0;
            const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get');
            const getAllSpy = vi.spyOn(IDBObjectStore.prototype, 'getAll')
                .mockImplementation(() => {
                    throw new Error('Large Anki status lookup should not scan every IndexedDB entry.');
                });
            try {
                const hotLookups = await client.findCachedStatusBatch([
                    { ...card, spelling: '語1', reading: '' },
                    { ...card, spelling: `語${targetCardId}`, reading: '' },
                    { ...card, spelling: '未収録', reading: '' },
                ]);
                expect(hotLookups).toHaveLength(3);
                expect(hotLookups[0]).toMatchObject({
                    state: 'new',
                    primary: {
                        noteId: 1,
                        primaryCardId: 1,
                    },
                });
                expect(hotLookups[1]).toMatchObject({
                    state: 'due',
                    primary: {
                        noteId: targetCardId,
                        primaryCardId: targetCardId,
                    },
                });
                expect(hotLookups[2]).toEqual({
                    state: 'not-in-deck',
                    notes: [],
                    primary: null,
                });
                const keys = getSpy.mock.calls.map(([key]) => key);
                expect(keys.filter(key => key === '__yomu-managed-state-epoch__')).toHaveLength(1);
                expect(keys.filter(key => key !== '__yomu-managed-state-epoch__')).toHaveLength(3);
            } finally {
                getSpy.mockRestore();
                getAllSpy.mockRestore();
            }

            expect(requests).toEqual([]);
            expect(getAllSpy).not.toHaveBeenCalled();
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    }, 20000);

    it('indexes mapped custom Anki expression fields without falling back to deck-size scans', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiMobileHandoff: false,
            ankiFieldMappings: {
                'Custom Mining': {
                    expression: 'KanjiTerm',
                    reading: 'Reading',
                    meaning: 'GlossText',
                },
            },
        };
        stubTestAnkiConnectResults(request => {
            const query = String(request.params?.query ?? '');
            const resultByAction: Record<string, unknown> = {
                findCards: query.includes('is:due') || query === 'deck:*' ? [8801] : [],
                findNotes: [9901],
                notesInfo: [{
                    noteId: 9901,
                    modelName: 'Custom Mining',
                    tags: ['existing'],
                    fields: {
                        KanjiTerm: { value: '難波' },
                        Reading: { value: 'なにわ' },
                        GlossText: { value: 'former name for Osaka region' },
                    },
                    cards: [8801],
                }],
                cardsInfo: [{
                    cardId: 8801,
                    note: 9901,
                    deckName: 'Mining',
                    queue: 2,
                    type: 2,
                    reps: 7,
                    lapses: 1,
                }],
            };
            return resultByAction[request.action] ?? null;
        }, requests);

        try {
            const client = new AnkiConnectClient(() => settings);
            await client.rebuildStatusIndex();
            requests.length = 0;
            const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get');
            const getAllSpy = vi.spyOn(IDBObjectStore.prototype, 'getAll')
                .mockImplementation(() => {
                    throw new Error('Mapped Anki status lookups should use exact IndexedDB keys, not scan the store.');
                });

            try {
                await expect(client.findCachedStatusBatch([{ ...card, spelling: '難波', reading: '' }])).resolves.toMatchObject([{
                    state: 'due',
                    primary: {
                        noteId: 9901,
                        primaryCardId: 8801,
                    },
                }]);
                const keys = getSpy.mock.calls.map(([key]) => key);
                expect(keys.filter(key => key === '__yomu-managed-state-epoch__')).toHaveLength(1);
                expect(keys.filter(key => key !== '__yomu-managed-state-epoch__')).toHaveLength(1);
            } finally {
                getSpy.mockRestore();
                getAllSpy.mockRestore();
            }

            expect(requests).toEqual([]);
            requests.length = 0;
            vi.unstubAllGlobals();
            stubTestAnkiConnectResults(request => {
                if (request.action === 'multi') {
                    const actions = request.params.actions as Array<{ action: string; params?: Record<string, unknown> }>;
                    if (actions.some(action => action.action !== 'findNotes')) {
                        throw new Error('Mapped cached Anki hydration should only run exact note lookups before note-id hydration.');
                    }
                    return actions.map(() => ({ result: [9901], error: null }));
                }
                if (request.action === 'findNotes') {
                    throw new Error('Mapped cached Anki hydration should batch exact lookup terms through multi.');
                }
                const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 9901,
                        modelName: 'Custom Mining',
                        tags: ['existing'],
                        fields: {
                            KanjiTerm: { value: '難波' },
                            Reading: { value: 'なにわ' },
                            GlossText: { value: 'former name for Osaka region' },
                        },
                        cards: [8801],
                    }],
                    cardsInfo: [{
                        cardId: 8801,
                        note: 9901,
                        deckName: 'Mining',
                        queue: 2,
                        type: 2,
                        reps: 7,
                        lapses: 1,
                    }],
                    areDue: [true],
                };
                return resultByAction[request.action] ?? null;
            }, requests);

            await expect(client.findExistingCards({ ...card, spelling: '難波', reading: '' })).resolves.toMatchObject({
                state: 'due',
                primary: {
                    noteId: 9901,
                    fields: {
                        KanjiTerm: '難波',
                        Reading: 'なにわ',
                        GlossText: 'former name for Osaka region',
                    },
                },
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            const lookupActions = requests[0]?.params.actions as Array<{ action: string; params?: Record<string, unknown> }>;
            expect(lookupActions.every(action => action.action === 'findNotes')).toBe(true);
            expect(lookupActions.some(action => String(action.params?.query ?? '').includes('deck:*'))).toBe(false);
            expect(lookupActions.some(action => String(action.params?.query ?? '').includes('難波'))).toBe(true);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('checks stale Anki status index counts with deck stats before scanning every card id', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const now = Date.now();
        localStorage.setItem('yomu:anki-status-index:v1', JSON.stringify({
            version: 1,
            settingsKey: ankiStatusIndexSettingsKey(DEFAULT_SETTINGS),
            syncedAt: now - 10 * 60 * 1000,
            checkedAt: now - 6 * 60 * 1000,
            cardCount: 2505,
            readingKeys: true,
            entries: {},
        }));
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                version: 6,
                deckNames: ['Mining', 'Archive'],
                getDeckStats: {
                    1: { name: 'Mining', total_in_deck: 2000 },
                    2: { name: 'Archive', total_in_deck: 505 },
                },
                findCards: [],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.warmStatusIndex();

            // 0.6.122 adds the edited-card probe (findCards 'edited:N') to the
            // count gate; the point of this test is that no per-card scan runs.
            expect(requests.map(request => request.action)).toEqual(['version', 'deckNames', 'getDeckStats', 'findCards']);
            expect(requests.find(request => request.action === 'getDeckStats')?.params).toEqual({ decks: ['Mining', 'Archive'] });
            expect(requests.some(request => request.action === 'findCards' && request.params.query === 'deck:*')).toBe(false);
            const refreshed = JSON.parse(localStorage.getItem('yomu:anki-status-index:v1') ?? '{}') as { checkedAt?: number };
            expect(refreshed.checkedAt).toBeGreaterThan(now - 6 * 60 * 1000);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('keeps review-triggered Anki status refreshes cheap when the card count is unchanged', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const now = Date.now();
        localStorage.setItem('yomu:anki-status-index:v1', JSON.stringify({
            version: 1,
            settingsKey: ankiStatusIndexSettingsKey(DEFAULT_SETTINGS),
            syncedAt: now,
            checkedAt: now,
            cardCount: 1,
            readingKeys: true,
            entries: {
                [String('動画').toLocaleLowerCase()]: {
                    state: 'due',
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 14,
                    lapses: 0,
                    modelName: 'Imported Core',
                },
            },
        }));
        const requests = stubTestAnkiConnectResults(request => {
            const query = String(request.params?.query ?? '');
            const resultByAction: Record<string, unknown> = {
                answerCards: null,
                version: 6,
                deckNames: ['Anime::Mining'],
                getDeckStats: {
                    1: { name: 'Anime::Mining', total_in_deck: 1 },
                },
                findCards: query === 'deck:*' ? [7701] : [],
                findNotes: [55],
                notesInfo: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '動画' },
                        Reading: { value: 'どうが' },
                    },
                    cards: [7701],
                }],
            };
            return resultByAction[request.action] ?? null;
        });

        let client: AnkiConnectClient | undefined;
        try {
            client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.answerCard(7701, 'okay');
            await vi.waitFor(() => expect(requests.map(request => request.action)).toEqual(
                expect.arrayContaining(['answerCards', 'deckNames', 'getDeckStats']),
            ), { timeout: 4_000 });

            expect(requests.some(request => request.action === 'findCards' && request.params.query === 'deck:*')).toBe(false);
            expect(requests.some(request => request.action === 'notesInfo')).toBe(false);
            const stored = JSON.parse(localStorage.getItem('yomu:anki-status-index:v1') ?? '{}') as { checkedAt?: number; syncedAt?: number };
            expect(stored.checkedAt).toBeGreaterThan(0);
            expect(stored.syncedAt).toBe(0);
        } finally {
            client?.destroy();
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('does not scan the whole Anki collection while another page is rebuilding the status index', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const now = Date.now();
        const settingsKey = ankiStatusIndexSettingsKey(DEFAULT_SETTINGS);
        localStorage.setItem('yomu:anki-status-index:v1', JSON.stringify({
            version: 1,
            settingsKey,
            syncedAt: now - 60 * 60 * 1000,
            checkedAt: now - 6 * 60 * 1000,
            cardCount: 1,
            readingKeys: true,
            entries: {
                [String('動画').toLocaleLowerCase()]: {
                    state: 'due',
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 14,
                    lapses: 0,
                    modelName: 'Imported Core',
                },
            },
        }));
        localStorage.setItem('yomu:anki-status-index-rebuild:v1', JSON.stringify({
            owner: 'other-page',
            settingsKey,
            startedAt: now,
            expiresAt: now + 60 * 1000,
        }));
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                version: 6,
                deckNames: ['Mining', 'Archive'],
                getDeckStats: {
                    1: { name: 'Mining', total_in_deck: 2 },
                    2: { name: 'Archive', total_in_deck: 0 },
                },
                findCards: [7701, 7702],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.warmStatusIndex();

            expect(requests.map(request => request.action)).toEqual(['version', 'deckNames', 'getDeckStats']);
            expect(JSON.parse(localStorage.getItem('yomu:anki-status-index-rebuild:v1') ?? '{}')).toMatchObject({
                owner: 'other-page',
                settingsKey,
            });
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('does not match Anki status index entries from meaning-only fields', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request, {
            word: '動画',
            reading: 'どうが',
            meaning: '字幕',
        }));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.rebuildStatusIndex();

            await expect(client.findCachedStatusBatch([{ ...card, spelling: '字幕', reading: 'じまく' }])).resolves.toEqual([{
                state: 'not-in-deck',
                notes: [],
                primary: null,
            }]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('matches existing Anki notes through mapped custom expression and reading fields', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => {
            if (request.action === 'multi') {
                const actions = request.params.actions as Array<{ params?: { query?: string } }>;
                return actions.map(action => ({
                    result: String(action.params?.query ?? '').includes('難波') ? [9901] : [],
                    error: null,
                }));
            }
            const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 9901,
                        modelName: 'Custom Mining',
                        tags: ['existing'],
                        fields: {
                            SentenceFront: { value: '大阪、難波、行く' },
                            KanaHint: { value: 'なんば / なにわ' },
                            GlossText: { value: 'Osaka district' },
                        },
                        cards: [8801],
                    }],
                    cardsInfo: [{
                        cardId: 8801,
                        note: 9901,
                        deckName: 'Mining',
                        queue: 0,
                        type: 0,
                        reps: 0,
                        lapses: 0,
                    }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: false,
                ankiFieldMappings: {
                    'Custom Mining': {
                        expression: 'SentenceFront',
                        reading: 'KanaHint',
                        meaning: 'GlossText',
                    },
                },
            }));

            await expect(client.findExistingCards({ ...card, spelling: '難波', reading: 'なにわ' })).resolves.toMatchObject({
                state: 'new',
                primary: {
                    noteId: 9901,
                    fields: {
                        SentenceFront: '大阪、難波、行く',
                        KanaHint: 'なんば / なにわ',
                        GlossText: 'Osaka district',
                    },
                },
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo']);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('keeps disabled cold-cache page coloring misses untrusted without Anki requests', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => {
            if (request.action === 'multi') {
                const actions = request.params.actions as unknown[];
                return actions.map(() => ({ result: [], error: null }));
            }
            const resultByAction: Record<string, unknown> = {
                version: 6,
                findCards: [],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                ankiMobileHandoff: false,
                wordTextColorSource: 'anki',
            }));

            await expect(client.findCachedStatusBatch([
                { ...card, spelling: '動画', reading: 'どうが' },
                { ...card, spelling: '字幕', reading: 'じまく' },
            ])).resolves.toEqual([
                { state: 'not-in-deck', notes: [], primary: null, trusted: false },
                { state: 'not-in-deck', notes: [], primary: null, trusted: false },
            ]);

            expect(requests.map(request => request.action)).toEqual([]);
            client.destroy();
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('uses exact Anki status lookups while the status index is refreshing', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => {
            if (request.action === 'version') return 6;
            if (request.action === 'multi') {
                const actions = request.params.actions as Array<{ action: string; params?: { query?: string } }>;
                return actions.map(action => ({
                    result: /動画|どうが/.test(String(action.params?.query ?? '')) ? [55] : [],
                    error: null,
                }));
            }
            const resultByAction: Record<string, unknown> = {
                    notesInfo: [{
                        noteId: 55,
                        modelName: 'Imported Core',
                        tags: [],
                        fields: {
                            Word: { value: '動画' },
                            Reading: { value: 'どうが' },
                        },
                        cards: [7701],
                    }],
                    cardsInfo: [{
                        cardId: 7701,
                        note: 55,
                        deckName: 'Anime::Mining',
                        queue: 0,
                        type: 0,
                        reps: 0,
                        lapses: 0,
                    }],
            };
            return resultByAction[request.action] ?? null;
        });
        const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
        const index = {
            version: 1,
            settingsKey: JSON.stringify({ url: DEFAULT_SETTINGS.ankiConnectUrl }),
            syncedAt: Date.now(),
            checkedAt: Date.now(),
            cardCount: 2,
            readingKeys: true,
            entries: {},
        };
        const internals = client as unknown as {
            statusIndex?: typeof index;
            statusIndexRefresh?: Promise<unknown>;
        };
        internals.statusIndex = index;
        internals.statusIndexRefresh = new Promise(() => undefined);

        try {
            await expect(client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'new',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);
            expect(requests.map(request => request.action)).not.toContain('findCards');

            internals.statusIndexRefresh = undefined;
            internals.statusIndex = {
                ...index,
                entries: {
                    [String('動画').toLocaleLowerCase()]: {
                        state: 'due',
                        noteId: 55,
                        primaryCardId: 7701,
                        deckNames: ['Anime::Mining'],
                        reps: 14,
                        lapses: 0,
                        modelName: 'Imported Core',
                    },
                },
            };

            await expect(client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'new',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('uses exact Anki status lookups for cold-cache page coloring without broad scans', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => {
            const query = String(request.params?.query ?? '');
            if (request.action === 'version') return 6;
            if (request.action === 'multi') {
                const actions = request.params.actions as Array<{ action: string; params?: { query?: string } }>;
                return actions.map(action => (
                    action.action === 'findNotes' && /動画|どうが/.test(String(action.params?.query ?? ''))
                        ? [55]
                        : []
                ));
            }
            const resultByAction: Record<string, unknown> = {
                deckNames: ['Anime::Mining'],
                getDeckStats: {
                    1: { name: 'Anime::Mining', total_in_deck: 1 },
                },
                findCards: query === 'deck:*' ? [7701] : [],
                notesInfo: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '動画' },
                        Reading: { value: 'どうが' },
                    },
                    cards: [7701],
                }],
                cardsInfo: [{
                    cardId: 7701,
                    note: 55,
                    deckName: 'Anime::Mining',
                    queue: 2,
                    type: 2,
                    reps: 14,
                    lapses: 0,
                }],
                areDue: [true],
            };
            return resultByAction[request.action] ?? [];
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));

            await expect(client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);

            const actions = requests.map(request => request.action);
            expect(actions).toEqual(expect.arrayContaining(['multi', 'notesInfo', 'cardsInfo', 'areDue']));
            expect(requests.some(request => request.action === 'findCards' && request.params.query === 'deck:*')).toBe(false);
            client.destroy();
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('uses exact Anki status lookups while another page rebuilds the status index', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const now = Date.now();
        const settingsKey = JSON.stringify({ url: DEFAULT_SETTINGS.ankiConnectUrl });
        localStorage.setItem('yomu:anki-status-index:v1', JSON.stringify({
            version: 1,
            settingsKey,
            syncedAt: now,
            checkedAt: now,
            cardCount: 1,
            readingKeys: true,
            entries: {},
        }));
        localStorage.setItem('yomu:anki-status-index-rebuild:v1', JSON.stringify({
            owner: 'other-page',
            settingsKey,
            startedAt: now,
            expiresAt: now + 60 * 1000,
        }));
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        stubTestAnkiConnectResultMap({
            requests,
            multi: request => {
                const actions = request.params.actions as Array<{ action: string; params?: { query?: string } }>;
                return actions.map(action => ({
                    result: /難波|なにわ/.test(String(action.params?.query ?? '')) ? [77] : [],
                    error: null,
                }));
            },
            resultByAction: {
                version: 6,
                notesInfo: [{
                    noteId: 77,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '難波' },
                        Reading: { value: 'なにわ' },
                    },
                    cards: [7707],
                }],
                cardsInfo: [{
                    cardId: 7707,
                    note: 77,
                    deckName: 'Vocab 2k',
                    queue: 0,
                    type: 0,
                    reps: 0,
                    lapses: 0,
                }],
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));

            await expect(client.findCachedStatusBatch([{ ...card, spelling: '難波', reading: 'なにわ' }])).resolves.toMatchObject([{
                state: 'new',
                primary: {
                    noteId: 77,
                    primaryCardId: 7707,
                },
            }]);
            expect(requests.map(request => request.action)).not.toContain('findCards');

            localStorage.removeItem('yomu:anki-status-index-rebuild:v1');
            await expect(client.findCachedStatusBatch([{ ...card, spelling: '難波', reading: 'なにわ' }])).resolves.toMatchObject([{
                state: 'new',
                primary: {
                    noteId: 77,
                    primaryCardId: 7707,
                },
            }]);
            expect(requests.map(request => request.action)).not.toContain('findCards');
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('returns browser-stored Anki statuses from the cache-only coloring path', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request, {
            word: '動画',
            reading: 'どうが',
            meaning: '',
        }));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.rebuildStatusIndex();
            vi.unstubAllGlobals();
            vi.stubGlobal('GM', {
                xmlHttpRequest: () => Promise.reject(new Error('cached status lookup should not call AnkiConnect')),
            });

            await expect(client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'due',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            }]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('periodically checks stale Anki status indexes without rebuilding when the card count is unchanged', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        localStorage.setItem('yomu:anki-status-index:v1', JSON.stringify({
            version: 1,
            settingsKey: ankiStatusIndexSettingsKey(DEFAULT_SETTINGS),
            syncedAt: 1,
            checkedAt: 1,
            cardCount: 1,
            readingKeys: true,
            entries: {
                [String('動画').toLocaleLowerCase()]: {
                    state: 'known',
                    noteId: 55,
                    primaryCardId: 7701,
                    deckNames: ['Anime::Mining'],
                    reps: 14,
                    lapses: 0,
                    modelName: 'Imported Core',
                },
            },
        }));
        const requests = stubTestAnkiConnectResults(request => testImportedCoreStatusIndexResult(request, {
            word: '動画',
            reading: 'どうが',
            meaning: '',
            deckName: 'Anime::Mining',
        }));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));

            await expect(client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'known',
            }]);

            await client.warmStatusIndex();
            // 0.6.122: the count gate also probes recently-edited cards
            // (findCards 'edited:N'), but an unchanged count must never
            // trigger the full deck:* rebuild or note hydration.
            expect(requests.map(request => request.action)).toEqual(['version', 'deckNames', 'getDeckStats', 'findCards']);
            expect(requests.some(request => request.action === 'findCards' && request.params.query === 'deck:*')).toBe(false);
            expect(requests.some(request => request.action === 'findCards' && String(request.params.query).startsWith('edited:'))).toBe(true);
            expect(requests.map(request => request.action)).not.toContain('notesInfo');
            expect(requests.map(request => request.action)).not.toContain('cardsModTime');

            const refreshed = JSON.parse(localStorage.getItem('yomu:anki-status-index:v1') ?? '{}') as { checkedAt?: number };
            expect(refreshed.checkedAt).toBeGreaterThan(1);
            const persistedClient = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(persistedClient.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }])).resolves.toMatchObject([{
                state: 'known',
            }]);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('does not continue background Anki status refresh after destroy while the availability probe is pending', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const ankiConnectUrl = `${window.location.origin}/anki-destroy-probe`;
        const requests: Array<{ action: string; params: Record<string, unknown>; url?: string }> = [];
        let resolveVersion: ((value: unknown) => void) | undefined;
        const versionResponse = new Promise(resolve => {
            resolveVersion = resolve;
        });
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data, url }: { data: string; url?: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push({ ...request, url });
                if (request.action === 'version') return versionResponse;
                return Promise.resolve({ status: 200, response: { result: [], error: null } });
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false, ankiConnectUrl }));
            const currentActions = () => requests
                .filter(request => request.url === ankiConnectUrl)
                .map(request => request.action);
            client.warmStatusIndex();
            await new Promise(resolve => setTimeout(resolve, 0));
            const startedActions = currentActions();
            expect(startedActions.filter(action => action !== 'version')).toEqual([]);

            client.destroy();
            resolveVersion?.({ status: 200, response: { result: 6, error: null } });
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(currentActions()).toEqual(startedActions);
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

});
