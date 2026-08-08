import { ANKI_NEVER_FORGET_TAG, AnkiConnectClient, canUseMobileAnkiHandoff, isAnkiDuplicateNoteError, resolveAnkiWordAudio, type AnkiAudioMergeMode, type AnkiCardContext, type AnkiLookupResult, type AnkiMergeYomuResult } from '../anki/index';
import { publishCardStateSignal } from '../app/card-state-signal';
import { copyText } from '../ui/browser';
import { normalizeCardStates } from './state';
import { readerWordSurfaceText } from '../dom/index';
import { JpdbClient } from '../jpdb/jpdb';
import { jitenSentenceTtsUrl, jitenTtsVoicesForSettings, jitenWordTtsUrl } from '../audio/jiten-tts';
import { handleStudyGrammarAction, renderStudyToolResult } from '../study/render';
import { formatUiText, uiList, uiText, type UiCopyKey } from '../app/i18n';
import { userFacingError } from '../app/user-facing-errors';
import type { MiningContext } from '../study/mining-context';
import type { JitenApiClient } from '../dictionaries/jiten';
import {
    apiGradingProviderPreference,
    apiSrsSwitchableProviderIds,
    createApiSrsProviderAdapters,
    cardStateForApiState,
    isApiMiningEnabled,
    isApiSrsProviderEnabled,
    shouldMineAnkiAlongsideApi,
    type ApiSrsDeckSource,
    type ApiSrsDeckState,
    type ApiSrsProviderId,
    type ApiSrsToggleDeckState,
    type ApiSrsProviderAdapter,
} from './srs-providers';
import type { JPDBCard, JPDBGrade, JPDBToken, ReaderSettings } from '../app/types';
import type { YomitanDictionaryStore } from '../dictionaries/yomitan';
import type { YomuSrsAdapter } from '../srs';
import type { GrammarHint } from '../study/tools';
import { outputLanguageOf } from '../languages';
import { targetUsesCharacterDictionary } from '../languages/character-lookup';

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
    srsAdapters?: Partial<Record<'bunpro' | 'wanikani' | 'yomu-local', YomuSrsAdapter>>;
    anki: AnkiConnectClient;
    dictionaries: YomitanDictionaryStore;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
    resolveMiningContext: (card: JPDBCard, sentence?: string) => Promise<MiningContext>;
    showCard: (card: JPDBCard, sentence: string | undefined, anchor: HTMLElement | undefined, options: ShowCardOptions) => Promise<void>;
    getActivePopoverAnchor: () => HTMLElement | undefined;
    getActivePopoverMode: () => 'modal' | 'hover' | undefined;
    showSettings: (panel?: string) => void;
    playAudio: (card: JPDBCard, options?: { userGesture?: boolean }) => Promise<void>;
    playMediaUrl?: (audioUrl: string) => Promise<boolean | void>;
    playSentenceAudio: (sentence?: string) => Promise<void>;
    playJpdbExampleAudio?: (audioIds: string | string[], fallbackSentence?: string) => Promise<void>;
    detectGrammarHints: (sentence: string) => Promise<GrammarHint[]>;
    parsePopoverJapanese: (popover: HTMLElement) => void | Promise<void>;
    toast: (message: string) => void;
    invalidateCardData?: () => void;
    setApiGradingProvider?: (provider: ReaderSettings['apiGradingProvider']) => void;
    onAnkiStatusChanged?: (card: JPDBCard) => void;
    onApiCardStateChanged?: (card: JPDBCard) => void;
}

interface CardActionContext {
    sentenceTarget?: string;
}

type StudyActionHandler = () => boolean | Promise<boolean>;
type MiningActionHandler = () => Promise<void>;
type SrsDeckSource = ApiSrsDeckSource | 'anki';
type AnkiAddResult = number | null | 'duplicate';
type PopoverReviewTargetKind = 'api' | ApiSrsProviderId | 'anki' | 'both';
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

export interface BatchMiningCardCandidate {
    card: JPDBCard;
    sentence?: string;
}

function assertReviewableApiCardState(states: string[]): void {
    if (states.includes('blacklisted')) throw userFacingError('reviewBlockedBlacklisted');
    if (states.includes('never-forget')) throw userFacingError('reviewBlockedNeverForget');
    if (states.includes('redundant')) throw userFacingError('reviewBlockedRedundant');
}

