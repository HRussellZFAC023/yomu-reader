import { gmStorageDelete, gmStorageGet, gmStorageSet } from '../app/storage';
import type { JPDBCard, JPDBGrade } from '../app/types';
import { cardKey } from '../cards/utils';
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from './controller-config';
import { queueableNewTabReviewTargets, type QueuedNewTabGradeTarget } from './review-targets';

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
    // Injectable so tests drive an in-memory store directly instead of mocking
    // the shared storage module — a vi.mock the newtab controller defeats by
    // pre-importing this module under Vitest fork reuse. Defaults to GM storage.
    storage?: NewTabGradeQueueStorage;
}

const gmGradeQueueStorage: NewTabGradeQueueStorage = {
    get: gmStorageGet,
    set: gmStorageSet,
    delete: gmStorageDelete,
};

// Offline grade write-behind queue: failed grade submissions are persisted to GM
// storage (deduped per target+card, capped) and flushed back to the providers on
// reconnect, retrying with an attempt count so a wedged grade never blocks the rest.
export class NewTabGradeQueue {
    // Read-modify-write mutex: a flush that snapshotted the queue while an
    // enqueue landed would otherwise clobber the fresh grade with its stale
    // snapshot on the final write — a silently deleted review.
    private serial: Promise<unknown> = Promise.resolve();

    private readonly storage: NewTabGradeQueueStorage;

    constructor(private readonly deps: NewTabGradeQueueDeps) {
        this.storage = deps.storage ?? gmGradeQueueStorage;
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
        const queue = await this.read();
        const entries = queueTargets.map((target): QueuedNewTabGrade => ({
            id: `${target}:${cardKey(card)}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            at: Date.now(),
            target,
            card,
            grade,
            attempts: 0,
            ...queuedGradeProviderBinding(target, providerContextForTarget),
        }));
        const entryKeys = new Set(entries.map(entry => this.key(entry)));
        const deduped = queue.filter(item => !entryKeys.has(this.key(item)));
        deduped.push(...entries);
        await this.write(deduped.slice(-NEW_TAB_GRADE_QUEUE_LIMIT));
        return true;
    }

    // Number of grades waiting to sync back to the providers (for the sync-status UI).
    async pendingCount(): Promise<number> {
        return (await this.read()).length;
    }

    // Flushes the queue and returns how many grades still remain unsynced.
    private async flushUnlocked(): Promise<number> {
        const queue = await this.read();
        if (!queue.length) return 0;
        const pending: QueuedNewTabGrade[] = [];
        for (const item of queue) {
            const retry = await this.flushItem(item);
            if (retry) pending.push(retry);
        }
        await this.write(pending);
        return pending.length;
    }

    private async flushItem(item: QueuedNewTabGrade): Promise<QueuedNewTabGrade | null> {
        if (!this.canSubmit(item)) return item;
        try {
            const submitted = await this.deps.submit(item);
            if (submitted) this.deps.onSubmitted(item.card);
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
        return item.target === 'yomu-local'
            || Boolean(item.providerContext && item.providerContext === this.deps.providerContextForTarget(item.target));
    }

    private async read(): Promise<QueuedNewTabGrade[]> {
        const stored = await this.storage.get<QueuedNewTabGrade[] | null>(NEW_TAB_GRADE_QUEUE_KEY, null)
            .catch(() => null);
        if (!Array.isArray(stored)) return [];
        const valid = stored.filter(isQueuedNewTabGrade).slice(-NEW_TAB_GRADE_QUEUE_LIMIT);
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
            ? this.storage.set(NEW_TAB_GRADE_QUEUE_KEY, queue.slice(-NEW_TAB_GRADE_QUEUE_LIMIT))
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
        attempts: item.attempts + 1,
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
