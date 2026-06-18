import { normalizeCardStates } from './state';
import { jpdbDeckLabel } from './deck-choice';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import type { JitenApiClient, JitenVocabularyDeckState } from '../dictionaries/jiten';
import type { JpdbClient } from '../jpdb/jpdb';
import type { UiCopyKey } from '../app/i18n';
import type { ApiDeck, CardState, JPDBCard, JPDBDeck, JPDBGrade, ReaderSettings } from '../app/types';

export type ApiSrsProviderId = 'jpdb' | 'jiten';
export type ApiSrsDeckSource = ApiSrsProviderId;
export type ApiSrsToggleDeckState = 'never-forget' | 'blacklisted';
export type ApiSrsDeckState = ApiSrsToggleDeckState | 'mining' | 'suspended' | 'forgotten';

export interface ApiSrsProviderView {
    id: ApiSrsProviderId;
    label: string;
    deckSource: ApiSrsDeckSource;
    hasApiKey: boolean;
}

export interface ApiSrsProviderReviewResult {
    addedBeforeReview?: boolean;
}

export interface ApiSrsProviderAdapter extends ApiSrsProviderView {
    addApiKeyRequiredKey: UiCopyKey;
    reviewApiKeyRequiredKey: UiCopyKey;
    deckStateApiKeyRequiredKey: UiCopyKey;
    addedToastKey: UiCopyKey;
    supportsCard(card: JPDBCard): boolean;
    supportsDeckState(state: ApiSrsDeckState): boolean;
    selectedDeckId(deckId: string, settings: ReaderSettings): string;
    selectedDeckLabel(settings: ReaderSettings, data: ApiSrsProviderDeckData): string;
    addToDeck(deckId: string, card: JPDBCard, sentence?: string, context?: ApiSrsProviderActionContext): Promise<void>;
    reviewCard(card: JPDBCard, grade: JPDBGrade, options?: ApiSrsProviderReviewOptions): Promise<ApiSrsProviderReviewResult>;
    setDeckState(card: JPDBCard, state: ApiSrsDeckState, deckId: string): Promise<void>;
}

export interface ApiSrsProviderDeckData {
    jpdbDecks: JPDBDeck[];
    jitenDecks?: ApiDeck[];
}

export interface ApiSrsProviderActionContext {
    sourceTitle?: string;
}

export interface ApiSrsProviderReviewOptions {
    sentence?: string;
    deckId?: string;
}

export interface ApiSrsProviderAdapterOptions {
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
    isJpdbBackedCard: (card: JPDBCard) => boolean;
}

export interface ApiSrsProviderAvailability {
    jpdb: boolean;
    jiten: boolean;
}

// The grading provider the popover toggle prefers. Only meaningful when both
// API keys are set and the card can be graded by both; otherwise the card's
// own backing provider wins.
export function apiGradingProviderPreference(settings: ReaderSettings): ApiSrsProviderId {
    return settings.apiGradingProvider === 'jiten' ? 'jiten' : 'jpdb';
}

// Which providers can actually grade this card: a configured key AND the card
// carrying that provider's identity (jpdb vid / jiten word id). Page words are
// enriched with the jiten identity during lookup so a word present in both
// services reports both available.
export function apiSrsProviderAvailability(
    card: JPDBCard,
    settings: ReaderSettings,
    isJpdbBackedCard: (card: JPDBCard) => boolean,
): ApiSrsProviderAvailability {
    return {
        jpdb: hasJpdbApiCredential(settings) && isJpdbBackedCard(card),
        jiten: hasJitenApiCredential(settings) && isJitenBackedCard(card),
    };
}

function apiSrsProviderView(id: ApiSrsProviderId, settings: ReaderSettings): ApiSrsProviderView {
    return id === 'jiten'
        ? { id: 'jiten', label: 'Jiten', deckSource: 'jiten', hasApiKey: hasJitenApiCredential(settings) }
        : { id: 'jpdb', label: 'JPDB', deckSource: 'jpdb', hasApiKey: hasJpdbApiCredential(settings) };
}

