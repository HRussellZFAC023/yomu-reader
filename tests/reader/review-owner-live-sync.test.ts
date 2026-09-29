import { expect, it, vi } from 'vitest';
import { newTabPromptController, newTabTestCard, renderSeededNewTabWord } from './new-tab-review/fixtures';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { NewTabGradeQueue } from '../../src/reader/newtab/grade-queue';
import { ExtensionReviewQueueClient } from '../../src/reader/newtab/extension-review-queue-client';
import { parseManagedStateEpoch } from '../../src/reader/app/managed-state-epoch';
import { REVIEW_QUEUE_OWNER_KEY } from '../../src/reader/newtab/review-queue-owner';

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
    const queue = { flush: vi.fn(() => suspended), hasUncertainReviews: vi.fn(async () => false), usesSharedOwner: () => true,
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
    expect(queue.hasUncertainReviews).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
    expect(root.textContent).toBe('Replacement view');
    root.remove();
});
