import type { QueuedNewTabGrade } from './grade-queue';
import { parseManagedStateEpoch, sameManagedStateEpoch, type ManagedStateEpoch } from '../app/managed-state-epoch';
import { isReviewQueueRecord, REVIEW_QUEUE_CHANNEL } from './review-queue-protocol';
import type { ReviewQueueSnapshot } from './review-queue-owner';

export interface ReviewActionDraft {
    epoch: ManagedStateEpoch | null;
    reviews: QueuedNewTabGrade[];
}

export interface ReviewActionDraftStorage {
    read(): unknown;
    write(draft: ReviewActionDraft): void;
    clear(): void;
}

export class ReviewDraftResetError extends Error {
    constructor() { super('The previous answer was cleared by factory reset. Reload Study.'); }
}

export class ExtensionReviewQueueClient {
    private epoch?: ManagedStateEpoch;

    constructor(
        private readonly send: (request: Record<string, unknown>) => Promise<unknown>,
        private readonly currentEpoch: () => Promise<ManagedStateEpoch>,
        private readonly drafts: ReviewActionDraftStorage,
        private readonly timeoutMs = 10_000,
    ) {}

    async record(reviews: readonly QueuedNewTabGrade[]): Promise<void> {
        if (!reviews.length || reviews.length > 4 || !reviews.every(item => isReviewQueueRecord(item) && item.attempts === 0)) {
            throw new Error('Invalid review batch.');
        }
        const captured = structuredClone([...reviews]);
        const epoch = await this.checkEpoch();
        if (this.drafts.read() !== null) throw new Error('An earlier review recording is unresolved; resume it before answering again.');
        this.drafts.write({ epoch: epoch.generation === 0 ? null : epoch, reviews: captured });
        await this.resumeRecord();
    }

    hasPendingRecord(): boolean {
        return this.drafts.read() !== null;
    }

    async resumeRecord(): Promise<QueuedNewTabGrade[] | null> {
        const draft = this.drafts.read();
        if (draft === null) return null;
        if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new Error('Invalid review action draft.');
        const value = draft as Partial<ReviewActionDraft>;
        if (!Object.hasOwn(value, 'epoch') || value.epoch === undefined || !Array.isArray(value.reviews)
            || !value.reviews.length || value.reviews.length > 4
            || !value.reviews.every(item => isReviewQueueRecord(item) && item.attempts === 0)) throw new Error('Invalid review action draft.');
        const epoch = parseManagedStateEpoch(value.epoch);
        const current = await this.currentEpoch();
        if (current.generation > epoch.generation) {
            if (JSON.stringify(this.drafts.read()) === JSON.stringify(draft)) this.drafts.clear();
            throw new ReviewDraftResetError();
        }
        this.epoch ??= epoch;
        if (!sameManagedStateEpoch(this.epoch, epoch)) throw new Error('Review draft belongs to a different reset generation.');
        await this.request({ kind: 'record', reviews: structuredClone(value.reviews) });
        if (JSON.stringify(this.drafts.read()) === JSON.stringify(draft)) this.drafts.clear();
        return structuredClone(value.reviews);
    }

    async claim(id: string, providerContext: string): Promise<QueuedNewTabGrade | null> {
        const value = await this.request({ kind: 'claim', id, providerContext });
        if (value === null) return null;
        if (!isReviewQueueRecord(value) || value.id !== id || value.providerContext !== providerContext || value.attempts !== 1) {
            throw new Error('Invalid review claim response.');
        }
        return value;
    }

    async acknowledge(id: string, providerContext: string): Promise<void> {
        await this.request({ kind: 'acknowledge', id, providerContext });
    }

    async list(): Promise<QueuedNewTabGrade[]> {
        const value = await this.request({ kind: 'list' });
        if (!Array.isArray(value) || !value.every(isReviewQueueRecord)) throw new Error('Invalid review queue response.');
        return value;
    }

    async snapshot(ids: readonly string[], scopes: readonly string[]): Promise<ReviewQueueSnapshot> {
        const value = await this.request({ kind: 'snapshot', ids: [...ids], scopes: [...scopes] });
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid review status response.');
        const result = value as Partial<ReviewQueueSnapshot>;
        const statuses = result.statuses;
        const revisions = result.revisions;
        if (!Array.isArray(result.reviews) || !result.reviews.every(isReviewQueueRecord)
            || !statuses || typeof statuses !== 'object' || Array.isArray(statuses)
            || !revisions || typeof revisions !== 'object' || Array.isArray(revisions)
            || Object.keys(statuses).length !== new Set(ids).size || Object.keys(revisions).length !== new Set(scopes).size
            || !ids.every(id => Object.hasOwn(statuses, id) && typeof statuses[id] === 'string'
                && ['pending', 'held', 'completed', 'unknown'].includes(statuses[id]))
            || !scopes.every(scope => Object.hasOwn(revisions, scope) && Number.isSafeInteger(revisions[scope]) && revisions[scope] >= 0)) {
            throw new Error('Invalid review snapshot response.');
        }
        return result as ReviewQueueSnapshot;
    }

    private async request(payload: Record<string, unknown>): Promise<unknown> {
        const before = await this.checkEpoch();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const response = await Promise.race([
                this.send({ channel: REVIEW_QUEUE_CHANNEL, epoch: before.generation === 0 ? null : before, ...payload }),
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error('Review queue response was lost; delivery outcome is unknown.')), this.timeoutMs);
                }),
            ]);
            if (!sameManagedStateEpoch(before, await this.currentEpoch())) throw new Error('Review queue reset generation changed; reload Study.');
            if (!response || typeof response !== 'object' || Array.isArray(response)) throw new Error('Invalid review queue response.');
            const result = response as { ok?: unknown; value?: unknown; error?: unknown };
            if (result.ok !== true) throw new Error(typeof result.error === 'string' ? result.error : 'Review queue request failed.');
            return result.value;
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }

    private async checkEpoch(): Promise<ManagedStateEpoch> {
        const current = await this.currentEpoch();
        this.epoch ??= structuredClone(current);
        if (!sameManagedStateEpoch(this.epoch, current)) throw new Error('Review queue reset generation changed; reload Study.');
        return current;
    }
}
