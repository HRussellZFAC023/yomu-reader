import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { type UiCopyKey } from '../app/i18n';
import { type NewTabCopyKey } from './i18n';
import { cardKey } from '../cards/utils';
import { newTabCardReading, sentenceForCard } from './study-queue';
import { isJitenSrsCard, type NewTabReviewTarget } from './review-targets';
import type { QueuedNewTabGrade } from './grade-queue';
import type { JPDBCard, JPDBGrade, ReaderSettings } from '../app/types';
import type { JpdbClient } from '../jpdb/jpdb';
import type { JitenApiClient } from '../dictionaries/jiten';
import type { YomuSrsAdapter, YomuSrsReviewable, YomuSrsReviewableKind, YomuSrsReviewResult } from '../srs/types';

type NewTabTextKey = UiCopyKey | NewTabCopyKey;
type NewTabSrsAdapterSource = 'bunpro' | 'wanikani' | 'yomu-local';
type NewTabSrsQueueAdapter = Pick<YomuSrsAdapter, 'label' | 'hasCredential' | 'stats' | 'queue' | 'review'>;

// Cycle-9 unification: one uniform shape for every SRS provider's grading path
// so the two grade ladders (live submit + queue flush) dispatch through a single
// table instead of parallel per-provider `if` chains. `review` is the member both
// ladders dispatch; `refreshState`/`undo` capture each provider's post-review and
// reversal semantics (only Jiten reverses server-side — the rest requeue locally,
// which the controller owns, so their `undo` rejects as not-server-reversible).
interface NewTabReviewProviderAdapter {
    // Whether this provider currently holds the credential/gating to grade the
    // card. `review` still enforces its own precise, message-specific gate.
    hasCredential(card: JPDBCard): boolean;
    // Submit the grade to the provider. jpdb-live is synchronous; the rest async.
    review(card: JPDBCard, grade: JPDBGrade): Promise<void> | void;
    // Pull post-review provider state onto the card. No-op where the provider
    // refreshes internally (jpdb) or keeps no server state (live/anki/local).
    refreshState(card: JPDBCard): Promise<void>;
    // Reverse the last review on the provider. Rejects where the provider cannot
    // reverse server-side (UT-57: those requeue locally in the controller).
    undo(card: JPDBCard): Promise<void>;
}

// Everything the submitter reads back off the controller: the review-source
// clients plus the few controller-owned side effects (cross-tab broadcast, the
// one-shot Jiten undo arm) and the two genuinely-special submit primitives kept
// on the controller — jpdb-live (synchronous bridge grade + state read-back) and
// Anki (returns lookup state the lookup surface consumes). Every provider grade
// flows through NewTabReviewSubmitterDeps.
export interface NewTabReviewSubmitterDeps {
    getSettings(): ReaderSettings;
    providerContextForTarget(target: NewTabReviewTarget): string;
    text(key: NewTabTextKey): string;
    jpdb: Pick<JpdbClient, 'reviewCard'>;
    jiten?: Pick<JitenApiClient, 'reviewCard'> & Partial<Pick<JitenApiClient, 'refreshCardState' | 'undoReview'>>;
    srsAdapters?: Partial<Record<NewTabSrsAdapterSource, NewTabSrsQueueAdapter>>;
    publishGradedCardState(card: JPDBCard): void;
    armJitenUndo(card: JPDBCard): void;
    reviewLiveJpdb(card: JPDBCard, grade: JPDBGrade): void;
    reviewAnki(card: JPDBCard, grade: JPDBGrade): Promise<unknown>;
}

const NOT_SERVER_REVERSIBLE = 'review is not server-reversible';
const SRS_REVIEW_TARGET: Record<NewTabSrsAdapterSource, NewTabReviewTarget> = {
    bunpro: 'bunpro-api',
    wanikani: 'wanikani-api',
    'yomu-local': 'yomu-local',
};

export class NewTabReviewSubmitter {
    private readonly adapters: Record<NewTabReviewTarget, NewTabReviewProviderAdapter>;

    constructor(private readonly deps: NewTabReviewSubmitterDeps) {
        this.adapters = this.buildAdapters();
    }

    // Table-driven replacement for the old submitReviewTarget ladder: every
    // target (jpdb-api fell through the ladder's default) resolves to its own
    // adapter, preserving the exact per-provider routing.
    async submitTarget(card: JPDBCard, target: NewTabReviewTarget, grade: JPDBGrade): Promise<void> {
        await this.adapters[target].review(card, grade);
    }

    // Table-driven replacement for the old submitQueuedGrade ladder. Queued
    // grades never carry jpdb-live (live grading never queues); the bunpro guard
    // stays explicit — a queue written before Bunpro grading became
    // live-session-only must never replay a stale session review id.
    async submitQueued(item: QueuedNewTabGrade): Promise<boolean> {
        if (item.target === 'bunpro-api') return false;
        await this.adapters[item.target].review(item.card, item.grade);
        return true;
    }

