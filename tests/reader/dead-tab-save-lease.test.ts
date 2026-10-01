import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_WORK_LEASE_MS } from '../../src/reader/app/gm-storage-lease';
import { resetManagedStateEpochSessionsForTests } from '../../src/reader/app/managed-state-epoch';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../src/reader/settings';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';

// A learner's save in one tab while another tab died in the middle of the same
// kind of save (closed, crashed, or killed by the OS). Each tab is its own realm
// over one userscript store; the dead tab's timers and in-flight write stop with
// it. Its lease must hold the save up for seconds, not a minute, and the
// waiting tab must say why it is waiting.
const DECK_INDEX_KEY = 'yomu:srs-local:v2:index';
const SETTINGS_INTENT_KEY = 'yomu:settings-intent:v2';
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
