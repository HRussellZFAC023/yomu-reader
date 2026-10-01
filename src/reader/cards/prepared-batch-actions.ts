import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import { effectiveJitenApiKey, effectiveJpdbApiKey, effectiveBunproFrontendApiToken, effectiveBunproLegacyApiKey, effectiveWanikaniApiToken } from '../settings/api-credential';
import { reviewGradeProfile, reviewGradeScale } from './grade-scale';
import { normalizeCardStates } from './state';
import { BatchReceiptLedger, type BatchReceiptItem } from './batch-receipt-ledger';
import { isApiMiningEnabled, isApiSrsProviderEnabled, shouldMineAnkiAlongsideApi, type ApiSrsProviderAdapter } from './srs-providers';

export interface BatchMiningCardCandidate { card: JPDBCard; sentence?: string }
export type BatchMutation = 'collect' | 'review';
export type BatchStage = 'api-collection' | 'anki-collection' | 'review-collection' | 'review';
export type BatchGrades = ReadonlyArray<readonly [JPDBGrade, string]>;
export interface PreparedBatchPlan {
    readonly token: symbol;
    readonly grades: BatchGrades;
    readonly canCollect: boolean;
    readonly uncertain: boolean;
}
export interface BatchItemOutcome {
    token: symbol;
    state: 'completed' | 'failed' | 'uncertain' | 'unattempted' | 'stale';
    completedStages: readonly BatchStage[];
}
export interface BatchMutationResult {
    items: BatchItemOutcome[];
    rejected?: 'busy' | 'stale' | 'incompatible' | 'unavailable' | 'capacity';
}
interface BatchDependencies {
    getSettings(): ReaderSettings;
    resolveProvider(card: JPDBCard, settings: ReaderSettings): ApiSrsProviderAdapter | null;
    /** Where grades go, when that is not the collection provider (the chosen grading service). */
    resolveReviewProvider?(card: JPDBCard, settings: ReaderSettings): ApiSrsProviderAdapter | null;
    collectionDeck(provider: ApiSrsProviderAdapter, settings: ReaderSettings): Promise<string>;
    collectAnki(card: JPDBCard, sentence: string | undefined, deck: string, assertCurrent: () => void): Promise<boolean>;
    collectForReview(card: JPDBCard, sentence: string | undefined, deck: string): Promise<void>;
    review(provider: ApiSrsProviderAdapter, card: JPDBCard, grade: JPDBGrade, sentence: string | undefined, assertCurrent: () => void, onReviewed: () => void): Promise<void>;
    notify(card: JPDBCard): void;
}
interface Entry {
    token: symbol;
    source: JPDBCard;
    card: JPDBCard;
    sentence?: string;
    identity: string;
    states: string;
    context: string;
    settings: ReaderSettings;
    provider: ApiSrsProviderAdapter | null;
    reviewProvider: ApiSrsProviderAdapter | null;
    collectApi: boolean;
    collectAnki: boolean;
    grades: BatchGrades;
    receipts: Record<BatchStage, string>;
}

/** Only identical complete scales can share a bulk button; never intersect ladders. */
export function commonBatchGrades(plans: readonly PreparedBatchPlan[]): BatchGrades {
    const first = plans[0]?.grades;
    if (!first?.length || plans.some(plan => JSON.stringify(plan.grades) !== JSON.stringify(first))) return [];
    return first;
}

/** Ephemeral plans and stage receipts: no account details escape through the token. */
const MAX_BATCH_RECEIPT_KEYS = 4096;

export class PreparedBatchActions {
    private entries = new Map<symbol, Entry>();
    private receipts: BatchReceiptLedger;
    private busy = false;
    constructor(private deps: BatchDependencies, receiptLimit = MAX_BATCH_RECEIPT_KEYS) {
        this.receipts = new BatchReceiptLedger(receiptLimit);
    }

    /** A deliberate new scan, not a render or retry, starts a fresh generation. */
    beginGeneration(): boolean {
        if (this.busy) return false;
        this.entries.clear();
        this.receipts.beginGeneration();
        return true;
    }

