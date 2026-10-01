import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_WORK_LEASE_MS } from '../../src/reader/app/gm-storage-lease';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import type { JPDBCard } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// A learner's save in one tab while another tab died in the middle of the same
// kind of save (closed, crashed, or killed by the OS). Each tab is its own realm
// over one userscript store; the dead tab's timers and in-flight write stop with
// it. Its lease must hold the save up for seconds, not a minute, and the
// waiting tab must say why it is waiting.
const DECK_INDEX_KEY = 'yomu:srs-local:v2:index';
const SETTINGS_INTENT_KEY = 'yomu:settings-intent:v2';
const LIVE_REVIEW_KEY = 'yomu:newtab-live-review:v1';
const NOW = Date.parse('2026-09-30T10:00:00.000Z');

function openProfile(dyingWriteKey: string) {
    localStorage.clear();
    resetManagedStateEpochSessionsForTests();
    const values = new Map<string, unknown>();
    const profile = { values, dying: false };
    installGmStorageFixture(values, {
        // The dying tab's write of this key is in flight when the tab goes away: it never lands.
        beforeSet: key => profile.dying && key.startsWith(dyingWriteKey) ? new Promise<void>(() => undefined) : undefined,
    });
    vi.stubGlobal('GM_listValues', () => [...values.keys()]);
    return profile;
}

async function openTab() {
    vi.resetModules();
    const [deck, store, settings, saveWait] = await Promise.all([
        import('../../src/reader/srs/local-yomu'),
        import('../../src/reader/srs/local-yomu-store'),
        import('../../src/reader/settings'),
        import('../../src/reader/app/save-wait'),
    ]);
    const waits: boolean[] = [];
    saveWait.watchSavesWaitingForAnotherTab(waiting => waits.push(waiting));
    return { deck, store, settings, waits };
}

/** Starts a save in a tab that dies at the profile's dying write, and returns once it has died. */
async function dieMidSave(profile: { dying: boolean }, save: () => Promise<unknown>, died: () => boolean): Promise<void> {
    const timers = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as never);
    profile.dying = true;
    void save().catch(() => undefined);
    for (let turn = 0; turn < 50 && !died(); turn++) await vi.advanceTimersByTimeAsync(0);
    expect(died()).toBe(true);
    profile.dying = false;
    timers.mockRestore();
}

/**
 * Stalls a tab right after it reads `key` while holding `lease`, as a tab the
 * OS suspends mid-save: the read returns what storage held then, but only once
 * the tab resumes. Its renewal timer does not run meanwhile.
 */
async function stallAfterRead(profile: { values: Map<string, unknown> }, key: string, lease: string, save: () => Promise<unknown>) {
    const read = (globalThis as { GM_getValue?: unknown }).GM_getValue as (key: string, fallback: unknown) => Promise<unknown>;
    let resume: (() => void) | undefined;
    vi.stubGlobal('GM_getValue', (requested: string, fallback: unknown) => {
        const holding = [...profile.values.keys()].some(stored => stored.startsWith(`yomu:lease:${lease}:`));
        if (resume || requested !== key || !holding) return read(requested, fallback);
        const snapshot = read(requested, fallback);
        return new Promise(answer => { resume = () => answer(snapshot); });
    });
    const timers = vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0 as never);
    const stale = save();
    stale.catch(() => undefined);
    for (let turn = 0; turn < 50 && !resume; turn++) await vi.advanceTimersByTimeAsync(0);
    expect(resume).toBeDefined();
    timers.mockRestore();
    return { stale, resume: () => resume?.() };
}

/** A Study tab of its own realm, grading online reviews of one card under account-a. */
async function studyTab() {
    vi.resetModules();
    const { NewTabGradeQueue } = await import('../../src/reader/newtab/grade-queue');
    return new NewTabGradeQueue({ owner: null, submit: async () => true, onSubmitted: () => undefined,
        offlineEnabled: () => true, providerContextForTarget: () => 'account-a' });
}

const REVIEWED_CARD = { vid: 1, sid: 0, spelling: '読む', reading: 'よむ' } as JPDBCard;

function claim(queue: Awaited<ReturnType<typeof studyTab>>) {
    return queue.claimLiveReview(REVIEWED_CARD, ['jpdb-api'], () => 'account-a');
}

/** The save, counted from when it started waiting, must finish within the short lease. */
async function expectSavedWithinShortLease(save: Promise<unknown>, startedAt: number): Promise<void> {
    let savedAt = Number.NaN;
    void save.then(() => { savedAt = Date.now(); }, () => undefined);
    await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS);
    expect(savedAt - startedAt).toBeLessThanOrEqual(STORAGE_WORK_LEASE_MS);
    await save;
}