export class CardActionController {
    constructor(private options: CardActionControllerOptions) {}

    async addBatchMiningCards(candidates: BatchMiningCardCandidate[]): Promise<number> {
        let added = 0;
        for (const candidate of candidates) {
            if (await this.addBatchMiningCard(candidate.card, candidate.sentence)) added += 1;
        }
        return added;
    }

    async reviewBatchMiningCards(candidates: BatchMiningCardCandidate[], grade: JPDBGrade): Promise<number> {
        let reviewed = 0;
        for (const candidate of candidates) {
            await this.reviewGrade(grade, candidate.card, candidate.sentence, {
                deckId: defaultJpdbDeckId(this.options.getSettings()),
                suppressToast: true,
            });
            reviewed += 1;
        }
        return reviewed;
    }

    async perform(action: string | undefined, button: HTMLButtonElement, card: JPDBCard, sentence?: string, context: CardActionContext = {}): Promise<boolean> {
        const studyAction = this.performStudyAction(action, button, sentence);
        if (studyAction !== undefined) return await studyAction;

        const readerAction = this.performReaderAction(action, card);
        if (readerAction !== undefined) return await readerAction;

        const miningAction = await this.performMiningAction(action, button, card, sentence, context);
        if (miningAction !== undefined) return miningAction;

        return Boolean(action);
    }