export function apiSrsProviderViewForCard(
    card: JPDBCard,
    settings: ReaderSettings,
    isJpdbBackedCard: (card: JPDBCard) => boolean,
): ApiSrsProviderView | null {
    const jpdbBacked = isJpdbBackedCard(card);
    const jitenBacked = isJitenBackedCard(card);
    const jpdbUsable = jpdbBacked && hasJpdbApiCredential(settings);
    const jitenUsable = jitenBacked && hasJitenApiCredential(settings);
    // Both services can grade this word and both keys are set → follow the
    // toggle. Otherwise prefer whichever service has a usable key (jpdb-first, to
    // match the action controller). A word may be jiten-backed via keyless
    // enrichment, so the fallback must be gated on the key actually being set —
    // never drop a gradable JPDB word for a keyless Jiten view.
    if (jpdbUsable && jitenUsable) return apiSrsProviderView(apiGradingProviderPreference(settings), settings);
    if (jpdbUsable) return apiSrsProviderView('jpdb', settings);
    if (jitenUsable) return apiSrsProviderView('jiten', settings);
    // Neither key is usable: surface the backing provider for the status label
    // only (no grading UI renders without a key).
    if (jpdbBacked) return apiSrsProviderView('jpdb', settings);
    if (jitenBacked) return apiSrsProviderView('jiten', settings);
    return null;
}

export function isApiMiningEnabled(settings: ReaderSettings): boolean {
    return settings.jpdbMiningEnabled;
}

export function shouldMineAnkiAlongsideApi(settings: ReaderSettings): boolean {
    return settings.ankiEnabled && settings.ankiMineWithJpdb;
}

export function createApiSrsProviderAdapters(options: ApiSrsProviderAdapterOptions, settings: ReaderSettings): ApiSrsProviderAdapter[] {
    const providers: ApiSrsProviderAdapter[] = [createJpdbSrsProviderAdapter(options.jpdb, options.isJpdbBackedCard, settings)];
    if (options.jiten) providers.push(createJitenSrsProviderAdapter(options.jiten, settings));
    return providers;
}

function createJpdbSrsProviderAdapter(
    jpdb: JpdbClient,
    isJpdbBackedCard: (card: JPDBCard) => boolean,
    settings: ReaderSettings,
): ApiSrsProviderAdapter {
    return {
        id: 'jpdb',
        label: 'JPDB',
        deckSource: 'jpdb',
        hasApiKey: hasJpdbApiCredential(settings),
        addApiKeyRequiredKey: 'jpdbAddApiKeyRequired',
        reviewApiKeyRequiredKey: 'addJpdbApiKeyReview',
        deckStateApiKeyRequiredKey: 'jpdbDeckStateApiKeyRequired',
        addedToastKey: 'addedToJpdb',
        supportsCard: isJpdbBackedCard,
        supportsDeckState: state => state === 'never-forget' || state === 'blacklisted',
        selectedDeckId: selectedJpdbDeckId,
        selectedDeckLabel: (current, data) => jpdbDeckLabel(current, current.miningDeck.trim() || 'forq', data.jpdbDecks),
        addToDeck: async (deckId, card, sentence) => {
            const targetDeck = selectedJpdbDeckId(deckId, settings);
            await jpdb.addToDeck(targetDeck, card, sentence);
            if (shouldAlsoAddToForq(settings, targetDeck)) await jpdb.addToDeck('forq', card, sentence);
        },
        reviewCard: async (card, grade, reviewOptions = {}) => {
            const states = normalizeCardStates(card.cardState);
            const wasNotInDeck = states.includes('not-in-deck');
            if (wasNotInDeck) await jpdb.addToDeck(reviewOptions.deckId || defaultJpdbDeckId(settings), card, reviewOptions.sentence);
            await jpdb.reviewCard(card, grade);
            return { addedBeforeReview: wasNotInDeck };
        },
        setDeckState: async (card, state, deckId) => {
            if (state !== 'blacklisted' && state !== 'never-forget') return;
            if (normalizeCardStates(card.cardState).includes(state)) {
                await jpdb.removeFromDeck(deckId, card);
            } else {
                await jpdb.addToDeck(deckId, card);
            }
        },
    };
}

