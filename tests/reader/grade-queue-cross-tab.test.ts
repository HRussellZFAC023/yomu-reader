import { afterEach, expect, it, vi } from 'vitest';
import { NewTabGradeQueue, type QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
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

afterEach(() => { vi.unstubAllGlobals(); });

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
