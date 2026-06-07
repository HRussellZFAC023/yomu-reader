import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient, type AnkiLookupResult } from '../../src/reader/anki';
import { AnkiNewTabUnavailableError, listNewTabAnkiCards } from '../../src/reader/anki/new-tab';
import { cardKey } from '../../src/reader/card-utils';
import { APP_NAME } from '../../src/reader/constants';
import type { ImmersionKitExample } from '../../src/reader/immersion-kit';
import { NewTabController, selectNewTabStudyPool } from '../../src/reader/new-tab-controller';
import { newTabSourceLoadPlan } from '../../src/reader/new-tab-source';
import { NewTabRuntime } from '../../src/reader/newtab-runtime';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb-review-bridge';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT } from '../../src/reader/kanji-doodle';
import { assessKanjiStrokes, rankKanjiStrokeCandidates } from '../../src/reader/kanji-stroke-grader';
import { createReaderPopover } from '../../src/reader/popover-shell';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { definitionSourceRows } from '../../src/reader/source-sections';
import { renderNewTabGradeControlButtons, summarizeNewTabReviewSources } from '../../src/reader/newtab/review-controls';
import type { JPDBCard, JPDBGrade, JPDBToken } from '../../src/reader/types';
import { stackedSettingsFixtureDom } from './helpers/settings-fixture';
import { expectSettingsDialogStillMounted, expectStackedLookupOverSettings } from './helpers/stacked-lookup-assertions';
import { waitForExpect } from './test-utils';

const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
const NEW_TAB_CURRENT_WORD_KEY = 'jpdb-reader-newtab-current-word';
const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');

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
    const {
        spelling = '読む',
        vid = spelling.charCodeAt(0),
        sid = 1,
        rid = 1,
        reading = spelling,
        frequencyRank = null,
        partOfSpeech = [],
        meanings = [{ glosses: ['to read'], partOfSpeech: [] }],
        cardState = ['new'],
        pitchAccent = [],
        wordWithReading = null,
        source = 'local',
        reviewSource,
        ankiCardId,
        ankiNoteId,
        ankiDeckNames,
        ankiModelName,
        ankiReps,
        ankiLapses,
        ankiRenderedCards,
        ankiAudioFilenames,
        sentence,
        kanjiKeyword,
        jpdbReviewId,
        jitenWordId,
        jitenReadingIndex,
        fallbackLookupTerms,
    } = overrides;
    return {
        vid,
        sid,
        rid,
        spelling,
        reading,
        frequencyRank,
        partOfSpeech,
        meanings,
        cardState,
        pitchAccent,
        wordWithReading,
        source,
        reviewSource,
        ankiCardId,
        ankiNoteId,
        ankiDeckNames,
        ankiModelName,
        ankiReps,
        ankiLapses,
        ankiRenderedCards,
        ankiAudioFilenames,
        sentence,
        kanjiKeyword,
        jpdbReviewId,
        jitenWordId,
        jitenReadingIndex,
        fallbackLookupTerms,
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

function stubNewTabAudioPlayback(): string[] {
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
    return played;
}

function newTabAudioImmersionExample(id: string): ImmersionKitExample {
    return {
        ...newTabImmersionExample('発音'),
        id,
        sentence: '発音を確かめる。',
        translation: 'Check the pronunciation.',
        soundFile: 'line.mp3',
    };
}

function newTabLocalDictionaryEntry(expression: string, reading: string, gloss: string, score = 1) {
    return { expression, reading, glossary: [gloss], score, dictionary: 'Local' };
}

function newTabLocalDictionaryEntries(...entries: Array<[expression: string, reading: string, gloss: string, score?: number]>) {
    return entries.map(([expression, reading, gloss, score]) => newTabLocalDictionaryEntry(expression, reading, gloss, score));
}

function newTabLocalCardFromEntry(entry: { expression: string; reading: string }): JPDBCard {
    return newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local' });
}

function newTabFallbackCardFromText(text: string): JPDBCard {
    return newTabTestCard({ spelling: text, reading: text, meanings: [], source: 'fallback' });
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

function createStackedNewTabSettingsFixture(runtime: NewTabRuntime) {
    const { settings, settingsForm, settingsBackdrop, anchor } = stackedSettingsFixtureDom();
    const internals = runtime as unknown as {
        settings: typeof settings;
        activeDialog?: HTMLElement;
        activeBackdrop?: HTMLElement;
        activeLookupPopover?: HTMLElement;
        activeLookupBackdrop?: HTMLElement;
        mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { stackOverSettings?: boolean }): void;
        dismissLookupPopover(): void;
        installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
    };
    internals.settings = settings;
    internals.activeDialog = settingsForm;
    internals.activeBackdrop = settingsBackdrop;
    return { settings, settingsForm, settingsBackdrop, anchor, internals };
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

function stubBoundingClientRect(element: HTMLElement, rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>): void {
    const domRect = {
        ...rect,
        x: rect.left,
        y: rect.top,
        toJSON: () => rect,
    } as DOMRect;
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => domRect,
    });
}

function dispatchPointerSwipe(target: HTMLElement, owner: Window, deltaX: number): void {
    const startX = 220;
    const endX = startX + deltaX;
    target.dispatchEvent(testPointerEvent('pointerdown', startX, 120));
    owner.dispatchEvent(testPointerEvent('pointermove', endX, 124));
    owner.dispatchEvent(testPointerEvent('pointerup', endX, 124));
}

function testPointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
    Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: 1 },
    });
    return event;
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

function newTabPromptController(settingsOrGetter: NewTabSettingsSource = DEFAULT_SETTINGS, overrides: Partial<ConstructorParameters<typeof NewTabController>[0]> = {}): NewTabController {
    return newTabBareController(settingsOrGetter, {
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: { lookup: vi.fn(async () => null) } as never,
        rtk: { lookup: vi.fn(async () => null) } as never,
        ...overrides,
    });
}

function renderEnabledNewTabRoot(controller: NewTabController, options: { appendToDocument?: boolean } = {}): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
    if (options.appendToDocument) document.body.append(root);
    return root;
}

type NewTabControllerOptions = ConstructorParameters<typeof NewTabController>[0];
type NewTabSettings = ReturnType<NewTabControllerOptions['getSettings']>;
type NewTabSettingsSource = NewTabSettings | (() => NewTabSettings);
type NewTabRenderedState = {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    reviewCountMode: boolean;
    sourceLabel: string;
    state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
};
type AnkiConnectRequest = { action: string; params: Record<string, unknown> };
type AnkiConnectRequestContext = { query: string; cards: number[]; notes: number[] };
type AnkiConnectResponder = (request: AnkiConnectRequest, context: AnkiConnectRequestContext) => unknown | Promise<unknown>;
type NewTabLookupRenderData = {
    localEntries: unknown[];
    kanjiEntries: unknown[];
    metaEntries: unknown[];
    ankiLookup: AnkiLookupResult;
    jpdbDecks: unknown[];
    ankiDecks: unknown[];
    jpdbVocabularyInfo: unknown;
};
type NewTabLookupRuntimeInternals<T extends NewTabLookupRenderData> = {
    settings: NewTabSettings;
    cardRenderData: { load(): { localEntries: Promise<unknown[]>; all: Promise<T> } };
    parser: { canParse(): boolean; isJpdbBackedCard(card: JPDBCard): boolean };
    showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
};

function newTabSettingsGetter(settingsOrGetter: NewTabSettingsSource): () => NewTabSettings {
    return typeof settingsOrGetter === 'function' ? settingsOrGetter : () => settingsOrGetter;
}

function newTabBareController(
    settingsOrGetter: NewTabSettingsSource = DEFAULT_SETTINGS,
    overrides: Partial<NewTabControllerOptions> = {},
): NewTabController {
    return new NewTabController({
        getSettings: newTabSettingsGetter(settingsOrGetter),
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
        ...overrides,
    });
}

function disconnectedJpdbReviewBridge(): NewTabControllerOptions['jpdbReviewBridge'] {
    return {
        onUpdate: () => () => {},
        latestStatus: () => ({ connected: false }),
        requestCurrent: vi.fn(),
    } as never;
}

function newTabLocalDictionarySummary() {
    return { dictionaries: ['Local'], dictionaryTypes: {} };
}

function newTabEmptyDictionarySummary() {
    return { dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
}

function newTabTermDictionarySummary(alias = 'Local') {
    return {
        dictionaries: [{ title: 'Local', alias, enabled: true, priority: 0, type: 'terms' as const }],
        terms: 1,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

function queueNewTabGrades(...grades: Array<{
    id: string;
    target: string;
    card: JPDBCard;
    grade: string;
    at?: number;
    attempts?: number;
    lastError?: string;
}>): void {
    localStorage.setItem(NEW_TAB_GRADE_QUEUE_KEY, JSON.stringify(grades.map((grade, index) => ({
        at: index + 1,
        attempts: 0,
        ...grade,
    }))));
}

function newTabFlushController(
    settingsOrGetter: NewTabSettingsSource = DEFAULT_SETTINGS,
    overrides: Partial<NewTabControllerOptions> = {},
): NewTabController {
    return newTabBareController(settingsOrGetter, {
        anki: { answerCard: vi.fn() } as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        ...overrides,
    });
}

function newTabLocalFallbackController(
    settingsOrGetter: NewTabSettingsSource,
    localCard: JPDBCard,
    listRandomTopTerms: unknown,
    overrides: Partial<NewTabControllerOptions> = {},
): NewTabController {
    return newTabBareController(settingsOrGetter, {
        jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => []) } as never,
        jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        parser: {
            cacheCards: vi.fn(),
            localCardFromEntry: vi.fn(() => localCard),
        } as never,
        dictionaries: {
            summary: vi.fn(async () => newTabLocalDictionarySummary()),
            listRandomTopTerms,
        } as never,
        ...overrides,
    });
}

function newTabPublicFallbackController(
    settingsOrGetter: NewTabSettingsSource,
    publicSearch: unknown,
    overrides: Partial<NewTabControllerOptions> = {},
): NewTabController {
    return newTabBareController(settingsOrGetter, {
        anki: { listNewTabCards: vi.fn(async () => []) } as never,
        jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch } as never,
        jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        dictionaries: {
            summary: vi.fn(async () => newTabEmptyDictionarySummary()),
        } as never,
        ...overrides,
    });
}

function parseAnkiConnectRequest(init?: RequestInit): AnkiConnectRequest {
    const body = JSON.parse(String(init?.body ?? '{}')) as { action?: unknown; params?: unknown };
    const params = body.params && typeof body.params === 'object'
        ? body.params as Record<string, unknown>
        : {};
    return { action: String(body.action ?? ''), params };
}

function ankiNumberListParam(params: Record<string, unknown>, key: string): number[] {
    const value = params[key];
    return Array.isArray(value) ? value.map(Number) : [];
}

function stubAnkiConnectFetch(responder: AnkiConnectResponder): void {
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
        const request = parseAnkiConnectRequest(init);
        const result = await responder(request, {
            query: String(request.params.query ?? ''),
            cards: ankiNumberListParam(request.params, 'cards'),
            notes: ankiNumberListParam(request.params, 'notes'),
        });
        return new Response(JSON.stringify({ result, error: null }), { status: 200 });
    });
}

function newTabLookupRenderData(overrides: Partial<NewTabLookupRenderData> = {}): NewTabLookupRenderData {
    return {
        localEntries: [],
        kanjiEntries: [],
        metaEntries: [],
        ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
        jpdbDecks: [],
        ankiDecks: [],
        jpdbVocabularyInfo: null,
        ...overrides,
    };
}

function setupNewTabLookupRuntime<T extends NewTabLookupRenderData>(
    runtime: NewTabRuntime,
    renderData: T,
    options: {
        settings?: Partial<NewTabSettings>;
        isJpdbBackedCard?: (card: JPDBCard) => boolean;
    } = {},
): NewTabLookupRuntimeInternals<T> {
    const internals = runtime as unknown as NewTabLookupRuntimeInternals<T>;
    internals.settings = {
        ...DEFAULT_SETTINGS,
        popupMode: 'popover',
        localDictionariesEnabled: false,
        immersionKitEnabled: false,
        ...options.settings,
    };
    internals.cardRenderData = {
        load: () => ({ localEntries: Promise.resolve([]), all: Promise.resolve(renderData) }),
    };
    internals.parser = {
        canParse: () => false,
        isJpdbBackedCard: options.isJpdbBackedCard ?? (() => true),
    };
    return internals;
}

function stubAnkiDeckSearch(deckNames: string[], findCards: (query: string) => unknown | Promise<unknown> = () => []): string[] {
    const queries: string[] = [];
    stubAnkiConnectFetch((request, { query }) => {
        if (request.action === 'deckNames') return deckNames;
        if (request.action === 'findCards') {
            queries.push(query);
            return findCards(query);
        }
        return [];
    });
    return queries;
}

function newTabAnkiClient(overrides: Partial<NewTabSettings> = {}): { settings: NewTabSettings; client: AnkiConnectClient } {
    const settings: NewTabSettings = {
        ...DEFAULT_SETTINGS,
        newTabAnkiEnabled: true,
        ankiDeck: 'Yomu',
        ankiModel: 'Yomu Japanese',
        ...overrides,
    };
    return { settings, client: new AnkiConnectClient(() => settings) };
}

function seedNewTabState(controller: NewTabController, state: NewTabRenderedState['state']): void {
    Object.assign(controller as unknown as { state: NewTabRenderedState['state'] }, { state });
}

function renderNewTabSearchRoot(controller: NewTabController, source = 'jpdb'): HTMLElement {
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
    seedNewTabState(controller, {
        mode: 'search',
        sort: 'random',
        filter: 'study',
        source,
        revealAnswer: false,
    });
    return root;
}

function renderBoundNewTabSearchRoot(controller: NewTabController, source = 'jpdb'): HTMLElement {
    const root = renderNewTabSearchRoot(controller, source);
    (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderSearch(root: HTMLElement): void }).bindRootEvents(root);
    (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);
    return root;
}

function renderPerformedNewTabSearch(controller: NewTabController, query: string, source = 'jpdb'): HTMLElement {
    const root = renderBoundNewTabSearchRoot(controller, source);
    (controller as unknown as { performSearch(root: HTMLElement, query: string): void }).performSearch(root, query);
    return root;
}

function renderSeededNewTabRoot(controller: NewTabController, options: {
    visibleWords: JPDBCard[];
    allWords?: JPDBCard[];
    index?: number;
    reviewCountMode?: boolean;
    sourceLabel: string;
    state: NewTabRenderedState['state'];
    appendToDocument?: boolean;
}): HTMLElement {
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: options.appendToDocument });
    const seededState: Partial<NewTabRenderedState> = {
        visibleWords: options.visibleWords,
        sourceLabel: options.sourceLabel,
        state: options.state,
    };
    if (options.allWords !== undefined) seededState.allWords = options.allWords;
    if (options.index !== undefined) seededState.index = options.index;
    if (options.reviewCountMode !== undefined) seededState.reviewCountMode = options.reviewCountMode;
    Object.assign(controller as unknown as NewTabRenderedState, seededState);
    return root;
}

