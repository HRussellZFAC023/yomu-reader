import type { AnkiConnectClient } from './anki';
import { APP_NAME } from './constants';
import { escapeHtml, setInnerHtml } from './dom';
import type { JpdbClient } from './jpdb';
import { Logger } from './logger';
import {
    buildNewTabPalette,
    firstCardMeaning,
    isYomuNewTabUrl,
    renderDisabledNewTabMarkup,
    shuffleCards,
    uniqueStrings,
} from './new-tab';
import type { ReaderParser } from './reader-parser';
import type { JPDBCard, ReaderSettings } from './types';

interface NewTabControllerDependencies {
    getSettings: () => ReaderSettings;
    anki: AnkiConnectClient;
    jpdb: JpdbClient;
    parser: ReaderParser;
    showSettings: (tab?: string) => void;
    dismiss: (options?: { suppressHoverTarget?: boolean }) => void;
}

const log = Logger.scope('NewTab');

export class NewTabController {
    private cards: JPDBCard[] = [];
    private index = 0;
    private sourceLabel = '';

    constructor(private readonly dependencies: NewTabControllerDependencies) {}

    isCurrentPage(): boolean {
        return isYomuNewTabUrl(location.href);
    }

    async renderPage(): Promise<void> {
        const settings = this.dependencies.getSettings();
        document.title = `${APP_NAME} New Tab`;
        document.documentElement.classList.add('jpdb-reader-newtab-document');
        this.applyPalette();

        const root = document.createElement('main');
        root.className = 'jpdb-reader-newtab';
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = settings.newTabEnabled ? this.renderEnabledMarkup() : renderDisabledNewTabMarkup();

        document.body.replaceChildren(root);
        this.bindRootEvents(root);

        if (settings.newTabEnabled) await this.loadCardsInto(root);
    }

