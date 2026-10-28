import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELD_REVIEW_SETTLE_MS, NewTabGradeQueue, type QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import { NEW_TAB_GRADE_QUEUE_KEY } from '../../src/reader/newtab/controller-config';
import type { JPDBCard } from '../../src/reader/app/types';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

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

describe('live review claims', () => {
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
