import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { AnkiConnectClient, type AnkiLookupResult } from '../../../src/reader/anki/index';
import { AnkiNewTabUnavailableError, listNewTabAnkiCards } from '../../../src/reader/anki/new-tab';
import { cardKey } from '../../../src/reader/cards/utils';
import { APP_NAME } from '../../../src/reader/app/constants';
import type { ImmersionKitExample } from '../../../src/reader/immersion/kit';
import { NewTabController, selectNewTabStudyPool } from '../../../src/reader/newtab/controller';
import { NEW_TAB_BROWSE_DECK_LIMIT, NEW_TAB_PUBLIC_FALLBACK_GRACE_MS, NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS } from '../../../src/reader/newtab/controller-config';
import { renderSearchWordResults, searchWordDetailHtml, searchWordMetaItems, searchWordSummaryMeta, type NewTabSearchDetailViewContext, type NewTabSearchWordDetailData } from '../../../src/reader/newtab/search-view';
import { newTabSourceLoadPlan } from '../../../src/reader/newtab/source';
import { NewTabRuntime } from '../../../src/reader/newtab/runtime';
import { parseJpdbReviewDocument } from '../../../src/reader/jpdb/jpdb-review-bridge';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT } from '../../../src/reader/kanji/doodle';
import { assessKanjiStrokes, rankKanjiStrokeCandidates } from '../../../src/reader/kanji/stroke-grader';
import { createReaderPopover } from '../../../src/reader/popup/shell';
import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../../src/reader/settings/index';
import { testEnSettings } from '../helpers/settings-fixture';

export const WORD_ONLY_STUDY_DISABLED_STEPS: typeof BASE_DEFAULT_SETTINGS.newTabStudyDisabledSteps = [
    'kanji-doodle',
    'recall-cloze',
    'listen-pitch',
    'speaking',
    'type-word',
];
export const REVIEW_SUITE_STUDY_STEP_ORDER: typeof BASE_DEFAULT_SETTINGS.newTabStudyStepOrder = [
    'word',
    'recall-cloze',
    'listen-pitch',
    'speaking',
    'kanji-doodle',
];
// These tests assert English UI copy and mostly cover the old review/front-card
// behavior; pin language while dedicated study tests cover the new kanji-first
// merged flow.
export const DEFAULT_SETTINGS = {
    ...testEnSettings(),
    newTabStudyStepOrder: REVIEW_SUITE_STUDY_STEP_ORDER,
    newTabStudyDisabledSteps: WORD_ONLY_STUDY_DISABLED_STEPS,
};
import { definitionSourceRows } from '../../../src/reader/sources/sections';
import { renderNewTabGradeControlButtons, summarizeNewTabReviewSources } from '../../../src/reader/newtab/review-controls';
import type { JPDBCard, JPDBGrade, JPDBToken } from '../../../src/reader/app/types';
import { stackedSettingsFixtureDom } from '../helpers/settings-fixture';
import { expectSettingsDialogStillMounted, expectStackedLookupOverSettings } from '../helpers/stacked-lookup-assertions';
import { waitForExpect } from '../test-utils';

export const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
export const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
export const NEW_TAB_UI_KEY = 'jpdb-reader-newtab-ui';
export const NEW_TAB_CURRENT_WORD_KEY = 'jpdb-reader-newtab-current-word';
export const NEW_TAB_CSS = readFileSync('src/reader/styles/new-tab.css', 'utf8');
export const IMMERSION_CSS = readFileSync('src/reader/styles/immersion-study.css', 'utf8');
export const NORMALIZED_NEW_TAB_CSS = NEW_TAB_CSS.replace(/\s+/g, ' ');

export function newTabCssRule(selector: string): string {
    return immersionCssRule(NORMALIZED_NEW_TAB_CSS, selector);
}

export function immersionCssRule(normalizedCss: string, selector: string): string {
    const start = normalizedCss.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = normalizedCss.indexOf(' }', start);
    expect(end).toBeGreaterThan(start);
    return normalizedCss.slice(start, end + 2);
}

