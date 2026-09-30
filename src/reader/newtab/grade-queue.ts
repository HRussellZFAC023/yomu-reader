import { gmStorageDelete, gmStorageGetStrict, gmStorageSet, withGmStorageLease } from '../app/storage';
import type { JPDBCard, JPDBGrade } from '../app/types';
import { cardKey } from '../cards/utils';
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from './controller-config';
import { queueableNewTabReviewTargets, type QueuedNewTabGradeTarget } from './review-targets';
import { createPackagedReviewQueueClient } from './packaged-review-queue-client';
import type { ExtensionReviewQueueClient } from './extension-review-queue-client';
import { reviewDeliveryScope } from './review-queue-owner';
import { isReviewQueueRecord } from './review-queue-protocol';

export interface QueuedNewTabGrade {
    id: string;
    at: number;
    target: QueuedNewTabGradeTarget;
    card: JPDBCard;
    grade: JPDBGrade;
    attempts: number;
    providerContext?: string;
    lastError?: string;
    /**
     * When the current claim was made: the owner stamps each claim, and the
     * shared (userscript/hosted) queue writes it just before an Anki request is
     * dispatched, so a lost reply or a crash never becomes a blind resend. 1.9.3
     * never wrote it; its `attempts` is only a retry count.
     */
    heldSince?: number;
}

export interface NewTabGradeQueueStorage {
    get: <T>(key: string, fallback: T) => Promise<T>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
}

export interface NewTabGradeQueueDeps {
    offlineEnabled: () => boolean;
    providerContextForTarget: (target: QueuedNewTabGradeTarget) => string;
    submit: (item: QueuedNewTabGrade) => Promise<boolean>;
    onSubmitted: (card: JPDBCard) => void;
    onProviderCompleted?: (target: QueuedNewTabGradeTarget) => void;
    /** False when the provider certainly cannot take a review now (AnkiConnect closed): nothing is claimed. */
    canDeliver?: (target: QueuedNewTabGradeTarget) => Promise<boolean>;
    /** Fresh provider read for a held review: true = it landed, false = it did not, undefined = cannot tell yet. */
    confirmDelivered?: (item: QueuedNewTabGrade) => Promise<boolean | undefined>;
    // Injectable so tests drive an in-memory store directly instead of mocking
    // the shared storage module — a vi.mock the newtab controller defeats by
    // pre-importing this module under Vitest fork reuse. Defaults to GM storage.
    storage?: NewTabGradeQueueStorage;
    owner?: ExtensionReviewQueueClient | null;
    /** Cross-tab exclusive section around the shared queue. Defaults to the GM storage lease. */
    exclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
}

type DeliveryOutcome = { status: 'delivered' } | { status: 'not-delivered' | 'unknown'; error?: string };
/** One flush's view of which providers can take a review right now. */
interface DeliveryProbe {
    possible(target: QueuedNewTabGradeTarget): Promise<boolean>;
    stop(target: QueuedNewTabGradeTarget): void;
}

const gmGradeQueueStorage: NewTabGradeQueueStorage = {
    get: gmStorageGetStrict,
    set: gmStorageSet,
    delete: gmStorageDelete,
};

const GRADE_QUEUE_LEASE = 'newtab-grade-queue';
/**
 * A claim another Study tab may still be sending is not held. It is held once
 * this tab saw its outcome get lost, or once it outlives any provider request:
 * a JPDB review plus its retried read-back (each up to two 30 s candidates),
 * plus the 10 s owner round trip, is about three minutes.
 */
export const HELD_REVIEW_SETTLE_MS = 5 * 60_000;
// 1.9.3 accepted network grades queued before provider contexts existed but
// never delivered them. They keep that inert status after adoption.
const UNBOUND_PROVIDER_CONTEXT = 'legacy';

