import { el, replaceChildrenWith } from '../dom/builder';
import { setInnerHtml } from '../dom';
import { promiseWithTimeout, runLimited } from '../core/async-utils';
import { BoundedMap } from '../core/bounded-map';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import { Logger } from '../app/logger';
import { resolveUiLanguage, type UiCopyKey } from '../app/i18n';
import { newTabText, type NewTabCopyKey } from './i18n';
import { isKanjiCharacter } from '../popup/pitch';
import {
    targetCanHandwriteText,
    targetCanLookupCharacter,
    targetSupportsHandwriting,
    usesJapaneseCharacterStudy,
    usesJapaneseProviders,
} from '../languages/character-lookup';
import {
    activeLearningTarget,
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
} from '../languages/target-runtime';
import { installKanjiDoodle, KANJI_DOODLE_CLEAR_EVENT, type DoodleStroke } from '../kanji/doodle';
import { rankKanjiStrokeCandidates, type KanjiShapeCandidate } from '../kanji/stroke-grader';
import { orderedKanjiSourceIds, KANJI_STROKE_SOURCE_ID } from '../sources/sections';
import { cardKey, firstCardMeaning, isYomuNewTabUrl, kanjiCharacters, type NewTabUiState } from './index';
import { readStudyCardRoute } from './study-card-route';
import { newTabCardReading } from './study-queue';
import { type KanjiDetailBundle } from './kanji-detail-source';
import {
    fallbackSearchKanjiCard,
    NEW_TAB_HANDWRITING_COMMON_KANJI,
    newTabKanjiReadings,
    normalizeJpdbKanjiInfo,
    recognizeGoogleHandwriting,
} from './kanji-helpers';
import {
    appendSearchHandwritingCandidate,
    cardMatchesSearchResult,
    cardMatchesSearchSuggestion,
    dedupeSearchWords,
    normalizeSearchQuery,
    queryHasJapanese,
    searchSuggestionFromCard,
    searchWordResultOrder,
    type NewTabSearchSuggestion,
} from './card-selection';
import {
    renderSearchKanjiResults,
    renderSearchWordResults,
    searchLocalKanjiDefinitions,
    searchWordDetailHtml,
    searchWordKanjiSourceShell,
    searchWordSummaryMeta,
    type NewTabSearchDetailViewContext,
    type NewTabSearchKanjiResult,
    type NewTabSearchViewContext,
    type NewTabSearchWordDetailData,
} from './search-view';
import { jitenKanjiReadingRows } from '../jiten/jiten-kanji-info-render';
import {
    NEW_TAB_HANDWRITING_DEBOUNCE_MS,
    NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT,
    NEW_TAB_LOCAL_SEARCH_CANDIDATE_LIMIT,
    NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_MS,
    NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_ROWS,
    NEW_TAB_LOCAL_SEARCH_INDEX_MAX_MS,
    NEW_TAB_LOCAL_SEARCH_INDEX_MAX_ROWS,
    NEW_TAB_PUBLIC_SEARCH_TIMEOUT_MS,
    NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
    NEW_TAB_SEARCH_DEBOUNCE_MS,
    NEW_TAB_SEARCH_KANJI_LIMIT,
    NEW_TAB_SEARCH_SUGGESTION_LIMIT,
    NEW_TAB_SEARCH_WORD_LIMIT,
} from './controller-config';
import type { CardRenderData } from '../cards/render-data';
import type { JpdbKanjiInfo } from '../jpdb/jpdb-kanji';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { JitenKanjiInfo, JitenVocabularyInfo } from '../dictionaries/jiten';
import type { RtkInfo } from '../kanji/rtk';
import type { JPDBCard, ReaderSettings } from '../app/types';
import type { ReaderParser } from '../lookup/parser';
import type { YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import type { NewTabControllerDependencies } from './controller';
import { newTabAction, newTabActionSelector, type NewTabAction } from './actions';

const log = Logger.scope('NewTab');
const NEW_TAB_HANDWRITING_SHAPE_CACHE_LIMIT = 160;
const NEW_TAB_SEARCH_PITCH_CONCURRENCY = 4;

type NewTabTextKey = UiCopyKey | NewTabCopyKey;

interface NewTabSearchResults {
    query: string;
    words: JPDBCard[];
    kanji: NewTabSearchKanjiResult[];
    suggestions: NewTabSearchSuggestion[];
    hasLocalDictionaries: boolean;
}

interface NewTabSearchWordDetail extends NewTabSearchWordDetailData {
    wordKanjiDetails?: NewTabSearchWordKanjiDetail[];
    wordKanjiLoading?: boolean;
}

interface NewTabSearchWordKanjiDetail {
    kanji: string;
    details: KanjiDetailBundle;
}

interface SearchTargetSnapshot {
    target: ReturnType<typeof activeLearningTarget>;
    generation: number;
}

interface SearchCurrentness {
    rootConnected: boolean;
    route: 'study' | 'search' | 'stats';
    generation: number;
    targetLanguage: ReturnType<typeof activeLearningTargetLanguage>;
    targetGeneration: number;
    providerContext: string;
    query: string;
}

const SEARCH_CURRENTNESS_POLICY_FIELDS = [
    'rootConnected',
    'route',
    'generation',
    'targetLanguage',
    'targetGeneration',
    'providerContext',
    'query',
] as const satisfies readonly (keyof SearchCurrentness)[];

function searchCurrentnessMatches(current: SearchCurrentness, expected: SearchCurrentness): boolean {
    return SEARCH_CURRENTNESS_POLICY_FIELDS.every(field => current[field] === expected[field]);
}

// The slots the search surface actually touches (subset of the controller's
// NewTabStudySlots) — kept structural so the controller's private slot shape
// need not be exported.
interface SearchStudySlots {
    prompt: HTMLElement | null;
    answer: HTMLElement | null;
    meaning: HTMLElement | null;
    count: HTMLElement | null;
    status: HTMLElement | null;
    controls: HTMLElement | null;
}

// Everything the Search surface reads off the controller, made explicit. This
// interface IS the documentation of the search module's real coupling to the
// controller: UI/word state, the copy/theme/prompt scaffolding it shares with
// the study surface, the kanji-detail rendering it reuses, and the browse seam
// (the idle Search tab is the My Cards browser) it hands off to.
export interface NewTabSearchControllerDeps {
    getDependencies(): NewTabControllerDependencies;
    getState(): NewTabUiState;
    getAllWords(): JPDBCard[];
    getVisibleWords(): JPDBCard[];
    text(key: NewTabTextKey): string;
    language(): ReaderSettings['interfaceLanguage'];
    hasLocalDictionaries(): Promise<boolean>;
    loadKanjiDetails(character: string): Promise<KanjiDetailBundle>;
    renderKanjiDetails(
        card: JPDBCard,
        kanji: string,
        details: KanjiDetailBundle,
    ): HTMLElement;
    keywordFromDetails(card: JPDBCard, jpdb: JpdbKanjiInfo | null, jiten: JitenKanjiInfo | null, rtk: RtkInfo | null): string;
    renderNewTabKanjiImmersion(root: HTMLElement, kanji: string): void;
    sourceAttributes(sourceStateKey: string, initiallyExpanded?: boolean): string;
    dictionaryLabel(name: string): string;
    kanjiSourceTitle(sourceId: string): string;
    shouldEnrichWordPitch(card: JPDBCard): boolean;
    loadWordPitch(card: JPDBCard): Promise<string[]>;
    updateRenderedWordPitch(root: HTMLElement, card: JPDBCard): void;
    localSearchWithTimeout<T>(promise: Promise<T>, fallback: T): Promise<T>;
    studySlots(root: HTMLElement): SearchStudySlots;
    renderPromptSlot(promptSlot: HTMLElement | null, prompt: string, lang?: string): void;
    renderCount(countSlot: HTMLElement | null, label: string): void;
    syncMode(root: HTMLElement): void;
    syncThemeToggle(root: HTMLElement): void;
    shortParseOptions(): Parameters<NonNullable<NewTabControllerDependencies['parseContent']>>[1];
    providerContext(): string;
    // Browse seam: the idle Search tab / scoped search hands off to the My Cards
    // browser, which stays owned by the controller.
    browseScopeActive(): boolean;
    getBrowsePool(): JPDBCard[] | undefined;
    renderBrowseResults(mount: HTMLElement): void;
    renderBrowseInto(root: HTMLElement): Promise<void>;
    browseHasProviders(): boolean;
    // Enter Search mode (state mutation + persist) for a search popstate that
    // arrives while another mode is active.
    enterSearchMode(): void;
}

// Search surface extracted from the controller (Ousterhout-style module around
// the existing state model): owns the query/handwriting state and the whole
// dictionary-search pipeline — input handling, suggestion autocomplete,
// word/kanji result loading and rendering, detail expansion, and handwriting
// recognition. Does NOT own the browse/stats surfaces; every controller-side
// input flows through NewTabSearchControllerDeps.
export class NewTabSearchController {
    private searchGeneration = 0;
    private searchTargetLanguage = activeLearningTargetLanguage();
    private searchTargetGeneration = activeLearningTargetGeneration();
    private searchProviderContext = '';
    private searchDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchQuery = '';
    private handlingSearchPopstate = false;
    private searchActiveSuggestionIndex = -1;
    private searchWordCardCache = new Map<string, JPDBCard>();
    private searchHandwritingStrokes: DoodleStroke[] = [];
    private searchHandwritingGeneration = 0;
    private searchHandwritingDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchHandwritingShapeCandidateCache = new BoundedMap<string, Promise<KanjiShapeCandidate | null>>(NEW_TAB_HANDWRITING_SHAPE_CACHE_LIMIT);

    constructor(private readonly deps: NewTabSearchControllerDeps) {}

    private currentRoute(): 'study' | 'search' | 'stats' {
        return this.deps.getState().route;
    }

    // --- State bridges used by the controller -----------------------------

    get query(): string {
        return this.searchQuery;
    }

    setInitialQuery(query: string): void {
        this.searchQuery = query;
    }

    wordCard(key: string): JPDBCard | undefined {
        return this.searchWordCardCache.get(key);
    }

    // Clean-slate reset called by the controller's word-reload path.
    reset(): void {
        this.searchGeneration++;
        this.searchTargetLanguage = activeLearningTargetLanguage();
        this.searchTargetGeneration = activeLearningTargetGeneration();
        this.searchProviderContext = this.deps.providerContext();
        this.clearSearchDebounce();
        this.searchQuery = '';
        this.searchWordCardCache.clear();
        this.searchHandwritingGeneration++;
        this.clearSearchHandwritingDebounce();
        this.searchHandwritingStrokes = [];
        this.searchHandwritingShapeCandidateCache.clear();
    }

    // Account/config changes invalidate remote results without discarding the
    // learner's query; renderSearch will immediately rerun that same query.
    invalidateProviderContext(): void {
        this.searchGeneration++;
        this.searchProviderContext = this.deps.providerContext();
        this.clearSearchDebounce();
        this.searchWordCardCache.clear();
    }

    destroy(): void {
        this.clearSearchDebounce();
        this.clearSearchHandwritingDebounce();
    }

    // --- Click / keyboard routing -----------------------------------------

    // Handles the search-owned root-click actions. Returns undefined for
    // actions the controller must route elsewhere (browse), so the controller
    // stays the single click router.
    handleSearchClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: NewTabAction | undefined): boolean | undefined {
        switch (action) {
            case 'search-clear':
                event.preventDefault();
                this.clearSearch(root);
                return true;
            case 'search-focus':
                event.preventDefault();
                this.searchInput(root)?.focus();
                return true;
            case 'search-suggestion':
                event.preventDefault();
                this.selectSearchSuggestion(root, this.searchActionQuery(target));
                return true;
            case 'search-handwriting-toggle':
                event.preventDefault();
                if (targetSupportsHandwriting()) this.toggleSearchHandwriting(root);
                return true;
            case 'handwriting-candidate':
                event.preventDefault();
                if (targetCanHandwriteText(this.searchActionQuery(target))) {
                    this.acceptSearchHandwritingCandidate(root, this.searchActionQuery(target));
                }
                return true;
            case 'search-result-word':
                return this.handleSearchResultWordClick(root, target, event);
            case 'search-result-kanji':
                return this.handleSearchResultKanjiClick(target, event);
            default:
                return undefined;
        }
    }

    private searchActionQuery(target: HTMLElement): string {
        return target.closest<HTMLElement>('[data-query]')?.dataset.query ?? '';
    }

    private handleSearchResultWordClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const button = target.closest<HTMLElement>('[data-expression]');
        const key = cleanNestedLookupValue(button?.dataset.newtabCard);
        const card = key ? this.searchWordCardCache.get(key) : undefined;
        if (card && button) {
            this.toggleSearchWordResult(root, button, card);
            return true;
        }
        const expression = cleanNestedLookupValue(button?.dataset.expression);
        if (expression) void this.deps.getDependencies().lookupText?.(expression, cleanNestedLookupValue(button?.dataset.reading) || expression, button ?? target);
        return true;
    }

    private handleSearchResultKanjiClick(target: HTMLElement, event: MouseEvent): boolean {
        event.preventDefault();
        const button = target.closest<HTMLElement>('[data-kanji]');
        const kanji = cleanNestedLookupValue(button?.dataset.kanji);
        if (targetCanLookupCharacter(kanji) && button) this.toggleSearchKanjiResult(button, kanji);
        return true;
    }

    handleSearchKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement | null): boolean {
        if (!target?.closest('[data-newtab-search]')) return false;
        switch (event.key) {
            case 'Escape':
                return this.handleSearchEscapeKeydown(root, event);
            case 'ArrowDown':
                return this.handleSearchArrowDownKeydown(root, event);
            case 'ArrowUp':
                return this.handleSearchArrowUpKeydown(root, event);
            case 'Enter':
                return this.handleSearchEnterKeydown(root, event, target);
            default:
                return false;
        }
    }

    private handleSearchEscapeKeydown(root: HTMLElement, event: KeyboardEvent): boolean {
        if (!this.searchQuery) return false;
        event.preventDefault();
        this.clearSearch(root);
        return true;
    }

    private handleSearchArrowDownKeydown(root: HTMLElement, event: KeyboardEvent): boolean {
        event.preventDefault();
        return this.moveSearchSuggestion(root, 1) || this.focusFirstSearchResult(root);
    }

    private handleSearchArrowUpKeydown(root: HTMLElement, event: KeyboardEvent): boolean {
        event.preventDefault();
        return this.moveSearchSuggestion(root, -1);
    }

    private handleSearchEnterKeydown(root: HTMLElement, event: KeyboardEvent, target: HTMLElement): boolean {
        if (!target.closest('[data-newtab-search-input]')) return false;
        if (!this.selectActiveSearchSuggestion(root)) return false;
        event.preventDefault();
        return true;
    }

    // Search-input change from the controller's delegated `input` listener.
    onSearchInput(root: HTMLElement, value: string): void {
        this.searchQuery = value;
        this.searchActiveSuggestionIndex = -1;
        this.renderSearchAutocomplete(root, normalizeSearchQuery(this.searchQuery), this.localSearchSuggestions(this.searchQuery));
        this.scheduleSearch(root);
    }

    // --- Rendering --------------------------------------------------------

    renderSearch(root: HTMLElement): void {
        this.deps.syncMode(root);
        root.classList.add('jpdb-reader-newtab-revealed', 'jpdb-reader-newtab-search-mode');
        root.classList.remove(
            'jpdb-reader-newtab-setup-mode',
            'jpdb-reader-newtab-empty-mode',
            'jpdb-reader-newtab-review-mode',
            'jpdb-reader-newtab-kanji-mode',
            'jpdb-reader-newtab-doodle-pass',
            'jpdb-reader-newtab-doodle-fail',
        );
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
        this.deps.syncThemeToggle(root);

        const slots = this.deps.studySlots(root);
        this.deps.renderPromptSlot(slots.prompt, this.deps.text('search'), resolveUiLanguage(this.deps.language()) === 'ja' ? 'ja' : 'en');
        setOptionalText(slots.answer, '');
        setOptionalText(slots.meaning, '');
        this.deps.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        if (slots.controls) {
            slots.controls.hidden = true;
            slots.controls.replaceChildren();
        }

        this.setSearchQuery(root, this.searchQuery);
        this.installSearchHandwriting(root);
        const query = normalizeSearchQuery(this.searchQuery);
        this.renderSearchAutocomplete(root, query, this.localSearchSuggestions(query));
        const results = this.searchResultsMount(root);
        if (!query) {
            this.renderSearchIdle(root);
        } else if (this.deps.browseScopeActive() && this.deps.getBrowsePool() && results) {
            // SH-3 v2: with a state chip or deck scope active, typing
            // searches MY cards (Jiten Cards parity / 2D reviews); with no
            // scope the default stays dictionary search.
            delete results.dataset.searchQuery;
            delete results.dataset.searchTarget;
            this.deps.renderBrowseResults(results);
        } else if (results?.dataset.searchQuery !== query
            || results.dataset.searchTarget !== this.targetSnapshotSignature(this.captureTargetSnapshot())) {
            this.performSearch(root, query);
        }
        void this.parseSearchSurfaces(root, this.searchGeneration, query);
        this.focusSearchInput(root);
    }

    private setSearchQuery(root: HTMLElement, query: string): void {
        this.searchQuery = query;
        const input = this.searchInput(root);
        if (input && input.value !== query) input.value = query;
        this.renderSearchAutocomplete(root, normalizeSearchQuery(query), this.localSearchSuggestions(query));
    }

    selectSearchSuggestion(root: HTMLElement, query: string): void {
        if (!query) return;
        this.searchActiveSuggestionIndex = -1;
        this.setSearchQuery(root, query);
        this.performSearch(root, query);
    }

    private searchInput(root: HTMLElement): HTMLInputElement | null {
        return root.querySelector<HTMLInputElement>('[data-newtab-search-input]');
    }

    private searchResultsMount(root: HTMLElement): HTMLElement | null {
        return root.querySelector<HTMLElement>('[data-newtab-search-results]');
    }

    private searchSuggestionButtons(root: HTMLElement): HTMLButtonElement[] {
        return Array.from(root.querySelectorAll<HTMLButtonElement>(`[data-newtab-search-autocomplete] ${newTabActionSelector('search-suggestion')}`));
    }

    private setSearchActiveSuggestion(root: HTMLElement, index: number): boolean {
        const suggestions = this.searchSuggestionButtons(root);
        if (!suggestions.length) {
            this.searchActiveSuggestionIndex = -1;
            this.searchInput(root)?.removeAttribute('aria-activedescendant');
            return false;
        }
        this.searchActiveSuggestionIndex = Math.max(0, Math.min(index, suggestions.length - 1));
        suggestions.forEach((suggestion, suggestionIndex) => {
            const active = suggestionIndex === this.searchActiveSuggestionIndex;
            suggestion.dataset.active = String(active);
            suggestion.setAttribute('aria-selected', String(active));
            suggestion.tabIndex = -1;
        });
        const activeSuggestion = suggestions[this.searchActiveSuggestionIndex];
        if (activeSuggestion.id) this.searchInput(root)?.setAttribute('aria-activedescendant', activeSuggestion.id);
        return true;
    }

    private moveSearchSuggestion(root: HTMLElement, direction: 1 | -1): boolean {
        const suggestions = this.searchSuggestionButtons(root);
        if (!suggestions.length) return false;
        const current = this.searchActiveSuggestionIndex >= 0 ? this.searchActiveSuggestionIndex : (direction > 0 ? -1 : suggestions.length);
        const next = (current + direction + suggestions.length) % suggestions.length;
        return this.setSearchActiveSuggestion(root, next);
    }

    private selectActiveSearchSuggestion(root: HTMLElement): boolean {
        const suggestions = this.searchSuggestionButtons(root);
        const suggestion = suggestions[this.searchActiveSuggestionIndex];
        const query = suggestion?.dataset.query ?? '';
        if (!query) return false;
        this.selectSearchSuggestion(root, query);
        return true;
    }

    private focusFirstSearchResult(root: HTMLElement): boolean {
        const target = root.querySelector<HTMLElement>(
            `[data-newtab-search-results] ${newTabActionSelector('search-result-kanji')}, `
            + `[data-newtab-search-results] ${newTabActionSelector('search-result-word')}, `
            + '[data-newtab-search-results] a, '
            + '[data-newtab-search-results] button',
        );
        if (!target) return false;
        target.focus();
        return true;
    }

    private focusSearchInput(root: HTMLElement): void {
        const input = this.searchInput(root);
        if (!input || input === document.activeElement) return;
        window.setTimeout(() => {
            const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const canFocus = !active || active === document.body || Boolean(active.closest(newTabActionSelector('mode')));
            if (this.currentRoute() === 'search' && input.isConnected && canFocus) input.focus();
        }, 0);
    }

    private clearSearch(root: HTMLElement): void {
        this.searchGeneration++;
        this.clearSearchDebounce();
        this.searchActiveSuggestionIndex = -1;
        this.setSearchQuery(root, '');
        this.syncSearchUrl('');
        this.clearSearchHandwriting(root);
        this.renderSearchIdle(root);
        this.searchInput(root)?.focus();
    }

    private scheduleSearch(root: HTMLElement): void {
        this.clearSearchDebounce();
        const query = normalizeSearchQuery(this.searchQuery);
        if (!query) {
            this.searchGeneration++;
            this.renderSearchIdle(root);
            return;
        }
        this.searchDebounce = setTimeout(() => this.performSearch(root, query), NEW_TAB_SEARCH_DEBOUNCE_MS);
    }

    private clearSearchDebounce(): void {
        if (this.searchDebounce === undefined) return;
        clearTimeout(this.searchDebounce);
        this.searchDebounce = undefined;
    }

    private clearSearchHandwritingDebounce(): void {
        if (this.searchHandwritingDebounce === undefined) return;
        clearTimeout(this.searchHandwritingDebounce);
        this.searchHandwritingDebounce = undefined;
    }

    private clearSearchHandwriting(root: HTMLElement): void {
        this.searchHandwritingGeneration++;
        this.searchHandwritingStrokes = [];
        this.clearSearchHandwritingDebounce();
        root.querySelector<HTMLElement>('[data-newtab-handwriting]')?.dispatchEvent(new Event(KANJI_DOODLE_CLEAR_EVENT));
        this.renderSearchHandwritingCandidates(root, [], '');
    }

    private acceptSearchHandwritingCandidate(root: HTMLElement, query: string): void {
        const candidate = normalizeSearchQuery(query);
        if (!candidate) return;
        const currentQuery = this.searchInput(root)?.value ?? this.searchQuery;
        const nextQuery = appendSearchHandwritingCandidate(currentQuery, candidate);
        this.searchActiveSuggestionIndex = -1;
        this.clearSearchHandwriting(root);
        this.performSearch(root, nextQuery);
        this.toggleSearchHandwriting(root, true);
    }

    private installSearchHandwriting(root: HTMLElement): void {
        if (!targetSupportsHandwriting()) {
            root.querySelector<HTMLElement>('[data-newtab-handwriting]')?.remove();
            this.syncSearchHandwritingToggle(root);
            return;
        }
        const panel = this.ensureSearchHandwritingPanel(root);
        this.syncSearchHandwritingToggle(root);
        if (panel && panel.dataset.newtabHandwritingToggleBound !== 'true') {
            panel.dataset.newtabHandwritingToggleBound = 'true';
            panel.addEventListener('toggle', () => this.syncSearchHandwritingToggle(root));
        }
        if (typeof ResizeObserver !== 'function') return;
        if (!panel || panel.dataset.newtabHandwritingBound === 'true') return;
        panel.dataset.newtabHandwritingBound = 'true';
        installKanjiDoodle(panel, () => this.deps.getDependencies().getSettings().interfaceLanguage, {
            onChange: strokes => {
                this.searchHandwritingStrokes = strokes;
                this.scheduleSearchHandwritingRecognition(root);
            },
            onClear: () => {
                this.searchHandwritingGeneration++;
                this.searchHandwritingStrokes = [];
                this.clearSearchHandwritingDebounce();
                this.renderSearchHandwritingCandidates(root, [], '');
            },
        });
    }

    private ensureSearchHandwritingPanel(root: HTMLElement): HTMLElement | null {
        if (!targetSupportsHandwriting()) return null;
        const existing = root.querySelector<HTMLElement>('[data-newtab-handwriting]');
        if (existing) return existing;
        const results = this.searchResultsMount(root);
        if (!results?.parentElement) return null;
        const panel = renderSearchHandwritingPanel(this.deps.language());
        results.parentElement.insertBefore(panel, results);
        return panel;
    }

    private toggleSearchHandwriting(root: HTMLElement, open?: boolean): void {
        if (!targetSupportsHandwriting()) return;
        const panel = this.ensureSearchHandwritingPanel(root) as HTMLDetailsElement | null;
        if (!panel) return;
        panel.open = open ?? !panel.open;
        this.syncSearchHandwritingToggle(root);
        if (!panel.open) return;
        this.focusSearchHandwritingCanvas(panel);
    }

    private focusSearchHandwritingCanvas(panel: HTMLElement): void {
        const focusCanvas = () => {
            panel.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas')?.focus();
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(focusCanvas);
        else window.setTimeout(focusCanvas, 0);
    }

    private syncSearchHandwritingToggle(root: HTMLElement): void {
        const panel = root.querySelector<HTMLDetailsElement>('[data-newtab-handwriting]');
        const toggle = root.querySelector<HTMLButtonElement>(newTabActionSelector('search-handwriting-toggle'));
        if (!toggle) return;
        const enabled = targetSupportsHandwriting();
        toggle.hidden = !enabled;
        toggle.disabled = !enabled;
        toggle.setAttribute('aria-expanded', String(enabled && Boolean(panel?.open)));
    }

    private scheduleSearchHandwritingRecognition(root: HTMLElement): void {
        if (!targetSupportsHandwriting()) {
            this.clearSearchHandwriting(root);
            return;
        }
        this.searchHandwritingGeneration++;
        this.clearSearchHandwritingDebounce();
        const strokes = this.searchHandwritingStrokes.map(stroke => [...stroke]);
        if (!strokes.length) {
            this.renderSearchHandwritingCandidates(root, [], '');
            return;
        }
        this.renderSearchHandwritingCandidates(root, [], this.deps.text('searchRecognizing'));
        const generation = this.searchHandwritingGeneration;
        this.searchHandwritingDebounce = setTimeout(() => {
            void this.recognizeSearchHandwriting(root, strokes, generation);
        }, NEW_TAB_HANDWRITING_DEBOUNCE_MS);
    }

    private async recognizeSearchHandwriting(root: HTMLElement, strokes: DoodleStroke[], generation: number): Promise<void> {
        if (!targetSupportsHandwriting()) return;
        const target = activeLearningTarget();
        const recognizedCandidates = await recognizeGoogleHandwriting(strokes, target).catch(error => {
            log.warn('Search handwriting failed', error);
            return [];
        });
        const geometryCandidates = recognizedCandidates.length >= 8 ? [] : await this.recognizeSearchHandwritingByGeometry(strokes).catch(error => {
            log.warn('Search handwriting geometry failed', error);
            return [];
        });
        if (activeLearningTarget() !== target || !root.isConnected || this.currentRoute() !== 'search' || generation !== this.searchHandwritingGeneration) return;
        const candidates = uniqueStrings([...recognizedCandidates, ...geometryCandidates])
            .filter(candidate => targetCanHandwriteText(candidate, target))
            .slice(0, 8);
        const message = candidates.length ? '' : this.deps.text('searchNoHandwritingMatch');
        this.renderSearchHandwritingCandidates(root, candidates, message);
    }

    private async recognizeSearchHandwritingByGeometry(strokes: DoodleStroke[]): Promise<string[]> {
        if (!usesJapaneseCharacterStudy()) return [];
        const characters = await this.searchHandwritingGeometryCharacters();
        if (!characters.length) return [];
        const candidates = (await Promise.all(characters.map(character => this.searchHandwritingShapeCandidate(character))))
            .filter((candidate): candidate is KanjiShapeCandidate => Boolean(candidate));
        return rankKanjiStrokeCandidates(strokes, candidates, 8).map(match => match.kanji);
    }

    private async searchHandwritingGeometryCharacters(): Promise<string[]> {
        if (!usesJapaneseCharacterStudy()) return [];
        const settings = this.deps.getDependencies().getSettings();
        const commonCharacters = uniqueStrings(Array.from(NEW_TAB_HANDWRITING_COMMON_KANJI)).slice(0, 200);
        const deckCharacters = uniqueStrings([
            ...this.deps.getVisibleWords().flatMap(card => kanjiCharacters(card.spelling)),
            ...this.deps.getAllWords().flatMap(card => kanjiCharacters(card.spelling)),
        ]);
        const dictionaryLimit = Math.max(0, NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT - commonCharacters.length - deckCharacters.length);
        const dictionaryCharacters = settings.localDictionariesEnabled
            ? await this.deps.getDependencies().dictionaries.listKanjiCharacters?.(dictionaryLimit, settings.dictionaryPreferences).catch(() => []) ?? []
            : [];
        return uniqueStrings([
            ...commonCharacters,
            ...deckCharacters,
            ...dictionaryCharacters,
        ]).slice(0, NEW_TAB_HANDWRITING_GEOMETRY_CANDIDATE_LIMIT);
    }

    private searchHandwritingShapeCandidate(character: string): Promise<KanjiShapeCandidate | null> {
        if (!usesJapaneseProviders() || !targetCanLookupCharacter(character)) return Promise.resolve(null);
        let promise = this.searchHandwritingShapeCandidateCache.get(character);
        if (!promise) {
            promise = this.deps.getDependencies().kanjiVG.lookup(character)
                .then(info => info?.strokeShapes?.length ? { kanji: info.kanji, strokeShapes: info.strokeShapes } : null)
                .catch(() => null);
            this.searchHandwritingShapeCandidateCache.set(character, promise);
        }
        return promise;
    }

    private renderSearchHandwritingCandidates(root: HTMLElement, candidates: string[], message: string): void {
        const mount = root.querySelector<HTMLElement>('[data-newtab-handwriting-candidates]');
        if (!mount) return;
        if (!targetSupportsHandwriting()) {
            mount.hidden = true;
            mount.replaceChildren();
            return;
        }
        const target = activeLearningTarget();
        candidates = candidates.filter(candidate => targetCanHandwriteText(candidate, target));
        mount.hidden = !candidates.length && !message;
        replaceChildrenWith(mount,
            candidates.map(candidate => el('button', {
                class: 'jpdb-reader-parseable',
                type: 'button',
                dataset: { newtabAction: newTabAction('handwriting-candidate'), query: candidate },
                lang: target.typography.contentLocale,
                dir: target.direction,
            }, candidate)),
            message ? el('span', { class: 'jpdb-reader-newtab-handwriting-message jpdb-reader-parseable', lang: resolveUiLanguage(this.deps.language()) === 'ja' ? 'ja' : 'en' }, message) : null,
            message && !candidates.length ? renderSearchHandwritingManualAction(this.deps.language()) : null,
        );
    }

    performSearchFromInput(root: HTMLElement): void {
        const query = this.searchInput(root)?.value ?? '';
        this.setSearchQuery(root, query);
        this.performSearch(root, query);
    }

    performSearch(root: HTMLElement, rawQuery: string): void {
        this.clearSearchDebounce();
        const target = activeLearningTarget();
        this.searchTargetLanguage = target.language;
        this.searchTargetGeneration = activeLearningTargetGeneration();
        this.searchProviderContext = this.deps.providerContext();
        const targetGeneration = this.searchTargetGeneration;
        const query = normalizeSearchQuery(rawQuery);
        this.setSearchQuery(root, query);
        this.syncSearchUrl(query);
        if (!query) {
            this.searchGeneration++;
            this.renderSearchIdle(root);
            return;
        }

        const generation = ++this.searchGeneration;
        this.renderSearchLoading(root, query);
        void this.loadSearchResults(query, target, targetGeneration).then(results => {
            if (!this.isCurrentSearch(root, generation, query)) return;
            this.renderSearchResults(root, results);
        }).catch(error => {
            log.warn('New tab search failed', { query }, error);
            if (this.isCurrentSearch(root, generation, query)) this.renderSearchError(root, query);
        });
    }

    private isCurrentSearch(root: HTMLElement, generation: number, query: string): boolean {
        return searchCurrentnessMatches({
            rootConnected: root.isConnected,
            route: this.currentRoute(),
            generation: this.searchGeneration,
            targetLanguage: activeLearningTargetLanguage(),
            targetGeneration: activeLearningTargetGeneration(),
            providerContext: this.deps.providerContext(),
            query: normalizeSearchQuery(this.searchQuery),
        }, {
            rootConnected: true,
            route: 'search',
            generation,
            targetLanguage: this.searchTargetLanguage,
            targetGeneration: this.searchTargetGeneration,
            providerContext: this.searchProviderContext,
            query,
        });
    }

    private captureTargetSnapshot(): SearchTargetSnapshot {
        return {
            target: activeLearningTarget(),
            generation: activeLearningTargetGeneration(),
        };
    }

    private targetSnapshotIsCurrent(snapshot: SearchTargetSnapshot): boolean {
        return activeLearningTarget() === snapshot.target
            && activeLearningTargetGeneration() === snapshot.generation;
    }

    private targetSnapshotSignature(snapshot: SearchTargetSnapshot): string {
        return `${snapshot.target.id}:${snapshot.generation}:${this.deps.providerContext()}`;
    }

    private async loadSearchResults(
        query: string,
        target: ReturnType<typeof activeLearningTarget>,
        targetGeneration: number,
    ): Promise<NewTabSearchResults> {
        const settings = this.deps.getDependencies().getSettings();
        const hasLocalDictionaries = settings.localDictionariesEnabled && await this.deps.hasLocalDictionaries();
        const words = await this.searchWordCards(query, hasLocalDictionaries, target, targetGeneration);
        if (activeLearningTarget() !== target
            || activeLearningTargetGeneration() !== targetGeneration) {
            return { query, words: [], kanji: [], suggestions: [], hasLocalDictionaries };
        }
        const kanji = await this.searchKanjiCards(query, words, { target, generation: targetGeneration });
        return {
            query,
            words,
            kanji,
            suggestions: this.searchSuggestions(query, words),
            hasLocalDictionaries,
        };
    }

    private async searchWordCards(
        query: string,
        hasLocalDictionaries: boolean,
        target: ReturnType<typeof activeLearningTarget>,
        targetGeneration: number,
    ): Promise<JPDBCard[]> {
        const settings = this.deps.getDependencies().getSettings();
        const parsedPromise = usesJapaneseProviders() && queryHasJapanese(query)
            ? this.deps.getDependencies().parser.parse([query]).catch(() => [[]])
            : Promise.resolve([[]] as Awaited<ReturnType<ReaderParser['parse']>>);
        const localEntriesPromise = settings.localDictionariesEnabled && hasLocalDictionaries
            ? this.deps.localSearchWithTimeout(this.searchLocalDictionaryEntries(query, settings), [] as YomitanTermEntry[])
            : Promise.resolve([]);
        const publicJpdbPromise = this.searchPublicJpdbCards(query);

        const loadedCards = this.searchLoadedWordCards(query);
        const [parsed, localEntries, publicJpdbCards] = await Promise.all([parsedPromise, localEntriesPromise, publicJpdbPromise]);
        if (activeLearningTarget() !== target
            || activeLearningTargetGeneration() !== targetGeneration) return [];
        const parsedCards = (parsed[0] ?? []).map(token => ({ ...token.card, sentence: token.sentence ?? query }));
        const localCards = localEntries
            .map(entry => ({ ...this.deps.getDependencies().parser.localCardFromEntry(entry, target), sentence: query }));
        return dedupeSearchWords(searchWordResultOrder(query, { parsedCards, publicJpdbCards, loadedCards, localCards }))
            .slice(0, NEW_TAB_SEARCH_WORD_LIMIT);
    }

    async searchPublicJpdbCards(query: string, limit = NEW_TAB_SEARCH_WORD_LIMIT): Promise<JPDBCard[]> {
        if (!usesJapaneseProviders()) return [];
        const jpdbVocabulary = this.deps.getDependencies().jpdbVocabulary;
        if (!jpdbVocabulary?.search) return [];
        const cards = await promiseWithTimeout(
            jpdbVocabulary.search(query, limit),
            NEW_TAB_PUBLIC_SEARCH_TIMEOUT_MS,
            'Public JPDB search timed out.',
        )
            .catch(error => {
                log.warn('New tab public JPDB search failed', { query, error });
                return [];
            });
        return usesJapaneseProviders() ? cards : [];
    }

    private searchLoadedWordCards(query: string): JPDBCard[] {
        const normalized = normalizeSearchQuery(query).toLocaleLowerCase();
        if (!normalized) return [];
        return this.deps.getAllWords().filter(card => cardMatchesSearchResult(card, normalized));
    }

    private async searchLocalDictionaryEntries(query: string, settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        const searchTerms = this.deps.getDependencies().dictionaries.searchTerms;
        if (typeof searchTerms === 'function') {
            return searchTerms.call(
                this.deps.getDependencies().dictionaries,
                query,
                NEW_TAB_SEARCH_WORD_LIMIT,
                settings.dictionaryPreferences,
                {
                    candidateLimit: NEW_TAB_LOCAL_SEARCH_CANDIDATE_LIMIT,
                    glossaryIndexMaxRows: NEW_TAB_LOCAL_SEARCH_INDEX_MAX_ROWS,
                    glossaryIndexMaxMs: NEW_TAB_LOCAL_SEARCH_INDEX_MAX_MS,
                    glossaryFallbackMaxRows: NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_ROWS,
                    glossaryFallbackMaxMs: NEW_TAB_LOCAL_SEARCH_FALLBACK_MAX_MS,
                    fallbackWhileIndexing: false,
                    prepareIndex: false,
                },
            ).catch(() => []);
        }

        const [directEntries, matchedEntries] = await Promise.all([
            this.deps.getDependencies().dictionaries.lookup(query, query, NEW_TAB_SEARCH_WORD_LIMIT, settings.dictionaryPreferences).catch(() => []),
            this.deps.getDependencies().dictionaries.findTermMatches(query, NEW_TAB_SEARCH_WORD_LIMIT, settings.dictionaryPreferences).catch(() => []),
        ]);
        return [...directEntries, ...matchedEntries.map(match => match.entry)];
    }

    private searchSuggestions(query: string, resultCards: JPDBCard[]): NewTabSearchSuggestion[] {
        return this.cardSearchSuggestions(query, [
            ...resultCards,
            ...this.deps.getAllWords(),
        ]);
    }

    private localSearchSuggestions(rawQuery: string): NewTabSearchSuggestion[] {
        const query = normalizeSearchQuery(rawQuery);
        return query ? this.cardSearchSuggestions(query, this.deps.getAllWords()) : [];
    }

    private cardSearchSuggestions(query: string, cards: JPDBCard[]): NewTabSearchSuggestion[] {
        const normalized = normalizeSearchQuery(query).toLocaleLowerCase();
        if (!normalized) return [];
        const suggestions: NewTabSearchSuggestion[] = [];
        const seen = new Set<string>();
        for (const card of cards) {
            if (!cardMatchesSearchSuggestion(card, normalized)) continue;
            const suggestion = searchSuggestionFromCard(card);
            if (!suggestion.query || seen.has(suggestion.query)) continue;
            suggestions.push(suggestion);
            seen.add(suggestion.query);
            if (suggestions.length >= NEW_TAB_SEARCH_SUGGESTION_LIMIT) break;
        }
        return suggestions;
    }

    private async searchKanjiCards(
        query: string,
        wordCards: JPDBCard[] = [],
        targetSnapshot = this.captureTargetSnapshot(),
    ): Promise<NewTabSearchKanjiResult[]> {
        if (!this.targetSnapshotIsCurrent(targetSnapshot) || !usesJapaneseCharacterStudy()) return [];
        const characters = uniqueStrings([
            ...kanjiCharacters(query),
            ...wordCards.flatMap(card => kanjiCharacters(card.spelling)),
        ]).filter(targetCanLookupCharacter).slice(0, NEW_TAB_SEARCH_KANJI_LIMIT);
        const summaryWordCards = wordCards.filter(card => !this.searchWordMatchesQueryExactly(card, query));
        const wordsByCharacter = new Map<string, JPDBCard[]>();
        summaryWordCards.forEach(card => {
            kanjiCharacters(card.spelling).forEach(character => {
                wordsByCharacter.set(character, [...(wordsByCharacter.get(character) ?? []), card]);
            });
        });
        const results = await Promise.all(characters.map(character => this.searchKanjiResult(
            character,
            wordsByCharacter.get(character) ?? [],
            wordCards,
            targetSnapshot,
        )));
        if (!this.targetSnapshotIsCurrent(targetSnapshot) || !usesJapaneseCharacterStudy()) return [];
        return results.filter((result): result is NewTabSearchKanjiResult => Boolean(result));
    }

    private searchWordMatchesQueryExactly(card: JPDBCard, query: string): boolean {
        const normalizedQuery = normalizedSearchWordIdentity(query);
        return Boolean(normalizedQuery)
            && (normalizedSearchWordIdentity(card.spelling) === normalizedQuery
                || normalizedSearchWordIdentity(newTabCardReading(card)) === normalizedQuery);
    }

    private async searchKanjiResult(
        character: string,
        words: JPDBCard[] = [],
        parentCards: JPDBCard[] = [],
        targetSnapshot = this.captureTargetSnapshot(),
    ): Promise<NewTabSearchKanjiResult | null> {
        if (!this.targetSnapshotIsCurrent(targetSnapshot) || !targetCanLookupCharacter(character)) return null;
        const details = await this.deps.loadKanjiDetails(character).catch(error => {
            log.debug('Search kanji summary details unavailable', { kanji: character, error });
            return {
                jpdb: null,
                jiten: null,
                rtk: null,
                vg: null,
                local: [],
                sourceInfo: null,
                sourceStates: {
                    jpdb: 'unavailable',
                    jiten: 'unavailable',
                    rtk: 'unavailable',
                    vg: 'unavailable',
                    local: 'unavailable',
                    origin: 'unavailable',
                },
            } satisfies KanjiDetailBundle;
        });
        if (!this.targetSnapshotIsCurrent(targetSnapshot) || !targetCanLookupCharacter(character)) return null;
        const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
        const parentMeanings = searchParentMeaningKeys(parentCards, character);
        const meanings = uniqueStrings([
            ...(details.jiten?.meanings ?? []),
            ...details.local.flatMap(entry => entry.meanings),
        ])
            .filter(meaning => !parentMeanings.has(normalizedKeywordText(meaning)))
            .slice(0, 6);
        const readings = details.jiten
            ? jitenKanjiReadingRows(details.jiten).slice(0, 8)
            : newTabKanjiReadings(fullInfo, uniqueStrings(details.local.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))).slice(0, 8);
        const card = this.deps.getDependencies().parser.fallbackCardFromText?.(character, targetSnapshot.target)
            ?? fallbackSearchKanjiCard(character);
        const sourceKeyword = this.deps.keywordFromDetails(card, fullInfo, details.jiten, details.rtk);
        return {
            character,
            keyword: sourceKeyword || meanings[0] || '',
            readings,
            meanings,
            words,
        };
    }

    private toggleSearchWordResult(root: HTMLElement, button: HTMLElement, card: JPDBCard): void {
        const existing = this.expandSearchResultDetail(button);
        if (!existing) return;
        const targetSnapshot = this.captureTargetSnapshot();
        const kanjiDetailsPromise = this.shouldLoadSearchWordKanjiDetails(card)
            ? this.loadSearchWordKanjiDetails(card, targetSnapshot)
            : null;
        let renderedDetail: NewTabSearchWordDetail = {
            ...this.instantSearchWordDetail(),
            wordKanjiLoading: Boolean(kanjiDetailsPromise),
        };
        const canRender = () => root.isConnected
            && existing.isConnected
            && this.targetSnapshotIsCurrent(targetSnapshot)
            && button.getAttribute('aria-expanded') === 'true';
        const renderCurrentDetail = () => {
            if (!canRender()) return;
            this.renderSearchWordDetail(existing, card, renderedDetail, targetSnapshot);
        };
        renderCurrentDetail();
        void this.loadSearchWordDetail(card).then(detail => {
            renderedDetail = {
                ...detail,
                wordKanjiDetails: renderedDetail.wordKanjiDetails,
                wordKanjiLoading: Boolean(kanjiDetailsPromise && !renderedDetail.wordKanjiDetails),
            };
            renderCurrentDetail();
            if (!usesJapaneseProviders()) return;
            const { hydratePitchAccent, hydrateFrequencyRanks, hydrateBunproDefinitionResult, hydrateBunproDefinitionInfo } = this.deps.getDependencies();
            if (hydratePitchAccent) {
                const renderedPitchKey = card.pitchAccent.join('|');
                void hydratePitchAccent(card).then(pitchAccent => {
                    if (!usesJapaneseProviders() || !canRender()) return;
                    if (!card.pitchAccent.length && pitchAccent.length) card.pitchAccent = [...pitchAccent];
                    if (renderedPitchKey === card.pitchAccent.join('|')) return;
                    renderCurrentDetail();
                }).catch(error => {
                    log.debug('Search pitch hydration failed', { term: card.spelling, error });
                });
            }
            if (hydrateFrequencyRanks) {
                void hydrateFrequencyRanks(card).then(frequencyRanks => {
                    if (!usesJapaneseProviders() || !canRender()) return;
                    if (JSON.stringify(renderedDetail.frequencyRanks ?? {}) === JSON.stringify(frequencyRanks)) return;
                    renderedDetail = { ...renderedDetail, frequencyRanks };
                    renderCurrentDetail();
                }).catch(error => {
                    log.debug('Search provider frequency hydration failed', { term: card.spelling, error });
                });
            }
            if (hydrateBunproDefinitionResult) {
                void hydrateBunproDefinitionResult(card).then(result => {
                    if (!usesJapaneseProviders() || !canRender()) return;
                    const unchangedInfo = renderedDetail.bunproDefinitionInfo === result.info;
                    const unchangedStatus = JSON.stringify(renderedDetail.bunproDefinitionStatus) === JSON.stringify(result.status);
                    if (unchangedInfo && unchangedStatus) return;
                    renderedDetail = {
                        ...renderedDetail,
                        bunproDefinitionInfo: result.info,
                        bunproDefinitionStatus: result.status,
                    };
                    renderCurrentDetail();
                }).catch(error => {
                    log.debug('Search Bunpro definition hydration failed', { term: card.spelling, error });
                });
            } else if (!detail.bunproDefinitionInfo && hydrateBunproDefinitionInfo) {
                void hydrateBunproDefinitionInfo(card).then(info => {
                    if (!usesJapaneseProviders() || !canRender()) return;
                    if (!info) return;
                    renderedDetail = { ...renderedDetail, bunproDefinitionInfo: info };
                    renderCurrentDetail();
                }).catch(error => {
                    log.debug('Search Bunpro definition hydration failed', { term: card.spelling, error });
                });
            }
        }).catch(error => {
            log.warn('New tab search detail failed', { term: card.spelling }, error);
            if (canRender()) replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.deps.text('searchLocalDictionariesFailed')));
        });
        void kanjiDetailsPromise?.then(details => {
            renderedDetail = {
                ...renderedDetail,
                wordKanjiDetails: details,
                wordKanjiLoading: false,
            };
            renderCurrentDetail();
        }).catch(error => {
            log.warn('Search word kanji failed', { term: card.spelling }, error);
            renderedDetail = {
                ...renderedDetail,
                wordKanjiDetails: [],
                wordKanjiLoading: false,
            };
            renderCurrentDetail();
        });
    }

    private expandSearchResultDetail(button: HTMLElement): HTMLElement | null {
        const host = button.closest<HTMLElement>('[data-newtab-search-card-shell]');
        const existing = host?.querySelector<HTMLElement>('[data-newtab-search-detail]');
        if (!host || !existing) return null;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!expanded));
        existing.hidden = expanded;
        if (expanded) {
            delete host.dataset.newtabSearchExpanded;
            return null;
        }
        host.dataset.newtabSearchExpanded = 'true';
        return existing;
    }

    private instantSearchWordDetail(): NewTabSearchWordDetail {
        return {
            localEntries: [],
            kanjiEntries: [],
            metaEntries: [],
            jpdbVocabularyInfo: null,
            loading: true,
        };
    }

    private async loadSearchWordDetail(card: JPDBCard): Promise<NewTabSearchWordDetail> {
        const renderedData = await this.loadRenderedSearchWordDetail(card);
        if (renderedData) return searchWordDetailFromRenderedData(renderedData);

        const settings = this.deps.getDependencies().getSettings();
        const [localEntries, kanjiEntries, metaEntries, jpdbVocabularyInfo, jitenVocabularyInfo] = await Promise.all([
            this.loadSearchLocalEntries(card, settings),
            this.loadSearchKanjiEntries(card, settings),
            this.loadSearchMetaEntries(card, settings),
            this.loadSearchJpdbVocabularyInfo(card),
            this.loadSearchJitenVocabularyInfo(card, settings),
        ]);
        return { localEntries, kanjiEntries, metaEntries, jpdbVocabularyInfo, jitenVocabularyInfo };
    }

    private async loadRenderedSearchWordDetail(card: JPDBCard): Promise<CardRenderData | null> {
        return await this.deps.getDependencies().loadCardRenderData?.(card).catch(error => {
            log.warn('Search render data unavailable', { term: card.spelling }, error);
            return null;
        }) ?? null;
    }

    private loadSearchLocalEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        const lookupTerms = this.deps.getDependencies().dictionaries.lookup;
        if (!settings.localDictionariesEnabled || typeof lookupTerms !== 'function') return Promise.resolve([]);
        return this.deps.localSearchWithTimeout(
            lookupTerms.call(this.deps.getDependencies().dictionaries, card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences),
            [] as YomitanTermEntry[],
        );
    }

    private loadSearchKanjiEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanKanjiEntry[]> {
        if (!targetCanLookupCharacter(card.spelling) || !settings.localDictionariesEnabled || !settings.localDictionaryShowKanji || !isSearchLocalKanjiDictionaryCard(card)) return Promise.resolve([]);
        return this.deps.localSearchWithTimeout(
            this.deps.getDependencies().dictionaries.lookupKanji?.(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences) ?? Promise.resolve([]),
            [] as YomitanKanjiEntry[],
        );
    }

    private loadSearchMetaEntries(card: JPDBCard, settings: ReaderSettings): Promise<YomitanMetaEntry[]> {
        const lookupTermMeta = this.deps.getDependencies().dictionaries.lookupTermMeta;
        if (!settings.localDictionariesEnabled || typeof lookupTermMeta !== 'function') return Promise.resolve([]);
        return this.deps.localSearchWithTimeout(
            lookupTermMeta.call(this.deps.getDependencies().dictionaries, card.spelling, 12, settings.dictionaryPreferences),
            [] as YomitanMetaEntry[],
        );
    }

    private loadSearchJpdbVocabularyInfo(card: JPDBCard): Promise<JpdbVocabularyInfo | null> {
        const jpdbVocabulary = this.deps.getDependencies().jpdbVocabulary;
        // Keyless: jpdbVocabulary scrapes the public site (cached + backoff); the
        // JPDB definitions toggle alone decides whether the source loads.
        if (!usesJapaneseProviders() || !this.deps.getDependencies().getSettings().jpdbDefinitionsEnabled || !jpdbVocabulary?.lookup || card.vid <= 0) return Promise.resolve(null);
        const jpdbVid = !card.source || card.source === 'jpdb' ? card.vid : 0;
        return promiseWithTimeout(
            jpdbVocabulary.lookup(jpdbVid, card.spelling, card.reading),
            NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
            'JPDB vocabulary lookup timed out.',
        ).then(info => usesJapaneseProviders() ? info : null).catch(() => null);
    }

    private loadSearchJitenVocabularyInfo(card: JPDBCard, settings: ReaderSettings): Promise<JitenVocabularyInfo | null> {
        const jiten = this.deps.getDependencies().jiten;
        if (!usesJapaneseProviders() || !settings.jitenDefinitionsEnabled || typeof jiten?.lookupVocabularyInfoForCard !== 'function') return Promise.resolve(null);
        return promiseWithTimeout(
            jiten.lookupVocabularyInfoForCard(card),
            NEW_TAB_REMOTE_SOURCE_TIMEOUT_MS,
            'Jiten vocabulary lookup timed out.',
        ).then(info => usesJapaneseProviders() ? info : null).catch(() => null);
    }

    private shouldLoadSearchWordKanjiDetails(card: JPDBCard): boolean {
        if (!usesJapaneseCharacterStudy() || !this.searchWordKanjiCharacters(card).length) return false;
        return orderedKanjiSourceIds(this.deps.getDependencies().getSettings()).some(sourceId => sourceId !== KANJI_STROKE_SOURCE_ID);
    }

    private searchWordKanjiCharacters(card: JPDBCard): string[] {
        return kanjiCharacters(card.spelling).filter(targetCanLookupCharacter);
    }

    private async loadSearchWordKanjiDetails(
        card: JPDBCard,
        targetSnapshot = this.captureTargetSnapshot(),
    ): Promise<NewTabSearchWordKanjiDetail[]> {
        if (!this.targetSnapshotIsCurrent(targetSnapshot) || !usesJapaneseCharacterStudy()) return [];
        const details = await Promise.all(this.searchWordKanjiCharacters(card).map(async kanji => {
            const details = await this.deps.loadKanjiDetails(kanji);
            if (!this.targetSnapshotIsCurrent(targetSnapshot) || !targetCanLookupCharacter(kanji)) return null;
            return {
                kanji,
                details,
            };
        }));
        if (!this.targetSnapshotIsCurrent(targetSnapshot)) return [];
        return details.filter((detail): detail is NewTabSearchWordKanjiDetail => Boolean(detail));
    }

    private renderSearchWordDetail(
        mount: HTMLElement,
        card: JPDBCard,
        detail: NewTabSearchWordDetail,
        targetSnapshot = this.captureTargetSnapshot(),
    ): void {
        if (!this.targetSnapshotIsCurrent(targetSnapshot)) return;
        this.searchWordCardCache.set(cardKey(card), card);
        mount.dataset.newtabCard = cardKey(card);
        setInnerHtml(mount, searchWordDetailHtml(card, detail, this.searchDetailViewContext()));
        this.insertSearchWordKanjiSectionIfPresent(mount, card, detail, targetSnapshot);
        this.installSearchWordDetailEnhancements(mount, card, detail);
    }

    private searchDetailViewContext(): NewTabSearchDetailViewContext {
        return {
            getSettings: () => this.deps.getDependencies().getSettings(),
            text: key => this.deps.text(key),
            sourceAttributes: (key, initiallyExpanded) => this.deps.sourceAttributes(key, initiallyExpanded),
            dictionaryLabel: name => this.deps.dictionaryLabel(name),
            kanjiSourceTitle: sourceId => this.deps.kanjiSourceTitle(sourceId),
            renderSearchDefinitionSources: this.deps.getDependencies().renderSearchDefinitionSources,
            renderSearchWordPills: this.deps.getDependencies().renderSearchWordPills,
        };
    }

    private insertSearchWordKanjiSectionIfPresent(
        mount: HTMLElement,
        card: JPDBCard,
        detail: NewTabSearchWordDetail,
        targetSnapshot: SearchTargetSnapshot,
    ): void {
        const kanjiSection = this.renderSearchWordKanjiSection(card, detail, targetSnapshot);
        if (kanjiSection) this.insertSearchWordKanjiSection(mount, kanjiSection);
    }

    private installSearchWordDetailEnhancements(mount: HTMLElement, card: JPDBCard, detail: NewTabSearchWordDetail): void {
        this.deps.getDependencies().installDictionarySourceTracking?.(mount);
        if (usesJapaneseProviders()) {
            this.deps.getDependencies().installSearchDetailSources?.(mount, card, card.sentence || card.spelling, detail.jpdbVocabularyInfo);
        }
        void this.deps.getDependencies().parseContent?.(mount);
    }

    private insertSearchWordKanjiSection(mount: HTMLElement, kanjiSection: HTMLElement): void {
        const sourceStack = mount.querySelector<HTMLElement>('.jpdb-reader-definition-stack');
        if (sourceStack) {
            sourceStack.append(kanjiSection);
            return;
        }
        mount.append(kanjiSection);
    }

    private renderSearchWordKanjiSection(
        card: JPDBCard,
        detail: NewTabSearchWordDetail,
        targetSnapshot = this.captureTargetSnapshot(),
    ): HTMLElement | null {
        if (!this.targetSnapshotIsCurrent(targetSnapshot) || !usesJapaneseCharacterStudy()) return null;
        if (!this.shouldLoadSearchWordKanjiDetails(card)) {
            return searchLocalKanjiDefinitions(detail, this.searchDetailViewContext());
        }
        const characters = this.searchWordKanjiCharacters(card);
        if (!characters.length) return null;
        const section = searchWordKanjiSourceShell(card, this.searchDetailViewContext());
        if (!section) return null;
        if (detail.wordKanjiLoading) {
            section.append(el('div', { class: 'jpdb-reader-newtab-search-message' }, this.deps.text('loadingKanjiDetails')));
            return section;
        }
        const details = detail.wordKanjiDetails ?? [];
        if (!details.length) return searchLocalKanjiDefinitions(detail, this.searchDetailViewContext());
        details.forEach(item => {
            section.append(this.renderSearchWordKanjiItem(card, item, targetSnapshot));
        });
        return section;
    }

    private renderSearchWordKanjiItem(
        card: JPDBCard,
        item: NewTabSearchWordKanjiDetail,
        targetSnapshot = this.captureTargetSnapshot(),
    ): HTMLElement {
        const fullInfo = item.details.jpdb ? normalizeJpdbKanjiInfo(item.details.jpdb) : null;
        const kanjiCard = this.deps.getDependencies().parser.fallbackCardFromText?.(item.kanji, targetSnapshot.target)
            ?? fallbackSearchKanjiCard(item.kanji);
        const localMeanings = uniqueStrings(item.details.local.flatMap(entry => entry.meanings)).slice(0, 6);
        kanjiCard.kanjiKeyword = this.deps.keywordFromDetails(kanjiCard, fullInfo, item.details.jiten, item.details.rtk) || localMeanings[0] || '';
        const kanjiDetail = this.deps.renderKanjiDetails(
            kanjiCard,
            item.kanji,
            item.details,
        );
        const itemRoot = el('section', {
            class: 'jpdb-reader-newtab-search-kanji-item',
            dataset: { searchWordKanji: item.kanji, newtabCard: cardKey(card) },
        },
        el('div', { class: 'jpdb-reader-newtab-search-kanji-item-title' },
            el('span', { class: 'jpdb-reader-newtab-search-kanji-item-char', lang: 'ja' }, item.kanji),
            kanjiCard.kanjiKeyword ? el('span', { class: 'jpdb-reader-newtab-search-kanji-item-keyword' }, kanjiCard.kanjiKeyword) : null,
        ),
        kanjiDetail);
        this.deps.renderNewTabKanjiImmersion(kanjiDetail, item.kanji);
        return itemRoot;
    }

    private toggleSearchKanjiResult(button: HTMLElement, kanji: string): void {
        if (!targetCanLookupCharacter(kanji)) return;
        const existing = this.expandSearchResultDetail(button);
        if (!existing) return;
        const targetSnapshot = this.captureTargetSnapshot();
        replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.deps.text('loadingKanjiDetails')));
        void this.deps.loadKanjiDetails(kanji).then(details => {
            if (!this.targetSnapshotIsCurrent(targetSnapshot)
                || !targetCanLookupCharacter(kanji)
                || !existing.isConnected
                || button.getAttribute('aria-expanded') !== 'true') return;
            const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
            const card = this.deps.getDependencies().parser.fallbackCardFromText(kanji, targetSnapshot.target);
            const localMeanings = uniqueStrings(details.local.flatMap(entry => entry.meanings)).slice(0, 6);
            card.kanjiKeyword = this.deps.keywordFromDetails(card, fullInfo, details.jiten, details.rtk) || localMeanings[0] || '';
            replaceChildrenWith(existing, this.deps.renderKanjiDetails(card, kanji, details));
            this.deps.renderNewTabKanjiImmersion(existing, kanji);
            void this.deps.getDependencies().parseContent?.(existing);
        }).catch(error => {
            log.warn('New tab search kanji detail failed', { kanji }, error);
            if (this.targetSnapshotIsCurrent(targetSnapshot) && existing.isConnected) {
                replaceChildrenWith(existing, el('div', { class: 'jpdb-reader-newtab-search-message' }, this.deps.text('searchLocalDictionariesFailed')));
            }
        });
    }

    private renderSearchIdle(root: HTMLElement): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        delete results.dataset.searchQuery;
        delete results.dataset.searchTarget;
        this.searchWordCardCache.clear();
        this.renderSearchAutocomplete(root, '', []);
        // Study-hub parity SH-3: the idle Search tab is the "My Cards"
        // browser (JPDB deck-browse filters / Jiten Cards list) when an SRS
        // provider is connected.
        if (this.deps.browseHasProviders()) {
            void this.deps.renderBrowseInto(root);
            return;
        }
        replaceChildrenWith(results, el('div', { class: 'jpdb-reader-newtab-search-empty' }));
    }

    private renderSearchSuggestion(suggestion: NewTabSearchSuggestion, index: number): HTMLButtonElement {
        const detail = [suggestion.reading && suggestion.reading !== suggestion.query ? suggestion.reading : '', suggestion.meaning].filter(Boolean).join(' · ');
        return el('button', {
            id: `jpdb-reader-newtab-suggestion-${index}`,
            type: 'button',
            role: 'option',
            dataset: { newtabAction: newTabAction('search-suggestion'), query: suggestion.query, newtabSearchSuggestionIndex: index },
            lang: 'ja',
            'aria-label': detail ? `${suggestion.query}, ${detail}` : suggestion.query,
            'aria-selected': 'false',
        },
        el('span', { class: 'jpdb-reader-newtab-search-suggestion-term jpdb-reader-parseable', lang: 'ja' }, suggestion.query),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-suggestion-detail jpdb-reader-parseable', lang: 'ja' }, detail) : null);
    }

    private renderSearchAutocomplete(root: HTMLElement, query: string, suggestions: NewTabSearchSuggestion[]): void {
        const mount = root.querySelector<HTMLElement>('[data-newtab-search-autocomplete]');
        if (!mount) return;
        const input = this.searchInput(root);
        input?.setAttribute('aria-expanded', String(Boolean(query && suggestions.length)));
        if (!query || !suggestions.length) {
            this.searchActiveSuggestionIndex = -1;
            input?.removeAttribute('aria-activedescendant');
            mount.hidden = true;
            mount.replaceChildren();
            return;
        }
        if (this.searchActiveSuggestionIndex >= suggestions.length) this.searchActiveSuggestionIndex = suggestions.length - 1;
        mount.hidden = false;
        replaceChildrenWith(mount, suggestions.map((suggestion, index) => this.renderSearchSuggestion(suggestion, index)));
        if (this.searchActiveSuggestionIndex >= 0) {
            this.setSearchActiveSuggestion(root, this.searchActiveSuggestionIndex);
        } else {
            input?.removeAttribute('aria-activedescendant');
        }
    }

    private renderSearchLoading(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
        results.dataset.searchTarget = this.targetSnapshotSignature(this.captureTargetSnapshot());
        replaceChildrenWith(results,
            el('div', { class: 'jpdb-reader-newtab-search-message' }, this.deps.text('searching')),
        );
    }

    private renderSearchResults(root: HTMLElement, results: NewTabSearchResults): void {
        const mount = this.searchResultsMount(root);
        if (!mount) return;
        const kanjiResults = usesJapaneseCharacterStudy() ? results.kanji : [];
        mount.dataset.searchQuery = results.query;
        mount.dataset.searchTarget = this.targetSnapshotSignature(this.captureTargetSnapshot());
        this.searchWordCardCache = new Map(results.words.map(card => [cardKey(card), card]));
        const resultCount = results.words.length + kanjiResults.length;
        this.renderSearchAutocomplete(root, results.query, results.suggestions);
        replaceChildrenWith(mount,
            kanjiResults.length ? renderSearchKanjiResults(kanjiResults, this.searchViewContext()) : null,
            results.words.length ? renderSearchWordResults(results.words, this.searchViewContext()) : null,
            resultCount ? null : this.renderSearchNoResults(results),
        );
        void this.parseSearchSurfaces(root, this.searchGeneration, results.query);
        void this.enrichSearchResultPitch(root, results, this.searchGeneration);
        void this.enrichSearchWordStatusRows(root, results, this.searchGeneration);
    }

    private async parseSearchSurfaces(root: HTMLElement, generation: number, query: string): Promise<void> {
        if (!this.isCurrentSearch(root, generation, query)) return;
        await this.deps.getDependencies().parseContent?.(root, this.deps.shortParseOptions())?.catch(() => undefined);
    }

    private async enrichSearchResultPitch(root: HTMLElement, results: NewTabSearchResults, generation: number): Promise<void> {
        if (!usesJapaneseProviders()) return;
        const cards = results.words.filter(card => this.deps.shouldEnrichWordPitch(card));
        if (!cards.length) return;
        await runLimited(cards, NEW_TAB_SEARCH_PITCH_CONCURRENCY, async card => {
            const pitchAccent = await this.deps.loadWordPitch(card);
            if (!usesJapaneseProviders() || !pitchAccent.length || !this.isCurrentSearch(root, generation, results.query)) return;
            if (!card.pitchAccent.length) card.pitchAccent = pitchAccent;
            this.deps.updateRenderedWordPitch(root, card);
        });
    }

    private async enrichSearchWordStatusRows(root: HTMLElement, results: NewTabSearchResults, generation: number): Promise<void> {
        if (!this.deps.getDependencies().loadCardRenderData || !results.words.length) return;
        await Promise.all(results.words.map(async card => {
            const data = await this.deps.getDependencies().loadCardRenderData?.(card).catch(error => {
                log.debug('Search Anki status skipped', { term: card.spelling, error });
                return null;
            });
            if (!data || !this.isCurrentSearch(root, generation, results.query)) return;
            this.updateSearchWordStatusRow(root, card, data.ankiLookup);
        }));
    }

    private updateSearchWordStatusRow(root: HTMLElement, card: JPDBCard, ankiLookup: CardRenderData['ankiLookup']): void {
        const key = cardKey(card);
        const meta = searchWordSummaryMeta(card, this.searchViewContext(), ankiLookup).join(' · ');
        root.querySelectorAll<HTMLElement>('[data-search-word-meta]').forEach(element => {
            if (element.dataset.searchWordMeta !== key) return;
            element.hidden = !meta;
            element.textContent = meta;
        });
    }

    private renderSearchError(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
        results.dataset.searchTarget = this.targetSnapshotSignature(this.captureTargetSnapshot());
        this.searchWordCardCache.clear();
        replaceChildrenWith(results,
            el('div', { class: 'jpdb-reader-newtab-search-message' }, this.deps.text('searchLocalDictionariesFailed')),
        );
    }

    private searchViewContext(): NewTabSearchViewContext {
        return {
            language: this.deps.language(),
            settings: this.deps.getDependencies().getSettings(),
            text: key => this.deps.text(key),
            showKanjiFallbackReadings: usesJapaneseCharacterStudy(),
        };
    }

    private renderSearchNoResults(results: NewTabSearchResults): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-search-message' },
            results.hasLocalDictionaries ? this.deps.text('noLocalResults') : this.deps.text('addDictionaryForLocalResults'),
        );
    }

    // --- Popstate / URL ---------------------------------------------------

    handleSearchPopstate(root: HTMLElement, route: string | null, query: string): boolean {
        if (route !== 'search' && this.currentRoute() !== 'search') return false;
        this.handlingSearchPopstate = true;
        try {
            if (this.currentRoute() !== 'search') {
                this.deps.enterSearchMode();
                this.setSearchQuery(root, query);
                this.renderSearch(root);
                return true;
            }
            this.setSearchQuery(root, query);
            if (query) this.performSearch(root, query);
            else {
                this.searchGeneration++;
                this.clearSearchDebounce();
                this.renderSearchIdle(root);
            }
            return true;
        } finally {
            this.handlingSearchPopstate = false;
        }
    }

    private syncSearchUrl(query: string): void {
        if (this.handlingSearchPopstate || typeof history === 'undefined') return;
        if (!isYomuNewTabUrl(location.href)) return;
        const url = newSearchUrl(query);
        if (!url) return;
        const next = `${url.pathname}${url.search}${url.hash}`;
        const current = `${location.pathname}${location.search}${location.hash}`;
        if (next === current) return;
        try {
            history.pushState(null, '', next);
        } catch {
            // History can be unavailable in sandboxed frames.
        }
    }
}