    // Jiten reviews reverse server-side; the controller's undo flow delegates the
    // provider side here and keeps the local card-restoration.
    undoServerReview(card: JPDBCard): Promise<void> {
        return this.adapters['jiten-api'].undo(card);
    }

    private buildAdapters(): Record<NewTabReviewTarget, NewTabReviewProviderAdapter> {
        const notReversible = (): Promise<void> => Promise.reject(new Error(NOT_SERVER_REVERSIBLE));
        const noRefresh = (): Promise<void> => Promise.resolve();
        return {
            'jpdb-api': {
                hasCredential: card => (card.source === 'jpdb' || card.reviewSource === 'jpdb-api')
                    && this.deps.getSettings().jpdbMiningEnabled
                    && hasJpdbApiCredential(this.deps.getSettings()),
                review: (card, grade) => this.reviewJpdbApi(card, grade),
                // jpdb.reviewCard refreshes the card state internally.
                refreshState: noRefresh,
                undo: notReversible,
            },
            'jpdb-live': {
                hasCredential: card => card.reviewSource === 'jpdb-live' && this.deps.getSettings().jpdbMiningEnabled,
                review: (card, grade) => { this.deps.reviewLiveJpdb(card, grade); },
                refreshState: noRefresh,
                undo: notReversible,
            },
            'jiten-api': {
                hasCredential: card => isJitenSrsCard(card)
                    && this.deps.getSettings().jpdbMiningEnabled
                    && hasJitenApiCredential(this.deps.getSettings())
                    && typeof this.deps.jiten?.reviewCard === 'function',
                review: (card, grade) => this.reviewJitenApi(card, grade),
                refreshState: card => this.refreshJitenState(card),
                undo: card => this.undoJitenReview(card),
            },
            anki: {
                hasCredential: card => Boolean(card.ankiCardId),
                review: async (card, grade) => { await this.deps.reviewAnki(card, grade); },
                refreshState: noRefresh,
                undo: notReversible,
            },
            'bunpro-api': this.srsAdapterEntry('bunpro-api'),
            'wanikani-api': this.srsAdapterEntry('wanikani-api'),
            'yomu-local': this.srsAdapterEntry('yomu-local'),
        };
    }

    private srsAdapterEntry(target: 'bunpro-api' | 'wanikani-api' | 'yomu-local'): NewTabReviewProviderAdapter {
        const source: NewTabSrsAdapterSource = target === 'bunpro-api'
            ? 'bunpro'
            : target === 'wanikani-api'
                ? 'wanikani'
                : 'yomu-local';
        return {
            hasCredential: () => Boolean(this.deps.srsAdapters?.[source]?.hasCredential()),
            review: (card, grade) => this.reviewSrsAdapter(source, card, grade),
            refreshState: () => Promise.resolve(),
            undo: () => Promise.reject(new Error(NOT_SERVER_REVERSIBLE)),
        };
    }

    private async reviewJpdbApi(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        const settings = this.deps.getSettings();
        assertReviewAccess(this.deps, [
            [card.source === 'jpdb' || card.reviewSource === 'jpdb-api', 'couldNotSubmitGrade'],
            [settings.jpdbMiningEnabled, 'apiSrsActionsDisabled'],
            [hasJpdbApiCredential(settings), 'addJpdbApiKeyReview'],
        ]);
        const providerContext = this.deps.providerContextForTarget('jpdb-api');
        await this.deps.jpdb.reviewCard(card, grade);
        if (providerContext !== this.deps.providerContextForTarget('jpdb-api')) return;
        this.deps.publishGradedCardState(card);
    }

    private async reviewJitenApi(card: JPDBCard, grade: JPDBGrade): Promise<void> {
        const settings = this.deps.getSettings();
        const reviewCard = this.deps.jiten?.reviewCard;
        assertReviewAccess(this.deps, [
            [isJitenSrsCard(card), 'couldNotSubmitGrade'],
            [settings.jpdbMiningEnabled, 'apiSrsActionsDisabled'],
            [hasJitenApiCredential(settings), 'addJitenApiKeyReview'],
            [typeof reviewCard === 'function', 'couldNotSubmitGrade'],
        ]);
        const providerContext = this.deps.providerContextForTarget('jiten-api');
        await reviewCard!.call(this.deps.jiten, card, grade);
        if (providerContext !== this.deps.providerContextForTarget('jiten-api')) return;
        // Jiten reviews are server-reversible — record the undo here too so every
        // submit path (not only gradeCurrentCard) arms the affordance.
        this.deps.armJitenUndo(card);
        // Parity with the JPDB path (jpdb.reviewCard refreshes internally): pull
        // the post-review state so the review summary reflects reality.
        await this.refreshJitenState(card);
        if (providerContext !== this.deps.providerContextForTarget('jiten-api')) return;
        this.deps.publishGradedCardState(card);
    }

