import { expect, it, vi } from 'vitest';
import { draftStorage, packagedStudySender, reviewQueueHostFixture, reviewQueueHostPrefix } from './helpers/review-queue-host-fixture';
import { REVIEW_QUEUE_OWNER_KEY as NEW_TAB_GRADE_QUEUE_KEY } from '../../src/reader/newtab/review-queue-owner';
import { nextManagedStateEpoch, parseManagedStateEpoch } from '../../src/reader/app/managed-state-epoch';
import { ExtensionReviewQueueClient } from '../../src/reader/newtab/extension-review-queue-client';
import type { QueuedNewTabGrade } from '../../src/reader/newtab/grade-queue';
import { createPackagedReviewQueueClient, REVIEW_ACTION_DRAFT_KEY, type PackagedReviewEnvironment } from '../../src/reader/newtab/packaged-review-queue-client';
import { NewTabGradeQueue, type NewTabGradeQueueStorage, type NewTabGradeQueueDeps } from '../../src/reader/newtab/grade-queue';
import { newTabProviderContexts, newTabReviewProviderContext } from '../../src/reader/newtab/provider-context-policy';
import { newTabPromptController, newTabTestCard, renderSeededNewTabWord, DEFAULT_SETTINGS } from './new-tab-review/fixtures';
import { allowSyntheticReaderInteractionsForTests, dispatchAuthorizedReaderControlClick } from '../../src/reader/ui/trusted-interaction';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { ensureManagedWebStorageCurrent } from '../../src/reader/app/storage';

const prefix = reviewQueueHostPrefix;
const sender = packagedStudySender;
const review = { id: 'review-1', at: 1, target: 'anki', grade: 'okay', attempts: 0, providerContext: 'account-a',
    card: { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } };
const fixture = reviewQueueHostFixture;

const unusedLegacyStorage: NewTabGradeQueueStorage = {
    get: async <T>(_key: string, fallback: T) => fallback,
    set: async () => { throw new Error('Shared-owner mode must not write legacy storage.'); },
    delete: async () => { throw new Error('Shared-owner mode must not delete legacy storage.'); },
};

function ownedQueue(owner: ExtensionReviewQueueClient, submit: NewTabGradeQueueDeps['submit'] = vi.fn(async () => true), storage = unusedLegacyStorage,
    providerContextForTarget: NewTabGradeQueueDeps['providerContextForTarget'] = () => 'account-a') {
    return new NewTabGradeQueue({ owner, storage, submit, onSubmitted: vi.fn(), offlineEnabled: () => true, providerContextForTarget });
}

