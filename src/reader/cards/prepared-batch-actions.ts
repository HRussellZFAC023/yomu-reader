import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import { effectiveJitenApiKey, effectiveJpdbApiKey, effectiveBunproFrontendApiToken, effectiveBunproLegacyApiKey, effectiveWanikaniApiToken } from '../settings/api-credential';
import { reviewGradeProfile, reviewGradeScale } from './grade-scale';
import { normalizeCardStates } from './state';
import { BatchReceiptLedger, type BatchReceiptItem } from './batch-receipt-ledger';
import { isApiSrsProviderEnabled, shouldMineAnkiAlongsideApi, type ApiSrsProviderAdapter } from './srs-providers';
import { userFacingCopyKeyOf } from '../app/user-facing-errors';

export interface BatchMiningCardCandidate { card: JPDBCard; sentence?: string }
export type BatchMutation = 'collect' | 'review';
export type BatchStage = 'api-collection' | 'anki-collection' | 'review-collection' | 'review';
export type BatchGrades = ReadonlyArray<readonly [JPDBGrade, string]>;
/** Where "Add selected" saves a word: a service, Anki, or nowhere when no enabled destination takes it. */
type BatchCollectionDestination = ApiSrsProviderAdapter | 'anki' | null;
export interface PreparedBatchPlan {
    readonly token: symbol;
    readonly grades: BatchGrades;
    readonly canCollect: boolean;
    /** No enabled destination can take this word, so "Add selected" skips it (ADR-0016). */
    readonly noDestination: boolean;
    readonly uncertain: boolean;
    /** The grading service does not have this word, so it cannot be graded (ADR-0021). */
    readonly unmatched: boolean;
}
export interface BatchItemOutcome {
    token: symbol;
    state: 'completed' | 'failed' | 'uncertain' | 'unattempted' | 'stale' | 'unmatched' | 'no-destination';
    completedStages: readonly BatchStage[];
}
export interface BatchMutationResult {
    items: BatchItemOutcome[];
    rejected?: 'busy' | 'stale' | 'incompatible' | 'unavailable' | 'capacity';
}
interface BatchDependencies {
    getSettings(): ReaderSettings;
    /** The popup's default save for this word (collectionDestinationsForCard): one save, no schedule. */
    resolveCollectionDestination(card: JPDBCard, settings: ReaderSettings): BatchCollectionDestination;
    /** Where grades go: the chosen grading service (ADR-0021). */
    resolveReviewProvider(card: JPDBCard, settings: ReaderSettings): ApiSrsProviderAdapter | null;
    collectionDeck(provider: ApiSrsProviderAdapter, settings: ReaderSettings): Promise<string>;
    collectAnki(card: JPDBCard, sentence: string | undefined, deck: string, assertCurrent: () => void): Promise<boolean>;
    collectForReview(card: JPDBCard, sentence: string | undefined, deck: string): Promise<void>;
    /** The same words on a grading service that has not identified them, in one request; null where it has none. */
    findOnGradingService(provider: ApiSrsProviderAdapter, cards: readonly JPDBCard[]): Promise<Array<JPDBCard | null>>;
    review(provider: ApiSrsProviderAdapter, card: JPDBCard, grade: JPDBGrade, sentence: string | undefined, assertCurrent: () => void, onReviewed: () => void): Promise<void>;
    notify(card: JPDBCard): void;
}
interface Entry {
    token: symbol;
    source: JPDBCard;
    card: JPDBCard;
    /** `card` is the grading service's own copy of the word, not the page word's (ADR-0021). */
    resolved?: boolean;
    sentence?: string;
    identity: string;
    states: string;
    context: string;
    settings: ReaderSettings;
    destination: BatchCollectionDestination;
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
    // Review receipts of words the grading service does not have, until a rescan.
    private unmatched = new Set<string>();
    private busy = false;
    constructor(private deps: BatchDependencies, receiptLimit = MAX_BATCH_RECEIPT_KEYS) {
        this.receipts = new BatchReceiptLedger(receiptLimit);
    }

    /** A deliberate new scan, not a render or retry, starts a fresh generation. */
    beginGeneration(): boolean {
        if (this.busy) return false;
        this.entries.clear();
        this.receipts.beginGeneration();
        this.unmatched.clear();
        return true;
    }

