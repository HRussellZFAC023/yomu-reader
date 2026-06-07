import { AnkiConnectClient, canUseMobileAnkiHandoff, isAnkiDuplicateNoteError, type AnkiAudioMergeMode, type AnkiCardContext, type AnkiLookupResult, type AnkiMergeYomuResult } from './anki';
import { resolveAnkiWordAudio } from './anki/audio';
import { copyText } from './browser-ui';
import { normalizeCardStates } from './card-state';
import { readerWordSurfaceText } from './dom';
import { JpdbClient } from './jpdb';
import { handleStudyGrammarAction, renderStudyToolResult } from './study-render';
import { formatUiText, uiList, uiText } from './i18n';
import type { MiningContext } from './mining-context';
import type { JitenApiClient } from './jiten';
import {
    createApiSrsProviderAdapters,
    isApiMiningEnabled,
    shouldMineAnkiAlongsideApi,
    type ApiSrsDeckSource,
    type ApiSrsDeckState,
    type ApiSrsProviderAdapter,
} from './srs-providers';
import type { JPDBCard, JPDBGrade, ReaderSettings } from './types';
import { YomitanDictionaryStore } from './yomitan';
import type { GrammarHint } from './study-tools';
import { newTabText } from './newtab/i18n';

interface ShowCardOptions {
    autoPlay?: boolean;
    trigger?: 'modal' | 'hover';
    navigation?: 'reset' | 'preserve' | 'push-current';
    preservePosition?: boolean;
}

interface CardActionControllerOptions {
    getSettings: () => ReaderSettings;
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
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
    onAnkiStatusChanged?: (card: JPDBCard) => void;
}

interface CardActionContext {
    sentenceTarget?: string;
}

type StudyActionHandler = () => boolean | Promise<boolean>;
type MiningActionHandler = () => Promise<void>;
type SrsDeckSource = ApiSrsDeckSource | 'anki';
type AnkiAddResult = number | null | 'duplicate';
type PopoverReviewTargetKind = 'api' | 'anki' | 'both';
interface PopoverReviewTargetSelection {
    kind?: PopoverReviewTargetKind;
    ankiCardId?: number;
}
type ResolvedAnkiWordAudio = Awaited<ReturnType<typeof resolveAnkiWordAudio>>;

interface SelectedDeckChoice {
    source: SrsDeckSource;
    id: string;
}

interface PreparedAnkiAdd {
    context: MiningContext;
    hasWordAudio: boolean;
    options: AnkiCardContext;
    sentence: string | undefined;
}

function assertReviewableApiCardState(states: string[], settings: ReaderSettings): void {
    if (states.includes('blacklisted')) throw new Error(uiText(settings.interfaceLanguage, 'reviewBlockedBlacklisted'));
    if (states.includes('never-forget')) throw new Error(uiText(settings.interfaceLanguage, 'reviewBlockedNeverForget'));
}

export class CardActionController {
    constructor(private options: CardActionControllerOptions) {}

