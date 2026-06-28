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
    lastError?: string;
}

export interface NewTabGradeQueueDeps {
    offlineEnabled: () => boolean;
    submit: (item: QueuedNewTabGrade) => Promise<boolean>;
    onSubmitted: (card: JPDBCard) => void;
}

// Offline grade write-behind queue: failed grade submissions are persisted to GM
// storage (deduped per target+card, capped) and flushed back to the providers on
// reconnect, retrying with an attempt count so a wedged grade never blocks the rest.
export class NewTabGradeQueue {
    constructor(private readonly deps: NewTabGradeQueueDeps) {}

    async enqueue(card: JPDBCard, grade: JPDBGrade, targets: QueuedNewTabGradeTarget[]): Promise<boolean> {
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
    async flush(): Promise<number> {
        const queue = await this.read();
        if (!queue.length) return 0;
        const pending: QueuedNewTabGrade[] = [];
        for (const item of queue) {
            if (!item) continue;
            try {
                const submitted = await this.deps.submit(item);
                if (submitted) this.deps.onSubmitted(item.card);
            } catch (error) {
                pending.push({
                    ...item,
                    attempts: item.attempts + 1,
                    lastError: error instanceof Error ? error.message : String(error),
                });
            }
        }
        await this.write(pending);
        return pending.length;
    }

    private key(item: Pick<QueuedNewTabGrade, 'target' | 'card'>): string {
        return `${item.target}:${cardKey(item.card)}`;
    }

    private async read(): Promise<QueuedNewTabGrade[]> {
        const queue = await gmStorageGet<QueuedNewTabGrade[] | null>(NEW_TAB_GRADE_QUEUE_KEY, null)
            .catch(() => null);
        return Array.isArray(queue) ? queue.filter(isQueuedNewTabGrade).slice(-NEW_TAB_GRADE_QUEUE_LIMIT) : [];
    }

    private write(queue: QueuedNewTabGrade[]): Promise<void> {
        return queue.length
            ? gmStorageSet(NEW_TAB_GRADE_QUEUE_KEY, queue.slice(-NEW_TAB_GRADE_QUEUE_LIMIT))
            : gmStorageDelete(NEW_TAB_GRADE_QUEUE_KEY);
    }
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
    return record.target === 'anki' || record.target === 'jpdb-api' || record.target === 'jiten-api';
}

function hasQueuedGradePayload(record: Partial<QueuedNewTabGrade>): boolean {
    return isObjectRecord(record.card) && typeof record.attempts === 'number';
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
