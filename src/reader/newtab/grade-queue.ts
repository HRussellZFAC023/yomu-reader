import { gmStorageDelete, gmStorageGetStrict, gmStorageSet } from '../app/storage';
import type { JPDBCard, JPDBGrade } from '../app/types';
import { cardKey } from '../cards/utils';
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from './controller-config';
import { queueableNewTabReviewTargets, type QueuedNewTabGradeTarget } from './review-targets';
import { createPackagedReviewQueueClient } from './packaged-review-queue-client';
import type { ExtensionReviewQueueClient } from './extension-review-queue-client';
import { reviewDeliveryScope } from './review-queue-owner';

export interface QueuedNewTabGrade {
    id: string;
    at: number;
    target: QueuedNewTabGradeTarget;
    card: JPDBCard;
    grade: JPDBGrade;
    attempts: number;
    providerContext?: string;
    lastError?: string;
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
    // Injectable so tests drive an in-memory store directly instead of mocking
    // the shared storage module — a vi.mock the newtab controller defeats by
    // pre-importing this module under Vitest fork reuse. Defaults to GM storage.
    storage?: NewTabGradeQueueStorage;
    owner?: ExtensionReviewQueueClient | null;
}

const gmGradeQueueStorage: NewTabGradeQueueStorage = {
    get: gmStorageGetStrict,
    set: gmStorageSet,
    delete: gmStorageDelete,
};

// Offline grade write-behind queue: failed grade submissions are persisted to GM
// storage (deduped per target+card, capped) and flushed back to the providers on
// reconnect. Anki attempts are durable before dispatch; subsequent loads hold
// them rather than replaying an operation without an idempotency key.
export class NewTabGradeQueue {
    // Read-modify-write mutex: a flush that snapshotted the queue while an
    // enqueue landed would otherwise clobber the fresh grade with its stale
    // snapshot on the final write — a silently deleted review.
    private serial: Promise<unknown> = Promise.resolve();

    private readonly storage: NewTabGradeQueueStorage;
    private readonly owner: ExtensionReviewQueueClient | null;
    private ownerReady = false;
    private ownerPending: QueuedNewTabGrade[] = [];
    private legacyPending = false;
    private readonly notifiedCompletions = new Set<string>();
    private readonly completionVersions = new Map<string, number>();

    constructor(private readonly deps: NewTabGradeQueueDeps) {
        this.storage = deps.storage ?? gmGradeQueueStorage;
        this.owner = deps.owner !== undefined ? deps.owner : createPackagedReviewQueueClient();
    }

    enqueue(
        card: JPDBCard,
        grade: JPDBGrade,
        targets: QueuedNewTabGradeTarget[],
        providerContextForTarget = this.deps.providerContextForTarget,
    ): Promise<boolean> {
        return this.locked(() => this.enqueueUnlocked(card, grade, targets, providerContextForTarget));
    }

    flush(): Promise<number> {
        return this.locked(() => this.flushUnlocked());
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
        const queue = await this.read();
        const entryKeys = new Set(entries.map(entry => this.key(entry)));
        if (queue.some(item => item.target === 'anki' && item.attempts > 0 && entryKeys.has(this.key(item)))) return false;
        const deduped = queue.filter(item => !entryKeys.has(this.key(item)));
        deduped.push(...entries);
        if (deduped.length > NEW_TAB_GRADE_QUEUE_LIMIT) return false;
        await this.write(deduped);
        return true;
    }

    // Number of grades waiting to sync back to the providers (for the sync-status UI).
    async pendingCount(): Promise<number> {
        if (this.owner) return (await this.owner.list()).length;
        return (await this.read()).length;
    }

    async hasUncertainReviews(): Promise<boolean> {
        if (this.owner) return this.legacyPending || (await this.owner.list()).some(item => item.attempts > 0);
        return (await this.read()).some(item => item.target === 'anki' && item.attempts > 0);
    }

    needsRecordingRecovery(): boolean {
        try { return this.owner?.hasPendingRecord() ?? false; }
        catch { return true; }
    }

    usesSharedOwner(): boolean { return this.owner !== null; }

