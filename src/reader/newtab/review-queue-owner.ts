import type { QueuedNewTabGrade } from './grade-queue';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';

export const NEW_TAB_GRADE_QUEUE_KEY = 'jpdb-reader-newtab-grade-queue';
export const NEW_TAB_GRADE_QUEUE_LIMIT = 200;
export const REVIEW_QUEUE_OWNER_KEY = 'yomu:private:review-delivery:v2';

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

    record(request: QueuedNewTabGrade | readonly QueuedNewTabGrade[]): Promise<void> {
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
                if (reviews.length >= this.capacity) throw new Error('Review queue is full.');
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
            const claimed = { ...review, attempts: 1 };
            await this.storage.write({ ...state, reviews: reviews.map(item => item.id === id ? claimed : item) });
            return structuredClone(claimed);
        });
    }

    acknowledge(id: string, providerContext: string): Promise<void> {
        return this.exclusive(async () => {
            const state = await this.storage.read();
            const { reviews } = state;
            const review = reviews.find(item => item.id === id);
            if (!review) return;
            if (review.attempts !== 1 || review.providerContext !== providerContext) {
                throw new Error('Review acknowledgement does not match a claimed operation.');
            }
            await this.storage.write({
                reviews: reviews.filter(item => item.id !== id),
                completed: { ...state.completed, [id]: reviewIdentity(review) },
                completionVersions: {
                    ...state.completionVersions,
                    [reviewDeliveryScope(review.target, review.providerContext ?? '')]:
                        completionRevision(state, reviewDeliveryScope(review.target, review.providerContext ?? '')) + 1,
                },
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

function completionRevision(state: ReviewQueueState, scope: string): number {
    return state.completionVersions && Object.hasOwn(state.completionVersions, scope) ? state.completionVersions[scope] : 0;
}

function reviewIdentity(review: QueuedNewTabGrade): string {
    return sensitiveFingerprint(JSON.stringify([review.providerContext, review.target, review.grade, review.card], (_key, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
    }));
}
