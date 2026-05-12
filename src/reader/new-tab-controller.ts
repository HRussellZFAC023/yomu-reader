import type { AnkiConnectClient } from './anki';
import { primaryCardState } from './card-state';
import { APP_NAME, APP_PUCK, SUPPORT_LINKS } from './constants';
import { el, fragment, replaceChildrenWith } from './dom-builder';
import type { JpdbClient } from './jpdb';
import { Logger } from './logger';
import {
    NEW_TAB_FILTERS,
    NEW_TAB_SORT_OPTIONS,
    NEW_TAB_SOURCE_OPTIONS,
    buildNewTabPalette,
    cardKey,
    cardStateLabel,
    createNewTabStateChannel,
    filterNewTabCards,
    firstCardMeaning,
    hasSavedNewTabUiState,
    isYomuNewTabUrl,
    kanjiCharacters,
    loadNewTabUiState,
    saveNewTabUiState,
    shuffleCards,
    sortNewTabCards,
    uniqueStrings,
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
    sourceNotes: string[];
}

const log = Logger.scope('NewTab');
const SESSION_CARD_KEY = 'jpdb-reader-newtab-current-card';
const JPDB_ALL_DECKS = 'all';
const JPDB_DECK_SAMPLE_LIMIT = 6;
const JPDB_CARDS_PER_DECK = 36;
const NEW_TAB_CARD_LIMIT = 180;

export class NewTabController {
    private allCards: JPDBCard[] = [];
    private visibleCards: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';
    private sourceNotes: string[] = [];
    private query = '';
    private state: NewTabUiState;
    private readonly stateChannel: ReturnType<typeof createNewTabStateChannel>;

    constructor(private readonly dependencies: NewTabControllerDependencies) {
        const saved = loadNewTabUiState();
        this.state = { ...saved, source: hasSavedNewTabUiState() ? saved.source : dependencies.getSettings().newTabSource };
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

        const hasReaderMarkup = !!root.querySelector('[data-newtab-card]') && root.dataset.standaloneNewtab !== 'true';
        if (isNew || !hasReaderMarkup) {
            delete root.dataset.standaloneNewtab;
            root.replaceChildren(this.renderEnabledContent());
            this.syncControls(root);
        }

        if (isNew || !hasReaderMarkup || this.allCards.length === 0) {
            await this.loadCardsInto(root, true);
        } else {
            this.applyCards(root, true);
        }
    }

    destroy(): void {
        this.stateChannel.close();
    }

    private renderEnabledContent(): DocumentFragment {
        return fragment(
            el('div', { class: 'jpdb-reader-newtab-shell' },
                el('header', { class: 'jpdb-reader-newtab-topbar' },
                    el('a', { class: 'jpdb-reader-newtab-brand', href: SUPPORT_LINKS.docs, 'aria-label': `Open ${APP_NAME} home page` },
                        el('span', { class: 'jpdb-reader-newtab-brand-mark' }, APP_PUCK),
                        el('span', { class: 'jpdb-reader-newtab-brand-text' },
                            el('strong', null, APP_NAME),
                            el('span', null, 'new tab'),
                        ),
                    ),
                    el('div', { class: 'jpdb-reader-newtab-health', dataset: { newtabSummary: true } }, 'Loading study sources...'),
                    el('button', { class: 'jpdb-reader-newtab-icon-button', type: 'button', dataset: { newtabAction: 'settings' } }, 'Settings'),
                ),
                el('div', { class: 'jpdb-reader-newtab-workspace' },
                    this.renderStage(),
                    this.renderSidePanel(),
                ),
            ),
            el('button', {
                class: 'jpdb-reader-newtab-puck',
                type: 'button',
                dataset: { newtabAction: 'settings' },
                'aria-label': `Open ${APP_NAME} settings`,
            }, APP_PUCK),
        );
    }