export function newTabTestCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
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

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(settle => { resolve = settle; });
    return { promise, resolve };
}

export function newTabImmersionExample(query: string): ImmersionKitExample {
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

export function stubNewTabAudioPlayback(): string[] {
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

export function newTabAudioImmersionExample(id: string): ImmersionKitExample {
    return {
        ...newTabImmersionExample('発音'),
        id,
        sentence: '発音を確かめる。',
        translation: 'Check the pronunciation.',
        soundFile: 'line.mp3',
    };
}

export function newTabImmersionAudioRevealFixture(
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

export function newTabLocalDictionaryEntry(expression: string, reading: string, gloss: string, score = 1) {
    return { expression, reading, glossary: [gloss], score, dictionary: 'Local' };
}

export function newTabLocalDictionaryEntries(...entries: Array<[expression: string, reading: string, gloss: string, score?: number]>) {
    return entries.map(([expression, reading, gloss, score]) => newTabLocalDictionaryEntry(expression, reading, gloss, score));
}

export function newTabLocalCardFromEntry(entry: { expression: string; reading: string }): JPDBCard {
    return newTabTestCard({ spelling: entry.expression, reading: entry.reading, source: 'local' });
}

export function newTabFallbackCardFromText(text: string): JPDBCard {
    return newTabTestCard({ spelling: text, reading: text, meanings: [], source: 'fallback' });
}

export function newTabSentenceToken(card: JPDBCard, sentence: string): JPDBToken {
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

export function createStackedNewTabSettingsFixture(runtime: NewTabRuntime) {
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

export function mountStackedNewTabLookup(runtime: NewTabRuntime) {
    const fixture = createStackedNewTabSettingsFixture(runtime);
    const lookup = createReaderPopover('よむ', fixture.settings);
    lookup.innerHTML = '<div class="jpdb-reader-popover-body">辞書</div>';
    fixture.internals.mountLookupPopover(lookup, fixture.anchor, { stackOverSettings: true });
    return { ...fixture, lookup };
}

export function stubClientRects(element: HTMLElement, rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>): void {
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

export function stubBoundingClientRect(element: HTMLElement, rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>): void {
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

export function dispatchPointerSwipe(target: HTMLElement, owner: Window, deltaX: number): void {
    const startX = 220;
    const endX = startX + deltaX;
    target.dispatchEvent(testPointerEvent('pointerdown', startX, 120));
    owner.dispatchEvent(testPointerEvent('pointermove', endX, 124));
    owner.dispatchEvent(testPointerEvent('pointerup', endX, 124));
}

export function testPointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
    Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: 1 },
    });
    return event;
}

export function dispatchPenControlTap(target: HTMLElement, pointerId = 91): PointerEvent {
    target.dispatchEvent(testControlPointerEvent('pointerdown', 24, 18, pointerId));
    const up = testControlPointerEvent('pointerup', 25, 18, pointerId);
    target.dispatchEvent(up);
    return up;
}

export function testControlPointerEvent(type: string, clientX: number, clientY: number, pointerId: number): PointerEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY }) as PointerEvent;
    Object.defineProperties(event, {
        isPrimary: { value: true },
        pointerId: { value: pointerId },
        pointerType: { value: 'pen' },
    });
    return event;
}

