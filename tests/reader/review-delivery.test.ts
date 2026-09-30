import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_REVIEW_SETTLE_MS, NewTabGradeQueue, type NewTabGradeQueueDeps, type QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import { NEW_TAB_GRADE_QUEUE_KEY, NEW_TAB_GRADE_QUEUE_LIMIT } from '../../src/reader/newtab/controller-config';
import { ReviewQueueRejectedError } from '../../src/reader/newtab/extension-review-queue-client';
import type { JPDBCard } from '../../src/reader/app/types';
import { draftStorage, memoryLegacyStorage, reviewQueueHostFixture } from './helpers/review-queue-host-fixture';

const reading = { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } as JPDBCard;
const writing = { vid: 2, sid: 0, spelling: '書く', reading: 'かく' } as JPDBCard;

type Mode = 'owner' | 'shared';

function queueFor(mode: Mode, overrides: Partial<NewTabGradeQueueDeps> = {}) {
    const host = reviewQueueHostFixture();
    const legacy = memoryLegacyStorage();
    const requests: string[] = [];
    const owner = mode === 'owner' ? host.client(async request => { requests.push(String(request.kind)); return host.send(request); }) : null;
    const submit = vi.fn(async (_item: QueuedNewTabGrade) => true);
    const onSubmitted = vi.fn();
    const queue = new NewTabGradeQueue({ owner, storage: legacy, submit, onSubmitted, offlineEnabled: () => true,
        providerContextForTarget: () => 'account-a', ...overrides });
    return { queue, submit, onSubmitted, requests, legacy, host };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe.each(['owner', 'shared'] as const)('%s review delivery', mode => {
    it('retries a review whose request failed instead of holding it forever', async () => {
        const { queue, submit } = queueFor(mode);
        submit.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await queue.enqueue(reading, 'okay', ['jpdb-api']);
        expect(await queue.flush()).toBe(1);
        expect(await queue.heldReviews()).toHaveLength(0);
        expect(await queue.flush()).toBe(0);
        expect(submit).toHaveBeenCalledTimes(2);
        expect(await queue.pendingCount()).toBe(0);
        expect(queue.blocksReview(reading)).toBe(false);
    });

    it('does not claim network reviews while the browser is offline', async () => {
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        const { queue, submit, requests } = queueFor(mode);
        await queue.enqueue(reading, 'okay', ['jpdb-api', 'yomu-local']);
        expect(await queue.flush()).toBe(1);
        expect(submit).toHaveBeenCalledOnce();
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ target: 'yomu-local' }));
        expect(requests.filter(kind => kind === 'claim')).toHaveLength(mode === 'owner' ? 1 : 0);
        expect(await queue.heldReviews()).toHaveLength(0);
        vi.stubGlobal('navigator', { ...navigator, onLine: true });
        expect(await queue.flush()).toBe(0);
        expect(submit).toHaveBeenCalledTimes(2);
    });

    it('keeps an Anki review pending, never held, while AnkiConnect is unreachable', async () => {
        let reachable = false;
        const { queue, submit, legacy } = queueFor(mode, { canDeliver: async target => target !== 'anki' || reachable });
        await queue.enqueue(reading, 'okay', ['anki']);
        expect(await queue.flush()).toBe(1);
        expect(submit).not.toHaveBeenCalled();
        expect(await queue.heldReviews()).toHaveLength(0);
        if (mode === 'shared') expect((legacy.values.get(NEW_TAB_GRADE_QUEUE_KEY) as QueuedNewTabGrade[])[0]?.heldSince).toBeUndefined();
        reachable = true;
        expect(await queue.flush()).toBe(0);
        expect(submit).toHaveBeenCalledOnce();
    });

    it('holds only a dispatched Anki answer, and Check again resends it when Anki has no such review', async () => {
        const confirmDelivered = vi.fn(async (): Promise<boolean | undefined> => undefined);
        const { queue, submit, onSubmitted } = queueFor(mode, { confirmDelivered });
        submit.mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await queue.enqueue(reading, 'okay', ['anki']);
        await queue.enqueue(writing, 'okay', ['anki']);
        expect(await queue.flush()).toBe(2);
        // One answer was dispatched with an unknown outcome; the next was not sent this pass.
        expect(submit).toHaveBeenCalledOnce();
        expect((await queue.heldReviews()).map(item => item.card.spelling)).toEqual(['読む']);
        expect(queue.blocksReview(writing)).toBe(mode === 'owner');
        expect(await queue.flush()).toBe(1);
        expect(submit).toHaveBeenCalledTimes(2);
        expect(await queue.enqueue(writing, 'easy', ['jpdb-api'])).toBe(true);

        expect(await queue.recheckHeld()).toBe(1);
        expect((await queue.heldReviews())).toHaveLength(1);
        confirmDelivered.mockResolvedValueOnce(false);
        expect(await queue.recheckHeld()).toBe(0);
        expect(submit).toHaveBeenCalledTimes(4);
        expect(onSubmitted).toHaveBeenCalledTimes(3);
        expect(await queue.heldReviews()).toHaveLength(0);
        expect(queue.blocksReview(reading)).toBe(false);
    });

    it('acknowledges a held Anki answer that Check again finds in the native review history', async () => {
        const { queue, submit, onSubmitted } = queueFor(mode, { confirmDelivered: async () => true });
        submit.mockRejectedValueOnce(new Error('AnkiConnect reply lost'));
        await queue.enqueue(reading, 'okay', ['anki']);
        expect(await queue.flush()).toBe(1);
        expect(await queue.recheckHeld()).toBe(0);
        expect(submit).toHaveBeenCalledOnce();
        expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ spelling: '読む' }));
        expect(await queue.pendingCount()).toBe(0);
    });

    it('discards only held reviews at the learner\'s request', async () => {
        const { queue, submit } = queueFor(mode, { canDeliver: async target => target === 'anki' });
        submit.mockRejectedValueOnce(new Error('AnkiConnect reply lost'));
        await queue.enqueue(reading, 'okay', ['anki']);
        await queue.enqueue(writing, 'hard', ['jpdb-api']);
        expect(await queue.flush()).toBe(2);
        await queue.discardHeld();
        expect(await queue.flush()).toBe(1);
        expect(await queue.heldReviews()).toHaveLength(0);
        expect(queue.blocksReview(reading)).toBe(false);
        expect(await queue.pendingCount()).toBe(1);
    });
});