    private async addBatchMiningCard(card: JPDBCard, sentence: string | undefined): Promise<boolean> {
        const settings = this.options.getSettings();
        const candidate = isApiMiningEnabled(settings) ? this.apiProviderForCard(card, settings) : null;
        const provider = candidate && isApiSrsProviderEnabled(settings, candidate.id) ? candidate : null;
        if (provider?.hasApiKey) {
            const deckId = provider.id === 'jiten'
                ? String((await this.options.jiten?.listStudyDecks?.().catch(() => []))?.[0]?.id ?? '')
                : provider.selectedDeckId(settings.miningDeck, settings);
            if (!deckId) throw userFacingError(provider.id === 'jiten' ? 'chooseJitenStudyDeck' : provider.addApiKeyRequiredKey);
            await provider.addToDeck(deckId, card, sentence, { sourceTitle: document.title });
            this.notifyApiCardStateChanged(card);
            if (shouldMineAnkiAlongsideApi(settings)) await this.addToAnkiForBatch(card, sentence, settings.ankiDeck);
            return true;
        }
        if (settings.ankiEnabled) return await this.addToAnkiForBatch(card, sentence, settings.ankiDeck);
        throw userFacingError('batchMiningNoDestination');
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
            'jiten-audio': () => this.performJitenAudio(button, sentence),
            'bunpro-audio': () => this.performBunproAudio(button, sentence),
            'wanikani-audio': () => this.performWanikaniAudio(button),
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
        await renderStudyToolResult(button, action, sentence, undefined, settings.interfaceLanguage, {
            audioEnabled: settings.audioEnabled,
            outputLanguage: outputLanguageOf(settings),
        });
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

    private async performJitenAudio(button: HTMLButtonElement, sentence?: string): Promise<boolean> {
        const fallbackSentence = button.dataset.studySentence?.trim() || sentence;
        const audioUrls = jitenAudioUrlsForButton(button, this.options.getSettings());
        if (this.options.playMediaUrl) {
            for (const audioUrl of audioUrls) {
                try {
                    const played = await this.options.playMediaUrl(audioUrl);
                    if (played !== false) return false;
                } catch {
                    // Try the next Jiten URL before falling back to sentence TTS.
                }
            }
        }
        await this.options.playSentenceAudio(fallbackSentence);
        return false;
    }

    private async performBunproAudio(button: HTMLButtonElement, sentence?: string): Promise<boolean> {
        const fallbackSentence = button.dataset.studySentence?.trim() || sentence;
        const audioUrl = button.dataset.audioUrl?.trim() ?? '';
        if (audioUrl && this.options.playMediaUrl) {
            try {
                const played = await this.options.playMediaUrl(audioUrl);
                if (played !== false) return false;
            } catch {
                // Bunpro CDN URLs occasionally 403; fall back to sentence TTS.
            }
        }
        await this.options.playSentenceAudio(fallbackSentence);
        return false;
    }

    private async performWanikaniAudio(button: HTMLButtonElement): Promise<boolean> {
        const audioUrl = button.dataset.audioUrl?.trim() ?? '';
        if (!audioUrl || !this.options.playMediaUrl) return false;
        const url = new URL(audioUrl);
        if (url.protocol !== 'https:') throw new Error('Blocked an unsafe WaniKani audio URL.');
        await this.options.playMediaUrl(url.href);
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
        if (action === 'grade-provider-toggle') {
            await this.toggleGradingProvider(card, sentence);
            return false;
        }
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

    // Cycle the popover through the SRS services that can grade this word
    // (JPDB / Jiten, plus Bunpro when the card carries a Bunpro identity) and
    // re-render so the deck and grade buttons act on the chosen service.
    private async toggleGradingProvider(card: JPDBCard, sentence: string | undefined): Promise<void> {
        const settings = this.options.getSettings();
        const current = this.apiProviderForCard(card, settings);
        if (!current?.hasApiKey) return;
        const cycle = apiSrsSwitchableProviderIds(card, settings);
        if (cycle.length < 2) return;
        const next = cycle[(cycle.indexOf(current.id) + 1) % cycle.length];
        if (!next || next === current.id || next === 'yomu-local') return;
        const provider = this.apiProviders(settings).find(p => p.id === next && p.hasApiKey);
        if (!provider) return;
        const target = provider.supportsCard(card)
            ? card
            : await this.resolveProviderCard(card, next);
        if (!target || !provider.supportsCard(target)) return;
        // The jpdb/jiten choice stays the global preference for every word;
        // Bunpro only ever applies per card, via the override below.
        if (next === 'jpdb' || next === 'jiten') this.options.setApiGradingProvider?.(next);
        // Resolving the other service re-parses the word into a fresh card; keep
        // the Bunpro identity on it so the cycle can come back to Bunpro.
        if (target !== card) copyBunproIdentity(card, target);
        target.apiGradingProviderOverride = next;
        // The card's SRS state is a single shared field; refresh the newly chosen
        // service so the status dot and the Never forget / Blacklist pressed-state
        // (and their add-vs-remove decisions) reflect that service, not the old one.
        await this.refreshProviderState(target, next);
        this.options.invalidateCardData?.();
        await this.options.showCard(target, sentence, this.options.getActivePopoverAnchor(), {
            autoPlay: false,
            trigger: this.options.getActivePopoverMode() === 'hover' ? 'hover' : 'modal',
            navigation: 'preserve',
            preservePosition: true,
        });
    }

    private async resolveProviderCard(card: JPDBCard, id: ApiSrsProviderId): Promise<JPDBCard | null> {
        if (id === 'yomu-local') return card;
        try {
            const [tokens = []] = id === 'jiten'
                ? await (this.options.jiten?.parse?.([card.spelling]) ?? Promise.resolve([] as JPDBToken[][]))
                : await this.options.jpdb.parse([card.spelling]);
            return exactCard(card, tokens);
        } catch {
            return null;
        }
    }

    private async refreshProviderState(card: JPDBCard, providerId: ApiSrsProviderId): Promise<void> {
        try {
            if (providerId === 'bunpro' || providerId === 'yomu-local') return;
            if (providerId === 'jiten') await this.options.jiten?.refreshCardState?.(card);
            else await this.options.jpdb.refreshCardState?.(card);
        } catch {
            // Best-effort: the grade still dispatches to the correct word.
        }
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
            bunpro: this.options.srsAdapters?.bunpro,
            wanikani: this.options.srsAdapters?.wanikani,
            yomuLocal: this.options.srsAdapters?.['yomu-local'],
            isJpdbBackedCard: this.options.isJpdbBackedCard,
        }, settings);
    }

    private apiProviderForCard(card: JPDBCard, settings: ReaderSettings = this.options.getSettings()): ApiSrsProviderAdapter | null {
        const supporting = this.apiProviders(settings).filter(provider => provider.supportsCard(card));
        // Mirror apiSrsProviderViewForCard so the dispatched grade always matches
        // the provider the popover displays: per-card override first, then the
        // card's own Bunpro backing, then the user's jpdb/jiten preference. If no
        // key is present, surface the preferred backing provider so the
        // error/status copy matches the toggle.
        const keyed = supporting.filter(provider => provider.hasApiKey);
        const external = keyed.filter(provider => provider.id !== 'yomu-local');
        const overridden = card.apiGradingProviderOverride
            ? external.find(provider => provider.id === card.apiGradingProviderOverride)
            : undefined;
        if (overridden) return overridden;
        const bunpro = external.find(provider => provider.id === 'bunpro');
        if (bunpro) return bunpro;
        if (external.length > 1) {
            const preferred = external.find(provider => provider.id === apiGradingProviderPreference(settings));
            if (preferred) return preferred;
        }
        if (keyed.length) return external[0] ?? keyed[0] ?? null;
        return supporting.find(provider => provider.id === apiGradingProviderPreference(settings)) ?? supporting[0] ?? null;
    }

