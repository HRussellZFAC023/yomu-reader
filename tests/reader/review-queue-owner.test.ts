import { expect, it, vi } from 'vitest';
import { ReviewQueueOwner, reviewDeliveryScope, type ReviewQueueState } from '../../src/reader/newtab/review-queue-owner';
import type { QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import type { JPDBCard } from '../../src/reader/app/types';

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
