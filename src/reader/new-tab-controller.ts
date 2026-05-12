import type { AnkiConnectClient } from './anki';
import { primaryCardState } from './card-state';
import { APP_NAME, APP_PUCK, SUPPORT_LINKS } from './constants';
import { el, fragment, replaceChildrenWith } from './dom-builder';
import type { JpdbClient } from './jpdb';
import { Logger } from './logger';
import {
    buildNewTabPalette,
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
import type { JPDBCard, ReaderSettings } from './types';
import type { YomitanDictionaryStore } from './yomitan';

interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    anki: AnkiConnectClient;
    jpdb: JpdbClient;
    parser: ReaderParser;
    dictionaries: YomitanDictionaryStore;
    ensureStarterDictionary: (onProgress?: (message: string) => void) => Promise<boolean>;
    onSettingsChange: () => Promise<void> | void;
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
}

const log = Logger.scope('NewTab');
const SESSION_WORD_KEY = 'jpdb-reader-newtab-current-word';
const JPDB_ALL_DECKS = 'all';
const JPDB_DECK_SAMPLE_LIMIT = 6;
const JPDB_WORDS_PER_DECK = 36;
const NEW_TAB_WORD_LIMIT = 180;

export class NewTabController {
    private allWords: JPDBCard[] = [];
    private visibleWords: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private state: NewTabUiState;
    private readonly stateChannel: ReturnType<typeof createNewTabStateChannel>;

    constructor(private readonly dependencies: NewTabControllerDependencies) {
        const saved = loadNewTabUiState();
        this.state = {
            ...saved,
            source: hasSavedNewTabUiState() ? saved.source : dependencies.getSettings().newTabSource,
        };
        this.stateChannel = createNewTabStateChannel(state => this.applyExternalState(state));
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

        const hasStudyMarkup = !!root.querySelector('[data-newtab-study]') && root.dataset.standaloneNewtab !== 'true';
        if (isNew || !hasStudyMarkup) {
            delete root.dataset.standaloneNewtab;
            root.replaceChildren(this.renderEnabledContent());
            this.syncMode(root);
        }

        if (isNew || !hasStudyMarkup || this.allWords.length === 0) await this.loadWordsInto(root, true);
        else this.applyWords(root, true);
    }

    destroy(): void {
        this.stateChannel.close();
    }

    private renderEnabledContent(): DocumentFragment {
        return fragment(
            el('div', { class: 'jpdb-reader-newtab-shell' },
                el('header', { class: 'jpdb-reader-newtab-topbar' },
                    el('a', { class: 'jpdb-reader-newtab-brand', href: SUPPORT_LINKS.docs, 'aria-label': `Open ${APP_NAME}` }, APP_PUCK),
                    el('div', { class: 'jpdb-reader-newtab-mode', role: 'group', 'aria-label': 'Study mode' },
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'word' } }, 'Word'),
                        el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' } }, 'Kanji'),
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
                    el('div', { class: 'jpdb-reader-newtab-prompt', dataset: { newtabPrompt: true }, lang: 'ja' }, 'よむ'),
                    el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                        el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                        el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-status', dataset: { newtabStatus: true } }, 'Loading...'),
                ),
                el('nav', { class: 'jpdb-reader-newtab-controls', 'aria-label': 'Study navigation' },
                    el('button', { type: 'button', dataset: { newtabAction: 'previous' }, 'aria-label': 'Previous word' }, 'Previous'),
                    el('button', { type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
                    el('button', { type: 'button', dataset: { newtabAction: 'next' }, 'aria-label': 'Next word' }, 'Next'),
                ),
            ),
        );
    }

