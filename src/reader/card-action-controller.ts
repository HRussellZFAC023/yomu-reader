import { AnkiConnectClient, canUseMobileAnkiHandoff, type AnkiAudioMergeMode, type AnkiLookupResult, type AnkiMergeYomuResult } from './anki';
import { resolveAnkiWordAudio } from './audio';
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
    playAudio: (card: JPDBCard, options?: { userGesture?: boolean }) => Promise<void>;
    playMediaUrl?: (audioUrl: string) => Promise<void>;
    playSentenceAudio: (sentence?: string) => Promise<void>;
    playJpdbExampleAudio?: (audioIds: string | string[], fallbackSentence?: string) => Promise<void>;
    detectGrammarHints: (sentence: string) => Promise<GrammarHint[]>;
    parsePopoverJapanese: (popover: HTMLElement) => void | Promise<void>;
    toast: (message: string) => void;
    invalidateCardData?: () => void;
}

type StudyActionHandler = () => boolean | Promise<boolean>;
type MiningActionHandler = () => Promise<void>;
type JpdbDeckState = 'never-forget' | 'blacklisted';

function assertReviewableJpdbCardState(states: string[], settings: ReaderSettings): void {
    if (states.includes('blacklisted')) throw new Error(uiText(settings.interfaceLanguage, 'reviewBlockedBlacklisted'));
    if (states.includes('never-forget')) throw new Error(uiText(settings.interfaceLanguage, 'reviewBlockedNeverForget'));
}

export class CardActionController {
    constructor(private options: CardActionControllerOptions) {}

    async perform(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<boolean> {
        const studyAction = this.performStudyAction(action, button, sentence);
        if (studyAction !== undefined) return await studyAction;

        const readerAction = this.performReaderAction(action, card);
        if (readerAction !== undefined) return await readerAction;

        const miningAction = await this.performMiningAction(action, button, card, sentence);
        if (miningAction !== undefined) return miningAction;

        return Boolean(action);
    }

    private performStudyAction(action: string | undefined, button: HTMLButtonElement, sentence?: string): boolean | Promise<boolean> | undefined {
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
            'jpdb-example-audio': () => this.performJpdbExampleAudio(button),
            'anki-media-audio': () => this.performAnkiMediaAudio(button),
        };
        return handlers[action];
    }

