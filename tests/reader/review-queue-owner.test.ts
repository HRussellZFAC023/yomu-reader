import { expect, it, vi } from 'vitest';
import { REVIEW_RECEIPT_LIMIT, ReviewQueueOwner, reviewDeliveryScope, type ReviewQueueState } from '../../src/reader/newtab/review-queue-owner';
import type { QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import type { JPDBCard } from '../../src/reader/app/types';
import { newTabPromptController, newTabTestCard, renderSeededNewTabWord } from "./new-tab-review/fixtures";
import { installGmStorageFixture } from "./helpers/settings-persistence-fixture";
import { NewTabGradeQueue } from "../../src/reader/newtab/grade-queue";
import { ExtensionReviewQueueClient } from "../../src/reader/newtab/extension-review-queue-client";
import { parseManagedStateEpoch } from "../../src/reader/app/managed-state-epoch";
import { REVIEW_QUEUE_OWNER_KEY } from "../../src/reader/newtab/review-queue-owner";

function review(id = 'review-1'): QueuedNewTabGrade {
    return { id, at: 1, target: 'anki', grade: 'okay', attempts: 0, providerContext: 'account-a',
        card: { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } as JPDBCard };
}

function fixture() {
    let data: ReviewQueueState = { reviews: [], completed: {} };
    const storage = {
        read: vi.fn(async () => structuredClone(data)),
        write: vi.fn(async (next: ReviewQueueState) => { data = structuredClone(next); }),
    };
    return { storage, owner: new ReviewQueueOwner(storage, 200) };
}

it('grants exactly one claim when two clients ask the shared owner together', async () => {
    const { owner } = fixture();
    await owner.record(review());
    const claims = await Promise.all([owner.claim('review-1', 'account-a'), owner.claim('review-1', 'account-a')]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await owner.list()).toMatchObject([{ id: 'review-1', attempts: 1 }]);
});

it('records multiple destinations atomically and leaves no partial answer on rejection', async () => {
    const { storage } = fixture();
    const owner = new ReviewQueueOwner(storage, 1);
    await expect(owner.record([review(), review('review-2')])).rejects.toThrow('queue is full');
    expect(storage.write).not.toHaveBeenCalled();
    expect(await owner.list()).toEqual([]);
    const enoughRoom = new ReviewQueueOwner(storage, 2);
    await enoughRoom.record([review(), review('review-2')]);
    expect(storage.write).toHaveBeenCalledOnce();
    expect(await enoughRoom.list()).toHaveLength(2);
});

it('acknowledges only its operation and preserves a concurrent new answer', async () => {
    const { owner } = fixture();
    await owner.record(review());
    await owner.claim('review-1', 'account-a');
    await Promise.all([owner.record(review('review-2')), owner.acknowledge('review-1', 'account-a')]);
    expect(await owner.list()).toMatchObject([{ id: 'review-2', attempts: 0 }]);
});

it('preserves distinct reviews of the same card and deduplicates a repeated operation', async () => {
    const { owner } = fixture();
    await Promise.all([owner.record(review()), owner.record(review('review-2')), owner.record(review())]);
    expect((await owner.list()).map(item => item.id)).toEqual(['review-1', 'review-2']);
    await expect(owner.record({ ...review(), grade: 'easy' })).rejects.toThrow('identity was reused');
});

it('holds claimed reviews through owner restart and rejects another account acknowledgement', async () => {
    const { owner, storage } = fixture();
    await owner.record(review());
    await owner.claim('review-1', 'account-a');
    const restarted = new ReviewQueueOwner(storage, 200);
    expect(await restarted.claim('review-1', 'account-a')).toBeNull();
    await expect(restarted.acknowledge('review-1', 'account-b')).rejects.toThrow('does not match');
    expect(await restarted.list()).toHaveLength(1);
});

it('does not grant a claim whose attempt could not be persisted', async () => {
    const { owner, storage } = fixture();
    await owner.record(review());
    storage.write.mockRejectedValueOnce(new Error('disk full'));
    await expect(owner.claim('review-1', 'account-a')).rejects.toThrow('disk full');
    expect(await owner.list()).toMatchObject([{ attempts: 0 }]);
    expect(await owner.claim('review-1', 'account-a')).toMatchObject({ attempts: 1 });
});

it('holds a committed claim when its storage acknowledgement is lost', async () => {
    const { owner, storage } = fixture();
    await owner.record(review());
    const persist = storage.write.getMockImplementation()!;
    storage.write.mockImplementationOnce(async next => {
        await persist(next);
        throw new Error('storage acknowledgement lost');
    });
    await expect(owner.claim('review-1', 'account-a')).rejects.toThrow('acknowledgement lost');
    const restarted = new ReviewQueueOwner(storage, 200);
    expect(await restarted.claim('review-1', 'account-a')).toBeNull();
    expect(await restarted.list()).toMatchObject([{ id: 'review-1', attempts: 1 }]);
});

it('keeps a failed acknowledgement durable and makes acknowledgement retries idempotent', async () => {
    const { owner, storage } = fixture();
    await owner.record(review());
    await owner.claim('review-1', 'account-a');
    storage.write.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(owner.acknowledge('review-1', 'account-a')).rejects.toThrow('disk unavailable');
    expect(await owner.list()).toHaveLength(1);
    await owner.acknowledge('review-1', 'account-a');
    await owner.acknowledge('review-1', 'account-a');
    expect(await owner.list()).toEqual([]);
});

it('captures the requested answer before waiting and detaches returned records', async () => {
    const { owner } = fixture();
    const answer = review();
    const saving = owner.record(answer);
    answer.grade = 'fail';
    await saving;
    const listed = await owner.list();
    expect(listed[0]?.grade).toBe('okay');
    listed[0]!.attempts = 10;
    expect(await owner.claim('review-1', 'account-a')).toMatchObject({ attempts: 1, grade: 'okay' });
});

it('does not recreate a completed operation when a delayed record arrives after restart', async () => {
    const { owner, storage } = fixture();
    await owner.record(review());
    await owner.claim('review-1', 'account-a');
    await owner.acknowledge('review-1', 'account-a');
    const restarted = new ReviewQueueOwner(storage, 200);
    await restarted.record(review());
    const reordered = review();
    reordered.card = Object.fromEntries(Object.entries(reordered.card).reverse()) as unknown as JPDBCard;
    await restarted.record(reordered);
    expect(await restarted.claim('review-1', 'account-a')).toBeNull();
    expect(await restarted.list()).toEqual([]);
    await expect(restarted.record({ ...review(), grade: 'easy' })).rejects.toThrow('Completed review identity');
});

it('returns atomic receipt/revision snapshots and does not increment on duplicate acknowledgement', async () => {
    const { owner } = fixture();
    const scope = reviewDeliveryScope('anki', 'account-a');
    await owner.record(review());
    expect((await owner.snapshot(['review-1'], [scope])).revisions[scope]).toBe(0);
    await owner.claim('review-1', 'account-a');
    await owner.acknowledge('review-1', 'account-a');
    await owner.acknowledge('review-1', 'account-a');
    const snapshot = await owner.snapshot(['review-1', 'missing'], [scope, 'toString']);
    expect(snapshot.reviews).toEqual([]);
    expect(snapshot.statuses).toEqual({ 'review-1': 'completed', missing: 'unknown' });
    expect(snapshot.revisions[scope]).toBe(1);
    expect(Object.hasOwn(snapshot.revisions, 'toString')).toBe(true);
    expect(snapshot.revisions.toString).toBe(0);
});

it('bounds completion receipts past the receipt limit while still deduplicating recent replays', async () => {
    let data: ReviewQueueState = { reviews: [], completed: {} };
    // Plain storage: a vi.fn would retain every multi-kilobyte state it was called with.
    const owner = new ReviewQueueOwner({
        read: async () => structuredClone(data),
        write: async next => { data = structuredClone(next); },
    }, 200);
    const stored = () => data;
    const reviewCount = REVIEW_RECEIPT_LIMIT + 50;
    const lastReviewId = `review-${reviewCount - 1}`;
    for (let index = 0; index < reviewCount; index++) {
        const id = `review-${index}`;
        await owner.record(review(id));
        await owner.claim(id, 'account-a');
        await owner.acknowledge(id, 'account-a');
    }
    expect(Object.keys(stored().completed)).toHaveLength(REVIEW_RECEIPT_LIMIT);
    expect(REVIEW_RECEIPT_LIMIT).toBeLessThanOrEqual(500);
    await owner.record(review(lastReviewId));
    await owner.record(review(`review-${reviewCount - REVIEW_RECEIPT_LIMIT}`));
    expect(await owner.list()).toEqual([]);
    expect((await owner.snapshot([lastReviewId], [])).statuses[lastReviewId]).toBe('completed');
});

it('releases a certainly-undelivered claim back to pending and discards a held one with a receipt', async () => {
    const { owner } = fixture();
    await owner.record([review(), review('review-2')]);
    await owner.claim('review-1', 'account-a');
    await owner.release('review-1', 'account-b');
    expect(await owner.list()).toMatchObject([{ id: 'review-1', attempts: 1 }, { id: 'review-2', attempts: 0 }]);
    await owner.release('review-1', 'account-a');
    await owner.release('review-1', 'account-a');
    expect(await owner.claim('review-1', 'account-a')).toMatchObject({ attempts: 1 });
    await owner.discard('review-1', 'account-a');
    await owner.record(review());
    expect(await owner.list()).toMatchObject([{ id: 'review-2' }]);
    await expect(owner.discard('review-2', 'account-a')).rejects.toThrow('does not match');
});

it('adopts an earlier release\'s backlog only while there is room, idempotently by id', async () => {
    const { storage } = fixture();
    const owner = new ReviewQueueOwner(storage, 2);
    await owner.record(review('new-1'));
    const backlog = [review('legacy-1'), review('legacy-2'), review('legacy-3')];
    await owner.record(backlog, true);
    await owner.record(backlog, true);
    // The overflow is not recorded (it waits in its old queue), and the owner never exceeds capacity.
    expect((await owner.list()).map(item => item.id)).toEqual(['new-1', 'legacy-1']);
    await expect(owner.record(review('new-2'))).rejects.toThrow('queue is full');
    await expect(owner.record({ ...review('legacy-1'), grade: 'easy' }, true)).rejects.toThrow('identity was reused');
    await owner.claim('legacy-1', 'account-a');
    await owner.acknowledge('legacy-1', 'account-a');
    await owner.record(backlog, true);
    expect((await owner.list()).map(item => item.id)).toEqual(['new-1', 'legacy-2']);
    expect((await owner.snapshot(['legacy-1', 'legacy-3'], [])).statuses).toEqual({ 'legacy-1': 'completed', 'legacy-3': 'unknown' });
});

it('stamps each claim and releases only the claim a release names', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
        vi.setSystemTime(1_000);
        const { owner } = fixture();
        await owner.record(review());
        expect(await owner.claim('review-1', 'account-a')).toMatchObject({ attempts: 1, heldSince: 1_000 });
        await owner.release('review-1', 'account-a', 1_000);
        const [released] = await owner.list();
        expect(released).toMatchObject({ attempts: 0 });
        expect(released).not.toHaveProperty('heldSince');
        vi.setSystemTime(2_000);
        await owner.claim('review-1', 'account-a');
        // A late retry of the first claim's release must not free the newer claim another tab is sending.
        await owner.release('review-1', 'account-a', 1_000);
        expect(await owner.list()).toMatchObject([{ attempts: 1, heldSince: 2_000 }]);
        await owner.release('review-1', 'account-a');
        expect(await owner.list()).toMatchObject([{ attempts: 0 }]);
    } finally {
        vi.useRealTimers();
    }
});