    private apiProviderForDeckSource(source: ApiSrsDeckSource, card: JPDBCard, settings: ReaderSettings): ApiSrsProviderAdapter | null {
        return this.apiProviders(settings).find(provider => provider.deckSource === source
            && (provider.supportsMiningCard?.(card) ?? provider.supportsCard(card))) ?? null;
    }

    private assertApiProviderActionAllowed(provider: ApiSrsProviderAdapter | null, copyKey: UiCopyKey): asserts provider is ApiSrsProviderAdapter {
        const settings = this.options.getSettings();
        if (!isApiSrsProviderEnabled(settings, provider?.id)) throw userFacingError('apiSrsActionsDisabled');
        if (!provider?.hasApiKey) throw userFacingError(copyKey);
    }

    private assertApiProviderReviewAllowed(provider: ApiSrsProviderAdapter | null, copyKey: UiCopyKey): asserts provider is ApiSrsProviderAdapter {
        const settings = this.options.getSettings();
        if (!settings.enableReviews) throw userFacingError('reviewActionsDisabled');
        this.assertApiProviderActionAllowed(provider, copyKey);
    }

    private async addToSelectedDeck(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, context: CardActionContext): Promise<void> {
        const settings = this.options.getSettings();
        const deck = selectedDeckChoice(button, settings);
        if (deck.source === 'anki') {
            await this.addToAnki(card, sentence, deck.id, context);
            return;
        }

        const provider = this.apiProviderForDeckSource(deck.source, card, settings);
        const fallbackKey = deck.source === 'jiten'
            ? 'jitenAddApiKeyRequired'
            : deck.source === 'bunpro'
                ? 'bunproAddApiKeyRequired'
                : deck.source === 'yomu-local'
                    ? 'yomuLocalSrsDisabled'
                    : 'jpdbAddApiKeyRequired';
        this.assertApiProviderActionAllowed(provider, provider?.addApiKeyRequiredKey ?? fallbackKey);
        const selectedDeckId = provider.selectedDeckId(deck.id, settings);
        if (!selectedDeckId) throw userFacingError(provider.id === 'jiten' ? 'chooseJitenStudyDeck' : provider.addApiKeyRequiredKey);
        await provider.addToDeck(selectedDeckId, card, sentence, { sourceTitle: document.title, sourceUrl: location.href });
        const minedToAnkiToo = shouldMineAnkiAlongsideApi(settings);
        if (minedToAnkiToo) await this.addToAnki(card, sentence, settings.ankiDeck, context);
        // Jiten/JPDB deck APIs cannot store media: when the user captured an
        // image or audio for this mine and no Anki note carries it, say so
        // instead of silently dropping it.
        const miningContext = await Promise.resolve(this.options.resolveMiningContext(card, sentence)).catch(() => null);
        const droppedMedia = provider.id !== 'bunpro' && !minedToAnkiToo && Boolean(miningContext?.imageDataUrl || miningContext?.audioDataUrl);
        const addedToast = uiText(settings.interfaceLanguage, provider.addedToastKey);
        this.options.toast(droppedMedia
            ? `${addedToast} ${uiText(settings.interfaceLanguage, 'apiDeckMediaNotSupported')}`
            : addedToast);
        this.notifyApiCardStateChanged(card);
    }

    private async openAnkiNote(button: HTMLButtonElement): Promise<void> {
        const settings = this.options.getSettings();
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw userFacingError('ankiNoteNotFound');
        await this.options.anki.browseNote(noteId);
        this.options.toast(uiText(settings.interfaceLanguage, 'openedInAnki'));
    }

    private async playAnkiMediaAudio(button: HTMLButtonElement): Promise<void> {
        const filename = button.dataset.ankiMediaName?.trim();
        if (!filename) throw userFacingError('ankiAudioFileNotFound');
        if (!this.options.playMediaUrl) throw userFacingError('ankiAudioPlaybackUnavailable');
        await this.options.playMediaUrl(await this.options.anki.mediaFileDataUrl(filename));
    }

