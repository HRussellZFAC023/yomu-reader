import { primaryCardState } from './card-state';
import { APP_NAME, DOCS_BASE_URL } from './constants';
import { escapeHtml, renderHighlightedTextHtml, setInnerHtml } from './dom';
import { el, fragment, replaceChildrenWith, type DomAttrs } from './dom-builder';
import type { ImmersionKitClient, ImmersionKitExample } from './immersion-kit';
import type { JpdbClient } from './jpdb';
import { jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiClient, type JpdbKanjiInfo } from './jpdb-kanji';
import { graphEdgePath, type GraphAnchorZone } from './kanji-graph-geometry';
import { buildKanjiFacts, buildKanjiOriginGraph } from './kanji-origin';
import { installKanjiDoodle } from './kanji-doodle';
import { assessKanjiStrokes, type KanjiStrokeAssessment } from './kanji-stroke-grader';
import type { KanjiVGClient, KanjiVGInfo } from './kanjivg';
import type { JpdbReviewBridgeCard, JpdbReviewBridgeClient, JpdbReviewBridgeStatus } from './jpdb-review-bridge';
import { Logger } from './logger';
import {
    buildRtkComponentSummaries,
    renderKanjiKeywordLine,
    renderKanjiOrigins,
    renderRtkInfo,
    speakerIcon,
} from './popup-render';
import { kanjiSourceStateKey, renderKanjiDefinitions, renderSimilarKanjiWordsContent } from './definition-source-render';
import {
    cardKey,
    cardStateLabel,
    createNewTabStateChannel,
    firstCardMeaning,
    hasSavedNewTabUiState,
    isYomuNewTabUrl,
    kanjiCharacters,
    loadNewTabUiState,
    resolveNewTabBrandAssets,
    saveNewTabUiState,
    shuffleCards,
    uniqueStrings,
    type NewTabUiState,
} from './new-tab';
import type { ReaderParser } from './reader-parser';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';
import type { RtkClient, RtkInfo } from './rtk';
import { gmStorageDelete, gmStorageGet, gmStorageSet } from './storage';
import {
    KANJI_DICTIONARIES_SOURCE_ID,
    KANJI_JPDB_SOURCE_ID,
    KANJI_ORIGINS_SOURCE_ID,
    KANJI_RTK_SOURCE_ID,
    KANJI_SIMILAR_WORDS_SOURCE_ID,
    KANJI_STROKE_SOURCE_ID,
    KANJI_UCHISEN_SOURCE_ID,
    kanjiDictionaryNameFromSourceId,
    orderedKanjiSourceIds,
} from './source-sections';
import { installUchisenCarousel, loadUchisenData } from './uchisen';
import type { YomitanDictionaryStore, YomitanKanjiEntry, YomitanTermEntry } from './yomitan';

export interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    anki: {
        listNewTabCards: (limit?: number) => Promise<JPDBCard[]>;
        answerCard: (cardId: number, grade: JPDBGrade) => Promise<void>;
    };
    jpdb: JpdbClient;
    jpdbKanji: JpdbKanjiClient;
    kanjiVG: KanjiVGClient;
    rtk: RtkClient;
    immersionKit: ImmersionKitClient;
    jpdbReviewBridge: JpdbReviewBridgeClient;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    lookupText?: (text: string, sentence: string, anchor?: HTMLElement) => Promise<void> | void;
    lookupDictionaryReference?: (query: string, reading: string, sourceDictionary: string, anchor?: HTMLElement) => Promise<void> | void;
    showKanjiCard?: (card: JPDBCard, kanji: string, sentence: string, anchor?: HTMLElement) => Promise<void> | void;
    parseContent?: (root: HTMLElement) => Promise<void> | void;
    setImmersionTranslationBlurred?: (blurred: boolean) => void;
    onSettingsChange: () => Promise<void> | void;
    applyTheme: () => void;
    showSettings: (tab?: string) => void;
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

function renderNewTabImmersionSentence(card: JPDBCard, example: ImmersionKitExample): HTMLElement {
    const sentence = document.createElement('div');
    sentence.className = 'jpdb-reader-example-sentence jpdb-reader-parseable';
    sentence.lang = 'ja';
    sentence.dataset.immersionSentenceRender = '';
    setInnerHtml(sentence, renderHighlightedTextHtml(example.sentence, [card.spelling, card.reading], 'jpdb-reader-example-target'));
    return sentence;
}

function renderNewTabImmersionTranslation(example: ImmersionKitExample, settings: ReaderSettings): HTMLElement | null {
    if (!shouldRenderNewTabImmersionTranslation(example, settings)) return null;
    return el('div', newTabImmersionTranslationAttributes(settings), example.translation);
}

function shouldRenderNewTabImmersionTranslation(example: ImmersionKitExample, settings: ReaderSettings): boolean {
    return settings.immersionKitShowTranslation && Boolean(example.translation);
}

function newTabImmersionTranslationAttributes(settings: ReaderSettings): DomAttrs {
    return {
        class: 'jpdb-reader-example-translation jpdb-reader-parseable',
        dataset: newTabImmersionTranslationDataset(settings),
        ...newTabImmersionTranslationRevealAttributes(settings),
    };
}

function newTabImmersionTranslationRevealAttributes(settings: ReaderSettings): DomAttrs {
    return settings.immersionKitRevealTranslationOnClick
        ? { role: 'button', tabindex: '0', 'aria-label': 'Reveal translation' }
        : {};
}

function newTabImmersionTranslationDataset(settings: ReaderSettings): Record<string, boolean> | undefined {
    return settings.immersionKitRevealTranslationOnClick ? { yomuImmersionTranslationBlurred: true } : undefined;
}

function newTabImmersionImageUrl(
    example: ImmersionKitExample,
    settings: ReaderSettings,
    client: ImmersionKitClient,
): string {
    const urls = settings.immersionKitShowImages ? client.mediaUrls(example, 'image') : [];
    return urls[0] ?? '';
}

function renderNewTabImmersionImage(imageUrl: string): HTMLElement | null {
    if (!imageUrl) return null;
    return el('div', { class: 'jpdb-reader-example-media' },
        el('img', { class: 'jpdb-reader-example-image', alt: '', loading: 'eager', decoding: 'async', dataset: { yomuImmersionImageSrc: imageUrl } }),
    );
}

function readerWordSurfaceText(word: HTMLElement): string {
    const clone = word.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('rt, rp').forEach(node => node.remove());
    return clone.textContent ?? '';
}

function shouldResolveInitialWordIndex(poolChanged: boolean, preferStoredWord: boolean): boolean {
    return poolChanged || preferStoredWord;
}

function isReviewSource(source: JPDBCard['reviewSource']): boolean {
    return source === 'anki' || source === 'jpdb-api' || source === 'jpdb-live';
}

function isPositiveJpdbCard(card: JPDBCard): boolean {
    return card.source === 'jpdb' && card.vid > 0 && card.sid > 0;
}

function newTabKanjiKeyword(card: JPDBCard, fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null, localMeanings: string[]): string {
    return fullInfo?.keyword || rtk?.keyword || card.kanjiKeyword || localMeanings[0] || '';
}

function oldFormsFact(fullInfo: JpdbKanjiInfo | null): string {
    return fullInfo?.oldForms.length ? fullInfo.oldForms.join(', ') : '';
}

interface NewTabLoadResult {
    cards: JPDBCard[];
    sourceLabel: string;
    needsDictionarySetup: boolean;
    reviewCountMode?: boolean;
}

interface NewTabLoadAccumulator {
    cards: JPDBCard[];
    labels: string[];
    dictionarySetupRequired: boolean;
    reviewCountMode: boolean;
}

type NewTabWordSource = Exclude<ReaderSettings['newTabSource'], 'auto'>;

interface KanjiDetailBundle {
    jpdb: JpdbKanjiInfo | null;
    rtk: RtkInfo | null;
    vg: KanjiVGInfo | null;
    local: YomitanKanjiEntry[];
    similar: YomitanTermEntry[];
}

interface NewTabStudySlots {
    prompt: HTMLElement | null;
    answer: HTMLElement | null;
    meaning: HTMLElement | null;
    count: HTMLElement | null;
    status: HTMLElement | null;
    reveal: HTMLButtonElement | null;
    controls: HTMLElement | null;
}

interface NewTabGradeTarget {
    root: HTMLElement;
    card: JPDBCard;
}

interface NewTabSearchResults {
    query: string;
    words: JPDBCard[];
    kanji: NewTabSearchKanjiResult[];
    suggestions: NewTabSearchSuggestion[];
    hasLocalDictionaries: boolean;
}

interface NewTabSearchKanjiResult {
    character: string;
    keyword: string;
    readings: string[];
    meanings: string[];
    words: JPDBCard[];
}

interface NewTabSearchSuggestion {
    query: string;
    reading: string;
    meaning: string;
}

const log = Logger.scope('NewTab');
const SESSION_WORD_KEY = 'jpdb-reader-newtab-current-word';
const JPDB_ALL_DECKS = 'all';
const JPDB_DECK_SAMPLE_LIMIT = 6;
const JPDB_WORDS_PER_DECK = 36;
const NEW_TAB_WORD_LIMIT = 180;
const NEW_TAB_NAVIGATION_DEDUPE_MS = 550;
const NEW_TAB_SEARCH_DEBOUNCE_MS = 220;
const NEW_TAB_SEARCH_WORD_LIMIT = 10;
const NEW_TAB_SEARCH_KANJI_LIMIT = 6;
const NEW_TAB_SEARCH_RELATED_WORD_LIMIT = 4;
const NEW_TAB_SEARCH_SUGGESTION_LIMIT = 6;
const ORIGIN_GRAPH_DRAG_THRESHOLD_PX = 6;
const NEW_TAB_HEADER_LABEL = 'yomu';
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';
const NEW_TAB_STUDY_INTERACTIVE_SELECTOR = [
    '.jpdb-reader-word',
    '.jpdb-reader-doodle-stage',
    '.jpdb-reader-newtab-answer',
    '.jpdb-reader-newtab-meaning',
    '[data-action]',
    '[data-immersion-action]',
    'a',
    'audio',
    'button',
    'canvas',
    'details',
    'form',
    'input',
    'select',
    'summary',
    'textarea',
    'video',
    '[contenteditable="true"]',
].join(',');

export function clearNewTabOfflineCache(): Promise<void> {
    return gmStorageDelete(NEW_TAB_CACHE_KEY);
}

export class NewTabController {
    private allWords: JPDBCard[] = [];
    private visibleWords: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private visiblePoolSignature = '';
    private state: NewTabUiState;
    private readonly stateChannel: ReturnType<typeof createNewTabStateChannel>;
    private readonly unsubscribeJpdbBridge: () => void;
    private liveJpdbStatus: JpdbReviewBridgeStatus | null = null;
    private liveCards = new Map<string, JpdbReviewBridgeCard>();
    private keywordCache = new Map<string, string>();
    private kanjiInfoCache = new Map<string, Promise<{ jpdb: JpdbKanjiInfo | null; rtk: RtkInfo | null; vg: KanjiVGInfo | null; local: YomitanKanjiEntry[]; similar: YomitanTermEntry[] }>>();
    private immersionCache = new Map<string, Promise<ImmersionKitExample[]>>();
    private immersionExampleIndex = new Map<string, number>();
    private doodlePreviewCache = new Map<string, string>();
    private immersionAudio?: HTMLAudioElement;
    private immersionAudioKey = '';
    private immersionAudioRequestId = 0;
    private dictionarySetupRequired = false;
    private dictionarySetupSignature = '';
    private reviewCountMode = false;
    private loadGeneration = 0;
    private searchGeneration = 0;
    private searchDebounce: ReturnType<typeof setTimeout> | undefined;
    private searchQuery = '';
    private rootEventController: AbortController | undefined;
    private lastPointerNavigation: { action: 'next' | 'previous'; time: number } | null = null;

    constructor(private readonly dependencies: NewTabControllerDependencies) {
        const saved = loadNewTabUiState();
        this.state = {
            ...saved,
            source: hasSavedNewTabUiState() ? saved.source : dependencies.getSettings().newTabSource,
        };
        this.stateChannel = createNewTabStateChannel(state => this.applyExternalState(state));
        this.unsubscribeJpdbBridge = dependencies.jpdbReviewBridge.onUpdate(status => this.applyJpdbBridgeStatus(status));
    }

    isCurrentPage(): boolean {
        return isYomuNewTabUrl(location.href);
    }

    async renderPage(): Promise<void> {
        document.title = `${APP_NAME} New Tab`;
        document.documentElement.classList.add('jpdb-reader-newtab-document');
        const settings = this.dependencies.getSettings();
        await this.ensureNewTabEnabled(settings);
        this.applyPalette();

        const { root, isNew } = this.ensureNewTabRoot();
        if (root.dataset.newtabBound !== 'true') {
            this.bindRootEvents(root);
            root.dataset.newtabBound = 'true';
        }

        const shouldRenderContent = this.shouldRenderEnabledContent(root, isNew);
        if (shouldRenderContent) {
            delete root.dataset.standaloneNewtab;
            root.replaceChildren(this.renderEnabledContent());
            this.syncMode(root);
        }
        this.syncThemeToggle(root);

        if (this.state.mode === 'search') {
            this.renderSearch(root);
            return;
        }

        if (this.shouldUseCachedDictionarySetup(settings)) {
            this.renderDictionarySetup(root);
            return;
        }
        if (shouldRenderContent || this.allWords.length === 0) await this.loadWordsInto(root, true);
        else this.applyWords(root, true);
    }

    private async ensureNewTabEnabled(settings: ReaderSettings): Promise<void> {
        if (settings.newTabEnabled) return;
        settings.newTabEnabled = true;
        await this.dependencies.onSettingsChange();
    }

    private ensureNewTabRoot(): { root: HTMLElement; isNew: boolean } {
        const root = document.querySelector<HTMLElement>('.jpdb-reader-newtab[data-jpdb-reader-root]');
        if (root) return { root, isNew: false };

        const created = document.createElement('main');
        created.className = 'jpdb-reader-newtab';
        created.dataset.jpdbReaderRoot = 'true';
        document.body.replaceChildren(created);
        return { root: created, isNew: true };
    }

    private shouldRenderEnabledContent(root: HTMLElement, isNew: boolean): boolean {
        return isNew
            || !root.querySelector('[data-newtab-study]')
            || root.dataset.standaloneNewtab === 'true';
    }

    destroy(): void {
        this.stateChannel.close();
        this.unsubscribeJpdbBridge();
        this.rootEventController?.abort();
        this.clearSearchDebounce();
        this.rootEventController = undefined;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (root) delete root.dataset.newtabBound;
    }

