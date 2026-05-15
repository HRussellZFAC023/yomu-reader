import { AnkiConnectClient, type AnkiLookupResult } from './anki';
import { copyText } from './browser-ui';
import { normalizeCardStates } from './card-state';
import { JpdbClient } from './jpdb';
import { handleStudyGrammarAction, renderStudyToolResult } from './study-render';
import { uiText } from './i18n';
import type { MiningContext } from './mining-context';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';
import { YomitanDictionaryStore } from './yomitan';
import type { GrammarHint } from './study-tools';

interface ShowCardOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: 'reset' | 'preserve' | 'push-current';
    preservePosition?: boolean;
}

interface CardActionControllerOptions {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    anki: AnkiConnectClient;
    dictionaries: YomitanDictionaryStore;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    resolveMiningContext: (card: JPDBCard, sentence?: string) => Promise<MiningContext>;
    showCard: (card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: ShowCardOptions) => Promise<void>;
    getActivePopoverAnchor: () => HTMLElement | undefined;
    getActivePopoverMode: () => 'modal' | 'hover' | undefined;
    showSettings: (panel?: string) => void;
    playAudio: (card: JPDBCard) => Promise<void>;
    playSentenceAudio: (sentence?: string) => Promise<void>;
    detectGrammarHints: (sentence: string) => Promise<GrammarHint[]>;
    parsePopoverJapanese: (popover: HTMLElement) => void | Promise<void>;
    toast: (message: string) => void;
}

type StudyActionHandler = () => boolean | Promise<boolean>;
type MiningActionHandler = () => Promise<void>;
type JpdbDeckState = 'never-forget' | 'blacklisted';

function assertReviewableJpdbCardState(states: string[]): void {
    if (states.includes('blacklisted')) throw new Error('This word is blacklisted. Unlist it before reviewing.');
    if (states.includes('never-forget')) throw new Error('This word is marked never forget. Remove never-forget before reviewing.');
}

export class CardActionController {
    constructor(private options: CardActionControllerOptions) {}