    private performStudyGrammarToggle(button: HTMLButtonElement, sentence?: string): boolean {
        handleStudyGrammarAction(button, sentence, this.options.getSettings().interfaceLanguage);
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyTool(button: HTMLButtonElement, action: string, sentence?: string): Promise<boolean> {
        await renderStudyToolResult(button, action, sentence, undefined, this.options.getSettings().interfaceLanguage);
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyGrammarTool(button: HTMLButtonElement, sentence?: string): Promise<boolean> {
        await renderStudyToolResult(button, 'study-grammar', sentence, sentence ? await this.options.detectGrammarHints(sentence) : undefined, this.options.getSettings().interfaceLanguage);
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyReadSentence(sentence?: string): Promise<boolean> {
        await this.options.playSentenceAudio(sentence);
        return false;
    }

    private async performJpdbExampleAudio(button: HTMLButtonElement): Promise<boolean> {
        const audioIds = button.dataset.jpdbAudio ?? '';
        const fallbackSentence = button.dataset.jpdbExampleSentence ?? '';
        if (!this.options.playJpdbExampleAudio) await this.options.playSentenceAudio(fallbackSentence);
        else await this.options.playJpdbExampleAudio(audioIds, fallbackSentence);
        return false;
    }

    private async performAnkiMediaAudio(button: HTMLButtonElement): Promise<boolean> {
        await this.playAnkiMediaAudio(button);
        return false;
    }

    private performReaderAction(action: string | undefined, card: JPDBCard): Promise<boolean> | undefined {
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
        await this.options.playAudio(card, { userGesture: true });
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
            'anki-merge': () => this.mergeExistingAnkiCard(button, card, sentence),
            grade: () => this.gradeCard(button, card, sentence),
        };
        return handlers[action];
    }

    private async performJpdbDeckMiningAction(action: string | undefined, card: JPDBCard): Promise<boolean | undefined> {
        if (action === 'neverforget') {
            const settings = this.options.getSettings();
            return this.finishMiningAction(this.changeJpdbDeckState(card, 'never-forget', settings.neverForgetDeck, uiText(settings.interfaceLanguage, 'jpdbDeckStateApiKeyRequired')));
        }
        if (action === 'blacklist') {
            const settings = this.options.getSettings();
            return this.finishMiningAction(this.changeJpdbDeckState(card, 'blacklisted', settings.blacklistDeck, uiText(settings.interfaceLanguage, 'jpdbDeckStateApiKeyRequired')));
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
        const settings = this.options.getSettings();
        if (!settings.jpdbMiningEnabled) throw new Error(uiText(settings.interfaceLanguage, 'jpdbActionsDisabled'));
        if (!settings.apiKey.trim()) throw new Error(message);
        if (!this.options.isJpdbBackedCard(card)) throw new Error(message);
    }

    private assertJpdbReviewAllowed(card: JPDBCard, message: string): void {
        const settings = this.options.getSettings();
        if (!settings.enableReviews) throw new Error(uiText(settings.interfaceLanguage, 'reviewActionsDisabled'));
        if (!settings.jpdbMiningEnabled) throw new Error(uiText(settings.interfaceLanguage, 'jpdbActionsDisabled'));
        if (!settings.apiKey.trim()) throw new Error(message);
        if (!this.options.isJpdbBackedCard(card)) throw new Error(message);
    }

    private async addToSelectedDeck(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        const settings = this.options.getSettings();
        const deck = selectedDeckChoice(button, settings);
        if (deck.source === 'anki') {
            await this.addToAnki(card, sentence, deck.id);
            return;
        }
        this.assertJpdbActionAllowed(card, uiText(settings.interfaceLanguage, 'jpdbAddApiKeyRequired'));
        await this.addToSelectedJpdbDeck(card, sentence, deck.id);
        if (shouldMineAnkiAlongsideJpdb(settings)) await this.addToAnki(card, sentence, settings.ankiDeck);
        this.options.toast(uiText(settings.interfaceLanguage, 'addedToJpdb'));
    }

    private async openAnkiNote(button: HTMLButtonElement): Promise<void> {
        const settings = this.options.getSettings();
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw new Error(uiText(settings.interfaceLanguage, 'ankiNoteNotFound'));
        await this.options.anki.browseNote(noteId);
        this.options.toast(uiText(settings.interfaceLanguage, 'openedInAnki'));
    }

    private async playAnkiMediaAudio(button: HTMLButtonElement): Promise<void> {
        const settings = this.options.getSettings();
        const filename = button.dataset.ankiMediaName?.trim();
        if (!filename) throw new Error(uiText(settings.interfaceLanguage, 'ankiAudioFileNotFound'));
        if (!this.options.playMediaUrl) throw new Error(uiText(settings.interfaceLanguage, 'ankiAudioPlaybackUnavailable'));
        await this.options.playMediaUrl(await this.options.anki.mediaFileDataUrl(filename));
    }

    private async mergeExistingAnkiCard(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        const settings = this.options.getSettings();
        if (canUseMobileAnkiHandoff(settings)) throw new Error(uiText(settings.interfaceLanguage, 'ankiMergeNeedsDesktop'));
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw new Error(uiText(settings.interfaceLanguage, 'ankiNoteNotFound'));

        const [dictionaryContext, context, wordAudio] = await Promise.all([
            this.loadAnkiDictionaryContext(card, settings),
            this.options.resolveMiningContext(card, sentence),
            resolveAnkiWordAudio(card, settings).catch(() => null),
        ]);
        const result = await this.options.anki.mergeYomuData(noteId, card, miningSentenceForAnki(context.sentence, sentence), {
            imageDataUrl: context.imageDataUrl,
            audioDataUrl: context.audioDataUrl,
            wordAudioDataUrl: wordAudio?.dataUrl,
            wordAudioUrl: wordAudio?.url,
            audioMergeMode: selectedAnkiAudioMergeMode(button),
            ...dictionaryContext,
            dictionaryPreferences: settings.dictionaryPreferences,
            sourceTitle: ankiSourceTitle(context.sourceTitle),
            sourceUrl: ankiSourceUrl(context.sourceUrl),
        });
        this.options.invalidateCardData?.();
        this.options.toast(ankiMergeToast(result, settings));
        await this.options.showCard(card, sentence, this.options.getActivePopoverAnchor(), {
            autoPlay: false,
            trigger: this.options.getActivePopoverMode() === 'hover' ? 'hover' : 'modal',
            navigation: 'preserve',
            preservePosition: true,
        });
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
        const settings = this.options.getSettings();
        if (!settings.enableReviews) throw new Error(uiText(settings.interfaceLanguage, 'reviewActionsDisabled'));
        if (options.ankiCardId) return this.options.anki.answerCard(options.ankiCardId, grade);

        this.assertJpdbReviewAllowed(card, uiText(settings.interfaceLanguage, 'addJpdbApiKeyReview'));
        const states = normalizeCardStates(card.cardState);
        assertReviewableJpdbCardState(states, settings);
        const wasNotInDeck = states.includes('not-in-deck');
        if (wasNotInDeck) await this.addToSelectedJpdbDeck(card, sentence, this.reviewDeckId(options));
        await this.options.jpdb.reviewCard(card, grade);
        if (wasNotInDeck) this.options.toast(uiText(settings.interfaceLanguage, 'addedToDeckAndReviewed'));
    }

    private reviewDeckId(options: { deckId?: string }): string {
        return options.deckId || this.options.getSettings().miningDeck || 'forq';
    }

    private async addToAnki(card: JPDBCard, sentence?: string, deckName?: string): Promise<void> {
        const settings = this.options.getSettings();
        if (canUseMobileAnkiHandoff(settings)) {
            await this.options.anki.addCard(card, sentence || card.sentence || '', {
                deckName,
                dictionaryPreferences: settings.dictionaryPreferences,
            });
            this.options.toast(uiText(settings.interfaceLanguage, 'sentToAnki'));
            return;
        }

        const existing: AnkiLookupResult = await this.options.anki.findExistingCards(card);
        if (existing.primary) return this.showExistingAnkiCard(card, sentence);

        const [dictionaryContext, context, wordAudio] = await Promise.all([
            this.loadAnkiDictionaryContext(card, settings),
            this.options.resolveMiningContext(card, sentence),
            resolveAnkiWordAudio(card, settings).catch(() => null),
        ]);
        await this.options.anki.addCard(card, miningSentenceForAnki(context.sentence, sentence), {
            deckName,
            imageDataUrl: context.imageDataUrl,
            audioDataUrl: context.audioDataUrl,
            wordAudioDataUrl: wordAudio?.dataUrl,
            wordAudioUrl: wordAudio?.url,
            ...dictionaryContext,
            dictionaryPreferences: settings.dictionaryPreferences,
            sourceTitle: ankiSourceTitle(context.sourceTitle),
            sourceUrl: ankiSourceUrl(context.sourceUrl),
        });
        this.options.toast(ankiSentToast(context, settings, Boolean(wordAudio?.dataUrl || wordAudio?.url)));
    }

    private async showExistingAnkiCard(card: JPDBCard, sentence?: string): Promise<void> {
        const settings = this.options.getSettings();
        this.options.toast(uiText(settings.interfaceLanguage, 'alreadyInAnki'));
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
            this.options.toast(uiText(this.options.getSettings().interfaceLanguage, 'removedFromDeck'));
        } else {
            await this.options.jpdb.addToDeck(deck, card);
            this.options.toast(uiText(this.options.getSettings().interfaceLanguage, 'addedToDeckToast'));
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

function ankiSentToast(context: MiningContext, settings: ReaderSettings, hasWordAudio = false): string {
    const language = settings.interfaceLanguage;
    const hasAudio = Boolean(context.audioDataUrl || hasWordAudio);
    if (context.imageDataUrl && hasAudio) return uiText(language, 'sentToAnkiWithContextImageAndAudio');
    if (context.imageDataUrl) return uiText(language, 'sentToAnkiWithContextImage');
    if (hasAudio) return uiText(language, 'sentToAnkiWithAudio');
    return uiText(language, 'sentToAnki');
}

function ankiMergeToast(result: AnkiMergeYomuResult, settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    if (!result.updatedFields.length && !result.audioAdded && !result.imageAdded) return uiText(language, 'ankiMergeNoNewData');
    const parts = [
        result.updatedFields.length ? `${result.updatedFields.length} ${uiText(language, result.updatedFields.length === 1 ? 'ankiMergeFieldSingular' : 'ankiMergeFieldPlural')}` : '',
        result.audioAdded ? uiText(language, 'ankiMergeAudio') : '',
        result.imageAdded ? uiText(language, 'ankiMergeImage') : '',
    ].filter(Boolean);
    return uiText(language, 'ankiMergeComplete').replace('{parts}', parts.join(', '));
}

function selectedAnkiAudioMergeMode(button: HTMLButtonElement): AnkiAudioMergeMode {
    const value = button.closest('.jpdb-reader-anki-card-preview')
        ?.querySelector<HTMLSelectElement>('[data-anki-audio-merge]')
        ?.value;
    return value === 'theirs' || value === 'ours' ? value : 'both';
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