    async perform(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string, context: CardActionContext = {}): Promise<boolean> {
        const studyAction = this.performStudyAction(action, button, sentence);
        if (studyAction !== undefined) return await studyAction;

        const readerAction = this.performReaderAction(action, card);
        if (readerAction !== undefined) return await readerAction;

        const miningAction = await this.performMiningAction(action, button, card, sentence, context);
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
            'study-read-sentence': () => this.performStudyReadSentence(button, sentence),
            'jpdb-example-audio': () => this.performJpdbExampleAudio(button),
            'anki-media-audio': () => this.performAnkiMediaAudio(button),
        };
        return handlers[action];
    }

    private performStudyGrammarToggle(button: HTMLButtonElement, sentence?: string): boolean {
        const settings = this.options.getSettings();
        handleStudyGrammarAction(button, sentence, settings.interfaceLanguage, { audioEnabled: settings.audioEnabled });
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyTool(button: HTMLButtonElement, action: string, sentence?: string): Promise<boolean> {
        const settings = this.options.getSettings();
        await renderStudyToolResult(button, action, sentence, undefined, settings.interfaceLanguage, { audioEnabled: settings.audioEnabled });
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyGrammarTool(button: HTMLButtonElement, sentence?: string): Promise<boolean> {
        const settings = this.options.getSettings();
        await renderStudyToolResult(button, 'study-grammar', sentence, sentence ? await this.options.detectGrammarHints(sentence) : undefined, settings.interfaceLanguage, { audioEnabled: settings.audioEnabled });
        void this.reparsePopoverJapanese(button);
        return false;
    }

    private async performStudyReadSentence(button: HTMLButtonElement, sentence?: string): Promise<boolean> {
        await this.options.playSentenceAudio(this.studySentenceFromButton(button) || sentence);
        return false;
    }

    private studySentenceFromButton(button: HTMLButtonElement): string {
        if (button.dataset.studySentence) return button.dataset.studySentence.trim();
        const original = button
            .closest<HTMLElement>('.jpdb-reader-study-sentence-block')
            ?.querySelector<HTMLElement>('[data-study-original-render]');
        return original ? readerWordSurfaceText(original).replace(/\s+/g, ' ').trim() : '';
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
            'setup-jpdb': () => this.openSettingsPanel('api'),
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

    private async performMiningAction(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, context: CardActionContext): Promise<boolean | undefined> {
        if (!action) return undefined;
        const handler = this.miningActionHandler(action, button, card, sentence, context);
        if (handler) return this.finishMiningAction(handler());
        return this.performApiDeckStateAction(action, card);
    }

    private miningActionHandler(action: string, button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, context: CardActionContext): MiningActionHandler | undefined {
        const handlers: Record<string, MiningActionHandler> = {
            add: () => this.addToSelectedDeck(button, card, sentence, context),
            anki: () => this.addToAnki(card, sentence, undefined, context),
            'anki-edit': () => this.openAnkiNote(button),
            'anki-merge': () => this.mergeExistingAnkiCard(button, card, sentence, context),
            grade: () => this.gradeCard(button, card, sentence),
        };
        return handlers[action];
    }

    private async performApiDeckStateAction(action: string | undefined, card: JPDBCard): Promise<boolean | undefined> {
        if (action === 'neverforget') {
            const settings = this.options.getSettings();
            return this.finishMiningAction(this.changeProviderDeckState(card, 'never-forget', settings.neverForgetDeck));
        }
        if (action === 'blacklist') {
            const settings = this.options.getSettings();
            return this.finishMiningAction(this.changeProviderDeckState(card, 'blacklisted', settings.blacklistDeck));
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
        delete popover.dataset.jpdbReaderParseLoadingId;
        await this.options.parsePopoverJapanese(popover);
    }

    private apiProviders(settings: ReaderSettings = this.options.getSettings()): ApiSrsProviderAdapter[] {
        return createApiSrsProviderAdapters({
            jpdb: this.options.jpdb,
            jiten: this.options.jiten,
            isJpdbBackedCard: this.options.isJpdbBackedCard,
        }, settings);
    }

    private apiProviderForCard(card: JPDBCard, settings: ReaderSettings = this.options.getSettings()): ApiSrsProviderAdapter | null {
        return this.apiProviders(settings).find(provider => provider.supportsCard(card)) ?? null;
    }

    private apiProviderForDeckSource(source: ApiSrsDeckSource, card: JPDBCard, settings: ReaderSettings): ApiSrsProviderAdapter | null {
        return this.apiProviders(settings).find(provider => provider.deckSource === source && provider.supportsCard(card)) ?? null;
    }

    private assertApiProviderActionAllowed(provider: ApiSrsProviderAdapter | null, message: string): asserts provider is ApiSrsProviderAdapter {
        const settings = this.options.getSettings();
        if (!isApiMiningEnabled(settings)) throw new Error(uiText(settings.interfaceLanguage, 'apiSrsActionsDisabled'));
        if (!provider?.hasApiKey) throw new Error(message);
    }

    private assertApiProviderReviewAllowed(provider: ApiSrsProviderAdapter | null, message: string): asserts provider is ApiSrsProviderAdapter {
        const settings = this.options.getSettings();
        if (!settings.enableReviews) throw new Error(uiText(settings.interfaceLanguage, 'reviewActionsDisabled'));
        this.assertApiProviderActionAllowed(provider, message);
    }

    private async addToSelectedDeck(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, context: CardActionContext): Promise<void> {
        const settings = this.options.getSettings();
        const deck = selectedDeckChoice(button, settings);
        if (deck.source === 'anki') {
            await this.addToAnki(card, sentence, deck.id, context);
            return;
        }

        const provider = this.apiProviderForDeckSource(deck.source, card, settings);
        const fallbackKey = deck.source === 'jiten' ? 'jitenAddApiKeyRequired' : 'jpdbAddApiKeyRequired';
        this.assertApiProviderActionAllowed(provider, uiText(settings.interfaceLanguage, provider?.addApiKeyRequiredKey ?? fallbackKey));
        const selectedDeckId = provider.selectedDeckId(deck.id, settings);
        if (!selectedDeckId) throw new Error(uiText(settings.interfaceLanguage, 'chooseJitenStudyDeck'));
        await provider.addToDeck(selectedDeckId, card, sentence, { sourceTitle: document.title });
        if (shouldMineAnkiAlongsideApi(settings)) await this.addToAnki(card, sentence, settings.ankiDeck, context);
        this.options.toast(uiText(settings.interfaceLanguage, provider.addedToastKey));
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

    private async mergeExistingAnkiCard(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, actionContext: CardActionContext): Promise<void> {
        const settings = this.options.getSettings();
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
            sentenceTarget: actionContext.sentenceTarget,
            sourceTitle: ankiSourceTitle(context.sourceTitle),
            sourceUrl: ankiSourceUrl(context.sourceUrl),
        });
        this.notifyAnkiStatusChanged(card);
        this.options.toast(ankiMergeToast(result, settings));
        await this.options.showCard(card, sentence, this.options.getActivePopoverAnchor(), {
            autoPlay: false,
            trigger: this.options.getActivePopoverMode() === 'hover' ? 'hover' : 'modal',
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private async changeProviderDeckState(card: JPDBCard, state: ApiSrsDeckState, deck: string): Promise<void> {
        const settings = this.options.getSettings();
        const provider = this.apiProviderForCard(card, settings);
        this.assertApiProviderActionAllowed(provider, uiText(settings.interfaceLanguage, provider?.deckStateApiKeyRequiredKey ?? 'jpdbDeckStateApiKeyRequired'));
        const wasSet = normalizeCardStates(card.cardState).includes(state);
        await provider.setDeckState(card, state, deck);
        this.options.toast(uiText(settings.interfaceLanguage, wasSet ? 'removedFromDeck' : 'addedToDeckToast'));
    }

    private async gradeCard(button: HTMLButtonElement, card: JPDBCard, sentence?: string): Promise<void> {
        const grade = button.dataset.grade as JPDBGrade;
        const selection = selectedPopoverReviewTarget(button);
        await this.reviewGrade(grade, card, sentence, {
            target: selection.kind,
            ankiCardId: selection.ankiCardId,
            deckId: defaultJpdbDeckId(this.options.getSettings()),
        });
    }

    async reviewGrade(grade: JPDBGrade, card: JPDBCard, sentence?: string, options: { target?: PopoverReviewTargetKind; ankiCardId?: number; deckId?: string } = {}): Promise<void> {
        const settings = this.options.getSettings();
        if (!settings.enableReviews) throw new Error(uiText(settings.interfaceLanguage, 'reviewActionsDisabled'));
        if (options.target === 'both') {
            await this.reviewApiCard(grade, card, sentence, options);
            await this.answerAnkiCard(grade, card, options.ankiCardId);
            return;
        }
        if (options.target === 'anki' || options.ankiCardId) {
            await this.answerAnkiCard(grade, card, options.ankiCardId);
            return;
        }
        await this.reviewApiCard(grade, card, sentence, options);
    }

    private async answerAnkiCard(grade: JPDBGrade, card: JPDBCard, ankiCardId: number | undefined): Promise<void> {
        if (ankiCardId) {
            await this.options.anki.answerCard(ankiCardId, grade);
            this.notifyAnkiStatusChanged(card);
            return;
        }
        throw new Error(newTabText(this.options.getSettings().interfaceLanguage, 'missingAnkiCardId'));
    }

    private async reviewApiCard(grade: JPDBGrade, card: JPDBCard, sentence: string | undefined, options: { deckId?: string }): Promise<void> {
        const settings = this.options.getSettings();
        const provider = this.apiProviderForCard(card, settings);
        this.assertApiProviderReviewAllowed(provider, uiText(settings.interfaceLanguage, provider?.reviewApiKeyRequiredKey ?? 'addJpdbApiKeyReview'));
        const states = normalizeCardStates(card.cardState);
        assertReviewableApiCardState(states, settings);
        const result = await provider.reviewCard(card, grade, { sentence, deckId: this.reviewDeckId(options) });
        if (result.addedBeforeReview) this.options.toast(uiText(settings.interfaceLanguage, 'addedToDeckAndReviewed'));
    }

    private reviewDeckId(options: { deckId?: string }): string {
        return options.deckId || this.options.getSettings().miningDeck || 'forq';
    }

    private async addToAnki(card: JPDBCard, sentence?: string, deckName?: string, context: CardActionContext = {}): Promise<void> {
        const settings = this.options.getSettings();
        if (await this.addToAnkiViaMobileHandoff(card, sentence, deckName, settings, context)) return;
        if (await this.showExistingAnkiCardIfPresent(card, sentence)) return;

        const prepared = await this.prepareAnkiAdd(card, sentence, deckName, settings, context);
        const noteId = await this.addPreparedAnkiCard(card, prepared);
        if (noteId === 'duplicate') return this.showExistingAnkiCard(card, sentence);
        if (noteId === null) return this.toastMobileAnkiHandoff(settings);

        this.notifyAnkiStatusChanged(card);
        this.options.toast(ankiSentToast(prepared.context, settings, prepared.hasWordAudio));
    }

    private async addToAnkiViaMobileHandoff(card: JPDBCard, sentence: string | undefined, deckName: string | undefined, settings: ReaderSettings, context: CardActionContext): Promise<boolean> {
        if (!canUseMobileAnkiHandoff(settings)) return false;
        await this.options.anki.addCardViaMobileHandoff(card, mobileAnkiSentence(card, sentence), {
            deckName,
            dictionaryPreferences: settings.dictionaryPreferences,
            sentenceTarget: context.sentenceTarget,
        });
        this.toastMobileAnkiHandoff(settings);
        return true;
    }

    private async showExistingAnkiCardIfPresent(card: JPDBCard, sentence?: string): Promise<boolean> {
        const existing: AnkiLookupResult = await this.options.anki.findExistingCards(card);
        if (!existing.primary) return false;
        await this.showExistingAnkiCard(card, sentence);
        return true;
    }

    private async prepareAnkiAdd(card: JPDBCard, sentence: string | undefined, deckName: string | undefined, settings: ReaderSettings, actionContext: CardActionContext): Promise<PreparedAnkiAdd> {
        const [dictionaryContext, context, wordAudio] = await Promise.all([
            this.loadAnkiDictionaryContext(card, settings),
            this.options.resolveMiningContext(card, sentence),
            resolveAnkiWordAudio(card, settings).catch(() => null),
        ]);
        return {
            context,
            hasWordAudio: hasResolvedAnkiWordAudio(wordAudio),
            options: {
                deckName,
                imageDataUrl: context.imageDataUrl,
                audioDataUrl: context.audioDataUrl,
                wordAudioDataUrl: wordAudio?.dataUrl,
                wordAudioUrl: wordAudio?.url,
                ...dictionaryContext,
                dictionaryPreferences: settings.dictionaryPreferences,
                sentenceTarget: actionContext.sentenceTarget,
                sourceTitle: ankiSourceTitle(context.sourceTitle),
                sourceUrl: ankiSourceUrl(context.sourceUrl),
            },
            sentence: miningSentenceForAnki(context.sentence, sentence),
        };
    }

    private async addPreparedAnkiCard(card: JPDBCard, prepared: PreparedAnkiAdd): Promise<AnkiAddResult> {
        try {
            return await this.options.anki.addCard(card, prepared.sentence, prepared.options);
        } catch (error) {
            return duplicateAnkiAddResult(error);
        }
    }

    private toastMobileAnkiHandoff(settings: ReaderSettings): void {
        this.options.toast(uiText(settings.interfaceLanguage, 'openedMobileAnkiHandoff'));
    }

    private notifyAnkiStatusChanged(card: JPDBCard): void {
        this.options.invalidateCardData?.();
        this.options.onAnkiStatusChanged?.(card);
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

}

function miningSentenceForAnki(contextSentence: string | undefined, fallbackSentence: string | undefined): string | undefined {
    return contextSentence || fallbackSentence;
}

function mobileAnkiSentence(card: JPDBCard, sentence: string | undefined): string {
    return sentence || card.sentence || '';
}

function hasResolvedAnkiWordAudio(wordAudio: ResolvedAnkiWordAudio | null): boolean {
    return Boolean(wordAudio?.dataUrl || wordAudio?.url);
}

function duplicateAnkiAddResult(error: unknown): AnkiAddResult {
    if (isAnkiDuplicateNoteError(error)) return 'duplicate';
    throw error;
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
    return formatUiText(language, 'ankiMergeComplete', { parts: uiList(language, parts) });
}

function selectedAnkiAudioMergeMode(button: HTMLButtonElement): AnkiAudioMergeMode {
    const value = button.closest('.jpdb-reader-anki-card-preview')
        ?.querySelector<HTMLSelectElement>('[data-anki-audio-merge]')
        ?.value;
    return value === 'theirs' || value === 'ours' ? value : 'both';
}

function selectedPopoverReviewTarget(button: HTMLButtonElement): PopoverReviewTargetSelection {
    const option = button.closest('.jpdb-reader-actions')?.querySelector<HTMLSelectElement>('[data-review-target-select]')?.selectedOptions[0] ?? null;
    const target = reviewTargetKind(option?.dataset.reviewTarget ?? button.dataset.reviewTarget);
    const ankiCardId = positiveNumber(option?.dataset.ankiCardId ?? button.dataset.ankiCardId);
    return { kind: target, ankiCardId };
}

function reviewTargetKind(value: string | undefined): PopoverReviewTargetKind | undefined {
    if (value === 'both' || value === 'anki') return value;
    if (value === 'jpdb' || value === 'jiten') return 'api';
    return undefined;
}

function positiveNumber(value: string | undefined): number | undefined {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
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
    if (button.dataset.deckSource === 'jiten') return 'jiten';
    return 'jpdb';
}

function selectedDeckId(button: HTMLButtonElement, settings: ReaderSettings, source: SelectedDeckChoice['source']): string {
    const id = button.dataset.deckId?.trim();
    if (id) return id;
    return defaultDeckIdForSource(source, settings);
}

function defaultDeckIdForSource(source: SelectedDeckChoice['source'], settings: ReaderSettings): string {
    if (source === 'anki') return defaultAnkiDeckName(settings);
    if (source === 'jiten') return '';
    return defaultJpdbDeckId(settings);
}

function defaultAnkiDeckName(settings: ReaderSettings): string {
    return settings.ankiDeck || 'よむ';
}

function defaultJpdbDeckId(settings: ReaderSettings): string {
    return settings.miningDeck.trim() || 'forq';
}