export function readNewTabGradeQueue(): Array<{
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

export function newTabPromptController(settingsOrGetter: NewTabSettingsSource = DEFAULT_SETTINGS, overrides: Partial<ConstructorParameters<typeof NewTabController>[0]> = {}): NewTabController {
    return newTabBareController(settingsOrGetter, {
        jpdbKanji: { lookup: vi.fn(async () => null) } as never,
        kanjiVG: { lookup: vi.fn(async () => null) } as never,
        rtk: { lookup: vi.fn(async () => null) } as never,
        ...overrides,
    });
}

export function renderEnabledNewTabRoot(controller: NewTabController, options: { appendToDocument?: boolean } = {}): HTMLElement {
    const root = document.createElement('main');
    root.className = 'jpdb-reader-newtab';
    root.dataset.jpdbReaderRoot = 'true';
    root.append((controller as unknown as { renderEnabledContent(): DocumentFragment }).renderEnabledContent());
    if (options.appendToDocument) document.body.append(root);
    return root;
}

export function expectOpaqueStudyCardToken(root: ParentNode, ...answerValues: string[]): string {
    const token = root.querySelector<HTMLElement>('[data-newtab-study]')?.dataset.newtabCard ?? '';
    expect(token).toMatch(/^study-card-\d+$/);
    answerValues.filter(Boolean).forEach(value => expect(token).not.toContain(value));
    return token;
}

export function createNewTabKanjiFrontFixture(
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

export type NewTabControllerOptions = ConstructorParameters<typeof NewTabController>[0];
export type NewTabSettings = ReturnType<NewTabControllerOptions['getSettings']>;
export type NewTabSettingsSource = NewTabSettings | (() => NewTabSettings);
export type NewTabRenderedState = {
    allWords: JPDBCard[];
    visibleWords: JPDBCard[];
    index: number;
    reviewCountMode: boolean;
    sourceLabel: string;
    state: { mode: string; sort: string; filter: string; source: string; revealAnswer: boolean };
};
export type AnkiConnectRequest = { action: string; params: Record<string, unknown> };
export type AnkiConnectRequestContext = { query: string; cards: number[]; notes: number[] };
export type AnkiConnectResponder = (request: AnkiConnectRequest, context: AnkiConnectRequestContext) => unknown | Promise<unknown>;
export type NewTabLookupRenderData = {
    localEntries: unknown[];
    kanjiEntries: unknown[];
    metaEntries: unknown[];
    ankiLookup: AnkiLookupResult;
    jpdbDecks: unknown[];
    ankiDecks: unknown[];
    jpdbVocabularyInfo: unknown;
};
export type NewTabLookupRuntimeInternals<T extends NewTabLookupRenderData> = {
    settings: NewTabSettings;
    cardRenderData: { load(): { localEntries: Promise<unknown[]>; all: Promise<T> } };
    parser: { canParse(): boolean; isJpdbBackedCard(card: JPDBCard): boolean };
    showLookupCard(card: JPDBCard, sentence?: string): Promise<void>;
};

export function newTabSettingsGetter(settingsOrGetter: NewTabSettingsSource): () => NewTabSettings {
    return typeof settingsOrGetter === 'function' ? settingsOrGetter : () => settingsOrGetter;
}

export function newTabBareController(
    settingsOrGetter: NewTabSettingsSource = DEFAULT_SETTINGS,
    overrides: Partial<NewTabControllerOptions> = {},
    controllerOptions: ConstructorParameters<typeof NewTabController>[1] = {},
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
    }, controllerOptions);
}

export function disconnectedJpdbReviewBridge(): NewTabControllerOptions['jpdbReviewBridge'] {
    return {
        onUpdate: () => () => {},
        latestStatus: () => ({ connected: false }),
        requestCurrent: vi.fn(),
    } as never;
}

export function newTabLocalDictionarySummary() {
    return { dictionaries: ['Local'], dictionaryTypes: {} };
}

