import { normalizeCardStates } from './state';
import { jpdbDeckLabel } from './deck-choice';
import { hasBunproFrontendCredential, hasJitenApiCredential, hasJpdbApiCredential, hasWanikaniApiCredential, isBunproFrontendCredentialExpired } from '../settings/api-credential';
import type { JitenApiClient, JitenVocabularyDeckState } from '../dictionaries/jiten';
import type { JpdbClient } from '../jpdb/jpdb';
import { uiText, type UiCopyKey } from '../app/i18n';
import type { ApiDeck, CardState, JPDBCard, JPDBDeck, JPDBGrade, ReaderSettings } from '../app/types';
import { isLocalYomuSrsStorageError } from '../srs/local-yomu';
import type {
    YomuSrsAdapter,
    YomuSrsMiningRequest,
    YomuSrsReviewable,
    YomuSrsReviewableKind,
} from '../srs/types';
import { applyYomuLocalReviewableToCard } from '../srs/local-yomu-state';
import { ACADEMY_SRS_LABEL } from '../app/constants';
import { activeLearningTargetLanguage } from '../languages';

export type ApiSrsProviderId = 'jpdb' | 'jiten' | 'bunpro' | 'wanikani' | 'yomu-local';
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
    supportsMiningCard?(card: JPDBCard): boolean;
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
    sourceUrl?: string;
}

export interface ApiSrsProviderReviewOptions {
    sentence?: string;
    deckId?: string;
}

export interface ApiSrsProviderAdapterOptions {
    jpdb: JpdbClient;
    jiten?: JitenApiClient;
    bunpro?: YomuSrsAdapter;
    wanikani?: YomuSrsAdapter;
    yomuLocal?: YomuSrsAdapter;
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
    if (settings.apiGradingProvider === 'bunpro') return 'bunpro';
    return settings.apiGradingProvider === 'jiten' ? 'jiten' : 'jpdb';
}

// The providers the popover ⇄ toggle can cycle through for this card. jpdb and
// jiten are switchable on a key alone (the toggle re-parses the word to resolve
// the other service's identity), but Bunpro grades only its own reviews, so it
// joins the cycle only when the card already carries a Bunpro identity. Bunpro
// grammar/sentence cards are not words — re-parsing them into a jpdb/jiten
// vocab card cannot work, so they stay Bunpro-only.
export function apiSrsSwitchableProviderIds(card: JPDBCard, settings: ReaderSettings): ApiSrsProviderId[] {
    // A Bunpro queue item belongs to one active server review session and may
    // change id/kind after a grade. Keep that obligation exclusive; duplicate
    // JPDB/Jiten/Anki obligations appear as their own Study cards.
    if (isBunproUsableCard(card, settings)) return ['bunpro'];
    // A WaniKani due assignment is a real WaniKani review obligation; grading
    // it elsewhere would desync WaniKani's own SRS schedule, so it is exclusive
    // the same way a Bunpro session is.
    if (isWanikaniUsableCard(card, settings)) return ['wanikani'];
    const ids: ApiSrsProviderId[] = [];
    const wordLike = !card.bunproReviewableType || card.bunproReviewableType === 'vocabulary';
    if (wordLike && hasJpdbApiCredential(settings)) ids.push('jpdb');
    if (wordLike && hasJitenApiCredential(settings)) ids.push('jiten');
    return ids;
}

function isBunproUsableCard(card: JPDBCard, settings: ReaderSettings): boolean {
    return isBunproGradeableCard(card)
        && hasBunproFrontendCredential(settings)
        && !isBunproFrontendCredentialExpired(settings);
}

function isWanikaniUsableCard(card: JPDBCard, settings: ReaderSettings): boolean {
    return isWanikaniGradeableCard(card) && settings.wanikaniReviewEnabled && hasWanikaniApiCredential(settings);
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
    if (id === 'yomu-local') {
        return {
            id: 'yomu-local',
            label: ACADEMY_SRS_LABEL,
            deckSource: 'yomu-local',
            hasApiKey: settings.yomuLocalSrsEnabled,
        };
    }
    if (id === 'bunpro') {
        return {
            id: 'bunpro',
            label: 'Bunpro',
            deckSource: 'bunpro',
            hasApiKey: hasBunproFrontendCredential(settings) && !isBunproFrontendCredentialExpired(settings),
        };
    }
    if (id === 'wanikani') {
        return {
            id: 'wanikani',
            label: 'WaniKani',
            deckSource: 'wanikani',
            hasApiKey: settings.wanikaniReviewEnabled && hasWanikaniApiCredential(settings),
        };
    }
    return id === 'jiten'
        ? { id: 'jiten', label: 'Jiten', deckSource: 'jiten', hasApiKey: hasJitenApiCredential(settings) }
        : { id: 'jpdb', label: 'JPDB', deckSource: 'jpdb', hasApiKey: hasJpdbApiCredential(settings) };
}