function seedNewTabRenderedState(controller: NewTabController, options: {
    visibleWords: JPDBCard[];
    allWords?: JPDBCard[];
    index?: number;
    reviewCountMode?: boolean;
    sourceLabel?: string;
    state?: Partial<NewTabRenderedState['state']>;
}): void {
    Object.assign(controller as unknown as NewTabRenderedState, {
        allWords: options.allWords ?? options.visibleWords,
        visibleWords: options.visibleWords,
        index: options.index ?? 0,
        reviewCountMode: options.reviewCountMode ?? false,
        sourceLabel: options.sourceLabel ?? 'JPDB',
        state: {
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'jpdb',
            revealAnswer: false,
            ...options.state,
        },
    });
}

function renderSeededNewTabWord(controller: NewTabController, card: JPDBCard, options: {
    allWords?: JPDBCard[];
    visibleWords?: JPDBCard[];
    index?: number;
    reviewCountMode?: boolean;
    sourceLabel?: string;
    state?: Partial<NewTabRenderedState['state']>;
    appendToDocument?: boolean;
    bindRootEvents?: boolean;
} = {}): HTMLElement {
    const visibleWords = options.visibleWords ?? [card];
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: options.appendToDocument });
    seedNewTabRenderedState(controller, {
        visibleWords,
        allWords: options.allWords,
        index: options.index,
        reviewCountMode: options.reviewCountMode,
        sourceLabel: options.sourceLabel,
        state: options.state,
    });
    const internals = controller as unknown as {
        bindRootEvents(root: HTMLElement): void;
        renderWord(root: HTMLElement, card: JPDBCard): void;
    };
    internals.renderWord(root, card);
    if (options.bindRootEvents) internals.bindRootEvents(root);
    return root;
}

function jpdbAnkiReviewCard(): JPDBCard {
    return newTabTestCard({
        vid: 250,
        sid: 1,
        rid: 2,
        spelling: '日本語',
        reading: 'にほんご',
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        ankiCardId: 404,
        ankiDeckNames: ['Core'],
        ankiRenderedCards: [
            { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
            { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
        ],
    });
}

function renderJpdbAnkiReviewWordFixture(options: { bindRootEvents?: boolean } = {}) {
    const card = jpdbAnkiReviewCard();
    const reviewCard = vi.fn(async () => {});
    const answerCard = vi.fn(async () => {});
    const controller = newTabBareController({
        ...DEFAULT_SETTINGS,
        apiKey: 'jpdb-key',
        jpdbMiningEnabled: true,
        newTabAnkiEnabled: true,
        enableReviews: true,
        immersionKitEnabled: false,
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
    }, {
        anki: { answerCard } as never,
        jpdb: { reviewCard } as never,
    });
    const root = renderSeededNewTabRoot(controller, {
        allWords: [card],
        visibleWords: [card],
        index: 0,
        reviewCountMode: true,
        sourceLabel: 'JPDB + Anki',
        state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: true },
        appendToDocument: true,
    });
    const internals = controller as unknown as {
        bindRootEvents(root: HTMLElement): void;
        renderWord(root: HTMLElement, card: JPDBCard): void;
    };
    if (options.bindRootEvents) internals.bindRootEvents(root);
    internals.renderWord(root, card);
    return { card, reviewCard, answerCard, controller, root };
}

function resetNewTabReviewStorage(): void {
    document.body.replaceChildren();
    localStorage.removeItem(NEW_TAB_UI_KEY);
    localStorage.removeItem(NEW_TAB_CACHE_KEY);
    sessionStorage.removeItem(NEW_TAB_CURRENT_WORD_KEY);
}

async function expectNewTabDictionaryCard(spelling: string, root: ParentNode = document): Promise<void> {
    await waitForExpect(() => {
        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe(spelling);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
        expect(root.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
    });
}

function newTabJpdbAnkiSourceFixture(initialSource: 'jpdb' | 'anki') {
    const settings = {
        ...DEFAULT_SETTINGS,
        apiKey: 'jpdb-key',
        ankiEnabled: true,
        newTabAnkiEnabled: true,
        newTabSource: initialSource,
        newTabJpdbDeck: 'deck',
        newTabJpdbReviewMode: 'api-vocabulary' as const,
        immersionKitEnabled: false,
    };
    const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
    const ankiCard = newTabTestCard({ vid: -1, sid: -1, rid: 101, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
    const listDeckCards = vi.fn(async () => [jpdbCard]);
    const listNewTabCards = vi.fn(async () => [ankiCard]);
    const controller = newTabBareController(settings, {
        anki: { listNewTabCards } as never,
        jpdb: { listDeckCards } as never,
        jpdbReviewBridge: {
            onUpdate: () => () => {},
            latestStatus: () => ({ connected: false }),
            requestCurrent: vi.fn(),
        } as never,
        parser: { cacheCards: vi.fn() } as never,
        dictionaries: {
            summary: vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} })),
            listRandomTopTerms: vi.fn(async () => []),
        } as never,
    });
    return { settings, listDeckCards, listNewTabCards, controller };
}

