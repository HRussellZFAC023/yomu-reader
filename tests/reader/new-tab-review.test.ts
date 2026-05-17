import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki';
import { listNewTabAnkiCards } from '../../src/reader/anki-new-tab';
import type { ImmersionKitExample } from '../../src/reader/immersion-kit';
import { NewTabController, selectNewTabStudyPool } from '../../src/reader/new-tab-controller';
import { NewTabRuntime } from '../../src/reader/newtab-runtime';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb-review-bridge';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT } from '../../src/reader/kanji-doodle';
import { assessKanjiStrokes, rankKanjiStrokeCandidates } from '../../src/reader/kanji-stroke-grader';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { definitionSourceRows } from '../../src/reader/source-sections';
import type { JPDBCard } from '../../src/reader/types';

beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function newTabTestCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    const spelling = overrides.spelling ?? '読む';
    return {
        vid: overrides.vid ?? spelling.charCodeAt(0),
        sid: overrides.sid ?? 1,
        rid: overrides.rid ?? 1,
        spelling,
        reading: overrides.reading ?? spelling,
        frequencyRank: overrides.frequencyRank ?? null,
        partOfSpeech: overrides.partOfSpeech ?? [],
        meanings: overrides.meanings ?? [{ glosses: ['to read'], partOfSpeech: [] }],
        cardState: overrides.cardState ?? ['new'],
        pitchAccent: overrides.pitchAccent ?? [],
        wordWithReading: overrides.wordWithReading ?? null,
        source: overrides.source ?? 'local',
        reviewSource: overrides.reviewSource,
        ankiCardId: overrides.ankiCardId,
        sentence: overrides.sentence,
        kanjiKeyword: overrides.kanjiKeyword,
        jpdbReviewId: overrides.jpdbReviewId,
    };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(settle => { resolve = settle; });
    return { promise, resolve };
}

async function waitForExpect(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    if (lastError) throw lastError;
    await assertion();
}

function newTabPromptController(settings = DEFAULT_SETTINGS, overrides: Partial<ConstructorParameters<typeof NewTabController>[0]> = {}): NewTabController {
    return new NewTabController({
        getSettings: () => settings,
        anki: {} as never,
        jpdb: {} as never,
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: { lookup: vi.fn(async () => null) } as never,
        rtk: { lookup: vi.fn(async () => null) } as never,
        immersionKit: {} as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        parser: {} as never,
        dictionaries: {} as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
        ...overrides,
    });
}

function renderNewTabWordFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
    Object.assign(controller as unknown as {
        visibleWords: JPDBCard[];
        index: number;
        sourceLabel: string;
        state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
    }, {
        visibleWords: [card],
        index: 0,
        sourceLabel: 'JPDB',
        state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
    });
    (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
    return root;
}

function stubKanjiDoodleBrowserApis(): () => void {
    vi.stubGlobal('ResizeObserver', class {
        observe(): void {}
        disconnect(): void {}
    });
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: vi.fn(() => ({
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        })),
    });
    return () => {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
    };
}