it('replaces Grade with trusted recording recovery and retires the old prompt', async () => {
    const { client, send } = fixture();
    const drafts = draftStorage();
    let loseReply = true;
    const owner = client(async request => {
        const response = await send(request);
        if (request.kind === 'record' && loseReply) { loseReply = false; throw new Error('record reply lost'); }
        return response;
    }, drafts);
    const submit = vi.fn(async () => true);
    const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true };
    const queue = ownedQueue(owner, submit, unusedLegacyStorage, target => newTabReviewProviderContext(newTabProviderContexts(settings), target));
    await queue.flush();
    const card = newTabTestCard({ source: 'anki', reviewSource: 'anki', ankiCardId: 404, cardState: ['due'] });
    const controller = newTabPromptController(settings);
    Object.assign(controller, { gradeQueue: queue });
    const probe = controller as unknown as {
        gradeCurrentCard(grade: 'okay', selected?: undefined, expected?: typeof card): Promise<boolean>;
        allWords: typeof card[];
        visibleWords: typeof card[];
        index: number;
        renderWord(root: HTMLElement, value: typeof card): void;
        loadWordsInto(root: HTMLElement, preferStoredWord: boolean, options: { useOfflineCache: boolean }): Promise<void>;
    };
    const replacement = newTabTestCard({ source: 'anki', reviewSource: 'anki', ankiCardId: 405, cardState: ['due'] });
    const reload = vi.spyOn(probe, 'loadWordsInto').mockImplementation(async loadedRoot => {
        Object.assign(probe, { allWords: [replacement], visibleWords: [replacement], index: 0 });
        probe.renderWord(loadedRoot, replacement);
    });
    const root = renderSeededNewTabWord(controller, card, {
        allWords: [card], visibleWords: [card], sourceLabel: 'Anki (offline)', reviewCountMode: true,
        state: { source: 'anki', revealAnswer: true }, appendToDocument: true, bindRootEvents: true,
    });
    try {
        const oldGrade = root.querySelector<HTMLButtonElement>('[data-newtab-action="grade"]')!;
        expect(oldGrade).not.toBeNull();
        expect(await probe.gradeCurrentCard('okay')).toBe(false);
        expect(queue.needsRecordingRecovery()).toBe(true);
        expect(root.querySelector('[data-newtab-action="grade"]')).toBeNull();
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="recover-review-recording"]')!;
        expect(button).not.toBeNull();
        allowSyntheticReaderInteractionsForTests(false);
        button.click();
        await Promise.resolve();
        expect(submit).not.toHaveBeenCalled();
        expect(drafts.read()).not.toBeNull();
        dispatchAuthorizedReaderControlClick(button);
        await vi.waitFor(() => expect(reload).toHaveBeenCalledWith(root, false, { useOfflineCache: false }));
        expect(submit).toHaveBeenCalledOnce();
        expect(probe.allWords).not.toContain(card);
        expect(drafts.read()).toBeNull();
        expect(probe.visibleWords).toEqual([replacement]);
        dispatchAuthorizedReaderControlClick(oldGrade);
        expect(await probe.gradeCurrentCard('okay', undefined, card)).toBe(false);
        expect(submit).toHaveBeenCalledOnce();
    } finally {
        allowSyntheticReaderInteractionsForTests(true);
        controller.destroy();
        root.remove();
    }
});

it('shows a clear error and keeps Grade usable when the owner definitively refuses an answer', async () => {
    const { client, send } = fixture();
    const drafts = draftStorage();
    const owner = client(async request => request.kind === 'record' ? { ok: false, error: 'Review queue is full.' } : send(request), drafts);
    const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true };
    const queue = ownedQueue(owner, vi.fn(async () => true), unusedLegacyStorage, target => newTabReviewProviderContext(newTabProviderContexts(settings), target));
    await queue.flush();
    const card = newTabTestCard({ source: 'anki', reviewSource: 'anki', ankiCardId: 404, cardState: ['due'] });
    const other = newTabTestCard({ source: 'anki', reviewSource: 'anki', ankiCardId: 405, spelling: '別', reading: 'べつ', cardState: ['due'] });
    const controller = newTabPromptController(settings);
    Object.assign(controller, { gradeQueue: queue });
    const probe = controller as unknown as { gradeCurrentCard(grade: 'okay'): Promise<boolean> };
    const root = renderSeededNewTabWord(controller, card, {
        allWords: [card, other], visibleWords: [card, other], sourceLabel: 'Anki (offline)', reviewCountMode: true,
        state: { source: 'anki', revealAnswer: true }, appendToDocument: true, bindRootEvents: true,
    });
    try {
        expect(await probe.gradeCurrentCard('okay')).toBe(false);
        expect(root.querySelector('[data-newtab-status]')?.textContent).toBe('Too many answers are waiting to sync. Reconnect, then grade again.');
        expect(drafts.read()).toBeNull();
        expect(queue.needsRecordingRecovery()).toBe(false);
        expect(queue.blocksReview(other)).toBe(false);
        expect(root.querySelector('[data-newtab-action="recover-review-recording"]')).toBeNull();
        expect(root.querySelector('[data-newtab-action="grade"]')).not.toBeNull();
    } finally {
        controller.destroy();
        root.remove();
    }
});

it('dispatches once when two actual queue clients flush through the shared host', async () => {
    const { client } = fixture();
    const submit = vi.fn(async () => true);
    const first = ownedQueue(client(), submit);
    const second = ownedQueue(client(), submit);
    await first.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
    await Promise.all([first.flush(), second.flush()]);
    expect(submit).toHaveBeenCalledOnce();
    expect(await client().list()).toEqual([]);
});