    async refreshExternalData(): Promise<void> {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root) return;
        this.dependencies.dictionaries.invalidateCaches?.();
        this.dictionarySetupRequired = false;
        this.dictionarySetupSignature = '';
        this.allWords = [];
        this.visibleWords = [];
        this.visiblePoolSignature = '';
        await this.loadWordsInto(root, true);
    }

    lookupGradeOptions(card: JPDBCard): Array<[JPDBGrade, string]> {
        return this.isCurrentLookupGradeCard(card) ? newTabGradeOptions(this.dependencies.getSettings()) : [];
    }

    async gradeFromLookup(grade: JPDBGrade): Promise<void> {
        await this.gradeCurrentCard(grade);
    }

    private isCurrentLookupGradeCard(card: JPDBCard): boolean {
        const current = this.visibleWords[this.index];
        return Boolean(
            current
            && this.state.revealAnswer
            && cardKey(current) === cardKey(card)
            && this.canReviewCard(current),
        );
    }

    invalidateForFactoryReset(): void {
        this.loadGeneration++;
        this.allWords = [];
        this.visibleWords = [];
        this.index = 0;
        this.sourceLabel = '';
        this.visiblePoolSignature = '';
        this.dictionarySetupRequired = false;
        this.dictionarySetupSignature = '';
        this.reviewCountMode = false;
        this.searchGeneration++;
        this.clearSearchDebounce();
        this.searchQuery = '';
        this.liveCards.clear();
        this.keywordCache.clear();
        this.kanjiInfoCache.clear();
        this.immersionCache.clear();
        this.immersionExampleIndex.clear();
        this.doodlePreviewCache.clear();
        this.immersionAudio?.pause();
        this.immersionAudio = undefined;
        this.immersionAudioKey = '';
        this.immersionAudioRequestId++;
    }

    private renderEnabledContent(): DocumentFragment {
        const brand = resolveNewTabBrandAssets(location.href);
        return fragment(
            el('div', { class: 'jpdb-reader-newtab-shell' },
                el('header', { class: 'jpdb-reader-newtab-topbar' },
                    el('div', { class: 'VPNavBarTitle jpdb-reader-newtab-brand', 'data-v-6aa21345': '', 'data-v-1168a8e4': '' },
                        el('a', { class: 'title', href: brand.homeHref, 'data-v-1168a8e4': '' },
                            el('img', { class: 'VPImage logo', src: brand.iconSrc, alt: '', width: 24, height: 24, 'data-v-8426fc1a': '' }),
                            el('span', { 'data-v-1168a8e4': '' }, NEW_TAB_HEADER_LABEL),
                        ),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-mode', role: 'group', 'aria-label': 'New tab mode' },
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'word' } }, 'Word'),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' } }, 'Kanji'),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'search' } }, 'Search'),
                    ),
                    el('div', { class: 'VPNavBarAppearance appearance jpdb-reader-theme-appearance' },
                        el('button', {
                            class: 'VPSwitch VPSwitchAppearance jpdb-reader-theme-switch',
                            type: 'button',
                            role: 'switch',
                            dataset: { newtabAction: 'theme' },
                            'aria-label': 'Switch to light theme',
                            'aria-checked': 'false',
                            title: 'Switch to light theme',
                        },
                        el('span', { class: 'check' },
                            el('span', { class: 'icon' },
                                el('span', { class: 'vpi-sun sun', 'aria-hidden': 'true' }),
                                el('span', { class: 'vpi-moon moon', 'aria-hidden': 'true' }),
                            ),
                        )),
                    ),
                    el('button', {
                        class: 'jpdb-reader-newtab-overflow',
                        type: 'button',
                        dataset: { newtabAction: 'settings' },
                        'aria-label': `Open ${APP_NAME} settings`,
                    }, '...'),
                ),
                el('section', { class: 'jpdb-reader-newtab-study', dataset: { newtabStudy: true }, 'aria-live': 'polite' },
                    el('div', { class: 'jpdb-reader-newtab-count', dataset: { newtabCount: true } }, '0 / 0'),
                    el('h1', { class: 'jpdb-reader-newtab-prompt', dataset: { newtabPrompt: true }, lang: 'ja' }, APP_NAME),
                    el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                        el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                        el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-status', dataset: { newtabStatus: true } }, 'Loading...'),
                    el('form', { class: 'jpdb-reader-newtab-search', dataset: { newtabSearch: true }, role: 'search', hidden: true },
                        el('div', { class: 'jpdb-reader-newtab-searchbox' },
                            el('input', {
                                type: 'search',
                                dataset: { newtabSearchInput: true },
                                placeholder: 'Search words or kanji',
                                autocomplete: 'on',
                                autocapitalize: 'none',
                                autocorrect: 'off',
                                inputmode: 'text',
                                spellcheck: false,
                                enterkeyhint: 'search',
                                lang: 'ja',
                                'aria-label': 'Search words or kanji',
                                'aria-autocomplete': 'list',
                                'aria-controls': 'jpdb-reader-newtab-autocomplete',
                            }),
                            el('button', { type: 'submit', dataset: { newtabAction: 'search-submit' } }, 'Search'),
                            el('button', { type: 'button', dataset: { newtabAction: 'search-clear' }, 'aria-label': 'Clear search' }, 'Clear'),
                        ),
                        el('div', {
                            id: 'jpdb-reader-newtab-autocomplete',
                            class: 'jpdb-reader-newtab-search-suggestions',
                            dataset: { newtabSearchAutocomplete: true },
                            role: 'listbox',
                            'aria-label': 'Search suggestions',
                        }),
                        el('div', { class: 'jpdb-reader-newtab-search-results', dataset: { newtabSearchResults: true }, 'aria-live': 'polite' }),
                    ),
                ),
                el('nav', { class: 'jpdb-reader-newtab-controls', dataset: { newtabControls: true }, 'aria-label': 'Study navigation' },
                    el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': 'Previous word' }, 'Previous'),
                    el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
                    el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': 'Next word' }, 'Next'),
                ),
                el('a', {
                    class: 'jpdb-reader-newtab-install',
                    href: DOCS_BASE_URL,
                    target: '_blank',
                    rel: 'noopener',
                    hidden: true,
                    dataset: { newtabInstall: true },
                }, `Get ${APP_NAME}`),
            ),
        );
    }

    private bindRootEvents(root: HTMLElement): void {
        this.rootEventController?.abort();
        const controller = new AbortController();

        root.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (this.handleNestedLookupClick(root, target, event)) return;
            const action = target.closest<HTMLElement>('[data-newtab-action]')?.dataset.newtabAction;
            const immersionAction = target.closest<HTMLElement>('[data-immersion-action]')?.dataset.immersionAction;
            const blurredTranslation = target.closest<HTMLElement>('.jpdb-reader-example-translation[data-yomu-immersion-translation-blurred="true"]');
            if (blurredTranslation) {
                event.preventDefault();
                this.revealNewTabImmersionTranslations(root);
                return;
            }
            if (immersionAction) {
                event.preventDefault();
                this.performNewTabImmersionAction(root, immersionAction);
                return;
            }
            if (action === 'settings') {
                event.preventDefault();
                this.dependencies.showSettings('basics');
                return;
            }
            if (action === 'theme') {
                event.preventDefault();
                void this.toggleTheme(root);
                return;
            }
            if (action === 'load-dictionary') {
                event.preventDefault();
                this.dependencies.showSettings('dictionaries');
                return;
            }
            if (this.handleSearchClick(root, target, event, action)) return;
            if (action === 'mode') {
                event.preventDefault();
                const requestedMode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode;
                const mode = requestedMode === 'kanji' || requestedMode === 'search' ? requestedMode : 'word';
                this.setState({ mode, revealAnswer: false }, root, { preserveWord: true });
                return;
            }
            if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
            if (action === 'next') {
                event.preventDefault();
                if (!this.acceptPointerNavigation('next', event)) return;
                this.showNextWord();
                return;
            }
            if (action === 'skip') {
                event.preventDefault();
                if (!this.acceptPointerNavigation('next', event)) return;
                this.showNextWord();
                return;
            }
            if (action === 'previous') {
                event.preventDefault();
                if (!this.acceptPointerNavigation('previous', event)) return;
                this.showPreviousWord();
                return;
            }
            if (action === 'reveal') {
                event.preventDefault();
                this.toggleReveal(root);
                return;
            }
            if (action === 'grade') {
                event.preventDefault();
                const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
                if (grade) void this.gradeCurrentCard(grade);
                return;
            }
            if (action === 'jpdb-kanji-action') {
                event.preventDefault();
                const actionId = target.closest<HTMLElement>('[data-kanji-action-id]')?.dataset.kanjiActionId ?? '';
                void this.performJpdbKanjiAction(root, actionId);
                return;
            }
            if (this.state.mode === 'search') return;
            const study = target.closest<HTMLElement>('[data-newtab-study]');
            if (study && !isNewTabStudyInteractiveTarget(target)) {
                event.preventDefault();
                this.toggleReveal(root);
            }
        }, { signal: controller.signal });

        root.addEventListener('submit', event => {
            const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>('[data-newtab-search]');
            if (!form || !root.contains(form)) return;
            event.preventDefault();
            this.performSearchFromInput(root);
        }, { signal: controller.signal });

        root.addEventListener('input', event => {
            const input = event.target instanceof HTMLInputElement
                ? event.target.closest<HTMLInputElement>('[data-newtab-search-input]')
                : null;
            if (!input || !root.contains(input)) return;
            this.searchQuery = input.value;
            this.renderSearchAutocomplete(root, normalizeSearchQuery(this.searchQuery), this.localSearchSuggestions(this.searchQuery));
            this.scheduleSearch(root);
        }, { signal: controller.signal });

        root.addEventListener('keydown', event => {
            if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
            const target = event.target as HTMLElement | null;
            if (target && (event.key === ' ' || event.key === 'Enter')) {
                const blurredTranslation = target.closest<HTMLElement>('.jpdb-reader-example-translation[data-yomu-immersion-translation-blurred="true"]');
                if (blurredTranslation) {
                    event.preventDefault();
                    this.revealNewTabImmersionTranslations(root);
                    return;
                }
            }
            if (this.state.mode === 'search') return;
            if (target && isNewTabStudyInteractiveTarget(target)) return;
            if (event.key === 'ArrowRight' || event.key === 'n') {
                event.preventDefault();
                this.showNextWord();
                return;
            }
            if (event.key === 'ArrowLeft' || event.key === 'p') {
                event.preventDefault();
                this.showPreviousWord();
                return;
            }
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                this.toggleReveal(root);
            }
        }, { signal: controller.signal });
        this.rootEventController = controller;
    }

    private acceptPointerNavigation(action: 'next' | 'previous', event: MouseEvent): boolean {
        const time = event.timeStamp || Date.now();
        if (
            this.lastPointerNavigation?.action === action
            && time - this.lastPointerNavigation.time < NEW_TAB_NAVIGATION_DEDUPE_MS
        ) return false;
        this.lastPointerNavigation = { action, time };
        return true;
    }

    private handleNestedLookupClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const dictionaryLink = target.closest<HTMLAnchorElement>('a.gloss-link[data-dictionary-lookup]');
        if (dictionaryLink && root.contains(dictionaryLink)) return this.handleNestedDictionaryLink(dictionaryLink, event);

        const actionTarget = target.closest<HTMLElement>('[data-action]');
        if (!actionTarget || !root.contains(actionTarget)) {
            return this.handleNewTabImmersionWordLookup(root, target, event)
                || this.handlePromptLookupClick(root, target, event);
        }
        return this.handleNestedLookupAction(actionTarget, event);
    }

    private handleNewTabImmersionWordLookup(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        const word = target.closest<HTMLElement>('.jpdb-reader-newtab-immersion .jpdb-reader-example-sentence .jpdb-reader-word');
        if (!word || !root.contains(word)) return false;
        const expression = cleanNestedLookupValue(readerWordSurfaceText(word));
        if (!expression) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupText?.(expression, expression, word);
        return true;
    }

    private handlePromptLookupClick(root: HTMLElement, target: HTMLElement, event: MouseEvent): boolean {
        if (this.state.mode !== 'word') return false;
        const prompt = target.closest<HTMLElement>('[data-newtab-prompt]');
        if (!prompt || !root.contains(prompt)) return false;
        const card = this.visibleWords[this.index];
        if (!card) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupText?.(card.spelling, card.reading || card.spelling, prompt);
        return true;
    }

    private handleNestedDictionaryLink(link: HTMLAnchorElement, event: MouseEvent): boolean {
        const query = cleanNestedLookupValue(link.dataset.dictionaryLookup);
        if (!query) return false;
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupDictionaryReference?.(
            query,
            link.dataset.dictionaryReading ?? '',
            link.dataset.dictionary ?? '',
            link,
        );
        return true;
    }

    private handleNestedLookupAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const action = actionTarget.dataset.action;
        if (action === 'kanji') {
            return this.handleNestedKanjiAction(actionTarget, event);
        }
        if (action === 'similar-word' || action === 'lookup') {
            return this.handleNestedTermLookupAction(actionTarget, event);
        }
        return false;
    }

    private handleNestedKanjiAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const card = this.visibleWords[this.index];
        const kanji = actionTarget.dataset.kanji ?? '';
        if (!card || !kanji) return false;
        consumeNestedLookupEvent(event);
        if (this.dependencies.showKanjiCard) {
            void this.dependencies.showKanjiCard(card, kanji, sentenceForCard(card), actionTarget);
        } else {
            void this.dependencies.lookupText?.(kanji, kanji, actionTarget);
        }
        return true;
    }

    private handleNestedTermLookupAction(actionTarget: HTMLElement, event: MouseEvent): boolean {
        const term = cleanNestedLookupValue(actionTarget.dataset.expression ?? actionTarget.dataset.term);
        if (!term) return false;
        const reading = cleanNestedLookupValue(actionTarget.dataset.reading);
        consumeNestedLookupEvent(event);
        void this.dependencies.lookupText?.(term, reading || term, actionTarget);
        return true;
    }

    private revealNewTabImmersionTranslations(root: HTMLElement): void {
        const settings = this.dependencies.getSettings();
        if (settings.immersionKitRevealTranslationOnClick) {
            if (this.dependencies.setImmersionTranslationBlurred) {
                this.dependencies.setImmersionTranslationBlurred(false);
            } else {
                settings.immersionKitRevealTranslationOnClick = false;
                void this.dependencies.onSettingsChange();
            }
        }
        root.querySelectorAll<HTMLElement>('.jpdb-reader-example-translation').forEach(translation => {
            delete translation.dataset.yomuImmersionTranslationBlurred;
            translation.removeAttribute('tabindex');
            translation.removeAttribute('role');
            translation.removeAttribute('aria-label');
        });
    }

    private toggleReveal(root: HTMLElement): void {
        const current = this.visibleWords[this.index];
        if (current?.reviewSource === 'jpdb-live' && !this.state.revealAnswer) this.dependencies.jpdbReviewBridge.reveal();
        this.setState({ revealAnswer: !this.state.revealAnswer }, root, { preserveWord: true });
    }

    private applyPalette(): void {
        const settings = this.dependencies.getSettings();
        document.documentElement.style.setProperty('--jpdb-reader-state-new', settings.wordColorNew);
        document.documentElement.style.setProperty('--jpdb-reader-state-learning', settings.wordColorLearning);
        document.documentElement.style.setProperty('--jpdb-reader-state-known', settings.wordColorKnown);
        document.documentElement.style.setProperty('--jpdb-reader-state-due', settings.wordColorDue);
        document.documentElement.style.setProperty('--jpdb-reader-state-failed', settings.wordColorFailed);
        document.documentElement.style.setProperty('--jpdb-reader-state-ignored', settings.wordColorIgnored);
    }

    private async loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void> {
        const loadGeneration = ++this.loadGeneration;
        try {
            const result = await this.loadWordsWithProgress(root, loadGeneration);
            if (!this.isCurrentLoad(loadGeneration)) return;
            await this.applyLoadedWords(root, preferStoredWord, loadGeneration, result);
        } catch (error) {
            await this.handleLoadWordsError(root, preferStoredWord, loadGeneration, error);
        }
    }

    private async loadWordsWithProgress(root: HTMLElement, loadGeneration: number): Promise<NewTabLoadResult> {
        const onProgress = (message: string): void => {
            if (this.isCurrentLoad(loadGeneration)) this.setStatus(root, message);
        };
        onProgress('Loading...');
        return this.loadWords(onProgress);
    }

    private async applyLoadedWords(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number, result: NewTabLoadResult): Promise<void> {
        this.dictionarySetupRequired = result.needsDictionarySetup;
        this.allWords = dedupeWords(result.cards).slice(0, NEW_TAB_WORD_LIMIT);
        this.reviewCountMode = result.reviewCountMode === true;
        this.sourceLabel = result.sourceLabel;
        if (this.allWords.length) void this.writeOfflineCache(this.allWords, this.sourceLabel);
        if (!this.allWords.length) await this.applyOfflineCacheIfAvailable(root, loadGeneration);
        if (!this.isCurrentLoad(loadGeneration)) return;
        this.dependencies.parser.cacheCards(this.allWords);
        if (!this.allWords.length) {
            await this.renderEmptyWordLoad(root);
            return;
        }
        delete root.dataset.standaloneNewtab;
        this.applyWords(root, preferStoredWord);
    }

    private async applyOfflineCacheIfAvailable(root: HTMLElement, loadGeneration: number): Promise<void> {
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration) || !cached.cards.length) return;
        this.allWords = cached.cards;
        this.reviewCountMode = false;
        this.sourceLabel = `${cached.sourceLabel} (offline)`;
        this.setStatus(root, 'Offline cache');
    }

    private async renderEmptyWordLoad(root: HTMLElement): Promise<void> {
        if (!this.dictionarySetupRequired) {
            this.renderEmpty(root, APP_NAME, 'No words yet.');
            return;
        }
        this.renderDictionarySetup(root);
    }

    private async handleLoadWordsError(root: HTMLElement, preferStoredWord: boolean, loadGeneration: number, error: unknown): Promise<void> {
        log.warn('Failed to load words', error);
        const cached = await this.readOfflineCache();
        if (!this.isCurrentLoad(loadGeneration)) return;
        if (cached.cards.length) {
            this.allWords = cached.cards;
            this.reviewCountMode = false;
            this.sourceLabel = `${cached.sourceLabel} (offline)`;
            this.dependencies.parser.cacheCards(this.allWords);
            this.applyWords(root, preferStoredWord);
            this.setStatus(root, 'Offline cache. Grades are disabled until the source reconnects.');
            return;
        }
        this.renderEmpty(root, APP_NAME, 'Could not load words.');
    }

    private async loadWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const accumulator = await this.loadConfiguredWordSources(onProgress);
        await this.loadAutoDictionaryWordsIfNeeded(accumulator, onProgress);
        return newTabLoadResult(accumulator);
    }

    private async loadConfiguredWordSources(onProgress?: (message: string) => void): Promise<NewTabLoadAccumulator> {
        const accumulator = emptyNewTabLoadAccumulator();
        for (const source of this.wordSourceOrder()) {
            await this.appendLoadedWordsFromSource(accumulator, source, onProgress);
        }
        return accumulator;
    }

    private async appendLoadedWordsFromSource(accumulator: NewTabLoadAccumulator, source: NewTabWordSource, onProgress?: (message: string) => void): Promise<void> {
        appendNewTabLoadResult(accumulator, await this.loadWordsFromSource(source, onProgress));
    }

    private async loadAutoDictionaryWordsIfNeeded(accumulator: NewTabLoadAccumulator, onProgress?: (message: string) => void): Promise<void> {
        if (!this.shouldLoadAutoDictionaryWords(accumulator)) return;
        appendNewTabLoadResult(accumulator, await this.loadDictionaryWords(onProgress));
    }

    private shouldLoadAutoDictionaryWords(accumulator: NewTabLoadAccumulator): boolean {
        return this.state.source === 'auto' && accumulator.cards.length === 0;
    }

    private wordSourceOrder(): readonly NewTabWordSource[] {
        return this.state.source === 'auto'
            ? ['anki', 'jpdb']
            : [this.state.source as NewTabWordSource];
    }

    private loadWordsFromSource(source: NewTabWordSource, onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        if (source === 'anki') return this.loadAnkiWords();
        if (source === 'jpdb') return this.loadJpdbWords();
        return this.loadDictionaryWords(onProgress);
    }

    private async loadAnkiWords(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.ankiEnabled) return { cards: [], sourceLabel: 'Anki', needsDictionarySetup: false, reviewCountMode: true };
        const cards = await this.dependencies.anki.listNewTabCards(80).catch(() => {
            return [];
        });
        return { cards, sourceLabel: cards.length ? 'Anki' : 'Anki', needsDictionarySetup: false, reviewCountMode: true };
    }

    private async loadDictionaryWords(_onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        try {
            const summary = await this.dependencies.dictionaries.summary().catch(() => null);
            if (!summary?.dictionaries.length) {
                return { cards: [], sourceLabel: 'Dictionaries', needsDictionarySetup: true, reviewCountMode: false };
            }

            const entries = await this.dependencies.dictionaries.listRandomTopTerms(NEW_TAB_WORD_LIMIT, 4000, settings.dictionaryPreferences);
            return {
                cards: entries.map(entry => this.dependencies.parser.localCardFromEntry(entry)),
                sourceLabel: 'Dictionaries',
                needsDictionarySetup: false,
                reviewCountMode: false,
            };
        } catch {
            return { cards: [], sourceLabel: 'Dictionaries', needsDictionarySetup: false, reviewCountMode: false };
        }
    }

    private async loadJpdbWords(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) return { cards: [], sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: true };
        const live = this.loadLiveJpdbReviewWords(settings);
        if (live) return live;
        if (!settings.apiKey.trim()) return { cards: [], sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: true };

        const selectedDeck = settings.newTabJpdbDeck.trim() || JPDB_ALL_DECKS;
        const selectedDeckCards = await this.loadSelectedJpdbDeckWords(selectedDeck);
        if (selectedDeckCards) return selectedDeckCards;

        return this.loadSampledJpdbDeckWords();
    }

    private loadLiveJpdbReviewWords(settings: ReaderSettings): NewTabLoadResult | null {
        if (settings.newTabJpdbReviewMode === 'api-vocabulary') return null;
        const live = this.liveCardFromBridge();
        if (live) return { cards: [live], sourceLabel: 'JPDB live review', needsDictionarySetup: false, reviewCountMode: true };
        this.dependencies.jpdbReviewBridge.requestCurrent();
        return settings.newTabJpdbReviewMode === 'live-review'
            ? { cards: [], sourceLabel: 'JPDB live review', needsDictionarySetup: false, reviewCountMode: true }
            : null;
    }

    private async loadSelectedJpdbDeckWords(selectedDeck: string): Promise<NewTabLoadResult | null> {
        if (selectedDeck === JPDB_ALL_DECKS) return null;
        try {
            const cards = markJpdbApiReviewCards(await this.dependencies.jpdb.listDeckCards(selectedDeck, NEW_TAB_WORD_LIMIT));
            return { cards, sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: true };
        } catch {
            return null;
        }
    }

    private async loadSampledJpdbDeckWords(): Promise<NewTabLoadResult> {
        const decks = await this.dependencies.jpdb.listDecks().catch(() => []);
        const eligibleDecks = decks
            .filter(deck => !/(never\s*-?\s*forget|blacklist|suspend)/i.test(`${deck.id} ${deck.name}`))
            .slice(0, JPDB_DECK_SAMPLE_LIMIT);
        const cards: JPDBCard[] = [];
        for (const deck of eligibleDecks) {
            try {
                cards.push(...markJpdbApiReviewCards(await this.dependencies.jpdb.listDeckCards(deck.id, JPDB_WORDS_PER_DECK)));
            } catch {
            }
        }

        return { cards, sourceLabel: 'JPDB', needsDictionarySetup: false, reviewCountMode: cards.length > 0 };
    }

    private isCurrentLoad(loadGeneration: number): boolean {
        return this.loadGeneration === loadGeneration;
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean }): void {
        const preferredCardKey = options.preserveWord ? this.currentVisibleWordKey() : '';
        this.state = { ...this.state, ...patch };
        this.persistState();
        this.syncMode(root);
        this.applyWords(root, options.preserveWord, preferredCardKey);
    }

    private applyExternalState(state: NewTabUiState): void {
        if (JSON.stringify(this.state) === JSON.stringify(state)) return;
        const preferredCardKey = this.currentVisibleWordKey();
        this.state = state;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root) return;
        this.syncMode(root);
        this.applyWords(root, true, preferredCardKey);
    }

    private persistState(): void {
        saveNewTabUiState(this.state);
        this.stateChannel.publish(this.state);
    }

    private applyWords(root: HTMLElement, preferStoredWord: boolean, preferredCardKey = ''): void {
        this.syncMode(root);
        if (this.state.mode === 'search') {
            this.renderSearch(root);
            return;
        }
        if (this.shouldUseCachedDictionarySetup(this.dependencies.getSettings())) {
            this.renderDictionarySetup(root);
            return;
        }
        const baseWords = this.studyPoolForCurrentMode();
        const poolSignature = this.newTabPoolSignature(baseWords);
        const poolChanged = poolSignature !== this.visiblePoolSignature;
        const preferredKey = preferredCardKey || this.preferredStoredWordKey(preferStoredWord);
        if (poolChanged) this.replaceVisibleWordPool(baseWords, poolSignature, preferredKey);
        if (!this.ensureVisibleWords(root)) return;
        if (preferredKey || shouldResolveInitialWordIndex(poolChanged, preferStoredWord)) this.index = this.resolveInitialIndex(preferStoredWord, preferredKey);
        this.index = Math.max(0, Math.min(this.index, this.visibleWords.length - 1));
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private shouldRenderDictionarySetup(): boolean {
        return !this.allWords.length && this.dictionarySetupRequired;
    }

    private shouldUseCachedDictionarySetup(settings: ReaderSettings): boolean {
        return this.shouldRenderDictionarySetup()
            && this.dictionarySetupSignature === this.dictionarySetupStateSignature(settings);
    }

    private dictionarySetupStateSignature(settings: ReaderSettings = this.dependencies.getSettings()): string {
        const preferences = settings.dictionaryPreferences
            .map(preference => [
                preference.name,
                preference.alias,
                preference.enabled ? '1' : '0',
                preference.priority,
                preference.type ?? 'terms',
            ].join('\x1f'))
            .join('\x1e');
        return [
            this.state.source,
            settings.newTabSource,
            settings.localDictionariesEnabled ? 'local' : 'no-local',
            settings.apiKey.trim() ? 'jpdb-key' : 'no-jpdb-key',
            settings.jpdbMiningEnabled ? 'jpdb-actions' : 'no-jpdb-actions',
            settings.ankiEnabled ? 'anki' : 'no-anki',
            settings.newTabJpdbDeck,
            settings.newTabJpdbReviewMode,
            preferences,
        ].join('\x1d');
    }

    private studyPoolForCurrentMode(): JPDBCard[] {
        return selectNewTabStudyPool(this.cardsForCurrentMode(this.allWords));
    }

    private cardsForCurrentMode(cards: JPDBCard[]): JPDBCard[] {
        return this.state.mode === 'kanji'
            ? cards.filter(card => kanjiCharacters(card.spelling).length > 0 || Boolean(card.kanjiKeyword))
            : cards;
    }

    private replaceVisibleWordPool(baseWords: JPDBCard[], poolSignature: string, preferredKey = ''): void {
        this.visibleWords = promoteCardByKey(shuffleCards(baseWords), preferredKey);
        this.visiblePoolSignature = poolSignature;
    }

    private ensureVisibleWords(root: HTMLElement): boolean {
        if (this.visibleWords.length) return true;
        this.index = 0;
        this.renderEmpty(root, APP_NAME, this.state.mode === 'kanji' ? 'No kanji cards yet.' : 'No words yet.');
        return false;
    }

    private newTabPoolSignature(cards: JPDBCard[]): string {
        return [
            this.state.source,
            this.state.mode,
            this.sourceLabel,
            ...cards.map(card => cardKey(card)),
        ].join('|');
    }

    private resolveInitialIndex(preferStoredWord: boolean, preferredCardKey = ''): number {
        const preferredKey = preferredCardKey || this.preferredStoredWordKey(preferStoredWord);
        if (preferredKey) {
            const index = this.visibleWords.findIndex(card => cardKey(card) === preferredKey);
            if (index >= 0) return index;
        }
        return 0;
    }

    private currentVisibleWordKey(): string {
        const current = this.visibleWords[this.index];
        return current ? cardKey(current) : '';
    }

    private preferredStoredWordKey(preferStoredWord: boolean): string {
        if (!preferStoredWord) return '';
        const stored = this.readStoredWordKey();
        return stored?.signature === this.currentSessionSignature() ? stored.key : '';
    }

    private showNextWord(): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !this.visibleWords.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.index = (this.index + 1) % this.visibleWords.length;
        this.state.revealAnswer = false;
        this.persistState();
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private showPreviousWord(): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !this.visibleWords.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.index = (this.index - 1 + this.visibleWords.length) % this.visibleWords.length;
        this.state.revealAnswer = false;
        this.persistState();
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private renderWord(root: HTMLElement, card: JPDBCard): void {
        this.writeStoredWordKey(card);
        const study = root.querySelector<HTMLElement>('[data-newtab-study]');
        if (study) study.dataset.newtabCard = cardKey(card);
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-empty-mode');
        root.classList.toggle('jpdb-reader-newtab-revealed', this.state.revealAnswer);
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        root.classList.toggle('jpdb-reader-newtab-review-mode', this.canReviewCard(card));
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        const state = primaryCardState(card.cardState);

        this.renderPromptForMode(slots, card, state);

        this.renderCount(slots.count, '');
        if (slots.reveal) slots.reveal.textContent = this.revealButtonLabel();
        this.renderControls(slots, card);
        this.renderInstallCta(root);
        if (slots.status) slots.status.textContent = this.newTabStatusLabel(card);
    }

    private renderPromptForMode(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (this.state.mode === 'kanji') this.renderKanjiPrompt(slots, card);
        else this.renderWordPrompt(slots, card, state);
    }

    private revealButtonLabel(): string {
        return this.state.revealAnswer ? 'Hide' : 'Reveal';
    }

    private newTabCountLabel(card: JPDBCard): string {
        if (!this.visibleWords.length) return '';
        if (!this.reviewCountMode && !this.isReviewCard(card)) return '';
        return `${this.index + 1} / ${this.visibleWords.length}`;
    }

    private newTabStatusLabel(card: JPDBCard): string {
        return [this.newTabCountLabel(card), this.sourceLabel].filter(Boolean).join(' · ');
    }

    private renderCount(countSlot: HTMLElement | null, label: string): void {
        if (!countSlot) return;
        countSlot.textContent = label;
        countSlot.hidden = !label;
    }

    private studySlots(root: HTMLElement): NewTabStudySlots {
        return {
            prompt: root.querySelector<HTMLElement>('[data-newtab-prompt]'),
            answer: root.querySelector<HTMLElement>('[data-newtab-reading]'),
            meaning: root.querySelector<HTMLElement>('[data-newtab-meaning]'),
            count: root.querySelector<HTMLElement>('[data-newtab-count]'),
            status: root.querySelector<HTMLElement>('[data-newtab-status]'),
            reveal: root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]'),
            controls: root.querySelector<HTMLElement>('[data-newtab-controls]'),
        };
    }

    private renderKanjiPrompt(slots: NewTabStudySlots, card: JPDBCard): void {
        const kanji = kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '字';
        const keyword = this.kanjiKeyword(card, kanji);
        this.renderKanjiPromptQuestion(slots.prompt, kanji, keyword);
        this.renderKanjiPromptAnswer(slots, card, kanji);
        if (slots.meaning && !this.state.revealAnswer) slots.meaning.replaceChildren();
        void this.enrichKanjiCard(slots, card, kanji);
    }

    private renderKanjiPromptQuestion(prompt: HTMLElement | null, kanji: string, keyword: string): void {
        if (!prompt) return;
        prompt.lang = this.state.revealAnswer ? 'ja' : 'en';
        prompt.dataset.newtabExpression = 'true';
        if (this.state.revealAnswer) replaceChildrenWith(prompt, this.kanjiPopoverButton(kanji));
        else prompt.textContent = keyword || 'Loading...';
    }

    private kanjiPopoverButton(kanji: string): HTMLElement {
        return el('button', {
            class: 'jpdb-reader-newtab-kanji-popover-word',
            type: 'button',
            dataset: { action: 'kanji', kanji },
            title: `Show kanji: ${kanji}`,
        }, kanji);
    }

    private renderKanjiPromptAnswer(slots: NewTabStudySlots, card: JPDBCard, kanji: string): void {
        if (!slots.answer) return;
        if (this.state.revealAnswer) {
            replaceChildrenWith(slots.answer, this.revealedKanjiAnswer(card, kanji));
            return;
        }
        replaceChildrenWith(slots.answer, this.kanjiDoodleFront(kanji));
        this.installNewTabKanjiDoodle(slots, card, kanji);
    }

    private revealedKanjiAnswer(card: JPDBCard, kanji: string): HTMLElement {
        const preview = this.doodlePreviewCache.get(cardKey(card));
        return el('div', { class: 'jpdb-reader-newtab-kanji-answer' },
            el('div', { class: 'jpdb-reader-newtab-kanji-svg', dataset: { newtabKanjiSvg: kanji } }, kanji),
            el('div', { class: 'jpdb-reader-newtab-doodle-preview' },
                preview ? el('img', { src: preview, alt: `Your ${kanji} drawing` }) : null,
            ),
        );
    }

    private kanjiDoodleFront(kanji: string): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-kanji-front' },
            el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle trace-hidden', dataset: { kanji } },
                el('div', { class: 'jpdb-reader-doodle-ghost', dataset: { newtabDoodleGhost: true }, hidden: true }),
                el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': `Draw ${kanji}` }),
            ),
            el('div', { class: 'jpdb-reader-doodle-tools jpdb-reader-newtab-doodle-actions' },
                el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleTrace: true } }, 'Show trace'),
                el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleClear: true } }, 'Clear'),
            ),
            el('div', { class: 'jpdb-reader-newtab-doodle-result', dataset: { newtabDoodleResult: true } }),
        );
    }

    private installNewTabKanjiDoodle(slots: NewTabStudySlots, card: JPDBCard, kanji: string): void {
        if (!slots.answer) return;
        installKanjiDoodle(slots.answer, () => this.dependencies.getSettings().interfaceLanguage, {
            onChange: strokes => this.assessDoodle(slots, card, kanji, strokes),
            onClear: () => {
                this.doodlePreviewCache.delete(cardKey(card));
                this.clearDoodleAssessment(slots);
            },
        });
    }

    private renderWordPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (slots.prompt) {
            slots.prompt.lang = 'ja';
            slots.prompt.dataset.newtabExpression = 'true';
            replaceChildrenWith(slots.prompt, this.renderSentencePrompt(card, state));
        }
        this.renderWordAnswer(slots.answer, card);
        this.renderWordMeaning(slots.meaning, card);
        void this.renderImmersionExample(slots, card);
    }

    private renderWordAnswer(answer: HTMLElement | null, card: JPDBCard): void {
        if (answer) answer.textContent = this.state.revealAnswer && card.reading && card.reading !== card.spelling ? card.reading : '';
    }

    private renderWordMeaning(meaning: HTMLElement | null, card: JPDBCard): void {
        if (!meaning) return;
        if (this.state.revealAnswer) replaceChildrenWith(meaning, el('div', {}, firstCardMeaning(card)));
        else meaning.replaceChildren();
    }

    private renderSentencePrompt(card: JPDBCard, state: ReturnType<typeof primaryCardState>): HTMLElement {
        const sentence = sentenceForCard(card);
        const wrap = el('span', { class: 'jpdb-reader-newtab-sentence' });
        if (this.shouldRenderPlainSentencePrompt(card, sentence)) {
            wrap.append(this.renderReaderWord(card, state, card.spelling, sentence || card.spelling));
            return wrap;
        }

        const target = sentencePromptTarget(card, sentence);
        if (!target) {
            wrap.textContent = sentence;
            return wrap;
        }
        const start = sentence.indexOf(target);
        wrap.append(document.createTextNode(sentence.slice(0, start)));
        wrap.append(this.renderReaderWord(card, state, target, sentence));
        wrap.append(document.createTextNode(sentence.slice(start + target.length)));
        return wrap;
    }

    private shouldRenderPlainSentencePrompt(card: JPDBCard, sentence: string): boolean {
        return !this.dependencies.getSettings().newTabParsingEnabled
            || !sentence
            || sentence === card.spelling;
    }

    private async renderImmersionExample(slots: NewTabStudySlots, card: JPDBCard): Promise<void> {
        const meaning = slots.meaning;
        if (!this.canRenderImmersionExample(meaning)) return;
        const key = cardKey(card);
        const examples = await this.loadImmersionExamples(card);
        if (!this.canAppendImmersionExample(meaning, key, examples)) return;
        const index = this.normalizedImmersionExampleIndex(key, examples);
        const immersion = this.renderNewTabImmersionCard(card, examples, index);
        meaning.append(immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        await this.parseNewTabImmersionExample(immersion, card, key);
    }

    private canRenderImmersionExample(meaning: HTMLElement | null): meaning is HTMLElement {
        return this.state.revealAnswer
            && Boolean(meaning)
            && this.dependencies.getSettings().immersionKitEnabled;
    }

    private canAppendImmersionExample(meaning: HTMLElement, key: string, examples: ImmersionKitExample[]): boolean {
        return Boolean(examples.length)
            && cardKey(this.visibleWords[this.index]) === key
            && meaning.isConnected;
    }

    private renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement {
        const settings = this.dependencies.getSettings();
        const example = examples[index];
        const hasAudio = Boolean(this.newTabImmersionAudioSource(example));
        return el('div', { class: 'jpdb-reader-newtab-immersion' },
            this.renderNewTabImmersionToolbar(example, index, examples.length, hasAudio),
            this.renderNewTabImmersionExampleBody(card, example, settings, index, examples.length),
        );
    }

    private async parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void> {
        await this.dependencies.parseContent?.(root)?.catch(() => undefined);
        if (!this.canApplyNewTabImmersionParse(root, key)) return;
        this.highlightNewTabImmersionTarget(root, card);
    }

    private canApplyNewTabImmersionParse(root: HTMLElement, key: string): boolean {
        return root.isConnected
            && cardKey(this.visibleWords[this.index]) === key
            && this.state.mode === 'word'
            && this.state.revealAnswer;
    }

    private highlightNewTabImmersionTarget(root: HTMLElement, card: JPDBCard): void {
        const cardVid = String(card.vid);
        const cardSid = String(card.sid);
        const targets = [card.spelling, card.reading]
            .map(value => value.trim())
            .filter(Boolean);
        root.querySelectorAll<HTMLElement>('[data-immersion-sentence-render] .jpdb-reader-word').forEach(word => {
            const surface = word.textContent?.replace(/\s+/g, '') ?? '';
            if ((word.dataset.vid === cardVid && word.dataset.sid === cardSid)
                || targets.some(target => surface.includes(target))) {
                word.classList.add('jpdb-reader-example-target');
            }
        });
    }

    private renderNewTabImmersionToolbar(example: ImmersionKitExample, index: number, total: number, hasAudio: boolean): HTMLElement {
        return el('div', { class: 'jpdb-reader-example-toolbar' },
            el('div', { class: 'jpdb-reader-example-meta' },
                el('span', { class: 'jpdb-reader-example-source' }, 'Immersion Kit'),
                el('span', { class: 'jpdb-reader-example-title' }, example.sourceTitle),
                el('span', { class: 'jpdb-reader-example-count' }, `${index + 1}/${total}`),
            ),
            this.renderNewTabImmersionActions(hasAudio),
        );
    }

    private renderNewTabImmersionActions(hasAudio: boolean): HTMLElement {
        return el('div', { class: 'jpdb-reader-example-actions', role: 'group', 'aria-label': 'Immersion Kit example controls' },
            this.renderNewTabImmersionActionButton('previous', 'Previous example', '‹'),
            hasAudio ? this.renderNewTabImmersionAudioButton() : null,
            this.renderNewTabImmersionActionButton('next', 'Next example', '›'),
        );
    }

    private renderNewTabImmersionAudioButton(): HTMLButtonElement {
        const button = this.renderNewTabImmersionActionButton('audio', 'Play example audio');
        setInnerHtml(button, speakerIcon());
        return button;
    }

    private renderNewTabImmersionActionButton(action: string, label: string, text = ''): HTMLButtonElement {
        return el('button', {
            class: 'jpdb-reader-icon-mini',
            type: 'button',
            dataset: { immersionAction: action },
            title: label,
            'aria-label': label,
        }, text);
    }

    private renderNewTabImmersionExampleBody(
        card: JPDBCard,
        example: ImmersionKitExample,
        settings: ReaderSettings,
        index: number,
        total: number,
    ): HTMLElement {
        const imageUrl = newTabImmersionImageUrl(example, settings, this.dependencies.immersionKit);
        return el('div', {
            class: `jpdb-reader-example-card ${imageUrl ? 'has-image' : ''}`,
            dataset: {
                immersionIndex: String(index),
                immersionTotal: String(total),
                immersionSentence: example.sentence,
                immersionSourceTitle: example.sourceTitle,
                immersionImageUrl: imageUrl,
            },
        },
            el('div', { class: 'jpdb-reader-example-body' },
                renderNewTabImmersionImage(imageUrl),
                renderNewTabImmersionSentence(card, example),
                renderNewTabImmersionTranslation(example, settings),
            ),
        );
    }

    private performNewTabImmersionAction(root: HTMLElement, action: string): void {
        const current = this.visibleWords[this.index];
        if (!current) return;
        if (action === 'audio') {
            void this.playCurrentImmersionAudio(current);
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        const key = cardKey(current);
        const cached = this.immersionCache.get(current.spelling.trim());
        void cached?.then(examples => {
            if (!examples.length || cardKey(this.visibleWords[this.index]) !== key) return;
            const currentIndex = this.normalizedImmersionExampleIndex(key, examples);
            const delta = action === 'next' ? 1 : -1;
            this.immersionExampleIndex.set(key, (currentIndex + delta + examples.length) % examples.length);
            this.renderWord(root, current);
        });
    }

    private normalizedImmersionExampleIndex(key: string, examples: ImmersionKitExample[]): number {
        const index = this.immersionExampleIndex.get(key) ?? 0;
        if (index >= 0 && index < examples.length) return index;
        this.immersionExampleIndex.set(key, 0);
        return 0;
    }

    private loadNewTabImmersionImage(root: HTMLElement, example: ImmersionKitExample): void {
        const image = root.querySelector<HTMLImageElement>('.jpdb-reader-newtab-immersion [data-yomu-immersion-image-src]');
        if (!image) return;
        const urls = this.dependencies.immersionKit.mediaUrls(example, 'image');
        const hide = () => {
            image.closest('.jpdb-reader-example-media')?.remove();
            root.querySelector<HTMLElement>('.jpdb-reader-newtab-immersion .jpdb-reader-example-card')?.classList.remove('has-image');
        };
        image.addEventListener('error', hide, { once: true });
        const settings = this.dependencies.getSettings();
        void this.dependencies.immersionKit.fetchBlobUrl(urls, settings.audioTimeoutMs, settings.corsProxyUrl)
            .then(src => {
                if (image.isConnected) image.src = src;
            })
            .catch(hide);
    }

    private async playCurrentImmersionAudio(card: JPDBCard): Promise<void> {
        const examples = await this.loadImmersionExamples(card);
        const example = examples[this.normalizedImmersionExampleIndex(cardKey(card), examples)];
        if (!example) return;
        const source = this.newTabImmersionAudioSource(example);
        if (!source || this.isCurrentImmersionAudioPlaying(source.key)) return;
        const requestId = this.beginNewTabImmersionAudio(source.key);
        const src = await this.fetchNewTabImmersionAudio(source.urls);
        if (!this.isCurrentImmersionAudioRequest(requestId, source.key, src)) return;
        const audio = this.attachNewTabImmersionAudio(src);
        const cleanup = () => this.clearNewTabImmersionAudio(audio);
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
        await audio.play().catch(cleanup);
    }

    private newTabImmersionAudioSource(example: ImmersionKitExample): { urls: string[]; key: string } | null {
        const urls = this.dependencies.immersionKit.mediaUrls(example, 'sound');
        const key = urls[0] ?? '';
        return key ? { urls, key } : null;
    }

    private isCurrentImmersionAudioPlaying(key: string): boolean {
        return Boolean(this.immersionAudioKey === key && this.immersionAudio && !this.immersionAudio.ended);
    }

    private beginNewTabImmersionAudio(key: string): number {
        const requestId = ++this.immersionAudioRequestId;
        this.immersionAudio?.pause();
        this.immersionAudio = undefined;
        this.immersionAudioKey = key;
        return requestId;
    }

    private fetchNewTabImmersionAudio(urls: string[]): Promise<string> {
        return this.dependencies.immersionKit
            .fetchBlobUrl(urls, this.dependencies.getSettings().audioTimeoutMs, this.dependencies.getSettings().corsProxyUrl)
            .catch(() => '');
    }

    private isCurrentImmersionAudioRequest(requestId: number, key: string, src: string): boolean {
        return Boolean(src && requestId === this.immersionAudioRequestId && this.immersionAudioKey === key);
    }

    private attachNewTabImmersionAudio(src: string): HTMLAudioElement {
        const audio = new Audio(src);
        audio.playbackRate = this.dependencies.getSettings().immersionKitPlaybackRate;
        this.immersionAudio = audio;
        return audio;
    }

    private clearNewTabImmersionAudio(audio: HTMLAudioElement): void {
        if (this.immersionAudio !== audio) return;
        this.immersionAudio = undefined;
        this.immersionAudioKey = '';
    }

    private loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> {
        const query = card.spelling.trim();
        const existing = this.immersionCache.get(query);
        if (existing) return existing;
        const promise = this.dependencies.immersionKit.search(query, this.dependencies.getSettings())
            .catch(() => []);
        this.immersionCache.set(query, promise);
        return promise;
    }

    private kanjiKeyword(card: JPDBCard, kanji: string): string {
        return this.keywordCache.get(kanji)
            || card.kanjiKeyword
            || '';
    }

    private async enrichKanjiCard(slots: NewTabStudySlots, card: JPDBCard, kanji: string): Promise<void> {
        const key = cardKey(card);
        const details = await this.loadKanjiDetails(kanji);
        if (!this.canApplyKanjiEnrichment(slots, key)) return;

        this.applyEnrichedKanjiKeyword(slots, card, kanji, details);
        this.applyEnrichedKanjiSvg(slots.answer, details.vg?.svg);
        this.applyEnrichedKanjiMeaning(slots, card, kanji, details);
    }

    private canApplyKanjiEnrichment(slots: NewTabStudySlots, key: string): boolean {
        if (this.state.mode !== 'kanji') return false;
        if (cardKey(this.visibleWords[this.index]) !== key) return false;
        const study = slots.prompt?.closest<HTMLElement>('[data-newtab-study]')
            ?? slots.answer?.closest<HTMLElement>('[data-newtab-study]');
        return !study || study.dataset.newtabCard === key;
    }

    private applyEnrichedKanjiKeyword(slots: NewTabStudySlots, card: JPDBCard, kanji: string, details: KanjiDetailBundle): void {
        const keyword = this.keywordFromDetails(card, details.jpdb, details.rtk);
        if (!keyword) return;
        this.keywordCache.set(kanji, keyword);
        if (slots.prompt && !this.state.revealAnswer) slots.prompt.textContent = keyword;
    }

    private applyEnrichedKanjiSvg(answer: HTMLElement | null, svgMarkup: string | undefined): void {
        if (!answer || !svgMarkup) return;
        const mounts = this.enrichedKanjiSvgMounts(answer);
        this.applyRevealedKanjiSvg(mounts.svg, svgMarkup);
        this.applyDoodleGhostSvg(mounts.ghost, svgMarkup);
    }

    private enrichedKanjiSvgMounts(answer: HTMLElement): { svg: HTMLElement | null; ghost: HTMLElement | null } {
        return {
            svg: answer.querySelector<HTMLElement>('[data-newtab-kanji-svg]'),
            ghost: answer.querySelector<HTMLElement>('[data-newtab-doodle-ghost]'),
        };
    }

    private applyRevealedKanjiSvg(svg: HTMLElement | null, svgMarkup: string): void {
        if (this.state.revealAnswer && svg) setInnerHtml(svg, svgMarkup);
    }

    private applyDoodleGhostSvg(ghost: HTMLElement | null, svgMarkup: string): void {
        if (ghost) setInnerHtml(ghost, svgMarkup);
    }

    private applyEnrichedKanjiMeaning(
        slots: NewTabStudySlots,
        card: JPDBCard,
        kanji: string,
        details: KanjiDetailBundle,
    ): void {
        if (!this.state.revealAnswer || !slots.meaning) return;
        replaceChildrenWith(slots.meaning, this.renderKanjiDetails(card, kanji, details.jpdb, details.rtk, details.vg, details.local, details.similar));
        this.renderNewTabUchisen(slots.meaning, kanji);
        void this.dependencies.parseContent?.(slots.meaning);
    }

    private renderNewTabUchisen(root: HTMLElement, kanji: string): void {
        const settings = this.dependencies.getSettings();
        const mount = root.querySelector<HTMLElement>('[data-newtab-uchisen-mount]');
        if (!mount || !settings.uchisenEnabled) return;
        const sourceAttributes = newTabKanjiSourceAttrs(kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID));
        void loadUchisenData(kanji, settings.corsProxyUrl).then(data => {
            if (!mount.isConnected) return;
            if (!data.images.length) {
                mount.remove();
                return;
            }
            void installUchisenCarousel(mount, kanji, data.images, {
                sourceAttributes,
                detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
                summaryClass: 'jpdb-reader-local-title',
                bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
                proxyUrl: settings.corsProxyUrl,
                componentGroups: data.componentGroups,
            });
        }).catch(() => {
            if (mount.isConnected) mount.remove();
        });
    }

    private renderKanjiDetails(
        card: JPDBCard,
        kanji: string,
        info: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        similarEntries: YomitanTermEntry[],
    ): HTMLElement {
        const settings = this.dependencies.getSettings();
        const fullInfo = info ? normalizeJpdbKanjiInfo(info) : null;
        const localMeanings = uniqueStrings(localEntries.flatMap(entry => entry.meanings)).slice(0, 6);
        const localReadings = uniqueStrings(localEntries.flatMap(entry => [...entry.onyomi, ...entry.kunyomi])).slice(0, 8);
        const readings = newTabKanjiReadings(fullInfo, localReadings);
        const facts = this.newTabKanjiFacts(card, fullInfo, rtk, localMeanings);
        const wrap = el('div', { class: 'jpdb-reader-newtab-kanji-details' },
            el('div', { class: 'jpdb-reader-newtab-kanji-keywords' }),
            ...this.renderNewTabKanjiSourceSections(card, kanji, facts, readings, localMeanings, fullInfo, rtk, vg, localEntries, similarEntries, settings),
            this.renderKanjiMiningControls(fullInfo),
        );
        const keywordMount = wrap.querySelector<HTMLElement>('.jpdb-reader-newtab-kanji-keywords');
        if (keywordMount) setInnerHtml(keywordMount, renderKanjiKeywordLine(fullInfo, rtk, localEntries));
        return wrap;
    }

    private renderNewTabKanjiSourceSections(
        card: JPDBCard,
        kanji: string,
        facts: [string, string][],
        readings: string[],
        localMeanings: string[],
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        similarEntries: YomitanTermEntry[],
        settings: ReaderSettings,
    ): HTMLElement[] {
        return orderedKanjiSourceIds(settings).flatMap(sourceId => {
            if (sourceId === KANJI_STROKE_SOURCE_ID) return [];
            const section = this.renderNewTabKanjiSourceSection(sourceId, card, kanji, facts, readings, localMeanings, fullInfo, rtk, vg, localEntries, similarEntries, settings);
            return section ? [section] : [];
        });
    }

    private renderNewTabKanjiSourceSection(
        sourceId: string,
        card: JPDBCard,
        kanji: string,
        facts: [string, string][],
        readings: string[],
        localMeanings: string[],
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        similarEntries: YomitanTermEntry[],
        settings: ReaderSettings,
    ): HTMLElement | null {
        if (sourceId === KANJI_JPDB_SOURCE_ID) return fullInfo ? renderNewTabKanjiInfoSection(card, facts, readings, localMeanings, fullInfo) : null;
        if (sourceId === KANJI_RTK_SOURCE_ID) return this.renderNewTabRtkSection(rtk, fullInfo, localEntries, settings);
        if (sourceId === KANJI_ORIGINS_SOURCE_ID) return this.renderNewTabKanjiOriginGraph(kanji, fullInfo, rtk, vg, localEntries, settings);
        if (sourceId === KANJI_UCHISEN_SOURCE_ID) return this.renderNewTabUchisenPlaceholder(settings);
        if (sourceId === KANJI_SIMILAR_WORDS_SOURCE_ID) return htmlToFirstElement(this.renderNewTabSimilarKanjiWords(kanji, card, fullInfo?.vocabulary ?? [], similarEntries));
        if (sourceId === KANJI_DICTIONARIES_SOURCE_ID) return this.renderNewTabKanjiDictionarySection(localEntries, sourceId, 'Kanji dictionaries');
        const dictionaryName = kanjiDictionaryNameFromSourceId(sourceId);
        if (!dictionaryName) return null;
        return this.renderNewTabKanjiDictionarySection(
            localEntries.filter(entry => entry.dictionary === dictionaryName),
            sourceId,
            this.dictionaryLabel(dictionaryName),
        );
    }

    private renderNewTabRtkSection(
        rtk: RtkInfo | null,
        fullInfo: JpdbKanjiInfo | null,
        localEntries: YomitanKanjiEntry[],
        settings: ReaderSettings,
    ): HTMLElement | null {
        if (!settings.rtkEnabled || !rtk) return null;
        const componentSummaries = buildRtkComponentSummaries(rtk, fullInfo, localEntries);
        const sourceStateKey = kanjiSourceStateKey(KANJI_RTK_SOURCE_ID);
        const section = htmlToFirstElement(renderRtkInfo(rtk, componentSummaries, settings.interfaceLanguage, true, sourceStateKey));
        section?.classList.add('jpdb-reader-newtab-rtk-source');
        return section;
    }

    private renderNewTabUchisenPlaceholder(settings: ReaderSettings): HTMLElement | null {
        if (!settings.uchisenEnabled) return null;
        return el('div', { dataset: { newtabUchisenMount: true } },
            el('details', {
                class: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
                open: true,
                dataset: {
                    sourceStateKey: kanjiSourceStateKey(KANJI_UCHISEN_SOURCE_ID),
                    sourceInitialOpen: 'true',
                },
            },
            el('summary', { class: 'jpdb-reader-local-title' }, 'Uchisen'),
            el('div', { class: 'jpdb-reader-local-entry' }, el('div', { class: 'jpdb-reader-help' }, 'Loading mnemonic images...'))),
        );
    }

    private renderNewTabKanjiDictionarySection(entries: YomitanKanjiEntry[], sourceId: string, title: string): HTMLElement | null {
        return htmlToFirstElement(renderKanjiDefinitions(
            entries,
            (key, initiallyExpanded) => this.newTabSourceAttributes(key, initiallyExpanded),
            name => this.dictionaryLabel(name),
            sourceId,
            title,
        ));
    }

    private renderNewTabKanjiOriginGraph(
        kanji: string,
        fullInfo: JpdbKanjiInfo | null,
        rtk: RtkInfo | null,
        vg: KanjiVGInfo | null,
        localEntries: YomitanKanjiEntry[],
        settings: ReaderSettings,
    ): HTMLElement | null {
        if (!settings.kanjiOriginsEnabled || !settings.kanjiOriginGraphEnabled) return null;
        const factsForOrigins = buildKanjiFacts(kanji, fullInfo, rtk, settings.kanjivgEnabled ? vg : null, localEntries);
        const graph = buildKanjiOriginGraph(kanji, fullInfo, rtk, localEntries, null, vg);
        if (!graph) return null;
        const section = htmlToFirstElement(renderKanjiOrigins(
            factsForOrigins,
            graph,
            null,
            settings,
            settings.interfaceLanguage,
            true,
            kanjiSourceStateKey(KANJI_ORIGINS_SOURCE_ID),
        ));
        if (!section) return null;
        section.classList.add('jpdb-reader-newtab-origin-graph');
        installOriginGraphDrag(section);
        return section;
    }

    private newTabKanjiFacts(card: JPDBCard, fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null, localMeanings: string[]): [string, string][] {
        return compactFacts([
            fact('Keyword', newTabKanjiKeyword(card, fullInfo, rtk, localMeanings)),
            fact('Type', fullInfo?.type),
            fact('Frequency', fullInfo?.frequency),
            fact('Word frequency', card.frequencyRank ? `#${card.frequencyRank}` : ''),
            fact('Kanken', fullInfo?.kanken),
            fact('Heisig', heisigFact(fullInfo, rtk)),
            fact('Old forms', oldFormsFact(fullInfo)),
        ]);
    }

    private renderNewTabSimilarKanjiWords(
        kanji: string,
        card: JPDBCard,
        jpdbVocabulary: JpdbKanjiInfo['vocabulary'],
        localEntries: YomitanTermEntry[],
    ): string {
        if (!this.dependencies.getSettings().similarKanjiWords) return '';
        const content = renderSimilarKanjiWordsContent(
            localEntries,
            jpdbVocabulary,
            card,
            this.dependencies.getSettings(),
            name => this.dictionaryLabel(name),
        );
        if (!content) return '';
        return `
            <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-similar" ${this.newTabSourceAttributes(kanjiSourceStateKey(KANJI_SIMILAR_WORDS_SOURCE_ID))}>
                <summary class="jpdb-reader-local-title">Words using ${escapeHtml(kanji)}</summary>
                ${content}
            </details>
        `;
    }

    private newTabSourceAttributes(sourceStateKey: string, initiallyExpanded = true): string {
        return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}" ${initiallyExpanded ? 'open' : ''}`;
    }

    private dictionaryLabel(name: string): string {
        return this.dependencies.getSettings().dictionaryPreferences.find(item => item.name === name)?.alias || name;
    }

    private renderKanjiMiningControls(info: JpdbKanjiInfo | null): HTMLElement | null {
        const actions = visibleJpdbKanjiActions(info);
        if (!actions.length) return null;
        return el('div', { class: 'jpdb-reader-newtab-kanji-mining', role: 'group', 'aria-label': 'JPDB kanji actions' },
            actions.map(action => el('button', {
                type: 'button',
                class: `jpdb-reader-newtab-mini-action ${jpdbKanjiActionClass(action)}`,
                dataset: { newtabAction: 'jpdb-kanji-action', kanjiActionId: action.id },
                title: action.label,
            }, action.label)),
        );
    }

    private loadKanjiDetails(kanji: string): Promise<{ jpdb: JpdbKanjiInfo | null; rtk: RtkInfo | null; vg: KanjiVGInfo | null; local: YomitanKanjiEntry[]; similar: YomitanTermEntry[] }> {
        const existing = this.kanjiInfoCache.get(kanji);
        if (existing) return existing;
        const settings = this.dependencies.getSettings();
        const promise = Promise.all([
            this.dependencies.jpdbKanji.lookup(kanji).catch(() => null),
            this.dependencies.rtk.lookup(kanji).catch(() => null),
            this.dependencies.kanjiVG.lookup(kanji).catch(() => null),
            this.dependencies.dictionaries.lookupKanji?.(kanji, 6, settings.dictionaryPreferences).catch(() => []) ?? Promise.resolve([]),
            settings.similarKanjiWords
                ? this.dependencies.dictionaries.lookupSimilarTermsByKanji?.(kanji, settings.similarKanjiWordLimit, settings.dictionaryPreferences).catch(() => []) ?? Promise.resolve([])
                : Promise.resolve([]),
        ]).then(([jpdb, rtk, vg, local, similar]) => ({ jpdb, rtk, vg, local, similar }));
        this.kanjiInfoCache.set(kanji, promise);
        return promise;
    }

    private keywordFromDetails(card: JPDBCard, jpdb: JpdbKanjiInfo | null, rtk: RtkInfo | null): string {
        const source = this.dependencies.getSettings().newTabKanjiKeywordSource;
        return firstTruthy(keywordCandidates(card, jpdb, rtk, source));
    }

    private async assessDoodle(slots: NewTabStudySlots, card: JPDBCard, kanji: string, strokes: Parameters<typeof assessKanjiStrokes>[0]): Promise<void> {
        const settings = this.dependencies.getSettings();
        this.captureDoodlePreview(slots, card);
        if (!settings.newTabKanjiAutogradeEnabled) return;
        const details = await this.loadKanjiDetails(kanji);
        const expectedStrokes = details.vg?.strokeCount ?? 0;
        if (shouldWaitForMoreDoodleStrokes(strokes, expectedStrokes)) {
            this.clearDoodleAssessment(slots);
            return;
        }
        const assessment = assessKanjiStrokes(strokes, expectedStrokes || strokes.length, details.vg?.strokeShapes);
        this.renderDoodleAssessment(slots, assessment);
        this.autoSubmitDoodleAssessment(settings, assessment.passed);
    }

    private autoSubmitDoodleAssessment(settings: ReaderSettings, passed: boolean): void {
        if (settings.enableReviews && settings.newTabKanjiAutoSubmit && this.state.revealAnswer) {
            void this.gradeCurrentCard(passed ? 'pass' : 'fail');
        }
    }

    private captureDoodlePreview(slots: NewTabStudySlots, card: JPDBCard): void {
        const canvas = slots.answer?.querySelector<HTMLCanvasElement>('.jpdb-reader-doodle-canvas');
        if (!canvas) return;
        try {
            this.doodlePreviewCache.set(cardKey(card), doodlePreviewDataUrl(canvas));
        } catch {
            // Canvas export can be blocked by privacy settings.
        }
    }

    private renderDoodleAssessment(slots: NewTabStudySlots, assessment: KanjiStrokeAssessment): void {
        const result = slots.answer?.querySelector<HTMLElement>('[data-newtab-doodle-result]');
        const root = slots.answer?.closest<HTMLElement>('.jpdb-reader-newtab');
        root?.classList.toggle('jpdb-reader-newtab-doodle-pass', assessment.passed);
        root?.classList.toggle('jpdb-reader-newtab-doodle-fail', !assessment.passed);
        if (result) result.textContent = `${assessment.passed ? '✓' : '✕'} ${assessment.message}`;
    }

    private clearDoodleAssessment(slots: NewTabStudySlots): void {
        const result = slots.answer?.querySelector<HTMLElement>('[data-newtab-doodle-result]');
        const root = slots.answer?.closest<HTMLElement>('.jpdb-reader-newtab');
        root?.classList.remove('jpdb-reader-newtab-doodle-pass', 'jpdb-reader-newtab-doodle-fail');
        if (result) result.textContent = '';
    }

    private renderEmpty(root: HTMLElement, prompt: string, message: string): void {
        this.enterEmptyMode(root);
        const slots = this.studySlots(root);
        this.renderPromptSlot(slots.prompt, prompt, prompt === APP_NAME ? 'ja' : 'en');
        setOptionalText(slots.answer, message);
        setOptionalText(slots.meaning, '');
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        this.renderEmptyControls(slots.controls);
    }

    private enterEmptyMode(root: HTMLElement): void {
        root.classList.add('jpdb-reader-newtab-revealed');
        root.classList.add('jpdb-reader-newtab-empty-mode');
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-review-mode');
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
    }

    private renderPromptSlot(promptSlot: HTMLElement | null, prompt: string, lang = 'en'): void {
        if (!promptSlot) return;
        promptSlot.lang = lang;
        delete promptSlot.dataset.newtabExpression;
        promptSlot.textContent = prompt;
    }

    private renderEmptyControls(controls: HTMLElement | null): void {
        if (!controls) return;
        controls.hidden = false;
        replaceChildrenWith(controls,
            el('button', { type: 'button', dataset: { newtabAction: 'previous' } }, 'Previous'),
            el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
            el('button', { type: 'button', dataset: { newtabAction: 'next' } }, 'Next'),
        );
    }

    private renderDictionarySetup(root: HTMLElement): void {
        this.dictionarySetupSignature = this.dictionarySetupStateSignature();
        this.enterDictionarySetupMode(root);
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        this.renderPromptSlot(slots.prompt, 'Start with a dictionary');
        setOptionalText(slots.answer, 'Add a dictionary to turn this page into study cards.');
        setOptionalText(slots.meaning, 'It stays in this browser and is ready whenever a new tab opens.');
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        this.renderDictionarySetupControls(slots.controls);
    }

    private enterDictionarySetupMode(root: HTMLElement): void {
        root.classList.add('jpdb-reader-newtab-revealed');
        root.classList.add('jpdb-reader-newtab-setup-mode');
        root.classList.remove('jpdb-reader-newtab-empty-mode', 'jpdb-reader-newtab-review-mode', 'jpdb-reader-newtab-kanji-mode');
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
    }

    private renderDictionarySetupControls(controls: HTMLElement | null): void {
        if (!controls) return;
        controls.hidden = false;
        replaceChildrenWith(controls,
            el('button', { type: 'button', dataset: { newtabAction: 'load-dictionary' } }, 'Add dictionary'),
        );
    }

    private handleSearchClick(root: HTMLElement, target: HTMLElement, event: MouseEvent, action: string | undefined): boolean {
        if (action === 'search-clear') {
            event.preventDefault();
            this.clearSearch(root);
            return true;
        }
        if (action === 'search-suggestion') {
            event.preventDefault();
            const query = target.closest<HTMLElement>('[data-query]')?.dataset.query ?? '';
            this.setSearchQuery(root, query);
            this.performSearch(root, query);
            return true;
        }
        if (action === 'search-result-word') {
            event.preventDefault();
            const button = target.closest<HTMLElement>('[data-expression]');
            const expression = cleanNestedLookupValue(button?.dataset.expression);
            if (expression) void this.dependencies.lookupText?.(expression, cleanNestedLookupValue(button?.dataset.reading) || expression, button ?? target);
            return true;
        }
        if (action === 'search-result-kanji') {
            event.preventDefault();
            const button = target.closest<HTMLElement>('[data-kanji]');
            const kanji = cleanNestedLookupValue(button?.dataset.kanji);
            if (kanji) this.openSearchKanjiResult(kanji, button ?? target);
            return true;
        }
        return false;
    }

    private renderSearch(root: HTMLElement): void {
        this.syncMode(root);
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
        this.syncThemeToggle(root);

        const slots = this.studySlots(root);
        this.renderPromptSlot(slots.prompt, 'Search');
        setOptionalText(slots.answer, '');
        setOptionalText(slots.meaning, '');
        this.renderCount(slots.count, '');
        setOptionalText(slots.status, '');
        if (slots.controls) {
            slots.controls.hidden = true;
            slots.controls.replaceChildren();
        }

        this.setSearchQuery(root, this.searchQuery);
        const query = normalizeSearchQuery(this.searchQuery);
        this.renderSearchAutocomplete(root, query, this.localSearchSuggestions(query));
        const results = this.searchResultsMount(root);
        if (!query) {
            this.renderSearchIdle(root);
        } else if (results?.dataset.searchQuery !== query) {
            this.performSearch(root, query);
        }
        this.focusSearchInput(root);
        this.renderInstallCta(root);
    }

    private setSearchQuery(root: HTMLElement, query: string): void {
        this.searchQuery = query;
        const input = this.searchInput(root);
        if (input && input.value !== query) input.value = query;
        this.renderSearchAutocomplete(root, normalizeSearchQuery(query), this.localSearchSuggestions(query));
    }

    private searchInput(root: HTMLElement): HTMLInputElement | null {
        return root.querySelector<HTMLInputElement>('[data-newtab-search-input]');
    }

    private searchResultsMount(root: HTMLElement): HTMLElement | null {
        return root.querySelector<HTMLElement>('[data-newtab-search-results]');
    }

    private focusSearchInput(root: HTMLElement): void {
        const input = this.searchInput(root);
        if (!input || input === document.activeElement) return;
        window.setTimeout(() => {
            const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const canFocus = !active || active === document.body || Boolean(active.closest('[data-newtab-action="mode"]'));
            if (this.state.mode === 'search' && input.isConnected && canFocus) input.focus();
        }, 0);
    }

    private clearSearch(root: HTMLElement): void {
        this.searchGeneration++;
        this.clearSearchDebounce();
        this.setSearchQuery(root, '');
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

    private performSearchFromInput(root: HTMLElement): void {
        const query = this.searchInput(root)?.value ?? '';
        this.setSearchQuery(root, query);
        this.performSearch(root, query);
    }

    private performSearch(root: HTMLElement, rawQuery: string): void {
        this.clearSearchDebounce();
        const query = normalizeSearchQuery(rawQuery);
        this.setSearchQuery(root, query);
        if (!query) {
            this.searchGeneration++;
            this.renderSearchIdle(root);
            return;
        }

        const generation = ++this.searchGeneration;
        this.renderSearchLoading(root, query);
        void this.loadSearchResults(query).then(results => {
            if (!this.isCurrentSearch(root, generation, query)) return;
            this.renderSearchResults(root, results);
        }).catch(error => {
            log.warn('New tab search failed', { query }, error);
            if (this.isCurrentSearch(root, generation, query)) this.renderSearchError(root, query);
        });
    }

    private isCurrentSearch(root: HTMLElement, generation: number, query: string): boolean {
        return root.isConnected
            && this.state.mode === 'search'
            && this.searchGeneration === generation
            && normalizeSearchQuery(this.searchQuery) === query;
    }

    private async loadSearchResults(query: string): Promise<NewTabSearchResults> {
        const [summary, words, kanji] = await Promise.all([
            this.dependencies.dictionaries.summary?.().catch(() => null) ?? Promise.resolve(null),
            this.searchWordCards(query),
            this.searchKanjiCards(query),
        ]);
        return {
            query,
            words,
            kanji,
            suggestions: this.searchSuggestions(query, words),
            hasLocalDictionaries: Boolean(summary?.dictionaries.length),
        };
    }

    private async searchWordCards(query: string): Promise<JPDBCard[]> {
        const settings = this.dependencies.getSettings();
        const parsedPromise = queryHasJapanese(query)
            ? this.dependencies.parser.parse([query]).catch(() => [[]])
            : Promise.resolve([[]] as Awaited<ReturnType<ReaderParser['parse']>>);
        const directEntriesPromise = settings.localDictionariesEnabled
            ? this.dependencies.dictionaries.lookup(query, query, NEW_TAB_SEARCH_WORD_LIMIT, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
        const matchedEntriesPromise = settings.localDictionariesEnabled
            ? this.dependencies.dictionaries.findTermMatches(query, NEW_TAB_SEARCH_WORD_LIMIT, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);

        const [parsed, directEntries, matchedEntries] = await Promise.all([parsedPromise, directEntriesPromise, matchedEntriesPromise]);
        const parsedCards = (parsed[0] ?? []).map(token => ({ ...token.card, sentence: token.sentence ?? query }));
        const localCards = [...directEntries, ...matchedEntries.map(match => match.entry)]
            .map(entry => ({ ...this.dependencies.parser.localCardFromEntry(entry), sentence: query }));
        return dedupeWords([...parsedCards, ...localCards]).slice(0, NEW_TAB_SEARCH_WORD_LIMIT);
    }

    private searchSuggestions(query: string, resultCards: JPDBCard[]): NewTabSearchSuggestion[] {
        return this.cardSearchSuggestions(query, [
            ...resultCards,
            ...this.allWords,
        ]);
    }

    private localSearchSuggestions(rawQuery: string): NewTabSearchSuggestion[] {
        const query = normalizeSearchQuery(rawQuery);
        return query ? this.cardSearchSuggestions(query, this.allWords) : [];
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

    private async searchKanjiCards(query: string): Promise<NewTabSearchKanjiResult[]> {
        const characters = kanjiCharacters(query).slice(0, NEW_TAB_SEARCH_KANJI_LIMIT);
        const results = await Promise.all(characters.map(character => this.searchKanjiResult(character)));
        return results.filter((result): result is NewTabSearchKanjiResult => Boolean(result));
    }

    private async searchKanjiResult(character: string): Promise<NewTabSearchKanjiResult | null> {
        const details = await this.loadKanjiDetails(character).catch(() => null);
        if (!details) return null;
        const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
        const meanings = uniqueStrings(details.local.flatMap(entry => entry.meanings)).slice(0, 6);
        const readings = newTabKanjiReadings(fullInfo, uniqueStrings(details.local.flatMap(entry => [...entry.onyomi, ...entry.kunyomi]))).slice(0, 8);
        const card = this.dependencies.parser.fallbackCardFromText(character);
        const keyword = newTabKanjiKeyword(card, fullInfo, details.rtk, meanings);
        const relatedWords = dedupeWords(details.similar.map(entry => this.dependencies.parser.localCardFromEntry(entry))).slice(0, NEW_TAB_SEARCH_RELATED_WORD_LIMIT);
        return {
            character,
            keyword,
            readings,
            meanings,
            words: relatedWords,
        };
    }

    private renderSearchIdle(root: HTMLElement): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        delete results.dataset.searchQuery;
        this.renderSearchAutocomplete(root, '', []);
        replaceChildrenWith(results, el('div', { class: 'jpdb-reader-newtab-search-empty' }));
    }

    private renderSearchSuggestion(suggestion: NewTabSearchSuggestion): HTMLButtonElement {
        const detail = [suggestion.reading && suggestion.reading !== suggestion.query ? suggestion.reading : '', suggestion.meaning].filter(Boolean).join(' · ');
        return el('button', {
            type: 'button',
            role: 'option',
            dataset: { newtabAction: 'search-suggestion', query: suggestion.query },
            lang: 'ja',
            'aria-label': detail ? `${suggestion.query}, ${detail}` : suggestion.query,
        },
        el('span', { class: 'jpdb-reader-newtab-search-suggestion-term' }, suggestion.query),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-suggestion-detail' }, detail) : null);
    }

    private renderSearchAutocomplete(root: HTMLElement, query: string, suggestions: NewTabSearchSuggestion[]): void {
        const mount = root.querySelector<HTMLElement>('[data-newtab-search-autocomplete]');
        if (!mount) return;
        if (!query || !suggestions.length) {
            mount.hidden = true;
            mount.replaceChildren();
            return;
        }
        mount.hidden = false;
        replaceChildrenWith(mount, suggestions.map(suggestion => this.renderSearchSuggestion(suggestion)));
    }

    private renderSearchLoading(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
        replaceChildrenWith(results,
            this.renderExternalSearchLinks(query),
            el('div', { class: 'jpdb-reader-newtab-search-message' }, 'Searching...'),
        );
    }

    private renderSearchResults(root: HTMLElement, results: NewTabSearchResults): void {
        const mount = this.searchResultsMount(root);
        if (!mount) return;
        mount.dataset.searchQuery = results.query;
        const resultCount = results.words.length + results.kanji.length;
        this.renderSearchAutocomplete(root, results.query, results.suggestions);
        replaceChildrenWith(mount,
            this.renderExternalSearchLinks(results.query),
            results.words.length ? this.renderSearchWordResults(results.words) : null,
            results.kanji.length ? this.renderSearchKanjiResults(results.kanji) : null,
            resultCount ? null : this.renderSearchNoResults(results),
        );
    }

    private renderSearchError(root: HTMLElement, query: string): void {
        const results = this.searchResultsMount(root);
        if (!results) return;
        results.dataset.searchQuery = query;
        replaceChildrenWith(results,
            this.renderExternalSearchLinks(query),
            el('div', { class: 'jpdb-reader-newtab-search-message' }, 'Could not search local dictionaries.'),
        );
    }

    private renderExternalSearchLinks(query: string): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-search-links', role: 'group', 'aria-label': 'External dictionary search' },
            el('a', { href: jpdbSearchUrl(query), target: '_blank', rel: 'noopener' }, 'JPDB'),
            el('a', { href: jishoSearchUrl(query), target: '_blank', rel: 'noopener' }, 'Jisho'),
        );
    }

    private renderSearchWordResults(cards: JPDBCard[]): HTMLElement {
        return el('section', { class: 'jpdb-reader-newtab-search-section' },
            el('h2', {}, 'Words'),
            el('div', { class: 'jpdb-reader-newtab-search-list' },
                cards.map(card => this.renderSearchWordResult(card)),
            ),
        );
    }

    private renderSearchWordResult(card: JPDBCard): HTMLButtonElement {
        const meaning = firstCardMeaning(card);
        const meta = [card.reading && card.reading !== card.spelling ? card.reading : '', cardStateLabel(card), card.frequencyRank ? `#${card.frequencyRank}` : ''].filter(Boolean).join(' · ');
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-word',
            dataset: { newtabAction: 'search-result-word', expression: card.spelling, reading: card.reading },
        },
        el('span', { class: 'jpdb-reader-newtab-search-term', lang: 'ja' }, card.spelling),
        meta ? el('span', { class: 'jpdb-reader-newtab-search-meta' }, meta) : null,
        meaning ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, meaning) : null);
    }

    private renderSearchKanjiResults(results: NewTabSearchKanjiResult[]): HTMLElement {
        return el('section', { class: 'jpdb-reader-newtab-search-section' },
            el('h2', {}, 'Kanji'),
            el('div', { class: 'jpdb-reader-newtab-search-kanji-grid' },
                results.map(result => this.renderSearchKanjiResult(result)),
            ),
        );
    }

    private renderSearchKanjiResult(result: NewTabSearchKanjiResult): HTMLButtonElement {
        const detail = [
            result.keyword,
            result.meanings.filter(meaning => meaning !== result.keyword).slice(0, 2).join(', '),
            result.readings.slice(0, 3).join(' · '),
        ].filter(Boolean).join(' · ');
        const words = result.words.map(card => card.spelling).slice(0, 4).join('、');
        return el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-kanji-card',
            dataset: { newtabAction: 'search-result-kanji', kanji: result.character },
        },
        el('span', { class: 'jpdb-reader-newtab-search-kanji-char', lang: 'ja' }, result.character),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, detail) : null,
        words ? el('span', { class: 'jpdb-reader-newtab-search-meta', lang: 'ja' }, words) : null);
    }

    private renderSearchNoResults(results: NewTabSearchResults): HTMLElement {
        return el('div', { class: 'jpdb-reader-newtab-search-message' },
            results.hasLocalDictionaries ? 'No local results.' : 'Add a dictionary for local results.',
        );
    }

    private openSearchKanjiResult(kanji: string, anchor: HTMLElement): void {
        const cached = this.kanjiInfoCache.get(kanji);
        const showFallback = () => {
            const card = this.dependencies.parser.fallbackCardFromText(kanji);
            void this.dependencies.showKanjiCard?.(card, kanji, kanji, anchor);
        };
        void cached?.then(details => {
            const meanings = uniqueStrings(details.local.flatMap(entry => entry.meanings)).slice(0, 6);
            const fullInfo = details.jpdb ? normalizeJpdbKanjiInfo(details.jpdb) : null;
            const card = this.dependencies.parser.fallbackCardFromText(kanji);
            card.kanjiKeyword = newTabKanjiKeyword(card, fullInfo, details.rtk, meanings);
            void this.dependencies.showKanjiCard?.(card, kanji, kanji, anchor);
        }).catch(showFallback);
        if (!cached) showFallback();
    }

    private renderControls(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.controls) return;
        slots.controls.hidden = false;
        replaceChildrenWith(slots.controls, this.controlButtonsForCard(card));
    }

    private controlButtonsForCard(card: JPDBCard): HTMLElement[] {
        if (!this.canReviewCard(card)) return this.navigationControlButtons(this.state.revealAnswer ? 'Hide' : 'Reveal');
        if (!this.state.revealAnswer) return this.navigationControlButtons('Reveal');
        return this.gradeControlButtons();
    }

    private canReviewCard(card: JPDBCard): boolean {
        const settings = this.dependencies.getSettings();
        if (!settings.enableReviews) return false;
        if (card.source === 'anki' || card.reviewSource === 'anki') return settings.ankiEnabled;
        if (card.reviewSource === 'jpdb-live') return settings.jpdbMiningEnabled;
        if (card.reviewSource === 'jpdb-api' || isPositiveJpdbCard(card)) {
            return settings.jpdbMiningEnabled && Boolean(settings.apiKey.trim());
        }
        return false;
    }

    private navigationControlButtons(revealLabel: string): HTMLElement[] {
        return [
            el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': 'Previous word' }, 'Previous'),
            el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, revealLabel),
            el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': 'Next word' }, 'Next'),
        ];
    }

    private gradeControlButtons(): HTMLElement[] {
        return newTabGradeOptions(this.dependencies.getSettings())
            .map(([grade, label]) => el('button', { type: 'button', dataset: { newtabAction: 'grade', grade } }, label));
    }

    private renderInstallCta(root: HTMLElement): void {
        const install = root.querySelector<HTMLAnchorElement>('[data-newtab-install]');
        if (!install) return;
        install.hidden = hasYomuRuntime() || root.dataset.standaloneNewtab !== 'true';
    }

    private isReviewCard(card: JPDBCard): boolean {
        return isReviewSource(card.reviewSource)
            || card.source === 'anki'
            || isPositiveJpdbCard(card);
    }

    private async performJpdbKanjiAction(root: HTMLElement, actionId: string): Promise<void> {
        if (!actionId) return;
        const card = this.visibleWords[this.index];
        const kanji = visibleCardKanji(card);
        try {
            this.setStatus(root, 'Updating JPDB kanji...');
            await this.dependencies.jpdbKanji.performAction(actionId);
            this.finishJpdbKanjiAction(root, card, kanji);
        } catch (error) {
            log.warn('New tab JPDB kanji action failed', { kanji }, error);
            this.setStatus(root, 'Could not update JPDB kanji. Enable kanji reviews on JPDB first.');
        }
    }

    private finishJpdbKanjiAction(root: HTMLElement, card: JPDBCard | undefined, kanji: string): void {
        if (kanji) this.kanjiInfoCache.delete(kanji);
        if (card && this.visibleWords[this.index] === card) this.renderWord(root, card);
        this.setStatus(root, 'JPDB kanji updated.');
    }

    private async gradeCurrentCard(grade: JPDBGrade): Promise<void> {
        const target = this.currentGradeTarget();
        if (!target) return;
        if (!this.canReviewCard(target.card)) return;
        if (this.sourceLabel.includes('(offline)')) {
            this.setStatus(target.root, 'Offline cache. Reconnect JPDB or Anki to submit grades.');
            return;
        }
        try {
            this.setStatus(target.root, 'Grading...');
            await this.submitGrade(target.card, grade);
            this.setStatus(target.root, passingNewTabGrade(grade) ? '✓' : '✕');
            this.advanceAfterGrade(target.root, target.card);
        } catch (error) {
            log.warn('New tab grade failed', { term: target.card.spelling, source: target.card.source, grade }, error);
            this.setStatus(target.root, 'Could not submit grade.');
        }
    }

    private currentGradeTarget(): NewTabGradeTarget | null {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        const card = this.visibleWords[this.index];
        return root && card ? { root, card } : null;
    }

    private async submitGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (this.submitLiveJpdbGrade(card, grade)) return;
        if (await this.submitAnkiGradeIfNeeded(card, grade)) return;
        await this.submitJpdbApiGradeIfNeeded(card, grade);
    }

    private submitLiveJpdbGrade(card: JPDBCard, grade: JPDBGrade): boolean {
        if (card.reviewSource !== 'jpdb-live') return false;
        this.dependencies.jpdbReviewBridge.grade(grade);
        this.dependencies.jpdbReviewBridge.requestCurrent();
        return true;
    }

    private async submitAnkiGradeIfNeeded(card: JPDBCard, grade: JPDBGrade): Promise<boolean> {
        if (card.source !== 'anki' && card.reviewSource !== 'anki') return false;
        await this.submitAnkiGrade(card, grade);
        return true;
    }

    private async submitJpdbApiGradeIfNeeded(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        if (card.source !== 'jpdb' && card.reviewSource !== 'jpdb-api') return;
        const settings = this.dependencies.getSettings();
        if (!settings.jpdbMiningEnabled) throw new Error('JPDB actions are disabled in settings.');
        if (!settings.apiKey.trim()) throw new Error('Add a JPDB API key to review JPDB cards.');
        await this.dependencies.jpdb.reviewCard(card, grade);
    }

    private async submitAnkiGrade(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        const cardId = card.ankiCardId ?? card.rid;
        if (!cardId) throw new Error('Missing Anki card id.');
        await this.dependencies.anki.answerCard(cardId, grade);
    }

    private advanceAfterGrade(root: HTMLElement, card: JPDBCard): void {
        const key = cardKey(card);
        this.allWords = this.allWords.filter(item => cardKey(item) !== key);
        this.visibleWords = this.visibleWords.filter(item => cardKey(item) !== key);
        this.state.revealAnswer = false;
        this.persistState();
        if (!this.visibleWords.length) {
            this.applyWords(root, false);
            return;
        }
        this.index %= this.visibleWords.length;
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private applyJpdbBridgeStatus(status: JpdbReviewBridgeStatus): void {
        this.liveJpdbStatus = status;
        const root = this.jpdbBridgeRoot();
        if (!root) return;
        if (!status.card) return;
        const card = this.cardFromLiveJpdb(status.card);
        if (!card) return;
        this.upsertLiveJpdbCard(card);
        this.applyWords(root, false);
    }

    private jpdbBridgeRoot(): HTMLElement | null {
        if (this.state.source !== 'jpdb' && this.state.source !== 'auto') return null;
        return document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
    }

    private upsertLiveJpdbCard(card: JPDBCard): void {
        const existingIndex = this.allWords.findIndex(item => item.reviewSource === 'jpdb-live');
        if (existingIndex >= 0) this.allWords.splice(existingIndex, 1, card);
        else this.allWords.unshift(card);
    }

    private liveCardFromBridge(): JPDBCard | null {
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus();
        return status.card ? this.cardFromLiveJpdb(status.card) : null;
    }

    private cardFromLiveJpdb(card: JpdbReviewBridgeCard): JPDBCard | null {
        const spelling = card.kind === 'kanji' ? card.kanji : card.spelling;
        if (!spelling) return null;
        const jpdbCard = liveJpdbCardFromBridgeCard(card, spelling);
        this.liveCards.set(cardKey(jpdbCard), card);
        return jpdbCard;
    }

    private async writeOfflineCache(cards: JPDBCard[], sourceLabel: string): Promise<void> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabOfflineEnabled) return;
        const limit = Math.max(0, settings.newTabOfflineLimit || 0);
        if (!limit) return;
        await gmStorageSet(NEW_TAB_CACHE_KEY, {
            at: Date.now(),
            sourceLabel,
            cards: cards.slice(0, limit),
        }).catch(() => undefined);
    }

    private async readOfflineCache(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabOfflineEnabled) return { cards: [], sourceLabel: '' };
        const cached = await gmStorageGet<{ cards?: JPDBCard[]; sourceLabel?: string } | null>(NEW_TAB_CACHE_KEY, null)
            .catch(() => null);
        return {
            cards: Array.isArray(cached?.cards) ? cached.cards.slice(0, Math.max(0, settings.newTabOfflineLimit || 0)) : [],
            sourceLabel: cached?.sourceLabel || 'Cached reviews',
        };
    }

    private renderReaderWord(card: JPDBCard, state: string, text = card.spelling, sentence = card.sentence || card.spelling): HTMLSpanElement {
        const sourceClass = card.source === 'anki' ? 'anki' : 'jpdb';
        return el('span', {
            class: `jpdb-reader-word ${sourceClass}-${state}`,
            dataset: {
                action: 'lookup',
                term: text,
                expression: card.spelling,
                reading: card.reading,
                vid: card.vid,
                sid: card.sid,
                sentence,
            },
            tabIndex: 0,
        }, text);
    }

    private syncMode(root: HTMLElement): void {
        root.classList.toggle('jpdb-reader-newtab-search-mode', this.state.mode === 'search');
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        const search = root.querySelector<HTMLElement>('[data-newtab-search]');
        if (search) search.hidden = this.state.mode !== 'search';
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="mode"]').forEach(button => {
            button.dataset.active = String(button.dataset.mode === this.state.mode);
        });
    }

    private async toggleTheme(root: HTMLElement): Promise<void> {
        const settings = this.dependencies.getSettings();
        const current = this.effectiveTheme(settings.theme);
        settings.theme = current === 'dark' ? 'light' : 'dark';
        await this.dependencies.onSettingsChange();
        this.dependencies.applyTheme();
        this.syncThemeToggle(root);
    }

    private syncThemeToggle(root: HTMLElement): void {
        const theme = this.effectiveTheme(this.dependencies.getSettings().theme);
        root.dataset.newtabTheme = theme;
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="theme"]');
        if (!button) return;
        const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-checked', String(theme === 'light'));
        button.title = label;
    }

    private effectiveTheme(theme: ReaderSettings['theme']): 'dark' | 'light' {
        if (theme === 'dark' || theme === 'light') return theme;
        return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    private setStatus(root: HTMLElement, message: string): void {
        const status = root.querySelector<HTMLElement>('[data-newtab-status]');
        if (status) status.textContent = message;
    }

    private currentSessionSignature(): string {
        return [this.state.source, this.state.mode, this.sourceLabel].join('|');
    }

    private readStoredWordKey(): { signature: string; key: string } | null {
        try {
            const raw = sessionStorage.getItem(SESSION_WORD_KEY);
            if (!raw) return null;
            const value = JSON.parse(raw) as Partial<{ signature: string; key: string }>;
            return typeof value.signature === 'string' && typeof value.key === 'string' ? { signature: value.signature, key: value.key } : null;
        } catch {
            return null;
        }
    }

    private writeStoredWordKey(card: JPDBCard): void {
        try {
            sessionStorage.setItem(SESSION_WORD_KEY, JSON.stringify({
                signature: this.currentSessionSignature(),
                key: cardKey(card),
            }));
        } catch {
            // Refresh stability is a convenience; the page still works without storage.
        }
    }
}