// fallow-ignore-next-line complexity
export function apiSrsProviderViewForCard(
    card: JPDBCard,
    settings: ReaderSettings,
    isJpdbBackedCard: (card: JPDBCard) => boolean,
): ApiSrsProviderView | null {
    const jpdbBacked = isJpdbBackedCard(card);
    const jitenBacked = isJitenBackedCard(card);
    const bunproBacked = isBunproBackedCard(card);
    const wanikaniBacked = isWanikaniBackedCard(card);
    const jpdbUsable = jpdbBacked && hasJpdbApiCredential(settings);
    const jitenUsable = jitenBacked && hasJitenApiCredential(settings);
    const bunproUsable = isBunproUsableCard(card, settings);
    const wanikaniUsable = isWanikaniUsableCard(card, settings);
    // The popover ⇄ toggle stores its choice on the card so a Bunpro-backed
    // card can grade to another usable service (and back) without flipping the
    // global preference for every other word.
    const override = card.apiGradingProviderOverride;
    if (override === 'jpdb' && jpdbUsable) return apiSrsProviderView('jpdb', settings);
    if (override === 'jiten' && jitenUsable) return apiSrsProviderView('jiten', settings);
    if (override === 'bunpro' && bunproUsable) return apiSrsProviderView('bunpro', settings);
    if (wanikaniUsable) return apiSrsProviderView('wanikani', settings);
    if (bunproUsable) return apiSrsProviderView('bunpro', settings);
    // Both services can grade this word and both keys are set -> follow the
    // toggle. Otherwise prefer whichever service has a usable key. A word may be
    // jiten-backed via keyless enrichment, so the fallback must be gated on the
    // key actually being set. A stored 'bunpro' preference can never grade a
    // card without a Bunpro identity, so it falls back to the jiten default.
    if (jpdbUsable && jitenUsable) {
        const preferred = apiGradingProviderPreference(settings);
        return apiSrsProviderView(preferred === 'jpdb' ? 'jpdb' : 'jiten', settings);
    }
    if (jpdbUsable) return apiSrsProviderView('jpdb', settings);
    if (jitenUsable) return apiSrsProviderView('jiten', settings);
    // Local-first fallback: when no external SRS can act on this word, Yomu
    // still lets the learner mine/review in this browser without an account.
    // Keep expired/disabled Bunpro-backed cards labelled as Bunpro so token
    // expiry remains visible instead of being hidden behind the local fallback.
    if (!bunproBacked && !wanikaniBacked && settings.yomuLocalSrsEnabled) return apiSrsProviderView('yomu-local', settings);
    // Neither key is usable: surface the backing provider for the status label
    // only (no grading UI renders without a key).
    if (jpdbBacked) return apiSrsProviderView('jpdb', settings);
    if (jitenBacked) return apiSrsProviderView('jiten', settings);
    if (bunproBacked) return { ...apiSrsProviderView('bunpro', settings), hasApiKey: false };
    if (wanikaniBacked) return { ...apiSrsProviderView('wanikani', settings), hasApiKey: false };
    return null;
}

export function isApiMiningEnabled(settings: ReaderSettings): boolean {
    return settings.jpdbMiningEnabled || settings.bunproMiningEnabled || settings.yomuLocalSrsEnabled;
}

export function isApiSrsProviderEnabled(settings: ReaderSettings, providerId: ApiSrsProviderId | undefined): boolean {
    if (providerId === 'yomu-local') return settings.yomuLocalSrsEnabled;
    if (providerId === 'wanikani') return settings.wanikaniReviewEnabled;
    return providerId === 'bunpro' ? settings.bunproMiningEnabled : settings.jpdbMiningEnabled;
}

