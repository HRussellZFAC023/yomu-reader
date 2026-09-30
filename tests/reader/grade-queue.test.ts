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

import { HELD_REVIEW_SETTLE_MS, NewTabGradeQueue, type NewTabGradeQueueDeps, type QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from '../../src/reader/newtab/controller-config';
import type { JPDBCard } from '../../src/reader/app/types';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

function card(spelling: string): JPDBCard {
    return { vid: 1, sid: 0, spelling, reading: spelling } as unknown as JPDBCard;
}

function stored(): QueuedNewTabGrade[] {
    return (store.get(NEW_TAB_GRADE_QUEUE_KEY) as QueuedNewTabGrade[] | undefined) ?? [];
}

function makeQueue(overrides: Partial<NewTabGradeQueueDeps> = {}) {
    const submit = vi.fn(async (_item: QueuedNewTabGrade): Promise<boolean> => true);
    const onSubmitted = vi.fn();
    const queue = new NewTabGradeQueue({ offlineEnabled: () => true, providerContextForTarget: () => 'account-a', submit, onSubmitted, storage: memoryStorage, ...overrides });
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

    it('refuses a full queue instead of evicting unresolved learner reviews', async () => {
        const entries = Array.from({ length: NEW_TAB_GRADE_QUEUE_LIMIT }, (_, index): QueuedNewTabGrade => ({
            id: `held-${index}`, at: index, target: 'anki', card: card(`単語${index}`),
            grade: 'okay', attempts: 1, providerContext: 'account-a',
        }));
        store.set(NEW_TAB_GRADE_QUEUE_KEY, entries);
        const { queue } = makeQueue();
        expect(await queue.enqueue(card('追加'), 'easy', ['anki'])).toBe(false);
        expect(stored()).toEqual(entries);
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

    it('persists the Anki attempt before dispatch and holds it after a lost response across restart', async () => {
        const submit = vi.fn(async () => {
            expect(stored()[0]?.heldSince).toEqual(expect.any(Number));
            throw new Error('response lost after commit');
        });
        const { queue, onSubmitted } = makeQueue({ submit });
        await queue.enqueue(card('読む'), 'okay', ['anki']);
        expect(await queue.flush()).toBe(1);
        expect(stored()[0]).toMatchObject({ attempts: 0, heldSince: expect.any(Number), lastError: 'response lost after commit' });
        expect(await queue.heldReviews()).not.toHaveLength(0);
        const restarted = makeQueue({ submit });
        expect(await restarted.queue.flush()).toBe(1);
        expect(submit).toHaveBeenCalledOnce();
        expect(onSubmitted).not.toHaveBeenCalled();
        expect(await restarted.queue.enqueue(card('読む'), 'easy', ['anki'])).toBe(false);
        expect(stored()[0]?.grade).toBe('okay');
    });

    it('does not dispatch when the durable Anki attempt cannot be recorded', async () => {
        const { queue } = makeQueue();
        await queue.enqueue(card('読む'), 'okay', ['anki']);
        const write = vi.fn(async () => { throw new Error('disk full'); });
        const failing = makeQueue({ storage: { ...memoryStorage, set: write } });
        await expect(failing.queue.flush()).rejects.toThrow('disk full');
        expect(failing.submit).not.toHaveBeenCalled();
        expect(stored()[0]).toMatchObject({ attempts: 0 });
        expect(stored()[0]?.heldSince).toBeUndefined();
    });

    it('does not send an old-account review after the connection changes during attempt persistence', async () => {
        let account = 'account-a';
        let switchOnHold = true;
        const { queue, submit, onSubmitted } = makeQueue({
            providerContextForTarget: () => account,
            storage: {
                ...memoryStorage,
                set: async (key, value) => {
                    await memoryStorage.set(key, value);
                    if (switchOnHold && (value as QueuedNewTabGrade[]).some(item => item.heldSince !== undefined)) {
                        switchOnHold = false;
                        account = 'account-b';
                    }
                },
            },
        });
        await queue.enqueue(card('読む'), 'okay', ['anki']);
        expect(await queue.flush()).toBe(1);
        expect(submit).not.toHaveBeenCalled();
        expect(onSubmitted).not.toHaveBeenCalled();
        // Never dispatched, so it is pending again rather than held.
        expect(stored()).toMatchObject([{ providerContext: 'account-a', attempts: 0 }]);
        expect(stored()[0]?.heldSince).toBeUndefined();
        expect(await queue.flush()).toBe(1);
        expect(submit).not.toHaveBeenCalled();
        account = 'account-a';
        expect(await queue.flush()).toBe(0);
        expect(submit).toHaveBeenCalledOnce();
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ providerContext: 'account-a' }));
    });

    it('never resends a persisted in-flight attempt a new queue sees before the response, and holds it once it outlives any request', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(1_000_000);
        let acknowledge!: (value: boolean) => void;
        let dispatched!: () => void;
        const response = new Promise<boolean>(resolve => { acknowledge = resolve; });
        const started = new Promise<void>(resolve => { dispatched = resolve; });
        const submit = vi.fn(() => { dispatched(); return response; });
        const { queue } = makeQueue({ submit });
        await queue.enqueue(card('読む'), 'okay', ['anki']);
        const flushing = queue.flush();
        await started;
        try {
            const reopened = makeQueue({ submit, confirmDelivered: async () => false });
            expect(await reopened.queue.flush()).toBe(1);
            // Another tab may still be sending it: not held, so Check again cannot resend it.
            expect(await reopened.queue.heldReviews()).toEqual([]);
            expect(await reopened.queue.recheckHeld()).toBe(1);
            expect(submit).toHaveBeenCalledOnce();
            vi.setSystemTime(1_000_000 + HELD_REVIEW_SETTLE_MS);
            expect(await reopened.queue.heldReviews()).toHaveLength(1);
        } finally {
            acknowledge(true);
            await flushing;
            vi.useRealTimers();
        }
    });

    it('does not repeat an acknowledged Anki grade if queue cleanup fails', async () => {
        const failing = makeQueue({ storage: {
            ...memoryStorage,
            delete: async () => { throw new Error('cleanup failed'); },
        } });
        await failing.queue.enqueue(card('読む'), 'okay', ['anki']);
        await expect(failing.queue.flush()).rejects.toThrow('cleanup failed');
        const restarted = makeQueue({ submit: failing.submit });
        expect(await restarted.queue.flush()).toBe(1);
        expect(failing.submit).toHaveBeenCalledOnce();
        expect(stored()[0]?.heldSince).toEqual(expect.any(Number));
    });

    it('does not treat an unreadable queue as empty or overwrite its reviews', async () => {
        const { queue } = makeQueue();
        await queue.enqueue(card('読む'), 'okay', ['anki']);
        const original = structuredClone(stored());
        const failing = makeQueue({ storage: {
            ...memoryStorage,
            get: async () => { throw new Error('storage unavailable'); },
        } });
        await expect(failing.queue.enqueue(card('書く'), 'easy', ['anki'])).rejects.toThrow('storage unavailable');
        await expect(failing.queue.flush()).rejects.toThrow('storage unavailable');
        expect(stored()).toEqual(original);
        expect(failing.submit).not.toHaveBeenCalled();
    });

    it('preserves reviews on a backend read failure through the production storage adapter', async () => {
        const backend = installGmStorageFixture();
        const submit = vi.fn(async () => true);
        const queue = new NewTabGradeQueue({
            offlineEnabled: () => true, providerContextForTarget: () => 'account-a',
            submit, onSubmitted: vi.fn(),
        });
        try {
            await queue.enqueue(card('読む'), 'okay', ['anki']);
            backend.setValue.mockClear();
            backend.deleteValue.mockClear();
            backend.getValue.mockImplementation(async (key, fallback) => {
                if (key.includes(NEW_TAB_GRADE_QUEUE_KEY)) throw new Error('backend read failed');
                return backend.values.has(key) ? backend.values.get(key) : fallback;
            });
            await expect(queue.enqueue(card('書く'), 'easy', ['anki'])).rejects.toThrow('backend read failed');
            await expect(queue.flush()).rejects.toThrow('backend read failed');
            expect(backend.setValue).not.toHaveBeenCalled();
            expect(backend.deleteValue).not.toHaveBeenCalled();
            expect(submit).not.toHaveBeenCalled();
        } finally { vi.unstubAllGlobals(); }
    });

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
            if (item.target === 'jpdb-api') throw new Error('jpdb offline');
            return true;
        });
        await queue.flush();
        const remaining = stored();
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toMatchObject({ target: 'jpdb-api', attempts: 1, lastError: 'jpdb offline' });
        expect(remaining[0]?.heldSince).toBeUndefined();
        expect(onSubmitted).toHaveBeenCalledTimes(1);
        submit.mockResolvedValue(true);
        expect(await queue.flush()).toBe(0);
        expect(onSubmitted).toHaveBeenCalledTimes(2);
    });

    it('retains a review when the submitter reports that it was not submitted', async () => {
        const { queue, submit, onSubmitted } = makeQueue();
        await queue.enqueue(card('何'), 'okay', ['anki']);
        submit.mockResolvedValue(false);
        await queue.flush();
        expect(onSubmitted).not.toHaveBeenCalled();
        expect(stored()).toMatchObject([{ target: 'anki', attempts: 1 }]);
        expect(stored()[0]?.heldSince).toBeUndefined();
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
            providerContext: 'account-a',
        } satisfies QueuedNewTabGrade;
        store.set(NEW_TAB_GRADE_QUEUE_KEY, [bunpro, anki]);
        const { queue, submit } = makeQueue();

        expect(await queue.pendingCount()).toBe(1);
        expect(stored()).toEqual([anki]);
        await queue.flush();

        expect(submit).toHaveBeenCalledOnce();
        expect(submit).toHaveBeenCalledWith({ ...anki, heldSince: expect.any(Number) });
        expect(stored()).toEqual([]);
    });

    it('retains another account and legacy network grades without submitting them', async () => {
        const current = { id: 'current', at: 1, target: 'jpdb-api', card: card('今'), grade: 'okay', attempts: 0, providerContext: 'account-a' } satisfies QueuedNewTabGrade;
        const other = { id: 'other', at: 2, target: 'jpdb-api', card: card('昔'), grade: 'hard', attempts: 0, providerContext: 'account-b' } satisfies QueuedNewTabGrade;
        const legacy = { id: 'legacy', at: 3, target: 'anki', card: card('旧'), grade: 'easy', attempts: 0 } satisfies QueuedNewTabGrade;
        store.set(NEW_TAB_GRADE_QUEUE_KEY, [current, other, legacy]);
        const { queue, submit } = makeQueue();

        expect(await queue.flush()).toBe(2);
        expect(submit).toHaveBeenCalledOnce();
        expect(submit).toHaveBeenCalledWith(current);
        expect(stored()).toEqual([other, legacy]);
    });

    it('keeps a JPDB obligation current across an unrelated Anki rotation but not a JPDB account switch', async () => {
        const contexts = { jpdb: 'jpdb-a', anki: 'anki-a' };
        const providerContextForTarget = (target: QueuedNewTabGrade['target']): string => target === 'anki' ? contexts.anki : contexts.jpdb;
        const { queue, submit } = makeQueue({ providerContextForTarget });
        await queue.enqueue(card('継続'), 'okay', ['jpdb-api']);

        contexts.anki = 'anki-b';
        expect(await queue.flush()).toBe(0);
        expect(submit).toHaveBeenCalledOnce();

        await queue.enqueue(card('保留'), 'hard', ['jpdb-api']);
        contexts.jpdb = 'jpdb-b';
        expect(await queue.flush()).toBe(1);
        expect(submit).toHaveBeenCalledOnce();
        expect(stored()).toMatchObject([{ target: 'jpdb-api', providerContext: 'jpdb-a' }]);
    });

    it('keeps local Yomu grades unscoped across provider account changes', async () => {
        const { queue, submit } = makeQueue({ providerContextForTarget: () => 'account-a' });
        await queue.enqueue(card('地域'), 'pass', ['yomu-local']);
        const [local] = stored();
        expect(local?.providerContext).toBeUndefined();

        const switched = makeQueue({ providerContextForTarget: () => 'account-b', submit });
        await switched.queue.flush();

        expect(submit).toHaveBeenCalledWith(local);
        expect(stored()).toEqual([]);
    });
});
