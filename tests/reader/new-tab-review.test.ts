import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient, type AnkiLookupResult } from '../../src/reader/anki/index';
import { AnkiNewTabUnavailableError, listNewTabAnkiCards } from '../../src/reader/anki/new-tab';
import { cardKey } from '../../src/reader/cards/utils';
import { APP_NAME } from '../../src/reader/app/constants';
import type { ImmersionKitExample } from '../../src/reader/immersion/kit';
import { NewTabController, selectNewTabStudyPool } from '../../src/reader/newtab/controller';
import { NEW_TAB_BROWSE_DECK_LIMIT, NEW_TAB_PUBLIC_FALLBACK_GRACE_MS, NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS } from '../../src/reader/newtab/controller-config';
import { renderSearchWordResults, searchWordDetailHtml, searchWordMetaItems, searchWordSummaryMeta, type NewTabSearchDetailViewContext, type NewTabSearchWordDetailData } from '../../src/reader/newtab/search-view';
import { newTabSourceLoadPlan } from '../../src/reader/newtab/source';
import { NewTabRuntime } from '../../src/reader/newtab/runtime';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb/jpdb-review-bridge';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT } from '../../src/reader/kanji/doodle';
import { assessKanjiStrokes, rankKanjiStrokeCandidates } from '../../src/reader/kanji/stroke-grader';
import { createReaderPopover } from '../../src/reader/popup/shell';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';

const WORD_ONLY_STUDY_DISABLED_STEPS: typeof BASE_DEFAULT_SETTINGS.newTabStudyDisabledSteps = [
    'kanji-doodle',
    'recall-cloze',
    'listen-pitch',
    'speaking',
];
const REVIEW_SUITE_STUDY_STEP_ORDER: typeof BASE_DEFAULT_SETTINGS.newTabStudyStepOrder = [
    'word',
    'recall-cloze',
    'listen-pitch',
    'speaking',
    'kanji-doodle',
];
// These tests assert English UI copy and mostly cover the old review/front-card
// behavior; pin language while dedicated study tests cover the new kanji-first
// merged flow.
const DEFAULT_SETTINGS: typeof BASE_DEFAULT_SETTINGS = {
    ...BASE_DEFAULT_SETTINGS,
    interfaceLanguage: 'en',
    newTabStudyStepOrder: REVIEW_SUITE_STUDY_STEP_ORDER,
    newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
};
import { definitionSourceRows } from '../../src/reader/sources/sections';
import { renderNewTabGradeControlButtons, summarizeNewTabReviewSources } from '../../src/reader/newtab/review-controls';
import type { JPDBCard, JPDBGrade, JPDBToken } from '../../src/reader/app/types';
import { stackedSettingsFixtureDom } from './helpers/settings-fixture';
import { expectSettingsDialogStillMounted, expectStackedLookupOverSettings } from './helpers/stacked-lookup-assertions';
import { waitForExpect } from './test-utils';

const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
const NEW_TAB_CURRENT_WORD_KEY = 'jpdb-reader-newtab-current-word';
const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');
const IMMERSION_CSS = readFileSync('src/reader/styles/immersion-study.css', 'utf8');
const NORMALIZED_NEW_TAB_CSS = NEW_TAB_CSS.replace(/\s+/g, ' ');

function newTabCssRule(selector: string): string {
    return immersionCssRule(NORMALIZED_NEW_TAB_CSS, selector);
}

function immersionCssRule(normalizedCss: string, selector: string): string {
    const start = normalizedCss.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = normalizedCss.indexOf(' }', start);
    expect(end).toBeGreaterThan(start);
    return normalizedCss.slice(start, end + 2);
}

beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', undefined);
    localStorage.removeItem(NEW_TAB_UI_KEY);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.removeItem(NEW_TAB_GRADE_QUEUE_KEY);
    localStorage.removeItem(NEW_TAB_CACHE_KEY);
    localStorage.removeItem(NEW_TAB_UI_KEY);
    window.history.replaceState(null, '', '/');
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
        bunproReviewId,
        bunproReviewableId,
        bunproReviewableType,
        bunproReviewSessionId,
        bunproReviewInputMode,
        bunproReviewEndpoint,
        bunproSrsLevel,
        fallbackLookupTerms,
        sourceDeckName,
        lastReviewAt,
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
        bunproReviewId,
        bunproReviewableId,
        bunproReviewableType,
        bunproReviewSessionId,
        bunproReviewInputMode,
        bunproReviewEndpoint,
        bunproSrsLevel,
        fallbackLookupTerms,
        sourceDeckName,
        lastReviewAt,
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

function newTabImmersionAudioRevealFixture(
    search: (query: string) => Promise<ImmersionKitExample[]>,
    options: { fetchBlobUrl?: (url: string | string[], timeoutMs: number, proxyUrl?: string, language?: string) => Promise<string> } = {},
) {
    const card = newTabTestCard({ spelling: '発音', reading: 'はつおん' });
    const played = stubNewTabAudioPlayback();
    const fetchBlobUrl = options.fetchBlobUrl ?? vi.fn(async () => 'blob:http://localhost/line.mp3');
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
        studyStepId: 'final-reveal',
    });
    const reveal = () => revealNewTabStudyCard(root);
    return { card, controller, root, played, fetchBlobUrl, reveal };
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

function mountStackedNewTabLookup(runtime: NewTabRuntime) {
    const fixture = createStackedNewTabSettingsFixture(runtime);
    const lookup = createReaderPopover('よむ', fixture.settings);
    lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
    fixture.internals.mountLookupPopover(lookup, fixture.anchor, { stackOverSettings: true });
    return { ...fixture, lookup };
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

function dispatchPenControlTap(target: HTMLElement, pointerId = 91): PointerEvent {
    target.dispatchEvent(testControlPointerEvent('pointerdown', 24, 18, pointerId));
    const up = testControlPointerEvent('pointerup', 25, 18, pointerId);
    target.dispatchEvent(up);
    return up;
}

function testControlPointerEvent(type: string, clientX: number, clientY: number, pointerId: number): PointerEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY }) as PointerEvent;
    Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: pointerId },
        pointerType: { value: 'pen' },
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

function createNewTabKanjiFrontFixture(
    card: JPDBCard,
    overrides: Partial<NewTabControllerOptions> = {},
    stateOverrides: Partial<{ revealAnswer: boolean; sort: string; filter: string; source: string }> = {},
    settingsOverrides: Partial<NewTabSettings> = {},
): { controller: NewTabController; root: HTMLElement } {
    const controller = newTabPromptController({
        ...DEFAULT_SETTINGS,
        immersionKitEnabled: false,
        newTabKanjiAutogradeEnabled: false,
        newTabStudyStepOrder: BASE_DEFAULT_SETTINGS.newTabStudyStepOrder,
        newTabStudyDisabledSteps: [],
        ...settingsOverrides,
    }, {
        dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
        ...overrides,
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
        state: { mode: 'kanji', sort: 'frequency', filter: 'study', source: 'jpdb', revealAnswer: false, ...stateOverrides },
    });
    (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
    return { controller, root };
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
        parser: { isJpdbBackedCard: (card: JPDBCard) => card.source === 'jpdb' || card.reviewSource === 'jpdb-api' } as never,
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

function newTabDictionaryReloadFixture(options: {
    settings: NewTabSettings;
    summary: unknown;
    invalidateCaches?: unknown;
}) {
    resetNewTabReviewStorage();
    const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local' });
    const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
    const controller = new NewTabController({
        getSettings: () => options.settings,
        anki: {} as never,
        jpdb: {} as never,
        jpdbKanji: {} as never,
        kanjiVG: {} as never,
        rtk: {} as never,
        immersionKit: {} as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        parser: {
            cacheCards: vi.fn(),
            localCardFromEntry: vi.fn(() => localCard),
        } as never,
        dictionaries: {
            invalidateCaches: options.invalidateCaches,
            summary: options.summary,
            listRandomTopTerms,
        } as never,
        onSettingsChange: vi.fn(),
        applyTheme: vi.fn(),
        showSettings: vi.fn(),
        dismiss: vi.fn(),
    });
    return { controller, listRandomTopTerms };
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

function newTabBuiltInFallbackFixture(source: 'auto' | 'anki' | 'dictionary', settings: Partial<NewTabSettings> = {}) {
    resetNewTabReviewStorage();
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
        newTabSource: source,
        immersionKitEnabled: false,
        ...settings,
    }), publicSearch, {
        parser: { fallbackCardFromText } as never,
    });
    return { controller, publicSearch, fallbackCardFromText };
}

async function expectBuiltInFallbackWords(controller: NewTabController, fallbackCardFromText: unknown) {
    const result = await (controller as unknown as {
        loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean; emptyMessageKey?: string }>;
    }).loadWords();
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards.every(card => card.source === 'fallback')).toBe(true);
    expect(result.sourceLabel).toBe('Starter words');
    expect(result.reviewCountMode).toBe(false);
    expect(fallbackCardFromText).toHaveBeenCalled();
    return result;
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
    const respond = async (body: string): Promise<{ result: unknown; error: null }> => {
        const request = parseAnkiConnectRequest({ body });
        const result = await responder(request, {
            query: String(request.params.query ?? ''),
            cards: ankiNumberListParam(request.params, 'cards'),
            notes: ankiNumberListParam(request.params, 'notes'),
        });
        return { result, error: null };
    };
    vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('New-tab AnkiConnect tests should use the userscript bridge.');
    }));
    vi.stubGlobal('GM_xmlhttpRequest', async (details: Parameters<UserscriptHttpRequest>[0]) => {
        const json = await respond(String(details.data ?? '{}'));
        details.onload?.({
            status: 200,
            response: json,
            responseText: JSON.stringify(json),
        });
        return { abort: vi.fn() };
    });
    vi.stubGlobal('GM', {
        xmlHttpRequest: vi.fn(async (options: { data?: string }) => {
            return { status: 200, response: await respond(options.data ?? '{}') };
        }),
    });
}

function stubPagedAnkiCandidateFetch(
    ids: number[],
    noteForId: (noteId: number) => { modelName: string; fields: Record<string, unknown> },
): { cardInfoBatchSizes: number[]; noteInfoBatchSizes: number[] } {
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
                tags: [],
                cards: [noteId],
                ...noteForId(noteId),
            }));
        }
        return null;
    });
    return { cardInfoBatchSizes, noteInfoBatchSizes };
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
        ankiEnabled: true,
        newTabAnkiEnabled: true,
        ankiConnectUrl: `${window.location.origin}/anki-connect`,
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
    studyStepId?: string | null;
} = {}): HTMLElement {
    const visibleWords = options.visibleWords ?? [card];
    // Keyboard shortcuts listen at document level (0.6.151): binding events
    // only makes sense with the root attached to the document.
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: options.appendToDocument ?? options.bindRootEvents });
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
        setStudyStepOverrideForCurrentCard(id: string | null): void;
    };
    internals.setStudyStepOverrideForCurrentCard(options.studyStepId === undefined ? 'word' : options.studyStepId);
    internals.renderWord(root, card);
    if (options.bindRootEvents) internals.bindRootEvents(root);
    return root;
}

function dispatchNewTabKeyboard(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
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
        ankiEnabled: true,
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
    localStorage.removeItem('jpdb-reader-newtab-daily-study-time');
    sessionStorage.removeItem(NEW_TAB_CURRENT_WORD_KEY);
}

async function expectNewTabDictionaryCard(spelling: string, root: ParentNode = document, statusLabel: string | null = 'Dictionary'): Promise<void> {
    await waitForExpect(() => {
        expect(newTabPromptText(root)).toBe(spelling);
        if (statusLabel !== null) expect(root.querySelector('[data-newtab-status]')?.textContent).toContain(statusLabel);
        expect(root.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
    });
}

function newTabStatusButton(root: ParentNode = document): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
}

function expectNewTabPromptText(text: string, root: ParentNode = document): void {
    expect(newTabPromptText(root)).toBe(text);
}

function newTabPromptText(root: ParentNode = document): string {
    return root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')?.dataset.expression
        ?? root.querySelector('[data-newtab-prompt]')?.textContent?.trim()
        ?? '';
}

let syntheticNewTabNavigationTime = Date.now();

function clickNewTabNext(root: ParentNode = document): void {
    const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="next"]');
    if (!button) return;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    syntheticNewTabNavigationTime = Math.max(syntheticNewTabNavigationTime + 1_000, Date.now() + 1_000);
    Object.defineProperty(event, 'timeStamp', { configurable: true, value: syntheticNewTabNavigationTime });
    button.dispatchEvent(event);
}

function advanceNewTabStudyCard(root: ParentNode = document, clicks = 2): void {
    for (let count = 0; count < clicks; count += 1) clickNewTabNext(root);
}

function revealNewTabStudyCard(root: ParentNode = document): void {
    for (let count = 0; count < 8; count += 1) {
        const host = root instanceof HTMLElement ? root : document.querySelector<HTMLElement>('[data-jpdb-reader-root]');
        if (host?.classList.contains('jpdb-reader-newtab-revealed')) return;
        const reveal = root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]');
        if (reveal) {
            reveal.click();
            return;
        }
        const next = root.querySelector<HTMLButtonElement>('[data-newtab-action="next"]');
        if (!next) return;
        next.click();
    }
}

function showNextNewTabWord(controller: NewTabController): void {
    (controller as unknown as { showNextWord(): void }).showNextWord();
}

function newTabSourceSelect(root: ParentNode = document): HTMLSelectElement {
    return root.querySelector<HTMLSelectElement>('[data-newtab-source-select]')!;
}

function newTabSourceSelectValues(root: ParentNode = document): string[] {
    return Array.from(newTabSourceSelect(root).options).map(option => option.value);
}