describe('a full packaged owner', () => {
    it('never locks a tab that recorded while another tab drained it', async () => {
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        const { queue, host } = queueFor('owner');
        const backlog = Array.from({ length: NEW_TAB_GRADE_QUEUE_LIMIT }, (_, n): QueuedNewTabGrade => ({
            id: `jpdb-api:full-${n}`, at: n, target: 'jpdb-api', grade: 'okay', attempts: 0, providerContext: 'account-a',
            card: { vid: 100 + n, sid: 0, spelling: `語${n}`, reading: `ご${n}` } as JPDBCard,
        }));
        await host.client().adopt(backlog);
        expect(await queue.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        // Another tab delivers one review; this tab records a new answer before its next snapshot.
        const other = host.client();
        await other.claim(backlog[0]!.id, 'account-a');
        await other.acknowledge(backlog[0]!.id, 'account-a');
        expect(await queue.enqueue(reading, 'okay', ['jpdb-api'])).toBe(true);
        expect(await queue.flush()).toBe(NEW_TAB_GRADE_QUEUE_LIMIT);
        expect(queue.blocksReview(writing)).toBe(false);
        expect(queue.blocksReview(reading)).toBe(true);
    });
});

describe('packaged owner rejection', () => {
    it('clears the draft on a definitive owner refusal so Grade stays usable', async () => {
        const drafts = draftStorage();
        const { host } = queueFor('owner');
        const owner = host.client(async request => request.kind === 'record'
            ? { ok: false, error: 'Review queue is full.' }
            : host.send(request), drafts);
        const queue = new NewTabGradeQueue({ owner, storage: memoryLegacyStorage(), submit: async () => true, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
        await queue.flush();
        await expect(queue.enqueue(reading, 'okay', ['jpdb-api'])).rejects.toBeInstanceOf(ReviewQueueRejectedError);
        expect(drafts.read()).toBeNull();
        expect(queue.needsRecordingRecovery()).toBe(false);
        expect(queue.blocksReview(writing)).toBe(false);
        expect(queue.blocksReview(reading)).toBe(false);
    });

    it('keeps the draft for recovery when the reply is merely lost', async () => {
        const drafts = draftStorage();
        const { host } = queueFor('owner');
        const owner = host.client(async request => {
            const reply = await host.send(request);
            if (request.kind === 'record') throw new Error('record reply lost');
            return reply;
        }, drafts);
        const queue = new NewTabGradeQueue({ owner, storage: memoryLegacyStorage(), submit: async () => true, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
        await expect(queue.enqueue(reading, 'okay', ['jpdb-api'])).rejects.toThrow('record reply lost');
        expect(queue.needsRecordingRecovery()).toBe(true);
    });
});

describe('a claim another packaged Study tab is still sending', () => {
    it.each(['jpdb-api', 'anki'] as const)('is not held for %s, so Check again never resends it until the claim outlives any request', async target => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(1_000_000);
        const host = reviewQueueHostFixture();
        const legacy = memoryLegacyStorage();
        let finishA!: (landed: boolean) => void;
        let sendingA!: () => void;
        const aSending = new Promise<void>(resolve => { sendingA = resolve; });
        const submit = vi.fn(async (_item: QueuedNewTabGrade) => true);
        submit.mockImplementationOnce(() => {
            sendingA();
            return new Promise<boolean>(resolve => { finishA = resolve; });
        });
        // The controller's check: non-Anki providers have no review log to read, and here Anki's log has no answer yet.
        const tab = () => new NewTabGradeQueue({ owner: host.client(), storage: legacy, submit, onSubmitted: vi.fn(),
            offlineEnabled: () => true, providerContextForTarget: () => 'account-a', confirmDelivered: async () => false });
        const a = tab();
        const b = tab();
        await a.enqueue(reading, 'okay', [target]);
        const flushingA = a.flush();
        await aSending;

        expect(await b.flush()).toBe(1);
        expect(await b.heldReviews()).toEqual([]);
        expect(await b.recheckHeld()).toBe(1);
        expect(submit).toHaveBeenCalledOnce();
        expect(b.blocksReview(reading)).toBe(true);
        expect(b.blocksReview(writing)).toBe(false);

        // Tab A never answers (it was closed mid-request): past the bound its claim is held, and Check again resends it once.
        vi.setSystemTime(1_000_000 + HELD_REVIEW_SETTLE_MS);
        expect(await b.heldReviews()).toHaveLength(1);
        expect(await b.recheckHeld()).toBe(0);
        expect(submit).toHaveBeenCalledTimes(2);
        expect(await b.recheckHeld()).toBe(0);
        expect(await b.heldReviews()).toEqual([]);
        finishA(true);
        await flushingA;
        expect(submit).toHaveBeenCalledTimes(2);
        expect(await host.client().list()).toEqual([]);
    });
});