function applySeededNewTabWords(controller: NewTabController, root: HTMLElement, options: {
    allWords: JPDBCard[];
    sourceLabel: string;
    reviewCountMode?: boolean;
    state: NewTabRenderedState['state'];
}): JPDBCard[] {
    Object.assign(controller as unknown as {
        allWords: JPDBCard[];
        sourceLabel: string;
        reviewCountMode?: boolean;
        state: NewTabRenderedState['state'];
    }, {
        allWords: options.allWords,
        sourceLabel: options.sourceLabel,
        reviewCountMode: options.reviewCountMode,
        state: options.state,
    });
    (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);
    return (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords;
}

function newTabVisibleWordFixture(
    settingsOrGetter: NewTabSettings | (() => NewTabSettings),
    options: {
        card: JPDBCard;
        sourceLabel: string;
        source?: string;
        revealAnswer?: boolean;
        mode?: string;
        sort?: string;
        filter?: string;
        allWords?: JPDBCard[];
        index?: number;
        reviewCountMode?: boolean;
        controllerOverrides?: Partial<NewTabControllerOptions>;
    },
): { controller: NewTabController; root: HTMLElement } {
    const controller = newTabBareController(settingsOrGetter, options.controllerOverrides);
    const root = renderSeededNewTabRoot(controller, {
        visibleWords: [options.card],
        allWords: options.allWords,
        index: options.index,
        reviewCountMode: options.reviewCountMode,
        sourceLabel: options.sourceLabel,
        state: {
            mode: options.mode ?? 'word',
            sort: options.sort ?? 'random',
            filter: options.filter ?? 'study',
            source: options.source ?? 'jpdb',
            revealAnswer: options.revealAnswer ?? true,
        },
        appendToDocument: true,
    });
    return { controller, root };
}

function newTabAutoReviewWordFixture(options: {
    card: JPDBCard;
    answerCard: unknown;
    reviewCard: unknown;
    findExistingCards?: unknown;
}): { controller: NewTabController; root: HTMLElement } {
    const anki = options.findExistingCards === undefined
        ? { answerCard: options.answerCard }
        : { answerCard: options.answerCard, findExistingCards: options.findExistingCards };
    return newTabVisibleWordFixture(() => ({
        ...DEFAULT_SETTINGS,
        apiKey: 'jpdb-key',
        jpdbMiningEnabled: true,
        newTabAnkiEnabled: true,
        enableReviews: true,
        immersionKitEnabled: false,
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
    }), {
        card: options.card,
        index: 0,
        sourceLabel: 'JPDB + Anki',
        source: 'auto',
        revealAnswer: true,
        controllerOverrides: {
            anki: anki as never,
            jpdb: { reviewCard: options.reviewCard } as never,
        },
    });
}

function newTabLiveKanjiStatus() {
    return {
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
}

function newTabLiveVocabularyStatus() {
    return {
        connected: true,
        loginRequired: false,
        message: '',
        card: {
            id: 'v,試験',
            kind: 'vocabulary' as const,
            phase: 'front' as const,
            prompt: '試験',
            answer: 'exam',
            spelling: '試験',
            reading: 'しけん',
            sentence: '試験を受ける。',
            itemsLeft: 8,
            href: 'https://jpdb.io/review?c=v,%E8%A9%A6%E9%A8%93',
        },
    };
}

function newTabLiveReviewController(options: {
    status: ReturnType<typeof newTabLiveKanjiStatus> | ReturnType<typeof newTabLiveVocabularyStatus>;
    settings?: Partial<NewTabSettings>;
    anki?: unknown;
    jpdb?: unknown;
    parser?: unknown;
    requestCurrent?: ReturnType<typeof vi.fn>;
    reveal?: ReturnType<typeof vi.fn>;
    grade?: ReturnType<typeof vi.fn>;
}): NewTabController {
    return newTabPromptController(() => ({
        ...DEFAULT_SETTINGS,
        jpdbMiningEnabled: true,
        enableReviews: true,
        newTabSource: 'jpdb',
        newTabJpdbReviewMode: 'live-review',
        immersionKitEnabled: false,
        newTabParsingEnabled: false,
        newTabFrontSentenceEnabled: false,
        ...options.settings,
    }), {
        anki: (options.anki ?? {}) as never,
        jpdb: (options.jpdb ?? {}) as never,
        jpdbReviewBridge: {
            onUpdate: () => () => {},
            latestStatus: () => options.status,
            requestCurrent: options.requestCurrent ?? vi.fn(),
            reveal: options.reveal ?? vi.fn(),
            grade: options.grade ?? vi.fn(),
        } as never,
        parser: (options.parser ?? {}) as never,
    });
}

function renderNewTabCardFront(controller: NewTabController, card: JPDBCard, options: {
    mode?: string;
    sort?: string;
    filter?: string;
    source?: string;
    sourceLabel?: string;
    revealAnswer?: boolean;
} = {}): HTMLElement {
    const root = renderSeededNewTabRoot(controller, {
        visibleWords: [card],
        index: 0,
        sourceLabel: options.sourceLabel ?? 'JPDB',
        state: {
            mode: options.mode ?? 'word',
            sort: options.sort ?? 'frequency',
            filter: options.filter ?? 'study',
            source: options.source ?? 'jpdb',
            revealAnswer: options.revealAnswer ?? false,
        },
    });
    (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
    return root;
}

function renderNewTabWordFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    return renderNewTabCardFront(controller, card);
}

function renderNewTabKanjiFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    return renderNewTabCardFront(controller, card, { mode: 'kanji' });
}

type NewTabSearchModeApi = {
    bindRootEvents(root: HTMLElement): void;
    renderSearch(root: HTMLElement): void;
    renderSearchHandwritingCandidates(root: HTMLElement, candidates: string[], message: string): void;
    performSearch(root: HTMLElement, query: string): void;
};

function createDictionarySearchModeFixture() {
    const settings = {
        ...DEFAULT_SETTINGS,
        dictionaryLookupLinks: [
            { id: 'jpdb', label: 'JPDB', urlTemplate: 'https://jpdb.io/search?q={query}', enabled: false },
            { id: 'jisho', label: 'Jisho', urlTemplate: 'https://jisho.org/search/{query}', enabled: false },
            { id: 'takoboto', label: 'Takoboto', urlTemplate: 'https://takoboto.jp/?q={query}', enabled: true },
            { id: 'copy', label: 'Copy', urlTemplate: '', enabled: true, action: 'copy' as const },
        ],
    };
    const entriesByQuery = new Map([
        ['cat', [{ expression: '猫', reading: 'ねこ', glossary: ['cat'], score: 20, dictionary: 'Local' }]],
        ['おもし', [{ expression: '面白い', reading: 'おもしろい', glossary: ['interesting'], score: 18, dictionary: 'Local' }]],
    ]);
    const searchTerms = vi.fn(async (query: string) => entriesByQuery.get(query) ?? []);
    const controller = newTabBareController(settings, {
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
    });
    const searchApi = controller as unknown as NewTabSearchModeApi;
    const root = renderBoundNewTabSearchRoot(controller, 'dictionary');

    return { settings, searchTerms, root, searchApi };
}

function newTabSearchInput(root: HTMLElement): HTMLInputElement {
    return root.querySelector<HTMLInputElement>('[data-newtab-search-input]')!;
}

function newTabSearchResultsText(root: HTMLElement): string {
    return root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
}

function newTabSearchAutocompleteText(root: HTMLElement): string {
    return root.querySelector('[data-newtab-search-autocomplete]')?.textContent ?? '';
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
    it('keeps new-tab source load fallback policy explicit', () => {
        expect(newTabSourceLoadPlan('auto', 3)).toEqual({
            kind: 'auto-review',
            primarySources: ['jpdb', 'anki'],
            studyFallback: { kind: 'unconfigured-auto-study' },
        });
        expect(newTabSourceLoadPlan('jpdb', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['jpdb'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
        expect(newTabSourceLoadPlan('anki', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['anki'],
            studyFallback: { kind: 'none' },
        });
        expect(newTabSourceLoadPlan('dictionary', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['dictionary'],
            studyFallback: { kind: 'none' },
        });
    });

    it('keeps mobile new-tab tabs separated from topbar controls', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('@media (max-width: 860px) { .jpdb-reader-newtab-topbar { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "brand controls" "mode mode";');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-mode { grid-area: mode; width: 100%; min-width: 0; max-width: none; justify-self: stretch; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-mode button { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }');
    });

    it('styles current Anki card audio as the newtab icon speaker', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-prompt-anki-card .jpdb-reader-anki-primary-sound { order: -1; align-self: center; justify-self: center; margin: 0 0 2px; background: var(--jpdb-reader-surface); color: var(--jpdb-reader-text); }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-prompt-anki-card .jpdb-reader-anki-primary-sound svg { width: 20px !important; height: 20px !important; max-width: 20px !important; max-height: 20px !important; }');
    });

    it('keeps new-tab button text tied to the active theme tokens', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('button.jpdb-reader-newtab-status { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 26px; padding: 5px 10px; border: 1px solid rgba(139, 160, 177, 0.24); border-radius: 999px; background: var(--jpdb-reader-surface); color: var(--jpdb-reader-text);');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-controls button { display: grid; place-items: center; min-height: 42px; padding: 0 12px; border: 1px solid rgba(139, 160, 177, 0.24); border-radius: 8px; background: linear-gradient( 180deg, color-mix(in srgb, var(--jpdb-reader-surface-2) 82%, var(--jpdb-reader-bg) 18%), color-mix(in srgb, var(--jpdb-reader-surface) 90%, var(--jpdb-reader-bg) 10%) ); color: var(--jpdb-reader-text);');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-controls button[data-grade]:disabled { opacity: 1; color: var(--jpdb-reader-text); -webkit-text-fill-color: var(--jpdb-reader-text); }');
    });

    it('keeps the mobile new-tab mode switch on its own compact header row', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('@media (max-width: 640px) { .jpdb-reader-newtab-shell { width: min(100vw - 16px, 560px); gap: 12px; } .jpdb-reader-newtab-topbar { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "brand controls" "mode mode"; gap: 8px; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-brand { grid-area: brand; justify-self: start; min-width: 32px; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-theme-controls { grid-area: controls; justify-self: end; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-mode { grid-area: mode; width: 100%; max-width: none; grid-template-columns: repeat(4, minmax(0, 1fr)); justify-self: stretch; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-brand span { display: none; }');
    });

    it('selects the nearest stats day when coarse-pointer users tap compact chart gaps', () => {
        const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn((query: string) => ({
                matches: query === '(pointer: coarse)',
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        try {
            const controller = newTabPromptController();
            const internals = controller as unknown as {
                handleRootClick(root: HTMLElement, event: MouseEvent): void;
                renderStats(root: HTMLElement): void;
                statsSelectedDate: string | null;
            };
            internals.renderStats = vi.fn();
            const root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.innerHTML = `
                <div class="jpdb-reader-stats-bars">
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-01"></button>
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-02"></button>
                </div>
                <div class="jpdb-reader-stats-heatmap-grid">
                    <span class="jpdb-reader-stats-heatmap-spacer"></span>
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-03"></button>
                    <button type="button" data-newtab-action="stats-select-day" data-stats-day="2026-06-04"></button>
                </div>
            `;
            root.addEventListener('click', event => internals.handleRootClick(root, event as MouseEvent));
            const bars = root.querySelector<HTMLElement>('.jpdb-reader-stats-bars')!;
            const [firstBar, secondBar] = Array.from(bars.querySelectorAll<HTMLElement>('[data-stats-day]'));
            stubBoundingClientRect(firstBar!, { left: 0, top: 0, right: 10, bottom: 100, width: 10, height: 100 });
            stubBoundingClientRect(secondBar!, { left: 22, top: 0, right: 32, bottom: 100, width: 10, height: 100 });

            bars.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 18, clientY: 50 }));

            expect(internals.statsSelectedDate).toBe('2026-06-02');
            expect(internals.renderStats).toHaveBeenCalledWith(root);

            const heatmap = root.querySelector<HTMLElement>('.jpdb-reader-stats-heatmap-grid')!;
            const [firstCell, secondCell] = Array.from(heatmap.querySelectorAll<HTMLElement>('[data-stats-day]'));
            stubBoundingClientRect(firstCell!, { left: 12, top: 0, right: 22, bottom: 10, width: 10, height: 10 });
            stubBoundingClientRect(secondCell!, { left: 26, top: 0, right: 36, bottom: 10, width: 10, height: 10 });

            heatmap.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 25, clientY: 5 }));

            expect(internals.statsSelectedDate).toBe('2026-06-04');
        } finally {
            if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
            else delete (window as unknown as Record<string, unknown>).matchMedia;
        }
    });

    it('surfaces Jiten SRS in the new-tab API stats connection without JPDB import controls', async () => {
        const jitenCard = newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState: ['due'],
            jitenWordId: 42,
            jitenReadingIndex: 2,
            spelling: '読む',
            reading: 'よむ',
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const showSettings = vi.fn();
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            showSettings,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as {
            bindRootEvents(root: HTMLElement): void;
            loadStatsInto(root: HTMLElement, force?: boolean): Promise<void>;
        };
        try {
            internals.bindRootEvents(root);
            await internals.loadStatsInto(root, true);

            expect(listStudyBatchCards).toHaveBeenCalled();
            expect(root.textContent).toContain('Jiten SRS loaded.');
            expect(Array.from(root.querySelectorAll('[data-stats-source]')).some(tab => tab.textContent === 'Jiten')).toBe(true);
            expect(root.querySelector('[data-newtab-action="stats-import-jpdb"]')).toBeNull();
            expect(root.querySelector('[data-stats-jpdb-file]')).toBeNull();

            const settingsButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="stats-open-jpdb-settings"]')!;
            expect(settingsButton.textContent).toBe('API settings');
            settingsButton.click();
            expect(showSettings).toHaveBeenCalledWith('api');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('combines JPDB and Jiten SRS in the new-tab API stats connection', async () => {
        const jpdbCard = newTabTestCard({
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            spelling: '復習',
            reading: 'ふくしゅう',
            cardState: ['due'],
        });
        const jitenCard = newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState: ['due'],
            jitenWordId: 42,
            jitenReadingIndex: 2,
            spelling: '日本語',
            reading: 'にほんご',
        });
        const listDeckCards = vi.fn(async () => [jpdbCard]);
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const showSettings = vi.fn();
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            showSettings,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as {
            bindRootEvents(root: HTMLElement): void;
            loadStatsInto(root: HTMLElement, force?: boolean): Promise<void>;
        };
        try {
            internals.bindRootEvents(root);
            await internals.loadStatsInto(root, true);

            expect(listDeckCards).toHaveBeenCalledWith('all', 2000);
            expect(listStudyBatchCards).toHaveBeenCalledWith(2000);
            expect(root.textContent).toContain('JPDB + Jiten SRS loaded.');
            expect(Array.from(root.querySelectorAll('[data-stats-source]')).some(tab => tab.textContent === 'JPDB + Jiten')).toBe(true);
            expect(root.querySelector('[data-newtab-action="stats-import-jpdb"]')).not.toBeNull();
            expect(root.querySelector('[data-stats-jpdb-file]')).not.toBeNull();

            const settingsButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="stats-open-jpdb-settings"]')!;
            expect(settingsButton.textContent).toBe('API settings');
            settingsButton.click();
            expect(showSettings).toHaveBeenCalledWith('api');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

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
        stubAnkiConnectFetch(request => {
            actions.push(request.action);
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
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: false,
            ankiModel: '',
        });
        const cards = await listNewTabAnkiCards(client, settings, 10);

        expect(actions).toEqual(['version', 'deckNames', 'findCards', 'areDue', 'cardsInfo', 'notesInfo', 'findCards', 'cardsInfo', 'notesInfo']);
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
        const cardInfoBatchSizes: number[] = [];
        const noteInfoBatchSizes: number[] = [];
        stubAnkiConnectFetch((request, { cards, notes }) => {
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
                    fields: noteId === 3
                        ? {
                            Expression: { value: '突破' },
                            Reading: { value: 'とっぱ' },
                            Meaning: { value: 'breakthrough' },
                        }
                        : {},
                }));
            }
            return null;
        });

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
        const cardInfoBatchSizes: number[] = [];
        const noteInfoBatchSizes: number[] = [];
        stubAnkiConnectFetch((request, { cards, notes }) => {
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
                    modelName: 'Imported Japanese',
                    tags: [],
                    cards: [noteId],
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
            }
            return null;
        });

        const { settings, client } = newTabAnkiClient({
            ankiEnabled: true,
        });
        const cards = await listNewTabAnkiCards(client, settings, 1);

        expect(cards.map(card => card.spelling)).toEqual(['後続']);
        expect(cardInfoBatchSizes).toEqual([24, 48]);
        expect(noteInfoBatchSizes).toEqual([24, 48]);
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

    it('expands word cards into separate kanji practice cards in kanji mode', () => {
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

    it('weaves locked JPDB vocabulary kanji into kanji mode in source order', () => {
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

            expect(visible.map(card => card.spelling)).toEqual(['語', '彙', '復', '習']);
            expect(visible.slice(0, 2).every(card => card.sourceCardKey === '35486:1:語彙:ごい')).toBe(true);
            expect(visible.every(card => card.reviewSource === undefined)).toBe(true);
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
            expect(visible.map(card => card.spelling)).toEqual(['語', '彙', '復', '習']);
            expect((controller as unknown as { index: number }).index).toBe(0);
            expect(document.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe(cardKey(locked));
        } finally {
            restoreCanvas();
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('keeps live JPDB kanji review cards gradeable in kanji mode', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const grade = vi.fn();
        const reveal = vi.fn();
        const requestCurrent = vi.fn();
        const liveStatus = newTabLiveKanjiStatus();
        const controller = newTabLiveReviewController({
            status: liveStatus,
            requestCurrent,
            reveal,
            grade,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        try {
            const state = { mode: 'kanji', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false };
            seedNewTabState(controller, state);
            const result = await (controller as unknown as { loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadJpdbWords();
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const visible = applySeededNewTabWords(controller, root, {
                allWords: result.cards,
                sourceLabel: result.sourceLabel,
                reviewCountMode: result.reviewCountMode === true,
                state,
            });

            expect(visible[0]).toMatchObject({
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

    it('renders live JPDB kanji review cards as kanji prompts in word mode', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const grade = vi.fn();
        const reveal = vi.fn();
        const requestCurrent = vi.fn();
        const liveStatus = newTabLiveKanjiStatus();
        const controller = newTabLiveReviewController({
            status: liveStatus,
            requestCurrent,
            reveal,
            grade,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        try {
            const state = { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false };
            seedNewTabState(controller, state);
            const result = await (controller as unknown as { loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadJpdbWords();
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const visible = applySeededNewTabWords(controller, root, {
                allWords: result.cards,
                sourceLabel: result.sourceLabel,
                reviewCountMode: result.reviewCountMode === true,
                state,
            });

            expect(visible[0]).toMatchObject({
                spelling: '記',
                reviewSource: 'jpdb-live',
                jpdbReviewId: 'kb,記',
            });
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('record');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('記');
            expect(root.querySelector('.jpdb-reader-newtab-doodle')).not.toBeNull();

            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();

            expect(reveal).toHaveBeenCalled();
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('記');
            expect(root.querySelector('[data-grade="okay"]')).not.toBeNull();

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
                newTabAnkiEnabled: true,
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
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読']);
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

            expect(prompt.textContent).toContain('Loading kanji details');
            await waitForExpect(() => {
                expect(prompt.textContent).toContain('No kanji keyword found.');
            });
            expect(prompt.textContent).not.toContain('Loading');
        } finally {
            restoreCanvas();
        }
    });

    it('applies async kanji details to Anki-derived kanji study cards', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const jpdbKanjiLookup = vi.fn(() => lookup.promise);
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
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
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

            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['難', '波']);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('38800:1:難波:なにわ');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('Loading kanji details...');

            lookup.resolve({ kanji: '難', keyword: 'difficult', meanings: ['difficult'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await waitForExpect(() => {
                const prompt = root.querySelector('[data-newtab-prompt]')?.textContent ?? '';
                expect(prompt).toContain('JPDB');
                expect(prompt).toContain('difficult');
                expect(prompt).not.toContain('Loading kanji details');
            });

            expect(jpdbKanjiLookup).toHaveBeenCalledWith('難');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Anki');
            expect(root.querySelector('.jpdb-reader-newtab-doodle')).not.toBeNull();
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('labels the current card origin in the mixed new-tab footer', () => {
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
        try {
            const cards = [
                newTabTestCard({ spelling: '一番', source: 'jpdb', reviewSource: 'jpdb-api' }),
                newTabTestCard({ spelling: '二番', source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 42, jitenReadingIndex: 0 }),
                newTabTestCard({ spelling: '三番', source: 'anki', reviewSource: 'anki' }),
                newTabTestCard({ spelling: '四番', source: 'local' }),
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
                sourceLabel: 'JPDB + Jiten + Anki',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
            });

            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[0]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 4 · JPDB');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('jpdb');

            (controller as unknown as { index: number }).index = 1;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[1]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('2 / 4 · Jiten');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('jiten');

            (controller as unknown as { index: number }).index = 2;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[2]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('3 / 4 · Anki ⇄');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('anki');

            (controller as unknown as { index: number }).index = 3;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[3]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
            expect(root.querySelector('[data-newtab-status] .jpdb-reader-newtab-status-light')).toBeNull();
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('renders SRS queue progress and timer labels while navigating left and right', () => {
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const first = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        });
        const second = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['learning'],
        });
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            showNextWord(): void;
            showPreviousWord(): void;
        };
        try {
            Object.assign(internals, {
                allWords: [first, second],
                visibleWords: [first, second],
                index: 0,
                reviewCountMode: true,
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            });
            internals.bindRootEvents(root);
            internals.renderWord(root, first);

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 2 · JPDB');
            const progress = root.querySelector<HTMLElement>('[data-newtab-count]')!;
            expect(progress.textContent).toMatch(/^1 \/ 2 · Done 0 · Left 2 · Due 2 · \d\d:\d\d$/);
            expect(progress.dataset.sessionCompletedReviews).toBe('0');
            expect(progress.dataset.sessionRemainingCards).toBe('2');
            expect(progress.dataset.sessionRemainingDueCards).toBe('2');
            expect(progress.dataset.sessionElapsed).toMatch(/^\d\d:\d\d$/);
            expect(progress.dataset.sessionJpdbAvailable).toBe('true');
            expect(progress.dataset.sessionJpdbRemainingCards).toBe('2');

            internals.showNextWord();

            expect(internals.index).toBe(1);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('2 / 2 · JPDB');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^2 \/ 2 · Done 0 · Left 2 · Due 2 · \d\d:\d\d$/);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('日本語');

            internals.showPreviousWord();

            expect(internals.index).toBe(0);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 2 · JPDB');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^1 \/ 2 · Done 0 · Left 2 · Due 2 · \d\d:\d\d$/);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('復習');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('renders SRS interval labels on new-tab grade buttons', () => {
        const mount = document.createElement('div');
        mount.append(...renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['nothing', 'Again'], ['hard', 'Hard'], ['okay', 'Good']],
            intervals: {
                nothing: { intervalLabel: '1m' },
                hard: { intervalLabel: '10m' },
                okay: { intervalLabel: '4.1y' },
            },
            selectorLabel: 'Target',
            summary: summarizeNewTabReviewSources(['anki']),
            targetLabel: 'Grades Anki',
            targetOptions: [],
        }));

        const buttons = Array.from(mount.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]'));
        expect(buttons.map(button => button.dataset.grade)).toEqual(['nothing', 'hard', 'okay']);
        expect(buttons.map(button => button.dataset.gradeInterval)).toEqual(['1m', '10m', '4.1y']);
        expect(buttons.map(button => button.querySelector('.jpdb-reader-newtab-grade-interval')?.textContent)).toEqual(['1m', '10m', '4.1y']);
        expect(buttons[0]?.getAttribute('aria-label')).toBe('Again 1m: Grades Anki');
    });

    it.todo('wires card.reviewGradeIntervals into the main new-tab grade bar');

    it('submits swipe-left and swipe-right grades on revealed new-tab SRS cards', async () => {
        vi.stubGlobal('PointerEvent', class {});
        const runSwipe = async (deltaX: number, expectedGrade: JPDBGrade): Promise<void> => {
            const current = newTabTestCard({
                spelling: deltaX < 0 ? '失敗' : '成功',
                reading: deltaX < 0 ? 'しっぱい' : 'せいこう',
                source: 'jpdb',
                reviewSource: 'jpdb-api',
                cardState: ['due'],
            });
            const next = newTabTestCard({
                spelling: '次',
                reading: 'つぎ',
                source: 'jpdb',
                reviewSource: 'jpdb-api',
                cardState: ['due'],
            });
            const reviewCard = vi.fn(async () => {});
            const controller = newTabPromptController({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
            }, {
                jpdb: { reviewCard } as never,
            });
            const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
            const internals = controller as unknown as {
                allWords: JPDBCard[];
                visibleWords: JPDBCard[];
                index: number;
                reviewCountMode: boolean;
                sourceLabel: string;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
                bindRootEvents(root: HTMLElement): void;
                renderWord(root: HTMLElement, card: JPDBCard): void;
            };
            try {
                Object.assign(internals, {
                    allWords: [current, next],
                    visibleWords: [current, next],
                    index: 0,
                    reviewCountMode: true,
                    sourceLabel: 'JPDB',
                    state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
                });
                internals.bindRootEvents(root);
                internals.renderWord(root, current);

                const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
                dispatchPointerSwipe(study, window, deltaX);

                await Promise.resolve();
                await Promise.resolve();

                expect(root.dataset.newtabSwipeDirection).toBe(deltaX < 0 ? 'left' : 'right');
                expect(root.dataset.newtabSwipeAction).toBe(deltaX < 0 ? 'again' : 'good');
                expect(reviewCard).toHaveBeenCalledWith(current, expectedGrade);
            } finally {
                controller.destroy();
                root.remove();
            }
        };

        await runSwipe(-140, 'nothing');
        await runSwipe(140, 'okay');
    });

    it('lets the status footer toggle JPDB and Anki directly and persists the source setting', async () => {
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
        const listNewTabCards = vi.fn(async () => [ankiCard]);
        const listDeckCards = vi.fn(async () => [jpdbCard]);
        const controller = newTabBareController(settings, {
            anki: {
                listNewTabCards,
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
                requestCurrent: vi.fn(),
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => dictionaryCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: vi.fn(async () => [{ expression: '書く', reading: 'かく', glossary: ['to write'], score: 1, dictionary: 'Local' }]),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(listNewTabCards).toHaveBeenCalledTimes(1);
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
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(listNewTabCards).toHaveBeenCalledTimes(1);
        const ankiStatus = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(ankiStatus.textContent).toContain('Anki ⇄');
        expect(ankiStatus.disabled).toBe(false);
        expect(ankiStatus.dataset.sourceToggleTarget).toBe('jpdb');

        ankiStatus.click();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('jpdb');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
        });
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        const returnedJpdbStatus = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(returnedJpdbStatus.textContent).toContain('JPDB ⇄');
        expect(returnedJpdbStatus.dataset.sourceToggleTarget).toBe('anki');

        returnedJpdbStatus.click();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
        });
        expect(listNewTabCards).toHaveBeenCalledTimes(1);

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('switches from JPDB to Anki when saved source state is already stale Anki', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
            const status = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
            expect(status.dataset.sourceToggleTarget).toBe('anki');

            const internals = controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            };
            internals.state = { ...internals.state, source: 'anki' };
            status.click();

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
            });
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(listNewTabCards).toHaveBeenCalledOnce();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse a stale JPDB cache entry when switching to Anki', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
            const internals = controller as unknown as {
                sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean } }>;
                sourceCacheSignature(source: 'anki'): string;
            };
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [newTabTestCard({
                        vid: 1,
                        sid: 1,
                        spelling: '日本語',
                        reading: 'にほんご',
                        source: 'jpdb',
                        reviewSource: 'jpdb-api',
                    })],
                    sourceLabel: 'JPDB',
                    reviewCountMode: true,
                },
            });

            document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.click();

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(listNewTabCards).toHaveBeenCalledOnce();
                expect(document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.textContent).toContain('Anki');
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
            }, 3000);
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.dataset.sourceToggleTarget).toBe('jpdb');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse an unreachable empty Anki cache entry when switching from JPDB', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
            const internals = controller as unknown as {
                sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean; emptyMessageKey?: string } }>;
                sourceCacheSignature(source: 'anki'): string;
            };
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [],
                    sourceLabel: 'Anki',
                    reviewCountMode: false,
                    emptyMessageKey: 'ankiUnreachable',
                },
            });

            document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.click();

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(listNewTabCards).toHaveBeenCalledOnce();
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
            }, 3000);
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.dataset.sourceToggleTarget).toBe('jpdb');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('switches from Anki to JPDB when saved source state is already stale JPDB', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('anki');

        try {
            await controller.renderPage();
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
            const status = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
            expect(status.dataset.sourceToggleTarget).toBe('jpdb');

            const internals = controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            };
            internals.state = { ...internals.state, source: 'jpdb' };
            status.click();

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('jpdb');
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
            });
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listDeckCards).toHaveBeenCalledOnce();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('cycles merged JPDB and Anki review cards from the selected source', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const root = renderEnabledNewTabRoot(controller);
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const internals = controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        Object.assign(internals, {
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
        });

        internals.renderWord(root, card);
        const jpdbStatus = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(jpdbStatus.textContent).toContain('JPDB + Anki ⇄');
        expect(jpdbStatus.dataset.sourceToggleTarget).toBe('anki');

        internals.state = { ...internals.state, source: 'anki' };
        internals.sourceLabel = 'JPDB + Anki';
        internals.renderWord(root, card);

        const ankiStatus = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(ankiStatus.textContent).toContain('JPDB + Anki ⇄');
        expect(ankiStatus.dataset.sourceToggleTarget).toBe('jpdb');
    });

    it('recomputes stale source-toggle targets on repeated clicks', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const root = renderSeededNewTabRoot(controller, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            appendToDocument: true,
        });
        const switched: string[] = [];
        const internals = controller as unknown as {
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            sourceLabel: string;
            switchReviewSource(root: HTMLElement, source: 'jpdb' | 'anki' | 'dictionary'): Promise<void>;
        };
        internals.switchReviewSource = vi.fn(async (_root, source) => {
            switched.push(source);
            internals.state = { ...internals.state, source, revealAnswer: false };
            internals.sourceLabel = 'JPDB + Anki';
            internals.renderWord(root, card);
        });

        try {
            internals.bindRootEvents(root);
            internals.renderWord(root, card);

            const firstStatus = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
            expect(firstStatus.dataset.sourceToggleTarget).toBe('anki');
            firstStatus.dataset.sourceToggleTarget = 'jpdb';
            firstStatus.click();
            expect(switched).toEqual(['anki']);

            const secondStatus = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
            expect(secondStatus.dataset.sourceToggleTarget).toBe('jpdb');
            secondStatus.dataset.sourceToggleTarget = 'anki';
            secondStatus.click();
            expect(switched).toEqual(['anki', 'jpdb']);
        } finally {
            root.remove();
        }
    });

    it('toggles from the visible source when selected source state is stale', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
        });
        const root = renderEnabledNewTabRoot(controller);
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const internals = controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        Object.assign(internals, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false },
        });

        internals.renderWord(root, card);

        const status = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toContain('JPDB + Anki ⇄');
        expect(status.dataset.sourceToggleTarget).toBe('anki');
    });

    it('does not toggle a visible JPDB card back to JPDB when Anki is available', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
        });
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const root = renderNewTabCardFront(controller, card, {
            sort: 'random',
            source: 'anki',
            sourceLabel: '',
        });

        const status = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toContain('JPDB + Anki ⇄');
        expect(status.dataset.sourceToggleTarget).toBe('anki');
    });

    it('falls back to study words when the status footer toggles to unavailable Anki', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb' });
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
        });

        await controller.renderPage();
        const status = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toContain('JPDB ⇄');
        expect(status.dataset.sourceToggleTarget).toBe('anki');

        status.click();

        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.dataset.sourceToggleTarget).toBeUndefined();
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        });
        expect(listNewTabCards).toHaveBeenCalledOnce();
        expect(listRandomTopTerms).toHaveBeenCalled();

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('falls back to study words when explicitly opening an unavailable Anki source', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards,
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        try {
            await controller.renderPage();

            await waitForExpect(() => {
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
                expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
                expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            });
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('retries unavailable Anki and falls back to study words after auto review loads JPDB first', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: false,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: {
                listNewTabCards,
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
        expect(listNewTabCards).toHaveBeenCalledOnce();
        const status = document.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
        expect(status.textContent).toContain('JPDB ⇄');
        expect(status.dataset.sourceToggleTarget).toBe('anki');

        status.click();

        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        });
        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalled();

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('ignores stale Anki source switch completions after switching back to JPDB', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb' as const,
            immersionKitEnabled: false,
        };
        const firstSettingsSave = deferred<void>();
        let settingsSaveCalls = 0;
        const onSettingsChange = vi.fn(() => {
            settingsSaveCalls++;
            return settingsSaveCalls === 1 ? firstSettingsSave.promise : Promise.resolve();
        });
        const controller = newTabPromptController(settings, { onSettingsChange });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const loadedSources: string[] = [];
        const internals = controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto(root: HTMLElement, preferStoredWord: boolean, options: { useOfflineCache: boolean }): Promise<void>;
            switchReviewSource(root: HTMLElement, source: 'anki' | 'jpdb'): Promise<void>;
        };
        internals.state = { mode: 'word', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false };
        internals.loadWordsInto = vi.fn(async () => {
            loadedSources.push(internals.state.source);
        });

        try {
            const ankiSwitch = internals.switchReviewSource(root, 'anki');
            expect(settings.newTabSource).toBe('anki');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Loading...');

            await internals.switchReviewSource(root, 'jpdb');
            expect(settings.newTabSource).toBe('jpdb');
            expect(loadedSources).toEqual(['jpdb']);

            firstSettingsSave.resolve();
            await ankiSwitch;

            expect(loadedSources).toEqual(['jpdb']);
        } finally {
            root.remove();
        }
    });

    it('restores a rendered card when navigation supplement loading fails', async () => {
        const card = newTabTestCard({ spelling: '一番', reading: 'いちばん', source: 'local', reviewSource: 'dictionary' });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabSource: 'dictionary' as const,
            immersionKitEnabled: false,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            reviewCountMode: boolean;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
            loadNavigationSupplementCards(source: 'dictionary'): Promise<JPDBCard[]>;
            loadMoreForNavigation(root: HTMLElement, direction: 1, source: 'dictionary'): Promise<void>;
        };
        Object.assign(internals, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Dictionary',
            reviewCountMode: false,
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'dictionary', revealAnswer: false },
        });
        internals.loadNavigationSupplementCards = vi.fn(async () => {
            throw new Error('dictionary unavailable');
        });

        try {
            internals.renderWord(root, card);

            await internals.loadMoreForNavigation(root, 1, 'dictionary');

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('一番');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(root.querySelector('[data-newtab-status]')?.textContent).not.toContain('Looking for more words');
        } finally {
            root.remove();
        }
    });

    it('does not offer a misleading Dictionary toggle for Anki-only cards', () => {
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
            jpdbVocabulary: { search: vi.fn() } as never,
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
        const root = renderEnabledNewTabRoot(controller);
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
        expect(status.textContent).toBe('1 / 1 · Anki');
        expect(status.dataset.newtabAction).toBeUndefined();
        expect(status.dataset.sourceToggleTarget).toBeUndefined();
        expect(status.title).toBe('');
        expect(status.disabled).toBe(true);
    });

    it('falls back to study words when the selected Anki source has no card lister', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('見る', 'みる', 'to see')]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
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
                latestStatus: () => ({ connected: false }),
            } as never,
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        try {
            await controller.renderPage();

            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('見る');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('lets JPDB users switch to study words when Anki is enabled but unavailable', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabSource: 'jpdb' as const,
            newTabAnkiEnabled: true,
            immersionKitEnabled: false,
        };
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
        });
        const { controller, root } = newTabVisibleWordFixture(settings, {
            card,
            sourceLabel: 'JPDB',
            source: 'jpdb',
            revealAnswer: false,
            controllerOverrides: {
                jpdbReviewBridge: {
                    onUpdate: () => () => {},
                    latestStatus: () => ({ connected: false }),
                } as never,
                parser: {
                    cacheCards: vi.fn(),
                    localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
                } as never,
                dictionaries: {
                    summary: vi.fn(async () => newTabLocalDictionarySummary()),
                    listRandomTopTerms: vi.fn(async () => [newTabLocalDictionaryEntry('読む', 'よむ', 'to read')]),
                } as never,
            },
        });

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            const status = root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
            expect(status.dataset.sourceToggleTarget).toBe('anki');

            status.click();

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toBe('読む');
                expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
                expect(root.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            });
        } finally {
            root.remove();
        }
    });

    it('defaults auto source to Anki when Anki is connected and JPDB is not configured', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto' as const,
            newTabJpdbReviewMode: 'api-vocabulary' as const,
            immersionKitEnabled: false,
        };
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const listNewTabCards = vi.fn(async () => [ankiCard]);
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '日本語', reading: 'にほんご', source: 'jpdb' })]);
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        try {
            await controller.renderPage();

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
            expect(settings.newTabSource).toBe('auto');
            expect(listNewTabCards).toHaveBeenCalledTimes(1);
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();
            expect(listRandomTopTerms).not.toHaveBeenCalled();
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('does not fall back to JPDB again when switching explicitly from JPDB to an empty Anki queue', async () => {
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
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(settings, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards: vi.fn(async () => [jpdbCard]) } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('日本語');
        listRandomTopTerms.mockClear();

        document.querySelector<HTMLButtonElement>('[data-newtab-status]')?.click();
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).not.toBe('日本語');
        });

        expect(listNewTabCards).toHaveBeenCalledTimes(1);
        expect(listRandomTopTerms).not.toHaveBeenCalled();

        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
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

    it('keeps auto JPDB review cards strict for a tiny queue', async () => {
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
        const loadDictionary = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
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
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms: loadDictionary,
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['読む']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(loadDictionary).not.toHaveBeenCalled();
    });

    it('does not navigate from a single SRS card into supplemental dictionary cards', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const dictionaryCard = newTabTestCard({ vid: -2, sid: 0, spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(() => dictionaryCard),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('読む');
        expect(listRandomTopTerms).not.toHaveBeenCalled();

        document.querySelector<HTMLButtonElement>('[data-newtab-action="next"]')?.click();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('読む');

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
            [newTabLocalDictionaryEntry('読む', 'よむ', 'to read')],
            [newTabLocalDictionaryEntry('書く', 'かく', 'to write')],
        ];
        const listRandomTopTerms = vi.fn(async () => batches.shift() ?? []);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
                immersionKitEnabled: false,
            }), {
            parser: {
                cacheCards: vi.fn(),
                localCardFromEntry: vi.fn(entry => newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local', reviewSource: 'dictionary' })),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
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
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
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
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => jpdbCards),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['日本語', '辞書', '復習', '暗記', '例文']);
        expect(result.sourceLabel).toBe('JPDB + Anki');
    });

    it('loads Anki new-tab reviews even when Anki mining is disabled', async () => {
        document.body.replaceChildren();
        localStorage.setItem('jpdb-reader-newtab-ui', JSON.stringify({
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'anki',
            revealAnswer: false,
        }));
        const ankiCards = [
            newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' }),
        ];
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                ankiEnabled: false,
                newTabAnkiEnabled: true,
                newTabSource: 'anki',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
        });

        try {
            await controller.renderPage();

            await waitForExpect(() => {
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('暗記');
            });
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('uses Anki in auto source when JPDB has no cards', async () => {
        const ankiCards = [
            newTabTestCard({ vid: -1, sid: -1, spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ vid: -2, sid: -2, spelling: '例文', reading: 'れいぶん', source: 'anki', reviewSource: 'anki' }),
        ];
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => ankiCards),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => []),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
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
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [jpdbCard]),
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();

        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0]?.reviewSource).toBe('jpdb-api');
    });

    it('loads Jiten SRS cards through the new-tab API source when only Jiten is configured', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => []),
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toEqual([expect.objectContaining({
            spelling: '日本語',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        })]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
        expect(listDeckCards).not.toHaveBeenCalled();
    });

    it('interleaves JPDB and Jiten SRS cards through the shared new-tab API source', async () => {
        const jpdbCard = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        });
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
            cardState: ['due'],
        });
        const listDeckCards = vi.fn(async () => [jpdbCard]);
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => []),
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('JPDB + Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([
            ['復習', 'jpdb-api'],
            ['日本語', 'jiten-api'],
        ]);
        expect(listDeckCards).toHaveBeenCalledWith('all', 180, { scheduledOnly: true });
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('loads Jiten SRS cards even when API write actions are disabled', async () => {
        const jitenCard = newTabTestCard({
            vid: 42,
            sid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: false,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
            jpdb: { listDeckCards: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                requestCurrent: vi.fn(),
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {
                summary: vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} })),
                listRandomTopTerms: vi.fn(async () => []),
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => card.reviewSource)).toEqual(['jiten-api']);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('keeps locked JPDB API cards in deck order and makes them gradeable', async () => {
        const locked = newTabTestCard({ spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', cardState: ['locked'] });
        const due = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', cardState: ['due'] });
        const reviewCard = vi.fn(async () => undefined);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                immersionKitEnabled: false,
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(async () => [locked, due]),
                reviewCard,
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; reviewCountMode?: boolean }> }).loadWords();
            Object.assign(controller as unknown as {
                allWords: JPDBCard[];
                sourceLabel: string;
                reviewCountMode: boolean;
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            }, {
                allWords: result.cards,
                sourceLabel: 'JPDB',
                reviewCountMode: true,
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
            });

            (controller as unknown as { applyWords(root: HTMLElement, preferStoredWord: boolean): void }).applyWords(root, false);

            expect(result.reviewCountMode).toBe(true);
            expect(result.cards.map(card => card.spelling)).toEqual(['未解禁', '復習']);
            expect(result.cards.map(card => card.reviewSource)).toEqual(['jpdb-api', 'jpdb-api']);
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['未解禁', '復習']);
            expect(root.querySelectorAll('[data-grade]')).toHaveLength(5);
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades JPDB');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');
            expect(reviewCard).toHaveBeenCalledWith(expect.objectContaining({
                spelling: '未解禁',
                reading: 'みかいきん',
                cardState: ['locked'],
                reviewSource: 'jpdb-api',
            }), 'okay');
        } finally {
            root.remove();
        }
    });

    it('submits new-tab Jiten review grades through the Jiten API provider', async () => {
        const card = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        const jitenReviewCard = vi.fn(async () => undefined);
        const jpdbReviewCard = vi.fn(async () => undefined);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }, {
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard: jpdbReviewCard } as never,
            jiten: { listStudyBatchCards: vi.fn(), reviewCard: jitenReviewCard } as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }) } as never,
            parser: { cacheCards: vi.fn() } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
            sourceLabel: 'Jiten',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Jiten');
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Jiten');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(jitenReviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(jpdbReviewCard).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('loads JPDB review cards from the all-decks queue when the all-decks setting is selected', async () => {
        const locked = newTabTestCard({ spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', cardState: ['locked'] });
        const due = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', cardState: ['due'] });
        const listDecks = vi.fn(async () => [{ id: 'deck-1', name: 'Deck 1' }]);
        const listDeckCards = vi.fn(async () => [locked, due]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'all',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDecks,
                listDeckCards,
            } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => card.spelling)).toEqual(['未解禁', '復習']);
        expect(result.cards.map(card => card.reviewSource)).toEqual(['jpdb-api', 'jpdb-api']);
        expect(listDeckCards).toHaveBeenCalledWith('all', 180, { scheduledOnly: true });
        expect(listDecks).not.toHaveBeenCalled();
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
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
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
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(
            ['書く', 'かく', 'to write'],
            ['見る', 'みる', 'to see'],
        ));
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
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    ...newTabTermDictionarySummary(),
                    terms: 2,
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
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
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
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    ...newTabTermDictionarySummary(),
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

    it('keeps strict JPDB review empty instead of falling back when no cards are scheduled', async () => {
        const listDeckCards = vi.fn(async () => [newTabTestCard({ spelling: '既知', source: 'jpdb', cardState: ['known'] })]);
        const publicSearch = vi.fn(async (query: string) => [
            newTabTestCard({ spelling: `${query}公開`, reading: `${query}こうかい`, source: 'jpdb', cardState: ['not-in-deck'] }),
        ]);
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['新語', 'しんご', 'new word']));
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
            }), {
            anki: {
                listNewTabCards: vi.fn(async () => []),
            } as never,
            jpdb: {
                listDeckCards,
            } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
                listRandomTopTerms,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(listDeckCards).toHaveBeenCalledWith('deck', 180, { scheduledOnly: true });
        expect(result.cards).toEqual([]);
        expect(result.sourceLabel).toBe('JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(publicSearch).not.toHaveBeenCalled();
        expect(listRandomTopTerms).not.toHaveBeenCalled();
    });

    it('uses navigation instead of grade buttons for JPDB cards when JPDB writes are disabled', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: false,
                enableReviews: true,
                immersionKitEnabled: false,
            }));
        const root = renderEnabledNewTabRoot(controller);
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
        const controller = newTabFlushController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabOfflineEnabled: true,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }), {
            jpdb: { reviewCard } as never,
        });
        const root = renderSeededNewTabWord(controller, first, {
            allWords: [first, second],
            visibleWords: [first, second],
            reviewCountMode: true,
            sourceLabel: 'JPDB (offline)',
            state: { source: 'jpdb', revealAnswer: true },
            appendToDocument: true,
        });

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
        queueNewTabGrades({
            id: 'jpdb-api:1:1:安定:あんてい',
            target: 'jpdb-api',
            card,
            grade: 'easy',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('flushes queued Jiten grades through the Jiten API provider', async () => {
        const card = newTabTestCard({
            vid: 42,
            sid: 2,
            rid: 9001,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 2,
        });
        queueNewTabGrades({
            id: 'jiten-api:42:2:日本語:にほんご',
            target: 'jiten-api',
            card,
            grade: 'easy',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
        }, {
            anki: { answerCard: vi.fn() } as never,
            jpdb: { reviewCard: vi.fn() } as never,
            jiten: { listStudyBatchCards: vi.fn(), reviewCard } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        });

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('submits queued locked JPDB grades', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['locked'] });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:未解禁:みかいきん',
            target: 'jpdb-api',
            card,
            grade: 'easy',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(reviewCard).toHaveBeenCalledWith(card, 'easy');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('keeps queued JPDB grades when sync fails so they can retry later', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:安定:あんてい',
            target: 'jpdb-api',
            card,
            grade: 'hard',
        });
        const reviewCard = vi.fn(async () => { throw new Error('offline'); });
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'hard', attempts: 1, lastError: 'offline' });
    });

    it('does not let a failed Anki sync block a reachable JPDB queued grade', async () => {
        const ankiCard = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades(
            { id: 'anki:404', target: 'anki', card: ankiCard, grade: 'fail' },
            { id: 'jpdb-api:1:1:安定:あんてい', target: 'jpdb-api', card: jpdbCard, grade: 'easy' },
        );
        const answerCard = vi.fn(async () => { throw new Error('anki offline'); });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, ankiEnabled: true }), {
            anki: { answerCard } as never,
            jpdb: { reviewCard } as never,
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
        queueNewTabGrades({
            id: 'anki:404',
            target: 'anki',
            card,
            grade: 'pass',
        });
        const answerCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true }), {
            anki: { answerCard } as never,
        });

        await (controller as unknown as { flushQueuedGrades(): Promise<void> }).flushQueuedGrades();

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('invalidates cached Anki queues after queued Anki grades flush', async () => {
        const stale = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const fresh = newTabTestCard({ spelling: '次回', reading: 'じかい', source: 'anki', reviewSource: 'anki', ankiCardId: 405 });
        queueNewTabGrades({
            id: 'anki:404',
            target: 'anki',
            card: stale,
            grade: 'pass',
        });
        const listNewTabCards = vi.fn(async (): Promise<JPDBCard[]> => [stale]);
        listNewTabCards.mockResolvedValueOnce([stale]).mockResolvedValueOnce([fresh]);
        const answerCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true }), {
            anki: { answerCard, listNewTabCards } as never,
        });
        const internals = controller as unknown as {
            loadWordsFromSource(source: 'anki'): Promise<{ cards: JPDBCard[] }>;
            flushQueuedGrades(): Promise<void>;
        };

        await expect(internals.loadWordsFromSource('anki')).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '復習' })],
        });
        await internals.flushQueuedGrades();
        await expect(internals.loadWordsFromSource('anki')).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '次回' })],
        });

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem(NEW_TAB_GRADE_QUEUE_KEY)).toBeNull();
    });

    it('retries queued grades when the browser comes back online', async () => {
        const card = newTabTestCard({ vid: 1, sid: 1, spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        queueNewTabGrades({
            id: 'jpdb-api:1:1:安定:あんてい',
            target: 'jpdb-api',
            card,
            grade: 'okay',
        });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabFlushController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true }), {
            jpdb: { reviewCard } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }), {
            card,
            index: 0,
            sourceLabel: 'JPDB (offline)',
            source: 'jpdb',
            revealAnswer: true,
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
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            jpdbMiningEnabled: true,
            enableReviews: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'live-review',
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }), {
            card,
            allWords: [card],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB Live review',
            source: 'jpdb',
            revealAnswer: true,
            controllerOverrides: {
                jpdbReviewBridge: {
                    onUpdate: () => () => {},
                    latestStatus: () => liveStatus,
                    requestCurrent: vi.fn(),
                    grade: vi.fn(),
                } as never,
            },
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

    it('reviews Anki new-tab cards even when Anki mining is disabled', async () => {
        const card = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const answerCard = vi.fn(async () => {});
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            newTabAnkiEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabParsingEnabled: false,
            newTabFrontSentenceEnabled: false,
        }), {
            card,
            index: 0,
            sourceLabel: 'Anki',
            source: 'anki',
            revealAnswer: true,
            controllerOverrides: {
                anki: { answerCard } as never,
            },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelectorAll('[data-grade]').length).toBeGreaterThan(0);
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Anki #404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Anki');

            await (controller as unknown as { gradeCurrentCard(grade: 'pass'): Promise<void> }).gradeCurrentCard('pass');

            expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        } finally {
            root.remove();
        }
    });

    it('merges matching JPDB and Anki auto review cards into one dual-source prompt', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({
            vid: 250,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
        });
        const ankiCard = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiNoteId: 1404,
            ankiDeckNames: ['Core'],
            rid: 404,
        });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
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
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: false }) } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as {
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
            loadAnkiWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
        }, {
            async loadJpdbWords() {
                return { cards: [jpdbCard], sourceLabel: 'JPDB', reviewCountMode: true };
            },
            async loadAnkiWords() {
                return { cards: [ankiCard], sourceLabel: 'Anki', reviewCountMode: true };
            },
        });

        await controller.renderPage();

        const words = (controller as unknown as { allWords: JPDBCard[] }).allWords;
        expect(words).toHaveLength(1);
        expect(words[0]).toMatchObject({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiNoteId: 1404,
            ankiDeckNames: ['Core'],
        });
        expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('JPDB + Anki');
        expect(Array.from(document.querySelectorAll<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')).map(light => light.dataset.source))
            .toEqual(['jpdb', 'anki']);
        document.body.replaceChildren();
    });

    it('merges live JPDB review cards with matching Anki cards so grading hits both backends', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({
            vid: 0,
            sid: 0,
            rid: 0,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-live',
            jpdbReviewId: 'live-vocab-1',
        });
        const ankiCard = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiNoteId: 1404,
            ankiDeckNames: ['Core'],
            rid: 404,
        });
        const answerCard = vi.fn(async () => {});
        const grade = vi.fn();
        const requestCurrent = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                jpdbMiningEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: { answerCard } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: false }),
                grade,
                requestCurrent,
            } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as {
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
            loadAnkiWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
        }, {
            async loadJpdbWords() {
                return { cards: [jpdbCard], sourceLabel: 'JPDB', reviewCountMode: true };
            },
            async loadAnkiWords() {
                return { cards: [ankiCard], sourceLabel: 'Anki', reviewCountMode: true };
            },
        });

        try {
            await controller.renderPage();

            const words = (controller as unknown as { allWords: JPDBCard[] }).allWords;
            expect(words).toHaveLength(1);
            expect(words[0]).toMatchObject({
                spelling: '日本語',
                reading: 'にほんご',
                reviewSource: 'jpdb-live',
                ankiCardId: 404,
                ankiNoteId: 1404,
                ankiDeckNames: ['Core'],
            });
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('JPDB + Anki');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(grade).toHaveBeenCalledWith('okay');
            expect(requestCurrent).toHaveBeenCalled();
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
        } finally {
            document.body.replaceChildren();
        }
    });

    it('submits one new-tab grade to both JPDB and Anki when a review card has both targets', async () => {
        const { card, reviewCard, answerCard, controller, root } = renderJpdbAnkiReviewWordFixture();

        try {
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades JPDB + Anki card: Core #404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Both');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
        } finally {
            root.remove();
        }
    });

    it('lets the main new-tab grade bar split JPDB and individual Anki targets while keeping Both as the default', async () => {
        const { card, reviewCard, answerCard, root } = renderJpdbAnkiReviewWordFixture({ bindRootEvents: true });

        try {
            const targetSelect = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual(['Both', 'JPDB', 'Core #404', 'Core #405']);
            expect(targetSelect.value).toBe('both');
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Both');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades JPDB + Anki card: Core #404');

            targetSelect.value = 'jpdb';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('JPDB');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades JPDB');
            expect(root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.getAttribute('aria-label')).toBe('Okay: Grades JPDB');
            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();

            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            });
            expect(answerCard).not.toHaveBeenCalled();

            targetSelect.value = 'anki:405';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Core #405');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core #405');
            expect(root.querySelector<HTMLButtonElement>('[data-grade="easy"]')?.getAttribute('aria-label')).toBe('Easy: Grades Anki card: Core #405');
            root.querySelector<HTMLButtonElement>('[data-grade="easy"]')?.click();

            await waitForExpect(() => {
                expect(answerCard).toHaveBeenCalledWith(405, 'easy');
            });
            expect(reviewCard).toHaveBeenCalledTimes(1);
        } finally {
            root.remove();
        }
    });

    it('lets Anki-only duplicate cards choose the exact Anki card to grade', async () => {
        const card = newTabTestCard({
            vid: -1,
            sid: -1,
            rid: 404,
            spelling: '読む',
            reading: 'よむ',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['RRTK'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'RRTK', cardName: 'Recognition', question: '読む', answer: 'read' },
                { cardId: 405, deckName: 'Core', cardName: 'Production', question: '読む', answer: 'reading vocabulary' },
            ],
        });
        const answerCard = vi.fn(async () => {});
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                newTabAnkiEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }), {
            anki: { answerCard } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
            sourceLabel: 'Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: true },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        try {
            const targetSelect = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]')!;
            expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual(['RRTK · Recognition #404', 'Core · Production #405']);
            expect(targetSelect.value).toBe('anki:404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('RRTK · Recognition #404');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: RRTK · Recognition #404');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Anki');
            expect(root.querySelector('[data-newtab-status]')?.textContent).not.toContain('JPDB');

            targetSelect.value = 'anki:405';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Core · Production #405');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core · Production #405');
            root.querySelector<HTMLButtonElement>('[data-grade="hard"]')?.click();

            await waitForExpect(() => {
                expect(answerCard).toHaveBeenCalledWith(405, 'hard');
            });
        } finally {
            root.remove();
        }
    });

    it('queues only the failed provider when one half of a dual-source review grade is offline', async () => {
        const card = newTabTestCard({
            vid: 250,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
            ],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => { throw new Error('anki offline'); });
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                newTabAnkiEnabled: true,
                enableReviews: true,
                newTabOfflineEnabled: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
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
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
            sourceLabel: 'JPDB + Anki',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: true },
        });
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        try {
            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
            const queue = readNewTabGradeQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0]).toMatchObject({ target: 'anki', grade: 'okay', attempts: 0 });
        } finally {
            root.remove();
        }
    });

    it('reloads the Anki SRS queue after grading instead of reusing a stale source cache', async () => {
        document.body.replaceChildren();
        const first = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404, rid: 404 });
        const second = newTabTestCard({ spelling: '次回', reading: 'じかい', source: 'anki', reviewSource: 'anki', ankiCardId: 405, rid: 405 });
        const listNewTabCards = vi.fn(async (): Promise<JPDBCard[]> => [second]);
        listNewTabCards.mockResolvedValueOnce([first]);
        const answerCard = vi.fn(async () => {});
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'anki',
                newTabAnkiEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
                newTabParsingEnabled: false,
                newTabFrontSentenceEnabled: false,
            }),
            anki: { listNewTabCards, answerCard } as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { cacheCards: vi.fn() } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        await controller.renderPage();
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab')!;
        const internals = controller as unknown as {
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            visibleWords: JPDBCard[];
            index: number;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            gradeCurrentCard(grade: 'pass'): Promise<void>;
        };
        internals.state.revealAnswer = true;
        internals.renderWord(root, first);

        await internals.gradeCurrentCard('pass');

        expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        await waitForExpect(() => {
            expect(listNewTabCards).toHaveBeenCalledTimes(2);
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('次回');
        });
    });

    it('does not let stale in-flight Anki source responses repopulate the cache after grading', async () => {
        const stale = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404, rid: 404 });
        const fresh = newTabTestCard({ spelling: '次回', reading: 'じかい', source: 'anki', reviewSource: 'anki', ankiCardId: 405, rid: 405 });
        const staleLoad = deferred<JPDBCard[]>();
        const listNewTabCards = vi.fn(async (): Promise<JPDBCard[]> => staleLoad.promise);
        listNewTabCards.mockImplementationOnce(() => staleLoad.promise).mockResolvedValueOnce([fresh]);
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true }),
            anki: { listNewTabCards, answerCard: vi.fn() } as never,
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
        const internals = controller as unknown as {
            loadWordsFromSource(source: 'anki'): Promise<{ cards: JPDBCard[] }>;
            invalidateReviewSourceCache(card: JPDBCard): void;
        };

        const oldLoad = internals.loadWordsFromSource('anki');
        internals.invalidateReviewSourceCache(stale);
        staleLoad.resolve([stale]);

        await expect(oldLoad).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '復習' })],
        });
        await expect(internals.loadWordsFromSource('anki')).resolves.toMatchObject({
            cards: [expect.objectContaining({ spelling: '次回' })],
        });

        expect(listNewTabCards).toHaveBeenCalledTimes(2);
    });

    it('reloads fresh queues after the last graded card without using stale offline cache', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS }));
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
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
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
        expect(reload).toHaveBeenCalledWith(root, true, {
            useOfflineCache: false,
            quiet: true,
            excludeCardKeys: [cardKey(graded)],
            preserveVisibleOrder: true,
        });
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
        const root = renderEnabledNewTabRoot(controller);
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
            const root = renderEnabledNewTabRoot(controller);
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
            const root = renderEnabledNewTabRoot(controller);
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, newTabKanjiAutogradeEnabled: false }, {
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
        });
        try {
            const root = renderEnabledNewTabRoot(controller);
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

    it('renders Anki review cards from their original rendered front and back', () => {
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiAudioFilenames: ['nihongo-front.mp3'],
            ankiRenderedCards: [
                {
                    cardId: 404,
                    deckName: 'Core',
                    question: '<div class="front" style="font: italic 700 96px/1.2 serif">日本語 [anki:play:q:0]</div>',
                    answer: '<div class="back">Japanese language</div><script>window.bad = true</script>',
                },
                {
                    cardId: 405,
                    deckName: 'Core',
                    question: '<div>Reverse card should stay hidden</div>',
                    answer: '<div>日本語</div>',
                },
            ],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false });
        const root = renderNewTabWordFront(controller, card);

        try {
            const front = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
            expect(front.classList.contains('jpdb-reader-newtab-prompt-anki-card')).toBe(true);
            expect(front.querySelector<HTMLElement>('.jpdb-reader-anki-rendered-card')?.dataset.ankiRenderedCardId).toBe('404');
            expect(front.textContent).toContain('日本語');
            expect(front.textContent).not.toContain('Card audio');
            expect(front.textContent).not.toContain('Japanese language');
            expect(front.textContent).not.toContain('Reverse card should stay hidden');
            expect(front.querySelector<HTMLElement>('.front')?.getAttribute('style') ?? '')
                .toMatch(/font:\s*italic\s+700\s+52px\/1\.2\s+serif/i);
            expect(front.innerHTML).not.toContain('96px');
            const audio = front.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]');
            expect(audio?.dataset.ankiMediaName).toBe('nihongo-front.mp3');
            expect(audio?.classList.contains('jpdb-reader-audio-control')).toBe(true);
            expect(audio?.classList.contains('jpdb-reader-anki-primary-sound')).toBe(true);
            expect(audio?.classList.contains('jpdb-reader-icon-btn')).toBe(true);
            expect(audio?.classList.contains('jpdb-reader-icon-mini')).toBe(false);
            expect(audio?.parentElement).toBe(front);
            expect(front.firstElementChild).toBe(audio);
            expect(audio?.getAttribute('aria-label')).toBe('Anki audio nihongo-front.mp3');
            expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');

            (controller as unknown as { state: { revealAnswer: boolean } }).state.revealAnswer = true;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            const revealed = root.querySelector<HTMLElement>('[data-newtab-prompt]')!;
            expect(revealed.querySelectorAll('.jpdb-reader-anki-rendered-side-body')).toHaveLength(2);
            expect(revealed.textContent).toContain('日本語');
            expect(revealed.textContent).toContain('Japanese language');
            expect(revealed.textContent).not.toContain('Reverse card should stay hidden');
            expect(revealed.querySelector('script')).toBeNull();
            expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toBe('');
        } finally {
            root.remove();
        }
    });

    it('routes Anki rendered-card [sound:] audio controls through the newtab card action handler', () => {
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            sentence: '日本語を読みます。',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [{
                cardId: 404,
                deckName: 'Core',
                question: '<div>日本語 [sound:rendered-front.mp3]</div>',
                answer: '<div>Japanese language</div>',
            }],
        });
        const performCardAction = vi.fn();
        const playWordAudio = vi.fn();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            performCardAction,
            playWordAudio,
        });
        const root = renderNewTabWordFront(controller, card);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
            const audio = root.querySelector<HTMLButtonElement>('[data-action="anki-media-audio"]')!;
            const clickTarget = audio.querySelector('svg') ?? audio;
            const clickWasNotCanceled = clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(clickWasNotCanceled).toBe(false);
            expect(audio.dataset.ankiMediaName).toBe('rendered-front.mp3');
            expect(audio.classList.contains('jpdb-reader-icon-btn')).toBe(true);
            expect(audio.classList.contains('jpdb-reader-icon-mini')).toBe(false);
            expect(performCardAction).toHaveBeenCalledOnce();
            expect(performCardAction).toHaveBeenCalledWith(audio, card, card.sentence, audio);
            expect(playWordAudio).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
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
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
            sentenceNode!.innerHTML = 'お母ちゃん<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="-1" data-sid="-1" data-sentence="お母ちゃん中学生？" tabindex="-1">中学生</span>？';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, { parseContent });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
            sentenceNode!.innerHTML = 'お連れ様との<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-vid="1198880" data-sid="0" data-pitch-class="heiban" data-sentence="お連れ様との会話が 日本語でしたので" data-expression="会話" data-reading="かいわ" tabindex="-1">会話</span>が 日本語でしたので';
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
            sentenceNode!.innerHTML = '(<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="-1" data-expression="メイ" data-reading="メイ">メイ</span>)の!? (メイ) <span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="1291770" data-sid="0" data-pitch-class="unknown" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="-1" data-expression="座" data-reading="ざ">座</span>って食べなさい。';
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
            sentenceNode!.innerHTML = '(<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="-1" data-expression="メイ" data-reading="メイ">メイ</span>)の!?';
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
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
            expect(parse).toHaveBeenCalledWith(['一番を見た。'], { includeLocalPitch: false, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
            expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: false, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
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
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
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
                expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: false, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            lookupText,
        });
        const root = renderEnabledNewTabRoot(controller);
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

    it('dismisses active new-tab lookups from outside page taps without interrupting nested lookups', () => {
        const lookupText = vi.fn();
        const dismissLookup = vi.fn();
        const card = newTabTestCard({ vid: 10, sid: 10, spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            lookupText,
            dismissLookup,
        });
        const root = renderNewTabWordFront(controller, card);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(lookupText).toHaveBeenCalledWith('月光', 'げっこう', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
            }));
            expect(dismissLookup).not.toHaveBeenCalled();

            root.querySelector<HTMLElement>('[data-newtab-action="reveal"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(dismissLookup).toHaveBeenCalledTimes(1);
        } finally {
            root.remove();
        }
    });

    it('opens Anki review prompt lookups with the source card identity intact', () => {
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const card = newTabTestCard({
            vid: -9900,
            sid: 0,
            rid: 38800,
            spelling: '難波',
            reading: 'なにわ',
            sentence: '難波を見る。',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 38800,
            ankiNoteId: 9900,
            ankiDeckNames: ['Mining'],
            ankiModelName: 'Imported',
            cardState: ['due'],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            lookupText,
            showLookupCard,
        });
        const root = renderEnabledNewTabRoot(controller);
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Anki',
            state: { mode: 'word', sort: 'frequency', filter: 'study', source: 'anki', revealAnswer: false },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);
        (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

        root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '難波を見る。', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).not.toHaveBeenCalled();
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
        const root = renderPerformedNewTabSearch(controller, '読む', 'dictionary');

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
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
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
                    <span class="jpdb-reader-word" data-expression="猫舌" data-reading="ねこじた" data-sentence="猫舌だ。" tabindex="-1">猫舌</span>
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
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
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
        Object.assign(controller as unknown as { allWords: JPDBCard[] }, {
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
        const root = renderPerformedNewTabSearch(controller, 'cat');

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
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
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
        const root = renderPerformedNewTabSearch(controller, 'mum');

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
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            loadCardRenderData,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, 'mum');

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
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '支');

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
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '自動販売機');

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
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
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
        const root = renderPerformedNewTabSearch(controller, 'neko');
        try {
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

    it('keeps handwriting candidates open and clears doodles in search mode', () => {
        const { root, searchApi } = createDictionarySearchModeFixture();

        try {
            const handwriting = root.querySelector<HTMLDetailsElement>('[data-newtab-handwriting]')!;
            const drawToggle = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-handwriting-toggle"]')!;
            expect(handwriting.open).toBe(false);
            expect(drawToggle.getAttribute('aria-expanded')).toBe('false');
            drawToggle.click();
            expect(handwriting.open).toBe(true);
            expect(drawToggle.getAttribute('aria-expanded')).toBe('true');
            expect(handwriting.querySelector('[data-doodle-clear]')).toBeNull();

            let doodleClearCount = 0;
            handwriting.addEventListener(KANJI_DOODLE_CLEAR_EVENT, () => { doodleClearCount += 1; });
            searchApi.renderSearchHandwritingCandidates(root, ['日'], '');
            root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();
            expect(doodleClearCount).toBe(1);
            expect(newTabSearchInput(root).value).toBe('日');
            expect(handwriting.open).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]')?.hidden).toBe(true);

            searchApi.renderSearchHandwritingCandidates(root, ['本'], '');
            root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();
            expect(doodleClearCount).toBe(2);
            expect(newTabSearchInput(root).value).toBe('日本');
            expect(handwriting.open).toBe(true);

            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-clear"]')?.click();
            expect(doodleClearCount).toBe(3);
            expect(root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]')?.hidden).toBe(true);
            drawToggle.click();
            expect(handwriting.open).toBe(false);
        } finally {
            root.remove();
        }
    });

    it('searches English glossary text and enabled lookup links in search mode', async () => {
        const { settings, searchTerms, root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'cat');

            await waitForExpect(() => {
                expect(newTabSearchResultsText(root)).toContain('猫');
                expect(newTabSearchAutocompleteText(root)).toContain('猫');
            });
            const input = newTabSearchInput(root);
            const suggestion = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-suggestion"]')!;
            expect(input.getAttribute('aria-activedescendant')).toBeNull();
            expect(suggestion.dataset.active).toBeUndefined();
            expect(newTabSearchResultsText(root)).toContain('Takoboto');
            expect(newTabSearchResultsText(root)).toContain('Copy');
            expect(newTabSearchResultsText(root)).not.toContain('JPDB');
            expect(newTabSearchResultsText(root)).not.toContain('Jisho');
            expect(root.querySelector<HTMLAnchorElement>('.jpdb-reader-newtab-search-links a')?.href).toContain('takoboto.jp/?q=cat');

            const submitEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            input.dispatchEvent(submitEnterEvent);
            expect(submitEnterEvent.defaultPrevented).toBe(false);
            expect(input.value).toBe('cat');

            const arrowEvent = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
            input.dispatchEvent(arrowEvent);
            expect(arrowEvent.defaultPrevented).toBe(true);
            expect(input.getAttribute('aria-activedescendant')).toBe(suggestion.id);
            expect(suggestion.dataset.active).toBe('true');

            const suggestionEnterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
            input.dispatchEvent(suggestionEnterEvent);
            expect(suggestionEnterEvent.defaultPrevented).toBe(true);
            expect(input.value).toBe('猫');
            expect(searchTerms).toHaveBeenCalledWith('cat', expect.any(Number), settings.dictionaryPreferences, expect.any(Object));

            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            expect(input.value).toBe('');
            expect(root.querySelector<HTMLElement>('[data-newtab-controls]')?.hidden).toBe(true);
        } finally {
            root.remove();
        }
    });

    it('searches kana prefixes in search mode autocomplete', async () => {
        const { settings, searchTerms, root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'おもし');
            await waitForExpect(() => {
                expect(newTabSearchAutocompleteText(root)).toContain('面白い');
            });
            expect(searchTerms).toHaveBeenCalledWith('おもし', expect.any(Number), settings.dictionaryPreferences, expect.any(Object));
        } finally {
            root.remove();
        }
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
            const root = renderEnabledNewTabRoot(controller);
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

            expect(parse).toHaveBeenLastCalledWith(['大切です。'], { jpdbTimeoutMs: 15_000, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true });

            parse.mockClear();
            const popover = document.createElement('div');
            popover.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
            document.body.append(popover);

            await internals.parseNewTabContent(popover);

            expect(parse).toHaveBeenCalledWith(['日本語です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps hosted popover sentence parsing clickable when a stale JPDB key is present', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async () => [[]]);
        const popover = document.createElement('div');
        popover.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
        document.body.append(popover);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: 'stale-jpdb-key', localDictionariesEnabled: false };
        internals.parser = { canParse: () => true, parse };

        try {
            await internals.parseNewTabContent(popover);

            expect(parse).toHaveBeenCalledWith(['日本語です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('applies cached Anki status colouring to hosted parsed new-tab content', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ vid: 1234, sid: 5, spelling: '日本語', reading: 'にほんご' });
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[newTabSentenceToken(card, '日本語です。')]]);
        const findCachedStatusBatch = vi.fn(async (): Promise<AnkiLookupResult[]> => [{
            state: 'known',
            notes: [],
            primary: {
                noteId: 1404,
                modelName: 'Yomu',
                deckNames: ['Core'],
                cardIds: [404],
                primaryCardId: 404,
                state: 'known',
                fields: {},
                tags: [],
                reps: 8,
                lapses: 1,
            },
            trusted: true,
        }]);
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">日本語です。</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse };
            anki: { findCachedStatusBatch: typeof findCachedStatusBatch };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            showPitchAccent: false,
        };
        internals.parser = { canParse: () => true, parse };
        internals.anki = { findCachedStatusBatch };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-word')!;
                expect(word.classList.contains('anki-known')).toBe(true);
                expect(word.dataset.ankiState).toBe('known');
                expect(word.dataset.ankiDecks).toBe('Core');
                expect(word.title).toContain('Anki: Known');
            });
            expect(findCachedStatusBatch).toHaveBeenCalledWith([card]);
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
            activeLookupPopover?: HTMLElement;
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
                    dismissLookup(): void;
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

            const popover = document.createElement('div');
            popover.className = 'jpdb-reader-popover';
            document.body.append(popover);
            internals.activeLookupPopover = popover;

            controller.dependencies.dismissLookup();

            expect(popover.isConnected).toBe(false);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
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
            expect(parse).toHaveBeenCalledWith(['大切です。'], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: false, includeLocalPitch: false, allowSegmentedFallback: true });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('segments hosted new-tab Japanese content without a JPDB API key', async () => {
        const runtime = new NewTabRuntime();
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">青空を見ます。</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jpdbDefinitionsEnabled: false,
            localDictionariesEnabled: false,
            showPitchAccent: false,
        };

        try {
            await internals.parseNewTabContent(root);

            expect([...root.querySelectorAll<HTMLElement>('.jpdb-reader-word')].map(word => word.textContent)).toEqual(['青空', 'を', '見ます']);
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
                const toast = document.querySelector<HTMLElement>('.jpdb-reader-toast');
                expect(toast?.textContent).toBe('Copied word.');
                expect(toast?.getAttribute('role')).toBe('status');
                expect(toast?.getAttribute('aria-live')).toBe('polite');
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
                <span class="jpdb-reader-word" data-vid="11" data-sid="12" tabindex="-1">国家</span>
            </a>
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word" data-vid="${related.vid}" data-sid="${related.sid}" data-sentence="甘言蜜語だ。" tabindex="-1">甘言蜜語</span>
            </div>
            <div class="jpdb-reader-example-sentence">
                <span class="jpdb-reader-word" data-vid="991" data-sid="992" data-sentence="未登録語だ。" tabindex="-1">未登録語</span>
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
        const { settings, settingsForm, settingsBackdrop, anchor, internals } = createStackedNewTabSettingsFixture(runtime);

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountLookupPopover(lookup, anchor, { stackOverSettings: true });

            expectStackedLookupOverSettings({
                lookup,
                settingsForm,
                settingsBackdrop,
                activeLookup: internals.activeLookupPopover,
                activeBackdrop: internals.activeLookupBackdrop,
            });

            internals.dismissLookupPopover();

            expect(lookup.isConnected).toBe(false);
            expectSettingsDialogStillMounted({
                settingsForm,
                settingsBackdrop,
                activeDialog: internals.activeDialog,
                activeBackdrop: internals.activeBackdrop,
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('closes a stacked hosted new-tab lookup when tapping outside the popover', async () => {
        const runtime = new NewTabRuntime();
        const { settings, settingsForm, settingsBackdrop, anchor, internals } = createStackedNewTabSettingsFixture(runtime);

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountLookupPopover(lookup, anchor, { stackOverSettings: true });
            internals.installLookupPopoverHandlers(lookup, newTabTestCard({ spelling: '設定', reading: 'せってい' }), undefined, anchor);
            await new Promise(resolve => window.setTimeout(resolve, 0));

            settingsForm.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(internals.activeLookupPopover).toBeUndefined();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('closes a stacked hosted new-tab lookup from a plain outside click', async () => {
        const runtime = new NewTabRuntime();
        const { settings, settingsForm, settingsBackdrop, anchor, internals } = createStackedNewTabSettingsFixture(runtime);

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
            internals.mountLookupPopover(lookup, anchor, { stackOverSettings: true });
            internals.installLookupPopoverHandlers(lookup, newTabTestCard({ spelling: '設定', reading: 'せってい' }), undefined, anchor);
            await new Promise(resolve => window.setTimeout(resolve, 0));

            settingsForm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(lookup.isConnected).toBe(false);
            expect(settingsForm.isConnected).toBe(true);
            expect(settingsBackdrop.isConnected).toBe(true);
            expect(internals.activeLookupPopover).toBeUndefined();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps hosted new-tab lookup controls interactive while outside dismissal is armed', async () => {
        const runtime = new NewTabRuntime();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const };
        const anchor = document.createElement('span');
        anchor.textContent = '設定';
        document.body.append(anchor);
        const showKanjiLookupCard = vi.fn(async () => undefined);
        const internals = runtime as unknown as {
            settings: typeof settings;
            activeLookupPopover?: HTMLElement;
            showKanjiLookupCard: typeof showKanjiLookupCard;
            mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement): void;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.settings = settings;
        internals.showKanjiLookupCard = showKanjiLookupCard;

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = `
                <div class="jpdb-reader-popover-body">
                    <button type="button" data-action="kanji" data-kanji="設">設</button>
                </div>
            `;
            const card = newTabTestCard({ spelling: '設定', reading: 'せってい' });
            internals.mountLookupPopover(lookup, anchor);
            internals.installLookupPopoverHandlers(lookup, card, '設定する。', anchor);
            await new Promise(resolve => window.setTimeout(resolve, 0));

            const button = lookup.querySelector<HTMLButtonElement>('[data-action="kanji"]')!;
            button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
            button.click();

            expect(lookup.isConnected).toBe(true);
            expect(internals.activeLookupPopover).toBe(lookup);
            expect(showKanjiLookupCard).toHaveBeenCalledWith(card, '設', '設定する。', button, expect.objectContaining({
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
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: true,
                audioAutoPlayMode: 'tap',
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            audioActions: { playTermAudio: typeof playTermAudio };
        };

        try {
            internals.audioActions = { playTermAudio };

            await internals.showLookupCard(card, '月光を見る。');

            expect(playTermAudio).toHaveBeenCalledTimes(1);
            expect(playTermAudio).toHaveBeenCalledWith(card);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('shows the reading plus JPDB and Anki statuses in new-tab lookup header order', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: 'よむ',
            reading: 'よむ',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['redundant'],
            frequencyRank: 20200,
        });
        const ankiLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 88,
                primaryCardId: 8801,
                cardIds: [8801],
                state: 'known',
                deckNames: ['Mining'],
                modelName: 'Yomu',
                fields: {},
                tags: [],
                reps: 12,
                lapses: 0,
            },
        };
        const renderData = newTabLookupRenderData({ ankiLookup });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: 'jpdb-key',
                ankiEnabled: true,
                jpdbMiningEnabled: true,
            },
        });

        try {
            await internals.showLookupCard(card, 'よむ。');

            await vi.waitFor(() => {
                const labels = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent);
                expect(labels).toEqual(['#20200', 'JPDB Redundant', 'Anki Known']);
            });
            expect(document.querySelector<HTMLElement>('[data-newtab-lookup-reading]')?.textContent).toBe('よむ');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('labels new-tab lookup grade buttons with the active review target', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: { state: 'due', notes: [], primary: null } satisfies AnkiLookupResult,
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                lookupGradeTargetLabel(card: JPDBCard): string;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [{ id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 }],
                lookupGradeTargetLabel: () => 'Grades Anki card: Core #404',
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '復習します。');

            await vi.waitFor(() => {
                const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]');
                expect(document.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core #404');
                expect(document.querySelector('[data-newtab-grade-target-chip]')?.textContent).toBe('Anki #404');
                expect(pass?.dataset.newtabReviewTarget).toBe('anki');
                expect(pass?.dataset.ankiCardId).toBe('404');
                expect(pass?.getAttribute('aria-label')).toBe('Pass: Grades Anki card: Core #404');
                expect(pass?.title).toBe('Grades Anki card: Core #404');
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders separate lookup grade targets for JPDB and multiple Anki cards', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
            ],
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: { state: 'due', notes: [], primary: null } satisfies AnkiLookupResult,
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                lookupGradeTargetLabel(card: JPDBCard): string;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [
                    { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
                    { id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 },
                    { id: 'anki:405', kind: 'anki', label: 'Grades Anki card: Core #405', shortLabel: 'Core #405', ankiCardId: 405 },
                ],
                lookupGradeTargetLabel: () => 'Grades JPDB + Anki card: Core #404',
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '日本語を読みます。');

            await vi.waitFor(() => {
                expect(Array.from(document.querySelectorAll('[data-newtab-grade-target-text]'), element => element.textContent)).toEqual([
                    'Grades JPDB',
                    'Grades Anki card: Core #404',
                    'Grades Anki card: Core #405',
                ]);
                expect(Array.from(document.querySelectorAll('[data-newtab-grade-target-chip]'), element => element.textContent)).toEqual([
                    'JPDB',
                    'Anki #404',
                    'Core #405',
                ]);
            });

            const ankiPassButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-newtab-review-target="anki"][data-grade="pass"]'));
            expect(ankiPassButtons.map(button => button.dataset.ankiCardId)).toEqual(['404', '405']);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('submits a lookup-selected Anki target without grading the merged JPDB card', async () => {
        const card = newTabTestCard({
            vid: 250,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
            ],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const refreshedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [{
                noteId: 777,
                modelName: 'Core',
                deckNames: ['Core'],
                cardIds: [404, 405],
                primaryCardId: 405,
                state: 'known',
                fields: { Expression: '日本語', Meaning: 'Japanese language' },
                renderedCards: [{ cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' }],
                tags: [],
                reps: 3,
                lapses: 0,
            }],
            primary: null,
        };
        refreshedLookup.primary = refreshedLookup.notes[0] ?? null;
        const findExistingCards = vi.fn(async () => refreshedLookup);
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
            findExistingCards,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: true });
            expect(answerCard).toHaveBeenCalledWith(405, 'okay');
            expect(findExistingCards).toHaveBeenCalledWith(card);
            expect(reviewCard).not.toHaveBeenCalled();
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('✓ Core #405 · Known');
            expect(card.cardState).toEqual(['known']);
            expect(card.ankiCardId).toBe(405);
            expect(card.ankiNoteId).toBe(777);
            expect(card.ankiReps).toBe(3);
            expect(card.ankiRenderedCards).toEqual([{ cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' }]);
        } finally {
            root.remove();
        }
    });

    it('keeps the explicitly graded duplicate Anki card after refreshed details choose another primary', async () => {
        const card = newTabTestCard({
            vid: 250,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Reverse', question: 'Japanese', answer: '日本語' },
            ],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const refreshedLookup: AnkiLookupResult = {
            state: 'due',
            notes: [
                {
                    noteId: 777,
                    modelName: 'Core',
                    deckNames: ['Core'],
                    cardIds: [404],
                    primaryCardId: 404,
                    state: 'due',
                    fields: { Expression: '日本語', Meaning: 'Japanese language' },
                    renderedCards: [{ cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' }],
                    tags: [],
                    reps: 3,
                    lapses: 0,
                },
                {
                    noteId: 888,
                    modelName: 'Reverse',
                    deckNames: ['Reverse'],
                    cardIds: [405],
                    primaryCardId: 405,
                    state: 'known',
                    fields: { Expression: '日本語', Meaning: 'Japanese language', Audio: '[sound:reverse-front.mp3]' },
                    renderedCards: [{
                        cardId: 405,
                        deckName: 'Reverse',
                        question: '<img src="front.png" alt="">Japanese [anki:play:q:0]',
                        answer: '日本語',
                        mediaDataUrls: { 'front.png': 'data:image/png;base64,front-data' },
                    }],
                    tags: [],
                    reps: 9,
                    lapses: 1,
                },
            ],
            primary: null,
        };
        refreshedLookup.primary = refreshedLookup.notes[0] ?? null;
        const findExistingCards = vi.fn(async () => refreshedLookup);
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
            findExistingCards,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: true });
            expect(answerCard).toHaveBeenCalledWith(405, 'okay');
            expect(reviewCard).not.toHaveBeenCalled();
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('✓ Reverse #405 · Known');
            expect(card.cardState).toEqual(['known']);
            expect(card.ankiCardId).toBe(405);
            expect(card.ankiNoteId).toBe(888);
            expect(card.ankiDeckNames).toEqual(['Reverse']);
            expect(card.ankiReps).toBe(9);
            expect(card.ankiLapses).toBe(1);
            expect(card.ankiRenderedCards?.map(rendered => rendered.cardId)).toEqual([405]);
            expect((card.ankiRenderedCards?.[0] as { mediaDataUrls?: Record<string, string> } | undefined)?.mediaDataUrls)
                .toEqual({ 'front.png': 'data:image/png;base64,front-data' });
            expect(card.ankiAudioFilenames).toEqual(['reverse-front.mp3']);
        } finally {
            root.remove();
        }
    });

    it('rejects a lookup-selected Anki target that is not one of the rendered review targets', async () => {
        const card = newTabTestCard({
            vid: 251,
            sid: 1,
            rid: 2,
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            ankiCardId: 404,
            ankiDeckNames: ['Core'],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: true });
            expect(answerCard).not.toHaveBeenCalled();
            expect(reviewCard).not.toHaveBeenCalled();
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Could not submit grade.');
            });
        } finally {
            root.remove();
        }
    });

    it('shows new-tab word detail JPDB status only when a JPDB API key exists', () => {
        let apiKey = '';
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey,
                ankiEnabled: true,
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
            lookupText: vi.fn(),
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const detail = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: {
                state: 'due',
                notes: [],
                primary: {
                    noteId: 55,
                    primaryCardId: 5501,
                    cardIds: [5501],
                    state: 'due',
                    deckNames: ['Mining'],
                    modelName: 'Yomu',
                    fields: {},
                    tags: [],
                    reps: 2,
                    lapses: 0,
                },
            } satisfies AnkiLookupResult,
            jpdbVocabularyInfo: null,
        };
        const card = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jpdb',
            cardState: ['not-in-deck'],
            frequencyRank: 250,
        });
        const metaItems = () => (controller as unknown as {
            searchWordMetaItems(card: JPDBCard, state: 'not-in-deck', detail: unknown): string[];
        }).searchWordMetaItems(card, 'not-in-deck', detail).map(item => {
            const element = document.createElement('div');
            element.innerHTML = item;
            return element.textContent ?? '';
        });

        expect(metaItems()).toEqual(['にほんご', '#250', 'Anki Due']);

        apiKey = 'jpdb-key';
        expect(metaItems()).toEqual(['にほんご', '#250', 'JPDB Not in deck', 'Anki Due']);
    });

    it('does not show Add to Anki while a new-tab lookup Anki miss is untrusted', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '未確認',
            reading: 'みかくにん',
            source: 'jpdb',
            cardState: ['not-in-deck'],
        });
        const untrustedLookup: AnkiLookupResult = {
            state: 'not-in-deck',
            notes: [],
            primary: null,
            trusted: false,
        };
        const renderData = newTabLookupRenderData({ ankiLookup: untrustedLookup });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: { ankiEnabled: true },
        });

        try {
            await internals.showLookupCard(card, '未確認。');

            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-popover')).not.toBeNull());
            expect(document.querySelector('[data-action="anki"]')).toBeNull();
            expect(Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent)).not.toContain('Checking Anki...');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides new-tab lookup JPDB status without a JPDB API key even for JPDB review cards', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
            frequencyRank: 640,
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: { state: 'due', notes: [], primary: null } satisfies AnkiLookupResult,
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: '',
                ankiEnabled: true,
                ankiSectionEnabled: true,
            },
        });

        try {
            await internals.showLookupCard(card, '復習します。');

            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-popover')).not.toBeNull());
            const labels = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent);
            expect(labels).toEqual(['#640', 'Anki Due']);
            expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.jpdb-due')).toBeNull();
            expect(document.querySelector('.jpdb-reader-meta .jpdb-reader-state-dot.anki-due')).not.toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders fast Anki status in new-tab lookup popovers before detailed hydration finishes', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '動画',
            reading: 'どうが',
            source: 'jpdb',
            cardState: ['not-in-deck'],
        });
        const fastStatus = deferred<AnkiLookupResult>();
        const all = deferred<{
            localEntries: [];
            kanjiEntries: [];
            metaEntries: [];
            ankiLookup: AnkiLookupResult;
            jpdbDecks: [];
            ankiDecks: [];
            jpdbVocabularyInfo: null;
        }>();
        const cachedLookup: AnkiLookupResult = {
            state: 'known',
            notes: [],
            primary: {
                noteId: 55,
                primaryCardId: 7701,
                cardIds: [7701],
                state: 'known',
                deckNames: ['Anime::Mining'],
                modelName: 'Imported Core',
                fields: {},
                tags: [],
                reps: 14,
                lapses: 1,
            },
        };
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            cardRenderData: {
                load(): {
                    localEntries: Promise<[]>;
                    localMetaEntries: Promise<[]>;
                    ankiLookup: Promise<AnkiLookupResult>;
                    hydrateAnkiLookup: () => Promise<AnkiLookupResult>;
                    all: typeof all.promise;
                };
            };
            parser: { canParse(): boolean; isJpdbBackedCard(card: JPDBCard): boolean };
            showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
        };

        try {
            internals.settings = {
                ...DEFAULT_SETTINGS,
                ankiEnabled: true,
                jpdbMiningEnabled: true,
                popupMode: 'popover',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
            };
            internals.cardRenderData = {
                load: () => ({
                    localEntries: Promise.resolve([]),
                    localMetaEntries: Promise.resolve([]),
                    ankiLookup: fastStatus.promise,
                    hydrateAnkiLookup: () => Promise.resolve(cachedLookup),
                    all: all.promise,
                }),
            };
            internals.parser = {
                canParse: () => false,
                isJpdbBackedCard: () => true,
            };

            await internals.showLookupCard(card, '動画を見る。');

            fastStatus.resolve(cachedLookup);
            await vi.waitFor(() => expect(document.querySelector('.jpdb-reader-meta')?.textContent).toContain('Anki Known'));

            expect(document.querySelector('[data-action="anki"]')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps the user gesture attached to hosted new-tab dictionary autoplay', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '月光', reading: 'げっこう', sentence: '月光を見る。' });
        const playTermAudio = vi.fn(async () => undefined);
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: true,
                audioAutoPlayMode: 'tap',
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            audioActions: { playTermAudio: typeof playTermAudio };
            showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { userGesture?: boolean }): Promise<void>;
        };

        try {
            internals.audioActions = { playTermAudio };

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
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: false,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            audio: { preload: typeof preload };
            showLookupCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: { autoPlay?: boolean }): Promise<void>;
        };

        try {
            internals.audio = { preload };

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
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/second.jpg'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);

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
        const { controller, root } = newTabVisibleWordFixture(
            () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            {
                card,
                index: 0,
                sourceLabel: 'JPDB',
                source: 'jpdb',
                revealAnswer: true,
                controllerOverrides: {
                    immersionKit: {
                        search,
                        mediaUrls: vi.fn(() => []),
                    } as never,
                    jpdbVocabulary: { lookup },
                },
            },
        );

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
        const root = renderSeededNewTabRoot(controller, {
            allWords: [read, write, walk],
            visibleWords: [read, write, walk],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false, ankiEnabled: false }, {
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
        const root = renderSeededNewTabRoot(controller, {
            allWords: [card],
            visibleWords: [card],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false, ankiEnabled: false }, {
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
        const root = renderSeededNewTabRoot(controller, {
            allWords: [first, second],
            visibleWords: [first, second],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
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
        const example = newTabAudioImmersionExample('ik-1');
        const played = stubNewTabAudioPlayback();
        const search = vi.fn(async () => [example]);
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn((_example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/line.mp3'] : []),
                fetchBlobUrl,
            } as never,
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
            bindRootEvents: true,
        });

        try {
            root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]')?.click();

            await waitForExpect(() => expect(played).toEqual(['blob:http://localhost/line.mp3']));
            expect(search).toHaveBeenCalledWith(
                '発音',
                expect.objectContaining({ immersionKitAutoPlayAudio: true }),
                expect.objectContaining({ requestLimit: 48, resultLimit: 6 }),
            );
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/line.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
        } finally {
            root.remove();
        }
    });

    it('does not append or autoplay delayed Immersion Kit reveal content after hiding the card', async () => {
        const card = newTabTestCard({ spelling: '発音', reading: 'はつおん' });
        const example = newTabAudioImmersionExample('ik-delayed');
        let resolveSearch!: (examples: ImmersionKitExample[]) => void;
        const search = vi.fn(() => new Promise<ImmersionKitExample[]>(resolve => {
            resolveSearch = resolve;
        }));
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const played = stubNewTabAudioPlayback();

        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn((_example: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/line.mp3'] : []),
                fetchBlobUrl,
            } as never,
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
            appendToDocument: true,
            bindRootEvents: true,
        });

        try {
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
            sentence!.innerHTML = 'お母ちゃん<span class="jpdb-reader-word" data-vid="88" data-sid="44" data-sentence="お母ちゃん中学生？" tabindex="-1">中学生</span>？';
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
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
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

    it('does not recheck an empty dictionary source on a later new-tab render', async () => {
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
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('Looking for more words...');
        document.body.replaceChildren();
    });

    it('loads dictionary cards after dictionary settings change', async () => {
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
                ...newTabTermDictionarySummary('Tiny Alias'),
            }
            : {
                ...newTabEmptyDictionarySummary(),
            });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
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
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('Looking for more words...');

        settings.dictionaryPreferences = [{ name: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' }];
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        document.body.replaceChildren();
    });

    it('can force-retry dictionary source when dictionaries appear outside settings', async () => {
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
                ...newTabEmptyDictionarySummary(),
            })
            .mockResolvedValueOnce({
                ...newTabTermDictionarySummary(),
            });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
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
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('Looking for more words...');

        await controller.refreshExternalData();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(invalidateCaches).toHaveBeenCalledTimes(1);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        document.body.replaceChildren();
    });

    it('falls back to dictionary cards when auto has no JPDB or Anki services', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
        }), localCard, listRandomTopTerms, {
            anki: {
                listNewTabCards: vi.fn(async () => {
                    throw new Error('Anki should not be queried when new-tab Anki is off.');
                }),
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
        expect(result.sourceLabel).toBe('Dictionary');
        expect(result.reviewCountMode).toBe(false);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
    });

    it('falls back to dictionary cards when auto Anki is unreachable and JPDB is unconfigured', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
        const listNewTabCards = vi.fn(async () => {
            throw new Error('AnkiConnect is not reachable.');
        });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: {
                listNewTabCards,
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('書く');
            expect(document.querySelector<HTMLElement>('[data-newtab-status]')?.dataset.sourceToggleTarget).toBeUndefined();
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('falls back to dictionary cards when auto Anki is offered but unavailable before setup', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '初め', reading: 'はじめ', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['初め', 'はじめ', 'beginning']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms);

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('初め');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to dictionary study cards when configured JPDB and Anki review queues are empty', async () => {
        resetNewTabReviewStorage();
        const knownJpdbCard = newTabTestCard({ spelling: '既知', reading: 'きち', source: 'jpdb', cardState: ['known'] });
        const localCard = newTabTestCard({ spelling: '余白', reading: 'よはく', source: 'local' });
        const listDeckCards = vi.fn(async () => [knownJpdbCard]);
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['余白', 'よはく', 'blank space']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'auto',
            newTabJpdbDeck: 'deck',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(listDeckCards).toHaveBeenCalledWith('deck', 180, { scheduledOnly: true });
            expect(listNewTabCards).toHaveBeenCalledWith(180);
            expect(result.cards.map(card => card.spelling)).toEqual(['余白']);
            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses public JPDB fallback when auto has no local dictionaries installed', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = newTabPublicFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
        }), publicSearch);

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['公開']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(publicSearch).toHaveBeenCalled();
    });

    it('uses built-in study words when auto has no local dictionaries and public JPDB is unavailable', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const publicSearch = vi.fn(async () => []);
        const fallbackCardFromText = vi.fn((text: string) => newTabTestCard({
            spelling: text,
            reading: '',
            source: 'fallback',
            reviewSource: 'dictionary',
        }));
        const controller = newTabPublicFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), publicSearch, {
            parser: { fallbackCardFromText } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(result.cards.length).toBeGreaterThan(0);
            expect(result.cards.every(card => card.source === 'fallback')).toBe(true);
            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.reviewCountMode).toBe(false);
            expect(fallbackCardFromText).toHaveBeenCalled();

            await controller.renderPage();
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('uses public JPDB fallback when auto local dictionaries are disabled', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = newTabPublicFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            localDictionariesEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
        }), publicSearch);

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(result.cards.map(card => card.spelling)).toEqual(['公開']);
        expect(result.sourceLabel).toBe('JPDB');
        expect(publicSearch).toHaveBeenCalled();

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('公開');
        expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        document.body.replaceChildren();
    });

    it('uses first-run local dictionary fallback when JPDB and Anki are unconfigured', async () => {
        document.body.replaceChildren();
        localStorage.removeItem('jpdb-reader-newtab-ui');
        localStorage.removeItem('jpdb-reader-newtab-card-cache');
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        const localCard = newTabTestCard({ spelling: '今日', reading: 'きょう', source: 'local' });
        const publicSearch = vi.fn(async () => []);
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

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.cards.map(card => card.spelling)).toEqual(['今日']);

            await controller.renderPage();
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toBe('今日');
            expect(document.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            document.body.replaceChildren();
            localStorage.removeItem('jpdb-reader-newtab-ui');
            localStorage.removeItem('jpdb-reader-newtab-card-cache');
            sessionStorage.removeItem('jpdb-reader-newtab-current-word');
        }
    });

    it('ignores stale persisted Anki source when settings are auto and Anki setup is unavailable', async () => {
        resetNewTabReviewStorage();
        localStorage.setItem(NEW_TAB_UI_KEY, JSON.stringify({
            mode: 'word',
            sort: 'random',
            filter: 'study',
            source: 'anki',
            revealAnswer: false,
        }));
        const localCard = newTabTestCard({ spelling: '地元', reading: 'じもと', source: 'local' });
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, vi.fn(async () => newTabLocalDictionaryEntries(['地元', 'じもと', 'local area'])));

        try {
            await controller.renderPage();

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('auto');
            await expectNewTabDictionaryCard('地元');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to study words when a stale explicit Anki source remains after Anki is turned off', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '安心', reading: 'あんしん', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['安心', 'あんしん', 'relief']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms);

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('安心');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('falls back to study words when explicit Anki is enabled but unreachable', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '飲み物', reading: 'のみもの', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['飲み物', 'のみもの', 'drink']));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: {
                listNewTabCards: vi.fn(async () => {
                    throw new Error('AnkiConnect needs the userscript request bridge on content pages.');
                }),
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('飲み物');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('starts auto JPDB and Anki review sources in parallel while preserving display order', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const jpdbCard = newTabTestCard({ spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
        const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const jpdbGate = deferred<void>();
        const events: string[] = [];
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'api-key',
                ankiEnabled: true,
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
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
                requestCurrent: vi.fn(),
            } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        Object.assign(controller as unknown as {
            loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
            loadAnkiWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean }>;
        }, {
            async loadJpdbWords() {
                events.push('jpdb-start');
                await jpdbGate.promise;
                events.push('jpdb-finish');
                return { cards: [jpdbCard], sourceLabel: 'JPDB', reviewCountMode: true };
            },
            async loadAnkiWords() {
                events.push('anki-start');
                return { cards: [ankiCard], sourceLabel: 'Anki', reviewCountMode: true };
            },
        });

        const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();
        await Promise.resolve();
        await Promise.resolve();
        expect(events).toEqual(['jpdb-start', 'anki-start']);

        jpdbGate.resolve();
        const result = await resultPromise;

        expect(events).toEqual(['jpdb-start', 'anki-start', 'jpdb-finish']);
        expect(result.cards.map(card => card.spelling)).toEqual(['日本語', '暗記']);
        expect(result.sourceLabel).toBe('JPDB + Anki');
    });

    it('keeps auto review empty when review sources stall', async () => {
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
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
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

            expect(result.cards).toEqual([]);
            expect(result.reviewCountMode).toBe(true);
            expect(listRandomTopTerms).not.toHaveBeenCalled();
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
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
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

    it('reloads the queue when external new-tab state changes review source', async () => {
        const jpdbCard = newTabTestCard({ spelling: '設定', reading: 'せってい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true, newTabSource: 'auto' }),
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
        document.body.append(root);
        const reload = vi.fn(async () => undefined);
        const applyWords = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            reviewCountMode: boolean;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
            applyWords: typeof applyWords;
        }, {
            allWords: [jpdbCard],
            visibleWords: [jpdbCard],
            index: 0,
            sourceLabel: 'JPDB',
            reviewCountMode: true,
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
            loadWordsInto: reload,
            applyWords,
        });

        try {
            await (controller as unknown as {
                applyExternalState(state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean }): Promise<void>;
            }).applyExternalState({ mode: 'word', sort: 'random', filter: 'study', source: 'anki', revealAnswer: false });

            expect((controller as unknown as { state: { source: string } }).state.source).toBe('anki');
            expect((controller as unknown as { allWords: JPDBCard[] }).allWords).toEqual([]);
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords).toEqual([]);
            expect(reload).toHaveBeenCalledWith(root, false, { useOfflineCache: false });
            expect(applyWords).not.toHaveBeenCalled();
        } finally {
            root.remove();
            controller.destroy();
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
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
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
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
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
                summary: vi.fn(async () => newTabLocalDictionarySummary()),
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