    prepare(candidates: readonly BatchMiningCardCandidate[]): PreparedBatchPlan[] {
        if (this.busy) return [];
        this.entries.clear();
        const settings = this.deps.getSettings();
        const context = batchContext(settings);
        return candidates.map(candidate => {
            const identity = batchCardIdentity(candidate.card);
            const provider = this.deps.resolveProvider(candidate.card, settings);
            const reviewProvider = this.reviewProvider(candidate.card, settings);
            const collectApi = Boolean(isApiMiningEnabled(settings) && providerEnabled(provider, settings)
                && (provider?.supportsMiningCard?.(candidate.card) ?? true));
            const blocked = normalizeCardStates(candidate.card.cardState).some(state => ['blacklisted', 'never-forget', 'redundant', 'suspended'].includes(state));
            const grades = settings.enableReviews && providerEnabled(reviewProvider, settings) && !blocked
                ? reviewGradeScale(settings, reviewGradeProfile(candidate.card, reviewProvider!.id)).grades : [];
            const entry: Entry = {
                token: Symbol('batch-plan'), source: candidate.card, card: { ...candidate.card, cardState: [...candidate.card.cardState] }, sentence: candidate.sentence,
                states: JSON.stringify(candidate.card.cardState),
                identity, context, settings: { ...settings }, provider, reviewProvider, collectApi,
                collectAnki: collectApi ? shouldMineAnkiAlongsideApi(settings) : settings.ankiEnabled,
                grades, receipts: receiptKeys(candidate.card, settings, provider, reviewProvider),
            };
            this.entries.set(entry.token, entry);
            return this.view(entry);
        });
    }

    async execute(tokens: readonly symbol[], action: BatchMutation, grade?: JPDBGrade): Promise<BatchMutationResult> {
        if (this.busy) return { items: [], rejected: 'busy' };
        const entries = tokens.map(token => this.entries.get(token));
        if (!tokens.length || new Set(tokens).size !== tokens.length || entries.some(entry => !entry || !this.current(entry))) return this.reject(tokens, 'stale');
        const batch = entries as Entry[];
        if (new Set(batch.map(entry => entry.receipts[action === 'review' ? 'review' : entry.collectApi ? 'api-collection' : 'anki-collection'])).size !== batch.length) return this.reject(tokens, 'stale');
        if (action === 'review' && (!grade || !commonBatchGrades(batch.map(entry => this.view(entry))).some(([value]) => value === grade))) return this.reject(tokens, 'incompatible');
        if (action === 'collect' && batch.some(entry => !this.view(entry).canCollect)) return this.reject(tokens, 'unavailable');
        const operation = this.receipts.reserve(batch.map(entry => receiptItem(entry, action)));
        if (!operation) return this.reject(tokens, 'capacity');
        this.busy = true;
        const items: BatchItemOutcome[] = [];
        try {
            for (const entry of batch) {
                if (!this.current(entry)) { items.push(this.outcome(entry, 'stale')); break; }
                try {
                    if (action === 'collect') await this.collect(entry);
                    else await this.review(entry, grade!);
                    items.push(this.outcome(entry, 'completed'));
                } catch (error) {
                    const state = this.completed(entry, action) ? 'completed' : error instanceof StaleBatchPlan ? 'stale'
                        : this.receipts.get(entry.receipts.review) === 'uncertain' ? 'uncertain' : 'failed';
                    items.push(this.outcome(entry, state));
                    break;
                }
            }
            for (const entry of batch.slice(items.length)) items.push(this.outcome(entry, 'unattempted'));
            return { items };
        } finally {
            this.receipts.finish(operation);
            this.busy = false;
        }
    }

    private view(entry: Entry): PreparedBatchPlan {
        const stages = this.completedStages(entry);
        const reviewUncertain = this.receipts.get(entry.receipts.review) === 'uncertain';
        return Object.freeze({
            token: entry.token,
            grades: Object.freeze((stages.includes('review') || reviewUncertain ? [] : entry.grades).map(pair => Object.freeze([...pair] as [JPDBGrade, string]))),
            canCollect: (entry.collectApi || entry.collectAnki)
                && !((!entry.collectApi || stages.includes('api-collection')) && (!entry.collectAnki || stages.includes('anki-collection'))),
            uncertain: reviewUncertain,
        });
    }