// Offline grade write-behind queue. Packaged extension Study delivers through
// the one background ReviewQueueOwner; userscript/hosted Study shares the GM
// queue under a cross-tab lease. Either way a review is only claimed when its
// provider can take it, a certainly-undelivered review is retried (as 1.9.3
// did), and only a dispatched Anki answer with a lost outcome is held for the
// learner to resolve.
export class NewTabGradeQueue {
    // Read-modify-write mutex: a flush that snapshotted the queue while an
    // enqueue landed would otherwise clobber the fresh grade with its stale
    // snapshot on the final write — a silently deleted review.
    private serial: Promise<unknown> = Promise.resolve();

    private readonly storage: NewTabGradeQueueStorage;
    private readonly owner: ExtensionReviewQueueClient | null;
    private readonly exclusive: <T>(operation: () => Promise<T>) => Promise<T>;
    private ownerReady = false;
    private ownerPending: QueuedNewTabGrade[] = [];
    private readonly notifiedCompletions = new Set<string>();
    // Claims (id -> claim stamp) this tab dispatched and lost the outcome of.
    private readonly unknownClaims = new Map<string, number | undefined>();
    // Claims this tab certainly never sent, whose release reply was lost.
    private readonly unsentClaims = new Map<string, number | undefined>();
    private readonly completionVersions = new Map<string, number>();

    constructor(private readonly deps: NewTabGradeQueueDeps) {
        this.storage = deps.storage ?? gmGradeQueueStorage;
        this.owner = deps.owner !== undefined ? deps.owner : createPackagedReviewQueueClient();
        this.exclusive = deps.exclusive ?? (operation => withGmStorageLease(GRADE_QUEUE_LEASE, operation));
    }

    enqueue(
        card: JPDBCard,
        grade: JPDBGrade,
        targets: QueuedNewTabGradeTarget[],
        providerContextForTarget = this.deps.providerContextForTarget,
    ): Promise<boolean> {
        return this.locked(() => this.enqueueUnlocked(card, grade, targets, providerContextForTarget));
    }

    // Flushes the queue and returns how many grades still remain unsynced.
    flush(): Promise<number> {
        return this.locked(async () => {
            if (this.owner) return this.flushOwned();
            // Focus and visibility flush often; an empty queue needs no cross-tab lease.
            if (!(await this.read()).length) return 0;
            return this.exclusive(() => this.flushShared());
        });
    }

    /** Held reviews for the current provider accounts, awaiting "Check again" or "Discard". */
    heldReviews(): Promise<QueuedNewTabGrade[]> {
        return this.locked(() => this.heldReviewsUnlocked());
    }

    /** Resolves each held review from a fresh provider read, then resends the ones that did not land. */
    async recheckHeld(): Promise<number> {
        await this.locked(async () => {
            for (const item of await this.heldReviewsUnlocked()) {
                const landed = await (this.deps.confirmDelivered?.(item) ?? Promise.resolve(undefined)).catch(() => undefined);
                if (landed !== undefined) await this.resolveHeld(item, landed);
            }
        });
        return this.flush();
    }

    /** The learner chose to drop held reviews whose outcome is unknown. */
    discardHeld(): Promise<void> {
        return this.locked(async () => {
            const held = await this.heldReviewsUnlocked();
            if (this.owner) {
                for (const item of held) {
                    await this.owner.discard(item.id, item.providerContext ?? '');
                    this.unknownClaims.delete(item.id);
                }
                return;
            }
            const claims = new Map(held.map(item => [item.id, item.heldSince]));
            await this.exclusive(async () => this.write((await this.read()).filter(item => !sameClaim(claims, item))));
        });
    }

    // Number of grades waiting to sync back to the providers (for the sync-status UI).
    async pendingCount(): Promise<number> {
        if (this.owner) return (await this.owner.list()).length;
        return (await this.read()).length;
    }

    needsRecordingRecovery(): boolean {
        try { return this.owner?.hasPendingRecord() ?? false; }
        catch { return true; }
    }

    usesSharedOwner(): boolean { return this.owner !== null; }

    blocksReview(card: JPDBCard): boolean {
        return Boolean(this.owner && (this.needsRecordingRecovery() || !this.ownerReady
            || this.ownerPending.some(item => this.providerIsCurrent(item) && cardKey(item.card) === cardKey(card))));
    }