    async perform(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<boolean> {
        const studyAction = await this.performStudyAction(action, button, sentence);
        if (studyAction !== undefined) return studyAction;

        const readerAction = await this.performReaderAction(action, card);
        if (readerAction !== undefined) return readerAction;

        const miningAction = await this.performMiningAction(action, button, card, sentence);
        if (miningAction !== undefined) return miningAction;

        return Boolean(action);
    }

    private async performStudyAction(action: string | undefined, button: HTMLButtonElement, sentence?: string): Promise<boolean | undefined> {
        if (!action) return undefined;
        return this.studyActionHandler(action, button, sentence)?.();
    }

    private studyActionHandler(action: string, button: HTMLButtonElement, sentence?: string): StudyActionHandler | undefined {
        const handlers: Record<string, StudyActionHandler> = {
            'study-grammar-toggle-known': () => this.performStudyGrammarToggle(button, sentence),
            'study-grammar-toggle-known-visibility': () => this.performStudyGrammarToggle(button, sentence),
            'study-translate': () => this.performStudyTool(button, action, sentence),
            'study-grammar': () => this.performStudyGrammarTool(button, sentence),
            'study-read-sentence': () => this.performStudyReadSentence(sentence),
        };
        return handlers[action];
    }

    private performStudyGrammarToggle(button: HTMLButtonElement, sentence?: string): boolean {
        handleStudyGrammarAction(button, sentence);
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyTool(button: HTMLButtonElement, action: string, sentence?: string): Promise<boolean> {
        await renderStudyToolResult(button, action, sentence);
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyGrammarTool(button: HTMLButtonElement, sentence?: string): Promise<boolean> {
        await renderStudyToolResult(button, 'study-grammar', sentence, sentence ? await this.options.detectGrammarHints(sentence) : undefined);
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyReadSentence(sentence?: string): Promise<boolean> {
        await this.options.playSentenceAudio(sentence);
        return false;
    }

    private async performReaderAction(action: string | undefined, card: JPDBCard): Promise<boolean | undefined> {
        if (!action) return undefined;
        const handlers: Record<string, () => Promise<boolean>> = {
            'copy-word': () => this.copyWord(card),
            audio: () => this.playCardAudio(card),
            'setup-dictionaries': () => this.openSettingsPanel('dictionaries'),
            'setup-jpdb': () => this.openSettingsPanel('basics'),
        };
        return handlers[action]?.();
    }

    private async copyWord(card: JPDBCard): Promise<boolean> {
        await copyText(card.spelling);
        this.options.toast(uiText(this.options.getSettings().interfaceLanguage, 'copiedWord'));
        return false;
    }

    private async playCardAudio(card: JPDBCard): Promise<boolean> {
        await this.options.playAudio(card);
        return false;
    }

    private async openSettingsPanel(panel: string): Promise<boolean> {
        this.options.showSettings(panel);
        return false;
    }

    private async performMiningAction(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<boolean | undefined> {
        if (!action) return undefined;
        const handler = this.miningActionHandler(action, button, card, sentence);
        if (handler) return this.finishMiningAction(handler());
        return this.performJpdbDeckMiningAction(action, card);
    }

    private miningActionHandler(action: string, button: HTMLButtonElement, card: JPDBCard, sentence?: string): MiningActionHandler | undefined {
        const handlers: Record<string, MiningActionHandler> = {
            add: () => this.addToSelectedDeck(button, card, sentence),
            anki: () => this.addToAnki(card, sentence),
            'anki-edit': () => this.openAnkiNote(button),
            grade: () => this.gradeCard(button, card, sentence),
        };
        return handlers[action];
    }

    private async performJpdbDeckMiningAction(action: string | undefined, card: JPDBCard): Promise<boolean | undefined> {
        if (action === 'neverforget') {
            return this.finishMiningAction(this.changeJpdbDeckState(card, 'never-forget', this.options.getSettings().neverForgetDeck, 'Add a JPDB API key to change JPDB deck state.'));
        }
        if (action === 'blacklist') {
            return this.finishMiningAction(this.changeJpdbDeckState(card, 'blacklisted', this.options.getSettings().blacklistDeck, 'Add a JPDB API key to change JPDB deck state.'));
        }
        return undefined;
    }

    private async finishMiningAction(action: Promise<void>): Promise<boolean> {
        await action;
        return true;
    }

    private async reparsePopoverJapanese(button: HTMLButtonElement): Promise<void> {
        const popover = button.closest<HTMLElement>('.jpdb-reader-popover');
        if (!popover) return;
        delete popover.dataset.jpdbReaderParseKey;
        delete popover.dataset.jpdbReaderParseLoadingKey;
        await this.options.parsePopoverJapanese(popover);
    }

    private assertJpdbActionAllowed(card: JPDBCard, message: string): void {
        if (!this.options.getSettings().jpdbMiningEnabled) throw new Error('JPDB mining actions are disabled in settings.');
        if (!this.options.getSettings().apiKey.trim()) throw new Error(message);
        if (!this.options.isJpdbBackedCard(card)) throw new Error(message);
    }

    private async addToSelectedDeck(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        const settings = this.options.getSettings();
        const deck = selectedDeckChoice(button, settings);
        if (deck.source === 'anki') {
            await this.addToAnki(card, sentence, deck.id);
            return;
        }
        this.assertJpdbActionAllowed(card, 'Add a JPDB API key to add cards to JPDB, or use Add to Anki.');
        await this.addToSelectedJpdbDeck(card, sentence, deck.id);
        if (shouldMineAnkiAlongsideJpdb(settings)) await this.addToAnki(card, sentence, settings.ankiDeck);
        this.options.toast(`${uiText(settings.interfaceLanguage, 'add')} JPDB.`);
    }

    private async openAnkiNote(button: HTMLButtonElement): Promise<void> {
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw new Error('Anki note not found.');
        await this.options.anki.browseNote(noteId);
        this.options.toast('Opened in Anki.');
    }

    private async changeJpdbDeckState(card: JPDBCard, state: JpdbDeckState, deck: string, message: string): Promise<void> {
        this.assertJpdbActionAllowed(card, message);
        await this.toggleDeck(card, state, deck);
    }

    private async gradeCard(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        const grade = button.dataset.grade as JPDBGrade;
        const ankiCardId = Number(button.dataset.ankiCardId);
        await this.reviewGrade(grade, card, sentence, {
            ankiCardId: Number.isFinite(ankiCardId) && ankiCardId > 0 ? ankiCardId : undefined,
            deckId: defaultJpdbDeckId(this.options.getSettings()),
        });
    }

    async reviewGrade(grade: JPDBGrade, card: JPDBCard, sentence?: string, options: { ankiCardId?: number; deckId?: string } = {}): Promise<void> {
        if (options.ankiCardId) return this.options.anki.answerCard(options.ankiCardId, grade);

        this.assertJpdbActionAllowed(card, 'Add a JPDB API key to review JPDB cards.');
        const states = normalizeCardStates(card.cardState);
        assertReviewableJpdbCardState(states);
        const wasNotInDeck = states.includes('not-in-deck');
        if (wasNotInDeck) await this.addToSelectedJpdbDeck(card, sentence, this.reviewDeckId(options));
        await this.options.jpdb.reviewCard(card, grade);
        if (wasNotInDeck) this.options.toast('Added to deck and reviewed.');
    }

    private reviewDeckId(options: { deckId?: string }): string {
        return options.deckId || this.options.getSettings().miningDeck || 'forq';
    }

    private async addToAnki(card: JPDBCard, sentence?: string, deckName?: string): Promise<void> {
        const existing: AnkiLookupResult = await this.options.anki.findExistingCards(card);
        if (existing.primary) return this.showExistingAnkiCard(card, sentence);

        const settings = this.options.getSettings();
        const dictionaryContext = await this.loadAnkiDictionaryContext(card, settings);
        const context = await this.options.resolveMiningContext(card, sentence);
        await this.options.anki.addCard(card, miningSentenceForAnki(context.sentence, sentence), {
            deckName,
            imageDataUrl: context.imageDataUrl,
            ...dictionaryContext,
            dictionaryPreferences: settings.dictionaryPreferences,
            sourceTitle: ankiSourceTitle(context.sourceTitle),
            sourceUrl: ankiSourceUrl(context.sourceUrl),
        });
        this.options.toast(context.imageDataUrl ? 'Sent to Anki with context image.' : 'Sent to Anki.');
    }

    private async showExistingAnkiCard(card: JPDBCard, sentence?: string): Promise<void> {
        this.options.toast('Already in Anki. Use Edit in Anki instead.');
        await this.options.showCard(card, sentence, this.options.getActivePopoverAnchor(), {
            autoPlay: false,
            trigger: this.options.getActivePopoverMode() === 'hover' ? 'hover' : 'modal',
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private async loadAnkiDictionaryContext(card: JPDBCard, settings: ReaderSettings) {
        const [localEntries, kanjiEntries, metaEntries] = await Promise.all([
            this.lookupAnkiLocalTerms(card, settings),
            this.lookupAnkiLocalKanji(card, settings),
            this.lookupAnkiLocalMeta(card, settings),
        ]);
        return { localEntries, kanjiEntries, metaEntries };
    }

    private lookupAnkiLocalTerms(card: JPDBCard, settings: ReaderSettings) {
        return settings.localDictionariesEnabled
            ? this.options.dictionaries.lookup(card.spelling, card.reading, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private lookupAnkiLocalKanji(card: JPDBCard, settings: ReaderSettings) {
        return settings.localDictionariesEnabled && settings.localDictionaryShowKanji
            ? this.options.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private lookupAnkiLocalMeta(card: JPDBCard, settings: ReaderSettings) {
        return settings.localDictionariesEnabled
            ? this.options.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private async toggleDeck(card: JPDBCard, state: JpdbDeckState, deck: string): Promise<void> {
        if (normalizeCardStates(card.cardState).includes(state)) {
            await this.options.jpdb.removeFromDeck(deck, card);
            this.options.toast('Removed from deck.');
        } else {
            await this.options.jpdb.addToDeck(deck, card);
            this.options.toast('Added to deck.');
        }
    }

    private async addToSelectedJpdbDeck(card: JPDBCard, sentence: string | undefined, deckId: string): Promise<void> {
        const settings = this.options.getSettings();
        const targetDeck = selectedJpdbDeckId(deckId, settings);
        await this.options.jpdb.addToDeck(targetDeck, card, sentence);
        if (shouldAlsoAddToForq(settings, targetDeck)) await this.options.jpdb.addToDeck('forq', card, sentence);
    }
}

interface SelectedDeckChoice {
    source: 'jpdb' | 'anki';
    id: string;
}

function miningSentenceForAnki(contextSentence: string | undefined, fallbackSentence: string | undefined): string | undefined {
    return contextSentence || fallbackSentence;
}

function ankiSourceTitle(sourceTitle: string | undefined): string {
    return sourceTitle || document.title;
}

function ankiSourceUrl(sourceUrl: string | undefined): string {
    return sourceUrl || location.href;
}

function selectedDeckChoice(button: HTMLButtonElement, settings: ReaderSettings): SelectedDeckChoice {
    const source = selectedDeckSource(button);
    return {
        source,
        id: selectedDeckId(button, settings, source),
    };
}

function selectedDeckSource(button: HTMLButtonElement): SelectedDeckChoice['source'] {
    if (button.dataset.deckSource === 'anki') return 'anki';
    return 'jpdb';
}

function selectedDeckId(button: HTMLButtonElement, settings: ReaderSettings, source: SelectedDeckChoice['source']): string {
    const id = button.dataset.deckId?.trim();
    if (id) return id;
    return defaultDeckIdForSource(source, settings);
}

function defaultDeckIdForSource(source: SelectedDeckChoice['source'], settings: ReaderSettings): string {
    if (source === 'anki') return defaultAnkiDeckName(settings);
    return defaultJpdbDeckId(settings);
}

function defaultAnkiDeckName(settings: ReaderSettings): string {
    return settings.ankiDeck || 'よむ';
}

function defaultJpdbDeckId(settings: ReaderSettings): string {
    return settings.miningDeck.trim() || 'forq';
}

function selectedJpdbDeckId(deckId: string, settings: ReaderSettings): string {
    const selectedDeckId = deckId.trim();
    if (selectedDeckId) return selectedDeckId;
    return defaultJpdbDeckId(settings);
}

function shouldAlsoAddToForq(settings: ReaderSettings, targetDeck: string): boolean {
    if (!settings.addToForq) return false;
    return targetDeck !== 'forq';
}

function shouldMineAnkiAlongsideJpdb(settings: ReaderSettings): boolean {
    if (!settings.ankiEnabled) return false;
    return settings.ankiMineWithJpdb;
}