    private async collect(entry: Entry): Promise<void> {
        if (entry.collectApi && !this.completedStages(entry).includes('api-collection')) {
            const deck = await this.deps.collectionDeck(entry.provider!, entry.settings);
            this.assertCurrent(entry);
            if (!deck) throw new Error('No collection deck');
            await entry.provider!.addToDeck(deck, entry.card, entry.sentence, { sourceTitle: document.title });
            this.receipts.set(entry.receipts['api-collection'], 'completed');
            this.assertCurrent(entry);
            this.deps.notify(entry.card);
        }
        if (entry.collectAnki && !this.completedStages(entry).includes('anki-collection')) {
            this.assertCurrent(entry);
            if (!await this.deps.collectAnki(entry.card, entry.sentence, entry.settings.ankiDeck, () => this.assertCurrent(entry))) throw new Error('Collection not completed');
            this.receipts.set(entry.receipts['anki-collection'], 'completed');
        }
        this.assertCurrent(entry);
        entry.source.cardState = entry.card.cardState;
    }

    private async review(entry: Entry, grade: JPDBGrade): Promise<void> {
        this.assertCurrent(entry);
        // A word JPDB has not identified yet is resolved by the grade itself,
        // which adds the resolved word before reviewing it.
        if (entry.reviewProvider?.id === 'jpdb' && entry.reviewProvider.supportsCard(entry.card) && entry.card.cardState.includes('not-in-deck')) {
            if (!this.completedStages(entry).includes('review-collection')) {
                await this.deps.collectForReview(entry.card, entry.sentence, entry.settings.miningDeck || 'forq');
                this.receipts.set(entry.receipts['review-collection'], 'completed');
            }
            this.assertCurrent(entry);
            entry.card.cardState = [...entry.card.cardState.filter(state => state !== 'not-in-deck'), 'in-deck'];
        }
        try {
            await this.deps.review(entry.reviewProvider!, entry.card, grade, entry.sentence, () => this.assertCurrent(entry), () => this.receipts.set(entry.receipts.review, 'completed'));
            this.receipts.set(entry.receipts.review, 'completed');
        } catch (error) {
            // A consumed server session cannot be replayed after an ambiguous response.
            if (entry.reviewProvider?.id === 'bunpro' && !this.completedStages(entry).includes('review')) this.receipts.set(entry.receipts.review, 'uncertain');
            throw error;
        }
        this.assertCurrent(entry);
        entry.source.cardState = entry.card.cardState;
    }

    private current(entry: Entry): boolean {
        const settings = this.deps.getSettings();
        const provider = this.deps.resolveProvider(entry.source, settings);
        const reviewProvider = this.reviewProvider(entry.source, settings);
        return this.entries.get(entry.token) === entry && entry.context === batchContext(settings)
            && entry.identity === batchCardIdentity(entry.source) && entry.states === JSON.stringify(entry.source.cardState)
            && provider?.id === entry.provider?.id && provider?.hasApiKey === entry.provider?.hasApiKey
            && reviewProvider?.id === entry.reviewProvider?.id && reviewProvider?.hasApiKey === entry.reviewProvider?.hasApiKey;
    }
    private reviewProvider(card: JPDBCard, settings: ReaderSettings): ApiSrsProviderAdapter | null {
        return this.deps.resolveReviewProvider ? this.deps.resolveReviewProvider(card, settings) : this.deps.resolveProvider(card, settings);
    }
    private assertCurrent(entry: Entry): void { if (!this.current(entry)) throw new StaleBatchPlan(); }
    private outcome(entry: Entry, state: BatchItemOutcome['state']): BatchItemOutcome {
        return { token: entry.token, state, completedStages: this.completedStages(entry) };
    }
    private completedStages(entry: Entry): BatchStage[] {
        return (['api-collection', 'anki-collection', 'review-collection', 'review'] as const).filter(stage => this.receipts.get(entry.receipts[stage]) === 'completed');
    }
    private completed(entry: Entry, action: BatchMutation): boolean {
        const stages = this.completedStages(entry);
        return action === 'review' ? stages.includes('review')
            : (!entry.collectApi || stages.includes('api-collection')) && (!entry.collectAnki || stages.includes('anki-collection'));
    }
    private reject(tokens: readonly symbol[], rejected: BatchMutationResult['rejected']): BatchMutationResult {
        return { rejected, items: tokens.map(token => ({ token, state: 'unattempted', completedStages: [] })) };
    }
}