    recoverRecording(): Promise<QueuedNewTabGrade[] | null> {
        return this.locked(() => this.owner?.resumeRecord() ?? Promise.resolve(null));
    }

    private locked<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.serial.then(operation, operation);
        this.serial = next.then(() => undefined, () => undefined);
        return next;
    }

    private async enqueueUnlocked(
        card: JPDBCard,
        grade: JPDBGrade,
        targets: QueuedNewTabGradeTarget[],
        providerContextForTarget: NewTabGradeQueueDeps['providerContextForTarget'],
    ): Promise<boolean> {
        const queueTargets = queueableNewTabReviewTargets(targets);
        if (!queueTargets.length || !this.deps.offlineEnabled()) return false;
        const entries = queueTargets.map((target): QueuedNewTabGrade => ({
            id: this.owner ? `${target}:${crypto.randomUUID()}` : `${target}:${cardKey(card)}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            at: Date.now(),
            target,
            card,
            grade,
            attempts: 0,
            ...queuedGradeProviderBinding(target, providerContextForTarget),
        }));
        if (this.owner) {
            await this.owner.record(entries.map(item => ({ ...item, providerContext: item.providerContext ?? '' })));
            this.ownerPending.push(...structuredClone(entries));
            return true;
        }
        return this.exclusive(async () => {
            const queue = await this.read();
            const entryKeys = new Set(entries.map(entry => this.key(entry)));
            if (queue.some(item => item.heldSince !== undefined && entryKeys.has(this.key(item)))) return false;
            const deduped = queue.filter(item => !entryKeys.has(this.key(item)));
            deduped.push(...entries);
            if (deduped.length > NEW_TAB_GRADE_QUEUE_LIMIT) return false;
            await this.write(deduped);
            return true;
        });
    }

    private async heldReviewsUnlocked(): Promise<QueuedNewTabGrade[]> {
        const reviews = this.owner ? await this.owner.list() : await this.read();
        return reviews.filter(item => this.providerIsCurrent(item) && !this.notifiedCompletions.has(item.id)
            && !sameClaim(this.unsentClaims, item) && this.outcomeUnknown(item));
    }

    /** Held means the outcome is unknown, never "another tab may still be sending it". */
    private outcomeUnknown(item: QueuedNewTabGrade): boolean {
        const claimed = this.owner ? item.attempts > 0 : item.heldSince !== undefined;
        return claimed && (sameClaim(this.unknownClaims, item) || Date.now() - (item.heldSince ?? 0) >= HELD_REVIEW_SETTLE_MS);
    }

    private async resolveHeld(item: QueuedNewTabGrade, landed: boolean): Promise<void> {
        if (this.owner) {
            const context = item.providerContext ?? '';
            if (landed) this.notifySubmitted(item);
            await (landed ? this.owner.acknowledge(item.id, context) : this.owner.release(item.id, context, item.heldSince));
            this.unknownClaims.delete(item.id);
            return;
        }
        await this.exclusive(async () => {
            const queue = await this.read();
            // Only the dispatch that was checked: a newer one has its own outcome.
            if (!queue.some(entry => entry.id === item.id && entry.heldSince === item.heldSince)) return;
            if (landed) this.deps.onSubmitted(item.card);
            await this.write(landed
                ? queue.filter(entry => entry.id !== item.id)
                : queue.map(entry => entry.id === item.id ? withoutHold(entry) : entry));
            this.unknownClaims.delete(item.id);
        });
    }

    private async flushOwned(): Promise<number> {
        const owner = this.owner!;
        this.ownerReady = false;
        // Retried on every flush; a failed hand-over must never lock Study.
        await this.adoptLegacyQueue(owner).catch(() => undefined);
        await this.refreshOwnerPending();
        if (!this.needsRecordingRecovery()) {
            const deliverable = this.deliveryProbe();
            for (const item of this.ownerPending) await this.deliverOwned(owner, item, deliverable);
        }
        await this.refreshOwnerPending();
        this.ownerReady = true;
        return this.ownerPending.length;
    }

    /**
     * 1.9.3's offline queue lives under the same key (and hosted Study over the
     * extension storage bridge still writes it). Hand its reviews to the owner
     * with their original ids (so a repeated hand-over is a no-op), then retire
     * exactly what the owner now has. The owner takes only what fits, and held
     * entries belong to a hosted Study tab still resolving them: whatever stays
     * in the key waits for a later flush, never erased and never blocking Study.
     */
    private async adoptLegacyQueue(owner: ExtensionReviewQueueClient): Promise<void> {
        if (!(await this.read()).some(item => item.heldSince === undefined)) return;
        await this.exclusive(async () => {
            const legacy = await this.read();
            const adoptable = legacy.filter(item => item.heldSince === undefined).map(adoptedReview)
                .filter(isReviewQueueRecord).slice(0, NEW_TAB_GRADE_QUEUE_LIMIT);
            if (!adoptable.length) return;
            // The hand-over is atomic and its reply may be lost: one snapshot settles it either way.
            await owner.adopt(adoptable).catch(() => undefined);
            const { statuses } = await owner.snapshot(adoptable.map(item => item.id), []);
            const adopted = new Set(adoptable.filter(item => statuses[item.id] !== 'unknown').map(item => item.id));
            if (adopted.size) await this.write(legacy.filter(item => !adopted.has(item.id)));
        });
    }

    private async deliverOwned(owner: ExtensionReviewQueueClient, item: QueuedNewTabGrade, deliverable: DeliveryProbe): Promise<void> {
        if (!this.providerIsCurrent(item)) return;
        const context = item.providerContext ?? '';
        if (item.attempts !== 0) {
            // This tab already knows the outcome; only the owner's answer was lost.
            if (this.notifiedCompletions.has(item.id)) await owner.acknowledge(item.id, context);
            else if (this.unsentClaims.has(item.id)) await this.releaseClaim(owner, item.id, context, this.unsentClaims.get(item.id));
            return;
        }
        if (!await deliverable.possible(item.target)) return;
        const claimed = await owner.claim(item.id, context);
        if (!claimed) return;
        const outcome = this.providerIsCurrent(claimed) ? await this.dispatch(claimed, deliverable) : { status: 'not-delivered' as const };
        if (outcome.status === 'delivered') {
            this.notifySubmitted(claimed);
            await owner.acknowledge(claimed.id, context).catch(() => undefined);
        } else if (outcome.status === 'not-delivered') {
            this.unsentClaims.set(claimed.id, claimed.heldSince);
            await this.releaseClaim(owner, claimed.id, context, claimed.heldSince).catch(() => undefined);
        } else {
            // The durable claim stays held until the learner resolves it.
            this.unknownClaims.set(claimed.id, claimed.heldSince);
        }
    }

    private async releaseClaim(owner: ExtensionReviewQueueClient, id: string, context: string, heldSince: number | undefined): Promise<void> {
        await owner.release(id, context, heldSince);
        this.unsentClaims.delete(id);
    }

    private async refreshOwnerPending(): Promise<void> {
        const owner = this.owner!;
        const scopes = (['anki', 'jpdb-api', 'jiten-api', 'yomu-local'] as const).map(target => {
            const context = this.deps.providerContextForTarget(target);
            return { target, context, key: reviewDeliveryScope(target, context) };
        });
        const ids = this.ownerPending.map(item => item.id);
        const { reviews: pending, statuses, revisions } = await owner.snapshot(ids.slice(0, NEW_TAB_GRADE_QUEUE_LIMIT), scopes.map(scope => scope.key));
        // A snapshot names at most the owner's capacity, but a tab that recorded while
        // another tab drained a full owner tracks a few more: ask about those separately.
        for (let start = NEW_TAB_GRADE_QUEUE_LIMIT; start < ids.length; start += NEW_TAB_GRADE_QUEUE_LIMIT) {
            Object.assign(statuses, (await owner.snapshot(ids.slice(start, start + NEW_TAB_GRADE_QUEUE_LIMIT), [])).statuses);
        }
        const missing = this.ownerPending.filter(item => !pending.some(current => current.id === item.id));
        if (missing.some(item => statuses[item.id] === 'unknown')) throw new Error('Review completion could not be verified.');
        if (scopes.some(scope => revisions[scope.key] < (this.completionVersions.get(scope.key) ?? 0))) {
            throw new Error('Review completion history changed unexpectedly.');
        }
        for (const item of missing) if (statuses[item.id] === 'completed') this.notifySubmitted(item);
        for (const scope of scopes) {
            const revision = revisions[scope.key];
            if (scope.context !== this.deps.providerContextForTarget(scope.target)) continue;
            if (revision > (this.completionVersions.get(scope.key) ?? 0)) {
                this.deps.onProviderCompleted?.(scope.target);
            }
            this.completionVersions.set(scope.key, revision);
        }
        this.ownerPending = pending;
    }

    private notifySubmitted(item: QueuedNewTabGrade): void {
        if (this.notifiedCompletions.has(item.id) || !this.providerIsCurrent(item)) return;
        this.deps.onSubmitted(item.card);
        this.notifiedCompletions.add(item.id);
    }

    private async flushShared(): Promise<number> {
        const queue = await this.read();
        if (!queue.length) return 0;
        let pending = [...queue];
        const replace = (id: string, next: QueuedNewTabGrade | null): void => {
            pending = next ? pending.map(entry => entry.id === id ? next : entry) : pending.filter(entry => entry.id !== id);
        };
        const deliverable = this.deliveryProbe();
        for (const item of queue) {
            if (!this.canSubmit(item) || !await deliverable.possible(item.target)) continue;
            const dispatched = item.target === 'anki' ? { ...item, heldSince: Date.now() } : item;
            if (dispatched !== item) {
                replace(item.id, dispatched);
                // Failure here must prevent the external side effect. A crash
                // after this write leaves a held review, never a blind retry.
                await this.write(pending);
                if (!this.providerIsCurrent(item)) {
                    replace(item.id, item);
                    continue;
                }
            }
            const outcome = await this.dispatch(dispatched, deliverable);
            if (outcome.status === 'delivered') this.deps.onSubmitted(item.card);
            if (outcome.status === 'unknown') this.unknownClaims.set(item.id, dispatched.heldSince);
            replace(item.id, outcome.status === 'delivered' ? null
                : outcome.status === 'unknown' ? { ...dispatched, lastError: outcome.error }
                    : { ...item, attempts: item.attempts + 1, lastError: outcome.error });
        }
        await this.write(pending);
        return pending.length;
    }

    private async dispatch(item: QueuedNewTabGrade, deliverable: DeliveryProbe): Promise<DeliveryOutcome> {
        try {
            return await this.deps.submit(item) ? { status: 'delivered' } : { status: 'not-delivered', error: 'Review was not submitted.' };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A failed JPDB/Jiten/local review is retried, as 1.9.3 did. AnkiConnect
            // answered the probe, so a failed Anki answer may still have landed:
            // hold it, and send no further Anki answers this pass.
            if (item.target !== 'anki') return { status: 'not-delivered', error: message };
            deliverable.stop('anki');
            return { status: 'unknown', error: message };
        }
    }

    private deliveryProbe(): DeliveryProbe {
        const results = new Map<QueuedNewTabGradeTarget, Promise<boolean>>();
        return {
            possible: target => {
                let result = results.get(target);
                if (!result) {
                    result = this.deliveryPossible(target);
                    results.set(target, result);
                }
                return result;
            },
            stop: target => { results.set(target, Promise.resolve(false)); },
        };
    }

    private async deliveryPossible(target: QueuedNewTabGradeTarget): Promise<boolean> {
        // Anki and local reviews do not need the internet; AnkiConnect answers its own probe.
        if (target !== 'anki' && target !== 'yomu-local' && typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        return this.deps.canDeliver ? this.deps.canDeliver(target).catch(() => false) : true;
    }

    private key(item: Pick<QueuedNewTabGrade, 'target' | 'card'>): string {
        const context = 'providerContext' in item ? item.providerContext ?? 'legacy' : 'legacy';
        return `${context}:${item.target}:${cardKey(item.card)}`;
    }

    private canSubmit(item: QueuedNewTabGrade): boolean {
        return item.heldSince === undefined && this.providerIsCurrent(item);
    }

    private providerIsCurrent(item: QueuedNewTabGrade): boolean {
        return item.target === 'yomu-local'
            || Boolean(item.providerContext && item.providerContext === this.deps.providerContextForTarget(item.target));
    }

    private async read(): Promise<QueuedNewTabGrade[]> {
        const stored = await this.storage.get<QueuedNewTabGrade[] | null>(NEW_TAB_GRADE_QUEUE_KEY, null);
        if (!Array.isArray(stored)) return [];
        const valid = stored.filter(isQueuedNewTabGrade);
        // Bunpro grades are valid only inside the live review session that
        // issued the queue item. Builds before 1.6.117 could persist them for
        // offline retry without that session, so purge those legacy entries
        // instead of retrying a consumed/stale review id forever.
        const queue = valid.filter(item => item.target !== 'bunpro-api');
        if (queue.length !== valid.length) await this.write(queue).catch(() => undefined);
        return queue;
    }

    private write(queue: QueuedNewTabGrade[]): Promise<void> {
        return queue.length
            ? this.storage.set(NEW_TAB_GRADE_QUEUE_KEY, queue)
            : this.storage.delete(NEW_TAB_GRADE_QUEUE_KEY);
    }
}

function queuedGradeProviderBinding(
    target: QueuedNewTabGradeTarget,
    providerContextForTarget: NewTabGradeQueueDeps['providerContextForTarget'],
): Pick<QueuedNewTabGrade, 'providerContext'> | Record<string, never> {
    return target === 'yomu-local' ? {} : { providerContext: providerContextForTarget(target) };
}

/** True when `item` is still the very claim (or dispatch) recorded for its id. */
function sameClaim(claims: ReadonlyMap<string, number | undefined>, item: QueuedNewTabGrade): boolean {
    return claims.has(item.id) && claims.get(item.id) === item.heldSince;
}

function withoutHold(item: QueuedNewTabGrade): QueuedNewTabGrade {
    const { heldSince: _held, ...pending } = item;
    return pending;
}

/** A 1.9.3 queue entry as an owner record: its `attempts` was only a retry count. */
function adoptedReview(item: QueuedNewTabGrade): QueuedNewTabGrade {
    return {
        ...withoutHold(item),
        attempts: 0,
        providerContext: item.target === 'yomu-local' ? '' : item.providerContext || UNBOUND_PROVIDER_CONTEXT,
    };
}

function isQueuedNewTabGrade(value: unknown): value is QueuedNewTabGrade {
    if (!isObjectRecord(value)) return false;
    const record = value as Partial<QueuedNewTabGrade>;
    return hasQueuedGradeIdentity(record)
        && hasQueuedGradeTarget(record)
        && isJpdbGrade(record.grade)
        && hasQueuedGradePayload(record);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object');
}

function hasQueuedGradeIdentity(record: Partial<QueuedNewTabGrade>): boolean {
    return typeof record.id === 'string'
        && typeof record.at === 'number';
}

function hasQueuedGradeTarget(record: Partial<QueuedNewTabGrade>): boolean {
    return record.target === 'anki'
        || record.target === 'jpdb-api'
        || record.target === 'jiten-api'
        || record.target === 'bunpro-api'
        || record.target === 'yomu-local';
}

function hasQueuedGradePayload(record: Partial<QueuedNewTabGrade>): boolean {
    return isObjectRecord(record.card)
        && typeof record.attempts === 'number'
        && (record.providerContext === undefined || typeof record.providerContext === 'string')
        && (record.heldSince === undefined || typeof record.heldSince === 'number');
}

function isJpdbGrade(value: unknown): value is JPDBGrade {
    return value === 'nothing'
        || value === 'something'
        || value === 'hard'
        || value === 'okay'
        || value === 'easy'
        || value === 'fail'
        || value === 'pass';
}