function switchNewTabSource(target: string, root: ParentNode = document): void {
    const select = newTabSourceSelect(root);
    select.value = target;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

function expectNewTabMergedStatusSelect(current: string, other: string, root: ParentNode = document): void {
    const status = newTabStatusButton(root);
    expect(status.textContent).toContain('JPDB + Anki');
    expect(status.textContent).not.toContain('⇄');
    expect(status.disabled).toBe(true);
    const select = newTabSourceSelect(root);
    expect(select.hidden).toBe(false);
    expect(select.value).toBe(current);
    expect(newTabSourceSelectValues(root)).toContain(other);
}

function expectNewTabStatusSources(sources: string[], root: ParentNode = document): void {
    expect(newTabStatusButton(root).textContent).toContain('JPDB + Anki');
    expect(Array.from(root.querySelectorAll<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')).map(light => light.dataset.source))
        .toEqual(sources);
}

async function expectNewTabSourcePrompt(settings: { newTabSource: string }, source: string, prompt: string): Promise<void> {
    await waitForExpect(() => {
        expect(settings.newTabSource).toBe(source);
        expectNewTabPromptText(prompt);
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

function newTabApiSourceController(
    settings: NewTabSettings,
    overrides: Partial<NewTabControllerOptions>,
): NewTabController {
    return newTabBareController(settings, {
        anki: { listNewTabCards: vi.fn(async () => []) } as never,
        jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        parser: { cacheCards: vi.fn() } as never,
        dictionaries: {
            summary: vi.fn(async () => ({ dictionaries: [], dictionaryTypes: {} })),
            listRandomTopTerms: vi.fn(async () => []),
        } as never,
        ...overrides,
    });
}

async function renderLoadedApiStats(controller: NewTabController): Promise<HTMLElement> {
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
    const internals = controller as unknown as {
        bindRootEvents(root: HTMLElement): void;
        loadStatsInto(root: HTMLElement, force?: boolean): Promise<void>;
    };
    internals.bindRootEvents(root);
    await internals.loadStatsInto(root, true);
    return root;
}

function expectApiStatsSettingsButton(root: HTMLElement, showSettings: ReturnType<typeof vi.fn>): void {
    const settingsButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="stats-open-jpdb-settings"]')!;
    expect(settingsButton.textContent).toBe('API settings');
    settingsButton.click();
    expect(showSettings).toHaveBeenCalledWith('api');
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
    onAnkiStatusChanged?: (card: JPDBCard) => void;
}): { controller: NewTabController; root: HTMLElement } {
    const anki = options.findExistingCards === undefined
        ? { answerCard: options.answerCard }
        : { answerCard: options.answerCard, findExistingCards: options.findExistingCards };
    return newTabVisibleWordFixture(() => ({
        ...DEFAULT_SETTINGS,
        apiKey: 'jpdb-key',
        jpdbMiningEnabled: true,
        ankiEnabled: true,
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
            onAnkiStatusChanged: options.onAnkiStatusChanged,
        },
    });
}

function jpdbAnkiDuplicateReviewCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
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
        ...overrides,
    });
}

function ankiLookupNote(overrides: Partial<AnkiLookupResult['notes'][number]>): AnkiLookupResult['notes'][number] {
    return {
        noteId: 777,
        modelName: 'Core',
        deckNames: ['Core'],
        cardIds: [404],
        primaryCardId: 404,
        state: 'known',
        fields: { Expression: '日本語', Meaning: 'Japanese language' },
        renderedCards: [{ cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' }],
        tags: [],
        reps: 3,
        lapses: 0,
        ...overrides,
    };
}

function ankiLookupResult(state: AnkiLookupResult['state'], notes: AnkiLookupResult['notes']): AnkiLookupResult {
    return { state, notes, primary: notes[0] ?? null };
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
        apiKey: 'jpdb-key',
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

async function renderLoadedLiveReviewFixture(mode: 'kanji' | 'word') {
    const restoreCanvas = stubKanjiDoodleBrowserApis();
    const grade = vi.fn();
    const reveal = vi.fn();
    const requestCurrent = vi.fn();
    const controller = newTabLiveReviewController({
        status: newTabLiveKanjiStatus(),
        requestCurrent,
        reveal,
        grade,
        settings: {
            newTabStudyStepOrder: BASE_DEFAULT_SETTINGS.newTabStudyStepOrder,
            newTabStudyDisabledSteps: [],
        },
    });
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
    const state: NewTabRenderedState['state'] = { mode, sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false };
    seedNewTabState(controller, state);
    const result = await (controller as unknown as { loadJpdbWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadJpdbWords();
    (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
    const visible = applySeededNewTabWords(controller, root, {
        allWords: result.cards,
        sourceLabel: result.sourceLabel,
        reviewCountMode: result.reviewCountMode === true,
        state,
    });
    return { controller, root, visible, grade, reveal, requestCurrent, restoreCanvas };
}

function renderNewTabCardFront(controller: NewTabController, card: JPDBCard, options: {
    mode?: string;
    sort?: string;
    filter?: string;
    source?: string;
    sourceLabel?: string;
    revealAnswer?: boolean;
    studyStepId?: string | null;
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
    const internals = controller as unknown as {
        renderWord(root: HTMLElement, card: JPDBCard): void;
        setStudyStepOverrideForCurrentCard(id: string | null): void;
    };
    if (options.mode !== 'kanji' && !options.revealAnswer) {
        internals.setStudyStepOverrideForCurrentCard(options.studyStepId === undefined ? 'word' : options.studyStepId);
    } else if (options.studyStepId !== undefined) {
        internals.setStudyStepOverrideForCurrentCard(options.studyStepId);
    }
    internals.renderWord(root, card);
    return root;
}

function renderNewTabWordFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    return renderNewTabCardFront(controller, card);
}

function expectRevealedPromptPitch(controller: NewTabController, card: JPDBCard, pitchClass: string): void {
    const reveal = renderNewTabCardFront(controller, card, { revealAnswer: true });
    try {
        const word = reveal.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word');
        expect(word?.dataset.pitchClass).toBe(pitchClass);
        expect(word?.classList.contains(`jpdb-pitch-${pitchClass}`)).toBe(true);
    } finally {
        reveal.remove();
    }
}

function renderNewTabKanjiFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    return renderNewTabCardFront(controller, card, { mode: 'kanji' });
}

function renderTestKanjiDetails(options: {
    settings?: Partial<NewTabSettings>;
    card: JPDBCard;
    kanji: string;
    info: unknown;
    jiten?: unknown;
    rtk?: unknown;
}): HTMLElement {
    const controller = newTabPromptController({
        ...DEFAULT_SETTINGS,
        ...options.settings,
    });
    return (controller as unknown as {
        renderKanjiDetails(card: JPDBCard, kanji: string, info: unknown, jiten: unknown, rtk: unknown, vg: null, local: [], similar: []): HTMLElement;
    }).renderKanjiDetails(options.card, options.kanji, options.info, options.jiten ?? null, options.rtk ?? null, null, [], []);
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
            { id: 'yomu-search', label: 'Yomu', urlTemplate: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html?q={query}', enabled: true },
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
            hasDictionaries: vi.fn(async () => true),
            summary: vi.fn(async () => ({ dictionaries: [{ title: 'Local', alias: 'Local', enabled: true, priority: 0 }], terms: 2, kanji: 0, termMeta: 0, kanjiMeta: 0 })),
            searchTerms,
        } as never,
    });
    const searchApi = controller as unknown as NewTabSearchModeApi;
    const root = renderBoundNewTabSearchRoot(controller, 'dictionary');

    return { settings, searchTerms, root, searchApi, controller };
}

function newTabSearchInput(root: HTMLElement): HTMLInputElement {
    return root.querySelector<HTMLInputElement>('[data-newtab-search-input]')!;
}

function newTabSearchResultsText(root: HTMLElement): string {
    return root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
}

function newTabSearchResultExpression(root: HTMLElement, expression: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-newtab-action="search-result-word"][data-expression="${expression}"]`);
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

async function withKanjiStudyCompanionMissing<T>(callback: () => Promise<T>): Promise<T> {
    const targets = [
        globalThis,
        typeof window === 'undefined' ? null : window,
    ].filter((target, index, all): target is typeof globalThis & { __yomuCompanions?: Record<string, unknown> } => Boolean(target && all.indexOf(target) === index));
    const previous = targets.map(target => ({
        target,
        hadRegistry: Object.prototype.hasOwnProperty.call(target, '__yomuCompanions'),
        registry: target.__yomuCompanions,
    }));
    for (const target of targets) {
        const registry = { ...(target.__yomuCompanions ?? {}) };
        delete registry.kanjiStudy;
        Object.defineProperty(target, '__yomuCompanions', {
            configurable: true,
            enumerable: false,
            writable: true,
            value: registry,
        });
    }
    try {
        return await callback();
    } finally {
        for (const entry of previous) {
            if (entry.hadRegistry) {
                entry.target.__yomuCompanions = entry.registry;
            } else {
                delete entry.target.__yomuCompanions;
            }
        }
    }
}

describe('new tab review helpers', () => {
    it('keeps new-tab source load fallback policy explicit', () => {
        expect(newTabSourceLoadPlan('auto', 3)).toEqual({
            kind: 'auto-review',
            primarySources: ['yomu-local', 'jpdb', 'bunpro', 'anki'],
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
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
        expect(newTabSourceLoadPlan('bunpro', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['bunpro'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
        expect(newTabSourceLoadPlan('yomu-local', 3)).toEqual({
            kind: 'explicit-source',
            primarySources: ['yomu-local'],
            studyFallback: { kind: 'study-supplement', minCards: 3 },
        });
    });

    it('keeps mobile new-tab tabs separated from topbar controls', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('@media (max-width: 860px) { .jpdb-reader-newtab-topbar { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "brand controls" "mode mode";');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-mode { grid-area: mode; width: 100%; min-width: 0; max-width: none; justify-self: stretch; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-mode button { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }');
        expect(normalizedCss)
            .toContain('@media (max-width: 420px) { .jpdb-reader-newtab-shell { width: min(100vw - 12px, 420px); } .jpdb-reader-newtab-mode button { min-height: 36px; padding-inline: 6px; font-size: 10px; }');
    });

    it('keeps new-tab search suggestions padded on every edge', () => {
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-search-suggestions[hidden] { display: none; } .jpdb-reader-newtab-search-suggestions button { display: grid; align-content: center; justify-items: start; gap: 3px; min-width: 0; min-height: 44px; padding: 12px; text-align: left; }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .not.toContain('min-height: 44px; padding-inline: 12px; text-align: left;');
    });

    it('styles current Anki card audio as the newtab icon speaker', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-prompt-anki-card .jpdb-reader-anki-primary-sound { order: -1; align-self: center; justify-self: end; margin: 0 0 2px auto; background: var(--jpdb-reader-surface); color: var(--jpdb-reader-text); }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-prompt-anki-card .jpdb-reader-anki-primary-sound svg { width: 20px !important; height: 20px !important; max-width: 20px !important; max-height: 20px !important; }');
        expect(normalizedCss)
            .toContain('@media (max-width: 640px) { .jpdb-reader-newtab-shell { width: min(100vw - 16px, 560px); gap: 12px; } .jpdb-reader-newtab-topbar');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-prompt-anki-card .jpdb-reader-anki-primary-sound { position: absolute; top: 0; right: clamp(10px, 3vw, 16px); margin: 0; }');
    });

    it('keeps new-tab button text tied to the active theme tokens', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('button.jpdb-reader-newtab-status { display: inline-flex; align-items: center; justify-content: center; gap: 5px; max-width: min(360px, calc(100vw - 56px)); min-height: 26px; padding: 5px 10px; border: 1px solid rgba(139, 160, 177, 0.24); border-radius: 999px; background: var(--jpdb-reader-surface); color: var(--jpdb-reader-text);');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-controls[data-newtab-control-count="2"]:not(.jpdb-reader-newtab-grade-controls) { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-controls button { display: grid; place-items: center; width: 100%; min-height: 42px; padding: 0 12px; border: 1px solid rgba(139, 160, 177, 0.24); border-radius: 8px; background: linear-gradient( 180deg, color-mix(in srgb, var(--jpdb-reader-surface-2) 82%, var(--jpdb-reader-bg) 18%), color-mix(in srgb, var(--jpdb-reader-surface) 90%, var(--jpdb-reader-bg) 10%) ); color: var(--jpdb-reader-text);');
        expect(normalizedCss)
            .toContain('.jpdb-reader-theme-light .jpdb-reader-newtab-controls button:not([data-grade]), .yomu-page-theme-light .jpdb-reader-newtab-controls button:not([data-grade]) { border-color: color-mix(in srgb, var(--jpdb-reader-accent) 20%, var(--jpdb-reader-border));');
        expect(newTabCssRule(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab'))
            .toContain('--jpdb-reader-bg: var(--bg, var(--jpdb-reader-theme-light-bg));');
        expect(newTabCssRule('.jpdb-reader-newtab'))
            .not.toContain('--jpdb-reader-accent-readable');
        expect(newTabCssRule(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab'))
            .not.toContain('--jpdb-reader-accent-readable');
        expect(normalizedCss)
            .toContain('button[data-newtab-action="reveal"] { border-color: color-mix(in srgb, var(--jpdb-reader-accent) 72%, var(--jpdb-reader-border)); background: linear-gradient( 180deg, color-mix(in srgb, var(--jpdb-reader-accent) 94%, var(--jpdb-reader-white) 6%), var(--jpdb-reader-accent) ); color: var(--jpdb-reader-accent-text, var(--jpdb-reader-white));');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-controls button[data-grade]:disabled { opacity: 1; color: var(--jpdb-reader-text); -webkit-text-fill-color: var(--jpdb-reader-text); }');
    });

    it('keeps Immersion Kit media subtitles in video-caption colors across themes', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');
        const imageSentenceRule = newTabCssRule('.jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence');
        const subtitleWordRule = newTabCssRule('.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence .jpdb-reader-word');
        const imageWordRule = newTabCssRule('.jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word');
        const normalizedImmersionCss = IMMERSION_CSS.replace(/\s+/g, ' ');
        const sharedSentenceRule = immersionCssRule(normalizedImmersionCss, '.jpdb-reader-example-card.has-image .jpdb-reader-example-sentence');

        // Overlay geometry is shared (immersion-study.css); the new-tab rule only
        // reskins it as a video subtitle.
        expect(sharedSentenceRule).toContain('left: 50%;');
        expect(sharedSentenceRule).toContain('transform: translateX(-50%);');
        expect(sharedSentenceRule).toContain('color: var(--jpdb-reader-white);');
        expect(sharedSentenceRule).toContain('background: var(--jpdb-ocr-background-rgba, var(--jpdb-reader-ocr-bg));');
        expect(sharedSentenceRule).toContain('calc(var(--yomu-immersion-frame-width, 100%) - 12px)');
        expect(imageSentenceRule).toContain('max-width: min( calc(100% - clamp(28px, 8%, 52px)), calc(var(--yomu-immersion-frame-width, 100%) - 12px) );');
        expect(imageSentenceRule).toContain('text-shadow: 0 1px 2px var(--subtitle-outline, var(--jpdb-reader-video-outline))');
        expect(imageSentenceRule).not.toContain('right: clamp(');
        expect(subtitleWordRule)
            .toContain('--jpdb-reader-subtitle-fallback: var(--jpdb-reader-white);');
        expect(imageWordRule).toContain('-webkit-text-stroke: 0.02em');
        expect(normalizedImmersionCss).toContain(':is(.jpdb-reader-example-target, .jpdb-reader-word.jpdb-reader-example-target) { --jpdb-reader-word-underline: transparent; background: color-mix( in srgb, var(--jpdb-reader-accent-readable, var(--jpdb-reader-accent)) 34%, var(--jpdb-reader-video-target-backdrop) ) !important;');
        // Deduped: new-tab.css must not re-declare the shared target/blur rules.
        expect(normalizedCss).not.toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-target {');
        expect(normalizedCss).not.toContain('.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence .jpdb-reader-word.jpdb-reader-example-target {');
        expect(normalizedCss).not.toContain('translation-blurred');
        expect(normalizedCss)
            .not.toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-text); background: transparent; box-shadow: none; }');
        expect(normalizedCss)
            .not.toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-word { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-text); background: transparent !important; }');
        expect(normalizedCss)
            .not.toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-sentence .jpdb-reader-furi { color: currentColor; opacity: 0.82; text-shadow: none; }');
        expect(normalizedCss)
            .toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-reader-newtab-immersion .jpdb-reader-example-card.has-image .jpdb-reader-example-translation { color: var(--jpdb-reader-muted); text-shadow: none; }');
    });

    it('does not stack prompt text shadow under the study term underline', () => {
        const termRule = newTabCssRule('.jpdb-reader-newtab-term .jpdb-reader-word');

        expect(termRule).toContain('text-shadow: none;');
        expect(termRule).toContain('box-shadow: none !important;');
        expect(termRule).toContain('text-decoration-color: transparent !important;');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-term .jpdb-reader-word::after { border-block-end-color: var(--jpdb-reader-word-underline, transparent) !important; }');
        expect(NORMALIZED_NEW_TAB_CSS).toContain('.jpdb-reader-newtab-controls.jpdb-reader-newtab-grade-controls[data-newtab-grade-scale="pass-fail"], .jpdb-reader-newtab-controls.jpdb-reader-newtab-grade-controls[data-newtab-grade-count="2"]');
        expect(NORMALIZED_NEW_TAB_CSS).toContain('width: min(680px, calc(100vw - 28px)); max-width: calc(100vw - 28px); gap: 10px;');
        expect(NORMALIZED_NEW_TAB_CSS).toContain('.jpdb-reader-newtab-controls[data-newtab-grade-scale="pass-fail"] button[data-grade] { min-height: 54px; padding-inline: 14px; font-size: 15px; }');
    });

    it('keeps generic new-tab accent surfaces on accent tokens', () => {
        const genericAccentRules = [
            newTabCssRule('.jpdb-reader-newtab-mode button[data-active="true"]'),
            newTabCssRule('.jpdb-reader-newtab-searchbox button[type="submit"]'),
            newTabCssRule('.jpdb-reader-newtab-count::before'),
        ];

        expect(genericAccentRules.join(' ')).toContain('--jpdb-reader-accent');
        expect(newTabCssRule('.jpdb-reader-newtab-mode button[data-active="true"]'))
            .toContain('var(--jpdb-reader-accent-soft)');
        expect(newTabCssRule('.jpdb-reader-newtab-mode button[data-active="true"]'))
            .toContain('var(--jpdb-reader-accent-readable, var(--jpdb-reader-text))');
        expect(newTabCssRule('.jpdb-reader-newtab-searchbox button[type="submit"]'))
            .toContain('var(--jpdb-reader-accent-readable, var(--jpdb-reader-text))');

        for (const rule of genericAccentRules) {
            expect(rule).not.toContain('--jpdb-reader-state-known');
            expect(rule).not.toContain('--jpdb-reader-state-new-bright');
            expect(rule).not.toContain('--jpdb-reader-state-learning');
        }

        // UT-21: the page edge glows are swipe-grade affordances — left mirrors
        // the fail grade, right mirrors the pass grade, and both stay hidden
        // unless a drag is in progress.
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab::before { left: 0; background: linear-gradient( 90deg, color-mix(in srgb, var(--jpdb-reader-state-failed) 62%, transparent), transparent ); }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab::after { right: 0; background: linear-gradient( 270deg, color-mix(in srgb, var(--jpdb-reader-state-known) 62%, transparent), transparent ); }');
        expect(newTabCssRule('.jpdb-reader-newtab::before, .jpdb-reader-newtab::after')).toContain('opacity: 0');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab[data-newtab-swipe-mode="grade"][data-newtab-swipe-direction="left"]::before, .jpdb-reader-newtab[data-newtab-swipe-mode="grade"][data-newtab-swipe-direction="right"]::after { opacity: calc(0.25 + 0.75 * var(--jpdb-reader-newtab-swipe-progress, 0)); }');
        expect(NORMALIZED_NEW_TAB_CSS).not.toContain('.jpdb-reader-newtab-review-mode .jpdb-reader-newtab-study::before');

        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-controls button[data-grade="pass"], .jpdb-reader-newtab-controls button[data-grade="okay"] { --jpdb-newtab-grade-accent: var(--jpdb-reader-state-known); }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-status-light[data-source="anki"] { background: var(--jpdb-reader-state-new-bright);');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-status-light[data-source="jiten"] { background: var(--jpdb-reader-state-learning);');
    });

    it('keeps the in-page deck selector width stable while options hydrate', () => {
        const rule = newTabCssRule('.jpdb-reader-newtab-deck');

        expect(rule).toContain('box-sizing: border-box;');
        expect(rule).toContain('width: min(320px, 80vw);');
    });

    it('keeps new-tab kanji search cards compact and touch reachable', () => {
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-search-kanji-grid { grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));');
        expect(newTabCssRule('.jpdb-reader-newtab-search-kanji-card'))
            .toContain('min-height: 58px;');
        expect(newTabCssRule('.jpdb-reader-newtab-search-kanji-card .jpdb-reader-newtab-search-kanji-char'))
            .toContain('font-size: 34px;');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-search-card, .jpdb-reader-newtab-kanji-details .jpdb-reader-source-card > summary.jpdb-reader-local-title, .jpdb-reader-newtab-kanji-details .jpdb-reader-component-button, .jpdb-reader-newtab-kanji-vocab > button, .jpdb-reader-newtab-mini-action { min-height: 44px !important; }');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('.jpdb-reader-newtab-kanji-details .jpdb-reader-local, .jpdb-reader-newtab-kanji-details .jpdb-reader-source-card { width: 100%; margin-top: 0; padding: 0; overflow: visible; text-align: left; border: 0;');
        expect(NORMALIZED_NEW_TAB_CSS)
            .toContain('overflow: visible; text-align: left; border: 0;');
    });

    it('keeps the mobile new-tab mode switch on its own compact header row', () => {
        const normalizedCss = NEW_TAB_CSS.replace(/\s+/g, ' ');

        expect(normalizedCss)
            .toContain('@media (max-width: 640px) { .jpdb-reader-newtab-shell { width: min(100vw - 16px, 560px); gap: 12px; } .jpdb-reader-newtab-topbar { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "brand controls" "mode mode"; align-items: center; gap: 8px 10px; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-brand { min-width: 112px; display: flex; align-items: center; padding-left: clamp(6px, 1.2vw, 14px); }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-brand { grid-area: brand; justify-self: start; min-width: 0; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-theme-controls { grid-area: controls; justify-self: end; min-width: 0; }');
        expect(normalizedCss)
            .toContain('.jpdb-reader-newtab-mode button { min-width: 0; padding: 0 8px; font-size: 11px; white-space: nowrap; }');
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
        const listRecentReviews = vi.fn(async () => [
            { wordId: 42, readingIndex: 2, wordText: '読む', rating: 4, reviewDateTime: '2026-06-24T17:04:00Z', reviewedAt: Date.parse('2026-06-24T17:04:00Z'), reviewDuration: 12_000, cardState: 2 },
            { wordId: 42, readingIndex: 2, wordText: '読む', rating: 1, reviewDateTime: '2026-06-24T17:03:00Z', reviewedAt: Date.parse('2026-06-24T17:03:00Z'), reviewDuration: 18_000, cardState: 3 },
        ]);
        const showSettings = vi.fn();
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, listRecentReviews, reviewCard: vi.fn() } as never,
            showSettings,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(listStudyBatchCards).toHaveBeenCalled();
            expect(listRecentReviews).toHaveBeenCalledWith(1000);
            expect(root.textContent).toContain('Jiten SRS loaded.');
            expect(root.textContent).toContain('50%');
            expect(root.textContent).toContain('4.0');
            expect(root.querySelectorAll('[data-stats-source]')).toHaveLength(0);
            expect(root.querySelector('[data-newtab-action="stats-import-jpdb"]')).toBeNull();
            expect(root.querySelector('[data-stats-jpdb-file]')).toBeNull();
            expectApiStatsSettingsButton(root, showSettings);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders Jiten card-state breakdowns on the stats page across SRS states', async () => {
        const states: Array<[string, Array<'due' | 'known' | 'learning' | 'new'>]> = [
            ['読む', ['due']],
            ['書く', ['known']],
            ['話す', ['learning']],
            ['聞く', ['new']],
        ];
        const listStudyBatchCards = vi.fn(async () => states.map(([spelling, cardState], index) => newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState,
            jitenWordId: index + 1,
            spelling,
            reading: spelling,
        })));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(root.textContent).toContain('Jiten SRS loaded.');
            const breakdown = root.querySelector('[data-stats-breakdown]') ?? root;
            // All four states must be represented in the rendered stats.
            expect(breakdown.textContent).toMatch(/due/i);
            expect(breakdown.textContent).toMatch(/known/i);
            expect(breakdown.textContent).toMatch(/learning/i);
            expect(breakdown.textContent).toMatch(/new/i);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('renders the JPDB-style learning-progress strip with totals and known percentage', async () => {
        const states: Array<[string, Array<'due' | 'known' | 'learning' | 'new'>]> = [
            ['読む', ['known']],
            ['書く', ['known']],
            ['話す', ['learning']],
            ['聞く', ['new']],
        ];
        const listStudyBatchCards = vi.fn(async () => states.map(([spelling, cardState], index) => newTabTestCard({
            source: 'jiten',
            reviewSource: 'jiten-api',
            cardState,
            jitenWordId: index + 1,
            spelling,
            reading: spelling,
        })));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            const progress = root.querySelector<HTMLElement>('.jpdb-reader-stats-progress');
            expect(progress).not.toBeNull();
            expect(progress!.classList.contains('jpdb-reader-stats-panel')).toBe(false);
            expect(progress!.querySelector('h2')).toBeNull();
            expect(progress!.textContent).not.toContain('Learning progress');
            expect(progress!.textContent).toContain('Learning');
            expect(progress!.textContent).toContain('You know');
            const values = [...progress!.querySelectorAll('.jpdb-reader-stats-progress-item strong')].map(item => item.textContent);
            expect(values[0]).toBe('4');
            expect(values[1]).toBe('1');
            expect(values[2]).toContain('2');
            expect(values[2]).toMatch(/50/);
            expect(progress!.querySelector('.jpdb-reader-stats-progress-rail')).not.toBeNull();
            expect(root.textContent).toContain('Total known non-redundant vocabulary: 2');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('fronts JPDB-backed cards with the JPDB example sentence, not Immersion Kit (SH-5)', async () => {
        const jpdbLookup = vi.fn(async () => ({ examples: [{ sentence: '日本語を勉強します。' }] }));
        const immersionSearch = vi.fn(async () => [{ sentence: '勉強の鬼になる。' } as ImmersionKitExample]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: true, jpdbDefinitionsEnabled: true }, {
            jpdbVocabulary: { lookup: jpdbLookup, search: vi.fn(async () => []) } as never,
            immersionKit: { search: immersionSearch, mediaUrls: vi.fn(() => []) } as never,
        });
        try {
            const internals = controller as unknown as { fetchFrontSentence(card: JPDBCard): Promise<string> };
            const jpdbCard = newTabTestCard({ spelling: '勉強', reading: 'べんきょう', source: 'jpdb', cardState: ['due'] });
            await expect(internals.fetchFrontSentence(jpdbCard)).resolves.toContain('日本語を勉強します');

            // Non-JPDB cards keep the Immersion Kit-first superset behavior.
            const localCard = newTabTestCard({ spelling: '勉強', reading: 'べんきょう', source: 'local' });
            await expect(internals.fetchFrontSentence(localCard)).resolves.toContain('勉強の鬼になる');
        } finally {
            controller.destroy();
        }
    });

    it('does not scrape JPDB example sentences for keyless study cards', async () => {
        const jpdbLookup = vi.fn(async () => ({ examples: [{ sentence: '日本語を勉強します。' }] }));
        const immersionSearch = vi.fn(async () => [{ sentence: '勉強の鬼になる。' } as ImmersionKitExample]);
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            immersionKitEnabled: true,
            jpdbDefinitionsEnabled: true,
        }, {
            jpdbVocabulary: { lookup: jpdbLookup, search: vi.fn(async () => []) } as never,
            immersionKit: { search: immersionSearch, mediaUrls: vi.fn(() => []) } as never,
        });
        try {
            const internals = controller as unknown as { fetchFrontSentence(card: JPDBCard): Promise<string> };
            const jpdbCard = newTabTestCard({ spelling: '勉強', reading: 'べんきょう', source: 'jpdb', cardState: ['due'] });

            await expect(internals.fetchFrontSentence(jpdbCard)).resolves.toContain('勉強の鬼になる');
            expect(jpdbLookup).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
        }
    });

    it('shows due-in buckets on Anki rows in the My Cards browser (SH-3 due-in column)', async () => {
        const listDeckCards = vi.fn(async () => []);
        const listNewTabCards = vi.fn(async () => [
            newTabTestCard({ vid: -1, sid: -1, rid: 301, ankiCardId: 301, spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' }),
            newTabTestCard({ vid: -2, sid: -2, rid: 302, ankiCardId: 302, spelling: '勉強', reading: 'べんきょう', cardState: ['learning'], source: 'anki', reviewSource: 'anki' }),
        ]);
        const invoke = vi.fn(async (action: string, params?: Record<string, unknown>) => {
            if (action !== 'findCards') throw new Error(`unexpected ${action}`);
            const query = String(params?.query ?? '');
            if (query === 'is:due') return [301];
            if (query.includes('prop:due<=7')) return [302];
            return [];
        });
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            anki: { listNewTabCards, invoke } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            for (let i = 0; i < 6; i += 1) await new Promise(resolve => setTimeout(resolve, 0));

            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-item')];
            const rowText = (term: string) => rows.find(row => row.textContent?.includes(term))?.textContent ?? '';
            await waitForExpect(() => {
                expect(rowText('暗記')).toContain('Due');
                expect(rowText('勉強')).toContain('≤7d');
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('includes Anki cards in the My Cards browser pool without touching the JPDB stats source (SH-3 v2)', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 1, source: 'jpdb' }),
        ]);
        const listNewTabCards = vi.fn(async () => [
            newTabTestCard({ vid: -1, sid: -1, rid: 201, spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            anki: { listNewTabCards } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(listNewTabCards).toHaveBeenCalled();
            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(rows.some(row => row.textContent?.includes('暗記'))).toBe(true);
            expect(rows.some(row => row.textContent?.includes('読む'))).toBe(true);

            // The JPDB stats source keeps its own provider list (no Anki).
            const internals = controller as unknown as { jpdbStatsApiProviders(settings: unknown): Array<{ label: string }> };
            const labels = internals.jpdbStatsApiProviders({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', ankiEnabled: true, newTabAnkiEnabled: true }).map(provider => provider.label);
            expect(labels).toEqual(['JPDB']);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('includes Bunpro and local Yomu SRS cards in the My Cards browser pool', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 1, source: 'jpdb' }),
        ]);
        const bunproQueue = vi.fn(async () => ({
            providerId: 'bunpro',
            fetchedAt: Date.now(),
            dueCount: 1,
            newCount: 0,
            reviewCount: 1,
            cards: [{
                providerId: 'bunpro',
                providerCardId: 'bp-101',
                providerReviewId: 'review-101',
                providerReviewableId: '101',
                kind: 'vocabulary',
                expression: '文法',
                reading: 'ぶんぽう',
                meanings: [{ glosses: ['grammar'], partOfSpeech: [] }],
                state: ['due'],
                srsLevel: 'Seasoned',
            }],
        }));
        const yomuQueue = vi.fn(async () => ({
            providerId: 'yomu-local',
            fetchedAt: Date.now(),
            dueCount: 0,
            newCount: 1,
            reviewCount: 1,
            cards: [{
                providerId: 'yomu-local',
                providerCardId: 'local-1',
                kind: 'vocabulary',
                expression: '自習',
                reading: 'じしゅう',
                meanings: [{ glosses: ['self study'], partOfSpeech: [] }],
                state: ['new'],
            }],
        }));
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            yomuLocalSrsEnabled: true,
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            srsAdapters: {
                bunpro: { label: 'Bunpro', hasCredential: () => true, queue: bunproQueue, stats: vi.fn(), review: vi.fn() },
                'yomu-local': { label: 'Yomu', hasCredential: () => true, queue: yomuQueue, stats: vi.fn(), review: vi.fn() },
            } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);

            await waitForExpect(() => {
                expect(bunproQueue).toHaveBeenCalled();
                expect(yomuQueue).toHaveBeenCalled();
                const text = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')].map(row => row.textContent ?? '').join('\n');
                expect(text).toContain('読む');
                expect(text).toContain('文法');
                expect(text).toContain('自習');
                expect(root.querySelector('[data-browse-source-filter="bunpro"]')?.textContent).toBe('Bunpro 1');
                expect(root.querySelector('[data-browse-source-filter="yomu-local"]')?.textContent).toBe('Yomu 1');
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('opens Jiten My Cards rows as source-card popovers so mining controls stay available', async () => {
        const jitenCard = newTabTestCard({
            spelling: '電車',
            reading: 'でんしゃ',
            cardState: ['learning'],
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 2700,
            jitenReadingIndex: 0,
            sourceDeckName: 'Core Anime',
        });
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const showLookupCard = vi.fn();
        const lookupText = vi.fn();
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            showLookupCard,
            lookupText,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await waitForExpect(() => {
                expect(root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-browse-row')?.textContent).toContain('電車');
            });

            const row = root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-browse-row')!;
            row.click();

            expect(showLookupCard).toHaveBeenCalledWith(jitenCard, '電車', row, expect.objectContaining({
                navigation: 'push-current',
                reuseActivePopover: true,
                userGesture: true,
            }));
            expect(lookupText).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('loads all Jiten study deck vocabulary for the Search tab source filters', async () => {
        const deckCards = [
            newTabTestCard({
                spelling: '日本語',
                reading: 'にほんご',
                cardState: ['new'],
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 101,
                jitenReadingIndex: 0,
            }),
            newTabTestCard({
                spelling: '復習',
                reading: 'ふくしゅう',
                cardState: ['due'],
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 102,
                jitenReadingIndex: 0,
            }),
        ];
        const listStudyDecks = vi.fn(async () => [{ id: 7, name: 'Vocab 2k' }]);
        const listStudyDeckVocabularyCards = vi.fn(async () => deckCards);
        const listStudyBatchCards = vi.fn(async () => [
            newTabTestCard({ spelling: 'Queue only', source: 'jiten', reviewSource: 'jiten-api', jitenWordId: 1, jitenReadingIndex: 0 }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, listStudyDecks, listStudyDeckVocabularyCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);

            await waitForExpect(() => {
                expect(listStudyDeckVocabularyCards).toHaveBeenCalledWith(7, NEW_TAB_BROWSE_DECK_LIMIT);
                expect(root.querySelector('[data-browse-source-filter="jiten"]')?.textContent).toBe('Jiten 2');
            });
            expect(listStudyBatchCards).not.toHaveBeenCalled();
            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(rows.map(row => row.textContent)).toEqual([
                expect.stringContaining('日本語'),
                expect.stringContaining('復習'),
            ]);
            const internals = controller as unknown as { browsePool?: JPDBCard[] };
            expect(internals.browsePool?.map(card => card.sourceDeckName)).toEqual(['Vocab 2k', 'Vocab 2k']);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('bulk-blacklists the selected page of My Cards through the shared card-action path (SH-3 v2)', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 21, source: 'jpdb' }),
            newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 22, source: 'jpdb' }),
        ]);
        const performCardAction = vi.fn(async (..._args: [HTMLButtonElement, JPDBCard, string?, HTMLElement?]) => {});
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            performCardAction,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            // Select mode is opt-in (user-tested: rows should not always
            // carry checkboxes) — toggle it on first.
            expect(root.querySelector('[data-browse-select-page]')).toBeNull();
            root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-select-mode"]')!.click();
            await new Promise(resolve => setTimeout(resolve, 0));

            const selectPage = root.querySelector<HTMLInputElement>('[data-browse-select-page]')!;
            expect(selectPage).not.toBeNull();
            const bulkButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="browse-bulk"][data-bulk-action="blacklist"]')!;
            expect(bulkButton.disabled).toBe(true);

            selectPage.checked = true;
            selectPage.dispatchEvent(new Event('change', { bubbles: true }));
            expect(bulkButton.disabled).toBe(false);
            expect([...root.querySelectorAll<HTMLInputElement>('[data-browse-select]')].every(box => box.checked)).toBe(true);

            bulkButton.click();
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(performCardAction).toHaveBeenCalledTimes(2);
            const actions = performCardAction.mock.calls.map(call => call[0].dataset.action);
            expect(actions).toEqual(['blacklist', 'blacklist']);
            const spellings = performCardAction.mock.calls.map(call => call[1].spelling).sort();
            expect(spellings).toEqual(['書く', '読む']);
            // The pool reloads so the rows recolor with post-action states.
            expect(listDeckCards.mock.calls.length).toBeGreaterThanOrEqual(2);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('shows the My Cards browser with state chips on the idle search tab (SH-3)', async () => {
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 1 }),
            newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 2 }),
            newTabTestCard({ spelling: '聞く', reading: 'きく', cardState: ['new'], vid: 3 }),
        ]);
        const lookupText = vi.fn();
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
            lookupText,
        });
        try {
            const root = renderBoundNewTabSearchRoot(controller);
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(listDeckCards).toHaveBeenCalled();
            const chips = root.querySelectorAll('[data-newtab-action="browse-filter"]');
            expect(chips.length).toBeGreaterThanOrEqual(4); // All + New + Due + Known
            expect(root.querySelectorAll('.jpdb-reader-newtab-browse-row')).toHaveLength(3);

            // Filtering by Due leaves one row.
            const dueChip = [...chips].find(chip => (chip as HTMLElement).dataset.browseFilter === 'due') as HTMLButtonElement;
            dueChip.click();
            expect(root.querySelectorAll('.jpdb-reader-newtab-browse-row')).toHaveLength(1);
            expect(root.textContent).toContain('書く');

            // Clicking a row opens the lookup for that word.
            root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-browse-row')!.click();
            expect(lookupText).toHaveBeenCalledWith('書く', 'かく', expect.anything());

            // With a chip active, typing searches MY cards instead of the
            // dictionaries (SH-3 v2).
            (controller as unknown as { searchQuery: string }).searchQuery = 'よむ';
            (controller as unknown as { renderSearch(root: HTMLElement): void }).renderSearch(root);
            const rows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(rows).toHaveLength(0); // 読む is known, filter is still 'due'
            const knownChip = [...root.querySelectorAll<HTMLElement>('[data-newtab-action="browse-filter"]')]
                .find(chip => chip.dataset.browseFilter === 'known') as HTMLButtonElement;
            knownChip.click();
            const knownRows = [...root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-browse-row')];
            expect(knownRows).toHaveLength(1);
            expect(knownRows[0]?.textContent).toContain('読む');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('shows an error state on the stats page when the Jiten API fails instead of going blank', async () => {
        const listStudyBatchCards = vi.fn(async () => {
            throw new Error('Jiten API unreachable');
        });
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
        }, {
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });
        try {
            const root = await renderLoadedApiStats(controller);

            expect(listStudyBatchCards).toHaveBeenCalled();
            expect(root.textContent).toContain('Jiten API unreachable');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('combines Jiten and JPDB SRS in the new-tab API stats connection', async () => {
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
        try {
            const root = await renderLoadedApiStats(controller);

            expect(listDeckCards).toHaveBeenCalledWith('all', 2000);
            expect(listStudyBatchCards).toHaveBeenCalledWith(2000);
            expect(root.textContent).toContain('Jiten SRS loaded.');
            expect(root.textContent).toContain('JPDB card states loaded.');
            expect(Array.from(root.querySelectorAll('[data-stats-source]')).map(tab => tab.textContent)).toEqual(['Combined', 'JPDB', 'Jiten']);
            expect(root.querySelector('[data-newtab-action="stats-import-jpdb"]')).not.toBeNull();
            expect(root.querySelector('[data-stats-jpdb-file]')).not.toBeNull();
            const settingsButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="stats-open-jpdb-settings"]'));
            const apiSettings = settingsButtons.find(button => button.textContent === 'API settings');
            expect(apiSettings).toBeTruthy();
            apiSettings?.click();
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

    it('carries the jpdb.io deck-membership line through the review bridge (SH-4)', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <div class="kind">Vocabulary</div>
                <div class="card-sentence"><div class="sentence">はい、<span class="highlight">よくできました</span>。</div></div>
                <div>Part of the <a href="/deck?id=92">Persona 5</a> deck (3x)</div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review#a');

        expect(status.card?.deckMembership).toBe('Part of the Persona 5 deck (3x)');
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
            kanjiStudyCardFromSourceCard(card: JPDBCard, kanji: string): JPDBCard;
        };
        const sourceWord = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            meanings: [{ glosses: ['learning ability'], partOfSpeech: [] }],
            cardState: ['locked'],
            kanjiKeyword: 'learning ability',
        });
        const cards = ['学', '習', '能', '力'].map(kanji => internals.kanjiStudyCardFromSourceCard(sourceWord, kanji));

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
                .map(element => element.dataset.newtabAction)).toEqual(['previous', 'next']);
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

            expect(prompt.textContent).toContain('日');
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
            expect(newTabPromptText(root)).toBe('難');

            lookup.resolve({ kanji: '難', keyword: 'difficult', meanings: ['difficult'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await Promise.resolve();
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('難波');
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).not.toContain('Loading kanji details');
            expect(newTabSourceSelect(root).value).toBe('anki');
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('labels the current card origin in the mixed new-tab footer', () => {
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            jitenApiKey: 'jiten-key',
            immersionKitEnabled: false,
        }));
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
                sourceLabel: 'Jiten + JPDB + Anki',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'auto', revealAnswer: false },
            });

            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[0]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('1 / 4');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('jpdb');
            expect(newTabSourceSelect(root).hidden).toBe(false);

            (controller as unknown as { index: number }).index = 1;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[1]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('2 / 4');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('jiten');
            expect(newTabSourceSelect(root).hidden).toBe(false);

            (controller as unknown as { index: number }).index = 2;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[2]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('3 / 4');
            expect(root.querySelector<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')?.dataset.source).toBe('anki');
            expect(newTabSourceSelect(root).value).toBe('anki');

            (controller as unknown as { index: number }).index = 3;
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, cards[3]!);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(root.querySelector('[data-newtab-status] .jpdb-reader-newtab-status-light')).toBeNull();
            expect(newTabSourceSelect(root).value).toBe('dictionary');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('labels the shared API source toggle as Jiten when only Jiten SRS is configured', () => {
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        });
        const card = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki' });
        const root = renderSeededNewTabWord(controller, card, {
            allWords: [card],
            visibleWords: [card],
            sourceLabel: 'Anki',
            state: { source: 'anki' },
        });

        try {
            const status = newTabStatusButton(root);

            expect(status.textContent).not.toContain('Anki');
            expect(status.textContent).not.toContain('⇄');
            expect(status.disabled).toBe(true);
            const select = newTabSourceSelect(root);
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('anki');
            expect(newTabSourceSelectValues(root)).toContain('jpdb');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps the Anki switch indicator on Jiten-labeled API cards', () => {
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const card = newTabTestCard({
            spelling: '百科事典',
            reading: 'ひゃっかじてん',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
        });
        const root = renderSeededNewTabWord(controller, card, {
            allWords: [card],
            visibleWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Jiten',
            state: { source: 'jpdb' },
        });

        try {
            const status = newTabStatusButton(root);

            expect(status.textContent).not.toContain('⇄');
            expect(status.disabled).toBe(true);
            const select = newTabSourceSelect(root);
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('jpdb');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
            expect(newTabSourceSelectValues(root)).toContain('anki');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('renders SRS session progress and timer labels while navigating left and right', () => {
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

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            const progress = root.querySelector<HTMLElement>('[data-newtab-count]')!;
            expect(progress.textContent).toMatch(/^Done 0 · Left 2 · Due 2 · \d\d:\d\d · 0\/60 min$/);
            expect(progress.dataset.sessionCompletedReviews).toBe('0');
            expect(progress.dataset.sessionRemainingCards).toBe('2');
            expect(progress.dataset.sessionRemainingDueCards).toBe('2');
            expect(progress.dataset.sessionElapsed).toMatch(/^\d\d:\d\d$/);
            expect(progress.dataset.sessionJpdbAvailable).toBe('true');
            expect(progress.dataset.sessionJpdbRemainingCards).toBe('2');

            internals.showNextWord();

            expect(internals.index).toBe(1);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 2 · Due 2 · \d\d:\d\d · 0\/60 min$/);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('日本語');

            internals.showPreviousWord();

            expect(internals.index).toBe(0);
            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 2 · Due 2 · \d\d:\d\d · 0\/60 min$/);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('復習');
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps orphaned session clocks from rewriting replacement new-tab roots', () => {
        vi.useFakeTimers();
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const staleController = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        });
        const activeController = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        });
        const staleCards = [
            newTabTestCard({ vid: 101, spelling: '古い', reading: 'ふるい', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] }),
            newTabTestCard({ vid: 102, spelling: '小さい', reading: 'ちいさい', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] }),
        ];
        const activeCards = Array.from({ length: 4 }, (_, index) => newTabTestCard({
            vid: 201 + index,
            spelling: `新${index + 1}`,
            reading: `しん${index + 1}`,
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        }));
        const staleRoot = renderSeededNewTabWord(staleController, staleCards[0]!, {
            allWords: staleCards,
            visibleWords: staleCards,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            appendToDocument: true,
        });
        staleRoot.remove();
        const activeRoot = renderSeededNewTabWord(activeController, activeCards[0]!, {
            allWords: activeCards,
            visibleWords: activeCards,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            appendToDocument: true,
        });

        try {
            vi.advanceTimersByTime(1000);

            expect(activeRoot.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 4 · Due 4 · \d\d:\d\d · 0\/60 min$/);
            expect(activeRoot.querySelector('[data-newtab-count]')?.textContent).not.toContain('Left 2');
        } finally {
            staleController.destroy();
            activeController.destroy();
            activeRoot.remove();
        }
    });

    it('does not show raw queue ordinals for deep SRS review queues', async () => {
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const cards = Array.from({ length: 539 }, (_, index) => newTabTestCard({
            vid: index + 1,
            sid: 1,
            spelling: `語${index + 1}`,
            reading: `ご${index + 1}`,
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            cardState: ['due'],
        }));
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
        const current = cards[359]!;
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const loadWordsInto = vi.fn(async () => {});
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            loadWordsInto: typeof loadWordsInto;
        };
        try {
            Object.assign(internals, {
                allWords: cards,
                visibleWords: cards,
                index: 359,
                reviewCountMode: true,
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
                loadWordsInto,
            });
            internals.bindRootEvents(root);
            internals.renderWord(root, current);

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('');
            expect(newTabSourceSelect(root).value).toBe('jpdb');
            expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 0 · Left 539 · Due 539 · \d\d:\d\d · 0\/60 min$/);
            expect(root.textContent).not.toContain('360 / 539');

            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();

            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(current, 'okay');
                expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^Done 1 · Left 538 · Due 538 · \d\d:\d\d · 0\/60 min$/);
                expect(root.textContent).not.toContain('360 / 539');
                expect(root.textContent).not.toContain('360 / 538');
            });
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps SRS intervals off the visible new-tab grade button labels', () => {
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
        expect(buttons.map(button => button.querySelector('.jpdb-reader-newtab-grade-label')?.textContent)).toEqual(['Again', 'Hard', 'Good']);
        expect(mount.querySelector('.jpdb-reader-newtab-grade-interval')).toBeNull();
        expect(buttons[0]?.getAttribute('aria-label')).toBe('Again, 1m: Grades Anki');
        expect(buttons[0]?.title).toBe('Grades Anki · 1m');
    });

    it('renders mixed JPDB and Anki grading target selection as one compact row', () => {
        const mount = document.createElement('div');
        mount.append(...renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['fail', 'Fail'], ['pass', 'Pass']],
            selectorLabel: 'Target',
            selectedOption: {
                id: 'both',
                kind: 'both',
                label: 'Grades JPDB + Anki card: Core #404',
                shortLabel: 'Both',
            },
            summary: summarizeNewTabReviewSources(['jpdb-api', 'anki']),
            targetLabel: 'Grades JPDB + Anki card: Core #404',
            targetOptions: [
                { id: 'both', kind: 'both', label: 'Grades JPDB + Anki card: Core #404', shortLabel: 'Both' },
                { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
                { id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 },
            ],
        }));

        const targetRows = mount.querySelectorAll('[data-newtab-grade-target]');
        const select = mount.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]');
        expect(targetRows).toHaveLength(1);
        expect(targetRows[0]).toBeInstanceOf(HTMLDetailsElement);
        expect((targetRows[0] as HTMLDetailsElement).open).toBe(false);
        expect(mount.querySelectorAll('[data-newtab-grade-target-selector]')).toHaveLength(1);
        expect(mount.querySelector('.jpdb-reader-newtab-grade-target-summary')).not.toBeNull();
        expect(select?.closest('.jpdb-reader-newtab-grade-target-panel')).not.toBeNull();
        expect(mount.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Both');
        expect(mount.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
        expect(mount.querySelector('[data-newtab-grade-target]')?.classList.contains('jpdb-reader-newtab-grade-target-context')).toBe(true);
        expect(select?.selectedOptions[0]?.textContent).toBe('Both');
        expect(select?.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades JPDB + Anki card: Core #404');
        expect(Array.from(mount.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]')).map(button => button.querySelector('.jpdb-reader-newtab-grade-label')?.textContent)).toEqual(['Fail', 'Pass']);
    });

    it('wires card.reviewGradeIntervals into the main new-tab grade bar', () => {
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'Jiten',
            bothLabel: 'Both',
            grades: [['fail', 'Fail'], ['okay', 'Pass']],
            intervals: {
                fail: { buttonLabel: '10m' },
                okay: { buttonLabel: '+3d' },
            },
            selectorLabel: 'Grade target',
            selectedOption: undefined,
            summary: '',
            targetLabel: 'Grades Jiten',
            targetOptions: [],
        } as never);
        const gradeButtons = buttons.filter(node => node.matches?.('[data-newtab-action="grade"]')) as HTMLButtonElement[];

        expect(gradeButtons.map(button => button.dataset.gradeInterval)).toEqual(['10m', '+3d']);
        expect(gradeButtons[0]?.getAttribute('aria-label')).toContain('10m');
        expect(gradeButtons[1]?.title).toContain('+3d');
    });

    it('gates swipe grades on the revealed answer: pre-reveal drags navigate steps, revealed swipes grade', async () => {
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
                    state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: false },
                });
                internals.bindRootEvents(root);
                internals.renderWord(root, current);

                // Answer hidden on a mid-flow step: a horizontal swipe now walks
                // the study steps rather than grading. It must engage navigation
                // and must NEVER submit a grade for an unseen answer (grading an
                // unrevealed card would corrupt the provider's SRS state).
                const navigateStudyStep = vi.spyOn(
                    controller as unknown as { navigateStudyStep(direction: string): boolean },
                    'navigateStudyStep',
                );
                dispatchPointerSwipe(root.querySelector<HTMLElement>('[data-newtab-study]')!, window, deltaX);
                await Promise.resolve();
                await Promise.resolve();
                expect(navigateStudyStep).toHaveBeenCalledWith(deltaX < 0 ? 'next' : 'previous');
                expect(reviewCard).not.toHaveBeenCalled();
                navigateStudyStep.mockRestore();

                // Reveal the answer on the final-reveal step: the same swipe grades.
                internals.state.revealAnswer = true;
                internals.state.mode = 'word';
                internals.renderWord(root, current);
                dispatchPointerSwipe(root.querySelector<HTMLElement>('[data-newtab-study]')!, window, deltaX);
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
        expectNewTabPromptText('日本語');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(listNewTabCards).toHaveBeenCalledTimes(1);
        const status = newTabStatusButton();
        expect(status.textContent).not.toContain('⇄');
        expect(status.disabled).toBe(true);
        expect(status.closest('[data-newtab-controls]')).toBeNull();
        expect(Array.from(document.querySelectorAll<HTMLElement>('[data-newtab-controls] [data-newtab-action]'))
            .map(element => element.dataset.newtabAction)).toEqual(['previous', 'next']);
        expect(newTabSourceSelect().hidden).toBe(false);
        expect(newTabSourceSelect().value).toBe('jpdb');
        expect(newTabSourceSelectValues()).toContain('anki');

        switchNewTabSource('anki');
        await expectNewTabSourcePrompt(settings, 'anki', '暗記');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(listNewTabCards).toHaveBeenCalledTimes(1);
        expect(newTabSourceSelect().value).toBe('anki');
        expect(newTabSourceSelectValues()).toContain('jpdb');

        switchNewTabSource('jpdb');
        await expectNewTabSourcePrompt(settings, 'jpdb', '日本語');
        expect(listDeckCards).toHaveBeenCalledTimes(1);
        expect(newTabSourceSelect().value).toBe('jpdb');

        switchNewTabSource('anki');
        await expectNewTabSourcePrompt(settings, 'anki', '暗記');
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
            expectNewTabPromptText('日本語');
            expect(newTabSourceSelectValues()).toContain('anki');

            const internals = controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            };
            internals.state = { ...internals.state, source: 'anki' };
            switchNewTabSource('anki');

            await expectNewTabSourcePrompt(settings, 'anki', '暗記');
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(listNewTabCards).toHaveBeenCalledOnce();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('stamps deck-scoped jpdb-api cards with the Part-of-deck membership line (SH-4)', async () => {
        resetNewTabReviewStorage();
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '世界', reading: 'せかい', cardState: ['due'], vid: 31, source: 'jpdb', reviewSource: 'jpdb-api' }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabJpdbDeck: '92',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => [{ id: '92', name: 'Persona 5' }]) } as never,
        });
        try {
            await controller.renderPage();
            const internals = controller as unknown as { allWords: Array<{ spelling: string; jpdbDeckMembership?: string }> };
            await waitForExpect(() => {
                const card = internals.allWords.find(word => word.spelling === '世界');
                expect(card?.jpdbDeckMembership).toBe('Part of the Persona 5 deck');
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('renders the Part-of-deck line for Anki and Jiten cards from their own deck data', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        try {
            const internals = controller as unknown as { providerDeckMembershipLine(card: JPDBCard): string };
            const ankiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiDeckNames: ['Core 2k'] });
            expect(internals.providerDeckMembershipLine(ankiCard)).toBe('Part of the Core 2k deck');
            const jitenCard = newTabTestCard({ spelling: '辞典', reading: 'じてん', source: 'jiten', reviewSource: 'jiten-api', sourceDeckName: 'ペルソナ5' });
            expect(internals.providerDeckMembershipLine(jitenCard)).toBe('Part of the ペルソナ5 deck');
            const plain = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
            expect(internals.providerDeckMembershipLine(plain)).toBe('');
        } finally {
            controller.destroy();
        }
    });

    it('filters the Word-tab pool with the JPDB-style Show-only state filter', async () => {
        resetNewTabReviewStorage();
        const listDeckCards = vi.fn(async () => [
            newTabTestCard({ spelling: '読む', reading: 'よむ', cardState: ['known'], vid: 11, source: 'jpdb', reviewSource: 'jpdb-api' }),
            newTabTestCard({ spelling: '書く', reading: 'かく', cardState: ['due'], vid: 12, source: 'jpdb', reviewSource: 'jpdb-api' }),
        ]);
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
        }, {
            jpdb: { listDeckCards, listDecks: vi.fn(async () => []) } as never,
        });
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-filter-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                expect([...select.options].map(option => option.value)).toContain('known');
            });
            // The default scheduled queue hides the known card.
            expectNewTabPromptText('書く');

            select.value = 'known';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            const internals = controller as unknown as { visibleWords: Array<{ spelling: string }> };
            await waitForExpect(() => {
                expect(internals.visibleWords.map(card => card.spelling)).toEqual(['読む']);
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('hides the Show-only state filter when no provider credential exists (keyless)', async () => {
        resetNewTabReviewStorage();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: '', jitenApiKey: '', ankiEnabled: false });
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-filter-select]')!;
            // Keyless cards carry no provider states, so the filter would
            // only ever hide everything (user-reported confusion).
            expect(select.hidden).toBe(true);
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('broadcasts the refreshed card state after a live-bridge grade when an API key exists (mutation-bus P0)', async () => {
        vi.useFakeTimers();
        const refreshCardState = vi.fn(async (card: JPDBCard) => { card.cardState = ['known']; });
        const grade = vi.fn();
        const requestCurrent = vi.fn();
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key' }, {
            jpdb: { refreshCardState } as never,
            jpdbReviewBridge: { onUpdate: () => () => {}, latestStatus: () => ({ connected: true }), grade, requestCurrent } as never,
        });
        try {
            const internals = controller as unknown as {
                submitLiveJpdbGrade(card: JPDBCard, grade: JPDBGrade): void;
                publishGradedCardState(card: JPDBCard): void;
            };
            const published: string[] = [];
            internals.publishGradedCardState = card => { published.push(card.cardState.join(',')); };
            const card = newTabTestCard({ vid: 2850623, sid: 1446586255, spelling: '出来事', reading: 'できごと', cardState: ['due'], source: 'jpdb', reviewSource: 'jpdb-live' });

            internals.submitLiveJpdbGrade(card, 'okay');
            expect(grade).toHaveBeenCalledWith('okay');
            await vi.advanceTimersByTimeAsync(1000);

            expect(refreshCardState).toHaveBeenCalledWith(card);
            // Broadcast carries the TRUE post-grade state read back from jpdb.
            expect(published).toEqual(['known']);
        } finally {
            controller.destroy();
            vi.useRealTimers();
        }
    });

    it('extracts real vid/sid from the live bridge card id so the refresh can target it', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        try {
            const internals = controller as unknown as { cardFromLiveJpdb(card: { kind: string; id: string; spelling: string; reading: string }): JPDBCard | null };
            const card = internals.cardFromLiveJpdb({ kind: 'vocabulary', id: 'vf,2850623,1446586255', spelling: '出来事', reading: 'できごと' });
            expect(card?.vid).toBe(2850623);
            expect(card?.sid).toBe(1446586255);
            const unparsable = internals.cardFromLiveJpdb({ kind: 'vocabulary', id: '出来事:できごと', spelling: '出来事', reading: 'できごと' });
            expect(unparsable?.vid).toBe(0);
        } finally {
            controller.destroy();
        }
    });

    it('derives kanji study cards from Anki source cards, keeping the Anki linkage (kanji-extraction verify)', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        try {
            const internals = controller as unknown as { kanjiStudyCardsFromSourceCards(cards: JPDBCard[]): JPDBCard[] };
            const wordCard = newTabTestCard({ vid: -1, sid: -1, rid: 401, ankiCardId: 401, spelling: '暗記', reading: 'あんき', cardState: ['due'], source: 'anki', reviewSource: 'anki' });
            // RTK-style standalone kanji note stays a standalone kanji card.
            const rtkCard = newTabTestCard({ vid: -2, sid: -2, rid: 402, ankiCardId: 402, spelling: '記', reading: 'き', cardState: ['known'], source: 'anki', reviewSource: 'anki', kanjiKeyword: 'scribe' });
            const kanjiCards = internals.kanjiStudyCardsFromSourceCards([wordCard, rtkCard]);

            expect(kanjiCards.map(card => card.spelling).sort()).toEqual(['暗', '記']);
            const dark = kanjiCards.find(card => card.spelling === '暗')!;
            // Word-derived kanji keep the Anki linkage for details/back-nav…
            expect(dark.ankiCardId).toBe(401);
            expect(dark.source).toBe('anki');
            // …but are not themselves gradeable review cards (the Anki card
            // is the word, not the kanji).
            expect(dark.reviewSource).toBeUndefined();
            // The standalone RTK note wins the dedup for 記 and keeps its keyword.
            const scribe = kanjiCards.find(card => card.spelling === '記')!;
            expect(scribe.ankiCardId).toBe(402);
            expect(scribe.kanjiKeyword).toBe('scribe');
        } finally {
            controller.destroy();
        }
    });

    it('scopes the Anki queue to the deck chosen in the in-page deck selector (SH-6 Anki)', async () => {
        resetNewTabReviewStorage();
        const { listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('anki');
        const internals = controller as unknown as { dependencies: { anki: { invoke?: (action: string) => Promise<string[]> } } };
        internals.dependencies.anki.invoke = vi.fn(async () => ['Core', 'Mining']);
        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                expect([...select.options].map(option => option.value)).toContain('Core');
            });
            select.value = 'Core';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForExpect(() => {
                expect(listNewTabCards).toHaveBeenCalledWith(expect.anything(), 'Core');
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps the JPDB deck selector populated while deck options are fetching', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            newTabJpdbDeck: 'deck',
        };
        const decks = deferred<Array<{ id: string; name: string; vocabularyCount?: number; knownCoverage?: number }>>();
        const controller = newTabPromptController(settings);
        const internals = controller as unknown as {
            dependencies: { jpdb: { listDecks?: () => Promise<Array<{ id: string; name: string; vocabularyCount?: number; knownCoverage?: number }>> } };
            populateDeckSelector(select: HTMLSelectElement, settings: NewTabSettings): Promise<void>;
        };
        internals.dependencies.jpdb.listDecks = vi.fn(() => decks.promise);
        const select = document.createElement('select');
        document.body.append(select);

        try {
            const populate = internals.populateDeckSelector(select, settings);
            expect([...select.options].map(option => option.value)).toEqual(['deck']);
            expect(select.textContent).toBe('deck');
            expect(select.value).toBe('deck');

            decks.resolve([{ id: 'deck', name: '誕生日', vocabularyCount: 39, knownCoverage: 65.12 }]);
            await populate;

            expect([...select.options].map(option => option.textContent)).toContain('誕生日 · 39 · 65%');
            expect(select.value).toBe('deck');
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('scopes the study queue to the deck chosen in the in-page deck selector (SH-6)', async () => {
        resetNewTabReviewStorage();
        const { listDeckCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');
        const internals = controller as unknown as { dependencies: { jpdb: { listDecks?: () => Promise<Array<{ id: string; name: string }>> } } };
        internals.dependencies.jpdb.listDecks = vi.fn(async () => [{ id: '89', name: '誕生日', vocabularyCount: 39, knownCoverage: 65.12 }]);

        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                const labels = [...select.options].map(option => option.textContent);
                expect(labels).toContain('All vocabulary');
                // jpdb Learn parity: deck entries carry their progress.
                expect(labels).toContain('誕生日 · 39 · 65%');
            });
            // Initial load used the settings deck.
            expect(listDeckCards).toHaveBeenCalledWith('deck', expect.anything(), expect.anything());

            select.value = '89';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await waitForExpect(() => {
                expect(listDeckCards).toHaveBeenCalledWith('89', expect.anything(), expect.anything());
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('scopes the study queue to a Jiten deck from the in-page deck selector', async () => {
        resetNewTabReviewStorage();
        const first = newTabTestCard({
            spelling: '日本語',
            reading: 'にほんご',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 0,
        });
        const second = newTabTestCard({
            spelling: '勉強',
            reading: 'べんきょう',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 43,
            jitenReadingIndex: 0,
        });
        const listStudyBatchCards = vi.fn(async () => [first, second]);
        const listStudyDecks = vi.fn(async () => [{ id: '7', name: 'Persona' }]);
        const studyDeckWordKeys = vi.fn(async () => new Set(['43:0']));
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jiten: { listStudyBatchCards, listStudyDecks, studyDeckWordKeys, reviewCard: vi.fn() } as never,
        });

        try {
            await controller.renderPage();
            const select = document.querySelector<HTMLSelectElement>('[data-newtab-deck-select]')!;
            await waitForExpect(() => {
                expect(select.hidden).toBe(false);
                expect([...select.options].map(option => option.value)).toContain('jiten:7');
            });

            select.value = 'jiten:7';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            await waitForExpect(() => {
                expect(studyDeckWordKeys).toHaveBeenCalledWith(7);
                expect(newTabPromptText()).toBe('勉強');
            });
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('loads all Jiten study deck vocabulary for the Search tab source filters', async () => {
        resetNewTabReviewStorage();
        const deckCards = [
            newTabTestCard({
                spelling: '日本語',
                reading: 'にほんご',
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 42,
                jitenReadingIndex: 0,
                cardState: ['new'],
            }),
            newTabTestCard({
                spelling: '復習',
                reading: 'ふくしゅう',
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 43,
                jitenReadingIndex: 0,
                cardState: ['mature'],
            }),
        ];
        const listStudyBatchCards = vi.fn(async () => [deckCards[0]!]);
        const listStudyDecks = vi.fn(async () => [{ id: 7, name: 'Vocab 2k' }]);
        const listStudyDeckVocabularyCards = vi.fn(async () => deckCards);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jiten: { listStudyBatchCards, listStudyDecks, listStudyDeckVocabularyCards, reviewCard: vi.fn() } as never,
        });
        const internals = controller as unknown as {
            state: {
                mode: 'search';
                sort: 'random';
                filter: 'study';
                source: 'jpdb';
                revealAnswer: false;
                jpdbDeck: string;
                ankiDeck: string;
                keyHintsDismissed: false;
            };
            loadBrowsePool(): Promise<JPDBCard[]>;
        };

        try {
            internals.state = {
                mode: 'search',
                sort: 'random',
                filter: 'study',
                source: 'jpdb',
                revealAnswer: false,
                jpdbDeck: '',
                ankiDeck: '',
                keyHintsDismissed: false,
            };

            const cards = await internals.loadBrowsePool();

            expect(cards.map(card => card.spelling)).toEqual(['日本語', '復習']);
            expect(cards.every(card => card.sourceDeckName === 'Vocab 2k')).toBe(true);
            expect(listStudyDeckVocabularyCards).toHaveBeenCalledWith(7, NEW_TAB_BROWSE_DECK_LIMIT);
            expect(listStudyBatchCards).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            resetNewTabReviewStorage();
        }
    });

    it('refreshes Jiten deck options when a legacy Jiten API key changes', async () => {
        resetNewTabReviewStorage();
        let settings: NewTabSettings = {
            ...DEFAULT_SETTINGS,
            apiKey: 'ak_old-jiten-key',
            jitenApiKey: '',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        };
        const listStudyDecks = vi.fn()
            .mockResolvedValueOnce([{ id: 7, name: 'Old Persona' }])
            .mockResolvedValueOnce([{ id: 8, name: 'New Persona' }]);
        const controller = newTabBareController(() => settings, {
            jiten: { listStudyDecks, listStudyBatchCards: vi.fn(async () => []), reviewCard: vi.fn() } as never,
        });
        const internals = controller as unknown as {
            populateDeckSelector(select: HTMLSelectElement, settings: NewTabSettings): Promise<void>;
        };
        const select = document.createElement('select');
        document.body.append(select);

        try {
            await internals.populateDeckSelector(select, settings);
            expect([...select.options].map(option => option.value)).toContain('jiten:7');

            settings = { ...settings, apiKey: 'ak_new-jiten-key' };
            await internals.populateDeckSelector(select, settings);

            expect(listStudyDecks).toHaveBeenCalledTimes(2);
            expect([...select.options].map(option => option.value)).toContain('jiten:8');
            expect([...select.options].map(option => option.value)).not.toContain('jiten:7');
        } finally {
            document.body.replaceChildren();
            resetNewTabReviewStorage();
        }
    });

    it('advertises grading keys on the study controls like jpdb.io and Jiten (SH-8)', () => {
        const buttons = renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['nothing', 'Nothing'], ['something', 'Something'], ['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy']],
            selectorLabel: 'Grade target',
            keyHints: { nothing: '1', something: '2', hard: '3', okay: '4', easy: '5' },
            selectedOption: undefined,
            summary: '',
            targetLabel: 'Grades JPDB',
            targetOptions: [],
        } as never);
        const gradeButtons = buttons.filter(node => node.matches?.('[data-newtab-action="grade"]')) as HTMLButtonElement[];
        // Defaults still show the familiar rendered-order digits.
        expect(gradeButtons.map(button => button.querySelector('.jpdb-reader-newtab-key-hint')?.textContent)).toEqual(['1', '2', '3', '4', '5']);
        // Hints stay out of the accessible name (digit order is positional).
        expect(gradeButtons[0]?.querySelector('.jpdb-reader-newtab-key-hint')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('advertises Space on the active Study control', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
        });
        try {
            expect(root.querySelector('[data-newtab-action="next"] .jpdb-reader-newtab-key-hint')?.textContent).toBe('Space');
        } finally {
            controller.destroy();
        }
    });

    it('hides reveal shortcut hints when Study shortcut hints are disabled', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabShortcutHintsEnabled: false }, {});
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
        });
        try {
            expect(root.querySelector('[data-newtab-action="next"] .jpdb-reader-newtab-key-hint')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('does not render reveal shortcut hints on touch-only devices', () => {
        const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
        Object.defineProperty(globalThis, 'matchMedia', {
            configurable: true,
            value: (query: string) => ({
                matches: query === '(pointer: coarse)' || query === '(hover: none)',
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            } as unknown as MediaQueryList),
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, {});
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'local' });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { source: 'dictionary', revealAnswer: false },
        });
        try {
            expect(root.querySelector('[data-newtab-action="next"] .jpdb-reader-newtab-key-hint')).toBeNull();
        } finally {
            controller.destroy();
            root.remove();
            if (originalMatchMedia) Object.defineProperty(globalThis, 'matchMedia', originalMatchMedia);
            else Reflect.deleteProperty(globalThis, 'matchMedia');
        }
    });

    it('renders the Composed-of component-kanji line on revealed word backs (SH-4)', async () => {
        const rtkLookup = vi.fn(async (kanji: string) => kanji === '日' ? { keyword: 'day' } : null);
        const jpdbKanjiLookup = vi.fn(async (kanji: string) => kanji === '本' ? { keyword: 'book' } : null);
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            rtk: { lookup: rtkLookup } as never,
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
        });
        const card = newTabTestCard({ spelling: '日本', reading: 'にほん', source: 'jpdb', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
            appendToDocument: true,
        });
        try {
            const row = root.querySelector<HTMLElement>('[data-newtab-composed-of]')!;
            expect(row).not.toBeNull();
            const chips = [...row.querySelectorAll<HTMLElement>('[data-kanji]')];
            expect(chips.map(chip => chip.dataset.kanji)).toEqual(['日', '本']);
            // Chips reuse the kanji popover action for drilldown.
            expect(chips[0].dataset.action).toBe('kanji');
            await waitForExpect(() => {
                expect(row.textContent).toContain('day');
                expect(row.textContent).toContain('book');
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('composed-of chips open the kanji popover in place, keeping the studied card', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const showKanjiCard = vi.fn();
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: [],
        }, {
            showKanjiCard,
            rtk: { lookup: vi.fn(async () => null) } as never,
            dictionaries: { lookupKanji: vi.fn(async () => []), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
        });
        const card = newTabTestCard({ spelling: '日本', reading: 'にほん', source: 'jpdb', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
            studyStepId: 'final-reveal',
            appendToDocument: true,
            bindRootEvents: true,
        });
        try {
            const chip = root.querySelector<HTMLButtonElement>('[data-newtab-composed-of] [data-kanji="本"]')!;
            expect(chip).not.toBeNull();
            chip.click();
            // The kanji surfaces in the standard anchored popover; the study card
            // stays put — no disruptive swap to a synthetic kanji queue.
            expect(showKanjiCard).toHaveBeenCalledTimes(1);
            expect(showKanjiCard.mock.calls[0][1]).toBe('本');
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(false);
            const state = (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state;
            expect(state.mode).toBe('word');
            expect(state.revealAnswer).toBe(true);
        } finally {
            controller.destroy();
            document.body.replaceChildren();
            restoreCanvas();
        }
    });

    it('skips the Composed-of line for kana-only words', () => {
        const controller = newTabPromptController(DEFAULT_SETTINGS, {
            rtk: { lookup: vi.fn(async () => null) } as never,
        });
        const card = newTabTestCard({ spelling: 'よむ', reading: 'よむ', source: 'jpdb', cardState: ['due'] });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
        });
        try {
            expect(root.querySelector('[data-newtab-composed-of]')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('does not reuse a stale JPDB cache entry when switching to Anki', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
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

            switchNewTabSource('anki');

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(listNewTabCards).toHaveBeenCalledOnce();
                expect(newTabSourceSelect().value).toBe('anki');
                expectNewTabPromptText('暗記');
            }, 3000);
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(newTabSourceSelectValues()).toContain('jpdb');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse an unreachable empty Anki cache entry when switching from JPDB', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('jpdb');

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
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

            switchNewTabSource('anki');

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(listNewTabCards).toHaveBeenCalledOnce();
                expectNewTabPromptText('暗記');
            }, 3000);
            expect(listDeckCards).toHaveBeenCalledOnce();
            expect(newTabSourceSelectValues()).toContain('jpdb');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse an empty Anki cache entry when switching from JPDB to Anki fallback words', async () => {
        resetNewTabReviewStorage();
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
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '日本語', reading: 'にほんご', source: 'jpdb', reviewSource: 'jpdb-api' });
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

        try {
            await controller.renderPage();
            expectNewTabPromptText('日本語');
            const internals = controller as unknown as {
                sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean } }>;
                sourceCacheSignature(source: 'anki'): string;
            };
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [],
                    sourceLabel: 'Anki',
                    reviewCountMode: true,
                },
            });

            switchNewTabSource('anki');

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(newTabPromptText()).toBe('書く');
                expect(newTabSourceSelect().value).toBe('anki');
                expect(newTabSourceSelectValues()).toContain('jpdb');
            }, 3000);
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('does not reuse cached Anki cards after Anki mining is disabled', async () => {
        resetNewTabReviewStorage();
        const settings = {
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki' as const,
            immersionKitEnabled: false,
        };
        const staleAnkiCard = newTabTestCard({ spelling: '暗記', reading: 'あんき', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const localCard = newTabTestCard({ spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const listNewTabCards = vi.fn(async () => [staleAnkiCard]);
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabLocalFallbackController(() => settings, localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
        });
        const internals = controller as unknown as {
            sourceResultCache: Map<string, { signature: string; result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode: boolean } }>;
            sourceCacheSignature(source: 'anki'): string;
            loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
        };

        try {
            internals.sourceResultCache.set('anki', {
                signature: internals.sourceCacheSignature('anki'),
                result: {
                    cards: [staleAnkiCard],
                    sourceLabel: 'Anki',
                    reviewCountMode: true,
                },
            });
            settings.ankiEnabled = false;

            const result = await internals.loadWords();

            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.reviewCountMode).toBe(false);
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('switches from Anki to JPDB when saved source state is already stale JPDB', async () => {
        resetNewTabReviewStorage();
        const { settings, listDeckCards, listNewTabCards, controller } = newTabJpdbAnkiSourceFixture('anki');

        try {
            await controller.renderPage();
            expectNewTabPromptText('暗記');
            expect(newTabSourceSelectValues()).toContain('jpdb');

            const internals = controller as unknown as {
                state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            };
            internals.state = { ...internals.state, source: 'jpdb' };
            switchNewTabSource('jpdb');

            await expectNewTabSourcePrompt(settings, 'jpdb', '日本語');
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
            ankiEnabled: true,
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const root = renderEnabledNewTabRoot(controller);
        const card = jpdbAnkiReviewCard();
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
        expectNewTabMergedStatusSelect('jpdb', 'anki', root);

        internals.state = { ...internals.state, source: 'anki' };
        internals.sourceLabel = 'JPDB + Anki';
        internals.renderWord(root, card);

        expectNewTabMergedStatusSelect('anki', 'jpdb', root);
    });

    it('switches between the rendered JPDB and Anki sources through the source dropdown', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            jpdbMiningEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            immersionKitEnabled: false,
        });
        const card = jpdbAnkiReviewCard();
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

            // The select is the ONE switcher while a card is shown; the pill
            // is pure status (disabled, no source-toggle action).
            const firstStatus = newTabStatusButton(root);
            expect(firstStatus.disabled).toBe(true);
            expect(firstStatus.dataset.newtabAction).toBeUndefined();
            const firstSelect = newTabSourceSelect(root);
            expect(firstSelect.hidden).toBe(false);
            expect(firstSelect.value).toBe('jpdb');
            expect(newTabSourceSelectValues(root)).toContain('anki');
            switchNewTabSource('anki', root);
            expect(switched).toEqual(['anki']);

            expect(newTabSourceSelect(root).value).toBe('anki');
            switchNewTabSource('jpdb', root);
            expect(switched).toEqual(['anki', 'jpdb']);
        } finally {
            root.remove();
        }
    });

    it('toggles from the visible source when selected source state is stale', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
        });
        const root = renderEnabledNewTabRoot(controller);
        const card = jpdbAnkiReviewCard();
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
        expectNewTabMergedStatusSelect('anki', 'jpdb', root);
    });

    it('offers both JPDB and Anki in the dropdown for a visible JPDB card when Anki is selected', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'anki',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
        });
        const card = jpdbAnkiReviewCard();
        const root = renderNewTabCardFront(controller, card, {
            sort: 'random',
            source: 'anki',
            sourceLabel: '',
        });

        expectNewTabMergedStatusSelect('anki', 'jpdb', root);
    });

    it('falls back to study words when the status footer toggles to unavailable Anki', async () => {
        resetNewTabReviewStorage();
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
        expect(newTabSourceSelect().value).toBe('jpdb');
        expect(newTabSourceSelectValues()).toContain('anki');

        switchNewTabSource('anki');

        await waitForExpect(() => expect(settings.newTabSource).toBe('anki'));
        await expectNewTabDictionaryCard('書く', document, null);
        expect(newTabSourceSelect().value).toBe('dictionary');
        expect(listNewTabCards).toHaveBeenCalledOnce();
        expect(listRandomTopTerms).toHaveBeenCalled();

        resetNewTabReviewStorage();
    });

    it('falls back to study words when explicitly opening an unavailable Anki source', async () => {
        resetNewTabReviewStorage();
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

            await expectNewTabDictionaryCard('書く', document, 'Dictionary');
            expect(listNewTabCards).toHaveBeenCalledOnce();
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('retries unavailable Anki and falls back to study words after auto review loads JPDB first', async () => {
        resetNewTabReviewStorage();
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
        expect(newTabPromptText()).toBe('日本語');
        expect(listNewTabCards).toHaveBeenCalledOnce();
        expect(newTabSourceSelect().value).toBe('jpdb');
        expect(newTabSourceSelectValues()).toContain('anki');

        switchNewTabSource('anki');

        await waitForExpect(() => expect(settings.newTabSource).toBe('anki'));
        await expectNewTabDictionaryCard('書く', document, null);
        expect(newTabSourceSelect().value).toBe('dictionary');
        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalled();

        resetNewTabReviewStorage();
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

            expect(newTabPromptText(root)).toBe('一番');
            expect(root.querySelector('[data-newtab-status]')?.textContent).toContain('Dictionary');
            expect(root.querySelector('[data-newtab-status]')?.textContent).not.toContain('Looking for more words');
        } finally {
            root.remove();
        }
    });

    it('keeps the Anki-only status pill inert and lists sources only in the dropdown', () => {
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
        expect(status.textContent).toBe('1 / 1');
        expect(status.dataset.newtabAction).toBeUndefined();
        expect(status.dataset.sourceToggleTarget).toBeUndefined();
        expect(status.title).toBe('');
        expect(status.disabled).toBe(true);
        expect(newTabSourceSelect(root).value).toBe('anki');
        // The dropdown lists Dictionary as an explicit destination — unlike
        // the old cycle-toggle, picking it is a deliberate choice, not a
        // misleading implied alternative.
        expect(newTabSourceSelectValues(root)).toEqual(['anki', 'dictionary']);
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

            expect(newTabPromptText()).toBe('見る');
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
            ankiEnabled: true,
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

            expect(newTabSourceSelectValues(root)).toContain('anki');

            switchNewTabSource('anki', root);

            await waitForExpect(() => {
                expect(settings.newTabSource).toBe('anki');
                expect(newTabPromptText(root)).toBe('読む');
                expect(newTabSourceSelect(root).value).toBe('dictionary');
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
            expect(newTabPromptText()).toBe('暗記');
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

    it('falls back to study words instead of JPDB when switching explicitly from JPDB to an empty Anki queue', async () => {
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
        expect(newTabPromptText()).toBe('日本語');
        listRandomTopTerms.mockClear();

        switchNewTabSource('anki');
        await waitForExpect(() => {
            expect(settings.newTabSource).toBe('anki');
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).not.toBe('日本語');
            expect(newTabSourceSelect().value).toBe('anki');
        });

        expect(listNewTabCards).toHaveBeenCalledTimes(2);
        expect(document.querySelector('[data-newtab-prompt]')?.textContent).not.toBe('日本語');
        expect(newTabSourceSelectValues()).toContain('jpdb');

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
        const jiten = rows.find(row => row.name === 'Jiten');
        expect(jpdb).toBeTruthy();
        expect(jpdb?.enabled).toBe(false);
        expect(jiten).toBeTruthy();
        expect(jiten?.enabled).toBe(true);
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
        resetNewTabReviewStorage();
        const jpdbCard = newTabTestCard({ vid: 1, sid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const dictionaryCard = newTabTestCard({ vid: -2, sid: 0, spelling: '書く', reading: 'かく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => [newTabLocalDictionaryEntry('書く', 'かく', 'to write')]);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                newTabSource: 'jpdb',
                newTabJpdbDeck: 'deck',
                newTabJpdbReviewMode: 'api-vocabulary',
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
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
        expectNewTabPromptText('読む');
        expect(listRandomTopTerms).not.toHaveBeenCalled();

        advanceNewTabStudyCard(document, 3);
        expectNewTabPromptText('読む');

        resetNewTabReviewStorage();
    });

    it('loads another dictionary batch when next reaches the end of the visible queue', async () => {
        resetNewTabReviewStorage();
        const batches = [
            [newTabLocalDictionaryEntry('読む', 'よむ', 'to read')],
            [newTabLocalDictionaryEntry('書く', 'かく', 'to write')],
        ];
        const listRandomTopTerms = vi.fn(async () => batches.shift() ?? []);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                newTabSource: 'dictionary',
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
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
        expectNewTabPromptText('読む');

        advanceNewTabStudyCard(document, 3);

        await waitForExpect(() => {
            expectNewTabPromptText('書く');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む', '書く']);
        });
        expect(listRandomTopTerms).toHaveBeenCalledTimes(2);

        resetNewTabReviewStorage();
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

            showNextNewTabWord(controller);

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

    it('loads Anki new-tab reviews when Anki is enabled', async () => {
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
                ankiEnabled: true,
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
                expect(newTabPromptText()).toBe('暗記');
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
        expect(newTabPromptText()).toBe('暗記');

        showNextNewTabWord(controller);

        await waitForExpect(() => {
            expect(newTabPromptText()).toBe('例文');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['暗記', '例文']);
        });
        expect(listNewTabCards).toHaveBeenNthCalledWith(1, 180, undefined);
        expect(listNewTabCards).toHaveBeenNthCalledWith(2, 181, undefined);

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

    it('loads Jiten SRS cards through the new-tab API source with a legacy Jiten key', async () => {
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
            apiKey: 'ak_legacy-jiten-key',
            jitenApiKey: '',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
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

    it('keeps Jiten-only API source from being preempted by live JPDB review', async () => {
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
        const requestCurrent = vi.fn();
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'auto',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => newTabLiveVocabularyStatus(),
                requestCurrent,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([['日本語', 'jiten-api']]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
        expect(listDeckCards).not.toHaveBeenCalled();
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('keeps the active Jiten API source from being preempted by a stale JPDB key', async () => {
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
        const requestCurrent = vi.fn();
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key-left-from-old-settings',
            jitenApiKey: 'ak_active-jiten-key',
            jpdbMiningEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'auto',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => newTabLiveVocabularyStatus(),
                requestCurrent,
            } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([['日本語', 'jiten-api']]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
        expect(requestCurrent).not.toHaveBeenCalled();
    });

    it('falls back to study words when the configured Jiten SRS queue is empty', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '余白', reading: 'よはく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['余白', 'よはく', 'blank space']));
        const listStudyBatchCards = vi.fn(async () => [] as JPDBCard[]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            ankiEnabled: true,
            newTabAnkiEnabled: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(listStudyBatchCards).toHaveBeenCalledWith(180);
            expect(result.cards.map(card => card.spelling)).toEqual(['余白']);
            expect(result.sourceLabel).toBe('Jiten');
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();

            await controller.renderPage();

            const status = newTabStatusButton();
            expect(status.textContent).not.toContain('⇄');
            expect(status.textContent).not.toContain('JPDB');
            expect(status.disabled).toBe(true);
            const select = newTabSourceSelect();
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('jpdb');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
            expect(newTabSourceSelectValues()).toContain('anki');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('resolves Jiten-only practice fallback words through the Jiten API so grades stay available', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '余白', reading: 'よはく', source: 'local', reviewSource: 'dictionary' });
        const jitenCard = newTabTestCard({
            vid: 420,
            sid: 0,
            rid: 0,
            spelling: '余白',
            reading: 'よはく',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 420,
            jitenReadingIndex: 0,
            cardState: ['in-deck'],
        });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['余白', 'よはく', 'blank space']));
        const listStudyBatchCards = vi.fn(async () => [] as JPDBCard[]);
        const parse = vi.fn(async (terms: string[]) => terms.map(term => term === '余白' ? [newTabSentenceToken(jitenCard, term)] : []));
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            jpdb: { listDeckCards: vi.fn(async () => [] as JPDBCard[]) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn(), parse } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(parse).toHaveBeenCalledWith(['余白', 'よはく']);
            expect(result.sourceLabel).toBe('Jiten');
            expect(result.reviewCountMode).toBe(false);
            expect(result.cards).toEqual([expect.objectContaining({
                spelling: '余白',
                source: 'jiten',
                reviewSource: 'jiten-api',
                jitenWordId: 420,
                cardState: ['in-deck'],
            })]);

            const root = renderSeededNewTabWord(controller, result.cards[0]!, {
                sourceLabel: result.sourceLabel,
                state: { revealAnswer: true },
            });
            expect(Array.from(root.querySelectorAll<HTMLButtonElement>('[data-grade]')).map(button => button.dataset.grade)).toEqual([
                'nothing',
                'something',
                'hard',
                'okay',
                'easy',
            ]);
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Jiten');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('keeps auto Jiten-only fallback from fetching or labeling JPDB', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '文脈', reading: 'ぶんみゃく', source: 'local', reviewSource: 'dictionary' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['文脈', 'ぶんみゃく', 'context']));
        const listStudyBatchCards = vi.fn(async () => [] as JPDBCard[]);
        const listDeckCards = vi.fn(async () => [] as JPDBCard[]);
        const listNewTabCards = vi.fn(async () => [] as JPDBCard[]);
        const publicSearch = vi.fn(async () => [newTabTestCard({ spelling: '公開', reading: 'こうかい', source: 'jpdb' })]);
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdb: { listDeckCards } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        try {
            const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

            expect(result.cards.map(card => card.spelling)).toEqual(['文脈']);
            expect(result.sourceLabel).toBe('Jiten');
            expect(result.reviewCountMode).toBe(false);
            expect(listStudyBatchCards).toHaveBeenCalledWith(180);
            expect(listDeckCards).not.toHaveBeenCalled();
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(publicSearch).not.toHaveBeenCalled();

            await controller.renderPage();

            const status = newTabStatusButton();
            expect(status.textContent).not.toContain('JPDB');
            expect(status.dataset.sourceToggleTarget).toBeUndefined();
            const select = newTabSourceSelect();
            expect(select.hidden).toBe(false);
            expect(select.value).toBe('dictionary');
            expect(select.querySelector<HTMLOptionElement>('option[value="jpdb"]')?.textContent).toBe('Jiten');
            expect(newTabSourceSelectValues()).not.toContain('anki');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('loads Jiten cards through the auto new-tab review source', async () => {
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
        const listStudyBatchCards = vi.fn(async () => [jitenCard]);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            newTabSource: 'auto',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            anki: { listNewTabCards: vi.fn(async () => []) } as never,
            jpdb: { listDeckCards: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
            jpdbReviewBridge: disconnectedJpdbReviewBridge(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards).toEqual([expect.objectContaining({
            spelling: '日本語',
            source: 'jiten',
            reviewSource: 'jiten-api',
        })]);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('interleaves Jiten and JPDB SRS cards through the shared new-tab API source', async () => {
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
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jitenApiKey: 'jiten-key',
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten + JPDB');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => [card.spelling, card.reviewSource])).toEqual([
            ['日本語', 'jiten-api'],
            ['復習', 'jpdb-api'],
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
        const controller = newTabApiSourceController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'jiten-key',
            jpdbMiningEnabled: false,
            newTabSource: 'jpdb',
            newTabJpdbReviewMode: 'api-vocabulary',
            immersionKitEnabled: false,
        }, {
            jpdb: { listDeckCards: vi.fn(async () => []) } as never,
            jiten: { listStudyBatchCards, reviewCard: vi.fn() } as never,
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Jiten');
        expect(result.reviewCountMode).toBe(true);
        expect(result.cards.map(card => card.reviewSource)).toEqual(['jiten-api']);
        expect(listStudyBatchCards).toHaveBeenCalledWith(180);
    });

    it('keeps locked JPDB API cards in deck order and makes them gradeable when kanji unlock is off', async () => {
        const locked = newTabTestCard({ spelling: '未解禁', reading: 'みかいきん', source: 'jpdb', cardState: ['locked'] });
        const due = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'jpdb', cardState: ['due'] });
        const reviewCard = vi.fn(async () => undefined);
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                // The jpdb-parity default replaces locked words with kanji
                // unlock cards (covered in parity-matrix); this test pins the
                // kanji-off path where locked words study directly as words.
                newTabKanjiUnlockEnabled: false,
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
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();

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

    it('uses built-in starter words for no-key JPDB new-tab fallback without public JPDB requests', async () => {
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
        const fallbackCardFromText = vi.fn((text: string) => newTabTestCard({
            spelling: text,
            reading: '',
            source: 'fallback',
            reviewSource: 'dictionary',
        }));
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
            parser: { fallbackCardFromText } as never,
            dictionaries: {
                summary: vi.fn(async () => newTabEmptyDictionarySummary()),
            } as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }> }).loadWords();

        expect(result.sourceLabel).toBe('Starter words');
        expect(result.reviewCountMode).toBe(false);
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.cards.every(card => card.source === 'fallback')).toBe(true);
        expect(lookup).not.toHaveBeenCalled();
        expect(publicSearch).not.toHaveBeenCalled();
        expect(fallbackCardFromText).toHaveBeenCalled();
    });

    it('uses local dictionary fallback without public JPDB when no API key is configured', async () => {
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
        const controller = newTabPublicFallbackController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), publicSearch, {
            jpdbKanji: { lookup: kanjiLookup } as never,
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
        });

        const result = await (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();

        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(publicSearch).not.toHaveBeenCalled();
        expect(kanjiLookup).not.toHaveBeenCalled();
        expect(result.sourceLabel).toBe('Dictionary');
        expect(result.cards.every(card => card.source === 'local')).toBe(true);
        expect(result.cards.map(card => card.spelling)).toEqual(['書く', '見る']);
    });

    it('shows dictionary fallback cards without waiting for slow public JPDB cards', async () => {
        vi.useFakeTimers();
        const publicSearch = vi.fn(async (query: string) => {
            await new Promise(resolve => setTimeout(resolve, 2000));
            return [newTabTestCard({ spelling: `${query}公開`, reading: `${query}こうかい`, source: 'jpdb' })];
        });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['書く', 'かく', 'to write']));
        const controller = newTabPublicFallbackController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                newTabSource: 'jpdb',
                newTabJpdbReviewMode: 'api-vocabulary',
            }), publicSearch, {
            parser: {
                localCardFromEntry: vi.fn(newTabLocalCardFromEntry),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    ...newTabTermDictionarySummary(),
                })),
                listRandomTopTerms,
            } as never,
        });

        try {
            const resultPromise = (controller as unknown as { loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> }).loadWords();
            await vi.advanceTimersByTimeAsync(1000);
            const result = await resultPromise;

            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(publicSearch).not.toHaveBeenCalled();

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
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.sourceLabel).toBe('JPDB + Dictionary');
        expect(result.reviewCountMode).toBe(false);
        expect(publicSearch).toHaveBeenCalled();
        expect(listRandomTopTerms).toHaveBeenCalled();
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
        expect(root.querySelector('[data-newtab-action="reveal"]')?.firstChild?.textContent).toBe('Hide');
        expect(root.querySelector('[data-newtab-action="next"]')).not.toBeNull();
    });

    it('keeps undo on the Previous control without rendering a separate undo button', () => {
        const card = newTabTestCard({
            spelling: '辞典',
            reading: 'じてん',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 42,
            jitenReadingIndex: 0,
        });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                jitenApiKey: 'jiten-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                immersionKitEnabled: false,
            }), {
            jiten: { listStudyBatchCards: vi.fn(), reviewCard: vi.fn(), undoReview: vi.fn() } as never,
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Jiten',
            state: { mode: 'word', revealAnswer: false },
            appendToDocument: true,
        });
        Object.assign(controller as unknown as { lastUndoableReview?: { card: JPDBCard; at: number; serverUndo: boolean; counted: boolean } }, {
            lastUndoableReview: { card, at: Date.now(), serverUndo: true, counted: true },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-action="undo-review"]')).toBeNull();
            expect(root.querySelector('[data-newtab-action="previous"]')).not.toBeNull();
            expect(root.querySelector('[data-newtab-action="next"]')).not.toBeNull();
        } finally {
            root.remove();
        }
    });

    it('marks two-button study-step navigation for equal-width controls', () => {
        const card = newTabTestCard({ spelling: '図鑑', reading: 'ずかん' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: false,
                newTabStudyDisabledSteps: ['recall-cloze', 'listen-pitch', 'speaking'],
            }));
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionary',
            state: { mode: 'word', revealAnswer: false },
        });

        try {
            const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
            const actions = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-controls] [data-newtab-action]'))
                .map(button => button.dataset.newtabAction);

            expect(controls?.dataset.newtabGradeControls).toBe('false');
            expect(controls?.dataset.newtabControlCount).toBe('2');
            expect(actions).toEqual(['previous', 'next']);
        } finally {
            root.remove();
        }
    });

    it('leaves Previous as a no-op on the first card when there is no undo review', () => {
        const first = newTabTestCard({ spelling: '一', reading: 'いち' });
        const second = newTabTestCard({ spelling: '二', reading: 'に' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                immersionKitEnabled: false,
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
            }));
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second],
            sourceLabel: 'Dictionary',
            state: { mode: 'word', revealAnswer: false },
            appendToDocument: true,
            bindRootEvents: true,
        });

        try {
            root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('一');
        } finally {
            root.remove();
        }
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

    it('marks two-button Study controls with pass/fail layout metadata', () => {
        const card = newTabTestCard({ spelling: '安定', reading: 'あんてい', source: 'jpdb', reviewSource: 'jpdb-api' });
        const controller = newTabBareController(() => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                jpdbMiningEnabled: true,
                enableReviews: true,
                twoButtonReviews: true,
            }));
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: true },
        });

        try {
            const controls = root.querySelector<HTMLElement>('[data-newtab-controls]');
            const gradeButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]'));

            expect(controls?.dataset.newtabGradeControls).toBe('true');
            expect(controls?.dataset.newtabGradeCount).toBe('2');
            expect(controls?.dataset.newtabGradeScale).toBe('pass-fail');
            expect(gradeButtons.map(button => button.dataset.grade)).toEqual(['fail', 'pass']);
        } finally {
            root.remove();
        }
    });

    it('queues offline JPDB grades without returning navigation to the graded card', async () => {
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
                newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
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
            bindRootEvents: true,
        });

        await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

        const queue = readNewTabGradeQueue();
        expect(queue).toHaveLength(1);
        expect(queue[0]).toMatchObject({ target: 'jpdb-api', grade: 'okay', attempts: 0 });
        expect(queue[0]?.card.spelling).toBe('安定');
        expect(reviewCard).not.toHaveBeenCalled();
        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む']);
        expect(newTabPromptText(root)).toContain('読む');
        root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();
        expect(newTabPromptText(root)).toContain('読む');
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

    it('reviews Anki new-tab cards when Anki is enabled', async () => {
        const card = newTabTestCard({ spelling: '復習', reading: 'ふくしゅう', source: 'anki', reviewSource: 'anki', ankiCardId: 404 });
        const answerCard = vi.fn(async () => {});
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
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
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Anki #404');
            expect(root.querySelector('[data-newtab-grade-target]')?.getAttribute('aria-label')).toBe('Grades Anki card: Anki #404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();

            await (controller as unknown as { gradeCurrentCard(grade: 'pass'): Promise<void> }).gradeCurrentCard('pass');

            expect(answerCard).toHaveBeenCalledWith(404, 'pass');
        } finally {
            root.remove();
        }
    });

    it('never restores a consumed Bunpro review through local undo or browser-back state', async () => {
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '7701',
            bunproReviewableId: 8801,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '44',
            bunproReviewInputMode: 'regular',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        });
        const review = vi.fn(async () => ({}));
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: {
                srsAdapters: { bunpro: { hasCredential: () => true, review } as never },
            },
        });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            undoLastReview(root: HTMLElement): Promise<void>;
            canUndoLastReview(): boolean;
            lastUndoableReview?: { card: JPDBCard };
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
        };
        internals.loadWordsInto = reload;

        try {
            expect((controller as unknown as { reviewTargetsForCard(card: JPDBCard): string[] }).reviewTargetsForCard(card)).toEqual(['bunpro-api']);
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(true);
            expect(review).toHaveBeenCalledOnce();
            expect(internals.lastUndoableReview).toBeUndefined();
            expect(internals.canUndoLastReview()).toBe(false);

            await internals.undoLastReview(root);
            window.dispatchEvent(new PopStateEvent('popstate'));
            await Promise.resolve();

            expect(review).toHaveBeenCalledOnce();
            expect(internals.allWords).not.toContain(card);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('retires an ambiguously submitted Bunpro review and reloads before it can be graded twice', async () => {
        const card = newTabTestCard({
            spelling: '文法',
            reading: 'ぶんぽう',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '99001',
            bunproReviewableId: 9901,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '45',
            bunproReviewInputMode: 'regular',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        });
        const response = deferred<boolean>();
        const review = vi.fn(async () => {
            await response.promise;
            throw new Error('response lost after submit');
        });
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: {
                srsAdapters: { bunpro: { hasCredential: () => true, review } as never },
            },
        });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
        };
        internals.loadWordsInto = reload;

        try {
            expect((controller as unknown as { reviewTargetsForCard(card: JPDBCard): string[] }).reviewTargetsForCard(card)).toEqual(['bunpro-api']);
            const firstGrade = internals.gradeCurrentCard('pass');
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(false);
            expect(review).toHaveBeenCalledOnce();
            response.resolve(true);
            await expect(firstGrade).resolves.toBe(true);
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(false);

            expect(review).toHaveBeenCalledOnce();
            expect(reload).toHaveBeenCalledOnce();
            expect(internals.allWords).toEqual([]);
            expect(internals.visibleWords).toEqual([]);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('retires a Bunpro obligation from another Study tab before accepting more input', async () => {
        document.body.replaceChildren();
        const card = newTabTestCard({
            spelling: '同期',
            reading: 'どうき',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '99002',
            bunproReviewableId: 9902,
            bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '46',
            bunproReviewInputMode: 'regular',
            bunproReviewEndpoint: 'review',
            cardState: ['due'],
        });
        const review = vi.fn(async () => ({}));
        const { controller, root } = newTabVisibleWordFixture(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
        }), {
            card,
            allWords: [card],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: {
                srsAdapters: { bunpro: { hasCredential: () => true, review } as never },
            },
        });
        const reloadGate = deferred<boolean>();
        const reload = vi.fn(async () => { await reloadGate.promise; });
        const internals = controller as unknown as {
            refreshBunproQueueAfterExternalGrade(): Promise<void>;
            gradeCurrentCard(grade: 'pass'): Promise<boolean>;
            loadWordsInto: typeof reload;
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            setStudyStepOverrideForCurrentCard(id: string): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        internals.loadWordsInto = reload;
        internals.setStudyStepOverrideForCurrentCard('final-reveal');
        internals.renderWord(root, card);

        try {
            const refresh = internals.refreshBunproQueueAfterExternalGrade();
            expect(root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="grade"]:disabled').length).toBeGreaterThan(0);
            await expect(internals.gradeCurrentCard('pass')).resolves.toBe(false);
            expect(review).not.toHaveBeenCalled();
            expect(internals.allWords).toEqual([]);
            expect(internals.visibleWords).toEqual([]);

            reloadGate.resolve(true);
            await refresh;
            expect(reload).toHaveBeenCalledOnce();
            expect(review).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('refuses stale Bunpro lookup and doodle callbacks after the queue changes cards', async () => {
        const previous = newTabTestCard({
            spelling: '同じ', reading: 'おなじ', source: 'bunpro', reviewSource: 'bunpro-api',
            bunproReviewId: '1001', bunproReviewableId: 2001, bunproReviewableType: 'vocabulary',
            bunproReviewSessionId: '47', bunproReviewInputMode: 'regular', bunproReviewEndpoint: 'review', cardState: ['due'],
        });
        const current = newTabTestCard({
            ...previous,
            bunproReviewId: '1002',
            bunproReviewableId: 2002,
            bunproReviewSessionId: '48',
        });
        const settings = {
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproFrontendApiTokenExpiresAt: '2999-01-01T00:00:00.000Z',
            bunproMiningEnabled: true,
            enableReviews: true,
            newTabKanjiAutoSubmit: true,
            immersionKitEnabled: false,
        };
        const review = vi.fn(async () => ({}));
        const { controller, root } = newTabVisibleWordFixture(settings, {
            card: current,
            allWords: [current],
            reviewCountMode: true,
            sourceLabel: 'Bunpro',
            source: 'bunpro',
            controllerOverrides: { srsAdapters: { bunpro: { hasCredential: () => true, review } as never } },
        });

        try {
            await expect(controller.gradeFromLookup('pass', { kind: 'bunpro' }, previous))
                .resolves.toEqual({ preserveLookup: false });
            (controller as unknown as {
                autoSubmitDoodleAssessment(settings: typeof DEFAULT_SETTINGS, passed: boolean, expectedCard: JPDBCard): void;
            }).autoSubmitDoodleAssessment(settings, true, previous);
            await Promise.resolve();

            expect(review).not.toHaveBeenCalled();
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords).toEqual([current]);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('supersedes an initial Bunpro load when an external grade arrives before cards render', async () => {
        document.body.replaceChildren();
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            bunproFrontendApiToken: 'bunpro-token',
            bunproMiningEnabled: true,
        }), {
            srsAdapters: { bunpro: { hasCredential: () => true } as never },
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const reload = vi.fn(async () => undefined);
        const internals = controller as unknown as {
            state: { source: string; revealAnswer: boolean };
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            loadWordsInto: typeof reload;
            refreshBunproQueueAfterExternalGrade(): Promise<void>;
        };
        Object.assign(internals, {
            state: { ...((controller as unknown as { state: object }).state), source: 'bunpro', revealAnswer: false },
            allWords: [],
            visibleWords: [],
            loadWordsInto: reload,
        });

        try {
            await internals.refreshBunproQueueAfterExternalGrade();
            expect(reload).toHaveBeenCalledWith(root, true, { useOfflineCache: false });
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('maps doodle auto-submit to Bunpro regular and FSRS outcomes', () => {
        const controller = newTabBareController();
        const gradeCurrentCard = vi.fn(async (_grade: JPDBGrade, _target?: unknown, _card?: JPDBCard) => true);
        const internals = controller as unknown as {
            state: { revealAnswer: boolean };
            gradeCurrentCard: typeof gradeCurrentCard;
            autoSubmitDoodleAssessment(settings: typeof DEFAULT_SETTINGS, passed: boolean, expectedCard: JPDBCard): void;
        };
        internals.state = { ...internals.state, revealAnswer: true };
        internals.gradeCurrentCard = gradeCurrentCard;
        const regular = newTabTestCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewInputMode: 'regular' });
        const fsrs = newTabTestCard({ source: 'bunpro', reviewSource: 'bunpro-api', bunproReviewInputMode: 'fsrs' });
        const settings = { ...DEFAULT_SETTINGS, enableReviews: true, newTabKanjiAutoSubmit: true };

        internals.autoSubmitDoodleAssessment(settings, true, regular);
        internals.autoSubmitDoodleAssessment(settings, false, regular);
        internals.autoSubmitDoodleAssessment(settings, true, fsrs);
        internals.autoSubmitDoodleAssessment(settings, false, fsrs);

        expect(gradeCurrentCard.mock.calls.map(([grade]) => grade)).toEqual(['pass', 'fail', 'okay', 'nothing']);
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
                ankiEnabled: true,
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
        expectNewTabStatusSources(['jpdb', 'anki']);
        resetNewTabReviewStorage();
    });

    it('merges live JPDB review cards with matching Anki cards so grading hits both backends', async () => {
        resetNewTabReviewStorage();
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
                ankiEnabled: true,
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
            expect(newTabStatusButton().textContent).toContain('JPDB + Anki');

            await (controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<void> }).gradeCurrentCard('okay');

            expect(grade).toHaveBeenCalledWith('okay');
            expect(requestCurrent).toHaveBeenCalled();
            expect(answerCard).toHaveBeenCalledWith(404, 'okay');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('submits one new-tab grade to both JPDB and Anki when a review card has both targets', async () => {
        const { card, reviewCard, answerCard, controller, root } = renderJpdbAnkiReviewWordFixture();

        try {
            const targetSelect = root.querySelector<HTMLSelectElement>('[data-newtab-grade-target-select]');
            expect(targetSelect?.selectedOptions[0]?.textContent).toBe('Both');
            expect(targetSelect?.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades JPDB + Anki card: Core #404');
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Both');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();

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
            expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual([
                'Both',
                'JPDB',
                'Core #404',
                'Core #405',
            ]);
            expect(targetSelect.value).toBe('both');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Both');

            targetSelect.value = 'jpdb';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(targetSelect.selectedOptions[0]?.textContent).toBe('JPDB');
            expect(root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.getAttribute('aria-label')).toBe('Okay: Grades JPDB');
            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();

            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(card, 'okay');
            });
            expect(answerCard).not.toHaveBeenCalled();

            targetSelect.value = 'anki:405';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(targetSelect.selectedOptions[0]?.textContent).toBe('Core #405');
            expect(targetSelect.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades Anki card: Core #405');
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
                ankiEnabled: true,
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
            expect(Array.from(targetSelect.options).map(option => option.textContent)).toEqual([
                'RRTK · Recognition #404',
                'Core · Production #405',
            ]);
            expect(targetSelect.value).toBe('anki:404');
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(root.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('RRTK · Recognition #404');
            expect(newTabSourceSelect(root).value).toBe('anki');
            expect(root.querySelector('[data-newtab-status]')?.textContent).not.toContain('JPDB');

            targetSelect.value = 'anki:405';
            targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
            expect(root.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
            expect(targetSelect.selectedOptions[0]?.textContent).toBe('Core · Production #405');
            expect(targetSelect.selectedOptions[0]?.dataset.newtabGradeTargetLabel).toBe('Grades Anki card: Core · Production #405');
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
                ankiEnabled: true,
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
                ankiEnabled: true,
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
            expect(newTabPromptText()).toBe('次回');
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

        expect(newTabPromptText(root)).toBe('次');
        expect(reload).toHaveBeenCalledWith(root, true, {
            useOfflineCache: false,
            quiet: true,
            excludeCardKeys: [cardKey(graded)],
            preserveVisibleOrder: true,
        });
    });

    it('undoes the grade locally when Previous is pressed right after grading (UT-58)', async () => {
        document.querySelectorAll('[data-jpdb-reader-root].jpdb-reader-newtab').forEach(root => root.remove());
        const graded = newTabTestCard({ vid: 1, sid: 1, spelling: '採点', reading: 'さいてん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const next = newTabTestCard({ vid: 2, sid: 1, spelling: '次', reading: 'つぎ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const reviewCard = vi.fn(async () => {});
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        }, {
            jpdb: { reviewCard } as never,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
        const loadWordsInto = vi.fn(async () => {});
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            renderWord(root: HTMLElement, card: JPDBCard): void;
            loadWordsInto: typeof loadWordsInto;
        };
        try {
            Object.assign(internals, {
                allWords: [graded, next],
                visibleWords: [graded, next],
                index: 0,
                reviewCountMode: true,
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
                loadWordsInto,
            });
            internals.bindRootEvents(root);
            internals.renderWord(root, graded);

            root.querySelector<HTMLButtonElement>('[data-grade="okay"]')?.click();
            await waitForExpect(() => {
                expect(reviewCard).toHaveBeenCalledWith(graded, 'okay');
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('次');
            });

            // UT-58: Previous right after a grade IS the undo gesture — the
            // graded card returns to the front (locally for JPDB: the
            // upstream review stands) and the session counter walks back.
            root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('採点');
            });
            expect(reviewCard).toHaveBeenCalledTimes(1);
            expect(root.querySelector<HTMLElement>('[data-newtab-count]')?.dataset.sessionCompletedReviews).toBe('0');
            // With the undo consumed, Previous is plain navigation again.
            showNextNewTabWord(controller);
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('次');
            });
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('keeps undo on the Previous control without rendering a separate undo button', () => {
        const graded = newTabTestCard({ vid: 1, sid: 1, spelling: '採点', reading: 'さいてん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const current = newTabTestCard({ vid: 2, sid: 1, spelling: '次', reading: 'つぎ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        }));
        const root = renderSeededNewTabWord(controller, current, {
            allWords: [current],
            visibleWords: [current],
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: true },
        });
        const internals = controller as unknown as {
            lastUndoableReview?: { card: JPDBCard; at: number; serverUndo: boolean; counted: boolean };
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        try {
            internals.lastUndoableReview = { card: graded, at: Date.now(), serverUndo: false, counted: true };
            internals.renderWord(root, current);

            expect(root.querySelector('[data-newtab-action="undo-review"]')).toBeNull();
            expect(root.querySelectorAll('[data-grade]').length).toBeGreaterThan(0);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('leaves Previous as a no-op on the first card when there is no undo review', () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '最初', reading: 'さいしょ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const second = newTabTestCard({ vid: 2, sid: 1, spelling: '最後', reading: 'さいご', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabBareController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: 'jpdb-key',
            jpdbMiningEnabled: true,
            enableReviews: true,
            immersionKitEnabled: false,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        }));
        const root = renderSeededNewTabWord(controller, first, {
            allWords: [first, second],
            visibleWords: [first, second],
            index: 0,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            state: { source: 'jpdb', revealAnswer: false },
            appendToDocument: true,
            bindRootEvents: true,
        });
        try {
            expect(root.querySelector('[data-newtab-action="previous"]')).not.toBeNull();

            root.querySelector<HTMLButtonElement>('[data-newtab-action="previous"]')?.click();

            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('最初');
            expect((controller as unknown as { index: number }).index).toBe(0);
        } finally {
            controller.destroy();
            root.remove();
        }
    });

    it('continues to the following review card after grading the middle of the queue', () => {
        const previous = newTabTestCard({ vid: 1, sid: 1, spelling: '前', reading: 'まえ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const graded = newTabTestCard({ vid: 2, sid: 1, spelling: '採点', reading: 'さいてん', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const next = newTabTestCard({ vid: 3, sid: 1, spelling: '次', reading: 'つぎ', source: 'jpdb', reviewSource: 'jpdb-api', cardState: ['due'] });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', jpdbMiningEnabled: true, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
        const reload = vi.fn();
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            reviewCountMode: boolean;
            sourceLabel: string;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
            loadWordsInto: typeof reload;
        }, {
            allWords: [previous, graded, next],
            visibleWords: [previous, graded, next],
            index: 1,
            reviewCountMode: true,
            sourceLabel: 'JPDB',
            state: { mode: 'word', sort: 'random', filter: 'study', source: 'jpdb', revealAnswer: true },
            loadWordsInto: reload,
        });

        (controller as unknown as { advanceAfterGrade(root: HTMLElement, card: JPDBCard): void }).advanceAfterGrade(root, graded);

        expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('次');
        expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['前', '次']);
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
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                newTabKanjiAutogradeEnabled: true,
                newTabStudyStepOrder: BASE_DEFAULT_SETTINGS.newTabStudyStepOrder,
                newTabStudyDisabledSteps: [],
            }),
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

    it('drops a stale kanji SVG enrichment so the previous kanji never fills the next step ghost', () => {
        const controller = newTabBareController();
        const answer = document.createElement('div');
        answer.innerHTML = `
            <div class="jpdb-reader-doodle-stage" data-kanji="鑑">
                <div class="jpdb-reader-doodle-ghost" data-newtab-doodle-ghost></div>
            </div>
        `;
        const ghost = answer.querySelector<HTMLElement>('[data-newtab-doodle-ghost]')!;
        const applySvg = (kanji: string) => (controller as unknown as {
            applyEnrichedKanjiSvg(answer: HTMLElement | null, kanji: string, svg: string | undefined): void;
        }).applyEnrichedKanjiSvg(answer, kanji, '<svg class="jpdb-reader-kanjivg-svg"><g><path d="M0 0L1 1"></path></g></svg>');

        applySvg('図');
        expect(ghost.querySelector('svg')).toBeNull();

        applySvg('鑑');
        expect(ghost.querySelector('svg')).not.toBeNull();
    });

    it('fronts the blanked cloze WITHOUT the word meaning on the kanji front', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({
            vid: 20,
            sid: 20,
            spelling: '播く',
            reading: 'まく',
            meanings: [{ glosses: ['5-dan transitive kana to sow to plant to seed to sow'], partOfSpeech: [] }],
        });
        try {
            const { root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
            });

            // The blanked cloze fronts immediately, but the word meaning must
            // NOT: it is the answer to the session's word step (owner: "showing
            // 'time ＿＿' gives away the answer for the next part"). The meaning
            // stays reachable behind the Hint button.
            const promptText = root.querySelector('[data-newtab-prompt]')?.textContent ?? '';
            expect(promptText).not.toContain('to sow');
            expect(promptText).toContain('＿く');
            expect(promptText).not.toContain('5-dan transitive');
            expect(promptText).toContain('Hint');

            lookup.resolve({ kanji: '播', keyword: 'disseminate', meanings: ['disseminate'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('JPDB');
                expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('disseminate');
            });
        } finally {
            restoreCanvas();
        }
    });

    it('drops a kanji keyword that merely restates the fronted word meaning', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({
            vid: 21,
            sid: 21,
            spelling: '飲み物',
            reading: 'のみもの',
            meanings: [{ glosses: ['drink'], partOfSpeech: [] }],
        });
        try {
            const { root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
            });
            lookup.resolve({ kanji: '飲', keyword: 'drink', meanings: ['drink'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await waitForExpect(() => {
                const prompt = root.querySelector('[data-newtab-prompt]');
                expect(prompt?.querySelector('.jpdb-reader-newtab-kanji-front-context')).not.toBeNull();
            });
            const prompt = root.querySelector('[data-newtab-prompt]');
            expect(prompt?.textContent).toContain('＿み＿');
            // The context row already fronts "drink" — a "JPDB drink" pill below
            // would be pure repetition.
            expect(prompt?.querySelectorAll('.jpdb-reader-newtab-kanji-front-keyword:not(.jpdb-reader-newtab-kanji-front-context)').length).toBe(0);
        } finally {
            restoreCanvas();
        }
    });

    it('hydrates 川 kanji study cards from JPDB facts instead of showing missing-keyword states', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const jpdbKanjiLookup = vi.fn(async () => ({
            kanji: '川',
            keyword: 'river',
            frequency: 'Top 300',
            type: 'Joyo',
            kanken: '10',
            heisig: '#127',
            oldForms: [],
            readings: [
                { reading: 'かわ', share: '77%', common: true },
                { reading: 'セン', share: '23%', common: true },
            ],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [{ expression: '川辺', reading: 'かわべ', meaning: 'riverside', url: 'https://jpdb.io/vocabulary/1/川辺/かわべ' }],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const card = newTabTestCard({
            spelling: '川',
            reading: '川',
            meanings: [],
            source: 'jpdb',
            kanjiKeyword: '',
        });
        try {
            const { root: frontRoot } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            });

            await waitForExpect(() => {
                const prompt = frontRoot.querySelector('[data-newtab-prompt]')?.textContent ?? '';
                expect(prompt).toContain('JPDB');
                expect(prompt).toContain('river');
                expect(prompt).not.toContain('No kanji keyword found');
            });
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('川');
            frontRoot.remove();

            const { root: answerRoot } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            }, { revealAnswer: true });

            await waitForExpect(() => {
                const meaning = answerRoot.querySelector('[data-newtab-meaning]')?.textContent ?? '';
                expect(meaning).toContain('JPDB');
                expect(meaning).toContain('Keywordriver');
                expect(meaning).toContain('かわ 77%');
                expect(meaning).toContain('川辺');
                expect(meaning).not.toContain('Kanji details are not available yet');
            });
            answerRoot.remove();
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
        try {
            const { root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(async () => ({ kanji: '柔', keyword: 'gentle', meanings: ['gentle'], readings: [], components: [], vocabulary: [], frequencyRank: null })) } as never,
                rtk: { lookup: vi.fn(async () => ({ kanji: '柔', keyword: 'tenderness', frameNumber: '2042', onYomi: '', kunYomi: '', elements: '', componentKanji: [], heisigStory: '', heisigComment: '', koohiiStories: [] })) } as never,
                dictionaries: { lookupKanji: vi.fn(async () => [{ character: '柔', onyomi: [], kunyomi: [], tags: [], meanings: ['soft', 'flexible', 'yielding'], dictionary: 'KANJIDIC' }]), lookupSimilarTermsByKanji: vi.fn(async () => []) } as never,
            }, {}, { corsProxyUrl: 'https://proxy.example/fetch' });

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
        const current = newTabTestCard({ vid: 10, sid: 10, spelling: '月', reading: 'つき', kanjiKeyword: 'moon' });
        const other = newTabTestCard({ vid: 11, sid: 11, spelling: '胸', reading: 'むね', kanjiKeyword: 'chest' });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            newTabKanjiAutogradeEnabled: false,
            newTabStudyDisabledSteps: [],
        }, {
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

            root.querySelector<HTMLButtonElement>('[data-study-step-kind="kanji-doodle"]')?.click();

            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('10:10:月:つき');
            expect(root.classList.contains('jpdb-reader-newtab-kanji-mode')).toBe(true);
            expect(root.querySelector('[data-newtab-prompt]')?.textContent).toContain('moon');
        } finally {
            restoreCanvas();
        }
    });

    it('renders the word front as a large keyword with the sentence below', () => {
        const sentence = '難波金満(なにわきんまん)高校 生徒会長 宝多金男(かねお)や';
        const card = newTabTestCard({ spelling: '難波', reading: 'なにわ', sentence, source: 'anki', pitchAccent: ['LHH'] });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false });

        const root = renderNewTabCardFront(controller, card, { studyStepId: 'final-reveal' });

        const prompt = root.querySelector<HTMLElement>('[data-newtab-prompt]');
        const promptTerm = prompt?.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word');
        expect(promptTerm?.dataset.expression).toBe('難波');
        expect(promptTerm?.dataset.reading).toBe('なにわ');
        expect(promptTerm?.querySelector('rt')).toBeNull();
        expect(promptTerm?.dataset.pitchClass).toBeUndefined();
        expect(promptTerm?.classList.contains('jpdb-pitch-heiban')).toBe(false);
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe(sentence);
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.textContent).toBe('難波');
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence .jpdb-reader-word')?.classList.contains('jpdb-pitch-heiban')).toBe(false);
    });

    it('omits the prompt sentence after reveal when Immersion Kit owns the example below', () => {
        const sentence = 'この忙しいのに映画？ 堕落ね';
        const card = newTabTestCard({ spelling: '映画', reading: 'えいが', sentence });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: true });
        const front = renderSeededNewTabWord(controller, card);
        const back = renderSeededNewTabWord(controller, card, {
            state: { revealAnswer: true },
        });

        try {
            expect(front.querySelector('.jpdb-reader-newtab-sentence')?.textContent).toBe(sentence);
            expect(back.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
            expect(back.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term')?.textContent).toContain('映画');
        } finally {
            front.remove();
            back.remove();
        }
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
            expect(audio?.querySelector('svg')).not.toBeNull();
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

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(card.pitchAccent).toEqual(['LHHHH']);
            });
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(false);
            expect(word.dataset.pitchClass).toBeUndefined();
            expectRevealedPromptPitch(controller, card, 'heiban');
            expect(lookupTermMeta).toHaveBeenCalledWith('計量', 12, expect.any(Array));
        } finally {
            root.remove();
        }
    });

    it('does not let slow local metadata block new-tab public pitch fallback', async () => {
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', pitchAccent: [] });
        const localMeta = deferred<never[]>();
        const lookupTermMeta = vi.fn(() => localMeta.promise);
        const publicPitch = vi.fn(async () => ['HLL']);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false, showPitchAccent: true }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
                expect(card.pitchAccent).toEqual(['HLL']);
            });
            expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(false);
            expect(word.dataset.pitchClass).toBeUndefined();
            expectRevealedPromptPitch(controller, card, 'atamadaka');
        } finally {
            localMeta.resolve([]);
            root.remove();
        }
    });

    it('preloads keyless public JPDB pitch on new-tab cards (the source needs no key)', async () => {
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ', source: 'jpdb', pitchAccent: [] });
        const localMeta = deferred<never[]>();
        const lookupTermMeta = vi.fn(() => localMeta.promise);
        const publicPitch = vi.fn(async () => ['HLL']);
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            immersionKitEnabled: false,
            showPitchAccent: true,
        }, {
            dictionaries: { lookupTermMeta } as never,
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderNewTabWordFront(controller, card);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        try {
            expect(word.classList.contains('jpdb-pitch-unknown')).toBe(true);
            await waitForExpect(() => {
                expect(publicPitch).toHaveBeenCalledWith('読む', 'よむ');
                expect(card.pitchAccent).toEqual(['HLL']);
            });
            expect(word.classList.contains('jpdb-pitch-atamadaka')).toBe(false);
            expect(word.dataset.pitchClass).toBeUndefined();
            expectRevealedPromptPitch(controller, card, 'atamadaka');
        } finally {
            localMeta.resolve([]);
            root.remove();
        }
    });

    it('prefetches lookahead word pitch before the next card is shown', async () => {
        const first = newTabTestCard({ vid: 1, sid: 1, spelling: '軽い', reading: 'かるい', pitchAccent: [] });
        const second = newTabTestCard({ vid: 2, sid: 2, spelling: '椅子', reading: 'いす', pitchAccent: [] });
        const publicPitch = vi.fn(async () => ['LHH']);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false, showPitchAccent: true }, {
            jpdbPublicPitch: { lookup: publicPitch },
        });
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second],
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
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

    it('hides reading and pitch before reveal, then renders compact reveal tools with inline audio', async () => {
        const card = newTabTestCard({
            spelling: '返す',
            reading: 'かえす',
            wordWithReading: '返[かえ]す',
            pitchAccent: ['HLL'],
            frequencyRank: 777,
            meanings: [{ glosses: ['to return'], partOfSpeech: [] }],
        });
        const loadCardRenderData = vi.fn(async () => ({
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [{ expression: '返す', mode: 'freq', data: 123, dictionary: 'Freq Local' }],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: null,
        } as never));
        const renderStudyWordPills = vi.fn(() => '<div class="jpdb-reader-word-pills"><span>Freq Local 123</span></div>');
        const renderStudyDefinitionSources = vi.fn(() => '<details class="jpdb-reader-local jpdb-reader-source-card" open><summary>Jiten</summary><p>duplicate lookup card</p></details>');
        const playWordAudio = vi.fn();
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            audioEnabled: true,
            furiganaMode: 'off',
            immersionKitEnabled: false,
            showFurigana: false,
            showPitchAccent: true,
        }, {
            loadCardRenderData,
            renderStudyWordPills,
            renderStudyDefinitionSources,
            playWordAudio,
        });
        const frontRoot = renderSeededNewTabWord(controller, card, {
            bindRootEvents: true,
        });

        try {
            const frontTerm = frontRoot.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
            const frontTools = frontRoot.querySelector<HTMLElement>('[data-newtab-study-tools]')!;
            expect(frontTerm.querySelector('ruby')).toBeNull();
            expect(frontTerm.querySelector('rt')).toBeNull();
            expect(frontTools.textContent?.trim()).toBe('');
            expect(frontTools.querySelector('.jpdb-reader-pitch')).toBeNull();
            await waitForExpect(() => {
                expect(loadCardRenderData).toHaveBeenCalledWith(card);
                expect(frontRoot.querySelector('[data-newtab-study-tools] .jpdb-reader-pitch')).toBeNull();
                expect(frontRoot.querySelector('[data-newtab-study-tools] .jpdb-reader-reading')).toBeNull();
            });
        } finally {
            frontRoot.remove();
        }
        vi.clearAllMocks();

        const root = renderSeededNewTabWord(controller, card, {
            state: { revealAnswer: true },
            bindRootEvents: true,
        });

        try {
            const term = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
            const tools = root.querySelector<HTMLElement>('[data-newtab-study-tools]')!;
            expect(root.querySelector('[data-newtab-answer-header]')).toBeNull();
            expect(term.querySelector('ruby')?.textContent).toContain('かえ');
            expect(tools.textContent).not.toContain('#777');
            expect(tools.querySelector('.jpdb-reader-frequency-pill')).toBeNull();
            expect(tools.querySelector('.jpdb-reader-pitch svg')).not.toBeNull();
            await waitForExpect(() => {
                expect(loadCardRenderData).toHaveBeenCalledWith(card);
                expect(renderStudyDefinitionSources).toHaveBeenCalledWith(card, expect.any(Object), card.sentence || card.spelling);
                // Source pills are intentionally NOT rendered on the card front now
                // (they live in the lookup/detail view), so the pill renderer is
                // never invoked for the front and no pill markup appears.
                expect(renderStudyWordPills).not.toHaveBeenCalled();
                expect(root.querySelector('[data-newtab-prompt] .jpdb-reader-word-pills')).toBeNull();
                expect(root.querySelector('[data-newtab-prompt] .jpdb-reader-source-card')).toBeNull();
                expect(root.querySelector('[data-newtab-meaning] [data-newtab-reveal-dictionaries] .jpdb-reader-source-card')?.textContent).toContain('duplicate lookup card');
            });

            // Audio sits inline next to the headword (term row), not in the meta row.
            const speaker = root.querySelector<HTMLButtonElement>('.jpdb-reader-newtab-term-row [data-action="study-word-audio"]');
            speaker?.click();
            speaker?.click();
            expect(playWordAudio).toHaveBeenCalledTimes(2);
            expect(playWordAudio).toHaveBeenNthCalledWith(1, card);
            expect(playWordAudio).toHaveBeenNthCalledWith(2, card);
        } finally {
            root.remove();
        }
    });

    it('recovers study prompt reading and pitch from local dictionaries when the card reading is not kana', async () => {
        const card = newTabTestCard({
            spelling: '映画',
            reading: '映画',
            source: 'local',
            pitchAccent: [],
        });
        const lookupTermMeta = vi.fn(async () => [{
            dictionary: 'Jitendex',
            expression: '映画',
            mode: 'pitch',
            data: { reading: 'えいが', position: 1 },
        }]);
        const loadCardRenderData = vi.fn(async () => ({
            localEntries: [{ expression: '映画', reading: 'えいが', glossary: [], dictionary: 'Jitendex' }],
            kanjiEntries: [],
            metaEntries: [{ dictionary: 'Jitendex', expression: '映画', mode: 'pitch', data: { reading: 'えいが', position: 1 } }],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: null,
            componentPitches: [],
        } as never));
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            immersionKitEnabled: false,
            localDictionariesEnabled: true,
            showPitchAccent: true,
        }, {
            dictionaries: { lookupTermMeta } as never,
            loadCardRenderData,
        });
        const root = renderNewTabWordFront(controller, card);
        document.body.append(root);

        try {
            const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
            expect(word.querySelector('rt')).toBeNull();
            await waitForExpect(() => {
                const updated = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')!;
                expect(updated.dataset.reading).toBe('えいが');
                expect(updated.querySelector('rt')).toBeNull();
                expect(updated.classList.contains('jpdb-pitch-atamadaka')).toBe(false);
                expect(updated.dataset.pitchClass).toBeUndefined();
            });
        } finally {
            root.remove();
        }
    });

    it('does not expose stale JPDB supplemental slugs as new-tab readings', async () => {
        const publicPitch = vi.fn(async () => ['LHHH']);
        const card = newTabTestCard({ spelling: '日本語', reading: 'used-in', source: 'jpdb', pitchAccent: [] });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false, showPitchAccent: true }, {
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
        const parseContent = vi.fn(async (sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = 'お母ちゃん<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="-1" data-sid="-1" data-sentence="お母ちゃん中学生？" tabindex="-1">中学生</span>？';
        });
        const controller = newTabPromptController(DEFAULT_SETTINGS, { parseContent });
        const root = renderSeededNewTabWord(controller, card, {
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
            await waitForExpect(() => {
                expect(parseContent).toHaveBeenCalledWith(
                    root.querySelector('[data-newtab-prompt] [data-newtab-sentence-render]'),
                    expect.objectContaining({ jpdbTimeoutMs: 1_200 }),
                );
                expect(root.querySelector('[data-newtab-study-tools]')).not.toBeNull();
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word');
                expect(word?.textContent).toBe('中学生');
                expect(word?.classList.contains('jpdb-reader-example-target')).toBe(true);
                expect(word?.classList.contains('jpdb-due')).toBe(true);
                expect(word?.classList.contains('jpdb-not-in-deck')).toBe(false);
                expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(false);
                expect(word?.classList.contains('jpdb-pitch-unknown')).toBe(true);
                expect(word?.dataset.pitchClass).toBeUndefined();
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
        const parseContent = vi.fn((sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = 'お連れ様との<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban" data-vid="1198880" data-sid="0" data-pitch-class="heiban" data-sentence="お連れ様との会話が 日本語でしたので" data-expression="会話" data-reading="かいわ" tabindex="-1">会話</span>が 日本語でしたので';
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
        const parseContent = vi.fn((sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = '(<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="-1" data-expression="メイ" data-reading="メイ">メイ</span>)の!? (メイ) <span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-unknown" data-vid="1291770" data-sid="0" data-pitch-class="unknown" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="-1" data-expression="座" data-reading="ざ">座</span>って食べなさい。';
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
        const parseContent = vi.fn((sentenceNode: HTMLElement) => {
            sentenceNode.innerHTML = '(<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka" data-vid="2188120" data-sid="0" data-pitch-class="atamadaka" data-sentence="(メイ)の!? (メイ) 座って食べなさい。" tabindex="-1" data-expression="メイ" data-reading="メイ">メイ</span>)の!?';
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

        expect(prompt?.querySelector<HTMLElement>('.jpdb-reader-newtab-term .jpdb-reader-word')?.dataset.expression).toBe('難波');
        expect(prompt?.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
        expect(prompt?.textContent).toContain('難波');
    });

    it('does not duplicate the pending Immersion Kit example in the word prompt', async () => {
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
            expect(root.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
            expect(search).toHaveBeenCalledWith(
                '中学生',
                expect.objectContaining({ immersionKitEnabled: true }),
                expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
            );
        } finally {
            root.remove();
        }
    });

    it('prefetches current new-tab Immersion Kit examples before reveal without mirroring them in the prompt', async () => {
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
                expect(search.mock.calls.map(([query]) => query).filter(query => query === '中学生')).toHaveLength(1);
            });
            expect(root.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
        } finally {
            root.remove();
        }
    });

    it('does not mirror pending Immersion Kit examples into the prompt or replace the term word', async () => {
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

            await expect(examples.promise).resolves.toHaveLength(1);

            expect(root.querySelector('.jpdb-reader-newtab-term .jpdb-reader-word')).toBe(term);
            expect(term.dataset.stabilityMarker).toBe('keep-me');
            expect(term.dataset.sentence).toBe('中学生');
            expect(root.querySelector('.jpdb-reader-newtab-sentence')).toBeNull();
            expect(parseContent).not.toHaveBeenCalled();
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
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second],
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toEqual(expect.arrayContaining(['一番', '二番']));
            });
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();
            expect(fetchBlobUrl).toHaveBeenCalled();
            expect(parse).toHaveBeenCalledWith(['一番を見た。'], { includeLocalPitch: true, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
            expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: true, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
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
        const root = renderSeededNewTabWord(controller, first, {
            visibleWords: [first, second, third],
            state: { sort: 'frequency' },
            appendToDocument: true,
        });

        try {
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
                expect(parse).toHaveBeenCalledWith(['二番を見た。'], { includeLocalPitch: true, requireApi: true, requireJpdb: true, allowSegmentedFallback: true });
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false }, {
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
        const root = renderNewTabWordFront(controller, card);
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);

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

            root.querySelector<HTMLElement>('[data-newtab-action="next"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

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
        const root = renderNewTabCardFront(controller, card, { source: 'anki', sourceLabel: 'Anki' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void; renderWord(root: HTMLElement, card: JPDBCard): void }).bindRootEvents(root);

        root.querySelector<HTMLElement>('[data-newtab-prompt]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '難波を見る。', root.querySelector('[data-newtab-prompt]'), expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).not.toHaveBeenCalled();
    });

    it('opens JPDB review prompt word lookups with the source card identity intact', () => {
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const card = newTabTestCard({
            vid: 12000,
            sid: 1,
            rid: 8800,
            spelling: '読む',
            reading: 'よむ',
            sentence: '本を読む。',
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            jpdbReviewId: 'jpdb-review-8800',
            cardState: ['due'],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitEnabled: false }, {
            lookupText,
            showLookupCard,
        });
        const root = renderNewTabCardFront(controller, card, { source: 'jpdb', sourceLabel: 'JPDB' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '本を読む。', word, expect.objectContaining({
            navigation: 'push-current',
            reuseActivePopover: true,
            userGesture: true,
        }));
        expect(lookupText).not.toHaveBeenCalled();
    });

    it('opens Jiten review prompt word lookups with the source card identity intact', () => {
        const lookupText = vi.fn();
        const showLookupCard = vi.fn();
        const card = newTabTestCard({
            vid: 4300,
            sid: 2,
            rid: 9900,
            spelling: '試験',
            reading: 'しけん',
            sentence: '試験を受ける。',
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 4300,
            jitenReadingIndex: 2,
            cardState: ['due'],
        });
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, jitenApiKey: 'jiten-key', immersionKitEnabled: false }, {
            lookupText,
            showLookupCard,
        });
        const root = renderNewTabCardFront(controller, card, { source: 'jpdb', sourceLabel: 'Jiten' });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        const word = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word')!;

        word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(showLookupCard).toHaveBeenCalledWith(card, '試験を受ける。', word, expect.objectContaining({
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

    it('renders standalone search result terms with ruby from card readings', async () => {
        const publicCards = [
            newTabTestCard({
                vid: 2414420,
                sid: 0,
                spelling: '好',
                reading: 'こう',
                meanings: [{ glosses: ['good'], partOfSpeech: [] }],
                source: 'jpdb',
            }),
            newTabTestCard({
                vid: 1605820,
                sid: 0,
                spelling: '好い',
                reading: 'よい',
                meanings: [{ glosses: ['good; excellent'], partOfSpeech: [] }],
                source: 'jpdb',
            }),
        ];
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false, immersionKitEnabled: false, furiganaMode: 'all' }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => publicCards) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '好', 'dictionary');

        try {
            await waitForExpect(() => {
                const terms = Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-search-term'));
                expect(terms).toHaveLength(2);
                expect(terms[0]?.querySelector('rt')?.textContent).toBe('こう');
                expect(terms[1]?.querySelector('rt')?.textContent).toBe('よ');
                expect(terms[1]?.textContent).toContain('い');
            });
        } finally {
            root.remove();
        }
    });

    it('omits duplicate search result readings already visible as ruby', () => {
        const context = {
            language: 'en' as const,
            settings: { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const },
            text: (key: 'words' | 'kanji' | 'dictionary') => key,
        };
        const card = newTabTestCard({
            vid: 32900,
            sid: 0,
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            meanings: [{ glosses: ['learning ability'], partOfSpeech: ['noun'] }],
            cardState: ['not-in-deck'],
            source: 'jpdb',
        });

        expect(searchWordSummaryMeta(card, context)).toEqual(['#32900']);
    });

    it('keeps search result readings when furigana settings suppress ruby', () => {
        const context = {
            language: 'en' as const,
            settings: { ...DEFAULT_SETTINGS, showFurigana: false, furiganaMode: 'off' as const },
            text: (key: 'words' | 'kanji' | 'dictionary') => key,
        };
        const card = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['not-in-deck'],
            source: 'jpdb',
        });

        expect(searchWordSummaryMeta(card, context)).toEqual(['がくしゅうのうりょく', '#32900']);
    });

    it('hydrates pitch classes for 学習能力 search result cards after public pitch resolves', async () => {
        const searchCard = newTabTestCard({
            vid: 1932050,
            sid: 0,
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            meanings: [{ glosses: ['learning ability'], partOfSpeech: [] }],
            frequencyRank: 32900,
            pitchAccent: [],
            source: 'jpdb',
        });
        const publicSearch = vi.fn(async () => [searchCard]);
        const publicPitch = vi.fn(async () => ['LHHHHHHHH']);
        const parseContent = vi.fn(async () => undefined);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: 'jpdb-key',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
                furiganaMode: 'all',
                showPitchAccent: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: publicSearch },
            jpdbPublicPitch: { lookup: publicPitch },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            parseContent,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '学習能力');

        try {
            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('[data-newtab-action="search-result-word"] .jpdb-reader-word[data-expression="学習能力"]');
                expect(word).not.toBeNull();
                expect(word?.dataset.pitchClass).toBe('heiban');
                expect(word?.classList.contains('jpdb-pitch-heiban')).toBe(true);
                expect(word?.querySelector('rt')?.textContent).toBe('がくしゅうのうりょく');
            });

            expect(publicPitch).toHaveBeenCalledWith('学習能力', 'がくしゅうのうりょく');
            expect(parseContent).toHaveBeenCalled();
            expect(root.querySelector('.jpdb-reader-newtab-search-suggestion-term.jpdb-reader-parseable')?.textContent).toBe('学習能力');
            expect(Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-search-kanji-card'))
                .map(card => card.querySelector('.jpdb-reader-newtab-search-kanji-char')?.textContent)).toEqual(['学', '習', '能', '力']);
            expect(Array.from(root.querySelectorAll<HTMLElement>('.jpdb-reader-newtab-search-kanji-card .jpdb-reader-newtab-search-meta'))
                .map(meta => meta.textContent ?? '').join('\n')).not.toContain('学習能力');
        } finally {
            root.remove();
        }
    });

    it('preserves parsed Japanese chrome button actions instead of treating inner words as search terms', () => {
        const showSettings = vi.fn();
        const lookupText = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'ja',
                apiKey: '',
                localDictionariesEnabled: false,
                immersionKitEnabled: false,
                furiganaMode: 'all',
                showPitchAccent: true,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {} as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
            dictionaries: {} as never,
            lookupText,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings,
            dismiss: vi.fn(),
        });
        const root = renderBoundNewTabSearchRoot(controller);

        try {
            const button = root.querySelector<HTMLButtonElement>('button[data-newtab-action="settings"]')!;
            button.innerHTML = '<span class="jpdb-reader-word jpdb-reader-passive-word jpdb-pitch-heiban" data-jpdb-reader-passive="true" data-expression="統計" data-reading="とうけい">設定</span>';
            button.querySelector<HTMLElement>('.jpdb-reader-word')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            expect(showSettings).toHaveBeenCalledWith('api');
            expect(lookupText).not.toHaveBeenCalled();
            expect(root.querySelector<HTMLInputElement>('[data-newtab-search-input]')?.value).toBe('');
        } finally {
            root.remove();
        }
    });

    it('hydrates Kanji Immersion Kit inside expanded standalone search kanji details', async () => {
        const example: ImmersionKitExample = {
            id: 'ik-like',
            sentence: '好きを集める。',
            sentenceWithFurigana: '',
            translation: 'Collect what you like.',
            sourceTitle: 'Standalone Search',
            titleSlug: 'standalone-search',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const search = vi.fn(async () => [example]);
        const controller = new NewTabController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                immersionKitEnabled: true,
                kanjiImmersionKitEnabled: true,
                immersionKitShowImages: false,
                rtkEnabled: false,
                kanjivgEnabled: false,
                kanjiOriginsEnabled: false,
                uchisenEnabled: false,
                similarKanjiWords: false,
            }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: { lookup: vi.fn(async () => null) } as never,
            kanjiVG: { lookup: vi.fn(async () => null) } as never,
            rtk: { lookup: vi.fn(async () => null) } as never,
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => []) },
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            applyTheme: vi.fn(),
            showSettings: vi.fn(),
            dismiss: vi.fn(),
        });
        const root = renderPerformedNewTabSearch(controller, '好', 'dictionary');

        try {
            await waitForExpect(() => expect(root.querySelector('[data-newtab-action="search-result-kanji"]')).not.toBeNull());
            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-kanji"]')?.click();
            await waitForExpect(() => expect(root.querySelector('[data-newtab-kanji-immersion-details]')).not.toBeNull());

            const details = root.querySelector<HTMLDetailsElement>('[data-newtab-kanji-immersion-details]')!;
            details.open = true;
            details.dispatchEvent(new Event('toggle'));

            await waitForExpect(() => {
                const body = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
                expect(body?.textContent).toContain('好きを集める。');
                expect(body?.textContent).not.toContain('Loading examples');
            });
            expect(search).toHaveBeenCalledWith('好', expect.anything(), expect.objectContaining({ fastFirst: true }));
        } finally {
            root.remove();
        }
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

    it('renders no-key Jiten search details from public Jiten info for 復習', async () => {
        const jitenLookup = vi.fn(async () => ({
            wordId: 1500800,
            mainReading: { text: '復習', readingIndex: 0, frequencyRank: 12435, usedInMediaAmount: null },
            alternativeReadings: [],
            partsOfSpeech: ['noun', 'suru verb'],
            definitions: [{
                index: 0,
                meanings: ['review; revision'],
                partsOfSpeech: ['noun'],
                field: [],
                dial: [],
                misc: [],
                restrictedToReadingIndices: [],
            }],
            pitchAccents: [],
            knownStates: ['not-in-deck'],
            composedOf: [{
                wordId: 101,
                readingIndex: 0,
                reading: '復',
                readingFurigana: '復[ふく]',
                mainDefinition: 'again; restore',
                frequencyRank: null,
                matchSurface: '復',
                audioUrls: ['https://audio.example.test/fuku.mp3'],
            }],
            usedIn: [{
                wordId: 102,
                readingIndex: 0,
                reading: '復習会',
                readingFurigana: '復習会[ふくしゅうかい]',
                mainDefinition: 'review session',
                frequencyRank: 32000,
                matchSurface: '復習会',
            }],
            usedInTotal: 1,
            examples: [{
                sentenceId: 99,
                text: '毎日復習する。',
                wordPosition: 2,
                wordLength: 2,
                difficulty: null,
                sourceTitle: 'Jiten examples',
                audioUrls: ['https://audio.example.test/review-sentence.mp3'],
            }],
        }));
        const publicCard = newTabTestCard({
            vid: 1776400,
            sid: 0,
            spelling: '復習',
            reading: 'ふくしゅう',
            meanings: [{ glosses: ['JPDB review wording'], partOfSpeech: [] }],
            source: 'jpdb',
            sentence: '復習',
        });
        const jitendexEntry = {
            expression: '復習',
            reading: 'ふくしゅう',
            glossary: [
                'review; revision',
                { type: 'structured-content', content: { tag: 'div', content: '毎日復習する。' } },
            ],
            score: 10,
            dictionary: 'Jitendex',
        };
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            jpdbDefinitionsEnabled: false,
            jitenDefinitionsEnabled: true,
            localDictionariesEnabled: true,
            ankiEnabled: false,
            ankiSectionEnabled: false,
            studyTranslationEnabled: false,
            studyGrammarEnabled: false,
            immersionKitEnabled: false,
        }, {
            jpdbVocabulary: { lookup: vi.fn(async () => null), search: vi.fn(async () => [publicCard]) } as never,
            jiten: { lookupVocabularyInfoForCard: jitenLookup } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                localCardFromEntry: vi.fn(entry => newTabTestCard({
                    vid: -42,
                    sid: -42,
                    spelling: entry.expression,
                    reading: entry.reading,
                    meanings: [{ glosses: ['local card fallback'], partOfSpeech: [] }],
                    source: 'local',
                    sentence: entry.expression,
                })),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {
                summary: vi.fn(async () => ({
                    dictionaries: [{ title: 'Jitendex', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' }],
                    terms: 1,
                    kanji: 0,
                    termMeta: 0,
                    kanjiMeta: 0,
                })),
                searchTerms: vi.fn(async () => [jitendexEntry]),
                lookup: vi.fn(async () => [jitendexEntry]),
                lookupKanji: vi.fn(async () => []),
                lookupTermMeta: vi.fn(async () => []),
            } as never,
        });
        const root = renderPerformedNewTabSearch(controller, '復習', 'dictionary');

        try {
            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-search-results]')?.textContent).toContain('復習');
            });
            const wordButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="search-result-word"]');
            wordButton?.click();
            const detail = () => wordButton
                ?.closest<HTMLElement>('[data-newtab-search-card-shell]')
                ?.querySelector<HTMLElement>('[data-newtab-search-detail]');

            await waitForExpect(() => {
                const jiten = detail()?.querySelector<HTMLElement>('[data-source="jiten"]');
                expect(jiten).not.toBeNull();
                const jitenText = jiten?.textContent ?? '';
                expect(jiten?.textContent).toContain('review; revision');
                expect(jiten?.textContent).toContain('復習会');
                expect(jitenText).toContain('毎日');
                expect(jitenText).toContain('復習');
                expect(jitenText).toContain('する。');
                expect(jiten?.textContent).toContain('ふくしゅう');
                expect(jiten?.querySelector('.jpdb-reader-jiten-example-row.has-audio')).not.toBeNull();
                expect(jiten?.querySelectorAll('.jpdb-reader-jiten-audio')).toHaveLength(3);
                expect(jiten?.querySelector('.jpdb-reader-jiten-local-definitions')).toBeNull();
                expect(jiten?.querySelector('.jpdb-reader-jiten-external-lookup')).toBeNull();
                expect(jiten?.textContent).not.toContain('Jitenで開く');
            });
            expect(jitenLookup).toHaveBeenCalledWith(expect.objectContaining({
                spelling: '復習',
                reading: 'ふくしゅう',
            }));
        } finally {
            root.remove();
        }
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

    it('uses the kanji detail lookup path for handwriting-recognized search kanji', async () => {
        const jpdbKanjiLookup = vi.fn(async () => ({
            kanji: '水',
            keyword: 'water',
            frequency: 'Top 100',
            type: 'Joyo',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [{ reading: 'みず', share: '65%', common: true }],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        }));
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            immersionKitEnabled: false,
            rtkEnabled: false,
            kanjivgEnabled: false,
            kanjiOriginsEnabled: false,
            uchisenEnabled: false,
        }, {
            jpdbKanji: { lookup: jpdbKanjiLookup } as never,
            parser: {
                parse: vi.fn(async () => [[]]),
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            dictionaries: {} as never,
        });
        const root = renderBoundNewTabSearchRoot(controller, 'dictionary');
        try {
            (controller as unknown as NewTabSearchModeApi).renderSearchHandwritingCandidates(root, ['水'], '');
            root.querySelector<HTMLButtonElement>('[data-newtab-action="handwriting-candidate"]')?.click();

            await waitForExpect(() => {
                const results = root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
                expect(results).toContain('水');
                expect(results).toContain('water');
                expect(results).toContain('みず 65%');
            });
            expect(newTabSearchInput(root).value).toBe('水');
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('水');
        } finally {
            root.remove();
        }
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
            expect(meta?.textContent).toBe('#18900');
            const kanjiMeta = root.querySelector<HTMLElement>('[data-newtab-action="search-result-kanji"][data-kanji="自"] .jpdb-reader-newtab-search-meta');
            expect(kanjiMeta?.textContent).not.toContain('自動販売機');
            expect(kanjiMeta?.textContent).toContain('自動');
            expect(kanjiMeta?.textContent).toContain('自動化');
        });
        root.remove();
    });

    it('expands search cards with runtime popup sources, hydrates late Bunpro data, and keeps inline actions in search mode', async () => {
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
        const searchAnkiLookup = { state: 'not-in-deck' as const, notes: [], primary: null };
        const bunproDefinitionInfo = {
            id: 1600,
            kind: 'vocabulary' as const,
            expression: '猫',
            reading: 'ねこ',
            meaning: 'cat',
            nuance: '',
            nuanceTranslation: '',
            acceptedAnswers: [],
            partOfSpeech: ['noun'],
            jlptLevel: 'n5',
            sourceUrl: 'https://bunpro.jp/vocabs/%E7%8C%AB',
        };
        const hydrateBunproDefinitionInfo = vi.fn(async () => bunproDefinitionInfo);
        const cardRenderData = {
            localEntries: [{ expression: '猫', reading: 'ねこ', glossary: ['cat from local dictionary'], score: 20, dictionary: 'Local' }],
            kanjiEntries: [{ character: '猫', onyomi: [], kunyomi: ['ねこ'], tags: [], meanings: ['cat kanji'], dictionary: 'Kanji Local' }],
            metaEntries: [{ expression: '猫', mode: 'freq', data: 1600, dictionary: 'Freq Local' }],
            ankiLookup: searchAnkiLookup,
            jpdbDecks: [],
            ankiDecks: [],
            jpdbVocabularyInfo: { meanings: ['cat'], compounds: [], usedInVocabulary: [], examples: [] },
            bunproDefinitionInfo: null,
        } as never;
        const renderSearchDefinitionSources = vi.fn(() => `
            <div class="jpdb-reader-definition-stack">
                <details open>
                    <summary>Popup sources</summary>
                    <a class="gloss-link" href="#jpdb-reader-dictionary-lookup" data-dictionary-lookup="黒猫" data-dictionary-reading="くろねこ" data-dictionary="Local">黒猫</a>
                    <button type="button" data-action="jpdb-example-audio" data-jpdb-audio="example-audio" data-jpdb-example-sentence="猫が寝る。">audio</button>
                    <button type="button" data-action="jiten-audio" data-study-sentence="猫が鳴く。" data-jiten-audio-urls='["https://audio.example.test/cat.mp3"]'>jiten audio</button>
                </details>
            </div>
        `);
        const installSearchDetailSources = vi.fn();
        const playJpdbExampleAudio = vi.fn();
        const playWordAudio = vi.fn();
        const performCardAction = vi.fn();
        const renderSearchWordPills = vi.fn(() => `
            <div class="jpdb-reader-word-pills">
                <a class="jpdb-reader-pill jpdb-reader-action-pill" href="https://jisho.org/search/%E7%8C%AB" target="_blank" rel="noopener"><span>Jisho</span></a>
                <button type="button" data-action="copy-word">Copy</button>
                <button type="button" data-action="anki">Anki</button>
                <span>Freq Local 1600</span>
            </div>
        `);
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
            hydrateBunproDefinitionInfo,
            renderSearchDefinitionSources,
            renderSearchWordPills,
            installSearchDetailSources,
            playWordAudio,
            playJpdbExampleAudio,
            performCardAction,
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
                expect(detail).toContain('JPDB');
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
                expect(detail).toContain('JPDB');
                expect(detail).toContain('cat radical');
                expect(detail).toContain('Cat kanji mnemonic');
                expect(detail).toContain('Freq Local 1600');
            });
            const kanjiSource = wordDetail()?.querySelector<HTMLElement>('details.jpdb-reader-newtab-search-inline-kanji');
            expect(kanjiSource?.querySelector(':scope > summary.jpdb-reader-local-title')?.textContent).toContain('Kanji');
            expect(kanjiSource?.querySelector<HTMLElement>('[data-search-word-kanji="猫"] .jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('cat radical');
            expect(wordDetail()?.querySelector('.jpdb-reader-definition-stack > details.jpdb-reader-newtab-search-inline-kanji')).toBe(kanjiSource);
            expect(loadCardRenderData).toHaveBeenCalledWith(catCard);
            expect(hydrateBunproDefinitionInfo).toHaveBeenCalledWith(catCard);
            expect(jpdbKanjiLookup).toHaveBeenCalledWith('猫');
            expect(renderSearchDefinitionSources).toHaveBeenCalledWith(
                catCard,
                expect.any(Array),
                '猫',
                expect.any(Object),
                null,
                expect.objectContaining({ expression: '猫', sourceUrl: 'https://bunpro.jp/vocabs/%E7%8C%AB' }),
            );
            expect(renderSearchWordPills).toHaveBeenCalledWith(catCard, expect.any(Array), searchAnkiLookup);
            expect(installSearchDetailSources).toHaveBeenCalledWith(wordDetail(), catCard, '猫', expect.any(Object));

            root.querySelector<HTMLButtonElement>('[data-action="jpdb-example-audio"]')?.click();
            expect(playJpdbExampleAudio).toHaveBeenCalledWith('example-audio', '猫が寝る。');

            const jitenAudio = root.querySelector<HTMLButtonElement>('[data-action="jiten-audio"]')!;
            jitenAudio.click();
            expect(performCardAction).toHaveBeenCalledWith(jitenAudio, catCard, '猫が鳴く。', jitenAudio);

            const openInTab = vi.fn();
            vi.stubGlobal('GM_openInTab', openInTab);
            const actionLinkLabel = root.querySelector<HTMLElement>('a.jpdb-reader-action-pill span')!;
            const actionLinkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
            actionLinkLabel.dispatchEvent(actionLinkClick);
            expect(actionLinkClick.defaultPrevented).toBe(true);
            expect(openInTab).toHaveBeenCalledWith('https://jisho.org/search/%E7%8C%AB', { active: true, insert: true, setParent: false });

            const copyPill = root.querySelector<HTMLButtonElement>('[data-action="copy-word"]')!;
            copyPill.click();
            expect(performCardAction).toHaveBeenCalledWith(copyPill, catCard, '猫', copyPill);

            const ankiPill = root.querySelector<HTMLButtonElement>('[data-action="anki"]')!;
            ankiPill.click();
            expect(performCardAction).toHaveBeenCalledWith(ankiPill, catCard, '猫', ankiPill);

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

    it('groups each word kanji detail under a compact character heading', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }, {
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
        });
        const internals = controller as unknown as {
            renderSearchWordKanjiItem(card: JPDBCard, item: {
                kanji: string;
                details: {
                    jpdb: unknown;
                    jiten: null;
                    rtk: null;
                    vg: null;
                    local: [];
                };
            }): HTMLElement;
        };
        const sourceWord = newTabTestCard({
            spelling: '読み取る',
            reading: 'よみとる',
            meanings: [{ glosses: ['to read and take in'], partOfSpeech: [] }],
            kanjiKeyword: 'to read and take in',
        });
        const read = internals.renderSearchWordKanjiItem(sourceWord, {
            kanji: '読',
            details: {
                jpdb: {
                    kanji: '読',
                    keyword: 'read',
                    frequency: '',
                    type: '',
                    kanken: '',
                    heisig: '',
                    oldForms: [],
                    readings: [{ reading: 'よ.む', share: '', common: true }],
                    components: [{ kanji: '言', keyword: 'say' }],
                    usedInKanji: [],
                    mnemonic: '',
                    vocabulary: [],
                    actions: [],
                    loggedIn: false,
                    kanjiReviewsEnabled: false,
                },
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
            },
        });
        const take = internals.renderSearchWordKanjiItem(sourceWord, {
            kanji: '取',
            details: {
                jpdb: {
                    kanji: '取',
                    keyword: 'take',
                    frequency: '',
                    type: '',
                    kanken: '',
                    heisig: '',
                    oldForms: [],
                    readings: [{ reading: 'と.る', share: '', common: true }],
                    components: [{ kanji: '耳', keyword: 'ear' }],
                    usedInKanji: [],
                    mnemonic: '',
                    vocabulary: [],
                    actions: [],
                    loggedIn: false,
                    kanjiReviewsEnabled: false,
                },
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
            },
        });

        const mount = document.createElement('div');
        mount.append(read, take);

        expect(Array.from(mount.querySelectorAll<HTMLElement>('[data-search-word-kanji]')).map(item => item.dataset.searchWordKanji))
            .toEqual(['読', '取']);
        expect(read.querySelector('.jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('読');
        expect(read.querySelector('.jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('read');
        expect(take.querySelector('.jpdb-reader-newtab-search-kanji-item-title')?.textContent).toContain('take');
        expect(read.querySelector('.jpdb-reader-newtab-kanji-details')).not.toBeNull();
        expect(take.querySelector('.jpdb-reader-newtab-kanji-details')).not.toBeNull();
        expect(read.querySelector('.jpdb-reader-kanji-facts')?.textContent).toContain('Keywordread');
        expect(read.querySelector('.jpdb-reader-newtab-kanji-keywords .jpdb-reader-kanji-keyword')).toBeNull();
        expect(mount.textContent).not.toContain('to read and take in');
    });

    it('uses per-kanji search keywords instead of the parent 検索 gloss', async () => {
        const jpdbKanjiInfo = (kanji: string, keyword: string) => ({
            kanji,
            keyword,
            frequency: '',
            type: '',
            kanken: '',
            heisig: '',
            oldForms: [],
            readings: [],
            components: [],
            usedInKanji: [],
            mnemonic: '',
            vocabulary: [],
            actions: [],
            loggedIn: false,
            kanjiReviewsEnabled: false,
        });
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            jpdbKanjiEnabled: true,
            localDictionariesEnabled: true,
            localDictionaryShowKanji: true,
            rtkEnabled: false,
        }, {
            parser: { fallbackCardFromText: vi.fn(newTabFallbackCardFromText) } as never,
            jpdbKanji: {
                lookup: vi.fn(async (kanji: string) => kanji === '検'
                    ? jpdbKanjiInfo('検', 'inspect')
                    : kanji === '索'
                        ? jpdbKanjiInfo('索', 'cord')
                        : null),
            } as never,
            dictionaries: {
                lookupKanji: vi.fn(async (kanji: string) => [{
                    character: kanji,
                    onyomi: [],
                    kunyomi: [],
                    tags: [],
                    meanings: ['search'],
                    dictionary: 'Parent gloss dictionary',
                }]),
            } as never,
        });
        const internals = controller as unknown as {
            searchKanjiCards(query: string, wordCards?: JPDBCard[]): Promise<Array<{ character: string; keyword: string; meanings: string[] }>>;
        };
        const parent = newTabTestCard({
            spelling: '検索',
            reading: 'けんさく',
            meanings: [{ glosses: ['search'], partOfSpeech: [] }],
            kanjiKeyword: 'search',
        });

        const results = await internals.searchKanjiCards('検索', [parent]);
        const keywords = new Map(results.map(result => [result.character, result.keyword]));
        const meanings = new Map(results.map(result => [result.character, result.meanings]));

        expect(keywords.get('検')).toBe('inspect');
        expect(keywords.get('索')).toBe('cord');
        expect(meanings.get('検')).toEqual([]);
        expect(meanings.get('索')).toEqual([]);
    });

    it('keeps the search detail speaker on lookup audio for the rendered card', () => {
        const renderedCard = newTabTestCard({
            vid: 1600,
            sid: 1,
            spelling: '猫',
            reading: 'ねこ',
            source: 'local',
            reviewSource: 'dictionary',
            sentence: '猫が寝る。',
        });
        const staleJpdbCard = newTabTestCard({
            vid: renderedCard.vid,
            sid: renderedCard.sid,
            spelling: renderedCard.spelling,
            reading: renderedCard.reading,
            source: 'jpdb',
            reviewSource: 'jpdb-api',
            sentence: 'JPDB fallback card',
        });
        const playWordAudio = vi.fn();
        const playJpdbExampleAudio = vi.fn();
        const controller = newTabBareController(DEFAULT_SETTINGS, {
            playWordAudio,
            playJpdbExampleAudio,
        });
        const internals = controller as unknown as {
            searchWordCardCache: Map<string, JPDBCard>;
            renderSearchWordDetail(mount: HTMLElement, card: JPDBCard, detail: never): void;
            handleSearchWordAudioAction(actionTarget: HTMLElement, event: MouseEvent): boolean;
        };
        internals.searchWordCardCache = new Map([[cardKey(renderedCard), staleJpdbCard]]);
        const mount = document.createElement('div');

        internals.renderSearchWordDetail(mount, renderedCard, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
            loading: true,
        } as never);

        const button = mount.querySelector<HTMLButtonElement>('[data-action="search-word-audio"]');
        expect(button).not.toBeNull();
        expect(internals.searchWordCardCache.get(cardKey(renderedCard))).toBe(renderedCard);
        expect(internals.handleSearchWordAudioAction(button as HTMLButtonElement, new MouseEvent('click'))).toBe(true);
        expect(internals.handleSearchWordAudioAction(button as HTMLButtonElement, new MouseEvent('click'))).toBe(true);
        expect(playWordAudio).toHaveBeenCalledTimes(2);
        expect(playWordAudio).toHaveBeenNthCalledWith(1, renderedCard);
        expect(playWordAudio).toHaveBeenNthCalledWith(2, renderedCard);
        expect(playWordAudio).not.toHaveBeenCalledWith(staleJpdbCard);
        expect(playJpdbExampleAudio).not.toHaveBeenCalled();
    });

    it('renders Jiten definitions in expanded search word details and hides empty Jiten panels', () => {
        const card = newTabTestCard({
            source: 'jpdb',
            spelling: '大学',
            reading: 'だいがく',
            meanings: [{ glosses: ['university'], partOfSpeech: [] }],
        });
        const context: NewTabSearchDetailViewContext = {
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                jpdbDefinitionsEnabled: false,
                jitenDefinitionsEnabled: true,
                ankiSectionEnabled: false,
                studyTranslationEnabled: false,
                studyGrammarEnabled: false,
                immersionKitEnabled: false,
            }),
            text: key => key,
            sourceAttributes: (key, initiallyExpanded) => [
                `data-source-state="${key}"`,
                initiallyExpanded === undefined ? '' : `data-source-initial-open="${String(initiallyExpanded)}"`,
            ].filter(Boolean).join(' '),
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        };
        const detail: NewTabSearchWordDetailData = {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null },
            jpdbVocabularyInfo: null,
            jitenVocabularyInfo: {
                wordId: 321,
                mainReading: { text: '大学', readingIndex: 0, frequencyRank: 475, usedInMediaAmount: null },
                alternativeReadings: [],
                partsOfSpeech: ['noun'],
                definitions: [{
                    index: 0,
                    meanings: ['university; college'],
                    partsOfSpeech: ['noun'],
                    field: [],
                    dial: [],
                    misc: [],
                    restrictedToReadingIndices: [],
                }],
                pitchAccents: [],
                knownStates: [],
                composedOf: [],
                usedIn: [],
                usedInTotal: 0,
                examples: [],
            },
        };
        const html = searchWordDetailHtml(card, detail, context);
        const root = document.createElement('div');
        root.innerHTML = html;

        expect(root.querySelector('[data-source="jiten"]')).not.toBeNull();
        expect(root.textContent).toContain('Jiten');
        expect(root.textContent).toContain('university; college');
        expect(root.textContent).not.toContain('No Jiten definitions.');
        expect(root.querySelector('[data-source="jpdb"]')).toBeNull();

        const emptyRoot = document.createElement('div');
        emptyRoot.innerHTML = searchWordDetailHtml(card, {
            ...detail,
            jitenVocabularyInfo: { ...detail.jitenVocabularyInfo!, definitions: [] },
        }, context);
        expect(emptyRoot.querySelector('[data-source="jiten"]')).toBeNull();
        expect(emptyRoot.textContent).not.toContain('No Jiten definitions.');
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

    it('keeps search handwriting Pencil strokes after Safari drops pointer capture', () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const { root, controller } = createDictionarySearchModeFixture();

        try {
            const handwriting = root.querySelector<HTMLElement>('[data-newtab-handwriting]')!;
            const stage = handwriting.querySelector<HTMLElement>('.jpdb-reader-doodle-stage')!;
            const canvas = handwriting.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')!;
            stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
            canvas.getBoundingClientRect = stage.getBoundingClientRect;

            canvas.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
                clientX: 12,
                clientY: 12,
                pointerId: 17,
                pointerType: 'pen',
                pressure: 0.4,
            }));
            canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), {
                pointerId: 17,
                pointerType: 'pen',
            }));
            document.dispatchEvent(Object.assign(new Event('pointermove', { bubbles: true, cancelable: true }), {
                clientX: 54,
                clientY: 58,
                pointerId: 17,
                pointerType: 'pen',
                pressure: 0.65,
            }));
            document.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true, cancelable: true }), {
                clientX: 88,
                clientY: 92,
                pointerId: 17,
                pointerType: 'pen',
                pressure: 0,
            }));

            const internals = controller as unknown as {
                searchHandwritingStrokes: Array<Array<{ x: number; y: number }>>;
                clearSearchHandwritingDebounce(): void;
            };
            expect(internals.searchHandwritingStrokes).toHaveLength(1);
            expect(internals.searchHandwritingStrokes[0]).toEqual(expect.arrayContaining([
                expect.objectContaining({ x: 0.12, y: 0.12 }),
                expect.objectContaining({ x: 0.54, y: 0.58 }),
                expect.objectContaining({ x: 0.88, y: 0.92 }),
            ]));
            internals.clearSearchHandwritingDebounce();
            (handwriting as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void }).__yomuKanjiDoodleCleanup?.();
        } finally {
            root.remove();
            restoreCanvas();
        }
    });

    it('starts search mode from new-tab query params', () => {
        vi.stubGlobal('location', {
            href: 'https://hrussellzfac023.github.io/yomu-reader/newtab/index.html?q=mum',
        });
        const controller = newTabBareController(DEFAULT_SETTINGS);
        const internals = controller as unknown as { state: { mode: string }; searchQuery: string };

        expect(internals.state.mode).toBe('search');
        expect(internals.searchQuery).toBe('mum');
    });

    it('syncs search query params and restores browser history searches', async () => {
        window.history.replaceState(null, '', '/newtab/index.html');
        const { root, searchApi } = createDictionarySearchModeFixture();

        try {
            searchApi.performSearch(root, 'cat');
            await waitForExpect(() => expect(newTabSearchResultsText(root)).toContain('猫'));
            expect(new URL(window.location.href).searchParams.get('q')).toBe('cat');

            searchApi.performSearch(root, 'おもし');
            await waitForExpect(() => expect(newTabSearchResultExpression(root, '面白い')).not.toBeNull());
            expect(new URL(window.location.href).searchParams.get('q')).toBe('おもし');

            window.history.back();
            await waitForExpect(() => {
                expect(newTabSearchInput(root).value).toBe('cat');
                expect(newTabSearchResultsText(root)).toContain('猫');
            });

            window.history.forward();
            await waitForExpect(() => {
                expect(newTabSearchInput(root).value).toBe('おもし');
                expect(newTabSearchResultExpression(root, '面白い')).not.toBeNull();
            });

            root.querySelector<HTMLButtonElement>('[data-newtab-action="search-clear"]')?.click();
            expect(new URL(window.location.href).searchParams.has('q')).toBe(false);
        } finally {
            root.remove();
            window.history.replaceState(null, '', '/');
        }
    });

    it('searches English glossary text without redundant global lookup links in search mode', async () => {
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
            expect(root.querySelector('.jpdb-reader-newtab-search-links')).toBeNull();
            expect(newTabSearchResultsText(root)).not.toContain('Takoboto');
            expect(newTabSearchResultsText(root)).not.toContain('Copy');
            expect(newTabSearchResultsText(root)).not.toContain('JPDB');
            expect(newTabSearchResultsText(root)).not.toContain('Jisho');
            expect(newTabSearchResultsText(root)).not.toContain('Yomu');

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

    it('does not repeat the same reading next to a furigana search result headword', () => {
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };
        const card = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['new'],
        });
        const root = renderSearchWordResults([card], {
            language: 'en',
            settings,
            text: key => ({ words: 'Words', kanji: 'Kanji', dictionary: 'Dictionary' })[key],
        });

        try {
            document.body.append(root);
            const term = root.querySelector<HTMLElement>('.jpdb-reader-newtab-search-term')!;
            const meta = root.querySelector<HTMLElement>('.jpdb-reader-newtab-search-meta')!;

            expect(term.querySelector('rt')?.textContent).toContain('がくしゅうのうりょく');
            expect(meta.textContent).toContain('#32900');
            expect(meta.textContent).not.toContain('がくしゅうのうりょく');
        } finally {
            root.remove();
        }
    });

    it('does not repeat the same reading in expanded search detail headers when furigana is enabled', () => {
        const settings = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };
        const card = newTabTestCard({
            spelling: '学習能力',
            reading: 'がくしゅうのうりょく',
            frequencyRank: 32900,
            cardState: ['new'],
        });
        const context: NewTabSearchDetailViewContext = {
            getSettings: () => settings,
            text: key => ({ noLocalResults: 'No local results', kanji: 'Kanji' })[key],
            sourceAttributes: () => '',
            dictionaryLabel: name => name,
            kanjiSourceTitle: sourceId => sourceId,
        };

        document.body.innerHTML = searchWordDetailHtml(card, {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
        }, context);

        expect(document.querySelector('.jpdb-reader-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta-reading')).toBeNull();
        expect(document.querySelector('.jpdb-reader-meta')?.textContent).toContain('#32900');
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

    it('does not search local dictionaries when the hosted store is empty', async () => {
        const { searchTerms, root, searchApi } = createDictionarySearchModeFixture();
        (searchApi as unknown as { dependencies: { dictionaries: { hasDictionaries: () => Promise<boolean> } } })
            .dependencies.dictionaries.hasDictionaries = vi.fn(async () => false);

        try {
            searchApi.performSearch(root, 'cat');

            await waitForExpect(() => {
                expect(root.querySelector('[data-newtab-search-results]')?.textContent ?? '').not.toContain('猫');
            });
            expect(searchTerms).not.toHaveBeenCalled();
        } finally {
            root.remove();
        }
    });

    it('ignores stale kanji detail lookups after switching back to word mode', async () => {
        const restoreCanvas = stubKanjiDoodleBrowserApis();
        const lookup = deferred<{ kanji: string; keyword: string; meanings: string[]; readings: []; components: []; vocabulary: []; frequencyRank: null }>();
        const card = newTabTestCard({ vid: 12, sid: 12, spelling: '返す', reading: 'かえす', kanjiKeyword: 'return' });
        try {
            const { controller, root } = createNewTabKanjiFrontFixture(card, {
                jpdbKanji: { lookup: vi.fn(() => lookup.promise) } as never,
                dictionaries: { lookupKanji: vi.fn(async () => []), lookup: vi.fn(async () => []) } as never,
            });

            (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: false };
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);
            lookup.resolve({ kanji: '返', keyword: 'stale keyword', meanings: ['stale keyword'], readings: [], components: [], vocabulary: [], frequencyRank: null });
            await Promise.resolve();
            await Promise.resolve();

            expect(newTabPromptText(root)).toContain('return');
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
        const card = newTabTestCard({ spelling: '読む', reading: 'よむ' });
        Object.assign(controller as unknown as {
            visibleWords: JPDBCard[];
            index: number;
            sourceLabel: string;
            state: { mode: string; revealAnswer: boolean };
        }, {
            visibleWords: [card],
            index: 0,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: true },
        });
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

    it('continues to the reveal step, then reveals word study cards with Space and Enter', () => {
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: [] });
        const card = newTabTestCard({
            spelling: '読む',
            reading: 'よむ',
            meanings: [{ glosses: ['read'], partOfSpeech: [] }],
            sentence: '本を読む。',
            pitchAccent: ['LH'],
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            const space = dispatchNewTabKeyboard(root, ' ');
            expect(space.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('recall-cloze');
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);

            const enter = dispatchNewTabKeyboard(study, 'Enter');
            expect(enter.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('listen-pitch');
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);
        } finally {
            root.remove();
        }
    });

    it('uses configurable shortcuts for study reveal and navigation', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                studyReveal: 'R',
                studyRevealAlternate: '',
                studyPrevious: 'H',
                studyPreviousAlternate: '',
                studyNext: 'L',
                studyNextAlternate: '',
            },
        });
        const cards = [
            newTabTestCard({ spelling: '一', reading: 'いち' }),
            newTabTestCard({ spelling: '二', reading: 'に' }),
        ];
        const root = renderSeededNewTabWord(controller, cards[0]!, {
            visibleWords: cards,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const navigation = { next: 0, previous: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };
        (controller as unknown as { showPreviousWord(): void }).showPreviousWord = () => {
            navigation.previous += 1;
        };

        try {
            expect(root.querySelector('[data-newtab-action="next"] .jpdb-reader-newtab-key-hint')?.textContent).toBe('R');

            const space = dispatchNewTabKeyboard(root, ' ');
            expect(space.defaultPrevented).toBe(false);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);

            const reveal = dispatchNewTabKeyboard(root, 'R');
            expect(reveal.defaultPrevented).toBe(true);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('final-reveal');

            const previous = dispatchNewTabKeyboard(root, 'H');
            expect(previous.defaultPrevented).toBe(true);
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabStudyStep).toBe('word');

            const previousCard = dispatchNewTabKeyboard(root, 'H');
            expect(previousCard.defaultPrevented).toBe(true);
            expect(navigation.previous).toBe(1);
        } finally {
            root.remove();
        }
    });

    it('shows a compact first-run guide for the enabled merged study steps', async () => {
        const settings = { ...DEFAULT_SETTINGS, newTabStudyTourSeen: false, newTabStudyDisabledSteps: [] };
        const onSettingsChange = vi.fn();
        const controller = newTabPromptController(settings, { onSettingsChange });
        const card = newTabTestCard({
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: [] }],
            sentence: '猫が好きです。',
            pitchAccent: ['LH'],
        });
        const root = renderSeededNewTabWord(controller, card, {
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });

        try {
            const tour = root.querySelector<HTMLElement>('[data-newtab-study-tour]')!;
            expect(tour.hidden).toBe(false);
            expect(tour.textContent).toContain('One review, a few quick checks. Grade once at the reveal.');
            expect(tour.textContent).toContain('Draw it before the answers appear.');
            expect(tour.textContent).toContain('Type the missing Japanese.');
            expect(tour.textContent).toContain('Listen and choose the pitch shape.');
            expect(tour.textContent).toContain('Check the details, then grade.');

            root.querySelector<HTMLButtonElement>('[data-newtab-action="dismiss-study-tour"]')!.click();

            expect(settings.newTabStudyTourSeen).toBe(true);
            await waitForExpect(() => {
                expect(onSettingsChange).toHaveBeenCalledTimes(1);
                expect(tour.hidden).toBe(true);
            });
        } finally {
            root.remove();
        }
    });

    it('uses configurable navigation shortcuts to advance merged study subtasks before changing cards', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: ['kanji-doodle', 'listen-pitch', 'speaking'],
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                studyPrevious: 'H',
                studyPreviousAlternate: '',
                studyNext: 'L',
                studyNextAlternate: '',
            },
        });
        const card = newTabTestCard({
            spelling: '猫',
            reading: 'ねこ',
            meanings: [{ glosses: ['cat'], partOfSpeech: [] }],
            sentence: '猫が好きです。',
            pitchAccent: [],
        });
        const nextCard = newTabTestCard({ spelling: '犬', reading: 'いぬ' });
        const root = renderSeededNewTabWord(controller, card, {
            visibleWords: [card, nextCard],
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const navigation = { next: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            expect(study.dataset.newtabStudyStep).toBe('word');

            const next = dispatchNewTabKeyboard(root, 'L');
            expect(next.defaultPrevented).toBe(true);
            expect(navigation.next).toBe(0);
            expect(study.dataset.newtabStudyStep).toBe('recall-cloze');
            expect(root.querySelector('[data-newtab-recall-input]')).not.toBeNull();

            const previous = dispatchNewTabKeyboard(root, 'H');
            expect(previous.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('word');
        } finally {
            root.remove();
        }
    });

    it('uses arrow keys for previous and next word study cards', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
        });
        const cards = [
            newTabTestCard({ spelling: '一', reading: 'いち' }),
            newTabTestCard({ spelling: '二', reading: 'に' }),
        ];
        const root = renderSeededNewTabWord(controller, cards[0]!, {
            visibleWords: cards,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const navigation = { next: 0, previous: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };
        (controller as unknown as { showPreviousWord(): void }).showPreviousWord = () => {
            navigation.previous += 1;
        };

        try {
            const study = root.querySelector<HTMLElement>('[data-newtab-study]')!;
            expect(study.dataset.newtabStudyStep).toBe('word');

            const right = dispatchNewTabKeyboard(root, 'ArrowRight');
            expect(right.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('final-reveal');
            expect(navigation.next).toBe(0);

            const nextCard = dispatchNewTabKeyboard(root, 'ArrowRight');
            expect(nextCard.defaultPrevented).toBe(true);
            expect(navigation.next).toBe(1);

            const left = dispatchNewTabKeyboard(root, 'ArrowLeft');
            expect(left.defaultPrevented).toBe(true);
            expect(study.dataset.newtabStudyStep).toBe('word');
            expect(navigation.previous).toBe(0);

            const previousCard = dispatchNewTabKeyboard(root, 'ArrowLeft');
            expect(previousCard.defaultPrevented).toBe(true);
            expect(navigation.previous).toBe(1);
        } finally {
            root.remove();
        }
    });

    it('uses arrow keys for previous and next kanji study cards', () => {
        const controller = newTabPromptController();
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        Object.assign(controller as unknown as { state: { mode: string; revealAnswer: boolean } }, {
            state: { mode: 'kanji', revealAnswer: false },
        });
        const navigation = { next: 0, previous: 0 };
        (controller as unknown as { showNextWord(): void }).showNextWord = () => {
            navigation.next += 1;
        };
        (controller as unknown as { showPreviousWord(): void }).showPreviousWord = () => {
            navigation.previous += 1;
        };
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        document.body.append(root);

        try {
            const right = dispatchNewTabKeyboard(root, 'ArrowRight');
            expect(right.defaultPrevented).toBe(true);
            expect(navigation.next).toBe(1);

            const left = dispatchNewTabKeyboard(root, 'ArrowLeft');
            expect(left.defaultPrevented).toBe(true);
            expect(navigation.previous).toBe(1);
        } finally {
            root.remove();
        }
    });

    it('grades revealed cards with the 1..5 digit keys in button order (SH-8, jpdb parity)', () => {
        const controller = newTabPromptController();
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        const study = document.createElement('div');
        study.dataset.newtabStudy = 'true';
        const clicks: string[] = [];
        for (const grade of ['nothing', 'something', 'hard', 'okay', 'easy']) {
            const button = document.createElement('button');
            button.dataset.newtabAction = 'grade';
            button.dataset.grade = grade;
            button.addEventListener('click', () => clicks.push(grade));
            study.append(button);
        }
        root.append(study);
        Object.assign(controller as unknown as { state: { mode: string; revealAnswer: boolean } }, {
            state: { mode: 'word', revealAnswer: true },
        });
        (controller as unknown as { allWords: unknown[] }).allWords = [{}];
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        document.body.append(root);

        try {
            expect(dispatchNewTabKeyboard(root, '4').defaultPrevented).toBe(true);
            expect(dispatchNewTabKeyboard(root, '1').defaultPrevented).toBe(true);
            expect(clicks).toEqual(['okay', 'nothing']);

            // Hidden card front: digits do nothing.
            (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state.revealAnswer = false;
            expect(dispatchNewTabKeyboard(root, '2').defaultPrevented).toBe(false);
            expect(clicks).toHaveLength(2);
        } finally {
            root.remove();
        }
    });

    it('grades Bunpro cards with 1 Hard / 2 Good when controls sit beside the Study surface', () => {
        const controller = newTabPromptController();
        const card = newTabTestCard({
            spelling: '予習',
            reading: 'よしゅう',
            source: 'bunpro',
            reviewSource: 'bunpro-api',
            bunproReviewId: '7701',
            bunproReviewableId: 8801,
            bunproReviewableType: 'vocabulary',
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        const study = document.createElement('div');
        study.dataset.newtabStudy = 'true';
        const controls = document.createElement('div');
        controls.dataset.newtabControls = 'true';
        const clicks: string[] = [];
        for (const grade of ['fail', 'pass']) {
            const button = document.createElement('button');
            button.dataset.newtabAction = 'grade';
            button.dataset.grade = grade;
            button.addEventListener('click', () => clicks.push(grade));
            controls.append(button);
        }
        root.append(study, controls);
        Object.assign(controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            index: number;
            state: { mode: string; revealAnswer: boolean };
        }, {
            allWords: [card],
            visibleWords: [card],
            index: 0,
            state: { mode: 'word', revealAnswer: true },
        });
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        document.body.append(root);

        try {
            expect(dispatchNewTabKeyboard(root, '2').defaultPrevented).toBe(true);
            expect(dispatchNewTabKeyboard(root, '1').defaultPrevented).toBe(true);
            expect(dispatchNewTabKeyboard(root, '3').defaultPrevented).toBe(false);
            expect(clicks).toEqual(['pass', 'fail']);
        } finally {
            root.remove();
        }
    });

    it('uses configurable shortcuts for study grading', () => {
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            shortcuts: {
                ...DEFAULT_SETTINGS.shortcuts,
                gradeOkay: 'G',
            },
        });
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        const study = document.createElement('div');
        study.dataset.newtabStudy = 'true';
        const clicks: string[] = [];
        for (const grade of ['nothing', 'something', 'hard', 'okay', 'easy']) {
            const button = document.createElement('button');
            button.dataset.newtabAction = 'grade';
            button.dataset.grade = grade;
            button.addEventListener('click', () => clicks.push(grade));
            study.append(button);
        }
        root.append(study);
        Object.assign(controller as unknown as { state: { mode: string; revealAnswer: boolean } }, {
            state: { mode: 'word', revealAnswer: true },
        });
        (controller as unknown as { allWords: unknown[] }).allWords = [{}];
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
        document.body.append(root);

        try {
            expect(dispatchNewTabKeyboard(root, '4').defaultPrevented).toBe(false);
            expect(dispatchNewTabKeyboard(root, 'G').defaultPrevented).toBe(true);
            expect(clicks).toEqual(['okay']);
        } finally {
            root.remove();
        }
    });

    it('does not hijack study shortcuts from text inputs or selects', () => {
        const controller = newTabPromptController();
        const cards = [
            newTabTestCard({ spelling: '読む', reading: 'よむ', meanings: [{ glosses: ['read'], partOfSpeech: [] }] }),
            newTabTestCard({ spelling: '書く', reading: 'かく', meanings: [{ glosses: ['write'], partOfSpeech: [] }] }),
        ];
        const root = renderSeededNewTabWord(controller, cards[0]!, {
            visibleWords: cards,
            sourceLabel: 'Dictionaries',
            state: { mode: 'word', revealAnswer: false },
            bindRootEvents: true,
        });
        const input = document.createElement('input');
        const select = document.createElement('select');
        root.append(input, select);

        try {
            const space = dispatchNewTabKeyboard(input, ' ');
            const right = dispatchNewTabKeyboard(input, 'ArrowRight');
            const enter = dispatchNewTabKeyboard(select, 'Enter');

            expect(space.defaultPrevented).toBe(false);
            expect(right.defaultPrevented).toBe(false);
            expect(enter.defaultPrevented).toBe(false);
            expect(root.classList.contains('jpdb-reader-newtab-revealed')).toBe(false);
            expect(newTabPromptText(root)).toContain('読む');
        } finally {
            root.remove();
        }
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

    it('renders a dictionary-only hosted new-tab kanji drilldown fallback when the split library is missing', async () => {
        await withKanjiStudyCompanionMissing(async () => {
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
                    jpdbKanjiEnabled: true,
                    localDictionariesEnabled: false,
                    localDictionaryShowKanji: false,
                    rtkEnabled: true,
                    kanjivgEnabled: true,
                    kanjiOriginsEnabled: true,
                    kanjiOriginGraphEnabled: true,
                    uchisenEnabled: false,
                };

                await internals.showKanjiLookupCard(card, '漢', '漢字です。');
                const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;

                await waitForExpect(() => {
                    expect(popover.textContent).not.toContain('Install or update the Yomu Kanji/Study companion');
                    expect(popover.textContent).toContain('Kanji details are not available yet.');
                    expect(popover.querySelector('.jpdb-reader-jpdb-kanji')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-rtk')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-kanjivg-svg')).toBeNull();
                    expect(popover.querySelector('.jpdb-reader-origin-graph-wrap')).toBeNull();
                });
            } finally {
                runtime.destroy();
                restoreCanvas();
                document.body.replaceChildren();
            }
        });
    });

    it('parses Japanese settings chrome in hosted new-tab settings with segmented fallback', async () => {
        const runtime = new NewTabRuntime();
        const form = document.createElement('form');
        const parse = vi.fn(async (texts: string[], options?: { allowSegmentedFallback?: boolean }): Promise<JPDBToken[][]> => texts.map(text => {
            void options;
            const start = text.indexOf('設定');
            if (start < 0) return [];
            return [{
                card: newTabTestCard({
                    spelling: '設定',
                    reading: 'せってい',
                    source: 'fallback',
                    pitchAccent: ['LHHH'],
                    cardState: ['not-in-deck'],
                }),
                start,
                end: start + '設定'.length,
                length: '設定'.length,
                rubies: [{ text: 'せってい', start, end: start + '設定'.length, length: '設定'.length }],
                pitchClass: 'heiban',
                sentence: text,
            }];
        }));
        form.className = 'jpdb-reader-settings';
        form.dataset.jpdbReaderRoot = 'true';
        form.innerHTML = `
            <div class="jpdb-reader-settings-head"><h2>よむ 設定</h2></div>
            <div class="jpdb-reader-settings-tabs" role="tablist">
                <button class="jpdb-reader-settings-tab" type="button" role="tab">外観</button>
                <button class="jpdb-reader-settings-tab" type="button" role="tab">学習</button>
            </div>
            <fieldset data-settings-panel="appearance">
                <legend>基本</legend>
                <label><span class="jpdb-reader-settings-label-text">設定の表示言語</span><select><option>日本語</option></select></label>
                <div class="jpdb-reader-help">設定を変更します。</div>
            </fieldset>
        `;
        document.body.append(form);
        const internals = runtime as unknown as {
            activeDialog?: HTMLElement;
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse };
            parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
            enrichPublicVocabularyWords(tokens: JPDBToken[]): Promise<void>;
            enrichPitchWords(tokens: JPDBToken[]): Promise<void>;
        };

        try {
            internals.activeDialog = form;
            internals.settings = {
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'ja',
                showFurigana: true,
                furiganaMode: 'all',
                showPitchAccent: true,
            };
            internals.parser = { canParse: () => true, parse };
            internals.enrichPublicVocabularyWords = vi.fn(async () => undefined);
            internals.enrichPitchWords = vi.fn(async () => undefined);

            await internals.parseSettingsJapanese(form);

            expect(parse).toHaveBeenCalledWith(expect.arrayContaining(['よむ 設定']), expect.objectContaining({
                allowJpdbTimeoutFallback: true,
                allowSegmentedFallback: true,
                includeLocalPitch: false,
                jpdbTimeoutMs: 10000,
            }));
            const titleWord = form.querySelector<HTMLElement>('h2 .jpdb-reader-word[data-expression="設定"]');
            expect(titleWord).toBeTruthy();
            expect(titleWord?.querySelector('rt')?.textContent).toBe('せってい');
            expect(titleWord?.dataset.pitchClass).toBe('heiban');
            expect(titleWord?.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(form.querySelector('.jpdb-reader-settings-label-text .jpdb-reader-word[data-expression="設定"]')).toBeTruthy();
            expect(form.querySelector('option .jpdb-reader-word')).toBeNull();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('releases the settings modal background when the new-tab backdrop dismisses settings', () => {
        const runtime = new NewTabRuntime();
        const form = document.createElement('form');
        const backdrop = document.createElement('div');
        const releaseModalBackground = vi.fn();
        form.className = 'jpdb-reader-settings';
        document.body.append(backdrop, form);
        const internals = runtime as unknown as {
            activeDialog?: HTMLElement;
            activeBackdrop?: HTMLElement;
            settingsDialog: { releaseModalBackground(): void };
            dismiss(): void;
        };
        internals.activeDialog = form;
        internals.activeBackdrop = backdrop;
        internals.settingsDialog = { releaseModalBackground };

        try {
            internals.dismiss();

            expect(form.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
            expect(releaseModalBackground).toHaveBeenCalledOnce();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('dismisses mounted settings when the new-tab backdrop receives pointer input', () => {
        const runtime = new NewTabRuntime();
        const form = document.createElement('form');
        const backdrop = document.createElement('div');
        const releaseModalBackground = vi.fn();
        form.className = 'jpdb-reader-settings';
        backdrop.className = 'jpdb-reader-backdrop';
        const internals = runtime as unknown as {
            settingsDialog: { releaseModalBackground(): void };
            mountSettingsDialog(backdrop: HTMLElement, form: HTMLFormElement): void;
        };
        internals.settingsDialog = { releaseModalBackground };

        try {
            internals.mountSettingsDialog(backdrop, form);
            backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));

            expect(form.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
            expect(releaseModalBackground).toHaveBeenCalledOnce();
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('uses segmented fallback for hosted Japanese settings chrome without JPDB', async () => {
        const runtime = new NewTabRuntime();
        const parse = vi.fn(async (_texts: string[], _options?: unknown): Promise<JPDBToken[][]> => [[]]);
        const form = document.createElement('form');
        form.className = 'jpdb-reader-settings';
        form.innerHTML = `
            <h2>よむ 設定</h2>
            <nav class="jpdb-reader-settings-tabs"><button type="button" role="tab">外観</button></nav>
            <input data-settings-search value="" aria-label="設定を検索">
            <fieldset data-settings-panel="appearance">
                <legend>外観</legend>
                <label>設定の表示言語 <span data-settings-select-options-meta>日本語</span></label>
            </fieldset>
        `;
        document.body.append(form);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            activeDialog?: HTMLElement;
            parser: { canParse(): boolean; parse: typeof parse };
            jpdbVocabulary: { search(query: string, limit?: number): Promise<JPDBCard[]> };
            jpdbPublicPitch: { lookup(expression: string, reading: string): Promise<string[]> };
            parseSettingsJapanese(form: HTMLFormElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            apiKey: '',
            localDictionariesEnabled: false,
            showFurigana: true,
            furiganaMode: 'all',
            showPitchAccent: true,
        };
        internals.activeDialog = form;
        internals.parser = { canParse: () => true, parse };
        internals.jpdbVocabulary = { search: vi.fn(async () => []) };
        internals.jpdbPublicPitch = { lookup: vi.fn(async () => []) };

        try {
            await internals.parseSettingsJapanese(form);

            expect(parse).toHaveBeenCalledWith(
                expect.arrayContaining(['よむ 設定', '外観', '設定の表示言語']),
                expect.objectContaining({
                    allowJpdbTimeoutFallback: true,
                    allowSegmentedFallback: true,
                    includeLocalPitch: false,
                    jpdbTimeoutMs: 10_000,
                    requireJpdb: false,
                    skipJpdb: true,
                }),
            );
            expect(parse.mock.calls[0]?.[0] ?? []).not.toContain('日本語');
        } finally {
            runtime.destroy();
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

    it('replaces no-key segmented fallback words with public Jiten cards', async () => {
        const runtime = new NewTabRuntime();
        const fallbackCard = newTabTestCard({ vid: -3924751230, sid: -3924751230, spelling: '会話', reading: '会話', source: 'fallback', meanings: [] });
        const publicCard = newTabTestCard({ vid: 1234, sid: 0, spelling: '会話', reading: 'かいわ', source: 'jiten', pitchAccent: ['LHH'] });
        const parse = vi.fn(async (): Promise<JPDBToken[][]> => [[{
            card: fallbackCard,
            start: 0,
            end: 2,
            length: 2,
            rubies: [],
            pitchClass: '',
            sentence: '会話',
        }]]);
        const search = vi.fn(async () => []);
        const pitch = vi.fn(async () => ['LHH']);
        const jitenLookupMany = vi.fn(async () => new Map<string, JPDBCard>([['会話', publicCard]]));
        const cacheCards = vi.fn();
        const root = document.createElement('div');
        root.innerHTML = '<span class="jpdb-reader-parseable">会話</span>';
        document.body.append(root);
        const internals = runtime as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            parser: { canParse(): boolean; parse: typeof parse; cacheCards: typeof cacheCards };
            jitenPublicVocabulary: { lookup(term: string): Promise<JPDBCard | null>; lookupMany(terms: string[]): Promise<Map<string, JPDBCard>> };
            jpdbVocabulary: { search: typeof search };
            jpdbPublicPitch: { lookup: typeof pitch };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = {
            ...DEFAULT_SETTINGS,
            apiKey: '',
            localDictionariesEnabled: false,
            showFurigana: true,
            furiganaMode: 'all',
            showPitchAccent: true,
        };
        internals.parser = { canParse: () => true, parse, cacheCards };
        internals.jitenPublicVocabulary = {
            lookup: vi.fn(async () => null),
            lookupMany: jitenLookupMany,
        };
        internals.jpdbVocabulary = { search };
        internals.jpdbPublicPitch = { lookup: pitch };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-word');
                expect(word?.dataset.expression).toBe('会話');
                expect(word?.dataset.vid).toBe('1234');
                expect(word?.dataset.reading).toBe('かいわ');
                expect(word?.dataset.pitchClass).toBe('heiban');
                expect(word?.querySelector('rt')?.textContent).toBe('かいわ');
            });
            expect(jitenLookupMany).toHaveBeenCalledWith(['会話']);
            expect(search).not.toHaveBeenCalled();
            // Keyless public pitch is now allowed; the Jiten card still supplies the
            // displayed heiban accent, so the public-pitch result is not what renders.
            expect(pitch).toHaveBeenCalled();
            expect(cacheCards).toHaveBeenCalledWith([publicCard]);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('unwraps no-key segmented fallback words when public Jiten has no card', async () => {
        const runtime = new NewTabRuntime();
        const fallbackCard = newTabTestCard({ vid: -1, sid: -1, spelling: 'した', reading: 'した', source: 'fallback', meanings: [] });
        const jitenLookupMany = vi.fn(async () => new Map<string, JPDBCard>());
        const search = vi.fn(async () => []);
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
            jitenPublicVocabulary: { lookup(term: string): Promise<JPDBCard | null>; lookupMany(terms: string[]): Promise<Map<string, JPDBCard>> };
            jpdbVocabulary: { search(query: string, limit?: number): Promise<JPDBCard[]> };
            parseNewTabContent(root: HTMLElement): Promise<void>;
        };
        internals.settings = { ...DEFAULT_SETTINGS, apiKey: '', localDictionariesEnabled: false };
        internals.parser = { canParse: () => true, parse, cacheCards: vi.fn() };
        internals.jitenPublicVocabulary = {
            lookup: vi.fn(async () => null),
            lookupMany: jitenLookupMany,
        };
        internals.jpdbVocabulary = { search };

        try {
            await internals.parseNewTabContent(root);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-word')).toBeNull();
                expect(root.textContent).toBe('した');
            });

            await internals.parseNewTabContent(root);

            expect(parse).toHaveBeenCalledTimes(1);
            expect(jitenLookupMany).toHaveBeenCalledTimes(1);
            expect(search).not.toHaveBeenCalled();
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
        const { lookup, settingsForm, settingsBackdrop, internals } = mountStackedNewTabLookup(runtime);

        try {
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
        const { lookup, settingsForm, settingsBackdrop, anchor, internals } = mountStackedNewTabLookup(runtime);

        try {
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
        const { lookup, settingsForm, settingsBackdrop, anchor, internals } = mountStackedNewTabLookup(runtime);

        try {
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

    it('opens hosted new-tab lookup action pill links through userscript tabs', async () => {
        const runtime = new NewTabRuntime();
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const };
        const anchor = document.createElement('span');
        anchor.textContent = '辞書';
        document.body.append(anchor);
        const openInTab = vi.fn();
        vi.stubGlobal('GM_openInTab', openInTab);
        const internals = runtime as unknown as {
            settings: typeof settings;
            mountLookupPopover(popover: HTMLElement, anchor?: HTMLElement): void;
            installLookupPopoverHandlers(popover: HTMLElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): void;
        };
        internals.settings = settings;

        try {
            const lookup = createReaderPopover('よむ', settings);
            lookup.innerHTML = `
                <div class="jpdb-reader-popover-body">
                    <a class="jpdb-reader-pill jpdb-reader-action-pill" href="https://jiten.moe/search?query=%E8%BE%9E%E6%9B%B8" target="_blank" rel="noopener"><span>Jiten</span></a>
                </div>
            `;
            internals.mountLookupPopover(lookup, anchor);
            internals.installLookupPopoverHandlers(lookup, newTabTestCard({ spelling: '辞書', reading: 'じしょ' }), '辞書を引く。', anchor);

            const label = lookup.querySelector<HTMLElement>('a.jpdb-reader-action-pill span')!;
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            label.dispatchEvent(click);

            expect(click.defaultPrevented).toBe(true);
            expect(openInTab).toHaveBeenCalledWith('https://jiten.moe/search?query=%E8%BE%9E%E6%9B%B8', { active: true, insert: true, setParent: false });
            expect(lookup.isConnected).toBe(true);
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

    it('routes the hosted lookup speaker through configured term audio', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({ spelling: '発音', reading: 'はつおん', sentence: '発音を聞く。' });
        const playTermAudio = vi.fn(async () => undefined);
        const playJpdbExampleAudio = vi.fn(async () => undefined);
        const renderData = newTabLookupRenderData();
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                audioEnabled: true,
                autoPlayAudio: false,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            activeLookupPopover?: HTMLElement;
            audioActions: {
                playTermAudio: typeof playTermAudio;
                playJpdbExampleAudio: typeof playJpdbExampleAudio;
            };
            showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
        };

        try {
            internals.audioActions = { playTermAudio, playJpdbExampleAudio };

            await internals.showLookupCard(card, '発音を聞く。');
            const button = internals.activeLookupPopover?.querySelector<HTMLButtonElement>('[data-action="audio"]');
            expect(button).not.toBeNull();
            button?.click();

            await waitForExpect(() => {
                expect(playTermAudio).toHaveBeenCalledWith(card, { userGesture: true });
            });
            expect(playJpdbExampleAudio).not.toHaveBeenCalled();
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

    it('hides new-tab lookup Anki status when Anki mining is disabled', async () => {
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
                ankiEnabled: false,
                ankiSectionEnabled: true,
                jpdbMiningEnabled: true,
            },
        });

        try {
            await internals.showLookupCard(card, 'よむ。');

            await vi.waitFor(() => {
                const labels = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-meta > span')).map(item => item.textContent);
                expect(labels).toEqual(['#20200', 'JPDB Redundant']);
            });
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides new-tab lookup grade controls when there is no real review target', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '辞書',
            reading: 'じしょ',
            source: 'local',
            reviewSource: 'dictionary',
        });
        const renderData = newTabLookupRenderData({
            ankiLookup: { state: 'not-in-deck', notes: [], primary: null } satisfies AnkiLookupResult,
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
                jpdbMiningEnabled: true,
                ankiEnabled: false,
                yomuLocalSrsEnabled: false,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): [];
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [],
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '辞書を引く。');

            expect(document.querySelector('[data-grade]')).toBeNull();
            expect(document.querySelector('[data-newtab-grade-target-text]')).toBeNull();
            expect(document.querySelector('[data-review-target-gutter]')).toBeNull();
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
            ankiLookup: ankiLookupResult('due', [ankiLookupNote({
                cardIds: [404],
                primaryCardId: 404,
                state: 'due',
                renderedCards: [{ cardId: 404, deckName: 'Core', question: '復習', answer: 'review' }],
            })]),
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
                ankiEnabled: true,
                ankiSectionEnabled: true,
                yomuLocalSrsEnabled: false,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [{ id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 }],
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '復習します。');

            await vi.waitFor(() => {
                const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]');
                expect(document.querySelector('[data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core #404');
                expect(document.querySelector('[data-newtab-grade-target-chip]')).toBeNull();
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

    it('closes hosted lookup popovers after a successful new-tab grade', async () => {
        const runtime = new NewTabRuntime();
        const card = newTabTestCard({
            spelling: '復習',
            reading: 'ふくしゅう',
            source: 'anki',
            reviewSource: 'anki',
            ankiCardId: 404,
        });
        const gradeFromLookup = vi.fn(async () => ({ preserveLookup: false }));
        const renderData = newTabLookupRenderData({
            ankiLookup: ankiLookupResult('due', [ankiLookupNote({
                cardIds: [404],
                primaryCardId: 404,
                state: 'due',
                renderedCards: [{ cardId: 404, deckName: 'Core', question: '復習', answer: 'review' }],
            })]),
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                enableReviews: true,
                twoButtonReviews: true,
                ankiEnabled: true,
                ankiSectionEnabled: true,
                yomuLocalSrsEnabled: false,
            },
            isJpdbBackedCard: () => false,
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            activeLookupPopover?: HTMLElement;
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
                gradeFromLookup: typeof gradeFromLookup;
                destroy(): void;
            };
        };

        try {
            internals.newTab = {
                lookupGradeOptions: () => [['fail', 'Fail'], ['pass', 'Pass']],
                lookupReviewTargets: () => [{ id: 'anki:404', kind: 'anki', label: 'Grades Anki card: Core #404', shortLabel: 'Anki #404', ankiCardId: 404 }],
                gradeFromLookup,
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '復習します。');
            const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]')!;
            pass.click();

            await waitForExpect(() => {
                expect(gradeFromLookup).toHaveBeenCalledWith('pass', { kind: 'anki', ankiCardId: 404 }, card);
                expect(document.querySelector('.jpdb-reader-popover')).toBeNull();
                expect(internals.activeLookupPopover).toBeUndefined();
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
            ankiLookup: ankiLookupResult('due', [ankiLookupNote({
                cardIds: [404, 405],
                primaryCardId: 404,
                state: 'due',
                renderedCards: [
                    { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                    { cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' },
                ],
            })]),
        });
        const internals = setupNewTabLookupRuntime(runtime, renderData, {
            settings: {
                apiKey: 'jpdb-key',
                enableReviews: true,
                twoButtonReviews: true,
                ankiEnabled: true,
                ankiSectionEnabled: true,
                jpdbMiningEnabled: true,
                yomuLocalSrsEnabled: false,
            },
        }) as NewTabLookupRuntimeInternals<typeof renderData> & {
            newTab: {
                lookupGradeOptions(card: JPDBCard): Array<['fail' | 'pass', string]>;
                lookupReviewTargets(card: JPDBCard): Array<{ id: string; kind: 'jpdb' | 'anki'; label: string; shortLabel: string; ankiCardId?: number }>;
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
                destroy: vi.fn(),
            };

            await internals.showLookupCard(card, '日本語を読みます。');

            await vi.waitFor(() => {
                const popover = document.querySelector<HTMLElement>('.jpdb-reader-popover')!;
                expect(document.querySelector('[data-review-target-gutter]')).not.toBeNull();
                expect(document.querySelector('[data-review-target-current]')?.textContent).toBe('Both');
                expect(document.querySelector<HTMLSelectElement>('[data-review-target-select]')?.selectedOptions[0]?.textContent).toBe('Both');
                expect(Array.from(popover.querySelectorAll('[data-newtab-grade-target-text]'), element => element.textContent)).toEqual(['Grades JPDB + Anki card: Core #404']);
                expect(document.querySelectorAll('[data-newtab-grade-target-chip]')).toHaveLength(0);
            });

            const select = document.querySelector<HTMLSelectElement>('[data-review-target-select]')!;
            expect(Array.from(select.options, option => option.textContent)).toEqual(['Both', 'JPDB', 'Core #404', 'Core #405']);
            expect(document.querySelectorAll<HTMLButtonElement>('[data-action="grade"][data-grade]')).toHaveLength(2);
            expect(Array.from(document.querySelectorAll<HTMLButtonElement>('[data-newtab-review-target="both"][data-grade]')).map(button => button.textContent)).toEqual(['Fail', 'Pass']);

            select.value = 'anki:405';
            select.dispatchEvent(new Event('change', { bubbles: true }));

            const pass = document.querySelector<HTMLButtonElement>('[data-grade="pass"]')!;
            expect(document.querySelector('[data-review-target-current]')?.textContent).toBe('Core #405');
            expect(document.querySelector('.jpdb-reader-popover [data-newtab-grade-target-text]')?.textContent).toBe('Grades Anki card: Core #405');
            expect(pass.dataset.newtabReviewTarget).toBe('anki');
            expect(pass.dataset.ankiCardId).toBe('405');
            expect(pass.getAttribute('aria-label')).toBe('Pass: Grades Anki card: Core #405');
            expect(pass.title).toBe('Grades Anki card: Core #405');
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('submits a lookup-selected Anki target without grading the merged JPDB card', async () => {
        const card = jpdbAnkiDuplicateReviewCard();
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const onAnkiStatusChanged = vi.fn();
        const refreshedLookup = ankiLookupResult('known', [
            ankiLookupNote({
                noteId: 777,
                cardIds: [404, 405],
                primaryCardId: 405,
                renderedCards: [{ cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' }],
            }),
        ]);
        const findExistingCards = vi.fn(async () => refreshedLookup);
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
            findExistingCards,
            onAnkiStatusChanged,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: false });
            expect(answerCard).toHaveBeenCalledWith(405, 'okay');
            expect(findExistingCards).toHaveBeenCalledWith(card);
            expect(onAnkiStatusChanged).toHaveBeenCalledWith(card);
            expect(reviewCard).not.toHaveBeenCalled();
            expect(card.cardState).toEqual(['known']);
            expect(card.ankiCardId).toBe(405);
            expect(card.ankiNoteId).toBe(777);
            expect(card.ankiReps).toBe(3);
            expect(card.ankiRenderedCards).toEqual([{ cardId: 405, deckName: 'Core', question: 'Japanese', answer: '日本語' }]);
        } finally {
            root.remove();
        }
    });

    it('closes new-tab lookup popovers after shared card-action review buttons grade successfully', async () => {
        const runtime = new NewTabRuntime();
        const card = jpdbAnkiDuplicateReviewCard();
        const popover = document.createElement('div');
        const backdrop = document.createElement('div');
        const button = document.createElement('button');
        const perform = vi.fn(async () => true);
        const showLookupCard = vi.fn();
        const internals = runtime as unknown as {
            activeLookupPopover?: HTMLElement;
            activeLookupBackdrop?: HTMLElement;
            cardActions: { perform: typeof perform };
            showLookupCard: typeof showLookupCard;
            handleCardAction(button: HTMLButtonElement, card: JPDBCard, sentence?: string, anchor?: HTMLElement): Promise<void>;
        };
        button.dataset.action = 'grade';
        button.dataset.grade = 'easy';
        document.body.append(backdrop, popover);
        internals.activeLookupPopover = popover;
        internals.activeLookupBackdrop = backdrop;
        internals.cardActions = { perform };
        internals.showLookupCard = showLookupCard;

        try {
            await internals.handleCardAction(button, card, '日本語を読む。');

            expect(perform).toHaveBeenCalledWith('grade', button, card, '日本語を読む。');
            expect(showLookupCard).not.toHaveBeenCalled();
            expect(popover.isConnected).toBe(false);
            expect(backdrop.isConnected).toBe(false);
        } finally {
            runtime.destroy();
            document.body.replaceChildren();
        }
    });

    it('keeps the explicitly graded duplicate Anki card after refreshed details choose another primary', async () => {
        const card = jpdbAnkiDuplicateReviewCard({
            ankiRenderedCards: [
                { cardId: 404, deckName: 'Core', question: '日本語', answer: 'Japanese' },
                { cardId: 405, deckName: 'Reverse', question: 'Japanese', answer: '日本語' },
            ],
        });
        const reviewCard = vi.fn(async () => {});
        const answerCard = vi.fn(async () => {});
        const refreshedLookup = ankiLookupResult('due', [
            ankiLookupNote({
                cardIds: [404],
                primaryCardId: 404,
                state: 'due',
            }),
            ankiLookupNote({
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
                reps: 9,
                lapses: 1,
            }),
        ]);
        const findExistingCards = vi.fn(async () => refreshedLookup);
        const { controller, root } = newTabAutoReviewWordFixture({
            card,
            answerCard,
            reviewCard,
            findExistingCards,
        });

        try {
            const result = await controller.gradeFromLookup('okay', { kind: 'anki', ankiCardId: 405 });

            expect(result).toEqual({ preserveLookup: false });
            expect(answerCard).toHaveBeenCalledWith(405, 'okay');
            expect(reviewCard).not.toHaveBeenCalled();
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
        const metaItems = () => searchWordMetaItems(card, 'not-in-deck', detail, {
            ...DEFAULT_SETTINGS,
            apiKey,
            ankiEnabled: true,
            immersionKitEnabled: false,
        }).map(item => {
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
        // Keyboard shortcuts listen at document level (0.6.151), so the root
        // must be in the document for keydown to reach the handler.
        document.body.append(root);

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
        root.remove();
        controller.destroy();
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
            getSettings: () => ({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS, immersionKitShowImages: false }),
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

    it('filters single-kanji new-tab Immersion Kit hits to examples containing that kanji', async () => {
        const card = newTabTestCard({ spelling: '多', reading: 'た', source: 'fallback', meanings: [] });
        const badExample: ImmersionKitExample = {
            id: 'anime_the_cat_returns_000000759',
            sentence: 'ああ！ たぶんな！',
            sentenceWithFurigana: '',
            translation: 'Yes! Probably...',
            sourceTitle: 'The Cat Returns',
            titleSlug: 'the-cat-returns',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const goodExample: ImmersionKitExample = {
            id: 'anime_kakegurui_000006996',
            sentence: 'この塔には謎が多すぎる',
            sentenceWithFurigana: '',
            translation: 'There are too many mysteries in this tower.',
            sourceTitle: 'Kakegurui',
            titleSlug: 'kakegurui',
            category: 'anime',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const search = vi.fn(async () => [badExample, goodExample]);
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search,
                mediaUrls: vi.fn(() => []),
            } as never,
        });

        await expect((controller as unknown as {
            loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]>;
        }).loadImmersionExamples(card)).resolves.toEqual([goodExample]);

        expect(search).toHaveBeenCalledWith(
            '多',
            expect.anything(),
            expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
        );
    });

    it('renders kanji new-tab Immersion Kit examples with source, count, and navigation controls', () => {
        const card = newTabTestCard({ spelling: '多', reading: 'た', source: 'fallback', meanings: [] });
        const example: ImmersionKitExample = {
            id: 'anime_kakegurui_000006996',
            sentence: 'この塔には謎が多すぎる',
            sentenceWithFurigana: '',
            translation: 'There are too many mysteries in this tower.',
            sourceTitle: 'Kakegurui',
            titleSlug: 'kakegurui',
            category: 'anime',
            soundFile: 'line.mp3',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        };
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                mediaUrls: vi.fn((_: ImmersionKitExample, kind: 'image' | 'sound') => kind === 'sound' ? ['https://media.test/kakegurui.mp3'] : []),
            } as never,
        });

        const node = (controller as unknown as {
            renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement;
        }).renderNewTabKanjiImmersionCard(card, example, 0, 3);

        expect(node.classList.contains('jpdb-reader-newtab-kanji-immersion')).toBe(true);
        expect(node.dataset.newtabKanji).toBe('多');
        expect(node.querySelector('.jpdb-reader-example-source')?.textContent).toBe('Immersion Kit');
        expect(node.querySelector('.jpdb-reader-example-title')?.textContent).toBe('Kakegurui');
        expect(node.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/3');
        expect(node.querySelector('[data-immersion-action="previous"]')).not.toBeNull();
        expect(node.querySelector('[data-immersion-action="audio"]')).not.toBeNull();
        expect(node.querySelector('[data-immersion-action="next"]')).not.toBeNull();
    });

    it('navigates kanji new-tab Immersion Kit examples with the shared controls', async () => {
        const card = newTabTestCard({ spelling: '多', reading: 'た', source: 'fallback', meanings: [] });
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: '多くの人が来た。',
                sentenceWithFurigana: '',
                translation: 'Many people came.',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
            {
                id: 'ik-2',
                sentence: 'この塔には謎が多すぎる',
                sentenceWithFurigana: '',
                translation: 'There are too many mysteries in this tower.',
                sourceTitle: 'Kakegurui',
                titleSlug: 'kakegurui',
                category: 'anime',
                soundFile: '',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }, {
            immersionKit: {
                search: vi.fn(async () => examples),
                mediaUrls: vi.fn(() => []),
            } as never,
            parser: {
                fallbackCardFromText: vi.fn(newTabFallbackCardFromText),
            } as never,
            parseContent: vi.fn(),
        });
        const root = document.createElement('main');
        const body = document.createElement('div');
        body.dataset.newtabKanjiImmersionBody = 'true';
        root.append(body);
        document.body.append(root);
        const privateController = controller as unknown as {
            renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement;
            performNewTabKanjiImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void;
            visibleWords: JPDBCard[];
            index: number;
            state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
        };
        privateController.visibleWords = [card];
        privateController.index = 0;
        privateController.state = {
            mode: 'kanji',
            sort: 'random',
            filter: 'study',
            source: 'dictionary',
            revealAnswer: true,
        };
        body.append(privateController.renderNewTabKanjiImmersionCard(card, examples[0]!, 0, examples.length));

        try {
            privateController.performNewTabKanjiImmersionAction(root, body.querySelector<HTMLElement>('[data-newtab-kanji-immersion]')!, 'next');

            await waitForExpect(() => {
                expect(body.textContent).toContain('この塔には謎が多すぎる');
                expect(body.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
            });
        } finally {
            root.remove();
        }
    });

    it('updates new-tab Immersion Kit card state immediately while media hydrates', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const played = stubNewTabAudioPlayback();
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: 'first.mp3',
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
                soundFile: 'second.mp3',
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
            return Promise.resolve(`blob:http://localhost/${list[0]?.split('/').pop() ?? 'media'}`);
        });
        const parse = vi.fn(async (paragraphs: string[]) => paragraphs.map(text => [newTabSentenceToken(card, text)]));
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: true }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [`https://media.test/${example.imageFile}`] : [`https://media.test/${example.soundFile}`]
                )),
                fetchBlobUrl,
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            parseContent: vi.fn(),
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
            performNewTabImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void;
            playCurrentImmersionAudio(card: JPDBCard): Promise<void>;
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
            privateController.performNewTabImmersionAction(root, root, 'next');
            await Promise.resolve();
            await Promise.resolve();

            await waitForExpect(() => {
                expect(meaning.textContent).toContain('中学生です。');
                expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionSentence).toBe('中学生です。');
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionAudioUrls).toBe(JSON.stringify(['https://media.test/second.mp3']));
                expect(meaning.querySelector('.jpdb-reader-example-translation')?.textContent).toBe('I am a junior high school student.');
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('中学生');
            });
            expect(meaning.querySelector<HTMLImageElement>('.jpdb-reader-example-image')?.getAttribute('src')).toBe('https://media.test/second.jpg');
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/second.jpg'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);

            played.splice(0);
            await privateController.playCurrentImmersionAudio(card);
            expect(played).toEqual(['https://media.test/second.mp3']);
            expect(fetchBlobUrl).not.toHaveBeenCalledWith(['https://media.test/second.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
            await privateController.playCurrentImmersionAudio(card);
            expect(played).toEqual(['https://media.test/second.mp3', 'https://media.test/second.mp3']);

            resolveSecondImage('blob:http://localhost/second.jpg');

            await waitForExpect(() => {
                expect(meaning.querySelector<HTMLImageElement>('.jpdb-reader-example-image')?.getAttribute('src')).toBe('blob:http://localhost/second.jpg');
            });
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('handles study-card Immersion next, previous, and audio through shared DOM controls', async () => {
        const card = newTabTestCard({ spelling: '中学生', reading: 'ちゅうがくせい' });
        const played = stubNewTabAudioPlayback();
        const examples: ImmersionKitExample[] = [
            {
                id: 'ik-1',
                sentence: 'お母ちゃん中学生？',
                sentenceWithFurigana: '',
                translation: 'Are you a middle schooler, kid?',
                sourceTitle: 'First Source',
                titleSlug: 'first-source',
                category: 'anime',
                soundFile: 'first.mp3',
                imageFile: '',
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
                soundFile: 'second.mp3',
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false, immersionKitAutoPlayAudio: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn((example: ImmersionKitExample, kind: 'image' | 'sound') => (
                    kind === 'image' ? [] : [`https://media.test/${example.soundFile}`]
                )),
                fetchBlobUrl: vi.fn(),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {} as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            parseContent: vi.fn(),
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
            bindRootEvents(root: HTMLElement): void;
            renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement;
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
        privateController.bindRootEvents(root);

        try {
            const activeSentence = () => meaning.querySelector<HTMLElement>('.jpdb-reader-example-card')?.dataset.immersionSentence;
            expect(activeSentence()).toBe('お母ちゃん中学生？');

            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="next"]')?.click();
            await waitForExpect(() => expect(activeSentence()).toBe('中学生です。'));
            expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');

            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();
            await waitForExpect(() => expect(played).toEqual(['https://media.test/second.mp3']));
            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="audio"]')?.click();
            await waitForExpect(() => expect(played).toEqual(['https://media.test/second.mp3', 'https://media.test/second.mp3']));

            meaning.querySelector<HTMLButtonElement>('[data-immersion-action="previous"]')?.click();
            await waitForExpect(() => expect(activeSentence()).toBe('お母ちゃん中学生？'));
            expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('1/2');
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('does not block new-tab Immersion Kit navigation on sentence parsing', async () => {
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
                imageFile: '',
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
                imageFile: '',
                soundUrl: '',
                imageUrl: '',
            },
        ];
        let resolveParse!: (tokens: JPDBToken[][]) => void;
        const parse = vi.fn(() => new Promise<JPDBToken[][]>(resolve => {
            resolveParse = resolve;
        }));
        const parseContent = vi.fn();
        const controller = new NewTabController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, immersionKitShowImages: false }),
            anki: {} as never,
            jpdb: {} as never,
            jpdbKanji: {} as never,
            kanjiVG: {} as never,
            rtk: {} as never,
            immersionKit: {
                mediaUrls: vi.fn(() => []),
                fetchBlobUrl: vi.fn(),
            } as never,
            jpdbReviewBridge: { onUpdate: () => () => {} } as never,
            parser: {
                canParse: () => true,
                parse,
            } as never,
            dictionaries: {} as never,
            onSettingsChange: vi.fn(),
            parseContent,
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
            performNewTabImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void;
            playCurrentImmersionAudio(card: JPDBCard): Promise<void>;
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
            privateController.performNewTabImmersionAction(root, root, 'next');
            await Promise.resolve();
            await Promise.resolve();

            expect(meaning.textContent).toContain('中学生です。');
            expect(meaning.querySelector('.jpdb-reader-example-count')?.textContent).toBe('2/2');
            expect(parse).toHaveBeenCalledWith(['中学生です。'], expect.anything());
            expect(parseContent).not.toHaveBeenCalled();

            await privateController.playCurrentImmersionAudio(card);
            expect(parse).toHaveBeenCalledTimes(1);
            expect(parseContent).not.toHaveBeenCalled();

            resolveParse([[newTabSentenceToken(card, '中学生です。')]]);

            await waitForExpect(() => {
                expect(meaning.querySelector<HTMLElement>('.jpdb-reader-word')?.dataset.expression).toBe('中学生');
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
            () => ({ ...DEFAULT_SETTINGS, apiKey: 'jpdb-key', immersionKitShowImages: false }),
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

            showNextNewTabWord(controller);
            await waitForExpect(() => {
                expect(search.mock.calls.map(([query]) => query)).toContain('書く');
            });
            const writeSearchesBeforeReveal = search.mock.calls.map(([query]) => query).filter(query => query === '書く').length;
            expect(root.querySelector('.jpdb-reader-newtab-immersion')).toBeNull();

            revealNewTabStudyCard(root);

            await waitForExpect(() => {
                expect(root.querySelector('.jpdb-reader-newtab-immersion')?.textContent).toContain('名前を書く。');
            });
            expect(search).toHaveBeenCalledWith(
                '書く',
                expect.anything(),
                expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS, immersionKitShowImages: false, ankiEnabled: false }, {
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
            await waitForExpect(() => expect(parse).toHaveBeenCalledWith([sentence], expect.objectContaining({ includeLocalPitch: true })));
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            revealNewTabStudyCard(root);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-immersion .jpdb-reader-word');
                expect(word?.dataset.expression).toBe('中学生');
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
        const controller = newTabPromptController({ ...DEFAULT_SETTINGS, newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS, immersionKitShowImages: false, ankiEnabled: false }, {
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

            showNextNewTabWord(controller);

            await waitForExpect(() => {
                const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence .jpdb-reader-word');
                expect(word?.dataset.expression).toBe('書く');
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
        const example = newTabAudioImmersionExample('ik-1');
        const search = vi.fn(async () => [example]);
        const { root, played, reveal } = newTabImmersionAudioRevealFixture(search);

        try {
            reveal();

            await waitForExpect(() => expect(played).toEqual(['https://media.test/line.mp3']));
            expect(search).toHaveBeenCalledWith(
                '発音',
                expect.objectContaining({ immersionKitAutoPlayAudio: true }),
                expect.objectContaining({ requestLimit: 10, resultLimit: DEFAULT_SETTINGS.immersionKitLimit }),
            );
        } finally {
            root.remove();
        }
    });

    it('plays direct new-tab Immersion Kit audio while blob hydration is still pending', async () => {
        const example = newTabAudioImmersionExample('ik-direct');
        const search = vi.fn(async () => [example]);
        const fetchBlobUrl = vi.fn(() => new Promise<string>(() => undefined));
        const { root, played, reveal } = newTabImmersionAudioRevealFixture(search, { fetchBlobUrl });

        try {
            reveal();

            await waitForExpect(() => expect(played).toEqual(['https://media.test/line.mp3']));
        } finally {
            root.remove();
        }
    });

    it('falls back to blob-hydrated new-tab Immersion Kit audio when direct playback fails', async () => {
        const example = newTabAudioImmersionExample('ik-blob-fallback');
        const search = vi.fn(async () => [example]);
        const fetchBlobUrl = vi.fn(async () => 'blob:http://localhost/line.mp3');
        const { root, played, reveal } = newTabImmersionAudioRevealFixture(search, { fetchBlobUrl });
        class DirectBlockedAudio {
            playbackRate = 1;
            ended = false;
            constructor(public src: string) {}
            addEventListener(): void {}
            play(): Promise<void> {
                played.push(this.src);
                return this.src.startsWith('blob:')
                    ? Promise.resolve()
                    : Promise.reject(new Error('direct media blocked'));
            }
            pause(): void {}
        }
        vi.stubGlobal('Audio', DirectBlockedAudio);

        try {
            reveal();

            await waitForExpect(() => expect(played).toEqual(['https://media.test/line.mp3', 'blob:http://localhost/line.mp3']));
            expect(fetchBlobUrl).toHaveBeenCalledWith(['https://media.test/line.mp3'], DEFAULT_SETTINGS.audioTimeoutMs, DEFAULT_SETTINGS.corsProxyUrl, DEFAULT_SETTINGS.interfaceLanguage);
        } finally {
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('does not append or autoplay delayed Immersion Kit reveal content after hiding the card', async () => {
        const example = newTabAudioImmersionExample('ik-delayed');
        let resolveSearch!: (examples: ImmersionKitExample[]) => void;
        const search = vi.fn(() => new Promise<ImmersionKitExample[]>(resolve => {
            resolveSearch = resolve;
        }));
        const { root, played, fetchBlobUrl, reveal } = newTabImmersionAudioRevealFixture(search);

        try {
            reveal();
            reveal();
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
        canvas.dispatchEvent(Object.assign(new Event('lostpointercapture'), {
            pointerId: 9,
            pointerType: 'pen',
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

    it('activates new-tab doodle controls from Apple Pencil pointer taps without duplicate clicks', () => {
        const controller = newTabBareController();
        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = '<button type="button" data-doodle-trace>Show trace</button>';
        document.body.append(root);
        const trace = root.querySelector<HTMLButtonElement>('[data-doodle-trace]')!;
        const clicks = vi.fn(() => {
            trace.textContent = 'Hide trace';
        });
        trace.addEventListener('click', clicks);

        try {
            (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

            const up = dispatchPenControlTap(trace);
            expect(up.defaultPrevented).toBe(true);
            expect(clicks).toHaveBeenCalledTimes(1);
            expect(trace.textContent).toBe('Hide trace');

            const duplicateClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
            trace.dispatchEvent(duplicateClick);
            expect(duplicateClick.defaultPrevented).toBe(true);
            expect(clicks).toHaveBeenCalledTimes(1);
        } finally {
            root.remove();
        }
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

        const term = root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word');
        expect(root.querySelector('[data-newtab-answer-header]')).toBeNull();
        expect(term?.querySelector('ruby')?.textContent).toContain('かえ');
        expect(root.querySelector('.jpdb-reader-newtab-term-row .jpdb-reader-audio-control')).not.toBeNull();
        expect(root.querySelector('[data-newtab-meaning]')?.textContent).toContain('to return');
    });

    it('recovers revealed Study readings from annotated wordWithReading text', async () => {
        const card = newTabTestCard({
            spelling: '前方',
            reading: '',
            meanings: [{ glosses: ['front; ahead'], partOfSpeech: [] }],
            wordWithReading: '前方[ぜんぽう]',
            source: 'jpdb',
        });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller);
        Object.assign(controller as unknown as { visibleWords: JPDBCard[]; sourceLabel: string; state: { mode: string; revealAnswer: boolean } }, {
            visibleWords: [card],
            sourceLabel: 'JPDB',
            state: { mode: 'word', revealAnswer: false },
        });

        try {
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-reading]')?.textContent).toBe('');

            (controller as unknown as { state: { mode: string; revealAnswer: boolean } }).state = { mode: 'word', revealAnswer: true };
            (controller as unknown as { renderWord(root: HTMLElement, card: JPDBCard): void }).renderWord(root, card);

            expect(root.querySelector('[data-newtab-prompt] .jpdb-reader-newtab-term rt')?.textContent).toContain('ぜんぽう');
            expect(root.querySelector('[data-newtab-meaning]')?.textContent).toContain('front; ahead');
        } finally {
            root.remove();
        }
    });

    it('shows the full Jiten word on revealed kanji cards because Jiten grades that word', async () => {
        const card: JPDBCard = {
            vid: 2701,
            sid: 0,
            rid: 1,
            spelling: '図鑑',
            reading: 'ずかん',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{ glosses: ['picture book; field guide'], partOfSpeech: [] }],
            cardState: ['due'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jiten',
            reviewSource: 'jiten-api',
            jitenWordId: 2701,
            jitenReadingIndex: 0,
        };
        const playWordAudio = vi.fn();
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, immersionKitEnabled: false, kanjiImmersionKitEnabled: false }), {
            playWordAudio,
        });
        const root = renderEnabledNewTabRoot(controller);
        const internals = controller as unknown as {
            allWords: JPDBCard[];
            visibleWords: JPDBCard[];
            sourceLabel: string;
            state: { mode: string; revealAnswer: boolean };
            bindRootEvents(root: HTMLElement): void;
            kanjiStudyCardFromSourceCard(card: JPDBCard, kanji: string): JPDBCard;
            renderWord(root: HTMLElement, card: JPDBCard): void;
        };
        const kanjiCard = internals.kanjiStudyCardFromSourceCard(card, '図');
        Object.assign(internals, {
            allWords: [card],
            visibleWords: [kanjiCard],
            sourceLabel: 'Jiten',
            state: { mode: 'kanji', revealAnswer: true },
        });

        internals.renderWord(root, kanjiCard);
        internals.bindRootEvents(root);

        const backingWord = root.querySelector<HTMLElement>('[data-newtab-kanji-backing-word]');
        expect(backingWord?.textContent).toContain('図鑑');
        expect(backingWord?.textContent).toContain('ずかん');
        expect(backingWord?.textContent).toContain('picture book; field guide');
        expect(backingWord?.querySelector('.jpdb-reader-word')?.textContent).toContain('図鑑');
        expect(backingWord?.querySelector('.jpdb-reader-word rt')?.textContent).toContain('ずかん');
        const speaker = backingWord?.querySelector<HTMLButtonElement>('[data-action="study-word-audio"]');
        expect(speaker).toBeTruthy();
        speaker?.click();
        expect(playWordAudio).toHaveBeenCalledWith(card);
        expect(playWordAudio).not.toHaveBeenCalledWith(kanjiCard);
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
        expect(newTabPromptText()).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('No cards.');
        expect(document.querySelector('[data-newtab-action="empty-fallback"]')?.textContent).toBe('Starter words');
        expect(document.querySelector('[data-newtab-action="settings"]')?.textContent).toBe('Settings');
        expect(document.querySelector('[data-newtab-action="mode"][data-mode="search"]')?.textContent).toBe('Search');
        document.body.replaceChildren();
    });

    it('shows a Study app install affordance and uses the browser install prompt when available', async () => {
        document.body.replaceChildren();
        const toast = vi.fn();
        const prompt = vi.fn(async () => undefined);
        const controller = newTabBareController({
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary',
            immersionKitEnabled: false,
        }, {
            toast,
            dictionaries: { summary: vi.fn(async () => newTabEmptyDictionarySummary()) } as never,
        });

        await controller.renderPage();
        const menu = document.querySelector<HTMLElement>('.jpdb-reader-newtab-more-menu')!;
        expect(menu).not.toBeNull();
        const button = document.querySelector<HTMLButtonElement>('[data-newtab-install-app]')!;
        expect(button).not.toBeNull();
        expect(button.closest('.jpdb-reader-newtab-more-menu')).toBe(menu);
        expect(document.querySelector('[data-newtab-install]')).toBeNull();
        expect(button.disabled).toBe(false);
        expect(button.dataset.installPromptAvailable).toBe('false');
        expect(button.querySelector('.jpdb-reader-newtab-menu-description')?.textContent).toContain('browser install button');

        const event = new Event('beforeinstallprompt') as Event & {
            prompt: () => Promise<void>;
            userChoice: Promise<{ outcome: string }>;
        };
        event.prompt = prompt;
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);

        expect(button.dataset.installPromptAvailable).toBe('true');
        expect(button.querySelector('.jpdb-reader-newtab-menu-description')?.textContent).toBe('Install the Study app on this device.');
        button.click();
        await waitForExpect(() => expect(prompt).toHaveBeenCalledTimes(1));
        await waitForExpect(() => expect(toast).toHaveBeenCalledWith('Study app installed.'));

        document.body.replaceChildren();
    });

    it('loads dictionary cards after dictionary settings change', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            immersionKitEnabled: false,
        };
        const summary = vi.fn(async () => settings.dictionaryPreferences.length
            ? {
                ...newTabTermDictionarySummary('Tiny Alias'),
            }
            : {
                ...newTabEmptyDictionarySummary(),
            });
        const { controller, listRandomTopTerms } = newTabDictionaryReloadFixture({ settings, summary });

        await controller.renderPage();
        expect(newTabPromptText()).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('No cards.');

        settings.dictionaryPreferences = [{ name: 'Local', alias: 'Tiny Alias', enabled: true, priority: 0, type: 'terms' }];
        await controller.renderPage();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(newTabPromptText()).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        resetNewTabReviewStorage();
    });

    it('can force-retry dictionary source when dictionaries appear outside settings', async () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            newTabEnabled: true,
            newTabSource: 'dictionary' as const,
            localDictionariesEnabled: true,
            dictionaryPreferences: [{ name: 'Local', alias: 'Local', enabled: true, priority: 0, type: 'terms' as const }],
            immersionKitEnabled: false,
            newTabOfflineEnabled: false,
        };
        const summary = vi.fn()
            .mockResolvedValueOnce({
                ...newTabEmptyDictionarySummary(),
            })
            .mockResolvedValueOnce({
                ...newTabTermDictionarySummary(),
            });
        const invalidateCaches = vi.fn();
        const { controller, listRandomTopTerms } = newTabDictionaryReloadFixture({ settings, summary, invalidateCaches });

        await controller.renderPage();
        expect(newTabPromptText()).toBe(APP_NAME);
        expect(document.querySelector('[data-newtab-answer]')?.textContent).toBe('No cards.');

        await controller.refreshExternalData();

        expect(summary).toHaveBeenCalledTimes(2);
        expect(invalidateCaches).toHaveBeenCalledTimes(1);
        expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, settings.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        expect(newTabPromptText()).toBe('書く');
        expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary');
        resetNewTabReviewStorage();
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

    it('falls back to dictionary cards when auto live JPDB has no API key and Anki is off', async () => {
        resetNewTabReviewStorage();
        const localCard = newTabTestCard({ spelling: '稽古', reading: 'けいこ', source: 'local' });
        const listRandomTopTerms = vi.fn(async () => newTabLocalDictionaryEntries(['稽古', 'けいこ', 'practice']));
        const listNewTabCards = vi.fn(async () => {
            throw new Error('Anki should not be queried when new-tab Anki is off.');
        });
        const requestCurrent = vi.fn();
        const controller = newTabLocalFallbackController(() => ({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: '',
            ankiEnabled: false,
            newTabAnkiEnabled: false,
            newTabSource: 'auto',
            newTabJpdbReviewMode: 'live-review',
            immersionKitEnabled: false,
        }), localCard, listRandomTopTerms, {
            anki: { listNewTabCards } as never,
            jpdbReviewBridge: {
                onUpdate: () => () => {},
                latestStatus: () => ({ connected: true, card: null }),
                requestCurrent,
            } as never,
        });

        try {
            await controller.renderPage();

            await expectNewTabDictionaryCard('稽古');
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
            expect(listNewTabCards).not.toHaveBeenCalled();
            expect(requestCurrent).not.toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
        }
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
            expect(listNewTabCards).toHaveBeenCalledWith(180, undefined);
            expect(result.cards.map(card => card.spelling)).toEqual(['余白']);
            expect(result.sourceLabel).toBe('Dictionary');
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalledWith(180, 2000, DEFAULT_SETTINGS.dictionaryPreferences, expect.objectContaining({ fallbackToRandom: false }));
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses built-in study words when auto has no local dictionaries installed without public JPDB fallback', async () => {
        const { controller, publicSearch, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto');
        await expectBuiltInFallbackWords(controller, fallbackCardFromText);
        expect(publicSearch).not.toHaveBeenCalled();
    });

    it('uses built-in study words when auto has no local dictionaries and public JPDB is unavailable', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto');

        try {
            await expectBuiltInFallbackWords(controller, fallbackCardFromText);

            await controller.renderPage();
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses keyless fallback material for the Kanji tab instead of rendering the loading empty state', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto');
        const internals = controller as unknown as {
            state: NewTabRenderedState['state'];
            kanjiStudyCardsFromSourceCards(cards: JPDBCard[]): JPDBCard[];
            loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
        };
        internals.state = { ...internals.state, mode: 'kanji', revealAnswer: true };

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(internals.kanjiStudyCardsFromSourceCards(result.cards).length).toBeGreaterThan(0);

            await controller.renderPage();
            const prompt = document.querySelector('[data-newtab-prompt] [data-kanji]')?.textContent ?? '';
            expect(prompt).toMatch(/^[一-龯]$/u);
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('Looking for more kanji...');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses keyless fallback material for a query-bearing empty dictionary Word tab', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('dictionary');
        const internals = controller as unknown as {
            searchQuery: string;
            loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
        };
        internals.searchQuery = '読み取る';

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(result.cards.length).toBeGreaterThan(0);
            expect(result.sourceLabel).toBe('Starter words');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses keyless fallback material for a query-bearing empty dictionary Kanji tab', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('dictionary');
        const internals = controller as unknown as {
            searchQuery: string;
            state: NewTabRenderedState['state'];
            kanjiStudyCardsFromSourceCards(cards: JPDBCard[]): JPDBCard[];
        };
        internals.searchQuery = 'よむ';
        internals.state = { ...internals.state, mode: 'kanji', revealAnswer: false };

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(internals.kanjiStudyCardsFromSourceCards(result.cards).length).toBeGreaterThan(0);
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('replaces unavailable explicit Anki review state with built-in study fallback words', async () => {
        const { controller, fallbackCardFromText } = newTabBuiltInFallbackFixture('anki');

        try {
            const result = await expectBuiltInFallbackWords(controller, fallbackCardFromText);
            expect(result.emptyMessageKey).toBeUndefined();

            await controller.renderPage();
            expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        } finally {
            resetNewTabReviewStorage();
        }
    });

    it('uses built-in study words when auto local dictionaries are disabled without public JPDB fallback', async () => {
        const { controller, publicSearch, fallbackCardFromText } = newTabBuiltInFallbackFixture('auto', {
            localDictionariesEnabled: false,
        });
        const internals = controller as unknown as {
            loadWords(): Promise<{ cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean }>;
        };
        const result = await internals.loadWords();
        expect(result.cards.length).toBeGreaterThan(0);
        expect(result.sourceLabel).toBe('Starter words');
        expect(fallbackCardFromText).toHaveBeenCalled();
        expect(publicSearch).not.toHaveBeenCalled();

        await controller.renderPage();
        expect(document.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
        resetNewTabReviewStorage();
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
            expect(newTabPromptText()).toBe('今日');
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

            await expectNewTabDictionaryCard('飲み物', document, 'Dictionary');
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

            expect(result.cards.map(card => card.spelling)).toEqual(['書く']);
            expect(result.reviewCountMode).toBe(false);
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('previews practice words while slow auto review sources are still loading', async () => {
        vi.useFakeTimers();
        resetNewTabReviewStorage();
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
                newTabAnkiEnabled: true,
                newTabSource: 'auto',
            }),
            anki: {
                listNewTabCards: vi.fn(() => new Promise(() => undefined)),
            } as never,
            jpdb: {
                listDeckCards: vi.fn(() => new Promise(() => undefined)),
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
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            const loadPromise = (controller as unknown as {
                loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void>;
            }).loadWordsInto(root, true);
            await Promise.resolve();

            expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Loading...');

            await vi.advanceTimersByTimeAsync(NEW_TAB_PUBLIC_FALLBACK_GRACE_MS - 1);
            expect(newTabPromptText(root)).toBe(APP_NAME);

            await vi.advanceTimersByTimeAsync(1);
            expect(newTabPromptText(root)).toBe('書く');
            expect(root.querySelector('[data-newtab-count]')?.textContent)
                .toContain('No reviews ready — showing practice words');

            await vi.advanceTimersByTimeAsync(NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS * 3);
            await loadPromise;

            expect(newTabPromptText(root)).toBe('書く');
            expect(root.querySelector('[data-newtab-count]')?.textContent)
                .toContain('No reviews ready — showing practice words');
            expect(listRandomTopTerms).toHaveBeenCalled();
        } finally {
            resetNewTabReviewStorage();
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
            expect(newTabPromptText()).toBe('設定');
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
        localStorage.removeItem('jpdb-reader-newtab-daily-study-time');
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
        // Word study always shows the ticking session timer + daily goal now
        // (user-requested session timer).
        // Yomu local SRS is now the default no-account path, so first-run
        // study stays unblocked without a provider-connection nudge.
        expect(root.querySelector('[data-newtab-count]')?.textContent).toMatch(/^\d\d:\d\d · 0\/60 min/);
        expect(root.querySelector('[data-newtab-count] .jpdb-reader-newtab-connect-cta')).toBeNull();
        sessionStorage.removeItem('jpdb-reader-newtab-current-word');
    });

    it('restores a shared card URL ahead of stored session position and queue order', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        sessionStorage.setItem(NEW_TAB_CURRENT_WORD_KEY, JSON.stringify({
            signature: 'dictionary|word|Dictionaries',
            key: cardKey(read),
        }));
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent(cardKey(write))}`);
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            applySeededNewTabWords(controller, root, {
                allWords: [read, write],
                sourceLabel: 'Dictionaries',
                state: { mode: 'word', sort: 'random', filter: 'all', source: 'dictionary', revealAnswer: false },
            });

            expect(newTabPromptText(root)).toBe('書く');
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe(cardKey(write));
            const params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('card')).toBe(cardKey(write));
            expect(params.get('w')).toBe('書く');
            expect(params.get('r')).toBe('かく');
        } finally {
            root.remove();
            sessionStorage.removeItem(NEW_TAB_CURRENT_WORD_KEY);
        }
    });

    it('opens a portable shared study URL even when the exact provider card is absent', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
        const queued = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const shared = newTabTestCard({ vid: 88, sid: 7, spelling: '図鑑', reading: 'ずかん', source: 'jpdb', pitchAccent: ['LHHH'] });
        const lookupStudyCard = vi.fn(async () => shared);
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'jpdb', immersionKitEnabled: false }), {
            lookupStudyCard,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            await (controller as unknown as {
                applyLoadedWords(
                    root: HTMLElement,
                    preferStoredWord: boolean,
                    loadGeneration: number,
                    result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean },
                    useOfflineCache: boolean,
                    usedCachedWords: boolean,
                    navigationGeneration: number,
                ): Promise<void>;
            }).applyLoadedWords(root, true, 0, { cards: [queued], sourceLabel: 'JPDB', reviewCountMode: true }, false, false, 0);

            const visible = (controller as unknown as { visibleWords: JPDBCard[] }).visibleWords;
            expect(newTabPromptText(root)).toBe('図鑑');
            expect(visible[0]).toMatchObject({
                spelling: '図鑑',
                reading: 'ずかん',
                source: 'local',
                reviewSource: 'yomu-local',
            });
            expect(visible[0]?.sourceCardKey).toBe(cardKey(shared));
            expect(lookupStudyCard).toHaveBeenCalledWith('図鑑', 'ずかん');
            const params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('w')).toBe('図鑑');
            expect(params.get('r')).toBe('ずかん');
        } finally {
            root.remove();
        }
    });

    it('ignores stale portable shared URL lookups after a newer load starts', async () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
        const current = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'jpdb', reviewSource: 'jpdb-api' });
        const queued = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'jpdb', reviewSource: 'jpdb-api' });
        const shared = newTabTestCard({ vid: 88, sid: 7, spelling: '図鑑', reading: 'ずかん', source: 'jpdb' });
        const lookup = deferred<JPDBCard>();
        const lookupStudyCard = vi.fn(() => lookup.promise);
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'jpdb', immersionKitEnabled: false }), {
            lookupStudyCard,
        });
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            applySeededNewTabWords(controller, root, {
                allWords: [current],
                sourceLabel: 'JPDB',
                state: { mode: 'word', sort: 'random', filter: 'all', source: 'jpdb', revealAnswer: false },
            });
            window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent('999:1:図鑑:ずかん')}&w=${encodeURIComponent('図鑑')}&r=${encodeURIComponent('ずかん')}`);
            Object.assign(controller as unknown as { loadGeneration: number }, { loadGeneration: 1 });
            const load = (controller as unknown as {
                applyLoadedWords(
                    root: HTMLElement,
                    preferStoredWord: boolean,
                    loadGeneration: number,
                    result: { cards: JPDBCard[]; sourceLabel: string; reviewCountMode?: boolean },
                    useOfflineCache: boolean,
                    usedCachedWords: boolean,
                    navigationGeneration: number,
                ): Promise<void>;
            }).applyLoadedWords(root, true, 1, { cards: [queued], sourceLabel: 'JPDB', reviewCountMode: true }, false, false, 0);

            await waitForExpect(() => {
                expect(lookupStudyCard).toHaveBeenCalledWith('図鑑', 'ずかん');
            });
            Object.assign(controller as unknown as { loadGeneration: number }, { loadGeneration: 2 });
            lookup.resolve(shared);
            await load;

            expect(newTabPromptText(root)).toBe('読む');
            expect((controller as unknown as { visibleWords: JPDBCard[] }).visibleWords.map(card => card.spelling)).toEqual(['読む']);
        } finally {
            root.remove();
        }
    });

    it('uses permanent card URLs for next and popstate navigation', () => {
        localStorage.removeItem('jpdb-reader-newtab-ui');
        window.history.replaceState(null, '', '/newtab/index.html');
        const read = newTabTestCard({ vid: 1, spelling: '読む', reading: 'よむ', source: 'local' });
        const write = newTabTestCard({ vid: 2, spelling: '書く', reading: 'かく', source: 'local' });
        const controller = newTabBareController(() => ({ ...DEFAULT_SETTINGS, newTabSource: 'dictionary', immersionKitEnabled: false }));
        const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });

        try {
            applySeededNewTabWords(controller, root, {
                allWords: [read, write],
                sourceLabel: 'Dictionaries',
                state: { mode: 'word', sort: 'random', filter: 'all', source: 'dictionary', revealAnswer: false },
            });

            expect(newTabPromptText(root)).toBe('読む');
            let params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('card')).toBe(cardKey(read));
            expect(params.get('w')).toBe('読む');
            expect(params.get('r')).toBe('よむ');

            (controller as unknown as { showNextWord(): void }).showNextWord();
            expect(newTabPromptText(root)).toBe('書く');
            params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('card')).toBe(cardKey(write));
            expect(params.get('w')).toBe('書く');
            expect(params.get('r')).toBe('かく');

            window.history.replaceState(null, '', `/newtab/index.html#card=${encodeURIComponent(cardKey(read))}`);
            (controller as unknown as { handleCardPopstate(root: HTMLElement): void }).handleCardPopstate(root);

            expect(newTabPromptText(root)).toBe('読む');
            expect(root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe(cardKey(read));
            params = new URLSearchParams(location.hash.slice(1));
            expect(params.get('card')).toBe(cardKey(read));
            expect(params.get('w')).toBe('読む');
            expect(params.get('r')).toBe('よむ');
        } finally {
            root.remove();
        }
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
                expect(newTabPromptText()).toBe('読む');
                expect(document.querySelector('[data-newtab-status]')?.textContent).toBe('Dictionary · Offline cache');
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

            expect(newTabPromptText()).toBe('書く');
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
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('読む');
            });

            showNextNewTabWord(controller);
            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard).toBe('2:2:書く:かく');
                expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('書く');
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
            expect(document.querySelector('[data-newtab-prompt]')?.textContent).toContain('書く');
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
        const details = renderTestKanjiDetails({
            settings: {
                similarKanjiWords: false,
                kanjiOriginGraphEnabled: true,
            },
            card: newTabTestCard({ spelling: '休', source: 'jpdb' }),
            kanji: '休',
            info: {
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
            },
        });
        expect(details.querySelector('.jpdb-reader-newtab-kanji-sources')).toBeNull();
        expect(details.querySelector('.jpdb-reader-origin-graph-wrap')).not.toBeNull();
        expect(details.querySelector('.jpdb-reader-component-button')).not.toBeNull();
    });

    it('renders new-tab kanji sources open and in settings order', () => {
        const details = renderTestKanjiDetails({
            settings: {
                kanjiOriginGraphEnabled: true,
                rtkEnabled: true,
                uchisenEnabled: true,
            },
            card: newTabTestCard({ spelling: '付', source: 'jpdb' }),
            kanji: '付',
            info: {
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
            },
            rtk: {
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
            },
        });

        const sourceLabels = Array.from(details.querySelectorAll<HTMLElement>('.jpdb-reader-source-card > .jpdb-reader-local-title'))
            .map(item => item.textContent?.trim() ?? '');
        expect(sourceLabels.slice(0, 3)).toEqual(['JPDB', 'RTK', 'Component graph']);
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

    it('does not repeat the displayed Jiten kanji meaning as a keyword pill', () => {
        const details = renderTestKanjiDetails({
            settings: {
                apiKey: '',
                jitenApiKey: 'ak_jiten-key',
                rtkEnabled: true,
            },
            card: newTabTestCard({ spelling: '大', source: 'jiten', meanings: [{ glosses: ['large'], partOfSpeech: [] }] }),
            kanji: '大',
            info: null,
            jiten: {
                character: '大',
                onReadings: ['ダイ'],
                kunReadings: ['おお'],
                meanings: ['large', 'big'],
                strokeCount: 3,
                jlptLevel: 5,
                grade: 1,
                frequencyRank: 7,
                groupingTags: { kanken: null, wanikani: null, rtk: null, klc: null, tmw: null },
                topWords: [],
                wordsByReading: [],
            },
            rtk: {
                kanji: '大',
                keyword: 'large',
                frameNumber: '112',
                onYomi: '',
                kunYomi: '',
                elements: '',
                componentKanji: [],
                heisigStory: '',
                heisigComment: '',
                koohiiStories: [],
            },
        });

        expect(details.querySelector('.jpdb-reader-jiten-kanji .jpdb-reader-kanji-facts')?.textContent).toContain('Meaninglarge, big');
        expect(details.querySelector('.jpdb-reader-newtab-kanji-keywords .jpdb-reader-kanji-keyword')).toBeNull();
        expect(details.textContent).not.toContain('Jiten/RTKlarge');
    });

    it('loads additional Jiten kanji words through real show-more pagination', async () => {
        const initialWords = Array.from({ length: 9 }, (_, index) => ({
            wordId: 100 + index,
            readingIndex: index,
            reading: `青${index}`,
            readingFurigana: `青[あお]${index}`,
            mainDefinition: `blue ${index}`,
            frequencyRank: 600 + index,
            matchSurface: `青${index}`,
        }));
        const lookupKanjiWords = vi.fn(async () => ({
            items: [
                { wordId: 200, readingIndex: 0, reading: '青空', readingFurigana: '青空[あおぞら]', mainDefinition: 'blue sky', frequencyRank: 1200, matchSurface: '青空' },
            ],
            total: 10,
            pageSize: 9,
            offset: 9,
        }));
        const controller = newTabPromptController({
            ...DEFAULT_SETTINGS,
            apiKey: '',
            jitenApiKey: 'ak_jiten-key',
        }, {
            jiten: {
                lookupKanji: vi.fn(async () => null),
                lookupKanjiWords,
                listStudyBatchCards: vi.fn(),
                reviewCard: vi.fn(),
            } as never,
        });
        const root = document.createElement('main');
        root.dataset.jpdbReaderRoot = 'true';
        root.append((controller as unknown as {
            renderKanjiDetails(card: JPDBCard, kanji: string, info: null, jiten: unknown, rtk: null, vg: null, local: [], similar: []): HTMLElement;
        }).renderKanjiDetails(
            newTabTestCard({ spelling: '青', source: 'jiten' }),
            '青',
            null,
            {
                character: '青',
                onReadings: ['セイ'],
                kunReadings: ['あお'],
                meanings: ['blue'],
                strokeCount: 8,
                jlptLevel: 4,
                grade: 1,
                frequencyRank: 549,
                groupingTags: { kanken: null, wanikani: null, rtk: null, klc: null, tmw: null },
                topWords: [],
                wordsByReading: [{ reading: 'あお', totalWords: 17, words: initialWords }],
            },
            null,
            null,
            [],
            [],
        ));
        document.body.append(root);
        (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);

        try {
            const more = root.querySelector<HTMLButtonElement>('[data-action="jiten-kanji-more"]')!;
            more.click();

            await waitForExpect(() => {
                expect(lookupKanjiWords).toHaveBeenCalledWith('青', {
                    reading: 'あお',
                    page: 2,
                    pageSize: Number(more.dataset.jitenKanjiPageSize),
                });
                expect(root.textContent).toContain('青空');
            });
            expect(root.querySelector<HTMLButtonElement>('[data-action="jiten-kanji-more"]')).toBeNull();
        } finally {
            document.body.replaceChildren();
        }
    });
});
