import { normalizeCardStates } from './state';
import { jpdbDeckLabel } from './deck-choice';
import type { JitenApiClient } from '../dictionaries/jiten';
import type { JpdbClient } from '../jpdb/jpdb';
import type { UiCopyKey } from '../app/i18n';
import type { ApiDeck, JPDBCard, JPDBDeck, JPDBGrade, ReaderSettings } from '../app/types';

export type ApiSrsProviderId = 'jpdb' | 'jiten';
export type ApiSrsDeckSource = ApiSrsProviderId;
export type ApiSrsDeckState = 'never-forget' | 'blacklisted';

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

export function apiSrsProviderViewForCard(
    card: JPDBCard,
    settings: ReaderSettings,
    isJpdbBackedCard: (card: JPDBCard) => boolean,
): ApiSrsProviderView | null {
    if (isJitenBackedCard(card)) {
        return {
            id: 'jiten',
            label: 'Jiten',
            deckSource: 'jiten',
            hasApiKey: Boolean(settings.jitenApiKey.trim()),
        };
    }
    if (!isJpdbBackedCard(card)) return null;
    return {
        id: 'jpdb',
        label: 'JPDB',
        deckSource: 'jpdb',
        hasApiKey: Boolean(settings.apiKey.trim()),
    };
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
        hasApiKey: Boolean(settings.apiKey.trim()),
        addApiKeyRequiredKey: 'jpdbAddApiKeyRequired',
        reviewApiKeyRequiredKey: 'addJpdbApiKeyReview',
        deckStateApiKeyRequiredKey: 'jpdbDeckStateApiKeyRequired',
        addedToastKey: 'addedToJpdb',
        supportsCard: isJpdbBackedCard,
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
        hasApiKey: Boolean(settings.jitenApiKey.trim()),
        addApiKeyRequiredKey: 'jitenAddApiKeyRequired',
        reviewApiKeyRequiredKey: 'addJitenApiKeyReview',
        deckStateApiKeyRequiredKey: 'jitenDeckStateApiKeyRequired',
        addedToastKey: 'addedToJiten',
        supportsCard: isJitenBackedCard,
        selectedDeckId: selectedJitenDeckId,
        selectedDeckLabel: (_current, data) => jitenDeckLabel((data.jitenDecks ?? [])[0]),
        addToDeck: async (deckId, card, sentence, context) => {
            await jiten.addToStudyDeck(selectedJitenDeckId(deckId), card, sentence, context?.sourceTitle);
        },
        reviewCard: async (card, grade) => {
            await jiten.reviewCard(card, grade);
            return {};
        },
        setDeckState: async (card, state) => {
            const jitenState = state === 'blacklisted' ? 'blacklist' : 'neverForget';
            const action = normalizeCardStates(card.cardState).includes(state) ? 'remove' : 'add';
            await jiten.setVocabularyState(card, jitenState, action);
        },
    };
}

export function isJitenBackedCard(card: JPDBCard): boolean {
    return card.source === 'jiten'
        || (finitePositiveInteger(card.jitenWordId) !== undefined
            && finiteNonNegativeInteger(card.jitenReadingIndex) !== undefined);
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