export function shouldMineAnkiAlongsideApi(settings: ReaderSettings): boolean {
    return settings.ankiEnabled && settings.ankiMineWithJpdb;
}

export function createApiSrsProviderAdapters(options: ApiSrsProviderAdapterOptions, settings: ReaderSettings): ApiSrsProviderAdapter[] {
    const jpdbProvider = createJpdbSrsProviderAdapter(options.jpdb, options.isJpdbBackedCard, settings);
    const providers: ApiSrsProviderAdapter[] = options.jiten
        ? [createJitenSrsProviderAdapter(options.jiten, settings), jpdbProvider]
        : [jpdbProvider];
    if (options.bunpro) providers.unshift(createBunproSrsProviderAdapter(options.bunpro, settings));
    if (options.wanikani) providers.unshift(createWanikaniSrsProviderAdapter(options.wanikani, settings));
    if (options.yomuLocal) providers.push(createYomuLocalSrsProviderAdapter(options.yomuLocal, settings));
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

function createBunproSrsProviderAdapter(adapter: YomuSrsAdapter, settings: ReaderSettings): ApiSrsProviderAdapter {
    return {
        id: 'bunpro',
        label: 'Bunpro',
        deckSource: 'bunpro',
        hasApiKey: settings.bunproMiningEnabled && adapter.hasCredential(),
        addApiKeyRequiredKey: 'bunproAddApiKeyRequired',
        reviewApiKeyRequiredKey: 'addBunproApiKeyReview',
        deckStateApiKeyRequiredKey: 'bunproAddApiKeyRequired',
        addedToastKey: 'addedToBunpro',
        supportsCard: isBunproGradeableCard,
        supportsMiningCard: isBunproMiningCard,
        supportsDeckState: () => false,
        selectedDeckId: () => 'bunpro',
        selectedDeckLabel: () => 'Bunpro',
        addToDeck: async (_deckId, card, sentence, context) => {
            await adapter.mine(bunproMiningRequestFromCard(card, sentence, context));
        },
        reviewCard: async (card, grade, reviewOptions = {}) => {
            const result = await adapter.review({
                card: bunproReviewableFromCard(card),
                grade,
                sentence: reviewOptions.sentence,
            });
            if (result.card) applyBunproReviewableToCard(card, result.card);
            return {};
        },
        setDeckState: async () => undefined,
    };
}

function createWanikaniSrsProviderAdapter(adapter: YomuSrsAdapter, settings: ReaderSettings): ApiSrsProviderAdapter {
    return {
        id: 'wanikani',
        label: 'WaniKani',
        deckSource: 'wanikani',
        hasApiKey: settings.wanikaniReviewEnabled && adapter.hasCredential(),
        addApiKeyRequiredKey: 'wanikaniAddApiKeyRequired',
        reviewApiKeyRequiredKey: 'addWanikaniApiKeyReview',
        deckStateApiKeyRequiredKey: 'wanikaniAddApiKeyRequired',
        addedToastKey: 'addedToWanikani',
        supportsCard: isWanikaniGradeableCard,
        // WaniKani has no API to add arbitrary external subjects: only its own
        // due assignments can ever be reviewed from Yomu.
        supportsMiningCard: () => false,
        supportsDeckState: () => false,
        selectedDeckId: () => 'wanikani',
        selectedDeckLabel: () => 'WaniKani',
        addToDeck: async () => {
            throw new Error('WaniKani has no API to add arbitrary words; open the word on wanikani.com instead.');
        },
        reviewCard: async (card, grade) => {
            const result = await adapter.review({ card: wanikaniReviewableFromCard(card), grade });
            if (result.card) applyWanikaniReviewableToCard(card, result.card);
            return {};
        },
        setDeckState: async () => undefined,
    };
}

function isWanikaniBackedCard(card: JPDBCard): boolean {
    return card.source === 'wanikani' || card.reviewSource === 'wanikani-api' || Boolean(card.wanikaniSubjectId);
}

function isWanikaniGradeableCard(card: JPDBCard): boolean {
    return isWanikaniBackedCard(card) && typeof card.wanikaniAssignmentId === 'number' && card.wanikaniAssignmentId > 0;
}

function wanikaniReviewableFromCard(card: JPDBCard): YomuSrsReviewable {
    const expression = card.spelling.trim();
    const reading = card.reading.trim();
    return {
        providerId: 'wanikani',
        providerCardId: String(card.wanikaniAssignmentId ?? ''),
        providerReviewableId: card.wanikaniSubjectId !== undefined ? String(card.wanikaniSubjectId) : undefined,
        kind: card.wanikaniSubjectType === 'kanji' ? 'kanji' : card.wanikaniSubjectType === 'radical' ? 'unknown' : 'vocabulary',
        expression,
        reading,
        meanings: card.meanings,
        state: card.cardState,
        srsLevel: card.wanikaniSrsStage,
        dueAt: card.dueAt,
        lastReviewAt: card.lastReviewAt,
        raw: card,
    };
}

function applyWanikaniReviewableToCard(card: JPDBCard, reviewable: YomuSrsReviewable): void {
    if (reviewable.state.length) card.cardState = reviewable.state;
    if (reviewable.dueAt !== undefined) card.dueAt = reviewable.dueAt;
    if (reviewable.srsLevel) card.wanikaniSrsStage = reviewable.srsLevel;
}

export function isBunproMiningCard(card: JPDBCard): boolean {
    return Boolean(card.spelling.trim()) && card.bunproReviewableType !== 'sentence';
}

// JPDB/Jiten refresh the card state after a review so the popover status dot
// recolors; mirror that for Bunpro from the review response itself (Bunpro has
// no cheap per-word state lookup to re-query).
function applyBunproReviewableToCard(card: JPDBCard, reviewable: YomuSrsReviewable): void {
    if (reviewable.state.length) card.cardState = reviewable.state;
    if (reviewable.dueAt !== undefined) card.dueAt = reviewable.dueAt;
    if (reviewable.lastReviewAt !== undefined) card.lastReviewAt = reviewable.lastReviewAt;
    if (reviewable.srsLevel) card.bunproSrsLevel = reviewable.srsLevel;
    if (reviewable.reviewSession) {
        card.bunproReviewSessionId = reviewable.reviewSession.id;
        card.bunproReviewInputMode = reviewable.reviewSession.inputMode;
        card.bunproReviewEndpoint = reviewable.reviewSession.endpoint;
    }
}

function createYomuLocalSrsProviderAdapter(adapter: YomuSrsAdapter, settings: ReaderSettings): ApiSrsProviderAdapter {
    return {
        id: 'yomu-local',
        label: ACADEMY_SRS_LABEL,
        deckSource: 'yomu-local',
        hasApiKey: settings.yomuLocalSrsEnabled && adapter.hasCredential(),
        addApiKeyRequiredKey: 'yomuLocalSrsDisabled',
        reviewApiKeyRequiredKey: 'yomuLocalSrsDisabled',
        deckStateApiKeyRequiredKey: 'yomuLocalSrsDisabled',
        addedToastKey: 'addedToYomuLocal',
        supportsCard: card => Boolean(card.spelling.trim()),
        supportsDeckState: () => false,
        selectedDeckId: () => 'yomu-local',
        selectedDeckLabel: () => ACADEMY_SRS_LABEL,
        addToDeck: async (_deckId, card, sentence, context) => {
            const result = await localYomuMutation(
                settings,
                () => adapter.mine(yomuLocalMiningRequestFromCard(card, sentence, context)),
            );
            if (result.card) applyYomuLocalReviewableToCard(card, result.card);
        },
        reviewCard: async (card, grade, reviewOptions = {}) => {
            const wasNotInDeck = normalizeCardStates(card.cardState).includes('not-in-deck')
                || card.reviewSource !== 'yomu-local';
            const result = await localYomuMutation(settings, () => adapter.review({
                card: yomuLocalReviewableFromCard(card),
                grade,
                sentence: reviewOptions.sentence,
            }));
            if (result.card) applyYomuLocalReviewableToCard(card, result.card);
            return { addedBeforeReview: wasNotInDeck };
        },
        setDeckState: async () => undefined,
    };
}

async function localYomuMutation<Result>(
    settings: ReaderSettings,
    operation: () => Promise<Result>,
): Promise<Result> {
    try {
        return await operation();
    } catch (error) {
        if (isLocalYomuSrsStorageError(error)) {
            throw new Error(uiText(settings.interfaceLanguage, 'yomuLocalSrsStorageFailed'), { cause: error });
        }
        throw error;
    }
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

function isBunproBackedCard(card: JPDBCard): boolean {
    return card.source === 'bunpro'
        || card.reviewSource === 'bunpro-api'
        || Boolean(card.bunproReviewId || card.bunproReviewableId);
}

export function isBunproGradeableCard(card: JPDBCard): boolean {
    const sessionId = Number(card.bunproReviewSessionId);
    return isBunproBackedCard(card)
        && typeof card.bunproReviewId === 'string'
        && /^[1-9]\d*$/u.test(card.bunproReviewId.trim())
        && Number.isInteger(sessionId)
        && sessionId > 0
        && (card.bunproReviewInputMode === 'regular' || card.bunproReviewInputMode === 'fsrs')
        && (card.bunproReviewEndpoint === 'review' || card.bunproReviewEndpoint === 'ghost-review' || card.bunproReviewEndpoint === 'self-study-review');
}

function bunproReviewableFromCard(card: JPDBCard): YomuSrsReviewable {
    const expression = card.spelling.trim();
    const reading = card.reading.trim() || expression;
    const providerCardId = card.bunproReviewId || stringifyPositiveNumber(card.bunproReviewableId) || card.sourceCardKey || `${card.vid}:${card.sid}:${card.rid}`;
    return {
        providerId: 'bunpro',
        providerCardId,
        providerReviewId: card.bunproReviewId,
        providerReviewableId: stringifyPositiveNumber(card.bunproReviewableId),
        reviewSession: card.bunproReviewSessionId && card.bunproReviewInputMode && card.bunproReviewEndpoint ? {
            id: card.bunproReviewSessionId,
            inputMode: card.bunproReviewInputMode,
            endpoint: card.bunproReviewEndpoint,
        } : undefined,
        kind: bunproReviewableKind(card.bunproReviewableType),
        expression,
        reading,
        meanings: card.meanings,
        state: card.cardState,
        srsLevel: card.bunproSrsLevel,
        dueAt: card.dueAt,
        lastReviewAt: card.lastReviewAt,
        raw: card,
    };
}

function bunproMiningRequestFromCard(card: JPDBCard, sentence: string | undefined, context?: ApiSrsProviderActionContext): YomuSrsMiningRequest {
    return {
        expression: card.spelling,
        reading: card.reading,
        meaning: card.meanings.flatMap(meaning => meaning.glosses).join('; '),
        sentence,
        sourceTitle: context?.sourceTitle,
        sourceUrl: context?.sourceUrl,
        kind: bunproReviewableKind(card.bunproReviewableType),
    };
}

function bunproReviewableKind(type: JPDBCard['bunproReviewableType']): YomuSrsReviewableKind {
    if (type === 'vocabulary' || type === 'grammar' || type === 'sentence') return type;
    return 'vocabulary';
}

function yomuLocalReviewableFromCard(card: JPDBCard): YomuSrsReviewable {
    const expression = card.spelling.trim();
    const reading = card.reading.trim() || expression;
    const providerCardId = card.sourceCardKey || `${expression}\u0000${reading}`;
    return {
        providerId: 'yomu-local',
        providerCardId,
        providerReviewId: providerCardId,
        kind: 'vocabulary',
        expression,
        reading,
        language: card.language ?? activeLearningTargetLanguage(),
        meanings: card.meanings,
        state: card.cardState,
        dueAt: card.dueAt,
        lastReviewAt: card.lastReviewAt,
        raw: card,
    };
}

function yomuLocalMiningRequestFromCard(card: JPDBCard, sentence: string | undefined, context?: ApiSrsProviderActionContext): YomuSrsMiningRequest {
    return {
        expression: card.spelling,
        reading: card.reading,
        language: card.language ?? activeLearningTargetLanguage(),
        meaning: card.meanings.flatMap(meaning => meaning.glosses).join('; '),
        sentence,
        sourceTitle: context?.sourceTitle,
        sourceUrl: context?.sourceUrl,
        kind: 'vocabulary',
    };
}

function stringifyPositiveNumber(value: number | undefined): string | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? String(value) : undefined;
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
