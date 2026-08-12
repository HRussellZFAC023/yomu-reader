import { describe, expect, it, vi } from 'vitest';
import {
    registerReaderHelpersCleanup,
    AnkiConnectClient,
    AnkiDuplicateNoteError,
    JpdbClient,
    TEST_ANDROID_CHROME_USER_AGENT,
    TEST_IOS_SAFARI_USER_AGENT,
    TEST_IPADOS_DESKTOP_SAFARI_USER_AGENT,
    TEST_IPAD_SAFARI_USER_AGENT,
    YOMU_MODEL_FIELDS,
    YomitanDictionaryStore,
    DEFAULT_SETTINGS,
    card,
    deleteAnkiStatusIndexDatabase,
    parseTestAnkiConnectRequest,
    stubMobileAnkiHandoffEnvironment,
    stubTestAnkiConnectResultMap,
    stubTestAnkiConnectResults,
    testAnkiClient,
    testAnkiConnectResponse,
    testAnkiQueryRouteResult,
    testCardActionController,
    testReadCard,
} from './fixtures';
import type {
    AnkiLookupResult,
    JitenApiClient,
    MiningContext,
    TestAnkiConnectRequest,
    TestAnkiQueryRoute,
} from './fixtures';

registerReaderHelpersCleanup();

async function performTestAnkiAdd(controller: ReturnType<typeof testCardActionController>): Promise<void> {
    await expect(controller.perform({ kind: 'card-action', action: 'anki' }, document.createElement('button'), {
        ...card,
        spelling: '読む',
        reading: 'よむ',
        meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
    }, '今日は本を読む。')).resolves.toBe(true);
}

