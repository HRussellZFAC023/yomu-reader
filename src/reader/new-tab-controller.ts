import type { AnkiConnectClient } from './anki';
import { primaryCardState } from './card-state';
import { APP_NAME, SUPPORT_LINKS } from './constants';
import { setInnerHtml } from './dom';
import { el, fragment, replaceChildrenWith } from './dom-builder';
import type { ImmersionKitClient, ImmersionKitExample } from './immersion-kit';
import type { JpdbClient } from './jpdb';
import type { JpdbKanjiClient, JpdbKanjiInfo } from './jpdb-kanji';
import { installKanjiDoodle } from './kanji-doodle';
import { assessKanjiStrokes, type KanjiStrokeAssessment } from './kanji-stroke-grader';
import type { KanjiVGClient, KanjiVGInfo } from './kanjivg';
import type { JpdbReviewBridgeCard, JpdbReviewBridgeClient, JpdbReviewBridgeStatus } from './jpdb-review-bridge';
import { Logger } from './logger';
import {
    cardKey,
    createNewTabStateChannel,
    firstCardMeaning,
    hasSavedNewTabUiState,
    isYomuNewTabUrl,
    kanjiCharacters,
    loadNewTabUiState,
    saveNewTabUiState,
    shuffleCards,
    type NewTabUiState,
} from './new-tab';
import type { ReaderParser } from './reader-parser';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';
import type { RtkClient, RtkInfo } from './rtk';
import { gmStorageGet, gmStorageSet } from './storage';
import type { YomitanDictionaryStore } from './yomitan';
import { getUserscriptHttpRequest } from './userscript';

interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    anki: AnkiConnectClient;
    jpdb: JpdbClient;
    jpdbKanji: JpdbKanjiClient;
    kanjiVG: KanjiVGClient;
    rtk: RtkClient;
    immersionKit: ImmersionKitClient;
    jpdbReviewBridge: JpdbReviewBridgeClient;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    ensureStarterDictionary: (onProgress?: (message: string) => void) => Promise<boolean>;
    onSettingsChange: () => Promise<void> | void;
    applyTheme: () => void;
    showSettings: (tab?: string) => void;
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

interface NewTabLoadResult {
    cards: JPDBCard[];
    sourceLabel: string;
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

const log = Logger.scope('NewTab');
const SESSION_WORD_KEY = 'jpdb-reader-newtab-current-word';
const SESSION_DICTIONARY_SETUP_KEY = 'jpdb-reader-newtab-install-dictionary';
const JPDB_ALL_DECKS = 'all';
const JPDB_DECK_SAMPLE_LIMIT = 6;
const JPDB_WORDS_PER_DECK = 36;
const NEW_TAB_WORD_LIMIT = 180;
const NEW_TAB_CACHE_KEY = 'jpdb-reader-newtab-card-cache';

export class NewTabController {
    private allWords: JPDBCard[] = [];
    private visibleWords: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private state: NewTabUiState;
    private readonly stateChannel: ReturnType<typeof createNewTabStateChannel>;
    private readonly unsubscribeJpdbBridge: () => void;
    private liveJpdbStatus: JpdbReviewBridgeStatus | null = null;
    private liveCards = new Map<string, JpdbReviewBridgeCard>();
    private keywordCache = new Map<string, string>();
    private kanjiInfoCache = new Map<string, Promise<{ jpdb: JpdbKanjiInfo | null; rtk: RtkInfo | null; vg: KanjiVGInfo | null }>>();
    private immersionCache = new Map<string, Promise<ImmersionKitExample | null>>();
    private dictionarySetupRequired = false;

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
        if (!settings.newTabEnabled) {
            settings.newTabEnabled = true;
            await this.dependencies.onSettingsChange();
        }
        this.applyPalette();

        let root = document.querySelector<HTMLElement>('.jpdb-reader-newtab[data-jpdb-reader-root]');
        const isNew = !root;
        if (!root) {
            root = document.createElement('main');
            root.className = 'jpdb-reader-newtab';
            root.dataset.jpdbReaderRoot = 'true';
            document.body.replaceChildren(root);
        }
        if (root.dataset.newtabBound !== 'true') {
            this.bindRootEvents(root);
            root.dataset.newtabBound = 'true';
        }

        const hasStudyMarkup = !!root.querySelector('[data-newtab-study]');
        const isStandaloneShell = root.dataset.standaloneNewtab === 'true';
        if (isNew || !hasStudyMarkup || isStandaloneShell) {
            delete root.dataset.standaloneNewtab;
            root.replaceChildren(this.renderEnabledContent());
            this.syncMode(root);
        }
        this.syncThemeToggle(root);