describe('a save after another tab died mid-save', () => {
    beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('adds the word to the local deck within the short lease and says it is waiting meanwhile', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        const dying = await openTab();
        await dieMidSave(profile,
            () => new dying.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '読む', reading: 'よむ', meaning: 'to read' }),
            () => [...profile.values.keys()].some(key => key.startsWith('yomu:srs-local:v2:card:')));

        const tab = await openTab();
        const startedAt = Date.now();
        const save = new tab.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '本', reading: 'ほん', meaning: 'book' });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(tab.waits).toEqual([true]);
        await expectSavedWithinShortLease(save, startedAt);
        expect(tab.waits).toEqual([true, false]);
        const deck = await new tab.store.LocalYomuSrsStore().read();
        expect(Object.values(deck.cards).map(card => card.expression)).toEqual(['本']);
    });

    it('saves settings within the short lease and says it is waiting meanwhile', async () => {
        const profile = openProfile(SETTINGS_INTENT_KEY);
        const dying = await openTab();
        await dying.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] });
        await dieMidSave(profile,
            () => dying.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] }),
            () => JSON.stringify(profile.values.get(SETTINGS_STORAGE_KEY)).includes('Transaction'));

        const tab = await openTab();
        const startedAt = Date.now();
        const save = tab.settings.saveSettings({ ...DEFAULT_SETTINGS, accentColor: '#3366ff' }, { explicitUserChoiceKeys: ['accentColor'] });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(tab.waits).toEqual([true]);
        await expectSavedWithinShortLease(save, startedAt);
        expect(tab.waits).toEqual([true, false]);
        expect(await tab.settings.loadSettings()).toMatchObject({ theme: 'light', accentColor: '#3366ff' });
    });
});

// The other half of a short lease: a tab that stalled mid-save (not dead, only
// suspended) has lost its lease by the time it resumes. Whatever it read before
// it stalled is stale, so none of its writes may land over the save another
// tab made meanwhile.
describe('a tab that resumes after another tab saved in its place', () => {
    beforeEach(() => { vi.useFakeTimers({ now: NOW }); });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('cannot write its stale deck over the word another tab added', async () => {
        const profile = openProfile(DECK_INDEX_KEY);
        const stalled = await openTab();
        const tab = await openTab();
        const { stale, resume } = await stallAfterRead(profile, DECK_INDEX_KEY, 'local-yomu-srs-deck',
            () => new stalled.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '読む', reading: 'よむ', meaning: 'to read' }));

        const save = new tab.deck.LocalYomuSrsRepository(() => NOW).mine({ expression: '本', reading: 'ほん', meaning: 'book' });
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        await save;
        resume();
        await vi.advanceTimersByTimeAsync(100);
        await expect(stale).rejects.toThrow();
        const deck = await new tab.store.LocalYomuSrsStore().read();
        expect(Object.values(deck.cards).map(card => card.expression)).toEqual(['本']);
    });

    it('cannot write its stale settings over the choice another tab saved', async () => {
        const profile = openProfile(SETTINGS_INTENT_KEY);
        const stalled = await openTab();
        await stalled.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' }, { explicitUserChoiceKeys: ['theme'] });
        const tab = await openTab();
        const { stale, resume } = await stallAfterRead(profile, SETTINGS_INTENT_KEY, 'reader-settings-persistence',
            () => stalled.settings.saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, { explicitUserChoiceKeys: ['theme'] }));

        const save = tab.settings.saveSettings({ ...DEFAULT_SETTINGS, accentColor: '#3366ff' }, { explicitUserChoiceKeys: ['accentColor'] });
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        await save;
        resume();
        await vi.advanceTimersByTimeAsync(100);
        await expect(stale).rejects.toThrow();
        expect(await tab.settings.loadSettings()).toMatchObject({ theme: 'light', accentColor: '#3366ff' });
    });

    it('retires its copy of an online review another Study tab claimed meanwhile, instead of sending it again', async () => {
        const profile = openProfile(LIVE_REVIEW_KEY);
        const stalled = await studyTab();
        const other = await studyTab();
        const { stale, resume } = await stallAfterRead(profile, LIVE_REVIEW_KEY, 'newtab-live-review', () => claim(stalled));

        // The stalled tab's claim on the lease has lapsed: the other tab claims the review.
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        const claimed = claim(other);
        await vi.advanceTimersByTimeAsync(100);
        const otherClaim = await claimed;
        expect(otherClaim).not.toBeNull();

        resume();
        await vi.advanceTimersByTimeAsync(500);
        expect(await stale).toBeNull();
        expect(Object.values(profile.values.get(LIVE_REVIEW_KEY) as Record<string, { id: string }>).map(record => record.id))
            .toEqual([otherClaim!.id]);
    });

    it('keeps the refusal it read for a review another Study tab already sent', async () => {
        const profile = openProfile(LIVE_REVIEW_KEY);
        const sender = await studyTab();
        const sent = claim(sender);
        await vi.advanceTimersByTimeAsync(100);
        await sender.finishLiveReview((await sent)!);
        const stalled = await studyTab();

        // A sent review refuses each other tab once. The refusal this tab read is
        // its answer even though the lease lapsed before it could record it.
        const { stale, resume } = await stallAfterRead(profile, LIVE_REVIEW_KEY, 'newtab-live-review', () => claim(stalled));
        await vi.advanceTimersByTimeAsync(STORAGE_WORK_LEASE_MS + 500);
        resume();
        await vi.advanceTimersByTimeAsync(500);
        expect(await stale).toBeNull();
    });
});
