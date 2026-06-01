import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki';
import { listNewTabAnkiCards } from '../../src/reader/anki-new-tab';
import type { ImmersionKitExample } from '../../src/reader/immersion-kit';
import { NewTabController, selectNewTabStudyPool } from '../../src/reader/new-tab-controller';
import { NewTabRuntime } from '../../src/reader/newtab-runtime';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb-review-bridge';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT } from '../../src/reader/kanji-doodle';
import { assessKanjiStrokes, rankKanjiStrokeCandidates } from '../../src/reader/kanji-stroke-grader';
import { createReaderBackdrop, createReaderPopover } from '../../src/reader/popover-shell';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { definitionSourceRows } from '../../src/reader/source-sections';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';

beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.removeItem(NEW_TAB_GRADE_QUEUE_KEY);
    localStorage.removeItem(NEW_TAB_CACHE_KEY);
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

function newTabImmersionExample(query: string): ImmersionKitExample {
    return {
        id: `ik-${query}`,
        sentence: `${query}を見た。`,
        sentenceWithFurigana: '',
        translation: 'I saw it.',
        sourceTitle: 'Test Source',
        titleSlug: 'test-source',
        category: 'anime',
        soundFile: '',
        imageFile: '',
        soundUrl: '',
        imageUrl: '',
    };
}