it('notifies another queue of completion only after reading its durable receipt', async () => {
    const { client } = fixture();
    const owner = client();
    const notify = vi.fn();
    const submit = vi.fn(async () => true);
    const queue = new NewTabGradeQueue({ owner, storage: unusedLegacyStorage, submit, onSubmitted: notify,
        offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
    await queue.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
    const [recorded] = await owner.list();
    const other = client();
    await other.claim(recorded.id, 'account-a');
    await other.acknowledge(recorded.id, 'account-a');
    await queue.flush();
    expect(notify).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    expect(queue.blocksReview(review.card as QueuedNewTabGrade['card'])).toBe(false);
    await queue.flush();
    expect(notify).toHaveBeenCalledOnce();
});

it('discovers unseen completions without adopting them into a different provider connection', async () => {
    const { client, send } = fixture();
    const writer = client();
    await writer.record([review as QueuedNewTabGrade]);
    await writer.claim(review.id, 'account-a');
    await writer.acknowledge(review.id, 'account-a');
    let account = 'account-a';
    let switchDuringRead = true;
    const reader = client(async request => {
        const response = await send(request);
        if (request.kind === 'snapshot' && switchDuringRead) { account = 'account-b'; switchDuringRead = false; }
        return response;
    });
    const completed = vi.fn();
    const submit = vi.fn(async () => true);
    const queue = new NewTabGradeQueue({ owner: reader, storage: unusedLegacyStorage, submit, onSubmitted: vi.fn(),
        onProviderCompleted: completed, offlineEnabled: () => true, providerContextForTarget: () => account });
    await queue.flush();
    expect(completed).not.toHaveBeenCalled();
    account = 'account-a';
    await queue.flush();
    expect(completed).toHaveBeenCalledOnce();
    expect(completed).toHaveBeenCalledWith('anki');
    expect(submit).not.toHaveBeenCalled();
});

it('does not treat an unexplained missing record as a completed native review', async () => {
    const { client, data } = fixture();
    const notify = vi.fn();
    const queue = new NewTabGradeQueue({ owner: client(), storage: unusedLegacyStorage, submit: async () => true,
        onSubmitted: notify, offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
    await queue.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
    data.delete(`${prefix}${NEW_TAB_GRADE_QUEUE_KEY}`);
    await expect(queue.flush()).rejects.toThrow('could not be verified');
    expect(notify).not.toHaveBeenCalled();
    expect(queue.blocksReview(review.card as QueuedNewTabGrade['card'])).toBe(true);
});

it.each([false, true])('selects the packaged owner independently of a storage override (%s)', async overrideStorage => {
    const { send, client } = fixture();
    installGmStorageFixture();
    vi.stubGlobal('__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__', true);
    const sendMessage = vi.fn((message: unknown) => send(message as Record<string, unknown>));
    vi.stubGlobal('browser', { runtime: { id: sender.id, getURL: (path: string) => `moz-extension://owned/${path}`, sendMessage } });
    vi.stubGlobal('location', { protocol: 'moz-extension:', href: sender.url, hostname: 'owned', pathname: '/newtab/index.html' });
    const submit = vi.fn(async () => true);
    try {
        await ensureManagedWebStorageCurrent();
        const queue = new NewTabGradeQueue({ submit, onSubmitted: vi.fn(), offlineEnabled: () => true, providerContextForTarget: () => 'account-a',
            ...(overrideStorage ? { storage: unusedLegacyStorage } : {}) });
        expect(queue.usesSharedOwner()).toBe(true);
        await queue.flush();
        await queue.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
        await queue.flush();
        expect(submit).toHaveBeenCalledOnce();
        expect(sendMessage.mock.calls.map(([request]) => (request as { kind: string }).kind)).toContain('claim');
        expect(await client().list()).toEqual([]);
    } finally {
        vi.unstubAllGlobals();
        sessionStorage.removeItem(REVIEW_ACTION_DRAFT_KEY);
    }
});

it('invalidates a confirmed native result before a lost acknowledgement reply', async () => {
    const { send, client } = fixture();
    const onSubmitted = vi.fn();
    const owner = client(async request => {
        if (request.kind === 'acknowledge') expect(onSubmitted).toHaveBeenCalledOnce();
        const response = await send(request);
        if (request.kind === 'acknowledge') throw new Error('acknowledgement reply lost');
        return response;
    });
    const queue = new NewTabGradeQueue({ owner, storage: unusedLegacyStorage, submit: async () => true,
        onSubmitted, offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
    await queue.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
    expect(await queue.flush()).toBe(0);
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(await client().list()).toEqual([]);
});

it('retries only acknowledgement when this client already confirmed native delivery', async () => {
    const { client, send } = fixture();
    let rejectAck = true;
    const owner = client(async request => {
        if (request.kind === 'acknowledge' && rejectAck) { rejectAck = false; throw new Error('offline before ack'); }
        return send(request);
    });
    const submit = vi.fn(async () => true);
    const notify = vi.fn();
    const queue = new NewTabGradeQueue({ owner, storage: unusedLegacyStorage, submit, onSubmitted: notify,
        offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
    await queue.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
    expect(await queue.flush()).toBe(1);
    expect(await queue.flush()).toBe(0);
    expect(submit).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
});

it.each(['local-with-lost-ack', 'remote', 'remote-unseen', 'remote-unseen-mixed'] as const)('refreshes a displayed prompt after %s completion', async scenario => {
    const { client, send } = fixture();
    const owner = client(async request => {
        const response = await send(request);
        if (request.kind === 'acknowledge') throw new Error('ack reply lost');
        return response;
    });
    const settings = { ...DEFAULT_SETTINGS, ankiEnabled: true, newTabAnkiEnabled: true };
    const controller = newTabPromptController(settings);
    const first = newTabTestCard({ source: 'anki', reviewSource: 'anki', ankiCardId: 404, cardState: ['due'] });
    const next = newTabTestCard({ source: 'anki', reviewSource: 'anki', ankiCardId: 405, cardState: ['due'] });
    const probe = controller as unknown as {
        allWords: typeof first[]; visibleWords: typeof first[]; index: number;
        queuedReviewSubmitted(value: typeof first): void;
        reviewProviderCompleted(target: 'anki' | 'jpdb-api' | 'jiten-api' | 'yomu-local' | 'bunpro-api'): void;
        flushQueuedGrades(): Promise<void>;
        loadWordsInto(root: HTMLElement, prefer: boolean, options: unknown): Promise<void>;
        renderWord(root: HTMLElement, value: typeof first): void;
    };
    const submit = vi.fn(async () => true);
    const queue = new NewTabGradeQueue({ owner, storage: unusedLegacyStorage, submit,
        onSubmitted: value => probe.queuedReviewSubmitted(value), onProviderCompleted: target => probe.reviewProviderCompleted(target), offlineEnabled: () => true,
        providerContextForTarget: target => newTabReviewProviderContext(newTabProviderContexts(settings), target) });
    Object.assign(controller, { gradeQueue: queue });
    if (scenario.startsWith('remote-unseen')) await queue.flush();
    else await queue.enqueue(first, 'okay', ['anki']);
    const root = renderSeededNewTabWord(controller, first, { allWords: [first], visibleWords: [first], appendToDocument: true,
        state: { source: scenario === 'remote-unseen-mixed' ? 'jpdb' : 'anki' } });
    const reload = vi.spyOn(probe, 'loadWordsInto').mockImplementation(async loadedRoot => {
        expect(probe.visibleWords).toEqual([]);
        Object.assign(probe, { allWords: [next], visibleWords: [next], index: 0 });
        probe.renderWord(loadedRoot, next);
    });
    try {
        if (scenario !== 'local-with-lost-ack') {
            const other = client();
            if (scenario.startsWith('remote-unseen')) await other.record([{ ...review, id: 'unseen-review', card: first,
                providerContext: newTabProviderContexts(settings).anki } as QueuedNewTabGrade]);
            const [recorded] = await other.list();
            await other.claim(recorded.id, recorded.providerContext!);
            await other.acknowledge(recorded.id, recorded.providerContext!);
        }
        await probe.flushQueuedGrades();
        expect(submit).toHaveBeenCalledTimes(scenario === 'local-with-lost-ack' ? 1 : 0);
        expect(reload).toHaveBeenCalledWith(root, false, { useOfflineCache: false });
        expect(probe.visibleWords).toEqual([next]);
        expect(root.classList.contains('jpdb-reader-newtab-review-mode')).toBe(true);
    } finally { controller.destroy(); root.remove(); }
});

it('offers trusted draft recovery when no due card remains', async () => {
    const { send, client } = fixture();
    const drafts = draftStorage();
    let loseReply = true;
    const owner = client(async request => {
        const response = await send(request);
        if (request.kind === 'record' && loseReply) { loseReply = false; throw new Error('record reply lost'); }
        return response;
    }, drafts);
    await expect(owner.record([review as QueuedNewTabGrade])).rejects.toThrow('record reply lost');
    const other = client();
    await other.claim(review.id, 'account-a');
    await other.acknowledge(review.id, 'account-a');
    const submit = vi.fn(async () => true);
    const queue = ownedQueue(owner, submit);
    const controller = newTabPromptController();
    Object.assign(controller, { gradeQueue: queue });
    const card = newTabTestCard();
    const root = renderSeededNewTabWord(controller, card, { appendToDocument: true, bindRootEvents: true });
    const probe = controller as unknown as {
        allWords: typeof card[]; visibleWords: typeof card[];
        renderEmpty(root: HTMLElement, title: string, message: string): void;
        loadWordsInto(root: HTMLElement, prefer: boolean, options: unknown): Promise<void>;
    };
    Object.assign(probe, { allWords: [], visibleWords: [] });
    root.dataset.standaloneNewtab = 'true';
    const reload = vi.spyOn(probe, 'loadWordsInto').mockResolvedValue(undefined);
    probe.renderEmpty(root, 'Study', 'No due cards');
    try {
        const button = root.querySelector<HTMLButtonElement>('[data-newtab-action="recover-review-recording"]')!;
        expect(button).not.toBeNull();
        allowSyntheticReaderInteractionsForTests(false);
        button.click();
        await Promise.resolve();
        expect(drafts.read()).not.toBeNull();
        dispatchAuthorizedReaderControlClick(button);
        await vi.waitFor(() => expect(reload).toHaveBeenCalled());
        expect(drafts.read()).toBeNull();
        expect(submit).not.toHaveBeenCalled();
    } finally { allowSyntheticReaderInteractionsForTests(true); controller.destroy(); root.remove(); }
});

it('holds an uncertain native result across new queue clients without deleting the review', async () => {
    const { client } = fixture();
    const submit = vi.fn(async () => { throw new Error('native reply lost'); });
    const first = ownedQueue(client(), submit);
    await first.enqueue(review.card as QueuedNewTabGrade['card'], 'okay', ['anki']);
    expect(await first.flush()).toBe(1);
    const second = ownedQueue(client(), submit);
    expect(await second.flush()).toBe(1);
    expect(submit).toHaveBeenCalledOnce();
    expect(second.blocksReview(review.card as QueuedNewTabGrade['card'])).toBe(true);
});

it('coordinates two typed clients and atomically records a multi-provider answer', async () => {
    const { client, set } = fixture();
    const first = client();
    const second = client();
    const batch = [review, { ...review, id: 'review-2', target: 'jpdb-api' }] as QueuedNewTabGrade[];
    await first.record(batch);
    expect(set).toHaveBeenCalledOnce();
    const claimed = await Promise.all([first.claim(review.id, 'account-a'), second.claim(review.id, 'account-a')]);
    expect(claimed.filter(Boolean)).toHaveLength(1);
    await second.acknowledge(review.id, 'account-a');
    await first.record(batch);
    expect((await second.list()).map(item => item.id)).toEqual(['review-2']);
});

it('resumes the original action after reload even if its lost record reply was followed by delivery', async () => {
    const { send, client } = fixture();
    const values = new Map<string, string>();
    const transport = vi.fn(async (message: unknown) => {
        const result = await send(message as Record<string, unknown>);
        if ((message as { kind: string }).kind === 'record' && transport.mock.calls.length === 1) throw new Error('record reply lost');
        return result;
    });
    const environment: PackagedReviewEnvironment = {
        location: { protocol: 'moz-extension:', href: sender.url },
        sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } },
        browser: { runtime: { id: sender.id, getURL: path => `moz-extension://owned/${path}`, sendMessage: transport } },
    };
    const make = () => createPackagedReviewQueueClient(environment, async () => parseManagedStateEpoch(null), environment.sessionStorage)!;
    await expect(make().record([review as QueuedNewTabGrade])).rejects.toThrow('record reply lost');
    expect(values.has(REVIEW_ACTION_DRAFT_KEY)).toBe(true);
    const other = client();
    expect(await other.claim(review.id, 'account-a')).toMatchObject({ id: review.id });
    await other.acknowledge(review.id, 'account-a');
    const reloaded = make();
    await expect(reloaded.record([{ ...review, id: 'replacement' } as QueuedNewTabGrade])).rejects.toThrow('unresolved');
    expect(await reloaded.resumeRecord()).toMatchObject([{ id: review.id }]);
    expect(values.has(REVIEW_ACTION_DRAFT_KEY)).toBe(false);
    expect(await other.list()).toEqual([]);
    expect(await other.claim(review.id, 'account-a')).toBeNull();
});

it('does not send an action whose draft cannot be saved', async () => {
    const { send, client } = fixture();
    const transport = vi.fn(send);
    const drafts = draftStorage();
    drafts.write = () => { throw new Error('session storage unavailable'); };
    await expect(client(transport, drafts).record([review as QueuedNewTabGrade])).rejects.toThrow('session storage unavailable');
    expect(transport).not.toHaveBeenCalled();
});

it('does not let a late recording reply clear a replacement client\'s newer draft', async () => {
    const { send, client } = fixture();
    const drafts = draftStorage();
    drafts.write({ epoch: null, reviews: [review as QueuedNewTabGrade] });
    let release!: () => void;
    let started!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const old = client(async request => {
        const response = await send(request);
        started();
        await delayed;
        return response;
    }, drafts).resumeRecord();
    await dispatched;
    try {
        await client(send, drafts).resumeRecord();
        const newer = { epoch: null, reviews: [{ ...review, id: 'review-new' } as QueuedNewTabGrade] };
        drafts.write(newer);
        release();
        await old;
        expect(drafts.read()).toEqual(newer);
    } finally { release(); await old; }
});

it('retires a draft invalidated by a confirmed newer reset without replaying it', async () => {
    const { send, client, data } = fixture();
    const drafts = draftStorage();
    const lost = async (request: Record<string, unknown>) => { await send(request); throw new Error('reply lost'); };
    await expect(client(lost, drafts).record([review as QueuedNewTabGrade])).rejects.toThrow('reply lost');
    data.set(`${prefix}yomu:state-epoch`, nextManagedStateEpoch(parseManagedStateEpoch(null), 'reset-draft', 1));
    const transport = vi.fn(send);
    await expect(client(transport, drafts).resumeRecord()).rejects.toThrow('cleared by factory reset');
    expect(transport).not.toHaveBeenCalled();
    expect(drafts.read()).toBeNull();
});

it('does not retry a claim whose response is lost after persistence', async () => {
    const { client, send } = fixture();
    await client().record([review as QueuedNewTabGrade]);
    const lost = vi.fn(async (request: Record<string, unknown>) => {
        await send(request);
        throw new Error('response lost');
    });
    await expect(client(lost).claim(review.id, 'account-a')).rejects.toThrow('response lost');
    expect(lost).toHaveBeenCalledOnce();
    expect(await client().claim(review.id, 'account-a')).toBeNull();
    expect(await client().list()).toMatchObject([{ attempts: 1 }]);
});

it('rejects a pre-reset reply and never adopts a new generation in an old client', async () => {
    const { client, send, data } = fixture();
    await client().record([review as QueuedNewTabGrade]);
    const stale = client(async request => {
        const reply = await send(request);
        data.set(`${prefix}yomu:state-epoch`, nextManagedStateEpoch(parseManagedStateEpoch(null), 'reset-late', 1));
        return reply;
    });
    await expect(stale.claim(review.id, 'account-a')).rejects.toThrow('generation changed');
    await expect(stale.list()).rejects.toThrow('generation changed');
    expect(await client().list()).toEqual([]);
});

it('times out a missing reply without silently retrying or using a local store', async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => new Promise<never>(() => {}));
    const client = new ExtensionReviewQueueClient(send, async () => parseManagedStateEpoch(null), draftStorage());
    try {
        const assertion = expect(client.list()).rejects.toThrow('outcome is unknown');
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;
        expect(send).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
});

it.each([
    { ...sender, id: 'another-extension' },
    { ...sender, url: 'https://yomureader.com/study/' },
    { ...sender, url: 'moz-extension://owned/other.html' },
    { ...sender, frameId: 1 },
])('rejects a sender outside the exact packaged Study surface: %j', async from => {
    const { send, get, set } = fixture();
    expect(await send({ kind: 'record', reviews: [review] }, from)).toMatchObject({ ok: false });
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
});

it('serializes two Study claims through one host and uses only prefixed storage', async () => {
    const { send, data } = fixture();
    expect(await send({ kind: 'record', reviews: [review] })).toMatchObject({ ok: true });
    const claims = await Promise.all([send({ kind: 'claim', id: review.id, providerContext: 'account-a' }),
        send({ kind: 'claim', id: review.id, providerContext: 'account-a' })]);
    expect(claims.every(item => item.ok)).toBe(true);
    expect(claims.filter(item => item.value !== null)).toHaveLength(1);
    expect(data.has(NEW_TAB_GRADE_QUEUE_KEY)).toBe(false);
    expect(data.get(`${prefix}${NEW_TAB_GRADE_QUEUE_KEY}`)).toMatchObject({ reviews: [{ attempts: 1 }] });
    await send({ kind: 'record', reviews: [{ ...review, id: 'review-2' }] });
    expect(await send({ kind: 'acknowledge', id: review.id, providerContext: 'account-a' })).toMatchObject({ ok: true });
    expect(await send({ kind: 'list' })).toMatchObject({ ok: true, value: [{ id: 'review-2' }] });
});

it('rejects reset preparation and stale generations without changing reviews', async () => {
    const { send, data, set } = fixture();
    await send({ kind: 'record', reviews: [review] });
    set.mockClear();
    data.set(`${prefix}yomu:factory-reset-signal`, { phase: 'prepare' });
    expect(await send({ kind: 'claim', id: review.id, providerContext: 'account-a' })).toMatchObject({ ok: false });
    data.delete(`${prefix}yomu:factory-reset-signal`);
    data.set(`${prefix}yomu:state-epoch`, nextManagedStateEpoch(parseManagedStateEpoch(null), 'reset-1', 1));
    expect(await send({ kind: 'record', reviews: [{ ...review, id: 'review-2' }] })).toMatchObject({ ok: false });
    expect(set).not.toHaveBeenCalled();
});

it('does not grant a claim if reset commits while its attempt is written', async () => {
    const { send, data, set } = fixture();
    await send({ kind: 'record', reviews: [review] });
    const persist = set.getMockImplementation()!;
    set.mockImplementationOnce(async values => {
        await persist(values);
        data.set(`${prefix}yomu:state-epoch`, nextManagedStateEpoch(parseManagedStateEpoch(null), 'reset-1', 1));
    });
    expect(await send({ kind: 'claim', id: review.id, providerContext: 'account-a' })).toMatchObject({ ok: false });
});

it('rejects malformed operations and preserves an unreadable stored queue', async () => {
    const { send, data, set } = fixture();
    expect(await send({ kind: 'record', reviews: [{ ...review, attempts: -1 }] })).toMatchObject({ ok: false });
    expect(await send({ kind: 'record', reviews: [{ ...review, target: ['anki'] }] })).toMatchObject({ ok: false });
    expect(await send({ kind: 'record', reviews: [{ ...review, grade: ['okay'] }] })).toMatchObject({ ok: false });
    expect(await send({ kind: 'deleteEverything', id: 'x', providerContext: 'account-a' })).toMatchObject({ ok: false });
    expect(await send({ kind: 'list', epoch: undefined })).toMatchObject({ ok: false });
    data.set(`${prefix}${NEW_TAB_GRADE_QUEUE_KEY}`, { corrupt: true });
    expect(await send({ kind: 'record', reviews: [review] })).toMatchObject({ ok: false });
    expect(data.get(`${prefix}${NEW_TAB_GRADE_QUEUE_KEY}`)).toEqual({ corrupt: true });
    expect(set).not.toHaveBeenCalled();
});