    private async mergeExistingAnkiCard(button: HTMLButtonElement, card: JPDBCard, sentence: string | undefined, actionContext: CardActionContext): Promise<void> {
        const settings = this.options.getSettings();
        const noteId = Number(button.dataset.noteId);
        if (!Number.isFinite(noteId)) throw userFacingError('ankiNoteNotFound');

        const { dictionaryContext, context, wordAudio } = await this.loadAnkiCardAssets(card, sentence, settings);
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
        // Prefer the chosen grading provider when it supports this state so the
        // header toggle decides where Never forget / Blacklist land; otherwise
        // fall back to any provider that backs the card and supports the state.
        const preferred = this.apiProviderForCard(card, settings);
        const provider = preferred?.supportsDeckState(state)
            ? preferred
            : (this.apiProviders(settings).find(candidate => candidate.supportsCard(card) && candidate.supportsDeckState(state)) ?? preferred);
        if (!provider && settings.ankiEnabled && isAnkiDeckState(state) && await this.changeAnkiDeckState(card, state, settings)) return;
        this.assertApiProviderActionAllowed(provider, provider?.deckStateApiKeyRequiredKey ?? 'jpdbDeckStateApiKeyRequired');
        if (!provider.supportsDeckState(state)) throw userFacingError('actionFailed');
        const wasSet = normalizeCardStates(card.cardState).includes(cardStateForApiState(state));
        await provider.setDeckState(card, state, deck);
        const toastKey = state === 'blacklisted' || state === 'never-forget'
            ? (wasSet ? 'removedFromDeck' : 'addedToDeckToast')
            : 'vocabularyStatusUpdated';
        this.options.toast(uiText(settings.interfaceLanguage, toastKey));
        this.notifyApiCardStateChanged(card);
    }