function createJitenSrsProviderAdapter(jiten: JitenApiClient, settings: ReaderSettings): ApiSrsProviderAdapter {
    return {
        id: 'jiten',
        label: 'Jiten',
        deckSource: 'jiten',
        hasApiKey: hasJitenApiCredential(settings),
        addApiKeyRequiredKey: 'jitenAddApiKeyRequired',
        reviewApiKeyRequiredKey: 'addJitenApiKeyReview',
        deckStateApiKeyRequiredKey: 'jitenDeckStateApiKeyRequired',
        addedToastKey: 'addedToJiten',
        supportsCard: isJitenBackedCard,
        supportsDeckState: () => true,
        selectedDeckId: selectedJitenDeckId,
        selectedDeckLabel: (_current, data) => jitenDeckLabel((data.jitenDecks ?? [])[0]),
        addToDeck: async (deckId, card, sentence, context) => {
            await jiten.addToStudyDeck(selectedJitenDeckId(deckId), card, sentence, context?.sourceTitle);
            await refreshJitenCardState(jiten, card);
        },
        reviewCard: async (card, grade) => {
            await jiten.reviewCard(card, grade);
            // JPDB refreshes card state inside reviewCard; mirror it so page
            // words and the popover recolor from the real post-review state.
            await refreshJitenCardState(jiten, card);
            return {};
        },
        setDeckState: async (card, state) => {
            const jitenState = jitenVocabularyStateForApiState(state);
            const currentState = cardStateForApiState(state);
            const action = currentState && normalizeCardStates(card.cardState).includes(currentState) ? 'remove' : 'add';
            await jiten.setVocabularyState(card, jitenState, action);
            await refreshJitenCardState(jiten, card);
        },
    };
}

async function refreshJitenCardState(jiten: JitenApiClient, card: JPDBCard): Promise<void> {
    if (typeof jiten.refreshCardState !== 'function') return;
    await jiten.refreshCardState(card).catch(() => undefined);
}

export function isJitenBackedCard(card: JPDBCard): boolean {
    return card.source === 'jiten'
        || (finitePositiveInteger(card.jitenWordId) !== undefined
            && finiteNonNegativeInteger(card.jitenReadingIndex) !== undefined);
}

function jitenVocabularyStateForApiState(state: ApiSrsDeckState): JitenVocabularyDeckState {
    if (state === 'blacklisted') return 'blacklist';
    if (state === 'never-forget') return 'neverForget';
    if (state === 'suspended') return 'suspend';
    if (state === 'forgotten') return 'forget';
    return 'mining';
}

export function cardStateForApiState(state: ApiSrsDeckState): CardState {
    if (state === 'blacklisted') return 'blacklisted';
    if (state === 'never-forget') return 'never-forget';
    if (state === 'suspended') return 'suspended';
    if (state === 'forgotten') return 'not-in-deck';
    return 'in-deck';
}

function finitePositiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function finiteNonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function defaultJpdbDeckId(settings: ReaderSettings): string {
    return settings.miningDeck.trim() || 'forq';
}

function selectedJpdbDeckId(deckId: string, settings: ReaderSettings): string {
    const selectedDeckId = deckId.trim();
    if (selectedDeckId) return selectedDeckId;
    return defaultJpdbDeckId(settings);
}

function selectedJitenDeckId(deckId: string): string {
    return deckId.trim();
}

function shouldAlsoAddToForq(settings: ReaderSettings, targetDeck: string): boolean {
    return settings.addToForq && targetDeck !== 'forq';
}

function jitenDeckLabel(deck: { name: string } | undefined): string {
    return deck?.name ? `Jiten: ${deck.name}` : 'Jiten';
}