    private renderEnabledMarkup(): string {
        return `
            <div class="jpdb-reader-newtab-shell">
                <div class="jpdb-reader-newtab-topbar">
                    <div class="jpdb-reader-newtab-brand">${APP_NAME}</div>
                    <div class="jpdb-reader-newtab-actions">
                        <button class="jpdb-reader-newtab-button" type="button" data-newtab-action="settings">Settings</button>
                    </div>
                </div>
                <section class="jpdb-reader-newtab-stage" aria-live="polite">
                    <div class="jpdb-reader-newtab-card" data-newtab-card tabindex="0">
                        <div class="jpdb-reader-newtab-word" data-newtab-expression lang="ja">読</div>
                        <div class="jpdb-reader-newtab-reading" data-newtab-reading lang="ja"></div>
                        <div class="jpdb-reader-newtab-meaning" data-newtab-meaning></div>
                    </div>
                    <div class="jpdb-reader-newtab-footer">
                        <button class="jpdb-reader-newtab-button primary" type="button" data-newtab-action="next">Next</button>
                        <div class="jpdb-reader-newtab-status" data-newtab-status>Loading words...</div>
                    </div>
                </section>
            </div>
        `;
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
                this.showNextCard();
                return;
            }
            const card = target.closest<HTMLElement>('[data-newtab-card]');
            if (card && !target.closest('.jpdb-reader-word')) this.showNextCard();
        });
        root.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowRight') return;
            const target = event.target as HTMLElement | null;
            if (!target?.closest('[data-newtab-card]')) return;
            event.preventDefault();
            this.showNextCard();
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
        document.documentElement.style.setProperty('--jpdb-newtab-shadow', palette.shadow);
    }

    private async loadCardsInto(root: HTMLElement): Promise<void> {
        const status = root.querySelector<HTMLElement>('[data-newtab-status]');
        const setStatus = (message: string) => {
            if (status) status.textContent = message;
        };

        try {
            setStatus('Loading words...');
            const result = await this.loadCards();
            this.cards = shuffleCards(result.cards);
            this.index = 0;
            this.sourceLabel = result.sourceLabel;
            this.dependencies.parser.cacheCards(this.cards);
            if (!this.cards.length) {
                setStatus('No words found. Check the new tab source in settings.');
                this.renderEmptyCard(root);
                return;
            }
            this.renderCard(root, this.cards[0]);
            setStatus(result.sourceLabel);
        } catch (error) {
            log.warn('Failed to load words', error);
            setStatus(error instanceof Error ? error.message : 'Could not load words.');
            this.renderEmptyCard(root);
        }
    }

    private async loadCards(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> {
        const settings = this.dependencies.getSettings();
        const sourceOrder = settings.newTabSource === 'auto'
            ? ['anki', 'jpdb'] as const
            : [settings.newTabSource] as const;
        for (const source of sourceOrder) {
            if (source === 'anki') {
                const cards = await this.dependencies.anki.listNewTabCards(80);
                if (cards.length) return { cards, sourceLabel: `Anki: ${settings.ankiDeck}` };
            }
            if (source === 'jpdb') {
                const result = await this.loadJpdbCards();
                if (result.cards.length) return result;
            }
        }
        return { cards: [], sourceLabel: 'No source' };
    }

    private async loadJpdbCards(): Promise<{ cards: JPDBCard[]; sourceLabel: string }> {
        const settings = this.dependencies.getSettings();
        if (!settings.apiKey.trim()) return { cards: [], sourceLabel: 'JPDB API key missing' };
        const deckIds = uniqueStrings([
            settings.newTabJpdbDeck,
            settings.neverForgetDeck,
            'never-forget',
        ]);
        for (const deckId of deckIds) {
            try {
                const cards = await this.dependencies.jpdb.listDeckCards(deckId, 80);
                if (cards.length) return { cards, sourceLabel: `JPDB: ${deckId}` };
            } catch (error) {
                log.debug('JPDB deck load failed; trying next deck', { deckId }, error);
            }
        }

        const decks = await this.dependencies.jpdb.listDecks().catch(() => []);
        for (const deck of decks.slice(0, 3)) {
            try {
                const cards = await this.dependencies.jpdb.listDeckCards(deck.id, 80);
                if (cards.length) return { cards, sourceLabel: `JPDB: ${deck.name}` };
            } catch (error) {
                log.debug('JPDB fallback deck failed', { deck: deck.id }, error);
            }
        }
        return { cards: [], sourceLabel: 'JPDB: no words' };
    }

    private showNextCard(): void {
        const root = document.querySelector<HTMLElement>('[data-jpdb-reader-root].jpdb-reader-newtab');
        if (!root || !this.cards.length) return;
        this.dependencies.dismiss({ suppressHoverTarget: false });
        this.index = (this.index + 1) % this.cards.length;
        this.renderCard(root, this.cards[this.index]);
        const status = root.querySelector<HTMLElement>('[data-newtab-status]');
        if (status) status.textContent = this.sourceLabel || `${this.index + 1}/${this.cards.length}`;
    }

    private renderCard(root: HTMLElement, card: JPDBCard): void {
        const expression = root.querySelector<HTMLElement>('[data-newtab-expression]');
        const reading = root.querySelector<HTMLElement>('[data-newtab-reading]');
        const meaning = root.querySelector<HTMLElement>('[data-newtab-meaning]');
        const state = card.cardState[0] ?? 'not-in-deck';
        if (expression) {
            setInnerHtml(expression, `<span class="jpdb-reader-word jpdb-${escapeHtml(state)}" data-vid="${card.vid}" data-sid="${card.sid}" data-sentence="${escapeHtml(card.spelling)}" tabindex="0">${escapeHtml(card.spelling)}</span>`);
        }
        if (reading) reading.textContent = card.reading && card.reading !== card.spelling ? card.reading : '';
        if (meaning) meaning.textContent = firstCardMeaning(card);
    }

    private renderEmptyCard(root: HTMLElement): void {
        const expression = root.querySelector<HTMLElement>('[data-newtab-expression]');
        const reading = root.querySelector<HTMLElement>('[data-newtab-reading]');
        const meaning = root.querySelector<HTMLElement>('[data-newtab-meaning]');
        if (expression) expression.textContent = 'よむ';
        if (reading) reading.textContent = '';
        if (meaning) meaning.textContent = 'Open settings to choose Anki or JPDB words.';
    }
}