// --- Module-local helpers (search-only) -----------------------------------

function renderSearchHandwritingPanel(language: ReaderSettings['interfaceLanguage']): HTMLElement {
    return el('details', { id: 'jpdb-reader-newtab-handwriting', class: 'jpdb-reader-newtab-handwriting', dataset: { newtabHandwriting: true } },
        el('summary', { class: 'jpdb-reader-parseable', lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en' }, newTabText(language, 'drawKanji')),
        el('div', { class: 'jpdb-reader-newtab-handwriting-body' },
            el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle jpdb-reader-newtab-search-doodle trace-hidden', dataset: { kanji: '' } },
                el('div', { class: 'jpdb-reader-doodle-ghost', hidden: true }),
                el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': newTabText(language, 'drawKanji'), tabIndex: 0 }),
            ),
            el('div', {
                class: 'jpdb-reader-newtab-handwriting-candidates',
                dataset: { newtabHandwritingCandidates: true },
                'aria-live': 'polite',
                hidden: true,
            }),
        ),
    );
}

function renderSearchHandwritingManualAction(language: ReaderSettings['interfaceLanguage']): HTMLButtonElement {
    return el('button', {
        class: 'jpdb-reader-newtab-handwriting-manual-action jpdb-reader-parseable',
        type: 'button',
        dataset: { newtabAction: newTabAction('search-focus') },
        lang: resolveUiLanguage(language) === 'ja' ? 'ja' : 'en',
    }, newTabText(language, 'typeOrPasteKanji'));
}

function normalizedSearchWordIdentity(value: string): string {
    return normalizeSearchQuery(value).replace(/\s+/g, '').toLocaleLowerCase();
}

function normalizedKeywordText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function searchParentMeaningKeys(cards: JPDBCard[], kanji: string): Set<string> {
    return new Set(cards
        .filter(card => card.spelling !== kanji && kanjiCharacters(card.spelling).includes(kanji))
        .flatMap(card => firstCardMeaning(card).split(/;\s*/u))
        .map(normalizedKeywordText)
        .filter(Boolean));
}

function isSearchLocalKanjiDictionaryCard(card: JPDBCard): boolean {
    const characters = Array.from(card.spelling.trim());
    return characters.length === 1 && isKanjiCharacter(characters[0] ?? '') && (card.reading === card.spelling || Boolean(card.kanjiKeyword));
}

function searchWordDetailFromRenderedData(data: CardRenderData): NewTabSearchWordDetail {
    return {
        localEntries: data.localEntries,
        kanjiEntries: data.kanjiEntries,
        metaEntries: data.metaEntries,
        ankiLookup: data.ankiLookup,
        jpdbVocabularyInfo: data.jpdbVocabularyInfo,
        jitenVocabularyInfo: data.jitenVocabularyInfo ?? null,
        bunproDefinitionInfo: data.bunproDefinitionInfo ?? null,
        bunproDefinitionStatus: data.bunproDefinitionStatus,
        frequencyRanks: data.frequencyRanks,
    };
}

function setOptionalText(element: HTMLElement | null, text: string): void {
    if (element) element.textContent = text;
}

function newSearchUrl(query: string): URL | null {
    try {
        const url = new URL(location.href);
        url.searchParams.delete('query');
        url.searchParams.delete('search');
        if (query) url.searchParams.set('q', query);
        else url.searchParams.delete('q');
        if (readStudyCardRoute(url.href)) url.hash = '';
        return url;
    } catch {
        return null;
    }
}

function cleanNestedLookupValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}