    private async refreshJitenState(card: JPDBCard): Promise<void> {
        if (typeof this.deps.jiten?.refreshCardState === 'function') {
            await this.deps.jiten.refreshCardState(card).catch(() => undefined);
        }
    }

    private async undoJitenReview(card: JPDBCard): Promise<void> {
        const providerContext = this.deps.providerContextForTarget('jiten-api');
        await this.deps.jiten?.undoReview?.(card);
        if (providerContext !== this.deps.providerContextForTarget('jiten-api')) return;
        await this.refreshJitenState(card);
        if (providerContext !== this.deps.providerContextForTarget('jiten-api')) return;
        this.deps.publishGradedCardState(card);
    }

    private async reviewSrsAdapter(source: NewTabSrsAdapterSource, card: JPDBCard, grade: JPDBGrade): Promise<void> {
        const adapter = credentialedSrsAdapter(this.deps.srsAdapters?.[source], this.deps.text('couldNotSubmitGrade'));
        const target = SRS_REVIEW_TARGET[source];
        const providerContext = this.deps.providerContextForTarget(target);
        const result = await adapter.review({ card: this.newTabCardToSrsReviewable(card, source), grade, sentence: sentenceForCard(card) });
        if (providerContext !== this.deps.providerContextForTarget(target)) return;
        applySrsReviewResult(card, source, result);
        this.deps.publishGradedCardState(card);
    }

    // fallow-ignore-next-line complexity
    private newTabCardToSrsReviewable(card: JPDBCard, source: NewTabSrsAdapterSource): YomuSrsReviewable {
        const expression = card.spelling.trim();
        const reading = newTabCardReading(card).trim() || expression;
        const providerCardId = source === 'bunpro'
            ? card.bunproReviewId || stringifyPositiveNumber(card.bunproReviewableId) || card.sourceCardKey || cardKey(card)
            : source === 'wanikani'
                ? stringifyPositiveNumber(card.wanikaniAssignmentId) || ''
            : card.sourceCardKey || cardKey(card);
        return {
            providerId: source,
            providerCardId,
            providerReviewId: source === 'bunpro' ? card.bunproReviewId || providerCardId : providerCardId,
            providerReviewableId: source === 'bunpro'
                ? stringifyPositiveNumber(card.bunproReviewableId)
                : source === 'wanikani'
                    ? stringifyPositiveNumber(card.wanikaniSubjectId)
                    : undefined,
            reviewSession: source === 'bunpro' && card.bunproReviewSessionId && card.bunproReviewInputMode && card.bunproReviewEndpoint ? {
                id: card.bunproReviewSessionId,
                inputMode: card.bunproReviewInputMode,
                endpoint: card.bunproReviewEndpoint,
            } : undefined,
            kind: source === 'bunpro'
                ? bunproReviewableKind(card.bunproReviewableType)
                : source === 'wanikani' && card.wanikaniSubjectType === 'kanji'
                    ? 'kanji'
                    : source === 'wanikani' && card.wanikaniSubjectType === 'radical'
                        ? 'unknown'
                        : 'vocabulary',
            expression,
            reading,
            partOfSpeech: card.partOfSpeech.map(value => value.trim()).find(Boolean),
            language: card.language,
            meanings: card.meanings,
            state: card.cardState,
            srsLevel: source === 'bunpro' ? card.bunproSrsLevel : source === 'wanikani' ? card.wanikaniSrsStage : undefined,
            dueAt: card.dueAt,
            lastReviewAt: card.lastReviewAt,
            raw: source === 'wanikani' ? { card, subject: { type: card.wanikaniSubjectType } } : card,
        };
    }
}

type ReviewAccessRule = readonly [allowed: boolean, error: NewTabTextKey];

function assertReviewAccess(deps: Pick<NewTabReviewSubmitterDeps, 'text'>, rules: ReviewAccessRule[]): void {
    const failed = rules.find(([allowed]) => !allowed);
    if (failed) throw new Error(deps.text(failed[1]));
}

function credentialedSrsAdapter(adapter: NewTabSrsQueueAdapter | undefined, errorMessage: string): NewTabSrsQueueAdapter {
    if (!adapter?.hasCredential()) throw new Error(errorMessage);
    return adapter;
}

function applySrsReviewResult(card: JPDBCard, source: NewTabSrsAdapterSource, result: YomuSrsReviewResult): void {
    if (!result.card) return;
    card.cardState = result.card.state;
    card.dueAt = result.card.dueAt;
    if (source === 'wanikani') card.wanikaniSrsStage = result.card.srsLevel;
}

function stringifyPositiveNumber(value: number | undefined): string | undefined {
    return value !== undefined && Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : undefined;
}

function bunproReviewableKind(type: JPDBCard['bunproReviewableType']): YomuSrsReviewableKind {
    if (type === 'grammar' || type === 'vocabulary' || type === 'sentence') return type;
    return 'unknown';
}