class StaleBatchPlan extends Error {}

function providerEnabled(provider: ApiSrsProviderAdapter | null, settings: ReaderSettings): boolean {
    return Boolean(provider?.hasApiKey && isApiSrsProviderEnabled(settings, provider.id));
}

function receiptItem(entry: Entry, action: BatchMutation): BatchReceiptItem {
    const stages: BatchStage[] = action === 'review' ? ['review-collection', 'review']
        : [...(entry.collectApi ? ['api-collection' as const] : []), ...(entry.collectAnki ? ['anki-collection' as const] : [])];
    const required = action === 'review' ? [entry.receipts.review] : stages.map(stage => entry.receipts[stage]);
    const id = action === 'review' ? entry.receipts.review : entry.collectApi ? entry.receipts['api-collection']
        : sensitiveFingerprint(JSON.stringify(['anki-item', entry.settings.activeLanguageProfileId, entry.card.spelling, entry.card.reading]));
    return { id, keys: stages.map(stage => entry.receipts[stage]), required };
}

function receiptKeys(card: JPDBCard, settings: ReaderSettings, provider: ApiSrsProviderAdapter | null, reviewProvider: ApiSrsProviderAdapter | null): Record<BatchStage, string> {
    const collect = receiptAccount(card, settings, provider);
    const review = receiptAccount(card, settings, reviewProvider);
    return {
        review: sensitiveFingerprint(JSON.stringify(['review', review.account])),
        'api-collection': sensitiveFingerprint(JSON.stringify(['collect', collect.account, collect.deck])),
        'review-collection': sensitiveFingerprint(JSON.stringify(['review-collect', review.account, review.deck])),
        'anki-collection': sensitiveFingerprint(JSON.stringify(['anki-collect', settings.ankiConnectUrl, settings.ankiDeck, settings.ankiModel,
            settings.activeLanguageProfileId, card.spelling, card.reading])),
    };
}

function receiptAccount(card: JPDBCard, settings: ReaderSettings, provider: ApiSrsProviderAdapter | null): { account: unknown[]; deck: string } {
    const credentials = { jiten: effectiveJitenApiKey(settings), jpdb: effectiveJpdbApiKey(settings),
        bunpro: [effectiveBunproFrontendApiToken(settings), effectiveBunproLegacyApiKey(settings)], wanikani: effectiveWanikaniApiToken(settings), 'yomu-local': settings.activeLanguageProfileId };
    const identity = provider?.id === 'jiten' ? [card.jitenWordId ?? card.vid, card.jitenReadingIndex ?? card.sid]
        : provider?.id === 'bunpro' ? [card.bunproReviewId, card.bunproReviewSessionId, card.bunproReviewInputMode, card.bunproReviewEndpoint]
        : provider?.id === 'wanikani' ? [card.wanikaniAssignmentId]
        : [card.vid, card.sid, card.spelling, card.reading];
    return {
        account: [provider?.id, provider ? credentials[provider.id] : '', identity],
        deck: provider?.id === 'jiten' ? 'default-study-deck' : settings.miningDeck,
    };
}

function batchContext(settings: ReaderSettings): string {
    // Any settings change invalidates the plan, including credentials and Anki field mappings.
    return sensitiveFingerprint(JSON.stringify(settings));
}

function batchCardIdentity(card: JPDBCard): string {
    return JSON.stringify([card.vid, card.sid, card.rid, card.spelling, card.reading, card.source, card.reviewSource,
        card.apiGradingProviderOverride, card.jitenWordId, card.jitenReadingIndex, card.ankiCardId,
        card.bunproReviewId, card.bunproReviewSessionId, card.bunproReviewInputMode, card.bunproReviewEndpoint,
        card.bunproReviewableId, card.bunproReviewableType,
        card.wanikaniAssignmentId]);
}
