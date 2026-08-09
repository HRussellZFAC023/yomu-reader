import { beforeEach, describe, expect, it, vi } from 'vitest';

// Drive the queue's storage through an injected in-memory adapter rather than
// mocking the shared storage module. Historical fork-reuse runs showed that a
// pre-imported newtab controller keeps grade-queue bound to the real module,
// which a later vi.mock cannot rebind. Dependency injection is order-independent.
const store = new Map<string, unknown>();
const memoryStorage = {
    get: async <T>(key: string, fallback: T): Promise<T> => (store.has(key) ? store.get(key) as T : fallback),
    set: async (key: string, value: unknown): Promise<void> => { store.set(key, value); },
    delete: async (key: string): Promise<void> => { store.delete(key); },
};

import { NewTabGradeQueue, type NewTabGradeQueueDeps, type QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import { NEW_TAB_GRADE_QUEUE_KEY } from '../../src/reader/newtab/controller-config';
import type { JPDBCard } from '../../src/reader/app/types';

function card(spelling: string): JPDBCard {
    return { vid: 1, sid: 0, spelling, reading: spelling } as unknown as JPDBCard;
}

function stored(): QueuedNewTabGrade[] {
    return (store.get(NEW_TAB_GRADE_QUEUE_KEY) as QueuedNewTabGrade[] | undefined) ?? [];
}

function makeQueue(overrides: Partial<NewTabGradeQueueDeps> = {}) {
    const submit = vi.fn(async (_item: QueuedNewTabGrade): Promise<boolean> => true);
    const onSubmitted = vi.fn();
    const queue = new NewTabGradeQueue({ offlineEnabled: () => true, submit, onSubmitted, storage: memoryStorage, ...overrides });
    return { queue, submit, onSubmitted };
}

describe('NewTabGradeQueue.enqueue', () => {
    beforeEach(() => store.clear());

    it('persists one entry per queueable target', async () => {
        const { queue } = makeQueue();
        expect(await queue.enqueue(card('何'), 'okay', ['anki', 'jpdb-api'])).toBe(true);
        const entries = stored();
        expect(entries.map(e => e.target).sort()).toEqual(['anki', 'jpdb-api']);
        expect(entries.every(e => e.grade === 'okay' && e.attempts === 0)).toBe(true);
    });

    it('writes nothing and returns false when offline queueing is disabled', async () => {
        const { queue } = makeQueue({ offlineEnabled: () => false });
        expect(await queue.enqueue(card('何'), 'okay', ['anki'])).toBe(false);
        expect(stored()).toEqual([]);
    });

    it('returns false when no target is queueable', async () => {
        const { queue } = makeQueue();
        expect(await queue.enqueue(card('何'), 'okay', [])).toBe(false);
        expect(stored()).toEqual([]);
    });

    it('replaces an existing entry for the same target+card rather than duplicating', async () => {
        const { queue } = makeQueue();
        await queue.enqueue(card('何'), 'okay', ['anki']);
        await queue.enqueue(card('何'), 'hard', ['anki']);
        const anki = stored().filter(e => e.target === 'anki');
        expect(anki).toHaveLength(1);
        expect(anki[0]?.grade).toBe('hard');
    });

    it('drops malformed persisted entries when it rewrites the queue', async () => {
        store.set(NEW_TAB_GRADE_QUEUE_KEY, [{ garbage: true }, null, 'nope']);
        const { queue } = makeQueue();
        await queue.enqueue(card('何'), 'okay', ['anki']);
        const entries = stored();
        expect(entries).toHaveLength(1);
        expect(entries[0]?.target).toBe('anki');
    });
});

describe('NewTabGradeQueue.flush', () => {
    beforeEach(() => store.clear());

    it('submits every queued grade, notifies on success, and clears the queue', async () => {
        const { queue, submit, onSubmitted } = makeQueue();
        await queue.enqueue(card('何'), 'okay', ['anki', 'jpdb-api']);
        await queue.flush();
        expect(submit).toHaveBeenCalledTimes(2);
        expect(onSubmitted).toHaveBeenCalledTimes(2);
        expect(stored()).toEqual([]);
    });

    it('re-queues a failed submission with an incremented attempt count and the error', async () => {
        const { queue, submit, onSubmitted } = makeQueue();
        await queue.enqueue(card('何'), 'okay', ['anki', 'jpdb-api']);
        submit.mockImplementation(async (item: QueuedNewTabGrade) => {
            if (item.target === 'anki') throw new Error('anki offline');
            return true;
        });
        await queue.flush();
        const remaining = stored();
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toMatchObject({ target: 'anki', attempts: 1, lastError: 'anki offline' });
        expect(onSubmitted).toHaveBeenCalledTimes(1);
    });

    it('drops an item whose submit resolves false instead of re-queuing it (current behavior)', async () => {
        const { queue, submit, onSubmitted } = makeQueue();
        await queue.enqueue(card('何'), 'okay', ['anki']);
        submit.mockResolvedValue(false);
        await queue.flush();
        expect(onSubmitted).not.toHaveBeenCalled();
        expect(stored()).toEqual([]);
    });

    it('does nothing when the queue is empty', async () => {
        const { queue, submit } = makeQueue();
        await queue.flush();
        expect(submit).not.toHaveBeenCalled();
    });

    it('never submits malformed persisted entries', async () => {
        store.set(NEW_TAB_GRADE_QUEUE_KEY, [{ garbage: true }, null]);
        const { queue, submit } = makeQueue();
        await queue.flush();
        expect(submit).not.toHaveBeenCalled();
    });

    it('purges legacy Bunpro grades without submitting them and keeps other providers', async () => {
        const bunpro = {
            id: 'bunpro-api:legacy',
            at: Date.now(),
            target: 'bunpro-api',
            card: card('文法'),
            grade: 'pass',
            attempts: 3,
        } satisfies QueuedNewTabGrade;
        const anki = {
            id: 'anki:current',
            at: Date.now(),
            target: 'anki',
            card: card('単語'),
            grade: 'okay',
            attempts: 0,
        } satisfies QueuedNewTabGrade;
        store.set(NEW_TAB_GRADE_QUEUE_KEY, [bunpro, anki]);
        const { queue, submit } = makeQueue();

        expect(await queue.pendingCount()).toBe(1);
        expect(stored()).toEqual([anki]);
        await queue.flush();

        expect(submit).toHaveBeenCalledOnce();
        expect(submit).toHaveBeenCalledWith(anki);
        expect(stored()).toEqual([]);
    });
});