describe('reader helpers', () => {
    it('hydrates cache-only Anki status notes by note id without searching the whole collection again', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests = stubTestAnkiConnectResults(request => {
            const query = String(request.params?.query ?? '');
            const resultByAction: Record<string, unknown> = {
                findCards: query.includes('is:due') || query === 'deck:*' ? [7701] : [],
                findNotes: [55],
                notesInfo: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    tags: ['existing'],
                    fields: {
                        Word: { value: '動画' },
                        Reading: { value: 'どうが' },
                        Meaning: { value: 'video' },
                    },
                    cards: [7701],
                }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await client.rebuildStatusIndex();
            await client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: 'どうが' }]);
            requests.length = 0;
            vi.unstubAllGlobals();
            vi.stubGlobal('GM', {
                xmlHttpRequest: ({ data }: { data: string }) => {
                    const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                    requests.push(request);
                    if (request.action === 'findNotes') {
                        throw new Error('Cached Anki hydration should batch exact lookup-term searches.');
                    }
                    if (request.action === 'multi') {
                        const actions = request.params.actions as Array<{ action: string; params: Record<string, unknown> }>;
                        const responses = actions.map(action => {
                            const query = String(action.params?.query ?? '');
                            if (query === 'deck:*' || query.includes('deck:')) {
                                throw new Error(`Cached Anki hydration should not search the whole collection: ${query}`);
                            }
                            return { result: query === '"動画"' || query === '"どうが"' ? [55] : [], error: null };
                        });
                        return Promise.resolve({ status: 200, response: { result: responses, error: null } });
                    }
                    const resultByAction: Record<string, unknown> = {
                        notesInfo: [{
                            noteId: 55,
                            modelName: 'Imported Core',
                            tags: ['existing'],
                            fields: {
                                OddFront: { value: 'これは動画です' },
                                Hint: { value: 'video' },
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
                            lapses: 2,
                            question: '<div>動画</div>',
                            answer: '<div>video</div>',
                        }],
                        areDue: [true],
                    };
                    return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
                },
            });

            await expect(client.findExistingCards({ ...card, spelling: '動画', reading: 'どうが' })).resolves.toMatchObject({
                state: 'due',
                primary: {
                    noteId: 55,
                    deckNames: ['Anime::Mining'],
                    fields: {
                        OddFront: 'これは動画です',
                        Hint: 'video',
                    },
                    renderedCards: [{ cardId: 7701, question: '<div>動画</div>', answer: '<div>video</div>' }],
                    tags: ['existing'],
                },
            });
            expect(requests.map(request => request.action)).toEqual(['multi', 'notesInfo', 'cardsInfo', 'areDue']);
            const lookupActions = requests[0]?.params.actions as Array<{ action: string; params: Record<string, unknown> }>;
            expect(lookupActions.map(action => action.action)).toEqual(['findNotes', 'findNotes']);
            expect(lookupActions.map(action => action.params.query)).toEqual(expect.arrayContaining(['"動画"', '"どうが"']));
            expect(requests[1]?.params).toEqual({ notes: [55] });
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('uses Anki areDue flags instead of raw cardsInfo due values for existing-card status', async () => {
        stubTestAnkiConnectResultMap({
            multi: () => [{ result: [56], error: null }, { result: [], error: null }],
            resultByAction: {
                notesInfo: [{
                    noteId: 56,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '未来' },
                        Reading: { value: 'みらい' },
                        Meaning: { value: 'future' },
                    },
                    cards: [8801],
                }],
                cardsInfo: [{
                    cardId: 8801,
                    note: 56,
                    deckName: 'Core',
                    queue: 2,
                    type: 2,
                    due: 0,
                    reps: 9,
                    lapses: 0,
                }],
                areDue: [false],
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.findExistingCards({ ...card, spelling: '未来', reading: 'みらい' })).resolves.toMatchObject({
                state: 'known',
                primary: {
                    state: 'known',
                    primaryCardId: 8801,
                },
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('keeps mixed due and suspended Anki sibling cards due after full hydration', async () => {
        stubTestAnkiConnectResultMap({
            multi: () => [{ result: [57], error: null }, { result: [], error: null }],
            resultByAction: {
                notesInfo: [{
                    noteId: 57,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '復習' },
                        Reading: { value: 'ふくしゅう' },
                        Meaning: { value: 'review' },
                    },
                    cards: [8802, 8803],
                }],
                cardsInfo: [
                    {
                        cardId: 8802,
                        note: 57,
                        deckName: 'Core',
                        queue: 2,
                        type: 2,
                        due: 0,
                        reps: 9,
                        lapses: 0,
                    },
                    {
                        cardId: 8803,
                        note: 57,
                        deckName: 'Core',
                        queue: -1,
                        type: 2,
                        due: 0,
                        reps: 0,
                        lapses: 0,
                    },
                ],
                areDue: [true],
            },
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.findExistingCards({ ...card, spelling: '復習', reading: 'ふくしゅう' })).resolves.toMatchObject({
                state: 'due',
                primary: {
                    state: 'due',
                    primaryCardId: 8802,
                },
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('scans Anki decks and note types to suggest fields for non-standard libraries', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                deckNames: ['Mining', 'Archive'],
                modelNames: ['Basic', 'Simple Model', 'Imported Japanese'],
                modelFieldNames: request.params.modelName === 'Imported Japanese'
                    ? ['Vocabulary-Kanji', 'Vocabulary-Kana', 'Glossary', 'SentenceAudio', 'Picture']
                    : request.params.modelName === 'Simple Model'
                        ? ['Japanese_Word', 'Translation_1', 'audio']
                        : ['Front', 'Back'],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const scan = await client.scanLibrary();

            expect(scan.deckNames).toEqual(['Mining', 'Archive']);
            expect(scan.suggestedModel?.modelName).toBe('Imported Japanese');
            expect(scan.suggestedModel?.suggestions).toEqual(expect.arrayContaining([
                { role: 'expression', fieldName: 'Vocabulary-Kanji', confidence: 'high' },
                { role: 'reading', fieldName: 'Vocabulary-Kana', confidence: 'high' },
                { role: 'meaning', fieldName: 'Glossary', confidence: 'high' },
                { role: 'sentence', fieldName: null, confidence: 'low' },
                // SentenceAudio belongs to the sentenceAudio role, not the
                // word-audio one. This note type has no word-audio field, so
                // that role stays unmapped and mergeAudioFilesForNote collapses
                // word audio onto SentenceAudio rather than claiming it here.
                { role: 'audio', fieldName: null, confidence: 'low' },
                { role: 'sentenceAudio', fieldName: 'SentenceAudio', confidence: 'high' },
                { role: 'image', fieldName: 'Picture', confidence: 'high' },
            ]));
            const simple = scan.models.find(model => model.modelName === 'Simple Model');
            expect(simple?.suggestions).toEqual(expect.arrayContaining([
                { role: 'expression', fieldName: 'Japanese_Word', confidence: 'high' },
                { role: 'meaning', fieldName: 'Translation_1', confidence: 'high' },
                { role: 'sentence', fieldName: null, confidence: 'low' },
                { role: 'audio', fieldName: 'audio', confidence: 'high' },
            ]));
            expect(requests.map(request => request.action)).toEqual(expect.arrayContaining([
                'deckNames',
                'modelNames',
                'modelFieldNames',
                'findNotes',
            ]));
            expect(requests.filter(request => request.action === 'modelFieldNames')).toHaveLength(3);
            expect(requests.filter(request => request.action === 'findNotes')).toHaveLength(3);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('recognizes representative nonstandard Japanese deck field aliases without samples', async () => {
        stubTestAnkiConnectResults(request => {
            const modelName = String(request.params?.modelName ?? '');
            const resultByAction: Record<string, unknown> = {
                deckNames: [
                    'Yomu Compat Test::Animecards Lapis Shape',
                    'Yomu Compat Test::Base Mining Shape',
                    'Yomu Compat Test::Genki Quiz Shape',
                    'Yomu Compat Test::JLPT Kanji Shape',
                    'Yomu Compat Test::Kana Shape',
                ],
                modelNames: [
                    'Yomu Compat - Animecards Lapis Shape',
                    'Yomu Compat - Base Mining Shape',
                    'Yomu Compat - Genki Quiz Shape',
                    'Yomu Compat - JLPT Kanji Shape',
                    'Yomu Compat - Kana Shape',
                    'Heisigs RTK 6th Best',
                    'Kaishi 1.5k',
                ],
                modelFieldNames: {
                    'Yomu Compat - Animecards Lapis Shape': [
                        'Expression',
                        'ExpressionFurigana',
                        'ExpressionReading',
                        'ExpressionAudio',
                        'SelectionText',
                        'MainDefinition',
                        'Sentence',
                        'SentenceFurigana',
                        'SentenceAudio',
                        'Screenshot',
                        'PitchPosition',
                        'Frequency',
                    ],
                    'Yomu Compat - Base Mining Shape': [
                        'Word',
                        'Reading',
                        'Glossary',
                        'Sentence',
                        'Picture',
                        'Audio',
                        'SentenceAudio',
                        'Graph',
                        'Hint',
                    ],
                    'Yomu Compat - Genki Quiz Shape': [
                        'Learnable',
                        'Reading',
                        'Definition',
                        'Example',
                        'Choices',
                        'Mems',
                        'Audio',
                    ],
                    'Yomu Compat - JLPT Kanji Shape': [
                        'Kanji',
                        'Keyword',
                        'On',
                        'Kun',
                        'StrokeOrder',
                        'Examples',
                    ],
                    'Yomu Compat - Kana Shape': [
                        'Katakana',
                        'Hiragana',
                        'Audio',
                        'Mnemonic',
                    ],
                    'Heisigs RTK 6th Best': [
                        'id',
                        'frameNoV4',
                        'frameNoV6',
                        'keyword',
                        'kanji',
                        'strokeDiagram',
                        'hint',
                        'constituent',
                        'strokeCount',
                        'lessonNo',
                        'heisigStory',
                        'heisigComment',
                        'koohiiStory1',
                        'koohiiStory2',
                        'jouYou',
                        'jlpt',
                        'onYomi',
                        'kunYomi',
                        'words',
                        'readingExamples',
                    ],
                    'Kaishi 1.5k': [
                        'Word',
                        'Word Reading',
                        'Word Meaning',
                        'Word Furigana',
                        'Word Audio',
                        'Sentence',
                        'Sentence Meaning',
                        'Sentence Furigana',
                        'Sentence Audio',
                        'Notes',
                        'Pitch Accent',
                        'Pitch Accent Notes',
                        'Frequency',
                        'Picture',
                    ],
                }[modelName] ?? [],
                findNotes: [],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const scan = await client.scanLibrary();
            const suggestionsFor = (modelName: string): Record<string, string | null> => Object.fromEntries(
                scan.models.find(model => model.modelName === modelName)?.suggestions.map(suggestion => [suggestion.role, suggestion.fieldName]) ?? [],
            );

            expect(suggestionsFor('Yomu Compat - Animecards Lapis Shape')).toMatchObject({
                expression: 'Expression',
                reading: 'ExpressionReading',
                meaning: 'MainDefinition',
                sentence: 'Sentence',
                audio: 'ExpressionAudio',
                image: 'Screenshot',
            });
            expect(suggestionsFor('Yomu Compat - Base Mining Shape')).toMatchObject({
                expression: 'Word',
                reading: 'Reading',
                meaning: 'Glossary',
                sentence: 'Sentence',
                audio: 'Audio',
                image: 'Picture',
            });
            expect(suggestionsFor('Yomu Compat - Genki Quiz Shape')).toMatchObject({
                expression: 'Learnable',
                reading: 'Reading',
                meaning: 'Definition',
                sentence: 'Example',
                audio: 'Audio',
            });
            expect(suggestionsFor('Yomu Compat - JLPT Kanji Shape')).toMatchObject({
                expression: 'Kanji',
                reading: 'On',
                meaning: 'Keyword',
            });
            expect(suggestionsFor('Yomu Compat - Kana Shape')).toMatchObject({
                expression: 'Katakana',
                reading: 'Hiragana',
                meaning: 'Mnemonic',
                audio: 'Audio',
            });
            expect(suggestionsFor('Heisigs RTK 6th Best')).toMatchObject({
                expression: 'kanji',
                reading: 'onYomi',
                meaning: 'keyword',
                image: null,
            });
            expect(suggestionsFor('Kaishi 1.5k')).toMatchObject({
                expression: 'Word',
                reading: 'Word Reading',
                meaning: 'Word Meaning',
                sentence: 'Sentence',
                audio: 'Word Audio',
                image: 'Picture',
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('prefers dedicated Core and Jlab headword fields over sentence-like generic fields when scanning Anki models', async () => {
        stubTestAnkiConnectResults(request => {
            const modelName = String(request.params?.modelName ?? '');
            if (request.action === 'notesInfo') {
                const notes = request.params.notes as number[];
                return notes.map(noteId => noteId === 6101
                    ? {
                        noteId,
                        modelName: 'Core 2k/6k Optimized',
                        tags: [],
                        cards: [6101],
                        fields: {
                            Expression: { value: '私はアンです。' },
                            Reading: { value: 'わたしはアンです。' },
                            'Vocabulary-Kanji': { value: '私' },
                            'Vocabulary-Furigana': { value: 'わたし' },
                            'Vocabulary-English': { value: 'I; me' },
                        },
                    }
                    : {
                        noteId,
                        modelName: 'JlabNote-JlabConverted-1',
                        tags: [],
                        cards: [6201],
                        fields: {
                            'Jlab-Kanji': { value: '始める' },
                            'Jlab-Hiragana': { value: 'はじめる' },
                            'Jlab-Translation': { value: '' },
                            RemarksBack: { value: 'to start' },
                            Source: { value: 'Jlab beginner course' },
                            RemarksFront: { value: 'Read the prompt and choose the answer.' },
                        },
                    });
            }
            const query = String(request.params?.query ?? '');
            const resultByAction: Record<string, unknown> = {
                deckNames: ['Core', 'Jlab'],
                modelNames: ['Core 2k/6k Optimized', 'JlabNote-JlabConverted-1'],
                modelFieldNames: modelName === 'Core 2k/6k Optimized'
                    ? ['Expression', 'Reading', 'Vocabulary-Kanji', 'Vocabulary-Furigana', 'Vocabulary-English']
                    : ['Jlab-Kanji', 'Jlab-Hiragana', 'Jlab-Translation', 'RemarksBack', 'Source', 'RemarksFront'],
                findNotes: query.includes('Core 2k/6k Optimized') ? [6101] : [6201],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const scan = await client.scanLibrary();
            const suggestionsFor = (modelName: string): Record<string, string | null> => Object.fromEntries(
                scan.models.find(model => model.modelName === modelName)?.suggestions.map(suggestion => [suggestion.role, suggestion.fieldName]) ?? [],
            );

            expect(suggestionsFor('Core 2k/6k Optimized')).toMatchObject({
                expression: 'Vocabulary-Kanji',
                reading: 'Vocabulary-Furigana',
                meaning: 'Vocabulary-English',
                sentence: 'Expression',
            });
            expect(suggestionsFor('JlabNote-JlabConverted-1')).toMatchObject({
                expression: 'Jlab-Kanji',
                reading: 'Jlab-Hiragana',
                meaning: 'RemarksBack',
                sentence: null,
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('samples Anki note contents to infer roles for opaque imported fields', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                deckNames: ['Mining'],
                modelNames: ['Opaque Japanese'],
                modelFieldNames: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'],
                findNotes: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125],
                notesInfo: [{
                        noteId: 101,
                        modelName: 'Opaque Japanese',
                        tags: [],
                        fields: {
                            F1: { value: '動画' },
                            F2: { value: 'どうが' },
                            F3: { value: 'video' },
                            F4: { value: 'この動画を見た。' },
                            F5: { value: '[sound:douga.mp3]' },
                            F6: { value: '<img src="douga.jpg">' },
                        },
                        cards: [1001],
                    }, {
                        noteId: 102,
                        modelName: 'Opaque Japanese',
                        tags: [],
                        fields: {
                            F1: { value: '読む' },
                            F2: { value: 'よむ' },
                            F3: { value: 'to read' },
                            F4: { value: '今日は本を読む。' },
                            F5: { value: '[sound:yomu.mp3]' },
                            F6: { value: '<img src="yomu.png">' },
                        },
                        cards: [1002],
                    }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            const scan = await client.scanLibrary();

            expect(scan.suggestedModel?.modelName).toBe('Opaque Japanese');
            expect(scan.suggestedModel?.suggestions).toEqual(expect.arrayContaining([
                { role: 'expression', fieldName: 'F1', confidence: 'high' },
                { role: 'reading', fieldName: 'F2', confidence: 'high' },
                { role: 'meaning', fieldName: 'F3', confidence: 'high' },
                { role: 'sentence', fieldName: 'F4', confidence: 'high' },
                { role: 'audio', fieldName: 'F5', confidence: 'high' },
                { role: 'image', fieldName: 'F6', confidence: 'high' },
            ]));
            expect(requests.find(request => request.action === 'findNotes')?.params).toEqual({ query: 'note:"Opaque Japanese"' });
            expect(requests.find(request => request.action === 'notesInfo')?.params).toEqual({
                notes: [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124],
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses scan-derived opaque Anki mappings for status index coloring', async () => {
        localStorage.clear();
        await deleteAnkiStatusIndexDatabase();
        const requests: TestAnkiConnectRequest[] = [];
        let settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false };
        const opaqueStatusResultByAction: Record<string, unknown> = {
            deckNames: ['Mining'],
            modelNames: ['Opaque Japanese'],
            modelFieldNames: ['F1', 'F2', 'F3', 'F4'],
            notesInfo: [{
                noteId: 101,
                modelName: 'Opaque Japanese',
                tags: [],
                fields: {
                    F1: { value: '動画' },
                    F2: { value: 'どうが' },
                    F3: { value: 'video' },
                    F4: { value: 'この動画を見た。' },
                },
                cards: [1001],
            }],
        };
        const opaqueStatusQueryResults = new Map<string, TestAnkiQueryRoute>([
            ['findCards', { matches: ['deck:*', 'is:due'], result: [1001] }],
            ['findNotes', { matches: ['deck:*', 'Opaque Japanese'], result: [101] }],
        ]);
        const opaqueStatusResult = (request: TestAnkiConnectRequest): unknown => {
            return testAnkiQueryRouteResult(request, opaqueStatusQueryResults)
                ?? opaqueStatusResultByAction[request.action]
                ?? [];
        };
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = parseTestAnkiConnectRequest(data);
                requests.push(request);
                return testAnkiConnectResponse(opaqueStatusResult(request));
            },
        });

        try {
            const client = new AnkiConnectClient(() => settings);
            const scan = await client.scanLibrary();
            settings = {
                ...settings,
                ankiFieldMappings: {
                    'Opaque Japanese': Object.fromEntries(scan.suggestedModel?.suggestions.flatMap(suggestion => (
                        suggestion.fieldName ? [[suggestion.role, suggestion.fieldName] as const] : []
                    )) ?? []),
                },
            };
            await client.rebuildStatusIndex();
            requests.length = 0;
            const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get');
            const getAllSpy = vi.spyOn(IDBObjectStore.prototype, 'getAll')
                .mockImplementation(() => {
                    throw new Error('Scan-derived Anki status lookups should use exact keys, not scan the whole store.');
                });

            try {
                await expect(client.findCachedStatusBatch([{ ...card, spelling: '動画', reading: '' }])).resolves.toMatchObject([{
                    state: 'due',
                    primary: {
                        noteId: 101,
                        primaryCardId: 1001,
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
        } finally {
            localStorage.clear();
            await deleteAnkiStatusIndexDatabase();
            vi.unstubAllGlobals();
        }
    });

    it('adds cards to an existing custom Anki note type without mutating its fields or templates', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                createDeck: null,
                modelNames: ['Imported Japanese'],
                modelFieldNames: ['Vocabulary-Kanji', 'Vocabulary-Kana', 'Glossary', 'SentenceAudio', 'Picture', 'audio'],
                canAddNotes: [true],
                addNote: 88,
                notesInfo: [{
                        noteId: 88,
                        modelName: 'Imported Japanese',
                        tags: [],
                        fields: {
                            'Vocabulary-Kanji': { value: '読む' },
                            'Vocabulary-Kana': { value: 'よむ' },
                            Glossary: { value: 'to read' },
                        },
                        cards: [188],
                    }],
                cardsInfo: [{ cardId: 188, note: 88, deckName: 'Mining', queue: 0, type: 0, reps: 0, lapses: 0 }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: false,
                ankiDeck: 'Mining',
                ankiModel: 'Imported Japanese',
            }));
            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/png;base64,image-data',
            });

            const actions = requests.map(request => request.action);
            const addNote = requests.find(request => request.action === 'addNote')?.params.note as {
                deckName: string;
                modelName: string;
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
                picture?: Array<Record<string, unknown>>;
            };
            expect(actions).not.toContain('modelFieldAdd');
            expect(actions).not.toContain('updateModelTemplates');
            expect(actions).not.toContain('updateModelStyling');
            expect(addNote.deckName).toBe('Mining');
            expect(addNote.modelName).toBe('Imported Japanese');
            expect(addNote.fields['Vocabulary-Kanji']).toBe('読む');
            expect(addNote.fields['Vocabulary-Kana']).toBe('よむ');
            expect(addNote.fields.Glossary).toContain('to read');
            expect(addNote.fields.SentenceAudio).toBe('');
            expect(addNote.fields.Picture).toBe('');
            expect(addNote.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['audio'] });
            expect(addNote.picture?.[0]).toMatchObject({ data: 'image-data', fields: ['Picture'] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('scans and adds cards to alias-heavy imported Anki note types', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                deckNames: ['Mining'],
                modelNames: ['Alias Heavy Japanese'],
                modelFieldNames: ['HeadwordKanji', 'Furigana', 'English', 'Example Sentence', 'Word Audio', 'Sentence Image'],
                createDeck: null,
                canAddNotes: [true],
                addNote: 99,
                notesInfo: [{
                        noteId: 99,
                        modelName: 'Alias Heavy Japanese',
                        tags: [],
                        fields: {
                            HeadwordKanji: { value: '読む' },
                            Furigana: { value: 'よむ' },
                            English: { value: 'to read' },
                        },
                        cards: [199],
                    }],
                cardsInfo: [{ cardId: 199, note: 99, deckName: 'Mining', queue: 0, type: 0, reps: 0, lapses: 0 }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: false,
                ankiDeck: 'Mining',
                ankiModel: 'Alias Heavy Japanese',
            }));
            const scan = await client.scanLibrary();

            expect(scan.suggestedModel?.suggestions).toEqual(expect.arrayContaining([
                { role: 'expression', fieldName: 'HeadwordKanji', confidence: 'high' },
                { role: 'reading', fieldName: 'Furigana', confidence: 'high' },
                { role: 'meaning', fieldName: 'English', confidence: 'high' },
                { role: 'sentence', fieldName: 'Example Sentence', confidence: 'high' },
                { role: 'audio', fieldName: 'Word Audio', confidence: 'high' },
                { role: 'image', fieldName: 'Sentence Image', confidence: 'high' },
            ]));

            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/png;base64,image-data',
            });

            const addNote = requests.find(request => request.action === 'addNote')?.params.note as {
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
                picture?: Array<Record<string, unknown>>;
            };
            expect(addNote.fields.HeadwordKanji).toBe('読む');
            expect(addNote.fields.Furigana).toBe('よむ');
            expect(addNote.fields.English).toContain('to read');
            expect(addNote.fields['Example Sentence']).toContain('yomu-highlight');
            expect(addNote.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Word Audio'] });
            expect(addNote.picture?.[0]).toMatchObject({ data: 'image-data', fields: ['Sentence Image'] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses persisted Anki field mappings when adding to ambiguous custom note types', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                createDeck: null,
                modelNames: ['Ambiguous Japanese'],
                modelFieldNames: ['Front', 'Back', 'Kana Field', 'Sentence Slot', 'Sound Slot', 'Image Slot'],
                canAddNotes: [true],
                addNote: 123,
                notesInfo: [{
                        noteId: 123,
                        modelName: 'Ambiguous Japanese',
                        tags: [],
                        fields: {
                            Back: { value: '読む' },
                            'Kana Field': { value: 'よむ' },
                            Front: { value: 'to read' },
                        },
                        cards: [456],
                    }],
                cardsInfo: [{ cardId: 456, note: 123, deckName: 'Mining', queue: 0, type: 0, reps: 0, lapses: 0 }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: false,
                ankiDeck: 'Mining',
                ankiModel: 'Ambiguous Japanese',
                ankiFieldMappings: {
                    'Ambiguous Japanese': {
                        expression: 'Back',
                        reading: 'Kana Field',
                        meaning: 'Front',
                        sentence: 'Sentence Slot',
                        audio: 'Sound Slot',
                        image: 'Image Slot',
                    },
                },
            }));
            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/png;base64,image-data',
            });

            const addNote = requests.find(request => request.action === 'addNote')?.params.note as {
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
                picture?: Array<Record<string, unknown>>;
            };
            expect(addNote.fields.Back).toBe('読む');
            expect(addNote.fields['Kana Field']).toBe('よむ');
            expect(addNote.fields.Front).toContain('to read');
            expect(addNote.fields['Sentence Slot']).toContain('yomu-highlight');
            expect(addNote.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Sound Slot'] });
            expect(addNote.picture?.[0]).toMatchObject({ data: 'image-data', fields: ['Image Slot'] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('treats a null Anki addNote result as a duplicate instead of a successful add', async () => {
        stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                createDeck: null,
                modelNames: ['よむ Japanese'],
                modelFieldNames: YOMU_MODEL_FIELDS,
                updateModelTemplates: null,
                updateModelStyling: null,
                canAddNotes: [true],
                addNote: null,
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: false }));
            await expect(client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。')).rejects.toThrow('Already in Anki');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('recovers the mining popover when Anki rejects a duplicate note after lookup', async () => {
        const toast = vi.fn();
        const showCard = vi.fn(async () => undefined);
        const findExistingCards = vi.fn(async (): Promise<AnkiLookupResult> => ({ state: 'not-in-deck', notes: [], primary: null }));
        const addCard = vi.fn(async () => {
            throw new AnkiDuplicateNoteError('Already in Anki. Use Edit in Anki instead.');
        });
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiMobileHandoff: false,
            localDictionariesEnabled: false,
            ankiCaptureScreenshot: false,
        };
        const controller = testCardActionController({
            getSettings: () => settings,
            jpdb: {} as unknown as JpdbClient,
            jiten: {} as unknown as JitenApiClient,
            anki: { findExistingCards, addCard } as unknown as AnkiConnectClient,
            dictionaries: {
                lookup: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as unknown as YomitanDictionaryStore,
            isJpdbBackedCard: () => true,
            resolveMiningContext: vi.fn(async (): Promise<MiningContext> => ({
                term: '読む',
                sentence: '今日は本を読む。',
                sourceKind: 'page',
                imageDataUrl: undefined,
                audioDataUrl: undefined,
                sourceTitle: 'Example',
                sourceUrl: 'https://example.test/page',
                updatedAt: 1,
            })),
            showCard,
            getActivePopoverAnchor: () => undefined,
            getActivePopoverMode: () => 'modal',
            showSettings: vi.fn(),
            playAudio: vi.fn(),
            playSentenceAudio: vi.fn(),
            detectGrammarHints: vi.fn(async () => []),
            parsePopoverJapanese: vi.fn(),
            toast,
        });
        await performTestAnkiAdd(controller);

        expect(findExistingCards).toHaveBeenCalledTimes(1);
        expect(addCard).toHaveBeenCalledTimes(1);
        expect(showCard).toHaveBeenCalledWith(expect.objectContaining({ spelling: '読む' }), '今日は本を読む。', undefined, {
            autoPlay: false,
            trigger: 'modal',
            navigation: 'preserve',
            preservePosition: true,
        });
        expect(toast).toHaveBeenCalledWith('Already in Anki. Use Edit in Anki instead.');
        expect(toast).not.toHaveBeenCalledWith('Sent to Anki.');
    });

    it('can attach both word audio and Immersion Kit context audio to Anki notes', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                createDeck: null,
                modelNames: ['よむ Japanese'],
                modelFieldNames: YOMU_MODEL_FIELDS,
                updateModelTemplates: null,
                updateModelStyling: null,
                canAddNotes: [true],
                addNote: 43,
                notesInfo: [{
                    noteId: 43,
                    modelName: 'よむ Japanese',
                    tags: [],
                    fields: {
                        Expression: { value: '読む' },
                        Reading: { value: 'よむ' },
                    },
                    cards: [100],
                }],
                cardsInfo: [{ cardId: 100, note: 43, deckName: 'よむ', queue: 0, type: 0, reps: 0, lapses: 0 }],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient();
            await client.addCard(testReadCard(), '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                audioDataUrl: 'data:audio/ogg;base64,context-audio',
            });

            const addNote = requests.find(request => request.action === 'addNote')?.params.note as { audio?: Array<Record<string, unknown>> };
            expect(addNote.audio).toHaveLength(2);
            expect(addNote.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Audio'] });
            expect(addNote.audio?.[1]).toMatchObject({ data: 'context-audio', fields: ['Audio'] });
            expect(String(addNote.audio?.[0].filename)).toContain('_word_');
            expect(String(addNote.audio?.[1].filename)).toContain('_context_');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('merges Yomu fields and audio into an existing unfamiliar Anki note without changing its model', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                notesInfo: [{
                    noteId: 168,
                    modelName: 'Imported Vocab',
                    tags: [],
                    fields: {
                        Word: { value: '読む' },
                        Readings: { value: '' },
                        Translation_1: { value: '' },
                        Source: { value: '' },
                        audio: { value: '[sound:old.mp3]' },
                    },
                    cards: [167],
                }],
                updateNoteFields: null,
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient();
            const result = await client.mergeYomuData(168, testReadCard(), '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                audioMergeMode: 'both',
                sourceTitle: 'Example article',
                sourceUrl: 'https://example.test/article',
            });

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                id: number;
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
            };
            expect(result.modelName).toBe('Imported Vocab');
            expect(update.id).toBe(168);
            expect(update.fields.Word).toBeUndefined();
            expect(update.fields.Readings).toBe('よむ');
            expect(update.fields.Translation_1).toContain('to read');
            expect(update.fields.Source).toContain('Example article');
            expect(update.audio?.[0]).toMatchObject({
                data: 'word-audio',
                fields: ['audio'],
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('uses persisted Anki field mappings when merging into ambiguous existing notes', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                notesInfo: [{
                    noteId: 170,
                    modelName: 'Ambiguous Japanese',
                    tags: [],
                    fields: {
                        Front: { value: '' },
                        Back: { value: '読む' },
                        'Kana Field': { value: '' },
                        'Sentence Slot': { value: '' },
                        'Sound Slot': { value: '' },
                        'Image Slot': { value: '' },
                    },
                    cards: [1700],
                }],
                updateNoteFields: null,
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient({
                ankiFieldMappings: {
                    'Ambiguous Japanese': {
                        expression: 'Back',
                        reading: 'Kana Field',
                        meaning: 'Front',
                        sentence: 'Sentence Slot',
                        audio: 'Sound Slot',
                        image: 'Image Slot',
                    },
                },
            });
            await client.mergeYomuData(170, testReadCard(), '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/png;base64,image-data',
                audioMergeMode: 'both',
            });

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
                picture?: Array<Record<string, unknown>>;
            };
            expect(update.fields.Back).toBeUndefined();
            expect(update.fields['Kana Field']).toBe('よむ');
            expect(update.fields.Front).toContain('to read');
            expect(update.fields['Sentence Slot']).toContain('yomu-highlight');
            expect(update.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Sound Slot'] });
            expect(update.picture?.[0]).toMatchObject({ data: 'image-data', fields: ['Image Slot'] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('merges Yomu data into alias-heavy existing Anki notes', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                notesInfo: [{
                    noteId: 169,
                    modelName: 'Alias Heavy Japanese',
                    tags: [],
                    fields: {
                        HeadwordKanji: { value: '読む' },
                        Furigana: { value: '' },
                        English: { value: '' },
                        'Example Sentence': { value: '' },
                        'Word Audio': { value: '' },
                        'Sentence Image': { value: '' },
                    },
                    cards: [1690],
                }],
                updateNoteFields: null,
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient();
            await client.mergeYomuData(169, testReadCard(), '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                imageDataUrl: 'data:image/png;base64,image-data',
                audioMergeMode: 'both',
            });

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
                picture?: Array<Record<string, unknown>>;
            };
            expect(update.fields.HeadwordKanji).toBeUndefined();
            expect(update.fields.Furigana).toBe('よむ');
            expect(update.fields.English).toContain('to read');
            expect(update.fields['Example Sentence']).toContain('yomu-highlight');
            expect(update.audio?.[0]).toMatchObject({ data: 'word-audio', fields: ['Word Audio'] });
            expect(update.picture?.[0]).toMatchObject({ data: 'image-data', fields: ['Sentence Image'] });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('lets existing Anki audio win when merging an unfamiliar note', async () => {
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                notesInfo: [{
                    noteId: 168,
                    modelName: 'Imported Vocab',
                    tags: [],
                    fields: {
                        Word: { value: '読む' },
                        audio: { value: '[sound:old.mp3]' },
                    },
                    cards: [167],
                }],
                updateNoteFields: null,
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient();
            await client.mergeYomuData(168, testReadCard(), '今日は本を読む。', {
                wordAudioDataUrl: 'data:audio/mpeg;base64,word-audio',
                audioMergeMode: 'theirs',
            });

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                fields: Record<string, string>;
                audio?: Array<Record<string, unknown>>;
            } | undefined;
            expect(update).toBeUndefined();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('updates existing Anki notes on mobile handoff devices when AnkiConnect is reachable', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                notesInfo: [{
                    noteId: 168,
                    modelName: 'Imported Vocab',
                    tags: [],
                    fields: {
                        Word: { value: '読む' },
                        Reading: { value: '' },
                        Meaning: { value: '' },
                    },
                    cards: [167],
                }],
                updateNoteFields: null,
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = testAnkiClient({ ankiMobileHandoff: true });
            await client.mergeYomuData(168, testReadCard(), '今日は本を読む。');

            const update = requests.find(request => request.action === 'updateNoteFields')?.params.note as {
                fields: Record<string, string>;
            };
            expect(update.fields.Reading).toBe('よむ');
            expect(update.fields.Meaning).toContain('to read');
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('uses promise-style GM object requests for AnkiConnect', async () => {
        vi.stubGlobal('GM', {
            xmlHttpRequest: () => Promise.resolve({
                status: 200,
                response: { result: 6, error: null },
            }),
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));
            await expect(client.isConnected()).resolves.toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('fetches same-origin AnkiConnect directly without requiring the userscript bridge', async () => {
        vi.stubGlobal('location', { href: 'http://127.0.0.1:8765/news/easy/', origin: 'http://127.0.0.1:8765', hostname: '127.0.0.1' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ result: 6, error: null })))));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));

            await expect(client.isConnected()).resolves.toBe(true);
            expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8765', expect.objectContaining({
                method: 'POST',
            }));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not direct-fetch cross-origin AnkiConnect from content pages without the userscript bridge', async () => {
        vi.stubGlobal('location', { href: 'https://www.nhk.or.jp/news/easy/', origin: 'https://www.nhk.or.jp', hostname: 'www.nhk.or.jp' });
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('GM', {});
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ result: 6, error: null })))));

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }));

            await expect(client.isConnected()).resolves.toBe(false);
            expect(fetch).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('opens AnkiMobile addnote URLs with full Yomu fields on iOS handoff', async () => {
        const { locationStub, fetchMock, confirmSpy, restore } = stubMobileAnkiHandoffEnvironment({ userAgent: TEST_IOS_SAFARI_USER_AGENT });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Mobile Deck',
                ankiModel: 'Yomu Japanese',
                ankiTags: 'yomu mobile',
            };
            const client = new AnkiConnectClient(() => settings);
            const noteId = await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
            }, '今日は本を読む。', {
                wordAudioUrl: 'https://media.example.test/yomu/read.mp3',
            });
            const params = new URL(locationStub.href).searchParams;

            expect(noteId).toBeNull();
            expect(fetchMock).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiMobile to add "読む"? This creates a new note only.');
            expect(locationStub.href.startsWith('anki://x-callback-url/addnote?')).toBe(true);
            expect(params.get('type')).toBe('Yomu Japanese');
            // AnkiMobile does not decode '+' as space: spaces must be %20 or
            // the note type arrives as 'Yomu+Japanese' (user-reported error).
            expect(locationStub.href).toContain('type=Yomu%20Japanese');
            expect(locationStub.href).not.toContain('type=Yomu+Japanese');
            expect(params.get('deck')).toBe('Mobile Deck');
            expect(params.get('tags')).toBe('yomu mobile');
            expect(params.get('dupes')).toBeNull();
            expect(params.get('fldExpression')).toBe('読む');
            expect(params.get('fldSentence')).toContain('<span class="yomu-highlight">読む</span>');
            expect(params.get('fldMeaning')).toContain('<div class="yomu-definition">');
            expect(params.get('fldMeaning')).toContain('to read');
            expect(params.get('fldAudio')).toBe('https://media.example.test/yomu/read.mp3');
            expect(params.get('fldImage')).toBeNull();
        } finally {
            restore();
        }
    });

    it('uses Default for built-in Yomu deck names in AnkiMobile handoff URLs', async () => {
        const { locationStub, restore } = stubMobileAnkiHandoffEnvironment({ userAgent: TEST_IPAD_SAFARI_USER_AGENT });

        try {
            for (const ankiDeck of ['よむ', 'Yomu', 'yomu']) {
                const client = new AnkiConnectClient(() => ({
                    ...DEFAULT_SETTINGS,
                    ankiEnabled: true,
                    ankiMobileHandoff: true,
                    ankiDeck,
                    ankiModel: 'Yomu Japanese',
                }));
                await client.addCardViaMobileHandoff({
                    ...card,
                    spelling: '読む',
                    reading: 'よむ',
                    meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
                }, '今日は本を読む。');

                expect(new URL(locationStub.href).searchParams.get('deck')).toBe('Default');
                locationStub.href = 'https://reader.test/article';
            }
        } finally {
            restore();
        }
    });

    it('applies configured field mappings to AnkiMobile handoff URLs', async () => {
        const { locationStub, restore } = stubMobileAnkiHandoffEnvironment({ userAgent: TEST_IOS_SAFARI_USER_AGENT });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Mobile Deck',
                ankiModel: 'Imported Japanese',
                ankiFieldMappings: {
                    'Imported Japanese': {
                        expression: 'Vocab',
                        reading: 'Kana',
                        meaning: 'Definition',
                        sentence: 'Context',
                        audio: 'Sound',
                    },
                },
            };
            const client = new AnkiConnectClient(() => settings);
            await client.addCardViaMobileHandoff({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: ['v5m'] }],
            }, '今日は本を読む。', {
                wordAudioUrl: 'https://media.example.test/yomu/read.mp3',
            });
            const params = new URL(locationStub.href).searchParams;

            expect(params.get('type')).toBe('Imported Japanese');
            expect(params.get('deck')).toBe('Mobile Deck');
            expect(params.get('fldVocab')).toBe('読む');
            expect(params.get('fldKana')).toBe('よむ');
            expect(params.get('fldDefinition')).toContain('to read');
            expect(params.get('fldContext')).toContain('<span class="yomu-highlight">読む</span>');
            expect(params.get('fldSound')).toBe('https://media.example.test/yomu/read.mp3');
        } finally {
            restore();
        }
    });

    it('adds cards through AnkiConnect on mobile handoff devices when a bridge is reachable', async () => {
        const { confirmSpy, restore } = stubMobileAnkiHandoffEnvironment({ userAgent: TEST_ANDROID_CHROME_USER_AGENT, stubFetch: false });
        const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params: Record<string, unknown> };
                requests.push(request);
                const resultByAction: Record<string, unknown> = {
                    createDeck: null,
                    modelNames: [],
                    createModel: null,
                    canAddNotes: [true],
                    addNote: 12345,
                };
                return Promise.resolve({ status: 200, response: { result: resultByAction[request.action] ?? null, error: null } });
            },
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Bridge Deck',
                ankiModel: 'Bridge Japanese',
            };
            const client = new AnkiConnectClient(() => settings);

            await expect(client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。')).resolves.toBe(12345);

            expect(requests.map(request => request.action)).toContain('addNote');
            expect(confirmSpy).not.toHaveBeenCalled();
        } finally {
            restore();
        }
    });

    it('opens mobile Anki handoff from card actions without waiting on hosted detail providers', async () => {
        const { locationStub, fetchMock, confirmSpy, restore } = stubMobileAnkiHandoffEnvironment({
            userAgent: TEST_IOS_SAFARI_USER_AGENT,
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/',
        });
        const toast = vi.fn();
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiMobileHandoff: true,
            ankiDeck: 'Mobile Deck',
            ankiModel: 'Yomu Japanese',
        };
        const dictionaries = {
            lookup: vi.fn(() => Promise.reject(new Error('local terms should not be queried'))),
            lookupKanji: vi.fn(() => Promise.reject(new Error('local kanji should not be queried'))),
            lookupTermMeta: vi.fn(() => Promise.reject(new Error('local metadata should not be queried'))),
        };
        const resolveMiningContext = vi.fn(() => Promise.reject(new Error('mining context should not be resolved')));

        try {
            const anki = new AnkiConnectClient(() => settings);
            const findExistingCards = vi.spyOn(anki, 'findExistingCards');
            const addCard = vi.spyOn(anki, 'addCard');
            const addCardViaMobileHandoff = vi.spyOn(anki, 'addCardViaMobileHandoff');
            const controller = testCardActionController({
                getSettings: () => settings,
                jpdb: {} as JpdbClient,
                jiten: {} as unknown as JitenApiClient,
                anki,
                dictionaries: dictionaries as unknown as YomitanDictionaryStore,
                isJpdbBackedCard: () => true,
                resolveMiningContext,
                showCard: vi.fn(async () => undefined),
                getActivePopoverAnchor: () => undefined,
                getActivePopoverMode: () => undefined,
                showSettings: vi.fn(),
                playAudio: vi.fn(async () => undefined),
                playSentenceAudio: vi.fn(async () => undefined),
                detectGrammarHints: vi.fn(async () => []),
                parsePopoverJapanese: vi.fn(),
                toast,
            });
            await performTestAnkiAdd(controller);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(findExistingCards).not.toHaveBeenCalled();
            expect(addCard).not.toHaveBeenCalled();
            expect(addCardViaMobileHandoff).toHaveBeenCalledOnce();
            expect(dictionaries.lookup).not.toHaveBeenCalled();
            expect(dictionaries.lookupKanji).not.toHaveBeenCalled();
            expect(dictionaries.lookupTermMeta).not.toHaveBeenCalled();
            expect(resolveMiningContext).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiMobile to add "読む"? This creates a new note only.');
            expect(locationStub.href.startsWith('anki://x-callback-url/addnote?')).toBe(true);
            expect(new URL(locationStub.href).searchParams.get('deck')).toBe('Mobile Deck');
            expect(toast).toHaveBeenCalledWith('Opened Anki handoff. Continue in Anki.');
        } finally {
            restore();
        }
    });

    it('uses AnkiMobile handoff on iPadOS desktop-mode Safari', async () => {
        const { locationStub, fetchMock, confirmSpy, restore } = stubMobileAnkiHandoffEnvironment({
            userAgent: TEST_IPADOS_DESKTOP_SAFARI_USER_AGENT,
            platform: 'MacIntel',
            maxTouchPoints: 5,
        });

        try {
            const client = new AnkiConnectClient(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Mobile Deck',
                ankiModel: 'Yomu Japanese',
            }));
            await client.addCard({
                ...card,
                spelling: '月光',
                reading: 'げっこう',
                meanings: [{ glosses: ['moonlight'], partOfSpeech: [] }],
            }, '月光が水面を照らした。');

            expect(fetchMock).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiMobile to add "月光"? This creates a new note only.');
            expect(locationStub.href.startsWith('anki://x-callback-url/addnote?')).toBe(true);
        } finally {
            restore();
        }
    });

    it('opens AnkiDroid ACTION_SEND intent handoff on Android without using AnkiConnect', async () => {
        const { locationStub, fetchMock, confirmSpy, restore } = stubMobileAnkiHandoffEnvironment({ userAgent: TEST_ANDROID_CHROME_USER_AGENT });

        try {
            const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true };
            const client = new AnkiConnectClient(() => settings);
            await client.addCard({
                ...card,
                spelling: '読む',
                reading: 'よむ',
                meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            }, '今日は本を読む。');
            const textMatch = /S\.android\.intent\.extra\.TEXT=([^;]*)/.exec(locationStub.href);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(confirmSpy).toHaveBeenCalledWith('Open AnkiDroid to add "読む"? This creates a new note only.');
            expect(locationStub.href).toContain('intent:#Intent;action=android.intent.action.SEND;type=text/plain;package=com.ichi2.anki');
            expect(locationStub.href).toContain('S.android.intent.extra.SUBJECT=%E8%AA%AD%E3%82%80');
            expect(locationStub.href).toContain('S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.ichi2.anki');
            expect(textMatch).not.toBeNull();
            expect(decodeURIComponent(textMatch?.[1] ?? '')).toContain('よむ');
            expect(decodeURIComponent(textMatch?.[1] ?? '')).toContain('to read');
            expect(decodeURIComponent(textMatch?.[1] ?? '')).not.toContain('<div');
        } finally {
            restore();
        }
    });

    it('uses AnkiConnect existing-card lookups when mobile handoff is active and a bridge is reachable', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const requests = stubTestAnkiConnectResults(request => {
            const resultByAction: Record<string, unknown> = {
                multi: [
                    { result: [55], error: null },
                    { result: [55], error: null },
                ],
                notesInfo: [{
                    noteId: 55,
                    modelName: 'Imported Core',
                    tags: [],
                    fields: {
                        Word: { value: '読む' },
                        Reading: { value: 'よむ' },
                    },
                    cards: [7701],
                }],
                cardsInfo: [{ cardId: 7701, note: 55, deckName: 'Mobile Bridge', queue: 2, type: 2, reps: 8, lapses: 0 }],
                areDue: [false],
            };
            return resultByAction[request.action] ?? null;
        });

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true }));
            await expect(client.findExistingCards({ ...card, spelling: '読む', reading: 'よむ' })).resolves.toMatchObject({
                state: 'known',
                primary: {
                    noteId: 55,
                    primaryCardId: 7701,
                },
            });
            expect(requests.map(request => request.action)).toEqual(expect.arrayContaining(['multi', 'notesInfo', 'cardsInfo', 'areDue']));
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('attempts existing-card AnkiConnect lookups on iPadOS desktop-mode Safari', async () => {
        const originalUserAgent = navigator.userAgent;
        const originalPlatform = navigator.platform;
        const originalMaxTouchPoints = navigator.maxTouchPoints;
        const originalLocation = window.location;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            configurable: true,
        });
        Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
        Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('http://127.0.0.1:8765/yomu-reader/') as unknown as Location,
        });
        const fetchMock = vi.fn(() => Promise.reject(new Error('Failed to fetch')));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const client = new AnkiConnectClient(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, ankiMobileHandoff: true }));
            await expect(client.findExistingCards(card)).resolves.toEqual({ state: 'not-in-deck', notes: [], primary: null });
            expect(fetchMock).toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            Object.defineProperty(window.navigator, 'platform', { value: originalPlatform, configurable: true });
            Object.defineProperty(window.navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
            vi.unstubAllGlobals();
        }
    });

    it('finds local dictionary terms in text for JPDB-free parsing', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: '青空', reading: 'あおぞら', glossary: ['blue sky'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [2, { expression: '空', reading: 'そら', glossary: ['sky'], score: 2, dictionary: 'Jitendex' }] },
                        ],
                    },
                ],
            },
        })], 'local-terms.json', { type: 'application/json' });

        await store.importFile(file);
        const text = `${'これは長い前置きです'.repeat(18)}。青空を見る。`;
        const matches = await store.findTermMatches(text, 5);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ surface: '青空', start: text.indexOf('青空'), end: text.indexOf('青空') + 2 });
    });

    it('prefers the longest local dictionary reading match over shorter overlaps', async () => {
        const store = new YomitanDictionaryStore();
        await store.clear();
        const file = new File([JSON.stringify({
            formatName: 'dexie',
            data: {
                data: [
                    {
                        tableName: 'terms',
                        rows: [
                            { $: [1, { expression: 'や', reading: 'や', glossary: ['and'], score: 10, dictionary: 'Jitendex' }] },
                            { $: [2, { expression: '優しい', reading: 'やさしい', rules: 'adj-i', glossary: ['kind'], score: 10, dictionary: 'Jitendex' }] },
                        ],
                    },
                ],
            },
        })], 'local-terms.json', { type: 'application/json' });

        await store.importFile(file);
        const matches = await store.findTermMatches('やさしいことば', 5);

        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ surface: 'やさしい', start: 0, end: 4 });
        expect(matches[0].entry.expression).toBe('優しい');
    });

});