describe('new tab review helpers', () => {
    it('parses live JPDB kanji review fronts from the review card id', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <input name="c" value="kb,記">
                <div class="kind">Kanji</div>
                <div class="plain">record</div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review?c=kb,%E8%A8%98');

        expect(status.connected).toBe(true);
        expect(status.card?.kind).toBe('kanji');
        expect(status.card?.phase).toBe('front');
        expect(status.card?.kanji).toBe('記');
        expect(status.card?.prompt).toContain('record');
    });

    it('parses JPDB vocabulary review sentences and highlighted targets', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <div class="kind">Vocabulary</div>
                <div class="card-sentence">
                    <div class="sentence">ここへ<span class="highlight">来て</span>見てみなよ。</div>
                </div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review#demo');

        expect(status.card?.kind).toBe('vocabulary');
        expect(status.card?.sentence).toContain('ここへ');
        expect(status.card?.spelling).toBe('来て');
    });

    it('grades kanji doodles from stroke count and basic drawing coverage', () => {
        const assessment = assessKanjiStrokes([
            [{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.9, y: 0.1, pressure: 0.5 }],
            [{ x: 0.2, y: 0.2, pressure: 0.5 }, { x: 0.2, y: 0.9, pressure: 0.5 }],
        ], 2);

        expect(assessment.passed).toBe(true);
        expect(assessment.score).toBeGreaterThanOrEqual(68);
    });

    it('checks same-count kanji doodles against the expected KanjiVG stroke shape', () => {
        const twoTemplate = [
            [{ x: 0.23, y: 0.30 }, { x: 0.74, y: 0.27 }],
            [{ x: 0.11, y: 0.74 }, { x: 0.89, y: 0.70 }],
        ];

        const correct = assessKanjiStrokes([
            [{ x: 0.20, y: 0.31, pressure: 0.5 }, { x: 0.79, y: 0.29, pressure: 0.5 }],
            [{ x: 0.10, y: 0.77, pressure: 0.5 }, { x: 0.90, y: 0.73, pressure: 0.5 }],
        ], 2, twoTemplate);
        const wrongShape = assessKanjiStrokes([
            [{ x: 0.30, y: 0.18, pressure: 0.5 }, { x: 0.30, y: 0.82, pressure: 0.5 }],
            [{ x: 0.70, y: 0.18, pressure: 0.5 }, { x: 0.70, y: 0.82, pressure: 0.5 }],
        ], 2, twoTemplate);
        const wrongOrder = assessKanjiStrokes([
            [{ x: 0.10, y: 0.77, pressure: 0.5 }, { x: 0.90, y: 0.73, pressure: 0.5 }],
            [{ x: 0.20, y: 0.31, pressure: 0.5 }, { x: 0.79, y: 0.29, pressure: 0.5 }],
        ], 2, twoTemplate);

        expect(correct.passed).toBe(true);
        expect(correct.shapeScore).toBeGreaterThanOrEqual(0.56);
        expect(wrongShape.passed).toBe(false);
        expect(wrongShape.message).toContain('shape/order');
        expect(wrongOrder.passed).toBe(false);
        expect(wrongOrder.message).toContain('shape/order');
    });

    it('ranks kanji shape candidates without requiring stroke order or direction', () => {
        const twoTemplate = [
            [{ x: 0.23, y: 0.30 }, { x: 0.74, y: 0.27 }],
            [{ x: 0.11, y: 0.74 }, { x: 0.89, y: 0.70 }],
        ];
        const riverTemplate = [
            [{ x: 0.24, y: 0.18 }, { x: 0.20, y: 0.82 }],
            [{ x: 0.50, y: 0.12 }, { x: 0.46, y: 0.88 }],
            [{ x: 0.76, y: 0.16 }, { x: 0.72, y: 0.84 }],
        ];

        const matches = rankKanjiStrokeCandidates([
            [{ x: 0.90, y: 0.73, pressure: 0.5 }, { x: 0.10, y: 0.77, pressure: 0.5 }],
            [{ x: 0.79, y: 0.29, pressure: 0.5 }, { x: 0.20, y: 0.31, pressure: 0.5 }],
        ], [
            { kanji: '川', strokeShapes: riverTemplate },
            { kanji: '二', strokeShapes: twoTemplate },
        ]);

        expect(matches[0]?.kanji).toBe('二');
        expect(matches[0]?.score).toBeGreaterThan(0.7);
    });

    it('keeps mother near the top for connected, out-of-order handwriting', () => {
        const matches = rankKanjiStrokeCandidates([
            [{ x: 0.28, y: 0.24, pressure: 0.5 }, { x: 0.84, y: 0.29, pressure: 0.5 }],
            [{ x: 0.34, y: 0.16, pressure: 0.5 }, { x: 0.29, y: 0.58, pressure: 0.5 }, { x: 0.27, y: 0.76, pressure: 0.5 }, { x: 0.70, y: 0.78, pressure: 0.5 }, { x: 0.78, y: 0.78, pressure: 0.5 }],
            [{ x: 0.78, y: 0.30, pressure: 0.5 }, { x: 0.74, y: 0.58, pressure: 0.5 }, { x: 0.70, y: 0.88, pressure: 0.5 }],
            [{ x: 0.20, y: 0.48, pressure: 0.5 }, { x: 0.88, y: 0.56, pressure: 0.5 }],
            [{ x: 0.50, y: 0.36, pressure: 0.5 }, { x: 0.61, y: 0.45, pressure: 0.5 }],
            [{ x: 0.50, y: 0.58, pressure: 0.5 }, { x: 0.62, y: 0.68, pressure: 0.5 }],
        ], [
            {
                kanji: '用',
                strokeShapes: [
                    [{ x: 0.30, y: 0.18 }, { x: 0.24, y: 0.90 }],
                    [{ x: 0.31, y: 0.20 }, { x: 0.78, y: 0.20 }, { x: 0.76, y: 0.90 }],
                    [{ x: 0.50, y: 0.22 }, { x: 0.50, y: 0.88 }],
                    [{ x: 0.28, y: 0.45 }, { x: 0.76, y: 0.45 }],
                    [{ x: 0.28, y: 0.66 }, { x: 0.76, y: 0.66 }],
                ],
            },
            {
                kanji: '母',
                strokeShapes: [
                    [{ x: 0.31, y: 0.24 }, { x: 0.82, y: 0.28 }],
                    [{ x: 0.35, y: 0.16 }, { x: 0.28, y: 0.56 }, { x: 0.27, y: 0.76 }, { x: 0.74, y: 0.78 }],
                    [{ x: 0.80, y: 0.28 }, { x: 0.75, y: 0.57 }, { x: 0.70, y: 0.88 }],
                    [{ x: 0.22, y: 0.49 }, { x: 0.86, y: 0.56 }],
                    [{ x: 0.50, y: 0.37 }, { x: 0.62, y: 0.47 }],
                    [{ x: 0.50, y: 0.59 }, { x: 0.63, y: 0.69 }],
                ],
            },
            {
                kanji: '回',
                strokeShapes: [
                    [{ x: 0.22, y: 0.20 }, { x: 0.22, y: 0.82 }],
                    [{ x: 0.22, y: 0.20 }, { x: 0.84, y: 0.20 }, { x: 0.84, y: 0.82 }],
                    [{ x: 0.38, y: 0.40 }, { x: 0.68, y: 0.40 }, { x: 0.68, y: 0.66 }, { x: 0.38, y: 0.66 }, { x: 0.38, y: 0.40 }],
                    [{ x: 0.22, y: 0.82 }, { x: 0.84, y: 0.82 }],
                ],
            },
        ]);

        expect(matches[0]?.kanji).toBe('母');
    });

    it('uses Google-style handwriting recognition instead of the browser Handwriting API', async () => {
        const nativeRecognizer = vi.fn(() => {
            throw new Error('Native handwriting should not be used');
        });
        Object.defineProperty(navigator, 'createHandwritingRecognizer', {
            configurable: true,
            value: nativeRecognizer,
        });
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
            'SUCCESS',
            [['request-id', ['母', '父', '日', '月', '火', '水', '木', '金'], [], { is_html_escaped: false }]],
        ]))));
        const controller = new NewTabController({
            getSettings: () => DEFAULT_SETTINGS,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<div data-newtab-handwriting-candidates></div>';
        document.body.append(root);
        Object.assign(controller as unknown as {
            state: { mode: string };
            searchHandwritingGeneration: number;
        }, {
            state: { mode: 'search' },
            searchHandwritingGeneration: 7,
        });

        await (controller as unknown as {
            recognizeSearchHandwriting(root: HTMLElement, strokes: Parameters<typeof rankKanjiStrokeCandidates>[0], generation: number): Promise<void>;
        }).recognizeSearchHandwriting(root, [
            [{ x: 0.3, y: 0.2, pressure: 0.5 }, { x: 0.8, y: 0.3, pressure: 0.5 }],
            [{ x: 0.3, y: 0.2, pressure: 0.5 }, { x: 0.3, y: 0.8, pressure: 0.5 }],
        ], 7);

        expect(nativeRecognizer).not.toHaveBeenCalled();
        expect(root.querySelector('[data-newtab-handwriting-candidates]')?.textContent).toContain('母');
        root.remove();
    });

    it('loads Anki due and new cards through AnkiConnect review actions', async () => {
        const actions: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            actions.push(request.action);
            const result = (() => {
                if (request.action === 'findCards') return [101, 102, 103];
                if (request.action === 'areDue') return [true, false, true];
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
            })();
            return new Response(JSON.stringify({ result, error: null }), { status: 200 });
        });

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        };
        const client = new AnkiConnectClient(() => settings);
        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(actions).toEqual(['findCards', 'areDue', 'cardsInfo', 'notesInfo']);
        expect(cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(cards[0].ankiCardId).toBe(101);
        expect(cards[0].sentence).toBe('本を読む。');
    });

    it('keeps Anki new-tab cards in scheduler queue order', async () => {
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            const cards = Array.isArray(request.params.cards) ? request.params.cards.map(Number) : [];
            const notes = Array.isArray(request.params.notes) ? request.params.notes.map(Number) : [];
            const result = (() => {
                if (request.action === 'findCards') return [301, 302, 303, 304];
                if (request.action === 'areDue') return cards.map(cardId => cardId !== 304);
                if (request.action === 'cardsInfo') return cards.map(cardId => ({
                    cardId,
                    note: cardId,
                    deckName: 'Yomu',
                    queue: cardId === 303 ? 1 : cardId === 301 ? 0 : 2,
                    type: cardId === 303 ? 1 : cardId === 301 ? 0 : 2,
                    due: cardId === 303 ? 5 : cardId === 302 ? 10 : 20,
                }));
                if (request.action === 'notesInfo') return [...notes].reverse().map(noteId => ({
                    noteId,
                    modelName: 'Yomu Japanese',
                    tags: [],
                    cards: [noteId],
                    fields: {
                        Expression: { value: noteId === 303 ? '学ぶ' : noteId === 302 ? '読む' : '書く' },
                        Reading: { value: noteId === 303 ? 'まなぶ' : noteId === 302 ? 'よむ' : 'かく' },
                        Meaning: { value: noteId === 303 ? 'to learn' : noteId === 302 ? 'to read' : 'to write' },
                    },
                }));
                return null;
            })();
            return new Response(JSON.stringify({ result, error: null }), { status: 200 });
        });

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        };
        const client = new AnkiConnectClient(() => settings);
        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(cards.map(card => card.spelling)).toEqual(['学ぶ', '読む', '書く']);
    });

    it('does not query AnkiConnect for new-tab Anki cards on mobile handoff devices', async () => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
            configurable: true,
        });
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                ankiMobileHandoff: true,
                ankiDeck: 'Yomu',
                ankiModel: 'Yomu Japanese',
            };
            const client = new AnkiConnectClient(() => settings);

            await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
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

    it('keeps the visible new-tab queue in loaded SRS order', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        const cards = [
            newTabTestCard({ spelling: '一番', source: 'jpdb' }),
            newTabTestCard({ spelling: '二番', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ spelling: '三番', source: 'jpdb' }),
        ];
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: cards,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
        });

        (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['一番', '二番', '三番']);
    });

    it('labels the current card origin in the mixed new-tab footer', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        const cards = [
            newTabTestCard({ spelling: '一番', source: 'jpdb', reviewSource: 'jpdb-api' }),
            newTabTestCard({ spelling: '二番', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ spelling: '三番', source: 'local' }),
        ];
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: cards,
            index: 0,
            reviewCountMode: false,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[0]!);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 3 · JPDB');

        (controller as unknown as { index: number }).index = 1;
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[1]!);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('2 / 3 · Anki');

        (controller as unknown as { index: number }).index = 2;
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[2]!);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
    });

    it('keeps JPDB visible in the dictionary source rows when disabled', () => {
        const rows = definitionSourceRows({
            ...DEFAULT_SETTINGS,
            jpdbDefinitionsEnabled: false,
        });

        const jpdb = rows.find(row => row.name === 'JPDB');
        expect(jpdb).toBeTruthy();
        expect(jpdb?.enabled).toBe(false);
    });

    it('uses dictionary cards only as the new tab auto-source fallback', async () => {
        const jpdbCard: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '読む',
            reading: 'よむ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['to read'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
        const loadDictionary = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDecks: vi.fn(async () => [{ id: 'deck', name: 'Deck' }]),
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
                localCardFromEntry: vi.fn(() => ({ ...jpdbCard, spelling: '書く', reading: 'かく', source: 'local' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: loadDictionary,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['読む']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(loadDictionary).not.toHaveBeenCalled();
    });

    it('interleaves JPDB and Anki cards in auto source without disturbing either queue', async () => {
        const jpdbCards = [
            newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' }),
            newTabTestCard({ vid: 2, sid: 1, spelling: '辞書', reading: 'じしょ', source: 'jpdb' }),
            newTabTestCard({ vid: 3, sid: 1, spelling: '復習', reading: 'ふくしゅう', source: 'jpdb' }),
        ];
        const ankiCards = [
            newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ vid: -2, sid: -2, spelling: '例文', reading: 'れいぶん', source: 'anki', reviewSource: 'anki' }),
        ];
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabSource: 'auto',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => jpdbCards),
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
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['日本語', '暗記', '辞書', '例文', '復習']);
        expect(result.sourceLabel).toBe('JPDB + Anki');
    });

    it('marks JPDB API deck cards as review cards for stable new-tab counts', async () => {
        const jpdbCard = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
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
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();

        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0]?.reviewSource).toBe('jpdb-api');
    });

    it('does not load JPDB review cards when JPDB writes are disabled', async () => {
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '安定', source: 'jpdb' })]);
        const requestCurrent = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: false,
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards,
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent,
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards).toEqual([]);
        expect(result.sourceLabel).toBe('No source');
        expect(listDeckCards).not.toHaveBeenCalled();
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('uses navigation instead of grade buttons for JPDB cards when JPDB writes are disabled', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: false,
                enableReviews: true,
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: true },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-grade]')).toBeNull();
        expect(root.querySelector('[data-newtab-action="previous"]')).not.toBeNull();
        expect(root.querySelector('[data-newtab-action="reveal"]')?.textContent).toBe('Hide');
        expect(root.querySelector('[data-newtab-action="next"]')).not.toBeNull();
    });

    it('exposes grade options to kanji lookup popovers for the revealed review card', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                twoButtonReviews: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: true },
        });

        expect(controller.lookupGradeOptions(card)).toEqual([['fail', 'Fail'], ['pass', 'Pass']]);
        (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: false };
        expect(controller.lookupGradeOptions(card)).toEqual([]);
    });

    it('reloads fresh queues after the last graded card without using stale offline cache', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        const reload = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
        }, {
            allWords: [card],
            visibleWords: [card],
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: true },
            loadWordsInto: reload,
        });

        (controller as unknown as { advanceAfterGrade(root: HTMLElement, card: JPDBCard): void }).advanceAfterGrade(root, card);

        expect(reload).toHaveBeenCalledWith(root, false, { useOfflineCache: false });
    });

    it('uses the JPDB-style new-tab kanji front canvas and reveal preview flow', async () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => ({
                clearRect: vi.fn(),
                beginPath: vi.fn(),
                moveTo: vi.fn(),
                lineTo: vi.fn(),
                stroke: vi.fn(),
                save: vi.fn(),
                restore: vi.fn(),
            })),
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            configurable: true,
            value: vi.fn(() => 'data:image/png;base64,doodle'),
        });
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '返',
            reading: 'へんじ',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['return'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
            kanjiKeyword: 'return',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabKanjiAutogradeEnabled: true }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => ({ kanji: '返', keyword: 'return', meanings: ['return'], readings: [{ reading: 'へん', type: 'on' }], components: [], vocabulary: [], frequencyRank: null })) } as never,
            kanjiVG: { lookup: vi.fn(async () => ({ kanji: '返', strokeCount: 7, svg: '<svg class="jpdb-reader-kanjivg-svg"><g><path d="M0 0L1 1"></path></g></svg>' })) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'kanji', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
        await Promise.resolve();

        await (controller as unknown as { assessDoodle(slots: unknown, card: JPDBCard, kanji: string, strokes: Parameters<typeof assessKanjiStrokes>[0]): Promise<void> }).assessDoodle(
            { answer: root.querySelector('[data-newtab-reading]') },
            card,
            '返',
            [[{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.8, y: 0.1, pressure: 0.5 }]],
        );
        expect(root.querySelector('[data-newtab-doodle-result]')?.textContent).toBe('');

        expect(root.querySelector('.jpdb-reader-doodle-canvas')).not.toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-doodle')?.classList.contains('trace-hidden')).toBe(true);
        expect(root.querySelector('.jpdb-reader-newtab-doodle .jpdb-reader-newtab-doodle-actions')).toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-kanji-front > .jpdb-reader-newtab-doodle-actions')).not.toBeNull();
        expect(root.querySelector('[data-newtab-doodle-ghost]')).toHaveProperty('hidden', true);
        expect(root.querySelector('[data-doodle-trace]')?.textContent).toBe('Show trace');
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');

        (controller as unknown as { doodlePreviewCache: Map<string, string> }).doodlePreviewCache.set('1:1:返:へんじ', 'data:image/png;base64,doodle');
        (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'kanji', revealAnswer: true };
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
        await Promise.resolve();

        expect(root.querySelector('.jpdb-reader-doodle-canvas')).toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-kanji-glyph')).toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-kanji-svg')).not.toBeNull();
        expect(root.querySelector('.jpdb-reader-newtab-doodle-preview img')?.getAttribute('src')).toBe('data:image/png;base64,doodle');
        expect(root.querySelector('.jpdb-reader-newtab-kanji-details')?.textContent).toContain('Keyword');
        expect(root.querySelector('.jpdb-reader-newtab-kanji-details')?.textContent).toContain('return');
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            configurable: true,
            value: originalToDataURL,
        });
    });

    it('does not show vocabulary meanings on the kanji front before detail lookups resolve', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({
            vid: 20,
            sid: 20,
            spelling: '播く',
            reading: 'まく',
            meanings: [{ glosses: ['5-dan transitive kana to sow to plant to seed to sow'], partOfSpeech: [] }],
        });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, newTabKanjiAutogradeEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        try {
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.dataset.jpdbReaderRoot = 'true';
            root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
            Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
                visibleWords: [card],
                index: 0,
                sourceLabel: 'JPDB',
                state: { mode: 'kanji', revealAnswer: false },
            });

            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('Loading...');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('sow');

            lookup.resolve({ kanji: '播', keyword: 'disseminate', meanings: ['disseminate'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('JPDB');
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('disseminate');
            });
        } finally {
            restoreCanvas();
        }
    });

    it('shows JPDB, RTK, and Uchisen kanji keywords on the unrevealed front', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(`
            <div class="kanji_info" id="kanji_keyword_container"><span>柔 - Supple</span></div>
        `, { status: 200 })));
        const card = newTabTestCard({
            vid: 21,
            sid: 21,
            spelling: '柔',
            reading: 'じゅう',
            source: 'jpdb',
            kanjiKeyword: 'gentle',
        });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, newTabKanjiAutogradeEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => ({ kanji: '柔', keyword: 'gentle', meanings: ['gentle'], readings: [], components: [], vocabulary: [], frequencyRank: null })) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => ({ kanji: '柔', keyword: 'tenderness', frameNumber: '2042', onYomi: '', kunYomi: '', elements: '', componentKanji: [], heisigStory: '', heisigComment: '', koohiiStories: [] })) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        try {
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.dataset.jpdbReaderRoot = 'true';
            root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
            Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
                visibleWords: [card],
                index: 0,
                sourceLabel: 'JPDB',
                state: { mode: 'kanji', revealAnswer: false },
            });

            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            await waitForExpect(() => {
                const rows = [...root.querySelectorAll('.jpdb-reader-newtab-kanji-front-keyword')].map(row => row.textContent);
                expect(rows).toEqual(['JPDBgentle', 'RTKtenderness', 'UchisenSupple']);
            });
        } finally {
            restoreCanvas();
        }
    });

    it('keeps the current card selected when switching between word and kanji mode', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const current = newTabTestCard({ vid: 10, sid: 10, spelling: '月光', reading: 'げっこう', kanjiKeyword: 'moonlight' });
        const other = newTabTestCard({ vid: 11, sid: 11, spelling: '胸', reading: 'むね', kanjiKeyword: 'chest' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, newTabKanjiAutogradeEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        try {
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.dataset.jpdbReaderRoot = 'true';
            root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                visibleWords: JPDBCard[];
                index: number;
                sourceLabel: string;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: [other, current],
                visibleWords: [other, current],
                index: 1,
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            });
            (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, current);

            root.querySelector<HTMLButtonElement>('[data-mode="kanji"]')?.click();

            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('10:10:月光:げっこう');
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('moonlight');
        } finally {
            restoreCanvas();
        }
    });

    it('renders the word front as a large keyword with the sentence below', () => {
        const sentence = '難波金満(なにわきんまん)高校 生徒会長 宝多金男(かねお)や';
        const card = newTabTestCard({ spelling: '難波', reading: 'なにわ', sentence, source: 'anki', pitchAccent: ['LHH'] });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false });

        const root = renderNewTabWordFront(controller, card);

        const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');
        expect(prompt?.querySelector('.jpdb-reader-newtab-term')?.textContent).toBe('難波');
        expect(prompt?.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word')?.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe(sentence);
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.textContent).toBe('難波');
    });

    it('parses the front sentence with the same content parser used by other card text', async () => {
        const sentence = 'お母ちゃん中学生？';
        const card = newTabTestCard({ vid: 88, sid: 44, spelling: '中学生', reading: 'ちゅうがくせい', sentence });
        const parseContent = vi.fn(async (prompt: HTMLElement) => {
            const sentenceNode = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
            sentenceNode!.innerHTML = 'お母ちゃん<span class="jpdb-reader-word jpdb-new jpdb-pitch-heiban" data-vid="88" data-sid="44" data-sentence="お母ちゃん中学生？" tabindex="0">中学生</span>？';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, { parseContent });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            await waitForExpect(() => {
                expect(parseContent).toHaveBeenCalledWith(root.querySelector('[data-newtab-prompt]'));
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.textContent).toBe('中学生');
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.classList.contains('jpdb-reader-example-target')).toBe(true);
            });
        } finally {
            root.remove();
        }
    });

    it('omits front sentences when the new-tab sentence toggle is off', () => {
        const card = newTabTestCard({ spelling: '難波', reading: 'なにわ', sentence: '難波金満高校や', source: 'anki' });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabFrontSentenceEnabled: false,
        });

        const root = renderNewTabWordFront(controller, card);
        const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');

        expect(prompt?.querySelector('.jpdb-reader-newtab-term')?.textContent).toBe('難波');
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
        expect(prompt?.textContent).toBe('難波');
    });

    it('loads the front sentence from the pending Immersion Kit example for word-only cards', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const search = vi.fn(async (): Promise<ImmersionKitExample[]> => [{
            id: 'ik-front',
            sentence: 'お母ちゃん中学生？',
            sentenceWithFurigana: '',
            translation: 'Are you a middle schooler, kid?',
            sourceTitle: 'Mahou Shoujo Madoka Magica',
            titleSlug: 'mahou-shoujo-madoka-magica',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        }]);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe('お母ちゃん中学生？');
            });
            expect(search).toHaveBeenCalledWith('中学生', expect.objectContaining({ immersionKitEnabled: true }));
        } finally {
            root.remove();
        }
    });

    it('falls back to a JPDB example sentence on the front when Immersion Kit is off', async () => {
        const card = newTabTestCard({ vid: 120, spelling: '辞書', reading: 'じしょ' });
        const lookup = vi.fn(async () => ({
            meanings: [],
            compounds: [],
            examples: [{ sentence: '辞書を引く。', translation: '' }],
        }));
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            jpdbVocabulary: { lookup },
        });
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe('辞書を引く。');
            });
            expect(lookup).toHaveBeenCalledWith(120, '辞書', 'じしょ');
        } finally {
            root.remove();
        }
    });

    it('opens lookup from a word prompt tap even when the tap lands on prompt whitespace', () => {
        const lookupText = vi.fn();
        const card = newTabTestCard({ vid: 10, sid: 10, spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            lookupText,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupText).toHaveBeenCalledWith('月光', 'げっこう', root.querySelector('[data-newtab-prompt]'));
        expect((controller as unknown as { state: { revealAnswer: boolean } }).state.revealAnswer).toBe(false);
    });

    it('searches words and kanji from the new-tab search mode', async () => {
        const lookupText = vi.fn();
        const showKanjiCard = vi.fn();
        const localEntry = {
            expression: '読む',
            reading: 'よむ',
            glossary: ['to read'],
            score: 10,
            dictionary: 'Local',
        };
        const relatedEntry = {
            expression: '読書',
            reading: 'どくしょ',
            glossary: ['reading books'],
            score: 4,
            dictionary: 'Local',
        };
        const parser = {
            parse: vi.fn(async () => [[{
                card: newTabTestCard({ vid: 2, sid: 2, spelling: '読む', reading: 'よむ', source: 'jpdb', sentence: '読む' }),
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: '',
                sentence: '読む',
            }]]),
            localCardFromEntry: vi.fn(entry => newTabTestCard({
                vid: entry.expression.charCodeAt(0),
                sid: entry.expression.charCodeAt(0),
                spelling: entry.expression,
                reading: entry.reading,
                meanings: [{ glosses: entry.glossary, partOfSpeech: [] }],
                source: 'local',
            })),
            fallbackCardFromText: vi.fn(text => newTabTestCard({
                vid: text.charCodeAt(0),
                sid: text.charCodeAt(0),
                spelling: text,
                reading: text,
                meanings: [],
                source: 'fallback',
            })),
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {
                lookup: vi.fn(async () => ({
                    kanji: '読',
                    keyword: 'read',
                    meanings: ['read'],
                    readings: [{ reading: 'ドク', type: 'on' }],
                    components: [],
                    vocabulary: [],
                    frequencyRank: null,
                })),
            } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: parser as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0 }], terms: 2, kanji: 1, termMeta: 0, kanjiMeta: 0 })),
                lookup: vi.fn(async () => [localEntry]),
                findTermMatches: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => [{ character: '読', onyomi: ['ドク'], kunyomi: ['よ.む'], tags: [], meanings: ['read'], dictionary: 'Kanji Local' }]),
                lookupSimilarTermsByKanji: vi.fn(async () => [relatedEntry]),
            } as never,
            lookupText,
            showKanjiCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, '読む');

        await waitForExpect(() => {
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Words');
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Kanji');
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('読む');
        });

        root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]')?.click();
        expect(lookupText).toHaveBeenCalledWith('読む', 'よむ', root.querySelector('[data-newtab-action="search-result-word"]'));

        root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]')?.click();
        await waitForExpect(() => {
            expect(showKanjiCard).toHaveBeenCalledWith(expect.objectContaining({ spelling: '読', kanjiKeyword: 'read' }), '読', '読', root.querySelector('[data-newtab-action="search-result-kanji"]'));
        });
        root.remove();
    });

    it('searches English glossary text, kana prefixes, and enabled lookup links in search mode', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            dictionaryLookupLinks: [
                { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: false },
                { id: 'jisho', label: 'Jisho', urlTemplate: 'https://jisho.org/search/{query}', enabled: false },
                { id: 'takoboto', label: 'Takoboto', urlTemplate: 'https://takoboto.jp/?q={query}', enabled: true },
                { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' as const },
            ],
        };
        const searchTerms = vi.fn(async (query: string) => {
            if (query === 'cat') return [{ expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Local' }];
            if (query === 'おもし') return [{ expression: '面白い', reading: 'おもしろい', glossary: ['interesting'], score: 18, dictionary: 'Local' }];
            return [];
        });
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                localCardFromEntry: vi.fn(entry => newTabTestCard({
                    vid: entry.expression.charCodeAt(0),
                    sid: entry.expression.charCodeAt(0),
                    spelling: entry.expression,
                    reading: entry.reading,
                    meanings: [{ glosses: entry.glossary, partOfSpeech: [] }],
                    source: 'local',
                })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0 }], terms: 2, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
                searchTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        const handwriting = root.querySelector<HTMLDetailsElement>('[data-newtab-handwriting]');
        const drawToggle = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-handwriting-toggle"]');
        expect(handwriting).not.toBeNull();
        expect(handwriting?.open).toBe(false);
        expect(drawToggle?.getAttribute('aria-expanded')).toBe('false');
        drawToggle?.click();
        expect(handwriting?.open).toBe(true);
        expect(drawToggle?.getAttribute('aria-expanded')).toBe('true');
        expect(handwriting?.querySelector('[data-doodle-clear]')).toBeNull();
        let doodleClearCount = 0;
        handwriting?.addEventListener(KANJI_DOODLE_CLEAR_EVENT, () => { doodleClearCount += 1; });
        (controller as unknown as { renderSearchHandwritingCandidates(root: HTMLElement, candidates: string[], message: string): void })
            .renderSearchHandwritingCandidates(root, ['日'], '');
        root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();
        expect(doodleClearCount).toBe(1);
        expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('日');
        expect(handwriting?.open).toBe(true);
        expect(root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]')?.hidden).toBe(true);
        (controller as unknown as { renderSearchHandwritingCandidates(root: HTMLElement, candidates: string[], message: string): void })
            .renderSearchHandwritingCandidates(root, ['本'], '');
        root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();
        expect(doodleClearCount).toBe(2);
        expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('日本');
        expect(handwriting?.open).toBe(true);
        root.querySelector<HTMLButtonElement>('[data-newtab-action="search-clear"]')?.click();
        expect(doodleClearCount).toBe(3);
        expect(root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]')?.hidden).toBe(true);
        drawToggle?.click();
        expect(handwriting?.open).toBe(false);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'cat');

        await waitForExpect(() => {
            expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('猫');
            expect(root.querySelector('[data-newtab-search-autocomplete]')?.textContent).toContain('猫');
        });
        const input = root.querySelector<HTMLInputElement>('[data-newtab-search-input]');
        const suggestion = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-suggestion"]');
        expect(input?.getAttribute('aria-activedescendant')).toBe(suggestion?.id);
        expect(suggestion?.dataset.active).toBe('true');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Takoboto');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Copy');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).not.toContain('JPDB');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).not.toContain('Jisho');
        expect(root.querySelector<HTMLAnchorElement>('.jpdb-reader-newtab-search-links a')?.href).toContain('takoboto.jp/?q=cat');
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(input?.value).toBe('猫');

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'おもし');
        await waitForExpect(() => {
            expect(root.querySelector('[data-newtab-search-autocomplete]')?.textContent).toContain('面白い');
        });
        expect(searchTerms).toHaveBeenCalledWith('cat', expect.any(Number), settings.dictionaryPreferences);
        expect(searchTerms).toHaveBeenCalledWith('おもし', expect.any(Number), settings.dictionaryPreferences);
        root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('');
        expect(root.querySelector<HTMLElement>('[data-newtab-controls]')?.hidden).toBe(true);
        root.remove();
    });

    it('ignores stale kanji detail lookups after switching back to word mode', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({ vid: 12, sid: 12, spelling: '返す', reading: 'かえす', kanjiKeyword: 'return' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, newTabKanjiAutogradeEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: { lookupKanji: vi.fn(async () => []), lookup: vi.fn(async () => []) } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        try {
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.dataset.jpdbReaderRoot = 'true';
            root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
            Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
                visibleWords: [card],
                index: 0,
                sourceLabel: 'JPDB',
                state: { mode: 'kanji', revealAnswer: false },
            });

            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: false };
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            lookup.resolve({ kanji: '返', keyword: 'stale keyword', meanings: ['stale keyword'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await Promise.resolve();
            await Promise.resolve();

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('返す');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('stale keyword');
        } finally {
            restoreCanvas();
        }
    });

    it('does not flip the new-tab card when interacting with revealed details', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <div data-newtab-reading class="jpdb-reader-newtab-answer"></div>
                <div data-newtab-meaning class="jpdb-reader-newtab-meaning">
                    <details><summary>JPDB mnemonic</summary><p>Story text</p></details>
                </div>
            </section>
        `;
        let toggles = 0;
        (controller as unknown as { toggleReveal(root: HTMLElement): void }).toggleReveal = () => {
            toggles += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const summary = root.querySelector<HTMLElement>('summary');
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        expect(summary).not.toBeNull();
        expect(study).not.toBeNull();

        const summaryClickWasNotCanceled = summary!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(summaryClickWasNotCanceled).toBe(true);
        expect(toggles).toBe(0);

        const summaryKeyWasNotCanceled = summary!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        expect(summaryKeyWasNotCanceled).toBe(true);
        expect(toggles).toBe(0);

        const studyClickWasNotCanceled = study!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(studyClickWasNotCanceled).toBe(false);
        expect(toggles).toBe(1);
    });

    it('ignores duplicate pointer navigation clicks from touch browsers', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<button type="button" data-newtab-action="next">Next</button>';
        Object.assign(controller as unknown as { visibleWords: JPDBCard[] }, {
            visibleWords: [{
                vid: 1,
                sid: 1,
                rid: 1,
                spelling: '読む',
                reading: 'よむ',
                frequencyRank: null,
                partOfSpeech: [],
                meanings: [],
                cardState: ['new'],
                pitchAccent: [],
                wordWithReading: null,
                source: 'local',
            }],
        });
        let advances = 0;
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            advances += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const button = root.querySelector('button')!;
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(advances).toBe(1);
    });

    it('routes nested kanji detail buttons and dictionary links to the popup lookup handlers', () => {
        const lookupText = vi.fn();
        const lookupDictionaryReference = vi.fn();
        const showKanjiCard = vi.fn();
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '事情',
            reading: 'じじょう',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['circumstances'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'local',
            sentence: '事情を説明する。',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            lookupText,
            lookupDictionaryReference,
            showKanjiCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="国家" data-dictionary-reading="こっか" data-dictionary="Jitendex">国家</a>
                <button type="button" data-action="similar-word" data-expression="何事" data-reading="なにごと">何事</button>
                <button type="button" data-action="kanji" data-kanji="事">事</button>
            </section>
        `;
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number }, {
            visibleWords: [card],
            index: 0,
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        root.querySelector<HTMLAnchorElement>('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelectorAll<HTMLButtonElement>('button')[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        root.querySelectorAll<HTMLButtonElement>('button')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupDictionaryReference).toHaveBeenCalledWith('国家', 'こっか', 'Jitendex', root.querySelector('a'));
        expect(lookupText).toHaveBeenCalledWith('何事', 'なにごと', root.querySelectorAll('button')[0]);
        expect(showKanjiCard).toHaveBeenCalledWith(card, '事', '事情を説明する。', root.querySelectorAll('button')[1]);
    });

    it('keeps kanji drill-down history and sheet height in hosted new-tab popups', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '漢字', reading: 'かんじ', sentence: '漢字です。' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                popupMode: 'sheet',
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
            };

            await internals.showKanjiLookupCard(card, '漢', '漢字です。');
            const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            popover.style.setProperty('--jpdb-reader-sheet-height', '620px');

            expect(document.querySelector('.jpdb-reader-backdrop')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBe('false');
            expect(popover.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');

            popover.insertAdjacentHTML('beforeend', '<button type="button" data-action="kanji" data-kanji="字">字</button>');
            popover.querySelector<HTMLButtonElement>('[data-kanji="字"]')?.click();

            await waitForExpect(() => {
                const active = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
                expect(active).toBe(popover);
                expect(active.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('620px');
                expect(active.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('字');
                expect(active.querySelector<HTMLButtonElement>('[data-action="kanji-history-back"]')?.title).toBe('Back to kanji: 漢');
            });

            popover.querySelector<HTMLButtonElement>('[data-action="kanji-history-back"]')?.click();

            await waitForExpect(() => {
                expect(popover.querySelector('.jpdb-reader-kanji-display')?.textContent).toBe('漢');
                expect(popover.querySelector<HTMLButtonElement>('[data-action="word-back"]')?.title).toBe('Back to word: 漢字');
                expect(popover.querySelector('[data-action="kanji-history-back"]')).toBeNull();
                expect(popover.style.getPropertyValue('--jpdb-reader-sheet-height')).toBe('620px');
            });
        } finally {
            runtime.destroy();
            restoreCanvas();
            document.body.replaceChildren();
        }
    });

    it('keeps hosted sticky bottom-sheet lookup modeless until explicitly closed', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '大切', reading: 'たいせつ', sentence: '大切です。' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                popupMode: 'sheet',
                stickyBottomSheet: true,
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
            };

            await internals.showKanjiLookupCard(card, '切', '大切です。');
            const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
            const closeButton = popover.querySelector<HTMLButtonElement>('[data-jpdb-reader-sheet-close="true"]');

            expect(document.querySelector('.jpdb-reader-backdrop')).toBeNull();
            expect(popover.getAttribute('aria-modal')).toBe('false');
            expect(popover.classList.contains('jpdb-reader-sheet-sticky')).toBe(true);
            expect(closeButton?.title).toBe('Close drawer');

            closeButton?.click();

            expect(document.querySelector('.jpdb-reader-popover')).toBeNull();
        } finally {
            runtime.destroy();
            restoreCanvas();
            document.body.replaceChildren();
        }
    });

    it('copies the visible kanji from hosted new-tab kanji popups', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const runtime = new NewTabRuntime();
        const writeText = vi.fn(async () => undefined);
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
        const card = newTabTestCard({ spelling: '難波', reading: 'なんば', sentence: '難波です。' });
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            showKanjiLookupCard(card: JPDBCard, kanji: string, sentence?: string): Promise<void>;
        };

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                popupMode: 'popover',
                jpdbKanjiEnabled: false,
                localDictionariesEnabled: false,
                localDictionaryShowKanji: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
            };

            await internals.showKanjiLookupCard(card, '波', '難波です。');
            document.querySelector<HTMLButtonElement>('[data-action="copy-word"]')?.click();

            await waitForExpect(() => {
                expect(writeText).toHaveBeenCalledWith('波');
                expect(document.querySelector('.jpdb-reader-toast')?.textContent).toBe('Copied word.');
            });
        } finally {
            runtime.destroy();
            restoreCanvas();
            if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
            else Reflect.deleteProperty(navigator, 'clipboard');
            document.body.replaceChildren();
        }
    });

    it('dives into hosted popup related vocabulary links and parsed example words', () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '甘言', reading: 'かんげん', sentence: '甘言です。' });
        const related = newTabTestCard({ vid: 77, sid: 88, spelling: '甘言蜜語', reading: 'かんげんみつご', sentence: '甘言蜜語だ。' });
        const lookupText = vi.fn(async () => undefined);
        const showLookupCard = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            parser: { cacheCards(cards: JPDBCard[]): void };
            lookupText: typeof lookupText;
            showLookupCard: typeof showLookupCard;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.lookupText = lookupText;
        internals.showLookupCard = showLookupCard;
        internals.parser.cacheCards([related]);
        const popover = document.createElement('div');
        popover.className = 'jpdb-reader-popover';
        popover.innerHTML = `
            <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="国家" data-dictionary-reading="こっか" data-dictionary="JPDB">
                <span class="jpdb-reader-word" data-vid="11" data-sid="12" tabindex="0">国家</span>
            </a>
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word" data-vid="${related.vid}" data-sid="${related.sid}" data-sentence="甘言蜜語だ。" tabindex="0">甘言蜜語</span>
            </div>
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word" data-vid="991" data-sid="992" data-sentence="未登録語だ。" tabindex="0">未登録語</span>
            </div>
        `;
        document.body.append(popover);

        try {
            internals.installLookupPopoverHandlers(popover, card, card.sentence);
            popover.querySelector<HTMLElement>('a .jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            popover.querySelector<HTMLElement>('.jpdb-reader-example-sentence .jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            popover.querySelectorAll<HTMLElement>('.jpdb-reader-example-sentence .jpdb-reader-word')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(lookupText).toHaveBeenCalledWith('国家', 'こっか', popover.querySelector('a'), expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
            }));
            expect(showLookupCard).toHaveBeenCalledWith(related, '甘言蜜語だ。', popover.querySelector('.jpdb-reader-example-sentence .jpdb-reader-word'), expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
            }));
            expect(lookupText).toHaveBeenCalledWith('未登録語', '未登録語', popover.querySelectorAll('.jpdb-reader-example-sentence .jpdb-reader-word')[1], expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
            }));
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('autoplays term audio when a hosted new-tab dictionary word opens', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const playTermAudio = vi.fn(async () => undefined);
        const renderData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
        };
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            audioActions: { playTermAudio: typeof playTermAudio };
            cardRenderData: { load(): { localEntries: Promise<unknown[]>; all: Promise<typeof renderData> } };
            parser: { canParse(): boolean; isJpdbBackedCard(card: JPDBCard): boolean };
            showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
                autoPlayAudio: true,
                audioAutoPlayMode: 'tap',
                popupMode: 'popover',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
            };
            internals.audioActions = { playTermAudio };
            internals.cardRenderData = {
                load: () => ({ localEntries: Promise.resolve([]), all: Promise.resolve(renderData) }),
            };
            internals.parser = {
                canParse: () => false,
                isJpdbBackedCard: () => true,
            };

            await internals.showLookupCard(card, '月光を見る。');

            expect(playTermAudio).toHaveBeenCalledTimes(1);
            expect(playTermAudio).toHaveBeenCalledWith(card);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('falls back to text lookup for nested kanji buttons without a kanji-card handler', () => {
        const lookupText = vi.fn();
        const card = newTabTestCard({ spelling: '付', reading: 'つく', sentence: '付く。' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            lookupText,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = '<section data-newtab-study><button type="button" data-action="kanji" data-kanji="寸">寸</button></section>';
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number }, {
            visibleWords: [card],
            index: 0,
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const button = root.querySelector<HTMLButtonElement>('button')!;
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(lookupText).toHaveBeenCalledWith('寸', '寸', button);
    });

    it('toggles blurred Immersion Kit translations on the new tab card', () => {
        const settings = { ...DEFAULT_SETTINGS, immersionKitRevealTranslationOnClick: true };
        const onSettingsChange = vi.fn();
        const setImmersionTranslationBlurred = vi.fn((blurred: boolean) => {
            settings.immersionKitRevealTranslationOnClick = blurred;
        });
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            setImmersionTranslationBlurred,
            onSettingsChange,
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.innerHTML = `
            <section data-newtab-study>
                <div class="jpdb-reader-newtab-meaning">
                    <div class="jpdb-reader-example-translation" data-yomu-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="Reveal translation">Either way, there wouldn't have been a peaceful alternative.</div>
                </div>
            </section>
        `;
        let toggles = 0;
        (controller as unknown as { toggleReveal(root: HTMLElement): void }).toggleReveal = () => {
            toggles += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        const translation = root.querySelector<HTMLElement>('.jpdb-reader-example-translation')!;
        const clickWasNotCanceled = translation.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(clickWasNotCanceled).toBe(false);
        expect(settings.immersionKitRevealTranslationOnClick).toBe(false);
        expect(setImmersionTranslationBlurred).toHaveBeenCalledWith(false);
        expect(onSettingsChange).not.toHaveBeenCalled();
        expect(translation.dataset.yomuImmersionTranslationBlurred).toBeUndefined();
        expect(translation.hasAttribute('role')).toBe(false);
        expect(translation.hasAttribute('tabindex')).toBe(false);
        expect(translation.hasAttribute('aria-label')).toBe(false);
        expect(toggles).toBe(0);

        setImmersionTranslationBlurred.mockClear();
        onSettingsChange.mockClear();

        const keyWasNotCanceled = translation.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));

        expect(keyWasNotCanceled).toBe(false);
        expect(settings.immersionKitRevealTranslationOnClick).toBe(true);
        expect(setImmersionTranslationBlurred).toHaveBeenCalledWith(true);
        expect(onSettingsChange).not.toHaveBeenCalled();
        expect(translation.dataset.yomuImmersionTranslationBlurred).toBe('true');
        expect(translation.getAttribute('role')).toBe('button');
        expect(translation.getAttribute('tabindex')).toBe('0');
        expect(translation.getAttribute('aria-label')).toBe('Reveal translation');
        expect(toggles).toBe(0);
    });

    it('renders new-tab Immersion Kit source metadata once and only available controls', () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'Mahou Shoujo Madoka Magica',
                titleSlug: 'mahou-shoujo-madoka-magica',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: '中学生です。',
                sentenceWithFurigana: '',
                translation: 'I am a junior high school student.',
                sourceTitle: 'Mahou Shoujo Madoka Magica',
                titleSlug: 'mahou-shoujo-madoka-magica',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const node = (controller as unknown as {
            renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
        }).renderNewTabImmersionCard(card, examples, 0);

        expect(node.querySelector('.jpdb-reader-example-title')?.textContent).toBe('Mahou Shoujo Madoka Magica');
        expect(node.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/2');
        expect(node.querySelectorAll('.jpdb-reader-example-title')).toHaveLength(1);
        expect(node.querySelector('.jpdb-reader-example-inline-source')).toBeNull();
        const sentence = node.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        expect(sentence?.classList.contains('jpdb-reader-parseable')).toBe(true);
        expect(sentence?.getAttribute('data-immersion-sentence-render')).toBe('');
        expect(sentence?.querySelector('.jpdb-reader-example-target')?.textContent).toBe('中学生');
        const translation = node.querySelector<HTMLElement>('.jpdb-reader-example-translation');
        expect(translation?.dataset.yomuImmersionTranslationBlurred).toBe('true');
        expect(node.querySelector('[data-immersion-action="audio"]')).toBeNull();
        expect(node.querySelector('[data-immersion-action="previous"]')).not.toBeNull();
        expect(node.querySelector('[data-immersion-action="next"]')).not.toBeNull();
    });

    it('plays Immersion Kit audio by default when revealing a new-tab word card', async () => {
        const card = newTabTestCard({ spelling: '発音', reading: 'はつおん' });
        const example: ImmersionKitExample = {
            id: 'ik-1',
            sentence: '発音を確かめる。',
            sentenceWithFurigana: '',
            translation: 'Check the pronunciation.',
            sourceTitle: 'Test Source',
            titleSlug: 'test-source',
            category: 'anime',
            soundFile: 'line.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const played: string[] = [];
        class FakeAudio {
            playbackRate = 1;
            ended = false;
            constructor(public src: string) {}
            addEventListener(): void {}
            play(): Promise<void> {
                played.push(this.src);
                return Promise.resolve();
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', FakeAudio);
        const search = vi.fn(async () => [example]);
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                search,
                mediaUrls: vi.fn((_example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/line.mp3'] : []),
                fetchBlobUrl,
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();

            await waitForExpect(() => expect(played).toEqual(['blob:http://localhost/line.mp3']));
            expect(search).toHaveBeenCalledWith('発音', expect.objectContaining({ immersionKitAutoPlayAudio: true }));
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/line.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl);
        } finally {
            root.remove();
        }
    });

    it('highlights parsed new-tab Immersion Kit targets and opens lookups from example words', async () => {
        const card = newTabTestCard({ vid: 88, sid: 44, spelling: '中学生', reading: 'ちゅうがくせい' });
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const parseContent = vi.fn((root: HTMLElement) => {
            const sentence = root.querySelector<HTMLElement>('[data-immersion-sentence-render]');
            sentence!.innerHTML = 'お母ちゃん<span class="jpdb-reader-word" data-vid="88" data-sid="44" data-sentence="お母ちゃん中学生？" tabindex="0">中学生</span>？';
        });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { getCachedCard: vi.fn(() => card) } as never,
            dictionaries: {} as never,
            parseContent,
            lookupText,
            showLookupCard,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords = [card];
        (controller as unknown as { state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean } }).state = {
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'auto',
            revealAnswer: true,
        };
        const root = document.createElement('main');
        const node = (controller as unknown as {
            renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
            parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void>;
            bindRootEvents(root: HTMLElement): void;
        }).renderNewTabImmersionCard(card, [{
            id: 'ik-1',
            sentence: 'お母ちゃん中学生？',
            sentenceWithFurigana: '',
            translation: 'Are you a middle schooler, kid?',
            sourceTitle: 'Mahou Shoujo Madoka Magica',
            titleSlug: 'mahou-shoujo-madoka-magica',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        }], 0);
        root.append(node);
        document.body.append(root);
        try {
            await (controller as unknown as {
                parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void>;
            }).parseNewTabImmersionExample(node, card, `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`);
            const word = root.querySelector<HTMLElement>('.jpdb-reader-word')!;
            expect(parseContent).toHaveBeenCalledWith(node);
            expect(word.classList.contains('jpdb-reader-example-target')).toBe(true);

            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(card, 'お母ちゃん中学生？', word);
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('uses dark ink for the light-grid popover kanji doodle even in dark theme', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const context = {
            strokeStyle: '',
            lineCap: '',
            lineJoin: '',
            lineWidth: 0,
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => context),
        });
        document.documentElement.style.setProperty('--jpdb-reader-text', '#fff');
        const root = document.createElement('div');
        root.innerHTML = `
            <div class="jpdb-reader-doodle-stage" data-kanji="会">
                <div class="jpdb-reader-doodle-ghost"></div>
                <canvas class="jpdb-reader-doodle-canvas"></canvas>
            </div>
        `;
        const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
        const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
        stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
        canvas.getBoundingClientRect = stage.getBoundingClientRect;

        installKanjiDoodle(root, () => DEFAULT_SETTINGS.interfaceLanguage);
        canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
            clientX: 10,
            clientY: 10,
            pointerId: 1,
            pointerType: 'mouse',
            pressure: 0.5,
        }));
        canvas.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), {
            clientX: 80,
            clientY: 80,
            pointerId: 1,
            pointerType: 'mouse',
            pressure: 0.5,
        }));

        expect(context.strokeStyle).toBe('#141820');
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
        document.documentElement.style.removeProperty('--jpdb-reader-text');
    });

    it('keeps Apple Pencil doodle strokes when the pointer leaves the canvas and suppresses text selection', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        const context = {
            strokeStyle: '',
            fillStyle: '',
            lineCap: '',
            lineJoin: '',
            lineWidth: 0,
            clearRect: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            arc: vi.fn(),
            fill: vi.fn(),
            stroke: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
        };
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: vi.fn(() => context),
        });
        const onChange = vi.fn();
        const root = document.createElement('div');
        root.innerHTML = `
            <div class="jpdb-reader-doodle-stage" data-kanji="会">
                <div class="jpdb-reader-doodle-ghost"></div>
                <canvas class="jpdb-reader-doodle-canvas"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>Show trace</button>
            </div>
            <div data-selection-target>Readings and components</div>
        `;
        document.body.append(root);
        const stage = root.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
        const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
        const trace = root.querySelector<HTMLButtonElement>('[data-doodle-trace]')!;
        const selectionTarget = root.querySelector<HTMLElement>('[data-selection-target]')!;
        stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
        canvas.getBoundingClientRect = stage.getBoundingClientRect;

        installKanjiDoodle(root, () => DEFAULT_SETTINGS.interfaceLanguage, { onChange });
        canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
            clientX: 10,
            clientY: 10,
            pointerId: 9,
            pointerType: 'pen',
            pressure: 0.4,
        }));
        document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), {
            clientX: 120,
            clientY: 120,
            pointerId: 9,
            pointerType: 'pen',
            pressure: 0.6,
            getCoalescedEvents: () => [
                { clientX: 40, clientY: 45, pressure: 0.5 },
                { clientX: 80, clientY: 88, pressure: 0.6 },
            ],
        }));
        document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), {
            clientX: 120,
            clientY: 120,
            pointerId: 9,
            pointerType: 'pen',
            pressure: 0,
        }));

        expect(onChange).toHaveBeenCalledWith([
            expect.arrayContaining([
                expect.objectContaining({ x: 0.1, y: 0.1 }),
                expect.objectContaining({ x: 0.4, y: 0.45 }),
                expect.objectContaining({ x: 0.8, y: 0.88 }),
            ]),
        ]);
        expect(context.arc).toHaveBeenCalled();
        expect(context.lineTo).toHaveBeenCalled();
        expect(document.documentElement.classList.contains('jpdb-reader-doodle-active')).toBe(true);

        const outsideRange = document.createRange();
        outsideRange.selectNodeContents(selectionTarget);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(outsideRange);
        document.dispatchEvent(new Event('selectionchange'));
        expect(document.getSelection()?.isCollapsed).toBe(true);

        const contextMenu = new Event('contextmenu', { bubbles: true, cancelable: true });
        selectionTarget.dispatchEvent(contextMenu);
        expect(contextMenu.defaultPrevented).toBe(true);

        const range = document.createRange();
        range.selectNodeContents(trace);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        const selectStart = new Event('selectstart', { bubbles: true, cancelable: true });
        trace.dispatchEvent(selectStart);
        expect(selectStart.defaultPrevented).toBe(true);
        expect(document.getSelection()?.isCollapsed).toBe(true);

        (root as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
        root.remove();
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            configurable: true,
            value: originalGetContext,
        });
    });

    it('keeps new-tab word readings and meanings off the front side until reveal', async () => {
        const card: JPDBCard = {
            vid: 1,
            sid: 1,
            rid: 1,
            spelling: '返す',
            reading: 'かえす',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['to return'], partOfSpeech: [] }],
            cardState: ['new'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
        };
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');

        (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: true };
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('かえす');
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toContain('to return');
    });

    it('opens dictionary settings from the empty new-tab setup state', () => {
        const showSettings = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings,
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderDictionarySetup(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderDictionarySetup(root: HTMLElement): void }).renderDictionarySetup(root);

        root.querySelector<HTMLButtonElement>('[data-newtab-action="load-dictionary"]')?.click();

        expect(showSettings).toHaveBeenCalledWith('dictionaries');
        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');
    });

    it('does not retry empty dictionary setup in a loading loop', () => {
        vi.useFakeTimers();
        const invalidateCaches = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {} as never,
            dictionaries: { invalidateCaches } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());

        (controller as unknown as { renderDictionarySetup(root: HTMLElement): void }).renderDictionarySetup(root);
        vi.advanceTimersByTime(30_000);

        expect(invalidateCaches).not.toHaveBeenCalled();
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
    });

    it('does not reload dictionary setup on a later new-tab render', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const summary = vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} }));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary' }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: { summary } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('');
        document.body.replaceChildren();
    });

    it('reloads the empty dictionary setup after dictionary settings change', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            immersionKitEnabled: false,
        };
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const summary = vi.fn(async () => settings.dictionaryPreferences.length
            ? {
                dictionaries: [{ title: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' as const }],
                terms: 1,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            }
            : {
                dictionaries: [],
                terms: 0,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const invalidateCaches = vi.fn();
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary,
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');

        settings.dictionaryPreferences = [{ name: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' }];
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, { fallbackToRandom: false });
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        document.body.replaceChildren();
    });

    it('can force-retry dictionary setup when dictionaries appear outside settings', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            localDictionariesEnabled: true,
            dictionaryPreferences: [{ name: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
            immersionKitEnabled: false,
            newTabOfflineEnabled: false,
        };
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const summary = vi.fn()
            .mockResolvedValueOnce({
                dictionaries: [],
                terms: 0,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            })
            .mockResolvedValueOnce({
                dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
                terms: 1,
                kanji: 0,
                termMeta: 0,
                kanjiMeta: 0,
            });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const invalidateCaches = vi.fn();
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                invalidateCaches,
                summary,
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('Start with a dictionary');

        await controller.refreshExternalData();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(invalidateCaches).toHaveBeenCalledTimes(1);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, { fallbackToRandom: false });
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        document.body.replaceChildren();
    });

    it('keeps auto dictionary fallback out of review count mode and uses the shared card limit', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: false,
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {} as never,
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
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
        expect(result.reviewCountMode).toBe(false);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, { fallbackToRandom: false });
    });

    it('falls back from top 2k dictionary words to 6k and then the corpus', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const listRandomTopTerms = vi.fn(async (_limit: number, maxRank: number) => {
            if (maxRank === 2000) return [];
            if (maxRank === 6000) return [];
            return [];
        });
        const listRandomTerms = vi.fn(async () => [{
            expression: '珍語',
            reading: 'ちんご',
            glossary: ['rare word'],
            score: 0,
            dictionary: 'Local',
        }]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                localCardFromEntry: vi.fn(entry => newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms,
                listRandomTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[] }> }).loadWords();

        expect(listRandomTopTerms).toHaveBeenNthCalledWith(1, 180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, { fallbackToRandom: false });
        expect(listRandomTopTerms).toHaveBeenNthCalledWith(2, 180, 6000, DEFAULT_SETTINGS.dictionaryPreferences, { fallbackToRandom: false });
        expect(listRandomTerms).toHaveBeenCalledWith(180, DEFAULT_SETTINGS.dictionaryPreferences);
        expect(result.cards.map(card => card.spelling)).toEqual(['珍語']);
    });

    it('hides counts for dictionary cards while showing review totals', () => {
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const dictionaryCard = newTabTestCard({ spelling: '辞書', source: 'local' });
        const jpdbCard = newTabTestCard({ spelling: '復習', source: 'jpdb' });
        const ankiCard = newTabTestCard({ spelling: '暗記', source: 'anki' });
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; index: number; reviewCountMode: boolean }, {
            visibleWords: [dictionaryCard, jpdbCard, ankiCard],
            index: 0,
            reviewCountMode: false,
        });

        expect((controller as unknown as { newTabCountLabel(card: JPDBCard): string }).newTabCountLabel(dictionaryCard)).toBe('');
        expect((controller as unknown as { newTabCountLabel(card: JPDBCard): string }).newTabCountLabel(jpdbCard)).toBe('1 / 3');
        expect((controller as unknown as { newTabCountLabel(card: JPDBCard): string }).newTabCountLabel(ankiCard)).toBe('1 / 3');
    });

    it('starts on the card front even when the saved new-tab state was revealed', () => {
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'frequency',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: true,
        }));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabSource: 'auto' }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        expect((controller as unknown as { state: unknown }).state).toMatchObject({
            mode: 'kanji',
            sort: 'frequency',
            filter: 'all',
            source: 'dictionary',
            revealAnswer: false,
        });
        localStorage.removeItem('jpdb-reader-newtab-ui');
    });

    it('restores the saved refresh card at the first visible position', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.setItem('jpdb-reader-newtab-current-word', JSON.stringify({
            signature: 'dictionary|word|Dictionaries',
            key: '1:1:読む:よむ',
        }));
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [read, write],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });

        (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, true);

        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords[0]?.spelling).toBe('読む');
        expect(root.querySelector('[data-newtab-count]')?.textContent).toBe('');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('shows cached new-tab cards while refreshing live sources', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        const cachedCard = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const liveCard = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        localStorage.setItem('jpdb-reader-newtab-card-cache', JSON.stringify({
            sourceLabel: 'Dictionaries',
            cards: [cachedCard],
        }));
        const liveEntries = deferred<Array<{ expression: string; reading: string; glossary: string[]; score: number; dictionary: string }>>();
        const cacheCards = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabEnabled: true,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                cacheCards,
                localCardFromEntry: vi.fn(() => liveCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(() => liveEntries.promise),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            const render = controller.renderPage();

            await waitForExpect(() => {
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('読む');
                expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Refreshing...');
            });
            expect(cacheCards).toHaveBeenCalledWith([expect.objectContaining({ spelling: '読む', reading: 'よむ' })]);

            liveEntries.resolve([{
                expression: '書く',
                reading: 'かく',
                glossary: ['to write'],
                score: 1,
                dictionary: 'Local',
            }]);
            await render;

            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
        }
    });

    it('omits popover-style kanji source cards from new-tab kanji details', () => {
        vi.stubGlobal('CSS', { ...(globalThis.CSS ?? {}), escape: (value: string) => value });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                similarKanjiWords: false,
                kanjiOriginGraphEnabled: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const details = (controller as unknown as {
            renderKanjiDetails(card: JPDBCard, kanji: string, info: unknown, rtk: null, vg: null, local: [], similar: []): HTMLElement;
        }).renderKanjiDetails(newTabTestCard({ spelling: '休', source: 'jpdb' }), '休', {
            kanji: '休',
            keyword: 'rest',
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [{ kanji: '亻', keyword: 'person' }, { kanji: '木', keyword: 'tree' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, null, null, [], []);
        expect(details.querySelector('.jpdb-reader-newtab-kanji-sources')).toBeNull();
        expect(details.querySelector('.jpdb-reader-origin-graph-wrap')).not.toBeNull();
        expect(details.querySelector('.jpdb-reader-component-button')).not.toBeNull();
    });

    it('renders new-tab kanji sources open and in settings order', () => {
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                kanjiOriginGraphEnabled: true,
                rtkEnabled: true,
                uchisenEnabled: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const details = (controller as unknown as {
            renderKanjiDetails(card: JPDBCard, kanji: string, info: unknown, rtk: unknown, vg: null, local: [], similar: []): HTMLElement;
        }).renderKanjiDetails(newTabTestCard({ spelling: '付', source: 'jpdb' }), '付', {
            kanji: '付',
            keyword: 'attach',
            frequency: 'Top 1000',
            type: 'Joyo',
            kanken: '',
            heisig: '#1000',
            oldForms: [],
            readings: [
                { reading: 'つ.く', share: '', common: true },
                { reading: 'フ', share: '', common: false },
            ],
            components: [{ kanji: '亻', keyword: 'person' }],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [
                { expression: '付く', reading: 'つく', meaning: 'to stick', url: 'https://jpdb.io/vocabulary/1' },
                { expression: '付ける', reading: 'つける', meaning: 'to attach', url: 'https://jpdb.io/vocabulary/2' },
            ],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }, {
            kanji: '付',
            keyword: 'adhere',
            frameNumber: '1000',
            onYomi: '',
            kunYomi: 'つ.く',
            elements: 'person, inch',
            componentKanji: ['人', '寸'],
            heisigStory: 'Attach the person to the inch.',
            heisigComment: '',
            koohiiStories: [],
        }, null, [], []);

        const sourceLabels = Array.from(details.querySelectorAll<HTMLElement>('.jpdb-reader-source-card > .jpdb-reader-local-title'))
            .map(item => item.textContent?.trim() ?? '');
        expect(sourceLabels.slice(0, 3)).toEqual(['Readings and components', 'RTK', 'Component graph']);
        expect(details.querySelector('.jpdb-reader-newtab-kanji-info-source')?.hasAttribute('open')).toBe(true);
        const rtkSection = details.querySelector('.jpdb-reader-rtk');
        expect(rtkSection).not.toBeNull();
        expect(rtkSection?.hasAttribute('open')).toBe(true);
        expect(details.querySelector('.jpdb-reader-newtab-origin-graph')?.hasAttribute('open')).toBe(true);
        expect(details.querySelector('.jpdb-reader-newtab-kanji-keywords')?.textContent).toContain('adhere');
        const jpdbFacts = details.querySelector('.jpdb-reader-newtab-kanji-info-source .jpdb-reader-kanji-facts')?.textContent ?? '';
        expect(jpdbFacts).toContain('Readings1 common / 2 total');
        expect(jpdbFacts).toContain('JPDB words2 words shown');
        expect(jpdbFacts).toContain('HeisigJPDB #1000');
        expect(jpdbFacts).not.toContain('Frame number');
        expect(rtkSection?.textContent).toContain('Attach the person to the inch.');
        expect(details.querySelector('[data-newtab-uchisen-mount]')).not.toBeNull();
    });
});
