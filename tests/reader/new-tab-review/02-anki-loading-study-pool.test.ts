import { describe, expect, it, vi } from 'vitest';
import {
    registerNewTabReviewCleanup,
    DEFAULT_SETTINGS,
    NEW_TAB_CACHE_KEY,
    newTabTestCard,
    newTabPromptController,
    renderEnabledNewTabRoot,
    expectOpaqueStudyCardToken,
    newTabBareController,
    newTabLocalDictionarySummary,
    stubAnkiConnectFetch,
    stubPagedAnkiCandidateFetch,
    stubAnkiDeckSearch,
    newTabAnkiClient,
    seedNewTabState,
    newTabPromptText,
    revealNewTabStudyCard,
    newTabSourceSelect,
    applySeededNewTabWords,
    newTabLiveKanjiStatus,
    newTabLiveVocabularyStatus,
    newTabLiveReviewController,
    renderLoadedLiveReviewFixture,
    renderNewTabKanjiFront,
    stubKanjiDoodleBrowserApis,
    AnkiConnectClient,
    AnkiNewTabUnavailableError,
    listNewTabAnkiCards,
    cardKey,
    NewTabController,
    selectNewTabStudyPool,
    BASE_DEFAULT_SETTINGS,
} from './fixtures';
import type {
    JPDBCard,
} from './fixtures';