export function newTabEmptyDictionarySummary() {
    return { dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
}

export function newTabTermDictionarySummary(alias = 'Local') {
    return {
        dictionaries: [{ title: 'Local', alias, enabled: true, priority: 0, type: 'terms' as const }],
        terms: 1,
        kanji: 0,
        termMeta: 0,
        kanjiMeta: 0,
    };
}

export function queueNewTabGrades(...grades: Array<{
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

export function newTabFlushController(
    settingsOrGetter: NewTabSettingsSource = DEFAULT_SETTINGS,
    overrides: Partial<NewTabControllerOptions> = {},
): NewTabController {
    return newTabBareController(settingsOrGetter, {
        anki: { answerCard: vi.fn() } as never,
        jpdbReviewBridge: { onUpdate: () => () => {} } as never,
        ...overrides,
    });
}

export function newTabLocalFallbackController(
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

export function newTabDictionaryReloadFixture(options: {
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

export function newTabPublicFallbackController(
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

export function newTabBuiltInFallbackFixture(source: 'auto' | 'anki' | 'dictionary', settings: Partial<NewTabSettings> = {}) {
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

export async function expectBuiltInFallbackWords(controller: NewTabController, fallbackCardFromText: unknown) {
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

export function parseAnkiConnectRequest(init?: RequestInit): AnkiConnectRequest {
    const body = JSON.parse(String(init?.body ?? '{}')) as { action?: unknown; params?: unknown };
    const params = body.params && typeof body.params === 'object'
        ? body.params as Record<string, unknown>
        : {};
    return { action: String(body.action ?? ''), params };
}

export function ankiNumberListParam(params: Record<string, unknown>, key: string): number[] {
    const value = params[key];
    return Array.isArray(value) ? value.map(Number) : [];
}

export function stubAnkiConnectFetch(responder: AnkiConnectResponder): void {
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

export function stubPagedAnkiCandidateFetch(
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

export function newTabLookupRenderData(overrides: Partial<NewTabLookupRenderData> = {}): NewTabLookupRenderData {
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

export function setupNewTabLookupRuntime<T extends NewTabLookupRenderData>(
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

export function stubAnkiDeckSearch(deckNames: string[], findCards: (query: string) => unknown | Promise<unknown> = () => []): string[] {
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

export function newTabAnkiClient(overrides: Partial<NewTabSettings> = {}): { settings: NewTabSettings; client: AnkiConnectClient } {
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

export function seedNewTabState(controller: NewTabController, state: NewTabRenderedState['state']): void {
    Object.assign(controller as unknown as { state: NewTabRenderedState['state'] }, { state });
}

export function renderNewTabSearchRoot(controller: NewTabController, source = 'jpdb'): HTMLElement {
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

export function renderBoundNewTabSearchRoot(controller: NewTabController, source = 'jpdb'): HTMLElement {
    const root = renderNewTabSearchRoot(controller, source);
    (controller as unknown as { bindRootEvents(root: HTMLElement): void }).bindRootEvents(root);
    (controller as unknown as { searchController: { renderSearch(root: HTMLElement): void } }).searchController.renderSearch(root);
    return root;
}

export function renderPerformedNewTabSearch(controller: NewTabController, query: string, source = 'jpdb'): HTMLElement {
    const root = renderBoundNewTabSearchRoot(controller, source);
    (controller as unknown as { searchController: { performSearch(root: HTMLElement, query: string): void } }).searchController.performSearch(root, query);
    return root;
}

export function renderSeededNewTabRoot(controller: NewTabController, options: {
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

export function seedNewTabRenderedState(controller: NewTabController, options: {
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

export function renderSeededNewTabWord(controller: NewTabController, card: JPDBCard, options: {
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

export function dispatchNewTabKeyboard(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
}

export function jpdbAnkiReviewCard(): JPDBCard {
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

export function renderJpdbAnkiReviewWordFixture(options: { bindRootEvents?: boolean } = {}) {
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

export function resetNewTabReviewStorage(): void {
    document.body.replaceChildren();
    localStorage.removeItem(NEW_TAB_UI_KEY);
    localStorage.removeItem(NEW_TAB_CACHE_KEY);
    localStorage.removeItem('jpdb-reader-newtab-daily-study-time');
    sessionStorage.removeItem(NEW_TAB_CURRENT_WORD_KEY);
}

export async function expectNewTabDictionaryCard(spelling: string, root: ParentNode = document, statusLabel: string | null = 'Dictionary'): Promise<void> {
    await waitForExpect(() => {
        expect(newTabPromptText(root)).toBe(spelling);
        if (statusLabel !== null) expect(root.querySelector('[data-newtab-status]')?.textContent).toContain(statusLabel);
        expect(root.querySelector('[data-newtab-answer]')?.textContent).not.toBe('No review cards ready.');
    });
}

export function newTabStatusButton(root: ParentNode = document): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>('[data-newtab-status]')!;
}

export function expectNewTabPromptText(text: string, root: ParentNode = document): void {
    expect(newTabPromptText(root)).toBe(text);
}

export function newTabPromptText(root: ParentNode = document): string {
    return root.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-newtab-term .jpdb-reader-word')?.dataset.expression
        ?? root.querySelector('[data-newtab-prompt]')?.textContent?.trim()
        ?? '';
}

export let syntheticNewTabNavigationTime = Date.now();

export function clickNewTabNext(root: ParentNode = document): void {
    const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="next"]');
    if (!button) return;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    syntheticNewTabNavigationTime = Math.max(syntheticNewTabNavigationTime + 1_000, Date.now() + 1_000);
    Object.defineProperty(event, 'timeStamp', { configurable: true, value: syntheticNewTabNavigationTime });
    button.dispatchEvent(event);
}

export function advanceNewTabStudyCard(root: ParentNode = document, clicks = 2): void {
    for (let count = 0; count < clicks; count += 1) clickNewTabNext(root);
}

export function revealNewTabStudyCard(root: ParentNode = document): void {
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

export function showNextNewTabWord(controller: NewTabController): void {
    (controller as unknown as { showNextWord(): void }).showNextWord();
}

export function newTabSourceSelect(root: ParentNode = document): HTMLSelectElement {
    return root.querySelector<HTMLSelectElement>('[data-newtab-source-select]')!;
}

export function newTabSourceSelectValues(root: ParentNode = document): string[] {
    return Array.from(newTabSourceSelect(root).options).map(option => option.value);
}

export function switchNewTabSource(target: string, root: ParentNode = document): void {
    const select = newTabSourceSelect(root);
    select.value = target;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

export function expectNewTabMergedStatusSelect(current: string, other: string, root: ParentNode = document): void {
    const status = newTabStatusButton(root);
    expect(status.textContent).toContain('JPDB + Anki');
    expect(status.textContent).not.toContain('⇄');
    expect(status.disabled).toBe(true);
    const select = newTabSourceSelect(root);
    expect(select.hidden).toBe(false);
    expect(select.value).toBe(current);
    expect(newTabSourceSelectValues(root)).toContain(other);
}

export function expectNewTabStatusSources(sources: string[], root: ParentNode = document): void {
    expect(newTabStatusButton(root).textContent).toContain('JPDB + Anki');
    expect(Array.from(root.querySelectorAll<HTMLElement>('[data-newtab-status] .jpdb-reader-newtab-status-light')).map(light => light.dataset.source))
        .toEqual(sources);
}

export async function expectNewTabSourcePrompt(settings: { newTabSource: string }, source: string, prompt: string): Promise<void> {
    await waitForExpect(() => {
        expect(settings.newTabSource).toBe(source);
        expectNewTabPromptText(prompt);
    });
}

export function newTabJpdbAnkiSourceFixture(initialSource: 'jpdb' | 'anki') {
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

export function newTabApiSourceController(
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

export async function renderLoadedApiStats(controller: NewTabController): Promise<HTMLElement> {
    const root = renderEnabledNewTabRoot(controller, { appendToDocument: true });
    const internals = controller as unknown as {
        bindRootEvents(root: HTMLElement): void;
        loadStatsInto(root: HTMLElement, force?: boolean): Promise<void>;
    };
    internals.bindRootEvents(root);
    await internals.loadStatsInto(root, true);
    return root;
}

export function expectApiStatsSettingsButton(root: HTMLElement, showSettings: ReturnType<typeof vi.fn>): void {
    const settingsButton = root.querySelector<HTMLButtonElement>('[data-newtab-action="stats-open-jpdb-settings"]')!;
    expect(settingsButton.textContent).toBe('API settings');
    settingsButton.click();
    expect(showSettings).toHaveBeenCalledWith('api');
}

export function applySeededNewTabWords(controller: NewTabController, root: HTMLElement, options: {
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

export function newTabVisibleWordFixture(
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

export function newTabAutoReviewWordFixture(options: {
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

export function jpdbAnkiDuplicateReviewCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
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

export function ankiLookupNote(overrides: Partial<AnkiLookupResult['notes'][number]>): AnkiLookupResult['notes'][number] {
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

export function ankiLookupResult(state: AnkiLookupResult['state'], notes: AnkiLookupResult['notes']): AnkiLookupResult {
    return { state, notes, primary: notes[0] ?? null };
}

export function newTabLiveKanjiStatus() {
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

export function newTabLiveVocabularyStatus() {
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

export function newTabLiveReviewController(options: {
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

export async function renderLoadedLiveReviewFixture(mode: 'kanji' | 'word') {
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

export function renderNewTabCardFront(controller: NewTabController, card: JPDBCard, options: {
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

export function renderNewTabWordFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    return renderNewTabCardFront(controller, card);
}

export function expectRevealedPromptPitch(controller: NewTabController, card: JPDBCard, pitchClass: string): void {
    const reveal = renderNewTabCardFront(controller, card, { revealAnswer: true });
    try {
        const word = reveal.querySelector<HTMLElement>('[data-newtab-prompt] .jpdb-reader-word');
        expect(word?.dataset.pitchClass).toBe(pitchClass);
        expect(word?.classList.contains(`jpdb-pitch-${pitchClass}`)).toBe(true);
    } finally {
        reveal.remove();
    }
}

export function renderNewTabKanjiFront(controller: NewTabController, card: JPDBCard): HTMLElement {
    return renderNewTabCardFront(controller, card, { mode: 'kanji' });
}

export function renderTestKanjiDetails(options: {
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

export type NewTabSearchModeApi = {
    renderSearch(root: HTMLElement): void;
    renderSearchHandwritingCandidates(root: HTMLElement, candidates: string[], message: string): void;
    performSearch(root: HTMLElement, query: string): void;
};

export function createDictionarySearchModeFixture() {
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
    const searchApi = (controller as unknown as { searchController: NewTabSearchModeApi }).searchController;
    const root = renderBoundNewTabSearchRoot(controller, 'dictionary');

    return { settings, searchTerms, root, searchApi, controller };
}

export function newTabSearchInput(root: HTMLElement): HTMLInputElement {
    return root.querySelector<HTMLInputElement>('[data-newtab-search-input]')!;
}

export function newTabSearchResultsText(root: HTMLElement): string {
    return root.querySelector('[data-newtab-search-results]')?.textContent ?? '';
}

export function newTabSearchResultExpression(root: HTMLElement, expression: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-newtab-action="search-result-word"][data-expression="${expression}"]`);
}

export function newTabSearchAutocompleteText(root: HTMLElement): string {
    return root.querySelector('[data-newtab-search-autocomplete]')?.textContent ?? '';
}

export function stubKanjiDoodleBrowserApis(): () => void {
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

export async function withKanjiStudyCompanionMissing<T>(callback: () => Promise<T>): Promise<T> {
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


export function registerNewTabReviewCleanup(): void {
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
}

export {
    AnkiConnectClient,
    AnkiNewTabUnavailableError,
    listNewTabAnkiCards,
    cardKey,
    APP_NAME,
    NewTabController,
    selectNewTabStudyPool,
    NEW_TAB_BROWSE_DECK_LIMIT,
    NEW_TAB_PUBLIC_FALLBACK_GRACE_MS,
    NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
    renderSearchWordResults,
    searchWordDetailHtml,
    searchWordMetaItems,
    searchWordSummaryMeta,
    newTabSourceLoadPlan,
    NewTabRuntime,
    parseJpdbReviewDocument,
    installKanjiDoodle,
    KANJI_DOODLE_CLEAR_EVENT,
    assessKanjiStrokes,
    rankKanjiStrokeCandidates,
    createReaderPopover,
    BASE_DEFAULT_SETTINGS,
    testEnSettings,
    definitionSourceRows,
    renderNewTabGradeControlButtons,
    summarizeNewTabReviewSources,
    stackedSettingsFixtureDom,
    expectSettingsDialogStillMounted,
    expectStackedLookupOverSettings,
    waitForExpect,
};
export type {
    AnkiLookupResult,
    ImmersionKitExample,
    NewTabSearchDetailViewContext,
    NewTabSearchWordDetailData,
    JPDBCard,
    JPDBGrade,
    JPDBToken,
};
