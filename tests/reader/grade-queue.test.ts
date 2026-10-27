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
import { afterEach } from "vitest";

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

describe('live review claims', () => {
    // Userscript and hosted Study have no background owner: every Study tab runs its
    // own NewTabGradeQueue over the one shared GM queue. These tabs use the production
    // GM storage adapter and cross-tab lease, exactly as two browser tabs do.
    function installSharedGmStorage() {
        const storage = installGmStorageFixture();
        vi.stubGlobal('GM_listValues', vi.fn(async () => [...storage.values.keys()]));
        return storage;
    }

    function tab(submit: (item: QueuedNewTabGrade) => Promise<boolean>) {
        return new NewTabGradeQueue({ owner: null, submit, onSubmitted: () => {}, offlineEnabled: () => true,
            providerContextForTarget: () => 'account-a' });
    }

    const card = { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } as JPDBCard;

    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it.each(['anki', 'jpdb-api'] as const)('dispatches a shared %s review only once when two tabs reconnect together', async target => {
        const storage = installSharedGmStorage();
        let finish!: () => void;
        const slowProvider = new Promise<void>(resolve => { finish = resolve; });
        const submit = vi.fn(async () => { await slowProvider; return true; });
        const first = tab(submit);
        const second = tab(submit);
        expect(await first.enqueue(card, 'okay', [target])).toBe(true);
        const flushes = Promise.all([first.flush(), second.flush()]);
        await vi.waitFor(() => expect(submit).toHaveBeenCalled());
        finish();
        expect(await flushes).toEqual([0, 0]);
        expect(submit).toHaveBeenCalledOnce();
        expect(storage.values.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
    });

    it('does not lose a grade queued in one tab while another tab is flushing', async () => {
        installSharedGmStorage();
        let finish!: () => void;
        const slowProvider = new Promise<void>(resolve => { finish = resolve; });
        const submit = vi.fn(async (item: QueuedNewTabGrade) => {
            if (item.card.spelling === '読む') await slowProvider;
            return true;
        });
        const flushing = tab(submit);
        const grading = tab(submit);
        await flushing.enqueue(card, 'okay', ['jpdb-api']);
        const flush = flushing.flush();
        await vi.waitFor(() => expect(submit).toHaveBeenCalled());
        const queued = grading.enqueue({ ...card, vid: 2, spelling: '書く', reading: 'かく' }, 'hard', ['jpdb-api']);
        finish();
        await flush;
        expect(await queued).toBe(true);
        expect(await grading.pendingCount()).toBe(1);
        expect(await grading.flush()).toBe(0);
        expect(submit).toHaveBeenCalledTimes(2);
    });


    const account = (name: string) => () => name;

    it('lets exactly one of two tabs claim the same online review', async () => {
        installSharedGmStorage();
        const claims = await Promise.all([tab(vi.fn()), tab(vi.fn())].map(queue => queue.claimLiveReview(card, ['jpdb-api'], account('account-a'))));
        expect(claims.filter(Boolean)).toHaveLength(1);
    });

    it('never blocks the tab that holds the claim', async () => {
        installSharedGmStorage();
        const queue = tab(vi.fn());
        const first = await queue.claimLiveReview(card, ['jpdb-api'], account('account-a'));
        expect(first).not.toBeNull();
        expect(await queue.claimLiveReview(card, ['jpdb-api'], account('account-a'))).not.toBeNull();
        await queue.finishLiveReview(first!);
        expect(await queue.claimLiveReview(card, ['jpdb-api'], account('account-a'))).not.toBeNull();
    });

    it('refuses another tab once after the review was sent, then lets it grade the card again', async () => {
        installSharedGmStorage();
        const sender = tab(vi.fn());
        const stale = tab(vi.fn());
        await sender.finishLiveReview((await sender.claimLiveReview(card, ['anki'], account('account-a')))!);
        expect(await stale.claimLiveReview(card, ['anki'], account('account-a'))).toBeNull();
        expect(await stale.claimLiveReview(card, ['anki'], account('account-a'))).not.toBeNull();
    });

    it('keeps refusing while another tab may still be sending, until the claim settles', async () => {
        installSharedGmStorage();
        vi.useFakeTimers({ toFake: ['Date'] });
        const sender = tab(vi.fn());
        const other = tab(vi.fn());
        expect(await sender.claimLiveReview(card, ['jpdb-api'], account('account-a'))).not.toBeNull();
        expect(await other.claimLiveReview(card, ['jpdb-api'], account('account-a'))).toBeNull();
        vi.setSystemTime(Date.now() + HELD_REVIEW_SETTLE_MS - 1);
        expect(await other.claimLiveReview(card, ['jpdb-api'], account('account-a'))).toBeNull();
        vi.setSystemTime(Date.now() + 1);
        // A settled claim may have landed: refuse once more so this tab reloads the card first.
        expect(await other.claimLiveReview(card, ['jpdb-api'], account('account-a'))).toBeNull();
        expect(await other.claimLiveReview(card, ['jpdb-api'], account('account-a'))).not.toBeNull();
    });

    it('never blocks a review for a different provider account or target', async () => {
        installSharedGmStorage();
        const first = tab(vi.fn());
        const second = tab(vi.fn());
        expect(await first.claimLiveReview(card, ['jpdb-api'], account('account-a'))).not.toBeNull();
        expect(await second.claimLiveReview(card, ['jpdb-api'], account('account-b'))).not.toBeNull();
        expect(await second.claimLiveReview(card, ['jiten-api'], account('account-a'))).not.toBeNull();
    });

    it('claims without waiting for another tab\'s slow queue flush', async () => {
        installSharedGmStorage();
        let finish!: () => void;
        const slowProvider = new Promise<void>(resolve => { finish = resolve; });
        const submit = vi.fn(async () => { await slowProvider; return true; });
        const flushing = tab(submit);
        await flushing.enqueue(card, 'okay', ['jpdb-api']);
        const flush = flushing.flush();
        await vi.waitFor(() => expect(submit).toHaveBeenCalled());
        const other = { ...card, vid: 2, spelling: '書く', reading: 'かく' };
        expect(await tab(vi.fn()).claimLiveReview(other, ['jpdb-api'], account('account-a'))).not.toBeNull();
        // Recorded, not a timed-out lease letting the grade through unrecorded.
        expect(await tab(vi.fn()).claimLiveReview(other, ['jpdb-api'], account('account-a'))).toBeNull();
        finish();
        expect(await flush).toBe(0);
    });

    it('lets the review proceed when shared storage cannot be read', async () => {
        installSharedGmStorage().getValue.mockRejectedValue(new Error('storage unavailable'));
        expect(await tab(vi.fn()).claimLiveReview(card, ['jpdb-api'], account('account-a'))).not.toBeNull();
    });
});