describe('new tab review — Anki loading & study-pool ordering', () => {
    registerNewTabReviewCleanup();


    it('loads Anki due and new cards through AnkiConnect even when Anki mining is off', async () => {
        const actions: string[] = [];
        stubAnkiConnectFetch(request => {
            actions.push(request.action);
            if (request.action === 'findCards') return [101, 102, 103];
            if (request.action === 'areDue') return [true, false, true];
            if (request.action === 'getDeckConfig') return { new: { delays: [1, 10], ints: [1, 4] } };
            if (request.action === 'cardsInfo') return [
                { cardId: 101, note: 1, deckName: 'Yomu', queue: 2, type: 2, due: 0 },
                { cardId: 102, note: 2, deckName: 'Yomu', queue: 2, type: 2, due: 99 },
                { cardId: 103, note: 3, deckName: 'Yomu', queue: 0, type: 0, due: 0 },
            ];
            if (request.action === 'notesInfo') return [
                {
                    noteId: 1,
                    modelName: 'Yomu Japanese',
                    tags: [],
                    cards: [101],
                    fields: {
                        Expression: { value: '読む' },
                        Reading: { value: 'よむ' },
                        Meaning: { value: 'to read' },
                        Sentence: { value: '本を読む。' },
                    },
                },
                {
                    noteId: 3,
                    modelName: 'Yomu Japanese',
                    tags: [],
                    cards: [103],
                    fields: {
                        Expression: { value: '書く' },
                        Reading: { value: 'かく' },
                        Meaning: { value: 'to write' },
                        Sentence: { value: '名前を書く。' },
                    },
                },
            ];
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
            ankiModel: '',
        });
        const cards = await listNewTabAnkiCards(client, settings, 10);

        // getDeckConfig: 0.6.110 fetches the deck's learning steps once per
        // distinct deck to preview new-card due-ins.
        // UT-50: getDecks pre-filters candidates before the costly cardsInfo render.
        expect(actions).toEqual(['version', 'deckNames', 'findCards', 'areDue', 'getDecks', 'cardsInfo', 'getDeckConfig', 'notesInfo', 'findCards', 'getDecks', 'cardsInfo', 'getDeckConfig', 'notesInfo']);
        expect(cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(cards[0].ankiCardId).toBe(101);
        expect(cards[0].sentence).toBe('本を読む。');
    });

    it('reports unavailable AnkiConnect distinctly from an empty new-tab review queue', async () => {
        const fetchMock = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        vi.stubGlobal('fetch', fetchMock);

        const { settings, client } = newTabAnkiClient({
            ankiConnectUrl: window.location.origin,
            ankiModel: '',
        });

        await expect(listNewTabAnkiCards(client, settings, 10)).rejects.toBeInstanceOf(AnkiNewTabUnavailableError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('searches every Anki deck returned by AnkiConnect for new-tab reviews', async () => {
        const queries = stubAnkiDeckSearch(['Yomu', 'Yomu::Anime', 'Yomu Mining', 'Other']);
        const { settings, client } = newTabAnkiClient();

        await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);

        expect(queries).toHaveLength(4);
        expect(queries[0]).toContain('(deck:"Yomu" OR deck:"Yomu::Anime" OR deck:"Yomu Mining" OR deck:"Other")');
        expect(queries[0]).not.toContain('note:"Yomu Japanese"');
        expect(queries[0]).toContain('(is:due OR is:learn)');
        expect(queries[1]).toContain('note:"Yomu Japanese"');
        expect(queries[1]).toContain('(is:due OR is:learn)');
        expect(queries[2]).not.toContain('note:"Yomu Japanese"');
        expect(queries[2]).toContain('is:new');
        expect(queries[3]).toContain('note:"Yomu Japanese"');
        expect(queries[3]).toContain('is:new');
    });

    it('skips disabled Anki decks when loading new-tab reviews', async () => {
        const queries = stubAnkiDeckSearch(['Mining', 'Archive', 'Japanese', 'Japanese::Old', 'Japanese::New']);
        const { settings, client } = newTabAnkiClient({
            ankiDeck: 'Mining',
            ankiModel: '',
            newTabAnkiDisabledDecks: ['Archive', 'Japanese'],
        });

        await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);

        expect(queries[0]).toContain('deck:"Mining"');
        expect(queries[0]).not.toContain('Archive');
        expect(queries[0]).not.toContain('deck:"Japanese"');
        expect(queries[0]).not.toContain('Japanese::Old');
        expect(queries[0]).not.toContain('Japanese::New');
    });

    it('treats the Anki all-decks selector value as the whole enabled collection', async () => {
        const queries = stubAnkiDeckSearch(['Core', 'Mining']);
        const { settings, client } = newTabAnkiClient({
            ankiDeck: 'Mining',
            ankiModel: '',
        });

        await expect(listNewTabAnkiCards(client, settings, 10, 'all')).resolves.toEqual([]);

        expect(queries[0]).toContain('deck:"Core"');
        expect(queries[0]).toContain('deck:"Mining"');
        expect(queries[0]).not.toContain('deck:"all"');
    });

    it('filters disabled Anki subdeck cards returned by a parent deck search', async () => {
        stubAnkiConnectFetch((request, { query, cards, notes }) => {
            if (request.action === 'deckNames') return ['Mining', 'Mining::Old', 'Core'];
            if (request.action === 'findCards') return query.includes('is:new') ? [] : [201, 202, 203];
            if (request.action === 'areDue') return cards.map(() => true);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: cardId,
                deckName: cardId === 201 ? 'Mining::Old' : cardId === 202 ? 'Core' : 'Mining',
                queue: 2,
                type: 2,
                due: cardId,
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => ({
                noteId,
                modelName: 'Yomu Japanese',
                tags: [],
                cards: [noteId],
                fields: {
                    Expression: { value: noteId === 202 ? '順番' : noteId === 203 ? '採掘' : '古い' },
                    Reading: { value: noteId === 202 ? 'じゅんばん' : noteId === 203 ? 'さいくつ' : 'ふるい' },
                    Meaning: { value: noteId === 202 ? 'order' : noteId === 203 ? 'mining' : 'old' },
                },
            }));
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
            ankiDeck: 'Mining',
            ankiModel: '',
            newTabAnkiDisabledDecks: ['Mining::Old'],
        });

        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(cards.map(card => card.spelling)).toEqual(['順番', '採掘']);
        expect(cards.map(card => card.ankiDeckNames)).toEqual([['Core'], ['Mining']]);
    });

    it('does not query all Anki decks when every discovered deck is disabled', async () => {
        const queries = stubAnkiDeckSearch(['Mining', 'Archive'], () => [1, 2, 3]);
        const { settings, client } = newTabAnkiClient({
            ankiDeck: 'Mining',
            ankiModel: '',
            newTabAnkiDisabledDecks: ['Mining', 'Archive'],
        });

        await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);

        expect(queries).toEqual([]);
    });

    it('does not query a fallback Anki subdeck when its parent deck is disabled', async () => {
        const queries = stubAnkiDeckSearch([], () => [1, 2, 3]);
        const { settings, client } = newTabAnkiClient({
            ankiDeck: 'Japanese::Mining',
            ankiModel: '',
            newTabAnkiDisabledDecks: ['Japanese'],
        });

        await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);

        expect(queries).toEqual([]);
    });

    it('respects Anki due timing before filling with new cards', async () => {
        stubAnkiConnectFetch((request, { query, cards, notes }) => {
            if (request.action === 'deckNames') return ['Yomu'];
            if (request.action === 'findCards') return query.includes('is:new') ? [203] : [201, 202];
            if (request.action === 'areDue') return cards.map(cardId => cardId === 201);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: cardId,
                deckName: 'Yomu',
                queue: cardId === 203 ? 0 : 2,
                type: cardId === 203 ? 0 : 2,
                due: cardId === 201 ? 1 : 9999999999,
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => ({
                noteId,
                modelName: 'Yomu Japanese',
                tags: [],
                cards: [noteId],
                fields: {
                    Expression: { value: noteId === 201 ? '期限' : noteId === 203 ? '新規' : '未来' },
                    Reading: { value: noteId === 201 ? 'きげん' : noteId === 203 ? 'しんき' : 'みらい' },
                    Meaning: { value: noteId === 201 ? 'due' : noteId === 203 ? 'new' : 'future' },
                },
            }));
            return [];
        });

        const { settings, client } = newTabAnkiClient();

        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(cards.map(card => card.spelling)).toEqual(['期限', '新規']);
        expect(cards.map(card => card.cardState[0])).toEqual(['due', 'new']);
    });

    it('does not query AnkiConnect for new-tab Anki cards when the new-tab Anki toggle is off', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
            newTabAnkiEnabled: false,
        });

        await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sorts mixed Anki new-tab queues from cardsInfo before filling with new cards', async () => {
        const cardStateById = new Map([
            [301, { queue: 0, type: 0, due: 20 }],
            [302, { queue: 2, type: 2, due: 10 }],
            [303, { queue: 1, type: 1, due: 5 }],
            [304, { queue: 2, type: 2, due: 20 }],
            [305, { queue: 2, type: 2, due: 2 }],
        ]);
        const noteFieldsById = new Map([
            [301, { Expression: { value: '書く' }, Reading: { value: 'かく' }, Meaning: { value: 'to write' } }],
            [302, { Expression: { value: '読む' }, Reading: { value: 'よむ' }, Meaning: { value: 'to read' } }],
            [303, { Expression: { value: '学ぶ' }, Reading: { value: 'まなぶ' }, Meaning: { value: 'to learn' } }],
            [304, { Expression: { value: '書く' }, Reading: { value: 'かく' }, Meaning: { value: 'to write' } }],
            [305, { Expression: { value: '返す' }, Reading: { value: 'かえす' }, Meaning: { value: 'to return' } }],
        ]);
        stubAnkiConnectFetch((request, { query, cards, notes }) => {
            if (request.action === 'findCards') return query.includes('is:new') ? [301] : [303, 302, 305, 304];
            if (request.action === 'areDue') return cards.map(cardId => cardId === 302 || cardId === 305);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: cardId,
                deckName: 'Yomu',
                ...cardStateById.get(cardId),
            }));
            if (request.action === 'notesInfo') return [...notes].reverse().map(noteId => ({
                noteId,
                modelName: 'Yomu Japanese',
                tags: [],
                cards: [noteId],
                fields: noteFieldsById.get(noteId),
            }));
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
        });
        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(cards.map(card => card.ankiCardId)).toEqual([305, 302, 303, 301]);
        expect(cards.map(card => card.spelling)).toEqual(['返す', '読む', '学ぶ', '書く']);
        expect(cards.map(card => card.cardState[0])).toEqual(['due', 'due', 'learning', 'new']);
    });

    it('keeps multiple queued Anki cards from the same note', async () => {
        stubAnkiConnectFetch((request, { cards, notes }) => {
            if (request.action === 'deckNames') return ['Yomu'];
            if (request.action === 'findCards') return [401, 402];
            if (request.action === 'areDue') return cards.map(() => true);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: 41,
                deckName: 'Yomu',
                queue: 2,
                type: 2,
                due: cardId === 401 ? 1 : 2,
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => ({
                noteId,
                modelName: 'Yomu Japanese',
                tags: [],
                cards: [401, 402],
                fields: {
                    Expression: { value: '重複' },
                    Reading: { value: 'じゅうふく' },
                    Meaning: { value: 'duplicate' },
                },
            }));
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
        });
        const cards = await listNewTabAnkiCards(client, settings, 2);

        expect(cards.map(card => card.ankiCardId)).toEqual([401, 402]);
        expect(cards.map(card => card.spelling)).toEqual(['重複', '重複']);
        expect(new Set(cards.map(cardKey)).size).toBe(2);
    });

    it('over-fetches a bounded Anki candidate window to find usable new-tab cards', async () => {
        const ids = Array.from({ length: 260 }, (_, index) => index + 1);
        const { cardInfoBatchSizes, noteInfoBatchSizes } = stubPagedAnkiCandidateFetch(ids, noteId => ({
            modelName: 'Yomu Japanese',
            fields: noteId === 3
                ? {
                    Expression: { value: '突破' },
                    Reading: { value: 'とっぱ' },
                    Meaning: { value: 'breakthrough' },
                }
                : {},
        }));

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
        });
        const cards = await listNewTabAnkiCards(client, settings, 1);

        expect(cards.map(card => card.spelling)).toEqual(['突破']);
        expect(cardInfoBatchSizes).toEqual([24]);
        expect(noteInfoBatchSizes).toEqual([24]);
    });

    it('extracts Anki new-tab cards from alias-heavy imported note fields', async () => {
        stubAnkiConnectFetch((request, { cards, notes }) => {
            if (request.action === 'deckNames') return ['Imported'];
            if (request.action === 'findCards') return [501];
            if (request.action === 'areDue') return cards.map(() => true);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: cardId,
                deckName: 'Imported',
                queue: 2,
                type: 2,
                due: 1,
                reps: 6,
                lapses: 1,
                buttons: [1, 2, 3],
                nextReviews: ['1m', '10m', '4.1y'],
                question: '<div>読む</div>',
                answer: '<div>to read</div>',
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => ({
                noteId,
                modelName: 'Alias Heavy Japanese',
                tags: [],
                cards: [noteId],
                fields: {
                    HeadwordKanji: { value: '読む' },
                    Furigana: { value: 'よむ' },
                    English: { value: 'to read' },
                    'Example Sentence': { value: '今日は本を読む。' },
                    'Word Audio': { value: '[sound:yomu-read.mp3]' },
                },
            }));
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
            ankiDeck: 'Imported',
            ankiModel: 'Alias Heavy Japanese',
        });
        const cards = await listNewTabAnkiCards(client, settings, 1);

        expect(cards[0]).toMatchObject({
            spelling: '読む',
            reading: 'よむ',
            sentence: '今日は本を読む。',
            reviewSource: 'anki',
            ankiDeckNames: ['Imported'],
            ankiModelName: 'Alias Heavy Japanese',
            ankiReps: 6,
            ankiLapses: 1,
            reviewGradeIntervals: {
                nothing: { label: 'Again 1m', source: 'anki-next-reviews' },
                hard: { label: 'Good 10m', source: 'anki-next-reviews' },
                okay: { label: 'Easy 4.1y', source: 'anki-next-reviews' },
            },
        });
        expect(cards[0]?.meanings[0]?.glosses).toEqual(['to read']);
        expect(cards[0]?.ankiRenderedCards?.[0]).toMatchObject({ cardId: 501, deckName: 'Imported' });
        expect(cards[0]?.ankiAudioFilenames).toEqual(['yomu-read.mp3']);
    });

    it('adapts Core, Jlab, RRTK, and kana note shapes for Anki new-tab reviews', async () => {
        stubAnkiConnectFetch((request, { cards, notes }) => {
            if (request.action === 'version') return 6;
            if (request.action === 'deckNames') return ['Core', 'Jlab', 'RRTK', 'Kana'];
            if (request.action === 'findCards') return [6101, 6201, 6301, 6401];
            if (request.action === 'areDue') return cards.map(() => true);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: cardId,
                deckName: cardId === 6101 ? 'Core' : cardId === 6201 ? 'Jlab' : cardId === 6301 ? 'RRTK' : 'Kana',
                queue: 2,
                type: 2,
                due: cardId,
                reps: 3,
                lapses: 0,
                question: '<div>front</div>',
                answer: '<div>back</div>',
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => {
                if (noteId === 6101) {
                    return {
                        noteId,
                        modelName: 'Japanese',
                        tags: [],
                        cards: [noteId],
                        fields: {
                            Expression: { value: '私はアンです。' },
                            Reading: { value: 'わたしはあんです。' },
                            'Vocabulary-Kanji': { value: '私' },
                            'Vocabulary-Furigana': { value: 'わたし' },
                            'Vocabulary-English': { value: 'I; me' },
                        },
                    };
                }
                if (noteId === 6201) {
                    return {
                        noteId,
                        modelName: 'JlabNote-JlabConverted-1',
                        tags: [],
                        cards: [noteId],
                        fields: {
                            'Jlab-Kanji': { value: '始める' },
                            'Jlab-Hiragana': { value: 'はじめる' },
                            'Jlab-Translation': { value: '' },
                            RemarksBack: { value: 'to start' },
                        },
                    };
                }
                if (noteId === 6301) return {
                    noteId,
                    modelName: 'Heisig 書き方-28680',
                    tags: [],
                    cards: [noteId],
                    fields: {
                        Kanji: { value: '一' },
                        On: { value: 'イチ' },
                        Kun: { value: 'ひと' },
                        Keyword: { value: 'one' },
                        'Heisig Number': { value: '1' },
                    },
                };
                return {
                    noteId,
                    modelName: 'Kana Drill',
                    tags: [],
                    cards: [noteId],
                    fields: {
                        Katakana: { value: 'カ' },
                        Hiragana: { value: 'か' },
                        Mnemonic: { value: 'katakana ka' },
                        Audio: { value: '[sound:ka.mp3]' },
                    },
                };
            });
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
            ankiDeck: '',
            ankiModel: '',
        });
        const cards = await listNewTabAnkiCards(client, settings, 4);

        expect(cards.map(card => card.spelling)).toEqual(['私', '始める', '一', 'カ']);
        expect(cards.map(card => card.reading)).toEqual(['わたし', 'はじめる', 'イチ', 'か']);
        expect(cards.map(card => card.meanings[0]?.glosses)).toEqual([['I', 'me'], ['to start'], ['one'], ['katakana ka']]);
        expect(cards.map(card => card.ankiDeckNames?.[0])).toEqual(['Core', 'Jlab', 'RRTK', 'Kana']);
        expect(cards.map(card => card.ankiCardKind)).toEqual(['word', 'word', 'kanji', 'kana']);
    });

    it('keeps paging Anki candidates when early cards cannot be adapted for reviews', async () => {
        const ids = Array.from({ length: 90 }, (_, index) => index + 1);
        const { cardInfoBatchSizes, noteInfoBatchSizes } = stubPagedAnkiCandidateFetch(ids, noteId => ({
            modelName: 'Imported Japanese',
            fields: noteId === 40
                ? {
                    Front: { value: '後続' },
                    Back: { value: 'later queue item' },
                }
                : {
                    Front: { value: '' },
                    Back: { value: 'not Japanese' },
                },
        }));

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
        });
        const cards = await listNewTabAnkiCards(client, settings, 1);

        expect(cards.map(card => card.spelling)).toEqual(['後続']);
        // UT-50: cardsInfo streams in 40-card chunks and stops as soon as
        // enough reviewable cards are found — the second window's tail chunk
        // is never rendered.
        expect(cardInfoBatchSizes).toEqual([24, 40]);
        expect(noteInfoBatchSizes).toEqual([24, 40]);
    });

    it('uses broad Anki due queue across configured and imported note types', async () => {
        const queries: string[] = [];
        stubAnkiConnectFetch((request, { query, cards, notes }) => {
            if (request.action === 'deckNames') return ['Yomu', 'Imported'];
            if (request.action === 'findCards') {
                queries.push(query);
                if (query.includes('is:new')) return [];
                return query.includes('note:"Yomu Japanese"') ? [101] : [101, 202];
            }
            if (request.action === 'areDue') return cards.map(() => true);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: cardId,
                deckName: cardId === 101 ? 'Yomu' : 'Imported',
                queue: 2,
                type: 2,
                due: cardId === 202 ? 1 : 10,
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => ({
                noteId,
                modelName: noteId === 101 ? 'Yomu Japanese' : 'Imported Japanese',
                tags: [],
                cards: [noteId],
                fields: noteId === 101
                    ? {
                        Expression: { value: '限定' },
                        Reading: { value: 'げんてい' },
                        Meaning: { value: 'limited' },
                    }
                    : {
                        Front: { value: '外部' },
                        Back: { value: 'external' },
                    },
            }));
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
        });
        const cards = await listNewTabAnkiCards(client, settings, 2);

        expect(cards.map(card => card.spelling)).toEqual(['外部', '限定']);
        expect(queries).toEqual([
            '(deck:"Yomu" OR deck:"Imported") -is:suspended (is:due OR is:learn)',
        ]);
    });

    it('uses scanned Anki field mappings when adapting opaque new-tab review cards', async () => {
        stubAnkiConnectFetch((request, { query, cards, notes }) => {
            if (request.action === 'deckNames') return ['Imported'];
            if (request.action === 'findCards') return query.includes('is:new') ? [] : [501];
            if (request.action === 'areDue') return cards.map(() => true);
            if (request.action === 'cardsInfo') return cards.map(cardId => ({
                cardId,
                note: 901,
                deckName: 'Imported',
                queue: 2,
                type: 2,
                due: 99,
                reps: 8,
                lapses: 1,
            }));
            if (request.action === 'notesInfo') return notes.map(noteId => ({
                noteId,
                modelName: 'Opaque Mining',
                tags: [],
                cards: [501],
                fields: {
                    F1: { value: '語彙' },
                    F2: { value: 'ごい' },
                    F3: { value: 'vocabulary' },
                    F4: { value: '語彙を増やす。' },
                },
            }));
            return null;
        });

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            ankiConnectUrl: `${window.location.origin}/anki-connect`,
            ankiDeck: 'Imported',
            ankiModel: '',
            ankiFieldMappings: {
                'Opaque Mining': {
                    expression: 'F1',
                    reading: 'F2',
                    meaning: 'F3',
                    sentence: 'F4',
                },
            },
        };
        const client = new AnkiConnectClient(() => settings);
        const cards = await listNewTabAnkiCards(client, settings, 1);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toMatchObject({
            spelling: '語彙',
            reading: 'ごい',
            sentence: '語彙を増やす。',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 501,
            ankiModelName: 'Opaque Mining',
        });
        expect(cards[0]?.meanings[0]?.glosses).toEqual(['vocabulary']);
    });

    it('loads new-tab Anki cards on mobile handoff devices when AnkiConnect is reachable', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const actions: string[] = [];
        vi.stubGlobal('GM', {
            xmlHttpRequest: ({ data }: { data: string }) => {
                const request = JSON.parse(data) as { action: string; params?: Record<string, unknown> };
                actions.push(request.action);
                const query = String(request.params?.query ?? '');
                const result = (() => {
                    if (request.action === 'version') return 6;
                    if (request.action === 'deckNames') return ['Yomu'];
                    if (request.action === 'findCards') return query.includes('is:due') || query.includes('is:learn') ? [101] : [];
                    if (request.action === 'areDue') return [true];
                    if (request.action === 'cardsInfo') return [{ cardId: 101, note: 501, deckName: 'Yomu', queue: 2, type: 2, reps: 4, lapses: 0 }];
                    if (request.action === 'notesInfo') return [{
                        noteId: 501,
                        modelName: 'Yomu Japanese',
                        fields: {
                            Expression: { value: '読む' },
                            Reading: { value: 'よむ' },
                            Meaning: { value: 'to read' },
                        },
                        cards: [101],
                    }];
                    return null;
                })();
                return Promise.resolve({ status: 200, response: { result, error: null } });
            },
        });

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Yomu',
                ankiModel: 'Yomu Japanese',
            };
            const client = new AnkiConnectClient(() => settings);

            await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toMatchObject([{
                spelling: '読む',
                reading: 'よむ',
                reviewSource: 'anki',
                ankiCardId: 101,
            }]);
            expect(actions).toContain('version');
            expect(actions).toContain('deckNames');
            expect(actions).toContain('findCards');
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
            vi.unstubAllGlobals();
        }
    });

    it('keeps JPDB and Anki study cards in the same new tab pool', () => {
        const card = (spelling: string, state: JPDBCard['cardState'][number], source: JPDBCard['source']): JPDBCard => ({
            vid: spelling.charCodeAt(0),
            sid: 1,
            rid: 1,
            spelling,
            reading: spelling,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: [spelling], partOfSpeech: [] }],
            cardState: [state],
            pitchAccent: [],
            wordWithReading: null,
            source,
        });

        const pool = selectNewTabStudyPool([
            card('新規', 'new', 'jpdb'),
            card('失敗', 'failed', 'jpdb'),
            card('アンキ新規', 'new', 'anki'),
            card('復習', 'due', 'anki'),
        ]);

        expect(pool.map(item => item.spelling)).toEqual(['新規', '失敗', 'アンキ新規', '復習']);
        expect(selectNewTabStudyPool([
            card('新規', 'new', 'jpdb'),
            card('アンキ新規', 'new', 'anki'),
        ]).map(item => item.spelling)).toEqual(['新規', 'アンキ新規']);
    });

    it('does not copy parent word keywords onto derived kanji cards for 学習能力', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false });
        const internals = controller as unknown as {
            studyPool: { kanjiStudyCardFromSourceCard(card: JPDBCard, kanji: string): JPDBCard };
        };
        const sourceWord = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            meanings: [{ glosses: ['learning ability'], partOfSpeech: [] }],
            cardState: ['locked'],
            kanjiKeyword: 'learning ability',
        });
        const cards = ['学', '習', '能', '力'].map(kanji => internals.studyPool.kanjiStudyCardFromSourceCard(sourceWord, kanji));

        expect(cards.map(card => card.spelling)).toEqual(['学', '習', '能', '力']);
        expect(cards.map(card => card.kanjiKeyword ?? '')).toEqual(['', '', '', '']);
        expect(cards.every(card => card.meanings.length === 0)).toBe(true);
        expect(cards.every(card => card.fallbackLookupTerms?.includes('学習能力'))).toBe(true);
    });

    it('keeps the visible new-tab queue in loaded SRS order', () => {
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const cards = [
            newTabTestCard({ spelling: '一番', source: 'jpdb' }),
            newTabTestCard({ spelling: '二番', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ spelling: '三番', source: 'jpdb' }),
        ];
        const visible = applySeededNewTabWords(controller, root, {
            allWords: cards,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
        });

        expect(visible.map(card => card.spelling)).toEqual(['一番', '二番', '三番']);
    });

    it('keeps Anki words in one queue while the stepper owns kanji practice', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, jpdbMiningEnabled: false, immersionKitEnabled: false }));
        try {
            const root = renderEnabledNewTabRoot(controller);
            const ankiWord = newTabTestCard({ spelling: '暗記', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
            const visible = applySeededNewTabWords(controller, root, {
                allWords: [ankiWord],
                sourceLabel: 'Anki',
                reviewCountMode: true,
                state: { mode: 'kanji', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false },
            });

            expect(visible.map(card => card.spelling)).toEqual(['暗記']);
            expect(visible.every(card => card.source === 'anki')).toBe(true);
            expect(visible.every(card => card.reviewSource === 'anki')).toBe(true);
            expectOpaqueStudyCardToken(root, '暗記');
            expect(root.querySelector('[data-grade]')).toBeNull();
            expect(Array.from(root.querySelectorAll<HTMLElement>('[data-newtab-controls] [data-newtab-action]'))
                .map(element => element.dataset.newtabAction)).toEqual(['previous', 'next']);
        } finally {
            restoreCanvas();
        }
    });

    it('weaves locked JPDB vocabulary kanji into the shared study queue in source order', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }));
        try {
            const root = renderEnabledNewTabRoot(controller);
            const locked = newTabTestCard({ spelling: '語彙', reading: 'ごい', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['locked'] });
            const due = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
            const visible = applySeededNewTabWords(controller, root, {
                allWords: [locked, due],
                sourceLabel: 'JPDB',
                reviewCountMode: true,
                state: { mode: 'kanji', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            });

            expect(visible.map(card => card.spelling)).toEqual(['語', '彙', '復習']);
            expect(visible.slice(0, 2).every(card => card.sourceCardKey === '35486:1:語彙:ごい')).toBe(true);
            expect(visible.slice(0, 2).every(card => card.reviewSource === undefined)).toBe(true);
            expect(visible[2]?.reviewSource).toBe('jpdb-api');
            expect(root.querySelector('[data-grade]')).toBeNull();
        } finally {
            restoreCanvas();
        }
    });

    it('does not restore a saved JPDB API word ahead of locked kanji API order', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'random',
            filter: 'study',
            source: 'jpdb',
            revealAnswer: false,
        }));
        const locked = newTabTestCard({ vid: 10, sid: 10, spelling: '語彙', reading: 'ごい', source: 'jpdb', cardState: ['locked'] });
        const due = newTabTestCard({ vid: 20, sid: 20, spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', cardState: ['due'] });
        sessionStorage.setItem('jpdb-reader-newtab-current-word', JSON.stringify({
            signature: 'jpdb|kanji|JPDB',
            key: cardKey(due),
        }));
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabEnabled: true,
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [locked, due]),
            } as never,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();

            const visible = (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords;
            expect(visible.map(card => card.spelling)).toEqual(['語', '彙', '復習']);
            expect((controller as unknown as { index: number }).index).toBe(0);
            expectOpaqueStudyCardToken(document, locked.spelling, locked.reading);
        } finally {
            restoreCanvas();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('keeps live JPDB kanji review cards gradeable in kanji mode', async () => {
        const { controller, root, visible, grade, requestCurrent, restoreCanvas } = await renderLoadedLiveReviewFixture('kanji');
        try {
            expect(visible[0]).toMatchObject({
                spelling: '記',
                reviewSource: 'jpdb-live',
                jpdbReviewId: 'kb,記',
            });
            expect(root.querySelector('[data-grade]')).toBeNull();

            revealNewTabStudyCard(root);

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(grade).toHaveBeenCalledWith('okay');
            expect(requestCurrent).toHaveBeenCalled();
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('renders live JPDB kanji review cards as kanji prompts in word mode', async () => {
        const { controller, root, visible, grade, requestCurrent, restoreCanvas } = await renderLoadedLiveReviewFixture('word');
        try {
            expect(visible[0]).toMatchObject({
                spelling: '記',
                reviewSource: 'jpdb-live',
                jpdbReviewId: 'kb,記',
            });
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('record');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('記');
            expect(root.querySelector('.jpdb-reader-newtab-doodle')).not.toBeNull();

            revealNewTabStudyCard(root);

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('記');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(grade).toHaveBeenCalledWith('okay');
            expect(requestCurrent).toHaveBeenCalled();
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('replaces stale live JPDB vocabulary when the bridge advances to a kanji card', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const reviewCard = vi.fn();
        const vocabularyStatus = newTabLiveVocabularyStatus();
        const kanjiStatus = newTabLiveKanjiStatus();
        const controller = newTabLiveReviewController({
            status: vocabularyStatus,
            jpdb: { reviewCard },
            settings: {
                newTabStudyStepOrder: BASE_DEFAULT_SETTINGS.newTabStudyStepOrder,
                newTabStudyDisabledSteps: [],
            },
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        try {
            const state = { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false };
            seedNewTabState(controller, state);
            const result = await (controller as unknown as { loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadJpdbWords();
            const visible = applySeededNewTabWords(controller, root, {
                allWords: result.cards,
                sourceLabel: result.sourceLabel,
                reviewCountMode: result.reviewCountMode === true,
                state,
            });

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('試験');
            expect(visible[0]).toMatchObject({
                spelling: '試験',
                reviewSource: 'jpdb-live',
                jpdbReviewId: 'v,試験',
            });

            (controller as unknown as { applyJpdbBridgeStatus(status: typeof kanjiStatus): void }).applyJpdbBridgeStatus(kanjiStatus);

            const allWords = (controller as unknown as { allWords: JPDBCard[] }).allWords;
            const visibleWords = (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords;
            expect(allWords.filter(card => card.reviewSource === 'jpdb-live')).toHaveLength(1);
            expect(allWords[0]).toMatchObject({ spelling: '記', reviewSource: 'jpdb-live', jpdbReviewId: 'kb,記' });
            expect(visibleWords[0]).toMatchObject({ spelling: '記', reviewSource: 'jpdb-live', jpdbReviewId: 'kb,記' });
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('record');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('試験');
            expect(reviewCard).not.toHaveBeenCalled();
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('keeps a live JPDB kanji review ahead of Anki cards in auto source order', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const requestCurrent = vi.fn();
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const liveStatus = newTabLiveKanjiStatus();
        const controller = newTabLiveReviewController({
            status: liveStatus,
            settings: {
                newTabSource: 'auto',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabStudyStepOrder: BASE_DEFAULT_SETTINGS.newTabStudyStepOrder,
                newTabStudyDisabledSteps: [],
            },
            anki: {
                listNewTabCards: vi.fn(async () => [ankiCard]),
            },
            parser: { cacheCards: vi.fn() },
            requestCurrent,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        try {
            const state = { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false };
            seedNewTabState(controller, state);

            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(result.cards.map(card => card.reviewSource)).toEqual(['jpdb-live', 'anki']);
            expect(result.cards.map(card => card.spelling)).toEqual(['記', '暗記']);
            expect(requestCurrent).not.toHaveBeenCalled();

            applySeededNewTabWords(controller, root, {
                allWords: result.cards,
                sourceLabel: result.sourceLabel,
                reviewCountMode: result.reviewCountMode === true,
                state,
            });

            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords[0]).toMatchObject({
                spelling: '記',
                reviewSource: 'jpdb-live',
                jpdbReviewId: 'kb,記',
            });
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('record');
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('renders a localized empty review state when JPDB live review has no current card', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const liveCard = newTabTestCard({
            spelling: '読む',
            reading: 'よむ',
            source: 'jpdb',
            reviewSource: 'jpdb-live',
            jpdbReviewId: 'v,1',
        });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'ja',
                jpdbMiningEnabled: true,
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'live-review',
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: true, card: null }),
                requestCurrent: vi.fn(),
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        try {
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: [liveCard],
                sourceLabel: 'JPDB ライブレビュー',
                reviewCountMode: true,
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            });
            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            (controller as unknown as { applyJpdbBridgeStatus(status: { connected: boolean; card: null }): void }).applyJpdbBridgeStatus({
                connected: true,
                card: null,
            });

            expect((controller as unknown as { allWords: JPDBCard[] }).allWords).toEqual([]);
            expect(root.querySelector('[data-newtab-answer]')?.textContent).toBe('復習する単語カードは今ありません。');
            expect(root.textContent).not.toContain('No review cards ready.');
            expect(root.textContent).not.toContain('Looking for more words');
        } finally {
            root.remove();
        }
    });

    it('does not prime auto review loading with cached dictionary cards', async () => {
        localStorage.setItem(NEW_TAB_CACHE_KEY, JSON.stringify({
            at: Date.now(),
            sourceLabel: 'Dictionary',
            cards: [newTabTestCard({ spelling: '辞書', reading: 'じしょ', source: 'local', reviewSource: 'dictionary' })],
        }));
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabSource: 'auto',
            newTabOfflineEnabled: true,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        Object.assign(controller as unknown as {
            loadGeneration: number;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            loadGeneration: 1,
            state: { mode: 'kanji', sort: 'frequency', filter: 'study', source: 'auto', revealAnswer: false },
        });

        const usedCache = await (controller as unknown as {
            applyOfflineCacheWhileLoading(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number): Promise<boolean>;
        }).applyOfflineCacheWhileLoading(root, false, 1);

        expect(usedCache).toBe(false);
        expect((controller as unknown as { allWords: JPDBCard[] }).allWords).toEqual([]);
        expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('辞書');
    });

    it('keeps tiny JPDB review queues strict instead of supplementing dictionary kanji cards', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const listKanjiCharacters = vi.fn(async () => ['書', '日', '本', '語']);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: vi.fn(async () => [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }]),
                listKanjiCharacters,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderEnabledNewTabRoot(controller);
        try {
            Object.assign(controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                state: { mode: 'kanji', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            });

            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
            }, {
                allWords: result.cards,
                sourceLabel: result.sourceLabel,
                reviewCountMode: result.reviewCountMode === true,
            });
            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            expect(result.sourceLabel).toBe('JPDB');
            expect(result.reviewCountMode).toBe(true);
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む']);
            expect(listKanjiCharacters).not.toHaveBeenCalled();
        } finally {
            restoreCanvas();
        }
    });

    it('settles kanji fronts when no keyword source returns a keyword', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        try {
            const controller = newTabPromptController({
                ...DEFAULT_SETTINGS,
                jpdbKanjiEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            });
            const root = renderNewTabKanjiFront(controller, newTabTestCard({
                spelling: '日',
                reading: '日',
                source: 'jpdb',
                kanjiKeyword: '',
                meanings: [],
            }));
            const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;

            expect(prompt.textContent).toContain('日');
            expect(prompt.textContent).not.toContain('Loading');
        } finally {
            restoreCanvas();
        }
    });

    it('keeps Anki-derived words intact when migrating legacy kanji state', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const sourceCard = newTabTestCard({
            vid: 38800,
            sid: 1,
            rid: 38800,
            spelling: '難波',
            reading: 'なにわ',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 38800,
            ankiNoteId: 9900,
            ankiDeckNames: ['Mining'],
            ankiModelName: 'Imported',
            cardState: ['due'],
        });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabKanjiAutogradeEnabled: false,
        }, {
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
        });
        const root = renderEnabledNewTabRoot(controller);
        try {
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: [sourceCard],
                sourceLabel: 'Anki',
                reviewCountMode: true,
                state: { mode: 'kanji', sort: 'frequency', filter: 'study', source: 'anki', revealAnswer: false },
            });
            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['難波']);
            expectOpaqueStudyCardToken(root, '難波', 'なにわ');
            expect(newTabPromptText(root)).toBe('難波');
            expect(newTabSourceSelect(root).value).toBe('anki');
        } finally {
            root.remove();
            restoreCanvas();
        }
    });
});