function cleanNestedLookupValue(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

function consumeNestedLookupEvent(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
}

function appendLoadedWords(result: NewTabLoadResult, cards: JPDBCard[], labels: string[]): void {
    if (!result.cards.length) return;
    cards.push(...result.cards);
    labels.push(result.sourceLabel);
}

function emptyNewTabLoadAccumulator(): NewTabLoadAccumulator {
    return { cards: [], labels: [], dictionarySetupRequired: false, reviewCountMode: false };
}

function appendNewTabLoadResult(accumulator: NewTabLoadAccumulator, result: NewTabLoadResult): void {
    accumulator.dictionarySetupRequired ||= result.needsDictionarySetup;
    if (result.cards.length) accumulator.reviewCountMode ||= result.reviewCountMode === true;
    appendLoadedWords(result, accumulator.cards, accumulator.labels);
}

function newTabLoadResult(accumulator: NewTabLoadAccumulator): NewTabLoadResult {
    return {
        cards: accumulator.cards,
        sourceLabel: accumulator.labels.length ? accumulator.labels.join(' + ') : 'No source',
        needsDictionarySetup: accumulator.cards.length === 0 && accumulator.dictionarySetupRequired,
        reviewCountMode: accumulator.reviewCountMode,
    };
}

function setOptionalText(element: HTMLElement | null, text: string): void {
    if (element) element.textContent = text;
}

function dedupeWords(cards: JPDBCard[]): JPDBCard[] {
    const seen = new Map<string, JPDBCard>();
    for (const card of cards) {
        const key = dedupeWordKey(card);
        const existing = seen.get(key);
        if (shouldReplaceDedupeWord(card, existing)) seen.set(key, card);
    }
    return [...seen.values()];
}

function dedupeWordKey(card: JPDBCard): string {
    return card.reviewSource === 'jpdb-live'
        ? `jpdb-live\n${card.jpdbReviewId ?? card.spelling}`
        : `${card.spelling}\n${card.reading}`;
}

function shouldReplaceDedupeWord(card: JPDBCard, existing: JPDBCard | undefined): boolean {
    return !existing || sourcePriority(card) < sourcePriority(existing);
}

function sourcePriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return -1;
    if (!card.source || card.source === 'jpdb') return 0;
    if (card.source === 'anki') return 1;
    return 2;
}