    prepare(candidates: readonly BatchMiningCardCandidate[]): PreparedBatchPlan[] {
        if (this.busy) return [];
        this.entries.clear();
        const settings = this.deps.getSettings();
        const context = batchContext(settings);
        return candidates.map(candidate => {
            const identity = batchCardIdentity(candidate.card);
            const destination = this.deps.resolveCollectionDestination(candidate.card, settings);
            const provider = destination === 'anki' ? null : destination;
            const reviewProvider = this.deps.resolveReviewProvider(candidate.card, settings);
            const blocked = normalizeCardStates(candidate.card.cardState).some(state => ['blacklisted', 'never-forget', 'redundant', 'suspended'].includes(state));
            const grades = settings.enableReviews && providerEnabled(reviewProvider, settings) && !blocked
                ? reviewGradeScale(settings, reviewGradeProfile(candidate.card, reviewProvider!.id)).grades : [];
            const entry: Entry = {
                token: Symbol('batch-plan'), source: candidate.card, card: { ...candidate.card, cardState: [...candidate.card.cardState] }, sentence: candidate.sentence,
                states: JSON.stringify(candidate.card.cardState),
                identity, context, settings: { ...settings }, destination, reviewProvider, collectApi: Boolean(provider),
                // As in the popup, a save to a service also goes to Anki when the learner mines to both.
                collectAnki: destination === 'anki' || Boolean(provider && shouldMineAnkiAlongsideApi(settings)),
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
        // A word no enabled destination can take is skipped; the rest still save.
        const writes = action === 'collect' ? batch.filter(hasDestination) : batch;
        if (action === 'collect' && (!writes.length || writes.some(entry => !this.view(entry).canCollect))) return this.reject(tokens, 'unavailable');
        const operation = this.receipts.reserve(writes.map(entry => receiptItem(entry, action)));
        if (!operation) return this.reject(tokens, 'capacity');
        this.busy = true;
        const items: BatchItemOutcome[] = [];
        let matching: Promise<void> | undefined;
        try {
            for (const entry of batch) {
                if (!this.current(entry)) { items.push(this.outcome(entry, 'stale')); break; }
                try {
                    if (action === 'collect' && !hasDestination(entry)) { items.push(this.outcome(entry, 'no-destination')); continue; }
                    const onService = this.goesToGradingService(entry, action);
                    if (onService && needsMatch(entry)) await (matching ??= this.matchOnGradingService(batch, action));
                    // A word the grading service does not have is not graded or saved anywhere; the rest still are.
                    if (onService && this.unmatched.has(entry.receipts.review)) { items.push(this.outcome(entry, 'unmatched')); continue; }
                    if (action === 'collect') await this.collect(entry);
                    else await this.review(entry, grade!);
                    items.push(this.outcome(entry, 'completed'));
                } catch (error) {
                    // Bunpro takes a word only when its catalogue has it. Nothing was saved, so the word is skipped the same way.
                    if (action === 'collect' && userFacingCopyKeyOf(error) === 'bunproNoMatchingWord') {
                        this.receipts.release(operation, receiptItem(entry, action).id);
                        items.push(this.outcome(entry, 'no-destination'));
                        continue;
                    }
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
        const unmatched = this.unmatched.has(entry.receipts.review);
        const due = (entry.collectApi && !stages.includes('api-collection')) || (entry.collectAnki && !stages.includes('anki-collection'));
        return Object.freeze({
            token: entry.token,
            grades: Object.freeze((stages.includes('review') || reviewUncertain || unmatched ? [] : entry.grades).map(pair => Object.freeze([...pair] as [JPDBGrade, string]))),
            // The grading service cannot save a word it does not have either.
            canCollect: due && !(unmatched && this.goesToGradingService(entry, 'collect')),
            noDestination: !hasDestination(entry),
            uncertain: reviewUncertain,
            unmatched,
        });
    }

    // A grade, and a save to the service the grades go to (ADR-0016), first
    // finds the words the grading service has not identified (another service
    // parsed them).
    private goesToGradingService(entry: Entry, action: BatchMutation): boolean {
        if (action === 'review') return true;
        const provider = collectProvider(entry);
        return Boolean(provider && provider.id === entry.reviewProvider?.id && !this.completedStages(entry).includes('api-collection'));
    }

    // The words are found in one request before any is graded or saved. Every
    // entry shares the plan's settings, so they all resolve on the same service.
    private async matchOnGradingService(batch: readonly Entry[], action: BatchMutation): Promise<void> {
        const pending = batch.filter(entry => this.goesToGradingService(entry, action) && needsMatch(entry));
        const matches = await this.deps.findOnGradingService(pending[0]!.reviewProvider!, pending.map(entry => entry.card));
        pending.forEach((entry, index) => {
            const match = matches[index];
            if (match) Object.assign(entry, { card: { ...match, cardState: [...match.cardState] }, resolved: true });
            else this.unmatched.add(entry.receipts.review);
        });
    }

    private async collect(entry: Entry): Promise<void> {
        const provider = collectProvider(entry);
        if (provider && !this.completedStages(entry).includes('api-collection')) {
            const word = this.serviceReceipt(entry, 'api-collection');
            if (this.receipts.get(word) !== 'completed') {
                const deck = await this.deps.collectionDeck(provider, entry.settings);
                this.assertCurrent(entry);
                if (!deck) throw new Error('No collection deck');
                await provider.addToDeck(deck, entry.card, entry.sentence, { sourceTitle: document.title });
                this.receipts.set(word, 'completed');
            }
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
        this.keepPageState(entry);
    }

    // A resolved word changed the grading service's record: the page word keeps
    // the state of the service that parsed it (ADR-0021).
    private keepPageState(entry: Entry): void {
        if (!entry.resolved) entry.source.cardState = entry.card.cardState;
    }

    // Two rows can be one word on the service that changes: a homograph, or a
    // word both services parsed. That word is saved or graded once (ADR-0021).
    private serviceReceipt(entry: Entry, stage: 'api-collection' | 'review'): string {
        return receiptKeys(entry.card, entry.settings, collectProvider(entry), entry.reviewProvider)[stage];
    }

    private async review(entry: Entry, grade: JPDBGrade): Promise<void> {
        this.assertCurrent(entry);
        const word = this.serviceReceipt(entry, 'review');
        const reviewed = (): void => { this.receipts.set(entry.receipts.review, 'completed'); this.receipts.set(word, 'completed'); };
        if (this.receipts.get(word) === 'completed') {
            reviewed();
            return;
        }
        if (entry.reviewProvider?.id === 'jpdb' && entry.card.cardState.includes('not-in-deck')) {
            if (!this.completedStages(entry).includes('review-collection')) {
                await this.deps.collectForReview(entry.card, entry.sentence, entry.settings.miningDeck || 'forq');
                this.receipts.set(entry.receipts['review-collection'], 'completed');
            }
            this.assertCurrent(entry);
            entry.card.cardState = [...entry.card.cardState.filter(state => state !== 'not-in-deck'), 'in-deck'];
        }
        try {
            await this.deps.review(entry.reviewProvider!, entry.card, grade, entry.sentence, () => this.assertCurrent(entry), reviewed);
            reviewed();
        } catch (error) {
            // A consumed server session cannot be replayed after an ambiguous response.
            if (entry.reviewProvider?.id === 'bunpro' && !this.completedStages(entry).includes('review')) this.receipts.set(entry.receipts.review, 'uncertain');
            throw error;
        }
        this.assertCurrent(entry);
        this.keepPageState(entry);
    }

    private current(entry: Entry): boolean {
        const settings = this.deps.getSettings();
        const destination = this.deps.resolveCollectionDestination(entry.source, settings);
        const reviewProvider = this.deps.resolveReviewProvider(entry.source, settings);
        return this.entries.get(entry.token) === entry && entry.context === batchContext(settings)
            && entry.identity === batchCardIdentity(entry.source) && entry.states === JSON.stringify(entry.source.cardState)
            && destinationKey(destination) === destinationKey(entry.destination)
            && reviewProvider?.id === entry.reviewProvider?.id && reviewProvider?.hasApiKey === entry.reviewProvider?.hasApiKey;
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

function hasDestination(entry: Entry): boolean {
    return entry.collectApi || entry.collectAnki;
}

function collectProvider(entry: Entry): ApiSrsProviderAdapter | null {
    return entry.destination === 'anki' ? null : entry.destination;
}

/** The grading service has not identified this word yet (ADR-0021). */
function needsMatch(entry: Entry): boolean {
    return Boolean(entry.reviewProvider && !entry.reviewProvider.supportsCard(entry.card));
}

function destinationKey(destination: BatchCollectionDestination): string {
    return destination === 'anki' || !destination ? String(destination) : `${destination.id}:${destination.hasApiKey}`;
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
    const collect = serviceAccount(card, settings, provider, 'collect');
    const review = serviceAccount(card, settings, reviewProvider, 'review');
    return {
        review: sensitiveFingerprint(JSON.stringify(['review', review.account])),
        'api-collection': sensitiveFingerprint(JSON.stringify(['collect', collect.account, collect.deck])),
        'review-collection': sensitiveFingerprint(JSON.stringify(['review-collect', review.account, review.deck])),
        'anki-collection': sensitiveFingerprint(JSON.stringify(['anki-collect', settings.ankiConnectUrl, settings.ankiDeck, settings.ankiModel,
            settings.activeLanguageProfileId, card.spelling, card.reading])),
    };
}

// A word the service has not identified yet is never keyed as one of its
// words: a JPDB vid is not a Jiten word id.
function serviceAccount(card: JPDBCard, settings: ReaderSettings, provider: ApiSrsProviderAdapter | null, use: BatchMutation): { account: unknown[]; deck: string } {
    const account = receiptAccount(card, settings, provider, use);
    return provider && !provider.supportsCard(card) ? { ...account, account: ['unidentified', card.source, ...account.account] } : account;
}

function receiptAccount(card: JPDBCard, settings: ReaderSettings, provider: ApiSrsProviderAdapter | null, use: BatchMutation): { account: unknown[]; deck: string } {
    const credentials = { jiten: effectiveJitenApiKey(settings), jpdb: effectiveJpdbApiKey(settings),
        bunpro: [effectiveBunproFrontendApiToken(settings), effectiveBunproLegacyApiKey(settings)], wanikani: effectiveWanikaniApiToken(settings), 'yomu-local': settings.activeLanguageProfileId };
    // Bunpro answers one review item but saves any word its catalogue has, so a save is keyed by the word.
    const identity = provider?.id === 'jiten' ? [card.jitenWordId ?? card.vid, card.jitenReadingIndex ?? card.sid]
        : provider?.id === 'bunpro' && use === 'review' ? [card.bunproReviewId, card.bunproReviewSessionId, card.bunproReviewInputMode, card.bunproReviewEndpoint]
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