function newTabSentenceToken(card: JPDBCard, sentence: string): JPDBToken {
    const start = Math.max(0, sentence.indexOf(card.spelling));
    return {
        card,
        start,
        end: start + card.spelling.length,
        length: card.spelling.length,
        rubies: [],
        pitchClass: '',
        sentence,
    };
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

function stubClientRects(element: HTMLElement, rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>): void {
    const domRect = {
        ...rect,
        x: rect.left,
        y: rect.top,
        toJSON: () => rect,
    } as DOMRect;
    const list = [domRect] as unknown as DOMRectList;
    Object.defineProperty(list, 'item', { value: (index: number) => list[index] ?? null });
    Object.defineProperty(element, 'getClientRects', {
        configurable: true,
        value: () => list,
    });
}

function readNewTabGradeQueue(): Array<{
    target: string;
    grade: string;
    attempts: number;
    lastError?: string;
    card: Partial<JPDBCard>;
}> {
    return JSON.parse(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY) ?? '[]') as Array<{
        target: string;
        grade: string;
        attempts: number;
        lastError?: string;
        card: Partial<JPDBCard>;
    }>;
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

function renderNewTabKanjiFront(controller: NewTabController, card: JPDBCard): HTMLElement {
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
        state: { mode: 'kanji', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
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

    it('loads Anki due and new cards through AnkiConnect even when Anki mining is off', async () => {
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
            ankiEnabled: false,
            ankiDeck: 'Yomu',
            ankiModel: '',
        };
        const client = new AnkiConnectClient(() => settings);
        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(actions).toEqual(['deckNames', 'findCards', 'areDue', 'cardsInfo', 'notesInfo', 'findCards', 'cardsInfo', 'notesInfo']);
        expect(cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(cards[0].ankiCardId).toBe(101);
        expect(cards[0].sentence).toBe('本を読む。');
    });

    it('searches every Anki deck returned by AnkiConnect for new-tab reviews', async () => {
        const queries: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            if (request.action === 'deckNames') return new Response(JSON.stringify({ result: ['Yomu', 'Yomu::Anime', 'Yomu Mining', 'Other'], error: null }), { status: 200 });
            if (request.action === 'findCards') {
                queries.push(String(request.params.query ?? ''));
                return new Response(JSON.stringify({ result: [], error: null }), { status: 200 });
            }
            return new Response(JSON.stringify({ result: [], error: null }), { status: 200 });
        });

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        };
        const client = new AnkiConnectClient(() => settings);

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

    it('respects Anki due timing before filling with new cards', async () => {
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            const query = String(request.params.query ?? '');
            const cards = Array.isArray(request.params.cards) ? request.params.cards.map(Number) : [];
            const notes = Array.isArray(request.params.notes) ? request.params.notes.map(Number) : [];
            const result = (() => {
                if (request.action === 'deckNames') return ['Yomu'];
                if (request.action === 'findCards') return query.includes('is:new') ? [203] : [201, 202];
                if (request.action === 'areDue') return cards.map(cardId => cardId === 201);
                if (request.action === 'cardsInfo') return cards.map(cardId => ({
                    cardId,
                    note: cardId,
                    deckName: 'Yomu',
                    queue: cardId === 203 ? 0 : 1,
                    type: cardId === 203 ? 0 : 1,
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
            })();
            return new Response(JSON.stringify({ result, error: null }), { status: 200 });
        });

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        };
        const client = new AnkiConnectClient(() => settings);

        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(cards.map(card => card.spelling)).toEqual(['期限', '新規']);
    });

    it('does not query AnkiConnect for new-tab Anki cards when the new-tab Anki toggle is off', async () => {
        const fetchMock = vi.fn(() => Promise.reject(new Error('fetch should not be called')));
        vi.stubGlobal('fetch', fetchMock);

        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: false,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        };
        const client = new AnkiConnectClient(() => settings);

        await expect(listNewTabAnkiCards(client, settings, 10)).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
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

    it('scans past the first Anki candidate window to find usable new-tab cards', async () => {
        const ids = Array.from({ length: 260 }, (_, index) => index + 1);
        const cardInfoBatchSizes: number[] = [];
        const noteInfoBatchSizes: number[] = [];
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            const cards = Array.isArray(request.params.cards) ? request.params.cards.map(Number) : [];
            const notes = Array.isArray(request.params.notes) ? request.params.notes.map(Number) : [];
            const result = (() => {
                if (request.action === 'deckNames') return ['Yomu'];
                if (request.action === 'findCards') return ids;
                if (request.action === 'areDue') return cards.map(() => true);
                if (request.action === 'cardsInfo') {
                    cardInfoBatchSizes.push(cards.length);
                    return cards.map(cardId => ({
                        cardId,
                        note: cardId,
                        deckName: 'Yomu',
                        queue: 2,
                        type: 2,
                        due: cardId,
                    }));
                }
                if (request.action === 'notesInfo') {
                    noteInfoBatchSizes.push(notes.length);
                    return notes.map(noteId => ({
                        noteId,
                        modelName: 'Yomu Japanese',
                        tags: [],
                        cards: [noteId],
                        fields: noteId === 260
                            ? {
                                Expression: { value: '突破' },
                                Reading: { value: 'とっぱ' },
                                Meaning: { value: 'breakthrough' },
                            }
                            : {},
                    }));
                }
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
        const cards = await listNewTabAnkiCards(client, settings, 1);

        expect(cards.map(card => card.spelling)).toEqual(['突破']);
        expect(cardInfoBatchSizes).toEqual([250, 10]);
        expect(noteInfoBatchSizes).toEqual([100, 100, 60]);
    });

    it('uses broad Anki due ordering across configured and imported note types', async () => {
        const queries: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            const query = String(request.params.query ?? '');
            const cards = Array.isArray(request.params.cards) ? request.params.cards.map(Number) : [];
            const notes = Array.isArray(request.params.notes) ? request.params.notes.map(Number) : [];
            const result = (() => {
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
        const cards = await listNewTabAnkiCards(client, settings, 2);

        expect(cards.map(card => card.spelling)).toEqual(['外部', '限定']);
        expect(queries).toEqual([
            '(deck:"Yomu" OR deck:"Imported") -is:suspended (is:due OR is:learn)',
        ]);
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

    it('expands word cards into separate kanji practice cards in kanji mode', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, jpdbMiningEnabled: false, immersionKitEnabled: false }),
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
        try {
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.dataset.jpdbReaderRoot = 'true';
            root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
            const ankiWord = newTabTestCard({ spelling: '暗記', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: [ankiWord],
                sourceLabel: 'Anki',
                reviewCountMode: true,
                state: { mode: 'kanji', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false },
            });

            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            const visible = (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords;
            expect(visible.map(card => card.spelling)).toEqual(['暗', '記']);
            expect(visible.every(card => card.source === 'anki')).toBe(true);
            expect(visible.every(card => card.reviewSource === undefined)).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('26263:1:暗記:暗記');
            expect(root.querySelector('[data-grade]')).toBeNull();
            expect(Array.from(root.querySelectorAll<HTMLElement>('[data-newtab-controls] [data-newtab-action]'))
                .map(element => element.dataset.newtabAction)).toEqual(['previous', 'reveal', 'next']);
        } finally {
            restoreCanvas();
        }
    });

    it('keeps live JPDB kanji review cards gradeable in kanji mode', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const grade = vi.fn();
        const reveal = vi.fn();
        const requestCurrent = vi.fn();
        const liveStatus = {
            connected: true,
            loginRequired: false,
            message: '',
            card: {
                id: 'kb,記',
                kind: 'kanji' as const,
                phase: 'front' as const,
                prompt: 'record',
                answer: '記',
                spelling: '',
                reading: '',
                sentence: '',
                kanji: '記',
                keyword: 'record',
                itemsLeft: 7,
                href: 'https://jpdb.io/review?c=kb,%E8%A8%98',
            },
        };
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                jpdbMiningEnabled: true,
                enableReviews: true,
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'live-review',
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => liveStatus,
                requestCurrent,
                reveal,
                grade,
            } as never,
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
        try {
            Object.assign(controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                state: { mode: 'kanji', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            });
            const result = await (controller as unknown as { loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadJpdbWords();
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
            }, {
                allWords: result.cards,
                sourceLabel: result.sourceLabel,
                reviewCountMode: result.reviewCountMode === true,
            });
            (controller as unknown as { bindRootEvents(root: HTMLElement): void; applyWords(root: HTMLElement, preferStoredWord: boolean): void }).bindRootEvents(root);
            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords[0]).toMatchObject({
                spelling: '記',
                reviewSource: 'jpdb-live',
                jpdbReviewId: 'kb,記',
            });
            expect(root.querySelector('[data-grade]')).toBeNull();

            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();

            expect(reveal).toHaveBeenCalled();
            expect(root.querySelector('[data-grade="okay"]')).not.toBeNull();

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(grade).toHaveBeenCalledWith('okay');
            expect(requestCurrent).toHaveBeenCalled();
        } finally {
            root.remove();
            restoreCanvas();
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
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
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

    it('supplements tiny kanji review queues with dictionary kanji cards', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
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
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }]),
                listKanjiCharacters: vi.fn(async () => ['書', '日', '本', '語']),
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

            expect(result.sourceLabel).toBe('JPDB + Dictionary');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読', '書', '日', '本', '語']);
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

            expect(prompt.textContent).toContain('Loading kanji details');
            await waitForExpect(() => {
                expect(prompt.textContent).toContain('No kanji keyword found.');
            });
            expect(prompt.textContent).not.toContain('Loading');
        } finally {
            restoreCanvas();
        }
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
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 3 · JPDB ⇄');

        (controller as unknown as { index: number }).index = 1;
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[1]!);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('2 / 3 · Anki ⇄');

        (controller as unknown as { index: number }).index = 2;
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[2]!);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
    });

    it('lets the status footer cycle JPDB, Anki, and Dictionary and persists the source setting', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' });
        const ankiCard = newTabTestCard({ vid: -1, sid: -1, rid: 101, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const dictionaryCard = newTabTestCard({ vid: -2, sid: 0, spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const controller = new NewTabController({
            getSettings: () => settings,
            anki: {
                listNewTabCards: vi.fn(async () => [ankiCard]),
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
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => dictionaryCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }]),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
        const status = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toContain('JPDB ⇄');
        expect(status.disabled).toBe(false);
        expect(status.closest('[data-newtab-controls]')).toBeNull();
        expect(Array.from(document.querySelectorAll<HTMLElement>('[data-newtab-controls] [data-newtab-action]'))
            .map(element => element.dataset.newtabAction)).toEqual(['previous', 'reveal', 'next']);
        expect(status.dataset.sourceToggleTarget).toBe('anki');

        status.click();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
        });
        const ankiStatus = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(ankiStatus.textContent).toContain('Anki ⇄');
        expect(ankiStatus.disabled).toBe(false);
        expect(ankiStatus.dataset.sourceToggleTarget).toBe('dictionary');

        ankiStatus.click();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('dictionary');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        });
        const dictionaryStatus = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(dictionaryStatus.textContent).toContain('Dictionary ⇄');
        expect(dictionaryStatus.disabled).toBe(false);
        expect(dictionaryStatus.dataset.sourceToggleTarget).toBe('jpdb');

        document.body.replaceChildren();
        await controller.renderPage();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('dictionary');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        });

        document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.click();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('jpdb');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
        });

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('lets Anki-only users toggle to Dictionary without exposing JPDB', () => {
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                jpdbMiningEnabled: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
            } as never,
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
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [ankiCard],
            sourceLabel: 'Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, ankiCard);

        const status = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toBe('1 / 1 · Anki ⇄');
        expect(status.dataset.newtabAction).toBe('source-toggle');
        expect(status.dataset.sourceToggleTarget).toBe('dictionary');
        expect(status.title).toContain('Dictionary');
        expect(status.disabled).toBe(false);
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

    it('keeps auto JPDB cards first and appends dictionary cards for a tiny queue', async () => {
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

        expect(result.cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(result.sourceLabel).toBe('JPDB + Dictionary');
        expect(loadDictionary).toHaveBeenCalled();
    });

    it('navigates from a single SRS card into supplemental dictionary cards', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const dictionaryCard = newTabTestCard({ vid: -2, sid: 0, spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                immersionKitEnabled: false,
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
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => dictionaryCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }]),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('読む');

        document.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();
        await waitForExpect(() => {
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        });

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('loads another dictionary batch when next reaches the end of the visible queue', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const batches = [
            [{ expression: '読む', reading: 'よむ', glossary: ['to read'], score: 1, dictionary: 'Local' }],
            [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }],
        ];
        const listRandomTopTerms = vi.fn(async () => batches.shift() ?? []);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(entry => newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local', reviewSource: 'dictionary' })),
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

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('読む');

        document.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();

        await waitForExpect(() => {
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む', '書く']);
        });
        expect(listRandomTopTerms).toHaveBeenCalledTimes(2);

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('loads more dictionary kanji when kanji navigation reaches the end of the visible queue', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'random',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: false,
        }));
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const listKanjiCharacters = vi.fn(async (limit: number) => limit > 180 ? ['日', '語'] : ['日']);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => []),
                listRandomTerms: vi.fn(async () => []),
                listKanjiCharacters,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();
            await waitForExpect(() => {
                const state = controller as unknown as { visibleWords: JPDBCard[]; index: number };
                expect(state.visibleWords[state.index]?.spelling).toBe('日');
            });

            document.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();

            await waitForExpect(() => {
                const state = controller as unknown as { visibleWords: JPDBCard[]; index: number };
                expect(state.visibleWords[state.index]?.spelling).toBe('語');
                expect(state.visibleWords.map(card => card.spelling)).toEqual(['日', '語']);
            });
            expect(listKanjiCharacters).toHaveBeenNthCalledWith(1, 180, DEFAULT_SETTINGS.dictionaryPreferences);
            expect(listKanjiCharacters).toHaveBeenNthCalledWith(2, 181, DEFAULT_SETTINGS.dictionaryPreferences);
        } finally {
            restoreCanvas();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('uses JPDB cards first in auto source without interleaving Anki cards', async () => {
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

        expect(result.cards.map(card => card.spelling)).toEqual(['日本語', '辞書', '復習']);
        expect(result.sourceLabel).toBe('JPDB');
    });

    it('falls through to Anki in auto source only when JPDB has no cards', async () => {
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
                listDeckCards: vi.fn(async () => []),
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

        expect(result.cards.map(card => card.spelling)).toEqual(['暗記', '例文']);
        expect(result.sourceLabel).toBe('Anki');
    });

    it('requests a larger Anki batch when navigation reaches the end of the review queue', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const first = newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const second = newTabTestCard({ vid: -2, sid: -2, spelling: '例文', reading: 'れいぶん', source: 'anki', reviewSource: 'anki' });
        const listNewTabCards = vi.fn(async (limit = 180) => limit > 180 ? [first, second] : [first]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                apiKey: '',
                immersionKitEnabled: false,
            }),
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {
                hasDictionaries: vi.fn(async () => false),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');

        document.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();

        await waitForExpect(() => {
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('例文');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['暗記', '例文']);
        });
        expect(listNewTabCards).toHaveBeenNthCalledWith(1, 180);
        expect(listNewTabCards).toHaveBeenNthCalledWith(2, 181);

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
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

    it('loads JPDB review cards from every eligible deck when the all-decks setting is selected', async () => {
        const lateDeckCard = newTabTestCard({ spelling: '遅番', reading: 'おそばん', source: 'jpdb' });
        const decks = Array.from({ length: 8 }, (_, index) => ({ id: `deck-${index + 1}`, name: `Deck ${index + 1}` }));
        const listDeckCards = vi.fn(async (deckId: string) => deckId === 'deck-8' ? [lateDeckCard] : []);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'all',
                newTabJpdbReviewMode: 'api-vocabulary',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDecks: vi.fn(async () => decks),
                listDeckCards,
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

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => card.spelling)).toEqual(['遅番']);
        expect(result.cards[0]?.reviewSource).toBe('jpdb-api');
        expect(listDeckCards).toHaveBeenCalledWith('deck-8', 36, { scheduledOnly: true });
    });

    it('seeds no-key JPDB new-tab words from public kanji vocabulary instead of fixed starter words', async () => {
        const lookup = vi.fn(async (kanji: string) => ({
            kanji,
            keyword: `${kanji} keyword`,
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [{
                expression: `${kanji}語`,
                reading: `${kanji}ご`,
                meaning: `${kanji} word`,
                url: `https://jpdb.io/vocabulary/${kanji.charCodeAt(0)}/${encodeURIComponent(`${kanji}語`)}/${encodeURIComponent(`${kanji}ご`)}`,
            }],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const publicSearch = vi.fn(async () => []);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {} as never,
            jpdbKanji: { lookup } as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {} as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(false);
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.cards.every(card => card.source === 'jpdb')).toBe(true);
        expect(result.cards[0]?.spelling).toMatch(/語$/u);
        expect(lookup).toHaveBeenCalled();
        expect(publicSearch).not.toHaveBeenCalledWith('日本語', expect.any(Number));
        expect(publicSearch).not.toHaveBeenCalledWith('読む', expect.any(Number));
    });

    it('mixes public JPDB and local dictionary words when no API key is configured', async () => {
        const publicSearch = vi.fn(async (query: string) => [
            newTabTestCard({
                vid: query.charCodeAt(0),
                sid: 0,
                spelling: query,
                reading: query,
                source: 'jpdb',
                cardState: ['not-in-deck'],
            }),
        ]);
        const listRandomTopTerms = vi.fn(async () => [
            { expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' },
            { expression: '見る', reading: 'みる', glossary: ['to see'], score: 1, dictionary: 'Local' },
        ]);
        const kanjiLookup = vi.fn(async () => null);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: kanjiLookup } as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                localCardFromEntry: vi.fn(entry => newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
                    terms: 2,
                    kanji: 0,
                    termMeta: 0,
                    kanjiMeta: 0,
                })),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(publicSearch).toHaveBeenCalledWith('書く', 1);
        expect(publicSearch).toHaveBeenCalledWith('見る', 1);
        expect(kanjiLookup).not.toHaveBeenCalled();
        expect(result.sourceLabel).toBe('JPDB + Dictionary');
        expect(result.cards.some(card => card.source === 'jpdb')).toBe(true);
        expect(result.cards.some(card => card.source === 'local')).toBe(true);
        expect(result.cards.map(card => card.spelling)).toEqual(expect.arrayContaining(['書く', '見る']));
    });

    it('shows dictionary fallback cards without waiting for slow public JPDB cards', async () => {
        vi.useFakeTimers();
        const publicSearch = vi.fn(async (query: string) => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return [newTabTestCard({ spelling: `${query}公開`, reading: `${query}こうかい`, source: 'jpdb' })];
        });
        const listRandomTopTerms = vi.fn(async () => [
            { expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' },
        ]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }),
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
            } as never,
            parser: {
                localCardFromEntry: vi.fn(entry => newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
                    terms: 1,
                    kanji: 0,
                    termMeta: 0,
                    kanjiMeta: 0,
                })),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();
            await vi.advanceTimersByTimeAsync(1000);
            const result = await resultPromise;

            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);

            await vi.advanceTimersByTimeAsync(3000);
        } finally {
            vi.useRealTimers();
        }
    });

    it('loads JPDB new-tab cards even when JPDB writes are disabled', async () => {
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

        expect(result.cards.map(card => card.spelling)).toEqual(['安定']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(listDeckCards).toHaveBeenCalled();
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('falls back to fresh words instead of showing JPDB cards outside SRS timing', async () => {
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '既知', source: 'jpdb', cardState: ['known'] })]);
        const publicSearch = vi.fn(async (query: string) => [
            newTabTestCard({ spelling: `${query}公開`, reading: `${query}こうかい`, source: 'jpdb', cardState: ['not-in-deck'] }),
        ]);
        const listRandomTopTerms = vi.fn(async () => [
            { expression: '新語', reading: 'しんご', glossary: ['new word'], score: 1, dictionary: 'Local' },
        ]);
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
                listDeckCards,
            } as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                localCardFromEntry: vi.fn(entry => newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local' })),
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

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(listDeckCards).toHaveBeenCalledWith('deck', 180, { scheduledOnly: true });
        expect(result.cards.map(card => card.spelling)).not.toContain('既知');
        expect(result.cards.map(card => card.spelling)).toEqual(expect.arrayContaining(['新語公開', '新語']));
        expect(result.sourceLabel).toBe('JPDB + Dictionary');
        expect(result.reviewCountMode).toBe(false);
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

    it('queues offline JPDB grades and advances the cached review card', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const reviewCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabOfflineEnabled: true,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard } as never,
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
        document.body.append(root);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [first, second],
            visibleWords: [first, second],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB (offline)',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
        });
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, first);

        await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'okay', attempts: 0 });
        expect(queue[0]?.card.spelling).toBe('安定');
        expect(reviewCard).not.toHaveBeenCalled();
        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む']);
        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('読む');
        root.remove();
    });

    it('flushes queued JPDB grades when the source is reachable again', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify([{
            id: 'jpdb-api:1:1:安定:あんてい',
            at: 1,
            target: 'jpdb-api',
            card,
            grade: 'easy',
            attempts: 0,
        }]));
        const reviewCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }),
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard } as never,
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

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('keeps queued JPDB grades when sync fails so they can retry later', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify([{
            id: 'jpdb-api:1:1:安定:あんてい',
            at: 1,
            target: 'jpdb-api',
            card,
            grade: 'hard',
            attempts: 0,
        }]));
        const reviewCard = vi.fn(async () => { throw new Error('offline'); });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }),
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard } as never,
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

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'hard', attempts: 1, lastError: 'offline' });
    });

    it('does not let a failed Anki sync block a reachable JPDB queued grade', async () => {
        const ankiCard = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify([
            {
                id: 'anki:404',
                at: 1,
                target: 'anki',
                card: ankiCard,
                grade: 'fail',
                attempts: 0,
            },
            {
                id: 'jpdb-api:1:1:安定:あんてい',
                at: 2,
                target: 'jpdb-api',
                card: jpdbCard,
                grade: 'easy',
                attempts: 0,
            },
        ]));
        const answerCard = vi.fn(async () => { throw new Error('anki offline'); });
        const reviewCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, ankiEnabled: true }),
            anki: { answerCard } as never,
            jpdb: { reviewCard } as never,
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

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(answerCard).toHaveBeenCalledWith(404, 'fail');
        expect(reviewCard).toHaveBeenCalledWith(jpdbCard, 'easy');
        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'anki', grade: 'fail', attempts: 1, lastError: 'anki offline' });
    });

    it('flushes queued Anki grades through AnkiConnect', async () => {
        const card = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify([{
            id: 'anki:404',
            at: 1,
            target: 'anki',
            card,
            grade: 'pass',
            attempts: 0,
        }]));
        const answerCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }),
            anki: { answerCard } as never,
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

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('retries queued grades when the browser comes back online', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify([{
            id: 'jpdb-api:1:1:安定:あんてい',
            at: 1,
            target: 'jpdb-api',
            card,
            grade: 'okay',
            attempts: 0,
        }]));
        const reviewCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }),
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard } as never,
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
        document.body.append(root);
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        window.dispatchEvent(new Event('online'));

        await waitForExpect(() => {
            expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
        });
        controller.destroy();
        root.remove();
    });

    it('hides grade buttons for offline live JPDB review cards that cannot be replayed', () => {
        const card = newTabTestCard({ vid: 0, sid: 0, rid: 0, spelling: '記', reading: 'record', source: 'jpdb', reviewSource: 'jpdb-live', jpdbReviewId: 'kb,記' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
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
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'JPDB (offline)',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-grade]')).toBeNull();
        expect(root.querySelector('[data-newtab-action="reveal"]')).not.toBeNull();
    });

    it('does not reload a just-graded live JPDB card from a stale bridge status', async () => {
        const card = newTabTestCard({
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: '記',
            reading: '記',
            source: 'jpdb',
            reviewSource: 'jpdb-live',
            jpdbReviewId: 'kb,記',
            kanjiKeyword: 'record',
        });
        const liveStatus = {
            connected: true,
            loginRequired: false,
            message: '',
            card: {
                id: 'kb,記',
                kind: 'kanji' as const,
                phase: 'back' as const,
                prompt: 'record',
                answer: '記',
                spelling: '',
                reading: '',
                sentence: '',
                kanji: '記',
                keyword: 'record',
                itemsLeft: 1,
                href: 'https://jpdb.io/review?c=kb,%E8%A8%98&r=1',
            },
        };
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                jpdbMiningEnabled: true,
                enableReviews: true,
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
                latestStatus: () => liveStatus,
                requestCurrent: vi.fn(),
                grade: vi.fn(),
            } as never,
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
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB Live review',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
        });
        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            await waitForExpect(() => {
                expect((controller as unknown as { allWords: JPDBCard[] }).allWords.map(item => item.jpdbReviewId)).not.toContain('kb,記');
            });
        } finally {
            root.remove();
        }
    });

    it('hides grade buttons for cached Anki review cards when Anki is disabled', () => {
        const card = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                newTabAnkiEnabled: true,
                enableReviews: true,
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
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: true },
        });

        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        expect(root.querySelector('[data-grade]')).toBeNull();
        expect(root.querySelector('[data-newtab-action="reveal"]')).not.toBeNull();
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

    it('refreshes the review source after grading while preserving the next visible card', () => {
        const graded = newTabTestCard({ vid: 1, sid: 1, spelling: '採点', source: 'jpdb', reviewSource: 'jpdb-api' });
        const next = newTabTestCard({ vid: 2, sid: 1, spelling: '次', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }),
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
        const reload = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
        }, {
            allWords: [graded, next],
            visibleWords: [graded, next],
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
            loadWordsInto: reload,
        });

        (controller as unknown as { advanceAfterGrade(root: HTMLElement, card: JPDBCard): void }).advanceAfterGrade(root, graded);

        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('次');
        expect(reload).toHaveBeenCalledWith(root, true, { useOfflineCache: false });
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

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('Loading kanji details...');
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
            dictionaries: { lookupKanji: vi.fn(async () => [{ character: '柔', onyomi: [], kunyomi: [], tags: [], meanings: ['soft', 'flexible', 'yielding'], dictionary: 'KANJIDIC' }]), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
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

    it('enriches new-tab word pitch from local dictionary metadata without a JPDB API key', async () => {
        const card = newTabTestCard({ spelling: '計量', reading: 'けいりょう', source: 'local', pitchAccent: [] });
        const lookupTermMeta = vi.fn(async () => [{
            dictionary: 'Jitendex',
            expression: '計量',
            mode: 'pitch',
            data: { reading: 'けいりょう', position: 0 },
        }]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, showPitchAccent: true }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: vi.fn(async () => { throw new Error('public pitch should not be needed'); }) },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
        await waitForExpect(() => {
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        });
        expect(lookupTermMeta).toHaveBeenCalledWith('計量', 12, expect.any(Array));
    });

    it('does not let slow local metadata block new-tab public pitch fallback', async () => {
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', pitchAccent: [] });
        const localMeta = deferred<never[]>();
        const lookupTermMeta = vi.fn(() => localMeta.promise);
        const publicPitch = vi.fn(async () => ['HLL']);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, showPitchAccent: true }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
                expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(true);
            });
            expect(card.pitchAccent).toEqual(['HLL']);
        } finally {
            localMeta.resolve([]);
            root.remove();
        }
    });

    it('prefetches lookahead word pitch before the next card is shown', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '軽い', reading: 'かるい', pitchAccent: [] });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '椅子', reading: 'いす', pitchAccent: [] });
        const publicPitch = vi.fn(async () => ['LHH']);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, showPitchAccent: true }, {
            jpdbPublicPitch: { lookup: publicPitch },
        });
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
            visibleWords: [first, second],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, first);

            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('軽い', 'かるい');
                expect(publicPitch).toHaveBeenCalledWith('椅子', 'いす');
            });
            expect(second.pitchAccent).toEqual(['LHH']);
        } finally {
            root.remove();
        }
    });

    it('preloads current study word audio as soon as the word front renders', () => {
        const card = newTabTestCard({ spelling: '月光', reading: 'げっこう' });
        const preloadWordAudio = vi.fn();
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            preloadWordAudio,
        });
        const root = renderNewTabWordFront(controller, card);

        try {
            expect(preloadWordAudio).toHaveBeenCalledWith(card);
        } finally {
            root.remove();
        }
    });

    it('does not expose stale JPDB supplemental slugs as new-tab readings', async () => {
        const publicPitch = vi.fn(async () => ['LHHH']);
        const card = newTabTestCard({ spelling: '日本語', reading: 'used-in', source: 'jpdb', pitchAccent: [] });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, showPitchAccent: true }, {
            jpdbPublicPitch: { lookup: publicPitch },
        });

        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        expect(word.dataset.reading).toBe('日本語');
        await waitForExpect(() => {
            expect(publicPitch).toHaveBeenCalledWith('日本語', '日本語');
        });
    });

    it('parses the front sentence with the same content parser used by other card text', async () => {
        const sentence = 'お母ちゃん中学生？';
        const card = newTabTestCard({
            vid: 88,
            sid: 44,
            spelling: '中学生',
            reading: 'ちゅうがくせい',
            sentence,
            cardState: ['due'],
            pitchAccent: ['LH'],
        });
        const parseContent = vi.fn(async (prompt: HTMLElement) => {
            const sentenceNode = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
            sentenceNode!.innerHTML = 'お母ちゃん<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="-1" data-sid="-1" data-sentence="お母ちゃん中学生？" tabindex="0">中学生</span>？';
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
                expect(parseContent).toHaveBeenCalledWith(
                    root.querySelector('[data-newtab-prompt]'),
                    expect.objectContaining({ jpdbTimeoutMs: 1_200 }),
                );
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word');
                expect(word?.textContent).toBe('中学生');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
                expect(word?.classList.contains('jpdb-due')).toBe(true);
                expect(word?.classList.contains('jpdb-not-in-deck')).toBe(false);
                expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(true);
                expect(word?.dataset.vid).toBe('88');
                expect(word?.dataset.sid).toBe('44');
            });
        } finally {
            root.remove();
        }
    });

    it('opens lookups from parsed front sentence words', async () => {
        const sentence = 'お連れ様との会話が 日本語でしたので';
        const current = newTabTestCard({ spelling: '日本語', reading: 'にほんご', sentence });
        const related = newTabTestCard({ vid: 1198880, sid: 0, spelling: '会話', reading: 'かいわ', sentence });
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const parseContent = vi.fn((prompt: HTMLElement) => {
            const sentenceNode = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
            sentenceNode!.innerHTML = 'お連れ様との<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-vid="1198880" data-sid="0" data-pitch-class="heiban" data-sentence="お連れ様との会話が 日本語でしたので" data-expression="会話" data-reading="かいわ" tabindex="0">会話</span>が 日本語でしたので';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            parser: {
                getCachedCard: vi.fn((vid: number, sid: number) => vid === related.vid && sid === related.sid ? related : undefined),
            } as never,
            showLookupCard,
            lookupText,
        });
        const root = renderNewTabWordFront(controller, current);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')).not.toBeNull();
            });
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word')!;
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(related, sentence, word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('uses parsed front sentence word geometry before the prompt fallback', async () => {
        const sentence = '(メイ)の!? (メイ) 座って食べなさい。';
        const current = newTabTestCard({ spelling: '食べる', reading: 'たべる', sentence });
        const related = newTabTestCard({ vid: 1291770, sid: 0, spelling: '座', reading: 'ざ', sentence });
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const parseContent = vi.fn((prompt: HTMLElement) => {
            const sentenceNode = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
            sentenceNode!.innerHTML = '(<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="0" data-expression="メイ" data-reading="メイ">メイ</span>)の!? (メイ) <span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="1291770" data-sid="0" data-pitch-class="unknown" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="0" data-expression="座" data-reading="ざ">座</span>って食べなさい。';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            parser: {
                getCachedCard: vi.fn((vid: number, sid: number) => vid === related.vid && sid === related.sid ? related : undefined),
            } as never,
            showLookupCard,
            lookupText,
        });
        const root = renderNewTabWordFront(controller, current);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="座"]')).not.toBeNull();
            });
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="座"]')!;
            stubClientRects(word, { left: 40, top: 20, right: 62, bottom: 52, width: 22, height: 32 });
            const clickWasNotCanceled = prompt.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: 50,
                clientY: 32,
            }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(related, sentence, word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalledWith('食べる', 'たべる', prompt);
        } finally {
            root.remove();
        }
    });

    it('uses parsed front sentence word data when a card is not cached yet', async () => {
        const sentence = '(メイ)の!? (メイ) 座って食べなさい。';
        const current = newTabTestCard({ spelling: '食べる', reading: 'たべる', sentence });
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const parseContent = vi.fn((prompt: HTMLElement) => {
            const sentenceNode = prompt.querySelector<HTMLElement>('[data-newtab-sentence-render]');
            sentenceNode!.innerHTML = '(<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="0" data-expression="メイ" data-reading="メイ">メイ</span>)の!?';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            parser: { getCachedCard: vi.fn(() => undefined) } as never,
            showLookupCard,
            lookupText,
        });
        const root = renderNewTabWordFront(controller, current);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="メイ"]')).not.toBeNull();
            });
            const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word[data-expression="メイ"]')!;
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(lookupText).toHaveBeenCalledWith('メイ', 'メイ', word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalledWith('食べる', 'たべる', expect.any(HTMLElement));
            expect(showLookupCard).not.toHaveBeenCalled();
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
        void (controller as unknown as { loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> }).loadImmersionExamples(card);
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe('お母ちゃん中学生？');
            });
            expect(search).toHaveBeenCalledWith(
                '中学生',
                expect.objectContaining({ immersionKitEnabled: true }),
                expect.objectContaining({ requestLimit: 48, resultLimit: 6 }),
            );
        } finally {
            root.remove();
        }
    });

    it('starts current new-tab Immersion Kit sentence loading before reveal', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const search = vi.fn(async (_query: string): Promise<ImmersionKitExample[]> => [{
            ...newTabImmersionExample('中学生'),
            sentence: 'お母ちゃん中学生？',
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
            expect(search.mock.calls.map(([query]) => query).filter(query => query === '中学生')).toHaveLength(1);
        } finally {
            root.remove();
        }
    });

    it('adds async front sentences without replacing the rendered term word', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const examples = deferred<ImmersionKitExample[]>();
        const parseContent = vi.fn(async () => undefined);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parseContent,
            immersionKit: {
                search: vi.fn(() => examples.promise),
                mediaUrls: vi.fn(() => []),
            } as never,
        });
        void (controller as unknown as { loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> }).loadImmersionExamples(card);
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);
        const term = root.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')!;
        term.dataset.stabilityMarker = 'keep-me';

        try {
            examples.resolve([{
                ...newTabImmersionExample('中学生'),
                sentence: 'お母ちゃん中学生？',
            }]);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe('お母ちゃん中学生？');
            });

            expect(root.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word')).toBe(term);
            expect(term.dataset.stabilityMarker).toBe('keep-me');
            expect(term.dataset.sentence).toBe('お母ちゃん中学生？');
            expect(parseContent).toHaveBeenCalledWith(
                root.querySelector('[data-newtab-prompt]'),
                expect.objectContaining({ jpdbTimeoutMs: 1_200 }),
            );
        } finally {
            root.remove();
        }
    });

    it('prefetches current and next new-tab Immersion Kit examples before reveal', async () => {
        const first = newTabTestCard({ spelling: '一番', reading: 'いちばん' });
        const second = newTabTestCard({ spelling: '二番', reading: 'にばん' });
        const search = vi.fn(async (query: string): Promise<ImmersionKitExample[]> => [newTabImmersionExample(query)]);
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/media');
        const parse = vi.fn(async (_paragraphs: string[], _options?: unknown) => [[]]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: true }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.id}.jpg`] : [`https://media.test/${example.id}.mp3`]
                )),
                fetchBlobUrl,
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });
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
            visibleWords: [first, second],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, first);

            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toEqual(expect.arrayContaining(['一番', '二番']));
            });
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            expect(fetchBlobUrl).toHaveBeenCalled();
            expect(parse).toHaveBeenCalledWith(['一番を見た。'], { includeLocalPitch: false, requireJpdb: true });
            expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: false, requireJpdb: true });
        } finally {
            root.remove();
        }
    });

    it('does not let stale new-tab Immersion Kit prefetches fetch media or parse after navigation', async () => {
        const first = newTabTestCard({ spelling: '一番', reading: 'いちばん' });
        const second = newTabTestCard({ spelling: '二番', reading: 'にばん' });
        const third = newTabTestCard({ spelling: '三番', reading: 'さんばん' });
        const firstExamples = deferred<ImmersionKitExample[]>();
        const secondExamples = deferred<ImmersionKitExample[]>();
        const thirdExamples = deferred<ImmersionKitExample[]>();
        const search = vi.fn((query: string): Promise<ImmersionKitExample[]> => (
            query === '一番' ? firstExamples.promise : query === '二番' ? secondExamples.promise : thirdExamples.promise
        ));
        const fetchBlobUrl = vi.fn(async (urls: string | string[]) => `blob:http://localhost/${Array.isArray(urls) ? urls[0] : urls}`);
        const parse = vi.fn(async (_paragraphs: string[], _options?: unknown) => [[]]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: true }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.id}.jpg`] : [`https://media.test/${example.id}.mp3`]
                )),
                fetchBlobUrl,
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });
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
            visibleWords: [first, second, third],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, first);
            await waitForExpect(() => expect(search.mock.calls.map(([query]) => query)).toContain('一番'));

            (controller as unknown as { index: number }).index = 1;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, second);
            await waitForExpect(() => expect(search.mock.calls.map(([query]) => query)).toContain('二番'));

            firstExamples.resolve([newTabImmersionExample('一番')]);
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]).join('\n')).not.toContain('ik-一番');
            expect(parse.mock.calls.map(call => call[0])).not.toContainEqual(['一番を見た。']);

            secondExamples.resolve([newTabImmersionExample('二番')]);
            await waitForExpect(() => {
                expect(fetchBlobUrl.mock.calls.flatMap(([urls]) => Array.isArray(urls) ? urls : [urls]).join('\n')).toContain('ik-二番');
                expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: false, requireJpdb: true });
            });
        } finally {
            root.remove();
        }
    });

    it('tries cheap new-tab Immersion Kit fallbacks before parser fallback work', async () => {
        const card = newTabTestCard({ spelling: '食べ物', reading: 'たべもの' });
        const search = vi.fn(async (query: string): Promise<ImmersionKitExample[]> => (
            query === 'たべもの' ? [newTabImmersionExample(query)] : []
        ));
        const parse = vi.fn(async () => {
            throw new Error('parser fallback should not run before cheap fallback hits');
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });

        await expect((controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
        }).loadImmersionExamples(card)).resolves.toHaveLength(1);

        expect(search.mock.calls.map(([query]) => query)).toEqual(['食べ物', 'たべもの']);
        expect(parse).not.toHaveBeenCalled();
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

        expect(lookupText).toHaveBeenCalledWith('月光', 'げっこう', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
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
        await waitForExpect(() => {
            const detail = Array.from(root.querySelectorAll<HTMLElement>('[data-newtab-search-detail]'))
                .find(element => !element.hidden)?.textContent ?? '';
            expect(detail).toContain('Local');
            expect(detail).toContain('to read');
            expect(detail).toContain('Kanji Local');
            expect(detail).toContain('read');
        });
        expect(lookupText).not.toHaveBeenCalled();

        root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]')?.click();
        await waitForExpect(() => {
            const details = Array.from(root.querySelectorAll('[data-newtab-search-detail]')).map(node => node.textContent ?? '').join('\n');
            expect(details).toContain('JPDB');
            expect(details).toContain('read');
        });
        expect(showKanjiCard).not.toHaveBeenCalled();
        root.remove();
    });

    it('searches parsed words clicked inside search entry details', async () => {
        const publicSearch = vi.fn(async () => []);
        const lookupText = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({ spelling: text, reading: text, source: 'fallback' })),
            } as never,
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
        root.innerHTML = `
            <input data-newtab-search-input>
            <div data-newtab-search-autocomplete></div>
            <div data-newtab-search-results>
                <div class="jpdb-reader-example-sentence jpdb-reader-parseable">
                    <span class="jpdb-reader-word" data-expression="猫舌" data-reading="ねこじた" data-sentence="猫舌だ。" tabindex="0">猫舌</span>
                </div>
            </div>
        `;
        document.body.append(root);
        Object.assign(controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            root.querySelector<HTMLElement>('.jpdb-reader-word')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            await waitForExpect(() => {
                expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('猫舌');
                expect(publicSearch).toHaveBeenCalledWith('猫舌', expect.any(Number));
            });
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('searches loaded JPDB and Anki review cards even without a local dictionary', async () => {
        const lookupText = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                localCardFromEntry: vi.fn(),
                fallbackCardFromText: vi.fn(text => newTabTestCard({
                    spelling: text,
                    reading: text,
                    meanings: [],
                    source: 'fallback',
                })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
                lookup: vi.fn(async () => []),
                findTermMatches: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => []),
            } as never,
            lookupText,
            showKanjiCard: vi.fn(),
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
            allWords: JPDBCard[];
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            allWords: [
                newTabTestCard({
                    spelling: '猫',
                    reading: 'ねこ',
                    meanings: [{ glosses: ['cat; feline'], partOfSpeech: ['noun'] }],
                    source: 'jpdb',
                    reviewSource: 'jpdb-live',
                }),
            ],
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'cat');

        await waitForExpect(() => {
            const results = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
            expect(results).toContain('猫');
            expect(results).toContain('cat');
        });

        const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
        const wordDetail = () => wordButton
            ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
            ?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        wordButton?.click();
        await waitForExpect(() => {
            const detail = wordDetail()?.textContent ?? '';
            expect(detail).toContain('JPDB');
            expect(detail).toContain('cat');
        });
        expect(lookupText).not.toHaveBeenCalled();
        root.remove();
    });

    it('searches public JPDB without a local dictionary or API key', async () => {
        const showLookupCard = vi.fn();
        const publicCard = newTabTestCard({
            vid: 1002650,
            sid: 0,
            spelling: 'お母さん',
            reading: 'おかあさん',
            meanings: [{ glosses: ['mother; mom; mum'], partOfSpeech: ['Noun'] }],
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: 'お母さん',
        });
        const publicSearch = vi.fn(async () => [publicCard]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: true, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({
                    spelling: text,
                    reading: text,
                    meanings: [],
                    source: 'fallback',
                })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
                lookupKanji: vi.fn(async () => []),
            } as never,
            lookupText: vi.fn(),
            showLookupCard,
            showKanjiCard: vi.fn(),
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
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'mum');

        await waitForExpect(() => {
            const text = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
            expect(text).toContain('お母さん');
            expect(text).toContain('mother; mom; mum');
            expect(text).not.toContain('Not in deck');
        });
        expect(publicSearch).toHaveBeenCalledWith('mum', expect.any(Number));

        const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
        const wordDetail = () => wordButton
            ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
            ?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        wordButton?.click();
        await waitForExpect(() => {
            const detail = wordDetail()?.textContent ?? '';
            expect(detail).toContain('JPDB');
            expect(detail).toContain('mother');
        });
        expect(showLookupCard).not.toHaveBeenCalled();
        root.remove();
    });

    it('updates search result status from any Anki deck instead of showing JPDB not-in-deck', async () => {
        const publicCard = newTabTestCard({
            vid: 1002650,
            sid: 0,
            spelling: 'お母さん',
            reading: 'おかあさん',
            meanings: [{ glosses: ['mother; mom; mum'], partOfSpeech: ['Noun'] }],
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: 'お母さん',
        });
        const loadCardRenderData = vi.fn(async () => ({
            ankiLookup: {
                state: 'known',
                notes: [{ noteId: 42, state: 'known', deckNames: ['Other'], fields: {}, cardIds: [9001] }],
                primary: { noteId: 42, state: 'known', deckNames: ['Other'], fields: {}, cardIds: [9001] },
            },
        } as never));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => [publicCard]) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({ spelling: text, reading: text, meanings: [], source: 'fallback' })),
            } as never,
            dictionaries: {} as never,
            loadCardRenderData,
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
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'mum');

        await waitForExpect(() => {
            const text = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
            expect(text).toContain('お母さん');
            expect(text).toContain('Anki Known');
            expect(text).not.toContain('Not in deck');
        });
        expect(loadCardRenderData).toHaveBeenCalledWith(publicCard);
        root.remove();
    });

    it('dedupes placeholder search words and renders kanji above words', async () => {
        const placeholderCard = newTabTestCard({
            vid: -1,
            sid: -1,
            spelling: '支',
            reading: '支',
            meanings: [],
            cardState: ['not-in-deck'],
            source: 'fallback',
            sentence: '支',
        });
        const publicCard = newTabTestCard({
            vid: 25200,
            sid: 0,
            spelling: '支',
            reading: 'し',
            meanings: [{ glosses: ['China'], partOfSpeech: [] }],
            frequencyRank: 25200,
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: '支',
        });
        const publicSearch = vi.fn(async () => [publicCard]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[{ card: placeholderCard, sentence: '支' }]]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({ spelling: text, reading: text, meanings: [], source: 'fallback' })),
            } as never,
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
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, '支');

        await waitForExpect(() => {
            const wordButtons = root.querySelectorAll('[data-newtab-action="search-result-word"]');
            expect(wordButtons).toHaveLength(1);
            expect(wordButtons[0]?.textContent).toContain('し');
            expect(wordButtons[0]?.textContent).toContain('China');
            const headings = Array.from(root.querySelectorAll('.jpdb-reader-newtab-search-section h2')).map(heading => heading.textContent);
            expect(headings).toEqual(['Kanji', 'Words']);
        });
        root.remove();
    });

    it('keeps exact composite JPDB search hits ahead of parsed component words', async () => {
        const componentCards = ['自動', '販売', '機', '自', '動', '販', '売', '機械', '自動化', '販売店']
            .map((spelling, index) => newTabTestCard({
                vid: index + 1,
                sid: index + 1,
                spelling,
                reading: spelling,
                meanings: [],
                cardState: ['not-in-deck'],
                source: 'fallback',
                sentence: '自動販売機',
            }));
        const publicCard = newTabTestCard({
            vid: 1318480,
            sid: 0,
            spelling: '自動販売機',
            reading: 'じどうはんばいき',
            meanings: [{ glosses: ['vending machine'], partOfSpeech: [] }],
            frequencyRank: 18900,
            cardState: ['not-in-deck'],
            source: 'jpdb',
            sentence: '自動販売機',
        });
        const publicSearch = vi.fn(async () => [publicCard]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [componentCards.map(card => ({ card, sentence: '自動販売機' }))]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({ spelling: text, reading: text, meanings: [], source: 'fallback' })),
            } as never,
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
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
        (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, '自動販売機');

        await waitForExpect(() => {
            const wordButtons = root.querySelectorAll('[data-newtab-action="search-result-word"]');
            expect(wordButtons).toHaveLength(10);
            expect(wordButtons[0]?.textContent).toContain('自動販売機');
            expect(wordButtons[0]?.textContent).toContain('vending machine');
            const meta = root.querySelector<HTMLElement>('[data-search-word-meta="1318480:0:自動販売機:じどうはんばいき"]');
            expect(meta?.textContent).toBe('じどうはんばいき · #18900');
            const kanjiMeta = root.querySelector<HTMLElement>('[data-newtab-action="search-result-kanji"][data-kanji="自"] .jpdb-reader-newtab-search-meta');
            expect(kanjiMeta?.textContent).toContain('自動販売機');
            expect(kanjiMeta?.textContent).toContain('じどうはんばいき');
            expect(kanjiMeta?.textContent).toContain('vending machine');
        });
        root.remove();
    });

    it('expands search cards with runtime popup sources and keeps inline actions in search mode', async () => {
        const catCard = newTabTestCard({
            vid: 1600,
            sid: 1,
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: ['Noun'] }],
            source: 'jpdb',
            sentence: '猫',
            pitchAccent: ['HL'],
        });
        const blackCatCard = newTabTestCard({
            vid: 1601,
            sid: 1,
            spelling: '黒猫',
            reading: 'くろねこ',
            meanings: [{ glosses: ['black cat'], partOfSpeech: ['Noun'] }],
            source: 'jpdb',
            sentence: '黒猫',
        });
        const publicSearch = vi.fn(async (query: string) => query === '黒猫' ? [blackCatCard] : [catCard]);
        const renderData = deferred<never>();
        const loadCardRenderData = vi.fn(async () => renderData.promise);
        const cardRenderData = {
            localEntries: [{ expression: '猫', reading: 'ねこ', glossary: ['cat from local dictionary'], score: 20, dictionary: 'Local' }],
            kanjiEntries: [{ character: '猫', onyomi: [], kunyomi: ['ねこ'], tags: [], meanings: ['cat kanji'], dictionary: 'Kanji Local' }],
            metaEntries: [{ expression: '猫', mode: 'freq', data: 1600, dictionary: 'Freq Local' }],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: { meanings: ['cat'], compounds: [], usedInVocabulary: [], examples: [] },
        } as never;
        const renderSearchDefinitionSources = vi.fn(() => `
            <div class="jpdb-reader-definition-stack">
                <details open>
                    <summary>Popup sources</summary>
                    <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="黒猫" data-dictionary-reading="くろねこ" data-dictionary="Local">黒猫</a>
                    <button type="button" data-action="jpdb-example-audio" data-jpdb-audio="example-audio" data-jpdb-example-sentence="猫が寝る。">audio</button>
                </details>
            </div>
        `);
        const installSearchDetailSources = vi.fn();
        const playJpdbExampleAudio = vi.fn();
        const playWordAudio = vi.fn();
        const renderSearchWordPills = vi.fn(() => '<div class="jpdb-reader-word-pills">Freq Local 1600</div>');
        const lookupDictionaryReference = vi.fn();
        const jpdbKanjiLookup = vi.fn(async () => ({
            kanji: '猫',
            keyword: 'cat radical',
            frequency: '#1600',
            type: 'jouyou',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [{ reading: 'ねこ', share: '100%', common: true }],
            components: [{ kanji: '犭', keyword: 'animal' }],
            usedInKanji: [],
            mnemonic: 'Cat kanji mnemonic',
            vocabulary: [{ expression: '猫舌', reading: 'ねこじた', meaning: 'sensitive tongue', url: 'https://jpdb.io/vocabulary/1/猫舌/ねこじた' }],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: true,
                immersionKitEnabled: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
                similarKanjiWords: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(text => newTabTestCard({ spelling: text, reading: text, source: 'fallback' })),
            } as never,
            dictionaries: {
                lookup: vi.fn(async () => []),
                findTermMatches: vi.fn(async () => []),
                lookupKanji: vi.fn(async () => [{ character: '猫', onyomi: [], kunyomi: ['ねこ'], tags: [], meanings: ['cat kanji'], dictionary: 'Kanji Local' }]),
            } as never,
            loadCardRenderData,
            renderSearchDefinitionSources,
            renderSearchWordPills,
            installSearchDetailSources,
            playWordAudio,
            playJpdbExampleAudio,
            lookupDictionaryReference,
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
            state: { mode: 'search', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });
        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
            (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);
            (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'neko');

            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('猫');
                const kanjiButtons = root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]');
                expect(kanjiButtons).toHaveLength(1);
                expect(kanjiButtons[0]?.dataset.kanji).toBe('猫');
            });
            const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
            const wordDetail = () => wordButton
                ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
                ?.querySelector<HTMLElement>('[data-newtab-search-detail]');
            wordButton?.click();
            await waitForExpect(() => {
                const detail = wordDetail()?.textContent ?? '';
                expect(detail).toContain('猫');
                expect(detail).toContain('ねこ');
                expect(detail).toContain('Loading dictionary details');
            });
            expect(wordDetail()?.querySelector('[data-action="search-word-audio"]')).not.toBeNull();
            expect(wordDetail()?.querySelector('.jpdb-reader-pitch')).not.toBeNull();
            root.querySelector<HTMLButtonElement>('[data-action="search-word-audio"]')?.click();
            expect(playWordAudio).toHaveBeenCalledWith(catCard);
            expect(wordDetail()?.textContent).not.toContain('Popup sources');
            await waitForExpect(() => {
                const detail = wordDetail()?.textContent ?? '';
                expect(detail).toContain('Readings and components');
                expect(detail).toContain('cat radical');
                expect(detail).toContain('Cat kanji mnemonic');
                expect(detail).toContain('Loading dictionary details');
                expect(detail).not.toContain('Popup sources');
            });

            renderData.resolve(cardRenderData);
            await waitForExpect(() => {
                const detail = wordDetail()?.textContent ?? '';
                expect(detail).toContain('Popup sources');
                expect(detail).toContain('Kanji Local');
                expect(detail).toContain('cat kanji');
                expect(detail).toContain('Readings and components');
                expect(detail).toContain('cat radical');
                expect(detail).toContain('Cat kanji mnemonic');
                expect(detail).toContain('Freq Local 1600');
            });
            const kanjiSource = wordDetail()?.querySelector<HTMLElement>('details.jpdb-reader-newtab-search-inline-kanji');
            expect(kanjiSource?.querySelector(':scope > summary.jpdb-reader-local-title')?.textContent).toContain('Kanji');
            expect(wordDetail()?.querySelector('.jpdb-reader-definition-stack > details.jpdb-reader-newtab-search-inline-kanji')).toBe(kanjiSource);
            expect(loadCardRenderData).toHaveBeenCalledWith(catCard);
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('猫');
            expect(renderSearchDefinitionSources).toHaveBeenCalledWith(catCard, expect.any(Array), '猫', expect.any(Object));
            expect(renderSearchWordPills).toHaveBeenCalledWith(catCard, expect.any(Array));
            expect(installSearchDetailSources).toHaveBeenCalledWith(wordDetail(), catCard, '猫', expect.any(Object));

            root.querySelector<HTMLButtonElement>('[data-action="jpdb-example-audio"]')?.click();
            expect(playJpdbExampleAudio).toHaveBeenCalledWith('example-audio', '猫が寝る。');

            root.querySelector<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]')?.click();
            await waitForExpect(() => {
                expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('黒猫');
                expect(publicSearch).toHaveBeenCalledWith('黒猫', expect.any(Number));
            });
            expect(lookupDictionaryReference).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
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
        expect(input?.getAttribute('aria-activedescendant')).toBeNull();
        expect(suggestion?.dataset.active).toBeUndefined();
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Takoboto');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('Copy');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).not.toContain('JPDB');
        expect(root.querySelector('[data-newtab-search-results]')?.textContent).not.toContain('Jisho');
        expect(root.querySelector<HTMLAnchorElement>('.jpdb-reader-newtab-search-links a')?.href).toContain('takoboto.jp/?q=cat');
        const submitEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        input?.dispatchEvent(submitEnterEvent);
        expect(submitEnterEvent.defaultPrevented).toBe(false);
        expect(input?.value).toBe('cat');
        const arrowEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
        input?.dispatchEvent(arrowEvent);
        expect(arrowEvent.defaultPrevented).toBe(true);
        expect(input?.getAttribute('aria-activedescendant')).toBe(suggestion?.id);
        expect(suggestion?.dataset.active).toBe('true');
        const suggestionEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        input?.dispatchEvent(suggestionEnterEvent);
        expect(suggestionEnterEvent.defaultPrevented).toBe(true);
        expect(input?.value).toBe('猫');

        (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, 'おもし');
        await waitForExpect(() => {
            expect(root.querySelector('[data-newtab-search-autocomplete]')?.textContent).toContain('面白い');
        });
        expect(searchTerms).toHaveBeenCalledWith('cat', expect.any(Number), settings.dictionaryPreferences, expect.any(Object));
        expect(searchTerms).toHaveBeenCalledWith('おもし', expect.any(Number), settings.dictionaryPreferences, expect.any(Object));
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

        expect(lookupDictionaryReference).toHaveBeenCalledWith('国家', 'こっか', 'Jitendex', root.querySelector('a'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).toHaveBeenCalledWith('何事', 'なにごと', root.querySelectorAll('button')[0], expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(showKanjiCard).toHaveBeenCalledWith(card, '事', '事情を説明する。', root.querySelectorAll('button')[1], expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
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

    it('uses a longer JPDB parse window for hosted new-tab study text than popovers', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async () => [[]]);
        const studyRoot = document.createElement('div');
        studyRoot.innerHTML = '<span class="jpdb-reader-parseable">大切です。</span>';
        document.body.append(studyRoot);
        const internals = runtime as unknown as {
            parser: { canParse(): boolean; parse: typeof parse };
            createNewTabController(): NewTabController;
            parseNewTabContent(root: HTMLElement, options?: { jpdbTimeoutMs?: number; allowJpdbTimeoutFallback?: boolean }): Promise<void>;
        };
        internals.parser = { canParse: () => true, parse };

        try {
            const controller = internals.createNewTabController() as unknown as {
                dependencies: { parseContent(root: HTMLElement): Promise<void> | void };
            };

            await controller.dependencies.parseContent(studyRoot);

            expect(parse).toHaveBeenLastCalledWith(['大切です。'], { jpdbTimeoutMs: 15_000, allowJpdbTimeoutFallback: false, includeLocalPitch: false });

            parse.mockClear();
            const popover = document.createElement('div');
            popover.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
            document.body.append(popover);

            await internals.parseNewTabContent(popover);

            expect(parse).toHaveBeenCalledWith(['日本語です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('forwards hosted nested lookup navigation options through the runtime adapter', async () => {
        const runtime = new NewTabRuntime();
        const lookupText = vi.fn(async () => undefined);
        const showLookupCard = vi.fn(async () => undefined);
        const showKanjiLookupCard = vi.fn(async () => undefined);
        const current = newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '読む。' });
        const next = newTabTestCard({ spelling: '下', reading: 'した', sentence: '下です。' });
        const previousNavigationEntry = { kind: 'word' as const, card: current, sentence: current.sentence };
        const anchor = document.createElement('span');
        const internals = runtime as unknown as {
            lookupText: typeof lookupText;
            showLookupCard: typeof showLookupCard;
            showKanjiLookupCard: typeof showKanjiLookupCard;
            createNewTabController(): NewTabController;
        };
        internals.lookupText = lookupText;
        internals.showLookupCard = showLookupCard;
        internals.showKanjiLookupCard = showKanjiLookupCard;

        try {
            const controller = internals.createNewTabController() as unknown as {
                dependencies: {
                    lookupText(text: string, reading: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    lookupDictionaryReference(query: string, reading: string, dictionary: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    showLookupCard(card: JPDBCard, sentence: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                    showKanjiCard(card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement, options?: {
                        navigation?: string;
                        previousNavigationEntry?: typeof previousNavigationEntry;
                        reuseActivePopover?: boolean;
                        userGesture?: boolean;
                    }): Promise<void> | void;
                };
            };

            await controller.dependencies.lookupText('下', 'した', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });
            await controller.dependencies.lookupDictionaryReference('国家', 'こっか', 'JPDB', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });
            await controller.dependencies.showLookupCard(next, '下です。', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });
            await controller.dependencies.showKanjiCard(next, '下', '下です。', anchor, {
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            });

            expect(lookupText).toHaveBeenNthCalledWith(1, '下', 'した', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).toHaveBeenNthCalledWith(2, '国家', 'こっか', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(showLookupCard).toHaveBeenCalledWith(next, '下です。', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                autoPlay: false,
                userGesture: true,
            }));
            expect(showKanjiLookupCard).toHaveBeenCalledWith(next, '下', '下です。', anchor, expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry,
                reuseActivePopover: true,
                userGesture: true,
            }));
        } finally {
            runtime.destroy();
        }
    });

    it('uses the current study card as nested lookup history when no lookup popover is open', () => {
        const runtime = new NewTabRuntime();
        const current = newTabTestCard({ spelling: '読む', reading: 'よむ', sentence: '本を読む。' });
        const internals = (runtime as unknown as {
            createNewTabController(): NewTabController;
        }).createNewTabController() as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            state: { mode: string };
            nestedLookupOptions(): {
                navigation?: string;
                previousNavigationEntry?: { kind: string; card: JPDBCard; sentence?: string };
                reuseActivePopover?: boolean;
                userGesture?: boolean;
            };
        };

        try {
            internals.visibleWords = [current];
            internals.index = 0;
            internals.state = { mode: 'word' };

            expect(internals.nestedLookupOptions()).toMatchObject({
                navigation: 'push-current',
                previousNavigationEntry: { kind: 'word', card: current, sentence: '本を読む。' },
                reuseActivePopover: true,
                userGesture: true,
            });
        } finally {
            runtime.destroy();
        }
    });

    it('dedupes matching in-flight hosted new-tab parses', async () => {
        const runtime = new NewTabRuntime();
        const parseResult = deferred<JPDBToken[][]>();
        const parse = vi.fn(() => parseResult.promise);
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            parser: { canParse(): boolean; parse: typeof parse };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.parser = { canParse: () => true, parse };

        try {
            const first = internals.parseNewTabContent(root);
            const second = internals.parseNewTabContent(root);

            expect(parse).toHaveBeenCalledTimes(1);

            parseResult.resolve([[]]);
            await Promise.all([first, second]);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('reuses parsed hosted new-tab content across freshly rendered matching roots', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async () => [[]]);
        const firstRoot = document.createElement('div');
        const secondRoot = document.createElement('div');
        firstRoot.innerHTML = '<span class="jpdb-reader-parseable">大切です。</span>';
        secondRoot.innerHTML = '<span class="jpdb-reader-parseable">大切です。</span>';
        document.body.append(firstRoot, secondRoot);
        const internals = runtime as unknown as {
            parser: { canParse(): boolean; parse: typeof parse };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.parser = { canParse: () => true, parse };

        try {
            await internals.parseNewTabContent(firstRoot);
            await internals.parseNewTabContent(secondRoot);

            expect(parse).toHaveBeenCalledTimes(1);
            expect(parse).toHaveBeenCalledWith(['大切です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('omits study grammar and translation sources from hosted search expansions', () => {
        const runtime = new NewTabRuntime();
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            createNewTabController(): NewTabController;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            studyGrammarEnabled: true,
            studyTranslationEnabled: true,
            immersionKitEnabled: false,
        };
        try {
            const controller = internals.createNewTabController() as unknown as {
                dependencies: {
                    renderSearchDefinitionSources(
                        card: JPDBCard,
                        entries: Array<{ expression: string; reading: string; glossary: string[]; score: number; dictionary: string }>,
                        sentence: string,
                        jpdbVocabularyInfo: null,
                    ): string;
                };
            };
            const html = controller.dependencies.renderSearchDefinitionSources(
                newTabTestCard({ spelling: '猫', reading: 'ねこ', sentence: '猫です。' }),
                [{ expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Local' }],
                '猫です。',
                null,
            );

            expect(html).toContain('Local');
            expect(html).not.toContain('data-study-grammar');
            expect(html).not.toContain('data-study-translation');
        } finally {
            runtime.destroy();
        }
    });

    it('replaces no-key segmented fallback words with public JPDB cards', async () => {
        const runtime = new NewTabRuntime();
        const fallbackCard = newTabTestCard({ vid: -3924751230, sid: -3924751230, spelling: '会話', reading: '会話', source: 'fallback', meanings: [] });
        const publicCard = newTabTestCard({ vid: 1234, sid: 0, spelling: '会話', reading: 'かいわ', source: 'jpdb', pitchAccent: [] });
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: fallbackCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '会話',
        }]]);
        const search = vi.fn(async () => [publicCard]);
        const pitch = vi.fn(async () => ['LHH']);
        const cacheCards = vi.fn();
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">会話</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse; cacheCards: typeof cacheCards };
            jpdbVocabulary: { search: typeof search };
            jpdbPublicPitch: { lookup: typeof pitch };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, showPitchAccent: true };
        internals.parser = { canParse: () => true, parse, cacheCards };
        internals.jpdbVocabulary = { search };
        internals.jpdbPublicPitch = { lookup: pitch };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-word');
                expect(word?.textContent).toBe('会話');
                expect(word?.dataset.vid).toBe('1234');
                expect(word?.dataset.reading).toBe('かいわ');
                expect(word?.dataset.pitchClass).toBe('heiban');
            });
            expect(search).toHaveBeenCalledWith('会話', 1);
            expect(pitch).toHaveBeenCalledWith('会話', 'かいわ');
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('unwraps no-key segmented fallback words when public JPDB has no exact card', async () => {
        const runtime = new NewTabRuntime();
        const fallbackCard = newTabTestCard({ vid: -1, sid: -1, spelling: 'した', reading: 'した', source: 'fallback', meanings: [] });
        const wrongPublicCard = newTabTestCard({ vid: 1184140, sid: 0, spelling: '下', reading: 'した', source: 'jpdb', meanings: [] });
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: fallbackCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: 'した',
        }]]);
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">した</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse; cacheCards(cards: JPDBCard[]): void };
            jpdbVocabulary: { search(query: string, limit?: number): Promise<JPDBCard[]> };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false };
        internals.parser = { canParse: () => true, parse, cacheCards: vi.fn() };
        internals.jpdbVocabulary = { search: vi.fn(async () => [wrongPublicCard]) };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-word')).toBeNull();
                expect(root.textContent).toBe('した');
            });

            await internals.parseNewTabContent(root);

            expect(parse).toHaveBeenCalledTimes(1);
            expect(internals.jpdbVocabulary.search).toHaveBeenCalledTimes(1);
            expect(root.querySelector('.jpdb-reader-word')).toBeNull();
        } finally {
            runtime.destroy();
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
            navigation: { updateWord(card: JPDBCard, sentence: string | undefined, trigger: 'modal' | 'hover', mode: 'reset' | 'preserve' | 'push-current'): void };
            parser: { cacheCards(cards: JPDBCard[]): void };
            lookupText: typeof lookupText;
            showLookupCard: typeof showLookupCard;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.lookupText = lookupText;
        internals.showLookupCard = showLookupCard;
        internals.parser.cacheCards([related]);
        internals.navigation.updateWord(card, card.sentence, 'modal', 'reset');
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
                userGesture: true,
            }));
            expect(showLookupCard).toHaveBeenCalledWith(related, '甘言蜜語だ。', popover.querySelector('.jpdb-reader-example-sentence .jpdb-reader-word'), expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry: expect.objectContaining({ kind: 'word', card }),
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).toHaveBeenCalledWith('未登録語', '未登録語', popover.querySelectorAll('.jpdb-reader-example-sentence .jpdb-reader-word')[1], expect.objectContaining({
                navigation: 'push-current',
                previousNavigationEntry: expect.objectContaining({ kind: 'word', card }),
                reuseActivePopover: true,
                userGesture: true,
            }));
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('stacks hosted new-tab lookups over settings without adding a second modal backdrop', () => {
        const runtime = new NewTabRuntime();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'sheet' as const };
        const settingsForm = document.createElement('form');
        settingsForm.className = 'jpdb-reader-settings';
        settingsForm.dataset.jpdbReaderRoot = 'true';
        const settingsBackdrop = createReaderBackdrop(() => undefined);
        const anchor = document.createElement('span');
        anchor.textContent = '設定';
        document.body.append(settingsBackdrop, settingsForm, anchor);
        const internals = runtime as unknown as {
            settings: typeof settings;
            activeDialog?: HTMLElement;
            activeBackdrop?: HTMLElement;
            activeLookupPopover?: HTMLElement;
            activeLookupBackdrop?: HTMLElement;
            mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { stackOverSettings?: boolean }): void;
            dismissLookupPopover(): void;
        };
        internals.settings = settings;
        internals.activeDialog = settingsForm;
        internals.activeBackdrop = settingsBackdrop;

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountLookupPopover(lookup, anchor, { stackOverSettings: true });

            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(lookup.isConnected).toBe(true);
            expect(lookup.getAttribute('aria-modal')).toBe('false');
            expect(lookup.classList.contains('jpdb-reader-sheet')).toBe(false);
            expect(lookup.querySelector('.jpdb-reader-sheet-handle')).toBeNull();
            expect(document.querySelectorAll('.jpdb-reader-backdrop')).toHaveLength(1);
            expect(internals.activeLookupPopover).toBe(lookup);
            expect(internals.activeLookupBackdrop).toBeUndefined();

            internals.dismissLookupPopover();

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(internals.activeDialog).toBe(settingsForm);
            expect(internals.activeBackdrop).toBe(settingsBackdrop);
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

    it('keeps the user gesture attached to hosted new-tab dictionary autoplay', async () => {
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
            showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { userGesture?: boolean }): Promise<void>;
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

            await internals.showLookupCard(card, '月光を見る。', undefined, { userGesture: true });

            expect(playTermAudio).toHaveBeenCalledTimes(1);
            expect(playTermAudio).toHaveBeenCalledWith(card, { userGesture: true });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('preloads the current hosted new-tab dictionary word even when autoplay is off', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '静寂', reading: 'せいじゃく', sentence: '静寂が好き。' });
        const preload = vi.fn();
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
            audio: { preload: typeof preload };
            cardRenderData: { load(): { localEntries: Promise<unknown[]>; all: Promise<typeof renderData> } };
            parser: { canParse(): boolean; isJpdbBackedCard(card: JPDBCard): boolean };
            showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { autoPlay?: boolean }): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                audioEnabled: true,
                autoPlayAudio: false,
                popupMode: 'popover',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
            };
            internals.audio = { preload };
            internals.cardRenderData = {
                load: () => ({ localEntries: Promise.resolve([]), all: Promise.resolve(renderData) }),
            };
            internals.parser = {
                canParse: () => false,
                isJpdbBackedCard: () => true,
            };

            await internals.showLookupCard(card, '静寂が好き。', undefined, { autoPlay: false });

            expect(preload).toHaveBeenCalledWith(card, { sourceLimit: 1, candidateLimit: 1, prepareAudio: true });
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

        expect(lookupText).toHaveBeenCalledWith('寸', '寸', button, expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
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

    it('keeps the current new-tab Immersion Kit image until the next example image is ready', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: '',
                imageFile: 'first.jpg',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: '中学生です。',
                sentenceWithFurigana: '',
                translation: 'I am a junior high school student.',
                sourceTitle: 'Second Source',
                titleSlug: 'second-source',
                category: 'anime',
                soundFile: '',
                imageFile: 'second.jpg',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        let resolveSecondImage!: (src: string) => void;
        const fetchBlobUrl = vi.fn((urls: string | string[]) => {
            const list = Array.isArray(urls) ? urls : [urls];
            if (list[0]?.includes('second.jpg')) {
                return new Promise<string>(resolve => {
                    resolveSecondImage = resolve;
                });
            }
            return Promise.resolve('blob:http://localhost/first.jpg');
        });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: true }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.imageFile}`] : []
                )),
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
        const meaning = document.createElement('div');
        meaning.dataset.newtabMeaning = 'true';
        root.append(meaning);
        document.body.append(root);
        const privateController = controller as unknown as {
            renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
            performNewTabImmersionAction(root: HTMLElement, action: string): void;
            immersionCacheKey(card: JPDBCard): string;
            immersionCache: Map<string, Promise<ImmersionKitExample[]>>;
            visibleWords: JPDBCard[];
            index: number;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        };
        privateController.visibleWords = [card];
        privateController.index = 0;
        privateController.state = {
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: true,
        };
        privateController.immersionCache.set(privateController.immersionCacheKey(card), Promise.resolve(examples));
        meaning.append(privateController.renderNewTabImmersionCard(card, examples, 0));

        try {
            privateController.performNewTabImmersionAction(root, 'next');
            await Promise.resolve();
            await Promise.resolve();

            expect(meaning.textContent).toContain('お母ちゃん中学生？');
            expect(meaning.querySelector<HTMLImageElement>('.jpdb-reader-example-image')?.getAttribute('src')).toBe('https://media.test/first.jpg');
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/second.jpg'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl);

            resolveSecondImage('blob:http://localhost/second.jpg');

            await waitForExpect(() => {
                expect(meaning.textContent).toContain('中学生です。');
                expect(meaning.querySelector<HTMLImageElement>('.jpdb-reader-example-image')?.getAttribute('src')).toBe('blob:http://localhost/second.jpg');
            });
        } finally {
            root.remove();
        }
    });

    it('times out hung new-tab Immersion Kit example loads', async () => {
        vi.useFakeTimers();
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, audioTimeoutMs: 1000 }, {
            immersionKit: {
                search: vi.fn(() => new Promise<ImmersionKitExample[]>(() => undefined)),
                mediaUrls: vi.fn(() => []),
            } as never,
        });

        try {
            const load = (controller as unknown as { loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> })
                .loadImmersionExamples(card);
            await vi.advanceTimersByTimeAsync(2000);

            await expect(load).resolves.toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });

    it('uses JPDB related vocabulary queries when new-tab Immersion Kit reveal has no direct examples', async () => {
        const card = newTabTestCard({ vid: 44, sid: 44, spelling: '甘言', reading: 'かんげん' });
        const example: ImmersionKitExample = {
            id: 'ik-related',
            sentence: '甘言蜜語に乗せられた。',
            sentenceWithFurigana: '',
            translation: 'I was taken in by sweet words.',
            sourceTitle: 'Test Source',
            titleSlug: 'test-source',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const search = vi.fn(async (query: string): Promise<ImmersionKitExample[]> => (
            query === '甘言蜜語' ? [example] : []
        ));
        const lookup = vi.fn(async () => ({
            meanings: [],
            compounds: [{ term: '甘言蜜語', reading: 'かんげんみつご', meaning: 'honeyed words', url: 'https://jpdb.io/vocabulary/1' }],
            examples: [],
        }));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbVocabulary: { lookup },
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
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('甘言蜜語に乗せられた。');
            });
            expect(lookup).toHaveBeenCalledWith(44, '甘言', 'かんげん');
            expect(search.mock.calls.map(([query]) => query)).toEqual(['甘言', 'かんげん', '甘言蜜語']);
        } finally {
            root.remove();
        }
    });

    it('prefetches new-tab Immersion Kit examples before reveal but renders them only on reveal', async () => {
        const read = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', sentence: '本を読む。' });
        const write = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', sentence: '名前を書く。' });
        const walk = newTabTestCard({ vid: 3, sid: 3, spelling: '歩く', reading: 'あるく', sentence: '道を歩く。' });
        const example = (id: string, sentence: string, translation: string, sourceTitle: string): ImmersionKitExample => ({
            id,
            sentence,
            sentenceWithFurigana: '',
            translation,
            sourceTitle,
            titleSlug: sourceTitle.toLowerCase().replace(/\s+/g, '-'),
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        });
        const examplesByQuery = new Map<string, ImmersionKitExample[]>([
            ['読む', [example('ik-read', '本を読む。', 'Read a book.', 'Read Source')]],
            ['書く', [example('ik-write', '名前を書く。', 'Write a name.', 'Write Source')]],
            ['歩く', [example('ik-walk', '道を歩く。', 'Walk the path.', 'Walk Source')]],
        ]);
        const search = vi.fn(async (query: string, _settings?: unknown, _options?: unknown) => examplesByQuery.get(query) ?? []);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                search,
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
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [read, write, walk],
            visibleWords: [read, write, walk],
            index: 0,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, read);
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toContain('読む');
            });
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            root.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toContain('書く');
            });
            const writeSearchesBeforeReveal = search.mock.calls.map(([query]) => query).filter(query => query === '書く').length;
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();

            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('名前を書く。');
            });
            expect(search).toHaveBeenCalledWith(
                '書く',
                expect.anything(),
                expect.objectContaining({ requestLimit: 48, resultLimit: 6 }),
            );
            expect(search.mock.calls.map(([query]) => query).filter(query => query === '書く')).toHaveLength(writeSearchesBeforeReveal);
        } finally {
            root.remove();
        }
    });

    it('renders prefetched new-tab Immersion Kit reveal sentence tokens before a raw parse pass', async () => {
        const card = newTabTestCard({ vid: 88, sid: 44, spelling: '中学生', reading: 'ちゅうがくせい' });
        const sentence = 'お母ちゃん中学生？';
        const example = { ...newTabImmersionExample('中学生'), sentence };
        const parse = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [newTabSentenceToken(card, text)]));
        const search = vi.fn(async () => [example]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                canParse: () => true,
                parse,
                getCachedCard: vi.fn(() => card),
            } as never,
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            await waitForExpect(() => expect(parse).toHaveBeenCalledWith([sentence], expect.objectContaining({ includeLocalPitch: false })));
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-immersion .jpdb-reader-word');
                expect(word?.textContent).toBe('中学生');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
            });
            expect(parse).toHaveBeenCalledTimes(1);
            expect(root.querySelector('.jpdb-reader-newtab-immersion mark.jpdb-reader-example-target')).toBeNull();
        } finally {
            root.remove();
        }
    });

    it('retries new-tab sentence parsing after an all-fallback timeout result', async () => {
        const fallbackCard = newTabTestCard({ vid: -1, sid: -1, spelling: '分', reading: '', source: 'fallback' });
        const parsedCard = newTabTestCard({ vid: 1502860, sid: 0, spelling: '分かりません', reading: 'わかりません', source: 'jpdb' });
        const parse = vi.fn()
            .mockResolvedValueOnce([[newTabSentenceToken(fallbackCard, '日本語は分かりません。')]])
            .mockResolvedValueOnce([[newTabSentenceToken(parsedCard, '日本語は分かりません。')]]);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            parser: {
                canParse: () => true,
                parse,
            } as never,
        });
        const internals = controller as unknown as { parsedNewTabSentenceTokens(sentence: string): Promise<JPDBToken[]> };

        await expect(internals.parsedNewTabSentenceTokens('日本語は分かりません。'))
            .resolves.toEqual([expect.objectContaining({ card: expect.objectContaining({ source: 'fallback' }) })]);
        await expect(internals.parsedNewTabSentenceTokens('日本語は分かりません。'))
            .resolves.toEqual([expect.objectContaining({ card: expect.objectContaining({ spelling: '分かりません' }) })]);

        expect(parse).toHaveBeenCalledTimes(2);
    });

    it('renders prefetched next-word front sentence tokens without waiting for parseContent', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', sentence: '本を読む。' });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', sentence: '名前を書く。' });
        const examplesByQuery = new Map<string, ImmersionKitExample[]>([
            ['読む', [{ ...newTabImmersionExample('読む'), sentence: '本を読む。' }]],
            ['書く', [{ ...newTabImmersionExample('書く'), sentence: '名前を書く。' }]],
        ]);
        const parseContent = vi.fn();
        const parse = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [
            newTabSentenceToken(text.includes('書く') ? second : first, text),
        ]));
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search: vi.fn(async (query: string) => examplesByQuery.get(query) ?? []),
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
            parseContent,
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
        document.body.append(root);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            allWords: [first, second],
            visibleWords: [first, second],
            index: 0,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, first);
            await waitForExpect(() => expect(parse).toHaveBeenCalledWith(['名前を書く。'], expect.anything()));
            parseContent.mockClear();
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            root.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word');
                expect(word?.textContent).toBe('書く');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
            });
            expect(parseContent).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('stops new-tab Immersion Kit fallback searches after rate limiting', async () => {
        const card = newTabTestCard({ spelling: '日本語', reading: 'にほんご' });
        const search = vi.fn(async (_query: string) => {
            throw new Error('Immersion Kit request failed (429).');
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });

        await expect((controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
        }).loadImmersionExamples(card)).resolves.toEqual([]);

        expect(search.mock.calls.map(([query]) => query)).toEqual(['日本語']);
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
            expect(search).toHaveBeenCalledWith(
                '発音',
                expect.objectContaining({ immersionKitAutoPlayAudio: true }),
                expect.objectContaining({ requestLimit: 48, resultLimit: 6 }),
            );
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/line.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl);
        } finally {
            root.remove();
        }
    });

    it('does not append or autoplay delayed Immersion Kit reveal content after hiding the card', async () => {
        const card = newTabTestCard({ spelling: '発音', reading: 'はつおん' });
        const example: ImmersionKitExample = {
            id: 'ik-delayed',
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
        let resolveSearch!: (examples: ImmersionKitExample[]) => void;
        const search = vi.fn(() => new Promise<ImmersionKitExample[]>(resolve => {
            resolveSearch = resolve;
        }));
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
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
            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();
            resolveSearch([example]);
            await Promise.resolve();
            await Promise.resolve();

            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            expect(fetchBlobUrl).not.toHaveBeenCalled();
            expect(played).toEqual([]);
        } finally {
            root.remove();
            vi.unstubAllGlobals();
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
            expect(parseContent).toHaveBeenCalledWith(
                node,
                expect.objectContaining({ jpdbTimeoutMs: 1_200 }),
            );
            expect(word.classList.contains('jpdb-reader-example-target')).toBe(true);

            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const clickWasNotCanceled = word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(showLookupCard).toHaveBeenCalledWith(card, 'お母ちゃん中学生？', word, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
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

    it('renders dictionary words for the dictionary source when a dictionary is installed', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            dictionaryPreferences: [{ name: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' as const }],
            immersionKitEnabled: false,
        };
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => [{
            expression: '書く',
            reading: 'かく',
            glossary: ['to write'],
            score: 1,
            dictionary: 'Local',
        }]);
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
                summary: vi.fn(async () => ({
                    dictionaries: [{ title: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' as const }],
                    terms: 1,
                    kanji: 0,
                    termMeta: 0,
                    kanjiMeta: 0,
                })),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();

        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        document.body.replaceChildren();
    });

    it('falls back to public JPDB for the dictionary source when no dictionary is installed', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
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
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['公開']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(publicSearch).toHaveBeenCalled();
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
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
    });

    it('falls back to public JPDB for auto review when no local dictionaries are installed', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: false,
                newTabAnkiEnabled: false,
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
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {} as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['公開']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(publicSearch).toHaveBeenCalled();
    });

    it('uses seeded local dictionaries before public JPDB in first-run auto review', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const localCard = newTabTestCard({ spelling: '今日', reading: 'きょう', source: 'local' });
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                ankiEnabled: false,
                newTabAnkiEnabled: false,
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
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                localCardFromEntry: vi.fn(() => localCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: ['Local'], terms: 1, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
                listRandomTopTerms: vi.fn(async () => [{ expression: '今日', reading: 'きょう', glossary: ['today'], score: 1, dictionary: 'Local' }]),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.sourceLabel).toBe('Dictionary');
        expect(result.cards.map(card => card.spelling)).toEqual(['今日']);
        expect(publicSearch).not.toHaveBeenCalled();
    });

    it('falls back to dictionary words when auto review sources stall', async () => {
        vi.useFakeTimers();
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
                apiKey: 'api-key',
                ankiEnabled: true,
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(() => new Promise(() => undefined)),
            } as never,
            jpdb: {
                listDecks: vi.fn(() => new Promise(() => undefined)),
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

        try {
            const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();
            await vi.advanceTimersByTimeAsync(8000);
            const result = await resultPromise;

            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            vi.useRealTimers();
        }
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

        expect(listRandomTopTerms).toHaveBeenNthCalledWith(1, 180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(listRandomTopTerms).toHaveBeenNthCalledWith(2, 180, 6000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(listRandomTerms).toHaveBeenCalledWith(180, DEFAULT_SETTINGS.dictionaryPreferences, expect.any(Object));
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
            source: 'auto',
            revealAnswer: false,
        });
        localStorage.removeItem('jpdb-reader-newtab-ui');
    });

    it('uses the settings new-tab source instead of a stale saved UI source', async () => {
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'anki',
            revealAnswer: false,
        }));
        const jpdbCard = newTabTestCard({ spelling: '設定', reading: 'せってい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                immersionKitEnabled: false,
            }),
            anki: {
                listNewTabCards: vi.fn(async () => [ankiCard]),
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
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('jpdb');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('設定');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
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
                expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
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

    it('keeps a navigated cached dictionary kanji card selected when refresh completes', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'kanji',
            sort: 'random',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: false,
        }));
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');

        const cachedRead = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'local', kanjiKeyword: 'read' });
        const cachedWrite = newTabTestCard({ vid: 2, sid: 2, spelling: '書く', reading: 'かく', source: 'local', kanjiKeyword: 'write' });
        const liveWalk = newTabTestCard({ vid: 3, sid: 3, spelling: '歩く', reading: 'あるく', source: 'local', kanjiKeyword: 'walk' });
        localStorage.setItem('jpdb-reader-newtab-card-cache', JSON.stringify({
            sourceLabel: 'Dictionary',
            cards: [cachedRead, cachedWrite],
        }));

        const liveEntries = deferred<Array<{ expression: string; reading: string; glossary: string[]; score: number; dictionary: string }>>();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabEnabled: true,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
                jpdbKanjiEnabled: false,
                rtkEnabled: false,
                uchisenEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                similarKanjiWords: false,
                localDictionaryShowKanji: false,
                newTabKanjiAutogradeEnabled: false,
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
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => liveWalk),
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
                expect(document.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('1:1:読む:よむ');
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('read');
            });

            document.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();
            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('2:2:書く:かく');
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('write');
            });

            liveEntries.resolve([{
                expression: '歩く',
                reading: 'あるく',
                glossary: ['to walk'],
                score: 1,
                dictionary: 'Local',
            }]);
            await render;

            expect(document.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('2:2:書く:かく');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('write');
            expect((controller as unknown as { allWords: JPDBCard[] }).allWords.map(card => card.spelling)).toEqual(['書く', '歩く']);
        } finally {
            restoreCanvas();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
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
        expect(jpdbFacts).not.toContain('Readings');
        expect(jpdbFacts).not.toContain(['JPDB', 'words'].join(' '));
        expect(jpdbFacts).toContain('HeisigJPDB #1000');
        expect(jpdbFacts).not.toContain('Frame number');
        expect(rtkSection?.textContent).toContain('Attach the person to the inch.');
        expect(details.querySelector('[data-newtab-uchisen-mount]')).not.toBeNull();
    });
});