function promoteCardByKey(cards: JPDBCard[], key: string): JPDBCard[] {
    if (!key) return cards;
    const index = cards.findIndex(card => cardKey(card) === key);
    if (index <= 0) return cards;
    const promoted = [...cards];
    const [card] = promoted.splice(index, 1);
    if (card) promoted.unshift(card);
    return promoted;
}

function markJpdbApiReviewCards(cards: JPDBCard[]): JPDBCard[] {
    return cards.map(card => ({
        ...card,
        reviewSource: card.reviewSource ?? 'jpdb-api',
    }));
}

function fact(label: string, value: string | undefined): [string, string] | null {
    return value ? [label, value] : null;
}

function compactFacts(facts: Array<[string, string] | null>): [string, string][] {
    return facts.filter((item): item is [string, string] => Boolean(item));
}

function heisigFact(fullInfo: JpdbKanjiInfo | null, rtk: RtkInfo | null): string {
    return [fullInfo?.heisig, rtk?.frameNumber ? `#${rtk.frameNumber}` : ''].filter(Boolean).join(' ');
}

function newTabKanjiReadings(fullInfo: JpdbKanjiInfo | null, localReadings: string[]): string[] {
    return fullInfo?.readings.length
        ? fullInfo.readings.slice(0, 8).map(reading => `${reading.reading}${reading.share ? ` ${reading.share}` : ''}`)
        : localReadings;
}