    // Anki has no blacklist/never-forget decks; map blacklist to native card
    // suspension (same effect: never reviewed, dedicated state color) and
    // never-forget to a tag that can also be filtered inside Anki.
    private async changeAnkiDeckState(card: JPDBCard, state: ApiSrsToggleDeckState, settings: ReaderSettings): Promise<boolean> {
        const lookup = await this.options.anki.findExistingCards(card).catch(() => null);
        if (!lookup?.notes.length) return false;
        if (state === 'blacklisted') {
            const cardIds = lookup.notes.flatMap(note => note.cardIds);
            const suspended = lookup.state === 'suspended';
            await this.options.anki.setCardsSuspended(cardIds, !suspended);
            this.options.toast(uiText(settings.interfaceLanguage, suspended ? 'ankiCardsUnsuspended' : 'ankiCardsSuspended'));
            return true;
        }
        const noteIds = lookup.notes.map(note => note.noteId);
        const tagged = lookup.notes.every(note => note.tags?.includes(ANKI_NEVER_FORGET_TAG));
        await this.options.anki.setNotesTag(noteIds, ANKI_NEVER_FORGET_TAG, !tagged);
        this.options.toast(uiText(settings.interfaceLanguage, tagged ? 'ankiNeverForgetTagRemoved' : 'ankiNeverForgetTagAdded'));
        return true;
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

    async reviewGrade(grade: JPDBGrade, card: JPDBCard, sentence?: string, options: { target?: PopoverReviewTargetKind; ankiCardId?: number; deckId?: string; suppressToast?: boolean } = {}): Promise<void> {
        const settings = this.options.getSettings();
        if (!settings.enableReviews) throw userFacingError('reviewActionsDisabled');
        if (options.target === 'both') {
            await this.reviewApiCard(grade, card, sentence, options);
            await this.answerAnkiCard(grade, card, options.ankiCardId);
            return;
        }
        if (options.target === 'jpdb' || options.target === 'jiten' || options.target === 'bunpro' || options.target === 'yomu-local') {
            await this.reviewApiCard(grade, card, sentence, { ...options, providerId: options.target });
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
        throw userFacingError('missingAnkiCardId');
    }

    private async reviewApiCard(grade: JPDBGrade, card: JPDBCard, sentence: string | undefined, options: { deckId?: string; providerId?: ApiSrsProviderId; suppressToast?: boolean }): Promise<void> {
        const settings = this.options.getSettings();
        const provider = options.providerId
            ? this.apiProviders(settings).find(candidate => candidate.id === options.providerId && candidate.supportsCard(card)) ?? null
            : this.apiProviderForCard(card, settings);
        this.assertApiProviderReviewAllowed(provider, provider?.reviewApiKeyRequiredKey ?? 'addJpdbApiKeyReview');
        const states = normalizeCardStates(card.cardState);
        assertReviewableApiCardState(states);
        const result = await provider.reviewCard(card, grade, { sentence, deckId: this.reviewDeckId(options) });
        if (result.addedBeforeReview) {
            if (!options.suppressToast) this.options.toast(uiText(settings.interfaceLanguage, 'addedToDeckAndReviewed'));
        } else if (settings.autoMineOnReview) await this.autoMineReviewedCard(provider, card, sentence, states, settings, options.suppressToast === true);
        this.notifyApiCardStateChanged(card);
    }

    // Jiten Reader parity: optionally add every reviewed word to the mining
    // deck so reviewing doubles as collecting (off by default).
    private async autoMineReviewedCard(provider: ApiSrsProviderAdapter, card: JPDBCard, sentence: string | undefined, states: string[], settings: ReaderSettings, suppressToast = false): Promise<void> {
        if (!states.includes('not-in-deck')) return;
        try {
            const deckId = provider.selectedDeckId(this.reviewDeckId({}), settings);
            if (!deckId) return;
            await provider.addToDeck(deckId, card, sentence, { sourceTitle: document.title });
            if (!suppressToast) this.options.toast(uiText(settings.interfaceLanguage, 'addedToDeckAndReviewed'));
        } catch {
            // Auto-mining is a convenience; the review itself already succeeded.
        }
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

    private async addToAnkiForBatch(card: JPDBCard, sentence: string | undefined, deckName?: string): Promise<boolean> {
        const settings = this.options.getSettings();
        const existing = await this.options.anki.findExistingCards(card);
        if (existing.primary) return false;
        const prepared = await this.prepareAnkiAdd(card, sentence, deckName, settings, {});
        const noteId = await this.addPreparedAnkiCard(card, prepared);
        if (noteId === 'duplicate' || noteId === null) return false;
        this.notifyAnkiStatusChanged(card);
        return true;
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
        const { dictionaryContext, context, wordAudio } = await this.loadAnkiCardAssets(card, sentence, settings);
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

    private async loadAnkiCardAssets(card: JPDBCard, sentence: string | undefined, settings: ReaderSettings): Promise<{
        dictionaryContext: Awaited<ReturnType<CardActionController['loadAnkiDictionaryContext']>>;
        context: MiningContext;
        wordAudio: ResolvedAnkiWordAudio | null;
    }> {
        const [dictionaryContext, context, wordAudio] = await Promise.all([
            this.loadAnkiDictionaryContext(card, settings),
            this.options.resolveMiningContext(card, sentence),
            resolveAnkiWordAudio(card, settings).catch(() => null),
        ]);
        return { dictionaryContext, context, wordAudio };
    }

    private toastMobileAnkiHandoff(settings: ReaderSettings): void {
        this.options.toast(uiText(settings.interfaceLanguage, 'openedMobileAnkiHandoff'));
    }

    private notifyAnkiStatusChanged(card: JPDBCard): void {
        this.options.invalidateCardData?.();
        this.options.onAnkiStatusChanged?.(card);
    }

    // After an API-side state change (review, mining, blacklist/never-forget),
    // rendered page words for the same card recolor immediately instead of
    // waiting for a rescan.
    private notifyApiCardStateChanged(card: JPDBCard): void {
        this.options.invalidateCardData?.();
        this.options.onApiCardStateChanged?.(card);
        // Cross-tab mutation bus: other tabs recolor their rendered
        // occurrences of this card without a rescan.
        publishCardStateSignal(card);
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
        return targetUsesCharacterDictionary() && settings.localDictionariesEnabled && settings.localDictionaryShowKanji
            ? this.options.dictionaries.lookupKanji(card.spelling, settings.localDictionaryMaxResults, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

    private lookupAnkiLocalMeta(card: JPDBCard, settings: ReaderSettings) {
        return settings.localDictionariesEnabled
            ? this.options.dictionaries.lookupTermMeta(card.spelling, 12, settings.dictionaryPreferences).catch(() => [])
            : Promise.resolve([]);
    }

}

function jitenAudioUrlsFromButton(button: HTMLButtonElement): string[] {
    const raw = button.dataset.jitenAudioUrls?.trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return uniqueTrimmed(parsed.filter((value): value is string => typeof value === 'string'));
    } catch {
        // Older rendered markup should still fall back to sentence TTS if the payload is malformed.
    }
    return [];
}

function jitenAudioUrlsForButton(button: HTMLButtonElement, settings: ReaderSettings): string[] {
    return uniqueTrimmed([
        ...jitenAudioUrlsFromButton(button),
        ...generatedJitenAudioUrlsForButton(button, settings),
    ]);
}

function generatedJitenAudioUrlsForButton(button: HTMLButtonElement, settings: ReaderSettings): string[] {
    const sentenceId = finitePositiveDatasetInteger(button.dataset.jitenSentenceId);
    const voices = jitenTtsVoicesForSettings(settings);
    if (sentenceId !== undefined) return voices.map(voice => jitenSentenceTtsUrl(sentenceId, voice));

    const wordId = finitePositiveDatasetInteger(button.dataset.jitenWordId);
    const readingIndex = finiteNonNegativeDatasetInteger(button.dataset.jitenReadingIndex);
    if (wordId === undefined || readingIndex === undefined) return [];
    return voices.map(voice => jitenWordTtsUrl(wordId, readingIndex, voice));
}

function finitePositiveDatasetInteger(value: string | undefined): number | undefined {
    const parsed = finiteDatasetInteger(value);
    return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function finiteNonNegativeDatasetInteger(value: string | undefined): number | undefined {
    const parsed = finiteDatasetInteger(value);
    return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function finiteDatasetInteger(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueTrimmed(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }
    return result;
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
    const select = button.closest('.jpdb-reader-actions')?.querySelector<HTMLSelectElement>('[data-review-target-select]');
    const option = select?.options[select.selectedIndex] ?? null;
    const target = reviewTargetKind(option?.dataset.reviewTarget ?? button.dataset.reviewTarget);
    const ankiCardId = positiveNumber(option?.dataset.ankiCardId ?? button.dataset.ankiCardId);
    return { kind: target, ankiCardId };
}

function exactCard(source: JPDBCard, tokens: JPDBToken[]): JPDBCard | null {
    const s = source.spelling.trim();
    const r = source.reading.trim();
    return tokens.find(({ card }) => card.spelling.trim() === s && (!r || card.reading.trim() === r))?.card
        ?? tokens.find(({ card }) => card.spelling.trim() === s)?.card
        ?? null;
}

function copyBunproIdentity(source: JPDBCard, target: JPDBCard): void {
    if (source.bunproReviewId) target.bunproReviewId = source.bunproReviewId;
    if (source.bunproReviewableId) target.bunproReviewableId = source.bunproReviewableId;
    if (source.bunproReviewableType) target.bunproReviewableType = source.bunproReviewableType;
    if (source.bunproSrsLevel) target.bunproSrsLevel = source.bunproSrsLevel;
    if (source.bunproReviewSessionId) target.bunproReviewSessionId = source.bunproReviewSessionId;
    if (source.bunproReviewInputMode) target.bunproReviewInputMode = source.bunproReviewInputMode;
    if (source.bunproReviewEndpoint) target.bunproReviewEndpoint = source.bunproReviewEndpoint;
}

function reviewTargetKind(value: string | undefined): PopoverReviewTargetKind | undefined {
    if (value === 'both' || value === 'anki') return value;
    if (value === 'jpdb' || value === 'jiten' || value === 'bunpro' || value === 'yomu-local') return value;
    return undefined;
}

function isAnkiDeckState(state: ApiSrsDeckState): state is ApiSrsToggleDeckState {
    return state === 'never-forget' || state === 'blacklisted';
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
    if (button.dataset.deckSource === 'bunpro') return 'bunpro';
    if (button.dataset.deckSource === 'yomu-local') return 'yomu-local';
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
    if (source === 'yomu-local') return 'yomu-local';
    return defaultJpdbDeckId(settings);
}

function defaultAnkiDeckName(settings: ReaderSettings): string {
    return settings.ankiDeck || 'よむ';
}

function defaultJpdbDeckId(settings: ReaderSettings): string {
    return settings.miningDeck.trim() || 'forq';
}