        if (isNew || !hasStudyMarkup || isStandaloneShell || this.allWords.length === 0) await this.loadWordsInto(root, true);
        else this.applyWords(root, true);
    }

    destroy(): void {
        this.stateChannel.close();
        this.unsubscribeJpdbBridge();
    }

    private renderEnabledContent(): DocumentFragment {
        return fragment(
            el('div', { class: 'jpdb-reader-newtab-shell' },
                el('header', { class: 'jpdb-reader-newtab-topbar' },
                    el('a', { class: 'jpdb-reader-newtab-brand', href: SUPPORT_LINKS.docs, 'aria-label': `Open ${APP_NAME}` },
                        el('img', { src: `${SUPPORT_LINKS.docs}yomu-icon.svg`, alt: '', width: 32, height: 32 }),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-mode', role: 'group', 'aria-label': 'Study mode' },
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'word' } }, 'Word'),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' } }, 'Kanji'),
                    ),
                    el('button', {
                        class: 'jpdb-reader-newtab-theme',
                        type: 'button',
                        dataset: { newtabAction: 'theme' },
                        'aria-label': 'Switch theme',
                        title: 'Switch theme',
                    }, el('span', { dataset: { newtabThemeIcon: true }, 'aria-hidden': 'true' }, '☾')),
                    el('button', {
                        class: 'jpdb-reader-newtab-overflow',
                        type: 'button',
                        dataset: { newtabAction: 'settings' },
                        'aria-label': `Open ${APP_NAME} settings`,
                    }, '...'),
                ),
                el('section', { class: 'jpdb-reader-newtab-study', dataset: { newtabStudy: true }, 'aria-live': 'polite' },
                    el('div', { class: 'jpdb-reader-newtab-count', dataset: { newtabCount: true } }, '0 / 0'),
                    el('div', { class: 'jpdb-reader-newtab-prompt', dataset: { newtabPrompt: true }, lang: 'ja' }, 'よむ'),
                    el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                        el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                        el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-status', dataset: { newtabStatus: true } }, 'Loading...'),
                ),
                el('nav', { class: 'jpdb-reader-newtab-controls', dataset: { newtabControls: true }, 'aria-label': 'Study navigation' },
                    el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': 'Previous word' }, 'Previous'),
                    el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
                    el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': 'Next word' }, 'Next'),
                ),
                el('a', {
                    class: 'jpdb-reader-newtab-install',
                    href: SUPPORT_LINKS.docs,
                    target: '_blank',
                    rel: 'noopener',
                    hidden: true,
                    dataset: { newtabInstall: true },
                }, 'Get Yomu'),
            ),
        );
    }

    private bindRootEvents(root: HTMLElement): void {
        root.addEventListener('click', event => {
            if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
            const target = event.target as HTMLElement;
            const action = target.closest<HTMLElement>('[data-newtab-action]')?.dataset.newtabAction;
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
            if (action === 'next') {
                event.preventDefault();
                this.showNextWord();
                return;
            }
            if (action === 'skip') {
                event.preventDefault();
                this.showNextWord();
                return;
            }
            if (action === 'previous') {
                event.preventDefault();
                this.showPreviousWord();
                return;
            }
            if (action === 'reveal') {
                event.preventDefault();
                const current = this.visibleWords[this.index];
                if (current?.reviewSource === 'jpdb-live' && !this.state.revealAnswer) this.dependencies.jpdbReviewBridge.reveal();
                this.setState({ revealAnswer: !this.state.revealAnswer }, root, { preserveWord: true });
                return;
            }
            if (action === 'connect-jpdb') {
                event.preventDefault();
                window.open('https://jpdb.io/review', '_blank', 'noopener');
                this.dependencies.jpdbReviewBridge.requestCurrent();
                this.setStatus(root, 'Open JPDB review, then come back here.');
                return;
            }
            if (action === 'load-dictionary') {
                event.preventDefault();
                void this.installStarterDictionary(root);
                return;
            }
            if (action === 'grade') {
                event.preventDefault();
                const grade = target.closest<HTMLElement>('[data-grade]')?.dataset.grade as JPDBGrade | undefined;
                if (grade) void this.gradeCurrentCard(grade);
                return;
            }
            if (action === 'mode') {
                event.preventDefault();
                const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode === 'kanji' ? 'kanji' : 'word';
                this.setState({ mode, revealAnswer: false }, root, { preserveWord: false });
                return;
            }
            const study = target.closest<HTMLElement>('[data-newtab-study]');
            if (study && !target.closest('.jpdb-reader-word, .jpdb-reader-doodle-stage, audio, button, a')) {
                event.preventDefault();
                this.setState({ revealAnswer: !this.state.revealAnswer }, root, { preserveWord: true });
            }
        });

        root.addEventListener('keydown', event => {
            if (root.dataset.standaloneNewtab === 'true' && !this.allWords.length) return;
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, select, textarea')) return;
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
                this.setState({ revealAnswer: !this.state.revealAnswer }, root, { preserveWord: true });
            }
        });
    }

    private applyPalette(): void {
        const settings = this.dependencies.getSettings();
        document.documentElement.style.setProperty('--jpdb-newtab-known', settings.wordColorKnown);
        document.documentElement.style.setProperty('--jpdb-newtab-unknown', settings.wordColorFailed);
    }

    private async loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void> {
        try {
            this.setStatus(root, 'Loading...');
            const result = await this.loadWords(message => this.setStatus(root, message));
            this.allWords = dedupeWords(result.cards).slice(0, NEW_TAB_WORD_LIMIT);
            this.sourceLabel = result.sourceLabel;
            if (this.allWords.length) void this.writeOfflineCache(this.allWords, this.sourceLabel);
            if (!this.allWords.length) {
                const cached = await this.readOfflineCache();
                if (cached.cards.length) {
                    this.allWords = cached.cards;
                    this.sourceLabel = `${cached.sourceLabel} (offline)`;
                    this.setStatus(root, 'Offline cache');
                }
            }
            this.dependencies.parser.cacheCards(this.allWords);
            if (!this.allWords.length) {
                if (root.dataset.standaloneNewtab === 'true') {
                    this.setStatus(root, '');
                    return;
                }
                if (this.dictionarySetupRequired) {
                    if (this.consumeDictionarySetupRequest()) {
                        await this.installStarterDictionary(root);
                        return;
                    }
                    this.renderDictionarySetup(root);
                    return;
                }
                this.renderEmpty(root, 'よむ', 'No words yet.');
                return;
            }
            delete root.dataset.standaloneNewtab;
            this.applyWords(root, preferStoredWord);
        } catch (error) {
            log.warn('Failed to load words', error);
            const cached = await this.readOfflineCache();
            if (cached.cards.length) {
                this.allWords = cached.cards;
                this.sourceLabel = `${cached.sourceLabel} (offline)`;
                this.dependencies.parser.cacheCards(this.allWords);
                this.applyWords(root, preferStoredWord);
                this.setStatus(root, 'Offline cache. Grades are disabled until the source reconnects.');
                return;
            }
            this.renderEmpty(root, 'よむ', 'Could not load words.');
        }
    }

    private async loadWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        this.dictionarySetupRequired = false;
        const source = this.state.source;
        const sourceOrder = source === 'auto'
            ? ['anki', 'jpdb', 'dictionary'] as const
            : [source] as const;
        const labels: string[] = [];
        const cards: JPDBCard[] = [];

        for (const item of sourceOrder) {
            if (item === 'anki') {
                const result = await this.loadAnkiWords();
                if (result.cards.length) {
                    cards.push(...result.cards);
                    labels.push(result.sourceLabel);
                }
            }
            if (item === 'jpdb') {
                const result = await this.loadJpdbWords();
                if (result.cards.length) {
                    cards.push(...result.cards);
                    labels.push(result.sourceLabel);
                }
            }
            if (item === 'dictionary') {
                if (source === 'auto' && cards.length > 0) continue;
                const result = await this.loadDictionaryWords(onProgress);
                if (result.cards.length) {
                    cards.push(...result.cards);
                    labels.push(result.sourceLabel);
                }
            }
        }

        return {
            cards,
            sourceLabel: labels.length ? labels.join(' + ') : 'No source',
        };
    }

    private async loadAnkiWords(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.ankiEnabled) return { cards: [], sourceLabel: 'Anki' };
        const cards = await this.dependencies.anki.listNewTabCards(80).catch(error => {
            log.debug('Anki new tab source unavailable', error);
            return [];
        });
        return { cards, sourceLabel: cards.length ? 'Anki' : 'Anki' };
    }

    private async loadDictionaryWords(_onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        try {
            const summary = await this.dependencies.dictionaries.summary().catch(() => null);
            const entries = summary?.terms
                ? await this.dependencies.dictionaries.listRandomTopTerms(90, 4000, settings.dictionaryPreferences)
                : [];
            if (!entries.length) this.dictionarySetupRequired = true;
            return {
                cards: entries.map(entry => this.dependencies.parser.localCardFromEntry(entry)),
                sourceLabel: 'Dictionary',
            };
        } catch (error) {
            log.debug('Dictionary word load failed', error);
            return { cards: [], sourceLabel: 'Dictionary' };
        }
    }

    private async loadJpdbWords(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (settings.newTabJpdbReviewMode !== 'api-vocabulary') {
            const live = this.liveCardFromBridge();
            if (live) return { cards: [live], sourceLabel: 'JPDB live review' };
            this.dependencies.jpdbReviewBridge.requestCurrent();
            if (settings.newTabJpdbReviewMode === 'live-review') return { cards: [], sourceLabel: 'JPDB live review' };
        }
        if (!settings.apiKey.trim()) return { cards: [], sourceLabel: 'JPDB' };

        const selectedDeck = settings.newTabJpdbDeck.trim() || JPDB_ALL_DECKS;
        if (selectedDeck !== JPDB_ALL_DECKS) {
            try {
                const cards = await this.dependencies.jpdb.listDeckCards(selectedDeck, 90);
                return { cards, sourceLabel: 'JPDB' };
            } catch (error) {
                log.debug('JPDB selected deck load failed', { deckId: selectedDeck }, error);
            }
        }

        const decks = await this.dependencies.jpdb.listDecks().catch(() => []);
        const eligibleDecks = decks
            .filter(deck => !/(never\s*-?\s*forget|blacklist|suspend)/i.test(`${deck.id} ${deck.name}`))
            .slice(0, JPDB_DECK_SAMPLE_LIMIT);
        const cards: JPDBCard[] = [];
        for (const deck of eligibleDecks) {
            try {
                cards.push(...await this.dependencies.jpdb.listDeckCards(deck.id, JPDB_WORDS_PER_DECK));
            } catch (error) {
                log.debug('JPDB all-decks sample failed', { deck: deck.id }, error);
            }
        }

        return { cards, sourceLabel: 'JPDB' };
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveWord: boolean }): void {
        this.state = { ...this.state, ...patch };
        this.persistState();
        this.syncMode(root);
        this.applyWords(root, options.preserveWord);
    }

    private applyExternalState(state: NewTabUiState): void {
        if (JSON.stringify(this.state) === JSON.stringify(state)) return;
        this.state = state;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root) return;
        this.syncMode(root);
        this.applyWords(root, true);
    }

    private persistState(): void {
        saveNewTabUiState(this.state);
        this.stateChannel.publish(this.state);
    }

    private applyWords(root: HTMLElement, preferStoredWord: boolean): void {
        this.syncMode(root);
        const reviewableWords = this.allWords.filter(card => shouldShowInStudyQueue(card));
        const baseWords = this.state.mode === 'kanji'
            ? reviewableWords.filter(card => kanjiCharacters(card.spelling).length > 0 || Boolean(card.kanjiKeyword))
            : reviewableWords;
        this.visibleWords = shuffleCards(baseWords);
        if (!this.visibleWords.length) {
            this.index = 0;
            this.renderEmpty(root, 'よむ', this.state.mode === 'kanji' ? 'No kanji reviews yet.' : 'No reviews due yet.');
            return;
        }
        this.index = this.resolveInitialIndex(preferStoredWord);
        this.renderWord(root, this.visibleWords[this.index]);
    }

    private resolveInitialIndex(preferStoredWord: boolean): number {
        if (preferStoredWord) {
            const stored = this.readStoredWordKey();
            if (stored?.signature === this.currentSessionSignature()) {
                const index = this.visibleWords.findIndex(card => cardKey(card) === stored.key);
                if (index >= 0) return index;
            }
        }
        return 0;
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
        root.classList.toggle('jpdb-reader-newtab-review-mode', this.isReviewCard(card));
        this.syncThemeToggle(root);
        const slots = this.studySlots(root);
        const state = primaryCardState(card.cardState);

        if (this.state.mode === 'kanji') this.renderKanjiPrompt(slots, card, state);
        else this.renderWordPrompt(slots, card, state);

        if (slots.count) slots.count.textContent = `${this.index + 1} / ${this.visibleWords.length}`;
        if (slots.reveal) slots.reveal.textContent = this.state.revealAnswer ? 'Hide' : 'Reveal';
        this.renderControls(slots, card);
        this.renderInstallCta(root);
        if (slots.status) slots.status.textContent = '';
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

    private renderKanjiPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        const kanji = kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '字';
        const keyword = this.kanjiKeyword(card, kanji);
        if (slots.prompt) {
            slots.prompt.lang = 'en';
            slots.prompt.dataset.newtabExpression = 'true';
            slots.prompt.textContent = keyword || 'keyword';
        }
        if (slots.answer) {
            replaceChildrenWith(slots.answer,
                el('div', { class: 'jpdb-reader-newtab-kanji-answer' },
                    el('div', { class: 'jpdb-reader-newtab-kanji-glyph', lang: 'ja' }, kanji),
                    el('div', { class: 'jpdb-reader-newtab-kanji-svg', dataset: { newtabKanjiSvg: kanji } }, kanji),
                    el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle', dataset: { kanji } },
                        el('div', { class: 'jpdb-reader-doodle-ghost', dataset: { newtabDoodleGhost: true } }),
                        el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': `Draw ${kanji}` }),
                        el('div', { class: 'jpdb-reader-newtab-doodle-actions' },
                            el('button', { type: 'button', dataset: { doodleClear: true } }, 'Clear'),
                            el('button', { type: 'button', dataset: { doodleTrace: true } }, 'Ghost'),
                        ),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-doodle-result', dataset: { newtabDoodleResult: true } }),
                ),
            );
            installKanjiDoodle(slots.answer, () => this.dependencies.getSettings().interfaceLanguage, {
                onChange: strokes => this.assessDoodle(slots, card, kanji, strokes),
                onClear: () => this.clearDoodleAssessment(slots),
            });
        }
        if (slots.meaning) slots.meaning.textContent = `${card.reading}${firstCardMeaning(card) ? ` · ${firstCardMeaning(card)}` : ''}`;
        void this.enrichKanjiCard(slots, card, kanji, state);
    }

    private renderWordPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (slots.prompt) {
            slots.prompt.lang = 'ja';
            slots.prompt.dataset.newtabExpression = 'true';
            replaceChildrenWith(slots.prompt, this.renderSentencePrompt(card, state));
        }
        if (slots.answer) slots.answer.textContent = card.reading && card.reading !== card.spelling ? card.reading : '';
        if (slots.meaning) replaceChildrenWith(slots.meaning, el('div', {}, firstCardMeaning(card)));
        void this.renderImmersionExample(slots, card);
    }

    private renderSentencePrompt(card: JPDBCard, state: ReturnType<typeof primaryCardState>): HTMLElement {
        const sentence = sentenceForCard(card);
        const wrap = el('span', { class: 'jpdb-reader-newtab-sentence' });
        if (!this.dependencies.getSettings().newTabParsingEnabled || !sentence || sentence === card.spelling) {
            wrap.append(this.renderReaderWord(card, state, card.spelling, sentence || card.spelling));
            return wrap;
        }

        const target = sentence.includes(card.spelling) ? card.spelling : (card.reading && sentence.includes(card.reading) ? card.reading : '');
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

    private async renderImmersionExample(slots: NewTabStudySlots, card: JPDBCard): Promise<void> {
        if (!this.state.revealAnswer || !slots.meaning || !this.dependencies.getSettings().immersionKitEnabled) return;
        const key = cardKey(card);
        const example = await this.loadImmersionExample(card);
        if (!example || cardKey(this.visibleWords[this.index]) !== key || !slots.meaning.isConnected) return;
        const soundUrl = this.dependencies.immersionKit.mediaUrl(example, 'sound');
        slots.meaning.append(el('div', { class: 'jpdb-reader-newtab-immersion' },
            el('div', { class: 'jpdb-reader-newtab-immersion-source' }, example.sourceTitle),
            el('div', { class: 'jpdb-reader-newtab-immersion-sentence', lang: 'ja' }, example.sentence),
            soundUrl ? el('audio', { controls: true, preload: 'none', src: soundUrl }) : null,
        ));
    }

    private loadImmersionExample(card: JPDBCard): Promise<ImmersionKitExample | null> {
        const query = card.spelling.trim();
        const existing = this.immersionCache.get(query);
        if (existing) return existing;
        const promise = this.dependencies.immersionKit.search(query, this.dependencies.getSettings())
            .then(examples => examples[0] ?? null)
            .catch(() => null);
        this.immersionCache.set(query, promise);
        return promise;
    }

    private kanjiKeyword(card: JPDBCard, kanji: string): string {
        return this.keywordCache.get(kanji)
            || card.kanjiKeyword
            || firstCardMeaning(card).split(/[;；,，]/)[0]?.trim()
            || card.reading
            || kanji;
    }

    private async enrichKanjiCard(slots: NewTabStudySlots, card: JPDBCard, kanji: string, state: ReturnType<typeof primaryCardState>): Promise<void> {
        const key = cardKey(card);
        const details = await this.loadKanjiDetails(kanji);
        if (cardKey(this.visibleWords[this.index]) !== key) return;

        const keyword = this.keywordFromDetails(card, details.jpdb, details.rtk);
        if (keyword) {
            this.keywordCache.set(kanji, keyword);
            if (slots.prompt) slots.prompt.textContent = keyword;
        }
        if (slots.answer && details.vg?.svg) {
            const svg = slots.answer.querySelector<HTMLElement>('[data-newtab-kanji-svg]');
            const ghost = slots.answer.querySelector<HTMLElement>('[data-newtab-doodle-ghost]');
            if (svg) setInnerHtml(svg, details.vg.svg);
            if (ghost) setInnerHtml(ghost, details.vg.svg);
        }
        if (slots.meaning) {
            const readings = details.jpdb?.readings.slice(0, 4).map(item => item.reading).join(' / ') || card.reading;
            const meaning = firstCardMeaning(card);
            replaceChildrenWith(slots.meaning,
                el('div', {}, [readings, meaning].filter(Boolean).join(' · ')),
                el('div', { class: 'jpdb-reader-newtab-kanji-popover-word' }, this.renderReaderWord(card, state, kanji, sentenceForCard(card))),
            );
        }
    }

    private loadKanjiDetails(kanji: string): Promise<{ jpdb: JpdbKanjiInfo | null; rtk: RtkInfo | null; vg: KanjiVGInfo | null }> {
        const existing = this.kanjiInfoCache.get(kanji);
        if (existing) return existing;
        const promise = Promise.all([
            this.dependencies.jpdbKanji.lookup(kanji).catch(() => null),
            this.dependencies.rtk.lookup(kanji).catch(() => null),
            this.dependencies.kanjiVG.lookup(kanji).catch(() => null),
        ]).then(([jpdb, rtk, vg]) => ({ jpdb, rtk, vg }));
        this.kanjiInfoCache.set(kanji, promise);
        return promise;
    }

    private keywordFromDetails(card: JPDBCard, jpdb: JpdbKanjiInfo | null, rtk: RtkInfo | null): string {
        const source = this.dependencies.getSettings().newTabKanjiKeywordSource;
        if (source === 'rtk') return rtk?.keyword || firstCardMeaning(card);
        if (source === 'jpdb') return jpdb?.keyword || firstCardMeaning(card);
        if (source === 'local') return firstCardMeaning(card) || jpdb?.keyword || rtk?.keyword || '';
        return rtk?.keyword || jpdb?.keyword || firstCardMeaning(card) || '';
    }

    private async assessDoodle(slots: NewTabStudySlots, card: JPDBCard, kanji: string, strokes: Parameters<typeof assessKanjiStrokes>[0]): Promise<void> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabKanjiAutogradeEnabled) return;
        const details = await this.loadKanjiDetails(kanji);
        const assessment = assessKanjiStrokes(strokes, details.vg?.strokeCount ?? strokes.length);
        this.renderDoodleAssessment(slots, assessment);
        if (settings.newTabKanjiAutoSubmit && this.state.revealAnswer) {
            void this.gradeCurrentCard(assessment.passed ? 'pass' : 'fail');
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
        root.classList.add('jpdb-reader-newtab-revealed');
        root.classList.add('jpdb-reader-newtab-empty-mode');
        root.classList.remove('jpdb-reader-newtab-setup-mode', 'jpdb-reader-newtab-review-mode');
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
        const slots = this.studySlots(root);
        if (slots.prompt) {
            delete slots.prompt.dataset.newtabExpression;
            slots.prompt.textContent = prompt;
        }
        if (slots.answer) slots.answer.textContent = message;
        if (slots.meaning) slots.meaning.textContent = '';
        if (slots.count) slots.count.textContent = '';
        if (slots.status) slots.status.textContent = '';
        if (slots.controls) {
            const needsJpdb = (this.state.source === 'jpdb' || this.state.source === 'auto')
                && this.dependencies.getSettings().newTabJpdbReviewMode !== 'api-vocabulary';
            replaceChildrenWith(slots.controls,
                needsJpdb
                    ? el('button', { type: 'button', dataset: { newtabAction: 'connect-jpdb' } }, 'Connect JPDB reviews')
                    : el('button', { type: 'button', dataset: { newtabAction: 'previous' } }, 'Previous'),
                el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
                el('button', { type: 'button', dataset: { newtabAction: 'next' } }, 'Next'),
            );
        }
    }

    private renderDictionarySetup(root: HTMLElement): void {
        root.classList.add('jpdb-reader-newtab-revealed');
        root.classList.add('jpdb-reader-newtab-setup-mode');
        root.classList.remove('jpdb-reader-newtab-empty-mode', 'jpdb-reader-newtab-review-mode', 'jpdb-reader-newtab-kanji-mode');
        this.syncThemeToggle(root);
        root.querySelector<HTMLElement>('[data-newtab-study]')?.removeAttribute('data-newtab-card');
        const slots = this.studySlots(root);
        if (slots.prompt) {
            delete slots.prompt.dataset.newtabExpression;
            slots.prompt.textContent = 'Start with a dictionary';
        }
        if (slots.answer) slots.answer.textContent = 'Add a dictionary to turn this page into study cards.';
        if (slots.meaning) slots.meaning.textContent = 'It stays in this browser and is ready whenever a new tab opens.';
        if (slots.count) slots.count.textContent = '';
        if (slots.status) slots.status.textContent = '';
        if (slots.controls) {
            replaceChildrenWith(slots.controls,
                el('button', { type: 'button', dataset: { newtabAction: 'load-dictionary' } }, 'Add dictionary'),
            );
        }
    }

    private async installStarterDictionary(root: HTMLElement): Promise<void> {
        if (!getUserscriptHttpRequest()) {
            this.setStatus(root, 'Dictionary download needs the Yomu userscript. Install Yomu, or import a Yomitan dictionary from Settings.');
            return;
        }
        this.setStatus(root, 'Adding dictionary...');
        try {
            const installed = await this.dependencies.ensureStarterDictionary(message => this.setStatus(root, message));
            if (!installed) {
                this.setStatus(root, 'Dictionary was not added.');
                return;
            }
            this.dictionarySetupRequired = false;
            await this.loadWordsInto(root, false);
        } catch (error) {
            log.warn('Starter dictionary setup failed', error);
            this.setStatus(root, 'Could not add the dictionary. Check your connection and try again.');
        }
    }

    private consumeDictionarySetupRequest(): boolean {
        try {
            if (sessionStorage.getItem(SESSION_DICTIONARY_SETUP_KEY) !== '1') return false;
            sessionStorage.removeItem(SESSION_DICTIONARY_SETUP_KEY);
            return true;
        } catch {
            return false;
        }
    }

    private renderControls(slots: NewTabStudySlots, card: JPDBCard): void {
        if (!slots.controls) return;
        if (!this.isReviewCard(card)) {
            replaceChildrenWith(slots.controls,
                el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': 'Previous word' }, 'Previous'),
                el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, this.state.revealAnswer ? 'Hide' : 'Reveal'),
                el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': 'Next word' }, 'Next'),
            );
            return;
        }

        if (!this.state.revealAnswer) {
            replaceChildrenWith(slots.controls,
                el('button', { type: 'button', dataset: { newtabAction: 'skip' } }, 'Skip'),
                el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
            );
            return;
        }

        const grades: Array<[JPDBGrade, string]> = this.dependencies.getSettings().twoButtonReviews
            ? [['fail', 'Fail'], ['pass', 'Pass']]
            : [['nothing', 'Nothing'], ['something', 'Something'], ['hard', 'Hard'], ['okay', 'Okay'], ['easy', 'Easy']];
        replaceChildrenWith(slots.controls, grades.map(([grade, label]) =>
            el('button', { type: 'button', dataset: { newtabAction: 'grade', grade } }, label),
        ));
    }

    private renderInstallCta(root: HTMLElement): void {
        const install = root.querySelector<HTMLAnchorElement>('[data-newtab-install]');
        if (!install) return;
        const runtime = globalThis as { GM_info?: unknown; __YOMU_READER_RUNTIME__?: unknown };
        const hasRuntime = Boolean(runtime.GM_info || runtime.__YOMU_READER_RUNTIME__);
        install.hidden = hasRuntime || root.dataset.standaloneNewtab !== 'true';
    }

    private isReviewCard(card: JPDBCard): boolean {
        return card.reviewSource === 'anki'
            || card.reviewSource === 'jpdb-api'
            || card.reviewSource === 'jpdb-live'
            || card.source === 'anki'
            || (card.source === 'jpdb' && card.vid > 0 && card.sid > 0);
    }

    private async gradeCurrentCard(grade: JPDBGrade): Promise<void> {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        const card = this.visibleWords[this.index];
        if (!root || !card) return;
        if (this.sourceLabel.includes('(offline)')) {
            this.setStatus(root, 'Offline cache. Reconnect JPDB or Anki to submit grades.');
            return;
        }
        try {
            this.setStatus(root, 'Grading...');
            if (card.reviewSource === 'jpdb-live') {
                this.dependencies.jpdbReviewBridge.grade(grade);
                this.dependencies.jpdbReviewBridge.requestCurrent();
            } else if (card.source === 'anki' || card.reviewSource === 'anki') {
                const cardId = card.ankiCardId ?? card.rid;
                if (!cardId) throw new Error('Missing Anki card id.');
                await this.dependencies.anki.answerCard(cardId, grade);
            } else if (card.source === 'jpdb' || card.reviewSource === 'jpdb-api') {
                await this.dependencies.jpdb.reviewCard(card, grade);
            }
            this.setStatus(root, grade === 'pass' || grade === 'easy' || grade === 'okay' ? '✓' : '✕');
            this.showNextWord();
        } catch (error) {
            log.warn('New tab grade failed', { term: card.spelling, source: card.source, grade }, error);
            this.setStatus(root, 'Could not submit grade.');
        }
    }

    private applyJpdbBridgeStatus(status: JpdbReviewBridgeStatus): void {
        this.liveJpdbStatus = status;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !(this.state.source === 'jpdb' || this.state.source === 'auto')) return;
        if (!status.card) {
            if (!this.allWords.length) this.setStatus(root, status.message || 'Open JPDB review to connect.');
            return;
        }
        const card = this.cardFromLiveJpdb(status.card);
        if (!card) return;
        const existingIndex = this.allWords.findIndex(item => item.reviewSource === 'jpdb-live');
        if (existingIndex >= 0) this.allWords.splice(existingIndex, 1, card);
        else this.allWords.unshift(card);
        this.applyWords(root, false);
    }

    private liveCardFromBridge(): JPDBCard | null {
        const status = this.liveJpdbStatus ?? this.dependencies.jpdbReviewBridge.latestStatus();
        return status.card ? this.cardFromLiveJpdb(status.card) : null;
    }

    private cardFromLiveJpdb(card: JpdbReviewBridgeCard): JPDBCard | null {
        const spelling = card.kind === 'kanji' ? card.kanji : card.spelling;
        if (!spelling) return null;
        const jpdbCard: JPDBCard = {
            vid: 0,
            sid: 0,
            rid: 0,
            spelling,
            reading: card.reading || spelling,
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [{
                glosses: card.kind === 'kanji' ? [card.keyword || card.prompt].filter(Boolean) : [],
                partOfSpeech: [],
            }],
            cardState: ['due'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'jpdb',
            sentence: card.sentence || card.prompt,
            reviewSource: 'jpdb-live',
            jpdbReviewId: card.id,
            kanjiKeyword: card.keyword || card.prompt,
        };
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
        }).catch(error => log.debug('New tab offline cache write failed', error));
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
                vid: card.vid,
                sid: card.sid,
                sentence,
            },
            tabIndex: 0,
        }, text);
    }

    private syncMode(root: HTMLElement): void {
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
        const icon = root.querySelector<HTMLElement>('[data-newtab-theme-icon]');
        if (!button || !icon) return;
        icon.textContent = theme === 'dark' ? '☀' : '☾';
        const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
        button.setAttribute('aria-label', label);
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

function dedupeWords(cards: JPDBCard[]): JPDBCard[] {
    const seen = new Map<string, JPDBCard>();
    for (const card of cards) {
        const key = card.reviewSource === 'jpdb-live'
            ? `jpdb-live\n${card.jpdbReviewId ?? card.spelling}`
            : `${card.spelling}\n${card.reading}`;
        const existing = seen.get(key);
        if (!existing || sourcePriority(card) < sourcePriority(existing)) seen.set(key, card);
    }
    return [...seen.values()];
}

function sourcePriority(card: JPDBCard): number {
    if (card.reviewSource === 'jpdb-live') return -1;
    if (!card.source || card.source === 'jpdb') return 0;
    if (card.source === 'anki') return 1;
    return 2;
}

function shouldShowInStudyQueue(card: JPDBCard): boolean {
    if (card.source === 'local' || card.source === 'fallback') return true;
    if (card.reviewSource === 'jpdb-live') return true;
    const states = card.cardState ?? [];
    return states.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'not-in-deck');
}

function sentenceForCard(card: JPDBCard): string {
    const sentence = card.sentence?.replace(/\s+/g, ' ').trim();
    if (sentence) return sentence;
    const withReading = card.wordWithReading?.replace(/\s+/g, ' ').trim();
    if (withReading && withReading.includes(card.spelling)) return withReading;
    return card.spelling;
}