function newTabKanjiSourceAttrs(sourceStateKey: string, initiallyExpanded = true): string {
    return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}" ${initiallyExpanded ? 'open' : ''}`;
}

function renderNewTabKanjiInfoSection(
    card: JPDBCard,
    facts: [string, string][],
    readings: string[],
    localMeanings: string[],
    fullInfo: JpdbKanjiInfo | null,
): HTMLElement {
    return el('details', {
        class: 'jpdb-reader-local jpdb-reader-source-card jpdb-reader-newtab-kanji-info-source',
        open: true,
        dataset: {
            sourceStateKey: kanjiSourceStateKey(KANJI_JPDB_SOURCE_ID),
            sourceInitialOpen: 'true',
        },
    },
    el('summary', { class: 'jpdb-reader-local-title' }, 'JPDB kanji'),
    el('div', { class: 'jpdb-reader-local-entry jpdb-reader-newtab-kanji-info-body' },
        renderNewTabKanjiFactSection(card, facts),
        renderNewTabKanjiReadingSection(readings),
        renderNewTabKanjiLocalMeanings(localMeanings),
        renderNewTabKanjiComponents(fullInfo),
        renderNewTabKanjiVocabulary(fullInfo),
        renderNewTabKanjiMnemonic(fullInfo)));
}