    private renderStage(): HTMLElement {
        return el('section', { class: 'jpdb-reader-newtab-stage', 'aria-live': 'polite' },
            el('div', { class: 'jpdb-reader-newtab-card', dataset: { newtabCard: true }, tabIndex: 0 },
                el('div', { class: 'jpdb-reader-newtab-card-head' },
                    el('span', { dataset: { newtabCardKicker: true } }, 'Word'),
                    el('span', { dataset: { newtabCardCount: true } }, '0 / 0'),
                ),
                el('div', { class: 'jpdb-reader-newtab-visual', dataset: { newtabVisual: true }, 'aria-hidden': 'true' }, '読'),
                el('div', { class: 'jpdb-reader-newtab-word', dataset: { newtabExpression: true }, lang: 'ja' }, '読'),
                el('div', { class: 'jpdb-reader-newtab-answer', dataset: { newtabAnswer: true } },
                    el('div', { class: 'jpdb-reader-newtab-reading', dataset: { newtabReading: true }, lang: 'ja' }),
                    el('div', { class: 'jpdb-reader-newtab-meaning', dataset: { newtabMeaning: true } }),
                ),
                el('div', { class: 'jpdb-reader-newtab-concealed', dataset: { newtabConcealed: true } }, 'Recall it, then reveal.'),
                el('div', { class: 'jpdb-reader-newtab-meta', dataset: { newtabMeta: true } }),
            ),
            el('div', { class: 'jpdb-reader-newtab-controls' },
                el('button', { class: 'jpdb-reader-newtab-button', type: 'button', dataset: { newtabAction: 'reveal' } }, 'Reveal'),
                el('button', { class: 'jpdb-reader-newtab-button primary', type: 'button', dataset: { newtabAction: 'next' } }, 'Next'),
                el('div', { class: 'jpdb-reader-newtab-status', dataset: { newtabStatus: true } }, 'Loading words...'),
            ),
        );
    }

