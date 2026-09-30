import type { QueuedNewTabGrade } from './grade-queue';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';

export const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
export const NEW_TAB_GRADE_QUEUE_LIMIT = 200;
export const REVIEW_QUEUE_OWNER_KEY = 'yomu:private:review-delivery:v2';
export const REVIEW_QUEUE_FULL_ERROR = 'Review queue is full.';
/**
 * Completion receipts only exist to dedupe a replayed record or claim, which can
 * only arrive from a draft or tab that is still open. Keep the newest few hundred
 * so the stored value (and every rewrite of it) stays small forever.
 */
export const REVIEW_RECEIPT_LIMIT = 500;

export interface ReviewQueueOwnerStorage {
    read(): Promise<ReviewQueueState>;
    write(state: ReviewQueueState): Promise<void>;
}

export interface ReviewQueueState {
    reviews: QueuedNewTabGrade[];
    completed: Record<string, string>;
    completionVersions?: Record<string, number>;
}

export type ReviewDeliveryStatus = 'pending' | 'held' | 'completed' | 'unknown';

export interface ReviewQueueSnapshot {
    reviews: QueuedNewTabGrade[];
    statuses: Record<string, ReviewDeliveryStatus>;
    revisions: Record<string, number>;
}

export function reviewDeliveryScope(target: QueuedNewTabGrade['target'], providerContext: string): string {
    return `${target}:${providerContext}`;
}

/** One instance in the persistence-owning runtime, not one per Study tab. */
export class ReviewQueueOwner {
    private tail: Promise<unknown> = Promise.resolve();

    constructor(private readonly storage: ReviewQueueOwnerStorage, private readonly capacity: number) {}

    /**
     * Records new answers atomically. `adopting` hands over reviews an earlier
     * release already accepted (its offline queue): they are taken only while
     * there is room, and the rest wait in that queue for a later hand-over
     * instead of refusing the batch. Nothing ever takes the owner past capacity,
     * because every Study tab's snapshot names each review it holds.
     */
    record(request: QueuedNewTabGrade | readonly QueuedNewTabGrade[], adopting = false): Promise<void> {
        const requested = structuredClone(Array.isArray(request) ? request : [request]) as QueuedNewTabGrade[];
        return this.exclusive(async () => {
            const state = await this.storage.read();
            const reviews = [...state.reviews];
            for (const review of requested) {
                const identity = reviewIdentity(review);
                if (Object.hasOwn(state.completed, review.id)) {
                    if (state.completed[review.id] !== identity) throw new Error('Completed review identity was reused.');
                    continue;
                }
                const existing = reviews.find(item => item.id === review.id);
                if (existing) {
                    if (reviewIdentity(existing) !== identity) throw new Error('Review operation identity was reused for a different answer.');
                    continue;
                }
                if (review.attempts !== 0) throw new Error('New reviews must not have a delivery attempt.');
                if (reviews.length >= this.capacity) {
                    if (adopting) continue;
                    throw new Error(REVIEW_QUEUE_FULL_ERROR);
                }
                reviews.push(review);
            }
            if (reviews.length !== state.reviews.length) await this.storage.write({ ...state, reviews });
        });
    }

    claim(id: string, providerContext: string): Promise<QueuedNewTabGrade | null> {
        return this.exclusive(async () => {
            const state = await this.storage.read();
            const { reviews } = state;
            const review = reviews.find(item => item.id === id);
            if (!review || review.attempts !== 0 || review.providerContext !== providerContext) return null;
            // The stamp names this claim: only its own outcome can release it,
            // and a claim is held (outcome unknown) only once it outlives any
            // provider request another tab could still be sending.
            const claimed = { ...review, attempts: 1, heldSince: Date.now() };
            await this.storage.write({ ...state, reviews: reviews.map(item => item.id === id ? claimed : item) });
            return structuredClone(claimed);
        });
    }

    /**
     * Returns a claim to pending when its request was certainly not delivered.
     * With `heldSince`, only that claim is released, never a newer one another
     * tab made after this release's first reply was lost.
     */
    release(id: string, providerContext: string, heldSince?: number): Promise<void> {
        return this.exclusive(async () => {
            const state = await this.storage.read();
            const review = state.reviews.find(item => item.id === id);
            if (review?.attempts !== 1 || review.providerContext !== providerContext
                || (heldSince !== undefined && review.heldSince !== heldSince)) return;
            const { heldSince: _claim, ...pending } = review;
            await this.storage.write({ ...state, reviews: state.reviews.map(item => item.id === id ? { ...pending, attempts: 0 } : item) });
        });
    }

    /** The provider confirmed the claimed review. */
    acknowledge(id: string, providerContext: string): Promise<void> {
        return this.resolve(id, providerContext);
    }

    /** The learner chose to drop a claimed review whose outcome is unknown. */
    discard(id: string, providerContext: string): Promise<void> {
        return this.resolve(id, providerContext);
    }

    private resolve(id: string, providerContext: string): Promise<void> {
        return this.exclusive(async () => {
            const state = await this.storage.read();
            const review = claimedReview(state, id, providerContext);
            if (!review) return;
            const scope = reviewDeliveryScope(review.target, review.providerContext ?? '');
            await this.storage.write({
                reviews: state.reviews.filter(item => item.id !== id),
                completed: boundedReceipts(state.completed, id, reviewIdentity(review)),
                completionVersions: { ...state.completionVersions, [scope]: completionRevision(state, scope) + 1 },
            });
        });
    }

    list(): Promise<QueuedNewTabGrade[]> {
        return this.snapshot([], []).then(snapshot => snapshot.reviews);
    }

    snapshot(ids: readonly string[], scopes: readonly string[]): Promise<ReviewQueueSnapshot> {
        const requested = [...ids];
        const requestedScopes = [...scopes];
        return this.exclusive(async () => {
            const state = await this.storage.read();
            const statuses = Object.fromEntries(requested.map(id => {
                const pending = state.reviews.find(item => item.id === id);
                const status: ReviewDeliveryStatus = pending ? pending.attempts > 0 ? 'held' : 'pending'
                    : Object.hasOwn(state.completed, id) ? 'completed' : 'unknown';
                return [id, status];
            }));
            return {
                reviews: structuredClone(state.reviews), statuses,
                revisions: Object.fromEntries(requestedScopes.map(scope => [scope, completionRevision(state, scope)])),
            };
        });
    }

    private exclusive<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.tail.then(operation, operation);
        this.tail = result.then(() => undefined, () => undefined);
        return result;
    }
}

function claimedReview(state: ReviewQueueState, id: string, providerContext: string): QueuedNewTabGrade | null {
    const review = state.reviews.find(item => item.id === id);
    if (!review) return null;
    if (review.attempts !== 1 || review.providerContext !== providerContext) {
        throw new Error('Review acknowledgement does not match a claimed operation.');
    }
    return review;
}

function boundedReceipts(completed: Record<string, string>, id: string, identity: string): Record<string, string> {
    const kept = Object.entries(completed).filter(([key]) => key !== id);
    kept.push([id, identity]);
    return Object.fromEntries(kept.slice(-REVIEW_RECEIPT_LIMIT));
}

function completionRevision(state: ReviewQueueState, scope: string): number {
    return state.completionVersions && Object.hasOwn(state.completionVersions, scope) ? state.completionVersions[scope] : 0;
}

function reviewIdentity(review: QueuedNewTabGrade): string {
    return sensitiveFingerprint(JSON.stringify([review.providerContext, review.target, review.grade, review.card], (_key, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
    }));
}