describe("review owner live sync", () => {
    it('coalesces owner-change bursts and tears subscriptions down on rebind and destruction', async () => {
        installGmStorageFixture();
        let sequence = 0;
        const listeners = new Map<number, { key: string; callback: (...args: unknown[]) => void }>();
        vi.stubGlobal('GM_addValueChangeListener', (key: string, callback: (...args: unknown[]) => void) => {
            listeners.set(++sequence, { key, callback });
            return sequence;
        });
        vi.stubGlobal('GM_removeValueChangeListener', (id: number) => { listeners.delete(id); });
        const owner = new ExtensionReviewQueueClient(async () => ({ ok: true, value: [] }), async () => parseManagedStateEpoch(null), {
            read: () => null, write: () => {}, clear: () => {},
        });
        const queue = new NewTabGradeQueue({ owner, offlineEnabled: () => true, providerContextForTarget: () => 'account-a',
            submit: async () => true, onSubmitted: () => {} });
        const controller = newTabPromptController();
        Object.assign(controller, { gradeQueue: queue });
        const probe = controller as unknown as { bindRootEvents(root: HTMLElement): void; performQueueSync(): Promise<void> };
        let release!: () => void;
        const pending = new Promise<void>(resolve => { release = resolve; });
        const flush = vi.spyOn(probe, 'performQueueSync').mockImplementationOnce(() => pending).mockResolvedValue(undefined);
        const root = document.createElement('div');
        document.body.append(root);
        const selected = () => [...listeners.values()].filter(item => item.key === REVIEW_QUEUE_OWNER_KEY);
        const tick = () => new Promise(resolve => setTimeout(resolve, 0));
        try {
            probe.bindRootEvents(root);
            expect(selected()).toHaveLength(1);
            probe.bindRootEvents(root);
            expect(selected()).toHaveLength(1);
            const callback = selected()[0].callback;
            for (let index = 0; index < 3; index++) callback(REVIEW_QUEUE_OWNER_KEY, null, { ignoredPayload: index }, true);
            await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
            await tick();
            expect(flush).toHaveBeenCalledOnce();
            release();
            await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(2));
            controller.destroy();
            expect(selected()).toHaveLength(0);
            callback(REVIEW_QUEUE_OWNER_KEY, null, {}, true);
            await tick();
            expect(flush).toHaveBeenCalledTimes(2);
        } finally {
            release();
            controller.destroy();
            root.remove();
            vi.unstubAllGlobals();
        }
    });

    it('does not start a queued follow-up after destruction while synchronization is suspended', async () => {
        const controller = newTabPromptController();
        const probe = controller as unknown as { flushQueuedGrades(): Promise<void>; performQueueSync(): Promise<void> };
        let release!: () => void;
        const suspended = new Promise<void>(resolve => { release = resolve; });
        const work = vi.spyOn(probe, 'performQueueSync').mockImplementationOnce(() => suspended).mockResolvedValue(undefined);
        const syncing = probe.flushQueuedGrades();
        await vi.waitFor(() => expect(work).toHaveBeenCalledOnce());
        void probe.flushQueuedGrades();
        controller.destroy();
        release();
        await syncing;
        await probe.flushQueuedGrades();
        expect(work).toHaveBeenCalledOnce();
    });

    it('does not repaint a replacement view when an old queue read completes after destruction', async () => {
        const controller = newTabPromptController();
        const root = renderSeededNewTabWord(controller, newTabTestCard(), { appendToDocument: true });
        let release!: (count: number) => void;
        const suspended = new Promise<number>(resolve => { release = resolve; });
        const queue = { flush: vi.fn(() => suspended), heldReviews: vi.fn(async () => []), usesSharedOwner: () => true,
            blocksReview: () => false, needsRecordingRecovery: () => false };
        Object.assign(controller, { gradeQueue: queue, queuedReviewNeedsRefresh: true });
        const probe = controller as unknown as {
            flushQueuedGrades(): Promise<void>;
            loadWordsInto(): Promise<void>;
            refreshSessionProgressSoon(): void;
        };
        const load = vi.spyOn(probe, 'loadWordsInto').mockResolvedValue(undefined);
        const progress = vi.spyOn(probe, 'refreshSessionProgressSoon');
        const syncing = probe.flushQueuedGrades();
        await vi.waitFor(() => expect(queue.flush).toHaveBeenCalledOnce());
        controller.destroy();
        root.textContent = 'Replacement view';
        progress.mockClear();
        release(0);
        await syncing;
        expect(load).not.toHaveBeenCalled();
        expect(queue.heldReviews).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
        expect(root.textContent).toBe('Replacement view');
        root.remove();
    });
});