    private renderSidePanel(): HTMLElement {
        return el('aside', { class: 'jpdb-reader-newtab-side', 'aria-label': 'Study controls' },
            el('section', { class: 'jpdb-reader-newtab-panel' },
                el('div', { class: 'jpdb-reader-newtab-panel-head' },
                    el('span', null, 'Mode'),
                    el('button', { type: 'button', dataset: { newtabAction: 'reload' } }, 'Refresh sources'),
                ),
                el('div', { class: 'jpdb-reader-newtab-segmented', role: 'group', 'aria-label': 'Study mode' },
                    el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'word' } }, 'Word'),
                    el('button', { type: 'button', dataset: { newtabAction: 'mode', mode: 'kanji' } }, 'Kanji'),
                ),
                el('div', { class: 'jpdb-reader-newtab-form-grid' },
                    el('label', null, 'Source', this.renderSelect('newtabSource', NEW_TAB_SOURCE_OPTIONS)),
                    el('label', null, 'Sort', this.renderSelect('newtabSort', NEW_TAB_SORT_OPTIONS)),
                ),
                el('label', { class: 'jpdb-reader-newtab-search' }, 'Search',
                    el('input', {
                        dataset: { newtabSearch: true },
                        type: 'search',
                        'aria-label': 'Search words',
                        placeholder: 'Search spelling, reading, or meaning...',
                        autocomplete: 'off',
                    }),
                ),
            ),
            el('section', { class: 'jpdb-reader-newtab-panel' },
                el('div', { class: 'jpdb-reader-newtab-panel-head' },
                    el('span', null, 'Show only'),
                    el('span', { dataset: { newtabFilterCount: true } }, '0 words'),
                ),
                el('div', { class: 'jpdb-reader-newtab-filter-grid', dataset: { newtabFilters: true } },
                    NEW_TAB_FILTERS.map(filter => el('button', { type: 'button', dataset: { newtabAction: 'filter', filter: filter.value } }, filter.label)),
                ),
            ),
            el('section', { class: 'jpdb-reader-newtab-panel jpdb-reader-newtab-queue-panel' },
                el('div', { class: 'jpdb-reader-newtab-panel-head' },
                    el('span', null, '2D review tray'),
                    el('span', { dataset: { newtabTrayNote: true } }, 'Pick any word'),
                ),
                el('div', { class: 'jpdb-reader-newtab-list', dataset: { newtabList: true } }),
            ),
            el('section', { class: 'jpdb-reader-newtab-source-note', dataset: { newtabSourceNote: true } }),
        );
    }

    private renderSelect(datasetName: string, options: readonly { value: string; label: string }[]): HTMLSelectElement {
        return el('select', { dataset: { [datasetName]: true } },
            options.map(option => el('option', { value: option.value }, option.label)),
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
            if (action === 'reload') {
                event.preventDefault();
                void this.loadCardsInto(root, false);
                return;
            }
            if (action === 'next') {
                event.preventDefault();
                this.showNextCard();
                return;
            }
            if (action === 'reveal') {
                event.preventDefault();
                this.setState({ revealAnswer: !this.state.revealAnswer }, root, { preserveCard: true });
                return;
            }
            if (action === 'mode') {
                event.preventDefault();
                const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode === 'kanji' ? 'kanji' : 'word';
                this.setState({ mode, revealAnswer: false }, root, { preserveCard: false });
                return;
            }
            if (action === 'filter') {
                event.preventDefault();
                const filter = target.closest<HTMLElement>('[data-filter]')?.dataset.filter;
                if (NEW_TAB_FILTERS.some(item => item.value === filter)) {
                    this.setState({ filter: filter as NewTabUiState['filter'], revealAnswer: false }, root, { preserveCard: false });
                }
                return;
            }
            const listItem = target.closest<HTMLElement>('[data-newtab-card-key]');
            if (listItem) {
                event.preventDefault();
                const nextIndex = this.visibleCards.findIndex(card => cardKey(card) === listItem.dataset.newtabCardKey);
                if (nextIndex >= 0) {
                    this.index = nextIndex;
                    this.state.revealAnswer = false;
                    this.persistState();
                    this.renderCard(root, this.visibleCards[this.index]);
                }
                return;
            }
            const card = target.closest<HTMLElement>('[data-newtab-card]');
            if (card && !target.closest('.jpdb-reader-word')) {
                event.preventDefault();
                if (!this.state.revealAnswer) this.setState({ revealAnswer: true }, root, { preserveCard: true });
                else this.showNextCard();
            }
        });

        root.addEventListener('change', event => {
            const target = event.target as HTMLElement;
            if (target.matches('[data-newtab-source]')) {
                const value = (target as HTMLSelectElement).value as NewTabUiState['source'];
                this.setState({ source: value, revealAnswer: false }, root, { preserveCard: false, reload: true });
            }
            if (target.matches('[data-newtab-sort]')) {
                const value = (target as HTMLSelectElement).value as NewTabUiState['sort'];
                this.setState({ sort: value, revealAnswer: false }, root, { preserveCard: false });
            }
        });

        root.addEventListener('input', event => {
            const target = event.target as HTMLElement;
            if (!target.matches('[data-newtab-search]')) return;
            this.query = (target as HTMLInputElement).value;
            this.applyCards(root, false);
        });

        root.addEventListener('keydown', event => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, select, textarea')) return;
            if (event.key === 'ArrowRight' || event.key === 'n') {
                event.preventDefault();
                this.showNextCard();
                return;
            }
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                if (!this.state.revealAnswer) this.setState({ revealAnswer: true }, root, { preserveCard: true });
                else this.showNextCard();
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

    private async loadCardsInto(root: HTMLElement, preferStoredCard: boolean): Promise<void> {
        const setStatus = (message: string) => this.setStatus(root, message);

        try {
            this.syncControls(root);
            setStatus('Loading study sources...');
            this.renderSourceNote(root, ['Checking Anki, JPDB, and local dictionaries in that order.']);
            const result = await this.loadCards(setStatus);
            this.allCards = dedupeCards(result.cards).slice(0, NEW_TAB_CARD_LIMIT);
            this.sourceLabel = result.sourceLabel;
            this.sourceNotes = result.sourceNotes;
            this.dependencies.parser.cacheCards(this.allCards);
            if (!this.allCards.length) {
                setStatus('No study words found yet.');
                this.renderEmptyCard(root, 'No study words yet', 'Connect JPDB or Anki, or let the starter dictionary finish downloading.');
                this.renderSourceNote(root, this.sourceNotes);
                return;
            }
            this.applyCards(root, preferStoredCard);
            setStatus(this.sourceLabel);
        } catch (error) {
            log.warn('Failed to load words', error);
            this.setStatus(root, error instanceof Error ? error.message : 'Could not load words.');
            this.renderEmptyCard(root, 'Could not load words', 'The new tab page will keep working once a source responds.');
        }
    }

    private async loadCards(onProgress?: (message: string) => void): Promise<NewTabLoadResult> {
        const source = this.state.source;
        const sourceOrder = source === 'auto'
            ? ['anki', 'jpdb', 'dictionary'] as const
            : [source] as const;
        const notes: string[] = [];
        const labels: string[] = [];
        const cards: JPDBCard[] = [];

        for (const item of sourceOrder) {
            if (item === 'anki') {
                const result = await this.loadAnkiCards();
                notes.push(...result.sourceNotes);
                if (result.cards.length) {
                    cards.push(...result.cards);
                    labels.push(result.sourceLabel);
                }
            }
            if (item === 'jpdb') {
                const result = await this.loadJpdbCards();
                notes.push(...result.sourceNotes);
                if (result.cards.length) {
                    cards.push(...result.cards);
                    labels.push(result.sourceLabel);
                }
            }
            if (item === 'dictionary') {
                const result = await this.loadDictionaryCards(onProgress, cards.length === 0 || source === 'dictionary');
                notes.push(...result.sourceNotes);
                if (result.cards.length) {
                    cards.push(...result.cards);
                    labels.push(result.sourceLabel);
                }
            }
        }

        return {
            cards,
            sourceLabel: labels.length ? labels.join(' + ') : 'No source',
            sourceNotes: notes.length ? notes : ['No source returned study words yet.'],
        };
    }

    private async loadAnkiCards(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.ankiEnabled) {
            return { cards: [], sourceLabel: 'Anki not connected', sourceNotes: ['Anki can be connected later from Settings.'] };
        }
        const cards = await this.dependencies.anki.listNewTabCards(80).catch(error => {
            log.debug('Anki new tab source unavailable', error);
            return [];
        });
        return {
            cards,
            sourceLabel: cards.length ? `Anki: ${settings.ankiDeck}` : 'Anki: no cards',
            sourceNotes: [cards.length ? `Loaded ${cards.length} Anki cards from ${settings.ankiDeck}.` : 'Anki is enabled, but no cards were available.'],
        };
    }

    private async loadDictionaryCards(onProgress?: (message: string) => void, installIfEmpty = true): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        const notes: string[] = [];
        try {
            let summary = await this.dependencies.dictionaries.summary().catch(() => null);
            let entries = summary?.terms
                ? await this.dependencies.dictionaries.listRandomTopTerms(90, 4000, settings.dictionaryPreferences)
                : [];
            if (!entries.length && installIfEmpty) {
                onProgress?.('Downloading JMdict starter dictionary...');
                notes.push('No local dictionary words were ready, so Yomu started the JMdict starter dictionary download.');
                const installed = await this.dependencies.ensureStarterDictionary(message => {
                    notes.push(message);
                    onProgress?.(message);
                });
                if (installed) {
                    summary = await this.dependencies.dictionaries.summary().catch(() => summary);
                    entries = await this.dependencies.dictionaries.listRandomTopTerms(90, 4000, settings.dictionaryPreferences);
                }
            }
            const cards = entries.map(entry => this.dependencies.parser.localCardFromEntry(entry));
            const dictionaryNames = summary?.dictionaries.map(dictionary => dictionary.title).slice(0, 3).join(', ');
            return {
                cards,
                sourceLabel: cards.length ? 'Dictionaries' : 'Dictionaries: no words',
                sourceNotes: [
                    cards.length
                        ? `Loaded ${cards.length} local dictionary words${dictionaryNames ? ` from ${dictionaryNames}` : ''}.`
                        : 'No local dictionary words are installed yet.',
                    ...notes.slice(-2),
                ],
            };
        } catch (error) {
            log.debug('Dictionary card load failed', error);
            return { cards: [], sourceLabel: 'Dictionary: error', sourceNotes: ['Local dictionary lookup failed.'] };
        }
    }

    private async loadJpdbCards(): Promise<NewTabLoadResult> {
        const settings = this.dependencies.getSettings();
        if (!settings.apiKey.trim()) {
            return { cards: [], sourceLabel: 'JPDB not connected', sourceNotes: ['JPDB can be connected later from Settings.'] };
        }

        const selectedDeck = settings.newTabJpdbDeck.trim() || JPDB_ALL_DECKS;
        if (selectedDeck !== JPDB_ALL_DECKS) {
            try {
                const cards = await this.dependencies.jpdb.listDeckCards(selectedDeck, 90);
                return {
                    cards,
                    sourceLabel: cards.length ? `JPDB: ${selectedDeck}` : 'JPDB: no words',
                    sourceNotes: [cards.length ? `Loaded random words from JPDB deck ${selectedDeck}.` : `JPDB deck ${selectedDeck} did not return words.`],
                };
            } catch (error) {
                log.debug('JPDB selected deck load failed', { deckId: selectedDeck }, error);
            }
        }

        const decks = await this.dependencies.jpdb.listDecks().catch(() => []);
        const eligibleDecks = decks
            .filter(deck => !/(never\s*-?\s*forget|blacklist|suspend)/i.test(`${deck.id} ${deck.name}`))
            .slice(0, JPDB_DECK_SAMPLE_LIMIT);
        const cards: JPDBCard[] = [];
        const loadedDecks: string[] = [];
        for (const deck of eligibleDecks) {
            try {
                const deckCards = await this.dependencies.jpdb.listDeckCards(deck.id, JPDB_CARDS_PER_DECK);
                if (deckCards.length) {
                    cards.push(...deckCards);
                    loadedDecks.push(deck.name);
                }
            } catch (error) {
                log.debug('JPDB all-decks sample failed', { deck: deck.id }, error);
            }
        }

        return {
            cards,
            sourceLabel: cards.length ? `JPDB: ${loadedDecks.length} decks` : 'JPDB: no words',
            sourceNotes: [
                cards.length
                    ? `Sampled ${cards.length} JPDB words across ${loadedDecks.length} user decks, excluding never-forget style decks by default.`
                    : 'JPDB did not return deck words yet.',
            ],
        };
    }

    private setState(patch: Partial<NewTabUiState>, root: HTMLElement, options: { preserveCard: boolean; reload?: boolean }): void {
        this.state = { ...this.state, ...patch };
        this.persistState();
        this.syncControls(root);
        if (options.reload) {
            void this.loadCardsInto(root, options.preserveCard);
            return;
        }
        this.applyCards(root, options.preserveCard);
    }

    private applyExternalState(state: NewTabUiState): void {
        if (JSON.stringify(this.state) === JSON.stringify(state)) return;
        this.state = state;
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root) return;
        this.syncControls(root);
        this.applyCards(root, true);
    }

    private persistState(): void {
        saveNewTabUiState(this.state);
        this.stateChannel.publish(this.state);
    }

    private applyCards(root: HTMLElement, preferStoredCard: boolean): void {
        this.syncControls(root);
        const baseCards = this.state.mode === 'kanji'
            ? this.allCards.filter(card => kanjiCharacters(card.spelling).length > 0)
            : this.allCards;
        const filtered = filterNewTabCards(baseCards, this.state.filter, this.query);
        this.visibleCards = this.state.sort === 'random'
            ? shuffleCards(filtered)
            : sortNewTabCards(filtered, this.state.sort);
        const count = root.querySelector<HTMLElement>('[data-newtab-filter-count]');
        if (count) count.textContent = `${this.visibleCards.length.toLocaleString()} word${this.visibleCards.length === 1 ? '' : 's'}`;
        if (!this.visibleCards.length) {
            this.index = 0;
            this.renderEmptyCard(root, 'No matching words', 'Try All, Dictionary, or another source.');
            return;
        }
        this.index = this.resolveInitialIndex(preferStoredCard);
        this.renderCard(root, this.visibleCards[this.index]);
    }

    private resolveInitialIndex(preferStoredCard: boolean): number {
        if (preferStoredCard) {
            const stored = this.readStoredCardKey();
            if (stored?.signature === this.currentSessionSignature()) {
                const index = this.visibleCards.findIndex(card => cardKey(card) === stored.key);
                if (index >= 0) return index;
            }
        }
        return 0;
    }

    private showNextCard(): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !this.visibleCards.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.index = (this.index + 1) % this.visibleCards.length;
        this.state.revealAnswer = false;
        this.persistState();
        this.renderCard(root, this.visibleCards[this.index]);
    }

    private renderCard(root: HTMLElement, card: JPDBCard): void {
        this.writeStoredCardKey(card);
        root.classList.toggle('jpdb-reader-newtab-revealed', this.state.revealAnswer);
        root.classList.toggle('jpdb-reader-newtab-kanji-mode', this.state.mode === 'kanji');
        const expression = root.querySelector<HTMLElement>('[data-newtab-expression]');
        const reading = root.querySelector<HTMLElement>('[data-newtab-reading]');
        const meaning = root.querySelector<HTMLElement>('[data-newtab-meaning]');
        const visual = root.querySelector<HTMLElement>('[data-newtab-visual]');
        const concealed = root.querySelector<HTMLElement>('[data-newtab-concealed]');
        const meta = root.querySelector<HTMLElement>('[data-newtab-meta]');
        const kicker = root.querySelector<HTMLElement>('[data-newtab-card-kicker]');
        const count = root.querySelector<HTMLElement>('[data-newtab-card-count]');
        const reveal = root.querySelector<HTMLButtonElement>('[data-newtab-action="reveal"]');
        const state = primaryCardState(card.cardState);

        if (this.state.mode === 'kanji') {
            const kanji = kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '字';
            if (kicker) kicker.textContent = 'Kanji recall';
            if (expression) expression.textContent = kanji;
            if (visual) visual.textContent = kanji;
            if (reading) replaceChildrenWith(reading, this.renderReaderWord(card, state));
            if (meaning) meaning.textContent = `${card.reading}${firstCardMeaning(card) ? ` · ${firstCardMeaning(card)}` : ''}`;
            if (concealed) concealed.textContent = 'Which word uses this kanji?';
        } else {
            if (kicker) kicker.textContent = 'Word recall';
            if (expression) replaceChildrenWith(expression, this.renderReaderWord(card, state));
            if (visual) visual.textContent = kanjiCharacters(card.spelling)[0] ?? card.spelling[0] ?? '読';
            if (reading) reading.textContent = card.reading && card.reading !== card.spelling ? card.reading : 'Reading hidden';
            if (meaning) meaning.textContent = firstCardMeaning(card) || 'Open the word popup for local dictionary details.';
            if (concealed) concealed.textContent = 'Reading and meaning are hidden until reveal.';
        }

        if (meta) {
            const frequency = card.frequencyRank ? `Top ${card.frequencyRank.toLocaleString()}` : 'No frequency';
            replaceChildrenWith(meta,
                el('span', null, cardStateLabel(card)),
                el('span', null, sourceLabel(card)),
                el('span', null, frequency),
            );
        }
        if (count) count.textContent = `${this.index + 1} / ${this.visibleCards.length}`;
        if (reveal) reveal.textContent = this.state.revealAnswer ? 'Hide answer' : 'Reveal';
        this.setStatus(root, this.sourceLabel || `${this.index + 1}/${this.visibleCards.length}`);
        this.renderList(root, card);
        this.renderSummary(root);
        this.renderSourceNote(root, this.sourceNotes);
    }

    private renderList(root: HTMLElement, activeCard: JPDBCard): void {
        const list = root.querySelector<HTMLElement>('[data-newtab-list]');
        if (!list) return;
        const activeKey = cardKey(activeCard);
        const items = this.visibleCards.slice(0, 18);
        replaceChildrenWith(list, items.map(card => {
            const key = cardKey(card);
            const active = key === activeKey;
            return el('button', {
                class: `jpdb-reader-newtab-list-item${active ? ' active' : ''}`,
                type: 'button',
                dataset: { newtabCardKey: key },
            },
                el('span', { lang: 'ja' }, card.spelling),
                el('small', null, cardStateLabel(card)),
            );
        }));
    }

    private renderSummary(root: HTMLElement): void {
        const summary = root.querySelector<HTMLElement>('[data-newtab-summary]');
        if (!summary) return;
        const counts = new Map<string, number>();
        for (const card of this.allCards) counts.set(cardStateLabel(card), (counts.get(cardStateLabel(card)) ?? 0) + 1);
        const topCounts = [...counts.entries()].slice(0, 4).map(([label, count]) => `${label} ${count}`).join(' · ');
        summary.textContent = topCounts || 'Ready';
    }

    private renderSourceNote(root: HTMLElement, notes: string[]): void {
        const note = root.querySelector<HTMLElement>('[data-newtab-source-note]');
        if (!note) return;
        replaceChildrenWith(note, notes.filter(Boolean).slice(0, 4).map(item => el('p', null, item)));
    }

    private renderEmptyCard(root: HTMLElement, title: string, message: string): void {
        root.classList.remove('jpdb-reader-newtab-revealed');
        const expression = root.querySelector<HTMLElement>('[data-newtab-expression]');
        const reading = root.querySelector<HTMLElement>('[data-newtab-reading]');
        const meaning = root.querySelector<HTMLElement>('[data-newtab-meaning]');
        const visual = root.querySelector<HTMLElement>('[data-newtab-visual]');
        const concealed = root.querySelector<HTMLElement>('[data-newtab-concealed]');
        const meta = root.querySelector<HTMLElement>('[data-newtab-meta]');
        const list = root.querySelector<HTMLElement>('[data-newtab-list]');
        if (expression) expression.textContent = 'よむ';
        if (reading) reading.textContent = title;
        if (meaning) meaning.textContent = message;
        if (visual) visual.textContent = 'よ';
        if (concealed) concealed.textContent = message;
        if (meta) replaceChildrenWith(meta,
            el('span', null, 'Dictionary fallback'),
            el('span', null, 'JPDB optional'),
            el('span', null, 'Anki optional'),
        );
        if (list) list.replaceChildren();
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

    private syncControls(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="mode"]').forEach(button => {
            button.dataset.active = String(button.dataset.mode === this.state.mode);
        });
        root.querySelectorAll<HTMLButtonElement>('[data-newtab-action="filter"]').forEach(button => {
            button.dataset.active = String(button.dataset.filter === this.state.filter);
        });
        const source = root.querySelector<HTMLSelectElement>('[data-newtab-source]');
        if (source) source.value = this.state.source;
        const sort = root.querySelector<HTMLSelectElement>('[data-newtab-sort]');
        if (sort) sort.value = this.state.sort;
    }

    private setStatus(root: HTMLElement, message: string): void {
        const status = root.querySelector<HTMLElement>('[data-newtab-status]');
        if (status) status.textContent = message;
    }

    private currentSessionSignature(): string {
        return [this.state.source, this.state.sort, this.state.filter, this.state.mode, this.query.trim(), this.sourceLabel].join('|');
    }

    private readStoredCardKey(): { signature: string; key: string } | null {
        try {
            const raw = sessionStorage.getItem(SESSION_CARD_KEY);
            if (!raw) return null;
            const value = JSON.parse(raw) as Partial<{ signature: string; key: string }>;
            return typeof value.signature === 'string' && typeof value.key === 'string' ? { signature: value.signature, key: value.key } : null;
        } catch {
            return null;
        }
    }

    private writeStoredCardKey(card: JPDBCard): void {
        try {
            sessionStorage.setItem(SESSION_CARD_KEY, JSON.stringify({
                signature: this.currentSessionSignature(),
                key: cardKey(card),
            }));
        } catch {
            // Session storage is a convenience for refresh stability; ignore blocked storage.
        }
    }
}

function dedupeCards(cards: JPDBCard[]): JPDBCard[] {
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

function sourceLabel(card: JPDBCard): string {
    if (card.source === 'local') return 'Dictionary';
    if (card.source === 'anki') return 'Anki';
    return 'JPDB';
}