    private bindRootEvents(root: HTMLElement): void {
        root.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            const action = target.closest<HTMLElement>('[data-newtab-action]')?.dataset.newtabAction;
            if (action === 'settings') {
                event.preventDefault();
                this.dependencies.showSettings('basics');
                return;
            }
            if (action === 'next') {
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
                this.setState({ revealAnswer: !this.state.revealAnswer }, root, { preserveWord: true });
                return;
            }
            if (action === 'mode') {
                event.preventDefault();
                const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode === 'kanji' ? 'kanji' : 'word';
                this.setState({ mode, revealAnswer: false }, root, { preserveWord: false });
                return;
            }
            const study = target.closest<HTMLElement>('[data-newtab-study]');
            if (study && !target.closest('.jpdb-reader-word')) {
                event.preventDefault();
                if (!this.state.revealAnswer) this.setState({ revealAnswer: true }, root, { preserveWord: true });
            }
        });

        root.addEventListener('keydown', event => {
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
                if (!this.state.revealAnswer) this.setState({ revealAnswer: true }, root, { preserveWord: true });
                else this.showNextWord();
            }
        });
    }

    private applyPalette(): void {
        const palette = buildNewTabPalette(this.dependencies.getSettings().accentColor);
        document.documentElement.style.setProperty('--jpdb-newtab-bg', palette.background);
        document.documentElement.style.setProperty('--jpdb-newtab-bg-text', palette.backgroundText);
        document.documentElement.style.setProperty('--jpdb-newtab-surface', palette.surface);
        document.documentElement.style.setProperty('--jpdb-newtab-surface-text', palette.surfaceText);
        document.documentElement.style.setProperty('--jpdb-newtab-accent-text', palette.accentText);
        document.documentElement.style.setProperty('--jpdb-newtab-border', palette.border);
        document.documentElement.style.setProperty('--jpdb-newtab-soft-border', palette.softBorder);
        document.documentElement.style.setProperty('--jpdb-newtab-surface-muted', palette.surfaceMuted);
        document.documentElement.style.setProperty('--jpdb-newtab-shadow', palette.shadow);
    }

    private async loadWordsInto(root: HTMLElement, preferStoredWord: boolean): Promise<void> {
        try {
            this.setStatus(root, 'Loading...');
            const result = await this.loadWords(message => this.setStatus(root, message));
            this.allWords = dedupeWords(result.cards).slice(0, NEW_TAB_WORD_LIMIT);
            this.sourceLabel = result.sourceLabel;
            this.dependencies.parser.cacheCards(this.allWords);
            if (!this.allWords.length) {
                this.renderEmpty(root, 'よむ', 'No words yet.');
                return;
            }
            this.applyWords(root, preferStoredWord);
        } catch (error) {
            log.warn('Failed to load words', error);
            this.renderEmpty(root, 'よむ', 'Could not load words.');
        }
    }

    private async loadWords(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
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
                const result = await this.loadDictionaryWords(onProgress, cards.length === 0 || source === 'dictionary');
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

    private async loadDictionaryWords(onProgress?: (message: string) => void, installIfEmpty = true): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        try {
            let summary = await this.dependencies.dictionaries.summary().catch(() => null);
            let entries = summary?.terms
                ? await this.dependencies.dictionaries.listRandomTopTerms(90, 4000, settings.dictionaryPreferences)
                : [];
            if (!entries.length && installIfEmpty) {
                onProgress?.('Downloading dictionary...');
                const installed = await this.dependencies.ensureStarterDictionary(onProgress);
                if (installed) {
                    summary = await this.dependencies.dictionaries.summary().catch(() => summary);
                    entries = await this.dependencies.dictionaries.listRandomTopTerms(90, 4000, settings.dictionaryPreferences);
                }
            }
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
        const baseWords = this.state.mode === 'kanji'
            ? this.allWords.filter(card => kanjiCharacters(card.spelling).length > 0)
            : this.allWords;
        this.visibleWords = shuffleCards(baseWords);
        if (!this.visibleWords.length) {
            this.index = 0;
            this.renderEmpty(root, 'よむ', 'No kanji words yet.');
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
        root.classList.toggle('jpdb-reader-newtab-revealed', this.state.revealAnswer);
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        const slots = this.studySlots(root);
        const state = primaryCardState(card.cardState);

        if (this.state.mode === 'kanji') this.renderKanjiPrompt(slots, card, state);
        else this.renderWordPrompt(slots, card, state);

        if (slots.count) slots.count.textContent = `${this.index + 1} / ${this.visibleWords.length}`;
        if (slots.reveal) slots.reveal.textContent = this.state.revealAnswer ? 'Hide' : 'Reveal';
        if (slots.status) slots.status.textContent = this.sourceLabel;
    }

    private studySlots(root: HTMLElement): NewTabStudySlots {
        return {
            prompt: root.querySelector<HTMLElement>('[data-newtab-prompt]'),
            answer: root.querySelector<HTMLElement>('[data-newtab-reading]'),
            meaning: root.querySelector<HTMLElement>('[data-newtab-meaning]'),
            count: root.querySelector<HTMLElement>('[data-newtab-count]'),
            status: root.querySelector<HTMLElement>('[data-newtab-status]'),
            reveal: root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]'),
        };
    }

    private renderKanjiPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        const kanji = kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '字';
        if (slots.prompt) slots.prompt.textContent = kanji;
        if (slots.answer) replaceChildrenWith(slots.answer, this.renderReaderWord(card, state));
        if (slots.meaning) slots.meaning.textContent = `${card.reading}${firstCardMeaning(card) ? ` · ${firstCardMeaning(card)}` : ''}`;
    }

    private renderWordPrompt(slots: NewTabStudySlots, card: JPDBCard, state: ReturnType<typeof primaryCardState>): void {
        if (slots.prompt) replaceChildrenWith(slots.prompt, this.renderReaderWord(card, state));
        if (slots.answer) slots.answer.textContent = card.reading && card.reading !== card.spelling ? card.reading : '';
        if (slots.meaning) slots.meaning.textContent = firstCardMeaning(card);
    }

    private renderEmpty(root: HTMLElement, prompt: string, message: string): void {
        root.classList.add('jpdb-reader-newtab-revealed');
        const slots = this.studySlots(root);
        if (slots.prompt) slots.prompt.textContent = prompt;
        if (slots.answer) slots.answer.textContent = message;
        if (slots.meaning) slots.meaning.textContent = '';
        if (slots.count) slots.count.textContent = '0 / 0';
        if (slots.status) slots.status.textContent = '';
    }

    private renderReaderWord(card: JPDBCard, state: string): HTMLSpanElement {
        const sourceClass = card.source === 'anki' ? 'anki' : 'jpdb';
        return el('span', {
            class: `jpdb-reader-word ${sourceClass}-${state}`,
            dataset: {
                vid: card.vid,
                sid: card.sid,
                sentence: card.spelling,
            },
            tabIndex: 0,
        }, card.spelling);
    }

    private syncMode(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="mode"]').forEach(button => {
            button.dataset.active = String(button.dataset.mode === this.state.mode);
        });
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
        const key = `${card.spelling}\n${card.reading}`;
        const existing = seen.get(key);
        if (!existing || sourcePriority(card) < sourcePriority(existing)) seen.set(key, card);
    }
    return [...seen.values()];
}

function sourcePriority(card: JPDBCard): number {
    if (!card.source || card.source === 'jpdb') return 0;
    if (card.source === 'anki') return 1;
    return 2;
}