function renderNewTabKanjiFactSection(card: JPDBCard, facts: [string, string][]): HTMLElement {
    return facts.length
        ? el('div', { class: 'jpdb-reader-kanji-facts' }, facts.map(([label, value]) => el('span', {}, el('strong', {}, label), value)))
        : el('div', { class: 'jpdb-reader-help' }, firstCardMeaning(card));
}

function renderNewTabKanjiReadingSection(readings: string[]): HTMLElement | null {
    return readings.length ? el('div', { class: 'jpdb-reader-kanji-readings' }, readings.map(reading => el('span', {}, reading))) : null;
}

function renderNewTabKanjiLocalMeanings(localMeanings: string[]): HTMLElement | null {
    return localMeanings.length ? el('div', { class: 'jpdb-reader-newtab-kanji-vocab' }, localMeanings.map(meaning => el('span', {}, meaning))) : null;
}

function renderNewTabKanjiComponents(fullInfo: JpdbKanjiInfo | null): HTMLElement | null {
    return fullInfo?.components.length
        ? el('div', { class: 'jpdb-reader-component-grid' }, fullInfo.components.slice(0, 8).map(component => el('button', {
            class: 'jpdb-reader-component-card',
            type: 'button',
            dataset: { action: 'kanji', kanji: component.kanji },
            title: `Show kanji: ${component.kanji}`,
        }, el('strong', {}, component.kanji), el('span', {}, component.keyword))))
        : null;
}