    blocksReview(card: JPDBCard): boolean {
        return Boolean(this.owner && (this.needsRecordingRecovery() || !this.ownerReady || this.legacyPending
            || this.ownerPending.some(item => this.providerIsCurrent(item) && cardKey(item.card) === cardKey(card))));
    }

    recoverRecording(): Promise<QueuedNewTabGrade[] | null> {
        return this.locked(() => this.owner?.resumeRecord() ?? Promise.resolve(null));
    }

    private async flushOwned(): Promise<number> {
        const owner = this.owner!;
        this.ownerReady = false;
        const legacy = await this.storage.get<unknown>(NEW_TAB_GRADE_QUEUE_KEY, null);
        this.legacyPending = legacy !== null && (!Array.isArray(legacy) || legacy.length > 0);
        await this.refreshOwnerPending();
        if (!this.needsRecordingRecovery() && !this.legacyPending) {
            for (const item of this.ownerPending) {
                if (!this.providerIsCurrent(item)) continue;
                if (item.attempts !== 0) {
                    if (this.notifiedCompletions.has(item.id)) await owner.acknowledge(item.id, item.providerContext ?? '');
                    continue;
                }
                const claimed = await owner.claim(item.id, item.providerContext ?? '');
                if (!claimed || !this.providerIsCurrent(claimed)) continue;
                try {
                    if (await this.deps.submit(claimed)) {
                        this.notifySubmitted(claimed);
                        await owner.acknowledge(claimed.id, claimed.providerContext ?? '');
                    }
                } catch { /* The durable claim remains held until its native outcome is resolved. */ }
            }
        }
        await this.refreshOwnerPending();
        this.ownerReady = true;
        return this.ownerPending.length;
    }

    private async refreshOwnerPending(): Promise<void> {
        const owner = this.owner!;
        const scopes = (['anki', 'jpdb-api', 'jiten-api', 'yomu-local'] as const).map(target => {
            const context = this.deps.providerContextForTarget(target);
            return { target, context, key: reviewDeliveryScope(target, context) };
        });
        const { reviews: pending, statuses, revisions } = await owner.snapshot(this.ownerPending.map(item => item.id), scopes.map(scope => scope.key));
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

    // Flushes the queue and returns how many grades still remain unsynced.
    private async flushUnlocked(): Promise<number> {
        if (this.owner) return this.flushOwned();
        const queue = await this.read();
        if (!queue.length) return 0;
        let pending = [...queue];
        for (const item of queue) {
            if (!this.canSubmit(item)) continue;
            const attempted = item.target === 'anki' ? { ...item, attempts: 1 } : item;
            if (attempted !== item) {
                pending = pending.map(entry => entry.id === item.id ? attempted : entry);
                // Failure here must prevent the external side effect. A crash
                // after this write leaves a held review, never a blind retry.
                await this.write(pending);
            }
            if (!this.providerIsCurrent(attempted)) continue;
            const retry = await this.flushItem(attempted);
            pending = retry
                ? pending.map(entry => entry.id === item.id ? retry : entry)
                : pending.filter(entry => entry.id !== item.id);
        }
        await this.write(pending);
        return pending.length;
    }

    private async flushItem(item: QueuedNewTabGrade): Promise<QueuedNewTabGrade | null> {
        try {
            const submitted = await this.deps.submit(item);
            if (!submitted) return item;
            this.deps.onSubmitted(item.card);
            return null;
        } catch (error) {
            return failedQueuedGrade(item, error);
        }
    }

    private key(item: Pick<QueuedNewTabGrade, 'target' | 'card'>): string {
        const context = 'providerContext' in item ? item.providerContext ?? 'legacy' : 'legacy';
        return `${context}:${item.target}:${cardKey(item.card)}`;
    }

    private canSubmit(item: QueuedNewTabGrade): boolean {
        if (item.target === 'anki' && item.attempts > 0) return false;
        return this.providerIsCurrent(item);
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

function failedQueuedGrade(item: QueuedNewTabGrade, error: unknown): QueuedNewTabGrade {
    return {
        ...item,
        attempts: item.target === 'anki' ? item.attempts : item.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
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
        && (record.providerContext === undefined || typeof record.providerContext === 'string');
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