function renderNewTabKanjiVocabulary(fullInfo: JpdbKanjiInfo | null): HTMLElement | null {
    return fullInfo?.vocabulary.length
        ? el('div', { class: 'jpdb-reader-newtab-kanji-vocab' }, fullInfo.vocabulary.slice(0, 5).map(item => el('button', {
            class: 'jpdb-reader-newtab-kanji-popover-word',
            type: 'button',
            dataset: { action: 'similar-word', expression: item.expression, reading: item.reading },
            title: `Look up ${item.expression}`,
        },
        el('strong', {}, item.expression),
        el('span', { class: 'jpdb-reader-newtab-kanji-vocab-detail' }, [item.reading, item.meaning].filter(Boolean).join(' · ')))))
        : null;
}

function renderNewTabKanjiMnemonic(fullInfo: JpdbKanjiInfo | null): HTMLElement | null {
    return fullInfo?.mnemonic ? el('p', { class: 'jpdb-reader-newtab-kanji-mnemonic' }, fullInfo.mnemonic) : null;
}

function htmlToFirstElement(html: string): HTMLElement | null {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const first = template.content.firstElementChild;
    return first instanceof HTMLElement ? first : null;
}

function normalizeJpdbKanjiInfo(info: JpdbKanjiInfo): JpdbKanjiInfo {
    return {
        kanji: textOrEmpty(info.kanji),
        keyword: textOrEmpty(info.keyword),
        frequency: textOrEmpty(info.frequency),
        type: textOrEmpty(info.type),
        kanken: textOrEmpty(info.kanken),
        heisig: textOrEmpty(info.heisig),
        oldForms: arrayOrEmpty(info.oldForms),
        readings: arrayOrEmpty(info.readings),
        components: arrayOrEmpty(info.components),
        usedInKanji: arrayOrEmpty(info.usedInKanji),
        mnemonic: textOrEmpty(info.mnemonic),
        vocabulary: arrayOrEmpty(info.vocabulary),
        actions: arrayOrEmpty(info.actions),
        loggedIn: Boolean(info.loggedIn),
        kanjiReviewsEnabled: Boolean(info.kanjiReviewsEnabled),
    };
}

function textOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function arrayOrEmpty<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

function keywordCandidates(
    card: JPDBCard,
    jpdb: JpdbKanjiInfo | null,
    rtk: RtkInfo | null,
    source: ReaderSettings['newTabKanjiKeywordSource'],
): Array<string | undefined> {
    if (source === 'rtk') return [rtk?.keyword, card.kanjiKeyword];
    if (source === 'jpdb') return [jpdb?.keyword, card.kanjiKeyword];
    if (source === 'local') return [card.kanjiKeyword, jpdb?.keyword, rtk?.keyword];
    return [rtk?.keyword, jpdb?.keyword, card.kanjiKeyword];
}

function firstTruthy(values: Array<string | undefined>): string {
    return values.find(Boolean) ?? '';
}

function isNewTabStudyInteractiveTarget(target: HTMLElement): boolean {
    return Boolean(target.closest(NEW_TAB_STUDY_INTERACTIVE_SELECTOR));
}

function hasYomuRuntime(): boolean {
    const runtime = globalThis as { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown; __yomuDemoApp?: unknown; __yomuReaderAppInitialized?: unknown };
    return hasDirectYomuRuntime(runtime) || hasDemoYomuRuntime(runtime, yomuRuntimeOwnerMarker());
}

function hasDirectYomuRuntime(runtime: { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown; __yomuDemoApp?: unknown }): boolean {
    return Boolean(runtime.GM_info || runtime.__YOMU_READER_RUNTIME__ || runtime.__yomuDemoApp);
}

function hasDemoYomuRuntime(runtime: { __yomuReaderAppInitialized?: unknown }, marker: HTMLElement | null): boolean {
    return Boolean(runtime.__yomuReaderAppInitialized && marker?.dataset.yomuRuntimeKind === 'demo');
}

function yomuRuntimeOwnerMarker(): HTMLElement | null {
    return typeof document !== 'undefined'
        ? document.getElementById('jpdb-reader-runtime-owner') as HTMLElement | null
        : null;
}

function shouldShowInStudyQueue(card: JPDBCard): boolean {
    if (card.source === 'local' || card.source === 'fallback') return true;
    if (card.reviewSource === 'jpdb-live') return true;
    const states = card.cardState ?? [];
    return states.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'not-in-deck');
}

export function selectNewTabStudyPool(cards: JPDBCard[]): JPDBCard[] {
    const studyCards = cards.filter(shouldShowInStudyQueue);
    return studyCards.length ? studyCards : cards;
}

function sentenceForCard(card: JPDBCard): string {
    const sentence = card.sentence?.replace(/\s+/g, ' ').trim();
    if (sentence) return sentence;
    const withReading = card.wordWithReading?.replace(/\s+/g, ' ').trim();
    if (withReading && withReading.includes(card.spelling)) return withReading;
    return card.spelling;
}

function normalizeSearchQuery(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cardMatchesSearchSuggestion(card: JPDBCard, normalizedQuery: string): boolean {
    return [
        card.spelling,
        card.reading,
        firstCardMeaning(card),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
}

function searchSuggestionFromCard(card: JPDBCard): NewTabSearchSuggestion {
    return {
        query: card.spelling.trim(),
        reading: card.reading.trim(),
        meaning: firstCardMeaning(card),
    };
}

function queryHasJapanese(value: string): boolean {
    return /[\u3040-\u30ff\u3400-\u9fff々〆]/u.test(value);
}

function jpdbSearchUrl(query: string): string {
    return `https://jpdb.io/search?q=${encodeURIComponent(query)}`;
}

function jishoSearchUrl(query: string): string {
    return `https://jisho.org/search/${encodeURIComponent(query)}`;
}

function sentencePromptTarget(card: JPDBCard, sentence: string): string {
    if (sentence.includes(card.spelling)) return card.spelling;
    return card.reading && sentence.includes(card.reading) ? card.reading : '';
}

function shouldWaitForMoreDoodleStrokes(strokes: Parameters<typeof assessKanjiStrokes>[0], expectedStrokes: number): boolean {
    return expectedStrokes > 0 && strokes.length < expectedStrokes;
}

function visibleCardKanji(card: JPDBCard | undefined): string {
    return card ? kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '' : '';
}

function doodlePreviewDataUrl(canvas: HTMLCanvasElement): string {
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const context = snapshot.getContext('2d');
    if (!canPaintDoodlePreview(context)) return canvas.toDataURL('image/png');
    paintDoodlePreview(context, snapshot, canvas);
    return snapshot.toDataURL('image/png');
}

function canPaintDoodlePreview(context: CanvasRenderingContext2D | null): context is CanvasRenderingContext2D {
    return Boolean(context && typeof context.fillRect === 'function' && typeof context.drawImage === 'function');
}

function paintDoodlePreview(context: CanvasRenderingContext2D, snapshot: HTMLCanvasElement, canvas: HTMLCanvasElement): void {
    context.fillStyle = doodlePreviewBackground(canvas);
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(canvas, 0, 0);
}

function doodlePreviewBackground(canvas: HTMLCanvasElement): string {
    const stage = canvas.closest<HTMLElement>('.jpdb-reader-doodle-stage');
    return getComputedStyle(stage ?? canvas).backgroundColor || '#181b20';
}

function passingNewTabGrade(grade: JPDBGrade): boolean {
    return grade === 'pass' || grade === 'easy' || grade === 'okay';
}

function newTabGradeOptions(settings: ReaderSettings): Array<[JPDBGrade, string]> {
    return settings.twoButtonReviews
        ? [['fail', 'Fail'], ['pass', 'Pass']]
        : [['nothing', 'Nothing'], ['something', 'Something'], ['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy']];
}

function installOriginGraphDrag(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.jpdb-reader-origin-graph-wrap').forEach(wrap => {
        if (wrap.dataset.graphDragInstalled === 'true') {
            refreshOriginGraphEdgesAfterLayout(wrap);
            return;
        }
        wrap.dataset.graphDragInstalled = 'true';
        let active: { node: HTMLElement; pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
        let suppressClick = false;
        wrap.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            const node = (event.target as HTMLElement).closest<HTMLElement>('.jpdb-reader-origin-graph-node');
            if (!node || !wrap.contains(node)) return;
            active = { node, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
            node.classList.add('dragging');
            node.setPointerCapture?.(event.pointerId);
        });
        wrap.addEventListener('pointermove', event => {
            if (!active || active.pointerId !== event.pointerId) return;
            const rect = wrap.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            if (!active.moved && pointerDistance(active, event) < ORIGIN_GRAPH_DRAG_THRESHOLD_PX) return;
            event.preventDefault();
            active.moved = true;
            const x = clampGraphPercent(((event.clientX - rect.left) / rect.width) * 100);
            const y = clampGraphPercent(((event.clientY - rect.top) / rect.height) * 100);
            moveOriginGraphNode(active.node, x, y);
            refreshOriginGraphEdges(wrap);
        });
        const finish = (event: PointerEvent) => {
            if (!active || active.pointerId !== event.pointerId) return;
            active.node.classList.remove('dragging');
            active.node.releasePointerCapture?.(event.pointerId);
            if (active.moved) {
                suppressClick = true;
                event.preventDefault();
                event.stopPropagation();
            }
            active = null;
        };
        wrap.addEventListener('pointerup', finish);
        wrap.addEventListener('pointercancel', finish);
        wrap.addEventListener('click', event => {
            if (!suppressClick) return;
            suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
        }, true);
        refreshOriginGraphEdgesAfterLayout(wrap);
    });
}

function pointerDistance(active: { startX: number; startY: number }, event: PointerEvent): number {
    return Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
}

function refreshOriginGraphEdgesAfterLayout(wrap: HTMLElement): void {
    refreshOriginGraphEdges(wrap);
    wrap.dataset.graphReady = 'true';
    const requestFrame = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0);
    requestFrame(() => refreshOriginGraphEdges(wrap));
}

function moveOriginGraphNode(node: HTMLElement, x: number, y: number): void {
    node.dataset.x = String(x);
    node.dataset.y = String(y);
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
}

function refreshOriginGraphEdges(wrap: HTMLElement): void {
    wrap.querySelectorAll<SVGGElement>('.jpdb-reader-origin-edge-group').forEach(group => {
        const from = originGraphNodeGeometry(wrap, group.dataset.from);
        const to = originGraphNodeGeometry(wrap, group.dataset.to);
        if (!from || !to) return;
        const edgePath = graphEdgePath(from, to, originGraphTargetZone(group.dataset.targetZone));
        const path = group.querySelector<SVGPathElement>('.jpdb-reader-origin-edge');
        path?.setAttribute('d', edgePath.d);
    });
}

function originGraphNodeGeometry(wrap: HTMLElement, id: string | undefined): { x: number; y: number; rx: number; ry: number } | null {
    if (!id) return null;
    const node = Array.from(wrap.querySelectorAll<HTMLElement>('.jpdb-reader-origin-graph-node'))
        .find(candidate => candidate.dataset.graphNode === id);
    if (!node) return null;
    const measured = measuredOriginGraphNodeRadii(wrap, node);
    return {
        x: Number(node.dataset.x || 0),
        y: Number(node.dataset.y || 0),
        rx: measured.rx || Number(node.dataset.rx || 5),
        ry: measured.ry || Number(node.dataset.ry || 5),
    };
}

function measuredOriginGraphNodeRadii(wrap: HTMLElement, node: HTMLElement): { rx: number; ry: number } {
    const wrapRect = wrap.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) return { rx: 0, ry: 0 };
    const width = node.offsetWidth || node.getBoundingClientRect().width;
    const height = node.offsetHeight || node.getBoundingClientRect().height;
    return {
        rx: width > 0 ? (width / 2 / wrapRect.width) * 100 : 0,
        ry: height > 0 ? (height / 2 / wrapRect.height) * 100 : 0,
    };
}

function originGraphTargetZone(value: string | undefined): GraphAnchorZone {
    return value === 'top' || value === 'upper' || value === 'left' || value === 'right' || value === 'lower' || value === 'bottom' || value === 'center'
        ? value
        : 'auto';
}

function clampGraphPercent(value: number): number {
    return Math.max(6, Math.min(94, Number(value.toFixed(2))));
}

function liveJpdbCardFromBridgeCard(card: JpdbReviewBridgeCard, spelling: string): JPDBCard {
    return {
        vid: 0,
        sid: 0,
        rid: 0,
        spelling,
        reading: liveJpdbCardReading(card, spelling),
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [{
            glosses: liveJpdbCardGlosses(card),
            partOfSpeech: [],
        }],
        cardState: ['due'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jpdb',
        sentence: liveJpdbCardSentence(card),
        reviewSource: 'jpdb-live',
        jpdbReviewId: card.id,
        kanjiKeyword: liveJpdbCardKeyword(card),
    };
}

function liveJpdbCardReading(card: JpdbReviewBridgeCard, spelling: string): string {
    return card.reading || spelling;
}

function liveJpdbCardGlosses(card: JpdbReviewBridgeCard): string[] {
    return card.kind === 'kanji' ? [liveJpdbCardKeyword(card)].filter(Boolean) : [];
}

function liveJpdbCardSentence(card: JpdbReviewBridgeCard): string {
    return card.sentence || card.prompt;
}

function liveJpdbCardKeyword(card: JpdbReviewBridgeCard): string {
    return card.keyword || card.prompt;
}
